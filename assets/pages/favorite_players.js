/* /assets/pages/favorite_players.js
 * Favorite Players (GoDaddy)
 * - List only appears on fresh launch (no SessionFavPlayerGHIN)
 * - Entry form is dual-route (favorites list → form, or registrations → form)
 * - Footer is suppressed when form is active (both modes) per spec
 * - Shared GHIN Search overlay (MA.ghinSearch)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const initPayload  = window.__MA_INIT__ || window.__INIT__ || {};
  const launch = initPayload; // keep existing variable name usage
  //const launch = window.__FP_LAUNCH__ || {};
  const state = {
    context: {},
    favorites: [],
    groups: [],
    groupFilter: "All",
    searchText: "",
    current: null, // {playerGHIN, name, email, mobile, memberId, groups[]}
    selectedGroups: new Set(),
    returnAction: "", // from init
    launchMode: String(launch.launchMode || "favorites"),
  };

  const el = {
    list: document.getElementById("fpList"),
    form: document.getElementById("fpForm"),
    controls: document.getElementById("fpControls"),
    listRows: document.getElementById("fpListRows"),
    empty: document.getElementById("fpEmpty"),
    search: document.getElementById("fpSearchText"),
    groupFilter: document.getElementById("fpGroupFilter"),
    formTitle: document.getElementById("fpFormTitle"),
    formSub: document.getElementById("fpFormSub"),
    email: document.getElementById("fpEmail"),
    mobile: document.getElementById("fpMobile"),
    memberId: document.getElementById("fpMemberId"),
    chips: document.getElementById("fpGroupChips"),
    newGroup: document.getElementById("fpNewGroup"),
    btnAddGroup: document.getElementById("fpBtnAddGroup"),
  };

  function safe(v) { return (v == null) ? "" : String(v); }
  function trim(v) { return safe(v).trim(); }

  function maskGHIN(ghin) {
    const s = trim(ghin);
    if (s.length <= 4) return s;
    return "••••" + s.slice(-4);
  }

  function openAddNew() {
      // Open shared GHIN search; ineligible set = current favorites list (client-side)
      const existing = new Set((state.favorites || []).map(f => String(f.playerGHIN)));
      MA.ghinSearch.open({
        title: "Add Player from GHIN",
        defaultState: String(state.context?.userState || "").trim().toUpperCase(),
        existingGHINs: existing,
        onSelect: async (row) => {
          MA.ghinSearch.close();
          const ghin = String(row.ghin || "").trim();
          if (!ghin) return;

          try {
            await openFromGhinSelection(ghin);
          } catch (e) {
            console.error(e);
            if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
          }
        }
      });
    }

    function setHeaderActionsFor(mode) {
      if (!MA.chrome || !MA.chrome.setActions) return;

      // LIST: Add New in chrome header right slot
      if (mode === "list") {
        MA.chrome.setActions({
          left: { show: false },
          right: {
            show: true,
            label: "Add New",
            onClick: () => openAddNew()
          }
        });
        return;
      }

      // FORM: Cancel/Save in chrome header
      MA.chrome.setActions({
        left: {
          show: true,
          label: "Cancel",
          onClick: () => doCancel()
        },
        right: {
          show: true,
          label: "Save",
          onClick: () => doSave()
        }
      });
    }

  function applyChromeHeader() {
    if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
      MA.chrome.setHeaderLines([
        "ADMIN PORTAL",
        "Favorite Players",
        "" // no subtitle per your rule
      ]);
    }
  }

  function setFooterFor(mode) {
    // Requirement: footer suppressed when form active in BOTH launch modes.
    if (!MA.chrome || !MA.chrome.setBottomNav) return;
    if (mode === "form") {
      MA.chrome.setBottomNav({ visible: [], disabled: [] });
      const nav = document.getElementById("chromeBottomNav");
      if (nav) nav.style.display = "none";
      return;
    }
    const nav = document.getElementById("chromeBottomNav");
    if (nav) nav.style.display = "";
    MA.chrome.setBottomNav({
      visible: ["home", "admin", "favorites"],
      disabled: ["favorites"],
      active: "favorites",
      onNavigate: async (id) => {
        await MA.routerGo(id);
      }
    });
  }

  async function initPage() {
    // Load data for list; and/or determine entry form launch
    const res = await MA.postJson(MA.paths.favPlayersInit, {});
    if (!res || !res.ok) throw new Error(res?.message || "INIT failed.");

    state.context = res.payload?.context || {};
    state.favorites = Array.isArray(res.payload?.favorites) ? res.payload.favorites : [];
    state.groups = Array.isArray(res.payload?.groups) ? res.payload.groups : [];
    state.returnAction = String(res.payload?.returnAction || "");

    applyChromeHeader();
    renderFilters();

    // If playerGHIN provided, auto-open form and suppress footer
    const autoGhin = String(launch.playerGHIN || "").trim();
    if (autoGhin) {
      try {
        await openFromLaunchGHIN(autoGhin);
      } catch (e) {
        console.error(e);
        if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
        // fall back to list if launch open fails
        showList();
      }
    } else {
      showList();
    }
  }

  function renderFilters() {
    if (!el.groupFilter) return;
    const groups = ["All"].concat(state.groups || []);
    el.groupFilter.innerHTML = groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    el.groupFilter.value = state.groupFilter || "All";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }
    async function fetchGhinById(ghin) {
    const id = String(ghin || "").trim();
    if (!id) return null;

    const res = await MA.postJson(MA.paths.ghinPlayerSearch, { mode: "id", ghin: id });
    
    if (!res || !res.ok) throw new Error(res?.message || "GHIN lookup failed.");

    const rows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];

    return rows[0] || null;
  }

  async function openFromLaunchGHIN(playerGHIN) {
    const ghin = String(playerGHIN || "").trim();
    if (!ghin) return;

    // 1) Try DB favorites first (already returned by init endpoint)
    const fav = state.favorites.find(f => String(f.playerGHIN) === ghin) || null;
    if (fav) {
      openForm(Object.assign({}, fav, { __existing: true }), true);
      return;
    }

    // 2) Not found → GHIN hydrate (Add flow)
    const row = await fetchGhinById(ghin);
    if (!row) {
      openForm({ playerGHIN: ghin, name: "", email: "", mobile: "", memberId: "", groups: [], __existing: false }, true);
      return;
    }

    openForm({
      playerGHIN: String(row.ghin || ghin),
      name: String(row.name || ""),
      email: String(row.email || ""),
      mobile: String(row.mobile || ""),
      memberId: String(row.memberId || ""),
      groups: [],
      __existing: false
    }, true);
  }

  async function openFromGhinSelection(ghin) {
    const row = await fetchGhinById(ghin);
    openForm({
      playerGHIN: String(row?.ghin || ghin || ""),
      name: String(row?.name || ""),
      email: String(row?.email || ""),
      mobile: String(row?.mobile || ""),
      memberId: String(row?.memberId || ""),
      groups: [],
      __existing: false
    }, true);
  }


  function showList() {
    el.form.style.display = "none";
    el.list.style.display = "";
    if (el.controls) el.controls.style.display = ""; 
    applyChromeHeader();
    setFooterFor("list");
    setHeaderActionsFor("list");
    renderList();
  }

  function openForm(fav, suppressFooter) {
    applyChromeHeader();
    
    // If we are opening the form from the list (not a direct "registrations" launch),
    // ensure we return to the list, not the roster.
    if (state.launchMode !== "registrations") state.returnAction = "list";

    // Build current object
    state.current = {
      playerGHIN: safe(fav.playerGHIN),
      name: safe(fav.name),
      email: safe(fav.email),
      mobile: safe(fav.mobile),
      memberId: safe(fav.memberId),
      groups: Array.isArray(fav.groups) ? fav.groups.slice() : []
    };
    state.selectedGroups = new Set(state.current.groups || []);

    el.list.style.display = "none";
    el.form.style.display = "";
    if (el.controls) el.controls.style.display = "none"; 
    setFooterFor("form");
    setHeaderActionsFor("form");

    // hydrate fields
    const isEdit = !!fav.__existing;
    if (el.formTitle) el.formTitle.textContent = isEdit ? "Edit Favorite" : "Add Favorite";
    if (el.formSub) el.formSub.textContent = `${state.current.name || "Selected Player"} • ${maskGHIN(state.current.playerGHIN)}`;
    if (el.email) el.email.value = state.current.email || "";
    if (el.mobile) el.mobile.value = state.current.mobile || "";
    if (el.memberId) el.memberId.value = state.current.memberId || "";

    renderGroupChips();
  }

  function renderList() {
    const vm = filteredFavorites();
    if (!vm.length) {
      el.listRows.innerHTML = "";
      if (el.empty) el.empty.style.display = "";
      return;
    }
    if (el.empty) el.empty.style.display = "none";

    el.listRows.innerHTML = vm.map(f => {
      const name = escapeHtml(f.name || "");
      const ghin = escapeHtml(maskGHIN(f.playerGHIN || ""));
      const groups = escapeHtml((Array.isArray(f.groups) ? f.groups.join(", ") : ""));
      return `
        <div class="maListRow" data-ghin="${escapeHtml(f.playerGHIN)}">
          <div class="maListRow__col">${name}</div>
          <div class="maListRow__col maListRow__col--muted">${ghin}${groups ? " • " + groups : ""}</div>
          <button class="iconBtn" type="button" data-act="delete" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join("");

    // row click/edit/delete
    el.listRows.querySelectorAll(".maListRow").forEach(row => {
      row.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
        const act = btn ? btn.getAttribute("data-act") : "";
        const ghin = row.getAttribute("data-ghin");
        if (!ghin) return;

        if (act === "delete") {
          e.preventDefault();
          e.stopPropagation();
          doDelete(ghin);
          return;
        }
        const fav = state.favorites.find(f => String(f.playerGHIN) === String(ghin));
        if (fav) openForm(fav, true);
      });
    });
  }

  function filteredFavorites() {
    const q = trim(state.searchText).toLowerCase();
    const g = state.groupFilter || "All";
    return (state.favorites || []).filter(f => {
      const inGroup = (g === "All") ? true : (Array.isArray(f.groups) && f.groups.includes(g));
      if (!inGroup) return false;
      if (!q) return true;
      const hay = (safe(f.name) + " " + safe(f.playerGHIN)).toLowerCase();
      return hay.includes(q);
    });
  }

  function renderGroupChips() {
    const all = (state.groups || []).slice();
    // include selected groups that may not be in global list
    state.selectedGroups.forEach(g => { if (g && !all.includes(g)) all.push(g); });
    all.sort((a,b) => String(a).localeCompare(String(b)));

    el.chips.innerHTML = all.map(g => {
      const on = state.selectedGroups.has(g);
      return `<button type="button" class="maChoiceChip ${on ? "is-selected" : ""}" data-group="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
    }).join("");

    el.chips.querySelectorAll(".maChoiceChip").forEach(btn => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-group");
        if (!g) return;
        if (state.selectedGroups.has(g)) state.selectedGroups.delete(g);
        else state.selectedGroups.add(g);
        renderGroupChips();
      });
    });
  }

  function normalizeGroupName(s) {
    return trim(s).replace(/\s+/g, " ");
  }

  function doAddGroup() {
    const g = normalizeGroupName(el.newGroup.value);
    if (!g) return;
    // Update global groups list and selection
    if (!state.groups.includes(g)) state.groups.push(g);
    state.selectedGroups.add(g);
    el.newGroup.value = "";
    renderFilters();
    renderGroupChips();
  }

  async function doDelete(playerGHIN) {
    // Per spec: immediate delete, no confirmation
    try {
      const res = await MA.postJson(MA.paths.favPlayersDelete, { playerGHIN });
      if (!res || !res.ok) throw new Error(res?.message || "Delete failed.");
      state.favorites = Array.isArray(res.payload?.favorites) ? res.payload.favorites : state.favorites.filter(f => String(f.playerGHIN) !== String(playerGHIN));
      state.groups = Array.isArray(res.payload?.groups) ? res.payload.groups : state.groups;
      renderFilters();
      renderList();
      if (MA.setStatus) MA.setStatus("Favorite removed.", "info");
    } catch (e) {
      console.error(e);
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }
  }

  async function doSave() {
    if (!state.current) return;

    const emailVal = el.email ? el.email.value.trim() : "";
    const mobileVal = el.mobile ? el.mobile.value.trim() : "";

    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      if (MA.setStatus) MA.setStatus("Invalid email address.", "error");
      if (el.email) el.email.focus();
      return;
    }

    if (mobileVal) {
      const digits = mobileVal.replace(/\D/g, "");
      if (digits.length < 10) {
        if (MA.setStatus) MA.setStatus("Invalid mobile number (10 digits required).", "error");
        if (el.mobile) el.mobile.focus();
        return;
      }
    }

    const payload = {
      playerGHIN: state.current.playerGHIN,
      email: emailVal,
      mobile: mobileVal,
      memberId: el.memberId ? el.memberId.value : "",
      groups: Array.from(state.selectedGroups || [])
    };

    try {
      const res = await MA.postJson(MA.paths.favPlayersSave, payload);
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");
      // refresh list
      state.favorites = Array.isArray(res.payload?.favorites) ? res.payload.favorites : state.favorites;
      state.groups = Array.isArray(res.payload?.groups) ? res.payload.groups : state.groups;

      if (MA.setStatus) MA.setStatus("Saved.", "info");

      // Requirement: Save routes back to calling page using returnAction (header buttons)
      if (state.returnAction === "roster") {
        await MA.routerGo(state.returnAction);
        return;
      }
      showList();
    } catch (e) {
      console.error(e);
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }
  }

  async function doCancel() {
    if (state.returnAction === "roster") {
      await MA.routerGo(state.returnAction);
      return;
    }
    showList();
  }

  function wireEvents() {
    if (el.search) {
      el.search.addEventListener("input", () => {
        state.searchText = el.search.value || "";
        renderList();
      });
    }
    if (el.groupFilter) {
      el.groupFilter.addEventListener("change", () => {
        state.groupFilter = el.groupFilter.value || "All";
        renderList();
      });
    }

    if (el.btnAddGroup) el.btnAddGroup.addEventListener("click", doAddGroup);
    if (el.newGroup) {
      el.newGroup.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doAddGroup();
      });
    }
  }

  // boot
  (async function () {
    try {
      wireEvents();
      await initPage();
    } catch (e) {
      console.error(e);
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }
  })();
})();
