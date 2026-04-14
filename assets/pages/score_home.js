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
    pairingIds: { top: '', bottom: '' },
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
      sel.disabled = false;

      state.players.forEach(p => {
        const opt = document.createElement('option');
        opt.value = String(p.dbPlayers_PlayerGHIN || '');
        opt.textContent = String(p.dbPlayers_Name || '');
        sel.appendChild(opt);
      });
    });

    const players = Array.isArray(state.players) ? state.players.slice() : [];

    const pairingGroups = {};
    players.forEach((p) => {
      const pairingId = String(p.dbPlayers_PairingID || '').trim();
      if (!pairingId) return;
      if (!pairingGroups[pairingId]) pairingGroups[pairingId] = [];
      pairingGroups[pairingId].push(p);
    });

    const orderedPairingIds = Object.keys(pairingGroups).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    state.pairingIds = {
      top: orderedPairingIds[0] || '',
      bottom: orderedPairingIds[1] || ''
    };

    const sortByPos = (a, b) => {
      const posA = Number(a.dbPlayers_PairingPos || 99);
      const posB = Number(b.dbPlayers_PairingPos || 99);
      if (posA !== posB) return posA - posB;
      return String(a.dbPlayers_Name || '').localeCompare(String(b.dbPlayers_Name || ''));
    };

    const topPair = (pairingGroups[state.pairingIds.top] || []).slice().sort(sortByPos);
    const bottomPair = (pairingGroups[state.pairingIds.bottom] || []).slice().sort(sortByPos);

    if (el.cart1Driver && topPair[0]) {
      el.cart1Driver.value = String(topPair[0].dbPlayers_PlayerGHIN || '');
    }
    if (el.cart1Passenger) {
      if (topPair[1]) {
        el.cart1Passenger.value = String(topPair[1].dbPlayers_PlayerGHIN || '');
        el.cart1Passenger.disabled = false;
      } else {
        el.cart1Passenger.value = '';
        el.cart1Passenger.disabled = true;
      }
    }

    if (el.cart2Driver && bottomPair[0]) {
      el.cart2Driver.value = String(bottomPair[0].dbPlayers_PlayerGHIN || '');
    }
    if (el.cart2Passenger) {
      if (bottomPair[1]) {
        el.cart2Passenger.value = String(bottomPair[1].dbPlayers_PlayerGHIN || '');
        el.cart2Passenger.disabled = false;
      } else {
        el.cart2Passenger.value = '';
        el.cart2Passenger.disabled = true;
      }
    }
  }

async function onConfirmCart() {
  const slots = [
    {
      select: el.cart1Driver,
      pairingId: state.pairingIds?.top || '',
      pairingPos: '1'
    },
    {
      select: el.cart1Passenger,
      pairingId: state.pairingIds?.top || '',
      pairingPos: '2'
    },
    {
      select: el.cart2Driver,
      pairingId: state.pairingIds?.bottom || '',
      pairingPos: '1'
    },
    {
      select: el.cart2Passenger,
      pairingId: state.pairingIds?.bottom || '',
      pairingPos: '2'
    }
  ];

  const selected = [];
  const seen = new Set();

  for (const slot of slots) {
    if (!slot.select || slot.select.disabled) continue;

    const ghin = String(slot.select.value || '').trim();
    if (!ghin) {
      return MA.setStatus('Please complete all enabled cart positions.', 'warn');
    }

    if (seen.has(ghin)) {
      return MA.setStatus('Each cart position must have a unique player.', 'warn');
    }
    seen.add(ghin);

    selected.push({
      ghin,
      pairingId: slot.pairingId,
      pairingPos: slot.pairingPos
    });
  }

  state.cartAssignments = {};
  selected.forEach((row) => {
    state.cartAssignments[row.ghin] = {
      pairingId: row.pairingId,
      pairingPos: row.pairingPos
    };
  });

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