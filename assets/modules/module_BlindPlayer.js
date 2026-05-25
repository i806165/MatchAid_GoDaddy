/* /assets/modules/module_BlindPlayer.js
   Blind Player — Selection & Apply Module.
   Scoring Portal only. Registered as MA.blindPlayer.

   Usage:
     MA.blindPlayer.open({
       gameRow,        // full game record from initScoreHome payload
       roster,         // full filtered game roster from initScoreHome payload
       pairingId,      // string — calling group's PairingID
       pairingLabel,   // string — display label e.g. "Pair 3"
       existingGHIN,   // string|null — GHIN from db_Scores if already applied
       apiBase,        // string — base URL e.g. "/api/game_settings"
       onApplied,      // function() — called after successful apply
     });

   States (derived from options, never stored as an explicit flag):
     - Pre-assigned: blindConfig.mode === "game"
       Single locked row, no search, no selectable list.
     - Rerun:        existingGHIN is not null (and not pre-assigned)
       Currently applied player locked at top; full selectable list below.
     - Open:         all other cases
       Full selectable list with search.

   Self-cleaning: removes overlay from DOM on close.
   Calling open() while a modal is already open replaces it.
*/

(function () {
  'use strict';

  const MA = window.MA || {};

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function parseBlindConfig(gameRow) {
    const raw = gameRow?.dbGames_BlindPlayers;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // Only the flat-object shape with a mode key is valid
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.mode) {
        return parsed;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // ── Score derivation ────────────────────────────────────────────────────────

  function deriveScoreSummary(player) {
    const scoresRaw = player.dbPlayers_Scores;
    if (!scoresRaw) return null;

    let scores;
    try {
      scores = typeof scoresRaw === 'string' ? JSON.parse(scoresRaw) : scoresRaw;
    } catch (e) { return null; }

    const summary = scores?.Scores?.[0];
    if (!summary) return null;

    const holeDetails   = Array.isArray(summary.hole_details) ? summary.hole_details : [];
    const holesPlayed   = (summary.number_of_played_holes ?? 0);
    const totalGross    = summary.adjusted_gross_score ?? 0;
    const netScore      = summary.net_score ?? 0;

    // Front / back splits from hole_details
    let front = 0, frontCount = 0, back = 0, backCount = 0;
    holeDetails.forEach(h => {
      const raw = h.raw_score ?? h.adjusted_gross_score ?? 0;
      if (h.hole_number <= 9) { front += raw; frontCount++; }
      else                    { back  += raw; backCount++;  }
    });

    // Net-to-par: net_score is already summed gross minus stroke allocations.
    // We need the par total for holes actually played.
    let parTotal = 0;
    holeDetails.forEach(h => { parTotal += (h.par ?? 0); });
    const netToPar = holesPlayed > 0 ? (netScore - parTotal) : null;

    return {
      holesPlayed,
      front:     frontCount  > 0 ? front  : null,
      back:      backCount   > 0 ? back   : null,
      total:     holesPlayed > 0 ? totalGross : null,
      netToPar,
    };
  }

  function formatNetToPar(netToPar) {
    if (netToPar === null) return { text: '', cls: '' };
    if (netToPar < 0)  return { text: `${netToPar} net`, cls: 'bpm-net--under' };
    if (netToPar > 0)  return { text: `+${netToPar} net`, cls: 'bpm-net--over'  };
    return { text: 'E net', cls: '' };
  }

  // ── Row rendering ───────────────────────────────────────────────────────────

  function buildPlayerRow(player, opts = {}) {
    const { locked = false, lockedBadge = '', selectable = true } = opts;

    const name      = esc(String(player.dbPlayers_Name    ?? '').trim());
    const teamKey   = String(player.dbPlayers_TeamKey     ?? '').trim();
    const hi        = String(player.dbPlayers_HI          ?? '').trim();
    const ch        = String(player.dbPlayers_CH          ?? '').trim();
    const ph        = String(player.dbPlayers_PH          ?? '').trim();
    const so        = String(player.dbPlayers_SO          ?? '').trim();
    const startHole = String(player.dbPlayers_StartHole   ?? '').trim();
    const ghin      = String(player.dbPlayers_PlayerGHIN  ?? '').trim();

    const summary   = deriveScoreSummary(player);
    const hasScores = summary !== null && summary.holesPlayed > 0;
    const isSelectable = selectable && !locked && hasScores;

    // Name line — team badge inline
    const teamBadge = teamKey
      ? `<span class="bpm-team-badge">${esc(teamKey)}</span>`
      : '';

    // Handicap line
    const hcLine = `HI ${esc(hi)} · CH ${esc(ch)} · PH ${esc(ph)} · SO ${esc(so)}`;

    // Score line
    let scoreLine;
    if (!hasScores) {
      const thru = startHole ? `Start ${esc(startHole)} · Thru —` : 'Thru —';
      scoreLine = `<span class="bpm-no-score">No score recorded</span> · ${thru}`;
    } else {
      const f    = summary.front  !== null ? summary.front  : '—';
      const b    = summary.back   !== null ? summary.back   : '—';
      const tot  = summary.total  !== null ? summary.total  : '—';
      const thru = startHole
        ? `Start ${esc(startHole)} · Thru ${summary.holesPlayed}`
        : `Thru ${summary.holesPlayed}`;
      const net  = formatNetToPar(summary.netToPar);
      const netSpan = net.text
        ? `<span class="${esc(net.cls)}">${esc(net.text)}</span>`
        : '';
      scoreLine = `F ${f} · B ${b} · ${tot} gross${netSpan ? ' · ' + netSpan : ''} · ${thru}`;
    }

    // Check widget
    const checkHtml = locked
      ? `<div class="bpm-check bpm-check--on" aria-hidden="true">&#x2713;</div>`
      : isSelectable
        ? `<div class="bpm-check" aria-hidden="true"></div>`
        : `<div class="bpm-check bpm-check--disabled" aria-hidden="true"></div>`;

    // Lock badge
    const badgeHtml = lockedBadge
      ? `<span class="bpm-lock-badge">${esc(lockedBadge)}</span>`
      : '';

    const rowClasses = [
      'maListRow',
      'bpm-row',
      locked        ? 'bpm-row--locked'      : '',
      isSelectable  ? 'bpm-row--selectable'  : '',
      !isSelectable && !locked ? 'bpm-row--disabled' : '',
    ].filter(Boolean).join(' ');

    // data-name used for search filtering (last-name-first format)
    const dataName = (String(player.dbPlayers_LName ?? '') + ' ' + String(player.dbPlayers_Name ?? '')).toLowerCase();

    return `
      <div class="${rowClasses}"
           data-ghin="${esc(ghin)}"
           data-name="${esc(dataName)}"
           role="${isSelectable ? 'button' : 'presentation'}"
           tabindex="${isSelectable ? '0' : '-1'}"
           aria-disabled="${isSelectable ? 'false' : 'true'}">
        <div class="bpm-row__body">
          <div class="bpm-row__line1">
            <span class="bpm-row__name">${name}</span>${teamBadge}
          </div>
          <div class="bpm-row__line2">${hcLine}</div>
          <div class="bpm-row__line3">${scoreLine}</div>
        </div>
        ${badgeHtml}
        ${checkHtml}
      </div>`;
  }

  // ── Modal HTML builders ─────────────────────────────────────────────────────

  function buildPreAssignedModal(opts, blindConfig) {
    const player = opts.roster.find(p =>
      String(p.dbPlayers_PlayerGHIN ?? '') === String(blindConfig.ghin ?? '')
    ) || null;

    const rowHtml = player
      ? buildPlayerRow(player, { locked: true, lockedBadge: 'Game default', selectable: false })
      : `<div class="bpm-empty">Assigned player (${esc(blindConfig.ghin)}) not found in roster.</div>`;

    return `
      <header class="maModal__hdr">
        <div>
          <div class="maModal__title">Blind player</div>
          <div class="maModal__subtitle">${esc(opts.pairingLabel)} · game admin assigned</div>
        </div>
        <button type="button" class="maModal__close bpm-close" aria-label="Close">&#x2715;</button>
      </header>
      <div class="maModal__body bpm-body">
        ${rowHtml}
      </div>
      <footer class="maModal__ftr">
        <div class="bpm-status" aria-live="polite"></div>
        <div class="bpm-ftr-btns">
          <button type="button" class="btn btnPrimary bpm-cancel">Cancel</button>
          <button type="button" class="btn btnSecondary bpm-confirm">Apply</button>
        </div>
      </footer>`;
  }

  function buildSelectModal(opts, lockedPlayer, lockedBadge) {
    const subtitle = lockedPlayer
      ? `${esc(opts.pairingLabel)} · previously applied`
      : `${esc(opts.pairingLabel)} · select from roster`;

    const lockedSection = lockedPlayer
      ? `<div class="bpm-section-lbl">Currently applied</div>
         ${buildPlayerRow(lockedPlayer, { locked: true, lockedBadge, selectable: false })}
         <div class="bpm-section-lbl">Change to a different player</div>`
      : '';

    const selectableRows = opts.roster
      .filter(p => !lockedPlayer || String(p.dbPlayers_PlayerGHIN ?? '') !== String(lockedPlayer.dbPlayers_PlayerGHIN ?? ''))
      .map(p => buildPlayerRow(p, { selectable: true }))
      .join('');

    return `
      <header class="maModal__hdr">
        <div>
          <div class="maModal__title">Blind player</div>
          <div class="maModal__subtitle">${subtitle}</div>
        </div>
        <button type="button" class="maModal__close bpm-close" aria-label="Close">&#x2715;</button>
      </header>
      <div class="maModal__controls">
        <input type="text"
               class="bpm-search"
               placeholder="Search name…"
               aria-label="Search players"
               autocomplete="off" />
      </div>
      <div class="maModal__body bpm-body" id="bpmBody">
        ${lockedSection}
        <div class="bpm-list" id="bpmList">
          ${selectableRows}
        </div>
        <div class="bpm-empty bpm-search-empty" style="display:none">No players match.</div>
      </div>
      <footer class="maModal__ftr">
        <div class="bpm-status" aria-live="polite"></div>
        <div class="bpm-ftr-btns">
          <button type="button" class="btn btnPrimary bpm-cancel">Cancel</button>
          <button type="button" class="btn btnSecondary bpm-confirm" disabled>Apply</button>
        </div>
      </footer>`;
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const STYLES = `
    .bpm-row {
      display: flex; align-items: center;
      padding: 11px 14px;
      border-bottom: 1px solid rgba(0,0,0,.08);
      gap: 12px;
      -webkit-tap-highlight-color: transparent;
    }
    .bpm-row:last-child { border-bottom: none; }
    .bpm-row--selectable { cursor: pointer; }
    .bpm-row--selectable:active { background: rgba(0,0,0,.04); }
    .bpm-row--locked { background: rgba(7,67,42,.05); cursor: default; }
    .bpm-row--disabled { cursor: default; opacity: .55; }
    .bpm-row.is-selected { background: rgba(63,118,82,.08); }

    .bpm-row__body { flex: 1; min-width: 0; }
    .bpm-row__line1 {
      display: flex; align-items: center; gap: 7px;
      flex-wrap: wrap; margin-bottom: 3px;
    }
    .bpm-row__name { font-size: 15px; font-weight: 900; color: #111; }
    .bpm-row__line2 { font-size: 12px; font-weight: 700; color: #3a3a3a; margin-bottom: 2px; }
    .bpm-row__line3 { font-size: 12px; font-weight: 700; color: #3a3a3a; }

    .bpm-team-badge {
      font-size: 10px; font-weight: 900;
      padding: 2px 8px; border-radius: 20px;
      background: #07432A; color: #fff;
      white-space: nowrap; letter-spacing: .2px;
    }
    .bpm-net--under { color: #076b3c; font-weight: 900; }
    .bpm-net--over  { color: #991f1f; font-weight: 900; }
    .bpm-no-score   { color: #888; }

    .bpm-check {
      width: 24px; height: 24px; border-radius: 7px;
      border: 1.5px solid rgba(0,0,0,.18);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900; color: #3a3a3a;
      flex-shrink: 0; background: #fff;
    }
    .bpm-check--on       { background: #3F7652; border-color: #3F7652; color: #fff; }
    .bpm-check--disabled { background: #f0f0f0; border-color: rgba(0,0,0,.10); color: transparent; }

    .bpm-lock-badge {
      font-size: 10px; font-weight: 900;
      background: rgba(7,67,42,.12); color: #07432A;
      padding: 2px 7px; border-radius: 8px;
      white-space: nowrap; flex-shrink: 0; align-self: flex-start; margin-top: 2px;
    }

    .bpm-section-lbl {
      font-size: 10px; font-weight: 900; letter-spacing: .6px;
      color: #555; padding: 7px 14px 5px;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(0,0,0,.08);
      background: #f8f8f5;
      position: sticky; top: 0; z-index: 1;
    }

    .bpm-search {
      width: 100%; padding: 9px 12px;
      border-radius: 10px; border: 1.5px solid rgba(0,0,0,.18);
      font-family: inherit; font-size: 16px; font-weight: 700;
      color: #111; background: #fff; outline: none; box-sizing: border-box;
    }
    .bpm-search::placeholder { color: #999; font-weight: 600; font-size: 15px; }

    .bpm-body { padding: 0; }

    .bpm-status {
      font-size: 12px; font-weight: 800;
      color: #c62828; min-height: 16px;
      flex: 1; padding-right: 8px;
    }

    .bpm-ftr-btns { display: flex; gap: 10px; flex-shrink: 0; }
    .maModal__ftr { flex-wrap: wrap; align-items: center; }

    .bpm-empty {
      padding: 20px 14px; text-align: center;
      color: #888; font-size: 13px; font-weight: 800;
    }

    .bpm-list > .bpm-row:last-child { border-bottom: none; }
  `;

  // ── Core open() ─────────────────────────────────────────────────────────────

  function open(opts) {
    // Validate required options
    if (!opts || !opts.gameRow || !Array.isArray(opts.roster)) {
      console.error('MA.blindPlayer.open: missing required options (gameRow, roster).');
      return;
    }

    // Remove any existing instance
    const existing = document.getElementById('maBlindPlayerOverlay');
    if (existing) existing.remove();

    const blindConfig = parseBlindConfig(opts.gameRow);
    if (!blindConfig) {
      console.warn('MA.blindPlayer.open: no blind config found on game record.');
      return;
    }

    const isPreAssigned = (blindConfig.mode === 'game');
    const existingGHIN  = opts.existingGHIN || null;

    // Inject styles once
    if (!document.getElementById('bpmStyles')) {
      const style = document.createElement('style');
      style.id = 'bpmStyles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    // Build overlay
    const overlay = document.createElement('div');
    overlay.className = 'maModalOverlay is-open';
    overlay.id        = 'maBlindPlayerOverlay';
    overlay.setAttribute('role',       'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Blind player — ${opts.pairingLabel || ''}`);

    const modal = document.createElement('section');
    modal.className = 'maModal';

    if (isPreAssigned) {
      modal.innerHTML = buildPreAssignedModal(opts, blindConfig);
    } else {
      // Rerun: existing GHIN found in db_Scores for this pairing
      const lockedPlayer = existingGHIN
        ? (opts.roster.find(p => String(p.dbPlayers_PlayerGHIN ?? '') === existingGHIN) || null)
        : null;
      const lockedBadge = lockedPlayer ? 'Applied' : '';
      modal.innerHTML = buildSelectModal(opts, lockedPlayer, lockedBadge);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.classList.add('maOverlayOpen');

    // ── Wire interactions ──────────────────────────────────────────────────

    let selectedGHIN = isPreAssigned ? (blindConfig.ghin || null) : null;
    const confirmBtn = modal.querySelector('.bpm-confirm');
    const statusEl   = modal.querySelector('.bpm-status');

    function setStatus(msg, isError = true) {
      if (!statusEl) return;
      statusEl.textContent  = msg;
      statusEl.style.color  = isError ? '#c62828' : '#076b3c';
    }

    function closeModal() {
      overlay.remove();
      document.body.classList.remove('maOverlayOpen');
      document.removeEventListener('keydown', onEsc);
    }

    // Close triggers
    modal.querySelector('.bpm-close')?.addEventListener('click', closeModal);
    modal.querySelector('.bpm-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function onEsc(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onEsc);

    // Search (select / rerun states only)
    const searchInput = modal.querySelector('.bpm-search');
    const listEl      = modal.querySelector('#bpmList');
    const emptyEl     = modal.querySelector('.bpm-search-empty');

    if (searchInput && listEl) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        let visible = 0;
        listEl.querySelectorAll('.bpm-row').forEach(row => {
          const name = (row.dataset.name || '').toLowerCase();
          const show = !q || name.includes(q);
          row.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        if (emptyEl) emptyEl.style.display = visible === 0 ? '' : 'none';
      });

      // Auto-focus search on open
      setTimeout(() => searchInput.focus(), 80);
    }

    // Row selection (selectable rows only)
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const row = e.target.closest('.bpm-row--selectable');
        if (!row) return;
        const ghin = row.dataset.ghin || '';
        if (!ghin) return;

        // Deselect all in list
        listEl.querySelectorAll('.bpm-row').forEach(r => {
          r.classList.remove('is-selected');
          const chk = r.querySelector('.bpm-check:not(.bpm-check--on):not(.bpm-check--disabled)');
          if (chk) { chk.classList.remove('bpm-check--on'); chk.textContent = ''; }
        });

        // Select tapped row
        row.classList.add('is-selected');
        const chk = row.querySelector('.bpm-check');
        if (chk) { chk.classList.add('bpm-check--on'); chk.textContent = '✓'; }

        selectedGHIN = ghin;
        if (confirmBtn) confirmBtn.disabled = false;
        setStatus('');
      });

      // Keyboard support for selectable rows
      listEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const row = e.target.closest('.bpm-row--selectable');
          if (row) { e.preventDefault(); row.click(); }
        }
      });
    }

    // Confirm / Apply
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (!selectedGHIN && !isPreAssigned) {
          setStatus('Please select a player.');
          return;
        }

        confirmBtn.disabled  = true;
        confirmBtn.textContent = 'Applying…';
        setStatus('');

        try {
          const apiUrl = `${String(opts.apiBase || '').replace(/\/$/, '')}/applyBlindPlayer.php`;
          const body   = { pairingId: opts.pairingId };

          // Pre-assigned: send no GHIN — server uses game record.
          // Group mode: send the scorer's selection.
          if (!isPreAssigned && selectedGHIN) {
            body.ghin = selectedGHIN;
          }

          const postJson = (typeof MA.postJson === 'function')
            ? MA.postJson
            : async (url, data) => {
                const res = await fetch(url, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify(data),
                });
                return res.json();
              };

          const res = await postJson(apiUrl, body);

          if (!res?.ok) {
            setStatus(res?.message || 'Apply failed. Please try again.');
            confirmBtn.disabled    = false;
            confirmBtn.textContent = 'Apply';
            return;
          }

          // Success — close and notify caller
          closeModal();
          if (typeof opts.onApplied === 'function') opts.onApplied(selectedGHIN);

        } catch (err) {
          setStatus('A network error occurred. Please try again.');
          confirmBtn.disabled    = false;
          confirmBtn.textContent = 'Apply';
        }
      });
    }
  }

  // ── Register ────────────────────────────────────────────────────────────────

  MA.blindPlayer = { open };
  window.MA = MA;

})();
