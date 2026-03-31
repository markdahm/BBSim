// ================================================================
// Render.gs — Writes the formatted Schedule tab.
//
// Output layout (one row per day of the month):
//
//   Row 1  │ APRIL 2026 — WINERY SCHEDULE          (merged, wine red)
//   Row 2  │ Date │ Shift A · 11:30–5 │ Shift B · 12:30–6 │ Events
//   Row 3+ │ Tue, Apr 1 │ Jane (MGR)↵Tom │ Maria (MGR) │
//
// Color coding:
//   Shift A column  → light blue
//   Shift B column  → light purple
//   Weekend rows    → light gray date cell
//   Warning rows    → orange (no manager)
// ================================================================

// ── Column indices (1-based for Sheets API) ───────────────────────────────────
const COL_DATE    = 1;
const COL_SHIFT_A = 2;
const COL_SHIFT_B = 3;
const COL_EVENTS  = 4;
const NUM_COLS    = 4;

// ── Colours ───────────────────────────────────────────────────────────────────
const COLOR = {
  HEADER_BG:   '#6d2b2b',  // wine red
  HEADER_FG:   '#ffffff',
  COL_HEAD_BG: '#f3f0ed',
  SHIFT_A_BG:  '#dbeafe',  // light blue
  SHIFT_B_BG:  '#ede9fe',  // light purple
  EVENTS_BG:   '#fef9f0',  // warm white
  WEEKEND_BG:  '#f5f5f5',
  WARN_BG:     '#fed7aa',  // orange — no manager
  DATE_BG:     '#fafafa',
  LINE:        '#e5e5ea',
};

// ── Main render function ──────────────────────────────────────────────────────
function renderSchedule(monthStart, schedule, settings) {
  const sheet = _tab(TAB.SCHEDULE);
  sheet.clearContents();
  sheet.clearFormats();

  const days     = _getDaysInMonth(monthStart);
  const totalRows = days + 2; // 1 title + 1 header + N day rows

  // ── Row 1: title ──────────────────────────────────────────────
  const monthLabel = Utilities.formatDate(monthStart, Session.getScriptTimeZone(), 'MMMM yyyy').toUpperCase();
  const titleRange = sheet.getRange(1, 1, 1, NUM_COLS);
  titleRange.merge()
    .setValue(`${monthLabel} — WINERY SCHEDULE`)
    .setBackground(COLOR.HEADER_BG)
    .setFontColor(COLOR.HEADER_FG)
    .setFontWeight('bold')
    .setFontSize(13)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);

  // ── Row 2: column headers ──────────────────────────────────────
  sheet.getRange(2, COL_DATE,    1, 1).setValue('Date');
  sheet.getRange(2, COL_SHIFT_A, 1, 1).setValue(`Shift A · ${SHIFT_A.display}`);
  sheet.getRange(2, COL_SHIFT_B, 1, 1).setValue(`Shift B · ${SHIFT_B.display}`);
  sheet.getRange(2, COL_EVENTS,  1, 1).setValue('Events / Notes');

  const headRange = sheet.getRange(2, 1, 1, NUM_COLS);
  headRange.setBackground(COLOR.COL_HEAD_BG)
    .setFontWeight('bold')
    .setFontSize(10)
    .setBorder(true, true, true, true, false, false, COLOR.LINE, SpreadsheetApp.BorderStyle.SOLID);

  // ── Rows 3+: one per day ───────────────────────────────────────
  for (let i = 0; i < days; i++) {
    const date    = _addDays(monthStart, i);
    const iso     = _toIso(date);
    const row     = i + 3;
    const dayData = schedule[iso] || { A: [], B: [], warnA: false, warnB: false };
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const hasWarn   = dayData.warnA || dayData.warnB;

    // Date cell
    const dateFmt = Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEE, MMM d');
    sheet.getRange(row, COL_DATE).setValue(dateFmt);

    // Shift A cell
    sheet.getRange(row, COL_SHIFT_A).setValue(_staffCell(dayData.A));

    // Shift B cell
    sheet.getRange(row, COL_SHIFT_B).setValue(_staffCell(dayData.B));

    // Events cell (empty — manager fills in manually)
    sheet.getRange(row, COL_EVENTS).setValue('');

    // Row background
    const rowBg = hasWarn ? COLOR.WARN_BG : null;
    if (rowBg) sheet.getRange(row, 1, 1, NUM_COLS).setBackground(rowBg);

    // Per-column background (only when not warning)
    if (!hasWarn) {
      sheet.getRange(row, COL_DATE).setBackground(isWeekend ? COLOR.WEEKEND_BG : COLOR.DATE_BG);
      sheet.getRange(row, COL_SHIFT_A).setBackground(COLOR.SHIFT_A_BG);
      sheet.getRange(row, COL_SHIFT_B).setBackground(COLOR.SHIFT_B_BG);
      sheet.getRange(row, COL_EVENTS).setBackground(COLOR.EVENTS_BG);
    }

    sheet.getRange(row, 1, 1, NUM_COLS)
      .setFontSize(10)
      .setVerticalAlignment('top')
      .setBorder(false, false, true, false, false, false, COLOR.LINE, SpreadsheetApp.BorderStyle.SOLID);

    sheet.setRowHeight(row, 48);
  }

  // ── Column widths ──────────────────────────────────────────────
  sheet.setColumnWidth(COL_DATE,    120);
  sheet.setColumnWidth(COL_SHIFT_A, 220);
  sheet.setColumnWidth(COL_SHIFT_B, 220);
  sheet.setColumnWidth(COL_EVENTS,  200);

  // Wrap text in staff columns so multiple names show on separate lines
  sheet.getRange(3, COL_SHIFT_A, days, 1).setWrap(true);
  sheet.getRange(3, COL_SHIFT_B, days, 1).setWrap(true);
  sheet.getRange(3, COL_EVENTS,  days, 1).setWrap(true);

  sheet.setFrozenRows(2);

  // ── Legend below the schedule ──────────────────────────────────
  const legendRow = days + 4;
  sheet.getRange(legendRow, 1, 1, NUM_COLS).merge()
    .setValue('Legend:  🟦 Shift A (11:30 AM – 5 PM)   🟪 Shift B (12:30 PM – 6 PM)   🟧 No manager available — review required   (MGR) = Manager')
    .setFontSize(9)
    .setFontColor('#888')
    .setFontStyle('italic');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a list of { name, position } objects into a readable cell value. */
function _staffCell(assignments) {
  if (!assignments || !assignments.length) return '—';
  return assignments
    .map(a => a.position === POS_MANAGER ? `${a.name} (MGR)` : a.name)
    .join('\n');
}
