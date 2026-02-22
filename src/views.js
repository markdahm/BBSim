import { battingAvg, obpCalc, slgCalc } from './utils.js';
import { LEAGUE, saveLeague, allBatters, allPitchers } from './league.js';
import { renderSimulate } from './game.js';

// ====================================================================
// VIEW STATE
// ====================================================================
let currentTeamId = null;
let currentPlayer = null;
let playerFilter = 'ALL';
let sortCol = 'avg';
let sortDir = -1;
let tdDragSrc = null;

// ====================================================================
// NAVIGATION
// ====================================================================
const PAGES = ['home','teams','team-detail','players','simulate'];
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
  if (page === 'teams') renderTeams();
  if (page === 'players') renderPlayersTable();
  if (page === 'simulate') renderSimulate();
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
  const scEl = document.getElementById('league-stat-cards');
  scEl.innerHTML = `
    <div class="stat-card"><div class="sc-val">${LEAGUE.gamesPlayed}</div><div class="sc-lbl">Games Played</div></div>
    <div class="stat-card"><div class="sc-val">${topHR  ? topHR.career.hr            : '—'}</div><div class="sc-lbl">HR Leader · ${topHR  ? topHR.name  : '—'}</div></div>
    <div class="stat-card"><div class="sc-val">${topAVG ? battingAvg(topAVG).toFixed(3) : '—'}</div><div class="sc-lbl">AVG Leader · ${topAVG ? topAVG.name : '—'}</div></div>
    <div class="stat-card"><div class="sc-val">${topK   ? topK.career.k               : '—'}</div><div class="sc-lbl">K Leader · ${topK   ? topK.name   : '—'}</div></div>
  `;

  // Standings by division — grouped dynamically from LEAGUE.teams
  const cont = document.getElementById('standings-container');
  const divMap = new Map(); // divName → { league, teams[] }
  for (const t of LEAGUE.teams) {
    const key = t.division || '—';
    if (!divMap.has(key)) divMap.set(key, { league: t.league || '', teams: [] });
    divMap.get(key).teams.push(t);
  }
  // Group divisions by league to preserve AL/NL ordering
  const leagueOrder = ['American League', 'National League'];
  const leagueDivs = new Map();
  for (const [divName, { league }] of divMap) {
    if (!leagueDivs.has(league)) leagueDivs.set(league, []);
    leagueDivs.get(league).push(divName);
  }
  // Sort leagues by preferred order, then alphabetically
  const sortedLeagues = [...leagueDivs.keys()].sort((a, b) => {
    const ai = leagueOrder.indexOf(a), bi = leagueOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  let html = '<div class="division-grid">';
  for (const leagueName of sortedLeagues) {
    for (const divName of leagueDivs.get(leagueName).sort()) {
      const divTeams = divMap.get(divName).teams.sort((a,b) => (b.w - b.l) - (a.w - a.l));
      const leader = divTeams[0];
      html += `<div class="division-card">
        <div class="division-head">${divName}</div>
        <table class="standings-table">
          <thead><tr><th>Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th></tr></thead>
          <tbody>`;
      divTeams.forEach((t, i) => {
        const pct = (t.w + t.l) === 0 ? '.000' : (t.w / (t.w + t.l)).toFixed(3);
        const gb  = i === 0 ? '—' : (((leader.w - leader.l) - (t.w - t.l)) / 2).toFixed(1);
        html += `<tr onclick="openTeam(${t.id})"><td class="team-cell">${t.name}</td><td>${t.w}</td><td>${t.l}</td><td>${pct}</td><td class="gb-cell">${gb}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
  }
  html += '</div>';
  cont.innerHTML = html;
}

// ====================================================================
// TEAMS
// ====================================================================
export function renderTeams() {
  // Group teams dynamically by league then division
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
  let html = '';
  for (const leagueName of sortedLeagues) {
    html += `<div class="section-title" style="margin-top:${html ? '28px' : '0'}">${leagueName}</div>`;
    html += '<div class="teams-grid">';
    const divMap = leagueMap.get(leagueName);
    for (const divName of [...divMap.keys()].sort()) {
      divMap.get(divName).forEach(t => {
        const pct = (t.w + t.l) === 0 ? '—' : (t.w / (t.w + t.l)).toFixed(3);
        html += `<div class="team-card" onclick="openTeam(${t.id})">
          <div class="tc-color" style="background:${t.color}"></div>
          <div class="tc-league">${divName}</div>
          <div class="tc-name">${t.emoji} ${t.name}</div>
          <div class="tc-city" style="color:var(--muted);font-size:0.75rem">${t.league}</div>
          <div class="tc-stats"><span>W <b>${t.w}</b></span><span>L <b>${t.l}</b></span><span>PCT <b>${pct}</b></span></div>
        </div>`;
      });
    }
    html += '</div>';
  }
  document.getElementById('teams-container').innerHTML = html;
}

export function openTeam(id) {
  currentTeamId = id;
  nav('team-detail');
  renderTeamDetail();
}

export function renderTeamDetail() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  document.getElementById('td-title').textContent = `${t.emoji} ${t.name}`;
  document.getElementById('td-sub').textContent = `${t.division} · ${t.w}W ${t.l}L`;

  let html = `<div style="margin-bottom:18px;font-family:'IBM Plex Mono',monospace;font-size:0.7rem;color:var(--muted)">
    ${t.league} · ${t.division} · Season ${LEAGUE.season}
  </div>`;

  // Lineup editor placeholder (populated by renderLineupEditor after innerHTML is set)
  html += `<div class="section-title" style="margin-bottom:10px">Batting Lineup <span style="font-family:'IBM Plex Mono',monospace;font-size:0.48rem;color:#bbb;font-weight:400">drag to reorder · click to view card</span></div>
  <div class="lu-list" id="td-lineup-list" style="margin-bottom:28px"></div>`;

  // Pitchers
  html += `<div class="section-title" style="margin-bottom:10px">Pitching Staff</div>
  <table class="roster-table">
    <thead><tr><th>#</th><th>Name</th><th>Role</th><th>ERA</th><th>W</th><th>L</th><th>K</th><th>BB</th><th>IP</th><th>WHIP*</th></tr></thead>
    <tbody>`;
  t.pitchers.forEach((p, i) => {
    const whip = p.career.ip > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—';
    const era  = p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2);
    html += `<tr class="roster-row" onclick="openCard('${t.id}','${p.id}')">
      <td><span class="pos-badge">${p.num}</span></td>
      <td><b>${p.name}</b></td>
      <td><span class="pos-badge">${i === 0 ? 'SP' : 'RP'}</span> <span class="arch-badge">${p.arch}</span></td>
      <td>${era}</td><td>${p.career.w}</td><td>${p.career.l}</td>
      <td>${p.career.k}</td><td>${p.career.bb}</td>
      <td>${p.career.ip.toFixed(1)}</td><td>${whip}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('team-detail-container').innerHTML = html;
  renderLineupEditor(t);
}

function renderLineupEditor(t) {
  const container = document.getElementById('td-lineup-list');
  if (!container) return;
  container.innerHTML = '';
  let dragging = false;

  const mkDivider = label => {
    const d = document.createElement('div');
    d.style.cssText = 'font-family:"IBM Plex Mono",monospace;font-size:0.58rem;color:var(--muted);padding:8px 2px 3px;text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid var(--line);margin-top:4px;';
    d.textContent = label;
    return d;
  };

  const mkRow = (b, idx) => {
    const isLineup = idx < 9;
    const avg = battingAvg(b).toFixed(3);
    const row = document.createElement('div');
    row.className = 'lu-row';
    if (!isLineup) row.style.opacity = '0.55';
    row.draggable = true;
    row.innerHTML = `
      <span class="lu-num">${isLineup ? idx + 1 : '·'}</span>
      <div class="lu-nw">
        <div class="lu-pn">${b.name} <span class="lu-pos">${b.pos}</span> <span class="arch-badge">${b.arch}</span></div>
        <div class="lu-ps">#${b.num} · AVG ${avg} · HR ${b.career.hr} · RBI ${b.career.rbi}</div>
      </div>
      <span style="color:#ccc;font-size:0.8rem">⠿</span>`;

    row.addEventListener('dragstart', e => {
      tdDragSrc = idx; dragging = true;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); setTimeout(() => { dragging = false; }, 0); });
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault(); row.classList.remove('drag-over');
      if (tdDragSrc !== null && tdDragSrc !== idx) {
        const [mv] = t.batters.splice(tdDragSrc, 1);
        t.batters.splice(idx, 0, mv);
        saveLeague();
        renderLineupEditor(t);
      }
    });
    row.addEventListener('click', () => { if (!dragging) openCard(t.id, b.id); });
    return row;
  };

  const lineup = t.batters.slice(0, 9);
  const bench  = t.batters.slice(9);

  container.appendChild(mkDivider(`Starters — ${lineup.length}`));
  lineup.forEach((b, i) => container.appendChild(mkRow(b, i)));

  if (bench.length > 0) {
    container.appendChild(mkDivider(`Bench — ${bench.length}`));
    bench.forEach((b, i) => container.appendChild(mkRow(b, 9 + i)));
  }
}

export function editTeamName() {
  const t = LEAGUE.teams.find(t => t.id === currentTeamId);
  if (!t) return;
  const titleEl = document.getElementById('td-title');
  const original = titleEl.textContent;
  titleEl.innerHTML = `
    <input id="team-name-input" value="${t.name}"
      style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;border:none;border-bottom:2px solid var(--ink);background:transparent;outline:none;width:340px;padding:2px 0;"
      onkeydown="if(event.key==='Enter')saveTeamName();if(event.key==='Escape')cancelTeamName('${original}')">
    <button onclick="saveTeamName()" style="margin-left:10px;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;padding:4px 10px;border:2px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;border-radius:2px;">Save</button>
    <button onclick="cancelTeamName('${original}')" style="margin-left:6px;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;padding:4px 10px;border:2px solid #ccc;background:transparent;cursor:pointer;border-radius:2px;">Cancel</button>
  `;
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
    renderTeamDetail();
  }
}

export function cancelTeamName(original) {
  const titleEl = document.getElementById('td-title');
  if (titleEl) titleEl.textContent = original;
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

function renderCard(t, p) {
  const isBatter = p.type === 'batter';
  const card = document.getElementById('baseball-card');

  const avg = isBatter ? battingAvg(p).toFixed(3) : '—';
  const obp = isBatter ? obpCalc(p).toFixed(3) : '—';
  const slg = isBatter ? slgCalc(p).toFixed(3) : '—';
  const ops = isBatter ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : '—';

  // Seasons table rows
  let seasonsHtml = '';
  if (p.seasons && p.seasons.length > 0) {
    p.seasons.slice(-5).forEach(s => {
      if (isBatter) {
        const savg = s.ab > 0 ? (s.h / s.ab).toFixed(3) : '.000';
        seasonsHtml += `<tr><td>${s.year}</td><td>${s.pa || 0}</td><td>${savg}</td><td>${s.hr || 0}</td><td>${s.rbi || 0}</td><td>${s.r || 0}</td><td>${s.bb || 0}</td><td>${s.k || 0}</td></tr>`;
      } else {
        const sera = s.ip > 0 ? ((s.er / s.ip) * 9).toFixed(2) : '—';
        seasonsHtml += `<tr><td>${s.year}</td><td>${s.w || 0}-${s.l || 0}</td><td>${sera}</td><td>${(s.ip || 0).toFixed(1)}</td><td>${s.k || 0}</td><td>${s.bb || 0}</td></tr>`;
      }
    });
    // Career totals
    if (isBatter) {
      seasonsHtml += `<tr class="total-row"><td>Career</td><td>${p.career.pa}</td><td>${avg}</td><td>${p.career.hr}</td><td>${p.career.rbi}</td><td>${p.career.r}</td><td>${p.career.bb}</td><td>${p.career.k}</td></tr>`;
    } else {
      const cera = p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2);
      seasonsHtml += `<tr class="total-row"><td>Career</td><td>${p.career.w}-${p.career.l}</td><td>${cera}</td><td>${p.career.ip.toFixed(1)}</td><td>${p.career.k}</td><td>${p.career.bb}</td></tr>`;
    }
  } else {
    seasonsHtml = `<tr><td colspan="8" style="text-align:center;color:var(--muted);font-size:0.7rem;padding:10px">No games played yet. Simulate games to build stats.</td></tr>`;
  }

  // Ratings (0-100 scale)
  const ratings = isBatter ? [
    { l:'Contact', v: Math.round((1 - (p.kPct / 0.40)) * 100) },
    { l:'Power',   v: Math.round((p.hrPct / 0.08) * 100) },
    { l:'Patience',v: Math.round((p.bbPct / 0.18) * 100) },
    { l:'Speed',   v: Math.round((p.sbRate / 0.15) * 100) },
  ] : [
    { l:'Strikeout',v: Math.round((p.kPct / 0.35) * 100) },
    { l:'Control', v: Math.round((1 - (p.bbPct / 0.14)) * 100) },
    { l:'GB Rate', v: Math.round(((p.goD + 0.04) / 0.08) * 100) },
    { l:'Stuff',   v: Math.round(((6.0 - p.era) / 4.0) * 100) },
  ];

  const battingSeasonCols = `<th>Year</th><th>PA</th><th>AVG</th><th>HR</th><th>RBI</th><th>R</th><th>BB</th><th>K</th>`;
  const pitchSeasonCols   = `<th>Year</th><th>W-L</th><th>ERA</th><th>IP</th><th>K</th><th>BB</th>`;

  card.innerHTML = `
  <div class="card-left">
    <div class="card-year">${LEAGUE.season} · ${LEAGUE.name}</div>
    <div class="card-team-name">${t.emoji} ${t.name}</div>
    <div class="card-player-avatar">${p.emoji}</div>
    <div class="card-player-name">${p.name}</div>
    <div class="card-player-pos">${p.pos} · ${p.arch}</div>
    <div class="card-number">#${p.num}</div>
  </div>
  <div class="card-right">
    <div class="card-right-top">
      <input class="card-edit-name" value="${p.name}" onchange="updatePlayerName(this.value)" placeholder="Player name">
    </div>

    ${isBatter ? `
    <div>
      <div class="stats-section-title">Career Highlights</div>
      <div class="career-stats-grid">
        <div class="cs-box"><div class="cs-val">${avg}</div><div class="cs-lbl">AVG</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.hr}</div><div class="cs-lbl">HR</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.rbi}</div><div class="cs-lbl">RBI</div></div>
        <div class="cs-box"><div class="cs-val">${ops}</div><div class="cs-lbl">OPS</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.h}</div><div class="cs-lbl">Hits</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.sb}</div><div class="cs-lbl">SB</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.bb}</div><div class="cs-lbl">BB</div></div>
        <div class="cs-box"><div class="cs-val">${obp}</div><div class="cs-lbl">OBP</div></div>
      </div>
    </div>` : `
    <div>
      <div class="stats-section-title">Career Highlights</div>
      <div class="career-stats-grid">
        <div class="cs-box"><div class="cs-val">${p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2)}</div><div class="cs-lbl">ERA</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.w}</div><div class="cs-lbl">Wins</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.k}</div><div class="cs-lbl">K</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.ip.toFixed(0)}</div><div class="cs-lbl">IP</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.bb}</div><div class="cs-lbl">BB</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.l}</div><div class="cs-lbl">Losses</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.ip > 0 ? ((p.career.bb + p.career.h) / p.career.ip).toFixed(2) : '—'}</div><div class="cs-lbl">WHIP</div></div>
        <div class="cs-box"><div class="cs-val">${p.career.ip > 0 ? ((p.career.k / p.career.ip) * 9).toFixed(1) : '—'}</div><div class="cs-lbl">K/9</div></div>
      </div>
    </div>`}

    <div class="season-log">
      <div class="stats-section-title">Season Log</div>
      <table class="season-log-table">
        <thead><tr>${isBatter ? battingSeasonCols : pitchSeasonCols}</tr></thead>
        <tbody>${seasonsHtml}</tbody>
      </table>
    </div>

    <div>
      <div class="stats-section-title">Scouting Report</div>
      <div class="rating-grid">
        ${ratings.map(r => `
        <div class="rating-row">
          <div class="rating-label">${r.l}</div>
          <div class="rating-bar-bg"><div class="rating-bar-fill" style="width:${Math.max(5, Math.min(100, r.v))}%"></div></div>
          <div class="rating-val">${Math.max(0, Math.min(99, r.v))}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

export function updatePlayerName(name) {
  if (!currentPlayer || !name.trim()) return;
  currentPlayer.player.name = name.trim();
  const pn = document.querySelector('.card-player-name');
  if (pn) pn.textContent = name.trim();
  saveLeague();
  renderTeamDetail();
}

export function closeCard(e) {
  if (e.target === document.getElementById('card-overlay')) closeCardDirect();
}
export function closeCardDirect() {
  document.getElementById('card-overlay').classList.remove('open');
  currentPlayer = null;
}

// ====================================================================
// PLAYERS TABLE (league-wide)
// ====================================================================
export function setFilter(f, el) {
  playerFilter = f;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderPlayersTable();
}

export function renderPlayersTable() {
  const search = (document.getElementById('player-search')?.value || '').toLowerCase();
  let players = [];
  if (playerFilter !== 'PIT') {
    allBatters().forEach(b => { if (!search || b.name.toLowerCase().includes(search) || b.teamName.toLowerCase().includes(search)) players.push(b); });
  }
  if (playerFilter !== 'BAT') {
    allPitchers().forEach(p => { if (!search || p.name.toLowerCase().includes(search) || p.teamName.toLowerCase().includes(search)) players.push(p); });
  }

  // Sort
  players.sort((a, b) => {
    let av = 0, bv = 0;
    if      (sortCol === 'avg') { av = battingAvg(a); bv = battingAvg(b); }
    else if (sortCol === 'hr')  { av = a.career.hr; bv = b.career.hr; }
    else if (sortCol === 'rbi') { av = a.career.rbi; bv = b.career.rbi; }
    else if (sortCol === 'k')   { av = a.career.k; bv = b.career.k; }
    else if (sortCol === 'era') { av = a.career?.ip > 0 ? (a.career.er / a.career.ip) * 9 : a.era || 99; bv = b.career?.ip > 0 ? (b.career.er / b.career.ip) * 9 : b.era || 99; }
    else if (sortCol === 'pa')  { av = a.career.pa || 0; bv = b.career.pa || 0; }
    return (av - bv) * sortDir;
  });

  // Header
  const thead = document.getElementById('players-thead');
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
  `;
  thead.querySelectorAll('th').forEach(th => {
    if (th.textContent.toLowerCase().includes(sortCol)) {
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });

  const tbody = document.getElementById('players-tbody');
  if (players.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No players found.</td></tr>';
    return;
  }

  tbody.innerHTML = players.slice(0, 100).map(p => {
    const avg = p.type === 'batter'  ? battingAvg(p).toFixed(3) : '—';
    const era = p.type === 'pitcher' ? (p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2)) : '—';
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
    </tr>`;
  }).join('');
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
export function advanceSeason() {
  if (!confirm(`Advance to ${LEAGUE.season + 1} season? Current season stats will be archived.`)) return;
  LEAGUE.teams.forEach(t => {
    [...t.batters, ...t.pitchers].forEach(p => {
      if (p.type === 'batter') {
        const g = p.career;
        if (g.pa > 0) p.seasons.push({ year:LEAGUE.season, pa:g.pa, ab:g.ab, h:g.h, hr:g.hr, rbi:g.rbi, r:g.r, bb:g.bb, k:g.k, doubles:g.doubles, triples:g.triples });
        p.career = { pa:0, ab:0, h:0, hr:0, rbi:0, r:0, bb:0, k:0, sb:0, cs:0, doubles:0, triples:0 };
      } else {
        const g = p.career;
        if (g.ip > 0) p.seasons.push({ year:LEAGUE.season, g:g.g, ip:g.ip, h:g.h, er:g.er, bb:g.bb, k:g.k, w:g.w, l:g.l });
        p.career = { g:0, ip:0, h:0, er:0, bb:0, k:0, w:0, l:0, sv:0 };
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
