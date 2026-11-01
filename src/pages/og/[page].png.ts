import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG_PAGES } from '../../lib/og';

// Build-time social preview images (1200x630). One PNG per entry in OG_PAGES, written to /og/<page>.png.
const FONT = readFileSync(join(process.cwd(), 'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff'));

export function getStaticPaths() {
  return Object.keys(OG_PAGES).map((page) => ({ params: { page } }));
}

export async function GET({ params }: { params: { page: string } }) {
  const { title, sub } = OG_PAGES[params.page];
  // Satori takes plain element trees; every element with several children needs display: flex.
  const tree = {
    type: 'div',
    props: {
      style: {
        width: 1200, height: 630, display: 'flex', flexDirection: 'column',
        padding: '72px 72px 88px', background: '#121417', color: '#f0f1f3', fontFamily: 'Barlow',
        borderBottom: '16px solid #c8102e', boxSizing: 'border-box',
      },
      children: [
        { type: 'div', props: { style: { display: 'flex', fontSize: 34, fontWeight: 700, color: '#ffd500' }, children: 'Panenka Goal' } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto' },
            children: [
              { type: 'div', props: { style: { display: 'flex', fontSize: 92, fontWeight: 700, lineHeight: 1.05 }, children: title } },
              { type: 'div', props: { style: { display: 'flex', fontSize: 34, opacity: 0.8 }, children: sub } },
            ],
          },
        },
      ],
    },
  };
  const svg = await satori(tree as any, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Barlow', data: FONT, weight: 700, style: 'normal' }],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
}
