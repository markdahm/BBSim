// ============================================================
// scheduler.js — Auto-schedules a full month of shifts.
//
// Algorithm (per day, per shift):
//   1. Collect active employees available for that date/shift
//      (no availability data = treated as available)
//   2. Exclude employees already assigned to the other shift today
//   3. Sort candidates by fairness score (fewest recent shifts first)
//   4. Enforce Manager constraint — if none available, set warned flag
//      and fill shift with whoever is available (don't leave it empty)
//   5. Pick: one Manager first, then fill remaining slots with Wine Pourers
//   6. Write assignments with source: 'auto'
//
// Manually-locked shifts (any assignment with source: 'manual') are
// left untouched — the manager's choices are never overwritten.
// ============================================================

import { SHIFT_IDS } from './data.js';
import { STORE, getScheduleDay, saveStore } from './store.js';
import { addDays, isoDate, getDaysInMonth } from './utils.js';
import { isAvailableOnDay } from './availability.js';

// ── Public API ─────────────────────────────────────────────────────────────

/** Auto-schedule all days in the month containing monthStart. */
export function autoSchedule(monthStart) {
  const activeEmps = STORE.employees.filter(e => e.active !== false);
  const days       = getDaysInMonth(monthStart);

  for (let i = 0; i < days; i++) {
    const iso = isoDate(addDays(monthStart, i));
    const day = getScheduleDay(iso);

    // Track employees assigned to any shift today (to prevent double-booking)
    const assignedToday = new Set();

    for (const shiftId of SHIFT_IDS) {
      const shift = day[shiftId];

      // If the manager manually set anyone, honour those choices and skip auto
      if (shift.assignments.some(a => a.source === 'manual')) {
        shift.assignments.forEach(a => assignedToday.add(a.empId));
        continue;
      }

      // Clear previous auto-assignments for a clean run
      shift.assignments = [];
      shift.warned      = false;

      const target = STORE.settings.staffPerShift ?? 2;

      // Candidates: active, available this day (shift not differentiated), not already working today
      // isAvailableOnDay returns null (no data) → treat as available
      const candidates = activeEmps.filter(emp =>
        !assignedToday.has(emp.id) && isAvailableOnDay(emp.id, iso) !== false
      );

      const managers = candidates.filter(e => e.position === 'Manager');
      const pourers  = candidates.filter(e => e.position !== 'Manager');

      if (managers.length === 0) {
        shift.warned = true; // UI will show a warning badge on this shift
      }

      // Sort each group by fairness score — reference the month start so scores
      // are consistent across all days in the same scheduling run
      const sorted = arr =>
        arr.slice().sort((a, b) => _fairnessScore(a.id, monthStart) - _fairnessScore(b.id, monthStart));

      const picked = [];

      // Always seat a manager first (if one is available)
      const sortedManagers = sorted(managers);
      if (sortedManagers.length > 0) picked.push(sortedManagers[0]);

      // Fill remaining slots: prioritise pourers, use extra managers as overflow
      for (const emp of [...sorted(pourers), ...sortedManagers.slice(1)]) {
        if (picked.length >= target) break;
        if (!picked.some(p => p.id === emp.id)) picked.push(emp);
      }

      shift.assignments = picked.map(emp => ({ empId: emp.id, source: 'auto' }));
      picked.forEach(emp => assignedToday.add(emp.id));
    }
  }

  saveStore();
}

/** Remove all auto-assigned (source: 'auto') entries for the month. */
export function clearMonthAutoAssignments(monthStart) {
  const days = getDaysInMonth(monthStart);
  for (let i = 0; i < days; i++) {
    const iso = isoDate(addDays(monthStart, i));
    const day = getScheduleDay(iso);
    for (const shiftId of SHIFT_IDS) {
      day[shiftId].assignments = day[shiftId].assignments.filter(a => a.source === 'manual');
      day[shiftId].warned      = false;
    }
  }
  saveStore();
}

// ── Fairness score (lower = schedule this person sooner) ──────────────────
//
// Counts DAYS worked (not individual shifts) in the prior 4 weeks.
// A day counts once regardless of whether the employee works Shift A or B.
// The most recent week is weighted 3× to deprioritise recently busy staff.
// Uses monthStart as a stable reference so scores don't change mid-run.
// A small random tiebreaker prevents alphabetical bias.

function _fairnessScore(empId, monthStart) {
  let score = 0;
  for (let w = -3; w <= 0; w++) {
    const weight = w === 0 ? 3 : 1;
    for (let d = 0; d < 7; d++) {
      const iso = isoDate(addDays(addDays(monthStart, w * 7), d));
      const day = STORE.schedule[iso];
      if (!day) continue;
      // Count each day once — don't double-count Shift A + Shift B
      const workedToday = SHIFT_IDS.some(
        sid => (day[sid]?.assignments ?? []).some(a => a.empId === empId)
      );
      if (workedToday) score += weight;
    }
  }
  score += Math.random() * 0.5; // tiebreaker
  return score;
}
