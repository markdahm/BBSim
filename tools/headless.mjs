// Runs the BBSim modules in Node with no browser: a stub DOM that swallows every call, an in-memory
// localStorage, and a timer queue you drain by hand so auto-play loops can be counted and stepped.
// Used by tools/season.mjs and tools/check-engine.mjs.
//
//   const h = await boot();                 // h.L league.js, h.V views.js, h.G game.js
//   h.importRoster(); h.importSchedule();   // Configs/ files by default
//   h.G.gAutoAll(); h.drain();              // run every pending timer until the queue is empty
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ROSTER = path.join(ROOT, 'Configs', 'MLB Rosters 2026 players.csv');
export const DEFAULT_SCHEDULE = path.join(ROOT, 'Configs', '2026 MLB Schedule.json');

// Every DOM call returns another stub, so render code runs without effect.
const stub = () => { const f = function () {}; const p = new Proxy(f, {
  get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === Symbol.iterator ? function* () {} : p,
  apply: () => p, set: () => true, construct: () => p }); return p; };

export async function boot({ limitMs = 170000 } = {}) {
  const store = {};
  const writes = [];
  globalThis.document = stub();
  globalThis.window = stub();
  globalThis.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); writes.push(k); },
    removeItem: k => { delete store[k]; },
  };
  const alerts = [];
  globalThis.alert = m => alerts.push(m);
  globalThis.confirm = () => true;
  globalThis.prompt = () => '999999';
  globalThis.FileReader = class { readAsText(f) { this.onload({ target: { result: f.text } }); } };

  // Timer queue: setTimeout enqueues, drain() runs timers in delay order. A real timer bounds the run.
  const realSetTimeout = globalThis.setTimeout;
  realSetTimeout(() => { console.error(`headless run exceeded ${limitMs} ms; stopping`); process.exit(2); }, limitMs).unref?.();
  let queue = [], nextId = 0;
  const stats = { ticks: 0, maxPendingTicks: 0 };
  const isTick = t => String(t.f).includes('autoTick');
  globalThis.setTimeout = (f, ms) => { const id = ++nextId; queue.push({ id, f, ms: ms || 0 }); return id; };
  globalThis.clearTimeout = id => { queue = queue.filter(t => t.id !== id); };
  function drain(limit = 1e7) {
    let n = 0;
    while (queue.length && n++ < limit) {
      const pending = queue.filter(isTick).length;
      if (pending > stats.maxPendingTicks) stats.maxPendingTicks = pending;
      queue.sort((a, b) => a.ms - b.ms);
      const t = queue.shift();
      if (isTick(t)) stats.ticks++;
      t.f();
    }
  }
  const pendingTicks = () => queue.filter(isTick).length;

  const L = await import(path.join(ROOT, 'src', 'league.js'));
  const V = await import(path.join(ROOT, 'src', 'views.js'));
  const G = await import(path.join(ROOT, 'src', 'game.js'));
  L.initLeague();

  const fileInput = (name, text) => ({ files: [{ name, text }], value: '' });
  const importRoster = (file = DEFAULT_ROSTER) => { L.importFromCSV(fs.readFileSync(file, 'utf8')); drain(); };
  const importSchedule = (file = DEFAULT_SCHEDULE) => { V.schedImport(fileInput(path.basename(file), fs.readFileSync(file, 'utf8'))); drain(); V.schedLoadPick(0); drain(); };
  const importLeague = (file) => { L.importRosters(fileInput(path.basename(file), fs.readFileSync(file, 'utf8'))); drain(); };
  const pitchCount = () => G.G.away.pitchers.concat(G.G.home.pitchers).reduce((s, p) => s + p.game.pitches, 0);

  return { L, V, G, store, writes, alerts, drain, pendingTicks, stats, importRoster, importSchedule, importLeague, pitchCount, fileInput };
}

export function leagueTotals(L) {
  const B = L.LEAGUE.teams.flatMap(t => t.batters.map(b => b.career));
  const P = L.LEAGUE.teams.flatMap(t => t.pitchers.map(p => p.career));
  const sum = (A, k) => A.reduce((x, c) => x + (c[k] || 0), 0);
  const pa = sum(B, 'pa'), ab = sum(B, 'ab'), games = L.LEAGUE.teams.reduce((x, t) => x + t.w, 0);
  return {
    pa, games,
    bbPct: 100 * sum(B, 'bb') / pa, kPct: 100 * sum(B, 'k') / pa, hrPct: 100 * sum(B, 'hr') / pa, hbpPct: 100 * sum(B, 'hbp') / pa,
    avg: sum(B, 'h') / ab, obp: (sum(B, 'h') + sum(B, 'bb') + sum(B, 'hbp')) / pa,
    runsPerGame: sum(B, 'r') / games / 2, era: 9 * sum(P, 'er') / sum(P, 'ip'),
    rbiPerRun: sum(B, 'rbi') / sum(B, 'r'), sb: sum(B, 'sb'), cs: sum(B, 'cs'),
  };
}
