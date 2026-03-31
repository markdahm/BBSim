// ============================================================
// store.js — Single source of truth for all app state.
//
// Shape of STORE.schedule[isoDate]:
//   {
//     A:      { assignments: [{ empId, source }], warned: false },
//     B:      { assignments: [{ empId, source }], warned: false },
//     events: [{ id, label, staffNeeded, assignments: [{ empId, source }], notes }]
//   }
//
// source: 'auto'   — placed by the scheduler
//         'manual' — placed (or edited) by the manager
//
// STORE.availabilityCache[empId]:
//   { lastFetched: timestamp, availability: [{ date: 'YYYY-MM-DD', shifts: ['A','B'] }] }
// ============================================================

import { DEFAULT_STAFF_PER_SHIFT } from './data.js';

const STORE_KEY = 'winery-v1';

export const STORE = {
  employees:         [],   // Employee[]
  schedule:          {},   // { 'YYYY-MM-DD': DayEntry }
  availabilityCache: {},   // { empId: CacheEntry }
  settings: {
    sheetsUrl:       '',
    staffPerShift:   DEFAULT_STAFF_PER_SHIFT,
    lastFetched:     null, // timestamp
  },
};

// ── Persistence ────────────────────────────────────────────────────────────

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Deep-merge so new keys added to STORE shape survive upgrades
    if (parsed.employees)         STORE.employees         = parsed.employees;
    if (parsed.schedule)          STORE.schedule          = parsed.schedule;
    if (parsed.availabilityCache) STORE.availabilityCache = parsed.availabilityCache;
    if (parsed.settings)          Object.assign(STORE.settings, parsed.settings);
  } catch (e) {
    console.warn('[store] Could not load:', e);
  }
}

export function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORE));
  } catch (e) {
    console.warn('[store] Could not save:', e);
  }
}

// ── Day entry helpers ──────────────────────────────────────────────────────

/** Return (or lazily create) the schedule entry for a given ISO date. */
export function getScheduleDay(iso) {
  if (!STORE.schedule[iso]) {
    STORE.schedule[iso] = {
      A:      { assignments: [], warned: false },
      B:      { assignments: [], warned: false },
      events: [],
    };
  }
  return STORE.schedule[iso];
}

// ── Employee helpers ───────────────────────────────────────────────────────

export function getEmployee(empId) {
  return STORE.employees.find(e => e.id === empId) ?? null;
}

export function getActiveEmployees() {
  return STORE.employees.filter(e => e.active !== false);
}
