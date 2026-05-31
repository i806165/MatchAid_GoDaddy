/* /assets/pages/club_users.js
 * Club Users page
 *
 * Architecture:
 *   - All data arrives via window.__INIT__ (pre-baked by PHP controller)
 *   - No DB calls from JS — static display with client-side name filter
 *   - state.users is the in-memory dataset for the session
 *
 * Follows club_demand.js patterns:
 *   IIFE · strict mode · state object · el DOM map
 *   applyInit() → wireEvents() → renderTable() → boot()
 *   chrome.setHeaderLines / setActions / setBottomNav
 */
(function () {
  "use strict";

  const MA        = window.MA   || {};
  const chrome    = MA.chrome   || {};
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  // ── State ──────────────────────────────────────────────────────
  const state = {
    users:      [],   // full list from __INIT__
    nameFilter: "",   // current search string
    context:    {
      clubId:   "",
      clubName: "",
    },
  };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    search:      document.getElementById("cuSearch"),
    searchClear: document.getElementById("cuSearchClear"),
    userCount:   document.getElementById("cuUserCount"),
    cardSub:     document.getElementById("cuCardSub"),
    tbody:       document.getElementById("cuTbody"),
    empty:       document.getElementById("cuEmpty"),
  };

  // ── Utility ────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function safeStr(v) { return String(v ?? "").trim(); }
  function dash(v)    { const s = safeStr(v); return s || "—"; }

  function fmtPhone(raw) {
    const digits = safeStr(raw).replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return dash(raw);
  }

  // ── Render ─────────────────────────────────────────────────────
  function renderTable() {
    const filter = state.nameFilter.toLowerCase();

    const visible = filter
      ? state.users.filter(u => safeStr(u.name).toLowerCase().includes(filter))
      : state.users;

    // Update count
    if (el.userCount) {
      el.userCount.textContent = visible.length === state.users.length
        ? `${state.users.length} user${state.users.length !== 1 ? "s" : ""}`
        : `${visible.length} of ${state.users.length}`;
    }

    // Empty state
    if (el.empty) el.empty.style.display = visible.length === 0 ? "" : "none";

    if (!el.tbody) return;

    if (visible.length === 0) {
      el.tbody.innerHTML = "";
      return;
    }

    el.tbody.innerHTML = visible.map(u => `
      <tr>
        <td>${esc(dash(u.name))}</td>
        <td class="cuMuted">${esc(dash(u.ghin))}</td>
        <td>${esc(dash(u.email))}</td>
        <td class="cuMuted">${esc(fmtPhone(u.mobilePhone))}</td>
        <td>${esc(dash(u.contactMethod))}</td>
      </tr>
    `).join("");
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const clubName = safeStr(state.context.clubName) || "Club Users";

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Users", clubName, ""]);
    }
    if (typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: false },
        right: { show: false },
      });
    }
    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubhome", "clubdemand", "clubusers"],
        active:     "clubusers",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  // ── Apply init payload ─────────────────────────────────────────
  function applyInit(init) {
    if (!init || !init.ok) throw new Error(init?.message || "Init payload invalid.");

    state.users   = Array.isArray(init.users) ? init.users : [];
    state.context = {
      clubId:   safeStr(init.context?.clubId),
      clubName: safeStr(init.context?.clubName),
    };

    // Card subtitle
    if (el.cardSub) {
      el.cardSub.textContent = state.context.clubName || "";
    }
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {
    if (el.search) {
      el.search.addEventListener("input", () => {
        state.nameFilter = safeStr(el.search.value);
        if (el.searchClear) {
          el.searchClear.classList.toggle("isHidden", !state.nameFilter);
        }
        renderTable();
      });
    }

    if (el.searchClear) {
      el.searchClear.addEventListener("click", () => {
        state.nameFilter = "";
        if (el.search) {
          el.search.value = "";
          el.search.focus();
        }
        el.searchClear.classList.add("isHidden");
        renderTable();
      });
    }
  }

  // ── Boot ───────────────────────────────────────────────────────
  async function boot() {
    try {
      setStatus("Loading users…", "info");

      const init = window.__INIT__ || window.__MA_INIT__ || null;
      if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

      applyInit(init);
      wireEvents();
      applyChrome();
      renderTable();

      setStatus("Ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();
