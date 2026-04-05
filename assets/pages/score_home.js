/* /assets/pages/score_home.js */
(function() {
  'use strict';
  const MA = window.MA || {};
  const paths = MA.paths || {};
  const initData = window.__INIT__ || {};
  const apiUrls = {
    scoreHome: (paths.apiScoreHome || '/api/initScoreHome') + '/initScoreHome.php',
    setScorerContext: (paths.apiScoreHome || '/api/initScoreHome') + '/setScorerContext.php',
    scoreEntry: paths.scoreEntry || '/app/score_entry/scoreentry.php'
  };

  const el = {
    playerKey: document.getElementById('shPlayerKey'),
    btnLaunch: document.getElementById('shBtnLaunch'),
    launchCard: document.getElementById('shLaunchCard'),

    cartCard: document.getElementById('shCartCard'),
    cart1Driver: document.getElementById('shCart1Driver'),
    cart1Passenger: document.getElementById('shCart1Passenger'),
    cart2Driver: document.getElementById('shCart2Driver'),
    cart2Passenger: document.getElementById('shCart2Passenger'),
    btnCartConfirm: document.getElementById('shBtnCartConfirm'),

    scorerCard: document.getElementById('shScorerCard'),
    scorerChips: document.getElementById('shScorerChips'),
    gatingMsg: document.getElementById('shGatingMsg')
  };

  const state = {
    players: [],
    game: null,
    cartAssignments: null,
    autoScorerGhin: "",
    portal: ""
  };

  async function onLaunch() {
    const key = (el.playerKey?.value || '').trim().toUpperCase();
    if (!key) return MA.setStatus('Please enter a ScoreCard ID.', 'warn');

    try {
      MA.setStatus('Validating...', 'info');
      const res = await MA.postJson(apiUrls.scoreHome, { playerKey: key });
      if (res.ok === false) throw new Error(res.message || 'Validation failed');

      // Check Game Day Gating (Bypass via canSave which includes testing mode)
      if (!res.payload.canSave) {
        el.launchCard.classList.add('isHidden');
        el.cartCard.classList.add('isHidden'); // Ensure cart card is also hidden
        el.scorerCard.classList.add('isHidden'); // Ensure scorer card is also hidden
        el.gatingMsg.classList.remove('isHidden');
        return;
      }

      state.players = res.payload.players || [];
      state.game = res.payload.game || {};
      state.portal = res.payload.portal || initData.portal || "";

      // Detect auto-selection path (Player or Admin portal)
      const sessionGhin = initData.sessionGhin || "";
      if (sessionGhin && state.portal === "PLAYER PORTAL") {
        // Verify player is part of this specific group to prevent accidental data entry
        const isMember = state.players.some(p => String(p.dbPlayers_PlayerGHIN) === sessionGhin);
        if (isMember) {
          state.autoScorerGhin = sessionGhin;
        }
      } else if (sessionGhin && state.portal === "ADMIN PORTAL") {
        // Admins always skip selection; if not in group, they score as authorized proxy
        state.autoScorerGhin = sessionGhin;
      }

      // Determine setup branch: Cart config (COD) vs direct Scorer selection
      if (state.game.dbGames_RotationMethod === 'COD' && res.payload.canSave) { // Only show cart if COD and scoring is allowed
        renderCartOptions();
        el.launchCard.classList.add('isHidden');
        el.cartCard.classList.remove('isHidden');
      } else if (state.autoScorerGhin) {
        await finalizeScorerContext(state.autoScorerGhin);
        return;
      } else {
        showScorerStep();
      }

      applyChrome();
      MA.setStatus('Ready.', 'success');
    } catch (e) { MA.setStatus(e.message, 'error'); }
  }

  function renderCartOptions() {
    const selects = [el.cart1Driver, el.cart1Passenger, el.cart2Driver, el.cart2Passenger];
    selects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '<option value=""></option>';
      state.players.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.dbPlayers_PlayerGHIN;
        opt.textContent = p.dbPlayers_Name;
        sel.appendChild(opt);
      });
    });
  }

  async function onConfirmCart() {
    const picks = [el.cart1Driver.value, el.cart1Passenger.value, el.cart2Driver.value, el.cart2Passenger.value].filter(Boolean);
    const unique = new Set(picks);
    if (unique.size !== picks.length) return MA.setStatus('Each cart position must have a unique player.', 'warn');

    state.cartAssignments = {};
    if (el.cart1Driver.value) state.cartAssignments[el.cart1Driver.value] = '1';
    if (el.cart1Passenger.value) state.cartAssignments[el.cart1Passenger.value] = '2';
    if (el.cart2Driver.value) state.cartAssignments[el.cart2Driver.value] = '3';
    if (el.cart2Passenger.value) state.cartAssignments[el.cart2Passenger.value] = '4';

    if (state.autoScorerGhin) {
      await finalizeScorerContext(state.autoScorerGhin);
    } else {
      showScorerStep();
    }
  }

  function showScorerStep() {
    renderScorers(state.players);
    el.launchCard.classList.add('isHidden');
    el.cartCard.classList.add('isHidden');
    el.scorerCard.classList.remove('isHidden');
  }

  async function finalizeScorerContext(ghin) {
    try {
      MA.setStatus('Preparing scoring...', 'info');
      await MA.postJson(apiUrls.setScorerContext, { 
        ghin: ghin,
        carts: state.cartAssignments 
      });
      window.location.href = apiUrls.scoreEntry;
    } catch (e) { MA.setStatus('Failed to set context.', 'error'); }
  }

  function renderScorers(players) {
    el.scorerChips.innerHTML = '';
    players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'maChoiceChip';
      btn.textContent = p.dbPlayers_Name;
      btn.onclick = () => finalizeScorerContext(p.dbPlayers_PlayerGHIN);
      el.scorerChips.appendChild(btn);
    });
  }

  function applyChrome() {
    const game = state.game || {};
    const title1 = 'Scoring Setup';
    const title2 = game.dbGames_Title || '';
    const title3 = game.dbGames_CourseName || '';

    if (MA.chrome && typeof MA.chrome.setHeaderLines === 'function') {
      MA.chrome.setHeaderLines([title1, title2, title3]);
    }

    if (MA.chrome && typeof MA.chrome.setBottomNav === 'function') {
      const portal = state.portal || initData.portal || "";
      const homeRoute = (portal === "ADMIN PORTAL") ? "admin" 
                      : (portal === "PLAYER PORTAL" ? "player" : "home");

      MA.chrome.setBottomNav({
        visible: [homeRoute, 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoreskins'],
        active: '',
        onNavigate: (id) => (typeof MA.routerGo === 'function' ? MA.routerGo(id) : null)
      });
    }
  }

  if (el.btnLaunch) el.btnLaunch.onclick = onLaunch;
  if (el.btnCartConfirm) el.btnCartConfirm.onclick = onConfirmCart;
  if (el.playerKey) el.playerKey.onkeydown = (e) => { if (e.key === 'Enter') onLaunch(); };
  applyChrome();

  // Auto-launch if a key was provided in the URL initialization
  if (initData.urlKey && el.playerKey) {
    el.playerKey.value = initData.urlKey;
    onLaunch();
  }
})();