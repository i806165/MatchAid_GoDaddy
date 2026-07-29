/* /assets/pages/event_skins.js
   Event Hole Champions page controller.
   Mirrors event_scorecard.js's structure — including the round selector,
   built inline on MA.ui.openActionsMenu() the same way, not through a
   wrapper module. There's no round-specific behavior here worth naming:
   it's a label string and a list fed into an already-generic component,
   same as score_home.js's and event_scorecard.js's own switchers.

   - Hydrates from window.__INIT__ (server-baked default round).
   - Owns the round selector (page-level, .maControlArea), including the
     "All Rounds" pooled option — the module never knows about round
     switching, only about rendering whichever flat player set + card
     ranges it's given.
   - Flight filtering is entirely module-owned (no fetch involved) — see
     module_renderHoleChampions.js.
   - On round switch, calls module_renderHoleChampions.mount() with a
     freshly fetched player set via initEventSkins.php.
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
    selection: String(init.selection || ""),
  };

  const el = {
    controlsArea:   document.getElementById("esControls"),
    roundSelector:  null, // created on first render, see renderRoundSelector()
    moduleControls: document.getElementById("esModuleControls"),
    moduleHost:     document.getElementById("esModuleHost"),
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

  // Mirrors event_scorecard.js's formatRoundLabel() exactly.
  function formatRoundLabel(r) {
    const parts = [];
    if (r.roundNo) parts.push(`Round ${r.roundNo}`);
    parts.push(r.title || r.courseName || `Game ${r.ggid}`);
    if (r.playDate) parts.push(r.playDate);
    return parts.join(" — ");
  }

  function currentSelectionLabel() {
    if (state.selection === "ALL") return "All Rounds";
    const current = findRound(state.selection);
    return current ? formatRoundLabel(current) : "Select Round";
  }

  // ── Round selector — page-owned, .maControlArea. Same inline
  //    build-items-then-openActionsMenu shape as event_scorecard.js;
  //    the only addition here is the extra "All Rounds" entry. ─────────

  function renderRoundSelector() {
    if (!el.controlsArea) return;

    if (!el.roundSelector) {
      el.roundSelector = document.createElement("div");
      el.roundSelector.id = "esRoundSelector";
      el.controlsArea.insertBefore(el.roundSelector, el.controlsArea.firstChild);
    }

    el.roundSelector.innerHTML = `
      <button type="button" id="esRoundSelectorBtn" class="btn btnSecondary"
        style="width:100%; display:flex; align-items:center; justify-content:space-between;">
        <span>${esc(currentSelectionLabel())}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>`;

    document.getElementById("esRoundSelectorBtn")?.addEventListener("click", openRoundSwitcher);
  }

  function buildRoundSwitcherItems() {
    const items = state.rounds.map((r) => ({
      label:  formatRoundLabel(r),
      action: () => switchSelection(r.ggid),
    }));
    items.unshift({
      label:  "All Rounds",
      action: () => switchSelection("ALL"),
    });
    return items;
  }

  function openRoundSwitcher() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    const items = buildRoundSwitcherItems();
    if (!items.length) return;
    MA.ui.openActionsMenu("Select Round", items);
  }

  function switchSelection(selection) {
    selection = String(selection);
    if (selection === state.selection) return; // already showing — no-op

    state.selection = selection;
    renderRoundSelector();
    applyChrome(); // subtitle reflects the current round — refresh it too

    MA.postJson(MA.paths.initEventSkins, { selection })
      .then((res) => {
        if (!res || !res.ok) {
          console.error("[EVENT_SKINS] fetch failed", res);
          el.moduleHost.innerHTML = `<div class="maEmptyState">Unable to load hole champions.</div>`;
          return;
        }
        MA.renderHoleChampions.mount({
          hostEl:       el.moduleHost,
          controlsEl:   el.moduleControls,
          players:      res.players,
          cardRanges:   res.cardRanges,
          flightActive: res.flightActive,
          flightConfig: res.flightConfig,
        });
      })
      .catch((err) => {
        console.error("[EVENT_SKINS] fetch failed", err);
        el.moduleHost.innerHTML = `<div class="maEmptyState">Unable to load hole champions.</div>`;
      });
  }

  // ── Chrome ────────────────────────────────────────────────────────────

  function applyChrome() {
    const ev = state.event || {};
    const subtitle = [safe(ev.dbEvents_Title || "Event"), currentSelectionLabel()]
      .filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Hole Champions", safe(ev.dbEvents_Title || "Event"), subtitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      // NOTE: same caveat as event_scorecard.js — "eventskins" as the
      // active/visible nav id is assumed to match this app's event-level
      // nav set, not verified against a source file.
      MA.chrome.setBottomNav({
        visible: ["eventhome", "eventedit", "eventroster", "eventrounds", "eventscorecard", "eventskins", "eventsummary"],
        active:  "eventskins",
        root:    ["eventhome"],
        onNavigate: (id) => MA.routerGo?.(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [];
    if (state.event && Object.keys(state.event).length) {
      items.push({
        label: "View event details",
        action: () => MA.eventDetails && MA.eventDetails.open(state.event),
      });
    }

    const current = findRound(state.selection);
    if (current) {
      items.push({
        label: "View round details",
        action: () => MA.gameDetails && MA.gameDetails.open(current),
      });
    }

    if (items.length) MA.ui.openActionsMenu("Hole Champions Actions", items);
  }

  // ── Boot ──────────────────────────────────────────────────────────────

  async function boot() {
    applyChrome();
    renderRoundSelector();

    // First paint — server-baked payload from eventskins.php, no
    // network call. Only round/All-Rounds switches (switchSelection
    // above) hit initEventSkins.php.
    const skins = init.skinsPayload || {};
    MA.renderHoleChampions.mount({
      hostEl:       el.moduleHost,
      controlsEl:   el.moduleControls,
      players:      skins.players,
      cardRanges:   skins.cardRanges,
      flightActive: skins.flightActive,
      flightConfig: skins.flightConfig,
    });
  }

  boot().catch((err) => {
    console.error("[EVENT_SKINS] boot error", err);
    MA.ui.notify("Failed to initialize hole champions.", "danger");
  });
})();
