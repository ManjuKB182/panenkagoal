// Reviewer notification emails, sent through Resend's HTTP API (no SDK, works in Pages Functions).

export interface MailEnv {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;        // e.g. "Panenka Goal <notify@panenkagoal.com>" (a domain verified in Resend)
  REVIEWER_EMAILS?: string;  // comma-separated editor addresses
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function reviewerList(env: MailEnv): string[] {
  return (env.REVIEWER_EMAILS ?? '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
}

export function submissionEmail(p: { title: string; kind: string; writerName: string; writerEmail: string; reviewUrl: string }) {
  const kind = p.kind === 'analyst' ? 'analyst piece' : 'fan piece';
  const subject = `New piece to review: ${p.title}`;
  const text = `${p.writerName} (${p.writerEmail}) sent a ${kind} for review.\n\nTitle: ${p.title}\n\nReview it: ${p.reviewUrl}\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111">
<p style="font-size:13px;color:#077a73;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px">Outfield Talks · New submission</p>
<h1 style="font-size:22px;margin:0 0 16px">${esc(p.title)}</h1>
<p style="margin:0 0 4px"><b>From:</b> ${esc(p.writerName)} (<a href="mailto:${esc(p.writerEmail)}">${esc(p.writerEmail)}</a>)</p>
<p style="margin:0 0 24px"><b>Type:</b> ${esc(kind)}</p>
<a href="${esc(p.reviewUrl)}" style="display:inline-block;background:#0b8f87;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px">Review</a>
<p style="font-size:12px;color:#666;margin-top:24px">Button not working? Open ${esc(p.reviewUrl)}</p></div>`;
  return { subject, text, html };
}

/** Best effort: never throws, so a mail problem can't fail a submission. Returns true when Resend accepted it. */
export async function notifyReviewers(env: MailEnv, msg: { subject: string; text: string; html: string }): Promise<boolean> {
  const to = reviewerList(env);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to.length) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject: msg.subject, text: msg.text, html: msg.html }),
    });
    return r.ok;
  } catch { return false; }
}
