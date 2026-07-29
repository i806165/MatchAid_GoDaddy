/* /assets/pages/event_scorecard.js
   Event Scorecards page controller.
   Mirrors event_roster.js / scorecardShared.js patterns:
   - IIFE, DOM ref map, applyChrome() + openActionsMenu() on boot
   - async boot() wrapped in .catch(), matching every other page controller
   - Hydrates from window.__INIT__ (server-baked default round).
   - Owns the round selector (page-level, .maControlArea) — the module
     never knows about switching rounds, only about rendering whichever
     ggid it's told to.
   - On round switch, calls module_renderScoreCards.mount() WITHOUT
     initialData, so the module self-fetches via initEventScorecard.php.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};

  const state = {
    eid: init.eid || 0,
    event: init.event || {},
    portal: init.portal || "",
    rounds: Array.isArray(init.rounds) ? init.rounds : [],
    currentGgid: String(init.ggid || ""),
  };

  const el = {
    controlsArea:   document.getElementById("esControls"),
    moduleControls: document.getElementById("esModuleControls"),
    moduleHost:     document.getElementById("esModuleHost"),
    moduleFooter:   document.getElementById("esModuleFooter"),
    roundSelector:  null, // created on first render, see renderRoundSelector()
  };

  function safe(v) { return v == null ? "" : String(v); }
  function esc(v) {
    return safe(v).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function findRound(ggid) {
    return state.rounds.find((r) => String(r.ggid) === String(ggid)) || null;
  }

  // Mirrors the label shape score_home.js's buildScorecardSwitcherItems()
  // uses for its own switcher — round number, a name, and the play date.
  function formatRoundLabel(r) {
    const parts = [];
    if (r.roundNo) parts.push(`Round ${r.roundNo}`);
    parts.push(r.title || r.courseName || `Game ${r.ggid}`);
    if (r.playDate) parts.push(r.playDate);
    return parts.join(" — ");
  }

  // ── Round selector — page-owned, lives in #esControls above the
  //    module's own .maPanel__controls (KPI pills), same two-strip
  //    layout agreed on for .maControlArea. ────────────────────────────

  function renderRoundSelector() {
    if (!el.controlsArea) return;

    if (!el.roundSelector) {
      el.roundSelector = document.createElement("div");
      el.roundSelector.id = "esRoundSelector";
      el.controlsArea.insertBefore(el.roundSelector, el.controlsArea.firstChild);
    }

    const current = findRound(state.currentGgid);
    const label = current ? formatRoundLabel(current) : "Select Round";

    el.roundSelector.innerHTML = `
      <button type="button" id="esRoundSelectorBtn" class="btn btnSecondary"
        style="width:100%; display:flex; align-items:center; justify-content:space-between;">
        <span>${esc(label)}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>`;

    document.getElementById("esRoundSelectorBtn")?.addEventListener("click", openRoundSwitcher);
  }

  // Direct port of score_home.js's buildScorecardSwitcherItems() /
  // openScorecardSwitcher() pattern — MA.ui.openActionsMenu(title, items).
  function buildRoundSwitcherItems() {
    return state.rounds.map((r) => ({
      label: formatRoundLabel(r),
      action: () => switchToRound(r.ggid),
    }));
  }

  function openRoundSwitcher() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    const items = buildRoundSwitcherItems();
    if (!items.length) return;
    MA.ui.openActionsMenu("Select Round", items);
  }

  function switchToRound(ggid) {
    ggid = String(ggid);
    if (ggid === state.currentGgid) return; // already showing — no-op

    state.currentGgid = ggid;
    renderRoundSelector();
    applyChrome(); // subtitle reflects the current round's course/date — refresh it too

    // No initialData — module self-fetches via initEventScorecard.php.
    // mount() resets card-expand/value-mode/furl state internally on
    // any ggid change (reset-on-switch, decided explicitly).
    MA.renderScoreCards.mount({
      hostEl:     el.moduleHost,
      controlsEl: el.moduleControls,
      footerEl:   el.moduleFooter,
      ggid,
      mode:       "game",
      apiPath:    MA.paths.initEventScorecard,
    });
  }

  // ── Chrome ────────────────────────────────────────────────────────────
  // Mirrors event_roster.js's applyChrome() exactly — header lines, the
  // Actions button, and bottom nav. This is page-owned chrome; the module
  // has no knowledge of it, per the earlier chrome/module split.

  function applyChrome() {
    const ev = state.event || {};
    const current = findRound(state.currentGgid);
    const subtitle = [current?.courseName, current?.playDate].filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Event Scorecards", safe(ev.dbEvents_Title || "Event"), subtitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      // NOTE: "eventscorecard" as the active nav id, and its place in this
      // visible list, are assumed to match event_roster.js's established
      // event-level nav set — confirm/adjust against the actual nav id
      // scheme once that's wired up elsewhere; not verified against a
      // source file the way the rest of this page's chrome calls are.
      MA.chrome.setBottomNav({
        visible: ["eventhome", "eventedit", "eventroster", "eventrounds", "eventscorecard", "eventskins", "eventsummary"],
        active:  "eventscorecard",
        root:    ["eventhome"],
        onNavigate: (id) => MA.routerGo(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    // Gracefully degrading, same pattern scorecardShared.js's own
    // openActionsMenu() used — only offer items whose dependency is
    // actually present, and skip opening the menu entirely if nothing
    // qualifies, rather than showing an empty sheet.
    const items = [];

    if (state.event && Object.keys(state.event).length) {
      items.push({
        label: "View event details",
        action: () => MA.eventDetails && MA.eventDetails.open(state.event),
      });
    }

    const current = findRound(state.currentGgid);
    if (current) {
      items.push({
        label: "View round details",
        action: () => MA.gameDetails && MA.gameDetails.open(current),
      });
    }

    if (items.length) MA.ui.openActionsMenu("Scorecard Actions", items);
  }

  // ── Boot ──────────────────────────────────────────────────────────────

  async function boot() {
    applyChrome();
    renderRoundSelector();

    // First paint — server-baked payload from eventscorecard.php, no
    // network call. Only round switches (switchToRound above) hit
    // initEventScorecard.php.
    await MA.renderScoreCards.mount({
      hostEl:      el.moduleHost,
      controlsEl:  el.moduleControls,
      footerEl:    el.moduleFooter,
      ggid:        state.currentGgid,
      mode:        "game",
      apiPath:     MA.paths.initEventScorecard,
      initialData: init.scorecardPayload,
    });
  }

  boot().catch((err) => {
    console.error("[EVENT_SCORECARD] boot error", err);
    MA.ui.notify("Failed to initialize event scorecards.", "danger");
  });
})();
