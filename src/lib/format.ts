const IST = 'Asia/Kolkata';

export function timeAgo(iso: string, now = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(iso);
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST });

export const kickoffTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });

export const longDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST,
  }) + ' IST';

/** yyyy-mm-dd in IST, for grouping fixtures by day. */
export const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
