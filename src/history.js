import { LEAGUE } from './league.js';

// ====================================================================
// HISTORY STATE
// ====================================================================
let historySeasons = [];   // [{ filename, data, fileHandle? }]
let dirHandle = null;      // FileSystemDirectoryHandle if loaded via folder picker
let sortCol = 'season';
let sortDir = -1;          // -1 = desc (newest first)

// ====================================================================
// SEASON SCORE  (0–100, z-score composite across all teams in archive)
// ====================================================================
function computeSeasonScores(archiveData) {
  const teams = archiveData.teams;
  if (!Array.isArray(teams) || teams.length < 2) return {};

  // Derive per-team stat values
  const raw = teams.map(t => {
    const totalHR = t.batters.reduce((s, b) => s + (b.career.hr || 0), 0);
    const totalH  = t.batters.reduce((s, b) => s + (b.career.h  || 0), 0);
    const totalAB = t.batters.reduce((s, b) => s + (b.career.ab || 0), 0);
    const totalIP = t.pitchers.reduce((s, p) => s + (p.career.ip || 0), 0);
    const totalER = t.pitchers.reduce((s, p) => s + (p.career.er || 0), 0);
    const totalBB = t.pitchers.reduce((s, p) => s + (p.career.bb || 0), 0);
    const totalHA = t.pitchers.reduce((s, p) => s + (p.career.h  || 0), 0);
    const games   = (t.w || 0) + (t.l || 0);
    return {
      id:      t.id,
      winPct:  games > 0 ? t.w / games : 0.5,
      runDiff: games > 0 ? ((t.runsFor || 0) - (t.runsAgainst || 0)) / games : 0,
      era:     totalIP > 0 ? (totalER / totalIP) * 9 : 4.50,
      whip:    totalIP > 0 ? (totalBB + totalHA) / totalIP : 1.30,
      avg:     totalAB > 0 ? totalH / totalAB : 0.250,
      hr:      games > 0 ? totalHR / games : 0,
    };
  });

  // Stat config: key, weight, true = higher is better
  const cfg = [
    { k: 'winPct',  w: 0.30, hi: true  },
    { k: 'runDiff', w: 0.20, hi: true  },
    { k: 'era',     w: 0.20, hi: false },
    { k: 'whip',    w: 0.15, hi: false },
    { k: 'avg',     w: 0.10, hi: true  },
    { k: 'hr',      w: 0.05, hi: true  },
  ];

  // Mean + stddev for each stat
  const dist = {};
  for (const { k } of cfg) {
    const vals = raw.map(r => r[k]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd   = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1e-9;
    dist[k] = { mean, sd };
  }

  // Weighted composite z-score per team
  const composites = raw.map(r => {
    const z = cfg.reduce((sum, { k, w, hi }) => {
      const zk = (r[k] - dist[k].mean) / dist[k].sd;
      return sum + w * (hi ? zk : -zk);
    }, 0);
    return { id: r.id, z };
  });

  // Normalise min→0, max→100
  const zVals = composites.map(c => c.z);
  const zMin  = Math.min(...zVals), zMax = Math.max(...zVals);
  const range = zMax - zMin || 1;
  const scores = {};
  composites.forEach(c => { scores[c.id] = Math.round(((c.z - zMin) / range) * 100); });
  return scores;
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

  return {
    type: 'bbsim-season-archive',
    leagueName: LEAGUE.name,
    season: LEAGUE.season,
    gamesPlayed: LEAGUE.gamesPlayed || 0,
    champion,
    runnerUp,
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
// SORT
// ====================================================================
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
    case 'cScore':      return c ? (computeSeasonScores(d)[c.teamId] ?? -1) : -1;
    case 'cWins':       return c ? c.playoffWins : -1;
    case 'cLosses':     return c ? (c.playoffLosses ?? -1) : -1;
    case 'cRF':         return c ? (c.playoffRunsFor ?? -1) : -1;
    case 'cRA':         return c ? (c.playoffRunsAgainst ?? -1) : -1;
    case 'cHR':         return c ? c.teamHR : -1;
    case 'cAVG':        return c ? c.battingAvg : -1;
    case 'cERA':        return c ? c.ERA : 99;
    case 'cWHIP':       return c ? c.WHIP : 99;
    case 'ru':          return r ? r.teamName.toLowerCase() : '';
    case 'ruScore':     return r ? (computeSeasonScores(d)[r.teamId] ?? -1) : -1;
    case 'ruWins':      return r ? r.playoffWins : -1;
    case 'ruLosses':    return r ? (r.playoffLosses ?? -1) : -1;
    case 'ruRF':        return r ? (r.playoffRunsFor ?? -1) : -1;
    case 'ruRA':        return r ? (r.playoffRunsAgainst ?? -1) : -1;
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

  const sorted = [...historySeasons].sort((a, b) => {
    const av = getSortVal(a, sortCol), bv = getSortVal(b, sortCol);
    if (typeof av === 'string') return sortDir * av.localeCompare(bv);
    return (av - bv) * sortDir;
  });

  const th = (col, label, title = '') => {
    const active = sortCol === col;
    const arrow = active ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    return `<th class="ht${active ? ' ht-sort' : ''}" onclick="historySort('${col}')" title="${title}">${label}${arrow}</th>`;
  };

  const stat = (val, decimals = 0, title = '') =>
    `<td title="${title}">${val != null ? (decimals > 0 ? val.toFixed(decimals) : val) : '—'}</td>`;

  const statAvg = val =>
    `<td>${val != null && val > 0 ? '.' + Math.round(val * 1000).toString().padStart(3, '0') : '.000'}</td>`;

  // Pre-compute season scores for all loaded entries
  const seasonScores = sorted.map(e => computeSeasonScores(e.data));

  const scoreCell = (scores, teamId) => {
    if (!scores || teamId == null || !(teamId in scores)) return '<td class="ht-na">—</td>';
    const s = scores[teamId];
    return `<td title="Season score: ${s}/100"><span style="display:inline-block;min-width:28px;padding:1px 5px;border-radius:2px;background:${scoreColor(s)};color:#fff;font-family:'IBM Plex Mono',monospace;font-size:0.65rem;font-weight:700;text-align:center">${s}</span></td>`;
  };

  const teamCols = (team, isChamp, scores) => {
    if (!team) return '<td class="ht-na" colspan="10">—</td>';
    const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${team.color};margin-right:5px;vertical-align:middle"></span>`;
    const name = `${team.city} ${team.nickname || team.teamName}`;
    const badge = isChamp ? ' <span class="ht-champ-badge">WS</span>' : '';
    return `<td class="ht-name">${dot}${name}${badge}</td>
      ${scoreCell(scores, team.teamId)}
      ${stat(team.playoffWins, 0, 'Playoff wins')}
      ${stat(team.playoffLosses ?? null, 0, 'Playoff losses')}
      ${stat(team.playoffRunsFor ?? null, 0, 'Playoff runs scored')}
      ${stat(team.playoffRunsAgainst ?? null, 0, 'Playoff runs allowed')}
      ${stat(team.teamHR, 0, 'Team home runs')}
      ${statAvg(team.battingAvg)}
      ${stat(team.ERA, 2, 'Team ERA')}
      ${stat(team.WHIP, 3, 'Team WHIP')}`;
  };

  let rows = sorted.map((entry, si) => {
    const origIdx = historySeasons.indexOf(entry);
    const d = entry.data;
    const scores = seasonScores[si];
    const canView = Array.isArray(d.teams) && d.teams.length > 0;
    return `<tr>
      <td class="ht-filename" title="${entry.filename}">${entry.filename.replace(/\.json$/i, '')}</td>
      <td class="ht-league">${d.leagueName || '—'}</td>
      ${teamCols(d.champion, true, scores)}
      ${teamCols(d.runnerUp, false, scores)}
      <td class="ht-del" style="white-space:nowrap">
        ${canView ? `<button class="ht-view-btn" onclick="viewHistorySeason(historyGetData(${origIdx}))" title="View in Players screen">Players</button>` : ''}
        <button class="ht-del-btn" onclick="deleteHistorySeason(${origIdx})" title="Remove from history">✕</button>
      </td>
    </tr>`;
  });

  cont.innerHTML = `
    <div class="ht-wrap">
      <table class="history-table">
        <thead>
          <tr class="ht-group-row">
            <th colspan="2"></th>
            <th colspan="10" class="ht-group ht-group-champ">Champion</th>
            <th colspan="10" class="ht-group ht-group-ru">Runner-Up</th>
            <th></th>
          </tr>
          <tr>
            ${th('season', 'Season')}
            ${th('league', 'League')}
            ${th('champ', 'Team')}
            ${th('cScore', 'Score', 'Season score 0–100')}
            ${th('cWins', 'PW', 'Playoff wins')}
            ${th('cLosses', 'PL', 'Playoff losses')}
            ${th('cRF', 'RF', 'Playoff runs scored')}
            ${th('cRA', 'RA', 'Playoff runs allowed')}
            ${th('cHR', 'HR', 'Home runs')}
            ${th('cAVG', 'AVG', 'Team batting average')}
            ${th('cERA', 'ERA', 'Team ERA')}
            ${th('cWHIP', 'WHIP', 'Team WHIP')}
            ${th('ru', 'Team')}
            ${th('ruScore', 'Score', 'Season score 0–100')}
            ${th('ruWins', 'PW', 'Playoff wins')}
            ${th('ruLosses', 'PL', 'Playoff losses')}
            ${th('ruRF', 'RF', 'Playoff runs scored')}
            ${th('ruRA', 'RA', 'Playoff runs allowed')}
            ${th('ruHR', 'HR', 'Home runs')}
            ${th('ruAVG', 'AVG', 'Team batting average')}
            ${th('ruERA', 'ERA', 'Team ERA')}
            ${th('ruWHIP', 'WHIP', 'Team WHIP')}
            <th></th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}
