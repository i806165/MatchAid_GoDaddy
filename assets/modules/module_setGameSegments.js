/* /assets/modules/module_setGameSegments.js
 *
 * MA.setGameSegments — Segments editor module.
 * Owns: dbGames_Holes, dbGames_Segments,
 *       dbGames_RotationMethod, dbGames_StrokeDistribution.
 * dbGames_Segments represents Playing Segments.
 * dbGames_ScoringSegments belongs to module_setGamePlacementPoints.js
 * and is not read, derived, or written by this module.
 *
 * Zero injected CSS. All classes come from ma_shared.css — modal, choice
 * chips, action-menu category headers, hint text.
 *
 * Public API:
 *   MA.setGameSegments.open({ onDone })
 *   MA.setGameSegments.close()
 *
 * Self-hydrating: no game data passed in. GGID comes from session
 * server-side. Fetches its own complete context on open — host-agnostic.
 * Every read below (Competition, Game Label, Scoring Method) comes from
 * that same complete context, same as every other module in this family —
 * there is no cross-module dependency to manage, every module already has
 * the whole record.
 *
 * Built correctly from day one: onDone fires on every exit path (Apply,
 * Cancel, backdrop, Escape). MA.ui.showModalNotice()/hideModalNotice() for
 * in-modal errors, not MA.setStatus() (invisible behind an open modal).
 *
 * ── Holes now lives here, not just Game Maintenance ─────────────────────
 * Same field (dbGames_Holes), two live editors — same accepted pattern
 * already in place for Handicaps (Roster + Game Settings). Bringing it
 * into this module also resolves what used to be an external read:
 * buildSegmentsOptionsFromHoles() and the Stroke Allocation hint's
 * spin-count math both depend on dbGames_Holes, and it's now edited in
 * the same module that reads it.
 *
 * ── Cross-domain writes ──────────────────────────────────────────────────
 * None. This module reads Competition, Game Label, and Scoring Method
 * from the hydrated Game only to determine valid UI choices.
 *
 * It does not read or write dbGames_ScoringSegments. That field controls
 * match-result scoring periods and belongs to Placement Points.
 *
 * ── Relocated verbatim from game_settings.js ─────────────────────────────
 * buildSegmentsOptionsFromHoles(), buildRotationOptions(),
 * defaultSegmentsForLabel(), and the Rotation hint text in wizUpdateRotNote().
 * Stroke Allocation's lock condition (!isAdjGross && rotation === "COD")
 * relocated verbatim from wizRenderStep4(); its labels/hints are NEW
 * copy, not ported — see strokeDistOptions below.
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * Save endpoint below (/api/game_settings/saveGameSegments.php) does not
 * exist yet — same open endpoint-architecture question as Format.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameSegments = MA.setGameSegments || {};

  const OVERLAY_ID = "maSetGameSegmentsOverlay";
  const NOTICE_ID  = "sgsNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameSegments.php"; // TODO — does not exist yet

  // ── Data tables ──────────────────────────────────────────────────────
  const HOLES_OPTIONS = [
    { label: "All 18", value: "All 18" },
    { label: "F9",      value: "F9"     },
    { label: "B9",      value: "B9"     },
  ];

  const rotationBase = [{ label: "None", value: "None" }];
  const rotationCOD  = { label: "COD",  value: "COD"  };
  const rotation1324 = { label: "1324", value: "1324" };
  const rotation1423 = { label: "1423", value: "1423" };

  // New copy, not ported — see header note.
  const strokeDistOptions = [
    { label: "Allocate normally", value: "Standard",
      hint: "Players receive strokes per course rating." },
    { label: "Handicap Trimmed", value: "Balanced",
      hint: "A players handicap is divided by segment count, and allocated across segments based on hole difficulty within each segment. Remainders dropped." },
    { label: "Handicap Rounded", value: "Balanced-Rounded",
      hint: "A players handicap is divided by segment count, rounded up/down, and allocated across segments based on hole difficulty within each segment." },
  ];

  // ── Relocated verbatim from game_settings.js ────────────────────────
  // 9-hole round: 3's (three 3-hole segments) is the original option; 9's
  // (one segment spanning the whole round, no sub-division) is now also
  // valid — added per direct correction, not ported. When segments="9" on
  // a 9-hole round, buildRotationOptions() below locks Rotation to None
  // (there's only one segment, nothing to rotate between), rather than the
  // old approach of hiding the option to prevent 1324/1423 from applying.
  function buildSegmentsOptionsFromHoles(holesVal) {
    if (holesVal === "F9" || holesVal === "B9") {
      return [{ label: "3's", value: "3" }, { label: "9's", value: "9" }];
    }
    return [{ label: "6's", value: "6" }, { label: "9's", value: "9" }];
  }

  // holesVal disambiguates what segments="9" means: two 9-hole segments on
  // an 18-hole round (1324/1423 rotation meaningful) vs one single 9-hole
  // segment on a 9-hole round (no rotation possible — None only).
  function buildRotationOptions(segmentsValue, competitionValue, holesVal) {
    const seg  = String(segmentsValue    || "9");
    const comp = String(competitionValue || "PairField");
    if (comp === "PairField") return rotationBase.slice();
    const opts = rotationBase.slice();
    const isNineHoleRound = (holesVal === "F9" || holesVal === "B9");
    if (seg === "6" || seg === "3") opts.push(rotationCOD);
    if (seg === "9" && !isNineHoleRound) opts.push(rotation1324, rotation1423);
    return opts;
  }

  function defaultSegmentsForLabel(gameLabel, holesVal) {
    if (gameLabel === "C-O-D") return (holesVal === "All 18") ? "6" : "3";
    return (holesVal === "F9" || holesVal === "B9") ? "3" : "9";
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── Module state ─────────────────────────────────────────────────────
  let _ctx    = null;   // fresh-fetched { ggid, game, roster, coursePars }
  let _draft  = null;   // private working copy — only Segments' own fields
  let _onDone = null;
  let _onEsc  = null;
  let _busy   = false;

  function _draftFromGame(g) {
    return {
      holes:               g.dbGames_Holes              || "All 18",
      segments:            g.dbGames_Segments            || "9",
      rotation:            g.dbGames_RotationMethod      || "None",
      strokeDistribution:  g.dbGames_StrokeDistribution  || "Standard",
    };
  }

  // Runs the same validation _selectHoles()/_selectSegments() apply on
  // every manual change — but _draftFromGame() itself never called it, so
  // stored data that predates a rule change (or a Holes edit made from
  // Game Maintenance since this was last saved) rendered uncorrected on
  // first open. Called once, right after _draftFromGame(), before the
  // first render.
  function _normalizeDraft() {
    const segOpts = buildSegmentsOptionsFromHoles(_draft.holes);
    const validSegs = segOpts.map(o => o.value);
    if (!validSegs.includes(_draft.segments)) {
      const def = defaultSegmentsForLabel(_gameLabel(), _draft.holes);
      _draft.segments = validSegs.includes(def) ? def : validSegs[0];
    }
    _syncRotationAfterSegmentsChange();
    if (!_allowStrokeDist()) _draft.strokeDistribution = "Standard";
  }

  // isAdjGross/pairing/gameLabel are reads from the full context — every
  // module hydrates the whole game record, there is no dependency here.
  function _isAdjGross() { return _ctx.game.dbGames_ScoringMethod === "ADJ GROSS"; }
  function _pairing()    { return _ctx.game.dbGames_Competition   || "PairField"; }
  function _gameLabel()  { return _ctx.game.dbGames_GameLabel     || null; }

  function _allowStrokeDist() {
    return !_isAdjGross() && _draft.rotation === "COD";
  }

  // ── Selection — no cross-domain effects, computed once at Apply ─────
  function _selectHoles(val) {
    _draft.holes = val;
    // Holes changing redefines what each segment VALUE means — "9" is two
    // 9-hole segments on an 18-hole round, one whole-round segment on a
    // 9-hole round. Always re-derive the default here rather than
    // preserve the prior selection just because the same value string
    // also happens to be valid in the new option set — a "9" carried over
    // from an 18-hole context isn't the same choice on a 9-hole one.
    const segOpts = buildSegmentsOptionsFromHoles(val);
    const validSegs = segOpts.map(o => o.value);
    const def = defaultSegmentsForLabel(_gameLabel(), val);
    _draft.segments = validSegs.includes(def) ? def : validSegs[0];
    _syncRotationAfterSegmentsChange();
  }

  function _selectSegments(val) {
    _draft.segments = val;
    _syncRotationAfterSegmentsChange();
  }

  function _syncRotationAfterSegmentsChange() {
    const rotOpts = buildRotationOptions(_draft.segments, _pairing(), _draft.holes);
    const validRot = rotOpts.map(o => o.value);
    if (!validRot.includes(_draft.rotation)) _draft.rotation = validRot[0] || "None";
    if (_gameLabel() === "C-O-D") _draft.rotation = "COD";
  }

  function _selectRotation(val) {
    _draft.rotation = val;
    if (!_allowStrokeDist()) _draft.strokeDistribution = "Standard";
  }

  function _selectStrokeDist(val) {
    if (!_allowStrokeDist()) return;
    _draft.strokeDistribution = val;
  }

  // ── Save payload ─────────────────────────────────────────────────────
function _buildSavePayload() {
  return {
    dbGames_GGID:
      _ctx.ggid,

    dbGames_Holes:
      _draft.holes,

    // Playing Segments only: 3, 6, or 9.
    dbGames_Segments:
      _draft.segments,

    dbGames_RotationMethod:
      _draft.rotation,

    dbGames_StrokeDistribution:
      _allowStrokeDist()
        ? _draft.strokeDistribution
        : "Standard",
  };
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
    MA.setGameSegments.close();
    if (typeof _onDone === "function") _onDone(wasSaved);
  }

  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

  // ── Render ───────────────────────────────────────────────────────────
  function _renderModal(isEvent) {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="sgsTitle">
        <header class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__title" id="sgsTitle">Segments</div>
          <button type="button" class="iconBtn btnPrimary" id="sgsBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="sgsControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body">
          <div class="maCard">

            <div class="actionMenu_category">Holes</div>
            <div style="padding:14px;" id="sgsHolesWrap"></div>

            <div id="sgsPairPairOnly">
              <div class="actionMenu_category">Playing Segments</div>
              <div style="padding:14px;" id="sgsSegmentsWrap"></div>

              <div class="actionMenu_category">Rotation Method</div>
              <div style="padding:14px;" id="sgsRotationWrap"></div>
            </div>

            <div class="actionMenu_category">Handicap Allocation Method</div>
            <div style="padding:14px;" id="sgsStrokeDistWrap"></div>

          </div>
        </div>

        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="sgsBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="sgsBtnApply">Save</button>
        </footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("sgsControls");
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

  function _chipRow(options, selectedVal, dataAttr) {
    return options.map(opt => `
      <button type="button" class="maChoiceChip${selectedVal === opt.value ? " is-selected" : ""}"
              data-${dataAttr}="${esc(opt.value)}" aria-pressed="${selectedVal === opt.value}">${esc(opt.label)}</button>
    `).join("");
  }

  function _renderHoles() {
    const wrap = document.getElementById("sgsHolesWrap");
    if (!wrap || !_draft) return;
    wrap.innerHTML = `<div class="maChoiceChips">${_chipRow(HOLES_OPTIONS, _draft.holes, "holes")}</div>`;
  }

  function _renderSegments() {
    const wrap = document.getElementById("sgsSegmentsWrap");
    if (!wrap || !_draft) return;
    const opts = buildSegmentsOptionsFromHoles(_draft.holes);
    wrap.innerHTML = `
      <div class="maChoiceChips">${_chipRow(opts, _draft.segments, "segments")}</div>
      <div class="maHintText" style="margin-top:8px;">Segments split the round into independent scoring periods. 3's play three 3-hole segments (9-hole games only). 6's plays three 6-hole segments and 9's plays as two 9-hole segments (18 hole games).</div>`;
  }

  function _rotationHint() {
    const seg = _draft.segments, rot = _draft.rotation;
    if (_pairing() === "PairField") return "";
    if (seg === "9") return rot !== "None" ? "Partners rotate between the two 9-hole segments." : "";
    if (seg === "6" || seg === "3") {
      return rot === "COD" ? "COD rotation — partners change each segment." : "Select COD to rotate partners.";
    }
    return "";
  }

  function _renderRotation() {
    const wrap = document.getElementById("sgsRotationWrap");
    if (!wrap || !_draft) return;
    const opts = buildRotationOptions(_draft.segments, _pairing(), _draft.holes);
    const isCOD = _gameLabel() === "C-O-D";
    const chips = opts.map(opt => {
      const locked = isCOD && opt.value === "COD";
      const disabled = isCOD && opt.value !== "COD";
      const cls = locked || disabled ? "maChoiceChip is-disabled" : `maChoiceChip${_draft.rotation === opt.value ? " is-selected" : ""}`;
      return `<button type="button" class="${cls}" data-rotation="${esc(opt.value)}"
                ${disabled ? "disabled" : ""} aria-pressed="${_draft.rotation === opt.value}">${esc(opt.label)}</button>`;
    }).join("");
    const hint = _rotationHint();
    wrap.innerHTML = `
      <div class="maChoiceChips">${chips}</div>
      ${hint ? `<div class="maHintText" style="margin-top:8px;">${esc(hint)}</div>` : ""}`;
  }

  function _renderStrokeDist() {
    const wrap = document.getElementById("sgsStrokeDistWrap");
    if (!wrap || !_draft) return;
    const allow = _allowStrokeDist();
    const rows = strokeDistOptions.map(opt => {
      if (!allow && opt.value !== "Standard") return "";
      const locked = !allow && opt.value === "Standard";
      const selected = _draft.strokeDistribution === opt.value || (!allow && opt.value === "Standard");
      const cls = `maChoiceChip${selected ? " is-selected" : ""}`;
      return `<button type="button" class="${cls}" style="display:block; width:100%; text-align:left;"
                data-strokedist="${esc(opt.value)}" ${locked ? "disabled" : ""}
                aria-pressed="${selected}">${esc(opt.label)}</button>`;
    }).join("");
    const selectedOpt = strokeDistOptions.find(o => o.value === (allow ? _draft.strokeDistribution : "Standard"));
    wrap.innerHTML = `
      <div class="maHintText" style="margin-bottom:10px;">Choose how player handicaps are allocated across playing segments.</div>
      <div style="display:flex; flex-direction:column; gap:8px;">${rows}</div>
      <div class="maHintText" style="margin-top:8px;">${esc(selectedOpt?.hint || "")}</div>`;
  }

  function _renderAll() {
    const pairPairOnly = document.getElementById("sgsPairPairOnly");
    if (pairPairOnly) pairPairOnly.style.display = (_pairing() === "PairPair") ? "" : "none";
    _renderHoles();
    _renderSegments();
    _renderRotation();
    _renderStrokeDist();
  }

  // ── Event wiring — consolidated, delegated ──────────────────────────
  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#sgsBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgsBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgsBtnApply")?.addEventListener("click", _apply);

    overlay.querySelector("#sgsHolesWrap")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-holes]");
      if (!chip) return;
      _selectHoles(chip.dataset.holes);
      _renderAll();
    });

    overlay.querySelector("#sgsSegmentsWrap")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-segments]");
      if (!chip || chip.disabled) return;
      _selectSegments(chip.dataset.segments);
      _renderAll();
    });

    overlay.querySelector("#sgsRotationWrap")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-rotation]");
      if (!chip || chip.disabled) return;
      _selectRotation(chip.dataset.rotation);
      _renderAll();
    });

    overlay.querySelector("#sgsStrokeDistWrap")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-strokedist]");
      if (!chip || chip.disabled) return;
      _selectStrokeDist(chip.dataset.strokedist);
      _renderStrokeDist();
    });
  }

  async function _apply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Segments", message: "Saving — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINT, { payload: _buildSavePayload() });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Segments.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss(true);
      return;
    } catch (e) {
      console.error("[MA.setGameSegments]", e);
      _showModalNotice("Error saving Segments.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setGameSegments.open = async function (options) {
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Segments", message: "Loading..." });
    let ctx;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINT, {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load game context.");
      ctx = res.payload;
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load game context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();

    _ctx = ctx;
    _draft = _draftFromGame(ctx.game);
    _normalizeDraft();

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal(!!ctx.game.dbGames_EID);
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    _renderControls();
    _renderAll();
    _wireEvents();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGameSegments.close = function () {
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
