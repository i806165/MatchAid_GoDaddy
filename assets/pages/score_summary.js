/* /assets/pages/score_summary.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.summary || {};
  const game = init.game || {};

  const dom = {
    controls: document.getElementById('ssControls'),
    host: document.getElementById('ssHost'),
    empty: document.getElementById('ssEmpty'),
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
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
    dom.controls.innerHTML = '';
  }

  function renderPairFieldTable(dataRows) {
    return `
      <div class="ssDesktopBoard">
        <table class="ssTable" role="table" aria-label="PairField standings">
          <thead>
            <tr>
              <th>Pairing</th>
              <th>#Scores</th>
              <th>Gross +/-</th>
              <th>Net +/-</th>
              <th>Thru</th>
            </tr>
          </thead>
          <tbody>
            ${dataRows.map((row) => `
              <tr>
                <td class="ssCellStrong">${esc(row.pairingLabel)}</td>
                <td>${esc(row.scoreCount)}</td>
                <td>${esc(row.grossDiffDisplay)}</td>
                <td>${esc(row.netDiffDisplay)}</td>
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
              <div class="ssMiniMetric"><span class="ssMiniMetric__label">#Scores</span><span class="ssMiniMetric__value">${esc(row.scoreCount)}</span></div>
              <div class="ssMiniMetric"><span class="ssMiniMetric__label">Gross +/-</span><span class="ssMiniMetric__value">${esc(row.grossDiffDisplay)}</span></div>
              <div class="ssMiniMetric"><span class="ssMiniMetric__label">Net +/-</span><span class="ssMiniMetric__value">${esc(row.netDiffDisplay)}</span></div>
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
              <th>Gross +/-</th>
              <th>Net +/-</th>
              <th>Pairing</th>
              <th>#Scores</th>
              <th>Gross +/-</th>
              <th>Net +/-</th>
              <th>Thru</th>
            </tr>
          </thead>
          <tbody>
            ${dataRows.map((row) => `
              <tr>
                <td>${esc(row.left.scoreCount)}</td>
                <td>${esc(row.left.grossDiffDisplay)}</td>
                <td>${esc(row.left.netDiffDisplay)}</td>
                <td class="ssCellStrong">${esc(row.matchLabel)}</td>
                <td>${esc(row.right.scoreCount)}</td>
                <td>${esc(row.right.grossDiffDisplay)}</td>
                <td>${esc(row.right.netDiffDisplay)}</td>
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
          <section class="maCard ssMiniCard" aria-label="${esc(row.matchLabel)}">
            <div class="maCard__hdr">
              <div class="maCard__title">${esc(row.matchLabel)}</div>
              <div class="ssThruPill">Thru ${esc(formatThru(row.thru))}</div>
            </div>
            <div class="maCard__body ssMiniCard__body ssMiniCard__body--pairpair">
              <div class="ssSideBlock">
                <div class="ssSideBlock__title">Side ${esc(row.left.flightPos || 'A')}</div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">#Scores</span><span class="ssMiniMetric__value">${esc(row.left.scoreCount)}</span></div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">Gross +/-</span><span class="ssMiniMetric__value">${esc(row.left.grossDiffDisplay)}</span></div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">Net +/-</span><span class="ssMiniMetric__value">${esc(row.left.netDiffDisplay)}</span></div>
              </div>
              <div class="ssSideBlock">
                <div class="ssSideBlock__title">Side ${esc(row.right.flightPos || 'B')}</div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">#Scores</span><span class="ssMiniMetric__value">${esc(row.right.scoreCount)}</span></div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">Gross +/-</span><span class="ssMiniMetric__value">${esc(row.right.grossDiffDisplay)}</span></div>
                <div class="ssMiniMetric"><span class="ssMiniMetric__label">Net +/-</span><span class="ssMiniMetric__value">${esc(row.right.netDiffDisplay)}</span></div>
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

  function initialize() {
    applyChrome();
    renderControls();
    renderBody();
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();