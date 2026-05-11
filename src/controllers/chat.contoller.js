// src/controllers/chat.controller.js
const aiSvc  = require("../services/ai.service");
const R      = require("../utils/response");
const logger = require("../utils/logger");
const config = require("../config");
const xss    = require("xss");

// ── Helpers ───────────────────────────────────────────────────────────────────
async function checkDailyLimit(user) {
  const now   = new Date();
  const reset = new Date(user.dailyResetAt);
  let daily   = user.dailyMessages;

  if (now.toDateString() !== reset.toDateString()) {
    await global.prisma.user.update({ where: { id: user.id }, data: { dailyMessages: 0, dailyResetAt: now } });
    daily = 0;
  }

  const plan  = config.plans[user.plan.toLowerCase()] || config.plans.free;
  const limit = plan.messagesPerDay;
  return { allowed: limit === Infinity || daily < limit, used: daily, limit, plan };
}

// ── POST /api/v1/chat/conversations ──────────────────────────────────────────
const createConversation = async (req, res, next) => {
  try {
    const { title = "New Conversation", mode = "general", systemPrompt } = req.body;
    const user  = req.userFull;
    const plan  = config.plans[user.plan.toLowerCase()] || config.plans.free;

    if (!plan.modes.includes(mode)) {
      return R.forbidden(res, `Mode "${mode}" is a Pro feature.`, 403, { upgrade: true });
    }
    if (systemPrompt && !plan.customPersona) {
      return R.forbidden(res, "Custom persona is a Pro feature.", 403, { upgrade: true });
    }

    const convo = await global.prisma.conversation.create({
      data: {
        title: xss(title.trim()),
        userId: user.id,
        mode,
        systemPrompt: systemPrompt ? xss(systemPrompt) : null,
      },
    });

    return R.created(res, convo, "Conversation created.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/chat/conversations ───────────────────────────────────────────
const getConversations = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { userId: req.user.id, archived: false };
    if (search) where.title = { contains: search, mode: "insensitive" };

    const [conversations, total] = await Promise.all([
      global.prisma.conversation.findMany({
        where, skip, take: parseInt(limit),
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        select: { id: true, title: true, mode: true, messageCount: true, pinned: true, createdAt: true, updatedAt: true },
      }),
      global.prisma.conversation.count({ where }),
    ]);

    return R.success(res, { conversations, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── GET /api/v1/chat/conversations/:id ───────────────────────────────────────
const getConversation = async (req, res, next) => {
  try {
    const convo = await global.prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
    });
    if (!convo) return R.notFound(res, "Conversation not found.");
    return R.success(res, convo);
  } catch (err) { next(err); }
};

// ── PATCH /api/v1/chat/conversations/:id ─────────────────────────────────────
const updateConversation = async (req, res, next) => {
  try {
    const { title, pinned, mode, systemPrompt } = req.body;
    const data = {};
    if (title !== undefined)        data.title        = xss(title.trim());
    if (pinned !== undefined)       data.pinned       = pinned;
    if (mode !== undefined)         data.mode         = mode;
    if (systemPrompt !== undefined) data.systemPrompt = xss(systemPrompt);

    const convo = await global.prisma.conversation.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data,
    });
    if (convo.count === 0) return R.notFound(res, "Conversation not found.");
    return R.success(res, {}, "Conversation updated.");
  } catch (err) { next(err); }
};

// ── DELETE /api/v1/chat/conversations/:id ────────────────────────────────────
const deleteConversation = async (req, res, next) => {
  try {
    const deleted = await global.prisma.conversation.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (deleted.count === 0) return R.notFound(res, "Conversation not found.");
    return R.success(res, {}, "Conversation deleted.");
  } catch (err) { next(err); }
};

// ── GET /api/v1/chat/conversations/:id/messages ──────────────────────────────
const getMessages = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const convo = await global.prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!convo) return R.notFound(res, "Conversation not found.");

    const [messages, total] = await Promise.all([
      global.prisma.message.findMany({
        where: { conversationId: req.params.id },
        orderBy: { createdAt: "asc" },
        skip, take: parseInt(limit),
      }),
      global.prisma.message.count({ where: { conversationId: req.params.id } }),
    ]);

    return R.success(res, { messages, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ── POST /api/v1/chat/conversations/:id/messages (SSE streaming) ─────────────
const sendMessage = async (req, res, next) => {
  try {
    const user = req.userFull;
    const { content, fileUrl, fileType, fileName, webSearch } = req.body;
    const conversationId = req.params.id;

    // Verify conversation belongs to user
    const convo = await global.prisma.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
    });
    if (!convo) return R.notFound(res, "Conversation not found.");

    // Check plan limits
    const plan = config.plans[user.plan.toLowerCase()] || config.plans.free;
    const limitCheck = await checkDailyLimit(user);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        success: false,
        message: `Daily limit of ${limitCheck.limit} messages reached. Upgrade to Pro for unlimited messages.`,
        upgrade: true,
      });
    }

    // Feature gates
    if (webSearch && !plan.webSearch) {
      return R.forbidden(res, "Web search is a Pro feature.", 403, { upgrade: true });
    }
    if ((fileUrl || fileType) && !plan.imageUpload) {
      return R.forbidden(res, "File uploads are a Pro feature.", 403, { upgrade: true });
    }

    // Build user message content
    let apiContent;
    if (fileUrl && fileType?.startsWith("image/")) {
      apiContent = [
        { type: "image", source: { type: "url", url: fileUrl } },
        { type: "text", text: content || "Describe and analyze this image." },
      ];
    } else {
      apiContent = content;
    }

    // Save user message
    const userMsg = await global.prisma.message.create({
      data: {
        conversationId, role: "user",
        content: content || (fileName ? `[File: ${fileName}]` : ""),
        fileUrl, fileType, fileName,
        webSearchUsed: !!webSearch,
        modelUsed: config.anthropic.model,
      },
    });

    // Load conversation history for context
    const history = await global.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 40,
    });

    const apiMessages = history.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.id === userMsg.id ? apiContent : m.content,
    }));

    // Update daily counter
    await global.prisma.user.update({
      where: { id: user.id },
      data: { dailyMessages: { increment: 1 }, totalMessages: { increment: 1 }, lastActiveAt: new Date() },
    });
    await global.redis.del(`user:${user.id}`).catch(() => {});

    const startTime = Date.now();

    // Stream response
    const result = await aiSvc.streamChatSSE(res, {
      messages: apiMessages,
      mode: convo.mode,
      systemOverride: convo.systemPrompt,
      webSearch: !!webSearch && plan.webSearch,
      plan: user.plan,
    });

    // Save assistant message after streaming completes
    if (result?.fullText) {
      const latencyMs = Date.now() - startTime;
      const [aiMsg] = await Promise.all([
        global.prisma.message.create({
          data: {
            conversationId, role: "assistant",
            content: result.fullText,
            webSearchUsed: !!webSearch,
            modelUsed: config.anthropic.model,
            tokens: result.tokens || 0,
            latencyMs,
          },
        }),
        global.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            messageCount: { increment: 2 },
            totalTokens: { increment: result.tokens || 0 },
            title: history.length < 2 ? await generateTitle(content) : undefined,
          },
        }),
      ]);
    }
  } catch (err) {
    if (!res.headersSent) next(err);
    else logger.error({ err }, "Error after SSE headers sent");
  }
};

async function generateTitle(content) {
  if (!content || content.length < 5) return "New Conversation";
  try {
    const title = await aiSvc.complete({
      messages: [{ role: "user", content: `Generate a short 3-5 word title for a conversation that starts with: "${content.slice(0, 150)}". Reply with ONLY the title, no quotes.` }],
      system: "You generate concise conversation titles. Reply with only the title text, nothing else.",
      maxTokens: 20,
    });
    return title.trim().slice(0, 60) || "New Conversation";
  } catch { return "New Conversation"; }
}

module.exports = { createConversation, getConversations, getConversation, updateConversation, deleteConversation, getMessages, sendMessage };
