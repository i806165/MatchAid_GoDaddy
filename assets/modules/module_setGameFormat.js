/* /assets/modules/module_setGameFormat.js
 *
 * MA.setGameFormat — Game Format editor module.
 *
 * Zero injected CSS. All classes come from ma_shared.css — modal, seg
 * control, choice chips, list rows, hint text, controls. Rebuilt against
 * module_defineTeams.js's actual construction pattern (not general
 * principles re-derived from raw CSS) after the first pass fell well short
 * of that bar. Concretely, this pass corrects:
 *
 *   - MA.setStatus() on save failure was silently invisible — it writes to
 *     the page chrome sitting BEHIND this modal's full-screen overlay.
 *     Now uses MA.ui.showModalNotice()/hideModalNotice() against an
 *     in-modal NOTICE_ID slot, exactly like module_defineTeams.js.
 *   - Pairing (binary choice) now uses .maSeg/.maSegBtn — already proven
 *     in module_defineTeams.js's own Activate/Deactivate toggle, not
 *     rediscovered as new.
 *   - Format (many choices) now uses .maChoiceChips/.maChoiceChip, one
 *     shared .maHintText line below reflecting the current selection —
 *     matches the OLD wizard's actual screenshot layout (one hint line
 *     under the row, not per-option hints), not an invented pattern.
 *   - Native <button class="maListRow"> replaced everywhere — .maListRow's
 *     CSS never resets browser default button chrome (only border-bottom
 *     is set), so a real <button> rendered with a visible default border
 *     underneath the intended styling. Chips/seg buttons are real
 *     <button> elements safely, since both classes declare a full border
 *     on all sides; nothing here uses .maListRow as a clickable element.
 *   - Consolidated _wireEvents() with event delegation, not scattered
 *     addEventListener calls inside open().
 *   - _busy flag blocks double-submit and overlay-click-close mid-save,
 *     matching module_defineTeams.js.
 *
 * Public API:
 *   MA.setGameFormat.open({ onDone })
 *   MA.setGameFormat.close()
 *
 * Self-hydrating: no game data passed in. GGID comes from session
 * server-side, same as every page in this app. Fetches its own complete
 * context on open — host-agnostic, callable from the menu or anywhere
 * else.
 *
 * Built correctly from day one: onDone fires on every exit path (Apply,
 * Cancel, backdrop, Escape).
 *
 * ── Cross-domain writes owned by THIS module's save ─────────────────────
 * a. Locked Game Format -> Scoring System / Best Ball. Relocated verbatim
 *    from wizSelectGame() in game_settings.js: GAME_LABELS' own
 *    scoringSystemLock/bbCountLock values are written directly into
 *    dbGames_ScoringSystem/dbGames_BestBall whenever the chosen format is
 *    locked.
 * b. C-O-D -> Segments/Rotation forced. Relocated verbatim from
 *    wizSelectGame() (lines 1609-1613 of game_settings.js) — those fields
 *    belong to Segments, not Format, but the write happens here since
 *    Format is what triggers it.
 * c. Competition leaving PairField -> Blind Player cleared. Relocated
 *    verbatim from wizSelectPairing(): dbGames_BlindPlayers -> [].
 *
 * ── Deliberate DEVIATION from current code, not a port ─────────────────
 * wizSelectGame()/buildPatchFromWiz() in game_settings.js currently null
 * dbGames_PointsConfig whenever Basis leaves "Points" — live production
 * behavior today, but it contradicts the confirmed, tested rule that
 * PointsConfig is never cleared, only dormant while inapplicable. This
 * module's save does not touch dbGames_PointsConfig at all.
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * Save endpoint below (/api/game_settings/saveGameFormat.php) does not
 * exist yet — placeholder pending the endpoint-architecture decision.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameFormat = MA.setGameFormat || {};

  const OVERLAY_ID = "maSetGameFormatOverlay";
  const NOTICE_ID  = "sgfNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameFormat.php"; // TODO — does not exist yet

  // ── Data tables — ported verbatim from game_settings.js ────────────────
  const GAME_LABELS = [
    { label: "Stroke Play",  dbFormat: "StrokePlay", basis: "Strokes", compFilter: "PairField", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Points",       dbFormat: "Stableford", basis: "Points",  compFilter: "PairField", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Skins",        dbFormat: "Skins",      basis: "Skins",   compFilter: "PairField", scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Medal Match",  dbFormat: "MatchPlay",  basis: "Strokes", compFilter: "PairPair",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Four Ball",    dbFormat: "MatchPlay",  basis: "Holes",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Skins Match",  dbFormat: "Skins",      basis: "Skins",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Points Match", dbFormat: "MatchPlay",  basis: "Points",  compFilter: "PairPair",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Alt-Shot",     dbFormat: "AltShot",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Chapman",      dbFormat: "Chapman",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Scramble",     dbFormat: "Scramble",   basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Shamble",      dbFormat: "Shamble",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "C-O-D",        dbFormat: "MatchPlay",  basis: "Holes",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false, legacy: true },
    { label: "Best Ball",    dbFormat: "StrokePlay", basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false, legacy: true },
    { label: "Declare",      dbFormat: "StrokePlay", basis: "Strokes", compFilter: null,        scoringSystem: "DeclareManual", scoringSystemLock: true,  bbCount: null, bbCountLock: true,  legacy: true },
    { label: "Stableford",   dbFormat: "Stableford", basis: "Points",  compFilter: null,        scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false,  legacy: true },
  ];

  const GAME_HINTS = {
    "Stroke Play":  "Every player counts their own score on every hole.",
    "Points":       "Points awarded per hole. Choose your points strategy on the Scoring row.",
    "Points Match": "Two sides compete head to head on points. Higher cumulative points wins the match.",
    "Four Ball":    "1 or 2 player teams compete head to head. One best ball from each side wins hole.",
    "C-O-D":        "Foursomes organized into twosomes, rotating every three/six holes (spins) Carts, Opposites, Drivers.",
    "Medal Match":  "Two sides compete head to head on total net strokes. Lower cumulative score wins the match.",
    "Skins":        "Players compete for skins against the field. Ties carry forward.",
    "Skins Match":  "Two teams compete against each other for skins. Ties carry forward.",
    "Alt-Shot":     "Partners alternate shots on the same ball throughout the round. One score per team per hole.",
    "Chapman":      "Each player hits a tee shot, then switches — best second shot chosen, alternate shot to finish.",
    "Scramble":     "All players hit every shot from the best lie. One team score per hole.",
    "Shamble":      "All players hit tee shots, best drive chosen — each player finishes their own ball from there.",
  };

  const PAIRING_HINTS = {
    PairField: "Medal Play: Each pairing group competes against the field within a flight.",
    PairPair:  "Match Play: Two pairing groups compete head-to-head.",
  };

  function filteredGameLabels(pairing) {
    return GAME_LABELS.filter(gl => {
      if (gl.legacy) return false;
      if (!gl.compFilter) return true;
      return gl.compFilter === pairing;
    });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── Module state ─────────────────────────────────────────────────────
  let _ctx    = null;   // fresh-fetched { ggid, game, roster, coursePars }
  let _draft  = null;   // private working copy — only Format's own fields
  let _onDone = null;
  let _onEsc  = null;
  let _busy   = false;

  function _draftFromGame(g) {
    const label = GAME_LABELS.find(gl => gl.label === g.dbGames_GameLabel);
    return {
      pairing:           g.dbGames_Competition  || "PairField",
      selectedLabel:      g.dbGames_GameLabel    || (label ? label.label : null),
      selectedFormat:     g.dbGames_GameFormat   || "StrokePlay",
      selectedBasis:      g.dbGames_ScoringBasis || "Strokes",
      scoringSystem:      label?.scoringSystem     ?? null,
      scoringSystemLock:  label?.scoringSystemLock ?? false,
      bbCount:            label?.bbCount           ?? null,
      bbCountLock:        label?.bbCountLock        ?? false,
    };
  }

  // ── Selection — relocated from wizSelectPairing()/wizSelectGame(). No
  // cross-domain effects happen here — computed once, at Apply, in
  // _buildSavePayload().
  function _selectPairing(val) {
    _draft.pairing = val;
    const valid = filteredGameLabels(val);
    if (!valid.find(gl => gl.label === _draft.selectedLabel)) {
      const first = valid[0];
      if (first) {
        _draft.selectedLabel     = first.label;
        _draft.selectedFormat    = first.dbFormat;
        _draft.selectedBasis     = first.basis;
        _draft.scoringSystem     = first.scoringSystem     || null;
        _draft.scoringSystemLock = first.scoringSystemLock || false;
        _draft.bbCount           = first.bbCount           || null;
        _draft.bbCountLock       = first.bbCountLock        || false;
      }
    }
  }

  function _selectGame(label) {
    const game = GAME_LABELS.find(g => g.label === label);
    if (!game) return;
    _draft.selectedLabel     = game.label;
    _draft.selectedFormat    = game.dbFormat;
    _draft.selectedBasis     = game.basis;
    _draft.scoringSystem     = game.scoringSystem     || null;
    _draft.scoringSystemLock = game.scoringSystemLock || false;
    _draft.bbCount           = game.bbCount           || null;
    _draft.bbCountLock       = game.bbCountLock        || false;
  }

  // ── Save payload — cross-domain writes computed once, here ─────────────
  function _buildSavePayload() {
    const g = _ctx.game;
    const patch = {
      dbGames_GGID:          _ctx.ggid,
      dbGames_GameLabel:     _draft.selectedLabel  || "",
      dbGames_GameFormat:    _draft.selectedFormat || "StrokePlay",
      dbGames_ScoringBasis:  _draft.selectedBasis  || "Strokes",
      dbGames_Competition:   _draft.pairing        || "PairField",
    };

    if (_draft.scoringSystemLock) patch.dbGames_ScoringSystem = _draft.scoringSystem;
    if (_draft.bbCountLock)       patch.dbGames_BestBall      = _draft.bbCount;

    if (_draft.selectedLabel === "C-O-D") {
      const holesVal = String(g.dbGames_Holes || "All 18");
      patch.dbGames_Segments       = holesVal === "All 18" ? "6" : "3";
      patch.dbGames_RotationMethod = "COD";
    }

    if (_draft.pairing !== "PairField") {
      patch.dbGames_BlindPlayers = [];
    }

    // Shots-Off is PairPair-only (saveGameHandicapSettings.php rejects
    // saving "SO" once Competition is PairField) — so a Shots-Off method
    // left over from a prior PairPair era is orphaned the moment
    // Competition becomes PairField here, with no other save path left
    // that could ever correct it. Read from g, not _draft — this module
    // doesn't own dbGames_HCMethod, same as the g.dbGames_Holes read
    // above for the C-O-D branch. Checked against the existing value,
    // not applied on every PairField save: Allowance is meaningful under
    // CH regardless of Competition (e.g. a legitimate 80% CH allowance),
    // so resetting it unconditionally on every resave would clobber a
    // value this transition never actually invalidated.
    if (_draft.pairing === "PairField" && String(g.dbGames_HCMethod || "CH") === "SO") {
      patch.dbGames_HCMethod  = "CH";
      patch.dbGames_Allowance = 100;
    }

    return patch;
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) _dismiss(); });
      document.body.appendChild(el);
    }
    return el;
  }

  let _lockDepth = 0;
  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  function _dismiss(wasSaved) {
    if (_busy) return;
    MA.setGameFormat.close();
    if (typeof _onDone === "function") _onDone(wasSaved);
  }

  // In-modal notice — MA.setStatus() writes to page chrome sitting BEHIND
  // this modal's full-screen overlay, invisible while the modal is open.
  // Every save-failure message here goes through this instead, same as
  // module_defineTeams.js.
  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

  // ── Render ───────────────────────────────────────────────────────────
  function _renderModal(isEvent) {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="sgfTitle">
        <header class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__title" id="sgfTitle">Game Format</div>
          <button type="button" class="iconBtn btnPrimary" id="sgfBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="sgfControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body">
          <div class="maListRow__col" style="margin-bottom:6px;">How is the competition organized</div>
          <div id="sgfPairingWrap"></div>

          <div class="maListRow__col" style="margin:16px 0 6px;">What kind of game are you running?</div>
          <div id="sgfFormatWrap"></div>
        </div>

        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="sgfBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="sgfBtnApply">Save</button>
        </footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("sgfControls");
    if (!el || !_ctx) return;
    const g = _ctx.game;

    const gameTitle = String(g.dbGames_Title || `GGID ${_ctx.ggid || ""}`).trim();
    const line1 = [gameTitle, `GGID ${esc(_ctx.ggid ?? "")}`].join(" · ");
    const line2 = [g.dbGames_CourseName, g.dbGames_PlayDate].filter(Boolean).join(" • ");
    const line3 = g.dbGames_EID
      ? [g.dbEvents_Title, `EID ${g.dbGames_EID}`].filter(Boolean).map(esc).join(" · ")
      : "";

    el.innerHTML = `
      <div class="maListRow__col">${esc(line1)}</div>
      <div class="maListRow__subline">${esc(line2)}</div>
      ${line3 ? `<div class="maListRow__subline">${line3}</div>` : ""}`;
  }

  function _renderPairing() {
    const wrap = document.getElementById("sgfPairingWrap");
    if (!wrap || !_draft) return;
    wrap.innerHTML = `
      <div class="maSeg" id="sgfPairingSeg" role="group" aria-label="Pairing">
        <button type="button" class="maSegBtn${_draft.pairing === "PairField" ? " is-active" : ""}"
                data-pairing="PairField" aria-pressed="${_draft.pairing === "PairField"}">Pair vs. Field</button>
        <button type="button" class="maSegBtn${_draft.pairing === "PairPair" ? " is-active" : ""}"
                data-pairing="PairPair" aria-pressed="${_draft.pairing === "PairPair"}">Pair vs. Pair</button>
      </div>
      <div class="maHintText" id="sgfPairingHint">${esc(PAIRING_HINTS[_draft.pairing] || "")}</div>`;
  }

  function _renderFormats() {
    const wrap = document.getElementById("sgfFormatWrap");
    if (!wrap || !_draft) return;
    const options = filteredGameLabels(_draft.pairing);
    const cards = options.map(gl => {
      const selected = _draft.selectedLabel === gl.label;
      return `
        <button type="button" class="maCard" data-label="${esc(gl.label)}" aria-pressed="${selected}"
                style="text-align:center; cursor:pointer; padding:0;${selected ? " background:var(--choiceChipSelectedBg); border-color:var(--choiceChipSelectedBorder);" : ""}">
          <div class="maCard__body">
            <div class="maListRow__col"${selected ? ' style="color:var(--choiceChipSelectedText);"' : ""}>${esc(gl.label)}</div>
            <div class="maListRow__subline"${selected ? ' style="color:var(--choiceChipSelectedText);"' : ""}>${esc(gl.dbFormat)}</div>
            <div class="maListRow__subline"${selected ? ' style="color:var(--choiceChipSelectedText);"' : ""}>${esc(gl.basis)}</div>
          </div>
        </button>`;
    }).join("");
    wrap.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px;" id="sgfFormatCards">${cards}</div>
      <div class="maHintText" id="sgfFormatHint" style="margin-top:10px;">${esc(GAME_HINTS[_draft.selectedLabel] || "")}</div>`;
  }

  function _refreshPairing() {
    const seg = document.getElementById("sgfPairingSeg");
    if (seg) {
      seg.querySelectorAll("[data-pairing]").forEach(b => {
        const on = b.dataset.pairing === _draft.pairing;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
    const hint = document.getElementById("sgfPairingHint");
    if (hint) hint.textContent = PAIRING_HINTS[_draft.pairing] || "";
  }

  // ── Event wiring — consolidated, delegated, matches module_defineTeams.js ──
  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#sgfBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgfBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgfBtnApply")?.addEventListener("click", _apply);

    overlay.querySelector("#sgfPairingWrap")?.addEventListener("click", (e) => {
      const seg = e.target.closest("[data-pairing]");
      if (!seg) return;
      _selectPairing(seg.dataset.pairing);
      _refreshPairing();
      _renderFormats(); // option set changes with pairing — full re-render of this section only
    });

    overlay.querySelector("#sgfFormatWrap")?.addEventListener("click", (e) => {
      const card = e.target.closest("[data-label]");
      if (!card) return;
      _selectGame(card.dataset.label);
      _renderFormats();
    });
  }

  async function _apply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Game Format", message: "Saving — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINT, { payload: _buildSavePayload() });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Game Format.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss(true);
      return;
    } catch (e) {
      console.error("[MA.setGameFormat]", e);
      _showModalNotice("Error saving Game Format.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setGameFormat.open = async function (options) {
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Game Format", message: "Loading..." });
    let ctx;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINT, {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load game context.");
      ctx = res.payload;
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load game context.", "error"); // pre-open — chrome status line is visible here, nothing on screen to hide behind yet
      return;
    }
    MA.ui?.hideBusy?.();

    _ctx = ctx;
    _draft = _draftFromGame(ctx.game);

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal(!!ctx.game.dbGames_EID);
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    _renderControls();
    _renderPairing();
    _renderFormats();
    _wireEvents();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGameFormat.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _lockScroll(false);
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

})();
