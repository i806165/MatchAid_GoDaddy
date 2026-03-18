/* /assets/pages/score_entry.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const boot = window.__MA_INIT__ || window.__INIT__ || {};
  const paths = (window.MA && window.MA.paths) ? window.MA.paths : {};
  const routes = (window.MA && window.MA.routes) ? window.MA.routes : {};
  const chrome = MA.chrome || {};

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
      const launchUrl = paths.apiScoreEntryLaunch
        || (routes.apiScoreEntry ? routes.apiScoreEntry + '/launch.php' : '/api/score_entry/launch.php');

      const res = await fetch(launchUrl, {
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
      state.currentHole = json.payload.currentHole || 1;
      state.dirty = false;

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

    renderHoleOptions();
    renderKeeperChips();
    toggleByState();
    renderRows();
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
      opt.textContent = `Hole ${h}`;
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

        el.keeperChips.querySelectorAll('.maChoiceChip').forEach((chip) => {
          chip.classList.remove('is-selected');
        });
        btn.classList.add('is-selected');

        el.keeperWelcome.textContent = `Welcome, ${row.playerName || ''}`;
        el.work.classList.remove('isHidden');
      });

      el.keeperChips.appendChild(btn);
    });
  }

  function toggleByState() {
    const payload = state.payload;
    if (!payload) return;

    el.cartCard.classList.toggle('isHidden', !payload.requiresCartConfig);
    el.keeperCard.classList.remove('isHidden');

    if (!payload.isGameDay) {
      el.work.classList.add('isHidden');
    }
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

      article.innerHTML = `
        <div class="scorePlayerRowTop">
          <div class="scorePlayerNameBlock">
            <div class="scorePlayerName">${escapeHtml(row.playerName || '')}<span class="scoreStrokeMark">${escapeHtml(row.strokeSuperscript || '')}</span></div>
            <div class="scorePlayerMeta">HC ${escapeHtml(String(row.effectiveHC ?? ''))}</div>
          </div>
          <div class="scoreRawControls">
            <button type="button" class="btn scoreAdjustBtn" data-dir="-1">−</button>
            <input type="number" class="maTextInput scoreRawInput" min="1" max="15" value="${row.rawScore ?? ''}">
            <button type="button" class="btn scoreAdjustBtn" data-dir="1">+</button>
          </div>
          <div class="scoreNetBox">
            <span class="scoreNetLabel">Net</span>
            <span class="scoreNetValue">${row.netScore ?? '—'}</span>
          </div>
        </div>
        <div class="scorePlayerRowBottom">
          <div class="scorePlayerDetail">${escapeHtml(row.teeSetName || '')} | Par ${row.par ?? '—'} | ${row.yardage ?? '—'} yds | HCP ${row.holeHcp ?? '—'}</div>
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
    const net = article.querySelector('.scoreNetValue');
    const declare = article.querySelector('.scoreDeclareCheck');
    const playerId = wrapper.scoreEntryRow?.playerId;
    const strokeAllocation = Number(wrapper.scoreEntryRow?.strokeAllocation || 0);

    article.querySelectorAll('.scoreAdjustBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.dir || 0);
        const current = Number(input.value || 0);
        const next = Math.max(1, Math.min(15, (current || 0) + dir));
        input.value = String(next);
        net.textContent = String(next - strokeAllocation);
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

  function markDirty(playerId, rawScore, declared) {
    state.dirty = true;

    const wrapper = state.payload.players.find((p) => (p.scoreEntryRow?.playerId || '') === playerId);
    if (!wrapper) return;

    wrapper.scoreEntryRow.rawScore = rawScore;
    wrapper.scoreEntryRow.netScore = (typeof rawScore === 'number')
      ? rawScore - Number(wrapper.scoreEntryRow.strokeAllocation || 0)
      : null;
    wrapper.scoreEntryRow.declared = declared;
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

    if (state.dirty) {
      const choice = await openDirtyDialog();
      if (choice === 'cancel') {
        el.holeSelect.value = String(state.currentHole);
        return;
      }
      if (choice === 'save') {
        setPageStatus('Save API wiring is pending in the next pass. Dirty state cleared for scaffold preview.', 'warn');
      }
      state.dirty = false;
    }

    state.currentHole = nextHole;
    el.holeSelect.value = String(nextHole);
    setPageStatus(`Moved to Hole ${nextHole}. Backend row rebuild wiring is next.`, 'info');
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
        right: { show: false }
      });
    }

    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['home'], //,'scoreentry', 'leaderboard', 'holechamps', 'scorecard'],
        active: 'scoreentry',
        onNavigate: (id) => {
          if (state.dirty) {
            openDirtyDialog().then((choice) => {
              if (choice !== 'cancel' && typeof MA.routerGo === 'function') {
                MA.routerGo(id);
              }
            });
            return;
          }
          if (typeof MA.routerGo === 'function') MA.routerGo(id);
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