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
    hcEffectivity: String(init.hcEffectivity || "PlayDate"),
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
      { id: "import",    label: "Import"     },
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

  // ── Blocked-delete notice ───────────────────────────────────────────────
  // Delegates to MA.ui.confirm (okOnly mode). This was the original pattern
  // game_players.js and game_pairings.js's "managed at event level" modals
  // mirrored — now all three render through the same shared implementation
  // instead of copies of this file's markup.
  function showBlockedModal(message) {
    MA.ui.confirm({
      title: "Player enrolled in linked round",
      message: message || "This player cannot be removed right now.",
      okOnly: true
    });
  }

  // ── API helpers ─────────────────────────────────────────────────────────────
  async function refreshRoster() {
    const res = await MA.postJson(MA.paths.getEventRoster, {});
    if (!res?.ok) throw new Error(res?.message || "Load failed.");
    state.roster = Array.isArray(res.payload?.roster) ? res.payload.roster : [];
  }

  // module_defineTeamsGameEvent.js / module_defineFlightsGameEvent.js are
  // self-hydrating AND self-saving now — their onDone(wasSaved) contract
  // hands back a boolean only, no config/players payload. Re-fetch both the
  // event record (dbEvents_TeamConfig/TeamMode, dbEvents_FlightConfig/
  // FlightMode) and the roster (per-player TeamKey/FlightKey) from the same
  // endpoint the modules themselves use to hydrate, so state.event and
  // state.roster end up consistent with what was actually persisted.
  async function refreshEventAndRoster() {
    const res = await MA.postJson(
      (MA.paths?.apiEventRoster || "/api/event_roster") + "/initEventRoster.php",
      {}
    );
    if (!res?.ok) throw new Error(res?.message || "Failed to refresh event roster.");
    state.event  = res.event  || state.event;
    state.roster = Array.isArray(res.roster) ? res.roster : state.roster;
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
        MA.ui.notify("Player is already enrolled.", "info");
      } else {
        MA.ui.notify(res?.message || "Unable to enroll player.", "warn");
      }
      return;
    }

    await refreshRoster();
    renderRoster();
    renderTrayControls();
    renderTrayBody();
    MA.ui.notify("Player enrolled.", "success");
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
    if (state.activeTab === "favorites") {
      // Multi-add only: clear the module's multiAddMode/selection state,
      // which a plain re-mount intentionally leaves untouched.
      const p = findTabPanel(el.trayControls, "favorites");
      if (p) MA.favoritesSource.refresh(p);
    } else {
      renderTrayControls();
    }
    renderTrayBody();

    if (failed) MA.ui.notify(`Enrolled ${added} players. ${failed} failed.`, "warn");
    else MA.ui.notify(`Enrolled ${added} players.`, "success");
  }

  // ── Remove a player ─────────────────────────────────────────────────────────
  async function onDeleteRow(e) {
    const row  = e.currentTarget.closest("[data-ghin]");
    const ghin = row?.getAttribute("data-ghin");
    if (!ghin) return;

    const res = await MA.postJson(MA.paths.deleteEventRosterPlayer, { playerGHIN: ghin });
    if (!res?.ok) {
      showBlockedModal(res?.message || "Unable to remove player.");
      return;
    }

    await refreshRoster();
    renderRoster();
    renderTrayControls();
    renderTrayBody();
    MA.ui.notify("Player removed.", "success");
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

    // Parse teamConfig from the event record itself — window.__MA_INIT__ has
    // no top-level teamConfig key, only __MA_INIT__.event.dbEvents_TeamConfig
    // (a JSON string). Same parse pattern as onManagePairings() below.
    let teamConfig = null;
    try {
      const raw = state.event?.dbEvents_TeamConfig;
      if (raw && typeof raw === "string" && raw !== "") {
        teamConfig = JSON.parse(raw);
      } else if (raw && typeof raw === "object") {
        teamConfig = raw;
      }
    } catch (_) {
      teamConfig = null;
    }

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
      </div>`;

    el.canvasControls.querySelectorAll("[data-roster-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.rosterSort = btn.dataset.rosterSort;
        renderCanvasControls();
        renderRoster();
      });
    });
  }

  // ── Mobile tray toggle ───────────────────────────────────────────────────────
  // Mirrors game_players.js's approach exactly: toggle .is-tray-open on the
  // page wrapper. The actual show/hide is handled entirely by ma_shared.css's
  // shared .maPanels--2 / .is-tray-open mechanism — nothing page-specific
  // needed here beyond flipping the class.
  function openMobileTray() {
    const page = document.querySelector(".maPage--event-roster");
    if (page) page.classList.add("is-tray-open");
  }

  function closeMobileTray() {
    const page = document.querySelector(".maPage--event-roster");
    if (page) page.classList.remove("is-tray-open");
  }

  // ── Refresh Handicaps ────────────────────────────────────────────────────────
  async function onRefreshHandicaps() {
    _showBusy("Refreshing handicaps — please wait...");
    MA.ui.notify("Refreshing handicaps…", "info");
    try {
      const res = await MA.postJson(MA.paths.refreshEventRosterHI, {});
      if (!res?.ok) {
        MA.ui.notify(res?.message || "Unable to refresh handicaps.", "warn");
        return;
      }
      state.roster = Array.isArray(res.payload?.roster) ? res.payload.roster : state.roster;
      renderRoster();
      MA.ui.notify(res.message || "Handicaps refreshed.", "success");
    } catch (e) {
      console.error(e);
      MA.ui.notify(String(e.message || e), "danger");
    } finally {
      _hideBusy();
    }
  }

  // Delegates to MA.ui — also fixes that this version never toggled
  // maOverlayOpen, so the page underneath was never actually locked while
  // handicaps were refreshing.
  function _showBusy(message) {
    MA.ui.showBusy({ title: "Working", message: message || "Processing — please wait..." });
  }

  function _hideBusy() {
    MA.ui.hideBusy();
  }

  // ── Manage Pairings ──────────────────────────────────────────────────────────
  function onManagePairings() {
    if (!MA.createEventPairings || typeof MA.createEventPairings.open !== "function") {
      MA.ui.notify("Manage Pairings module not loaded.", "warn");
      return;
    }

    // Parse teamConfig from the event record so the module can show
    // display names (e.g. "Red", "Blue") instead of raw T1/T2 keys
    let teamConfig = null;
    try {
      const raw = state.event?.dbEvents_TeamConfig;
      if (raw && typeof raw === "string" && raw !== "") {
        teamConfig = JSON.parse(raw);
      } else if (raw && typeof raw === "object") {
        teamConfig = raw;
      }
    } catch (_) {
      teamConfig = null;
    }

    // Map roster rows to the shape the module expects
    const players = (state.roster || []).map(p => ({
      ghin:       safe(p.dbEventPlayers_GHIN),
      name:       safe(p.dbEventPlayers_Name),
      lname:      safe(p.dbEventPlayers_LName),
      gender:     safe(p.dbEventPlayers_Gender),
      hi:         safe(p.dbEventPlayers_HI),
      teamKey:    safe(p.dbEventPlayers_TeamKey),
      pairingId:  safe(p.dbEventPlayers_PairingID  || "000"),
      pairingPos: safe(p.dbEventPlayers_PairingPos || ""),
    }));

    MA.createEventPairings.open({
      players,
      teamConfig,
      pairingMode: state.event?.dbEvents_PairingMode || "none",
      apiSavePairings: MA.paths.saveEventRosterPairings,
      onApply({ players: updatedPlayers, mode: newMode }) {
        updatedPlayers.forEach(up => {
          const row = state.roster.find(r => safe(r.dbEventPlayers_GHIN) === up.ghin);
          if (row) {
            row.dbEventPlayers_PairingID  = up.pairingId;
            row.dbEventPlayers_PairingPos = up.pairingPos;
          }
        });
        if (state.event) state.event.dbEvents_PairingMode = newMode || "none";
        renderRoster();
        MA.ui.notify("Pairings saved.", "success");
      }
    });
  }

  // ── Define Teams ────────────────────────────────────────────────────────────
  function onManageTeams() {
    if (!MA.manageTeams || typeof MA.manageTeams.open !== "function") {
      MA.ui.notify("Define Teams module not loaded.", "warn");
      return;
    }

    // module_defineTeamsGameEvent.js self-hydrates (via initEventRoster.php)
    // and self-saves (via saveEventTeams.php) internally now — it no longer
    // takes players/teamConfig/mode/apiBase, and it already shows its own
    // "Teams saved." notification, so onDone just needs to bring this page's
    // state back in sync with what was persisted.
    MA.manageTeams.open({
      target: "event",
      onDone: async (wasSaved) => {
        if (!wasSaved) return;
        try {
          await refreshEventAndRoster();
          renderRoster();
        } catch (e) {
          MA.ui.notify(e?.message || "Failed to refresh roster after saving teams.", "warn");
        }
      }
    });
  }

  // ── Manage Flights ───────────────────────────────────────────────────────────
  function onDefineFlights() {
    if (!MA.defineFlights || typeof MA.defineFlights.open !== "function") {
      MA.ui.notify("Define Flights module not loaded.", "warn");
      return;
    }

    // Same self-hydrating/self-saving contract as onManageTeams above.
    MA.defineFlights.open({
      target: "event",
      onDone: async (wasSaved) => {
        if (!wasSaved) return;
        try {
          await refreshEventAndRoster();
          renderRoster();
        } catch (e) {
          MA.ui.notify(e?.message || "Failed to refresh roster after saving flights.", "warn");
        }
      }
    });
  }

  // ── Define Handicaps ────────────────────────────────────────────────────────
  // module_setHandicapsGameEvent.js (MA.setHandicapsGameEvent) replaces the
  // retired module_defineHandicapSettings.js (MA.defineHandicapSettings) —
  // the latter is no longer referenced anywhere in the app. Same
  // self-hydrating/self-saving contract as onManageTeams/onDefineFlights
  // above: no method/allowance/effectivity/effDate/mode input, and
  // onDone(wasSaved) hands back a boolean only (not the edited values), so
  // this refreshes from the server the same way Teams/Flights already do
  // on this page rather than patching state.event fields directly.
  function onDefineHandicapSettings() {
    if (!MA.setHandicapsGameEvent || typeof MA.setHandicapsGameEvent.open !== "function") {
      MA.ui.notify("Define Handicaps module not loaded.", "warn");
      return;
    }

    MA.setHandicapsGameEvent.open({
      target: "event",
      onDone: async (wasSaved) => {
        if (!wasSaved) return;
        try {
          await refreshEventAndRoster();
          renderRoster();
        } catch (e) {
          MA.ui.notify(e?.message || "Failed to refresh roster after saving handicap settings.", "warn");
        }
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
   * every source module (Favorites, GHIN Search, Non-Rated). Each module
   * keeps its own WeakMap-keyed "already mounted" state so that switching
   * away and back preserves filters/search results/scroll position — but
   * that only works if the DOM node it was keyed on still contains ITS
   * markup. Because the node was shared, a sibling module could overwrite
   * it, and the original module's "already mounted" check would then skip
   * rebuilding controls it no longer actually owned (see game_players.js
   * for the full writeup of this bug).
   *
   * Fix: give each tab its own permanent child container under the shared
   * parent, and just show/hide between them. Every module gets a stable,
   * dedicated node that only it ever writes to.
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

  // Pure lookup — never creates a panel, never touches visibility. Used by
  // cleanup/refresh call sites that need "the element this module's state
  // is keyed on, if it exists" without forcing that panel visible.
  function findTabPanel(parentEl, tabId){
    if (!parentEl) return null;
    return parentEl.querySelector(`:scope > [data-tab-panel="${tabId}"]`);
  }

  // ── Render: tray controls + body (via modules) ──────────────────────────────
  function renderTrayControls() {
    if (state.activeTab === "ghin") {
      MA.ghinSearch.mount({
        controlsEl:    getTabPanel(el.trayControls, "ghin"),
        bodyEl:        getTabPanel(el.trayBody, "ghin"),
        defaultState:  safe(state.context.userState || ""),
        existingGHINs: enrolledGHINs(),
        onSelect(player) { enrollPlayer(player); }
      });
      return;
    }

    if (state.activeTab === "favorites") {
      MA.favoritesSource.mount({
        controlsEl:    getTabPanel(el.trayControls, "favorites"),
        bodyEl:        getTabPanel(el.trayBody, "favorites"),
        footerEl:      el.trayFtr,
        apiPath:       MA.paths.favPlayersInit,
        courseId:      safe(state.event?.dbEvents_CourseID || ""),
        context:       state.context,
        initialData:   { favorites: state.favorites, groups: state.groups },
        existingGHINs: enrolledGHINs(),
        source:        "eventroster",
        onSelect(player)       { enrollPlayer(player); },
        onSelectMany(players)  { enrollMany(players);  }
      });
      return;
    }

    if (state.activeTab === "nonrated") {
      MA.nonRatedSource.mount({
        controlsEl:      getTabPanel(el.trayControls, "nonrated"),
        bodyEl:          getTabPanel(el.trayBody, "nonrated"),
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

    if (state.activeTab === "import") {
      // No tee logic anywhere in this call — event rosters carry no tee
      // concept. modes:["external","game","event"] — Events get all three
      // per the agreed scope table (flat games are limited to two, but
      // that's game_players.js's concern in Phase 2, not this page's).
      MA.importPlayerSource.mount({
        controlsEl:    getTabPanel(el.trayControls, "import"),
        bodyEl:        getTabPanel(el.trayBody, "import"),
        footerEl:      el.trayFtr,
        modes:         ["external", "game", "event"],
        excludeEID:    eid,
        existingGHINs: enrolledGHINs(),
        paths: {
          resolveIdentifiers:     MA.paths.resolveImportIdentifiers,
          ghinSearch:              MA.paths.ghinPlayerSearch,
          sourceGames:             MA.paths.getImportSourceGames,
          gamePlayersEventImport:  MA.paths.getGamePlayersEventImport,
          sourceEvents:            MA.paths.getImportSourceEvents,
          eventPlayersEventImport: MA.paths.getEventPlayersEventImport,
        },
        onImportMany(players) { enrollMany(players); }
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
      MA.ui.notify(res?.message || "Unable to update player.", "warn");
      return;
    }
    const nonRatedControls = getTabPanel(el.trayControls, "nonrated");
    const nonRatedBody     = getTabPanel(el.trayBody, "nonrated");
    MA.nonRatedSource.clearSelection(nonRatedControls);
    await refreshRoster();
    renderRoster();
    MA.nonRatedSource.mount({
      controlsEl:      nonRatedControls,
      bodyEl:          nonRatedBody,
      existingPlayers: state.roster || [],
    });
    MA.ui.notify("Player updated.", "success");
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
        visible:    ["eventhome", "eventedit", "eventroster", "eventrounds", "eventsettings", "eventscorecard", "eventskins", "eventsummary"],
        active:     "eventroster",
        root: ["eventhome"],
        onNavigate: id => MA.routerGo(id),
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { category: "Advanced Features" },
      { label: "Define Teams",              indent: true, action: onManageTeams },
      { label: "Define Flights",            indent: true, action: onDefineFlights },
      { label: "Manage Pairings",           indent: true, action: onManagePairings },
      { category: "Handicap Settings" },
      { label: "Define Handicap Settings",  indent: true, action: onDefineHandicapSettings },
      { label: "Refresh Handicaps",         indent: true, action: onRefreshHandicaps },
    ]);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    applyChrome();
    await refreshRoster();
    render();

    const trayOpenBtn = document.getElementById("erBtnTrayOpen");
    if (trayOpenBtn) trayOpenBtn.onclick = openMobileTray;

    const trayCloseBtn = document.querySelector(".maTrayCloseBtn");
    if (trayCloseBtn) trayCloseBtn.onclick = closeMobileTray;
  }

  boot().catch(err => {
    console.error("[EVENT_ROSTER] boot error", err);
    MA.ui.notify("Failed to initialize event roster.", "danger");
  });

})();
