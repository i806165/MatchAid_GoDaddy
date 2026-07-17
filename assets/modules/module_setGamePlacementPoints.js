/* /assets/modules/module_setGamePlacementPoints.js
 *
 * MA.setGamePlacementPoints — Placement Points editor module.
  * Owns: dbGames_PlacementPoints, dbGames_ScoringSegments.
 *
 * dbGames_ScoringSegments controls whether PairPair match-result points
 * are awarded for one Overall result or for Front 9, Back 9, and Overall.
 *
 * dbGames_Segments is Playing Segments and is owned by
 * module_setGameSegments.js.
 *
 * ── Rendering cloned verbatim from module_definePlacementPoints.js ──────
 * CATEGORY_DEFS, seedCategory(), parseIncoming(), resegmentMatchResult(),
 * collectState(), renderRow()/renderContent()/renderPlacementEditor()/
 * renderSegmentsEditor()/renderScoringSegmentsControl()/wireBodyEvents(),
 * and injectStyles() (the .dpp-* interior stylesheet) are UNCHANGED — same
 * classes, same markup, same behavior. Per direct instruction: clone the
 * rendering as-is; aligning the .dpp-* interior to ma_shared.css is a
 * separate, later effort, not part of this pass.
 *
 * ── What changed — plumbing only, not rendering ──────────────────────────
 * These aren't visual changes, they're the same structural contract every
 * other module in this family already follows (see
 * MODULE_BUILD_CHECKLIST.md):
 *   - Self-hydration: open() takes only { onDone }. No config object from
 *     a caller — competition/scoringSegments/placementPoints are read from
 *     this module's own fetched context, same CONTEXT_ENDPOINT every other
 *     module uses. effectiveScoringSegments is computed the same way
 *     Placement Points owns dbGames_ScoringSegments. Rotation and
 *     Competition may constrain the effective value to 1, but
 *     dbGames_Segments is unrelated Playing Segments metadata.
 *   - Direct save: doApply() used to call _config.onApply(json, segments)
 *     and let the caller decide what to do with it. It now posts to its
 *     own save endpoint directly (saveGamePlacementPoints.php — TODO, does
 *     not exist yet, same open item every new module has).
 *   - Exit-path signal: close() previously fired nothing at all — Cancel/
 *     backdrop/X all discarded silently. It now fires onDone unconditionally,
 *     on every exit path, matching the contract every other module needs
 *     for the menu to reopen correctly.
 *   - Escape handling: added. The original had none.
 *   - .maModal__controls context block (game title/GGID, course/date,
 *     event/EID): added. The original's header only had a static
 *     instructional subtitle ("Choose which categories award points, and
 *     how."), no game context at all — kept as-is, context block added
 *     alongside it, same as every other module's shell.
 *   - Event-context header color: added (is-event-context), matching
 *     every other module.
 *   - MA.ui.showModalNotice() for save errors: added. The original never
 *     saved, so it never needed error handling — MA.setStatus() would be
 *     invisible behind an open modal, same reasoning as every other module.
 *   - Counted scroll-lock: added. The original had no scroll-lock at all.
 *   - _busy flag: added, to block double-submit during save.
 *
 * Public API:
 *   MA.setGamePlacementPoints.open({ onDone })
 *   MA.setGamePlacementPoints.close()
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * Save endpoint (/api/game_settings/saveGamePlacementPoints.php) does not
 * exist yet.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGamePlacementPoints = MA.setGamePlacementPoints || {};

  const OVERLAY_ID = "sgppOverlay";
  const NOTICE_ID  = "sgppNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGamePlacementPoints.php"; // TODO — does not exist yet

  // ── Helpers — cloned verbatim ────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function numOrZero(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const DEFAULT_PLACEMENT_TABLE = { pointsConfig: { "1": 100, "2": 75, "3": 50 }, tieRule: "split" };
  const DEFAULT_OUTCOME = { win: 1, halve: 0.5, loss: 0 };

  const CATEGORY_DEFS = [
    { key: "gross",           kind: "placement", scope: "pairfield",  label: "Pairing Gross",   desc: "Ranks pairings by gross score for the round." },
    { key: "net",             kind: "placement", scope: "pairfield",  label: "Pairing Net",     desc: "Ranks pairings by net score for the round." },
    { key: "matchResult",     kind: "segments",  scope: "pairpair",   label: "Match Result",    desc: "Points awarded for each match outcome, by scoring segment." },
    { key: "individualGross", kind: "placement", scope: "individual", label: "Individual Gross", desc: "Ranks each player by their own gross score, independent of pairing." },
    { key: "individualNet",   kind: "placement", scope: "individual", label: "Individual Net",   desc: "Ranks each player by their own net score, independent of pairing." },
  ];

  const SEGMENT_LABELS_MULTI = { "1": "Overall", "2": "Front 9", "3": "Back 9" };
  function segmentLabel(key) { return SEGMENT_LABELS_MULTI[key] || `Segment ${key}`; }
  function ordinal(place) {
    return place === "1" ? "1st" : place === "2" ? "2nd" : place === "3" ? "3rd" : `${place}th`;
  }
  function scopeForCompetition(competition) { return competition === "PairPair" ? "pairpair" : "pairfield"; }
  function isShown(def, competition) {
    return def.scope === "individual" || def.scope === scopeForCompetition(competition);
  }

  // ── Module state ─────────────────────────────────────────────────────
  let _overlay = null;
  let _ctx     = null; // fresh-fetched { ggid, game, roster, coursePars }
  let _state   = null;
  let _onDone  = null;
  let _onEsc   = null;
  let _busy    = false;
  let _lockDepth = 0;

  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

/*
 * Hydrate this module's owned Scoring Segments field.
 *
 * PairField games and rotation-based PairPair games can only have one
 * Overall match result. Otherwise, the stored value may be 1 or 3.
 *
 * This does not read dbGames_Segments. That field represents Playing
 * Segments and belongs to module_setGameSegments.js.
 */
  function _scoringSegmentsFromGame(g) {
    const rotationActive =
      !!g.dbGames_RotationMethod &&
      g.dbGames_RotationMethod !== "None";

    if (
      g.dbGames_Competition !== "PairPair" ||
      rotationActive
    ) {
      return 1;
    }

    return parseInt(
      g.dbGames_ScoringSegments || "1",
      10
    ) === 3
      ? 3
      : 1;
  }

  // ── Seeding — cloned verbatim ────────────────────────────────────────
  function seedCategory(def, scoringSegments) {
    if (def.kind === "segments") {
      const segCount = scoringSegments === 3 ? 3 : 1;
      const segments = {};
      for (let i = 1; i <= segCount; i++) segments[String(i)] = { ...DEFAULT_OUTCOME };
      return { key: def.key, kind: def.kind, scope: def.scope, state: "default", segments };
    }
    return {
      key: def.key, kind: def.kind, scope: def.scope, state: "default",
      pointsConfig: { ...DEFAULT_PLACEMENT_TABLE.pointsConfig },
      tieRule: DEFAULT_PLACEMENT_TABLE.tieRule,
    };
  }

  function parseIncoming(raw) {
    let parsed = raw;
    if (typeof parsed === "string" && parsed.trim() !== "") {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }
    return (parsed && typeof parsed === "object") ? parsed : null;
  }

  // ── State — sourced from self-hydrated _ctx.game, not a caller config ──
  function initState(game) {
    const competition     = game.dbGames_Competition === "PairPair" ? "PairPair" : "PairField";
    const scoringSegments = _scoringSegmentsFromGame(game);
    const incoming        = parseIncoming(game.dbGames_PlacementPoints);

    const incomingByKey = {};
    if (incoming && Array.isArray(incoming.categories)) {
      incoming.categories.forEach(c => { if (c && c.key) incomingByKey[c.key] = c; });
    }

    const categories = {};
    CATEGORY_DEFS.forEach(def => {
      const existing = incomingByKey[def.key];
      categories[def.key] = existing ? clone(existing) : seedCategory(def, scoringSegments);
      categories[def.key]._checked  = categories[def.key].state !== "disabled";
      categories[def.key]._expanded = categories[def.key]._checked;
    });

    resegmentMatchResult(categories.matchResult, scoringSegments);

    _state = { competition, scoringSegments, categories };
  }

  function resegmentMatchResult(mr, targetCount) {
    const seg1 = mr.segments?.["1"] || { ...DEFAULT_OUTCOME };
    const next = { ...mr.segments };
    if (!next["1"]) next["1"] = { ...seg1 };
    if (targetCount === 3) {
      if (!next["2"]) next["2"] = { ...seg1 };
      if (!next["3"]) next["3"] = { ...seg1 };
    }
    mr.segments = next;
  }

  function setScoringSegments(count) {
    const target = count === 3 ? 3 : 1;
    if (target === _state.scoringSegments) return;
    resegmentMatchResult(_state.categories.matchResult, target);
    _state.scoringSegments = target;
    renderBody();
  }

  function collectState() {
    const out = CATEGORY_DEFS.map(def => {
      const cat = _state.categories[def.key];
      if (!isShown(def, _state.competition)) {
        const { _checked, _expanded, ...rest } = cat;
        return rest;
      }
      const base = { key: def.key, kind: def.kind, scope: def.scope, state: cat._checked ? "active" : "disabled" };
      if (def.kind === "segments") {
        base.segments = cat.segments;
      } else {
        base.pointsConfig = cat.pointsConfig;
        base.tieRule = cat.tieRule;
      }
      return base;
    });

    const top = out.some(c => c.state === "active") ? "active" : "disabled";
    return { top, categories: out };
  }

  // ── Row rendering — cloned verbatim ──────────────────────────────────
  function pointsRowsHtml(key, pointsConfig) {
    return Object.keys(pointsConfig).map(place => `<tr>
      <td>${esc(ordinal(place))}</td>
      <td style="text-align:right;">
        <input class="dpp-pts-input" type="number" min="0"
          data-place-cat="${esc(key)}" data-place="${esc(place)}" value="${esc(String(pointsConfig[place]))}" />
      </td>
    </tr>`).join("");
  }

  function renderPlacementEditor(key) {
    const cat = _state.categories[key];
    const rows = pointsRowsHtml(key, cat.pointsConfig);
    return `
      <div class="dpp-card">
        <div class="dpp-card-title">Points awarded per finishing position</div>
        <table class="dpp-pts-table">
          <thead><tr><th>Place</th><th style="text-align:right;">Points</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="dpp-add-btn" data-add-place="${esc(key)}" type="button">
          <i class="ti ti-plus" aria-hidden="true"></i> Add place
        </button>
        <div class="dpp-tie-row">
          <span class="dpp-tie-label">Tie Rule</span>
          <select class="dpp-tie-select" data-tie-cat="${esc(key)}">
            <option value="split" ${cat.tieRule === "split" ? "selected" : ""}>Split — average the tied positions' points</option>
            <option value="high"  ${cat.tieRule === "high"  ? "selected" : ""}>High — all tied players receive the higher points</option>
            <option value="low"   ${cat.tieRule === "low"   ? "selected" : ""}>Low — all tied players receive the lower points</option>
          </select>
        </div>
        <div class="dpp-hint">Determines how points are awarded when two or more players tie for the same position.</div>
      </div>`;
  }

  function renderSegmentsEditor(key) {
    const cat = _state.categories[key];
    const segCount = _state.scoringSegments;
    const segKeys = segCount === 3 ? ["2", "3", "1"] : ["1"];
    const headerCells = segKeys.map(k => `<th>${esc(segmentLabel(k))}</th>`).join("");

    const outcomeRows = ["win", "halve", "loss"].map(outcome => {
      const label = outcome === "win" ? "Win" : outcome === "halve" ? "Halve" : "Loss";
      const cells = segKeys.map(k => `
        <td>
          <input class="dpp-pts-input" type="number" step="0.5" min="0"
            data-segment-cat="${esc(key)}" data-segment="${esc(k)}" data-outcome="${esc(outcome)}"
            value="${esc(String(cat.segments[k][outcome]))}" />
        </td>`).join("");
      return `<tr><td>${esc(label)}</td>${cells}</tr>`;
    }).join("");

    return `
      <div class="dpp-card">
        <div class="dpp-card-title">Points awarded per match outcome</div>
        <table class="dpp-pts-table dpp-matrix">
          <thead><tr><th>Outcome</th>${headerCells}</tr></thead>
          <tbody>${outcomeRows}</tbody>
        </table>
        <div class="dpp-hint">Use separate values when each segment should award different match points.</div>
      </div>`;
  }

  function rowSummary(key) {
    const cat = _state.categories[key];
    if (cat.kind === "segments") {
      const segCount = _state.scoringSegments;
      const seg1 = cat.segments["1"] || DEFAULT_OUTCOME;
      return `${segCount} segment${segCount !== 1 ? "s" : ""} · W/H/L: ${seg1.win} / ${seg1.halve} / ${seg1.loss}`;
    }
    const places = Object.keys(cat.pointsConfig).length;
    const vals   = Object.values(cat.pointsConfig).join(", ");
    const tie    = cat.tieRule === "split" ? "Split ties" : cat.tieRule === "high" ? "High ties" : "Low ties";
    return `${places} place${places !== 1 ? "s" : ""} · ${vals} pts · ${tie}`;
  }

  function renderRow(def) {
    const cat = _state.categories[def.key];
    const checked  = cat._checked;
    const expanded = cat._expanded;

    return `
      <div class="dpp-row" data-row="${esc(def.key)}">
        <div class="maCheckbox ${checked ? "is-checked" : ""}" data-check-cat="${esc(def.key)}"
          role="checkbox" aria-checked="${checked}" tabindex="0" aria-label="${esc(def.label)}"></div>
        <div class="dpp-row-body">
          <div class="dpp-row-label">${esc(def.label)}</div>
          <div class="dpp-row-desc">${esc(def.desc)}</div>
          ${def.kind === "segments" ? renderScoringSegmentsControl() : ""}
          ${checked ? `
            <button class="dpp-toggle ${expanded ? "open" : ""}" data-toggle-cat="${esc(def.key)}" type="button"
              aria-expanded="${expanded}">
              <i class="ti ti-settings" aria-hidden="true"></i>
              <span>${expanded ? "Hide points table" : "Unhide points table"}</span>
              <i class="ti ti-chevron-down dpp-chevron" aria-hidden="true"></i>
            </button>
            ${expanded
              ? (def.kind === "segments" ? renderSegmentsEditor(def.key) : renderPlacementEditor(def.key))
              : `<div class="dpp-summary"><i class="ti ti-check" aria-hidden="true"></i>${esc(rowSummary(def.key))}</div>`}
          ` : ""}
        </div>
      </div>`;
  }

  function renderScoringSegmentsControl() {
    const segCount = _state.scoringSegments;
    return `
      <div class="dpp-seg-control">
        <span class="dpp-seg-control-label">Scoring Segments</span>
        <div class="maChoiceChips" id="dppScoringSegChips">
          <button class="maChoiceChip ${segCount === 1 ? "is-selected" : ""}" data-seg-count="1" type="button">1</button>
          <button class="maChoiceChip ${segCount === 3 ? "is-selected" : ""}" data-seg-count="3" type="button">3</button>
        </div>
        <span class="dpp-seg-control-hint">${segCount === 1 ? "One overall result" : "Front 9 / Back 9 / Overall, scored independently"}</span>
      </div>
      ${segCount === 1 ? `
        <div class="dpp-info-banner">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          For one-segment games, only the Overall result is used.
        </div>` : ""}`;
  }

  function renderContent() {
    const competition = _state.competition;
    let html = `<div class="dpp-hdr-line">Choose which categories award points, and how.</div>`;

    html += `<div class="dpp-section-hdr">Pairing</div>`;
    CATEGORY_DEFS.filter(def => def.scope !== "individual" && isShown(def, competition))
      .forEach(def => { html += renderRow(def); });

    html += `<div class="dpp-section-hdr">Individual</div>`;
    CATEGORY_DEFS.filter(def => def.scope === "individual")
      .forEach(def => { html += renderRow(def); });

    return html;
  }

  function wireBodyEvents(body) {
    body.querySelectorAll("[data-check-cat]").forEach(el => {
      const toggle = () => {
        const key = el.dataset.checkCat;
        const cat = _state.categories[key];
        cat._checked = !cat._checked;
        if (cat._checked) cat._expanded = true;
        renderBody();
      };
      el.addEventListener("click", toggle);
      el.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
    });

    body.querySelectorAll("[data-toggle-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = _state.categories[btn.dataset.toggleCat];
        cat._expanded = !cat._expanded;
        renderBody();
      });
    });

    body.querySelectorAll("[data-place-cat]").forEach(inp => {
      inp.addEventListener("change", () => {
        const cat = _state.categories[inp.dataset.placeCat];
        cat.pointsConfig[inp.dataset.place] = Math.round(numOrZero(inp.value));
      });
    });

    body.querySelectorAll("[data-add-place]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = _state.categories[btn.dataset.addPlace];
        const nextPlace = String(Object.keys(cat.pointsConfig).length + 1);
        cat.pointsConfig[nextPlace] = 0;
        renderBody();
      });
    });

    body.querySelectorAll("[data-tie-cat]").forEach(sel => {
      sel.addEventListener("change", () => {
        _state.categories[sel.dataset.tieCat].tieRule = sel.value;
      });
    });

    body.querySelectorAll("[data-segment-cat]").forEach(inp => {
      inp.addEventListener("change", () => {
        const cat = _state.categories[inp.dataset.segmentCat];
        cat.segments[inp.dataset.segment][inp.dataset.outcome] = numOrZero(inp.value);
      });
    });

    body.querySelectorAll("[data-seg-count]").forEach(btn => {
      btn.addEventListener("click", () => setScoringSegments(parseInt(btn.dataset.segCount, 10)));
    });
  }

  function renderBody() {
    const body = _overlay?.querySelector("#sgppBody");
    if (!body) return;
    body.innerHTML = renderContent();
    wireBodyEvents(body);
  }

  function _renderControls() {
    const el = _overlay?.querySelector("#sgppControls");
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

  // ── Styles — .dpp-* interior only, cloned verbatim. Modal shell uses
  // ma_shared.css. Aligning this to shared classes is a separate, later
  // effort — not part of this pass.
  function injectStyles() {
    if (document.getElementById("sgppStyles")) return;
    const s = document.createElement("style");
    s.id = "sgppStyles";
    s.textContent = `
      #${OVERLAY_ID} .maModal{ max-width:min(640px,calc(100vw - 16px)); }
      .dpp-hdr-line{font-size:13px;color:var(--mutedText);padding:12px 16px 0;}
      .dpp-section-hdr{font-size:11px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:var(--mutedText);padding:14px 16px 4px;}
      .dpp-info-banner{display:flex;align-items:center;gap:8px;margin:10px 0 0;padding:8px 12px;background:color-mix(in srgb, var(--brandAccent) 10%, transparent);border-radius:var(--radiusMd,6px);font-size:12px;color:var(--ink);}
      .dpp-seg-control{display:flex;align-items:center;gap:10px;margin:8px 0 0;flex-wrap:wrap;}
      .dpp-seg-control-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;color:var(--mutedText);white-space:nowrap;}
      .dpp-seg-control-hint{font-size:11px;color:var(--mutedText);}
      .dpp-row{display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-bottom:0.5px solid var(--borderSubtle);}
      .dpp-row:last-child{border-bottom:none;}
      .dpp-row .maCheckbox{margin-top:1px;cursor:pointer;}
      .dpp-row-body{flex:1;min-width:0;}
      .dpp-row-label{font-size:13px;font-weight:700;color:var(--ink);}
      .dpp-row-desc{font-size:12px;color:var(--mutedText);margin-top:2px;line-height:1.4;}
      .dpp-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:0;font-family:inherit;}
      .dpp-toggle .dpp-chevron{font-size:11px;transition:transform .15s;}
      .dpp-toggle.open .dpp-chevron{transform:rotate(180deg);}
      .dpp-summary{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;font-style:italic;color:var(--mutedText);}
      .dpp-summary i{color:var(--brandSecondary);}
      .dpp-card{margin:10px 0 0;background:var(--surfaceChrome);border:0.5px solid var(--borderSubtle);border-radius:var(--radiusMd,6px);padding:12px;}
      .dpp-card-title{font-size:11px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:var(--mutedText);margin-bottom:8px;}
      .dpp-pts-table{width:100%;border-collapse:collapse;font-size:13px;}
      .dpp-pts-table th{text-align:left;color:var(--mutedText);font-weight:500;padding:6px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dpp-pts-table td{padding:6px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dpp-pts-table tr:last-child td{border-bottom:none;}
      .dpp-matrix th:not(:first-child), .dpp-matrix td:not(:first-child){text-align:center;}
      .dpp-pts-input{width:72px;border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:4px 8px;font-size:13px;text-align:right;background:var(--surface);color:var(--ink);}
      .dpp-matrix .dpp-pts-input{width:64px;text-align:center;}
      .dpp-add-btn{font-size:12px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:6px 0 0;display:flex;align-items:center;gap:4px;font-family:inherit;}
      .dpp-tie-row{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:0.5px solid var(--borderSubtle);}
      .dpp-tie-label{font-size:11px;font-weight:500;color:var(--mutedText);white-space:nowrap;text-transform:uppercase;letter-spacing:.3px;}
      .dpp-tie-select{flex:1;border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:5px 8px;font-size:13px;background:var(--surface);color:var(--ink);}
      .dpp-hint{font-size:11px;color:var(--mutedText);margin-top:8px;}
    `;
    document.head.appendChild(s);
  }

  // ── Build overlay ────────────────────────────────────────────────────
  function buildOverlay(isEvent) {
    const overlay = document.createElement("div");
    overlay.id        = OVERLAY_ID;
    overlay.className = "maModalOverlay is-open";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Placement Points">

        <div class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__titles">
            <div class="maModal__title">Placement Points</div>
            <div class="maModal__subtitle">Choose which categories award points, and how.</div>
          </div>
          <button id="sgppBtnClose" class="iconBtn btnSecondary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="maModal__controls" id="sgppControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body maModal__body--flush" id="sgppBody"></div>

        <div class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button id="sgppBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
            <button id="sgppBtnApply"  class="maFtrBtn maFtrBtn--save"   type="button">Save</button>
          </div>
        </div>

      </div>`;

    overlay.querySelector("#sgppBtnClose")?.addEventListener("click",  () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgppBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgppBtnApply")?.addEventListener("click",  doApply);
    overlay.addEventListener("click", e => { if (e.target === overlay && !_busy) _dismiss(); });

    return overlay;
  }

  function _dismiss() {
    if (_busy) return;
    MA.setGamePlacementPoints.close();
    if (typeof _onDone === "function") _onDone();
  }

  // ── Apply — now saves directly instead of calling a caller callback ──
  async function doApply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Placement Points", message: "Saving — please wait..." });
    try {
      const result = collectState();
      const payload = {
        dbGames_GGID: _ctx.ggid,

        dbGames_ScoringSegments:
          _state.competition === "PairPair"
            ? _state.scoringSegments
            : 1,

        dbGames_PlacementPoints: result,
      };
      const res = await MA.postJson(SAVE_ENDPOINT, { payload });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Placement Points.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss();
      return;
    } catch (e) {
      console.error("[MA.setGamePlacementPoints]", e);
      _showModalNotice("Error saving Placement Points.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setGamePlacementPoints.open = async function (options) {
    if (_overlay) MA.setGamePlacementPoints.close();
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Placement Points", message: "Loading..." });
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
    initState(ctx.game);
    injectStyles();

    _overlay = buildOverlay(!!ctx.game.dbGames_EID);
    document.body.appendChild(_overlay);
    _lockScroll(true);

    _renderControls();
    renderBody();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGamePlacementPoints.close = function () {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _ctx   = null;
    _state = null;
    _lockScroll(false);
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

})();
