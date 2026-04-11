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

    function headerContextText() {
    const format = String(game.dbGames_GameFormat || '').trim();
    const method = String(game.dbGames_ScoringMethod || '').trim();
    const basis = String(payload.meta?.scoringBasis || game.dbGames_ScoringBasis || '').trim();

    return [format, method, basis].filter(Boolean).join(' ');
  }

  function pairPairTopName(row) {
    const leftPos = String(row?.left?.flightPos || 'A').trim();
    return `${leftPos} ${String(row?.matchLabelTop || '').trim()}`.trim();
  }

  function pairPairBottomName(row) {
    const rightPos = String(row?.right?.flightPos || 'B').trim();
    return `${rightPos} ${String(row?.matchLabelBottom || '').trim()}`.trim();
  }

  function pairPairSegmentLines(row, side) {
    const seg = row?.[side]?.gameSegments || {};
    return {
      front: seg?.front?.display ?? '0',
      back: seg?.back?.display ?? '0',
      overall: seg?.total?.display ?? '0'
    };
  }

    function currentMetricLabel() {
    const basis = String(payload.meta?.scoringBasis || game.dbGames_ScoringBasis || 'Strokes');

    if (state.valueMode === 'game') {
        if (basis === 'Holes') return 'Holes';
        if (basis === 'Skins') return 'Skins';
        return 'Game';
    }

    return state.valueMode === 'gross' ? 'Gross +/-' : 'Net +/-';
    }

function currentMetricValue(row, side) {
  if (side) {
    if (state.valueMode === 'game') {
      return row?.[side]?.gameDisplay ?? '—';
    }
    return state.valueMode === 'gross'
      ? (row?.[side]?.grossDiffDisplay ?? '—')
      : (row?.[side]?.netDiffDisplay ?? '—');
  }

  if (state.valueMode === 'game') {
    return row?.gameDisplay ?? '—';
  }

  return state.valueMode === 'gross'
    ? (row?.grossDiffDisplay ?? '—')
    : (row?.netDiffDisplay ?? '—');
}

function isSegmentedGameKpi() {
  const basis = String(payload.meta?.scoringBasis || game.dbGames_ScoringBasis || 'Strokes');
  return state.valueMode === 'game' && (basis === 'Holes' || basis === 'Skins');
}

function renderSegmentedGameKpi(segments) {
  const front = segments?.front?.display ?? '0';
  const back = segments?.back?.display ?? '0';
  const total = segments?.total?.display ?? '0';

  return `
    <div class="ssGameKpi">
      <div class="ssGameKpi__row"><span class="ssGameKpi__label">F</span><span class="ssGameKpi__value">${esc(front)}</span></div>
      <div class="ssGameKpi__row"><span class="ssGameKpi__label">B</span><span class="ssGameKpi__value">${esc(back)}</span></div>
      <div class="ssGameKpi__row"><span class="ssGameKpi__label">T</span><span class="ssGameKpi__value">${esc(total)}</span></div>
    </div>
  `;
}

  function applyChrome() {
    const courseName = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');
    const headerLine3 = headerContextText();

    if (chrome.setHeaderLines) {
      chrome.setHeaderLines([
        'Score Summary',
        courseName,
        headerLine3 || 'Standings'
      ]);
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
      ['game', 'Game'],
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

    function renderPairPairCards(dataRows) {
    return `
      <div class="ssPairPairGrid">
        ${dataRows.map((row) => {
          const leftSeg = pairPairSegmentLines(row, 'left');
          const rightSeg = pairPairSegmentLines(row, 'right');

          return `
            <article class="maCard ssMatchCard" aria-label="${esc(row.matchLabel || 'Matchup')}">
              <div class="maCard__hdr ssMatchCard__hdr">
                <div class="maCard__title ssMatchCardTitle">
                  <div class="ssMatchCell__top">${esc(pairPairTopName(row))}</div>
                  <div class="ssMatchCell__bottom">${esc(pairPairBottomName(row))}</div>
                </div>
                <div class="ssThruPill ssThruPill--stacked">
                  <span>Thru</span>
                  <span>${esc(formatThru(row.thru))}</span>
                </div>
              </div>

              <div class="maCard__body ssMatchCard__body">
                <div class="ssSideGrid">
                  <div class="ssSideBox ${pairPairLeaderClass(row, 'left')}">
                    <div class="ssSideBox__meta">
                      <span class="ssSideBox__side">${esc(String(row?.left?.flightPos || 'A'))}</span>
                      <span class="ssSideBox__scores">${esc(row?.left?.scoreCount ?? '0')} Scores</span>
                    </div>

                    <div class="ssSideBox__values">
                      ${state.valueMode === 'game'
                        ? `
                          <div><span class="ssSideBox__label">Front:</span> <span class="ssSideBox__value">${esc(leftSeg.front)}</span></div>
                          <div><span class="ssSideBox__label">Back:</span> <span class="ssSideBox__value">${esc(leftSeg.back)}</span></div>
                          <div><span class="ssSideBox__label">Overall:</span> <span class="ssSideBox__value">${esc(leftSeg.overall)}</span></div>
                        `
                        : `
                          <div><span class="ssSideBox__label">${esc(currentMetricLabel())}</span> <span class="ssSideBox__value">${esc(currentMetricValue(row, 'left'))}</span></div>
                        `
                      }
                    </div>
                  </div>

                  <div class="ssSideBox ${pairPairLeaderClass(row, 'right')}">
                    <div class="ssSideBox__meta">
                      <span class="ssSideBox__side">${esc(String(row?.right?.flightPos || 'B'))}</span>
                      <span class="ssSideBox__scores">${esc(row?.right?.scoreCount ?? '0')} Scores</span>
                    </div>

                    <div class="ssSideBox__values">
                      ${state.valueMode === 'game'
                        ? `
                          <div><span class="ssSideBox__label">Front:</span> <span class="ssSideBox__value">${esc(rightSeg.front)}</span></div>
                          <div><span class="ssSideBox__label">Back:</span> <span class="ssSideBox__value">${esc(rightSeg.back)}</span></div>
                          <div><span class="ssSideBox__label">Overall:</span> <span class="ssSideBox__value">${esc(rightSeg.overall)}</span></div>
                        `
                        : `
                          <div><span class="ssSideBox__label">${esc(currentMetricLabel())}</span> <span class="ssSideBox__value">${esc(currentMetricValue(row, 'right'))}</span></div>
                        `
                      }
                    </div>
                  </div>
                </div>
              </div>
            </article>
          `;
        }).join('')}
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
        dom.host.innerHTML = renderPairPairCards(dataRows);
        return;
        }

        dom.host.innerHTML = renderPairFieldTable(dataRows) + renderPairFieldCards(dataRows);
    }

    function pairPairLeaderClass(row, side) {
    const leftVal = state.valueMode === 'game'
        ? Number(row?.left?.gameValue ?? 0)
        : state.valueMode === 'gross'
        ? Number(row?.left?.grossDiffValue ?? 0)
        : Number(row?.left?.netDiffValue ?? 0);

    const rightVal = state.valueMode === 'game'
        ? Number(row?.right?.gameValue ?? 0)
        : state.valueMode === 'gross'
        ? Number(row?.right?.grossDiffValue ?? 0)
        : Number(row?.right?.netDiffValue ?? 0);

    if (leftVal === rightVal) return '';
    if (side === 'left') return leftVal > rightVal ? 'is-leading' : '';
    if (side === 'right') return rightVal > leftVal ? 'is-leading' : '';
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