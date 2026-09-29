// Plays a full season headless and checks the league lands on 2026 MLB rates.
// This is the calibration test: run it after any change to the pitch model, ratings or rosters.
//
//   node tools/season.mjs                      # Configs roster + 2026 schedule
//   node tools/season.mjs path/to/roster.csv   # another roster, same schedule
//   node tools/season.mjs --no-check           # print only, never fail
import { boot, leagueTotals } from './headless.mjs';

// 2026 MLB (Baseball-Reference league totals) and the bands a 2,430-game season should stay inside.
const TARGET = { bbPct: [8.9, 8.3, 9.5], kPct: [22.2, 21.0, 23.4], hrPct: [3.0, 2.7, 3.4], hbpPct: [1.15, 0.9, 1.4], avg: [.244, .232, .256], runsPerGame: [4.48, 4.1, 4.9] };

const args = process.argv.slice(2);
const check = !args.includes('--no-check');
const roster = args.find(a => !a.startsWith('--'));

const h = await boot();
h.importRoster(roster);
h.importSchedule();
h.G.gToggleHideAnimation();          // quiet, like All of 'em
const t0 = Date.now();
h.G.gAutoAll();
h.drain();
const sched = h.L.LEAGUE.schedule;
const played = sched.filter(g => g.played).length;
const T = leagueTotals(h.L);
console.log(`${played} of ${sched.length} games in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${h.stats.ticks} ticks, max ${h.stats.maxPendingTicks} pending loop`);
console.log(`PA ${T.pa}  BB ${T.bbPct.toFixed(2)}%  K ${T.kPct.toFixed(2)}%  HR ${T.hrPct.toFixed(2)}%  HBP ${T.hbpPct.toFixed(2)}%  AVG ${T.avg.toFixed(3)}  OBP ${T.obp.toFixed(3)}  R/G ${T.runsPerGame.toFixed(2)}  ERA ${T.era.toFixed(2)}  RBI/R ${T.rbiPerRun.toFixed(3)}  SB ${T.sb}`);
const B = h.L.LEAGUE.teams.flatMap(t => t.batters.map(b => b.career)).filter(c => c.pa >= 300).map(c => 100 * c.bb / c.pa).sort((a, b) => a - b);
console.log(`BB% spread, 300+ PA (n=${B.length}): min ${B[0].toFixed(1)}  p10 ${B[Math.floor(B.length * .1)].toFixed(1)}  median ${B[Math.floor(B.length / 2)].toFixed(1)}  p90 ${B[Math.floor(B.length * .9)].toFixed(1)}  max ${B.at(-1).toFixed(1)}`);

let failed = 0;
if (played !== sched.length) { console.log(`FAIL: ${sched.length - played} games not played`); failed++; }
if (h.stats.maxPendingTicks > 1) { console.log(`FAIL: ${h.stats.maxPendingTicks} auto-play loops pending at once`); failed++; }
if (check) for (const [k, [target, lo, hi]] of Object.entries(TARGET)) {
  const v = T[k];
  if (v < lo || v > hi) { console.log(`FAIL: ${k} ${v.toFixed(3)} outside ${lo}-${hi} (2026 MLB ${target})`); failed++; }
}
console.log(failed ? `${failed} check(s) failed` : 'season OK');
process.exit(failed ? 1 : 0);
