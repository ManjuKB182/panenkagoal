import { getSql, json, type Env } from '../../../../src/lib/write';

// POST /api/write/view/<slug>: counts one view of a published piece. The article page calls it once per tab.
export const onRequestPost = async ({ env, params }: { env: Env; params: { slug: string } }) => {
  const sql = getSql(env);
  if (!sql) return json({ error: 'unavailable' }, 503);
  try {
    const rows = await sql(`update posts set views = views + 1 where slug = $1 and status = 'published' returning views`, [String(params.slug)]);
    if (!rows.length) return json({ error: 'not found' }, 404);
    return json({ views: rows[0].views });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
};
