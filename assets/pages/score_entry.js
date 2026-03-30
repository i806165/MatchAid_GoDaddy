/* /assets/pages/score_entry.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const boot = window.__MA_INIT__ || window.__INIT__ || {};
  const paths = (window.MA && window.MA.paths) ? window.MA.paths : {};
  const routes = (window.MA && window.MA.routes) ? window.MA.routes : {};
  const chrome = MA.chrome || {};
  const apiAdmin = MA.apiAdminGames;
  
  const apiUrls = {
    launch: paths.apiScoreEntryLaunch
      || (routes.apiScoreEntry ? routes.apiScoreEntry + '/launch.php' : '/api/score_entry/launch.php'),
    saveScores: paths.apiScoreEntrySaveScores
      || (routes.apiScoreEntry ? routes.apiScoreEntry + '/saveScores.php' : '/api/score_entry/saveScores.php'),
    setScorerContext: (paths.apiScoreHome || '/api/score_home') + '/setScorerContext.php',
    setHole: (paths.apiScoreEntry || '/api/score_entry') + '/setHoleContext.php',
    clearContext: (paths.apiScoreEntry || '/api/score_entry') + '/clearContext.php',
    scoreHome: paths.scoreHome || '/app/score_home/scorehome.php'
  };

  // ==========================================================================
  // 1. Bootstrap / State
  // ==========================================================================

  const state = {
    payload: null,
    currentHole: boot.currentHole || 1,
    scorerGHIN: '',
    dirty: false,
  };

  function init() {
    if (boot.scorecardKey) {
        launch();
    }

    el.prevHoleBtn?.addEventListener('click', () => moveHole(-1));
    el.nextHoleBtn?.addEventListener('click', () => moveHole(1));

    el.holeSelect?.addEventListener('change', async (e) => {
      const nextHole = parseInt(e.target.value, 10);
      if (Number.isInteger(nextHole)) {
        await transitionHole(nextHole);
      }
    });
  }

  // ==========================================================================
  // 2. DOM Cache
  // ==========================================================================

  const el = {
    work: document.getElementById('scoreEntryWork'),
    holeSelect: document.getElementById('scoreHoleSelect'),
    prevHoleBtn: document.getElementById('scorePrevHoleBtn'),
    nextHoleBtn: document.getElementById('scoreNextHoleBtn'),
    rows: document.getElementById('scoreRowsContainer'),
    dirtyDialog: document.getElementById('scoreDirtyDialog'),
    ctx: {
      teeTime: document.getElementById('ctxTeeTime'),
      flightId: document.getElementById('ctxFlightId'),
      pairingId: document.getElementById('ctxPairingId'),
      playTime: document.getElementById('ctxPlayTime'),
      holes: document.getElementById('ctxHoles'),
      gameFormat: document.getElementById('ctxGameFormat'),
      segmentsRotation: document.getElementById('ctxSegmentsRotation'),
      scoringMethod: document.getElementById('ctxScoringMethod'),
      hcSettings: document.getElementById('ctxHCSettings'),
      strokeDistribution: document.getElementById('ctxStrokeDistribution')
    }
  };

  // ==========================================================================
  // 3. Launch Flow
  // ==========================================================================

  async function launch() {
    const playerKey = boot.scorecardKey;
    if (!playerKey) {
      return;
    }

    try {
      const res = await fetch(apiUrls.launch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey, holeNumber: 1 })
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        console.error('Non-JSON response from launch endpoint:', text);
        throw new Error('Launch endpoint did not return JSON.');
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Unable to launch score entry.');
      }

      state.payload = json.payload;
      (state.payload.players || []).forEach((wrapper) => {
        if (!wrapper.originalScoresJson) {
          wrapper.originalScoresJson = deepClone(wrapper.scoresJson || null);
        }
      });
      state.currentHole = json.payload.currentHole || 1;
      state.dirty = false;

      const ggid = state.payload?.gameRow?.dbGames_GGID;
      await apiAdmin("setGameSession.php", { ggid });

      renderLaunchPayload();
      applyChrome();
    } catch (err) {
      setPageStatus(err.message || 'Launch failed.', 'error');
    }
  }

  function renderLaunchPayload() {
    renderHoleOptions();
    renderRows();
    
    el.work.classList.remove('isHidden');
  }

  // ==========================================================================
  // 4. Context Rendering
  // ==========================================================================

  function renderHoleOptions() {
    const holesLabel = state.payload?.gameRow?.dbGames_Holes || 'All 18';
    let start = 1, end = 18;
    if (holesLabel === 'F9') end = 9;
    if (holesLabel === 'B9') start = 10;

    el.holeSelect.innerHTML = '';
    for (let h = start; h <= end; h += 1) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = String(h);
      if (h === state.currentHole) opt.selected = true;
      el.holeSelect.appendChild(opt);
    }
  }

  // ==========================================================================
  // 5. Cart Workflow
  // ==========================================================================

  function getCartPlayers() {
    return (state.payload?.players || []).map((wrapper) => {
      const pr = wrapper.playerRow || {};
      const sr = wrapper.scoreEntryRow || {};
      return {
        wrapper,
        ghin: String(pr.dbPlayers_PlayerGHIN || sr.playerGHIN || ''),
        name: String(pr.dbPlayers_Name || sr.playerName || ''),
        pairingPos: String(pr.dbPlayers_PairingPos || sr.pairingPos || '')
      };
    }).filter((p) => p.ghin && p.name);
  }

  function configureCartCard() {
    const players = getCartPlayers();
    const isCOD = String(state.payload?.gameRow?.dbGames_RotationMethod || '') === 'COD';

    const labels = isCOD
      ? ['Cart 1 Driver', 'Cart 1 Passenger', 'Cart 2 Driver', 'Cart 2 Passenger']
      : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

    if (el.cart1DriverLabel) el.cart1DriverLabel.textContent = labels[0];
    if (el.cart1PassengerLabel) el.cart1PassengerLabel.textContent = labels[1];
    if (el.cart2DriverLabel) el.cart2DriverLabel.textContent = labels[2];
    if (el.cart2PassengerLabel) el.cart2PassengerLabel.textContent = labels[3];

    const options = [{ label: '', value: '' }].concat(
      players.map((p) => ({ label: p.name, value: p.ghin }))
    );

    [el.cart1Driver, el.cart1Passenger, el.cart2Driver, el.cart2Passenger].forEach((select) => {
      if (!select) return;
      select.innerHTML = '';
      options.forEach((opt) => {
        const node = document.createElement('option');
        node.value = opt.value;
        node.textContent = opt.label;
        select.appendChild(node);
      });
      select.value = '';
    });

    players.forEach((p) => {
      switch (p.pairingPos) {
        case '1': if (el.cart1Driver) el.cart1Driver.value = p.ghin; break;
        case '2': if (el.cart1Passenger) el.cart1Passenger.value = p.ghin; break;
        case '3': if (el.cart2Driver) el.cart2Driver.value = p.ghin; break;
        case '4': if (el.cart2Passenger) el.cart2Passenger.value = p.ghin; break;
      }
    });
  }

  function confirmCartConfiguration() {
    const assignments = [
      { select: el.cart1Driver, pos: '1' },
      { select: el.cart1Passenger, pos: '2' },
      { select: el.cart2Driver, pos: '3' },
      { select: el.cart2Passenger, pos: '4' }
    ];

    const selected = [];
    const seen = new Set();

    for (const item of assignments) {
      const ghin = String(item.select?.value || '');
      if (!ghin) continue;
      if (seen.has(ghin)) {
        setPageStatus('Each cart position must have a unique player.', 'warn');
        return;
      }
      seen.add(ghin);
      selected.push({ ghin, pos: item.pos });
    }

    (state.payload?.players || []).forEach((wrapper) => {
      const pr = wrapper.playerRow || {};
      const sr = wrapper.scoreEntryRow || {};
      const ghin = String(pr.dbPlayers_PlayerGHIN || sr.playerGHIN || '');
      const match = selected.find((x) => x.ghin === ghin);
      const pos = match ? match.pos : '';

      if (pr) pr.dbPlayers_PairingPos = pos;
      if (sr) sr.pairingPos = pos;
    });

    showKeeperSelection();
  }

  // ==========================================================================
  // 6. Scorekeeper Workflow
  // ==========================================================================

  function showKeeperSelection() {
    el.cartCard.classList.add('isHidden');
    el.keeperCard.classList.remove('isHidden');
  }

  function renderKeeperChips() {
    const payload = state.payload;
    el.keeperChips.innerHTML = '';

    (payload.players || []).forEach((p) => {
      const row = p.scoreEntryRow || {};
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'maChoiceChip';
      btn.textContent = row.playerName || '';

      btn.addEventListener('click', async () => {
        state.scorerGHIN = row.playerGHIN || '';

        // Persist Scorer Context to Session
        await fetch(apiUrls.setScorerContext, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ghin: state.scorerGHIN })
        });

        // Transition to Scoring: Hide Setup (Context + Keeper), Show Work
        el.contextCard.classList.add('isHidden'); // Pane-1b
        el.keeperCard.classList.add('isHidden');  // Pane-4
        el.cartCard.classList.add('isHidden');    // Ensure hidden
        el.work.classList.remove('isHidden');
      });

      el.keeperChips.appendChild(btn);
    });
  }

  // ==========================================================================
  // 7. Hole Navigation
  // ==========================================================================

  async function moveHole(direction) {
    const holes = Array.from(el.holeSelect.options).map((o) => Number(o.value));
    const idx = holes.indexOf(state.currentHole);
    if (idx < 0) return;

    const nextIdx = Math.max(0, Math.min(holes.length - 1, idx + direction));
    await transitionHole(holes[nextIdx]);
  }

  async function transitionHole(nextHole) {
    if (nextHole === state.currentHole) return;

    try {
      if (state.dirty) {
        const saveResult = await saveScoresSilently(nextHole);
        if (!saveResult.ok) {
          if (saveResult.conflict) {
            resetToLaunch(saveResult.message || 'Another scorer is already updating this scorecard.');
            return;
          }
          setPageStatus(saveResult.message || 'Unable to save scores.', 'error');
          el.holeSelect.value = String(state.currentHole);
          return;
        }
        patchReturnedScores(saveResult);
        state.dirty = false;
      }

      const firstP = state.payload?.players?.[0];
      const pKey = firstP?.playerRow?.dbPlayers_PlayerKey;

      if (pKey) {
        const res = await fetch(apiUrls.launch, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerKey: pKey, holeNumber: nextHole })
        });
        const json = await res.json();
        if (json.ok && json.payload) {
          state.payload = json.payload;
          (state.payload.players || []).forEach((wrapper) => {
            if (!wrapper.originalScoresJson) {
              wrapper.originalScoresJson = deepClone(wrapper.scoresJson || null);
            }
          });
        }
      }

      // Persist hole to session
      await MA.postJson(apiUrls.setHole, { hole: nextHole });

      state.currentHole = nextHole;
      renderHoleOptions();
      renderRows();
      setPageStatus(`Moved to Hole ${nextHole}.`, 'info');
    } catch (err) {
      setPageStatus(err.message || 'Unable to change holes.', 'error');
      el.holeSelect.value = String(state.currentHole);
    }
  }

  // ==========================================================================
  // 7.5 Declaration Engine (JS Mirror)
  // ==========================================================================

  function resolveDeclaredScores() {
    const payload = state.payload;
    if (!payload) return;

    const g = payload.gameRow || {};
    const scoringSystem = g.dbGames_ScoringSystem || 'BestBall';
    const competition = g.dbGames_Competition || 'PairField';
    const scoringMethod = g.dbGames_ScoringMethod || 'NET';

    if (['DeclareManual', 'DeclarePlayer'].includes(scoringSystem)) return;

    const partitions = {};
    payload.players.forEach((wrapper, idx) => {
      const side = (competition === 'PairPair') ? (wrapper.playerRow?.dbPlayers_FlightPos || 'A') : 'GROUP';
      if (!partitions[side]) partitions[side] = [];
      partitions[side].push({
        idx,
        raw: wrapper.scoreEntryRow.rawScore,
        net: wrapper.scoreEntryRow.netScore,
        pos: parseInt(wrapper.playerRow?.dbPlayers_PairingPos || '99', 10)
      });
    });

    Object.values(partitions).forEach(rows => {
      const validRows = rows.filter(r => typeof r.raw === 'number');
      
      let n = 1;
      if (scoringSystem === 'AllScores') {
        n = validRows.length;
      } else if (scoringSystem === 'DeclareHole') {
        const holeDecls = Array.isArray(g.dbGames_HoleDeclaration) ? g.dbGames_HoleDeclaration : [];
        const found = holeDecls.find(h => parseInt(h.hole, 10) === state.currentHole);
        n = parseInt(found?.count || '1', 10);
      } else if (scoringSystem === 'BestBall') {
        n = parseInt(g.dbGames_BestBall || '1', 10);
      }

      validRows.sort((a, b) => {
        const metricA = (scoringMethod === 'ADJ GROSS') ? a.raw : a.net;
        const metricB = (scoringMethod === 'ADJ GROSS') ? b.raw : b.net;
        if (metricA !== metricB) return metricA - metricB;
        if (a.raw !== b.raw) return a.raw - b.raw;
        return a.pos - b.pos;
      });

      const declaredIndices = validRows.slice(0, n).map(r => r.idx);

      rows.forEach(row => {
        const wrapper = payload.players[row.idx];
        const isDeclared = declaredIndices.includes(row.idx);
        
        wrapper.scoreEntryRow.declared = isDeclared;
        updateWorkingScoresJson(wrapper, wrapper.scoreEntryRow.rawScore, isDeclared);
      });
    });

    // Refresh the UI to show new checkboxes/net values
    renderRows();
  }

  // ==========================================================================
  // 8. Collector Row Rendering
  // ==========================================================================

function renderRows() {
  const payload = state.payload;
  if (!payload) return;

  el.rows.innerHTML = '';

  (payload.players || []).forEach((wrapper) => {
    const row = wrapper.scoreEntryRow || {};
    const article = document.createElement('article');
    article.className = 'scorePlayerRow';
    article.dataset.playerId = row.playerId || '';

    const fullName = String(row.playerName || '').trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    let firstName = escapeHtml(nameParts[0] || '');
    const lastName = escapeHtml(nameParts.length > 1 ? nameParts.slice(1).join(' ') : (nameParts[0] || ''));
    const teeSetName = escapeHtml(row.teeSetName || '');
    const yardage = escapeHtml(String(row.yardage ?? '—'));
    const par = escapeHtml(String(row.par ?? '—'));
    const holeHcp = escapeHtml(String(row.holeHcp ?? '—'));
    const netScore = (row.netScore === null || row.netScore === undefined || row.netScore === '')
      ? '—'
      : escapeHtml(String(row.netScore));

    let netDisplay = netScore;
    if (row.netScore != null && row.par != null && row.netScore !== '') {
      const n = Number(row.netScore);
      const p = Number(row.par);
      const diff = n - p;
      const diffText = diff === 0 ? 'E' : (diff > 0 ? '+' : '') + diff;
      netDisplay = `${netScore} • ${diffText}`;
    }

    const payloadGame = state.payload || {};
    const scoringSystem = String(payloadGame.gameRow?.dbGames_ScoringSystem || '');
    const scoringMethod = String(payloadGame.gameRow?.dbGames_ScoringMethod || '');
    const labelPrefix = scoringMethod.toUpperCase() === 'ADJ GROSS' ? 'GROSS' : 'NET';

    if (scoringMethod.toUpperCase() === 'NET' && row.effectiveHC != null) {
      firstName += ` (${escapeHtml(String(row.effectiveHC))})`;
    }
    const isManualDeclare = ['DeclarePlayer', 'DeclareManual'].includes(scoringSystem);
    const isAutoDeclare = !isManualDeclare;
    const isDeclared = !!row.declared;

    const badgeTag = isManualDeclare ? 'button' : 'div';
    const badgeClasses = [
      'scorePlayerBadge',
      isManualDeclare ? 'scorePlayerBadge--manual' : 'scorePlayerBadge--auto',
      isDeclared ? 'is-declared' : 'is-undeclared'
    ].join(' ');

    const badgeAttrs = isManualDeclare
      ? 'type="button"'
      : '';

    article.innerHTML = `
      <div class="scorePlayerMain">
        <${badgeTag} class="${badgeClasses}" ${badgeAttrs}>
          <div class="scorePlayerBadgeName">
            <div class="scorePlayerBadgeLast">${lastName}</div>
            ${firstName && firstName !== lastName ? `<div class="scorePlayerBadgeFirst">${firstName}</div>` : ''}
          </div>
          <div class="scorePlayerBadgeStatus">${labelPrefix} ${netDisplay}</div>
        </${badgeTag}>

        <div class="scoreScoreBox">
          <div class="scoreRawControls">
            <button type="button" class="btn scoreAdjustBtn" data-dir="-1">−</button>
            <input
              type="number"
              class="maTextInput scoreRawInput"
              min="1"
              max="15"
              value="${row.rawScore ?? ''}">
            <button type="button" class="btn scoreAdjustBtn" data-dir="1">+</button>
          </div>
        </div>
      </div>

      <div class="scorePlayerMetaRow">
        <div class="scorePlayerDetail">
          <span class="scoreMetaToken">Tee ${teeSetName}</span>
          <span class="scoreMetaSep">•</span>
          <span class="scoreMetaToken">${yardage}yds</span>
          <span class="scoreMetaSep">•</span>
          <span class="scoreMetaToken">Par ${par}</span>
          <span class="scoreMetaSep">•</span>
          <span class="scoreMetaToken">HCP ${holeHcp}</span>
        </div>
      </div>`;

    bindRowEvents(article, wrapper, { isManualDeclare, isAutoDeclare });
    el.rows.appendChild(article);
  });
}

  function bindRowEvents(article, wrapper, options = {}) {
  const input = article.querySelector('.scoreRawInput');
  const badge = article.querySelector('.scorePlayerBadge');
  const playerId = wrapper.scoreEntryRow?.playerId;
  const strokeAllocation = Number(wrapper.scoreEntryRow?.strokeAllocation || 0);
  const isManualDeclare = !!options.isManualDeclare;

  article.querySelectorAll('.scoreAdjustBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = Number(btn.dataset.dir || 0);
      const par = Number(wrapper.scoreEntryRow?.par || 0);
      const rawText = String(input.value || '').trim();
      const hasCurrentValue = rawText !== '' && !Number.isNaN(Number(rawText));

      let next;
      if (!hasCurrentValue) {
        next = par > 0 ? par : 1;
      } else {
        next = Number(rawText) + dir;
      }

      next = Math.max(1, Math.min(15, next));
      input.value = String(next);
      markDirty(playerId, next, !!wrapper.scoreEntryRow?.declared);
    });
  });

  input?.addEventListener('change', () => {
    const rawText = String(input.value || '').trim();
    const raw = rawText === '' ? null : Number(rawText);
    markDirty(playerId, (raw === null || Number.isNaN(raw)) ? null : raw, !!wrapper.scoreEntryRow?.declared);
  });

  if (isManualDeclare && badge) {
    badge.addEventListener('click', () => {
      const rawText = String(input?.value || '').trim();
      const raw = rawText === '' ? null : Number(rawText);
      const nextDeclared = !wrapper.scoreEntryRow?.declared;
      markDirty(playerId, (raw === null || Number.isNaN(raw)) ? null : raw, nextDeclared);
    });
  }
}

function markDirty(playerId, rawScore, declared) {
  state.dirty = true;

  const wrapper = state.payload.players.find((p) => (p.scoreEntryRow?.playerId || '') === playerId);
  if (!wrapper) return;

    // Guard: If no score is entered, force declared to false
    const effectiveDeclared = (rawScore === null || rawScore === '' || Number.isNaN(Number(rawScore))) ? false : declared;

  wrapper.scoreEntryRow.rawScore = rawScore;
  wrapper.scoreEntryRow.netScore = (typeof rawScore === 'number')
    ? rawScore - Number(wrapper.scoreEntryRow.strokeAllocation || 0)
    : null;
    wrapper.scoreEntryRow.declared = effectiveDeclared;

    updateWorkingScoresJson(wrapper, rawScore, effectiveDeclared);

  const scoringSystem = state.payload?.gameRow?.dbGames_ScoringSystem;
  if (!['DeclareManual', 'DeclarePlayer'].includes(scoringSystem)) {
    resolveDeclaredScores();
    return;
  }

  renderRows();
}

  function updateWorkingScoresJson(wrapper, rawScore, declared) {
    if (!wrapper) return;

    const row = wrapper.scoreEntryRow || {};
    const holeNumber = Number(state.currentHole || row.holeNumber || 0);
    if (!holeNumber) return;

    if (!wrapper.scoresJson || !Array.isArray(wrapper.scoresJson.Scores) || !wrapper.scoresJson.Scores[0]) {
      wrapper.scoresJson = { Scores: [{}] };
    }

    const summary = wrapper.scoresJson.Scores[0];
    const holeDetails = Array.isArray(summary.hole_details) ? [...summary.hole_details] : [];

    const newHole = {
      adjusted_gross_score: rawScore,
      raw_score: rawScore,
      hole_number: holeNumber,
      par: row.par ?? null,
      stroke_allocation: row.strokeAllocation ?? 0,
      declared: declared === true
    };

    const idx = holeDetails.findIndex((h) => Number(h.hole_number) === holeNumber);

    if (rawScore === null || rawScore === '' || Number.isNaN(Number(rawScore))) {
      if (idx >= 0) holeDetails.splice(idx, 1);
    } else if (idx >= 0) {
      holeDetails[idx] = newHole;
    } else {
      holeDetails.push(newHole);
    }

    holeDetails.sort((a, b) => Number(a.hole_number || 0) - Number(b.hole_number || 0));

    summary.hole_details = holeDetails;
    summary.number_of_played_holes = holeDetails.length;

    const gross = holeDetails.reduce((sum, h) => sum + Number(h.raw_score || h.adjusted_gross_score || 0), 0);
    const net = holeDetails.reduce((sum, h) => sum + (Number(h.raw_score || h.adjusted_gross_score || 0) - Number(h.stroke_allocation || 0)), 0);

    summary.adjusted_gross_score = gross;
    summary.net_score = net;
    summary.edited = true;

    wrapper.scoresJson.Scores[0] = summary;
  }

  // ==========================================================================
  // 9. Dirty-State / Dialog Handling
  // ==========================================================================

  function openDirtyDialog() {
    return new Promise((resolve) => {
      if (!el.dirtyDialog?.showModal) {
        resolve(window.confirm('You have unsaved changes. Leave anyway?') ? 'discard' : 'cancel');
        return;
      }

      el.dirtyDialog.showModal();

      const handler = () => {
        el.dirtyDialog.removeEventListener('close', handler);
        resolve(el.dirtyDialog.returnValue || 'cancel');
      };

      el.dirtyDialog.addEventListener('close', handler);
    });
  }

  function clearDirty() {
    state.dirty = false;
  }

  // ==========================================================================
  // 10. Save / Persist
  // ==========================================================================

  function buildSaveRequest(nextHole) {
    const payload = deepClone(state.payload || {});
    payload.currentHole = Number(state.currentHole || 0);
    payload.nextHole = Number(nextHole || state.currentHole || 0);
    payload.scorerGHIN = String(state.scorerGHIN || '');

    return payload;
  }

  function patchReturnedScores(saveResult) {
    const updates = Array.isArray(saveResult?.players) ? saveResult.players : [];
    if (!state.payload || !Array.isArray(state.payload.players)) return;

    updates.forEach((updated) => {
      const ggid = String(updated.dbPlayers_GGID || '');
      const ghin = String(updated.dbPlayers_PlayerGHIN || '');
      const scoresJson = updated.dbPlayers_Scores || null;

      const wrapper = state.payload.players.find((p) => {
        const pr = p.playerRow || {};
        return String(pr.dbPlayers_GGID || '') === ggid
          && String(pr.dbPlayers_PlayerGHIN || '') === ghin;
      });

      if (!wrapper) return;

      wrapper.scoresJson = deepClone(scoresJson);
      wrapper.originalScoresJson = deepClone(scoresJson);
    });
  }

  async function saveScoresSilently(nextHole) {
    if (!state.payload) return { ok: true };

    if (!state.scorerGHIN) {
      return {
        ok: false,
        conflict: false,
        message: 'Please choose the scorekeeper before entering scores.'
      };
    }

    const res = await fetch(apiUrls.saveScores, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSaveRequest(nextHole))
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error('Non-JSON response from saveScores endpoint:', text);
      throw new Error('saveScores endpoint did not return JSON.');
    }

    return json;
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [
      {
        label: 'Restart Scoring Session',
        danger: true,
        action: async () => {
          if (window.confirm('Clear session and restart?')) {
            await fetch(apiUrls.clearContext);
            window.location.href = apiUrls.scoreHome;
          }
        }
      }
    ];

    MA.ui.openActionsMenu("Scoring Actions", items);
  }

  // ==========================================================================
  // 11. Chrome and Status Helpers
  // ==========================================================================

  function resetToLaunch(message) {
    state.payload = null;
    state.currentHole = 1;
    state.scorerGHIN = '';
    state.dirty = false;

    toggleLaunchPanel(true);
    el.contextCard?.classList.add('isHidden');
    if (el.contextCard) el.contextCard.style.cursor = 'default';
    el.cartCard?.classList.add('isHidden');
    el.keeperCard?.classList.add('isHidden');
    el.work?.classList.add('isHidden');

    if (el.keeperChips) el.keeperChips.innerHTML = '';
    if (el.keeperWelcome) el.keeperWelcome.textContent = '';
    if (el.rows) el.rows.innerHTML = '';
    if (el.holeSelect) el.holeSelect.innerHTML = '';

    applyChrome();
    setPageStatus(message || 'Returned to launch.', 'warn');
  }

  function setPageStatus(message, level){
    if (typeof MA.setStatus === 'function') {
      MA.setStatus(message || '', level || 'info');
    }
  }

  function applyChrome() {
    const payload = state.payload || {};
    const game = payload.gameRow || {};
    const ctx = payload.launchContext || {};

    const titleLine1 = 'Score Entry';
    const titleLine2 = String(game.dbGames_Title || '');
    const titleLine3 = [
      String(game.dbGames_CourseName || ''),
      String(ctx.playerKey || '')
    ].filter(Boolean).join(' • ');

    if (chrome && typeof chrome.setHeaderLines === 'function') {
      chrome.setHeaderLines([titleLine1, titleLine2, titleLine3]);
    }

    if (chrome && typeof chrome.setActions === 'function') {
      chrome.setActions({
        left: { show: !!state.payload, label: 'Actions', onClick: openActionsMenu },
        right: { show: false }
      });
    }

    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['home','scoreentry', 'scorecardPlayer', 'scorecardGroup', 'scorecardGame'],
        active: 'scoreentry',
        onNavigate: (id) => {
          if (!state.dirty) {
            if (typeof MA.routerGo === 'function') MA.routerGo(id);
            return;
          }

          openDirtyDialog().then(async (choice) => {
            if (choice === 'cancel') return;

            if (choice === 'discard') {
              state.dirty = false;
              if (typeof MA.routerGo === 'function') MA.routerGo(id);
              return;
            }

            if (choice === 'save') {
              try {
                const saveResult = await saveScoresSilently(state.currentHole);
                if (!saveResult.ok) {
                  if (saveResult.conflict) {
                    resetToLaunch(saveResult.message || 'Another scorer is already updating this scorecard.');
                    return;
                  }
                  setPageStatus(saveResult.message || 'Unable to save before leaving.', 'error');
                  return;
                }

                patchReturnedScores(saveResult);
                state.dirty = false;
                if (typeof MA.routerGo === 'function') MA.routerGo(id);
              } catch (err) {
                setPageStatus(err.message || 'Unable to save before leaving.', 'error');
              }
            }
          });
        }
      });
    }
  }

  // ==========================================================================
  // 12. Generic DOM / Utility Helpers
  // ==========================================================================

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  init();
  applyChrome();
})();