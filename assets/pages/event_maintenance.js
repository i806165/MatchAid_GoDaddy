/* /assets/pages/event_maintenance.js
   Event Maintenance page controller.

   Event Competition (KPI/Placement Points), Handicaps, Teams, and
   Flights are no longer staged or saved from this file — they moved to
   module_menuEventSettings.js, opened from the nav bar, each saving
   itself independently the moment its own Apply/Save fires. This page
   now owns only Title/Type/Facility/Description/Schedule, bundled into
   one Save via collectPatch()/doSave(), same as before.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const routes = MA.routes || {};
  const emApiBase = routes.apiEventMaint || MA.paths?.apiEventMaint || "/api/event_maintenance";

  function apiCall(base, endpointFile, payloadObj) {
    const baseClean = String(base || "").replace(/\/$/, "");
    const fileClean = String(endpointFile || "").replace(/^\//, "");
    const url = `${baseClean}/${fileClean}`;
    return postJson(url, { payload: payloadObj || {} });
  }

  const apiEM = (file, payload) => apiCall(emApiBase, file, payload);

  function setStatus(msg, level) {
    if (MA.ui && typeof MA.ui.notify === "function") MA.ui.notify(msg, level);
    else if (typeof MA.setStatus === "function") MA.setStatus(msg, level);
    else {
      const elLine = document.getElementById("chromeStatusLine");
      if (!elLine) return;
      elLine.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
      elLine.textContent = msg || "";
    }
  }

  const el = {
    eidLabel: document.getElementById("emEidLabel"),
    title: document.getElementById("emTitle"),
    eventType: document.getElementById("emEventType"),
    facilityName: document.getElementById("emFacilityName"),
    description: document.getElementById("emDescription"),
    startDate: document.getElementById("emStartDate"),
    endDate: document.getElementById("emEndDate"),
    scheduleHint: document.getElementById("emScheduleHint"),
  };

  const init = window.__MA_INIT__ || window.__INIT__ || {};

  const state = {
    mode: String(init.mode || "edit"),
    eid: init.eid || null,
    event: init.event || {},
    dirty: false,
    busy: false
  };

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) setStatus("Unsaved changes.", "warn");
    else setStatus("", "info");
    applyChrome();
  }

  function setBusy(on) {
    state.busy = !!on;
    if (typeof MA.chrome?.setFooterSaveDisabled === "function") {
      MA.chrome.setFooterSaveDisabled(!!on);
    }
  }

  function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Local-date-safe helpers. new Date("YYYY-MM-DD") parses as UTC midnight,
  // which can silently shift a day once local getters (getDate(), etc.) are
  // applied, depending on the browser's timezone offset. new Date(y, m-1, d)
  // with numeric arguments always constructs in local time — that's the only
  // safe path used here.
  function parseLocalDateParts(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    if (!m) return null;
    return { y: parseInt(m[1], 10), mo: parseInt(m[2], 10), d: parseInt(m[3], 10) };
  }

  function addLocalDays(dateStr, days) {
    const p = parseLocalDateParts(dateStr);
    if (!p) return dateStr;
    const dt = new Date(p.y, p.mo - 1, p.d); // local, not UTC
    dt.setDate(dt.getDate() + days);
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
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

  function parseJsonMaybe(s, fallback) {
    if (!s) return fallback;
    try {
      const v = JSON.parse(String(s));
      return v && typeof v === "object" ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function renderScheduleHint() {
    const s = el.startDate.value || "";
    const e = el.endDate.value || "";

    // Native picker enforcement — keep in sync whenever start changes,
    // not just at load time.
    if (s) el.endDate.min = addLocalDays(s, 1);

    if (!s || !e) {
      el.scheduleHint.textContent = "Choose the event start and end dates.";
      return;
    }
    if (e <= s) {
      el.scheduleHint.textContent = "End date must be after start date.";
      return;
    }
    el.scheduleHint.textContent = "Multi-day event.";
  }

  function applyEventToDom() {
    const ev = state.event || {};

    if (el.eidLabel) el.eidLabel.textContent = state.eid ? ` ${state.eid}` : "";
    el.title.value        = ev.dbEvents_Title       || "";
    el.eventType.value    = ev.dbEvents_EventType   || "Tournament";
    el.facilityName.value = ev.dbEvents_FacilityName|| "";
    el.description.value  = ev.dbEvents_Description || "";
    el.startDate.value    = String(ev.dbEvents_StartDate || ev.startDateISO || todayYmd()).slice(0, 10);
    el.endDate.value      = String(ev.dbEvents_EndDate   || ev.endDateISO   || el.startDate.value || todayYmd()).slice(0, 10);

    renderScheduleHint();
  }

  function collectPatch() {
    return {
      dbEvents_Title:              el.title.value.trim(),
      dbEvents_EventType:          el.eventType.value,
      dbEvents_StartDate:          el.startDate.value,
      dbEvents_EndDate:            el.endDate.value,
      dbEvents_Description:        el.description.value.trim(),
      dbEvents_FacilityName:       el.facilityName.value.trim(),
    };
  }

  function validatePatch(patch) {
    if (!patch.dbEvents_Title) return "Please enter an event title.";
    if (!patch.dbEvents_StartDate) return "Please select a start date.";
    if (!patch.dbEvents_EndDate) return "Please select an end date.";
    if (patch.dbEvents_EndDate <= patch.dbEvents_StartDate) return "End date must be after start date.";
    return "";
  }

  async function doSave() {
    const patch = collectPatch();
    const msg = validatePatch(patch);
    if (msg) {
      setStatus(msg, "warn");
      return;
    }

    setBusy(true);
    try {
      const res = await apiEM("saveEvent.php", {
        mode: state.mode,
        patch
      });

      if (!res || !res.ok) {
        throw new Error(res?.error || res?.message || "Save failed.");
      }

      state.mode = res.mode || "edit";
      state.eid = res.eid || state.eid;
      state.event = res.event || state.event;

      applyEventToDom();
      setDirty(false);
      setStatus("Event saved.", "success");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteEvent() {
    if (!state.eid) return;
    const approved = await MA.ui.confirm({
      title: "Delete event?",
      message: "This event will be permanently deleted. This can't be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true
    });
    if (!approved) return;

    setBusy(true);
    try {
      const res = await apiEM("deleteEvent.php", { eid: state.eid });
      if (!res || !res.ok) throw new Error(res?.message || res?.error || "Delete failed.");

      setStatus("Event deleted.", "success");
      if (typeof MA.routerGo === "function") MA.routerGo("eventhome");
      else window.location.assign((MA.paths?.routerApi || "/api/session/pageRouter.php") + "?action=eventhome&redirect=1");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "danger");
      setBusy(false);
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "Delete Event", action: onDeleteEvent, danger: true }
    ]);
  }

  async function onBack() {
    if (state.dirty) {
      const ok = await MA.ui.confirm({
        title: "Discard changes?",
        message: "You have unsaved changes. Discard them and go back?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true
      });
      if (!ok) return;
    }
    if (typeof MA.routerGo === "function") {
      MA.routerGo("eventhome");
      return;
    }
    const router = MA.paths?.routerApi || "/api/session/pageRouter.php";
    window.location.assign(router + "?action=eventhome&redirect=1");
  }

  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      const modeText = (state.mode === "add") ? "Add Event" : "Edit Event";
      chrome.setHeaderLines(["Event Maintenance", modeText, ""]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      const isTransactional = (state.mode === "add" || state.dirty);

      chrome.setActions({
        left: { show: false },
        right: isTransactional
          ? { show: false }
          : { show: true, label: "Actions", onClick: openActionsMenu },
        footer: isTransactional
          ? {
              save: { label: "Save", onClick: () => doSave() },
              cancel: { label: "Cancel", onClick: onBack }
            }
          : null
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["eventhome", "eventedit", "eventroster", "eventrounds", "eventscorecard", "eventskins", "eventsummary"],
        active: "eventedit",
        root: ["eventhome"],
        disabled: (state.mode === "add") ? ["eventroster", "eventrounds", "eventscorecard", "eventskins", "eventsummary"] : [],
        onNavigate: id => MA.routerGo(id)
      });
    }
  }

  function wireDom() {
    // Field change listeners — re-render hints and mark dirty
    [
      el.title,
      el.eventType,
      el.facilityName,
      el.description,
      el.startDate,
      el.endDate
    ].forEach(node => {
      if (!node) return;
      node.addEventListener("input", () => {
        renderScheduleHint();
        setDirty(true);
      });
      node.addEventListener("change", () => {
        renderScheduleHint();
        setDirty(true);
      });
    });

    // Auto-bump end date whenever start date changes and the current end
    // date would no longer be strictly after it — e.g. user picks a new,
    // later start date than the existing end date. Only fires on "change"
    // (date selection committed), not "input", so it doesn't fight a user
    // mid-interaction with the picker.
    if (el.startDate) {
      el.startDate.addEventListener("change", () => {
        const s = el.startDate.value || "";
        if (!s) return;
        if (!el.endDate.value || el.endDate.value <= s) {
          el.endDate.value = addLocalDays(s, 1);
          renderScheduleHint();
          setDirty(true);
        }
      });
    }
  }

  wireDom();
  applyEventToDom();
  applyChrome();
  setStatus("", "info");
})();
