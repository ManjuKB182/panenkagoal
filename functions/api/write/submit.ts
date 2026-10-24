import {
  blocksFor, getSql, ipHash, json, LIMITS, photoKey, sniffImage, signInNeeded, slugify, validateSubmission, verifyTurnstile, writerIdentity, type Env,
} from '../../../src/lib/write';
import { notifyReviewers, submissionEmail, type MailEnv } from '../../../src/lib/mail';
import { apiMsg } from './_locale';

// POST /api/write/submit (multipart/form-data). Writers only: signed in through the writers' Access app;
// the piece is tied to the verified Access email, whatever the form says.
//   payload: JSON string (title, kind, name, email, ownership, credit, confirm, cover, blocks)
//   photo0..photoN: the resized images, referenced from payload by index
//   hp: honeypot (must be empty), cf-turnstile-response: spam check token
export const onRequestPost = async ({ request, env, waitUntil }: { request: Request; env: Env & MailEnv; waitUntil?: (p: Promise<unknown>) => void }) => {
  const who = await writerIdentity(request, env);
  if (!who) return signInNeeded();
  const sql = getSql(env);
  if (!sql || !env.POSTS_BUCKET) return json({ error: apiMsg(request, 'write.api.notOpen') }, 503);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: apiMsg(request, 'write.api.wrong') }, 400); }

  // Honeypot: bots fill every field. Pretend it worked.
  if (String(form.get('hp') ?? '').trim()) return json({ ok: true });

  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(env, String(form.get('cf-turnstile-response') ?? ''), ip))) {
    return json({ error: apiMsg(request, 'write.api.spam') }, 400);
  }

  let payload: any;
  try { payload = JSON.parse(String(form.get('payload') ?? '')); } catch { return json({ error: apiMsg(request, 'write.api.wrong') }, 400); }
  payload = { ...payload, email: who.email };
  const files: File[] = [];
  for (let i = 0; i < LIMITS.photos + 1; i++) {
    const f = form.get(`photo${i}`);
    if (f && typeof f !== 'string') files.push(f as File); else break;
  }
  const checked = validateSubmission(payload, files.map((f) => ({ type: f.type, size: f.size })));
  if (!checked.ok) return json({ error: checked.error }, 400);
  const sub = checked.value;

  // Rate limit per IP (hashed): a handful of submissions an hour.
  const h = await ipHash(env, ip || 'unknown');
  try {
    const [{ n }] = await sql(`select count(*)::int as n from write_submissions where ip_hash = $1 and at > now() - interval '1 hour'`, [h]);
    if (n >= LIMITS.perHour) return json({ error: apiMsg(request, 'write.api.rateLimit') }, 429);
  } catch { return json({ error: apiMsg(request, 'write.api.notOpen') }, 503); }

  // Check the real bytes (browser-reported types can lie), then store with random keys.
  const keys: string[] = [];
  const bytes: { key: string; data: ArrayBuffer; type: string }[] = [];
  for (const f of files) {
    const data = await f.arrayBuffer();
    const kind = sniffImage(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
    if (!kind) return json({ error: apiMsg(request, 'write.api.photoType') }, 400);
    const key = photoKey(kind.ext);
    keys.push(key);
    bytes.push({ key, data, type: kind.type });
  }
  const { blocks, cover_key, credit } = blocksFor(sub, keys);

  try {
    await Promise.all(bytes.map((b) => env.POSTS_BUCKET.put(b.key, b.data, { httpMetadata: { contentType: b.type } })));
    await sql(
      `insert into posts (slug, title, kind, author_name, author_email, cover_key, body, photo_rights, photo_credit) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [slugify(sub.title), sub.title, sub.kind, sub.name, sub.email, cover_key, JSON.stringify(blocks), sub.ownership, credit],
    );
    await sql(`insert into write_submissions (ip_hash) values ($1)`, [h]);
  } catch {
    await Promise.allSettled(keys.map((k) => env.POSTS_BUCKET.delete(k)));
    return json({ error: apiMsg(request, 'write.api.saveFailed') }, 500);
  }
  // Tell the editors in the background so the writer sees success the moment the piece is saved.
  const mail = notifyReviewers(env, submissionEmail({
    title: sub.title, kind: sub.kind, writerName: sub.name, writerEmail: sub.email,
    reviewUrl: `${new URL(request.url).origin}/armchair-gaffers/review`,
  }));
  if (waitUntil) waitUntil(mail);
  return json({ ok: true });
};
