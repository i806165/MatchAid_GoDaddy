/* /assets/pages/player_games.js
   Player Portal Games List (GoDaddy refactor scaffold)
   - Follows admin_games_list.js page pattern
   - Preserves many Wix HTML IDs in the PHP view
   - First pass: init + filters + card render + action menu hooks
*/
(function(){
  'use strict';

  const MA = window.MA || {};
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
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function applyChrome(){
    if (chrome && typeof chrome.setHeaderLines === 'function') {
      chrome.setHeaderLines(['PLAYER PORTAL', 'Games', state.header?.subtitle || '']);
    }
    if (chrome && typeof chrome.setActions === 'function') {
      chrome.setActions({
        left: { show: true, label: 'Home', onClick: () => routerGo ? routerGo('home') : (window.location.assign('/')) },
        right: { show: true, label: 'Filters', onClick: openFilters }
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
    const d = dateText ? new Date(dateText + 'T00:00:00') : null;
    if (!d || Number.isNaN(d.getTime())) return { dow:'', day:'--', mon:'' };
    const dow = d.toLocaleDateString(undefined,{ weekday:'short' }).slice(0,2).toUpperCase();
    const day = String(d.getDate());
    const mon = d.toLocaleDateString(undefined,{ month:'short' }).toUpperCase();
    return { dow, day, mon };
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
    const games = Array.isArray(state.games) ? state.games : [];
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
          <button class="btn btnPrimary maPlayerGameCard__menuBtn" type="button" data-role="menu">Actions</button>
        </header>
        <div class="maCard__body maPlayerGameCard__body">
          <div class="maPlayerGameCard__top">
            <div class="maDateBadge" aria-hidden="true">
              <div class="maDateBadge__top">${esc(badge.dow)}</div>
              <div class="maDateBadge__mid">${esc(badge.day)}</div>
              <div class="maDateBadge__bot">${esc(badge.mon)}</div>
            </div>
            <div class="maPlayerGameCard__meta">
              <div class="maPlayerGameCard__line1">
                <div class="maPlayerGameCard__courseWrap">${esc(courseName)}${facilityName ? ` <span class="maPlayerGameCard__facilityName">• ${esc(facilityName)}</span>` : ''}</div>
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
                <div class="maPlayerGameCard__actions">
                  <button class="btn btnSecondary maPlayerGameCard__actionBtn" type="button" data-action="viewGame">Review</button>
                  <button class="btn btnPrimary maPlayerGameCard__actionBtn" type="button" data-action="${enrollmentStatus === 'Registered' ? 'unregister' : 'enroll'}">${enrollmentStatus === 'Registered' ? 'Unregister' : 'Register'}</button>
                </div>
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
        onGameAction(g, 'viewGame');
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
    MA.ui.openActionsMenu(title, items);
  }

  function openFilters(){
    state.uiFilters = cloneFilters(state.filters);
    syncFilterUIFromState();
    if (el.overlay) {
      el.overlay.style.display = 'flex';
      el.overlay.setAttribute('aria-hidden','false');
    }
  }
  function closeFilters(){
    if (el.overlay) {
      el.overlay.style.display = 'none';
      el.overlay.setAttribute('aria-hidden','true');
    }
  }

  function setFilterTab(tab){
    const isDate = tab === 'date';
    [el.segDate, el.segAdmin].forEach(x => x && x.classList.remove('is-active'));
    [el.panelDate, el.panelAdmin].forEach(x => x && x.classList.remove('is-active'));
    if (isDate) {
      el.segDate?.classList.add('is-active'); el.panelDate?.classList.add('is-active');
      el.segDate?.setAttribute('aria-selected','true'); el.segAdmin?.setAttribute('aria-selected','false');
    } else {
      el.segAdmin?.classList.add('is-active'); el.panelAdmin?.classList.add('is-active');
      el.segAdmin?.setAttribute('aria-selected','true'); el.segDate?.setAttribute('aria-selected','false');
    }
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
      row.className = 'maAdminPick__row';
      row.dataset.key = String(a.key || a.adminKey || '');
      const key = row.dataset.key;
      const checked = selected.has(key);
      row.innerHTML = `
        <button type="button" class="maAdminPick__check" aria-label="Toggle select">${checked ? '☑' : '☐'}</button>
        <div class="maAdminPick__name">${esc(a.name || a.adminName || key)}</div>
        <button type="button" class="maAdminPick__fav ${a.isFavorite ? 'is-on':''}" aria-label="Toggle favorite">♥</button>`;
      row.addEventListener('click', async (e) => {
        const favBtn = e.target.closest('.maAdminPick__fav');
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

  function applyQuickPreset(kind){
    const today = new Date();
    today.setHours(0,0,0,0);
    const from = new Date(today);
    const to = new Date(today);
    if (kind === 'MY_PAST') from.setDate(from.getDate()-30); else to.setDate(to.getDate()+30);
    if (kind === 'MY_PAST') { /* to=today */ } else { /* from=today */ }
    state.uiFilters.dateFrom = fmtDateInput(kind === 'MY_PAST' ? from : today);
    state.uiFilters.dateTo = fmtDateInput(kind === 'MY_PAST' ? today : to);
    state.uiFilters.quickPreset = kind;
    syncFilterUIFromState();
  }

  function fmtDateInput(d){
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async function onApplyFilters(){
    if (el.dateFrom) state.uiFilters.dateFrom = el.dateFrom.value || '';
    if (el.dateTo) state.uiFilters.dateTo = el.dateTo.value || '';
    state.filters = cloneFilters(state.uiFilters);
    closeFilters();
    await reloadGames();
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

    // First-pass routing/actions (non-destructive). Can be wired to final routes later.
    if (action === 'viewGame') {
      if (typeof MA.postJson === 'function' && routes.apiSession) {
        try { await MA.postJson(`${routes.apiSession}/setGame.php`, { ggid }); } catch (_) {}
      }
      window.location.assign(routes.playerReview || `/app/game_review/gamereview.php?ggid=${encodeURIComponent(ggid)}`);
      return;
    }
    if (action === 'enroll' || action === 'register') {
      window.location.assign(routes.playerRegister || `/app/game_players/gameplayers.php?ggid=${encodeURIComponent(ggid)}`);
      return;
    }
    if (action === 'unregister') {
      alert('Unregister action not wired yet in this first-pass scaffold.');
      return;
    }
    if (action === 'calendar') {
      downloadIcsForGame(g);
      return;
    }
    if (action === 'scorecard') {
      window.location.assign(routes.playerScorecard || `/app/game_scorecard/gamescorecard.php?ggid=${encodeURIComponent(ggid)}`);
      return;
    }
  }

  function downloadIcsForGame(g){
    const title = rowText(g,['title','dbGames_Title']) || 'Golf Game';
    const date = rowText(g,['playDate','dbGames_PlayDate']);
    const time = rowText(g,['playTimeText','dbGames_PlayTime']) || '08:00';
    const course = rowText(g,['courseName','dbGames_CourseName']);
    const facility = rowText(g,['facilityName','dbGames_FacilityName']);
    if (!date) { setStatus('Calendar export unavailable (missing date).','warn'); return; }

    const start = new Date(`${date}T${time.length===5?time: '08:00'}:00`);
    if (Number.isNaN(start.getTime())) { setStatus('Calendar export unavailable (invalid date/time).','warn'); return; }
    const end = new Date(start.getTime() + 4*60*60*1000);

    const fmtUtc = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const escapeIcs = s => String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
    const ics = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MatchAid//Player Portal//EN','BEGIN:VEVENT',
      `UID:matchaid-${rowText(g,['ggid','dbGames_GGID'])||Date.now()}@matchaid`,
      `DTSTAMP:${fmtUtc(new Date())}`,
      `DTSTART:${fmtUtc(start)}`,
      `DTEND:${fmtUtc(end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `LOCATION:${escapeIcs([facility,course].filter(Boolean).join(' • '))}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'matchaid-game.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  async function postJson(url, payload){
    if (typeof MA.postJson === 'function') return MA.postJson(url, { payload });
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type':'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ payload })
    });
    return res.json();
  }

  function wireEvents(){
    el.btnOpenFilter?.addEventListener('click', openFilters);
    el.btnCloseModal?.addEventListener('click', closeFilters);
    el.btnCancelFilters?.addEventListener('click', closeFilters);
    el.btnApplyFilters?.addEventListener('click', onApplyFilters);
    el.segDate?.addEventListener('click', () => setFilterTab('date'));
    el.segAdmin?.addEventListener('click', () => setFilterTab('admin'));
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
