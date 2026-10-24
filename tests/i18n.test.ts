import { describe, expect, it } from 'vitest';
import { digits, englishPath, getLocale, localePath, MESSAGES, t } from '../src/i18n';

const { en, kn } = MESSAGES as { en: Record<string, string>; kn: Record<string, string> };

describe('dictionaries', () => {
  it('kn has exactly the same keys as en', () => {
    expect(Object.keys(kn).sort()).toEqual(Object.keys(en).sort());
  });

  it('no Kannada string is empty', () => {
    for (const [key, value] of Object.entries(kn)) expect(value.trim(), key).not.toBe('');
  });
});

describe('routing', () => {
  it('reads the locale from the URL', () => {
    expect(getLocale('/mens')).toBe('en');
    expect(getLocale('/kn')).toBe('kn');
    expect(getLocale('/kn/mens')).toBe('kn');
    expect(getLocale('/knowledge')).toBe('en');
  });

  it('builds the same page in the other locale', () => {
    expect(localePath('en', '/mens')).toBe('/mens');
    expect(localePath('kn', '/mens')).toBe('/kn/mens');
    expect(localePath('kn', '/')).toBe('/kn');
    expect(englishPath('/kn/mens')).toBe('/mens');
    expect(englishPath('/kn')).toBe('/');
  });
});

describe('t and digits', () => {
  it('substitutes params and falls back to English', () => {
    expect(t('en', 'time.minutesAgo', { n: 5 })).toBe('5m ago');
    expect(t('kn', 'time.minutesAgo', { n: 5 })).toBe('5 ನಿಮಿಷಗಳ ಹಿಂದೆ');
  });

  it('uses Kannada numerals only for kn', () => {
    expect(digits('en', '12:30')).toBe('12:30');
    expect(digits('kn', '12:30')).toBe('೧೨:೩೦');
  });
});
