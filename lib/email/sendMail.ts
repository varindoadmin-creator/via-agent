// ─── Gmail SMTP mailer ──────────────────────────────────────────────────────
// Server-side only. Requires SMTP_USER (the sending Gmail address) and
// SMTP_PASS (a 16-char Google Account App Password — not the account
// password) in the environment. Generate one at
// https://myaccount.google.com/apppasswords (requires 2-Step Verification).

import nodemailer from 'nodemailer';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in the environment to send email.');
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user, pass },
  });
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text?: string;
  attachments?: MailAttachment[];
}) {
  const user = process.env.SMTP_USER;
  await getTransporter().sendMail({
    from: `"VIA — Varindo Intelligence Agent" <${user}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
}
