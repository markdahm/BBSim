import { MLB_STRUCTURE, POSITIONS, EMOJIS, MLB, B_ARCHS, P_ARCHS } from './data.js';
import { ri, rn, rand, cl, randomColor } from './utils.js';

// ====================================================================
// LEAGUE STATE (persisted in localStorage)
// ====================================================================
export let LEAGUE = null;

export function initLeague() {
  const saved = localStorage.getItem('diamond-league-v3');
  if (saved) {
    try {
      LEAGUE = JSON.parse(saved);
      // Restore logos stored separately to avoid localStorage quota limits
      (LEAGUE.teams || []).forEach(t => {
        const logo = localStorage.getItem(`dlg-logo-${t.id}`);
        if (logo) t.logo = logo;
      });
      return;
    } catch(e) {}
  }
  generateLeague();
}

export function generateLeague() {
  LEAGUE = {
    name: 'Diamond League',
    season: 2025,
    teams: [],
    gamesPlayed: 0,
    savedSchedules: [],
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
  // Save logos to separate keys so the main payload stays within localStorage limits
  (LEAGUE.teams || []).forEach(t => {
    if (t.logo) {
      try { localStorage.setItem(`dlg-logo-${t.id}`, t.logo); } catch(e) {}
    } else {
      localStorage.removeItem(`dlg-logo-${t.id}`);
    }
  });
  // Save league data without logo blobs
  const slim = { ...LEAGUE, teams: LEAGUE.teams.map(({ logo, ...rest }) => rest) };
  try {
    localStorage.setItem('diamond-league-v3', JSON.stringify(slim));
    const ind = document.getElementById('save-ind');
    if (ind) { ind.textContent = '✓ Saved'; ind.className = 'save-indicator saved'; setTimeout(() => { ind.textContent = '● Auto-saved to browser'; ind.className = 'save-indicator'; }, 2000); }
  } catch(e) {
    const ind = document.getElementById('save-ind');
    if (ind) { ind.textContent = '⚠ Storage full — Export to save'; ind.className = 'save-indicator'; }
  }
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
  // CSV values are 0–100, same scale as the scouting report editor
  const contact  = cl(parseInt(row.contact)  || 50, 0, 99);
  const power    = cl(parseInt(row.power)    || 50, 0, 99);
  const patience = cl(parseInt(row.patience) || 50, 0, 99);
  const speed    = cl(parseInt(row.speed)    || 50, 0, 99);

  // Same inverse formulas as updateRating — CSV value → internal probability
  const kPct      = cl((1 - contact/100)  * 0.40, 0.10, 0.40);
  const hrPct     = cl((power/100)         * 0.08, 0.005, 0.08);
  const bbPct     = cl((patience/100)      * 0.18, 0.04, 0.18);
  const sbRate    = cl((speed/100)         * 0.15, 0.02, 0.25);
  const doublePct = cl(0.022 + (power/100) * 0.050, .02, .09);
  const triplePct = cl(0.001 + (speed/100) * 0.011, .001, .012);
  const goPct     = cl(0.250 - (power/100) * 0.080, .12, .30);
  const foPct     = cl(0.140 + (power/100) * 0.060, .10, .25);
  const avg       = cl(0.195 + (contact/100) * 0.130, .190, .330);
  const singlePct = cl(MLB.single + rand(-.01, .01), .08, .22);
  const arch = power >= 75 ? 'Power Hitter' : contact >= 75 ? 'Contact Hitter'
    : patience >= 75 ? 'Patient Hitter' : speed >= 75 ? 'Speed Demon' : 'Balanced';
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
  // CSV values are 0–100, same scale as the scouting report editor
  const strikeout = cl(parseInt(row.strikeout) || 50, 0, 99);
  const gbRate    = cl(parseInt(row.gbRate)    || 50, 0, 99);
  const control   = cl(parseInt(row.control)   || 50, 0, 99);
  const stuff     = cl(parseInt(row.stuff)     || 50, 0, 99);

  // Same inverse formulas as updateRating — CSV value → internal probability
  const kPct  = cl((strikeout/100)       * 0.35, 0.14, 0.35);
  const bbPct = cl((1 - control/100)     * 0.14, 0.04, 0.14);
  const era   = cl(6.0 - (stuff/100)     * 4.0,  2.0,  6.0);
  const goD   = (gbRate/100) * 0.08 - 0.04;
  const arch  = stuff >= 75 ? 'Ace' : strikeout >= 75 ? 'Strikeout Artist'
    : control >= 75 ? 'Control Pitcher' : 'Reliever';
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
  // Clear any logos stored from a previous league so they don't bleed into the new one
  if (LEAGUE && LEAGUE.teams) LEAGUE.teams.forEach(t => localStorage.removeItem(`dlg-logo-${t.id}`));

  // Strip BOM and normalize line endings
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.trim().split('\n');
  if (lines.length < 2) { alert('Import failed: file appears empty or has no data rows.'); return; }

  // Auto-detect delimiter from header row
  const header = lines[0];
  const delim = header.includes('\t') ? '\t' : ',';

  // Parse a single delimited line (quote-aware for commas; simple split for tabs)
  const parseLine = line => {
    if (delim === '\t') return line.split('\t').map(v => v.trim());
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

  // Parse header to get column name → index mapping (case-insensitive, ignoring spaces/underscores)
  const headerCols = parseLine(header);
  const norm = s => s.toLowerCase().replace(/[\s_\-\.#]+/g, '');
  const colIdx = {};
  headerCols.forEach((h, i) => { colIdx[norm(h)] = i; });

  // Flexible column name lookup: tries multiple aliases
  const col = (row, ...aliases) => {
    for (const a of aliases) {
      const idx = colIdx[norm(a)];
      if (idx !== undefined && row[idx] !== undefined) return row[idx].trim();
    }
    return '';
  };

  // Normalize division names from CSV ("A.L. East" → "AL East")
  const divNorm = {
    'A.L. East':'AL East', 'A.L. Central':'AL Central', 'A.L. West':'AL West',
    'N.L. East':'NL East', 'N.L. Central':'NL Central', 'N.L. West':'NL West',
    'aleast':'AL East', 'alcentral':'AL Central', 'alwest':'AL West',
    'nleast':'NL East', 'nlcentral':'NL Central', 'nlwest':'NL West',
  };

  const rows = lines.slice(1)
    .map(parseLine)
    .map(v => {
      const team      = col(v, 'team', 'teamname', 'team name');
      const firstName = col(v, 'firstname', 'first name', 'first');
      const lastName  = col(v, 'lastname', 'last name', 'last');
      if (!team || !firstName || !lastName) return null;
      // League/division: try header lookup first, fall back to columns A (0) and B (1)
      const rawLeague = col(v, 'league', 'lg', 'league name') || (v[0] ? v[0].trim() : '');
      const rawDiv    = col(v, 'division', 'div', 'division name') || (v[1] ? v[1].trim() : '');
      return {
        league:    rawLeague,
        division:  divNorm[rawDiv] || divNorm[norm(rawDiv)] || rawDiv,
        team,
        num:       col(v, 'num', 'number', 'player number', 'playernumber', '#', 'jersey'),
        firstName,
        lastName,
        position:  col(v, 'position', 'pos'),
        contact:   col(v, 'contact'),
        power:     col(v, 'power'),
        patience:  col(v, 'patience'),
        speed:     col(v, 'speed'),
        strikeout: col(v, 'strikeout', 'k', 'ks'),
        gbRate:    col(v, 'gbrate', 'gb rate', 'groundball', 'gb'),
        control:   col(v, 'control'),
        stuff:     col(v, 'stuff'),
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    alert(`Import failed: no valid player rows found.\n\nExpected columns: Team, First Name, Last Name, Position, and stat ratings.\nDetected delimiter: ${delim === '\t' ? 'tab' : 'comma'}\nHeader columns found: ${headerCols.join(', ')}`);
    return;
  }

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

    const isPitcher = p => /^(p|sp|rp|lhp|rhp|pitcher)$/i.test(p.position.trim());
    const rawBatters = players.filter(p => !isPitcher(p));
    const batters = rawBatters.map(mkBatterFromCSV);
    while (batters.length < 9) batters.push(mkBatter(POSITIONS[batters.length % POSITIONS.length]));

    const rawPitchers = players.filter(isPitcher);
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

export function exportLeague() {
  const json = JSON.stringify(LEAGUE, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${LEAGUE.name.replace(/\s+/g, '_')}_${LEAGUE.season}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importRosters(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = ''; // reset so re-selecting the same file fires onchange again
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        // Clear old logo keys before loading new league
        if (LEAGUE && LEAGUE.teams) LEAGUE.teams.forEach(t => localStorage.removeItem(`dlg-logo-${t.id}`));
        LEAGUE = JSON.parse(text);
        // Logos in the JSON are already on team objects — saveLeague will split them out to separate keys
        saveLeague();
        window.nav('home');
      } catch(err) {
        alert('Invalid league file — could not parse JSON.');
      }
    } else {
      importFromCSV(text);
      window.nav('home');
    }
  };
  reader.readAsText(file);
}

// ====================================================================
// LEAGUE-WIDE PLAYER ACCESSORS
// ====================================================================
export function allBatters()  { return LEAGUE.teams.flatMap(t => t.batters.map(b => ({...b, teamName: t.name}))); }
export function allPitchers() { return LEAGUE.teams.flatMap(t => t.pitchers.map(p => ({...p, teamName: t.name}))); }
