/* /assets/pages/events_home.js
 * Events Home
 * - Hydrates from window.__MA_INIT__
 * - Lists events for logged-in admin
 * - Uses /assets/js/ma_shared.js
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const init = window.__MA_INIT__ || window.__INIT__ || {};
  const apiBase = MA.routes?.apiEventsHome || "/api/events_home";

  const state = {
    filters: {
      mode: "current"
    },
    events: {
      raw: []
    }
  };

  function setStatus(message, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(message, level);
    else if (message) console.log("[STATUS]", level || "info", message);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function parseYmd(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).slice(0, 10).split("-").map(n => parseInt(n, 10));
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

  async function postJson(url, payload) {
    if (typeof MA.postJson === "function") return MA.postJson(url, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ payload })
    });
    return res.json();
  }

  function applyInit(payload) {
    const header = payload.header || {};
    const filters = payload.filters || {};

    state.filters.mode = String(filters.mode || "current");

    if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
      MA.chrome.setHeaderLines([
        "ADMIN PORTAL",
        header.title || "Events",
        header.subtitle || ""
      ]);
    }

    if (MA.chrome && typeof MA.chrome.showBrand === "function") {
      MA.chrome.showBrand(true);
    }

    if (MA.chrome && typeof MA.chrome.setActions === "function") {
      MA.chrome.setActions({
        left: { show: false },
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        page: { label: "+ Add New Event", onClick: () => handleEventAction({ action: "addEvent" }) }
      });
    }

    if (MA.chrome && typeof MA.chrome.setBottomNav === "function") {
      MA.chrome.setBottomNav({
        visible: ["home", "admin", "eventhome", "favorites"],
        active: "eventhome",
        onNavigate: id => {
          if (typeof MA.routerGo === "function") MA.routerGo(id);
        }
      });
    }

    renderEvents(payload.events || { raw: [], vm: [] });
    setStatus("", "info");
  }

  function renderEvents(eventsPayload) {
    const cardsEl = document.getElementById("eventCards");
    const emptyEl = document.getElementById("eventsEmptyState");
    if (!cardsEl) return;

    const rows = Array.isArray(eventsPayload.raw) ? eventsPayload.raw : [];
    state.events.raw = rows;

    if (!rows.length) {
      cardsEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    cardsEl.innerHTML = rows.map(r => {
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
    }).join("");
  }

  async function refreshEvents(mode) {
    if (mode) state.filters.mode = mode;
    const res = await postJson(`${apiBase}/queryEvents.php`, {
      mode: state.filters.mode
    });
    if (res?.ok && res?.payload) {
      renderEvents(res.payload.events || res.payload);
      setStatus("", "info");
    } else {
      setStatus(res?.message || "Unable to refresh events.", "danger");
    }
  }

  function openActionsMenu() {
    const items = [
      { label: "My Current Events", action: () => refreshEvents("current") },
      { label: "My Past Events", action: () => refreshEvents("past") },
      { label: "All My Events", action: () => refreshEvents("all") },
      { separator: true },
      { label: "Refresh", action: () => refreshEvents(state.filters.mode) }
    ];

    if (MA.ui && typeof MA.ui.openActionsMenu === "function") {
      MA.ui.openActionsMenu("Actions", items);
    }
  }

  async function setEventSession(eid) {
    const res = await postJson(`${apiBase}/setEventSession.php`, { eid });
    if (!res?.ok) {
      setStatus(res?.message || res?.error || "Unable to open event.", "danger");
      return false;
    }
    return true;
  }

  async function handleEventAction(args) {
    const action = args?.action || "";
    const eid = String(args?.eid || "");

    if (action === "addEvent") {
      // Future route. For now, keep event home stable.
      if (typeof MA.routerGo === "function") {
        MA.routerGo("eventedit", { mode: "add" });
      } else {
        setStatus("Event Maintenance route is not available yet.", "warn");
      }
      return;
    }

    if (!eid) return;

    if (action === "deleteEvent") {
      if (!confirm("Delete this event? This cannot be undone.")) return;
      const res = await postJson(`${apiBase}/deleteEvent.php`, { eid });
      if (res?.ok) {
        setStatus("Event deleted.", "success");
        await refreshEvents(state.filters.mode);
      } else {
        setStatus(res?.message || "Unable to delete event.", "danger");
      }
      return;
    }

    const ok = await setEventSession(eid);
    if (!ok) return;

    const routeMap = {
      openEvent: "event",
      editEvent: "eventedit",
      eventRoster: "eventroster",
      eventGames: "eventgames",
      eventScoring: "eventscoring"
    };

    const route = routeMap[action];
    if (route && typeof MA.routerGo === "function") {
      MA.routerGo(route);
    } else {
      setStatus("That event page is not available yet.", "warn");
    }
  }

  function openEventMenu(eid) {
    const items = [
      { label: "Edit Event", action: () => handleEventAction({ action: "editEvent", eid }) },
      { separator: true },
      { label: "Event Rounds", action: () => handleEventAction({ action: "eventGames", eid }) },
      { label: "Event Roster", action: () => handleEventAction({ action: "eventRoster", eid }) },
      { label: "Event Scoring", action: () => handleEventAction({ action: "eventScoring", eid }) },
      { separator: true },
      { label: "Delete Event", action: () => handleEventAction({ action: "deleteEvent", eid }), danger: true }
    ];

    if (MA.ui && typeof MA.ui.openActionsMenu === "function") {
      MA.ui.openActionsMenu("Event", items);
    }
  }

  document.addEventListener("click", e => {
    const card = e.target.closest(".maEventCard");
    if (card) {
      const eid = card.dataset.eid || "";
      if (eid) openEventMenu(eid);
    }
  });

  applyInit(init);
})();
