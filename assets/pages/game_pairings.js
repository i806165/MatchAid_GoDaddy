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
    hintPair: document.getElementById("gpHintPair"),
    btnAddPairing: document.getElementById("gpBtnAddPairing"),
    btnAssignToPairing: document.getElementById("gpBtnAssignToPairing"),
    btnUnpairSelected: document.getElementById("gpBtnUnpairSelected"),
    btnClearTraySelection: document.getElementById("gpBtnClearTraySelection"),
    // Match tab
    flightsCanvas: document.getElementById("gpFlightsCanvas"),
    unmatchedList: document.getElementById("gpUnmatchedList"),
    unmatchedCount: document.getElementById("gpUnmatchedCount"),
    unmatchedSearch: document.getElementById("gpUnmatchedSearch"),
    hintMatch: document.getElementById("gpHintMatch"),
    btnAddFlight: document.getElementById("gpBtnAddFlight"),
    btnAssignToFlight: document.getElementById("gpBtnAssignToFlight"),
    btnUnmatchSelected: document.getElementById("gpBtnUnmatchSelected"),
    btnClearTraySelection2: document.getElementById("gpBtnClearTraySelection2"),
    // Drawer
    btnTray: document.getElementById("gpBtnTray"),
    drawerOverlay: document.getElementById("gpDrawerOverlay"),
    drawerTitle: document.getElementById("gpDrawerTitle"),
    drawerSearch: document.getElementById("gpDrawerSearch"),
    drawerList: document.getElementById("gpDrawerList"),
    btnCloseDrawer: document.getElementById("gpBtnCloseDrawer"),
    btnDrawerClear: document.getElementById("gpBtnDrawerClear"),
  };

  // ---- State ----
  const state = {
    ggid: null,
    game: null,
    competition: "",
    players: [], // normalized
    activeTab: "pair", // pair | match

    // Tray selection
    selectedPlayerGHIN: "", // Pair tab tray selection
    selectedPairingId: "", // Match tab tray selection (pairingId)

    // Canvas selection / targets
    targetPairingId: "",
    targetFlightId: "",
    targetFlightPos: "", // A | B

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

  function nextPairingId() {
    const ids = state.players
      .map(p => parseInt(String(p.pairingId || "0"), 10))
      .filter(n => Number.isFinite(n));
    const max = ids.length ? Math.max(...ids) : 0;
    return pad3(max + 1);
  }

  function nextFlightId() {
    const ids = state.players
      .map(p => parseInt(String(p.flightId || "0"), 10))
      .filter(n => Number.isFinite(n));
    const max = ids.length ? Math.max(...ids) : 0;
    return String(max + 1);
  }

  function nextPairingPos(pairingId) {
    const rows = playersInPairing(pairingId);
    const vals = rows.map(p => parseInt(String(p.pairingPos || "0"), 10)).filter(n => Number.isFinite(n));
    const max = vals.length ? Math.max(...vals) : 0;
    return String(max + 1);
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
    state.selectedPlayerGHIN = "";
    state.selectedPairingId = "";
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
      el.hintPair.textContent = state.selectedPlayerGHIN
        ? `Selected: ${getPlayerByGHIN(state.selectedPlayerGHIN)?.name || state.selectedPlayerGHIN}. Tap a pairing card, then Assign.`
        : "Select an unpaired player, then tap a pairing card.";
    }

    if (el.hintMatch) {
      if (!isPairPair()) {
        el.hintMatch.textContent = "Matches are disabled for Pair vs Field.";
      } else {
        el.hintMatch.textContent = state.selectedPairingId
          ? `Selected group ${state.selectedPairingId}. Tap a match slot (A/B), then Assign.`
          : "Select an unmatched pairing, then tap a match slot (A/B).";
      }
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
      el.pairingsCanvas.innerHTML = `<div class="maEmpty">No pairings yet. Use “+ New Pairing” to start.</div>`;
      return;
    }

    el.pairingsCanvas.innerHTML = ids.map(pid => {
      const rows = playersInPairing(pid);
      const sched = getContainerSchedule({ type: "pairing", id: pid });
      const meta = [
        sched.teeTime ? `TT ${sched.teeTime}` : "",
        sched.startHole ? `H ${sched.startHole}${sched.startHoleSuffix || ""}` : ""
      ].filter(Boolean).join(" • ");

      const body = rows.map(p => {
        const safeName = esc(p.name);
        const safeGHIN = esc(p.playerGHIN);
        return `
          <div class="maListRow" data-player-row="1" data-ghin="${safeGHIN}">
            <div class="maListRow__col">${safeName}</div>
            <div class="maListRow__col maListRow__col--muted">${esc(p.teeSetName || "")}</div>
            <div class="maListRow__col maListRow__col--right">
              <button class="gpRowBtn" type="button" data-action="removeFromPair" data-ghin="${safeGHIN}">Remove</button>
            </div>
          </div>`;
      }).join("");

      const selectedClass = (state.targetPairingId === pid) ? " is-target" : "";
      return `
        <div class="gpGroupCard${selectedClass}" data-action="selectPairing" data-pairing-id="${esc(pid)}">
          <div class="gpGroupCard__hdr">
            <div>
              <div class="gpGroupCard__title">Pairing ${esc(pid)}</div>
              <div class="gpGroupCard__meta">${esc(meta)}</div>
            </div>
            <div>
              <button class="gpRowBtn" type="button" data-action="unpairGroup" data-pairing-id="${esc(pid)}">Unpair</button>
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
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    if (countEl) countEl.textContent = `${rows.length}`;

    host.innerHTML = rows.map(p => {
      const sel = state.selectedPlayerGHIN === String(p.playerGHIN);
      const cls = sel ? "maListRow is-selected" : "maListRow";
      return `
        <div class="${cls}" data-action="selectUnpaired" data-ghin="${esc(p.playerGHIN)}">
          <div class="maListRow__col">${esc(p.name)}</div>
          <div class="maListRow__col maListRow__col--muted">${esc(p.teeSetName || "")}</div>
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
      el.flightsCanvas.innerHTML = `<div class="maEmpty">No matches yet. Use “+ New Match” to start.</div>`;
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
            <div>
              <div class="gpGroupCard__title">Match ${esc(fid)}</div>
              <div class="gpGroupCard__meta">${esc(meta)}</div>
            </div>
            <div>
              <button class="gpRowBtn" type="button" data-action="unmatchFlight" data-flight-id="${esc(fid)}">Unmatch</button>
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
    const pid = team.pairingId ? `Pairing ${esc(team.pairingId)}` : "(empty)";
    const detail = team.names && team.names.length ? esc(team.names.join(", ")) : "";

    return `
      <div class="maListRow ${isTarget ? "is-selected" : ""}" data-action="selectFlightSlot" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}">
        <div class="maListRow__col">${label}</div>
        <div class="maListRow__col maListRow__col--muted">${pid}</div>
        <div class="maListRow__col maListRow__col--right">
          ${team.pairingId ? `<button class="gpRowBtn" type="button" data-action="removePairingFromFlight" data-flight-id="${esc(flightId)}" data-flight-pos="${esc(flightPos)}" data-pairing-id="${esc(team.pairingId)}">Remove</button>` : ""}
        </div>
      </div>
      ${detail ? `<div class="maSmallNote">${detail}</div>` : ""}`;
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
      const sel = state.selectedPairingId === String(r.pairingId);
      const cls = sel ? "maListRow is-selected" : "maListRow";
      return `
        <div class="${cls}" data-action="selectUnmatched" data-pairing-id="${esc(r.pairingId)}">
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
    state.selectedPlayerGHIN = String(ghin || "");
    renderUnpairedList();
    if (isMobile()) renderUnpairedList({ intoDrawer: true });
    setHints();
  }

  function selectPairing(pid) {
    state.targetPairingId = String(pid || "");
    renderPairingsCanvas();
    setHints();
  }

  function createNewPairing() {
    const pid = nextPairingId();
    state.targetPairingId = pid;
    render();
    setStatus(`Created pairing ${pid}.`, "info");
  }

  function assignSelectedPlayerToPairing() {
    const ghin = state.selectedPlayerGHIN;
    const pid = state.targetPairingId;
    if (!ghin) return setStatus("Select an unpaired player first.", "warn");
    if (!pid) return setStatus("Tap a target pairing card first.", "warn");

    const p = getPlayerByGHIN(ghin);
    if (!p) return;

    // Pair Players: Add player to existing pairing
    p.pairingId = String(pid);
    p.pairingPos = nextPairingPos(pid);

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
      // gameKey blank until matched (server will enforce)
      p.gameKey = "";
    } else {
      // PairField: inherit target pairing schedule + gameKey scope pairing
      const sched = getContainerSchedule({ type: "pairing", id: pid });
      p.teeTime = String(sched.teeTime || "");
      p.startHole = String(sched.startHole || "");
      p.startHoleSuffix = String(sched.startHoleSuffix || "");
      // gameKey will be inherited/created on save
    }

    markDirty(ghin);
    // clear selection
    state.selectedPlayerGHIN = "";
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
    p.gameKey = "";
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
      p.gameKey = "";
      markDirty(p.playerGHIN);
    });
    render();
  }

  // ---- Actions: Match tab ----
  function selectUnmatchedPairing(pid) {
    state.selectedPairingId = String(pid || "");
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

  function createNewFlight() {
    if (!isPairPair()) return;
    const fid = nextFlightId();
    state.targetFlightId = fid;
    state.targetFlightPos = "A";
    // no DB rows yet; this will exist only after assignment
    render();
    setStatus(`Created match ${fid}. Select a pairing and assign to Team A.`, "info");
  }

  function assignSelectedPairingToFlight() {
    if (!isPairPair()) return;
    const pid = state.selectedPairingId;
    const fid = state.targetFlightId;
    const fp = state.targetFlightPos;

    if (!pid) return setStatus("Select an unmatched pairing first.", "warn");
    if (!fid || !fp) return setStatus("Tap a match slot (Team A/B) first.", "warn");

    // Ensure slot is empty
    const existing = buildTeamSummary(fid, fp);
    if (existing && existing.pairingId) {
      return setStatus(`That slot already has pairing ${existing.pairingId}. Remove it first.`, "warn");
    }

    const rows = playersInPairing(pid);
    if (!rows.length) return;

    // Inherit schedule from target flight (if any) else clear
    const sched = getContainerSchedule({ type: "flight", id: fid });

    rows.forEach(p => {
      p.flightId = String(fid);
      p.flightPos = fp;
      p.teeTime = String(sched.teeTime || "");
      p.startHole = String(sched.startHole || "");
      p.startHoleSuffix = String(sched.startHoleSuffix || "");
      // gameKey will inherit target flight on save
      markDirty(p.playerGHIN);
    });

    // Clear selection to support next action
    state.selectedPairingId = "";

    // If we were building a new flight, advance target to Team B
    if (fp === "A") {
      state.targetFlightPos = "B";
      setStatus(`Assigned ${pid} to Match ${fid} Team A. Select another pairing for Team B.`, "info");
    } else {
      setStatus(`Assigned ${pid} to Match ${fid} Team B.`, "success");
    }

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
      p.gameKey = "";
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
        p.gameKey = "";
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

    // Search fields
    if (el.unpairedSearch) el.unpairedSearch.addEventListener("input", () => renderUnpairedList());
    if (el.unmatchedSearch) el.unmatchedSearch.addEventListener("input", () => renderUnmatchedList());
    if (el.drawerSearch) {
      el.drawerSearch.addEventListener("input", () => {
        if (state.activeTab === "pair") renderUnpairedList({ intoDrawer: true });
        else renderUnmatchedList({ intoDrawer: true });
      });
    }

    // Buttons
    if (el.btnAddPairing) el.btnAddPairing.addEventListener("click", createNewPairing);
    if (el.btnAssignToPairing) el.btnAssignToPairing.addEventListener("click", assignSelectedPlayerToPairing);
    if (el.btnUnpairSelected) el.btnUnpairSelected.addEventListener("click", () => {
      if (!state.targetPairingId) return setStatus("Select a pairing card first.", "warn");
      if (!confirm(`Unpair all players from pairing ${state.targetPairingId}?`)) return;
      unpairGroup(state.targetPairingId);
    });
    if (el.btnClearTraySelection) el.btnClearTraySelection.addEventListener("click", () => { state.selectedPlayerGHIN = ""; renderUnpairedList(); setHints(); });

    if (el.btnAddFlight) el.btnAddFlight.addEventListener("click", createNewFlight);
    if (el.btnAssignToFlight) el.btnAssignToFlight.addEventListener("click", assignSelectedPairingToFlight);
    if (el.btnUnmatchSelected) el.btnUnmatchSelected.addEventListener("click", () => {
      if (!state.targetFlightId) return setStatus("Select a match first.", "warn");
      if (!confirm(`Unmatch all pairings from match ${state.targetFlightId}?`)) return;
      unmatchFlight(state.targetFlightId);
    });
    if (el.btnClearTraySelection2) el.btnClearTraySelection2.addEventListener("click", () => { state.selectedPairingId = ""; renderUnmatchedList(); setHints(); });

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
      if (action === "removeFromPair") {
        removePlayerFromPairing(a.dataset.ghin);
        return;
      }
      if (action === "unpairGroup") {
        const pid = a.dataset.pairingId;
        if (!confirm(`Unpair all players from pairing ${pid}?`)) return;
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
        if (!confirm(`Remove pairing ${pid} from match ${fid} Team ${fp}?`)) return;
        removePairingFromFlight(fid, fp, pid);
        return;
      }
      if (action === "unmatchFlight") {
        const fid = a.dataset.flightId;
        if (!confirm(`Unmatch all pairings from match ${fid}?`)) return;
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
        pairingId: pad3(r.dbPlayers_PairingID ?? r.pairingId ?? "000"),
        pairingPos: String(r.dbPlayers_PairingPos ?? r.pairingPos ?? ""),
        flightId: String(r.dbPlayers_FlightID ?? r.flightId ?? "").trim(),
        flightPos: normFlightPos(r.dbPlayers_FlightPos ?? r.flightPos ?? ""),
        teeTime: String(r.dbPlayers_TeeTime ?? r.teeTime ?? ""),
        startHole: String(r.dbPlayers_StartHole ?? r.startHole ?? ""),
        startHoleSuffix: String(r.dbPlayers_StartHoleSuffix ?? r.startHoleSuffix ?? ""),
        gameKey: String(r.dbPlayers_GameKey ?? r.gameKey ?? ""),
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
