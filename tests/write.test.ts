import { describe, expect, it } from 'vitest';
import { blocksFor, renderArticleHtml, sniffImage, slugify, validateEditedBlocks, validateSubmission, verifyAccess, writerIdentity, RESERVED_SLUGS } from '../src/lib/write';

const base = { title: 'Press', kind: 'fan', name: 'Asha', email: 'a@b.co', ownership: 'mine', credit: '', confirm: true, cover: null, blocks: [{ t: 'p', txt: 'Hello' }] };
const jpg = { type: 'image/jpeg', size: 5000 };

describe('validateSubmission', () => {
  it('accepts a good piece', () => expect(validateSubmission(base, []).ok).toBe(true));
  it('rejects bad email, missing confirm, empty body, credit without owner', () => {
    expect(validateSubmission({ ...base, email: 'x' }, []).ok).toBe(false);
    expect(validateSubmission({ ...base, confirm: false }, []).ok).toBe(false);
    expect(validateSubmission({ ...base, blocks: [{ t: 'p', txt: '  ' }] }, []).ok).toBe(false);
    expect(validateSubmission({ ...base, ownership: 'credit' }, []).ok).toBe(false);
  });
  it('limits photos by count, size and type', () => {
    expect(validateSubmission(base, Array(13).fill(jpg)).ok).toBe(false);
    expect(validateSubmission(base, [{ type: 'image/jpeg', size: 6 * 1024 * 1024 }]).ok).toBe(false);
    expect(validateSubmission(base, [{ type: 'image/gif', size: 5000 }]).ok).toBe(false);
    expect(validateSubmission({ ...base, blocks: [...base.blocks, { t: 'img', file: 1, cap: '' }] }, [jpg]).ok).toBe(false);
    expect(validateSubmission({ ...base, blocks: [...base.blocks, { t: 'img', file: 0, cap: 'c' }] }, [jpg]).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('builds blocks with credits', () => {
    const v = validateSubmission({ ...base, ownership: 'credit', credit: 'Ravi', cover: 0, blocks: [{ t: 'img', file: 0, cap: 'x' }, { t: 'p', txt: 'y' }] }, [jpg]);
    if (!v.ok) throw new Error('invalid');
    const r = blocksFor(v.value, ['k1']);
    expect(r.cover_key).toBe('k1');
    expect(r.blocks[0]).toEqual({ t: 'img', key: 'k1', cap: 'x', credit: 'Ravi' });
  });
  it('edited blocks cannot reference foreign photo keys', () => {
    const key = 'abcdefghij0123456789.jpg';
    expect(validateEditedBlocks([{ t: 'p', txt: 'a' }, { t: 'img', key, cap: '', credit: '' }], new Set([key]))).not.toBeNull();
    expect(validateEditedBlocks([{ t: 'p', txt: 'a' }, { t: 'img', key, cap: '', credit: '' }], new Set())).toBeNull();
  });
  it('sniffs image bytes and slugs', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0]))?.ext).toBe('jpg');
    expect(sniffImage(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(slugify('ಕನ್ನಡ!')).toMatch(/^post-[a-z0-9]{5}$/);
  });
  it('escapes HTML in articles', () => {
    const h = renderArticleHtml({ title: '<b>x</b>', kind: 'fan', author_name: 'A', cover_key: null, body: [{ t: 'p', txt: '<script>' }], photo_credit: '', published_at: new Date().toISOString() });
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<b>x');
  });
  it('Access: fails closed when not configured or the token is junk', async () => {
    const withJwt = (jwt: string) => new Request('https://x/', { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
    expect(await verifyAccess(new Request('https://x/'), {})).toBe(false);
    expect(await verifyAccess(withJwt('a.b.c'), {})).toBe(false); // header alone is never enough
    expect(await verifyAccess(withJwt('junk'), { CF_ACCESS_AUD: 'a', CF_ACCESS_TEAM_DOMAIN: 't.example' })).toBe(false);
  });
  it('Writer login: no identity without a valid writers-app token', async () => {
    const env = { CF_ACCESS_WRITER_AUD: 'w', CF_ACCESS_TEAM_DOMAIN: 't.example' };
    expect(await writerIdentity(new Request('https://x/'), env)).toBeNull();
    expect(await writerIdentity(new Request('https://x/', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' } }), {})).toBeNull();
    expect(await writerIdentity(new Request('https://x/', { headers: { 'Cf-Access-Jwt-Assertion': 'junk' } }), env)).toBeNull();
  });
  it('mine is not a post slug', () => expect(RESERVED_SLUGS).toContain('mine'));
});
