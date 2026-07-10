/* /assets/pages/event_summary.js */
(function () {
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.summary || {};
  const flights = Array.isArray(payload.flights) ? payload.flights : [];
  const meta = payload.meta || {};
  const pairingFixed = String(meta.pairingMode || 'none') === 'fixed';
  const teamFixed = String(meta.teamMode || 'none') === 'fixed';
  const rounds = Array.isArray(meta.rounds) ? meta.rounds : [];

  // Same four values as ServiceBuildEventSummary::NON_PERSONAL_SCORE_FORMATS
  // — kept here only for the is-excluded visual cue on a round cell, never
  // for any calculation (that's server-side, already reflected in
  // countsTowardStrokes per round).
  const state = {
    flightKey: flights[0] ? flights[0].flightKey : null,
    view: 'individual',       // 'individual' | 'pairing' | 'team'
    metric: 'gross',          // Individual only — 'gross' | 'net'
  };

  const dom = {
    flightTabs: document.getElementById('esFlightTabs'),
    viewPills: document.getElementById('esViewPills'),
    metricPills: document.getElementById('esMetricPills'),
    host: document.getElementById('esHost'),
    empty: document.getElementById('esEmpty'),
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtNum(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const n = Number(v);
    return (n > 0 ? '+' : '') + (Number.isInteger(n) ? n : n.toFixed(1));
  }

  function fmtPoints(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '0';
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function currentFlight() {
    return flights.find((f) => f.flightKey === state.flightKey) || flights[0] || null;
  }

  // ── Pill/tab rendering — all built on .maSeg/.maSegBtn from ma_shared.css,
  //    no new chrome CSS needed for any of these three strips. ──────────────

  function renderFlightTabs() {
    if (!dom.flightTabs) return;
    if (flights.length <= 1) {
      dom.flightTabs.style.display = 'none';
      dom.flightTabs.innerHTML = '';
      return;
    }
    dom.flightTabs.style.display = '';
    dom.flightTabs.innerHTML = flights.map((f) => `
      <button class="maSegBtn ${f.flightKey === state.flightKey ? 'is-active' : ''}"
        data-flight="${esc(f.flightKey)}" type="button" role="tab"
        aria-selected="${f.flightKey === state.flightKey}">${esc(f.flightName)}</button>
    `).join('');
  }

  function renderViewPills() {
    if (!dom.viewPills) return;
    const options = [['individual', 'Individual']];
    if (pairingFixed) options.push(['pairing', 'Pairing']);
    if (teamFixed) options.push(['team', 'Team']);

    dom.viewPills.innerHTML = options.map(([key, label]) => `
      <button class="maSegBtn ${state.view === key ? 'is-active' : ''}"
        data-view="${key}" type="button" role="tab"
        aria-selected="${state.view === key}">${esc(label)}</button>
    `).join('');
  }

  function renderMetricPills() {
    if (!dom.metricPills) return;
    if (state.view !== 'individual') {
      dom.metricPills.style.display = 'none';
      dom.metricPills.innerHTML = '';
      return;
    }
    dom.metricPills.style.display = '';
    dom.metricPills.innerHTML = ['gross', 'net'].map((key) => `
      <button class="maSegBtn ${state.metric === key ? 'is-active' : ''}"
        data-metric="${key}" type="button" role="tab"
        aria-selected="${state.metric === key}">${key === 'gross' ? 'Gross' : 'Net'}</button>
    `).join('');
  }

  // ── Host content ─────────────────────────────────────────────────────────

  function render() {
    renderFlightTabs();
    renderViewPills();
    renderMetricPills();

    const flight = currentFlight();
    if (!flight) {
      showEmpty(true);
      return;
    }

    if (state.view === 'pairing') {
      renderGroupView(flight.pairing || [], 'pairing');
    } else if (state.view === 'team') {
      renderGroupView(flight.team || [], 'team');
    } else {
      renderIndividualView(flight.individual || []);
    }
  }

  function showEmpty(isEmpty) {
    if (dom.empty) dom.empty.style.display = isEmpty ? '' : 'none';
    if (dom.host) dom.host.style.display = isEmpty ? 'none' : '';
  }

  function renderIndividualView(players) {
    if (!players.length) { showEmpty(true); return; }
    showEmpty(false);

    const isGross = state.metric === 'gross';
    const sorted = players.slice().sort((a, b) => {
      const av = isGross ? a.totalGrossValue : a.totalNetValue;
      const bv = isGross ? b.totalGrossValue : b.totalNetValue;
      return (av ?? 0) - (bv ?? 0); // lower is better, same as round-level
    });

    dom.host.innerHTML = sorted.map((p, idx) => {
      const total = isGross ? p.totalGrossValue : p.totalNetValue;
      const perfPts = isGross ? p.totalPerformancePointsGross : p.totalPerformancePointsNet;
      const placePts = isGross ? p.eventPlacementPointsGross : p.eventPlacementPointsNet;

      const roundCells = (p.rounds || []).map((r, i) => {
        const roundLabel = (rounds[i] && rounds[i].roundLabel) || r.roundLabel || `R${i + 1}`;
        const scoreDisplay = isGross ? r.grossDiffDisplay : r.netDiffDisplay;
        const roundPts = isGross ? r.placementPointsGross : r.placementPointsNet;
        return `
          <div class="esRoundCell ${r.countsTowardStrokes ? '' : 'is-excluded'}">
            <div class="esRoundCell__label">${esc(roundLabel)}</div>
            <div class="esRoundCell__score">${esc(scoreDisplay)}</div>
            <div class="esRoundCell__points">${fmtPoints(roundPts)} pts</div>
          </div>`;
      }).join('');

      return `
        <div class="esPlayerCard ${idx === 0 ? 'is-leading' : ''}">
          <div class="esPlayerCard__hdr">
            <div class="esRank">${idx + 1}</div>
            ${p.teamColor ? `<div class="esTeamDot" style="background:${esc(p.teamColor)}" title="${esc(p.teamName || '')}"></div>` : ''}
            <div class="esPlayerCard__name">${esc(p.playerName || p.playerLastName || 'Player')}</div>
            <div class="esPlayerCard__totals">
              <div class="esTotalStrokes">${fmtNum(total)}</div>
              <div class="esTotalPoints">${fmtPoints(perfPts)} perf · ${fmtPoints(placePts)} place</div>
            </div>
          </div>
          <div class="esPlayerCard__rounds">${roundCells}</div>
        </div>`;
    }).join('');
  }

  function renderGroupView(rows, kind) {
    if (!rows.length) { showEmpty(true); return; }
    showEmpty(false);

    const sorted = rows.slice().sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)); // higher is better

    dom.host.innerHTML = sorted.map((row, idx) => {
      const label = kind === 'team' ? (row.teamName || row.teamKey) : (row.pairingLabel || row.pairingId);
      const record = (kind === 'team' && row.record)
        ? `<div class="esGroupCard__record">${row.record.w}-${row.record.l}-${row.record.h}</div>`
        : '';
      return `
        <div class="esGroupCard ${idx === 0 ? 'is-leading' : ''}">
          ${row.teamColor ? `<div class="esTeamDot" style="background:${esc(row.teamColor)}"></div>` : ''}
          <div class="esGroupCard__label">${esc(label)}</div>
          ${record}
          <div class="esGroupCard__points">
            <div class="esGroupCard__pointsTotal">${fmtPoints(row.totalPoints)}</div>
            <div class="esGroupCard__pointsLabel">${fmtPoints(row.eventPlacementPoints)} place pts</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Chrome — every event-context page drives this itself; including
  //    chromeHeader.php/chromeFooter.php is not sufficient on its own (see
  //    event_maintenance.js's own applyChrome() for the sibling pattern
  //    this mirrors). Read-only page: no footer save/cancel, no right-side
  //    Actions menu — just header lines and bottom-nav registration.

  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === 'function') {
      const title = (init.header && init.header.title) || 'Event Leaderboard';
      const subtitle = (init.header && init.header.subtitle) || '';
      chrome.setHeaderLines([title, subtitle, '']);
    }

    if (chrome && typeof chrome.setActions === 'function') {
      chrome.setActions({
        left: { show: false },
        right: { show: false },
        footer: null,
      });
    }

    if (chrome && typeof chrome.setBottomNav === 'function') {
      chrome.setBottomNav({
        visible: ['eventhome', 'eventedit', 'eventroster', 'eventrounds', 'eventsummary', 'eventscoring'],
        active: 'eventsummary',
        disabled: [],
        onNavigate: (id) => MA.routerGo(id),
      });
    }
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  if (dom.flightTabs) {
    dom.flightTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flight]');
      if (!btn) return;
      state.flightKey = btn.dataset.flight;
      render();
    });
  }
  if (dom.viewPills) {
    dom.viewPills.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      state.view = btn.dataset.view;
      render();
    });
  }
  if (dom.metricPills) {
    dom.metricPills.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-metric]');
      if (!btn) return;
      state.metric = btn.dataset.metric;
      render();
    });
  }

  applyChrome();
  render();
})();
