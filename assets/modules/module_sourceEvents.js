/* /assets/modules/module_sourceEvents.js
 * MA.eventsSource — shared "events list" rendering module.
 *
 * Mirrors module_sourceGames.js's pattern: owns card markup, date-range
 * formatting, card-tap click wiring, and the per-card actions menu.
 * Does NOT own data fetching, filters/mode, or the action handlers
 * themselves — those stay host-side (host passes an onAction callback).
 *
 * Usage:
 *   MA.eventsSource.mount({
 *     cardsElId: "eventCards",
 *     emptyElId: "eventsEmptyState",
 *     onAction: (action, eid) => handleEventAction({ action, eid })
 *   });
 *
 *   MA.eventsSource.render(eventRows);   // call whenever new event rows arrive
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  // Sticky per-container mount state, same WeakMap-anchor pattern as
  // module_sourceGames.js — keeps mount() idempotent across re-renders.
  const mounts = new WeakMap();

  // ---- local helpers (self-contained; do not depend on host globals) ----
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function parseYmd(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).slice(0, 10).split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function formatDate(ymd) {
    const d = parseYmd(ymd);
    if (!d) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateRange(start, end) {
    const s = formatDate(start);
    const e = formatDate(end);
    if (!s && !e) return "";
    if (s && e && s !== e) return `${s} – ${e}`;
    return s || e;
  }

  function cardHtml(r) {
    const eid = String(r.dbEvents_EID ?? "").trim();
    const title = String(r.dbEvents_Title || "").trim() || "Untitled Event";
    const adminName = String(r.dbEvents_AdminName || r.dbEvents_AdminGHIN || "").trim();
    const facility = String(r.dbEvents_FacilityName || "").trim();
    const eventType = String(r.dbEvents_EventType || "").trim();
    const scoringMethod = String(r.dbEvents_ScoringMethod || "").trim();
    const rosterCount = Number(r.rosterCount ?? 0);
    const gameCount = Number(r.gameCount ?? 0);
    const range = formatDateRange(r.dbEvents_StartDate, r.dbEvents_EndDate);

    const line1 = [range, eventType].filter(Boolean).join(" • ");
    const line2 = facility || "Facility not set";
    const line3 = [`Roster ${rosterCount}`, `Games ${gameCount}`, scoringMethod ? `Scoring: ${scoringMethod}` : "Scoring: Not configured"].join(" • ");

    return `
      <div class="maCard maEventCard" data-eid="${esc(eid)}">
        <div class="maCard__hdr">
          <div class="maCard__title">
            <span class="maCard__titleText">${esc(title)}</span>
            <span class="maCard__titleGgid">${esc(eid)}</span>
          </div>
          <div class="maEventCard__hdrAdmin">${esc(adminName)}</div>
        </div>
        <div class="maCard__body maEventCard__body">
          <div class="maEventCard__meta">
            <div class="maEventCard__line maEventCard__line1">${esc(line1)}</div>
            <div class="maEventCard__line maEventCard__line2">${esc(line2)}</div>
            <div class="maEventCard__line maEventCard__line3">${esc(line3)}</div>
          </div>
        </div>
      </div>`;
  }

  function buildEventMenu(ctx, eid) {
    if (!MA.ui || typeof MA.ui.openActionsMenu !== "function") {
      console.warn("[module_sourceEvents] MA.ui.openActionsMenu not found.");
      return;
    }

    const fire = (action) => ctx.onAction(action, eid);

    const items = [
      { label: "Edit Event", action: () => fire("editEvent") },
      { separator: true },
      { label: "Event Rounds",  action: () => fire("eventGames") },
      { label: "Event Roster",  action: () => fire("eventRoster") },
      { label: "Event Scoring", action: () => fire("eventScoring") },
      { separator: true },
      { label: "Delete Event", action: () => fire("deleteEvent"), danger: true }
    ];

    MA.ui.openActionsMenu("Event", items);
  }

  function render(ctx, rows) {
    const cardsEl = document.getElementById(ctx.cardsElId);
    const emptyEl = ctx.emptyElId ? document.getElementById(ctx.emptyElId) : null;
    if (!cardsEl) return;

    const dbRows = Array.isArray(rows) ? rows : [];
    ctx.rows = dbRows;

    if (!dbRows.length) {
      cardsEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    cardsEl.innerHTML = dbRows.map(cardHtml).join("");

    // Card tap opens the event menu (single click target — no separate
    // MANAGE button in the original events list markup).
    cardsEl.querySelectorAll(".maEventCard").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button,a,input,label")) return;
        const eid = card.getAttribute("data-eid");
        if (!eid) return;
        buildEventMenu(ctx, eid);
      });
    });
  }

  const api = {
    /**
     * mount(config) — idempotent; safe to call on every render cycle.
     * config:
     *   cardsElId  {string}  required — id of the container the cards render into
     *   emptyElId  {string}  optional — id of the "no events" empty-state element
     *   onAction   {function(action, eid)} required — host-side action dispatcher
     *              (host owns setEventSession, routerGo, postJson/deleteEvent, etc.)
     */
    mount(config) {
      const cardsEl = document.getElementById(config.cardsElId);
      if (!cardsEl) {
        console.warn("[module_sourceEvents] mount: cardsElId not found:", config.cardsElId);
        return null;
      }

      let ctx = mounts.get(cardsEl);
      if (!ctx) {
        ctx = { rows: [] };
        mounts.set(cardsEl, ctx);
      }

      ctx.cardsElId = config.cardsElId;
      ctx.emptyElId = config.emptyElId || null;
      ctx.onAction = typeof config.onAction === "function" ? config.onAction : () => {};

      mounts.set(cardsEl, ctx);
      return ctx;
    },

    render(rows, cardsElId) {
      const id = cardsElId || api._lastMountedId;
      const cardsEl = id ? document.getElementById(id) : null;
      const ctx = cardsEl ? mounts.get(cardsEl) : null;
      if (!ctx) {
        console.warn("[module_sourceEvents] render called before mount().");
        return;
      }
      render(ctx, rows);
    },

    openEventMenu(eid, cardsElId) {
      const id = cardsElId || api._lastMountedId;
      const cardsEl = id ? document.getElementById(id) : null;
      const ctx = cardsEl ? mounts.get(cardsEl) : null;
      if (!ctx) return;
      buildEventMenu(ctx, eid);
    },

    _internals: { esc, parseYmd, formatDate, formatDateRange }
  };

  const _mount = api.mount;
  api._lastMountedId = null;
  api.mount = function (config) {
    const ctx = _mount(config);
    if (ctx) api._lastMountedId = config.cardsElId;
    return ctx;
  };

  MA.eventsSource = api;
})(window);
