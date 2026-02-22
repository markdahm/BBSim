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
// CSV / TSV ROSTER IMPORT
// ====================================================================

function mkBatterFromCSV(row) {
  const contact  = cl(parseInt(row.contact)  || 3, 1, 5);
  const power    = cl(parseInt(row.power)    || 3, 1, 5);
  const patience = cl(parseInt(row.patience) || 3, 1, 5);
  const speed    = cl(parseInt(row.speed)    || 3, 1, 5);

  const avg       = cl(0.195 + (contact-1)/4 * 0.130, .190, .330);
  const kPct      = cl(0.360 - (contact-1)/4 * 0.160 - (patience-1)/4 * 0.060, .10, .40);
  const hrPct     = cl(0.008 + (power-1)/4 * 0.055, .005, .08);
  const doublePct = cl(0.022 + (power-1)/4 * 0.050, .02, .09);
  const bbPct     = cl(0.035 + (patience-1)/4 * 0.130, .04, .18);
  const sbRate    = cl(0.015 + (speed-1)/4 * 0.185, .02, .25);
  const triplePct = cl(0.001 + (speed-1)/4 * 0.011, .001, .012);
  const goPct     = cl(0.250 - (power-1)/4 * 0.080, .12, .30);
  const foPct     = cl(0.140 + (power-1)/4 * 0.060, .10, .25);
  const singlePct = cl(MLB.single + rand(-.01, .01), .08, .22);
  const arch = power >= 4 ? 'Power Hitter' : contact >= 4 ? 'Contact Hitter'
    : patience >= 4 ? 'Patient Hitter' : speed >= 4 ? 'Speed Demon' : 'Balanced';
  return {
    id: Math.random().toString(36).slice(2),
    name: `${row.firstName} ${row.lastName}`,
    pos: row.position || 'IF', arch, type: 'batter',
    num: parseInt(row.num) || ri(99) + 1,
    emoji: EMOJIS[ri(EMOJIS.length)],
    avg, kPct, bbPct, hrPct, singlePct, doublePct, triplePct, goPct, foPct,
    sbRate, sbPct: rand(.62, .85),
    career: { pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 },
    seasons: [],
  };
}

function mkPitcherFromCSV(row) {
  const strikeout = cl(parseInt(row.strikeout) || 3, 1, 5);
  const gbRate    = cl(parseInt(row.gbRate)    || 3, 1, 5);
  const control   = cl(parseInt(row.control)   || 3, 1, 5);
  const stuff     = cl(parseInt(row.stuff)     || 3, 1, 5);
  const kPct  = cl(0.120 + (strikeout-1)/4 * 0.220, .14, .35);
  const bbPct = cl(0.130 - (control-1)/4  * 0.090, .04, .14);
  const era   = cl(5.80  - (stuff-1)/4    * 3.300, 2.20, 6.00);
  const goD   = -0.06 + (gbRate-1)/4 * 0.14;
  const arch  = stuff >= 4 ? 'Ace' : strikeout >= 4 ? 'Strikeout Artist'
    : control >= 4 ? 'Control Pitcher' : 'Reliever';
  return {
    id: Math.random().toString(36).slice(2),
    name: `${row.firstName} ${row.lastName}`,
    pos: 'P', arch, type: 'pitcher',
    num: parseInt(row.num) || ri(99) + 1,
    emoji: EMOJIS[ri(EMOJIS.length)],
    era, kPct, bbPct, goD,
    career: { g:0, ip:0, h:0, er:0, bb:0, k:0, w:0, l:0, sv:0 },
    seasons: [],
  };
}

const REAL_MLB_DIVISIONS = {
  'Baltimore Orioles':     { league:'American League', division:'AL East' },
  'Boston Red Sox':        { league:'American League', division:'AL East' },
  'New York Yankees':      { league:'American League', division:'AL East' },
  'Tampa Bay Rays':        { league:'American League', division:'AL East' },
  'Toronto Blue Jays':     { league:'American League', division:'AL East' },
  'Chicago White Sox':     { league:'American League', division:'AL Central' },
  'Cleveland Guardians':   { league:'American League', division:'AL Central' },
  'Detroit Tigers':        { league:'American League', division:'AL Central' },
  'Kansas City Royals':    { league:'American League', division:'AL Central' },
  'Minnesota Twins':       { league:'American League', division:'AL Central' },
  'Houston Astros':        { league:'American League', division:'AL West' },
  'Los Angeles Angels':    { league:'American League', division:'AL West' },
  'Oakland Athletics':     { league:'American League', division:'AL West' },
  'Seattle Mariners':      { league:'American League', division:'AL West' },
  'Texas Rangers':         { league:'American League', division:'AL West' },
  'Atlanta Braves':        { league:'National League', division:'NL East' },
  'Miami Marlins':         { league:'National League', division:'NL East' },
  'New York Mets':         { league:'National League', division:'NL East' },
  'Philadelphia Phillies': { league:'National League', division:'NL East' },
  'Washington Nationals':  { league:'National League', division:'NL East' },
  'Chicago Cubs':          { league:'National League', division:'NL Central' },
  'Cincinnati Reds':       { league:'National League', division:'NL Central' },
  'Milwaukee Brewers':     { league:'National League', division:'NL Central' },
  'Pittsburgh Pirates':    { league:'National League', division:'NL Central' },
  'St. Louis Cardinals':   { league:'National League', division:'NL Central' },
  'Arizona Diamondbacks':  { league:'National League', division:'NL West' },
  'Colorado Rockies':      { league:'National League', division:'NL West' },
  'Los Angeles Dodgers':   { league:'National League', division:'NL West' },
  'San Diego Padres':      { league:'National League', division:'NL West' },
  'San Francisco Giants':  { league:'National League', division:'NL West' },
};

export function importFromCSV(text) {
  // Strip BOM and normalize line endings
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.trim().split('\n');

  // Parse a single comma-separated line, respecting quoted fields
  const parseLine = line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };

  // Normalize division names from CSV ("A.L. East" → "AL East")
  const divNorm = {
    'A.L. East':'AL East', 'A.L. Central':'AL Central', 'A.L. West':'AL West',
    'N.L. East':'NL East', 'N.L. Central':'NL Central', 'N.L. West':'NL West',
  };

  // CSV column layout after removing the photo column (index-based, header row skipped):
  // 0=league, 1=division, 2=team, 3=num, 4=firstName, 5=lastName,
  // 6=position, 7=bat, 8=contact, 9=power, 10=patience, 11=speed,
  // 12=strikeout, 13=gbRate, 14=control, 15=stuff
  const rows = lines.slice(1)
    .map(parseLine)
    .filter(v => v[2] && v[4] && v[5])
    .map(v => ({
      league:    v[0] || '',
      division:  divNorm[v[1]] || v[1] || '',
      team:      v[2],
      num:       v[3],
      firstName: v[4],
      lastName:  v[5],
      position:  v[6],
      contact:   v[8],
      power:     v[9],
      patience:  v[10],
      speed:     v[11],
      strikeout: v[12],
      gbRate:    v[13],
      control:   v[14],
      stuff:     v[15],
    }));
  const teamMap = new Map();
  for (const row of rows) {
    if (!teamMap.has(row.team)) teamMap.set(row.team, { league: row.league, division: row.division, players: [] });
    teamMap.get(row.team).players.push(row);
  }

  let teamId = 0;
  const teams = [];
  for (const [teamName, { league, division, players }] of teamMap) {
    const parts = teamName.trim().split(' ');
    const nickname = parts[parts.length - 1];
    const city = parts.slice(0, -1).join(' ');

    const rawBatters = players.filter(p => p.position !== 'Pitcher');
    const batters = rawBatters.map(mkBatterFromCSV);
    while (batters.length < 9) batters.push(mkBatter(POSITIONS[batters.length % POSITIONS.length]));

    const rawPitchers = players.filter(p => p.position === 'Pitcher');
    const pitchers = rawPitchers.length > 0 ? rawPitchers.map(mkPitcherFromCSV)
      : [mkPitcher(), mkPitcher(), mkPitcher()];

    teams.push({
      id: teamId++, name: teamName, city, nickname,
      league, division,
      color: randomColor(), emoji: EMOJIS[ri(EMOJIS.length)],
      w: 0, l: 0, runsFor: 0, runsAgainst: 0,
      batters, pitchers, activePitcher: 0, seasonLog: [],
    });
  }

  LEAGUE = { name: 'MLB 2025', season: 2025, teams, gamesPlayed: 0 };
  saveLeague();
}

export function importRosters(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { importFromCSV(e.target.result); window.nav('home'); };
  reader.readAsText(file);
}

// ====================================================================
// LEAGUE-WIDE PLAYER ACCESSORS
// ====================================================================
export function allBatters()  { return LEAGUE.teams.flatMap(t => t.batters.map(b => ({...b, teamName: t.name}))); }
export function allPitchers() { return LEAGUE.teams.flatMap(t => t.pitchers.map(p => ({...p, teamName: t.name}))); }
