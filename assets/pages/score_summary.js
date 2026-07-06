/* /assets/pages/score_summary.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.summary || {};
  const game = init.game || {};
  const competition = String(payload.competition || 'PairField');
  const teamRollup = Array.isArray(payload.teamRollup) ? payload.teamRollup : [];
  // { top, gross, net, matchResult, individualGross, individualNet } — each
  // "default"|"active"|"disabled". Read-only signal for display decisions
  // (column headers, pill-disabling, tab suppression); never re-derived
  // client-side — service_ScoreSummary.php is the single source of truth.
  const placementStates = (payload.meta && typeof payload.meta.placementPointsStates === 'object' && payload.meta.placementPointsStates) || {};

  const SCORE_SHAPE_ORDER = [
    ['eaglePlus', 'Eagle+'],
    ['birdie', 'Birdie'],
    ['par', 'Par'],
    ['bogey', 'Bogey'],
    ['bogeyPlus', 'Bogey+']
  ];

  const state = {
    valueMode: String(payload.meta?.defaultValueMode || 'game'),
    lbKpi: (['Holes', 'Skins', 'Points'].includes(scoringBasis())) ? 'game' : 'net',
    lbAggregate: 'pairing',
    // Individual grain only — the one place with no server-provided order at
    // all (Pairing has rank, Team has teamSort). Defaults to KPI value,
    // low to high — the natural "who's leading" order for this grain.
    lbSortKey: 'kpi',
    lbSortDir: 'asc',
  };

  const dom = {
    controls: document.getElementById('ssControls'),
    host: document.getElementById('ssHost'),
    empty: document.getElementById('ssEmpty'),
    lbControls: document.getElementById('lbControls'),
    lbHost: document.getElementById('lbHost'),
    lbSectionTitle: document.getElementById('lbSectionTitle'),
    ssTabs: document.getElementById('ssTabs'),
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
        <div class="maChoiceChips">
          ${modes.map(([key, label]) =>
            `<button class="maChoiceChip ${state.valueMode === key ? 'is-selected' : ''}" type="button" data-mode="${key}">${label}</button>`
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
                <div class="maPill ssThruPill--stacked">
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
                <div class="maPill ssThruPill--stacked">
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

  // ==========================================================================
  // Leaderboard panel (#lbPanel) — reads the exact same payload/rows as the
  // card grid above. Reuses scoringBasis()/scoringMethod()/scoringSegments()/
  // skinsDisplay()/pointsDisplay()/skinsSegments()/pointsSegments()/
  // strokeDiffSegmentsByMode()/pairPairSegmentLines()/esc() throughout —
  // no separate reimplementation of anything already established above.
  // ==========================================================================

  function fmtNum(v) {
    return (v === null || v === undefined) ? '—' : String(v);
  }

  function lbTeamDotHtml(color) {
    return color ? `<span class="lbTeamDot" style="background:${esc(color)}"></span>` : '';
  }

  // ── Placement Points display helpers — read placementStates only, never
  // recompute or reinterpret it; service_ScoreSummary.php is the single
  // source of truth for what each category's state actually is. ──────────

  // Which category's state governs the Points column/pill currently on
  // screen, given the current grain + KPI selection. Mirrors the exact
  // useGross resolution lbPlacementPointsDisplay() already uses for PairField,
  // so the column header and the values it labels always agree on which
  // category they're describing.
  function activePlacementCategoryKey() {
    if (state.lbAggregate === 'individual') {
      return (lbIndividualKpiField() === 'gross') ? 'individualGross' : 'individualNet';
    }
    if (competition === 'PairPair') return 'matchResult';
    const useGross = (state.lbKpi === 'gross') || (state.lbKpi === 'game' && scoringMethod() === 'ADJ GROSS');
    return useGross ? 'gross' : 'net';
  }

  // "Points" vs "Default Points" — the only two column-header variants.
  // "disabled" categories never reach this: PairField/Individual disable the
  // whole pill instead (so the column showing them is unreachable), and
  // matchResult (no corresponding pill — see lbNetGrossDisabled) falls back
  // to dash-per-value via matchResultDisplay() instead of a header change.
  function pointsColumnLabel(categoryKey) {
    return (placementStates[categoryKey] === 'default') ? 'Default Points' : 'Points';
  }

  // matchResult has no Gross/Net-style pill to disable — PairPair match
  // points aren't chosen via a toggle, they're always shown alongside the
  // match, computed from the game's own scoring method. So "disabled" for
  // matchResult specifically means dash-in-place-of-value, not pill-disabling.
  function matchResultDisplay(rawPoints) {
    return (placementStates.matchResult === 'disabled') ? '—' : fmtNum(rawPoints);
  }

  // Net/Gross pill-disabling (Option 1) only applies where a Gross/Net
  // toggle actually exists and actually governs the Points column: PairField
  // Pairing/Team (gross/net categories) and Individual grain, for either
  // competition (individualGross/individualNet). PairPair's Pairing/Team
  // grains have no gross/net-specific points category — matchResult isn't
  // split by gross/net — so neither pill is disabled there.
  function lbNetGrossDisabled() {
    if (state.lbAggregate === 'individual') {
      return { net: placementStates.individualNet === 'disabled', gross: placementStates.individualGross === 'disabled' };
    }
    if (competition === 'PairField') {
      return { net: placementStates.net === 'disabled', gross: placementStates.gross === 'disabled' };
    }
    return { net: false, gross: false };
  }

  // If the currently-selected KPI pill would be disabled for the (possibly
  // just-changed) grain, fall back to the first still-enabled pill in
  // net -> gross -> game priority order, rather than leaving state.lbKpi
  // pointing at something the person can no longer click.
  function correctLbKpiIfDisabled() {
    const teamGrain = (state.lbAggregate === 'team');
    const individualGrain = (state.lbAggregate === 'individual');
    const nd = lbNetGrossDisabled();
    const gameDisabled = individualGrain || (competition === 'PairField' && teamGrain);
    const disabledMap = { net: nd.net, gross: nd.gross, game: gameDisabled };
    if (!disabledMap[state.lbKpi]) return;
    const fallback = ['net', 'gross', 'game'].find((k) => !disabledMap[k]);
    if (fallback) state.lbKpi = fallback;
  }

  // Top-level "disabled" suppresses the Leaderboard tab entirely; "default"
  // labels the section header so it's clear these are seeded, un-configured
  // values rather than something a human actively set up.
  function applyPlacementTopLevelState() {
    const lbTabBtn = dom.ssTabs?.querySelector('[data-tab="leaderboard"]');
    if (lbTabBtn && placementStates.top === 'disabled') {
      lbTabBtn.disabled = true;
      lbTabBtn.classList.add('is-disabled');
    }
    if (dom.lbSectionTitle) {
      dom.lbSectionTitle.textContent = (placementStates.top === 'default')
        ? 'LEADERBOARD using Default Points'
        : 'LEADERBOARD';
    }
  }

  function lbRenderControls() {
    if (!dom.lbControls) return;

    const teamGrain = (state.lbAggregate === 'team');
    const individualGrain = (state.lbAggregate === 'individual');
    const showKpiPills = !(competition === 'PairPair' && teamGrain);
    // Game is disabled at Individual grain for EITHER competition type —
    // individualRows only ever carries grossDiff/netDiff (§4.3's "no
    // ranking/points at this grain" applies to the native-metric concept
    // too, not just Points). Also disabled at PairField's Team grain, since
    // teamRollup only sums Gross/Net there. PairPair's Team grain hides KPI
    // pills entirely (see showKpiPills above), so this doesn't apply to it.
    const gameDisabled = individualGrain || (competition === 'PairField' && teamGrain);
    const nd = lbNetGrossDisabled();

    const kpiPillsHtml = showKpiPills ? `
      <button class="maChoiceChip ${state.lbKpi === 'net' ? 'is-selected' : ''} ${nd.net ? 'is-disabled' : ''}" data-lbkpi="net" type="button" ${nd.net ? 'disabled' : ''}>Net</button>
      <button class="maChoiceChip ${state.lbKpi === 'gross' ? 'is-selected' : ''} ${nd.gross ? 'is-disabled' : ''}" data-lbkpi="gross" type="button" ${nd.gross ? 'disabled' : ''}>Gross</button>
      <button class="maChoiceChip ${state.lbKpi === 'game' ? 'is-selected' : ''} ${gameDisabled ? 'is-disabled' : ''}" data-lbkpi="game" type="button" ${gameDisabled ? 'disabled' : ''}>${esc(gameTabLabel())}</button>
    ` : '';

    dom.lbControls.innerHTML = `
      <div class="lbControlsRow">
        <div class="maChoiceChips">${kpiPillsHtml}</div>
        <div class="maChoiceChips">
          <button class="maChoiceChip ${state.lbAggregate === 'individual' ? 'is-selected' : ''}" data-lbagg="individual" type="button">Individual</button>
          <button class="maChoiceChip ${state.lbAggregate === 'pairing' ? 'is-selected' : ''}" data-lbagg="pairing" type="button">Pairing</button>
          <button class="maChoiceChip ${state.lbAggregate === 'team' ? 'is-selected' : ''}" data-lbagg="team" type="button">Team</button>
        </div>
      </div>
    `;

    dom.lbControls.querySelectorAll('[data-lbkpi]').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        state.lbKpi = btn.dataset.lbkpi;
        lbRenderControls();
        lbRenderBody();
      });
    });
    dom.lbControls.querySelectorAll('[data-lbagg]').forEach((btn) => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        state.lbAggregate = btn.dataset.lbagg;
        correctLbKpiIfDisabled();
        lbRenderControls();
        lbRenderBody();
      });
    });
  }

  // ---------- PairField ----------

  function lbPairFieldKpiDisplay(row) {
    if (state.lbKpi === 'gross') return row.grossDiffDisplay ?? '—';
    if (state.lbKpi === 'net') return row.netDiffDisplay ?? '—';
    if (isSkinsBasis()) return skinsDisplay(row);
    if (isPointsBasis()) return pointsDisplay(row);
    return (scoringMethod() === 'ADJ GROSS') ? (row.grossDiffDisplay ?? '—') : (row.netDiffDisplay ?? '—');
  }

  // Distinct from the existing pairFieldPointsDisplay() above, which shows
  // the game's own Points-basis score — this shows dbGames_PlacementPoints
  // ranking points, a different concept that happens to share the word
  // "points." Kept as two clearly-named functions on purpose, not merged.
  function lbPlacementPointsDisplay(row) {
    const useGross = (state.lbKpi === 'gross') || (state.lbKpi === 'game' && scoringMethod() === 'ADJ GROSS');
    const v = useGross ? row.placementPointsGross : row.placementPointsNet;
    return fmtNum(v);
  }

  function lbRenderPairFieldPairingRows() {
    const sorted = rows().slice().sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

    const header = `
      <div class="maListRow maListRow--static lbHeaderRow">
        <span class="maListRow__col--muted lbColRank">#</span>
        <span class="maListRow__col--muted lbColName">Pairing</span>
        <span class="maListRow__col--muted lbColThru">Thru</span>
        <span class="maListRow__col--muted lbColKpi">${esc(state.lbKpi === 'game' ? gameTabLabel() : (state.lbKpi === 'gross' ? 'Gross' : 'Net'))}</span>
        <span class="maListRow__col--muted lbColPts">${esc(pointsColumnLabel(activePlacementCategoryKey()))}</span>
      </div>
    `;

    const body = sorted.map((row) => `
      <div class="maListRow maListRow--static ${row.isLeader ? 'is-leading' : ''}">
        <span class="maListRow__col lbColRank">${esc(row.rank ?? '')}</span>
        <span class="maListRow__col lbColName">${lbTeamDotHtml(row.teamColor)}${esc(row.pairingLabel || '')}</span>
        <span class="maListRow__col--muted lbColThru">${esc(formatThru(row.thru))}</span>
        <span class="maListRow__col lbColKpi">${esc(lbPairFieldKpiDisplay(row))}</span>
        <span class="maListRow__col--muted lbColPts">${esc(lbPlacementPointsDisplay(row))}</span>
      </div>
    `).join('');

    return `${header}${body || `<div class="maEmptyState">No standings available.</div>`}`;
  }

  // Shared by display and sort — 'game' has no separate per-player metric
  // (no individual skins/points/holes-differential exists), falls back to
  // gross/net per the game's scoringMethod, same resolution Pairing already
  // uses for Strokes basis.
  function lbIndividualKpiField() {
    return ((state.lbKpi === 'gross') || (state.lbKpi === 'game' && scoringMethod() === 'ADJ GROSS'))
      ? 'gross' : 'net';
  }

  function lbIndividualSortLabel(key) {
    return { playerLastName: 'Player', thru: 'Thru', kpi: gameTabLabelForKpiColumn() }[key] || 'Value';
  }

  function gameTabLabelForKpiColumn() {
    return state.lbKpi === 'game' ? gameTabLabel() : (state.lbKpi === 'gross' ? 'Gross' : 'Net');
  }

  function lbApplyIndividualSort(list) {
    const key = state.lbSortKey;
    const dir = (state.lbSortDir === 'desc') ? -1 : 1;
    const kpiField = lbIndividualKpiField();

    return [...list].sort((a, b) => {
      if (key === 'thru') return ((a.thru ?? 0) - (b.thru ?? 0)) * dir;
      if (key === 'kpi') {
        // grossDiffValue/netDiffValue resolve to 0.0, not null, for a player
        // who hasn't started (backend's displayToNumeric("-") falls through
        // to its numeric-or-zero default) — 0.0 would otherwise rank an
        // unplayed round as if it were "even par," landing it mid-pack.
        // thru === 0 is the reliable "hasn't started" signal instead.
        // Empty always sorts last, regardless of asc/desc — only real scores
        // are ordered by dir.
        const aEmpty = (a.thru ?? 0) === 0;
        const bEmpty = (b.thru ?? 0) === 0;
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        const av = (kpiField === 'gross') ? a.grossDiffValue : a.netDiffValue;
        const bv = (kpiField === 'gross') ? b.grossDiffValue : b.netDiffValue;
        return ((av ?? 0) - (bv ?? 0)) * dir;
      }
      // playerLastName — per explicit decision, sort by last name, not the
      // full display name.
      return String(a.playerLastName || '').localeCompare(String(b.playerLastName || '')) * dir;
    });
  }

  function lbSetIndividualSort(key, dir) {
    state.lbSortKey = key;
    state.lbSortDir = (dir === 'desc') ? 'desc' : 'asc';
    lbRenderBody();
  }

  function lbOpenIndividualCellMenu(cell) {
    const ui = window.MA?.ui;
    if (typeof ui?.openActionsMenu !== 'function') return;

    const sortKey = cell.dataset.sortKey || '';
    const displayVal = cell.dataset.displayValue || cell.textContent.trim();
    const label = lbIndividualSortLabel(sortKey);
    const isNumeric = (sortKey === 'thru' || sortKey === 'kpi');
    const actions = isNumeric
      ? [
          { label: `Sort ${label} Low to High`, action: () => lbSetIndividualSort(sortKey, 'asc') },
          { label: `Sort ${label} High to Low`, action: () => lbSetIndividualSort(sortKey, 'desc') },
        ]
      : [
          { label: `Sort ${label} A to Z`, action: () => lbSetIndividualSort(sortKey, 'asc') },
          { label: `Sort ${label} Z to A`, action: () => lbSetIndividualSort(sortKey, 'desc') },
        ];

    ui.openActionsMenu(displayVal || label, actions, label);
  }

  function lbRenderPairFieldIndividualRows() {
    const list = lbApplyIndividualSort(Array.isArray(payload.individualRows) ? payload.individualRows : []);
    const kpiField = lbIndividualKpiField();
    const kpiLabel = gameTabLabelForKpiColumn();
    const ptsLabel = pointsColumnLabel(activePlacementCategoryKey());

    const header = `
      <div class="maListRow maListRow--static lbHeaderRow">
        <span class="maListRow__col--muted lbColName">Player</span>
        <span class="maListRow__col--muted lbColThru">Thru</span>
        <span class="maListRow__col--muted lbColKpi">${esc(kpiLabel)}</span>
        <span class="maListRow__col--muted lbColPts">${esc(ptsLabel)}</span>
      </div>
    `;

    const body = list.map((p) => {
      const kpiDisplay = (kpiField === 'gross') ? p.grossDiffDisplay : p.netDiffDisplay;
      const ptsValue = (kpiField === 'gross') ? p.placementPointsGross : p.placementPointsNet;

      return `
        <div class="maListRow maListRow--static">
          <span class="maListRow__col lbColName" data-lb-menu data-sort-key="playerLastName" data-display-value="${esc(p.playerName || '')}">${lbTeamDotHtml(p.teamColor)}${esc(p.playerName || '')}</span>
          <span class="maListRow__col--muted lbColThru" data-lb-menu data-sort-key="thru" data-display-value="${esc(formatThru(p.thru))}">${esc(formatThru(p.thru))}</span>
          <span class="maListRow__col lbColKpi" data-lb-menu data-sort-key="kpi" data-display-value="${esc(kpiDisplay ?? '—')}">${esc(kpiDisplay ?? '—')}</span>
          <span class="maListRow__col--muted lbColPts">${esc(fmtNum(ptsValue))}</span>
        </div>
      `;
    }).join('');

    return `${header}${body || `<div class="maEmptyState">No individual scores available.</div>`}`;
  }

  function lbRenderPairFieldTeamRows() {
    const sorted = teamRollup.slice().sort((a, b) => (a.teamSort ?? 999) - (b.teamSort ?? 999));

    const header = `
      <div class="maListRow maListRow--static lbHeaderRow">
        <span class="maListRow__col--muted lbColName">Team</span>
        <span class="maListRow__col--muted lbColKpi">${esc(state.lbKpi === 'gross' ? 'Gross' : 'Net')}</span>
        <span class="maListRow__col--muted lbColPts">${esc(pointsColumnLabel(activePlacementCategoryKey()))}</span>
      </div>
    `;

    const body = sorted.map((team) => {
      const kpiVal = (state.lbKpi === 'gross') ? team.grossDiffTotal : team.netDiffTotal;
      const ptsVal = (state.lbKpi === 'gross') ? team.placementPointsGrossTotal : team.placementPointsNetTotal;
      return `
        <div class="maListRow maListRow--static">
          <span class="maListRow__col lbColName">${lbTeamDotHtml(team.teamColor)}${esc(team.teamName || team.teamKey)}</span>
          <span class="maListRow__col lbColKpi">${esc(fmtNum(kpiVal))}</span>
          <span class="maListRow__col--muted lbColPts">${esc(fmtNum(ptsVal))}</span>
        </div>
      `;
    }).join('');

    return `${header}${body || `<div class="maEmptyState">No team config set for this game.</div>`}`;
  }

  // ---------- PairPair ----------

  // Delegates entirely to the existing segment-accessor functions defined
  // above (skinsSegments/pointsSegments/strokeDiffSegmentsByMode/
  // pairPairSegmentLines) — no duplicate segment-reading logic here.
  function lbPairPairKpiSegments(row, side) {
    const sideData = row[side] || {};

    if (state.lbKpi === 'gross' || state.lbKpi === 'net') {
      if (scoringSegments() === 1) {
        const d = (state.lbKpi === 'gross') ? sideData.grossDiffDisplay : sideData.netDiffDisplay;
        return { overall: d ?? '—' };
      }
      return strokeDiffSegmentsByMode(sideData, state.lbKpi);
    }

    // 'game'
    if (scoringBasis() === 'Holes') {
      if (scoringSegments() === 1) return { overall: sideData.gameDisplay ?? '—' };
      return pairPairSegmentLines(row, side);
    }
    if (isSkinsBasis()) {
      return (scoringSegments() === 1) ? { overall: skinsDisplay(sideData) } : skinsSegments(sideData);
    }
    if (isPointsBasis()) {
      return (scoringSegments() === 1) ? { overall: pointsDisplay(sideData) } : pointsSegments(sideData);
    }
    // Strokes basis — 'game' means the same thing as Gross/Net per scoringMethod
    if (scoringSegments() === 1) {
      const d = (scoringMethod() === 'ADJ GROSS') ? sideData.grossDiffDisplay : sideData.netDiffDisplay;
      return { overall: d ?? '—' };
    }
    return strokeDiffSegments(sideData);
  }

  function lbSegmentsInlineString(segs) {
    const parts = [];
    if (scoringSegments() === 3) {
      parts.push(`Front: ${esc(segs.front)}`);
      parts.push(`Back: ${esc(segs.back)}`);
    }
    parts.push(`Overall: ${esc(segs.overall)}`);
    return parts.join(' · ');
  }

  function lbSidePointsLabel(side) {
    const overall = side.matchStatus?.total;
    if (!overall || overall.points === null || overall.points === undefined) return '—';
    const display = matchResultDisplay(overall.points);
    return (display === '—') ? '—' : `${display} pts`;
  }

  function lbSideIsLeading(side) {
    return side.matchStatus?.total?.status === 'W';
  }

  function lbRenderPairPairPairingRows() {
    const dataRows = rows();
    if (!dataRows.length) return `<div class="maEmptyState">No standings available.</div>`;

    return dataRows.map((row) => {
      const left = row.left || {};
      const right = row.right || {};
      const leftSegs = lbPairPairKpiSegments(row, 'left');
      const rightSegs = lbPairPairKpiSegments(row, 'right');

      return `
        <div class="lbMatchRow">
          <div class="lbMatchSide ${lbSideIsLeading(left) ? 'is-leading' : ''}">
            <div class="lbMatchSideTop">
              <span class="lbMatchSideName">${lbTeamDotHtml(left.teamColor)}${esc(row.matchLabelTop || '')}</span>
              <span class="lbMatchSidePoints">${esc(lbSidePointsLabel(left))}</span>
            </div>
            <div class="lbMatchSideSegments">${lbSegmentsInlineString(leftSegs)}</div>
          </div>
          <span class="lbMatchVs">vs</span>
          <div class="lbMatchSide ${lbSideIsLeading(right) ? 'is-leading' : ''}">
            <div class="lbMatchSideTop">
              <span class="lbMatchSideName">${lbTeamDotHtml(right.teamColor)}${esc(row.matchLabelBottom || '')}</span>
              <span class="lbMatchSidePoints">${esc(lbSidePointsLabel(right))}</span>
            </div>
            <div class="lbMatchSideSegments">${lbSegmentsInlineString(rightSegs)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function lbRenderPairPairTeamRows() {
    const sorted = teamRollup.slice().sort((a, b) => (a.teamSort ?? 999) - (b.teamSort ?? 999));

    const header = `
      <div class="maListRow maListRow--static lbHeaderRow">
        <span class="maListRow__col--muted lbColName">Team</span>
        <span class="maListRow__col--muted lbColRecord">Record</span>
        <span class="maListRow__col--muted lbColPts">${esc(pointsColumnLabel('matchResult'))}</span>
      </div>
    `;

    const body = sorted.map((team) => `
      <div class="maListRow maListRow--static">
        <span class="maListRow__col lbColName">${lbTeamDotHtml(team.teamColor)}${esc(team.teamName || team.teamKey)}</span>
        <span class="maListRow__col--muted lbColRecord">${team.record.w}-${team.record.l}-${team.record.h}</span>
        <span class="maListRow__col--muted lbColPts">${esc(matchResultDisplay(team.pointsTotal))}</span>
      </div>
    `).join('');

    return `${header}${body || `<div class="maEmptyState">No team config set for this game, or this game is rotation-aware (Team is not shown for COD/1324/1423 games).</div>`}`;
  }

  function lbRenderBody() {
    if (!dom.lbHost) return;

    // Each render function returns its own context-specific .maEmptyState
    // message when empty (e.g. "No team config" vs "No standings available")
    // — more useful than one generic message, so there's no separate
    // dom.lbEmpty toggle here; #lbEmpty in the view is unused by design.
    dom.lbHost.innerHTML = (state.lbAggregate === 'individual') ? lbRenderPairFieldIndividualRows()
      : (competition === 'PairPair')
      ? ((state.lbAggregate === 'team') ? lbRenderPairPairTeamRows() : lbRenderPairPairPairingRows())
      : (state.lbAggregate === 'team') ? lbRenderPairFieldTeamRows()
      : lbRenderPairFieldPairingRows();
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

    if (competition === 'PairPair') {
      dom.host.innerHTML = renderPairPairCards(dataRows);
      return;
    }

    dom.host.innerHTML = renderPairFieldCards(dataRows);
  }

  function initialize() {
    correctLbKpiIfDisabled();
    applyChrome();
    renderControls();
    renderBody();
    lbRenderControls();
    lbRenderBody();
    applyPlacementTopLevelState();
    wireOuterTabs();
    wireIndividualSortMenu();
  }

  // Delegated once on the container — dom.lbHost's innerHTML is replaced on
  // every render, but the element itself persists, so this only needs
  // binding once. Only Individual's cells carry [data-lb-menu]; Pairing/Team
  // markup never sets that attribute, so this is a no-op for them by
  // construction, not a grain check.
  function wireIndividualSortMenu() {
    dom.lbHost?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-lb-menu]');
      if (!cell || !dom.lbHost.contains(cell)) return;
      lbOpenIndividualCellMenu(cell);
    });
  }

  // Score Summary / Leaderboard tab strip (#ssTabs) — a pure visibility
  // toggle between the two .maPanel sections. Both panels' render functions
  // already ran during initialize() above, against the same window.__INIT__
  // payload — switching tabs never re-fetches or re-renders anything.
  function wireOuterTabs() {
    const tabsEl = document.getElementById('ssTabs');
    const mainEl = document.getElementById('ssMain');
    const controlsEl = document.getElementById('ssPanelControls');
    if (!tabsEl || !mainEl) return;

    tabsEl.querySelectorAll('.maSegBtn[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const tab = btn.dataset.tab;

        tabsEl.querySelectorAll('.maSegBtn').forEach((b) => {
          const on = b.dataset.tab === tab;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
        });

        const activeClass = (tab === 'leaderboard') ? 'is-leaderboard-only' : 'is-summary-only';
        [mainEl, controlsEl].forEach((el) => {
          if (!el) return;
          el.classList.remove('is-summary-only', 'is-leaderboard-only');
          el.classList.add(activeClass);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();