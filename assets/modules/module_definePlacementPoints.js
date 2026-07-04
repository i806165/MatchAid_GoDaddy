/* /assets/modules/module_definePlacementPoints.js
 * MA.definePlacementPoints — Game-level Placement Points editor overlay module.
 *
 * Opens as a modal. Owns parsing, defaulting, validation, rendering, editing,
 * and serialization of dbGames_PlacementPoints. The Game Settings page owns
 * when to show the Configure button, which competition/scoringSegments values
 * to pass in, storing the returned JSON string in wizard state, and including
 * it in the save patch. This module never calls saveGameSettings.php directly.
 *
 * Usage:
 *   MA.definePlacementPoints.open({
 *     competition:     "PairField" | "PairPair",
 *     scoringSegments: 1 | 3,             // PairPair only; initial value — editable inline for PairPair
 *     placementPoints: currentJsonValue,  // parsed object or JSON string from dbGames_PlacementPoints
 *     onApply: (jsonString, scoringSegments) => { ... }
 *       // jsonString       — serialized dbGames_PlacementPoints
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

  const DEFAULT_PAIRFIELD_TABLE = { pointsConfig: { "1": 100, "2": 75, "3": 50 }, tieRule: "split" };
  const DEFAULT_OUTCOME = { win: 1, halve: 0.5, loss: 0 };
  const SEGMENT_LABELS_MULTI = { "1": "Front 9", "2": "Back 9", "3": "Overall" };

  function segmentLabel(key, segCount) {
    // A single-segment match is scored as one whole-round result — "Overall,"
    // not "Front 9." The Front 9 / Back 9 split only makes sense once there
    // are 3 independently-scored segments.
    if (segCount === 1) return "Overall";
    return SEGMENT_LABELS_MULTI[key] || `Segment ${key}`;
  }

  // ── Singleton ────────────────────────────────────────────────────────────────

  let _overlay = null;
  let _config  = null;
  let _state   = null;

  // ── State ────────────────────────────────────────────────────────────────────

  function parseIncoming(raw) {
    let parsed = raw;
    if (typeof parsed === "string" && parsed.trim() !== "") {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }
    return (parsed && typeof parsed === "object") ? parsed : null;
  }

  function initState(config) {
    const competition     = config.competition === "PairPair" ? "PairPair" : "PairField";
    const scoringSegments = parseInt(config.scoringSegments, 10) === 3 ? 3 : 1;
    const incoming = parseIncoming(config.placementPoints);

    if (competition === "PairField") {
      const gross = (incoming?.gross?.pointsConfig) ? incoming.gross : { ...DEFAULT_PAIRFIELD_TABLE, pointsConfig: { ...DEFAULT_PAIRFIELD_TABLE.pointsConfig } };
      const net   = (incoming?.net?.pointsConfig)   ? incoming.net   : { ...DEFAULT_PAIRFIELD_TABLE, pointsConfig: { ...DEFAULT_PAIRFIELD_TABLE.pointsConfig } };
      _state = {
        competition,
        active: incoming?.active !== false,
        activeScoreType: "gross",
        gross: { pointsConfig: { ...gross.pointsConfig }, tieRule: gross.tieRule || "split" },
        net:   { pointsConfig: { ...net.pointsConfig },   tieRule: net.tieRule   || "split" },
      };
      return;
    }

    // PairPair
    const seg1 = incoming?.segments?.["1"] || { ...DEFAULT_OUTCOME };
    const segments = {};
    for (let i = 1; i <= scoringSegments; i++) {
      const key = String(i);
      const existing = incoming?.segments?.[key];
      segments[key] = existing ? { win: numOrZero(existing.win), halve: numOrZero(existing.halve), loss: numOrZero(existing.loss) } : { ...seg1 };
    }
    _state = {
      competition,
      scoringSegments,
      active: incoming?.active !== false,
      segments,
    };
  }

  // Change the segment count from inside the modal — expands by cloning segment
  // "1" into the new keys, or shrinks by dropping keys beyond the new count.
  // Only meaningful for PairPair; never called for PairField.
  function setScoringSegments(count) {
    const target = count === 3 ? 3 : 1;
    if (target === _state.scoringSegments) return;

    const seg1 = _state.segments["1"] || { ...DEFAULT_OUTCOME };
    const next = {};
    for (let i = 1; i <= target; i++) {
      const key = String(i);
      next[key] = _state.segments[key] || { ...seg1 };
    }
    _state.segments = next;
    _state.scoringSegments = target;
    renderBody();
  }

  function collectState() {
    if (_state.competition === "PairField") {
      return {
        active: !!_state.active,
        gross: { pointsConfig: { ..._state.gross.pointsConfig }, tieRule: _state.gross.tieRule },
        net:   { pointsConfig: { ..._state.net.pointsConfig },   tieRule: _state.net.tieRule },
      };
    }
    return {
      active: !!_state.active,
      segments: { ..._state.segments },
    };
  }

  // ── PairField rendering ───────────────────────────────────────────────────────

  function renderPairFieldBody() {
    const activeType = _state.activeScoreType;
    const table = _state[activeType];
    const places = Object.keys(table.pointsConfig);

    const rows = places.map(place => {
      const ordinal = place === "1" ? "1st" : place === "2" ? "2nd" : place === "3" ? "3rd" : `${place}th`;
      return `<tr>
        <td>${esc(ordinal)}</td>
        <td style="text-align:right;">
          <input class="dpp-pts-input" type="number" min="0"
            data-place="${esc(place)}" value="${esc(String(table.pointsConfig[place]))}" />
        </td>
      </tr>`;
    }).join("");

    return `
      <div class="dpp-hdr-line">Define how points are awarded for finishing positions.</div>

      <div class="maSeg" id="dppScoreTypeSeg">
        <button class="maSegBtn ${activeType === "gross" ? "is-active" : ""}" data-score-type="gross" type="button">Gross</button>
        <button class="maSegBtn ${activeType === "net"   ? "is-active" : ""}" data-score-type="net"   type="button">Net</button>
      </div>

      <div class="dpp-card">
        <div class="dpp-card-title">${activeType === "gross" ? "Gross" : "Net"} — Points awarded per finishing position</div>
        <table class="dpp-pts-table">
          <thead><tr><th>Place</th><th style="text-align:right;">Points</th></tr></thead>
          <tbody id="dppPtsRows">${rows}</tbody>
        </table>
        <button class="dpp-add-btn" id="dppAddPlace" type="button">
          <i class="ti ti-plus" aria-hidden="true"></i> Add place
        </button>
        <div class="dpp-tie-row">
          <span class="dpp-tie-label">Tie Rule</span>
          <select class="dpp-tie-select" id="dppTieSelect">
            <option value="split" ${table.tieRule === "split" ? "selected" : ""}>Split — average the tied positions' points</option>
            <option value="high"  ${table.tieRule === "high"  ? "selected" : ""}>High — all tied players receive the higher points</option>
            <option value="low"   ${table.tieRule === "low"   ? "selected" : ""}>Low — all tied players receive the lower points</option>
          </select>
        </div>
        <div class="dpp-hint">Determines how points are awarded when two or more players tie for the same position.</div>
      </div>`;
  }

  // ── PairPair rendering ─────────────────────────────────────────────────────────

  function renderPairPairBody() {
    const segCount = _state.scoringSegments;
    const segKeys = Object.keys(_state.segments);

    const headerCells = segKeys.map(k => `<th>${esc(segmentLabel(k, segCount))}</th>`).join("");

    const outcomeRows = ["win", "halve", "loss"].map(outcome => {
      const label = outcome === "win" ? "Win" : outcome === "halve" ? "Halve" : "Loss";
      const cells = segKeys.map(k => `
        <td>
          <input class="dpp-pts-input" type="number" step="0.5" min="0"
            data-segment="${esc(k)}" data-outcome="${esc(outcome)}"
            value="${esc(String(_state.segments[k][outcome]))}" />
        </td>`).join("");
      return `<tr><td>${esc(label)}</td>${cells}</tr>`;
    }).join("");

    return `
      <div class="dpp-hdr-line">Define the points awarded for each match outcome by scoring segment.</div>

      <div class="dpp-seg-control">
        <span class="dpp-seg-control-label">Scoring Segments</span>
        <div class="maChoiceChips" id="dppScoringSegChips">
          <button class="maChoiceChip ${segCount === 1 ? "is-selected" : ""}" data-seg-count="1" type="button">1</button>
          <button class="maChoiceChip ${segCount === 3 ? "is-selected" : ""}" data-seg-count="3" type="button">3</button>
        </div>
        <span class="dpp-seg-control-hint">${segCount === 1 ? "One overall result" : "Front 9 / Back 9 / Overall, scored independently"}</span>
      </div>

      <div class="dpp-card">
        <div class="dpp-card-title">Match Result Points</div>
        <table class="dpp-pts-table dpp-matrix">
          <thead><tr><th>Outcome</th>${headerCells}</tr></thead>
          <tbody>${outcomeRows}</tbody>
        </table>
        <div class="dpp-hint">Use separate values when each segment should award different match points.</div>
      </div>

      ${segCount === 1 ? `
        <div class="dpp-info-banner">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          For one-segment games, only Segment 1 is used.
        </div>` : ""}`;
  }

  function renderContent() {
    return _state.competition === "PairField" ? renderPairFieldBody() : renderPairPairBody();
  }

  // ── Wire events ──────────────────────────────────────────────────────────────

  function wireBodyEvents(body) {
    // PairField — score type tabs
    body.querySelectorAll("[data-score-type]").forEach(btn => {
      btn.addEventListener("click", () => {
        _state.activeScoreType = btn.dataset.scoreType;
        renderBody();
      });
    });

    // PairField — points inputs
    body.querySelectorAll(".dpp-pts-table:not(.dpp-matrix) .dpp-pts-input").forEach(inp => {
      inp.addEventListener("change", () => {
        const place = inp.dataset.place;
        _state[_state.activeScoreType].pointsConfig[place] = Math.round(numOrZero(inp.value));
      });
    });

    // PairField — add place
    body.querySelector("#dppAddPlace")?.addEventListener("click", () => {
      const table = _state[_state.activeScoreType];
      const nextPlace = String(Object.keys(table.pointsConfig).length + 1);
      table.pointsConfig[nextPlace] = 0;
      renderBody();
    });

    // PairField — tie rule
    body.querySelector("#dppTieSelect")?.addEventListener("change", (e) => {
      _state[_state.activeScoreType].tieRule = e.target.value;
    });

    // PairPair — matrix inputs
    body.querySelectorAll(".dpp-matrix .dpp-pts-input").forEach(inp => {
      inp.addEventListener("change", () => {
        const seg     = inp.dataset.segment;
        const outcome = inp.dataset.outcome;
        if (_state.segments[seg]) _state.segments[seg][outcome] = numOrZero(inp.value);
      });
    });

    // PairPair — inline Scoring Segments control
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

  // ── Styles — editor interior only; modal shell uses ma_shared.css ────────────

  function injectStyles() {
    if (document.getElementById("dppStyles")) return;
    const s = document.createElement("style");
    s.id = "dppStyles";
    s.textContent = `
      #dppOverlay .maModal{ max-width:min(640px,calc(100vw - 16px)); }
      .dpp-hdr-line{font-size:13px;color:var(--mutedText);padding:12px 16px 0;}
      .dpp-info-banner{display:flex;align-items:center;gap:8px;margin:12px 16px 0;padding:8px 12px;background:var(--brandAccent,#0b5fff);background:color-mix(in srgb, var(--brandAccent) 10%, transparent);border-radius:var(--radiusMd,6px);font-size:12px;color:var(--ink);}
      .dpp-seg-control{display:flex;align-items:center;gap:10px;margin:12px 16px 0;flex-wrap:wrap;}
      .dpp-seg-control-label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;color:var(--mutedText);white-space:nowrap;}
      .dpp-seg-control-hint{font-size:11px;color:var(--mutedText);}
      .dpp-card{margin:12px 16px 16px;background:var(--surfaceChrome);border:0.5px solid var(--borderSubtle);border-radius:var(--radiusMd,6px);padding:12px;}
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

    const subtitle = _state.competition === "PairPair"
      ? "Define match-result points awarded by scoring segment."
      : "Define how points are awarded for finishing positions.";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Placement Points">

        <div class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Placement Points</div>
            <div class="maModal__subtitle">${esc(subtitle)}</div>
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
