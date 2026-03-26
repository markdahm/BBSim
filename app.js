// ====================================================================
// BBSim - Diamond League Baseball Simulator
// Entry point: imports modules, exposes window globals, boots app.
// ====================================================================
import { initLeague, importRosters, exportLeague } from './src/league.js';
import { exportSeasonArchive, loadHistoryFolder, loadHistoryFiles, deleteHistorySeason, renderHistory, historySort, historyGetData } from './src/history.js';
import {
  nav, editLeagueName, saveLeagueName, cancelLeagueName, clearSeason, advanceSeason,
  viewHistorySeason, exitHistoricalView,
  openTeam, editTeamName, saveTeamName, cancelTeamName, uploadTeamLogo, removeTeamLogo,
  openBatterTable, closeBatterTable, sortBatterTable,
  openPitcherTable, closePitcherTable, sortPitcherTable,
  closeRosterTable, rosterSetTab, deletePlayerFromTable, deleteCurrentPlayer,
  openCard, openCardById, closeCard, closeCardDirect, prevCard, nextCard,
  updatePlayerName, updateRating, updateRatingFromBar, setFilter, setTeamFilter, setStatFilter, removeStatFilter, clearStatFilter, doSort, renderPlayersTable,
  schedNewSeason, schedDeleteAll, schedRecycle, schedGenerate, schedClear, schedCancel,
  schedLoadOpen, schedLoadPick, schedDeleteSaved, schedSetTeamFilter,
  schedDragStart, schedDrop, schedSetCount, schedRemoveRow, schedSetIntraCount,
  generatePlayoffs, renderPlayoffs, resetPlayoffs,
} from './src/views.js';
import { startGame, simSetMode, startScheduleGame, schedPlayGame, gNextGame, gSinglePitch, gPitch, gAuto, gAutoGame, gAutoMulti, gAutoAll, gStopAuto, gToggleHideAnimation, gToggleHideLiveRankings, gToggleProgressDisplay, gShowLineup, newMatchup, gSetDelay, playoffPlayNext, playoffAutoSeries, playoffAutoAll, playoffAutoRound } from './src/game.js';

// ── Expose functions referenced in HTML onclick attributes ──
Object.assign(window, {
  // Navigation & views
  nav,
  editLeagueName, saveLeagueName, cancelLeagueName,
  clearSeason, advanceSeason,
  openTeam, editTeamName, saveTeamName, cancelTeamName, uploadTeamLogo, removeTeamLogo,
  openBatterTable, closeBatterTable, sortBatterTable,
  openPitcherTable, closePitcherTable, sortPitcherTable,
  closeRosterTable, rosterSetTab, deletePlayerFromTable, deleteCurrentPlayer,
  openCard, openCardById, closeCard, closeCardDirect, prevCard, nextCard,
  updatePlayerName, updateRating, updateRatingFromBar,
  setFilter, setTeamFilter, setStatFilter, removeStatFilter, clearStatFilter, doSort, renderPlayersTable,
  schedNewSeason, schedDeleteAll, schedRecycle, schedGenerate, schedClear, schedCancel,
  schedLoadOpen, schedLoadPick, schedDeleteSaved, schedSetTeamFilter,
  schedDragStart, schedDrop, schedSetCount, schedRemoveRow, schedSetIntraCount,
  generatePlayoffs, renderPlayoffs, resetPlayoffs,
  // Roster import / export
  importRosters, exportLeague,
  // Season history
  exportSeasonArchive, loadHistoryFolder, loadHistoryFiles, deleteHistorySeason, renderHistory, historySort, historyGetData,
  viewHistorySeason, exitHistoricalView,
  // Game engine
  startGame, simSetMode, startScheduleGame, schedPlayGame, gNextGame, gSinglePitch, gPitch, gAuto, gAutoGame, gAutoMulti, gAutoAll, gStopAuto, gToggleHideAnimation, gToggleHideLiveRankings, gToggleProgressDisplay, gShowLineup, newMatchup, gSetDelay,
  playoffPlayNext, playoffAutoSeries, playoffAutoAll, playoffAutoRound,
});

// ── Boot ──
initLeague();
nav('home');
