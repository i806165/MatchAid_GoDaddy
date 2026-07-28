/* /assets/pages/scorecardShared.js
   Consolidated Player / Group / Game Scorecards page controller.
   Replaces the old one-controller-per-mode split (scorecardGame.php /
   scorecardGroup.php / scorecardPlayer.php, each a separate URL) — mode
   is now a client-side .maSeg tab switch, page-owned, in .maControlArea.
   Same mount()/self-fetch pattern event_scorecard.js established for
   Event Scorecards' round selector, applied here to a mode switch instead
   of a round switch.

   Mirrors event_scorecard.js's structure:
   - IIFE, DOM ref map, applyChrome() + openActionsMenu() on boot
   - async boot() wrapped in .catch(), matching every other page controller
   - Hydrates from window.__INIT__ (server-baked default mode).
   - On mode switch, calls module_renderScoreCards.mount() WITHOUT
     initialData, so the module self-fetches via initScoreCardMode.php.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};

  const state = {
    ggid: String(init.game?.dbGames_GGID || ""),
    mode: String(init.mode || "game"),
    portal: init.portal || "",
  };

  const el = {
    controlsArea:   document.getElementById("scControls"),
    modeSeg:        null, // created on first render, see renderModeSeg()
    moduleControls: document.getElementById("scModuleControls"),
    moduleHost:     document.getElementById("scModuleHost"),
    moduleFooter:   document.getElementById("scModuleFooter"),
  };

  function safe(v) { return v == null ? "" : String(v); }

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

  // ── Mode tabs — page-owned, .maSeg stretched 100% in .maControlArea,
  //    above the module's own KPI pills (which sit inside .maPanel__controls,
  //    a separate pinned strip below this one). ──────────────────────────

  const MODES = [
    { id: "player", label: "Player" },
    { id: "group",  label: "Group" },
    { id: "game",   label: "Game" },
  ];

  function renderModeSeg() {
    if (!el.controlsArea) return;

    if (!el.modeSeg) {
      el.modeSeg = document.createElement("div");
      el.modeSeg.id = "scModeSeg";
      el.controlsArea.insertBefore(el.modeSeg, el.controlsArea.firstChild);
    }

    el.modeSeg.innerHTML = `
      <div class="maSeg">
        ${MODES.map((m) =>
          `<button type="button" class="maSegBtn ${state.mode === m.id ? "is-active" : ""}" data-mode="${m.id}">${m.label}</button>`
        ).join("")}
      </div>`;

    el.modeSeg.querySelectorAll("[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => switchMode(btn.dataset.mode))
    );
  }

  function switchMode(mode) {
    mode = String(mode);
    if (mode === state.mode) return; // already showing — no-op

    state.mode = mode;
    renderModeSeg();

    // No initialData — module self-fetches via initScoreCardMode.php.
    // Server resolves scope (caller's own GHIN) itself for group/player —
    // the client never sends one. mount() resets card-expand/value-mode/
    // furl state internally on any (ggid, mode, scope) change.
    MA.renderScoreCards.mount({
      hostEl:     el.moduleHost,
      controlsEl: el.moduleControls,
      footerEl:   el.moduleFooter,
      ggid:       state.ggid,
      mode,
      apiPath:    MA.paths.initScoreCardMode,
    });
  }

  // ── Chrome ────────────────────────────────────────────────────────────
  // Ported from the original (pre-module-split) scorecardShared.js —
  // page-owned, the module has no knowledge of it. Bottom nav is a single
  // "scorecardGame" entry now — pageRouter.php's three scorecard* actions
  // consolidated to one alongside this file's own consolidation, and
  // score_home.js's nav list updated to match (see that file's own diff).

  function applyChrome() {
    const game = init.game || {};
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Scorecard", "Scorecards", subtitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({
        visible: ["scorehome", "scoreentry", "scorecardGame", "scoresummary", "scoreskins"],
        active:  "scorecardGame",
        root:    ["scorehome"],
        onNavigate: (id) => MA.routerGo?.(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    // Gracefully degrading, same pattern as event_scorecard.js's own
    // openActionsMenu() — only offer items whose dependency is actually
    // present, skip opening the menu entirely if nothing qualifies.
    const items = [];
    const game = init.game || {};

    if (game && Object.keys(game).length) {
      items.push({
        label: "View game details",
        action: () => MA.gameDetails && MA.gameDetails.open(game),
      });
    }

    if (MA.ghinPostScores) {
      const players = Array.isArray(init.players) ? init.players : [];
      const p = players[0] || {};
      const postedId = p.dbPlayers_GHINPostID || "";
      const postLabel = postedId ? "Score Already Posted to GHIN" : "Post Score to GHIN";
      items.push({
        label:   postLabel,
        enabled: !postedId,
        indent:  false,
        action:  () => MA.ghinPostScores.open({
          ggid: game.dbGames_GGID,
          onPosted: (res) => {
            if (p) p.dbPlayers_GHINPostID = res.ghinPostId;
            applyChrome();
          },
        }),
      });
    }

    if (items.length) MA.ui.openActionsMenu("Scorecard Actions", items);
  }

  // ── Mobile landscape chrome-hiding — page-level, unrelated to the
  //    module. Ported verbatim from the original scorecardShared.js. ────

  function isMobileLandscapeLike() {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const isMobileWidth = window.innerWidth <= 1024;
    return isLandscape && isCoarsePointer && isMobileWidth;
  }

  function applyLandscapeChromeMode() {
    document.body.classList.toggle("scChromeHiddenMode", isMobileLandscapeLike());
  }

  // ── Boot ──────────────────────────────────────────────────────────────

  async function boot() {
    applyChrome();
    applyLandscapeChromeMode();
    renderModeSeg();

    // First paint — server-baked payload from scorecardShared.php, no
    // network call. init IS the payload shape the module expects
    // (initSharedScoreCard()'s own return shape, same one
    // initScoreCardMode.php echoes back on a mode switch) — no separate
    // wrapper key needed here, unlike Event Scorecards' scorecardPayload.
    await MA.renderScoreCards.mount({
      hostEl:      el.moduleHost,
      controlsEl:  el.moduleControls,
      footerEl:    el.moduleFooter,
      ggid:        state.ggid,
      mode:        state.mode,
      apiPath:     MA.paths.initScoreCardMode,
      initialData: init,
    });

    window.addEventListener("resize", applyLandscapeChromeMode);
    window.addEventListener("orientationchange", applyLandscapeChromeMode);
  }

  boot().catch((err) => {
    console.error("[SCORECARD_SHARED] boot error", err);
    MA.ui.notify("Failed to initialize scorecards.", "danger");
  });
})();
