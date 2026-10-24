// Locale helpers. English lives at the existing URLs; Kannada lives under /kn/.
import en from './en';
import kn from './kn';
// Per-area dictionaries. Each file exports { en, kn } and must keep the same keys in both.
import sections from './pages/sections';
import stats from './pages/stats';
import karnataka from './pages/karnataka';
import about from './pages/about';
import match from './pages/match';
import outfield from './pages/outfield';
import write from './pages/write';

export const LOCALES = ['en', 'kn'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const AREAS = [sections, stats, karnataka, about, match, outfield, write];
const EN = { ...en, ...Object.assign({}, ...AREAS.map((a) => a.en)) };
const KN = { ...kn, ...Object.assign({}, ...AREAS.map((a) => a.kn)) };

export type MessageKey = keyof typeof EN & string;
/** Every dictionary, for the parity test. */
export const MESSAGES = { en: EN, kn: KN } as const;

const DICTS: Record<Locale, Partial<Record<string, string>>> = { en: EN, kn: KN };

/** Reads the locale from a URL: /kn/... is Kannada, everything else English. */
export function getLocale(url: URL | string): Locale {
  const path = cleanPath(typeof url === 'string' ? url : url.pathname);
  return path === '/kn' || path.startsWith('/kn/') ? 'kn' : 'en';
}

/** Drops the .html / index.html that the static build can leave in Astro.url. */
function cleanPath(pathname: string): string {
  return pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
}

/** Looks up a UI string. Falls back to English when a Kannada string is missing. */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  let text = (DICTS[locale][key as string] ?? EN[key]);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Turns an English path into the same page in the given locale. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'en') return clean;
  return clean === '/' ? '/kn' : `/kn${clean}`;
}

/** Removes the /kn prefix, giving the English path of the current page. */
export function englishPath(pathname: string): string {
  const clean = cleanPath(pathname);
  if (clean === '/kn' || clean === '/kn/' || clean === '/') return '/';
  return clean.startsWith('/kn/') ? clean.slice(3) : clean;
}

const KN_DIGITS = ['೦', '೧', '೨', '೩', '೪', '೫', '೬', '೭', '೮', '೯'];

/** Kannada numerals (೧೨೩) for kn; Latin digits for en. */
export function digits(locale: Locale, value: string | number): string {
  const text = String(value);
  return locale === 'kn' ? text.replace(/[0-9]/g, (d) => KN_DIGITS[Number(d)]) : text;
}

/** Team names: Kannada when known (see teams.ts), English otherwise. */
export { groupName, seasonText, teamName } from './teams';
export { personName } from './people';
