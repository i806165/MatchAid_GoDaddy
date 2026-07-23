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
    .esbMobileGrid { display: block; overflow-x: auto; overflow-y: visible; }
    .esbDesktopGrid { display: none; }
    @media (min-width: 900px) {
      .esbMobileGrid { display: none; }
      .esbDesktopGrid { display: block; overflow-x: auto; }
    }
    .esbGridText {
      font-size: 14px;
      font-weight: 800;
      color: var(--ink);
      font-family: var(--fontFamilyBase);
    }
    .esbCell {
      font-size: 14px !important;
      text-align: center;
      min-height: 28px !important;
      border-radius: var(--radiusSq) !important;
    }
    .esbTotalCell {
      min-height: 28px;
      border-radius: var(--radiusSq);
      border: 1px solid var(--controlBorder);
      background: rgba(0,0,0,.04);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .esbCard {
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .esbRow {
      display: grid;
      gap: 6px;
      padding: 8px 10px;
      align-items: center;
    }
    .esbHead {
      background: var(--panelControlsBg);
      border-bottom: 1px solid var(--border);
    }
    .esbHeadCell {
      background: var(--panelControlsBg);
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      font-family: var(--fontFamilyBase);
      text-align: center;
      padding: 2px 0;
    }
    .esbMobileGrid .esbStickyLeft {
      position: sticky;
      left: 0;
      z-index: 1;
      background: #fff;
    }
    .esbHPar {
      font-size: 11px;
      font-weight: 700;
      color: var(--mutedText);
      text-align: center;
    }
    .esbName {
      border-right: 1px solid var(--border);
    }
    .esbRowAlt {
      background: #f9f9f8;
    }
    .esbMobileGrid .esbCell {
      font-size: 15px !important;
      min-height: 30px !important;
    }
    .esbMobileGrid .esbTotalCell {
      font-size: 15px;
      min-height: 30px;
    }
    .esbPH {
      font-size: 10px;
      font-weight: 700;
      color: var(--mutedText);
      text-align: center;
    }
    .esbHoleNum {
      font-size: 13px;
      font-weight: 800;
      color: var(--ink);
      text-align: center;
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
      touchedHoles: new Set(), // "ghin|hole" — only cells actually edited this session
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

  function mobilePlayerHeader(p) {
    const lname = String(p.playerRow?.dbPlayers_LName || "").trim();
    const fullName = String(p.playerRow?.dbPlayers_Name || "").trim();
    const first2 = esc(fullName.slice(0, 1));
    const namePart = lname ? `${esc(lname)}, ${first2}` : esc(fullName);
    const ph = p.playerRow?.dbPlayers_PH;
    const phPart = (ph !== undefined && ph !== null && ph !== "") ? `(${esc(String(ph))})` : "";
    return `<div class="esbGridText">${namePart}</div><div class="esbPH">${phPart}</div>`;
  }

  function ghinOf(p) {
    return String(p.playerRow?.dbPlayers_PlayerGHIN || "");
  }

  function cellInput(ghin, hole, extraStyle) {
    const v = _state.holeScores[ghin]?.[hole];
    const val = (v === undefined || v === null) ? "" : esc(String(v));
    return `<input class="maTextInput esbCell" type="text" inputmode="numeric"
              data-ghin="${esc(ghin)}" data-hole="${hole}"
              value="${val}" placeholder="-" style="${extraStyle || ""}" />`;
  }

  function renderDesktopGrid() {
    const holes = activeHoles();
    const players = _state.players;
    const totalLabel = _state.activeSide === "B9" ? "IN" : "OUT";
    const cols = `150px repeat(${holes.length},40px) 48px`;

    let html = `<div class="esbCard"><div class="esbRow esbHead" style="grid-template-columns:${cols}">`;
    html += `<div></div>`;
    holes.forEach(h => {
      const par = _state.parByHole[h];
      html += `<div><div class="esbGridText" style="text-align:center">${h}</div><div class="esbHPar">${par != null ? "Par " + par : ""}</div></div>`;
    });
    html += `<div class="esbGridText" style="text-align:center">${totalLabel}</div>`;
    html += `</div>`;

    players.forEach((p, i) => {
      const ghin = ghinOf(p);
      const altClass = (i % 2 === 1) ? " esbRowAlt" : "";
      html += `<div class="esbRow${altClass}" style="grid-template-columns:${cols}">`;
      html += `<div class="esbGridText esbName">${playerLabel(p)}</div>`;
      holes.forEach(h => { html += cellInput(ghin, h); });
      const tot = sideTotal(ghin, holes);
      html += `<div class="esbGridText esbTotalCell" data-ghin-total="${esc(ghin)}">${tot ?? ""}</div>`;
      html += `</div>`;
    });

    html += `</div>`;
    return html;
  }

  function renderMobileGrid() {
    const holes = activeHoles();
    const players = _state.players;
    const totalLabel = _state.activeSide === "B9" ? "IN" : "OUT";
    const cols = `44px repeat(${players.length},minmax(58px,1fr))`;
    const totalRow = 2 + holes.length;

    // Single grid, every cell explicitly placed via grid-row/grid-column.
    // DOM order is player-major (all of player 1's cells, then player 2's,
    // etc.) so the native iOS chevron follows "same player, next hole" —
    // visual position is unaffected, since placement is explicit either way.
    let html = `<div class="esbCard"><div style="display:grid;grid-template-columns:${cols};gap:4px;padding:6px 8px">`;

    html += `<div class="esbHeadCell esbStickyLeft" style="grid-row:1;grid-column:1"></div>`;

    holes.forEach((h, j) => {
      const par = _state.parByHole[h];
      const bg = (j % 2 === 1) ? "background:#f9f9f8" : "";
      html += `<div class="esbStickyLeft" style="grid-row:${2 + j};grid-column:1;${bg}"><div class="esbHoleNum">${h}</div><div class="esbPH">${par != null ? "Par " + par : ""}</div></div>`;
    });
    html += `<div class="esbGridText esbHeadCell esbStickyLeft" style="grid-row:${totalRow};grid-column:1">${totalLabel}</div>`;

    players.forEach((p, i) => {
      const ghin = ghinOf(p);
      const col = 2 + i;
      html += `<div class="esbHeadCell" style="grid-row:1;grid-column:${col}">${mobilePlayerHeader(p)}</div>`;
      holes.forEach((h, j) => {
        const bg = (j % 2 === 1) ? "background:#f9f9f8" : "";
        html += cellInput(ghin, h, `grid-row:${2 + j};grid-column:${col};${bg}`);
      });
      const tot = sideTotal(ghin, holes);
      html += `<div class="esbGridText esbTotalCell esbHeadCell" data-ghin-total="${esc(ghin)}" style="grid-row:${totalRow};grid-column:${col}">${tot ?? ""}</div>`;
    });

    html += `</div></div>`;
    return html;
  }

  function renderTabs() {
    if (!_state.showTabs) {
      const label = _state.holesLabel === "B9" ? "Back 9" : "Front 9";
      return `<div class="maHelpText" style="font-weight:900">${label}</div>`;
    }
    return `
      <div class="maSeg">
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
      <section class="maModal esbModal" role="dialog" aria-modal="true" style="--modalMaxW: 700px;">
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
          <button id="esbBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
          <button id="esbBtnSave" class="maFtrBtn maFtrBtn--save" type="button" ${_state.dirty ? "" : "disabled"}>Save</button>
        </footer>
      </section>`;

    bindEvents();
  }

  // ── Auto-advance ─────────────────────────────────────────────────────────
  // Rule: after a score is entered, advance to the SAME PLAYER's next hole —
  // never a different player. On mobile that's visually "down" (holes are
  // rows); on desktop that's visually "across" (holes are columns) — the
  // rule itself doesn't care about orientation, it's driven by data
  // (_state.players / activeHoles()), not DOM or visual position.
  //
  // Digit ambiguity: 2-9 are always a complete single-digit score (no valid
  // score 1-15 continues past them), so they commit immediately. "1" is
  // ambiguous — final on its own (a hole-in-one) or the start of 10-15 — so
  // it holds briefly (HOLD_MS) waiting for a possible second digit before
  // committing. A second digit arriving cancels the hold and commits the
  // combined value immediately.

  const HOLD_MS = 550;
  let _holdTimer = null;
  let _holdInput = null;

  function clearHoldTimer() {
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; _holdInput = null; }
  }

  function nextCellTarget(ghin, hole) {
    const holes = activeHoles();
    const playerIdx = _state.players.findIndex(p => ghinOf(p) === ghin);
    const holeIdx = holes.indexOf(hole);

    if (holeIdx < holes.length - 1) {
      return { ghin, hole: holes[holeIdx + 1] };
    }
    const nextPlayerIdx = playerIdx + 1;
    if (nextPlayerIdx < _state.players.length) {
      return { ghin: ghinOf(_state.players[nextPlayerIdx]), hole: holes[0] };
    }
    // last player, last hole — wrap to first player, first hole
    return { ghin: ghinOf(_state.players[0]), hole: holes[0] };
  }

  function saveCellValue(input) {
    const ghin = input.dataset.ghin;
    const hole = parseInt(input.dataset.hole, 10);
    const val = input.value.trim();

    if (val === "") {
      delete _state.holeScores[ghin][hole];
    } else {
      _state.holeScores[ghin][hole] = val;
    }
    _state.touchedHoles.add(ghin + "|" + hole);
    markDirty();
    return { ghin, hole };
  }

  function updateTotalCellDOM(ghin) {
    const holes = activeHoles();
    const tot = sideTotal(ghin, holes);
    _overlay.querySelectorAll(`.esbTotalCell[data-ghin-total="${ghin}"]`).forEach(cell => {
      cell.textContent = tot ?? "";
    });
  }

  function commitAndAdvance(input) {
    const { ghin, hole } = saveCellValue(input);
    updateTotalCellDOM(ghin);

    const target = nextCellTarget(ghin, hole);
    // Both grids exist in the DOM at once (CSS hides whichever doesn't
    // match the breakpoint) — search only within the same grid the current
    // input lives in, or this can match the hidden copy and silently no-op.
    const grid = input.closest(".esbDesktopGrid, .esbMobileGrid");
    const scope = grid || _overlay;
    const nextInput = scope.querySelector(
      `.esbCell[data-ghin="${target.ghin}"][data-hole="${target.hole}"]`
    );
    if (nextInput) nextInput.focus();
  }

  function commitOnly(input) {
    const { ghin } = saveCellValue(input);
    updateTotalCellDOM(ghin);
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
      input.addEventListener("focus", () => {
        input.select();
        input.scrollIntoView({ block: "center", behavior: "smooth" });
      });

      input.addEventListener("blur", () => {
        if (_holdInput === input) {
          clearHoldTimer();
          commitOnly(input);
        }
      });

      input.addEventListener("input", () => {
        if (_holdInput === input) clearHoldTimer();

        const val = input.value.trim();

        if (val === "") {
          saveCellValue(input);
          return;
        }

        if (val.length === 1 && val === "1") {
          _holdInput = input;
          _holdTimer = setTimeout(() => {
            _holdTimer = null;
            _holdInput = null;
            commitAndAdvance(input);
          }, HOLD_MS);
          return;
        }

        // Any other single digit is always final (no valid score 1-15
        // continues past 2-9); two-or-more digits means the ambiguous "1"
        // just got resolved into a combined value. Either way, commit now.
        commitAndAdvance(input);
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
        const holeScores = {};
        _state.touchedHoles.forEach(key => {
          const [g, h] = key.split("|");
          if (g !== ghin) return;
          const v = _state.holeScores[ghin]?.[h];
          holeScores[h] = (v === undefined) ? null : v;
        });
        return {
          playerRow: p.playerRow,
          originalScoresJson: p.originalScoresJson,
          holeScores,
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

      if (res && res.gated) {
        await MA.ui.confirm({
          title: "Not available for this game",
          message: res.message || "Batch score entry is not available for games that rotate partners.",
          okOnly: true,
        });
        close();
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

      if (res && res.gated) {
        await MA.ui.confirm({
          title: "Not available for this game",
          message: res.message || "Batch score entry is not available for games that rotate partners.",
          okOnly: true,
        });
        return;
      }

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
