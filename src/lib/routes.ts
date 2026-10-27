// Static paths for the section pages. Both src/pages/[section].astro and src/pages/kn/[section].astro use these.
import type { SectionKey } from '../config/site';

export const SECTION_PAGES = ['mens', 'wofo', 'youth'] as const satisfies readonly Exclude<SectionKey, 'karnataka'>[];
export type SectionPage = (typeof SECTION_PAGES)[number];

export function sectionPaths() {
  return SECTION_PAGES.map((section) => ({ params: { section } }));
}
