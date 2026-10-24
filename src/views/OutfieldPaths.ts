// Shared static paths for /armchair-gaffers/[show] and /kn/armchair-gaffers/[show].
import { getShows } from '../lib/data';

export function outfieldShowPaths() {
  return getShows().map((show) => ({ params: { show: show.slug }, props: { show } }));
}
