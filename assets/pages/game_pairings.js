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
  // Dirty map by GHIN
    dirty: new Set(),
    allCollapsed: false, // Global expand/collapse state
    busy: false,
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

    // Detect teams — valid only when 2+ distinct non-empty team keys exist in the unpaired pool
    const teamIds = state.teamConfig
      ? [...new Set(allUnpaired.map(p => p.team || "").filter(Boolean))].sort()
      : [];
    const hasTeams = state.teamConfig !== null && teamIds.length > 1;

    // Build defaults against the full pool (modal recalculates per-team on open)
    const total = allUnpaired.length;
    const minGroups = Math.max(1, Math.ceil(total / 4));
    const mixes = AutoPairEngine.calculateValidMixes(total, minGroups);
    const mix = mixes[0] || { fours: 0, threes: 0, twos: Math.ceil(total / 2), singles: 0 };

    const defaults = {
      teeTimeCount: minGroups,
      foursomes: mix.fours,
      threesomes: mix.threes,
      twosomes: mix.twos,
      singles: mix.singles || 0,
      outcome: "balanced"  // always resets to Competitive balance — no persistence
    };

    openAutoPairModal(defaults, allUnpaired, state.teamConfig, hasTeams);
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

  // ============================================================
  // AUTO-PAIR MODAL & LOGIC
  // Self-contained section. Two touch points with page state:
  //   IN:  allUnpaired pool (read from state.players on open)
  //   OUT: applyAutoPairGroups() writes pairingId/pairingPos and marks dirty
  // All other state is local to the modal session.
  // ============================================================

  /**
   * Derive bucket count from the dominant (most common) group size in the mix.
   * Replaces the removed Buckets user-input field.
   * Used by AutoPairEngine.run() — irrelevant for outcomes that skip _bucketize().
   */
  function deriveBucketCount(mix) {
    const sizes = [];
    for (let i = 0; i < mix.fours;   i++) sizes.push(4);
    for (let i = 0; i < mix.threes;  i++) sizes.push(3);
    for (let i = 0; i < mix.twos;    i++) sizes.push(2);
    for (let i = 0; i < mix.singles; i++) sizes.push(1);
    if (!sizes.length) return 1;
    const freq = sizes.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
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

  function isNH(ghin) {
    return String(ghin || '').toUpperCase().startsWith('NH');
  }

  function openAutoPairModal(defaults, allUnpairedPlayers, teamConfig, hasTeams) {
    // ---- Session state ----
    // allUnpairedPlayers is frozen at modal open — never re-read from state.players mid-session.
    // Applied players are marked dirty in state.players externally; the modal's local pool is not mutated.
    let scopeLocked = false;          // true after first Run — scope becomes read-only
    let appliedTeams = [];            // teams successfully applied this session (for post-apply cycling)

    // ---- Helpers ----
    // Returns the active player pool: full pool or filtered by selected team
    const getActivePool = () => {
      if (!elScope || elScope.value !== "team") return allUnpairedPlayers;
      const selectedTeam = elTeam ? elTeam.value : "";
      return allUnpairedPlayers.filter(p => (p.team || "") === selectedTeam);
    };

    // Returns unpaired count for a given team ID within the original pool
    const teamUnpairedCount = (teamId) =>
      allUnpairedPlayers.filter(p => (p.team || "") === teamId).length;

    // ---- Build shell ----
    const overlay = document.createElement("div");
    overlay.className = "maModalOverlay is-open";

    const modal = document.createElement("div");
    modal.className = "maModal";

    // ---- Header ----
    const header = document.createElement("div");
    header.className = "maModal__hdr";
    header.innerHTML = `
      <div class="maModal__titles">
        <div class="maModal__title">Auto-Pair</div>
        <div class="maModal__subtitle" id="apSubtitle">${allUnpairedPlayers.length} Unpaired Players</div>
      </div>
      <button type="button" class="iconBtn btnSecondary" id="apBtnClose" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    // ---- Controls (Setup Mode) ----
    // Pairing Scope and Team fields are conditionally rendered based on hasTeams.
    // Core fields (No. of Pairings, Pairing Size, Pairing Outcome) always shown.
    const controls = document.createElement("div");
    controls.className = "maModal__controls";
    controls.innerHTML = `
      ${hasTeams ? `
      <div class="maFieldRow" id="apScopeRow" style="margin-top:0;">
        <div class="maField" style="flex:1;">
          <label class="maLabel">Pairing Scope</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">Should pairings respect team assignments?</div>
          <select id="apScope" class="maTextInput">
            <option value="all">All players together — ${allUnpairedPlayers.length} players</option>
            <option value="team">Pair within teams only</option>
          </select>
        </div>
      </div>
      <div class="maFieldRow" id="apTeamRow" style="display:none; margin-top:0;">
        <div class="maField" style="flex:1;">
          <label class="maLabel">Team</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">Select a team to configure pairings for</div>
          <select id="apTeam" class="maTextInput"></select>
        </div>
      </div>
      ` : ""}
      <div class="maFieldRow" id="apScopeLockedRow" style="display:none; margin-top:0;">
        <div class="maField" style="flex:1;">
          <div style="font-size:12px; font-weight:700; color:var(--ink);" id="apScopeLockedLabel"></div>
          <button type="button" class="maLink" id="apBtnChangeScope" style="font-size:11px; margin-top:4px;">Change scope</button>
        </div>
      </div>
      <div class="maFieldRow" style="margin-top:0;" id="apCoreRow1">
        <div class="maField">
          <label class="maLabel">No. of Pairings</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">How many competitive groups to create</div>
          <input type="number" id="apTeeTimeCount" class="maTextInput" min="1" max="99" value="${defaults.teeTimeCount}">
        </div>
        <div class="maField">
          <label class="maLabel">Pairing Size</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">All options account for every player</div>
          <select id="apMixSelect" class="maTextInput"></select>
        </div>
      </div>
      <div class="maFieldRow" id="apCoreRow2">
        <div class="maField" style="flex:1;">
          <label class="maLabel">Pairing Outcome</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">What result are you looking to achieve?</div>
          <select id="apOutcome" class="maTextInput">
            <option value="balanced">Competitive balance — spread handicaps evenly across pairings</option>
            <option value="abcdDraw">ABCD Draw — one player from each handicap tier</option>
            <option value="inOrder">Ranked — pair strongest players together</option>
            <option value="stackedHighFirst">Stacked — pair highest handicaps together</option>
            <option value="random">Random — ignore handicaps entirely</option>
            <option value="leastPlayed">Least Played Together — prioritize players with least shared history</option>
          </select>
        </div>
      </div>
      <div id="apMsg" style="margin-top:10px; font-size:12px; font-weight:700; color:var(--warn);"></div>
    `;

    // ---- Body (Review Mode — initially hidden) ----
    const body = document.createElement("div");
    body.className = "maModal__body";
    body.style.display = "none";
    body.innerHTML = `<div id="apPreviewList" class="maCards"></div>`;

    // ---- Footer ----
    const footer = document.createElement("div");
    footer.className = "maModal__ftr";
    footer.innerHTML = `
      <button class="btn btnSecondary" id="apBtnCancel" type="button">Cancel</button>
      <div class="maModal__ftrActions">
        <button class="btn btnSecondary" id="apBtnRetry" type="button" style="display:none;">Retry</button>
        <button class="btn btnPrimary"   id="apBtnRun"   type="button">Run</button>
        <button class="btn btnPrimary"   id="apBtnApply" type="button" style="display:none;">Apply</button>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(controls);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ---- Element references ----
    const elSubtitle      = header.querySelector("#apSubtitle");
    const elScope         = hasTeams ? controls.querySelector("#apScope") : null;
    const elTeamRow       = hasTeams ? controls.querySelector("#apTeamRow") : null;
    const elTeam          = hasTeams ? controls.querySelector("#apTeam") : null;
    const elScopeLockedRow   = controls.querySelector("#apScopeLockedRow");
    const elScopeLockedLabel = controls.querySelector("#apScopeLockedLabel");
    const btnChangeScope  = controls.querySelector("#apBtnChangeScope");
    const elTT            = controls.querySelector("#apTeeTimeCount");
    const elMix           = controls.querySelector("#apMixSelect");
    const elOutcome       = controls.querySelector("#apOutcome");
    const elMsg           = controls.querySelector("#apMsg");
    const elPreview       = body.querySelector("#apPreviewList");
    const btnClose        = header.querySelector("#apBtnClose");
    const btnCancel       = footer.querySelector("#apBtnCancel");
    const btnRun          = footer.querySelector("#apBtnRun");
    const btnRetry        = footer.querySelector("#apBtnRetry");
    const btnApply        = footer.querySelector("#apBtnApply");

    let currentPreviewGroups = [];

    // ---- Close ----
    const close = () => overlay.remove();
    btnClose.addEventListener("click", close);
    btnCancel.addEventListener("click", close);

    // ---- Subtitle ----
    const updateSubtitle = () => {
      if (!elSubtitle) return;
      if (!hasTeams || !elScope || elScope.value !== "team") {
        elSubtitle.textContent = `${allUnpairedPlayers.length} Unpaired Players`;
      } else {
        const teamId   = elTeam ? elTeam.value : "";
        const teamName = resolveTeamName(teamId, teamConfig);
        const n        = teamUnpairedCount(teamId);
        elSubtitle.textContent = `${teamName} — ${n} Unpaired Player${n !== 1 ? "s" : ""}`;
      }
    };

    // ---- Team dropdown population ----
    const populateTeamDropdown = () => {
      if (!elTeam || !teamConfig) return;
      const sorted = [...teamConfig.teams].sort((a, b) => a.sort - b.sort);
      elTeam.innerHTML = sorted.map(t => {
        const n = teamUnpairedCount(t.id);
        const disabled = n === 0 ? " disabled" : "";
        return `<option value="${esc(t.id)}"${disabled}>${esc(t.name)} — ${n} unpaired player${n !== 1 ? "s" : ""}${n === 0 ? " (disabled)" : ""}</option>`;
      }).join("");
      // Default to first team with unpaired players
      const firstAvailable = sorted.find(t => teamUnpairedCount(t.id) > 0);
      if (firstAvailable) elTeam.value = firstAvailable.id;
    };

    // ---- No. of Pairings default recalc ----
    const recalcGroupCount = () => {
      const pool = getActivePool();
      const n = pool.length;
      elTT.value = String(Math.max(1, Math.ceil(n / 4)));
    };

    // ---- Pairing Size dropdown ----
    const updateMixOptions = () => {
      const pool = getActivePool();
      const tt   = Math.max(1, parseInt(elTT.value || "1", 10));

      // Get all valid mixes for this pool + group count
      let mixes = AutoPairEngine.calculateValidMixes(pool.length, tt);

      // PairPair constraint: max 2 players per pairing — filter out mixes with fours or threes.
      // GUARD: Run button disabled state and "no valid mix" check must evaluate against this
      // filtered list, not the raw output, so the button correctly reflects what the user can run.
      if (isPairPair()) {
        mixes = mixes.filter(m => m.fours === 0 && m.threes === 0);
      }

      elMix.innerHTML = "";
      if (!mixes.length) {
        elMsg.textContent = "No valid pairing size for this group count.";
        btnRun.disabled = true;
        return;
      }
      elMsg.textContent = "";
      btnRun.disabled = false;

      mixes.forEach((m, idx) => {
        const opt = document.createElement("option");
        opt.value = JSON.stringify({ fours: m.fours, threes: m.threes, twos: m.twos, singles: m.singles || 0 });
        opt.textContent = m.verboseDisplay;
        if (idx === 0) opt.selected = true;
        elMix.appendChild(opt);
      });
    };

    elTT.addEventListener("change", updateMixOptions);
    elTT.addEventListener("input",  updateMixOptions);

    // ---- Scope visibility ----
    const updateScopeVisibility = () => {
      if (!hasTeams || !elScope) return;
      const isTeam = elScope.value === "team";
      if (elTeamRow) elTeamRow.style.display = isTeam ? "" : "none";
      if (isTeam) {
        populateTeamDropdown();
        recalcGroupCount();
      } else {
        // All players together — reset group count to full pool default
        const total = allUnpairedPlayers.length;
        elTT.value = String(Math.max(1, Math.ceil(total / 4)));
      }
      updateSubtitle();
      updateMixOptions();
    };

    if (elScope) elScope.addEventListener("change", updateScopeVisibility);
    if (elTeam)  elTeam.addEventListener("change", () => {
      recalcGroupCount();
      updateSubtitle();
      updateMixOptions();
    });

    // ---- Scope lock (after first Run) ----
    const lockScope = () => {
      if (!hasTeams || scopeLocked) return;
      scopeLocked = true;

      // Hide the live scope/team dropdowns, show read-only summary line
      const scopeRow = controls.querySelector("#apScopeRow");
      if (scopeRow) scopeRow.style.display = "none";
      if (elTeamRow) elTeamRow.style.display = "none";
      if (elScopeLockedRow) elScopeLockedRow.style.display = "";

      const scopeLabel = elScope && elScope.value === "team"
        ? "Pairing within teams — " + teamConfig.teams.map(t => t.name).join(" • ")
        : "All players together";
      if (elScopeLockedLabel) elScopeLockedLabel.textContent = scopeLabel;
    };

    // Change scope — escape hatch with confirmation.
    // Warns that any pairings applied this session will be discarded.
    if (btnChangeScope) {
      btnChangeScope.addEventListener("click", () => {
        const msg = appliedTeams.length > 0
          ? `Changing scope will discard pairings already applied this session (${appliedTeams.map(id => resolveTeamName(id, teamConfig) || id).join(", ")}). Continue?`
          : "Change pairing scope? This will reset the modal to Setup.";
        if (!confirm(msg)) return;

        // Reset session
        scopeLocked = false;
        appliedTeams = [];
        currentPreviewGroups = [];

        // Restore scope controls
        const scopeRow = controls.querySelector("#apScopeRow");
        if (scopeRow) scopeRow.style.display = "";
        if (elScopeLockedRow) elScopeLockedRow.style.display = "none";

        // Return to Setup Mode
        body.style.display = "none";
        controls.style.display = "";
        elPreview.innerHTML = "";
        btnApply.style.display = "none";
        btnRetry.style.display = "none";
        btnRun.style.display   = "inline-flex";
        btnRun.disabled        = false;
        elMsg.textContent      = "";

        updateScopeVisibility();
        updateSubtitle();
      });
    }

    // ---- Initialize controls ----
    elOutcome.value = "balanced"; // always resets — no localStorage persistence
    updateScopeVisibility();      // sets team row visibility, populates team dropdown
    updateMixOptions();           // populates Pairing Size

    // ---- RUN ----
    btnRun.addEventListener("click", async () => {
      const pool = getActivePool();
      const mix  = JSON.parse(elMix.value || "{}");
      const cfg  = {
        teeTimeCount: parseInt(elTT.value, 10),
        foursomes:    mix.fours   || 0,
        threesomes:   mix.threes  || 0,
        twosomes:     mix.twos    || 0,
        singles:      mix.singles || 0,
        outcome:      elOutcome.value,
        // bucketCount derived automatically — Buckets field removed
        bucketCount:  deriveBucketCount({ fours: mix.fours || 0, threes: mix.threes || 0, twos: mix.twos || 0, singles: mix.singles || 0 }),
      };

      const v = AutoPairEngine.validateConfig(cfg, pool);
      if (!v.ok) { elMsg.textContent = v.message; return; }

      // Lock scope after first Run
      lockScope();

      // Fetch co-play matrix for leastPlayed outcome only.
      // Matrix shape: { 'LOWER_GHIN|HIGHER_GHIN': { count: int, last: 'Y-m-d'|null } }
      // NH players excluded here and again at the PHP level.
      // On any failure: empty matrix = handicap tiebreak only — still a valid result.
      let coPlayMatrix = {};
      if (cfg.outcome === "leastPlayed") {
        const ghins = pool.map(p => p.playerGHIN).filter(g => !isNH(g));
        try {
          const res = await MA.postJson(`${apiBase}/getCoPlayMatrix.php`, { ghins });
          if (res && res.ok) coPlayMatrix = res.matrix || {};
        } catch (err) {
          console.warn("[AutoPair] Co-play matrix fetch failed — proceeding without history.", err);
        }
      }
      cfg.coPlayMatrix = coPlayMatrix;

      // Generate preview
      currentPreviewGroups = AutoPairEngine.run(cfg, pool);

      // Render preview cards
      elPreview.innerHTML = currentPreviewGroups.map((grp, i) => {
        const sum = grp.reduce((s, p) => s + AutoPairEngine.phValue(p), 0);
        const avg = grp.length ? (sum / grp.length).toFixed(1) : "0.0";
        const rows = grp.map(p => {
          const ph   = AutoPairEngine.phValue(p);
          const meta = [p.teeSetName, `PH:${ph}`].filter(Boolean).join(" • ");
          return `<div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-top:1px solid #eee;">
            <span>${esc(p.name)}</span>
            <span style="color:var(--mutedText);">${esc(meta)}</span>
          </div>`;
        }).join("");
        return `
          <div class="maCard">
            <div class="maCard__hdr" style="padding:8px 10px; background:#f9f9f9; border-bottom:1px solid #eee;">
              <div class="maCard__title" style="font-size:12px;">Pairing ${i + 1}</div>
              <div style="font-size:11px; font-weight:700; color:var(--mutedText);">Sum ${sum} • Avg ${avg}</div>
            </div>
            <div class="maCard__body" style="padding:4px 10px;">${rows}</div>
          </div>`;
      }).join("");

      // Transition to Review Mode
      controls.style.display = "none";
      body.style.display     = "block";
      btnRun.style.display   = "none";
      btnRetry.style.display = "inline-flex";
      btnApply.style.display = "inline-flex";
    });

    // ---- RETRY ----
    btnRetry.addEventListener("click", () => {
      body.style.display     = "none";
      controls.style.display = "";
      elPreview.innerHTML    = "";
      currentPreviewGroups   = [];
      btnApply.style.display = "none";
      btnRetry.style.display = "none";
      btnRun.style.display   = "inline-flex";
    });

    // ---- APPLY ----
    btnApply.addEventListener("click", () => {
      if (!currentPreviewGroups.length) return;

      const appliedTeamId = (hasTeams && elScope && elScope.value === "team" && elTeam)
        ? elTeam.value
        : null;

      applyAutoPairGroups(currentPreviewGroups);
      currentPreviewGroups = [];

      if (appliedTeamId) appliedTeams.push(appliedTeamId);

      // Post-apply: check for remaining teams with unpaired players (team-scope mode only)
      if (hasTeams && elScope && elScope.value === "team") {
        const remaining = teamConfig.teams
          .map(t => t.id)
          .filter(id => !appliedTeams.includes(id) && teamUnpairedCount(id) > 0);

        if (remaining.length > 0) {
          const nextTeamId   = remaining[0];
          const nextTeamName = resolveTeamName(nextTeamId, teamConfig);

          // Advance team selection to next team, recalculate core fields
          if (elTeam) elTeam.value = nextTeamId;
          recalcGroupCount();
          updateSubtitle();
          updateMixOptions();

          // Return to Setup Mode — modal stays open
          body.style.display     = "none";
          controls.style.display = "";
          elPreview.innerHTML    = "";
          btnApply.style.display = "none";
          btnRetry.style.display = "none";
          btnRun.style.display   = "inline-flex";

          const appliedName = resolveTeamName(appliedTeamId, teamConfig) || appliedTeamId;
          elMsg.textContent = `Pairings applied for ${appliedName}. Now configure ${nextTeamName}.`;
          elMsg.style.color = "var(--success, green)";
          return; // do not close
        }
      }

      close();
    });
  }

  function applyAutoPairGroups(groups) {
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
    setStatus(`Auto-paired ${groups.length} pairings.`, "success");
  }

  // ---- AutoPair Engine (Ported) ----
  const AutoPairEngine = {
    phValue(p) {
      const v = (p && p.ph != null && p.ph !== "") ? Number(p.ph)
        : (p && p.ch != null && p.ch !== "") ? Number(p.ch)
          : (p && p.hi != null && p.hi !== "") ? Number(p.hi)
            : 999;
      return Number.isFinite(v) ? v : 999;
    },
    calculateValidMixes(totalGolfers, totalTeeTimes) {
      if (!(totalGolfers > 0 && totalTeeTimes > 0)) return [];
      const results = [];

      for (let fours = Math.floor(totalGolfers / 4); fours >= 0; fours--) {
        const leftAfter4 = totalGolfers - (fours * 4);

        for (let threes = Math.floor(leftAfter4 / 3); threes >= 0; threes--) {
          const leftAfter3 = leftAfter4 - (threes * 3);

          for (let twos = Math.floor(leftAfter3 / 2); twos >= 0; twos--) {
            const leftAfter2 = leftAfter3 - (twos * 2);

            // whatever remains becomes singles
            const singles = leftAfter2;
            if (singles < 0) continue;

            const totalGroups = fours + threes + twos + singles;
            if (totalGroups > totalTeeTimes) continue;

            results.push({ fours, threes, twos, singles });
          }
        }
      }

      results.sort((a, b) => {
        const aSinglesOnly = a.singles > 0 && a.fours === 0 && a.threes === 0 && a.twos === 0;
        const bSinglesOnly = b.singles > 0 && b.fours === 0 && b.threes === 0 && b.twos === 0;
        if (aSinglesOnly !== bSinglesOnly) return aSinglesOnly ? 1 : -1;

        const aHasSingles = a.singles > 0;
        const bHasSingles = b.singles > 0;
        if (aHasSingles !== bHasSingles) return aHasSingles ? 1 : -1;

        const aKinds =
          (a.fours > 0 ? 1 : 0) +
          (a.threes > 0 ? 1 : 0) +
          (a.twos > 0 ? 1 : 0) +
          (a.singles > 0 ? 1 : 0);

        const bKinds =
          (b.fours > 0 ? 1 : 0) +
          (b.threes > 0 ? 1 : 0) +
          (b.twos > 0 ? 1 : 0) +
          (b.singles > 0 ? 1 : 0);

        if (aKinds !== bKinds) return aKinds - bKinds;
        if (a.fours !== b.fours) return b.fours - a.fours;
        if (a.threes !== b.threes) return b.threes - a.threes;
        if (a.twos !== b.twos) return b.twos - a.twos;
        return a.singles - b.singles;
      });

      return results.map(m => ({
        fours: m.fours,
        threes: m.threes,
        twos: m.twos,
        singles: m.singles,
        verboseDisplay: this._mixVerbose(m.fours, m.threes, m.twos, m.singles)
      }));
    },
    validateConfig(cfg, unpairedPlayers) {
      const total = (unpairedPlayers || []).length;
      const fours = Number(cfg.foursomes || 0);
      const threes = Number(cfg.threesomes || 0);
      const twos = Number(cfg.twosomes || 0);
      const singles = Number(cfg.singles || 0);
      const seats = fours * 4 + threes * 3 + twos * 2 + singles;
      const groups = fours + threes + twos + singles;

      if (!total) return { ok: false, message: "No unpaired players." };
      if (seats !== total) return { ok: false, message: `Mix seats (${seats}) must equal unpaired players (${total}).` };
      if (groups <= 0) return { ok: false, message: "Choose a valid group mix." };
      if (groups > Number(cfg.teeTimeCount || groups)) return { ok: false, message: "Total groups exceed tee times." };

      return { ok: true, message: "" };
    },
    run(cfg, unpairedPlayers) {
      const pool = (unpairedPlayers || []).slice().sort((a, b) => this.phValue(a) - this.phValue(b));
      const sizes = this._autopairGroupSizes(cfg, pool.length);
      // bucketCount is auto-derived from the dominant mix size — Buckets field was removed.
      // cfg.bucketCount is pre-calculated by deriveBucketCount() in the Run handler and passed here.
      // For outcomes that skip _bucketize() (inOrder, random, stackedHighFirst), this value is unused.
      const bucketCount = Math.max(1, Number(cfg.bucketCount || 1));
      const buckets = this._bucketize(pool, bucketCount);

      switch (cfg.outcome) {
        case "balanced": return this._draftBalanced(buckets, sizes);
        case "inOrder": return this._draftInOrder(pool, sizes);
        case "abcdDraw": return this._draftABCD(buckets, sizes);
        case "random": return this._draftRandom(pool, sizes);
        case "stackedHighFirst": return this._draftStackedHighFirst(pool, sizes);
        case "leastPlayed":      return this._draftLeastPlayed(pool, sizes, cfg.coPlayMatrix || {});
        default: return this._draftBalanced(buckets, sizes);
      }
    },
    _autopairGroupSizes(cfg, availablePlayers) {
      const out = [];
      const f = Number(cfg.foursomes || 0);
      const t3 = Number(cfg.threesomes || 0);
      const t2 = Number(cfg.twosomes || 0);
      const s1 = Number(cfg.singles || 0);
      for (let i = 0; i < f; i++) out.push(4);
      for (let i = 0; i < t3; i++) out.push(3);
      for (let i = 0; i < t2; i++) out.push(2);
      for (let i = 0; i < s1; i++) out.push(1);
      const seats = out.reduce((s, x) => s + x, 0);
      if (seats <= availablePlayers) return out;
      let remaining = availablePlayers;
      const clamped = [];
      for (const s of out) {
        if (remaining <= 0) break;
        const take = Math.min(s, remaining);
        clamped.push(take);
        remaining -= take;
      }
      return clamped;
    },
    _bucketize(players, bucketCount) {
      if (bucketCount <= 1) return [players.slice()];
      const sorted = players.slice().sort((a, b) => this.phValue(a) - this.phValue(b));
      const n = sorted.length;
      const base = Math.floor(n / bucketCount);
      const rem = n % bucketCount;
      const buckets = [];
      let idx = 0;
      for (let i = 0; i < bucketCount; i++) {
        const extra = (i < rem) ? 1 : 0;
        const size = base + extra;
        const slice = (size > 0 && idx < n) ? sorted.slice(idx, Math.min(idx + size, n)) : [];
        buckets.push(slice);
        idx += size;
      }
      return buckets;
    },
    _draftBalanced(buckets, sizes) {
      const queues = buckets.map(b => b.slice());
      const pull = (bi, back = false) => {
        if (!queues[bi] || !queues[bi].length) return null;
        return back ? queues[bi].pop() : queues[bi].shift();
      };
      const pullAny = () => {
        for (let i = 0; i < queues.length; i++) {
          if (queues[i].length) return queues[i].shift();
        }
        return null;
      };
      const pushFrom = (group, sources) => {
        for (const [i, back] of sources) {
          const p = pull(i, back);
          if (p) { group.push(p); return; }
        }
        const p = pullAny();
        if (p) group.push(p);
      };
      const groups = [];
      for (const size of sizes) {
        const g = [];
        switch (size) {
          case 4:
            pushFrom(g, [[0, false], [1, true], [2, false], [3, false]]);
            pushFrom(g, [[1, true], [2, false], [3, false], [0, false]]);
            pushFrom(g, [[2, true], [3, false], [1, false], [0, false]]);
            pushFrom(g, [[3, false], [0, false], [2, false], [1, false]]);
            break;
          case 3:
            pushFrom(g, [[0, false], [1, true], [2, false], [3, false]]);
            pushFrom(g, [[1, true], [2, false], [3, false], [0, false]]);
            pushFrom(g, [[2, false], [3, false], [1, false], [0, false]]);
            break;
          default:
            for (let i = 0; i < size; i++) { const p = pullAny(); if (p) g.push(p); }
            break;
        }
        groups.push(g);
      }
      return groups;
    },
    _draftInOrder(players, sizes) {
      const list = players.slice();
      const groups = [];
      for (const s of sizes) {
        const g = [];
        for (let i = 0; i < s; i++) if (list.length) g.push(list.shift());
        groups.push(g);
      }
      return groups;
    },
    _draftABCD(buckets, sizes) {
      const queues = buckets.map(b => b.slice());
      const pullFront = (i) => {
        if (!queues[i] || !queues[i].length) return null;
        return queues[i].shift();
      };
      const pullAny = () => {
        for (let i = 0; i < queues.length; i++) if (queues[i].length) return queues[i].shift();
        return null;
      };
      const B = Math.max(1, queues.length);
      const groups = [];
      for (const s of sizes) {
        const g = [];
        let k = 0;
        while (g.length < s) {
          const bi = k % B;
          const p = pullFront(bi) || pullAny();
          if (!p) break;
          g.push(p);
          k += 1;
        }
        groups.push(g);
      }
      return groups;
    },
    _draftRandom(players, sizes) {
      const list = players.slice();
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return this._draftInOrder(list, sizes);
    },
    _draftStackedHighFirst(players, sizes) {
      // players already sorted asc by PH, so this is just InOrder
      return this._draftInOrder(players, sizes);
    },
    _draftLeastPlayed(pool, sizes, matrix) {
      // pool arrives pre-sorted asc by PH from run() — real players anchor,
      // NH players trail and never become group anchors.
      const real      = pool.filter(p => !isNH(p.playerGHIN));
      const nh        = pool.filter(p =>  isNH(p.playerGHIN));
      const remaining = [...real, ...nh];

      const groups = [];
      for (const size of sizes) {
        if (!remaining.length) break;
        const anchor = remaining.shift();   // lowest PH real player
        const group  = [anchor];
        while (group.length < size && remaining.length) {
          const best = this._pickBestCandidate(group, remaining, matrix);
          if (!best) break;
          remaining.splice(remaining.indexOf(best), 1);
          group.push(best);
        }
        groups.push(group);
      }
      return groups;
    },
    _pickBestCandidate(group, remaining, matrix) {
      let best = null, bestScore = null;
      for (const candidate of remaining) {
        let totalCount     = 0;
        let mostRecentLast = null; // most recent shared game — we want the oldest
        for (const member of group) {
          // Sort GHINs to match PHP key convention (p1.GHIN < p2.GHIN)
          const key   = [member.playerGHIN, candidate.playerGHIN].sort().join('|');
          const entry = matrix[key];
          if (entry) {
            totalCount += entry.count;
            if (entry.last && (!mostRecentLast || entry.last > mostRecentLast)) {
              mostRecentLast = entry.last;
            }
          }
          // No entry = never played together = count 0, last null (ideal)
        }
        const score = {
          count:  totalCount,
          last:   mostRecentLast,
          spread: this._spreadIfAdded(group, candidate),
        };
        if (!best || this._compareScore(score, bestScore) < 0) {
          best = candidate; bestScore = score;
        }
      }
      return best;
    },
    _compareScore(a, b) {
      // Priority 1: fewest times played together
      if (a.count !== b.count) return a.count - b.count;
      // Priority 2: longest ago (null = never = best)
      if (a.last !== b.last) {
        if (a.last === null) return -1;
        if (b.last === null) return  1;
        return a.last.localeCompare(b.last); // Y-m-d: older string wins
      }
      // Priority 3: tightest handicap spread
      return a.spread - b.spread;
    },
    _spreadIfAdded(group, candidate) {
      const vals = [...group, candidate].map(p => this.phValue(p));
      return Math.max(...vals) - Math.min(...vals);
    },
    _mixVerbose(f, t3, t2, s1) {
      // Plain-English pairing size labels — no "foursomes/threesomes/twosomes/singles" (playing group language).
      const p = [];
      if (f  > 0) p.push(`4-player pairings (${f})`);
      if (t3 > 0) p.push(`3-player pairings (${t3})`);
      if (t2 > 0) p.push(`2-player pairings (${t2})`);
      if (s1 > 0) p.push(`1-player pairings (${s1})`);
      return p.length ? p.join(" + ") : "—";
    }
  };

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
      
      // Header Icons: Unpair (broken link), Edit (pencil)
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

    // Group header renderer
    const renderGroupHeader = (label, count) =>
      `<div style="padding:4px 10px; font-size:11px; font-weight:800; color:var(--mutedText); background:var(--surfaceApp); border-bottom:1px solid var(--borderSubtle);">${esc(label)} — ${count} player${count !== 1 ? "s" : ""}</div>`;

    if (!state.teamConfig) {
      // No teams — flat sorted list, same as before
      host.innerHTML = [...unpaired].sort(sortCmp).map(renderRow).join("");
      return;
    }

    // Teams active — group: Unassigned first, then teams sorted by name
    const unassigned = unpaired.filter(p => !p.team).sort(sortCmp);

    const teamGroups = [...state.teamConfig.teams]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(t => ({
        label: t.name,
        players: unpaired.filter(p => p.team === t.id).sort(sortCmp)
      }));

    let html = "";

    if (unassigned.length) {
      html += renderGroupHeader("Unassigned", unassigned.length);
      html += unassigned.map(renderRow).join("");
    }

    teamGroups.forEach(g => {
      if (!g.players.length) return;
      html += renderGroupHeader(g.label, g.players.length);
      html += g.players.map(renderRow).join("");
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

    host.innerHTML = rows.map(r => {
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
    setHints();
    if (isMobile() && isTrayOpen()) applyTrayChrome();
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
        flightId: String(r.dbPlayers_FlightID ?? r.flightId ?? "").trim(),
        flightPos: normFlightPos(r.dbPlayers_FlightPos ?? r.flightPos ?? ""),
        teeTime: String(r.dbPlayers_TeeTime ?? r.teeTime ?? ""),
        startHole: String(r.dbPlayers_StartHole ?? r.startHole ?? ""),
        startHoleSuffix: String(r.dbPlayers_StartHoleSuffix ?? r.startHoleSuffix ?? ""),
        playerKey: String(r.dbPlayers_PlayerKey ?? r.playerKey ?? ""),
        // Team assignment — stable slot ID ('T1', 'T2', or '').
        // Display name is resolved at render time from teamConfig; never stored here.
        team: String(r.dbPlayers_TeamKey ?? r.team ?? ""),
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