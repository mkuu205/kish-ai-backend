// src/controllers/admin.controller.js
const R      = require("../utils/response");
const logger = require("../utils/logger");
const config = require("../config");
const aiSvc  = require("../services/ai.service");
const { addEmailJob } = require("../jobs");

// ── GET /api/v1/admin/stats ──────────────────────────────────────────────────
const getStats = async (req, res, next) => {
  try {
    const [users, payments, tickets, conversations] = await Promise.all([
      global.prisma.user.groupBy({ by: ["plan"], _count: true }),
      global.prisma.payment.groupBy({ by: ["method", "status"], _count: true, _sum: { amount: true } }),
      global.prisma.supportTicket.groupBy({ by: ["status"], _count: true }),
      global.prisma.conversation.count(),
    ]);

    const userMap  = Object.fromEntries(users.map(u  => [u.plan,   u._count]));
    const totalUsers = Object.values(userMap).reduce((a, b) => a + b, 0);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = await global.prisma.user.count({ where: { createdAt: { gte: weekAgo } } });

    const totalMessages = await global.prisma.message.count();

    const completedStripe = payments.find(p => p.method === "STRIPE" && p.status === "COMPLETED");
    const completedMpesa  = payments.find(p => p.method === "MPESA"  && p.status === "COMPLETED");
    const pendingPays     = payments.filter(p => p.status === "PENDING").reduce((a, p) => a + p._count, 0);
    const failedPays      = payments.filter(p => p.status === "FAILED").reduce((a, p)  => a + p._count, 0);

    const mrr = (userMap.PRO || 0) * 12;
    const totalRevUSD = ((completedStripe?._count || 0) * 12).toFixed(2);
    const totalRevKES = parseFloat(completedMpesa?._sum?.amount || 0).toLocaleString();

    const ticketMap = Object.fromEntries(tickets.map(t => [t.status, t._count]));

    return R.success(res, {
      users: { total: totalUsers, pro: userMap.PRO || 0, free: userMap.FREE || 0, newThisWeek },
      messages: { total: totalMessages },
      conversations: { total: conversations },
      revenue: { mrr, totalRevUSD, totalRevKES },
      payments: {
        stripe: completedStripe?._count || 0,
        mpesa:  completedMpesa?._count  || 0,
        pending: pendingPays,
        failed:  failedPays,
      },
      tickets: {
        open:       ticketMap.OPEN       || 0,
        inProgress: ticketMap.IN_PROGRESS || 0,
        resolved:   ticketMap.RESOLVED   || 0,
        total:      tickets.reduce((a, t) => a + t._count, 0),
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/users ──────────────────────────────────────────────────
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, plan, role } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) where.OR = [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }];
    if (plan)   where.plan = plan.toUpperCase();
    if (role)   where.role = role.toUpperCase();

    const [users, total] = await Promise.all([
      global.prisma.user.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, plan: true, role: true, verified: true, totalMessages: true, dailyMessages: true, stripeCustomerId: true, lastActiveAt: true, createdAt: true, updatedAt: true, subscription: { select: { status: true, method: true, currentPeriodEnd: true } } },
      }),
      global.prisma.user.count({ where }),
    ]);

    return R.success(res, { users, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/users/:id ──────────────────────────────────────────────
const getUserById = async (req, res, next) => {
  try {
    const user = await global.prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: true,
        payments: { orderBy: { createdAt: "desc" }, take: 10 },
        activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
        supportTickets: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, ticketNumber: true, title: true, status: true, createdAt: true } },
        _count: { select: { conversations: true, messages: true } },
      },
    });
    if (!user) return R.notFound(res, "User not found.");
    const { password, ...safe } = user;
    return R.success(res, safe);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/admin/users/:id/plan ──────────────────────────────────────
const updateUserPlan = async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!["FREE", "PRO"].includes(plan?.toUpperCase())) return R.badRequest(res, "Plan must be FREE or PRO.");

    const p = plan.toUpperCase();
    await global.prisma.$transaction([
      global.prisma.user.update({ where: { id: req.params.id }, data: { plan: p } }),
      global.prisma.activityLog.create({ data: { userId: req.params.id, type: p === "PRO" ? "upgrade" : "downgrade", data: { by: "admin", adminId: req.user.id } } }),
    ]);

    await global.redis.del(`user:${req.params.id}`).catch(() => {});
    logger.info({ userId: req.params.id, plan: p, adminId: req.user.id }, "Admin updated user plan");
    return R.success(res, {}, `User plan updated to ${p}.`);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/admin/users/:id/verify ─────────────────────────────────────
const verifyUser = async (req, res, next) => {
  try {
    await global.prisma.user.update({ where: { id: req.params.id }, data: { verified: true } });
    await global.redis.del(`user:${req.params.id}`).catch(() => {});
    return R.success(res, {}, "User verified.");
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/admin/users/:id ──────────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    await global.prisma.user.delete({ where: { id: req.params.id } });
    await global.redis.del(`user:${req.params.id}`).catch(() => {});
    logger.info({ userId: req.params.id, adminId: req.user.id }, "Admin deleted user");
    return R.success(res, {}, "User deleted.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/payments ──────────────────────────────────────────────
const getPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, method, status } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (method) where.method = method.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const [payments, total] = await Promise.all([
      global.prisma.payment.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      global.prisma.payment.count({ where }),
    ]);

    return R.success(res, { payments, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/activity ───────────────────────────────────────────────
const getActivity = async (req, res, next) => {
  try {
    const { limit = 100, type } = req.query;
    const where = type ? { type } : {};
    const logs  = await global.prisma.activityLog.findMany({
      where, take: parseInt(limit), orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    return R.success(res, { activity: logs });
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/system ─────────────────────────────────────────────────
const systemHealth = async (req, res, next) => {
  try {
    const [dbCheck, redisCheck, aiCheck] = await Promise.allSettled([
      global.prisma.$queryRaw`SELECT 1`.then(() => "ok"),
      global.redis.ping().then(r => r === "PONG" ? "ok" : "error"),
      aiSvc.healthCheck().then(r => r.status),
    ]);

    return R.success(res, {
      database  : { status: dbCheck.status === "fulfilled"   ? dbCheck.value   : "error" },
      redis     : { status: redisCheck.status === "fulfilled" ? redisCheck.value : "error" },
      anthropic : { status: aiCheck.status === "fulfilled"   ? aiCheck.value   : "error" },
      stripe    : { status: config.stripe.secretKey ? "configured" : "missing" },
      payhero   : { status: config.payhero.username  ? "configured" : "missing" },
      email     : { status: config.email.user        ? "configured" : "missing" },
      server    : { uptime: process.uptime(), memory: process.memoryUsage(), nodeVersion: process.version, env: config.env },
    });
  } catch (err) { next(err); }
};

// ── GET /api/v1/admin/export/users ───────────────────────────────────────────
const exportUsers = async (req, res, next) => {
  try {
    const users = await global.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, plan: true, role: true, verified: true, totalMessages: true, createdAt: true, lastActiveAt: true },
    });

    const headers = ["ID", "Name", "Email", "Plan", "Role", "Verified", "Total Messages", "Created", "Last Active"];
    const rows    = users.map(u => [u.id, u.name, u.email, u.plan, u.role, u.verified, u.totalMessages, u.createdAt?.toISOString(), u.lastActiveAt?.toISOString() || ""].join(","));
    const csv     = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="kish-users-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
};

// ── POST /api/v1/admin/broadcast ────────────────────────────────────────────
const broadcast = async (req, res, next) => {
  try {
    const { subject, message, planFilter } = req.body;
    if (!subject || !message) return R.badRequest(res, "Subject and message required.");

    const where = { verified: true };
    if (planFilter && planFilter !== "all") where.plan = planFilter.toUpperCase();

    const users = await global.prisma.user.findMany({ where, select: { email: true, name: true } });

    let sent = 0;
    for (const u of users) {
      await addEmailJob({ type: "broadcast", to: u.email, name: u.name, subject, message });
      sent++;
    }

    await global.prisma.activityLog.create({
      data: { userId: req.user.id, type: "broadcast", data: { subject, recipients: sent, planFilter: planFilter || "all" } },
    });

    logger.info({ adminId: req.user.id, sent, subject }, "Admin broadcast sent");
    return R.success(res, { sent, total: users.length }, `Broadcast queued for ${sent} users.`);
  } catch (err) { next(err); }
};

// ── POST /api/v1/admin/login ─────────────────────────────────────────────────
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (email !== config.admin.email || password !== config.admin.password) {
      return R.unauthorized(res, "Invalid admin credentials.");
    }
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ id: "admin", email, role: "ADMIN" }, config.jwt.accessSecret, { expiresIn: "8h" });
    return R.success(res, { token, role: "ADMIN" });
  } catch (err) { next(err); }
};

module.exports = { getStats, getUsers, getUserById, updateUserPlan, verifyUser, deleteUser, getPayments, getActivity, systemHealth, exportUsers, broadcast, adminLogin };
