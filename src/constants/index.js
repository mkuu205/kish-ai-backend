// src/constants/index.js

const AI_MODES = {
  general: {
    id: "general", label: "General", icon: "◈", color: "#00e5ff",
    system: "You are Kish, a powerful AI assistant. Be helpful, accurate, and insightful. When users need current information, use web search.",
  },
  research: {
    id: "research", label: "Research", icon: "◎", color: "#a78bfa",
    system: "You are Kish in Research mode. Specialize in deep research and comprehensive analysis. Always search the web for the latest data and cite sources.",
  },
  creative: {
    id: "creative", label: "Creative", icon: "✦", color: "#fb923c",
    system: "You are Kish in Creative mode. Excel at creative writing, storytelling, poetry, and brainstorming. Be vivid and expressive.",
  },
  coder: {
    id: "coder", label: "Coder", icon: "</>", color: "#4ade80",
    system: "You are Kish in Coder mode. Expert programmer in all languages. Write clean, efficient, well-documented code with clear explanations.",
  },
  vision: {
    id: "vision", label: "Vision", icon: "◉", color: "#f472b6",
    system: "You are Kish in Vision mode. Analyze images, photos, charts, and documents with exceptional detail and accuracy.",
  },
};

const TICKET_NUMBER_PREFIX = "TKT";
const DAILY_MESSAGE_LIMIT_FREE = 10;

const NOTIFICATION_TYPES = {
  TICKET_REPLY: "ticket_reply",
  TICKET_RESOLVED: "ticket_resolved",
  TICKET_ASSIGNED: "ticket_assigned",
  PAYMENT_SUCCESS: "payment_success",
  PAYMENT_FAILED: "payment_failed",
  PLAN_UPGRADED: "plan_upgraded",
  PLAN_DOWNGRADED: "plan_downgraded",
  SYSTEM: "system",
};

const SOCKET_EVENTS = {
  // Chat
  JOIN_CONVERSATION: "join:conversation",
  LEAVE_CONVERSATION: "leave:conversation",
  MESSAGE_CHUNK: "message:chunk",
  MESSAGE_DONE: "message:done",
  MESSAGE_ERROR: "message:error",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  // Support
  JOIN_SUPPORT: "support:join",
  SUPPORT_MESSAGE: "support:message",
  SUPPORT_TYPING: "support:typing",
  AGENT_JOINED: "support:agent_joined",
  SESSION_CLOSED: "support:session_closed",
  // Notifications
  NOTIFICATION: "notification",
  UNREAD_COUNT: "unread:count",
  // Admin
  ADMIN_UPDATE: "admin:update",
};

const EMAIL_SUBJECTS = {
  OTP_VERIFY: "Your Kish AI verification code",
  WELCOME: "Welcome to Kish AI! 🚀",
  TICKET_RECEIVED: "Support ticket received",
  TICKET_REPLY: "New reply on your support ticket",
  TICKET_RESOLVED: "Your support ticket has been resolved",
  PAYMENT_SUCCESS: "Payment successful — You're on Pro!",
  PAYMENT_FAILED: "Payment failed — Action required",
};

module.exports = { AI_MODES, TICKET_NUMBER_PREFIX, DAILY_MESSAGE_LIMIT_FREE, NOTIFICATION_TYPES, SOCKET_EVENTS, EMAIL_SUBJECTS };
