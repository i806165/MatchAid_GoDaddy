/* /assets/pages/club_demand.js
 * Club Demand page
 *
 * Architecture:
 *   - DB call fires ONLY on page load or when user changes date range via modal
 *   - Everything else (group, sort, filter, player aggregation) is front-end only
 *   - state.games / state.players are the in-memory dataset for the session
 *
 * Follows game_summary.js patterns:
 *   IIFE · strict mode · state object · el DOM map
 *   applyInit() → wireEvents() → render*() → boot()
 *   chrome.setHeaderLines / setActions / setBottomNav
 */
(function () {
  "use strict";

  const MA        = window.MA      || {};
  const chrome    = MA.chrome      || {};
  const postJson  = typeof MA.postJson  === "function" ? MA.postJson  : null;
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  // ── State (source of truth) ────────────────────────────────────
  const state = {
    // View
    view:    "summary",   // summary | player | dashboard
    groupBy: "month",     // month | course | admin | none
    pSortBy: "rounds",    // rounds | name | lastgame
    pFilter: "all",       // all | multicourse | singlegame

    // facility and Date (set once on load, replaced only on date range change)
    filters:  { dateFrom: "", dateTo: "", facilityId: "" },
    context:  {
      facilityId: "",
      facilityName: "",
      facilityOptions: [],
      canSelectFacility: false,
    },
    summary:  {},
    games:    [],         // enriched game records from hydrateClubDemand
    players:  [],  
    summaryFilters: {
      playDate: "",
      playTime: "",
      administrator: "",
      gameTitle: "",
      course: "",
      format: "",
    },
    summarySortKey: "playDateRaw",
    summarySortDir: "asc",
    playerGroupBy:  "game",  
  };

  // ── DOM map ────────────────────────────────────────────────────
  const el = {
    // View seg
    segSummary:   document.getElementById("cdSegSummary"),
    segPlayer:    document.getElementById("cdSegPlayer"),
    segDashboard: document.getElementById("cdSegDashboard"),

    // Sort rows
    sortSummary:  document.getElementById("cdSortSummary"),
    sortPlayer:   document.getElementById("cdSortPlayer"),
        // Metric rows
    metricSummary: document.getElementById("cdMetricRowSummary"),
    metricPlayer:  document.getElementById("cdMetricRowPlayer"),

    // Views
    viewSummary:   document.getElementById("cdViewSummary"),
    viewPlayer:    document.getElementById("cdViewPlayer"),
    viewDashboard: document.getElementById("cdViewDashboard"),

    // Summary metrics
    mTotalRounds: document.getElementById("cdMTotalRounds"),
    mTotalGames:  document.getElementById("cdMTotalGames"),
    mAvgPlayers:  document.getElementById("cdMAvgPlayers"),
    mTotalSlots:  document.getElementById("cdMTotalSlots"),

    summaryTbody:   document.getElementById("cdSummaryTbody"),
    summaryCardSub: document.getElementById("cdSummaryCardSub"),
    summaryEmpty:   document.getElementById("cdSummaryEmpty"),

    // Player detail metrics
    mUniquePlayers: document.getElementById("cdMUniquePlayers"),
    mPlayerRounds:  document.getElementById("cdMPlayerRounds"),
    mAvgRounds:     document.getElementById("cdMAvgRounds"),
    mMostActive:    document.getElementById("cdMMostActive"),

    playerTbody:   document.getElementById("cdPlayerTbody"),
    playerCardSub: document.getElementById("cdPlayerCardSub"),
    playerEmpty:   document.getElementById("cdPlayerEmpty"),

    // Modal
    modalOverlay:  document.getElementById("cdModalOverlay"),
    modalClose:    document.getElementById("cdModalClose"),
    modalCancel:   document.getElementById("cdModalCancel"),
    modalExecute:  document.getElementById("cdModalExecute"),
    inputFacility: document.getElementById("cdInputFacility"),
    inputFrom:     document.getElementById("cdInputFrom"),
    inputTo:       document.getElementById("cdInputTo"),

    // Dashboard filter
    dashFilterSub:   document.getElementById("cdDashboardFilterSub"),
    dashInputFrom:   document.getElementById("cdDashInputFrom"),
    dashInputTo:     document.getElementById("cdDashInputTo"),
    dashApply:       document.getElementById("cdDashApply"),
    dashReset:       document.getElementById("cdDashReset"),

    // Dashboard KPIs
    dashGames:       document.getElementById("cdDashGames"),
    dashRegistered:  document.getElementById("cdDashRegistered"),
    dashSlots:       document.getElementById("cdDashSlots"),
    dashOpenSlots:   document.getElementById("cdDashOpenSlots"),
    dashUtilization: document.getElementById("cdDashUtilization"),

    // Dashboard — Demand by Date
    dashDateTbody:   document.getElementById("cdDashDateTbody"),
    dashDateSub:     document.getElementById("cdDashDateSub"),
    dashDateEmpty:   document.getElementById("cdDashDateEmpty"),

    // Dashboard — Demand by Course
    dashCourseTbody: document.getElementById("cdDashCourseTbody"),
    dashCourseSub:   document.getElementById("cdDashCourseSub"),
    dashCourseEmpty: document.getElementById("cdDashCourseEmpty"),

    // Dashboard — Capacity Flags
    dashFlagsTbody:  document.getElementById("cdDashFlagsTbody"),
    dashFlagsSub:    document.getElementById("cdDashFlagsSub"),
    dashFlagsEmpty:  document.getElementById("cdDashFlagsEmpty"),

    // Dashboard — Demand by Administrator
    dashAdminTbody:  document.getElementById("cdDashAdminTbody"),
    dashAdminSub:    document.getElementById("cdDashAdminSub"),
    dashAdminEmpty:  document.getElementById("cdDashAdminEmpty"),
  };

  // ── Utility ────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeStr(v)     { return String(v ?? "").trim(); }
  function dash(v)        { const s = safeStr(v); return s || "—"; }

  function fmtDate(ymd) {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const dt  = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const dow = dt.toLocaleDateString("en-US", { weekday: "short" });
    return `${dow} ${m[2]}/${m[3]}/${String(m[1]).slice(-2)}`;
  }

  function fmtDateShort(ymd) {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${String(m[1]).slice(-2)}` : ymd;
  }

  function ymdOnly(v) {
    const s = safeStr(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }

  function diffDays(fromDate, toDate) {
    const fromYMD = ymdOnly(fromDate);
    const toYMD   = ymdOnly(toDate);

    if (!fromYMD || !toYMD) return "";

    const from = new Date(`${fromYMD}T00:00:00`);
    const to   = new Date(`${toYMD}T00:00:00`);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return "";

    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function fmtPill(ymd) {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${String(m[1]).slice(-2)}` : ymd;
  }

  function fmtTime(hhmm) {
    if (!hhmm) return "—";
    const parts = String(hhmm).split(":");
    if (parts.length < 2) return hhmm;
    let h = parseInt(parts[0], 10);
    const min = parts[1];
    if (isNaN(h)) return hhmm;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2,"0")}:${min} ${ampm}`;
  }

  function monthLabel(ymd) {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})/);
    if (!m) return ymd;
    return new Date(Number(m[1]), Number(m[2]) - 1, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function fmtMethod(v) {
    if (!v) return "—";

    const s = String(v).toLowerCase();

    if (s.includes("shotgun")) return "Shotgun";
    if (s.includes("tee")) return "TeeTimes";

    return String(v);
  }

  // ── Player aggregation (client-side, no DB) ────────────────────
    function buildPlayerAggregates() {
      const map = {};

      for (const g of state.games) {
        const courseName = safeStr(g.courseName) || "—";
        const adminName  = safeStr(g.adminName)  || "—";
        const playDate   = safeStr(g.playDate);

        for (const p of (g.players || [])) {
          const ghin = safeStr(p.ghin);
          if (!ghin) continue;

          if (!map[ghin]) {
            map[ghin] = {
              ghin,
              name:      safeStr(p.fullName) || "—",
              rounds:    0,
              courses:   new Set(),
              admins:    new Set(),
              firstGame: playDate,
              lastGame:  playDate,
            };
          }

          const entry = map[ghin];
          entry.rounds++;
          if (courseName) entry.courses.add(courseName);
          if (adminName)  entry.admins.add(adminName);
          if (playDate && playDate < entry.firstGame) entry.firstGame = playDate;
          if (playDate && playDate > entry.lastGame)  entry.lastGame  = playDate;
        }
      }

      return Object.values(map);
    }

  function setView(view) {
    state.view = view;

    const views = { summary: el.viewSummary, player: el.viewPlayer, dashboard: el.viewDashboard };
    const segs  = { summary: el.segSummary,  player: el.segPlayer,  dashboard: el.segDashboard };

    Object.entries(views).forEach(([k, v]) => {
      if (v) v.style.display = (k === view) ? "" : "none";
    });
    Object.entries(segs).forEach(([k, b]) => {
      if (!b) return;
      b.classList.toggle("is-active", k === view);
      b.setAttribute("aria-selected", k === view ? "true" : "false");
    });

    if (el.metricSummary) el.metricSummary.hidden = (view !== "summary");
    if (el.metricPlayer)  el.metricPlayer.hidden  = (view !== "player");

    if (el.sortSummary) el.sortSummary.hidden = (view !== "summary");
    if (el.sortPlayer)  el.sortPlayer.hidden  = (view !== "player");

    if (view === "summary")   renderSummary();
    if (view === "player")    renderPlayer();
    if (view === "dashboard") renderDashboard();
  }

  // ── Summary render ─────────────────────────────────────────────
  function renderSummaryMetrics(rows) {
    const visibleRows = Array.isArray(rows) ? rows : buildGameSummaryRows();

    const totalGames  = visibleRows.length;
    const totalRounds = visibleRows.reduce((sum, r) => sum + Number(r.registered || 0), 0);
    const totalSlots  = visibleRows.reduce((sum, r) => sum + Number(r.slots || 0), 0);
    const avgPlayers  = totalGames > 0 ? (totalRounds / totalGames).toFixed(1) : "—";

    if (el.mTotalRounds) el.mTotalRounds.textContent = String(totalRounds);
    if (el.mTotalGames)  el.mTotalGames.textContent  = String(totalGames);
    if (el.mAvgPlayers)  el.mAvgPlayers.textContent  = String(avgPlayers);
    if (el.mTotalSlots)  el.mTotalSlots.textContent  = String(totalSlots);
  }

  function getGroupFn() {
    switch (state.groupBy) {
      case "month":  return (g) => monthLabel(g.playDate);
      case "course": return (g) => safeStr(g.courseName) || "—";
      case "admin":  return (g) => safeStr(g.adminName)  || "—";
      default:       return ()  => null;
    }
  }

  function getPlayerGroupFn() {
    switch (state.playerGroupBy) {
      case "game":   return (r) => `${r.ggid} · ${r.gameTitle}`;
      case "date":   return (r) => r.playDate;
      case "course": return (r) => r.courseName;
      case "admin":  return (r) => r.administrator;
      case "player": return (r) => r.playerName;
      default:       return ()  => null;
    }
  }

  function buildSummarySubtitle(visibleRows, allRows) {
    const grp = { month:"Month", course:"Course", admin:"Admin", none:"None" }[state.groupBy] || "None";
    const sortLabel = labelForSummaryKey(state.summarySortKey);
    const sortDir = state.summarySortDir === "desc" ? "Desc" : "Asc";

    const filters = [];
    const f = state.summaryFilters || {};

    if (f.playDate)       filters.push(`Date = ${fmtDateShort(f.playDate)}`);
    if (f.playTime)       filters.push(`Time = ${fmtTime(f.playTime)}`);
    if (f.administrator)  filters.push(`Admin = ${f.administrator}`);
    if (f.gameTitle)      filters.push(`Game = ${f.gameTitle}`);
    if (f.course)         filters.push(`Course = ${f.course}`);
    if (f.format)         filters.push(`Format = ${f.format}`);

    const shown = Array.isArray(visibleRows) ? visibleRows.length : 0;
    const total = Array.isArray(allRows) ? allRows.length : shown;

    const parts = [
      grp !== "None" ? `Grouped by ${grp}` : "Ungrouped",
      `Sorted by ${sortLabel} ${sortDir}`,
      `${shown} of ${total} games shown`,
    ];

    if (filters.length) parts.push(`Filtered: ${filters.join(" · ")}`);

    return parts.join(" · ");
  }

  function buildGameSummaryRows() {
    return state.games.map(g => {
      const slots      = Number(g.slotCount ?? 0);
      const registered = Number(g.playerCount ?? 0);
      const unconsumed = Math.max(0, slots - registered);

      return {
        groupKey:       getGroupFn()(g),
        playDateRaw:    safeStr(g.playDate),
        playDate:       fmtDate(g.playDate),
        playTimeRaw:    safeStr(g.playTime),
        playTime:       fmtTime(g.playTime),
        administrator:  dash(g.adminName),
        gameTitle:      dash(g.title),
        course:         dash(g.courseName),
        format:         fmtMethod(g.toMethod),
        slots:          slots,
        registered:     registered,
        unconsumed:     unconsumed,

        // Keep original object available for future drill-in/export extensions.
        source:         g,
      };
    });
  }

  function buildPlayerDetailRows() {
      const rows = [];

      for (const g of state.games) {
        const playDateRaw = safeStr(g.playDate);
        const playDateYMD = ymdOnly(playDateRaw) || playDateRaw;

        for (const p of (g.players || [])) {
          const playerName  = safeStr(p.fullName)  || "—";
          const lastNameRaw = safeStr(p.lastName);

          const registeredRaw = safeStr(p.registeredDate);
          const registeredYMD = ymdOnly(registeredRaw);
          const varianceDays  = diffDays(registeredRaw, playDateRaw);

          rows.push({
            ghin:          dash(p.ghin),
            localId:       dash(p.localId),
            playerName:    playerName,
            lastNameRaw:   lastNameRaw,
            ggid:          dash(g.ggid),
            gameTitle:     dash(g.title),
            playDateRaw:   playDateYMD,
            playDate:      fmtDateShort(playDateYMD),
            playTimeRaw:   safeStr(g.playTime),
            playTime:      fmtTime(g.playTime),
            teeTimeRaw: safeStr(p.teetime),
            teeTime:    dash(p.teetime),
            courseName:    dash(g.courseName),
            administrator: dash(g.adminName),
            registeredRaw: registeredYMD,
            registered:    registeredYMD ? fmtDateShort(registeredYMD) : "—",
            varianceDays:  varianceDays === "" ? "—" : String(varianceDays),
            source: { game: g, player: p },
          });
        }
      }

      return rows;
    }

  function buildSummaryRowHtml(r) {
  return `<tr>
    <td data-cd-menu="summary"
        data-sort-key="playDateRaw"
        data-filter-key="playDate"
        data-filter-value="${esc(r.playDateRaw)}"
        data-display-value="${esc(r.playDate)}">${esc(r.playDate)}</td>

    <td data-cd-menu="summary"
        data-sort-key="playTimeRaw"
        data-filter-key="playTime"
        data-filter-value="${esc(r.playTimeRaw)}"
        data-display-value="${esc(r.playTime)}">${esc(r.playTime)}</td>

    <td data-cd-menu="summary"
        data-sort-key="administrator"
        data-filter-key="administrator"
        data-filter-value="${esc(r.administrator)}"
        data-display-value="${esc(r.administrator)}">${esc(r.administrator)}</td>

    <td data-cd-menu="summary"
        data-sort-key="gameTitle"
        data-filter-key="gameTitle"
        data-filter-value="${esc(r.gameTitle)}"
        data-display-value="${esc(r.gameTitle)}">${esc(r.gameTitle)}</td>

    <td data-cd-menu="summary"
        data-sort-key="course"
        data-filter-key="course"
        data-filter-value="${esc(r.course)}"
        data-display-value="${esc(r.course)}">${esc(r.course)}</td>

    <td data-cd-menu="summary"
        data-sort-key="format"
        data-filter-key="format"
        data-filter-value="${esc(r.format)}"
        data-display-value="${esc(r.format)}">${esc(r.format)}</td>

    <td class="cdRight"
        data-cd-menu="summary"
        data-sort-key="slots"
        data-display-value="${esc(String(r.slots))}">${esc(String(r.slots))}</td>

    <td class="cdRight"
        data-cd-menu="summary"
        data-sort-key="registered"
        data-display-value="${esc(String(r.registered))}">${esc(String(r.registered))}</td>

    <td class="cdRight"
        data-cd-menu="summary"
        data-sort-key="unconsumed"
        data-display-value="${esc(String(r.unconsumed))}">${esc(String(r.unconsumed))}</td>
  </tr>`;
}

  function renderSummary() {
    const allRows = buildGameSummaryRows();
    const rows    = applySummarySort(applySummaryFilters(allRows));

    renderSummaryMetrics(rows);

    if (!rows.length) {
      if (el.summaryEmpty)   el.summaryEmpty.style.display = "";
      if (el.summaryTbody)   el.summaryTbody.innerHTML     = "";
      if (el.summaryCardSub) el.summaryCardSub.textContent = buildSummarySubtitle(rows, allRows);
      return;
    }

    if (el.summaryEmpty) el.summaryEmpty.style.display = "none";

    const groupBy = state.groupBy;
    let html      = "";

    if (groupBy === "none") {
      for (const r of rows) {
        html += buildSummaryRowHtml(r);
      }
    } else {
      const groups = new Map();

      for (const r of rows) {
        const key = r.groupKey || "—";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }

      for (const [grp, groupRows] of groups.entries()) {
        html += `<tr class="cdGroupHdr"><td colspan="9">${esc(grp)}</td></tr>`;
        for (const r of groupRows) {
          html += buildSummaryRowHtml(r);
        }
      }
    }

    if (el.summaryTbody)   el.summaryTbody.innerHTML     = html;
    if (el.summaryCardSub) el.summaryCardSub.textContent = buildSummarySubtitle(rows, allRows);
  }

  function buildPlayerRowHtml(r) {
    return `<tr>
      <td data-cd-menu="player"
          data-sort-key="ghin"
          data-filter-key="ghin"
          data-filter-value="${esc(r.ghin)}"
          data-display-value="${esc(r.ghin)}">${esc(r.ghin)}</td>

      <td data-cd-menu="player"
          data-sort-key="localId"
          data-filter-key="localId"
          data-filter-value="${esc(r.localId)}"
          data-display-value="${esc(r.localId)}">${esc(r.localId)}</td>

      <td data-cd-menu="player"
          data-sort-key="playerName"
          data-filter-key="playerName"
          data-filter-value="${esc(r.playerName)}"
          data-display-value="${esc(r.playerName)}">${esc(r.playerName)}</td>

      <td data-cd-menu="player"
          data-sort-key="ggid"
          data-filter-key="ggid"
          data-filter-value="${esc(r.ggid)}"
          data-display-value="${esc(r.ggid)}">${esc(r.ggid)}</td>

      <td data-cd-menu="player"
          data-sort-key="gameTitle"
          data-filter-key="gameTitle"
          data-filter-value="${esc(r.gameTitle)}"
          data-display-value="${esc(r.gameTitle)}">${esc(r.gameTitle)}</td>

      <td data-cd-menu="player"
          data-sort-key="playDateRaw"
          data-filter-key="playDate"
          data-filter-value="${esc(r.playDateRaw)}"
          data-display-value="${esc(r.playDate)}">${esc(r.playDate)}</td>

      <td data-cd-menu="player"
          data-sort-key="playTimeRaw"
          data-filter-key="playTime"
          data-filter-value="${esc(r.playTimeRaw)}"
          data-display-value="${esc(r.playTime)}">${esc(r.playTime)}</td>

      <td data-cd-menu="player"
          data-sort-key="teeTimeRaw"
          data-filter-key="teeTime"
          data-filter-value="${esc(r.teeTimeRaw)}"
          data-display-value="${esc(r.teeTime)}">${esc(r.teeTime)}</td>

      <td data-cd-menu="player"
          data-sort-key="courseName"
          data-filter-key="courseName"
          data-filter-value="${esc(r.courseName)}"
          data-display-value="${esc(r.courseName)}">${esc(r.courseName)}</td>

      <td data-cd-menu="player"
          data-sort-key="administrator"
          data-filter-key="administrator"
          data-filter-value="${esc(r.administrator)}"
          data-display-value="${esc(r.administrator)}">${esc(r.administrator)}</td>

      <td data-cd-menu="player"
          data-sort-key="registeredRaw"
          data-filter-key="registered"
          data-filter-value="${esc(r.registeredRaw)}"
          data-display-value="${esc(r.registered)}">${esc(r.registered)}</td>

      <td class="cdRight"
          data-cd-menu="player"
          data-sort-key="varianceDays"
          data-display-value="${esc(String(r.varianceDays))}">${esc(String(r.varianceDays))}</td>
    </tr>`;
  }

  function renderPlayer() {
    const allRows = buildPlayerDetailRows();
    const rows    = applyPlayerSort(applyPlayerFilters(allRows));

    const totalRegistrations = rows.length;
    const uniquePlayers = new Set(
      rows.map(r => r.ghin).filter(v => v && v !== "—")
    ).size;

    const varianceValues = rows
      .map(r => Number(r.varianceDays))
      .filter(v => !isNaN(v));

    const avgVariance = varianceValues.length
      ? varianceValues.reduce((sum, v) => sum + v, 0) / varianceValues.length
      : null;

    const maxVariance = varianceValues.length
      ? Math.max(...varianceValues)
      : null;

    if (el.mUniquePlayers) el.mUniquePlayers.textContent = String(uniquePlayers);
    if (el.mPlayerRounds)  el.mPlayerRounds.textContent  = String(totalRegistrations);
    if (el.mAvgRounds)     el.mAvgRounds.textContent     = avgVariance === null ? "—" : avgVariance.toFixed(1);
    if (el.mMostActive)    el.mMostActive.textContent    = maxVariance === null ? "—" : String(maxVariance);

    if (!rows.length) {
      if (el.playerEmpty)   el.playerEmpty.style.display = "";
      if (el.playerTbody)   el.playerTbody.innerHTML     = "";
      if (el.playerCardSub) el.playerCardSub.textContent = buildPlayerSubtitle(rows, allRows);
      return;
    }

    if (el.playerEmpty) el.playerEmpty.style.display = "none";

    const groupFn = getPlayerGroupFn();
    let html = "";

    if (state.playerGroupBy === "none") {
      for (const r of rows) {
        html += buildPlayerRowHtml(r);
      }
    } else {
      const groups = new Map();
      for (const r of rows) {
        const key = groupFn(r) || "—";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      for (const [grp, groupRows] of groups.entries()) {
        html += `<tr class="cdGroupHdr"><td colspan="12">${esc(grp)}</td></tr>`;
        for (const r of groupRows) {
          html += buildPlayerRowHtml(r);
        }
      }
    }

    if (el.playerTbody)   el.playerTbody.innerHTML     = html;
    if (el.playerCardSub) el.playerCardSub.textContent = buildPlayerSubtitle(rows, allRows);
  }

  // ── Dashboard ──────────────────────────────────────────────────

  function pct(registered, slots) {
    if (slots <= 0) return "—";
    return `${((registered / slots) * 100).toFixed(1)}%`;
  }

  function utilizationNumber(registered, slots) {
    if (slots <= 0) return 0;
    return registered / slots;
  }

  function dashboardRangeLabel() {
    const from = fmtDateShort(state.dashboardFilters.dateFrom);
    const to   = fmtDateShort(state.dashboardFilters.dateTo);
    if (from && to) return `${from} – ${to}`;
    if (from)       return `From ${from}`;
    if (to)         return `To ${to}`;
    return "All dates";
  }

  function getDashboardGames() {
    const { dateFrom, dateTo } = state.dashboardFilters;
    return state.games.filter(g => {
      const d = safeStr(g.playDate).slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    });
  }

  function buildDashboardSnapshot(games) {
    let registered = 0;
    let slots      = 0;
    for (const g of games) {
      registered += Number(g.playerCount || 0);
      slots      += Number(g.slotCount   || 0);
    }
    return {
      games:       games.length,
      registered,
      slots,
      openSlots:   Math.max(0, slots - registered),
      utilization: pct(registered, slots),
    };
  }

  function buildDemandByDateRows(games) {
    const map = new Map();
    for (const g of games) {
      const key        = safeStr(g.playDate).slice(0, 10);
      const registered = Number(g.playerCount || 0);
      const slots      = Number(g.slotCount   || 0);
      if (!map.has(key)) map.set(key, { playDateRaw: key, playDate: fmtDate(key), games: 0, registered: 0, slots: 0 });
      const r = map.get(key);
      r.games++;
      r.registered += registered;
      r.slots      += slots;
    }
    return [...map.values()]
      .map(r => ({ ...r, openSlots: Math.max(0, r.slots - r.registered), utilization: pct(r.registered, r.slots) }))
      .sort((a, b) => a.playDateRaw.localeCompare(b.playDateRaw));
  }

  function buildDemandByCourseRows(games) {
    const map = new Map();
    for (const g of games) {
      const key        = safeStr(g.courseName) || "—";
      const registered = Number(g.playerCount || 0);
      const slots      = Number(g.slotCount   || 0);
      if (!map.has(key)) map.set(key, { courseName: key, games: 0, registered: 0, slots: 0 });
      const r = map.get(key);
      r.games++;
      r.registered += registered;
      r.slots      += slots;
    }
    return [...map.values()]
      .map(r => ({ ...r, openSlots: Math.max(0, r.slots - r.registered), utilization: pct(r.registered, r.slots) }))
      .sort((a, b) => b.registered - a.registered || a.courseName.localeCompare(b.courseName));
  }

  function buildDemandByAdminRows(games) {
    const map = new Map();
    for (const g of games) {
      const key        = safeStr(g.adminName) || "—";
      const registered = Number(g.playerCount || 0);
      const slots      = Number(g.slotCount   || 0);
      if (!map.has(key)) map.set(key, { administrator: key, games: 0, registered: 0, slots: 0 });
      const r = map.get(key);
      r.games++;
      r.registered += registered;
      r.slots      += slots;
    }
    return [...map.values()]
      .map(r => ({ ...r, openSlots: Math.max(0, r.slots - r.registered), utilization: pct(r.registered, r.slots) }))
      .sort((a, b) => b.registered - a.registered || a.administrator.localeCompare(b.administrator));
  }

  const FLAG_ORDER      = { "Overfilled": 0, "Full": 1, "Near Full": 2, "Soft Demand": 3 };
  const FLAG_PILL_CLASS = { "Overfilled": "cdStatusPill--overfilled", "Full": "cdStatusPill--full", "Near Full": "cdStatusPill--nearfull", "Soft Demand": "cdStatusPill--softdemand" };

  function buildCapacityFlagRows(games) {
    const rows = [];
    for (const g of games) {
      const registered = Number(g.playerCount || 0);
      const slots      = Number(g.slotCount   || 0);
      const openSlots  = Math.max(0, slots - registered);
      const utilRaw    = utilizationNumber(registered, slots);
      let status;
      if      (registered > slots)                     status = "Overfilled";
      else if (registered === slots && slots > 0)      status = "Full";
      else if (utilRaw >= 0.75)                        status = "Near Full";
      else if (utilRaw < 0.50)                         status = "Soft Demand";
      else                                             continue;
      const playDateRaw = safeStr(g.playDate).slice(0, 10);
      rows.push({ status, gameTitle: dash(g.title), playDateRaw, playDate: fmtDateShort(playDateRaw), courseName: dash(g.courseName), administrator: dash(g.adminName), registered, slots, openSlots });
    }
    return rows.sort((a, b) => {
      const od = (FLAG_ORDER[a.status] ?? 99) - (FLAG_ORDER[b.status] ?? 99);
      return od !== 0 ? od : a.playDateRaw.localeCompare(b.playDateRaw);
    });
  }

  function renderDashboardMetrics(snap) {
    if (el.dashGames)       el.dashGames.textContent       = String(snap.games);
    if (el.dashRegistered)  el.dashRegistered.textContent  = String(snap.registered);
    if (el.dashSlots)       el.dashSlots.textContent       = String(snap.slots);
    if (el.dashOpenSlots)   el.dashOpenSlots.textContent   = String(snap.openSlots);
    if (el.dashUtilization) el.dashUtilization.textContent = snap.utilization;
  }

  function renderDashboardDateRows(rows) {
    if (!rows.length) {
      if (el.dashDateEmpty) el.dashDateEmpty.style.display = "";
      if (el.dashDateTbody) el.dashDateTbody.innerHTML     = "";
      return;
    }
    if (el.dashDateEmpty) el.dashDateEmpty.style.display = "none";
    if (el.dashDateTbody) el.dashDateTbody.innerHTML = rows.map(r => `<tr>
      <td>${esc(r.playDate)}</td>
      <td class="cdRight">${esc(String(r.games))}</td>
      <td class="cdRight">${esc(String(r.registered))}</td>
      <td class="cdRight">${esc(String(r.slots))}</td>
      <td class="cdRight">${esc(String(r.openSlots))}</td>
      <td class="cdRight">${esc(r.utilization)}</td>
    </tr>`).join("");
  }

  function renderDashboardCourseRows(rows) {
    if (!rows.length) {
      if (el.dashCourseEmpty) el.dashCourseEmpty.style.display = "";
      if (el.dashCourseTbody) el.dashCourseTbody.innerHTML     = "";
      return;
    }
    if (el.dashCourseEmpty) el.dashCourseEmpty.style.display = "none";
    if (el.dashCourseTbody) el.dashCourseTbody.innerHTML = rows.map(r => `<tr>
      <td>${esc(r.courseName)}</td>
      <td class="cdRight">${esc(String(r.games))}</td>
      <td class="cdRight">${esc(String(r.registered))}</td>
      <td class="cdRight">${esc(String(r.slots))}</td>
      <td class="cdRight">${esc(String(r.openSlots))}</td>
      <td class="cdRight">${esc(r.utilization)}</td>
    </tr>`).join("");
  }

  function renderDashboardAdminRows(rows) {
    if (!rows.length) {
      if (el.dashAdminEmpty) el.dashAdminEmpty.style.display = "";
      if (el.dashAdminTbody) el.dashAdminTbody.innerHTML     = "";
      return;
    }
    if (el.dashAdminEmpty) el.dashAdminEmpty.style.display = "none";
    if (el.dashAdminTbody) el.dashAdminTbody.innerHTML = rows.map(r => `<tr>
      <td>${esc(r.administrator)}</td>
      <td class="cdRight">${esc(String(r.games))}</td>
      <td class="cdRight">${esc(String(r.registered))}</td>
      <td class="cdRight">${esc(String(r.slots))}</td>
      <td class="cdRight">${esc(String(r.openSlots))}</td>
      <td class="cdRight">${esc(r.utilization)}</td>
    </tr>`).join("");
  }

  function renderDashboardFlagRows(rows) {
    if (!rows.length) {
      if (el.dashFlagsEmpty) el.dashFlagsEmpty.style.display = "";
      if (el.dashFlagsTbody) el.dashFlagsTbody.innerHTML     = "";
      return;
    }
    if (el.dashFlagsEmpty) el.dashFlagsEmpty.style.display = "none";
    if (el.dashFlagsTbody) el.dashFlagsTbody.innerHTML = rows.map(r => {
      const pillClass = FLAG_PILL_CLASS[r.status] || "";
      return `<tr>
        <td><span class="cdStatusPill ${esc(pillClass)}">${esc(r.status)}</span></td>
        <td>${esc(r.gameTitle)}</td>
        <td>${esc(r.playDate)}</td>
        <td>${esc(r.courseName)}</td>
        <td class="cdRight">${esc(String(r.registered))}</td>
        <td class="cdRight">${esc(String(r.slots))}</td>
        <td class="cdRight">${esc(String(r.openSlots))}</td>
      </tr>`;
    }).join("");
  }

  function syncDashboardInputs() {
    if (el.dashInputFrom) el.dashInputFrom.value = state.dashboardFilters.dateFrom || "";
    if (el.dashInputTo)   el.dashInputTo.value   = state.dashboardFilters.dateTo   || "";
  }

  function applyDashboardFilter() {
    const dateFrom = safeStr(el.dashInputFrom?.value);
    const dateTo   = safeStr(el.dashInputTo?.value);
    if (!dateFrom || !dateTo) { setStatus("Please select both a From and To date for the dashboard filter.", "warn"); return; }
    if (dateFrom > dateTo)    { setStatus("From date must be before To date.", "warn"); return; }
    state.dashboardFilters.dateFrom = dateFrom;
    state.dashboardFilters.dateTo   = dateTo;
    renderDashboard();
    setStatus("Dashboard filter applied.", "ok");
  }

  function resetDashboardFilter() {
    state.dashboardFilters.dateFrom = state.filters.dateFrom;
    state.dashboardFilters.dateTo   = state.filters.dateTo;
    renderDashboard();
    setStatus("Dashboard filter reset.", "ok");
  }

  function renderDashboard() {
    syncDashboardInputs();
    const games      = getDashboardGames();
    const snapshot   = buildDashboardSnapshot(games);
    const dateRows   = buildDemandByDateRows(games);
    const courseRows = buildDemandByCourseRows(games);
    const flagRows   = buildCapacityFlagRows(games);
    const adminRows  = buildDemandByAdminRows(games);

    renderDashboardMetrics(snapshot);
    renderDashboardDateRows(dateRows);
    renderDashboardCourseRows(courseRows);
    renderDashboardFlagRows(flagRows);
    renderDashboardAdminRows(adminRows);

    const label = dashboardRangeLabel();
    if (el.dashFilterSub)  el.dashFilterSub.textContent  = `Filtered to ${label}`;
    if (el.dashDateSub)    el.dashDateSub.textContent    = label;
    if (el.dashCourseSub)  el.dashCourseSub.textContent  = label;
    if (el.dashFlagsSub)   el.dashFlagsSub.textContent   = label;
    if (el.dashAdminSub)   el.dashAdminSub.textContent   = label;
  }

  function renderFacilityOptions() {
    if (!el.inputFacility) return;

    const options = Array.isArray(state.context.facilityOptions)
      ? state.context.facilityOptions
      : [];

    const selectedFacilityId = safeStr(state.filters.facilityId || state.context.facilityId);

    el.inputFacility.innerHTML = options.map(f => {
      const facilityId = safeStr(f.facilityId);
      const facilityName = safeStr(f.facilityName) || `Facility ${facilityId}`;
      const selected = facilityId === selectedFacilityId ? " selected" : "";

      return `<option value="${esc(facilityId)}"${selected}>${esc(facilityName)}</option>`;
    }).join("");

    el.inputFacility.disabled = !state.context.canSelectFacility || options.length <= 1;

    if (selectedFacilityId && el.inputFacility.value !== selectedFacilityId) {
      el.inputFacility.value = selectedFacilityId;
    }
  }

  // ── Modal ──────────────────────────────────────────────────────
  function openModal() {
    renderFacilityOptions();

    if (el.inputFacility) {
      el.inputFacility.value = state.filters.facilityId || state.context.facilityId || "";
    }
    if (el.inputFrom) el.inputFrom.value = state.filters.dateFrom || "";
    if (el.inputTo)   el.inputTo.value   = state.filters.dateTo   || "";

    if (el.modalOverlay) {
      el.modalOverlay.removeAttribute("aria-hidden");
      el.modalOverlay.classList.add("is-open");
      document.documentElement.classList.add("maOverlayOpen");
    }
  }

  function closeModal() {
    if (el.modalOverlay) {
      el.modalOverlay.setAttribute("aria-hidden", "true");
      el.modalOverlay.classList.remove("is-open");
      document.documentElement.classList.remove("maOverlayOpen");
    }
  }

  function applySummaryFilters(rows) {
    const f = state.summaryFilters || {};

    return rows.filter(r => {
      if (f.playDate      && r.playDateRaw   !== f.playDate)      return false;
      if (f.playTime      && r.playTimeRaw   !== f.playTime)      return false;
      if (f.administrator && r.administrator !== f.administrator) return false;
      if (f.gameTitle     && r.gameTitle     !== f.gameTitle)     return false;
      if (f.course        && r.course        !== f.course)        return false;
      if (f.format        && r.format        !== f.format)        return false;
      return true;
    });
  }

  function applySummarySort(rows) {
    const key = state.summarySortKey || "playDateRaw";
    const dir = state.summarySortDir === "desc" ? -1 : 1;

    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (typeof av === "number" || typeof bv === "number") {
        return (Number(av || 0) - Number(bv || 0)) * dir;
      }

      return safeStr(av).localeCompare(safeStr(bv)) * dir;
    });
  }

  function labelForSummaryKey(key) {
    return {
      playDateRaw:  "Date",
      playTimeRaw:  "Play Time",
      administrator:"Administrator",
      gameTitle:    "Game Title",
      course:       "Course",
      format:       "Format",
      slots:        "Slots",
      registered:   "Registered",
      unconsumed:   "Unconsumed",
    }[key] || "Value";
  }

  function setSummaryFilter(key, value) {
    if (!state.summaryFilters || !key) return;
    state.summaryFilters[key] = value;
    renderSummary();
  }

  function clearSummaryFilters() {
    state.summaryFilters = {
      playDate: "",
      playTime: "",
      administrator: "",
      gameTitle: "",
      course: "",
      format: "",
    };
    renderSummary();
  }

  function setSummarySort(key, dir) {
    state.summarySortKey = key || "playDateRaw";
    state.summarySortDir = dir === "desc" ? "desc" : "asc";
    renderSummary();
  }

  function hasSummaryFilters() {
    const f = state.summaryFilters || {};
    return Boolean(
      f.playDate ||
      f.playTime ||
      f.administrator ||
      f.gameTitle ||
      f.course ||
      f.format
    );
  }

  function isNumericSummaryKey(key) {
    return key === "slots" || key === "registered" || key === "unconsumed";
  }

  function openSummaryCellMenu(cell) {
    const ui = window.MA?.ui;
    if (typeof ui?.openActionsMenu !== "function") {
      setStatus("Actions menu is not available.", "warn");
      return;
    }

    const sortKey    = safeStr(cell.dataset.sortKey);
    const filterKey  = safeStr(cell.dataset.filterKey);
    const filterVal  = safeStr(cell.dataset.filterValue);
    const displayVal = safeStr(cell.dataset.displayValue) || safeStr(cell.textContent);
    const label      = labelForSummaryKey(sortKey);

    const actions = [];

    if (filterKey && filterVal && displayVal !== "—") {
      actions.push({
        label: `Filter by ${label}`,
        action: () => setSummaryFilter(filterKey, filterVal),
      });
    }

    if (sortKey) {
      if (isNumericSummaryKey(sortKey)) {
        actions.push({
          label: `Sort ${label} Low to High`,
          action: () => setSummarySort(sortKey, "asc"),
        });
        actions.push({
          label: `Sort ${label} High to Low`,
          action: () => setSummarySort(sortKey, "desc"),
        });
      } else {
        actions.push({
          label: `Sort ${label} A to Z`,
          action: () => setSummarySort(sortKey, "asc"),
        });
        actions.push({
          label: `Sort ${label} Z to A`,
          action: () => setSummarySort(sortKey, "desc"),
        });
      }
    }

    if (hasSummaryFilters()) {
      actions.push({
        label: "Clear Filters",
        action: () => clearSummaryFilters(),
      });
    }

    ui.openActionsMenu(
      displayVal || label,
      actions,
      label
    );
  }

  function onSummaryBodyClick(e) {
    const cell = e.target.closest("[data-cd-menu='summary']");
    if (!cell || !el.summaryTbody?.contains(cell)) return;
    openSummaryCellMenu(cell);
  }

  function applyPlayerFilters(rows) {
    const f = state.playerFilters || {};

    return rows.filter(r => {
      if (f.ghin          && r.ghin          !== f.ghin)          return false;
      if (f.localId       && r.localId       !== f.localId)       return false;
      if (f.playerName    && r.playerName    !== f.playerName)    return false;
      if (f.ggid          && r.ggid          !== f.ggid)          return false;
      if (f.gameTitle     && r.gameTitle     !== f.gameTitle)     return false;
      if (f.playDate      && r.playDateRaw   !== f.playDate)      return false;
      if (f.playTime      && r.playTimeRaw   !== f.playTime)      return false;
      if (f.teeTime       && r.teeTimeRaw    !== f.teeTime)       return false;
      if (f.courseName    && r.courseName    !== f.courseName)    return false;
      if (f.administrator && r.administrator !== f.administrator) return false;
      if (f.registered    && r.registeredRaw !== f.registered)    return false;
      return true;
    });
  }

  function applyPlayerSort(rows) {
    const sortKey = state.playerSortKey || "playDateRaw";
    const key     = sortKey === "playerName" ? "lastNameRaw" : sortKey;
    const dir     = state.playerSortDir === "desc" ? -1 : 1;

    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (typeof av === "number" || typeof bv === "number") {
        return (Number(av || 0) - Number(bv || 0)) * dir;
      }

      return safeStr(av).localeCompare(safeStr(bv)) * dir;
    });
  }

  function labelForPlayerKey(key) {
    return {
      ghin:          "GHIN",
      localId:       "Local ID",
      playerName:    "Player Name",
      ggid:          "GGID",
      gameTitle:     "Game Title",
      playDateRaw:   "Play Date",
      playTimeRaw:   "Play Time",
      teeTimeRaw:    "Tee Time",
      courseName:    "Course Name",
      administrator: "Administrator",
      registeredRaw: "Registered",
      varianceDays:  "Variance Days",
    }[key] || "Value";
  }

  function setPlayerFilter(key, value) {
    if (!state.playerFilters || !key) return;
    state.playerFilters[key] = value;
    renderPlayer();
  }

  function clearPlayerFilters() {
    state.playerFilters = {
      ghin: "",
      localId: "",
      playerName: "",
      ggid: "",
      gameTitle: "",
      playDate: "",
      playTime: "",
      teeTime: "",
      courseName: "",
      administrator: "",
      registered: "",
    };
    renderPlayer();
  }

  function setPlayerSort(key, dir) {
    state.playerSortKey = key || "playDateRaw";
    state.playerSortDir = dir === "desc" ? "desc" : "asc";
    renderPlayer();
  }

  function hasPlayerFilters() {
    const f = state.playerFilters || {};
    return Boolean(
      f.ghin ||
      f.localId ||
      f.playerName ||
      f.ggid ||
      f.gameTitle ||
      f.playDate ||
      f.playTime ||
      f.teeTime ||
      f.courseName ||
      f.administrator ||
      f.registered
    );
  }

  function isNumericPlayerKey(key) {
    return key === "varianceDays";
  }

  function openPlayerCellMenu(cell) {
    const ui = window.MA?.ui;
    if (typeof ui?.openActionsMenu !== "function") {
      setStatus("Actions menu is not available.", "warn");
      return;
    }

    const sortKey    = safeStr(cell.dataset.sortKey);
    const filterKey  = safeStr(cell.dataset.filterKey);
    const filterVal  = safeStr(cell.dataset.filterValue);
    const displayVal = safeStr(cell.dataset.displayValue) || safeStr(cell.textContent);
    const label      = labelForPlayerKey(sortKey);

    const actions = [];

    if (filterKey && filterVal && displayVal !== "—") {
      actions.push({
        label: `Filter by ${label}`,
        action: () => setPlayerFilter(filterKey, filterVal),
      });
    }

    if (sortKey) {
      if (isNumericPlayerKey(sortKey)) {
        actions.push({
          label: `Sort ${label} Low to High`,
          action: () => setPlayerSort(sortKey, "asc"),
        });
        actions.push({
          label: `Sort ${label} High to Low`,
          action: () => setPlayerSort(sortKey, "desc"),
        });
      } else {
        actions.push({
          label: `Sort ${label} A to Z`,
          action: () => setPlayerSort(sortKey, "asc"),
        });
        actions.push({
          label: `Sort ${label} Z to A`,
          action: () => setPlayerSort(sortKey, "desc"),
        });
      }
    }

    if (hasPlayerFilters()) {
      actions.push({
        label: "Clear Filters",
        action: () => clearPlayerFilters(),
      });
    }

    ui.openActionsMenu(
      displayVal || label,
      actions,
      label
    );
  }

  function onPlayerBodyClick(e) {
    const cell = e.target.closest("[data-cd-menu='player']");
    if (!cell || !el.playerTbody?.contains(cell)) return;
    openPlayerCellMenu(cell);
  }

  async function executeAcquire() {
    const facilityId = safeStr(el.inputFacility?.value || state.filters.facilityId || state.context.facilityId);
    const dateFrom   = safeStr(el.inputFrom?.value);
    const dateTo     = safeStr(el.inputTo?.value);

    if (!dateFrom || !dateTo) {
      setStatus("Please select both a From and To date.", "warn");
      return;
    }
    if (dateFrom > dateTo) {
      setStatus("From date must be before To date.", "warn");
      return;
    }
    if (!facilityId) {
      setStatus("Please select a facility.", "warn");
      return;
    }

    closeModal();
    setStatus("Loading data…", "info");

    if (el.modalExecute) {
      el.modalExecute.disabled    = true;
      el.modalExecute.textContent = "Loading…";
    }

    try {
      const apiUrl = window.MA?.routes?.apiClubDemand
        || "/api/club_demand/initClubDemand.php";

      const res = await postJson(apiUrl, {
        payload: {
          filters: { facilityId, dateFrom, dateTo }
        }
      });

      if (!res || !res.ok || !res.payload) {
        throw new Error(res?.message || "Data acquisition failed.");
      }

      applyInit(res.payload);
      applyChrome();

      if (res.payload.authorized === false) {
        setView(state.view);
        setStatus(safeStr(res.payload.message) || "Club Demand is not configured for this user.", "warn");
        return;
      }
      setView(state.view);
      setStatus("Data loaded.", "ok");

    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    } finally {
      if (el.modalExecute) {
        el.modalExecute.disabled    = false;
        el.modalExecute.textContent = "Load Data";
      }
    }
  }

  // ── Wire events ────────────────────────────────────────────────
  function wireEvents() {

    // View toggle
    el.segSummary?.addEventListener("click",   () => setView("summary"));
    el.segPlayer?.addEventListener("click",    () => setView("player"));
    el.segDashboard?.addEventListener("click", () => setView("dashboard"));

    // Acquire modal (opened via Actions menu)
    el.modalClose?.addEventListener("click",   closeModal);
    el.modalCancel?.addEventListener("click",  closeModal);
    el.modalExecute?.addEventListener("click", executeAcquire);

    // Close modal on overlay click
    el.modalOverlay?.addEventListener("click", (e) => {
      if (e.target === el.modalOverlay) closeModal();
    });
    el.summaryTbody?.addEventListener("click", onSummaryBodyClick);
    el.playerTbody?.addEventListener("click", onPlayerBodyClick);

    // Dashboard filter
    el.dashApply?.addEventListener("click", applyDashboardFilter);
    el.dashReset?.addEventListener("click", resetDashboardFilter);

    // Summary: group buttons
    document.querySelectorAll("[data-group]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-group]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.groupBy = btn.dataset.group;
        renderSummary();
      });
    });

    // Player: group buttons
    document.querySelectorAll("[data-pgroup]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-pgroup]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.playerGroupBy = btn.dataset.pgroup;
        renderPlayer();
      });
    });

  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [
      { label: "Select New Date Range", action: openModal },
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const facilityName = safeStr(state.context.facilityName);
    const clubName     = facilityName || safeStr(state.context.clubName) || "Club Demand";
    const from     = fmtPill(state.filters.dateFrom);
    const to       = fmtPill(state.filters.dateTo);
    const subLine  = from && to ? `${from} – ${to}` : "";

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Demand", clubName, subLine]);
    }
    if (typeof chrome.setActions === "function") {
      chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left: { show: false },
      });
    }
    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubhome", "clubdemand"],
        active:     "clubdemand",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  // ── Apply init payload ─────────────────────────────────────────
  function applyInit(init) {
    if (!init || !init.ok) throw new Error(init?.message || "Init payload invalid.");

    state.filters = {
      dateFrom:   safeStr(init.filters?.dateFrom),
      dateTo:     safeStr(init.filters?.dateTo),
      facilityId: safeStr(init.filters?.facilityId || init.context?.facilityId),
    };

    state.context = {
      ...(init.context || {}),
      facilityId:        safeStr(init.context?.facilityId || init.filters?.facilityId),
      facilityName:      safeStr(init.context?.facilityName),
      facilityOptions:   Array.isArray(init.context?.facilityOptions) ? init.context.facilityOptions : [],
      canSelectFacility: Boolean(init.context?.canSelectFacility),
    };

    state.summary = init.summary || {};
    state.games   = Array.isArray(init.games) ? init.games : [];
    state.players = buildPlayerAggregates();

    state.summaryFilters  = { playDate: "", playTime: "", administrator: "", gameTitle: "", course: "", format: "" };
    state.summarySortKey  = "playDateRaw";
    state.summarySortDir  = "asc";

    state.playerFilters = { ghin: "", localId: "", playerName: "", ggid: "", gameTitle: "", playDate: "", playTime: "", teeTime: "", courseName: "", administrator: "", registered: "" };
    state.playerSortKey = "playDateRaw";
    state.playerSortDir = "asc";

    state.dashboardFilters = {
      dateFrom: state.filters.dateFrom,
      dateTo:   state.filters.dateTo,
    };
  }

  // ── Boot ───────────────────────────────────────────────────────
  async function boot() {
    try {
      setStatus("Loading demand report…", "info");

      const init = window.__INIT__ || window.__MA_INIT__ || null;
      if (!init || !init.ok) throw new Error("Missing or invalid init payload.");

      applyInit(init);
      wireEvents();
      applyChrome();
      setView("summary");
      if (init.authorized === false) {
        setStatus(safeStr(init.message) || "Club Demand is not configured for this user.", "warn");
        return;
      }

      // Fresh load — prompt user to confirm/adjust date range before exploring
      // Return visit — session dates restored, render immediately
      //if (!init.isReturn) openModal();

      setStatus("Ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();