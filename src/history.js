import { LEAGUE } from './league.js';

// ====================================================================
// HISTORY STATE
// ====================================================================
let historySeasons = [];   // [{ filename, data, fileHandle? }]
let dirHandle = null;      // FileSystemDirectoryHandle if loaded via folder picker
let sortCol = 'season';
let sortDir = -1;          // -1 = desc (newest first)

// Season viewer navigation state
let seasonViewerList = []; // original historySeasons indices in current sort order
let seasonViewerPos  = 0;

// Cross-season scores: keyed by `${historySeasons index}_${teamId}`
let _crossSeasonScores = {};

// ====================================================================
// SEASON SCORE  (0–100, z-score composite across ALL loaded seasons)
// ====================================================================
// Scores are keyed by `${historySeasons index}_${teamId}` so teams from
// different seasons are compared on a single cross-archive scale.
function _recomputeCrossSeasonScores() {
  const cfg = [
    { k: 'winPct',  w: 0.30, hi: true  },
    { k: 'runDiff', w: 0.20, hi: true  },
    { k: 'era',     w: 0.20, hi: false },
    { k: 'whip',    w: 0.15, hi: false },
    { k: 'avg',     w: 0.10, hi: true  },
    { k: 'hr',      w: 0.05, hi: true  },
  ];

  // Pool every team from every loaded season
  const raw = [];
  historySeasons.forEach((entry, hsIdx) => {
    const teams = entry.data.teams;
    if (!Array.isArray(teams)) return;
    teams.forEach(t => {
      const totalHR = t.batters.reduce((s, b) => s + (b.career.hr || 0), 0);
      const totalH  = t.batters.reduce((s, b) => s + (b.career.h  || 0), 0);
      const totalAB = t.batters.reduce((s, b) => s + (b.career.ab || 0), 0);
      const totalIP = t.pitchers.reduce((s, p) => s + (p.career.ip || 0), 0);
      const totalER = t.pitchers.reduce((s, p) => s + (p.career.er || 0), 0);
      const totalBB = t.pitchers.reduce((s, p) => s + (p.career.bb || 0), 0);
      const totalHA = t.pitchers.reduce((s, p) => s + (p.career.h  || 0), 0);
      const games   = (t.w || 0) + (t.l || 0);
      raw.push({
        key:     `${hsIdx}_${t.id}`,
        winPct:  games > 0 ? t.w / games : 0.5,
        runDiff: games > 0 ? ((t.runsFor || 0) - (t.runsAgainst || 0)) / games : 0,
        era:     totalIP > 0 ? (totalER / totalIP) * 9 : 4.50,
        whip:    totalIP > 0 ? (totalBB + totalHA) / totalIP : 1.30,
        avg:     totalAB > 0 ? totalH / totalAB : 0.250,
        hr:      games > 0 ? totalHR / games : 0,
      });
    });
  });

  if (raw.length < 2) {
    _crossSeasonScores = {};
    raw.forEach(r => { _crossSeasonScores[r.key] = 50; });
    return;
  }

  const dist = {};
  for (const { k } of cfg) {
    const vals = raw.map(r => r[k]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd   = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1e-9;
    dist[k] = { mean, sd };
  }

  const composites = raw.map(r => {
    const z = cfg.reduce((sum, { k, w, hi }) => {
      const zk = (r[k] - dist[k].mean) / dist[k].sd;
      return sum + w * (hi ? zk : -zk);
    }, 0);
    return { key: r.key, z };
  });

  const zVals = composites.map(c => c.z);
  const zMin  = Math.min(...zVals), zMax = Math.max(...zVals);
  const range = zMax - zMin || 1;
  _crossSeasonScores = {};
  composites.forEach(c => {
    _crossSeasonScores[c.key] = Math.round(((c.z - zMin) / range) * 100);
  });
}

function scoreColor(s) {
  if (s >= 80) return '#16a34a';   // green
  if (s >= 60) return '#2563eb';   // blue
  if (s >= 40) return '#78716c';   // neutral
  if (s >= 20) return '#d97706';   // amber
  return '#dc2626';                // red
}

// ====================================================================
// ARCHIVE BUILDER
// ====================================================================
export function buildSeasonArchive() {
  const playoffs = LEAGUE.playoffs;
  let champion = null, runnerUp = null;

  if (playoffs && playoffs.round === 'complete') {
    const ws = playoffs.series.find(s => s.round === 'worldSeries');
    if (ws && ws.winner != null) {
      const champId = ws.winner;
      const ruId = ws.higherSeedId === champId ? ws.lowerSeedId : ws.higherSeedId;

      const countPlayoffWins = teamId =>
        playoffs.series.reduce((total, s) => {
          if (s.winner == null) return total;
          const wins = s.higherSeedId === teamId ? s.higherSeedWins : s.lowerSeedWins;
          const played = s.higherSeedId === teamId || s.lowerSeedId === teamId;
          return played ? total + wins : total;
        }, 0);

      const countPlayoffLosses = teamId =>
        playoffs.series.reduce((total, s) => {
          const played = s.higherSeedId === teamId || s.lowerSeedId === teamId;
          if (!played) return total;
          const losses = s.higherSeedId === teamId ? s.lowerSeedWins : s.higherSeedWins;
          return total + losses;
        }, 0);

      const countPlayoffRuns = (teamId, forTeam) =>
        playoffs.series.reduce((total, s) => {
          return total + (s.games || []).reduce((gs, g) => {
            if (g.homeId === teamId) return gs + (forTeam ? (g.homeScore || 0) : (g.awayScore || 0));
            if (g.awayId  === teamId) return gs + (forTeam ? (g.awayScore || 0) : (g.homeScore || 0));
            return gs;
          }, 0);
        }, 0);

      const buildTeamStats = teamId => {
        const team = LEAGUE.teams.find(t => t.id === teamId);
        if (!team) return null;
        const totalHR  = team.batters.reduce((s, b) => s + (b.career.hr || 0), 0);
        const totalH   = team.batters.reduce((s, b) => s + (b.career.h  || 0), 0);
        const totalAB  = team.batters.reduce((s, b) => s + (b.career.ab || 0), 0);
        const totalIP  = team.pitchers.reduce((s, p) => s + (p.career.ip || 0), 0);
        const totalER  = team.pitchers.reduce((s, p) => s + (p.career.er || 0), 0);
        const totalBB  = team.pitchers.reduce((s, p) => s + (p.career.bb || 0), 0);
        const totalHA  = team.pitchers.reduce((s, p) => s + (p.career.h  || 0), 0);
        return {
          teamId,
          teamName: team.name,
          city: team.city,
          nickname: team.nickname,
          color: team.color || '#111',
          seasonW: team.w || 0,
          seasonL: team.l || 0,
          seasonRunsFor: team.runsFor || 0,
          seasonRunsAgainst: team.runsAgainst || 0,
          playoffWins: countPlayoffWins(teamId),
          playoffLosses: countPlayoffLosses(teamId),
          playoffRunsFor: countPlayoffRuns(teamId, true),
          playoffRunsAgainst: countPlayoffRuns(teamId, false),
          teamHR: totalHR,
          battingAvg: totalAB > 0 ? totalH / totalAB : 0,
          ERA:  totalIP > 0 ? (totalER / totalIP) * 9 : 0,
          WHIP: totalIP > 0 ? (totalBB + totalHA) / totalIP : 0,
        };
      };

      champion = buildTeamStats(champId);
      runnerUp = ruId != null ? buildTeamStats(ruId) : null;
    }
  }

  const teams = LEAGUE.teams.map(t => ({
    id: t.id,
    name: t.name,
    city: t.city,
    nickname: t.nickname,
    league: t.league,
    division: t.division,
    color: t.color,
    emoji: t.emoji,
    w: t.w || 0,
    l: t.l || 0,
    runsFor: t.runsFor || 0,
    runsAgainst: t.runsAgainst || 0,
    batters: t.batters.map(p => ({
      id: p.id, type: p.type, pos: p.pos,
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      firstName: p.firstName, lastName: p.lastName,
      career: { ...p.career },
    })),
    pitchers: t.pitchers.map(p => ({
      id: p.id, type: p.type, pos: p.pos,
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      firstName: p.firstName, lastName: p.lastName,
      career: { ...p.career },
    })),
  }));

  // Collect all team IDs that appeared in any playoff series
  const playoffIds = new Set();
  for (const s of (LEAGUE.playoffs?.series || [])) {
    if (s.higherSeedId != null) playoffIds.add(s.higherSeedId);
    if (s.lowerSeedId  != null) playoffIds.add(s.lowerSeedId);
  }

  // Map each team to the furthest round they reached
  const roundLabel = { wildCard: 'R1', divSeries: 'R2', champSeries: 'R3', worldSeries: 'WS' };
  const playoffRound = {};
  for (const s of (LEAGUE.playoffs?.series || [])) {
    if (s.winner == null) continue;
    const loserId = s.winner === s.higherSeedId ? s.lowerSeedId : s.higherSeedId;
    if (loserId != null) playoffRound[loserId] = roundLabel[s.round] ?? s.round;
    if (s.round === 'worldSeries') playoffRound[s.winner] = 'champion';
  }

  return {
    type: 'bbsim-season-archive',
    leagueName: LEAGUE.name,
    season: LEAGUE.season,
    gamesPlayed: LEAGUE.gamesPlayed || 0,
    champion,
    runnerUp,
    playoffTeamIds: [...playoffIds],
    playoffRound,
    teams,
  };
}

// ====================================================================
// EXPORT (download)
// ====================================================================
export function exportSeasonArchive() {
  const archive = buildSeasonArchive();
  const json = JSON.stringify(archive, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const champName = archive.champion ? archive.champion.teamName.replace(/\s+/g, '_') : 'No_Champ';
  a.download = `${ts}_${champName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ====================================================================
// LOAD FROM FOLDER (File System Access API or fallback)
// ====================================================================
export async function loadHistoryFolder() {
  if (window.showDirectoryPicker) {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await _readAllFromDir(dirHandle);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Folder picker error:', e);
    }
  } else {
    // Fallback: trigger a multi-file input
    const input = document.getElementById('history-file-input');
    if (input) input.click();
  }
}

async function _readAllFromDir(handle) {
  const loaded = [];
  for await (const [name, fileHandle] of handle) {
    if (fileHandle.kind !== 'file') continue;
    if (!name.toLowerCase().endsWith('.json')) continue;
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.type === 'bbsim-season-archive') {
        loaded.push({ filename: name, data, fileHandle });
      }
    } catch (_) { /* skip invalid files */ }
  }
  historySeasons = loaded;
  renderHistory();
}

// Fallback: called from <input type="file" multiple> onchange
export function loadHistoryFiles(input) {
  if (!input.files.length) return;
  dirHandle = null;
  const promises = Array.from(input.files).map(file =>
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (data.type === 'bbsim-season-archive') {
          return { filename: file.name, data, fileHandle: null };
        }
      } catch (_) {}
      return null;
    })
  );
  Promise.all(promises).then(results => {
    historySeasons = results.filter(Boolean);
    input.value = '';
    renderHistory();
  });
}

// ====================================================================
// DATA ACCESSOR (used by onclick in rendered HTML)
// ====================================================================
export function historyGetData(idx) {
  return historySeasons[idx]?.data ?? null;
}

// ====================================================================
// DELETE
// ====================================================================
export async function deleteHistorySeason(idx) {
  const entry = historySeasons[idx];
  if (!entry) return;
  if (!confirm(`Remove Season ${entry.data.season} (${entry.data.leagueName}) from history?`)) return;

  // Try to delete from disk if we have handles
  if (entry.fileHandle && dirHandle) {
    try {
      await dirHandle.removeEntry(entry.filename);
    } catch (e) {
      console.warn('Could not delete file from disk:', e);
    }
  }

  historySeasons.splice(idx, 1);
  renderHistory();
}

// ====================================================================
// SEASON VIEWER NAVIGATION STATE
// ====================================================================
export function getAllHistorySeasons() {
  return historySeasons;
}

export function getSeasonViewerEntry() {
  return historySeasons[seasonViewerList[seasonViewerPos]] ?? null;
}
export function getSeasonViewerInfo() {
  return { pos: seasonViewerPos, total: seasonViewerList.length };
}
export function setSeasonViewerPos(idx) {
  if (idx >= 0 && idx < seasonViewerList.length) seasonViewerPos = idx;
}
export function stepSeasonViewer(dir) {
  const next = seasonViewerPos + dir;
  if (next < 0 || next >= seasonViewerList.length) return false;
  seasonViewerPos = next;
  return true;
}

// ====================================================================
// SORT
// ====================================================================
// Fallback for old archives that stored only playoff stats on champion/runnerUp
function _teamStat(archiveData, teamId, field) {
  const t = (archiveData.teams || []).find(t => t.id === teamId);
  return t ? (t[field] ?? null) : null;
}

export function historySort(col) {
  if (sortCol === col) {
    sortDir = -sortDir;
  } else {
    sortCol = col;
    // ERA/WHIP: start ascending (lower = better); season (filename): start ascending; everything else: start descending
    sortDir = (col === 'cERA' || col === 'cWHIP' || col === 'ruERA' || col === 'ruWHIP' || col === 'season') ? 1 : -1;
  }
  renderHistory();
}

function getSortVal(entry, col) {
  const d = entry.data;
  const c = d.champion;
  const r = d.runnerUp;
  switch (col) {
    case 'season':      return (entry.filename || '').toLowerCase();
    case 'league':      return (d.leagueName || '').toLowerCase();
    case 'champ':       return c ? c.teamName.toLowerCase() : '';
    case 'cScore':      return c ? (_crossSeasonScores[`${historySeasons.indexOf(entry)}_${c.teamId}`] ?? -1) : -1;
    case 'cWins':       return c ? (c.seasonW ?? _teamStat(d, c.teamId, 'w') ?? -1) : -1;
    case 'cLosses':     return c ? (c.seasonL ?? _teamStat(d, c.teamId, 'l') ?? -1) : -1;
    case 'cRF':         return c ? (c.seasonRunsFor ?? _teamStat(d, c.teamId, 'runsFor') ?? -1) : -1;
    case 'cRA':         return c ? (c.seasonRunsAgainst ?? _teamStat(d, c.teamId, 'runsAgainst') ?? -1) : -1;
    case 'cHR':         return c ? c.teamHR : -1;
    case 'cAVG':        return c ? c.battingAvg : -1;
    case 'cERA':        return c ? c.ERA : 99;
    case 'cWHIP':       return c ? c.WHIP : 99;
    case 'ru':          return r ? r.teamName.toLowerCase() : '';
    case 'ruScore':     return r ? (_crossSeasonScores[`${historySeasons.indexOf(entry)}_${r.teamId}`] ?? -1) : -1;
    case 'ruWins':      return r ? (r.seasonW ?? _teamStat(d, r.teamId, 'w') ?? -1) : -1;
    case 'ruLosses':    return r ? (r.seasonL ?? _teamStat(d, r.teamId, 'l') ?? -1) : -1;
    case 'ruRF':        return r ? (r.seasonRunsFor ?? _teamStat(d, r.teamId, 'runsFor') ?? -1) : -1;
    case 'ruRA':        return r ? (r.seasonRunsAgainst ?? _teamStat(d, r.teamId, 'runsAgainst') ?? -1) : -1;
    case 'ruHR':        return r ? r.teamHR : -1;
    case 'ruAVG':       return r ? r.battingAvg : -1;
    case 'ruERA':       return r ? r.ERA : 99;
    case 'ruWHIP':      return r ? r.WHIP : 99;
    default:            return 0;
  }
}

// ====================================================================
// RENDER
// ====================================================================
export function renderHistory() {
  const cont = document.getElementById('history-container');
  if (!cont) return;

  if (!historySeasons.length) {
    cont.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:0.75rem;letter-spacing:1px">
        No seasons loaded. Use <strong>Load Folder</strong> to open a directory of archived seasons.
      </div>`;
    return;
  }

  _recomputeCrossSeasonScores();

  const sorted = [...historySeasons].sort((a, b) => {
    const av = getSortVal(a, sortCol), bv = getSortVal(b, sortCol);
    if (typeof av === 'string') return sortDir * av.localeCompare(bv);
    return (av - bv) * sortDir;
  });
  seasonViewerList = sorted.map(e => historySeasons.indexOf(e));

  const th = (col, label, title = '') => {
    const active = sortCol === col;
    const arrow = active ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    return `<th class="ht${active ? ' ht-sort' : ''}" onclick="historySort('${col}')" title="${title}">${label}${arrow}</th>`;
  };

  const stat = (val, decimals = 0, title = '') =>
    `<td title="${title}">${val != null ? (decimals > 0 ? val.toFixed(decimals) : val) : '—'}</td>`;

  const statAvg = val =>
    `<td>${val != null && val > 0 ? '.' + Math.round(val * 1000).toString().padStart(3, '0') : '.000'}</td>`;

  const scoreCell = (origIdx, teamId) => {
    const key = `${origIdx}_${teamId}`;
    if (teamId == null || !(key in _crossSeasonScores)) return '<td class="ht-na">—</td>';
    const s = _crossSeasonScores[key];
    return `<td title="Season score: ${s}/100"><span style="display:inline-block;min-width:28px;padding:1px 5px;border-radius:2px;background:${scoreColor(s)};color:#fff;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;font-weight:700;text-align:center">${s}</span></td>`;
  };

  const teamCols = (team, isChamp, origIdx, archiveData) => {
    if (!team) return '<td class="ht-na" colspan="10">—</td>';
    const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${team.color};margin-right:5px;vertical-align:middle"></span>`;
    const name = `${team.city} ${team.nickname || team.teamName}`;
    const badge = isChamp ? ' <span class="ht-champ-badge">WS</span>' : '';
    const sW  = team.seasonW  ?? _teamStat(archiveData, team.teamId, 'w');
    const sL  = team.seasonL  ?? _teamStat(archiveData, team.teamId, 'l');
    const sRF = team.seasonRunsFor ?? _teamStat(archiveData, team.teamId, 'runsFor');
    const sRA = team.seasonRunsAgainst ?? _teamStat(archiveData, team.teamId, 'runsAgainst');
    return `<td class="ht-name">${dot}${name}${badge}</td>
      ${scoreCell(origIdx, team.teamId)}
      ${stat(sW, 0, 'Season wins')}
      ${stat(sL, 0, 'Season losses')}
      ${stat(sRF, 0, 'Season runs scored')}
      ${stat(sRA, 0, 'Season runs allowed')}
      ${stat(team.teamHR, 0, 'Team home runs')}
      ${statAvg(team.battingAvg)}
      ${stat(team.ERA, 2, 'Team ERA')}
      ${stat(team.WHIP, 3, 'Team WHIP')}`;
  };

  let rows = sorted.map((entry, si) => {
    const origIdx = historySeasons.indexOf(entry);
    const d = entry.data;
    const canView = Array.isArray(d.teams) && d.teams.length > 0;
    return `<tr>
      <td class="ht-filename" title="${entry.filename}">${entry.filename.replace(/\.json$/i, '')}</td>
      ${teamCols(d.champion, true, origIdx, d)}
      ${teamCols(d.runnerUp, false, origIdx, d)}
      <td class="ht-del" style="white-space:nowrap">
        ${canView ? `<button class="ht-view-btn" onclick="viewHistorySeason(historyGetData(${origIdx}))" title="View in Players screen">Players</button>` : ''}
        <button class="ht-del-btn" onclick="deleteHistorySeason(${origIdx})" title="Remove from history">✕</button>
      </td>
      <td class="ht-arrow-col">
        ${canView ? `<button class="ht-arrow-btn" onclick="viewSeasonStandings(${si})" title="View standings for this season">▶</button>` : ''}
      </td>
    </tr>`;
  });

  cont.innerHTML = `
    <div class="ht-wrap">
      <table class="history-table">
        <thead>
          <tr class="ht-group-row">
            <th colspan="1"></th>
            <th colspan="10" class="ht-group ht-group-champ">Champion</th>
            <th colspan="10" class="ht-group ht-group-ru">Runner-Up</th>
            <th colspan="2"></th>
          </tr>
          <tr>
            ${th('season', 'Season')}
            ${th('champ', 'Team')}
            ${th('cScore', 'Score', 'Season score 0–100')}
            ${th('cWins', 'W', 'Season wins')}
            ${th('cLosses', 'L', 'Season losses')}
            ${th('cRF', 'RS', 'Season runs scored')}
            ${th('cRA', 'RA', 'Season runs allowed')}
            ${th('cHR', 'HR', 'Home runs')}
            ${th('cAVG', 'AVG', 'Team batting average')}
            ${th('cERA', 'ERA', 'Team ERA')}
            ${th('cWHIP', 'WHIP', 'Team WHIP')}
            ${th('ru', 'Team')}
            ${th('ruScore', 'Score', 'Season score 0–100')}
            ${th('ruWins', 'W', 'Season wins')}
            ${th('ruLosses', 'L', 'Season losses')}
            ${th('ruRF', 'RS', 'Season runs scored')}
            ${th('ruRA', 'RA', 'Season runs allowed')}
            ${th('ruHR', 'HR', 'Home runs')}
            ${th('ruAVG', 'AVG', 'Team batting average')}
            ${th('ruERA', 'ERA', 'Team ERA')}
            ${th('ruWHIP', 'WHIP', 'Team WHIP')}
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}
