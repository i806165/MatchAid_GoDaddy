/* /assets/pages/score_entry.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const boot = window.__MA_INIT__ || window.__INIT__ || {};
  const paths = (window.MA && window.MA.paths) ? window.MA.paths : {};
  const routes = (window.MA && window.MA.routes) ? window.MA.routes : {};
  const chrome = MA.chrome || {};
  
  const apiUrls = {
  launch: paths.apiScoreEntryLaunch
    || (routes.apiScoreEntry ? routes.apiScoreEntry + '/launch.php' : '/api/score_entry/launch.php'),
  saveScores: paths.apiScoreEntrySaveScores
    || (routes.apiScoreEntry ? routes.apiScoreEntry + '/saveScores.php' : '/api/score_entry/saveScores.php')
};

  const state = {
    payload: null,
    currentHole: 1,
    scorerGHIN: '',
    dirty: false,
  };

  const el = {
    playerKey: document.getElementById('scoreEntryPlayerKey'),
    launchBtn: document.getElementById('scoreEntryLaunchBtn'),
    status: document.getElementById('scoreEntryStatus'),
    contextCard: document.getElementById('scoreContextCard'),
    cartCard: document.getElementById('scoreCartCard'),
    cartNextBtn: document.getElementById('scoreCartNextBtn'),
    keeperCard: document.getElementById('scoreKeeperCard'),
    keeperChips: document.getElementById('scoreKeeperChips'),
    keeperWelcome: document.getElementById('scoreKeeperWelcome'),
    work: document.getElementById('scoreEntryWork'),
    holeSelect: document.getElementById('scoreHoleSelect'),
    prevHoleBtn: document.getElementById('scorePrevHoleBtn'),
    nextHoleBtn: document.getElementById('scoreNextHoleBtn'),
    rows: document.getElementById('scoreRowsContainer'),
    dirtyDialog: document.getElementById('scoreDirtyDialog'),
    ctx: {
      gameTitle: document.getElementById('ctxGameTitle'),
      courseName: document.getElementById('ctxCourseName'),
      playerKey: document.getElementById('ctxPlayerKey'),
      teeTime: document.getElementById('ctxTeeTime'),
      flightId: document.getElementById('ctxFlightId'),
      pairingId: document.getElementById('ctxPairingId')
    }
  };

  function init() {
    if (boot.scorecardKey && el.playerKey) {
      el.playerKey.value = boot.scorecardKey;
    }

    // Ensure Cart 'Next' button exists for the linear flow
    if (!el.cartNextBtn && el.cartCard) {
      const div = document.createElement('div');
      div.className = 'maFieldRow';
      div.style.justifyContent = 'flex-end';
      div.style.marginTop = '16px';
      div.innerHTML = '<button id="scoreCartNextBtn" class="btn btnPrimary" type="button">Next</button>';
      el.cartCard.appendChild(div);
      el.cartNextBtn = div.querySelector('button');
    }

    el.cartNextBtn?.addEventListener('click', showKeeperSelection);
    el.launchBtn?.addEventListener('click', launch);
    el.prevHoleBtn?.addEventListener('click', () => moveHole(-1));
    el.nextHoleBtn?.addEventListener('click', () => moveHole(1));

    el.holeSelect?.addEventListener('change', async (e) => {
      const nextHole = parseInt(e.target.value, 10);
      if (Number.isInteger(nextHole)) {
        await transitionHole(nextHole);
      }
    });
  }

  async function launch() {
    setPageStatus('Launching score entry…', 'info');

    const playerKey = (el.playerKey?.value || '').replace(/\s+/g, '').toUpperCase();
    if (!playerKey) {
      setPageStatus('Please enter a ScoreCard ID.', 'warn');
      return;
    }

    try {
//      const launchUrl = paths.apiScoreEntryLaunch
//        || (routes.apiScoreEntry ? routes.apiScoreEntry + '/launch.php' : '/api/score_entry/launch.php');

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

      toggleLaunchPanel(false);
      renderLaunchPayload();
      applyChrome();

      setPageStatus(
        state.payload.isGameDay
          ? 'Ready for score collection.'
          : 'Score entry is only available on the day of play.',
        state.payload.isGameDay ? 'ok' : 'warn'
      );
    } catch (err) {
      setPageStatus(err.message || 'Launch failed.', 'error');
    }
  }

  function toggleLaunchPanel(show) {
    const panel = document.getElementById('scoreEntryLaunchPanel')
      || el.playerKey?.closest('.card')
      || el.playerKey?.closest('.maCard');

    if (panel) {
      panel.classList.toggle('isHidden', !show);
    } else {
      el.playerKey?.parentElement?.classList.toggle('isHidden', !show);
    }
  }

  function renderLaunchPayload() {
    const payload = state.payload;
    if (!payload) return;

    const first = payload.players?.[0]?.playerRow || {};

    el.ctx.gameTitle.textContent = payload.gameRow?.dbGames_Title || '';
    el.ctx.courseName.textContent = payload.gameRow?.dbGames_CourseName || '';
    el.ctx.playerKey.textContent = first.dbPlayers_PlayerKey || '';
    el.ctx.teeTime.textContent = first.dbPlayers_TeeTime || '';
    el.ctx.flightId.textContent = first.dbPlayers_FlightID || '';
    el.ctx.pairingId.textContent = first.dbPlayers_PairingID || '';

    el.contextCard.classList.remove('isHidden');
    el.contextCard.style.cursor = 'default'; // Reset if previously set

    renderHoleOptions();
    renderKeeperChips();
    renderRows();

    // Linear Flow: Cart Setup -> Keeper Selection -> Scoring
    if (payload.requiresCartConfig) {
      el.cartCard.classList.remove('isHidden');
      el.keeperCard.classList.add('isHidden');
    } else {
      showKeeperSelection();
    }
    
    el.work.classList.add('isHidden');
  }

  function showKeeperSelection() {
    el.cartCard.classList.add('isHidden');
    el.keeperCard.classList.remove('isHidden');
  }

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

  function renderKeeperChips() {
    const payload = state.payload;
    el.keeperChips.innerHTML = '';

    (payload.players || []).forEach((p) => {
      const row = p.scoreEntryRow || {};
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'maChoiceChip';
      btn.textContent = row.playerName || '';

      btn.addEventListener('click', () => {
        state.scorerGHIN = row.playerGHIN || '';

        // Transition to Scoring: Hide Setup (Context + Keeper), Show Work
        el.contextCard.classList.add('isHidden'); // Pane-1b
        el.keeperCard.classList.add('isHidden');  // Pane-4
        el.cartCard.classList.add('isHidden');    // Ensure hidden
        el.work.classList.remove('isHidden');
      });

      el.keeperChips.appendChild(btn);
    });
  }

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
      const firstName = escapeHtml(nameParts[0] || '');
      const lastName = escapeHtml(nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
      const effectiveHC = escapeHtml(String(row.effectiveHC ?? ''));
      const teeSetName = escapeHtml(row.teeSetName || '');
      const yardage = escapeHtml(String(row.yardage ?? '—'));
      const par = escapeHtml(String(row.par ?? '—'));
      const holeHcp = escapeHtml(String(row.holeHcp ?? '—'));
      const playerStrokes = escapeHtml(String(row.strokeAllocation ?? '0'));
      const netScore = escapeHtml(String(row.netScore ?? '—'));

      article.innerHTML = `
        <div class="scorePlayerLaneTop">
          <div class="scorePlayerIdentity">
            <div class="scorePlayerFirstName">${firstName}</div>
            <div class="scorePlayerLastName">${lastName} <span class="scorePlayerHandicap">(${effectiveHC})</span></div>
          </div>

          <div class="scoreScoreBox">
            <div class="scoreRawControls">
              <button type="button" class="btn scoreAdjustBtn" data-dir="-1" aria-label="Decrease score for ${escapeHtml(fullName)}">−</button>
              <input
                type="number"
                class="maTextInput scoreRawInput"
                min="1"
                max="15"
                value="${row.rawScore ?? ''}"
                aria-label="Raw score for ${escapeHtml(fullName)}">
              <button type="button" class="btn scoreAdjustBtn" data-dir="1" aria-label="Increase score for ${escapeHtml(fullName)}">+</button>
            </div>
          </div>
        </div>

        <div class="scorePlayerLaneMeta">
          <div class="scorePlayerDetail">
            <span class="scoreMetaToken scoreMetaTokenTee">${teeSetName}</span>
            <span class="scoreMetaSep">•</span>
            <span class="scoreMetaToken">${yardage}</span>
            <span class="scoreMetaSep">•</span>
            <span class="scoreMetaToken">P${par}</span>
            <span class="scoreMetaSep">•</span>
            <span class="scoreMetaToken">HCP ${holeHcp}</span>
            <span class="scoreMetaSep">•</span>
            <span class="scoreMetaToken scoreMetaTokenStroke">${playerStrokes}</span>
            <span class="scoreMetaSep">•</span>
            <span class="scoreMetaToken scoreMetaTokenNet">N${netScore}</span>
          </div>

          <label class="scoreDeclareWrap ${state.payload?.gameRow?.dbGames_ScoringSystem === 'DeclarePlayer' ? '' : 'isHidden'}">
            <input type="checkbox" class="scoreDeclareCheck" ${row.declared ? 'checked' : ''}> Declare
          </label>
        </div>`;

      bindRowEvents(article, wrapper);
      el.rows.appendChild(article);
    });
  }

  function bindRowEvents(article, wrapper) {
    const input = article.querySelector('.scoreRawInput');
    const net = article.querySelector('.scoreMetaTokenNet');
    const declare = article.querySelector('.scoreDeclareCheck');
    const playerId = wrapper.scoreEntryRow?.playerId;
    const strokeAllocation = Number(wrapper.scoreEntryRow?.strokeAllocation || 0);

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
        net.textContent = raw ? `N${String(raw - strokeAllocation)}` : 'N—';
        markDirty(playerId, next, !!declare?.checked);
      });
    });

    input?.addEventListener('change', () => {
      const raw = Number(input.value || 0);
      net.textContent = raw ? String(raw - strokeAllocation) : '—';
      markDirty(playerId, raw || null, !!declare?.checked);
    });

    declare?.addEventListener('change', () => {
      const raw = Number(input.value || 0);
      markDirty(playerId, raw || null, !!declare.checked);
    });
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

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function markDirty(playerId, rawScore, declared) {
    state.dirty = true;

    const wrapper = state.payload.players.find((p) => (p.scoreEntryRow?.playerId || '') === playerId);
    if (!wrapper) return;

    wrapper.scoreEntryRow.rawScore = rawScore;
    wrapper.scoreEntryRow.netScore = (typeof rawScore === 'number')
      ? rawScore - Number(wrapper.scoreEntryRow.strokeAllocation || 0)
      : null;
    wrapper.scoreEntryRow.declared = declared;

    updateWorkingScoresJson(wrapper, rawScore, declared);
  }

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
            resetToLaunch(saveResult.message || 'Another scorer is already updating this scorecard. Your current hole entries were not saved.');
            return;
          }
          setPageStatus(saveResult.message || 'Unable to save scores.', 'error');
          el.holeSelect.value = String(state.currentHole);
          return;
        }

        patchReturnedScores(saveResult);
        state.dirty = false;
      }

      // Reload payload for the new hole so Par/Yardage/HCP update correctly
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

      state.currentHole = nextHole;
      renderHoleOptions();
      renderRows();
      setPageStatus(`Moved to Hole ${nextHole}.`, 'info');
    } catch (err) {
      setPageStatus(err.message || 'Unable to change holes.', 'error');
      el.holeSelect.value = String(state.currentHole);
    }
  }

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

  function setPageStatus(message, level) {
    if (!el.status) return;
    el.status.textContent = message || '';
    el.status.dataset.level = level || 'info';
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
        left: { show: false },
        right: { show: !!state.payload, label: 'Start Over', onClick: () => {
          if (window.confirm('Exit score entry?')) resetToLaunch('Session ended.');
        }}
      });
    }

    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['home','scoreentry'], //, 'leaderboard', 'holechamps', 'scorecard'],
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