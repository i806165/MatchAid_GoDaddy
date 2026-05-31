/* /assets/pages/club_users.js
 * Club Users page
 *
 * Architecture:
 *   - All data arrives via window.__INIT__ (pre-baked by PHP controller)
 *   - No DB calls from JS — static display with client-side name filter
 *   - Desktop: table view; Mobile (≤820px): card-per-user view
 *   - Mirrors game_summary.js mobile/desktop pattern
 *
 * Follows club_demand.js patterns:
 *   IIFE · strict mode · state object · el DOM map
 *   applyInit() → wireEvents() → render() → boot()
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
    users:      [],
    nameFilter: "",
    context:    {
      clubId:       "",
      clubName:     "",
      facilityId:   "",
      facilityName: "",
    },
  };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    search:      document.getElementById("cuSearch"),
    searchClear: document.getElementById("cuSearchClear"),
    userCount:   document.getElementById("cuUserCount"),
    tbody:       document.getElementById("cuTbody"),
    mobileList:  document.getElementById("cuMobileList"),
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

  function fmtDateTime(raw) {
    if (!raw) return "—";
    const s = String(raw).trim();
    if (!s) return "—";
    const d = new Date(s.replace(" ", "T"));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }) + " " + d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  function fmtPhone(raw) {
    const digits = safeStr(raw).replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return dash(raw);
  }

  // ── Filter ─────────────────────────────────────────────────────
  function getVisible() {
    const filter = state.nameFilter.toLowerCase();
    return filter
      ? state.users.filter(u => safeStr(u.name).toLowerCase().includes(filter))
      : state.users;
  }

  // ── Render desktop table ────────────────────────────────────────
  function renderDesktop(visible) {
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
        <td class="cuMuted">${esc(fmtDateTime(u.createdDate))}</td>
        <td class="cuMuted">${esc(fmtDateTime(u.updatedDate))}</td>
      </tr>
    `).join("");
  }

  // ── Render mobile cards ─────────────────────────────────────────
  function renderMobile(visible) {
    if (!el.mobileList) return;

    if (visible.length === 0) {
      el.mobileList.innerHTML = "";
      return;
    }

    el.mobileList.innerHTML = visible.map(u => `
      <div class="cuPlayerCard">
        <div class="cuCard__name">${esc(dash(u.name))}</div>
        <div class="cuCard__line">
          <span class="cuCard__label">GHIN</span>
          <span class="cuCard__value">${esc(dash(u.ghin))}</span>
        </div>
        ${u.email ? `
        <div class="cuCard__line">
          <span class="cuCard__label">Email</span>
          <span class="cuCard__value">${esc(u.email)}</span>
        </div>` : ""}
        ${u.mobilePhone ? `
        <div class="cuCard__line">
          <span class="cuCard__label">Mobile</span>
          <span class="cuCard__value">${esc(fmtPhone(u.mobilePhone))}</span>
        </div>` : ""}
        ${u.contactMethod ? `
        <div class="cuCard__line">
          <span class="cuCard__label">Contact</span>
          <span class="cuCard__value">${esc(u.contactMethod)}</span>
        </div>` : ""}
        <div class="cuCard__date">Last activity: ${esc(fmtDateTime(u.updatedDate))}</div>
      </div>
    `).join("");
  }

  // ── Master render ───────────────────────────────────────────────
  function render() {
    const visible = getVisible();

    // Count
    if (el.userCount) {
      el.userCount.textContent = visible.length === state.users.length
        ? `${state.users.length} user${state.users.length !== 1 ? "s" : ""}`
        : `${visible.length} of ${state.users.length}`;
    }

    // Empty state
    if (el.empty) el.empty.style.display = visible.length === 0 ? "" : "none";

    renderDesktop(visible);
    renderMobile(visible);
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const facilityName = safeStr(state.context.facilityName)
      || safeStr(state.context.clubName)
      || "Club Users";

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Users", facilityName]);
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
      clubId:       safeStr(init.context?.clubId),
      clubName:     safeStr(init.context?.clubName),
      facilityId:   safeStr(init.context?.facilityId),
      facilityName: safeStr(init.context?.facilityName),
    };
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {
    el.search?.addEventListener("input", () => {
      state.nameFilter = safeStr(el.search.value);
      el.searchClear?.classList.toggle("isHidden", !state.nameFilter);
      render();
    });

    el.searchClear?.addEventListener("click", () => {
      state.nameFilter = "";
      if (el.search) { el.search.value = ""; el.search.focus(); }
      el.searchClear.classList.add("isHidden");
      render();
    });
  }

  // ── Boot ───────────────────────────────────────────────────────
  function boot() {
    try {
      setStatus("Loading users…", "info");

      const init = window.__INIT__ || window.__MA_INIT__ || null;
      if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

      applyInit(init);
      wireEvents();
      applyChrome();
      render();

      setStatus("", "info");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();