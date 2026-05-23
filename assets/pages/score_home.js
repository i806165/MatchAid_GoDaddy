/* /assets/pages/score_home.js */
(function () {
  'use strict';

  const MA        = window.MA || {};
  const initData  = window.__INIT__ || {};
  const paths     = (MA.paths) || {};

  const apiUrls = {
    scoreHome:       (paths.apiScoreHome || '/api/score_home') + '/initScoreHome.php',
    setScorerContext:(paths.apiScoreHome || '/api/score_home') + '/setScorerContext.php',
    scoreEntry:       paths.scoreEntry  || '/app/score_entry/scoreentry.php',
    scoreSummary:     paths.scoreSummary || '/app/score_summary/scoresummary.php',
  };

  // -------------------------------------------------------------------------
  // DOM references
  // -------------------------------------------------------------------------

  const el = {
    launchCard:       document.getElementById('shLaunchCard'),
    playerKey:        document.getElementById('shPlayerKey'),
    btnLaunch:        document.getElementById('shBtnLaunch'),

    groupCard:        document.getElementById('shGroupCard'),
    groupKey:         document.getElementById('shGroupKey'),
    groupContext:     document.getElementById('shGroupContext'),
    playerRows:       document.getElementById('shPlayerRows'),
    cardFooter:       document.getElementById('shCardFooter'),

    gatingMsg:        document.getElementById('shGatingMsg'),

    actionBar:        document.getElementById('shActionBar'),
    btnGo:            document.getElementById('shBtnGo'),
    secondaryActions: document.getElementById('shSecondaryActions'),

    // Cart drawer
    cartOverlay:      document.getElementById('shCartOverlay'),
    cartDrawerTitle:  document.getElementById('shCartDrawerTitle'),
    cartInstruction:  document.getElementById('shCartInstruction'),
    cartPlayerList:   document.getElementById('shCartPlayerList'),
    cartPreview:      document.getElementById('shCartPreview'),
    cartClose:        document.getElementById('shCartClose'),
    cartCancel:       document.getElementById('shCartCancel'),
    cartConfirm:      document.getElementById('shCartConfirm'),

    // Scorer drawer
    scorerOverlay:      document.getElementById('shScorerOverlay'),
    scorerDrawerTitle:  document.getElementById('shScorerDrawerTitle'),
    scorerPlayerList:   document.getElementById('shScorerPlayerList'),
    scorerAdminSection: document.getElementById('shScorerAdminSection'),
    scorerAdminRow:     document.getElementById('shScorerAdminRow'),
    scorerClose:        document.getElementById('shScorerClose'),
    scorerCancel:       document.getElementById('shScorerCancel'),
    scorerConfirm:      document.getElementById('shScorerConfirm'),
  };

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state = {
    players:         [],
    game:            null,
    portal:          initData.portal || '',
    autoScorerGhin:  initData.autoScorerGhin || '',
    sessionGhin:     initData.sessionGhin || '',

    // From API response
    hasScores:       false,
    isGameDay:       false,
    scorerGHIN:      initData.scorerGHIN || null,
    cartAssignments: null,

    // Computed flags (set after launch)
    flags:           {},

    // Cart sheet working state
    cart: {
      cart1GHINs: new Set(),   // GHINs assigned to Cart 1
      drivers:    new Set(),   // GHINs designated as drivers
    },

    // Scorer sheet working state
    scorer: {
      selectedGHIN: null,
    },
  };

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function pad3(v) {
    const n = parseInt(String(v || '0'), 10);
    if (!Number.isFinite(n) || n <= 0) return '000';
    return String(n).padStart(3, '0');
  }

  function normFlightPos(v) {
    const s = String(v || '').trim().toUpperCase();
    if (s === 'A' || s === 'B') return s;
    if (s === '1') return 'A';
    if (s === '2') return 'B';
    return '';
  }

  function formatTime(raw) {
    if (!raw) return '';
    const m = String(raw).match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i);
    if (!m) return raw;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const mer = m[3] ? m[3].toUpperCase() : '';
    if (mer) return `${h}:${min} ${mer}`;
    return `${h}:${min}`;
  }

  // -------------------------------------------------------------------------
  // Derive field visibility flags from game row
  // -------------------------------------------------------------------------

  function deriveFlags(game) {
    const competition    = String(game.dbGames_Competition   || '').trim();
    const scoringMethod  = String(game.dbGames_ScoringMethod || '').trim().toUpperCase();
    const scoringSystem  = String(game.dbGames_ScoringSystem || '').trim();
    const rotationMethod = String(game.dbGames_RotationMethod|| '').trim();
    const hcAllowance    = Number(game.dbGames_HCAllowance   || 100);
    const gameFormat     = String(game.dbGames_GameFormat    || '').trim();
    const teamConfigRaw  = game.dbGames_TeamConfig || null;

    const isTeamFormat = ['Scramble', 'Shamble', 'AltShot', 'Chapman'].includes(gameFormat);

    let teamConfig = null;
    if (teamConfigRaw) {
      try {
        const parsed = typeof teamConfigRaw === 'string' ? JSON.parse(teamConfigRaw) : teamConfigRaw;
        if (parsed && Array.isArray(parsed.teams) && parsed.teams.length === 2) {
          teamConfig = parsed;
        }
      } catch (e) { /* ignore */ }
    }

    const showCH = ['NET', 'ADJ GROSS'].includes(scoringMethod);

    return {
      competition,
      scoringMethod,
      scoringSystem,
      rotationMethod,
      hcAllowance,
      isTeamFormat,
      teamConfig,

      showMatch:    competition === 'PairPair',
      showSide:     competition === 'PairPair',
      showFlight:   ['PairField', 'FlightField'].includes(competition),
      showTeam:     teamConfig !== null,
      showPairHdrs: ['PairPair', 'PairField'].includes(competition),
      showCH,
      showPH:       showCH && hcAllowance !== 100,
      showSO:       !isTeamFormat && !['DeclareManual', 'DeclarePlayer'].includes(scoringSystem),
      cartRequired: rotationMethod !== 'None',
      scorerRequired: !state.autoScorerGhin,
    };
  }

  // -------------------------------------------------------------------------
  // Team name resolution (mirrors game_pairings.js)
  // -------------------------------------------------------------------------

  function resolveTeamName(teamId, teamConfig) {
    if (!teamConfig || !Array.isArray(teamConfig.teams)) return '';
    const t = teamConfig.teams.find(t => t.id === teamId);
    return t ? (t.name || '') : '';
  }

  // -------------------------------------------------------------------------
  // Player normalisation
  // -------------------------------------------------------------------------

  function normalizePlayers(rows) {
    return (rows || []).map(r => ({
      ghin:          String(r.dbPlayers_PlayerGHIN  ?? ''),
      name:          String(r.dbPlayers_Name         ?? ''),
      teeSetName:    String(r.dbPlayers_TeeSetName   ?? ''),
      hi:            String(r.dbPlayers_HI           ?? ''),
      ch:            String(r.dbPlayers_CH           ?? ''),
      ph:            String(r.dbPlayers_PH           ?? ''),
      so:            String(r.dbPlayers_SO           ?? '0'),
      pairingId:     pad3(r.dbPlayers_PairingID      ?? '000'),
      pairingPos:    String(r.dbPlayers_PairingPos   ?? ''),
      flightId:      String(r.dbPlayers_FlightID     ?? '').trim(),
      flightPos:     normFlightPos(r.dbPlayers_FlightPos ?? ''),
      teeTime:       String(r.dbPlayers_TeeTime      ?? ''),
      startHole:     String(r.dbPlayers_StartHole    ?? ''),
      startHoleSuffix: String(r.dbPlayers_StartHoleSuffix ?? ''),
      playerKey:     String(r.dbPlayers_PlayerKey    ?? ''),
      team:          String(r.dbPlayers_TeamKey      ?? ''),
      scoresJson:    r.dbPlayers_Scores || null,
    }));
  }

  // -------------------------------------------------------------------------
  // Sort players for display
  // Ordering: by PairingID asc, then PairingPos asc within pairing.
  // If cart assignments exist: Cart 1 (pos1, pos2), Cart 2 (pos1, pos2).
  // -------------------------------------------------------------------------

  function sortedPlayers() {
    const players = state.players.slice();

    if (state.cartAssignments) {
      // Determine cart number per GHIN from cartAssignments pairingId
      // Cart 1 = lower pairingId, Cart 2 = higher pairingId
      const pairingIds = [...new Set(
        Object.values(state.cartAssignments).map(a => a.pairingId)
      )].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      const cartOf = (ghin) => {
        const a = state.cartAssignments[ghin];
        if (!a) return 99;
        return pairingIds.indexOf(a.pairingId) === 0 ? 1 : 2;
      };
      const posOf = (ghin) => {
        const a = state.cartAssignments[ghin];
        return a ? parseInt(a.pairingPos, 10) : 99;
      };

      return players.sort((a, b) => {
        const cartDiff = cartOf(a.ghin) - cartOf(b.ghin);
        if (cartDiff !== 0) return cartDiff;
        return posOf(a.ghin) - posOf(b.ghin);
      });
    }

    return players.sort((a, b) => {
      const pidDiff = parseInt(a.pairingId, 10) - parseInt(b.pairingId, 10);
      if (pidDiff !== 0) return pidDiff;
      return parseInt(a.pairingPos || '99', 10) - parseInt(b.pairingPos || '99', 10);
    });
  }

  // -------------------------------------------------------------------------
  // Render group context strip
  // -------------------------------------------------------------------------

  function renderGroupContext() {
    const flags = state.flags;
    const p = state.players[0] || {};

    const cells = [];

    const tt = formatTime(p.teeTime);
    if (tt) cells.push({ lbl: 'Tee time', val: tt });

    if (p.startHole) {
      cells.push({ lbl: 'Start', val: `Hole ${p.startHole}${p.startHoleSuffix || ''}` });
    }

    if (flags.showMatch && p.flightId) {
      cells.push({ lbl: 'Match', val: p.flightId });
    }

    if (!cells.length) {
      el.groupContext.classList.add('isHidden');
      return;
    }

    el.groupContext.innerHTML = `<div class="sh-groupContext">${
      cells.map(c => `
        <div class="sh-groupContext__cell">
          <span class="sh-groupContext__lbl">${esc(c.lbl)}</span>
          <span class="sh-groupContext__val">${esc(c.val)}</span>
        </div>`).join('')
    }</div>`;

    el.groupContext.classList.remove('isHidden');
  }

  // -------------------------------------------------------------------------
  // Render player rows
  // -------------------------------------------------------------------------

  function renderPlayerRows() {
    const flags    = state.flags;
    const players  = sortedPlayers();
    const tc       = flags.teamConfig;

    let html = '';
    let prevPairingId = null;

    players.forEach(p => {
      // Pairing sub-header
      if (flags.showPairHdrs && p.pairingId !== prevPairingId) {
        const pairingPlayers = players.filter(x => x.pairingId === p.pairingId);
        const teamNames = tc
          ? pairingPlayers.map(x => resolveTeamName(x.team, tc))
          : [];
        const allSameTeam = tc && teamNames.length > 0 && teamNames.every(t => t && t === teamNames[0]);

        let headerParts = [];
        if (flags.showSide && p.flightPos) {
          headerParts.push(`Side ${p.flightPos}`);
        }
        headerParts.push(`Pair ${Number(p.pairingId)}`);
        if (allSameTeam && teamNames[0]) {
          headerParts.push(teamNames[0]);
        }

        html += `<div class="maListRow__group">${esc(headerParts.join(' · '))}</div>`;
        prevPairingId = p.pairingId;
      }

      // Determine team display for this player
      // Mixed teams within pairing → show per-player; same team → shown in header
      let teamInline = '';
      if (tc && flags.showTeam) {
        const pairingPlayers = players.filter(x => x.pairingId === p.pairingId);
        const teamNames = pairingPlayers.map(x => resolveTeamName(x.team, tc));
        const allSameTeam = teamNames.every(t => t && t === teamNames[0]);
        if (!allSameTeam) {
          const myTeam = resolveTeamName(p.team, tc);
          if (myTeam) teamInline = ` · ${myTeam}`;
        }
      }

      // Line 1: Name · Tee [teamInline if mixed]
      const teeDisplay = p.teeSetName ? ` · Tee ${p.teeSetName}` : '';
      const line1 = `${esc(p.name)}${esc(teeDisplay)}${esc(teamInline)}`;

      // Line 2: HI / CH / PH / SO (conditional)
      const metaParts = [];
      if (p.hi)                         metaParts.push(`HI ${p.hi}`);
      if (flags.showCH && p.ch)         metaParts.push(`CH ${p.ch}`);
      if (flags.showCH && p.ph)         metaParts.push(`PH ${p.ph}`);
      if (flags.showSO && p.so !== null && p.so !== '') metaParts.push(`SO ${p.so}`);

      const line2 = metaParts.length
        ? `<div class="sh-playerMeta">${
            metaParts.map(m => `<span class="sh-playerMeta__item">${esc(m)}</span>`).join('')
          }</div>`
        : '';

      html += `
        <div class="maListRow sh-playerRow" data-ghin="${esc(p.ghin)}">
          <div class="sh-playerRow__text">
            <div class="maListRow__col">${line1}</div>
            ${line2}
          </div>
        </div>`;
    });

    el.playerRows.innerHTML = html;
  }

  // -------------------------------------------------------------------------
  // Render card footer setup buttons
  // -------------------------------------------------------------------------

  function renderCardFooter() {
    const flags     = state.flags;
    const hasScores = state.hasScores;

    // In ready mode, buttons move to secondary actions below action bar
    if (hasScores) {
      el.cardFooter.style.display = 'none';
      el.cardFooter.classList.add('isHidden');
      return;
    }

    const buttons = [];

    if (flags.cartRequired) {
      buttons.push(`<button type="button" class="btn btnSecondary sh-btn--required" id="shBtnSetCart">
        Set cart configuration
      </button>`);
    }

    if (flags.scorerRequired) {
      buttons.push(`<button type="button" class="btn btnSecondary sh-btn--required" id="shBtnSetScorer">
        Set scorer
      </button>`);
    }

    if (!buttons.length) {
      el.cardFooter.style.display = 'none';
      el.cardFooter.classList.add('isHidden');
      return;
    }

    el.cardFooter.innerHTML = buttons.join('');
    el.cardFooter.style.display = '';
    el.cardFooter.classList.remove('isHidden');

    document.getElementById('shBtnSetCart')?.addEventListener('click', openCartDrawer);
    document.getElementById('shBtnSetScorer')?.addEventListener('click', openScorerDrawer);
  }

  // -------------------------------------------------------------------------
  // Render secondary actions (ready mode — below action bar)
  // -------------------------------------------------------------------------

  function renderSecondaryActions() {
    const flags     = state.flags;
    const hasScores = state.hasScores;

    if (!hasScores) {
      el.secondaryActions.classList.add('isHidden');
      return;
    }

    const buttons = [];

    if (flags.cartRequired) {
      buttons.push(`<button type="button" class="btn sh-sec-btn" id="shBtnChangeCart">
        Change cart configuration
      </button>`);
    }

    if (flags.scorerRequired) {
      const scorerName = getScorerName();
      const label = scorerName ? `Change scorer — ${scorerName}` : 'Change scorer';
      buttons.push(`<button type="button" class="btn sh-sec-btn" id="shBtnChangeScorer">
        ${esc(label)}
      </button>`);
    }

    if (!buttons.length) {
      el.secondaryActions.classList.add('isHidden');
      return;
    }

    el.secondaryActions.innerHTML = buttons.join('');
    el.secondaryActions.classList.remove('isHidden');

    document.getElementById('shBtnChangeCart')?.addEventListener('click', openCartDrawer);
    document.getElementById('shBtnChangeScorer')?.addEventListener('click', openScorerDrawer);
  }

  // -------------------------------------------------------------------------
  // Get scorer display name from current scorerGHIN
  // -------------------------------------------------------------------------

  function getScorerName() {
    if (!state.scorerGHIN) return '';
    // Check group players first
    const p = state.players.find(p => p.ghin === state.scorerGHIN);
    if (p) return p.name;
    // Fallback: admin (session user)
    if (state.sessionGhin === state.scorerGHIN) {
      return initData.sessionName || 'Admin';
    }
    return '';
  }

  // -------------------------------------------------------------------------
  // Enter Scores button state
  // -------------------------------------------------------------------------

  function updateGoButton() {
    const flags      = state.flags;
    const cartDone   = !flags.cartRequired   || state.cartAssignments !== null;
    const scorerDone = !flags.scorerRequired || state.scorerGHIN      !== null;
    const canGo      = state.hasScores || (cartDone && scorerDone);

    el.btnGo.disabled = !canGo;
    if (canGo) {
      el.btnGo.classList.remove('is-disabled');
    } else {
      el.btnGo.classList.add('is-disabled');
    }
  }

  // -------------------------------------------------------------------------
  // Chrome
  // -------------------------------------------------------------------------

  function applyChrome() {
    const game   = state.game || {};
    const chrome = MA.chrome || {};

    if (typeof chrome.setHeaderLines === 'function') {
      chrome.setHeaderLines([
        'Scoring Home',
        game.dbGames_Title     || '',
        game.dbGames_CourseName || '',
      ]);
    }

    if (typeof chrome.setActions === 'function') {
      chrome.setActions({
        left:  { show: false },
        right: {
          show: !!state.game,
          label: 'Actions',
          onClick: openActionsMenu,
        },
      });
    }

    if (typeof chrome.setBottomNav === 'function') {
      const portal    = state.portal;
      const homeRoute = portal === 'ADMIN PORTAL'  ? 'admin'
                      : portal === 'PLAYER PORTAL' ? 'player'
                      : 'home';
      chrome.setBottomNav({
        visible: [homeRoute],
        active:  '',
        onNavigate: (id) => {
          if (typeof MA.routerGo === 'function') MA.routerGo(id);
        },
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    const items = [];
    if (state.game) {
      items.push({
        label: 'View game details',
        action: () => MA.gameDetails && MA.gameDetails.open(state.game),
      });
    }
    MA.ui.openActionsMenu('Actions', items);
  }

  // -------------------------------------------------------------------------
  // Launch flow
  // -------------------------------------------------------------------------

  async function onLaunch() {
    const key = (el.playerKey?.value || '').trim().toUpperCase();
    if (!key) return MA.setStatus('Please enter a Scorecard ID.', 'warn');

    try {
      MA.setStatus('Validating…', 'info');
      const res = await MA.postJson(apiUrls.scoreHome, { playerKey: key });
      if (!res.ok) throw new Error(res.message || 'Validation failed');

      const payload = res.payload;

      // Gating check
      if (!payload.canSave) {
        el.launchCard.classList.add('isHidden');
        el.gatingMsg.classList.remove('isHidden');
        return;
      }

      // Hydrate state from API response
      state.players        = normalizePlayers(payload.players || []);
      state.game           = payload.game || {};
      state.portal         = payload.portal || initData.portal || '';
      state.hasScores      = !!payload.hasScores;
      state.isGameDay      = !!payload.isGameDay;
      state.scorerGHIN     = payload.scorerGHIN || null;
      state.cartAssignments = payload.cartAssignments || null;
      state.flags          = deriveFlags(state.game);

      // Resolve autoScorerGhin from session (mirrors scorehome.php logic)
      const sessionGhin = initData.sessionGhin || '';
      state.autoScorerGhin = '';
      if (sessionGhin && state.portal === 'PLAYER PORTAL') {
        const isMember = state.players.some(p => p.ghin === sessionGhin);
        if (isMember) state.autoScorerGhin = sessionGhin;
      } else if (sessionGhin && state.portal === 'ADMIN PORTAL') {
        state.autoScorerGhin = sessionGhin;
      }

      // Re-derive scorerRequired now that autoScorerGhin is resolved
      state.flags.scorerRequired = !state.autoScorerGhin;

      // If logged-in user is auto-scorer, record it
      if (state.autoScorerGhin && !state.scorerGHIN) {
        state.scorerGHIN = state.autoScorerGhin;
      }

      // Show group card, hide launch card
      el.launchCard.classList.add('isHidden');
      el.groupCard.classList.remove('isHidden');
      el.actionBar.classList.remove('isHidden');
      el.groupKey.textContent = key;

      renderGroupContext();
      renderPlayerRows();
      renderCardFooter();
      renderSecondaryActions();
      updateGoButton();
      applyChrome();

      MA.setStatus('Ready.', 'success');
    } catch (e) {
      MA.setStatus(e.message || 'Launch failed.', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Cart drawer
  // -------------------------------------------------------------------------

  function openCartDrawer() {
    const hasScores = state.hasScores;
    el.cartDrawerTitle.textContent = hasScores
      ? 'Change cart configuration'
      : 'Cart configuration';
    el.cartInstruction.textContent = hasScores
      ? 'Tap players to reassign — Cart 2 updates automatically'
      : 'Tap players to assign to Cart 1 — rest go to Cart 2';

    // Initialise cart working state from persisted assignments or defaults
    initCartState();
    renderCartPlayerList();
    renderCartPreview();

    el.cartOverlay.classList.add('is-open');
    document.body.classList.add('maOverlayOpen');
  }

  function closeCartDrawer() {
    el.cartOverlay.classList.remove('is-open');
    document.body.classList.remove('maOverlayOpen');
  }

  function initCartState() {
    const s = state.cart;
    s.cart1GHINs.clear();
    s.drivers.clear();

    const players = state.players;

    if (state.cartAssignments) {
      // Restore from persisted session
      // Cart 1 = pairingId of topPair, Cart 2 = bottomPair
      const pairingIds = [...new Set(
        Object.values(state.cartAssignments).map(a => a.pairingId)
      )].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

      const topPairingId = pairingIds[0] || '';

      Object.entries(state.cartAssignments).forEach(([ghin, assignment]) => {
        if (assignment.pairingId === topPairingId) s.cart1GHINs.add(ghin);
        if (assignment.pairingPos === '1') s.drivers.add(ghin);
      });
    } else {
      // Default: Pairing 1 → Cart 1, Pairing 2 → Cart 2
      // PairingPos 1 → driver in each cart
      const pairingGroups = {};
      players.forEach(p => {
        if (!pairingGroups[p.pairingId]) pairingGroups[p.pairingId] = [];
        pairingGroups[p.pairingId].push(p);
      });

      const orderedIds = Object.keys(pairingGroups).sort(
        (a, b) => parseInt(a, 10) - parseInt(b, 10)
      );

      const sortByPos = (a, b) =>
        parseInt(a.pairingPos || '99', 10) - parseInt(b.pairingPos || '99', 10);

      const topPair    = (pairingGroups[orderedIds[0]] || []).slice().sort(sortByPos);
      const bottomPair = (pairingGroups[orderedIds[1]] || []).slice().sort(sortByPos);

      topPair.forEach(p => s.cart1GHINs.add(p.ghin));
      if (topPair[0])    s.drivers.add(topPair[0].ghin);
      if (bottomPair[0]) s.drivers.add(bottomPair[0].ghin);
    }
  }

  function renderCartPlayerList() {
    const s       = state.cart;
    const players = state.players;
    const hasC1   = s.cart1GHINs.size > 0;

    el.cartPlayerList.innerHTML = players.map(p => {
      const inC1 = s.cart1GHINs.has(p.ghin);
      const pillClass = inC1  ? 'maPill sh-pill--cart1'
                      : hasC1 ? 'maPill sh-pill--cart2'
                      :         'maPill';
      const pillText  = inC1  ? 'Cart 1'
                      : hasC1 ? 'Cart 2'
                      :         '—';

      return `
        <div class="maListRow sh-cartRow" data-ghin="${esc(p.ghin)}">
          <div class="maListRow__col" style="flex:1">${esc(p.name)}</div>
          <span class="${pillClass}">${pillText}</span>
        </div>`;
    }).join('');

    el.cartPlayerList.querySelectorAll('.sh-cartRow').forEach(row => {
      row.addEventListener('click', () => {
        const ghin  = row.dataset.ghin;
        const inC1  = s.cart1GHINs.has(ghin);
        const c1Sz  = s.cart1GHINs.size;
        const c2Sz  = players.length - c1Sz;

        if (inC1 && c1Sz > 1) {
          s.cart1GHINs.delete(ghin);
        } else if (!inC1 && c2Sz > 1) {
          s.cart1GHINs.add(ghin);
        }
        // Guard: prevent all players ending up in one cart

        renderCartPlayerList();
        renderCartPreview();
      });
    });
  }

  function renderCartPreview() {
    const s       = state.cart;
    const players = state.players;

    const cart1 = players.filter(p => s.cart1GHINs.has(p.ghin));
    const cart2 = players.filter(p => !s.cart1GHINs.has(p.ghin));

    if (!cart1.length) {
      el.cartPreview.classList.add('isHidden');
      el.cartConfirm.disabled = true;
      return;
    }

    const cartBlock = (label, cartPlayers, colorClass) => {
      const hint = cartPlayers.length > 1 ? 'Tap to set driver' : '';
      const rows = cartPlayers.map(p => {
        const isDriver = cartPlayers.length === 1 || s.drivers.has(p.ghin);
        const roleText = isDriver ? 'Driver' : 'Passenger';
        const roleCls  = isDriver ? 'maPill sh-pill--driver' : 'maPill';
        const clickable = cartPlayers.length > 1 ? `data-role-ghin="${esc(p.ghin)}"` : '';
        return `
          <div class="maListRow sh-cartRoleRow">
            <div class="maListRow__col" style="flex:1">${esc(p.name)}</div>
            <span class="${roleCls}" style="cursor:${cartPlayers.length > 1 ? 'pointer' : 'default'}" ${clickable}>${roleText}</span>
          </div>`;
      }).join('');

      return `
        <div class="maCard" style="margin-bottom:8px">
          <div class="maCard__hdr">
            <div class="maCard__title ${colorClass}">${esc(label)}</div>
            <span style="font-size:11px;color:var(--mutedText)">${esc(hint)}</span>
          </div>
          ${rows}
        </div>`;
    };

    el.cartPreview.innerHTML =
      cartBlock('Cart 1', cart1, 'sh-cart1-label') +
      cartBlock('Cart 2', cart2, 'sh-cart2-label');

    el.cartPreview.classList.remove('isHidden');

    // Wire role pill taps
    el.cartPreview.querySelectorAll('[data-role-ghin]').forEach(pill => {
      pill.addEventListener('click', () => {
        const ghin = pill.dataset.roleGhin;
        // Find the cart this player is in, then set them as driver
        // and implicitly make the other the passenger
        const cartPlayers = cart1.some(p => p.ghin === ghin) ? cart1 : cart2;
        s.drivers.clear();
        // Only set the clicked player as driver — passenger is implied
        cartPlayers.forEach(p => {
          if (p.ghin === ghin) s.drivers.add(p.ghin);
        });
        renderCartPreview();
      });
    });

    // Confirm enabled when both carts have players and each multi-cart has a driver
    const c1Ready = cart1.length === 1 || cart1.some(p => s.drivers.has(p.ghin));
    const c2Ready = cart2.length === 0 || cart2.length === 1 || cart2.some(p => s.drivers.has(p.ghin));
    el.cartConfirm.disabled = !(cart2.length > 0 && c1Ready && c2Ready);
  }

  async function onCartConfirm() {
    const s       = state.cart;
    const players = state.players;
    const cart1   = players.filter(p => s.cart1GHINs.has(p.ghin));
    const cart2   = players.filter(p => !s.cart1GHINs.has(p.ghin));

    // Build pairingId assignments:
    // Cart 1 → topPairingId, Cart 2 → bottomPairingId
    // We reuse the existing pairingIds from the data but map to cart
    const pairingIds = [...new Set(players.map(p => p.pairingId))]
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const topPId    = pairingIds[0] || '001';
    const bottomPId = pairingIds[1] || '002';

    const cartAssignments = {};
    const assignCart = (cartPlayers, pairingId) => {
      cartPlayers.forEach(p => {
        const isDriver  = cartPlayers.length === 1 || s.drivers.has(p.ghin);
        cartAssignments[p.ghin] = {
          pairingId,
          pairingPos: isDriver ? '1' : '2',
        };
      });
    };
    assignCart(cart1, topPId);
    assignCart(cart2, bottomPId);

    try {
      MA.setStatus('Saving cart configuration…', 'info');
      await MA.postJson(apiUrls.setScorerContext, {
        ghin:  state.scorerGHIN || state.autoScorerGhin || '',
        carts: cartAssignments,
      });

      state.cartAssignments = cartAssignments;
      closeCartDrawer();
      renderCardFooter();
      renderSecondaryActions();
      renderPlayerRows();
      updateGoButton();
      MA.setStatus('Cart configuration saved.', 'success');
    } catch (e) {
      MA.setStatus('Failed to save cart configuration.', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Scorer drawer
  // -------------------------------------------------------------------------

  function openScorerDrawer() {
    const hasScores = state.hasScores;
    el.scorerDrawerTitle.textContent = hasScores ? 'Change scorer' : 'Set scorer';

    renderScorerPlayerList();
    el.scorerOverlay.classList.add('is-open');
    document.body.classList.add('maOverlayOpen');
  }

  function closeScorerDrawer() {
    el.scorerOverlay.classList.remove('is-open');
    document.body.classList.remove('maOverlayOpen');
  }

  function renderScorerPlayerList() {
    const currentGHIN = state.scorerGHIN || state.scorer.selectedGHIN;

    // Group players
    el.scorerPlayerList.innerHTML = state.players.map(p => {
      const sel = p.ghin === currentGHIN;
      return `
        <div class="maListRow sh-scorerRow ${sel ? 'is-selected' : ''}" data-ghin="${esc(p.ghin)}">
          <div class="maListRow__col" style="flex:1">${esc(p.name)}</div>
          <div class="maAdminRow__check ${sel ? 'on' : ''}">${sel ? '&#x2713;' : ''}</div>
        </div>`;
    }).join('');

    // Admin section
    if (state.portal === 'ADMIN PORTAL') {
      el.scorerAdminSection.classList.remove('isHidden');
      const adminGhin = state.sessionGhin;
      const adminName = initData.sessionName || 'Admin';
      const sel = adminGhin === currentGHIN;
      el.scorerAdminRow.innerHTML = `
        <div class="maListRow sh-scorerRow ${sel ? 'is-selected' : ''}" data-ghin="${esc(adminGhin)}" data-admin="1">
          <div class="maListRow__col" style="flex:1">
            ${esc(adminName)}
            <div class="maListRow__col--muted" style="font-size:11px">Admin</div>
          </div>
          <div class="maAdminRow__check ${sel ? 'on' : ''}">${sel ? '&#x2713;' : ''}</div>
        </div>`;
    } else {
      el.scorerAdminSection.classList.add('isHidden');
    }

    // Pre-select
    state.scorer.selectedGHIN = currentGHIN || null;
    el.scorerConfirm.disabled = !state.scorer.selectedGHIN;

    // Wire taps
    const allRows = [
      ...el.scorerPlayerList.querySelectorAll('.sh-scorerRow'),
      ...el.scorerAdminRow.querySelectorAll('.sh-scorerRow'),
    ];

    allRows.forEach(row => {
      row.addEventListener('click', () => {
        state.scorer.selectedGHIN = row.dataset.ghin;

        allRows.forEach(r => {
          const sel = r.dataset.ghin === state.scorer.selectedGHIN;
          r.classList.toggle('is-selected', sel);
          const check = r.querySelector('.maAdminRow__check');
          if (check) {
            check.classList.toggle('on', sel);
            check.innerHTML = sel ? '&#x2713;' : '';
          }
        });

        el.scorerConfirm.disabled = false;
      });
    });
  }

  async function onScorerConfirm() {
    const ghin = state.scorer.selectedGHIN;
    if (!ghin) return;

    try {
      MA.setStatus('Setting scorer…', 'info');
      await MA.postJson(apiUrls.setScorerContext, {
        ghin,
        carts: state.cartAssignments,
      });

      state.scorerGHIN = ghin;
      closeScorerDrawer();
      renderCardFooter();
      renderSecondaryActions();
      updateGoButton();
      MA.setStatus('Scorer set.', 'success');
    } catch (e) {
      MA.setStatus('Failed to set scorer.', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Wire events
  // -------------------------------------------------------------------------

  el.btnLaunch?.addEventListener('click', onLaunch);
  el.playerKey?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onLaunch(); });

  el.btnGo?.addEventListener('click', () => {
    window.location.href = state.isGameDay ? apiUrls.scoreEntry : apiUrls.scoreSummary;
  });

  // Cart drawer
  el.cartClose?.addEventListener('click',   closeCartDrawer);
  el.cartCancel?.addEventListener('click',  closeCartDrawer);
  el.cartConfirm?.addEventListener('click', onCartConfirm);

  // Scorer drawer
  el.scorerClose?.addEventListener('click',   closeScorerDrawer);
  el.scorerCancel?.addEventListener('click',  closeScorerDrawer);
  el.scorerConfirm?.addEventListener('click', onScorerConfirm);

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  applyChrome();

  // Auto-launch:
  // Scenario 1 — QR code / direct URL: use urlKey from URL param
  // Scenario 2 — Nav from within app: fall back to sessionKey from existing session
  // Fresh user with no context gets neither — key entry form shown for manual entry
  const autoKey = initData.urlKey || initData.sessionKey || '';
  if (autoKey && el.playerKey) {
    el.playerKey.value = autoKey;
    onLaunch();
  }

})();