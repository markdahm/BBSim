// ====================================================================
// BBSim - Diamond League Baseball Simulator
// Entry point: imports modules, exposes window globals, boots app.
// ====================================================================
import { initLeague, importRosters } from './src/league.js';
import {
  nav, editLeagueName, saveLeagueName, cancelLeagueName, advanceSeason,
  openTeam, editTeamName, saveTeamName, cancelTeamName,
  openCard, openCardById, closeCard, closeCardDirect,
  updatePlayerName, setFilter, doSort, renderPlayersTable,
} from './src/views.js';
import { startGame, gSinglePitch, gPitch, gAuto, gAutoGame, gShowLineup, resolveDec, newMatchup, gToggleSettings, gSetDelay } from './src/game.js';

// ── Expose functions referenced in HTML onclick attributes ──
Object.assign(window, {
  // Navigation & views
  nav,
  editLeagueName, saveLeagueName, cancelLeagueName,
  advanceSeason,
  openTeam, editTeamName, saveTeamName, cancelTeamName,
  openCard, openCardById, closeCard, closeCardDirect,
  updatePlayerName,
  setFilter, doSort, renderPlayersTable,
  // Roster import
  importRosters,
  // Game engine
  startGame, gSinglePitch, gPitch, gAuto, gAutoGame, gShowLineup, resolveDec, newMatchup, gToggleSettings, gSetDelay,
});

// ── Boot ──
initLeague();
nav('home');
