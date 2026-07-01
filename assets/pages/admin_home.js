/* /assets/pages/admin_home.js
 * GoDaddy version (no Wix).
 * - Renders games + admins
 * - Supports Advanced Filters modal + header Actions menu presets
 * - Uses /assets/js/ma_shared.js (MA.apiAdminGames, MA.apiSession, MA.routerGo, MA.setStatus)
 *
 * Phase 3: this file is now the outer container for the two-panel doorway —
 * it mounts MA.gamesSource (module_sourceGames.js) against #cards (inside
 * .maPanel--primary) AND MA.eventsSource (module_sourceEvents.js) against
 * #eventCards (inside .maPanel--secondary), and owns the mobile open/close
 * toggle between them (.is-events-open on .maPage--adminHome — see
 * wireDoorwayControls()). In Event Rounds mode (state.isEventMode,
 * eid-scoped), only the Games panel exists in the DOM — no .maPanels
 * wrapper, no Events panel — so all events-side code below is a no-op there.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const apiAdmin = MA.apiAdminGames;
  const apiSession = MA.apiSession;
  const apiEventsBase = MA.routes?.apiEventsHome || "/api/events_home";
  const routerGo = MA.routerGo;
  const chromeStatus = MA.setStatus;

  // ---- Helpers ----
  function setStatus(message, level) {
    if (typeof chromeStatus === "function") chromeStatus(message, level);
    else if (message) console.warn("[STATUS]", level || "info", message);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function parseYmd(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).slice(0, 10).split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function toYmdLocal(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
 
  // ---- Overlay scroll/interaction lock (make underlying page inert) ----
  function setOverlayLock(on) {
    const root = document.documentElement;
    if (!root) return;
    root.classList.toggle("maOverlayOpen", !!on);
  }

  function updateOverlayLock() {
    const modalOpen  = !!document.getElementById("modalOverlay")?.classList.contains("is-open");
    const actionOpen = !!document.getElementById("maActionMenuOverlay")?.classList.contains("is-open");
    setOverlayLock(modalOpen || actionOpen);
  }

  // INIT cache (server payload)
  let cachedInit = null;

  // Page state (client-side source of truth)
  const state = {
    admins: {
      all: [],
      favoriteKeys: new Set(),
      selectedKeys: new Set(),
      searchText: ""
    },
    games: {
      dbRows: []
    },
    filters: {
      dateFrom: "",
      dateTo: "",
      // ME | ALL | CUSTOM
      adminScope: "ME"
    },
    // ---- Events panel (Phase 3 doorway) ----
    events: {
      raw: []
    },
    eventsFilters: {
      mode: "current"
    }
  };

  function getMeAdminKey() {
    const v =
      cachedInit?.currentUserAdminKey ?? 
      cachedInit?.header?.currentUserAdminKey ?? 
      cachedInit?.userGHIN ??
      cachedInit?.userGhin ??
      cachedInit?.header?.userGHIN ??
      cachedInit?.header?.userGhin ??
      cachedInit?.header?.ghin ??
      cachedInit?.ghin ??
      "";
    return String(v || "").trim();
  }

  function computeQueryAdminKeys() {
    // Perf hack: when adminScope === 'ALL', queryGames should NOT filter by admin key.
    // We keep all keys selected in UI, but send [] to queryGames.
    if (state.filters.adminScope === "ALL") return [];
    return Array.from(state.admins.selectedKeys || []);
  }

  function computeUiAdminKeys() {
    return Array.from(state.admins.selectedKeys || []);
  }

  async function refreshGamesAndAdmins(next) {
    const f = next || {};
    // take next if provided else state
    state.filters.dateFrom = (f.dateFrom ?? state.filters.dateFrom ?? "").trim();
    state.filters.dateTo = (f.dateTo ?? state.filters.dateTo ?? "").trim();
    if (f.adminScope) state.filters.adminScope = f.adminScope;

    // if caller provided selectedAdminKeys, set them into state
    if (Array.isArray(f.selectedAdminKeys)) {
      state.admins.selectedKeys = new Set(f.selectedAdminKeys.filter(Boolean));
    }

 const payloadGames = {
  dateFrom: state.filters.dateFrom || "",
  dateTo: state.filters.dateTo || "",
  selectedAdminKeys: computeQueryAdminKeys(),
  // So queryGames.php can persist the *intent* (and not lose ALL)
  adminScope: state.filters.adminScope || "ME",
  // Always the UI selection (includes all admin keys when scope=ALL)
  uiSelectedAdminKeys: computeUiAdminKeys()
};


    const payloadAdmins = {
      // For UI selection markings, always send the UI-selected keys
      selectedAdminKeys: computeUiAdminKeys()
    };

    const gamesRes = await apiAdmin("queryGames.php", payloadGames);
    if (gamesRes?.payload) applyRenderGames(gamesRes.payload);

    const adminsRes = await apiAdmin("queryFavoriteAdmins.php", payloadAdmins);
    if (adminsRes?.payload) applyRenderAdmins(adminsRes.payload);

    // keep cachedInit in sync (for reloads / later operations)
    cachedInit = cachedInit || {};
    cachedInit.filters = cachedInit.filters || {};
    cachedInit.filters.dateFrom = state.filters.dateFrom;
    cachedInit.filters.dateTo = state.filters.dateTo;
    cachedInit.filters.selectedAdminKeys = computeUiAdminKeys();
    cachedInit.filters.adminScope = state.filters.adminScope;
  }

  // ---- INIT (from PHP injected window.__MA_INIT__/__INIT__) ----
  function applyInit(payload) {
    cachedInit = payload || {};
    try {
      const header = cachedInit.header || {};
      const evCtx  = cachedInit.eventContext || null;

      // ---- EVENT MODE ----
      if (evCtx) {
        state.isEventMode = true;
        const ev = evCtx.event || {};
        const evTitle    = String(ev.dbEvents_Title || "Event Rounds").trim();
        const evStart    = String(ev.startDateISO || ev.dbEvents_StartDate || "").slice(0, 10);
        const evEnd      = String(ev.endDateISO   || ev.dbEvents_EndDate   || "").slice(0, 10);
        const dateRange  = (evStart && evEnd) ? `${evStart}  →  ${evEnd}` : (evStart || evEnd);

        if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
          MA.chrome.setHeaderLines(["Event Rounds", evTitle, dateRange]);
        }
        if (MA.chrome && typeof MA.chrome.showBrand === "function") {
          MA.chrome.showBrand(true);
        }
        if (MA.chrome && typeof MA.chrome.setActions === "function") {
          MA.chrome.setActions({
            left:  { show: false },
            right: { show: true, label: "Actions", onClick: openActionsMenu },
            page:  { label: "+ Add Game to Event", onClick: () => handleGameAction({ action: "addGame" }) }
          });
        }

        if (cachedInit.games) {
          mountGamesSource();
          applyRenderGames({
            header:  cachedInit.header  || {},
            filters: cachedInit.filters || {},
            games:   cachedInit.games   || {}
          });
        }

        setStatus("", "info");
        return;
      }

      // ---- STANDALONE MODE ----
      state.isEventMode = false;

      // Chrome header lines (3 lines available)
      if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
        MA.chrome.setHeaderLines([
          "ADMIN PORTAL",
          header.title || "Games",
          header.subtitle || ""
        ]);
      }

      // Show brand image on this page
      if (MA.chrome && typeof MA.chrome.showBrand === "function") {
        MA.chrome.showBrand(true);
      }

      // Doorway: no chrome-level Actions/page button — each panel now owns
      // its own (see #btnGamesActions/#btnAddGame and #btnEventsActions/
      // #btnAddEvent in adminhome_view.php, wired via wireDoorwayControls()).
      if (MA.chrome && typeof MA.chrome.setActions === "function") {
        MA.chrome.setActions({
          left:  { show: false },
          right: { show: false },
          page:  { show: false }
        });
      }


      // Filters -> inputs + state
      const initFilters = cachedInit.filters || {};
      state.filters.dateFrom = String(initFilters.dateFrom || "");
      state.filters.dateTo = String(initFilters.dateTo || "");

      const df = document.getElementById("dateFrom");
      const dt = document.getElementById("dateTo");
      if (df) df.value = state.filters.dateFrom;
      if (dt) dt.value = state.filters.dateTo;

      // Prime admins selection from init, fallback to ME
      const initSelected = Array.isArray(initFilters.selectedAdminKeys) ? initFilters.selectedAdminKeys : [];
      const me = getMeAdminKey();
      const selected = initSelected.length ? initSelected : (me ? [me] : []);
      state.admins.selectedKeys = new Set(selected);

      // Determine adminScope from init (optional); else infer
      const initScope = String(initFilters.adminScope || "").toUpperCase().trim();
      if (initScope === "ALL" || initScope === "ME" || initScope === "CUSTOM") {
        state.filters.adminScope = initScope;
      } else {
        state.filters.adminScope = "ME";
      }

      if (cachedInit.admins) {
        applyRenderAdmins({
          adminsAll: cachedInit.admins.all || [],
          favoriteAdminKeys: (cachedInit.admins.favorites || []).map((a) => a.key).filter(Boolean),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      }

      if (cachedInit.games) {
        mountGamesSource();
        applyRenderGames({
          header: cachedInit.header || {},
          filters: cachedInit.filters || {},
          games: cachedInit.games || {}
        });
      }

      // Events panel (doorway only — these elements don't exist in Event
      // Rounds mode, and mountEventsSource()/wireDoorwayControls() no-op
      // safely when their target elements aren't in the DOM).
      mountEventsSource();
      if (cachedInit.eventsInit) {
        renderEventsPanel(cachedInit.eventsInit.events || { raw: [] });
      }
      wireDoorwayControls();

      setStatus("", "info");
    } catch (e) {
      console.error("applyInit error:", e);
      setStatus("System Error: INIT failed.", "error");
    }
  }

  // ---- Renderers ----
  function applyRenderGames(payload) {
    renderGames(payload);
  }
  function applyRenderAdmins(payload) {
    renderAdmins(payload);
  }

function renderGames(payload) {
  const dbRows = Array.isArray(payload?.games?.raw) ? payload.games.raw : [];
  state.games.dbRows = dbRows;

  // Card markup, date badge, and click/menu wiring now live in module_sourceGames.js
  // (MA.gamesSource), shared with the Event Rounds context. mountGamesSource() below
  // is called once at boot; here we just hand it the latest rows to re-render.
  if (MA.gamesSource && typeof MA.gamesSource.render === "function") {
    MA.gamesSource.render(dbRows, "cards");
  } else {
    console.warn("[admin_home] MA.gamesSource module not loaded.");
  }
}

// Mounts MA.gamesSource once against the #cards container. Safe to call repeatedly
// (mount() is idempotent) — kept as its own function so applyInit() can call it
// after state.isEventMode is known, in both standalone and event-mode branches.
function mountGamesSource() {
  if (!MA.gamesSource || typeof MA.gamesSource.mount !== "function") return;
  MA.gamesSource.mount({
    cardsElId: "cards",
    emptyElId: "emptyState",
    isEventMode: !!state.isEventMode,
    onAction: (action, ggid) => handleGameAction({ action, ggid })
  });
}

// ============================================================
// Events panel (Phase 3 doorway) — ported from events_home.js
// Only relevant when !state.isEventMode (i.e. #eventCards/.maPanel--secondary
// exist in the DOM — they don't in Event Rounds mode).
// ============================================================

async function postJsonEvents(path, payload) {
  const url = `${apiEventsBase}/${path}`;
  if (typeof MA.postJson === "function") return MA.postJson(url, payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ payload })
  });
  return res.json();
}

function mountEventsSource() {
  if (!MA.eventsSource || typeof MA.eventsSource.mount !== "function") return;
  if (!document.getElementById("eventCards")) return; // not present in Event Rounds mode
  MA.eventsSource.mount({
    cardsElId: "eventCards",
    emptyElId: "eventsEmptyState",
    onAction: (action, eid) => handleEventAction({ action, eid })
  });
}

function renderEventsPanel(eventsPayload) {
  const rows = Array.isArray(eventsPayload?.raw) ? eventsPayload.raw : [];
  state.events.raw = rows;

  if (MA.eventsSource && typeof MA.eventsSource.render === "function") {
    MA.eventsSource.render(rows, "eventCards");
  } else {
    console.warn("[admin_home] MA.eventsSource module not loaded.");
  }
}

async function refreshEvents(mode) {
  if (mode) state.eventsFilters.mode = mode;
  const res = await postJsonEvents("queryEvents.php", { mode: state.eventsFilters.mode });
  if (res?.ok && res?.payload) {
    renderEventsPanel(res.payload.events || res.payload);
    setStatus("", "info");
  } else {
    setStatus(res?.message || "Unable to refresh events.", "error");
  }
}

async function setEventSession(eid) {
  try {
    const res = await postJsonEvents("setEventSession.php", { eid });
    if (!res?.ok) {
      setStatus(res?.message || res?.error || "Unable to open event.", "error");
      return false;
    }
    return true;
  } catch (e) {
    console.error(e);
    setStatus(String(e.message || e), "error");
    return false;
  }
}

async function handleEventAction(args) {
  const action = args?.action || "";
  const eid = String(args?.eid || "");

  if (action === "addEvent") {
    if (typeof routerGo === "function") {
      await routerGo("eventedit", { mode: "add" });
    } else {
      setStatus("Event Maintenance route is not available yet.", "warn");
    }
    return;
  }

  if (!eid) return;

  if (action === "deleteEvent") {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try {
      const res = await postJsonEvents("deleteEvent.php", { eid });
      if (res?.ok) {
        setStatus("Event deleted.", "success");
        await refreshEvents(state.eventsFilters.mode);
      } else {
        setStatus(res?.message || "Unable to delete event.", "error");
      }
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    }
    return;
  }

  // Routes that require event context to be set in session first
  // (mirrors setGameSession before Games actions).
  const ok = await setEventSession(eid);
  if (!ok) return;

  // "eventGames" (Event Rounds) is the drill-in: it sets SessionStoredEID
  // server-side via setEventSession above, then this page (adminhome.php)
  // re-renders itself in Event Rounds mode — sourceGames scoped to the eid.
  const routeMap = {
    openEvent: "event",
    editEvent: "eventedit",
    eventRoster: "eventroster",
    eventGames: "eventrounds",
    eventScoring: "eventscoring"
  };

  const route = routeMap[action];
  if (route && typeof routerGo === "function") {
    await routerGo(route);
  } else {
    setStatus("That event page is not available yet.", "warn");
  }
}

function openEventsActionsMenu() {
  if (!MA.ui || !MA.ui.openActionsMenu) {
    console.warn("MA.ui.openActionsMenu not found.");
    return;
  }
  const items = [
    { label: "My Current Events", action: () => refreshEvents("current") },
    { label: "My Past Events", action: () => refreshEvents("past") },
    { label: "All My Events", action: () => refreshEvents("all") },
    { separator: true },
    { label: "Refresh", action: () => refreshEvents(state.eventsFilters.mode) }
  ];
  MA.ui.openActionsMenu("Actions", items, "Events");
}

// Wires each panel's controls-row buttons and the #ahTabs mobile tab strip.
// Tab strip mirrors game_pairings.js's setActiveTab pattern exactly:
// - delegated click on #ahTabs container
// - toggles is-active on .maSegBtn[data-tab] buttons
// - toggles is-events-open on .maPage--adminHome for CSS panel visibility
// No-op (and safe) in Event Rounds mode — none of these elements exist in DOM.
function wireDoorwayControls() {
  const mainEl = document.querySelector(".maPage--adminHome");

  // Per-panel controls buttons.
  // openModal comes from wireFiltersModal() — passed into openActionsMenu()
  // so the "Advanced Filters…" menu item can open the filters modal.
  const openModal = wireFiltersModal();

  const btnGamesActions  = document.getElementById("btnGamesActions");
  const btnAddGame       = document.getElementById("btnAddGame");
  const btnEventsActions = document.getElementById("btnEventsActions");
  const btnAddEvent      = document.getElementById("btnAddEvent");

  if (btnGamesActions)  btnGamesActions.addEventListener("click", () => openActionsMenu(openModal));
  if (btnAddGame)       btnAddGame.addEventListener("click", () => handleGameAction({ action: "addGame" }));
  if (btnEventsActions) btnEventsActions.addEventListener("click", () => openEventsActionsMenu());
  if (btnAddEvent)      btnAddEvent.addEventListener("click", () => handleEventAction({ action: "addEvent" }));

  // Tab strip — mobile panel switcher
  const tabsEl = document.getElementById("ahTabs");
  if (!tabsEl || !mainEl) {
    if (!tabsEl) console.warn("[admin_home] #ahTabs not found — tab strip not wired.");
    return;
  }

  function setActiveTab(tab) {
    state.activePanel = tab;
    const isEvents = tab === "events";

    tabsEl.querySelectorAll(".maSegBtn").forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", String(on));
    });

    mainEl.classList.toggle("is-events-open", isEvents);
  }

  // Wire directly to each button — avoids any closest() traversal ambiguity
  tabsEl.querySelectorAll(".maSegBtn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  // Set initial tab state from server-side initialPanel
  const initialPanel = (window.__MA_INIT__ || window.__INIT__ || {}).initialPanel || "games";
  setActiveTab(initialPanel);
}


  function renderAdmins(payload) {
    state.admins.all = Array.isArray(payload?.adminsAll) ? payload.adminsAll : [];
    state.admins.favoriteKeys = new Set(Array.isArray(payload?.favoriteAdminKeys) ? payload.favoriteAdminKeys : []);

    // IMPORTANT: keep current selection set unless server is explicitly authoritative for selection.
    // payload.selectedAdminKeys is used to re-render checkmarks after server refresh.
    if (Array.isArray(payload?.selectedAdminKeys)) {
      state.admins.selectedKeys = new Set(payload.selectedAdminKeys.filter(Boolean));
    }

    const rowsEl = document.getElementById("adminRows");
    if (!rowsEl) return;

    const q = String(state.admins.searchText || "").trim().toLowerCase();
    const list = state.admins.all.filter((a) => {
      if (!q) return true;
      return String(a.name || "").toLowerCase().includes(q) || String(a.key || "").includes(q);
    });

    rowsEl.innerHTML = list
      .map((a) => {
        const on = state.admins.selectedKeys.has(a.key);
        const fav = state.admins.favoriteKeys.has(a.key);
        const heartIcon = fav 
          ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="#0066CC"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
          : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0066CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

        return `
        <div class="maAdminRow" data-adminkey="${esc(a.key)}">
          <div class="maAdminRow__left">
            <div class="maCheckbox ${on ? "is-checked" : ""}"></div>
            <div class="maAdminRow__name">${esc(a.name || a.key)}</div>
          </div>
          <div class="maAdminRow__right">
            <button class="iconBtn btnSecondary maAdminRow__heart" type="button" data-heart="1" title="Toggle favorite">${heartIcon}</button>
          </div>
        </div>
      `;
      })
      .join("");

    // row click toggles selection (CLIENT ONLY until Apply)
    rowsEl.querySelectorAll(".maAdminRow").forEach((row) => {
      row.addEventListener("click", () => {
        const k = row.getAttribute("data-adminkey");
        if (!k) return;

        // selecting admins moves us to CUSTOM scope
        state.filters.adminScope = "CUSTOM";

        if (state.admins.selectedKeys.has(k)) state.admins.selectedKeys.delete(k);
        else state.admins.selectedKeys.add(k);

        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      });

      // heart click toggles favorite (stop row toggle)
      const heart = row.querySelector('[data-heart="1"]');
      if (heart) {
        heart.addEventListener("click", async (e) => {
          e.stopPropagation();
          const k = row.getAttribute("data-adminkey");
          if (!k) return;
          await toggleFavoriteAdmin(k);
        });
      }
    });
  }

  // ---- Favorites ----
  async function toggleFavoriteAdmin(adminKey) {
    try {
      await apiAdmin("toggleFavoriteAdmin.php", { adminKey });

      // Toggle local favorite state and re-render the admin list only —
      // no full refresh needed. The server already persisted the change;
      // re-fetching games or overwriting selectedAdminKeys from the server
      // would wipe the user's current checkbox selections.
      if (state.admins.favoriteKeys.has(adminKey)) {
        state.admins.favoriteKeys.delete(adminKey);
      } else {
        state.admins.favoriteKeys.add(adminKey);
      }

      renderAdmins({
        adminsAll: state.admins.all,
        favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
        selectedAdminKeys: Array.from(state.admins.selectedKeys)
      });

      setStatus("Favorites updated.", "success");
    } catch (e) {
      console.error("toggleFavoriteAdmin failed:", e);
      setStatus("Could not update favorites.", "error");
    }
  }

  // ---- Routing / Actions ----
  async function handleGameAction(payload) {
    const action = payload.action || payload.Action || "";
    const ggid = payload.ggid;

    // Admin-level actions not requiring game context
    if (action === "addGame") {
      await routerGo("edit", { mode: "add" });
      return;
    }

    if (action === "import") {
      // route key is "import" per pageRouter ($ROUTES)
      await routerGo("import", {});
      return;
    }
    if (action === "filters") {
      // handled by caller (open modal)
      return;
    }

    if (!ggid) {
      setStatus("Missing GGID for action.", "warn");
      return;
    }

    // 1) authorization for actions (server decides OK/NotOK)
    const requiresAuth = new Set(["editGame", "deleteGame", "roster", "pairings", "teetimes", "settings", "summary", "scorecard", "calendar", "notify"]);
    if (requiresAuth.has(action)) {
      const auth = await apiSession("getGameAuthorizations.php", { ggid, action });
      const ok = auth?.payload?.status === "Authorized" || auth?.payload?.status === "OK" || auth?.status === "OK";
      if (!ok) {
        setStatus("You are not authorized to perform this action on this game.", "warn");
        return;
      }
    }

    // 2) Initialize game session and route for all non-game relevant actions
    //nothing here
    
    
    // 3) Set game session and route for all game relevant actions
    await apiAdmin("setGameSession.php", { ggid });
    if (action === "editGame") return routerGo("edit", { mode: "edit" });
    if (action === "settings") return routerGo("settings", {});
    if (action === "summary") return routerGo("summary", {});
    if (action === "roster") return routerGo("roster", {});
    if (action === "scorecard") return routerGo("scorecard", {});
    if (action === "pairings") return routerGo("pairings", {});
    if (action === "teetimes") return routerGo("teetimes", {});
    
    if (action === "rosterView") {
      if (MA.rosterView && typeof MA.rosterView.open === "function") {
        const g = (state.games.dbRows || []).find(r => String(r.dbGames_GGID) === String(ggid));
        const dt       = parseYmd(g?.dbGames_PlayDate);
        const dateLine = dt
          ? dt.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"2-digit", year:"numeric" })
          : "";
        const subtitle = [dateLine, g?.dbGames_PlayTime || ""].filter(Boolean).join(" ");

        MA.rosterView.open({
          ggid:     ggid,
          title:    g?.dbGames_Title || "Game Roster",
          subtitle: subtitle,
          apiPath:  MA.paths.apiRosterView,
          game:     g || {},                           // ← full raw row, not cherry-picked fields
        });
      } else {
        setStatus("Roster view module not loaded.", "error");
      }
      return;
    }

    if (action === "calendar") {      
      const g = (state.games.dbRows || []).find(r => String(r.dbGames_GGID) === String(ggid));
      if (MA.calendar && MA.calendar.addCalendarEventFromGame) {
        MA.calendar.addCalendarEventFromGame(g);
      } else {
        setStatus("Calendar module not loaded.", "error");
      }
      return
    };

    if (action === "notify") {
      if (MA.notify && typeof MA.notify.open === "function") {
        MA.notify.open({
          ggid:    ggid,
          apiPath: MA.paths.apiNotify,
        });
      } else {
        setStatus("Messaging module not loaded.", "error");
      }
      return;
    }

    if (action === "deleteGame") {
      if (!confirm("Are you sure you want to delete this game?")) return;
      try {
        const res = await apiAdmin("deleteGame.php", { ggid });
        if (!res || !res.ok) throw new Error(res?.message || "Delete failed.");
        setStatus("Game deleted.", "success");
        await refreshGamesAndAdmins();
      } catch (e) {
        console.error(e);
        setStatus(String(e.message || e), "error");
      }
      return;
    }
    console.warn("[MA] Unknown game action:", action, "payload=", payload);
    setStatus("Unknown action: " + action, "warn");
  }

function applyPreset(presetKey) {
  const key = String(presetKey || "").toLowerCase().trim();

  const me = getMeAdminKey();
  const allKeys = state.admins.all.map((a) => a.key).filter(Boolean);

  // Defaults (keep Date objects separate from YMD strings)
  const today = new Date();
  const plus30Date = new Date(today);
  plus30Date.setDate(plus30Date.getDate() + 30);
  const minus30Date = new Date(today);
  minus30Date.setDate(minus30Date.getDate() - 30);

  const todayYmd   = toYmdLocal(today);
  const plus30Ymd  = toYmdLocal(plus30Date);
  const minus30Ymd = toYmdLocal(minus30Date);

  let adminScope = state.filters.adminScope;
  let selectedKeys = Array.from(state.admins.selectedKeys);

  // Default window (matches legacy-style bounded range)
  let dateFrom = minus30Ymd;
  let dateTo   = plus30Ymd;

  if (key === "my") {
    adminScope = "ME";
    selectedKeys = me ? [me] : [];
    dateFrom = minus30Ymd;
    dateTo = plus30Ymd;

  } else if (key === "current") {
    adminScope = "ME";
    selectedKeys = me ? [me] : [];
    dateFrom = todayYmd;          // <-- FIXED (string)
    dateTo = plus30Ymd;

  } else if (key === "past") {
    adminScope = "ME";
    selectedKeys = me ? [me] : [];
    dateFrom = minus30Ymd;
    dateTo = todayYmd;            // <-- FIXED (string)

  } else if (key === "all") {
    adminScope = "ALL";
    selectedKeys = allKeys;
    dateFrom = minus30Ymd;
    dateTo = plus30Ymd;

  } else if (key === "allcurrent") {
    adminScope = "ALL";
    selectedKeys = allKeys;
    dateFrom = todayYmd;          // <-- FIXED (string)
    dateTo = plus30Ymd;

  } else if (key === "allpast") {
    adminScope = "ALL";
    selectedKeys = allKeys;
    dateFrom = minus30Ymd;
    dateTo = todayYmd;            // <-- FIXED (string)

  } else {
    return;
  }
    // write inputs
    const df = document.getElementById("dateFrom");
    const dt = document.getElementById("dateTo");
    if (df) df.value = dateFrom;
    if (dt) dt.value = dateTo;

    // set state + refresh
    state.filters.adminScope = adminScope;
    state.admins.selectedKeys = new Set(selectedKeys);

    return refreshGamesAndAdmins({
      dateFrom,
      dateTo,
      selectedAdminKeys: selectedKeys,
      adminScope
    });
  }

  function openActionsMenu(openFiltersModalFn) {
    if (!MA.ui || !MA.ui.openActionsMenu) {
      console.warn("MA.ui.openActionsMenu not found.");
      return;
    }

    // Event mode: slimmed menu — no presets, no import, no filters
    if (state.isEventMode) {
      const items = [
        { label: "Add Game to Event", action: () => handleGameAction({ action: "addGame" }) },
        { separator: true },
        { label: "Refresh", action: () => refreshGamesAndAdmins() },
      ];
      MA.ui.openActionsMenu("Actions", items, "Event Games");
      return;
    }

    const items = [
      { label: "Add Game", action: () => handleGameAction({ action: "addGame" }) },
      { label: "Import Games", action: () => handleGameAction({ action: "import" }) },
      { separator: true },
      { label: "My Current Games", action: () => applyPreset("current") },
      { label: "My Past Games", action: () => applyPreset("past") },
      { separator: true },
      { label: "All Current Games", action: () => applyPreset("allCurrent") },
      { label: "All Past Games", action: () => applyPreset("allPast") },
      { separator: true },
      { label: "Advanced Filters…", action: () => { if (typeof openFiltersModalFn === "function") openFiltersModalFn(); } },
    ];

    MA.ui.openActionsMenu("Actions", items, "Admin Games List");
  }

  // Per-card actions menu now lives in module_sourceGames.js (buildGameMenu),
  // invoked internally by MA.gamesSource on card-tap / MANAGE click, which then
  // calls back into handleGameAction() via the onAction callback passed to mount().

  // ---- Filters modal wiring ----
function wireFiltersModal() {
  // btnActions (old chrome right button) no longer drives the modal — the
  // panel's #btnGamesActions does via openActionsMenu(openModal). We keep
  // the element lookup for legacy callers but don't block on it.
  const modalOverlay = document.getElementById('modalOverlay');
  if (!modalOverlay) return null;

  const btnCloseX  = document.getElementById('btnCloseModal');
  const btnCancel  = document.getElementById('btnCancelFilters');
  const btnApply   = document.getElementById('btnApplyFilters');
  const segDate    = document.getElementById('segDate');
  const segAdmin   = document.getElementById('segAdmin');
  const panelDate  = document.getElementById('panelDate');
  const panelAdmin = document.getElementById('panelAdmin');

  // ------------------------------------------------------------
  // Segmented control
  // ------------------------------------------------------------
  function setPanel(which) {
    const isDate = which === 'date';
    if (segDate) segDate.classList.toggle('is-active', isDate);
    if (segAdmin) segAdmin.classList.toggle('is-active', !isDate);
    if (panelDate) panelDate.classList.toggle('is-active', isDate);
    if (panelAdmin) panelAdmin.classList.toggle('is-active', !isDate);
  }

  // ---- Native date pickers only ----
  const dateFromEl = document.getElementById('dateFrom');
  const dateToEl   = document.getElementById('dateTo');
  const btnPickFrom = document.getElementById('btnPickFrom');
  const btnPickTo   = document.getElementById('btnPickTo');

  // Hide old custom calendar container if it exists in the modal HTML
  const calWrap = document.getElementById('calWrap');
  if (calWrap) {
    calWrap.style.display = 'none';
    calWrap.setAttribute('aria-hidden', 'true');
  }

  // Icon buttons open the native <input type="date"> picker
  if (btnPickFrom) {
    btnPickFrom.addEventListener('click', (e) => {
      e.preventDefault();
      if (dateFromEl) { dateFromEl.focus(); dateFromEl.click(); }
    });
  }
  if (btnPickTo) {
    btnPickTo.addEventListener('click', (e) => {
      e.preventDefault();
      if (dateToEl) { dateToEl.focus(); dateToEl.click(); }
    });
  }

  // ------------------------------------------------------------
  // modal open/close helpers (preserve + revert behavior)
  // ------------------------------------------------------------
  
  let pendingFrom = '';
  let pendingTo = '';
  let pendingScope = 'ME';
  let pendingSelectedKeys = [];

  const openModal = () => {
    // snapshot current filter state so Cancel/Close can revert
    pendingFrom = String(state.filters?.dateFrom || '');
    pendingTo = String(state.filters?.dateTo || '');
    pendingSelectedKeys = Array.from(state.admins?.selectedKeys || []);

    // seed UI from current state
    if (dateFromEl) dateFromEl.value = pendingFrom;
    if (dateToEl) dateToEl.value = pendingTo;

    // default to Date panel
    setPanel('date');

    // open modal
    modalOverlay.classList.add('is-open');
    modalOverlay.setAttribute('aria-hidden', 'false');
    updateOverlayLock(); ////Scrolling

    // calendar starts closed until user hits a picker (matches legacy look)
    //closeCalendar();
  };

  const closeModal = (revert = true) => {
    if (revert) {
      // revert UI inputs back to snapshot
      if (dateFromEl) dateFromEl.value = pendingFrom;
      if (dateToEl) dateToEl.value = pendingTo;

    }

    //closeCalendar();
    modalOverlay.classList.remove('is-open');
    updateOverlayLock();
    modalOverlay.setAttribute('aria-hidden', 'true');
  };

  // ------------------------------------------------------------
  // wire open + segmented control + buttons
  // ------------------------------------------------------------
  // Note: modal open is now triggered via openActionsMenu(openModal) in
  // wireDoorwayControls() — no direct button listener needed here.

  if (segDate) segDate.addEventListener('click', () => setPanel('date'));
  if (segAdmin) segAdmin.addEventListener('click', () => setPanel('admin'));

  if (btnCloseX) btnCloseX.addEventListener('click', () => closeModal(true));
  if (btnCancel) btnCancel.addEventListener('click', () => closeModal(true));

  if (btnApply) {
        btnApply.addEventListener('click', async () => {
          state.filters = state.filters || {};
          state.filters.dateFrom = String(dateFromEl?.value || '');
          state.filters.dateTo = String(dateToEl?.value || '');

          closeModal(false);

          const dateFrom = document.getElementById("dateFrom")?.value || "";
          const dateTo = document.getElementById("dateTo")?.value || "";
          const selectedAdminKeys = Array.from(state.admins.selectedKeys);

          await refreshGamesAndAdmins({ dateFrom, dateTo, selectedAdminKeys, adminScope: state.filters.adminScope });
        });
  }

  // Return openModal so wireDoorwayControls() can pass it to openActionsMenu()
  // for the "Advanced Filters…" menu item.
  return openModal;

}

  // ---- Boot ----
  document.addEventListener("DOMContentLoaded", () => {
    const initPayload = window.__MA_INIT__ || window.__INIT__ || null;

    // Chrome bottom nav — varies by event mode (set after applyInit)
    if (MA.chrome && typeof MA.chrome.setBottomNav === "function") {
      const isEventMode = !!(window.__MA_INIT__?.eventContext || window.__INIT__?.eventContext);
      MA.chrome.setBottomNav({
        visible: isEventMode
          ? ["eventhome", "eventedit", "eventroster", "eventrounds"]
          : ["home", "favorites", "import"],
        active: isEventMode ? "eventrounds" : "admin",
        onNavigate: (id) => {
          try {
            if (typeof MA.routerGo === "function") {
              // "eventhome" now routes to this same adminhome.php (the retired
              // standalone eventshome.php is gone) — pass mode=events so the
              // doorway opens with the Events tab pre-selected instead of Games.
              if (id === "eventhome") {
                MA.routerGo(id, { mode: "events" });
              } else {
                MA.routerGo(id);
              }
              return;
            }
            const router = MA.paths?.routerApi || "/api/session/pageRouter.php";
            const extra = (id === "eventhome") ? "&mode=events" : "";
            window.location.assign(router + "?action=" + encodeURIComponent(id) + "&redirect=1" + extra);
          } catch (e) {
            console.error(e);
          }
        }
      });
    }

    const adminSearch = document.getElementById("adminSearch");
    if (adminSearch) {
      adminSearch.addEventListener("input", () => {
        state.admins.searchText = adminSearch.value || "";
        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      });
    }

    // ---- ADMINS: Select all ----
    const btnSelectAll = document.getElementById("btnAdminSelectAll");
    if (btnSelectAll) {
      btnSelectAll.addEventListener("click", () => {
        const allKeys = state.admins.all.map((a) => a.key).filter(Boolean);
        state.filters.adminScope = "CUSTOM";
        state.admins.selectedKeys = new Set(allKeys);
        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      });
    }

    // ---- ADMINS: Clear all ----
    const btnClearAll = document.getElementById("btnAdminClearAll");
    if (btnClearAll) {
      btnClearAll.addEventListener("click", () => {
        state.filters.adminScope = "CUSTOM";
        state.admins.selectedKeys = new Set();
        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: []
        });
      });
    }

    // ---- ADMINS: Favorites — select only favorited admins ----
    const btnFavs = document.getElementById("btnAdminToggleFavs");
    if (btnFavs) {
      btnFavs.addEventListener("click", () => {
        const favKeys = Array.from(state.admins.favoriteKeys).filter(Boolean);
        // Fall back to all if no favorites exist
        const keys = favKeys.length ? favKeys
          : state.admins.all.map((a) => a.key).filter(Boolean);
        state.filters.adminScope = "CUSTOM";
        state.admins.selectedKeys = new Set(keys);
        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      });
    }

    if (initPayload) {
      applyInit(initPayload);
      wireFiltersModal();
      return;
    }

    // Fallback: fetch init if not embedded
    (async () => {
      try {
        const res = await apiAdmin("init.php", {});
        applyInit(res?.payload || {});
        wireFiltersModal();
      } catch (e) {
        console.error("INIT fetch failed:", e);
        setStatus("System Error: could not load page.", "error");
      }
    })();
  });
})();