// Account emails. With SMTP_HOST set they go out over SMTP (Gmail with an app
// password, Brevo, Postmark, ...). Without it the link is printed to the
// server log instead, which is enough for the local install.
import nodemailer from 'nodemailer';

let transport = null;

function smtp() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export async function sendResetEmail(to, link) {
  const text = [
    'Someone asked to reset the password of this MASEF Helper account.',
    '',
    `Choose a new password here (the link works for one hour):`,
    link,
    '',
    'If you did not ask for this, ignore this email and your password stays the same.',
  ].join('\n');

  const mail = smtp();
  if (!mail) {
    console.log(`[mail] SMTP_HOST not set. Password reset link for ${to}: ${link}`);
    return;
  }
  await mail.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your MASEF Helper password',
    text,
  });
}
