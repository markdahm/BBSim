import { battingAvg, obpCalc, slgCalc, teamLogoHtml, cl } from './utils.js';
import { LEAGUE, saveLeague, allBatters, allPitchers } from './league.js';
import { MLB } from './data.js';
import { renderSimulate, stopAfterCurrentGame } from './game.js';
import { exportSeasonArchive, renderHistory, getSeasonViewerEntry, getSeasonViewerInfo, setSeasonViewerPos, stepSeasonViewer, getAllHistorySeasons } from './history.js';

// ====================================================================
// VIEW STATE
// ====================================================================
let currentTeamId = null;
let currentPlayer = null;
let playerFilter = 'BAT';
let playerTeamFilter = '';
let statFilters = []; // [{ col, op, val, label }]
let sortCol = 'avg';
let sortDir = -1;
let historicalView = null; // { teams, leagueName, season } — when set, Players screen shows this instead of LEAGUE
let schedBuildMode = false;
let schedShowLoad = false;
let schedTeamFilter = '';
let schedRows = [{ thisTeam: null, opponent: null, count: 1 }];
let schedDragging = null;
let schedIntraCount = 0;

// ====================================================================
// NAVIGATION
// ====================================================================
const PAGES = ['home','players','simulate','schedule','playoffs','history','season-viewer'];
export function nav(page) {
  if (page !== 'simulate' && document.getElementById('page-simulate')?.classList.contains('active')) {
    stopAfterCurrentGame();
  }
  document.querySelectorAll('details.dropdown').forEach(d => d.removeAttribute('open'));
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`).classList.remove('active');
    const navEl = document.getElementById(`nav-${p}`);
    if (navEl) navEl.classList.remove('active');
  });
  document.getElementById(`page-${page}`).classList.add('active');
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
  if (page === 'home') renderHome();
  if (page === 'players') renderPlayersTable();
  if (page === 'simulate') renderSimulate();
  if (page === 'schedule') renderSchedule();
  if (page === 'playoffs') renderPlayoffs();
  if (page === 'history') renderHistory();
  if (page === 'season-viewer') renderSeasonViewer();
}

// ====================================================================
// HISTORICAL VIEW (Players screen pointing at an archived season)
// ====================================================================
function _activeTeams() { return historicalView ? historicalView.teams : LEAGUE.teams; }

export function viewHistorySeason(archiveData) {
  historicalView = { teams: archiveData.teams, leagueName: archiveData.leagueName, season: archiveData.season };
  playerFilter = 'BAT';
  playerTeamFilter = '';
  statFilters = [];
  sortCol = 'avg'; sortDir = -1;
  nav('players');
}

export function exitHistoricalView() {
  historicalView = null;
  renderPlayersTable();
}

// ====================================================================
// SEASON VIEWER (standings from an archived data file)
// ====================================================================
let svTeamList = []; // [{id, name, color}] in display order for current season viewer
let svTeamIdx  = 0;

document.addEventListener('keydown', e => {
  if (!document.getElementById('page-season-viewer')?.classList.contains('active')) return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); seasonViewerNav(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); seasonViewerNav(1);  }
});

export function viewSeasonStandings(sortedIdx) {
  setSeasonViewerPos(sortedIdx);
  nav('season-viewer');
}

export function seasonViewerNav(dir) {
  stepSeasonViewer(dir);
  renderSeasonViewer();
}

export function renderSeasonViewer() {
  const entry = getSeasonViewerEntry();
  if (!entry) { nav('history'); return; }

  const { data, filename } = entry;
  const archiveTeams = data.teams || [];
  const { pos, total } = getSeasonViewerInfo();
  const filenameDisplay = filename.replace(/\.json$/i, '');

  const bannerBar = document.getElementById('sv-banner-bar');
  if (bannerBar) bannerBar.textContent = `Viewing Data File: ${filenameDisplay}`;

  const svSub = document.getElementById('sv-sub');
  if (svSub) svSub.textContent = `${data.season || '—'} Season · ${archiveTeams.length} Teams`;

  const prevBtn = document.getElementById('sv-prev');
  const nextBtn = document.getElementById('sv-next');
  if (prevBtn) prevBtn.disabled = pos <= 0;
  if (nextBtn) nextBtn.disabled = pos >= total - 1;

  const cont = document.getElementById('sv-standings-container');
  if (!cont) return;

  svTeamList = []; // reset team list for this render

  const leagueOrder = ['American League', 'National League'];
  const divisionOrder = {
    'American League': ['AL East', 'AL Central', 'AL West'],
    'National League': ['NL East', 'NL Central', 'NL West'],
  };

  const divMap = new Map();
  for (const t of archiveTeams) {
    const key = t.division || '—';
    if (!divMap.has(key)) divMap.set(key, { league: t.league || '', teams: [] });
    divMap.get(key).teams.push(t);
  }
  const leagueDivs = new Map();
  for (const [divName, { league }] of divMap) {
    if (!leagueDivs.has(league)) leagueDivs.set(league, []);
    leagueDivs.get(league).push(divName);
  }
  const sortedLeagues = [...leagueDivs.keys()].sort((a, b) => {
    const ai = leagueOrder.indexOf(a), bi = leagueOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const playoffIds = new Set(data.playoffTeamIds || []);
  const championId = data.champion?.teamId ?? null;

  const mkDivCard = divName => {
    const e = divMap.get(divName);
    if (!e) return '';
    const divTeams = e.teams.slice().sort((a, b) => {
      const pctA = (a.w + a.l) === 0 ? 0 : a.w / (a.w + a.l);
      const pctB = (b.w + b.l) === 0 ? 0 : b.w / (b.w + b.l);
      if (pctB !== pctA) return pctB - pctA;
      return b.w - a.w;
    });
    const leader = divTeams[0];
    let rows = '';
    divTeams.forEach((t, i) => {
      const pct = (t.w + t.l) === 0 ? '.000' : (t.w / (t.w + t.l)).toFixed(3).replace(/^0\./, '.');
      const gb  = i === 0 ? '—' : (((leader.w - leader.l) - (t.w - t.l)) / 2).toFixed(1);
      const tColor = t.color || '#888';
      const tName = (t.name || `${t.city || ''} ${t.nickname || ''}`.trim());
      const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${tColor};margin-right:6px;vertical-align:middle;flex-shrink:0"></span>`;
      const isChamp   = t.id === championId;
      const isPlayoff = playoffIds.has(t.id);
      const crown = isChamp ? `<span class="sv-crown" title="Champion">&#x1F451;</span>` : '';
      const rowClass = isChamp ? ' sv-row-champ' : isPlayoff ? ' sv-row-playoff' : ' sv-row-missed';
      const teamIdx = svTeamList.length;
      svTeamList.push({ id: t.id, name: tName, color: tColor });
      rows += `<tr class="sv-standings-row${rowClass}" style="cursor:pointer" onclick="showTeamAnalysis(${teamIdx})"><td class="team-cell">${dot}${tName}${crown}</td><td>${t.w}</td><td>${t.l}</td><td>${pct}</td><td class="gb-cell">${gb}</td></tr>`;
    });
    return `<div class="division-card">
      <div class="division-head">${divName}</div>
      <table class="standings-table">
        <thead><tr><th>Team</th><th style="width:46px">W</th><th style="width:46px">L</th><th style="width:62px">PCT</th><th style="width:68px">GB</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  const cols = sortedLeagues.map(leagueName => {
    const divs = divisionOrder[leagueName] || leagueDivs.get(leagueName).sort();
    return `<div style="display:flex;flex-direction:column;gap:20px">
      <div style="font-family:'Oswald',sans-serif;font-size:1.3rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-align:center;padding-bottom:8px;border-bottom:2px solid var(--ink)">${leagueName}</div>
      ${divs.map(mkDivCard).join('')}
    </div>`;
  });

  cont.innerHTML = cols.length === 2
    ? `<div style="width:fit-content"><div style="font-family:'Oswald',sans-serif;font-size:1.45rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;text-align:center;margin-bottom:16px">STANDINGS</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">${cols.join('')}</div></div>`
    : cols.join('');
}

export function teamAnalysisNav(dir) {
  const next = svTeamIdx + dir;
  if (next < 0 || next >= svTeamList.length) return;
  svTeamIdx = next;
  _renderTeamAnalysis();
}

export function showTeamAnalysis(idx) {
  svTeamIdx = idx;
  _renderTeamAnalysis();
}

function _renderTeamAnalysis() {
  const { id: teamId, name: teamName, color: teamColor } = svTeamList[svTeamIdx] || {};
  if (!teamId == null || !teamName) return;
  const allSeasons = getAllHistorySeasons();
  const ordinal = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

  // Assign sequence numbers across the whole collection (oldest filename = 1)
  const seqMap = new Map();
  [...allSeasons].sort((a, b) => a.filename.localeCompare(b.filename))
    .forEach((s, i) => seqMap.set(s.filename, i + 1));

  // Build per-season results
  const results = [];
  for (const { filename, data } of allSeasons) {
    const teams = data.teams || [];
    const thisTeam = teams.find(t => t.id === teamId || t.name === teamName);
    if (!thisTeam) continue;
    const divTeams = teams.filter(t => t.division === thisTeam.division)
      .sort((a, b) => {
        const pctA = (a.w + a.l) === 0 ? 0 : a.w / (a.w + a.l);
        const pctB = (b.w + b.l) === 0 ? 0 : b.w / (b.w + b.l);
        if (pctB !== pctA) return pctB - pctA;
        return b.w - a.w;
      });
    const pos = divTeams.findIndex(t => t.id === teamId || t.name === teamName) + 1;
    const madePlayoffs = Array.isArray(data.playoffTeamIds)
      ? data.playoffTeamIds.includes(teamId)
      : (data.champion?.teamId === teamId || data.runnerUp?.teamId === teamId);
    const isChampion = data.champion?.teamId === teamId;
    if (pos > 0) results.push({ seq: seqMap.get(filename) ?? '?', w: thisTeam.w, l: thisTeam.l, pos, madePlayoffs, isChampion });
  }
  results.sort((a, b) => a.seq - b.seq);

  // Tally positions
  const tally = {};
  let maxPos = 0;
  for (const r of results) { tally[r.pos] = (tally[r.pos] || 0) + 1; if (r.pos > maxPos) maxPos = r.pos; }
  const maxCount = Math.max(...Object.values(tally), 1);

  const tallyRows = Array.from({ length: maxPos }, (_, i) => i + 1).map(pos => {
    const count = tally[pos] || 0;
    const barW = Math.round((count / maxCount) * 140);
    return `<tr>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:0.75rem;font-weight:700;width:36px;text-align:right;padding-right:14px;color:${pos === 1 ? teamColor : 'var(--ink)'}">${ordinal(pos)}</td>
      <td><div style="height:16px;width:${barW}px;background:${teamColor};border-radius:2px;opacity:${1 - (pos - 1) * 0.12};min-width:${count > 0 ? 4 : 0}px"></div></td>
      <td style="padding-left:10px;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--muted)">${count} time${count !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');

  const detailRows = results.map(r => {
    const playoffStyle = r.madePlayoffs
      ? 'background:rgba(184,134,11,0.12);border-left:3px solid var(--gold);'
      : 'border-left:3px solid transparent;';
    const badge = r.isChampion
      ? ' <span style="font-size:0.85rem;line-height:1">👑</span>'
      : r.madePlayoffs
        ? ' <span style="font-size:0.55rem;font-weight:700;color:var(--gold);letter-spacing:0.5px">PO</span>'
        : '';
    return `<tr style="${playoffStyle}">
      <td style="font-family:'IBM Plex Mono',monospace;font-size:0.75rem;font-weight:600;padding:5px 10px 5px 6px;text-align:center">${r.seq}${badge}</td>
      <td style="padding:5px 10px;text-align:center">${r.w}</td>
      <td style="padding:5px 10px;text-align:center">${r.l}</td>
      <td style="padding:5px 6px 5px 10px;text-align:center;font-weight:700;color:${r.pos === 1 ? teamColor : 'var(--ink)'}">${ordinal(r.pos)}</td>
    </tr>`;
  }).join('');

  const dot = `<span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${teamColor};margin-right:9px;vertical-align:middle;flex-shrink:0"></span>`;
  const overlay = document.getElementById('team-analysis-overlay');
  if (!overlay) return;

  const prevDis = svTeamIdx <= 0 ? 'disabled' : '';
  const nextDis = svTeamIdx >= svTeamList.length - 1 ? 'disabled' : '';

  overlay.innerHTML = `
    <div class="ta-panel" onclick="event.stopPropagation()">
      <div class="ta-header">
        <button class="ta-nav-btn" onclick="teamAnalysisNav(-1)" ${prevDis}>←</button>
        <div style="font-family:'Oswald',sans-serif;font-size:1.2rem;font-weight:600;letter-spacing:1px;display:flex;align-items:center;flex:1;justify-content:center">${dot}${teamName}</div>
        <button class="ta-nav-btn" onclick="teamAnalysisNav(1)" ${nextDis}>→</button>
        <button onclick="closeTeamAnalysis()" style="background:none;border:2px solid var(--ink);border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:8px">✕</button>
      </div>
      <div class="ta-body">
        ${results.length === 0 ? `<div style="color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:0.75rem">No data found for this team across loaded seasons.</div>` : `
        <div class="ta-section-label">Division Finish — ${results.length} season${results.length !== 1 ? 's' : ''} on record</div>
        <table style="border-collapse:collapse;margin-bottom:24px">${tallyRows}</table>
        <div class="ta-section-label">Season by Season</div>
        <table style="border-collapse:collapse;width:100%">
          <thead><tr style="font-family:'IBM Plex Mono',monospace;font-size:0.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">
            <th style="text-align:center;padding:4px 10px 6px 0">#</th>
            <th style="padding:4px 10px;text-align:center">W</th>
            <th style="padding:4px 10px;text-align:center">L</th>
            <th style="padding:4px 0 6px 10px;text-align:center">Finish</th>
          </tr></thead>
          <tbody style="font-family:'IBM Plex Mono',monospace">${detailRows}</tbody>
        </table>`}
      </div>
    </div>`;
  overlay.style.display = 'flex';
}

export function closeTeamAnalysis() {
  const overlay = document.getElementById('team-analysis-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ====================================================================
// LEAGUE HOME
// ====================================================================
export function renderHome() {
  document.getElementById('league-title').textContent = LEAGUE.name;
  document.getElementById('league-sub').textContent = `${LEAGUE.season} Season · 30 Teams`;
  document.getElementById('season-display').textContent = LEAGUE.season;

  // Standings by division — two columns (AL | NL), fixed East→Central→West order
  const cont = document.getElementById('standings-container');
  const leagueOrder = ['American League', 'National League'];
  const divisionOrder = {
    'American League': ['AL East', 'AL Central', 'AL West'],
    'National League': ['NL East', 'NL Central', 'NL West'],
  };

  const divMap = new Map(); // divName → { league, teams[] }
  for (const t of LEAGUE.teams) {
    const key = t.division || '—';
    if (!divMap.has(key)) divMap.set(key, { league: t.league || '', teams: [] });
    divMap.get(key).teams.push(t);
  }
  const leagueDivs = new Map();
  for (const [divName, { league }] of divMap) {
    if (!leagueDivs.has(league)) leagueDivs.set(league, []);
    leagueDivs.get(league).push(divName);
  }
  const sortedLeagues = [...leagueDivs.keys()].sort((a, b) => {
    const ai = leagueOrder.indexOf(a), bi = leagueOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const mkDivCard = divName => {
    const entry = divMap.get(divName);
    if (!entry) return '';
    const divTeams = entry.teams.slice().sort((a, b) => {
      const pctA = (a.w + a.l) === 0 ? 0 : a.w / (a.w + a.l);
      const pctB = (b.w + b.l) === 0 ? 0 : b.w / (b.w + b.l);
      if (pctB !== pctA) return pctB - pctA;
      return b.w - a.w; // tiebreak by raw wins
    });
    const leader = divTeams[0];
    let rows = '';
    divTeams.forEach((t, i) => {
      const pct = (t.w + t.l) === 0 ? '.000' : (t.w / (t.w + t.l)).toFixed(3).replace(/^0\./, '.');
      const gb  = i === 0 ? '—' : (((leader.w - leader.l) - (t.w - t.l)) / 2).toFixed(1);
      rows += `<tr onclick="openTeam(${t.id})"><td class="team-cell">${teamLogoHtml(t, 30)} ${t.name}</td><td>${t.w}</td><td>${t.l}</td><td>${pct}</td><td class="gb-cell">${gb}</td></tr>`;
    });
    return `<div class="division-card">
      <div class="division-head">${divName}</div>
      <table class="standings-table">
        <thead><tr><th>Team</th><th style="width:46px">W</th><th style="width:46px">L</th><th style="width:62px">PCT</th><th style="width:68px">GB</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  const cols = sortedLeagues.map(leagueName => {
    const divs = divisionOrder[leagueName] || leagueDivs.get(leagueName).sort();
    return `<div style="display:flex;flex-direction:column;gap:20px">
      <div style="font-family:'Oswald',sans-serif;font-size:1.3rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-align:center;padding-bottom:8px;border-bottom:2px solid var(--ink)">${leagueName}</div>
      ${divs.map(mkDivCard).join('')}
    </div>`;
  });

  const sched = LEAGUE.schedule || [];
  const schedPlayed = sched.filter(g => g.played).length;
  const schedTotal  = sched.length;
  const schedRemain = schedTotal - schedPlayed;
  const schedLabel  = schedTotal > 0 ? ` (${schedPlayed} of ${schedTotal} · ${schedRemain} remaining)` : '';

  cont.innerHTML = cols.length === 2
    ? `<div style="width:fit-content"><div style="font-family:'Oswald',sans-serif;font-size:1.45rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;text-align:center;margin-bottom:16px">STANDINGS<span style="font-size:0.65rem;font-weight:400;font-family:'IBM Plex Mono',monospace;letter-spacing:0;text-transform:none;opacity:0.6">${schedLabel}</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">${cols.join('')}</div></div>`
    : cols.join('');
}

// ====================================================================
// TEAMS
// ====================================================================
export function openTeam(id) {
  currentTeamId = id;
  batTableSort = { col: null, dir: -1 };
  rosterTab = 'bat';
  renderRosterTableContent();
  document.getElementById('roster-table-overlay').style.display = 'flex';
}

// ====================================================================
// ROSTER TABLE OVERLAY  (unified batter + pitcher)
// ====================================================================
let pitTableSort = { col: null, dir: 1 };
let batTableSort = { col: null, dir: -1 };
let rosterTab = 'bat';
let batDragSrc = null;
let pitDragSrc = null;

export function openBatterTable() {
  batTableSort = { col: null, dir: -1 };
  rosterTab = 'bat';
  renderRosterTableContent();
  document.getElementById('roster-table-overlay').style.display = 'flex';
}

export function openPitcherTable() {
  pitTableSort = { col: null, dir: 1 };
  rosterTab = 'pit';
  renderRosterTableContent();
  document.getElementById('roster-table-overlay').style.display = 'flex';
}

export function closeRosterTable() {
  document.getElementById('roster-table-overlay').style.display = 'none';
  renderHome();
}
export const closeBatterTable  = closeRosterTable;
export const closePitcherTable = closeRosterTable;

export function rosterSetTab(tab) {
  rosterTab = tab;
  renderRosterTableContent();
}

function renderRosterTableContent() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;

  // Tab button styles
  const batBtn = document.getElementById('roster-tab-bat');
  const pitBtn = document.getElementById('roster-tab-pit');
  if (batBtn) { batBtn.style.background = rosterTab === 'bat' ? 'var(--ink)' : 'var(--panel)'; batBtn.style.color = rosterTab === 'bat' ? 'var(--chalk)' : 'var(--ink)'; }
  if (pitBtn) { pitBtn.style.background = rosterTab === 'pit' ? 'var(--ink)' : 'var(--panel)'; pitBtn.style.color = rosterTab === 'pit' ? 'var(--chalk)' : 'var(--ink)'; }

  // Header: logo + team name + edit button
  const titleEl = document.getElementById('roster-table-title');
  if (titleEl) {
    const logoClick = `<label title="Upload logo" style="cursor:pointer;display:inline-flex;align-items:center">${teamLogoHtml(t, 24)}<input type="file" accept="image/*" onchange="uploadTeamLogo(this)" style="display:none"></label>`;
    titleEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px">${logoClick}<span id="roster-team-name" onclick="editTeamName()" title="Click to rename" style="cursor:pointer;border-bottom:1px dashed transparent;transition:border-color 0.15s" onmouseover="this.style.borderBottomColor='var(--ink)'" onmouseout="this.style.borderBottomColor='transparent'">${t.name}</span></div>`;
  }

  const metaEl = document.getElementById('roster-header-meta');
  if (metaEl) {
    metaEl.innerHTML = `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.65rem;color:var(--muted)">${t.division} · ${t.w}W ${t.l}L · ${rosterTab === 'bat' ? 'Batting Lineup' : 'Pitching Staff'}</span>`;
  }

  if (rosterTab === 'bat') renderBatterTableContent();
  else renderPitcherTableContent();
}

export function sortBatterTable(col) {
  if (batTableSort.col === col) {
    if (batTableSort.dir === 1) batTableSort = { col: null, dir: -1 }; // 3rd click → reset
    else batTableSort.dir *= -1;
  } else { batTableSort.col = col; batTableSort.dir = -1; }
  renderRosterTableContent();
}

function renderBatterTableContent() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const ind = col => batTableSort.col === col ? (batTableSort.dir === 1 ? ' ↑' : ' ↓') : '';
  const th = (col, label) => `<th onclick="sortBatterTable('${col}')">${label}${ind(col)}</th>`;
  const unsorted = !batTableSort.col;

  let batters = t.batters.map((b, idx) => ({ b, idx }));
  if (batTableSort.col) {
    batters.sort((a, b) => {
      const bv = x => {
        const b = x.b;
        if (batTableSort.col === 'avg') return battingAvg(b);
        if (batTableSort.col === 'obp') return obpCalc(b);
        if (batTableSort.col === 'slg') return slgCalc(b);
        if (batTableSort.col === 'ops') return obpCalc(b) + slgCalc(b);
        if (batTableSort.col === '1b')  return (b.career.h||0) - (b.career.hr||0) - (b.career.doubles||0) - (b.career.triples||0);
        if (batTableSort.col === '2b')  return b.career.doubles || 0;
        if (batTableSort.col === '3b')  return b.career.triples || 0;
        return b.career[batTableSort.col] || 0;
      };
      return (bv(a) - bv(b)) * batTableSort.dir;
    });
  }

  const rows = batters.map(({ b, idx }) => {
    const avg = battingAvg(b).toFixed(3);
    const obp = obpCalc(b).toFixed(3);
    const slg = slgCalc(b).toFixed(3);
    const ops = (parseFloat(obp) + parseFloat(slg)).toFixed(3);
    const slot = !batTableSort.col ? (idx < 9 ? idx + 1 : '·') : '·';
    return `<tr data-player-id="${b.id}" data-bat-idx="${idx}"${unsorted ? ' draggable="true"' : ''} style="cursor:pointer">
      <td style="text-align:center;color:var(--muted)">${slot}</td>
      <td style="text-align:left"><b>${b.name}</b></td>
      <td style="text-align:left"><span class="pos-badge">${b.pos}</span></td>
      <td>${b.career.g||0}</td><td>${b.career.ab||0}</td><td>${b.career.r||0}</td><td>${b.career.h||0}</td>
      <td>${(b.career.h||0)-(b.career.hr||0)-(b.career.doubles||0)-(b.career.triples||0)}</td>
      <td>${b.career.doubles||0}</td><td>${b.career.triples||0}</td><td>${b.career.hr||0}</td><td>${b.career.rbi||0}</td>
      <td>${b.career.bb||0}</td><td>${b.career.k||0}</td><td>${b.career.sb||0}</td><td>${b.career.cs||0}</td>
      <td>${b.career.sf||0}</td>
      <td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td>
      <td><button onclick="event.stopPropagation();deletePlayerFromTable('${b.id}')" style="background:transparent;border:1px solid #c00;color:#c00;border-radius:2px;padding:2px 6px;cursor:pointer;font-size:0.65rem">✕</button></td>
    </tr>`;
  }).join('');

  const hintHtml = unsorted ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:0.60rem;color:#bbb;margin-bottom:6px">drag rows to reorder</div>` : '';
  const container = document.getElementById('roster-table-body');
  container.innerHTML = `
    ${hintHtml}
    <div style="overflow-x:auto">
      <table class="players-table" style="font-size:0.72rem;min-width:1000px">
        <thead><tr>
          <th>#</th>
          <th style="text-align:left">Player</th>
          <th style="text-align:left">Pos</th>
          ${th('g','G')}${th('ab','AB')}${th('r','R')}${th('h','H')}
          ${th('1b','1B')}${th('2b','2B')}${th('3b','3B')}${th('hr','HR')}${th('rbi','RBI')}
          ${th('bb','BB')}${th('k','K')}${th('sb','SB')}${th('cs','CS')}
          ${th('sf','SF')}
          ${th('avg','AVG')}${th('obp','OBP')}${th('slg','SLG')}${th('ops','OPS')}
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  let batDragging = false;
  container.querySelectorAll('tr[data-player-id]').forEach(row => {
    const playerId = row.dataset.playerId;
    const idx = parseInt(row.dataset.batIdx);
    row.addEventListener('click', () => { if (!batDragging) openCard(t.id, playerId); });
    if (unsorted) {
      row.addEventListener('dragstart', e => {
        batDragSrc = idx; batDragging = true;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); setTimeout(() => { batDragging = false; }, 0); });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault(); row.classList.remove('drag-over');
        if (batDragSrc !== null && batDragSrc !== idx) {
          const [mv] = t.batters.splice(batDragSrc, 1);
          t.batters.splice(idx, 0, mv);
          saveLeague();
          renderRosterTableContent();
        }
      });
    }
  });
}

export function sortPitcherTable(col) {
  if (pitTableSort.col === col) {
    const defaultDir = (col === 'era' || col === 'whip' || col === 'baa') ? 1 : -1;
    if (pitTableSort.dir !== defaultDir) pitTableSort = { col: null, dir: 1 }; // 3rd click → reset
    else pitTableSort.dir *= -1;
  } else { pitTableSort.col = col; pitTableSort.dir = (col === 'era' || col === 'whip' || col === 'baa') ? 1 : -1; }
  renderRosterTableContent();
}

function renderPitcherTableContent() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const fmtIP = ip => { const o = Math.round((ip || 0) * 3); return `${Math.floor(o / 3)}.${o % 3}`; };
  const ind = col => pitTableSort.col === col ? (pitTableSort.dir === 1 ? ' ↑' : ' ↓') : '';
  const th = (col, label, align) => `<th onclick="sortPitcherTable('${col}')"${align ? ` style="text-align:${align}"` : ''}>${label}${ind(col)}</th>`;
  const unsorted = !pitTableSort.col;

  let pitchers = t.pitchers.map((p, idx) => ({ p, idx }));
  if (pitTableSort.col) {
    pitchers.sort((a, b) => {
      const pv = x => {
        const p = x.p;
        if (pitTableSort.col === 'era')  return p.career.ip > 0 ? (p.career.er / p.career.ip) * 9 : p.era;
        if (pitTableSort.col === 'whip') return p.career.ip > 0 ? (p.career.bb + p.career.h) / p.career.ip : 99;
        if (pitTableSort.col === 'baa')  { const ab = (p.career.bf||0)-(p.career.bb||0)-(p.career.hbp||0); return ab > 0 ? p.career.h / ab : 1; }
        if (pitTableSort.col === 'k9')   return p.career.ip > 0 ? (p.career.k / p.career.ip) * 9 : 0;
        if (pitTableSort.col === 'ip')   return p.career.ip || 0;
        return p.career[pitTableSort.col] || 0;
      };
      return (pv(a) - pv(b)) * pitTableSort.dir;
    });
  }

  const mkRow = ({ p, idx }) => {
    const role  = idx < 5 ? 'SP' : idx < 7 ? 'CL' : 'RP';
    const era   = p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2);
    const whip  = p.career.ip > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—';
    const abF   = (p.career.bf || 0) - (p.career.bb || 0) - (p.career.hbp || 0);
    const baa   = abF > 0 ? (p.career.h / abF).toFixed(3) : '—';
    const k9    = p.career.ip > 0 ? ((p.career.k / p.career.ip) * 9).toFixed(1) : '—';
    return `<tr data-player-id="${p.id}" data-pit-idx="${idx}"${unsorted ? ' draggable="true"' : ''} style="cursor:pointer">
      <td style="text-align:left"><b>${p.name}</b></td>
      <td style="text-align:left"><span class="pos-badge">${role}</span></td>
      <td>${era}</td><td>${p.career.w||0}</td><td>${p.career.l||0}</td><td>${whip}</td>
      <td>${p.career.g||0}</td><td>${p.career.gs||0}</td><td>${p.career.cg||0}</td><td>${p.career.sho||0}</td>
      <td>${fmtIP(p.career.ip)}</td><td>${p.career.k||0}</td><td>${p.career.bb||0}</td>
      <td>${p.career.svo||0}</td><td>${p.career.sv||0}</td><td>${(p.career.svo||0)-(p.career.sv||0)}</td>
      <td>${p.career.h||0}</td><td>${p.career.r||0}</td><td>${p.career.er||0}</td>
      <td>${p.career.hr||0}</td><td>${p.career.hbp||0}</td>
      <td>${k9}</td><td>${baa}</td>
      <td><button onclick="event.stopPropagation();deletePlayerFromTable('${p.id}')" style="background:transparent;border:1px solid #c00;color:#c00;border-radius:2px;padding:2px 6px;cursor:pointer;font-size:0.65rem">✕</button></td>
    </tr>`;
  };
  const mkDivRow = label =>
    `<tr><td colspan="23" style="font-family:'IBM Plex Mono',monospace;font-size:0.58rem;color:var(--muted);padding:8px 2px 3px;text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid var(--line);pointer-events:none">${label}</td></tr>`;
  let rows;
  if (unsorted) {
    const sp = pitchers.filter(({ idx }) => idx < 5);
    const cl = pitchers.filter(({ idx }) => idx >= 5 && idx < 7);
    const rp = pitchers.filter(({ idx }) => idx >= 7);
    rows = mkDivRow(`Starting Rotation — ${sp.length}`) + sp.map(mkRow).join('') +
           mkDivRow(`Closer — ${cl.length}`) + cl.map(mkRow).join('') +
           (rp.length > 0 ? mkDivRow(`Bullpen — ${rp.length}`) + rp.map(mkRow).join('') : '');
  } else {
    rows = pitchers.map(mkRow).join('');
  }

  const hintHtml = unsorted ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:0.60rem;color:#bbb;margin-bottom:6px">drag rows to reorder</div>` : '';
  const container = document.getElementById('roster-table-body');
  container.innerHTML = `
    ${hintHtml}
    <div style="overflow-x:auto">
      <table class="players-table" style="font-size:0.72rem;min-width:1000px">
        <thead><tr>
          <th style="text-align:left;min-width:160px">Player</th>
          <th style="text-align:left;width:60px">Role</th>
          ${th('era','ERA')}${th('w','W')}${th('l','L')}${th('whip','WHIP')}
          ${th('g','G')}${th('gs','GS')}${th('cg','CG')}${th('sho','SHO')}
          ${th('ip','IP')}${th('k','K')}${th('bb','BB')}${th('svo','SVO')}${th('sv','SV')}${th('bs','BS')}
          ${th('h','H')}${th('r','R')}${th('er','ER')}${th('hr','HR')}${th('hbp','HBP')}
          ${th('k9','K/9')}${th('baa','BAA')}
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  let pitDragging = false;
  container.querySelectorAll('tr[data-player-id]').forEach(row => {
    const playerId = row.dataset.playerId;
    const idx = parseInt(row.dataset.pitIdx);
    row.addEventListener('click', () => { if (!pitDragging) openCard(t.id, playerId); });
    if (unsorted) {
      row.addEventListener('dragstart', e => {
        pitDragSrc = idx; pitDragging = true;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); setTimeout(() => { pitDragging = false; }, 0); });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault(); row.classList.remove('drag-over');
        if (pitDragSrc !== null && pitDragSrc !== idx) {
          const [mv] = t.pitchers.splice(pitDragSrc, 1);
          t.pitchers.splice(idx, 0, mv);
          t.pitchers.forEach((p, i) => { p.pos = i < 5 ? 'SP' : i < 7 ? 'CL' : 'RP'; });
          t.activePitcher = 0;
          t.startingPitcherIdx = 0;
          saveLeague();
          renderRosterTableContent();
        }
      });
    }
  });
}

export function deletePlayerFromTable(playerId) {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const p = [...t.batters, ...t.pitchers].find(p => p.id === playerId);
  if (!p) return;
  if (!confirm(`Delete ${p.name}?`)) return;
  if (p.type === 'batter') t.batters = t.batters.filter(b => b.id !== playerId);
  else t.pitchers = t.pitchers.filter(pl => pl.id !== playerId);
  saveLeague();
  renderRosterTableContent();
}

export function uploadTeamLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const reader = new FileReader();
  reader.onload = e => { t.logo = e.target.result; saveLeague(); renderRosterTableContent(); };
  reader.readAsDataURL(file);
}

export function removeTeamLogo() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  delete t.logo;
  saveLeague();
  renderRosterTableContent();
}

export function editTeamName() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const titleEl = document.getElementById('roster-table-title');
  if (!titleEl) return;
  titleEl.innerHTML = `${teamLogoHtml(t, 24)}
    <input id="team-name-input" value="${t.name}"
      style="font-family:'Oswald',sans-serif;font-size:1.1rem;font-weight:600;letter-spacing:1px;border:none;border-bottom:2px solid var(--ink);background:transparent;outline:none;width:220px;padding:2px 0;margin-left:6px;vertical-align:middle;"
      onkeydown="if(event.key==='Enter')saveTeamName();if(event.key==='Escape')cancelTeamName()">
    <button onclick="saveTeamName()" style="margin-left:8px;font-family:'IBM Plex Mono',monospace;font-size:0.6rem;padding:3px 9px;border:2px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;border-radius:2px;vertical-align:middle">Save</button>
    <button onclick="cancelTeamName()" style="margin-left:4px;font-family:'IBM Plex Mono',monospace;font-size:0.6rem;padding:3px 9px;border:2px solid #ccc;background:transparent;cursor:pointer;border-radius:2px;vertical-align:middle">Cancel</button>`;
  document.getElementById('team-name-input').focus();
  document.getElementById('team-name-input').select();
}

export function saveTeamName() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  const input = document.getElementById('team-name-input');
  if (!input || !t) return;
  const newName = input.value.trim();
  if (newName) {
    t.name = newName;
    saveLeague();
    renderRosterTableContent();
  }
}

export function cancelTeamName() {
  renderRosterTableContent();
}

// ====================================================================
// BASEBALL CARD
// ====================================================================
export function openCard(teamId, playerId) {
  const t = LEAGUE.teams.find(t => String(t.id) === String(teamId));
  if (!t) return;
  const p = [...t.batters, ...t.pitchers].find(p => p.id === playerId);
  if (!p) return;
  currentPlayer = { team: t, player: p };
  renderCard(t, p);
  document.getElementById('card-overlay').classList.add('open');
}

function projectPlayer(p) {
  const PA = 100;
  const norm = raw => { const tot = Object.values(raw).reduce((s,v)=>s+v,0); const out={}; for (const k in raw) out[k]=raw[k]/tot; return out; };
  if (p.type === 'batter') {
    const k  = cl(p.kPct * .6  + MLB.k    * .4, .10, .38);
    const bb = cl(p.bbPct * .6 + MLB.walk * .4, .04, .16);
    const go = cl(p.goPct, .12, .32);
    const speedFactor  = cl((p.sbRate || 0.075) / 0.15, 0, 1);
    const speedBonus   = (speedFactor - 0.5) * 0.020;  // ±0.010 AVG; elite speed ≈ +10 pts
    const contactRate  = cl(0.240 - (p.kPct||0.20) * 0.240, 0.130, 0.230);
    const hitRate      = cl(contactRate + speedBonus, 0.120, 0.250);
    const adjSinglePct = (p.singlePct||0) + Math.max(0, speedBonus);
    const rawHitSum    = adjSinglePct + (p.doublePct||0) + (p.triplePct||0) + (p.hrPct||0);
    const hitDenom     = rawHitSum > 0 ? rawHitSum : 1;
    // Base hit type probabilities
    const pSingle = hitRate * (adjSinglePct     / hitDenom);
    const pDbl    = hitRate * ((p.doublePct||0) / hitDenom);
    const pTriple = hitRate * ((p.triplePct||0) / hitDenom);
    const pHr     = hitRate * ((p.hrPct||0)     / hitDenom);
    // Speed-based extra-base upgrade (mirrors tryExtraBase in sim)
    const singleUpgrade = Math.max(0, speedFactor - 0.55) * 0.30;
    const doubleUpgrade = Math.max(0, speedFactor - 0.70) * 0.20;
    const single = pSingle * (1 - singleUpgrade);
    const dbl    = pDbl * (1 - doubleUpgrade) + pSingle * singleUpgrade;
    const triple = pTriple + pDbl * doubleUpgrade;
    const hr     = pHr;
    const pr = norm({ k, go, fo:p.foPct, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single, dbl, triple, hr });
    const BB=Math.round(pr.walk*PA), HBP=Math.round(pr.hbp*PA), K=Math.round(pr.k*PA);
    const AB=PA-BB-HBP;
    const H1=Math.round(pr.single*PA), H2=Math.round(pr.dbl*PA), H3=Math.round(pr.triple*PA), HR=Math.round(pr.hr*PA);
    const H=Math.round((pr.single+pr.dbl+pr.triple+pr.hr)*PA), TB=H1+2*H2+3*H3+4*HR;
    const AVG=AB>0?(H/AB).toFixed(3):'.000';
    const OBP=((H+BB+HBP)/PA).toFixed(3);
    const SLG=AB>0?(TB/AB).toFixed(3):'.000';
    const OPS=(parseFloat(OBP)+parseFloat(SLG)).toFixed(3);
    return { type:'batter', PA, AB, H, HR, H2, BB, K, AVG, OBP, SLG, OPS };
  } else {
    const k  = cl(MLB.k    * .6 + p.kPct  * .4, .10, .38);
    const bb = cl(MLB.walk * .6 + p.bbPct * .4, .04, .16);
    const go = cl(MLB.go + (p.goD||0) * .4, .12, .32);
    const pr = norm({ k, go, fo:MLB.fo, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single:MLB.single, dbl:MLB.double, triple:MLB.triple, hr:MLB.hr });
    const K=Math.round(pr.k*PA), BB=Math.round(pr.walk*PA);
    const H=Math.round((pr.single+pr.dbl+pr.triple+pr.hr)*PA), HR=Math.round(pr.hr*PA);
    const outs=Math.round((pr.k+pr.go+pr.fo+pr.lo)*PA);
    const IP=outs/3;
    const ERA=p.era.toFixed(2);
    const WHIP=IP>0?((BB+H)/IP).toFixed(2):'—';
    return { type:'pitcher', PA, K, BB, H, HR, IP:IP.toFixed(1), ERA, WHIP };
  }
}

function renderCard(t, p) {
  const isBatter = p.type === 'batter';
  const card = document.getElementById('baseball-card');
  const fmtIP = ip => { const o = Math.round((ip || 0) * 3); return `${Math.floor(o / 3)}.${o % 3}`; };

  const avg = isBatter ? battingAvg(p).toFixed(3) : '—';
  const obp = isBatter ? obpCalc(p).toFixed(3) : '—';
  const slg = isBatter ? slgCalc(p).toFixed(3) : '—';
  const ops = isBatter ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : '—';

  const playerList = [...t.batters, ...t.pitchers];
  const playerIdx  = playerList.findIndex(pl => pl.id === p.id);
  const hasPrev = playerIdx > 0;
  const hasNext = playerIdx < playerList.length - 1;

  // Ratings (0-100 scale)
  const ratings = isBatter ? [
    { l:'Contact', v: Math.round((1 - (p.kPct / 0.40)) * 100) },
    { l:'Power',   v: Math.round((p.hrPct / 0.065) * 100) },
    { l:'Patience',v: Math.round((p.bbPct / 0.18) * 100) },
    { l:'Speed',   v: Math.round((p.sbRate / 0.15) * 100) },
  ] : [
    { l:'Strikeout',v: Math.round((p.kPct / 0.35) * 100) },
    { l:'Control', v: Math.round((1 - (p.bbPct / 0.14)) * 100) },
    { l:'GB Rate', v: Math.round(((p.goD + 0.04) / 0.08) * 100) },
    { l:'Stuff',   v: Math.round(((6.0 - p.era) / 4.0) * 100) },
  ];

  const proj = projectPlayer(p);
  const projHtml = proj.type === 'batter' ? `
    <div class="pcs-box"><div class="pcs-val">${proj.AVG}</div><div class="pcs-lbl">AVG</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.OBP}</div><div class="pcs-lbl">OBP</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.SLG}</div><div class="pcs-lbl">SLG</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.OPS}</div><div class="pcs-lbl">OPS</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.H}</div><div class="pcs-lbl">H</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.HR}</div><div class="pcs-lbl">HR</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.BB}</div><div class="pcs-lbl">BB</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.K}</div><div class="pcs-lbl">K</div></div>` : `
    <div class="pcs-box"><div class="pcs-val">${proj.ERA}</div><div class="pcs-lbl">ERA</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.WHIP}</div><div class="pcs-lbl">WHIP</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.K}</div><div class="pcs-lbl">K</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.BB}</div><div class="pcs-lbl">BB</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.H}</div><div class="pcs-lbl">H</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.HR}</div><div class="pcs-lbl">HR</div></div>
    <div class="pcs-box"><div class="pcs-val">${proj.IP}</div><div class="pcs-lbl">IP</div></div>`;

  const btnBase = 'flex:1;font-family:\'IBM Plex Mono\',monospace;font-size:0.6rem;padding:5px 0;background:transparent;border:1px solid var(--line);border-radius:2px;cursor:pointer;';
  card.innerHTML = `
  <div class="card-left">
    <div class="card-year">${LEAGUE.season} · ${LEAGUE.name}</div>
    <div class="card-team-name">${teamLogoHtml(t, 22)} ${t.name}</div>
    <div class="card-player-avatar">${p.emoji}</div>
    <div class="card-player-name">${p.name}</div>
    <div class="card-player-pos">${p.pos} · ${p.arch}</div>
    <div style="margin-top:auto;position:relative;z-index:1">
      <div style="font-family:'Playfair Display',serif;font-size:3rem;font-weight:900;color:#222;text-align:right;line-height:1">#${p.num}</div>
      <div style="display:flex;gap:6px;padding-top:10px">
        <button onclick="prevCard()" style="${btnBase}color:${hasPrev ? 'var(--chalk)' : '#555'};opacity:${hasPrev ? '1' : '0.4'};border-color:${hasPrev ? '#555' : '#333'}" ${hasPrev ? '' : 'disabled'}>← Prev</button>
        <button onclick="nextCard()" style="${btnBase}color:${hasNext ? 'var(--chalk)' : '#555'};opacity:${hasNext ? '1' : '0.4'};border-color:${hasNext ? '#555' : '#333'}" ${hasNext ? '' : 'disabled'}>Next →</button>
      </div>
      <button onclick="deleteCurrentPlayer()" style="width:100%;margin-top:6px;font-family:'IBM Plex Mono',monospace;font-size:0.6rem;padding:5px 0;background:transparent;border:1px solid #c00;color:#c00;border-radius:2px;cursor:pointer">Delete Player</button>
    </div>
  </div>
  <div class="card-right">
    <div class="card-right-top">
      <input class="card-edit-name" value="${p.name}" onchange="updatePlayerName(this.value)" placeholder="Player name">
    </div>

    ${isBatter ? `
    <div>
      <div class="stats-section-title">Career Highlights</div>
      <div style="overflow-x:auto">
        <table class="season-log-table" style="min-width:700px">
          <thead><tr>
            <th>G</th><th>AB</th><th>R</th><th>H</th><th>1B</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th>
            <th>BB</th><th>K</th><th>SB</th><th>CS</th><th>SF</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
          </tr></thead>
          <tbody><tr>
            <td>${p.career.g || 0}</td>
            <td>${p.career.ab || 0}</td>
            <td>${p.career.r || 0}</td>
            <td>${p.career.h || 0}</td>
            <td>${(p.career.h||0)-(p.career.hr||0)-(p.career.doubles||0)-(p.career.triples||0)}</td>
            <td>${p.career.doubles || 0}</td>
            <td>${p.career.triples || 0}</td>
            <td>${p.career.hr || 0}</td>
            <td>${p.career.rbi || 0}</td>
            <td>${p.career.bb || 0}</td>
            <td>${p.career.k || 0}</td>
            <td>${p.career.sb || 0}</td>
            <td>${p.career.cs || 0}</td>
            <td>${p.career.sf || 0}</td>
            <td>${avg}</td>
            <td>${obp}</td>
            <td>${slg}</td>
            <td>${ops}</td>
          </tr></tbody>
        </table>
      </div>
    </div>` : `
    <div>
      <div class="stats-section-title">Career Highlights</div>
      <div style="overflow-x:auto">
        <table class="season-log-table" style="min-width:900px">
          <thead><tr>
            <th>ERA</th><th>W</th><th>L</th><th>WHIP</th>
            <th>G</th><th>GS</th><th>CG</th><th>SHO</th>
            <th>IP</th><th>K</th><th>BB</th><th>SVO</th>
            <th>H</th><th>R</th><th>ER</th><th>HR</th>
            <th>HBP</th><th>SV</th><th>BS</th><th>K/9</th><th>BAA</th>
          </tr></thead>
          <tbody><tr>
            <td>${p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2)}</td>
            <td>${p.career.w || 0}</td>
            <td>${p.career.l || 0}</td>
            <td>${p.career.ip > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—'}</td>
            <td>${p.career.g || 0}</td>
            <td>${p.career.gs || 0}</td>
            <td>${p.career.cg || 0}</td>
            <td>${p.career.sho || 0}</td>
            <td>${fmtIP(p.career.ip)}</td>
            <td>${p.career.k || 0}</td>
            <td>${p.career.bb || 0}</td>
            <td>${p.career.svo || 0}</td>
            <td>${p.career.h || 0}</td>
            <td>${p.career.r || 0}</td>
            <td>${p.career.er || 0}</td>
            <td>${p.career.hr || 0}</td>
            <td>${p.career.hbp || 0}</td>
            <td>${p.career.sv || 0}</td>
            <td>${(p.career.svo||0)-(p.career.sv||0)}</td>
            <td>${p.career.ip > 0 ? ((p.career.k / p.career.ip) * 9).toFixed(1) : '—'}</td>
            <td>${(() => { const ab = (p.career.bf||0)-(p.career.bb||0)-(p.career.hbp||0); return ab > 0 ? (p.career.h/ab).toFixed(3) : '—'; })()}</td>
          </tr></tbody>
        </table>
      </div>
    </div>`}

    <div>
      <div class="stats-section-title">Scouting Report</div>
      <div class="rating-grid">
        ${ratings.map(r => {
          const val = Math.max(0, Math.min(99, r.v));
          return `<div class="rating-row">
          <div class="rating-label">${r.l}</div>
          <div class="rating-bar-bg" onclick="updateRatingFromBar('${r.l}', event)" style="cursor:pointer"><div class="rating-bar-fill" id="rbar-${r.l.replace(' ','')}" style="width:${Math.max(2, val)}%"></div></div>
          <input class="rating-input" type="number" min="0" max="99" value="${val}" id="rinput-${r.l.replace(' ','')}" onchange="updateRating('${r.l}', this.value)">
        </div>`;
        }).join('')}
      </div>
    </div>

    <div>
      <div class="stats-section-title">Projected Stats <span style="font-size:0.55rem;font-weight:400;color:var(--muted)">${proj.type === 'batter' ? '/ 100 PA vs avg pitcher' : '/ 100 PA faced vs avg lineup'}</span></div>
      <div class="proj-stats-grid">${projHtml}</div>
    </div>
  </div>`;
}

export function updateRatingFromBar(label, event) {
  const bar = event.currentTarget;
  const v = Math.round((event.offsetX / bar.offsetWidth) * 99);
  const input = document.getElementById(`rinput-${label.replace(' ', '')}`);
  if (input) input.value = v;
  updateRating(label, v);
}

export function updateRating(label, rawVal) {
  if (!currentPlayer) return;
  const p = currentPlayer.player;
  const v = Math.max(0, Math.min(99, parseInt(rawVal) || 0));

  if (p.type === 'batter') {
    if (label === 'Contact')  { p.kPct  = cl((1 - v/100) * 0.40, 0.10, 0.40); p.avg = cl(0.195 + (v/100) * 0.130, 0.190, 0.330); }
    if (label === 'Power')    { p.hrPct = cl((v/100) * 0.065, 0.002, 0.065); p.doublePct = cl(0.022 + (v/100) * 0.050, 0.02, 0.09); }
    if (label === 'Patience') p.bbPct  = cl((v/100) * 0.18, 0.04, 0.18);
    if (label === 'Speed')    p.sbRate = cl((v/100) * 0.15, 0.02, 0.25);
  } else {
    if (label === 'Strikeout') p.kPct  = cl((v/100) * 0.35, 0.14, 0.35);
    if (label === 'Control')   p.bbPct = cl((1 - v/100) * 0.14, 0.04, 0.14);
    if (label === 'GB Rate')   p.goD   = (v/100) * 0.08 - 0.04;
    if (label === 'Stuff')     p.era   = cl(6.0 - (v/100) * 4.0, 2.0, 6.0);
  }

  // Update bar width live
  saveLeague();
  renderCard(currentPlayer.team, currentPlayer.player);
}

export function updatePlayerName(name) {
  if (!currentPlayer || !name.trim()) return;
  currentPlayer.player.name = name.trim();
  const pn = document.querySelector('.card-player-name');
  if (pn) pn.textContent = name.trim();
  saveLeague();
}

export function prevCard() {
  if (!currentPlayer) return;
  const list = [...currentPlayer.team.batters, ...currentPlayer.team.pitchers];
  const idx = list.findIndex(pl => pl.id === currentPlayer.player.id);
  if (idx <= 0) return;
  currentPlayer.player = list[idx - 1];
  renderCard(currentPlayer.team, currentPlayer.player);
}

export function nextCard() {
  if (!currentPlayer) return;
  const list = [...currentPlayer.team.batters, ...currentPlayer.team.pitchers];
  const idx = list.findIndex(pl => pl.id === currentPlayer.player.id);
  if (idx >= list.length - 1) return;
  currentPlayer.player = list[idx + 1];
  renderCard(currentPlayer.team, currentPlayer.player);
}

export function closeCard(e) {
  if (e.target === document.getElementById('card-overlay')) closeCardDirect();
}
export function closeCardDirect() {
  document.getElementById('card-overlay').classList.remove('open');
  currentPlayer = null;
}

export function deleteCurrentPlayer() {
  if (!currentPlayer) return;
  const { team: t, player: p } = currentPlayer;
  if (!confirm(`Delete ${p.name} from ${t.name}?`)) return;
  if (p.type === 'batter') t.batters = t.batters.filter(b => b.id !== p.id);
  else t.pitchers = t.pitchers.filter(pl => pl.id !== p.id);
  saveLeague();
  closeCardDirect();
  const overlay = document.getElementById('roster-table-overlay');
  if (overlay && overlay.style.display === 'flex') renderRosterTableContent();
}

// ====================================================================
// PLAYERS TABLE (league-wide)
// ====================================================================
export function setFilter(f, el) {
  playerFilter = f;
  statFilters = [];
  if (f === 'PIT' && ['avg', 'hr', 'rbi', 'pa'].includes(sortCol)) { sortCol = 'era'; sortDir = 1; }
  if (f === 'BAT' && !['avg', 'hr', 'rbi', 'k', 'pa', 'era', 'whip', 'name', 'team'].includes(sortCol)) { sortCol = 'avg'; sortDir = -1; }
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderPlayersTable();
}

export function setTeamFilter(val) {
  playerTeamFilter = val;
  renderPlayersTable();
}

export function setStatFilter() {
  const colEl = document.getElementById('stat-filter-col');
  const opEl  = document.getElementById('stat-filter-op');
  const valEl = document.getElementById('stat-filter-val');
  const col = colEl?.value || '';
  const op  = opEl?.value  || '>=';
  const val = valEl?.value || '';
  if (!col || val === '' || isNaN(parseFloat(val))) return;
  const label = colEl?.options[colEl.selectedIndex]?.text || col;
  statFilters.push({ col, op, val, label });
  if (valEl) valEl.value = '';
  renderPlayersTable();
}

export function removeStatFilter(index) {
  statFilters.splice(index, 1);
  renderPlayersTable();
}

export function clearStatFilter() {
  statFilters = [];
  renderPlayersTable();
}

function getStatValue(p, col) {
  switch (col) {
    case 'avg':  return battingAvg(p);
    case 'pa':   return p.career.pa  || 0;
    case 'r':    return p.career.r   || 0;
    case 'h':    return p.career.h   || 0;
    case 'hr':   return p.career.hr  || 0;
    case 'rbi':  return p.career.rbi || 0;
    case 'bb':   return p.career.bb  || 0;
    case 'k':    return p.career.k   || 0;
    case 'sb':   return p.career.sb  || 0;
    case 'cs':   return p.career.cs  || 0;
    case 'era':  return (p.career?.ip || 0) > 0 ? (p.career.er / p.career.ip) * 9 : (p.era || 99);
    case 'whip': return (p.career?.ip || 0) > 0 ? (p.career.bb + p.career.h) / p.career.ip : 99;
    case 'pw':   return p.career.w   || 0;
    case 'pl':   return p.career.l   || 0;
    case 'pgs':  return p.career.gs  || 0;
    case 'pg':   return p.career.g   || 0;
    case 'pcg':  return p.career.cg  || 0;
    case 'psho': return p.career.sho || 0;
    case 'psv':  return p.career.sv  || 0;
    case 'psvo': return p.career.svo || 0;
    case 'pbs':  return (p.career.svo || 0) - (p.career.sv || 0);
    case 'pip':  return p.career.ip  || 0;
    case 'ph':   return p.career.h   || 0;
    case 'pr':   return p.career.r   || 0;
    case 'per':  return p.career.er  || 0;
    case 'phr':  return p.career.hr  || 0;
    case 'phbp': return p.career.hbp || 0;
    case 'pbb':  return p.career.bb  || 0;
    case 'pbaa': { const ab = (p.career.bf||0)-(p.career.bb||0)-(p.career.hbp||0); return ab > 0 ? (p.career.h||0)/ab : 0; }
    default:     return 0;
  }
}

export function renderPlayersTable() {
  const search = (document.getElementById('player-search')?.value || '').toLowerCase();
  const tf = playerTeamFilter.toLowerCase();
  const matchesTeam = p => !tf || p.teamName.toLowerCase() === tf;

  // Historical view banner
  const banner = document.getElementById('historical-banner');
  const sub = document.getElementById('players-sub');
  if (banner) {
    if (historicalView) {
      banner.style.display = 'flex';
      document.getElementById('historical-banner-label').textContent =
        `VIEWING ARCHIVED SEASON — ${historicalView.leagueName} · ${historicalView.season}`;
      if (sub) sub.textContent = `${historicalView.leagueName} · ${historicalView.season} Season`;
    } else {
      banner.style.display = 'none';
      if (sub) sub.textContent = 'League-wide stats & cards';
    }
  }

  // Team filter dropdown
  const tfBar = document.getElementById('team-filter-bar');
  if (tfBar) {
    const divOrder = ['NL West','NL Central','NL East','AL West','AL Central','AL East'];
    const divMap = new Map();
    for (const t of _activeTeams()) {
      const div = t.division || '—';
      if (!divMap.has(div)) divMap.set(div, []);
      divMap.get(div).push(t.name);
    }
    const divsSorted = [...divMap.keys()].sort((a, b) => {
      const ai = divOrder.indexOf(a), bi = divOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1; if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    const teamOpts = divsSorted.map(div => {
      const teams = divMap.get(div).slice().sort();
      return `<optgroup label="${div}">${teams.map(n => `<option value="${n}"${playerTeamFilter === n ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`;
    }).join('');
    tfBar.innerHTML = `<label style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted);margin-right:8px">Filter by team:</label>
      <select class="sched-team-filter" onchange="setTeamFilter(this.value)">
        <option value="">All Teams</option>
        ${teamOpts}
      </select>
      ${playerTeamFilter ? ` <button class="btn sm" style="margin-left:6px" onclick="setTeamFilter('')">✕ Clear</button>` : ''}`;
  }

  // Stat filter bar — only re-render the input controls when the player type tab
  // changes; update the active-filter chips on every render.
  const sfBar = document.getElementById('stat-filter-bar');
  if (sfBar) {
    if (sfBar.dataset.filter !== playerFilter) {
      sfBar.dataset.filter = playerFilter;
      const batStats = [
        { col: 'pa', label: 'PA' }, { col: 'avg', label: 'AVG' },
        { col: 'r',  label: 'R'  }, { col: 'h',   label: 'H'   },
        { col: 'hr', label: 'HR' }, { col: 'rbi', label: 'RBI' },
        { col: 'bb', label: 'BB' }, { col: 'k',   label: 'K'   },
        { col: 'sb', label: 'SB' }, { col: 'cs',  label: 'CS'  },
      ];
      const pitStats = [
        { col: 'pw',   label: 'W'    }, { col: 'pl',   label: 'L'    },
        { col: 'era',  label: 'ERA'  }, { col: 'pgs',  label: 'GS'   },
        { col: 'pg',   label: 'G'    }, { col: 'pcg',  label: 'CG'   },
        { col: 'psho', label: 'SHO'  }, { col: 'psvo', label: 'SVO'  },
        { col: 'psv',  label: 'SV'   }, { col: 'pbs',  label: 'BS'   },
        { col: 'pip',  label: 'IP'   }, { col: 'ph',   label: 'H'    },
        { col: 'pr',   label: 'R'    }, { col: 'per',  label: 'ER'   },
        { col: 'phr',  label: 'HR'   }, { col: 'phbp', label: 'HBP'  },
        { col: 'pbb',  label: 'BB'   }, { col: 'k',    label: 'K'    },
        { col: 'whip', label: 'WHIP' }, { col: 'pbaa', label: 'BAA'  },
      ];
      let statOptsHtml;
      if (playerFilter === 'BAT') {
        statOptsHtml = batStats.map(s => `<option value="${s.col}">${s.label}</option>`).join('');
      } else if (playerFilter === 'PIT') {
        statOptsHtml = pitStats.map(s => `<option value="${s.col}">${s.label}</option>`).join('');
      } else {
        statOptsHtml = `<optgroup label="Batting">${batStats.map(s => `<option value="${s.col}">${s.label}</option>`).join('')}</optgroup>`
                     + `<optgroup label="Pitching">${pitStats.map(s => `<option value="pit:${s.col}">${s.label}</option>`).join('')}</optgroup>`;
      }
      const opOpts = ['>=', '<=', '='].map(op =>
        `<option value="${op}">${op === '>=' ? '≥' : op === '<=' ? '≤' : '='}</option>`
      ).join('');
      sfBar.innerHTML = `<div style="display:flex;align-items:center;gap:0">
          <label style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted);margin-right:8px">Filter by stat:</label>
          <select class="sched-team-filter" id="stat-filter-col">
            <option value="">— Select stat —</option>${statOptsHtml}
          </select>
          <select class="sched-team-filter" id="stat-filter-op" style="margin-left:4px">${opOpts}</select>
          <input type="number" id="stat-filter-val" placeholder="Value"
            style="width:80px;margin-left:4px;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;padding:4px 8px;border:1px solid var(--line);border-radius:3px;background:var(--panel);color:var(--ink)">
          <button class="btn sm primary" style="margin-left:6px" onclick="setStatFilter()">Add Filter</button>
        </div>
        <div class="stat-filter-chips" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px"></div>`;
    }
    // Re-render chips on every pass
    const chipsEl = sfBar.querySelector('.stat-filter-chips');
    if (chipsEl) {
      if (statFilters.length === 0) {
        chipsEl.innerHTML = '';
      } else {
        const opSym = op => op === '>=' ? '≥' : op === '<=' ? '≤' : '=';
        chipsEl.innerHTML = statFilters.map((f, i) =>
          `<span style="display:inline-flex;align-items:center;gap:5px;font-family:'IBM Plex Mono',monospace;font-size:0.68rem;padding:3px 8px;border:1px solid var(--ink);border-radius:2px;background:var(--ink);color:var(--chalk)">
            ${f.label} ${opSym(f.op)} ${f.val}
            <button onclick="removeStatFilter(${i})" style="background:none;border:none;color:var(--chalk);cursor:pointer;font-size:0.75rem;padding:0;line-height:1">✕</button>
          </span>`
        ).join('') +
        `<button class="btn sm" style="margin-left:2px" onclick="clearStatFilter()">Clear All</button>`;
      }
    }
  }

  const fixName = p => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—';
  const activeBatters  = () => _activeTeams().flatMap(t => t.batters.map(b => ({ ...b, name: fixName(b), teamName: t.name })));
  const activePitchers = () => _activeTeams().flatMap(t => t.pitchers.map(p => ({ ...p, name: fixName(p), teamName: t.name })));

  let players = [];
  if (playerFilter !== 'PIT') {
    activeBatters().forEach(b => { if (matchesTeam(b) && (!search || b.name.toLowerCase().includes(search) || b.teamName.toLowerCase().includes(search))) players.push(b); });
  }
  if (playerFilter !== 'BAT') {
    activePitchers().forEach(p => { if (matchesTeam(p) && (!search || p.name.toLowerCase().includes(search) || p.teamName.toLowerCase().includes(search))) players.push(p); });
  }
  // Omit players with no accrued stats
  players = players.filter(p => p.type === 'batter' ? (p.career.pa || 0) > 0 : (p.career.g || 0) > 0);

  // Apply stacked stat filters (AND logic)
  for (const f of statFilters) {
    let threshold = parseFloat(f.val);
    if (isNaN(threshold)) continue;
    const col = f.col.startsWith('pit:') ? f.col.slice(4) : f.col;
    if (col === 'avg' || col === 'pbaa') threshold /= 1000;
    players = players.filter(p => {
      const val = getStatValue(p, col);
      if (f.op === '>=') return val >= threshold;
      if (f.op === '<=') return val <= threshold;
      return Math.abs(val - threshold) < 0.0001;
    });
  }

  const isPitView = playerFilter === 'PIT';
  const formatIP  = ip => { const o = Math.round((ip || 0) * 3); return `${Math.floor(o / 3)}.${o % 3}`; };

  // Pitcher table needs horizontal scroll and compact font
  const tbl = document.getElementById('players-table');
  if (tbl) {
    tbl.style.fontSize = isPitView ? '0.72rem' : '';
    const wrap = tbl.parentElement;
    if (wrap) wrap.style.overflowX = isPitView ? 'auto' : '';
  }

  // Sort
  players.sort((a, b) => {
    let av = 0, bv = 0;
    if      (sortCol === 'avg')  { av = battingAvg(a); bv = battingAvg(b); }
    else if (sortCol === 'hr')   { av = a.career.hr || 0; bv = b.career.hr || 0; }
    else if (sortCol === 'rbi')  { av = a.career.rbi || 0; bv = b.career.rbi || 0; }
    else if (sortCol === 'r')    { av = a.career.r  || 0; bv = b.career.r  || 0; }
    else if (sortCol === 'h')    { av = a.career.h  || 0; bv = b.career.h  || 0; }
    else if (sortCol === 'bb')   { av = a.career.bb || 0; bv = b.career.bb || 0; }
    else if (sortCol === 'sb')   { av = a.career.sb || 0; bv = b.career.sb || 0; }
    else if (sortCol === 'cs')   { av = a.career.cs || 0; bv = b.career.cs || 0; }
    else if (sortCol === 'k')    { av = a.career.k || 0; bv = b.career.k || 0; }
    else if (sortCol === 'era')  { av = (a.career?.ip || 0) > 0 ? (a.career.er / a.career.ip) * 9 : (a.era || 99); bv = (b.career?.ip || 0) > 0 ? (b.career.er / b.career.ip) * 9 : (b.era || 99); }
    else if (sortCol === 'whip') { av = (a.career?.ip || 0) > 0 ? (a.career.bb + a.career.h) / a.career.ip : 99; bv = (b.career?.ip || 0) > 0 ? (b.career.bb + b.career.h) / b.career.ip : 99; }
    else if (sortCol === 'pa')   { av = a.career.pa || 0; bv = b.career.pa || 0; }
    else if (sortCol === 'pw')   { av = a.career.w || 0; bv = b.career.w || 0; }
    else if (sortCol === 'pl')   { av = a.career.l || 0; bv = b.career.l || 0; }
    else if (sortCol === 'pgs')  { av = a.career.gs || 0; bv = b.career.gs || 0; }
    else if (sortCol === 'pg')   { av = a.career.g || 0; bv = b.career.g || 0; }
    else if (sortCol === 'pcg')  { av = a.career.cg || 0; bv = b.career.cg || 0; }
    else if (sortCol === 'psho') { av = a.career.sho || 0; bv = b.career.sho || 0; }
    else if (sortCol === 'psv')  { av = a.career.sv || 0; bv = b.career.sv || 0; }
    else if (sortCol === 'psvo') { av = a.career.svo || 0; bv = b.career.svo || 0; }
    else if (sortCol === 'pbs')  { av = (a.career.svo||0)-(a.career.sv||0); bv = (b.career.svo||0)-(b.career.sv||0); }
    else if (sortCol === 'pip')  { av = a.career.ip || 0; bv = b.career.ip || 0; }
    else if (sortCol === 'ph')   { av = a.career.h || 0; bv = b.career.h || 0; }
    else if (sortCol === 'pr')   { av = a.career.r || 0; bv = b.career.r || 0; }
    else if (sortCol === 'per')  { av = a.career.er || 0; bv = b.career.er || 0; }
    else if (sortCol === 'phr')  { av = a.career.hr || 0; bv = b.career.hr || 0; }
    else if (sortCol === 'phbp') { av = a.career.hbp || 0; bv = b.career.hbp || 0; }
    else if (sortCol === 'pbb')  { av = a.career.bb || 0; bv = b.career.bb || 0; }
    else if (sortCol === 'pbaa') {
      const abA = (a.career.bf || 0) - (a.career.bb || 0) - (a.career.hbp || 0);
      const abB = (b.career.bf || 0) - (b.career.bb || 0) - (b.career.hbp || 0);
      av = abA > 0 ? (a.career.h || 0) / abA : 0; bv = abB > 0 ? (b.career.h || 0) / abB : 0;
    }
    return (av - bv) * sortDir;
  });

  // Header
  const thead = document.getElementById('players-thead');
  if (isPitView) {
    thead.innerHTML = `
      <th onclick="doSort('name')" style="text-align:left;width:130px">Player</th>
      <th onclick="doSort('team')" style="text-align:left;width:150px">Team</th>
      <th style="text-align:left;width:36px">Pos</th>
      <th onclick="doSort('pw')">W</th>
      <th onclick="doSort('pl')">L</th>
      <th onclick="doSort('era')">ERA</th>
      <th onclick="doSort('pgs')">GS</th>
      <th onclick="doSort('pg')">G</th>
      <th onclick="doSort('pcg')">CG</th>
      <th onclick="doSort('psho')">SHO</th>
      <th onclick="doSort('psvo')">SVO</th>
      <th onclick="doSort('psv')">SV</th>
      <th onclick="doSort('pbs')">BS</th>
      <th onclick="doSort('pip')">IP</th>
      <th onclick="doSort('ph')">H</th>
      <th onclick="doSort('pr')">R</th>
      <th onclick="doSort('per')">ER</th>
      <th onclick="doSort('phr')">HR</th>
      <th onclick="doSort('phbp')">HBP</th>
      <th onclick="doSort('pbb')">BB</th>
      <th onclick="doSort('k')">K</th>
      <th onclick="doSort('whip')">WHIP</th>
      <th onclick="doSort('pbaa')">BAA</th>
    `;
  } else {
    thead.innerHTML = `
      <th onclick="doSort('name')" style="text-align:left;width:130px">Player</th>
      <th onclick="doSort('team')" style="text-align:left;width:150px">Team</th>
      <th style="text-align:left;width:36px">Pos</th>
      <th onclick="doSort('pa')">PA</th>
      <th onclick="doSort('avg')">AVG</th>
      <th onclick="doSort('r')">R</th>
      <th onclick="doSort('h')">H</th>
      <th onclick="doSort('hr')">HR</th>
      <th onclick="doSort('rbi')">RBI</th>
      <th onclick="doSort('bb')">BB</th>
      <th onclick="doSort('k')">K</th>
      <th onclick="doSort('sb')">SB</th>
      <th onclick="doSort('cs')">CS</th>
      ${playerFilter !== 'BAT' ? `<th onclick="doSort('era')">ERA</th><th onclick="doSort('whip')">WHIP</th>` : ''}
    `;
  }
  thead.querySelectorAll('th').forEach(th => {
    if (th.getAttribute('onclick')?.includes(sortCol)) {
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });

  const tbody = document.getElementById('players-tbody');
  const colCount = isPitView ? 22 : playerFilter === 'BAT' ? 13 : 15;
  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state">No players found.</td></tr>`;
    return;
  }

  const tfoot = tbl?.querySelector('tfoot') || (() => { const f = document.createElement('tfoot'); tbl?.appendChild(f); return f; })();

  if (isPitView) {
    const pitchers = players.filter(p => p.type === 'pitcher');
    tbody.innerHTML = pitchers.map(p => {
      const era  = (p.career.ip || 0) > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2);
      const whip = (p.career.ip || 0) > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—';
      const abF  = (p.career.bf || 0) - (p.career.bb || 0) - (p.career.hbp || 0);
      const baa  = abF > 0 ? (p.career.h / abF).toFixed(3) : '—';
      return `<tr onclick="openCardById('${p.id}')">
        <td><b>${p.name}</b></td>
        <td>${p.teamName || ''}</td>
        <td><span class="pos-badge">${p.pos}</span></td>
        <td>${p.career.w || 0}</td>
        <td>${p.career.l || 0}</td>
        <td>${era}</td>
        <td>${p.career.gs || 0}</td>
        <td>${p.career.g || 0}</td>
        <td>${p.career.cg || 0}</td>
        <td>${p.career.sho || 0}</td>
        <td>${p.career.svo || 0}</td>
        <td>${p.career.sv || 0}</td>
        <td>${(p.career.svo||0)-(p.career.sv||0)}</td>
        <td>${formatIP(p.career.ip)}</td>
        <td>${p.career.h || 0}</td>
        <td>${p.career.r || 0}</td>
        <td>${p.career.er || 0}</td>
        <td>${p.career.hr || 0}</td>
        <td>${p.career.hbp || 0}</td>
        <td>${p.career.bb || 0}</td>
        <td>${p.career.k || 0}</td>
        <td>${whip}</td>
        <td>${baa}</td>
      </tr>`;
    }).join('');
    if (playerFilter === 'PIT' && pitchers.length > 0) {
      const tot = pitchers.reduce((s, p) => ({
        w: s.w + (p.career.w || 0), l: s.l + (p.career.l || 0),
        gs: s.gs + (p.career.gs || 0), g: s.g + (p.career.g || 0),
        cg: s.cg + (p.career.cg || 0), sho: s.sho + (p.career.sho || 0),
        sv: s.sv + (p.career.sv || 0), svo: s.svo + (p.career.svo || 0),
        ip: s.ip + (p.career.ip || 0), h: s.h + (p.career.h || 0),
        r: s.r + (p.career.r || 0), er: s.er + (p.career.er || 0),
        hr: s.hr + (p.career.hr || 0), hbp: s.hbp + (p.career.hbp || 0),
        bb: s.bb + (p.career.bb || 0), k: s.k + (p.career.k || 0),
        bf: s.bf + (p.career.bf || 0),
      }), { w:0,l:0,gs:0,g:0,cg:0,sho:0,sv:0,svo:0,ip:0,h:0,r:0,er:0,hr:0,hbp:0,bb:0,k:0,bf:0 });
      const tEra  = tot.ip > 0 ? ((tot.er / tot.ip) * 9).toFixed(2) : '—';
      const tWhip = tot.ip > 0 ? ((tot.bb + tot.h) / tot.ip).toFixed(2) : '—';
      const tAbF  = tot.bf - tot.bb - tot.hbp;
      const tBaa  = tAbF > 0 ? (tot.h / tAbF).toFixed(3) : '—';
      tfoot.innerHTML = `<tr class="players-totals-row">
        <td colspan="3"><b>Totals / Weighted Avg</b></td>
        <td>${tot.w}</td><td>${tot.l}</td><td>${tEra}</td>
        <td>${tot.gs}</td><td>${tot.g}</td><td>${tot.cg}</td><td>${tot.sho}</td>
        <td>${tot.svo}</td><td>${tot.sv}</td><td>${tot.svo - tot.sv}</td><td>${formatIP(tot.ip)}</td>
        <td>${tot.h}</td><td>${tot.r}</td><td>${tot.er}</td><td>${tot.hr}</td>
        <td>${tot.hbp}</td><td>${tot.bb}</td><td>${tot.k}</td>
        <td>${tWhip}</td><td>${tBaa}</td>
      </tr>`;
    } else { tfoot.innerHTML = ''; }
  } else {
    tbody.innerHTML = players.map(p => {
      const avg  = p.type === 'batter'  ? battingAvg(p).toFixed(3) : '—';
      const era  = p.type === 'pitcher' ? ((p.career.ip || 0) > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2)) : '—';
      const whip = p.type === 'pitcher' ? ((p.career.ip || 0) > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—') : '—';
      return `<tr onclick="openCardById('${p.id}')">
        <td><b>${p.name}</b></td>
        <td>${p.teamName || ''}</td>
        <td><span class="pos-badge">${p.pos}</span></td>
        <td>${p.career.pa || 0}</td>
        <td>${avg}</td>
        <td>${p.career.r || 0}</td>
        <td>${p.career.h || 0}</td>
        <td>${p.career.hr || 0}</td>
        <td>${p.career.rbi || 0}</td>
        <td>${p.career.bb || 0}</td>
        <td>${p.career.k || 0}</td>
        <td>${p.career.sb || 0}</td>
        <td>${p.career.cs || 0}</td>
        ${playerFilter !== 'BAT' ? `<td>${era}</td><td>${whip}</td>` : ''}
      </tr>`;
    }).join('');
    if (playerFilter === 'BAT') {
      const batters = players.filter(p => p.type === 'batter');
      if (batters.length > 0) {
        const tot = batters.reduce((s, p) => ({
          pa: s.pa + (p.career.pa || 0), ab: s.ab + (p.career.ab || 0),
          h: s.h + (p.career.h || 0), hr: s.hr + (p.career.hr || 0),
          r: s.r + (p.career.r || 0), bb: s.bb + (p.career.bb || 0),
          rbi: s.rbi + (p.career.rbi || 0), k: s.k + (p.career.k || 0),
          sb: s.sb + (p.career.sb || 0),
          cs: s.cs + (p.career.cs || 0),
        }), { pa:0, ab:0, h:0, hr:0, r:0, bb:0, rbi:0, k:0, sb:0, cs:0 });
        const tAvg = tot.ab > 0 ? (tot.h / tot.ab).toFixed(3) : '—';
        tfoot.innerHTML = `<tr class="players-totals-row">
          <td colspan="3"><b>Totals / Weighted Avg</b></td>
          <td>${tot.pa}</td><td>${tAvg}</td>
          <td>${tot.r}</td><td>${tot.h}</td><td>${tot.hr}</td><td>${tot.rbi}</td><td>${tot.bb}</td><td>${tot.k}</td><td>${tot.sb}</td><td>${tot.cs}</td>
        </tr>`;
      } else { tfoot.innerHTML = ''; }
    } else { tfoot.innerHTML = ''; }
  }
}

export function doSort(col) {
  if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = -1; }
  renderPlayersTable();
}

export function openCardById(pid) {
  for (const t of LEAGUE.teams) {
    const p = [...t.batters, ...t.pitchers].find(pl => pl.id === pid);
    if (p) { openCard(t.id, p.id); return; }
  }
}

// ====================================================================
// ADVANCE SEASON
// ====================================================================
export function clearSeason() {
  if (!confirm('Are you sure you want to delete the season stats?')) return;
  if (confirm('Download a season archive before clearing?')) {
    exportSeasonArchive();
  }
  LEAGUE.teams.forEach(t => {
    [...t.batters, ...t.pitchers].forEach(p => {
      if (p.type === 'batter') {
        p.career = { g:0, pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 };
      } else {
        p.career = { g:0, gs:0, cg:0, sho:0, ip:0, h:0, r:0, er:0, bb:0, k:0, w:0, l:0, sv:0, svo:0, hr:0, hbp:0, bf:0 };
      }
    });
    t.w = 0; t.l = 0; t.runsFor = 0; t.runsAgainst = 0;
  });
  LEAGUE.gamesPlayed = 0;
  LEAGUE.playoffs = null;
  LEAGUE.schedule = [];
  LEAGUE._schedFilter = '';
  saveLeague();
  renderHome();
}

export function advanceSeason() {
  if (!confirm(`Advance to ${LEAGUE.season + 1} season? Current season stats will be archived.`)) return;
  LEAGUE.teams.forEach(t => {
    [...t.batters, ...t.pitchers].forEach(p => {
      if (p.type === 'batter') {
        const g = p.career;
        if (g.pa > 0) p.seasons.push({ year:LEAGUE.season, g:g.g||0, pa:g.pa, ab:g.ab, h:g.h, hr:g.hr, rbi:g.rbi, r:g.r, bb:g.bb, k:g.k, doubles:g.doubles||0, triples:g.triples||0, sb:g.sb||0, cs:g.cs||0 });
        p.career = { g:0, pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 };
      } else {
        const g = p.career;
        if (g.ip > 0) p.seasons.push({ year:LEAGUE.season, g:g.g, gs:g.gs||0, cg:g.cg||0, sho:g.sho||0, ip:g.ip, h:g.h, r:g.r||0, er:g.er, bb:g.bb, k:g.k, w:g.w, l:g.l, sv:g.sv||0, svo:g.svo||0, hr:g.hr||0, hbp:g.hbp||0, bf:g.bf||0 });
        p.career = { g:0, gs:0, cg:0, sho:0, ip:0, h:0, r:0, er:0, bb:0, k:0, w:0, l:0, sv:0, svo:0, hr:0, hbp:0, bf:0 };
      }
    });
    t.w = 0; t.l = 0; t.runsFor = 0; t.runsAgainst = 0;
  });
  LEAGUE.season++;
  LEAGUE.gamesPlayed = 0;
  LEAGUE._schedFilter = '';
  saveLeague();
  renderHome();
}

// ====================================================================
// SCHEDULE
// ====================================================================
export function renderSchedule() {
  const cont = document.getElementById('schedule-container');
  if (!cont) return;
  const sub = document.getElementById('schedule-sub');
  const sched = LEAGUE.schedule || [];
  if (sub) {
    if (sched.length > 0) {
      const played = sched.filter(g => g.played).length;
      const name = LEAGUE.scheduleName ? `${LEAGUE.scheduleName} · ` : '';
      sub.textContent = `${name}${played} of ${sched.length} games played`;
    } else {
      sub.textContent = 'No schedule yet';
    }
  }
  if (schedBuildMode) { renderScheduleBuildMode(cont); return; }
  renderScheduleView(cont);
}

function renderScheduleView(cont) {
  const sched = LEAGUE.schedule || [];
  const played = sched.filter(g => g.played).length;
  const saved = LEAGUE.savedSchedules || [];

  let html = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:${schedShowLoad ? '12px' : '24px'}">
    <button class="btn sm primary" onclick="schedNewSeason()">New Schedule</button>
    ${saved.length > 0 ? `<button class="btn sm${schedShowLoad ? ' active-btn' : ''}" onclick="schedLoadOpen()">Load Schedule</button>` : ''}
    ${sched.length > 0 ? `<button class="btn sm" onclick="schedDeleteAll()">Clear Schedule</button>` : ''}
    ${sched.length > 0 ? `<button class="btn sm" onclick="schedRecycle()">Recycle Schedule</button>` : ''}
    ${sched.length > 0 ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--muted)">${played} / ${sched.length} games played</span>` : ''}
  </div>`;

  if (schedShowLoad) {
    html += `<div class="sched-saved-list">`;
    if (saved.length === 0) {
      html += `<div class="sched-saved-empty">No saved schedules yet.</div>`;
    } else {
      saved.forEach((s, i) => {
        const playedCount = s.games.filter(g => g.played).length;
        const isCurrent = LEAGUE.scheduleName === s.name && sched.length === s.games.length;
        html += `<div class="sched-saved-item${isCurrent ? ' current' : ''}" onclick="schedLoadPick(${i})" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <span class="ssi-name">${s.name}</span>
            <span class="ssi-meta">${s.games.length} games · ${playedCount} played${isCurrent ? ' · active' : ''}</span>
          </div>
          <button onclick="event.stopPropagation();schedDeleteSaved(${i})" style="background:transparent;border:1px solid #c00;color:#c00;border-radius:2px;padding:2px 8px;cursor:pointer;font-size:0.65rem;flex-shrink:0;margin-left:12px">Delete</button>
        </div>`;
      });
    }
    html += `</div>`;
  }

  if (sched.length === 0) {
    html += `<div style="padding:40px 0;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:0.75rem;color:var(--muted)">No schedule yet. Click "New Schedule" to build one.</div>`;
    cont.innerHTML = html;
    return;
  }

  // Team filter dropdown
  const sfDivOrder = ['NL West','NL Central','NL East','AL West','AL Central','AL East'];
  const sfDivMap = new Map();
  for (const t of LEAGUE.teams) {
    const div = t.division || '—';
    if (!sfDivMap.has(div)) sfDivMap.set(div, []);
    sfDivMap.get(div).push(t.name);
  }
  const sfDivsSorted = [...sfDivMap.keys()].sort((a, b) => {
    const ai = sfDivOrder.indexOf(a), bi = sfDivOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  const sfTeamOpts = sfDivsSorted.map(div => {
    const teams = sfDivMap.get(div).slice().sort();
    return `<optgroup label="${div}">${teams.map(n => `<option value="${n}"${schedTeamFilter === n ? ' selected' : ''}>${n}</option>`).join('')}</optgroup>`;
  }).join('');
  html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
    <label style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted)">Filter by team:</label>
    <select class="sched-team-filter" onchange="schedSetTeamFilter(this.value)">
      <option value="">All Teams</option>
      ${sfTeamOpts}
    </select>
    ${schedTeamFilter ? `<button class="btn sm" onclick="schedSetTeamFilter('')">✕ Clear</button>` : ''}
  </div>`;

  // Preserve original indices for click handlers
  const tf = schedTeamFilter.toLowerCase();
  const indexed  = sched.map((g, i) => ({ ...g, _idx: i }));
  const matchesFilter = g => {
    if (!tf) return true;
    const away = LEAGUE.teams.find(t => t.id === g.awayId);
    const home = LEAGUE.teams.find(t => t.id === g.homeId);
    return (away && away.name.toLowerCase() === tf) || (home && home.name.toLowerCase() === tf);
  };
  const upcoming = indexed.filter(g => !g.played && matchesFilter(g)).slice(0, 50);
  const recent   = indexed.filter(g => g.played && matchesFilter(g)).reverse();

  let leftCol = '';
  let rightCol = '';

  if (upcoming.length > 0) {
    leftCol += `<div class="section-title" style="margin-bottom:10px">Upcoming Games</div><div class="sched-list">`;
    for (const g of upcoming) {
      const away = LEAGUE.teams.find(t => t.id === g.awayId);
      const home = LEAGUE.teams.find(t => t.id === g.homeId);
      if (!away || !home) continue;
      leftCol += `<div class="sched-row sched-clickable" onclick="schedPlayGame(${g._idx})">
        <span class="sched-team">${teamLogoHtml(away, 18)} ${away.name}</span>
        <span class="sched-at">@</span>
        <span class="sched-team">${teamLogoHtml(home, 18)} ${home.name}</span>
      </div>`;
    }
    const rem = indexed.filter(g => !g.played && matchesFilter(g)).length;
    if (rem > 50) leftCol += `<div class="sched-more">…and ${rem - 50} more games</div>`;
    leftCol += '</div>';
  }

  if (recent.length > 0) {
    rightCol += `<div class="section-title" style="margin-bottom:10px">Recent Results</div><div class="sched-list">`;
    for (const g of recent) {
      const away = LEAGUE.teams.find(t => t.id === g.awayId);
      const home = LEAGUE.teams.find(t => t.id === g.homeId);
      if (!away || !home) continue;
      const awayWon = (g.awayScore ?? 0) > (g.homeScore ?? 0);
      let wlBadge = '';
      if (tf) {
        const filtIsAway = away.name.toLowerCase() === tf;
        const filtWon = filtIsAway ? awayWon : !awayWon;
        wlBadge = `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.65rem;font-weight:700;width:14px;flex-shrink:0;color:${filtWon ? '#4a9' : '#c44'}">${filtWon ? 'W' : 'L'}</span>`;
      }
      rightCol += `<div class="sched-row played sched-clickable" onclick="schedPlayGame(${g._idx})">
        ${wlBadge}
        <span class="sched-team${awayWon ? ' sched-winner' : ''}">${teamLogoHtml(away, 18)} ${away.name}</span>
        <span class="sched-score">${g.awayScore ?? '—'} – ${g.homeScore ?? '—'}</span>
        <span class="sched-team${!awayWon ? ' sched-winner' : ''}">${teamLogoHtml(home, 18)} ${home.name}</span>
      </div>`;
    }
    rightCol += '</div>';
  }

  html += `<div class="sched-columns">
    <div class="sched-col-left">${leftCol}</div>
    <div class="sched-col-divider"></div>
    <div class="sched-col-right">${rightCol}</div>
  </div>`;
  cont.innerHTML = html;
}

function calcIntraGames() {
  if (schedIntraCount <= 0) return 0;
  const counts = {};
  LEAGUE.teams.forEach(t => { counts[t.division] = (counts[t.division] || 0) + 1; });
  return Object.values(counts).reduce((sum, n) => sum + schedIntraCount * n * (n - 1), 0);
}

function calcRowGames(row) {
  if (!row.thisTeam || !row.opponent) return 0;
  const a = LEAGUE.teams.filter(t => t.division === row.thisTeam).length;
  const b = LEAGUE.teams.filter(t => t.division === row.opponent).length;
  return row.thisTeam === row.opponent ? row.count * a * (a - 1) : row.count * 2 * a * b;
}

function buildLeagueMap() {
  const leagueOrder = ['American League', 'National League'];
  const leagueMap = new Map();
  for (const t of LEAGUE.teams) {
    const lg = t.league || '—';
    const dv = t.division || '—';
    if (!leagueMap.has(lg)) leagueMap.set(lg, new Map());
    const divMap = leagueMap.get(lg);
    if (!divMap.has(dv)) divMap.set(dv, []);
    divMap.get(dv).push(t);
  }
  const sortedLeagues = [...leagueMap.keys()].sort((a, b) => {
    const ai = leagueOrder.indexOf(a), bi = leagueOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return { leagueMap, sortedLeagues };
}

function renderScheduleBuildMode(cont) {
  const { leagueMap, sortedLeagues } = buildLeagueMap();
  const intraGames = calcIntraGames();
  const totalGames = intraGames + schedRows.reduce((sum, r) => sum + calcRowGames(r), 0);
  const hasAnyRow = schedIntraCount > 0 || schedRows.some(r => r.thisTeam || r.opponent);

  const mkDropZone = (rowIdx, col, value) => {
    const filled = !!value;
    return `<div class="sched-drop-zone${filled ? ' filled' : ''}"
      ondragover="event.preventDefault()"
      ondrop="schedDrop(${rowIdx},'${col}')"
      ondragenter="this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')">
      <span style="pointer-events:none">${value || 'Drop division here'}</span>
    </div>`;
  };

  const countSelect = (rowIdx, count) =>
    `<select class="sched-count-select" onchange="schedSetCount(${rowIdx},this.value)">
      ${Array.from({length:13},(_,i)=>`<option value="${i+1}"${count===i+1?' selected':''}>${i+1}</option>`).join('')}
    </select>`;

  let divPanelHtml = '';
  for (const lg of sortedLeagues) {
    divPanelHtml += `<div class="sched-div-panel-league">${lg}</div>`;
    for (const divName of [...leagueMap.get(lg).keys()].sort()) {
      const n = leagueMap.get(lg).get(divName).length;
      divPanelHtml += `<div class="div-toggle-btn sched-div-tile" draggable="true" ondragstart="schedDragStart('${divName}')">
        ${divName} <span class="div-btn-count dim" style="pointer-events:none">${n}</span>
      </div>`;
    }
  }

  let rowsHtml = schedRows.map((row, i) => {
    const isLast = i === schedRows.length - 1;
    const games = calcRowGames(row);
    return `<div class="sched-series-row">
      ${mkDropZone(i, 'this', row.thisTeam)}
      ${mkDropZone(i, 'opp', row.opponent)}
      ${countSelect(i, row.count)}
      <span class="sched-row-games">${games > 0 ? games + ' gm' : ''}</span>
      ${!isLast ? `<button class="sched-remove-row" onclick="schedRemoveRow(${i})">✕</button>` : '<span class="sched-remove-row"></span>'}
    </div>`;
  }).join('');

  const intraSelect = `<select class="sched-count-select sched-intra-select" onchange="schedSetIntraCount(this.value)">
    <option value="0"${schedIntraCount===0?' selected':''}></option>
    ${Array.from({length:13},(_,i)=>`<option value="${i+1}"${schedIntraCount===i+1?' selected':''}>${i+1}</option>`).join('')}
  </select>`;

  cont.innerHTML = `
    <div class="sched-builder-layout">
      <div class="sched-div-panel">
        <div class="sched-div-panel-title">Divisions</div>
        ${divPanelHtml}
      </div>
      <div class="sched-intra-col">
        <div class="sched-div-panel-title">Intra-Division</div>
        <div class="sched-intra-body">
          <div class="sched-intra-label">Games vs. each division rival</div>
          ${intraSelect}
          ${intraGames > 0 ? `<div class="sched-intra-preview">${intraGames} games</div>` : ''}
        </div>
      </div>
      <div class="sched-series-area">
        <div class="sched-series-header">
          <span>This Team</span><span>Opponent</span><span>Games</span><span></span><span></span>
        </div>
        ${rowsHtml}
        <div class="sched-builder-actions">
          <button class="btn sm primary" onclick="schedGenerate()"${totalGames === 0 ? ' disabled' : ''}>Save Schedule</button>
          <button class="btn sm" onclick="schedClear()"${!hasAnyRow ? ' disabled' : ''}>Clear</button>
          <button class="btn sm" onclick="schedCancel()">Cancel</button>
          <span class="sched-total-games">${totalGames > 0 ? `<b>${totalGames}</b> total games &nbsp;·&nbsp; <b>${Math.round(totalGames * 2 / LEAGUE.teams.length)}</b> per team` : ''}</span>
        </div>
      </div>
    </div>
  </div>`;
}

function resetSchedState() {
  schedRows = [{ thisTeam: null, opponent: null, count: 1 }];
  schedDragging = null;
  schedIntraCount = 0;
}

export function schedDeleteAll() {
  if (!confirm('Clear the entire schedule?')) return;
  LEAGUE.schedule = [];
  saveLeague();
  renderSchedule();
}

export function schedRecycle(afterPage) {
  if (!confirm('Reset all stats and restart the schedule from game 1?')) return;
  // Reset all schedule games to unplayed
  (LEAGUE.schedule || []).forEach(g => { g.played = false; delete g.awayScore; delete g.homeScore; });
  // Reset all player and team stats without archiving
  LEAGUE.teams.forEach(t => {
    [...t.batters, ...t.pitchers].forEach(p => {
      if (p.type === 'batter') {
        p.career = { g:0, pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 };
      } else {
        p.career = { g:0, gs:0, cg:0, sho:0, ip:0, h:0, r:0, er:0, bb:0, k:0, w:0, l:0, sv:0, svo:0, hr:0, hbp:0, bf:0 };
      }
    });
    t.w = 0; t.l = 0; t.runsFor = 0; t.runsAgainst = 0;
  });
  LEAGUE.gamesPlayed = 0;
  LEAGUE.playoffs = null;
  LEAGUE._schedFilter = '';
  saveLeague();
  if (afterPage) nav(afterPage);
  else renderSchedule();
}

export function schedNewSeason() {
  schedBuildMode = true;
  schedShowLoad = false;
  resetSchedState();
  renderSchedule();
}

export function schedLoadOpen() {
  schedShowLoad = !schedShowLoad;
  renderSchedule();
}

export function schedSetTeamFilter(val) {
  schedTeamFilter = val;
  LEAGUE._schedFilter = val;
  renderSchedule();
}

export function schedLoadPick(idx) {
  const saved = LEAGUE.savedSchedules || [];
  if (!saved[idx]) return;
  LEAGUE.schedule = saved[idx].games.map(g => ({ ...g }));
  LEAGUE.scheduleName = saved[idx].name;
  saveLeague();
  schedShowLoad = false;
  renderSchedule();
}

export function schedDeleteSaved(idx) {
  const saved = LEAGUE.savedSchedules || [];
  if (!saved[idx]) return;
  if (!confirm(`Delete "${saved[idx].name}"?`)) return;
  LEAGUE.savedSchedules.splice(idx, 1);
  saveLeague();
  renderSchedule();
}

export function schedDragStart(divName) {
  schedDragging = divName;
}

export function schedDrop(rowIdx, col) {
  if (!schedDragging) return;
  const row = schedRows[rowIdx];
  if (!row) return;
  if (col === 'this') row.thisTeam = schedDragging;
  else row.opponent = schedDragging;
  // Auto-add empty row when last row has both columns filled
  const last = schedRows[schedRows.length - 1];
  if (last.thisTeam && last.opponent) schedRows.push({ thisTeam: null, opponent: null, count: 1 });
  schedDragging = null;
  renderSchedule();
}

export function schedSetCount(rowIdx, count) {
  if (schedRows[rowIdx]) schedRows[rowIdx].count = +count;
  renderSchedule();
}

export function schedSetIntraCount(val) {
  schedIntraCount = +val;
  renderSchedule();
}

export function schedRemoveRow(rowIdx) {
  schedRows.splice(rowIdx, 1);
  if (schedRows.length === 0) schedRows.push({ thisTeam: null, opponent: null, count: 1 });
  renderSchedule();
}

export function schedGenerate() {
  const validRows = schedRows.filter(r => r.thisTeam && r.opponent && r.count > 0);
  if (validRows.length === 0 && schedIntraCount <= 0) return;

  const schedule = [];

  // Intra-division games for all divisions
  if (schedIntraCount > 0) {
    const divMap = {};
    LEAGUE.teams.forEach(t => { if (!divMap[t.division]) divMap[t.division] = []; divMap[t.division].push(t); });
    for (const teams of Object.values(divMap)) {
      for (let i = 0; i < teams.length; i++)
        for (let j = 0; j < teams.length; j++) {
          if (i === j) continue;
          for (let k = 0; k < schedIntraCount; k++)
            schedule.push({ awayId: teams[i].id, homeId: teams[j].id, played: false, awayScore: null, homeScore: null });
        }
    }
  }

  for (const row of validRows) {
    const aTeams = LEAGUE.teams.filter(t => t.division === row.thisTeam);
    const bTeams = LEAGUE.teams.filter(t => t.division === row.opponent);
    if (row.thisTeam === row.opponent) {
      for (let i = 0; i < aTeams.length; i++)
        for (let j = 0; j < aTeams.length; j++) {
          if (i === j) continue;
          for (let k = 0; k < row.count; k++)
            schedule.push({ awayId: aTeams[i].id, homeId: aTeams[j].id, played: false, awayScore: null, homeScore: null });
        }
    } else {
      for (const a of aTeams) for (const b of bTeams)
        for (let k = 0; k < row.count; k++)
          schedule.push({ awayId: a.id, homeId: b.id, played: false, awayScore: null, homeScore: null });
      for (const b of bTeams) for (const a of aTeams)
        for (let k = 0; k < row.count; k++)
          schedule.push({ awayId: b.id, homeId: a.id, played: false, awayScore: null, homeScore: null });
    }
  }
  for (let i = schedule.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }
  const name = prompt('Name this schedule:', LEAGUE.scheduleName || `${LEAGUE.season} Season`);
  if (name === null) return;
  LEAGUE.schedule = schedule;
  LEAGUE.scheduleName = name.trim() || `${LEAGUE.season} Season`;
  if (!LEAGUE.savedSchedules) LEAGUE.savedSchedules = [];
  const entry = { name: LEAGUE.scheduleName, games: schedule.map(g => ({ ...g })) };
  const existingIdx = LEAGUE.savedSchedules.findIndex(s => s.name === LEAGUE.scheduleName);
  if (existingIdx >= 0) LEAGUE.savedSchedules[existingIdx] = entry;
  else LEAGUE.savedSchedules.push(entry);
  saveLeague();
  schedBuildMode = false;
  resetSchedState();
  renderSchedule();
}

export function schedClear() {
  resetSchedState();
  renderSchedule();
}

export function schedCancel() {
  schedBuildMode = false;
  schedShowLoad = false;
  resetSchedState();
  renderSchedule();
}

// ====================================================================
// LEAGUE NAME EDITING
// ====================================================================
export function editLeagueName() {
  const titleEl = document.getElementById('league-title');
  const original = LEAGUE.name;
  titleEl.innerHTML = `
    <input id="league-name-input" value="${original}"
      style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;border:none;border-bottom:2px solid var(--ink);background:transparent;outline:none;width:260px;padding:2px 0;"
      onkeydown="if(event.key==='Enter')saveLeagueName();if(event.key==='Escape')cancelLeagueName('${original}')">
    <button onclick="saveLeagueName()" style="margin-left:10px;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;padding:4px 10px;border:2px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;border-radius:2px;">Save</button>
    <button onclick="cancelLeagueName('${original}')" style="margin-left:6px;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;padding:4px 10px;border:2px solid #ccc;background:transparent;cursor:pointer;border-radius:2px;">Cancel</button>
  `;
  document.getElementById('league-name-input').focus();
  document.getElementById('league-name-input').select();
}

export function saveLeagueName() {
  const input = document.getElementById('league-name-input');
  if (!input) return;
  const newName = input.value.trim();
  if (newName) { LEAGUE.name = newName; saveLeague(); renderHome(); }
}

export function cancelLeagueName(original) {
  const titleEl = document.getElementById('league-title');
  if (titleEl) titleEl.textContent = original;
}

// ====================================================================
// PLAYOFFS
// ====================================================================
function getTeamWinPct(team) {
  return team.w / ((team.w + team.l) || 1);
}

function teamSeedCmp(a, b) {
  const pa = getTeamWinPct(a), pb = getTeamWinPct(b);
  if (pb !== pa) return pb - pa;
  if (b.w !== a.w) return b.w - a.w;
  return a.name.localeCompare(b.name);
}

function seedLeague(leagueName) {
  const teams = LEAGUE.teams.filter(t => t.league === leagueName);
  const divisions = [...new Set(teams.map(t => t.division))];
  // Division winners: best record per division, sorted by win%
  const divWinners = divisions.map(div => {
    const divTeams = teams.filter(t => t.division === div).sort(teamSeedCmp);
    return divTeams[0];
  }).filter(Boolean).sort(teamSeedCmp);
  // Wild cards: remaining teams sorted by win%
  const winnerIds = new Set(divWinners.map(t => t.id));
  const wildCards = teams.filter(t => !winnerIds.has(t.id)).sort(teamSeedCmp);
  // Seeds 1-3: division winners; 4-6: wild cards
  const seeds = [...divWinners.slice(0, 3), ...wildCards.slice(0, 3)];
  return seeds;
}

function buildBracket(alSeeds, nlSeeds) {
  const mkSeries = (id, round, league, seriesLength, higherSeedIdx, lowerSeedIdx, seeds, nextSeriesId, nextSeriesSlot) => ({
    id, round, league, seriesLength,
    higherSeedId: seeds[higherSeedIdx]?.id ?? null,
    higherSeed: higherSeedIdx + 1,
    lowerSeedId: seeds[lowerSeedIdx]?.id ?? null,
    lowerSeed: lowerSeedIdx + 1,
    higherSeedWins: 0, lowerSeedWins: 0,
    games: [], winner: null,
    nextSeriesId: nextSeriesId ?? null,
    nextSeriesSlot: nextSeriesSlot ?? null,
  });

  return [
    // AL Wild Card
    mkSeries('al-wc-a', 'wildCard', 'AL', 3, 2, 5, alSeeds, 'al-ds-c', 'lower'),
    mkSeries('al-wc-b', 'wildCard', 'AL', 3, 3, 4, alSeeds, 'al-ds-d', 'lower'),
    // AL Division Series
    mkSeries('al-ds-c', 'divSeries', 'AL', 5, 1, 0, alSeeds, 'al-cs', null),
    mkSeries('al-ds-d', 'divSeries', 'AL', 5, 0, 0, alSeeds, 'al-cs', null),
    // AL Championship
    { id:'al-cs', round:'champSeries', league:'AL', seriesLength:7, higherSeedId:null, higherSeed:null, lowerSeedId:null, lowerSeed:null, higherSeedWins:0, lowerSeedWins:0, games:[], winner:null, nextSeriesId:'ws', nextSeriesSlot:null },
    // NL Wild Card
    mkSeries('nl-wc-f', 'wildCard', 'NL', 3, 2, 5, nlSeeds, 'nl-ds-h', 'lower'),
    mkSeries('nl-wc-g', 'wildCard', 'NL', 3, 3, 4, nlSeeds, 'nl-ds-i', 'lower'),
    // NL Division Series
    mkSeries('nl-ds-h', 'divSeries', 'NL', 5, 1, 0, nlSeeds, 'nl-cs', null),
    mkSeries('nl-ds-i', 'divSeries', 'NL', 5, 0, 0, nlSeeds, 'nl-cs', null),
    // NL Championship
    { id:'nl-cs', round:'champSeries', league:'NL', seriesLength:7, higherSeedId:null, higherSeed:null, lowerSeedId:null, lowerSeed:null, higherSeedWins:0, lowerSeedWins:0, games:[], winner:null, nextSeriesId:'ws', nextSeriesSlot:null },
    // World Series
    { id:'ws', round:'worldSeries', league:'WS', seriesLength:7, higherSeedId:null, higherSeed:null, lowerSeedId:null, lowerSeed:null, higherSeedWins:0, lowerSeedWins:0, games:[], winner:null, nextSeriesId:null, nextSeriesSlot:null },
  ];
}

export function generatePlayoffs() {
  // Validate
  const alTeams = LEAGUE.teams.filter(t => t.league === 'American League');
  const nlTeams = LEAGUE.teams.filter(t => t.league === 'National League');
  const alValid = alTeams.filter(t => (t.w + t.l) > 0);
  const nlValid = nlTeams.filter(t => (t.w + t.l) > 0);
  if (alTeams.length < 6 || nlTeams.length < 6 || alValid.length < 6 || nlValid.length < 6) {
    alert('Need at least 6 teams per league with games played to start playoffs.');
    return;
  }
  const alSeeds = seedLeague('American League');
  const nlSeeds = seedLeague('National League');
  if (alSeeds.length < 6 || nlSeeds.length < 6) {
    alert('Could not determine 6 seeds per league. Check team league assignments.');
    return;
  }
  const series = buildBracket(alSeeds, nlSeeds);
  // Fix DS seeds: al-ds-c seed 2 vs WC-A winner; al-ds-d seed 1 vs WC-B winner
  const alDsC = series.find(s => s.id === 'al-ds-c');
  const alDsD = series.find(s => s.id === 'al-ds-d');
  const nlDsH = series.find(s => s.id === 'nl-ds-h');
  const nlDsI = series.find(s => s.id === 'nl-ds-i');
  // Seed 2 gets bye in DS vs WC winner
  alDsC.higherSeedId = alSeeds[1].id; alDsC.higherSeed = 2; alDsC.lowerSeedId = null;
  alDsD.higherSeedId = alSeeds[0].id; alDsD.higherSeed = 1; alDsD.lowerSeedId = null;
  nlDsH.higherSeedId = nlSeeds[1].id; nlDsH.higherSeed = 2; nlDsH.lowerSeedId = null;
  nlDsI.higherSeedId = nlSeeds[0].id; nlDsI.higherSeed = 1; nlDsI.lowerSeedId = null;

  const seedMap = {};
  alSeeds.forEach((t, i) => { seedMap[t.id] = i + 1; });
  nlSeeds.forEach((t, i) => { seedMap[t.id] = i + 1; });
  LEAGUE.playoffs = { active: true, round: 'wildCard', series, seedMap, activeSeriesIdx: null };
  saveLeague();
  renderPlayoffs();
}

export function renderPlayoffs() {
  const cont = document.getElementById('playoffs-container');
  const actions = document.getElementById('playoffs-topbar-actions');
  if (!cont) return;

  if (!LEAGUE.playoffs?.active) {
    renderPlayoffLanding(cont, actions);
  } else {
    renderPlayoffBracket(cont, actions);
  }
}

function renderPlayoffLanding(cont, actions) {
  if (actions) actions.innerHTML = `<button class="btn sm primary" onclick="generatePlayoffs()">Start Playoffs</button>`;

  const alTeams = LEAGUE.teams.filter(t => t.league === 'American League');
  const nlTeams = LEAGUE.teams.filter(t => t.league === 'National League');
  const alValid = alTeams.filter(t => (t.w + t.l) > 0).length >= 6;
  const nlValid = nlTeams.filter(t => (t.w + t.l) > 0).length >= 6;

  const mkSeedsHtml = (leagueName, label) => {
    const teams = LEAGUE.teams.filter(t => t.league === leagueName);
    if (teams.filter(t => (t.w + t.l) > 0).length < 6) {
      return `<div class="playoff-seeds-league"><div class="playoff-seeds-title">${label}</div><div style="font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--muted);padding:12px 0">Not enough games played.</div></div>`;
    }
    const seeds = seedLeague(leagueName);
    const rows = seeds.map((t, i) => {
      const tag = i < 3 ? 'DIV' : 'WC';
      const pct = getTeamWinPct(t).toFixed(3);
      return `<div class="playoff-seed-row">
        <span class="playoff-seed-num">${i + 1}</span>
        ${teamLogoHtml(t, 20)}
        <span style="flex:1;font-size:0.82rem">${t.name}</span>
        <span class="playoff-seed-tag">${tag}</span>
        <span class="playoff-seed-pct">${t.w}–${t.l}</span>
      </div>`;
    }).join('');
    return `<div class="playoff-seeds-league"><div class="playoff-seeds-title">${label}</div>${rows}</div>`;
  };

  cont.innerHTML = `
    <div class="section-title" style="margin-bottom:6px">Projected Postseason Seeds</div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted);margin-bottom:20px">Based on current standings. Seeds 1 & 2 receive first-round byes.</div>
    ${(!alValid || !nlValid) ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:12px 16px;font-family:'IBM Plex Mono',monospace;font-size:0.72rem;margin-bottom:20px">⚠️ Need at least 6 teams per league with games played to generate playoffs.</div>` : ''}
    <div class="playoff-seeds-preview">
      ${mkSeedsHtml('American League', 'American League')}
      ${mkSeedsHtml('National League', 'National League')}
    </div>
    <button class="btn primary" onclick="generatePlayoffs()"${(!alValid || !nlValid) ? ' disabled' : ''}>Generate Playoff Bracket →</button>
  `;
}

function seriesStatusText(s) {
  const winsNeeded = Math.ceil(s.seriesLength / 2);
  if (s.winner != null) {
    const wTeam = LEAGUE.teams.find(t => t.id === s.winner);
    const wName = wTeam ? wTeam.name.split(' ').slice(-1)[0] : '?';
    const hw = s.higherSeedId === s.winner ? s.higherSeedWins : s.lowerSeedWins;
    const lw = s.higherSeedId === s.winner ? s.lowerSeedWins : s.higherSeedWins;
    return `${wName} win ${hw}–${lw}`;
  }
  if (s.higherSeedId === null || s.lowerSeedId === null) return 'TBD';
  if (s.higherSeedWins === 0 && s.lowerSeedWins === 0) return `Best of ${s.seriesLength}`;
  if (s.higherSeedWins === s.lowerSeedWins) return `Tied ${s.higherSeedWins}–${s.lowerSeedWins}`;
  const leader = s.higherSeedWins > s.lowerSeedWins ? s.higherSeedId : s.lowerSeedId;
  const lTeam = LEAGUE.teams.find(t => t.id === leader);
  const lName = lTeam ? lTeam.name.split(' ').slice(-1)[0] : '?';
  const lw = Math.max(s.higherSeedWins, s.lowerSeedWins);
  const tw = Math.min(s.higherSeedWins, s.lowerSeedWins);
  return `${lName} lead ${lw}–${tw}`;
}

function mkSeriesBox(s, sIdx, playoffsObj) {
  const higherTeam = s.higherSeedId != null ? LEAGUE.teams.find(t => t.id === s.higherSeedId) : null;
  const lowerTeam  = s.lowerSeedId  != null ? LEAGUE.teams.find(t => t.id === s.lowerSeedId)  : null;
  const isComplete = s.winner != null;
  const isTBD = s.higherSeedId == null || s.lowerSeedId == null;
  const isPlaying = playoffsObj.activeSeriesIdx === sIdx && !isComplete;

  const mkTeamRow = (team, seed, wins, isWinner, isTbdSlot) => {
    if (isTbdSlot || !team) return `<div class="playoff-team-row"><span class="playoff-seed-badge"></span><span class="playoff-tbd">TBD</span><span class="playoff-wins-count">—</span></div>`;
    return `<div class="playoff-team-row${isComplete ? (isWinner ? ' winner' : ' loser') : ''}">
      <span class="playoff-seed-badge">${seed ?? '?'}</span>
      ${teamLogoHtml(team, 18)}
      <span class="playoff-team-name">${team.name}</span>
      <span class="playoff-wins-count">${wins}</span>
    </div>`;
  };

  const higherWin = s.winner != null && s.winner === s.higherSeedId;
  const lowerWin  = s.winner != null && s.winner === s.lowerSeedId;
  const teamRows = mkTeamRow(higherTeam, s.higherSeed, s.higherSeedWins, higherWin, s.higherSeedId == null) +
                   mkTeamRow(lowerTeam,  s.lowerSeed,  s.lowerSeedWins,  lowerWin,  s.lowerSeedId == null);

  const statusText = seriesStatusText(s);
  let btnsHtml = '';
  if (isPlaying) {
    btnsHtml = `<div class="playoff-playing-badge">▶ Playing now...</div>`;
  } else if (!isComplete && !isTBD) {
    btnsHtml = `<div class="playoff-series-btns">
      <button class="btn sm primary" onclick="playoffPlayNext(${sIdx})">Play Next Game</button>
      <button class="btn sm" onclick="playoffAutoSeries(${sIdx})">Auto Series</button>
    </div>`;
  }

  const classes = ['playoff-series-box', isComplete ? 'playoff-series-complete' : '', isPlaying ? 'playoff-playing-now' : ''].filter(Boolean).join(' ');
  const champClass = s.round === 'worldSeries' && isComplete ? ' champion' : '';
  return `<div class="${classes}">
    ${teamRows}
    <div class="playoff-series-record${champClass}">${isComplete && s.round === 'worldSeries' ? '🏆 ' : ''}${statusText}</div>
    ${btnsHtml}
  </div>`;
}

function mkByeBox(seed, team) {
  if (!team) return `<div class="playoff-bye-box"><span class="playoff-seed-badge">${seed}</span><span class="playoff-bye-team playoff-tbd">TBD</span><span class="playoff-bye-label">BYE</span></div>`;
  return `<div class="playoff-bye-box">
    <span class="playoff-seed-badge">${seed}</span>
    ${teamLogoHtml(team, 18)}
    <span class="playoff-bye-team">${team.name}</span>
    <span class="playoff-bye-label">BYE</span>
  </div>`;
}

function mkPlayoffGameLog(series) {
  const rounds = [
    { key:'wildCard',    label:'Wild Card' },
    { key:'divSeries',   label:'Division Series' },
    { key:'champSeries', label:'Championship Series' },
    { key:'worldSeries', label:'World Series' },
  ];
  let sections = '';
  for (const { key, label } of rounds) {
    const roundSeries = series.filter(s => s.round === key && s.games.length > 0);
    if (!roundSeries.length) continue;
    let rows = '';
    for (const s of roundSeries) {
      for (const g of s.games) {
        const away = LEAGUE.teams.find(t => t.id === g.awayId);
        const home = LEAGUE.teams.find(t => t.id === g.homeId);
        if (!away || !home) continue;
        const awayWon = g.awayScore > g.homeScore;
        rows += `<div class="sched-row played">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:0.6rem;color:var(--muted);flex-shrink:0;width:52px">Gm ${g.gameNum}</span>
          <span class="sched-team${awayWon ? ' sched-winner' : ''}">${teamLogoHtml(away, 18)} ${away.name}</span>
          <span class="sched-score">${g.awayScore} – ${g.homeScore}</span>
          <span class="sched-team${!awayWon ? ' sched-winner' : ''}">${teamLogoHtml(home, 18)} ${home.name}</span>
        </div>`;
      }
    }
    sections += `<div class="div-section-title" style="margin-top:18px">${label}</div><div class="sched-list">${rows}</div>`;
  }
  if (!sections) return '';
  return `<div style="margin-top:40px;max-width:700px">
    <div class="section-title" style="margin-bottom:4px">Playoff Game Log</div>
    ${sections}
  </div>`;
}

function renderPlayoffBracket(cont, actions) {
  const p = LEAGUE.playoffs;
  const series = p.series;

  // Topbar actions
  const allDone = series.every(s => s.winner);
  if (actions) {
    if (!allDone) {
      actions.innerHTML = `<button class="btn sm" onclick="playoffAutoAll()">Play All Games</button>
        <button class="btn sm danger" onclick="resetPlayoffs()">Reset</button>`;
    } else {
      actions.innerHTML = `<button class="btn sm danger" onclick="resetPlayoffs()">Reset</button>`;
    }
  }

  const findS = id => series.find(s => s.id === id);
  const sIdx  = id => series.findIndex(s => s.id === id);
  const roundPlayable = key => series.some(s => s.round === key && s.winner == null && s.higherSeedId != null && s.lowerSeedId != null);
  const roundLabel = (label, key) => `<div class="playoff-round-label">${label}${roundPlayable(key) ? `<button class="btn sm" style="margin-left:8px" onclick="playoffAutoRound('${key}')">Play Series</button>` : ''}</div>`;

  // AL seeds 1 & 2 for bye boxes
  const alWcA = findS('al-wc-a'); const alWcAIdx = sIdx('al-wc-a');
  const alWcB = findS('al-wc-b'); const alWcBIdx = sIdx('al-wc-b');
  const alDsC = findS('al-ds-c'); const alDsCIdx = sIdx('al-ds-c');
  const alDsD = findS('al-ds-d'); const alDsDIdx = sIdx('al-ds-d');
  const alCs  = findS('al-cs');   const alCsIdx  = sIdx('al-cs');
  const nlWcF = findS('nl-wc-f'); const nlWcFIdx = sIdx('nl-wc-f');
  const nlWcG = findS('nl-wc-g'); const nlWcGIdx = sIdx('nl-wc-g');
  const nlDsH = findS('nl-ds-h'); const nlDsHIdx = sIdx('nl-ds-h');
  const nlDsI = findS('nl-ds-i'); const nlDsIIdx = sIdx('nl-ds-i');
  const nlCs  = findS('nl-cs');   const nlCsIdx  = sIdx('nl-cs');
  const ws    = findS('ws');      const wsIdx    = sIdx('ws');

  const alSeed2Team = alDsC.higherSeedId ? LEAGUE.teams.find(t => t.id === alDsC.higherSeedId) : null;
  const alSeed1Team = alDsD.higherSeedId ? LEAGUE.teams.find(t => t.id === alDsD.higherSeedId) : null;
  const nlSeed2Team = nlDsH.higherSeedId ? LEAGUE.teams.find(t => t.id === nlDsH.higherSeedId) : null;
  const nlSeed1Team = nlDsI.higherSeedId ? LEAGUE.teams.find(t => t.id === nlDsI.higherSeedId) : null;

  const wsWinnerTeam = ws.winner != null ? LEAGUE.teams.find(t => t.id === ws.winner) : null;

  const leagueLabel = name => `<div style="font-family:'IBM Plex Mono',monospace;font-size:0.58rem;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${name}</div>`;
  cont.innerHTML = `
    <div class="playoffs-bracket">

      <div class="playoff-round-col">
        ${roundLabel('Wild Card', 'wildCard')}
        <div class="playoff-league-group">
          ${leagueLabel('American League')}
          <div class="playoff-pair">
            ${mkByeBox(2, alSeed2Team)}
            ${mkSeriesBox(alWcA, alWcAIdx, p)}
          </div>
          <div class="playoff-pair">
            ${mkByeBox(1, alSeed1Team)}
            ${mkSeriesBox(alWcB, alWcBIdx, p)}
          </div>
        </div>
        <div class="playoff-group-spacer"></div>
        <div class="playoff-league-group">
          ${leagueLabel('National League')}
          <div class="playoff-pair">
            ${mkByeBox(2, nlSeed2Team)}
            ${mkSeriesBox(nlWcF, nlWcFIdx, p)}
          </div>
          <div class="playoff-pair">
            ${mkByeBox(1, nlSeed1Team)}
            ${mkSeriesBox(nlWcG, nlWcGIdx, p)}
          </div>
        </div>
      </div>

      <div class="playoff-round-col">
        ${roundLabel('Division Series', 'divSeries')}
        <div class="playoff-league-group">
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(alDsC, alDsCIdx, p)}
          </div>
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(alDsD, alDsDIdx, p)}
          </div>
        </div>
        <div class="playoff-group-spacer"></div>
        <div class="playoff-league-group">
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(nlDsH, nlDsHIdx, p)}
          </div>
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(nlDsI, nlDsIIdx, p)}
          </div>
        </div>
      </div>

      <div class="playoff-round-col">
        ${roundLabel('Championship Series', 'champSeries')}
        <div class="playoff-league-group">
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(alCs, alCsIdx, p)}
          </div>
        </div>
        <div class="playoff-group-spacer"></div>
        <div class="playoff-league-group">
          <div class="playoff-pair" style="justify-content:center">
            ${mkSeriesBox(nlCs, nlCsIdx, p)}
          </div>
        </div>
      </div>

      <div class="playoff-round-col">
        ${roundLabel('World Series', 'worldSeries')}
        <div style="flex:1"></div>
        ${mkSeriesBox(ws, wsIdx, p)}
        ${wsWinnerTeam ? `<div style="margin-top:16px;text-align:center">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--gold);letter-spacing:3px">🏆 Champions</div>
          <div style="font-family:'Oswald',sans-serif;font-size:1.3rem;font-weight:700;margin-top:4px">${wsWinnerTeam.name}</div>
          <div style="margin-top:12px"><button class="btn sm" onclick="exportSeasonArchive(); schedRecycle('simulate')">Rinse, Repeat</button></div>
        </div>` : ''}
        <div style="flex:1"></div>
      </div>

    </div>
  `;
  cont.innerHTML += mkPlayoffGameLog(series);
}

export function resetPlayoffs() {
  if (!confirm('Reset playoffs? All playoff progress will be lost.')) return;
  LEAGUE.playoffs = null;
  saveLeague();
  renderPlayoffs();
}
