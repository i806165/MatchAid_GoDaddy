/* /assets/modules/game_players_display.js
 *
 * MA.rosterView — Read-only player roster modal for Admin & Player home pages.
 *
 * Markup uses ma_shared.css classes exclusively:
 *   maModalOverlay / maModal / maModal__hdr / maModal__body
 *   maModal__controls / maPill / iconBtn btnPrimary / maEmptyState
 *
 * Public API:
 *   MA.rosterView.open(options)
 *   MA.rosterView.close()
 *
 * Options passed by caller:
 *   {
 *     ggid         : string      — game ID (required)
 *     title        : string      — game title shown in modal header
 *     subtitle     : string      — play date string (formatted here for display)
 *     apiPath      : string      — URL to getGamePlayers endpoint
 *     teamConfig   : obj|string  — dbGames_TeamConfig value (optional pre-pass;
 *                                  also resolved from payload.game if absent)
 *     pairingMode  : string      — dbGames_Competition value (same)
 *     onClose      : function()  — optional callback when panel is dismissed
 *   }
 *
 * Request: { ggid, includeViews: true }
 *
 * Expected API response (api/game_players/getGamePlayers.php):
 *   { ok: true, payload: {
 *       players:      [...],   // db_Players rows
 *       game:         { dbGames_TeamConfig, dbGames_Competition, ... }
 *       views:        { byPlayer, byPairing, byPlayingGroup }  // ServiceGameRosterViews
 *       status:       { totalPlayers, pairedCount, slottedCount, ... }
 *       displayNames: { [ghin]: "Last, First" }
 *   }}
 *
 * Sorting and grouping come from the server (services/roster/
 * service_GameRosterViews.php) — the same views the Game Summary page and
 * "Send Tee Sheet" use — so this modal can't drift from them. The one
 * exception is the Team tab (team helpers are a separate, later cleanup).
 *
 * Player row fields consumed directly:
 *   dbPlayers_Name       full name, "First Last" (display uses displayNames)
 *   dbPlayers_LName      last name (letter dividers, avatar)
 *   dbPlayers_TeeSetName tee set display name
 *   dbPlayers_HI / _CH / _SO
 *   dbPlayers_TeamKey    team key → resolved via dbGames_TeamConfig.teams[].id
 *
 * Sort tab rules:
 *   "Name"       always shown   — views.byPlayer order, letter dividers
 *   "Team"       shown when dbGames_TeamConfig is not null
 *                               — grouped by team (team.sort order), LName within
 *   "Pairing"    PairField, shown once anyone is paired — views.byPairing
 *   "Match"      PairPair,  shown once anyone is paired — views.byPairing
 *   "Play Group" shown once anyone is slotted — views.byPlayingGroup
 *                               (tee-time / hole order, unslotted last)
 *
 * Badge (right side of row):
 *   Resolved team name when TeamConfig is present; nothing otherwise.
 *   Team name is looked up: player.dbPlayers_TeamKey → teamConfig.teams[].id → team.name
 *   Badge background/color uses team.color from the config shape.
 *
 * Sub-line (below player name):
 *   "Tee: {TeeSetName} · HI: {HI}"  — nothing else, no GHIN (private field).
 *
 * Dependencies:
 *   ma_shared.css   — all visual styles
 *   MA.postJson()   — provided by ma_shared.js (falls back to fetch if absent)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.rosterView = MA.rosterView || {};

  // ── Constants ─────────────────────────────────────────────────────────────────
  const OVERLAY_ID = "maRosterViewOverlay";

  // ── Module state ──────────────────────────────────────────────────────────────
  let _s = {
    opts:        {},
    data:        null,   // { players[], playerCount, totalSlots, game{} }
    teamConfig:  null,   // parsed dbGames_TeamConfig or null
    pairingMode: "",     // "PairField" | "PairPair" | ""
    activeSort:  "name", // "name" | "team" | "pairing" | "playgroup"
    search:      "",
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeStr(v) { return String(v ?? "").trim(); }

  function parseTeamConfig(raw) {
    if (!raw) return null;
    try {
      const obj = (typeof raw === "string") ? JSON.parse(raw) : raw;
      if (obj && Array.isArray(obj.teams) && obj.teams.length) return obj;
    } catch (_) {}
    return null;
  }

  function resolveTeam(teamId) {
    if (!_s.teamConfig) return null;
    return _s.teamConfig.teams.find(t => t.id === safeStr(teamId)) || null;
  }

  function formatSubtitle(raw) {
    if (!raw) return "";
    const parts = String(raw).slice(0, 10).split("-").map(Number);
    if (parts.length < 3 || !parts[0]) return raw;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(dt.getTime())) return raw;
    return dt.toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
  }

  async function apiPost(url, payload) {
    if (typeof MA.postJson === "function") return MA.postJson(url, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // ── Scoped CSS (structural only — visual from ma_shared.css) ─────────────────
  (function _injectStyles() {
    if (document.getElementById("ma-roster-styles")) return;
    const s = document.createElement("style");
    s.id = "ma-roster-styles";
    s.textContent = `
      .ma-rst-sortbar {
        display:flex; flex-shrink:0;
        border-bottom:1px solid var(--borderSubtle);
        background:var(--panelControlsBg, #f7f7f7);
        overflow-x:auto;
      }
      .ma-rst-tab {
        flex:1; padding:8px 4px; text-align:center;
        font-size:10px; font-weight:800; font-family:inherit;
        border:none; border-bottom:2px solid transparent;
        background:transparent; cursor:pointer;
        color:var(--mutedText); white-space:nowrap;
        transition:color 0.12s, border-color 0.12s;
      }
      .ma-rst-tab.is-active {
        color:var(--brandAccent);
        border-bottom-color:var(--brandAccent);
      }
      .ma-rst-group {
        display:flex; align-items:center; gap:6px;
        font-size:10px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase;
        color:var(--mutedText);
        padding:7px 12px 3px;
        background:var(--panelControlsBg, #ececea);
        border-top:0.5px solid var(--borderSubtle);
        border-bottom:0.5px solid var(--borderSubtle);
      }
      .ma-rst-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .ma-rst-row {
        display:flex; align-items:center; gap:10px;
        padding:10px 12px;
        background:var(--surfaceCard, #fff);
        border-bottom:0.5px solid var(--borderSubtle);
      }
      .ma-rst-avatar {
        width:32px; height:32px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:11px; font-weight:800; flex-shrink:0;
      }
      .ma-rst-info { flex:1; min-width:0; }
      .ma-rst-name {
        font-size:13px; font-weight:800; color:var(--textPrimary);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .ma-rst-sub { font-size:11px; font-weight:700; color:var(--mutedText); margin-top:1px; }
      .ma-rst-badge {
        font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px;
        flex-shrink:0; max-width:80px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      /* deterministic avatar palette */
      .ma-av0 { background:#E6F1FB; color:#0C447C; }
      .ma-av1 { background:#EAF3DE; color:#27500A; }
      .ma-av2 { background:#FAEEDA; color:#633806; }
      .ma-av3 { background:#E1F5EE; color:#085041; }
      .ma-av4 { background:#FAECE7; color:#4A1B0C; }
    `;
    document.head.appendChild(s);
  })();

  const _AV = ["ma-av0","ma-av1","ma-av2","ma-av3","ma-av4"];
  function _avClass(p) {
    const n = (safeStr(p.dbPlayers_LName).charCodeAt(0) || 0)
            + (safeStr(p.dbPlayers_Name).charCodeAt(0)  || 0);
    return _AV[n % _AV.length];
  }

  // ── Public: open ──────────────────────────────────────────────────────────────

  MA.rosterView.open = async function (options) {
    const opts      = options || {};
    _s.opts         = opts;
    _s.data         = null;
    _s.search       = "";
    _s.activeSort   = "name";
    const gameRow   = opts.game || {};
    _s.teamConfig   = parseTeamConfig(gameRow.dbGames_TeamConfig  || null);
    _s.pairingMode  = safeStr(gameRow.dbGames_Competition || "");

    _destroyOverlay();
    _renderOverlay(_html_skeleton());

    try {
      const apiPath = safeStr(opts.apiPath || (MA.paths && MA.paths.apiRosterView) || "");
      if (!apiPath) {
        _setHtml(_html_error("apiPath not configured for roster view."));
        return;
      }

      const res = await apiPost(apiPath, { ggid: opts.ggid, includeViews: true });

      if (!res || !res.ok) {
        _setHtml(_html_error(res?.message || "Failed to load players."));
        return;
      }

      const pl   = res.payload || res;
      _s.data    = {
        players:      Array.isArray(pl.players) ? pl.players : [],
        playerCount:  Number(pl.playerCount ?? 0),
        totalSlots:   Number(pl.totalSlots  ?? 0),
        game:         pl.game || {},
        views:        pl.views || null,
        status:       pl.status || null,
        displayNames: pl.displayNames || {},
      };

      // Resolve game-level config from payload when not pre-supplied by caller
      if (!_s.teamConfig && _s.data.game.dbGames_TeamConfig) {
        _s.teamConfig = parseTeamConfig(_s.data.game.dbGames_TeamConfig);
      }
      if (!_s.pairingMode && _s.data.game.dbGames_Competition) {
        _s.pairingMode = safeStr(_s.data.game.dbGames_Competition);
      }

      _setHtml(_html_panel());
      _wireEvents();

    } catch (e) {
      console.error("[MA.rosterView]", e);
      _setHtml(_html_error("Unexpected error loading player roster."));
    }
  };

  MA.rosterView.close = function () {
    _destroyOverlay();
    _s.data        = null;
    _s.search      = "";
    _s.teamConfig  = null;
    _s.pairingMode = "";
    document.documentElement.classList.remove("maOverlayOpen");
    if (typeof _s.opts.onClose === "function") _s.opts.onClose();
  };

  // ── DOM management ────────────────────────────────────────────────────────────

  function _renderOverlay(html) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) MA.rosterView.close();
      });
      document.body.appendChild(overlay);
    }
    overlay.className = "maModalOverlay is-open";
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Game Player Roster"
               style="box-sizing:border-box; max-width:calc(100vw - 32px);
                      display:flex; flex-direction:column;">
        ${html}
      </section>`;
    document.documentElement.classList.add("maOverlayOpen");
  }

  function _setHtml(html) {
    const modal = document.querySelector("#" + OVERLAY_ID + " .maModal");
    if (modal) modal.innerHTML = html;
  }

  function _destroyOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  // ── HTML builders ─────────────────────────────────────────────────────────────

  function _html_skeleton() {
    return _html_hdr() + `
      <div class="maModal__body">
        <div class="maEmptyState">Loading players&hellip;</div>
      </div>`;
  }

  function _html_error(msg) {
    return _html_hdr() + `
      <div class="maModal__body">
        <div class="maEmptyState" style="color:var(--danger);">${esc(msg)}</div>
      </div>`;
  }

  // 1. HEADER — always fixed, never scrolls
  function _html_hdr() {
    const title    = safeStr(_s.opts.title)    || "Game Roster";
    const rawSub   = safeStr(_s.opts.subtitle) || "";
    const subtitle = formatSubtitle(rawSub) || rawSub;
    return `
      <header class="maModal__hdr" style="flex-shrink:0;">
        <div class="maModal__titles" style="min-width:0; overflow:hidden; flex:1 1 auto;">
          <div class="maModal__title">${esc(title)}</div>
          ${subtitle ? `<div class="maModal__subtitle">${esc(subtitle)}</div>` : ""}
        </div>
        <button type="button" class="iconBtn btnPrimary"
                onclick="MA.rosterView.close()" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>`;
  }

  // 2. CONTROLS — search + count pill; fixed peer, never scrolls
  function _html_controls() {
    const count  = _s.data.playerCount || _s.data.players.length;
    const slots  = _s.data.totalSlots;
    const label  = slots > 0 ? `${count} / ${slots}` : String(count);
    return `
      <div class="maModal__controls"
           style="padding:10px 12px; flex-shrink:0;
                  background:var(--panelControlsBg); border-bottom:1px solid var(--borderSubtle);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="flex:1; position:relative;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 style="position:absolute; left:10px; top:50%; transform:translateY(-50%);
                        color:var(--mutedText); pointer-events:none;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="ma-rst-search" type="search" autocomplete="off"
                   placeholder="Search players…" class="maTextInput"
                   style="padding-left:32px; font-size:13px; width:100%; box-sizing:border-box;"
                   value="${esc(_s.search)}" />
          </div>
          <span class="maPill"
                style="flex-shrink:0; padding:0 10px; font-size:10px; font-weight:800;
                       background:var(--brandPrimaryBg); color:var(--brandPrimary);">
            ${esc(label)}
          </span>
        </div>
      </div>`;
  }

  // 3. SORT BAR — fixed peer, never scrolls
  function _buildTabs() {
    const status = _s.data?.status || null;
    // Without a status (shouldn't happen), fall back to showing the tabs.
    const anyPaired  = status ? Number(status.pairedCount  || 0) > 0 : true;
    const anySlotted = status ? Number(status.slottedCount || 0) > 0 : true;

    const tabs = [{ key: "name", label: "Name" }];
    if (_s.teamConfig) {
      tabs.push({ key: "team", label: "Team" });
    }
    if (anyPaired && _s.pairingMode === "PairField") {
      tabs.push({ key: "pairing", label: "Pairing" });
    } else if (anyPaired && _s.pairingMode === "PairPair") {
      tabs.push({ key: "pairing", label: "Match" });
    }
    if (anySlotted) {
      tabs.push({ key: "playgroup", label: "Play Group" });
    }
    return tabs;
  }

  function _html_sortbar() {
    const tabs = _buildTabs();
    if (!tabs.find(t => t.key === _s.activeSort)) _s.activeSort = "name";
    return `
      <div class="ma-rst-sortbar" id="ma-rst-sortbar">
        ${tabs.map(t => `
          <button type="button"
                  class="ma-rst-tab${t.key === _s.activeSort ? " is-active" : ""}"
                  data-sort="${esc(t.key)}">
            ${esc(t.label)}
          </button>`).join("")}
      </div>`;
  }

  // 4. FULL PANEL: hdr + controls + sortbar + scrollable body
  function _html_panel() {
    return _html_hdr()
      + _html_controls()
      + _html_sortbar()
      + `<div class="maModal__body" id="ma-rst-body"
              style="padding:0; overflow-y:auto; flex:1; min-height:0; background:var(--surfaceApp);">
           ${_html_list()}
         </div>`;
  }

  // ── List rendering (re-used on sort/search change) ───────────────────────────

  function _html_list() {
    const players = _filtered();
    if (!players.length) return `<div class="maEmptyState">No players found.</div>`;
    let html;
    switch (_s.activeSort) {
      case "team":      html = _byTeam(players); break;
      case "pairing":   html = _byPairing();     break;
      case "playgroup": html = _byPlayGroup();   break;
      default:          html = _byName();        break;
    }
    return html || `<div class="maEmptyState">No players found.</div>`;
  }

  function _matchesSearch(p) {
    const q = _s.search.toLowerCase().trim();
    if (!q) return true;
    const name = [safeStr(p.dbPlayers_LName), safeStr(p.dbPlayers_Name)]
      .filter(Boolean).join(" ").toLowerCase();
    return name.includes(q);
  }

  function _filtered() {
    return (_s.data?.players || []).filter(_matchesSearch);
  }

  // "Last, First" from the server's shared rule (ServiceGameRosterViews::
  // formatPlayerNameLastFirst); raw full name if it's missing.
  function _displayName(p) {
    const byGhin = _s.data?.displayNames || {};
    return safeStr(byGhin[safeStr(p.dbPlayers_PlayerGHIN)]) || safeStr(p.dbPlayers_Name) || "—";
  }

  // ── Sort renderers ────────────────────────────────────────────────────────────
  // Name / Pairing / Match / Play Group render the server's views
  // (views.byPlayer / byPairing / byPlayingGroup) in the order given —
  // no client-side sorting. Search filters players within that order.

  function _byName() {
    const ordered = (_s.data?.views?.byPlayer?.players || _s.data?.players || []).filter(_matchesSearch);
    let html = "", lastLetter = "";
    for (const p of ordered) {
      const L = (safeStr(p.dbPlayers_LName)[0] || "#").toUpperCase();
      if (L !== lastLetter) { html += _groupLabel(L); lastLetter = L; }
      html += _row(p);
    }
    return html;
  }

  function _byTeam(players) {
    if (!_s.teamConfig) return _byName(players);
    const order = Object.fromEntries(_s.teamConfig.teams.map(t => [t.id, t.sort]));
    const sorted = players.slice().sort((a, b) =>
      (order[safeStr(a.dbPlayers_TeamKey)] || 999) - (order[safeStr(b.dbPlayers_TeamKey)] || 999) ||
      safeStr(a.dbPlayers_LName).localeCompare(safeStr(b.dbPlayers_LName))
    );
    let html = "", lastId = null;
    for (const p of sorted) {
      const id = safeStr(p.dbPlayers_TeamKey);
      if (id !== lastId) {
        const team = resolveTeam(id);
        html += _groupLabel(team ? `Team: ${team.name}` : id || "No Team", team?.color || null);
        lastId = id;
      }
      html += _row(p);
    }
    return html;
  }

  // Emits a group label only when the group has at least one player left
  // after search filtering.
  function _groupHtml(label, players) {
    const shown = (players || []).filter(_matchesSearch);
    if (!shown.length) return "";
    return _groupLabel(label) + shown.map(_row).join("");
  }

  // views.byPairing: flightGroups → groups (Match for PairPair, Pairing for
  // PairField) → pairings → players.
  function _byPairing() {
    const flightGroups = _s.data?.views?.byPairing?.flightGroups || [];
    const isPairPair = _s.pairingMode === "PairPair";
    let html = "";
    for (const fg of flightGroups) {
      let fgHtml = "";
      for (const group of (fg.groups || [])) {
        const players = (group.pairings || []).flatMap(pr => pr.players || []);
        const label = isPairPair
          ? `Match ${safeStr(group.matchId) || "—"}`
          : `Pairing ${safeStr(group.pairings?.[0]?.pairingId) || "—"}`;
        fgHtml += _groupHtml(label, players);
      }
      if (fgHtml && safeStr(fg.flightLabel)) fgHtml = _groupLabel(`Flight ${fg.flightLabel}`) + fgHtml;
      html += fgHtml;
    }
    return html;
  }

  // views.byPlayingGroup: flightGroups → playingGroups, in tee-time / hole
  // order; the unslotted players come last under playerKey "—".
  function _byPlayGroup() {
    const flightGroups = _s.data?.views?.byPlayingGroup?.flightGroups || [];
    let html = "";
    for (const fg of flightGroups) {
      let fgHtml = "";
      for (const pg of (fg.playingGroups || [])) {
        const key = safeStr(pg.playerKey);
        let label;
        if (!key || key === "—") {
          label = "Not yet slotted";
        } else {
          const when = [safeStr(pg.teeTimeDisplay), pg.startHoleDisplay ? `Hole ${pg.startHoleDisplay}` : ""]
            .filter(s => s && s !== "—" && s !== "Hole —");
          label = [`Play Group: ${key}`, ...when].join(" · ");
        }
        fgHtml += _groupHtml(label, pg.players);
      }
      if (fgHtml && safeStr(fg.flightLabel)) fgHtml = _groupLabel(`Flight ${fg.flightLabel}`) + fgHtml;
      html += fgHtml;
    }
    return html;
  }

  // ── Row / group HTML ──────────────────────────────────────────────────────────

  function _groupLabel(text, dotColor) {
    const dot = dotColor
      ? `<span class="ma-rst-dot" style="background:${esc(dotColor)};"></span>`
      : "";
    return `<div class="ma-rst-group">${dot}${esc(text)}</div>`;
  }

  function _row(p) {
    const first = safeStr(p.dbPlayers_Name);
    const last  = safeStr(p.dbPlayers_LName);
    const tee   = safeStr(p.dbPlayers_TeeSetName);
    const hi    = safeStr(p.dbPlayers_HI);
    const ch    = safeStr(p.dbPlayers_CH);
    const so    = safeStr(p.dbPlayers_SO);

    // Sub-line: Tee · HI · CH · SO — NO GHIN (private field)
    const parts = [];
    if (tee) parts.push(`Tee: ${tee}`);
    if (hi)  parts.push(`HI: ${hi}`);
    if (ch)  parts.push(`CH: ${ch}`);
    if (so)  parts.push(`SO: ${so}`);
    const sub = parts.join(" &middot; ") || "&nbsp;";

    // Right badge: resolved team name only when teams configured
    const team = resolveTeam(safeStr(p.dbPlayers_TeamKey));
    const badge = team
      ? `<span class="ma-rst-badge"
               style="background:${esc(team.color)}22; color:${esc(team.color)};
                      border:1px solid ${esc(team.color)}55;">${esc(team.name)}</span>`
      : "";

    // Name displayed as "Last, First" — server's shared rule (see _displayName).
    // `first` here is the FULL name (dbPlayers_Name is "First Last"); it's
    // only used for the avatar initials below.
    const displayName = _displayName(p);

    return `
      <div class="ma-rst-row">
        <div class="ma-rst-avatar ${_avClass(p)}">${esc((first[0] || "") + (last[0] || "") || "?")}</div>
        <div class="ma-rst-info">
          <div class="ma-rst-name">${esc(displayName)}</div>
          <div class="ma-rst-sub">${sub}</div>
        </div>
        ${badge}
      </div>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Sort tabs
    overlay.querySelectorAll(".ma-rst-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _s.activeSort = btn.dataset.sort || "name";
        // Update active class on tabs
        overlay.querySelectorAll(".ma-rst-tab").forEach(function (t) {
          t.classList.toggle("is-active", t.dataset.sort === _s.activeSort);
        });
        _refreshBody();
      });
    });

    // Search
    const searchEl = overlay.querySelector("#ma-rst-search");
    if (searchEl) {
      const onSearch = function () {
        _s.search = searchEl.value || "";
        _refreshBody();
      };
      searchEl.addEventListener("input",  onSearch);
      searchEl.addEventListener("search", onSearch); // fires on native clear (×)
    }
  }

  function _refreshBody() {
    const body = document.getElementById("ma-rst-body");
    if (body) { body.innerHTML = _html_list(); body.scrollTop = 0; }
  }

  window.MA = MA;
})();