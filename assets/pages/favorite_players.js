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
    emailSources: [],
    selectedEmail: "",
    selectedEmailSource: "",

    // Twilio mobile lookup cache — { phone, valid, carrier, gateway, type, error }
    // Keyed on the digits-only phone string. Cleared when mobile field changes.
    twilioResult: null,

    // Import
    importParsedRows:    [],
    importValidatedRows: [],
    importColumnMap:     {},
  };

  const el = {
    list:       document.getElementById("fpList"),
    form:       document.getElementById("fpForm"),
    controls:   document.querySelector(".maControlArea"),
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

    // Import section
    importSection:    document.getElementById("fpImport"),
    importBtnWrap:    document.getElementById("fpImportBtnWrap"),
    importBtn:        document.getElementById("fpBtnImport"),
    importUploadCard: document.getElementById("fpImportUploadCard"),
    importCapacity:   document.getElementById("fpImportCapacity"),
    importDropZone:   document.getElementById("fpDropZone"),
    importBrowseBtn:  document.getElementById("fpImportBrowseBtn"),
    importFileInput:  document.getElementById("fpImportFileInput"),
    importTemplateBtn:document.getElementById("fpImportTemplateBtn"),
    importReviewCard: document.getElementById("fpImportReviewCard"),
    importRetryBtn:   document.getElementById("fpImportRetryBtn"),
    importCommitBtn:  document.getElementById("fpImportCommitBtn"),
    importTableBody:  document.getElementById("fpImportTableBody"),
    importTable:      document.getElementById("fpImportTable"),
    importSummary:    document.getElementById("fpImportSummary"),
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
    } else if (mode === "import") {
      MA.chrome.setActions({
        left:   { show: false },
        right:  { show: false },
        footer: null,
        page:   { label: "← Go Back", onClick: () => showList(), className: "btnSecondary" }
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
      const hay = (
        safe(f.name) + " " +
        safe(f.playerGHIN) + " " +
        safe(f.email) + " " +
        safe(f.memberId) + " " +
        (Array.isArray(f.groups) ? f.groups.join(" ") : "")
      ).toLowerCase();
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
    el.form.style.display   = "none";
    if (el.importSection) el.importSection.style.display = "none";
    el.list.style.display   = "";
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
      console.warn("[FP] getPlayerEmails failed:", {
        message:  e?.message || String(e),
        userGHIN: state.context?.userGHIN || "unknown",
        userName: state.context?.userName || "unknown",
      });
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
    state.twilioResult = null;
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
      console.error("[FP] doDelete failed:", {
        message:  e?.message || String(e),
        userGHIN: state.context?.userGHIN || "unknown",
        userName: state.context?.userName || "unknown",
      });
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }
  }

  async function doSave() {
    if (!state.current) return;

    const emailVal  = state.selectedEmail || (el.email  ? el.email.value.trim()  : "");
    const mobileRaw = el.mobile ? el.mobile.value.trim() : "";
    const mobileVal = mobileRaw.replace(/\D/g, "");  // digits only

    // ── Phase 1: Field validation (no API calls) ──────────────────────────
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      if (MA.setStatus) MA.setStatus("Invalid email address.", "error");
      return;
    }

    if (isMaskedEmail(emailVal)) {
      if (MA.setStatus) MA.setStatus("Please select a valid email address.", "error");
      return;
    }

    if (mobileVal && mobileVal.length < 10) {
      if (MA.setStatus) MA.setStatus("Invalid mobile number (10 digits required).", "error");
      if (el.mobile) el.mobile.focus();
      return;
    }

    // ── Phase 2: Twilio mobile validation (only if mobile present) ────────
    let resolvedCarrier = "";

    if (mobileVal) {
      const cached    = state.twilioResult;
      const needsLookup = !cached || cached.phone !== mobileVal;

      if (needsLookup) {

        try {
          const validatePath = MA.paths.validateMobile;
          if (!validatePath) throw new Error("validateMobile path not configured.");

          const res = await MA.postJson(validatePath, { mobile: mobileVal });

          if (!res || !res.valid) {
            if (MA.setStatus) MA.setStatus(res?.message || "Mobile number is invalid.", "error");
            return;
          }

          // Cache result
          state.twilioResult = {
            phone:   mobileVal,
            valid:   true,
            carrier: res.carrier || "",
            gateway: res.gateway || "",
            type:    res.type    || "mobile",
            error:   null,
          };

          resolvedCarrier = res.carrier || "";

        } catch (e) {
          if (MA.setStatus) MA.setStatus("Mobile validation failed. Please try again.", "error");
          return;
        }

      } else {
        // Use cached result
        resolvedCarrier = cached.carrier || "";
      }
    } else {
      // Mobile cleared — invalidate cache
      state.twilioResult = null;
    }

    // ── Phase 3: Server save ──────────────────────────────────────────────
    const payload = {
      playerGHIN:   state.current.playerGHIN,
      email:        emailVal,
      mobile:       mobileVal,
      carrier:      resolvedCarrier,            // ← Twilio-resolved
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
      console.error("[FP] doSave failed:", {
        message:  e?.message || String(e),
        userGHIN: state.context?.userGHIN || "unknown",
        userName: state.context?.userName || "unknown",
      });
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

  // ── Import busy overlay ─────────────────────────────────────────────────────

  function _importEnsureOverlay() {
    if (document.getElementById("fpBusyOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "fpBusyOverlay";
    overlay.className = "maModalOverlay";
    const modal = document.createElement("section");
    modal.className = "maModal";
    modal.style.maxWidth = "320px";
    modal.innerHTML = `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Please wait</div>
          <div class="maModal__subtitle" id="fpBusyMessage">Working...</div>
        </div>
      </header>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function _importShowOverlay(message) {
    _importEnsureOverlay();
    const msg = document.getElementById("fpBusyMessage");
    if (msg) msg.textContent = message || "Working...";
    document.getElementById("fpBusyOverlay")?.classList.add("is-open");
  }

  function _importHideOverlay() {
    document.getElementById("fpBusyOverlay")?.classList.remove("is-open");
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  const FP_IMPORT_BATCH_MAX   = 100;
  const FP_IMPORT_DESKTOP_MIN = 640; // px — import hidden below this width

  const FP_IMPORT_SYNONYMS = {
    ghin:      ["ghin", "golf network", "handicap id", "ghin #", "network #", "ghin number"],
    firstName: ["first", "firstname", "first name", "given name", "fname"],
    lastName:  ["last", "lastname", "last name", "surname", "lname"],
    email:     ["email", "e-mail", "email address", "emailaddress"],
    mobile:    ["mobile", "phone", "cell", "mobile phone", "telephone"],
    memberId:  ["member", "memberid", "member id", "member #", "local id", "membership #", "club id"],
    groups:    ["groups", "tags", "group", "tag", "category", "categories"],
  };

  const FP_IMPORT_TEMPLATE_HEADERS = [
    "GHIN", "FirstName", "LastName", "Email", "Mobile", "MemberID", "Groups"
  ];

  function importShow() {
    el.list.style.display = "none";
    el.form.style.display = "none";
    if (el.controls) el.controls.style.display = "none";
    if (el.importSection) el.importSection.style.display = "";
    setHeaderActionsFor("import");
    setFooterFor("list");
    _importResetToUpload();
    _importRenderCapacity();
  }

  function _importResetToUpload() {
    if (el.importUploadCard) el.importUploadCard.style.display = "";
    if (el.importReviewCard) el.importReviewCard.style.display = "none";
    if (el.importDropZone)   el.importDropZone.style.display   = "";
    state.importParsedRows    = [];
    state.importValidatedRows = [];
  }

  function _importRenderCapacity() {
    if (!el.importCapacity) return;
    const count = Array.isArray(state.favorites) ? state.favorites.length : 0;
    const limit = window.__INIT__?.favoritesLimit ?? 200;
    el.importCapacity.textContent = `You have ${count} of ${limit} maximum favorites`;
  }

  function _importSniffColumns(headers) {
    const map = {};
    const normalise = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
    headers.forEach((h, idx) => {
      const norm = normalise(h);
      for (const [field, synonyms] of Object.entries(FP_IMPORT_SYNONYMS)) {
        if (map[field] !== undefined) continue;
        if (synonyms.some((s) => norm.includes(s))) map[field] = idx;
      }
    });
    return map;
  }

  function _importHandleFile(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      if (MA.setStatus) MA.setStatus("Please upload an .xlsx, .xls, or .csv file.", "warn");
      return;
    }
    if (typeof XLSX === "undefined") {
      if (MA.setStatus) MA.setStatus("File parser not loaded. Please refresh and try again.", "danger");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!raw || raw.length < 2) {
          if (MA.setStatus) MA.setStatus("File appears empty. Please check and try again.", "warn");
          return;
        }
        _importParseRows(raw);
      } catch (err) {
        console.error("[fpImport] parse error:", {
          message:  err?.message || String(err),
          url:      MA.paths?.favPlayersImport || "path not set",
          userGHIN: state.context?.userGHIN || "unknown",
          userName: state.context?.userName || "unknown",
          stack:    err?.stack || "no stack",
        });
        if (MA.setStatus) MA.setStatus("Could not read the file. Please check the format and try again.", "danger");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function _importParseRows(raw) {
    const headers = raw[0].map((h) => String(h).trim());
    state.importColumnMap = _importSniffColumns(headers);

    const get = (row, field) => {
      const idx = state.importColumnMap[field];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };

    const rows = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (row.every((c) => String(c).trim() === "")) continue;

      const ghin     = get(row, "ghin").replace(/\D/g, "");
      const groups   = get(row, "groups")
        ? get(row, "groups").split("|").map((g) => g.trim()).filter(Boolean)
        : [];

      rows.push({
        rowNum:    i,
        ghin,
        firstName: get(row, "firstName"),
        lastName:  get(row, "lastName"),
        email:     get(row, "email"),
        mobile:    get(row, "mobile"),
        memberId:  get(row, "memberId"),
        groups,
        gender:    "",
        status:    ghin ? "pending" : "error",
        statusMsg: ghin ? "" : "No GHIN",
      });
    }

    if (rows.length === 0) {
      if (MA.setStatus) MA.setStatus("No data rows found in file.", "warn");
      return;
    }
    if (rows.length > FP_IMPORT_BATCH_MAX) {
      if (MA.setStatus) MA.setStatus(
        `File has ${rows.length} rows. Maximum per import is ${FP_IMPORT_BATCH_MAX}. Please split your file.`,
        "warn"
      );
      return;
    }

    state.importParsedRows = rows;
    _importValidateGHINs(rows);
  }

  async function _importValidateGHINs(rows) {
    const pending = rows.filter((r) => r.status === "pending");
    if (!pending.length) { _importRenderReview(rows); return; }

    const existingGhins = new Set(
      (state.favorites || []).map((f) => String(f.playerGHIN))
    );

    _importShowOverlay(`Validating 1 of ${pending.length}...`);

    for (let i = 0; i < pending.length; i++) {
      const row = pending[i];
      _importShowOverlay(`Validating ${i + 1} of ${pending.length}...`);

      try {
        // Reuse the existing fetchGhinById already in this file
        const result = await fetchGhinById(row.ghin);
        if (!result) {
          row.status    = "error";
          row.statusMsg = "Invalid GHIN";
        } else {
          if (!row.firstName) row.firstName = safe(result.name    || "").split(" ")[0] || "";
          if (!row.lastName)  row.lastName  = safe(result.last_name || "");
          if (!row.gender)    row.gender    = safe(result.gender  || "");
          row.status    = existingGhins.has(row.ghin) ? "merge" : "new";
          row.statusMsg = row.status === "merge" ? "Merge" : "OK";
        }
      } catch (err) {
        console.warn("[fpImport] GHIN lookup failed:", {
          ghin:     row.ghin,
          message:  err?.message || String(err),
          userGHIN: state.context?.userGHIN || "unknown",
          userName: state.context?.userName || "unknown",
        });
        row.status    = "error";
        row.statusMsg = "Lookup failed";
      }

      const idx = rows.findIndex((r) => r.rowNum === row.rowNum);
      if (idx !== -1) rows[idx] = row;
    }

    _importHideOverlay();
    state.importValidatedRows = rows;
    _importRenderReview(rows);
  }

  function _importRenderReview(rows) {
    if (el.importUploadCard) el.importUploadCard.style.display = "none";
    if (el.importDropZone)   el.importDropZone.style.display   = "none";
    if (el.importReviewCard) el.importReviewCard.style.display = "";

    // Add colgroup once
    if (el.importTable && !el.importTable.querySelector("colgroup")) {
      const cg = document.createElement("colgroup");
      [36, 90, 150, 170, 110, 100, null, 80].forEach((w) => {
        const col = document.createElement("col");
        if (w) col.style.width = w + "px";
        cg.appendChild(col);
      });
      el.importTable.prepend(cg);
    }

    let newCount = 0, mergeCount = 0, errCount = 0;
    const frag = document.createDocumentFragment();

    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      const statusClass =
        row.status === "new"   ? "fpImport__status--ok"    :
        row.status === "merge" ? "fpImport__status--merge"  :
                                 "fpImport__status--err";
      const statusLabel =
        row.status === "new"   ? "OK"          :
        row.status === "merge" ? "Merge"        :
                                 row.statusMsg;

      const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || "—";

      const cell = (val) => val
        ? `<td>${escapeHtml(val)}</td>`
        : `<td class="fpImport__muted">—</td>`;

      tr.innerHTML =
        `<td class="fpImport__muted">${i + 1}</td>` +
        `<td>${escapeHtml(row.ghin) || '<span class="fpImport__muted">—</span>'}</td>` +
        `<td>${escapeHtml(name)}</td>` +
        cell(row.email) +
        cell(row.mobile) +
        cell(row.memberId) +
        cell(row.groups?.length ? row.groups.join(", ") : "") +
        `<td class="fpImport__status ${statusClass}">${escapeHtml(statusLabel)}</td>`;

      frag.appendChild(tr);

      if (row.status === "new")   newCount++;
      if (row.status === "merge") mergeCount++;
      if (row.status === "error") errCount++;
    });

    if (el.importTableBody) {
      el.importTableBody.innerHTML = "";
      el.importTableBody.appendChild(frag);
    }

    const actionable = newCount + mergeCount;
    const parts = [];
    if (newCount)   parts.push(`${newCount} new`);
    if (mergeCount) parts.push(`${mergeCount} will merge`);
    if (errCount)   parts.push(`${errCount} skipped`);

    if (el.importSummary) {
      el.importSummary.textContent = actionable > 0
        ? `${parts.join(" · ")}. Ready to import.`
        : `No valid rows to import. ${errCount} row${errCount !== 1 ? "s" : ""} skipped.`;
    }

    if (el.importCommitBtn) {
      el.importCommitBtn.disabled     = actionable === 0;
      el.importCommitBtn.textContent  = actionable > 0
        ? `Import ${actionable} player${actionable !== 1 ? "s" : ""}`
        : "Import";
    }
  }

  async function _importCommit() {
    const actionable = (state.importValidatedRows || []).filter(
      (r) => r.status === "new" || r.status === "merge"
    );
    if (!actionable.length) return;

    _importShowOverlay("Importing players...");

    try {
      const res = await MA.postJson(MA.paths.favPlayersImport, { rows: actionable });
      _importHideOverlay();

      if (!res?.ok) {
        if (MA.setStatus) MA.setStatus(res?.message ?? "Import failed. Please try again.", "danger");
        return;
      }

      if (Array.isArray(res.payload?.favorites)) {
        state.favorites = res.payload.favorites;
      }
      if (Array.isArray(res.payload?.groups)) {
        state.groups = res.payload.groups;
      }

      const s   = res.payload?.summary ?? {};
      const msg = [
        s.imported ? `${s.imported} added`  : null,
        s.merged   ? `${s.merged} updated`  : null,
        s.skipped  ? `${s.skipped} skipped` : null,
      ].filter(Boolean).join(", ");

      if (MA.setStatus) MA.setStatus(`Import complete — ${msg}.`, "success");
      showList();

    } catch (err) {
      _importHideOverlay();
      console.error("[fpImport] commit error:", {
        message:  err?.message || String(err),
        status:   err?.status  || err?.statusCode || "unknown",
        url:      MA.paths?.favPlayersImport || "path not set",
        rowCount: actionable.length,
        userGHIN: state.context?.userGHIN || "unknown",
        userName: state.context?.userName || "unknown",
        stack:    err?.stack || "no stack",
      });
      if (MA.setStatus) MA.setStatus("Import failed due to a network error. Please try again.", "danger");
    }
  }

  function _importDownloadTemplate() {
    if (typeof XLSX === "undefined") {
      if (MA.setStatus) MA.setStatus("Template generator not loaded. Please refresh and try again.", "warn");
      return;
    }
    const sampleRow = ["4821093", "John", "Smith", "john@example.com", "555-0100", "M-0001", "Tuesday Group|Members"];
    const ws = XLSX.utils.aoa_to_sheet([FP_IMPORT_TEMPLATE_HEADERS, sampleRow]);
    ws["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Favorite Players");
    XLSX.writeFile(wb, "favorite_players_import_template.xlsx");
  }

  function _importWireEvents() {
    // Only show Import button on desktop/tablet
    if (window.innerWidth >= FP_IMPORT_DESKTOP_MIN && el.importBtnWrap) {
      el.importBtnWrap.style.display = "";
    }

    el.importBtn?.addEventListener("click", () => importShow());

    el.importBrowseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      el.importFileInput?.click();
    });

    el.importDropZone?.addEventListener("click", () => el.importFileInput?.click());

    el.importDropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.importDropZone.classList.add("is-dragover");
    });
    el.importDropZone?.addEventListener("dragleave", () => {
      el.importDropZone.classList.remove("is-dragover");
    });
    el.importDropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      el.importDropZone.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) _importHandleFile(file);
    });

    el.importFileInput?.addEventListener("change", (e) => {
      const file = e.target?.files?.[0];
      if (file) _importHandleFile(file);
      e.target.value = "";
    });

    el.importTemplateBtn?.addEventListener("click", _importDownloadTemplate);
    el.importRetryBtn?.addEventListener("click", _importResetToUpload);
    el.importCommitBtn?.addEventListener("click", _importCommit);
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

    // Import
    _importWireEvents();
  }

  // ── Boot ────────────────────────────────────────────────────────────────────

  (async function () {
    try {
      wireEvents();
      await initPage();
    } catch (e) {
      console.error("[FP] boot failed:", {
        message:  e?.message || String(e),
        userGHIN: state.context?.userGHIN || window.__INIT__?.context?.userGHIN || "unknown",
        userName: state.context?.userName || window.__INIT__?.context?.userName || "unknown",
        stack:    e?.stack || "no stack",
      });
      if (MA.setStatus) MA.setStatus(String(e.message || e), "error");
    }
  })();

})();