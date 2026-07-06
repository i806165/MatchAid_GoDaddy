/* /assets/modules/module_definePlacementPoints.js
 * MA.definePlacementPoints — Game-level Placement Points editor overlay module.
 *
 * Opens as a modal. Owns parsing, defaulting, validation, rendering, editing,
 * and serialization of dbGames_PlacementPoints. The Game Settings page owns
 * when to show the Configure button, which competition/scoringSegments values
 * to pass in, storing the returned JSON string in wizard state, and including
 * it in the save patch. This module never calls saveGameSettings.php directly.
 *
 * dbGames_PlacementPoints shape (as of this version):
 *   {
 *     "top": "default" | "active" | "disabled",
 *     "categories": [
 *       { "key":"gross",           "kind":"placement", "scope":"pairfield",  "state":"default"|"active"|"disabled", "pointsConfig":{...}, "tieRule":"split" },
 *       { "key":"net",             "kind":"placement", "scope":"pairfield",  "state":..., "pointsConfig":{...}, "tieRule":"..." },
 *       { "key":"matchResult",     "kind":"segments",  "scope":"pairpair",   "state":..., "segments":{"1":{"win":1,"halve":0.5,"loss":0}, ...} },
 *       { "key":"individualGross", "kind":"placement", "scope":"individual", "state":..., "pointsConfig":{...}, "tieRule":"..." },
 *       { "key":"individualNet",   "kind":"placement", "scope":"individual", "state":..., "pointsConfig":{...}, "tieRule":"..." }
 *     ]
 *   }
 *
 * All five categories always exist, every game, from creation onward — see
 * service_dbGames.php's applyDefaultsForAdd(). This module only ever shows the
 * Pairing categories matching the game's *current* competition (gross/net for
 * PairField, matchResult for PairPair) plus both Individual categories, which
 * always show regardless of competition. Categories not shown in a given
 * session (e.g. matchResult on a PairField game) are round-tripped completely
 * unmodified — this is what lets an admin flip a game's competition type back
 * and forth without ever losing or clobbering the other type's configuration.
 *
 * "default" means nobody has ever consciously saved a value for that category —
 * it's still whatever service_dbGames.php seeded at game creation. The instant
 * this modal is opened and Save is clicked, every category actually shown in
 * that session graduates to "active" (checked) or "disabled" (unchecked) —
 * never back to "default". Categories that were never shown keep whatever
 * state they already had, including "default", indefinitely.
 *
 * Usage:
 *   MA.definePlacementPoints.open({
 *     competition:     "PairField" | "PairPair",
 *     scoringSegments: 1 | 3,             // PairPair only; initial value — editable inline for PairPair
 *     placementPoints: currentJsonValue,  // parsed object or JSON string from dbGames_PlacementPoints
 *     onApply: (jsonString, scoringSegments) => { ... }
 *       // jsonString       — serialized dbGames_PlacementPoints (new {top, categories} shape)
 *       // scoringSegments  — the effective value (1 or 3) after any inline change made in this modal;
 *       //                    always 1 for PairField. The page should sync this back into its own
 *       //                    wizard state (Step 2 chips, summary) since it may differ from what was
 *       //                    passed in.
 *   });
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function setStatus(msg, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(msg, level || "info");
  }

  function numOrZero(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const DEFAULT_PLACEMENT_TABLE = { pointsConfig: { "1": 100, "2": 75, "3": 50 }, tieRule: "split" };
  const DEFAULT_OUTCOME = { win: 1, halve: 0.5, loss: 0 };

  // Fixed catalog — order here is the order categories render in and the order
  // they're serialized back out in. scope drives visibility: "pairfield"/"pairpair"
  // rows only show when the game's competition matches; "individual" rows always show.
  const CATEGORY_DEFS = [
    { key: "gross",           kind: "placement", scope: "pairfield",  label: "Pairing Gross",   desc: "Ranks pairings by gross score for the round." },
    { key: "net",             kind: "placement", scope: "pairfield",  label: "Pairing Net",     desc: "Ranks pairings by net score for the round." },
    { key: "matchResult",     kind: "segments",  scope: "pairpair",   label: "Match Result",    desc: "Points awarded for each match outcome, by scoring segment." },
    { key: "individualGross", kind: "placement", scope: "individual", label: "Individual Gross", desc: "Ranks each player by their own gross score, independent of pairing." },
    { key: "individualNet",   kind: "placement", scope: "individual", label: "Individual Net",   desc: "Ranks each player by their own net score, independent of pairing." },
  ];

  const SEGMENT_LABELS_MULTI = { "1": "Front 9", "2": "Back 9", "3": "Overall" };

  function segmentLabel(key, segCount) {
    // A single-segment match is scored as one whole-round result — "Overall,"
    // not "Front 9." The Front 9 / Back 9 split only makes sense once there
    // are 3 independently-scored segments.
    if (segCount === 1) return "Overall";
    return SEGMENT_LABELS_MULTI[key] || `Segment ${key}`;
  }

  function ordinal(place) {
    return place === "1" ? "1st" : place === "2" ? "2nd" : place === "3" ? "3rd" : `${place}th`;
  }

  function scopeForCompetition(competition) {
    return competition === "PairPair" ? "pairpair" : "pairfield";
  }

  function isShown(def, competition) {
    return def.scope === "individual" || def.scope === scopeForCompetition(competition);
  }

  // ── Singleton ────────────────────────────────────────────────────────────────

  let _overlay = null;
  let _config  = null;
  let _state   = null;

  // ── Seeding ──────────────────────────────────────────────────────────────────

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

  // ── State ────────────────────────────────────────────────────────────────────

  function initState(config) {
    const competition     = config.competition === "PairPair" ? "PairPair" : "PairField";
    const scoringSegments = parseInt(config.scoringSegments, 10) === 3 ? 3 : 1;
    const incoming        = parseIncoming(config.placementPoints);

    const incomingByKey = {};
    if (incoming && Array.isArray(incoming.categories)) {
      incoming.categories.forEach(c => { if (c && c.key) incomingByKey[c.key] = c; });
    }

    const categories = {};
    CATEGORY_DEFS.forEach(def => {
      const existing = incomingByKey[def.key];
      categories[def.key] = existing ? clone(existing) : seedCategory(def, scoringSegments);
      // UI-only working flags — never serialized. "checked" reflects on/off
      // regardless of whether the underlying value is "default" or "active";
      // only an explicit "disabled" reads as unchecked.
      categories[def.key]._checked  = categories[def.key].state !== "disabled";
      categories[def.key]._expanded = categories[def.key]._checked;
    });

    // matchResult's segment count must track the live scoringSegments value —
    // expand/contract by cloning segment "1", same convention as the original
    // PairPair inline Scoring Segments control.
    resegmentMatchResult(categories.matchResult, scoringSegments);

    _state = { competition, scoringSegments, categories };
  }

  function resegmentMatchResult(mr, targetCount) {
    const seg1 = mr.segments?.["1"] || { ...DEFAULT_OUTCOME };
    const next = {};
    for (let i = 1; i <= targetCount; i++) {
      const k = String(i);
      next[k] = mr.segments?.[k] || { ...seg1 };
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

  // Every category actually shown this session graduates from whatever it was
  // to "active"/"disabled" based on its checkbox. Anything never shown (the
  // other competition's Pairing category) is emitted exactly as it came in.
  // Top-level state is derived fresh on every save: "active" if anything at
  // all is active, "disabled" only if every single category is disabled —
  // never "default" again once a save has happened.
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

  // ── Row rendering ────────────────────────────────────────────────────────────

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
    const segKeys = Object.keys(cat.segments);
    const headerCells = segKeys.map(k => `<th>${esc(segmentLabel(k, segCount))}</th>`).join("");

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

  // ── Full content render ──────────────────────────────────────────────────────

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
          For one-segment games, only Segment 1 is used.
        </div>` : ""}`;
  }

  function renderContent() {
    const competition = _state.competition;
    let html = `<div class="dpp-hdr-line">Choose which categories award points, and how.</div>`;

    if (competition === "PairPair") {
      html += renderScoringSegmentsControl();
    }

    html += `<div class="dpp-section-hdr">Pairing</div>`;
    CATEGORY_DEFS.filter(def => def.scope !== "individual" && isShown(def, competition))
      .forEach(def => { html += renderRow(def); });

    html += `<div class="dpp-section-hdr">Individual</div>`;
    CATEGORY_DEFS.filter(def => def.scope === "individual")
      .forEach(def => { html += renderRow(def); });

    return html;
  }

  // ── Wire events ──────────────────────────────────────────────────────────────

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
    const body = _overlay?.querySelector("#dppBody");
    if (!body) return;
    body.innerHTML = renderContent();
    wireBodyEvents(body);
  }

  // ── Styles — editor interior only; modal shell/checkbox/chips use ma_shared.css ──

  function injectStyles() {
    if (document.getElementById("dppStyles")) return;
    const s = document.createElement("style");
    s.id = "dppStyles";
    s.textContent = `
      #dppOverlay .maModal{ max-width:min(640px,calc(100vw - 16px)); }
      .dpp-hdr-line{font-size:13px;color:var(--mutedText);padding:12px 16px 0;}
      .dpp-section-hdr{font-size:11px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:var(--mutedText);padding:14px 16px 4px;}
      .dpp-info-banner{display:flex;align-items:center;gap:8px;margin:12px 16px 0;padding:8px 12px;background:color-mix(in srgb, var(--brandAccent) 10%, transparent);border-radius:var(--radiusMd,6px);font-size:12px;color:var(--ink);}
      .dpp-seg-control{display:flex;align-items:center;gap:10px;margin:12px 16px 0;flex-wrap:wrap;}
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

  // ── Build overlay — uses maModalOverlay / maModal from ma_shared.css ─────────

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id        = "dppOverlay";
    overlay.className = "maModalOverlay is-open";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Placement Points">

        <div class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Placement Points</div>
            <div class="maModal__subtitle">Choose which categories award points, and how.</div>
          </div>
          <button id="dppBtnClose" class="iconBtn btnSecondary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="maModal__body maModal__body--flush" id="dppBody"></div>

        <div class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button id="dppBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
            <button id="dppBtnApply"  class="maFtrBtn maFtrBtn--save"   type="button">Save</button>
          </div>
        </div>

      </div>`;

    overlay.querySelector("#dppBtnClose")?.addEventListener("click",  close);
    overlay.querySelector("#dppBtnCancel")?.addEventListener("click", close);
    overlay.querySelector("#dppBtnApply")?.addEventListener("click",  doApply);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    return overlay;
  }

  // ── Apply ────────────────────────────────────────────────────────────────────

  function doApply() {
    if (!_config?.onApply) { close(); return; }
    const result = collectState();
    const effectiveScoringSegments = (_state.competition === "PairPair") ? _state.scoringSegments : 1;
    _config.onApply(JSON.stringify(result), effectiveScoringSegments);
    close();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function open(config) {
    if (_overlay) close();
    if (!config || (config.competition !== "PairField" && config.competition !== "PairPair")) {
      setStatus("Placement Points: missing competition type.", "warn");
      return;
    }

    _config = config;
    initState(config);
    injectStyles();

    _overlay = buildOverlay();
    document.body.appendChild(_overlay);

    renderBody();
  }

  function close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _config = null;
    _state  = null;
  }

  MA.definePlacementPoints = { open, close };

})(window);
