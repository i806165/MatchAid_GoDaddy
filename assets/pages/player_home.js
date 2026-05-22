/* /assets/pages/player_home.js
   Player Portal Games List (GoDaddy refactor scaffold)
   - Follows admin page pattern
   - Preserves many Wix HTML IDs in the PHP view
   - First pass: init + filters + card render + action menu hooks

   CHANGE SUMMARY (UI refactor only):
   - Added wireSidebar() function — wires the desktop sidebar filter panel
   - wireSidebar() reads/writes the SAME state.filters and state.uiFilters
     as the modal, using the same reloadGames() call. Zero business logic change.
   - Added buildSidebarCourses() helper — derives course list from state.games
     (courses panel is client-side only; no new API calls)
   - initialize() now calls wireSidebar() after wireEvents()
   - All existing functions unchanged
*/
(function(){
  'use strict';

  const MA = window.MA || {};
  const apiAdmin = MA.apiAdminGames;
  const init = window.__MA_INIT__ || window.__INIT__ || {};
  const routes = MA.routes || {};
  const chrome = MA.chrome || {};

  const apiBase = routes.apiPlayerGames || '/api/player_home';
  const apiAdminBase = (MA.paths && MA.paths.apiAdminGames) || routes.apiAdminGames || '/api/admin_games';
  const routerGo = typeof MA.routerGo === 'function' ? MA.routerGo : null;

  const el = {
    cards: document.getElementById('cards'),
    emptyState: document.getElementById('emptyState'),
    overlay: document.getElementById('overlay'),
    status: document.getElementById('status'),

    // Filter modal (mobile path — unchanged)
    segDate: document.getElementById('segDate'),
    segAdmin: document.getElementById('segAdmin'),
    panelDate: document.getElementById('panelDate'),
    panelAdmin: document.getElementById('panelAdmin'),
    dateFrom: document.getElementById('dateFrom'),
    dateTo: document.getElementById('dateTo'),
    adminSearch: document.getElementById('adminSearch'),
    adminRows: document.getElementById('adminRows'),
    btnOpenFilter: document.getElementById('btnOpenFilter'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCancelFilters: document.getElementById('btnCancelFilters'),
    btnApplyFilters: document.getElementById('btnApplyFilters'),
    btnAdminToggleAll: document.getElementById('btnAdminToggleAll'),
    btnAdminToggleFavs: document.getElementById('btnAdminToggleFavs'),
  };

  const state = {
    header: init.header || { title: 'PLAYER PORTAL', subtitle: '' },
    filters: normalizeFilters(init.defaultFilters || init.filters || {}),
    uiFilters: null,
    admins: Array.isArray(init.admins) ? init.admins : [],
    games: Array.isArray(init.games?.vm) ? init.games.vm : (Array.isArray(init.games) ? init.games : []),
    rawGames: Array.isArray(init.games?.raw) ? init.games.raw : [],
    directLinkGGID: String(init.directLinkGGID || ''),
    directLinkMode: !!init.directLinkMode,
    busy: false,
  };
  state.uiFilters = cloneFilters(state.filters);

  const FILTER_LABELS = {
    MYSCHEDULE: 'My Upcoming Games',
    HISTORY: 'My Past Games Played',
    FAVORITES: 'Games from my Favorite Admins',
    OPEN: 'All Available Games',
    CUSTOM: 'Filtered Results' // For when quickPreset is empty, implying advanced filters
  };

  // ---- Date Helpers (Admin parity) ----
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

  function normalizeFilters(f){
    return {
      dateFrom: String(f.dateFrom || ''),
      dateTo: String(f.dateTo || ''),
      selectedAdminKeys: Array.isArray(f.selectedAdminKeys) ? [...new Set(f.selectedAdminKeys.map(String).filter(Boolean))] : [],
      quickPreset: String(f.quickPreset || ''),
    };
  }
  function cloneFilters(f){ return normalizeFilters(JSON.parse(JSON.stringify(f))); }

  function getUserCtx() {
  // Player portal canonical: user info is hydrated under init.context (Admin parity)
    return (init && init.context) ? init.context : (init && init.user ? init.user : {});
  }

  function setStatus(msg, level){
    if (typeof MA.setStatus === 'function') return MA.setStatus(msg || '', level || '');
    if (el.status) el.status.textContent = msg || '';
    if (msg) console.log('[PLAYER_GAMES]', level || 'info', msg);
  }

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function applyChrome(){
    const currentFilterLabel = state.directLinkMode
      ? 'Linked Game'
      : (FILTER_LABELS[state.filters.quickPreset] || FILTER_LABELS.CUSTOM);
    const gamesCount = state.games.length;
    const line2Subtitle = (gamesCount === 0 && currentFilterLabel === FILTER_LABELS.CUSTOM) 
                          ? "No Games Found" : `${currentFilterLabel} (${gamesCount})`;

    if (chrome && typeof chrome.setHeaderLines === 'function') {
      chrome.setHeaderLines(['PLAYER PORTAL', line2Subtitle, ""]);
    }
    if (chrome && typeof chrome.setActions === 'function') {
      chrome.setActions({
        right: { show: true, label: 'Actions', onClick: () => openActionsMenu(openFiltersModal) }
      });
    }
    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['home','player'],
        active: 'player',
        onNavigate: (id) => {
          if (id === 'player') return;
          if (routerGo) return routerGo(id);
        }
      });
    }
  }

  function formatPlayDateBadge(dateText){
    const dt = parseYmd(dateText);
    if (!dt) return { top: "", day: "", bot: "" };
    const mon = dt.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
    const yy = String(dt.getFullYear()).slice(-2);
    const top = `${mon}'${yy}`;
    return { top, day: String(dt.getDate()), bot: dt.toLocaleDateString(undefined, { weekday: "short" }) };
  }

  function formatTimeAmPm(str) {
    if (!str) return '';
    const [h, m] = str.split(':');
    const H = parseInt(h, 10);
    if (isNaN(H)) return str;
    const ampm = H >= 12 ? 'PM' : 'AM';
    const h12 = H % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  function rowText(g, keys){
    for (const k of keys){
      const v = g?.[k];
      if (v != null && String(v).trim() !== '') return String(v);
    }
    return '';
  }

  function inferStatuses(g){
    const reg = !!(g.isRegistered || g.registered || String(g.enrollmentStatus||'').toLowerCase() === 'registered');
    const regStatus = rowText(g, ['registrationStatus']) || 'Open';
    return {
      enrollmentStatus: reg ? 'Registered' : 'Not Registered',
      registrationStatus: regStatus
    };
  }

function getGameAdminMeta(g){
  const ggid = String(g?.ggid || g?.dbGames_GGID || '').trim();

  const rawGame = (state.rawGames || []).find(r =>
    String(r?.dbGames_GGID || r?.ggid || '').trim() === ggid
  ) || null;

  const adminKey = String(rawGame?.dbGames_AdminGHIN || '').trim();
  const adminName = String(rawGame?.dbGames_AdminName || g?.adminName || g?.dbGames_AdminName || '').trim();
  const adminLName = String(rawGame?.dbGames_AdminLName || '').trim();
  const facilityId = String(rawGame?.dbGames_FacilityID || '').trim();
  const facilityName = String(rawGame?.dbGames_FacilityName || g?.facilityName || g?.dbGames_FacilityName || '').trim();
  const adminAssocId = String(rawGame?.dbGames_AssocID || '').trim();
  const adminAssocName = String(rawGame?.dbGames_AssocName || '').trim();
  const courseConfirmed = !!(rawGame?.dbGames_CourseConfirmed == 1 || rawGame?.dbGames_CourseConfirmed === true);

  const adminRow = (state.admins || []).find(a =>
    String(a.key || a.adminKey || '').trim() === adminKey
  );

  return {
    adminKey,
    adminName,
    adminLName,
    facilityId,
    facilityName,
    adminAssocId,
    adminAssocName,
    courseConfirmed,
    isFavorite: !!(adminRow && adminRow.isFavorite)
  };
}

  function actionItemsForGame(g){
    const { enrollmentStatus, registrationStatus } = inferStatuses(g);
    const isRegistered = enrollmentStatus === 'Registered';
    const regClosedish = ['Closed','Locked','Full'].includes(registrationStatus);
    const scoreId = rowText(g, ['yourPlayerKey', 'scoreId', 'playerKey', 'dbPlayers_PlayerKey']);
    const postedId = rowText(g, ['ghinPostId']);

    const adminMeta = getGameAdminMeta(g);
    const favoriteAdminLabel = adminMeta.adminKey
      ? (adminMeta.isFavorite ? `UnFollow ${adminMeta.adminName}'s Games` : `Follow Games from ${adminMeta.adminName}`)
      : 'Admin Favorite Unavailable';
    const favoriteAdminDanger = !!adminMeta.isFavorite;

    // 1. Pre-calculate dynamic labels and states
    const regLabel = isRegistered ? 'Change your Tee Set' : 'Register for this Game';
    const scoreLabel = scoreId ? 'Open Scoring Portal' : 'Scoring not yet Activated';
    const postLabel = postedId ? 'Score Already Posted to GHIN' : 'Post Score to GHIN';

    // 2. Define the menu structure declaratively
    const menu = [
      // Participation Group
      { category: "REGISTRATION ACTIONS"},
      { label: regLabel, action: 'register', enabled: true, indent: true },
      isRegistered ? { label: 'Unregister yourself', action: 'unregister', enabled: !regClosedish, indent: true } : null,
      { label: 'Add a Player or Guest', action: 'viewRoster', enabled: true, indent: true },

      { category: "GAME REVIEW"},
      { label: 'View Game Players',    action: 'rosterView',  enabled: true, indent: true },
      { label: 'View All Game Details', action: 'viewGame', enabled: true, indent: true },

      { category: "DIGITAL SCORING"},
      { label: scoreLabel, action: 'scorehome', enabled: !!scoreId, indent: true },
      scoreId ? { label: 'Scoring Leaderboard', action: 'scoresummary', enabled: true, indent: true } : null,
      isRegistered ? { label: postLabel, action: 'ghinPost', enabled: !postedId, indent: true } : null,

      { category: "ACCESSIBILITY TOOLS"},
      { label: 'Add this Game to your Calendar', action: 'calendar', enabled: true, indent: true },
      { label: favoriteAdminLabel, action: 'toggleFavoriteAdmin', enabled: !!adminMeta.adminKey, danger: favoriteAdminDanger }
    ];

    // 3. Remove null entries (conditional items) and return
    return menu.filter(Boolean);
  }

  function renderCards(){
    if (!el.cards) return;
    
    // Dynamic Sort Direction (Admin parity):
    // 1. Count Future vs Past games in current set
    // 2. If Future >= Past -> Sort ASC (Oldest -> Newest)
    // 3. If Past > Future -> Sort DESC (Newest -> Oldest)
    // 4. Default (empty/no dates) -> DESC
    
    const todayYmd = toYmdLocal(new Date());
    const rawList = Array.isArray(state.games) ? state.games : [];
    
    let futureCount = 0;
    let pastCount = 0;
    
    rawList.forEach(g => {
      const d = rowText(g, ['playDate','dbGames_PlayDate']);
      if (!d) return;
      if (d >= todayYmd) futureCount++; else pastCount++;
    });

    const sortAsc = (futureCount >= pastCount);

    const games = rawList.slice().sort((a, b) => {
      const da = rowText(a, ['playDate','dbGames_PlayDate']) || '';
      const db = rowText(b, ['playDate','dbGames_PlayDate']) || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });

    el.cards.innerHTML = '';

    if (!games.length) {
      if (el.emptyState) el.emptyState.style.display = '';
      return;
    }
    if (el.emptyState) el.emptyState.style.display = 'none';

    games.forEach(g => {
      const card = document.createElement('section');
      card.className = 'maCard';
      card.dataset.ggid = String(g.ggid || g.dbGames_GGID || '');

      const title = rowText(g, ['title','dbGames_Title']) || 'Game';
      const ggid = rowText(g, ['ggid','dbGames_GGID']);
      const playDateRaw = rowText(g, ['playDate','dbGames_PlayDate']);
      const badge = formatPlayDateBadge(playDateRaw);
      const playTimeRaw = rowText(g, ['playTimeText','dbGames_PlayTime']);
      const playTime = formatTimeAmPm(playTimeRaw);
      const courseName = rowText(g, ['courseName','dbGames_CourseName']);
      const facilityName = rowText(g, ['facilityName','dbGames_FacilityName']);
      const adminName = rowText(g, ['adminName','dbGames_AdminName']);
      const playerCount = rowText(g, ['playerCount']);
      const hiStats = rowText(g, ['playerHIStats']);
      const yourTee = rowText(g, ['yourTeeTime']);
      const yourTeeName = rowText(g, ['yourTeeSetName']);
      const privacy = rowText(g, ['privacy','dbGames_Privacy']);
      const holes = rowText(g, ['holes','dbGames_Holes']);
      const { enrollmentStatus, registrationStatus } = inferStatuses(g);
      const isRegistered = enrollmentStatus === 'Registered';
      const adminMeta = getGameAdminMeta(g);
      const courseConfirmed = adminMeta.courseConfirmed;
      const provisionalHtml = !courseConfirmed
        ? `<div class="maGameCard__provisional">⚠ Course is not yet confirmed</div>`
        : ``;

      const teeCnt = Number(g.dbGames_TeeTimeCnt ?? g.teeTimeCnt ?? 0);
      const totalSlots = teeCnt > 0 ? teeCnt * 4 : 0;
      const countStr = totalSlots > 0 ? `${playerCount}/${totalSlots}` : `${playerCount}`;
      
      const rangePart = (Number(playerCount) > 0 && hiStats) ? (isRegistered ? `Range: ${hiStats}` : `HI: ${hiStats}`) : '';
      const line2 = [playTime, holes, countStr, rangePart].filter(Boolean).join(" • ");

      let line3Html = '';
      if (isRegistered) {
        const personalParts = [];
        if (yourTee) personalParts.push(`TeeTime: ${yourTee}`);
        if (yourTeeName) personalParts.push(`Tee: ${yourTeeName}`);

        const personalInfo = personalParts.join(" • ");
        line3Html = `<span class="maPill maPill--success"><span class="maPillValue">Registered</span></span>`;
        if (personalInfo) line3Html += `<span class="maGameCard__facts" style="margin-left:8px;">${esc(personalInfo)}</span>`;
      } else {
        const discoveryParts = [];
        if (privacy) discoveryParts.push(privacy);

        const discoveryInfo = discoveryParts.join(" • ");
        const regClass = registrationStatus === 'Open' ? 'maPill--success' : 'maPill--warn';
        line3Html = `<span class="maPill ${regClass}"><span class="maPillValue">${esc(registrationStatus)}</span></span>`;
        if (discoveryInfo) line3Html += `<span class="maGameCard__facts" style="margin-left:8px;">${esc(discoveryInfo)}</span>`;
      }

      card.innerHTML = `
        <header class="maCard__hdr">
          <div class="maCard__title">
            <span class="maCard__titleText">${esc(title)}</span>
            <span class="maCard__titleGgid">#${esc(ggid)}</span>
          </div>
          <div class="maCard__actions">
            <div class="maGameCard__hdrAdmin" title="${esc(adminName)}">${esc(adminName)}</div>
          </div>
        </header>
        <div class="maCard__body maGameCard__body">
          <div class="maGameCard__top">
            <div class="maDateBadge" aria-hidden="true">
              <div class="maDateBadge__top">${esc(badge.top)}</div>
              <div class="maDateBadge__mid">${esc(badge.day)}</div>
              <div class="maDateBadge__bot">${esc(badge.bot)}</div>
            </div>
            <div class="maGameCard__meta">
              <div class="maGameCard__line1">
                <div class="maGameCard__courseWrap" title="${esc([courseName, facilityName].filter(Boolean).join(" • "))}">
                  <span class="maGameCard__courseName">${esc(courseName)}</span>
                  ${facilityName ? `<span class="maGameCard__facilityName"> • ${esc(facilityName)}</span>` : ``}
                </div>
                <button type="button" class="maCard__actionBtn maGameCard__manageBtn" data-role="menu" aria-label="Manage">MANAGE</button>
              </div>
              ${provisionalHtml} 
              <div class="maGameCard__line2">
                <div class="maGameCard__facts" title="${esc(line2)}">${esc(line2)}</div>
              </div>
              <div class="maGameCard__line3">
                ${line3Html}
              </div>
            </div>
          </div>
        </div>`;

      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          e.stopPropagation();
          onGameAction(g, btn.dataset.action);
          return;
        }
        const menuBtn = e.target.closest('[data-role="menu"]');
        if (menuBtn) {
          e.stopPropagation();
          openGameActionsMenu(g);
          return;
        }
        openGameActionsMenu(g);
      });

      el.cards.appendChild(card);
    });
  }

  function openGameActionsMenu(game) {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    
    const items = (actionItemsForGame(game) || []).map(it => {
      if (it.separator) return { separator: true };
      if (it.category != null) return { category: it.category, description: it.description };
      return {
        label: it.label,
        action: () => onGameAction(game, it.action),
        disabled: it.enabled === false,
        danger: it.danger === true,
        indent: it.indent === true
      };
    });
    
    const title = rowText(game, ['title','dbGames_Title']) || 'Game Actions';
    const playDateRaw = rowText(game, ['playDate','dbGames_PlayDate']);
    const badge = formatPlayDateBadge(playDateRaw);
    const subtitle = [badge.bot, badge.day, badge.top, rowText(game, ['playTimeText','dbGames_PlayTime'])].filter(Boolean).join(' ');
    MA.ui.openActionsMenu(title, items, subtitle);
  }

  function openActionsMenu(openFiltersFn) {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    const items = [
      { label: "My Upcoming Games", action: () => applyQuickPreset("MYSCHEDULE") },
      { label: "My Past Games Played", action: () => applyQuickPreset("HISTORY") },
      { separator: true },
      { separator: true },
      { label: "Games from Admins I Follow", action: () => applyQuickPreset("FAVORITES") },
      { label: "All Available Games", action: () => applyQuickPreset("OPEN") },
      { separator: true },
      { separator: true },
      { label: "Advanced List Filters…", action: () => { if (typeof openFiltersFn === "function") openFiltersFn(); } },
      { separator: true },
      { separator: true },
      { label: "User Settings", action: "usersettings" }
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  // Placeholder for the modal opener function, wired below
  function openFiltersModal() {
    // wired in wireFiltersModal
  }

  function syncFilterUIFromState(){
    if (el.dateFrom) el.dateFrom.value = state.uiFilters.dateFrom || '';
    if (el.dateTo) el.dateTo.value = state.uiFilters.dateTo || '';
    renderAdminRows();
  }

  function renderAdminRows(){
    if (!el.adminRows) return;
    const search = String(el.adminSearch?.value || '').trim().toLowerCase();
    const selected = new Set(state.uiFilters.selectedAdminKeys || []);
    const admins = (state.admins || []).filter(a => {
      const name = String(a.name || '').toLowerCase();
      return !search || name.includes(search);
    });
    el.adminRows.innerHTML = '';
    admins.forEach(a => {
      const row = document.createElement('div');
      row.className = 'maAdminRow';
      row.dataset.key = String(a.key || a.adminKey || '');
      const key = row.dataset.key;
      const checked = selected.has(key);
      row.innerHTML = `
        <div class="maAdminRow__left">
          <div class="maAdminRow__check ${checked ? 'on' : ''}">${checked ? '✓' : ''}</div>
          <div class="maAdminRow__name">${esc(a.name || a.adminName || key)}</div>
        </div>
        <div class="maAdminRow__right">
          <div class="maAdminRow__heart ${a.isFavorite ? 'on':''}" data-heart="1" aria-label="Toggle favorite">${a.isFavorite ? '♥' : '♡'}</div>
        </div>`;
      row.addEventListener('click', async (e) => {
        const favBtn = e.target.closest('[data-heart="1"]');
        if (favBtn) {
          e.stopPropagation();
          await toggleFavoriteAdmin(a);
          return;
        }
        toggleAdminSelection(key);
      });
      el.adminRows.appendChild(row);
    });
  }

  function toggleAdminSelection(key){
    const set = new Set(state.uiFilters.selectedAdminKeys || []);
    if (set.has(key)) set.delete(key); else set.add(key);
    state.uiFilters.selectedAdminKeys = [...set];
    renderAdminRows();
  }

  async function toggleFavoriteAdmin(admin){
    const adminKey = String(admin.key || admin.adminKey || '');
    if (!adminKey) return;
    try {
      setStatus('Updating favorites…','info');
      const res = await postJson(`${apiAdminBase}/toggleFavoriteAdmin.php`, { adminKey, adminName: admin.name || '' });
      if (!res || res.ok === false) throw new Error(res?.message || res?.error || 'Favorite update failed');
      const target = state.admins.find(a => String(a.key||a.adminKey||'') === adminKey);
      if (target) target.isFavorite = !target.isFavorite;
      renderAdminRows();
      setStatus('Favorites updated.','success');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Favorite update failed.','error');
    }
  }

  function applyQuickPreset(presetKey){
    const key = String(presetKey || "").toUpperCase();
    const today = new Date();
    
    // Default ranges
    const plus30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const plus365 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 365);
    const minus30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    const minus60 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 60);

    const todayYmd = toYmdLocal(today);
    const plus30Ymd = toYmdLocal(plus30);
    const plus365Ymd = toYmdLocal(plus365);
    const minus30Ymd = toYmdLocal(minus30);
    const minus60Ymd = toYmdLocal(minus60);

    let dFrom = todayYmd, dTo = plus30Ymd;

    // My Schedule: Look far ahead (1 year) to catch all commitments
    if (key === "MYSCHEDULE") { dFrom = todayYmd; dTo = plus365Ymd; }
    else if (key === "FAVORITES") { dFrom = todayYmd; dTo = plus30Ymd; }
    else if (key === "OPEN") { dFrom = todayYmd; dTo = plus30Ymd; }
    else if (key === "HISTORY") { dFrom = minus60Ymd; dTo = todayYmd; }
    
    state.filters.dateFrom = dFrom;
    state.filters.dateTo = dTo;
    state.filters.quickPreset = key;
    state.filters.selectedAdminKeys = []; // Clear specific admin selections for presets
    reloadGames();
  }

  async function reloadGames(){
    try {
      state.busy = true;
      setStatus('Loading games…','info');
      const res = await postJson(`${apiBase}/initPlayerGames.php`, {
        filters: state.filters,
        directLinkGGID: state.directLinkGGID
      });
      if (!res || res.ok === false) throw new Error(res?.message || res?.error || 'Load failed');
      const p = res.payload || {};
      state.header = p.header || state.header;
      state.admins = Array.isArray(p.admins) ? p.admins : state.admins;
      state.games = Array.isArray(p.games?.vm) ? p.games.vm : (Array.isArray(p.games) ? p.games : []);
      state.rawGames = Array.isArray(p.games?.raw) ? p.games.raw : [];
      if (typeof p.directLinkGGID !== 'undefined') {
        state.directLinkGGID = String(p.directLinkGGID || '');
      }
      if (typeof p.directLinkMode !== 'undefined') {
        state.directLinkMode = !!p.directLinkMode;
      }
      
      if (p.filters) {
        state.filters = normalizeFilters(p.filters);
        state.uiFilters = cloneFilters(state.filters);
      }
      applyChrome(); // Update header with new filter context
      renderCards();
      refreshSidebar(); // Re-populate sidebar lists from updated game set
      setStatus(`Ready • ${state.games.length} games`, 'success');
    } catch (err) {
      console.error(err);
      state.games = [];
      renderCards();
      setStatus(err.message || 'Unable to load games.', 'error');
    } finally {
      state.busy = false;
    }
  }

  function getCurrentTeeSetIdForGame(ggid){
    const id = String(ggid || "").trim();
    if (!id) return "";
    const game = (state.games || []).find(g => String(g.ggid || "").trim() === id);
    return String(
      game?.yourTeeSetId ??
      game?.playerTeeSetId ??
      game?.dbPlayers_TeeSetID ??
      ""
    ).trim();
  }

  async function onGameAction(g, action){
    const ggid = String(g.ggid || g.dbGames_GGID || '');
    if (!ggid) return;
    // Set game session and route for all game relevant actions
    await apiAdmin("setGameSession.php", { ggid });

    if (action === 'scorehome') {
      const scoreId = rowText(g, ['yourPlayerKey', 'scoreId', 'playerKey', 'dbPlayers_PlayerKey']);
      return routerGo("scorehome", { scoreId: scoreId });
    }
    if (action === 'viewGame') {
      return routerGo("summary", {});
    }
    if (action === 'scorecard') {
      return routerGo("scorecard", {});
    }
    if (action === 'scoresummary') {
      return routerGo("scoresummary", {});
    }
    if (action === 'ghinPost') {
      return MA.ghinPostScores.open({ 
        ggid: ggid, 
        onPosted: () => reloadGames() 
      });
    }
    if (action === 'viewRoster') {
      return routerGo("roster", {});
    }
    if (action === 'register') {
      if (MA.TeeSetSelection) {
          const u = init.user;
          const player = {
            ghin: u.ghin,
            first_name: u.first_name,
            last_name: u.last_name,
            gender: u.gender,
          };

          if (!player.ghin) {
            setStatus("Missing user GHIN; please re-login.", "error");
            return;
          }

        MA.TeeSetSelection.open({
          gameId: ggid,
          player,
          currentTeeSetId: getCurrentTeeSetIdForGame(ggid),
          courseConfirmed: !!(getGameAdminMeta(g).courseConfirmed),
          onSave: async (selectedTee) => {
            setStatus("Registering...", "info");
            try {
              const apiPath = (MA.paths && MA.paths.upsertGamePlayers) ? MA.paths.upsertGamePlayers : "";
              if (!apiPath) {
                setStatus("Missing route: MA.paths.upsertGamePlayers", "error");
                return;
              }

              const res = await MA.postJson(apiPath, { player, selectedTee });
              if (res && res.ok) {
                setStatus("Registered successfully.", "success");
                await reloadGames();
              } else {
                throw new Error(res?.message || "Registration failed.");
              }
            } catch (e) {
              setStatus(e.message, "error");
            }
          }
        });
      } else {
        return routerGo("roster", {});
      }
      return;
    }
    if (action === "unregister") {
      const playerGHIN = String(init.user?.ghin || "").trim();
      if (!playerGHIN) {
        setStatus("Missing user GHIN; please re-login.", "error");
        return;
      }

      const ok = window.confirm("Unregister from this game?");
      if (!ok) return;

      setStatus("Unregistering...", "info");

      try {
        const apiPath = (MA.paths && MA.paths.deleteGamePlayers) ? MA.paths.deleteGamePlayers : "";
        if (!apiPath) {
          setStatus("Missing route: MA.paths.deleteGamePlayers", "error");
          return;
        }

        const res = await MA.postJson(apiPath, { playerGHIN });
        if (res && res.ok) {
          setStatus("Unregistered.", "success");
          await reloadGames();
        } else {
          throw new Error(res?.message || "Unable to unregister.");
        }
      } catch (e) {
        console.error(e);
        setStatus(e.message || "Unable to unregister.", "error");
      }

      return;
    }

    if (action === 'toggleFavoriteAdmin') {
      const adminMeta = getGameAdminMeta(g);
      if (!adminMeta.adminKey) {
        setStatus('Admin favorite unavailable for this game.','error');
        return;
      }
      await toggleFavoriteAdmin(adminMeta);
      await reloadGames();
      return;
    }

    if (action === 'calendar') {
      downloadIcsForGame(g);
      return;
    }

    if (action === 'rosterView') {
      if (MA.rosterView && typeof MA.rosterView.open === "function") {
        const raw = (state.rawGames || []).find(r =>
          String(r.dbGames_GGID || r.ggid || "").trim() === String(ggid).trim()
        ) || null;
        MA.rosterView.open({
          ggid:    ggid,
          title:   rowText(g, ['title', 'dbGames_Title']) || 'Game Roster',
          subtitle: rowText(g, ['playDate', 'dbGames_PlayDate']),
          apiPath: (MA.paths && MA.paths.apiRosterView) || "",
          game:    raw || {},
        });
      } else {
        setStatus('Roster view module not loaded.', 'error');
      }
      return;
    }
  }

  function downloadIcsForGame(g) {
    if (MA.calendar && MA.calendar.addCalendarEventFromGame) {
        MA.calendar.addCalendarEventFromGame(g);
      } else {
        setStatus("Calendar module not loaded.", "error");
      }
    }

  async function postJson(url, payload){
    if (typeof MA.postJson === 'function') return MA.postJson(url, { payload });
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ payload })
    });
    return res.json();
  }

  // ---- Filters Modal Wiring (Ported from Admin) — UNCHANGED ----
  function wireFiltersModal() {
    const modalOverlay = document.getElementById('overlay');
    const btnCloseX = document.getElementById('btnCloseModal');
    const btnCancel = document.getElementById('btnCancelFilters');
    const btnApply = document.getElementById('btnApplyFilters');
    const segDate = document.getElementById('segDate');
    const segAdmin = document.getElementById('segAdmin');
    const panelDate = document.getElementById('panelDate');
    const panelAdmin = document.getElementById('panelAdmin');

    if (!modalOverlay) return;

    function setPanel(which) {
      const isDate = which === 'date';
      if (segDate) segDate.classList.toggle('is-active', isDate);
      if (segAdmin) segAdmin.classList.toggle('is-active', !isDate);
      if (panelDate) panelDate.classList.toggle('is-active', isDate);
      if (panelAdmin) panelAdmin.classList.toggle('is-active', !isDate);
    }

    const dateFromEl = document.getElementById('dateFrom');
    const dateToEl   = document.getElementById('dateTo');
    const btnPickFrom = document.getElementById('btnPickFrom');
    const btnPickTo   = document.getElementById('btnPickTo');

    const calWrap = document.getElementById('calWrap');
    if (calWrap) {
      calWrap.style.display = 'none';
      calWrap.setAttribute('aria-hidden', 'true');
    }

    if (btnPickFrom) btnPickFrom.onclick = (e) => {
      e.preventDefault();
      if (dateFromEl) { dateFromEl.focus(); dateFromEl.click(); }
    };

    if (btnPickTo) btnPickTo.onclick = (e) => {
      e.preventDefault();
      if (dateToEl) { dateToEl.focus(); dateToEl.click(); }
    };

    let pendingFrom = '';
    let pendingTo = '';
    let pendingSelectedKeys = [];

    openFiltersModal = () => {
      pendingFrom = String(state.filters.dateFrom || '');
      pendingTo = String(state.filters.dateTo || '');
      pendingSelectedKeys = [...(state.uiFilters.selectedAdminKeys || [])];
      
      if (dateFromEl) dateFromEl.value = pendingFrom;
      if (dateToEl) dateToEl.value = pendingTo;
      state.uiFilters.selectedAdminKeys = [...pendingSelectedKeys];
      renderAdminRows();

      setPanel('date');
      modalOverlay.style.display = 'flex';
      modalOverlay.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('maOverlayOpen');
    };

    const closeModal = (revert = true) => {
      if (revert) {
        if (dateFromEl) dateFromEl.value = pendingFrom;
        if (dateToEl) dateToEl.value = pendingTo;
        state.uiFilters.selectedAdminKeys = [...pendingSelectedKeys];
      }
      modalOverlay.style.display = 'none';
      modalOverlay.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('maOverlayOpen');
    };

    if (btnCloseX) btnCloseX.onclick = () => closeModal(true);
    if (btnCancel) btnCancel.onclick = () => closeModal(true);
    
    if (btnApply) {
      btnApply.onclick = async () => {
        state.filters.dateFrom = String(dateFromEl?.value || '');
        state.filters.dateTo = String(dateToEl?.value || '');
        state.filters.selectedAdminKeys = [...state.uiFilters.selectedAdminKeys];
        
        closeModal(false);
        await reloadGames();
      };
    }

    if (segDate) segDate.onclick = () => setPanel('date');
    if (segAdmin) segAdmin.onclick = () => setPanel('admin');
  }

  // ---- Sidebar Wiring — NEW, desktop only -------------------------
  // Reads and writes the same state.filters / state.uiFilters as the modal.
  // No new API calls — courses are derived client-side from state.games.
  // "Show" (all vs mine) is a client-side filter applied before renderCards.

  // Sidebar local state — does not affect server-side filters
  const sbState = {
    showMine: false,              // Show: All games vs My registered
    datePreset: 'next30',         // prev30 | next30 | custom
    adminExpanded: false,
    courseExpanded: false,
    // checkedCourses: Set of courseName strings (client-side only)
    // Populated by buildSidebarCourses() after each reloadGames
    checkedCourses: new Set(),
    allCourses: [],               // [{name, count}] sorted by count desc
  };

  const SB_SHOW = 5; // rows visible before "Show more"

  function toYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // Derive course list from current state.games (client-side, no API)
  function buildSidebarCourses() {
    const counts = {};
    (state.games || []).forEach(g => {
      const name = String(g.courseName || g.dbGames_CourseName || '').trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    sbState.allCourses = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // On first build (or after reload) ensure all courses are checked
    // Re-add any new courses; keep existing checked state for known ones
    sbState.allCourses.forEach(c => {
      if (!sbState.checkedCourses.has(c.name)) {
        sbState.checkedCourses.add(c.name);
      }
    });
    // Remove stale courses no longer in results
    sbState.checkedCourses.forEach(name => {
      if (!sbState.allCourses.find(c => c.name === name)) {
        sbState.checkedCourses.delete(name);
      }
    });
  }

  function sbApplyDatePreset(preset) {
    const today = new Date();
    const fromEl = document.getElementById('sbDateFrom');
    const toEl   = document.getElementById('sbDateTo');
    if (!fromEl || !toEl) return;

    if (preset === 'prev30') {
      const f = new Date(today); f.setDate(f.getDate() - 30);
      fromEl.value = toYmd(f);
      toEl.value   = toYmd(today);
      fromEl.disabled = true;
      toEl.disabled   = true;
    } else if (preset === 'next30') {
      const t = new Date(today); t.setDate(t.getDate() + 30);
      fromEl.value = toYmd(today);
      toEl.value   = toYmd(t);
      fromEl.disabled = true;
      toEl.disabled   = true;
    } else if (preset === 'today') {
      fromEl.value = toYmd(today);
      toEl.value   = toYmd(today);
      fromEl.disabled = true;
      toEl.disabled   = true;
    } else {
      // custom — use current state.filters dates as starting point
      fromEl.value    = state.filters.dateFrom || toYmd(today);
      toEl.value      = state.filters.dateTo   || toYmd(today);
      fromEl.disabled = false;
      toEl.disabled   = false;
    }
  }

  function sbRenderAdminRows() {
    const container = document.getElementById('sbAdminRows');
    const moreEl    = document.getElementById('sbAdminMore');
    const toggleEl  = document.getElementById('sbAdminToggle');
    if (!container) return;

    const admins  = state.admins || [];
    const selKeys = new Set(state.uiFilters.selectedAdminKeys || []);
    const allOn   = admins.length > 0 && admins.every(a => selKeys.has(String(a.key || a.adminKey || '')));

    if (toggleEl) toggleEl.textContent = allOn ? 'Clear all' : 'Select all';

    container.innerHTML = '';
    admins.forEach((a, i) => {
      const key     = String(a.key || a.adminKey || '');
      const on      = selKeys.has(key);
      const hidden  = !sbState.adminExpanded && i >= SB_SHOW;
      // Count games for this admin in current results
      const count   = (state.games || []).filter(g =>
        String(g.adminName || g.dbGames_AdminName || '') === String(a.name || '')
      ).length;

      const row = document.createElement('div');
      row.className = 'phSidebar__row' + (on ? ' is-active' : '');
      if (hidden) row.style.display = 'none';
      row.innerHTML =
        `<div class="phSidebar__check${on ? ' is-active' : ''}">${on ? '✓' : ''}</div>` +
        (a.isFavorite ? `<span class="phSidebar__rowFav" aria-label="Favorite">♥</span>` : '') +
        `<span class="phSidebar__rowName">${esc(a.name || key)}</span>` +
        `<span class="phSidebar__rowCount">${count}</span>`;

      row.addEventListener('click', () => {
        const set = new Set(state.uiFilters.selectedAdminKeys || []);
        if (set.has(key)) {
          set.delete(key);
          // Empty = select all (per agreed UX rule)
          if (set.size === 0) admins.forEach(x => set.add(String(x.key || x.adminKey || '')));
        } else {
          set.add(key);
        }
        state.uiFilters.selectedAdminKeys = [...set];
        sbRenderAdminRows();
      });

      container.appendChild(row);
    });

    const rem = admins.length - SB_SHOW;
    if (!sbState.adminExpanded && rem > 0) {
      moreEl.textContent = `Show ${rem} more admin${rem > 1 ? 's' : ''}`;
      moreEl.style.display = 'inline-block';
    } else {
      if (moreEl) moreEl.style.display = 'none';
    }
  }

  function sbRenderCourseRows() {
    const container = document.getElementById('sbCourseRows');
    const moreEl    = document.getElementById('sbCourseMore');
    if (!container) return;

    container.innerHTML = '';
    sbState.allCourses.forEach((c, i) => {
      const on     = sbState.checkedCourses.has(c.name);
      const hidden = !sbState.courseExpanded && i >= SB_SHOW;

      const row = document.createElement('div');
      row.className = 'phSidebar__row' + (on ? ' is-active' : '');
      if (hidden) row.style.display = 'none';
      row.innerHTML =
        `<div class="phSidebar__check${on ? ' is-active' : ''}">${on ? '✓' : ''}</div>` +
        `<span class="phSidebar__rowName">${esc(c.name)}</span>` +
        `<span class="phSidebar__rowCount">${c.count}</span>`;

      row.addEventListener('click', () => {
        if (sbState.checkedCourses.has(c.name)) {
          sbState.checkedCourses.delete(c.name);
          // Empty = select all
          if (sbState.checkedCourses.size === 0) {
            sbState.allCourses.forEach(x => sbState.checkedCourses.add(x.name));
          }
        } else {
          sbState.checkedCourses.add(c.name);
        }
        sbRenderCourseRows();
      });

      container.appendChild(row);
    });

    const rem = sbState.allCourses.length - SB_SHOW;
    if (!sbState.courseExpanded && rem > 0) {
      moreEl.textContent = `Show ${rem} more course${rem > 1 ? 's' : ''}`;
      moreEl.style.display = 'inline-block';
    } else {
      if (moreEl) moreEl.style.display = 'none';
    }
  }

  // Sync the sidebar Date radio and inputs to whatever state.filters now holds.
  // Called after every reloadGames() so external changes (Actions menu presets,
  // direct-link mode, session restore) are always reflected in the sidebar.
  function syncSidebarDateFromState() {
    const fromEl = document.getElementById('sbDateFrom');
    const toEl   = document.getElementById('sbDateTo');
    const dateGroup = document.getElementById('sbDateGroup');
    if (!fromEl || !toEl || !dateGroup) return;

    const df = state.filters.dateFrom || '';
    const dt = state.filters.dateTo   || '';

    // Compute what each preset would look like right now
    const today = new Date();
    const todayYmd   = toYmd(today);
    const prev30From = toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
    const prev30To   = todayYmd;
    const next30From = todayYmd;
    const next30To   = toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));

    let matchedPreset = 'custom';
    if (df === prev30From && dt === prev30To)     matchedPreset = 'prev30';
    else if (df === next30From && dt === next30To) matchedPreset = 'next30';
    else if (df === todayYmd  && dt === todayYmd)  matchedPreset = 'today';

    // Update radio selection
    dateGroup.querySelectorAll('[data-d]').forEach(row => {
      const match = row.dataset.d === matchedPreset;
      row.classList.toggle('is-active', match);
      row.querySelector('.phSidebar__radioDot')?.classList.toggle('is-active', match);
    });

    // Update input values and enabled state
    fromEl.value    = df;
    toEl.value      = dt;
    fromEl.disabled = (matchedPreset !== 'custom');
    toEl.disabled   = (matchedPreset !== 'custom');

    // Keep sbState in sync so the Apply button uses the right preset next time
    sbState.datePreset = matchedPreset;
  }

  // Re-populate sidebar lists — called after every reloadGames()
  function refreshSidebar() {
    syncSidebarDateFromState(); // Always reflect actual state.filters dates
    buildSidebarCourses();
    sbRenderAdminRows();
    sbRenderCourseRows();
  }

  // Client-side Show filter applied on top of state.games
  // Called by sbApply — filters el.cards after renderCards has run
  function sbApplyShowFilter() {
    if (!sbState.showMine) return; // All games — nothing to hide
    const cards = el.cards ? el.cards.querySelectorAll('.maCard') : [];
    cards.forEach(card => {
      const ggid = card.dataset.ggid || '';
      const g = (state.games || []).find(x => String(x.ggid || x.dbGames_GGID || '') === ggid);
      if (!g) { card.style.display = 'none'; return; }
      const { enrollmentStatus } = inferStatuses(g);
      const adminMeta = getGameAdminMeta(g);
      const keep = enrollmentStatus === 'Registered' || !!adminMeta.adminKey;
      card.style.display = keep ? '' : 'none';
    });
  }

  // Client-side course filter applied on top of rendered cards
  function sbApplyCourseFilter() {
    const allChecked = sbState.allCourses.every(c => sbState.checkedCourses.has(c.name));
    if (allChecked) return; // All selected — nothing to hide
    const cards = el.cards ? el.cards.querySelectorAll('.maCard') : [];
    cards.forEach(card => {
      const ggid = card.dataset.ggid || '';
      const g = (state.games || []).find(x => String(x.ggid || x.dbGames_GGID || '') === ggid);
      if (!g) return;
      const course = String(g.courseName || g.dbGames_CourseName || '').trim();
      if (!sbState.checkedCourses.has(course)) card.style.display = 'none';
    });
  }

  function wireSidebar() {
    const sidebar = document.getElementById('phSidebar');
    if (!sidebar) return; // Not in DOM — mobile or older template

    // ---- SHOW radios ----
    const showGroup = document.getElementById('sbShowGroup');
    if (showGroup) {
      showGroup.addEventListener('click', e => {
        const row = e.target.closest('[data-v]');
        if (!row) return;
        showGroup.querySelectorAll('[data-v]').forEach(r => {
          r.classList.toggle('is-active', r === row);
          r.querySelector('.phSidebar__radioDot')?.classList.toggle('is-active', r === row);
        });
        sbState.showMine = (row.dataset.v === 'mine');
      });
    }

    // ---- DATE radios ----
    const dateGroup = document.getElementById('sbDateGroup');
    if (dateGroup) {
      // Set initial display from launch default (next30)
      sbApplyDatePreset('next30');

      dateGroup.addEventListener('click', e => {
        const row = e.target.closest('[data-d]');
        if (!row) return;
        dateGroup.querySelectorAll('[data-d]').forEach(r => {
          r.classList.toggle('is-active', r === row);
          r.querySelector('.phSidebar__radioDot')?.classList.toggle('is-active', r === row);
        });
        sbState.datePreset = row.dataset.d;
        sbApplyDatePreset(sbState.datePreset);
      });
    }

    // ---- ADMINS: Select all / Clear all toggle ----
    const adminToggle = document.getElementById('sbAdminToggle');
    if (adminToggle) {
      adminToggle.addEventListener('click', () => {
        const admins  = state.admins || [];
        const selKeys = new Set(state.uiFilters.selectedAdminKeys || []);
        const allOn   = admins.length > 0 && admins.every(a => selKeys.has(String(a.key || a.adminKey || '')));
        if (allOn) {
          // Clear — but empty means all, so immediately re-select all
          state.uiFilters.selectedAdminKeys = [];
        } else {
          state.uiFilters.selectedAdminKeys = admins.map(a => String(a.key || a.adminKey || '')).filter(Boolean);
        }
        sbRenderAdminRows();
      });
    }

    // ---- ADMINS: Favorites ----
    const adminFavs = document.getElementById('sbAdminFavs');
    if (adminFavs) {
      adminFavs.addEventListener('click', () => {
        const favKeys = (state.admins || [])
          .filter(a => a.isFavorite)
          .map(a => String(a.key || a.adminKey || ''))
          .filter(Boolean);
        state.uiFilters.selectedAdminKeys = favKeys.length ? favKeys : [];
        // If no favorites exist, fall back to all
        if (!state.uiFilters.selectedAdminKeys.length) {
          state.uiFilters.selectedAdminKeys = (state.admins || []).map(a => String(a.key || a.adminKey || '')).filter(Boolean);
        }
        sbRenderAdminRows();
      });
    }

    // ---- ADMINS: Show more ----
    const adminMore = document.getElementById('sbAdminMore');
    if (adminMore) {
      adminMore.addEventListener('click', () => {
        sbState.adminExpanded = true;
        sbRenderAdminRows();
      });
    }

    // ---- COURSES: Select all ----
    const courseSelectAll = document.getElementById('sbCourseSelectAll');
    if (courseSelectAll) {
      courseSelectAll.addEventListener('click', () => {
        sbState.allCourses.forEach(c => sbState.checkedCourses.add(c.name));
        sbRenderCourseRows();
      });
    }

    // ---- COURSES: Clear all (empty = all per UX rule) ----
    const courseClearAll = document.getElementById('sbCourseClearAll');
    if (courseClearAll) {
      courseClearAll.addEventListener('click', () => {
        // Clear all = select all per agreed rule: empty means no filter
        sbState.allCourses.forEach(c => sbState.checkedCourses.add(c.name));
        sbRenderCourseRows();
      });
    }

    // ---- COURSES: Show more ----
    const courseMore = document.getElementById('sbCourseMore');
    if (courseMore) {
      courseMore.addEventListener('click', () => {
        sbState.courseExpanded = true;
        sbRenderCourseRows();
      });
    }

    // ---- APPLY button ----
    // Admin selection → writes to state.filters.selectedAdminKeys (server-side filter)
    // Date preset     → writes to state.filters.dateFrom / dateTo (server-side filter)
    // Show (mine)     → client-side card visibility only, no API call
    // Courses         → client-side card visibility only, no API call
    const applyBtn = document.getElementById('sbApplyBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying…';

        // Commit date values from sidebar inputs to state.filters
        const fromEl = document.getElementById('sbDateFrom');
        const toEl   = document.getElementById('sbDateTo');
        if (fromEl && toEl) {
          state.filters.dateFrom = fromEl.value || state.filters.dateFrom;
          state.filters.dateTo   = toEl.value   || state.filters.dateTo;
        }

        // Commit admin selection from uiFilters to filters
        state.filters.selectedAdminKeys = [...(state.uiFilters.selectedAdminKeys || [])];

        // Clear quickPreset when user is using sidebar (custom filter state)
        state.filters.quickPreset = '';

        try {
          // Reload from server with new date + admin filters
          await reloadGames();

          // After reload, apply client-side filters (Show + Courses)
          sbApplyShowFilter();
          sbApplyCourseFilter();
        } finally {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Apply filters';
        }
      });
    }

    // Initial population
    buildSidebarCourses();
    sbRenderAdminRows();
    sbRenderCourseRows();

    // Set launch defaults:
    // - Show: All games (already default in sbState)
    // - Date: Next 30d (already applied above)
    // - Admins: favorites pre-selected
    const favKeys = (state.admins || [])
      .filter(a => a.isFavorite)
      .map(a => String(a.key || a.adminKey || ''))
      .filter(Boolean);
    if (favKeys.length) {
      state.uiFilters.selectedAdminKeys = favKeys;
      sbRenderAdminRows();
    }
  }

  function wireEvents(){
    // Wire the modal logic (mobile path — unchanged)
    wireFiltersModal();

    el.adminSearch?.addEventListener('input', renderAdminRows);
    
    el.btnAdminToggleAll?.addEventListener('click', () => {
      const allKeys = (state.admins || []).map(a => String(a.key||a.adminKey||'')).filter(Boolean);
      const allSelected = allKeys.length && allKeys.every(k => state.uiFilters.selectedAdminKeys.includes(k));
      state.uiFilters.selectedAdminKeys = allSelected ? [] : allKeys;
      renderAdminRows();
    });
    
    el.btnAdminToggleFavs?.addEventListener('click', () => {
      const favKeys = (state.admins || []).filter(a => a.isFavorite).map(a => String(a.key||a.adminKey||'')).filter(Boolean);
      const allFavsSelected = favKeys.length && favKeys.every(k => state.uiFilters.selectedAdminKeys.includes(k));
      if (allFavsSelected) {
        const set = new Set(state.uiFilters.selectedAdminKeys);
        favKeys.forEach(k => set.delete(k));
        state.uiFilters.selectedAdminKeys = [...set];
      } else {
        state.uiFilters.selectedAdminKeys = [...new Set([...(state.uiFilters.selectedAdminKeys||[]), ...favKeys])];
      }
      renderAdminRows();
    });

    document.getElementById('btnHome')?.addEventListener('click', () => routerGo ? routerGo('home') : window.location.assign('/'));
  }

  function initialize(){
    applyChrome();
    renderCards();
    wireEvents();
    wireSidebar();   // NEW — desktop sidebar wiring (no-op if sidebar not in DOM)
    setStatus(`Ready • ${state.games.length} games`, 'success');
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();