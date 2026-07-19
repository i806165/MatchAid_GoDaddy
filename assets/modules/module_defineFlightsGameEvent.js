/* /assets/modules/module_defineFlightsGameEvent.js
 *
 * MA.defineFlights — Define Flights module. Self-hydrating, dual-target
 * (game/event) retrofit of module_defineFlights.js.
 *
 * ── What's preserved verbatim ────────────────────────────────────────────
 * Every render function, the N-way (1-5) flight model, the by-player/
 * by-flight view toggle, add/remove/clear-flights logic (including the
 * "block removal if players still assigned" and "clear needs
 * confirmation" rules), the gender-coded avatar, and the reconciliation
 * notice — all unchanged from module_defineFlights.js. Same classes, same
 * markup, same business rules.
 *
 * ── What changed — same shape as module_defineTeamsGameEvent.js ─────────
 * Self-hydration, showModeToggle/showActivationToggle derived from
 * target, the event-lock check relocated into the module (target: "game"
 * only), config+assignments collapsed into one save per scope, exit-path
 * contract (onDone(wasSaved) on every route). See
 * module_defineTeamsGameEvent.js's header for the full reasoning — same
 * decisions, same open items (unconfirmed CH/PH on db_EventPlayers, the
 * dbEventPlayers_GHIN vs dbEventPlayers_PlayerGHIN naming gap).
 *
 * Public API:
 *   MA.defineFlights.open({ target, onDone })   target: "game" | "event"
 *   MA.defineFlights.close()
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * saveGameFlights.php / saveEventFlights.php are new, built alongside
 * this module.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.defineFlights = MA.defineFlights || {};

  const OVERLAY_ID = "maDefineFlightsOverlay";
  const NOTICE_ID  = "dfNoticeSlot";
  const MAX_FLIGHTS = 5;
  const MIN_FLIGHTS = 1;

  const CONTEXT_ENDPOINTS = {
    game:  "/api/game_settings/initGameSettings.php",
    event: "/api/event_roster/initEventRoster.php",
  };
  const SAVE_ENDPOINTS = {
    game:  "/api/game_settings/saveGameFlights.php",
    event: "/api/event_roster/saveEventFlights.php",
  };

  // ── Module state ─────────────────────────────────────────────────────
  let _target      = "game";
  let _ctx         = null;
  let _flights     = [];
  let _players     = [];
  let _mode        = "none";
  let _activation  = "disabled";
  let _busy        = false;
  let _cfgOpen     = false;
  let _viewMode    = "player";
  let _onDone      = null;
  let _onEsc       = null;
  let _lockDepth   = 0;
  let _lockedByEvent = false;

  // ── Helpers — unchanged ──────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function safe(v) { return String(v ?? "").trim(); }
  function deepClone(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : null; }

  // FIX — same bug and same fix as module_defineTeamsGameEvent.js:
  // dbGames_FlightConfig/dbEvents_FlightConfig arrive as a raw JSON
  // string, not a pre-parsed object. Without this, cfg?.flights was
  // always undefined, silently falling back to the single-default-flight
  // case every time real, saved flight data existed — quieter than
  // Teams' bug (no literal "F1"/"F2" names shown, since flights already
  // display generated names), but just as wrong: it discarded whatever
  // was actually saved.
  function parseConfigField(raw) {
    if (typeof raw === "string" && raw.trim() !== "") {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return (raw && typeof raw === "object") ? raw : null;
  }

  function normalizeFlightConfig(cfg) {
    const parsed = parseConfigField(cfg);
    const list = Array.isArray(parsed?.flights) ? parsed.flights : [];
    if (!list.length) return [{ id: "F1", name: "Flight 1", sort: 1 }];
    return list.slice(0, MAX_FLIGHTS).map((f, i) => ({
      id: `F${i + 1}`, name: safe(f.name) || `Flight ${i + 1}`, sort: i + 1,
    }));
  }

  // Branches on _target — see module_defineTeamsGameEvent.js's identical note.
  function normalizePlayer(r) {
    const ghin   = _target === "event" ? (r.dbEventPlayers_GHIN   || r.ghin   || "") : (r.dbPlayers_PlayerGHIN || r.ghin   || "");
    const name   = _target === "event" ? (r.dbEventPlayers_Name   || r.name   || "") : (r.dbPlayers_Name       || r.name   || "");
    const lname  = _target === "event" ? (r.dbEventPlayers_LName  || r.lname  || "") : (r.dbPlayers_LName      || r.lname  || "");
    const hi     = _target === "event" ? (r.dbEventPlayers_HI     || r.hi     || "") : (r.dbPlayers_HI         || r.hi     || "");
    const gender = safe(_target === "event" ? (r.dbEventPlayers_Gender || r.gender || "") : (r.dbPlayers_Gender || r.gender || "")).toLowerCase();
    const flight = _target === "event" ? (r.dbEventPlayers_FlightKey || r.flight || "") : (r.dbPlayers_FlightKey || r.flight || "");
    return {
      ghin: safe(ghin), name: safe(name), lname: safe(lname), hi: safe(hi),
      gender: (gender === "m" || gender === "f") ? gender : "",
      flight: safe(flight),
    };
  }

  function initials(p) {
    const f = safe(p.name).split(" ")[0] || "";
    const l = safe(p.lname) || "";
    return ((f[0] || "") + (l[0] || "")).toUpperCase() || "?";
  }
  function genderClass(p) { return p.gender === "m" ? "maListRow__avatar--m" : p.gender === "f" ? "maListRow__avatar--f" : "maListRow__avatar--u"; }
  function genderLabel(p) { return p.gender === "m" ? "M" : p.gender === "f" ? "F" : ""; }
  function getFlight(id) { return _flights.find(f => f.id === id) || null; }
  function getFlightName(id) { return getFlight(id)?.name || id; }
  function countByFlight(id) { return _players.filter(p => p.flight === id).length; }
  function unassignedCount() { return _players.filter(p => !p.flight).length; }

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

  function _showModeToggle()       { return _target === "event"; }
  function _showActivationToggle() { return _target === "game"; }

  function _isExpanded() {
    if (_showModeToggle()) return _mode === "fixed";
    if (_showActivationToggle()) return _activation === "active";
    return true;
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) _dismiss(); });
      document.body.appendChild(el);
    }
    return el;
  }
  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }
  function _dismiss(wasSaved) {
    if (_busy) return;
    MA.defineFlights.close();
    if (typeof _onDone === "function") _onDone(wasSaved);
  }
  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }
  function _hideModalNotice() {
    const slot = document.getElementById(NOTICE_ID);
    if (slot) MA.ui.hideModalNotice(slot);
  }

  // ── Render ───────────────────────────────────────────────────────────
  function _renderModal() {
    if (_lockedByEvent) return _renderLockedModal();
    const expanded = _isExpanded();
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Define Flights">
        ${_renderHeader()}
        <div id="${NOTICE_ID}"></div>
        ${_renderConfigStrip()}
        <div class="maModal__body${expanded ? "" : " is-collapsed"}" id="dfRoster" style="padding:0; ${expanded ? "" : "display:none;"}">
          <div class="maListRows">${_renderRosterRows()}</div>
        </div>
        <div class="maListRow__subline" id="dfCollapsedHint" style="padding:10px 16px; ${expanded ? "display:none;" : ""}">
          Flight assignments are hidden while deactivated. Activate to view and edit them.
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="dfBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="dfBtnApply">Apply</button>
        </footer>
      </section>`;
  }

  // Not part of the original module — see module_defineTeamsGameEvent.js's
  // identical note.
  function _renderLockedModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Define Flights">
        <header class="maModal__hdr">
          <div class="maModal__titles"><div class="maModal__title">Define Flights</div></div>
          <button type="button" class="iconBtn btnPrimary" id="dfBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>
        <div class="maModal__body" style="padding:14px;">
          <div class="maHintText">Flights are set for this event and apply to every round. Manage Flights from the Event Roster page.</div>
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="dfBtnCancel">Close</button>
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
    return u > 0 ? `${n} Player${n !== 1 ? "s" : ""} — ${u} unassigned` : `${n} Player${n !== 1 ? "s" : ""} — All assigned`;
  }
  function _cfgSummaryText() { return _cfgOpen ? "Collapse flight section" : "Expand flight section"; }

  function _renderConfigStrip() {
    const applyToggle = _showModeToggle() ? _renderApplyToggle() : _renderActivationToggle();
    return `
      <div id="dfCfgStrip">
        <div class="maModal__controls" style="padding:0;">
          <button type="button" id="dfBtnToggleCfg" aria-expanded="${_cfgOpen}"
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
              <button type="button" class="btn" id="dfBtnAddFlight" style="flex:1; font-size:12px;" ${_flights.length >= MAX_FLIGHTS ? "disabled" : ""}>+ Add flight</button>
              <button type="button" class="btn" id="dfBtnClearFlights" style="flex:1; font-size:12px; color:var(--danger);">Clear flights</button>
            </div>
          </div>
        </div>
        <div style="padding:10px 16px 0;">${_renderViewToggle()}</div>
      </div>`;
  }

  function _renderApplyToggle() {
    if (!_showModeToggle()) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="dfModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate flights for this event">
            <button type="button" class="maSegBtn${yesActive ? " is-active-accent" : ""}" data-mode="fixed" aria-pressed="${yesActive}">Yes</button>
            <button type="button" class="maSegBtn${!yesActive ? " is-active-accent" : ""}" data-mode="none" aria-pressed="${!yesActive}">No</button>
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

  function _renderActivationToggle() {
    if (!_showActivationToggle()) return "";
    const isActive = (_activation === "active");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="dfActivationToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate flights for this round">
            <button type="button" class="maSegBtn${isActive ? " is-active-accent" : ""}" data-activation="active" aria-pressed="${isActive}">Yes</button>
            <button type="button" class="maSegBtn${!isActive ? " is-active-accent" : ""}" data-activation="disabled" aria-pressed="${!isActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="dfActivationHint">${esc(_activationHintText())}</div>
      </div>`;
  }
  function _activationHintText() {
    return (_activation === "active") ? "Flights are active for this round." : "Flights are not active for this round.";
  }

  function _renderViewToggle() {
    const playerActive = (_viewMode === "player");
    return `
      <div class="maSeg" id="dfViewToggle" role="group" aria-label="Roster view">
        <button type="button" class="maSegBtn${playerActive ? " is-active" : ""}" data-view="player" aria-pressed="${playerActive}">By player</button>
        <button type="button" class="maSegBtn${!playerActive ? " is-active" : ""}" data-view="flight" aria-pressed="${!playerActive}">By flight</button>
      </div>`;
  }

  function _renderFlightNameRows() {
    return _flights.map(f => {
      const count = countByFlight(f.id);
      const canRemove = _flights.length > MIN_FLIGHTS;
      return `
        <div class="dfFlightRow">
          <input type="text" class="maTextInput" data-flight-id="${esc(f.id)}" value="${esc(f.name)}" maxlength="32"
                 style="flex:1; min-width:80px; height:32px; font-size:13px !important; padding:0 8px;"
                 aria-label="${esc(f.name)} flight name">
          <button type="button" class="iconBtn btnSecondary" data-remove-flight="${esc(f.id)}" ${canRemove ? "" : "disabled"} aria-label="Remove ${esc(f.name)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span class="maListRow__subline dfFlightCount" data-flight-count="${esc(f.id)}" aria-label="${count} player${count !== 1 ? "s" : ""}">${count}</span>
        </div>`;
    }).join("");
  }

  function _renderRosterRows() {
    const players = sortedPlayers();
    if (!players.length) return `<div class="maEmptyState">No players on this roster.</div>`;
    if (_viewMode === "flight") return _renderRosterRowsByFlight(players);
    return players.map(_renderPlayerRow).join("");
  }

  function _renderRosterRowsByFlight(players) {
    return _flights.map(f => {
      const group = players.filter(p => p.flight === f.id);
      const count = group.length;
      const header = `<div class="maListRow__group maListRow__group--none">${esc(f.name)} &middot; ${count} player${count !== 1 ? "s" : ""}</div>`;
      const rows = count ? group.map(_renderPlayerRow).join("") : `<div class="maEmptyState" style="padding:10px 16px;">No players in this flight.</div>`;
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
              <button type="button" class="maChoiceChip ${p.flight === f.id ? "is-selected-accent" : ""}"
                      data-assign-flight="${esc(f.id)}" data-ghin="${esc(p.ghin)}" aria-pressed="${p.flight === f.id}">${esc(f.name)}</button>
            `).join("")}
          </div>
        </div>
      </div>`;
  }

  // ── Event wiring — unchanged ─────────────────────────────────────────
  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    if (_lockedByEvent) {
      overlay.querySelector("#dfBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
      overlay.querySelector("#dfBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
      return;
    }

    overlay.querySelector("#dfBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#dfBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });

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
        if (f) { f.name = safe(inp.value) || f.name; _refreshChipLabels(); _refreshCfgSummary(); }
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
      _refreshConfigStrip();
      _refreshRoster();
    });

    overlay.querySelector("#dfBtnClearFlights")?.addEventListener("click", _confirmClearFlights);

    overlay.querySelector("#dfRoster")?.addEventListener("click", e => {
      const chip = e.target.closest("[data-assign-flight][data-ghin]");
      if (!chip) return;
      const player = _players.find(p => p.ghin === chip.dataset.ghin);
      if (!player || player.flight === chip.dataset.assignFlight) return;
      player.flight = chip.dataset.assignFlight;
      if (_viewMode === "flight") _refreshRoster(); else _refreshPlayerRow(player.ghin);
      _refreshFlightCounts();
      _refreshSubtitle();
    });

    overlay.querySelector("#dfBtnApply")?.addEventListener("click", _applyChanges);
  }

  function _addFlight() {
    if (_flights.length >= MAX_FLIGHTS) return;
    const n = _flights.length + 1;
    _flights.push({ id: `F${n}`, name: `Flight ${n}`, sort: n });
    _refreshConfigStrip(); _refreshRoster(); _refreshCfgSummary();
  }

  function _confirmRemoveFlight(flightId) {
    if (_flights.length <= MIN_FLIGHTS) return;
    const count = countByFlight(flightId);
    if (count > 0) {
      _showModalNotice(`Move ${count} player${count !== 1 ? "s" : ""} out of ${getFlightName(flightId)} before removing it.`, "warn");
      return;
    }
    _flights = _flights.filter(f => f.id !== flightId).map((f, i) => ({ ...f, id: `F${i + 1}`, sort: i + 1 }));
    _players.forEach(p => { if (!getFlight(p.flight)) p.flight = _flights[0]?.id || "F1"; });
    _refreshConfigStrip(); _refreshRoster(); _refreshCfgSummary(); _refreshSubtitle();
  }

  async function _confirmClearFlights() {
    if (_flights.length === MIN_FLIGHTS) return;
    const approved = await MA.ui.confirm({
      title: "Clear all flights?",
      message: `This moves all ${_players.length} player${_players.length !== 1 ? "s" : ""} into one flight. This won't take effect until you click Apply.`,
      confirmLabel: "Clear flights", cancelLabel: "Cancel", danger: true
    });
    if (!approved) return;
    _clearFlights();
  }

  function _clearFlights() {
    _flights = [{ id: "F1", name: "Flight 1", sort: 1 }];
    _players.forEach(p => { p.flight = "F1"; });
    _refreshConfigStrip(); _refreshRoster(); _refreshCfgSummary(); _refreshSubtitle();
  }

  function _refreshConfigStrip() {
    const strip = document.getElementById("dfCfgStrip");
    if (!strip) return;
    strip.outerHTML = _renderConfigStrip();
    _wireEvents();
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
  function _refreshRosterVisibility() {
    const expanded = _isExpanded();
    const roster = document.getElementById("dfRoster");
    const hint    = document.getElementById("dfCollapsedHint");
    if (roster) { roster.style.display = expanded ? "" : "none"; roster.classList.toggle("is-collapsed", !expanded); }
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
    _flights.forEach(f => { overlay.querySelectorAll(`[data-assign-flight="${f.id}"]`).forEach(b => { b.textContent = f.name; }); });
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

  // ── Save — collapsed into one call per scope ────────────────────────
  function _modeToSend() { return _showModeToggle() ? _mode : _activation; }

  async function _applyChanges() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Define Flights", message: "Saving flights — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINTS[_target], {
        payload: {
          flights: _flights.map(f => ({ id: f.id, name: f.name, sort: f.sort })),
          mode: _modeToSend(),
          assignments: _players.map(p => ({ ghin: p.ghin, flight: p.flight })),
        },
      });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save flights.", "danger"); return; }

      _flights = normalizeFlightConfig(res.payload?.flightConfig || { flights: _flights });
      if (_showModeToggle()) { _mode = res.payload?.mode || _mode; } else { _activation = res.payload?.mode || _activation; }

      MA.ui.notify("Flights saved.", "success");

      const reconcileSummary = res.payload?.reconcile || null;
      const reconciled       = res.payload?.reconciled || [];
      const hasIssue = (reconcileSummary && reconcileSummary.roundsAffected > 0) || reconciled.length > 0;

      MA.ui?.hideBusy?.();
      _busy = false;

      if (hasIssue) {
        if (reconciled.length) _showReconciledNotice();
      } else {
        _dismiss(true);
      }
    } catch (e) {
      console.error("[MA.defineFlights]", e);
      _showModalNotice("Error saving flights.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  function _showReconciledNotice() {
    MA.ui.confirm({
      title: "Pairings affected",
      message: "This change affected one or more existing pairings. Please revisit the Pairings page to review and fix them.",
      okOnly: true
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.defineFlights.open = async function (options) {
    _target = (options?.target === "event") ? "event" : "game";
    _onDone = options?.onDone || null;
    _busy = false;
    _lockedByEvent = false;

    MA.ui?.showBusy?.({ title: "Define Flights", message: "Loading..." });
    let raw;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINTS[_target], {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load context.");
      raw = res;
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();

    let game, roster, ggid;
    if (_target === "event") {
      game = raw.event || {};
      roster = raw.roster || [];
      ggid = raw.eid;
    } else {
      game = raw.payload?.game || {};
      roster = raw.payload?.roster || [];
      ggid = raw.payload?.ggid;
    }
    _ctx = { ggid, game };

    _flights = normalizeFlightConfig(game.dbGames_FlightConfig || game.dbEvents_FlightConfig || null);
    _players = roster.map(normalizePlayer);
    const defaultId = _flights[0]?.id || "F1";
    _players.forEach(p => { if (!p.flight) p.flight = defaultId; });

    _mode       = (game.dbEvents_FlightMode === "fixed") ? "fixed" : "none";
    _activation = (game.dbGames_FlightMode === "active") ? "active" : "disabled";
    _cfgOpen    = (_flights.length <= 1);
    _viewMode   = "player";

    _lockedByEvent = (_target === "game") && (game.dbEvents_FlightMode === "fixed");

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);
    _wireEvents();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.defineFlights.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _lockScroll(false);
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

  window.MA = MA;

})();
