/* /assets/modules/declare_logic.js
 * MA.resolveDeclaredIndices — the one true "who should be declared on this
 * hole" algorithm. Pure function: no DOM, no page state, no side effects.
 *
 * Extracted from score_entry.js's resolveDeclaredScores() so score entry
 * (live, per-hole, DOM-bound) and refresh_scores.js (headless, all-holes,
 * fetch-based) both call the exact same logic instead of maintaining two
 * copies that can silently drift apart.
 *
 * Usage:
 *   MA.resolveDeclaredIndices(rows, gameRow, holeNumber)
 *     rows       — [{ idx, raw, net, pos }] for one pairing, one hole.
 *                  idx is caller-defined (array index, player GHIN, whatever
 *                  the caller needs back to know which row won).
 *     gameRow    — the game settings row (dbGames_ScoringSystem,
 *                  dbGames_ScoringMethod, dbGames_BestBall,
 *                  dbGames_HoleDeclaration).
 *     holeNumber — needed only for DeclareHole's per-hole count lookup.
 *
 *   Returns:
 *     null            — this scoring system has no auto-declare concept
 *                        (DeclareManual / DeclarePlayer) — caller should
 *                        leave existing declared flags untouched.
 *     number[]         — the idx values that should be declared.
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  function resolveDeclaredIndices(rows, gameRow, holeNumber) {
    const scoringSystem = gameRow?.dbGames_ScoringSystem || 'BestBall';
    const scoringMethod = gameRow?.dbGames_ScoringMethod || 'NET';

    if (['DeclareManual', 'DeclarePlayer'].includes(scoringSystem)) return null;

    const validRows = (rows || []).filter(r => typeof r.raw === 'number');

    let n = 1;
    if (scoringSystem === 'AllScores') {
      n = validRows.length;
    } else if (scoringSystem === 'DeclareHole') {
      let holeDecls = gameRow?.dbGames_HoleDeclaration ?? [];
      if (typeof holeDecls === 'string') {
        try { holeDecls = JSON.parse(holeDecls); } catch (e) { holeDecls = []; }
      }
      if (!Array.isArray(holeDecls)) holeDecls = [];
      const found = holeDecls.find(h => parseInt(h.hole, 10) === holeNumber);
      n = parseInt(found?.count || '1', 10);
    } else if (scoringSystem === 'BestBall') {
      n = parseInt(gameRow?.dbGames_BestBall || '1', 10);
    }

    validRows.sort((a, b) => {
      const metricA = (scoringMethod === 'ADJ GROSS') ? a.raw : a.net;
      const metricB = (scoringMethod === 'ADJ GROSS') ? b.raw : b.net;
      if (metricA !== metricB) return metricA - metricB;
      if (a.raw !== b.raw) return a.raw - b.raw;
      return a.pos - b.pos;
    });

    return validRows.slice(0, n).map(r => r.idx);
  }

  MA.resolveDeclaredIndices = resolveDeclaredIndices;

})(window);
