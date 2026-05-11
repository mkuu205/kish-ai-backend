// src/controllers/support.controller.js
const { v4: uuidv4 } = require("uuid");
const xss    = require("xss");
const R      = require("../utils/response");
const logger = require("../utils/logger");
const aiSvc  = require("../services/ai.service");
const { addEmailJob } = require("../jobs");
const { TICKET_NUMBER_PREFIX, NOTIFICATION_TYPES } = require("../constants");

function generateTicketNumber() {
  return `${TICKET_NUMBER_PREFIX}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

const AI_SUPPORT_SYSTEM = `You are Kish AI's helpful support assistant. You help users with:
- Account issues (login, OTP, verification)
- Billing and subscription questions (Free plan: 10 messages/day; Pro plan: $12/month or KES 1200/month, unlimited messages, all features)
- Platform features (web search, image analysis, 5 AI modes, document reading, custom persona)
- Technical troubleshooting
- Payment issues (Stripe card payments, M-Pesa via PayHero)
Always be friendly, concise, and helpful. If you cannot resolve the issue, suggest creating a support ticket or starting a live chat.`;

// ── POST /api/v1/support/ai-chat ─────────────────────────────────────────────
const aiSupportChat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!messages?.length) return R.badRequest(res, "Messages required.");

    const apiMessages = messages.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const result = await aiSvc.streamChatSSE(res, {
      messages: apiMessages,
      mode: "general",
      systemOverride: AI_SUPPORT_SYSTEM,
      webSearch: false,
      plan: "PRO",
    });
  } catch (err) {
    if (!res.headersSent) next(err);
  }
};

// ── POST /api/v1/support/tickets ─────────────────────────────────────────────
const createTicket = async (req, res, next) => {
  try {
    const { title, message, category = "OTHER", priority = "MEDIUM" } = req.body;
    const user = req.userFull;

    const ticketNumber = generateTicketNumber();

    const ticket = await global.prisma.supportTicket.create({
      data: {
        ticketNumber, userId: user.id,
        title: xss(title.trim()),
        status: "OPEN", priority: priority.toUpperCase(),
        category: category.toUpperCase(),
        messages: {
          create: { senderId: user.id, senderName: user.name, senderRole: "user", content: xss(message.trim()) },
        },
      },
      include: { messages: true },
    });

    await global.prisma.activityLog.create({ data: { userId: user.id, type: "ticket_created", data: { ticketNumber, title } } });
    await addEmailJob({ type: "ticket_received", to: user.email, name: user.name, ticketNumber, title });

    logger.info({ userId: user.id, ticketNumber }, "Support ticket created");
    return R.created(res, ticket, "Support ticket created.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/support/tickets ──────────────────────────────────────────────
const getTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId: req.user.id };
    if (status) where.status = status.toUpperCase();

    const [tickets, total] = await Promise.all([
      global.prisma.supportTicket.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, agent: { select: { name: true, avatarUrl: true } } },
      }),
      global.prisma.supportTicket.count({ where }),
    ]);

    return R.success(res, { tickets, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── GET /api/v1/support/tickets/:id ─────────────────────────────────────────
const getTicket = async (req, res, next) => {
  try {
    const ticket = await global.prisma.supportTicket.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" }, where: { isInternal: false } },
        agent: { select: { name: true, avatarUrl: true } },
      },
    });
    if (!ticket) return R.notFound(res, "Ticket not found.");
    return R.success(res, ticket);
  } catch (err) { next(err); }
};

// ── POST /api/v1/support/tickets/:id/messages ────────────────────────────────
const replyToTicket = async (req, res, next) => {
  try {
    const { content } = req.body;
    const user = req.userFull;

    const ticket = await global.prisma.supportTicket.findFirst({
      where: { id: req.params.id, userId: user.id },
      include: { agent: { select: { name: true, email: true } } },
    });
    if (!ticket) return R.notFound(res, "Ticket not found.");
    if (ticket.status === "CLOSED") return R.badRequest(res, "Cannot reply to a closed ticket.");

    const [message] = await Promise.all([
      global.prisma.ticketMessage.create({
        data: { ticketId: ticket.id, senderId: user.id, senderName: user.name, senderRole: "user", content: xss(content.trim()) },
      }),
      global.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "OPEN", updatedAt: new Date() },
      }),
    ]);

    return R.created(res, message, "Reply sent.");
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/support/tickets/:id/close ──────────────────────────────────
const closeTicket = async (req, res, next) => {
  try {
    const ticket = await global.prisma.supportTicket.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    if (ticket.count === 0) return R.notFound(res, "Ticket not found.");
    return R.success(res, {}, "Ticket closed.");
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/support/tickets/:id/reopen ─────────────────────────────────
const reopenTicket = async (req, res, next) => {
  try {
    const ticket = await global.prisma.supportTicket.updateMany({
      where: { id: req.params.id, userId: req.user.id, status: { in: ["CLOSED", "RESOLVED"] } },
      data: { status: "OPEN", closedAt: null, resolvedAt: null },
    });
    if (ticket.count === 0) return R.notFound(res, "Ticket not found or not closeable.");
    return R.success(res, {}, "Ticket reopened.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/support/tickets (admin) ─────────────────────────────────────
const adminGetTickets = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 20, search, assignedTo } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status)     where.status   = status.toUpperCase();
    if (priority)   where.priority = priority.toUpperCase();
    if (assignedTo === "unassigned") where.agentId = null;
    else if (assignedTo) where.agentId = assignedTo;
    if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { ticketNumber: { contains: search, mode: "insensitive" } }];

    const [tickets, total] = await Promise.all([
      global.prisma.supportTicket.findMany({
        where, skip, take: parseInt(limit),
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        include: { user: { select: { name: true, email: true } }, agent: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      global.prisma.supportTicket.count({ where }),
    ]);

    return R.success(res, { tickets, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── POST /api/v1/support/tickets/:id/admin-reply ─────────────────────────────
const adminReplyToTicket = async (req, res, next) => {
  try {
    const { content, isInternal = false } = req.body;
    const ticket = await global.prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!ticket) return R.notFound(res, "Ticket not found.");

    const update = { updatedAt: new Date() };
    if (!ticket.firstReplyAt) update.firstReplyAt = new Date();
    if (!isInternal) update.status = "IN_PROGRESS";

    const [message] = await Promise.all([
      global.prisma.ticketMessage.create({
        data: { ticketId: ticket.id, senderId: req.user.id, senderName: "Kish AI Support", senderRole: "agent", content: xss(content.trim()), isInternal },
      }),
      global.prisma.supportTicket.update({ where: { id: ticket.id }, data: update }),
    ]);

    if (!isInternal) {
      await Promise.all([
        global.prisma.notification.create({ data: { userId: ticket.userId, ticketId: ticket.id, type: "ticket_reply", title: "New reply on your ticket", message: `Your ticket ${ticket.ticketNumber} has a new reply.` } }),
        addEmailJob({ type: "ticket_reply", to: ticket.user.email, name: ticket.user.name, ticketNumber: ticket.ticketNumber, agentName: "Kish AI Support" }),
      ]);
    }

    return R.created(res, message, "Reply sent.");
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/support/tickets/:id/assign ─────────────────────────────────
const assignTicket = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    await global.prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { agentId, status: "IN_PROGRESS" },
    });
    return R.success(res, {}, "Ticket assigned.");
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/support/tickets/:id/resolve ────────────────────────────────
const resolveTicket = async (req, res, next) => {
  try {
    const ticket = await global.prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
      include: { user: { select: { email: true, name: true } } },
    });
    await Promise.all([
      global.prisma.notification.create({ data: { userId: ticket.userId, ticketId: ticket.id, type: "ticket_resolved", title: "Ticket resolved", message: `Your ticket ${ticket.ticketNumber} has been resolved.` } }),
    ]);
    return R.success(res, {}, "Ticket resolved.");
  } catch (err) { next(err); }
};

// ── LIVE CHAT ─────────────────────────────────────────────────────────────────
const startLiveChat = async (req, res, next) => {
  try {
    const { topic } = req.body;
    const existing = await global.prisma.liveChat​Session.findFirst({
      where: { userId: req.user.id, status: { in: ["waiting", "active"] } },
    });
    if (existing) return R.success(res, existing, "Existing session found.");

    const session = await global.prisma.liveChatSession.create({
      data: { userId: req.user.id, status: "waiting", topic: topic || null },
    });

    // Notify admins via Socket.IO
    const io = req.app.get("io");
    if (io) io.to("admin_room").emit("new_chat_request", { sessionId: session.id, userId: req.user.id, userName: req.userFull.name, topic });

    return R.created(res, session, "Live chat session started.");
  } catch (err) { next(err); }
};

const getLiveChatSession = async (req, res, next) => {
  try {
    const session = await global.prisma.liveChatSession.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } }, agent: { select: { name: true, avatarUrl: true } } },
    });
    if (!session) return R.notFound(res, "Session not found.");
    return R.success(res, session);
  } catch (err) { next(err); }
};

const endLiveChat = async (req, res, next) => {
  try {
    const { rating, feedback } = req.body;
    await global.prisma.liveChatSession.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status: "closed", endedAt: new Date(), rating: rating ? parseInt(rating) : null, feedback: feedback || null },
    });
    return R.success(res, {}, "Chat session ended.");
  } catch (err) { next(err); }
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
const getNotifications = async (req, res, next) => {
  try {
    const { unreadOnly = false, page = 1, limit = 20 } = req.query;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId: req.user.id };
    if (unreadOnly === "true") where.readAt = null;

    const [notifications, total, unreadCount] = await Promise.all([
      global.prisma.notification.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: "desc" } }),
      global.prisma.notification.count({ where }),
      global.prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);

    return R.success(res, { notifications, total, pages: Math.ceil(total / parseInt(limit)), unreadCount });
  } catch (err) { next(err); }
};

const markNotificationsRead = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const where = { userId: req.user.id, readAt: null };
    if (ids?.length) where.id = { in: ids };

    await global.prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    return R.success(res, {}, "Notifications marked as read.");
  } catch (err) { next(err); }
};

module.exports = {
  aiSupportChat, createTicket, getTickets, getTicket, replyToTicket, closeTicket, reopenTicket,
  adminGetTickets, adminReplyToTicket, assignTicket, resolveTicket,
  startLiveChat, getLiveChatSession, endLiveChat,
  getNotifications, markNotificationsRead,
};
