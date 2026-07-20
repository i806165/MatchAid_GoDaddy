/* /assets/modules/module_defineTeams.js
 *
 * MA.manageTeams — Manage Teams module.
 * Shared by Game Players and Event Roster.
 *
 * Zero injected CSS, zero page-specific CSS dependency. All classes
 * come from ma_shared.css — modal, buttons, list rows, pills, controls.
 * Previously depended on game_players.css for gpRow--teams, gpAvatar,
 * gpSub, gpTeamBadge, gpEmpty — those are now unified into ma_shared.css
 * equivalents (see mapping below) so the module works identically on
 * any host page without a per-page CSS dependency.
 *
 * Class mapping (old page-scoped → current shared):
 *   .gpRow--teams        → .maListRow--teams
 *   .gpAvatar             → .maListRow__avatar
 *   .gpSub                → .maListRow__subline
 *   .gpSub--indented       → .maListRow__subline--indented
 *   .gpTeamBadge/--red/--blue → .maTeamBadge/--red/--blue (+ --none, + .is-active)
 *   .gpEmpty               → .maEmptyState
 *
 * Public API:
 *   MA.manageTeams.open(options)
 *   MA.manageTeams.close()
 *
 * Options:
 *   {
 *     players         : array        — raw player rows from state.players (db field names)
 *     teamConfig      : object|null  — current window.__MA_INIT__.teamConfig value
 *     mode            : string       — current dbEvents_TeamMode ("fixed"|"none").
 *                                       Only meaningful when showModeToggle is true —
 *                                       the round-level (game_players) usage of this
 *                                       module ignores it (see activation below instead).
 *     showModeToggle  : bool         — true only for the Event Roster usage. Renders
 *                                       the toggle (labeled "Activate" in the UI, since
 *                                       Activation and Propagation are the same single
 *                                       decision at the event level — see
 *                                       round_dimension_activation_spec), bundled into
 *                                       the same Apply as config/assignments. Flipping it
 *                                       also expands/collapses the player-row content
 *                                       below it. Omitted (falsy) for the round-level usage.
 *
 *     activation          : string   — ROUND-LEVEL ONLY. Current dbGames_TeamMode
 *                                       ("active"|"disabled") — this round's OWN
 *                                       Activation flag, wholly independent of the
 *                                       event's dbEvents_TeamMode/showModeToggle above.
 *                                       Only meaningful when showActivationToggle is true.
 *     showActivationToggle : bool    — true only for the round-level (game_players)
 *                                       usage, and only when the caller has already
 *                                       confirmed the event isn't authoritative for Team
 *                                       (see MA.isDimensionActive() / the existing
 *                                       dbEvents_TeamMode-fixed lock check in
 *                                       game_players.js's onManageTeams() — this modal
 *                                       is never opened at all when the event is fixed,
 *                                       so if it's open, showActivationToggle is safe to
 *                                       be true unconditionally for round usage).
 *                                       Renders an Activate/Deactivate toggle that
 *                                       expands/collapses the player-row content and is
 *                                       bundled into the same Apply/Create as config/
 *                                       assignments. Deactivating never clears
 *                                       dbGames_TeamConfig or any player's TeamKey —
 *                                       display-only, per round_dimension_activation_spec.
 *
 *     apiBase         : string       — e.g. "/api/game_players" or "/api/event_roster"
 *     onApply         : function({ players, teamConfig, mode, activation })
 *   }
 *
 * No "Reset teams" — removed. It was the only action in this module that
 * wrote to the server outside of Apply (immediate, unconfirmable-once-fired
 * delete of both team config and every assignment), breaking the
 * stage-then-Apply contract every other action here follows. Clear all
 * already covers the "unassign everyone" need, fully staged behind Apply.
 * An unassigned dbPlayers_TeamKey is itself the correct "no team" state for
 * downstream processing — there's no need to also delete dbGames_TeamConfig
 * to represent that, so once a game's teams are created they stay
 * configured (a floor state), same philosophy as Define Flights never
 * having a true zero-flights state.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.manageTeams = MA.manageTeams || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const OVERLAY_ID = "maManageTeamsOverlay";

  const TEAM_SLOTS = [
    { id: "T1", name: "Red",  color: "red",  sort: 1 },
    { id: "T2", name: "Blue", color: "blue", sort: 2 },
  ];

  // ── Module state ─────────────────────────────────────────────────────────────
  let _opts       = {};
  let _teamConfig = null;
  let _players    = [];
  let _mode       = "none";     // "fixed" | "none" — event's dbEvents_TeamMode, see showModeToggle
  let _activation = "disabled"; // "active" | "disabled" — round's OWN dbGames_TeamMode, see showActivationToggle
  let _busy       = false;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safe(v) { return String(v ?? "").trim(); }

  function deepClone(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : null; }

  function normalizePlayer(r) {
    return {
      ghin:  safe(r.dbPlayers_PlayerGHIN || r.ghin  || ""),
      name:  safe(r.dbPlayers_Name       || r.name  || ""),
      lname: safe(r.dbPlayers_LName      || r.lname || ""),
      hi:    safe(r.dbPlayers_HI         || r.hi    || ""),
      ch:    safe(r.dbPlayers_CH         || r.ch    || ""),
      ph:    safe(r.dbPlayers_PH         || r.ph    || ""),
      team:  safe(r.dbPlayers_TeamKey    || r.team  || ""),
    };
  }

  function initials(p) {
    const f = safe(p.name).split(" ")[0] || "";
    const l = safe(p.lname) || "";
    return ((f[0] || "") + (l[0] || "")).toUpperCase() || "?";
  }

  function badgeLabel(teamName) {
    return safe(teamName).substring(0, 3).toUpperCase() || "—";
  }

  function getTeam(id) {
    return (_teamConfig?.teams || []).find(t => t.id === id) || null;
  }

  function getTeamName(id) { return getTeam(id)?.name || id; }

  function countByTeam(id) { return _players.filter(p => p.team === id).length; }

  function unassignedCount() { return _players.filter(p => !p.team).length; }

  function hasTeams() {
    return Array.isArray(_teamConfig?.teams) && _teamConfig.teams.length === 2;
  }

  // Unassigned first, then T1, then T2; alpha within each group
  function sortedPlayers() {
    return [..._players].sort((a, b) => {
      const ord = { "": 0, "T1": 1, "T2": 2 };
      const ao = ord[a.team] ?? 3;
      const bo = ord[b.team] ?? 3;
      if (ao !== bo) return ao - bo;
      return safe(a.lname + a.name).localeCompare(safe(b.lname + b.name));
    });
  }

  function apiPath(endpoint) {
    return safe(_opts.apiBase || "/api/game_players").replace(/\/$/, "") + "/" + endpoint;
  }

  // Whether the player-row roster should currently be shown expanded.
  // Event usage: driven by _mode ("fixed" = Activated). Round usage:
  // driven by _activation ("active" = Activated). Exactly one of
  // showModeToggle/showActivationToggle is ever true for a given usage
  // of this module — if neither is set (shouldn't happen given current
  // callers), default to expanded so nothing regresses silently.
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
      el.addEventListener("click", e => { if (e.target === el && !_busy) MA.manageTeams.close(); });
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

  MA.manageTeams.open = function (options) {
    _opts       = options || {};
    _teamConfig = deepClone(_opts.teamConfig) || null;
    _players    = (_opts.players || []).map(normalizePlayer);
    _mode       = (_opts.mode === "fixed") ? "fixed" : "none";
    _activation = (_opts.activation === "active") ? "active" : "disabled";
    _busy       = false;

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _setScrollLock(true);
    _wireEvents();
  };

  MA.manageTeams.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _setScrollLock(false);
    _busy = false;
  };

  const NOTICE_ID = "mtNoticeSlot";

  // ── Render ───────────────────────────────────────────────────────────────────

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Manage Teams">
        ${_renderHeader()}
        <div id="${NOTICE_ID}"></div>
        ${hasTeams() ? _renderStateB() : _renderStateA()}
      </section>`;
  }

  // Persistent, hidden-by-default in-modal notice. MA.setStatus() writes
  // to a page-chrome element that sits BEHIND this modal's full-screen
  // overlay — the user can never see it while the modal is open. Every
  // save-failure/success/validation message inside this modal must go
  // through _showModalNotice() instead, never MA.setStatus() directly.
  // Delegates to MA.ui.showModalNotice/hideModalNotice (ma_shared.js) —
  // same component module_defineFlights.js and
  // module_defineHandicapSettings.js now use too.
  //
  // Every caller in this module should use this — never MA.setStatus()
  // directly — for anything the user needs to see while the modal is
  // open. Falls back to MA.setStatus() only defensively, if somehow
  // called with no modal on screen (shouldn't happen in practice).
  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

  function _hideModalNotice() {
    const slot = document.getElementById(NOTICE_ID);
    if (slot) MA.ui.hideModalNotice(slot);
  }

  function _renderHeader() {
    const n = _players.length;
    const u = unassignedCount();
    const subtitle = !hasTeams()
      ? `${n} Player${n !== 1 ? "s" : ""}`
      : u > 0 ? `${n} Players — ${u} unassigned` : `${n} Players — All assigned`;
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Manage Teams</div>
          <div class="maModal__subtitle" id="mtSubtitle">${esc(subtitle)}</div>
        </div>
        <button type="button" class="iconBtn btnPrimary" id="mtBtnClose" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>`;
  }

  // State A — no teams configured yet
  function _renderStateA() {
    const toggle = _opts.showModeToggle ? _renderApplyToggle() : _renderActivationToggle();
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        <div class="maListRow__subline" style="margin-bottom:10px;">Get started by naming your teams.</div>
        ${toggle}
        <div style="${toggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
          ${_renderTeamNameInput("T1", "Red")}
          ${_renderTeamNameInput("T2", "Blue")}
        </div>
      </div>
      <div class="maModal__body"></div>
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Cancel</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="mtBtnCreate" disabled>Create Teams</button>
      </footer>`;
  }

  // State B — full assignment view
  function _renderStateB() {
    const u = unassignedCount();
    const toggle = _opts.showModeToggle ? _renderApplyToggle() : _renderActivationToggle();
    const expanded = _isExpanded();
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        ${toggle}
        <div style="${toggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
          ${_renderTeamNameInput("T1", getTeamName("T1"))}
          ${_renderTeamNameInput("T2", getTeamName("T2"))}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button type="button" class="btn btnSecondary" id="mtBtnSplitHC"
                  style="flex:1; font-size:12px; gap:5px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
              <line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
            Auto-split by handicap
          </button>
          <button type="button" class="btn btnSecondary" id="mtBtnRandom"
                  style="flex:1; font-size:12px; gap:5px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            Auto-split randomly
          </button>
        </div>
        <button type="button" class="btn" id="mtBtnClearAll"
                style="width:100%; font-size:12px; margin-top:8px;">
          Clear all
        </button>
      </div>
      <div class="maModal__body${expanded ? "" : " is-collapsed"}" id="mtRoster"
           style="padding:0; ${expanded ? "" : "display:none;"}">
        <div class="maListRows">${_renderRosterRows()}</div>
      </div>
      <div class="maListRow__subline" id="mtCollapsedHint"
           style="padding:10px 16px; ${expanded ? "display:none;" : ""}">
        Team assignments are hidden while deactivated. Activate to view and edit them.
      </div>
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Cancel</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="mtBtnApply">Apply</button>
      </footer>`;
  }

  // Event-level "Activate" toggle — Event Roster usage only
  // (showModeToggle:true). At the event level, Activation and Propagation
  // are the same single decision: nothing in this codebase distinguishes
  // "active but not cascading" from "off" (see
  // syncKPIConfigForModeChange(), applyEventDataToGame(),
  // service_buildEventSummary.php — every consumer of dbEvents_TeamMode
  // already treats anything other than "fixed" as off). So this toggle
  // still writes the existing dbEvents_TeamMode column exactly as before
  // ("fixed"/"none") — no new event-level column — it's relabeled
  // "Activate" in the UI only, and flipping it now ALSO expands/collapses
  // the player-row roster below, same visual behavior as the round-level
  // Activation toggle (see _renderActivationToggle()), even though the
  // two write to different columns for different reasons.
  //
  // Bundled into the same Apply/Create as config/assignments — flipping
  // it alone does nothing until Apply is clicked. Defaults off; when off,
  // every linked round keeps whatever team setup it already has.
  //
  // Uses is-active-accent (brandColor3 blue) instead of the standard tan
  // is-active, since this is a binary decision with cascading
  // consequences. Mirrors module_defineFlights.js's identical control.
  function _renderApplyToggle() {
    if (!_opts.showModeToggle) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="mtModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate teams for this event">
            <button type="button" class="maSegBtn${yesActive ? " is-active-accent" : ""}"
                    data-mode="fixed" aria-pressed="${yesActive}">Yes</button>
            <button type="button" class="maSegBtn${!yesActive ? " is-active-accent" : ""}"
                    data-mode="none" aria-pressed="${!yesActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="mtModeHint">${esc(_applyHintText())}</div>
      </div>`;
  }

  function _applyHintText() {
    return (_mode === "fixed")
      ? "Teams are active for this event and will apply to every round."
      : "Teams are not active for this event. Each round can set its own.";
  }

  // Round-level "Activate"/"Deactivate" toggle — game_players usage only
  // (showActivationToggle:true). Writes this round's OWN dbGames_TeamMode
  // column — wholly independent of the event's dbEvents_TeamMode above.
  // Only ever rendered when the caller has already confirmed the event
  // isn't authoritative for Team (this modal doesn't open at all
  // otherwise — see game_players.js's onManageTeams() lock check), so no
  // additional guard is needed here.
  //
  // Deactivating never clears dbGames_TeamConfig or any player's
  // TeamKey — it only collapses the player-row roster below. Activating
  // reveals whatever was already there, pre-populated, not a blank slate.
  function _renderActivationToggle() {
    if (!_opts.showActivationToggle) return "";
    const isActive = (_activation === "active");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="mtActivationToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate teams for this round">
            <button type="button" class="maSegBtn${isActive ? " is-active-accent" : ""}"
                    data-activation="active" aria-pressed="${isActive}">Yes</button>
            <button type="button" class="maSegBtn${!isActive ? " is-active-accent" : ""}"
                    data-activation="disabled" aria-pressed="${!isActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="mtActivationHint">${esc(_activationHintText())}</div>
      </div>`;
  }

  function _activationHintText() {
    return (_activation === "active")
      ? "Teams are active for this round."
      : "Teams are not active for this round.";
  }

  function _renderTeamNameInput(slotId, currentName) {
    const slot  = TEAM_SLOTS.find(s => s.id === slotId);
    const color = slot?.color || "red";
    const count = countByTeam(slotId);
    const countHtml = hasTeams()
      ? `<span class="maListRow__subline" data-team-count="${esc(slotId)}" aria-label="${count} player${count !== 1 ? "s" : ""}">${count}</span>`
      : "";
    return `
      <div class="maConfigRow">
        <span class="maSwatch maSwatch--${esc(color)}" aria-hidden="true"></span>
        <input type="text"
               class="maTextInput"
               data-slot="${esc(slotId)}"
               id="mtTeamName${esc(slotId)}"
               value="${esc(currentName)}"
               maxlength="32"
               style="flex:1; min-width:80px; height:34px; font-size:13px !important; padding:0 10px;"
               aria-label="${esc(slotId === "T1" ? "Team 1 name" : "Team 2 name")}">
        ${countHtml}
      </div>`;
  }

  function _renderRosterRows() {
    const players = sortedPlayers();
    if (!players.length) return `<div class="maEmptyState">No players in this game.</div>`;
    const t1Name = getTeamName("T1");
    const t2Name = getTeamName("T2");
    return players.map(p => _renderPlayerRow(p, t1Name, t2Name)).join("");
  }

  function _renderPlayerRow(p, t1Name, t2Name) {
    const ini  = esc(initials(p));
    const name = esc(p.lname ? `${p.lname}, ${p.name.split(" ")[0]}` : p.name);
    const hi   = p.hi ? `HI ${esc(p.hi)}` : "";
    const t    = p.team;

    return `
      <div class="maListRow maListRow--teams" data-ghin="${esc(p.ghin)}">
        <div class="maListRow__avatar" aria-hidden="true">${ini}</div>
        <div class="maListRow__col">
          ${name}
          ${hi ? `<div class="maListRow__subline">${esc(hi)}</div>` : ""}
        </div>
        <div style="display:flex; gap:4px;"
             role="group" aria-label="Team assignment for ${name}">
          <button type="button"
                  class="maTeamBadge maTeamBadge--red ${t === "T1" ? "is-active" : ""}"
                  data-assign="T1" data-ghin="${esc(p.ghin)}"
                  aria-pressed="${t === "T1"}"
                  title="${esc(t1Name)}">${esc(badgeLabel(t1Name))}</button>
          <button type="button"
                  class="maTeamBadge maTeamBadge--blue ${t === "T2" ? "is-active" : ""}"
                  data-assign="T2" data-ghin="${esc(p.ghin)}"
                  aria-pressed="${t === "T2"}"
                  title="${esc(t2Name)}">${esc(badgeLabel(t2Name))}</button>
          <button type="button"
                  class="maTeamBadge maTeamBadge--none ${!t ? "is-active" : ""}"
                  data-assign="" data-ghin="${esc(p.ghin)}"
                  aria-pressed="${!t}"
                  title="Unassigned">—</button>
        </div>
      </div>`;
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#mtBtnClose")?.addEventListener("click", () => { if (!_busy) MA.manageTeams.close(); });
    overlay.querySelector("#mtBtnCancel")?.addEventListener("click", () => { if (!_busy) MA.manageTeams.close(); });

    overlay.querySelector("#mtModeToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-mode]");
      if (!seg) return;
      _mode = seg.dataset.mode;
      _refreshModeToggle();
      _refreshRosterVisibility();
    });

    overlay.querySelector("#mtActivationToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-activation]");
      if (!seg) return;
      _activation = seg.dataset.activation;
      _refreshActivationToggle();
      _refreshRosterVisibility();
    });

    if (!hasTeams()) {
      _wireStateA(overlay);
    } else {
      _wireStateB(overlay);
    }
  }

  function _refreshModeToggle() {
    const wrap = document.getElementById("mtModeToggle");
    if (!wrap) return;
    wrap.querySelectorAll("[data-mode]").forEach(seg => {
      const on = (seg.dataset.mode === _mode);
      seg.classList.toggle("is-active-accent", on);
      seg.setAttribute("aria-pressed", String(on));
    });
    const hint = document.getElementById("mtModeHint");
    if (hint) hint.textContent = _applyHintText();
  }

  function _refreshActivationToggle() {
    const wrap = document.getElementById("mtActivationToggle");
    if (!wrap) return;
    wrap.querySelectorAll("[data-activation]").forEach(seg => {
      const on = (seg.dataset.activation === _activation);
      seg.classList.toggle("is-active-accent", on);
      seg.setAttribute("aria-pressed", String(on));
    });
    const hint = document.getElementById("mtActivationHint");
    if (hint) hint.textContent = _activationHintText();
  }

  // Shared by both toggles — expand/collapse is purely a display concern
  // (player rows only); no data is read, written, or cleared here.
  function _refreshRosterVisibility() {
    const expanded = _isExpanded();
    const roster = document.getElementById("mtRoster");
    const hint    = document.getElementById("mtCollapsedHint");
    if (roster) {
      roster.style.display = expanded ? "" : "none";
      roster.classList.toggle("is-collapsed", !expanded);
    }
    if (hint) hint.style.display = expanded ? "none" : "";
  }

  function _wireStateA(overlay) {
    const inp1      = overlay.querySelector("#mtTeamNameT1");
    const inp2      = overlay.querySelector("#mtTeamNameT2");
    const btnCreate = overlay.querySelector("#mtBtnCreate");

    const validate = () => {
      if (btnCreate) btnCreate.disabled = !(safe(inp1?.value) && safe(inp2?.value));
    };
    inp1?.addEventListener("input", validate);
    inp2?.addEventListener("input", validate);
    validate(); // run immediately — inputs already have default values on open

    btnCreate?.addEventListener("click", async () => {
      const n1 = safe(inp1?.value);
      const n2 = safe(inp2?.value);
      if (!n1 || !n2) return;
      await _saveTeamConfig([
        { id: "T1", name: n1, color: "red",  sort: 1 },
        { id: "T2", name: n2, color: "blue", sort: 2 },
      ]);
    });
  }

  function _wireStateB(overlay) {
    overlay.querySelectorAll(".maTextInput[data-slot]").forEach(inp => {
      inp.addEventListener("input", () => {
        const team = getTeam(inp.dataset.slot);
        if (team) {
          team.name = safe(inp.value);
          _refreshBadgeLabels();
          _refreshTeamCounts();
          _refreshSubtitle();
        }
      });
    });

    overlay.querySelector("#mtRoster")?.addEventListener("click", e => {
      const badge = e.target.closest("[data-assign][data-ghin]");
      if (!badge) return;
      const player = _players.find(p => p.ghin === badge.dataset.ghin);
      if (!player || player.team === badge.dataset.assign) return;
      player.team = badge.dataset.assign;
      _refreshPlayerRow(player.ghin);
      _refreshTeamCounts();
      _refreshSubtitle();
    });

    overlay.querySelector("#mtBtnSplitHC")?.addEventListener("click", () => {
      _autoSplitByHandicap(); _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle();
    });

    overlay.querySelector("#mtBtnRandom")?.addEventListener("click", () => {
      _autoSplitRandom(); _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle();
    });

    overlay.querySelector("#mtBtnClearAll")?.addEventListener("click", () => {
      _players.forEach(p => p.team = "");
      _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle();
    });

    overlay.querySelector("#mtBtnApply")?.addEventListener("click", _applyChanges);
  }

  // ── Partial re-renders ───────────────────────────────────────────────────────

  function _refreshPlayerRow(ghin) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const row    = overlay.querySelector(`.maListRow--teams[data-ghin="${CSS.escape(ghin)}"]`);
    const player = _players.find(p => p.ghin === ghin);
    if (!row || !player) return;
    row.outerHTML = _renderPlayerRow(player, getTeamName("T1"), getTeamName("T2"));
  }

  function _refreshRoster() {
    const el = document.querySelector("#mtRoster .maListRows");
    if (el) el.innerHTML = _renderRosterRows();
  }

  function _refreshBadgeLabels() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ["T1", "T2"].forEach(id => {
      const name = getTeamName(id);
      overlay.querySelectorAll(`[data-assign="${id}"]`).forEach(b => {
        b.textContent = badgeLabel(name);
        b.title = name;
      });
    });
  }

  function _refreshTeamCounts() {
    ["T1", "T2"].forEach(id => {
      const el = document.querySelector(`[data-team-count="${id}"]`);
      if (!el) return;
      const n = countByTeam(id);
      el.textContent = String(n);
      el.setAttribute("aria-label", `${n} player${n !== 1 ? "s" : ""}`);
    });
  }

  function _refreshSubtitle() {
    const u = unassignedCount();
    const n = _players.length;
    const subtitle = u > 0 ? `${n} Players — ${u} unassigned` : `${n} Players — All assigned`;
    const el = document.querySelector("#mtSubtitle");
    if (el) el.textContent = subtitle;
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  function _phValue(p) {
    const v = parseFloat(p.ph || p.ch || p.hi || "");
    return Number.isFinite(v) ? v : 999;
  }

  function _autoSplitByHandicap() {
    const sorted = [..._players].sort((a, b) => _phValue(a) - _phValue(b));
    sorted.forEach((p, i) => {
      const pl = _players.find(x => x.ghin === p.ghin);
      if (pl) pl.team = i % 2 === 0 ? "T1" : "T2";
    });
  }

  function _autoSplitRandom() {
    const shuffled = [..._players].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => {
      const pl = _players.find(x => x.ghin === p.ghin);
      if (pl) pl.team = i % 2 === 0 ? "T1" : "T2";
    });
  }

  // ── API calls ────────────────────────────────────────────────────────────────

  // The "mode" value sent to the save endpoint means something different
  // depending on which usage of this module is active — event usage
  // writes dbEvents_TeamMode ("fixed"/"none", cascade authority); round
  // usage writes dbGames_TeamMode ("active"/"disabled", this round's own
  // Activation flag). Each endpoint only ever expects its own vocabulary.
  function _modeToSend() {
    return _opts.showModeToggle ? _mode : _activation;
  }

  async function _saveTeamConfig(teams) {
    if (_busy) return;
    _busy = true; _showBusy("Saving team configuration — please wait...");
    try {
      const res = await MA.postJson(apiPath("saveTeamConfig.php"), { teams, mode: _modeToSend() });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save team configuration.", "danger"); return; }
      _teamConfig = res.payload?.teamConfig || { teams };
      if (_opts.showModeToggle) {
        _mode = res.payload?.mode || _mode;
      } else {
        _activation = res.payload?.mode || _activation;
      }
      const modal = _getModal();
      if (modal) { modal.innerHTML = _renderHeader() + _renderNoticeHtml() + _renderStateB(); _wireEvents(); }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      _showModalNotice("Error saving team configuration.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  async function _applyChanges() {
    if (_busy) return;

    // Teams-active requires full assignment: if Teams is ON for this
    // context (event-fixed or round-active — same _isExpanded() check
    // driving the roster's own expand/collapse), EVERY player must have
    // a team before saving. This is stricter than "all-or-none" — a
    // fully-unassigned roster is NOT a valid save while active, since
    // "Teams is on" means teams are genuinely in use, not merely
    // configured. If mode is "fixed," saving here also propagates to
    // every linked round — an unassigned player's blank TeamKey would
    // propagate too, silently clearing whatever team that player already
    // had at the round level; blocking here means Propagation never has
    // a blank value to push out while Teams is active.
    //
    // When Teams is OFF, no validation runs — the roster is hidden and
    // not in current use, so an incomplete assignment underneath isn't
    // this save's concern (Deactivating never clears data; whatever's
    // there stays exactly as it was until reactivated).
    const unassignedCount = _players.filter(p => !p.team).length;
    if (_isExpanded() && unassignedCount > 0) {
      _showModalNotice(
        `All players must be assigned to a team while Teams is active — ${unassignedCount} player${unassignedCount === 1 ? "" : "s"} still need${unassignedCount === 1 ? "s" : ""} a team.`,
        "warn"
      );
      return;
    }

    _busy = true; _showBusy("Saving teams — please wait...");
    try {
      const configRes = await MA.postJson(apiPath("saveTeamConfig.php"), { teams: _teamConfig?.teams || [], mode: _modeToSend() });
      if (!configRes?.ok) { _showModalNotice(configRes?.message || "Unable to save team names.", "danger"); return; }
      _teamConfig = configRes.payload?.teamConfig || _teamConfig;
      if (_opts.showModeToggle) {
        _mode = configRes.payload?.mode || _mode;
      } else {
        _activation = configRes.payload?.mode || _activation;
      }

      const assignments = _players.map(p => ({ ghin: p.ghin, team: p.team }));
      const assignRes = await MA.postJson(apiPath("saveTeamAssignments.php"), { assignments });
      if (!assignRes?.ok) { _showModalNotice(assignRes?.message || "Unable to save assignments.", "danger"); return; }

      // NOTE: this does NOT always run right before the modal closes —
      // in the hasIssue+reconciled path below, the modal stays open for
      // _showReconciledNotice() instead of closing. A direct MA.setStatus()
      // call here wouldn't just be "secondary" in that path, it would be
      // invisible (posted to the hidden chrome line behind the still-open
      // modal). MA.ui.notify handles both cases correctly.
      MA.ui.notify("Teams saved.", "success");

      const reconcileSummary = assignRes.payload?.reconcile || null;   // event-shaped
      const reconciled       = assignRes.payload?.reconciled || [];    // round-shaped
      const hasIssue = (reconcileSummary && reconcileSummary.roundsAffected > 0) || reconciled.length > 0;

      if (typeof _opts.onApply === "function") {
        // reconcile (object: {roundsTouched, roundsAffected, affectedGgids})
        // is only present when this module is used from the Event Roster
        // page — saveTeamAssignments.php there cascades to every linked
        // round and returns this shape. The round-level game_players
        // endpoint returns "reconciled" (an array) instead, handled below
        // via this module's own notice — the two shapes intentionally
        // don't collide, so this module doesn't have to know which
        // context it's running in. When "reconcile" IS present, forwarding
        // it lets the caller show its own context-appropriate message
        // ("N of M rounds") rather than this module guessing at one.
        _opts.onApply({
          players: assignRes.payload?.players || [],
          teamConfig: _teamConfig,
          mode: _mode,
          activation: _activation,
          reconcile: reconcileSummary,
        });
      }

      // The save already fully committed — including any reconciliation
      // resets — so there's nothing left to "revert" by staying open.
      // What staying open DOES offer: the user can immediately make a
      // corrective change (e.g. flip the team back) without reopening
      // this module from scratch. Close normally on a clean result.
      if (hasIssue) {
        // Round-shaped notice is this module's own responsibility. The
        // event-shaped notice was already shown by the caller via onApply
        // above (event_roster.js's notifyReconcile) — nothing more to do
        // here for that case, just don't close.
        if (reconciled.length) _showReconciledNotice();
      } else {
        MA.manageTeams.close();
      }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      _showModalNotice("Error saving teams.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  // Delegates to MA.ui — stacks on top of this module's own open modal the
  // same way the old mtBusyOverlay did.
  function _showBusy(message) {
    MA.ui.showBusy({ title: "Manage Teams", message: message || "Processing — please wait..." });
  }

  function _hideBusy() {
    MA.ui.hideBusy();
  }

  function _showReconciledNotice() {
    MA.ui.confirm({
      title: "Pairings affected",
      message: "This change affected one or more existing pairings. Please revisit the Pairings page to review and fix them.",
      okOnly: true
    });
  }

  window.MA = MA;

})();