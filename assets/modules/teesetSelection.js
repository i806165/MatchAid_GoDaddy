/* /assets/modules/teesetSelection.js
 * Shared module for "In-Place" Player Registration (Tee Selection).
 * - Fetches tee sets for a game/player.
 * - Renders a modal overlay.
 * - Saves the registration via upsertGamePlayers.
 */
(function(global) {
  "use strict";

  const MA = global.MA || {};
  
  // Internal state
  let _config = null; // { gameId, player, onSave }
  let _teeOptions = [];
  let _selectedTee = null;

  // DOM elements (lazy created)
  let elOverlay = null;
  let elTitle = null;
  let elSub = null;
  let elRows = null;
  let elCancel = null;

  function ensureDom() {
    if (elOverlay) return;

    // Create modal structure matching ma_shared.css .maModal patterns
    const div = document.createElement("div");
    div.id = "maTeeSelectionOverlay";
    div.className = "maModalOverlay";
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Select Tee</div>
            <div class="maModal__subtitle" id="maTeeSelSub"></div>
          </div>
          <button type="button" class="closeBtn" id="maTeeSelCancel">Cancel</button>
        </header>
        <div class="maModal__body">
          <div id="maTeeSelRows" class="maCards"></div>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    elOverlay = div;
    elSub = div.querySelector("#maTeeSelSub");
    elRows = div.querySelector("#maTeeSelRows");
    elCancel = div.querySelector("#maTeeSelCancel");

    elCancel.addEventListener("click", close);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function open(config) {
    _config = config || {};
    ensureDom();

    const player = _config.player || {};
    const playerName = (player.name || (player.first_name + " " + player.last_name)).trim();
    elSub.textContent = playerName || "Player";
    elRows.innerHTML = '<div class="maEmptyState">Loading tee sets.</div>';

    elOverlay.style.display = "flex";
    elOverlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("maOverlayOpen");

    try {
      const apiPath = (MA.paths && MA.paths.apiGHIN) ? MA.paths.apiGHIN + "/getTeeSets.php" : "/api/GHIN/getTeeSets.php";
      const res = await MA.postJson(apiPath, { player });
      if (!res || !res.ok) throw new Error(res?.message || "Unable to load tee sets.");

      _teeOptions = Array.isArray(res.payload?.teeSets) ? res.payload.teeSets : [];
      renderRows();

    } catch (e) {
      console.error(e);
      elRows.innerHTML = `<div class="maEmptyState" style="color:var(--danger)">Error: ${esc(e.message)}</div>`;
    }
  }

  function renderRows() {
    if (!_teeOptions.length) {
      elRows.innerHTML = '<div class="maEmptyState">No tee sets found for this course.</div>';
      return;
    }

    const currentId = String(_config.currentTeeSetId || _config.selectedTeeSetId || "").trim();

    elRows.innerHTML = _teeOptions.map(t => {
      const rawId = String(t.teeSetID || t.value || "").trim();
      const id = esc(rawId);
      const name = esc(t.teeSetName || t.name || "Tee");
      const ch = esc(t.playerCH || t.ch || "-");
      const yards = esc(t.teeSetYards || t.yards || "");
      const rating = esc(t.teeSetRating || t.rating || "");
      const slope = esc(t.teeSetSlope || t.slope || "");

      const isSelected = currentId && rawId === currentId;

      return `
        <div class="maCard maListRow ${isSelected ? "is-selected" : ""}" data-id="${id}">
          <div style="flex:1">
            <div class="maListRow__col">
              ${name}
              <span style="font-weight:400; color:var(--mutedText);">• CH ${ch}</span>
              ${isSelected ? `<span class="maPill maPill--success" style="margin-left:8px;">Selected</span>` : ``}
            </div>
            <div class="maListRow__col maListRow__col--muted">${yards} yds • Slope ${slope} • CR ${rating}</div>
          </div>
          <div class="maListRow__col" style="text-align:right; min-width:24px;">${isSelected ? "✓" : "+"}</div>
        </div>
      `;
    }).join("");

    elRows.querySelectorAll("[data-id]").forEach(row => {
      row.addEventListener("click", () => selectTee(row.dataset.id));
    });
  }

  async function selectTee(teeId) {
    const tee = _teeOptions.find(t => String(t.teeSetID || t.value) === String(teeId));
    if (!tee) return;

    close(); // Close UI immediately for responsiveness
    if (_config.onSave) _config.onSave(tee);
  }

  function close() {
    if (elOverlay) {
      elOverlay.style.display = "none";
      elOverlay.setAttribute("aria-hidden", "true");
    }
    document.documentElement.classList.remove("maOverlayOpen");
  }

  MA.TeeSetSelection = { open, close };
  global.MA = MA;

})(window);