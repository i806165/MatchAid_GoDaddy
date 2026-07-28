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
  // Individual has no cascade-mode flag of its own — these come straight
  // from the KPI modal's own state (module_defineEventKPI.js's
  // grossPlacement/netPlacement), same source pairingFixed/teamFixed use
  // for Pairing/Team, just via a different field since Individual isn't
  // gated by a PairingMode/TeamMode-style column.
  const individualGrossActive = meta.individualGrossActive !== false;
  const individualNetActive = meta.individualNetActive !== false;
  const individualValid = individualGrossActive || individualNetActive;
  const rounds = Array.isArray(meta.rounds) ? meta.rounds : [];

  // Same four values as ServiceBuildEventSummary::NON_PERSONAL_SCORE_FORMATS
  // — a round in one of these formats has no personal per-player score, so
  // that day's score line is left empty (points still show). Kept in sync
  // manually with the PHP list — this file has no access to that constant
  // at build time.
  const NON_PERSONAL_SCORE_FORMATS = ['Scramble', 'Shamble', 'AltShot', 'Chapman'];

  const state = {
    view: 'individual',       // 'individual' | 'pairing' | 'team'
    metric: individualGrossActive ? 'gross' : 'net', // Individual only — 'gross' | 'net'
    collapsedFlights: new Set(),
  };

  const dom = {
    viewPills: document.getElementById('esViewPills'),
    metricPills: document.getElementById('esMetricPills'),
    host: document.getElementById('esHost'),
    empty: document.getElementById('esEmpty'),
    hint: document.getElementById('esHint'),
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

  // Points cell: blank (not "0") when nothing was actually assigned —
  // confirmed behavior for ranks beyond the event's configured points
  // table. A genuine zero-value place is visually indistinguishable from
  // this and treated the same, deliberately.
  function fmtPoints(v) {
    const n = Number(v || 0);
    if (!n) return '';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function fmtTally(v) {
    const n = Number(v || 0);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function ordinal(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    const mod100 = v % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
    switch (v % 10) {
      case 1: return `${v}st`;
      case 2: return `${v}nd`;
      case 3: return `${v}rd`;
      default: return `${v}th`;
    }
  }

  function allRoundsNonPersonal() {
    return rounds.length > 0 && rounds.every((r) => NON_PERSONAL_SCORE_FORMATS.includes(r.gameFormat));
  }

  function roundHeaderLabel(i) {
    const r = rounds[i];
    if (!r) return `Round ${i + 1}`;
    return r.gameFormat ? `Round ${i + 1}<br>${esc(r.gameFormat)}` : `Round ${i + 1}`;
  }

  // ── Pills — real .maChoiceChip/.maChoiceChips, metric (left) + view
  //    (right), per the confirmed round-level convention. ──────────────────

  function renderMetricPills() {
    if (!dom.metricPills) return;
    if (state.view !== 'individual') {
      dom.metricPills.innerHTML = '';
      return;
    }
    const options = ['net', 'gross'].filter((key) => (key === 'gross' ? individualGrossActive : individualNetActive));
    // Only one metric active for this event — nothing to toggle between,
    // so no pills at all rather than a single, effectively-inert chip.
    if (options.length < 2) {
      if (options.length === 1 && state.metric !== options[0]) state.metric = options[0];
      dom.metricPills.innerHTML = '';
      return;
    }
    dom.metricPills.innerHTML = options.map((key) => `
      <button class="maChoiceChip ${state.metric === key ? 'is-selected' : ''}"
        data-metric="${key}" type="button">${key === 'gross' ? 'Gross' : 'Net'}</button>
    `).join('');
  }

  function renderViewPills() {
    if (!dom.viewPills) return;
    // Individual is invalid either when every round's format has no
    // personal score (existing check) OR when neither Individual Gross
    // nor Individual Net Placement Points is active for this event —
    // same "not valid for this event, don't render it" treatment
    // Pairing/Team already get from pairingFixed/teamFixed, just gated
    // by KPI state instead of a cascade-mode column.
    const individualDisabled = allRoundsNonPersonal() || !individualValid;

    if (individualDisabled && state.view === 'individual') {
      state.view = pairingFixed ? 'pairing' : (teamFixed ? 'team' : 'individual');
    }

    const options = [
      ['individual', 'Individual', individualDisabled],
      ['pairing', 'Pairing', !pairingFixed],
      ['team', 'Team', !teamFixed],
    ];

    dom.viewPills.innerHTML = options.map(([key, label, isDisabled]) => `
      <button class="maChoiceChip ${state.view === key ? 'is-selected' : ''} ${isDisabled ? 'is-disabled' : ''}"
        data-view="${key}" type="button" ${isDisabled ? 'disabled' : ''}>${esc(label)}</button>
    `).join('');
  }

  // ── Dynamic header — mirrors score_summary.js's dom.lbSectionTitle
  //    toggling, composed from view + metric instead of one placement flag.

  function renderHint() {
    if (!dom.hint) return;
    const viewLabel = state.view.charAt(0).toUpperCase() + state.view.slice(1);
    const metricSuffix = state.view === 'individual' ? ` — ${state.metric === 'gross' ? 'Gross' : 'Net'}` : '';
    dom.hint.textContent = `${viewLabel} leaderboard${metricSuffix}`;
  }

  // ── Host content ─────────────────────────────────────────────────────────

  function render() {
    renderMetricPills();
    renderViewPills();
    renderHint();

    if (!flights.length) { showEmpty(true); return; }

    if (state.view === 'pairing') {
      renderTable(flights, 'pairing');
    } else if (state.view === 'team') {
      renderTable(flights, 'team');
    } else {
      renderTable(flights, 'individual');
    }
  }

  function showEmpty(isEmpty) {
    if (dom.empty) dom.empty.style.display = isEmpty ? '' : 'none';
    if (dom.host) dom.host.style.display = isEmpty ? 'none' : '';
  }

  function collapseToggleBtn(flightKey) {
    const collapsed = state.collapsedFlights.has(flightKey);
    return `
      <button class="iconBtn btnSecondary esCollapseBtn" type="button" data-flight-toggle="${esc(flightKey)}"
        aria-label="${collapsed ? 'Expand' : 'Collapse'} flight" title="${collapsed ? 'Expand' : 'Collapse'} flight">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          ${collapsed ? '<line x1="12" y1="5" x2="12" y2="19"></line>' : ''}
        </svg>
      </button>`;
  }

  function renderTable(flightList, view) {
    const isIndividual = view === 'individual';
    const isGross = state.metric === 'gross';
    const colCount = isIndividual ? (4 + rounds.length) : (3 + rounds.length);

    let html = `<table class="esTable"><colgroup></colgroup>`;

    flightList.forEach((flight) => {
      const rows = isIndividual ? (flight.individual || []) : (view === 'pairing' ? (flight.pairing || []) : (flight.team || []));
      if (!rows.length) return;

      const collapsed = state.collapsedFlights.has(flight.flightKey);

      html += `
        <tr class="esFlightRow">
          <td colspan="${colCount}">
            ${collapseToggleBtn(flight.flightKey)}
            <span>${esc(flight.flightName)}</span>
          </td>
        </tr>`;

      if (collapsed) return;

      html += `<tr class="esHeaderRow" data-flight="${esc(flight.flightKey)}">`;
      html += isIndividual
        ? `<th>Player</th><th>Team</th>`
        : `<th>${view === 'team' ? 'Team' : 'Pairing'}</th>`;
      rounds.forEach((r, i) => { html += `<th>${roundHeaderLabel(i)}</th>`; });
      html += `<th>Total</th><th>Rank</th><th>Points</th></tr>`;

      const sorted = rows.slice().sort((a, b) => {
        const av = isIndividual
          ? (isGross ? a.totalPerformancePointsGross : a.totalPerformancePointsNet)
          : a.totalPoints;
        const bv = isIndividual
          ? (isGross ? b.totalPerformancePointsGross : b.totalPerformancePointsNet)
          : b.totalPoints;
        return (bv ?? 0) - (av ?? 0); // higher tally is better
      });

      sorted.forEach((row, idx) => {
        const rank = idx + 1;
        html += `<tr class="esDataRow" data-flight="${esc(flight.flightKey)}">`;

        if (isIndividual) {
          html += `<td class="esLeftCell">${esc(row.playerName || row.playerLastName || 'Player')}</td>`;
          html += `<td class="esLeftCell">${esc(row.teamName || '')}</td>`;
        } else if (view === 'team') {
          html += `<td class="esLeftCell">${esc(row.teamName || row.teamKey || '')}</td>`;
        } else {
          html += `<td class="esLeftCell">${esc(row.pairingLabel || row.pairingId || '')}</td>`;
        }

        (row.rounds || []).forEach((r) => {
          if (isIndividual) {
            const pts = isGross ? r.placementPointsGross : r.placementPointsNet;
            const rank = isGross ? r.rankGross : r.rankNet;
            const scoreDisplay = isGross ? r.grossDiffDisplay : r.netDiffDisplay;
            const showScore = r.countsTowardStrokes;
            const rankScoreLine = showScore
              ? `${rank != null ? ordinal(rank) + ' ' : ''}${esc(scoreDisplay)}`
              : '';
            html += `<td>
              <div class="esCellPts">${fmtTally(pts)} pts</div>
              <div class="esCellScore ${showScore ? '' : 'is-empty'}">${rankScoreLine}</div>
            </td>`;
          } else if (view === 'pairing' && r.rank != null) {
            // PairField only — a genuine field-wide finishing position
            // exists here. PairPair (r.rank === null) falls through to the
            // points-only cell below; head-to-head match result has no
            // rank concept at all, not just an unavailable one.
            html += `<td>
              <div class="esCellPts">${fmtTally(r.points)} pts</div>
              <div class="esCellScore">${ordinal(r.rank)} ${esc(r.scoreDisplay || '')}</div>
            </td>`;
          } else {
            html += `<td><div class="esCellPts">${fmtTally(r.points)} pts</div></td>`;
          }
        });

        const total = isIndividual
          ? (isGross ? row.totalPerformancePointsGross : row.totalPerformancePointsNet)
          : row.totalPoints;
        const placement = isIndividual
          ? (isGross ? row.eventPlacementPointsGross : row.eventPlacementPointsNet)
          : row.eventPlacementPoints;

        html += `<td class="esTotalCell">${fmtTally(total)}</td>`;
        html += `<td class="esRankCell">${rank}</td>`;
        html += `<td class="esPointsCell">${fmtPoints(placement)}</td>`;
        html += `</tr>`;
      });
    });

    html += `</table>`;

    if (!dom.host) return;
    showEmpty(false);
    dom.host.innerHTML = html;
  }

  // ── Chrome ───────────────────────────────────────────────────────────────

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
        visible: ['eventhome', 'eventedit', 'eventroster', 'eventrounds', 'eventsummary'],
        active: 'eventsummary',
        root: ["eventhome"],
        disabled: [],
        onNavigate: (id) => MA.routerGo(id),
      });
    }
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  if (dom.viewPills) {
    dom.viewPills.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn || btn.disabled) return;
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
  if (dom.host) {
    dom.host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-flight-toggle]');
      if (!btn) return;
      const key = btn.dataset.flightToggle;
      if (state.collapsedFlights.has(key)) state.collapsedFlights.delete(key);
      else state.collapsedFlights.add(key);
      render();
    });
  }

  applyChrome();
  render();
})();
