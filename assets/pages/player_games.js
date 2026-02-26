/* /assets/pages/player_games.js
   Player Portal Games List (GoDaddy refactor scaffold)
   - Follows admin_games_list.js page pattern
   - Preserves many Wix HTML IDs in the PHP view
   - First pass: init + filters + card render + action menu hooks
*/
(function(){
  'use strict';

  const MA = window.MA || {};
  const apiAdmin = MA.apiAdminGames;
  const init = window.__MA_INIT__ || window.__INIT__ || {};
  const routes = MA.routes || {};
  const chrome = MA.chrome || {};

  const apiBase = routes.apiPlayerGames || '/api/player_games';
  const routerGo = typeof MA.routerGo === 'function' ? MA.routerGo : null;

  const el = {
    cards: document.getElementById('cards'),
    emptyState: document.getElementById('emptyState'),
    overlay: document.getElementById('overlay'),
    status: document.getElementById('status'),

    // Filter modal
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
    busy: false,
  };
  state.uiFilters = cloneFilters(state.filters);

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

  function setStatus(msg, level){
    if (typeof MA.setStatus === 'function') return MA.setStatus(msg || '', level || '');
    if (el.status) el.status.textContent = msg || '';
    if (msg) console.log('[PLAYER_GAMES]', level || 'info', msg);
  }

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function applyChrome(){
    if (chrome && typeof chrome.setHeaderLines === 'function') {
      chrome.setHeaderLines(['PLAYER PORTAL', 'Games List', ""]);
    }
    if (chrome && typeof chrome.setActions === 'function') {
      chrome.setActions({
        left: { show: true, label: 'Home', onClick: () => routerGo ? routerGo('home') : (window.location.assign('/')) },
        right: { show: true, label: 'Actions', onClick: () => openActionsMenu(openFiltersModal) }
      });
    }
    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['home','player','scorekeeping'],
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

  function actionItemsForGame(g){
    const { enrollmentStatus, registrationStatus } = inferStatuses(g);
    const isRegistered = enrollmentStatus === 'Registered';
    const regClosedish = ['Closed','Locked','Full'].includes(registrationStatus);

    return [
      { label: 'Review Game', action: 'viewGame', enabled: true },
      { label: isRegistered ? 'Unregister' : 'Register / Enroll', action: isRegistered ? 'unregister' : 'enroll', enabled: isRegistered || !regClosedish },
      { separator: true },
      { label: 'Add to Calendar', action: 'calendar', enabled: true },
      { label: 'Scorecard', action: 'scorecard', enabled: true },
    ];
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
      const playTime = rowText(g, ['playTimeText','dbGames_PlayTime']);
      const courseName = rowText(g, ['courseName','dbGames_CourseName']);
      const facilityName = rowText(g, ['facilityName','dbGames_FacilityName']);
      const adminName = rowText(g, ['adminName','dbGames_AdminName']);
      const playerCount = rowText(g, ['playerCount']);
      const hiStats = rowText(g, ['playerHIStats']);
      const yourTee = rowText(g, ['yourTeeTime']);
      const privacy = rowText(g, ['privacy','dbGames_Privacy']);
      const { enrollmentStatus, registrationStatus } = inferStatuses(g);

      card.innerHTML = `
        <header class="maCard__hdr">
          <div class="maCard__titleWrap">
            <div class="maCard__title">${esc(title)}${ggid ? `<span class="maCard__titleGgid">#${esc(ggid)}</span>` : ''}</div>
          </div>
        </header>
        <div class="maCard__body maPlayerGameCard__body">
          <div class="maPlayerGameCard__top">
            <div class="maDateBadge" aria-hidden="true">
              <div class="maDateBadge__top">${esc(badge.top)}</div>
              <div class="maDateBadge__mid">${esc(badge.day)}</div>
              <div class="maDateBadge__bot">${esc(badge.bot)}</div>
            </div>
            <div class="maPlayerGameCard__meta">
              <div class="maPlayerGameCard__line1">
                <div class="maPlayerGameCard__courseWrap">${esc(courseName)}${facilityName ? ` <span class="maPlayerGameCard__facilityName">• ${esc(facilityName)}</span>` : ''}</div>
                <button type="button" class="maCard__actionBtn maGameCard__manageBtn" data-role="menu" aria-label="Manage">MANAGE</button>
                <div class="maPlayerGameCard__admin">${esc(adminName)}</div>
              </div>
              <div class="maPlayerGameCard__line2">
                <div class="maPlayerGameCard__facts">${esc([playTime, playerCount !== '' ? `Players: ${playerCount}` : '', privacy ? `Privacy: ${privacy}` : ''].filter(Boolean).join(' • '))}</div>
                <div class="maPlayerGameCard__statusPills">
                  <span class="maPill ${enrollmentStatus === 'Registered' ? 'maPill--success':''}">${esc(enrollmentStatus)}</span>
                  <span class="maPill ${registrationStatus === 'Open' ? 'maPill--success' : (registrationStatus === 'Locked' || registrationStatus === 'Full' ? 'maPill--warn':'')}">${esc(registrationStatus)}</span>
                </div>
              </div>
              <div class="maPlayerGameCard__line3">
                <div class="maPlayerGameCard__yourTee">${esc(yourTee ? `Your Tee Time: ${yourTee}` : (hiStats ? `HI: ${hiStats}` : ''))}</div>
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
      return {
        label: it.label,
        action: () => onGameAction(game, it.action),
        disabled: it.enabled === false
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
      { label: "My Schedule (Registered)", action: () => applyQuickPreset("MYSCHEDULE") },
      { label: "Favorites (High Interest)", action: () => applyQuickPreset("FAVORITES") },
      { label: "Open Games (All Available)", action: () => applyQuickPreset("OPEN") },
      { separator: true },
      { label: "History (Played)", action: () => applyQuickPreset("HISTORY") },
      { separator: true },
      { label: "Advanced Filters…", action: () => { if (typeof openFiltersFn === "function") openFiltersFn(); } }
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
      const res = await postJson(`${apiBase}/toggleFavoriteAdmin.php`, { adminKey, adminName: admin.name || '' });
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
      const res = await postJson(`${apiBase}/initPlayerGames.php`, { filters: state.filters });
      if (!res || res.ok === false) throw new Error(res?.message || res?.error || 'Load failed');
      const p = res.payload || {};
      state.header = p.header || state.header;
      state.admins = Array.isArray(p.admins) ? p.admins : state.admins;
      state.games = Array.isArray(p.games?.vm) ? p.games.vm : (Array.isArray(p.games) ? p.games : []);
      state.rawGames = Array.isArray(p.games?.raw) ? p.games.raw : [];
      if (p.filters) {
        state.filters = normalizeFilters(p.filters);
        state.uiFilters = cloneFilters(state.filters);
      }
      renderCards();
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

  async function onGameAction(g, action){
    const ggid = String(g.ggid || g.dbGames_GGID || '');
    if (!ggid) return;
    // Set game session and route for all game relevant actions
    await apiAdmin("setGameSession.php", { ggid });

    // First-pass routing/actions (non-destructive). Can be wired to final routes later.
    if (action === 'viewGame') {
      return routerGo("summary", {});
    }
    if (action === 'scorecard') {
      return routerGo("scorecard", {});
    }
    if (action === 'enroll' || action === 'register') {
      return routerGo("roster", {});
    }
    if (action === 'unregister') {
      alert('Unregister action not wired yet in this first-pass scaffold.');
      return;
    }
    if (action === 'calendar') {
      downloadIcsForGame(g);
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

  // ---- Filters Modal Wiring (Ported from Admin) ----
  function wireFiltersModal() {
    const modalOverlay = document.getElementById('overlay'); // Reusing existing ID
    const btnCloseX = document.getElementById('btnCloseModal');
    const btnCancel = document.getElementById('btnCancelFilters');
    const btnApply = document.getElementById('btnApplyFilters');
    const segDate = document.getElementById('segDate');
    const segAdmin = document.getElementById('segAdmin');
    const panelDate = document.getElementById('panelDate');
    const panelAdmin = document.getElementById('panelAdmin');

    if (!modalOverlay) return;

    // Segmented control
    function setPanel(which) {
      const isDate = which === 'date';
      if (segDate) segDate.classList.toggle('is-active', isDate);
      if (segAdmin) segAdmin.classList.toggle('is-active', !isDate);
      if (panelDate) panelDate.classList.toggle('is-active', isDate);
      if (panelAdmin) panelAdmin.classList.toggle('is-active', !isDate);
    }

    // Inline Calendar Logic
    const dateFromEl = document.getElementById('dateFrom');
    const dateToEl = document.getElementById('dateTo');
    const btnPickFrom = document.getElementById('btnPickFrom');
    const btnPickTo = document.getElementById('btnPickTo');
    const calWrap = document.getElementById('calWrap');
    const calGrid = document.getElementById('calGrid');
    const calMonthLabel = document.getElementById('calMonthLabel');
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const calToday = document.getElementById('calToday');

    let activeTarget = 'from';
    let viewMonth = null;

    function ensureCalendarOpen() { if (calWrap) { calWrap.classList.add('open'); calWrap.setAttribute('aria-hidden', 'false'); } }
    function closeCalendar() { if (calWrap) { calWrap.classList.remove('open'); calWrap.setAttribute('aria-hidden', 'true'); } }
    
    function setViewMonthFromInputs() {
      const fromD = parseYmd(dateFromEl?.value);
      const toD = parseYmd(dateToEl?.value);
      const basis = (activeTarget === 'from' ? fromD : toD) || fromD || toD || new Date();
      viewMonth = new Date(basis.getFullYear(), basis.getMonth(), 1);
    }

    function renderCalendar() {
      if (!calGrid || !viewMonth) return;
      calGrid.innerHTML = '';
      if (calMonthLabel) calMonthLabel.textContent = viewMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

      const fromD = parseYmd(dateFromEl?.value);
      const toD = parseYmd(dateToEl?.value);
      const start = new Date(viewMonth);
      start.setDate(1 - start.getDay()); // Start on Sunday

      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const iso = toYmdLocal(d);
        
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'maCalDay';
        cell.textContent = String(d.getDate());
        if (d.getMonth() !== viewMonth.getMonth()) cell.classList.add('muted');
        
        // Selection logic
        const t = d.getTime();
        const fT = fromD ? fromD.getTime() : null;
        const tT = toD ? toD.getTime() : null;
        
        if ((fT && t === fT) || (tT && t === tT)) cell.classList.add('selected');
        else if (fT && tT && t > Math.min(fT, tT) && t < Math.max(fT, tT)) cell.classList.add('inRange');

        cell.onclick = (e) => {
          e.preventDefault();
          if (activeTarget === 'from') {
            if (dateFromEl) dateFromEl.value = iso;
            if (toD && d > toD) if (dateToEl) dateToEl.value = ''; // Reset to if invalid
            activeTarget = 'to';
          } else {
            if (dateToEl) dateToEl.value = iso;
            const newFrom = parseYmd(dateFromEl?.value);
            if (newFrom && d < newFrom) {
              if (dateFromEl) dateFromEl.value = iso;
              if (dateToEl) dateToEl.value = toYmdLocal(newFrom);
            }
          }
          renderCalendar();
        };
        calGrid.appendChild(cell);
      }
    }

    // Calendar Controls
    if (calPrev) calPrev.onclick = (e) => { e.preventDefault(); viewMonth.setMonth(viewMonth.getMonth() - 1); renderCalendar(); };
    if (calNext) calNext.onclick = (e) => { e.preventDefault(); viewMonth.setMonth(viewMonth.getMonth() + 1); renderCalendar(); };
    if (calToday) calToday.onclick = (e) => { e.preventDefault(); viewMonth = new Date(); viewMonth.setDate(1); renderCalendar(); };

    if (btnPickFrom) btnPickFrom.onclick = (e) => { e.preventDefault(); activeTarget = 'from'; ensureCalendarOpen(); setViewMonthFromInputs(); renderCalendar(); };
    if (btnPickTo) btnPickTo.onclick = (e) => { e.preventDefault(); activeTarget = 'to'; ensureCalendarOpen(); setViewMonthFromInputs(); renderCalendar(); };
    
    if (dateFromEl) {
      dateFromEl.onfocus = () => { activeTarget = 'from'; ensureCalendarOpen(); };
      dateFromEl.onchange = () => { setViewMonthFromInputs(); renderCalendar(); };
    }
    if (dateToEl) {
      dateToEl.onfocus = () => { activeTarget = 'to'; ensureCalendarOpen(); };
      dateToEl.onchange = () => { setViewMonthFromInputs(); renderCalendar(); };
    }

    // Modal Open/Close
    let pendingFrom = '';
    let pendingTo = '';
    let pendingSelectedKeys = [];

    // Assign to outer scope so openActionsMenu can call it
    openFiltersModal = () => {
      // Snapshot
      pendingFrom = String(state.filters.dateFrom || '');
      pendingTo = String(state.filters.dateTo || '');
      pendingSelectedKeys = [...(state.uiFilters.selectedAdminKeys || [])];
      
      // Seed UI
      if (dateFromEl) dateFromEl.value = pendingFrom;
      if (dateToEl) dateToEl.value = pendingTo;
      state.uiFilters.selectedAdminKeys = [...pendingSelectedKeys]; // Sync UI state
      renderAdminRows();

      setPanel('date');
      modalOverlay.style.display = 'flex';
      modalOverlay.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('maOverlayOpen');
      closeCalendar();
    };

    const closeModal = (revert = true) => {
      if (revert) {
        if (dateFromEl) dateFromEl.value = pendingFrom;
        if (dateToEl) dateToEl.value = pendingTo;
        state.uiFilters.selectedAdminKeys = [...pendingSelectedKeys];
      }
      closeCalendar();
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
        // Admin keys are already in state.uiFilters.selectedAdminKeys from toggles
        state.filters.selectedAdminKeys = [...state.uiFilters.selectedAdminKeys];
        
        closeModal(false);
        await reloadGames();
      };
    }

    if (segDate) segDate.onclick = () => setPanel('date');
    if (segAdmin) segAdmin.onclick = () => setPanel('admin');
  }

  function wireEvents(){
    // Wire the modal logic
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

    // Wix-HTML quick filter IDs do not exist in the GoDaddy chrome; support if later added.
    document.getElementById('btnHome')?.addEventListener('click', () => routerGo ? routerGo('home') : window.location.assign('/'));
  }

  function initialize(){
    applyChrome();
    renderCards();
    wireEvents();
    setStatus(`Ready • ${state.games.length} games`, 'success');
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
