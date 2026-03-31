// ============================================================
// data.js — Immutable constants for the Winery Scheduler app.
// Nothing in here changes at runtime.
// ============================================================

export const SHIFTS = {
  A: { id: 'A', label: 'Shift A',          start: '11:30', end: '17:00', display: '11:30 AM – 5:00 PM' },
  B: { id: 'B', label: 'Shift B (Closing)', start: '12:30', end: '18:00', display: '12:30 PM – 6:00 PM' },
};

export const SHIFT_IDS = ['A', 'B'];

export const POSITIONS = ['Manager', 'Wine Pourer'];

// Color token for each shift type (used in calendar dots and card headers)
export const SHIFT_COLORS = {
  A:     '#2563eb',   // blue
  B:     '#7c3aed',   // purple
  EVENT: '#b45309',   // amber
};

// Position abbreviations shown in employee chips
export const POS_ABBR = {
  'Manager':     'MGR',
  'Wine Pourer': 'WP',
};

export const MAX_STAFF_PER_DAY       = 4;
export const DEFAULT_STAFF_PER_SHIFT = 2;

// Days of the week starting Monday (JS getDay() uses 0=Sun)
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
