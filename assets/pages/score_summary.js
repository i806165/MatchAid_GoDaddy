/* /assets/pages/score_summary.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.summary || {};
  const game = init.game || {};

  const state = {
    valueMode: String(payload.meta?.defaultValueMode || 'net')
  };

  const dom = {
    controls: document.getElementById('ssControls'),
    host: document.getElementById('ssHost'),
    empty: document.getElementById('ssEmpty'),
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function formatDate(s) {
    if (!s) return '';
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(...s.split('-').map((n, i) => i === 1 ? n - 1 : n))
      : new Date(s);

    if (isNaN(d.getTime())) return String(s);

    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);

    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function rows() {
    return Array.isArray(payload.rows) ? payload.rows : [];
  }

  function formatThru(thru) {
    const n = Number(thru || 0);
    return n > 0 ? String(n) : '—';
  }

  function currentMetricLabel() {
    return state.valueMode === 'gross' ? 'Gross +/-' : 'Net +/-';
  }

  function currentMetricValue(row, side) {
    if (side) {
      return state.valueMode === 'gross'
        ? (row?.[side]?.grossDiffDisplay ?? '—')
        : (row?.[side]?.netDiffDisplay ?? '—');
    }

    return state.valueMode === 'gross'
      ? (row?.grossDiffDisplay ?? '—')
      : (row?.netDiffDisplay ?? '—');
  }

  function applyChrome() {
    const subtitle = init.header?.subtitle || [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');

    if (chrome.setHeaderLines) {
      chrome.setHeaderLines(['Score Summary', init.header?.title || 'Standings', subtitle]);
    }

    if (chrome.setActions) {
      chrome.setActions({
        left: { show: false },
        right: { show: false }
      });
    }

    if (chrome.setBottomNav) {
      const portal = init.portal || '';
      const homeRoute =
        portal === 'ADMIN PORTAL' ? 'admin' :
        portal === 'PLAYER PORTAL' ? 'player' : 'home';

      chrome.setBottomNav({
        visible: [homeRoute, 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoresummary', 'scoreskins'],
        active: 'scoresummary',
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function renderControls() {
    if (!dom.controls) return;

    const modes = [
      ['gross', 'Gross'],
      ['net', 'Net']
    ];

    dom.controls.innerHTML = `
      <div class="scBrowserControls">
        <div class="scBrowserControls__group">
          ${modes.map(([key, label]) =>
            `<button class="scCtlBtn ${state.valueMode === key ? 'is-active' : ''}" type="button" data-mode="${key}">${label}</button>`
          ).join('')}
        </div>
        <div class="scPageSummary">
          <span>${esc(init.header?.title || 'Score Summary')}</span>
          <span>${esc(game.dbGames_GameFormat || '')} ${esc(game.dbGames_ScoringMethod || '')}</span>
        </div>
      </div>
    `;

    dom.controls.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.valueMode = btn.dataset.mode;
        renderControls();
        renderBody();
      });
    });
  }

  function renderPairFieldTable(dataRows) {
    return `
      <div class="ssDesktopBoard">
        <table class="ssTable" role="table" aria-label="PairField standings">
          <thead>
            <tr>
              <th>Pairing</th>
              <th>#Scores</th>
              <th>${currentMetricLabel()}</th>
              <th>Thru</th>
            </tr>
          </thead>
          <tbody>
            ${dataRows.map((row) => `
              <tr>
                <td class="ssCellStrong">${esc(row.pairingLabel)}</td>
                <td>${esc(row.scoreCount)}</td>
                <td>${esc(currentMetricValue(row))}</td>
                <td>${esc(formatThru(row.thru))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPairFieldCards(dataRows) {
    return `
      <div class="ssMobileCards">
        ${dataRows.map((row) => `
          <section class="maCard ssMiniCard" aria-label="${esc(row.pairingLabel)}">
            <div class="maCard__hdr">
              <div class="maCard__title">${esc(row.pairingLabel)}</div>
              <div class="ssThruPill">Thru ${esc(formatThru(row.thru))}</div>
            </div>
            <div class="maCard__body ssMiniCard__body">
              <div class="ssMiniMetric">
                <span class="ssMiniMetric__label">#Scores</span>
                <span class="ssMiniMetric__value">${esc(row.scoreCount)}</span>
              </div>
              <div class="ssMiniMetric">
                <span class="ssMiniMetric__label">${currentMetricLabel()}</span>
                <span class="ssMiniMetric__value">${esc(currentMetricValue(row))}</span>
              </div>
            </div>
          </section>
        `).join('')}
      </div>
    `;
  }

  function renderPairPairTable(dataRows) {
    return `
      <div class="ssDesktopBoard">
        <table class="ssTable ssTable--pairpair" role="table" aria-label="PairPair standings">
          <thead>
            <tr>
              <th>#Scores</th>
              <th>${currentMetricLabel()}</th>
              <th>Pairing</th>
              <th>#Scores</th>
              <th>${currentMetricLabel()}</th>
              <th>Thru</th>
            </tr>
          </thead>
          <tbody>
            ${dataRows.map((row) => `
              <tr>
                <td>${esc(row.left.scoreCount)}</td>
                <td class="${pairPairLeaderClass(row, 'left')}">${esc(currentMetricValue(row, 'left'))}</td>
                <td class="ssCellStrong ssMatchCell">
                  <div class="ssMatchCell__top">${esc(row.matchLabelTop || '')}</div>
                  <div class="ssMatchCell__bottom">${esc(row.matchLabelBottom || '')}</div>
                </td>
                <td>${esc(row.right.scoreCount)}</td>
                <td class="${pairPairLeaderClass(row, 'right')}">${esc(currentMetricValue(row, 'right'))}</td>
                <td>${esc(formatThru(row.thru))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPairPairCards(dataRows) {
    return `
      <div class="ssMobileCards">
        ${dataRows.map((row) => `
          <section class="maCard ssMiniCard" aria-label="${esc(row.matchLabel || 'Matchup')}">
            <div class="maCard__hdr">
              <div class="maCard__title ssMatchCardTitle">
                <div class="ssMatchCell__top">${esc(row.matchLabelTop || '')}</div>
                <div class="ssMatchCell__bottom">${esc(row.matchLabelBottom || '')}</div>
              </div>
              <div class="ssThruPill">Thru ${esc(formatThru(row.thru))}</div>
            </div>
            <div class="maCard__body ssMiniCard__body ssMiniCard__body--pairpair">
                <div class="ssSideBlock ${pairPairLeaderClass(row, 'left')}">
                <div class="ssSideBlock__title">Side ${esc(row.left.flightPos || 'A')}</div>
                <div class="ssMiniMetric">
                  <span class="ssMiniMetric__label">#Scores</span>
                  <span class="ssMiniMetric__value">${esc(row.left.scoreCount)}</span>
                </div>
                <div class="ssMiniMetric">
                  <span class="ssMiniMetric__label">${currentMetricLabel()}</span>
                  <span class="ssMiniMetric__value">${esc(currentMetricValue(row, 'left'))}</span>
                </div>
              </div>
              <div class="ssSideBlock ${pairPairLeaderClass(row, 'right')}">
                <div class="ssSideBlock__title">Side ${esc(row.right.flightPos || 'B')}</div>
                <div class="ssMiniMetric">
                  <span class="ssMiniMetric__label">#Scores</span>
                  <span class="ssMiniMetric__value">${esc(row.right.scoreCount)}</span>
                </div>
                <div class="ssMiniMetric">
                  <span class="ssMiniMetric__label">${currentMetricLabel()}</span>
                  <span class="ssMiniMetric__value">${esc(currentMetricValue(row, 'right'))}</span>
                </div>
              </div>
            </div>
          </section>
        `).join('')}
      </div>
    `;
  }

  function renderBody() {
    if (!dom.host) return;

    const dataRows = rows();
    if (!dataRows.length) {
      if (dom.empty) dom.empty.style.display = 'block';
      dom.host.innerHTML = '';
      return;
    }

    if (dom.empty) dom.empty.style.display = 'none';

    if (String(payload.competition || 'PairField') === 'PairPair') {
      dom.host.innerHTML = renderPairPairTable(dataRows) + renderPairPairCards(dataRows);
      return;
    }

    dom.host.innerHTML = renderPairFieldTable(dataRows) + renderPairFieldCards(dataRows);
  }

    function pairPairLeaderClass(row, side) {
    const leftVal = state.valueMode === 'gross'
      ? Number(row?.left?.grossDiffValue ?? 0)
      : Number(row?.left?.netDiffValue ?? 0);

    const rightVal = state.valueMode === 'gross'
      ? Number(row?.right?.grossDiffValue ?? 0)
      : Number(row?.right?.netDiffValue ?? 0);

    if (leftVal === rightVal) return '';
    if (side === 'left') return leftVal < rightVal ? 'is-leading' : '';
    if (side === 'right') return rightVal < leftVal ? 'is-leading' : '';
    return '';
  }

  function initialize() {
    applyChrome();
    renderControls();
    renderBody();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();