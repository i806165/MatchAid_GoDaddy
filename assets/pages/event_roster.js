/* /assets/pages/event_roster.js
   Event Roster page controller.
   Mirrors game_players.js patterns exactly:
   - IIFE, WeakMap modules, maSeg/maSegBtn tabs
   - el.trayTabs separate from el.trayControls (WeakMap anchor never wiped)
   - state.favorites from __INIT__ for heart icons
   - MA.favoritesSource, MA.ghinSearch, MA.nonRatedSource mount()
   - No tee set selection — enrollment is direct
   - No Import tab (event roster is headcount only, not tee-dependent)
*/
(function () {
  "use strict";

  const MA   = window.MA || {};
  const init = window.__INIT__ || {};
  const eid  = String(init.eid || "");

  // ── State ───────────────────────────────────────────────────────────────────
  const state = {
    activeTab:  "favorites",
    event:      init.event   || {},
    context:    init.context || {},
    portal:     init.portal  || "",
    roster:     [],                            // db_EventPlayers rows
    favorites:  Array.isArray(init.favorites) ? init.favorites : [],
    groups:     Array.isArray(init.groups)    ? init.groups    : [],
    rosterSort: "name",                        // name | team | hi
  };

  // ── Tabs ────────────────────────────────────────────────────────────────────
  function getTabs() {
    return [
      { id: "favorites", label: "Favorites"  },
      { id: "ghin",      label: "Search"     },
      { id: "nonrated",  label: "Non-Rated"  },
    ];
  }

  // ── DOM element map ─────────────────────────────────────────────────────────
  const el = {
    // Tray
    trayTabs:     document.getElementById("erTrayTabs"),
    trayControls: document.getElementById("erTrayControls"),
    trayBody:     document.getElementById("erTrayBody"),
    trayFtr:      document.getElementById("erTrayFtr"),
    trayCount:    document.getElementById("erTrayCount"),

    // Canvas
    canvasControls: document.getElementById("erCanvasControls"),
    rosterBody:     document.getElementById("erRosterBody"),
    rosterCount:    document.getElementById("erRosterCount"),
    rosterFooter:   document.getElementById("erRosterFooter"),
  };

  // ── Utilities ───────────────────────────────────────────────────────────────
  function safe(v) { return v == null ? "" : String(v); }
  function esc(v) {
    return safe(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function splitName(full) {
    const s = safe(full).trim();
    if (!s) return { first: "", last: "" };
    const parts = s.split(/\s+/);
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last:  parts.length > 1 ? parts[parts.length - 1] : "",
    };
  }

  // ── Heart icon SVGs — exact match with game_players.js ─────────────────────
  const HEART_FILLED  = `<svg viewBox="0 0 24 24" width="18" height="18" fill="#0066CC"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
  const HEART_OUTLINE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0066CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  const ICON_CLOSE    = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  // ── API helpers ─────────────────────────────────────────────────────────────
  async function refreshRoster() {
    const res = await MA.postJson(MA.paths.getEventRoster, {});
    if (!res?.ok) throw new Error(res?.message || "Load failed.");
    state.roster = Array.isArray(res.payload?.roster) ? res.payload.roster : [];
  }

  function enrolledGHINs() {
    return new Set((state.roster || []).map(p => safe(p.dbEventPlayers_GHIN)));
  }

  // ── Enroll a single player ──────────────────────────────────────────────────
  async function enrollPlayer(player) {
    const res = await MA.postJson(MA.paths.saveEventRosterPlayer, { player });

    if (!res?.ok) {
      // 409 = already enrolled — treat as success (checkmark will update)
      if (res?.status === 409 || res?.message?.includes("already")) {
        MA.setStatus("Player is already enrolled.", "info");
      } else {
        MA.setStatus(res?.message || "Unable to enroll player.", "warn");
      }
      return;
    }

    await refreshRoster();
    renderRoster();
    renderTrayControls();
    renderTrayBody();
    MA.setStatus("Player enrolled.", "success");
  }

  // ── Enroll multiple players (multi-add from favorites) ─────────────────────
  async function enrollMany(players) {
    if (!players?.length) return;

    let added = 0;
    let failed = 0;

    for (const player of players) {
      const res = await MA.postJson(MA.paths.saveEventRosterPlayer, { player });
      if (res?.ok || res?.message?.includes("already")) added++;
      else failed++;
    }

    await refreshRoster();
    renderRoster();
    renderTrayControls();
    renderTrayBody();

    if (failed) MA.setStatus(`Enrolled ${added} players. ${failed} failed.`, "warn");
    else MA.setStatus(`Enrolled ${added} players.`, "success");
  }

  // ── Remove a player ─────────────────────────────────────────────────────────
  async function onDeleteRow(e) {
    const row  = e.currentTarget.closest("[data-ghin]");
    const ghin = row?.getAttribute("data-ghin");
    if (!ghin) return;

    const name = row?.querySelector(".erRosterName")?.textContent || "this player";
    if (!confirm(`Remove ${name} from the event roster?`)) return;

    const res = await MA.postJson(MA.paths.deleteEventRosterPlayer, { playerGHIN: ghin });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to remove player.", "warn");
      return;
    }

    await refreshRoster();
    renderRoster();
    renderTrayControls();
    renderTrayBody();
    MA.setStatus("Player removed.", "success");
  }

  // ── Heart button — navigate to favorites page ───────────────────────────────
  function onRowFavorite(e) {
    const ghin = e.currentTarget.closest("[data-ghin]")?.getAttribute("data-ghin");
    if (!ghin) return;
    MA.postJson(MA.paths.routerApi, {
      action:          "favorites",
      mode:            "registrations",
      returnTo:        "event-roster",
      favPlayerGHIN:   ghin,
    }).then(r => { if (r?.ok && r.redirectUrl) window.location.assign(r.redirectUrl); });
  }

  // ── Render: canvas roster ───────────────────────────────────────────────────
  function renderRoster() {
    const favoriteSet = new Set((state.favorites || []).map(f => safe(f.playerGHIN)));
    const teamConfig  = (window.__MA_INIT__ || {}).teamConfig || null;

    const sorted = [...(state.roster || [])].sort((a, b) => {
      const s = state.rosterSort;
      if (s === "hi") return (parseFloat(a.dbEventPlayers_HI) || 999) - (parseFloat(b.dbEventPlayers_HI) || 999);
      if (s === "team") {
        const ka = safe(a.dbEventPlayers_TeamKey);
        const kb = safe(b.dbEventPlayers_TeamKey);
        const ta = ka ? (teamConfig ? ((teamConfig.teams || []).find(t => t.id === ka)?.name || ka) : ka) : "\x00";
        const tb = kb ? (teamConfig ? ((teamConfig.teams || []).find(t => t.id === kb)?.name || kb) : kb) : "\x00";
        const cmp = ta.localeCompare(tb);
        if (cmp !== 0) return cmp;
      }
      return safe(a.dbEventPlayers_LName + a.dbEventPlayers_Name)
        .localeCompare(safe(b.dbEventPlayers_LName + b.dbEventPlayers_Name));
    });

    // Team color lookup — same as game_players.js
    const teamColorMap = {};
    if (teamConfig) {
      (teamConfig.teams || []).forEach((t, i) => {
        teamColorMap[t.id] = i === 0 ? "red" : "blue";
      });
    }

    let lastGroupKey = undefined;

    const rows = sorted.map(p => {
      const ghin    = safe(p.dbEventPlayers_GHIN);
      const name    = safe(p.dbEventPlayers_Name);
      const lname   = safe(p.dbEventPlayers_LName);
      const hi      = safe(p.dbEventPlayers_HI    || "");
      const gender  = safe(p.dbEventPlayers_Gender || "");
      const teamKey = safe(p.dbEventPlayers_TeamKey || "");
      const teamName = teamKey && teamConfig
        ? ((teamConfig.teams || []).find(t => t.id === teamKey)?.name || "")
        : "";

      const isFav     = favoriteSet.has(ghin);
      const heartIcon = isFav ? HEART_FILLED : HEART_OUTLINE;
      const meta      = [hi && `HI ${hi}`, gender].filter(Boolean).join(" · ");

      // Team badge — mirrors game_players renderRoster badge logic
      const teamBadge = teamKey
        ? `<span class="maTeamBadge maTeamBadge--${esc(teamColorMap[teamKey] || "none")}">${esc(teamName || teamKey)}</span>`
        : `<span class="maTeamBadge maTeamBadge--none"></span>`;

      const rowHtml = `<div class="maListRow erRosterRow" data-ghin="${esc(ghin)}">
        <div class="maListRow__col erRosterName">${esc(name)}<div class="maListRow__col--muted gpSub">${esc(meta)}</div></div>
        ${teamBadge}
        <button class="iconBtn btnSecondary" data-act="fav" title="Favorites" aria-label="Favorites">${heartIcon}</button>
        <button class="iconBtn btnPrimary"   data-act="del" title="Remove"    aria-label="Remove">${ICON_CLOSE}</button>
      </div>`;

      // Team group divider when sorting by team
      if (state.rosterSort === "team" && teamKey !== lastGroupKey) {
        lastGroupKey = teamKey;
        const color = teamKey ? (teamColorMap[teamKey] || "none") : "none";
        const label = teamKey ? (teamName || teamKey) : "No Team";
        return `<div class="maListRow__group maListRow__group--${esc(color)}">${esc(label)}</div>${rowHtml}`;
      }

      return rowHtml;
    }).join("");

    el.rosterBody.innerHTML = `<div class="maListRows">${rows || `<div class="gpEmpty">No players enrolled yet.</div>`}</div>`;

    el.rosterBody.querySelectorAll("button[data-act='del']").forEach(b => b.onclick = onDeleteRow);
    el.rosterBody.querySelectorAll("button[data-act='fav']").forEach(b => b.onclick = onRowFavorite);

    const count = state.roster.length;
    if (el.rosterCount) el.rosterCount.textContent = count ? `${count} players` : "";
  }

  // ── Render: canvas controls ─────────────────────────────────────────────────
  function renderCanvasControls() {
    const sorts = [
      { id: "name", label: "Name" },
      { id: "team", label: "Team" },
      { id: "hi",   label: "HI"   },
    ];

    const sortStrip = `<div style="display:flex; gap:4px; background:var(--surfaceApp); border-radius:var(--radiusMd); padding:2px;" role="group" aria-label="Sort roster by">
      ${sorts.map(s => `<button class="maSeg--sortBtn ${state.rosterSort === s.id ? "is-active" : ""}" type="button" data-roster-sort="${esc(s.id)}">${esc(s.label)}</button>`).join("")}
    </div>`;

    el.canvasControls.innerHTML = `
      <div class="gpCanvasControls">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:11px; font-weight:500; color:var(--mutedText); white-space:nowrap;">Sort:</span>
          ${sortStrip}
        </div>
        <div class="gpCanvasControls__right">
          <button id="erBtnManageTeams" class="btn btnSecondary" type="button">Manage Teams</button>
        </div>
      </div>`;

    el.canvasControls.querySelectorAll("[data-roster-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.rosterSort = btn.dataset.rosterSort;
        renderCanvasControls();
        renderRoster();
      });
    });

    const teamsBtn = document.getElementById("erBtnManageTeams");
    if (teamsBtn) teamsBtn.onclick = onManageTeams;
  }

  // ── Manage Teams ────────────────────────────────────────────────────────────
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

    // Build a players-shaped array from roster for MA.manageTeams
    // manageTeams expects dbPlayers_* keys — map from dbEventPlayers_*
    const playersForTeams = (state.roster || []).map(p => ({
      dbPlayers_PlayerGHIN: safe(p.dbEventPlayers_GHIN),
      dbPlayers_Name:       safe(p.dbEventPlayers_Name),
      dbPlayers_LName:      safe(p.dbEventPlayers_LName),
      dbPlayers_Gender:     safe(p.dbEventPlayers_Gender),
      dbPlayers_HI:         safe(p.dbEventPlayers_HI),
      dbPlayers_TeamKey:    safe(p.dbEventPlayers_TeamKey),
    }));

    MA.manageTeams.open({
      players:    playersForTeams,
      teamConfig,
      apiBase:    MA.paths?.apiEventRoster || "/api/event_roster",
      onApply: ({ players, teamConfig: newConfig }) => {
        // Write team keys back to state.roster
        if (Array.isArray(players) && players.length) {
          players.forEach(saved => {
            const ghin = safe(saved.dbPlayers_PlayerGHIN || saved.ghin || "");
            const p = state.roster.find(x => safe(x.dbEventPlayers_GHIN) === ghin);
            if (p) p.dbEventPlayers_TeamKey = safe(saved.dbPlayers_TeamKey || saved.team || "");
          });
        }
        if (window.__MA_INIT__) window.__MA_INIT__.teamConfig = newConfig;
        renderRoster();
      }
    });
  }

  // ── Render: tray tabs ───────────────────────────────────────────────────────
  function renderTabs() {
    const tabs     = getTabs();
    const stripHtml = `<div class="maSeg">${
      tabs.map(t => `<button class="maSegBtn ${state.activeTab === t.id ? "is-active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${state.activeTab === t.id ? "true" : "false"}">${esc(t.label)}</button>`).join("")
    }</div>`;

    el.trayTabs.innerHTML = stripHtml;

    el.trayTabs.querySelectorAll(".maSegBtn").forEach(btn => btn.addEventListener("click", () => {
      const leaving = state.activeTab;

      // Module cleanup on tab away
      if (leaving === "favorites") MA.favoritesSource.cancelMultiAdd(el.trayControls);
      if (leaving === "nonrated")  MA.nonRatedSource.clearSelection(el.trayControls);

      state.activeTab = btn.dataset.tab;
      render();
    }));
  }

  // ── Render: tray controls + body (via modules) ──────────────────────────────
  function renderTrayControls() {
    if (state.activeTab === "ghin") {
      MA.ghinSearch.mount({
        controlsEl:    el.trayControls,
        bodyEl:        el.trayBody,
        defaultState:  safe(state.context.userState || ""),
        existingGHINs: enrolledGHINs(),
        onSelect(player) { enrollPlayer(player); }
      });
      return;
    }

    if (state.activeTab === "favorites") {
      MA.favoritesSource.mount({
        controlsEl:    el.trayControls,
        bodyEl:        el.trayBody,
        footerEl:      el.trayFtr,
        apiPath:       MA.paths.favPlayersInit,
        courseId:      safe(state.event?.dbEvents_CourseID || ""),
        context:       state.context,
        initialData:   { favorites: state.favorites, groups: state.groups },
        existingGHINs: enrolledGHINs(),
        onSelect(player)       { enrollPlayer(player); },
        onSelectMany(players)  { enrollMany(players);  }
      });
      return;
    }

    if (state.activeTab === "nonrated") {
      MA.nonRatedSource.mount({
        controlsEl:      el.trayControls,
        bodyEl:          el.trayBody,
        existingPlayers: state.roster || [],
        onAdd({ first_name, last_name, gender, hi }) {
          const ghin = `NH${Date.now()}${Math.floor(Math.random() * 1000)}`;
          enrollPlayer({ ghin, first_name, last_name, gender, hi, source: "nonrated" });
        },
        onUpdate(player) {
          upsertNonRated(player);
        }
      });
      return;
    }
  }

  function renderTrayBody() {
    // Body content owned by source modules — nothing to do here
    if (state.activeTab === "ghin")      return;
    if (state.activeTab === "favorites") return;
    if (state.activeTab === "nonrated")  return;
  }

  // ── Non-Rated update ────────────────────────────────────────────────────────
  async function upsertNonRated(player) {
    const res = await MA.postJson(MA.paths.saveEventRosterPlayer, { player });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to update player.", "warn");
      return;
    }
    MA.nonRatedSource.clearSelection(el.trayControls);
    await refreshRoster();
    renderRoster();
    MA.nonRatedSource.mount({
      controlsEl:      el.trayControls,
      bodyEl:          el.trayBody,
      existingPlayers: state.roster || [],
    });
    MA.setStatus("Player updated.", "success");
  }

  // ── render() ────────────────────────────────────────────────────────────────
  function render() {
    renderTabs();
    renderTrayControls();
    renderTrayBody();
    renderRoster();
    renderCanvasControls();
  }

  // ── Chrome ──────────────────────────────────────────────────────────────────
  function applyChrome() {
    const ev     = state.event || {};
    const title  = safe(ev.dbEvents_Title  || "Event Roster");
    const subTitle = safe(ev.dbEvents_StartDate || "");

    if (MA.chrome && MA.chrome.setHeaderLines) {
      MA.chrome.setHeaderLines(["Event Roster", title, subTitle]);
    }

    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false },
      });
    }

    if (MA.chrome && MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({
        visible:    ["eventhome", "eventedit", "eventroster","eventgames"],
        active:     "eventroster",
        onNavigate: id => MA.routerGo(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", []);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    applyChrome();
    await refreshRoster();
    render();
  }

  boot().catch(err => {
    console.error("[EVENT_ROSTER] boot error", err);
    MA.setStatus("Failed to initialize event roster.", "danger");
  });

})();
