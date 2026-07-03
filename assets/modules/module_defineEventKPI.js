/* /assets/modules/module_defineEventKPI.js
 * MA.defineEventKPI — Event KPI selection overlay module.
 *
 * Opens as a full-screen modal. Renders the KPI catalog as a checklist.
 * Placement KPIs show an inline points table editor with expand/collapse.
 * Team KPIs are hidden (not greyed) when hasTeams is false.
 *
 * Usage:
 *   MA.defineEventKPI.open({
 *     kpiCatalog: { ... },   // from init.kpiCatalog (server-side kpi_catalog.php)
 *     kpiConfig:  { ... },   // current dbEvents_KPIConfig parsed JSON (or null)
 *     hasTeams:   bool,      // whether event has TeamConfig set
 *     onApply:    (json) => { ... }  // called with serialized JSON string on Save
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

  // ── Singleton ────────────────────────────────────────────────────────────────

  let _overlay = null;
  let _config  = null;
  let _state   = null;   // { kpiKey: { active, pointsConfig, tieRule, expanded } }

  // ── State ────────────────────────────────────────────────────────────────────

  function initState(config) {
    const catalog   = config.kpiCatalog || {};
    const saved     = config.kpiConfig  || {};
    _state = {};

    Object.keys(catalog).forEach(key => {
      const saved_entry = saved[key] || {};
      _state[key] = {
        active:       !!(saved_entry.active),
        pointsConfig: saved_entry.pointsConfig || { "1": 100, "2": 75, "3": 50, "4": 25, "5": 10 },
        tieRule:      saved_entry.tieRule || "split",
        expanded:     !!(saved_entry.active && catalog[key].hasConfig), // open by default if active + has config
      };
    });
  }

  function collectState() {
    const catalog = _config.kpiCatalog || {};
    const out = {};
    Object.keys(catalog).forEach(key => {
      const s = _state[key] || {};
      const def = catalog[key] || {};
      const entry = { active: !!(s.active) };
      if (def.hasConfig && s.active) {
        entry.pointsConfig = s.pointsConfig;
        entry.tieRule      = s.tieRule;
      }
      out[key] = entry;
    });
    return out;
  }

  function activeCount() {
    return Object.values(_state || {}).filter(s => s.active).length;
  }

  function activeLabels() {
    const catalog = _config?.kpiCatalog || {};
    return Object.entries(_state || {})
      .filter(([, s]) => s.active)
      .map(([k]) => catalog[k]?.label || k)
      .join(" · ");
  }

  // ── Segment tag labels ───────────────────────────────────────────────────────

  const SEG_ICONS = {
    individual: "ti-user",
    pairing:    "ti-users",
    team:       "ti-shield-half",
    flight:     "ti-layout-columns",
    gross:      "ti-golf",
    net:        "ti-golf",
  };
  const SEG_LABELS = {
    individual: "Individual",
    pairing:    "Pairing",
    team:       "Team",
    flight:     "Flight",
    gross:      "Gross",
    net:        "Net",
  };

  function renderSegments(segments) {
    if (!Array.isArray(segments) || !segments.length) return "";
    return `<div class="dek-segments">${segments.map(s => `
      <span class="dek-seg-tag">
        <i class="ti ${SEG_ICONS[s] || "ti-point"}" aria-hidden="true"></i>
        ${esc(SEG_LABELS[s] || s)}
      </span>`).join("")}
    </div>`;
  }

  // ── Points table editor ──────────────────────────────────────────────────────

  function pointsConfigSummary(kpiKey) {
    const s = _state[kpiKey];
    if (!s) return "";
    const places = Object.keys(s.pointsConfig || {}).length;
    const vals   = Object.values(s.pointsConfig || {}).join(", ");
    const tie    = s.tieRule === "split" ? "Split ties"
                 : s.tieRule === "high"  ? "High ties"
                 : "Low ties";
    return `${places} place${places !== 1 ? "s" : ""} configured · ${vals} pts · ${tie}`;
  }

  function renderPointsEditor(kpiKey) {
    const s = _state[kpiKey];
    if (!s) return "";
    const expanded = s.expanded;
    const summary  = pointsConfigSummary(kpiKey);

    const rows = Object.entries(s.pointsConfig || {}).map(([place, pts]) => {
      const ordinal = place === "1" ? "1st"
                    : place === "2" ? "2nd"
                    : place === "3" ? "3rd"
                    : `${place}th`;
      return `<tr>
        <td>${esc(ordinal)}</td>
        <td style="text-align:right;">
          <input class="dek-pts-input" type="number" min="0"
            data-kpi="${esc(kpiKey)}" data-place="${esc(place)}"
            value="${esc(String(pts))}" />
        </td>
      </tr>`;
    }).join("");

    return `
      <button class="dek-config-toggle ${expanded ? "open" : ""}"
        data-toggle-kpi="${esc(kpiKey)}"
        aria-expanded="${expanded}"
        aria-controls="dek-editor-${esc(kpiKey)}">
        <i class="ti ti-settings" aria-hidden="true"></i>
        <span class="dek-toggle-label">${expanded ? "Hide points table" : "Edit points table"}</span>
        <i class="ti ti-chevron-down dek-chevron" aria-hidden="true"></i>
      </button>

      <div class="dek-editor" id="dek-editor-${esc(kpiKey)}"
        style="${expanded ? "" : "display:none;"}">
        <div class="dek-editor-title">Points awarded per finishing position</div>
        <table class="dek-pts-table">
          <thead>
            <tr>
              <th>Place</th>
              <th style="text-align:right;">Points</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="dek-add-btn" data-add-place="${esc(kpiKey)}" type="button">
          <i class="ti ti-plus" aria-hidden="true"></i> Add place
        </button>
        <div class="dek-tie-row">
          <span class="dek-tie-label">Tie rule</span>
          <select class="dek-tie-select" data-tie-kpi="${esc(kpiKey)}">
            <option value="split" ${s.tieRule === "split" ? "selected" : ""}>Split — average the tied positions' points</option>
            <option value="high"  ${s.tieRule === "high"  ? "selected" : ""}>High — all tied players receive the higher points</option>
            <option value="low"   ${s.tieRule === "low"   ? "selected" : ""}>Low — all tied players receive the lower points</option>
          </select>
        </div>
      </div>

      <div class="dek-config-summary" id="dek-summary-${esc(kpiKey)}"
        style="${expanded ? "display:none;" : ""}">
        <i class="ti ti-check" aria-hidden="true" style="color:var(--text-success);"></i>
        ${esc(summary)}
      </div>`;
  }

  // ── KPI row ──────────────────────────────────────────────────────────────────

  function renderKPIRow(kpiKey, def) {
    const s = _state[kpiKey] || { active: false };
    const checked  = s.active;

    return `
      <div class="dek-kpi-row" data-kpi-key="${esc(kpiKey)}">
        <div class="dek-check ${checked ? "on" : ""}"
          data-check="${esc(kpiKey)}" role="checkbox"
          aria-checked="${checked}" tabindex="0"
          aria-label="${esc(def.label)}"></div>
        <div class="dek-kpi-body">
          <div class="dek-kpi-label">${esc(def.label)}</div>
          <div class="dek-kpi-desc">${esc(def.description)}</div>
          ${renderSegments(def.segments)}
          ${def.hasConfig && checked ? renderPointsEditor(kpiKey) : ""}
        </div>
      </div>`;
  }

  // ── Section header ───────────────────────────────────────────────────────────

  const SECTION_LABELS = {
    stroke:  "Stroke competitions",
    points:  "Points competitions",
    special: "Special competitions",
  };

  // ── Full content render ──────────────────────────────────────────────────────

  function renderContent() {
    const catalog  = _config.kpiCatalog || {};
    const hasTeams = !!_config.hasTeams;

    const sections = { stroke: [], points: [], special: [] };

    Object.entries(catalog)
      .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
      .forEach(([key, def]) => {
        if (def.requiresTeam && !hasTeams) return; // hide team KPIs when no teams
        const section = def.section || "special";
        if (!sections[section]) sections[section] = [];
        sections[section].push([key, def]);
      });

    let html = "";
    Object.entries(sections).forEach(([section, items]) => {
      if (!items.length) return;
      html += `<div class="dek-section-hdr">${esc(SECTION_LABELS[section] || section)}</div>`;
      items.forEach(([key, def]) => {
        html += renderKPIRow(key, def);
      });
    });

    return html;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────

  function updateFooter() {
    const countEl = _overlay?.querySelector("#dekActiveCount");
    const labelEl = _overlay?.querySelector("#dekActiveList");
    const saveBtn = _overlay?.querySelector("#dekBtnApply");
    if (countEl) countEl.textContent = `${activeCount()} competition${activeCount() !== 1 ? "s" : ""} active`;
    if (labelEl) labelEl.textContent = activeLabels() || "None selected";
    if (saveBtn) saveBtn.textContent = activeCount() ? `Save (${activeCount()} active)` : "Save";
  }

  // ── Full re-render of body ───────────────────────────────────────────────────

  function renderBody() {
    const body = _overlay?.querySelector("#dekBody");
    if (!body) return;
    body.innerHTML = renderContent();
    wireBodyEvents(body);
    updateFooter();
  }

  // ── Wire events ──────────────────────────────────────────────────────────────

  function wireBodyEvents(body) {
    // Checkbox clicks
    body.querySelectorAll("[data-check]").forEach(el => {
      el.addEventListener("click",   () => toggleKPI(el.dataset.check));
      el.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleKPI(el.dataset.check); } });
    });

    // Config toggle (expand/collapse points editor)
    body.querySelectorAll("[data-toggle-kpi]").forEach(btn => {
      btn.addEventListener("click", () => toggleEditor(btn.dataset.toggleKpi));
    });

    // Points inputs
    body.querySelectorAll(".dek-pts-input").forEach(inp => {
      inp.addEventListener("change", () => {
        const key   = inp.dataset.kpi;
        const place = inp.dataset.place;
        if (!_state[key]) return;
        _state[key].pointsConfig[place] = parseInt(inp.value, 10) || 0;
        updateSummary(key);
      });
    });

    // Add place buttons
    body.querySelectorAll("[data-add-place]").forEach(btn => {
      btn.addEventListener("click", () => addPlace(btn.dataset.addPlace));
    });

    // Tie selects
    body.querySelectorAll(".dek-tie-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.tieKpi;
        if (_state[key]) { _state[key].tieRule = sel.value; updateSummary(key); }
      });
    });
  }

  function toggleKPI(key) {
    if (!_state[key]) return;
    _state[key].active = !_state[key].active;
    // Auto-expand editor when first activating a config KPI
    const def = (_config.kpiCatalog || {})[key] || {};
    if (_state[key].active && def.hasConfig) _state[key].expanded = true;
    renderBody();
  }

  function toggleEditor(key) {
    if (!_state[key]) return;
    _state[key].expanded = !_state[key].expanded;

    const editor  = _overlay?.querySelector(`#dek-editor-${key}`);
    const summary = _overlay?.querySelector(`#dek-summary-${key}`);
    const toggle  = _overlay?.querySelector(`[data-toggle-kpi="${key}"]`);
    const label   = toggle?.querySelector(".dek-toggle-label");

    if (_state[key].expanded) {
      if (editor)  editor.style.display  = "";
      if (summary) summary.style.display = "none";
      toggle?.classList.add("open");
      toggle?.setAttribute("aria-expanded", "true");
      if (label) label.textContent = "Hide points table";
    } else {
      if (editor)  editor.style.display  = "none";
      if (summary) summary.style.display = "";
      toggle?.classList.remove("open");
      toggle?.setAttribute("aria-expanded", "false");
      if (label) label.textContent = "Edit points table";
    }
  }

  function addPlace(key) {
    if (!_state[key]) return;
    const existing = Object.keys(_state[key].pointsConfig);
    const nextPlace = String(existing.length + 1);
    _state[key].pointsConfig[nextPlace] = 0;
    renderBody(); // full re-render to show new row
  }

  function updateSummary(key) {
    const summaryEl = _overlay?.querySelector(`#dek-summary-${key}`);
    if (summaryEl) summaryEl.innerHTML = `
      <i class="ti ti-check" aria-hidden="true" style="color:var(--text-success);"></i>
      ${esc(pointsConfigSummary(key))}`;
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  // ── Styles — checklist interior only; modal shell uses ma_shared.css ──────────

  function injectStyles() {
    if (document.getElementById("dekStyles")) return;
    const s = document.createElement("style");
    s.id = "dekStyles";
    s.textContent = `
      /* Widen modal slightly for the KPI checklist */
      #dekOverlay .maModal{ max-width:min(640px,calc(100vw - 16px)); }
      /* Sections */
      .dek-section-hdr{font-size:10px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;color:var(--mutedText);padding:10px 16px 6px;background:var(--surfaceChrome);border-bottom:0.5px solid var(--borderSubtle);border-top:0.5px solid var(--borderSubtle);}
      .dek-kpi-row{display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-kpi-row:last-child{border-bottom:none;}
      /* Checkbox — same pattern as .maCheckbox */
      .dek-check{width:18px;height:18px;border:1.5px solid var(--borderStrong,#bbb);border-radius:4px;flex-shrink:0;margin-top:2px;background:var(--surface);cursor:pointer;position:relative;}
      .dek-check.on{background:var(--brandSecondary);border-color:var(--brandSecondary);}
      .dek-check.on::after{content:"";position:absolute;left:4px;top:1px;width:6px;height:10px;border:1.5px solid #fff;border-top:0;border-left:0;transform:rotate(45deg);}
      /* KPI text */
      .dek-kpi-body{flex:1;min-width:0;}
      .dek-kpi-label{font-size:13px;font-weight:500;color:var(--ink);}
      .dek-kpi-desc{font-size:12px;color:var(--mutedText);margin-top:2px;line-height:1.4;}
      /* Segment tags */
      .dek-segments{margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;}
      .dek-seg-tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:500;border:0.5px solid var(--borderSubtle);background:var(--surfaceChrome);color:var(--mutedText);}
      /* Config toggle */
      .dek-config-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:7px;font-size:11px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:0;font-family:inherit;}
      .dek-config-toggle .dek-chevron{font-size:11px;transition:transform .15s;}
      .dek-config-toggle.open .dek-chevron{transform:rotate(180deg);}
      /* Points editor */
      .dek-editor{margin-top:10px;background:var(--surfaceChrome);border:0.5px solid var(--borderSubtle);border-radius:var(--radiusMd,6px);padding:12px;}
      .dek-editor-title{font-size:11px;font-weight:500;color:var(--mutedText);margin-bottom:8px;}
      .dek-pts-table{width:100%;border-collapse:collapse;font-size:12px;}
      .dek-pts-table th{text-align:left;color:var(--mutedText);font-weight:500;padding:4px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-pts-table td{padding:4px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-pts-table tr:last-child td{border-bottom:none;}
      .dek-pts-input{width:64px;border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:2px 6px;font-size:12px;text-align:right;background:var(--surface);color:var(--ink);}
      .dek-add-btn{font-size:11px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:3px;margin-top:6px;font-family:inherit;}
      .dek-tie-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--borderSubtle);}
      .dek-tie-label{font-size:11px;font-weight:500;color:var(--mutedText);white-space:nowrap;}
      .dek-tie-select{border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:3px 8px;font-size:12px;background:var(--surface);color:var(--ink);flex:1;}
      .dek-config-summary{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;font-style:italic;color:var(--mutedText);}
      /* Footer info */
      .dek-footer-info{flex:1;min-width:0;}
      .dek-footer-count{font-size:12px;font-weight:700;color:var(--ink);}
      .dek-footer-list{font-size:11px;color:var(--mutedText);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
    `;
    document.head.appendChild(s);
  }

  // ── Build overlay — uses maModalOverlay / maModal from ma_shared.css ─────────

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id        = "dekOverlay";
    overlay.className = "maModalOverlay is-open";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Event Competition">

        <div class="maModal__hdr" style="background:var(--brandTertiary);">
          <div class="maModal__titles">
            <div class="maModal__title">Event Competition</div>
            <div class="maModal__subtitle">Select which competitions are active for this event</div>
          </div>
          <button id="dekBtnClose" class="iconBtn btnSecondary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="maModal__body maModal__body--flush" id="dekBody"></div>

        <div class="maModal__ftr">
          <div class="dek-footer-info">
            <div class="dek-footer-count" id="dekActiveCount">0 competitions active</div>
            <div class="dek-footer-list"  id="dekActiveList">None selected</div>
          </div>
          <div class="maModal__ftrActions" style="flex:0 0 auto;width:auto;">
            <button id="dekBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
            <button id="dekBtnApply"  class="maFtrBtn maFtrBtn--save"   type="button">Save</button>
          </div>
        </div>

      </div>`;

    overlay.querySelector("#dekBtnClose")?.addEventListener("click",  close);
    overlay.querySelector("#dekBtnCancel")?.addEventListener("click", close);
    overlay.querySelector("#dekBtnApply")?.addEventListener("click",  doApply);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    return overlay;
  }

    // ── Apply ────────────────────────────────────────────────────────────────────

  function doApply() {
    if (!_config?.onApply) { close(); return; }
    const result = collectState();
    _config.onApply(JSON.stringify(result));
    close();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function open(config) {
    if (_overlay) close();
    if (!config?.kpiCatalog || !Object.keys(config.kpiCatalog).length) {
      setStatus("KPI catalog not loaded.", "warn");
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

  MA.defineEventKPI = { open, close };

})(window);
