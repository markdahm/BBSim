# ◆ Diamond League — Baseball Simulator

A browser-based baseball league manager and game simulator. Manage 30 teams across two leagues, build schedules, simulate pitch-by-pitch games, and track career stats — all stored locally in the browser.

---

## Running

```bash
npm install
npm run dev       # browser-sync on http://localhost:3001
# or
npm run serve     # python3 http.server on port 8000
```

ES modules require a server; opening `index.html` directly via `file://` will not work.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Simulation Engine](#simulation-engine)
   - [Pitch Outcome Probabilities](#pitch-outcome-probabilities)
   - [At-Bat Resolution](#at-bat-resolution)
   - [Baserunning & Advancement](#baserunning--advancement)
   - [Stolen Bases](#stolen-bases)
   - [Pitcher Fatigue & Substitution](#pitcher-fatigue--substitution)
   - [Win / Loss / Save Determination](#win--loss--save-determination)
   - [End-of-Inning Logic](#end-of-inning-logic)
   - [Regular Season vs. Playoffs](#regular-season-vs-playoffs)
3. [Player Generation](#player-generation)
   - [Batter Archetypes](#batter-archetypes)
   - [Pitcher Archetypes](#pitcher-archetypes)
4. [Stat Formulas](#stat-formulas)
5. [Season Management](#season-management)
6. [Playoff Bracket](#playoff-bracket)
7. [Season History & Archiving](#season-history--archiving)
8. [Season Score](#season-score)
9. [Module Reference](#module-reference)
10. [Dependency Graph](#dependency-graph)
11. [Data Persistence](#data-persistence)

---

## Project Structure

```
index.html        — App shell, page layouts, overlay HTML
styles.css        — All CSS (dark theme, scoreboard, cards, etc.)
app.js            — Entry point: imports modules, exposes window globals, boots app
src/
  data.js         — Static constants: MLB outcome rates, archetypes, team/league structure
  utils.js        — Pure helpers, DOM utilities, stat calculations
  league.js       — League state, player factories, persistence, roster import/export
  views.js        — Navigation, all page renders, player cards, schedule builder
  game.js         — Game engine: pitch simulation, scoring, manager decisions, game UI
  history.js      — Season archive export/import, history table, season score calculation
```

---

## Simulation Engine

### Pitch Outcome Probabilities

Every pitch is resolved by `calcProbs(batter, pitcher)`. Raw outcome weights are computed then normalised to sum to 1.

#### Fatigue

| Role | Formula | Reaches 100% at |
|------|---------|----------------|
| SP / P (starters) | `min(1, pitches / 95)` | ~95 pitches |
| RP / CL (relievers) | `min(1, pitches / 50)` | ~50 pitches |

Fatigue degrades a pitcher's effectiveness: strikeouts fall, walks rise.

#### K%, BB%, GO% — adjusted for fatigue

```
K%  = clamp( batter.kPct × 0.60  +  pitcher.kPct  × (1 − fatigue × 0.40) × 0.40,  0.10, 0.38 )
BB% = clamp( batter.bbPct × 0.60 +  pitcher.bbPct × (1 + fatigue × 0.60) × 0.40,  0.04, 0.18 )
GO% = clamp( batter.goPct        +  pitcher.goD   × (1 − fatigue × 0.50) × 0.40,  0.12, 0.32 )
```

- Batter rate contributes **60%**; pitcher rate contributes **40%**.
- Fatigue reduces pitcher strikeout contribution and *increases* walk contribution.

#### Hit rate

```
contactRate = clamp( 0.240 − batter.kPct × 0.240,  0.130, 0.230 )
speedFactor = clamp( batter.sbRate / 0.15,  0, 1 )
speedBonus  = (speedFactor − 0.5) × 0.020          // ±0.010 at extremes
hitRate     = clamp( contactRate + speedBonus,       0.120, 0.250 )
```

Speed (stolen-base rate) adds up to ~+0.010 to hit rate for elite runners.

#### Hit-type distribution

Hit types (1B, 2B, 3B, HR) are drawn proportionally from the batter's archetype weights then normalised against `hitRate`. A speed-bonus single is added before normalisation. All final outcomes — K, GO, FO, LO, Walk, HBP, 1B, 2B, 3B, HR — are normalised to sum to 1.0.

League baselines: FO ≈ 0.18, LO = 0.025, HBP = 0.009.

---

### At-Bat Resolution

Pitches are simulated one at a time, building the count until a terminal event occurs.

#### Count building

| Event | Probability / condition |
|-------|------------------------|
| Foul ball | ~11% when strikes < 2 |
| Ball | `clamp(0.20 × (BB% / 0.081), 0.08, 0.42)`; 4 balls → walk |
| Called strike | ~10% when strikes < 3; 3 strikes → K (looking) |
| Swinging strike | `clamp(pitcher.kPct × 0.45 + batter.kPct × 0.30, 0.05, 0.20)`; 3 strikes → K (swinging) |

Once balls = 4 or strikes = 3, or a batted ball occurs, the at-bat resolves via the normalised probability table.

#### Outcome effects

| Outcome | Effect |
|---------|--------|
| **Ground out** | 7% error chance (batter safe, unearned run possible); 28% DP chance with runner on 1st and < 2 outs; otherwise normal out, runners advance one base |
| **Fly out** | 4% error chance; 72% sac-fly if runner on 3rd and < 2 outs (runner scores, batter out) |
| **Line out** | 5% error chance |
| **HBP** | Force-advances all runners; batter to 1st (earned) |
| **Walk** | Force-advances all runners; batter to 1st (earned) |
| **Single** | Runner on 3rd scores; runner on 2nd scores with 2 outs based on speed check (25–90%); batter to 1st |
| **Double** | Runners on 2nd/3rd score; runner on 1st scores based on speed and outs (25–85%); batter to 2nd |
| **Triple** | All runners score; batter to 3rd |
| **Home run** | All runners + batter score (all earned) |

---

### Baserunning & Advancement

#### Force advance (walk, HBP)

Runners cascade forward only when forced by an occupied base behind them. Unforced runners hold.

#### Hit-based advancement

- **Single (+1 base):** Runner on 2nd scores with 2 outs at 25–90% depending on `sbRate`. Runner on 1st advances to 2nd.
- **Double (+2 bases):** Runner on 1st scores at 25–85% depending on outs and speed.
- **Triple / HR:** All runners score unconditionally.

#### Extra-base stretch (`tryExtraBase`)

After reaching base a runner may attempt one additional base:

| Stretch | Formula | Max probability |
|---------|---------|----------------|
| Single → Double | `(speedFactor − 0.55) × 0.30` | ~13% at elite speed |
| Double → Triple | `(speedFactor − 0.70) × 0.20` | ~6% at elite speed |

`speedFactor = clamp(sbRate / 0.15, 0, 1)`. Only activates above the speed threshold.

---

### Stolen Bases

Auto-steal attempts trigger at the start of each plate appearance when eligible runners are on base.

#### Attempt probability

```
if sbRate < 0.112:  spBase = min(sbRate × 4, 0.65) × 0.25
else:               spBase = min(sbRate × 4, 0.65)
```

#### Success rates

```
Steal of 2nd:  clamp( 0.54 + (sbRate / 0.25) × 0.32,  0.50, 0.86 )
Steal of 3rd:  clamp( 0.50 + (sbRate / 0.25) × 0.30,  0.46, 0.82 )
```

#### Scenarios

| Situation | Attempt probability | Notes |
|-----------|-------------------|-------|
| Runner on 1st only | `random < spBase` | Standard steal of 2nd |
| Runner on 2nd only | `random < spBase × 0.50` | Steal of 3rd (half as likely) |
| Runners on 1st & 2nd | `random < spBase(r1) AND random < spBase(r2) × 0.50` | Double steal; if trailing runner is caught, leading runner still advances |

---

### Pitcher Fatigue & Substitution

#### Pull thresholds

**Starter (SP / P):**
- Innings 1–8: Pull probability ramps linearly from 0% at 65 pitches to 100% at 100 pitches.
  ```
  pullProb = clamp( (pitches − 65) / 35,  0, 1 )
  ```
- Inning 9+: Attempt complete game. Only pulled if fatigue ≥ 95% and a random check fires.

**Reliever (RP):**
- Pulled when fatigue > 90% or forced by substitution logic.

#### Substitution (`checkFatigueAndSub`)

Replacement candidates are selected in priority order:
1. RP with fatigue < 100%
2. Any non-SP, non-CL with fatigue < 100%
3. Any available pitcher including CL (last resort)

Among eligible candidates the one with the **fewest career games** is chosen. Entry score (run state at the moment of entry) is recorded on the incoming pitcher for save-eligibility tracking.

#### Closer situation (`checkCloserSituation`)

Triggered at the end of innings 8+ when the leading team holds a 1–3 run advantage:
- ~50% activation rate per qualifying situation.
- Selects the CL with the lowest fatigue.
- If the current pitcher is already a CL with fatigue < 70%, they remain in.

---

### Win / Loss / Save Determination

Pitcher decisions follow MLB rules and are awarded at the end of each game. **Playoff games do not award decisions** — W/L/SV/SVO only accrue during the regular season.

#### Winning Pitcher

1. Walk the scoring log to find the *decisive run*: the last time the winning team moved from non-leading to leading.
2. The pitcher on the mound for the winning team at that moment is the WP candidate.
3. **Starter qualification:** If the WP candidate is a starter and pitched fewer than 5 innings (< 15 recorded outs) while other pitchers also appeared, the W passes to the first reliever used.

#### Losing Pitcher

The pitcher on the mound for the losing team when the decisive run scored. Fallback: the last pitcher used by the losing team.

#### Save

Awarded to the final pitcher on the winning team when **all** of the following are true:
- Not the winning pitcher.
- Has the CL position.
- Pitched at least one pitch.
- Entered with a lead of 1–3 runs, **or** entered with any positive lead and recorded 3+ outs.

#### Save Opportunity (SVO)

Credited to any pitcher entering with a 1–3 run lead regardless of outcome (includes blown saves and holds).

#### Complete Game / Shutout

- **CG:** Exactly one pitcher was used by the team for the entire game.
- **SHO:** CG + opponent scored 0 runs + team won.

---

### End-of-Inning Logic

1. Half-inning ends after 3 outs.
2. Runs scored are written into the line-score array for the current inning.
3. Bases and count reset; half flips (Top ↔ Bottom).
4. After the end of inning 8+ (top half): closer situation is evaluated.
5. After each half: fatigue is checked; substitution fires if threshold is exceeded.

#### Game-ending conditions

- **After top of inning ≥ 9:** If the home team leads, game ends immediately (no bottom half played).
- **After bottom of inning ≥ 9:** If scores differ, game over. Otherwise extra innings continue indefinitely.

---

### Regular Season vs. Playoffs

| Stat / action | Regular season | Playoffs |
|---------------|---------------|----------|
| Team W / L | Updated | **Not updated** |
| Team runs for / against | Updated | **Not updated** |
| `gamesPlayed` counter | Incremented | **Not incremented** |
| Pitcher W / L / SV / SVO | Awarded | **Not awarded** |
| Pitcher IP, ER, H, BB, K, G, etc. | Recorded | Recorded |
| Batter plate-appearance stats | Recorded | Recorded |

This keeps regular-season standings and pitcher win totals unaffected by postseason play.

---

## Player Generation

Players are created in `src/league.js` using MLB baseline rates from `src/data.js` plus an archetype delta plus random variance. All values are clamped to valid ranges.

### Batter Archetypes

```
avg       = clamp( 0.248  + arch.avgD  + rand(−0.022, +0.022),  0.190, 0.330 )
kPct      = clamp( MLB.k  + arch.kD   + rand(−0.030, +0.030),   0.10,  0.40  )
bbPct     = clamp( MLB.bb + arch.bbD  + rand(−0.020, +0.020),   0.04,  0.18  )
hrPct     = clamp( MLB.hr × 0.65 + arch.hrD + rand(−0.010, +0.012), 0.002, 0.065 )
singlePct = clamp( MLB.single    + rand(−0.020, +0.020),         0.08,  0.22  )
doublePct = clamp( MLB.double    + rand(−0.010, +0.010),         0.02,  0.09  )
triplePct = clamp( MLB.triple + arch.trD + rand(0, +0.005),      0.001, 0.012 )
goPct     = clamp( MLB.go    + arch.goD  + rand(−0.020, +0.020), 0.12,  0.30  )
foPct     = clamp( MLB.fo    +             rand(−0.020, +0.020), 0.10,  0.25  )
sbRate    = rand( 0.02, 0.15 )
sbPct     = rand( 0.62, 0.85 )
```

Archetype profiles: **Power** (high `hrD`, low `trD`), **Contact** (negative `kD`, higher single/double rates), **Patient** (positive `bbD`), **Speedster** (positive `trD`, higher `sbRate`), **Balanced** (neutral across all stats).

### Pitcher Archetypes

```
era   = clamp( 3.85 + arch.eraD + rand(−0.50, +0.50),  2.20, 6.00 )
kPct  = clamp( MLB.k  + arch.kD  + rand(−0.02, +0.02),  0.14, 0.35 )
bbPct = clamp( MLB.bb + arch.bbD + rand(−0.01, +0.02),  0.04, 0.14 )
goD   = arch.goD  // ground-ball tendency bonus added to GO% inside calcProbs
```

Archetype profiles: **Ace** (lower `eraD`, higher `kD`), **Power Arm** (very high `kPct`), **Control** (low `bbPct`), **Sinkerballer** (high `goD`), **Veteran** (slightly elevated ERA, balanced peripherals).

**Roster minimums enforced per team:**
- 9 batters (padded with generated players when a CSV import is short)
- At least 1 closer (CL) — auto-assigned from the last listed pitcher if none exists

---

## Stat Formulas

All calculated stats live in `src/utils.js`.

```js
// Batting Average
AVG  = career.h / career.ab                                             // 0 if ab = 0

// On-Base Percentage
OBP  = (career.h + career.bb + career.hbp) / career.pa                 // uses pa as denominator

// Slugging Percentage
SLG  = (1B + 2×2B + 3×3B + 4×HR) / career.ab
       where 1B = career.h − career.hr − career.doubles − career.triples

// ERA
ERA  = (career.er / career.ip) × 9                   // ip stored as decimal: 6⅓ = 6.333

// WHIP
WHIP = (career.bb + career.h) / career.ip
```

Innings pitched are stored in fractional form. Each out recorded adds `1/3` to `career.ip`.

---

## Season Management

### Schedule

Schedules are built in a flexible matchup editor. Each row specifies a division pair and a series count. The generator creates home-and-away pairs and shuffles the calendar.

| Action | Description |
|--------|-------------|
| New Schedule | Open the schedule builder |
| Load Schedule | Restore a previously saved schedule template |
| Recycle Schedule | Reset all stats to zero and replay the same schedule from game 1 |
| Clear Schedule | Delete all scheduled games |
| Export Season Archive | Download a season archive JSON at any time |

### Scouting ratings (0–100 scale)

Player cards expose scouting sliders that map to internal probability values:

| Rating | Batter stat | Pitcher stat |
|--------|-------------|-------------|
| Contact / Strikeout | `kPct` | `kPct` |
| Power | `hrPct` | — |
| Patience / Control | `bbPct` | `bbPct` |
| Speed / GB Rate | `sbRate` | `goD` |
| — | — | Stuff → `era` |

### Clearing vs. advancing a season

| Action | Effect |
|--------|--------|
| **Clear Season** | Resets all player career stats, team W/L/runs, schedule, and playoffs to zero. Offers to download a season archive first. |
| **Advance Season** | Archives each player's current `career` stats into their personal `seasons[]` history, increments `LEAGUE.season`, and resets current stats. |

---

## Playoff Bracket

### Seeding

Six teams qualify per league (AL / NL):
- Seeds 1–3: Division winners ranked by win %
- Seeds 4–6: Best remaining records (wild cards)

### Rounds and formats

| Round | Format | Home-game pattern |
|-------|--------|-------------------|
| Wild Card | Best-of-3 | H H A |
| Division Series | Best-of-5 | H H A A H |
| Championship Series | Best-of-7 | H H A A H A H |
| World Series | Best-of-7 | H H A A H A H |

H = higher seed at home; A = lower seed at home.
First to `⌈seriesLength / 2⌉` wins advances.

### Bracket wiring

When a series concludes, the winner slots into the next series. Original playoff seed numbers determine whether the winner occupies the `higher` or `lower` slot. Championship Series and World Series resolve slot placement by comparing original seeds when both incoming slots arrive from different bracket paths.

### Auto-play modes

| Mode | Behaviour |
|------|-----------|
| Auto Series | Simulates all remaining games in the currently active series |
| Auto Round | Simulates all remaining series in the current round |
| Auto All | Simulates the entire remaining playoff bracket |

Playoff games accumulate pitcher and batter stats but **do not** update team standings or award pitcher decisions.

---

## Season History & Archiving

### Archive format

Season archives are JSON files identified by `"type": "bbsim-season-archive"`:

```json
{
  "type": "bbsim-season-archive",
  "leagueName": "Diamond League",
  "season": 2025,
  "gamesPlayed": 1620,
  "champion": {
    "teamId": 5,
    "teamName": "New York Yankees",
    "city": "New York",
    "nickname": "Yankees",
    "color": "#1a3a5c",
    "playoffWins": 11,
    "teamHR": 214,
    "battingAvg": 0.268,
    "ERA": 3.41,
    "WHIP": 1.14
  },
  "runnerUp": { "...same fields..." },
  "teams": [
    {
      "id": 5, "name": "New York Yankees",
      "city": "New York", "nickname": "Yankees",
      "league": "American League", "division": "AL East",
      "color": "#1a3a5c", "emoji": "⚾",
      "w": 97, "l": 65, "runsFor": 812, "runsAgainst": 641,
      "batters": [
        { "id": "abc123", "type": "batter", "pos": "CF",
          "name": "M. Troutman", "firstName": "M.", "lastName": "Troutman",
          "career": { "g": 162, "pa": 698, "ab": 601, "h": 178, "hr": 34, ... } }
      ],
      "pitchers": [ { "...same structure..." } ]
    }
  ]
}
```

The `teams` array contains all 30 teams with full rosters and individual player career stats for that season, enabling historical player-level analysis.

### File naming

Archives are named by export timestamp for natural filesystem sorting:

```
2026-03-26_14-30-45_New_York_Yankees.json
```

### Archiving during Clear Season

When **Clear Season** is triggered, the app prompts:
1. *"Are you sure you want to delete the season stats?"* — confirms the wipe.
2. *"Download a season archive before clearing?"* — optionally downloads the archive before all stats are erased.

The **Rinse, Repeat** button on the playoff bracket combines export + recycle in one step: downloads the archive, then resets all stats and restarts the schedule, landing on the Simulate Game screen.

### Loading archives

**Load Folder** (Chrome / Edge): Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (`showDirectoryPicker`). All valid archive files in the selected folder are loaded at once. The directory handle is retained so individual files can be deleted from disk via the ✕ button.

**Load Files** (all browsers): Multi-file `<input>` fallback. Files load into the UI but cannot be deleted from disk.

Invalid JSON and non-archive files are silently skipped during loading.

### Viewing a season in the Players screen

Any loaded season that contains the full `teams` array shows a **Players** button in the history table. Clicking it switches the Players screen to display that season's individual stats. A gold banner identifies the historical view; **← Current Season** returns to live data.

---

## Season Score

A 0–100 composite score assigned to every team in an archive, measuring how good a season that team had *relative to the rest of the league that year*. Requires a full-roster archive (exports from the current version of the app).

### Method

1. Derive six per-team metrics, each normalised per game to remove schedule-length bias.
2. For each metric compute the league mean and standard deviation across all 30 teams.
3. Z-score each team: `z = (value − mean) / stddev`.
4. Negate z-scores for metrics where lower is better (ERA, WHIP).
5. Compute weighted composite z-score:

| Metric | Weight | Direction |
|--------|--------|-----------|
| Win % | 30% | higher is better |
| Run differential / game | 20% | higher is better |
| Team ERA | 20% | lower is better |
| Team WHIP | 15% | lower is better |
| Team batting average | 10% | higher is better |
| HR / game | 5% | higher is better |

6. Normalise all 30 composite scores using min–max scaling: worst team = **0**, best team = **100**. The median team lands around **50**.

### Color scale

| Range | Color | Meaning |
|-------|-------|---------|
| 80–100 | Green | Excellent season |
| 60–79 | Blue | Above average |
| 40–59 | Gray | Average |
| 20–39 | Amber | Below average |
| 0–19 | Red | Poor season |

Scores are sortable columns in the Season History table. Archives without full roster data show `—`.

---

## Module Reference

### `src/data.js`

Pure constants — no imports, no side effects.

| Export | Description |
|--------|-------------|
| `MLB` | 2024 MLB season average plate-appearance outcome rates (K, GO, FO, LO, walk, HBP, 1B, 2B, 3B, HR). Used as the baseline for all simulation math. |
| `B_ARCHS` | Five batter archetypes with stat deltas applied on top of `MLB` rates at player creation. |
| `P_ARCHS` | Five pitcher archetypes with ERA and outcome-rate deltas. |
| `MLB_STRUCTURE` | Two leagues × three divisions × five teams each. Defines fictional team names for a fresh league. |
| `POSITIONS` | Nine batting positions (`CF`, `SS`, `RF`, …, `DH`). |
| `FN` / `LN` | Name lists used by `rn()` to generate random player names. |
| `EMOJIS` | Emoji pool used as default team and player icons. |

### `src/utils.js`

Stateless helpers. Imports only `FN`/`LN` from `data.js`.

| Export | Description |
|--------|-------------|
| `ri(n)` | Random integer in `[0, n)`. |
| `rn()` | Random player name, e.g. `"J. Walsh"`. |
| `rand(a, b)` | Random float in `[a, b)`. |
| `cl(v, lo, hi)` | Clamp `v` to `[lo, hi]`. |
| `randomColor()` | Returns a hex colour from a fixed dark palette for team primary colours. |
| `teamLogoHtml(team, size)` | Returns an `<img>` span if the team has a custom logo, otherwise the team's emoji. |
| `battingAvg(p)` | `H / AB` for a player's career stats. Returns 0 if no at-bats. |
| `obpCalc(p)` | `(H + BB + HBP) / PA`. |
| `slgCalc(p)` | Total bases / AB using career doubles, triples, and HR. |

### `src/league.js`

All league state and persistence.

| Export | Description |
|--------|-------------|
| `LEAGUE` | The single mutable league object: `{ name, season, teams[], gamesPlayed, schedule, savedSchedules }`. |
| `initLeague()` | Loads from `localStorage`; falls back to `generateLeague()`. |
| `generateLeague()` | Creates a fresh 30-team league and saves it. |
| `saveLeague()` | Writes `LEAGUE` to `localStorage`, splitting logos to separate keys. Shows a brief "✓ Saved" indicator. |
| `mkBatter(pos)` | Creates a batter at the given position using a random archetype. Returns a player object with zeroed career stats. |
| `mkPitcher()` | Creates a pitcher using a random `P_ARCHS` archetype. |
| `importFromCSV(text)` | Parses a CSV/TSV roster. Maps flexible column aliases; scales 0–100 scouting ratings to internal probabilities. |
| `exportLeague()` | Downloads the current `LEAGUE` as a JSON backup. |
| `importRosters(input)` | `onchange` handler for the roster file input. Dispatches to CSV or JSON handling. |
| `allBatters()` | Flat array of every batter league-wide, annotated with `teamName`. |
| `allPitchers()` | Same for pitchers. |

### `src/views.js`

All UI rendering outside the live game.

| Export | Description |
|--------|-------------|
| `nav(page)` | Switches active page (`home`, `players`, `schedule`, `simulate`, `playoffs`, `history`). Triggers the render function for the new page. |
| `renderHome()` | Standings grid and league stat leaders. |
| `renderPlayersTable()` | Searchable, filterable, sortable league-wide players table. Supports historical view mode. |
| `setFilter(f, el)` | Switches player table between Batters / Pitchers. |
| `viewHistorySeason(archiveData)` | Loads an archive's team roster into the Players screen as a historical view. |
| `exitHistoricalView()` | Returns Players screen to current season data. |
| `clearSeason()` | Resets all stats to zero (with archive download prompt). |
| `advanceSeason()` | Archives stats into player history and increments the season year. |
| `schedRecycle(afterPage?)` | Resets stats and restarts the current schedule from game 1. Navigates to `afterPage` if provided, otherwise returns to schedule. |
| `generatePlayoffs()` | Seeds all playoff series from current standings. |
| `renderPlayoffs()` | Renders the full playoff bracket. |

### `src/game.js`

Pitch-by-pitch game engine and in-game UI.

| Export | Description |
|--------|-------------|
| `startGame(awayId, homeId)` | Initialises `G` and renders the game UI. |
| `startScheduleGame()` | Finds and starts the next unplayed scheduled game. |
| `gSinglePitch()` | Simulates one pitch event. |
| `gPitch()` | Simulates a full plate appearance. |
| `gAuto()` | Auto-plays the current half-inning to completion. |
| `gAutoGame()` | Auto-plays the rest of the game. |
| `gAutoMulti()` | Auto-plays a configurable number of games in sequence. |
| `gAutoAll()` | Auto-plays all remaining scheduled games. |
| `gStopAuto(btn)` | Stops auto-play after the current game finishes. |
| `gToggleHideAnimation()` | Toggles hide-animation mode (skips per-pitch DOM updates for speed). |
| `gToggleHideLiveRankings()` | Toggles whether the live standings panel is shown in hide-animation mode. |
| `gToggleProgressDisplay()` | Toggles the schedule progress strip between colored boxes and a percentage readout. |
| `gSetDelay(v)` | Sets the millisecond delay between auto pitches (0–3000 ms). |
| `gNextGame()` | Starts the next scheduled game without returning to the picker. |
| `gShowLineup(i)` | Switches the lineup sidebar to the away (0) or home (1) team. |
| `playoffPlayNext(seriesIdx)` | Starts the next game in a playoff series. |
| `playoffAutoSeries(seriesIdx)` | Auto-plays all remaining games in a series. |
| `playoffAutoRound()` | Auto-plays all remaining series in the current round. |
| `playoffAutoAll()` | Auto-plays the entire remaining playoff bracket. |

### `src/history.js`

Season archive management and the Season Score calculator.

| Export | Description |
|--------|-------------|
| `buildSeasonArchive()` | Constructs an archive object from the current `LEAGUE` state (champion/runner-up summary + all 30 team rosters). |
| `exportSeasonArchive()` | Downloads the archive as a timestamped JSON file. |
| `loadHistoryFolder()` | Opens a folder picker (File System Access API) and loads all valid archives from it. Falls back to file input on unsupported browsers. |
| `loadHistoryFiles(input)` | Multi-file input handler for the fallback load path. |
| `deleteHistorySeason(idx)` | Removes a season from the loaded list and deletes the file from disk if a directory handle is available. |
| `renderHistory()` | Renders the Season History table with scores, champion/runner-up stats, and action buttons. |
| `historySort(col)` | Sorts the history table by the given column, toggling direction on repeated clicks. |
| `historyGetData(idx)` | Returns the archive data object at the given index (used by inline `onclick` handlers). |

---

## Dependency Graph

```
data.js    ← (no imports)
utils.js   ← data.js
league.js  ← data.js, utils.js
history.js ← league.js
game.js    ← data.js, utils.js, league.js
views.js   ← data.js, utils.js, league.js, game.js, history.js
app.js     ← league.js, views.js, game.js, history.js
```

No circular dependencies.

---

## Data Persistence

All data is saved to `localStorage`:

| Key | Contents |
|-----|----------|
| `diamond-league-v3` | Full league JSON (teams, rosters, career stats, schedule). Team logos are stripped from this payload to avoid size limits. |
| `dlg-logo-{teamId}` | Base64 data URLs for custom team logos, stored separately to stay within the ~5 MB `localStorage` quota. |
| `dlg-saved-schedules` | Saved schedule templates (separate key to avoid quota issues). |

Use **Export League** (League Settings menu) to download a portable JSON backup of the entire league. Use **Export Season Archive** (Schedule page or Playoffs screen) to save a season's results for the History panel.
