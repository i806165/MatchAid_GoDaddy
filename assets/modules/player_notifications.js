/* /assets/modules/player_notifications.js
 *
 * MA.notify — Player notification address selector module.
 *
 * Presents a two-tab UI (Game Players / Favorites) allowing the caller
 * to select recipients and launch a mailto: or SMS-gateway email via
 * the existing MA.email.compose() module.
 *
 * Markup uses ma_shared.css classes exclusively.
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
    selected:    new Set(),       // GHINs currently checked
    activeMethod:{},              // ghin → "email"|"sms" (current badge selection)
    favFilter:   "all",
    outlookMode: false,           // false = commas, true = semicolons
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

  function formatPhone(raw) {
    const d = safeStr(raw).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") return "(" + d.slice(1,4) + ") " + d.slice(4,7) + "-" + d.slice(7);
    if (d.length === 10)                  return "(" + d.slice(0,3) + ") " + d.slice(3,6) + "-" + d.slice(6);
    return raw;
  }

  function formatContactLine(player) {
    const email  = safeStr(player.email);
    const mobile = safeStr(player.mobile);
    const phone  = mobile ? formatPhone(mobile) : "";
    if (email && phone) return esc(email) + " &middot; " + esc(phone);
    if (email)          return esc(email);
    if (phone)          return esc(phone);
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

  // ── Preferred method resolution ───────────────────────────────────────────────
  // Returns "email" | "sms" | null for a player object.
  // Mirrors the server-side $resolveContact logic for display purposes.

  function preferredMethodFor(player) {
    if (!player.deliveryMethod) return null;
    return player.deliveryMethod === "SMS" ? "sms" : "email";
  }

  // Active method for a player — uses override if set, else preferred
  function activeMethodFor(ghin, player) {
    if (_state.activeMethod[ghin]) return _state.activeMethod[ghin];
    return preferredMethodFor(player);
  }

  // Delivery address to use based on active method
  function resolveDeliveryAddress(ghin, player) {
    const method = activeMethodFor(ghin, player);
    if (method === "sms")   return safeStr(player.deliverySmsAddress);
    if (method === "email") return safeStr(player.deliveryEmailAddress);
    return safeStr(player.deliveryEmail); // fallback to original field
  }

  // ── Public: open ─────────────────────────────────────────────────────────────

  MA.notify.open = async function (options) {
    const opts       = options || {};
    _state.opts      = opts;
    _state.selected  = new Set();
    _state.activeMethod = {};
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
          if (p.deliveryMethod !== null) {
            _state.selected.add(p.ghin);
            _state.activeMethod[p.ghin] = preferredMethodFor(p);
          }
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
    _state.data         = null;
    _state.selected     = new Set();
    _state.activeMethod = {};
    _state.outlookMode  = false;
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
    overlay.style.boxSizing = "border-box";
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Send message"
               style="box-sizing:border-box; max-width:calc(100vw - 32px); overflow:visible;">
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
      const when = formatDateShort(game.playDate, game.playTime);
      subtitle   = [game.title, when].filter(Boolean).join(" \u2022 ");
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
      ${_html_footer()}`;
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

  // ── Toolbar ───────────────────────────────────────────────────────────────────

  function _html_toolbar(section) {
    return `
      <div style="display:flex; align-items:center; gap:8px;
                  padding:6px 14px 4px; background:var(--surfaceApp);
                  border-bottom:1px solid var(--borderSubtle);">
        <button type="button" class="ma-notify-selall" data-selall="${esc(section)}"
                style="width:22px; height:22px; border-radius:var(--radiusSq);
                       border:1px solid var(--borderSubtle); background:var(--bg);
                       display:flex; align-items:center; justify-content:center;
                       cursor:pointer; padding:0; flex-shrink:0; color:var(--mutedText);"
                aria-label="Select all">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
               class="ma-selall-icon" data-for="${esc(section)}">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        </button>
        <span style="font-size:12px; font-weight:800; color:var(--mutedText); flex:1;"
              data-count-for="${esc(section)}">0 selected</span>
        <button type="button" class="ma-notify-reset" data-reset="${esc(section)}"
                title="Reset to preferred"
                style="background:none; border:none; cursor:pointer; padding:2px;
                       color:var(--mutedText); display:flex; align-items:center;
                       border-radius:var(--radiusSq);"
                aria-label="Reset to preferred">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>`;
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

  // ── Player row ────────────────────────────────────────────────────────────────

  function _html_playerRow(player, hidden) {
    const unreachable = !player.deliveryMethod;
    const selected    = _state.selected.has(player.ghin);
    const ghin        = safeStr(player.ghin);

    const checkStyle = selected
      ? "background:var(--brandSecondary); border-color:var(--brandSecondary); color:#fff;"
      : "background:var(--bg); border-color:var(--borderSubtle); color:var(--mutedText);";

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

    // Badges only render when row is checked
    const badgesHtml = selected ? _html_badges(ghin, player) : "";

    return `
      <div class="${rowClasses}"
           data-ghin="${esc(ghin)}"
           style="${unreachable ? "opacity:.4; cursor:default;" : ""}">
        <div style="width:22px; height:22px; border-radius:var(--radiusSq); border:1px solid;
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
          <div style="font-size:13px; font-weight:800; color:var(--ink);">${esc(player.name)}</div>
          <div style="font-size:11px; color:var(--mutedText); margin-top:1px;
                      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${formatContactLine(player)}
          </div>
        </div>
        <div class="ma-notify-badges" data-ghin="${esc(ghin)}"
             style="display:flex; gap:4px; flex-shrink:0; align-items:center; min-width:80px; justify-content:flex-end;">
          ${badgesHtml}
        </div>
      </div>`;
  }

  // ── Badge rendering ───────────────────────────────────────────────────────────

  function _html_badges(ghin, player) {
    const hasEmail  = !!safeStr(player.deliveryEmailAddress || player.email);
    const hasSms    = !!safeStr(player.deliverySmsAddress);
    const current   = activeMethodFor(ghin, player);

    if (!hasEmail && !hasSms) return "";

    let html = "";

    if (hasEmail) {
      const isPref    = current === "email";
      const clickable = hasSms && !isPref;
      const bg        = isPref
        ? "background:var(--brandPrimaryBg); color:var(--brandPrimary); border-color:color-mix(in srgb,var(--brandPrimary) 30%,transparent);"
        : "background:transparent; color:var(--mutedText); border-color:var(--borderSubtle);";
      const tag = clickable ? "button" : "span";
      html += `<${tag} type="button" class="maPill ma-notify-badge${clickable ? " ma-notify-badge--alt" : ""}"
        data-ghin="${esc(ghin)}" data-method="email"
        style="font-size:10px; font-weight:800; padding:2px 8px; min-height:auto;
               border-radius:var(--pillRadius); border:1px solid; cursor:${clickable ? "pointer" : "default"};
               font-family:var(--fontFamilyBase); ${bg}">
        Email
      </${tag}>`;
    }

    if (hasSms) {
      const isPref    = current === "sms";
      const clickable = hasEmail && !isPref;
      const bg        = isPref
        ? "background:#E1F5EE; color:#07432A; border-color:#9FE1CB;"
        : "background:transparent; color:var(--mutedText); border-color:var(--borderSubtle);";
      const tag = clickable ? "button" : "span";
      html += `<${tag} type="button" class="maPill ma-notify-badge${clickable ? " ma-notify-badge--alt" : ""}"
        data-ghin="${esc(ghin)}" data-method="sms"
        style="font-size:10px; font-weight:800; padding:2px 8px; min-height:auto;
               border-radius:var(--pillRadius); border:1px solid; cursor:${clickable ? "pointer" : "default"};
               font-family:var(--fontFamilyBase); ${bg}">
        SMS
      </${tag}>`;
    }

    return html;
  }

  // ── Refresh a single row's badges ─────────────────────────────────────────────

  function _refreshBadges(ghin) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];
    const player = allPlayers.find(function (p) { return p.ghin === ghin; });
    if (!player) return;
    const badgeDiv = overlay.querySelector(`.ma-notify-badges[data-ghin="${ghin}"]`);
    if (!badgeDiv) return;
    const selected = _state.selected.has(ghin);
    badgeDiv.innerHTML = selected ? _html_badges(ghin, player) : "";
    _wireBadgeEvents(badgeDiv);
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  function _html_footer() {
    return `
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

          <!-- Send split button -->
          <div style="position:relative; flex-shrink:0;" id="ma-notify-sendbtn-wrap">
            <div style="display:flex; border-radius:var(--controlRadius); overflow:hidden;
                        border:1px solid color-mix(in srgb,var(--brandPrimary) 70%,black);">
              <button type="button" id="ma-notify-btn-send"
                      style="background:var(--brandSecondary); color:#fff; border:none;
                             border-right:1px solid color-mix(in srgb,var(--brandPrimary) 70%,black);
                             padding:8px 14px; font-size:13px; font-weight:800;
                             font-family:var(--fontFamilyBase); cursor:pointer; white-space:nowrap;"
                      disabled>
                Send
              </button>
              <button type="button" id="ma-notify-btn-arrow"
                      style="background:var(--brandSecondary); color:#fff; border:none;
                             padding:8px 10px; font-size:13px; cursor:pointer;
                             display:flex; align-items:center;"
                      aria-label="Choose send method">
                <svg id="ma-notify-arrow-icon" viewBox="0 0 24 24" width="14" height="14"
                     fill="none" stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
            <!-- Dropdown -->
            <div id="ma-notify-dropdown"
                 style="display:none; position:absolute; bottom:calc(100% + 6px); right:0;
                        background:var(--bg); border:1px solid var(--borderSubtle);
                        border-radius:var(--radiusLg); overflow:hidden; min-width:180px;
                        z-index:10; box-shadow:0 4px 12px rgba(0,0,0,.12);">
              <button type="button" class="ma-notify-dd-item is-active" data-sendmethod="preferred"
                      style="display:flex; align-items:center; gap:8px; width:100%;
                             padding:10px 14px; border:none; border-bottom:1px solid var(--borderSubtle);
                             background:transparent; font-family:var(--fontFamilyBase);
                             font-size:13px; font-weight:800; color:var(--ink); cursor:pointer; text-align:left;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--brandSecondary)"
                     stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Send
              </button>
              <button type="button" class="ma-notify-dd-item" data-sendmethod="email"
                      style="display:flex; align-items:center; gap:8px; width:100%;
                             padding:10px 14px; border:none; border-bottom:1px solid var(--borderSubtle);
                             background:transparent; font-family:var(--fontFamilyBase);
                             font-size:13px; font-weight:800; color:var(--ink); cursor:pointer; text-align:left;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--mutedText)"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                Send as email
              </button>
              <button type="button" class="ma-notify-dd-item" data-sendmethod="sms"
                      style="display:flex; align-items:center; gap:8px; width:100%;
                             padding:10px 14px; border:none;
                             background:transparent; font-family:var(--fontFamilyBase);
                             font-size:13px; font-weight:800; color:var(--ink); cursor:pointer; text-align:left;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--mutedText)"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <path d="M12 18h.01"/>
                </svg>
                Send as SMS
              </button>
            </div>
          </div>

        </div>
      </footer>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Tab switching
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

    // Separator radio buttons
    overlay.querySelectorAll("input[name='ma-notify-sep']").forEach(function (radio) {
      radio.addEventListener("change", function () {
        _state.outlookMode = (radio.value === ";");
      });
    });

    // Row selection (event delegation — excludes badge clicks)
    overlay.addEventListener("click", function (e) {
      // Badge click — handled separately
      if (e.target.closest(".ma-notify-badge--alt")) return;

      // Select all
      const selAllBtn = e.target.closest("[data-selall]");
      if (selAllBtn) { _handleSelectAll(selAllBtn.dataset.selall); return; }

      // Reset
      const resetBtn = e.target.closest("[data-reset]");
      if (resetBtn) { _handleReset(resetBtn.dataset.reset); return; }

      // Row toggle
      const row = e.target.closest(".ma-notify-row");
      if (row && !row.classList.contains("ma-notify-unreachable")) {
        _toggleRow(row);
      }
    });

    // Wire badge clicks on all badge containers
    overlay.querySelectorAll(".ma-notify-badges").forEach(function (div) {
      _wireBadgeEvents(div);
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
    overlay.querySelector("#ma-notify-btn-send")?.addEventListener("click", function () {
      _send("preferred");
    });

    // Arrow toggle
    const btnArrow = overlay.querySelector("#ma-notify-btn-arrow");
    const dropdown = overlay.querySelector("#ma-notify-dropdown");
    if (btnArrow && dropdown) {
      btnArrow.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = dropdown.style.display !== "none";
        dropdown.style.display = open ? "none" : "block";
        const icon = overlay.querySelector("#ma-notify-arrow-icon");
        if (icon) icon.setAttribute("points", open ? "6 9 12 15 18 9" : "6 15 12 9 18 15");
      });
      document.addEventListener("click", function _ddClose() {
        if (dropdown) dropdown.style.display = "none";
        const icon = overlay.querySelector("#ma-notify-arrow-icon");
        if (icon) icon.setAttribute("points", "6 9 12 15 18 9");
      });
    }

    // Dropdown items
    overlay.querySelectorAll(".ma-notify-dd-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        const method = item.dataset.sendmethod;
        if (dropdown) dropdown.style.display = "none";
        _send(method);
      });
    });
  }

  function _wireBadgeEvents(container) {
    if (!container) return;
    container.querySelectorAll(".ma-notify-badge--alt").forEach(function (badge) {
      badge.addEventListener("click", function (e) {
        e.stopPropagation();
        const ghin   = badge.dataset.ghin;
        const method = badge.dataset.method;
        if (!ghin || !method) return;
        _state.activeMethod[ghin] = method;
        _refreshBadges(ghin);
      });
    });
  }

  function _toggleRow(row) {
    const ghin = row.dataset.ghin;
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];
    const player = allPlayers.find(function (p) { return p.ghin === ghin; });

    if (_state.selected.has(ghin)) {
      _state.selected.delete(ghin);
      delete _state.activeMethod[ghin];
    } else {
      _state.selected.add(ghin);
      // Set default active method to player's preferred on first check
      if (!_state.activeMethod[ghin] && player) {
        _state.activeMethod[ghin] = preferredMethodFor(player);
      }
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
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    rows.forEach(function (r) {
      const ghin   = r.dataset.ghin;
      const player = allPlayers.find(function (p) { return p.ghin === ghin; });
      if (allSel) {
        _state.selected.delete(ghin);
        delete _state.activeMethod[ghin];
      } else {
        _state.selected.add(ghin);
        if (!_state.activeMethod[ghin] && player) {
          _state.activeMethod[ghin] = preferredMethodFor(player);
        }
      }
      _refreshRow(r, ghin);
    });

    // Update select-all icon
    const icon = overlay.querySelector(`[data-selall="${listKey}"] svg`);
    if (icon) {
      if (!allSel) {
        icon.innerHTML = `<polyline points="20 6 9 17 4 12" stroke-width="3"/>
          <rect x="3" y="3" width="18" height="18" rx="2"/>`;
      } else {
        icon.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2"/>`;
      }
    }

    _updateFooter();
  }

  function _handleReset(listKey) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];
    _state.selected.forEach(function (ghin) {
      const player = allPlayers.find(function (p) { return p.ghin === ghin; });
      if (player) {
        _state.activeMethod[ghin] = preferredMethodFor(player);
        _refreshBadges(ghin);
      }
    });
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
        delete _state.activeMethod[ghin];
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
    const newHtml = _html_playerRow(player, hidden);
    const tmp = document.createElement("div");
    tmp.innerHTML = newHtml;
    const newRow = tmp.firstElementChild;
    row.replaceWith(newRow);
    // Wire badge events on the new row
    const badgeDiv = newRow.querySelector(".ma-notify-badges");
    if (badgeDiv) _wireBadgeEvents(badgeDiv);
  }

  // ── Footer state ──────────────────────────────────────────────────────────────

  function _updateFooter() {
    _updateCounts();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const btnSend = overlay.querySelector("#ma-notify-btn-send");
    if (btnSend) btnSend.disabled = (_state.selected.size === 0);
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

  function _send(method) {
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    const seen       = new Set();
    const recipients = [];

    _state.selected.forEach(function (ghin) {
      const p = allPlayers.find(function (x) { return x.ghin === ghin; });
      if (!p || !p.deliveryMethod) return;

      let deliveryEmail = "";

      if (method === "email") {
        // Force email — fall back to SMS gateway if no email
        deliveryEmail = safeStr(p.deliveryEmailAddress || p.email) ||
                        safeStr(p.deliverySmsAddress);
      } else if (method === "sms") {
        // Force SMS — fall back to email if no SMS
        deliveryEmail = safeStr(p.deliverySmsAddress) ||
                        safeStr(p.deliveryEmailAddress || p.email);
      } else {
        // Use active badge method
        deliveryEmail = resolveDeliveryAddress(ghin, p);
      }

      if (!deliveryEmail) return;
      if (seen.has(deliveryEmail)) return;
      seen.add(deliveryEmail);
      recipients.push({ name: p.name, email: deliveryEmail });
    });

    if (!recipients.length) return;

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
      body = "Attention players;";
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

  (function _injectStyles() {
    if (document.getElementById("ma-notify-styles")) return;
    const s = document.createElement("style");
    s.id = "ma-notify-styles";
    s.textContent = [
      ".ma-notify-panel { display:none; }",
      ".ma-notify-panel.is-active { display:block; }",
      ".ma-hidden { display:none !important; }",
      ".ma-notify-list { background:var(--bg); border-top:1px solid var(--borderSubtle); border-bottom:1px solid var(--borderSubtle); }",
      ".ma-notify-row { border-bottom:1px solid var(--borderSubtle); }",
      ".ma-notify-row:last-child { border-bottom:none; }",
      ".ma-notify-row.is-selected { background:var(--rowBgSelected); }",
      ".ma-notify-badge--alt:hover { opacity:0.75; }",
      ".ma-notify-reset:hover svg { stroke:var(--ink); }",
      ".ma-notify-dd-item:hover { background:var(--pressedBg); }",
    ].join("\n");
    document.head.appendChild(s);
  })();

  window.MA = MA;
})();