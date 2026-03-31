// ============================================================
// app.js — Entry point.
//
// Responsibilities:
//   1. Load persisted state from localStorage
//   2. Expose view/action functions on window (for inline onclick handlers)
//   3. Boot the first rendered page
// ============================================================

import { loadStore }                          from './src/store.js';
import {
  nav, navBack, viewDay,
  calPrevMonth, calNextMonth, renderCalendar,
  runAutoSchedule, confirmClearMonth,
  renderDay, removeShiftStaff, openAddStaff, addShiftStaff,
  openAddEventModal, openEditEventModal, saveEvent, deleteEvent,
  openAddEventStaff, addEventStaff, removeEventStaff,
  renderEmployees, showAddEmployeeModal, openEditEmployeeModal,
  saveEmployee, toggleEmployeeActive,
  renderSettings, saveSettings, doRefreshAvailability, confirmClearAllData,
  showHeuristics,
  closeModal,
} from './src/views.js';

// ── Expose all interactive functions to the global scope ───────────────────
// (Required because onclick attributes in HTML cannot access ES module exports)
Object.assign(window, {
  nav, navBack, viewDay,
  calPrevMonth, calNextMonth,
  runAutoSchedule, confirmClearMonth,
  removeShiftStaff, openAddStaff, addShiftStaff,
  openAddEventModal, openEditEventModal, saveEvent, deleteEvent,
  openAddEventStaff, addEventStaff, removeEventStaff,
  showAddEmployeeModal, openEditEmployeeModal, saveEmployee, toggleEmployeeActive,
  saveSettings, doRefreshAvailability, confirmClearAllData,
  showHeuristics,
  closeModal,
});

// ── Boot ───────────────────────────────────────────────────────────────────
function boot() {
  loadStore();
  nav('calendar');
}

boot();
