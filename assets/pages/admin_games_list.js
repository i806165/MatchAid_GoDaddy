/* /assets/pages/admin_games_list.js
 * GoDaddy version (no Wix).
 * - Renders games + admins
 * - Supports Advanced Filters modal + header Actions menu presets
 * - Uses /assets/js/ma_shared.js (MA.apiAdminGames, MA.apiSession, MA.routerGo, MA.setStatus)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const apiAdmin = MA.apiAdminGames;
  const apiSession = MA.apiSession;
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
    const menuOpen = !!document.getElementById("menuOverlay")?.classList.contains("open");
    const modalOpen = !!document.getElementById("modalOverlay")?.classList.contains("is-open");
    setOverlayLock(menuOpen || modalOpen);
  }

function badgeParts(ymd) {
  const dt = parseYmd(ymd);
  if (!dt) return { top: "", day: "", bot: "" };
  const mon = dt.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const yy = String(dt.getFullYear()).slice(-2);
  const top = `${mon}'${yy}`; // matches legacy "JAN'26"
  const day = String(dt.getDate());
  const bot = dt.toLocaleDateString(undefined, { weekday: "short" }); // "Thu"
  return { top, day, bot };
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
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    console.log("[MA][QUERY] scope=", state.filters.adminScope,
      "dateFrom=", payloadGames.dateFrom,
      "dateTo=", payloadGames.dateTo,
      "selectedAdminKeys=", payloadGames.selectedAdminKeys
    );
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    console.log("[MA][INIT] games.raw len:", Array.isArray(cachedInit?.games?.vm) ? cachedInit.games.vm.length : "no vm",
            "games.raw len:", Array.isArray(cachedInit?.games?.raw) ? cachedInit.games.raw.length : "no raw");
//xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    try {
      const header = cachedInit.header || {};

      // Chrome header lines (3 lines available)
      if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
        MA.chrome.setHeaderLines([
          "ADMIN PORTAL",
          header.title || "Games",
          header.subtitle || ""
        ]);
      }

      // Chrome actions (hide left; show right as “Actions”)
      if (MA.chrome && typeof MA.chrome.setActions === "function") {
        MA.chrome.setActions({
          left:  { show: false },
          right: { show: true, label: "Actions" } // 
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
        applyRenderGames({
          header: cachedInit.header || {},
          filters: cachedInit.filters || {},
          games: cachedInit.games || {}
        });
      }

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
  const cardsEl = document.getElementById("cards");
  const emptyEl = document.getElementById("emptyState");
  if (!cardsEl) return;

const dbRows = Array.isArray(payload?.games?.raw) ? payload.games.raw : [];
state.games.dbRows = dbRows;

if (!state.games.dbRows.length) {
  cardsEl.innerHTML = "";
  if (emptyEl) emptyEl.style.display = "block";
  return;
}
if (emptyEl) emptyEl.style.display = "none";

cardsEl.innerHTML = state.games.dbRows
  .map((r) => {
    const playDate = String(r.dbGames_PlayDate || "").trim();
    const b = badgeParts(playDate);

    const course = String(r.dbGames_CourseName || "").trim();
    const facility = String(r.dbGames_FacilityName || "").trim();
    const adminName = String(r.dbGames_AdminName || r.dbGames_AdminGHIN || "").trim();

    const playTimeDb = String(r.dbGames_PlayTime || "").trim();      // "09:51:00"
    const playTime = playTimeDb ? playTimeDb.substring(0, 5) : "";   // "09:51"

    const privacy = String(r.dbGames_Privacy || "").trim();
    const holes = String(r.dbGames_Holes || "").trim();

    // playerCount may or may not exist in raw depending on your SQL.
    // Use it if present; otherwise 0.
    const playerCount = Number(r.playerCount ?? r.dbGames_PlayerCount ?? 0);

    const teeCnt = Number(r.dbGames_TeeTimeCnt ?? 0);
    const totalSlots = teeCnt > 0 ? teeCnt * 4 : 0;
    const playersText = totalSlots > 0 ? `${playerCount}/${totalSlots}` : `${playerCount}`;

    const line2 = [playTime, holes].filter(Boolean).join(" • ");

    const line3 = [
      (playersText ? `Registered ${playersText}` : null),
      (privacy ? `Accessible by ${privacy}` : null),
    ].filter(Boolean).join(" • ");

    const title = String(r.dbGames_Title || "").trim();
    const ggid = String(r.dbGames_GGID ?? "").trim();

    return `
      <div class="maCard maGameCard" data-ggid="${esc(ggid)}">
        <div class="maCard__hdr">
          <div class="maCard__title">
            <span class="maCard__titleText">${esc(title)}</span>
            <span class="maCard__titleGgid">${esc(ggid)}</span>
          </div>

          <div class="maCard__actions">
            <div class="maGameCard__hdrAdmin" title="${esc(adminName)}">${esc(adminName)}</div>
          </div>
        </div>

        <div class="maCard__body maGameCard__body">
          <div class="maGameCard__top">
            <div class="maDateBadge">
              <div class="maDateBadge__top">${esc(b.top)}</div>
              <div class="maDateBadge__mid">${esc(b.day)}</div>
              <div class="maDateBadge__bot">${esc(b.bot)}</div>
            </div>
            
            <div class="maGameCard__meta">
                <div class="maGameCard__line1">
                  <div class="maGameCard__courseWrap" title="${esc([course, facility].filter(Boolean).join(" • "))}">
                    <span class="maGameCard__courseName">${esc(course)}</span>
                    ${facility ? `<span class="maGameCard__facilityName"> • ${esc(facility)}</span>` : ``}
                  </div>

                  <!-- Desktop-only visual affordance; mobile hides this -->
                  <button
                    type="button"
                    class="maCard__actionBtn maGameCard__manageBtn"
                    data-action="menu"
                    data-ggid="${esc(ggid)}"
                    aria-label="Manage"
                  >MANAGE</button>
                </div>

                <div class="maGameCard__line2">
                  <div class="maGameCard__facts" title="${esc(line2)}">${esc(line2)}</div>
                </div>
                <div class="maGameCard__line3">
                  <div class="maGameCard__facts" title="${esc(line3)}">${esc(line3)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // 1) Card tap opens menu (ALL devices)
  cardsEl.querySelectorAll(".maGameCard").forEach((card) => {
    card.addEventListener("click", (e) => {
      // if a real control was clicked, let it handle itself
      if (e.target.closest("button,a,input,label")) return;

      const ggid = card.getAttribute("data-ggid");
      const r = state.games.dbRows.find((x) => String(x.dbGames_GGID) === String(ggid)) || null;
      if (!r) return;
      openGameMenu(r);
    });
  });

  // 2) MANAGE button: same behavior as card tap, but stop bubbling
  cardsEl.querySelectorAll('button[data-game-action="menu"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ggid = btn.getAttribute("data-ggid");
      const r = state.games.dbRows.find((x) => String(x.dbGames_GGID) === String(ggid)) || null;
      if (!r) return;
      openGameMenu(r);
    });
  });
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
        return `
        <div class="maAdminRow" data-adminkey="${esc(a.key)}">
          <div class="maAdminRow__left">
            <div class="maAdminRow__check ${on ? "on" : ""}">${on ? "✓" : ""}</div>
            <div class="maAdminRow__name">${esc(a.name || a.key)}</div>
          </div>
          <div class="maAdminRow__right">
            <div class="maAdminRow__heart ${fav ? "on" : ""}" data-heart="1" title="Toggle favorite">${fav ? "♥" : "♡"}</div>
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
      await apiAdmin("upsertFavoriteAdmin.php", { adminKey });
      setStatus("Favorites updated.", "success");
      // refresh admins + games with current state
      await refreshGamesAndAdmins({
        dateFrom: document.getElementById("dateFrom")?.value || state.filters.dateFrom,
        dateTo: document.getElementById("dateTo")?.value || state.filters.dateTo,
        selectedAdminKeys: Array.from(state.admins.selectedKeys),
        adminScope: state.filters.adminScope
      });
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
    const requiresAuth = new Set(["editGame", "deleteGame", "roster", "pairings", "teetimes", "settings", "viewGame", "viewScoreCard", "calendar"]);
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
    if (action === "viewGame") return routerGo("gameReview", {});
    if (action === "roster") return routerGo("roster", {});
    if (action === "viewScoreCard") return routerGo("scorecard", {});
    if (action === "pairings") return routerGo("pairings", {});
    if (action === "teetimes") return routerGo("teetimes", {});
    if (action === "settings") return routerGo("settings", {});
    if (action === "calendar") return routerGo("gameCalendar", {});
    if (action === "deleteGame") {
      setStatus("Delete not wired yet (needs endpoint).", "warn");
      return;
    }

    console.warn("[MA] Unknown game action:", action, "payload=", payload);
    setStatus("Unknown action: " + action, "warn");
  }

  // ---- Menus (Overlay) ----
  function openMenu(html) {
    const overlay = document.getElementById("menuOverlay");
    const host = document.getElementById("menuHost");
    if (!overlay || !host) return null;

    host.innerHTML = html;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    updateOverlayLock();   ///Scrolling

    const close = () => {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
      host.innerHTML = "";
      updateOverlayLock(); ///Scrolling
    };

    overlay.addEventListener(
      "click",
      (e) => {
        if (e.target === overlay) close();
      },
      { once: true }
    );

    host.querySelectorAll("[data-closemenu='1']").forEach((b) => b.addEventListener("click", close));
    host.querySelectorAll("[data-menuclick]").forEach((el) => {
      el.addEventListener("click", async () => {
        const action = el.getAttribute("data-menuclick");
        close();
        const fn = el._onMenuClick;
        if (typeof fn === "function") await fn(action);
      });
    });

    return close;
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
    const html = `
      <div class="actionMenu">
        <div class="actionMenu_header">
          <div class="actionMenu_headerRow">
            <div class="actionMenu_headerSpacer"></div>
            <div>
              <div class="actionMenu_title">Actions</div>
              <div class="actionMenu_subtitle">Admin Games List</div>
            </div>
            <button class="actionMenu_closeBtn" type="button" data-closemenu="1">✕</button>
          </div>
        </div>

        <button class="actionMenu_item" type="button" data-menuclick="current">My Current Games</button>
        <button class="actionMenu_item" type="button" data-menuclick="past">My Past Games</button>
        <div class="actionMenu_divider"></div>
        <button class="actionMenu_item" type="button" data-menuclick="allCurrent">All Current Games</button>
        <button class="actionMenu_item" type="button" data-menuclick="allPast">All Past Games</button>
        <div class="actionMenu_divider"></div>
        <button class="actionMenu_item" type="button" data-menuclick="filters">Advanced Filters…</button>
        <div class="actionMenu_divider"></div>
        <button class="actionMenu_item" type="button" data-menuclick="addGame">Add Game</button>
        <button class="actionMenu_item" type="button" data-menuclick="import">Import Games</button>
      </div>
    `;

    openMenu(html);

    const host = document.getElementById("menuHost");
    if (!host) return;

    host.querySelectorAll("[data-menuclick]").forEach((el) => {
      el._onMenuClick = async (action) => {
        const a = String(action || "");
        if (a === "filters") {
          if (typeof openFiltersModalFn === "function") openFiltersModalFn();
          return;
        }

        // Presets
        if (["my", "current", "past", "all", "allCurrent", "allPast"].includes(a)) {
          await applyPreset(a);
          return;
        }

        // Page actions
        if (a === "addGame" || a === "import") {
          await handleGameAction({ action: a });
          return;
        }
      };
    });
  }

  function openGameMenu(g) {
    const dt = parseYmd(g.dbGames_PlayDate);
    const dateLine = dt ? dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit", year: "numeric" }) : "";

    const html = `
      <div class="actionMenu">
        <div class="actionMenu_header">
          <div class="actionMenu_headerRow">
            <div>
              <div class="actionMenu_title">${esc(g.dbGames_Title || "Game")}</div>
              <div class="actionMenu_subtitle">${esc(dateLine)} ${esc(g.dbGames_PlayTime || "")}</div>
            </div>
            <button class="actionMenu_closeBtn" type="button" data-closemenu="1">✕</button>
          </div>
        </div>

        <button class="actionMenu_item" type="button" data-menuclick="editGame">Edit</button>
        <button class="actionMenu_item" type="button" data-menuclick="pairings">Pairings</button>
        <button class="actionMenu_item" type="button" data-menuclick="teetimes">Tee Times</button>
        <button class="actionMenu_item" type="button" data-menuclick="settings">Settings</button>
        <div class="actionMenu_divider"></div>
        <button class="actionMenu_item" type="button" data-menuclick="viewGame">Review</button>
        <button class="actionMenu_item" type="button" data-menuclick="viewScoreCard">Scorecard</button>
        <button class="actionMenu_item" type="button" data-menuclick="calendar">Calendar</button>
      </div>
    `;

    openMenu(html);

    const host = document.getElementById("menuHost");
    if (!host) return;

    host.querySelectorAll("[data-menuclick]").forEach((el) => {
      el._onMenuClick = async (action) => {
        await handleGameAction({ action, ggid: g.dbGames_GGID });
      };
    });
  }

  // ---- Filters modal wiring ----
function wireFiltersModal() {
    const btnActions = document.getElementById('chromeBtnRight') || document.getElementById('btnOpenFilter');
  const modalOverlay = document.getElementById('modalOverlay');

  const btnCloseX = document.getElementById('btnCloseModal');
  const btnCancel = document.getElementById('btnCancelFilters');
  const btnApply = document.getElementById('btnApplyFilters');

  const segDate = document.getElementById('segDate');
  const segAdmin = document.getElementById('segAdmin');
  const panelDate = document.getElementById('panelDate');
  const panelAdmin = document.getElementById('panelAdmin');

  if (!btnActions || !modalOverlay) return;

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

  // ------------------------------------------------------------
  // Inline calendar (legacy UX replication)
  // ------------------------------------------------------------
  const dateFromEl = document.getElementById('dateFrom');
  const dateToEl = document.getElementById('dateTo');
  const btnPickFrom = document.getElementById('btnPickFrom');
  const btnPickTo = document.getElementById('btnPickTo');

  const calWrap = document.getElementById('calWrap');
  const calHint = document.getElementById('calHint');
  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');
  const calToday = document.getElementById('calToday');
  const calMonthLabel = document.getElementById('calMonthLabel');
  const calGrid = document.getElementById('calGrid');

  let activeTarget = 'from'; // 'from' | 'to'
  let viewMonth = null; // Date at first of month

  const pad2 = (n) => String(n).padStart(2, '0');

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseISODate(s) {
    // expects YYYY-MM-DD
    if (!s || typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    const d = new Date(y, mo - 1, da);
    // guard against JS date rollover
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
    return d;
  }

  function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, delta) {
    return new Date(d.getFullYear(), d.getMonth() + delta, 1);
  }

  function sameDay(a, b) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function ensureCalendarOpen() {
    if (!calWrap) return;
    calWrap.classList.add('open');
    calWrap.setAttribute('aria-hidden', 'false');
  }

  function closeCalendar() {
    if (!calWrap) return;
    calWrap.classList.remove('open');
    calWrap.setAttribute('aria-hidden', 'true');
  }

  function setHint() {
    if (!calHint) return;
    calHint.textContent = activeTarget === 'from' ? 'Select From Date' : 'Select To Date';
  }

  function setViewMonthFromInputs() {
    const fromD = parseISODate(dateFromEl?.value);
    const toD = parseISODate(dateToEl?.value);

    const basis = (activeTarget === 'from' ? fromD : toD) || fromD || toD || new Date();
    viewMonth = monthStart(basis);
  }

  function setMonthLabel() {
    if (!calMonthLabel || !viewMonth) return;
    const monthName = viewMonth.toLocaleString(undefined, { month: 'long' });
    calMonthLabel.textContent = `${monthName} ${viewMonth.getFullYear()}`;
  }

  function clearGrid() {
    if (!calGrid) return;
    calGrid.innerHTML = '';
  }

  function renderCalendar() {
    if (!calGrid || !viewMonth) return;

    clearGrid();
    setMonthLabel();
    setHint();

    const fromD = parseISODate(dateFromEl?.value);
    const toD = parseISODate(dateToEl?.value);

    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const firstDow = first.getDay(); // 0..6 (Sun..Sat)
    const start = new Date(first);
    start.setDate(first.getDate() - firstDow); // start on Sunday

    // 6 weeks grid = 42 cells (legacy-style stable layout)
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'maCalDay';
      cell.textContent = String(d.getDate());
      cell.dataset.iso = toISODate(d);

      // in-month styling
      if (d.getMonth() !== viewMonth.getMonth()) {
        cell.classList.add('muted');
      }

      // selected endpoints
      if (sameDay(d, fromD) || sameDay(d, toD)) {
        cell.classList.add('selected');
      }

      // in-range shading (exclusive of endpoints)
      if (fromD && toD) {
        const t = d.getTime();
        const a = fromD.getTime();
        const b = toD.getTime();
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (t > lo && t < hi) {
          cell.classList.add('inRange');
        }
      }

      cell.addEventListener('click', () => {
        onPickDay(d);
      });

      calGrid.appendChild(cell);
    }
  }

  function onPickDay(d) {
    const iso = toISODate(d);

    // current values
    const fromD = parseISODate(dateFromEl?.value);
    const toD = parseISODate(dateToEl?.value);

    if (activeTarget === 'from') {
      // set From
      if (dateFromEl) dateFromEl.value = iso;

      // legacy rule: if From > To then clear To
      if (toD && d.getTime() > toD.getTime()) {
        if (dateToEl) dateToEl.value = '';
      }

      // after picking From, next target is To
      activeTarget = 'to';
      setHint();
    } else {
      // set To
      if (dateToEl) dateToEl.value = iso;

      // legacy rule: if To < From then swap
      const newFrom = parseISODate(dateFromEl?.value);
      const newTo = parseISODate(dateToEl?.value);
      if (newFrom && newTo && newTo.getTime() < newFrom.getTime()) {
        if (dateFromEl) dateFromEl.value = toISODate(newTo);
        if (dateToEl) dateToEl.value = toISODate(newFrom);
      }

      // after picking To, remain on To (matches legacy feel)
      activeTarget = 'to';
      setHint();
    }

    // keep calendar on the same month unless user navigates
    renderCalendar();
  }

  function openCalendarFor(target) {
    activeTarget = target;
    ensureCalendarOpen();
    setViewMonthFromInputs();
    renderCalendar();
  }

  // Calendar controls
  if (calPrev) {
    calPrev.addEventListener('click', (e) => {
      e.preventDefault();
      if (!viewMonth) setViewMonthFromInputs();
      viewMonth = addMonths(viewMonth || new Date(), -1);
      renderCalendar();
    });
  }

  if (calNext) {
    calNext.addEventListener('click', (e) => {
      e.preventDefault();
      if (!viewMonth) setViewMonthFromInputs();
      viewMonth = addMonths(viewMonth || new Date(), 1);
      renderCalendar();
    });
  }

  if (calToday) {
    calToday.addEventListener('click', (e) => {
      e.preventDefault();
      const t = new Date();
      viewMonth = monthStart(t);
      onPickDay(t);
      renderCalendar();
    });
  }

  // picker buttons open the legacy inline calendar (not native picker)
  if (btnPickFrom) {
    btnPickFrom.addEventListener('click', (e) => {
      e.preventDefault();
      openCalendarFor('from');
    });
  }

  if (btnPickTo) {
    btnPickTo.addEventListener('click', (e) => {
      e.preventDefault();
      openCalendarFor('to');
    });
  }

  // if user focuses the input directly, also open the inline calendar (legacy-friendly)
  if (dateFromEl) {
    dateFromEl.addEventListener('focus', () => openCalendarFor('from'));
    dateFromEl.addEventListener('change', () => {
      setViewMonthFromInputs();
      renderCalendar();
    });
  }
  if (dateToEl) {
    dateToEl.addEventListener('focus', () => openCalendarFor('to'));
    dateToEl.addEventListener('change', () => {
      setViewMonthFromInputs();
      renderCalendar();
    });
  }

  // ------------------------------------------------------------
  // modal open/close helpers (preserve + revert behavior)
  // ------------------------------------------------------------
  //let pendingFrom = '';
  //let pendingTo = '';
  //let pendingAdmin = '';
  //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  let pendingFrom = '';
  let pendingTo = '';
  let pendingScope = 'ME';
  let pendingSelectedKeys = [];

  const openModal = () => {
    // snapshot current filter state so Cancel/Close can revert
    pendingFrom = String(state.filters?.dateFrom || '');
    pendingTo = String(state.filters?.dateTo || '');
    //pendingAdmin = String(state.filters?.adminGhin || '');
    //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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
    closeCalendar();
  };

  const closeModal = (revert = true) => {
    if (revert) {
      // revert UI inputs back to snapshot
      if (dateFromEl) dateFromEl.value = pendingFrom;
      if (dateToEl) dateToEl.value = pendingTo;

    }

    closeCalendar();
    modalOverlay.classList.remove('is-open');
    updateOverlayLock();
    modalOverlay.setAttribute('aria-hidden', 'true');
  };

  // ------------------------------------------------------------
  // wire open + segmented control + buttons
  // ------------------------------------------------------------
  btnActions.addEventListener('click', (e) => {
    e.preventDefault();
    openActionsMenu(openModal);   // <-- opens interim Actions menu; menu item "filters" opens modal
  });


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

}

  // ---- Boot ----
  document.addEventListener("DOMContentLoaded", () => {
    const initPayload = window.__MA_INIT__ || window.__INIT__ || null;

    // Chrome bottom nav: Home + Favorites only, centered
    if (MA.chrome && typeof MA.chrome.setBottomNav === "function") {
      MA.chrome.setBottomNav({
        visible: ["home", "admin", "favorites", "import"],
        active: "admin",
        onNavigate: (id) => {
          try {
            if (typeof MA.routerGo === "function") {
              MA.routerGo(id); // expects pageRouter actions: home, admin, import
              return;
            }
            // last resort fallback (should not be hit if MA.routerGo is present)
            const router = MA.paths?.routerApi || "/api/session/pageRouter.php";
            window.location.assign(router + "?action=" + encodeURIComponent(id) + "&redirect=1");
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

    const btnAll = document.getElementById("btnAdminToggleAll");
    if (btnAll) {
      btnAll.addEventListener("click", () => {
        const allKeys = state.admins.all.map((a) => a.key).filter(Boolean);
        const allSelected = allKeys.length && allKeys.every((k) => state.admins.selectedKeys.has(k));
        state.filters.adminScope = "CUSTOM";
        state.admins.selectedKeys = new Set(allSelected ? [] : allKeys);
        renderAdmins({
          adminsAll: state.admins.all,
          favoriteAdminKeys: Array.from(state.admins.favoriteKeys),
          selectedAdminKeys: Array.from(state.admins.selectedKeys)
        });
      });
    }

    const btnFavs = document.getElementById("btnAdminToggleFavs");
    if (btnFavs) {
      btnFavs.addEventListener("click", () => {
        const favKeys = Array.from(state.admins.favoriteKeys);
        const favSelected = favKeys.length && favKeys.every((k) => state.admins.selectedKeys.has(k));
        state.filters.adminScope = "CUSTOM";
        state.admins.selectedKeys = new Set(favSelected ? [] : favKeys);
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
