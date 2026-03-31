// ============================================================
// views.js — All DOM rendering and navigation.
//
// Sections:
//   Navigation
//   Calendar (week view)
//   Day Detail
//   Employees
//   Settings
//   Modals — Add/Edit Employee, Add Staff to Shift, Add Event, Event Staff
// ============================================================

import { SHIFTS, SHIFT_IDS, SHIFT_COLORS, POSITIONS, POS_ABBR, WEEKDAY_LABELS } from './data.js';
import { STORE, getScheduleDay, saveStore, getEmployee, getActiveEmployees } from './store.js';
import { addDays, isoDate, parseIso, fmtDateLong, fmtMonthYear, startOfMonth, getDaysInMonth, generateId } from './utils.js';
import { autoSchedule, clearMonthAutoAssignments } from './scheduler.js';
import { fetchAvailability, isAvailableOnDay, getLastFetchedLabel } from './availability.js';

// ── Module state ───────────────────────────────────────────────────────────
let currentMonthStart = startOfMonth(new Date());
let currentDayIso     = null;

// Context for the "Add Staff" bottom sheet
// { iso, shiftId } for a regular shift, or { iso, eventId } for an event
let _addStaffCtx = null;

// ── Navigation ─────────────────────────────────────────────────────────────

const PAGES = ['calendar', 'day', 'employees', 'settings'];

export function nav(page) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`)?.classList.toggle('active', p === page);
  });

  // Update bottom-tab active state (day is a sub-page of calendar)
  const tabPage = page === 'day' ? 'calendar' : page;
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === tabPage);
  });

  // Show back button only on sub-pages
  const backBtn = document.getElementById('header-back');
  if (backBtn) backBtn.classList.toggle('hidden', page !== 'day');

  if (page === 'calendar')  renderCalendar();
  if (page === 'day')       renderDay();
  if (page === 'employees') renderEmployees();
  if (page === 'settings')  renderSettings();
}

export function navBack() {
  nav('calendar');
}

export function viewDay(iso) {
  currentDayIso = iso;
  nav('day');
}

// ── Calendar ───────────────────────────────────────────────────────────────

export function calPrevMonth() {
  const d = currentMonthStart;
  currentMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  renderCalendar();
}

export function calNextMonth() {
  const d = currentMonthStart;
  currentMonthStart = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  renderCalendar();
}

export function renderCalendar() {
  document.getElementById('week-label').textContent = fmtMonthYear(currentMonthStart);

  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  // Day-of-week header (Mon … Sun)
  let html = WEEKDAY_LABELS.map(d => `<div class="cal-head">${d}</div>`).join('');

  // Blank offset cells so day 1 lands on the correct column
  // JS getDay(): 0=Sun … 6=Sat → convert to Mon-based: (dow + 6) % 7
  const firstDow = currentMonthStart.getDay();
  const offset   = (firstDow + 6) % 7;
  for (let i = 0; i < offset; i++) html += `<div class="cal-cell cal-cell-empty"></div>`;

  const todayIso  = isoDate(new Date());
  const daysCount = getDaysInMonth(currentMonthStart);

  for (let i = 0; i < daysCount; i++) {
    const date = addDays(currentMonthStart, i);
    const iso  = isoDate(date);
    const day  = STORE.schedule[iso];

    let dots = '';
    let hasWarn = false;
    for (const sid of SHIFT_IDS) {
      const shift = day?.[sid];
      if (!shift) continue;
      if (shift.warned) hasWarn = true;
      shift.assignments.forEach(() => {
        dots += `<span class="cal-dot" style="background:${SHIFT_COLORS[sid]}"></span>`;
      });
    }
    const hasEvent = (day?.events?.length ?? 0) > 0;

    html += `
      <div class="cal-cell${iso === todayIso ? ' cal-today' : ''}" onclick="viewDay('${iso}')">
        <span class="cal-date">${date.getDate()}</span>
        ${hasWarn ? '<span class="cal-warn" title="No manager assigned">!</span>' : ''}
        ${hasEvent ? '<span class="cal-event-dot" title="Special event"></span>' : ''}
        <div class="cal-dots">${dots}</div>
      </div>`;
  }

  grid.innerHTML = html;
}

export function runAutoSchedule() {
  autoSchedule(currentMonthStart);
  renderCalendar();
}

export function confirmClearMonth() {
  if (!confirm('Clear all auto-assigned shifts this month? Manually set staff will be kept.')) return;
  clearMonthAutoAssignments(currentMonthStart);
  renderCalendar();
}

// ── Day Detail ─────────────────────────────────────────────────────────────

export function renderDay() {
  if (!currentDayIso) return;
  const date = parseIso(currentDayIso);

  document.getElementById('day-date-heading').textContent = fmtDateLong(date);

  const cont = document.getElementById('day-content');
  if (!cont) return;

  const day = getScheduleDay(currentDayIso);
  let html  = '';

  // Shift cards
  for (const sid of SHIFT_IDS) {
    const shift    = day[sid];
    const shiftDef = SHIFTS[sid];
    const color    = SHIFT_COLORS[sid];

    const chips = shift.assignments.map(({ empId, source }) => {
      const emp = getEmployee(empId);
      if (!emp) return '';
      const abbr   = POS_ABBR[emp.position] || '';
      const manual = source === 'manual' ? '<span class="chip-manual" title="Manually assigned">✎</span>' : '';
      return `<div class="emp-chip">
        <span class="chip-dot" style="background:${emp.color || color}"></span>
        <span class="chip-name">${emp.name}</span>
        <span class="chip-badge">${abbr}</span>
        ${manual}
        <button class="chip-remove" onclick="removeShiftStaff('${currentDayIso}','${sid}','${empId}')" aria-label="Remove">×</button>
      </div>`;
    }).join('');

    const warnBadge = shift.warned
      ? `<span class="warn-badge" title="No manager available for this shift">No Manager!</span>`
      : '';

    html += `
      <div class="shift-card" style="--shift-color:${color}">
        <div class="shift-card-header">
          <div>
            <div class="shift-card-label">${shiftDef.label}</div>
            <div class="shift-card-time">${shiftDef.display}</div>
          </div>
          ${warnBadge}
        </div>
        <div class="shift-assignments">
          ${chips || '<span class="no-staff">No staff assigned</span>'}
        </div>
        <button class="btn-add-staff" onclick="openAddStaff('${currentDayIso}','${sid}')">+ Add Staff</button>
      </div>`;
  }

  // Events section
  html += `<div class="events-section">
    <div class="events-section-header">
      <span class="events-section-title">Special Events</span>
      <button class="btn-ghost btn-sm" onclick="openAddEventModal('${currentDayIso}')">+ Add Event</button>
    </div>`;

  if (day.events.length === 0) {
    html += `<div class="no-events">No special events</div>`;
  } else {
    for (const evt of day.events) {
      const chips = evt.assignments.map(({ empId }) => {
        const emp = getEmployee(empId);
        if (!emp) return '';
        return `<div class="emp-chip">
          <span class="chip-dot" style="background:${SHIFT_COLORS.EVENT}"></span>
          <span class="chip-name">${emp.name}</span>
          <span class="chip-badge">${POS_ABBR[emp.position] || ''}</span>
          <button class="chip-remove" onclick="removeEventStaff('${currentDayIso}','${evt.id}','${empId}')" aria-label="Remove">×</button>
        </div>`;
      }).join('');

      const filled   = evt.assignments.length;
      const needed   = evt.staffNeeded;
      const shortBy  = needed - filled;
      const countBadge = shortBy > 0
        ? `<span class="warn-badge">${filled}/${needed} staff</span>`
        : `<span class="ok-badge">${filled}/${needed} staff</span>`;

      html += `
        <div class="event-card">
          <div class="event-card-header">
            <div>
              <div class="event-card-label">${evt.label}</div>
              ${evt.notes ? `<div class="event-card-notes">${evt.notes}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${countBadge}
              <button class="btn-icon" onclick="openEditEventModal('${currentDayIso}','${evt.id}')" title="Edit">✎</button>
              <button class="btn-icon btn-danger" onclick="deleteEvent('${currentDayIso}','${evt.id}')" title="Delete">✕</button>
            </div>
          </div>
          <div class="shift-assignments">
            ${chips || '<span class="no-staff">No staff assigned</span>'}
          </div>
          <button class="btn-add-staff btn-event" onclick="openAddEventStaff('${currentDayIso}','${evt.id}')">+ Add Staff</button>
        </div>`;
    }
  }

  html += '</div>';
  cont.innerHTML = html;
}

// ── Shift staff management ─────────────────────────────────────────────────

export function removeShiftStaff(iso, shiftId, empId) {
  const shift = getScheduleDay(iso)[shiftId];
  shift.assignments = shift.assignments.filter(a => a.empId !== empId);
  saveStore();
  renderDay();
}

export function openAddStaff(iso, shiftId) {
  _addStaffCtx = { iso, shiftId };
  _renderAddStaffList();
  _openModal('modal-add-staff');
  document.getElementById('modal-staff-title').textContent =
    `Add Staff — ${SHIFTS[shiftId].label}`;
}

function _renderAddStaffList() {
  const { iso, shiftId } = _addStaffCtx;
  const day      = getScheduleDay(iso);
  const shift    = day[shiftId];
  const assigned = new Set(shift.assignments.map(a => a.empId));

  // Also prevent double-booking across shifts on the same day
  const otherShiftId = shiftId === 'A' ? 'B' : 'A';
  const otherShift   = day[otherShiftId];
  const busyToday    = new Set(otherShift.assignments.map(a => a.empId));

  const cont = document.getElementById('modal-staff-list');
  if (!cont) return;

  const emps = STORE.employees.filter(e => e.active !== false);
  if (!emps.length) {
    cont.innerHTML = `<p class="modal-empty">No employees added yet.</p>`;
    return;
  }

  // Group by position
  const byPos = {};
  for (const emp of emps) {
    (byPos[emp.position] = byPos[emp.position] || []).push(emp);
  }

  let html = '';
  for (const pos of POSITIONS) {
    const group = byPos[pos];
    if (!group?.length) continue;
    html += `<div class="staff-group-label">${pos}</div>`;
    for (const emp of group) {
      const isAssigned  = assigned.has(emp.id);
      const isBusy      = busyToday.has(emp.id);
      const avail = isAvailableOnDay(emp.id, iso); // true | false | null

      let availIcon = '';
      if (avail === null)  availIcon = `<span class="avail-unknown" title="No sheet data">?</span>`;
      else if (avail)      availIcon = `<span class="avail-yes" title="Available per sheet">✓</span>`;
      else                 availIcon = `<span class="avail-no"  title="Unavailable per sheet">✗</span>`;

      const disabled = isAssigned || isBusy;
      const stateNote = isAssigned ? '(assigned)' : isBusy ? '(other shift)' : '';

      html += `<button class="staff-pick-row${disabled ? ' disabled' : ''}"
        ${disabled ? 'disabled' : `onclick="addShiftStaff('${emp.id}')"`}>
        <span class="pick-dot" style="background:${emp.color || '#888'}"></span>
        <span class="pick-name">${emp.name}</span>
        ${stateNote ? `<span class="pick-note">${stateNote}</span>` : ''}
        ${availIcon}
      </button>`;
    }
  }

  cont.innerHTML = html || `<p class="modal-empty">No active employees.</p>`;
}

export function addShiftStaff(empId) {
  if (!_addStaffCtx?.shiftId) return;
  const { iso, shiftId } = _addStaffCtx;
  const shift = getScheduleDay(iso)[shiftId];
  if (!shift.assignments.some(a => a.empId === empId)) {
    shift.assignments.push({ empId, source: 'manual' });
    shift.warned = !shift.assignments.some(a => {
      const emp = getEmployee(a.empId);
      return emp?.position === 'Manager';
    });
    saveStore();
  }
  closeModal();
  renderDay();
}

// ── Events ─────────────────────────────────────────────────────────────────

export function openAddEventModal(iso) {
  document.getElementById('event-edit-id').value = '';
  document.getElementById('event-date').value    = iso;
  document.getElementById('event-label').value   = '';
  document.getElementById('event-staff-needed').value = '2';
  document.getElementById('event-notes').value   = '';
  _openModal('modal-add-event');
}

export function openEditEventModal(iso, eventId) {
  const day = STORE.schedule[iso];
  const evt = day?.events.find(e => e.id === eventId);
  if (!evt) return;
  document.getElementById('event-edit-id').value        = eventId;
  document.getElementById('event-date').value           = iso;
  document.getElementById('event-label').value          = evt.label;
  document.getElementById('event-staff-needed').value   = evt.staffNeeded;
  document.getElementById('event-notes').value          = evt.notes || '';
  _openModal('modal-add-event');
}

export function saveEvent() {
  const iso         = document.getElementById('event-date').value;
  const editId      = document.getElementById('event-edit-id').value;
  const label       = document.getElementById('event-label').value.trim();
  const staffNeeded = parseInt(document.getElementById('event-staff-needed').value, 10) || 1;
  const notes       = document.getElementById('event-notes').value.trim();
  if (!label) { alert('Please enter an event name.'); return; }

  const day = getScheduleDay(iso);
  if (editId) {
    const evt = day.events.find(e => e.id === editId);
    if (evt) { evt.label = label; evt.staffNeeded = staffNeeded; evt.notes = notes; }
  } else {
    day.events.push({ id: generateId('evt'), label, staffNeeded, assignments: [], notes });
  }
  saveStore();
  closeModal();
  renderDay();
}

export function deleteEvent(iso, eventId) {
  if (!confirm('Remove this event?')) return;
  const day = STORE.schedule[iso];
  if (day) day.events = day.events.filter(e => e.id !== eventId);
  saveStore();
  renderDay();
}

export function openAddEventStaff(iso, eventId) {
  _addStaffCtx = { iso, eventId };
  document.getElementById('modal-event-staff-title').textContent = 'Assign Staff to Event';
  _renderEventStaffList();
  _openModal('modal-event-staff');
}

function _renderEventStaffList() {
  const { iso, eventId } = _addStaffCtx;
  const day  = STORE.schedule[iso];
  const evt  = day?.events.find(e => e.id === eventId);
  if (!evt) return;
  const assigned = new Set(evt.assignments.map(a => a.empId));

  const cont = document.getElementById('modal-event-staff-list');
  if (!cont) return;

  const emps = STORE.employees.filter(e => e.active !== false);
  const byPos = {};
  for (const emp of emps) (byPos[emp.position] = byPos[emp.position] || []).push(emp);

  let html = '';
  for (const pos of POSITIONS) {
    const group = byPos[pos];
    if (!group?.length) continue;
    html += `<div class="staff-group-label">${pos}</div>`;
    for (const emp of group) {
      const isAssigned = assigned.has(emp.id);
      html += `<button class="staff-pick-row${isAssigned ? ' disabled' : ''}"
        ${isAssigned ? 'disabled' : `onclick="addEventStaff('${emp.id}')"`}>
        <span class="pick-dot" style="background:${emp.color || '#888'}"></span>
        <span class="pick-name">${emp.name}</span>
        ${isAssigned ? '<span class="pick-note">(assigned)</span>' : ''}
      </button>`;
    }
  }
  cont.innerHTML = html || `<p class="modal-empty">No active employees.</p>`;
}

export function addEventStaff(empId) {
  if (!_addStaffCtx?.eventId) return;
  const { iso, eventId } = _addStaffCtx;
  const day = STORE.schedule[iso];
  const evt = day?.events.find(e => e.id === eventId);
  if (evt && !evt.assignments.some(a => a.empId === empId)) {
    evt.assignments.push({ empId, source: 'manual' });
    saveStore();
  }
  closeModal();
  renderDay();
}

export function removeEventStaff(iso, eventId, empId) {
  const day = STORE.schedule[iso];
  const evt = day?.events.find(e => e.id === eventId);
  if (evt) evt.assignments = evt.assignments.filter(a => a.empId !== empId);
  saveStore();
  renderDay();
}

// ── Employees ──────────────────────────────────────────────────────────────

export function renderEmployees() {
  const cont = document.getElementById('employees-list');
  if (!cont) return;

  if (!STORE.employees.length) {
    cont.innerHTML = `<div class="empty-state">No employees yet.<br>Tap + to add your first staff member.</div>`;
    return;
  }

  // Group by position, Managers first
  const byPos = {};
  for (const emp of STORE.employees) {
    (byPos[emp.position] = byPos[emp.position] || []).push(emp);
  }

  let html = '';
  for (const pos of POSITIONS) {
    const group = byPos[pos];
    if (!group?.length) continue;
    html += `<div class="emp-group-header">${pos}s</div>`;
    for (const emp of group) {
      const inactive = emp.active === false;
      html += `
        <div class="emp-list-row${inactive ? ' emp-inactive' : ''}">
          <div class="emp-list-info" onclick="openEditEmployeeModal('${emp.id}')">
            <span class="emp-list-name">${emp.name}</span>
            ${emp.email ? `<span class="emp-list-email">${emp.email}</span>` : ''}
          </div>
          <div class="emp-list-actions">
            <label class="toggle" title="${inactive ? 'Activate' : 'Deactivate'}">
              <input type="checkbox" ${inactive ? '' : 'checked'}
                onchange="toggleEmployeeActive('${emp.id}',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;
    }
  }

  cont.innerHTML = html;
}

export function showAddEmployeeModal() {
  document.getElementById('emp-edit-id').value  = '';
  document.getElementById('emp-name').value     = '';
  document.getElementById('emp-position').value = 'Wine Pourer';
  document.getElementById('emp-email').value    = '';
  document.getElementById('modal-emp-title').textContent = 'Add Employee';
  _openModal('modal-add-employee');
}

export function openEditEmployeeModal(empId) {
  const emp = getEmployee(empId);
  if (!emp) return;
  document.getElementById('emp-edit-id').value  = emp.id;
  document.getElementById('emp-name').value     = emp.name;
  document.getElementById('emp-position').value = emp.position;
  document.getElementById('emp-email').value    = emp.email || '';
  document.getElementById('modal-emp-title').textContent = 'Edit Employee';
  _openModal('modal-add-employee');
}

export function saveEmployee() {
  const id       = document.getElementById('emp-edit-id').value;
  const name     = document.getElementById('emp-name').value.trim();
  const position = document.getElementById('emp-position').value;
  const email    = document.getElementById('emp-email').value.trim();
  if (!name) { alert('Please enter a name.'); return; }

  if (id) {
    const emp = getEmployee(id);
    if (emp) { emp.name = name; emp.position = position; emp.email = email; }
  } else {
    STORE.employees.push({ id: generateId('emp'), name, position, email, active: true });
  }
  saveStore();
  closeModal();
  renderEmployees();
}

export function toggleEmployeeActive(empId, active) {
  const emp = getEmployee(empId);
  if (emp) { emp.active = active; saveStore(); }
  renderEmployees();
}

// ── Settings ───────────────────────────────────────────────────────────────

export function renderSettings() {
  const cont = document.getElementById('settings-content');
  if (!cont) return;

  const { sheetsUrl, staffPerShift } = STORE.settings;
  const lastFetched = getLastFetchedLabel();

  cont.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">Google Sheet Availability</div>
      <p class="settings-help">
        Publish your sheet via <em>File → Share → Publish to web → CSV</em>
        and paste the URL below. Employees fill columns with <strong>A</strong>,
        <strong>B</strong>, <strong>AB</strong>, or leave blank.
      </p>
      <div class="form-group">
        <label class="form-label">Published CSV URL</label>
        <input type="url" id="settings-sheet-url" class="form-input"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value="${sheetsUrl || ''}">
      </div>
      <div class="settings-row">
        <button class="btn-primary" onclick="saveSettings()">Save URL</button>
        <button class="btn-ghost" onclick="doRefreshAvailability()">Refresh Now</button>
      </div>
      <div class="settings-meta">Last fetched: ${lastFetched}</div>
      <div id="settings-fetch-status" class="settings-status"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Scheduling Defaults</div>
      <div class="form-group">
        <label class="form-label">Target staff per shift</label>
        <select id="settings-staff-per-shift" class="form-input form-select">
          ${[1,2,3,4].map(n => `<option value="${n}"${n === staffPerShift ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </div>
      <button class="btn-primary" onclick="saveSettings()">Save</button>
    </div>

    <div class="settings-section settings-danger-zone">
      <div class="settings-section-title">Danger Zone</div>
      <button class="btn-danger" onclick="confirmClearAllData()">Clear All Data</button>
    </div>`;
}

export function saveSettings() {
  const url = document.getElementById('settings-sheet-url')?.value.trim();
  const sps = parseInt(document.getElementById('settings-staff-per-shift')?.value, 10);
  if (url !== undefined)   STORE.settings.sheetsUrl     = url;
  if (!isNaN(sps))         STORE.settings.staffPerShift = sps;
  saveStore();
  _showStatus('settings-fetch-status', 'Settings saved.', 'ok');
}

export async function doRefreshAvailability() {
  const statusEl = document.getElementById('settings-fetch-status');
  _showStatus('settings-fetch-status', 'Fetching…', 'info');
  try {
    await fetchAvailability();
    _showStatus('settings-fetch-status', `Updated — ${getLastFetchedLabel()}`, 'ok');
    renderSettings(); // refresh last-fetched label
  } catch (e) {
    _showStatus('settings-fetch-status', `Error: ${e.message}`, 'error');
  }
}

export function confirmClearAllData() {
  if (!confirm('Delete ALL schedule data, employees, and availability? This cannot be undone.')) return;
  STORE.employees         = [];
  STORE.schedule          = {};
  STORE.availabilityCache = {};
  STORE.settings.lastFetched = null;
  saveStore();
  nav('calendar');
}

// ── Modals ─────────────────────────────────────────────────────────────────

export function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('modal-overlay').classList.add('hidden');
  _addStaffCtx = null;
}

function _openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

// ── Heuristics reference ───────────────────────────────────────────────────

export function showHeuristics() {
  _openModal('modal-heuristics');
}

// ── Private helpers ────────────────────────────────────────────────────────

function _showStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = `settings-status status-${type}`;
}
