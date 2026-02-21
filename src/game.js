import { MLB } from './data.js';
import { ri, cl, battingAvg, setText, mkEl } from './utils.js';
import { LEAGUE, saveLeague } from './league.js';

// ====================================================================
// GAME STATE
// ====================================================================
export let G = {};
let dragSrc2 = null;
let pending = null;
let autoT = null;
let msgT = null;
let pendingDelay = 0;
let awayTeamId = null;
let pitchDelay = 0;
let homeTeamId = null;
let gLineupView = 0;

// ====================================================================
// SIMULATE PAGE ENTRY POINT
// ====================================================================
export function renderSimulate() {
  const cont = document.getElementById('sim-container');
  if (!G.running) {
    // Show team picker
    const opts = LEAGUE.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    cont.innerHTML = `
      <div class="matchup-picker">
        <div class="section-title">New Game</div>
        <div class="mp-row">
          <div class="mp-label">Away</div>
          <select class="mp-select" id="sel-away">${opts}</select>
        </div>
        <div class="mp-row">
          <div class="mp-label">Home</div>
          <select class="mp-select" id="sel-home">${opts}</select>
        </div>
        <div style="margin-top:8px">
          <button class="btn primary" onclick="startGame()">Play Ball!</button>
        </div>
      </div>
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
    // Default to different teams
    if (LEAGUE.teams.length >= 2) {
      document.getElementById('sel-home').selectedIndex = 1;
    }
  } else {
    renderGameUI();
  }
}

export function startGame() {
  const awayId = parseInt(document.getElementById('sel-away').value);
  const homeId = parseInt(document.getElementById('sel-home').value);
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
    lineupIdx:[0,0], over:false,
    boxBatters:[{},{}], boxPitchers:[{},{}],
  };
  away.activePitcher = 0; home.activePitcher = 0;
  [away, home].forEach(team => team.pitchers.forEach(p => { p.game = { strikes:0, balls:0, hits:0, bb:0, er:0, outs:0 }; }));

  renderGameUI();
  addLog('Game', `${away.name} vs ${home.name} — Play ball!`, '');
}

// Wrapper for the "New Matchup" button — resets game and shows picker
export function newMatchup() {
  G.running = false;
  renderSimulate();
}

function renderGameUI() {
  const away = G.away, home = G.home;
  document.getElementById('sim-container').innerHTML = `
  <div class="sim-layout">
  <div class="sim-main">

    <div class="scoreboard">
      <div class="score-header">
        <div></div>
        <div style="text-align:center">1</div><div style="text-align:center">2</div><div style="text-align:center">3</div>
        <div style="text-align:center">4</div><div style="text-align:center">5</div><div style="text-align:center">6</div>
        <div style="text-align:center">7</div><div style="text-align:center">8</div><div style="text-align:center">9</div>
        <div style="text-align:center">R</div><div style="text-align:center">H</div><div style="text-align:center">E</div>
      </div>
      <div class="score-row" id="g-row-away"><div style="font-family:'Playfair Display',serif;font-size:0.92rem;font-weight:700">${away.emoji} ${away.name}</div></div>
      <div class="score-row" id="g-row-home"><div style="font-family:'Playfair Display',serif;font-size:0.92rem;font-weight:700">${home.emoji} ${home.name}</div></div>
    </div>

    <div class="runners-bar">
      <div class="field-row">
        <div class="ballpark">
          <div class="base s" id="g-b2"></div>
          <div class="base t" id="g-b3"></div>
          <div class="base f" id="g-b1"></div>
        </div>
        <div class="field-scoreboard" id="g-field-scoreboard">
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
      <button class="btn" id="g-btn-auto" onclick="gAuto()">Auto-Play Inning</button>
      <button class="btn" id="g-btn-game" onclick="gAutoGame()">Auto-Play Game</button>
      <button class="btn" onclick="newMatchup()">New Matchup</button>
      <button class="btn controls-settings" onclick="gToggleSettings()">⚙ Settings</button>
    </div>
    <div id="g-settings-panel" class="settings-panel" style="display:none">
      <div class="settings-row">
        <span class="settings-label">Delay Speed</span>
        <input type="range" min="0" max="3000" step="300" value="${pitchDelay}" oninput="gSetDelay(this.value)" class="speed-slider">
        <span id="g-delay-val" class="settings-val">${pitchDelay}ms</span>
      </div>
    </div>

    <div class="game-over" id="g-over">
      <h2 id="g-over-w"></h2><p id="g-over-s"></p>
    </div>

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
function gRenderAll() { gRenderSB(); gRenderStatus(); gRenderPlayers(); gRenderLineup(); gRenderPitchers(); }

function gRenderSB() {
  [G.away, G.home].forEach((team, si) => {
    const row = document.getElementById(`g-row-${si === 0 ? 'away' : 'home'}`);
    if (!row) return;
    while (row.children.length > 1) row.removeChild(row.lastChild);
    for (let i = 0; i < 9; i++) {
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
  team.batters.forEach((b, idx) => {
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
    row.onclick = () => { team.activePitcher = i; addLog(gTag(), `Manager brings in ${p.name}.`, 't-manage'); gRenderAll(); };
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

function showScoreboardMsg(text, ms = 1800) {
  const el = document.getElementById('g-sb-msg');
  const tx = document.getElementById('g-sb-msg-text');
  if (!el || !tx) return;
  if (msgT) clearTimeout(msgT);
  tx.textContent = text;
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
  const bi = G.half, fi = 1 - bi;
  const batting  = bi === 0 ? G.away : G.home, fielding = fi === 0 ? G.away : G.home;
  const batter  = batting.batters[G.lineupIdx[bi]];
  const pitcher = fielding.pitchers[fielding.activePitcher];
  const probs = calcProbs(batter, pitcher);

  if (Math.random() < 0.11 && G.strikes < 2) { G.strikes++; pitcher.game.strikes++; addLog(gTag(), `Foul ball. Count: ${G.balls}-${G.strikes}.`, 't-info'); gRenderAll(); return; }
  const ballChance = cl(0.20 * ((batter.bbPct * 0.6 + pitcher.bbPct * 0.4) / 0.081), 0.08, 0.35);
  if (Math.random() < ballChance && G.balls < 4) { G.balls++; pitcher.game.balls++; addLog(gTag(), `Ball ${G.balls}. Count: ${G.balls}-${G.strikes}.`, 't-info'); if (G.balls >= 4) { doWalk(batter, pitcher, bi, fielding); return; } gRenderAll(); return; }
  if (Math.random() < 0.10 && G.strikes < 3) {
    G.strikes++; pitcher.game.strikes++;
    if (G.strikes >= 3) {
      G.balls = 0; G.strikes = 0;
      batter.career.pa = (batter.career.pa || 0) + 1;
      pitcher.career.k++; batter.career.k++;
      addLog(gTag(), `Called strike 3. ${batter.name} struck out looking! ⚡`, 't-k');
      showScoreboardMsg('STRIKE OUT!', 1500);
      nextB(bi); recOut(bi); gRenderAll(); return;
    }
    addLog(gTag(), `Called strike ${G.strikes}. Count: ${G.balls}-${G.strikes}.`, 't-info'); gRenderAll(); return;
  }
  const swingMissChance = cl(pitcher.kPct * 0.45 + batter.kPct * 0.3, 0.05, 0.20);
  if (Math.random() < swingMissChance && G.strikes < 3) {
    G.strikes++; pitcher.game.strikes++;
    if (G.strikes >= 3) {
      G.balls = 0; G.strikes = 0;
      batter.career.pa = (batter.career.pa || 0) + 1;
      pitcher.career.k++; batter.career.k++;
      addLog(gTag(), `Swings through strike 3. ${batter.name} struck out swinging! ⚡`, 't-k');
      showScoreboardMsg('STRIKE OUT!', 1500);
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
      batter.career.pa = (batter.career.pa || 0) + 1;
      pitcher.career.k++; batter.career.k++;
      addLog(gTag(), `${batter.name} strikes out. ⚡`, 't-k');
      showScoreboardMsg('STRIKE OUT!', 1500);
      nextB(bi); recOut(bi); gRenderAll(); return;
    }
    addLog(gTag(), `Strike ${G.strikes}. Count: ${G.balls}-${G.strikes}.`, 't-info');
    gRenderAll(); return;
  }

  G.balls = 0; G.strikes = 0;

  // Update batter PA
  batter.career.pa = (batter.career.pa || 0) + 1;

  switch (outcome) {
    case 'go': {
      batter.career.ab++; pitcher.game.strikes++;
      if (G.bases[0] && G.outs < 2 && Math.random() < .28) { addLog(gTag(), `${batter.name} hits into a double play!`, 't-out'); showScoreboardMsg('DOUBLE PLAY!', 1800); G.bases[0] = false; nextB(bi); recOut(bi); if (!G.over && G.outs < 3) recOut(bi); }
      else { const t = ['grounds to short','grounds out to second','bounces to third']; addLog(gTag(), `${batter.name} ${t[ri(t.length)]}.`, 't-out'); showScoreboardMsg('GROUND OUT', 1200); nextB(bi); recOut(bi); }
      break;
    }
    case 'fo': {
      batter.career.ab++; pitcher.game.strikes++;
      const t = ['flies out to center','pops to right','lofts one to left — caught']; addLog(gTag(), `${batter.name} ${t[ri(t.length)]}.`, 't-out');
      if (G.bases[2] && G.outs < 2 && Math.random() < .72) { G.bases[2] = false; scoreRun(bi); addRunLog(bi, 1); showScoreboardMsg('SAC FLY!', 1800); } else { showScoreboardMsg('FLY OUT', 1200); }
      nextB(bi); recOut(bi); break;
    }
    case 'lo': {
      batter.career.ab++; pitcher.game.strikes++;
      const t = ['lines out to short','ropes one to second — OUT','lasers one to center — caught!']; addLog(gTag(), `${batter.name} ${t[ri(t.length)]}.`, 't-out'); showScoreboardMsg('LINE OUT', 1200); nextB(bi); recOut(bi); break;
    }
    case 'hbp': { batter.career.bb++; batter.career.pa++; pitcher.game.bb++; pitcher.game.balls++; addLog(gTag(), `${batter.name} hit by pitch.`, 't-hit'); showScoreboardMsg('HIT BY PITCH', 1800); const rbH = G.runs[bi]; advR(1, bi, false); addRunLog(bi, G.runs[bi] - rbH); nextB(bi); break; }
    case 'single': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.pa++; pitcher.game.hits++; pitcher.game.strikes++;
      addLog(gTag(), `${batter.name} singles!`, 't-hit'); showScoreboardMsg('SINGLE!', 1500);
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
        addRunLog(bi, G.runs[bi] - rb1);
      } else {
        const rb1 = G.runs[bi]; advR(1, bi, true); addRunLog(bi, G.runs[bi] - rb1);
      }
      nextB(bi); break;
    }
    case 'dbl': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.doubles = (batter.career.doubles || 0) + 1; pitcher.game.hits++; pitcher.game.strikes++;
      addLog(gTag(), `${batter.name} doubles!`, 't-hit'); showScoreboardMsg('DOUBLE!!', 1800);
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
        addRunLog(bi, G.runs[bi] - rb2);
      } else {
        const rb2 = G.runs[bi]; advR(2, bi, true); addRunLog(bi, G.runs[bi] - rb2);
      }
      nextB(bi); break;
    }
    case 'triple': { G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.triples = (batter.career.triples || 0) + 1; pitcher.game.hits++; pitcher.game.strikes++; addLog(gTag(), `${batter.name} TRIPLES!`, 't-hit'); showScoreboardMsg('TRIPLE!!!', 2200); const rb3 = G.runs[bi]; advR(3, bi, true); addRunLog(bi, G.runs[bi] - rb3); nextB(bi); break; }
    case 'hr': {
      G.hits[bi]++; batter.career.ab++; batter.career.h++; batter.career.hr++; pitcher.game.hits++; pitcher.game.strikes++;
      const ob = G.bases.filter(Boolean).length;
      addLog(gTag(), `${batter.name} HOMERS! ${ob+1} run${ob+1 > 1 ? 's' : ''} score! 💥`, 't-score'); flashMsg('HOME RUN!!', 3, 400, 200, 1000);
      G.bases = [false,false,false];
      for (let r = 0; r <= ob; r++) { scoreRun(bi); batter.career.rbi = (batter.career.rbi || 0) + 1; }
      nextB(bi); break;
    }
  }
  gRenderAll();
}

function doWalk(batter, pitcher, bi, fielding) {
  pitcher.career.bb++; batter.career.bb++; batter.career.pa++; pitcher.game.bb++;
  addLog(gTag(), `${batter.name} draws a walk.`, 't-hit'); showScoreboardMsg('WALK', 1500);
  const rbW = G.runs[bi]; advR(1, bi, false); addRunLog(bi, G.runs[bi] - rbW); nextB(bi); G.balls = 0; G.strikes = 0;
  gRenderAll();
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
  pending = opts;
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
  switch (id) {
    case 'play':   addLog(gTag(), 'Manager plays it straight.', 't-manage'); break;
    case 'steal2': { const ok = Math.random() < .68; addLog(gTag(), `🏃 ${ok ? 'SAFE! Runner takes 2nd!' : 'CAUGHT STEALING!'}`, ok ? 't-hit' : 't-out'); if (ok) { G.bases[0] = false; G.bases[1] = true; } else { G.bases[0] = false; recOut(bi); } break; }
    case 'dsteal': { const a = Math.random() < .64, b2 = Math.random() < .64; if (a && b2) { addLog(gTag(), '🏃🏃 Double steal — BOTH SAFE!', 't-hit'); G.bases[0] = false; G.bases[1] = true; G.bases[2] = true; } else if (a) { addLog(gTag(), 'Lead runner safe, trailing caught!', 't-out'); G.bases[0] = false; G.bases[2] = true; recOut(bi); } else { addLog(gTag(), 'Double steal botched!', 't-out'); G.bases[0] = false; G.bases[1] = false; recOut(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'steal3': { const ok = Math.random() < .64; addLog(gTag(), `🏃 Steal of 3rd — ${ok ? 'SAFE!' : 'CAUGHT!'}`, ok ? 't-hit' : 't-out'); if (ok) { G.bases[1] = false; G.bases[2] = true; } else { G.bases[1] = false; recOut(bi); } break; }
    case 'bunt':   { const ok = Math.random() < .87; if (ok) { addLog(gTag(), '📦 Sac bunt — runners advance.', 't-manage'); if (G.bases[2]) { G.bases[2] = false; scoreRun(bi); } if (G.bases[1]) { G.bases[2] = true; G.bases[1] = false; } if (G.bases[0]) { G.bases[1] = true; G.bases[0] = false; } nextB(bi); recOut(bi); } else { addLog(gTag(), '📦 Bunt popped up — double play!', 't-out'); if (G.bases[0]) { G.bases[0] = false; recOut(bi); } nextB(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'squeeze':{ const ok = Math.random() < .70; addLog(gTag(), `🎯 Suicide squeeze — ${ok ? 'SCORES!' : 'POPPED UP — double play!'}`, ok ? 't-score' : 't-out'); if (ok) { G.bases[2] = false; scoreRun(bi); addRunLog(bi, 1); nextB(bi); recOut(bi); } else { G.bases[2] = false; nextB(bi); recOut(bi); if (!G.over && G.outs < 3) recOut(bi); } break; }
    case 'hitrun': { const ok = Math.random() < .72; if (ok) { addLog(gTag(), '✅ Hit and run — contact! Runner takes extra base.', 't-hit'); G.hits[G.half]++; const bat = (G.half === 0 ? G.away : G.home).batters[G.lineupIdx[G.half]]; bat.career.h++; bat.career.ab++; advR(2, bi, true); nextB(bi); } else { addLog(gTag(), '❌ Hit and run — miss! Runner caught.', 't-out'); G.bases[0] = false; recOut(bi); } break; }
  }
  gRenderAll();
}

function scoreRun(bi) {
  G.runs[bi]++;
  const fldTeam = bi === 0 ? G.home : G.away;
  fldTeam.pitchers[fldTeam.activePitcher].game.er++;
}

function addRunLog(bi, n) {
  if (n <= 0) return;
  const s = n === 1 ? '1 run scores' : `${n} runs score`;
  addLog(gTag(), `${s}. ${G.away.name} ${G.runs[0]}–${G.runs[1]} ${G.home.name}.`, 't-score');
}

function advR(bases, bi, batterAdv) {
  let scored = 0, nb = [false,false,false];
  if (batterAdv) { for (let b = 2; b >= 0; b--) { if (G.bases[b]) { const d = b + bases; if (d >= 3) scored++; else nb[d] = true; } } const d = bases - 1; if (d >= 3) scored++; else nb[d] = true; }
  else { nb[0] = true; if (G.bases[0]) { nb[1] = true; if (G.bases[1]) { nb[2] = true; if (G.bases[2]) scored++; } } }
  G.bases = nb;
  for (let i = 0; i < scored; i++) scoreRun(bi);
}

function nextB(bi) { G.lineupIdx[bi] = (G.lineupIdx[bi] + 1) % 9; }

function recOut(bi) {
  if (G.over) return;
  const fldTeam = bi === 0 ? G.home : G.away;
  fldTeam.pitchers[fldTeam.activePitcher].game.outs++;
  G.outs++; if (G.outs >= 3) endHalf(bi);
}

function endHalf(bi) {
  const ir = G.runs[bi] - G.runsStart[bi];
  G.score[bi][G.inning - 1] = ir;
  G.bases = [false,false,false]; G.balls = 0; G.strikes = 0; G.outs = 0;
  if (bi === 0) {
    addDelimiter('dotted'); addLog(`End T${G.inning}`, `${G.away.name} ${G.runs[0]}, ${G.home.name} ${G.runs[1]}.`, 't-info');
    if (G.inning >= 9 && G.runs[1] > G.runs[0]) { endGame(); return; }
    G.half = 1; G.runsStart[1] = G.runs[1];
  }
  else {
    addDelimiter('solid'); addLog(`End B${G.inning}`, `${G.away.name} ${G.runs[0]}, ${G.home.name} ${G.runs[1]}.`, 't-info');
    if (G.inning >= 9 && G.runs[0] !== G.runs[1]) { endGame(); return; }
    if (G.inning >= 12) { endGame(); return; }
    G.inning++; G.half = 0; G.runsStart[0] = G.runs[0];
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

  // Archive pitcher stats (active pitchers)
  [G.away, G.home].forEach((team, ti) => {
    const p = team.pitchers[team.activePitcher];
    const ipThisGame = G.inning - (G.half === ti ? 0 : 1) + (ti === 1 && G.half === 1 ? 0 : 0);
    p.career.ip += Math.max(1, ipThisGame);
    p.career.g++;
    p.career.er += Math.round(G.runs[1 - ti] * 0.85);
    if (awayWon && ti === 0)      { p.career.w++; }
    else if (homeWon && ti === 1) { p.career.w++; }
    else if (awayWon && ti === 1) { p.career.l++; }
    else if (homeWon && ti === 0) { p.career.l++; }
  });

  saveLeague();
  G.running = false;

  const el = document.getElementById('g-over'); if (el) el.style.display = 'block';
  setText('g-over-w', w === 'Tie' ? 'Final — Tie' : `${w} Win!`);
  setText('g-over-s', `${G.away.name} ${G.runs[0]} — ${G.home.name} ${G.runs[1]}`);
  const sbtn = document.getElementById('g-btn-single'); if (sbtn) sbtn.disabled = true;
  const btn = document.getElementById('g-btn-pitch'); if (btn) btn.disabled = true;
  const abtn = document.getElementById('g-btn-auto');  if (abtn) abtn.disabled = true;
  const gbtn = document.getElementById('g-btn-game');  if (gbtn) gbtn.disabled = true;

  const winTeam = awayWon ? G.away : homeWon ? G.home : null;
  if (winTeam) {
    const wp = winTeam.pitchers[winTeam.activePitcher];
    const gs = wp.game;
    const ip = gs.outs / 3;
    const ipStr = `${Math.floor(ip)}.${gs.outs % 3}`;
    const whip = ip > 0 ? ((gs.bb + gs.hits) / ip).toFixed(2) : '—';
    const era  = ip > 0 ? ((gs.er * 9) / ip).toFixed(2) : '—';
    const el = document.getElementById('g-sb-final');
    if (el) {
      el.innerHTML = `
        <div class="sbf-title">Winning Pitcher</div>
        <div class="sbf-name">${wp.name}</div>
        <div class="sbf-stats">
          <div class="sbf-stat"><span class="sbf-lbl">Strikes</span><span class="sbf-val">${gs.strikes}</span></div>
          <div class="sbf-stat"><span class="sbf-lbl">Balls</span><span class="sbf-val">${gs.balls}</span></div>
          <div class="sbf-stat"><span class="sbf-lbl">IP</span><span class="sbf-val">${ipStr}</span></div>
          <div class="sbf-stat"><span class="sbf-lbl">WHIP</span><span class="sbf-val">${whip}</span></div>
          <div class="sbf-stat"><span class="sbf-lbl">ERA</span><span class="sbf-val">${era}</span></div>
        </div>`;
      el.style.display = 'flex';
    }
  }
}

export function gAuto() {
  if (G.over) return;
  const si = G.inning;
  function step() {
    if (G.over || pending) return;
    if (G.inning !== si) return;
    simPitch();
    const delay = pendingDelay > 0 ? pendingDelay : pitchDelay; pendingDelay = 0;
    if (!G.over && !pending && G.inning === si) autoT = setTimeout(step, delay);
  }
  step();
}

export function gAutoGame() {
  if (G.over) return;
  function step() {
    if (G.over || pending) return;
    simPitch();
    const delay = pendingDelay > 0 ? pendingDelay : pitchDelay; pendingDelay = 0;
    if (!G.over && !pending) autoT = setTimeout(step, delay);
  }
  step();
}

export function gToggleSettings() {
  const panel = document.getElementById('g-settings-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

export function gSetDelay(v) {
  pitchDelay = parseInt(v);
  const el = document.getElementById('g-delay-val');
  if (el) el.textContent = v + 'ms';
}

// ── Helpers ──
function calcProbs(b, p) {
  const k  = cl(b.kPct * .6  + p.kPct  * .4, .10, .38);
  const bb = cl(b.bbPct * .6 + p.bbPct * .4, .04, .16);
  const go = cl(b.goPct + (p.goD || 0) * .4,  .12, .32);
  const raw = { k, go, fo:b.foPct, lo:MLB.lo, walk:bb, hbp:MLB.hbp, single:b.singlePct, dbl:b.doublePct, triple:b.triplePct, hr:b.hrPct };
  const tot = Object.values(raw).reduce((s, v) => s + v, 0);
  const out = {}; for (const key in raw) out[key] = raw[key] / tot; return out;
}

function rollO(probs) { let r = Math.random(), cum = 0; for (const [k, p] of Object.entries(probs)) { cum += p; if (r < cum) return k; } return 'go'; }
function gTag()  { return `${G.half === 0 ? 'T' : 'B'}${G.inning}`; }
function gOrd(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }

function addLog(t, txt, cls) {
  const l = document.getElementById('g-log'); if (!l) return;
  const e = document.createElement('div'); e.className = 'lr';
  e.innerHTML = `<span class="lt">${t}</span><span class="lx ${cls}">${txt}</span>`;
  l.insertBefore(e, l.firstChild);
}

function addDelimiter(style) {
  const l = document.getElementById('g-log'); if (!l) return;
  const e = document.createElement('div'); e.className = `log-delimiter log-delimiter-${style}`;
  l.insertBefore(e, l.firstChild);
}
