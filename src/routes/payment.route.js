// src/routes/payment.routes.js
const router = require("express").Router();
const ctrl   = require("../controllers/payment.controller");
const { requireAuth } = require("../middleware/auth");

// Stripe webhook (raw body, no auth)
router.post("/stripe/webhook", ctrl.stripeWebhook);

// M-Pesa callback (no auth)
router.post("/mpesa/callback", ctrl.mpesaCallback);

// Authenticated routes
router.use(requireAuth);
router.post("/stripe/checkout", ctrl.stripeCheckout);
router.post("/stripe/portal",   ctrl.billingPortal);
router.post("/mpesa/initiate",  ctrl.mpesaInitiate);
router.get("/mpesa/status/:ref", ctrl.mpesaStatus);

// Single unified endpoint used by the frontend paymentService
router.post("/", requireAuth, async (req, res, next) => {
  const { action } = req.body;
  if (action === "stripe_checkout") return ctrl.stripeCheckout(req, res, next);
  if (action === "mpesa_initiate")  return ctrl.mpesaInitiate(req, res, next);
  if (action === "mpesa_status")    return ctrl.mpesaStatus(req, res, next);
  return res.status(400).json({ success: false, message: "Unknown payment action." });
});

module.exports = router;
