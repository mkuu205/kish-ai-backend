// src/routes/user.routes.js
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { getMe, updateProfile } = require("../controllers/auth.controller");
const supportCtrl = require("../controllers/support.controller");

router.use(requireAuth);

// Profile
router.get("/",       getMe);
router.patch("/",     updateProfile);

// Notifications
router.get("/notifications",       supportCtrl.getNotifications);
router.post("/notifications/read", supportCtrl.markNotificationsRead);

// Support tickets
router.get("/tickets",                        supportCtrl.getTickets);
router.post("/tickets",                       supportCtrl.createTicket);
router.get("/tickets/:id",                    supportCtrl.getTicket);
router.post("/tickets/:id/messages",          supportCtrl.replyToTicket);
router.patch("/tickets/:id/close",            supportCtrl.closeTicket);
router.patch("/tickets/:id/reopen",           supportCtrl.reopenTicket);

module.exports = router;
