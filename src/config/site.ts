// Site-wide settings. Edit here, not in components.

export const SITE = {
  name: 'Panenka Goal',
  nameKn: 'ಪನೇಂಕ GOAL',
  url: 'https://panenkagoal.com',
  tagline: 'Indian football talk, in Kannada',
  taglineKn: 'ನಮ್ಮ ಜೊತೆ, ಕನ್ನಡದಲ್ಲಿ FOOTBALL ಮಾತುಕತೆ',
  description:
    "Podcasts, tables and news on Indian football, Karnataka football, youth football and women's football. Made by fans, mainly in Kannada.",
  // WhatsApp number for merch orders: country code + number, digits only (e.g. 919876543210).
  // Leave empty until the merch section goes live; order buttons stay hidden without it.
  whatsapp: '',
  socials: {
    youtube: 'https://www.youtube.com/@Panenka_goal',
    instagram: 'https://www.instagram.com/panenka_goal_',
    x: 'https://x.com/panenka_goal',
  },
  youtubeChannelId: 'UCCRYLPSwKjeySyxKJgGKibA',
  islChannelId: 'UCJk-aQ7NZtqYtpcqKDt_vZg',
} as const;

export type SectionKey = 'mens' | 'wofo' | 'youth' | 'karnataka';

// `title` is the short nav label; `heading` (when set) is the page heading.
export const SECTIONS: Record<SectionKey, { title: string; heading?: string; titleKn: string; blurb: string }> = {
  mens: {
    title: "Men's",
    titleKn: 'ಪುರುಷರ',
    blurb: 'ISL, IFL, I-League 2, Santosh Trophy and the Blue Tigers.',
  },
  wofo: {
    title: "Women's",
    heading: "Women's Football",
    titleKn: 'ಮಹಿಳಾ',
    blurb: "Women's football: IWL, IWL 2, the Karnataka Women's League and the national team.",
  },
  youth: {
    title: 'Youth',
    titleKn: 'ಯುವ',
    blurb: 'AIFF Elite, Junior and Sub-Junior leagues, RFDL, and the pathway into academies.',
  },
  karnataka: {
    title: 'Karnataka',
    titleKn: 'ಕರ್ನಾಟಕ',
    blurb: 'KSFA Super Division, KWL, Bengaluru clubs and the fight for our stadiums.',
  },
};

// `blurb` is the one-line description shown in the phone menu.
export const NAV = [
  { href: '/mens', label: "Men's", blurb: 'Fixtures, tables and news' },
  { href: '/wofo', label: "Women's", blurb: 'IWL, IWL 2 and the national team' },
  { href: '/youth', label: 'Youth', blurb: 'U18, U15 and U13 leagues' },
  { href: '/karnataka', label: 'Karnataka', blurb: 'Academies, players, legends and history' },
  { href: '/stats', label: 'Stats', blurb: 'League tables and top performers' },
  { href: '/armchair-gaffers', label: 'Armchair Gaffers', blurb: 'Watch our shows. Write for us' },
  { href: '/news', label: 'All news', blurb: 'Every headline in one place' },
  { href: '/merch', label: 'Merch', blurb: 'Panenka Goal gear' },
] as const;

// Files Panenka's own videos under a section when the TITLE mentions it (hashtags are ignored,
// because almost every title carries #indianfootball). Pin extra videos per section in data/section-videos.json.
export const SECTION_KEYWORDS: Record<SectionKey, RegExp> = {
  mens: /\b(isl|ifl|i-?league|blue tigers|india|santosh|super cup|durand|mohun bagan|east bengal|kerala blasters)\b/i,
  wofo: /\b(wofo|women'?s?|girls'?|iwl|kwl|kickstart|kemp ?fc|blue tigress(es)?|mithila)\b/i,
  youth: /\b(youth|rfdl|rfydl|u-?1[3-8]|u-?2[03]|academy|grassroots|junior|elite league|scams?)\b/i,
  karnataka: /\b(karnataka|bdfa|ksfa|bengaluru|bangalore|bfc|sc bengaluru|south united|kannada|bfs|kanteerava)\b/i,
};
