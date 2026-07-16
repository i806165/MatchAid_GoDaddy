/* /assets/js/ma_SharedBusLogic.js
 *
 * Cross-page BUSINESS logic shared across MatchAid pages — distinct in
 * purpose from ma_shared.js, which is pure plumbing/chrome (MA.postJson,
 * MA.setStatus, MA.chrome, MA.ui, the MA namespace scaffold itself) and
 * has no domain rules of its own. This file is the intended home for
 * cross-page rules that would otherwise get copy-pasted per caller.
 *
 * Load this AFTER ma_shared.js on any page that needs it — currently:
 * game_players (gameplayers.php), event_roster (eventroster.php),
 * game_pairings (gamepairings.php).
 *
 * Round-Level Dimension Activation — isDimensionActive()
 * -------------------------------------------------------
 * Mirrors ServiceDbEvents::isDimensionActive() in service_dbEvents.php
 * exactly — same signature, same order of checks. Kept as a deliberate
 * duplicate across PHP/JS (project decision) rather than a single shared
 * implementation, since the hierarchy itself is only a few lines and
 * duplicating it here is lower-risk than the two-field ambiguity this
 * function replaces (see game_pairings.js's old teamsActive() and its
 * mirror in workflow_ReconcilePairingBoundaries.php — two independent
 * copies of the same inference that had to be kept in sync by hand).
 *
 * Deliberately excludes Pairing — no legitimate round-level "off" state
 * exists for Pairing (no dbGames_PairingMode column, none planned).
 * pairingsLockedByEvent() in game_pairings.js remains the entire answer
 * for Pairing; this function is never called for it.
 *
 * Future additions to this file: cross-page date-normalization helpers
 * (service_dbGames.php's normalizeDateYMD() and service_dbEvents.php's
 * own copy of the identical function are flagged as a good future
 * candidate — not part of this pass).
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;

  const DIMENSION_FIELDS = {
    team:   { event: "dbEvents_TeamMode",   round: "dbGames_TeamMode"   },
    flight: { event: "dbEvents_FlightMode", round: "dbGames_FlightMode" },
  };

  /**
   * isDimensionActive(dimension, game, event)
   *
   * Strict two-level hierarchy, event first, round second, off if
   * neither claims it:
   *   1. If game.dbGames_EID is set AND event.dbEvents_{Dim}Mode is
   *      "fixed" -> ACTIVE, event-authoritative. Stop.
   *   2. Else if game.dbGames_{Dim}Mode is "active" -> ACTIVE,
   *      round-authoritative. Stop.
   *   3. Else -> INACTIVE.
   *
   * @param  {string}      dimension  "team" | "flight"
   * @param  {object}      game       object carrying dbGames_EID and
   *                                   dbGames_{Dim}Mode (e.g. state.game)
   * @param  {object|null} event      object carrying dbEvents_{Dim}Mode,
   *                                   or null/undefined. Many callers
   *                                   already have event fields merged
   *                                   directly onto `game` (full-row
   *                                   hydration via ServiceContextGame) —
   *                                   in that case pass the same object
   *                                   for both params.
   * @return {boolean}
   */
  MA.isDimensionActive = function (dimension, game, event) {
    const dim = String(dimension || "").toLowerCase().trim();
    const fields = DIMENSION_FIELDS[dim];
    if (!fields || !game) return false;

    const eid = parseInt(game.dbGames_EID, 10) || 0;

    // 1) Event-authoritative
    if (eid > 0 && event) {
      const eventMode = String(event[fields.event] || "").trim();
      if (eventMode === "fixed") return true;
    }

    // 2) Round-authoritative
    const roundMode = String(game[fields.round] || "").trim();
    if (roundMode === "active") return true;

    // 3) Neither claims it
    return false;
  };

  window.MA = MA;

})();
