/* /assets/modules/module_DisplayGameFormat.js
   Standalone game format display module.
   Accepts the full db_Games record and renders a modal with game details.

   Usage:
     MA.gameDetails.open(gameRow);

   Call from any page Actions menu that has a gameRow in its payload.
   The modal is self-cleaning on close — no DOM pollution between calls.
*/

(function () {
  'use strict';

  const MA = window.MA || {};

  // -------------------------------------------------------------------------
  // Label definitions — all display labels maintained here in one place.
  // To rename a label on screen, edit the value here only.
  // -------------------------------------------------------------------------

  const LABELS = {
    // General
    gameLabel:          'Game Title',
    gameFormat:         'Format',
    competition:        'Competition',
    holes:              '#Holes',
    courseName:         'Course',
    playDate:           'Play Date',
    rotationMethod:     'Rotation',
    segments:           'Segments',
    blindPlayer:        'Blind player',

    // Scoring
    scoringBasis:       'Basis',
    scoringMethod:      'Method',
    scoringSystem:      'System',
    bestBall:           'Best ball',
    ptsStrategy:        'Points strategy',
    ptsConfig:          'Points config',
    holeDeclaration:    'BestBall per hole',

    // Handicaps
    hcMethod:           'Handicap',
    hcAllowance:        'HC Allowance',
    strokeDistribution: 'Stroke distribution',
    hcEffective:        'HC Effective',
    hcEffectiveDate:    'HC Eff. Date',

    // Section headers
    sectionGeneral:     'General',
    sectionScoring:     'Scoring',
    sectionHandicaps:   'Handicaps',
  };

  // -------------------------------------------------------------------------
  // Competition display map
  // -------------------------------------------------------------------------

  const COMPETITION_DISPLAY = {
    'PairPair':  'Pair v. Pair',
    'PairField': 'Pair v. Field',
  };

  // -------------------------------------------------------------------------
  // Points strategy display map
  // -------------------------------------------------------------------------

  const POINTS_STRATEGY_DISPLAY = {
    'Stableford':      'Stableford',
    'Nines':           "9's",
    'LowBallLowTotal': 'Low-Ball / Low-Total',
    'LowBallHighBall': 'Low-Ball / High-Ball',
    'Vegas':           'Vegas',
    'Chicago':         'Chicago',
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function val(v) {
    const s = String(v ?? '').trim();
    return (s === '' || s === '—' || s === 'null') ? null : s;
  }

  function formatDate(s) {
    if (!s) return null;
    let d;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return String(s);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm      = String(d.getMonth() + 1).padStart(2, '0');
    const dd      = String(d.getDate()).padStart(2, '0');
    const yy      = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  // Parse dbGames_PointsConfig — handles both new envelope and legacy flat array
  function parsePointsConfig(raw) {
    let parsed = raw;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { return null; }
    }
    if (!parsed) return null;
    // New envelope: { strategy, values }
    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed.strategy) {
      return parsed;
    }
    // Legacy: flat stableford array
    if (Array.isArray(parsed) && parsed.length) {
      return { strategy: 'Stableford', values: parsed };
    }
    return null;
  }

  // Format Stableford values into a readable string e.g. "Eagle+:5 · Birdie:4 · Par:3 · Bogey:1"
  function formatStablefordValues(values) {
    if (!Array.isArray(values)) return null;
    const relNames = { '-3': 'Eagle+', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Bogey+', '3': 'Triple+' };
    return values
      .filter(r => Number(r.points) > 0)
      .map(r => {
        const name = relNames[String(r.reltoPar)] || `${r.reltoPar > 0 ? '+' : ''}${r.reltoPar}`;
        return `${name}: ${r.points}`;
      })
      .join(' · ') || null;
  }

  // Format Nines distribution e.g. "5 · 3 · 1 · 0"
  function formatNinesValues(values) {
    if (!Array.isArray(values)) return null;
    return values.join(' · ');
  }

  // Format hole declaration array e.g. "1:2 · 2:1 · 3:2 ..."
  function formatHoleDeclaration(raw) {
    let arr = raw;
    if (typeof arr === 'string') {
      try { arr = JSON.parse(arr); } catch (e) { return null; }
    }
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr
      .slice()
      .sort((a, b) => Number(a.hole) - Number(b.hole))
      .map(r => `H${r.hole}: ${r.count}`)
      .join(' · ');
  }

  // -------------------------------------------------------------------------
  // Row builder — suppresses empty values
  // -------------------------------------------------------------------------

  function row(labelKey, value) {
    const v = val(value);
    if (v === null) return '';
    return `
      <div class="maListRow maListRow--static">
        <span class="maListRow__col--muted">${esc(LABELS[labelKey] ?? labelKey)}</span>
        <span class="maListRow__col maListRow__col--right">${esc(v)}</span>
      </div>`;
  }

  function sectionHeader(labelKey) {
    return `<div class="maListRow__group">${esc(LABELS[labelKey] ?? labelKey)}</div>`;
  }

  // -------------------------------------------------------------------------
  // Render sections from db_Games record
  // -------------------------------------------------------------------------

  function renderGeneral(g) {
    const rotation    = val(g.dbGames_RotationMethod);
    const blind       = val(g.dbGames_BlindPlayer);
    const segments    = val(g.dbGames_Segments);
    const holes       = val(g.dbGames_Holes);
    const competition = val(g.dbGames_Competition);
    const compDisplay = competition
      ? (COMPETITION_DISPLAY[competition] || competition)
      : null;

    return sectionHeader('sectionGeneral') +
      row('gameLabel',      g.dbGames_GameLabel || g.dbGames_Title) +
      row('gameFormat',     g.dbGames_GameFormat) +
      row('competition',    compDisplay) +
      row('holes',          holes && holes !== 'All 18' ? holes : null) +
      row('courseName',     g.dbGames_CourseName) +
      row('playDate',       formatDate(g.dbGames_PlayDate)) +
      (rotation && rotation !== 'None' ? row('rotationMethod', rotation) : '') +
      (segments ? row('segments', segments) : '') +
      (blind    ? row('blindPlayer', blind) : '');
  }

  function renderScoring(g) {
    const system   = val(g.dbGames_ScoringSystem) || '';
    const bestBall = val(g.dbGames_BestBall);

    // Points config
    const rawPts      = g.dbGames_PointsConfig ?? g.dbGames_StablefordPoints ?? null;
    const ptsConfig   = rawPts ? parsePointsConfig(rawPts) : null;
    const ptsStrategy = ptsConfig ? ptsConfig.strategy : null;
    const ptsStrategyDisplay = ptsStrategy
      ? (POINTS_STRATEGY_DISPLAY[ptsStrategy] || ptsStrategy)
      : null;

    // Points config detail line
    let ptsDetail = null;
    if (ptsConfig) {
      switch (ptsStrategy) {
        case 'Stableford':
          ptsDetail = formatStablefordValues(ptsConfig.values);
          break;
        case 'Nines':
          ptsDetail = ptsConfig.values ? formatNinesValues(ptsConfig.values) : null;
          break;
        default:
          ptsDetail = null;
      }
    }

    // Hole declaration (DeclareHole system)
    const holeDecl = system === 'DeclareHole'
      ? formatHoleDeclaration(g.dbGames_HoleDeclaration)
      : null;

    return sectionHeader('sectionScoring') +
      row('scoringBasis',  g.dbGames_ScoringBasis) +
      row('scoringMethod', g.dbGames_ScoringMethod) +
      row('scoringSystem', g.dbGames_ScoringSystem) +
      (system === 'BestBall' && bestBall ? row('bestBall', `${bestBall} score${Number(bestBall) !== 1 ? 's' : ''}`) : '') +
      (holeDecl           ? row('holeDeclaration', holeDecl)    : '') +
      (ptsStrategyDisplay ? row('ptsStrategy',     ptsStrategyDisplay) : '') +
      (ptsDetail          ? row('ptsConfig',        ptsDetail)   : '');
  }

  function renderHandicaps(g) {
    const hcEff     = val(g.dbGames_HCEffectivity);
    const hcEffDate = val(g.dbGames_HCEffectivityDate);

    return sectionHeader('sectionHandicaps') +
      row('hcMethod',           g.dbGames_HCMethod) +
      row('hcAllowance',        g.dbGames_HCAllowance ? `${g.dbGames_HCAllowance}%` : null) +
      row('strokeDistribution', g.dbGames_StrokeDistribution) +
      row('hcEffective',        hcEff) +
      (hcEff === 'Date' && hcEffDate ? row('hcEffectiveDate', formatDate(hcEffDate)) : '');
  }

  // -------------------------------------------------------------------------
  // Modal render
  // -------------------------------------------------------------------------

  function buildModal(gameRow) {
    const g = gameRow || {};

    const overlay = document.createElement('div');
    overlay.className = 'maModalOverlay is-open';
    overlay.setAttribute('role',       'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Game details');

    overlay.innerHTML = `
      <section class="maModal" style="max-width:480px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Game details</div>
          </div>
          <button type="button" class="iconBtn btnPrimary sh-gfd__close" aria-label="Close">&#x2715;</button>
        </header>
        <div class="maModal__body maModal__body--flush">
          ${renderGeneral(g)}
          ${renderScoring(g)}
          ${renderHandicaps(g)}
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="btn btnSecondary sh-gfd__closeBtn">Close</button>
        </footer>
      </section>`;

    return overlay;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function open(gameRow) {
    const existing = document.getElementById('maGameDetailsOverlay');
    if (existing) existing.remove();

    const overlay = buildModal(gameRow);
    overlay.id = 'maGameDetailsOverlay';
    document.body.appendChild(overlay);
    document.body.classList.add('maOverlayOpen');

    function close() {
      overlay.remove();
      document.body.classList.remove('maOverlayOpen');
    }

    overlay.querySelector('.sh-gfd__close').addEventListener('click', close);
    overlay.querySelector('.sh-gfd__closeBtn').addEventListener('click', close);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  // -------------------------------------------------------------------------
  // Register on MA namespace
  // -------------------------------------------------------------------------

  MA.gameDetails = { open };
  window.MA = MA;

})();