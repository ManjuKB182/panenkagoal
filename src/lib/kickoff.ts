/** "04:00 PM" -> "16:00". The calendar prints some 4 pm kickoffs as "04:00 AM"; no match kicks off before 8 am. */
export function to24(t: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(t.trim());
  if (!m) return '16:00';
  let h = Number(m[1]);
  const pm = /pm/i.test(m[3] ?? '') || (/am/i.test(m[3] ?? '') && h < 8);
  if (pm && h < 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
