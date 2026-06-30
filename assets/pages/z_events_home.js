/* /assets/pages/events_home.js
 * Events Home
 * - Hydrates from window.__MA_INIT__
 * - Lists events for logged-in admin
 * - Uses /assets/js/ma_shared.js
 * - Card markup, click wiring, and the per-card menu now live in
 *   module_sourceEvents.js (MA.eventsSource); this file keeps state,
 *   filters/mode, and the action dispatcher (handleEventAction).
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

  // Mounts MA.eventsSource once against the #eventCards container.
  // mount() is idempotent — safe to call repeatedly.
  function mountEventsSource() {
    if (!MA.eventsSource || typeof MA.eventsSource.mount !== "function") return;
    MA.eventsSource.mount({
      cardsElId: "eventCards",
      emptyElId: "eventsEmptyState",
      onAction: (action, eid) => handleEventAction({ action, eid })
    });
  }

  function applyInit(payload) {
    const header = payload.header || {};
    const filters = payload.filters || {};

    state.filters.mode = String(filters.mode || "current");

    if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
      MA.chrome.setHeaderLines([
        "EVENT PORTAL",
        header.title || "Event List",
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

    mountEventsSource();
    renderEvents(payload.events || { raw: [], vm: [] });
    setStatus("", "info");
  }

  function renderEvents(eventsPayload) {
    const rows = Array.isArray(eventsPayload.raw) ? eventsPayload.raw : [];
    state.events.raw = rows;

    if (MA.eventsSource && typeof MA.eventsSource.render === "function") {
      MA.eventsSource.render(rows, "eventCards");
    } else {
      console.warn("[events_home] MA.eventsSource module not loaded.");
    }
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
    try {
      const res = await postJson(`${apiBase}/setEventSession.php`, { eid });
      if (!res?.ok) {
        setStatus(res?.message || res?.error || "Unable to open event.", "danger");
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "danger");
      return false;
    }
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
      try {
        const res = await postJson(`${apiBase}/deleteEvent.php`, { eid });
        if (res?.ok) {
          setStatus("Event deleted.", "success");
          await refreshEvents(state.filters.mode);
        } else {
          setStatus(res?.message || "Unable to delete event.", "danger");
        }
      } catch (e) {
        console.error(e);
        setStatus(String(e.message || e), "danger");
      }
      return;
    }

    const ok = await setEventSession(eid);
    if (!ok) return;

    const routeMap = {
      openEvent: "event",
      editEvent: "eventedit",
      eventRoster: "eventroster",
      eventGames: "eventrounds",
      eventScoring: "eventscoring"
    };

    const route = routeMap[action];
    if (route && typeof MA.routerGo === "function") {
      MA.routerGo(route);
    } else {
      setStatus("That event page is not available yet.", "warn");
    }
  }

  // Card markup, click wiring, and the per-card menu (openEventMenu) now live
  // in module_sourceEvents.js, invoked via the onAction callback passed to
  // MA.eventsSource.mount() above, which routes back into handleEventAction().

  applyInit(init);
})();
