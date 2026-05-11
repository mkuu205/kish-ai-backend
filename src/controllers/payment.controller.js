// src/controllers/payment.controller.js
const stripe = require("stripe")(require("../config").stripe.secretKey);
const config = require("../config");
const R      = require("../utils/response");
const logger = require("../utils/logger");
const { addEmailJob } = require("../jobs");

// ── POST /api/v1/payments/stripe/checkout ────────────────────────────────────
const stripeCheckout = async (req, res, next) => {
  try {
    const user = req.userFull;
    if (user.plan === "PRO") return R.badRequest(res, "Already on Pro plan.");

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
      customerId = customer.id;
      await global.prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: config.stripe.proPriceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${config.server.frontendUrl}/billing?payment=success&method=card&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${config.server.frontendUrl}/billing?payment=cancelled`,
      metadata: { userId: user.id, email: user.email },
      subscription_data: { metadata: { userId: user.id, email: user.email } },
    });

    await global.prisma.activityLog.create({
      data: { userId: user.id, type: "stripe_checkout_initiated", data: { sessionId: session.id } },
    });

    return R.success(res, { url: session.url });
  } catch (err) { next(err); }
};

// ── POST /api/v1/payments/stripe/portal ──────────────────────────────────────
const billingPortal = async (req, res, next) => {
  try {
    const user = req.userFull;
    if (!user.stripeCustomerId) return R.badRequest(res, "No billing account found.");

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${config.server.frontendUrl}/billing`,
    });
    return R.success(res, { url: session.url });
  } catch (err) { next(err); }
};

// ── POST /api/v1/payments/stripe/webhook ─────────────────────────────────────
const stripeWebhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], config.stripe.webhookSecret);
  } catch (err) {
    logger.warn({ err: err.message }, "Stripe webhook signature failure");
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId  = session.metadata?.userId;
        if (!userId) break;
        const user = await global.prisma.user.findUnique({ where: { id: userId } });
        if (!user) break;

        await global.prisma.$transaction([
          global.prisma.user.update({ where: { id: userId }, data: { plan: "PRO" } }),
          global.prisma.subscription.upsert({
            where: { userId },
            create: { userId, plan: "PRO", status: "ACTIVE", method: "STRIPE", stripeSubscriptionId: session.subscription, stripePriceId: config.stripe.proPriceId },
            update: { plan: "PRO", status: "ACTIVE", stripeSubscriptionId: session.subscription, cancelledAt: null },
          }),
          global.prisma.payment.create({
            data: { userId, reference: session.id, amount: 12.00, currency: "USD", method: "STRIPE", status: "COMPLETED", completedAt: new Date() },
          }),
          global.prisma.activityLog.create({
            data: { userId, type: "upgrade", data: { method: "stripe", plan: "PRO" } },
          }),
          global.prisma.notification.create({
            data: { userId, type: "plan_upgraded", title: "You're on Pro! ⚡", message: "All premium features are now unlocked." },
          }),
        ]);

        await global.redis.del(`user:${userId}`).catch(() => {});
        await addEmailJob({ type: "payment_success", to: user.email, name: user.name, plan: "Pro", amount: "$12.00" });
        logger.info({ userId, email: user.email }, "Stripe Pro activated");
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await global.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: { status: "ACTIVE", currentPeriodStart: new Date(sub.current_period_start * 1000), currentPeriodEnd: new Date(sub.current_period_end * 1000) },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await global.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: { status: "PAST_DUE" },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const dbSub = await global.prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
        if (!dbSub) break;

        await global.prisma.$transaction([
          global.prisma.user.update({ where: { id: dbSub.userId }, data: { plan: "FREE" } }),
          global.prisma.subscription.update({ where: { stripeSubscriptionId: sub.id }, data: { plan: "FREE", status: "CANCELLED", cancelledAt: new Date() } }),
          global.prisma.activityLog.create({ data: { userId: dbSub.userId, type: "downgrade", data: { reason: "Stripe subscription cancelled" } } }),
          global.prisma.notification.create({ data: { userId: dbSub.userId, type: "plan_downgraded", title: "Plan downgraded", message: "Your Pro subscription has been cancelled. You are now on the Free plan." } }),
        ]);

        await global.redis.del(`user:${dbSub.userId}`).catch(() => {});
        logger.info({ userId: dbSub.userId }, "User downgraded to Free");
        break;
      }
    }
  } catch (err) { logger.error({ err, eventType: event.type }, "Stripe webhook processing error"); }

  res.json({ received: true });
};

// ── POST /api/v1/payments/mpesa/initiate ─────────────────────────────────────
const mpesaInitiate = async (req, res, next) => {
  try {
    const user = req.userFull;
    if (user.plan === "PRO") return R.badRequest(res, "Already on Pro plan.");

    let { phone } = req.body;
    phone = phone.replace(/[\s\-\+]/g, "");
    if (phone.startsWith("0"))   phone = "254" + phone.slice(1);
    if (!/^2547\d{8}$/.test(phone)) return R.badRequest(res, "Invalid Kenyan phone number. Use 07XXXXXXXX format.");

    const reference = `KISH_${user.id}_${Date.now()}`;
    const auth = Buffer.from(`${config.payhero.username}:${config.payhero.password}`).toString("base64");

    const phRes = await fetch(`${config.payhero.baseUrl}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}` },
      body: JSON.stringify({
        amount: config.payhero.mpesaAmount,
        phone_number: phone,
        channel_id: config.payhero.channelId,
        provider: "m-pesa",
        external_reference: reference,
        callback_url: `${config.server.backendUrl}/api/v1/payments/mpesa/callback`,
      }),
    });

    const phData = await phRes.json();
    if (!phRes.ok || phData.success === false) {
      logger.error({ phData }, "PayHero STK push failed");
      return R.error(res, phData.message || "Failed to initiate M-Pesa payment. Try again.", 502);
    }

    await global.prisma.payment.create({
      data: {
        userId: user.id, reference,
        payheroRef: phData.reference || null,
        amount: config.payhero.mpesaAmount,
        currency: "KES",
        method: "MPESA",
        status: "PENDING",
        metadata: { phone },
      },
    });

    logger.info({ userId: user.id, phone, reference }, "MPesa STK push initiated");
    return R.success(res, { reference, message: `STK Push sent to ${phone.replace("254", "0")}. Enter your M-Pesa PIN.` });
  } catch (err) { next(err); }
};

// ── GET /api/v1/payments/mpesa/status/:ref ───────────────────────────────────
const mpesaStatus = async (req, res, next) => {
  try {
    const payment = await global.prisma.payment.findFirst({
      where: { reference: req.params.ref, userId: req.user.id },
    });
    if (!payment) return R.notFound(res, "Payment not found.");
    return R.success(res, { status: payment.status, reference: payment.reference, amount: payment.amount });
  } catch (err) { next(err); }
};

// ── POST /api/v1/payments/mpesa/callback ─────────────────────────────────────
const mpesaCallback = async (req, res) => {
  try {
    const body = req.body;
    const reference = body.external_reference || body.merchant_reference;
    const success   = body.status === "SUCCESS" || body.ResultCode === "0" || body.status === "COMPLETE";

    if (!reference) return res.status(200).json({ received: true });

    const payment = await global.prisma.payment.findUnique({ where: { reference } });
    if (!payment) return res.status(200).json({ received: true });

    const newStatus = success ? "COMPLETED" : "FAILED";

    await global.prisma.payment.update({
      where: { reference },
      data: { status: newStatus, completedAt: success ? new Date() : null, metadata: { ...payment.metadata, rawCallback: body } },
    });

    if (success) {
      const user = await global.prisma.user.findUnique({ where: { id: payment.userId } });
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await global.prisma.$transaction([
        global.prisma.user.update({ where: { id: payment.userId }, data: { plan: "PRO" } }),
        global.prisma.subscription.upsert({
          where: { userId: payment.userId },
          create: { userId: payment.userId, plan: "PRO", status: "ACTIVE", method: "MPESA", mpesaPhone: payment.metadata?.phone, currentPeriodStart: new Date(), currentPeriodEnd: expiry },
          update: { plan: "PRO", status: "ACTIVE", method: "MPESA", mpesaPhone: payment.metadata?.phone, currentPeriodStart: new Date(), currentPeriodEnd: expiry },
        }),
        global.prisma.activityLog.create({ data: { userId: payment.userId, type: "upgrade", data: { method: "mpesa", plan: "PRO", amount: `KES ${payment.amount}` } } }),
        global.prisma.notification.create({ data: { userId: payment.userId, type: "plan_upgraded", title: "You're on Pro! ⚡", message: `KES ${payment.amount} received. All premium features unlocked.` } }),
      ]);

      await global.redis.del(`user:${payment.userId}`).catch(() => {});
      if (user) await addEmailJob({ type: "payment_success", to: user.email, name: user.name, plan: "Pro", amount: `KES ${payment.amount}` });
      logger.info({ userId: payment.userId }, "M-Pesa Pro activated");
    }
  } catch (err) { logger.error({ err }, "MPesa callback error"); }

  res.status(200).json({ received: true });
};

module.exports = { stripeCheckout, billingPortal, stripeWebhook, mpesaInitiate, mpesaStatus, mpesaCallback };
