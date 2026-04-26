/* /assets/js/ma_shared.js
 * Shared helpers for MatchAid pages (GoDaddy).
 * - Centralizes API POST, router navigation, and Chrome status messaging.
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.paths = MA.paths || {};

  function _jsonHeaders(extra) {
    return Object.assign({ "Content-Type": "application/json" }, extra || {});
  }

  async function postJson(url, bodyObj) {
    const res = await fetch(url, {
      method: "POST",
      headers: _jsonHeaders(),
      body: JSON.stringify(bodyObj || {}),
      credentials: "same-origin",
    });

    const text = await res.text();

    // Always attempt to parse JSON; keep raw text for debugging if it fails.
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: "NON_JSON_RESPONSE", raw: text };
    }

    // Centralized auth failure behavior (used by every page)
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const loginUrl =
          (window.MA && MA.routes && MA.routes.login) ? MA.routes.login : null;

        if (loginUrl) {
          window.location.assign(loginUrl);
        } else if (MA.paths && MA.paths.routerApi) {
          window.location.assign(MA.paths.routerApi + "?action=login&redirect=1");
        }

        throw new Error("AUTH_REQUIRED");
      }

      const msg =
        (data && (data.error || data.message)) ? (data.error || data.message) :
        `Request failed (${res.status})`;
      throw new Error(msg);
    }

    return data;
  }


  // Chrome status line writer (single footer)
  function setStatus(message, level) {
    const el = document.getElementById("chromeStatusLine");
    if (!el) return;
    const msg = String(message || "");
    el.textContent = msg;

    el.classList.remove("status-danger", "status-warn", "status-success", "status-info");
    const lvl = String(level || "").toLowerCase();

    if (lvl === "error" || lvl === "danger") el.classList.add("status-danger");
    else if (lvl === "warn" || lvl === "warning") el.classList.add("status-warn");
    else if (lvl === "success") el.classList.add("status-success");
    else if (lvl === "info") el.classList.add("status-info");
  }

  // Admin Games API wrapper
  async function apiAdminGames(endpointFile, payload) {
    const base = MA.paths.apiAdminGames;
    if (!base) throw new Error("MA.paths.apiAdminGames missing");
    const url = base.replace(/\/$/, "") + "/" + endpointFile.replace(/^\//, "");
    return postJson(url, { payload: payload || {} });
  }

  async function apiImportGames(endpointFile, payload) {
    const base = MA.paths.apiImportGames;
    if (!base) throw new Error("MA.paths.apiImportGames missing");
    const url = base.replace(/\/$/, "") + "/" + endpointFile.replace(/^\//, "");
    return postJson(url, { payload: payload || {} });
  }

  async function apiFavPlayers(endpointFile, payload) {
    const base = MA.paths.apiFavPlayers;
    if (!base) throw new Error("MA.paths.apiFavPlayers missing");
    const url = base.replace(/\/$/, "") + "/" + endpointFile.replace(/^\//, "");
    return postJson(url, { payload: payload || {} });
  }

  // Session API wrapper
  async function apiSession(endpointFile, payload) {
    const base = MA.paths.apiSession;
    if (!base) throw new Error("MA.paths.apiSession missing");
    const url = base.replace(/\/$/, "") + "/" + endpointFile.replace(/^\//, "");
    return postJson(url, { payload: payload || {} });
  }

  // Router navigation wrapper
  async function routerGo(action, payload) {
    const url = MA.paths.routerApi;
    if (!url) throw new Error("MA.paths.routerApi missing");
    const body = Object.assign({ action }, payload || {});
    const data = await postJson(url, body);
    if (data && data.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }
    if (data && data.redirect) {
      window.location.href = data.redirect;
      return;
    }
    throw new Error("Router did not return redirectUrl");
  }

  MA.postJson = postJson;
  MA.setStatus = setStatus;
  MA.apiAdminGames = apiAdminGames;
  MA.apiImportGames = apiImportGames;
  MA.apiFavPlayers = apiFavPlayers;
  MA.apiSession = apiSession;
  MA.routerGo = routerGo;

  // ----------------------------------------------------------------------------
  // Chrome controller (header lines + action buttons + bottom nav)
  // Pages drive chrome without owning chrome markup.
  // ----------------------------------------------------------------------------
  MA.chrome = MA.chrome || {};

  // Header: 3 lines
  MA.chrome.setHeaderLines = function (lines) {
    const l1 = document.getElementById("chromeHdrLine1");
    const l2 = document.getElementById("chromeHdrLine2");
    const l3 = document.getElementById("chromeHdrLine3");
    const arr = Array.isArray(lines) ? lines : [];
    const vals = [arr[0], arr[1], arr[2]].map(v => (v == null ? "" : String(v).trim()));

    const apply = (el, text) => {
      if (!el) return;
      if (text) { el.textContent = text; el.style.display = ""; }
      else { el.textContent = ""; el.style.display = "none"; }
    };

    apply(l1, vals[0]);
    apply(l2, vals[1]);
    apply(l3, vals[2]);
  };

  // Brand: toggle visibility (default is hidden via CSS)
  MA.chrome.showBrand = function (visible) {
    const el = document.getElementById("chromeBrandSlot");
    if (el) el.style.display = visible ? "flex" : "none";
  };

  // ----------------------------------------------------------------------------
  // Actions: left/right header buttons + optional footer save/cancel bar.
  //
  // cfg = {
  //   left:   { show, label, onClick }   — header left button (unchanged)
  //   right:  { show, label, onClick }   — header right button (unchanged)
  //   footer: {                           — NEW: footer action bar
  //     save:   { label, onClick }        — blue Save button
  //     cancel: { label, onClick }        — gray Cancel button
  //   } | null                           — null = restore nav
  // }
  //
  // When cfg.footer is provided:
  //   - Header left + right buttons are hidden (footer owns the actions).
  //   - Footer class .maChrome__ftr--actions is set → CSS swaps nav ↔ bar.
  //   - Save and Cancel buttons are wired to their onClick handlers.
  //
  // When cfg.footer is null/absent:
  //   - Header buttons behave exactly as before (left/right cfg applied).
  //   - Footer class is removed → nav restored.
  // ----------------------------------------------------------------------------
  MA.chrome.setActions = function (cfg) {
    cfg = cfg || {};

    const leftBtn  = document.getElementById("chromeBtnLeft");
    const rightBtn = document.getElementById("chromeBtnRight");
    const footer   = document.querySelector(".maChrome__ftr");
    const saveBtn  = document.getElementById("chromeFtrSave");
    const cancelBtn = document.getElementById("chromeFtrCancel");

    const hasFooterActions = !!(cfg.footer && (cfg.footer.save || cfg.footer.cancel));

    // ---- Header buttons ----
    // When footer actions are active the header slots are hidden entirely —
    // the footer owns Save/Cancel and the header is free for other use.
    function applyHeaderBtn(btn, def) {
      if (!btn) return;
      if (hasFooterActions || !def || def.show === false) {
        btn.textContent = "";
        btn.style.display = "none";
        btn.onclick = null;
        return;
      }
      btn.textContent = String(def.label || "");
      btn.style.display = "";
      btn.onclick = typeof def.onClick === "function" ? def.onClick : null;
    }

    applyHeaderBtn(leftBtn,  cfg.left);
    applyHeaderBtn(rightBtn, cfg.right);

    // ---- Footer action bar ----
    if (footer) {
      footer.classList.toggle("maChrome__ftr--actions", hasFooterActions);
    }

  // If entering Save/Cancel mode, close the hub tray if it's open
  if (hasFooterActions && typeof MA.chrome.closeHub === "function") {
    MA.chrome.closeHub();
  }

  if (hasFooterActions) {
      const saveDef   = cfg.footer.save   || {};
      const cancelDef = cfg.footer.cancel || {};

      if (saveBtn) {
        saveBtn.textContent = String(saveDef.label   || "Save");
        saveBtn.onclick     = typeof saveDef.onClick === "function" ? saveDef.onClick : null;
        saveBtn.disabled    = false;
        saveBtn.classList.remove("is-disabled");
      }

      if (cancelBtn) {
        cancelBtn.textContent = String(cancelDef.label   || "Cancel");
        cancelBtn.onclick     = typeof cancelDef.onClick === "function" ? cancelDef.onClick : null;
        cancelBtn.disabled    = false;
        cancelBtn.classList.remove("is-disabled");
      }
    } else {
      // Disarm footer buttons when returning to nav mode
      if (saveBtn)   { saveBtn.onclick   = null; saveBtn.disabled   = false; }
      if (cancelBtn) { cancelBtn.onclick = null; cancelBtn.disabled = false; }
    }

    // ---- Page action slot (optional, e.g. "Add New") ----
    const pageSlot   = document.getElementById("chromePageAction");
    const pageBtn    = document.getElementById("chromePageActionBtn");
    const hasPageAction = !!(cfg.page && typeof cfg.page.onClick === "function");

    if (pageSlot) pageSlot.style.display = hasPageAction ? "" : "none";
    if (hasPageAction && pageBtn) {
      pageBtn.textContent = String(cfg.page.label || "");
      pageBtn.onclick     = cfg.page.onClick;
    } else if (pageBtn) {
      pageBtn.textContent = "";
      pageBtn.onclick     = null;
    }
  };

  // ----------------------------------------------------------------------------
  // setFooterSaveDisabled — pages call this to disable/enable the footer Save
  // button during async operations (replaces the old syncActionDisabled pattern
  // that targeted chromeBtnRight).
  //
  // Usage:  MA.chrome.setFooterSaveDisabled(true)   // during save
  //         MA.chrome.setFooterSaveDisabled(false)  // on complete
  // ----------------------------------------------------------------------------
  MA.chrome.setFooterSaveDisabled = function (disabled) {
    const saveBtn = document.getElementById("chromeFtrSave");
    if (!saveBtn) return;
    saveBtn.disabled = !!disabled;
    saveBtn.classList.toggle("is-disabled", !!disabled);
  };

  // Bottom nav: show/hide items + disabled/current-stage + compact centering when <=2 visible
  // On mobile, also populates the hub tray rows from the same visible/active/onNavigate state.
  MA.chrome.setBottomNav = function (state) {
    const nav = document.getElementById("chromeBottomNav");
    if (!nav) return;

    const visible    = new Set((state && state.visible)  ? state.visible  : []);
    const disabled   = new Set((state && state.disabled) ? state.disabled : []);
    const active     = state && state.active ? String(state.active) : "";
    const onNavigate = (state && typeof state.onNavigate === "function") ? state.onNavigate : null;

    let visibleCount = 0;

    nav.querySelectorAll(".maNavBtn[data-nav]").forEach((btn) => {
      const id = String(btn.getAttribute("data-nav") || "");

      const isVisible = visible.size ? visible.has(id) : true;
      btn.style.display = isVisible ? "" : "none";
      if (isVisible) visibleCount++;

      const isDisabled = disabled.has(id) || (active && id === active);
      btn.classList.toggle("is-disabled", isDisabled);
      btn.disabled = isDisabled;

      btn.classList.toggle("is-active", active && id === active);

      // bind click once
      if (!btn.__ma_bound) {
        btn.__ma_bound = true;
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          if (onNavigate) onNavigate(id);
        });
      }
    });

    nav.classList.toggle("is-compact", visibleCount <= 2);

    // ---- Populate hub tray rows (mobile) ----
    // Reads label text from the existing icon nav buttons so there is a single
    // source of truth — the nav markup in chromeFooter.php.
    MA.chrome._hubNavigate = onNavigate;
    MA.chrome._hubActive   = active;
    MA.chrome._hubVisible  = visible;
    MA.chrome._hubDisabled = disabled;
    MA.chrome._buildHubRows();
  };

  // --------------------------------------------------------------------------
  // Hub tray controller
  // Builds tray rows from the icon nav markup, wires open/close, and exposes
  // MA.chrome.openHub() / MA.chrome.closeHub() for the Navigate button.
  // --------------------------------------------------------------------------
  MA.chrome._hubVisible  = new Set();
  MA.chrome._hubDisabled = new Set();
  MA.chrome._hubActive   = "";
  MA.chrome._hubNavigate = null;

  // Label map — nav id → human-readable label for the tray.
  // Matches data-nav values in chromeFooter.php.
  MA.chrome._hubLabels = {
    home            : { label: "Home",            icon: "⌂"  },
    admin           : { label: "Admin Home",       icon: "🔒" },
    adminOld        : { label: "Admin",            icon: "🔒" },
    player          : { label: "Player Home",      icon: "📋" },
    edit            : { label: "Edit Game",        icon: "✎"  },
    settings        : { label: "Settings",         icon: "⚙"  },
    roster          : { label: "Roster",           icon: "👥" },
    pairings        : { label: "Pairings",         icon: "🔗" },
    teetimes        : { label: "Tee Times",        icon: "⏱" },
    summary         : { label: "Summary",          icon: "📄" },
    import          : { label: "Import Games",     icon: "⭳" },
    scoreentry      : { label: "Enter Scores",     icon: "📝" },
    scorecardPlayer : { label: "Player Card",      icon: "📋" },
    scorecardGroup  : { label: "Group Card",       icon: "👥" },
    scorecardGame   : { label: "Game Cards",       icon: "📄" },
    scoreskins      : { label: "Skins",            icon: "💰" },
    scoresummary    : { label: "Leaders",          icon: "📊" },
    favorites       : { label: "Favorites",        icon: "★"  },
    usersettings    : { label: "My Settings",      icon: "⚙"  },
  };

  MA.chrome._buildHubRows = function () {
    const container = document.getElementById("chromeHubRows");
    if (!container) return;

    const visible  = MA.chrome._hubVisible;
    const disabled = MA.chrome._hubDisabled;
    const active   = MA.chrome._hubActive;
    const labels   = MA.chrome._hubLabels;

    // Collect visible ids in the order they appear in the icon nav markup
    const nav = document.getElementById("chromeBottomNav");
    if (!nav) return;

    const orderedIds = [];
    nav.querySelectorAll(".maNavBtn[data-nav]").forEach((btn) => {
      const id = String(btn.getAttribute("data-nav") || "");
      if (visible.size ? visible.has(id) : true) orderedIds.push(id);
    });

    container.innerHTML = "";

    orderedIds.forEach((id, idx) => {
      const meta       = labels[id] || { label: id, icon: "›" };
      const isActive   = active && id === active;
      const isDisabled = disabled.has(id) || isActive;

      // Optional divider — insert before the first scoring-related item
      // to mirror the grouping shown in our design mockups.
      const scoringIds = new Set(["scoreentry","scorecardPlayer","scorecardGroup","scorecardGame","scoreskins","scoresummary","import","favorites"]);
      if (idx > 0 && scoringIds.has(id) && !scoringIds.has(orderedIds[idx - 1])) {
        const hr = document.createElement("hr");
        hr.className = "maHubDivider";
        container.appendChild(hr);
      }

      const btn = document.createElement("button");
      btn.type      = "button";
      btn.className = "maHubRow" + (isActive ? " is-active" : "");
      btn.disabled  = isDisabled;
      btn.setAttribute("data-nav", id);
      btn.innerHTML =
        `<span class="maHubRow__icon" aria-hidden="true">${meta.icon}</span>` +
        `<span class="maHubRow__label">${meta.label}</span>` +
        `<span class="maHubRow__arrow" aria-hidden="true">›</span>`;

      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        MA.chrome.closeHub();
        if (MA.chrome._hubNavigate) MA.chrome._hubNavigate(id);
      });

      container.appendChild(btn);
    });
  };

  MA.chrome.openHub = function () {
    const tray = document.getElementById("chromeHubTray");
    const btn  = document.getElementById("chromeNavHubBtn");
    if (!tray) return;

    tray.removeAttribute("hidden");

    // rAF ensures display:flex is applied before transition fires
    requestAnimationFrame(() => {
      tray.classList.add("is-open");
      if (btn) btn.setAttribute("aria-expanded", "true");
    });
  };

  MA.chrome.closeHub = function () {
    const tray = document.getElementById("chromeHubTray");
    const btn  = document.getElementById("chromeNavHubBtn");
    if (!tray) return;

    tray.classList.remove("is-open");
    if (btn) btn.setAttribute("aria-expanded", "false");

    // Re-hide from accessibility tree after transition completes
    tray.addEventListener("transitionend", () => {
      if (!tray.classList.contains("is-open")) tray.setAttribute("hidden", "");
    }, { once: true });
  };

  // Wire up Navigate button, backdrop, and close button once DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    const hubBtn   = document.getElementById("chromeNavHubBtn");
    const closeBtn = document.getElementById("chromeHubClose");
    const backdrop = document.getElementById("chromeHubBackdrop");

    if (hubBtn)   hubBtn.addEventListener("click", MA.chrome.openHub);
    if (closeBtn) closeBtn.addEventListener("click", MA.chrome.closeHub);
    if (backdrop) backdrop.addEventListener("click", MA.chrome.closeHub);
  });

})();