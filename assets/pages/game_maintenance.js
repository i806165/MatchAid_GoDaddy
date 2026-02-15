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
  const gmApiBase   = routes.apiGameMaint || MA.paths?.apiGameMaint || "/api/game_maintenance";
  const ghinApiBase = routes.apiGHIN      || MA.paths?.apiGHIN      || "/api/GHIN";

  function apiCall(base, endpointFile, payloadObj) {
    const baseClean = String(base || "").replace(/\/$/, "");
    const fileClean = String(endpointFile || "").replace(/^\//, "");
    const url = `${baseClean}/${fileClean}`;

    // Maintain the established contract: { payload: {...} }
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
    playDate: document.getElementById("gmPlayDate"),
    hour: document.getElementById("gmPlayHour"),
    minute: document.getElementById("gmPlayMin"),
    ampm: document.getElementById("gmPlayAmpm"),

    holesRow: document.getElementById("gmHolesRow"),
    privacyRow: document.getElementById("gmPrivacyRow"),

    pickCourseBtn: document.getElementById("gmPickCourseBtn"),
    courseLine1: document.getElementById("gmCourseLine1"),
    courseLine2: document.getElementById("gmCourseLine2"),

    teeCount: document.getElementById("gmTeeCount"),
    teeInterval: document.getElementById("gmTeeInterval"),
    teeHint: document.getElementById("gmTeePreviewHint"),

    hcEffRow: document.getElementById("gmHcEffRow"),
    hcDate: document.getElementById("gmHcDate"),
    hcHint: document.getElementById("gmHcHint"),
    hcRefreshBtn: document.getElementById("gmRefreshHcBtn"),

    comments: document.getElementById("gmComments"),

    // Modal
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
    courseTab: "recent",
    recentCourses: [],
    searchCourses: [],
    busy: false,
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
    // "YYYY-MM-DD"
    if (!iso || typeof iso !== "string") return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function hhmmFromDbTime(t) {
    // Accept "HH:MM", "HH:MM:SS", "HH:MM:SS.000"
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
    syncActionDisabled();
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "Game Settings", action: "settings" }
    ]);
  }

function applyChrome() {
  if (chrome && typeof chrome.setHeaderLines === "function") {
    const modeText = (state.mode === "add") ? "Add Game" : "Edit Game";
    chrome.setHeaderLines(["ADMIN PORTAL", "Game Maintenance", modeText]);
  }

  if (chrome && typeof chrome.setActions === "function") {
    const isTransactional = (state.mode === "add" || state.dirty);
    chrome.setActions({
      left: isTransactional 
        ? { show: true, label: "Cancel", onClick: onBack }
        : { show: true, label: "Actions", onClick: openActionsMenu },
      right: { show: true, label: "Save", onClick: () => doSave() }
    });
    syncActionDisabled();
  }

  if (chrome && typeof chrome.setBottomNav === "function") {
    chrome.setBottomNav({
      visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
      active: "edit",
      disabled: (state.mode === "add") ? ["roster", "pairings", "teetimes", "summary"] : [],
      onNavigate: (id) => MA.routerGo(id)
    });
  }
}


  /*
  function wireChromeActions() {
    if (!chrome || typeof chrome.onAction !== "function") return;

    chrome.onAction("left", () => {
      if (state.dirty) {
        const ok = confirm("Discard unsaved changes and go back?");
        if (!ok) return;
      }
      if (MA.routerGo) MA.routerGo("admin");
      else window.location.assign("/api/session/pageRouter.php?action=admin&redirect=1");
    });

    chrome.onAction("right", () => doSave());
  }
  */
    function onBack() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
      if (!ok) return;
    }
    if (typeof MA.routerGo === "function") {
      MA.routerGo("admin");
      return;
    }
    // last resort (should not be hit if Admin-portal pattern is used)
    const router = MA.paths?.routerApi || "/api/session/pageRouter.php";
    window.location.assign(router + "?action=admin&redirect=1");
  }

  function syncActionDisabled() {
    // shared chrome.setActions may not implement disabled; enforce via DOM
    const rightBtn = document.getElementById("chromeBtnRight");
    if (rightBtn) {
      const disabled = !!state.busy || !state.dirty;
      rightBtn.disabled = disabled;
      rightBtn.classList.toggle("is-disabled", disabled);
    }
  }


  function populateTimeSelects() {
    // hour: 1..12, minute: 00..59 (step 1)
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
      return;
    }
    el.courseLine1.textContent = course ? course : fac;
    el.courseLine2.textContent = [fac, city, st].filter(Boolean).join(" • ");
  }

  function renderTeeHint() {
    const hhmm = getTimeHHMM();
    const list = buildTeeTimeList(hhmm, el.teeCount.value, el.teeInterval.value);
    if (!list.length) {
      el.teeHint.textContent = "";
      return;
    }
    el.teeHint.textContent = `Preview: ${list.slice(0, 6).join(", ")}${list.length > 6 ? "…" : ""}`;
  }

  function renderHcHint() {
    const g = state.game || {};
    const eff = g.dbGames_HCEffectivity || "Latest";
    const dt = (g.dbGames_HCEffectivityDate || "").trim();
    if (eff === "Date" && dt) el.hcHint.textContent = `Handicaps effective on ${dt}.`;
    else el.hcHint.textContent = "Handicaps will use each player's latest index.";
  }

  function render() {
    const g = state.game || {};

    el.title.value = g.dbGames_Title || "";
    if (el.ggid) {
      const val = String(state.ggid || g.dbGames_GGID || "");
      if (el.ggid.tagName === "INPUT") el.ggid.value = val;
      else el.ggid.textContent = val;
    }

    el.playDate.value = (g.playDateISO || g.dbGames_PlayDate || "") || "";
    setTimeFromDb(g.dbGames_PlayTime || g.playTimeText || "");
    el.teeCount.value = String(g.dbGames_TeeTimeCnt ?? 3);
    el.teeInterval.value = String(g.dbGames_TeeTimeInterval ?? 9);

    el.comments.value = g.dbGames_Comments || "";

    pickRowValue(el.holesRow, g.dbGames_Holes || "All 18");
    pickRowValue(el.privacyRow, g.dbGames_Privacy || "Club");

    pickRowValue(el.hcEffRow, g.dbGames_HCEffectivity || "PlayDate");
    el.hcDate.value = g.dbGames_HCEffectivityDate || g.dbGames_PlayDate;

    // Disable Hc refresh in Add
    el.hcRefreshBtn.disabled = (state.mode === "add");

    // Effectivity date input only for Date
    el.hcDate.disabled = (readChoice(el.hcEffRow) !== "Date");

    renderCourseSummary();
    renderTeeHint();
    renderHcHint();
  }

  function bindFieldChange(input, handler) {
    if (!input) return;
    input.addEventListener("input", () => { handler(); setDirty(true); });
    input.addEventListener("change", () => { handler(); setDirty(true); });
  }

  function wireInputs() {
    bindFieldChange(el.title, () => { state.game.dbGames_Title = String(el.title.value || "").trim(); });
    bindFieldChange(el.playDate, () => { state.game.dbGames_PlayDate = String(el.playDate.value || "").trim(); state.game.dbGames_PlayDateISO = state.game.dbGames_PlayDate; });

    // time selects
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

    // choice rows
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
        setDirty(true);
      });
    }
    wireChoiceRow(el.holesRow, "dbGames_Holes");
    wireChoiceRow(el.privacyRow, "dbGames_Privacy");
    wireChoiceRow(el.hcEffRow, "dbGames_HCEffectivity");

    bindFieldChange(el.hcDate, () => { state.game.dbGames_HCEffectivityDate = String(el.hcDate.value || "").trim(); renderHcHint(); });

    // steppers
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

    // Course picker
    el.pickCourseBtn.addEventListener("click", () => openCourseModal());
    el.modalClose.addEventListener("click", () => closeCourseModal());
    el.modal.addEventListener("click", (e) => {
      if (e.target === el.modal) closeCourseModal();
    });

    // Tabs
    el.tabBar.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".maSegBtn") : null;
      if (!btn) return;
      setCourseTab(btn.dataset.tab || "recent");
    });

    // Search
    el.searchBtn.addEventListener("click", () => doCourseSearch());

    // Handicap refresh
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

  function readInit() {
    return window.__MA_INIT__ || window.__INIT__ || null;
  }

  async function loadContext() {
    setBusy(true);
    try {
      const init = readInit();
      if (!init || !init.ok) throw new Error("Missing or invalid __INIT__ payload (page must inject User+Game context).");

      state.mode = init.mode || state.mode;
      state.ggid = init.ggid || null;
      state.game = init.game || null;

      if (!state.game) throw new Error("Missing init.game in __INIT__.");

      // Default search state to user's state if available
      if (el.searchState && !el.searchState.value) {
        const ctx = init.context || {};
        const us = ctx.userState || init.userState;
        if (us) el.searchState.value = us;
      }

      // Mirror ISO helpers for UI where needed
      if (!state.game.playDateISO && state.game.dbGames_PlayDate) {
        state.game.playDateISO = state.game.dbGames_PlayDate;
      }
      if (!state.game.playTimeText && state.game.dbGames_PlayTime) {
        state.game.playTimeText = String(state.game.dbGames_PlayTime).substring(0, 5);
      }


      render();
      setDirty(false);

      // If you want: preload recents when modal opens instead of at load (optional)
      // (leave as-is if you already do it lazily)
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
      applyChrome();
    }
  }


  /*
  async function loadContext() {
    setBusy(true);
    try {
      const res = await apiAdmin("getGameContext.php", { mode: state.mode });
      if (!res || !res.ok) throw new Error(res?.message || "Could not load game context.");
      const payload = res.payload || {};

      state.mode = payload.mode || state.mode;
      state.ggid = payload.ggid || null;
      state.game = payload.game || {};

      // Keep ISO date field mirrored for UI
      if (!state.game.dbGames_PlayDateISO && state.game.dbGames_PlayDate) {
        state.game.dbGames_PlayDateISO = state.game.dbGames_PlayDate;
      }

      render();
      setDirty(false);

      if (state.mode === "edit") {
        // Opportunistically load recents so the modal is instant
        loadRecentCourses();
      }
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
      applyChrome();
    }
  }
  */

function buildPatchFromUI() {
  const playDate = String(el.playDate.value || "").trim();
  const eff = readChoice(el.hcEffRow) || "PlayDate";
  const rawHcDate = String(el.hcDate.value || "").trim();
  const hcDate = (eff === "Date") ? (rawHcDate || playDate) : playDate;

  return {
    dbGames_Title: String(el.title.value || "").trim(),
    dbGames_PlayDate: playDate,
    dbGames_PlayTime: getTimeHHMM() + ":00",

    // stored as text in your schema; keep as strings
    dbGames_TeeTimeCnt: String(el.teeCount.value || ""),
    dbGames_TeeTimeInterval: String(el.teeInterval.value || ""),

    dbGames_Holes: readChoice(el.holesRow) || "All 18",
    dbGames_Privacy: readChoice(el.privacyRow) || "Club",
    dbGames_Comments: String(el.comments.value || ""),

    dbGames_HCEffectivity: eff,
    dbGames_HCEffectivityDate: hcDate,

    // Course fields already in state.game
    dbGames_FacilityID: state.game.dbGames_FacilityID || "",
    dbGames_FacilityName: state.game.dbGames_FacilityName || "",
    dbGames_FacilityCity: state.game.dbGames_FacilityCity || "",
    dbGames_FacilityState: state.game.dbGames_FacilityState || "",
    dbGames_CourseID: state.game.dbGames_CourseID || "",
    dbGames_CourseName: state.game.dbGames_CourseName || ""
  };
}


  async function doSave() {
    if (state.busy) return;

    // Basic validation
    const patch = buildPatchFromUI();
    if (!patch.dbGames_Title) return setStatus("Title is required.", "error");
    if (!patch.dbGames_PlayDate) return setStatus("Play date is required.", "error");
    if (!patch.dbGames_CourseID || !patch.dbGames_FacilityID) return setStatus("Please select a course.", "error");
    if (patch.dbGames_HCEffectivity === "Date" && !patch.dbGames_HCEffectivityDate) return setStatus("Select a handicap effectivity date.", "error");

    setBusy(true);
    try {
      const res = await apiGM("saveGame.php", { mode: state.mode, patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");
      const payload = res.payload || {};
      state.game = payload.game || state.game;
      state.ggid = payload.ggid || state.ggid;

      // If we were in Add, we are now editing the created game
      if (state.mode === "add") {
        state.mode = "edit";
        if (window.history && window.history.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.set("mode", "edit");
          window.history.replaceState({}, "", url.toString());
        }
      }

      render();
      setDirty(false);

      if (payload.hcRefresh && payload.hcRefresh.ok === false) {
        setStatus(`Saved. Handicap refresh warning: ${payload.hcRefresh.message || "check logs"}`, "warn");
      } else {
        setStatus("Game saved.", "success");
      }

      applyChrome();
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
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
      // Recent courses is a convenience; keep quiet unless modal open
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
      setCourseTab("search"); // updates pills + searchControls + renders rows
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

    setBusy(true);
    setStatus("Refreshing handicaps…", "info");
    try {
      const res = await apiGHIN("refreshHandicaps.php", {});
      if (!res || !res.ok) throw new Error(res?.message || "Handicap refresh failed.");
      setStatus("Handicaps refreshed.", "success");
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "error");
    } finally {
      setBusy(false);
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
