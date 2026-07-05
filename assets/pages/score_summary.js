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
    valueMode: String(payload.meta?.defaultValueMode || 'game')
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
    const n = Number(game.dbGames_BestBall ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isSkinsBasis() {
    return scoringBasis() === 'Skins';
  }

  function isPointsBasis() {
    return scoringBasis() === 'Points';
  }

  // PairPair only — 1 (default, one overall result) or 3 (front 9 / back 9 /
  // overall, scored independently). Backend already normalizes to 1 or 3.
  function scoringSegments() {
    return Number(payload.meta?.scoringSegments || 1) === 3 ? 3 : 1;
  }

  // Formats a raw segment number, distinguishing "genuinely not applicable"
  // (null — e.g. a 9-hole round has no back-9 segment) from a real zero.
  function segNumDisplay(n) {
    return (n === null || n === undefined) ? '—' : String(n);
  }

  // Formats a {value, display} shaped segment cell (gameSegments,
  // grossDiffSegments/netDiffSegments) the same way — null means not
  // applicable, not a real zero.
  function segCellDisplay(cell) {
    const d = cell?.display;
    return (d === null || d === undefined) ? '—' : d;
  }

  // Derives the skins count for a row or side from the correct field
  // based on scoringMethod — gross skins for ADJ GROSS, net skins otherwise.
  function skinsValue(rowOrSide) {
    const sk = scoringMethod() === 'ADJ GROSS'
      ? rowOrSide?.grossSkins
      : rowOrSide?.netSkins;
    return Number(sk?.total ?? 0);
  }

  function skinsDisplay(rowOrSide) {
    const n = skinsValue(rowOrSide);
    return n === 1 ? '1 Skin' : `${n} Skins`;
  }

  function skinsSegments(rowOrSide) {
    const sk = scoringMethod() === 'ADJ GROSS'
      ? rowOrSide?.grossSkins
      : rowOrSide?.netSkins;
    return {
      front:   segNumDisplay(sk?.front),
      back:    segNumDisplay(sk?.back),
      overall: segNumDisplay(sk?.total),
    };
  }

  // Derives the points total for a row or side from the correct field
  // based on scoringMethod — gross points for ADJ GROSS, net points otherwise.
  function pointsValue(rowOrSide) {
    const pts = scoringMethod() === 'ADJ GROSS'
      ? rowOrSide?.grossPoints
      : rowOrSide?.netPoints;
    return Number(pts?.total ?? 0);
  }

  function pointsSegments(rowOrSide) {
    const pts = scoringMethod() === 'ADJ GROSS'
      ? rowOrSide?.grossPoints
      : rowOrSide?.netPoints;
    return {
      front:   segNumDisplay(pts?.front),
      back:    segNumDisplay(pts?.back),
      overall: segNumDisplay(pts?.total),
    };
  }

  function pointsDisplay(rowOrSide) {
    return String(pointsValue(rowOrSide));
  }

  // Medal Match (Strokes basis) front/back/overall — new fields, only present
  // when scoringSegments() === 3. {value, display} shaped, same as gameSegments.
  // Used by the "game"/"Strokes" tab, which follows the game's configured
  // scoringMethod (NET vs ADJ GROSS) rather than a manually-selected tab.
  function strokeDiffSegments(rowOrSide) {
    const seg = scoringMethod() === 'ADJ GROSS'
      ? rowOrSide?.grossDiffSegments
      : rowOrSide?.netDiffSegments;
    return {
      front:   segCellDisplay(seg?.front),
      back:    segCellDisplay(seg?.back),
      overall: segCellDisplay(seg?.total),
    };
  }

  // Same data, but picked by an explicit 'gross' | 'net' mode rather than the
  // game's scoringMethod — for the Gross/Net tabs, where the person is
  // manually choosing which to view regardless of how the game is configured.
  function strokeDiffSegmentsByMode(rowOrSide, mode) {
    const seg = (mode === 'gross') ? rowOrSide?.grossDiffSegments : rowOrSide?.netDiffSegments;
    return {
      front:   segCellDisplay(seg?.front),
      back:    segCellDisplay(seg?.back),
      overall: segCellDisplay(seg?.total),
    };
  }

  // PairField — total points for the row
  function pairFieldPointsValue(row) {
    return Number(row?.pointsValue ?? 0);
  }

  function pairFieldPointsDisplay(row) {
    const v = row?.pointsDisplay;
    return (v !== undefined && v !== null && v !== '—') ? String(v) : '—';
  }

  function headerContextText() {
    const format = String(game.dbGames_GameFormat || '').trim();
    const method = String(game.dbGames_ScoringMethod || '').trim();
    const basis = scoringBasis();
    return [format, method, basis].filter(Boolean).join(' ');
  }

  // Returns the label for the Game/Match/Skins/Points/Strokes tab.
  function gameTabLabel() {
    const basis = scoringBasis();
    if (basis === 'Holes')   return 'Match';
    if (basis === 'Skins')   return 'Skins';
    if (basis === 'Points')  return 'Points';
    if (basis === 'Strokes') return 'Strokes';
    return 'Game';
  }

  // Game tab is now always present — three tabs for all game types.
  function availableModes() {
    return [
      ['game',  gameTabLabel()],
      ['gross', 'Gross'],
      ['net',   'Net']
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
      front: segCellDisplay(seg?.front),
      back: segCellDisplay(seg?.back),
      overall: segCellDisplay(seg?.total)
    };
  }

  function currentMetricLabel() {
    const basis = scoringBasis();

    if (state.valueMode === 'game') {
      if (basis === 'Holes')   return 'Holes';
      if (basis === 'Skins')   return scoringMethod() === 'ADJ GROSS' ? 'Gross Skins' : 'Net Skins';
      if (basis === 'Points')  return scoringMethod() === 'ADJ GROSS' ? 'Gross Points' : 'Net Points';
      if (basis === 'Strokes') return scoringMethod() === 'ADJ GROSS' ? '+/- Gross' : '+/- Net';
      return 'Game';
    }

    return state.valueMode === 'gross' ? '+/- Gross' : '+/- Net';
  }

  function currentMetricValue(row, side) {
    if (side) {
      // PairPair side context
      if (state.valueMode === 'game') {
        if (isSkinsBasis())  return skinsDisplay(row?.[side]);
        if (isPointsBasis()) return pointsDisplay(row?.[side]);
        return row?.[side]?.gameDisplay ?? '—';
      }
      return state.valueMode === 'gross'
        ? (row?.[side]?.grossDiffDisplay ?? '—')
        : (row?.[side]?.netDiffDisplay ?? '—');
    }

    // PairField row context
    if (state.valueMode === 'game') {
      if (isSkinsBasis())  return skinsDisplay(row);
      if (isPointsBasis()) return pairFieldPointsDisplay(row);
      return row?.gameDisplay ?? '—';
    }

    return state.valueMode === 'gross'
      ? (row?.grossDiffDisplay ?? '—')
      : (row?.netDiffDisplay ?? '—');
  }

  function pairPairLeaderClass(row, side) {
    // Skins — higher skins wins
    if (state.valueMode === 'game' && isSkinsBasis()) {
      const leftVal  = skinsValue(row?.left);
      const rightVal = skinsValue(row?.right);
      if (leftVal === rightVal) return '';
      if (side === 'left')  return leftVal  > rightVal ? 'is-leading' : '';
      if (side === 'right') return rightVal > leftVal  ? 'is-leading' : '';
      return '';
    }

    // Points — higher points wins
    if (state.valueMode === 'game' && isPointsBasis()) {
      const leftVal  = pointsValue(row?.left);
      const rightVal = pointsValue(row?.right);
      if (leftVal === rightVal) return '';
      if (side === 'left')  return leftVal  > rightVal ? 'is-leading' : '';
      if (side === 'right') return rightVal > leftVal  ? 'is-leading' : '';
      return '';
    }

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
    if (side === 'left')  return leftVal  > rightVal ? 'is-leading' : '';
    if (side === 'right') return rightVal > leftVal  ? 'is-leading' : '';
    return '';
  }

  function pairFieldLeaderClass(row) {
    return row?.isLeader ? 'is-leading' : '';
  }

  // Shared Front/Back/Overall template — used by both the "game" tab and,
  // for Medal Match specifically, the Gross/Net tabs (since a Medal Match's
  // native scored metric IS the gross/net differential, not something separate).
  function threeLineSegBlock(seg) {
    return `
      <div><span class="ssSideBox__label">Front:</span> <span class="ssSideBox__value">${esc(seg.front)}</span></div>
      <div><span class="ssSideBox__label">Back:</span> <span class="ssSideBox__value">${esc(seg.back)}</span></div>
      <div><span class="ssSideBox__label">Overall:</span> <span class="ssSideBox__value">${esc(seg.overall)}</span></div>
    `;
  }

  function oneLineLabelBlock(label, value) {
    return `<div><span class="ssSideBox__label">${esc(label)}</span> <span class="ssSideBox__value">${esc(value)}</span></div>`;
  }

  // Renders the "game" value-mode content for one side of a PairPair card —
  // one line when scoringSegments() is 1 (or basis doesn't apply), three lines
  // (Front / Back / Overall) when it's 3. Consolidates what used to be three
  // separate, unconditionally-3-line inline blocks (the pre-existing bug: every
  // non-Skins format always showed Front/Back/Overall regardless of any
  // segments concept, since none existed in the payload before now).
  function renderPairPairGameModeBlock(row, side) {
    const label = currentMetricLabel();
    const oneLine = (value) => oneLineLabelBlock(label, value);
    const threeLine = threeLineSegBlock;
    const segments3 = (scoringSegments() === 3);

    if (isSkinsBasis()) {
      return segments3 ? threeLine(skinsSegments(row?.[side])) : oneLine(skinsDisplay(row?.[side]));
    }
    if (isPointsBasis()) {
      return segments3 ? threeLine(pointsSegments(row?.[side])) : oneLine(pointsDisplay(row?.[side]));
    }
    if (scoringBasis() === 'Holes') {
      return segments3 ? threeLine(pairPairSegmentLines(row, side)) : oneLine(row?.[side]?.gameDisplay ?? '—');
    }
    // Strokes basis (Medal Match) — the native metric here IS the gross/net
    // differential, so the segmented breakdown comes from grossDiffSegments/
    // netDiffSegments rather than gameSegments (which stays all-zero for
    // Strokes basis — it's only ever populated for Holes/Points).
    if (segments3) return threeLine(strokeDiffSegments(row?.[side]));
    const overallKey = (scoringMethod() === 'ADJ GROSS') ? 'grossDiffDisplay' : 'netDiffDisplay';
    return oneLine(row?.[side]?.[overallKey] ?? '—');
  }

  // Renders the Gross/Net tab content for one side of a PairPair card.
  // For every basis except Strokes, this is unchanged — a flat single line.
  // Medal Match (Strokes basis) is the one case where Gross/Net IS the native
  // scored metric (not separate context alongside it, like Four Ball's holes-up
  // or Points Match's points total) — a Medal Match can be played gross or net,
  // so both tabs need the same three-line treatment the "game"/Strokes tab gets,
  // picked by whichever tab is actually active rather than the game's configured
  // scoringMethod.
  function renderPairPairMetricBlock(row, side) {
    if (scoringBasis() === 'Strokes' && scoringSegments() === 3) {
      return threeLineSegBlock(strokeDiffSegmentsByMode(row?.[side], state.valueMode));
    }
    return oneLineLabelBlock(currentMetricLabel(), currentMetricValue(row, side));
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
        right: { show: true, label: 'Actions', onClick: openActionsMenu }
      });
    }

    if (chrome.setBottomNav) {
      const portal = init.portal || '';
      const homeRoute =
        portal === 'ADMIN PORTAL' ? 'admin' :
        portal === 'PLAYER PORTAL' ? 'player' : 'home';

      chrome.setBottomNav({
        visible: ['scorehome', homeRoute, 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoresummary', 'scoreskins'],
        active: 'scoresummary',
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    const items = [];
    if (game && Object.keys(game).length) {
      items.push({
        label: 'View game details',
        action: () => MA.gameDetails && MA.gameDetails.open(game),
      });
    }

    if (MA.ghinPostScores) {
      const postedId = init.user?.ghinPostId || '';
      const postLabel = postedId ? 'Score Already Posted to GHIN' : 'Post Score to GHIN';
      items.push({
        label:   postLabel,
        enabled: !postedId,
        indent:  false,
        action:  () => MA.ghinPostScores.open({
          ggid:     game.dbGames_GGID,
          onPosted: () => applyChrome(),
        }),
      });
    }

    if (items.length) {
      MA.ui.openActionsMenu('Actions', items);
    }
  }

  function pointsHintText() {
    if (!isPointsBasis()) return '';

    let raw = game.dbGames_PointsConfig ?? game.dbGames_StablefordPoints ?? null;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { raw = null; }
    }
    if (!raw || typeof raw !== 'object') return '';

    const strategy = raw.strategy || 'Stableford';
    const values   = raw.values;

    if ((strategy === 'Stableford' || strategy === 'Chicago') && Array.isArray(values)) {
      const relLabels = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Dbl Bogey' };
      const parts = values
        .filter(v => Number(v.points) > 0)
        .map(v => `${relLabels[String(v.reltoPar)] || v.reltoPar}=${v.points}`);
      const prefix = strategy === 'Chicago' ? 'Chicago · Quota 36 · ' : 'Stableford · ';
      return prefix + parts.join(' · ');
    }

    if (strategy === 'Nines' && values && typeof values === 'object' && !Array.isArray(values)) {
      const parts = Object.entries(values).map(([size, dist]) => `${size}P: ${dist.join('-')}`);
      return '9\'s · ' + parts.join(' · ');
    }

    if (strategy === 'LowBallLowTotal' && values) {
      return `Low-Ball/Low-Total · LowBall=${values.lowBall ?? 1}pt · LowTotal=${values.lowTotal ?? 1}pt`;
    }

    if (strategy === 'LowBallHighBall' && values) {
      return `Low-Ball/High-Ball · LowBall=${values.lowBall ?? 1}pt · HighBall=${values.highBall ?? 1}pt`;
    }

    if (strategy === 'Vegas' && values) {
      return `Vegas · ${values.pointsPerUnit ?? 1}pt per unit`;
    }

    return strategy;
  }

  function renderControls() {
    if (!dom.controls) return;

    const modes = availableModes();
    const hint  = pointsHintText();

    dom.controls.innerHTML = `
      <div class="scBrowserControls">
        <div class="scBrowserControls__group">
          ${modes.map(([key, label]) =>
            `<button class="scCtlBtn ${state.valueMode === key ? 'is-active' : ''}" type="button" data-mode="${key}">${label}</button>`
          ).join('')}
        </div>
        ${hint ? `<div class="ssPointsHint">${esc(hint)}</div>` : ''}
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
    if (system === 'DeclareHole')   return 'Use N Scores';
    if (system === 'DeclareManual') return 'Declared Scores';

    return 'Counted Scores';
  }

  function excludedSectionLabel() {
    const system = scoringSystem();

    if (system === 'AllScores')   return '';
    if (system === 'BestBall')    return 'Other Scores';
    if (system === 'DeclareHole') return 'Not Counted';
    if (system === 'DeclareManual') return 'Not Declared';

    return 'Not Counted';
  }

  function fieldStatsModeKey() {
    // Shape stats grid always follows gross/net — never game mode.
    // When game tab is active, default to net (or gross for ADJ GROSS).
    if (state.valueMode === 'game') {
      return scoringMethod() === 'ADJ GROSS' ? 'Gross' : 'Net';
    }
    return state.valueMode === 'gross' ? 'Gross' : 'Net';
  }

  function extractPairFieldStats(row, bucket) {
    const modeKey = fieldStatsModeKey();
    const key = `${bucket}${modeKey}Stats`;
    const stats = row?.[key];

    return {
      eaglePlus: stats?.eaglePlus ?? 0,
      birdie:    stats?.birdie    ?? 0,
      par:       stats?.par       ?? 0,
      bogey:     stats?.bogey     ?? 0,
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
          const counted  = extractPairFieldStats(row, 'counted');
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
                        ? renderPairPairGameModeBlock(row, 'left')
                        : renderPairPairMetricBlock(row, 'left')
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
                        ? renderPairPairGameModeBlock(row, 'right')
                        : renderPairPairMetricBlock(row, 'right')
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