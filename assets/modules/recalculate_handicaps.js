/* /assets/modules/recalculate_handicaps.js
 * Shared module to refresh GHIN data and recalculate competition handicaps (PH/SO).
 * UI feedback now goes through MA.ui (ma_shared.js) — see MA.recalculateHandicaps
 * below. No self-built modal in this file anymore.
 */
(function() {
  "use strict";
  const MA = window.MA || {};
  window.MA = MA;

  /**
   * @param {string} apiBase
   * @param {{ scorecardKey?: string }} [scope] - omit for whole-game (existing
   *   "all" behavior, unchanged). Pass scorecardKey to scope both passes to
   *   one playing group's dbPlayers_PlayerKey.
   *
   * NOTE: this only threads the scope through to refreshHandicaps.php /
   * calcPHSO.php — those two endpoint files still need to accept a
   * scorecardKey param and forward it to workflow_Handicaps.php's
   * be_recalculateGameHandicaps()/be_calculateGamePHSO(), which already
   * support it. Not yet confirmed those endpoint files have been updated.
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
      MA.ui.showBusy({ title: "Working", message: "Recalculating handicaps..." });

      // Pass 1: Refresh from GHIN (HI, CH)
      MA.ui.updateBusy({ message: "(Step 1 OF 2) Refreshing Player Handicaps (HI/CH)..." });
      const res1 = await MA.postJson(`${base}/refreshHandicaps.php`, {
        ghin: scorecardKey ? undefined : "all",
        scorecardKey: scorecardKey || undefined,
      });
      if (!res1 || !res1.ok) throw new Error(res1?.message || "Refresh failed.");

      // Gross-scored game — refreshHandicaps.php already reset HI/CH/PH/SO
      // to "0" directly with no GHIN calls. Pass 2 would just self-skip
      // anyway (be_calculateGamePHSO() already no-ops on ADJ GROSS), so
      // skip the round trip entirely. The only caller of this module
      // (game_players.js's onRecalcHandicaps()) does no follow-up status
      // handling of its own — this busy overlay is the sole feedback
      // surface — so hold the message visible briefly rather than hiding
      // instantly.
      if (res1.skipped) {
        MA.ui.updateBusy({ message: res1.message || "Handicaps skipped." });
        await new Promise(r => setTimeout(r, 1400));
        MA.ui.hideBusy();
        return true;
      }

      // Pass 2: Calculate Competition (PH, SO)
      MA.ui.updateBusy({ message: "(Step 2 OF 2) Refreshing Handicap Competition Values (PH/SO)..." });
      const res2 = await MA.postJson(`${base}/calcPHSO.php`, {
        action: scorecardKey ? "scorecard" : "all",
        id: scorecardKey || undefined,
      });
      if (!res2 || !res2.ok) throw new Error(res2?.message || "Calculation failed.");

      MA.ui.hideBusy();
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
