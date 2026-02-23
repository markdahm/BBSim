// ====================================================================
// BBSim - Diamond League Baseball Simulator
// Entry point: imports modules, exposes window globals, boots app.
// ====================================================================
import { initLeague, importRosters, exportLeague } from './src/league.js';
import {
  nav, editLeagueName, saveLeagueName, cancelLeagueName, clearSeason, advanceSeason,
  openTeam, editTeamName, saveTeamName, cancelTeamName, uploadTeamLogo, removeTeamLogo,
  openCard, openCardById, closeCard, closeCardDirect,
  updatePlayerName, updateRating, updateRatingFromBar, setFilter, setTeamFilter, doSort, renderPlayersTable,
  schedNewSeason, schedDeleteAll, schedSetMode, schedClickDiv, schedClickOutside, schedGenerate, schedClear, schedCancel,
  schedLoadOpen, schedLoadPick, schedSetTeamFilter,
} from './src/views.js';
import { startGame, simSetMode, startScheduleGame, schedPlayGame, gNextGame, gSinglePitch, gPitch, gAuto, gAutoGame, gShowLineup, resolveDec, newMatchup, gToggleSettings, gSetDelay } from './src/game.js';

// ── Expose functions referenced in HTML onclick attributes ──
Object.assign(window, {
  // Navigation & views
  nav,
  editLeagueName, saveLeagueName, cancelLeagueName,
  clearSeason, advanceSeason,
  openTeam, editTeamName, saveTeamName, cancelTeamName, uploadTeamLogo, removeTeamLogo,
  openCard, openCardById, closeCard, closeCardDirect,
  updatePlayerName, updateRating, updateRatingFromBar,
  setFilter, setTeamFilter, doSort, renderPlayersTable,
  schedNewSeason, schedDeleteAll, schedSetMode, schedClickDiv, schedClickOutside, schedGenerate, schedClear, schedCancel,
  schedLoadOpen, schedLoadPick, schedSetTeamFilter,
  // Roster import / export
  importRosters, exportLeague,
  // Game engine
  startGame, simSetMode, startScheduleGame, schedPlayGame, gNextGame, gSinglePitch, gPitch, gAuto, gAutoGame, gShowLineup, resolveDec, newMatchup, gToggleSettings, gSetDelay,
});

// ── Boot ──
initLeague();
nav('home');
