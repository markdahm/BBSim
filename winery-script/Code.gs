// ================================================================
// Code.gs — Menu, constants, setup, and main entry points.
//
// All .gs files share the same global scope in Apps Script.
// Run setupSpreadsheet() once to create all required tabs.
// ================================================================

// ── Sheet tab names ──────────────────────────────────────────────────────────
const TAB = {
  EMPLOYEES:    'Employees',
  AVAILABILITY: 'Availability',
  SCHEDULE:     'Schedule',
  HISTORY:      'History',
  SETTINGS:     'Settings',
};

// ── Shift definitions ────────────────────────────────────────────────────────
const SHIFT_A = { id: 'A', label: 'Shift A', display: '11:30 AM – 5:00 PM' };
const SHIFT_B = { id: 'B', label: 'Shift B', display: '12:30 PM – 6:00 PM' };
const SHIFTS  = [SHIFT_A, SHIFT_B];

const POS_MANAGER = 'Manager';
const POS_POURER  = 'Wine Pourer';

// ── Menu ─────────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🍷 Scheduler')
    .addItem('⚙️  First-time setup',        'setupSpreadsheet')
    .addSeparator()
    .addItem('▶  Auto-Schedule Month',      'autoScheduleMonth')
    .addItem('✕  Clear & Reset Month',      'clearAndReset')
    .addSeparator()
    .addItem('ℹ  View Scheduling Rules',    'showHeuristics')
    .addToUi();
}

// ── Main: Auto-schedule ───────────────────────────────────────────────────────
function autoScheduleMonth() {
  const ui       = SpreadsheetApp.getUi();
  const settings = getSettings();

  if (!settings.scheduleMonth) {
    ui.alert('Setup Required', 'Set "Schedule Month" in the Settings tab (format: YYYY-MM, e.g. 2026-04).', ui.ButtonSet.OK);
    return;
  }

  const [y, m]     = settings.scheduleMonth.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const employees  = getEmployees().filter(e => e.active);

  if (!employees.length) {
    ui.alert('No active employees found. Add staff to the Employees tab first.');
    return;
  }

  const availability  = getAvailability();
  const fairnessData  = getFairnessData(monthStart);  // days worked in 4-week lookback
  const schedule      = buildSchedule(monthStart, employees, availability, fairnessData, settings);

  // Write schedule to History (replace auto entries for this month) and render
  replaceAutoInHistory(settings.scheduleMonth, schedule);
  renderSchedule(monthStart, schedule, settings);

  const warnings = Object.values(schedule).filter(d => d.warnA || d.warnB).length;
  const msg = warnings > 0
    ? `Schedule generated for ${settings.scheduleMonth}.\n\n⚠ ${warnings} day(s) have no Manager available — highlighted in orange.`
    : `Schedule complete for ${settings.scheduleMonth}. No warnings.`;
  ui.alert('Done', msg, ui.ButtonSet.OK);
}

// ── Main: Clear & reset ───────────────────────────────────────────────────────
function clearAndReset() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Clear & Reset Month',
    'This will remove ALL scheduled assignments for the current month (including manual edits) and clear the Schedule tab.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const settings = getSettings();
  if (!settings.scheduleMonth) return;

  clearMonthFromHistory(settings.scheduleMonth);

  const [y, m]     = settings.scheduleMonth.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  clearScheduleTab(monthStart);

  ui.alert('Cleared.', `All assignments for ${settings.scheduleMonth} have been removed.`, ui.ButtonSet.OK);
}

// ── Heuristics sidebar ────────────────────────────────────────────────────────
function showHeuristics() {
  const html = HtmlService.createHtmlOutputFromFile('Heuristics')
    .setTitle('Scheduling Rules')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

// ── First-time setup ──────────────────────────────────────────────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  _ensureTab(ss, TAB.EMPLOYEES,    _initEmployees);
  _ensureTab(ss, TAB.AVAILABILITY, _initAvailability);
  _ensureTab(ss, TAB.SCHEDULE,     _initSchedule);
  _ensureTab(ss, TAB.HISTORY,      _initHistory);
  _ensureTab(ss, TAB.SETTINGS,     _initSettings);

  SpreadsheetApp.getUi().alert(
    'Setup Complete',
    '5 tabs created:\n\n' +
    '• Employees — add your staff here\n' +
    '• Availability — staff mark days they can work\n' +
    '• Schedule — auto-generated monthly schedule\n' +
    '• History — past assignments (used for fairness)\n' +
    '• Settings — configure month and target staffing\n\n' +
    'Start by filling in Employees, then run Auto-Schedule Month.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function _ensureTab(ss, name, initFn) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initFn(sheet);
  }
  return sheet;
}

// ── Tab initializers ──────────────────────────────────────────────────────────

function _initEmployees(s) {
  s.getRange('A1:C1').setValues([['Name', 'Position', 'Active']]);
  _headerRow(s.getRange('A1:C1'));
  s.setColumnWidth(1, 200); s.setColumnWidth(2, 140); s.setColumnWidth(3, 80);
  s.getRange('A2:C4').setValues([
    ['Jane Smith',  POS_MANAGER, true],
    ['Tom Lee',     POS_POURER,  true],
    ['Maria Gomez', POS_POURER,  true],
  ]);
  // Data validation for Position column
  const posRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([POS_MANAGER, POS_POURER], true).build();
  s.getRange('B2:B100').setDataValidation(posRule);
  // Checkbox for Active column
  s.getRange('C2:C100').insertCheckboxes();
}

function _initAvailability(s) {
  s.getRange('A1').setValue('Name').setFontWeight('bold').setBackground('#f3f0ed');
  s.setColumnWidth(1, 200);
  s.getRange('A2').setValue('→ Employees: mark each day you can work with Y (or any mark). Leave blank if unavailable.')
    .setFontColor('#888').setFontStyle('italic');
  s.getRange('A2:Z2').merge();
}

function _initSchedule(s) {
  s.getRange('A1').setValue('Run "Auto-Schedule Month" from the 🍷 Scheduler menu to generate the schedule.')
    .setFontColor('#888').setFontStyle('italic');
}

function _initHistory(s) {
  s.getRange('A1:E1').setValues([['Employee', 'Date', 'Shift', 'Source', 'Month']]);
  _headerRow(s.getRange('A1:E1'));
  s.setColumnWidth(1, 200); s.setColumnWidth(2, 120);
  s.setFrozenRows(1);
}

function _initSettings(s) {
  s.getRange('A1:B1').setValues([['Setting', 'Value']]);
  _headerRow(s.getRange('A1:B1'));
  s.getRange('A2:B3').setValues([
    ['Target Staff Per Shift', 2],
    ['Schedule Month',         '2026-04'],
  ]);
  s.setColumnWidth(1, 220); s.setColumnWidth(2, 160);
  s.getRange('A5').setValue('Schedule Month format: YYYY-MM  (e.g. 2026-04 for April 2026)')
    .setFontColor('#888').setFontStyle('italic');
}

function _headerRow(range) {
  range.setFontWeight('bold').setBackground('#f3f0ed');
}
