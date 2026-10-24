import { getLocale, t, type Locale, type MessageKey } from '../../../src/i18n';

// The API answers in the language of the page that called it: a /kn/ page's Referer gets Kannada messages.
// Only the error text changes; status codes and JSON shape stay the same.
export function requestLocale(request: Request): Locale {
  const referer = request.headers.get('referer');
  if (!referer) return 'en';
  try {
    return getLocale(new URL(referer).pathname);
  } catch {
    return 'en';
  }
}

export const apiMsg = (request: Request, key: MessageKey) => t(requestLocale(request), key);
