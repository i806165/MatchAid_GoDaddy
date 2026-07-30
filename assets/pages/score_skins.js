/* /assets/pages/score_skins.js
   Game-level Hole Champions page controller.
   No round selector — single ggid, nothing to switch between. Flight
   filtering is entirely module-owned (module_renderHoleChampions.js),
   no fetch involved for that either. First paint is server-baked;
   initScoreSkins.php exists for future use (a config/criteria layer,
   deliberately deferred — see chat) rather than anything this page
   calls today.

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
  };

  const el = {
    moduleControls: document.getElementById("scModuleControls"),
    moduleHost:     document.getElementById("scModuleHost"),
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

  // ── Chrome ────────────────────────────────────────────────────────────

  function applyChrome() {
    const game = state.game || {};
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)]
      .filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Hole Champions", "Skins", subtitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({
        visible: ["scorehome", "scoreentry", "scorecardShared", "scoresummary", "scoreskins"],
        active:  "scoreskins",
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

    // init IS the payload shape the module expects
    // (buildGameHoleChampionsPayload()'s own return shape) — no separate
    // wrapper key needed, same as scorecardShared.js's own init handling.
    MA.renderHoleChampions.mount({
      hostEl:       el.moduleHost,
      controlsEl:   el.moduleControls,
      players:      init.players,
      cardRanges:   init.cardRanges,
      flightActive: init.flightActive,
      flightConfig: init.flightConfig,
    });
  }

  boot().catch((err) => {
    console.error("[SCORE_SKINS] boot error", err);
    MA.ui.notify("Failed to initialize hole champions.", "danger");
  });
})();
