/* /assets/pages/game_pairings.js
   Game Pairings page controller (GoDaddy).
   - Hydrates from window.__MA_INIT__
   - Desktop: 2-panel (canvas + tray)
   - Mobile: 1-panel + inline tray toggle
   - Persists to db_Players via api/game_pairings/savePairings.php
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__MA_INIT__ || window.__INIT__ || {};

  const routes = MA.routes || {};
  const apiBase = routes.apiGamePairings || "/api/game_pairings";
  const apiGHIN = MA.paths?.apiGHIN || "/api/GHIN";

  // ---- DOM ----
  const el = {
    tabs: document.getElementById("gpTabs"),
    tabMatchBtn: document.getElementById("gpTabMatch"),
    panelsWrap: document.getElementById("gpTabPanels"),
    // Pair tab
    btnPairToggleAll: document.querySelector('[data-tab-panel="pair"] .gpGlobalToggleBtn'),
    pairingsCanvas: document.getElementById("gpPairingsCanvas"),
    unpairedList: document.getElementById("gpUnpairedList"),
    unpairedCount: document.getElementById("gpUnpairedCount"),
    unpairedSearch: document.getElementById("gpUnpairedSearch"),
    unpairedSearchClear: document.getElementById("gpUnpairedSearchClear"),
    unpairedMasterCheck: document.getElementById("gpUnpairedMasterCheck"),
    unpairedSort: document.getElementById("gpUnpairedSort"),
    hintPair: document.getElementById("gpHintPair"),
    unpairedFooterLeft: document.getElementById("gpUnpairedFooterLeft"),
    btnAssignToPairing: document.getElementById("gpBtnAssignToPairing"),
    // Match tab
    btnMatchToggleAll: document.querySelector('[data-tab-panel="match"] .gpGlobalToggleBtn'),
    flightsCanvas: document.getElementById("gpFlightsCanvas"),
    unmatchedList: document.getElementById("gpUnmatchedList"),
    unmatchedCount: document.getElementById("gpUnmatchedCount"),
    unmatchedSearch: document.getElementById("gpUnmatchedSearch"),
    unmatchedSearchClear: document.getElementById("gpUnmatchedSearchClear"),
    unmatchedMasterCheck: document.getElementById("gpUnmatchedMasterCheck"),
    hintMatch: document.getElementById("gpHintMatch"),
    unmatchedFooterLeft: document.getElementById("gpUnmatchedFooterLeft"),
    btnAssignToFlight: document.getElementById("gpBtnAssignToFlight"),
    // Drawer
    btnTrayPair: document.getElementById("gpBtnTrayPair"),
    btnTrayMatch: document.getElementById("gpBtnTrayMatch"),
    mobileCloseBtns: document.querySelectorAll(".gpMobileCloseBtn"),
  };

  // ---- State ----
  const state = {
    ggid: null,
    game: null,
    competition: "",
    players: [], // normalized
    activeTab: "pair", // pair | match

    // Tray selection
    selectedPlayerGHINs: new Set(), // Pair tab tray selection (multi)
    selectedPairingIds: new Set(), // Match tab tray selection (multi)
    sortMode: "lname", // lname | hi | ch | so

    // Canvas selection / targets
    targetPairingId: "",
    targetFlightId: "",
    targetFlightPos: "", // A | B

    editMode: false, // For card editing
    teamConfig: null,   // null | { teams: [{id,name,color,sort},...] } — from dbGames_TeamConfig
    // flightConfig is the dbPlayers_FlightKey / dbGames_FlightConfig grouping
    // (e.g. Men/Women) used by the boundary clamp and MA.runAutoPair. This is
    // UNRELATED to targetFlightId/targetFlightPos above, which is the Match
    // Pairings tab's Side A/B container — do not conflate the two.
    flightConfig: null, // null | { flights: [{id,name,sort},...] } — from dbGames_FlightConfig
  // Dirty map by GHIN
    dirty: new Set(),
    allCollapsed: false, // Global expand/collapse state
    busy: false,
    // Per-tray collapsed-group tracking for the nested Flight→Team grouping
    // (§4). Keys: "F1" for a flight-level group, "F1|T1" for a team-level
    // group nested inside flight F1 (composite key disambiguates the same
    // team id appearing under different flights). Persisted in state (not
    // just toggled via a CSS class) because these trays re-render on
    // search/sort/selection changes too, not just on the collapse click
    // itself — state is what keeps a group's collapsed appearance stable
    // across those other re-renders. Checked-row selection survives this
    // fine regardless, since selectedPlayerGHINs/selectedPairingIds are
    // Sets independent of the DOM — a row's checked state is derived from
    // that Set at render time, not from anything that gets destroyed by
    // re-rendering.
    unpairedCollapsedGroups: new Set(),
    unmatchedCollapsedGroups: new Set(),
  };

  // ---- Utils ----
  function setStatus(msg, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(msg, level);
    else if (msg) console.log("[STATUS]", level || "info", msg);
  }

  function formatDate(s) {
    if (!s) return "";
    // Try to parse YYYY-MM-DD or similar
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return s;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function setBusy(on) {
    state.busy = !!on;
    if (typeof MA.chrome.setFooterSaveDisabled === "function") {
      MA.chrome.setFooterSaveDisabled(!!on);
    }
  }

  function isPairPair() {
    return String(state.competition || "") === "PairPair";
  }

  // True when this round's linked event owns pairing assignment
  // (dbEvents_PairingMode "fixed", set via module_createEventPairings.js's
  // EVENT/ROUND toggle). The full event record is merged onto state.game
  // by ServiceContextGame::getGameContext() — no separate fetch needed.
  // Enforced via click-through modal (showBlockedModal), not by hiding
  // buttons — mirrors game_players.js's onManageTeams/onDefineFlights
  // pattern exactly. Guards Edit (pen), Unpair (unlink), and the tray's
  // Assign button. The Match tab is untouched entirely, since
  // module_createEventPairings.js never writes flightId/flightPos.
  function pairingsLockedByEvent() {
    return String(state.game?.dbEvents_PairingMode || "") === "fixed";
  }

  // ── Modal: locked-by-event notice ───────────────────────────────────────────
  // Mirrors game_players.js's ensureBlockedModal/showBlockedModal pattern
  // exactly (itself mirroring event_roster.js's) — same maModalOverlay/
  // maModal shape, same OK-to-dismiss behavior. Only one locked action
  // here (Pairings), unlike game_players.js's three (Teams/Flights/
  // Handicaps), but kept as a message param for consistency should that
  // change.
  function ensureBlockedModal() {
    if (document.getElementById("gpBlockedOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "gpBlockedOverlay";
    overlay.className = "maModalOverlay";

    const modal = document.createElement("section");
    modal.className = "maModal";

    modal.innerHTML = `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title" id="gpBlockedTitle"></div>
        </div>
      </header>
      <div class="maModal__body" id="gpBlockedBody">
        <p style="line-height:1.6;" id="gpBlockedMessage"></p>
        <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:14px; display:flex; justify-content:flex-end;">
          <button type="button" class="btn btnSecondary" id="gpBlockedOkBtn">OK</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById("gpBlockedOkBtn")?.addEventListener("click", hideBlockedModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideBlockedModal();
    });
  }

  function showBlockedModal(message, title) {
    ensureBlockedModal();
    const overlay = document.getElementById("gpBlockedOverlay");
    const titleEl = document.getElementById("gpBlockedTitle");
    const msgEl   = document.getElementById("gpBlockedMessage");
    if (titleEl) titleEl.textContent = title || "Managed at Event Level";
    if (msgEl) msgEl.textContent = message || "This action isn't available here.";
    if (overlay) overlay.classList.add("is-open");
  }

  function hideBlockedModal() {
    const overlay = document.getElementById("gpBlockedOverlay");
    if (overlay) overlay.classList.remove("is-open");
  }

  function pad3(v) {
    const n = parseInt(String(v || "0"), 10);
    if (!Number.isFinite(n) || n <= 0) return "000";
    return String(n).padStart(3, "0");
  }

  function normFlightPos(v) {
    const s = String(v || "").trim().toUpperCase();
    if (s === "A" || s === "B") return s;
    if (s === "1") return "A";
    if (s === "2") return "B";
    return "";
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  }

  function isTrayOpen() {
    const listEl = (state.activeTab === "pair") ? el.unpairedList : el.unmatchedList;
    if (!listEl) return false;
    const panel = listEl.closest(".gpTabPanel");
    return panel ? panel.classList.contains("is-tray-open") : false;
  }

  function toggleMobileTray() {
    const listEl = (state.activeTab === "pair") ? el.unpairedList : el.unmatchedList;
    if (!listEl) return;

    const panel = listEl.closest(".gpTabPanel");
    if (!panel) return;
    const isOpen = panel.classList.toggle("is-tray-open");

    const btn = (state.activeTab === "pair") ? el.btnTrayPair : el.btnTrayMatch;
    if (btn) {
      btn.textContent = isOpen
        ? (state.activeTab === "pair" ? "Show Pairings" : "Show Matches")
        : (state.activeTab === "pair" ? "+ Add Player Pairings" : "+ Add Match");
    }

    if (isOpen) {
      applyTrayChrome();
    } else {
      applyChrome();
    }
  }

  // Set chrome footer to ASSIGN/CANCEL when tray is open on mobile.
  // Called on tray open and whenever selection changes while tray is open.
  function applyTrayChrome() {
    if (!chrome || typeof chrome.setActions !== "function") return;

    const hasSelection = state.activeTab === "pair"
      ? state.selectedPlayerGHINs.size > 0
      : state.selectedPairingIds.size > 0;

    const assignHandler = state.activeTab === "pair"
      ? assignSelectedPlayerToPairing
      : assignSelectedPairingToFlight;

    chrome.setActions({
      left:   { show: false },
      right:  { show: false },
      footer: {
        save:   { label: "Assign", onClick: assignHandler },
        cancel: { label: "Cancel", onClick: toggleMobileTray }
      }
    });

    if (typeof chrome.setFooterSaveDisabled === "function") {
      chrome.setFooterSaveDisabled(!hasSelection);
    }
  }

  function markDirty(ghin) {
    if (!ghin) return;
    const wasClean = state.dirty.size === 0;
    state.dirty.add(String(ghin));
    setStatus("Unsaved changes.", "warn");
    if (wasClean) applyChrome();
  }

  function clearDirty() {
    state.dirty.clear();
    setStatus("", "");
    applyChrome();
  }

  function getPlayerByGHIN(ghin) {
    const key = String(ghin || "");
    return state.players.find(p => String(p.playerGHIN) === key) || null;
  }

  function playersInPairing(pairingId) {
    const pid = String(pairingId || "");
    return state.players
      .filter(p => String(p.pairingId) === pid)
      .sort((a, b) => (parseInt(a.pairingPos || "999", 10) - parseInt(b.pairingPos || "999", 10)) || String(a.name).localeCompare(String(b.name)));
  }

  function playersInFlight(flightId, flightPos) {
    const fid = String(flightId || "");
    const fp = String(flightPos || "");
    return state.players
      .filter(p => String(p.flightId) === fid && String(normFlightPos(p.flightPos)) === fp)
      .sort((a, b) => String(a.pairingId).localeCompare(String(b.pairingId)) || String(a.name).localeCompare(String(b.name)));
  }

  function nextFlightId() {
    const ids = state.players
      .map(p => parseInt(String(p.flightId || "0"), 10))
      .filter(n => Number.isFinite(n));
    const max = ids.length ? Math.max(...ids) : 0;
    return String(max + 1);
  }

  function nextPairingId() {
    const ids = state.players
      .map(p => parseInt(String(p.pairingId || "0"), 10))
      .filter(n => Number.isFinite(n));
    const max = ids.length ? Math.max(...ids) : 0;
    return pad3(max + 1);
  }

  function getContainerSchedule(scope) {
    // returns {teeTime,startHole,startHoleSuffix} by scanning players within container
    // scope: { type: 'pairing', id } OR { type: 'flight', id }
    const out = { teeTime: "", startHole: "", startHoleSuffix: "", playerKey: "" };
    if (!scope || !scope.type || !scope.id) return out;
    const list = (scope.type === "pairing")
      ? state.players.filter(p => String(p.pairingId) === String(scope.id))
      : state.players.filter(p => String(p.flightId) === String(scope.id));

    const pick = list.find(p => (p.teeTime || p.startHole || p.startHoleSuffix || p.playerKey));
    if (!pick) return out;
    out.teeTime = String(pick.teeTime || "");
    out.startHole = String(pick.startHole || "");
    out.startHoleSuffix = String(pick.startHoleSuffix || "");
    out.playerKey = String(pick.playerKey || "");
    return out;
  }

  // ---- Actions Menu ----
  function onResetPairings() {
    if (state.dirty.size === 0) return setStatus("No unsaved changes.", "info");
    if (confirm("Discard all unsaved changes and revert to the last save?")) {
      window.location.reload();
    }
  }

  function onAutoPair() {
    const allUnpaired = state.players.filter(p => String(p.pairingId || "000") === "000");
    if (allUnpaired.length < 2) return setStatus("Not enough unpaired players.", "warn");

    if (!MA.runAutoPair || typeof MA.runAutoPair.open !== "function") {
      setStatus("Auto-Pair module failed to load.", "danger");
      return;
    }

    MA.runAutoPair.open({
      players: allUnpaired,
      flightConfig: state.flightConfig,
      teamConfig: state.teamConfig,
      isPairPair: isPairPair(),
      apiBase,
      onApply: onAutoPairApply,
    });
  }

  // Commits groups drafted by MA.runAutoPair — same job applyAutoPairGroups()
  // used to do inline (see the note a few lines below). Stays in this file
  // rather than the module because pairing-ID numbering (nextPairingId/pad3)
  // depends on the FULL player set, not just the unpaired pool the module
  // was handed. Called once per Apply click — the module may call this more
  // than once per open() session if the user runs/applies repeatedly before
  // closing (it re-hydrates and stays open rather than closing after Apply).
  function onAutoPairApply(groups) {
    let pidNum = parseInt(nextPairingId(), 10) - 1; // start before next available

    groups.forEach(grp => {
      pidNum++;
      const pid = pad3(pidNum);
      grp.forEach((p, idx) => {
        const pl = getPlayerByGHIN(p.playerGHIN);
        if (pl) {
          pl.pairingId  = pid;
          pl.pairingPos = String(idx + 1);
          markDirty(pl.playerGHIN);
        }
      });
    });

    render();
    setStatus(`Auto-paired ${groups.length} pairing${groups.length !== 1 ? "s" : ""}.`, "success");
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    
    const items = [
      { label: "Open Automated Pairing", action: onAutoPair },
      { separator: true },
      { separator: true },
      { label: "Reset Pairings and Matches to last Save", action: onResetPairings, danger: true }
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  /**
   * Resolve a team display name from teamConfig by team ID ('T1'/'T2').
   * Returns '' if not found (unassigned or no config).
   */
  function resolveTeamName(teamId, teamConfig) {
    if (!teamConfig || !Array.isArray(teamConfig.teams)) return "";
    const t = teamConfig.teams.find(t => t.id === teamId);
    return t ? (t.name || "") : "";
  }

  /**
   * Resolve a flight display name from flightConfig by flight id ('F1', etc.).
   * Returns '' if not found (unassigned or no config). Mirrors
   * resolveTeamName() — NOT to be confused with flightId/flightPos, the
   * unrelated Match Pairings Side A/B container (see state.flightConfig's
   * own comment for the full distinction).
   */
  function resolveFlightName(flightKey, flightConfig) {
    if (!flightConfig || !Array.isArray(flightConfig.flights)) return "";
    const f = flightConfig.flights.find(f => f.id === flightKey);
    return f ? (f.name || "") : "";
  }

  /**
   * Whether teams are actually in use right now, as opposed to merely
   * configured. state.teamConfig alone is NOT enough to answer this —
   * module_defineTeams.js's "Clear All" only blanks every player's
   * dbPlayers_TeamKey; it deliberately never deletes dbGames_TeamConfig
   * (documented there as an intentional floor state: once a game has had
   * teams, the config stays). So a game that once had teams, then had
   * everyone cleared, still has state.teamConfig !== null even though no
   * player has a team — using teamConfig truthiness alone would treat
   * every player's blank team as "the same team" and misfire.
   */
  function teamsActive() {
    return !!state.teamConfig && state.players.some(p => p.team);
  }

  // Shared collapsible group header + body wrapper for the nested
  // Flight→Team tray grouping (§4). Used by both renderUnpairedList() and
  // renderUnmatchedList(). `groupKey` must be unique within the tray's
  // collapsedSet — "F1" for a flight-level group, "F1|T1" for a team-level
  // group nested inside flight F1.
  const trayIconMinus = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const trayIconPlus = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  function renderTrayGroupHeader(label, count, groupKey, collapsedSet, trayName, unitLabel) {
    const unit = unitLabel || "player";
    const collapsed = collapsedSet.has(groupKey);
    return `
      <div class="gpTrayGroupHdr" data-action="toggle-tray-group" data-tray="${esc(trayName)}" data-group-key="${esc(groupKey)}"
           style="display:flex; align-items:center; gap:6px; padding:5px 10px; font-size:11px; font-weight:800; color:var(--mutedText); background:var(--surfaceApp); border-bottom:1px solid var(--borderSubtle); cursor:pointer; user-select:none;">
        <button class="iconBtn btnSecondary" type="button" data-action="toggle-tray-group" data-tray="${esc(trayName)}" data-group-key="${esc(groupKey)}"
                title="${collapsed ? "Expand" : "Collapse"}" aria-label="${collapsed ? "Expand" : "Collapse"} ${esc(label)}"
                style="width:20px; height:20px; padding:0; flex:0 0 auto;">${collapsed ? trayIconPlus : trayIconMinus}</button>
        <span>${esc(label)} — ${count} ${unit}${count !== 1 ? "s" : ""}</span>
      </div>`;
  }

  function renderTrayGroupBody(groupKey, collapsedSet, innerHtml) {
    const collapsed = collapsedSet.has(groupKey);
    return `<div class="gpTrayGroupBody" data-group-body="${esc(groupKey)}" style="${collapsed ? "display:none;" : ""}">${innerHtml}</div>`;
  }

  // The Auto-Pair modal + drafting engine (isNH, openAutoPairModal,
  // applyAutoPairGroups, AutoPairEngine) used to live here inline. It's now
  // /assets/modules/module_runAutoPair.js (MA.runAutoPair) — see onAutoPair()
  // above and onAutoPairApply() below.

  // ---- Chrome ----
  function applyChrome() {
    const g = state.game || {};
    const title = String(g.dbGames_Title);
    const course = String(g.dbGames_CourseName);
    const date = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    const isEvent = !!(state.game?.dbGames_EID);
    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines([isEvent ? "Round Pairings" : "Game Pairings", title, subTitle]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      const isDirty = state.dirty.size > 0;
      chrome.setActions({
        left: { show: false },
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        footer: isDirty
          ? {
              save:   { label: "Save",   onClick: doSave },
              cancel: { label: "Cancel", onClick: onResetPairings }
            }
          : null
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: isEvent
          ? ["eventrounds", "roundedit", "roundsettings", "roundroster", "roundpairings", "roundteetimes", "roundsummary", "roundscorecard"]
          : ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"],
        active: isEvent ? "roundpairings" : "pairings",
        onNavigate: (id) => {
          if (typeof MA.routerGo === "function") MA.routerGo(id);
        }
      });
    }
  }

  function onBack() {
    if (state.dirty.size > 0) {
      if (!confirm("Discard unsaved changes and go back?")) return;
    }
    if (typeof MA.routerGo === "function") {
      MA.routerGo("admin");
      return;
    }
    window.history.back();
  }

  // ---- Rendering helpers ----
  function renderTabs() {
    const allowMatch = isPairPair();
    if (el.tabMatchBtn) {
      el.tabMatchBtn.disabled = !allowMatch;
      el.tabMatchBtn.title = allowMatch ? "" : "Matches only apply for Pair vs Pair.";
    }
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;

    if (el.tabs) {
      el.tabs.querySelectorAll(".maSegBtn").forEach(btn => {
        const on = btn.dataset.tab === tabId;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    if (el.panelsWrap) {
      el.panelsWrap.querySelectorAll(".gpTabPanel").forEach(panel => {
        const on = panel.dataset.tabPanel === tabId;
        panel.classList.toggle("is-active", on);
      });
    }

    // reset selection/targets
    state.selectedPlayerGHINs.clear();
    state.selectedPairingIds.clear();
    state.targetPairingId = "";
    state.targetFlightId = "";
    state.targetFlightPos = "";
    state.allCollapsed = false;

    render();
  }

  function render() {
    renderTabs();
    if (state.activeTab === "pair") {
      renderPairingsCanvas();
      renderUnpairedList();
      setHints();
    } else {
      renderFlightsCanvas();
      renderUnmatchedList();
      setHints();
    }
    updateToggleAllIcon();
  }

  function setHints() {
    if (el.hintPair) {
      let hintPairText;
      if (state.editMode) {
        hintPairText = `EDIT MODE: Selected ${state.selectedPlayerGHINs.size}. Tap Assign >> to add to Pairing ${state.targetPairingId}.`;
      } else {
        if (isMobile()) {
          hintPairText = "Tap Add Pairing to open tray.";
        } else {
          hintPairText = state.selectedPlayerGHINs.size > 0
            ? `Selected ${state.selectedPlayerGHINs.size}. Tap Assign >> to create new, or tap a card to add.`
            : "Select unpaired players, then tap Assign >>.";
        }
      }
      el.hintPair.textContent = hintPairText;
      if (el.unpairedFooterLeft) el.unpairedFooterLeft.textContent = hintPairText;
    }

    if (el.hintMatch) {
      let hintMatchText;
      if (!isPairPair()) {
        hintMatchText = "Matches are disabled for Pair vs Field.";
      } else {
        if (state.editMode) {
          hintMatchText = `EDIT MODE: Selected ${state.selectedPairingIds.size}. Tap Assign >> to add to Match ${state.targetFlightId}.`;
        } else {
          if (isMobile()) {
            hintMatchText = "Tap Add Match to open tray.";
          } else {
            hintMatchText = state.selectedPairingIds.size > 0
              ? `Selected ${state.selectedPairingIds.size}. Tap a match slot (A/B), then Assign.`
              : "Select an unmatched pairing, then tap a match slot (A/B).";
          }
        }
      }
      el.hintMatch.textContent = hintMatchText;
      if (el.unmatchedFooterLeft) el.unmatchedFooterLeft.textContent = hintMatchText;
    }

    // Update Master Checkboxes (Clear Only)
    updateMasterCheck(el.unpairedMasterCheck, state.selectedPlayerGHINs.size > 0);
    updateMasterCheck(el.unmatchedMasterCheck, state.selectedPairingIds.size > 0);
  }

  function updateMasterCheck(el, hasSelection) {
    if (!el) return;
    if (hasSelection) {
      el.classList.add("has-selection");
      // Minus icon
      el.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    } else {
      el.classList.remove("has-selection");
      el.innerHTML = "";
    }
  }

  function toggleAllCards() {
    state.allCollapsed = !state.allCollapsed;
    render();
  }

  function updateToggleAllIcon() {
    const btn = state.activeTab === 'pair' ? el.btnPairToggleAll : el.btnMatchToggleAll;
    if (!btn) return;
    const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    btn.innerHTML = state.allCollapsed ? iconPlus : iconMinus;
    btn.title = state.allCollapsed ? "Expand All" : "Collapse All";
  }

  // ---- Pairings tab UI ----
  function renderPairingsCanvas() {
    if (!el.pairingsCanvas) return;

    // Group by pairingId (excluding 000)
    const ids = Array.from(new Set(state.players.map(p => String(p.pairingId || "000"))))
      .filter(pid => pid !== "000")
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (!ids.length) {
      el.pairingsCanvas.innerHTML = `<div class="maEmpty">No pairings yet. Select players and click Assign >>.</div>`;
      return;
    }

    el.pairingsCanvas.innerHTML = ids.map(pid => {
      const rows = playersInPairing(pid);
      
      // Header Stats: Sum PH, Avg PH
      const phVals = rows.map(p => parseInt(p.ph || "0", 10)).filter(n => !isNaN(n));
      const sumPH = phVals.reduce((a, b) => a + b, 0);
      const avgPH = phVals.length ? (sumPH / phVals.length).toFixed(1) : "0.0";
      
      // Header Title: Flight-Pos + PairingID
      let flightPrefix = "";
      if (isPairPair()) {
        const fPlayer = rows.find(p => p.flightId);
        if (fPlayer) flightPrefix = `${fPlayer.flightId}-${normFlightPos(fPlayer.flightPos)} `;
      }
      const title = `${flightPrefix}Pairing ${pid}`;
      const meta = `Sum PH: ${sumPH} • Avg PH: ${avgPH}`;

      // New summary title for collapsed view
      const summaryTitle = `Pairing ${pid}: ${rows.map(p => p.lname).join(" • ")}`;

      // SVG Icons
      const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

      const body = rows.map(p => {
        const safeGHIN = esc(p.playerGHIN);
        // Row Info: Name, Team (if teamConfig), TeeSet, HI:#, CH:#, PH:#, SO:#
        const teamName = state.teamConfig ? resolveTeamName(p.team, state.teamConfig) : "";
        const info = [
          p.name,
          teamName,
          p.teeSetName,
          p.hi ? `HI:${p.hi}` : "",
          p.ch ? `CH:${p.ch}` : "",
          p.ph ? `PH:${p.ph}` : "",
          p.so ? `SO:${p.so}` : ""
        ].filter(Boolean).join(" • ");

        return `
          <div class="gpCardRow">
            <button type="button" class="iconBtn btnPrimary gpCardRow__del" data-action="removeFromPair" data-ghin="${safeGHIN}" aria-label="Remove ${esc(p.name)} from pairing">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div class="gpCardRow__info" data-action="toggle-truncate" title="${esc(info)}">${esc(info)}</div>
          </div>`;
      }).join("");

      const selectedClass = (state.targetPairingId === pid) ? " is-target" : "";
      const collapsedClass = state.allCollapsed ? " is-collapsed" : "";
      const editActiveClass = (state.editMode && state.targetPairingId === pid) ? " is-active" : "";
      
      // Header Icons: Unpair (broken link), Edit (pencil) — always
      // rendered. Locking is enforced on click instead (see
      // toggleEditMode/unpairGroup's showBlockedModal guard), mirroring
      // game_players.js's onManageTeams/onDefineFlights pattern exactly:
      // a hidden button can't distinguish "delegated to the event" from
      // "broken" or "no permission" — a click-through message says so
      // explicitly.
      return `
        <div class="gpGroupCard${selectedClass}${collapsedClass}" data-pairing-id="${esc(pid)}">
          <!-- Expanded Header -->
          <div class="gpGroupCard__hdr gpGroupCard__hdr--expanded">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse" title="Collapse">${iconMinus}</button>
            <div class="gpGroupCard__title" title="${esc(title)} • ${esc(meta)}">${esc(title)} • ${esc(meta)}</div>
            <div class="gpCardActions">
              <button class="iconBtn btnSecondary" type="button" data-action="unpairGroup" data-pairing-id="${esc(pid)}" title="Unpair">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>
              </button>
              <button class="iconBtn btnSecondary${editActiveClass}" type="button" data-action="editPairing" data-pairing-id="${esc(pid)}" title="Edit">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
            </div>
          </div>
          <!-- Collapsed Header -->
          <div class="gpGroupCard__hdr gpGroupCard__hdr--collapsed">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse" title="Expand">${iconPlus}</button>
            <div class="gpGroupCard__title" title="${esc(summaryTitle)}">${esc(summaryTitle)}</div>
          </div>
          <!-- Body -->
          <div class="gpGroupCard__body">${body}</div>
        </div>`;
    }).join("");
  }

  function renderUnpairedList() {
    const host = el.unpairedList;
    const countEl = el.unpairedCount;
    const q = String(el.unpairedSearch?.value || "").trim().toLowerCase();

    if (!host) return;

    const unpaired = state.players
      .filter(p => String(p.pairingId || "000") === "000")
      .filter(p => !q || String(p.name || "").toLowerCase().includes(q) || String(p.playerGHIN).includes(q));

    if (countEl) countEl.textContent = `${unpaired.length}`;

    // Sort comparator — used within each group
    const sortCmp = (a, b) => {
      if (state.sortMode === "hi") return (parseFloat(a.hi) - parseFloat(b.hi)) || a.name.localeCompare(b.name);
      if (state.sortMode === "ch") return (parseInt(a.ch) - parseInt(b.ch)) || a.name.localeCompare(b.name);
      if (state.sortMode === "so") return (parseInt(a.so) - parseInt(b.so)) || a.name.localeCompare(b.name);
      return String(a.lname).localeCompare(String(b.lname)) || String(a.name).localeCompare(String(b.name));
    };

    // Row renderer — shared by grouped and flat paths
    const renderRow = (p) => {
      const sel = state.selectedPlayerGHINs.has(String(p.playerGHIN));
      const cls = sel ? "maListRow is-selected" : "maListRow";
      const checkHtml = sel
        ? `<div class="gpRowCheck is-selected"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`
        : `<div class="gpRowCheck"></div>`;

      const stats = [
        p.hi ? `HI:${p.hi}` : "",
        p.ch ? `CH:${p.ch}` : "",
        p.ph ? `PH:${p.ph}` : "",
        p.so ? `SO:${p.so}` : ""
      ].filter(Boolean).join(" • ");

      // Team name: inserted between player name and tee set name when teamConfig is active
      const teamName = state.teamConfig ? resolveTeamName(p.team, state.teamConfig) : "";
      const primaryParts = [esc(p.name), teamName ? esc(teamName) : "", esc(p.teeSetName)].filter(Boolean).join(" • ");

      return `
        <div class="${cls}" data-action="selectUnpaired" data-ghin="${esc(p.playerGHIN)}">
          ${checkHtml}
          <div class="gpUnpairedItem">
            <div class="gpUnpairedItem__primary">${primaryParts}</div>
            <div class="gpUnpairedItem__secondary">
              <span class="gpUnpairedSep">•</span> ${esc(stats)}
            </div>
          </div>
        </div>`;
    };

    // Group header renderer (legacy — retained only as the flat-list
    // fallback path's building block is gone; grouping now always goes
    // through renderTrayGroupHeader/Body above for collapse support).

    const hasFlights = !!(state.flightConfig && Array.isArray(state.flightConfig.flights) && state.flightConfig.flights.length);
    const hasTeams = !!state.teamConfig;

    if (!hasFlights && !hasTeams) {
      // Neither dimension configured — flat sorted list, unchanged from before.
      host.innerHTML = [...unpaired].sort(sortCmp).map(renderRow).join("") || `<div class="maEmpty">No unpaired players.</div>`;
      return;
    }

    // Renders the Team sub-grouping (Unassigned + each team) for a given
    // slice of the pool — reused whether or not Flight grouping is active
    // above it. flightGroupKey is "" when Flight grouping is inactive
    // (team-only mode), otherwise the enclosing flight's id, used to
    // namespace the composite collapse key so the same team id under two
    // different flights collapses independently.
    const renderTeamGroups = (pool, flightGroupKey) => {
      if (!hasTeams) {
        return pool.length ? pool.sort(sortCmp).map(renderRow).join("") : "";
      }
      let out = "";
      const unassigned = pool.filter(p => !p.team).sort(sortCmp);
      if (unassigned.length) {
        const key = flightGroupKey ? `${flightGroupKey}|__none__` : "__none__";
        out += renderTrayGroupHeader("Unassigned", unassigned.length, key, state.unpairedCollapsedGroups, "unpaired");
        out += renderTrayGroupBody(key, state.unpairedCollapsedGroups, unassigned.map(renderRow).join(""));
      }
      [...state.teamConfig.teams]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach(t => {
          const players = pool.filter(p => p.team === t.id).sort(sortCmp);
          if (!players.length) return;
          const key = flightGroupKey ? `${flightGroupKey}|${t.id}` : t.id;
          out += renderTrayGroupHeader(t.name, players.length, key, state.unpairedCollapsedGroups, "unpaired");
          out += renderTrayGroupBody(key, state.unpairedCollapsedGroups, players.map(renderRow).join(""));
        });
      return out;
    };

    if (!hasFlights) {
      // Team-only grouping, single level, still collapsible.
      host.innerHTML = renderTeamGroups(unpaired, "") || `<div class="maEmpty">No unpaired players.</div>`;
      return;
    }

    // Flight (outer, sorted by flightConfig.sort) → Team (inner) grouping.
    let html = "";
    const unassignedFlight = unpaired.filter(p => !p.flightKey);
    if (unassignedFlight.length) {
      html += renderTrayGroupHeader("Unassigned", unassignedFlight.length, "__noflight__", state.unpairedCollapsedGroups, "unpaired");
      html += renderTrayGroupBody("__noflight__", state.unpairedCollapsedGroups, renderTeamGroups(unassignedFlight, "__noflight__"));
    }
    [...state.flightConfig.flights]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .forEach(f => {
        const players = unpaired.filter(p => p.flightKey === f.id);
        if (!players.length) return;
        html += renderTrayGroupHeader(f.name, players.length, f.id, state.unpairedCollapsedGroups, "unpaired");
        html += renderTrayGroupBody(f.id, state.unpairedCollapsedGroups, renderTeamGroups(players, f.id));
      });

    host.innerHTML = html || `<div class="maEmpty">No unpaired players.</div>`;
  }

  // ---- Matches tab UI ----
  function renderFlightsCanvas() {
    if (!el.flightsCanvas) return;

    if (!isPairPair()) {
      el.flightsCanvas.innerHTML = `<div class="maEmpty">Matches are only used for Pair vs Pair.</div>`;
      return;
    }

    const ids = Array.from(new Set(state.players.map(p => String(p.flightId || "")).filter(Boolean)))
      .filter(Boolean)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (!ids.length) {
      el.flightsCanvas.innerHTML = `<div class="maEmpty">No matches yet. Select pairings and Assign >>.</div>`;
      return;
    }

    el.flightsCanvas.innerHTML = ids.map(fid => {
      const teamA = buildTeamSummary(fid, "A");
      const teamB = buildTeamSummary(fid, "B");
      const sched = getContainerSchedule({ type: "flight", id: fid });
      const meta = [
        sched.teeTime ? `TT ${sched.teeTime}` : "",
        sched.startHole ? `H ${sched.startHole}${sched.startHoleSuffix || ""}` : ""
      ].filter(Boolean).join(" • ");

      // New summary title for collapsed view
      const teamANames = teamA.pairingId ? formatPairingLabel(teamA.pairingId, playersInPairing(teamA.pairingId)) : "";
      const teamBNames = teamB.pairingId ? formatPairingLabel(teamB.pairingId, playersInPairing(teamB.pairingId)) : "";
      let summaryTitle = `Match ${esc(fid)}: `;
      if (teamANames) summaryTitle += `Side A: ${esc(teamANames)}`;
      if (teamANames && teamBNames) summaryTitle += " vs. ";
      if (teamBNames) summaryTitle += `Side B: ${esc(teamBNames)}`;

      // SVG Icons
      const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

      const collapsedClass = state.allCollapsed ? " is-collapsed" : "";
      const editActiveClass = (state.editMode && state.targetFlightId === fid) ? " is-active" : "";
      const targetClass = (state.editMode && state.targetFlightId === fid) ? " is-target" : "";
      return `
        <div class="gpGroupCard${targetClass}${collapsedClass}" data-flight-id="${esc(fid)}">
          <!-- Expanded Header -->
          <div class="gpGroupCard__hdr gpGroupCard__hdr--expanded">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse" title="Collapse">${iconMinus}</button>
            <div class="gpGroupCard__title" title="Match ${esc(fid)} • ${esc(meta)}">Match ${esc(fid)} • ${esc(meta)}</div>
            <div class="gpCardActions">
              <button class="iconBtn btnSecondary" type="button" data-action="unmatchFlight" data-flight-id="${esc(fid)}" title="Unmatch">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>
              </button>
              <button class="iconBtn btnSecondary${editActiveClass}" type="button" data-action="editFlight" data-flight-id="${esc(fid)}" title="Edit">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
            </div>
          </div>
          <!-- Collapsed Header -->
          <div class="gpGroupCard__hdr gpGroupCard__hdr--collapsed">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse" title="Expand">${iconPlus}</button>
            <div class="gpGroupCard__title" title="${esc(summaryTitle)}">${summaryTitle}</div>
          </div>
          <!-- Body -->
          <div class="gpGroupCard__body">
            ${renderTeamSlot(fid, "A", teamA)}
            ${renderTeamSlot(fid, "B", teamB)}
          </div>
        </div>`;
    }).join("");
  }

  function buildTeamSummary(flightId, flightPos) {
    const list = playersInFlight(flightId, flightPos);
    if (!list.length) return { pairingId: "", count: 0, names: [] };
    const pid = String(list[0].pairingId || "");
    return { pairingId: pid, count: list.length, names: list.map(p => p.name) };
  }

  // Formats: "Pair-3 • Smith, Jones Eagles" (all same team) or
  //          "Pair-3 • Smith Eagles, Jones Hawks" (mixed)
  // Falls back to no team suffix when teamConfig is null.
  function formatPairingLabel(pairingId, players) {
    const pid = parseInt(pairingId, 10);
    const prefix = `Pair-${pid}`;
    if (!players.length) return prefix;

    if (!state.teamConfig) {
      return `${prefix} • ${players.map(p => p.lname || p.name).join(", ")}`;
    }

    const teamNames = players.map(p => resolveTeamName(p.team, state.teamConfig));
    const allSame = teamNames.every(t => t && t === teamNames[0]);

    if (allSame && teamNames[0]) {
      const names = players.map(p => p.lname || p.name).join(", ");
      return `${prefix} • ${teamNames[0]} • ${names}`;
    }

    const parts = players.map((p, i) => {
      const name = p.lname || p.name;
      return teamNames[i] ? `${name} ${teamNames[i]}` : name;
    });
    return `${prefix} • ${parts.join(", ")}`;
  }

  function renderTeamSlot(flightId, flightPos, team) {
    const isTarget = (state.targetFlightId === String(flightId) && state.targetFlightPos === String(flightPos));
    const label = flightPos === "A" ? "Side A" : "Side B";

    let info = label;
    let hasPairing = false;

    if (team.pairingId) {
      hasPairing = true;
      const rows = playersInPairing(team.pairingId);
      const phVals = rows.map(p => parseInt(p.ph || "0", 10)).filter(n => !isNaN(n));
      const sumPH = phVals.reduce((a, b) => a + b, 0);
      const avgPH = phVals.length ? (sumPH / phVals.length).toFixed(1) : "0.0";
      const pairingLabel = formatPairingLabel(team.pairingId, rows);
      info = `${label} • Avg ${avgPH} • ${pairingLabel}`;
    } else {
      info = `${label} (Empty)`;
    }

    return `
      <div class="gpCardRow ${isTarget ? "is-selected" : ""}" data-action="selectFlightSlot" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}">
        <button type="button" class="iconBtn btnPrimary gpCardRow__del" ${hasPairing ? `data-action="removePairingFromFlight" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}" data-pairing-id="${esc(team.pairingId)}"` : ''} aria-label="Remove pairing from flight">
           ${hasPairing ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` : ""}
        </button>
        <div class="gpCardRow__info" data-action="toggle-truncate" title="${esc(info)}">${esc(info)}</div>
      </div>`;
  }

  function renderUnmatchedList() {
    const host = el.unmatchedList;
    const countEl = el.unmatchedCount;
    const q = String(el.unmatchedSearch?.value || "").trim().toLowerCase();

    if (!host) return;

    const unmatchedPairingIds = getUnmatchedPairingIds();
    const rows = unmatchedPairingIds
      .map(pid => ({ pairingId: pid, players: playersInPairing(pid) }))
      .filter(r => !q || String(r.pairingId).includes(q) || r.players.map(p => p.name + " " + p.lname).join(" ").toLowerCase().includes(q))
      .sort((a, b) => parseInt(a.pairingId, 10) - parseInt(b.pairingId, 10));

    if (countEl) countEl.textContent = `${rows.length}`;

    const renderRow = (r) => {
      const sel = state.selectedPairingIds.has(String(r.pairingId));
      const cls = sel ? "maListRow is-selected" : "maListRow";
      const checkHtml = sel
        ? `<div class="gpRowCheck is-selected"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`
        : `<div class="gpRowCheck"></div>`;
      const label = formatPairingLabel(r.pairingId, r.players);
      return `
        <div class="${cls}" data-action="selectUnmatched" data-pairing-id="${esc(r.pairingId)}">
          ${checkHtml}
          <div class="maListRow__col">${esc(label)}</div>
        </div>`;
    };

    const hasFlights = !!(state.flightConfig && Array.isArray(state.flightConfig.flights) && state.flightConfig.flights.length);
    const hasTeams = !!state.teamConfig;

    if (!hasFlights && !hasTeams) {
      host.innerHTML = rows.map(renderRow).join("") || `<div class="maEmpty">No unmatched pairings.</div>`;
      return;
    }

    // A pairing is homogeneous (single team, single flight) by construction
    // — the §2 clamp on assignSelectedPlayerToPairing guarantees this for
    // any pairing created going forward. Group key is read from the first
    // player as the pairing's representative, same convention already used
    // by buildTeamSummary()/formatPairingLabel() elsewhere on this page.
    const teamOf = (r) => r.players[0]?.team || "";
    const flightOf = (r) => r.players[0]?.flightKey || "";

    const renderTeamGroups = (list, flightGroupKey) => {
      if (!hasTeams) return list.length ? list.map(renderRow).join("") : "";
      let out = "";
      const unassigned = list.filter(r => !teamOf(r));
      if (unassigned.length) {
        const key = flightGroupKey ? `${flightGroupKey}|__none__` : "__none__";
        out += renderTrayGroupHeader("Unassigned", unassigned.length, key, state.unmatchedCollapsedGroups, "unmatched", "pairing");
        out += renderTrayGroupBody(key, state.unmatchedCollapsedGroups, unassigned.map(renderRow).join(""));
      }
      [...state.teamConfig.teams]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach(t => {
          const group = list.filter(r => teamOf(r) === t.id);
          if (!group.length) return;
          const key = flightGroupKey ? `${flightGroupKey}|${t.id}` : t.id;
          out += renderTrayGroupHeader(t.name, group.length, key, state.unmatchedCollapsedGroups, "unmatched", "pairing");
          out += renderTrayGroupBody(key, state.unmatchedCollapsedGroups, group.map(renderRow).join(""));
        });
      return out;
    };

    if (!hasFlights) {
      host.innerHTML = renderTeamGroups(rows, "") || `<div class="maEmpty">No unmatched pairings.</div>`;
      return;
    }

    let html = "";
    const unassignedFlight = rows.filter(r => !flightOf(r));
    if (unassignedFlight.length) {
      html += renderTrayGroupHeader("Unassigned", unassignedFlight.length, "__noflight__", state.unmatchedCollapsedGroups, "unmatched", "pairing");
      html += renderTrayGroupBody("__noflight__", state.unmatchedCollapsedGroups, renderTeamGroups(unassignedFlight, "__noflight__"));
    }
    [...state.flightConfig.flights]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .forEach(f => {
        const group = rows.filter(r => flightOf(r) === f.id);
        if (!group.length) return;
        html += renderTrayGroupHeader(f.name, group.length, f.id, state.unmatchedCollapsedGroups, "unmatched", "pairing");
        html += renderTrayGroupBody(f.id, state.unmatchedCollapsedGroups, renderTeamGroups(group, f.id));
      });

    host.innerHTML = html || `<div class="maEmpty">No unmatched pairings.</div>`;
  }

  function getUnmatchedPairingIds() {
    // Pairing exists (not 000) but has no flightId (across its players)
    const ids = Array.from(new Set(state.players.map(p => String(p.pairingId || "000"))))
      .filter(pid => pid !== "000")
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return ids.filter(pid => {
      const rows = playersInPairing(pid);
      const anyFlight = rows.some(p => String(p.flightId || "").trim() !== "");
      return !anyFlight;
    });
  }

  // ---- Actions: Pairing tab ----
  function selectUnpaired(ghin) {
    const id = String(ghin || "");
    if (state.selectedPlayerGHINs.has(id)) {
      state.selectedPlayerGHINs.delete(id);
    } else {
      if (state.selectedPlayerGHINs.size >= 4) return setStatus("Maximum 4 players selected.", "warn");
      state.selectedPlayerGHINs.add(id);
    }
    renderUnpairedList();
    setHints();
    if (isMobile() && isTrayOpen()) applyTrayChrome();
  }

  function toggleEditMode(pid) {
    if (pairingsLockedByEvent()) {
      showBlockedModal("Pairings are managed at the event level for this event.");
      return;
    }
    const id = String(pid || "");
    if (state.editMode && state.targetPairingId === id) {
      // Toggling off
      state.editMode = false;
      state.targetPairingId = "";
      setStatus("Edit mode cancelled.", "info");
    } else {
      // Toggling on
      state.editMode = true;
      state.targetPairingId = id;
      setStatus(`Editing Pairing ${id}. Select players to add.`, "info");
      
      // Mobile UX: Auto-open tray to show players to add
      if (isMobile()) {
        const panel = el.unpairedList?.closest(".gpTabPanel");
        if (panel && !panel.classList.contains("is-tray-open")) toggleMobileTray();
      }
    }
    renderPairingsCanvas();
    setHints();
  }

  function toggleFlightEditMode(fid) {
    const id = String(fid || "");
    if (state.editMode && state.targetFlightId === id) {
      // Toggling off
      state.editMode = false;
      state.targetFlightId = "";
      state.targetFlightPos = "";
      setStatus("Edit mode cancelled.", "info");
    } else {
      // Toggling on
      state.editMode = true;
      state.targetFlightId = id;
      
      // Smart default: pick first empty slot
      const teamA = buildTeamSummary(id, "A");
      state.targetFlightPos = (!teamA.pairingId) ? "A" : "B";

      setStatus(`Editing Match ${id}. Select pairings to add.`, "info");
      
      // Mobile UX: Auto-open tray to show pairings to add
      if (isMobile()) {
        const panel = el.unmatchedList?.closest(".gpTabPanel");
        if (panel && !panel.classList.contains("is-tray-open")) toggleMobileTray();
      }
    }
    renderFlightsCanvas();
    setHints();
  }

  function assignSelectedPlayerToPairing() {
    if (pairingsLockedByEvent()) {
      showBlockedModal("Pairings are managed at the event level for this event.");
      return;
    }
    if (state.selectedPlayerGHINs.size === 0) return setStatus("Select unpaired players first.", "warn");
    
    let pid = state.targetPairingId;
    let isNew = false;
    // If no target selected, create new pairing
    if (!pid) {
      pid = nextPairingId();
      isNew = true;
    }

    const existingRows = playersInPairing(pid);

    // Boundary clamp: every player in the selected group — plus any
    // existing occupants of the target pairing — must share the same
    // team AND the same flightKey. All-or-nothing: if anyone mismatches,
    // skip the whole group, nothing gets seated. Reference comes from
    // existing occupants when adding to an already-seated pairing (its
    // boundary is already established and can't be overridden by a new
    // selection); otherwise from the selected group itself. Blank team/
    // flightKey ("") is treated as its own value — two unassigned players
    // match each other, but not an assigned one.
    const selectedPlayers = Array.from(state.selectedPlayerGHINs)
      .map(ghin => getPlayerByGHIN(ghin))
      .filter(Boolean);
    const referencePlayer = existingRows[0] || selectedPlayers[0];
    if (referencePlayer) {
      const refTeam = referencePlayer.team || "";
      const refFlight = referencePlayer.flightKey || "";
      const mismatch = selectedPlayers.some(p => (p.team || "") !== refTeam || (p.flightKey || "") !== refFlight);
      if (mismatch) {
        return setStatus("Selected players don't share the same team and flight — nothing was paired.", "warn");
      }
    }

    // Gap Filling: Find first available slots (1, 2, 3, 4)
    const usedPos = new Set(existingRows.map(p => parseInt(p.pairingPos, 10)).filter(n => n > 0));
    const slots = [];
    let cursor = 1;
    while (slots.length < state.selectedPlayerGHINs.size) {
      if (!usedPos.has(cursor)) slots.push(cursor);
      cursor++;
    }

    let slotIdx = 0;
    state.selectedPlayerGHINs.forEach(ghin => {
      const p = getPlayerByGHIN(ghin);
      if (!p) return;
    // Pair Players: Add player to existing pairing
    p.pairingId = String(pid);
    p.pairingPos = String(slots[slotIdx++] || "");

    if (isPairPair()) {
      // PairPair: follow pairing’s current Flight if already matched
      const rows = playersInPairing(pid).filter(x => String(x.playerGHIN) !== String(ghin));
      const matched = rows.find(x => String(x.flightId || "").trim() !== "");
      if (matched) {
        p.flightId = String(matched.flightId || "");
        p.flightPos = normFlightPos(matched.flightPos);
        // schedule inherits target flight
        const sched = getContainerSchedule({ type: "flight", id: p.flightId });
        p.teeTime = String(sched.teeTime || "");
        p.startHole = String(sched.startHole || "");
        p.startHoleSuffix = String(sched.startHoleSuffix || "");
        p.playerKey = String(sched.playerKey || "");
      } else {
        // unmatched
        p.flightId = "";
        p.flightPos = "";
        // preserve/blank schedule (spec: preserve/blank; we preserve player schedule if any, else blank)
        p.teeTime = String(p.teeTime || "");
        p.startHole = String(p.startHole || "");
        p.startHoleSuffix = String(p.startHoleSuffix || "");
        p.playerKey = String(p.playerKey || "");
      }
    } else {
      // PairField: inherit target pairing schedule + playerKey scope pairing
      const sched = getContainerSchedule({ type: "pairing", id: pid });
      p.teeTime = String(sched.teeTime || "");
      p.startHole = String(sched.startHole || "");
      p.startHoleSuffix = String(sched.startHoleSuffix || "");
      p.playerKey = String(sched.playerKey || "");
    }
    markDirty(ghin);
    });

    // If we were in edit mode, turn it off after assigning.
    if (state.editMode) {
      state.editMode = false;
    }

    // clear selection
    state.selectedPlayerGHINs.clear();
    state.targetPairingId = ""; // Reset target after assign
    setStatus(isNew ? `Created pairing ${pid}.` : `Added to pairing ${pid}.`, "success");
    
    // Auto-close tray on mobile if no more unpaired players
    const remaining = state.players.filter(p => String(p.pairingId || "000") === "000").length;
    if (isMobile() && remaining === 0) toggleMobileTray();

    render();
  }

  function removePlayerFromPairing(ghin) {
    if (pairingsLockedByEvent()) {
      showBlockedModal("Pairings are managed at the event level for this event.");
      return;
    }
    const p = getPlayerByGHIN(ghin);
    if (!p) return;
    // Remove 1 player from pairing
    p.pairingId = "000";
    p.pairingPos = "";
    if (isPairPair()) {
      p.flightId = "";
      p.flightPos = "";
    }
    p.teeTime = "";
    p.startHole = "";
    p.startHoleSuffix = "";
    p.playerKey = "";
    markDirty(ghin);
    render();
  }

  function unpairGroup(pairingId) {
    if (pairingsLockedByEvent()) {
      showBlockedModal("Pairings are managed at the event level for this event.");
      return;
    }
    const pid = String(pairingId || "");
    const rows = playersInPairing(pid);
    rows.forEach(p => {
      p.pairingId = "000";
      p.pairingPos = "";
      if (isPairPair()) {
        p.flightId = "";
        p.flightPos = "";
      }
      p.teeTime = "";
      p.startHole = "";
      p.startHoleSuffix = "";
      p.playerKey = "";
      markDirty(p.playerGHIN);
    });
    render();
  }

  // ---- Actions: Match tab ----
  function selectUnmatchedPairing(pid) {
    const id = String(pid || "");
    if (state.selectedPairingIds.has(id)) {
      state.selectedPairingIds.delete(id);
    } else {
      if (state.selectedPairingIds.size >= 2) return setStatus("Maximum 2 pairings selected.", "warn");
      state.selectedPairingIds.add(id);
    }
    renderUnmatchedList();
    setHints();
    if (isMobile() && isTrayOpen()) applyTrayChrome();
  }

  function selectFlightSlot(flightId, flightPos) {
    state.targetFlightId = String(flightId || "");
    state.targetFlightPos = normFlightPos(flightPos);
    renderFlightsCanvas();
    setHints();
  }

  function assignSelectedPairingToFlight() {
    if (!isPairPair()) return;
    if (state.selectedPairingIds.size === 0) return setStatus("Select unmatched pairings first.", "warn");
    
    let fid = state.targetFlightId;
    let fp = state.targetFlightPos;
    let isNew = false;

    // Create new match if no target selected
    if (!fid) {
      fid = nextFlightId();
      fp = "A";
      isNew = true;
    }

    if (!isNew && !fp) return setStatus("Tap a match slot (Side A/B) first.", "warn");

    // If targeting specific slot, enforce single selection
    if (!isNew && state.selectedPairingIds.size > 1) {
      return setStatus("Select only 1 pairing for a specific match slot.", "warn");
    }

    // If new, allow max 2
    if (isNew && state.selectedPairingIds.size > 2) {
      return setStatus("Maximum 2 pairings for a new match.", "warn");
    }

    // Check collision if not new
    if (!isNew) {
      const existing = buildTeamSummary(fid, fp);
      if (existing && existing.pairingId) {
        return setStatus(`That slot already has pairing ${existing.pairingId}. Remove it first.`, "warn");
      }
    }

    const pids = Array.from(state.selectedPairingIds);

    // Boundary clamp: the two pairings occupying a match's Side A / Side B
    // must share the same flightKey. The "different team" half only
    // applies when teams are actually in use on this game right now
    // (teamsActive() — see its own comment; teamConfig alone isn't enough,
    // since Clear All in Manage Teams leaves config in place while
    // blanking every player). Without active teams, MatchPos (Side A/B)
    // IS the team distinction, assigned by which pairing the user clicked
    // first/second, not read from an independent team fact. Checking team
    // equality in that case would be circular (every player's team is
    // blank, so "same team" would always be true) and would block every
    // match. A pairing is already guaranteed single-team/single-flight by
    // assignSelectedPlayerToPairing's own clamp, so this runs at the
    // pairing level, not per-player. No auto-match exists here, so this is
    // a single commit-time gate, not a structural engine fix.
    const referenceFor = (pairingId) => playersInPairing(pairingId)[0] || null;
    const violatesBoundary = (a, b) => {
      if (!a || !b) return false; // nothing to compare yet — no violation possible
      const sameFlight = (a.flightKey || "") === (b.flightKey || "");
      if (!sameFlight) return true;
      if (!teamsActive()) return false; // no active teams — MatchPos IS the team; nothing else to check
      const sameTeam = (a.team || "") === (b.team || "");
      return sameTeam;
    };

    const boundaryMessageGroup = teamsActive()
      ? "must share a flight and belong to different teams"
      : "must share a flight";
    const boundaryMessageSingle = teamsActive()
      ? "must share a flight and belong to a different team than the other side"
      : "must share a flight with the other side";

    if (isNew && pids.length === 2) {
      if (violatesBoundary(referenceFor(pids[0]), referenceFor(pids[1]))) {
        return setStatus(`These two pairings ${boundaryMessageGroup} — nothing was matched.`, "warn");
      }
    } else {
      // Single-slot assignment — compare against whatever already occupies
      // the OTHER side of this match container, if anything does.
      const otherFp = fp === "A" ? "B" : "A";
      const otherSummary = buildTeamSummary(fid, otherFp);
      if (otherSummary && otherSummary.pairingId) {
        if (violatesBoundary(referenceFor(otherSummary.pairingId), referenceFor(pids[0]))) {
          return setStatus(`This pairing ${boundaryMessageSingle} — nothing was matched.`, "warn");
        }
      }
    }

    // Helper to assign one pairing
    const doAssign = (pid, slot) => {
      const rows = playersInPairing(pid);
      const sched = getContainerSchedule({ type: "flight", id: fid });
      rows.forEach(p => {
        p.flightId = String(fid);
        p.flightPos = slot;
        p.teeTime = String(sched.teeTime || "");
        p.startHole = String(sched.startHole || "");
        p.startHoleSuffix = String(sched.startHoleSuffix || "");
        p.playerKey = String(sched.playerKey || "");
        markDirty(p.playerGHIN);
      });
    };

    if (isNew && pids.length === 2) {
      doAssign(pids[0], "A");
      doAssign(pids[1], "B");
      setStatus(`Created Match ${fid} with Pairings ${pids[0]} & ${pids[1]}.`, "success");
      state.targetFlightId = "";
      state.targetFlightPos = "";
    } else {
      // Single assignment
      doAssign(pids[0], fp);
      if (isNew) {
        setStatus(`Created Match ${fid}. Assigned Pairing ${pids[0]} to Side A.`, "success");
        // Auto-advance to B for convenience
        state.targetFlightId = fid;
        state.targetFlightPos = "B";
      } else {
        setStatus(`Assigned Pairing ${pids[0]} to Match ${fid} Team ${fp === "A" ? "A" : "B"}.`, "success");
        state.targetFlightId = "";
        state.targetFlightPos = "";
      }
    }

    state.selectedPairingIds.clear();
    
    if (state.editMode) {
      state.editMode = false;
    }
    
    // Auto-close tray on mobile if no more unmatched pairings
    const remaining = getUnmatchedPairingIds().length;
    if (isMobile() && remaining === 0) toggleMobileTray();

    render();
  }

  function removePairingFromFlight(flightId, flightPos, pairingId) {
    const pid = String(pairingId || "");
    const rows = playersInPairing(pid);
    rows.forEach(p => {
      p.flightId = "";
      p.flightPos = "";
      p.teeTime = "";
      p.startHole = "";
      p.startHoleSuffix = "";
      p.playerKey = "";
      markDirty(p.playerGHIN);
    });
    render();
  }

  function unmatchFlight(flightId) {
    const fid = String(flightId || "");
    state.players
      .filter(p => String(p.flightId) === fid)
      .forEach(p => {
        p.flightId = "";
        p.flightPos = "";
        p.teeTime = "";
        p.startHole = "";
        p.startHoleSuffix = "";
        p.playerKey = "";
        markDirty(p.playerGHIN);
      });
    render();
  }

  // ---- Save / API ----
  function buildAssignmentsPayload() {
    const dirtyGHINs = Array.from(state.dirty);
    const assignments = dirtyGHINs
      .map(ghin => {
        const p = getPlayerByGHIN(ghin);
        if (!p) return null;
        const pairingId = pad3(p.pairingId);
        const isUnpaired = pairingId === "000";
        return {
          playerGHIN: String(p.playerGHIN),
          isDirty: true,
          pairingId,
          pairingPos: isUnpaired ? "" : String(p.pairingPos || ""),
          flightId: String(p.flightId || ""),
          flightPos: normFlightPos(p.flightPos),
          teeTime: String(p.teeTime || ""),
          startHole: String(p.startHole || ""),
          startHoleSuffix: String(p.startHoleSuffix || ""),
          playerKey: String(p.playerKey || ""),
        };
      })
      .filter(Boolean);

    return {
      ggid: String(state.ggid || ""),
      assignments,
    };
  }

  async function doSave() {
    if (state.busy) return;
    if (!state.dirty.size) return setStatus("No changes to save.", "info");

    // Pre-save validation: PairPair max 2 per pairing
    if (isPairPair()) {
      const pairingCounts = {};
      state.players.forEach(p => {
        const pid = String(p.pairingId || "000");
        if (pid !== "000") {
          pairingCounts[pid] = (pairingCounts[pid] || 0) + 1;
        }
      });
      const badPairing = Object.keys(pairingCounts).find(pid => pairingCounts[pid] > 2);
      if (badPairing) {
        return setStatus(`Cannot save: Pairing ${badPairing} has more than 2 players (Match Play limit).`, "danger");
      }
    }

    setBusy(true);
    setStatus("Saving pairings…", "info");

    try {
      const payload = buildAssignmentsPayload();
      const res = await MA.postJson(`${apiBase}/savePairings.php`, payload);
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      // Rehydrate canonical DB truth
      if (Array.isArray(res.payload?.players)) {
        state.players = normalizePlayers(res.payload.players);
      }

      // Trigger-4: Recalculate handicaps (Pass-A + Pass-B)
      if (MA.recalculateHandicaps) {
        const ok = await MA.recalculateHandicaps(apiGHIN);
        if (ok) {
          window.location.reload(); // Refresh UI with new PH/SO values
          return;
        }
      }

      clearDirty();
      render();
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
    }
  }

  // ---- Wire events ----
  function wireEvents() {
    if (el.tabs) {
      el.tabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".maSegBtn");
        if (btn && !btn.disabled) setActiveTab(btn.dataset.tab);
      });
    }

    if (el.btnPairToggleAll) el.btnPairToggleAll.addEventListener("click", toggleAllCards);
    if (el.btnMatchToggleAll) el.btnMatchToggleAll.addEventListener("click", toggleAllCards);

    if (el.btnTrayPair) el.btnTrayPair.addEventListener("click", toggleMobileTray);
    if (el.btnTrayMatch) el.btnTrayMatch.addEventListener("click", toggleMobileTray);

    if (el.mobileCloseBtns) {
      el.mobileCloseBtns.forEach(btn => btn.addEventListener("click", toggleMobileTray));
    }

    // Search fields
    if (el.unpairedSearch) {
      el.unpairedSearch.addEventListener("input", () => {
        renderUnpairedList();
        el.unpairedSearchClear?.classList.toggle("isHidden", !el.unpairedSearch.value);
      });
    }
    if (el.unpairedSearchClear) {
      el.unpairedSearchClear.addEventListener("click", () => {
        if (el.unpairedSearch) el.unpairedSearch.value = "";
        el.unpairedSearchClear.classList.add("isHidden");
        renderUnpairedList();
      });
    }
    if (el.unmatchedSearch) {
      el.unmatchedSearch.addEventListener("input", () => {
        renderUnmatchedList();
        el.unmatchedSearchClear?.classList.toggle("isHidden", !el.unmatchedSearch.value);
      });
    }
    if (el.unmatchedSearchClear) {
      el.unmatchedSearchClear.addEventListener("click", () => {
        if (el.unmatchedSearch) el.unmatchedSearch.value = "";
        el.unmatchedSearchClear.classList.add("isHidden");
        renderUnmatchedList();
      });
    }

    // Master Checkboxes (Clear Only)
    const clearSelection = () => {
      if (state.activeTab === "pair") state.selectedPlayerGHINs.clear();
      else state.selectedPairingIds.clear();
      render();
      if (isMobile() && isTrayOpen()) applyTrayChrome();
    };
    if (el.unpairedMasterCheck) el.unpairedMasterCheck.addEventListener("click", clearSelection);
    if (el.unmatchedMasterCheck) el.unmatchedMasterCheck.addEventListener("click", clearSelection);

    // Sort control
    if (el.unpairedSort) {
      el.unpairedSort.addEventListener("click", (e) => {
        const btn = e.target.closest(".gpSortBtn");
        if (!btn) return;
        el.unpairedSort.querySelectorAll(".gpSortBtn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.sortMode = btn.dataset.sort;
        renderUnpairedList();
      });
    }

    // Buttons
    if (el.btnAssignToPairing) el.btnAssignToPairing.addEventListener("click", assignSelectedPlayerToPairing);

    if (el.btnAssignToFlight) el.btnAssignToFlight.addEventListener("click", assignSelectedPairingToFlight);

    // Delegated clicks for dynamic lists / cards
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const action = a.dataset.action;

      if (action === "toggle-collapse") {
        const card = a.closest(".gpGroupCard");
        if (card) {
          card.classList.toggle("is-collapsed");
        }
        return;
      }
      if (action === "toggle-tray-group") {
        const tray = a.dataset.tray;
        const key = a.dataset.groupKey;
        const set = tray === "unmatched" ? state.unmatchedCollapsedGroups : state.unpairedCollapsedGroups;
        if (set.has(key)) set.delete(key); else set.add(key);
        if (tray === "unmatched") renderUnmatchedList(); else renderUnpairedList();
        return;
      }
      if (action === "toggle-truncate") {
        // Only toggle if the text is actually overflowing
        if (a.scrollWidth > a.clientWidth) {
          a.classList.toggle("is-expanded");
        }
        return;
      }

      if (action === "selectUnpaired") {
        selectUnpaired(a.dataset.ghin);
        return;
      }
      if (action === "editFlight") {
        toggleFlightEditMode(a.dataset.flightId);
        return;
      }
      if (action === "editPairing") {
        toggleEditMode(a.dataset.pairingId);
        return;
      }
      if (action === "removeFromPair") {
        removePlayerFromPairing(a.dataset.ghin);
        return;
      }
      if (action === "unpairGroup") {
        const pid = a.dataset.pairingId;
        unpairGroup(pid);
        return;
      }

      if (action === "selectUnmatched") {
        selectUnmatchedPairing(a.dataset.pairingId);
        return;
      }
      if (action === "selectFlightSlot") {
        selectFlightSlot(a.dataset.flightId, a.dataset.flightPos);
        return;
      }
      if (action === "removePairingFromFlight") {
        const fid = a.dataset.flightId;
        const fp = a.dataset.flightPos;
        const pid = a.dataset.pairingId;
        removePairingFromFlight(fid, fp, pid);
        return;
      }
      if (action === "unmatchFlight") {
        const fid = a.dataset.flightId;
        unmatchFlight(fid);
        return;
      }
    });
  }

  // ---- Hydration ----
  function normalizePlayers(rows) {
    return (rows || []).map(r => {
      const ghin = String(r.dbPlayers_PlayerGHIN ?? r.playerGHIN ?? "");
      const name = String(r.dbPlayers_Name ?? r.name ?? "");
      return {
        playerGHIN: ghin,
        name,
        lname: String(r.dbPlayers_LName ?? r.lname ?? ""),
        teeSetName: String(r.dbPlayers_TeeSetName ?? r.teeSetName ?? ""),
        hi: String(r.dbPlayers_HI ?? r.hi ?? ""),
        ch: String(r.dbPlayers_CH ?? r.ch ?? ""),
        ph: String(r.dbPlayers_PH ?? r.ph ?? ""),
        so: String(r.dbPlayers_SO ?? r.so ?? "0"),
        pairingId: pad3(r.dbPlayers_PairingID ?? r.pairingId ?? "000"),
        pairingPos: String(r.dbPlayers_PairingPos ?? r.pairingPos ?? ""),
        flightId: String(r.dbPlayers_MatchID ?? r.flightId ?? "").trim(),
        flightPos: normFlightPos(r.dbPlayers_MatchPos ?? r.flightPos ?? ""),
        teeTime: String(r.dbPlayers_TeeTime ?? r.teeTime ?? ""),
        startHole: String(r.dbPlayers_StartHole ?? r.startHole ?? ""),
        startHoleSuffix: String(r.dbPlayers_StartHoleSuffix ?? r.startHoleSuffix ?? ""),
        playerKey: String(r.dbPlayers_PlayerKey ?? r.playerKey ?? ""),
        // Team assignment — stable slot ID ('T1', 'T2', or '').
        // Display name is resolved at render time from teamConfig; never stored here.
        team: String(r.dbPlayers_TeamKey ?? r.team ?? ""),
        // Flight assignment (dbPlayers_FlightKey) — the Men's/Women's-style
        // grouping used by the boundary clamp and MA.runAutoPair. NOT the
        // same as flightId/flightPos above (Match tab Side A/B container).
        // Display name resolved at render time from state.flightConfig.
        flightKey: String(r.dbPlayers_FlightKey ?? r.flightKey ?? ""),
      };
    });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  // Past tense, no "go check" language — unlike Manage Teams/Define
  // Flights' equivalent notice, the user is already ON the Pairings page
  // by the time this shows, and the fix already happened server-side
  // (workflow_ReconcilePairingBoundaries.php, run at load in
  // gamepairings.php before the initial player fetch). Deliberately
  // terse, same as the Manage Teams/Define Flights version — no
  // player/pairing detail dump.
  function warnReconciledOnLoad() {
    const overlay = document.createElement("div");
    overlay.className = "maModalOverlay is-open";
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="gpReconciledTitle">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div id="gpReconciledTitle" class="maModal__title">Pairings Updated</div>
          </div>
        </header>
        <div class="maModal__body">
          <p style="line-height:1.6;">
            Some pairings were reset because team or flight assignments changed since they were last set.
          </p>
        </div>
        <footer class="maModal__ftr" style="justify-content:flex-end;">
          <div class="maModal__ftrActions">
            <button type="button" class="maFtrBtn maFtrBtn--save" id="gpReconciledOk">OK</button>
          </div>
        </footer>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#gpReconciledOk")?.addEventListener("click", () => overlay.remove());
  }

  function initialize() {
    if (!init || !init.ok) {
      setStatus("Failed to load game context.", "error");
      console.error("Missing or invalid __MA_INIT__ payload.", init);
      return;
    }

    state.ggid = init.ggid;
    state.game = init.game || {};
    state.competition = String(state.game.dbGames_Competition || state.game.dbgames_competition || "");
    state.players = normalizePlayers(init.players || init.gamePlayers || []);
    // teamConfig: parsed from the game record (dbGames_TeamConfig is a JSON column on db_Games).
    // The full game row is already in init.game — no separate initPayload key needed.
    // Valid only when exactly 2 teams are configured; null otherwise.
    const rawTeamConfig = init.game && init.game.dbGames_TeamConfig
      ? (typeof init.game.dbGames_TeamConfig === "string"
          ? (() => { try { return JSON.parse(init.game.dbGames_TeamConfig); } catch(e) { return null; } })()
          : init.game.dbGames_TeamConfig)
      : null;
    state.teamConfig = (rawTeamConfig && Array.isArray(rawTeamConfig.teams) && rawTeamConfig.teams.length === 2)
      ? rawTeamConfig
      : null;

    // flightConfig: dbPlayers_FlightKey grouping (e.g. Men/Women), parsed the
    // same way as teamConfig above — but with NO 2-item cap. A game can have
    // any number of flights (or none). Distinct from targetFlightId/
    // targetFlightPos (state, ~line 68), which is the unrelated Match
    // Pairings Side A/B container — see the comment on state.flightConfig.
    const rawFlightConfig = init.game && init.game.dbGames_FlightConfig
      ? (typeof init.game.dbGames_FlightConfig === "string"
          ? (() => { try { return JSON.parse(init.game.dbGames_FlightConfig); } catch(e) { return null; } })()
          : init.game.dbGames_FlightConfig)
      : null;
    state.flightConfig = (rawFlightConfig && Array.isArray(rawFlightConfig.flights) && rawFlightConfig.flights.length > 0)
      ? rawFlightConfig
      : null;

    // Unassigned players are no longer excluded here. Two guarantees make
    // that safe: workflow_ReconcilePairingBoundaries runs server-side
    // (gamepairings.php) before $players is even fetched, so a pairing
    // containing an unassigned player would already have been reset before
    // this page saw it — an unassigned player reaching here is guaranteed
    // NOT to be sitting in a live pairing. And assignSelectedPlayerToPairing's
    // own clamp already halts any attempt to pair them with a team-assigned
    // player (blank only matches blank), so nothing downstream depends on
    // them being hidden. They now render normally in the Unassigned group
    // of the nested tray grouping (§4), same as any other team.

    // Server already reconciled (see gamepairings.php) before this payload
    // was built — state.players reflects the post-reset state already.
    // This just tells the user it happened.
    if (Array.isArray(init.reconciled) && init.reconciled.length) {
      warnReconciledOnLoad();
    }

    applyChrome();
    wireEvents();

    // Move Assign buttons to controls area on desktop only.
    // On mobile the chrome footer Assign button owns this action.
    if (!isMobile()) {
      const pairTray = el.unpairedList.closest('.maPanel');
      if (pairTray && el.btnAssignToPairing) {
        pairTray.querySelector('.maPanel__controls').appendChild(el.btnAssignToPairing);
        el.btnAssignToPairing.classList.add('btn', 'btnSecondary');
      }

      const matchTray = el.unmatchedList.closest('.maPanel');
      if (matchTray && el.btnAssignToFlight) {
        matchTray.querySelector('.maPanel__controls').appendChild(el.btnAssignToFlight);
        el.btnAssignToFlight.classList.add('btn', 'btnSecondary');
      }
    }

    setActiveTab("pair");
    clearDirty();
    setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();