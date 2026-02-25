import { MLB } from './data.js';
import { ri, cl, battingAvg, setText, mkEl, teamLogoHtml } from './utils.js';
import { LEAGUE, saveLeague } from './league.js';

// ====================================================================
// GAME STATE
// ====================================================================
export let G = {};
let dragSrc2 = null;
let pending = null;
let pendingBi = 0;
let autoT = null;
let msgT = null;
let pendingDelay = 0;
let awayTeamId = null;
let pitchDelay = 0;
let homeTeamId = null;
let gLineupView = 0;
let simMode = 'schedule';    // 'expo' | 'schedule' | 'playoffs'
let schedGameIdx = -1;       // index into LEAGUE.schedule for current scheduled game
let autoMultiRemaining = 0;  // games left to auto-play in multi-game mode
let playoffSeriesAutoRemaining = 0; // games left in auto-play series mode

// ====================================================================
// SIMULATE PAGE ENTRY POINT
// ====================================================================
export function renderSimulate() {
  const cont = document.getElementById('sim-container');
  if (!G.running) {
    const modeBar = `
      <div class="sim-mode-bar">
        <button class="sim-mode-btn${simMode === 'expo' ? ' active' : ''}" onclick="simSetMode('expo')">Expo</button>
        <button class="sim-mode-btn${simMode === 'schedule' ? ' active' : ''}" onclick="simSetMode('schedule')">Schedule</button>
      </div>`;

    const statsPanel = `
      <div style="margin-top:20px;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:16px">
        <div class="side-title" style="margin-bottom:10px">MLB 2024 Avg PA Outcomes</div>
        <table class="ptbl">
          <tr><td>Strikeout</td><td>22.6%<div class="pbar" style="width:45px"></div></td></tr>
          <tr><td>Ground Out</td><td>20.3%<div class="pbar" style="width:40px"></div></td></tr>
          <tr><td>Fly Out</td><td>16.5%<div class="pbar" style="width:33px"></div></td></tr>
          <tr><td>Walk</td><td>8.1%<div class="pbar" style="width:16px"></div></td></tr>
          <tr><td>Single</td><td>14.9%<div class="pbar" style="width:30px"></div></td></tr>
          <tr><td>Double</td><td>5.1%<div class="pbar" style="width:10px"></div></td></tr>
          <tr><td>Home Run</td><td>3.0%<div class="pbar" style="width:6px"></div></td></tr>
        </table>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:0.56rem;color:var(--muted);margin-top:8px">Source: FanGraphs/Baseball Reference 2024</div>
      </div>`;

    if (simMode === 'expo') {
      const opts = LEAGUE.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      const logoFor = id => { const t = LEAGUE.teams.find(t => t.id === parseInt(id)); return t ? teamLogoHtml(t, 32) : ''; };
      cont.innerHTML = `
        <div class="matchup-picker">
          <div class="section-title">New Game</div>
          ${modeBar}
          <div class="mp-row">
            <div class="mp-label">Away</div>
            <span id="logo-away">${teamLogoHtml(LEAGUE.teams[0], 32)}</span>
            <select class="mp-select" id="sel-away" onchange="document.getElementById('logo-away').innerHTML=window._mpLogoFor(this.value)">${opts}</select>
          </div>
          <div class="mp-row">
            <div class="mp-label">Home</div>
            <span id="logo-home">${teamLogoHtml(LEAGUE.teams[1] || LEAGUE.teams[0], 32)}</span>
            <select class="mp-select" id="sel-home" onchange="document.getElementById('logo-home').innerHTML=window._mpLogoFor(this.value)">${opts}</select>
          </div>
          <div style="margin-top:8px">
            <button class="btn primary" onclick="startGame()">Play Ball!</button>
          </div>
        </div>${statsPanel}`;
      window._mpLogoFor = logoFor;
      if (LEAGUE.teams.length >= 2) { document.getElementById('sel-home').selectedIndex = 1; document.getElementById('logo-home').innerHTML = logoFor(LEAGUE.teams[1].id); }

    } else {
      // Schedule mode
      const sched = LEAGUE.schedule || [];
      const nextIdx = sched.findIndex(g => !g.played);
      const played  = sched.filter(g => g.played).length;
      let picker;
      if (sched.length === 0) {
        picker = `<div style="padding:20px 0;font-family:'IBM Plex Mono',monospace;font-size:0.75rem;color:var(--muted)">No schedule found. Build one on the Schedule page.</div>`;
      } else if (nextIdx === -1) {
        picker = `<div style="padding:20px 0;font-family:'IBM Plex Mono',monospace;font-size:0.75rem;color:var(--muted)">All ${sched.length} games have been played!</div>`;
      } else {
        const g    = sched[nextIdx];
        const away = LEAGUE.teams.find(t => t.id === g.awayId);
        const home = LEAGUE.teams.find(t => t.id === g.homeId);
        picker = `
          <div style="font-family:'IBM Plex Mono',monospace;font-size:0.65rem;color:var(--muted);margin-bottom:14px">
            Game ${played + 1} of ${sched.length}
          </div>
          <div class="sched-next-game">
            <span class="sng-team">${teamLogoHtml(away, 32)} ${away.name}</span>
            <span class="sng-at">@</span>
            <span class="sng-team">${teamLogoHtml(home, 32)} ${home.name}</span>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" onclick="startScheduleGame()">Play Ball!</button>
            <button class="btn" onclick="gAutoMulti()">Auto Multi-Game</button>
          </div>`;
      }
      cont.innerHTML = `
        <div class="matchup-picker">
          <div class="section-title">New Game</div>
          ${modeBar}
          ${picker}
        </div>${statsPanel}`;
    }
  } else {
    renderGameUI();
  }
}

export function simSetMode(mode) {
  simMode = mode;
  renderSimulate();
}

export function startScheduleGame() {
  const sched = LEAGUE.schedule || [];
  const idx = sched.findIndex(g => !g.played);
  if (idx === -1) return;
  schedGameIdx = idx;
  startGame(sched[idx].awayId, sched[idx].homeId);
}

export function startGame(awayIdArg, homeIdArg) {
  const awayId = awayIdArg !== undefined ? awayIdArg : parseInt(document.getElementById('sel-away').value);
  const homeId = homeIdArg !== undefined ? homeIdArg : parseInt(document.getElementById('sel-home').value);
  if (awayId === homeId) { alert('Please choose different teams.'); return; }
  awayTeamId = awayId; homeTeamId = homeId;
  const away = LEAGUE.teams.find(t => t.id === awayId);
  const home = LEAGUE.teams.find(t => t.id === homeId);
  pending = null; clearTimeout(autoT); G.decisionsDisabled = false;

  G = {
    running: true,
    away, home,
    inning:1, half:0, outs:0, balls:0, strikes:0,
    bases:[false,false,false],
    score:[Array(9).fill(null),Array(9).fill(null)],
    runsStart:[0,0], runs:[0,0], hits:[0,0], errors:[0,0],
    lineupIdx:[0,0], over:false, walkoffPending:false,
    boxBatters:[{},{}], boxPitchers:[{},{}],
    eventFeed:[],
    scoringLog:[],  // {bi, away, home, awayPitcherIdx, homePitcherIdx} per run scored
  };
  away.activePitcher = away.startingPitcherIdx ?? 0;
  home.activePitcher = home.startingPitcherIdx ?? 0;
  [away, home].forEach(team => team.pitchers.forEach(p => { p.game = { strikes:0, balls:0, hits:0, bb:0, er:0, r:0, outs:0, k:0, pitches:0, hr:0, hbp:0, bf:0, entryScore:{away:0,home:0} }; }));
  [away, home].forEach(team => team.batters.forEach(b => { b.game = { ab:0, h:0, rbi:0, hr:0 }; }));

  renderGameUI();
  addLog('Game', `${away.name} vs ${home.name} — Play ball!`, '');
}

// Wrapper for the "New Matchup" button — resets game and shows picker
export function newMatchup() {
  G.running = false;
  renderSimulate();
}

// Play a specific game from the schedule by index
export function schedPlayGame(schedIdx) {
  const sched = LEAGUE.schedule || [];
  const game = sched[schedIdx];
  if (!game) return;
  if (G.running) {
    if (!confirm('Do you want to erase the current game in progress?')) return;
    G.running = false;
  }
  schedGameIdx = schedIdx;
  simMode = 'schedule';
  window.nav('simulate');
  startGame(game.awayId, game.homeId);
}

// Immediately start the next unplayed scheduled game
export function gNextGame() {
  const sched = LEAGUE.schedule || [];
  const idx = sched.findIndex(g => !g.played);
  if (idx === -1) {
    // No more games — fall back to schedule picker
    G.running = false;
    simMode = 'schedule';
    renderSimulate();
    return;
  }
  schedGameIdx = idx;
  simMode = 'schedule';
  startGame(sched[idx].awayId, sched[idx].homeId);
}

function renderGameUI() {
  const away = G.away, home = G.home;
  document.getElementById('sim-container').innerHTML = `
  <div class="sim-layout">
  <div class="sim-main">

    <div class="scoreboard">
      <div class="score-header" id="g-score-header">
        <div></div>
        <div style="text-align:center">1</div><div style="text-align:center">2</div><div style="text-align:center">3</div>
        <div style="text-align:center">4</div><div style="text-align:center">5</div><div style="text-align:center">6</div>
        <div style="text-align:center">7</div><div style="text-align:center">8</div><div style="text-align:center">9</div>
        <div class="sR-hdr">R</div><div class="sH-hdr">H</div><div class="sE-hdr">E</div>
      </div>
      <div class="score-row" id="g-row-away"><div class="score-team-name">${teamLogoHtml(away, 28)} ${away.name}</div></div>
      <div class="score-row" id="g-row-home"><div class="score-team-name">${teamLogoHtml(home, 28)} ${home.name}</div></div>
    </div>

    <div class="runners-bar">
      <div class="field-row">
        <div class="ballpark">
          <div class="base s" id="g-b2"></div>
          <div class="base t" id="g-b3"></div>
          <div class="base f" id="g-b1"></div>
          <div class="base h" id="g-bh"></div>
        </div>
        <div class="field-scoreboard" id="g-field-scoreboard">
          <div class="sb-left-panel">
            <div class="sb-inning" id="g-sb-inning"></div>
            <div class="sb-feed" id="g-sb-feed"></div>
          </div>
          <div class="sb-msg" id="g-sb-msg" style="display:none">
            <div class="sb-msg-text" id="g-sb-msg-text"></div>
          </div>
          <div class="sb-final" id="g-sb-final" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="abp">
      <div class="pc"><div class="pr">At Bat</div><div class="pn" id="g-batter-nm">—</div><div class="ps">AVG <b id="g-bavg">—</b>&nbsp; K% <b id="g-bk">—</b>&nbsp; BB% <b id="g-bbb">—</b>&nbsp; HR% <b id="g-bhr">—</b></div></div>
      <div class="pc"><div class="pr">Pitching</div><div class="pn" id="g-pitcher-nm">—</div><div class="ps">ERA <b id="g-pera">—</b>&nbsp; K% <b id="g-pk">—</b>&nbsp; BB% <b id="g-pbb">—</b></div></div>
    </div>


    <div class="controls">
      <button class="btn" id="g-btn-single" onclick="gSinglePitch()">Single Pitch</button>
      <button class="btn primary" id="g-btn-pitch" onclick="gPitch()">Pitch to Batter</button>
      <button class="btn" id="g-btn-auto" onclick="gAuto()">Auto-Play Half Inning</button>
      <button class="btn" id="g-btn-game" onclick="gAutoGame()">Auto-Play Game</button>
      <button class="btn" onclick="gNextGame()">Next Game →</button>
      <div style="display:flex;align-items:center;gap:7px;margin-left:auto">
        <span class="settings-label" style="white-space:nowrap">Delay</span>
        <div class="rating-bar-bg" style="width:110px;flex:none;cursor:pointer" onclick="gSetDelay(Math.round(event.offsetX/this.offsetWidth*10)*100)">
          <div class="rating-bar-fill" id="g-delay-bar" style="width:${pitchDelay/10}%;transition:none"></div>
        </div>
        <span id="g-delay-val" class="settings-val">${pitchDelay ? pitchDelay + 'ms' : 'off'}</span>
      </div>
    </div>

    <div class="game-over" id="g-over">
      <h2 id="g-over-w"></h2><p id="g-over-s"></p>
    </div>
    <div id="g-pitchers-final" class="pitchers-final" style="display:none"></div>

    <div class="status-bar">
      <div class="ib"><div class="ih" id="g-half-lbl">TOP</div><div class="iv" id="g-inning-val">1st</div></div>
      <div class="vd"></div>
      <div class="cb"><div class="cl">Balls</div><div class="cv bv" id="g-b">0</div></div>
      <div class="cb"><div class="cl">Strikes</div><div class="cv sv" id="g-s">0</div></div>
      <div class="cb"><div class="cl">Outs</div><div class="cv" id="g-o">0</div></div>
    </div>
    <div class="log"><div class="lh">Play-by-Play</div><div class="le" id="g-log"></div></div>

  </div>
  <div class="sim-side">
    <div>
      <div class="side-title">Lineup <span style="font-size:0.48rem;color:#bbb">drag to reorder</span></div>
      <div style="display:flex;gap:0;border:1px solid var(--line);border-radius:3px;overflow:hidden;margin-bottom:8px">
        <button style="flex:1;padding:5px;font-family:'IBM Plex Mono',monospace;font-size:0.6rem;background:var(--ink);color:var(--chalk);border:none;cursor:pointer" id="g-tab-away" onclick="gShowLineup(0)">${away.name.split(' ').slice(-1)[0]}</button>
        <button style="flex:1;padding:5px;font-family:'IBM Plex Mono',monospace;font-size:0.6rem;background:var(--panel);border:none;cursor:pointer" id="g-tab-home" onclick="gShowLineup(1)">${home.name.split(' ').slice(-1)[0]}</button>
      </div>
      <div class="lu-list" id="g-lu-list"></div>
    </div>
    <div>
      <div class="side-title">Pitching Staff</div>
      <div id="g-pi-list"></div>
    </div>
  </div>
  </div>`;
  gLineupView = 0;
  gRenderAll();
}

// ── GAME ENGINE ──
function gRenderAll() { gRenderSB(); gRenderStatus(); gRenderPlayers(); gRenderLineup(); gRenderPitchers(); gRenderInning(); gRenderFeed(); }

function gRenderFeed() {
  const el = document.getElementById('g-sb-feed');
  if (!el) return;
  const iconColor = { '1B':'#7ecf7e', '2B':'#7ecf7e', '3B':'#7ecf7e', 'HR':'#4ab3ff', 'BB':'#ffcc00', 'HBP':'#ffcc00', 'SF':'#ffcc00', 'R':'#4ab3ff', 'K':'#cc1111', 'GO':'#cc1111', 'FO':'#cc1111', 'LO':'#cc1111', 'DP':'#cc1111', 'E':'#ff8c00' };
  el.innerHTML = (G.eventFeed || []).map(e => e.summary
    ? `<div class="sb-feed-row sb-feed-summary"><span class="sb-feed-icon" style="color:#ffcc00">${e.icon}</span><span class="sb-feed-label" style="color:#ffcc00">${e.label}</span></div>`
    : `<div class="sb-feed-row"><span class="sb-feed-icon" style="color:${iconColor[e.icon]||'#fff'}">${e.icon}</span><span class="sb-feed-label">${e.label}</span></div>`
  ).join('');
}

function gRenderInning() {
  const el = document.getElementById('g-sb-inning');
  if (!el) return;
  if (G.over) { el.textContent = 'Game Final'; return; }
  const inn  = G._feedInning ?? G.inning;
  const half = G._feedHalf  ?? G.half;
  el.textContent = `${half === 0 ? '▲' : '▼'} ${inn}`;
}

function gRenderSB() {
  const cols = G.score[0].length;
  const colTemplate = `200px repeat(${cols},1fr) 34px 34px 34px`;
  // Rebuild header if inning count changed (extra innings)
  const hdr = document.getElementById('g-score-header');
  if (hdr) {
    hdr.style.gridTemplateColumns = colTemplate;
    hdr.innerHTML = '<div></div>' +
      Array.from({ length: cols }, (_, i) => `<div style="text-align:center">${i + 1}</div>`).join('') +
      '<div class="sR-hdr">R</div><div class="sH-hdr">H</div><div class="sE-hdr">E</div>';
  }
  [G.away, G.home].forEach((team, si) => {
    const row = document.getElementById(`g-row-${si === 0 ? 'away' : 'home'}`);
    if (!row) return;
    row.style.gridTemplateColumns = colTemplate;
    while (row.children.length > 1) row.removeChild(row.lastChild);
    for (let i = 0; i < cols; i++) {
      const c = document.createElement('div'); c.className = 'ic';
      const v = G.score[si][i]; const cur = (G.inning - 1 === i) && (G.half === si);
      if (v !== null) { c.textContent = v; if (v > 0) c.classList.add('hi'); }
      else if (cur) { const live = G.runs[si] - G.runsStart[si]; c.textContent = live > 0 ? live : '·'; if (live > 0) c.classList.add('hi'); c.classList.add('cur'); }
      else c.textContent = '–';
      row.appendChild(c);
    }
    const r = mkEl('div','sR',G.runs[si]), h = mkEl('div','sH',G.hits[si]), e = mkEl('div','sE',G.errors[si]);
    row.appendChild(r); row.appendChild(h); row.appendChild(e);
  });
}

function gRenderStatus() {
  setText('g-half-lbl', G.half === 0 ? 'TOP' : 'BOTTOM');
  setText('g-inning-val', gOrd(G.inning));
  setText('g-b', G.balls); setText('g-s', G.strikes); setText('g-o', G.outs);
  [1,2,3].forEach(b => { const el = document.getElementById(`g-b${b}`); if (el) el.classList.toggle('on', G.bases[b-1]); });
}

function gRenderPlayers() {
  const bi = G.half, fi = 1 - bi;
  const bat = bi === 0 ? G.away : G.home, fld = fi === 0 ? G.away : G.home;
  const batter  = bat.batters[G.lineupIdx[bi]];
  const pitcher = fld.pitchers[fld.activePitcher];
  setText('g-batter-nm', batter.name);
  setText('g-bavg', battingAvg(batter).toFixed(3));
  setText('g-bk',  (batter.kPct  * 100).toFixed(1) + '%');
  setText('g-bbb', (batter.bbPct * 100).toFixed(1) + '%');
  setText('g-bhr', (batter.hrPct * 100).toFixed(1) + '%');
  setText('g-pitcher-nm', pitcher.name);
  const era = pitcher.career.ip > 0 ? ((pitcher.career.er / pitcher.career.ip) * 9).toFixed(2) : pitcher.era.toFixed(2);
  setText('g-pera', era);
  setText('g-pk',  (pitcher.kPct  * 100).toFixed(1) + '%');
  setText('g-pbb', (pitcher.bbPct * 100).toFixed(1) + '%');
}

function gRenderLineup() {
  const team = gLineupView === 0 ? G.away : G.home, bi = gLineupView;
  const cur = (G.half === bi) ? G.lineupIdx[bi] : -1;
  const t0 = document.getElementById('g-tab-away'), t1 = document.getElementById('g-tab-home');
  if (t0) { t0.style.background = gLineupView === 0 ? 'var(--ink)' : 'var(--panel)'; t0.style.color = gLineupView === 0 ? 'var(--chalk)' : 'var(--ink)'; }
  if (t1) { t1.style.background = gLineupView === 1 ? 'var(--ink)' : 'var(--panel)'; t1.style.color = gLineupView === 1 ? 'var(--chalk)' : 'var(--ink)'; }
  const list = document.getElementById('g-lu-list');
  if (!list) return; list.innerHTML = '';
  team.batters.slice(0, 9).forEach((b, idx) => {
    const row = document.createElement('div');
    row.className = 'lu-row' + (idx === cur ? ' batting-now' : '');
    row.draggable = true;
    row.innerHTML = `<span class="lu-num">${idx+1}</span><div class="lu-nw"><div class="lu-pn">${b.name} <span class="lu-pos">${b.pos}</span></div><div class="lu-ps">.${Math.round(battingAvg(b)*1000).toString().padStart(3,'0')} · K${(b.kPct*100).toFixed(0)}%</div></div><span style="color:#ccc;font-size:0.8rem">⠿</span>`;
    row.addEventListener('dragstart', e => { dragSrc2 = idx; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend',   () => row.classList.remove('dragging'));
    row.addEventListener('dragover',  e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault(); row.classList.remove('drag-over');
      if (dragSrc2 !== null && dragSrc2 !== idx) {
        const arr = team.batters, [mv] = arr.splice(dragSrc2, 1); arr.splice(idx, 0, mv);
        if (G.half === bi) { const c = G.lineupIdx[bi]; if (dragSrc2 === c) G.lineupIdx[bi] = idx; else if (dragSrc2 < c && idx >= c) G.lineupIdx[bi] = c - 1; else if (dragSrc2 > c && idx <= c) G.lineupIdx[bi] = c + 1; }
        gRenderLineup(); gRenderPlayers();
      }
    });
    list.appendChild(row);
  });
}

function gRenderPitchers() {
  const team = gLineupView === 0 ? G.away : G.home;
  const list = document.getElementById('g-pi-list');
  if (!list) return; list.innerHTML = '';
  team.pitchers.forEach((p, i) => {
    const era = p.career.ip > 0 ? ((p.career.er / p.career.ip) * 9).toFixed(2) : p.era.toFixed(2);
    const row = document.createElement('div');
    row.className = 'pi-row' + (i === team.activePitcher ? ' active' : '');
    row.innerHTML = `<div style="flex:1"><div class="pi-nm">${p.name}</div><div class="pi-st">${p.arch} · ERA ${era}</div></div>${i === team.activePitcher ? '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:0.6rem">▶</span>' : ''}`;
    row.onclick = () => { team.activePitcher = i; team.pitchers[i].game.entryScore = { away: G.runs[0], home: G.runs[1] }; addLog(gTag(), `Manager brings in ${p.name}.`, 't-manage'); gRenderAll(); };
    list.appendChild(row);
  });
}

export function gShowLineup(i) { gLineupView = i; gRenderLineup(); gRenderPitchers(); }

// ── Scoreboard message overlay ──
function flashMsg(text, times, onMs, offMs, holdMs) {
  const el = document.getElementById('g-sb-msg');
  const tx = document.getElementById('g-sb-msg-text');
  if (!el || !tx) return;
  if (msgT) clearTimeout(msgT);
  tx.textContent = text;
  pendingDelay = times * onMs + (times - 1) * offMs + holdMs;
  let count = 0;
  function showPhase() { el.style.display = 'flex'; msgT = setTimeout(hidePhase, onMs); }
  function hidePhase() { el.style.display = 'none'; count++; if (count < times) msgT = setTimeout(showPhase, offMs); }
  showPhase();
}

function showScoreboardMsg(text, ms = 1800, color = null) {
  const el = document.getElementById('g-sb-msg');
  const tx = document.getElementById('g-sb-msg-text');
  if (!el || !tx) return;
  if (msgT) clearTimeout(msgT);
  tx.textContent = text;
  tx.style.color = color || '';
  tx.style.textShadow = color ? `0 0 18px ${color}cc, 0 0 40px ${color}99` : '';
  el.style.display = 'flex';
  msgT = setTimeout(() => { el.style.display = 'none'; }, ms);
}

export function gSinglePitch() {
  if (G.over || pending) return;
  simPitch();
}

// ── Pitch simulation ──
export function gPitch() {
  if (G.over || pending) return;
  const halfBefore = G.half, inningBefore = G.inning, batterBefore = G.lineupIdx[G.half];
  simPitch();
  // Continue automatically until the batter changes (PA ends), a decision is pending, or the game ends
  const batterChanged = G.lineupIdx[halfBefore] !== batterBefore || G.half !== halfBefore || G.inning !== inningBefore || G.over;
  if (!batterChanged && !pending && !G.over) autoT = setTimeout(gPitch, pitchDelay);
}

function simPitch() {
  const sbMsg = document.getElementById('g-sb-msg'); if (sbMsg) sbMsg.style.display = 'none';
  if (msgT) { clearTimeout(msgT); msgT = null; }
  if (G._feedInning !== G.inning || G._feedHalf !== G.half) {
    G.eventFeed = [];
    G._feedInning = G.inning;
    G._feedHalf = G.half;
  }
  const bi = G.half, fi = 1 - bi;
  const batting  = bi === 0 ? G.away : G.home, fielding = fi === 0 ? G.away : G.home;
  const batter  = batting.batters[G.lineupIdx[bi]];
  const pitcher = fielding.pitchers[fielding.activePitcher];
  pitcher.game.pitches++;
  const probs = calcProbs(batter, pitcher);

  if (Math.random() < 0.11 && G.strikes < 2) { G.strikes++; pitcher.game.strikes++; addLog(gTag(), `Foul ball. Count: ${G.balls}-${G.strikes}.`, 't-info'); gRenderAll(); return; }
  const fatigue = getFatigue(pitcher);
  const ballChance = cl(0.20 * ((batter.bbPct * 0.6 + pitcher.bbPct * (1 + fatigue * 0.6) * 0.4) / 0.081), 0.08, 0.42);
  if (Math.random() < ballChance && G.balls < 4) { G.balls++; pitcher.game.balls++; addLog(gTag(), `Ball ${G.balls}. Count: ${G.balls}-${G.strikes}.`, 't-info'); if (G.balls >= 4) { doWalk(batter, pitcher, bi, fielding); return; } gRenderAll(); return; }
  if (Math.random() < 0.10 && G.strikes < 3) {
    G.strikes++; pitcher.game.strikes++;
    if (G.strikes >= 3) {
      G.balls = 0; G.strikes = 0;
      batter.career.pa = (batter.career.pa || 0) + 1; batter.game.ab++;
      pitcher.career.k++; batter.career.k++; pitcher.game.k++; pitcher.game.bf++;
      addLog(gTag(), `Called strike 3. ${batter.name} struck out looking! ⚡`, 't-k', 'K');
      showScoreboardMsg('STRIKE OUT!', 1500); pushFeed('K', batter.name);
      nextB(bi); recOut(bi); gRenderAll(); return;
    }
    addLog(gTag(), `Called strike ${G.strikes}. Count: ${G.balls}-${G.strikes}.`, 't-info'); gRenderAll(); return;
  }
  const swingMissChance = cl(pitcher.kPct * 0.45 + batter.kPct * 0.3, 0.05, 0.20);
  if (Math.random() < swingMissChance && G.strikes < 3) {
    G.strikes++; pitcher.game.strikes++;
    if (G.strikes >= 3) {
      G.balls = 0; G.strikes = 0;
      batter.career.pa = (batter.career.pa || 0) + 1; batter.game.ab++;
      pitcher.career.k++; batter.career.k++; pitcher.game.k++; pitcher.game.bf++;
      addLog(gTag(), `Swings through strike 3. ${batter.name} struck out swinging! ⚡`, 't-k', 'K');
      showScoreboardMsg('STRIKE OUT!', 1500); pushFeed('K', batter.name);
      nextB(bi); recOut(bi); gRenderAll(); return;
    }
    addLog(gTag(), `Swings and misses. Strike ${G.strikes}. Count: ${G.balls}-${G.strikes}.`, 't-swing'); gRenderAll(); return;
  }

  const outcome = rollO(probs);

  // 'walk' and 'k' accumulate the count — intercept before the count reset
  if (outcome === 'walk') {
    G.balls++; pitcher.game.balls++;
    addLog(gTag(), `Ball ${G.balls}. Count: ${G.balls}-${G.strikes}.`, 't-info');
    if (G.balls >= 4) { doWalk(batter, pitcher, bi, fielding); return; }
    gRenderAll(); return;
  }
  if (outcome === 'k') {
    G.strikes++; pitcher.game.strikes++;
    if (G.strikes >= 3) {
      G.balls = 0; G.strikes = 0;
      batter.career.pa = (batter.career.pa || 0) + 1; batter.game.ab++;
      pitcher.career.k++; batter.career.k++; pitcher.game.k++; pitcher.game.bf++;
      addLog(gTag(), `${batter.name} strikes out. ⚡`, 't-k', 'K');
      showScoreboardMsg('STRIKE OUT!', 1500); pushFeed('K', batter.name);
      nextB(bi); recOut(bi); gRenderAll(); return;
    }
    addLog(gTag(), `Strike ${G.strikes}. Count: ${G.balls}-${G.strikes}.`, 't-info');
    gRenderAll(); return;
  }

  G.balls = 0; G.strikes = 0;

  // Update batter PA and pitcher BF
  batter.career.pa = (batter.career.pa || 0) + 1;
  pitcher.game.bf++;

  switch (outcome) {
    case 'go': {
      batter.career.ab++; batter.game.ab++; pitcher.game.strikes++;
      if (Math.random() < 0.07) {
        const fi = 1 - bi;  G.errors[fi]++;
        const eT = [['E4','second baseman boots it'],['E6','shortstop throws wild'],['E5','third baseman bobbles'],['E3','first base drops the throw']];
        const [eCode, eDesc] = eT[ri(eT.length)];
        addLog(gTag(), `${eCode} — ${eDesc}! ${batter.name} reaches safely.`, 't-hit', 'E'); showScoreboardMsg('ERROR!', 1500); pushFeed('E', batter.name);
        const rbE = G.runs[bi]; advR(1, bi, true, false); addRunLog(bi, G.runs[bi] - rbE, false); nextB(bi); break;
      }
      if (G.bases[0] && G.outs < 2 && Math.random() < .28) { addLog(gTag(), `${batter.name} hits into a double play!`, 't-out', 'DP'); showScoreboardMsg('DOUBLE PLAY!', 1800); pushFeed('DP', batter.name); G.bases[0] = false; nextB(bi); recOut(bi); if (!G.over && G.outs < 3) recOut(bi); }
      else { const t = ['grounds to short','grounds out to second','bounces to third']; addLog(gTag(), `${batter.name} ${t[ri(t.length)]}.`, 't-out', 'GO'); showScoreboardMsg('GROUND OUT', 1200); pushFeed('GO', batter.name); nextB(bi); recOut(bi); }
      break;
    }
    case 'fo': {
      pitcher.game.strikes++;
      if (Math.random() < 0.04) {
        batter.career.ab++; batter.game.ab++;
        const fi = 1 - bi; G.errors[fi]++;
        const eT = [['E7','left fielder drops it'],['E8','center fielder misjudges it'],['E9','right fielder muffs the catch']];
        const [eCode, eDesc] = eT[ri(eT.length)];
        addLog(gTag(), `${eCode} — ${eDesc}! ${batter.name} reaches safely.`, 't-hit', 'E'); showScoreboardMsg('ERROR!', 1500); pushFeed('E', batter.name);
        const rbE = G.runs[bi]; advR(1, bi, false, false); addRunLog(bi, G.runs[bi] - rbE, false); nextB(bi); break;
      }
      const foT = ['flies out to center','pops to right','lofts one to left — caught'];
      const isSF = G.bases[2] && G.outs < 2 && Math.random() < .72;
      addLog(gTag(), `${batter.name} ${foT[ri(foT.length)]}.`, 't-out', isSF ? 'SF' : 'FO');
      if (isSF) {
        batter.career.sf = (batter.career.sf || 0) + 1; batter.game.sf = (batter.game.sf || 0) + 1;
        G.bases[2] = false; scoreRun(bi); addRunLog(bi, 1); batter.game.rbi++; showScoreboardMsg('SAC FLY!', 1800); pushFeed('SF', batter.name);
      } else {
        batter.career.ab++; batter.game.ab++;
        showScoreboardMsg('FLY OUT', 1200); pushFeed('FO', batter.name);
      }
      nextB(bi); recOut(bi); break;
    }
    case 'lo': {
      batter.career.ab++; batter.game.ab++; pitcher.game.strikes++;
      if (Math.random() < 0.05) {
        const fi = 1 - bi; G.errors[fi]++;
        const eT = [['E4','second baseman can\'t handle it'],['E6','shortstop drops the liner'],['E5','third baseman juggles it']];
        const [eCode, eDesc] = eT[ri(eT.length)];
        addLog(gTag(), `${eCode} — ${eDesc}! ${batter.name} reaches safely.`, 't-hit', 'E'); showScoreboardMsg('ERROR!', 1500); pushFeed('E', batter.name);
        const rbE = G.runs[bi]; advR(1, bi, true, false); addRunLog(bi, G.runs[bi] - rbE, false); nextB(bi); break;
      }
      const t = ['lines out to short','ropes one to second — OUT','lasers one to center — caught!']; addLog(gTag(), `${batter.name} ${t[ri(t.length)]}.`, 't-out', 'LO'); showScoreboardMsg('LINE OUT', 1200); pushFeed('LO', batter.name); nextB(bi); recOut(bi); break;
    }
    case 'hbp': { batter.career.bb++; batter.career.pa++; pitcher.game.bb++; pitcher.game.balls++; pitcher.career.hbp++; pitcher.game.hbp++; addLog(gTag(), `${batter.name} hit by pitch.`, 't-hit', 'HBP'); showScoreboardMsg('HIT BY PITCH', 1800); pushFeed('HBP', batter.name); const rbH = G.runs[bi]; advR(1, bi, false); addRunLog(bi, G.runs[bi] - rbH); nextB(bi); break; }
    case 'single': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.pa++; batter.game.ab++; batter.game.h++; pitcher.game.hits++; pitcher.career.h++; pitcher.game.strikes++;
      addLog(gTag(), `${batter.name} singles!`, 't-hit', '1B'); showScoreboardMsg('SINGLE!', 1500); pushFeed('1B', batter.name);
      // 2 outs + runner on 2nd: scoring chance depends on runner speed
      if (G.outs === 2 && G.bases[1]) {
        // Approximate runner identity: player 2 lineup spots ahead of current batter
        const runnerApprox = batting.batters[(G.lineupIdx[bi] + 7) % 9];
        const spd = Math.min(100, Math.round((runnerApprox.sbRate / 0.15) * 100));
        const scoreChance = spd >= 90 ? 0.90 : 0.25 + (spd / 100) * 0.65;
        const r2scores = Math.random() < scoreChance;
        const nb = [false, false, false];
        const rb1 = G.runs[bi];
        if (G.bases[2]) { scoreRun(bi); }                              // runner on 3rd always scores
        if (r2scores)   { scoreRun(bi); }
        else            { nb[2] = true; addLog(gTag(), `Runner holds at third.`, 't-info'); }
        if (G.bases[0]) { nb[1] = true; }                              // runner on 1st → 2nd
        nb[0] = true;                                                   // batter → 1st
        G.bases = nb;
        addRunLog(bi, G.runs[bi] - rb1); batter.game.rbi += G.runs[bi] - rb1;
      } else {
        const rb1 = G.runs[bi]; advR(1, bi, true); addRunLog(bi, G.runs[bi] - rb1); batter.game.rbi += G.runs[bi] - rb1;
      }
      nextB(bi); break;
    }
    case 'dbl': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.doubles = (batter.career.doubles || 0) + 1; batter.game.ab++; batter.game.h++; pitcher.game.hits++; pitcher.career.h++; pitcher.game.strikes++;
      addLog(gTag(), `${batter.name} doubles!`, 't-hit', '2B'); showScoreboardMsg('DOUBLE!!', 1800); pushFeed('2B', batter.name);
      // Runner on 1st: speed-based scoring chance (2 outs = runners go on contact)
      if (G.bases[0]) {
        const runnerApprox = batting.batters[(G.lineupIdx[bi] + 8) % 9]; // 1 spot back in lineup
        const spd = Math.min(100, Math.round((runnerApprox.sbRate / 0.15) * 100));
        const scoreChance = G.outs === 2
          ? (spd >= 90 ? 0.85 : 0.25 + (spd / 100) * 0.60)   // 2 outs: avg ~60%, fast ~85%
          : (spd >= 90 ? 0.60 : 0.10 + (spd / 100) * 0.40);  // 0-1 outs: avg ~33%, fast ~60%
        const r1scores = Math.random() < scoreChance;
        const nb = [false, false, false];
        const rb2 = G.runs[bi];
        if (G.bases[2]) { scoreRun(bi); }                              // runner on 3rd always scores
        if (G.bases[1]) { scoreRun(bi); }                              // runner on 2nd always scores
        if (r1scores)   { scoreRun(bi); }
        else            { nb[2] = true; addLog(gTag(), `Runner holds at third.`, 't-info'); }
        nb[1] = true;                                                   // batter → 2nd
        G.bases = nb;
        addRunLog(bi, G.runs[bi] - rb2); batter.game.rbi += G.runs[bi] - rb2;
      } else {
        const rb2 = G.runs[bi]; advR(2, bi, true); addRunLog(bi, G.runs[bi] - rb2); batter.game.rbi += G.runs[bi] - rb2;
      }
      nextB(bi); break;
    }
    case 'triple': { G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.triples = (batter.career.triples || 0) + 1; batter.game.ab++; batter.game.h++; pitcher.game.hits++; pitcher.career.h++; pitcher.game.strikes++; addLog(gTag(), `${batter.name} TRIPLES!`, 't-hit', '3B'); showScoreboardMsg('TRIPLE!!!', 2200); pushFeed('3B', batter.name); const rb3 = G.runs[bi]; advR(3, bi, true); addRunLog(bi, G.runs[bi] - rb3); batter.game.rbi += G.runs[bi] - rb3; nextB(bi); break; }
    case 'hr': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.hr++; batter.game.ab++; batter.game.h++; batter.game.hr++; pitcher.game.hits++; pitcher.career.h++; pitcher.career.hr++; pitcher.game.hr++; pitcher.game.strikes++;
      const ob = G.bases.filter(Boolean).length;
      addLog(gTag(), `${batter.name} HOMERS! ${ob+1} run${ob+1 > 1 ? 's' : ''} score! 💥`, 't-hr', 'HR'); showScoreboardMsg('HOME RUN!!', 1800, '#cc1111'); pushFeed('HR', batter.name);
      G.bases = [false,false,false];
      for (let r = 0; r <= ob; r++) { scoreRun(bi); batter.career.rbi = (batter.career.rbi || 0) + 1; }
      batter.game.rbi += ob + 1;
      nextB(bi); break;
    }
  }
  gRenderAll();
  if (G.walkoffPending && !G.over) { G.walkoffPending = false; endGame(); }
}

function doWalk(batter, pitcher, bi, fielding) {
  pitcher.career.bb++; batter.career.bb++; batter.career.pa++; pitcher.game.bb++; pitcher.game.bf++;
  addLog(gTag(), `${batter.name} draws a walk.`, 't-hit', 'BB'); showScoreboardMsg('WALK', 1500); pushFeed('BB', batter.name);
  const rbW = G.runs[bi]; advR(1, bi, false); addRunLog(bi, G.runs[bi] - rbW); nextB(bi); G.balls = 0; G.strikes = 0;
  gRenderAll();
  if (G.walkoffPending && !G.over) { G.walkoffPending = false; endGame(); }
}

function checkDec(bi) { if (G.outs >= 3 || G.over || G.decisionsDisabled) return; const opts = buildOpts(bi); if (opts.length > 1) showDec(opts, bi); }

function buildOpts(bi) {
  const [r1, r2, r3] = G.bases, outs = G.outs;
  const batting = bi === 0 ? G.away : G.home;
  const batter  = batting.batters[G.lineupIdx[bi]];
  const opts = [{id:'play',lbl:'Play it straight',det:'Normal at-bat',odds:''}];
  if (r1 && !r2 && outs < 2)  opts.push({id:'steal2', lbl:'Steal 2nd',        det:'Runner breaks',          odds:'~70%'});
  if (r1 && r2  && outs < 2)  opts.push({id:'dsteal', lbl:'Double steal',      det:'Both runners go',        odds:'~62%'});
  if (r2 && !r3 && !r1 && outs < 2) opts.push({id:'steal3', lbl:'Steal 3rd',  det:'Runner on 2nd goes',     odds:'~65%'});
  if ((r1 || r2) && outs < 2 && batter.hrPct < .04) opts.push({id:'bunt',      lbl:'Sac bunt',               det:'Advance runners',        odds:'~90%'});
  if (r3 && outs < 2)          opts.push({id:'squeeze',lbl:'Suicide squeeze',   det:'Runner breaks — must bunt',odds:'~70%'});
  if (r1 && outs < 2)          opts.push({id:'hitrun', lbl:'Hit and run',       det:'Runner breaks on pitch', odds:'Expands gaps'});
  opts.push({id:'dismiss',lbl:'Auto-manage rest of game',det:'No more decisions this game',odds:'',dismiss:true});
  return opts;
}

function showDec(opts, bi) {
  pending = opts; pendingBi = bi;
  const [r1, r2, r3] = G.bases;
  const runners = []; if (r1) runners.push('1st'); if (r2) runners.push('2nd'); if (r3) runners.push('3rd');
  setText('g-dec-sit', `${G.outs} out${G.outs !== 1 ? 's' : ''}, runners on: ${runners.join(', ') || 'none'}. Your call:`);
  const grid = document.getElementById('g-dec-btns');
  grid.innerHTML = '';
  opts.forEach(o => {
    const b = document.createElement('button');
    b.className = 'dec-btn' + (o.dismiss ? ' dismiss' : '');
    b.innerHTML = `<span><strong>${o.lbl}</strong> — ${o.det}</span><span class="dec-odds">${o.odds}</span>`;
    b.onclick = () => resolveDec(o.id, bi);
    grid.appendChild(b);
  });
  const p = document.getElementById('g-dec'); if (p) p.style.display = 'block';
  const btn = document.getElementById('g-btn-pitch'); if (btn) btn.disabled = true;
}

function hideDec() {
  pending = null;
  const p = document.getElementById('g-dec'); if (p) p.style.display = 'none';
  const btn = document.getElementById('g-btn-pitch'); if (btn) btn.disabled = G.over;
}

export function resolveDec(id, bi) {
  hideDec();
  if (id === 'dismiss') { G.decisionsDisabled = true; addLog(gTag(), '⚙️ Auto-manage enabled — no more play stoppages this game.', 't-info'); gRenderAll(); return; }
  const batting = bi === 0 ? G.away : G.home;
  const li = G.lineupIdx[bi];
  const runner1 = batting.batters[(li + 8) % 9];
  const runner2 = batting.batters[(li + 7) % 9];
  switch (id) {
    case 'play':   addLog(gTag(), 'Manager plays it straight.', 't-manage'); break;
    case 'steal2': { const ok = Math.random() < .68; addLog(gTag(), `🏃 ${ok ? 'SAFE! Runner takes 2nd!' : 'CAUGHT STEALING!'}`, ok ? 't-hit' : 't-out'); if (ok) { G.bases[0] = false; G.bases[1] = true; runner1.career.sb++; } else { G.bases[0] = false; runner1.career.cs++; recOut(bi); } break; }
    case 'dsteal': { const a = Math.random() < .64, b2 = Math.random() < .64; if (a && b2) { addLog(gTag(), '🏃🏃 Double steal — BOTH SAFE!', 't-hit'); G.bases[0] = false; G.bases[1] = true; G.bases[2] = true; runner1.career.sb++; runner2.career.sb++; } else if (a) { addLog(gTag(), 'Lead runner safe, trailing caught!', 't-out'); G.bases[0] = false; G.bases[2] = true; runner1.career.cs++; runner2.career.sb++; recOut(bi); } else { addLog(gTag(), 'Double steal botched!', 't-out'); G.bases[0] = false; G.bases[1] = false; runner1.career.cs++; runner2.career.cs++; recOut(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'steal3': { const ok = Math.random() < .64; addLog(gTag(), `🏃 Steal of 3rd — ${ok ? 'SAFE!' : 'CAUGHT!'}`, ok ? 't-hit' : 't-out'); if (ok) { G.bases[1] = false; G.bases[2] = true; runner2.career.sb++; } else { G.bases[1] = false; runner2.career.cs++; recOut(bi); } break; }
    case 'bunt':   { const ok = Math.random() < .87; if (ok) { addLog(gTag(), '📦 Sac bunt — runners advance.', 't-manage'); if (G.bases[2]) { G.bases[2] = false; scoreRun(bi); } if (G.bases[1]) { G.bases[2] = true; G.bases[1] = false; } if (G.bases[0]) { G.bases[1] = true; G.bases[0] = false; } nextB(bi); recOut(bi); } else { addLog(gTag(), '📦 Bunt popped up — double play!', 't-out'); if (G.bases[0]) { G.bases[0] = false; recOut(bi); } nextB(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'squeeze':{ const ok = Math.random() < .70; addLog(gTag(), `🎯 Suicide squeeze — ${ok ? 'SCORES!' : 'POPPED UP — double play!'}`, ok ? 't-score' : 't-out'); if (ok) { G.bases[2] = false; scoreRun(bi); addRunLog(bi, 1); nextB(bi); recOut(bi); } else { G.bases[2] = false; nextB(bi); recOut(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'hitrun': { const ok = Math.random() < .72; if (ok) { addLog(gTag(), '✅ Hit and run — contact! Runner takes extra base.', 't-hit'); G.hits[G.half]++; const bat = (G.half === 0 ? G.away : G.home).batters[G.lineupIdx[G.half]]; bat.career.h++; bat.career.ab++; advR(2, bi, true); nextB(bi); } else { addLog(gTag(), '❌ Hit and run — miss! Runner caught.', 't-out'); G.bases[0] = false; recOut(bi); } break; }
  }
  gRenderAll();
  if (G.walkoffPending && !G.over) { G.walkoffPending = false; endGame(); }
}

let hpQueue = 0, hpBusy = false;
function flashHome() {
  hpQueue++;
  if (hpBusy) return;
  const step = () => {
    if (hpQueue <= 0) { hpBusy = false; return; }
    hpBusy = true; hpQueue--;
    const hp = document.getElementById('g-bh');
    if (!hp) { hpBusy = false; return; }
    hp.classList.add('on');
    setTimeout(() => { hp.classList.remove('on'); setTimeout(step, 18); }, 50);
  };
  step();
}

function scoreRun(bi, earned = true) {
  G.runs[bi]++;
  G.scoringLog.push({ bi, away: G.runs[0], home: G.runs[1], awayPitcherIdx: G.away.activePitcher, homePitcherIdx: G.home.activePitcher, earned });
  const fldTeam = bi === 0 ? G.home : G.away;
  const curP = fldTeam.pitchers[fldTeam.activePitcher];
  if (earned) curP.game.er++;
  curP.game.r++;
  flashHome();
  if (!G.over && G.half === 1 && G.inning >= 9 && G.runs[1] > G.runs[0]) G.walkoffPending = true;
}

function addRunLog(bi, n, earned = true) {
  if (n <= 0) return;
  const label = earned ? 'run' : 'unearned run';
  const s = n === 1 ? `1 ${label} scores` : `${n} ${label}s score`;
  addLog(gTag(), `${s}. ${G.away.name} ${G.runs[0]}–${G.runs[1]} ${G.home.name}.`, 't-score', 'R');
  const team = bi === 0 ? G.away : G.home;
  const score = `${G.runs[0]}–${G.runs[1]}`;
  pushFeed('R', `${team.name.split(' ').slice(-1)[0]} · ${score}`);
}

function advR(bases, bi, batterAdv, earned = true) {
  let scored = 0, nb = [false,false,false];
  if (batterAdv) { for (let b = 2; b >= 0; b--) { if (G.bases[b]) { const d = b + bases; if (d >= 3) scored++; else nb[d] = true; } } const d = bases - 1; if (d >= 3) scored++; else nb[d] = true; }
  else {
    // Force-advance: batter takes 1st, chain forces runners ahead of the clog.
    // Any runner NOT in the force chain stays put.
    nb[0] = true;
    if (G.bases[0]) {
      nb[1] = true;
      if (G.bases[1]) {
        nb[2] = true;
        if (G.bases[2]) scored++;
      } else {
        if (G.bases[2]) nb[2] = true; // runner on 3rd not forced — stays
      }
    } else {
      if (G.bases[1]) nb[1] = true; // runner on 2nd not forced — stays
      if (G.bases[2]) nb[2] = true; // runner on 3rd not forced — stays
    }
  }
  G.bases = nb;
  for (let i = 0; i < scored; i++) scoreRun(bi, earned);
}

function nextB(bi) { G.lineupIdx[bi] = (G.lineupIdx[bi] + 1) % 9; }

function recOut(bi) {
  if (G.over) return;
  const fldTeam = bi === 0 ? G.home : G.away;
  fldTeam.pitchers[fldTeam.activePitcher].game.outs++;
  G.outs++; if (G.outs >= 3) endHalf(bi);
}

function checkCloserSituation(team, teamRuns, oppRuns) {
  const lead = teamRuns - oppRuns;
  if (lead < 1 || lead > 3) return;                                      // not a save situation
  const curP = team.pitchers[team.activePitcher];
  if (curP && curP.pos === 'CL') return;                                  // closer already in
  const clIdx = team.pitchers.findIndex((p, i) => p.pos === 'CL' && i !== team.activePitcher && getFatigue(p) < 1);
  if (clIdx === -1) return;                                               // no fresh CL available
  addLog(gTag(), `🔒 Save situation — ${team.pitchers[clIdx].name} (CL) enters to close it out.`, 't-manage');
  team.activePitcher = clIdx;
  team.pitchers[clIdx].game.entryScore = { away: G.runs[0], home: G.runs[1] };
}

function checkFatigueAndSub(team) {
  const pitcher = team.pitchers[team.activePitcher];
  if (!pitcher || getFatigue(pitcher) <= 0.90) return;
  const avail = (p, i) => i !== team.activePitcher && getFatigue(p) < 1;
  // 1. Prefer RP
  let eligible = team.pitchers.map((p,i)=>({p,i})).filter(({p,i})=>avail(p,i) && p.pos==='RP');
  // 2. Any non-SP, non-CL reliever
  if (eligible.length === 0)
    eligible = team.pitchers.map((p,i)=>({p,i})).filter(({p,i})=>avail(p,i) && p.pos!=='SP' && p.pos!=='CL' && p.pos!=='P');
  // 3. Last resort — anyone available (including CL)
  if (eligible.length === 0)
    eligible = team.pitchers.map((p,i)=>({p,i})).filter(({p,i})=>avail(p,i));
  if (eligible.length === 0) return;
  eligible.sort((a,b) => (a.p.career.g || 0) - (b.p.career.g || 0));
  const next = eligible[0].i;
  addLog(gTag(), `🔄 ${pitcher.name} lifted (${pitcher.game.pitches} pitches, ${Math.round(getFatigue(pitcher)*100)}% fatigue). ${team.pitchers[next].name} enters.`, 't-manage');
  team.activePitcher = next;
  team.pitchers[next].game.entryScore = { away: G.runs[0], home: G.runs[1] };
}

function endHalf(bi) {
  const ir = G.runs[bi] - G.runsStart[bi];
  G.score[bi][G.inning - 1] = ir;
  G.bases = [false,false,false]; G.balls = 0; G.strikes = 0; G.outs = 0;
  G.eventFeed.unshift({ icon: String(ir), label: ir === 1 ? 'run scored' : 'runs scored', summary: true });
  gRenderFeed();
  if (bi === 0) {
    addDelimiter('dotted'); addLog(`End ${gOrd(G.inning)}`, `${G.away.name} ${G.runs[0]}, ${G.home.name} ${G.runs[1]}.`, 't-info');
    if (G.inning >= 9 && G.runs[1] > G.runs[0]) { endGame(); return; }
    G.half = 1; G.runsStart[1] = G.runs[1];
    if (G.inning >= 9) checkCloserSituation(G.home, G.runs[1], G.runs[0]);
    if (G.inning >= 6) checkFatigueAndSub(G.away);
  }
  else {
    addDelimiter('solid'); addLog(`End ${gOrd(G.inning)}`, `${G.away.name} ${G.runs[0]}, ${G.home.name} ${G.runs[1]}.`, 't-info');
    if (G.inning >= 9 && G.runs[0] !== G.runs[1]) { endGame(); return; }
    G.inning++; G.half = 0; G.runsStart[0] = G.runs[0];
    if (G.inning > G.score[0].length) { G.score[0].push(null); G.score[1].push(null); }
    if (G.inning >= 9) checkCloserSituation(G.away, G.runs[0], G.runs[1]);
    if (G.inning >= 6) checkFatigueAndSub(G.home);
  }
}

function endGame() {
  G.over = true;
  const awayWon = G.runs[0] > G.runs[1], homeWon = G.runs[1] > G.runs[0];
  const w = awayWon ? G.away.name : homeWon ? G.home.name : 'Tie';

  // Update W/L records
  if (awayWon)      { G.away.w++; G.home.l++; }
  else if (homeWon) { G.home.w++; G.away.l++; }
  G.away.runsFor      = (G.away.runsFor     || 0) + G.runs[0];
  G.away.runsAgainst  = (G.away.runsAgainst || 0) + G.runs[1];
  G.home.runsFor      = (G.home.runsFor     || 0) + G.runs[1];
  G.home.runsAgainst  = (G.home.runsAgainst || 0) + G.runs[0];
  LEAGUE.gamesPlayed++;

  // Determine pitcher decisions MLB-style (W / L / SV)
  let winP = null, lossP = null, saveP = null;
  if (awayWon || homeWon) {
    const [winTi, loseTi] = awayWon ? [0, 1] : [1, 0];
    const [winTeam, loseTeam] = awayWon ? [G.away, G.home] : [G.home, G.away];

    // Walk scoring log to find the last time the winning team took the lead
    // from a non-leading position (the decisive run)
    let decisiveIdx = -1, prevWinLeading = false;
    for (let i = 0; i < G.scoringLog.length; i++) {
      const e = G.scoringLog[i];
      const wLeading = winTi === 0 ? e.away > e.home : e.home > e.away;
      if (wLeading && !prevWinLeading) decisiveIdx = i;
      prevWinLeading = wLeading;
    }
    if (decisiveIdx === -1 && G.scoringLog.length > 0) decisiveIdx = 0;
    const dec = G.scoringLog[decisiveIdx];

    // Losing pitcher: pitching for losing team when winner scored the decisive run
    if (dec && dec.bi === winTi) {
      const lpIdx = loseTi === 0 ? dec.awayPitcherIdx : dec.homePitcherIdx;
      lossP = loseTeam.pitchers[lpIdx];
    }
    if (!lossP) lossP = loseTeam.pitchers[loseTeam.activePitcher];

    // Winning pitcher: pitching for winning team at the decisive moment
    let wpCandidate = null;
    if (dec) {
      const wpIdx = winTi === 0 ? dec.awayPitcherIdx : dec.homePitcherIdx;
      wpCandidate = winTeam.pitchers[wpIdx];
    }
    if (!wpCandidate) wpCandidate = winTeam.pitchers[winTeam.activePitcher];

    // Starter qualification: must have pitched ≥ 5 innings (≥ 15 outs) to earn a W
    const winPitched = winTeam.pitchers.filter(p => p.game && p.game.pitches > 0);
    if (winPitched.length > 1 && wpCandidate === winPitched[0] && winPitched[0].game.outs < 15) {
      wpCandidate = winPitched[1]; // starter didn't qualify — W goes to first reliever
    }
    winP = wpCandidate;

    // Save: last pitcher on winning team, not the WP, entered with a lead of 1–3 runs
    const lastWinP = winTeam.pitchers[winTeam.activePitcher];
    if (lastWinP !== winP && lastWinP.game && lastWinP.game.pitches > 0) {
      const es = lastWinP.game.entryScore || { away: 0, home: 0 };
      const wEntry = winTi === 0 ? es.away : es.home;
      const lEntry = winTi === 0 ? es.home : es.away;
      const entryLead = wEntry - lEntry;
      if (entryLead >= 1 && entryLead <= 3) saveP = lastWinP;
    }
  }

  // Archive pitcher stats for every pitcher who appeared
  [G.away, G.home].forEach((team, ti) => {
    const pitched = team.pitchers.filter(p => p.game && p.game.pitches > 0);
    if (pitched.length === 0) return;
    const teamWon = (ti === 0 && awayWon) || (ti === 1 && homeWon);
    pitched.forEach((p, pi) => {
      const gs = p.game;
      p.career.g++;
      if (pi === 0) p.career.gs = (p.career.gs || 0) + 1;
      p.career.ip += gs.outs / 3;
      p.career.er += gs.er;
      p.career.r   = (p.career.r   || 0) + (gs.r   || 0);
      p.career.bf  = (p.career.bf  || 0) + (gs.bf  || 0);
      if (p === winP)  p.career.w++;
      if (p === lossP) p.career.l++;
      if (p === saveP) { p.career.sv = (p.career.sv || 0) + 1; p.career.svo = (p.career.svo || 0) + 1; }
    });
    // Complete game / shutout for the sole starter
    if (pitched.length === 1) {
      pitched[0].career.cg = (pitched[0].career.cg || 0) + 1;
      if (G.runs[1 - ti] === 0 && teamWon) pitched[0].career.sho = (pitched[0].career.sho || 0) + 1;
    }
  });

  // Games played for lineup batters
  [G.away, G.home].forEach(team => {
    team.batters.slice(0, 9).forEach(b => { b.career.g = (b.career.g || 0) + 1; });
  });

  // Advance starting rotation for next game
  [G.away, G.home].forEach(team => {
    const spCount = Math.max(1, Math.min(5, team.pitchers.filter(p => p.pos === 'SP').length));
    team.startingPitcherIdx = ((team.startingPitcherIdx ?? 0) + 1) % spCount;
  });

  // Mark scheduled game as played
  if (simMode === 'schedule' && schedGameIdx >= 0 && LEAGUE.schedule) {
    const sg = LEAGUE.schedule[schedGameIdx];
    if (sg) { sg.played = true; sg.awayScore = G.runs[0]; sg.homeScore = G.runs[1]; }
    schedGameIdx = -1;
  }

  // Playoff series advancement
  if (simMode === 'playoffs' && LEAGUE.playoffs?.activeSeriesIdx != null) {
    autoMultiRemaining = 0; // prevent interference
    const sIdx = LEAGUE.playoffs.activeSeriesIdx;
    const series = LEAGUE.playoffs.series[sIdx];
    const gameNum = series.games.length + 1;
    series.games.push({ gameNum, homeId: homeTeamId, awayId: awayTeamId, homeScore: G.runs[1], awayScore: G.runs[0] });
    const winnerId = G.runs[0] > G.runs[1] ? awayTeamId : homeTeamId;
    if (winnerId === series.higherSeedId) series.higherSeedWins++;
    else series.lowerSeedWins++;
    const winsNeeded = Math.ceil(series.seriesLength / 2);
    if (series.higherSeedWins >= winsNeeded || series.lowerSeedWins >= winsNeeded) {
      series.winner = winnerId;
      LEAGUE.playoffs.activeSeriesIdx = null;
      advancePlayoffBracket(series);
    }
    saveLeague();
    G.running = false;
    if (playoffSeriesAutoRemaining > 0) { playoffAutoNext(); return; }
    window.nav('playoffs');
    return;
  }

  saveLeague();
  G.running = false;

  // Multi-game auto mode — skip overlay, chain to next game
  if (autoMultiRemaining > 0) { autoMultiNext(); return; }

  const el = document.getElementById('g-over'); if (el) el.style.display = 'block';
  setText('g-over-w', w === 'Tie' ? 'Final — Tie' : `${w} Win!`);
  setText('g-over-s', `${G.away.name} ${G.runs[0]} — ${G.home.name} ${G.runs[1]}`);
  const sbtn = document.getElementById('g-btn-single'); if (sbtn) sbtn.disabled = true;
  const btn = document.getElementById('g-btn-pitch'); if (btn) btn.disabled = true;
  const abtn = document.getElementById('g-btn-auto');  if (abtn) abtn.disabled = true;
  const gbtn = document.getElementById('g-btn-game');  if (gbtn) gbtn.disabled = true;

  // Top hitters overlay on field scoreboard
  const msgEl = document.getElementById('g-sb-msg');
  if (msgEl) { clearTimeout(msgT); msgEl.style.display = 'none'; }
  const sbEl = document.getElementById('g-sb-final');
  if (sbEl) {
    const renderBattingHalf = (team) => {
      const top3 = team.batters.slice()
        .sort((a, b) => b.game.h - a.game.h || b.game.hr - a.game.hr || b.game.rbi - a.game.rbi)
        .slice(0, 3);
      const rows = top3.map(b => `
            <div class="sbt-row">
              <span class="sbt-nm">${b.name}</span>
              <span>${b.game.ab}</span><span>${b.game.h}</span><span>${b.game.rbi}</span><span>${b.game.hr}</span>
            </div>`).join('');
      return `
          <div class="sbt-half">
            <div class="sbt-team">${team.emoji} ${team.name}</div>
            <div class="sbt-hdr"><span>Batter</span><span>AB</span><span>H</span><span>RBI</span><span>HR</span></div>
            ${rows}
          </div>`;
    };
    sbEl.innerHTML = `<div class="sb-batting">${renderBattingHalf(G.away)}${renderBattingHalf(G.home)}</div>`;
    sbEl.style.display = 'flex';
  }

  // Both pitchers comparison panel
  const pfEl = document.getElementById('g-pitchers-final');
  if (pfEl) {
    const renderPF = (team, isWinner) => {
      const hasDec = awayWon || homeWon;
      const pitched = team.pitchers.filter(p => p.game.pitches > 0);
      const starter = pitched[0];
      const relievers = pitched.slice(1);

      const mkStats = (p, isStarter) => {
        const gs = p.game;
        const ip = gs.outs / 3;
        const ipStr = `${Math.floor(ip)}.${gs.outs % 3}`;
        const whip = ip > 0 ? ((gs.bb + gs.hits) / ip).toFixed(2) : '—';
        const era  = ip > 0 ? ((gs.er * 9) / ip).toFixed(2) : '—';
        const dec = !hasDec ? '' : p === winP ? ' (W)' : p === lossP ? ' (L)' : p === saveP ? ' (SV)' : '';
        if (isStarter) {
          const pitches = gs.strikes + gs.balls;
          const pitchStr = `${pitches} (${gs.strikes}-${gs.balls})`;
          return `
          <div class="pf-name">${p.name}<span class="pf-dec">${dec}</span></div>
          <div class="pf-stats">
            <div class="pf-stat"><span class="pf-lbl">IP</span><span class="pf-val">${ipStr}</span></div>
            <div class="pf-stat"><span class="pf-lbl">Pitches</span><span class="pf-val">${pitchStr}</span></div>
            <div class="pf-stat"><span class="pf-lbl">K</span><span class="pf-val">${gs.k}</span></div>
            <div class="pf-stat"><span class="pf-lbl">BB</span><span class="pf-val">${gs.bb}</span></div>
            <div class="pf-stat"><span class="pf-lbl">WHIP</span><span class="pf-val">${whip}</span></div>
            <div class="pf-stat"><span class="pf-lbl">ERA</span><span class="pf-val">${era}</span></div>
          </div>`;
        } else {
          return `
          <div class="pf-reliever-row">
            <span class="pf-rel-name">${p.name}<span class="pf-dec">${dec}</span></span>
            <span class="pf-rel-stat">${ipStr} IP</span>
            <span class="pf-rel-stat">${gs.k} K</span>
            <span class="pf-rel-stat">${gs.bb} BB</span>
            <span class="pf-rel-stat">ERA ${era}</span>
          </div>`;
        }
      };

      return `
        <div class="pf-half${isWinner ? ' pf-winner' : ''}">
          <div class="pf-team">${team.emoji} ${team.name}</div>
          ${starter ? mkStats(starter, true) : ''}
          ${relievers.length ? `<div class="pf-relievers">${relievers.map(p => mkStats(p, false)).join('')}</div>` : ''}
        </div>`;
    };
    pfEl.innerHTML = renderPF(G.away, awayWon) + renderPF(G.home, homeWon);
    pfEl.style.display = 'flex';
  }
}

function autoResolveDec() {
  if (!pending) return;
  const bi = pendingBi;
  const batting = bi === 0 ? G.away : G.home;
  const li = G.lineupIdx[bi];
  const runner1 = G.bases[0] ? batting.batters[(li + 8) % 9] : null;
  const runner2 = G.bases[1] ? batting.batters[(li + 7) % 9] : null;
  if (pending.some(o => o.id === 'steal2') && runner1 && Math.random() < runner1.sbRate) { resolveDec('steal2', bi); return; }
  if (pending.some(o => o.id === 'steal3') && runner2 && Math.random() < runner2.sbRate * 0.5) { resolveDec('steal3', bi); return; }
  if (pending.some(o => o.id === 'dsteal') && runner1 && runner2 && Math.random() < runner1.sbRate && Math.random() < runner2.sbRate * 0.5) { resolveDec('dsteal', bi); return; }
  resolveDec('play', bi);
}

export function gAuto() {
  if (G.over) return;
  const si = G.inning, sh = G.half;
  function step() {
    if (G.over) return;
    if (pending) { autoResolveDec(); setTimeout(step, 50); return; }
    if (G.inning !== si || G.half !== sh) return;
    simPitch();
    const delay = pendingDelay > 0 ? pendingDelay : pitchDelay; pendingDelay = 0;
    if (!G.over && G.inning === si && G.half === sh) autoT = setTimeout(step, delay);
  }
  step();
}

export function gAutoGame() {
  if (G.over) return;
  function step() {
    if (G.over) return;
    if (pending) { autoResolveDec(); setTimeout(step, 50); return; }
    simPitch();
    const delay = pendingDelay > 0 ? pendingDelay : pitchDelay; pendingDelay = 0;
    if (!G.over) autoT = setTimeout(step, delay);
  }
  step();
}


export function gAutoMulti() {
  const sched = LEAGUE.schedule || [];
  const unplayed = sched.filter(g => !g.played).length;
  if (unplayed === 0) { alert('No unplayed games remaining.'); return; }
  const input = prompt(`How many games to auto-play? (${unplayed} remaining)`);
  const n = parseInt(input);
  if (!n || n < 1) return;
  autoMultiRemaining = Math.min(n, unplayed);
  autoMultiNext();
}

function autoMultiNext() {
  if (autoMultiRemaining <= 0) {
    autoMultiRemaining = 0;
    G.running = false;
    renderSimulate();
    return;
  }
  const sched = LEAGUE.schedule || [];
  const idx = sched.findIndex(g => !g.played);
  if (idx === -1) { autoMultiRemaining = 0; G.running = false; renderSimulate(); return; }
  autoMultiRemaining--;
  schedGameIdx = idx;
  simMode = 'schedule';
  startGame(sched[idx].awayId, sched[idx].homeId);
  function step() {
    if (G.over) return;  // endGame() will call autoMultiNext()
    if (pending) { autoResolveDec(); setTimeout(step, 0); return; }
    simPitch();
    if (!G.over) setTimeout(step, 0);
  }
  step();
}

export function gSetDelay(v) {
  pitchDelay = parseInt(v);
  const bar = document.getElementById('g-delay-bar');
  if (bar) bar.style.width = (pitchDelay / 10) + '%';
  const el = document.getElementById('g-delay-val');
  if (el) el.textContent = pitchDelay ? pitchDelay + 'ms' : 'off';
}

// ── Helpers ──
function pushFeed(icon, label) {
  G.eventFeed.unshift({ icon, label });
  if (G.eventFeed.length > 8) G.eventFeed.length = 8;
}

function getFatigue(pitcher) {
  const pitches = pitcher.game?.pitches || 0;
  if (pitcher.pos === 'SP' || pitcher.pos === 'P') return Math.min(1, pitches / 95); // 100% fatigue at ~95 pitches
  return Math.min(1, pitches / 50);
}

function calcProbs(b, p) {
  const fatigue = getFatigue(p);
  const k  = cl(b.kPct * .6  + p.kPct  * (1 - fatigue * 0.4) * .4, .10, .38);
  const bb = cl(b.bbPct * .6 + p.bbPct * (1 + fatigue * 0.6) * .4, .04, .18);
  const go = cl(b.goPct + (p.goD || 0) * (1 - fatigue * 0.5) * .4, .12, .32);
  const raw = { k, go, fo:b.foPct, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single:b.singlePct * 0.75, dbl:b.doublePct * 0.75, triple:b.triplePct * 0.75, hr:b.hrPct * 0.75 };
  const tot = Object.values(raw).reduce((s, v) => s + v, 0);
  const out = {}; for (const key in raw) out[key] = raw[key] / tot; return out;
}

function rollO(probs) { let r = Math.random(), cum = 0; for (const [k, p] of Object.entries(probs)) { cum += p; if (r < cum) return k; } return 'go'; }
function gTag()  { return `${G.half === 0 ? 'T' : 'B'}${G.inning}`; }
function gOrd(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }

const LOG_ICON_COLOR = { '1B':'#7ecf7e','2B':'#7ecf7e','3B':'#7ecf7e','HR':'#4ab3ff','BB':'#ffcc00','HBP':'#ffcc00','SF':'#ffcc00','R':'#4ab3ff','K':'#cc1111','GO':'#cc1111','FO':'#cc1111','LO':'#cc1111','DP':'#cc1111','E':'#ff8c00' };

function addLog(t, txt, cls, icon = '') {
  const l = document.getElementById('g-log'); if (!l) return;
  const e = document.createElement('div'); e.className = 'lr';
  const iHtml = icon ? `<span class="li" style="color:${LOG_ICON_COLOR[icon]||'#aaa'}">${icon}</span>` : '<span class="li"></span>';
  e.innerHTML = `<span class="lt">${t}</span>${iHtml}<span class="lx ${cls}">${txt}</span>`;
  l.insertBefore(e, l.firstChild);
}

function addDelimiter(style) {
  const l = document.getElementById('g-log'); if (!l) return;
  const e = document.createElement('div'); e.className = `log-delimiter log-delimiter-${style}`;
  l.insertBefore(e, l.firstChild);
}

// ====================================================================
// PLAYOFF HELPERS
// ====================================================================
// Home/Away patterns per series length (index = game number - 1, H=home, A=away)
const PLAYOFF_PATTERNS = {
  3: ['H','H','A'],
  5: ['H','H','A','A','H'],
  7: ['H','H','A','A','H','A','H'],
};

function getGameHomeAway(series, gameNum) {
  const pattern = PLAYOFF_PATTERNS[series.seriesLength] || PLAYOFF_PATTERNS[7];
  const slot = pattern[(gameNum - 1) % pattern.length];
  const homeId = slot === 'H' ? series.higherSeedId : series.lowerSeedId;
  const awayId = slot === 'H' ? series.lowerSeedId  : series.higherSeedId;
  return { homeId, awayId };
}

function getTeamWinPctById(teamId) {
  const t = LEAGUE.teams.find(t => t.id === teamId);
  if (!t) return 0;
  return t.w / ((t.w + t.l) || 1);
}

function advancePlayoffBracket(series) {
  const winner = series.winner;
  if (winner == null) return;
  const p = LEAGUE.playoffs;

  // Wire winner into next series
  if (series.nextSeriesId) {
    const nextSeries = p.series.find(s => s.id === series.nextSeriesId);
    if (nextSeries) {
      if (series.nextSeriesSlot === 'higher') {
        nextSeries.higherSeedId = winner;
      } else if (series.nextSeriesSlot === 'lower') {
        nextSeries.lowerSeedId = winner;
      } else {
        // CS and WS: determine higher/lower by regular season win%
        // For CS: two DS winners compete; for WS: two CS winners compete
        if (nextSeries.higherSeedId === null && nextSeries.lowerSeedId === null) {
          nextSeries.higherSeedId = winner;
        } else if (nextSeries.higherSeedId === null) {
          // Compare with existing team
          const existingPct = getTeamWinPctById(nextSeries.lowerSeedId);
          const winnerPct   = getTeamWinPctById(winner);
          if (winnerPct >= existingPct) {
            nextSeries.higherSeedId = winner;
          } else {
            nextSeries.higherSeedId = winner;
            // swap: existing lower becomes lower, winner becomes higher? No — higher = better record
            // winner has lower pct, so existing lowerSeedId should be higher
            nextSeries.higherSeedId = nextSeries.lowerSeedId;
            nextSeries.lowerSeedId  = winner;
          }
        } else if (nextSeries.lowerSeedId === null) {
          const existingPct = getTeamWinPctById(nextSeries.higherSeedId);
          const winnerPct   = getTeamWinPctById(winner);
          if (winnerPct > existingPct) {
            // winner has better record — becomes new higher seed
            nextSeries.lowerSeedId  = nextSeries.higherSeedId;
            nextSeries.higherSeedId = winner;
          } else {
            nextSeries.lowerSeedId = winner;
          }
        }
      }
    }
  }

  // Check if current round is complete — advance round
  const roundOrder = ['wildCard', 'divSeries', 'champSeries', 'worldSeries'];
  const currentRound = p.round;
  const roundSeries = p.series.filter(s => s.round === currentRound);
  if (roundSeries.every(s => s.winner != null)) {
    const nextRoundIdx = roundOrder.indexOf(currentRound) + 1;
    if (nextRoundIdx < roundOrder.length) {
      p.round = roundOrder[nextRoundIdx];
    } else {
      p.round = 'complete';
    }
  }
}

function playoffAutoNext() {
  if (!LEAGUE.playoffs) return;
  const p = LEAGUE.playoffs;

  // Resolve active series index
  let sIdx = p.activeSeriesIdx;
  if (sIdx === null || sIdx === undefined) {
    // Series just finished — find next unfinished in current round (for autoAll)
    if (!p._autoAll) { playoffSeriesAutoRemaining = 0; window.nav('playoffs'); return; }
    const idx = p.series.findIndex(s => s.round === p.round && s.winner == null && s.higherSeedId != null && s.lowerSeedId != null);
    if (idx === -1) { playoffSeriesAutoRemaining = 0; p._autoAll = false; saveLeague(); window.nav('playoffs'); return; }
    sIdx = idx;
    p.activeSeriesIdx = sIdx;
    // Reset counter for the new series
    playoffSeriesAutoRemaining = p.series[sIdx].seriesLength;
  }

  const series = p.series[sIdx];
  if (!series || series.winner != null) {
    playoffSeriesAutoRemaining = 0;
    p.activeSeriesIdx = null;
    saveLeague();
    window.nav('playoffs');
    return;
  }

  if (playoffSeriesAutoRemaining <= 0) {
    p.activeSeriesIdx = null;
    saveLeague();
    window.nav('playoffs');
    return;
  }
  playoffSeriesAutoRemaining--;

  const gameNum = series.games.length + 1;
  const { homeId, awayId } = getGameHomeAway(series, gameNum);
  simMode = 'playoffs';
  startGame(awayId, homeId);
  function step() {
    if (G.over) return;
    if (pending) { autoResolveDec(); setTimeout(step, 0); return; }
    simPitch();
    if (!G.over) setTimeout(step, 0);
  }
  step();
}

export function playoffPlayNext(seriesIdx) {
  if (!LEAGUE.playoffs) return;
  const p = LEAGUE.playoffs;
  const series = p.series[seriesIdx];
  if (!series || series.winner != null || series.higherSeedId == null || series.lowerSeedId == null) return;
  p.activeSeriesIdx = seriesIdx;
  p._autoAll = false;
  playoffSeriesAutoRemaining = 0;
  saveLeague();
  const gameNum = series.games.length + 1;
  const { homeId, awayId } = getGameHomeAway(series, gameNum);
  simMode = 'playoffs';
  window.nav('simulate');
  startGame(awayId, homeId);
}

export function playoffAutoSeries(seriesIdx) {
  if (!LEAGUE.playoffs) return;
  const p = LEAGUE.playoffs;
  const series = p.series[seriesIdx];
  if (!series || series.winner != null || series.higherSeedId == null || series.lowerSeedId == null) return;
  p.activeSeriesIdx = seriesIdx;
  p._autoAll = false;
  playoffSeriesAutoRemaining = series.seriesLength;
  saveLeague();
  playoffAutoNext();
}

export function playoffAutoAll() {
  if (!LEAGUE.playoffs) return;
  const p = LEAGUE.playoffs;
  if (p.round === 'complete') { window.nav('playoffs'); return; }
  const nextIdx = p.series.findIndex(s => s.round === p.round && s.winner == null && s.higherSeedId != null && s.lowerSeedId != null);
  if (nextIdx === -1) { window.nav('playoffs'); return; }
  p.activeSeriesIdx = nextIdx;
  p._autoAll = true;
  playoffSeriesAutoRemaining = p.series[nextIdx].seriesLength;
  saveLeague();
  playoffAutoNext();
}
