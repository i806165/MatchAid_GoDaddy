/* /assets/modules/recalculate_handicaps.js
 * Shared module to refresh GHIN data, recalculate competition handicaps
 * (PH/SO), remove any now-possibly-stale blind player assignment, and
 * rebuild already-recorded scores against the refreshed handicap — all as
 * one consolidated, synchronous server-side call.
 *
 * Previously this module made two sequential HTTP requests
 * (refreshHandicaps.php then calcPHSO.php), narrating "Step 1 of 2" /
 * "Step 2 of 2" between them. That two-request chain is retired: outdoor,
 * mobile, cellular use makes a multi-request front-end chain vulnerable to
 * a dropped connection or an iOS-suspended tab between requests, leaving
 * handicaps updated but scores never rebuilt — silently. One consolidated
 * backend call (recalculateHandicapsAndScores.php ->
 * workflow_recalculateHandicapsScores.php) either fully completes or fails
 * as one unit from the client's perspective. The cost is coarser progress
 * UI — one static message for the full call duration instead of two
 * distinct steps — an accepted tradeoff.
 */
(function() {
  "use strict";
  const MA = window.MA || {};
  window.MA = MA;

  /**
   * @param {string} apiBase
   * @param {{ scorecardKey?: string }} [scope] - omit for whole-game scope.
   *   Pass scorecardKey to scope the refresh to one playing group's
   *   dbPlayers_PlayerKey. See spec Section 4 for which trigger uses which.
   */
  MA.recalculateHandicaps = async function(apiBase, scope) {
    const base = apiBase || (MA.paths && MA.paths.apiGHIN) || "/api/GHIN";
    const scorecardKey = scope?.scorecardKey || "";

    if (typeof MA.postJson !== "function") {
      await MA.ui.confirm({
        title: "System error",
        message: "MA.postJson not found.",
        okOnly: true,
        danger: true
      });
      return false;
    }

    try {
      MA.ui.showBusy({ title: "Working", message: "Recalculating handicaps and scores..." });

      const res = await MA.postJson(`${base}/recalculateHandicapsAndScores.php`, {
        scope: scorecardKey ? "playerKey" : "game",
        playerKey: scorecardKey || undefined,
      });

      MA.ui.hideBusy();

      if (!res || !res.ok) {
        throw new Error(res?.message || "Recalculation failed.");
      }

      // Blind Player Removal (Pass 3) is non-negotiable whenever a stale
      // row is found — this must-tap dialog is how the user learns it
      // happened, since deletion alone would otherwise be silent. Never
      // an auto-dismissing toast: this is used outdoors, on mobile, where
      // a timed toast can't be relied on to be seen.
      if (res.blindPlayerRemoved) {
        await MA.ui.confirm({
          title: "Blind Player Removed",
          message: "Handicap refresh completed. A blind player was found for this group and removed. Please reapply the blind player selection.",
          confirmLabel: "OK",
          okOnly: true,
          dismissible: false
        });
      }

      return true;
    } catch (e) {
      console.error(e);
      MA.ui.hideBusy();
      await MA.ui.confirm({
        title: "Recalculation error",
        message: e.message || String(e),
        okOnly: true,
        danger: true
      });
      return false;
    }
  };
})();
