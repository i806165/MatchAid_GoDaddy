/* /assets/modules/module_defineFlights.js
 *
 * MA.defineFlights — Define Flights module.
 * Shared by Event Roster and Game/Round Roster (mirrors MA.manageTeams's
 * dual-usage pattern). On Event Roster, showModeToggle:true renders the
 * "Activate" toggle (writes dbEvents_FlightMode "fixed"/"none" — cascade
 * authority; Activation and Propagation are the same decision at the
 * event level). On Game/Round Roster, showActivationToggle:true renders
 * a separate "Activate" toggle owned entirely by the round
 * (dbGames_FlightMode "active"/"disabled" — Round-Level Dimension
 * Activation, independent of the event's toggle). Exactly one of the two
 * is ever true for a given usage. Either toggle expands/collapses the
 * player-row roster below it; neither ever clears underlying data.
 *
 * Mirrors MA.manageTeams's structure and class vocabulary (maModal,
 * maListRow, ma_shared.css) but adapted for Flight's shape:
 *   - 1 to 5 flights (never 0 — a fresh event always has a default
 *     single flight; there is no "unconfigured" state to render)
 *   - no color per flight
 *   - assignment is N-way single-select (.maChoiceChip), not a fixed
 *     two-badge toggle (.maTeamBadge is Team-specific, not reused here).
 *     Selected state uses .is-selected-accent (brandSecondary green), not
 *     the default tan .is-selected — the chip strip sits directly beneath
 *     the by-player/by-flight view toggle below, which IS tan, and the two
 *     would otherwise look like the same kind of "selected" despite meaning
 *     unrelated things (content assignment vs. which view you're looking at).
 *   - gender is shown per row (avatar color-coded + M/F text badge),
 *     since it's a common cue when sorting players into flights
 *   - Activate toggle (both usages) is framed as a yes/no question, not
 *     an EVENT/ROUND location choice, with a hint line stating the
 *     consequence of the current selection. Rendered in brandColor3 blue
 *     (.is-active-accent), not the standard tan .is-active, since it's a
 *     binary decision with real consequences, unlike the view toggle.
 *   - roster has a by-player / by-flight view toggle (.maSeg, standard
 *     tan .is-active) — a display preference independent of Activation,
 *     available in both Event Roster and round usage
 *
 * Public API:
 *   MA.defineFlights.open(options)
 *   MA.defineFlights.close()
 *
 * Options:
 *   {
 *     players        : array        — raw player rows from state.players (db field names)
 *     flightConfig   : object|null  — current flightConfig value; null/empty
 *                                      is normalized to one default flight
 *     mode           : string       — current dbEvents_FlightMode ("fixed"|"none").
 *                                      Only meaningful when showModeToggle is true —
 *                                      the round-level usage ignores it (see
 *                                      activation below instead). Bundled into
 *                                      the same Apply as config/assignments —
 *                                      flipping it alone does nothing until
 *                                      Apply is clicked.
 *     showModeToggle : bool         — true only for the Event Roster usage.
 *                                      Renders the toggle (labeled "Activate" in
 *                                      the UI — Activation and Propagation are
 *                                      the same single decision at the event
 *                                      level; see round_dimension_activation_spec).
 *                                      Flipping it also expands/collapses the
 *                                      player-row roster below. Omit (or false)
 *                                      for the round/flat-game usage.
 *
 *     activation          : string  — ROUND-LEVEL ONLY. Current dbGames_FlightMode
 *                                      ("active"|"disabled") — this round's OWN
 *                                      Activation flag, independent of the
 *                                      event's dbEvents_FlightMode/showModeToggle
 *                                      above. Only meaningful when
 *                                      showActivationToggle is true.
 *     showActivationToggle : bool   — true only for the round-level (game_players)
 *                                      usage, and only when the caller has
 *                                      already confirmed the event isn't
 *                                      authoritative for Flight (this modal is
 *                                      never opened at all otherwise — see
 *                                      game_players.js's onDefineFlights() lock
 *                                      check). Renders an Activate/Deactivate
 *                                      toggle that expands/collapses the
 *                                      player-row roster and is bundled into
 *                                      the same Apply as config/assignments.
 *                                      Deactivating never clears
 *                                      dbGames_FlightConfig or any player's
 *                                      FlightKey — display-only.
 *
 *     apiBase        : string       — "/api/event_roster" or "/api/game_players"
 *     onApply        : function({ players, flightConfig, mode, activation })
 *   }
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.defineFlights = MA.defineFlights || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const OVERLAY_ID = "maDefineFlightsOverlay";
  const MAX_FLIGHTS = 5;
  const MIN_FLIGHTS = 1;

  // ── Module state ─────────────────────────────────────────────────────────────
  let _opts         = {};
  let _flights       = [];     // [{ id, name, sort }]
  let _players       = [];
  let _mode          = "none";     // "fixed" | "none" — event's dbEvents_FlightMode, see showModeToggle
  let _activation    = "disabled"; // "active" | "disabled" — round's OWN dbGames_FlightMode, see showActivationToggle
  let _busy          = false;
  let _cfgOpen       = false;  // config strip (flight naming) collapsed by default — unrelated to Activation
  let _viewMode      = "player"; // "player" | "flight" — roster grouping

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safe(v) { return String(v ?? "").trim(); }

  function deepClone(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : null; }

  // Normalizes whatever flightConfig came in; guarantees at least one entry.
  function normalizeFlightConfig(cfg) {
    const list = Array.isArray(cfg?.flights) ? cfg.flights : [];
    if (!list.length) {
      return [{ id: "F1", name: "Flight 1", sort: 1 }];
    }
    return list
      .slice(0, MAX_FLIGHTS)
      .map((f, i) => ({
        id: `F${i + 1}`,               // canonical — position-based, not trusted from server blindly
        name: safe(f.name) || `Flight ${i + 1}`,
        sort: i + 1,
      }));
  }

  function normalizePlayer(r) {
    const g = safe(r.dbPlayers_Gender || r.gender || "").toLowerCase();
    return {
      ghin:   safe(r.dbPlayers_PlayerGHIN || r.ghin  || ""),
      name:   safe(r.dbPlayers_Name       || r.name  || ""),
      lname:  safe(r.dbPlayers_LName      || r.lname || ""),
      hi:     safe(r.dbPlayers_HI         || r.hi    || ""),
      gender: (g === "m" || g === "f") ? g : "",
      flight: safe(r.dbPlayers_FlightKey  || r.flight || ""),
    };
  }

  function initials(p) {
    const f = safe(p.name).split(" ")[0] || "";
    const l = safe(p.lname) || "";
    return ((f[0] || "") + (l[0] || "")).toUpperCase() || "?";
  }

  function genderClass(p) {
    return p.gender === "m" ? "maListRow__avatar--m"
         : p.gender === "f" ? "maListRow__avatar--f"
         : "maListRow__avatar--u";
  }

  function genderLabel(p) {
    return p.gender === "m" ? "M" : p.gender === "f" ? "F" : "";
  }

  function getFlight(id) {
    return _flights.find(f => f.id === id) || null;
  }

  function getFlightName(id) {
    return getFlight(id)?.name || id;
  }

  function countByFlight(id) {
    return _players.filter(p => p.flight === id).length;
  }

  function unassignedCount() {
    return _players.filter(p => !p.flight).length;
  }

  // Alpha within flight, flights in sort order
  function sortedPlayers() {
    const order = {};
    _flights.forEach((f, i) => { order[f.id] = i; });
    return [..._players].sort((a, b) => {
      const ao = order[a.flight] ?? 999;
      const bo = order[b.flight] ?? 999;
      if (ao !== bo) return ao - bo;
      return safe(a.lname + a.name).localeCompare(safe(b.lname + b.name));
    });
  }

  function apiPath(endpoint) {
    return safe(_opts.apiBase || "/api/event_roster").replace(/\/$/, "") + "/" + endpoint;
  }

  // Whether the player-row roster should currently be shown expanded.
  // Event usage: driven by _mode ("fixed" = Activated). Round usage:
  // driven by _activation ("active" = Activated). Unrelated to _cfgOpen,
  // which is the separate flight-NAMING panel's own collapse state.
  function _isExpanded() {
    if (_opts.showModeToggle) return _mode === "fixed";
    if (_opts.showActivationToggle) return _activation === "active";
    return true;
  }

  // ── Overlay ──────────────────────────────────────────────────────────────────

  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) MA.defineFlights.close(); });
      document.body.appendChild(el);
    }
    return el;
  }

  function _setScrollLock(on) {
    document.documentElement.classList.toggle("maOverlayOpen", !!on);
  }

  function _getModal() {
    return document.querySelector(`#${OVERLAY_ID} .maModal`);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  MA.defineFlights.open = function (options) {
    _opts       = options || {};
    _flights    = normalizeFlightConfig(_opts.flightConfig);
    _players    = (_opts.players || []).map(normalizePlayer);
    _mode       = (_opts.mode === "fixed") ? "fixed" : "none";
    _activation = (_opts.activation === "active") ? "active" : "disabled";

    // Every player always has a flight — default anyone unassigned
    // (legacy rows, or players added before this feature existed) to
    // the first flight rather than rendering a false "unassigned" state.
    const defaultId = _flights[0]?.id || "F1";
    _players.forEach(p => { if (!p.flight) p.flight = defaultId; });

    _busy     = false;
    // Expanded by default only for a first-time setup (still just the
    // single default flight) — surfaces the apply-to-all-rounds decision
    // when it matters most. Once flights are actually defined (>1), a
    // returning admin almost always just wants the roster, so it stays
    // collapsed, same as before.
    _cfgOpen  = (_flights.length <= 1);
    _viewMode = "player";

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _setScrollLock(true);
    _wireEvents();
  };

  MA.defineFlights.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _setScrollLock(false);
    _busy = false;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const NOTICE_ID = "dfNotice";

  function _renderModal() {
    const expanded = _isExpanded();
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Define Flights">
        ${_renderHeader()}
        ${_renderNoticeHtml()}
        ${_renderConfigStrip()}
        <div class="maModal__body${expanded ? "" : " is-collapsed"}" id="dfRoster"
             style="padding:0; ${expanded ? "" : "display:none;"}">
          <div class="maListRows">${_renderRosterRows()}</div>
        </div>
        <div class="maListRow__subline" id="dfCollapsedHint"
             style="padding:10px 16px; ${expanded ? "display:none;" : ""}">
          Flight assignments are hidden while deactivated. Activate to view and edit them.
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="dfBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="dfBtnApply">Apply</button>
        </footer>
      </section>`;
  }

  // Persistent, hidden-by-default in-modal notice. MA.setStatus() writes
  // to a page-chrome element that sits BEHIND this modal's full-screen
  // overlay — the user can never see it while the modal is open. Every
  // save-failure/success/validation message inside this modal must go
  // through _showModalNotice() instead, never MA.setStatus() directly.
  // Mirrors module_defineTeams.js's identical helper.
  function _renderNoticeHtml() {
    return `<div id="${NOTICE_ID}" class="maModalNotice" role="alert" aria-live="assertive"
                 style="display:none; margin:10px 16px 0; padding:10px 12px; border-radius:6px; font-size:12.5px; font-weight:600; line-height:1.4;"></div>`;
  }

  function _noticeLevelStyle(level) {
    const map = {
      danger:  { bg: "rgba(211,47,47,.10)",  border: "#d32f2f", color: "#b71c1c" },
      warn:    { bg: "rgba(237,158,0,.12)",  border: "#ed9e00", color: "#8a6100" },
      success: { bg: "rgba(46,125,50,.10)",  border: "#2e7d32", color: "#1b5e20" },
    };
    return map[level] || map.warn;
  }

  function _showModalNotice(message, level) {
    const el = document.getElementById(NOTICE_ID);
    if (!el) { MA.setStatus?.(message, level); return; }
    const s = _noticeLevelStyle(level);
    el.textContent = message;
    el.style.display = "block";
    el.style.background = s.bg;
    el.style.borderLeft = `3px solid ${s.border}`;
    el.style.color = s.color;
  }

  function _hideModalNotice() {
    const el = document.getElementById(NOTICE_ID);
    if (el) el.style.display = "none";
  }

  function _renderHeader() {
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Define Flights</div>
          <div class="maModal__subtitle" id="dfSubtitle">${esc(_subtitleText())}</div>
        </div>
        <button type="button" class="iconBtn btnPrimary" id="dfBtnClose" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>`;
  }

  function _subtitleText() {
    const n = _players.length;
    const u = unassignedCount();
    return u > 0
      ? `${n} Player${n !== 1 ? "s" : ""} — ${u} unassigned`
      : `${n} Player${n !== 1 ? "s" : ""} — All assigned`;
  }

  function _cfgSummaryText() {
    return _cfgOpen ? "Collapse flight section" : "Expand flight section";
  }

  // Collapsed by default — flight config is edited rarely relative to
  // assignment; the roster is the primary surface of this module. The
  // apply-toggle (Event Roster usage only) sits at the TOP of the panel,
  // above the flight rows — it's the higher-level decision (does this
  // cascade at all), so it's answered before the detail work below it.
  // "Clear flights" sits paired with "Add flight" as an equal-weight
  // action, not a separate link — both are flight-list-level operations.
  // The by-player/by-flight view toggle is a roster DISPLAY preference,
  // not a flight-configuration edit, so it renders as its own block below
  // the collapsible panel, always visible regardless of _cfgOpen.
  function _renderConfigStrip() {
    const applyToggle = _opts.showModeToggle ? _renderApplyToggle() : _renderActivationToggle();
    return `
      <div id="dfCfgStrip">
        <div class="maModal__controls" style="padding:0;">
          <button type="button" id="dfBtnToggleCfg"
                  aria-expanded="${_cfgOpen}"
                  style="width:100%; display:flex; align-items:center; justify-content:space-between;
                         padding:10px 16px; border:none; border-radius:0; background:var(--rowBgEnrolled,rgba(0,0,0,.03));
                         font-size:12px; font-weight:800; cursor:pointer;">
            <span id="dfCfgSummary" style="color:var(--mutedText);">${esc(_cfgSummaryText())}</span>
            <svg id="dfCfgChevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                 style="transition:transform .15s; transform:rotate(${_cfgOpen ? 180 : 0}deg);">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div id="dfCfgPanel" style="padding:10px 16px 14px; display:${_cfgOpen ? "block" : "none"};">
            ${applyToggle}
            <div id="dfCfgRows" style="${applyToggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
              ${_renderFlightNameRows()}
            </div>
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button type="button" class="btn" id="dfBtnAddFlight"
                      style="flex:1; font-size:12px;"
                      ${_flights.length >= MAX_FLIGHTS ? "disabled" : ""}>
                + Add flight
              </button>
              <button type="button" class="btn" id="dfBtnClearFlights"
                      style="flex:1; font-size:12px; color:var(--danger);">
                Clear flights
              </button>
            </div>
          </div>
        </div>
        <div style="padding:10px 16px 0;">
          ${_renderViewToggle()}
        </div>
      </div>`;
  }

  // Cascade on/off toggle — Event Roster usage only (showModeToggle:true).
  // Bundled into the same Apply as config/assignments — flipping this alone
  // does nothing until Apply is clicked. Defaults off; when off, every
  // linked round keeps whatever flight setup it already has. The round/flat
  // game usage (game_players) has no toggle of its own: a round either
  // follows the event (mode "fixed", set from the Event Roster, causing
  // game_players' Define Flights button to hide) or is fully independent
  // (mode "none"), same as Manage Teams.
  //
  // Framed as a yes/no question ("Activate") rather than an
  // EVENT/ROUND ownership choice — the control only ever renders on the
  // Event Roster page, so asking the admin to pick between "Event" and
  // "Round" as if choosing a location is circular (they're already on the
  // event). What's actually being decided is a consequence, not a location:
  // does this configuration apply everywhere, or does each round set its
  // own. The hint line beneath states that consequence explicitly so the
  // control never depends on the admin inferring it from the label alone.
  // Uses is-active-accent (brandColor3 blue) instead of the standard tan
  // is-active — this is a binary decision with real cascading consequences,
  // not a passive display filter like the view toggle below it.
  function _renderApplyToggle() {
    if (!_opts.showModeToggle) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="dfModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate flights for this event">
            <button type="button" class="maSegBtn${yesActive ? " is-active-accent" : ""}"
                    data-mode="fixed" aria-pressed="${yesActive}">Yes</button>
            <button type="button" class="maSegBtn${!yesActive ? " is-active-accent" : ""}"
                    data-mode="none" aria-pressed="${!yesActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="dfModeHint">${esc(_applyHintText())}</div>
      </div>`;
  }

  function _applyHintText() {
    return (_mode === "fixed")
      ? "Flights are active for this event and will apply to every round."
      : "Flights are not active for this event. Each round can set its own.";
  }

  // Round-level "Activate"/"Deactivate" toggle — game_players usage only
  // (showActivationToggle:true). Writes this round's OWN dbGames_FlightMode
  // column, independent of the event's dbEvents_FlightMode above. Only
  // ever rendered when the caller has already confirmed the event isn't
  // authoritative for Flight (this modal doesn't open otherwise — see
  // game_players.js's onDefineFlights() lock check).
  //
  // Deactivating never clears dbGames_FlightConfig or any player's
  // FlightKey — it only collapses the player-row roster below.
  function _renderActivationToggle() {
    if (!_opts.showActivationToggle) return "";
    const isActive = (_activation === "active");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="dfActivationToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate flights for this round">
            <button type="button" class="maSegBtn${isActive ? " is-active-accent" : ""}"
                    data-activation="active" aria-pressed="${isActive}">Yes</button>
            <button type="button" class="maSegBtn${!isActive ? " is-active-accent" : ""}"
                    data-activation="disabled" aria-pressed="${!isActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="dfActivationHint">${esc(_activationHintText())}</div>
      </div>`;
  }

  function _activationHintText() {
    return (_activation === "active")
      ? "Flights are active for this round."
      : "Flights are not active for this round.";
  }

  // Roster display preference — flat list vs grouped-by-flight. Independent
  // of _mode: available in both Event Roster and round usage, since it's
  // just how the (already-loaded) roster is presented, not a config edit.
  function _renderViewToggle() {
    const playerActive = (_viewMode === "player");
    return `
      <div class="maSeg" id="dfViewToggle" role="group" aria-label="Roster view">
        <button type="button" class="maSegBtn${playerActive ? " is-active" : ""}"
                data-view="player" aria-pressed="${playerActive}">By player</button>
        <button type="button" class="maSegBtn${!playerActive ? " is-active" : ""}"
                data-view="flight" aria-pressed="${!playerActive}">By flight</button>
      </div>`;
  }

  function _renderFlightNameRows() {
    return _flights.map(f => {
      const count = countByFlight(f.id);
      const canRemove = _flights.length > MIN_FLIGHTS;
      return `
        <div class="dfFlightRow">
          <input type="text"
                 class="maTextInput"
                 data-flight-id="${esc(f.id)}"
                 value="${esc(f.name)}"
                 maxlength="32"
                 style="flex:1; min-width:80px; height:32px; font-size:13px !important; padding:0 8px;"
                 aria-label="${esc(f.name)} flight name">
          <button type="button" class="iconBtn btnSecondary" data-remove-flight="${esc(f.id)}"
                  ${canRemove ? "" : "disabled"} aria-label="Remove ${esc(f.name)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span class="maListRow__subline dfFlightCount" data-flight-count="${esc(f.id)}"
                aria-label="${count} player${count !== 1 ? "s" : ""}">
            ${count}
          </span>
        </div>`;
    }).join("");
  }

  function _renderRosterRows() {
    const players = sortedPlayers();
    if (!players.length) return `<div class="maEmptyState">No players on this roster.</div>`;
    if (_viewMode === "flight") return _renderRosterRowsByFlight(players);
    return players.map(_renderPlayerRow).join("");
  }

  // Same chip strip under each row as the flat view — a player sitting in
  // the "Flight 1" section can still tap "Flight 2" to move themselves,
  // without leaving the grouped view. Reuses .maListRow__group--none, the
  // same neutral section-divider class event_roster.js already uses for
  // Team grouping — flights have no color of their own (see header note).
  function _renderRosterRowsByFlight(players) {
    return _flights.map(f => {
      const group = players.filter(p => p.flight === f.id);
      const count = group.length;
      const header = `<div class="maListRow__group maListRow__group--none">${esc(f.name)} &middot; ${count} player${count !== 1 ? "s" : ""}</div>`;
      const rows = count
        ? group.map(_renderPlayerRow).join("")
        : `<div class="maEmptyState" style="padding:10px 16px;">No players in this flight.</div>`;
      return header + rows;
    }).join("");
  }

  function _renderPlayerRow(p) {
    const ini    = esc(initials(p));
    const name   = esc(p.lname ? `${p.lname}, ${p.name.split(" ")[0]}` : p.name);
    const gender = genderLabel(p);
    const hi     = p.hi ? `HI ${esc(p.hi)}` : "";

    return `
      <div class="maListRow" data-ghin="${esc(p.ghin)}">
        <div class="maListRow__avatar ${genderClass(p)}" aria-hidden="true">${ini}</div>
        <div class="maListRow__col" style="flex:1; min-width:0;">
          <div style="display:flex; align-items:baseline; gap:8px;">
            <span>${name}</span>
            ${gender ? `<span class="maPill" style="font-size:10px; padding:1px 5px;">${gender}</span>` : ""}
            ${hi ? `<span class="maListRow__subline" style="margin-left:auto; flex-shrink:0;">${esc(hi)}</span>` : ""}
          </div>
          <div class="maChoiceChips" style="margin-top:6px;" role="group" aria-label="Flight assignment for ${name}">
            ${_flights.map(f => `
              <button type="button"
                      class="maChoiceChip ${p.flight === f.id ? "is-selected-accent" : ""}"
                      data-assign-flight="${esc(f.id)}" data-ghin="${esc(p.ghin)}"
                      aria-pressed="${p.flight === f.id}">${esc(f.name)}</button>
            `).join("")}
          </div>
        </div>
      </div>`;
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#dfBtnClose")?.addEventListener("click", () => { if (!_busy) MA.defineFlights.close(); });
    overlay.querySelector("#dfBtnCancel")?.addEventListener("click", () => { if (!_busy) MA.defineFlights.close(); });

    overlay.querySelector("#dfBtnToggleCfg")?.addEventListener("click", () => {
      _cfgOpen = !_cfgOpen;
      const panel = overlay.querySelector("#dfCfgPanel");
      const chevron = overlay.querySelector("#dfCfgChevron");
      if (panel) panel.style.display = _cfgOpen ? "block" : "none";
      if (chevron) chevron.style.transform = `rotate(${_cfgOpen ? 180 : 0}deg)`;
      overlay.querySelector("#dfBtnToggleCfg")?.setAttribute("aria-expanded", String(_cfgOpen));
      _refreshCfgSummary();
    });

    overlay.querySelectorAll(".maTextInput[data-flight-id]").forEach(inp => {
      inp.addEventListener("input", () => {
        const f = getFlight(inp.dataset.flightId);
        if (f) {
          f.name = safe(inp.value) || f.name;
          _refreshChipLabels();
          _refreshCfgSummary();
        }
      });
    });

    overlay.querySelectorAll("[data-remove-flight]").forEach(btn => {
      btn.addEventListener("click", () => _confirmRemoveFlight(btn.dataset.removeFlight));
    });

    overlay.querySelector("#dfBtnAddFlight")?.addEventListener("click", _addFlight);

    overlay.querySelector("#dfModeToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-mode]");
      if (!seg) return;
      _mode = seg.dataset.mode;
      _refreshModeToggle();
      _refreshRosterVisibility();
    });

    overlay.querySelector("#dfActivationToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-activation]");
      if (!seg) return;
      _activation = seg.dataset.activation;
      _refreshActivationToggle();
      _refreshRosterVisibility();
    });

    overlay.querySelector("#dfViewToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-view]");
      if (!seg || seg.dataset.view === _viewMode) return;
      _viewMode = seg.dataset.view;
      _refreshConfigStrip(); // updates the toggle's own active pill
      _refreshRoster();      // reflows flat <-> grouped
    });

    overlay.querySelector("#dfBtnClearFlights")?.addEventListener("click", _confirmClearFlights);

    overlay.querySelector("#dfRoster")?.addEventListener("click", e => {
      const chip = e.target.closest("[data-assign-flight][data-ghin]");
      if (!chip) return;
      const player = _players.find(p => p.ghin === chip.dataset.ghin);
      if (!player || player.flight === chip.dataset.assignFlight) return;
      player.flight = chip.dataset.assignFlight;
      // Grouped view: reassignment moves the row to a different section,
      // so the whole roster needs to reflow, not just the one row.
      if (_viewMode === "flight") _refreshRoster();
      else _refreshPlayerRow(player.ghin);
      _refreshFlightCounts();
      _refreshSubtitle();
    });

    overlay.querySelector("#dfBtnApply")?.addEventListener("click", _applyChanges);
  }

  // ── Config mutations ─────────────────────────────────────────────────────────

  function _addFlight() {
    if (_flights.length >= MAX_FLIGHTS) return;
    const n = _flights.length + 1;
    _flights.push({ id: `F${n}`, name: `Flight ${n}`, sort: n });
    _refreshConfigStrip();
    _refreshRoster();
    _refreshCfgSummary();
  }

  // Removing a flight with players in it is blocked rather than silently
  // reassigning them — a player's flight change is meaningful to event-wide
  // scoring parity, so it should always be a deliberate reassignment, not
  // a side effect of deleting a bucket.
  function _confirmRemoveFlight(flightId) {
    if (_flights.length <= MIN_FLIGHTS) return;
    const count = countByFlight(flightId);
    if (count > 0) {
      _showModalNotice(
        `Move ${count} player${count !== 1 ? "s" : ""} out of ${getFlightName(flightId)} before removing it.`,
        "warn"
      );
      return;
    }
    _flights = _flights.filter(f => f.id !== flightId).map((f, i) => ({ ...f, id: `F${i + 1}`, sort: i + 1 }));
    // Re-point any (now impossible, but defensive) stray assignments
    _players.forEach(p => { if (!getFlight(p.flight)) p.flight = _flights[0]?.id || "F1"; });
    _refreshConfigStrip();
    _refreshRoster();
    _refreshCfgSummary();
    _refreshSubtitle();
  }

  // Explicit bulk affordance for "I don't want the flight concept right now" —
  // without this, un-splitting 33 players back to one bucket would mean
  // reassigning them one chip click at a time before the blocked-removal
  // guard above would even let the extra flights go. Staged locally like
  // every other edit here (rename, add, remove, assign) — takes effect on
  // the next Apply, not immediately, consistent with the rest of this module.
  //
  // Named "Clear", not "Reset" — this collapses every player into one
  // flight permanently; there's no prior/default state it's reverting to,
  // so "reset" would overstate an undo-ability that doesn't exist.
  function _confirmClearFlights() {
    if (_flights.length === MIN_FLIGHTS) return; // already a single flight — nothing to clear
    if (!window.confirm(
      `This will clear all flights and move all ${_players.length} player${_players.length !== 1 ? "s" : ""} into one flight. ` +
      `This won't take effect until you click Apply.`
    )) return;
    _clearFlights();
  }

  function _clearFlights() {
    _flights = [{ id: "F1", name: "Flight 1", sort: 1 }];
    _players.forEach(p => { p.flight = "F1"; });
    _refreshConfigStrip();
    _refreshRoster();
    _refreshCfgSummary();
    _refreshSubtitle();
  }

  // ── Partial re-renders ───────────────────────────────────────────────────────

  function _refreshConfigStrip() {
    const strip = document.getElementById("dfCfgStrip");
    if (!strip) return;
    strip.outerHTML = _renderConfigStrip();
    _wireEvents(); // config strip DOM was replaced — rebind
  }

  function _refreshModeToggle() {
    const wrap = document.getElementById("dfModeToggle");
    if (!wrap) return;
    wrap.querySelectorAll("[data-mode]").forEach(seg => {
      const on = (seg.dataset.mode === _mode);
      seg.classList.toggle("is-active-accent", on);
      seg.setAttribute("aria-pressed", String(on));
    });
    const hint = document.getElementById("dfModeHint");
    if (hint) hint.textContent = _applyHintText();
  }

  function _refreshActivationToggle() {
    const wrap = document.getElementById("dfActivationToggle");
    if (!wrap) return;
    wrap.querySelectorAll("[data-activation]").forEach(seg => {
      const on = (seg.dataset.activation === _activation);
      seg.classList.toggle("is-active-accent", on);
      seg.setAttribute("aria-pressed", String(on));
    });
    const hint = document.getElementById("dfActivationHint");
    if (hint) hint.textContent = _activationHintText();
  }

  // Shared by both toggles — expand/collapse is purely a display concern
  // (player rows only); no data is read, written, or cleared here.
  function _refreshRosterVisibility() {
    const expanded = _isExpanded();
    const roster = document.getElementById("dfRoster");
    const hint    = document.getElementById("dfCollapsedHint");
    if (roster) {
      roster.style.display = expanded ? "" : "none";
      roster.classList.toggle("is-collapsed", !expanded);
    }
    if (hint) hint.style.display = expanded ? "none" : "";
  }

  function _refreshPlayerRow(ghin) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const row    = overlay.querySelector(`.maListRow[data-ghin="${CSS.escape(ghin)}"]`);
    const player = _players.find(p => p.ghin === ghin);
    if (!row || !player) return;
    row.outerHTML = _renderPlayerRow(player);
  }

  function _refreshRoster() {
    const el = document.querySelector("#dfRoster .maListRows");
    if (el) el.innerHTML = _renderRosterRows();
  }

  function _refreshChipLabels() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    _flights.forEach(f => {
      overlay.querySelectorAll(`[data-assign-flight="${f.id}"]`).forEach(b => {
        b.textContent = f.name;
      });
    });
  }

  function _refreshFlightCounts() {
    _flights.forEach(f => {
      const el = document.querySelector(`[data-flight-count="${f.id}"]`);
      if (!el) return;
      const n = countByFlight(f.id);
      el.textContent = String(n);
      el.setAttribute("aria-label", `${n} player${n !== 1 ? "s" : ""}`);
    });
  }

  function _refreshCfgSummary() {
    const el = document.getElementById("dfCfgSummary");
    if (el) el.textContent = _cfgSummaryText();
  }

  function _refreshSubtitle() {
    const el = document.getElementById("dfSubtitle");
    if (el) el.textContent = _subtitleText();
  }

  // ── API calls ────────────────────────────────────────────────────────────────

  // The "mode" value sent to the save endpoint means something different
  // depending on which usage of this module is active — event usage
  // writes dbEvents_FlightMode ("fixed"/"none", cascade authority);
  // round usage writes dbGames_FlightMode ("active"/"disabled", this
  // round's own Activation flag). Each endpoint only ever expects its
  // own vocabulary. Mirrors module_defineTeams.js's identical helper.
  function _modeToSend() {
    return _opts.showModeToggle ? _mode : _activation;
  }

  async function _applyChanges() {
    if (_busy) return;
    _busy = true; _showBusy("Saving flights — please wait...");
    try {
      const configRes = await MA.postJson(apiPath("saveFlightConfig.php"), {
        flights: _flights.map(f => ({ id: f.id, name: f.name, sort: f.sort })),
        mode: _modeToSend(),
      });
      if (!configRes?.ok) { _showModalNotice(configRes?.message || "Unable to save flight configuration.", "danger"); return; }
      _flights = normalizeFlightConfig(configRes.payload?.flightConfig || { flights: _flights });
      if (_opts.showModeToggle) {
        _mode = configRes.payload?.mode || _mode;
      } else {
        _activation = configRes.payload?.mode || _activation;
      }

      const assignments = _players.map(p => ({ ghin: p.ghin, flight: p.flight }));
      const assignRes = await MA.postJson(apiPath("saveFlightAssignments.php"), { assignments });
      if (!assignRes?.ok) { _showModalNotice(assignRes?.message || "Unable to save flight assignments.", "danger"); return; }

      // Modal closes right after this in the clean path — see
      // module_defineTeams.js's identical comment for why a page-level
      // toast is correct here specifically, unlike every other message
      // in this function.
      MA.setStatus("Flights saved.", "success");

      const reconcileSummary = assignRes.payload?.reconcile || null;   // event-shaped
      const reconciled       = assignRes.payload?.reconciled || [];    // round-shaped
      const hasIssue = (reconcileSummary && reconcileSummary.roundsAffected > 0) || reconciled.length > 0;

      if (typeof _opts.onApply === "function") {
        // See module_defineTeams.js's identical comment — "reconcile"
        // (event-shaped) vs "reconciled" (round-shaped, handled below)
        // don't collide, so this module stays context-agnostic.
        _opts.onApply({
          players: assignRes.payload?.players || [],
          flightConfig: { flights: _flights },
          mode: _mode,
          activation: _activation,
          reconcile: reconcileSummary,
        });
      }

      // Save already fully committed — see module_defineTeams.js's
      // identical comment for why staying open (rather than "reverting")
      // is what this buys: an immediate corrective edit, not an undo.
      if (hasIssue) {
        if (reconciled.length) _showReconciledNotice();
      } else {
        MA.defineFlights.close();
      }
    } catch (e) {
      console.error("[MA.defineFlights]", e);
      _showModalNotice("Error saving flights.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  const BUSY_ID = "dfBusyOverlay";

  function _ensureBusyOverlay() {
    if (document.getElementById(BUSY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = BUSY_ID;
    overlay.className = "maModalOverlay";

    const modal = document.createElement("section");
    modal.className = "maModal";
    modal.innerHTML = `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Define Flights</div>
        </div>
      </header>
      <div class="maModal__body" id="dfBusyBody">
        <p id="dfBusyMessage" style="line-height:1.6;"></p>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function _showBusy(message) {
    _ensureBusyOverlay();
    const overlay = document.getElementById(BUSY_ID);
    const body    = document.getElementById("dfBusyBody");
    if (body) body.innerHTML = `<p style="line-height:1.6;">${message || "Processing — please wait..."}</p>`;
    if (overlay) overlay.classList.add("is-open");
  }

  function _hideBusy() {
    const overlay = document.getElementById(BUSY_ID);
    if (overlay) overlay.classList.remove("is-open");
  }

  const RECONCILED_ID = "dfReconciledOverlay";

  function _showReconciledNotice() {
    let overlay = document.getElementById(RECONCILED_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = RECONCILED_ID;
      overlay.className = "maModalOverlay";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="dfReconciledTitle">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div id="dfReconciledTitle" class="maModal__title">Pairings Affected</div>
          </div>
        </header>
        <div class="maModal__body">
          <p style="line-height:1.6;">
            This change affected one or more existing pairings. Please revisit the Pairings page to review and fix them.
          </p>
        </div>
        <footer class="maModal__ftr" style="justify-content:flex-end;">
          <div class="maModal__ftrActions">
            <button type="button" class="maFtrBtn maFtrBtn--save" id="dfReconciledOk">OK</button>
          </div>
        </footer>
      </section>`;
    overlay.className = "maModalOverlay is-open";
    overlay.querySelector("#dfReconciledOk")?.addEventListener("click", () => {
      overlay.className = "maModalOverlay";
      overlay.innerHTML = "";
    });
  }

  window.MA = MA;

})();
