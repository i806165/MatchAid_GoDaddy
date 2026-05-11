/* /assets/modules/manage_teams.js
 *
 * MA.manageTeams — Manage Teams module for the Game Players page.
 *
 * Zero injected CSS. All classes come from:
 *   ma_shared.css     — modal, buttons, list rows, pills, controls
 *   game_players.css  — gpRow--teams, gpAvatar, gpSub, gpTeamBadge, gpEmpty
 *
 * New classes added to each file:
 *   ma_shared.css    → .maSwatch, .maSwatch--red/blue (Section 1 tokens)
 *                    → .maTeamBadge, .maTeamBadge--red/blue/none + .is-active (Section 13)
 *   game_players.css → .gpRow--teams, .gpAvatar
 *                    → .gpSub--indented
 *                    → .gpTeamBadge, .gpTeamBadge--red/blue
 *
 * Public API:
 *   MA.manageTeams.open(options)
 *   MA.manageTeams.close()
 *
 * Options:
 *   {
 *     players    : array        — raw player rows from state.players (db field names)
 *     teamConfig : object|null  — current window.__MA_INIT__.teamConfig value
 *     apiBase    : string       — e.g. "/api/game_players"
 *     onApply    : function({ players, teamConfig })
 *   }
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
      el.addEventListener("click", e => { if (e.target === el) MA.manageTeams.close(); });
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
        <div class="gpSub" style="margin-bottom:10px;">Get started by naming your teams.</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
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
    const summaryText = u > 0 ? `${u} unassigned` : "All players assigned";
    return `
      <div class="maModal__controls" id="mtTeamCfgStrip">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          ${_renderTeamNameInput("T1", getTeamName("T1"))}
          ${_renderTeamNameInput("T2", getTeamName("T2"))}
        </div>
      </div>
      <div class="maModal__controls"
           style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btnSecondary" id="mtBtnSplitHC"
                style="font-size:12px; gap:5px;">
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
                style="font-size:12px; gap:5px;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
          Random
        </button>
        <span style="flex:1;"></span>
        <button type="button" class="btn btnLink" id="mtBtnClearAll"
                style="font-size:12px;">Clear all</button>
        <button type="button" class="btn btnLink" id="mtBtnResetTeams"
                style="font-size:12px; color:var(--danger);">Reset teams</button>
      </div>
      <div class="maModal__body" id="mtRoster" style="padding:0;">
        <div class="maListRows">${_renderRosterRows()}</div>
      </div>
      <footer class="maModal__ftr">
        <button type="button" class="maFtrBtn maFtrBtn--cancel" id="mtBtnCancel">Cancel</button>
        <div class="maModal__ftrActions" style="flex:0 0 auto;">
          <span id="mtSummaryText" class="gpSub">${esc(summaryText)}</span>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="mtBtnApply">Apply</button>
        </div>
      </footer>`;
  }

  function _renderTeamNameInput(slotId, currentName) {
    const slot  = TEAM_SLOTS.find(s => s.id === slotId);
    const color = slot?.color || "red";
    const count = countByTeam(slotId);
    const countHtml = hasTeams()
      ? `<div class="gpSub gpSub--indented" data-team-count="${esc(slotId)}">${count} player${count !== 1 ? "s" : ""}</div>`
      : "";
    return `
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="maSwatch maSwatch--${esc(color)}" aria-hidden="true"></span>
          <input type="text"
                 class="maTextInput"
                 data-slot="${esc(slotId)}"
                 id="mtTeamName${esc(slotId)}"
                 value="${esc(currentName)}"
                 maxlength="32"
                 style="flex:1; height:32px; font-size:13px !important; padding:0 8px;"
                 aria-label="${esc(slotId === "T1" ? "Team 1 name" : "Team 2 name")}">
        </div>
        ${countHtml}
      </div>`;
  }

  function _renderRosterRows() {
    const players = sortedPlayers();
    if (!players.length) return `<div class="gpEmpty">No players in this game.</div>`;
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
      <div class="maListRow gpRow gpRow--teams" data-ghin="${esc(p.ghin)}">
        <div class="gpAvatar" aria-hidden="true">${ini}</div>
        <div class="maListRow__col">
          ${name}
          ${hi ? `<div class="gpSub">${esc(hi)}</div>` : ""}
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

    overlay.querySelector("#mtBtnClose")?.addEventListener("click", MA.manageTeams.close);
    overlay.querySelector("#mtBtnCancel")?.addEventListener("click", MA.manageTeams.close);

    if (!hasTeams()) {
      _wireStateA(overlay);
    } else {
      _wireStateB(overlay);
    }
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

    overlay.querySelector("#mtBtnResetTeams")?.addEventListener("click", _confirmResetTeams);
    overlay.querySelector("#mtBtnApply")?.addEventListener("click", _applyChanges);
  }

  // ── Partial re-renders ───────────────────────────────────────────────────────

  function _refreshPlayerRow(ghin) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const row    = overlay.querySelector(`.gpRow--teams[data-ghin="${CSS.escape(ghin)}"]`);
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
      el.textContent = `${n} player${n !== 1 ? "s" : ""}`;
    });
  }

  function _refreshSubtitle() {
    const u = unassignedCount();
    const n = _players.length;
    const subtitle = u > 0 ? `${n} Players — ${u} unassigned` : `${n} Players — All assigned`;
    const el = document.querySelector("#mtSubtitle");
    if (el) el.textContent = subtitle;
    const summary = document.querySelector("#mtSummaryText");
    if (summary) summary.textContent = u > 0 ? `${u} unassigned` : "All players assigned";
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
    _busy = true; _setBusy(true);
    try {
      const res = await MA.postJson(apiPath("saveTeamConfig.php"), { teams });
      if (!res?.ok) { MA.setStatus(res?.message || "Unable to save team configuration.", "danger"); return; }
      _teamConfig = res.payload?.teamConfig || { teams };
      const modal = _getModal();
      if (modal) { modal.innerHTML = _renderHeader() + _renderStateB(); _wireEvents(); }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      MA.setStatus("Error saving team configuration.", "danger");
    } finally { _busy = false; _setBusy(false); }
  }

  async function _applyChanges() {
    if (_busy) return;
    _busy = true; _setBusy(true);
    try {
      const configRes = await MA.postJson(apiPath("saveTeamConfig.php"), { teams: _teamConfig?.teams || [] });
      if (!configRes?.ok) { MA.setStatus(configRes?.message || "Unable to save team names.", "danger"); return; }
      _teamConfig = configRes.payload?.teamConfig || _teamConfig;

      const assignments = _players.map(p => ({ ghin: p.ghin, team: p.team }));
      const assignRes = await MA.postJson(apiPath("saveTeamAssignments.php"), { assignments });
      if (!assignRes?.ok) { MA.setStatus(assignRes?.message || "Unable to save assignments.", "danger"); return; }

      MA.setStatus("Teams saved.", "success");
      if (typeof _opts.onApply === "function") {
        _opts.onApply({ players: assignRes.payload?.players || [], teamConfig: _teamConfig });
      }
      MA.manageTeams.close();
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      MA.setStatus("Error saving teams.", "danger");
    } finally { _busy = false; _setBusy(false); }
  }

  function _confirmResetTeams() {
    if (_busy) return;
    if (!window.confirm("This will delete both teams and remove all team assignments. This cannot be undone.")) return;
    _resetTeams();
  }

  async function _resetTeams() {
    if (_busy) return;
    _busy = true; _setBusy(true);
    try {
      const configRes = await MA.postJson(apiPath("saveTeamConfig.php"), { teams: [] });
      if (!configRes?.ok) { MA.setStatus(configRes?.message || "Unable to reset teams.", "danger"); return; }

      const assignments = _players.map(p => ({ ghin: p.ghin, team: "" }));
      const assignRes = await MA.postJson(apiPath("saveTeamAssignments.php"), { assignments });
      if (!assignRes?.ok) { MA.setStatus(assignRes?.message || "Unable to clear assignments.", "danger"); return; }

      _teamConfig = null;
      _players.forEach(p => p.team = "");
      MA.setStatus("Teams have been reset.", "info");
      if (typeof _opts.onApply === "function") {
        _opts.onApply({ players: assignRes.payload?.players || [], teamConfig: null });
      }
      const modal = _getModal();
      if (modal) { modal.innerHTML = _renderHeader() + _renderStateA(); _wireEvents(); }
    } catch (e) {
      console.error("[MA.manageTeams]", e);
      MA.setStatus("Error resetting teams.", "danger");
    } finally { _busy = false; _setBusy(false); }
  }

  function _setBusy(on) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ["#mtBtnApply", "#mtBtnCreate", "#mtBtnSplitHC", "#mtBtnRandom"].forEach(sel => {
      const btn = overlay.querySelector(sel);
      if (btn) btn.disabled = !!on;
    });
  }

  window.MA = MA;

})();