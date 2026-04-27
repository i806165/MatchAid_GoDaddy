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
    players:  [],         // derived client-side from state.games
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

    // Context pills
    pillFrom:   document.getElementById("cdPillFrom"),
    pillTo:     document.getElementById("cdPillTo"),
    pillGames:  document.getElementById("cdPillGames"),
    pillRounds: document.getElementById("cdPillRounds"),

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
    return String(v).toLowerCase().includes("shotgun") ? "SG" : "TT";
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

    if (el.sortSummary) el.sortSummary.hidden = (view !== "summary");
    if (el.sortPlayer)  el.sortPlayer.hidden  = (view !== "player");

    if (view === "summary")   renderSummary();
    if (view === "player")    renderPlayer();
    if (view === "dashboard") renderDashboard();
  }

  // ── Context pills ──────────────────────────────────────────────
  function renderContextPills() {
    if (el.pillFrom)   el.pillFrom.textContent   = fmtPill(state.filters.dateFrom);
    if (el.pillTo)     el.pillTo.textContent     = fmtPill(state.filters.dateTo);
    if (el.pillGames)  el.pillGames.textContent  = String(state.games.length);
    if (el.pillRounds) el.pillRounds.textContent = String(state.summary.totalRounds ?? 0);
  }

  // ── Summary render ─────────────────────────────────────────────
  function renderSummaryMetrics() {
    const s = state.summary;
    if (el.mTotalRounds) el.mTotalRounds.textContent = dash(s.totalRounds);
    if (el.mTotalGames)  el.mTotalGames.textContent  = dash(s.gameCount);
    if (el.mAvgPlayers)  el.mAvgPlayers.textContent  = dash(s.avgPerGame);
    if (el.mTotalSlots)  el.mTotalSlots.textContent  = dash(s.totalSlots);
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

  function buildSummarySubtitle() {
    const grp = { month:"Month", course:"Course", admin:"Admin", none:"None" }[state.groupBy] || "";
    const srt = { date:"Date", players:"Players", course:"Course", admin:"Admin" }[state.sortBy] || "";
    return grp !== "None" ? `Grouped by ${grp} · Sorted by ${srt}` : `Sorted by ${srt}`;
  }

  function renderSummary() {
    renderSummaryMetrics();

    const games = state.games;
    if (!games.length) {
      if (el.summaryEmpty)   el.summaryEmpty.style.display = "";
      if (el.summaryTbody)   el.summaryTbody.innerHTML     = "";
      if (el.summaryCardSub) el.summaryCardSub.textContent = "";
      return;
    }

    if (el.summaryEmpty) el.summaryEmpty.style.display = "none";

    const sorted  = [...games].sort(getSummaryComparator());
    const groupFn = getGroupFn();
    let lastGroup = null;
    let html      = "";

    for (const g of sorted) {
      const grp = groupFn(g);
      if (grp !== null && grp !== lastGroup) {
        lastGroup = grp;
        html += `<tr class="cdGroupHdr"><td colspan="8">${esc(grp)}</td></tr>`;
      }
      html += `<tr>
        <td>${esc(fmtDate(g.playDate))}</td>
        <td class="cdMuted">${esc(fmtTime(g.playTime))}</td>
        <td class="cdMuted">${esc(dash(g.adminName))}</td>
        <td>${esc(dash(g.title))}</td>
        <td><span class="cdBadge">${esc(dash(g.courseName))}</span></td>
        <td class="cdMuted">${esc(fmtMethod(g.toMethod))}</td>
        <td class="cdRight">${esc(String(g.slotCount   ?? "—"))}</td>
        <td class="cdRight">${esc(String(g.playerCount ?? "—"))}</td>
      </tr>`;
    }

    if (el.summaryTbody)   el.summaryTbody.innerHTML     = html;
    if (el.summaryCardSub) el.summaryCardSub.textContent = buildSummarySubtitle();
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
    const players  = getFilteredPlayers();
    const total    = state.players.length;
    const rounds   = state.summary.totalRounds ?? 0;
    const avg      = total > 0 ? (rounds / total).toFixed(1) : "—";
    const peak     = state.players.length
      ? Math.max(...state.players.map(p => p.rounds))
      : "—";

    if (el.mUniquePlayers) el.mUniquePlayers.textContent = String(total);
    if (el.mPlayerRounds)  el.mPlayerRounds.textContent  = String(rounds);
    if (el.mAvgRounds)     el.mAvgRounds.textContent     = String(avg);
    if (el.mMostActive)    el.mMostActive.textContent    = String(peak);

    if (!players.length) {
      if (el.playerEmpty)   el.playerEmpty.style.display   = "";
      if (el.playerTbody)   el.playerTbody.innerHTML       = "";
      if (el.playerCardSub) el.playerCardSub.textContent   = "";
      return;
    }

    if (el.playerEmpty) el.playerEmpty.style.display = "none";

    const html = players.map(p => {
      const courses = Array.from(p.courses).map(c => `<span class="cdBadge">${esc(c)}</span>`).join(" ");
      const admins  = Array.from(p.admins).join(", ");
      return `<tr>
        <td style="font-weight:900">${esc(p.name || "—")}</td>
        <td class="cdRight">${esc(String(p.rounds))}</td>
        <td>${courses || "—"}</td>
        <td class="cdMuted">${esc(admins || "—")}</td>
        <td class="cdMuted">${esc(fmtDateShort(p.firstGame))}</td>
        <td class="cdMuted">${esc(fmtDateShort(p.lastGame))}</td>
      </tr>`;
    }).join("");

    if (el.playerTbody)   el.playerTbody.innerHTML     = html;
    if (el.playerCardSub) el.playerCardSub.textContent =
      `${players.length} of ${total} players · Sorted by ${state.pSortBy}`;
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
      renderContextPills();
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
        state.sortBy = btn.dataset.sort;
        renderSummary();
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
        visible:    ["home", "demand"],
        active:     "demand",
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
      renderContextPills();
      setView("summary");

      // Fresh load — prompt user to confirm/adjust date range before exploring
      // Return visit — session dates restored, render immediately
      if (!init.isReturn) openModal();

      setStatus("Ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();