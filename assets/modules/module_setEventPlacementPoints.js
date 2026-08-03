/* /assets/modules/module_setEventPlacementPoints.js
 * MA.setEventPlacementPoints — Event Competition / Placement Points
 * editor module. Replaces module_defineEventKPI.js.
 *
 * ── Rendering cloned verbatim from module_defineEventKPI.js ─────────────
 * CATALOG, lockInfo(), initState(), collectState(), kpiSummary(),
 * renderPointsEditor(), renderKPIRow(), renderContent(), wireBodyEvents(),
 * toggleKPI()/toggleEditor()/addPlace(), and injectStyles() (the .dek-*
 * interior stylesheet) are UNCHANGED — same classes, same markup, same
 * business rules. Same precedent module_setGamePlacementPoints.js set for
 * its own .dpp-* interior: clone the rendering as-is; aligning it further
 * is a separate, later effort, not part of this pass.
 *
 * dbEvents_KPIConfig shape is unchanged from module_defineEventKPI.js —
 * see that file's original header for the full field-by-field contract.
 * Flat map, no top-level wrapper, six fixed keys (grossPlacement,
 * netPlacement, pairingPlacement, teamPlacement, RINGER, HOLE_CHAMPIONS).
 * This vocabulary must match ServiceBuildEventSummary::parseEventKPIConfig()
 * verbatim — untouched by this rewrite.
 *
 * ── What changed — plumbing only, not rendering ──────────────────────────
 * Same structural contract every other module in this family follows
 * (see module_setGamePlacementPoints.js's header for the parallel list):
 *   - Self-hydration: open({ onDone }) only. No kpiConfig/pairingFixed/
 *     teamFixed passed in by a caller — all three are derived from this
 *     module's own fetched context (initEventSettings.php), the same
 *     endpoint module_menuEventSettings.js uses. pairingFixed/teamFixed
 *     are now dbEvents_PairingMode/dbEvents_TeamMode === "fixed", read
 *     directly off the fetched event record instead of being handed in.
 *   - Direct save: doApply() used to call _config.onApply(json) and let
 *     the caller (event_maintenance.js) decide what to do with it. It now
 *     posts straight to its own save endpoint
 *     (/api/event_settings/saveEventPlacementPoints.php).
 *   - Exit-path signal: close() previously fired nothing — Cancel/
 *     backdrop/X all discarded silently. It now fires onDone(wasSaved)
 *     unconditionally, on every exit path, matching the contract the
 *     menu needs to reopen correctly (see module_menuEventSettings.js's
 *     _openRow()).
 *   - The .maModal__controls context block (event title/EID, schedule)
 *     that the original header flagged as blocked on caller-side data:
 *     added now, using this module's own freshly-hydrated event record —
 *     no caller change needed, since there's no caller anymore.
 *   - MA.ui.showModalNotice() for save errors: added, matching every
 *     other module (MA.setStatus() would be invisible behind an open
 *     modal).
 *   - Counted scroll-lock: unchanged in behavior, already present.
 *   - _busy flag: added, to block double-submit during save.
 *
 * Public API:
 *   MA.setEventPlacementPoints.open({ onDone })
 *   MA.setEventPlacementPoints.close()
 *   MA.setEventPlacementPoints.catalog — read-only, same purpose as
 *     module_defineEventKPI.js's export (resolving a key to its label).
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};
  MA.setEventPlacementPoints = MA.setEventPlacementPoints || {};

  const OVERLAY_ID       = "seppOverlay";
  const NOTICE_ID        = "seppNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/event_settings/initEventSettings.php";
  const SAVE_ENDPOINT    = "/api/event_settings/saveEventPlacementPoints.php";

  // ── Helpers — cloned verbatim ────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // Independent copy — same name/value as the constants of the same
  // purpose in ServiceDbEvents and
  // ServiceBuildEventSummary::EVENT_PLACEMENT_DEFAULTS, kept in sync by
  // convention (grep EVENT_PLACEMENT_DEFAULTS to find all three), not by
  // any shared payload. This copy's only job is seeding a fresh, never-
  // saved checkbox's form state below.
  const EVENT_PLACEMENT_DEFAULTS = { "1": 100, "2": 75, "3": 50 };

  // ── Catalog — unchanged ──────────────────────────────────────────────
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

  // ── Module state ─────────────────────────────────────────────────────
  let _overlay = null;
  let _ctx     = null; // fresh-fetched { eid, event }
  let _state   = null; // { kpiKey: { state, pointsConfig, tieRule, expanded } }
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

  // ── Locking — unchanged logic, now reads _ctx.event instead of a
  // caller-supplied config object ──────────────────────────────────────
  function lockInfo(def) {
    if (def.comingSoon) {
      return { locked: true, reason: "Coming soon — not yet available." };
    }
    if (def.lockedUnless === "pairingFixed") {
      return _pairingFixed()
        ? { locked: false }
        : { locked: true, reason: "Event-level pairings not enabled for this event." };
    }
    if (def.lockedUnless === "teamFixed") {
      return _teamFixed()
        ? { locked: false }
        : { locked: true, reason: "Event-level teams not enabled for this event." };
    }
    return { locked: false };
  }

  function _pairingFixed() { return String(_ctx?.event?.dbEvents_PairingMode || "") === "fixed"; }
  function _teamFixed()    { return String(_ctx?.event?.dbEvents_TeamMode    || "") === "fixed"; }

  // ── State — unchanged logic, kpiConfig now parsed from _ctx.event ────
  function _parseKpiConfig(event) {
    const raw = event?.dbEvents_KPIConfig;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try { return JSON.parse(String(raw)); } catch (e) { return null; }
  }

  function initState() {
    const saved = _parseKpiConfig(_ctx.event) || {};
    _state = {};

    Object.keys(CATALOG).forEach(key => {
      const def         = CATALOG[key];
      const saved_entry = saved[key] || {};
      const state       = ["default", "active", "disabled"].includes(saved_entry.state)
        ? saved_entry.state
        : "default";

      _state[key] = {
        state,
        pointsConfig: saved_entry.pointsConfig || clone(EVENT_PLACEMENT_DEFAULTS),
        tieRule:      saved_entry.tieRule || "split",
        expanded:     state !== "disabled" && !!def.hasConfig,
      };
    });
  }

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

  // ── Points table editor — unchanged ───────────────────────────────────
  function kpiSummary(kpiKey) {
    const s = _state[kpiKey];
    if (!s) return "";
    const places = Object.keys(s.pointsConfig || {}).length;
    const vals   = Object.values(s.pointsConfig || {}).join(", ");
    const tie    = s.tieRule === "split" ? "Split ties" : s.tieRule === "high" ? "High ties" : "Low ties";
    return `${places} place${places !== 1 ? "s" : ""} · ${vals} pts · ${tie}`;
  }

  function renderPointsEditor(kpiKey) {
    const s = _state[kpiKey];
    if (!s) return "";
    const expanded = s.expanded;

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
        <span class="dek-toggle-label">${expanded ? "Hide points table" : "Unhide points table"}</span>
        <i class="ti ti-chevron-down dek-chevron" aria-hidden="true"></i>
      </button>

      ${expanded ? `
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
          <span class="dek-tie-label">Tie Rule</span>
          <select class="dek-tie-select" data-tie-kpi="${esc(kpiKey)}">
            <option value="split" ${s.tieRule === "split" ? "selected" : ""}>Split — average the tied positions' points</option>
            <option value="high"  ${s.tieRule === "high"  ? "selected" : ""}>High — all tied players receive the higher points</option>
            <option value="low"   ${s.tieRule === "low"   ? "selected" : ""}>Low — all tied players receive the lower points</option>
          </select>
        </div>
      </div>` : `
      <div class="dek-summary"><i class="ti ti-check" aria-hidden="true"></i>${esc(kpiSummary(kpiKey))}</div>`}`;
  }

  function renderKPIRow(kpiKey, def) {
    const s = _state[kpiKey] || { state: "default" };
    const { locked, reason } = lockInfo(def);
    const checked = !locked && s.state !== "disabled";

    return `
      <div class="dek-kpi-row ${locked ? "is-locked" : ""}" data-kpi-key="${esc(kpiKey)}">
        <div class="maCheckbox ${checked ? "is-checked" : ""} ${locked ? "is-locked" : ""}"
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

  const SECTION_LABELS = {
    individual: "Individual",
    event:      "Event",
    special:    "Special competitions",
  };

  function humanizeSection(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  }

  function renderContent() {
    const sections = {};

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

  function renderBody() {
    const body = _overlay?.querySelector("#seppBody");
    if (!body) return;
    body.innerHTML = renderContent();
    wireBodyEvents(body);
  }

  function wireBodyEvents(body) {
    body.querySelectorAll("[data-check]:not([data-check=''])").forEach(el => {
      el.addEventListener("click",   () => toggleKPI(el.dataset.check));
      el.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleKPI(el.dataset.check); } });
    });

    body.querySelectorAll("[data-toggle-kpi]").forEach(btn => {
      btn.addEventListener("click", () => toggleEditor(btn.dataset.toggleKpi));
    });

    body.querySelectorAll(".dek-pts-input").forEach(inp => {
      inp.addEventListener("change", () => {
        const key   = inp.dataset.kpi;
        const place = inp.dataset.place;
        if (!_state[key]) return;
        _state[key].pointsConfig[place] = parseInt(inp.value, 10) || 0;
      });
    });

    body.querySelectorAll("[data-add-place]").forEach(btn => {
      btn.addEventListener("click", () => addPlace(btn.dataset.addPlace));
    });

    body.querySelectorAll(".dek-tie-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.tieKpi;
        if (_state[key]) _state[key].tieRule = sel.value;
      });
    });
  }

  function toggleKPI(key) {
    if (!_state[key]) return;
    const wasOn = _state[key].state !== "disabled";
    _state[key].state = wasOn ? "disabled" : "active";
    if (!wasOn && CATALOG[key]?.hasConfig) _state[key].expanded = true;
    renderBody();
  }

  function toggleEditor(key) {
    if (!_state[key]) return;
    _state[key].expanded = !_state[key].expanded;
    renderBody();
  }

  function addPlace(key) {
    if (!_state[key]) return;
    const existing = Object.keys(_state[key].pointsConfig);
    const nextPlace = String(existing.length + 1);
    _state[key].pointsConfig[nextPlace] = 0;
    renderBody();
  }

  // ── Styles — interior classes UNCHANGED (.dek-* preserved verbatim,
  // same precedent as module_setGamePlacementPoints.js keeping .dpp-*) ──
  function injectStyles() {
    if (document.getElementById("dekStyles")) return;
    const s = document.createElement("style");
    s.id = "dekStyles";
    s.textContent = `
      #${OVERLAY_ID} .maModal{ max-width:min(640px,calc(100vw - 16px)); font-family:var(--fontFamilyBase); }
      .dek-section-hdr{font-size:11px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:var(--mutedText);padding:14px 16px 4px;}
      .dek-kpi-row{display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-kpi-row:last-child{border-bottom:none;}
      .dek-kpi-row.is-locked{opacity:.55;}
      .maCheckbox.is-locked{cursor:default;opacity:.7;}
      .dek-kpi-body{flex:1;min-width:0;}
      .dek-kpi-label{font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px;}
      .dek-kpi-label .ti-lock{font-size:13px;color:var(--mutedText);}
      .dek-kpi-desc{font-size:12px;color:var(--mutedText);margin-top:2px;line-height:1.4;}
      .dek-config-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:7px;font-size:11px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:0;font-family:inherit;}
      .dek-config-toggle .dek-chevron{font-size:11px;transition:transform .15s;}
      .dek-config-toggle.open .dek-chevron{transform:rotate(180deg);}
      .dek-summary{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;font-style:italic;color:var(--mutedText);}
      .dek-summary i{color:var(--brandSecondary);}
      .dek-editor{margin-top:10px;background:var(--surfaceChrome);border:0.5px solid var(--borderSubtle);border-radius:var(--radiusMd,6px);padding:12px;}
      .dek-editor-title{font-size:11px;font-weight:500;color:var(--mutedText);margin-bottom:8px;}
      .dek-pts-table{width:100%;border-collapse:collapse;font-size:13px;}
      .dek-pts-table th{text-align:left;color:var(--mutedText);font-weight:500;padding:6px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-pts-table td{padding:6px 8px;border-bottom:0.5px solid var(--borderSubtle);}
      .dek-pts-table tr:last-child td{border-bottom:none;}
      .dek-pts-input{width:72px;border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:4px 8px;font-size:13px;text-align:right;background:var(--surface);color:var(--ink);}
      .dek-add-btn{font-size:11px;color:var(--brandAccent);background:transparent;border:none;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:3px;margin-top:6px;font-family:inherit;}
      .dek-tie-row{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--borderSubtle);}
      .dek-tie-label{font-size:11px;font-weight:500;color:var(--mutedText);white-space:nowrap;}
      .dek-tie-select{border:0.5px solid var(--borderStrong,#bbb);border-radius:var(--radiusSq,4px);padding:3px 8px;font-size:12px;background:var(--surface);color:var(--ink);flex:1;}
    `;
    document.head.appendChild(s);
  }

  // ── Context block — new, using this module's own hydrated event ──────
  function _renderControls() {
    const el = document.getElementById("seppControls");
    if (!el || !_ctx) return;
    const e = _ctx.event || {};

    const title = String(e.dbEvents_Title || `EID ${_ctx.eid || ""}`).trim();
    const line1 = [title, `EID ${esc(_ctx.eid ?? "")}`].join(" · ");
    const line2 = [e.dbEvents_StartDate, e.dbEvents_EndDate].filter(Boolean).join(" – ");

    el.innerHTML = `
      <div class="maListRow__col">${esc(line1)}</div>
      ${line2 ? `<div class="maListRow__subline">${esc(line2)}</div>` : ""}`;
  }

  // ── Build overlay ────────────────────────────────────────────────────
  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id        = OVERLAY_ID;
    overlay.className = "maModalOverlay is-open";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Event Competition">

        <div class="maModal__hdr is-event-context">
          <div class="maModal__titles">
            <div class="maModal__title">Event Competition</div>
            <div class="maModal__subtitle">Select which competitions are active for this event</div>
          </div>
          <button id="seppBtnClose" class="iconBtn btnSecondary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="maModal__controls" id="seppControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body maModal__body--flush" id="seppBody"></div>

        <div class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button id="seppBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
            <button id="seppBtnApply"  class="maFtrBtn maFtrBtn--save"   type="button">Save</button>
          </div>
        </div>

      </div>`;

    overlay.querySelector("#seppBtnClose")?.addEventListener("click",  () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#seppBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#seppBtnApply")?.addEventListener("click",  doApply);
    overlay.addEventListener("click", e => { if (e.target === overlay && !_busy) _dismiss(); });

    return overlay;
  }

  function _dismiss(wasSaved) {
    if (_busy) return;
    MA.setEventPlacementPoints.close();
    if (typeof _onDone === "function") _onDone(wasSaved);
  }

  // ── Apply — saves directly instead of calling a caller callback ──────
  async function doApply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Event Competition", message: "Saving — please wait..." });
    try {
      const result = collectState();
      const payload = { dbEvents_KPIConfig: result };
      const res = await MA.postJson(SAVE_ENDPOINT, { payload });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Event Competition.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss(true);
      return;
    } catch (e) {
      console.error("[MA.setEventPlacementPoints]", e);
      _showModalNotice("Error saving Event Competition.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setEventPlacementPoints.open = async function (options) {
    if (_overlay) MA.setEventPlacementPoints.close();
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Event Competition", message: "Loading..." });
    let ctx;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINT, {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load event context.");
      ctx = res.payload;
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load event context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();

    _ctx = ctx;
    initState();
    injectStyles();

    _overlay = buildOverlay();
    document.body.appendChild(_overlay);
    _lockScroll(true);

    _renderControls();
    renderBody();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setEventPlacementPoints.close = function () {
    if (_overlay) { _overlay.remove(); _overlay = null; }
    _ctx   = null;
    _state = null;
    _lockScroll(false);
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

  // Read-only — for callers (e.g. a future menu row summary) that need
  // to resolve a saved kpiConfig key to its display label without
  // keeping their own duplicate copy of the catalog.
  MA.setEventPlacementPoints.catalog = Object.freeze(clone(CATALOG));

})(window);
