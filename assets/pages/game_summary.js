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
    // Controls band
    cfgToggle: document.getElementById("gsCfgToggle"),
    cfgPanel: document.getElementById("gsCfgPanel"),
    configGrid: document.getElementById("configGrid"),

    scopeByPlayer: document.getElementById("scopeByPlayer"),
    scopeByGroup: document.getElementById("scopeByGroup"),

    metaPlayers: document.getElementById("gsMetaPlayers"),
    metaHoles: document.getElementById("gsMetaHoles"),
    metaHC: document.getElementById("gsMetaHC"),

    // Body
    rosterTbody: document.getElementById("rosterTableBody"),
    mobileList: document.getElementById("mobileList"),
    emptyHint: document.getElementById("gsEmptyHint"),

    // Optional (if you later add explicit buttons in the view)
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

  function showActionHint(msg, level) {
    if (!el.actionHint) return;
    el.actionHint.style.display = "block";
    el.actionHint.textContent = String(msg || "");
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

  function setConfigExpanded(isExpanded) {
    if (!el.cfgToggle || !el.cfgPanel) return;
    el.cfgToggle.classList.toggle("is-open", !!isExpanded);
    el.cfgToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    el.cfgPanel.hidden = !isExpanded;
  }

  function renderMetaPills() {
    const g = state.game || {};
    const players = Array.isArray(state.roster) ? state.roster.length : 0;

    if (el.metaPlayers) el.metaPlayers.textContent = players ? String(players) : "—";

    const holes = String(g.dbGames_Holes || "").trim();
    if (el.metaHoles) el.metaHoles.textContent = holes || "—";

    const hc = String(g.dbGames_HCMethod || "").trim();
    if (el.metaHC) el.metaHC.textContent = hc || "—";
  }

  function normalizeRosterForDisplay(records) {
    const copy = Array.isArray(records) ? records.slice() : [];
    copy.sort((a, b) => {
      const teeA = safeString(a.dbPlayers_TeeTime).trim();
      const teeB = safeString(b.dbPlayers_TeeTime).trim();
      if (teeA && teeB && teeA !== teeB) return teeA.localeCompare(teeB);
      if (teeA && !teeB) return -1;
      if (!teeA && teeB) return 1;

      const flightA = safeString(a.dbPlayers_FlightID).trim();
      const flightB = safeString(b.dbPlayers_FlightID).trim();
      if (flightA !== flightB) return flightA.localeCompare(flightB, undefined, { numeric: true });

      const fPosA = safeString(a.dbPlayers_FlightPos).trim();
      const fPosB = safeString(b.dbPlayers_FlightPos).trim();
      if (fPosA !== fPosB) return fPosA.localeCompare(fPosB);

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
  function renderConfig() {
    const g = state.game;
    if (!el.configGrid) return;
    if (!g) { el.configGrid.innerHTML = ""; return; }

    const parts = [];
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

    // Add class to table for CSS-based column visibility
    const isPairPair = state.game?.dbGames_Competition === 'PairPair';
    if (el.rosterTbody) {
      const table = el.rosterTbody.closest('table');
      if (table) table.classList.toggle('is-match-play', isPairPair);
    }
    if (el.mobileList) {
      el.mobileList.classList.toggle('is-match-play', isPairPair);
    }

    if (state.scope === "byPlayer") renderRosterByPlayer(sorted);
    else renderRosterByGroup(sorted);
  }

  function renderRosterByPlayer(sorted) {
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
        const fPos = valueOrDash(p.dbPlayers_FlightPos);
        const pair = valueOrDash(p.dbPlayers_PairingID);
        const pos = valueOrDash(p.dbPlayers_PairingPos);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        return (
          "<tr>" +
            "<td title=\"" + esc(name) + "\">" + esc(name) + "</td>" +
            "<td title=\"" + esc(tee) + "\">" + esc(tee) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(hi) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ch) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ph) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(so) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(time) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(start) + "</td>" +
            "<td class=\"gsCenter gsMono col-match\">" + esc(flight) + "</td>" +
            "<td class=\"gsCenter gsMono col-flightpos\">" + esc(fPos) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pair) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pos) + "</td>" +
            "<td class=\"gsCenter gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
          "</tr>"
        );
      }).join("");
    }

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
        const fPos = valueOrDash(p.dbPlayers_FlightPos);
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
              '<div class="gsMetaItem col-match">Match ' + esc(flight) + '</div>' +
              '<div class="gsMetaItem col-flightpos">Team ' + esc(fPos) + '</div>' +
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
        const isPairPair = state.game?.dbGames_Competition === 'PairPair';
        const colspan = isPairPair ? 13 : 11;
        let headerText = `<strong>Pairing ${esc(pg.pairingId)}</strong>`;
        if (isPairPair) {
            const fPos = pg.players[0]?.dbPlayers_FlightPos || '';
            const teamLabel = fPos ? ` (Team ${fPos})` : '';
            headerText = `<strong>Match ${esc(f.flightId)}${teamLabel} · Pair ${esc(pg.pairingId)}</strong>`;
        }

        desktopParts.push(
          '<tr class="gsGroupHdr"><td colspan="' + colspan + '">' + headerText + '</td></tr>'
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
          const fPos = valueOrDash(p.dbPlayers_FlightPos);
          const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

          desktopParts.push(
            "<tr>" +
              "<td>" + esc(name) + "</td>" +
              "<td>" + esc(tee) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(hi) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(ch) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(ph) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(so) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(time) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(start) + "</td>" +
              "<td class=\"gsCenter gsMono col-match\">" + esc(f.flightId) + "</td>" +
              "<td class=\"gsCenter gsMono col-flightpos\">" + esc(fPos) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(pg.pairingId) + "</td>" +
              "<td class=\"gsCenter gsMono\">" + esc(valueOrDash(p.dbPlayers_PairingPos)) + "</td>" +
              "<td class=\"gsCenter gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
            "</tr>"
          );
        });
      });
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");

    if (el.mobileList) {
      const mob = [];
      flights.forEach(f => {
        f.pairings.forEach(pg => {
          const isPairPair = state.game?.dbGames_Competition === 'PairPair';
          let headerText = `<strong>Pairing ${esc(pg.pairingId)}</strong>`;
          if (isPairPair) {
              const fPos = pg.players[0]?.dbPlayers_FlightPos || '';
              const teamLabel = fPos ? ` (Team ${fPos})` : '';
              headerText = `<strong>Match ${esc(f.flightId)}${teamLabel} · Pair ${esc(pg.pairingId)}</strong>`;
          }
          mob.push('<div class="maHint">' + headerText + '</div>');

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
      const teeName = safeString(p.dbPlayers_TeeSetName);
      const vals = [
        `"` + safeString(p.dbPlayers_Name).replace(/"/g, '""') + `"`,
        // Special format for Tee Name to prevent Excel from converting "2/3" to a date
        teeName.includes('/') ? `="` + teeName.replace(/"/g, '""') + `"` : `"` + teeName.replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_HI).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_CH).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PH).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_SO).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_TeeTime).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_StartHole).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_FlightID).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PairingID).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PairingPos).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PlayerKey).replace(/"/g, '""') + `"`,
      ];

      lines.push(vals.join(","));
    });

    // Append Game Configuration
    const g = state.game || {};
    lines.push(""); // Blank line separator
    lines.push("GAME CONFIGURATION,");
    
    const config = [
      ["Facility", g.dbGames_FacilityName],
      ["Course", g.dbGames_CourseName],
      ["Play Date", g.dbGames_PlayDate],
      ["First Tee Time", g.dbGames_PlayTime],
      ["Holes", g.dbGames_Holes],
      ["Game Format", g.dbGames_GameFormat],
      ["Competition", g.dbGames_Competition],
      ["Scoring Method", g.dbGames_ScoringMethod],
      ["System System", g.dbGames_ScoringSystem],
      ["Handicap Method", g.dbGames_HCMethod],
      ["Handicap Allowance", g.dbGames_Allowance],
      ["Handicap Effectivity", g.dbGames_HCEffectivity],
      ["Effectivity Date", g.dbGames_HCEffectivityDate]
    ];

    config.forEach(([label, val]) => {
      const v = safeString(val).replace(/"/g, '""');
      lines.push(`"${label}","${v}"`);
    });

    return lines.join("\n");
  }

  function buildHtmlSummary() {
    const rows = normalizeRosterForDisplay(state.roster || []);
    const g = state.game || {};
    
    let html = `
      <h2 style="font-family: sans-serif;">${esc(g.dbGames_Title || "Game Summary")}</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 12px; width: 100%;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th>Name</th><th>Tee</th><th>HI</th><th>CH</th><th>PH</th><th>SO</th>
            <th>Time</th><th>Start</th><th>Match</th><th>Pair</th><th>Pos</th><th>ScoreID</th>
          </tr>
        </thead>
        <tbody>`;

    rows.forEach(p => {
      html += `<tr>
        <td>${esc(p.dbPlayers_Name)}</td>
        <td>${esc(p.dbPlayers_TeeSetName)}</td>
        <td align="center">${esc(p.dbPlayers_HI)}</td>
        <td align="center">${esc(p.dbPlayers_CH)}</td>
        <td align="center">${esc(p.dbPlayers_PH)}</td>
        <td align="center">${esc(p.dbPlayers_SO)}</td>
        <td align="center">${esc(p.dbPlayers_TeeTime)}</td>
        <td align="center">${esc(p.dbPlayers_StartHole)}</td>
        <td align="center">${esc(p.dbPlayers_FlightID)}</td>
        <td align="center">${esc(p.dbPlayers_PairingID)}</td>
        <td align="center">${esc(p.dbPlayers_PairingPos)}</td>
        <td align="center">${esc(p.dbPlayers_PlayerKey)}</td>
      </tr>`;
    });

    html += `</tbody></table><br/>
    <h3 style="font-family: sans-serif;">Game Configuration</h3>
    <table border="0" cellpadding="3" cellspacing="0" style="font-family: sans-serif; font-size: 12px;">`;

    const config = [
      ["Facility", g.dbGames_FacilityName],
      ["Course", g.dbGames_CourseName],
      ["Play Date", g.dbGames_PlayDate],
      ["Play Time", g.dbGames_PlayTime],
      ["Holes", g.dbGames_Holes],
      ["Format", g.dbGames_GameFormat],
      ["Competition", g.dbGames_Competition],
      ["Scoring", g.dbGames_ScoringMethod],
      ["System", g.dbGames_ScoringSystem],
      ["HC Method", g.dbGames_HCMethod],
      ["Allowance", g.dbGames_Allowance],
      ["Effectivity", g.dbGames_HCEffectivity],
      ["Eff. Date", g.dbGames_HCEffectivityDate]
    ];

    config.forEach(([label, val]) => {
      html += `<tr><td style="font-weight:bold;">${esc(label)}:</td><td>${esc(safeString(val))}</td></tr>`;
    });

    html += `</table>`;
    return html;
  }

  function copySummaryToClipboard() {
    if (!navigator.clipboard) {
      setStatus("Clipboard API not available on this browser.", "warn");
      showActionHint("Clipboard API not available on this browser.", "warn");
      return;
    }
    const csv = buildCsvText();
    navigator.clipboard.writeText(csv).then(() => {
      setStatus("Summary copied to clipboard.", "ok");
    }).catch(err => {
      console.error("Copy failed", err);
      setStatus("Could not copy to clipboard.", "err");
    });
  }

  async function copyRichTextToClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.write) {
      setStatus("Rich text copy not supported on this browser.", "warn");
      return;
    }
    
    try {
      const html = buildHtmlSummary();
      const text = buildCsvText(); // Fallback plain text
      
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([text], { type: "text/plain" });
      
      const data = [new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })];
      
      await navigator.clipboard.write(data);
      setStatus("Summary copied (Table). Paste into email/doc.", "success");
    } catch (err) {
      console.error("Copy rich text failed", err);
      setStatus("Could not copy rich text.", "error");
    }
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
    if (el.cfgToggle) {
      el.cfgToggle.addEventListener("click", () => {
        const expanded = el.cfgToggle.getAttribute("aria-expanded") === "true";
        setConfigExpanded(!expanded);
      });
    }

    if (el.scopeByPlayer) el.scopeByPlayer.addEventListener("click", () => {
      state.scope = "byPlayer";
      renderScopeButtons();
      renderRoster();
    });

    if (el.scopeByGroup) el.scopeByGroup.addEventListener("click", () => {
      state.scope = "byGroup";
      renderScopeButtons();
      renderRoster();
    });
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [
      { label: "Game Settings", action: "settings", params: { returnTo: "summary" } },
      { label: "Refresh Handicaps", action: refreshHandicaps },
      { separator: true },
      { label: "Print Scorecards", action: printScorecards },
      { label: "Download CSV", action: downloadCsv },
      { label: "Copy Summary (CSV)", action: copySummaryToClipboard },
      { label: "Copy Summary (Table)", action: copyRichTextToClipboard },
      { label: "Email Summary", action: emailSummary }
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  function applyChrome() {
    const g = state.game || {};
    const title = String(g.dbGames_Title || "Game");
    const ggid = String(g.dbGames_GGID || g.dbGames_GGIDnum || "");

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["ADMIN PORTAL", "Game Summary", ggid ? `GGID ${ggid}` : title]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Actions", onClick: openActionsMenu },
        right: { show: false }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
        active: "summary",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  async function boot() {
    try {
      setStatus("Loading game summary…", "info");
      const init = await fetchInitIfNeeded();
      applyInit(init);
      wireEvents();

      applyChrome();

      renderConfig();
      setConfigExpanded(false);       // default collapsed
      renderMetaPills();              // Players / Holes / HC
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
