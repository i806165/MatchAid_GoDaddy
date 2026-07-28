/* /assets/pages/game_players.js
   Game Players page controller
   - Hydrates from window.__MA_INIT__
*/
(function(){
  "use strict";
  const MA = window.MA || {};
  const init = window.__MA_INIT__ || {};
  const ggid = String(init.ggid || "");
  const apiGHIN = MA.paths?.apiGHIN || "/api/GHIN";

  const state = {
    activeTab: (window.__INIT__?.game?.dbGames_EID) ? "eventroster" : "favorites",
    game: init.game || {},
    context: init.context || {},
    portal: init.portal || "",
    players: [],
    pendingPlayer: null,
    favorites: Array.isArray((window.__INIT__ || {}).favorites) ? window.__INIT__.favorites : [],
    groups:    Array.isArray((window.__INIT__ || {}).groups)    ? window.__INIT__.groups    : [],
    teeOptions: [],
    selectedTee: null,
    courseTeePayload: init.courseTeePayload || null,
    batchFallbackTee: null,      // tee selected in the picker for batch flows
    batchForceAssign: false,     // when true hierarchy is skipped; fallback tee used for all
    rosterSort: "name",  // name | team | hi | ch
  };

  function isImportDesktopEnabled(){
    return window.matchMedia("(min-width: 560px)").matches;
  }

  // Event mode — game is linked to an event; only Event Roster tab shown
  function isEventMode() {
    return !!(state.game?.dbGames_EID);
  }

  function getTabs(){
    // In event mode only the Event Roster source tab is shown
    if (isEventMode()) {
      return [{ id: "eventroster", label: "Event Roster" }];
    }
    // Roster is now the permanent canvas — not a tray tab.
    const baseTabs = [
      { id: "favorites",label: "Favorites" },
      { id: "ghin",     label: "Search"      },
      { id: "nonrated", label: "Non-Rated" },
    ];
    if (isImportDesktopEnabled()) baseTabs.push({ id: "import", label: "Import" });
    return baseTabs;
  }

  const el = {
    // Tray
    trayTabs:        document.getElementById("gpTrayTabs"),
    trayControls:    document.getElementById("gpTrayControls"),
    trayBody:        document.getElementById("gpTrayBody"),
    trayFtr:         document.querySelector(".gpTrayPanel .maPanel__ftr"),
    trayCount:       document.getElementById("gpTrayCount"),
    mobileCloseBtn:  document.querySelector(".gpMobileCloseBtn button"),
    btnTrayOpen:     document.getElementById("gpBtnTrayOpen"),

    // Canvas
    canvasControls:  document.getElementById("gpCanvasControls"),
    rosterBody:      document.getElementById("gpRosterBody"),
    rosterCount:     document.getElementById("gpRosterCount"),
    rosterFooterLeft: document.getElementById("gpRosterFooterLeft"),
  };

  function safe(v){ return v == null ? "" : String(v); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function esc(v){ return safe(v).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function splitName(full){
    const s = safe(full).trim();
    if (!s) return { first:"", last:"" };
    const parts = s.split(/\s+/);
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : ""
    };
  }

  function normalizeState(v){
    return safe(v).trim().toUpperCase().slice(0,2);
  }

  function formatAssignedTeeText(tee){
    if (!tee) return "";
    const name = safe(tee.teeSetName || tee.label || tee.name || "");
    const yards = safe(tee.teeSetYards || tee.yards || "");
    return [name, yards ? `${yards} yds` : ""].filter(Boolean).join(" • ");
  }

  // Live per-player tee resolution — same-course/last-played/preferred-
  // yardage hierarchy, same getTeeSets.php mode:"resolve" call already used
  // by commitBatchPending() and the old inline Import flow. Single shared
  // implementation now; previously duplicated three times in this file.
  // Deliberately not wrapping the failure in anything beyond the existing
  // try/catch-and-fall-back-to-state.batchFallbackTee pattern — consistent
  // with the rest of this file's commit loops, per the earlier decision to
  // leave partial-failure handling as a separate, later unit of work.
  async function resolveTeeForPlayer(player, sourceTeeId){
    if (state.batchForceAssign) {
      return { tee: state.batchFallbackTee, source: "force_assigned" };
    }

    const apiPath = (MA.paths?.apiGHIN || "/api/GHIN") + "/getTeeSets.php";
    let resolvedTee = state.batchFallbackTee;
    let resolvedTeeSource = "fallback";

    try {
      const tres = await MA.postJson(apiPath, {
        player,
        mode: "resolve",
        sourceGameTeeSetId: safe(sourceTeeId || "")
      });
      if (tres?.ok && tres.payload?.resolvedTeeId) {
        const allTees = Array.isArray(tres.payload?.teeSets) ? tres.payload.teeSets : [];
        const match = allTees.find(t =>
          safe(t.teeSetID || t.value || "") === safe(tres.payload.resolvedTeeId)
        );
        if (match) {
          resolvedTee = match;
          resolvedTeeSource = safe(tres.payload.resolvedTeeSource || "fallback");
        }
      }
    } catch (e) {
      console.warn("Tee resolve failed for", player?.ghin, e);
    }

    return { tee: resolvedTee, source: resolvedTeeSource };
  }

  // ── Import — bridges module_sourceImportPlayer.js's onImportMany callback
  //   to the existing tee-picker flow. No tee logic lives in the module —
  //   same division of labor as beginTeeFlow()/beginBatchTeeFlow() for every
  //   other source module. Uses a fixed proxy player (not derived from the
  //   actual batch), matching the pattern the old inline Import flow already
  //   established — Import batches are routinely mixed-gender, so deriving
  //   the picker's proxy from the batch (as beginBatchTeeFlow does for
  //   Favorites' single-gender-constrained multi-add) doesn't apply here.
  function beginImportTeeFlow(players){
    if (!players || !players.length) return;

    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();
    const proxyPlayer = { ghin: safe(state.context?.userGHIN || "0"), gender: "M", hi: "0" };

    MA.TeeSetSelection.open({
      mode: "batch-setup",
      gameId,
      player: proxyPlayer,
      subtitle: `Select fallback tee for ${players.length} player${players.length !== 1 ? "s" : ""}`,
      onSaveBatch: async ({ selectedTee, forceAssign }) => {
        state.batchFallbackTee = selectedTee;
        state.batchForceAssign = !!forceAssign;
        await commitImportPlayers(players);
      }
    });
  }

  async function commitImportPlayers(players){
    if (!players.length || !state.batchFallbackTee) return;
    showBusyModal(`Importing ${players.length} player${players.length !== 1 ? "s" : ""}...`);

    let added = 0;
    let failed = 0;

    try {
      let index = 0;
      for (const player of players) {
        index += 1;
        updateBusyModal(`Importing ${index} of ${players.length} players...`);

        const { tee } = await resolveTeeForPlayer(player, "");
        const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee: tee });
        if (res?.ok) added++;
        else failed++;
      }

      await refreshPlayers();
      renderRoster();
      render();

      if (failed) MA.ui.notify(`Imported ${added} player${added !== 1 ? "s" : ""}. ${failed} failed.`, "warn");
      else MA.ui.notify(`Imported ${added} player${added !== 1 ? "s" : ""}.`, "success");
    } finally {
      hideBusyModal();
    }
  }


  // Delegates to MA.ui (ma_shared.js) instead of building its own overlay —
  // removes this file's own maModalOverlay markup and its own (incorrect,
  // document.body-targeted) maOverlayOpen toggle. Call sites throughout this
  // file are unchanged.
  function showBusyModal(message){
    MA.ui.showBusy({ title: "Working", message: message || "Processing..." });
  }

  function updateBusyModal(message){
    MA.ui.updateBusy({ message: message || "Processing..." });
  }

  function hideBusyModal(){
    MA.ui.hideBusy();
  }

  function formatDate(s) {
    if (!s) return "";
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

  // Breaks a YYYY-MM-DD date into the three parts needed by .maDateBadge
  function formatGameDateBadge(s) {
    if (!s) return { top: "", mid: "", bot: "" };
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return { top: "", mid: String(s), bot: "" };
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const yr  = String(d.getFullYear()).slice(-2);
    const day = String(d.getDate());
    const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
    return { top: `${mon}'${yr}`, mid: day, bot: dow };
  }


  // ── Roster canvas — always rendered, independent of active tray tab ────────
  function renderRoster(){
    const favoriteSet = new Set((state.favorites || []).map((f) => safe(f.playerGHIN)));
    const teamConfig = (window.__MA_INIT__ || {}).teamConfig || null;

    const sortedPlayers = [...state.players].sort((a, b) => {
      const s = state.rosterSort;
      if (s === "hi") return (parseFloat(a.dbPlayers_HI) || 999) - (parseFloat(b.dbPlayers_HI) || 999);
      if (s === "ch") return (parseFloat(a.dbPlayers_CH) || 999) - (parseFloat(b.dbPlayers_CH) || 999);
      if (s === "team") {
        const keyA = safe(a.dbPlayers_TeamKey);
        const keyB = safe(b.dbPlayers_TeamKey);
        const teamA = keyA ? (teamConfig ? ((teamConfig.teams || []).find(t => t.id === keyA)?.name || keyA) : keyA) : "\x00";
        const teamB = keyB ? (teamConfig ? ((teamConfig.teams || []).find(t => t.id === keyB)?.name || keyB) : keyB) : "\x00";
        const cmp = teamA.localeCompare(teamB);
        if (cmp !== 0) return cmp;
      }
      return safe(a.dbPlayers_LName + a.dbPlayers_Name).localeCompare(safe(b.dbPlayers_LName + b.dbPlayers_Name));
    });

    // Build team color lookup for group headers (keyed by team id)
    const teamColorMap = {};
    if (teamConfig) {
      (teamConfig.teams || []).forEach((t, i) => {
        teamColorMap[t.id] = i === 0 ? "red" : "blue";
      });
    }

    let lastGroupKey = undefined;
    const rows = sortedPlayers.map((p) => {
      const ghin = safe(p.dbPlayers_PlayerGHIN);
      const isFav = favoriteSet.has(ghin);
      const hi = safe(p.dbPlayers_HI || "");
      const ch = safe(p.dbPlayers_CH || "");
      const ph = safe(p.dbPlayers_PH || "");
      const so = safe(p.dbPlayers_SO);
      const pairing = safe(p.dbPlayers_PairingID || "");
      const teamKey  = safe(p.dbPlayers_TeamKey || "");
      const teamName = teamKey && teamConfig ? (teamConfig.teams || []).find(t => t.id === teamKey)?.name || "" : "";
      const meta = [hi && `HI ${hi}`, ch && `CH ${ch}`, ph && `PH ${ph}`, so && `SO ${so}`, pairing, teamName].filter(Boolean).join(" · ");
      const teeName = safe(p.dbPlayers_TeeSetName || "");
      const nameLine = teeName ? `${safe(p.dbPlayers_Name)} · ${teeName}` : safe(p.dbPlayers_Name);

//      const heartIcon = isFav
//        ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
//        : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
      //BLUE HEART ICON
      const heartIcon = isFav
        ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#0066CC"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0066CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

      const rowHtml = `<div class="maListRow gpRow gpRow--roster" data-ghin="${esc(ghin)}">
        <div class="maListRow__col">${esc(nameLine)}<div class="maListRow__col--muted gpSub">${esc(meta)}</div></div>
        <button class="iconBtn btnSecondary" data-act="fav" title="Favorites" aria-label="Favorites">${heartIcon}</button>
        <button class="iconBtn btnPrimary" data-act="del" title="Remove" aria-label="Remove"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>`;

      if (state.rosterSort === "team" && teamKey !== lastGroupKey) {
        lastGroupKey = teamKey;
        const color = teamKey ? (teamColorMap[teamKey] || "none") : "none";
        const label = teamKey ? (teamName || teamKey) : "No Team";
        const headerHtml = `<div class="maListRow__group maListRow__group--${esc(color)}">${esc(label)}</div>`;
        return headerHtml + rowHtml;
      }

      return rowHtml;
    }).join("");

    el.rosterBody.innerHTML = `<div class="maListRows">${rows || `<div class="gpEmpty">No players registered yet.</div>`}</div>`;

    el.rosterBody.querySelectorAll("button[data-act='del']").forEach(b => b.onclick = onDeleteRow);
    el.rosterBody.querySelectorAll("button[data-act='fav']").forEach(b => b.onclick = onRowFavorite);
    el.rosterBody.querySelectorAll(".gpRow[data-ghin]").forEach(row => {
      row.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("button[data-act]");
        if (actionBtn) return;
        const ghin = row.getAttribute("data-ghin");
        if (!ghin) return;
        const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
        if (!p) return;
        beginTeeFlow({
          ghin: safe(p.dbPlayers_PlayerGHIN),
          first_name: safe(p.dbPlayers_Name).split(" ").slice(0,-1).join(" "),
          last_name: safe(p.dbPlayers_LName),
          gender: safe(p.dbPlayers_Gender),
          hi: safe(p.dbPlayers_HI),
          selectedTeeSetId: safe(p.dbPlayers_TeeSetID)
        });
      });
    });

    const count = state.players.length;
    if (el.rosterCount) el.rosterCount.textContent = count ? `${count} players` : "";
  }

  // ── Canvas controls — sort strip + HCP date ───────────────────────────────
  function renderCanvasControls(){
    const g = state.game || {};
    const eff = g.dbGames_HCEffectivity || "PlayDate";
    let hcLabel = "HCP as of Play Date";
    if (eff === "Low12") hcLabel = "HCP: 12m Low";
    else if (eff === "Low6") hcLabel = "HCP: 6m Low";
    else if (eff === "Low3") hcLabel = "HCP: 3m Low";
    else if (eff === "Date") {
      const d = g.dbGames_HCEffectivityDate || "Date";
      hcLabel = `HCP as of ${d}`;
    }

    const sorts = [
      { id: "name", label: "Name" },
      { id: "team", label: "Team" },
      { id: "hi",   label: "HI"   },
      { id: "ch",   label: "CH"   },
    ];

    const sortStrip = `<div style="display:flex; gap:4px; background:var(--surfaceApp); border-radius:var(--radiusMd); padding:2px;" role="group" aria-label="Sort roster by">
      ${sorts.map(s => `<button class="maSeg--sortBtn ${state.rosterSort === s.id ? "is-active" : ""}" type="button" data-roster-sort="${esc(s.id)}">${esc(s.label)}</button>`).join("")}
    </div>`;

    // Promoted from Actions-menu-only to a visible canvas button, matching
    // Event Roster's Refresh Handicaps. Never disabled on gross games —
    // per the earlier decision, this action already self-guards server-side
    // (resets to 0, skips GHIN calls) rather than being disabled in the UI,
    // and that decision applies everywhere this action appears, not just
    // its original Actions-menu home.
    const recalcBtn = `<button id="gpBtnRecalcHandicaps" class="btn btnSecondary" type="button">Recalculate Handicaps</button>`;

    el.canvasControls.innerHTML = `
      <div class="gpCanvasControls">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:11px; font-weight:500; color:var(--mutedText); white-space:nowrap;">Sort:</span>
          ${sortStrip}
        </div>
        <div class="gpCanvasControls__right maDesktopActions">
          ${recalcBtn}
          <span class="gpHcpDate">${esc(hcLabel)}</span>
        </div>
      </div>`;

    el.canvasControls.querySelectorAll("[data-roster-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.rosterSort = btn.dataset.rosterSort;
        renderCanvasControls();
        renderRoster();
      });
    });

    const recalcButton = document.getElementById("gpBtnRecalcHandicaps");
    if (recalcButton) recalcButton.onclick = onRecalcHandicaps;
  }


  // ── Page-level event wiring — mobile tray toggle ─────────────────────────
  function wirePageEvents(){
    const maPage = document.querySelector(".maPage--players");

    if (el.btnTrayOpen) {
      el.btnTrayOpen.addEventListener("click", () => {
        if (maPage) maPage.classList.add("is-tray-open");
      });
    }

    if (el.mobileCloseBtn) {
      el.mobileCloseBtn.addEventListener("click", () => {
        if (maPage) maPage.classList.remove("is-tray-open");
      });
    }
  }

  async function boot(){
    applyChrome();
    wirePageEvents();
    await refreshPlayers();
    render();
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { category: "Admin Services" },
      { label: "Display Game Settings", indent: true, action: () => MA.gameDetails.open(state.game) },
      { label: "Recalculate Handicaps",    indent: true, action: onRecalcHandicaps },
      { category: "Messaging and Calendar" },
      { label: "Send Message to Players", indent: true, action: onNotify },
      { label: "Add Game to Calendar",  indent: true, action: downloadIcsForGame },
      { category: "Advanced Features" },
      { label: "Manage Teams",   indent: true, action: onManageTeams },
      { label: "Define Flights", indent: true, action: onDefineFlights },
    ]);
  }

  // Teams/Flights modules are self-contained — they fetch their own
  // context server-side, unlike Display Game Settings which needs the
  // current game row handed to it. onDone refreshes the roster: this
  // page displays team/flight assignments directly, so without this the
  // roster would show stale data immediately after either modal closes.
  // Matches the existing refreshPlayers()+render() sequence used
  // elsewhere in this file (see boot()).
  async function onTeamsOrFlightsDone() {
    await refreshPlayers();
    render();
  }

  function onManageTeams() {
    if (!MA.manageTeams || typeof MA.manageTeams.open !== "function") {
      MA.ui.notify("Manage Teams module not loaded.", "error");
      return;
    }
    MA.manageTeams.open({ target: "game", onDone: onTeamsOrFlightsDone });
  }

  function onDefineFlights() {
    if (!MA.defineFlights || typeof MA.defineFlights.open !== "function") {
      MA.ui.notify("Define Flights module not loaded.", "error");
      return;
    }
    MA.defineFlights.open({ target: "game", onDone: onTeamsOrFlightsDone });
  }

  function onRecalcHandicaps() {
    if (!ggid) return;
    MA.recalculateHandicaps(MA.paths?.apiGHIN);
  }

  function downloadIcsForGame() {
    if (MA.calendar && MA.calendar.addCalendarEventFromGame) {
      MA.calendar.addCalendarEventFromGame(state.game);
    } else {
      MA.ui.notify("Calendar module not loaded.", "error");
    }
  }

  function onNotify() {
    if (!ggid) return;
    if (MA.notify && typeof MA.notify.open === "function") {
      MA.notify.open({
        ggid:    ggid,
        apiPath: MA.paths?.apiNotify,
      });
    } else {
      if (typeof MA.setStatus === "function") MA.ui.notify("Messaging module not loaded.", "error");
    }
  }

  function applyChrome(){
    const g = state.game || {};
    const title = String(g.dbGames_Title || "Game");
    const course = String(g.dbGames_CourseName || "");
    const date = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");
    const isEvent = isEventMode();

    if (MA.chrome && MA.chrome.setHeaderLines) MA.chrome.setHeaderLines([isEvent ? "Round Roster" : "Game Players", title, subTitle]);
    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left: { show:false }
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      const isPlayer = (state.portal === "PLAYER PORTAL");
      const visible = isPlayer
        ? ["player", "roster", "summary"]
        : isEvent
          ? ["eventrounds", "roundedit", "roundsettings", "roundroster", "roundpairings", "roundteetimes", "roundsummary", "roundscorecard"]
          : ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"];

      MA.chrome.setBottomNav({
        visible: visible,
        root: isPlayer ? ["player"] : (isEvent ? ["eventrounds"] : ["admin"]),
        active: isEvent ? "roundroster" : "roster",
        onNavigate:(id)=>MA.routerGo(id)
      });
    }
  }

  async function refreshPlayers(){
    const res = await MA.postJson(MA.paths.gamePlayersGet, {});
    if (!res?.ok) throw new Error(res?.message || "Load failed");
    state.players = Array.isArray(res.payload?.players) ? res.payload.players : [];
    state.game = res.payload?.game || state.game;
    state.context = res.payload?.context || state.context;
  }

  function renderTabs(){
    const tabs = getTabs();
    const stripHtml = `<div class="maSeg">${
      tabs.map(t => `<button class="maSegBtn ${state.activeTab === t.id ? "is-active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${state.activeTab === t.id ? "true" : "false"}">${esc(t.label)}</button>`).join("")
    }</div>`;

    el.trayTabs.innerHTML = stripHtml;

    el.trayTabs.querySelectorAll(".maSegBtn").forEach(btn => btn.addEventListener("click", async () => {
      const leaving = state.activeTab;

      // Module cleanup on tab away
      if (leaving === "favorites") {
        const p = findTabPanel(el.trayControls, "favorites");
        if (p) MA.favoritesSource.cancelMultiAdd(p);
      }
      if (leaving === "nonrated") {
        const p = findTabPanel(el.trayControls, "nonrated");
        if (p) MA.nonRatedSource.clearSelection(p);
      }
      if (leaving === "import") {
        const p = findTabPanel(el.trayControls, "import");
        if (p) MA.importPlayerSource.cancel(p);
      }

      state.activeTab = btn.dataset.tab;
      render();
    }));
  }

  /**
   * getTabPanel(parentEl, tabId) — keep-alive tab panel helper.
   *
   * el.trayControls and el.trayBody are single shared DOM nodes reused by
   * every source module (Favorites, GHIN Search, Non-Rated, Event Roster).
   * Each of those modules keeps its own WeakMap-keyed "already mounted"
   * state so that switching away and back preserves filters/search results/
   * scroll position — but that only works if the DOM node it was keyed on
   * still contains ITS markup. Because the node was shared, a sibling module
   * could overwrite it, and the original module's "already mounted" check
   * would then skip rebuilding controls it no longer actually owned.
   *
   * Fix: give each tab its own permanent child container under the shared
   * parent, and just show/hide between them. Every module gets a stable,
   * dedicated node that only it ever writes to, so its sticky state is
   * always valid — and real DOM (scroll position, in-progress typed text)
   * survives a tab switch untouched, not just whatever each module
   * separately remembered to track in JS.
   */
  function getTabPanel(parentEl, tabId){
    if (!parentEl) return null;
    const selector = `:scope > [data-tab-panel="${tabId}"]`;
    let node = parentEl.querySelector(selector);
    if (!node) {
      node = document.createElement("div");
      node.setAttribute("data-tab-panel", tabId);
      parentEl.appendChild(node);
    }
    Array.from(parentEl.children).forEach(child => {
      child.style.display = (child === node) ? "" : "none";
    });
    return node;
  }

  // Pure lookup — unlike getTabPanel(), never creates a panel and never
  // touches visibility. Used by cleanup/refresh call sites that need "the
  // element this module's state is keyed on, if it exists" without forcing
  // that panel visible (which would fight with whichever tab is actually
  // being switched to in the same handler).
  function findTabPanel(parentEl, tabId){
    if (!parentEl) return null;
    return parentEl.querySelector(`:scope > [data-tab-panel="${tabId}"]`);
  }

  function render(){
    renderTabs();
    renderTrayControls();
    renderTrayBody();
    renderRoster();
    renderCanvasControls();
  }

  function renderTrayControls(){

    if (el.trayFtr) {
      el.trayFtr.innerHTML = `<div class="gpFooter gpFooter--tray">
        <button class="btn btnSecondary gsMobileReturnBtn" id="gpBtnTrayClose" type="button">
          ← Return to Roster
        </button>
      </div>`;
      const btnClose = document.getElementById("gpBtnTrayClose");
      if (btnClose) btnClose.onclick = () => {
        const maPage = document.querySelector(".maPage--players");
        if (maPage) maPage.classList.remove("is-tray-open");
      };
    }

    if (state.activeTab === "eventroster") {
      MA.eventRosterSource.mount({
        controlsEl:    getTabPanel(el.trayControls, "eventroster"),
        bodyEl:        getTabPanel(el.trayBody, "eventroster"),
        eventId:       safe(state.game?.dbGames_EID || ""),
        apiPath:       MA.paths.getEventRoster,
        existingGHINs: new Set(
          (state.players || []).map(p => safe(p.dbPlayers_PlayerGHIN))
        ),
        onSelect(player)      { beginTeeFlow(player); },
        onSelectMany(players) { beginBatchTeeFlow(players); }
      });
      return;
    }

    if (state.activeTab === "ghin") {
      MA.ghinSearch.mount({
        controlsEl:    getTabPanel(el.trayControls, "ghin"),
        bodyEl:        getTabPanel(el.trayBody, "ghin"),
        footerEl:      null,
        defaultState:  normalizeState(state.context.userState || ""),
        existingGHINs: new Set(
          (state.players || []).map(p => safe(p.dbPlayers_PlayerGHIN))
        ),
        onSelect(player) { beginTeeFlow(player); }
      });
      return;
    }

    if (state.activeTab === "favorites") {
      MA.favoritesSource.mount({
        controlsEl:    getTabPanel(el.trayControls, "favorites"),
        bodyEl:        getTabPanel(el.trayBody, "favorites"),
        footerEl:      el.trayFtr,
        apiPath:       MA.paths.favPlayersInit,
        courseId:      safe(state.game?.dbGames_CourseID),
        context:       state.context,
        initialData:   { favorites: state.favorites, groups: state.groups },
        existingGHINs: new Set(
          (state.players || []).map(p => safe(p.dbPlayers_PlayerGHIN))
        ),
        source:        "gameplayers",
        onSelect(player)       { beginTeeFlow(player); },
        onSelectMany(players)  { beginBatchTeeFlow(players); }
      });
      return;
    }

    if (state.activeTab === "nonrated") {
      MA.nonRatedSource.mount({
        controlsEl:      getTabPanel(el.trayControls, "nonrated"),
        bodyEl:          getTabPanel(el.trayBody, "nonrated"),
        footerEl:        null,
        existingPlayers: state.players || [],
        onAdd({ first_name, last_name, gender, hi }) {
          const ghin = `NH${Date.now()}${Math.floor(Math.random() * 1000)}`;
          beginTeeFlow({ ghin, first_name, last_name, gender, hi, source: "nonrated" });
        },
        onUpdate(player, existingTee) {
          upsertNonRated(player, existingTee);
        }
      });
      return;
    }

    if (state.activeTab === "import") {
      // No tee logic in this call — same division of labor as every other
      // source module. modes:["external","game"] — flat games do NOT get
      // Existing Event (that's Events-only, per the agreed scope table).
      // gamePlayersEventImport is pointed at the existing, tee-aware
      // getImportPlayers.php rather than the event-only endpoint — the
      // module only ever reads ghin/playerName/gender/alreadyOnRoster off
      // the response, so getImportPlayers.php's extra tee fields are simply
      // ignored, not consumed. Nothing forwards them; beginImportTeeFlow()
      // re-resolves tees live either way, same as the External List path.
      MA.importPlayerSource.mount({
        controlsEl:    getTabPanel(el.trayControls, "import"),
        bodyEl:        getTabPanel(el.trayBody, "import"),
        footerEl:      el.trayFtr,
        modes:         ["external", "game"],
        excludeGGID:   ggid,
        existingGHINs: new Set(
          (state.players || []).map(p => safe(p.dbPlayers_PlayerGHIN))
        ),
        paths: {
          resolveIdentifiers:    MA.paths.resolveImportIdentifiers,
          ghinSearch:            MA.paths.ghinPlayerSearch,
          sourceGames:           MA.paths.importSourceGames,
          gamePlayersEventImport: MA.paths.getImportPlayers,
        },
        onImportMany(players) { beginImportTeeFlow(players); }
      });
      return;
    }

  }

function renderTrayBody(){
    // GHIN, Favorites, and Non-Rated body content is owned by their
    // respective source modules — mount() in renderTrayControls() handles it.
    if (state.activeTab === "ghin")         return;
    if (state.activeTab === "favorites")    return;
    if (state.activeTab === "nonrated")     return;
    if (state.activeTab === "eventroster")  return;
    if (state.activeTab === "import")       return;

  }

  // ── Non-Rated: page-level upsert called from onUpdate callback ────────────
  async function upsertNonRated(player, existingTee) {
    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee: existingTee });
    if (!res?.ok) {
      MA.ui.notify(res?.message || "Unable to update player.", "danger");
      return;
    }
    const nonRatedControls = getTabPanel(el.trayControls, "nonrated");
    const nonRatedBody     = getTabPanel(el.trayBody, "nonrated");
    MA.nonRatedSource.clearSelection(nonRatedControls);
    await refreshPlayers();
    renderRoster();
    MA.nonRatedSource.mount({
      controlsEl:      nonRatedControls,
      bodyEl:          nonRatedBody,
      existingPlayers: state.players || [],
    });
    MA.ui.notify("Player updated.", "success");
  }

  async function beginBatchTeeFlow(players){
    // players is a pre-filtered, normalized array delivered by MA.favoritesSource
    if (!players || !players.length) {
      MA.ui.notify("Select at least one favorite.", "warn");
      return;
    }

    const genders = Array.from(new Set(players.map(p => safe(p.gender || "").toUpperCase()).filter(Boolean)));
    if (genders.length > 1) {
      MA.ui.notify("Multi-Add currently requires selected favorites to share the same gender.", "warn");
      return;
    }

    const firstRow = players[0];
    const proxyPlayer = {
      ghin:       safe(firstRow.ghin),
      first_name: safe(firstRow.first_name),
      last_name:  safe(firstRow.last_name),
      gender:     safe(firstRow.gender || "M"),
      hi:         safe(firstRow.hi || "0")
    };

    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();

    MA.TeeSetSelection.open({
      mode: "batch",
      gameId,
      player: proxyPlayer,
      subtitle: `Apply one tee to ${players.length} selected players`,
      onSaveBatch: async ({ selectedTee, forceAssign }) => {
        state.batchFallbackTee = selectedTee;
        state.batchForceAssign = !!forceAssign;
        await commitBatchPending(players);
      }
    });
  }

  async function commitBatchPending(players){
    if (!players.length || !state.batchFallbackTee) return;
    showBusyModal(`Adding ${players.length} selected favorites...`);

    let added = 0;
    let failed = 0;

    try {
      let index = 0;
      for (const player of players) {
        index += 1;
        updateBusyModal(`Adding ${index} of ${players.length} selected favorites...`);

        let resolvedTee = state.batchFallbackTee;
        if (!state.batchForceAssign) {
          try {
            const apiPath = (MA.paths?.apiGHIN || "/api/GHIN") + "/getTeeSets.php";
            const tres = await MA.postJson(apiPath, {
              player,
              mode: "resolve",
              sourceGameTeeSetId: ""
            });
            if (tres?.ok && tres.payload?.resolvedTeeId) {
              const allTees = Array.isArray(tres.payload?.teeSets) ? tres.payload.teeSets : [];
              const match = allTees.find(t =>
                safe(t.teeSetID || t.value || "") === safe(tres.payload.resolvedTeeId)
              );
              if (match) resolvedTee = match;
            }
          } catch (e) {
            console.warn("Tee resolve failed for", player.ghin, e);
          }
        }

        const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee: resolvedTee });
        if (res?.ok) added++;
        else failed++;
      }

      await refreshPlayers();
      renderRoster();
      render();

      if (state.activeTab === "favorites") {
        // Multi-add only: clear the favorites module's multiAddMode/selection
        // state, which a plain re-mount (already done inside render() above)
        // intentionally leaves untouched. Mirrors event_roster.js enrollMany.
        const p = findTabPanel(el.trayControls, "favorites");
        if (p) MA.favoritesSource.refresh(p);
      }

      if (failed) MA.ui.notify(`Added ${added} favorites. ${failed} failed.`, "warn");
      else MA.ui.notify(`Added ${added} favorites.`, "success");
    } finally {
      hideBusyModal();
    }
  }

  async function beginTeeFlow(player){
    state.pendingPlayer = Object.assign({}, player);

    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();

    MA.TeeSetSelection.open({
      gameId,
      player: state.pendingPlayer,
      currentTeeSetId: safe(state.pendingPlayer.selectedTeeSetId || ""),
      recentTeeSetId: safe(state.pendingPlayer.recentTeeSetId || ""),
      courseConfirmed: !!(state.game?.dbGames_CourseConfirmed == 1 || state.game?.dbGames_CourseConfirmed === true),
      onSave: async (selectedTee) => {
        state.selectedTee = selectedTee || null;
        await commitPending();
      }
    });
  }

  async function commitPending(){
    if (!state.pendingPlayer || !state.selectedTee) return;

    const ghin = safe(state.pendingPlayer.ghin);
    const existing = state.players.find(p => safe(p.dbPlayers_PlayerGHIN) === ghin);
    let wasPaired = false;
    if (existing) {
      // Ruleset (spec Section 3.2.1): paired AND slotted into a playing
      // group. MatchID-vs-PlayerKey grouping is resolved server-side in
      // be_calculateGamePHSO()'s "player" action — this gate only decides
      // whether to call it at all, not how it groups.
      const pairingId = safe(existing.dbPlayers_PairingID || "000");
      const playerKey = safe(existing.dbPlayers_PlayerKey || "");
      wasPaired = (pairingId !== "000") && (playerKey !== "");
    }
    // into the db_Players upsert so TeamKey and PairingID cascade correctly.
    const player = Object.assign({}, state.pendingPlayer);
    if (player.source === "eventRoster") {
      player.teamKey   = safe(player.teamKey   || "");
      player.pairingId = safe(player.pairingId || "");
      player.pairingPos= safe(player.pairingPos|| "");
    }

    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee: state.selectedTee });
    if (!res?.ok) {
      MA.ui.notify(res?.message || "Unable to save player", "danger");
      return;
    }
    if (ghin.startsWith("NH")) MA.ghinSearch.close && MA.ghinSearch.close();
    state.pendingPlayer = null;
    if (ghin.startsWith("NH")) {
      const p = findTabPanel(el.trayControls, "nonrated");
      if (p) MA.nonRatedSource.clearForm(p);
    }

    if (wasPaired) {
      MA.ui.notify("Calculating shots off...", "info");
      try {
        await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "player", id: ghin });
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    renderRoster();
    render();
    MA.ui.notify("Player added/updated.", "success");
  }

  async function onDeleteRow(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;

    const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
    let wasPaired = false;
    let pid = "000";
    let fid = "";
    let comp = "PairField";
    let playerKey = "";

    if (p) {
      comp = state.game?.dbGames_Competition || "PairField";
      pid = safe(p.dbPlayers_PairingID || "000");
      fid = safe(p.dbPlayers_MatchID || "");
      playerKey = safe(p.dbPlayers_PlayerKey || "");
      // Ruleset (spec Section 3.2.1): paired AND slotted into a playing
      // group — same gate as commitPending() above. Note: the
      // flight-vs-pairing action choice just below this block still
      // branches on Competition/MatchID directly (unchanged) — that
      // branch targets an explicit remaining-group id after a deletion,
      // not a "resolve group from a player" lookup, so the "player"-
      // action ruleset fix doesn't directly apply to it. Flagged for a
      // separate review rather than folded in here.
      wasPaired = (pid !== "000") && (playerKey !== "");
    }

    try {
      const rawBlind = state.game?.dbGames_BlindPlayers || '[]';
      const blindArr = typeof rawBlind === 'string' ? JSON.parse(rawBlind) : rawBlind;
      const blindGHINs = (Array.isArray(blindArr) ? blindArr : [])
        .filter(b => b.ghin)
        .map(b => String(b.ghin));
      if (blindGHINs.includes(String(ghin))) {
        return MA.ui.notify(
          'This player is the blind player for this game. ' +
          'Remove the blind assignment in Game Settings before deleting.',
          'warn'
        );
      }
    } catch (e) {
      // Non-fatal — let server-side guard handle it
    }

    if (p) {
      try {
        const raw     = p.dbPlayers_Scores || "{}";
        const decoded = typeof raw === "string" ? JSON.parse(raw) : raw;
        const scores  = Array.isArray(decoded?.Scores) ? decoded.Scores : [];
        const scored  = scores.find(s =>
          (s.hole_details ?? []).some(h => (h.adjusted_gross_score ?? 0) > 0)
        );

        if (scored) {
          const playerName  = safe(p.dbPlayers_Name || ghin);
          const holesPlayed = scored.number_of_played_holes ?? scored.hole_details?.length ?? 0;
          const grossScore  = scored.adjusted_gross_score ?? 0;
          const netScore    = scored.net_score ?? 0;

          const statCell = (label, value) => `
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span style="font-size:11px;color:var(--mutedText);font-weight:800;">${label}</span>
              <span style="font-size:18px;font-weight:800;color:var(--ink);">${value}</span>
            </div>`;

          const detail = `
            <div style="
              background:var(--brandPrimaryBg);
              border:1px solid var(--borderSubtle);
              border-radius:var(--radiusMd);
              padding:10px 14px;
              margin:12px 0 0;
              display:flex;
              gap:20px;
            ">
              ${statCell("Holes played", holesPlayed)}
              ${statCell("Gross score",  grossScore)}
              ${statCell("Net score",    netScore)}
            </div>`;

          const confirmed = await MA.ui.confirm({
            title:        "Player has scores",
            message:      `<strong>${playerName}</strong> has scores recorded for this round. Deleting them will permanently erase those scores.<br><br><span style="color:var(--mutedText);font-size:12px;">Are you sure you want to continue?</span>`,
            detail,
            confirmLabel: "Delete anyway",
            danger:       true
          });

          if (!confirmed) return;
        }
      } catch (err) {
        console.warn("Score check failed for", ghin, err);
      }
    }

    const res = await MA.postJson(MA.paths.gamePlayersDelete, { playerGHIN: ghin });
    if (!res?.ok) return MA.ui.notify("Unable to delete player", "danger");

    if (wasPaired) {
      MA.ui.notify("Calculating shots off...", "info");
      try {
        if (comp === "PairPair") {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "flight", id: fid });
        } else {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "pairing", id: pid });
        }
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    renderRoster();
    render();
    MA.ui.notify("Player removed.", "success");
  }

  function onRowFavorite(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;
    MA.postJson(MA.paths.routerApi, { action:"favorites", mode:"registrations", returnTo:"roster", favPlayerGHIN: ghin })
      .then(r => { if (r?.ok && r.redirectUrl) window.location.assign(r.redirectUrl); });
  }

  boot().catch(err => {
    console.error(err);
    MA.ui.notify("Failed to initialize page.", "danger");
  });
})();