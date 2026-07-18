/* /assets/modules/module_defineTeamsGameEvent.js
 *
 * MA.manageTeams — Manage Teams module. Self-hydrating, dual-target
 * (game/event) retrofit of module_defineTeams.js.
 *
 * ── What's preserved verbatim from module_defineTeams.js ────────────────
 * _renderHeader/_renderTeamNameInput/_renderRosterRows/_renderPlayerRow/
 * the two toggle renderers, every helper (badgeLabel/countByTeam/
 * sortedPlayers/etc.), every partial-refresh function, the
 * auto-split-by-handicap/random logic, the "Teams-active requires full
 * assignment" validation, the reconciliation notice, and the "no Reset
 * teams" design note — all unchanged. Same classes, same markup, same
 * business rules. ONE EXCEPTION — see below.
 *
 * ── REAL BEHAVIOR CHANGE — the two-step flow is gone ─────────────────────
 * module_defineTeams.js opened in one of two states: State A (no teams
 * saved yet — just two name inputs and a "Create Teams" button, no
 * roster shown at all) and State B (teams exist — full roster with
 * assignment badges). Per direct correction, that split is removed
 * entirely. The module now always opens in one view: default "Red"/
 * "Blue" names (or whatever's saved) and the full roster together,
 * matching exactly how module_defineFlightsGameEvent.js already worked
 * — Flights never had a two-step gate. Team names are editable inline at
 * any time; there's no separate "creation" step. The only thing that
 * still hides the roster is the existing activation toggle
 * (_isExpanded()) — an orthogonal, unchanged concern.
 *
 * ── What changed — plumbing, not rendering ──────────────────────────────
 * - Self-hydration: open({ target, onDone }) — no more players/teamConfig/
 *   mode/activation/apiBase/onApply from a caller. GGID or EID comes from
 *   session server-side, context fetched here.
 * - showModeToggle/showActivationToggle are no longer caller-supplied —
 *   derived directly from target ("event" -> mode toggle, "game" ->
 *   activation toggle). The module decides its own shape now instead of
 *   being told.
 * - REAL BEHAVIOR CHANGE, not just plumbing: the "is Team locked by the
 *   event" check used to be the CALLER's job (game_players.js's
 *   onManageTeams() checked dbEvents_TeamMode === "fixed" BEFORE ever
 *   calling .open()). Since this module now self-hydrates the full,
 *   merged game+event record, that check moved INSIDE the module
 *   (_ctx.game.dbEvents_TeamMode) — for target: "game" only. If locked,
 *   the module shows a locked message instead of opening the editor,
 *   matching the pattern used for GROSS PLAY in
 *   module_setHandicapsGameEvent.js. This is a relocation of an existing
 *   rule to a different owner, not a new rule — but it IS a change in who
 *   enforces it, flagged because "no UI changes" doesn't cover "no
 *   change in who's responsible for a gate check."
 * - Config+assignments collapsed into ONE save per scope (was two
 *   sequential calls to saveTeamConfig.php/saveTeamAssignments.php,
 *   sharing one filename across both scopes via apiBase directory only).
 *   Now: saveGameTeams.php / saveEventTeams.php, one call, one endpoint
 *   per scope, no shared name. This also closes a real gap in the old
 *   two-call flow: if config saved but assignments failed, the game was
 *   left in a partially-saved state. One transaction removes that.
 * - Response shape no longer needs the reconcile/reconciled dual-check —
 *   each split endpoint returns its own natural shape now (event always
 *   "reconcile", game always "reconciled"), since it's no longer one
 *   endpoint serving two contexts. The dual-check is left in defensively
 *   (reading whichever key is present) since it costs nothing and guards
 *   against either endpoint's shape drifting later.
 * - Exit-path contract: onDone(wasSaved) fires on every exit route, not
 *   just a bare onDone() only reachable via a successful Apply/Create.
 * - Roster hydration reads two different sources with two different GHIN
 *   field names — dbPlayers_PlayerGHIN (game, service_dbPlayers.php) vs
 *   dbEventPlayers_GHIN (event, service_dbEventPlayers.php — note: NOT
 *   dbEventPlayers_PlayerGHIN, a real naming inconsistency already in the
 *   schema, not introduced here). normalizePlayer() branches on target.
 * - UNCONFIRMED: db_EventPlayers wasn't confirmed to have CH/PH columns
 *   (only HI was seen in service_dbEventPlayers.php's field list). This
 *   doesn't break anything — _phValue()'s existing fallback chain
 *   (ph || ch || hi) already tolerates missing values — but Auto-split by
 *   handicap may silently fall back to HI-only sorting at the event
 *   level. Flagged, not fixed, since I can't confirm the schema either
 *   way from what I've been shown.
 *
 * Public API:
 *   MA.manageTeams.open({ target, onDone })   target: "game" | "event"
 *   MA.manageTeams.close()
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * saveGameTeams.php / saveEventTeams.php are new, built alongside this
 * module — see those files directly for their own open items.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.manageTeams = MA.manageTeams || {};

  const OVERLAY_ID = "maManageTeamsOverlay";
  const NOTICE_ID  = "mtNoticeSlot";

  const CONTEXT_ENDPOINTS = {
    game:  "/api/game_settings/initGameSettings.php",
    event: "/api/event_roster/initEventRoster.php",
  };
  const SAVE_ENDPOINTS = {
    game:  "/api/game_settings/saveGameTeams.php",
    event: "/api/event_roster/saveEventTeams.php",
  };

  const TEAM_SLOTS = [
    { id: "T1", name: "Red",  color: "red",  sort: 1 },
    { id: "T2", name: "Blue", color: "blue", sort: 2 },
  ];

  // ── Module state ─────────────────────────────────────────────────────
  let _target     = "game";
  let _ctx        = null;   // fresh-fetched context, shape depends on _target
  let _teamConfig = null;
  let _players    = [];
  let _mode       = "none";     // "fixed" | "none" — event's dbEvents_TeamMode
  let _activation = "disabled"; // "active" | "disabled" — round's own dbGames_TeamMode
  let _busy       = false;
  let _onDone     = null;
  let _onEsc      = null;
  let _lockDepth  = 0;
  let _lockedByEvent = false; // target: "game" only — see header note

  // ── Helpers — unchanged from module_defineTeams.js ──────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function safe(v) { return String(v ?? "").trim(); }
  function deepClone(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : null; }

  // Branches on _target — two different tables, two different GHIN field
  // names. See header note.
  function normalizePlayer(r) {
    const ghin = _target === "event"
      ? (r.dbEventPlayers_GHIN || r.ghin || "")
      : (r.dbPlayers_PlayerGHIN || r.ghin || "");
    const name  = _target === "event" ? (r.dbEventPlayers_Name  || r.name  || "") : (r.dbPlayers_Name  || r.name  || "");
    const lname = _target === "event" ? (r.dbEventPlayers_LName || r.lname || "") : (r.dbPlayers_LName || r.lname || "");
    const hi    = _target === "event" ? (r.dbEventPlayers_HI    || r.hi    || "") : (r.dbPlayers_HI    || r.hi    || "");
    const ch    = _target === "event" ? (r.dbEventPlayers_CH    || r.ch    || "") : (r.dbPlayers_CH    || r.ch    || "");
    const ph    = _target === "event" ? (r.dbEventPlayers_PH    || r.ph    || "") : (r.dbPlayers_PH    || r.ph    || "");
    const team  = _target === "event" ? (r.dbEventPlayers_TeamKey || r.team || "") : (r.dbPlayers_TeamKey || r.team || "");
    return { ghin: safe(ghin), name: safe(name), lname: safe(lname), hi: safe(hi), ch: safe(ch), ph: safe(ph), team: safe(team) };
  }

  function initials(p) {
    const f = safe(p.name).split(" ")[0] || "";
    const l = safe(p.lname) || "";
    return ((f[0] || "") + (l[0] || "")).toUpperCase() || "?";
  }
  function badgeLabel(teamName) { return safe(teamName).substring(0, 3).toUpperCase() || "—"; }
  function getTeam(id) { return (_teamConfig?.teams || []).find(t => t.id === id) || null; }
  function getTeamName(id) { return getTeam(id)?.name || id; }
  function countByTeam(id) { return _players.filter(p => p.team === id).length; }
  function unassignedCount() { return _players.filter(p => !p.team).length; }
  // All-or-none: valid states are everyone assigned or no one assigned.
  // Anything in between is invalid regardless of the activation toggle.
  function _isPartiallyAssigned() {
    const u = unassignedCount();
    return u > 0 && u < _players.length;
  }

  function sortedPlayers() {
    return [..._players].sort((a, b) => {
      const ord = { "": 0, "T1": 1, "T2": 2 };
      const ao = ord[a.team] ?? 3;
      const bo = ord[b.team] ?? 3;
      if (ao !== bo) return ao - bo;
      return safe(a.lname + a.name).localeCompare(safe(b.lname + b.name));
    });
  }

  // showModeToggle/showActivationToggle derived from target — no longer
  // caller-supplied.
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
    MA.manageTeams.close();
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

  // ── Render — header/locked-state new, everything else unchanged ────
  function _renderModal() {
    if (_lockedByEvent) return _renderLockedModal();
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Manage Teams">
        ${_renderHeader()}
        <div id="${NOTICE_ID}"></div>
        ${_renderBody()}
      </section>`;
  }

  // Not part of the original module — the event-lock check itself is
  // relocated (see header note), and it needs *some* rendering when
  // locked, since the module never used to be openable in this state at
  // all (the caller just never called .open()). Matches the GROSS PLAY
  // locked-state shell in module_setHandicapsGameEvent.js: header +
  // message + Close, not a blank modal.
  function _renderLockedModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Manage Teams">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Manage Teams</div>
          </div>
          <button type="button" class="iconBtn btnPrimary" id="mtBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>
        <div class="maModal__body" style="padding:14px;">
          <div class="maHintText">Teams are set for this event and apply to every round. Manage Teams from the Event Roster page.</div>
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Close</button>
        </footer>
      </section>`;
  }

  function _renderHeader() {
    const n = _players.length;
    const u = unassignedCount();
    const subtitle = u > 0 ? `${n} Players — ${u} unassigned` : `${n} Players — All assigned`;
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

  function _renderBody() {
    const toggle = _showModeToggle() ? _renderApplyToggle() : _renderActivationToggle();
    const expanded = _isExpanded();
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        ${toggle}
        <div style="${toggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
          ${_renderTeamNameInput("T1", getTeamName("T1"))}
          ${_renderTeamNameInput("T2", getTeamName("T2"))}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button type="button" class="btn btnSecondary" id="mtBtnSplitHC" style="flex:1; font-size:12px; gap:5px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
              <line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
            Auto-split by handicap
          </button>
          <button type="button" class="btn btnSecondary" id="mtBtnRandom" style="flex:1; font-size:12px; gap:5px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            Auto-split randomly
          </button>
        </div>
        <button type="button" class="btn" id="mtBtnClearAll" style="width:100%; font-size:12px; margin-top:8px;">Clear all</button>
      </div>
      <div class="maModal__body${expanded ? "" : " is-collapsed"}" id="mtRoster" style="padding:0; ${expanded ? "" : "display:none;"}">
        <div class="maListRows">${_renderRosterRows()}</div>
      </div>
      <div class="maListRow__subline" id="mtCollapsedHint" style="padding:10px 16px; ${expanded ? "display:none;" : ""}">
        Team assignments are hidden while deactivated. Activate to view and edit them.
      </div>
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Cancel</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="mtBtnApply" ${_isPartiallyAssigned() ? "disabled" : ""}>Apply</button>
      </footer>`;
  }

  function _renderApplyToggle() {
    if (!_showModeToggle()) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="mtModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate teams for this event">
            <button type="button" class="maSegBtn${yesActive ? " is-active-accent" : ""}" data-mode="fixed" aria-pressed="${yesActive}">Yes</button>
            <button type="button" class="maSegBtn${!yesActive ? " is-active-accent" : ""}" data-mode="none" aria-pressed="${!yesActive}">No</button>
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

  function _renderActivationToggle() {
    if (!_showActivationToggle()) return "";
    const isActive = (_activation === "active");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Activate</span>
          <div class="maSeg" id="mtActivationToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Activate teams for this round">
            <button type="button" class="maSegBtn${isActive ? " is-active-accent" : ""}" data-activation="active" aria-pressed="${isActive}">Yes</button>
            <button type="button" class="maSegBtn${!isActive ? " is-active-accent" : ""}" data-activation="disabled" aria-pressed="${!isActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="mtActivationHint">${esc(_activationHintText())}</div>
      </div>`;
  }
  function _activationHintText() {
    return (_activation === "active") ? "Teams are active for this round." : "Teams are not active for this round.";
  }

  function _renderTeamNameInput(slotId, currentName) {
    const slot  = TEAM_SLOTS.find(s => s.id === slotId);
    const color = slot?.color || "red";
    const count = countByTeam(slotId);
    const countHtml = `<span class="maListRow__subline" data-team-count="${esc(slotId)}" aria-label="${count} player${count !== 1 ? "s" : ""}">${count}</span>`;
    return `
      <div class="maConfigRow">
        <span class="maSwatch maSwatch--${esc(color)}" aria-hidden="true"></span>
        <input type="text" class="maTextInput" data-slot="${esc(slotId)}" id="mtTeamName${esc(slotId)}"
               value="${esc(currentName)}" maxlength="32"
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
        <div style="display:flex; gap:4px;" role="group" aria-label="Team assignment for ${name}">
          <button type="button" class="maTeamBadge maTeamBadge--red ${t === "T1" ? "is-active" : ""}"
                  data-assign="T1" data-ghin="${esc(p.ghin)}" aria-pressed="${t === "T1"}" title="${esc(t1Name)}">${esc(badgeLabel(t1Name))}</button>
          <button type="button" class="maTeamBadge maTeamBadge--blue ${t === "T2" ? "is-active" : ""}"
                  data-assign="T2" data-ghin="${esc(p.ghin)}" aria-pressed="${t === "T2"}" title="${esc(t2Name)}">${esc(badgeLabel(t2Name))}</button>
          <button type="button" class="maTeamBadge maTeamBadge--none ${!t ? "is-active" : ""}"
                  data-assign="" data-ghin="${esc(p.ghin)}" aria-pressed="${!t}" title="Unassigned">—</button>
        </div>
      </div>`;
  }

  // ── Event wiring — unchanged from module_defineTeams.js ─────────────
  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    if (_lockedByEvent) {
      overlay.querySelector("#mtBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
      overlay.querySelector("#mtBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
      return;
    }

    overlay.querySelector("#mtBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#mtBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });

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

    _wireBody(overlay);
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

  function _refreshApplyButtonState() {
    const btn = document.getElementById("mtBtnApply");
    if (btn) btn.disabled = _isPartiallyAssigned();
  }

  function _wireBody(overlay) {
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
      _refreshApplyButtonState();
    });

    overlay.querySelector("#mtBtnSplitHC")?.addEventListener("click", () => {
      _autoSplitByHandicap(); _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle(); _refreshApplyButtonState();
    });
    overlay.querySelector("#mtBtnRandom")?.addEventListener("click", () => {
      _autoSplitRandom(); _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle(); _refreshApplyButtonState();
    });
    overlay.querySelector("#mtBtnClearAll")?.addEventListener("click", () => {
      _players.forEach(p => p.team = "");
      _refreshRoster(); _refreshTeamCounts(); _refreshSubtitle(); _refreshApplyButtonState();
    });

    overlay.querySelector("#mtBtnApply")?.addEventListener("click", _applyChanges);
  }

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
      overlay.querySelectorAll(`[data-assign="${id}"]`).forEach(b => { b.textContent = badgeLabel(name); b.title = name; });
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

  function _phValue(p) {
    const v = parseFloat(p.ph || p.ch || p.hi || "");
    return Number.isFinite(v) ? v : 999;
  }
  function _autoSplitByHandicap() {
    const sorted = [..._players].sort((a, b) => _phValue(a) - _phValue(b));
    sorted.forEach((p, i) => { const pl = _players.find(x => x.ghin === p.ghin); if (pl) pl.team = i % 2 === 0 ? "T1" : "T2"; });
  }
  function _autoSplitRandom() {
    const shuffled = [..._players].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => { const pl = _players.find(x => x.ghin === p.ghin); if (pl) pl.team = i % 2 === 0 ? "T1" : "T2"; });
  }

  // ── Save — collapsed into one call per scope ────────────────────────
  function _modeToSend() { return _showModeToggle() ? _mode : _activation; }

  async function _applyChanges() {
    if (_busy) return;

    const t1 = safe(getTeamName("T1"));
    const t2 = safe(getTeamName("T2"));
    if (!t1 || !t2) {
      _showModalNotice("Both team names are required.", "warn");
      return;
    }

    // Defensive backstop behind the disabled button — see
    // _isPartiallyAssigned(). Unconditional now, not gated on activation:
    // "everyone assigned" and "no one assigned" are both valid regardless
    // of whether Teams is active for this round/event.
    if (_isPartiallyAssigned()) {
      const unassigned = unassignedCount();
      _showModalNotice(
        `Team assignment must be all or none — ${unassigned} player${unassigned === 1 ? "" : "s"} still need${unassigned === 1 ? "s" : ""} a team.`,
        "warn"
      );
      return;
    }

    _busy = true;
    MA.ui?.showBusy?.({ title: "Manage Teams", message: "Saving teams — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINTS[_target], {
        payload: {
          teams: _teamConfig?.teams || [],
          mode: _modeToSend(),
          assignments: _players.map(p => ({ ghin: p.ghin, team: p.team })),
        },
      });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save teams.", "danger"); return; }

      _teamConfig = res.payload?.teamConfig || _teamConfig;
      if (_showModeToggle()) { _mode = res.payload?.mode || _mode; } else { _activation = res.payload?.mode || _activation; }

      MA.ui.notify("Teams saved.", "success");

      const reconcileSummary = res.payload?.reconcile || null;
      const reconciled       = res.payload?.reconciled || [];
      const hasIssue = (reconcileSummary && reconcileSummary.roundsAffected > 0) || reconciled.length > 0;

      MA.ui?.hideBusy?.();
      _busy = false;

      if (hasIssue) {
        if (reconciled.length) _showReconciledNotice();
        // stays open — see module_defineTeams.js's original reasoning
      } else {
        _dismiss(true);
      }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      _showModalNotice("Error saving teams.", "danger");
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
  MA.manageTeams.open = async function (options) {
    _target = (options?.target === "event") ? "event" : "game";
    _onDone = options?.onDone || null;
    _busy = false;
    _lockedByEvent = false;

    MA.ui?.showBusy?.({ title: "Manage Teams", message: "Loading..." });
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

    // Response shapes genuinely differ — see header note.
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

    _teamConfig = deepClone(game.dbGames_TeamConfig || game.dbEvents_TeamConfig || null) || {
      teams: [
        { id: "T1", name: "Red",  color: "red",  sort: 1 },
        { id: "T2", name: "Blue", color: "blue", sort: 2 },
      ],
    };
    _players    = roster.map(normalizePlayer);
    _mode       = ((game.dbEvents_TeamMode) === "fixed") ? "fixed" : "none";
    _activation = ((game.dbGames_TeamMode) === "active") ? "active" : "disabled";

    // See header note — relocated lock check, target: "game" only.
    _lockedByEvent = (_target === "game") && (game.dbEvents_TeamMode === "fixed");

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);
    _wireEvents();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.manageTeams.close = function () {
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
