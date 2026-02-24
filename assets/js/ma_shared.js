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
        // Preferred: explicit login URL provided by the page
        const loginUrl =
          (window.MA && MA.routes && MA.routes.login) ? MA.routes.login : null;

        if (loginUrl) {
          window.location.assign(loginUrl);
        } else if (MA.paths && MA.paths.routerApi) {
          // Fallback: use router to land on login
          window.location.assign(MA.paths.routerApi + "?action=login&redirect=1");
        }

        throw new Error("AUTH_REQUIRED");
      }

      // Non-auth failures: throw the best available message
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
    if (!el) return; // if chrome not present, caller may implement fallback
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
  const base = MA.paths.apiFavPlayers; // e.g. "/api/favorite_players"
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
    if (data && data.redirect) { // tolerate older contract
      window.location.href = data.redirect;
      return;
    }
    throw new Error("Router did not return redirectUrl");
  }

  MA.postJson = postJson;
  MA.setStatus = setStatus;
  MA.apiAdminGames = apiAdminGames;
  MA.apiImportGames = apiImportGames;
  MA.apiFavPlayers = apiFavPlayers
  MA.apiSession = apiSession;
  MA.routerGo = routerGo;
    // ----------------------------------------------------------------------------
  // Chrome controller (header lines + action buttons + bottom nav)
  // Pages can drive chrome without owning chrome markup.
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

  // Actions: left/right buttons (page decides show/label/click)
  MA.chrome.setActions = function (cfg) {
    const leftBtn = document.getElementById("chromeBtnLeft");
    const rightBtn = document.getElementById("chromeBtnRight");
    cfg = cfg || {};

    function apply(btn, def) {
      if (!btn) return;
      if (!def || def.show === false) {
        btn.textContent = "";
        btn.style.display = "none";
        btn.onclick = null;
        return;
      }
      btn.textContent = String(def.label || "");
      btn.style.display = "";
      btn.onclick = typeof def.onClick === "function" ? def.onClick : null;
    }

    apply(leftBtn, cfg.left);
    apply(rightBtn, cfg.right);
  };

  // Bottom nav: show/hide items + disabled/current-stage + compact centering when <=2 visible
  MA.chrome.setBottomNav = function (state) {
    const nav = document.getElementById("chromeBottomNav");
    if (!nav) return;

    const visible = new Set((state && state.visible) ? state.visible : []);
    const disabled = new Set((state && state.disabled) ? state.disabled : []);
    const active = state && state.active ? String(state.active) : "";
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
          // Never navigate when disabled/current stage
          if (btn.disabled) return;
          if (onNavigate) onNavigate(id);
        });
      }
    });

    nav.classList.toggle("is-compact", visibleCount <= 2);
  };


})();