import { SECTIONS, SITE } from '../config/site';

// Pages that get their own social preview image, built at build time by src/pages/og/[page].png.ts.
// Key = English path without the leading slash ('/' is 'home', nested paths use '-').
export const OG_PAGES: Record<string, { title: string; sub: string }> = {
  home: { title: SITE.name, sub: SITE.tagline },
  mens: { title: "Men's Football", sub: SECTIONS.mens.blurb },
  wofo: { title: "Women's Football", sub: SECTIONS.wofo.blurb },
  youth: { title: 'Youth Football', sub: SECTIONS.youth.blurb },
  karnataka: { title: 'Karnataka Football', sub: SECTIONS.karnataka.blurb },
  news: { title: 'All News', sub: 'Every headline in one place' },
  stats: { title: 'Stats', sub: 'League tables and top performers' },
  merch: { title: 'Merch', sub: 'Panenka Goal gear' },
  about: { title: 'About Us', sub: 'Made by fans, mainly in Kannada.' },
  'armchair-gaffers': { title: 'Outfield Talks', sub: 'Write for us. Watch our shows' },
};

// Returns the preview image path for an English page path, or null when the page has none.
export function ogImageFor(englishPath: string): string | null {
  const key = englishPath === '/' ? 'home' : englishPath.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
  return key in OG_PAGES ? `/og/${key}.png` : null;
}
