/* /assets/pages/game_maintenance.js
   Game Maintenance page controller (GoDaddy/PHP).
   - Uses /assets/js/ma_shared.js for MA.apiAdminGames + MA.chrome helpers.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  // Canonical client POST (centralized auth-fail -> login lives inside MA.postJson)
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  // API bases injected by PHP (preferred). Fallbacks are last-resort.
  const routes = MA.routes || {};
  const gmApiBase    = routes.apiGameMaint || MA.paths?.apiGameMaint || "/api/game_maintenance";
  const adminApiBase = routes.apiAdminGames || MA.paths?.apiAdminGames || "/api/admin_games";
  const ghinApiBase  = routes.apiGHIN      || MA.paths?.apiGHIN      || "/api/GHIN";

  function apiCall(base, endpointFile, payloadObj) {
    const baseClean = String(base || "").replace(/\/$/, "");
    const fileClean = String(endpointFile || "").replace(/^\//, "");
    const url = `${baseClean}/${fileClean}`;
    return postJson(url, { payload: payloadObj || {} });
  }

  const apiGM   = (file, payload) => apiCall(gmApiBase, file, payload);
  const apiGHIN = (file, payload) => apiCall(ghinApiBase, file, payload);

  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : (msg, level) => {
        const el = document.getElementById("chromeStatusLine");
        if (!el) return;
        el.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
        el.textContent = msg || "";
      };


  // ---- DOM ----
  const el = {
    title: document.getElementById("gmTitle"),
    ggid: document.getElementById("gmGGID"),
    tomethod: document.getElementById("gmTOMethod"),
    playDate: document.getElementById("gmPlayDate"),
    hour: document.getElementById("gmPlayHour"),
    minute: document.getElementById("gmPlayMin"),
    ampm: document.getElementById("gmPlayAmpm"),

    holesRow: document.getElementById("gmHolesRow"),
    privacyRow: document.getElementById("gmPrivacyRow"),
    privacyHint: document.getElementById("gmPrivacyHint"),

    pickCourseBtn: document.getElementById("gmPickCourseBtn"),
    confirmBtn: document.getElementById("gmCourseConfirmBtn"),
    courseLine1: document.getElementById("gmCourseLine1"),
    courseLine2: document.getElementById("gmCourseLine2"),

    teeCount: document.getElementById("gmTeeCount"),
    teeInterval: document.getElementById("gmTeeInterval"),
    countLabel: document.getElementById("gmCountLabel"),
    intervalField: document.getElementById("gmIntervalField"),
    teeHint: document.getElementById("gmTeePreviewHint"),

    hcEffRow: document.getElementById("gmHcEffRow"),
    hcDate: document.getElementById("gmHcDate"),
    hcHint: document.getElementById("gmHcHint"),
    hcRefreshBtn: document.getElementById("gmRefreshHcBtn"),

    comments: document.getElementById("gmComments"),

    // Buddy Groups Modal
    buddyModal:         document.getElementById("gmBuddyGroupsModal"),
    buddyCloseBtn:      document.getElementById("gmBuddyGroupsCloseBtn"),
    buddyCancelBtn:     document.getElementById("gmBuddyGroupsCancelBtn"),
    buddyApplyBtn:      document.getElementById("gmBuddyGroupsApplyBtn"),
    buddySelectAllBtn:  document.getElementById("gmBuddySelectAllBtn"),
    buddySelectedCount: document.getElementById("gmBuddySelectedCount"),
    buddyTagRows:       document.getElementById("gmBuddyTagRows"),

    // Course Modal
    modal: document.getElementById("gmCourseModal"),
    modalClose: document.getElementById("gmCourseCloseBtn"),
    tabBar: document.getElementById("gmCourseTabs"),
    searchControls: document.getElementById("gmCourseSearchControls"),
    searchText: document.getElementById("gmSearchText"),
    searchState: document.getElementById("gmSearchState"),
    searchBtn: document.getElementById("gmSearchBtn"),
    rows: document.getElementById("gmCourseRows"),
    empty: document.getElementById("gmCourseEmpty"),
  };

  // ---- State ----
  const state = {
    mode: (window.__MA_PAGE__ && window.__MA_PAGE__.mode) || (document.body.dataset.mode || "edit"),
    ggid: null,
    game: null,
    dirty: false,
    playerCount: 0,
    courseTab: "recent",
    recentCourses: [],
    searchCourses: [],
    busy: false,
    availableTags:   [],   // distinct tag strings from admin's favorites (from __INIT__)
    privacyGroups:   [],   // committed selection — [] means all favorites
    buddyGroupsDraft: [],  // in-modal working copy; committed on Apply, discarded on Cancel
  };

  // ---- Utils ----
  function pad2(n) { n = parseInt(n, 10); return (n < 10 ? "0" : "") + n; }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) setStatus("Unsaved changes.", "warn");
    else setStatus("", "");
    applyChrome();
  }

  function isoToParts(iso) {
    if (!iso || typeof iso !== "string") return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function hhmmFromDbTime(t) {
    if (!t) return "";
    const s = String(t).trim();
    const m = s.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "";
  }

  function partsFromHHMM(hhmm) {
    const m = String(hhmm || "").match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) };
  }

  function to12h(hh, mm) {
    let h = hh % 12;
    if (h === 0) h = 12;
    const ampm = hh >= 12 ? "PM" : "AM";
    return { hour12: h, minute: mm, ampm };
  }

  function to24h(hour12, minute, ampm) {
    let h = parseInt(hour12, 10);
    const m = parseInt(minute, 10);
    const ap = String(ampm || "AM").toUpperCase() === "PM" ? "PM" : "AM";
    if (h === 12) h = (ap === "AM") ? 0 : 12;
    else if (ap === "PM") h = h + 12;
    return { hh: h, mm: m };
  }

  function format12hForList(hh, mm) {
    const p = to12h(hh, mm);
    return `${pad2(p.hour12)}:${pad2(p.minute)} ${p.ampm}`;
  }

  function buildTeeTimeList(playHHMM, cnt, intervalMin) {
    const p = partsFromHHMM(playHHMM);
    if (!p) return [];
    const out = [];
    const base = new Date(2000, 0, 1, p.hh, p.mm, 0, 0);
    const n = Math.max(1, parseInt(cnt || 0, 10) || 1);
    const step = Math.max(1, parseInt(intervalMin || 0, 10) || 1);
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getTime() + i * step * 60000);
      out.push(format12hForList(d.getHours(), d.getMinutes()));
    }
    return out;
  }

  function pickRowValue(row, value) {
    if (!row) return;
    row.querySelectorAll(".gmChoiceBtn").forEach(btn => {
      btn.classList.toggle("is-on", btn.dataset.value === value);
    });
  }

  function readChoice(row) {
    const on = row ? row.querySelector(".gmChoiceBtn.is-on") : null;
    return on ? on.dataset.value : "";
  }

  function setBusy(on) {
    state.busy = !!on;
    // Disable/enable the footer Save button during async operations.
    // (Replaces the old syncActionDisabled that targeted chromeBtnRight.)
    if (typeof MA.chrome.setFooterSaveDisabled === "function") {
      MA.chrome.setFooterSaveDisabled(!!on);
    }
  }

  function ensureSavingOverlay() {
    if (document.getElementById('gmBusyOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gmBusyOverlay';
    overlay.className = 'maModalOverlay';

    const modal = document.createElement('section');
    modal.className = 'maModal';
    modal.style.maxWidth = '320px';

    modal.innerHTML = `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Please wait</div>
          <div class="maModal__subtitle" id="gmBusyMessage">Saving...</div>
        </div>
      </header>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function showSavingOverlay(message) {
    ensureSavingOverlay();
    const overlay = document.getElementById('gmBusyOverlay');
    const msg = document.getElementById('gmBusyMessage');
    if (msg) msg.textContent = message || 'Saving...';
    if (overlay) overlay.classList.add('is-open');
  }

  function hideSavingOverlay() {
    const overlay = document.getElementById('gmBusyOverlay');
    if (overlay) overlay.classList.remove('is-open');
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "Send Message to Players", action: onNotify },
      { separator: true },
      { label: "Delete Game",             action: onDeleteGame, danger: true }
    ]);
  }

  async function onDeleteGame() {
    if (!state.ggid) return;
    if (!confirm("Are you sure you want to delete this game? This cannot be undone.")) return;

    setBusy(true);
    try {
      const res = await apiCall(adminApiBase, "deleteGame.php", { ggid: state.ggid });
      if (!res || !res.ok) throw new Error(res?.message || "Delete failed.");

      setStatus("Game deleted.", "success");
      if (typeof MA.routerGo === "function") MA.routerGo("admin");
      else window.location.assign((MA.paths?.routerApi || "/api/session/pageRouter.php") + "?action=admin&redirect=1");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
      setBusy(false);
    }
  }

  function onNotify() {
    if (!state.ggid) return;
    if (MA.notify && typeof MA.notify.open === "function") {
      MA.notify.open({
        ggid:    state.ggid,
        apiPath: MA.paths?.apiNotify,
      });
    } else {
      setStatus("Messaging module not loaded.", "error");
    }
  }

  // ----------------------------------------------------------------------------
  // applyChrome
  // ----------------------------------------------------------------------------
  // Key behavior change:
  //   - When isTransactional (add mode or dirty), Save + Cancel move to the
  //     FOOTER action bar. Header buttons are hidden — footer owns that space.
  //   - When clean in edit mode, footer is dismissed and the header right slot
  //     shows the Actions menu as before.
  //   - setBottomNav() runs unconditionally; CSS hides the nav when footer
  //     actions are active (via .maChrome__ftr--actions on the footer element).
  // ----------------------------------------------------------------------------
  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      const modeText = (state.mode === "add") ? "Add Game" : "Edit Game";
      chrome.setHeaderLines(["Game Maintenance", modeText, ""]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      const isTransactional = (state.mode === "add" || state.dirty);

      chrome.setActions({
        // Header left: hidden when transactional (footer owns actions).
        // When clean, also hide — Actions is on the right in edit mode.
        left: { show: false },

        // Header right: Actions menu when clean in edit mode; hidden when dirty
        // (footer Save takes precedence and the header slot is freed up).
        right: isTransactional
          ? { show: false }
          : { show: true, label: "Actions", onClick: openActionsMenu },

        // Footer: Save + Cancel when transactional; null restores the nav.
        footer: isTransactional
          ? {
              save:   { label: "Save",   onClick: () => doSave() },
              cancel: { label: "Cancel", onClick: onBack }
            }
          : null
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"],
        active: "edit",
        disabled: (state.mode === "add") ? ["roster", "pairings", "teetimes", "summary"] : [],
        onNavigate: (id) => MA.routerGo(id)
      });
    }
  }

  function onBack() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
      if (!ok) return;
    }
    if (typeof MA.routerGo === "function") {
      MA.routerGo("admin");
      return;
    }
    const router = MA.paths?.routerApi || "/api/session/pageRouter.php";
    window.location.assign(router + "?action=admin&redirect=1");
  }

  function populateTimeSelects() {
    el.hour.innerHTML = "";
    for (let h = 1; h <= 12; h++) {
      const opt = document.createElement("option");
      opt.value = String(h);
      opt.textContent = String(h);
      el.hour.appendChild(opt);
    }
    el.minute.innerHTML = "";
    for (let m = 0; m <= 59; m++) {
      const opt = document.createElement("option");
      opt.value = pad2(m);
      opt.textContent = pad2(m);
      el.minute.appendChild(opt);
    }
  }

  function setTimeFromDb(dbTime) {
    const hhmm = hhmmFromDbTime(dbTime);
    const p = partsFromHHMM(hhmm);
    if (!p) {
      el.hour.value = "8";
      el.minute.value = "00";
      el.ampm.value = "AM";
      return;
    }
    const t = to12h(p.hh, p.mm);
    el.hour.value = String(t.hour12);
    el.minute.value = pad2(t.minute);
    el.ampm.value = t.ampm;
  }

  function getTimeHHMM() {
    const t = to24h(el.hour.value, el.minute.value, el.ampm.value);
    return `${pad2(t.hh)}:${pad2(t.mm)}`;
  }

  function renderCourseSummary() {
    const g = state.game || {};
    const fac = (g.dbGames_FacilityName || "").trim();
    const course = (g.dbGames_CourseName || "").trim();
    const city = (g.dbGames_FacilityCity || "").trim();
    const st = (g.dbGames_FacilityState || "").trim();

    if (!fac && !course) {
      el.courseLine1.textContent = "No course selected.";
      el.courseLine2.textContent = "";
    } else {
      el.courseLine1.textContent = course ? course : fac;
      el.courseLine2.textContent = [fac, city, st].filter(Boolean).join(" • ");
    }

    // Render confirmation toggle button
    if (el.confirmBtn) {
      const confirmed = !!(g.dbGames_CourseConfirmed == 1 || g.dbGames_CourseConfirmed === true);
      el.confirmBtn.textContent = confirmed ? "Confirmed" : "Tentative";
      el.confirmBtn.className = "btn " + (confirmed ? "btnConfirmed" : "btnTentative");
      el.confirmBtn.dataset.confirmed = confirmed ? "1" : "0";
    }
  }

  function renderTeeHint() {
    const method = String(el.tomethod?.value || state.game?.dbGames_TOMethod || "TeeTimes");
    if (method === "ShotGun") {
      el.teeHint.textContent = "";
      return;
    }

    const hhmm = getTimeHHMM();
    const list = buildTeeTimeList(hhmm, el.teeCount.value, el.teeInterval.value);
    if (!list.length) {
      el.teeHint.textContent = "";
      return;
    }
    el.teeHint.textContent = `Preview: ${list.slice(0, 6).join(", ")}${list.length > 6 ? "…" : ""}`;
  }

  function syncTOMethodUi() {
    const method = String(el.tomethod?.value || state.game?.dbGames_TOMethod || "TeeTimes");
    const isShotgun = (method === "ShotGun");

    if (el.countLabel) {
      el.countLabel.textContent = isShotgun ? "Slot Count" : "Tee Time Count";
    }

    if (el.intervalField) {
      el.intervalField.classList.toggle("is-hidden", isShotgun);
    }
  }

  function renderHcHint() {
    const g = state.game || {};
    const eff = g.dbGames_HCEffectivity || "Latest";
    const dt = (g.dbGames_HCEffectivityDate || "").trim();
    if (eff === "Date" && dt) el.hcHint.textContent = `Handicaps effective on ${dt}.`;
    else el.hcHint.textContent = "Handicaps will use each player's latest index.";
  }

  // Privacy hint definitions — mirrors the visibility model in hydratePlayerGamesList.php.
  // Update both locations if the model changes.
  const PRIVACY_HINTS = {
    "Only Me":  "Only the Game Admin can see this game in the Player Portal.",
    "Players":  "Only players registered to this game can see the game.",
    "Buddies":  "Any player the Game Admin has marked as a favorite can discover and self-enroll, regardless of their club membership.",
    "Club":     "Any member of your club can discover and self-enroll. No outside club members can see this game."
  };

  function renderPrivacyHint() {
    if (!el.privacyHint) return;
    const value = readChoice(el.privacyRow) || (state.game?.dbGames_Privacy ?? "Club");
    const groups = state.privacyGroups;
    let hint = PRIVACY_HINTS[value] || "";

    // When Buddies is active and groups are selected, append group names to hint
    if (value === "Buddies" && Array.isArray(groups) && groups.length > 0) {
      hint = `Visible to favorites in: ${groups.join(", ")}.`;
    }
    el.privacyHint.textContent = hint;
  }

  // ----------------------------------------------------------------------------
  // Buddy Groups Modal
  // Allows the admin to filter Buddies visibility to specific favorite groups.
  //
  // State flow:
  //   state.privacyGroups    — committed value; [] = all favorites (no filter)
  //   state.buddyGroupsDraft — working copy inside the modal; committed on Apply,
  //                            discarded on Cancel
  //
  // Select All writes [] on Apply (semantic "no filter"), not the full tag list.
  // Zero selections blocks Apply — user must select at least one group.
  // ----------------------------------------------------------------------------

  function openBuddyGroupsModal() {
    // Always expand draft to an explicit list of checked tags.
    // privacyGroups=[] means "all favorites" — expand to all tags so the
    // draft is unambiguous. Interpretation (all vs partial) happens only on Apply.
    state.buddyGroupsDraft = (state.privacyGroups.length === 0)
      ? [...state.availableTags]
      : [...state.privacyGroups];
    renderBuddyTagRows();
    document.body.classList.add("maOverlayOpen");
    el.buddyModal.classList.add("is-open");
    el.buddyModal.setAttribute("aria-hidden", "false");
  }

  function closeBuddyGroupsModal() {
    el.buddyModal.classList.remove("is-open");
    el.buddyModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("maOverlayOpen");
  }

  function renderBuddyTagRows() {
    const tags      = state.availableTags;
    const draft     = state.buddyGroupsDraft;
    const container = el.buddyTagRows;
    container.innerHTML = "";

    if (!tags.length) {
      container.innerHTML = `
        <div style="padding:24px 14px;text-align:center;font-size:13px;font-weight:800;color:var(--mutedText);line-height:1.55;">
          No groups defined.<br>Go to Favorites to create groups.
        </div>`;
      el.buddyApplyBtn.disabled = true;
      el.buddySelectAllBtn.style.display = "none";
      el.buddySelectedCount.textContent  = "";
      return;
    }

    el.buddySelectAllBtn.style.display = "";

    // Render one row per tag — checked state is simply whether tag is in draft
    tags.forEach(tag => {
      const isChecked = draft.includes(tag);
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--borderSubtle);";
      row.setAttribute("role", "checkbox");
      row.setAttribute("aria-checked", isChecked ? "true" : "false");
      row.innerHTML = `
        <div class="maCheckbox${isChecked ? " is-checked" : ""}"></div>
        <span style="font-size:13px;font-weight:800;color:var(--ink);font-family:var(--fontFamilyBase);">${tag}</span>`;

      row.addEventListener("click", () => {
        const idx = state.buddyGroupsDraft.indexOf(tag);
        if (idx === -1) state.buddyGroupsDraft.push(tag);
        else state.buddyGroupsDraft.splice(idx, 1);
        renderBuddyTagRows();
      });

      container.appendChild(row);
    });

    // Count + Select All label + Apply gate — pure count, no interpretation
    const count = draft.length;
    el.buddySelectAllBtn.textContent = (count === tags.length) ? "Deselect all" : "Select all";

    if (count === 0) {
      el.buddySelectedCount.textContent = "Select at least one group";
      el.buddyApplyBtn.disabled = true;
    } else if (count === tags.length) {
      el.buddySelectedCount.textContent = "All selected";
      el.buddyApplyBtn.disabled = false;
    } else {
      el.buddySelectedCount.textContent = `${count} of ${tags.length} selected`;
      el.buddyApplyBtn.disabled = false;
    }
  }

  function wireBuddyGroupsModal() {
    // Select All / Deselect All — explicit array, no overloaded meaning
    el.buddySelectAllBtn.addEventListener("click", () => {
      const allChecked = state.buddyGroupsDraft.length === state.availableTags.length;
      state.buddyGroupsDraft = allChecked ? [] : [...state.availableTags];
      renderBuddyTagRows();
    });

    // Cancel — discard draft, revert privacy pill if Buddies was just opened
    el.buddyCancelBtn.addEventListener("click", () => {
      state.buddyGroupsDraft = [];
      // If Buddies wasn't the previously committed privacy, revert the pill
      const committed = state.game?.dbGames_Privacy || "Club";
      if (committed !== "Buddies") {
        pickRowValue(el.privacyRow, committed);
      }
      closeBuddyGroupsModal();
    });

    // Close X — same as Cancel
    el.buddyCloseBtn.addEventListener("click", () => {
      el.buddyCancelBtn.click();
    });

    // Backdrop click — same as Cancel
    el.buddyModal.addEventListener("click", (e) => {
      if (e.target === el.buddyModal) el.buddyCancelBtn.click();
    });

    // Apply — interpret draft here, not during interaction.
    // All tags checked = [] (all favorites, no filter). Partial = explicit list.
    el.buddyApplyBtn.addEventListener("click", () => {
      if (el.buddyApplyBtn.disabled) return;
      const allChecked = state.buddyGroupsDraft.length === state.availableTags.length;
      state.privacyGroups              = allChecked ? [] : [...state.buddyGroupsDraft];
      state.game.dbGames_Privacy       = "Buddies";
      state.game.dbGames_PrivacyGroups = JSON.stringify(state.privacyGroups);
      pickRowValue(el.privacyRow, "Buddies");
      renderPrivacyHint();
      setDirty(true);
      state.buddyGroupsDraft = [];
      closeBuddyGroupsModal();
    });
  }

  function render() {
    const g = state.game || {};

    el.title.value = g.dbGames_Title || "";
    if (el.ggid) {
      const val = String(state.ggid || g.dbGames_GGID || "");
      if (el.ggid.tagName === "INPUT") el.ggid.value = val;
      else el.ggid.textContent = val;
    }

    if (el.tomethod) el.tomethod.value = String(g.dbGames_TOMethod || "TeeTimes");
    el.playDate.value = (g.playDateISO || g.dbGames_PlayDate || "") || "";
    setTimeFromDb(g.dbGames_PlayTime || g.playTimeText || "");
    el.teeCount.value = String(g.dbGames_TeeTimeCnt ?? 3);
    el.teeInterval.value = String(g.dbGames_TeeTimeInterval ?? 9);

    el.comments.value = g.dbGames_Comments || "";

    pickRowValue(el.holesRow, g.dbGames_Holes || "All 18");
    pickRowValue(el.privacyRow, g.dbGames_Privacy || "Club");

    pickRowValue(el.hcEffRow, g.dbGames_HCEffectivity || "PlayDate");
    el.hcDate.value = g.dbGames_HCEffectivityDate || g.dbGames_PlayDate;

    el.hcRefreshBtn.disabled = (state.mode === "add");
    el.hcDate.disabled = (readChoice(el.hcEffRow) !== "Date");

    syncTOMethodUi();
    renderCourseSummary();
    renderTeeHint();
    renderHcHint();
    renderPrivacyHint();
  }

  function bindFieldChange(input, handler) {
    if (!input) return;
    input.addEventListener("input", () => { handler(); setDirty(true); });
    input.addEventListener("change", () => { handler(); setDirty(true); });
  }

  function wireInputs() {
    bindFieldChange(el.title, () => { state.game.dbGames_Title = String(el.title.value || "").trim(); });
    bindFieldChange(el.playDate, () => { state.game.dbGames_PlayDate = String(el.playDate.value || "").trim(); state.game.dbGames_PlayDateISO = state.game.dbGames_PlayDate; });
    if (el.tomethod) {
      el.tomethod.addEventListener("change", () => {
        state.game.dbGames_TOMethod = String(el.tomethod.value || "TeeTimes");
        syncTOMethodUi();
        renderTeeHint();
        setDirty(true);
      });
    }
    [el.hour, el.minute, el.ampm].forEach(sel => {
      sel.addEventListener("change", () => {
        state.game.playTimeText = getTimeHHMM();
        renderTeeHint();
        setDirty(true);
      });
    });

    bindFieldChange(el.teeCount, () => { state.game.dbGames_TeeTimeCnt = parseInt(el.teeCount.value || "0", 10) || 0; renderTeeHint(); });
    bindFieldChange(el.teeInterval, () => { state.game.dbGames_TeeTimeInterval = parseInt(el.teeInterval.value || "0", 10) || 0; renderTeeHint(); });

    bindFieldChange(el.comments, () => { state.game.dbGames_Comments = String(el.comments.value || ""); });

    function wireChoiceRow(row, key) {
      if (!row) return;
      row.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".gmChoiceBtn") : null;
        if (!btn) return;
        pickRowValue(row, btn.dataset.value);
        state.game[key] = btn.dataset.value;
        if (key === "dbGames_HCEffectivity") {
          el.hcDate.disabled = (btn.dataset.value !== "Date");
          if (btn.dataset.value !== "Date") {
            el.hcDate.value = "";
            state.game.dbGames_HCEffectivityDate = "";
          }
          renderHcHint();
        }
        if (key === "dbGames_Privacy") {
          renderPrivacyHint();
        }
        setDirty(true);
      });
    }
    wireChoiceRow(el.holesRow, "dbGames_Holes");
    wireChoiceRow(el.privacyRow, "dbGames_Privacy");
    wireChoiceRow(el.hcEffRow, "dbGames_HCEffectivity");

    // Intercept Buddies button — opens group selector modal instead of
    // selecting directly. Other privacy values wire normally via wireChoiceRow.
    el.privacyRow.addEventListener("click", (e) => {
      const btn = e.target?.closest?.(".gmChoiceBtn");
      if (!btn || btn.dataset.value !== "Buddies") return;
      e.stopImmediatePropagation();
      openBuddyGroupsModal();
    }, true); // capture phase so it fires before wireChoiceRow's bubble handler

    wireBuddyGroupsModal();

    bindFieldChange(el.hcDate, () => { state.game.dbGames_HCEffectivityDate = String(el.hcDate.value || "").trim(); renderHcHint(); });

    document.querySelectorAll(".gmStepBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const step = parseInt(btn.dataset.step || "0", 10) || 0;
        const inp = document.getElementById(targetId);
        if (!inp) return;
        const min = parseInt(inp.min || "0", 10) || 0;
        const max = parseInt(inp.max || "9999", 10) || 9999;
        let v = parseInt(inp.value || "0", 10) || 0;
        v = Math.max(min, Math.min(max, v + step));
        inp.value = String(v);
        inp.dispatchEvent(new Event("change"));
      });
    });

    el.pickCourseBtn.addEventListener("click", () => openCourseModal());

    if (el.confirmBtn) {
      el.confirmBtn.addEventListener("click", () => {
        const current = !!(state.game.dbGames_CourseConfirmed == 1 || state.game.dbGames_CourseConfirmed === true);
        state.game.dbGames_CourseConfirmed = current ? 0 : 1;
        renderCourseSummary();
        setDirty(true);
      });
    }
    el.modalClose.addEventListener("click", () => closeCourseModal());
    el.modal.addEventListener("click", (e) => {
      if (e.target === el.modal) closeCourseModal();
    });

    el.tabBar.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".maSegBtn") : null;
      if (!btn) return;
      setCourseTab(btn.dataset.tab || "recent");
    });

    el.searchBtn.addEventListener("click", () => doCourseSearch());
    el.hcRefreshBtn.addEventListener("click", () => doRefreshHandicaps());
  }

  function setCourseTab(tab) {
    state.courseTab = (tab === "search") ? "search" : "recent";
    el.tabBar.querySelectorAll(".maSegBtn").forEach(b => {
      const on = b.dataset.tab === state.courseTab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    el.searchControls.style.display = (state.courseTab === "search") ? "block" : "none";
    renderCourseRows();
    if (state.courseTab === "recent" && !state.recentCourses.length) loadRecentCourses();
  }

  function openCourseModal() {
    document.body.classList.add("maOverlayOpen");
    el.modal.classList.add("is-open");
    el.modal.setAttribute("aria-hidden", "false");
    setCourseTab("recent");
  }

  function closeCourseModal() {
    el.modal.classList.remove("is-open");
    el.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("maOverlayOpen");
  }

  function setCourseRows(rows) {
    el.rows.innerHTML = "";
    if (!rows || !rows.length) {
      el.empty.style.display = "block";
      return;
    }
    el.empty.style.display = "none";

    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "maListRow";
      row.innerHTML = `
        <div class="maListRow__col gmColFac">${escapeHtml(r.facilityName || "")}</div>
        <div class="maListRow__col gmColCourse">${escapeHtml(r.courseName || "")}</div>
        <div class="maListRow__col maListRow__col--muted maListRow__col--right gmColCity">${escapeHtml((r.city || r.state || "").trim())}</div>
      `;
      row.addEventListener("click", () => {
        state.game.dbGames_FacilityID = String(r.facilityId || "");
        state.game.dbGames_FacilityName = String(r.facilityName || "");
        state.game.dbGames_CourseID = String(r.courseId || "");
        state.game.dbGames_CourseName = String(r.courseName || "");
        state.game.dbGames_FacilityCity = String(r.city || "");
        state.game.dbGames_FacilityState = String(r.state || "");
        renderCourseSummary();
        setDirty(true);
        closeCourseModal();
      });
      el.rows.appendChild(row);
    });
  }

  function renderCourseRows() {
    const rows = (state.courseTab === "search") ? state.searchCourses : state.recentCourses;
    setCourseRows(rows);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildPatchFromUI() {
    const playDate = String(el.playDate.value || "").trim();
    const eff = readChoice(el.hcEffRow) || "PlayDate";
    const rawHcDate = String(el.hcDate.value || "").trim();
    const hcDate = (eff === "Date") ? (rawHcDate || playDate) : playDate;

    return {
      dbGames_Title: String(el.title.value || "").trim(),
      dbGames_PlayDate: playDate,
      dbGames_PlayTime: getTimeHHMM() + ":00",
      dbGames_TOMethod: String(el.tomethod?.value || "TeeTimes"),
      dbGames_TeeTimeCnt: String(el.teeCount.value || ""),
      dbGames_TeeTimeInterval: String(el.teeInterval.value || ""),
      dbGames_Holes: readChoice(el.holesRow) || "All 18",
      dbGames_Privacy:       readChoice(el.privacyRow) || "Club",
      dbGames_PrivacyGroups: JSON.stringify(state.privacyGroups ?? []),
      dbGames_Comments: String(el.comments.value || ""),
      dbGames_HCEffectivity: eff,
      dbGames_HCEffectivityDate: hcDate,
      dbGames_FacilityID: state.game.dbGames_FacilityID || "",
      dbGames_FacilityName: state.game.dbGames_FacilityName || "",
      dbGames_FacilityCity: state.game.dbGames_FacilityCity || "",
      dbGames_FacilityState: state.game.dbGames_FacilityState || "",
      dbGames_CourseID: state.game.dbGames_CourseID || "",
      dbGames_CourseName: state.game.dbGames_CourseName || "",
      dbGames_CourseConfirmed: state.game.dbGames_CourseConfirmed ? 1 : 0
    };
  }

  async function doSave() {
    if (state.busy) return;

    const patch = buildPatchFromUI();
    if (!patch.dbGames_Title)      return setStatus("Title is required.", "error");
    if (!patch.dbGames_PlayDate)   return setStatus("Play date is required.", "error");
    if (!patch.dbGames_CourseID || !patch.dbGames_FacilityID)
                                   return setStatus("Please select a course.", "error");
    if (patch.dbGames_HCEffectivity === "Date" && !patch.dbGames_HCEffectivityDate)
                                   return setStatus("Select a handicap effectivity date.", "error");

    const courseChanging =
        state.mode === "edit" &&
        state.playerCount > 0 &&
        patch.dbGames_CourseID !== (state.game?.dbGames_CourseID || "");

    if (courseChanging) {
      const ok = confirm(
        `Course changed.\n\n` +
        `${state.playerCount} player${state.playerCount !== 1 ? "s" : ""} ` +
        `will have their tee assignments updated to the new course.\n\n` +
        `Players whose tees cannot be resolved automatically will be ` +
        `flagged for manual re-selection on the Game Players page.\n\n` +
        `Continue?`
      );
      if (!ok) return;
    }

    setBusy(true);
    showSavingOverlay(courseChanging
      ? "Saving game and updating player tees — please wait..."
      : "Saving game...");

    try {
      const res = await apiGM("saveGame.php", { mode: state.mode, patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      state.game = res.game || state.game;
      state.ggid = res.ggid || state.ggid;
      if (res.mode) state.mode = res.mode;

      if (state.mode === "edit") {
        if (window.history && window.history.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.set("mode", "edit");
          window.history.replaceState({}, "", url.toString());
        }
      }

      render();
      setDirty(false); // clears dirty → applyChrome() → footer nav restored

      if (res.courseChanged && res.resolutionResult) {
        const r = res.resolutionResult;
        const parts = ["Game saved."];
        if (r.resolved > 0) parts.push(`${r.resolved} player tee${r.resolved !== 1 ? "s" : ""} updated.`);
        if (r.reselect > 0) parts.push(`${r.reselect} player${r.reselect !== 1 ? "s" : ""} require manual tee selection on Game Players.`);
        if (r.skipped  > 0) parts.push(`${r.skipped} non-rated player${r.skipped !== 1 ? "s" : ""} unchanged.`);
        setStatus(parts.join(" "), r.reselect > 0 ? "warn" : "success");
      } else {
        setStatus("Game saved.", "success");
      }

      applyChrome();
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      hideSavingOverlay();
      setBusy(false);
    }
  }

  async function loadRecentCourses() {
    try {
      const res = await apiGHIN("getRecentCourses.php", {});
      if (!res || !res.ok) throw new Error(res?.message || "Could not load recent courses.");
      state.recentCourses = Array.isArray(res.rows) ? res.rows : [];
      if (state.courseTab === "recent") renderCourseRows();
    } catch (e) {
      console.error(e);
      if (el.modal.classList.contains("is-open")) setStatus(String(e.message || e), "warn");
    }
  }

  async function doCourseSearch() {
    const q = String(el.searchText.value || "").trim();
    const st = String(el.searchState.value || "").trim();
    if (!q) return setStatus("Enter a facility/course search string.", "warn");

    setStatus("Searching courses…", "info");
    try {
      const res = await apiGHIN("searchCourses.php", { q, state: st });
      if (!res || !res.ok) throw new Error(res?.message || "Course search failed.");
      state.searchCourses = Array.isArray(res.rows) ? res.rows : [];
      setCourseTab("search");
      setStatus(state.searchCourses.length ? "" : "No courses found.", state.searchCourses.length ? "" : "warn");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    }
  }

  async function doRefreshHandicaps() {
    if (state.mode !== "edit") return;
    if (state.busy) return;

    const ok = confirm("Refresh handicaps for this game now?");
    if (!ok) return;

    if (MA.recalculateHandicaps) {
      await MA.recalculateHandicaps(ghinApiBase);
      setStatus("Handicaps refreshed.", "success");
    }
  }

  function moveGgidToHeader() {
    if (!el.ggid || el.ggid.tagName !== "INPUT") return;
    const titleEl = document.querySelector(".maCard__hdr .maCard__title");
    if (!titleEl) return;

    const span = document.createElement("span");
    span.style.marginLeft = "10px";
    span.style.opacity = "0.7";
    titleEl.appendChild(span);

    const field = el.ggid.closest(".maField");
    if (field) field.remove();
    else el.ggid.remove();

    el.ggid = span;
  }

  function readInit() {
    return window.__MA_INIT__ || window.__INIT__ || null;
  }

  async function loadContext() {
    setBusy(true);
    try {
      const init = readInit();
      if (!init || !init.ok) throw new Error("Missing or invalid __INIT__ payload (page must inject User+Game context).");

      state.mode        = init.mode || state.mode;
      state.ggid        = init.ggid || null;
      state.game        = init.game || null;
      state.playerCount = typeof init.playerCount === "number" ? init.playerCount : 0;
      state.availableTags = Array.isArray(init.availableTags) ? init.availableTags : [];

      // Restore committed privacy groups from saved game row.
      // [] = all favorites (no filter); non-empty = specific groups.
      const rawGroups = state.game?.dbGames_PrivacyGroups ?? "[]";
      try {
        const parsed = typeof rawGroups === "string" ? JSON.parse(rawGroups) : rawGroups;
        state.privacyGroups = Array.isArray(parsed) ? parsed : [];
      } catch {
        state.privacyGroups = [];
      }

      if (!state.game) throw new Error("Missing init.game in __INIT__.");

      if (el.searchState && !el.searchState.value) {
        const ctx = init.context || {};
        const us = ctx.userState || init.userState;
        if (us) el.searchState.value = us;
      }

      if (!state.game.playDateISO && state.game.dbGames_PlayDate) {
        state.game.playDateISO = state.game.dbGames_PlayDate;
      }
      if (!state.game.playTimeText && state.game.dbGames_PlayTime) {
        state.game.playTimeText = String(state.game.dbGames_PlayTime).substring(0, 5);
      }

      render();
      setDirty(false);
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
      applyChrome();
    }
  }

  // ---- Init ----
  function init() {
    applyChrome();
    moveGgidToHeader();
    populateTimeSelects();
    wireInputs();
    loadContext();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();