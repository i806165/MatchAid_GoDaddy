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
    sortBy:  "date",      // date | players | course | admin
    pSortBy: "rounds",    // rounds | name | lastgame
    pFilter: "all",       // all | multicourse | singlegame

    // Data (set once on load, replaced only on date range change)
    filters:  { dateFrom: "", dateTo: "" },
    context:  {},
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
    inputFrom:     document.getElementById("cdInputFrom"),
    inputTo:       document.getElementById("cdInputTo"),
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
    // Aggregate across all games in state.games
    // Keyed by GHIN; each entry accumulates rounds, courses, admins, dates
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
            name:      `${safeStr(p.lastName)}, ${safeStr(p.firstName)}`.replace(/^,\s*/, ""),
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

  // ── View switching ─────────────────────────────────────────────
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

  function getSummaryComparator() {
    switch (state.sortBy) {
      case "players": return (a, b) => (b.playerCount  - a.playerCount);
      case "course":  return (a, b) => safeStr(a.courseName).localeCompare(safeStr(b.courseName));
      case "admin":   return (a, b) => safeStr(a.adminName).localeCompare(safeStr(b.adminName));
      default:        return (a, b) => safeStr(a.playDate).localeCompare(safeStr(b.playDate));
    }
  }

  function getGroupFn() {
    switch (state.groupBy) {
      case "month":  return (g) => monthLabel(g.playDate);
      case "course": return (g) => safeStr(g.courseName) || "—";
      case "admin":  return (g) => safeStr(g.adminName)  || "—";
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
    return getFilteredPlayers().map(p => {
      const courses = Array.from(p.courses || []);
      const admins  = Array.from(p.admins || []);

      return {
        player:       dash(p.name),
        rounds:       Number(p.rounds ?? 0),
        courses:      courses.join(", ") || "—",
        administrators: admins.join(", ") || "—",
        firstGameRaw: safeStr(p.firstGame),
        lastGameRaw:  safeStr(p.lastGame),
        firstGame:    fmtDateShort(p.firstGame),
        lastGame:     fmtDateShort(p.lastGame),

        // Keep original object available for future drill-in/export extensions.
        source:       p,
      };
    });
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

  // ── Player detail render ───────────────────────────────────────
  function getFilteredPlayers() {
    let players = [...state.players];

    // Apply front-end filter
    if (state.pFilter === "multicourse") {
      players = players.filter(p => p.courses.size > 1);
    } else if (state.pFilter === "singlegame") {
      players = players.filter(p => p.rounds === 1);
    }

    // Apply sort
    switch (state.pSortBy) {
      case "name":
        players.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
        break;
      case "lastgame":
        players.sort((a, b) => safeStr(b.lastGame).localeCompare(safeStr(a.lastGame)));
        break;
      default: // rounds
        players.sort((a, b) => b.rounds - a.rounds);
    }

    return players;
  }

  function renderPlayer() {
    const rows        = buildPlayerDetailRows();
    const total       = state.players.length;
    const visibleCnt  = rows.length;
    const visibleRnds = rows.reduce((sum, r) => sum + Number(r.rounds || 0), 0);
    const avg         = visibleCnt > 0 ? (visibleRnds / visibleCnt).toFixed(1) : "—";
    const peak        = visibleCnt > 0
      ? Math.max(...rows.map(r => Number(r.rounds || 0)))
      : "—";

    if (el.mUniquePlayers) el.mUniquePlayers.textContent = String(visibleCnt);
    if (el.mPlayerRounds)  el.mPlayerRounds.textContent  = String(visibleRnds);
    if (el.mAvgRounds)     el.mAvgRounds.textContent     = String(avg);
    if (el.mMostActive)    el.mMostActive.textContent    = String(peak);

    if (!rows.length) {
      if (el.playerEmpty)   el.playerEmpty.style.display = "";
      if (el.playerTbody)   el.playerTbody.innerHTML     = "";
      if (el.playerCardSub) el.playerCardSub.textContent = "";
      return;
    }

    if (el.playerEmpty) el.playerEmpty.style.display = "none";

    const html = rows.map(r => `<tr>
      <td style="font-weight:900">${esc(r.player)}</td>
      <td class="cdRight">${esc(String(r.rounds))}</td>
      <td>${esc(r.courses)}</td>
      <td class="cdMuted">${esc(r.administrators)}</td>
      <td class="cdMuted">${esc(r.firstGame)}</td>
      <td class="cdMuted">${esc(r.lastGame)}</td>
    </tr>`).join("");

    if (el.playerTbody)   el.playerTbody.innerHTML = html;
    if (el.playerCardSub) el.playerCardSub.textContent =
      `${visibleCnt} of ${total} players · Sorted by ${state.pSortBy}`;
  }

  // ── Dashboard (stub) ───────────────────────────────────────────
  function renderDashboard() {
    // Implemented in next iteration
  }

  // ── Modal ──────────────────────────────────────────────────────
  function openModal() {
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

  async function executeAcquire() {
    const dateFrom = safeStr(el.inputFrom?.value);
    const dateTo   = safeStr(el.inputTo?.value);

    if (!dateFrom || !dateTo) {
      setStatus("Please select both a From and To date.", "warn");
      return;
    }
    if (dateFrom > dateTo) {
      setStatus("From date must be before To date.", "warn");
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
          filters: { dateFrom, dateTo }
        }
      });

      if (!res || !res.ok || !res.payload) {
        throw new Error(res?.message || "Data acquisition failed.");
      }

      applyInit(res.payload);
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

    // Summary: group buttons
    document.querySelectorAll("[data-group]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-group]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.groupBy = btn.dataset.group;
        renderSummary();
      });
    });

    // Summary: sort buttons
    document.querySelectorAll("[data-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");

        const sort = safeStr(btn.dataset.sort);
        if (sort === "players") {
          setSummarySort("registered", "desc");
        } else if (sort === "course") {
          setSummarySort("course", "asc");
        } else if (sort === "admin") {
          setSummarySort("administrator", "asc");
        } else {
          setSummarySort("playDateRaw", "asc");
        }
      });
    });

    // Player: sort buttons
    document.querySelectorAll("[data-psort]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-psort]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.pSortBy = btn.dataset.psort;
        renderPlayer();
      });
    });

    // Player: filter buttons
    document.querySelectorAll("[data-pfilter]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-pfilter]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.pFilter = btn.dataset.pfilter;
        renderPlayer();
      });
    });
  }

  // ── Chrome ─────────────────────────────────────────────────────
  function applyChrome() {
    const clubName = safeStr(state.context.clubName) || "Club Demand";
    const from     = fmtPill(state.filters.dateFrom);
    const to       = fmtPill(state.filters.dateTo);
    const subLine  = from && to ? `${from} – ${to}` : "";

    if (typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Club Demand", clubName, subLine]);
    }
    if (typeof chrome.setActions === "function") {
      chrome.setActions({
        right: {
          show:  true,
          label: "Actions",
          onTap: () => {
            const ui = window.MA?.ui;
            if (typeof ui?.openActionsMenu !== "function") return;
            ui.openActionsMenu(
              "Club Demand",
              [
                {
                  label:  "Get Data",
                  action: () => openModal(),
                },
              ],
              safeStr(state.context.clubName) || ""
            );
          },
        },
        left: { show: false },
      });
    }
    if (typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible:    ["home", "clubdemand"],
        active:     "clubdemand",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  // ── Apply init payload ─────────────────────────────────────────
  function applyInit(init) {
    if (!init || !init.ok) throw new Error(init?.message || "Init payload invalid.");
    state.filters = init.filters  || {};
    state.context = init.context  || {};
    state.summary = init.summary  || {};
    state.games   = Array.isArray(init.games) ? init.games : [];
    state.players = buildPlayerAggregates();

    state.summaryFilters = {
      playDate: "",
      playTime: "",
      administrator: "",
      gameTitle: "",
      course: "",
      format: "",
    };
    state.summarySortKey = "playDateRaw";
    state.summarySortDir = "asc";
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