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

// ── 6. Every lineup is eight fielders and a DH, best bats first ──
{
  const h = await boot();
  h.importRoster();
  const { fieldGroup, buildLineup, lineupPos } = h.L;
  const rateOf = b => h.U.projectedRates(b);
  const shape = t => { const g = { C:0, IF:0, OF:0, DH:0 }; t.batters.slice(0, 9).forEach(b => g[b.id === t.dhId ? 'DH' : fieldGroup(b.pos)]++); return g; };
  const okShape = g => g.C === 1 && g.IF === 4 && g.OF === 3 && g.DH === 1;
  // What a roster can field: 1 C, 4 IF, 3 OF where it has them, the gaps filled by other fielders, always eight plus a DH
  const okFor = t => { const n = t.batters.reduce((a, b) => { a[fieldGroup(b.pos)]++; return a; }, { C:0, IF:0, OF:0, DH:0 }), g = shape(t);
    return g.DH === 1 && g.C + g.IF + g.OF === 8 && g.C >= Math.min(1, n.C) && g.IF >= Math.min(4, n.IF) && g.OF >= Math.min(3, n.OF); };
  const T = h.L.LEAGUE.teams;
  check('import: every team fields 1 C, 4 IF, 3 OF and a DH', T.every(t => okShape(shape(t))), T.filter(t => !okShape(shape(t))).map(t => `${t.name} ${JSON.stringify(shape(t))}`).join('; '));
  check('import: a listed DH never fields', T.every(t => t.batters.slice(0, 9).every(b => fieldGroup(b.pos) !== 'DH' || b.id === t.dhId)));
  check('import: the DH is the best bat left after the fielders', T.every(t => { const dh = t.batters.find(b => b.id === t.dhId); return dh && t.batters.slice(9).every(b => rateOf(b).ops <= rateOf(dh).ops + 1e-12); }));
  check('import: the leadoff hitter has the best projected OBP of the nine', T.every(t => { const nine = t.batters.slice(0, 9); return nine.every(b => rateOf(b).obp <= rateOf(nine[0]).obp + 1e-12); }));
  check('import: the cleanup hitter is one of the three best bats after leadoff', T.every(t => { const rest = t.batters.slice(1, 9).map(b => rateOf(b).ops).sort((a, b) => b - a); return rateOf(t.batters[3]).ops >= rest[2] - 1e-12; }));
  check('import: the bench never out-hits a fielder at his own position', T.every(t => t.batters.slice(9).filter(b => fieldGroup(b.pos) !== 'DH').every(b => {
    const grp = fieldGroup(b.pos), starters = t.batters.slice(0, 9).filter(x => x.id !== t.dhId && fieldGroup(x.pos) === grp);
    return starters.every(x => rateOf(x).ops >= rateOf(b).ops - 1e-12); })));
  check('the DH shows as DH; everyone else shows his position', T.every(t => t.batters.every(b => lineupPos(t, b) === (b.id === t.dhId ? 'DH' : b.pos))));
  check('allBatters carries the DH badge', h.L.allBatters().filter(b => b.pos === 'DH').length === T.length + T.flatMap(t => t.batters.slice(9)).filter(b => fieldGroup(b.pos) === 'DH').length);
  // Rebuilding after a scramble restores the same nine in the same order (the builder is a function of the ratings, not of the current order)
  const t0 = T[0], before = t0.batters.slice(0, 9).map(b => b.id), dh0 = t0.dhId;
  t0.batters.reverse(); t0.dhId = null;
  buildLineup(t0);
  check('rebuild after a scramble restores the same nine in the same order', t0.batters.slice(0, 9).map(b => b.id).join() === before.join() && t0.dhId === dh0);
  // Two DH-labelled hitters: only one plays, and he is the better bat
  const t1 = T.find(t => t.batters.filter(b => fieldGroup(b.pos) === 'DH').length >= 2);
  if (t1) {
    const dhs = t1.batters.filter(b => fieldGroup(b.pos) === 'DH').sort((a, b) => rateOf(b).ops - rateOf(a).ops);
    const playing = t1.batters.slice(0, 9).filter(b => fieldGroup(b.pos) === 'DH');
    check('two listed DHs: at most one plays', playing.length <= 1 && (playing.length === 0 || t1.dhId === playing[0].id), `${t1.name}: ${dhs.map(b => `${b.name} ${rateOf(b).ops.toFixed(3)}`).join(', ')}`);
  } else console.log('SKIP  two-DH check (no team lists two DHs)');
  // A roster with no catcher still fields nine, filling C from the best other fielder; a listed DH is not used to field
  const t2 = { id: 999, name: 'No Catchers', batters: T[1].batters.filter(b => fieldGroup(b.pos) !== 'C').map(b => ({ ...b })), pitchers: [] };
  buildLineup(t2);
  const g2 = shape(t2);
  check('no catcher on the roster: nine still play, no listed DH fields', t2.batters.slice(0, 9).length === 9 && g2.DH === 1 && g2.C === 0 && g2.IF + g2.OF === 8 && t2.batters.slice(0, 9).every(b => fieldGroup(b.pos) !== 'DH' || b.id === t2.dhId), JSON.stringify(g2));
  // A generated league gets lineups too
  h.L.generateLeague(); h.drain();
  check('generated league: every team fields 1 C, 4 IF, 3 OF and a DH', h.L.LEAGUE.teams.every(t => okShape(shape(t))));
  // A league file keeps its saved order and DH
  const sim = path.join(ROOT, 'Configs', 'MLB_2026_simulated.json');
  if (fs.existsSync(sim)) {
    const saved = JSON.parse(fs.readFileSync(sim, 'utf8')).teams[0].batters.map(b => b.id);
    h.importLeague(sim);
    check('league file import keeps its saved batting order', h.L.LEAGUE.teams[0].batters.map(b => b.id).join() === saved.join());
    h.L.buildAllLineups(); h.drain();
    check('Set All Lineups rebuilds a league file (a roster with no catcher fields its best other bat there)', h.L.LEAGUE.teams.every(okFor), h.L.LEAGUE.teams.filter(t => !okShape(shape(t))).map(t => `${t.name} ${JSON.stringify(shape(t))}`).join('; '));
  }
}

// ── 7. Ball-in-play model: power adds hits, contact and speed move BABIP a little ──
{
  const h = await boot();
  const { ballInPlayMix, projectBatterMix, projectedRates } = h.U;
  const base = { kPct:.222, bbPct:.089, hrPct:.0325, singlePct:.149, doublePct:.051, triplePct:.004, goPct:.203, foPct:.165, sbRate:.075 };
  const sum = m => Object.values(m).reduce((a, b) => a + b, 0);
  const fallIn = m => m.single + m.dbl + m.triple;
  const avg = ballInPlayMix(base), power = ballInPlayMix({ ...base, hrPct: .08 }), weak = ballInPlayMix({ ...base, hrPct: .01 });
  check('ball-in-play shares sum to 1', [avg, power, weak].every(m => Math.abs(sum(m) - 1) < 1e-9));
  check('power adds home runs on top of the hits that fall in', power.hr > avg.hr && avg.hr > weak.hr && Math.abs(fallIn(power) / (1 - power.hr) - fallIn(avg) / (1 - avg.hr)) < 1e-9, `BABIP ${(fallIn(power) / (1 - power.hr)).toFixed(3)} at both`);
  check('a power bat has more total hits per ball in play, not fewer', fallIn(power) + power.hr > fallIn(avg) + avg.hr);
  const whiff = ballInPlayMix({ ...base, kPct: .32 }), contact = ballInPlayMix({ ...base, kPct: .12 });
  const babip = m => fallIn(m) / (1 - m.hr);
  check('contact moves BABIP a little, in the right direction', babip(contact) > babip(avg) && babip(avg) > babip(whiff) && babip(contact) - babip(whiff) < .05, `${babip(whiff).toFixed(3)} .. ${babip(contact).toFixed(3)}`);
  const fast = ballInPlayMix({ ...base, sbRate: .15 }), slow = ballInPlayMix({ ...base, sbRate: .02 });
  check('speed raises BABIP and adds singles', babip(fast) > babip(slow) && fast.single > slow.single && Math.abs(fast.hr - slow.hr) < 1e-9);
  const lean = ballInPlayMix(base, .04);
  check('a ground-ball pitcher gets more ground outs, same hits', lean.go > avg.go && Math.abs(fallIn(lean) + lean.hr - fallIn(avg) - avg.hr) < 1e-9);
  const pm = projectBatterMix(base);
  check('projection mix sums to 1 and matches the ball-in-play mix', Math.abs(sum(pm) - 1) < 1e-9 && Math.abs(pm.hr / (1 - pm.k - pm.walk - pm.hbp) - avg.hr) < 1e-9);
  const r = projectedRates(base);
  check('an average bat projects near the 2026 line', Math.abs(r.avg - .244) < .015 && Math.abs(r.obp - .317) < .015 && Math.abs(r.slg - .400) < .04, `AVG ${r.avg.toFixed(3)} OBP ${r.obp.toFixed(3)} SLG ${r.slg.toFixed(3)}`);
}

console.log(failed ? `${failed} check(s) failed` : 'engine OK');
process.exit(failed ? 1 : 0);
