/* /assets/modules/module_enterScoresBatch.js
 * MA.enterScoresBatch — Batch (transcription-style) score entry overlay.
 *
 * Self-hydrating: caller supplies only { playerKey, onSaved }. The module
 * fetches its own gameRow/players via initScoresBatch.php, scoped to the
 * playerKey's scorecard (getPlayersByPlayerKey — the requesting group only,
 * not the full game roster).
 *
 * Orientation: desktop = players as rows, holes as columns. Mobile = holes
 * as rows, players as columns. Two DOM grids sharing one _state object,
 * CSS media query decides which renders — no resize-triggered re-render.
 *
 * Save contract mirrors persistScores() exactly: each player is submitted
 * as { playerRow, originalScoresJson, holeScores }, originalScoresJson is
 * the snapshot captured at hydration, and the server independently
 * re-fetches current state via playerKey for detectSaveConflict().
 *
 * Usage:
 *   MA.enterScoresBatch.open({
 *     playerKey: "ABC-123",
 *     onSaved:   () => window.location.reload(),
 *   });
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  let _overlay = null;
  let _config = null;
  let _state = null;

  // ── Styles ──────────────────────────────────────────────────────────────────
  // Only new rule this module needs: the orientation breakpoint toggle.
  // Everything else (modal shell, buttons, inputs, segmented tabs) is
  // ma_shared.css classes used as-is.

  const STYLES = `
    .esbMobileGrid { display: block; }
    .esbDesktopGrid { display: none; }
    @media (min-width: 900px) {
      .esbMobileGrid { display: none; }
      .esbDesktopGrid { display: block; overflow-x: auto; }
    }
    .esbGridText {
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      font-family: var(--fontFamilyBase);
    }
    .esbCell {
      font-size: 13px !important;
      text-align: center;
    }
    .esbTotalCell {
      min-height: 32px;
      border-radius: 10px;
      border: 1px solid var(--controlBorder);
      background: rgba(0,0,0,.04);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;

  function injectStyles() {
    if (document.getElementById("esbStyles")) return;
    const style = document.createElement("style");
    style.id = "esbStyles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function initState(payload) {
    const players = payload.players || [];
    const holesLabel = String(payload.gameRow?.dbGames_Holes || "All 18");
    const showTabs = holesLabel === "All 18";

    _state = {
      gameRow: payload.gameRow || {},
      players,
      parByHole: payload.parByHole || {},
      scorerGHIN: payload.scorerGHIN || "",
      holesLabel,
      showTabs,
      activeSide: holesLabel === "B9" ? "B9" : "F9",
      holeScores: {},   // { ghin: { holeNumber: rawScore } }
      dirty: false,
      busy: false,
    };

    players.forEach(p => {
      const ghin = String(p.playerRow?.dbPlayers_PlayerGHIN || "");
      _state.holeScores[ghin] = {};
      const details = p.scoresJson?.Scores?.[0]?.hole_details || [];
      details.forEach(d => {
        const h = parseInt(d.hole_number, 10);
        const raw = d.raw_score ?? d.adjusted_gross_score;
        if (h && raw !== undefined && raw !== null) {
          _state.holeScores[ghin][h] = raw;
        }
      });
    });
  }

  function sideHoles(side) {
    if (side === "F9") return Array.from({ length: 9 }, (_, i) => i + 1);
    if (side === "B9") return Array.from({ length: 9 }, (_, i) => i + 10);
    return Array.from({ length: 18 }, (_, i) => i + 1);
  }

  function activeHoles() {
    return _state.showTabs ? sideHoles(_state.activeSide) : sideHoles(_state.holesLabel);
  }

  function sideTotal(ghin, holes) {
    let total = 0;
    let any = false;
    holes.forEach(h => {
      const v = _state.holeScores[ghin]?.[h];
      if (v !== undefined && v !== null && v !== "") {
        total += Number(v);
        any = true;
      }
    });
    return any ? total : null;
  }

  function markDirty() {
    _state.dirty = true;
    const saveBtn = _overlay?.querySelector("#esbBtnSave");
    if (saveBtn) saveBtn.disabled = false;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function playerLabel(p) {
    const name = esc(String(p.playerRow?.dbPlayers_Name || p.playerRow?.dbPlayers_LName || ""));
    const ph = p.playerRow?.dbPlayers_PH;
    return (ph !== undefined && ph !== null && ph !== "") ? `${name} (${esc(String(ph))})` : name;
  }

  function ghinOf(p) {
    return String(p.playerRow?.dbPlayers_PlayerGHIN || "");
  }

  function cellInput(ghin, hole) {
    const v = _state.holeScores[ghin]?.[hole];
    const val = (v === undefined || v === null) ? "" : esc(String(v));
    return `<input class="maTextInput esbCell" type="text" inputmode="numeric"
              data-ghin="${esc(ghin)}" data-hole="${hole}"
              value="${val}" placeholder="-" />`;
  }

  function renderDesktopGrid() {
    const holes = activeHoles();
    const players = _state.players;
    const totalLabel = _state.activeSide === "B9" ? "IN" : "OUT";
    const holeColWidth = "42px";

    let cols = `130px repeat(${holes.length},${holeColWidth}) 56px`;
    let html = `<div class="esbGrid" style="display:grid;grid-template-columns:${cols};gap:3px">`;

    html += `<div></div>`;
    holes.forEach(h => {
      html += `<div class="esbGridText" style="text-align:center">${h}</div>`;
    });
    html += `<div class="esbGridText" style="text-align:center">${totalLabel}</div>`;

    html += `<div></div>`;
    holes.forEach(h => {
      const par = _state.parByHole[h];
      html += `<div class="esbGridText" style="text-align:center">${par != null ? "Par " + par : ""}</div>`;
    });
    html += `<div></div>`;

    players.forEach(p => {
      const ghin = ghinOf(p);
      html += `<div class="esbGridText" style="display:flex;align-items:center">${playerLabel(p)}</div>`;
      holes.forEach(h => { html += `<div>${cellInput(ghin, h)}</div>`; });
      const tot = sideTotal(ghin, holes);
      html += `<div class="esbGridText esbTotalCell">${tot ?? ""}</div>`;
    });

    html += `</div>`;
    return html;
  }

  function renderMobileGrid() {
    const holes = activeHoles();
    const players = _state.players;
    const totalLabel = _state.activeSide === "B9" ? "IN" : "OUT";
    const playerColWidth = "42px";

    const cols = `26px 50px repeat(${players.length},${playerColWidth})`;
    let html = `<div class="esbGrid" style="display:grid;grid-template-columns:${cols};gap:3px">`;

    html += `<div></div><div></div>`;
    players.forEach(p => {
      html += `<div class="esbGridText" style="text-align:center">${playerLabel(p)}</div>`;
    });

    holes.forEach(h => {
      const par = _state.parByHole[h];
      html += `<div class="esbGridText" style="display:flex;align-items:center;justify-content:center">${h}</div>`;
      html += `<div class="esbGridText" style="display:flex;align-items:center;justify-content:center">${par != null ? "Par " + par : ""}</div>`;
      players.forEach(p => { html += `<div>${cellInput(ghinOf(p), h)}</div>`; });
    });

    html += `<div class="esbGridText" style="grid-column:1/3;display:flex;align-items:center">${totalLabel}</div>`;
    players.forEach(p => {
      const tot = sideTotal(ghinOf(p), holes);
      html += `<div class="esbGridText esbTotalCell">${tot ?? ""}</div>`;
    });

    html += `</div>`;
    return html;
  }

  function renderTabs() {
    if (!_state.showTabs) {
      const label = _state.holesLabel === "B9" ? "Back 9" : "Front 9";
      return `<div class="maHelpText" style="font-weight:900">${label}</div>`;
    }
    return `
      <div class="maSeg" style="width:180px">
        <button type="button" class="maSegBtn esbTab ${_state.activeSide === "F9" ? "is-active" : ""}" data-side="F9">Front 9</button>
        <button type="button" class="maSegBtn esbTab ${_state.activeSide === "B9" ? "is-active" : ""}" data-side="B9">Back 9</button>
      </div>`;
  }

  function renderAll() {
    if (!_overlay) return;

    const game = _state.gameRow;
    const dateStr = String(game.dbGames_PlayDate || "").slice(0, 10);
    const players = _state.players;
    const courseName = esc(String(game.dbGames_CourseName || ""));
    const scorecardKey = esc(String(players[0]?.playerRow?.dbPlayers_PlayerKey || ""));
    const titleLine = esc(String(game.dbGames_Title || "Score Batch Entry"))
      + (scorecardKey ? ` &bull; Scorecard ${scorecardKey}` : "");
    const subtitleLine = [courseName, esc(dateStr)].filter(Boolean).join(" &bull; ");

    _overlay.innerHTML = `
      <section class="maModal esbModal" role="dialog" aria-modal="true" style="--modalMaxW: 900px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">${titleLine}</div>
            <div class="maModal__subtitle">${subtitleLine}</div>
          </div>
          <button id="esbBtnClose" type="button" class="iconBtn btnPrimary" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="maModal__controls">
          ${renderTabs()}
        </div>
        <div class="maModal__body">
          <div class="esbDesktopGrid">${renderDesktopGrid()}</div>
          <div class="esbMobileGrid">${renderMobileGrid()}</div>
        </div>
        <footer class="maModal__ftr">
          <button id="esbBtnCancel" class="btn btnPrimary" type="button">Cancel</button>
          <button id="esbBtnSave" class="btn btnSecondary" type="button" ${_state.dirty ? "" : "disabled"}>Save</button>
        </footer>
      </section>`;

    bindEvents();
  }

  function bindEvents() {
    _overlay.querySelector("#esbBtnClose")?.addEventListener("click", () => confirmClose());
    _overlay.querySelector("#esbBtnCancel")?.addEventListener("click", () => confirmClose());
    _overlay.querySelector("#esbBtnSave")?.addEventListener("click", () => save());

    _overlay.querySelectorAll(".esbTab").forEach(btn => {
      btn.addEventListener("click", () => {
        _state.activeSide = btn.dataset.side;
        renderAll();
      });
    });

    _overlay.querySelectorAll(".esbCell").forEach(input => {
      input.addEventListener("change", () => {
        const ghin = input.dataset.ghin;
        const hole = parseInt(input.dataset.hole, 10);
        const val = input.value.trim();

        if (val === "") {
          delete _state.holeScores[ghin][hole];
        } else {
          _state.holeScores[ghin][hole] = val;
        }
        markDirty();

        const holes = activeHoles();
        _overlay.querySelectorAll(`.esbTotalCell`).forEach(() => {});
        renderAll();
      });
    });
  }

  // ── Save / close ─────────────────────────────────────────────────────────

  async function save() {
    if (_state.busy) return;

    if (!_state.scorerGHIN) {
      MA.ui.notify("Please choose the scorekeeper before entering scores.", "danger");
      return;
    }

    _state.busy = true;

    const saveBtn = _overlay.querySelector("#esbBtnSave");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

    const scorerGHIN = _state.scorerGHIN;
    const playerKey = String(_state.players[0]?.playerRow?.dbPlayers_PlayerKey || "");

    const payload = {
      playerKey,
      scorerGHIN,
      players: _state.players.map(p => {
        const ghin = ghinOf(p);
        return {
          playerRow: p.playerRow,
          originalScoresJson: p.originalScoresJson,
          holeScores: _state.holeScores[ghin] || {},
        };
      }),
    };

    try {
      const base = (MA.paths && MA.paths.apiScoreEntry) ? MA.paths.apiScoreEntry : "/api/score_entry";
      const res = await MA.postJson(`${base}/saveScoresBatch.php`, payload);

      if (res && res.ok) {
        MA.ui.notify(res.message || "Scores saved.", "success");
        const onSaved = _config.onSaved;
        close();
        if (typeof onSaved === "function") onSaved();
        return;
      }

      MA.ui.notify(res?.message || "Failed to save scores.", "danger");
    } catch (err) {
      MA.ui.notify("An error occurred while saving.", "danger");
    }

    _state.busy = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
  }

  async function confirmClose() {
    if (_state?.busy) return;
    if (_state?.dirty) {
      const approved = await MA.ui.confirm({
        title: "Discard changes?",
        message: "You have unsaved score entries. Discard them and close?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!approved) return;
    }
    close();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async function open(config) {
    if (_overlay) close();

    _config = config || {};
    if (!_config.playerKey) {
      console.error("enterScoresBatch: missing playerKey.");
      return;
    }

    injectStyles();
    MA.ui.showBusy({ title: "Score Batch Entry", message: "Loading scorecard..." });

    try {
      const base = (MA.paths && MA.paths.apiScoreEntry) ? MA.paths.apiScoreEntry : "/api/score_entry";
      const res = await MA.postJson(`${base}/initScoresBatch.php`, { playerKey: _config.playerKey });

      MA.ui.hideBusy();

      if (!res || !res.ok) {
        MA.ui.notify(res?.message || "Unable to load scorecard.", "danger");
        return;
      }

      initState(res);

      _overlay = document.createElement("div");
      _overlay.id = "esbOverlay";
      _overlay.className = "maModalOverlay is-open";
      _overlay.addEventListener("click", (e) => {
        if (e.target === _overlay) confirmClose();
      });
      document.body.appendChild(_overlay);

      renderAll();
    } catch (err) {
      MA.ui.hideBusy();
      MA.ui.notify("Unable to load scorecard.", "danger");
    }
  }

  function close() {
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
    _config = null;
    _state = null;
  }

  MA.enterScoresBatch = { open, close };

})(window);
