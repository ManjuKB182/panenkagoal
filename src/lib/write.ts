// Shared logic for the Write tab (fan and analyst posts): validation, rendering, spam checks and the
// Cloudflare Access check. Used by the Pages Functions in /functions and by tests/write.test.ts.
//
// Why Functions and not a rebuild: the site is static, but published posts must appear the moment an
// editor approves them. The list page is a static shell that fetches /api/write/posts, and each article
// URL (/armchair-gaffers/write/<slug>) is answered by a Pages Function that reads Neon and injects the
// article into the static shell with HTMLRewriter, so it is real HTML for search engines and needs no deploy.

import { neon } from '@neondatabase/serverless';

export type PostKind = 'fan' | 'analyst';
export type PostStatus = 'pending' | 'published' | 'sent_back';
export type Block =
  | { t: 'p'; txt: string }
  | { t: 'img'; key: string; cap: string; credit: string };

export interface Env {
  DATABASE_URL?: string;
  POSTS_BUCKET?: any; // R2 bucket binding
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> };
  TURNSTILE_SECRET?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_WRITER_AUD?: string; // audience of the second Access app that signs writers in
  IP_SALT?: string;
}

export const LIMITS = {
  title: 140, name: 80, email: 200, credit: 200, cap: 300, para: 8000,
  blocks: 60, photos: 12, photoBytes: 5 * 1024 * 1024, perHour: 5, note: 1000,
};
export const RESERVED_SLUGS = ['submit', 'new', 'review', 'mine'];
const IMG_TYPES = ['image/jpeg', 'image/webp', 'image/png'];

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export function getSql(env: Env) {
  if (!env.DATABASE_URL) return null;
  const sql = neon(env.DATABASE_URL);
  return (text: string, params: unknown[] = []) => sql.query(text, params) as Promise<any[]>;
}

// ---------- small helpers ----------
export function slugify(title: string): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${base || 'post'}-${randomId(5)}`;
}
export function randomId(len: number): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}
export function photoKey(ext: string): string {
  return `${randomId(10)}${randomId(10)}.${ext}`;
}
export const PHOTO_KEY_RE = /^[a-z0-9]{20}\.(jpg|webp|png)$/;
export function readMinutes(blocks: Block[]): number {
  const words = blocks.filter((b) => b.t === 'p').map((b) => (b as any).txt.split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);
  return Math.max(1, Math.round(words / 200));
}
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Detect the real image type from its first bytes (the browser-supplied type is not trusted). */
export function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' };
  return null;
}

// ---------- submission validation ----------
export interface FileMeta { type: string; size: number }
export interface SubmissionInput {
  title: string; kind: PostKind; name: string; email: string;
  ownership: 'mine' | 'credit'; credit: string;
  /** index into the uploaded files, or null */
  cover: number | null;
  /** paragraphs, and photos referencing an uploaded file by index */
  blocks: ({ t: 'p'; txt: string } | { t: 'img'; file: number; cap: string })[];
}

/** Returns the cleaned submission, or an error message fit to show the writer. */
export function validateSubmission(raw: any, files: FileMeta[]): { ok: true; value: SubmissionInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!raw || typeof raw !== 'object') return fail('Something went wrong. Please try again.');
  const title = clean(raw.title, LIMITS.title);
  const name = clean(raw.name, LIMITS.name);
  const email = clean(raw.email, LIMITS.email);
  const kind = raw.kind === 'analyst' ? 'analyst' : raw.kind === 'fan' ? 'fan' : null;
  const ownership = raw.ownership === 'credit' ? 'credit' : 'mine';
  const credit = clean(raw.credit, LIMITS.credit);
  if (!title) return fail('Please add a title.');
  if (!name) return fail('Please add your name.');
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.');
  if (!kind) return fail('Choose Fan or Analyst.');
  if (raw.confirm !== true) return fail('Please tick the photo confirmation box.');
  if (ownership === 'credit' && !credit) return fail('Please name the owner of the photos.');
  if (files.length > LIMITS.photos) return fail(`You can add up to ${LIMITS.photos} photos.`);
  for (const f of files) {
    if (!IMG_TYPES.includes(f.type)) return fail('Photos must be JPG, PNG or WebP.');
    if (f.size > LIMITS.photoBytes) return fail('Each photo must be under 5 MB.');
    if (f.size < 100) return fail('One of the photos looks empty. Please choose it again.');
  }
  if (!Array.isArray(raw.blocks) || raw.blocks.length > LIMITS.blocks) return fail('The piece is too long.');
  const blocks: SubmissionInput['blocks'] = [];
  for (const b of raw.blocks) {
    if (b?.t === 'p') {
      const txt = clean(b.txt, LIMITS.para);
      if (txt) blocks.push({ t: 'p', txt });
    } else if (b?.t === 'img') {
      const file = Number(b.file);
      if (!Number.isInteger(file) || file < 0 || file >= files.length) return fail('A photo is missing. Please choose it again.');
      blocks.push({ t: 'img', file, cap: clean(b.cap, LIMITS.cap) });
    } else return fail('Something went wrong. Please try again.');
  }
  if (!blocks.some((b) => b.t === 'p')) return fail('Please write at least one paragraph.');
  let cover: number | null = null;
  if (raw.cover !== null && raw.cover !== undefined) {
    cover = Number(raw.cover);
    if (!Number.isInteger(cover) || cover < 0 || cover >= files.length) return fail('The cover photo is missing. Please choose it again.');
  }
  return { ok: true, value: { title, kind, name, email, ownership, credit, cover, blocks } };
}

/** Editors can change text, captions and order, but never point a photo at a key that is not in the post's own photos. */
export function validateEditedBlocks(raw: unknown, allowedKeys: Set<string>): Block[] | null {
  if (!Array.isArray(raw) || raw.length > LIMITS.blocks) return null;
  const out: Block[] = [];
  for (const b of raw as any[]) {
    if (b?.t === 'p') {
      const txt = clean(b.txt, LIMITS.para);
      if (txt) out.push({ t: 'p', txt });
    } else if (b?.t === 'img') {
      if (typeof b.key !== 'string' || !PHOTO_KEY_RE.test(b.key) || !allowedKeys.has(b.key)) return null;
      out.push({ t: 'img', key: b.key, cap: clean(b.cap, LIMITS.cap), credit: clean(b.credit, LIMITS.credit) });
    } else return null;
  }
  return out.some((b) => b.t === 'p') ? out : null;
}
export const cleanText = clean;

export function blocksFor(sub: SubmissionInput, keys: string[]): { blocks: Block[]; cover_key: string | null; credit: string } {
  const credit = sub.ownership === 'credit' ? sub.credit : `Photo: ${sub.name}`;
  return {
    credit,
    cover_key: sub.cover === null ? null : keys[sub.cover],
    blocks: sub.blocks.map((b): Block => (b.t === 'p' ? b : { t: 'img', key: keys[b.file], cap: b.cap, credit })),
  };
}

// ---------- rendering ----------
export const KIND_LABEL: Record<string, string> = { fan: 'Fan', analyst: 'Analyst' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function renderArticleHtml(p: { title: string; kind: string; author_name: string; cover_key: string | null; body: Block[]; photo_credit: string; published_at: string }): string {
  const fig = (key: string, cap: string, credit: string) =>
    `<figure><img src="/api/write/photo/${esc(key)}" alt="${esc(cap)}" loading="lazy">` +
    (cap || credit ? `<figcaption>${cap ? esc(cap) : ''}${credit ? `<i>${esc(credit)}</i>` : ''}</figcaption>` : '') + '</figure>';
  return `<article class="wr-art"><p class="eyebrow">${esc(KIND_LABEL[p.kind] ?? 'Fan')} analysis</p><h1>${esc(p.title)}</h1>` +
    `<div class="wr-by"><span class="wr-tag${p.kind === 'analyst' ? ' an' : ''}">${esc(KIND_LABEL[p.kind] ?? 'Fan')}</span> ${esc(p.author_name)} · ${readMinutes(p.body)} min read · ${fmtDate(p.published_at)}</div>` +
    (p.cover_key ? fig(p.cover_key, '', p.photo_credit) : '') +
    p.body.map((b) => (b.t === 'p' ? `<p>${esc(b.txt)}</p>` : fig(b.key, b.cap, b.credit))).join('') +
    `<p class="wr-note">Photos remain the property of their owner.</p>` +
    `<div class="wr-card" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span><b>Write for Outfield Talks</b><br><span class="wr-note">Send your own breakdown. Photos welcome.</span></span><a class="btn" href="/armchair-gaffers/write/submit">Submit your piece</a></div></article>`;
}

// ---------- spam checks ----------
export async function verifyTurnstile(env: Env, token: string, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true; // not configured (local dev): skip
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return !!((await r.json()) as any).success;
  } catch { return false; }
}
export async function ipHash(env: Env, ip: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_SALT ?? 'pg'}:${ip}`));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Cloudflare Access ----------
const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
let certCache: { at: number; keys: any[] } | null = null;

/**
 * Verifies the Cloudflare Access JWT in Cf-Access-Jwt-Assertion (signature, issuer, audience, expiry) and returns
 * its payload, or null. Fails closed: without the audience and team domain nothing is accepted, because writers
 * can sign in with any email, so a bare "header exists" check would let any writer into the editor tools.
 */
async function verifyJwt(request: Request, env: Env, expectedAud: string | undefined): Promise<any | null> {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt || !expectedAud || !env.CF_ACCESS_TEAM_DOMAIN) return null;
  try {
    const [h, p, s] = jwt.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64u(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64u(p)));
    const team = env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (payload.iss !== `https://${team}`) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(expectedAud)) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (!certCache || Date.now() - certCache.at > 3600_000) {
      const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
      certCache = { at: Date.now(), keys: ((await r.json()) as any).keys ?? [] };
    }
    const jwk = certCache.keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? payload : null;
  } catch { return null; }
}

/** True when the request came through the editors' Access app (CF_ACCESS_AUD). */
export async function verifyAccess(request: Request, env: Env): Promise<boolean> {
  return (await verifyJwt(request, env, env.CF_ACCESS_AUD)) !== null;
}

/** The signed-in writer (verified email from the writers' Access app, CF_ACCESS_WRITER_AUD) or null. Who may sign in is set by the Access policy's Include > Emails list. */
export async function writerIdentity(request: Request, env: Env): Promise<{ email: string } | null> {
  const payload = await verifyJwt(request, env, env.CF_ACCESS_WRITER_AUD);
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  return EMAIL_RE.test(email) ? { email } : null;
}
export const signInNeeded = () => json({ error: 'Please sign in to continue.' }, 401);
export const denied = () => new Response('Editors only. Sign in through Cloudflare Access.', { status: 403, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
