/* /assets/pages/event_maintenance.js
   Event Maintenance page controller.
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

  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : (msg, level) => {
        const el = document.getElementById("chromeStatusLine");
        if (!el) return;
        el.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
        el.textContent = msg || "";
      };

  const el = {
    eidLabel: document.getElementById("emEidLabel"),
    title: document.getElementById("emTitle"),
    eventType: document.getElementById("emEventType"),
    facilityName: document.getElementById("emFacilityName"),
    description: document.getElementById("emDescription"),
    startDate: document.getElementById("emStartDate"),
    endDate: document.getElementById("emEndDate"),
    scheduleHint: document.getElementById("emScheduleHint"),
    scoringMethod: document.getElementById("emScoringMethod"),
    tiebreakMethod: document.getElementById("emTiebreakMethod"),
    scoringPreview: document.getElementById("emScoringPreview"),
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

  function defaultScoringConfig(method) {
    switch (method) {
      case "AggregatePoints":
        return {
          basis: "points",
          roundsToCount: "all",
          dropWorst: 0
        };
      case "PlacementPoints":
        return {
          pointsByPlace: { "1": 100, "2": 75, "3": 60, "4": 50, "5": 40 },
          participationPoints: 10,
          ties: "split"
        };
      case "MatchPoints":
        return {
          win: 1,
          tie: 0.5,
          loss: 0,
          segments: { front: 1, back: 1, overall: 1 }
        };
      case "ManualPoints":
        return {
          entry: "manual"
        };
      default:
        return {};
    }
  }

  function defaultTiebreakConfig(method) {
    switch (method) {
      case "TotalEventPoints":
        return { tieBreakers: ["bestFinalRound", "mostRoundsPlayed", "bestSingleRound"] };
      case "TeamPoints":
        return { tieBreakers: ["overallMatchesWon", "headToHead", "totalHolesWon"] };
      case "BestFinalRound":
        return { tieBreakers: ["bestFinalRound"] };
      case "MostRoundsPlayed":
        return { tieBreakers: ["mostRoundsPlayed"] };
      case "ManualReview":
        return { tieBreakers: ["manualReview"] };
      default:
        return {};
    }
  }

  function renderScoringPreview() {
    const method = el.scoringMethod.value || "";
    const tb = el.tiebreakMethod.value || "";

    let msg = "Event scoring has not been configured.";
    if (method === "AggregatePoints") msg = "Event standings will sum each participant's points across linked games.";
    if (method === "PlacementPoints") msg = "Each linked game will award event points by finishing position.";
    if (method === "MatchPoints") msg = "Event standings will use match outcomes from linked games.";
    if (method === "ManualPoints") msg = "Event points will be entered or adjusted manually.";

    if (tb) msg += ` Tiebreak: ${tb}.`;

    if (el.scoringPreview) el.scoringPreview.textContent = msg;
  }

  function renderScheduleHint() {
    const s = el.startDate.value || "";
    const e = el.endDate.value || "";
    if (!s || !e) {
      el.scheduleHint.textContent = "Choose the event start and end dates.";
      return;
    }
    if (e < s) {
      el.scheduleHint.textContent = "End date is before start date.";
      return;
    }
    el.scheduleHint.textContent = (s === e) ? "Single-day event." : "Multi-day event.";
  }

  function applyEventToDom() {
    const ev = state.event || {};

    if (el.eidLabel) el.eidLabel.textContent = state.eid ? ` ${state.eid}` : "";
    el.title.value = ev.dbEvents_Title || "";
    el.eventType.value = ev.dbEvents_EventType || "Tournament";
    el.facilityName.value = ev.dbEvents_FacilityName || "";
    el.description.value = ev.dbEvents_Description || "";
    el.startDate.value = String(ev.dbEvents_StartDate || ev.startDateISO || todayYmd()).slice(0, 10);
    el.endDate.value = String(ev.dbEvents_EndDate || ev.endDateISO || el.startDate.value || todayYmd()).slice(0, 10);
    el.scoringMethod.value = ev.dbEvents_ScoringMethod || "";
    el.tiebreakMethod.value = ev.dbEvents_TiebreakMethod || "";

    renderScheduleHint();
    renderScoringPreview();
  }

  function collectPatch() {
    const method = el.scoringMethod.value || "";
    const tb = el.tiebreakMethod.value || "";

    return {
      dbEvents_Title: el.title.value.trim(),
      dbEvents_EventType: el.eventType.value,
      dbEvents_StartDate: el.startDate.value,
      dbEvents_EndDate: el.endDate.value,
      dbEvents_Description: el.description.value.trim(),
      dbEvents_FacilityName: el.facilityName.value.trim(),
      dbEvents_ScoringMethod: method,
      dbEvents_ScoringConfig: method ? JSON.stringify(defaultScoringConfig(method)) : "",
      dbEvents_TiebreakMethod: tb,
      dbEvents_TiebreakConfig: tb ? JSON.stringify(defaultTiebreakConfig(tb)) : ""
    };
  }

  function validatePatch(patch) {
    if (!patch.dbEvents_Title) return "Please enter an event title.";
    if (!patch.dbEvents_StartDate) return "Please select a start date.";
    if (!patch.dbEvents_EndDate) return "Please select an end date.";
    if (patch.dbEvents_EndDate < patch.dbEvents_StartDate) return "End date cannot be before start date.";
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
    if (!confirm("Are you sure you want to delete this event? This cannot be undone.")) return;

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

  function onBack() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
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
        visible: ["admin", "eventhome", "eventedit", "eventroster", "eventgames", "eventscoring"],
        active: "eventedit",
        disabled: (state.mode === "add") ? ["eventroster", "eventgames", "eventscoring"] : [],
        onNavigate: id => MA.routerGo(id)
      });
    }
  }

  function wireDom() {
    [
      el.title,
      el.eventType,
      el.facilityName,
      el.description,
      el.startDate,
      el.endDate,
      el.scoringMethod,
      el.tiebreakMethod
    ].forEach(node => {
      if (!node) return;
      node.addEventListener("input", () => {
        renderScheduleHint();
        renderScoringPreview();
        setDirty(true);
      });
      node.addEventListener("change", () => {
        renderScheduleHint();
        renderScoringPreview();
        setDirty(true);
      });
    });
  }

  wireDom();
  applyEventToDom();
  applyChrome();
  setStatus("", "info");
})();
