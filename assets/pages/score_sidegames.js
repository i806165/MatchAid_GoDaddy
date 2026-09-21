/* /assets/pages/score_sidegames.js
   Game-level Side Games page controller (Hole Champions + side games).
   No round selector — single ggid, nothing to switch between. First paint
   is server-baked; initScoreSidegames.php exists for future use (a
   config/criteria layer, deliberately deferred — see chat) rather than
   anything this page calls today.

   Views (control band): Hole Champions (module_renderHoleChampions.js,
   unchanged) | By Side Game | By Player (module_renderSideBets.js). The
   view switch appears only while side bets are on for the game.

   Flight selection is host-owned and applies to every view: this page
   filters the player array by flight and remounts the active view with it,
   so neither module needs a selector of its own (the Hole Champions module is
   told flights are inactive here). No fetch is involved.

   Mirrors event_skins.js's chrome/boot structure, minus the round
   selector.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};

  const state = {
    game: init.game || {},
    portal: init.portal || "",
    view: "champ",     // "champ" | "bet" | "player"
    flight: "ALL",     // one selection for every view
  };

  const el = {
    controls:       document.getElementById("scControls"),
    viewTabsHost:   document.getElementById("scViewTabsHost"),
    viewTabs:       document.getElementById("scViewTabs"),
    flightHost:     document.getElementById("scFlightHost"),
    moduleHost:     document.getElementById("scModuleHost"),
  };

  function safe(v) { return v == null ? "" : String(v); }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function sideBetsOn() {
    return !!(MA.renderSideBets && MA.renderSideBets.hasSideBets(state.game));
  }

  function flights() {
    const list = Array.isArray(init.flightConfig?.flights) ? init.flightConfig.flights.slice() : [];
    list.sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
    return list;
  }

  function flightsOn() {
    return !!init.flightActive && flights().length > 0;
  }

  function playersForFlight() {
    const all = Array.isArray(init.players) ? init.players : [];
    if (state.flight === "ALL") return all;
    return all.filter((p) => String(p.dbPlayers_FlightKey || p.flightKey || "") === String(state.flight));
  }

  // ── Controls band ─────────────────────────────────────────────────────

  function renderFlightSelector(withRow) {
    if (!flightsOn()) {
      el.flightHost.innerHTML = "";
      return;
    }

    const options = [{ id: "ALL", label: "All Game" }].concat(
      flights().map((f) => ({ id: f.id, label: f.name }))
    );
    const current = options.find((o) => o.id === state.flight) || options[0];

    // Same button the Hole Champions module used to draw for itself.
    const btn = `
      <button type="button" data-flight-selector-btn class="btn btnSecondary"
        style="width:100%; display:flex; align-items:center; justify-content:space-between;">
        <span>${escapeHtml(current.label)}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>`;

    // Under the view switch it needs the field-row gap; alone it does not.
    el.flightHost.innerHTML = withRow
      ? `<div class="maFieldRow"><div class="maField">${btn}</div></div>`
      : `<div class="maField">${btn}</div>`;

    el.flightHost.querySelector("[data-flight-selector-btn]")?.addEventListener("click", () => {
      if (!MA.ui || !MA.ui.openActionsMenu) return;
      MA.ui.openActionsMenu("Select Flight", options.map((o) => ({
        label: o.label,
        action: () => { state.flight = o.id; render(); },
      })));
    });
  }

  function renderControls() {
    const tabs = sideBetsOn();
    if (!tabs && state.view !== "champ") state.view = "champ";

    if (el.viewTabsHost) el.viewTabsHost.hidden = !tabs;

    if (el.viewTabs) {
      el.viewTabs.querySelectorAll("[data-view]").forEach((btn) => {
        const on = btn.dataset.view === state.view;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", String(on));
      });
    }

    renderFlightSelector(tabs);

    // Nothing to show (no side bets, no flights): keep the band out of the way.
    if (el.controls) el.controls.classList.toggle("isHidden", !tabs && !flightsOn());
  }

  // ── Body ──────────────────────────────────────────────────────────────

  function renderBody() {
    const players = playersForFlight();

    if (state.view === "champ") {
      // init IS the payload shape the module expects
      // (buildGameHoleChampionsPayload()'s own return shape) — no separate
      // wrapper key needed, same as scorecardShared.js's own init handling.
      MA.renderHoleChampions.mount({
        hostEl:       el.moduleHost,
        controlsEl:   null,        // the flight selector lives in the control band now
        players,
        cardRanges:   init.cardRanges,
        flightActive: false,
        flightConfig: null,
      });
      return;
    }

    MA.renderSideBets.mount({
      hostEl: el.moduleHost,
      view:   state.view,
      game:   state.game,
      players,
    });
  }

  // Every view/flight change is a fresh render — all cards start collapsed.
  function render() {
    renderControls();
    renderBody();
  }

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    render();
  }

  function formatDate(s) {
    if (!s) return "";
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(...s.split("-").map((n, i) => (i === 1 ? n - 1 : n)))
      : new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  // ── Chrome ────────────────────────────────────────────────────────────

  function applyChrome() {
    const game = state.game || {};
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)]
      .filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Side Games", String(game.dbGames_Title || ""), subtitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({
        visible: ["scorehome", "scoreentry", "scorecardShared", "scoresummary", "scoresidegames"],
        active:  "scoresidegames",
        root:    ["scorehome"],
        onNavigate: (id) => MA.routerGo?.(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [];
    const game = state.game || {};

    if (game && Object.keys(game).length) {
      items.push({
        label: "View game details",
        action: () => MA.gameDetails && MA.gameDetails.open(game),
      });
    }

    if (MA.ghinPostScores) {
      const postedId = init.user?.ghinPostId || "";
      const postLabel = postedId ? "Score Already Posted to GHIN" : "Post Score to GHIN";
      items.push({
        label:   postLabel,
        enabled: !postedId,
        indent:  false,
        action:  () => MA.ghinPostScores.open({
          ggid: game.dbGames_GGID,
          onPosted: () => applyChrome(),
        }),
      });
    }

    if (items.length) MA.ui.openActionsMenu("Actions", items);
  }

  // ── Boot ──────────────────────────────────────────────────────────────

  async function boot() {
    applyChrome();

    el.viewTabs?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (btn) setView(btn.dataset.view);
    });

    render();
  }

  boot().catch((err) => {
    console.error("[SCORE_SIDEGAMES] boot error", err);
    MA.ui.notify("Failed to initialize side games.", "danger");
  });
})();
