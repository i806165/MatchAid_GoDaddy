/* /public_html/assets/pages/game_import.js
   Import Games page controller.
   - Uses /assets/js/ma_shared.js for MA.postJson + MA.chrome + MA.routerGo helpers.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const setStatus = typeof MA.setStatus === "function" ? MA.setStatus : () => {};
  const routerGo  = typeof MA.routerGo === "function" ? MA.routerGo : null;

  // API base injected by PHP
  const routes = MA.routes || {};
  const igApiBase = routes.apiImportGames || MA.paths?.apiImportGames || "/api/admin_games/import";

  function apiIG(endpointFile, payloadObj) {
    const baseClean = String(igApiBase || "").replace(/\/$/, "");
    const fileClean = String(endpointFile || "").replace(/^\//, "");
    const url = `${baseClean}/${fileClean}`;
    return postJson(url, { payload: payloadObj || {} });
  }

  // ---- DOM ----
  const el = {
    title: document.getElementById("igTitle"),
    adminSel: document.getElementById("igAdminSel"),
    rows: document.getElementById("igRows"),

    reviewPanel: document.getElementById("igReviewPanel"),
    btnRetry: document.getElementById("igBtnRetry"),
    btnImport: document.getElementById("igBtnImport"),
    previewRows: document.getElementById("igPreviewRows"),
    importHint: document.getElementById("igImportHint"),
  };

  // ---- State ----
  const state = {
    busy: false,
    mode: "evaluate", // evaluate | review
    init: null,
    adminOptions: [],
    courseMap: {},  // lowercase keys -> { facilityId, facilityName, courseId, courseName }
    defaults: {
      teeTimeInterval: 9,
      holes: "All 18",
      privacy: "Club",
      hcEffectivity: "PlayDate",
    },
    preview: [], // [{ idx, ok, error, playDateISO, playTimeHHMM, teeTimeCnt, course, matchType }]
  };

  function setBusy(on) {
    state.busy = !!on;
    el.btnEvaluate && (el.btnEvaluate.disabled = state.busy);
    el.btnImport && (el.btnImport.disabled = state.busy || state.preview.some(r => !r.ok));
    el.btnRetry && (el.btnRetry.disabled = state.busy);
  }

  // ---- Course lookup (replicates legacy behavior) ----
  function normalizeCourseKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "");
  }

  function lookupCourse(map, inputName) {
    const raw = String(inputName || "").trim();
    if (!raw) return { course: null, matchType: "" };

    const exactKey = raw.toLowerCase();
    if (map && map[exactKey]) return { course: map[exactKey], matchType: "exact" };

    // fuzzy
    const needle = normalizeCourseKey(raw);
    if (!needle) return { course: null, matchType: "" };

    const keys = Object.keys(map || {});
    let bestKey = "";
    let bestScore = 0;

    for (const k of keys) {
      const nk = normalizeCourseKey(k);
      if (!nk) continue;

      let score = 0;

      if (nk === needle) { score = 999; bestKey = k; bestScore = score; break; }

      if (nk.includes(needle) || needle.includes(nk)) score += 50;

      const a = new Set(needle.split(" ").filter(Boolean));
      const b = new Set(nk.split(" ").filter(Boolean));
      let hits = 0;
      a.forEach(t => { if (b.has(t)) hits++; });
      score += hits * 5;

      if (score > bestScore) { bestScore = score; bestKey = k; }
    }

    if (!bestKey || bestScore < 10) return { course: null, matchType: "" };
    return { course: map[bestKey], matchType: "fuzzy" };
  }

  // ---- Parsing helpers ----
  function parseDateMMDDYYYY(s) {
    const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return null;
    let mm = parseInt(m[1], 10), dd = parseInt(m[2], 10), yy = parseInt(m[3], 10);
    if (yy < 100) yy = 2000 + yy; // legacy-friendly
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const iso = `${yy.toString().padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    return iso;
  }

  function parseTime12h(s) {
    const m = String(s || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toUpperCase();
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
    if (ap === "AM") { if (hh === 12) hh = 0; }
    else { if (hh !== 12) hh += 12; }
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function parseTeeCnt(s) {
    const n = parseInt(String(s || "").trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 60) return null;
    return n;
  }

  function splitCsv4(line) {
    // tolerate commas in course name? (legacy assumes 4 columns); we will:
    // take first 2 as date/time, last as teeCnt, middle as course name
    const parts = String(line || "").split(",").map(p => p.trim()).filter(p => p !== "");
    if (parts.length < 4) return null;
    const date = parts[0];
    const time = parts[1];
    const teeCnt = parts[parts.length - 1];
    const course = parts.slice(2, parts.length - 1).join(", ").trim();
    return { date, time, course, teeCnt };
  }

  // ---- UI mode ----
  function setMode(mode) {
    state.mode = mode;

    const isEval = mode === "evaluate";
    el.reviewPanel.style.display = isEval ? "none" : "";

    // Chrome buttons
    chrome.setActions({
      left: {
        show: false,
        label: "Close",
        onClick: async () => {
          try {
            // Router decides destination (no hard-coded paths)
            if (routerGo) await routerGo("admin");
          } catch (e) {
            setStatus(String(e.message || e), "danger");
          }
        }
      },
      right: {
        show: true,
        label: isEval ? "Evaluate" : "Import",
        onClick: async () => {
          if (state.busy) return;
          if (isEval) await onEvaluate();
          else await onImport();
        }
      }
    });

    // optional header lines
    chrome.setHeaderLines(["Import Games", isEval ? "Evaluate" : "Review & Import", ""]);
    applyBottomNav();
  }

  // ---- Render preview ----
  function renderPreview() {
    const rows = state.preview || [];
    el.previewRows.innerHTML = rows.map(r => {
      const status = r.ok ? "OK" : "ERROR";
      const badgeCls = r.ok ? "status-success" : "status-danger";
      const courseText = r.course ? `${r.course.courseName} • ${r.course.facilityName}` : "";
      const hint = (!r.ok && r.error) ? `<div style="grid-column:1 / -1; color:var(--danger); font-size:12px; padding-top:4px;">${escapeHtml(r.error)}</div>` : "";
      const fuzzy = (r.ok && r.matchType === "fuzzy") ? `<span style="margin-left:6px; font-size:11px; opacity:.8;">(fuzzy)</span>` : "";
      return `
        <div style="display:grid; grid-template-columns:56px 120px 100px 1fr 90px 90px; gap:10px;
                    padding:10px 12px; border-top:1px solid var(--cardBorder); background:var(--cardBg);">
          <div>${r.idx}</div>
          <div>${escapeHtml(r.playDateISO || "")}</div>
          <div>${escapeHtml(r.playTimeHHMM || "")}</div>
          <div>${escapeHtml(courseText)} ${fuzzy}</div>
          <div>${r.teeTimeCnt || ""}</div>
          <div class="${badgeCls}" style="font-weight:700;">${status}</div>
          ${hint}
        </div>
      `;
    }).join("");

    const bad = rows.filter(r => !r.ok).length;
    const ok = rows.length - bad;

    if (!rows.length) {
      el.importHint.textContent = "";
      el.btnImport.disabled = true;
      return;
    }

    if (bad) {
      el.importHint.textContent = `Fix ${bad} row(s) before importing. (${ok} OK)`;
      el.btnImport.disabled = true;
    } else {
      el.importHint.textContent = `All rows look good. Ready to import (${ok} game(s)).`;
      el.btnImport.disabled = false;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function setBusy(on) {
    state.busy = !!on;
    el.btnImport && (el.btnImport.disabled = state.busy || state.preview.some(r => !r.ok));
    el.btnRetry && (el.btnRetry.disabled = state.busy);
  }
  
  function applyBottomNav() {
    if (!chrome || typeof chrome.setBottomNav !== "function") return;

    chrome.setBottomNav({
      visible: ["home", "admin", "import"],
      active: "import",
      onNavigate: async (id) => {
        try {
          if (!routerGo) return;

          if (id === "home") {
            // Home landing (per your router contract)
            await routerGo("home");
            return;
          }
          if (id === "admin") {
            // Admin landing / games list
            await routerGo("admin");
            return;
          }
          if (id === "import") {
            // If you have a router action for Import, use it.
            // If not, you can omit this (Import is current page) or route to its landing.
            await routerGo("import");
            return;
          } 
        } catch (e) {
          setStatus(String(e?.message || e), "danger");
        }
      }
    });
  }

  // ---- Actions ----
  async function hydrate() {
    setBusy(true);
    try {
      setStatus("Loading…", "info");
      const out = await apiIG("initImport.php", {});
      if (!out || !out.ok) throw new Error(out?.error || "Init failed");

      state.init = out;
      state.adminOptions = Array.isArray(out.adminOptions) ? out.adminOptions : [];
      state.courseMap = (out.courseMap && typeof out.courseMap === "object") ? out.courseMap : {};
      if (out.defaults && typeof out.defaults === "object") {
        state.defaults = Object.assign(state.defaults, out.defaults);
      }

      // Admin dropdown
      el.adminSel.innerHTML = state.adminOptions.map((a, i) => {
        const g = String(a.ghin || "");
        const n = String(a.name || g);
        return `<option value="${escapeHtml(g)}">${escapeHtml(n)}</option>`;
      }).join("");

      setStatus("", "");
    } catch (e) {
      setStatus(String(e.message || e), "danger");
    } finally {
      setBusy(false);
    }
  }

  function getSelectedAdmin() {
    const ghin = String(el.adminSel.value || "").trim();
    const a = state.adminOptions.find(x => String(x.ghin || "") === ghin);
    return a || { ghin, name: ghin };
  }

  async function onEvaluate() {
    if (state.busy) return;

    const title = String(el.title.value || "").trim();
    if (!title) { setStatus("Title is required.", "warn"); return; }

    const admin = getSelectedAdmin();
    if (!admin.ghin) { setStatus("Administrator selection is required.", "warn"); return; }

    const raw = String(el.rows.value || "").trim();
    if (!raw) { setStatus("Paste at least one row.", "warn"); return; }

    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const preview = [];
    let anyError = false;

    for (let i = 0; i < lines.length; i++) {
      const idx = i + 1;
      const line = lines[i];
      const parts = splitCsv4(line);

      if (!parts) {
        anyError = true;
        preview.push({ idx, ok: false, error: "Row format invalid. Expect: MM/DD/YYYY, HH:MM AM, Course Name, TeeTimeCnt" });
        continue;
      }

      const playDateISO = parseDateMMDDYYYY(parts.date);
      const playTimeHHMM = parseTime12h(parts.time);
      const teeTimeCnt = parseTeeCnt(parts.teeCnt);

      if (!playDateISO) { anyError = true; preview.push({ idx, ok:false, error:"Invalid date (MM/DD/YYYY)."}); continue; }
      if (!playTimeHHMM) { anyError = true; preview.push({ idx, ok:false, error:"Invalid time (HH:MM AM/PM)."}); continue; }
      if (teeTimeCnt == null) { anyError = true; preview.push({ idx, ok:false, error:"Invalid tee count (1–60)."}); continue; }

      const { course, matchType } = lookupCourse(state.courseMap, parts.course);
      if (!course) { anyError = true; preview.push({ idx, ok:false, error:`Course not found: "${parts.course}"` }); continue; }

      preview.push({
        idx,
        ok: true,
        error: "",
        playDateISO,
        playTimeHHMM,
        teeTimeCnt,
        course,
        matchType
      });
    }

    state.preview = preview;

    // Switch to review mode (always), but Import stays disabled if any error
    setMode("review");
    renderPreview();

    setStatus(anyError ? "Review errors and click Retry." : "Review looks good. Ready to import.", anyError ? "warn" : "success");
  }

  async function onImport() {
    if (state.busy) return;

    const bad = (state.preview || []).filter(r => !r.ok);
    if (bad.length) {
      setStatus("Fix row errors before importing.", "warn");
      return;
    }

    setBusy(true);
    try {
      const title = String(el.title.value || "").trim();
      const admin = getSelectedAdmin();

      const payload = {
        title,
        admin,
        defaults: state.defaults,
        rows: state.preview.map(r => ({
          idx: r.idx,
          playDateISO: r.playDateISO,
          playTimeHHMM: r.playTimeHHMM,
          teeTimeCnt: r.teeTimeCnt,
          course: r.course,
          matchType: r.matchType
        }))
      };

      setStatus("Importing…", "info");
      const out = await apiIG("executeImportWorkflow.php", payload);
      if (!out || !out.ok) throw new Error(out?.error || "Import failed");

      // Post-import behavior: close review/import panel but remain on page.
      // Keep textarea + title by default (spec-friendly). Show summary.
      const inserted = Array.isArray(out.results) ? out.results.filter(r => r.ok).length : (out.insertedCount || 0);
      const total = out.requestedCount || (payload.rows.length);

      setMode("evaluate");
      state.preview = [];
      el.previewRows.innerHTML = "";
      el.importHint.textContent = "";

      setStatus(`Import complete: ${inserted} of ${total} game(s) created.`, "success");
    } catch (e) {
      setStatus(String(e.message || e), "danger");
    } finally {
      setBusy(false);
    }
  }

  function bind() {

    el.btnRetry?.addEventListener("click", () => {
      // Retry keeps inputs intact; returns to Evaluate mode
      setMode("evaluate");
      setStatus("Edit rows and evaluate again.", "info");
    });
    el.btnImport?.addEventListener("click", onImport);
  }

  // ---- boot ----
  bind();
  setMode("evaluate");
  applyBottomNav();
  MA.routerGo
  hydrate();
})();
