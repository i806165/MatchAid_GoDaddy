/* /assets/modules/player_notifications.js
 *
 * MA.notify — Player notification address selector module.
 *
 * Presents a two-tab UI (Game Players / Favorites) allowing the caller
 * to select recipients and launch a mailto: or SMS-gateway email via
 * the existing MA.email.compose() module.
 *
 * Public API:
 *   MA.notify.open(options)
 *
 * Options:
 *   {
 *     ggid      : string|number|null  — game ID; omit or null for favorites-only mode
 *     apiPath   : string              — URL to initPlayerNotifications.php
 *     onClose   : function()          — optional callback when panel is dismissed
 *   }
 *
 * Dependencies:
 *   MA.email.compose()   — composeEmail.js must be loaded
 *   MA.postJson()        — or falls back to native fetch
 *
 * Calling examples:
 *   // From a game page (both tabs)
 *   MA.notify.open({ ggid: state.game.dbGames_GGID, apiPath: MA.paths.apiNotify });
 *
 *   // From favorites page or any non-game context (favorites tab only)
 *   MA.notify.open({ apiPath: MA.paths.apiNotify });
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.notify = MA.notify || {};

  // ── Constants ───────────────────────────────────────────────────────────────

  const PANEL_ID   = "ma-notify-panel";
  const OVERLAY_ID = "ma-notify-overlay";

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeStr(v) {
    return String(v ?? "").trim();
  }

  function initials(name) {
    const parts = safeStr(name).split(" ").filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return "??";
  }

  function formatContactLine(player) {
    const email  = safeStr(player.email);
    const mobile = safeStr(player.mobile);
    if (email && mobile) return esc(email) + " &middot; " + esc(mobile);
    if (email)           return esc(email);
    if (mobile)          return esc(mobile);
    return "<em>No contact on file</em>";
  }

  function formatDateShort(dateStr, timeStr) {
    const d = safeStr(dateStr);
    const t = safeStr(timeStr);
    if (!d) return "";
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    if (isNaN(dt.getTime())) return d;
    const dow = dt.toLocaleDateString("en-US", { weekday: "short" });
    const mmdd = String(m).padStart(2, "0") + "/" + String(day).padStart(2, "0");
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

  // ── Post helper — uses MA.postJson if available, falls back to fetch ────────

  async function apiPost(url, payload) {
    if (typeof MA.postJson === "function") {
      return MA.postJson(url, payload);
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // ── State ────────────────────────────────────────────────────────────────────

  let _state = {
    opts: {},
    data: null,          // API response payload
    activeTab: "game",   // "game" | "favs"
    selected: new Set(), // Set of ghin strings
    favFilter: "all",    // "all" or a group name
  };

  // ── Core: open ───────────────────────────────────────────────────────────────

  MA.notify.open = async function (options) {
    const opts = options || {};
    _state.opts     = opts;
    _state.selected = new Set();
    _state.favFilter = "all";

    _destroyPanel();
    _renderSkeleton();

    try {
      const payload = {};
      if (opts.ggid) payload.ggid = opts.ggid;

      const apiPath = opts.apiPath || (MA.paths && MA.paths.apiNotify) || "";
      if (!apiPath) {
        _renderError("apiPath not configured for MA.notify.");
        return;
      }

      const data = await apiPost(apiPath, payload);

      if (!data || !data.ok) {
        _renderError(data?.message || "Failed to load recipients.");
        return;
      }

      _state.data = data;

      // Default starting tab: game if context available, else favs
      _state.activeTab = data.hasGameContext ? "game" : "favs";

      // Pre-select all reachable game players when opening from a game context
      if (data.hasGameContext && Array.isArray(data.gamePlayers)) {
        data.gamePlayers.forEach(function (p) {
          if (p.deliveryMethod !== null) _state.selected.add(p.ghin);
        });
      }

      _renderPanel();

    } catch (e) {
      console.error("[MA.notify]", e);
      _renderError("Unexpected error loading recipients.");
    }
  };

  // ── Skeleton (loading state shown immediately while API call is in flight) ───

  function _renderSkeleton() {
    _ensureOverlay();
    const panel = _ensurePanel();
    panel.innerHTML = _html_skeleton();
  }

  function _renderError(msg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.innerHTML = _html_error(msg);
  }

  // ── Full panel render ────────────────────────────────────────────────────────

  function _renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.innerHTML = _html_panel();
    _wireEvents(panel);
    _updateFooter();
  }

  // ── HTML builders ────────────────────────────────────────────────────────────

  function _html_skeleton() {
    return `
      <div class="ma-notify-topbar">
        <div class="ma-notify-topbar-title">Send message</div>
        <button class="ma-notify-cancel" onclick="MA.notify.close()">Cancel</button>
      </div>
      <div class="ma-notify-loading">Loading recipients&hellip;</div>`;
  }

  function _html_error(msg) {
    return `
      <div class="ma-notify-topbar">
        <div class="ma-notify-topbar-title">Send message</div>
        <button class="ma-notify-cancel" onclick="MA.notify.close()">Cancel</button>
      </div>
      <div class="ma-notify-error">${esc(msg)}</div>`;
  }

  function _html_panel() {
    const d    = _state.data;
    const game = d.game;
    const hasGame = d.hasGameContext;

    // Context subtitle: game title + date, or generic
    let subtitle = "Your favorites";
    if (hasGame && game) {
      const venue = [game.facilityName, game.courseName].filter(Boolean).join(" &middot; ");
      const when  = formatDateShort(game.playDate, game.playTime);
      subtitle    = [venue, when].filter(Boolean).join(" &middot; ");
    }

    const tabs = hasGame
      ? `<div class="ma-notify-tab ${_state.activeTab === "game" ? "active" : ""}" data-tab="game">Game players</div>
         <div class="ma-notify-tab ${_state.activeTab === "favs" ? "active" : ""}" data-tab="favs">Favorites</div>`
      : "";

    const gamePanel  = hasGame ? _html_gamePanel()  : "";
    const favsPanel  = _html_favsPanel();

    return `
      <div class="ma-notify-topbar">
        <div>
          <div class="ma-notify-topbar-title">Send message</div>
          <div class="ma-notify-topbar-sub">${subtitle}</div>
        </div>
        <button class="ma-notify-cancel" onclick="MA.notify.close()">Cancel</button>
      </div>
      ${hasGame ? `<div class="ma-notify-tabbar">${tabs}</div>` : ""}
      <div class="ma-notify-body">
        ${hasGame ? `<div class="ma-notify-tabpanel${_state.activeTab === "game" ? " active" : ""}" data-panel="game">${gamePanel}</div>` : ""}
        <div class="ma-notify-tabpanel${_state.activeTab === "favs" ? " active" : ""}${!hasGame ? " active" : ""}" data-panel="favs">${favsPanel}</div>
      </div>
      <div class="ma-notify-footer">
        <div class="ma-notify-summary" id="ma-notify-summary"></div>
        <div class="ma-notify-actions">
          <button class="ma-notify-btn-sms"   id="ma-notify-btn-sms"   disabled>Send SMS</button>
          <button class="ma-notify-btn-email" id="ma-notify-btn-email" disabled>Open email</button>
        </div>
      </div>`;
  }

  function _html_gamePanel() {
    const players = _state.data.gamePlayers || [];
    if (!players.length) {
      return `<div class="ma-notify-empty">No players in this game.</div>`;
    }
    const rows = players.map(_html_playerRow).join("");
    return `
      <div class="ma-notify-toolbar">
        <span class="ma-notify-count" data-count-for="game"></span>
        <button class="ma-notify-selall" data-selall="game">Select all</button>
      </div>
      <div class="ma-notify-list" data-list="game">${rows}</div>`;
  }

  function _html_favsPanel() {
    const favs   = _state.data.favorites  || [];
    const groups = _state.data.favGroups  || [];

    const groupOptions = [`<option value="all">All favorites</option>`];
    groups.forEach(function (g) {
      const sel = _state.favFilter === g ? " selected" : "";
      groupOptions.push(`<option value="${esc(g)}"${sel}>${esc(g)}</option>`);
    });

    const groupBar = groups.length
      ? `<div class="ma-notify-grouprow">
           <label class="ma-notify-grouplabel">Group</label>
           <select class="ma-notify-groupselect" id="ma-notify-groupsel">${groupOptions.join("")}</select>
         </div>`
      : "";

    const rows = favs.map(function (p) {
      // Visibility: hidden when a group filter is active and player isn't in that group
      const hidden = (_state.favFilter !== "all") &&
                     !((p.groups || []).includes(_state.favFilter));
      return _html_playerRow(p, hidden);
    }).join("");

    const empty = !favs.length
      ? `<div class="ma-notify-empty">No favorites saved yet.</div>`
      : "";

    return `
      ${groupBar}
      <div class="ma-notify-toolbar">
        <span class="ma-notify-count" data-count-for="favs"></span>
        <button class="ma-notify-selall" data-selall="favs">Select all</button>
      </div>
      <div class="ma-notify-list" data-list="favs">${empty}${rows}</div>`;
  }

  function _html_playerRow(player, hidden) {
    const unreachable = !player.deliveryMethod;
    const selected    = _state.selected.has(player.ghin);
    const method      = safeStr(player.deliveryMethod);

    const badgeClass = method === "SMS"   ? "ma-notify-badge-sms"
                     : method === "Email" ? "ma-notify-badge-email"
                     :                     "ma-notify-badge-none";
    const badgeLabel = method || "—";

    const checkmark = selected
      ? `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
           <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round"/>
         </svg>`
      : "";

    const classes = [
      "ma-notify-row",
      selected    ? "selected"    : "",
      unreachable ? "unreachable" : "",
      hidden      ? "ma-hidden"   : "",
    ].filter(Boolean).join(" ");

    return `
      <div class="${classes}"
           data-ghin="${esc(player.ghin)}"
           data-method="${esc(method)}">
        <div class="ma-notify-check">${checkmark}</div>
        <div class="ma-notify-avatar">${esc(initials(player.name))}</div>
        <div class="ma-notify-info">
          <div class="ma-notify-name">${esc(player.name)}</div>
          <div class="ma-notify-contact">${formatContactLine(player)}</div>
        </div>
        <span class="ma-notify-badge ${badgeClass}">${esc(badgeLabel)}</span>
      </div>`;
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function _wireEvents(panel) {
    // Tab switching
    panel.querySelectorAll(".ma-notify-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        _state.activeTab = tab.dataset.tab;
        panel.querySelectorAll(".ma-notify-tab").forEach(function (t) {
          t.classList.toggle("active", t.dataset.tab === _state.activeTab);
        });
        panel.querySelectorAll(".ma-notify-tabpanel").forEach(function (p) {
          p.classList.toggle("active", p.dataset.panel === _state.activeTab);
        });
        _updateCounts();
      });
    });

    // Player row selection
    panel.addEventListener("click", function (e) {
      const row = e.target.closest(".ma-notify-row");
      if (!row || row.classList.contains("unreachable")) return;
      const ghin = row.dataset.ghin;
      if (_state.selected.has(ghin)) {
        _state.selected.delete(ghin);
        row.classList.remove("selected");
        row.querySelector(".ma-notify-check").innerHTML = "";
      } else {
        _state.selected.add(ghin);
        row.classList.add("selected");
        row.querySelector(".ma-notify-check").innerHTML =
          `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
             <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.5"
                   stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`;
      }
      _updateFooter();
    });

    // Select all buttons
    panel.querySelectorAll(".ma-notify-selall").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const listKey = btn.dataset.selall;
        const list    = panel.querySelector(`[data-list="${listKey}"]`);
        if (!list) return;
        const rows    = list.querySelectorAll(".ma-notify-row:not(.unreachable):not(.ma-hidden)");
        const allSel  = Array.from(rows).every(function (r) {
          return _state.selected.has(r.dataset.ghin);
        });
        rows.forEach(function (r) {
          const ghin = r.dataset.ghin;
          if (allSel) {
            _state.selected.delete(ghin);
            r.classList.remove("selected");
            r.querySelector(".ma-notify-check").innerHTML = "";
          } else {
            _state.selected.add(ghin);
            r.classList.add("selected");
            r.querySelector(".ma-notify-check").innerHTML =
              `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                 <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.5"
                       stroke-linecap="round" stroke-linejoin="round"/>
               </svg>`;
          }
        });
        _updateFooter();
      });
    });

    // Group filter dropdown
    const groupSel = panel.querySelector("#ma-notify-groupsel");
    if (groupSel) {
      groupSel.addEventListener("change", function () {
        _state.favFilter = groupSel.value;
        const list = panel.querySelector("[data-list='favs']");
        if (!list) return;
        list.querySelectorAll(".ma-notify-row").forEach(function (row) {
          const ghin   = row.dataset.ghin;
          const fav    = (_state.data.favorites || []).find(function (f) {
            return f.ghin === ghin;
          });
          const groups = fav ? (fav.groups || []) : [];
          const hide   = (_state.favFilter !== "all") &&
                         !groups.includes(_state.favFilter);
          row.classList.toggle("ma-hidden", hide);
          // Deselect hidden players so they don't end up in the mailto list
          if (hide && _state.selected.has(ghin)) {
            _state.selected.delete(ghin);
            row.classList.remove("selected");
            row.querySelector(".ma-notify-check").innerHTML = "";
          }
        });
        _updateFooter();
      });
    }

    // Send buttons
    const btnEmail = panel.querySelector("#ma-notify-btn-email");
    const btnSms   = panel.querySelector("#ma-notify-btn-sms");
    if (btnEmail) btnEmail.addEventListener("click", function () { _send("email"); });
    if (btnSms)   btnSms.addEventListener("click",   function () { _send("sms"); });
  }

  // ── Footer: count summary + button state ─────────────────────────────────────

  function _updateFooter() {
    _updateCounts();

    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    // Gather all selected players from both data sets
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    let emailCount = 0;
    let smsCount   = 0;

    _state.selected.forEach(function (ghin) {
      const p = allPlayers.find(function (x) { return x.ghin === ghin; });
      if (!p) return;
      if (p.deliveryMethod === "SMS")   smsCount++;
      if (p.deliveryMethod === "Email") emailCount++;
    });

    const total = emailCount + smsCount;
    const summaryEl = panel.querySelector("#ma-notify-summary");
    if (summaryEl) {
      if (total === 0) {
        summaryEl.textContent = "No recipients selected";
      } else {
        const parts = [];
        if (emailCount > 0) parts.push(emailCount + " email");
        if (smsCount   > 0) parts.push(smsCount   + " SMS");
        summaryEl.textContent = total + " recipient" + (total === 1 ? "" : "s") +
                                " \u2014 " + parts.join(", ");
      }
    }

    const btnEmail = panel.querySelector("#ma-notify-btn-email");
    const btnSms   = panel.querySelector("#ma-notify-btn-sms");
    if (btnEmail) btnEmail.disabled = (total === 0);
    if (btnSms)   btnSms.disabled   = (smsCount === 0);
  }

  function _updateCounts() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    ["game", "favs"].forEach(function (key) {
      const el = panel.querySelector(`[data-count-for="${key}"]`);
      if (!el) return;
      const list = panel.querySelector(`[data-list="${key}"]`);
      if (!list) return;
      const visibleSelected = list.querySelectorAll(
        ".ma-notify-row.selected:not(.ma-hidden)"
      ).length;
      el.textContent = visibleSelected + " selected";
    });
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  // Builds the recipient list from selected GHINs, splits by deliveryMethod,
  // and dispatches to MA.email.compose().
  //
  // mode "email" → all Email-method recipients go to BCC; SMS recipients are
  //                included as their gateway address in the same BCC block
  //                (carrier gateway address IS an email address).
  // mode "sms"   → only SMS-method recipients, sent via gateway addresses.
  //
  // MA.email.compose() opens the user's default mail client via mailto:.
  // The user writes their own message body; we pre-fill subject from game context.

  function _send(mode) {
    const allPlayers = [
      ...(_state.data.gamePlayers || []),
      ...(_state.data.favorites   || []),
    ];

    // Deduplicate by deliveryEmail in case a player appears in both lists
    const seen = new Set();
    const recipients = [];

    _state.selected.forEach(function (ghin) {
      const p = allPlayers.find(function (x) { return x.ghin === ghin; });
      if (!p || !p.deliveryEmail || !p.deliveryMethod) return;
      if (mode === "sms"   && p.deliveryMethod !== "SMS")   return;
      if (mode === "email" && !p.deliveryMethod)             return;
      if (seen.has(p.deliveryEmail)) return;
      seen.add(p.deliveryEmail);
      recipients.push({ name: p.name, email: p.deliveryEmail });
    });

    if (!recipients.length) return;

    // Build subject from game context if available
    let subject = "";
    const game = _state.data.game;
    if (game) {
      const venue = game.facilityName || game.courseName || "";
      const when  = formatDateShort(game.playDate, game.playTime);
      subject = [game.title, venue, when].filter(Boolean).join(" \u2014 ");
    }

    if (MA.email && typeof MA.email.compose === "function") {
      MA.email.compose({
        bcc:         recipients,
        subject:     subject,
        body:        "",
        bodyIsHtml:  false,
      });
      MA.notify.close();
    } else {
      console.error("[MA.notify] MA.email.compose not available.");
    }
  }

  // ── Panel DOM management ──────────────────────────────────────────────────────

  function _ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.className = "ma-notify-overlay";
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) MA.notify.close();
      });
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
    return overlay;
  }

  function _ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "ma-notify-panel";
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) overlay.appendChild(panel);
      else document.body.appendChild(panel);
    }
    return panel;
  }

  function _destroyPanel() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.display = "none";
      overlay.innerHTML = "";
    }
  }

  MA.notify.close = function () {
    _destroyPanel();
    _state.data     = null;
    _state.selected = new Set();
    if (typeof _state.opts.onClose === "function") {
      _state.opts.onClose();
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  // Injected once into <head>. Scoped with ma-notify- prefix to avoid collisions.

  (function _injectStyles() {
    if (document.getElementById("ma-notify-styles")) return;
    const style = document.createElement("style");
    style.id = "ma-notify-styles";
    style.textContent = `
      .ma-notify-overlay {
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(0,0,0,0.45);
        display: none; align-items: flex-end; justify-content: center;
      }
      .ma-notify-panel {
        background: #fff; width: 100%; max-width: 520px;
        border-radius: 16px 16px 0 0;
        max-height: 88vh; display: flex; flex-direction: column;
        overflow: hidden; font-family: sans-serif; font-size: 14px;
      }
      .ma-notify-topbar {
        display: flex; align-items: flex-start; justify-content: space-between;
        padding: 14px 16px 10px; border-bottom: 0.5px solid #e5e5e5;
        flex-shrink: 0;
      }
      .ma-notify-topbar-title { font-size: 16px; font-weight: 500; color: #1a1a1a; }
      .ma-notify-topbar-sub   { font-size: 12px; color: #888; margin-top: 2px; }
      .ma-notify-cancel {
        font-size: 13px; color: #888; background: none; border: none;
        cursor: pointer; padding: 2px 0; line-height: 1;
      }
      .ma-notify-tabbar {
        display: flex; border-bottom: 0.5px solid #e5e5e5; flex-shrink: 0;
      }
      .ma-notify-tab {
        flex: 1; padding: 10px 0; text-align: center; font-size: 13px;
        font-weight: 500; color: #888; cursor: pointer;
        border-bottom: 2px solid transparent; transition: color .15s, border-color .15s;
      }
      .ma-notify-tab.active { color: #185FA5; border-bottom-color: #185FA5; }
      .ma-notify-body { flex: 1; overflow-y: auto; background: #f5f5f3; }
      .ma-notify-tabpanel { display: none; }
      .ma-notify-tabpanel.active { display: block; }
      .ma-notify-grouprow {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px 4px; background: #f5f5f3;
      }
      .ma-notify-grouplabel { font-size: 12px; color: #888; white-space: nowrap; }
      .ma-notify-groupselect {
        flex: 1; height: 32px; padding: 0 8px; font-size: 13px;
        border: 0.5px solid #ccc; border-radius: 8px;
        background: #fff; color: #1a1a1a;
      }
      .ma-notify-toolbar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 16px 4px;
      }
      .ma-notify-count   { font-size: 12px; color: #888; }
      .ma-notify-selall  {
        font-size: 12px; color: #185FA5; background: none;
        border: none; cursor: pointer; padding: 0;
      }
      .ma-notify-list {
        background: #fff;
        border-top: 0.5px solid #e5e5e5;
        border-bottom: 0.5px solid #e5e5e5;
      }
      .ma-notify-row {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 16px; border-bottom: 0.5px solid #f0f0f0; cursor: pointer;
        transition: background .1s;
      }
      .ma-notify-row:last-child { border-bottom: none; }
      .ma-notify-row:hover:not(.unreachable) { background: #f5f8fc; }
      .ma-notify-row.selected   { background: #EBF4FF; }
      .ma-notify-row.unreachable { opacity: 0.4; cursor: default; }
      .ma-notify-row.ma-hidden  { display: none; }
      .ma-notify-check {
        width: 20px; height: 20px; border-radius: 50%;
        border: 1.5px solid #ccc; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        transition: all .15s; background: transparent;
      }
      .ma-notify-row.selected .ma-notify-check {
        background: #185FA5; border-color: #185FA5;
      }
      .ma-notify-avatar {
        width: 32px; height: 32px; border-radius: 50%;
        background: #f0f0ee; border: 0.5px solid #e0e0e0;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 500; color: #666; flex-shrink: 0;
      }
      .ma-notify-info   { flex: 1; min-width: 0; }
      .ma-notify-name   {
        font-size: 13px; font-weight: 500; color: #1a1a1a;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ma-notify-contact {
        font-size: 11px; color: #888; margin-top: 1px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ma-notify-badge {
        flex-shrink: 0; font-size: 10px; font-weight: 500;
        padding: 2px 6px; border-radius: 20px; letter-spacing: .02em;
      }
      .ma-notify-badge-sms   { background: #E1F5EE; color: #085041; }
      .ma-notify-badge-email { background: #E6F1FB; color: #0C447C; }
      .ma-notify-badge-none  { background: #f0f0ee; color: #aaa; }
      .ma-notify-footer {
        padding: 12px 16px; border-top: 0.5px solid #e5e5e5;
        background: #fff; flex-shrink: 0;
      }
      .ma-notify-summary {
        font-size: 12px; color: #888; margin-bottom: 8px; min-height: 16px;
      }
      .ma-notify-actions { display: flex; gap: 8px; }
      .ma-notify-btn-email {
        flex: 1; padding: 10px; font-size: 13px; font-weight: 500;
        background: #185FA5; color: #fff; border: none;
        border-radius: 8px; cursor: pointer; transition: opacity .15s;
      }
      .ma-notify-btn-email:disabled { opacity: 0.35; cursor: default; }
      .ma-notify-btn-sms {
        padding: 10px 14px; font-size: 13px; font-weight: 500;
        background: transparent; color: #085041;
        border: 0.5px solid #5DCAA5; border-radius: 8px; cursor: pointer;
      }
      .ma-notify-btn-sms:disabled { opacity: 0.35; cursor: default; }
      .ma-notify-loading, .ma-notify-error, .ma-notify-empty {
        padding: 32px 16px; text-align: center; color: #888; font-size: 14px;
      }
      .ma-notify-error { color: #c0392b; }
    `;
    document.head.appendChild(style);
  })();

  window.MA = MA;
})();