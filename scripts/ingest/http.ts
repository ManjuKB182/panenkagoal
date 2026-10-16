// One polite HTTP client for every source.
const UA = 'PanenkaGoalBot/0.1 (+https://panenkagoal.com/about)';

export async function get(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

export const getJson = async (url: string, init?: RequestInit) => JSON.parse(await get(url, init));

/** WordPress admin-ajax style form POST (used by the IFL site). */
export const postForm = (url: string, form: Record<string, string>) =>
  getJson(url, {
    method: 'POST',
    body: new URLSearchParams(form),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const postJson = (url: string, body: unknown) =>
  getJson(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
