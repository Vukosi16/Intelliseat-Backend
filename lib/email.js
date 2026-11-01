const nodemailer = require('nodemailer');

function sendEmail({ to, subject, text }) {
  const provider = process.env.EMAIL_PROVIDER || 'console';

  if (provider === 'console') {
    console.log(`[email] To: ${to}\n[email] Subject: ${subject}\n[email] Body:\n${text}`);
    return Promise.resolve({ ok: true });
  }
  if (provider !== 'gmail') {
    return Promise.resolve({ ok: false, error: `Unsupported email provider: ${provider}` });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return Promise.resolve({ ok: false, error: 'Gmail credentials are not configured' });
  }

  if (!globalThis.__intelliseatMailer) {
    globalThis.__intelliseatMailer = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  return globalThis.__intelliseatMailer.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'IntelliSeat'}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
  })
    .then(() => ({ ok: true }))
    .catch((error) => ({ ok: false, error: error.message.slice(0, 160) }));
}

// Add future providers here without changing callers.
module.exports = { sendEmail };
