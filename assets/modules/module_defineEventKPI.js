/* /assets/modules/module_defineEventKPI.js
 * MA.defineEventKPI — Event KPI selection overlay module.
 *
 * Opens as a full-screen modal. Renders the KPI catalog as a checklist.
 * Placement KPIs show an inline points table editor with expand/collapse.
 *
 * KPIs gated by cascade mode (Pairing/Team placement points, currently the
 * only lockedUnless-bearing entries) are always VISIBLE, never hidden —
 * shown greyed with a lock icon and a plain-language reason when their
 * mode isn't "fixed" yet. This deliberately does not match the old
 * requiresTeam/hasTeams hide behavior; see harmonization discussion this
 * replaces. A locked entry's checkbox is inert (no toggle), and its state
 * is never touched by collectState() while locked — round-tripped exactly
 * as it came in, same "untouched if not shown/editable this session"
 * mechanism module_definePlacementPoints.js already uses for the other
 * competition type's Pairing category.
 *
 * dbEvents_KPIConfig shape (harmonized with dbGames_PlacementPoints'
 * category vocabulary — same field name, same three-value enum):
 *   {
 *     "<kpiKey>": {
 *       "state": "default" | "active" | "disabled",
 *       "pointsConfig": {"1":100, "2":75, ...},   // only when catalog.hasConfig
 *       "tieRule": "split" | "high" | "low"        // only when catalog.hasConfig
 *     },
 *     ...
 *   }
 * Every catalog key is always present. pointsConfig/tieRule, once a key has
 * hasConfig, are ALWAYS present too — never stripped by an uncheck. "default"
 * means never consciously touched (still whatever kpi_catalog.php seeded);
 * checking sets "active", unchecking sets "disabled"; a key never reverts to
 * "default" once touched. No top-level wrapper key — unlike
 * dbGames_PlacementPoints' {top, categories} envelope, this is a flat map;
 * that asymmetry between the two columns is intentional, not an oversight.
 *
 * Usage:
 *   MA.defineEventKPI.open({
 *     kpiCatalog:    { ... },  // from init.kpiCatalog (server-side kpi_catalog.php)
 *     kpiConfig:     { ... },  // current dbEvents_KPIConfig parsed JSON (or null)
 *     pairingFixed:  bool,     // dbEvents_PairingMode === "fixed"
 *     teamFixed:     bool,     // dbEvents_TeamMode === "fixed"
 *     onApply:       (json) => { ... }  // called with serialized JSON string on Save
 *   });
 *
 * Catalog contract this module expects from kpi_catalog.php going forward:
 * each entry may carry lockedUnless: null | "pairingFixed" | "teamFixed" —
 * generalizes the old boolean requiresTeam. kpi_catalog.php itself was not
 * available while writing this pass; this module reads lockedUnless if
 * present and degrades gracefully (never locked) if a catalog entry omits
 * it, but the catalog file itself still needs updating to actually emit it
 * for the Pairing/Team placement points entries — flagged as an open item,
 * not done here.
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
  let _state   = null;   // { kpiKey: { state, pointsConfig, tieRule, expanded, _locked, _lockReason } }

  // ── Locking ──────────────────────────────────────────────────────────────────

  // Generalizes the old boolean requiresTeam. def.lockedUnless names which
  // config flag must be true for this entry to be editable; null/omitted
  // means never locked. Unrecognized values degrade to "never locked"
  // rather than throwing, so an out-of-date catalog entry fails open, not
  // closed.
  function lockInfo(def) {
    if (def.lockedUnless === "pairingFixed") {
      return _config.pairingFixed
        ? { locked: false }
        : { locked: true, reason: "Requires fixed pairing mode for this event." };
    }
    if (def.lockedUnless === "teamFixed") {
      return _config.teamFixed
        ? { locked: false }
        : { locked: true, reason: "Requires fixed team mode for this event." };
    }
    return { locked: false };
  }

  // ── State ────────────────────────────────────────────────────────────────────

  function initState(config) {
    const catalog = config.kpiCatalog || {};
    const saved   = config.kpiConfig  || {};
    _state = {};

    Object.keys(catalog).forEach(key => {
      const def         = catalog[key] || {};
      const saved_entry = saved[key] || {};
      const state       = ["default", "active", "disabled"].includes(saved_entry.state)
        ? saved_entry.state
        : "default";

      _state[key] = {
        state,
        // Always present once hasConfig, regardless of state — never
        // stripped on uncheck. Falls back to the catalog default table
        // only when this key has genuinely never been saved before.
        pointsConfig: saved_entry.pointsConfig || { "1": 100, "2": 75, "3": 50, "4": 25, "5": 10 },
        tieRule:      saved_entry.tieRule || "split",
        // Checkbox reads on for "default" and "active" alike — only an
        // explicit "disabled" renders unchecked, matching
        // module_definePlacementPoints.js's _checked convention.
        expanded:     state !== "disabled" && !!def.hasConfig,
      };
    });
  }

  // Every key actually shown and editable this session (i.e. not locked)
  // graduates from whatever it was to "active"/"disabled" based on its
  // checkbox, and never reverts to "default" once touched. Locked keys are
  // round-tripped completely unmodified — same "untouched if not
  // editable this session" mechanism module_definePlacementPoints.js uses
  // for a hidden competition type's Pairing category.
  function collectState() {
    const catalog = _config.kpiCatalog || {};
    const out = {};
    Object.keys(catalog).forEach(key => {
      const s   = _state[key] || {};
      const def = catalog[key] || {};

      if (lockInfo(def).locked) {
        out[key] = { state: s.state, pointsConfig: s.pointsConfig, tieRule: s.tieRule };
        return;
      }

      const entry = { state: (s.state !== "disabled") ? "active" : "disabled" };
      if (def.hasConfig) {
        entry.pointsConfig = s.pointsConfig;
        entry.tieRule      = s.tieRule;
      }
      out[key] = entry;
    });
    return out;
  }

  function activeCount() {
    return Object.values(_state || {}).filter(s => s.state !== "disabled").length;
  }

  function activeLabels() {
    const catalog = _config?.kpiCatalog || {};
    return Object.entries(_state || {})
      .filter(([, s]) => s.state !== "disabled")
      .map(([k]) => catalog[k]?.label || k)
      .join(" · ");
  }

  // Segment tags (Individual/Pairing/Team/Flight badges) intentionally not
  // rendered — dropped per product decision. def.segments still arrives from
  // kpi_catalog.php and is left untouched in the catalog contract in case a
  // future screen wants it; this module just no longer displays it.

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
    const s = _state[kpiKey] || { state: "default" };
    const { locked, reason } = lockInfo(def);
    // Checkbox reads on for "default" and "active" — only "disabled" reads
    // off. A locked row's checkbox is always inert regardless of its
    // underlying state; see collectState()'s locked round-trip.
    const checked = !locked && s.state !== "disabled";

    return `
      <div class="dek-kpi-row ${locked ? "is-locked" : ""}" data-kpi-key="${esc(kpiKey)}">
        <div class="dek-check ${checked ? "on" : ""} ${locked ? "is-locked" : ""}"
          data-check="${locked ? "" : esc(kpiKey)}" role="checkbox"
          aria-checked="${checked}" aria-disabled="${locked}"
          tabindex="${locked ? "-1" : "0"}"
          aria-label="${esc(def.label)}"></div>
        <div class="dek-kpi-body">
          <div class="dek-kpi-label">
            ${esc(def.label)}
            ${locked ? `<i class="ti ti-lock" aria-hidden="true"></i>` : ""}
          </div>
          <div class="dek-kpi-desc">${esc(locked ? reason : def.description)}</div>
          ${def.hasConfig && checked ? renderPointsEditor(kpiKey) : ""}
        </div>
      </div>`;
  }

  // ── Section header ───────────────────────────────────────────────────────────

  // Pending update: kpi_catalog.php still needs its section values updated
  // to match (currently "stroke"/"points"/"special" per the old two-bucket
  // split). individual/pairingTeam below are the new intended buckets;
  // unrecognized section keys still render fine via the humanize() fallback
  // so this doesn't break against the not-yet-updated catalog file.
  const SECTION_LABELS = {
    individual:  "Individual competitions",
    pairingTeam: "Pairing and team competitions",
    special:     "Special competitions",
  };

  function humanizeSection(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  }

  // ── Full content render ──────────────────────────────────────────────────────

  function renderContent() {
    const catalog = _config.kpiCatalog || {};

    const sections = {};

    // Locked (not editable this session) entries are never hidden — see
    // lockInfo()/renderKPIRow(). Every catalog entry always renders.
    Object.entries(catalog)
      .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
      .forEach(([key, def]) => {
        const section = def.section || "special";
        if (!sections[section]) sections[section] = [];
        sections[section].push([key, def]);
      });

    let html = "";
    Object.entries(sections).forEach(([section, items]) => {
      if (!items.length) return;
      html += `<div class="dek-section-hdr">${esc(SECTION_LABELS[section] || humanizeSection(section))}</div>`;
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
    // Checkbox clicks — locked rows render data-check="" (see renderKPIRow)
    // and are excluded here rather than relying on the empty-key guard
    // inside toggleKPI alone.
    body.querySelectorAll("[data-check]:not([data-check=''])").forEach(el => {
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
    // Checkbox is on for "default" or "active" alike (see renderKPIRow) —
    // toggling off from either lands on "disabled"; toggling on from
    // "disabled" lands on "active", never back to "default".
    const wasOn = _state[key].state !== "disabled";
    _state[key].state = wasOn ? "disabled" : "active";
    // Auto-expand editor when first activating a config KPI
    const def = (_config.kpiCatalog || {})[key] || {};
    if (!wasOn && def.hasConfig) _state[key].expanded = true;
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
      #dekOverlay .maModal{ max-width:min(640px,calc(100vw - 16px)); font-family:var(--fontFamilyBase); }
      /* Sections */
      .dek-section-hdr{font-size:10px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;color:var(--mutedText);padding:10px 16px 6px;background:var(--surfaceChrome);border-bottom:0.5px solid var(--borderSubtle);border-top:0.5px solid var(--borderSubtle);}
      .dek-kpi-row{display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-kpi-row:last-child{border-bottom:none;}
      .dek-kpi-row.is-locked{opacity:.55;}
      /* Checkbox — same shape as .maCheckbox, accent blue at this level
         (module_definePlacementPoints.js's game-level checkbox stays the
         default green; tracked separately, not touched here) */
      .dek-check{width:18px;height:18px;border:1.5px solid var(--borderStrong,#bbb);border-radius:4px;flex-shrink:0;margin-top:2px;background:var(--surface);cursor:pointer;position:relative;}
      .dek-check.on{background:var(--brandAccent);border-color:var(--brandAccent);}
      .dek-check.on::after{content:"";position:absolute;left:4px;top:1px;width:6px;height:10px;border:1.5px solid #fff;border-top:0;border-left:0;transform:rotate(45deg);}
      .dek-check.is-locked{cursor:default;}
      /* KPI text */
      .dek-kpi-body{flex:1;min-width:0;}
      .dek-kpi-label{font-size:13px;font-weight:500;color:var(--ink);display:flex;align-items:center;gap:6px;}
      .dek-kpi-label .ti-lock{font-size:13px;color:var(--mutedText);}
      .dek-kpi-desc{font-size:12px;color:var(--mutedText);margin-top:2px;line-height:1.4;}
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
