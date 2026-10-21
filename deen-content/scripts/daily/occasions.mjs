// Islamic-calendar occasions for a date, using the Umm al-Qura calendar built
// into Node (Intl, "islamic-umalqura"). Local sightings can differ by a day, so
// occasion drafts are reviewed like any other post before they go out.
//   node scripts/daily/occasions.mjs [YYYY-MM-DD]   → prints today's occasions
export const OCCASIONS = ['friday', 'ramadan', 'last-ten-nights', 'dhul-hijjah-10', 'arafah', 'eid-al-fitr', 'eid-al-adha', 'muharram', 'ashura'];

export function hijri(date = new Date(), timeZone = process.env.DEEN_TZ || 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {day: 'numeric', month: 'numeric', year: 'numeric', timeZone}).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return {year: get('year'), month: get('month'), day: get('day')};
}

export function occasionsOn(date = new Date(), timeZone = process.env.DEEN_TZ || 'Asia/Kolkata') {
  const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone}).format(date);
  const {month: m, day: d} = hijri(date, timeZone);
  const out = new Set();
  if (weekday === 'Fri') out.add('friday');
  if (m === 9) out.add('ramadan');
  if (m === 9 && d >= 21) out.add('last-ten-nights');
  if (m === 12 && d >= 1 && d <= 10) out.add('dhul-hijjah-10');
  if (m === 12 && d === 9) out.add('arafah');
  if (m === 10 && d <= 3) out.add('eid-al-fitr');
  if (m === 12 && d >= 10 && d <= 13) out.add('eid-al-adha');
  if (m === 1) out.add('muharram');
  if (m === 1 && (d === 9 || d === 10)) out.add('ashura');
  return out;
}

/** The date the next post goes out (DEEN_POST_DATE overrides, for tests). */
export const postDate = () => (process.env.DEEN_POST_DATE ? new Date(`${process.env.DEEN_POST_DATE}T12:00:00Z`) : new Date());

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = process.argv[2] ? new Date(`${process.argv[2]}T12:00:00Z`) : postDate();
  const h = hijri(d);
  console.log(`${d.toISOString().slice(0, 10)} = ${h.day}/${h.month}/${h.year} AH (Umm al-Qura) → ${[...occasionsOn(d)].join(', ') || 'no occasion'}`);
}
