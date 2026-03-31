// ================================================================
// Data.gs — All sheet read/write operations.
//
// Each function is the single access point for its tab, keeping
// I/O isolated from scheduling logic.
// ================================================================

// ── Employees ─────────────────────────────────────────────────────────────────
// Returns [{ name, position, active }] from the Employees tab.

function getEmployees() {
  const sheet = _tab(TAB.EMPLOYEES);
  const rows  = sheet.getDataRange().getValues().slice(1); // skip header
  return rows
    .filter(r => r[0])
    .map(r => ({
      name:     String(r[0]).trim(),
      position: String(r[1]).trim(),
      active:   r[2] === true || String(r[2]).toLowerCase() === 'true',
    }));
}

// ── Availability ──────────────────────────────────────────────────────────────
// Returns { 'Jane Smith': ['2026-04-01', '2026-04-03', ...] }
// Dates are ISO strings (YYYY-MM-DD). Only available dates are listed.

function getAvailability() {
  const sheet = _tab(TAB.AVAILABILITY);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  // Row 0 = headers: [Name, date1, date2, ...]
  // Dates may come back as Date objects if formatted as dates in Sheets
  const dateHeaders = data[0].slice(1).map(h => _toIso(h));

  const result = {};
  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const name = String(row[0] || '').trim();
    if (!name || name.startsWith('→')) continue; // skip instruction rows

    const available = [];
    for (let j = 0; j < dateHeaders.length; j++) {
      const dateStr = dateHeaders[j];
      if (!dateStr) continue;
      const val = String(row[j + 1] || '').trim().toLowerCase();
      if (val && !_UNAVAILABLE.has(val)) available.push(dateStr);
    }
    result[name] = available;
  }
  return result;
}

const _UNAVAILABLE = new Set(['n', 'no', '0', 'false', 'unavailable', '']);

// ── Settings ──────────────────────────────────────────────────────────────────
// Returns { staffPerShift: 2, scheduleMonth: '2026-04' }

function getSettings() {
  const sheet = _tab(TAB.SETTINGS);
  const rows  = sheet.getDataRange().getValues().slice(1);
  const map   = {};
  rows.forEach(r => { if (r[0]) map[String(r[0]).trim()] = r[1]; });
  return {
    staffPerShift: Number(map['Target Staff Per Shift']) || 2,
    scheduleMonth: String(map['Schedule Month'] || '').trim(),
  };
}

// ── History ───────────────────────────────────────────────────────────────────
// getFairnessData returns { 'Jane Smith': ['2026-03-01', '2026-03-05', ...] }
// for dates within the 4-week lookback window before monthStart.
// Each date appears at most once (days, not shifts).

function getFairnessData(monthStart) {
  const sheet = _tab(TAB.HISTORY);
  const rows  = sheet.getDataRange().getValues().slice(1);
  if (!rows.length) return {};

  const windowStart = _addDays(monthStart, -28); // 4 weeks back
  const windowEnd   = _addDays(monthStart, -1);
  const wsIso = _toIso(windowStart);
  const weIso = _toIso(windowEnd);

  const result = {};
  rows.forEach(r => {
    const name = String(r[0] || '').trim();
    const iso  = _toIso(r[1]);
    if (!name || !iso) return;
    if (iso < wsIso || iso > weIso) return;  // outside window
    if (!result[name]) result[name] = new Set();
    result[name].add(iso);
  });

  // Convert Sets to plain arrays
  Object.keys(result).forEach(n => { result[n] = [...result[n]]; });
  return result;
}

// ── History write ─────────────────────────────────────────────────────────────
// Replaces auto-generated rows for the given month, appends new ones.

function replaceAutoInHistory(monthStr, schedule) {
  // 1. Remove existing auto rows for this month
  const sheet = _tab(TAB.HISTORY);
  _deleteRowsWhere(sheet, r => String(r[4]) === monthStr && String(r[3]) === 'auto');

  // 2. Append new auto assignments
  const newRows = [];
  Object.entries(schedule).forEach(([iso, day]) => {
    SHIFTS.forEach(({ id }) => {
      (day[id] || []).forEach(({ name }) => {
        newRows.push([name, iso, id, 'auto', monthStr]);
      });
    });
  });

  if (newRows.length) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
  }
}

// Removes all rows (auto and manual) for a given month from History.
function clearMonthFromHistory(monthStr) {
  const sheet = _tab(TAB.HISTORY);
  _deleteRowsWhere(sheet, r => String(r[4]) === monthStr);
}

// ── Schedule tab: clear ───────────────────────────────────────────────────────
function clearScheduleTab(monthStart) {
  const sheet = _tab(TAB.SCHEDULE);
  sheet.clearContents();
  sheet.clearFormats();
  sheet.getRange('A1').setValue('Schedule cleared. Run Auto-Schedule Month to regenerate.')
    .setFontColor('#888').setFontStyle('italic');
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _tab(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Tab "${name}" not found. Run First-time setup from the menu.`);
  return sheet;
}

// Convert a Date or date-string to 'YYYY-MM-DD' in the script's timezone.
function _toIso(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val).trim().slice(0, 10); // take first 10 chars of any string
}

function _addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function _getDaysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Delete rows from a sheet where predicate(rowValues) returns true.
// Iterates bottom-up so row indices stay valid.
function _deleteRowsWhere(sheet, predicate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (predicate(data[i])) sheet.deleteRow(i + 2);
  }
}
