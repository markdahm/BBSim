// ================================================================
// Scheduler.gs — Auto-scheduling algorithm.
//
// buildSchedule() returns a schedule object:
//   {
//     'YYYY-MM-DD': {
//       A:     [{ name, position }],   // assigned to Shift A
//       B:     [{ name, position }],   // assigned to Shift B
//       warnA: false,                  // true = no manager on Shift A
//       warnB: false,
//     },
//     ...
//   }
//
// See Heuristics.html for a full description of each rule.
// ================================================================

/**
 * Schedule every day of the month.
 *
 * @param {Date}   monthStart   - First day of the month to schedule
 * @param {Array}  employees    - [{ name, position, active }] — active only
 * @param {Object} availability - { name: [iso dates available] }
 * @param {Object} fairnessData - { name: [iso dates worked in lookback window] }
 * @param {Object} settings     - { staffPerShift }
 * @returns {Object} schedule   - keyed by ISO date
 */
function buildSchedule(monthStart, employees, availability, fairnessData, settings) {
  const target   = settings.staffPerShift || 2;
  const days     = _getDaysInMonth(monthStart);
  const schedule = {};

  for (let i = 0; i < days; i++) {
    const date = _addDays(monthStart, i);
    const iso  = _toIso(date);

    // Track who has already been assigned any shift today
    const assignedToday = new Set();
    const dayEntry = { A: [], B: [], warnA: false, warnB: false };

    for (const shift of SHIFTS) {
      const sid = shift.id;

      // Candidates: available this day, not already working today
      const candidates = employees.filter(emp =>
        !assignedToday.has(emp.name) && _isAvailable(emp.name, iso, availability)
      );

      const managers = candidates.filter(e => e.position === POS_MANAGER);
      const pourers  = candidates.filter(e => e.position === POS_POURER);

      if (managers.length === 0) dayEntry[`warn${sid}`] = true;

      // Sort each group by fairness score (ascending = least recently worked)
      const sorted = arr =>
        arr.slice().sort((a, b) => _fairnessScore(a.name, fairnessData) - _fairnessScore(b.name, fairnessData));

      const picked = [];

      // Seat one Manager first
      const sortedMgr = sorted(managers);
      if (sortedMgr.length) picked.push(sortedMgr[0]);

      // Fill remaining slots: Wine Pourers first, extra Managers as overflow
      for (const emp of [...sorted(pourers), ...sortedMgr.slice(1)]) {
        if (picked.length >= target) break;
        if (!picked.some(p => p.name === emp.name)) picked.push(emp);
      }

      dayEntry[sid] = picked.map(e => ({ name: e.name, position: e.position }));
      picked.forEach(e => assignedToday.add(e.name));
    }

    schedule[iso] = dayEntry;
  }

  return schedule;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Availability check.
 * Returns true if the employee is available (or has no data — benefit of the doubt).
 * Returns false only if they have sheet data that does NOT include this date.
 */
function _isAvailable(name, iso, availability) {
  if (!availability[name]) return true;          // no data = available
  return availability[name].includes(iso);
}

/**
 * Fairness score — lower means "schedule this person sooner".
 *
 * Counts distinct days worked in the 4-week lookback window.
 * Days in the most recent week are weighted 3× (recency penalty).
 * A tiny random tiebreaker prevents alphabetical bias.
 */
function _fairnessScore(name, fairnessData) {
  const worked = fairnessData[name] || [];
  // The lookback window is already pre-filtered in getFairnessData(),
  // so every date in `worked` is within 4 weeks. We don't need to re-filter
  // here — just weight the most recent 7 days more heavily.
  const now = new Date();
  const recentCutoff = _toIso(_addDays(now, -7));

  let score = 0;
  worked.forEach(iso => {
    score += iso >= recentCutoff ? 3 : 1;
  });

  score += Math.random() * 0.5; // tiebreaker
  return score;
}
