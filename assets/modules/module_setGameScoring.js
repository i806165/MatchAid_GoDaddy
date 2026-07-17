/* /assets/modules/module_setGameScoring.js
 *
 * MA.setGameScoring — Scoring editor module.
 * Owns: dbGames_ScoringMethod, dbGames_ScoringSystem, dbGames_BestBall,
 *       dbGames_HoleDeclaration, dbGames_PointsConfig.
 *
 * dbGames_PointsConfig.strategy is the sole source of truth for the
 * selected Points strategy. There is no separate strategy field.
 *
 * Zero injected CSS. All classes come from ma_shared.css.
 *
 * ── Internal view-switching, not inline expansion ────────────────────────
 * Scores Per Hole and Points Config no longer expand inline in the main
 * view. Both get their own dedicated internal view — same modal, same
 * overlay, same self-hydrated _ctx/_draft — with a full-width body instead
 * of squeezed into a growing list, and a Back button returning to _view =
 * "main". A mini router, not three separate modals: _renderBody() swaps
 * what's inside .maModal__body based on _view; header/controls/footer
 * never change.
 *
 * Public API:
 *   MA.setGameScoring.open({ onDone })
 *   MA.setGameScoring.close()
 *
 * Self-hydrating: no game data passed in. GGID comes from session
 * server-side. Fetches its own complete context on open — host-agnostic.
 *
 * Built correctly from day one: onDone fires on every exit path (Apply,
 * Cancel, backdrop, Escape). MA.ui.showModalNotice()/hideModalNotice() for
 * in-modal errors, not MA.setStatus().
 *
 * ── GAME_LABELS duplicated here, deliberately ────────────────────────────
 * scoringSystemLock/bbCountLock aren't stored columns — derived by looking
 * up dbGames_GameLabel against GAME_LABELS, the same table Format owns.
 * Duplicated verbatim (same convention every module in this family
 * follows). Real drift risk if edited in one file and not the other —
 * flagged, not solved.
 *
 * ── Cross-domain write owned by THIS module's save ──────────────────────
 * Scoring Method GROSS -> NET transition resets Handicaps' own fields:
 * dbGames_HCMethod = "CH", dbGames_Allowance = 100. One-directional,
 * detected by comparing the ORIGINALLY hydrated dbGames_ScoringMethod
 * against the draft's current value at save time.
 *
 * ── Deprecated Hole Declaration modal — relocated as an internal view ───
 * The old #gsHoleDeclOverlay modal is gone. Its logic (Set All, Front/Back
 * 9, par-text lookup) is now _view = "holes". No stepper class exists
 * anywhere in ma_shared.css — built from .iconBtn + a plain number input,
 * flagged as unverified, not a proven component.
 *
 * ── Stableford / Chicago grid — editable, not the ported behavior ───────
 * wizRenderPointsConfigSections() used a FIXED 6-row template. Rows are
 * now addable/removable for Stableford and Chicago only, inside _view =
 * "points". Nines stays the original fixed 2-row structure. Names
 * ("Albatross", "Eagle"...) only apply to the original six relToPar
 * values; anything added beyond that shows its raw number.
 *
 * ── Removed entirely ──────────────────────────────────────────────────────
 * Placement Points — lives in its own module, its own menu row.
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * Save endpoint below (/api/game_settings/saveGameScoring.php) does not
 * exist yet.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameScoring = MA.setGameScoring || {};

  const OVERLAY_ID = "maSetGameScoringOverlay";
  const NOTICE_ID  = "sgcNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameScoring.php"; // TODO — does not exist yet

  const GAME_LABELS = [
    { label: "Stroke Play",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Points",       scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Skins",        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Medal Match",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Four Ball",    scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Skins Match",  scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Points Match", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Alt-Shot",     scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Chapman",      scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Scramble",     scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Shamble",      scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "C-O-D",        scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
  ];

  const WIZ_SYSTEMS = {
    AllScores:     { label: "All Scores",             hint: "Every player's score counts on every hole." },
    BestBall:      { label: "Best Ball",              hint: "The lowest N scores from the team count on each hole." },
    DeclareHole:   { label: "Best Ball per Hole",     hint: "The administrator sets how many scores count on each hole before the round." },
    DeclareManual: { label: "Players Decide",         hint: "Players declare which scores count at their own discretion." },
  };

  const POINTS_STRATEGIES = [
    { strategy: "Stableford",      label: "Stableford",          compFilter: "both",     hint: "Points awarded per hole based on score relative to par.",                                                              hasConfig: true },
    { strategy: "Nines",           label: "9's",                 compFilter: "PairPair", hint: "A pool of 9 points is distributed each hole by finish position within the group.",                                     hasConfig: true },
    { strategy: "LowBallLowTotal", label: "Low-Ball / Low-Total", compFilter: "PairPair", hint: "1 point for the side with the lowest individual score, 1 point for the lowest combined team score.",                   hasConfig: false },
    { strategy: "LowBallHighBall", label: "Low-Ball / High-Ball", compFilter: "PairPair", hint: "1 point for the side with the lowest individual score, 1 point for the side with the lower high score between partners.", hasConfig: false },
    { strategy: "Vegas",           label: "Vegas",                compFilter: "PairPair", hint: "Each side's scores combine into a two-digit number. The difference between the two numbers determines points won or lost per hole.", hasConfig: false },
    { strategy: "Chicago",         label: "Chicago",              compFilter: "both",     hint: "Each player has a points quota based on handicap. The winner is whoever most exceeds their quota.",                    hasConfig: true },
  ];

  const STABLEFORD_TEMPLATE = [
    { reltoPar: -3, points: 5 }, { reltoPar: -2, points: 4 }, { reltoPar: -1, points: 3 },
    { reltoPar: 0,  points: 2 }, { reltoPar: 1,  points: 1 }, { reltoPar: 2,  points: 0 },
  ];
  const RELTOPAR_NAMES = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Dbl Bogey" };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function filteredPointsStrategies(pairing) {
    return POINTS_STRATEGIES.filter(ps => ps.compFilter === "both" || ps.compFilter === pairing);
  }

  let _ctx    = null;
  let _draft  = null;
  let _origScoringMethod = null;
  let _coursePars = {};
  let _onDone = null;
  let _onEsc  = null;
  let _busy   = false;
  let _rowSeq = 0;
  let _view   = "main"; // "main" | "holes" | "points"
  let _stagedHoleDecls = null;
  let _stagedStablefordRows = null;
  let _stagedNinesValues = null;

  function _buildCourseParsByHole(arr) {
    const map = {};
    if (!Array.isArray(arr)) return map;
    for (const p of arr) {
      const holeNum = Number(p?.hole);
      if (!Number.isFinite(holeNum)) continue;
      const parText = String(p?.parText || "").trim();
      if (parText) { map[holeNum] = parText; continue; }
      const par = Number(p?.par);
      if (Number.isFinite(par)) map[holeNum] = `Par ${par}`;
    }
    return map;
  }

  function _draftFromGame(g) {
    let holeDecls = g.dbGames_HoleDeclaration;
    if (typeof holeDecls === "string") { try { holeDecls = JSON.parse(holeDecls); } catch (e) { holeDecls = []; } }
    if (!Array.isArray(holeDecls)) holeDecls = [];
    const holesByNum = {};
    holeDecls.forEach(r => { holesByNum[Number(r.hole)] = Number(r.count) || 1; });
    const fullHoleDecls = [];
    for (let h = 1; h <= 18; h++) fullHoleDecls.push({ hole: h, count: holesByNum[h] ?? 1 });

    let pointsConfig = g.dbGames_PointsConfig;
    if (typeof pointsConfig === "string") { try { pointsConfig = JSON.parse(pointsConfig); } catch (e) { pointsConfig = {}; } }
    if (!pointsConfig || typeof pointsConfig !== "object") pointsConfig = {};

    const strategy =
        typeof pointsConfig.strategy === "string" &&
        pointsConfig.strategy.trim() !== ""
          ? pointsConfig.strategy.trim()
          : null;
    let stablefordRows = [];
    if (strategy === "Stableford" || strategy === "Chicago") {
      const saved = Array.isArray(pointsConfig.values) ? pointsConfig.values : STABLEFORD_TEMPLATE;
      stablefordRows = saved.map(r => ({ id: `r${_rowSeq++}`, reltoPar: r.reltoPar, points: r.points }));
    }
    let ninesValues = { "4": [5, 3, 1, 0], "3": [4, 3, 2] };
    if (strategy === "Nines" && pointsConfig.values && typeof pointsConfig.values === "object") {
      ninesValues = {
        "4": Array.isArray(pointsConfig.values["4"]) ? pointsConfig.values["4"] : ninesValues["4"],
        "3": Array.isArray(pointsConfig.values["3"]) ? pointsConfig.values["3"] : ninesValues["3"],
      };
    }

    return {
      scoringMethod:  g.dbGames_ScoringMethod  || "NET",
      scoringSystem:  g.dbGames_ScoringSystem  || "AllScores",
      bestBall:       g.dbGames_BestBall       || null,
      holeDecls:      fullHoleDecls,
      pointsStrategy: strategy,
      stablefordRows,
      ninesValues,
    };
  }

  function _pairing()    { return _ctx.game.dbGames_Competition  || "PairField"; }
  function _gameLabel()  { return _ctx.game.dbGames_GameLabel    || null; }
  function _basis()      { return _ctx.game.dbGames_ScoringBasis || "Strokes"; }
  function _labelMatch() { return GAME_LABELS.find(gl => gl.label === _gameLabel()) || null; }
  function _currentStrategyDef() { return POINTS_STRATEGIES.find(ps => ps.strategy === _draft.pointsStrategy) || null; }

  function _selectMethod(val) { _draft.scoringMethod = val; }

  function _selectSystem(val) {
    _draft.scoringSystem = val;
    if (val !== "BestBall") _draft.bestBall = null;
    else if (!_draft.bestBall) _draft.bestBall = _bbOptions()[0] || "1";
  }

  function _selectBestBall(val) { _draft.bestBall = val; }

  function _bbOptions() {
    const teamFmts = ["Scramble", "Shamble", "AltShot", "Chapman"];
    const fmt = _ctx.game.dbGames_GameFormat;
    if (teamFmts.includes(fmt)) return ["1"];
    if (fmt === "MatchPlay") return ["1", "2"];
    return ["1", "2", "3", "4"];
  }

  function _selectPointsStrategy(val) {
    _draft.pointsStrategy = val;
    if ((val === "Stableford" || val === "Chicago") && !_draft.stablefordRows.length) {
      _draft.stablefordRows = STABLEFORD_TEMPLATE.map(r => ({ id: `r${_rowSeq++}`, reltoPar: r.reltoPar, points: r.points }));
    }
  }

  function _holeDeclSummary() {
    const nonDefault = _draft.holeDecls.filter(r => r.count !== 1).length;
    return nonDefault ? `${nonDefault} of 18 holes customized` : "All holes default to 1 score counted";
  }

  function _pointsConfigSummary() {
    if (_draft.pointsStrategy === "Stableford" || _draft.pointsStrategy === "Chicago") {
      return `${_draft.stablefordRows.length} point value${_draft.stablefordRows.length === 1 ? "" : "s"} configured`;
    }
    if (_draft.pointsStrategy === "Nines") return "9's distribution configured";
    return "";
  }

  function _buildSavePayload() {
    const patch = {
      dbGames_GGID:            _ctx.ggid,
      dbGames_ScoringMethod:   _draft.scoringMethod,
      dbGames_ScoringSystem:   _draft.scoringSystem,
      dbGames_BestBall:        _draft.scoringSystem === "BestBall" ? _draft.bestBall : null,
      dbGames_HoleDeclaration: _draft.scoringSystem === "DeclareHole" ? _draft.holeDecls : [],
    };

    if (_basis() === "Points") {
      const strategy = _draft.pointsStrategy || null;

      if (strategy === "Stableford" || strategy === "Chicago") {
        patch.dbGames_PointsConfig = {
          strategy,
          values: _draft.stablefordRows.map((row) => ({
            reltoPar: Number(row.reltoPar),
            points: Number(row.points),
          })),
        };

      } else if (strategy === "Nines") {
        patch.dbGames_PointsConfig = {
          strategy,
          values: {
            "4": _draft.ninesValues["4"].map(Number),
            "3": _draft.ninesValues["3"].map(Number),
          },
        };

      } else if (strategy) {
        /*
        * LowBallLowTotal, LowBallHighBall, and Vegas currently have no
        * editable configuration in this module. Their strategy is still
        * persisted in the common Points Config envelope.
        */
        patch.dbGames_PointsConfig = {
          strategy,
        };

      } else {
        patch.dbGames_PointsConfig = null;
      }

    } else {
      patch.dbGames_PointsConfig = null;
    }

    if (_origScoringMethod === "ADJ GROSS" && _draft.scoringMethod === "NET") {
      patch.dbGames_HCMethod  = "CH";
      patch.dbGames_Allowance = 100;
    }

    return patch;
  }

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

  function _dismiss() {
    if (_busy) return;
    MA.setGameScoring.close();
    if (typeof _onDone === "function") _onDone();
  }

  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

  function _renderModal(isEvent) {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="sgcTitle">
        <header class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__title" id="sgcTitle">Scoring</div>
          <button type="button" class="iconBtn btnPrimary" id="sgcBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="sgcControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body" id="sgcBody"></div>

        <footer class="maModal__ftr" id="sgcFooter"></footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("sgcControls");
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

  function _stablefordRowLabel(reltoPar) {
    return RELTOPAR_NAMES[String(reltoPar)] || `Rel. to par ${reltoPar > 0 ? "+" + reltoPar : reltoPar}`;
  }

  function _renderBody() {
    const body = document.getElementById("sgcBody");
    if (!body || !_draft) return;
    if (_view === "holes")  { body.innerHTML = _viewHoles();  _renderFooter(); return; }
    if (_view === "points") { body.innerHTML = _viewPoints(); _renderFooter(); return; }
    body.innerHTML = _viewMain();
    _renderFooter();
  }

  function _renderFooter() {
    const el = document.getElementById("sgcFooter");
    if (!el) return;
    if (_view === "main") {
      el.innerHTML = `
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="sgcBtnCancel">Cancel</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="sgcBtnSave">Save</button>`;
    } else {
      el.innerHTML = `
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="sgcBtnSubBack">Back</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="sgcBtnSubApply">Apply</button>`;
    }
  }

  function _viewMain() {
    const locked = !!_labelMatch()?.scoringSystemLock;
    const bbLocked = !!_labelMatch()?.bbCountLock;
    const isPoints = _basis() === "Points";
    const strategyDef = _currentStrategyDef();

    return `
      <div class="maCard">

        <div class="actionMenu_category">Scoring Method</div>
        <div style="padding:14px;">
          <div class="maSeg" style="width:auto;">
            <button type="button" class="maSegBtn${_draft.scoringMethod === "NET" ? " is-active" : ""}" data-method="NET">NET</button>
            <button type="button" class="maSegBtn${_draft.scoringMethod === "ADJ GROSS" ? " is-active" : ""}" data-method="ADJ GROSS">GROSS</button>
          </div>
        </div>

        <div class="actionMenu_category">Scoring System</div>
        <div style="padding:14px;">
          <div class="maChoiceChips" style="margin-bottom:6px;">
            ${Object.keys(WIZ_SYSTEMS).map(key => {
              const isDisabled = locked && _draft.scoringSystem !== key;
              const cls = isDisabled ? "maChoiceChip is-disabled" : `maChoiceChip${_draft.scoringSystem === key ? " is-selected" : ""}`;
              return `<button type="button" class="${cls}" data-system="${key}" ${isDisabled ? "disabled" : ""}>${esc(WIZ_SYSTEMS[key].label)}</button>`;
            }).join("")}
          </div>
          <div class="maHintText">${esc(WIZ_SYSTEMS[_draft.scoringSystem]?.hint || "")}</div>

          <div style="${_draft.scoringSystem === "BestBall" ? "" : "display:none;"} margin-top:14px;">
            <div class="maListRow__col" style="margin-bottom:6px;">Best Ball Count</div>
            <div class="maChoiceChips">
              ${_bbOptions().map(v => {
                const isDisabled = bbLocked && _draft.bestBall !== v;
                const cls = isDisabled ? "maChoiceChip is-disabled" : `maChoiceChip${_draft.bestBall === v ? " is-selected" : ""}`;
                return `<button type="button" class="${cls}" data-bb="${v}" ${isDisabled ? "disabled" : ""}>${esc(v)}</button>`;
              }).join("")}
            </div>
          </div>

          <div style="${_draft.scoringSystem === "DeclareHole" ? "display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:14px;" : "display:none;"}">
            <div class="maHintText" style="margin:0;">${esc(_holeDeclSummary())}</div>
            <button type="button" class="btn btnSecondary" id="sgcOpenHoles" style="flex-shrink:0;">Configure per Hole</button>
          </div>
        </div>

        <div style="${isPoints ? "" : "display:none;"}">
          <div class="actionMenu_category">Points Strategy</div>
          <div style="padding:14px;">
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:6px;">
              ${filteredPointsStrategies(_pairing()).map(ps => `
                <button type="button" class="maChoiceChip${_draft.pointsStrategy === ps.strategy ? " is-selected" : ""}"
                        style="display:block; width:100%; text-align:left;" data-strategy="${esc(ps.strategy)}">${esc(ps.label)}</button>
              `).join("")}
            </div>
            <div class="maHintText">${esc(strategyDef?.hint || "")}</div>

            <div style="${strategyDef?.hasConfig ? "display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:14px;" : "display:none;"}">
              <div class="maHintText" style="margin:0;">${esc(_pointsConfigSummary())}</div>
              <button type="button" class="btn btnSecondary" id="sgcOpenPoints" style="flex-shrink:0;">Configure Points</button>
            </div>
          </div>
        </div>

      </div>`;
  }

  function _viewHoles() {
    const rowHtml = (r) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--borderSubtle);">
        <span class="maListRow__subline">Hole ${r.hole}${_coursePars[r.hole] ? " · " + esc(_coursePars[r.hole]) : ""}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <button type="button" class="iconBtn" style="width:26px;height:26px;" data-step="-1" data-hole="${r.hole}">−</button>
          <input type="number" min="0" max="4" value="${r.count}" style="width:36px; text-align:center; border:1px solid var(--borderSubtle); border-radius:6px;" data-hole-input="${r.hole}">
          <button type="button" class="iconBtn" style="width:26px;height:26px;" data-step="1" data-hole="${r.hole}">+</button>
        </div>
      </div>`;
    return `
      <div class="maCard">
        <div class="actionMenu_category">Scores Per Hole</div>
        <div style="padding:14px;">
          <div class="maHintText" style="margin-bottom:10px;">Set how many scores count per hole. Use Set All to apply one value, then adjust individually.</div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
            <span class="maListRow__col">Set all holes to:</span>
            <div class="maChoiceChips">
              ${[0,1,2,3,4].map(n => `<button type="button" class="maChoiceChip" data-setall="${n}">${n}</button>`).join("")}
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
            <div>
              <div class="maListRow__col" style="margin-bottom:8px;">Front 9</div>
              ${_stagedHoleDecls.filter(r => r.hole <= 9).map(rowHtml).join("")}
            </div>
            <div>
              <div class="maListRow__col" style="margin-bottom:8px;">Back 9</div>
              ${_stagedHoleDecls.filter(r => r.hole > 9).map(rowHtml).join("")}
            </div>
          </div>
        </div>
      </div>`;
  }

  function _viewPoints() {
    const isStableford = _draft.pointsStrategy === "Stableford" || _draft.pointsStrategy === "Chicago";
    const isNines = _draft.pointsStrategy === "Nines";

    const stablefordHtml = () => `
      <div class="maListRow__col" style="margin-bottom:8px;">${_draft.pointsStrategy === "Chicago" ? "Points per Score" : "Stableford Points"}</div>
      <div>
        ${_stagedStablefordRows.map(r => `
          <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--borderSubtle);" data-row-id="${r.id}">
            <input type="number" value="${r.reltoPar}" style="width:60px; text-align:center;" class="maTextInput" data-row-field="reltoPar" data-row-id="${r.id}">
            <span class="maListRow__subline" style="flex:1;">${esc(_stablefordRowLabel(r.reltoPar))}</span>
            <input type="number" min="0" max="99" value="${r.points}" style="width:60px; text-align:center;" class="maTextInput" data-row-field="points" data-row-id="${r.id}">
            <button type="button" class="iconBtn" style="width:26px;height:26px; color:var(--danger);" data-remove-row="${r.id}" aria-label="Remove row">&#10005;</button>
          </div>`).join("")}
      </div>
      <button type="button" class="btn btnSecondary" id="sgcAddRow" style="margin-top:8px;">+ Add Row</button>`;

    const ninesHtml = () => `
      <div class="maListRow__col" style="margin-bottom:8px;">4-Player Pool</div>
      <div style="display:flex; gap:8px; margin-bottom:14px;">
        ${_stagedNinesValues["4"].map((v, i) => `<input type="number" min="0" max="9" value="${v}" class="maTextInput" style="width:50px; text-align:center;" data-nines="4" data-idx="${i}">`).join("")}
      </div>
      <div class="maListRow__col" style="margin-bottom:8px;">3-Player Pool</div>
      <div style="display:flex; gap:8px;">
        ${_stagedNinesValues["3"].map((v, i) => `<input type="number" min="0" max="9" value="${v}" class="maTextInput" style="width:50px; text-align:center;" data-nines="3" data-idx="${i}">`).join("")}
      </div>`;

    return `
      <div class="maCard">
        <div class="actionMenu_category">Points Configuration</div>
        <div style="padding:14px;">
          ${isStableford ? stablefordHtml() : isNines ? ninesHtml() : ""}
        </div>
      </div>`;
  }

  // Single delegated listener, attached once (in open()), not re-attached
  // per _renderBody() call. Handles all three views — only one view's
  // markup exists in #sgcBody's DOM at any moment, so there's no
  // ambiguity in handling every data-attribute in one place.
  function _wireBody() {
    const body = document.getElementById("sgcBody");
    const footer = document.getElementById("sgcFooter");
    if (!body || !footer) return;

    body.addEventListener("click", (e) => {
      // Main view
      const method = e.target.closest("[data-method]");
      if (method) { _selectMethod(method.dataset.method); _renderBody(); return; }

      const system = e.target.closest("[data-system]");
      if (system && !system.disabled) { _selectSystem(system.dataset.system); _renderBody(); return; }

      const bb = e.target.closest("[data-bb]");
      if (bb && !bb.disabled) { _selectBestBall(bb.dataset.bb); _renderBody(); return; }

      const strategy = e.target.closest("[data-strategy]");
      if (strategy) { _selectPointsStrategy(strategy.dataset.strategy); _renderBody(); return; }

      if (e.target.closest("#sgcOpenHoles")) {
        _stagedHoleDecls = _draft.holeDecls.map(r => ({ ...r }));
        _view = "holes";
        _renderBody();
        return;
      }
      if (e.target.closest("#sgcOpenPoints")) {
        _stagedStablefordRows = _draft.stablefordRows.map(r => ({ ...r }));
        _stagedNinesValues = { "4": [..._draft.ninesValues["4"]], "3": [..._draft.ninesValues["3"]] };
        _view = "points";
        _renderBody();
        return;
      }

      // Holes view — mutates the STAGED copy, not _draft, until Apply commits it
      const setAll = e.target.closest("[data-setall]");
      if (setAll) { _stagedHoleDecls.forEach(r => r.count = Number(setAll.dataset.setall)); _renderBody(); return; }

      const step = e.target.closest("[data-step]");
      if (step) {
        const hole = Number(step.dataset.hole);
        const delta = Number(step.dataset.step);
        const row = _stagedHoleDecls.find(r => r.hole === hole);
        if (row) row.count = Math.min(4, Math.max(0, row.count + delta));
        _renderBody();
        return;
      }

      // Points view — mutates STAGED copies
      const addRow = e.target.closest("#sgcAddRow");
      if (addRow) { _stagedStablefordRows.push({ id: `r${_rowSeq++}`, reltoPar: 0, points: 0 }); _renderBody(); return; }

      const removeRow = e.target.closest("[data-remove-row]");
      if (removeRow) { _stagedStablefordRows = _stagedStablefordRows.filter(r => r.id !== removeRow.dataset.removeRow); _renderBody(); return; }
    });

    body.addEventListener("change", (e) => {
      const holeInput = e.target.closest("[data-hole-input]");
      if (holeInput) {
        const hole = Number(holeInput.dataset.holeInput);
        const row = _stagedHoleDecls.find(r => r.hole === hole);
        if (row) row.count = Math.min(4, Math.max(0, parseInt(holeInput.value, 10) || 0));
        return;
      }

      const rowField = e.target.closest("[data-row-field]");
      if (rowField) {
        const row = _stagedStablefordRows.find(r => r.id === rowField.dataset.rowId);
        if (row) {
          row[rowField.dataset.rowField] = parseInt(rowField.value, 10) || 0;
          if (rowField.dataset.rowField === "reltoPar") _renderBody();
        }
        return;
      }

      const ninesInput = e.target.closest("[data-nines]");
      if (ninesInput) {
        _stagedNinesValues[ninesInput.dataset.nines][Number(ninesInput.dataset.idx)] = parseInt(ninesInput.value, 10) || 0;
      }
    });

    // Footer — its own delegated listener since #sgcFooter's innerHTML is
    // rebuilt by _renderFooter() the same way #sgcBody's is by _renderBody()
    footer.addEventListener("click", (e) => {
      if (e.target.closest("#sgcBtnCancel")) { if (!_busy) _dismiss(); return; }
      if (e.target.closest("#sgcBtnSave"))   { _apply(); return; }

      if (e.target.closest("#sgcBtnSubBack")) {
        // Discard staged edits — _draft is untouched
        _stagedHoleDecls = null; _stagedStablefordRows = null; _stagedNinesValues = null;
        _view = "main";
        _renderBody();
        return;
      }
      if (e.target.closest("#sgcBtnSubApply")) {
        // Commit staged edits into _draft
        if (_view === "holes")  _draft.holeDecls = _stagedHoleDecls;
        if (_view === "points") { _draft.stablefordRows = _stagedStablefordRows; _draft.ninesValues = _stagedNinesValues; }
        _stagedHoleDecls = null; _stagedStablefordRows = null; _stagedNinesValues = null;
        _view = "main";
        _renderBody();
        return;
      }
    });
  }

  async function _apply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Scoring", message: "Saving — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINT, { payload: _buildSavePayload() });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Scoring.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss();
      return;
    } catch (e) {
      console.error("[MA.setGameScoring]", e);
      _showModalNotice("Error saving Scoring.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  MA.setGameScoring.open = async function (options) {
    _onDone = options?.onDone || null;
    _busy = false;
    _view = "main";

    MA.ui?.showBusy?.({ title: "Scoring", message: "Loading..." });
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
    _coursePars = _buildCourseParsByHole(ctx.coursePars);
    _draft = _draftFromGame(ctx.game);
    _origScoringMethod = ctx.game.dbGames_ScoringMethod || "NET";

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal(!!ctx.game.dbGames_EID);
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    document.getElementById("sgcBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });

    _renderControls();
    _renderBody();
    _wireBody();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGameScoring.close = function () {
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
