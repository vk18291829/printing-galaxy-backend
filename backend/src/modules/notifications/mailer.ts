import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/config/env';

let transport: Transporter | null = null;

/** Gmail over SMTP with an App Password. Created on first use so tests can swap the env. */
function gmail() {
  transport ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    pool: true,
    maxConnections: 2,
  });
  return transport;
}

/** Tests replace the transport; a changed Gmail login also needs a fresh one. */
export function resetMailer(next: Transporter | null = null) {
  transport = next;
}

export interface Mail {
  to: string;
  subject: string;
  /** Plain-text paragraphs; blank lines separate them. */
  text: string;
  /** Optional button under the text. */
  action?: { label: string; url: string };
  /** Shown in small print, e.g. how to stop offers. */
  footer?: { text: string; url?: string; linkLabel?: string };
  headers?: Record<string, string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Simple, client-safe HTML (tables, inline styles) with the brand strip at the top. */
export function renderMail(mail: Omit<Mail, 'to' | 'headers'>) {
  const paragraphs = mail.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#18181b">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = mail.action
    ? `<p style="margin:22px 0 6px"><a href="${esc(mail.action.url)}" style="display:inline-block;background:#1d6cf0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(mail.action.label)}</a></p>`
    : '';
  const footer = mail.footer
    ? `<p style="margin:0;font-size:12px;line-height:1.5;color:#71717a">${esc(mail.footer.text)}${
        mail.footer.url ? ` <a href="${esc(mail.footer.url)}" style="color:#71717a">${esc(mail.footer.linkLabel ?? mail.footer.url)}</a>` : ''
      }</p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
<tr><td style="height:6px;font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="height:6px;background:#12B5EA"></td><td style="height:6px;background:#D9138A"></td><td style="height:6px;background:#FFC20E"></td><td style="height:6px;background:#131A2B"></td>
</tr></table></td></tr>
<tr><td style="padding:24px 28px 6px;font-size:18px;font-weight:700;color:#131A2B">${esc(env.MAIL_FROM_NAME)}</td></tr>
<tr><td style="padding:12px 28px 22px">${paragraphs}${button}</td></tr>
${footer ? `<tr><td style="padding:16px 28px 22px;border-top:1px solid #f4f4f5">${footer}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
  const plain = [
    mail.text,
    mail.action ? `${mail.action.label}: ${mail.action.url}` : '',
    mail.footer ? `${mail.footer.text}${mail.footer.url ? ` ${mail.footer.url}` : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { html, text: plain };
}

export async function sendMail(mail: Mail) {
  const { html, text } = renderMail(mail);
  const info = await gmail().sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.GMAIL_USER ?? '' },
    to: mail.to,
    subject: mail.subject,
    text,
    html,
    headers: mail.headers,
  });
  return info.messageId as string | undefined;
}
