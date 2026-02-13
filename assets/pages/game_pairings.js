/* /assets/pages/game_pairings.js
   Game Pairings page controller (GoDaddy).
   - Hydrates from window.__MA_INIT__
   - Desktop: 2-panel (canvas + tray)
   - Mobile: 1-panel + drawer tray
   - Persists to db_Players via /api/game_pairings/savePairings.php
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__MA_INIT__ || window.__INIT__ || {};

  const routes = MA.routes || {};
  const apiBase = routes.apiGamePairings || "/api/game_pairings";

  // ---- DOM ----
  const el = {
    tabs: document.getElementById("gpTabs"),
    tabMatchBtn: document.getElementById("gpTabMatch"),
    panelsWrap: document.getElementById("gpTabPanels"),
    // Pair tab
    pairingsCanvas: document.getElementById("gpPairingsCanvas"),
    unpairedList: document.getElementById("gpUnpairedList"),
    unpairedCount: document.getElementById("gpUnpairedCount"),
    unpairedSearch: document.getElementById("gpUnpairedSearch"),
    unpairedSearchClear: document.getElementById("gpUnpairedSearchClear"),
    unpairedMasterCheck: document.getElementById("gpUnpairedMasterCheck"),
    unpairedSort: document.getElementById("gpUnpairedSort"),
    hintPair: document.getElementById("gpHintPair"),
    btnAssignToPairing: document.getElementById("gpBtnAssignToPairing"),
    // Match tab
    flightsCanvas: document.getElementById("gpFlightsCanvas"),
    unmatchedList: document.getElementById("gpUnmatchedList"),
    unmatchedCount: document.getElementById("gpUnmatchedCount"),
    unmatchedSearch: document.getElementById("gpUnmatchedSearch"),
    unmatchedSearchClear: document.getElementById("gpUnmatchedSearchClear"),
    unmatchedMasterCheck: document.getElementById("gpUnmatchedMasterCheck"),
    hintMatch: document.getElementById("gpHintMatch"),
    btnAssignToFlight: document.getElementById("gpBtnAssignToFlight"),
    // Drawer
    btnTray: document.getElementById("gpBtnTray"),
    drawerOverlay: document.getElementById("gpDrawerOverlay"),
    drawerTitle: document.getElementById("gpDrawerTitle"),
    drawerSearch: document.getElementById("gpDrawerSearch"),
    drawerSearchClear: document.getElementById("gpDrawerSearchClear"),
    drawerMasterCheck: document.getElementById("gpDrawerMasterCheck"),
    drawerList: document.getElementById("gpDrawerList"),
    btnCloseDrawer: document.getElementById("gpBtnCloseDrawer"),
    btnDrawerClear: document.getElementById("gpBtnDrawerClear"),
    btnDrawerAssign: document.getElementById("gpBtnDrawerAssign"),
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
    // Dirty map by GHIN
    dirty: new Set(),
    busy: false,
  };

  // ---- Utils ----
  function setStatus(msg, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(msg, level);
    else if (msg) console.log("[STATUS]", level || "info", msg);
  }

  function setBusy(on) {
    state.busy = !!on;
    const saveBtn = document.getElementById("chromeBtnRight");
    if (saveBtn) saveBtn.disabled = state.busy;
  }

  function isPairPair() {
    return String(state.competition || "") === "PairPair";
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

  function openDrawer() {
    if (!el.drawerOverlay) return;
    el.drawerOverlay.classList.add("is-open");
    el.drawerOverlay.setAttribute("aria-hidden", "false");
    // sync drawer content to active tab
    syncDrawer();
  }

  function closeDrawer() {
    if (!el.drawerOverlay) return;
    el.drawerOverlay.classList.remove("is-open");
    el.drawerOverlay.setAttribute("aria-hidden", "true");
  }

  function syncDrawer() {
    if (!el.drawerList || !el.drawerTitle || !el.drawerSearch) return;
    el.drawerSearch.value = "";
    if (state.activeTab === "pair") {
      el.drawerTitle.textContent = "Unpaired";
      renderUnpairedList({ intoDrawer: true });
    } else {
      el.drawerTitle.textContent = "Unmatched";
      renderUnmatchedList({ intoDrawer: true });
    }
  }

  function markDirty(ghin) {
    if (!ghin) return;
    state.dirty.add(String(ghin));
    setStatus("Unsaved changes.", "warn");
  }

  function clearDirty() {
    state.dirty.clear();
    setStatus("", "");
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
    const out = { teeTime: "", startHole: "", startHoleSuffix: "" };
    if (!scope || !scope.type || !scope.id) return out;
    const list = (scope.type === "pairing")
      ? state.players.filter(p => String(p.pairingId) === String(scope.id))
      : state.players.filter(p => String(p.flightId) === String(scope.id));

    const pick = list.find(p => (p.teeTime || p.startHole || p.startHoleSuffix));
    if (!pick) return out;
    out.teeTime = String(pick.teeTime || "");
    out.startHole = String(pick.startHole || "");
    out.startHoleSuffix = String(pick.startHoleSuffix || "");
    return out;
  }

  // ---- Chrome ----
  function applyChrome() {
    const g = state.game || {};
    const title = String(g.dbGames_Title || g.dbGames_title || "Game") || `GGID ${state.ggid}`;

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["ADMIN PORTAL", "Pairings", title]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Back", onClick: onBack },
        right: { show: true, label: "Save", onClick: doSave }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary"],
        active: "pairings",
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

    render();
    if (isMobile()) syncDrawer();
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
  }

  function setHints() {
    if (el.hintPair) {
      if (state.editMode) {
        el.hintPair.textContent = `EDIT MODE: Selected ${state.selectedPlayerGHINs.size} player(s). Tap Assign >> to add to Pairing ${state.targetPairingId}.`;
      } else {
        el.hintPair.textContent = state.selectedPlayerGHINs.size > 0
          ? `Selected ${state.selectedPlayerGHINs.size} player(s). Tap Assign >> to create new, or tap a card to add.`
          : "Select unpaired players, then tap Assign >>.";
      }
    }

    if (el.hintMatch) {
      if (!isPairPair()) {
        el.hintMatch.textContent = "Matches are disabled for Pair vs Field.";
      } else {
        if (state.editMode) {
          el.hintMatch.textContent = `EDIT MODE: Selected ${state.selectedPairingIds.size} pairing(s). Tap Assign >> to add to Match ${state.targetFlightId}.`;
        } else {
          el.hintMatch.textContent = state.selectedPairingIds.size > 0
            ? `Selected ${state.selectedPairingIds.size} pairing(s). Tap a match slot (A/B), then Assign.`
            : "Select an unmatched pairing, then tap a match slot (A/B).";
        }
      }
    }

    // Update Master Checkboxes (Clear Only)
    updateMasterCheck(el.unpairedMasterCheck, state.selectedPlayerGHINs.size > 0);
    updateMasterCheck(el.unmatchedMasterCheck, state.selectedPairingIds.size > 0);
    if (el.drawerMasterCheck) {
      const size = state.activeTab === "pair" ? state.selectedPlayerGHINs.size : state.selectedPairingIds.size;
      updateMasterCheck(el.drawerMasterCheck, size > 0);
    }
  }

  function updateMasterCheck(el, hasSelection) {
    if (!el) return;
    if (hasSelection) {
      el.classList.add("has-selection");
      // Minus icon
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`;
    } else {
      el.classList.remove("has-selection");
      el.innerHTML = "";
    }
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

      const body = rows.map(p => {
        const safeName = esc(p.name);
        const safeGHIN = esc(p.playerGHIN);
        // Row Info: TeeSet Name, HI:#, CH:#, PH:# SO:#
        const info = [
          safeName,
          p.teeSetName,
          p.hi ? `HI:${p.hi}` : "",
          p.ch ? `CH:${p.ch}` : "",
          p.ph ? `PH:${p.ph}` : "",
          (p.so && p.so !== "0") ? `SO:${p.so}` : ""
        ].filter(Boolean).join(" • ");

        return `
          <div class="gpCardRow">
            <div class="gpCardRow__del" data-action="removeFromPair" data-ghin="${safeGHIN}">X</div>
            <div class="gpCardRow__info">${esc(info)}</div>
          </div>`;
      }).join("");

      const selectedClass = (state.targetPairingId === pid) ? " is-target" : "";
      
      // Header Icons: Unpair (broken link), Edit (pencil)
      return `
        <div class="gpGroupCard${selectedClass}" data-action="selectPairing" data-pairing-id="${esc(pid)}">
          <div class="gpGroupCard__hdr">
            <div class="gpGroupCard__title" title="${esc(title)} • ${esc(meta)}">${esc(title)} • ${esc(meta)}</div>
            <div class="gpCardActions">
              <button class="gpCardActionBtn" type="button" data-action="unpairGroup" data-pairing-id="${esc(pid)}" title="Unpair">
                <svg viewBox="0 0 24 24"><path d="M2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-0.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16z"/></svg>
              </button>
              <button class="gpCardActionBtn" type="button" data-action="editPairing" data-pairing-id="${esc(pid)}" title="Edit">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
            </div>
          </div>
          <div class="gpGroupCard__body">${body}</div>
        </div>`;
    }).join("");
  }

  function renderUnpairedList(opts) {
    const intoDrawer = !!(opts && opts.intoDrawer);
    const host = intoDrawer ? el.drawerList : el.unpairedList;
    const countEl = intoDrawer ? null : el.unpairedCount;
    const q = intoDrawer ? String(el.drawerSearch?.value || "").trim().toLowerCase() : String(el.unpairedSearch?.value || "").trim().toLowerCase();

    if (!host) return;
    const rows = state.players
      .filter(p => String(p.pairingId || "000") === "000")
      .filter(p => !q || String(p.name || "").toLowerCase().includes(q) || String(p.playerGHIN).includes(q))
      .sort((a, b) => {
        if (state.sortMode === "hi") return (parseFloat(a.hi) - parseFloat(b.hi)) || a.name.localeCompare(b.name);
        if (state.sortMode === "ch") return (parseInt(a.ch) - parseInt(b.ch)) || a.name.localeCompare(b.name);
        if (state.sortMode === "so") return (parseInt(a.so) - parseInt(b.so)) || a.name.localeCompare(b.name);
        return String(a.lname).localeCompare(String(b.lname)) || String(a.name).localeCompare(String(b.name));
      });

    if (countEl) countEl.textContent = `${rows.length}`;

    host.innerHTML = rows.map(p => {
      const sel = state.selectedPlayerGHINs.has(String(p.playerGHIN));
      const cls = sel ? "maListRow is-selected" : "maListRow";
      const checkHtml = sel 
        ? `<div class="gpRowCheck is-selected"><svg viewBox="0 0 24 24" style="fill:#fff;width:16px;height:16px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>`
        : `<div class="gpRowCheck"></div>`;
      
      // Unpaired List: TeeSet Name, HI:#, CH:#, PH:# SO:# separated by dot
      // Desktop: All on 1 line. Mobile: Player+TeeSet line 1, rest line 2.
      const stats = [
        p.hi ? `HI:${p.hi}` : "",
        p.ch ? `CH:${p.ch}` : "",
        p.ph ? `PH:${p.ph}` : "",
        (p.so && p.so !== "0") ? `SO:${p.so}` : ""
      ].filter(Boolean).join(" • ");

      return `
        <div class="${cls}" data-action="selectUnpaired" data-ghin="${esc(p.playerGHIN)}">
          ${checkHtml}
          <div class="gpUnpairedItem">
            <div class="gpUnpairedItem__primary">
              ${esc(p.name)} • ${esc(p.teeSetName)}
            </div>
            <div class="gpUnpairedItem__secondary">
              <span class="gpUnpairedSep">•</span> ${esc(stats)}
            </div>
          </div>
        </div>`;
    }).join("");
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

      return `
        <div class="gpGroupCard" data-flight-id="${esc(fid)}">
          <div class="gpGroupCard__hdr">
            <div class="gpGroupCard__title" title="Match ${esc(fid)} • ${esc(meta)}">Match ${esc(fid)} • ${esc(meta)}</div>
            <div class="gpCardActions">
              <button class="gpCardActionBtn" type="button" data-action="unmatchFlight" data-flight-id="${esc(fid)}" title="Unmatch">
                <svg viewBox="0 0 24 24"><path d="M2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4L20 19.74 3.27 3 2 4.27z M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-0.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16z"/></svg>
              </button>
              <button class="gpCardActionBtn" type="button" data-action="editFlight" data-flight-id="${esc(fid)}" title="Edit">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
            </div>
          </div>
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

  function renderTeamSlot(flightId, flightPos, team) {
    const isTarget = (state.targetFlightId === String(flightId) && state.targetFlightPos === String(flightPos));
    const label = flightPos === "A" ? "Team A" : "Team B";
    
    let info = label;
    let hasPairing = false;

    if (team.pairingId) {
      hasPairing = true;
      const rows = playersInPairing(team.pairingId);
      const phVals = rows.map(p => parseInt(p.ph || "0", 10)).filter(n => !isNaN(n));
      const sumPH = phVals.reduce((a, b) => a + b, 0);
      const avgPH = phVals.length ? (sumPH / phVals.length).toFixed(1) : "0.0";
      const names = rows.map(p => p.lname).join(", ");
      info = `${label} • Group ${team.pairingId} • Sum ${sumPH} • Avg ${avgPH} • ${names}`;
    } else {
      info = `${label} (Empty)`;
    }

    return `
      <div class="gpCardRow ${isTarget ? "is-selected" : ""}" data-action="selectFlightSlot" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}">
        <div class="gpCardRow__del" ${hasPairing ? `data-action="removePairingFromFlight" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}" data-pairing-id="${esc(team.pairingId)}"` : 'style="visibility:hidden;"'}>
           ${hasPairing ? "X" : ""}
        </div>
        <div class="gpCardRow__info">${esc(info)}</div>
      </div>`;
  }

  function renderUnmatchedList(opts) {
    const intoDrawer = !!(opts && opts.intoDrawer);
    const host = intoDrawer ? el.drawerList : el.unmatchedList;
    const countEl = intoDrawer ? null : el.unmatchedCount;
    const q = intoDrawer ? String(el.drawerSearch?.value || "").trim().toLowerCase() : String(el.unmatchedSearch?.value || "").trim().toLowerCase();

    if (!host) return;

    const unmatchedPairingIds = getUnmatchedPairingIds();
    const rows = unmatchedPairingIds
      .map(pid => ({
        pairingId: pid,
        names: playersInPairing(pid).map(p => p.name)
      }))
      .filter(r => !q || String(r.pairingId).includes(q) || r.names.join(" ").toLowerCase().includes(q))
      .sort((a, b) => parseInt(a.pairingId, 10) - parseInt(b.pairingId, 10));

    if (countEl) countEl.textContent = `${rows.length}`;

    host.innerHTML = rows.map(r => {
      const sel = state.selectedPairingIds.has(String(r.pairingId));
      const cls = sel ? "maListRow is-selected" : "maListRow";
      const checkHtml = sel 
        ? `<div class="gpRowCheck is-selected"><svg viewBox="0 0 24 24" style="fill:#fff;width:16px;height:16px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>`
        : `<div class="gpRowCheck"></div>`;
      return `
        <div class="${cls}" data-action="selectUnmatched" data-pairing-id="${esc(r.pairingId)}">
          ${checkHtml}
          <div class="maListRow__col">Pairing ${esc(r.pairingId)}</div>
          <div class="maListRow__col maListRow__col--muted">${esc(r.names.slice(0, 2).join(", "))}${r.names.length > 2 ? "…" : ""}</div>
        </div>`;
    }).join("");
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
    if (isMobile()) renderUnpairedList({ intoDrawer: true });
    setHints();
  }

  function selectPairing(pid) {
    state.targetPairingId = String(pid || "");
    renderPairingsCanvas();
    setHints();
  }

  function toggleEditMode(pid) {
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
    }
    renderFlightsCanvas();
    setHints();
  }

  function assignSelectedPlayerToPairing() {
    if (state.selectedPlayerGHINs.size === 0) return setStatus("Select unpaired players first.", "warn");
    
    let pid = state.targetPairingId;
    let isNew = false;
    // If no target selected, create new pairing
    if (!pid) {
      pid = nextPairingId();
      isNew = true;
    }

    // Gap Filling: Find first available slots (1, 2, 3, 4)
    const existingRows = playersInPairing(pid);
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
      } else {
        // unmatched
        p.flightId = "";
        p.flightPos = "";
        // preserve/blank schedule (spec: preserve/blank; we preserve player schedule if any, else blank)
        p.teeTime = String(p.teeTime || "");
        p.startHole = String(p.startHole || "");
        p.startHoleSuffix = String(p.startHoleSuffix || "");
      }
      // playerKey blank until matched (server will enforce)
      p.playerKey = "";
    } else {
      // PairField: inherit target pairing schedule + playerKey scope pairing
      const sched = getContainerSchedule({ type: "pairing", id: pid });
      p.teeTime = String(sched.teeTime || "");
      p.startHole = String(sched.startHole || "");
      p.startHoleSuffix = String(sched.startHoleSuffix || "");
      // playerKey will be inherited/created on save
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
    if (isMobile()) closeDrawer();
    render();
  }

  function removePlayerFromPairing(ghin) {
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
    if (isMobile()) renderUnmatchedList({ intoDrawer: true });
    setHints();
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

    if (!isNew && !fp) return setStatus("Tap a match slot (Team A/B) first.", "warn");

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
        setStatus(`Created Match ${fid}. Assigned Pairing ${pids[0]} to Team A.`, "success");
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
    
    if (isMobile()) closeDrawer();
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
      clearDirty();
      render();
      setStatus("Saved.", "success");
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

    if (el.btnTray) el.btnTray.addEventListener("click", openDrawer);
    if (el.btnCloseDrawer) el.btnCloseDrawer.addEventListener("click", closeDrawer);
    if (el.drawerOverlay) {
      el.drawerOverlay.addEventListener("click", (e) => {
        if (e.target === el.drawerOverlay) closeDrawer();
      });
    }

    if (el.btnDrawerClear) {
      el.btnDrawerClear.addEventListener("click", () => {
        if (state.activeTab === "pair") {
          state.selectedPlayerGHIN = "";
          renderUnpairedList({ intoDrawer: true });
        } else {
          state.selectedPairingId = "";
          renderUnmatchedList({ intoDrawer: true });
        }
      });
    }
    if (el.btnDrawerAssign) {
      el.btnDrawerAssign.addEventListener("click", () => {
        // Dispatch to correct handler based on active tab
        if (state.activeTab === "pair") assignSelectedPlayerToPairing();
        else assignSelectedPairingToFlight();
      });
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

    if (el.drawerSearch) {
      el.drawerSearch.addEventListener("input", () => {
        if (state.activeTab === "pair") renderUnpairedList({ intoDrawer: true });
        else renderUnmatchedList({ intoDrawer: true });
      });
    }

    // Master Checkboxes (Clear Only)
    const clearSelection = () => {
      if (state.activeTab === "pair") state.selectedPlayerGHINs.clear();
      else state.selectedPairingIds.clear();
      render();
      if (isMobile()) syncDrawer();
    };
    if (el.unpairedMasterCheck) el.unpairedMasterCheck.addEventListener("click", clearSelection);
    if (el.unmatchedMasterCheck) el.unmatchedMasterCheck.addEventListener("click", clearSelection);
    if (el.drawerMasterCheck) el.drawerMasterCheck.addEventListener("click", () => {
      // Drawer specific clear
      clearSelection();
    });

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

      if (action === "selectUnpaired") {
        selectUnpaired(a.dataset.ghin);
        return;
      }
      if (action === "selectPairing") {
        selectPairing(a.dataset.pairingId);
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
        flightId: String(r.dbPlayers_FlightID ?? r.flightId ?? "").trim(),
        flightPos: normFlightPos(r.dbPlayers_FlightPos ?? r.flightPos ?? ""),
        teeTime: String(r.dbPlayers_TeeTime ?? r.teeTime ?? ""),
        startHole: String(r.dbPlayers_StartHole ?? r.startHole ?? ""),
        startHoleSuffix: String(r.dbPlayers_StartHoleSuffix ?? r.startHoleSuffix ?? ""),
        playerKey: String(r.dbPlayers_PlayerKey ?? r.playerKey ?? ""),
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

    applyChrome();
    wireEvents();
    setActiveTab("pair");
    clearDirty();
    setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();
