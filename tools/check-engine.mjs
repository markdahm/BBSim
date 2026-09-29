// Engine checks that need no browser. Each prints PASS or FAIL and the run exits non-zero on any FAIL.
//   node tools/check-engine.mjs
import fs from 'fs';
import path from 'path';
import { boot, ROOT, DEFAULT_ROSTER } from './headless.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };

// ── 1. A saved league that cannot be read is kept, not overwritten ──
{
  const h = await boot();
  const bad = '{"name":"KEEP ME","teams":[{"id":0,"name":"X"}]}';   // teams[0].pitchers missing: throws in the CL migration
  h.store['diamond-league-v3'] = bad;
  const before = h.alerts.length;
  const err = console.error; console.error = () => {};   // initLeague logs the read failure; that line is expected here
  h.L.initLeague();
  console.error = err;
  check('unreadable saved league: alert shown', h.alerts.length === before + 1);
  check('unreadable saved league: kept and backed up', h.store['diamond-league-v3'] === bad && h.store['diamond-league-v3.bak'] === bad);
  h.L.saveLeague(); h.drain();
  check('unreadable saved league: nothing written while locked', h.store['diamond-league-v3'] === bad);
  h.importRoster(); h.drain();
  check('import unlocks saving', JSON.parse(h.store['diamond-league-v3']).name === 'MLB 2026');
}

// ── 2. Saves are debounced and skip what has not changed ──
{
  const h = await boot();
  h.importRoster(); h.importSchedule();
  const start = h.writes.length;
  for (let i = 0; i < 5; i++) h.L.saveLeague();
  h.drain();
  const w = h.writes.slice(start);
  check('5 saveLeague() calls -> 1 league write, schedules unchanged not rewritten', w.filter(k => k === 'diamond-league-v3').length === 1 && !w.includes('dlg-saved-schedules'), w.join(','));
  h.G.startGame(h.L.LEAGUE.teams[0].id, h.L.LEAGUE.teams[1].id); h.L.flushLeague();
  check('per-game scratch is not saved', !h.store['diamond-league-v3'].includes('"game":'));
}

// ── 3. A season archive is refused as a league ──
{
  const h = await boot();
  h.importRoster();
  const dir = path.join(ROOT, 'Configs', 'SavedGames');
  const archive = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => f.endsWith('.json')) : null;
  if (archive) {
    const teamsBefore = h.L.LEAGUE.teams;
    h.importLeague(path.join(dir, archive));
    check('season archive refused, league untouched', h.L.LEAGUE.teams === teamsBefore && /no player ratings/.test(h.alerts.at(-1) || ''), archive);
  } else console.log('SKIP  season archive check (no file in Configs/SavedGames)');
  const sim = path.join(ROOT, 'Configs', 'MLB_2026_simulated.json');
  if (fs.existsSync(sim)) { h.importLeague(sim); check('simulated season file imports as a league', h.L.leagueIsPlayable(h.L.LEAGUE) && h.L.LEAGUE.teams.length === 30); }
}

// ── 4. One auto-play loop, correct scopes, manual takeover ──
{
  const h = await boot();
  h.importRoster(); h.importSchedule();
  const T = h.L.LEAGUE.teams;
  h.G.startGame(T[0].id, T[1].id); h.drain();
  h.G.gAuto(); h.drain();
  check('half-inning auto stops at the half', h.G.G.inning === 1 && h.G.G.half === 1 && h.pendingTicks() === 0);
  h.G.gAutoGame(); h.drain();
  check('game auto stops at the final', h.G.G.over && h.pendingTicks() === 0);
  h.G.startGame(T[2].id, T[3].id); h.drain();
  h.G.gAutoGame(); h.G.gSinglePitch(); const p = h.pitchCount(); h.drain();
  check('a manual pitch retires the auto loop', h.pitchCount() === p, `${p} pitches`);
  h.G.gToggleHideAnimation();
  h.stats.ticks = 0; h.stats.maxPendingTicks = 0;
  h.G.gAutoAll(); h.drain();
  const S = h.L.LEAGUE.schedule;
  check('whole season plays with one loop', S.every(g => g.played) && h.stats.maxPendingTicks === 1, `${h.stats.ticks} ticks`);
  check('end of schedule clears the running state', h.G.G.running === false);
  h.L.LEAGUE.playoffs = null; h.V.generatePlayoffs(); h.drain();
  h.stats.maxPendingTicks = 0;
  h.G.playoffAutoAll(); h.drain();
  const ws = h.L.LEAGUE.playoffs.series.find(s => s.id === 'ws');
  check('playoffs auto-play to a champion with one loop', h.L.LEAGUE.playoffs.round === 'complete' && ws.winner != null && h.stats.maxPendingTicks <= 1);
}

// ── 5. Steals credit the runner who was on base ──
{
  const h = await boot();
  h.importRoster();
  const T = h.L.LEAGUE.teams, all = T.flatMap(t => t.batters);
  let attempts = 0, wrong = 0;
  for (let g = 0; g < 60; g++) {
    const a = g % 30, b = (g * 7 + 1) % 30; if (a === b) continue;
    h.G.startGame(T[a].id, T[b].id); h.drain();
    let n = 0;
    while (!h.G.G.over && n++ < 4000) {
      const G = h.G.G, bat = (G.half === 0 ? G.away : G.home).batters[G.lineupIdx[G.half]];
      const eligible = new Set([...G.bases.filter(Boolean), bat]);   // the batter may reach on this pitch and then run
      const before = new Map(all.map(x => [x, (x.career.sb || 0) + (x.career.cs || 0)]));
      h.G.gPitch();
      for (const x of all) { const d = (x.career.sb || 0) + (x.career.cs || 0) - before.get(x); if (d > 0) { attempts += d; if (!eligible.has(x)) wrong += d; } }
    }
  }
  check('steals credited only to runners on base', wrong === 0 && attempts > 0, `${attempts} attempts, ${wrong} wrong`);
}

console.log(failed ? `${failed} check(s) failed` : 'engine OK');
process.exit(failed ? 1 : 0);
