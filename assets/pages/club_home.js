/* /assets/pages/club_home.js
 * Club Admin Home page
 *
 * Architecture:
 *   - Landing page for the Club Admin portal
 *   - No DB calls — static landing with tile navigation
 *
 * Follows club_demand.js patterns:
 *   IIFE · strict mode · el DOM map
 *   applyChrome() → wireEvents() → boot()
 *   chrome.setHeaderLines / setActions / setBottomNav
 */
(function () {
  "use strict";

  const MA        = window.MA      || {};
  const chrome    = MA.chrome      || {};
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    tileDemand: document.getElementById("chTileDemand"),
  };

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const clubName = String(window.__INIT__?.clubName ?? "");

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Admin", clubName]);
    }

    if (typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: false },
        right: { show: false },
      });
    }

    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubhome", "clubddemand"],
        active:     "clubhome",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {
    el.tileDemand?.addEventListener("click", () => {
      window.location.assign(window.MA.paths.demandReport);
    });
  }

  // ── Boot ───────────────────────────────────────────────────────
  function boot() {
    try {
      applyChrome();
      wireEvents();
      setStatus("", "info");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();