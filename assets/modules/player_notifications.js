/* /assets/modules/player_notifications.js
 *
 * MA.notify — Player notification address selector module.
 *
 * Presents a two-tab UI (Game Players / Favorites) allowing the caller
 * to select recipients and launch a mailto: or SMS-gateway email via
 * the existing MA.email.compose() module.
 *
 * Markup uses ma_shared.css classes exclusively:
 *   maModalOverlay / maModal / maModal__hdr / maModal__body / maModal__ftr
 *   maListRow / maPill / iconBtn btnPrimary / maFtrBtn maFtrBtn--save
 *
 * Public API:
 *   MA.notify.open(options)
 *   MA.notify.close()
 *
 * Options:
 *   {
 *     ggid      : string|number|null  — game ID; omit or null for favorites-only
 *     apiPath   : string              — URL to initPlayerNotifications.php
 *     onClose   : function()          — optional callback when panel is dismissed
 *   }
 *
 * Dependencies:
 *   ma_shared.css        — all visual styles
 *   MA.email.compose()   — composeEmail.js must be loaded
 *   MA.postJson()        — provided by ma_shared.js
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.notify = MA.notify || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const OVERLAY_ID = "maNotifyOverlay";

  // ── State ────────────────────────────────────────────────────────────────────
  let _state = {
    opts:        {},
    data:        null,
    activeTab:   "game",
    selected:    new Set(),
    favFilter:   "all",
    outlookMode: false,   // false = commas, true = semicolons
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeStr(v) { return String(v ?? "").trim(); }

  function initials(name) {
    const parts = safeStr(name).split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return "?";
  }

  function formatContactLine(player) {
    const email  = safeStr(player.email);
    const mobile = safeStr(player.mobile);
    if (email && mobile) return esc(email) + " &middot; " + esc(mobile);
    if (email)           return esc(email);
    if (mobile)          return esc(mobile);
    return "No contact on file";
  }

  function formatDateShort(dateStr, timeStr) {
    const d = safeStr(dateStr);
    if (!d) return "";
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    if (isNaN(dt.getTime())) return d;
    const dow      = dt.toLocaleDateString("en-US", { weekday: "short" });
    const mmdd     = String(m).padStart(2, "0") + "/" + String(day).padStart(2, "0");
    const t        = safeStr(timeStr);
    const timePart = t ? " at " + formatTime(t) : "";
    return dow + " " + mmdd + timePart;
  }

  function formatTime(timeStr) {
    const parts = safeStr(timeStr).split(":");
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ampm;
  }

  async function apiPost(url, payload) {
    if (typeof MA.postJson === "function") {
      return MA.postJson(url, payload);
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // ── Public: open ─────────────────────────────────────────────────────────────

  MA.notify.open = async function (options) {
    const opts       = options || {};
    _state.opts      = opts;
    _state.selected  = new Set();
    _state.favFilter = "all";
    _state.outlookMode = false;

    _destroyOverlay();
    _renderOverlay(_html_skeleton());

    try {
      const payload = {};
      if (opts.ggid) payload.ggid = opts.ggid;

      const apiPath = opts.apiPath || (MA.paths && MA.paths.apiNotify) || "";
      if (!apiPath) { _setModalHtml(_html_error("apiPath not configured.")); return; }

      const data = await apiPost(apiPath, payload);
      if (!data || !data.ok) {
        _setModalHtml(_html_error(data?.message || "Failed to load recipients."));
        return;
      }

      _state.data      = data;
      _state.activeTab = data.hasGameContext ? "game" : "favs";

      // Pre-select all reachable game players when a game context is present
      if (data.hasGameContext && Array.isArray(data.gamePlayers)) {
        data.gamePlayers.forEach(function (p) {
          if (p.deliveryMethod !== null) _state.selected.add(p.ghin);
        });
      }

      _setModalHtml(_html_panel());
      _wireEvents();
      _updateFooter();

    } catch (e) {
      console.error("[MA.notify]", e);
      _setModalHtml(_html_error("Unexpected error loading recipients."));
    }
  };

  MA.notify.close = function () {
    _destroyOverlay();
    _state.data        = null;
    _state.selected    = new Set();
    _state.outlookMode = false;
    document.documentElement.classList.remove("maOverlayOpen");
    if (typeof _state.opts.onClose === "function") _state.opts.onClose();
  };

  // ── DOM management ────────────────────────────────────────────────────────────

  function _renderOverlay(modalHtml) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) MA.notify.close();
      });
      document.body.appendChild(overlay);
    }
    overlay.className = "maModalOverlay is-open";
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Send message">
        ${modalHtml}
      </section>`;
    document.documentElement.classList.add("maOverlayOpen");
  }

  function _setModalHtml(html) {
    const modal = document.querySelector("#" + OVERLAY_ID + " .maModal");
    if (modal) modal.innerHTML = html;
  }

  function _destroyOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────────

  function _html_skeleton() {
    return _html_hdr("Send message", "") + `
      <div class="maModal__body">
        <div class="maEmptyState">Loading recipients&hellip;</div>
      </div>`;
  }

  function _html_error(msg) {
    return _html_hdr("Send message", "") + `
      <div class="maModal__body">
        <div class="maEmptyState" style="color:var(--danger);">${esc(msg)}</div>
      </div>`;
  }

  // ── Shared header ─────────────────────────────────────────────────────────────
  function _html_hdr(title, subtitle) {
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles" style="min-width:0; overflow:hidden; flex:1 1 auto;">
          <div class="maModal__title">${esc(title)}</div>
          ${subtitle ? `<div class="maModal__subtitle">${esc(subtitle)}</div>` : ""}
        </div>
        <button type="button" class="iconBtn btnPrimary"
                onclick="MA.notify.close()" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>`;
  }

  // ── Full panel ────────────────────────────────────────────────────────────────

  function _html_panel() {
    const d       = _state.data;
    const game    = d.game;
    const hasGame = d.hasGameContext;

    let subtitle = "Your favorites";
    if (hasGame && game) {
      const venue = [game.facilityName, game.courseName].filter(Boolean).join(" \u2022 ");
      const when  = formatDateShort(game.playDate, game.playTime);
      subtitle    = [venue, when].filter(Boolean).join(" \u2022 ");
    }

    const tabBar = hasGame ? `
      <div class="maModal__controls"
           style="padding:0; display:flex; border-bottom:1px solid var(--borderSubtle);">
        ${_html_tabBtn("game", "Game players")}
        ${_html_tabBtn("favs", "Favorites")}
      </div>` : "";

    const gamePanel = hasGame
      ? `<div class="ma-notify-panel${_state.activeTab === "game" ? " is-active" : ""}"
              data-panel="game">${_html_gamePanel()}</div>`
      : "";

    const favsActive = _state.activeTab === "favs" || !hasGame;
    const favsPanel  = `
      <div class="ma-notify-panel${favsActive ? " is-active" : ""}" data-panel="favs">
        ${_html_favsPanel()}
      </div>`;

    return `
      ${_html_hdr("Send message", subtitle)}
      ${tabBar}
      <div class="maModal__body" style="padding:0; background:var(--surfaceApp);">
        ${gamePanel}
        ${favsPanel}
      </div>
      <footer class="maModal__ftr" style="flex-direction:column; gap:10px;">
        <div style="font-size:12px; font-weight:800; color:var(--mutedText);">
          Separate recipients with:
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="display:flex; align-items:center; gap:8px;
                          font-size:12px; font-weight:800; color:var(--ink); cursor:pointer;">
              <input type="radio" id="ma-notify-sep-comma" name="ma-notify-sep"
                     value="," checked
                     style="width:16px; height:16px; accent-color:var(--brandSecondary); cursor:pointer;">
              Commas
              <span style="font-weight:800; color:var(--mutedText); font-size:11px;">
                Gmail, Apple Mail, most clients
              </span>
            </label>
            <label style="display:flex; align-items:center; gap:8px;
                          font-size:12px; font-weight:800; color:var(--ink); cursor:pointer;">
              <input type="radio" id="ma-notify-sep-semi" name="ma-notify-sep"
                     value=";"
                     style="width:16px; height:16px; accent-color:var(--brandSecondary); cursor:pointer;">
              Semicolons
              <span style="font-weight:800; color:var(--mutedText); font-size:11px;">
                Outlook
              </span>
            </label>
          </div>
          <button type="button" id="ma-notify-btn-email"
                  class="maFtrBtn maFtrBtn--save"
                  style="flex:0 0 auto; min-width:120px; align-self:flex-end;"
                  disabled>
            Open email
          </button>
        </div>
      </footer>`;
  }

  function _html_tabBtn(tab, label) {
    const active = _state.activeTab === tab;
    return `
      <button type="button" class="ma-notify-tab" data-tab="${esc(tab)}"
              style="flex:1; padding:10px 0; font-family:var(--fontFamilyBase);
                     font-size:13px; font-weight:800; border:none; cursor:pointer;
                     background:transparent;
                     border-bottom:2px solid ${active ? "var(--brandAccent)" : "transparent"};
                     color:${active ? "var(--brandAccent)" : "var(--mutedText)"};">
        ${esc(label)}
      </button>`;
  }

  // ── Game players panel ────────────────────────────────────────────────────────

  function _html_gamePanel() {
    const players = _state.data.gamePlayers || [];
    if (!players.length) {
      return `<div class="maEmptyState" style="margin:14px;">No players in this game.</div>`;
    }
    return `
      ${_html_toolbar("game")}
      <div class="ma-notify-list" data-list="game">
        ${players.map(function (p) { return _html_playerRow(p, false); }).join("")}
      </div>`;
  }

  // ── Favorites panel ───────────────────────────────────────────────────────────

  function _html_favsPanel() {
    const favs   = _state.data.favorites || [];
    const groups = _state.data.favGroups  || [];

    const groupBar = groups.length ? `
      <div style="display:flex; align-items:center; gap:8px; padding:10px 14px 6px;
                  background:var(--panelControlsBg);
                  border-bottom:1px solid var(--borderSubtle);">
        <label style="font-size:12px; font-weight:800; color:var(--mutedText);
                      white-space:nowrap;">Group</label>
        <select id="ma-notify-groupsel"
                style="flex:1; height:34px; padding:0 10px;
                       font-family:var(--fontFamilyBase); font-size:13px; font-weight:800;
                       border:1px solid var(--borderSubtle); border-radius:var(--controlRadius);
                       background:#fff; color:var(--ink);">
          <option value="all">All favorites</option>
          ${groups.map(function (g) {
            return `<option value="${esc(g)}"${_state.favFilter === g ? " selected" : ""}>${esc(g)}</option>`;
          }).join("")}
        </select>
      </div>` : "";

    const rows = favs.length
      ? favs.map(function (p) {
          const hidden = (_state.favFilter !== "all") &&
                         !((p.groups || []).includes(_state.favFilter));
          return _html_playerRow(p, hidden);
        }).join("")
      : `<div class="maEmptyState" style="margin:14px;">No favorites saved yet.</div>`;

    return `
      ${groupBar}
      ${_html_toolbar("favs")}
      <div class="ma-notify-list" data-list="favs">${rows}</div>`;
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────────

  function _html_toolbar(section) {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center;
                  padding:6px 14px 4px; background:var(--surfaceApp);">
        <span style="font-size:12px; font-weight:800; color:var(--mutedText);"
              data-count-for="${esc(section)}">0 selected</span>
        <button type="button" data-selall="${esc(section)}"
                style="font-size:12px; font-weight:800; color:var(--brandAccent);
                       background:none; border:none; cursor:pointer; padding:0;">
          Select all
        </button>
      </div>`;
  }

  // ── Player row ────────────────────────────────────────────────────────────────

  function _html_playerRow(player, hidden) {
    const unreachable = !player.deliveryMethod;
    const selected    = _state.selected.has(player.ghin);
    const method      = safeStr(player.deliveryMethod);

    const badgeStyle = method === "SMS"
      ? "background:#E1F5EE; color:#085041;"
      : method === "Email"
        ? "background:var(--brandPrimaryBg); color:var(--brandPrimary);"
        : "background:var(--pressedBg); color:var(--mutedText);";

    const checkStyle = selected
      ? "background:var(--brandSecondary); border-color:var(--brandSecondary); color:#fff;"
      : "background:#fff; border-color:var(--borderSubtle); color:var(--mutedText);";

    const checkIcon = selected
      ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
              stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="20 6 9 17 4 12"/>
         </svg>`
      : "";

    const rowClasses = [
      "maListRow ma-notify-row",
      selected    ? "is-selected"          : "",
      unreachable ? "ma-notify-unreachable" : "",
      hidden      ? "ma-hidden"             : "",
    ].filter(Boolean).join(" ");

    return `
      <div class="${rowClasses}"
           data-ghin="${esc(player.ghin)}"
           data-method="${esc(method)}"
           style="${unreachable ? "opacity:.4; cursor:default;" : ""}">
        <div style="width:22px; height:22px; border-radius:7px; border:1px solid;
                    flex-shrink:0; display:flex; align-items:center; justify-content:center;
                    ${checkStyle}">
          ${checkIcon}
        </div>
        <div style="width:32px; height:32px; border-radius:50%;
                    background:var(--pressedBg); border:1px solid var(--borderSubtle);
                    flex-shrink:0; display:flex; align-items:center; justify-content:center;
                    font-size:11px; font-weight:900; color:var(--mutedText);">
          ${esc(initials(player.name))}
        </div>
        <div style="flex:1; min-width:0;">
          <div class="maListRow__col">${esc(player.name)}</div>
          <div class="maListRow__col maListRow__col--muted"
               style="font-size:11px;">${formatContactLine(player)}</div>
        </div>
        <span class="maPill" style="flex-shrink:0; min-height:22px; padding:0 8px;
                                    font-size:10px; font-weight:800; ${badgeStyle}">
          ${esc(method || "\u2014")}
        </span>
      </div>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Tab switching — updates button styles AND toggles panel visibility
    overlay.querySelectorAll(".ma-notify-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        _state.activeTab = tab.dataset.tab;
        overlay.querySelectorAll(".ma-notify-tab").forEach(function (t) {
          const on = t.dataset.tab === _state.activeTab;
          t.style.borderBottomColor = on ? "var(--brandAccent)" : "transparent";
          t.style.color             = on ? "var(--brandAccent)" : "var(--mutedText)";
        });
        overlay.querySelectorAll(".ma-notify-panel").forEach(function (p) {
          p.classList.toggle("is-active", p.dataset.panel === _state.activeTab);
        });
        _updateCounts();
      });
    });

    // Separator radio buttons — wired at top level so they work immediately on open
    overlay.querySelectorAll("input[name='ma-notify-sep']").forEach(function (radio) {
      radio.addEventListener("change", function () {
        _state.outlookMode = (radio.value === ";");
      });
    });

    // Row selection + select-all (event delegation)
    overlay.addEventListener("click", function (e) {
      const selAllBtn = e.target.closest("[data-selall]");
      if (selAllBtn) {
        _handleSelectAll(selAllBtn.dataset.selall);
        return;
      }
      const row = e.target.closest(".ma-notify-row");
      if (row && !row.classList.contains("ma-notify-unreachable")) {
        _toggleRow(row);
      }
    });

    // Group filter dropdown
    const groupSel = overlay.querySelector("#ma-notify-groupsel");
    if (groupSel) {
      groupSel.addEventListener("change", function () {
        _state.favFilter = groupSel.value;
        _applyGroupFilter();
        _updateFooter();
      });
    }

    // Send button
    const btnEmail = overlay.querySelector("#ma-notify-btn-email");
    if (btnEmail) btnEmail.addEventListener("click", function () { _send(); });
  }

  function _toggleRow(row) {
    const ghin = row.dataset.ghin;
    if (_state.selected.has(ghin)) {
      _state.selected.delete(ghin);
    } else {
      _state.selected.add(ghin);
    }
    _refreshRow(row, ghin);
    _updateFooter();
  }

  function _handleSelectAll(listKey) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const list = overlay.querySelector(`[data-list="${listKey}"]`);
    if (!list) return;
    const rows   = list.querySelectorAll(".ma-notify-row:not(.ma-notify-unreachable):not(.ma-hidden)");
    const allSel = Array.from(rows).every(function (r) { return _state.selected.has(r.dataset.ghin); });
    rows.forEach(function (r) {
      const ghin = r.dataset.ghin;
      if (allSel) { _state.selected.delete(ghin); } else { _state.selected.add(ghin); }
      _refreshRow(r, ghin);
    });
    _updateFooter();
  }

  function _applyGroupFilter() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const list = overlay.querySelector("[data-list='favs']");
    if (!list) return;
    list.querySelectorAll(".ma-notify-row").forEach(function (row) {
      const ghin   = row.dataset.ghin;
      const fav    = (_state.data.favorites || []).find(function (f) { return f.ghin === ghin; });
      const groups = fav ? (fav.groups || []) : [];
      const hide   = (_state.favFilter !== "all") && !groups.includes(_state.favFilter);
      row.classList.toggle("ma-hidden", hide);
      if (hide && _state.selected.has(ghin)) {
        _state.selected.delete(ghin);
        _refreshRow(row, ghin);
      }
    });
  }

  function _refreshRow(row, ghin) {
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];
    const player = allPlayers.find(function (p) { return p.ghin === ghin; });
    if (!player) return;
    const hidden = row.classList.contains("ma-hidden");
    row.outerHTML = _html_playerRow(player, hidden);
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  function _updateFooter() {
    _updateCounts();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    let total = 0;
    _state.selected.forEach(function (ghin) {
      const p = allPlayers.find(function (x) { return x.ghin === ghin; });
      if (p && p.deliveryMethod) total++;
    });

    const btnEmail = overlay.querySelector("#ma-notify-btn-email");
    if (btnEmail) btnEmail.disabled = (total === 0);
  }

  function _updateCounts() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ["game", "favs"].forEach(function (key) {
      const el   = overlay.querySelector(`[data-count-for="${key}"]`);
      const list = overlay.querySelector(`[data-list="${key}"]`);
      if (!el || !list) return;
      const n = list.querySelectorAll(".ma-notify-row.is-selected:not(.ma-hidden)").length;
      el.textContent = n + " selected";
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────────

  function _send() {
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    const seen       = new Set();
    const recipients = [];

    _state.selected.forEach(function (ghin) {
      const p = allPlayers.find(function (x) { return x.ghin === ghin; });
      if (!p || !p.deliveryEmail || !p.deliveryMethod) return;
      if (seen.has(p.deliveryEmail)) return;
      seen.add(p.deliveryEmail);
      recipients.push({ name: p.name, email: p.deliveryEmail });
    });

    if (!recipients.length) return;

    // Build subject and body
    let subject = "";
    let body    = "";
    const game    = _state.data.game;
    const siteUrl = safeStr(_state.data.siteUrl) || "https://www.matchaid.org";

    if (game) {
      const venue = game.facilityName || game.courseName || "";
      const when  = formatDateShort(game.playDate, game.playTime);
      subject     = [game.title, venue, when].filter(Boolean).join(" \u2014 ");
      body        = siteUrl + "/game/" + game.ggid;
    } else {
      body        = "Attention players;";
    }

    if (MA.email && typeof MA.email.compose === "function") {
      MA.email.compose({
        bcc:                recipients,
        subject:            subject,
        body:               body,
        bodyIsHtml:         false,
        recipientSeparator: _state.outlookMode ? ";" : ",",
      });
      MA.notify.close();
    } else {
      console.error("[MA.notify] MA.email.compose not available.");
    }
  }

  // ── Minimal scoped CSS ────────────────────────────────────────────────────────
  // Only structural rules not provided by ma_shared.css

  (function _injectStyles() {
    if (document.getElementById("ma-notify-styles")) return;
    const s = document.createElement("style");
    s.id = "ma-notify-styles";
    s.textContent = [
      ".ma-notify-panel { display:none; }",
      ".ma-notify-panel.is-active { display:block; }",
      ".ma-hidden { display:none !important; }",
      ".ma-notify-list { background:#fff; border-top:1px solid var(--borderSubtle); border-bottom:1px solid var(--borderSubtle); }",
      ".ma-notify-row { border-bottom:1px solid var(--borderSubtle); }",
      ".ma-notify-row:last-child { border-bottom:none; }",
    ].join("\n");
    document.head.appendChild(s);
  })();

  window.MA = MA;
})();