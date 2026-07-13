/* /assets/modules/module_defineEventKPI.js
 * MA.defineEventKPI — Event KPI selection overlay module.
 *
 * Opens as a full-screen modal. Renders a fixed, hardcoded KPI catalog
 * (CATALOG below) as a checklist — kpi_catalog.php is retired; this
 * module is now the sole source of truth for the catalog, the same way
 * module_definePlacementPoints.js owns its own CATEGORY_DEFS rather than
 * reading them from a server-side include. eventmaint.php no longer
 * loads or passes a kpiCatalog payload.
 *
 * Every points-bearing (hasConfig: true) row shows its points table and
 * tie-rule select inline, always, whenever it's checked and unlocked —
 * no expand/collapse, no collapsed-state summary line. All four
 * placement categories (Individual Gross, Individual Net, Pairing, Team)
 * use the identical renderPointsEditor() structure; only the wrapper
 * (label, description, lock state) differs between them.
 *
 * Two independent lock mechanisms, both rendered the same way (greyed
 * row, lock icon, reason text in place of the description, no points
 * table, checkbox inert):
 *   - lockedUnless: "pairingFixed" | "teamFixed" — gated on the live
 *     event's cascade mode, passed in via config. Resolves to unlocked
 *     once that mode is "fixed".
 *   - comingSoon: true — permanent, never resolves to unlocked. For
 *     catalog entries with no algorithm in ServiceEventSummary yet
 *     (Ringer/eclectic, Hole champions).
 * A locked entry's state is never touched by collectState() — round-
 * tripped exactly as it came in, so an admin's prior configuration on a
 * category survives it being temporarily out of scope (see
 * ServiceDbEvents::syncKPIConfigForModeChange() on the PHP side, which
 * flips state between "default"/"disabled" on a mode transition but
 * never clears pointsConfig/tieRule).
 *
 * dbEvents_KPIConfig shape (harmonized with dbGames_PlacementPoints'
 * category vocabulary — same field name, same three-value enum):
 *   {
 *     "grossPlacement":   { "state": "default"|"active"|"disabled", "pointsConfig": {...}, "tieRule": "split"|"high"|"low" },
 *     "netPlacement":     { ... },
 *     "pairingPlacement": { ... },
 *     "teamPlacement":    { ... },
 *     "RINGER":           { "state": ... },   // no pointsConfig/tieRule — hasConfig: false
 *     "HOLE_CHAMPIONS":   { "state": ... }
 *   }
 * These four placement keys are exactly what
 * ServiceBuildEventSummary::parseEventKPIConfig() reads — the vocabulary
 * must match verbatim or a saved category silently falls back to that
 * service's own hardcoded default table. pointsConfig/tieRule, on any
 * hasConfig key, are ALWAYS present — never stripped by an uncheck.
 * "default" means never consciously touched via this modal's Save;
 * checking sets "active", unchecking sets "disabled" — except on
 * pairingPlacement/teamPlacement, whose state can ALSO be forced by a
 * mode transition server-side (see ServiceDbEvents), independent of
 * this modal ever having been opened. state is display-only — it never
 * gates computation in ServiceBuildEventSummary. No top-level wrapper
 * key — unlike dbGames_PlacementPoints' {top, categories} envelope,
 * this is a flat map.
 *
 * Usage:
 *   MA.defineEventKPI.open({
 *     kpiConfig:     { ... },  // current dbEvents_KPIConfig parsed JSON (or null)
 *     pairingFixed:  bool,     // dbEvents_PairingMode === "fixed"
 *     teamFixed:     bool,     // dbEvents_TeamMode === "fixed"
 *     onApply:       (json) => { ... }  // called with serialized JSON string on Save
 *   });
 *
 * MA.defineEventKPI.catalog is also exposed (read-only) so callers like
 * event_maintenance.js can resolve a key to its label for hint text
 * without needing their own copy of the catalog.
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

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // Independent copy — same name/value as the constants of the same
  // purpose in ServiceDbEvents and
  // ServiceBuildEventSummary::EVENT_PLACEMENT_DEFAULTS, kept in sync by
  // convention (grep EVENT_PLACEMENT_DEFAULTS to find all three), not by
  // any shared payload. This copy's only job is seeding a fresh, never-
  // saved checkbox's form state below — it is NOT consulted by the
  // server and has no bearing on what actually gets scored; ServiceDbEvents'
  // own copy, written at event creation, is what matters there.
  const EVENT_PLACEMENT_DEFAULTS = { "1": 100, "2": 75, "3": 50 };

  // ── Catalog ──────────────────────────────────────────────────────────────────
  // Replaces kpi_catalog.php. Section keys drive grouping/order in the
  // modal only ("individual" | "event" | "special"); see SECTION_LABELS.
  // lockedUnless names a boolean the caller passes into open() (see
  // lockInfo()); comingSoon is a standing, caller-independent lock.
  const CATALOG = {
    grossPlacement: {
      label: "Individual gross placement points",
      section: "individual",
      hasConfig: true,
      sortOrder: 10,
      lockedUnless: null,
      description: "Ranks each player by gross score across all rounds. Lower is better.",
    },
    netPlacement: {
      label: "Individual net placement points",
      section: "individual",
      hasConfig: true,
      sortOrder: 20,
      lockedUnless: null,
      description: "Ranks each player by net score across all rounds. Lower is better.",
    },
    pairingPlacement: {
      label: "Pairing placement points",
      section: "event",
      hasConfig: true,
      sortOrder: 30,
      lockedUnless: "pairingFixed",
      description: "Ranks each pairing by total points across all rounds. Higher is better.",
    },
    teamPlacement: {
      label: "Team placement points",
      section: "event",
      hasConfig: true,
      sortOrder: 40,
      lockedUnless: "teamFixed",
      description: "Ranks each team by total points across all rounds. Higher is better.",
    },
    RINGER: {
      label: "Ringer / eclectic",
      section: "special",
      hasConfig: false,
      sortOrder: 50,
      lockedUnless: null,
      comingSoon: true,
      description: "Each player's personal best score per hole across their own rounds.",
    },
    HOLE_CHAMPIONS: {
      label: "Hole champions",
      section: "special",
      hasConfig: false,
      sortOrder: 60,
      lockedUnless: null,
      comingSoon: true,
      description: "Best score per hole across all players across all rounds. Same player cannot tie themselves.",
    },
  };

  // ── Singleton ────────────────────────────────────────────────────────────────

  let _overlay = null;
  let _config  = null;
  let _state   = null;   // { kpiKey: { state, pointsConfig, tieRule } } — lock status is derived on render via lockInfo(), not stored

  // ── Locking ──────────────────────────────────────────────────────────────────

  // Generalizes the old boolean requiresTeam. def.lockedUnless names which
  // config flag must be true for this entry to be editable; null/omitted
  // means never locked. Unrecognized values degrade to "never locked"
  // rather than throwing, so an out-of-date catalog entry fails open, not
  // closed.
  //
  // def.comingSoon is a separate, permanent lock — unlike lockedUnless,
  // it isn't gated on any event config and never resolves to unlocked.
  // Checked first: a comingSoon entry stays locked regardless of what
  // lockedUnless would otherwise say. Used for catalog entries whose
  // algorithm doesn't exist in ServiceEventSummary yet — surfaced so
  // admins know the capability is planned, but inert until implemented.
  function lockInfo(def) {
    if (def.comingSoon) {
      return { locked: true, reason: "Coming soon — not yet available." };
    }
    if (def.lockedUnless === "pairingFixed") {
      return _config.pairingFixed
        ? { locked: false }
        : { locked: true, reason: "Event-level pairings not enabled for this event." };
    }
    if (def.lockedUnless === "teamFixed") {
      return _config.teamFixed
        ? { locked: false }
        : { locked: true, reason: "Event-level teams not enabled for this event." };
    }
    return { locked: false };
  }

  // ── State ────────────────────────────────────────────────────────────────────

  function initState(config) {
    const saved = config.kpiConfig || {};
    _state = {};

    Object.keys(CATALOG).forEach(key => {
      const def         = CATALOG[key];
      const saved_entry = saved[key] || {};
      const state       = ["default", "active", "disabled"].includes(saved_entry.state)
        ? saved_entry.state
        : "default";

      _state[key] = {
        state,
        // Always present once hasConfig, regardless of state — never
        // stripped on uncheck. Falls back to the catalog default table
        // only when this key has genuinely never been saved before.
        pointsConfig: saved_entry.pointsConfig || clone(EVENT_PLACEMENT_DEFAULTS),
        tieRule:      saved_entry.tieRule || "split",
      };
    });
  }

  // Every key actually shown and editable this session (i.e. not locked)
  // graduates from whatever it was to "active"/"disabled" based on its
  // checkbox, and never reverts to "default" once touched. Locked keys are
  // round-tripped completely unmodified — same "untouched if not
  // editable this session" mechanism module_definePlacementPoints.js uses
  // for a hidden competition type's Pairing category. This is also how a
  // pairingPlacement/teamPlacement category whose state was forced by a
  // server-side mode transition (see ServiceDbEvents) survives a Save
  // made while that category happens to still be locked in this session.
  function collectState() {
    const out = {};
    Object.keys(CATALOG).forEach(key => {
      const s   = _state[key] || {};
      const def = CATALOG[key];

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

  // Locked rows (mode-gated or comingSoon) always render unchecked in the
  // UI regardless of their stored state — see renderKPIRow()'s `checked`
  // computation — so they're excluded here too; otherwise the footer
  // count could read "6 active" while several checkboxes visibly show
  // unchecked and greyed.
  function activeCount() {
    return Object.entries(_state || {})
      .filter(([key, s]) => s.state !== "disabled" && !lockInfo(CATALOG[key]).locked)
      .length;
  }

  function activeLabels() {
    return Object.entries(_state || {})
      .filter(([key, s]) => s.state !== "disabled" && !lockInfo(CATALOG[key]).locked)
      .map(([k]) => CATALOG[k]?.label || k)
      .join(" · ");
  }

  // Segment tags (Individual/Pairing/Team/Flight badges) intentionally not
  // part of the catalog at all — kpi_catalog.php's old "segments" array
  // was display-only and never consumed here; dropped rather than carried
  // forward into CATALOG.

  // ── Points table editor ──────────────────────────────────────────────────────
  // Always rendered in full when a hasConfig row is checked and unlocked —
  // no expand/collapse, no collapsed-state summary. Identical structure
  // for all four placement categories; only the caller (renderKPIRow)
  // decides whether this gets shown at all.

  function renderPointsEditor(kpiKey) {
    const s = _state[kpiKey];
    if (!s) return "";

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
      <div class="dek-editor" id="dek-editor-${esc(kpiKey)}">
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
          ${def.hasConfig && checked && !locked ? renderPointsEditor(kpiKey) : ""}
        </div>
      </div>`;
  }

  // ── Section header ───────────────────────────────────────────────────────────

  const SECTION_LABELS = {
    individual: "Individual",
    event:      "Event",
    special:    "Special competitions",
  };

  function humanizeSection(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  }

  // ── Full content render ──────────────────────────────────────────────────────

  function renderContent() {
    const sections = {};

    // Locked (not editable this session) entries are never hidden — see
    // lockInfo()/renderKPIRow(). Every catalog entry always renders.
    Object.entries(CATALOG)
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

    // Points inputs — points table is always fully rendered when visible
    // (see renderPointsEditor), so a change just writes straight into
    // state; no summary line to keep in sync anymore.
    body.querySelectorAll(".dek-pts-input").forEach(inp => {
      inp.addEventListener("change", () => {
        const key   = inp.dataset.kpi;
        const place = inp.dataset.place;
        if (!_state[key]) return;
        _state[key].pointsConfig[place] = parseInt(inp.value, 10) || 0;
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
        if (_state[key]) _state[key].tieRule = sel.value;
      });
    });
  }

  function toggleKPI(key) {
    if (!_state[key]) return;
    // Checkbox is on for "default" or "active" alike (see renderKPIRow) —
    // toggling off from either lands on "disabled"; toggling on from
    // "disabled" lands on "active", never back to "default". The points
    // table (if hasConfig) now just appears/disappears with the checkbox
    // on the next renderBody() — no separate expand state to manage.
    const wasOn = _state[key].state !== "disabled";
    _state[key].state = wasOn ? "disabled" : "active";
    renderBody();
  }

  function addPlace(key) {
    if (!_state[key]) return;
    const existing = Object.keys(_state[key].pointsConfig);
    const nextPlace = String(existing.length + 1);
    _state[key].pointsConfig[nextPlace] = 0;
    renderBody(); // full re-render to show new row
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
      /* Points editor — always rendered in full when visible, no toggle */
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

    _config = config || {};
    initState(_config);
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

  MA.defineEventKPI = {
    open,
    close,
    // Read-only — for callers like event_maintenance.js that need to
    // resolve a saved kpiConfig key to its display label (e.g. for a
    // hint line) without keeping their own duplicate copy of the catalog.
    catalog: Object.freeze(clone(CATALOG)),
  };

})(window);
