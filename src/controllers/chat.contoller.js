const aiSvc = require("../services/ai.service");
const R = require("../utils/response");
const logger = require("../utils/logger");
const config = require("../../config");
const xss = require("xss");

async function checkDailyLimit(user) {
  const now = new Date();
  const reset = new Date(user.dailyResetAt || new Date());
  let daily = user.dailyMessages || 0;

  if (now.toDateString() !== reset.toDateString()) {
    await global.prisma.user.update({
      where: { id: user.id },
      data: {
        dailyMessages: 0,
        dailyResetAt: now,
      },
    });
    daily = 0;
  }

  return {
    allowed: true,
    used: daily,
    limit: Infinity,
  };
}

// SIMPLE CHAT ENDPOINT
const simpleChat = async (req, res, next) => {
  try {
    const user = req.user || req.userFull;
    const { message, content, webSearch } = req.body;

    const text = message || content;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const result = await aiSvc.complete({
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
      webSearch: !!webSearch,
      plan: user?.plan || "free",
    });

    return R.success(res, {
      message: result,
    });
  } catch (err) {
    next(err);
  }
};

const createConversation = async (req, res, next) => {
  try {
    const { title = "New Conversation" } = req.body;

    const convo = await global.prisma.conversation.create({
      data: {
        title: xss(title.trim()),
        userId: req.user.id,
      },
    });

    return R.created(res, convo, "Conversation created.");
  } catch (err) {
    next(err);
  }
};

const getConversations = async (req, res, next) => {
  try {
    const conversations = await global.prisma.conversation.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });

    return R.success(res, conversations);
  } catch (err) {
    next(err);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const convo = await global.prisma.conversation.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!convo) {
      return R.notFound(res, "Conversation not found.");
    }

    return R.success(res, convo);
  } catch (err) {
    next(err);
  }
};

const updateConversation = async (req, res, next) => {
  try {
    await global.prisma.conversation.update({
      where: { id: req.params.id },
      data: req.body,
    });

    return R.success(res, {}, "Conversation updated.");
  } catch (err) {
    next(err);
  }
};

const deleteConversation = async (req, res, next) => {
  try {
    await global.prisma.conversation.delete({
      where: { id: req.params.id },
    });

    return R.success(res, {}, "Conversation deleted.");
  } catch (err) {
    next(err);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const messages = await global.prisma.message.findMany({
      where: {
        conversationId: req.params.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return R.success(res, messages);
  } catch (err) {
    next(err);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content) {
      return R.badRequest(res, "Message content required.");
    }

    const result = await aiSvc.complete({
      messages: [
        {
          role: "user",
          content,
        },
      ],
    });

    return R.success(res, {
      reply: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  simpleChat,
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  sendMessage,
};
