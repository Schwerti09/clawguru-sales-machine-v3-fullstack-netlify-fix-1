import { Resend } from "resend";

function required(name: string, v?: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getResend() {
  const key = required("RESEND_API_KEY", process.env.RESEND_API_KEY);
  return new Resend(key);
}

export function getFrom() {
  return required("EMAIL_FROM", process.env.EMAIL_FROM);
}

export async function sendDownloadEmail(opts: { to: string; subject: string; html: string; text?: string }) {
  const resend = getResend();
  await resend.emails.send({
    from: getFrom(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
