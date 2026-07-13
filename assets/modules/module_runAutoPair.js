/* /assets/modules/module_runAutoPair.js
 *
 * MA.runAutoPair — Auto-Pair module for Game Pairings.
 * Extracted out of game_pairings.js (see the "Architecture — module
 * extraction" section of the flight/team boundary spec). Mirrors
 * module_defineFlights.js's structure and class vocabulary (maModal,
 * maListRow, maCheckbox, ma_shared.css tokens) — same persistent-overlay /
 * open() / close() / partial-refresh pattern, same IIFE-on-MA shape as
 * recalculate_handicaps.js for the one place this module needs a blocking
 * child dialog (the uneven-team-counts warning).
 *
 * CRITICAL NAMING NOTE — do not confuse these two fields:
 *   flightKey (dbPlayers_FlightKey / dbGames_FlightConfig) — THE flight
 *     concept this module partitions by (e.g. "Men" / "Women"). This is
 *     the only "flight" this module knows about.
 *   flightId / flightPos (dbPlayers_MatchID / dbPlayers_MatchPos) — the
 *     UNRELATED Match Pairings tab Side A/B container. Never referenced
 *     here. If a future edit needs that concept, it does not belong in
 *     this module.
 *
 * Boundary rule this module exists to enforce structurally: a drafted
 * pairing must never mix flightKey or team. Unlike the manual
 * assign-to-pairing flow (which validates and skips after the fact),
 * this module partitions the pool by flightKey/team BEFORE drafting, so
 * a cross-boundary group is never produced in the first place. The two
 * teams a game may have are capped at exactly two (existing teamConfig
 * constraint) and may only be run together when their unpaired counts
 * match exactly — see _onTeamToggle / the uneven-team-counts modal.
 *
 * Public API:
 *   MA.runAutoPair.open(options)
 *   MA.runAutoPair.close()
 *
 * Options:
 *   {
 *     players       : array         — raw unpaired player rows (db field names)
 *     flightConfig  : object|null   — dbGames_FlightConfig, {"flights":[{id,name,sort}]}
 *     teamConfig    : object|null   — dbGames_TeamConfig, {"teams":[{id,name,sort}]} (exactly 2, or null)
 *     isPairPair    : bool          — true for PairPair competitions: pairings
 *                                      are capped at 2 players, so size chips
 *                                      3 and 4 are not offered at all.
 *     apiBase       : string        — "/api/game_pairings" (getCoPlayMatrix.php)
 *     onApply       : function(groups)
 *                        — groups: array of arrays of raw player objects
 *                          (same shape as the players passed in), one array
 *                          per drafted pairing. Caller is responsible for
 *                          assigning pairingId/pairingPos (numbering depends
 *                          on the FULL player set, which this module never
 *                          sees) and for marking players dirty / re-rendering
 *                          the host page. Called once per Apply click — the
 *                          module may fire it multiple times across one
 *                          open() session if the user runs/applies more than
 *                          once before closing.
 *   }
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.runAutoPair = MA.runAutoPair || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const OVERLAY_ID      = "maRunAutoPairOverlay";
  const WARN_OVERLAY_ID = "maRunAutoPairWarnOverlay";
  const SIZES_ALL        = [4, 3, 2, 1];
  const SIZES_PAIRPAIR   = [2, 1];

  // ── Module state ─────────────────────────────────────────────────────────────
  let _opts        = {};
  let _flights      = [];      // [{ id, name, sort }] — [] means no flight config on this game
  let _teamConfig   = null;    // { teams:[{id,name,sort}] } | null
  let _pool         = [];      // local copy of the unpaired pool — shrinks as groups are applied
  let _allowedSizes = SIZES_ALL;

  let _selFlightId  = null;    // currently selected flight ("" / null when flights aren't in use)
  let _selTeamIds   = new Set(); // checked team ids within the selected flight
  let _selSizes     = new Set(); // checked size chips (subset of _allowedSizes)
  let _selComboIdx  = 0;       // index into the currently-listed combination options
  let _outcome      = "balanced";

  let _busy            = false;
  let _mode             = "setup"; // "setup" | "review"
  let _previewGroups    = [];  // [{ teamId, players:[] }] — populated by Run, cleared by Retry/Apply

  // ── Helpers — formatting / safety ───────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safe(v) { return String(v ?? "").trim(); }

  function isNH(ghin) {
    return String(ghin || "").toUpperCase().startsWith("NH");
  }

  function phValue(p) {
    const v = (p && p.ph != null && p.ph !== "") ? Number(p.ph)
      : (p && p.ch != null && p.ch !== "") ? Number(p.ch)
        : (p && p.hi != null && p.hi !== "") ? Number(p.hi)
          : 999;
    return Number.isFinite(v) ? v : 999;
  }

  // Same "no golf jargon" plain-English convention _mixVerbose used —
  // "4-player pairings (N)", not "foursomes (N)".
  function mixVerbose(f, t3, t2, s1) {
    const p = [];
    if (f  > 0) p.push(`4-player pairings (${f})`);
    if (t3 > 0) p.push(`3-player pairings (${t3})`);
    if (t2 > 0) p.push(`2-player pairings (${t2})`);
    if (s1 > 0) p.push(`1-player pairings (${s1})`);
    return p.length ? p.join(" + ") : "—";
  }

  function normalizePlayer(r) {
    return {
      ...r, // keep every original db field so onApply can hand the exact shape back
      playerGHIN: safe(r.playerGHIN || r.dbPlayers_PlayerGHIN || ""),
      name:       safe(r.name       || r.dbPlayers_Name       || ""),
      team:       safe(r.team       || r.dbPlayers_TeamKey    || ""),
      flightKey:  safe(r.flightKey  || r.dbPlayers_FlightKey  || ""),
      ph:         r.ph  ?? r.dbPlayers_PH ?? "",
      ch:         r.ch  ?? r.dbPlayers_CH ?? "",
      hi:         r.hi  ?? r.dbPlayers_HI ?? "",
      teeSetName: r.teeSetName ?? r.dbPlayers_TeeSetName ?? "",
    };
  }

  function normalizeFlightConfig(cfg) {
    const list = Array.isArray(cfg?.flights) ? cfg.flights : [];
    return list
      .map((f, i) => ({ id: safe(f.id) || `F${i + 1}`, name: safe(f.name) || `Flight ${i + 1}`, sort: Number(f.sort ?? i + 1) }))
      .sort((a, b) => a.sort - b.sort);
  }

  function resolveTeamName(teamId) {
    if (!_teamConfig || !Array.isArray(_teamConfig.teams)) return teamId;
    const t = _teamConfig.teams.find(t => t.id === teamId);
    return t ? (t.name || teamId) : teamId;
  }

  function apiPath(endpoint) {
    return safe(_opts.apiBase || "/api/game_pairings").replace(/\/$/, "") + "/" + endpoint;
  }

  // ── Scope derivation ─────────────────────────────────────────────────────────

  // Flights that currently have at least one unpaired player — self-prunes
  // as Apply removes players from _pool, per "keep the modal open, hydrated
  // with updated data" (no more scoped/locked cycling messaging).
  function flightsWithUnpaired() {
    return _flights.filter(f => _pool.some(p => p.flightKey === f.id));
  }

  // Pool filtered down to the selected flight only (or the whole pool, if
  // this game has no flight config at all).
  function poolInSelectedFlight() {
    if (!_flights.length) return _pool;
    return _pool.filter(p => p.flightKey === _selFlightId);
  }

  // Teams present (with unpaired players) inside the selected flight.
  // Length <= 1 means the team checklist doesn't render — nothing to choose.
  function teamsInScope() {
    if (!_teamConfig || !Array.isArray(_teamConfig.teams)) return [];
    const pool = poolInSelectedFlight();
    return _teamConfig.teams
      .map(t => ({ id: t.id, name: t.name, sort: t.sort, count: pool.filter(p => p.team === t.id).length }))
      .filter(t => t.count > 0)
      .sort((a, b) => a.sort - b.sort);
  }

  function teamActive() { return teamsInScope().length > 1; }

  // The actual player pool the Run button will draft from right now.
  function currentPool() {
    let pool = poolInSelectedFlight();
    if (teamActive() && _selTeamIds.size) {
      pool = pool.filter(p => _selTeamIds.has(p.team));
    }
    return pool;
  }

  // One subgroup per checked team (draft independently, never merge), or a
  // single subgroup of the whole current pool when team scoping isn't active.
  function currentSubgroups() {
    if (teamActive() && _selTeamIds.size) {
      return [..._selTeamIds].map(teamId => ({
        teamId,
        pool: poolInSelectedFlight().filter(p => p.team === teamId),
      }));
    }
    return [{ teamId: null, pool: currentPool() }];
  }

  // ── Combination math ─────────────────────────────────────────────────────────

  // Every combination of the checked sizes that sums exactly to N. Ported
  // from AutoPairEngine.calculateValidMixes, but constrained to a caller-
  // supplied set of allowed sizes instead of always trying all of 1-4 —
  // this is what makes "acceptable pairing sizes" mean something for
  // singles/threes, not just foursomes.
  function combosForSizes(n, allowed) {
    if (!(n > 0)) return [];
    const results = [];
    const maxF = allowed.has(4) ? Math.floor(n / 4) : 0;
    for (let f = maxF; f >= 0; f--) {
      const afterF = n - f * 4;
      const maxT3 = allowed.has(3) ? Math.floor(afterF / 3) : 0;
      for (let t3 = maxT3; t3 >= 0; t3--) {
        const afterT3 = afterF - t3 * 3;
        const maxT2 = allowed.has(2) ? Math.floor(afterT3 / 2) : 0;
        for (let t2 = maxT2; t2 >= 0; t2--) {
          const singles = afterT3 - t2 * 2;
          if (singles < 0) continue;
          if (singles > 0 && !allowed.has(1)) continue; // remainder needs a size we didn't check
          if (f === 0 && t3 === 0 && t2 === 0 && singles === 0) continue;
          results.push({ fours: f, threes: t3, twos: t2, singles });
        }
      }
    }
    // Same preference order as the original engine: fewest distinct sizes,
    // most of the largest checked size first, singles-only pushed last.
    results.sort((a, b) => {
      const aSinglesOnly = a.singles > 0 && a.fours === 0 && a.threes === 0 && a.twos === 0;
      const bSinglesOnly = b.singles > 0 && b.fours === 0 && b.threes === 0 && b.twos === 0;
      if (aSinglesOnly !== bSinglesOnly) return aSinglesOnly ? 1 : -1;
      const aHasSingles = a.singles > 0, bHasSingles = b.singles > 0;
      if (aHasSingles !== bHasSingles) return aHasSingles ? 1 : -1;
      const kinds = (m) => (m.fours>0?1:0)+(m.threes>0?1:0)+(m.twos>0?1:0)+(m.singles>0?1:0);
      const ak = kinds(a), bk = kinds(b);
      if (ak !== bk) return ak - bk;
      if (a.fours !== b.fours) return b.fours - a.fours;
      if (a.threes !== b.threes) return b.threes - a.threes;
      if (a.twos !== b.twos) return b.twos - a.twos;
      return a.singles - b.singles;
    });
    return results;
  }

  // ── Overlay shell ────────────────────────────────────────────────────────────

  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) MA.runAutoPair.close(); });
      document.body.appendChild(el);
    }
    return el;
  }

  function _setScrollLock(on) {
    document.documentElement.classList.toggle("maOverlayOpen", !!on);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  MA.runAutoPair.open = function (options) {
    _opts        = options || {};
    _flights     = normalizeFlightConfig(_opts.flightConfig);
    _teamConfig  = _opts.teamConfig || null;
    _pool        = (_opts.players || []).map(normalizePlayer);
    _allowedSizes = _opts.isPairPair ? SIZES_PAIRPAIR : SIZES_ALL;

    _busy          = false;
    _mode           = "setup";
    _previewGroups  = [];
    _outcome        = "balanced"; // always resets — no persistence, matches prior behavior

    _resetScopeDefaults();

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _setScrollLock(true);
    _wireEvents();
  };

  MA.runAutoPair.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _setScrollLock(false);
    _busy = false;
  };

  // Re-derive Flight/Team/Size selection to sane defaults against the
  // current _pool — used on open() and again after every Apply, since
  // Apply shrinks _pool and the modal stays open ("hydrated with updated
  // data") rather than closing or cycling to a scripted "next" message.
  function _resetScopeDefaults() {
    const flights = flightsWithUnpaired();
    _selFlightId = flights.length ? flights[0].id : null;

    _selTeamIds = new Set();
    const teams = teamsInScope();
    if (teams.length > 1) _selTeamIds.add(teams[0].id); // default: first team only

    _selSizes = new Set([_allowedSizes[0]]); // default: largest allowed size alone
    _selComboIdx = 0;
  }

  // ── Render — modal shell ─────────────────────────────────────────────────────

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Auto-Pair">
        ${_renderHeader()}
        <div class="maModal__controls" id="apControls" style="display:${_mode === "setup" ? "" : "none"};">
          ${_renderScopeSection()}
          ${_renderSizeSection()}
          ${_renderOutcomeField()}
        </div>
        <div class="maModal__body" id="apReview" style="display:${_mode === "review" ? "" : "none"}; padding:0;">
          <div class="maCards" id="apPreviewCards">${_renderPreviewCards()}</div>
        </div>
        ${_renderFooter()}
      </section>`;
  }

  function _renderHeader() {
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Auto-Pair</div>
          <div class="maModal__subtitle" id="apSubtitle">${esc(_subtitleText())}</div>
        </div>
        <button type="button" class="iconBtn btnSecondary" id="apBtnClose" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>`;
  }

  function _subtitleText() {
    const n = _pool.length;
    return `${n} Unpaired Player${n !== 1 ? "s" : ""}`;
  }

  // ── Render — scope (Flight dropdown + Team checklist) ───────────────────────

  function _renderScopeSection() {
    const flights = flightsWithUnpaired();
    const flightField = flights.length ? `
      <div class="maFieldRow" style="margin-top:0;">
        <div class="maField" style="flex:1;">
          <label class="maLabel">Flight</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">Which flight do you want to pair?</div>
          <select id="apFlight" class="maTextInput">
            ${flights.map(f => `<option value="${esc(f.id)}"${f.id === _selFlightId ? " selected" : ""}>${esc(f.name)}</option>`).join("")}
          </select>
        </div>
      </div>` : "";

    return `<div id="apScopeSection">${flightField}${_renderTeamChecklist()}</div>`;
  }

  function _renderTeamChecklist() {
    const teams = teamsInScope();
    if (teams.length <= 1) return "";
    const flightName = _flights.length ? (_flights.find(f => f.id === _selFlightId)?.name || "") : "";
    return `
      <div class="maFieldRow" id="apTeamRow">
        <div class="maField" style="flex:1;">
          <label class="maLabel">${flightName ? `Teams in ${esc(flightName)}` : "Teams"}</label>
          <div class="maListRows" id="apTeamList" style="border:1px solid var(--borderSubtle); border-radius:var(--radiusLg); overflow:hidden;">
            ${teams.map(t => `
              <div class="maListRow" data-team-row="${esc(t.id)}" style="cursor:pointer;">
                <div class="maCheckbox${_selTeamIds.has(t.id) ? " is-checked" : ""}" data-team-check="${esc(t.id)}"></div>
                <div class="maListRow__col" style="flex:1;">${esc(t.name)}</div>
                <div class="maListRow__col maListRow__col--muted maListRow__col--right" style="flex:0 0 auto;">${t.count} unpaired</div>
              </div>`).join("")}
          </div>
        </div>
      </div>`;
  }

  // ── Render — acceptable sizes + live status + combination dropdown ─────────

  function _renderSizeSection() {
    const n = currentPool().length;
    return `
      <div class="maFieldRow" id="apSizeRow">
        <div class="maField" style="flex:1;">
          <label class="maLabel" id="apSizeLabel">Acceptable pairing sizes for ${n} player${n !== 1 ? "s" : ""}</label>
          <div class="maChoiceChips" id="apSizeChips" role="group" aria-label="Acceptable pairing sizes">
            ${_allowedSizes.slice().sort((a, b) => a - b).map(size => `
              <button type="button" class="maChoiceChip${_selSizes.has(size) ? " is-selected-accent" : ""}"
                      data-size="${size}" aria-pressed="${_selSizes.has(size)}">${size}</button>
            `).join("")}
          </div>
          <div id="apSizeStatus" style="margin-top:8px;">${_renderSizeStatus()}</div>
          <div id="apComboWrap">${_renderComboSelect()}</div>
        </div>
      </div>`;
  }

  function _renderSizeStatus() {
    const n = currentPool().length;
    const combos = combosForSizes(n, _selSizes);
    const ok = combos.length > 0;
    return `<div class="maInlineStatus" style="color:${ok ? "var(--success)" : "var(--danger)"};">
      These pairing sizes ${ok ? "work" : "do not work"} for ${n} player${n !== 1 ? "s" : ""}.
    </div>`;
  }

  function _renderComboSelect() {
    const n = currentPool().length;
    const combos = combosForSizes(n, _selSizes);
    if (!combos.length) return "";
    const idx = Math.min(_selComboIdx, combos.length - 1);
    return `
      <select id="apCombo" class="maTextInput" style="margin-top:8px;">
        ${combos.map((c, i) => `<option value="${i}"${i === idx ? " selected" : ""}>${esc(mixVerbose(c.fours, c.threes, c.twos, c.singles))}</option>`).join("")}
      </select>`;
  }

  function _renderOutcomeField() {
    return `
      <div class="maFieldRow" id="apCoreRow2">
        <div class="maField" style="flex:1;">
          <label class="maLabel">Pairing Outcome</label>
          <div class="maFieldHint" style="font-size:11px; color:var(--mutedText); margin-bottom:4px;">What result are you looking to achieve?</div>
          <select id="apOutcome" class="maTextInput">
            <option value="balanced"${_outcome === "balanced" ? " selected" : ""}>Competitive balance — spread handicaps evenly across pairings</option>
            <option value="abcdDraw"${_outcome === "abcdDraw" ? " selected" : ""}>ABCD Draw — one player from each handicap tier</option>
            <option value="inOrder"${_outcome === "inOrder" ? " selected" : ""}>Ranked — pair strongest players together</option>
            <option value="stackedHighFirst"${_outcome === "stackedHighFirst" ? " selected" : ""}>Stacked — pair highest handicaps together</option>
            <option value="random"${_outcome === "random" ? " selected" : ""}>Random — ignore handicaps entirely</option>
            <option value="leastPlayed"${_outcome === "leastPlayed" ? " selected" : ""}>Least Played Together — prioritize players with least shared history</option>
          </select>
        </div>
      </div>`;
  }

  // ── Render — preview (Review mode) ──────────────────────────────────────────

  function _renderPreviewCards() {
    if (!_previewGroups.length) return "";
    const multiTeam = new Set(_previewGroups.map(g => g.teamId).filter(Boolean)).size > 1;
    return _previewGroups.map((g, i) => {
      const grp = g.players;
      const sum = grp.reduce((s, p) => s + phValue(p), 0);
      const avg = grp.length ? (sum / grp.length).toFixed(1) : "0.0";
      const teamTag = multiTeam && g.teamId ? ` &middot; ${esc(resolveTeamName(g.teamId))}` : "";
      const rows = grp.map(p => {
        const ph = phValue(p);
        const meta = [p.teeSetName, `PH:${ph}`].filter(Boolean).join(" • ");
        return `<div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-top:1px solid var(--borderSubtle);">
          <span>${esc(p.name)}</span><span style="color:var(--mutedText);">${esc(meta)}</span>
        </div>`;
      }).join("");
      return `
        <div class="maCard">
          <div class="maCard__hdr" style="padding:8px 10px;">
            <div class="maCard__title" style="font-size:12px;">Pairing ${i + 1}${teamTag}</div>
            <div style="font-size:11px; font-weight:700; color:var(--mutedText);">Sum ${sum} • Avg ${avg}</div>
          </div>
          <div class="maCard__body" style="padding:4px 10px;">${rows}</div>
        </div>`;
    }).join("");
  }

  // ── Render — footer ──────────────────────────────────────────────────────────

  function _renderFooter() {
    const n = currentPool().length;
    const combos = combosForSizes(n, _selSizes);
    const runDisabled = n === 0 || combos.length === 0;
    return `
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="apBtnCancel">Cancel</button>
        <div class="maModal__ftrActions">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="apBtnRetry" style="display:${_mode === "review" ? "" : "none"};">Retry</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="apBtnRun" style="display:${_mode === "setup" ? "" : "none"};" ${runDisabled ? "disabled" : ""}>Run</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="apBtnApply" style="display:${_mode === "review" ? "" : "none"};">Apply</button>
        </div>
      </footer>`;
  }

  // ── Partial refresh ──────────────────────────────────────────────────────────

  function _refreshScopeSection() {
    const el = document.getElementById("apScopeSection");
    if (el) el.outerHTML = _renderScopeSection();
  }

  function _refreshSizeSection() {
    const el = document.getElementById("apSizeRow");
    if (el) el.outerHTML = _renderSizeSection();
  }

  function _refreshFooter() {
    const overlay = document.getElementById(OVERLAY_ID);
    const el = overlay?.querySelector(".maModal__ftr");
    if (el) el.outerHTML = _renderFooter();
  }

  function _refreshSubtitle() {
    const el = document.getElementById("apSubtitle");
    if (el) el.textContent = _subtitleText();
  }

  function _refreshAfterSelectionChange() {
    _refreshSizeSection();
    _refreshFooter();
    _wireEvents(); // DOM was replaced piecemeal above — rebind
  }

  // ── Uneven-team-counts warning modal ────────────────────────────────────────
  // Follows recalculate_handicaps.js's ensure/show/hide shell (same
  // maModalOverlay/maModal shell openAutoPairModal itself is built on) —
  // but that module never needed a dismiss button, since it's a
  // non-interactive, self-closing progress indicator. This one requires a
  // manual dismiss, so it borrows the maModal__ftr/maModal__ftrActions
  // footer already used by this module's own primary footer above, rather
  // than inventing new markup.

  function _ensureWarnOverlay() {
    let el = document.getElementById(WARN_OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = WARN_OVERLAY_ID;
      el.className = "maModalOverlay";
      document.body.appendChild(el);
    }
    return el;
  }

  function _showUnevenTeamsWarning(teamA, teamB) {
    const el = _ensureWarnOverlay();
    el.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="apWarnTitle">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div id="apWarnTitle" class="maModal__title">Uneven Team Counts</div>
          </div>
        </header>
        <div class="maModal__body">
          <p style="line-height:1.6;">
            ${esc(teamA.name)} (${teamA.count}) and ${esc(teamB.name)} (${teamB.count}) have different unpaired counts.
            Uncheck one to continue.
          </p>
        </div>
        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button type="button" class="maFtrBtn maFtrBtn--save" id="apWarnOk">OK</button>
          </div>
        </footer>
      </section>`;
    el.className = "maModalOverlay is-open";
    el.querySelector("#apWarnOk")?.addEventListener("click", _hideUnevenTeamsWarning);
  }

  function _hideUnevenTeamsWarning() {
    const el = document.getElementById(WARN_OVERLAY_ID);
    if (el) { el.className = "maModalOverlay"; el.innerHTML = ""; }
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#apBtnClose")?.addEventListener("click", () => { if (!_busy) MA.runAutoPair.close(); });
    overlay.querySelector("#apBtnCancel")?.addEventListener("click", () => { if (!_busy) MA.runAutoPair.close(); });

    // Flight change — resets team/size selection under the new scope.
    overlay.querySelector("#apFlight")?.addEventListener("change", (e) => {
      _selFlightId = e.target.value;
      _selTeamIds = new Set();
      const teams = teamsInScope();
      if (teams.length > 1) _selTeamIds.add(teams[0].id);
      _selSizes = new Set([_allowedSizes[0]]);
      _selComboIdx = 0;
      _refreshScopeSection();
      _refreshAfterSelectionChange();
      _refreshSubtitle();
    });

    // Team checkbox toggle — equal-count clamp lives here. Live recompute
    // per click; the warning modal only informs, it never un-checks either
    // box on the user's behalf.
    overlay.querySelectorAll("[data-team-check]").forEach(box => {
      box.addEventListener("click", () => _onTeamToggle(box.dataset.teamCheck));
    });
    overlay.querySelectorAll("[data-team-row]").forEach(row => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-team-check]")) return; // avoid double-fire
        _onTeamToggle(row.dataset.teamRow);
      });
    });

    // Size chip toggle — multi-select, live recompute.
    overlay.querySelectorAll("[data-size]").forEach(btn => {
      btn.addEventListener("click", () => {
        const size = Number(btn.dataset.size);
        if (_selSizes.has(size)) _selSizes.delete(size); else _selSizes.add(size);
        _selComboIdx = 0;
        _refreshAfterSelectionChange();
      });
    });

    overlay.querySelector("#apOutcome")?.addEventListener("change", (e) => { _outcome = e.target.value; });
    overlay.querySelector("#apCombo")?.addEventListener("change", (e) => { _selComboIdx = Number(e.target.value); });

    overlay.querySelector("#apBtnRun")?.addEventListener("click", _onRun);
    overlay.querySelector("#apBtnRetry")?.addEventListener("click", _onRetry);
    overlay.querySelector("#apBtnApply")?.addEventListener("click", _onApply);
  }

  function _onTeamToggle(teamId) {
    const wasChecked = _selTeamIds.has(teamId);
    if (wasChecked) {
      _selTeamIds.delete(teamId);
    } else {
      // Checking a 2nd team — compare counts before allowing it.
      if (_selTeamIds.size >= 1) {
        const teams = teamsInScope();
        const existingId = [..._selTeamIds][0];
        const teamA = teams.find(t => t.id === existingId);
        const teamB = teams.find(t => t.id === teamId);
        if (teamA && teamB && teamA.count !== teamB.count) {
          _showUnevenTeamsWarning(teamA, teamB);
          _selTeamIds.add(teamId); // both remain checked — user resolves manually
        } else {
          _selTeamIds.add(teamId);
        }
      } else {
        _selTeamIds.add(teamId);
      }
    }
    _selSizes = new Set([_allowedSizes[0]]);
    _selComboIdx = 0;
    _refreshScopeSection();
    _refreshAfterSelectionChange();
  }

  // ── Run / Retry / Apply ──────────────────────────────────────────────────────

  async function _onRun() {
    const n = currentPool().length;
    const combos = combosForSizes(n, _selSizes);
    if (!combos.length) return; // Run is disabled in this state, but guard anyway

    const combo = combos[Math.min(_selComboIdx, combos.length - 1)];
    const sizes = [];
    for (let i = 0; i < combo.fours;   i++) sizes.push(4);
    for (let i = 0; i < combo.threes;  i++) sizes.push(3);
    for (let i = 0; i < combo.twos;    i++) sizes.push(2);
    for (let i = 0; i < combo.singles; i++) sizes.push(1);

    const bucketCount = _deriveBucketCount(combo);

    let coPlayMatrix = {};
    if (_outcome === "leastPlayed") {
      const ghins = currentPool().map(p => p.playerGHIN).filter(g => !isNH(g));
      try {
        const res = await MA.postJson(apiPath("getCoPlayMatrix.php"), { ghins });
        if (res && res.ok) coPlayMatrix = res.matrix || {};
      } catch (err) {
        console.warn("[MA.runAutoPair] Co-play matrix fetch failed — proceeding without history.", err);
      }
    }

    // Draft each checked team's subgroup independently — never merged.
    // Every subgroup uses the SAME combo, valid because the equal-count
    // clamp guarantees any two checked teams already share the same N.
    _previewGroups = [];
    currentSubgroups().forEach(({ teamId, pool }) => {
      const sortedPool = pool.slice().sort((a, b) => phValue(a) - phValue(b));
      const buckets = _bucketize(sortedPool, bucketCount);
      const groups = _draft(_outcome, buckets, sortedPool, sizes, coPlayMatrix);
      groups.forEach(players => _previewGroups.push({ teamId, players }));
    });

    _mode = "review";
    const overlay = document.getElementById(OVERLAY_ID);
    overlay.querySelector("#apControls").style.display = "none";
    const reviewEl = overlay.querySelector("#apReview");
    reviewEl.style.display = "";
    reviewEl.querySelector("#apPreviewCards").innerHTML = _renderPreviewCards();
    _refreshFooter();
    _wireEvents();
  }

  function _onRetry() {
    _mode = "setup";
    _previewGroups = [];
    const overlay = document.getElementById(OVERLAY_ID);
    overlay.querySelector("#apControls").style.display = "";
    overlay.querySelector("#apReview").style.display = "none";
    _refreshFooter();
    _wireEvents();
  }

  function _onApply() {
    if (!_previewGroups.length) return;
    if (typeof _opts.onApply === "function") {
      _opts.onApply(_previewGroups.map(g => g.players));
    }

    // Remove the just-applied players from the local pool — this is what
    // "keep the modal open, hydrated with updated data" means in practice.
    // No server round trip needed: this module already knows exactly which
    // players it just drafted.
    const appliedGhins = new Set(_previewGroups.flatMap(g => g.players.map(p => p.playerGHIN)));
    _pool = _pool.filter(p => !appliedGhins.has(p.playerGHIN));

    _previewGroups = [];
    _mode = "setup";
    _resetScopeDefaults();

    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelector("#apControls").outerHTML = `
      <div class="maModal__controls" id="apControls">
        ${_renderScopeSection()}
        ${_renderSizeSection()}
        ${_renderOutcomeField()}
      </div>`;
    overlay.querySelector("#apReview").style.display = "none";
    overlay.querySelector("#apControls").style.display = "";
    _refreshFooter();
    _refreshSubtitle();
    _wireEvents();
  }

  // ── Ported drafting engine (unchanged logic from AutoPairEngine) ───────────

  function _deriveBucketCount(mix) {
    const sizes = [];
    for (let i = 0; i < mix.fours;   i++) sizes.push(4);
    for (let i = 0; i < mix.threes;  i++) sizes.push(3);
    for (let i = 0; i < mix.twos;    i++) sizes.push(2);
    for (let i = 0; i < mix.singles; i++) sizes.push(1);
    if (!sizes.length) return 1;
    const freq = sizes.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  function _bucketize(players, bucketCount) {
    if (bucketCount <= 1) return [players.slice()];
    const sorted = players.slice().sort((a, b) => phValue(a) - phValue(b));
    const n = sorted.length;
    const base = Math.floor(n / bucketCount);
    const rem = n % bucketCount;
    const buckets = [];
    let idx = 0;
    for (let i = 0; i < bucketCount; i++) {
      const extra = (i < rem) ? 1 : 0;
      const size = base + extra;
      const slice = (size > 0 && idx < n) ? sorted.slice(idx, Math.min(idx + size, n)) : [];
      buckets.push(slice);
      idx += size;
    }
    return buckets;
  }

  function _draft(outcome, buckets, pool, sizes, coPlayMatrix) {
    switch (outcome) {
      case "balanced":         return _draftBalanced(buckets, sizes);
      case "inOrder":           return _draftInOrder(pool, sizes);
      case "abcdDraw":          return _draftABCD(buckets, sizes);
      case "random":            return _draftRandom(pool, sizes);
      case "stackedHighFirst":  return _draftInOrder(pool, sizes); // pool already sorted asc by PH
      case "leastPlayed":       return _draftLeastPlayed(pool, sizes, coPlayMatrix || {});
      default:                  return _draftBalanced(buckets, sizes);
    }
  }

  function _draftBalanced(buckets, sizes) {
    const queues = buckets.map(b => b.slice());
    const pull = (bi, back = false) => {
      if (!queues[bi] || !queues[bi].length) return null;
      return back ? queues[bi].pop() : queues[bi].shift();
    };
    const pullAny = () => {
      for (let i = 0; i < queues.length; i++) if (queues[i].length) return queues[i].shift();
      return null;
    };
    const pushFrom = (group, sources) => {
      for (const [i, back] of sources) {
        const p = pull(i, back);
        if (p) { group.push(p); return; }
      }
      const p = pullAny();
      if (p) group.push(p);
    };
    const groups = [];
    for (const size of sizes) {
      const g = [];
      switch (size) {
        case 4:
          pushFrom(g, [[0, false], [1, true], [2, false], [3, false]]);
          pushFrom(g, [[1, true], [2, false], [3, false], [0, false]]);
          pushFrom(g, [[2, true], [3, false], [1, false], [0, false]]);
          pushFrom(g, [[3, false], [0, false], [2, false], [1, false]]);
          break;
        case 3:
          pushFrom(g, [[0, false], [1, true], [2, false], [3, false]]);
          pushFrom(g, [[1, true], [2, false], [3, false], [0, false]]);
          pushFrom(g, [[2, false], [3, false], [1, false], [0, false]]);
          break;
        default:
          for (let i = 0; i < size; i++) { const p = pullAny(); if (p) g.push(p); }
          break;
      }
      groups.push(g);
    }
    return groups;
  }

  function _draftInOrder(players, sizes) {
    const list = players.slice();
    const groups = [];
    for (const s of sizes) {
      const g = [];
      for (let i = 0; i < s; i++) if (list.length) g.push(list.shift());
      groups.push(g);
    }
    return groups;
  }

  function _draftABCD(buckets, sizes) {
    const queues = buckets.map(b => b.slice());
    const pullFront = (i) => (queues[i] && queues[i].length) ? queues[i].shift() : null;
    const pullAny = () => {
      for (let i = 0; i < queues.length; i++) if (queues[i].length) return queues[i].shift();
      return null;
    };
    const B = Math.max(1, queues.length);
    const groups = [];
    for (const s of sizes) {
      const g = [];
      let k = 0;
      while (g.length < s) {
        const p = pullFront(k % B) || pullAny();
        if (!p) break;
        g.push(p);
        k += 1;
      }
      groups.push(g);
    }
    return groups;
  }

  function _draftRandom(players, sizes) {
    const list = players.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return _draftInOrder(list, sizes);
  }

  function _draftLeastPlayed(pool, sizes, matrix) {
    const real = pool.filter(p => !isNH(p.playerGHIN));
    const nh   = pool.filter(p =>  isNH(p.playerGHIN));
    const remaining = [...real, ...nh];
    const groups = [];
    for (const size of sizes) {
      if (!remaining.length) break;
      const anchor = remaining.shift();
      const group = [anchor];
      while (group.length < size && remaining.length) {
        const best = _pickBestCandidate(group, remaining, matrix);
        if (!best) break;
        remaining.splice(remaining.indexOf(best), 1);
        group.push(best);
      }
      groups.push(group);
    }
    return groups;
  }

  function _pickBestCandidate(group, remaining, matrix) {
    let best = null, bestScore = null;
    for (const candidate of remaining) {
      let totalCount = 0, mostRecentLast = null;
      for (const member of group) {
        const key = [member.playerGHIN, candidate.playerGHIN].sort().join("|");
        const entry = matrix[key];
        if (entry) {
          totalCount += entry.count;
          if (entry.last && (!mostRecentLast || entry.last > mostRecentLast)) mostRecentLast = entry.last;
        }
      }
      const score = { count: totalCount, last: mostRecentLast, spread: _spreadIfAdded(group, candidate) };
      if (!best || _compareScore(score, bestScore) < 0) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function _compareScore(a, b) {
    if (a.count !== b.count) return a.count - b.count;
    if (a.last !== b.last) {
      if (a.last === null) return -1;
      if (b.last === null) return 1;
      return a.last.localeCompare(b.last);
    }
    return a.spread - b.spread;
  }

  function _spreadIfAdded(group, candidate) {
    const vals = [...group, candidate].map(p => phValue(p));
    return Math.max(...vals) - Math.min(...vals);
  }

  window.MA = MA;

})();
