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
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  // -------------------------------------------------------------------------
  // Row builder — suppresses empty values
  // -------------------------------------------------------------------------

  function row(label, value) {
    const v = val(value);
    if (v === null) return '';
    return `
      <div class="sh-gfd__row">
        <span class="sh-gfd__key">${esc(label)}</span>
        <span class="sh-gfd__val">${esc(v)}</span>
      </div>`;
  }

  function sectionHeader(label) {
    return `<div class="sh-gfd__section">${esc(label)}</div>`;
  }

  // -------------------------------------------------------------------------
  // Render sections from db_Games record
  // -------------------------------------------------------------------------

  function renderGeneral(g) {
    const rotation = val(g.dbGames_RotationMethod);
    const blind    = val(g.dbGames_BlindPlayer);
    const segments = val(g.dbGames_Segments);

    return sectionHeader('General') +
      row('Course',      g.dbGames_CourseName) +
      row('Date',        formatDate(g.dbGames_PlayDate)) +
      row('Game label',  g.dbGames_Title) +
      row('Game format', g.dbGames_GameFormat) +
      row('Competition', g.dbGames_Competition) +
      (rotation && rotation !== 'None' ? row('Rotation', rotation) : '') +
      (blind    ? row('Blind player', blind)    : '') +
      (segments ? row('Segments',     segments) : '');
  }

  function renderScoring(g) {
    const system   = val(g.dbGames_ScoringSystem) || '';
    const bestBall = val(g.dbGames_BestBall);
    const pts      = val(g.dbGames_PtsStrategy);

    return sectionHeader('Scoring') +
      row('Basis',  g.dbGames_ScoringBasis) +
      row('Method', g.dbGames_ScoringMethod) +
      row('System', g.dbGames_ScoringSystem) +
      (system === 'BestBall' && bestBall ? row('Best ball', bestBall) : '') +
      (pts ? row('Pts strategy', pts) : '');
  }

  function renderHandicaps(g) {
    return sectionHeader('Handicaps') +
      row('HC method',    g.dbGames_HCMethod) +
      row('Allowance',    g.dbGames_HCAllowance ? `${g.dbGames_HCAllowance}%` : null) +
      row('Stroke dist.', g.dbGames_StrokeDistribution) +
      row('HC eff.',      g.dbGames_HCEffective);
  }

  // -------------------------------------------------------------------------
  // Modal render
  // -------------------------------------------------------------------------

  function buildModal(gameRow) {
    const g = gameRow || {};

    const overlay = document.createElement('div');
    overlay.className = 'maModalOverlay is-open';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Game details');

    overlay.innerHTML = `
      <section class="maModal sh-gfd__modal">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Game details</div>
          </div>
          <button type="button" class="iconBtn btnPrimary sh-gfd__close" aria-label="Close">&#x2715;</button>
        </header>
        <div class="maModal__body sh-gfd__body">
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
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }

  // -------------------------------------------------------------------------
  // Register on MA namespace
  // -------------------------------------------------------------------------

  MA.gameDetails = { open };
  window.MA = MA;

})();
