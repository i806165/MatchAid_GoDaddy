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
    sortKey:    "name",
    sortDir:    "asc",
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
    cardSub:     document.getElementById("cuCardSub"),
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

  // ── Sort ───────────────────────────────────────────────────────
  function isNumericKey(key) {
    return key === "favPlayerCount" || key === "gameCount";
  }

  function labelForKey(key) {
    return {
      name:           "Name",
      ghin:           "GHIN",
      email:          "Email",
      mobilePhone:    "Mobile Phone",
      contactMethod:  "Contact Method",
      favPlayerCount: "Favorites",
      gameCount:      "Games",
      createdDate:    "Created",
      updatedDate:    "Last Activity",
    }[key] || "Value";
  }

  function applySort(rows) {
    const key = state.sortKey;
    const dir = state.sortDir === "desc" ? -1 : 1;

    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (isNumericKey(key)) {
        return (Number(av ?? 0) - Number(bv ?? 0)) * dir;
      }

      return safeStr(av).localeCompare(safeStr(bv)) * dir;
    });
  }

  function setSort(key, dir) {
    state.sortKey = key;
    state.sortDir = dir === "desc" ? "desc" : "asc";
    render();
  }

  function buildSubtitle(visibleCount, totalCount) {
    const label    = labelForKey(state.sortKey);
    const dirLabel = isNumericKey(state.sortKey)
      ? (state.sortDir === "desc" ? "High to Low" : "Low to High")
      : (state.sortDir === "desc" ? "Z to A"      : "A to Z");
    const countStr = visibleCount === totalCount
      ? `${totalCount} user${totalCount !== 1 ? "s" : ""}`
      : `${visibleCount} of ${totalCount}`;
    return `${countStr} · Sorted by ${label} ${dirLabel}`;
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
        <td data-cu-menu data-sort-key="name"          data-display-value="${esc(dash(u.name))}">${esc(dash(u.name))}</td>
        <td data-cu-menu data-sort-key="ghin"          data-display-value="${esc(dash(u.ghin))}" class="cuMuted">${esc(dash(u.ghin))}</td>
        <td data-cu-menu data-sort-key="email"         data-display-value="${esc(dash(u.email))}">${esc(dash(u.email))}</td>
        <td data-cu-menu data-sort-key="mobilePhone"   data-display-value="${esc(fmtPhone(u.mobilePhone))}" class="cuMuted">${esc(fmtPhone(u.mobilePhone))}</td>
        <td data-cu-menu data-sort-key="contactMethod" data-display-value="${esc(dash(u.contactMethod))}">${esc(dash(u.contactMethod))}</td>
        <td data-cu-menu data-sort-key="favPlayerCount" data-display-value="${esc(String(u.favPlayerCount ?? 0))}" class="cuMuted cuRight">${esc(String(u.favPlayerCount ?? 0))}</td>
        <td data-cu-menu data-sort-key="gameCount"     data-display-value="${esc(String(u.gameCount ?? 0))}" class="cuMuted cuRight">${esc(String(u.gameCount ?? 0))}</td>
        <td data-cu-menu data-sort-key="createdDate"   data-display-value="${esc(dash(u.createdDate))}" class="cuMuted">${esc(fmtDateTime(u.createdDate))}</td>
        <td data-cu-menu data-sort-key="updatedDate"   data-display-value="${esc(dash(u.updatedDate))}" class="cuMuted">${esc(fmtDateTime(u.updatedDate))}</td>
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
        <div class="cuCard__line">
          <span class="cuCard__label">Favorites</span>
          <span class="cuCard__value">${esc(String(u.favPlayerCount ?? 0))}</span>
        </div>
        <div class="cuCard__line">
          <span class="cuCard__label">Games</span>
          <span class="cuCard__value">${esc(String(u.gameCount ?? 0))}</span>
        </div>
        <div class="cuCard__date">Last activity: ${esc(fmtDateTime(u.updatedDate))}</div>
      </div>
    `).join("");
  }

  // ── Master render ───────────────────────────────────────────────
  function render() {
    const filtered = getVisible();
    const visible  = applySort(filtered);

    // Count / subtitle
    if (el.userCount) {
      el.userCount.textContent = buildSubtitle(visible.length, state.users.length);
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

    el.tbody?.addEventListener("click", onBodyClick);
  }

  // ── Cell-click actions menu (mirrors club_demand.js pattern) ───
  function onBodyClick(e) {
    const cell = e.target.closest("[data-cu-menu]");
    if (!cell || !el.tbody?.contains(cell)) return;
    openCellMenu(cell);
  }

  function openCellMenu(cell) {
    const ui = window.MA?.ui;
    if (typeof ui?.openActionsMenu !== "function") return;

    const sortKey    = safeStr(cell.dataset.sortKey);
    const displayVal = safeStr(cell.dataset.displayValue) || safeStr(cell.textContent);
    const label      = labelForKey(sortKey);
    const actions    = [];

    if (sortKey) {
      if (isNumericKey(sortKey)) {
        actions.push({ label: `Sort ${label} Low to High`, action: () => setSort(sortKey, "asc")  });
        actions.push({ label: `Sort ${label} High to Low`, action: () => setSort(sortKey, "desc") });
      } else {
        actions.push({ label: `Sort ${label} A to Z`, action: () => setSort(sortKey, "asc")  });
        actions.push({ label: `Sort ${label} Z to A`, action: () => setSort(sortKey, "desc") });
      }
    }

    ui.openActionsMenu(displayVal || label, actions, label);
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