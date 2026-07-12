/* /assets/modules/recalculate_handicaps.js
 * Shared module to refresh GHIN data and recalculate competition handicaps (PH/SO).
 * Includes self-contained UI blocking modal.
 */
(function() {
  "use strict";
  const MA = window.MA || {};
  window.MA = MA;

  function ensureModal() {
    let overlay = document.getElementById("maRecalcModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "maRecalcModal";
      overlay.className = "maModalOverlay";
      overlay.innerHTML = `
        <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="maRecalcTitle">
          <header class="maModal__hdr">
            <div id="maRecalcTitle" class="maModal__title">Working</div>
          </header>
          <div class="maModal__body">
            <div id="maRecalcMsg" style="text-align:center; padding:10px;">Processing...</div>
          </div>
        </section>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function showModal(msg) {
    const el = ensureModal();
    const txt = document.getElementById("maRecalcMsg");
    if (txt) txt.textContent = msg || "Processing...";
    el.classList.add("is-open");
    document.body.classList.add("maOverlayOpen");
  }

  function updateModal(msg) {
    const txt = document.getElementById("maRecalcMsg");
    if (txt) txt.textContent = msg || "Processing...";
  }

  function hideModal() {
    const el = document.getElementById("maRecalcModal");
    if (el) el.classList.remove("is-open");
    document.body.classList.remove("maOverlayOpen");
  }

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
      alert("System Error: MA.postJson not found.");
      return false;
    }

    try {
      showModal("Recalculating handicaps...");
      
      // Pass 1: Refresh from GHIN (HI, CH)
      updateModal("(Step 1 OF 2) Refreshing Player Handicaps (HI/CH)...");
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
      // handling of its own — this modal is the sole feedback surface —
      // so hold the message visible briefly rather than hiding instantly.
      if (res1.skipped) {
        updateModal(res1.message || "Handicaps skipped.");
        await new Promise(r => setTimeout(r, 1400));
        hideModal();
        return true;
      }

      // Pass 2: Calculate Competition (PH, SO)
      updateModal("(Step 2 OF 2) Refreshing Handicap Competition Values (PH/SO)...");
      const res2 = await MA.postJson(`${base}/calcPHSO.php`, {
        action: scorecardKey ? "scorecard" : "all",
        id: scorecardKey || undefined,
      });
      if (!res2 || !res2.ok) throw new Error(res2?.message || "Calculation failed.");

      hideModal();
      return true;
    } catch (e) {
      console.error(e);
      hideModal();
      alert(`Recalculation error: ${e.message || e}`);
      return false;
    }
  };
})();