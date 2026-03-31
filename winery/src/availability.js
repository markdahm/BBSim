// ============================================================
// availability.js — Fetches and caches employee availability
// from a publicly published Google Sheet.
//
// Expected sheet layout (published as CSV):
//   Row 1  (header): Name | 2026-04-01 | 2026-04-02 | ...
//   Row 2+ (data):   Jane Smith | Y | | Y | Y | ...
//
// Cell values (case-insensitive):
//   Any non-blank value that isn't explicitly negative = AVAILABLE
//   Accepted: Y, y, YES, X, x, ✓, 1, TRUE, true, or any checkbox TRUE
//   Explicitly unavailable: blank, N, NO, 0, FALSE, false
//
// Employees only need to indicate days they CAN work. Leaving a cell
// blank means unavailable. Any mark means available.
//
// The manager publishes the sheet via:
//   File → Share → Publish to web → CSV
// and pastes the resulting URL into Settings.
// ============================================================

import { STORE, saveStore } from './store.js';

// Values that explicitly mean "unavailable" (everything else non-blank = available)
const UNAVAILABLE_VALUES = new Set(['n', 'no', '0', 'false', 'unavailable']);

// ── Fetch & parse ──────────────────────────────────────────────────────────

/**
 * Fetches the Google Sheet, parses day-level availability, and writes to
 * STORE.availabilityCache. Throws on network or config errors.
 */
export async function fetchAvailability() {
  const url = STORE.settings.sheetsUrl?.trim();
  if (!url) throw new Error('No Google Sheet URL configured. Add it in Settings.');

  let text;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    throw new Error(`Could not reach the sheet: ${e.message}`);
  }

  _parseAndCache(text);
}

function _parseAndCache(csvText) {
  const rows = _parseCSV(csvText);
  if (rows.length < 2) return;

  const headers     = rows[0];                          // ['Name', '2026-04-01', ...]
  const dateHeaders = headers.slice(1).map(h => h.trim());

  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    const row     = rows[i];
    const rawName = (row[0] || '').trim();
    if (!rawName) continue;

    // Match employee by name (case-insensitive, trimmed)
    const emp = STORE.employees.find(
      e => e.name.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (!emp) continue;

    // Collect dates the employee is available (any non-blank non-negative cell)
    const available = [];
    for (let j = 0; j < dateHeaders.length; j++) {
      const dateStr = dateHeaders[j];
      if (!dateStr) continue;
      const val = (row[j + 1] || '').trim().toLowerCase();
      if (val !== '' && !UNAVAILABLE_VALUES.has(val)) {
        available.push(dateStr);
      }
    }

    STORE.availabilityCache[emp.id] = { lastFetched: now, available };
  }

  STORE.settings.lastFetched = now;
  saveStore();
}

/** Minimal CSV parser — handles quoted fields with embedded commas. */
function _parseCSV(text) {
  const rows = [];
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

// ── Availability queries ───────────────────────────────────────────────────

/**
 * Returns true  if the employee is available on the given date.
 * Returns false if they explicitly marked unavailable.
 * Returns null  if no sheet data exists for them at all (unknown).
 * The scheduler treats null as available (benefit of the doubt).
 */
export function isAvailableOnDay(empId, iso) {
  const cache = STORE.availabilityCache[empId];
  if (!cache) return null;                        // no data
  return cache.available.includes(iso);
}

export function hasAvailabilityData() {
  return Object.keys(STORE.availabilityCache).length > 0;
}

export function getLastFetchedLabel() {
  const ts = STORE.settings.lastFetched;
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
