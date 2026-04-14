/* /assets/pages/score_summary.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.summary || {};
  const game = init.game || {};

  const SCORE_SHAPE_ORDER = [
    ['eaglePlus', 'Eagle+'],
    ['birdie', 'Birdie'],
    ['par', 'Par'],
    ['bogey', 'Bogey'],
    ['bogeyPlus', 'Bogey+']
  ];

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
    const d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(...s.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)))
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

  function scoringBasis() {
    return String(payload.meta?.scoringBasis || game.dbGames_ScoringBasis || 'Strokes').trim();
  }

  function scoringSystem() {
    return String(game.dbGames_ScoringSystem || '').trim();
  }

  function scoringMethod() {
    return String(game.dbGames_ScoringMethod || '').trim().toUpperCase();
  }

  function bestBallCount() {
    const n = Number(
      game.dbGames_BestBallCnt ??
      game.dbGames_BestBall ??
      game.dbGames_BestBallCount ??
      0
    );
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function headerContextText() {
    const format = String(game.dbGames_GameFormat || '').trim();
    const method = String(game.dbGames_ScoringMethod || '').trim();
    const basis = scoringBasis();
    return [format, method, basis].filter(Boolean).join(' ');
  }

  function supportsDistinctGameMode() {
    const basis = scoringBasis();
    return basis === 'Holes' || basis === 'Skins';
  }

  function normalizeValueMode() {
    if (supportsDistinctGameMode()) return;

    if (state.valueMode === 'game') {
      state.valueMode = scoringMethod() === 'ADJ GROSS' ? 'gross' : 'net';
    }
  }

  function availableModes() {
    if (supportsDistinctGameMode()) {
      return [
        ['game', 'Game'],
        ['gross', 'Gross'],
        ['net', 'Net']
      ];
    }

    return [
      ['gross', 'Gross'],
      ['net', 'Net']
    ];
  }

  function pairPairTopName(row) {
    const leftPos = String(row?.left?.flightPos || 'A').trim();
    return `${leftPos} ${String(row?.matchLabelTop || '').trim()}`.trim();
  }

  function pairPairBottomName(row) {
    const rightPos = String(row?.right?.flightPos || 'B').trim();
    return `${rightPos} ${String(row?.matchLabelBottom || '').trim()}`.trim();
  }

  function pairPairSpinText(row) {
    const label = String(row?.spinLabel || '').trim();
    const start = Number(row?.spinStartHole || 0);
    const end = Number(row?.spinEndHole || 0);

    if (!label || label === 'Round') return '';
    if (start > 0 && end > 0) return `${label} • Holes ${start}-${end}`;
    return label;
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
    const basis = scoringBasis();

    if (state.valueMode === 'game') {
      if (basis === 'Holes') return 'Holes';
      if (basis === 'Skins') return 'Skins';
      return 'Game';
    }

    return state.valueMode === 'gross' ? '+/- Gross' : '+/- Net';
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

  function pairFieldLeaderClass(row) {
    return row?.isLeader ? 'is-leading' : '';
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

    normalizeValueMode();
    const modes = availableModes();

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

  function includedSectionLabel() {
    const system = scoringSystem();

    if (system === 'AllScores') return 'Count All Scores';
    if (system === 'BestBall') {
      const n = bestBallCount();
      if (n > 0) return `${n} Best Ball${n === 1 ? '' : 's'}`;
      return 'Best Ball Scores';
    }
    if (system === 'DeclareHole') return 'Use N Scores';
    if (system === 'DeclareManual') return 'Declared Scores';

    return 'Counted Scores';
  }

  function excludedSectionLabel() {
    const system = scoringSystem();

    if (system === 'AllScores') return '';
    if (system === 'BestBall') return 'Other Scores';
    if (system === 'DeclareHole') return 'Not Counted';
    if (system === 'DeclareManual') return 'Not Declared';

    return 'Not Counted';
  }

  function fieldStatsModeKey() {
    return state.valueMode === 'gross' ? 'Gross' : 'Net';
  }

  function extractPairFieldStats(row, bucket) {
    const modeKey = fieldStatsModeKey();
    const key = `${bucket}${modeKey}Stats`;
    const stats = row?.[key];

    return {
      eaglePlus: stats?.eaglePlus ?? 0,
      birdie: stats?.birdie ?? 0,
      par: stats?.par ?? 0,
      bogey: stats?.bogey ?? 0,
      bogeyPlus: stats?.bogeyPlus ?? 0,
    };
  }

  function renderPairFieldStatGrid(stats, toneClass) {
    return `
      <div class="ssFieldStatGrid">
        ${SCORE_SHAPE_ORDER.map(([key, label]) => `
          <div class="ssFieldStatCell ${toneClass}">
            <div class="ssFieldStatCell__label">${esc(label)}</div>
            <div class="ssFieldStatCell__value">${esc(stats[key])}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderPairFieldCards(dataRows) {
    const includeLabel = includedSectionLabel();
    const excludeLabel = excludedSectionLabel();
    const showExcluded = Boolean(excludeLabel);

    return `
      <div class="ssPairFieldGrid">
        ${dataRows.map((row) => {
          const counted = extractPairFieldStats(row, 'counted');
          const excluded = extractPairFieldStats(row, 'notCounted');

          return `
            <article class="maCard ssMatchCard ssFieldCard ${pairFieldLeaderClass(row)}" aria-label="${esc(row.pairingLabel || 'Pairing')}">
              <div class="maCard__hdr ssMatchCard__hdr">
                <div class="maCard__title ssMatchCardTitle">
                  <div class="ssMatchCell__top">${esc(row.pairingLabel || '')}</div>
                </div>
                <div class="ssThruPill ssThruPill--stacked">
                  <span>Thru</span>
                  <span>${esc(formatThru(row.thru))}</span>
                </div>
              </div>

              <div class="maCard__body ssFieldCard__body">
                <div class="ssFieldSummaryBox">
                  <div class="ssFieldSummaryTop">
                    <div class="ssFieldMetric">#Scores <span class="ssFieldMetricValue">${esc(row.scoreCount ?? '—')}</span></div>
                    <div class="ssFieldMetric">${esc(currentMetricLabel())} <span class="ssFieldMetricValue">${esc(currentMetricValue(row))}</span></div>
                  </div>

                  <div class="ssFieldSection">
                    <div class="ssFieldSection__title">${esc(includeLabel)}</div>
                    ${renderPairFieldStatGrid(counted, 'ssFieldStatCell--muted')}
                  </div>

                  ${showExcluded ? `
                    <div class="ssFieldSection ssFieldSection--split">
                      <div class="ssFieldSection__title">${esc(excludeLabel)}</div>
                      ${renderPairFieldStatGrid(excluded, 'ssFieldStatCell--plain')}
                    </div>
                  ` : ''}
                </div>
              </div>
            </article>
          `;
        }).join('')}
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
                  ${pairPairSpinText(row) ? `<div class="ssMatchCell__sub">${esc(pairPairSpinText(row))}</div>` : ''}
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

    dom.host.innerHTML = renderPairFieldCards(dataRows);
  }

  function initialize() {
    normalizeValueMode();
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