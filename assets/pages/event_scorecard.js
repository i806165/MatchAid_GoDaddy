/* /assets/pages/event_scorecard.js
   Event Scorecards page controller.
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

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
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

  // ── Boot ──────────────────────────────────────────────────────────────

  function boot() {
    renderRoundSelector();

    // First paint — server-baked payload from eventscorecard.php, no
    // network call. Only round switches (switchToRound above) hit
    // initEventScorecard.php.
    MA.renderScoreCards.mount({
      hostEl:      el.moduleHost,
      controlsEl:  el.moduleControls,
      footerEl:    el.moduleFooter,
      ggid:        state.currentGgid,
      mode:        "game",
      apiPath:     MA.paths.initEventScorecard,
      initialData: init.scorecardPayload,
    });
  }

  boot();
})();
