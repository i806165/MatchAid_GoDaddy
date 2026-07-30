/* /assets/modules/module_renderHoleChampions.js
 * MA.renderHoleChampions — self-contained Hole Champions (per-hole best
 * gross/net) rendering module.
 *
 * Data ACQUISITION (which round(s), which players) is entirely host-owned
 * — this module only ever filters an already-loaded flat player array by
 * flight and renders champion cards from it. The champion computation
 * itself (computeHoleResult/findChampion) is ported unchanged from the
 * original score_skins.js — it never cared where the player array came
 * from, so pooling multiple rounds' players into one array (the "All
 * Rounds" case) needs zero changes here, only a different array from the
 * host.
 *
 * mount() cfg:
 *   hostEl        required. Champion cards render here.
 *   controlsEl    required. Flight selector renders here — only when
 *                 cfg.flightActive is true. When false, this area is
 *                 cleared: no "All Game" pill shown when there's nothing
 *                 to switch between.
 *   players       required. Flat array of already-hydrated player rows
 *                 (same per-player .holes shape
 *                 ServiceScoreCard::buildGameScorecardsPayload() already
 *                 produces) — the FULL set for this view (every flight
 *                 combined). Flight filtering happens inside this module,
 *                 not the host.
 *   cardRanges    required. [{start,end,title}] — host-computed, since a
 *                 single round's own dbGames_Holes window and a pooled
 *                 "All Rounds" view (always both F9+B9, per the app's
 *                 current same-course-across-rounds assumption) resolve
 *                 differently, and this module has no single game record
 *                 of its own to derive a window from.
 *   flightActive  bool. Whether to render a flight selector at all —
 *                 mirrors ServiceDbEvents::isDimensionActive("flight", ...).
 *   flightConfig  {flights:[{id,name,color,sort}]} | null — same shape
 *                 as dbGames_TeamConfig/dbGames_FlightConfig.
 *
 * Every mount() call is treated as a fresh dataset (flight selection
 * always resets to "All Game") — the host only ever calls mount() when
 * the round selection has genuinely changed, so there's no "same data,
 * re-render" case to distinguish here the way the scorecard module needs
 * to for its KPI-pill clicks.
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.renderHoleChampions = MA.renderHoleChampions || {};

  const _states = new WeakMap();

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ── Flight filtering ─────────────────────────────────────────────────

  function sortedFlights(flightConfig) {
    const flights = Array.isArray(flightConfig?.flights) ? flightConfig.flights.slice() : [];
    flights.sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
    return flights;
  }

  function playersForFlight(allPlayers, flightId) {
    if (!flightId || flightId === "ALL") return allPlayers;
    return allPlayers.filter(
      (p) => String(p.dbPlayers_FlightKey || p.flightKey || "") === String(flightId)
    );
  }

  // ── Champion computation — ported unchanged from score_skins.js ───────

  function computeHoleResult(players, h) {
    let par = "—";
    const grossList = [];
    const netList = [];

    players.forEach((p) => {
      const holeKey = "h" + h;
      const details = p.holes?.[holeKey];
      if (!details) return;

      if (par === "—" && details.par != null && details.par !== "") {
        par = details.par;
      }

      const grossScore = parseFloat(details.display?.gross);
      if (isNaN(grossScore)) return;

      grossList.push({ name: p.playerName, score: grossScore });

      // phStrokeMarks, not strokeMarks — initEventSkins.php always requests
      // Playing Handicap for this data regardless of the game's own
      // dbGames_HCMethod (see chat), and renames the field on output to
      // make that explicit rather than reusing the shared, basis-dependent
      // "strokeMarks" name every other scorecard consumer expects.
      const dots = parseFloat(details.phStrokeMarks || 0);
      const netValue = grossScore - 0.5 * dots;

      netList.push({ name: p.playerName, score: netValue });
    });

    return {
      hole: h,
      par,
      grossHtml: findChampion(grossList, false),
      netHtml: findChampion(netList, true),
    };
  }

  function findChampion(list, isNet) {
    if (!list.length) return "—";

    const min = Math.min(...list.map((i) => i.score));
    const tied = list.filter((i) => i.score === min);
    const displayScore = isNet ? min.toFixed(1) : String(Math.floor(min));

    if (tied.length === 1) {
      const fullName = tied[0].name || "";
      const parts = fullName.trim().split(/\s+/);
      const displayName = parts[parts.length - 1] || fullName;
      return `<strong>${esc(displayName)} (${esc(displayScore)})</strong>`;
    }

    return `${tied.length} Tied ${esc(displayScore)}`;
  }

  function buildRowsHtml(players, startHole, endHole) {
    let html = "";
    for (let h = startHole; h <= endHole; h++) {
      const row = computeHoleResult(players, h);
      html += `
        <tr>
          <td class="maTable__labelCol">Hole ${row.hole} Par ${esc(row.par)}</td>
          <td class="maTable__valueCol">${row.grossHtml}</td>
          <td class="maTable__valueCol">${row.netHtml}</td>
        </tr>`;
    }
    return html;
  }

  function buildCardHtml(players, range) {
    return `
      <section class="maCard" aria-label="${esc(range.title)}">
        <div class="maCard__hdr">
          <div class="maCard__title">${esc(range.title)}</div>
          <div class="maHintText maHintText--right">Hole-by-hole low gross and net winners.</div>
        </div>
        <div class="maCard__body">
          <table class="maTable maTable--fontLg">
            <thead>
              <tr>
                <th class="maTable__labelCol">Hole / Par</th>
                <th class="maTable__valueCol">Best Gross</th>
                <th class="maTable__valueCol">Best Net</th>
              </tr>
            </thead>
            <tbody>${buildRowsHtml(players, range.start, range.end)}</tbody>
          </table>
        </div>
      </section>`;
  }

  // ── Controls — flight selector, dropdown-style: a button showing the
  //    current selection, opening MA.ui.openActionsMenu() on click — same
  //    pattern as event_skins.js's own round selector, not the KPI-pill
  //    treatment this used originally. Changed per explicit direction:
  //    flight should read as a dropdown, not a row of pills. ─────────────

  function renderControls(st) {
    if (!st.controlsEl) return;

    if (!st.flightActive || !st.flights.length) {
      st.controlsEl.innerHTML = "";
      return;
    }

    const options = [{ id: "ALL", label: "All Game" }].concat(
      st.flights.map((f) => ({ id: f.id, label: f.name }))
    );
    const current = options.find((o) => o.id === st.selectedFlight) || options[0];

    st.controlsEl.innerHTML = `
      <button type="button" data-flight-selector-btn class="btn btnSecondary"
        style="width:100%; display:flex; align-items:center; justify-content:space-between;">
        <span>${esc(current.label)}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>`;

    st.controlsEl.querySelector("[data-flight-selector-btn]")?.addEventListener("click", () => {
      if (!MA.ui || !MA.ui.openActionsMenu) return;
      const items = options.map((o) => ({
        label: o.label,
        action: () => {
          st.selectedFlight = o.id;
          renderControls(st);
          renderBody(st);
        },
      }));
      MA.ui.openActionsMenu("Select Flight", items);
    });
  }

  function renderBody(st) {
    if (!st.hostEl) return;

    if (!st.allPlayers.length) {
      st.hostEl.innerHTML = `<div class="maEmptyState">No scores available for this selection.</div>`;
      return;
    }

    const filtered = playersForFlight(st.allPlayers, st.selectedFlight);
    st.hostEl.innerHTML = `<div class="maCards">${st.cardRanges.map((r) => buildCardHtml(filtered, r)).join("")}</div>`;
  }

  // ── Mount ────────────────────────────────────────────────────────────

  function mount(cfg) {
    const hostEl = cfg.hostEl;
    if (!hostEl) return;

    let st = _states.get(hostEl);
    if (!st) {
      st = { hostEl, controlsEl: null };
      _states.set(hostEl, st);
    }

    st.controlsEl    = cfg.controlsEl || st.controlsEl;
    st.allPlayers    = Array.isArray(cfg.players) ? cfg.players : [];
    st.cardRanges    = Array.isArray(cfg.cardRanges) ? cfg.cardRanges : [];
    st.flightActive  = !!cfg.flightActive;
    st.flights       = sortedFlights(cfg.flightConfig);
    st.selectedFlight = "ALL"; // every mount() = a new dataset — see file header

    renderControls(st);
    renderBody(st);
  }

  MA.renderHoleChampions.mount = mount;
})();
