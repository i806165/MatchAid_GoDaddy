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
    activeTab: "favorites", // Roster is now the permanent canvas
    game: init.game || {},
    context: init.context || {},
    portal: init.portal || "",
    players: [],
    pendingPlayer: null,
    favorites: [],
    groups: [],
    teeOptions: [],
    selectedTee: null,
    importSourceMode: "external",   // external | existing
    importText: "",
    importRows: [],
    importMode: "entry",            // entry | review
    importBusy: false,
    courseTeePayload: init.courseTeePayload || null,
    importTeeOptions: [],
    importSelectedTeeId: "",
    importSelectedTee: null,
    importSourceGames: [],
    importSourceGameId: "",
    importSourceGameSummary: null,
    importExistingPreviewRows: [],
    importExistingPreviewCount: 0,
    batchFallbackTee: null,      // tee selected in the picker for paths 2, 3, 4
    batchForceAssign: false,     // when true hierarchy is skipped; fallback tee used for all
    rosterSort: "name",  // name | team | hi | ch
  };

  function isImportDesktopEnabled(){
    return window.matchMedia("(min-width: 560px)").matches;
  }

  function getTabs(){
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

  function buildEmptyImportPlayer(){
    return {
      ghin: "",
      first_name: "",
      last_name: "",
      name: "",
      gender: "",
      hi: ""
    };
  }

  function canImportAllRows(){
    // Already-on-roster rows are skipped during commit — they must not
    // block the button. Only require that at least one actionable row
    // exists and that all actionable rows are valid.
    const actionable = state.importRows.filter(r => !r.alreadyOnRoster);
    if (!actionable.length) return false;
    return actionable.every(r => r.ok && !!safe(r.assignedTeeId));
  }

  function hydrateImportTeeOptionsFromPayload(){
    const payload = state.courseTeePayload || {};
    const teeSets = Array.isArray(payload.TeeSets) ? payload.TeeSets : [];

    state.importTeeOptions = teeSets
      .filter(t => safe(t.TeeSetStatus) === "Active")
      .map(t => {
        const totalRating = Array.isArray(t.Ratings)
          ? t.Ratings.find(r => safe(r.RatingType) === "Total")
          : null;

        return {
          teeSetID: safe(t.TeeSetRatingId || ""),
          teeSetName: safe(t.TeeSetRatingName || ""),
          gender: safe(t.Gender || ""),
          teeSetYards: safe(t.TotalYardage || ""),
          teeSetSlope: safe(totalRating?.SlopeRating || ""),
          teeSetRating: safe(totalRating?.CourseRating || "")
        };
      })
      .sort((a, b) => {
        const genderDiff = safe(b.gender).localeCompare(safe(a.gender));
        if (genderDiff !== 0) return genderDiff;
        return Number(b.teeSetYards || 0) - Number(a.teeSetYards || 0);
      });
  }

  async function ensureImportTeeOptions(){
    if (state.importTeeOptions.length) return;

    hydrateImportTeeOptionsFromPayload();

    if (!state.importTeeOptions.length) {
      MA.setStatus("No course tee sets were provided for this game.", "warn");
    }
  }

  function getImportSelectedTee(){
    return state.importTeeOptions.find(t =>
      String(t.teeSetID || t.value || "") === String(state.importSelectedTeeId || "")
    ) || null;
  }

  function getImportTeeById(teeId){
    return state.importTeeOptions.find(t =>
      String(t.teeSetID || t.value || "") === String(teeId || "")
    ) || null;
  }

  function formatAssignedTeeText(tee){
    if (!tee) return "";
    const name = safe(tee.teeSetName || tee.label || tee.name || "");
    const yards = safe(tee.teeSetYards || tee.yards || "");
    return [name, yards ? `${yards} yds` : ""].filter(Boolean).join(" • ");
  }

  function resetImportMode(){
    state.importMode = "entry";
    state.importRows = [];
  }

  function resetExistingGameImport(){
    state.importSourceGameId = "";
    state.importSourceGameSummary = null;
    state.importExistingPreviewRows = [];
    state.importExistingPreviewCount = 0;
    state.importRows = [];
  }

  function resetImportStateForSourceMode(){
    state.importMode = "entry";
    state.importRows = [];
    state.importSelectedTee = null;
    state.importSelectedTeeId = "";
    state.importText = "";
    state.batchFallbackTee = null;
    state.batchForceAssign = false;
    resetExistingGameImport();
  }

  function formatImportSourceGameLabel(g){
    const playDate = formatDate(safe(g.playDate || g.dbGames_PlayDate || ""));
    const title = safe(g.title || g.dbGames_Title || "Game");
    const course = safe(g.courseName || g.dbGames_CourseName || "");
    return [playDate, title, course].filter(Boolean).join(" • ");
  }

  async function ensureImportSourceGames(){
    if (state.importSourceGames.length) return;

    const res = await MA.postJson(MA.paths.importSourceGames, {});
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to load source games.", "warn");
      return;
    }

    state.importSourceGames = Array.isArray(res.payload?.games) ? res.payload.games : [];
  }

  // Opens the picker for path 4 (copy from game).
  // Called both on initial game selection and when user taps "Change" in the summary bar.
  function openBatchPickerForExisting(){
    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();
    const proxyPlayer = { ghin: safe(state.context?.userGHIN || "0"), gender: "M", hi: "0" };

    MA.TeeSetSelection.open({
      mode: "batch-setup",
      gameId,
      player: proxyPlayer,
      subtitle: "Select fallback tee for game import",
      onSaveBatch: async ({ selectedTee, forceAssign }) => {
        state.batchFallbackTee = selectedTee;
        state.batchForceAssign = !!forceAssign;
        await runExistingGameResolve();
        render();
      }
    });
  }

  async function loadExistingGamePreview(sourceGameId){
    state.importExistingPreviewRows = [];
    state.importExistingPreviewCount = 0;
    state.importSourceGameSummary = null;
    state.importMode = "entry";
    state.batchFallbackTee = null;
    state.batchForceAssign = false;

    if (!safe(sourceGameId)) {
      render();
      return;
    }

    state.importBusy = true;
    showBusyModal("Loading players from source game...");

    try {
      const res = await MA.postJson(MA.paths.getImportPlayers, {
        sourceGGID: safe(sourceGameId)
      });

      if (!res?.ok) {
        MA.setStatus(res?.message || "Unable to preview source game.", "danger");
        return;
      }

      state.importSourceGameSummary  = res.payload?.sourceGame || null;
      state.importExistingPreviewRows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
      state.importExistingPreviewCount = num(res.payload?.playerCount || state.importExistingPreviewRows.length);

      // Build importRows from preview — tee resolution runs after picker confirms.
      state.importRows = state.importExistingPreviewRows.map((r) => {
        const nm = splitName(r.playerName || "");
        return {
          source:           "existing_game",
          raw:              "",
          ghin:             safe(r.ghin || ""),
          ok:               !r.alreadyOnRoster && !!safe(r.assignedTeeId || ""),
          status:           r.alreadyOnRoster ? "Already in roster" : "OK",
          error:            r.alreadyOnRoster ? "Player is already in the roster" : "",
          player: {
            ghin:       safe(r.ghin || ""),
            first_name: safe(nm.first),
            last_name:  safe(nm.last),
            name:       safe(r.playerName || ""),
            gender:     safe(r.gender || ""),
            hi:         safe(r.hi || ""),
            // Team key — stable slot ID ('T1'/'T2'/'') carried from source game.
            // Display name resolves at render time from destination game's teamConfig.
            // Dormant if destination game has no teamConfig; never causes harm.
            teamKey:    safe(r.dbPlayers_TeamKey || "")
          },
          sourceTeeId:       safe(r.sourceTeeId || ""),
          sourceTeeText:     safe(r.sourceTeeText || ""),
          assignedTeeId:     safe(r.assignedTeeId || ""),
          assignedTeeText:   safe(r.assignedTeeText || ""),
          resolvedTeeSource: safe(r.resolvedTeeSource || ""),
          alreadyOnRoster:   !!r.alreadyOnRoster
        };
      });

      MA.setStatus(`Loaded ${state.importExistingPreviewCount} players. Select a fallback tee to continue.`, "info");
    } finally {
      state.importBusy = false;
      hideBusyModal();
    }

    // Open picker immediately after loading — user must set fallback tee before
    // the hierarchy runs and the preview table populates.
    openBatchPickerForExisting();
  }

  // Runs tee resolution for existing-game rows using the hierarchy.
  // Called after the picker confirms a fallback tee and toggle state.
  async function runExistingGameResolve(){
    if (state.importBusy) return;
    state.importBusy = true;
    showBusyModal("Resolving tee assignments...");

    const apiPath  = (MA.paths?.apiGHIN || "/api/GHIN") + "/getTeeSets.php";

    try {
      const updatedRows = [];
      let index = 0;

      for (const row of state.importRows) {
        index += 1;
        updateBusyModal(`Resolving ${index} of ${state.importRows.length} players...`);

        // Already-on-roster rows pass through unchanged.
        if (row.alreadyOnRoster) {
          updatedRows.push(row);
          continue;
        }

        let resolvedTee       = state.batchFallbackTee;
        let resolvedTeeSource = "fallback";

        if (!state.batchForceAssign) {
          // Tier 1 (same-course carry) is attempted first by passing the
          // source tee ID to getTeeSets.php as sourceGameTeeSetId.
          // Tiers 2 and 3 are handled server-side.
          try {
            const tres = await MA.postJson(apiPath, {
              player:             row.player,
              mode:               "resolve",
              sourceGameTeeSetId: safe(row.sourceTeeId || "")
            });
            if (tres?.ok && tres.payload?.resolvedTeeId) {
              const allTees = Array.isArray(tres.payload?.teeSets) ? tres.payload.teeSets : [];
              const match = allTees.find(t =>
                safe(t.teeSetID || t.value || "") === safe(tres.payload.resolvedTeeId)
              );
              if (match) {
                resolvedTee       = match;
                resolvedTeeSource = safe(tres.payload.resolvedTeeSource || "fallback");
              }
            }
          } catch (e) {
            console.warn("Tee resolve failed for", row.ghin, e);
          }
        } else {
          resolvedTeeSource = "force_assigned";
        }

        updatedRows.push({
          ...row,
          assignedTeeId:     safe(resolvedTee?.teeSetID || resolvedTee?.value || ""),
          assignedTeeText:   formatAssignedTeeText(resolvedTee),
          resolvedTeeSource: resolvedTeeSource,
          ok:                !!safe(resolvedTee?.teeSetID || resolvedTee?.value || "")
        });
      }

      state.importRows  = updatedRows;
      // Sync preview rows so the table re-renders with resolved tees.
      state.importExistingPreviewRows = updatedRows.map(r => ({
        ghin:              r.ghin,
        playerName:        safe(r.player?.name || ""),
        hi:                safe(r.player?.hi   || ""),
        gender:            safe(r.player?.gender || ""),
        sourceTeeId:       r.sourceTeeId,
        sourceTeeText:     r.sourceTeeText,
        assignedTeeId:     r.assignedTeeId,
        assignedTeeText:   r.assignedTeeText,
        resolvedTeeSource: r.resolvedTeeSource,
        alreadyOnRoster:   r.alreadyOnRoster
      }));

      state.importMode = "review";
      MA.setStatus(`Tee assignments resolved for ${updatedRows.filter(r => !r.alreadyOnRoster).length} players.`, "success");
    } finally {
      state.importBusy = false;
      hideBusyModal();
    }
  }

  function showBusyModal(message){
    let overlay = document.getElementById("gpBusyModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "gpBusyModal";
      overlay.className = "maModalOverlay is-open";
      overlay.innerHTML = `
        <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="gpBusyTitle">
          <header class="maModal__hdr">
            <div id="gpBusyTitle" class="maModal__title">Working</div>
          </header>
          <div class="maModal__body">
            <div id="gpBusyMessage" class="gpBusyMessage"></div>
          </div>
        </section>
      `;
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add("is-open");
    }

    const msg = document.getElementById("gpBusyMessage");
    if (msg) msg.textContent = message || "Processing...";
    document.body.classList.add("maOverlayOpen");
  }

  function updateBusyModal(message){
    const msg = document.getElementById("gpBusyMessage");
    if (msg) msg.textContent = message || "Processing...";
  }

  function hideBusyModal(){
    const overlay = document.getElementById("gpBusyModal");
    if (overlay) overlay.classList.remove("is-open");
    document.body.classList.remove("maOverlayOpen");
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

  // ── Canvas controls — sort strip + Manage Teams + HCP date ────────────────
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

    const teamsBtn = `<button id="gpBtnManageTeams" class="btn btnSecondary" type="button">Manage Teams</button>`;

    el.canvasControls.innerHTML = `
      <div class="gpCanvasControls">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:11px; font-weight:500; color:var(--mutedText); white-space:nowrap;">Sort:</span>
          ${sortStrip}
        </div>
        <div class="gpCanvasControls__right">
          ${teamsBtn}
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

    const teamsButton = document.getElementById("gpBtnManageTeams");
    if (teamsButton) teamsButton.onclick = onManageTeams;
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
    await refreshFavorites();
    if (isImportDesktopEnabled()) await ensureImportTeeOptions();
    render();
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "Recalculate Handicaps",   action: onRecalcHandicaps },
      { label: "Send Message to Players", action: onNotify },
    ]);
  }

  function onManageTeams() {
    if (!MA.manageTeams || typeof MA.manageTeams.open !== "function") {
      MA.setStatus("Manage Teams module not loaded.", "warn");
      return;
    }
    const teamConfig = (window.__MA_INIT__ || {}).teamConfig || {
      teams: [
        { id: "T1", name: "Red",  color: "red",  sort: 1 },
        { id: "T2", name: "Blue", color: "blue", sort: 2 },
      ]
    };
    MA.manageTeams.open({
      players:    state.players,
      teamConfig,
      apiBase:    MA.paths?.apiGamePlayers || "/api/game_players",
      onApply: ({ players, teamConfig }) => {
        if (Array.isArray(players) && players.length) {
          players.forEach(saved => {
            const ghin = String(saved.dbPlayers_PlayerGHIN || saved.ghin || "");
            const p = state.players.find(x => String(x.dbPlayers_PlayerGHIN || "") === ghin);
            if (p) p.dbPlayers_TeamKey = String(saved.dbPlayers_TeamKey || saved.team || "");
          });
        }
        if (window.__MA_INIT__) window.__MA_INIT__.teamConfig = teamConfig;
        renderRoster();
        renderTrayBody();
      }
    });
  }

  function onRecalcHandicaps() {
    if (!ggid) return;
    MA.recalculateHandicaps(MA.paths?.apiGHIN);
  }

  function onNotify() {
    if (!ggid) return;
    if (MA.notify && typeof MA.notify.open === "function") {
      MA.notify.open({
        ggid:    ggid,
        apiPath: MA.paths?.apiNotify,
      });
    } else {
      if (typeof MA.setStatus === "function") MA.setStatus("Messaging module not loaded.", "error");
    }
  }

  function applyChrome(){
    const g = state.game || {};
    const title = String(g.dbGames_Title || "Game");
    const course = String(g.dbGames_CourseName || "");
    const date = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) MA.chrome.setHeaderLines(["Game Players", title, subTitle]);
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
        : ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"];

      MA.chrome.setBottomNav({ visible: visible, active:"roster", onNavigate:(id)=>MA.routerGo(id) });
    }
  }

  async function refreshPlayers(){
    const res = await MA.postJson(MA.paths.gamePlayersGet, {});
    if (!res?.ok) throw new Error(res?.message || "Load failed");
    state.players = Array.isArray(res.payload?.players) ? res.payload.players : [];
    state.game = res.payload?.game || state.game;
    state.context = res.payload?.context || state.context;
  }

  async function refreshFavorites(){
    const res = await MA.postJson(MA.paths.favPlayersInit, { courseId: safe(state.game?.dbGames_CourseID) });
    state.favorites = Array.isArray(res?.payload?.favorites) ? res.payload.favorites : [];
    state.groups    = Array.isArray(res?.payload?.groups)    ? res.payload.groups    : [];
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
      if (leaving === "favorites") MA.favoritesSource.cancelMultiAdd(el.trayControls);
      if (leaving === "nonrated")  MA.nonRatedSource.clearSelection(el.trayControls);

      state.activeTab = btn.dataset.tab;

      if (state.activeTab === "import") {
        await ensureImportTeeOptions();
        await ensureImportSourceGames();
      }
      render();
    }));
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

    if (state.activeTab === "ghin") {
      MA.ghinSearch.mount({
        controlsEl:    el.trayControls,
        bodyEl:        el.trayBody,
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
        controlsEl:    el.trayControls,
        bodyEl:        el.trayBody,
        footerEl:      el.trayFtr,
        apiPath:       MA.paths.favPlayersInit,
        courseId:      safe(state.game?.dbGames_CourseID),
        context:       state.context,
        initialData:   { favorites: state.favorites, groups: state.groups },
        existingGHINs: new Set(
          (state.players || []).map(p => safe(p.dbPlayers_PlayerGHIN))
        ),
        onSelect(player)       { beginTeeFlow(player); },
        onSelectMany(players)  { beginBatchTeeFlow(players); }
      });
      return;
    }

    if (state.activeTab === "nonrated") {
      MA.nonRatedSource.mount({
        controlsEl:      el.trayControls,
        bodyEl:          el.trayBody,
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
      const isExternal = state.importSourceMode === "external";
      const isExisting = state.importSourceMode === "existing";

      el.trayControls.innerHTML = `
        <div class="maFieldRow">
          <div class="maField">
            <div class="maSeg" style="display:grid; grid-template-columns:1fr 1fr;">
              <button id="gpImportModeExternal" class="maSegBtn ${isExternal ? "is-active" : ""}" type="button">External List</button>
              <button id="gpImportModeExisting" class="maSegBtn ${isExisting ? "is-active" : ""}" type="button">Existing Game</button>
            </div>
          </div>
        </div>
      `;

      const btnExternal = document.getElementById("gpImportModeExternal");
      const btnExisting = document.getElementById("gpImportModeExisting");

      if (btnExternal) btnExternal.onclick = () => {
        state.importSourceMode = "external";
        resetImportStateForSourceMode();
        render();
      };

      if (btnExisting) btnExisting.onclick = () => {
        state.importSourceMode = "existing";
        resetImportStateForSourceMode();
        render();
      };

      return;
    }

  }

function renderTrayBody(){
    // GHIN, Favorites, and Non-Rated body content is owned by their
    // respective source modules — mount() in renderTrayControls() handles it.
    if (state.activeTab === "ghin")      return;
    if (state.activeTab === "favorites") return;
    if (state.activeTab === "nonrated")  return;

    if (state.activeTab === "import") {
      const isExternal = state.importSourceMode === "external";
      const isExisting = state.importSourceMode === "existing";

      if (isExternal) {
        if (state.importMode === "entry") {
          el.trayBody.innerHTML = `<section class="maPanel gpImportPanel">
            <div class="gpImportCard">
              <div class="gpImportCard__hdr">
                <div class="gpImportCard__label">Enter Golf Network ID's or email addresses.</div>
                <button id="gpBtnImportEvaluate" class="btn btnSecondary gpImportCard__btn" type="button">Evaluate</button>
              </div>
              <textarea id="gpImportText" class="maTextInput gpImportText" placeholder="123456&#10;player123@gmail.com&#10;987654&#10;player456@aol.com">${esc(state.importText)}</textarea>
              <div class="maHelpText gpHint" style="margin-top:4px;">Accepts numbers, email addresses, or a mix. Paste directly from Document, Spreadsheet or EMail as separate lines, separated by commas or by semi-colons</div>
            </div>
          </section>`;

          const ta = document.getElementById("gpImportText");
          if (ta) {
            ta.oninput = () => {
              state.importText = safe(ta.value);
            };
          }

          const btnEval = document.getElementById("gpBtnImportEvaluate");
          if (btnEval) btnEval.onclick = evaluateImportRows;
          return;
        }

        // ── External list review table ────────────────────────────────────
        // Col widths defined here via flex — gpRow--import is flex only in CSS.
        // Input  flex:2  |  Name  flex:2  |  G  28px  |  Tee  flex:2  |  Status  90px
        const rows = state.importRows.map((r) => {
          const p = r.player || buildEmptyImportPlayer();
          const sourceLabels = {
            same_course:       "Same course",
            last_played:       "Last played",
            preferred_yardage: "Pref. yardage",
            force_assigned:    "Force assigned",
            fallback:          "Fallback"
          };
          const isSkip     = !!r.alreadyOnRoster;
          const statusText = isSkip
            ? "On roster"
            : (sourceLabels[r.resolvedTeeSource] || r.status || "");
          const displayId  = r.inputEmail ? r.inputEmail : (r.ghin || r.raw);
          return `<div class="maListRow gpRow gpRow--import${isSkip ? " gpRow--skip" : ""}">
            <div class="maListRow__col" style="flex:2;">${esc(displayId)}</div>
            <div class="maListRow__col" style="flex:2;">${esc(p.name || "")}</div>
            <div class="maListRow__col" style="flex:0 0 28px; text-align:center;">${esc(p.gender || "")}</div>
            <div class="maListRow__col" style="flex:2;">${esc(r.assignedTeeText || "")}</div>
            <div class="maListRow__col" style="flex:0 0 90px;"><span class="maPill gpTeeSourcePill gpTeeSourcePill--${esc(r.resolvedTeeSource || (isSkip ? "skip" : ""))}">${esc(statusText)}</span></div>
          </div>`;
        }).join("");

        const actionable = state.importRows.filter(r => !r.alreadyOnRoster).length;
        el.trayBody.innerHTML = `<section class="maPanel gpImportPanel">
          <div class="maListRow maListRow--hdr gpRow--import">
            <div class="maListRow__col" style="flex:2;">Input</div>
            <div class="maListRow__col" style="flex:2;">Name</div>
            <div class="maListRow__col" style="flex:0 0 28px; text-align:center;">G</div>
            <div class="maListRow__col" style="flex:2;">Tee</div>
            <div class="maListRow__col" style="flex:0 0 90px;">Status</div>
          </div>
          <div class="maListRows">${rows || `<div class="gpEmpty">No import rows evaluated.</div>`}</div>
          <div class="gpImportFooter">
            <div class="gpImportFooter__count">${actionable} player${actionable !== 1 ? "s" : ""} evaluated</div>
            <div class="gpImportFooter__actions">
              <button id="gpBtnImportBack" class="btn btnPrimary" type="button">Back</button>
              <button id="gpBtnImportRun" class="btn btnSecondary" type="button" ${canImportAllRows() ? "" : "disabled"}>Import ${actionable} Player${actionable !== 1 ? "s" : ""}</button>
            </div>
          </div>
        </section>`;

        const btnBack = document.getElementById("gpBtnImportBack");
        if (btnBack) btnBack.onclick = () => { resetImportMode(); render(); };

        const btnRun = document.getElementById("gpBtnImportRun");
        if (btnRun) btnRun.onclick = beginImportBatch;
        return;
      }

      if (isExisting) {

        if (state.importMode === "review") {
          // ── Existing game review table ────────────────────────────────────
          // Col widths defined here via flex — gpRow--import is flex only in CSS.
          // GHIN  70px  |  Player  flex:2  |  HI  44px  |  Source Tee  flex:1  |  Assigned Tee  flex:1.5  |  Status  90px
          const reviewRows = (state.importExistingPreviewRows || []).map((r) => {
            const isSkip = !!r.alreadyOnRoster;
            const sourceLabels = {
              same_course:       "Same course",
              last_played:       "Last played",
              preferred_yardage: "Pref. yardage",
              force_assigned:    "Force assigned",
              fallback:          "Fallback"
            };
            const statusText = isSkip ? "On roster" : (sourceLabels[r.resolvedTeeSource] || "");
            return `<div class="maListRow gpRow gpRow--import${isSkip ? " gpRow--skip" : ""}">
              <div class="maListRow__col maListRow__col--muted" style="flex:0 0 70px; font-size:11px;">${esc(r.ghin || "")}</div>
              <div class="maListRow__col" style="flex:2;">${esc(r.playerName || "")}</div>
              <div class="maListRow__col" style="flex:0 0 44px; text-align:right;">${esc(r.hi || "")}</div>
              <div class="maListRow__col maListRow__col--muted" style="flex:1; font-size:11px;">${esc(r.sourceTeeText || "")}</div>
              <div class="maListRow__col maListRow__col--muted" style="flex:1.5; font-size:11px;">${esc(r.assignedTeeText || "")}</div>
              <div class="maListRow__col" style="flex:0 0 90px;"><span class="maPill gpTeeSourcePill gpTeeSourcePill--${esc(r.resolvedTeeSource || (isSkip ? "skip" : ""))}">${esc(statusText)}</span></div>
            </div>`;
          }).join("");

          const actionable = state.importRows.filter(r => !r.alreadyOnRoster).length;
          const skipped    = state.importRows.filter(r => !!r.alreadyOnRoster).length;
          const footerCount = `${actionable} player${actionable !== 1 ? "s" : ""} to import${skipped ? ` · ${skipped} skipped` : ""}`;

          el.trayBody.innerHTML = `<section class="maPanel gpImportPanel">
            <div class="maListRow maListRow--hdr gpRow--import">
              <div class="maListRow__col" style="flex:0 0 70px;">GHIN</div>
              <div class="maListRow__col" style="flex:2;">Player</div>
              <div class="maListRow__col" style="flex:0 0 44px; text-align:right;">HI</div>
              <div class="maListRow__col" style="flex:1;">Source Tee</div>
              <div class="maListRow__col" style="flex:1.5;">Assigned Tee</div>
              <div class="maListRow__col" style="flex:0 0 90px;">Status</div>
            </div>
            <div class="maListRows">${reviewRows || `<div class="gpEmpty">No players loaded.</div>`}</div>
            <div class="gpImportFooter">
              <div class="gpImportFooter__count">${esc(footerCount)}</div>
              <div class="gpImportFooter__actions">
                <button id="gpBtnImportExistingClear" class="btn btnPrimary" type="button">Choose Different Game</button>
                <button id="gpBtnImportExistingRun" class="btn btnSecondary" type="button" ${canImportAllRows() ? "" : "disabled"}>Import ${actionable} Player${actionable !== 1 ? "s" : ""}</button>
              </div>
            </div>
          </section>`;

          const btnRun = document.getElementById("gpBtnImportExistingRun");
          if (btnRun) btnRun.onclick = beginExistingGameImport;

          const btnClear = document.getElementById("gpBtnImportExistingClear");
          if (btnClear) btnClear.onclick = () => { resetExistingGameImport(); render(); };

          return;
        }

        // ── Entry state: game list ────────────────────────────────────────
        const games = state.importSourceGames || [];
        const gameRows = games.map((g) => {
          const id    = safe(g.ggid || "");
          const badge = formatGameDateBadge(safe(g.playDate || ""));
          const title = safe(g.title || "Game");
          const course = safe(g.courseName || "");
          const count = Number(g.playerCount || 0);
          const isSelected = id === safe(state.importSourceGameId);
          const chevron = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;

          return `<div class="maListRow gpGameRow gpRowClickable${isSelected ? " gpGameRow--selected" : ""}" data-ggid="${esc(id)}">
            <div class="maDateBadge">
              <div class="maDateBadge__top">${esc(badge.top)}</div>
              <div class="maDateBadge__mid">${esc(badge.mid)}</div>
              <div class="maDateBadge__bot">${esc(badge.bot)}</div>
            </div>
            <div class="gpGameRow__info">
              <div class="gpGameRow__title">${esc(title)}</div>
              <div class="gpGameRow__course">${esc(course)}</div>
            </div>
            <div class="gpGameRow__count">
              <div class="gpGameRow__countNum">${count}</div>
              <div class="gpGameRow__countLbl">players</div>
            </div>
            <div class="gpGameRow__chevron">${chevron}</div>
          </div>`;
        }).join("");

        const listHeader = `<div class="gpGameListHdr">
          <span>Your Games with Players</span>
          <span class="gpGameListHdr__hint">Tap a game to import</span>
        </div>`;

        el.trayBody.innerHTML = games.length
          ? `<section class="maPanel gpImportPanel" style="padding:0;">
               ${listHeader}
               <div class="maListRows">${gameRows}</div>
             </section>`
          : `<section class="maPanel gpImportPanel">
               <div class="maEmptyState">No games with players found.</div>
             </section>`;

        el.trayBody.querySelectorAll(".gpGameRow[data-ggid]").forEach(row => {
          row.onclick = async () => {
            const ggid = row.getAttribute("data-ggid");
            if (!ggid) return;
            state.importSourceGameId = ggid;
            await loadExistingGamePreview(ggid);
          };
        });

        if (state.importSourceGameId) {
          const sel = el.trayBody.querySelector(".gpGameRow--selected");
          if (sel) sel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        return;
      }
    }

  }

  // ── Non-Rated: page-level upsert called from onUpdate callback ────────────
  async function upsertNonRated(player, existingTee) {
    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee: existingTee });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to update player.", "danger");
      return;
    }
    MA.nonRatedSource.clearSelection(el.trayControls);
    await refreshPlayers();
    await refreshFavorites();
    renderRoster();
    MA.nonRatedSource.mount({
      controlsEl:      el.trayControls,
      bodyEl:          el.trayBody,
      existingPlayers: state.players || [],
    });
    MA.setStatus("Player updated.", "success");
  }

  // ── CHANGED: evaluateImportRows — uses MA.parseImportPlayers() instead of
  //   parseImportLines(), and resolves emails before the evaluate loop ────────
  async function evaluateImportRows(){
    if (state.importBusy) return;

    // Use the shared parser module — handles GHIN, plain email, Outlook/Gmail paste
    const parsed = MA.parseImportPlayers(state.importText);

    if (!parsed.length) {
      MA.setStatus("Enter at least one Golf Network number or email address.", "warn");
      return;
    }

    // Surface unrecognized tokens immediately
    const unknown = parsed.filter(p => p.type === "unknown");
    if (unknown.length) {
      MA.setStatus(
        `${unknown.length} unrecognized entr${unknown.length === 1 ? "y" : "ies"} will be skipped: ${unknown.map(u => u.raw).join(", ")}`,
        "warn"
      );
    }

    const actionable = parsed.filter(p => p.type === "ghin" || p.type === "email");
    if (!actionable.length) {
      MA.setStatus("No valid Golf Network numbers or email addresses found.", "warn");
      return;
    }

    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();
    const proxyPlayer = { ghin: safe(state.context?.userGHIN || "0"), gender: "M", hi: "0" };

    MA.TeeSetSelection.open({
      mode: "batch-setup",
      gameId,
      player: proxyPlayer,
      subtitle: `Select fallback tee for ${actionable.length} players`,
      onSaveBatch: async ({ selectedTee, forceAssign }) => {
        state.batchFallbackTee = selectedTee;
        state.batchForceAssign = !!forceAssign;
        await runEvaluateImportRows(actionable);
      }
    });
  }

  // ── CHANGED: runEvaluateImportRows — accepts parsed token array, resolves
  //   emails to GHINs via resolveImportIdentifiers.php before the loop ────────
  async function runEvaluateImportRows(parsed){
    if (state.importBusy) return;
    state.importBusy = true;
    showBusyModal("Resolving players...");

    const apiPath = (MA.paths?.apiGHIN || "/api/GHIN") + "/getTeeSets.php";

    try {
      // ── Step 1: Batch resolve emails → GHINs ─────────────────────────────
      const emailResolutionMap = {}; // lowercased email → ghin

      const hasEmails = parsed.some(p => p.type === "email");
      if (hasEmails) {
        updateBusyModal("Resolving email addresses...");
        try {
          const res = await MA.postJson(MA.paths.resolveImportIdentifiers, {
            identifiers: parsed
          });

          if (res?.ok) {
            for (const r of (res.resolved || [])) {
              if (r.type === "email" && r.ghin) {
                emailResolutionMap[(r.value || r.input).toLowerCase()] = r.ghin;
              }
            }
            const unresolved = (res.unresolved || []).filter(u => u.type === "email");
            if (unresolved.length) {
              MA.setStatus(
                `${unresolved.length} email${unresolved.length === 1 ? "" : "s"} not found in favorites: ${unresolved.map(u => u.input).join(", ")}`,
                "warn"
              );
            }
          }
        } catch (e) {
          console.warn("Email resolution failed:", e);
          // Non-fatal — unresolved emails will surface as "Email not found" below
        }
      }

      // ── Step 2: Evaluate each token ───────────────────────────────────────
      const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const seen = new Set();
      const rows = [];

      let index = 0;
      for (const item of parsed) {
        index += 1;
        updateBusyModal(`Evaluating ${index} of ${parsed.length}...`);

        const row = {
          source:           item.type === "email" ? "email" : "ghin",
          raw:              item.raw,
          ghin:             "",
          ok:               false,
          status:           "",
          error:            "",
          player:           buildEmptyImportPlayer(),
          assignedTeeId:    "",
          assignedTeeText:  "",
          resolvedTeeSource:"",
          alreadyOnRoster:  false,
          inputEmail:       item.type === "email" ? item.value : "",
        };

        // ── Resolve to GHIN ───────────────────────────────────────────────
        let ghin = "";

        if (item.type === "ghin") {
          ghin = item.value;
        } else if (item.type === "email") {
          ghin = emailResolutionMap[item.value.toLowerCase()] || "";
          if (!ghin) {
            row.ok     = false;
            row.status = "Not Found";
            row.error  = `No Golf Network found for ${item.raw}`;
            rows.push(row);
            continue;
          }
        }

        row.ghin = ghin;

        // ── Duplicate check (post-resolution — two emails → same GHIN) ───
        if (seen.has(ghin)) {
          row.ok     = false;
          row.status = "Duplicate";
          row.error  = "Resolves to the same identity as another entry in this list";
          rows.push(row);
          continue;
        }
        seen.add(ghin);

        // ── Already on roster ─────────────────────────────────────────────
        if (enrolledSet.has(ghin)) {
          row.ok              = false;
          row.status          = "Already in roster";
          row.error           = "Player is already in the roster";
          row.alreadyOnRoster = true;
          rows.push(row);
          continue;
        }

        // ── GHIN API lookup — name, gender, HI ───────────────────────────
        const res = await MA.postJson(MA.paths.ghinPlayerSearch, { mode: "id", ghin });
        const hit = Array.isArray(res?.payload?.rows) ? res.payload.rows[0] : null;

        if (!res?.ok || !hit) {
          row.ok     = false;
          row.status = "Golf Network ID not found";
          row.error  = "No Golf Network player found";
          rows.push(row);
          continue;
        }

        const nm = splitName(hit.name || "");
        const player = {
          ghin:       safe(hit.ghin || ghin),
          first_name: safe(nm.first),
          last_name:  safe(nm.last),
          name:       safe(hit.name || ""),
          gender:     safe(hit.gender || ""),
          hi:         safe(hit.hi || "")
        };

        // ── Tee resolution ────────────────────────────────────────────────
        let resolvedTee       = state.batchFallbackTee;
        let resolvedTeeSource = "fallback";

        if (!state.batchForceAssign) {
          try {
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
              if (match) {
                resolvedTee       = match;
                resolvedTeeSource = safe(tres.payload.resolvedTeeSource || "fallback");
              }
            }
          } catch (e) {
            console.warn("Tee resolve failed for", ghin, e);
          }
        } else {
          resolvedTeeSource = "force_assigned";
        }

        row.ok                = true;
        row.status            = "OK";
        row.error             = "";
        row.player            = player;
        row.assignedTeeId     = safe(resolvedTee?.teeSetID || resolvedTee?.value || "");
        row.assignedTeeText   = formatAssignedTeeText(resolvedTee);
        row.resolvedTeeSource = resolvedTeeSource;
        row.alreadyOnRoster   = false;
        rows.push(row);
      }

      state.importRows        = rows;
      state.importSelectedTee = state.batchFallbackTee;
      state.importMode        = "review";
      render();

      if (canImportAllRows()) MA.setStatus(`Evaluated ${rows.length} rows. All rows valid.`, "success");
      else MA.setStatus(`Evaluated ${rows.length} rows. Fix errors before import.`, "warn");

    } finally {
      state.importBusy = false;
      hideBusyModal();
    }
  }

  async function beginImportBatch(){
    if (state.importBusy) return;
    if (!canImportAllRows()) {
      MA.setStatus("All rows must be valid before import can proceed.", "warn");
      return;
    }
    await commitImportBatch(state.importRows.slice());
  }

  async function beginExistingGameImport(){
    if (state.importBusy) return;
    if (!safe(state.importSourceGameId)) {
      MA.setStatus("Select a source game first.", "warn");
      return;
    }
    if (!canImportAllRows()) {
      MA.setStatus("No importable players found. All players may already be on the roster.", "warn");
      return;
    }
    await commitImportBatch(state.importRows.slice());
  }

  async function commitImportBatch(rows){
    if (!rows.length) return;
    state.importBusy = true;
    showBusyModal(`Importing ${rows.length} players.`);

    let added = 0;
    let failed = 0;
    let skipped = 0;

    try {
      let index = 0;
      for (const row of rows) {
        index += 1;
        updateBusyModal(`Importing ${index} of ${rows.length} players.`);

        if (row.alreadyOnRoster) {
          skipped++;
          continue;
        }

        const selectedTee = getImportTeeById(row.assignedTeeId) || (
          safe(row.assignedTeeId)
            ? { teeSetID: safe(row.assignedTeeId), value: safe(row.assignedTeeId) }
            : null
        );
        if (!selectedTee) {
          failed++;
          continue;
        }

        const p = row.player || buildEmptyImportPlayer();
        const player = {
          ghin:       safe(p.ghin),
          first_name: safe(p.first_name),
          last_name:  safe(p.last_name),
          gender:     safe(p.gender),
          hi:         safe(p.hi),
          teamKey:    safe(p.teamKey || "")
        };

        const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee });
        if (res?.ok) added++;
        else failed++;
      }

      await refreshPlayers();
      await refreshFavorites();
      renderRoster();
      MA.favoritesSource.refresh(el.trayControls);
      state.importText = "";
      state.importRows = [];
      state.importMode = "entry";
      resetExistingGameImport();
      render();

      if (failed) MA.setStatus(`Imported ${added} players. ${skipped} skipped. ${failed} failed.`, "warn");
      else MA.setStatus(`Imported ${added} players. ${skipped} already existed.`, "success");
    } finally {
      state.importBusy = false;
      hideBusyModal();
    }
  }

  async function beginBatchTeeFlow(players){
    // players is a pre-filtered, normalized array delivered by MA.favoritesSource
    if (!players || !players.length) {
      MA.setStatus("Select at least one favorite.", "warn");
      return;
    }

    const genders = Array.from(new Set(players.map(p => safe(p.gender || "").toUpperCase()).filter(Boolean)));
    if (genders.length > 1) {
      MA.setStatus("Multi-Add currently requires selected favorites to share the same gender.", "warn");
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
      await refreshFavorites();
      MA.favoritesSource.refresh(el.trayControls);
      renderRoster();
      render();

      if (failed) MA.setStatus(`Added ${added} favorites. ${failed} failed.`, "warn");
      else MA.setStatus(`Added ${added} favorites.`, "success");
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
      const comp = state.game?.dbGames_Competition || "PairField";
      const pid = safe(existing.dbPlayers_PairingID || "000");
      const fid = safe(existing.dbPlayers_FlightID || "");
      wasPaired = (comp === "PairPair") ? (pid !== "000" && fid !== "" && fid !== "0") : (pid !== "000");
    }

    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player: state.pendingPlayer, selectedTee: state.selectedTee });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to save player", "danger");
      return;
    }
    if (ghin.startsWith("NH")) MA.ghinSearch.close && MA.ghinSearch.close();
    state.pendingPlayer = null;
    if (ghin.startsWith("NH")) {
      MA.nonRatedSource.clearForm(el.trayControls);
    }

    if (wasPaired) {
      MA.setStatus("Calculating shots off...", "info");
      try {
        await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "player", id: ghin });
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    await refreshFavorites();
    MA.favoritesSource.refresh(el.trayControls);
    renderRoster();
    renderTrayBody();
    MA.setStatus("Player added/updated.", "success");
  }

  async function onDeleteRow(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;

    const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
    let wasPaired = false;
    let pid = "000";
    let fid = "";
    let comp = "PairField";

    if (p) {
      comp = state.game?.dbGames_Competition || "PairField";
      pid = safe(p.dbPlayers_PairingID || "000");
      fid = safe(p.dbPlayers_FlightID || "");
      wasPaired = (comp === "PairPair") ? (pid !== "000" && fid !== "" && fid !== "0") : (pid !== "000");
    }

    try {
      const rawBlind = state.game?.dbGames_BlindPlayers || '[]';
      const blindArr = typeof rawBlind === 'string' ? JSON.parse(rawBlind) : rawBlind;
      const blindGHINs = (Array.isArray(blindArr) ? blindArr : [])
        .filter(b => b.ghin)
        .map(b => String(b.ghin));
      if (blindGHINs.includes(String(ghin))) {
        return MA.setStatus(
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

          const confirmed = await MA.confirm({
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
    if (!res?.ok) return MA.setStatus("Unable to delete player", "danger");

    if (wasPaired) {
      MA.setStatus("Calculating shots off...", "info");
      try {
        if (comp === "PairPair") {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "flight", id: fid });
        } else {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "pairing", id: pid });
        }
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    await refreshFavorites();
    MA.favoritesSource.refresh(el.trayControls);
    renderRoster();
    renderTrayBody();
    MA.setStatus("Player removed.", "success");
  }

  function onRowFavorite(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;
    MA.postJson(MA.paths.routerApi, { action:"favorites", mode:"registrations", returnTo:"roster", favPlayerGHIN: ghin })
      .then(r => { if (r?.ok && r.redirectUrl) window.location.assign(r.redirectUrl); });
  }

  boot().catch(err => {
    console.error(err);
    MA.setStatus("Failed to initialize page.", "danger");
  });
})();