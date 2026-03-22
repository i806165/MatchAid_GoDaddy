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

  MA.recalculateHandicaps = async function(apiBase) {
    const base = apiBase || (MA.paths && MA.paths.apiGHIN) || "/api/GHIN";
    
    if (typeof MA.postJson !== "function") {
      alert("System Error: MA.postJson not found.");
      return false;
    }

    try {
      showModal("Recalculating handicaps...");
      
      // Pass 1: Refresh from GHIN (HI, CH)
      updateModal("Refreshing GHIN data...");
      const res1 = await MA.postJson(`${base}/refreshHandicaps.php`, { ghin: "all" });
      if (!res1 || !res1.ok) throw new Error(res1?.message || "Refresh failed.");

      // Pass 2: Calculate Competition (PH, SO)
      updateModal("Calculating competition handicaps...");
      const res2 = await MA.postJson(`${base}/calcPHSO.php`, { action: "all" });
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