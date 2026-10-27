import { digits, t, type Locale } from '../i18n';

const IST = 'Asia/Kolkata';
// Kannada dates use Kannada month names; digits() turns the numerals into ೧೨೩ for kn.
const intlLocale = (locale: Locale) => (locale === 'kn' ? 'kn-IN' : 'en-IN');

export function timeAgo(iso: string, now = new Date(), locale: Locale = 'en'): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t(locale, 'time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return t(locale, 'time.minutesAgo', { n: digits(locale, m) });
  const h = Math.round(m / 60);
  if (h < 24) return t(locale, 'time.hoursAgo', { n: digits(locale, h) });
  const d = Math.round(h / 24);
  if (d < 7) return t(locale, 'time.daysAgo', { n: digits(locale, d) });
  return shortDate(iso, locale);
}

export const shortDate = (iso: string, locale: Locale = 'en') =>
  digits(locale, new Date(iso).toLocaleDateString(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: IST }));

export const kickoffTime = (iso: string, locale: Locale = 'en') =>
  digits(locale, new Date(iso).toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST }));

export const longDateTime = (iso: string, locale: Locale = 'en') =>
  digits(locale, new Date(iso).toLocaleString(intlLocale(locale), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST,
  })) + ' ' + t(locale, 'time.ist');

/** yyyy-mm-dd in IST, for grouping fixtures by day. */
export const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
