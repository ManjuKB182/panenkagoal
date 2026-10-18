// One polite HTTP client for every source.
const UA = 'PanenkaGoalBot/0.1 (+https://panenkagoal.com/about)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// YouTube's feed endpoint answers a healthy channel with a spurious 404 now and then, so those retry too.
const retryable = (status: number, url: string) => status === 429 || status >= 500 || (status === 404 && url.includes('youtube.com/feeds/'));

export async function get(url: string, init: RequestInit = {}): Promise<string> {
  const retries = (init.method ?? 'GET') === 'GET' ? 3 : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return res.text();
      if (attempt >= retries || !retryable(res.status, url)) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    } catch (e) {
      if (attempt >= retries || (e as Error).message.includes(' for http')) throw e;
    }
    await sleep(attempt * 2_000);
  }
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
