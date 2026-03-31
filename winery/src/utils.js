// ============================================================
// utils.js — Pure helper functions. No imports, no side effects.
// ============================================================

/** Return YYYY-MM-DD string for a Date, using local time. */
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local Date (no timezone shift). */
export function parseIso(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Return a new Date offset by n days. */
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Return the Monday of the week containing d. */
export function startOfWeek(d) {
  const r = new Date(d);
  const dow = r.getDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  r.setDate(r.getDate() + diff);
  return r;
}

/** "Apr 5, 2026" */
export function fmtDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Monday, April 5" */
export function fmtDateLong(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Return the first day of the month containing d. */
export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Number of days in the month containing d. */
export function getDaysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** "April 2026" */
export function fmtMonthYear(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Stable, unique-ish ID. Not cryptographic — fine for local state. */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Clamp n between lo and hi. */
export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
