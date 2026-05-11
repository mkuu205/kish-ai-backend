// src/services/email.service.js
const nodemailer = require("nodemailer");
const config     = require("../config");
const logger     = require("../utils/logger");

const transporter = nodemailer.createTransport({
  service: config.email.service,
  auth: { user: config.email.user, pass: config.email.pass },
});

function baseTemplate(content, title) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;}
body{background:#060a12;margin:0;padding:20px;font-family:'Segoe UI',Arial,sans-serif;}
.wrap{max-width:540px;margin:0 auto;background:#0d1421;border-radius:16px;border:1px solid rgba(0,229,255,.2);overflow:hidden;}
.header{background:linear-gradient(135deg,rgba(0,229,255,.12),rgba(167,139,250,.08));padding:32px;text-align:center;border-bottom:1px solid rgba(0,229,255,.1);}
.logo{font-size:26px;font-weight:800;color:#fff;letter-spacing:.12em;}
.logo span{color:#00e5ff;}
.body{padding:32px;}
h2{color:#e2e8f0;font-size:20px;margin:0 0 14px;font-weight:600;}
p{color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 16px;}
.otp{background:rgba(0,229,255,.06);border:1px solid rgba(0,229,255,.25);border-radius:12px;padding:28px;text-align:center;margin:24px 0;}
.otp-code{font-size:44px;font-weight:800;color:#00e5ff;letter-spacing:14px;font-family:'Courier New',monospace;}
.otp-hint{color:#64748b;font-size:12px;margin-top:8px;font-family:monospace;letter-spacing:.1em;}
.btn{display:inline-block;background:linear-gradient(135deg,#00e5ff,rgba(0,229,255,.7));color:#000;padding:14px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin-top:8px;}
.highlight{color:#00e5ff;font-weight:600;}
.divider{border:none;border-top:1px solid rgba(255,255,255,.06);margin:20px 0;}
.footer{padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.05);}
.footer p{color:#2d3a4a;font-size:11px;margin:0;font-family:monospace;}
</style></head>
<body><div class="wrap">
<div class="header"><div class="logo">KISH <span>AI</span></div><div style="color:#64748b;font-size:11px;margin-top:4px;letter-spacing:.15em">${title}</div></div>
<div class="body">${content}</div>
<div class="footer"><p>© 2025 Kish AI · This is an automated message<br/>Do not reply to this email</p></div>
</div></body></html>`;
}

async function send({ to, subject, html }) {
  if (!config.email.user) {
    logger.warn({ to, subject }, "Email skipped: EMAIL_USER not configured");
    return;
  }
  try {
    await transporter.sendMail({ from: config.email.from, to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.error({ err, to, subject }, "Email send failed");
  }
}

async function sendOTP(to, name, code) {
  const content = `
    <h2>Verify your email, ${name} 👋</h2>
    <p>Thanks for signing up to Kish AI! Enter the code below to activate your account.</p>
    <div class="otp">
      <div class="otp-code">${code}</div>
      <div class="otp-hint">EXPIRES IN 10 MINUTES · DO NOT SHARE</div>
    </div>
    <p>If you didn't create a Kish AI account, you can safely ignore this email.</p>`;
  await send({ to, subject: "Your Kish AI verification code", html: baseTemplate(content, "EMAIL VERIFICATION") });
}

async function sendWelcome(to, name) {
  const content = `
    <h2>You're in, ${name}! 🎉</h2>
    <p>Your Kish AI account is verified and ready. You're on the <span class="highlight">Free plan</span> — 10 messages per day with Claude AI.</p>
    <hr class="divider"/>
    <p>Ready to experience Pro?</p>
    <p>Upgrade for <span class="highlight">unlimited messages</span>, web search, image analysis, and 5 AI modes.</p>
    <a class="btn" href="${config.server.frontendUrl}/billing">Upgrade to Pro →</a>`;
  await send({ to, subject: `Welcome to Kish AI, ${name}! 🚀`, html: baseTemplate(content, "WELCOME") });
}

async function sendTicketReceived(to, name, ticketNumber, title) {
  const content = `
    <h2>Support ticket received, ${name}</h2>
    <p>We've received your support ticket and our team will respond shortly.</p>
    <div class="otp" style="padding:16px">
      <div style="font-size:13px;color:#64748b;font-family:monospace;letter-spacing:.1em">TICKET NUMBER</div>
      <div class="otp-code" style="font-size:22px;letter-spacing:6px">${ticketNumber}</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:8px">${title}</div>
    </div>
    <p>You'll receive an email when an agent replies. You can also view your tickets at:</p>
    <a class="btn" href="${config.server.frontendUrl}/support/tickets">View My Tickets →</a>`;
  await send({ to, subject: `[${ticketNumber}] Support ticket received`, html: baseTemplate(content, "SUPPORT TICKET") });
}

async function sendTicketReply(to, name, ticketNumber, agentName) {
  const content = `
    <h2>New reply on your ticket, ${name}</h2>
    <p><span class="highlight">${agentName}</span> from the Kish AI support team has replied to ticket <span class="highlight">${ticketNumber}</span>.</p>
    <a class="btn" href="${config.server.frontendUrl}/support/tickets">View Reply →</a>`;
  await send({ to, subject: `[${ticketNumber}] New reply from support`, html: baseTemplate(content, "TICKET REPLY") });
}

async function sendPaymentSuccess(to, name, plan, amount) {
  const content = `
    <h2>Payment successful, ${name}! ⚡</h2>
    <p>You're now on the <span class="highlight">${plan}</span> plan. All premium features are unlocked.</p>
    <div class="otp" style="padding:20px">
      <div style="color:#64748b;font-size:11px;font-family:monospace;letter-spacing:.1em">AMOUNT PAID</div>
      <div class="otp-code" style="font-size:28px;letter-spacing:4px">${amount}</div>
    </div>
    <a class="btn" href="${config.server.frontendUrl}/chat">Start Using Kish AI Pro →</a>`;
  await send({ to, subject: "Payment successful — You're on Pro! 🎉", html: baseTemplate(content, "PAYMENT SUCCESS") });
}

async function sendBroadcast(to, name, subject, message) {
  const content = `<h2>Hi ${name},</h2><p>${message.replace(/\n/g, "<br/>")}</p>`;
  await send({ to, subject, html: baseTemplate(content, "KISH AI UPDATE") });
}

module.exports = { sendOTP, sendWelcome, sendTicketReceived, sendTicketReply, sendPaymentSuccess, sendBroadcast };
