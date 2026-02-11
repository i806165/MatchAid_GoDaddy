/* /assets/pages/game_settings.js
   Game Settings page controller.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__MA_INIT__ || {};

  // API routes
  const routes = MA.routes || {};
  const apiBase = routes.apiGameSettings || "/api/game_settings";
  const returnToUrl = routes.returnTo || "/app/admin_games/gameslist.php";

  // ---- DOM ----
  const el = {
    tabs: document.getElementById("gsTabs"),
    panels: {
      general: document.getElementById("gsPanelGeneral"),
      scoring: document.getElementById("gsPanelScoring"),
      handicaps: document.getElementById("gsPanelHandicaps"),
    },
    // General Tab
    competitionType: document.getElementById("gsCompetitionType"),
    gameFormat: document.getElementById("gsGameFormat"),
    // Add other element IDs here as we build them
  };

  // ---- State ----
  const state = {
    ggid: null,
    game: null,
    roster: [],
    activeTab: "general",
    dirty: false,
    busy: false,
  };

  // ---- Utils ----
  function setBusy(on) {
    state.busy = !!on;
    const saveBtn = document.getElementById("chromeBtnRight");
    if (saveBtn) saveBtn.disabled = state.busy;
  }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) MA.setStatus("Unsaved changes.", "warn");
    else MA.setStatus("", "");
  }

  // ---- Chrome & Navigation ----
  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      const gameTitle = state.game?.dbGames_Title || `GGID ${state.ggid}`;
      chrome.setHeaderLines(["ADMIN PORTAL", "Game Settings", gameTitle]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Cancel", onClick: onCancel },
        right: { show: true, label: "Save", onClick: doSave }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary"],
        active: "settings",
        onNavigate: (id) => MA.routerGo(id)
      });
    }
  }

  function onCancel() {
    if (state.dirty) {
      if (!confirm("Discard unsaved changes and go back?")) return;
    }
    window.location.assign(returnToUrl);
  }

  // ---- Data & API ----
  async function doSave() {
    if (state.busy) return;
    MA.setStatus("Saving...", "info");
    setBusy(true);

    try {
      const patch = buildPatchFromUI();
      const res = await MA.postJson(`${apiBase}/saveGameSettings.php`, { patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      state.game = res.payload?.game || state.game;
      setDirty(false);
      MA.setStatus("Settings saved successfully.", "success");

    } catch (e) {
      console.error(e);
      MA.setStatus(e.message || "An error occurred during save.", "error");
    } finally {
      setBusy(false);
    }
  }

  function buildPatchFromUI() {
    const patch = {
      dbGames_Competition: readChoice(el.competitionType),
      dbGames_GameFormat: el.gameFormat.value,
    };
    return patch;
  }

  // ---- Rendering ----
  function render() {
    const g = state.game || {};
    pickChoice(el.competitionType, g.dbGames_Competition);
    el.gameFormat.value = g.dbGames_GameFormat || "StrokePlay";
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    el.tabs.querySelectorAll(".maSegBtn").forEach(btn => {
      const on = btn.dataset.tab === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.values(el.panels).forEach(panel => {
      if (panel) {
        panel.classList.toggle("is-active", panel.dataset.tabPanel === tabId);
      }
    });
  }

  // ---- UI Helpers ----
  function pickChoice(container, value) {
    if (!container) return;
    container.querySelectorAll(".maChoiceChip").forEach(btn => {
      btn.classList.toggle("is-selected", btn.dataset.value === value);
    });
  }

  function readChoice(container) {
    const on = container ? container.querySelector(".maChoiceChip.is-selected") : null;
    return on ? on.dataset.value : "";
  }

  // ---- Event Wiring ----
  function wireEvents() {
    el.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".maSegBtn");
      if (btn && !btn.disabled) {
        setActiveTab(btn.dataset.tab);
      }
    });

    function wireDirty(input) {
      if (!input) return;
      input.addEventListener("change", () => setDirty(true));
    }
    
    function wireChoiceDirty(container) {
        if (!container) return;
        container.addEventListener("click", (e) => {
            const chip = e.target.closest('.maChoiceChip');
            if (chip) {
                setDirty(true);
                pickChoice(container, chip.dataset.value);
            }
        });
    }

    wireChoiceDirty(el.competitionType);
    wireDirty(el.gameFormat);
  }

  // ---- Init ----
  function loadContext() {
    if (!init || !init.ok) {
      MA.setStatus("Failed to load game context.", "error");
      console.error("Missing or invalid __INIT__ payload.");
      return;
    }
    state.ggid = init.ggid;
    state.game = init.game;
    state.roster = init.roster || [];
  }

  function initialize() {
    loadContext();
    applyChrome();
    render();
    wireEvents();
    setDirty(false);
    MA.setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();