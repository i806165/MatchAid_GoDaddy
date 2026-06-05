/* /assets/pages/favorite_players.js
 * Favorite Players
 * - List only appears on fresh launch (no SessionFavPlayerGHIN)
 * - Entry form is dual-route (favorites list → form, or registrations → form)
 * - Footer is suppressed when form is active (both modes) per spec
 * - Shared GHIN Search overlay (MA.ghinSearch)
 * - Email selection modal: sources from db_Users → address book → GHIN
 * - Add Group modal replaces inline add-group row
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const initPayload  = window.__MA_INIT__ || window.__INIT__ || {};
  const launch = initPayload;
  const state = {
    context: {},
    favorites: [],
    groups: [],
    groupFilter: "All",
    searchText: "",
    current: null,
    selectedGroups: new Set(),
    returnAction: "",
    launchMode: String(launch.launchMode || "favorites"),
    emailSources: [],       // [{email, source, label, masked, priority}]
    selectedEmail: "",      // currently committed email on the form
    selectedEmailSource: "", // source key for badge display
  };

  const el = {
    list:       document.getElementById("fpList"),
    form:       document.getElementById("fpForm"),
    controls:   document.getElementById("fpControls"),
    listRows:   document.getElementById("fpListRows"),
    empty:      document.getElementById("fpEmpty"),
    search:     document.getElementById("fpSearchText"),
    groupFilter:document.getElementById("fpGroupFilter"),
    formTitle:  null,
    formSub:    document.getElementById("fpFormSub"),
    formGhin:   document.getElementById("fpFormGhin"),   
    formAvatar: document.getElementById("fpFormAvatar"), 
    email:      document.getElementById("fpEmail"),
    emailBadge: null,
    emailPickBtn: document.getElementById("fpEmailPickBtn"),
    mobile:     document.getElementById("fpMobile"),
    memberId:   document.getElementById("fpMemberId"),
    chips:      document.getElementById("fpGroupChips"),
    btnAddGroup: document.getElementById("fpBtnAddGroup"),
  };

  // ── Utilities ───────────────────────────────────────────────────────────────

  function safe(v) { return (v == null) ? "" : String(v); }
  function trim(v) { return safe(v).trim(); }

  function maskGHIN(ghin) {
    const s = trim(ghin);
    return s.length > 4 ? "····" + s.slice(-4) : s;
  }

  function escapeHtml(s) {
    return safe(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isMaskedEmail(email) {
    return safe(email).includes("*");
  }

  // ── Chrome / nav ────────────────────────────────────────────────────────────

  function setHeaderActionsFor(mode) {
    if (!MA.chrome || !MA.chrome.setActions) return;
    if (mode === "list") {
      MA.chrome.setActions({
        left:   { show: false },
        right:  { show: false },
        footer: null,
        page:   { label: "+ Add New Favorite", onClick: () => openAddNew() }
      });
    } else {
      MA.chrome.setActions({
        left:   { show: false },
        right:  { show: false },
        footer: {
          save:   { label: "Save",   onClick: () => doSave() },
          cancel: { label: "Cancel", onClick: () => doCancel() }
        },
        page: null
      });
    }
  }

  function applyChromeHeader() {
    if (MA.chrome && typeof MA.chrome.setHeaderLines === "function") {
      MA.chrome.setHeaderLines([
        "Favorite Players",
        String(state.context?.clubName || ""),
        "",
      ]);
    }
  }

  function setFooterFor(mode) {
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
      visible:  ["home", "admin", "favorites"],
      disabled: ["favorites"],
      active:   "favorites",
      onNavigate: async (id) => {
        await MA.routerGo(id);
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  async function initPage() {
    const autoGhin = String(launch.playerGHIN || "").trim();
    const res = await MA.postJson(MA.paths.favPlayersInit, { ghin: autoGhin });
    if (!res || !res.ok) throw new Error(res?.message || "Init failed.");

    state.context      = res.payload?.context || {};
    state.favorites    = Array.isArray(res.payload?.favorites) ? res.payload.favorites : [];
    state.groups       = Array.isArray(res.payload?.groups) ? res.payload.groups : [];
    state.returnAction = String(res.payload?.returnAction || "");

    applyChromeHeader();

    try {
      if (autoGhin) {
        state.launchMode = "registrations";
        setFooterFor("form");
        setHeaderActionsFor("form");
        await openFromLaunchGHIN(autoGhin);
        return;
      }
    } catch (e) {
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }

    showList();
  }

  // ── List ────────────────────────────────────────────────────────────────────

  function renderFilters() {
    if (!el.groupFilter) return;
    const groups = ["All"].concat(state.groups || []);
    el.groupFilter.innerHTML = groups
      .map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`)
      .join("");
    el.groupFilter.value = state.groupFilter || "All";
  }

  function filteredFavorites() {
    return (state.favorites || []).filter(f => {
      const g   = state.groupFilter || "All";
      const inGroup = (g === "All") ? true : (Array.isArray(f.groups) && f.groups.includes(g));
      if (!inGroup) return false;
      const q = trim(state.searchText).toLowerCase();
      if (!q) return true;
      const hay = (safe(f.name) + " " + safe(f.playerGHIN)).toLowerCase();
      return hay.includes(q);
    });
  }

 function avatarColor(index) {
    return "fpColor--" + (index % 6);
  }

  function avatarInitials(name) {
    const parts = trim(name).split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return trim(name).slice(0, 2).toUpperCase();
  }

  function renderList() {
    const vm = filteredFavorites();
    if (!vm.length) {
      el.listRows.innerHTML = "";
      if (el.empty) el.empty.style.display = "";
      return;
    }
    if (el.empty) el.empty.style.display = "none";

    el.listRows.innerHTML = vm.map((f, i) => {
      const initials = avatarInitials(f.name || "?");
      const colorCls = avatarColor(i);
      const email    = trim(f.email);
      const groups   = Array.isArray(f.groups) && f.groups.filter(g => g && g !== "_default");
      const groupStr = groups.length ? groups.join(", ") : "";

      const emailHtml = email
        ? `<div class="fpCard__email">${escapeHtml(email)}</div>`
        : `<div class="fpCard__email fpCard__email--empty">No email on file</div>`;

      const groupsHtml = groupStr
        ? `<div class="fpCard__groups" title="${escapeHtml(groupStr)}">${escapeHtml(groupStr)}</div>`
        : "";

      return `
        <div class="fpCard" data-ghin="${escapeHtml(f.playerGHIN)}">
          <div class="fpCard__top">
            <div class="maListRow__avatar fpAvatar ${colorCls}">${escapeHtml(initials)}</div>
            <span class="fpCard__name">${escapeHtml(f.name || "")}</span>
            <button class="fpCard__trash js-delete" data-ghin="${escapeHtml(f.playerGHIN)}" aria-label="Remove">
              <img src="/assets/images/icon_trashcan.png" alt="Remove" />
            </button>
          </div>
          <div class="fpCard__divider"></div>
          ${emailHtml}
          ${groupsHtml}
        </div>`;
    }).join("");

    el.listRows.querySelectorAll(".fpCard").forEach(card => {
      card.querySelector(".js-delete")?.addEventListener("click", e => {
        e.stopPropagation();
        doDelete(card.dataset.ghin);
      });
      card.addEventListener("click", () => {
        const fav = state.favorites.find(f => String(f.playerGHIN) === String(card.dataset.ghin));
        if (fav) _openFormWithSources(Object.assign({}, fav, { __existing: true }), true);
      });
    });
  }

  function showList() {
    el.form.style.display = "none";
    el.list.style.display = "";
    if (el.controls) el.controls.style.display = "";
    setHeaderActionsFor("list");
    setFooterFor("list");
    renderFilters();
    renderList();
  }

  // ── GHIN fetch ──────────────────────────────────────────────────────────────

  async function fetchGhinById(ghin) {
    const id = trim(ghin);
    if (!id) return null;
    const res = await MA.postJson(MA.paths.ghinPlayerSearch, { mode: "id", ghin: id, useUserToken: true });
    if (!res || !res.ok) throw new Error(res?.message || "GHIN lookup failed.");
    const rows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
    return rows[0] || null;
  }

  // ── Email sources ────────────────────────────────────────────────────────────

  async function loadEmailSources(playerGHIN, ghinEmail) {
    state.emailSources = [];
    try {
      const res = await MA.postJson(MA.paths.favPlayersGetEmails, { playerGHIN });
      //console.log("[loadEmailSources] playerGHIN:", playerGHIN, "ghinEmail:", ghinEmail, "res:", JSON.stringify(res));
      if (res && res.ok && Array.isArray(res.sources)) {
        state.emailSources = res.sources;
      }
    } catch (e) {
      console.warn("[FP] getPlayerEmails failed:", e);
    }
    //console.log("[loadEmailSources] emailSources after API:", JSON.stringify(state.emailSources));

    // Seed from the favorite's stored email if API returned nothing
    if (state.emailSources.length === 0 && ghinEmail && !isMaskedEmail(ghinEmail) && trim(ghinEmail) !== "") {
      state.emailSources.push({
        email:    trim(ghinEmail),
        source:   "addressbook",
        label:    "Address book",
        masked:   false,
        priority: 2,
      });
    }

    // Merge GHIN email if not already in sources
    if (ghinEmail && trim(ghinEmail) !== "") {
      const already = state.emailSources.some(
        s => s.email.toLowerCase() === ghinEmail.toLowerCase()
      );
      if (!already) {
        state.emailSources.push({
          email:    ghinEmail,
          source:   "ghin",
          label:    "Golf Handicap Network",
          masked:   isMaskedEmail(ghinEmail),
          priority: isMaskedEmail(ghinEmail) ? 99 : 3,
        });
      }
    }
  }

  function bestEmail() {
    const valid = state.emailSources.filter(s => !s.masked);
    return valid.length ? valid[0].email : "";
  }

  function updateEmailField(email, source) {
    state.selectedEmail       = email;
    state.selectedEmailSource = source;
    if (el.email) el.email.value = email;
    renderEmailBadge(source);
    // Disable pick button if only one non-masked source
    if (el.emailPickBtn) {
      // Pick button always visible — "Enter manually" option is always available
      // regardless of how many email sources were found.
      el.emailPickBtn.style.display = "";
    }
  }

  function renderEmailBadge(source) {
    if (!el.emailBadge) return;
    const icons = {
      matchaid:    "ti-shield-check",
      addressbook: "ti-address-book",
      ghin:        "ti-user",
      manual:      "ti-pencil",
    };
    const labels = {
      matchaid:    "MatchAid profile",
      addressbook: "Address book",
      ghin:        "Golf Handicap Network",
      manual:      "Entered manually",
    };
    const icon  = icons[source]  || "ti-mail";
    const label = labels[source] || source;
    el.emailBadge.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i> ${escapeHtml(label)}`;
    el.emailBadge.style.display = label ? "" : "none";
  }

  // ── Email selection modal ───────────────────────────────────────────────────

  function openEmailModal() {
    _destroyEmailModal();
    const overlay = document.createElement("div");
    overlay.className = "maModalOverlay is-open";
    overlay.id = "fpEmailModal";

    const rows = state.emailSources.map((s, i) => {
      const isMasked = s.masked;
      const maskedNote = isMasked
        ? `<div class="fp-email-row__masked">
             <i class="ti ti-alert-triangle" aria-hidden="true"></i>
             Masked by Golf Handicap Network — cannot be used
           </div>`
        : "";
      const checkedAttr = (!isMasked && i === 0) ? "checked" : "";
      const disabledAttr = isMasked ? "disabled" : "";
      return `
        <div class="fp-email-row${isMasked ? " is-masked" : ""}" data-index="${i}" data-email="${escapeHtml(s.email)}" data-source="${escapeHtml(s.source)}" data-masked="${isMasked ? "true" : "false"}">
          <input type="radio" class="fp-email-row__radio" name="fpEmailChoice" ${checkedAttr} ${disabledAttr}>
          <div class="fp-email-row__content">
            <div class="fp-email-row__address">${escapeHtml(s.email)}</div>
            <div class="fp-email-row__label">${escapeHtml(s.label)}</div>
            ${maskedNote}
          </div>
        </div>`;
    }).join("");

    const manualRow = `
      <div class="fp-email-section-label">
        <i class="ti ti-pencil" aria-hidden="true"></i> Enter manually
      </div>
      <div class="fp-email-row" data-source="manual" data-masked="false">
        <input type="radio" class="fp-email-row__radio" name="fpEmailChoice">
        <div class="fp-email-row__content" style="flex:1;">
          <div class="fp-email-row__address">Enter a different address...</div>
          <div class="fp-email-manual" id="fpEmailManualWrap" style="display:none;">
            <input type="email" id="fpEmailManualInput" placeholder="name@example.com"
              class="maTextInput" autocomplete="email" />
          </div>
        </div>
      </div>`;

    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Select email address">
        <header class="maModal__hdr">
          <div>
            <div class="maModal__title">Select Email Address</div>
            <div class="maModal__subtitle">${escapeHtml(state.current?.name || "")} &bull; ${escapeHtml(maskGHIN(state.current?.playerGHIN || ""))}</div>
          </div>
          <button class="btn btnLink" id="fpEmailModalClose" aria-label="Close">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </header>
        <div class="maModal__body">
          ${_buildEmailSectionLabels()}
          ${rows}
          ${manualRow}
        </div>
        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button class="btn btnPrimary" id="fpEmailModalCancel">Cancel</button>
            <button class="btn btnSecondary" id="fpEmailModalSave">Use This Email</button>
          </div>
        </footer>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add("maOverlayOpen");

    // Wire events
    overlay.querySelector("#fpEmailModalClose")?.addEventListener("click", _destroyEmailModal);
    overlay.querySelector("#fpEmailModalCancel")?.addEventListener("click", _destroyEmailModal);
    overlay.addEventListener("click", e => { if (e.target === overlay) _destroyEmailModal(); });

    overlay.querySelectorAll(".fp-email-row:not(.is-masked)").forEach(row => {
      row.addEventListener("click", () => _selectEmailRow(row, overlay));
    });

    overlay.querySelector("#fpEmailManualInput")?.addEventListener("input", e => {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim());
      overlay.querySelector("#fpEmailModalSave").disabled = !valid;
    });
    overlay.querySelector("#fpEmailManualInput")?.addEventListener("click", e => e.stopPropagation());

    overlay.querySelector("#fpEmailModalSave")?.addEventListener("click", () => {
      const selected = overlay.querySelector(".fp-email-row.is-selected");
      if (!selected) return;
      if (selected.dataset.source === "manual") {
        const val = overlay.querySelector("#fpEmailManualInput")?.value.trim() || "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return;
        updateEmailField(val, "manual");
      } else {
        updateEmailField(selected.dataset.email, selected.dataset.source);
      }
      _destroyEmailModal();
    });

    // Auto-select first non-masked row
    const firstSelectable = overlay.querySelector(".fp-email-row:not(.is-masked)");
    if (firstSelectable) _selectEmailRow(firstSelectable, overlay);
  }

  function _buildEmailSectionLabels() {
    // Section labels are injected via renderEmailSections below — 
    // we return empty here and inject them inline in the rows loop above
    return "";
  }

  function _selectEmailRow(row, overlay) {
    overlay.querySelectorAll(".fp-email-row").forEach(r => r.classList.remove("is-selected"));
    row.classList.add("is-selected");
    const radio = row.querySelector("input[type=radio]");
    if (radio) radio.checked = true;

    const isManual = row.dataset.source === "manual";
    const manualWrap = overlay.querySelector("#fpEmailManualWrap");
    if (manualWrap) manualWrap.style.display = isManual ? "block" : "none";

    const saveBtn = overlay.querySelector("#fpEmailModalSave");
    if (saveBtn) {
      if (isManual) {
        const val = overlay.querySelector("#fpEmailManualInput")?.value.trim() || "";
        saveBtn.disabled = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      } else {
        saveBtn.disabled = false;
      }
    }
  }

  function _destroyEmailModal() {
    const existing = document.getElementById("fpEmailModal");
    if (existing) existing.remove();
    document.body.classList.remove("maOverlayOpen");
  }

  // ── Add Group modal ─────────────────────────────────────────────────────────

  function openGroupModal() {
    _destroyGroupModal();
    const overlay = document.createElement("div");
    overlay.className = "maModalOverlay is-open";
    overlay.id = "fpGroupModal";

    overlay.innerHTML = `
      <section class="maModal fp-group-modal" role="dialog" aria-modal="true" aria-label="Add group">
        <header class="maModal__hdr">
          <div>
            <div class="maModal__title">Add Group</div>
            <div class="maModal__subtitle">${escapeHtml(state.current?.name || "")}</div>
          </div>
          <button class="btn btnLink" id="fpGroupModalClose" aria-label="Close">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </header>
        <div class="maModal__body">
          <input type="text" id="fpGroupModalInput" class="maTextInput"
            placeholder="Group name..." autocomplete="off" />
        </div>
        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button class="btn btnPrimary" id="fpGroupModalCancel">Cancel</button>
            <button class="btn btnSecondary" id="fpGroupModalSave" disabled>Add Group</button>
          </div>
        </footer>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add("maOverlayOpen");

    const input   = overlay.querySelector("#fpGroupModalInput");
    const saveBtn = overlay.querySelector("#fpGroupModalSave");

    input?.addEventListener("input", () => {
      saveBtn.disabled = normalizeGroupName(input.value).length < 2;
    });
    input?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !saveBtn.disabled) _applyGroupModal(overlay);
    });

    overlay.querySelector("#fpGroupModalClose")?.addEventListener("click", _destroyGroupModal);
    overlay.querySelector("#fpGroupModalCancel")?.addEventListener("click", _destroyGroupModal);
    overlay.querySelector("#fpGroupModalSave")?.addEventListener("click", () => _applyGroupModal(overlay));
    overlay.addEventListener("click", e => { if (e.target === overlay) _destroyGroupModal(); });

    setTimeout(() => input?.focus(), 50);
  }

  function _applyGroupModal(overlay) {
    const input = overlay.querySelector("#fpGroupModalInput");
    const g = normalizeGroupName(input?.value || "");
    if (!g) return;
    if (!state.groups.includes(g)) state.groups.push(g);
    state.selectedGroups.add(g);
    renderFilters();
    renderGroupChips();
    _destroyGroupModal();
  }

  function _destroyGroupModal() {
    const existing = document.getElementById("fpGroupModal");
    if (existing) existing.remove();
    document.body.classList.remove("maOverlayOpen");
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  async function openFromLaunchGHIN(playerGHIN) {
    const ghin = trim(playerGHIN);
    if (!ghin) return;

    const fav = state.favorites.find(f => String(f.playerGHIN) === ghin) || null;
    if (fav) {
      await _openFormWithSources(Object.assign({}, fav, { __existing: true }), true);
      return;
    }

    const row = await fetchGhinById(ghin);
    if (!row) {
      await _openFormWithSources({ playerGHIN: ghin, name: "", email: "", mobile: "", memberId: "", groups: [], __existing: false }, true);
      return;
    }

    await _openFormWithSources({
      playerGHIN: String(row.ghin || ghin),
      name:       String(row.name || ""),
      lname:      String(row.last_name || ""),
      gender:     String(row.gender || ""),
      hi:         String(row.hi || ""),
      email:      String(row.email || ""),
      mobile:     String(row.mobile || ""),
      memberId:   String(row.memberId || ""),
      groups:     [],
      __existing: false,
    }, true);
  }

  async function openFromGhinSelection(ghin) {
    const row = await fetchGhinById(ghin);
    await _openFormWithSources({
      playerGHIN: String(row?.ghin || ghin || ""),
      name:       String(row?.name || ""),
      lname:      String(row?.last_name || ""),
      gender:     String(row?.gender || ""),
      hi:         String(row?.hi || ""),
      email:      String(row?.email || ""),
      mobile:     String(row?.mobile || ""),
      memberId:   String(row?.memberId || ""),
      groups:     [],
      __existing: false,
    }, true);
  }

  async function _openFormWithSources(fav, suppressFooter) {
    //console.log("[_openFormWithSources] fav.email:", fav.email, "fav.playerGHIN:", fav.playerGHIN);
    await loadEmailSources(fav.playerGHIN, fav.email || "");
    openForm(fav, suppressFooter);
  }

  function openForm(fav, suppressFooter) {
    const isEdit = !!fav.__existing;
    if (state.launchMode !== "registrations") state.returnAction = "list";

    state.current = {
      playerGHIN: safe(fav.playerGHIN),
      name:       safe(fav.name),
      lname:      safe(fav.lname),
      gender:     safe(fav.gender),
      hi:         safe(fav.hi),
      email:      safe(fav.email),
      mobile:     safe(fav.mobile),
      memberId:   safe(fav.memberId),
      groups:     Array.isArray(fav.groups) ? fav.groups.slice() : [],
    };

    state.selectedGroups = new Set(state.current.groups || []);

    el.list.style.display = "none";
    el.form.style.display = "";
    if (el.controls) el.controls.style.display = "none";

    setHeaderActionsFor("form");
    if (!suppressFooter) setFooterFor("form");

    // Player identity row
    const name = state.current.name || "Selected Player";
    if (el.formAvatar) {
      el.formAvatar.className = `maListRow__avatar fpAvatar ${avatarColor(0)}`;
      el.formAvatar.textContent = avatarInitials(name);
    }
    if (el.formSub)  el.formSub.textContent  = name;
    if (el.formGhin) el.formGhin.textContent = "GHIN " + maskGHIN(state.current.playerGHIN);

    if (el.mobile)   el.mobile.value   = state.current.mobile   || "";
    if (el.memberId) el.memberId.value = state.current.memberId || "";

    // Set email from best available source
    const best = bestEmail();
    const bestSource = state.emailSources.find(s => s.email === best);
    updateEmailField(best || state.current.email, bestSource?.source || (state.current.email ? "addressbook" : ""));

    renderGroupChips();
  }

  // ── Group chips ─────────────────────────────────────────────────────────────

  function normalizeGroupName(s) {
    return trim(s).replace(/\s+/g, " ");
  }

  function renderGroupChips() {
    const all = (state.groups || []).slice();
    state.selectedGroups.forEach(g => { if (g && !all.includes(g)) all.push(g); });
    all.sort((a, b) => String(a).localeCompare(String(b)));

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

  // ── Save / Delete / Cancel ──────────────────────────────────────────────────

  async function doDelete(playerGHIN) {
    try {
      const res = await MA.postJson(MA.paths.favPlayersDelete, { playerGHIN });
      if (!res || !res.ok) throw new Error(res?.message || "Delete failed.");
      state.favorites = Array.isArray(res.payload?.favorites)
        ? res.payload.favorites
        : state.favorites.filter(f => String(f.playerGHIN) !== String(playerGHIN));
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

    const emailVal  = state.selectedEmail || (el.email ? el.email.value.trim() : "");
    const mobileVal = el.mobile ? el.mobile.value.trim() : "";

    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      if (MA.setStatus) MA.setStatus("Invalid email address.", "error");
      return;
    }

    if (isMaskedEmail(emailVal)) {
      if (MA.setStatus) MA.setStatus("Please select a valid email address.", "error");
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
      playerGHIN:   state.current.playerGHIN,
      email:        emailVal,
      mobile:       mobileVal,
      playerName:   state.current.name,
      playerLName:  state.current.lname,
      playerGender: state.current.gender,
      playerHI:     state.current.hi,
      memberId:     el.memberId ? el.memberId.value : "",
      groups:       Array.from(state.selectedGroups || []),
    };

    try {
      const res = await MA.postJson(MA.paths.favPlayersSave, payload);
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");
      state.favorites = Array.isArray(res.payload?.favorites) ? res.payload.favorites : state.favorites;
      state.groups    = Array.isArray(res.payload?.groups)    ? res.payload.groups    : state.groups;

      if (MA.setStatus) MA.setStatus("Saved.", "info");

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

  // ── Add new (GHIN search) ───────────────────────────────────────────────────

  function openAddNew() {
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
          if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
        }
      },
    });
  }

  // ── Wire events ─────────────────────────────────────────────────────────────

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

    // Email pick button → open email modal
    if (el.emailPickBtn) {
      el.emailPickBtn.addEventListener("click", () => {
        openEmailModal();
      });
    }

    // Add Group button → open group modal
    if (el.btnAddGroup) {
      el.btnAddGroup.addEventListener("click", openGroupModal);
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────────

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