/* /assets/modules/module_menuEventSettings.js
 * MA.menuEventSettings — Event Settings menu module.
 * Clone of module_menuGameSettings.js — see that file's header for the
 * full architecture rationale (self-hydration, overlay-not-a-page,
 * sequencing, child module contract). This file follows the identical
 * pattern; only the differences from the Game version are called out
 * below.
 *
 * ── Differences from module_menuGameSettings.js ──────────────────────
 * - Context endpoint: /api/event_settings/initEventSettings.php (shared
 *   with module_setEventPlacementPoints.js — same relationship
 *   initGameSettings.php has to its two Game-side callers).
 * - Four rows, not eight: placementPoints, handicaps, teams, flights.
 *   Only placementPoints is a new module (module_setEventPlacementPoints.js).
 *   handicaps/teams/flights open the SAME modules the Game menu already
 *   uses (module_setHandicapsGameEvent.js, module_defineTeamsGameEvent.js,
 *   module_defineFlightsGameEvent.js) — those modules were already
 *   dual-target; only { target: "event" } is passed instead of "game".
 *   No changes to those three modules or their endpoints.
 * - Event's cascade-mode vocabulary is "fixed"/"none", not Game's
 *   "active"/"disabled" — row summaries read the correct enum for the
 *   field they're on (dbEvents_TeamMode/dbEvents_FlightMode).
 * - No isEvent branch on category labels — Game's version distinguishes
 *   "is this game part of an event" for its own header treatment; that
 *   distinction doesn't apply here, so category labels are static.
 * - Single action name (eventsettings) — Game registers two names
 *   (settings/roundsettings) for legacy reasons; Event doesn't need the
 *   second alias.
 * - Row catalog source: #esMenuRowCatalog (from eventSettingsMenuRows.php),
 *   not #gsMenuRowCatalog.
 *
 * Row catalog markup (includes/eventSettingsMenuRows.php) supplies
 * names/order/icons; this file owns only behavior — per-row summary
 * computation from live event state, and which module opens.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.menuEventSettings = MA.menuEventSettings || {};

  const OVERLAY_ID = "maMenuEventSettingsOverlay";
  const CONTEXT_ENDPOINT = "/api/event_settings/initEventSettings.php";

  // ── Overlay-lock bookkeeping — counted, same pattern as
  // module_menuGameSettings.js's own local fix (see that file's header
  // note on why this is counted rather than a plain toggle).
  let _lockDepth = 0;
  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function handicapSummary(e) {
    const method = e.dbEvents_HCMethod === "SO" ? "Shots-Off" : "CH with Allowance";
    const parts = [method];
    if (e.dbEvents_HCMethod !== "SO" && e.dbEvents_Allowance != null) parts.push(`${e.dbEvents_Allowance}%`);
    return parts.join(" · ");
  }

  // Resolves active-category count via the Placement Points module's own
  // exposed catalog, same pattern event_maintenance.js's old kpiLabel()
  // used — no duplicate copy of the catalog kept here.
  function placementPointsSummary(e) {
    let cfg = e.dbEvents_KPIConfig;
    if (typeof cfg === "string") {
      try { cfg = JSON.parse(cfg); } catch (err) { cfg = null; }
    }
    if (!cfg || typeof cfg !== "object") return "Not configured";
    const active = Object.entries(cfg).filter(([, v]) => v?.state !== "disabled");
    if (!active.length) return "Not configured";
    return `${active.length} active`;
  }

  // ── Row behavior — summary + open, keyed by id. Label/icon/order live
  // in the DOM catalog (includes/eventSettingsMenuRows.php), read at
  // render time. This object only supplies what has to be code.
  const ROW_BEHAVIOR = {
    placementPoints: {
      summary: (e) => placementPointsSummary(e),
      open: (done) => MA.setEventPlacementPoints?.open({ onDone: done }),
    },
    handicaps: {
      summary: (e) => handicapSummary(e),
      open: (done) => MA.setHandicapsGameEvent?.open({ target: "event", onDone: done }),
    },
    teams: {
      summary: (e) => (e.dbEvents_TeamMode === "fixed" ? "Active" : "Off"),
      open: (done) => MA.manageTeams?.open({ target: "event", onDone: done }),
    },
    flights: {
      summary: (e) => (e.dbEvents_FlightMode === "fixed" ? "Active" : "Off"),
      open: (done) => MA.defineFlights?.open({ target: "event", onDone: done }),
    },
  };

  // ── Context fetch ────────────────────────────────────────────────────
  async function _fetchContext() {
    if (typeof MA.postJson !== "function") throw new Error("ma_shared.js not loaded (MA.postJson missing).");
    const res = await MA.postJson(CONTEXT_ENDPOINT, {});
    if (!res || !res.ok) throw new Error(res?.message || "Failed to load event context.");
    return res.payload; // { eid, event }
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  let _ctx = null;
  let _isDirty = false; // set true only when a child module confirms a real save

  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el) _finalClose(); });
      document.body.appendChild(el);
    }
    return el;
  }

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="esMenuTitle">
        <header class="maModal__hdr is-event-context">
          <div class="maModal__title" id="esMenuTitle">Event Settings</div>
          <button type="button" class="iconBtn btnPrimary" id="esMenuBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="esMenuControls"></div>

        <div class="maModal__body">
          <div class="maCard">
            <div class="maCard__body" id="esMenuRows" role="list"></div>
          </div>
        </div>

        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button type="button" class="maFtrBtn maFtrBtn--cancel" id="esMenuBtnFooterClose">Close</button>
          </div>
        </footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("esMenuControls");
    if (!el || !_ctx) return;
    const e = _ctx.event;

    const title = String(e.dbEvents_Title || `EID ${_ctx.eid || ""}`).trim();
    const line1 = [title, `EID ${esc(_ctx.eid ?? "")}`].join(" · ");
    const line2 = [e.dbEvents_StartDate, e.dbEvents_EndDate].filter(Boolean).join(" – ");

    el.innerHTML = `
      <div class="maListRow__col">${esc(line1)}</div>
      ${line2 ? `<div class="maListRow__subline">${esc(line2)}</div>` : ""}`;
  }

  // Static — no isEvent branch needed (see header note).
  const CATEGORY_ORDER = ["setup", "roster"];
  const CATEGORY_LABELS = { setup: "EVENT SETUP", roster: "EVENT ROSTER SETUP" };

  function _renderRows() {
    const container = document.getElementById("esMenuRows");
    const catalog = document.getElementById("esMenuRowCatalog");
    if (!container || !_ctx) return;
    container.innerHTML = "";

    if (!catalog) {
      container.innerHTML = "<!-- includes/eventSettingsMenuRows.php not included on this page -->";
      return;
    }

    const entries = Array.from(catalog.querySelectorAll("[data-setting]"));

    CATEGORY_ORDER.forEach((cat) => {
      const inCategory = entries.filter(e => e.getAttribute("data-category") === cat);
      if (!inCategory.length) return;

      const header = document.createElement("div");
      header.className = "actionMenu_category";
      header.textContent = CATEGORY_LABELS[cat];
      container.appendChild(header);

      inCategory.forEach((entry) => {
        const id = entry.getAttribute("data-setting");
        const label = entry.getAttribute("data-label") || id;
        const iconEl = entry.querySelector("svg, img");
        const iconHtml = iconEl ? iconEl.outerHTML : "";
        const behavior = ROW_BEHAVIOR[id];
        const summaryText = behavior ? behavior.summary(_ctx.event) : "";

        const row = document.createElement("div");
        row.className = "maListRow";
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("data-setting", id);
        row.id = `esMenuRow-${id}`;
        row.innerHTML = `
          <span class="maListRow__avatar" style="border-radius: var(--radiusSq); background: transparent;" aria-hidden="true">${iconHtml}</span>
          <div style="flex:1 1 auto; min-width:0;">
            <div class="maListRow__col">${esc(label)}</div>
            <div class="maListRow__subline">${esc(summaryText)}</div>
          </div>
          <span class="maHubRow__arrow" aria-hidden="true">&rsaquo;</span>`;
        row.addEventListener("click", () => _openRow(id));
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); _openRow(id); }
        });
        container.appendChild(row);
      });
    });
  }

  function _openRow(id) {
    const behavior = ROW_BEHAVIOR[id];
    if (!behavior) return;
    MA.menuEventSettings.close(); // transient teardown only — not a final exit, no dirty check here
    behavior.open((wasSaved) => {
      if (wasSaved === true) _isDirty = true;
      MA.menuEventSettings.open();
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.menuEventSettings.open = async function () {
    MA.ui?.showBusy?.({ title: "Event Settings", message: "Loading..." });
    let ctx;
    try {
      ctx = await _fetchContext();
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load event context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();
    _ctx = ctx;

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    document.getElementById("esMenuBtnClose")?.addEventListener("click", _finalClose);
    document.getElementById("esMenuBtnFooterClose")?.addEventListener("click", _finalClose);
    _renderControls();
    _renderRows();
  };

  MA.menuEventSettings.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _lockScroll(false);
  };

  // The actual "user is leaving the whole menu" exit — X, footer Close,
  // and backdrop click all route here, not to close() directly. Same
  // dirty-triggers-reload contract as module_menuGameSettings.js's
  // _finalClose() — see that file's header for the reasoning.
  function _finalClose() {
    const wasDirty = _isDirty;
    _isDirty = false;
    MA.menuEventSettings.close();
    if (wasDirty) {
      window.location.reload();
    }
  }

  // The only place in the codebase that maps this action name to this
  // module — ma_shared.js's routerGo() just sees "something is
  // registered," it never mentions Event Settings by name.
  MA.moduleActions = MA.moduleActions || {};
  MA.moduleActions.eventsettings = () => MA.menuEventSettings.open();

})();
