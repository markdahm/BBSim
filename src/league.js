import { MLB_STRUCTURE, POSITIONS, EMOJIS, MLB, B_ARCHS, P_ARCHS } from './data.js';
import { ri, rn, rand, cl, randomColor } from './utils.js';

// ====================================================================
// LEAGUE STATE (persisted in localStorage)
// ====================================================================
export let LEAGUE = null;

export function initLeague() {
  const saved = localStorage.getItem('diamond-league-v3');
  if (saved) {
    try { LEAGUE = JSON.parse(saved); return; } catch(e) {}
  }
  generateLeague();
}

export function generateLeague() {
  LEAGUE = {
    name: 'Diamond League',
    season: 2025,
    teams: [],
    gamesPlayed: 0,
  };
  let teamId = 0;
  for (const [leagueName, divisions] of Object.entries(MLB_STRUCTURE)) {
    for (const [divName, teamNames] of Object.entries(divisions)) {
      for (const tname of teamNames) {
        const parts = tname.split(' ');
        const nickname = parts.slice(1).join(' ');
        const city = parts[0];
        LEAGUE.teams.push({
          id: teamId++,
          name: tname,
          city, nickname,
          league: leagueName,
          division: divName,
          color: randomColor(),
          emoji: EMOJIS[ri(EMOJIS.length)],
          w: 0, l: 0,
          runsFor: 0, runsAgainst: 0,
          batters: POSITIONS.map(p => mkBatter(p)),
          pitchers: [mkPitcher(), mkPitcher(), mkPitcher()],
          activePitcher: 0,
          seasonLog: [],
        });
      }
    }
  }
  saveLeague();
}

export function saveLeague() {
  localStorage.setItem('diamond-league-v3', JSON.stringify(LEAGUE));
  const ind = document.getElementById('save-ind');
  if (ind) { ind.textContent = '✓ Saved'; ind.className = 'save-indicator saved'; setTimeout(() => { ind.textContent = '● Auto-saved to browser'; ind.className = 'save-indicator'; }, 2000); }
}

// ====================================================================
// PLAYER FACTORIES
// ====================================================================
export function mkBatter(pos) {
  const a = B_ARCHS[ri(B_ARCHS.length)];
  return {
    id: Math.random().toString(36).slice(2),
    name: rn(), pos, arch: a.l, type: 'batter',
    num: ri(99) + 1,
    emoji: EMOJIS[ri(EMOJIS.length)],
    avg:       cl(0.248 + a.avgD + rand(-.022, .022), .190, .330),
    kPct:      cl(MLB.k    + a.kD  + rand(-.03, .03),  .10, .40),
    bbPct:     cl(MLB.walk + a.bbD + rand(-.02, .02),  .04, .18),
    hrPct:     cl(MLB.hr   + a.hrD + rand(-.01, .015), .005, .08),
    singlePct: cl(MLB.single        + rand(-.02, .02),  .08, .22),
    doublePct: cl(MLB.double        + rand(-.01, .01),  .02, .09),
    triplePct: cl(MLB.triple + (a.trD || 0) + rand(0, .005), .001, .012),
    goPct:     cl(MLB.go + (a.goD || 0) + rand(-.02, .02), .12, .30),
    foPct:     cl(MLB.fo                + rand(-.02, .02), .10, .25),
    sbRate: rand(.02, .15), sbPct: rand(.62, .85),
    career: { pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 },
    seasons: [],
  };
}

export function mkPitcher() {
  const a = P_ARCHS[ri(P_ARCHS.length)];
  return {
    id: Math.random().toString(36).slice(2),
    name: rn(), pos: 'P', arch: a.l, type: 'pitcher',
    num: ri(99) + 1,
    emoji: EMOJIS[ri(EMOJIS.length)],
    era:   cl(3.85 + a.eraD + rand(-.5, .5), 2.20, 6.00),
    kPct:  cl(MLB.k    + a.kD  + rand(-.02, .02), .14, .35),
    bbPct: cl(MLB.walk + a.bbD + rand(-.01, .02), .04, .14),
    goD: a.goD || 0,
    career: { g:0, ip:0, h:0, er:0, bb:0, k:0, w:0, l:0, sv:0 },
    seasons: [],
  };
}

// ====================================================================
// LEAGUE-WIDE PLAYER ACCESSORS
// ====================================================================
export function allBatters()  { return LEAGUE.teams.flatMap(t => t.batters.map(b => ({...b, teamName: t.name}))); }
export function allPitchers() { return LEAGUE.teams.flatMap(t => t.pitchers.map(p => ({...p, teamName: t.name}))); }
