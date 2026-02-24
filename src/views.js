import { battingAvg, obpCalc, slgCalc, teamLogoHtml, cl } from './utils.js';
import { LEAGUE, saveLeague, allBatters, allPitchers } from './league.js';
import { MLB } from './data.js';
import { renderSimulate } from './game.js';

// ====================================================================
// VIEW STATE
// ====================================================================
let currentTeamId = null;
let currentPlayer = null;
let playerFilter = 'ALL';
let playerTeamFilter = '';
let sortCol = 'avg';
let sortDir = -1;
let schedBuildMode = false;
let schedShowLoad = false;
let schedTeamFilter = '';
let schedMode = 'intra';          // 'intra' | 'outside'
let schedIntraCounts = new Map(); // divName → intra-series count
let schedCrossCounts = new Map(); // 'divA::divB' (sorted) → cross-series count
let schedOutsideFirst = null;     // first-selected div in outside mode

// ====================================================================
// NAVIGATION
// ====================================================================
const PAGES = ['home','players','simulate','schedule'];
export function nav(page) {
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
}

// ====================================================================
// LEAGUE HOME
// ====================================================================
export function renderHome() {
  document.getElementById('league-title').textContent = LEAGUE.name;
  document.getElementById('league-sub').textContent = `${LEAGUE.season} Season · 30 Teams`;
  document.getElementById('season-display').textContent = LEAGUE.season;

  // Stat cards
  const topHR  = allBatters().sort((a,b) => b.career.hr - a.career.hr)[0];
  const topAVG = allBatters().filter(p => p.career.ab > 50).sort((a,b) => battingAvg(b) - battingAvg(a))[0];
  const topK   = allPitchers().sort((a,b) => b.career.k - a.career.k)[0];
  const playerTeam = p => p ? (LEAGUE.teams.find(t => t.batters.includes(p) || t.pitchers.includes(p))?.name ?? '') : '';
  const scEl = document.getElementById('league-stat-cards');
  scEl.innerHTML = `
    <div class="stat-card"><div class="sc-val">${LEAGUE.gamesPlayed}</div><div class="sc-lbl">Games Played</div></div>
    <div class="stat-card"><div class="sc-val">${topHR  ? topHR.career.hr            : '—'}</div><div class="sc-lbl">HR Leader · ${topHR  ? topHR.name  : '—'}<br><span style="font-weight:400;opacity:0.7">${playerTeam(topHR)}</span></div></div>
    <div class="stat-card"><div class="sc-val">${topAVG ? battingAvg(topAVG).toFixed(3) : '—'}</div><div class="sc-lbl">AVG Leader · ${topAVG ? topAVG.name : '—'}<br><span style="font-weight:400;opacity:0.7">${playerTeam(topAVG)}</span></div></div>
    <div class="stat-card"><div class="sc-val">${topK   ? topK.career.k               : '—'}</div><div class="sc-lbl">K Leader · ${topK   ? topK.name   : '—'}<br><span style="font-weight:400;opacity:0.7">${playerTeam(topK)}</span></div></div>
  `;

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
      const pct = (t.w + t.l) === 0 ? '.000' : (t.w / (t.w + t.l)).toFixed(3);
      const gb  = i === 0 ? '—' : (((leader.w - leader.l) - (t.w - t.l)) / 2).toFixed(1);
      rows += `<tr onclick="openTeam(${t.id})"><td class="team-cell">${teamLogoHtml(t, 30)} ${t.name}</td><td>${t.w}</td><td>${t.l}</td><td>${pct}</td><td class="gb-cell">${gb}</td></tr>`;
    });
    return `<div class="division-card">
      <div class="division-head">${divName}</div>
      <table class="standings-table">
        <thead><tr><th>Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  const cols = sortedLeagues.map(leagueName => {
    const divs = divisionOrder[leagueName] || leagueDivs.get(leagueName).sort();
    return `<div style="display:flex;flex-direction:column;gap:20px">
      <div class="section-title">${leagueName}</div>
      ${divs.map(mkDivCard).join('')}
    </div>`;
  });

  cont.innerHTML = cols.length === 2
    ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">${cols.join('')}</div>`
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
    titleEl.innerHTML = `${logoClick} <span id="roster-team-name" onclick="editTeamName()" title="Click to rename" style="cursor:pointer;border-bottom:1px dashed transparent;transition:border-color 0.15s" onmouseover="this.style.borderBottomColor='var(--ink)'" onmouseout="this.style.borderBottomColor='transparent'">${t.name}</span>`;
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

  const hintHtml = unsorted ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.48rem;color:#bbb;margin-left:8px">drag to reorder</span>` : '';
  const container = document.getElementById('roster-table-body');
  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="players-table" style="font-size:0.72rem;min-width:1000px">
        <thead><tr>
          <th>#</th>
          <th style="text-align:left">Player</th>
          <th style="text-align:left">Pos${hintHtml}</th>
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
      <td>${p.career.sv||0}</td><td>${p.career.svo||0}</td>
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

  const hintHtml = unsorted ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.48rem;color:#bbb;margin-left:8px">drag to reorder</span>` : '';
  const container = document.getElementById('roster-table-body');
  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="players-table" style="font-size:0.72rem;min-width:1000px">
        <thead><tr>
          <th style="text-align:left">Player</th>
          <th style="text-align:left">Role${hintHtml}</th>
          ${th('era','ERA')}${th('w','W')}${th('l','L')}${th('whip','WHIP')}
          ${th('g','G')}${th('gs','GS')}${th('cg','CG')}${th('sho','SHO')}
          ${th('ip','IP')}${th('k','K')}${th('bb','BB')}${th('sv','SV')}${th('svo','SVO')}
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
    const pr = norm({ k, go, fo:p.foPct, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single:p.singlePct, dbl:p.doublePct, triple:p.triplePct, hr:p.hrPct });
    const BB=Math.round(pr.walk*PA), HBP=Math.round(pr.hbp*PA), K=Math.round(pr.k*PA);
    const AB=PA-BB-HBP;
    const H1=Math.round(pr.single*PA), H2=Math.round(pr.dbl*PA), H3=Math.round(pr.triple*PA), HR=Math.round(pr.hr*PA);
    const H=H1+H2+H3+HR, TB=H1+2*H2+3*H3+4*HR;
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
    { l:'Power',   v: Math.round((p.hrPct / 0.112) * 100) },
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
    <div class="card-team-name">${t.emoji} ${t.name}</div>
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
        <table class="season-log-table" style="min-width:680px">
          <thead><tr>
            <th>ERA</th><th>W</th><th>L</th><th>WHIP</th>
            <th>G</th><th>GS</th><th>CG</th><th>SHO</th>
            <th>IP</th><th>K</th><th>BB</th><th>SV</th>
            <th>H</th><th>R</th><th>ER</th><th>HR</th>
            <th>HBP</th><th>SVO</th><th>K/9</th><th>BAA</th>
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
            <td>${p.career.sv || 0}</td>
            <td>${p.career.h || 0}</td>
            <td>${p.career.r || 0}</td>
            <td>${p.career.er || 0}</td>
            <td>${p.career.hr || 0}</td>
            <td>${p.career.hbp || 0}</td>
            <td>${p.career.svo || 0}</td>
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
    if (label === 'Contact')  p.kPct   = cl((1 - v/100) * 0.40, 0.10, 0.40);
    if (label === 'Power')    p.hrPct  = cl((v/100) * 0.112, 0.005, 0.112);
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

export function renderPlayersTable() {
  const search = (document.getElementById('player-search')?.value || '').toLowerCase();
  const tf = playerTeamFilter.toLowerCase();
  const matchesTeam = p => !tf || p.teamName.toLowerCase() === tf;

  // Team filter dropdown
  const tfBar = document.getElementById('team-filter-bar');
  if (tfBar) {
    const teamNames = [...new Set(LEAGUE.teams.map(t => t.name))].sort();
    tfBar.innerHTML = `<label style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted);margin-right:8px">Filter by team:</label>
      <select class="sched-team-filter" onchange="setTeamFilter(this.value)">
        <option value="">All Teams</option>
        ${teamNames.map(n => `<option value="${n}"${playerTeamFilter === n ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
      ${playerTeamFilter ? ` <button class="btn sm" style="margin-left:6px" onclick="setTeamFilter('')">✕ Clear</button>` : ''}`;
  }
  let players = [];
  if (playerFilter !== 'PIT') {
    allBatters().forEach(b => { if (matchesTeam(b) && (!search || b.name.toLowerCase().includes(search) || b.teamName.toLowerCase().includes(search))) players.push(b); });
  }
  if (playerFilter !== 'BAT') {
    allPitchers().forEach(p => { if (matchesTeam(p) && (!search || p.name.toLowerCase().includes(search) || p.teamName.toLowerCase().includes(search))) players.push(p); });
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
      <th onclick="doSort('name')" style="text-align:left">Player</th>
      <th onclick="doSort('team')" style="text-align:left">Team</th>
      <th style="text-align:left">Pos</th>
      <th onclick="doSort('pw')">W</th>
      <th onclick="doSort('pl')">L</th>
      <th onclick="doSort('era')">ERA</th>
      <th onclick="doSort('pgs')">GS</th>
      <th onclick="doSort('pg')">G</th>
      <th onclick="doSort('pcg')">CG</th>
      <th onclick="doSort('psho')">SHO</th>
      <th onclick="doSort('psv')">SV</th>
      <th onclick="doSort('psvo')">SVO</th>
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
      <th onclick="doSort('name')" style="text-align:left">Player</th>
      <th onclick="doSort('team')" style="text-align:left">Team</th>
      <th style="text-align:left">Pos</th>
      <th onclick="doSort('pa')">PA</th>
      <th onclick="doSort('avg')">AVG</th>
      <th onclick="doSort('hr')">HR</th>
      <th onclick="doSort('rbi')">RBI</th>
      <th onclick="doSort('k')">K</th>
      <th onclick="doSort('era')">ERA</th>
      <th onclick="doSort('whip')">WHIP</th>
    `;
  }
  thead.querySelectorAll('th').forEach(th => {
    if (th.getAttribute('onclick')?.includes(sortCol)) {
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });

  const tbody = document.getElementById('players-tbody');
  const colCount = isPitView ? 22 : 10;
  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state">No players found.</td></tr>`;
    return;
  }

  if (isPitView) {
    tbody.innerHTML = players.filter(p => p.type === 'pitcher').map(p => {
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
        <td>${p.career.sv || 0}</td>
        <td>${p.career.svo || 0}</td>
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
        <td>${p.career.hr || 0}</td>
        <td>${p.career.rbi || 0}</td>
        <td>${p.career.k || 0}</td>
        <td>${era}</td>
        <td>${whip}</td>
      </tr>`;
    }).join('');
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
  const teamNames = [...new Set(LEAGUE.teams.map(t => t.name))].sort();
  html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
    <label style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted)">Filter by team:</label>
    <select class="sched-team-filter" onchange="schedSetTeamFilter(this.value)">
      <option value="">All Teams</option>
      ${teamNames.map(n => `<option value="${n}"${schedTeamFilter === n ? ' selected' : ''}>${n}</option>`).join('')}
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

function crossKey(a, b) { return [a, b].sort().join('::'); }

function schedGameCount(teams) {
  let total = 0;
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i === j) continue;
      const dA = teams[i].division, dB = teams[j].division;
      total += dA === dB
        ? (schedIntraCounts.get(dA) || 0)
        : (schedCrossCounts.get(crossKey(dA, dB)) || 0);
    }
  }
  return total;
}

function schedPreviewLines(teams) {
  const lines = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i === j) continue;
      const dA = teams[i].division, dB = teams[j].division;
      const count = dA === dB
        ? (schedIntraCounts.get(dA) || 0)
        : (schedCrossCounts.get(crossKey(dA, dB)) || 0);
      if (count > 0)
        lines.push(`${teams[i].name}  @  ${teams[j].name}${count > 1 ? `  ×${count}` : ''}`);
    }
  }
  return lines;
}

function renderScheduleBuildMode(cont) {
  const { leagueMap, sortedLeagues } = buildLeagueMap();

  // All teams that participate in any game
  const activeDivs = new Set([
    ...[...schedIntraCounts.entries()].filter(([,n]) => n > 0).map(([d]) => d),
    ...[...schedCrossCounts.entries()].filter(([,n]) => n > 0).flatMap(([k]) => k.split('::')),
  ]);
  const selectedTeams = LEAGUE.teams.filter(t => activeDivs.has(t.division));
  const totalGames = schedGameCount(selectedTeams);

  // Hint text
  const hint = schedMode === 'intra'
    ? 'Each press adds one home-and-away series within that division.'
    : schedOutsideFirst
      ? `<b>${schedOutsideFirst}</b> selected — click another division to schedule cross-division games, or click it again to cancel.`
      : 'Click a division to select it, then click another to add cross-division games.';

  let html = `
  <div class="sched-mode-bar">
    <button class="sched-mode-btn${schedMode === 'intra' ? ' active' : ''}" onclick="schedSetMode('intra')">Intra Division</button>
    <button class="sched-mode-btn${schedMode === 'outside' ? ' active' : ''}" onclick="schedSetMode('outside')">Outside Division</button>
  </div>
  <div style="font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted);margin-bottom:14px;line-height:1.7">${hint}</div>
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px">
    <button class="btn sm primary" onclick="schedGenerate()"${totalGames === 0 ? ' disabled' : ''}>Save Schedule</button>
    <button class="btn sm" onclick="schedClear()"${totalGames === 0 ? ' disabled' : ''}>Clear Schedule</button>
    <button class="btn sm" onclick="schedCancel()">Cancel</button>
    <span style="font-family:'IBM Plex Mono',monospace;font-size:0.72rem;color:var(--muted)">
      ${selectedTeams.length} team${selectedTeams.length !== 1 ? 's' : ''} &nbsp;·&nbsp; <b>${totalGames}</b> game${totalGames !== 1 ? 's' : ''}
    </span>
  </div>`;

  for (const leagueName of sortedLeagues) {
    html += `<div class="section-title" style="margin-bottom:8px">${leagueName}</div><div class="div-toggle-row">`;
    const divMap = leagueMap.get(leagueName);
    for (const divName of [...divMap.keys()].sort()) {
      const teamCount = divMap.get(divName).length;

      let badge, extraClass = '', clickFn;
      if (schedMode === 'intra') {
        const n = schedIntraCounts.get(divName) || 0;
        badge = n > 0 ? `<span class="div-btn-count">×${n}</span>` : `<span class="div-btn-count dim">${teamCount}</span>`;
        clickFn = `schedClickDiv('${divName}')`;
      } else {
        const isFirst = schedOutsideFirst === divName;
        // Count cross series involving this division
        let cx = 0;
        for (const [key, n] of schedCrossCounts) { if (key.split('::').includes(divName)) cx += n; }
        extraClass = isFirst ? ' first-sel' : '';
        badge = isFirst
          ? `<span class="div-btn-count first">1st</span>`
          : cx > 0
            ? `<span class="div-btn-count">×${cx}</span>`
            : `<span class="div-btn-count dim">${teamCount}</span>`;
        clickFn = `schedClickOutside('${divName}')`;
      }
      html += `<button class="div-toggle-btn${extraClass}" onclick="${clickFn}">${divName} ${badge}</button>`;
    }
    html += '</div>';
  }

  const lines = schedPreviewLines(selectedTeams);
  if (lines.length > 0) {
    html += `<div class="section-title" style="margin-top:24px;margin-bottom:8px">Game Preview</div>
    <textarea class="sched-preview" readonly>${lines.join('\n')}</textarea>`;
  }

  cont.innerHTML = html;
}

function resetSchedState() {
  schedMode = 'intra';
  schedIntraCounts = new Map();
  schedCrossCounts = new Map();
  schedOutsideFirst = null;
}

export function schedDeleteAll() {
  if (!confirm('Clear the entire schedule?')) return;
  LEAGUE.schedule = [];
  saveLeague();
  renderSchedule();
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

export function schedSetMode(mode) {
  schedMode = mode;
  schedOutsideFirst = null;
  renderSchedule();
}

export function schedClickDiv(divName) {
  schedIntraCounts.set(divName, (schedIntraCounts.get(divName) || 0) + 1);
  renderSchedule();
}

export function schedClickOutside(divName) {
  if (schedOutsideFirst === null) {
    schedOutsideFirst = divName;
  } else if (schedOutsideFirst === divName) {
    schedOutsideFirst = null; // clicking highlighted div de-selects
  } else {
    const key = crossKey(schedOutsideFirst, divName);
    schedCrossCounts.set(key, (schedCrossCounts.get(key) || 0) + 1);
    schedOutsideFirst = null;
  }
  renderSchedule();
}

export function schedGenerate() {
  const activeDivs = new Set([
    ...[...schedIntraCounts.entries()].filter(([,n]) => n > 0).map(([d]) => d),
    ...[...schedCrossCounts.entries()].filter(([,n]) => n > 0).flatMap(([k]) => k.split('::')),
  ]);
  const selectedTeams = LEAGUE.teams.filter(t => activeDivs.has(t.division));
  if (selectedTeams.length < 2) return;

  const schedule = [];
  for (let i = 0; i < selectedTeams.length; i++) {
    for (let j = 0; j < selectedTeams.length; j++) {
      if (i === j) continue;
      const dA = selectedTeams[i].division, dB = selectedTeams[j].division;
      const count = dA === dB
        ? (schedIntraCounts.get(dA) || 0)
        : (schedCrossCounts.get(crossKey(dA, dB)) || 0);
      for (let k = 0; k < count; k++)
        schedule.push({ awayId: selectedTeams[i].id, homeId: selectedTeams[j].id, played: false, awayScore: null, homeScore: null });
    }
  }
  for (let i = schedule.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }
  const name = prompt('Name this schedule:', LEAGUE.scheduleName || `${LEAGUE.season} Season`);
  if (name === null) return; // cancelled — don't save
  LEAGUE.schedule = schedule;
  LEAGUE.scheduleName = name.trim() || `${LEAGUE.season} Season`;
  // Save to library (update existing entry by name, or add new)
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
