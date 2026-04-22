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
// Internal state
  let _config = null; // { gameId, player, onSave, onSaveBatch, onSetup, mode, subtitle }
  let _teeOptions = [];
  let _selectedTee = null;
  let _preferredYards = null;
  let _forceAssign = false;  // reset to false on every open()

  // DOM elements (lazy created)
  let elOverlay = null;
  let elTitle = null;
  let elSub = null;
  let elControls = null;  // maModal__controls strip (pinned, non-scrolling)
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
              <button type="button" class="iconBtn btnPrimary" id="maTeeSelCancel" aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </header>
            <div class="maModal__controls" id="maTeeSelControls" style="display:none;"></div>
            <div class="maModal__body">
              <div id="maTeeSelRows" class="maCards"></div>
            </div>
          </div>
        `;
    document.body.appendChild(div);

    elOverlay  = div;
    elSub      = div.querySelector("#maTeeSelSub");
    elControls = div.querySelector("#maTeeSelControls");
    elRows     = div.querySelector("#maTeeSelRows");
    elCancel   = div.querySelector("#maTeeSelCancel");

    elCancel.addEventListener("click", close);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function getOptions(config) {
    const cfg = config || {};
    const player = cfg.player || {};

    const apiPath = (MA.paths && MA.paths.apiGHIN)
      ? MA.paths.apiGHIN + "/getTeeSets.php"
      : "/api/GHIN/getTeeSets.php";

    const res = await MA.postJson(apiPath, { player });
    if (!res || !res.ok) throw new Error(res?.message || "Unable to load tee sets.");

    return {
      teeSets: Array.isArray(res.payload?.teeSets) ? res.payload.teeSets : [],
      preferredYards: (res.payload && typeof res.payload.preferredYards === "object")
        ? res.payload.preferredYards
        : null
    };
  }

  async function open(config) {
      _config = config || {};
      _forceAssign = false;  // always reset — toggle must not persist between opens
      ensureDom();

      const player = _config.player || {};
      const playerName = (player.name || (player.first_name + " " + player.last_name)).trim();
      elSub.textContent = _config.subtitle || playerName || "Player";
      elRows.innerHTML = '<div class="maEmptyState">Loading tee sets.</div>';

      // Render the controls strip for batch-setup mode; hide it for single-player mode
      renderControls();

      elOverlay.style.display = "flex";
      elOverlay.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("maOverlayOpen");

      try {
        const payload = await getOptions(_config);
        _teeOptions = Array.isArray(payload.teeSets) ? payload.teeSets : [];
        _preferredYards = payload.preferredYards || null;
        renderRows();

      } catch (e) {
        console.error(e);
        elRows.innerHTML = `<div class="maEmptyState" style="color:var(--danger)">Error: ${esc(e.message)}</div>`;
      }
    }

  function teeNumericYards(t) {
      const raw = String(t?.teeSetYards || t?.yards || "").replace(/[^\d.-]/g, "");
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }

  function findRecommendedTee(teeOptions, preferredYards) {
    if (!Array.isArray(teeOptions) || !teeOptions.length) return null;
    if (!preferredYards || typeof preferredYards !== "object") return null;

    const min = Number(preferredYards.min || 0);
    const max = Number(preferredYards.max || 0);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0 || min >= max) return null;

    const withYards = teeOptions
      .map(t => ({ tee: t, yards: teeNumericYards(t) }))
      .filter(x => x.yards > 0);

    if (!withYards.length) return null;

    const inside = withYards.filter(x => x.yards >= min && x.yards <= max);

    if (inside.length === 1) return inside[0].tee;

    if (inside.length > 1) {
      if (min <= 0) {
        inside.sort((a, b) => a.yards - b.yards);
        return inside[0].tee;
      }
      if (max >= 9999) {
        inside.sort((a, b) => b.yards - a.yards);
        return inside[0].tee;
      }

      const midpoint = Math.round((min + max) / 2);
      inside.sort((a, b) => Math.abs(a.yards - midpoint) - Math.abs(b.yards - midpoint));
      return inside[0].tee;
    }

    if (min <= 0) {
      const underCap = withYards.filter(x => x.yards <= max);
      if (underCap.length) {
        underCap.sort((a, b) => b.yards - a.yards);
        return underCap[0].tee;
      }
    }

    if (max >= 9999) {
      const overFloor = withYards.filter(x => x.yards >= min);
      if (overFloor.length) {
        overFloor.sort((a, b) => a.yards - b.yards);
        return overFloor[0].tee;
      }
    }

    const midpoint = Math.round((min + max) / 2);
    withYards.sort((a, b) => Math.abs(a.yards - midpoint) - Math.abs(b.yards - midpoint));
    return withYards[0].tee;
  }

  function renderTeeRow(t, currentId, options) {
    const opts = options || {};
    const rawId = String(t.teeSetID || t.value || "").trim();
    const id = esc(rawId);
    const name = esc(t.teeSetName || t.name || "Tee");
    let ch = esc(t.playerCH || t.ch || "-");
    if (_config.mode === "batch") ch = "Var";
    const yards = esc(t.teeSetYards || t.yards || "");
    const rating = esc(t.teeSetRating || t.rating || "");
    const slope = esc(t.teeSetSlope || t.slope || "");

    const isSelected = currentId && rawId === currentId;
    const isRecommended = !!opts.recommended;
    const isRecent = !!opts.recent;
    const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    return `
      <div class="maCard maListRow ${isSelected ? "is-selected" : ""}" data-id="${id}">
        <div style="flex:1">
          <div class="maListRow__col">
            ${name}
            <span style="font-weight:400; color:var(--mutedText);">• CH ${ch}</span>
            ${isRecent ? `<span class="maPill" style="margin-left:8px;">Recent</span>` : ``}
            ${isRecommended ? `<span class="maPill" style="margin-left:8px;">Preferred Yardage</span>` : ``}
            ${isSelected ? `<span class="maPill maPill--success" style="margin-left:8px;">Selected</span>` : ``}
          </div>
          <div class="maListRow__col maListRow__col--muted">${yards} yds • Slope ${slope} • CR ${rating}</div>
        </div>
        <div class="maListRow__col" style="text-align:right; min-width:24px;">${isSelected ? checkIcon : "+"}</div>
      </div>
    `;
  }

  function renderRows() {
    if (!_teeOptions.length) {
      elRows.innerHTML = '<div class="maEmptyState">No tee sets found for this course.</div>';
      return;
    }

    const currentId = String(_config.currentTeeSetId || _config.selectedTeeSetId || "").trim();
    const recentId = String(_config.recentTeeSetId || "").trim();

// Suppress suggested card entirely in batch and batch-setup modes —
    // no per-player HI data is available so suggestions are not meaningful.
    const isBatchMode = (_config.mode === "batch" || _config.mode === "batch-setup");
    const recentTee = (!isBatchMode && recentId)
      ? _teeOptions.find(t => String(t.teeSetID || t.value || "").trim() === recentId)
      : null;
    const recommendedTee = isBatchMode
      ? null
      : findRecommendedTee(_teeOptions, _preferredYards);

    const recommendedId = recommendedTee
      ? String(recommendedTee.teeSetID || recommendedTee.value || "").trim()
      : "";

    const suggestedRows = [];

    if (recentTee) {
      suggestedRows.push(renderTeeRow(recentTee, currentId, { recent: true }));
    }

    if (recommendedTee && recommendedId !== recentId) {
      suggestedRows.push(renderTeeRow(recommendedTee, currentId, { recommended: true }));
    }

    const suggestedHtml = suggestedRows.length
      ? `
        <div class="maCard" style="margin-bottom:12px;">
          <div class="maCard__hdr">
            <div class="maCard__title">Suggested</div>
          </div>
          <div class="maCard__body" style="padding:0; display:grid; gap:10px;">
            ${suggestedRows.join("")}
          </div>
        </div>
      `
      : "";

    const helperHtml = suggestedRows.length
      ? `<div class="maHelpText" style="margin:4px 0 10px 0;">All tee sets are shown below.</div>`
      : "";

    const fullListHtml = _teeOptions.map(t => renderTeeRow(t, currentId)).join("");

    elRows.innerHTML = `${suggestedHtml}${helperHtml}${fullListHtml}`;
    elRows.querySelectorAll("[data-id]").forEach(row => {
      row.addEventListener("click", () => selectTee(row.dataset.id));
    });
  }

  function renderControls() {
    if (!elControls) return;

    // Controls strip only appears in batch-setup mode (paths 2, 3, 4).
    // Single-player mode (path 1) keeps it hidden — no behaviour change.
    const isBatchSetup = (_config.mode === "batch" || _config.mode === "batch-setup");
    if (!isBatchSetup) {
      elControls.style.display = "none";
      elControls.innerHTML = "";
      return;
    }

    elControls.style.display = "";
    elControls.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <div style="position:relative; width:40px; height:24px; flex:0 0 auto; margin-top:1px;">
          <input type="checkbox" id="maTeeForceToggle" style="opacity:0; position:absolute; width:0; height:0;"
            ${_forceAssign ? "checked" : ""}>
          <div id="maTeeForceTrack" style="position:absolute; inset:0; border-radius:99px;
            background:${_forceAssign ? "var(--brandSecondary)" : "rgba(0,0,0,.2)"};
            cursor:pointer; transition:background .2s;"></div>
          <div id="maTeeForceThumb" style="position:absolute; top:3px; left:${_forceAssign ? "19px" : "3px"};
            width:18px; height:18px; background:#fff; border-radius:50%; transition:left .2s;
            pointer-events:none;"></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <div id="maTeeForceLabel" style="font-size:12px; font-weight:900; color:var(--ink);">
            ${_forceAssign ? "Force assign to all players" : "Use as fallback only"}
          </div>
          <div id="maTeeForceDesc" style="font-size:11px; font-weight:600; color:var(--mutedText);">
            ${_forceAssign
              ? "Hierarchy skipped &mdash; every player receives this tee"
              : "Hierarchy runs first &mdash; this tee used only if no match found"}
          </div>
        </div>
      </div>
      <div id="maTeeForceBanner" style="display:${_forceAssign ? "block" : "none"};
        margin-top:8px; background:#FFF3CD; border:1px solid #E8C87A;
        border-radius:var(--radiusSq,6px); padding:7px 10px;
        font-size:11px; font-weight:700; color:#7A5A10; line-height:1.4;">
        Force assign is on &mdash; all players will receive the selected tee.
        History and preferences will be ignored.
      </div>
    `;

    // Wire the toggle — click the track div since the input is visually hidden
    const track = elControls.querySelector("#maTeeForceTrack");
    const input = elControls.querySelector("#maTeeForceToggle");
    if (track && input) {
      track.addEventListener("click", () => {
        _forceAssign = !_forceAssign;
        input.checked = _forceAssign;
        // Re-render the controls strip to reflect new state
        renderControls();
      });
    }
  }

  async function selectTee(teeId) {
    const tee = _teeOptions.find(t => String(t.teeSetID || t.value) === String(teeId));
    if (!tee) return;

    close(); // Close UI immediately for responsiveness

    // batch-setup mode: caller receives { selectedTee, forceAssign }
    // so downstream evaluate logic knows which mode to operate in.
    if ((_config.mode === "batch" || _config.mode === "batch-setup") && _config.onSaveBatch) {
      _config.onSaveBatch({ selectedTee: tee, forceAssign: _forceAssign });
      return;
    }
    // Single-player path (mode unset or "single"): behaviour unchanged.
    if (_config.onSave) _config.onSave(tee);
  }

  function close() {
    if (elOverlay) {
      elOverlay.style.display = "none";
      elOverlay.setAttribute("aria-hidden", "true");
    }
    document.documentElement.classList.remove("maOverlayOpen");
  }

  MA.TeeSetSelection = { open, close, getOptions };
  global.MA = MA;

})(window);