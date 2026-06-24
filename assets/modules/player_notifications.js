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
 * Modal structure (all regions use ma_shared.css):
 *   maModal__hdr      — locked: title + close button
 *   maModal__controls — locked: tabs + group filter + toolbar
 *   maModal__body     — scrolls: player list only
 *   maModal__ftr      — locked: separator options + send button
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.notify = MA.notify || {};

  const OVERLAY_ID = "maNotifyOverlay";

  // ── Icons ─────────────────────────────────────────────────────────────────
  const ICON_EMAIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';
  const ICON_SMS   = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const ICON_RESET = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  const ICON_CHEVDOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const ICON_CHEVUP   = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>';

  // ── State ─────────────────────────────────────────────────────────────────
  let _state = {
    opts:         {},
    data:         null,
    activeTab:    "game",
    selected:     new Set(),
    activeMethod: {},           // ghin → "email"|"sms"
    favFilter:    "all",
    outlookMode:  false,
    ddOpen:       false,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function safeStr(v) { return String(v ?? "").trim(); }

  function formatPhone(raw) {
    const d = safeStr(raw).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") return "(" + d.slice(1,4) + ") " + d.slice(4,7) + "-" + d.slice(7);
    if (d.length === 10)                  return "(" + d.slice(0,3) + ") " + d.slice(3,6) + "-" + d.slice(6);
    return raw;
  }

  function formatContactLine(player) {
    const email = safeStr(player.email);
    const phone = safeStr(player.mobile) ? formatPhone(safeStr(player.mobile)) : "";
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
    const dow  = dt.toLocaleDateString("en-US", { weekday: "short" });
    const mmdd = String(m).padStart(2,"0") + "/" + String(day).padStart(2,"0");
    const t    = safeStr(timeStr);
    if (!t) return dow + " " + mmdd;
    const parts = t.split(":");
    let h = parseInt(parts[0], 10);
    const min = parts[1] || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return dow + " " + mmdd + " at " + h + ":" + min + " " + ampm;
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

  // ── Contact resolution ────────────────────────────────────────────────────

  function preferredMethodFor(player) {
    if (!player.deliveryMethod) return null;
    return player.deliveryMethod === "SMS" ? "sms" : "email";
  }

  function activeMethodFor(ghin, player) {
    return _state.activeMethod[ghin] || preferredMethodFor(player);
  }

  function resolveDeliveryAddress(ghin, player) {
    const method = activeMethodFor(ghin, player);
    if (method === "sms")   return safeStr(player.deliverySmsAddress);
    if (method === "email") return safeStr(player.deliveryEmailAddress || player.email);
    return safeStr(player.deliveryEmail);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  MA.notify.open = async function (options) {
    const opts        = options || {};
    _state.opts       = opts;
    _state.selected   = new Set();
    _state.activeMethod = {};
    _state.favFilter  = "all";
    _state.outlookMode = false;
    _state.ddOpen     = false;

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

      _state.data     = data;
      _state.activeTab = data.hasGameContext ? "game" : "favs";

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
    _state.ddOpen       = false;
    document.documentElement.classList.remove("maOverlayOpen");
    if (typeof _state.opts.onClose === "function") _state.opts.onClose();
  };

  // ── DOM helpers ───────────────────────────────────────────────────────────

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

  function _allPlayers() {
    return [
      ...(_state.data?.gamePlayers || []),
      ...(_state.data?.favorites   || []),
    ];
  }

  // ── Skeleton / error ──────────────────────────────────────────────────────

  function _html_skeleton() {
    return _html_hdr("Send message", "") +
      `<div class="maModal__body"><div class="maEmptyState">Loading recipients&hellip;</div></div>`;
  }

  function _html_error(msg) {
    return _html_hdr("Send message", "") +
      `<div class="maModal__body"><div class="maEmptyState" style="color:var(--danger);">${esc(msg)}</div></div>`;
  }

  // ── Header ────────────────────────────────────────────────────────────────

  function _html_hdr(title, subtitle) {
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles" style="min-width:0; overflow:hidden; flex:1 1 auto;">
          <div class="maModal__title">${esc(title)}</div>
          ${subtitle ? `<div class="maModal__subtitle">${esc(subtitle)}</div>` : ""}
        </div>
        <button type="button" class="iconBtn btnPrimary"
                onclick="MA.notify.close()" aria-label="Close">
          ${ICON_CLOSE}
        </button>
      </header>`;
  }

  // ── Full panel ────────────────────────────────────────────────────────────

  function _html_panel() {
    const d       = _state.data;
    const game    = d.game;
    const hasGame = d.hasGameContext;

    let subtitle = "Your favorites";
    if (hasGame && game) {
      const when = formatDateShort(game.playDate, game.playTime);
      subtitle   = [game.title, when].filter(Boolean).join(" \u2022 ");
    }

    // ── maModal__controls — LOCKED (tabs + group filter + toolbar) ─────────
    const tabBar = hasGame ? `
      <div style="display:flex; border-bottom:1px solid var(--borderSubtle);">
        ${_html_tabBtn("game", "Game players")}
        ${_html_tabBtn("favs", "Favorites")}
      </div>` : "";

    const favsControls = _html_favsControls();
    const gameControls = _html_gameControls();

    // ── maModal__body — SCROLLS (player list only) ─────────────────────────
    const favsActive  = _state.activeTab === "favs" || !hasGame;
    const gamePanel   = hasGame
      ? `<div class="ma-notify-panel${_state.activeTab === "game" ? " is-active" : ""}" data-panel="game">
           <div class="ma-notify-list" data-list="game">
             ${(_state.data.gamePlayers || []).map(p => _html_playerRow(p, false)).join("")}
           </div>
         </div>`
      : "";

    const favsPanel = `
      <div class="ma-notify-panel${favsActive ? " is-active" : ""}" data-panel="favs">
        <div class="ma-notify-list" data-list="favs">
          ${_html_favRows()}
        </div>
      </div>`;

    return `
      ${_html_hdr("Send message", subtitle)}

      <div class="maModal__controls" style="padding:0;">
        ${tabBar}
        <div id="ma-notify-tab-controls">
          ${hasGame
            ? `<div class="ma-notify-tab-ctrl${_state.activeTab === "game" ? " is-active" : ""}" data-ctrl="game">${gameControls}</div>
               <div class="ma-notify-tab-ctrl${favsActive ? " is-active" : ""}" data-ctrl="favs">${favsControls}</div>`
            : favsControls
          }
        </div>
      </div>

      <div class="maModal__body" style="padding:0; background:var(--surfaceApp);">
        ${gamePanel}
        ${favsPanel}
      </div>

      ${_html_footer()}`;
  }

  // ── Tab button ────────────────────────────────────────────────────────────

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

  // ── Controls (group filter + toolbar) — rendered per tab ─────────────────

  function _html_gameControls() {
    return _html_toolbar("game");
  }

  function _html_favsControls() {
    const groups   = _state.data?.favGroups || [];
    const groupBar = groups.length ? `
      <div style="display:flex; align-items:center; gap:8px; padding:8px 14px 4px;
                  background:var(--panelControlsBg);
                  border-bottom:1px solid var(--borderSubtle);">
        <label style="font-size:12px; font-weight:800; color:var(--mutedText);
                      white-space:nowrap;" for="ma-notify-groupsel">Group</label>
        <select id="ma-notify-groupsel"
                style="flex:1; height:34px; padding:0 10px;
                       font-family:var(--fontFamilyBase); font-size:13px; font-weight:800;
                       border:1px solid var(--borderSubtle); border-radius:var(--controlRadius);
                       background:var(--bg); color:var(--ink);">
          <option value="all">All favorites</option>
          ${groups.map(g =>
            `<option value="${esc(g)}"${_state.favFilter === g ? " selected" : ""}>${esc(g)}</option>`
          ).join("")}
        </select>
      </div>` : "";
    return groupBar + _html_toolbar("favs");
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────

  function _html_toolbar(section) {
    return `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 14px 4px;
                  background:var(--surfaceApp); border-bottom:1px solid var(--borderSubtle);">
        <button type="button" class="ma-notify-selall" data-selall="${esc(section)}"
                aria-label="Select all"
                style="width:22px; height:22px; border-radius:var(--radiusSq);
                       border:1px solid var(--brandAccent); background:var(--bg);
                       display:flex; align-items:center; justify-content:center;
                       cursor:pointer; padding:0; flex-shrink:0; color:var(--brandAccent);">
          <svg class="ma-selall-icon" data-for="${esc(section)}" viewBox="0 0 24 24"
               width="14" height="14" fill="none" stroke="var(--brandAccent)"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        </button>
        <span style="font-size:12px; font-weight:800; color:var(--mutedText); flex:1;"
              data-count-for="${esc(section)}">0 selected</span>
        <button type="button" class="ma-notify-reset" data-reset="${esc(section)}"
                title="Reset to preferred" aria-label="Reset to preferred"
                style="background:none; border:none; cursor:pointer; padding:4px;
                       color:var(--mutedText); display:flex; align-items:center;
                       border-radius:var(--radiusSq);">
          ${ICON_RESET}
        </button>
      </div>`;
  }

  // ── Favorites rows ────────────────────────────────────────────────────────

  function _html_favRows() {
    const favs = _state.data?.favorites || [];
    if (!favs.length) {
      return `<div class="maEmptyState" style="margin:14px;">No favorites saved yet.</div>`;
    }
    return favs.map(function (p) {
      const hidden = (_state.favFilter !== "all") &&
                     !((p.groups || []).includes(_state.favFilter));
      return _html_playerRow(p, hidden);
    }).join("");
  }

  // ── Player row ────────────────────────────────────────────────────────────

  function _html_playerRow(player, hidden) {
    const unreachable = !player.deliveryMethod;
    const selected    = _state.selected.has(player.ghin);
    const ghin        = safeStr(player.ghin);

    const checkStyle = selected
      ? `background:var(--brandAccent); border-color:var(--brandAccent);`
      : `background:var(--bg); border-color:var(--brandAccent);`;

    const rowClasses = [
      "ma-notify-row",
      unreachable ? "ma-notify-unreachable" : "",
      hidden      ? "ma-hidden"             : "",
    ].filter(Boolean).join(" ");

    return `
      <div class="${rowClasses}" data-ghin="${esc(ghin)}"
           style="${unreachable ? "opacity:.4; cursor:default;" : ""}">
        <div class="ma-notify-check" style="${checkStyle}">
          ${selected ? ICON_CHECK : ""}
        </div>
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
          <div style="font-size:13px; font-weight:800; color:var(--ink);
                      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${esc(player.name)}
          </div>
          <div style="font-size:11px; font-weight:800; color:var(--mutedText);
                      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${formatContactLine(player)}
          </div>
        </div>
        <div class="ma-notify-badges" data-ghin="${esc(ghin)}">
          ${selected ? _html_badges(ghin, player) : ""}
        </div>
      </div>`;
  }

  // ── Badges ────────────────────────────────────────────────────────────────

  function _html_badges(ghin, player) {
    const hasEmail  = !!safeStr(player.deliveryEmailAddress || player.email);
    const hasSms    = !!safeStr(player.deliverySmsAddress);
    const current   = activeMethodFor(ghin, player);
    if (!hasEmail && !hasSms) return "";

    let html = "";

    if (hasEmail) {
      const isActive  = current === "email";
      const canSwitch = hasSms && !isActive;
      const tag       = canSwitch ? "button" : "span";
      const style     = isActive
        ? "background:var(--brandColor3); color:#fff; border-color:color-mix(in srgb,var(--brandColor3) 70%,black);"
        : "background:var(--pressedBg); color:var(--mutedText); border-color:var(--borderSubtle);";
      html += `<${tag} type="button" class="ma-notify-badge${canSwitch ? " ma-notify-badge--alt" : ""}"
        data-ghin="${esc(ghin)}" data-method="email"
        title="Email" aria-label="Email"
        style="${style} ${canSwitch ? "cursor:pointer;" : "cursor:default;"}">
        ${ICON_EMAIL}
      </${tag}>`;
    }

    if (hasSms) {
      const isActive  = current === "sms";
      const canSwitch = hasEmail && !isActive;
      const tag       = canSwitch ? "button" : "span";
      const style     = isActive
        ? "background:var(--brandColor3); color:#fff; border-color:color-mix(in srgb,var(--brandColor3) 70%,black);"
        : "background:var(--pressedBg); color:var(--mutedText); border-color:var(--borderSubtle);";
      html += `<${tag} type="button" class="ma-notify-badge${canSwitch ? " ma-notify-badge--alt" : ""}"
        data-ghin="${esc(ghin)}" data-method="sms"
        title="SMS" aria-label="SMS"
        style="${style} ${canSwitch ? "cursor:pointer;" : "cursor:default;"}">
        ${ICON_SMS}
      </${tag}>`;
    }

    return html;
  }

  // ── Badge refresh ─────────────────────────────────────────────────────────

  function _refreshBadges(ghin) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const player  = _allPlayers().find(p => p.ghin === ghin);
    if (!player) return;
    const div = overlay.querySelector(`.ma-notify-badges[data-ghin="${ghin}"]`);
    if (!div) return;
    div.innerHTML = _state.selected.has(ghin) ? _html_badges(ghin, player) : "";
  }

  // ── Row refresh ───────────────────────────────────────────────────────────

  function _refreshRow(row, ghin) {
    const player = _allPlayers().find(p => p.ghin === ghin);
    if (!player) return;
    const hidden = row.classList.contains("ma-hidden");
    const tmp    = document.createElement("div");
    tmp.innerHTML = _html_playerRow(player, hidden);
    row.replaceWith(tmp.firstElementChild);
  }

  // ── Footer ────────────────────────────────────────────────────────────────

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
              <input type="radio" id="ma-notify-sep-comma" name="ma-notify-sep" value=","
                     checked style="width:16px; height:16px; accent-color:var(--brandAccent); cursor:pointer;">
              Commas
              <span style="font-weight:800; color:var(--mutedText); font-size:11px;">
                Gmail, Apple Mail, most clients
              </span>
            </label>
            <label style="display:flex; align-items:center; gap:8px;
                          font-size:12px; font-weight:800; color:var(--ink); cursor:pointer;">
              <input type="radio" id="ma-notify-sep-semi" name="ma-notify-sep" value=";"
                     style="width:16px; height:16px; accent-color:var(--brandAccent); cursor:pointer;">
              Semicolons
              <span style="font-weight:800; color:var(--mutedText); font-size:11px;">
                Outlook
              </span>
            </label>
          </div>

          <div style="position:relative; flex-shrink:0;" id="ma-notify-sendbtn-wrap">
            <div style="display:flex; border-radius:var(--btnRadius); overflow:hidden;
                        border:1px solid color-mix(in srgb,var(--btnSecondaryBg) 70%,black);">
              <button type="button" id="ma-notify-btn-send"
                      style="background:var(--btnSecondaryBg); color:var(--btnSecondaryText);
                             border:none;
                             border-right:1px solid color-mix(in srgb,var(--btnSecondaryBg) 70%,black);
                             padding:8px 14px; font-size:var(--fieldValueSize); font-weight:var(--btnFontWeight);
                             font-family:var(--fontFamilyBase); cursor:pointer; white-space:nowrap;"
                      disabled>
                Send
              </button>
              <button type="button" id="ma-notify-btn-arrow"
                      style="background:var(--btnSecondaryBg); color:var(--btnSecondaryText);
                             border:none; padding:8px 10px; font-size:13px;
                             cursor:pointer; display:flex; align-items:center;"
                      aria-label="Choose send method" id="ma-notify-arrow-btn">
                <span id="ma-notify-arrow-icon">${ICON_CHEVDOWN}</span>
              </button>
            </div>

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
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                     stroke="var(--brandAccent)" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Send
              </button>
              <button type="button" class="ma-notify-dd-item" data-sendmethod="email"
                      style="display:flex; align-items:center; gap:8px; width:100%;
                             padding:10px 14px; border:none; border-bottom:1px solid var(--borderSubtle);
                             background:transparent; font-family:var(--fontFamilyBase);
                             font-size:13px; font-weight:800; color:var(--ink); cursor:pointer; text-align:left;">
                ${ICON_EMAIL}
                Send as email
              </button>
              <button type="button" class="ma-notify-dd-item" data-sendmethod="sms"
                      style="display:flex; align-items:center; gap:8px; width:100%;
                             padding:10px 14px; border:none;
                             background:transparent; font-family:var(--fontFamilyBase);
                             font-size:13px; font-weight:800; color:var(--ink); cursor:pointer; text-align:left;">
                ${ICON_SMS}
                Send as SMS
              </button>
            </div>
          </div>
        </div>
      </footer>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    // Tabs
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
        overlay.querySelectorAll(".ma-notify-tab-ctrl").forEach(function (c) {
          c.classList.toggle("is-active", c.dataset.ctrl === _state.activeTab);
        });
        _updateCounts();
      });
    });

    // Separator radios
    overlay.querySelectorAll("input[name='ma-notify-sep']").forEach(function (radio) {
      radio.addEventListener("change", function () {
        _state.outlookMode = (radio.value === ";");
      });
    });

    // Delegation — badge clicks caught first, then row toggle
    overlay.addEventListener("click", function (e) {
      // Badge click — must intercept before row toggle
      const badge = e.target.closest(".ma-notify-badge--alt");
      if (badge) {
        e.stopPropagation();
        const ghin   = badge.dataset.ghin;
        const method = badge.dataset.method;
        if (ghin && method) {
          _state.activeMethod[ghin] = method;
          _refreshBadges(ghin);
        }
        return;
      }

      // Select all
      const selAllBtn = e.target.closest("[data-selall]");
      if (selAllBtn) { _handleSelectAll(selAllBtn.dataset.selall); return; }

      // Reset
      const resetBtn = e.target.closest("[data-reset]");
      if (resetBtn) { _handleReset(); return; }

      // Row toggle
      const row = e.target.closest(".ma-notify-row");
      if (row && !row.classList.contains("ma-notify-unreachable")) {
        _toggleRow(row);
      }
    });

    // Group filter
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
    const btnArrow  = overlay.querySelector("#ma-notify-btn-arrow");
    const dropdown  = overlay.querySelector("#ma-notify-dropdown");
    const arrowIcon = overlay.querySelector("#ma-notify-arrow-icon");

    if (btnArrow && dropdown) {
      btnArrow.addEventListener("click", function (e) {
        e.stopPropagation();
        _state.ddOpen = !_state.ddOpen;
        dropdown.style.display = _state.ddOpen ? "block" : "none";
        if (arrowIcon) arrowIcon.innerHTML = _state.ddOpen ? ICON_CHEVUP : ICON_CHEVDOWN;
      });
    }

    document.addEventListener("click", function _ddClose(e) {
      if (!_state.ddOpen) return;
      const wrap = document.getElementById("ma-notify-sendbtn-wrap");
      if (wrap && wrap.contains(e.target)) return;
      _state.ddOpen = false;
      if (dropdown) dropdown.style.display = "none";
      if (arrowIcon) arrowIcon.innerHTML = ICON_CHEVDOWN;
    });

    // Dropdown items
    overlay.querySelectorAll(".ma-notify-dd-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        const method = item.dataset.sendmethod;
        _state.ddOpen = false;
        if (dropdown) dropdown.style.display = "none";
        if (arrowIcon) arrowIcon.innerHTML = ICON_CHEVDOWN;
        _send(method);
      });
    });
  }

  // ── Row / selection helpers ───────────────────────────────────────────────

  function _toggleRow(row) {
    const ghin   = row.dataset.ghin;
    const player = _allPlayers().find(p => p.ghin === ghin);

    if (_state.selected.has(ghin)) {
      _state.selected.delete(ghin);
      delete _state.activeMethod[ghin];
    } else {
      _state.selected.add(ghin);
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
    const allSel = Array.from(rows).every(r => _state.selected.has(r.dataset.ghin));

    rows.forEach(function (r) {
      const ghin   = r.dataset.ghin;
      const player = _allPlayers().find(p => p.ghin === ghin);
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

    // Update select-all button appearance
    const btn = overlay.querySelector(`[data-selall="${listKey}"]`);
    const icon = btn?.querySelector("svg");
    if (btn && icon) {
      if (!allSel) {
        btn.style.background = "var(--brandAccent)";
        icon.innerHTML = `<polyline points="20 6 9 17 4 12" stroke="#fff" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"/>`;
        icon.setAttribute("stroke", "none");
      } else {
        btn.style.background = "var(--bg)";
        icon.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2"/>`;
        icon.setAttribute("stroke", "var(--brandAccent)");
      }
    }

    _updateFooter();
  }

  function _handleReset() {
    _allPlayers().forEach(function (player) {
      if (_state.selected.has(player.ghin)) {
        _state.activeMethod[player.ghin] = preferredMethodFor(player);
        _refreshBadges(player.ghin);
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
      const fav    = (_state.data.favorites || []).find(f => f.ghin === ghin);
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

  function _updateFooter() {
    _updateCounts();
    const overlay  = document.getElementById(OVERLAY_ID);
    const btnSend  = overlay?.querySelector("#ma-notify-btn-send");
    if (btnSend) btnSend.disabled = (_state.selected.size === 0);
  }

  function _updateCounts() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ["game", "favs"].forEach(function (key) {
      const el   = overlay.querySelector(`[data-count-for="${key}"]`);
      const list = overlay.querySelector(`[data-list="${key}"]`);
      if (!el || !list) return;
      const n = list.querySelectorAll(".ma-notify-row:not(.ma-hidden)").length
        ? Array.from(list.querySelectorAll(".ma-notify-row:not(.ma-hidden)"))
            .filter(r => _state.selected.has(r.dataset.ghin)).length
        : 0;
      el.textContent = n + " selected";
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  function _send(method) {
    const seen       = new Set();
    const recipients = [];

    _state.selected.forEach(function (ghin) {
      const p = _allPlayers().find(x => x.ghin === ghin);
      if (!p || !p.deliveryMethod) return;

      let addr = "";
      if (method === "email") {
        addr = safeStr(p.deliveryEmailAddress || p.email) || safeStr(p.deliverySmsAddress);
      } else if (method === "sms") {
        addr = safeStr(p.deliverySmsAddress) || safeStr(p.deliveryEmailAddress || p.email);
      } else {
        addr = resolveDeliveryAddress(ghin, p);
      }

      if (!addr || seen.has(addr)) return;
      seen.add(addr);
      recipients.push({ name: p.name, email: addr });
    });

    if (!recipients.length) return;

    const game    = _state.data.game;
    const siteUrl = safeStr(_state.data.siteUrl) || "https://www.matchaid.org";
    let subject   = "";
    let body      = "";

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

  // ── Scoped CSS ────────────────────────────────────────────────────────────

  (function _injectStyles() {
    if (document.getElementById("ma-notify-styles")) return;
    const s = document.createElement("style");
    s.id = "ma-notify-styles";
    s.textContent = [
      ".ma-notify-panel { display:none; }",
      ".ma-notify-panel.is-active { display:block; }",
      ".ma-notify-tab-ctrl { display:none; }",
      ".ma-notify-tab-ctrl.is-active { display:block; }",
      ".ma-hidden { display:none !important; }",
      ".ma-notify-list { background:var(--bg); }",
      ".ma-notify-row { display:flex; align-items:center; gap:10px; padding:10px 14px;",
      "  border-bottom:1px solid var(--borderSubtle); cursor:pointer; min-height:52px;",
      "  background:var(--bg); box-sizing:border-box; }",
      ".ma-notify-row:last-child { border-bottom:none; }",
      ".ma-notify-unreachable { opacity:.4; cursor:default !important; }",
      ".ma-notify-check { width:22px; height:22px; border-radius:var(--radiusSq);",
      "  border:1px solid var(--brandAccent); flex:0 0 22px;",
      "  display:flex; align-items:center; justify-content:center; flex-shrink:0; }",
      ".ma-notify-badges { flex:0 0 auto; display:flex; gap:4px;",
      "  align-items:center; justify-content:flex-end; }",
      ".ma-notify-badge { width:36px; height:36px; border-radius:var(--radiusSq);",
      "  border:1px solid; display:inline-flex; align-items:center;",
      "  justify-content:center; box-sizing:border-box; flex-shrink:0;",
      "  -webkit-tap-highlight-color:transparent; }",
      ".ma-notify-badge--alt:active { transform:scale(.94); }",
      ".ma-notify-reset:hover { color:var(--ink); }",
      ".ma-notify-dd-item:hover { background:var(--pressedBg); }",
    ].join("\n");
    document.head.appendChild(s);
  })();

  window.MA = MA;
})();