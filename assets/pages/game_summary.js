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
    scope: "byPairing", // byPlayer | byPairing | byPlayingGroup
    game: null,
    roster: [],
    portal: ""
  };

  // ---- DOM ----
  const el = {
    // Controls band
    cfgToggle: document.getElementById("gsCfgToggle"),

    scopeByPlayer: document.getElementById("scopeByPlayer"),
    scopeByPairing: document.getElementById("scopeByPairing"),
    scopeByPlayingGroup: document.getElementById("scopeByPlayingGroup"),

    // Body
    rosterTbody: document.getElementById("rosterTableBody"),
    mobileList: document.getElementById("mobileList"),
    emptyHint: document.getElementById("gsEmptyHint"),
    cardTitle: document.getElementById("gsCardTitle"),
    scoreIdHeader: document.getElementById("gsScoreIdHeader"),

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
      return (Math.round(n) === n) ? String(n) : n.toFixed(1);
    }
    return s;
  }

  function formatTimeAmPm(str) {
    const s = safeString(str).trim();
    if (!s || s === "—" || s.includes("AM") || s.includes("PM")) return s || "—";
    const parts = s.split(':');
    if (parts.length < 2) return s;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    if (isNaN(h)) return s;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  }

  function formatDate(s) {
    if (!s) return "";
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return s;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function getFormattedStartHole(player) {
    if (!player) return "";
    const isShotgun = state.game?.dbGames_TOMethod === 'Shotgun';
    let startHole = player.dbPlayers_StartHole;
    if (isShotgun && player.dbPlayers_StartHoleSuffix) {
        startHole = `${startHole || ''}${player.dbPlayers_StartHoleSuffix}`;
    }
    return startHole;
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

  function normalizeRosterForPlayerDisplay(records) {
    const copy = Array.isArray(records) ? records.slice() : [];
    copy.sort((a, b) => {
      const lnA = safeString(a.dbPlayers_LName).trim();
      const lnB = safeString(b.dbPlayers_LName).trim();
      if (lnA !== lnB) return lnA.localeCompare(lnB);

      const nmA = safeString(a.dbPlayers_Name).trim();
      const nmB = safeString(b.dbPlayers_Name).trim();
      if (nmA !== nmB) return nmA.localeCompare(nmB);

      const ghinA = safeString(a.dbPlayers_PlayerGHIN).trim();
      const ghinB = safeString(b.dbPlayers_PlayerGHIN).trim();
      return ghinA.localeCompare(ghinB);
    });
    return copy;
  }

  function isPairPairCompetition() {
    return String(state.game?.dbGames_Competition || "").trim() === "PairPair";
  }

  function hasTeamConfig() {
    const v = state.game?.dbGames_TeamConfig;
    return v !== null && v !== undefined && String(v).trim() !== "";
  }

  function resolveTeamName(teamKey) {
    if (!teamKey || teamKey === "—") return teamKey;
    try {
      const raw = state.game?.dbGames_TeamConfig;
      if (!raw) return teamKey;
      const config = typeof raw === "string" ? JSON.parse(raw) : raw;
      const match = (config.teams || []).find(t => t.id === teamKey);
      return match?.name || teamKey;
    } catch (e) {
      return teamKey;
    }
  }

  function pairingSortValue(v) {
    return safeString(v).trim();
  }

  function numericOrTextCompare(a, b) {
    const aNum = Number(a);
    const bNum = Number(b);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function normalizeRosterForPairingDisplay(records) {
    const copy = Array.isArray(records) ? records.slice() : [];
    const pairPair = isPairPairCompetition();

    copy.sort((a, b) => {
      if (pairPair) {
        const flightA = pairingSortValue(a.dbPlayers_FlightID) || "—";
        const flightB = pairingSortValue(b.dbPlayers_FlightID) || "—";
        if (flightA !== flightB) return flightA.localeCompare(flightB, undefined, { numeric: true });

        const teamA = pairingSortValue(a.dbPlayers_FlightPos) || "—";
        const teamB = pairingSortValue(b.dbPlayers_FlightPos) || "—";
        if (teamA !== teamB) return numericOrTextCompare(teamA, teamB);
      }

      const pairA = pairingSortValue(a.dbPlayers_PairingID) || "—";
      const pairB = pairingSortValue(b.dbPlayers_PairingID) || "—";
      if (pairA !== pairB) return pairA.localeCompare(pairB, undefined, { numeric: true });

      const posA = pairingSortValue(a.dbPlayers_PairingPos) || "999";
      const posB = pairingSortValue(b.dbPlayers_PairingPos) || "999";
      if (posA !== posB) return numericOrTextCompare(posA, posB);

      const lnA = pairingSortValue(a.dbPlayers_LName);
      const lnB = pairingSortValue(b.dbPlayers_LName);
      if (lnA !== lnB) return lnA.localeCompare(lnB);

      const nmA = pairingSortValue(a.dbPlayers_Name);
      const nmB = pairingSortValue(b.dbPlayers_Name);
      return nmA.localeCompare(nmB);
    });

    return copy;
  }

  function normalizeRosterForPlayingGroupDisplay(records) {
    const copy = Array.isArray(records) ? records.slice() : [];
    const pairPair = isPairPairCompetition();
    const toMethod = String(state.game?.dbGames_TOMethod || "").trim();
    const isShotgun  = toMethod === "ShotGun";
    const isTeeTimes = toMethod === "TeeTimes";

    function parseTimeToMinutes(timeText) {
      const raw = String(timeText || "").trim();
      if (!raw) return null;
      let m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)\b/i);
      if (m) {
        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        if (hour === 12) hour = 0;
        if (m[3].toUpperCase() === "PM") hour += 12;
        return hour * 60 + minute;
      }
      m = raw.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:$|\s)/);
      if (m) {
        const hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
      }
      return null;
    }

    function holeSortValue(v) {
      const n = Number(String(v ?? "").trim());
      return Number.isFinite(n) ? n : 999;
    }

    function suffixSortValue(v) {
      const s = String(v ?? "").trim().toUpperCase();
      if (!s) return "ZZZ";
      return s;
    }

    copy.sort((a, b) => {
      if (isTeeTimes) {
        const tA = parseTimeToMinutes(a.dbPlayers_TeeTime) ?? 9999;
        const tB = parseTimeToMinutes(b.dbPlayers_TeeTime) ?? 9999;
        if (tA !== tB) return tA - tB;
      }

      if (isShotgun) {
        const holeA = holeSortValue(a.dbPlayers_StartHole);
        const holeB = holeSortValue(b.dbPlayers_StartHole);
        if (holeA !== holeB) return holeA - holeB;

        const suffixA = suffixSortValue(a.dbPlayers_StartHoleSuffix);
        const suffixB = suffixSortValue(b.dbPlayers_StartHoleSuffix);
        if (suffixA !== suffixB) return suffixA.localeCompare(suffixB);
      }

      const groupA = pairingSortValue(a.dbPlayers_PlayerKey) || "—";
      const groupB = pairingSortValue(b.dbPlayers_PlayerKey) || "—";
      if (groupA !== groupB) return groupA.localeCompare(groupB, undefined, { numeric: true });

      if (pairPair) {
        const flightA = pairingSortValue(a.dbPlayers_FlightID) || "—";
        const flightB = pairingSortValue(b.dbPlayers_FlightID) || "—";
        if (flightA !== flightB) return flightA.localeCompare(flightB, undefined, { numeric: true });

        const teamA = pairingSortValue(a.dbPlayers_FlightPos) || "—";
        const teamB = pairingSortValue(b.dbPlayers_FlightPos) || "—";
        if (teamA !== teamB) return numericOrTextCompare(teamA, teamB);
      }

      const pairA = pairingSortValue(a.dbPlayers_PairingID) || "—";
      const pairB = pairingSortValue(b.dbPlayers_PairingID) || "—";
      if (pairA !== pairB) return pairA.localeCompare(pairB, undefined, { numeric: true });

      const posA = pairingSortValue(a.dbPlayers_PairingPos) || "999";
      const posB = pairingSortValue(b.dbPlayers_PairingPos) || "999";
      if (posA !== posB) return numericOrTextCompare(posA, posB);

      const lnA = pairingSortValue(a.dbPlayers_LName);
      const lnB = pairingSortValue(b.dbPlayers_LName);
      if (lnA !== lnB) return lnA.localeCompare(lnB);

      const nmA = pairingSortValue(a.dbPlayers_Name);
      const nmB = pairingSortValue(b.dbPlayers_Name);
      return nmA.localeCompare(nmB);
    });

    return copy;
  }

  function groupRosterForPairing(sortedRoster) {
    const pairPair = isPairPairCompetition();
    const groupMap = new Map();

    sortedRoster.forEach((p) => {
      const flightId = pairPair ? (pairingSortValue(p.dbPlayers_FlightID) || "—") : "";
      const flightPos = pairPair ? (pairingSortValue(p.dbPlayers_FlightPos) || "—") : "";
      const pairingId = pairingSortValue(p.dbPlayers_PairingID) || "—";

      const key = pairPair
        ? [flightId, flightPos, pairingId].join("||")
        : pairingId;

      if (!groupMap.has(key)) {
        groupMap.set(key, { flightId, flightPos, pairingId, players: [] });
      }

      groupMap.get(key).players.push(p);
    });

    return Array.from(groupMap.values());
  }

  function groupRosterForPlayingGroup(sortedRoster) {
    const pairPair = isPairPairCompetition();
    const groupMap = new Map();

    sortedRoster.forEach((p) => {
      const playerKey = pairingSortValue(p.dbPlayers_PlayerKey) || "—";
      const flightId = pairPair ? (pairingSortValue(p.dbPlayers_FlightID) || "—") : "";
      const flightPos = pairPair ? (pairingSortValue(p.dbPlayers_FlightPos) || "—") : "";
      const pairingId = pairingSortValue(p.dbPlayers_PairingID) || "—";

      if (!groupMap.has(playerKey)) {
        groupMap.set(playerKey, { playerKey, flightId, flightPos, pairingId, players: [] });
      }

      groupMap.get(playerKey).players.push(p);
    });

    return Array.from(groupMap.values());
  }

  function buildPairingHeader(group) {
    const players = group.players || [];
    let sHI = 0, sCH = 0, sPH = 0, cHI = 0, cCH = 0, cPH = 0;
    players.forEach(p => {
      const hi = parseFloat(p.dbPlayers_HI); if (!isNaN(hi)) { sHI += hi; cHI++; }
      const ch = parseFloat(p.dbPlayers_CH); if (!isNaN(ch)) { sCH += ch; cCH++; }
      const ph = parseFloat(p.dbPlayers_PH); if (!isNaN(ph)) { sPH += ph; cPH++; }
    });
    const avgHI = cHI ? (sHI / cHI).toFixed(1) : "0.0";
    const avgCH = cCH ? (sCH / cCH).toFixed(1) : "0.0";
    const avgPH = cPH ? (sPH / cPH).toFixed(1) : "0.0";
    const stats = `Avg HI: ${avgHI} · CH: ${avgCH} · PH: ${avgPH}`;

    if (isPairPairCompetition()) {
      return `<strong>Match ${esc(group.flightId)} · Side ${esc(group.flightPos)} · Pair ${esc(group.pairingId)}</strong> <span class="gsHdrMeta">· ${stats}</span>`;
    }
    return `<strong>Pairing ${esc(group.pairingId)}</strong> <span class="gsHdrMeta">· ${stats}</span>`;
  }

  function buildPlayingGroupHeader(group) {
    return `<strong>Playing Group ${esc(group.playerKey)}</strong>`;
  }

  // ---- mobile card builder (shared across all three scope views) ----
  function buildMobilePlayerCard(p) {
    const name    = valueOrDash(p.dbPlayers_Name);
    const scoreId = valueOrDash(p.dbPlayers_PlayerKey);
    const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
    const start   = valueOrDash(getFormattedStartHole(p));
    const tee     = valueOrDash(p.dbPlayers_TeeSetName);
    const hi      = numberOrDash(p.dbPlayers_HI);
    const ch      = numberOrDash(p.dbPlayers_CH);
    const ph      = numberOrDash(p.dbPlayers_PH);
    const so      = numberOrDash(p.dbPlayers_SO);
    const pair    = valueOrDash(p.dbPlayers_PairingID);
    const pos     = valueOrDash(p.dbPlayers_PairingPos);

    return (
      '<div class="gsPlayerCard">' +
        '<div class="gsLine1">' +
          '<div class="gsName">' + esc(name) + '</div>' +
          '<a class="gsScoreLink gsMono" href="#" data-scoreid="' + esc(scoreId) + '">' + esc(scoreId) + '</a>' +
        '</div>' +
        '<div class="gsLine2">' +
          esc(time) + ' &nbsp;·&nbsp; Hole ' + esc(start) + ' &nbsp;·&nbsp; Tee ' + esc(tee) +
        '</div>' +
        '<div class="gsLine3">' +
          '<span class="gsLine3__hc">HI ' + esc(hi) + ' &nbsp;·&nbsp; CH ' + esc(ch) + ' &nbsp;·&nbsp; PH ' + esc(ph) + ' &nbsp;·&nbsp; SO ' + esc(so) + '</span>' +
          '<span class="gsLine3__pair">Pair ' + esc(pair) + ' · Pos ' + esc(pos) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function renderScopeButtons() {
    const byPlayer = state.scope === "byPlayer";
    const byPairing = state.scope === "byPairing";
    const byPlayingGroup = state.scope === "byPlayingGroup";

    if (el.scopeByPlayer) {
      el.scopeByPlayer.classList.toggle("is-active", byPlayer);
      el.scopeByPlayer.setAttribute("aria-selected", byPlayer ? "true" : "false");
    }

    if (el.scopeByPairing) {
      el.scopeByPairing.classList.toggle("is-active", byPairing);
      el.scopeByPairing.setAttribute("aria-selected", byPairing ? "true" : "false");
    }

    if (el.scopeByPlayingGroup) {
      el.scopeByPlayingGroup.classList.toggle("is-active", byPlayingGroup);
      el.scopeByPlayingGroup.setAttribute("aria-selected", byPlayingGroup ? "true" : "false");
    }
  }

  function renderRoster() {
    let sorted = [];

    if (state.scope === "byPlayer") {
      sorted = normalizeRosterForPlayerDisplay(state.roster || []);
    } else if (state.scope === "byPairing") {
      sorted = normalizeRosterForPairingDisplay(state.roster || []);
    } else {
      sorted = normalizeRosterForPlayingGroupDisplay(state.roster || []);
    }

    if (el.emptyHint) el.emptyHint.style.display = sorted.length ? "none" : "block";

    if (el.scoreIdHeader) el.scoreIdHeader.textContent = "GroupID";

    const isPairPair = isPairPairCompetition();
    const hasTeams = hasTeamConfig();
    if (el.rosterTbody) {
      const table = el.rosterTbody.closest("table");
      if (table) {
        table.classList.toggle("is-match-play", isPairPair);
        table.classList.toggle("is-has-teams", hasTeams);
      }
    }
    if (el.mobileList) {
      el.mobileList.classList.toggle("is-match-play", isPairPair);
      el.mobileList.classList.toggle("is-has-teams", hasTeams);
    }

    const playerCount = sorted.length ? ' (' + sorted.length + ')' : '';

    if (state.scope === "byPlayer") {
      if (el.cardTitle) el.cardTitle.textContent = "Players by Name" + playerCount;
      renderRosterByPlayer(sorted);
    } else if (state.scope === "byPairing") {
      if (el.cardTitle) el.cardTitle.textContent = "Players organized Competitively" + playerCount;
      renderRosterByPairing(sorted);
    } else {
      if (el.cardTitle) el.cardTitle.textContent = "Players organized by Tee Assignments" + playerCount;
      renderRosterByPlayingGroup(sorted);
    }
  }

  function renderRosterByPlayer(sorted) {
    if (el.rosterTbody) {
      el.rosterTbody.innerHTML = sorted.map(p => {
        const name    = valueOrDash(p.dbPlayers_Name);
        const tee     = valueOrDash(p.dbPlayers_TeeSetName);
        const hi      = numberOrDash(p.dbPlayers_HI);
        const ch      = numberOrDash(p.dbPlayers_CH);
        const ph      = numberOrDash(p.dbPlayers_PH);
        const so      = numberOrDash(p.dbPlayers_SO);
        const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
        const start   = valueOrDash(getFormattedStartHole(p));
        const flight  = valueOrDash(p.dbPlayers_FlightID);
        const fPos    = valueOrDash(p.dbPlayers_FlightPos);
        const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
        const pair    = valueOrDash(p.dbPlayers_PairingID);
        const pos     = valueOrDash(p.dbPlayers_PairingPos);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        return (
          "<tr>" +
            "<td title=\"" + esc(name) + "\">" + esc(name) + "</td>" +
            "<td title=\"" + esc(tee) + "\">" + esc(tee) + "</td>" +
            "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
            "<td class=\"gsCenter gsMono col-match\">" + esc(flight) + "</td>" +
            "<td class=\"gsCenter gsMono col-flightpos\">" + esc(fPos) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pair) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pos) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(hi) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ch) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ph) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(so) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(time) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(start) + "</td>" +
            "<td class=\"gsCenter gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
          "</tr>"
        );
      }).join("");
    }

    if (el.mobileList) {
      el.mobileList.innerHTML = sorted.map(p => buildMobilePlayerCard(p)).join("");
    }

    wireScoreLinks();
  }

  function renderRosterByPairing(sorted) {
    const groups = groupRosterForPairing(sorted);
    const isPairPair = isPairPairCompetition();
    const desktopParts = [];

    groups.forEach((group) => {
      const colspan = isPairPair ? 14 : 12;
      desktopParts.push(
        '<tr class="gsGroupHdr"><td colspan="' + colspan + '">' + buildPairingHeader(group) + '</td></tr>'
      );

      group.players.forEach((p) => {
        const name    = valueOrDash(p.dbPlayers_Name);
        const tee     = valueOrDash(p.dbPlayers_TeeSetName);
        const hi      = numberOrDash(p.dbPlayers_HI);
        const ch      = numberOrDash(p.dbPlayers_CH);
        const ph      = numberOrDash(p.dbPlayers_PH);
        const so      = numberOrDash(p.dbPlayers_SO);
        const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
        const start   = valueOrDash(getFormattedStartHole(p));
        const match   = valueOrDash(p.dbPlayers_FlightID);
        const team    = valueOrDash(p.dbPlayers_FlightPos);
        const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
        const pair    = valueOrDash(p.dbPlayers_PairingID);
        const pos     = valueOrDash(p.dbPlayers_PairingPos);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        desktopParts.push(
          "<tr>" +
            "<td>" + esc(name) + "</td>" +
            "<td>" + esc(tee) + "</td>" +
            "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
            "<td class=\"gsCenter gsMono col-match\">" + esc(match) + "</td>" +
            "<td class=\"gsCenter gsMono col-flightpos\">" + esc(team) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pair) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pos) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(hi) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ch) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ph) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(so) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(time) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(start) + "</td>" +
            "<td class=\"gsCenter gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
          "</tr>"
        );
      });
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");

    if (el.mobileList) {
      const mob = [];
      groups.forEach((group) => {
        mob.push('<div class="maListRow__group">' + buildPairingHeader(group) + '</div>');
        group.players.forEach((p) => { mob.push(buildMobilePlayerCard(p)); });
      });
      el.mobileList.innerHTML = mob.join("");
    }

    wireScoreLinks();
  }

  function renderRosterByPlayingGroup(sorted) {
    const groups = groupRosterForPlayingGroup(sorted);
    const isPairPair = isPairPairCompetition();
    const desktopParts = [];

    groups.forEach((group) => {
      const colspan = isPairPair ? 14 : 12;
      desktopParts.push(
        '<tr class="gsGroupHdr"><td colspan="' + colspan + '">' + buildPlayingGroupHeader(group) + '</td></tr>'
      );

      group.players.forEach((p) => {
        const name    = valueOrDash(p.dbPlayers_Name);
        const tee     = valueOrDash(p.dbPlayers_TeeSetName);
        const hi      = numberOrDash(p.dbPlayers_HI);
        const ch      = numberOrDash(p.dbPlayers_CH);
        const ph      = numberOrDash(p.dbPlayers_PH);
        const so      = numberOrDash(p.dbPlayers_SO);
        const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
        const start   = valueOrDash(getFormattedStartHole(p));
        const match   = valueOrDash(p.dbPlayers_FlightID);
        const team    = valueOrDash(p.dbPlayers_FlightPos);
        const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
        const pair    = valueOrDash(p.dbPlayers_PairingID);
        const pos     = valueOrDash(p.dbPlayers_PairingPos);
        const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

        desktopParts.push(
          "<tr>" +
            "<td>" + esc(name) + "</td>" +
            "<td>" + esc(tee) + "</td>" +
            "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
            "<td class=\"gsCenter gsMono col-match\">" + esc(match) + "</td>" +
            "<td class=\"gsCenter gsMono col-flightpos\">" + esc(team) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pair) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(pos) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(hi) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ch) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(ph) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(so) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(time) + "</td>" +
            "<td class=\"gsCenter gsMono\">" + esc(start) + "</td>" +
            "<td class=\"gsCenter gsMono\"><a class=\"gsScoreLink\" href=\"#\" data-scoreid=\"" + esc(scoreId) + "\">" + esc(scoreId) + "</a></td>" +
          "</tr>"
        );
      });
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");

    if (el.mobileList) {
      const mob = [];
      groups.forEach((group) => {
        mob.push('<div class="maListRow__group">' + buildPlayingGroupHeader(group) + '</div>');
        group.players.forEach((p) => { mob.push(buildMobilePlayerCard(p)); });
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
            MA.routerGo("scorehome", { scoreId: scoreId });
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
    const rows = (state.scope === "byPlayer")
      ? normalizeRosterForPlayerDisplay(state.roster || [])
      : (state.scope === "byPairing")
        ? normalizeRosterForPairingDisplay(state.roster || [])
        : normalizeRosterForPlayingGroupDisplay(state.roster || []);

    const header = ["Name","Tee","Team","Match","Side","Pair","Pos","HI","CH","PH","SO","Time","Start","GroupID"];
    const lines = [header.join(",")];

    rows.forEach(p => {
      const teeName = safeString(p.dbPlayers_TeeSetName);
      const vals = [
        `"` + safeString(p.dbPlayers_Name).replace(/"/g, '""') + `"`,
        teeName.includes('/') ? `="` + teeName.replace(/"/g, '""') + `"` : `"` + teeName.replace(/"/g, '""') + `"`,
        `"` + safeString(resolveTeamName(p.dbPlayers_TeamKey)).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_FlightID).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_FlightPos).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PairingID).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PairingPos).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_HI).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_CH).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PH).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_SO).replace(/"/g, '""') + `"`,
        `"` + formatTimeAmPm(safeString(p.dbPlayers_TeeTime)).replace(/"/g, '""') + `"`,
        `"` + safeString(getFormattedStartHole(p)).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_PlayerKey).replace(/"/g, '""') + `"`,
      ];

      lines.push(vals.join(","));
    });

    const g = state.game || {};
    lines.push("");
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
      ["Scoring System", g.dbGames_ScoringSystem],
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
    const rows = (state.scope === "byPlayer")
      ? normalizeRosterForPlayerDisplay(state.roster || [])
      : (state.scope === "byPairing")
        ? normalizeRosterForPairingDisplay(state.roster || [])
        : normalizeRosterForPlayingGroupDisplay(state.roster || []);

    const g = state.game || {};
    const isPairPair = g.dbGames_Competition === 'PairPair';

    let html = `
      <h2 style="font-family: sans-serif;">${esc(g.dbGames_Title || "Game Summary")}</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 10pt; width: 100%;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th>Name</th><th>Tee</th><th>Team</th><th>Match</th><th>Side</th>
            <th>Pair</th><th>Pos</th><th>HI</th><th>CH</th><th>PH</th><th>SO</th>
            <th>Time</th><th>Start</th><th>GroupID</th>
          </tr>
        </thead>
        <tbody>`;

    const buildRow = (p) => {
      const startHole = getFormattedStartHole(p);
      return `<tr>
        <td>${esc(p.dbPlayers_Name)}</td>
        <td>${esc(p.dbPlayers_TeeSetName)}</td>
        <td align="center">${esc(resolveTeamName(p.dbPlayers_TeamKey))}</td>
        <td align="center">${esc(p.dbPlayers_FlightID)}</td>
        <td align="center">${esc(p.dbPlayers_FlightPos)}</td>
        <td align="center">${esc(p.dbPlayers_PairingID)}</td>
        <td align="center">${esc(p.dbPlayers_PairingPos)}</td>
        <td align="center">${esc(p.dbPlayers_HI)}</td>
        <td align="center">${esc(p.dbPlayers_CH)}</td>
        <td align="center">${esc(p.dbPlayers_PH)}</td>
        <td align="center">${esc(p.dbPlayers_SO)}</td>
        <td align="center">${esc(formatTimeAmPm(p.dbPlayers_TeeTime))}</td>
        <td align="center">${esc(startHole)}</td>
        <td align="center">${esc(p.dbPlayers_PlayerKey)}</td>
      </tr>`;
    };

    if (state.scope === "byPairing") {
      const groups = groupRosterForPairing(rows);
      groups.forEach((group) => {
        html += `<tr style="background-color:#f9f9f9;"><td colspan="14">${buildPairingHeader(group)}</td></tr>`;
        group.players.forEach((p) => { html += buildRow(p); });
      });
    } else if (state.scope === "byPlayingGroup") {
      const groups = groupRosterForPlayingGroup(rows);
      groups.forEach((group) => {
        html += `<tr style="background-color:#f9f9f9;"><td colspan="14">${buildPlayingGroupHeader(group)}</td></tr>`;
        group.players.forEach((p) => { html += buildRow(p); });
      });
    } else {
      rows.forEach((p) => { html += buildRow(p); });
    }

    html += `</tbody></table><br/>
    <h3 style="font-family: sans-serif;">Game Configuration</h3>
    <table border="0" cellpadding="3" cellspacing="0" style="font-family: sans-serif; font-size: 10pt;">`;

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
      const text = buildCsvText();

      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([text], { type: "text/plain" });
      const data = [new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })];
      await navigator.clipboard.write(data);
      setStatus("Game summary copied. Ready to paste...", "success");
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

  async function copyThenNotify() {
      openNotifyModal();
      try {
          await copyRichTextToClipboard();
      } catch (e) {
          console.warn("[MA] Clipboard copy failed:", e);
          // modal still opens regardless
      }
  }

  function openNotifyModal() {
    if (!MA.notify || typeof MA.notify.open !== "function") {
      setStatus("Messaging module not loaded.", "error");
      return;
    }
    const g = state.game || {};
    const ggid = String(g.dbGames_GGID || g.dbGames_GGIDnum || "").trim();
    MA.notify.open({
      ggid:    ggid,
      apiPath: MA.paths?.apiNotify,
    });
  }

  async function emailSummary() {
    await copyRichTextToClipboard();

    const g = state.game || {};
    const subject = "MatchAid Game Summary - " + (g.dbGames_Title || "Game");

    const body =
      "(Note: use ctrl+v / cmd+v to paste the game summary here)\n\n" +
      "Game: " + (g.dbGames_Title || "") + "\n" +
      "Facility: " + (g.dbGames_FacilityName || "") + "\n" +
      "Course: " + (g.dbGames_CourseName || "") + "\n" +
      "Date: " + (g.dbGames_PlayDate || "") + "\n";

    const recipients = (state.roster || [])
      .filter(p => p.contactEmail)
      .map(p => ({ name: p.dbPlayers_Name, email: p.contactEmail }));

    if (MA.email && MA.email.compose) {
      MA.email.compose({
        bcc: recipients,
        subject: subject,
        body: body,
        bodyIsHtml: false
      });
    } else {
      setStatus("Email module not loaded.", "error");
    }
  }

  function shortDow(dateStr) {
    const s = String(dateStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";

    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return "";

    return dt.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
  }

  function buildShortMessageBody() {
    const g = state.game || {};
    const title = safeString(g.dbGames_Title || "Game").trim();
    const date = safeString(g.dbGames_PlayDate || "").trim();
    const time = formatTimeAmPm(safeString(g.dbGames_PlayTime || "").trim());
    const ggid = safeString(g.dbGames_GGID || g.dbGames_GGIDnum || "").trim();

    let mmdd = date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split("-");
      mmdd = `${parts[1]}/${parts[2]}`;
    }

    const dow = shortDow(date);
    const dateText = [dow, mmdd].filter(Boolean).join(" ");

    return `${title} on ${dateText} at ${time}. View or Register at www.matchaid.org/game/${ggid}`;
  }

  function emailShortMessage() {
    const recipients = (state.roster || []).reduce((out, p) => {
      const method   = safeString(p.contactMethod).trim();
      const smsEmail = safeString(p.contactSmsEmail).trim();
      const email    = safeString(p.contactEmail).trim();
      const name     = safeString(p.dbPlayers_Name).trim();

      if (method === "SMS" && smsEmail) {
        out.push({ name, email: smsEmail });
      } else if (method === "Email" && email) {
        out.push({ name, email: email });
      }

      return out;
    }, []);

    if (!recipients.length) {
      setStatus("No players have a valid preferred contact destination.", "warn");
      return;
    }

    const body = buildShortMessageBody();
    if (body.length > 160) {
      setStatus("Short message exceeds 160 characters.", "error");
      return;
    }

    if (MA.email && MA.email.compose) {
      MA.email.compose({
        bcc: recipients,
        subject: "Game Notice",
        body: body,
        bodyIsHtml: false
      });
      setStatus("Short message ready.", "success");
    } else {
      setStatus("Email module not loaded.", "error");
    }
  }

  function downloadIcsForGame() {
    const g = state.game || {};
    if (MA.calendar && MA.calendar.addCalendarEventFromGame) {
      MA.calendar.addCalendarEventFromGame(g);
    } else {
      setStatus("Calendar module not loaded.", "error");
    }
  }

  async function recalculateHandicaps() {
    if (!MA.recalculateHandicaps) {
      setStatus("Recalculate module not loaded.", "error");
      return;
    }
    const ok = await MA.recalculateHandicaps(MA.paths?.apiGHIN);
    if (ok) setStatus("Handicaps recalculated.", "success");
  }

  function printScorecards() {
    if (typeof MA.routerGo === "function") {
      try { MA.routerGo("scorecard"); return; } catch (e) {}
    }
    setStatus("Print Scorecards: wire router action for this button.", "warn");
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
    state.game   = init.game   || init.payload?.game   || null;
    state.roster = init.roster || init.payload?.roster || [];
    state.portal = init.portal || init.payload?.portal || "";
  }

  function wireEvents() {
    if (el.cfgToggle) {
      el.cfgToggle.addEventListener("click", () => {
        MA.gameDetails.open(state.game);
      });
    }

    if (el.scopeByPlayer) el.scopeByPlayer.addEventListener("click", () => {
      state.scope = "byPlayer";
      renderScopeButtons();
      renderRoster();
    });

    if (el.scopeByPairing) el.scopeByPairing.addEventListener("click", () => {
      state.scope = "byPairing";
      renderScopeButtons();
      renderRoster();
    });

    if (el.scopeByPlayingGroup) el.scopeByPlayingGroup.addEventListener("click", () => {
      state.scope = "byPlayingGroup";
      renderScopeButtons();
      renderRoster();
    });
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [
      { label: "Add Game to Calendar",          action: downloadIcsForGame },
      { label: "Send Message to Players", action: openNotifyModal },
      //{ label: "Send Message to Players",        action: copyThenNotify },
      { separator: true },
      { separator: true },
      { label: "Copy View to clipboard",         action: copyRichTextToClipboard },
      { label: "Copy View to clipboard (csv)",   action: copySummaryToClipboard },
      { label: "Export View to .csv file",       action: downloadCsv },
      { separator: true },
      { separator: true },
      { label: "Recalculate Handicaps",          action: recalculateHandicaps },
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  function applyChrome() {
    const g = state.game || {};
    const title    = String(g.dbGames_Title || "");
    const course   = String(g.dbGames_CourseName || "");
    const date     = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Game Summary", title, subTitle]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        right: { show: true, label: "Actions", onClick: openActionsMenu },
        left:  { show: false }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      const isPlayerPortal = (state.portal === "PLAYER PORTAL");
      const homeRoute = isPlayerPortal ? "player" : "admin";

      const visible = isPlayerPortal
        ? [homeRoute, "scoreentry", "scorecardPlayer", "scorecardGame", "scoreskins"]
        : [homeRoute, "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"];

      chrome.setBottomNav({
        visible: visible,
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