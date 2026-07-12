/* /assets/modules/module_defineFlights.js
 *
 * MA.defineFlights — Define Flights module.
 * Shared by Event Roster and Game/Round Roster (mirrors MA.manageTeams's
 * dual-usage pattern). On Event Roster, showModeToggle:true renders the
 * EVENT/ROUND toggle; when mode is "fixed", the saved config/assignments
 * cascade to every linked round. On Game/Round Roster, no toggle is
 * shown — a flat game, or a round with cascading turned off, edits its
 * own flights independently, same posture as Manage Teams.
 *
 * Mirrors MA.manageTeams's structure and class vocabulary (maModal,
 * maListRow, ma_shared.css) but adapted for Flight's shape:
 *   - 1 to 5 flights (never 0 — a fresh event always has a default
 *     single flight; there is no "unconfigured" state to render)
 *   - no color per flight
 *   - assignment is N-way single-select (.maChoiceChip), not a fixed
 *     two-badge toggle (.maTeamBadge is Team-specific, not reused here)
 *   - gender is shown per row (avatar color-coded + M/F text badge),
 *     since it's a common cue when sorting players into flights
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
 *     mode           : string       — current *Mode ("fixed"|"none"). Only
 *                                      meaningful when showModeToggle is true.
 *                                      Defaults off. Bundled into the same Apply
 *                                      as config/assignments — flipping it alone
 *                                      does nothing until Apply is clicked.
 *     showModeToggle : bool         — true only for the Event Roster usage.
 *                                      Renders the EVENT/ROUND segmented toggle.
 *                                      Omit (or false) for the round/flat-game
 *                                      usage — module has no mode of its own
 *                                      and can omit the mode option entirely.
 *     apiBase        : string       — "/api/event_roster" or "/api/game_players"
 *     onApply        : function({ players, flightConfig, mode })
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
  let _mode          = "none"; // "fixed" | "none" — defaults off
  let _busy          = false;
  let _cfgOpen       = false;  // config strip collapsed by default

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
    _opts    = options || {};
    _flights = normalizeFlightConfig(_opts.flightConfig);
    _players = (_opts.players || []).map(normalizePlayer);
    _mode    = (_opts.mode === "fixed") ? "fixed" : "none";

    // Every player always has a flight — default anyone unassigned
    // (legacy rows, or players added before this feature existed) to
    // the first flight rather than rendering a false "unassigned" state.
    const defaultId = _flights[0]?.id || "F1";
    _players.forEach(p => { if (!p.flight) p.flight = defaultId; });

    _busy    = false;
    _cfgOpen = false;

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

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Define Flights">
        ${_renderHeader()}
        ${_renderConfigStrip()}
        <div class="maModal__body" id="dfRoster" style="padding:0;">
          <div class="maListRows">${_renderRosterRows()}</div>
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="dfBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="dfBtnApply">Apply</button>
        </footer>
      </section>`;
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
    return _flights.map(f => f.name).join(", ");
  }

  // Collapsed by default — flight config is edited rarely relative to
  // assignment; the roster is the primary surface of this module.
  function _renderConfigStrip() {
    return `
      <div class="maModal__controls" id="dfCfgStrip" style="padding:0;">
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
          <div id="dfCfgRows" style="display:flex; flex-direction:column; gap:8px;">
            ${_renderFlightNameRows()}
          </div>
          <button type="button" class="btn btnSecondary" id="dfBtnAddFlight"
                  style="margin-top:8px; width:100%; font-size:12px;"
                  ${_flights.length >= MAX_FLIGHTS ? "disabled" : ""}>
            + Add flight
          </button>
          ${_renderModeToggle()}
          <button type="button" class="btn btnLink" id="dfBtnResetFlights"
                  style="margin-top:10px; font-size:12px; color:var(--danger);">
            Reset — move all players to one flight
          </button>
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
  function _renderModeToggle() {
    if (!_opts.showModeToggle) return "";
    const eventActive = (_mode === "fixed");
    const roundActive = !eventActive;
    return `
      <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:12px; font-weight:700; color:var(--mutedText); white-space:nowrap;">Flights Managed by</span>
        <div class="maSeg" id="dfModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Flight management level">
          <button type="button" class="maSegBtn${eventActive ? " btnSecondary" : ""}"
                  data-mode="fixed" aria-pressed="${eventActive}">EVENT</button>
          <button type="button" class="maSegBtn${roundActive ? " btnSecondary" : ""}"
                  data-mode="none" aria-pressed="${roundActive}">ROUND</button>
        </div>
      </div>`;
  }

  function _renderFlightNameRows() {
    return _flights.map(f => {
      const count = countByFlight(f.id);
      const canRemove = _flights.length > MIN_FLIGHTS;
      return `
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="text"
                   class="maTextInput"
                   data-flight-id="${esc(f.id)}"
                   value="${esc(f.name)}"
                   maxlength="32"
                   style="flex:1; height:32px; font-size:13px !important; padding:0 8px;"
                   aria-label="${esc(f.name)} flight name">
            <button type="button" class="iconBtn btnSecondary" data-remove-flight="${esc(f.id)}"
                    ${canRemove ? "" : "disabled"} aria-label="Remove ${esc(f.name)}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="maListRow__subline maListRow__subline--indented" data-flight-count="${esc(f.id)}">
            ${count} player${count !== 1 ? "s" : ""}
          </div>
        </div>`;
    }).join("");
  }

  function _renderRosterRows() {
    const players = sortedPlayers();
    if (!players.length) return `<div class="maEmptyState">No players on this roster.</div>`;
    return players.map(_renderPlayerRow).join("");
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
                      class="maChoiceChip ${p.flight === f.id ? "is-selected" : ""}"
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
    });

    overlay.querySelector("#dfBtnResetFlights")?.addEventListener("click", _confirmResetFlights);

    overlay.querySelector("#dfRoster")?.addEventListener("click", e => {
      const chip = e.target.closest("[data-assign-flight][data-ghin]");
      if (!chip) return;
      const player = _players.find(p => p.ghin === chip.dataset.ghin);
      if (!player || player.flight === chip.dataset.assignFlight) return;
      player.flight = chip.dataset.assignFlight;
      _refreshPlayerRow(player.ghin);
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
      MA.setStatus?.(
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
  function _confirmResetFlights() {
    if (_flights.length === MIN_FLIGHTS) return; // already a single flight — nothing to collapse
    if (!window.confirm(
      `This will move all ${_players.length} player${_players.length !== 1 ? "s" : ""} into a single flight. ` +
      `This won't take effect until you click Apply.`
    )) return;
    _resetFlights();
  }

  function _resetFlights() {
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
      seg.classList.toggle("btnSecondary", on);
      seg.setAttribute("aria-pressed", String(on));
    });
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
      el.textContent = `${n} player${n !== 1 ? "s" : ""}`;
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

  async function _applyChanges() {
    if (_busy) return;
    _busy = true; _showBusy("Saving flights — please wait...");
    try {
      const configRes = await MA.postJson(apiPath("saveFlightConfig.php"), {
        flights: _flights.map(f => ({ id: f.id, name: f.name, sort: f.sort })),
        mode: _mode,
      });
      if (!configRes?.ok) { MA.setStatus(configRes?.message || "Unable to save flight configuration.", "danger"); return; }
      _flights = normalizeFlightConfig(configRes.payload?.flightConfig || { flights: _flights });
      _mode = configRes.payload?.mode || _mode;

      const assignments = _players.map(p => ({ ghin: p.ghin, flight: p.flight }));
      const assignRes = await MA.postJson(apiPath("saveFlightAssignments.php"), { assignments });
      if (!assignRes?.ok) { MA.setStatus(assignRes?.message || "Unable to save flight assignments.", "danger"); return; }

      MA.setStatus("Flights saved.", "success");
      if (typeof _opts.onApply === "function") {
        _opts.onApply({
          players: assignRes.payload?.players || [],
          flightConfig: { flights: _flights },
          mode: _mode,
        });
      }
      MA.defineFlights.close();
    } catch (e) {
      console.error("[MA.defineFlights]", e);
      MA.setStatus("Error saving flights.", "danger");
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

  window.MA = MA;

})();
