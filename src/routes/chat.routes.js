// src/routes/chat.routes.js
const router = require("express").Router();
const ctrl   = require("../controllers/chat.contoller");
const { requireAuth } = require("../middleware/auth");
const { chatLimiter } = require("../middleware/rateLimiter.middleware");

router.use(requireAuth);

// Simple stateless chat endpoint (used by the frontend ChatExperience)
router.post("/", chatLimiter, ctrl.simpleChat);

// Conversation-based endpoints
router.post("/conversations",                              ctrl.createConversation);
router.get("/conversations",                               ctrl.getConversations);
router.get("/conversations/:id",                           ctrl.getConversation);
router.patch("/conversations/:id",                         ctrl.updateConversation);
router.delete("/conversations/:id",                        ctrl.deleteConversation);
router.get("/conversations/:id/messages",                  ctrl.getMessages);
router.post("/conversations/:id/messages", chatLimiter,    ctrl.sendMessage);

module.exports = router;
