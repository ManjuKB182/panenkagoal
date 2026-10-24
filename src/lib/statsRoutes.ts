// Static paths for /stats/<slug> and /kn/stats/<slug>. Both page files call this.
import { COMPETITIONS } from '../config/competitions';

export function statsLeaguePaths() {
  return COMPETITIONS.map((comp) => ({ params: { slug: comp.slug }, props: { comp } }));
}
