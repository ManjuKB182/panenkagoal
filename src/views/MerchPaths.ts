// Shared static paths for /merch/[slug] and /kn/merch/[slug].
import { getMerch } from '../lib/data';

export function merchPaths() {
  return getMerch().map((item) => ({ params: { slug: item.slug }, props: { item } }));
}
