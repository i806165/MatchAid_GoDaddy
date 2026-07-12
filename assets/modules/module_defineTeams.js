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
 *                                       module has no mode of its own and can omit it.
 *     showModeToggle  : bool         — true only for the Event Roster usage. Renders
 *                                       the "Apply to all rounds?" yes/no toggle,
 *                                       bundled into the same Apply as config/assignments.
 *                                       Omitted (falsy) for the round-level usage —
 *                                       a round either follows the event (mode "fixed",
 *                                       button hidden entirely — see game_players.js)
 *                                       or is fully independent (mode "none"), and in
 *                                       neither case does the round itself own a toggle.
 *     apiBase         : string       — e.g. "/api/game_players" or "/api/event_roster"
 *     onApply         : function({ players, teamConfig, mode })
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
  let _mode       = "none";  // "fixed" | "none" — see showModeToggle in options
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

  // ── Render ───────────────────────────────────────────────────────────────────

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Manage Teams">
        ${_renderHeader()}
        ${hasTeams() ? _renderStateB() : _renderStateA()}
      </section>`;
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
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        <div class="maListRow__subline" style="margin-bottom:10px;">Get started by naming your teams.</div>
        ${_renderApplyToggle()}
        <div style="${_opts.showModeToggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
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
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        ${_renderApplyToggle()}
        <div style="${_opts.showModeToggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""} display:flex; flex-direction:column; gap:8px;">
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
      <div class="maModal__body" id="mtRoster" style="padding:0;">
        <div class="maListRows">${_renderRosterRows()}</div>
      </div>
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Cancel</button>
        <button type="button" class="maFtrBtn maFtrBtn--save" id="mtBtnApply">Apply</button>
      </footer>`;
  }

  // Apply-toggle — "Apply to all rounds?" yes/no, Event Roster usage only
  // (showModeToggle:true). Bundled into the same Apply/Create as
  // config/assignments — flipping it alone does nothing until Apply is
  // clicked. Defaults off; when off, every linked round keeps whatever
  // team setup it already has. The round-level usage (game_players) has
  // no toggle of its own: a round either follows the event (mode "fixed",
  // and this whole module is unreachable there — see game_players.js's
  // Manage Teams hide) or is fully independent (mode "none"), same as a
  // Flat Game.
  //
  // Framed as a yes/no question, not an EVENT/ROUND location choice — the
  // control only ever renders on the Event Roster page, so asking the
  // admin to pick between "Event" and "Round" as if choosing a location
  // is circular (they're already on the event). What's decided is a
  // consequence, not a location: does this configuration apply
  // everywhere, or does each round set its own. Mirrors
  // module_defineFlights.js's identical reframe exactly, including the
  // is-active-accent (brandColor3 blue) selected state instead of the
  // standard tan is-active, since this is a binary decision with
  // cascading consequences.
  function _renderApplyToggle() {
    if (!_opts.showModeToggle) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Apply to all rounds?</span>
          <div class="maSeg" id="mtModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Apply this team configuration to all rounds">
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
      ? "This team configuration will apply to every round in this event."
      : "Each round can set its own teams.";
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

  async function _saveTeamConfig(teams) {
    if (_busy) return;
    _busy = true; _showBusy("Saving team configuration — please wait...");
    try {
      const res = await MA.postJson(apiPath("saveTeamConfig.php"), { teams, mode: _mode });
      if (!res?.ok) { MA.setStatus(res?.message || "Unable to save team configuration.", "danger"); return; }
      _teamConfig = res.payload?.teamConfig || { teams };
      const modal = _getModal();
      if (modal) { modal.innerHTML = _renderHeader() + _renderStateB(); _wireEvents(); }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      MA.setStatus("Error saving team configuration.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  async function _applyChanges() {
    if (_busy) return;
    _busy = true; _showBusy("Saving teams — please wait...");
    try {
      const configRes = await MA.postJson(apiPath("saveTeamConfig.php"), { teams: _teamConfig?.teams || [], mode: _mode });
      if (!configRes?.ok) { MA.setStatus(configRes?.message || "Unable to save team names.", "danger"); return; }
      _teamConfig = configRes.payload?.teamConfig || _teamConfig;
      _mode = configRes.payload?.mode || _mode;

      const assignments = _players.map(p => ({ ghin: p.ghin, team: p.team }));
      const assignRes = await MA.postJson(apiPath("saveTeamAssignments.php"), { assignments });
      if (!assignRes?.ok) { MA.setStatus(assignRes?.message || "Unable to save assignments.", "danger"); return; }

      MA.setStatus("Teams saved.", "success");
      if (typeof _opts.onApply === "function") {
        _opts.onApply({ players: assignRes.payload?.players || [], teamConfig: _teamConfig, mode: _mode });
      }
      MA.manageTeams.close();
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      MA.setStatus("Error saving teams.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  const BUSY_ID = "mtBusyOverlay";

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
          <div class="maModal__title">Manage Teams</div>
        </div>
      </header>
      <div class="maModal__body" id="mtBusyBody">
        <p id="mtBusyMessage" style="line-height:1.6;"></p>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function _showBusy(message) {
    _ensureBusyOverlay();
    const overlay = document.getElementById(BUSY_ID);
    const body    = document.getElementById("mtBusyBody");
    if (body) body.innerHTML = `<p style="line-height:1.6;">${message || "Processing — please wait..."}</p>`;
    if (overlay) overlay.classList.add("is-open");
  }

  function _hideBusy() {
    const overlay = document.getElementById(BUSY_ID);
    if (overlay) overlay.classList.remove("is-open");
  }

  window.MA = MA;

})();