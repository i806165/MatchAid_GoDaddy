/* /assets/pages/game_summary.js
 * Game Summary (GoDaddy PHP version)
 * - Reuses ma_shared.css for chrome/cards/buttons.
 * - View provides DOM (gamesummary_view.php); JS hydrates from window.__INIT__.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : function (m, lvl) { if (m) console.log("[STATUS]", lvl || "info", m); };

  const state = {
    scope: "byPlayer", // byPlayer | byGroup
    game: null,
    roster: []
  };

  // ---- DOM ----
  const el = {
    gameTitle: document.getElementById("gameTitle"),
    gameFacility: document.getElementById("gameFacility"),
    gameCourseTime: document.getElementById("gameCourseTime"),
    configGrid: document.getElementById("configGrid"),
    rosterTbody: document.getElementById("rosterTableBody"),
    mobileList: document.getElementById("mobileList"),
    scopeByPlayer: document.getElementById("scopeByPlayer"),
    scopeByGroup: document.getElementById("scopeByGroup"),
    pillPlayers: document.getElementById("pillPlayers"),
    pillHoles: document.getElementById("pillHoles"),
    pillHcMethod: document.getElementById("pillHcMethod"),
    emptyHint: document.getElementById("gsEmptyHint"),

    actionsBtn: document.getElementById("gsActionsBtn"),
    actionsModal: document.getElementById("gsActionsModal"),
    actionsCloseBtn: document.getElementById("gsActionsCloseBtn"),
    openSettingsBtn: document.getElementById("openGameSettingsButton"),
    refreshHcBtn: document.getElementById("refreshHcMenuButton"),
    printScorecardsBtn: document.getElementById("printScorecardsButton"),
    downloadCsvBtn: document.getElementById("downloadCsvButton"),
    emailBtn: document.getElementById("emailCsvButton"),
    actionHint: document.getElementById("gsActionHint")
  };

  // ---- helpers ----
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeString(v) { return String(v ?? ""); }
  function valueOrDash(v) { const s = safeString(v).trim(); return s ? s : "—"; }

  function numberOrDash(v) {
    if (v === null || v === undefined) return "—";
    const s = String(v).trim();
    if (!s) return "—";
    const n = Number(s);
    if (Number.isFinite(n)) {
      // Keep integers as-is, floats to 1dp (mirrors legacy feel)
      return (Math.round(n) === n) ? String(n) : n.toFixed(1);
    }
    return s;
  }

  function openModal() {
    if (!el.actionsModal) return;
    el.actionsModal.classList.add("is-open");
    el.actionsModal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    if (!el.actionsModal) return;
    el.actionsModal.classList.remove("is-open");
    el.actionsModal.setAttribute("aria-hidden", "true");
    hideActionHint();
  }

  function showActionHint(msg, level) {
    if (!el.actionHint) return;
    el.actionHint.style.display = "block";
    el.actionHint.textContent = String(msg || "");
    // reuse status color semantics lightly
    el.actionHint.style.color = (level === "err") ? "var(--danger)" : "inherit";
  }
  function hideActionHint() {
    if (!el.actionHint) return;
    el.actionHint.style.display = "none";
    el.actionHint.textContent = "";
  }

  function configRow(label, value) {
    return (
      '<div class="gsKV">' +
        '<div class="gsKVLabel">' + esc(label) + '</div>' +
        '<div class="gsKVValue" title="' + esc(valueOrDash(value)) + '">' + esc(valueOrDash(value)) + '</div>' +
      '</div>'
    );
  }

  function normalizeRosterForDisplay(records) {
    const copy = Array.isArray(records) ? records.slice() : [];
    copy.sort((a, b) => {
      const teeA = safeString(a.dbPlayers_TeeTime).trim();
      const teeB = safeString(b.dbPlayers_TeeTime).trim();
      if (teeA && teeB && teeA !== teeB) return teeA.localeCompare(teeB);
      if (teeA && !teeB) return -1;
      if (!teeA && teeB) return 1;

      const pairA = safeString(a.dbPlayers_PairingID).trim();
      const pairB = safeString(b.dbPlayers_PairingID).trim();
      if (pairA !== pairB) return pairA.localeCompare(pairB);

      const posA = Number(a.dbPlayers_PairingPos);
      const posB = Number(b.dbPlayers_PairingPos);
      if (Number.isFinite(posA) && Number.isFinite(posB) && posA !== posB) return posA - posB;

      const lnA = safeString(a.dbPlayers_LName).trim();
      const lnB = safeString(b.dbPlayers_LName).trim();
      if (lnA !== lnB) return lnA.localeCompare(lnB);

      const nmA = safeString(a.dbPlayers_Name).trim();
      const nmB = safeString(b.dbPlayers_Name).trim();
      return nmA.localeCompare(nmB);
    });
    return copy;
  }

  function groupRoster(sortedRoster) {
    // flight -> pairing -> players
    const flightsMap = new Map();

    sortedRoster.forEach((p) => {
      const flightId = safeString(p.dbPlayers_FlightID).trim() || "—";
      const pairingId = safeString(p.dbPlayers_PairingID).trim() || "—";

      if (!flightsMap.has(flightId)) flightsMap.set(flightId, new Map());
      const pairMap = flightsMap.get(flightId);
      if (!pairMap.has(pairingId)) pairMap.set(pairingId, []);
      pairMap.get(pairingId).push(p);
    });

    // Convert to arrays (stable order by key)
    const flightIds = Array.from(flightsMap.keys()).sort((a,b)=>a.localeCompare(b));
    return flightIds.map(fid => {
      const pairMap = flightsMap.get(fid);
      const pairingIds = Array.from(pairMap.keys()).sort((a,b)=>a.localeCompare(b));
      return {
        flightId: fid,
        pairings: pairingIds.map(pid => ({ pairingId: pid, players: pairMap.get(pid) }))
      };
    });
  }

  // ---- rendering ----
  function renderHeader() {
    const g = state.game || {};
    if (el.gameTitle) el.gameTitle.textContent = safeString(g.dbGames_Title || "Game");
    if (el.gameFacility) el.gameFacility.textContent = safeString(g.dbGames_FacilityName || g.dbGames_AdminClubName || "—");

    const dateText = g.gameDateDDDMMDDYY || g.dbGames_PlayDate || "—";
    const timeText = g.gameTimeCondensed || g.dbGames_PlayTime || "—";
    const courseText = safeString(g.dbGames_CourseName || "");
    const courseLine = courseText ? (courseText + " • " + timeText + " • " + dateText) : (timeText + " • " + dateText);
    if (el.gameCourseTime) el.gameCourseTime.textContent = courseLine;

    if (el.pillPlayers) el.pillPlayers.textContent = "Players: " + String((state.roster || []).length);
    if (el.pillHoles) el.pillHoles.textContent = "Holes: " + valueOrDash(g.dbGames_Holes);
    if (el.pillHcMethod) el.pillHcMethod.textContent = "HC: " + valueOrDash(g.dbGames_HCMethod || g.dbGames_HCMethod || g.dbGames_HcMethod);
  }

  function renderConfig() {
    const g = state.game;
    if (!el.configGrid) return;
    if (!g) { el.configGrid.innerHTML = ""; return; }

    const parts = [];
    // Mirrors Wix widget config
    parts.push(configRow("Facility", g.dbGames_FacilityName));
    parts.push(configRow("Course", g.dbGames_CourseName));
    parts.push(configRow("Play Date", g.gameDateDDDMMDDYY || g.dbGames_PlayDate));
    parts.push(configRow("Play Time", g.gameTimeCondensed || g.dbGames_PlayTime));
    parts.push(configRow("Holes", g.dbGames_Holes));
    parts.push(configRow("TeeOff Method", g.dbGames_TOMethod));
    parts.push(configRow("Game Format", g.dbGames_GameFormat));
    parts.push(configRow("Privacy", g.dbGames_Privacy));

    parts.push(configRow("Competition", g.dbGames_Competition));
    parts.push(configRow("Segments", g.dbGames_Segments));
    parts.push(configRow("Rotation", g.dbGames_RotationMethod));
    parts.push(configRow("Blind Players", g.dbGames_BlindPlayers));

    parts.push(configRow("Scoring Basis", g.dbGames_ScoringBasis));
    parts.push(configRow("Scoring Method", g.dbGames_ScoringMethod));
    parts.push(configRow("Scoring System", g.dbGames_ScoringSystem));
    parts.push(configRow("Best Ball", g.dbGames_BestBall));
    parts.push(configRow("Declare Player", g.dbGames_PlayerDeclaration));
    parts.push(configRow("Declare Hole", g.dbGames_HoleDeclaration));

    parts.push(configRow("HC Method", g.dbGames_HCMethod));
    parts.push(configRow("Allowance", g.dbGames_Allowance));
    parts.push(configRow("Stroke Distribution", g.dbGames_StrokeDistribution));
    parts.push(configRow("HC Effectivity", g.dbGames_HCEffectivity));
    parts.push(configRow("HC Eff. Date", g.dbGames_HCEffectivityDate));

    el.configGrid.innerHTML = parts.join("");
  }

  function renderScopeButtons() {
    const byPlayer = state.scope === "byPlayer";
    if (el.scopeByPlayer) {
      el.scopeByPlayer.classList.toggle("is-active", byPlayer);
      el.scopeByPlayer.setAttribute("aria-selected", byPlayer ? "true" : "false");
    }
    if (el.scopeByGroup) {
      el.scopeByGroup.classList.toggle("is-active", !byPlayer);
      el.scopeByGroup.setAttribute("aria-selected", (!byPlayer) ? "true" : "false");
    }
  }

  function renderRoster() {
    const sorted = normalizeRosterForDisplay(state.roster || []);
    if (el.emptyHint) el.emptyHint.style.display = sorted.length ? "none" : "block";
    if (state.scope === "byPlayer") renderRosterByPlayer(sorted);
    else renderRosterByGroup(sorted);
  }

  function renderRosterByPlayer(sorted) {
    // Desktop table
    if (el.rosterTbody) {
      el.rosterTbody.innerHTML = sorted.map(p => {
        const name = valueOrDash(p.dbPlayers_Name);
        const tee = valueOrDash(p.dbPlayers_TeeSetName);
        const hi = numberOrDash(p.dbPlayers_HI);
        const ch = numberOrDash(p.dbPlayers_CH);
        const ph = numberOrDash(p.dbPlayers_PH);
        const so = numberOrDash(p.dbPlayers_SO);
        const time = valueOrDash(p.dbPlayers_TeeTime);
        const start = valueOrDash(p.dbPlayers_StartHole);
        const flight = valueOrDash(p.dbPlayers_FlightID);
        const pair = valueOrDash(p.dbPlayers_PairingID);
        const pos = valueOrDash(p.dbPlayers_PairingPos);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        return (
          "<tr>" +
            "<td title=\"" + esc(name) + "\">" + esc(name) + "</td>" +
            "<td title=\"" + esc(tee) + "\">" + esc(tee) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(hi) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(ch) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(ph) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(so) + "</td>" +
            "<td class=\"gsMono\">" + esc(time) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(start) + "</td>" +
            "<td class=\"gsMono\">" + esc(flight) + "</td>" +
            "<td class=\"gsMono\">" + esc(pair) + "</td>" +
            "<td class=\"gsRight gsMono\">" + esc(pos) + "</td>" +
            "<td class=\"gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
          "</tr>"
        );
      }).join("");
    }

    // Mobile
    if (el.mobileList) {
      el.mobileList.innerHTML = sorted.map(p => {
        const name = valueOrDash(p.dbPlayers_Name);
        const ph = numberOrDash(p.dbPlayers_PH);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        const time = valueOrDash(p.dbPlayers_TeeTime);
        const start = valueOrDash(p.dbPlayers_StartHole);
        const tee = valueOrDash(p.dbPlayers_TeeSetName);

        const ch = numberOrDash(p.dbPlayers_CH);
        const hi = numberOrDash(p.dbPlayers_HI);
        const so = numberOrDash(p.dbPlayers_SO);

        const flight = valueOrDash(p.dbPlayers_FlightID);
        const pair = valueOrDash(p.dbPlayers_PairingID);
        const pos = valueOrDash(p.dbPlayers_PairingPos);

        return (
          '<div class="gsPlayerCard">' +
            '<div class="gsLine1">' +
              '<div class="gsName" title="' + esc(name) + '">' + esc(name) + '</div>' +
              '<div class="gsPH">PH ' + esc(ph) + '</div>' +
              '<a class="gsScoreLink gsMono" href="#" data-scoreid="' + esc(scoreId) + '" title="Open Scorecard">' + esc(scoreId) + '</a>' +
            '</div>' +
            '<div class="gsLine2">' +
              '<div class="gsMetaItem">Time ' + esc(time) + '</div>' +
              '<div class="gsMetaItem">Start ' + esc(start) + '</div>' +
              '<div class="gsMetaItem">Tee ' + esc(tee) + '</div>' +
            '</div>' +
            '<div class="gsLine3">' +
              '<div class="gsMetaItem">CH ' + esc(ch) + '</div>' +
              '<div class="gsMetaItem">HI ' + esc(hi) + '</div>' +
              '<div class="gsMetaItem">SO ' + esc(so) + '</div>' +
            '</div>' +
            '<div class="gsLine4">' +
              '<div class="gsMetaItem">Flight ' + esc(flight) + '</div>' +
              '<div class="gsMetaItem">Pair ' + esc(pair) + '</div>' +
              '<div class="gsMetaItem">Pos ' + esc(pos) + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join("");
    }

    wireScoreLinks();
  }

  function renderRosterByGroup(sorted) {
    const flights = groupRoster(sorted);
    const desktopParts = [];

    flights.forEach(f => {
      f.pairings.forEach(pg => {
        desktopParts.push(
          '<tr class="gsGroupHdr"><td colspan="12"><strong>Match ' + esc(f.flightId) + ' · Pair ' + esc(pg.pairingId) + '</strong></td></tr>'
        );
        pg.players.forEach(p => {
          const name = valueOrDash(p.dbPlayers_Name);
          const tee = valueOrDash(p.dbPlayers_TeeSetName);
          const hi = numberOrDash(p.dbPlayers_HI);
          const ch = numberOrDash(p.dbPlayers_CH);
          const ph = numberOrDash(p.dbPlayers_PH);
          const so = numberOrDash(p.dbPlayers_SO);
          const time = valueOrDash(p.dbPlayers_TeeTime);
          const start = valueOrDash(p.dbPlayers_StartHole);
          const scoreId = valueOrDash(p.dbPlayers_PlayerKey);
          // hide pairing columns in group view? we keep them for consistency but show same.
          desktopParts.push(
            "<tr>" +
              "<td>" + esc(name) + "</td>" +
              "<td>" + esc(tee) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(hi) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(ch) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(ph) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(so) + "</td>" +
              "<td class=\"gsMono\">" + esc(time) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(start) + "</td>" +
              "<td class=\"gsMono\">" + esc(f.flightId) + "</td>" +
              "<td class=\"gsMono\">" + esc(pg.pairingId) + "</td>" +
              "<td class=\"gsRight gsMono\">" + esc(valueOrDash(p.dbPlayers_PairingPos)) + "</td>" +
              "<td class=\"gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
            "</tr>"
          );
        });
      });
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");

    // Mobile: same player cards but insert simple headers
    if (el.mobileList) {
      const mob = [];
      flights.forEach(f => {
        f.pairings.forEach(pg => {
          mob.push('<div class="maHint"><strong>Match ' + esc(f.flightId) + ' · Pair ' + esc(pg.pairingId) + '</strong></div>');
          pg.players.forEach(p => {
            const name = valueOrDash(p.dbPlayers_Name);
            const ph = numberOrDash(p.dbPlayers_PH);
            const scoreId = valueOrDash(p.dbPlayers_PlayerKey);
            const time = valueOrDash(p.dbPlayers_TeeTime);
            const start = valueOrDash(p.dbPlayers_StartHole);
            const tee = valueOrDash(p.dbPlayers_TeeSetName);
            const ch = numberOrDash(p.dbPlayers_CH);
            const hi = numberOrDash(p.dbPlayers_HI);
            const so = numberOrDash(p.dbPlayers_SO);

            mob.push(
              '<div class="gsPlayerCard">' +
                '<div class="gsLine1">' +
                  '<div class="gsName">' + esc(name) + '</div>' +
                  '<div class="gsPH">PH ' + esc(ph) + '</div>' +
                  '<a class="gsScoreLink gsMono" href="#" data-scoreid="' + esc(scoreId) + '">' + esc(scoreId) + '</a>' +
                '</div>' +
                '<div class="gsLine2">' +
                  '<div class="gsMetaItem">Time ' + esc(time) + '</div>' +
                  '<div class="gsMetaItem">Start ' + esc(start) + '</div>' +
                  '<div class="gsMetaItem">Tee ' + esc(tee) + '</div>' +
                '</div>' +
                '<div class="gsLine3">' +
                  '<div class="gsMetaItem">CH ' + esc(ch) + '</div>' +
                  '<div class="gsMetaItem">HI ' + esc(hi) + '</div>' +
                  '<div class="gsMetaItem">SO ' + esc(so) + '</div>' +
                '</div>' +
              '</div>'
            );
          });
        });
      });
      el.mobileList.innerHTML = mob.join("");
    }

    wireScoreLinks();
  }

  function wireScoreLinks() {
    const links = document.querySelectorAll(".gsScoreLink[data-scoreid]");
    links.forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const scoreId = String(a.getAttribute("data-scoreid") || "").trim();
        if (!scoreId || scoreId === "—") return;

        // Best-effort routing: if routerGo supports it, use it; else copy to clipboard.
        if (typeof MA.routerGo === "function") {
          try {
            MA.routerGo("score", { scoreId: scoreId });
            return;
          } catch (err) {
            console.warn(err);
          }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(scoreId).then(() => {
            setStatus("ScoreID copied: " + scoreId, "ok");
          }).catch(() => {
            setStatus("ScoreID: " + scoreId, "info");
          });
        } else {
          setStatus("ScoreID: " + scoreId, "info");
        }
      });
    });
  }

  // ---- actions ----
  function buildCsvText() {
    const rows = normalizeRosterForDisplay(state.roster || []);
    const header = ["Name","Tee","HI","CH","PH","SO","Time","Start","Match","Pair","Pos","ScoreID"];
    const lines = [header.join(",")];

    rows.forEach(p => {
      const vals = [
        safeString(p.dbPlayers_Name),
        safeString(p.dbPlayers_TeeSetName),
        safeString(p.dbPlayers_HI),
        safeString(p.dbPlayers_CH),
        safeString(p.dbPlayers_PH),
        safeString(p.dbPlayers_SO),
        safeString(p.dbPlayers_TeeTime),
        safeString(p.dbPlayers_StartHole),
        safeString(p.dbPlayers_FlightID),
        safeString(p.dbPlayers_PairingID),
        safeString(p.dbPlayers_PairingPos),
        safeString(p.dbPlayers_PlayerKey),
      ].map(v => '"' + String(v ?? "").replace(/"/g,'""') + '"');

      lines.push(vals.join(","));
    });

    return lines.join("\n");
  }

  function downloadCsv() {
    const ggid = String((state.game && (state.game.dbGames_GGID || state.game.dbGames_GGIDnum)) || "game");
    const fileName = "MatchAid_GameSummary_" + ggid + ".csv";
    const csv = buildCsvText();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    setStatus("CSV downloaded.", "ok");
  }

  async function refreshHandicaps() {
    // Placeholder until you point this to the canonical workflow endpoint.
    // Keep behavior clean: show a single status + optional hint.
    setStatus("Refresh handicaps not wired yet for GoDaddy.", "warn");
    showActionHint("TODO: wire to handicap workflow endpoint (Pass-A/Pass-B).", "warn");
  }

  function emailSummary() {
    const g = state.game || {};
    const subj = encodeURIComponent("MatchAid Game Summary - " + (g.dbGames_Title || "Game"));
    const body = encodeURIComponent(
      "Attached: Game Summary CSV (download from the page first).\n\n" +
      "Game: " + (g.dbGames_Title || "") + "\n" +
      "Facility: " + (g.dbGames_FacilityName || "") + "\n" +
      "Course: " + (g.dbGames_CourseName || "") + "\n" +
      "Date: " + (g.dbGames_PlayDate || "") + "\n"
    );
    window.location.href = "mailto:?subject=" + subj + "&body=" + body;
  }

  function openGameSettings() {
    // Best-effort navigation; adjust to your router action or direct path as needed.
    if (typeof MA.routerGo === "function") {
      try { MA.routerGo("gamesettings"); return; } catch (e) {}
    }
    setStatus("Open Game Settings: wire router action for this button.", "warn");
    showActionHint("TODO: route to the Game Settings page.", "warn");
  }

  function printScorecards() {
    if (typeof MA.routerGo === "function") {
      try { MA.routerGo("scorecards"); return; } catch (e) {}
    }
    setStatus("Print Scorecards: wire router action for this button.", "warn");
    showActionHint("TODO: route to your scorecards page.", "warn");
  }

  // ---- init ----
  async function fetchInitIfNeeded() {
    const init = window.__INIT__ || window.__MA_INIT__ || null;
    if (init && init.ok) return init;

    if (!postJson || !MA.paths || !MA.paths.apiGameSummary) {
      throw new Error("Missing init payload and MA.paths.apiGameSummary");
    }

    const res = await postJson(MA.paths.apiGameSummary, { action: "INIT" });
    return res;
  }

  function applyInit(init) {
    if (!init || !init.ok) throw new Error(init?.message || "Init failed");
    state.game = init.game || init.payload?.game || null;
    state.roster = init.roster || init.payload?.roster || [];
  }

  function wireEvents() {
    if (el.scopeByPlayer) el.scopeByPlayer.addEventListener("click", () => { state.scope = "byPlayer"; renderScopeButtons(); renderRoster(); });
    if (el.scopeByGroup) el.scopeByGroup.addEventListener("click", () => { state.scope = "byGroup"; renderScopeButtons(); renderRoster(); });

    if (el.actionsBtn) el.actionsBtn.addEventListener("click", openModal);
    if (el.actionsCloseBtn) el.actionsCloseBtn.addEventListener("click", closeModal);
    if (el.actionsModal) {
      el.actionsModal.addEventListener("click", (e) => {
        if (e.target === el.actionsModal) closeModal();
      });
    }

    if (el.openSettingsBtn) el.openSettingsBtn.addEventListener("click", () => { hideActionHint(); openGameSettings(); });
    if (el.refreshHcBtn) el.refreshHcBtn.addEventListener("click", async () => { hideActionHint(); await refreshHandicaps(); });
    if (el.printScorecardsBtn) el.printScorecardsBtn.addEventListener("click", () => { hideActionHint(); printScorecards(); });
    if (el.downloadCsvBtn) el.downloadCsvBtn.addEventListener("click", () => { hideActionHint(); downloadCsv(); });
    if (el.emailBtn) el.emailBtn.addEventListener("click", () => { hideActionHint(); emailSummary(); });
  }

  async function boot() {
    try {
      setStatus("Loading game summary…", "info");
      const init = await fetchInitIfNeeded();
      applyInit(init);
      wireEvents();

      // Chrome setup (best-effort)
      if (chrome && typeof chrome.setTitle === "function") chrome.setTitle("Game Summary");
      if (chrome && typeof chrome.setSubtitle === "function") {
        const ggid = (state.game && (state.game.dbGames_GGID || state.game.dbGames_GGIDnum)) || "";
        chrome.setSubtitle(ggid ? ("GGID " + ggid) : "");
      }

      renderHeader();
      renderConfig();
      renderScopeButtons();
      renderRoster();

      setStatus("Ready.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "err");
    }
  }

  boot();
})();
