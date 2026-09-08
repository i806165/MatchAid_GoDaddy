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
  function setStatus(m, lvl) {
    if (MA.ui && typeof MA.ui.notify === "function") MA.ui.notify(m, lvl);
    else if (typeof MA.setStatus === "function") MA.setStatus(m, lvl);
    else if (m) console.log("[STATUS]", lvl || "info", m);
  }

  const state = {
    scope: "byPairing", // byPlayer | byPairing | byPlayingGroup
    game: null,
    roster: [],
    portal: "",
    // Which flight groups are collapsed. A single Set at this level (not
    // per-scope-tab) is deliberate — Flight is now the outermost grouping
    // shared by all three scope views, so a collapsed flight stays
    // collapsed when switching between By Player / By Pairing / By
    // Playing Group, rather than resetting per tab.
    collapsedFlights: new Set()
  };

  // ---- DOM ----
  const el = {
    // Controls band

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
    const isShotgun = state.game?.dbGames_TOMethod === 'ShotGun';
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

  // normalizeRosterForPlayerDisplay() retired — its sort logic now lives
  // server-side as ServiceGameRosterViews::buildByPlayerView(), consumed
  // via state.views.byPlayer.players. Verified byte-identical render
  // output against this function before removal (Node/jsdom diff test).

  function isPairPairCompetition() {
    return String(state.game?.dbGames_Competition || "").trim() === "PairPair";
  }

  /**
   * Whether Team is active for this round, per the shared Round-Level
   * Dimension Activation hierarchy (MA.isDimensionActive(), from
   * ma_SharedBusLogic.js). Mirrors game_pairings.js's teamsActive()
   * exactly — replaces this file's previous local presence-check
   * (merely "is a dbGames_TeamConfig present"), which had the same bug
   * class game_pairings.js already fixed elsewhere: a deactivated Team
   * with old config data still sitting on the row would have kept
   * reading as active here.
   */
  function teamsActive() {
    return !!(window.MA && typeof MA.isDimensionActive === "function")
      && MA.isDimensionActive("team", state.game, state.game);
  }

  /**
   * Whether Flight is active for this round. Mirrors teamsActive() and
   * game_pairings.js's own flightsActive() exactly.
   */
  function flightsActive() {
    return !!(window.MA && typeof MA.isDimensionActive === "function")
      && MA.isDimensionActive("flight", state.game, state.game);
  }

  /**
   * Parses dbGames_FlightConfig (Men's/Women's-style dbPlayers_FlightKey
   * grouping) the same way resolveTeamName() below already parses
   * dbGames_TeamConfig. NOT to be confused with dbPlayers_MatchID /
   * dbPlayers_MatchPos (the Match Pairings tab's Side A/B container) —
   * those are unrelated fields historically mislabeled "flight" in this
   * file's own variable names; see the renamed matchId/matchPos usages
   * below.
   */
  function getFlightConfig() {
    try {
      const raw = state.game?.dbGames_FlightConfig;
      if (!raw) return null;
      const config = typeof raw === "string" ? JSON.parse(raw) : raw;
      return (config && Array.isArray(config.flights)) ? config : null;
    } catch (e) {
      return null;
    }
  }

  function resolveFlightName(flightKey) {
    if (!flightKey || flightKey === "—") return flightKey;
    const config = getFlightConfig();
    if (!config) return flightKey;
    const match = config.flights.find(f => f.id === flightKey);
    return match?.name || flightKey;
  }

  function flightSortValue(p) {
    return pairingSortValue(p.dbPlayers_FlightKey) || "—";
  }

  function teamSortValue(p) {
    return pairingSortValue(p.dbPlayers_TeamKey) || "—";
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

  // normalizeRosterForPairingDisplay() retired — logic now lives in services/roster/service_GameRosterViews.php, consumed via state.views. Verified byte-identical render output before removal (Node/jsdom diff test).

  // normalizeRosterForPlayingGroupDisplay() retired — logic now lives in services/roster/service_GameRosterViews.php, consumed via state.views. Verified byte-identical render output before removal (Node/jsdom diff test).

  // groupRosterForPlayingGroup() retired — logic now lives in services/roster/service_GameRosterViews.php, consumed via state.views. Verified byte-identical render output before removal (Node/jsdom diff test).

  function buildPlayingGroupHeader(group) {
    return `<strong>Playing Group ${esc(group.playerKey)}</strong>`;
  }

  // ── By Pairing structure: Match → Pairing(s) ─────────────────────────────
  // Shared by desktop rendering, mobile cards, and the HTML clipboard
  // export — all three build on this same nested shape rather than each
  // having their own grouping logic.
  //
  // PairPair: two nested levels. Match is the real outer grouping — head
  // to head — with exactly two Pairing sub-groups inside it (pairings are
  // clamped to one team/side each). PairField: one level — Pairing only,
  // no Match concept applies.
  //
  // Built as a single shape either way (an array of "match-like" groups,
  // each holding one or more nested pairings) so the renderer doesn't
  // need two divergent code paths — a PairField group simply has
  // matchId === null and exactly one nested pairing, so no Match band
  // and no inter-pairing divider ever render for it (both are gated on
  // there being a matchId / more than one pairing, which naturally never
  // happens in PairField either way).
  // buildPairingDesktopGroups() retired — logic now lives in services/roster/service_GameRosterViews.php, consumed via state.views. Verified byte-identical render output before removal (Node/jsdom diff test).

  // Bare Match band — deliberately no metadata beyond the label itself;
  // all substantive content (Team/Side, Pair ID, averages) lives one
  // level down on each Pairing's own summary row.
  function buildMatchBandRow(matchId, colspan) {
    return `<tr class="gsGroupHdr gsMatchHdr"><td colspan="${colspan}">Match ${esc(matchId)}</td></tr>`;
  }

  // Resolves the Team-or-Side prefix used in both the PairField group
  // band and every Pairing summary row — Team when active, else Side
  // (PairPair only; PairField without Teams has neither, just the bare
  // Pair ID). Team name is shown as-is (no literal "Team" word prefix),
  // matching how the Team column itself displays; Side has no configured
  // name to fall back on, so it gets a literal "Side" label.
  function pairingLabelPrefix(pairing) {
    const first = (pairing.players && pairing.players[0]) || {};
    if (teamsActive()) {
      return resolveTeamName(safeString(first.dbPlayers_TeamKey));
    }
    if (isPairPairCompetition()) {
      const side = pairingSortValue(first.dbPlayers_MatchPos);
      return side ? ("Side " + side) : "";
    }
    return "";
  }

  // PairField's own group band — same tinted treatment as the Match band,
  // just labeled with Team/Pairing instead of Match, since PairField has
  // no Match tier to nest under.
  function buildPairingFieldBandRow(pairing, colspan) {
    const prefix = pairingLabelPrefix(pairing);
    const label = prefix ? (prefix + ", Pairing " + pairing.pairingId) : ("Pairing " + pairing.pairingId);
    return `<tr class="gsGroupHdr gsMatchHdr"><td colspan="${colspan}">${esc(label)}</td></tr>`;
  }

  // Pairing summary — the subtotal row at the bottom of each pairing's
  // player rows, same indentation as those rows (see .gsPairIndent),
  // distinguished only by bold weight + a top rule, no background tint.
  function computePairingAverages(pairing) {
    const players = pairing.players || [];
    let sHI = 0, sCH = 0, sPH = 0, cHI = 0, cCH = 0, cPH = 0;
    players.forEach(p => {
      const hi = parseFloat(p.dbPlayers_HI); if (!isNaN(hi)) { sHI += hi; cHI++; }
      const ch = parseFloat(p.dbPlayers_CH); if (!isNaN(ch)) { sCH += ch; cCH++; }
      const ph = parseFloat(p.dbPlayers_PH); if (!isNaN(ph)) { sPH += ph; cPH++; }
    });
    return {
      avgHI: cHI ? (sHI / cHI).toFixed(1) : "0.0",
      avgCH: cCH ? (sCH / cCH).toFixed(1) : "0.0",
      avgPH: cPH ? (sPH / cPH).toFixed(1) : "0.0"
    };
  }

  function buildPairingSummaryRow(pairing) {
    const avgHI = pairing.averages?.avgHI ?? "0.0";
    const avgCH = pairing.averages?.avgCH ?? "0.0";
    const avgPH = pairing.averages?.avgPH ?? "0.0";

    const prefix = pairing.labelPrefix || "";
    const label = prefix ? (prefix + ", Pair " + pairing.pairingId) : ("Pair " + pairing.pairingId);

    // One real <td> per column, in the exact same order and with the
    // exact same col-flight/col-team/col-match/col-flightpos hide/show
    // classes player rows use — NOT colspan math against a fixed total.
    // Flight/Team/Match/Side are display:none'd out of the table
    // entirely when inactive (not just visually hidden), which shrinks
    // the table's real column count; a hardcoded colspan sized against
    // the full 15/13 total then no longer matches, and this row's
    // second cell drifts off to the right of the actual visible columns.
    // Giving every column its own cell — same as a player row — means
    // this row hides/shows in perfect sync automatically, same
    // mechanism as everything else in the table.
    return (
      "<tr class=\"gsPairSummary\">" +
        "<td class=\"gsPairIndent\">" + esc(label) + "</td>" +
        "<td></td>" +
        "<td class=\"col-flight\"></td>" +
        "<td class=\"col-team\"></td>" +
        "<td class=\"col-match\"></td>" +
        "<td class=\"col-flightpos\"></td>" +
        "<td></td>" +
        "<td></td>" +
        "<td class=\"gsCenter gsMono\">" + esc(avgHI) + "</td>" +
        "<td class=\"gsCenter gsMono\">" + esc(avgCH) + "</td>" +
        "<td class=\"gsCenter gsMono\">" + esc(avgPH) + "</td>" +
        "<td></td>" +
        "<td></td>" +
        "<td></td>" +
        "<td></td>" +
      "</tr>"
    );
  }

  // Divider between the two sibling pairings within one Match. Never
  // rendered after the last pairing in a group (including PairField's
  // single-pairing groups, which never have a "next" pairing at all).
  function buildPairingDividerRow(colspan) {
    return `<tr class="gsPairDivider"><td colspan="${colspan}"></td></tr>`;
  }

  // ── By Pairing mobile cards ─────────────────────────────────────────────
  // One .maCard per Match (PairPair, holding both its pairings) or per
  // Pairing (PairField, no Match tier). Reuses buildPairingDesktopGroups'
  // output directly — same Match/Pairing shape either way, just a
  // different renderer.

  function buildPlayerLineMobile(p) {
    const name  = valueOrDash(p.dbPlayers_Name);
    const tee   = valueOrDash(p.dbPlayers_TeeSetName);
    const hi    = numberOrDash(p.dbPlayers_HI);
    const ch    = numberOrDash(p.dbPlayers_CH);
    const ph    = numberOrDash(p.dbPlayers_PH);
    const so    = numberOrDash(p.dbPlayers_SO);
    const team  = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));

    const metaParts = ["HI " + hi, "CH " + ch, "PH " + ph, "SO " + so];
    if (teamsActive()) metaParts.push(team);

    return (
      '<div class="gsPairPlayerLine">' +
        '<div class="gsPairPlayerLine__name">' + esc(name) + (tee !== "—" ? " · Tee " + esc(tee) : "") + '</div>' +
        '<div class="gsPairPlayerLine__meta">' + esc(metaParts.join(" · ")) + '</div>' +
      '</div>'
    );
  }

  function buildPairSummaryLineMobile(pairing) {
    const { avgHI, avgCH, avgPH } = computePairingAverages(pairing);
    return (
      '<div class="gsPairSummaryMobile">Pair Summary — Avg HI ' + esc(avgHI) +
      ' · CH ' + esc(avgCH) + ' · PH ' + esc(avgPH) + '</div>'
    );
  }

  // PairPair — one card per Match, both pairings inside, divider between
  // them. No Team in the card header (the card holds both teams) — Team
  // only ever appears per-player, via buildPlayerLineMobile.
  function buildMatchCardMobile(group) {
    const allPlayers = group.pairings.reduce((acc, pr) => acc.concat(pr.players), []);
    const first = allPlayers[0] || {};
    const time  = formatTimeAmPm(valueOrDash(first.dbPlayers_TeeTime));
    const start = valueOrDash(getFormattedStartHole(first));

    const body = group.pairings.map((pairing, idx) => {
      const lines = pairing.players.map(buildPlayerLineMobile).join("");
      const summary = buildPairSummaryLineMobile(pairing);
      const divider = idx < group.pairings.length - 1 ? '<div class="gsPairDividerMobile"></div>' : "";
      return lines + summary + divider;
    }).join("");

    return (
      '<section class="maCard gsMatchCard">' +
        '<header class="maCard__hdr">' +
          '<div class="maCard__title">Match ' + esc(group.matchId) + '</div>' +
          '<div class="maCard__actions">' + esc(time) + ' · Hole ' + esc(start) + '</div>' +
        '</header>' +
        '<div class="maCard__body">' + body + '</div>' +
      '</section>'
    );
  }

  // PairField — one card per Pairing, no Match tier. Card header carries
  // Team/Pairing identity (same pairingLabelPrefix as desktop); Team
  // still repeats per-player line too, matching the confirmed mockup.
  function buildPairingFieldCardMobile(pairing) {
    const first = pairing.players[0] || {};
    const time  = formatTimeAmPm(valueOrDash(first.dbPlayers_TeeTime));
    const start = valueOrDash(getFormattedStartHole(first));
    const prefix = pairingLabelPrefix(pairing);
    const title = prefix ? (prefix + ", Pairing " + pairing.pairingId) : ("Pairing " + pairing.pairingId);

    const lines = pairing.players.map(buildPlayerLineMobile).join("");
    const summary = buildPairSummaryLineMobile(pairing);

    return (
      '<section class="maCard gsMatchCard">' +
        '<header class="maCard__hdr">' +
          '<div class="maCard__title">' + esc(title) + '</div>' +
          '<div class="maCard__actions">' + esc(time) + ' · Hole ' + esc(start) + '</div>' +
        '</header>' +
        '<div class="maCard__body">' + lines + summary + '</div>' +
      '</section>'
    );
  }

  // ---- Flight partitioning (outermost grouping, all three scope views) ----
  // The roster passed in is already sorted with Flight as the leading
  // sort key (when active) — see the normalize* functions above — so a
  // single linear pass is enough to partition it into flight-ordered
  // runs. When Flight isn't active, this returns one pass-through group
  // so callers don't need a separate unflighted code path.
  // partitionByFlight() retired — logic now lives in services/roster/service_GameRosterViews.php, consumed via state.views. Verified byte-identical render output before removal (Node/jsdom diff test).

  // Collapse-toggle icons — reused verbatim from game_pairings.js's tray
  // group headers, per the request to match that interaction exactly.
  const flightIconMinus = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const flightIconPlus = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  // Desktop flight header row — colored/sized like this page's own
  // .gsGroupHdr band (not the tray's muted small text), but the
  // collapse affordance itself (icon + button) matches game_pairings.js.
  function buildFlightHeaderRow(fg, colspan) {
    const collapsed = state.collapsedFlights.has(fg.flightKey);
    const count = fg.players.length;
    return `<tr class="gsGroupHdr gsFlightHdr" data-action="toggle-flight-group" data-flight-key="${esc(fg.flightKey)}" style="cursor:pointer;">
      <td colspan="${colspan}">
        <button class="iconBtn btnSecondary" type="button" data-action="toggle-flight-group" data-flight-key="${esc(fg.flightKey)}"
          title="${collapsed ? "Expand" : "Collapse"}" aria-label="${collapsed ? "Expand" : "Collapse"} Flight ${esc(fg.flightLabel)}"
          style="width:20px; height:20px; padding:0; margin-right:6px; vertical-align:middle;">${collapsed ? flightIconPlus : flightIconMinus}</button>
        <strong>Flight ${esc(fg.flightLabel)}</strong> <span class="gsHdrMeta">· ${count} player${count !== 1 ? "s" : ""}</span>
      </td>
    </tr>`;
  }

  // Mobile flight header — same collapse affordance, styled to match the
  // existing .maListRow__group treatment already used for Pairing/
  // Playing Group headers in the mobile list.
  function buildFlightHeaderMobile(fg) {
    const collapsed = state.collapsedFlights.has(fg.flightKey);
    const count = fg.players.length;
    return `<div class="maListRow__group gsFlightHdr" data-action="toggle-flight-group" data-flight-key="${esc(fg.flightKey)}"
      style="display:flex; align-items:center; gap:6px; cursor:pointer;">
      <button class="iconBtn btnSecondary" type="button" data-action="toggle-flight-group" data-flight-key="${esc(fg.flightKey)}"
        title="${collapsed ? "Expand" : "Collapse"}" aria-label="${collapsed ? "Expand" : "Collapse"} Flight ${esc(fg.flightLabel)}"
        style="width:20px; height:20px; padding:0; flex:0 0 auto;">${collapsed ? flightIconPlus : flightIconMinus}</button>
      <span><strong>Flight ${esc(fg.flightLabel)}</strong> · ${count} player${count !== 1 ? "s" : ""}</span>
    </div>`;
  }

  // Re-queried and re-wired on every render, same convention as
  // wireScoreLinks() below — old nodes (and their listeners) are
  // discarded wholesale each time innerHTML is replaced, so there's no
  // accumulation to guard against. Both the header row/div AND the icon
  // button inside it carry the same data-action, so a click on the
  // button fires once (stopPropagation keeps it from also bubbling to
  // the row's own listener); a click elsewhere on the row fires once too.
  function wireFlightToggles() {
    document.querySelectorAll('[data-action="toggle-flight-group"]').forEach((node) => {
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = node.getAttribute("data-flight-key") || "";
        if (state.collapsedFlights.has(key)) {
          state.collapsedFlights.delete(key);
        } else {
          state.collapsedFlights.add(key);
        }
        renderRoster();
      });
    });
  }



  // ---- mobile card builder (shared across all three scope views) ----
  // ── By Player mobile row (2-line, whole row opens the detail modal) ────────
  function buildPlayerRowMobile(p) {
    const ghin = safeString(p.dbPlayers_PlayerGHIN);
    const name  = valueOrDash(p.dbPlayers_Name);
    const tee   = valueOrDash(p.dbPlayers_TeeSetName);
    const time  = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
    const start = valueOrDash(getFormattedStartHole(p));
    const hi    = numberOrDash(p.dbPlayers_HI);
    const ph    = numberOrDash(p.dbPlayers_PH);
    const so    = numberOrDash(p.dbPlayers_SO);
    const team  = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
    const flight = valueOrDash(resolveFlightName(p.dbPlayers_FlightKey) || p.dbPlayers_FlightKey);

    const metaParts = [
      time + " · Hole " + start,
      "HI " + hi + " · PH " + ph + " · SO " + so
    ];
    if (teamsActive()) metaParts.push(team);
    if (flightsActive()) metaParts.push(flight);

    return (
      '<div class="gsPlayerRow" data-ghin="' + esc(ghin) + '">' +
        '<div class="gsPlayerRow__main">' +
          '<div class="gsPlayerRow__name">' + esc(name) + (tee !== "—" ? " · Tee " + esc(tee) : "") + '</div>' +
          '<div class="gsPlayerRow__meta">' + esc(metaParts.join(" · ")) + '</div>' +
        '</div>' +
        '<svg class="gsPlayerRow__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>' +
      '</div>'
    );
  }

  function wirePlayerRows(sorted) {
    document.querySelectorAll(".gsPlayerRow[data-ghin]").forEach((row) => {
      row.addEventListener("click", () => {
        const ghin = row.getAttribute("data-ghin") || "";
        const p = sorted.find(x => safeString(x.dbPlayers_PlayerGHIN) === ghin);
        if (p) openPlayerDetailModal(p);
      });
    });
  }

  // ── Player detail modal ─────────────────────────────────────────────────
  // Built the same way MA.ui.confirm() builds its own overlay (see
  // ma_shared.js) — created fresh on open, torn down on close — since
  // there's no generic "open arbitrary content in the shared modal shell"
  // helper exposed on MA.ui to call into instead.
  function syncOverlayOpenClass() {
    const anyOpen = !!document.querySelector(".maModalOverlay.is-open");
    document.documentElement.classList.toggle("maOverlayOpen", anyOpen);
  }

  function openPlayerDetailModal(p) {
    const name    = valueOrDash(p.dbPlayers_Name);
    const tee     = valueOrDash(p.dbPlayers_TeeSetName);
    const time    = valueOrDash(formatTimeAmPm(p.dbPlayers_TeeTime));
    const start   = valueOrDash(getFormattedStartHole(p));
    const flight  = valueOrDash(resolveFlightName(p.dbPlayers_FlightKey) || p.dbPlayers_FlightKey);
    const team    = valueOrDash(resolveTeamName(p.dbPlayers_TeamKey));
    const match   = valueOrDash(p.dbPlayers_MatchID);
    const side    = valueOrDash(p.dbPlayers_MatchPos);
    const pair    = valueOrDash(p.dbPlayers_PairingID);
    const pos     = valueOrDash(p.dbPlayers_PairingPos);
    const hi      = numberOrDash(p.dbPlayers_HI);
    const ch      = numberOrDash(p.dbPlayers_CH);
    const ph      = numberOrDash(p.dbPlayers_PH);
    const so      = numberOrDash(p.dbPlayers_SO);
    const scoreId = safeString(p.dbPlayers_PlayerKey).trim();
    const ownGhin = safeString(p.dbPlayers_PlayerGHIN);

    const isPairPair = isPairPairCompetition();

    const fieldRows = [];
    fieldRows.push(["Time · Start", esc(time) + " · " + esc(start)]);
    if (flightsActive()) fieldRows.push(["Flight", esc(flight)]);
    if (teamsActive()) fieldRows.push(["Team", esc(team)]);
    if (isPairPair) fieldRows.push(["Match · Side", esc(match) + " · " + esc(side)]);
    fieldRows.push(["Pair · Pos", esc(pair) + " · " + esc(pos)]);
    fieldRows.push(["HI · CH", esc(hi) + " · " + esc(ch)]);
    fieldRows.push(["PH · SO", esc(ph) + " · " + esc(so)]);

    const fieldRowsHtml = fieldRows.map(([label, val]) =>
      '<tr><td class="gsPlayerModal__fieldLabel">' + label + '</td>' +
      '<td class="gsPlayerModal__fieldVal">' + val + '</td></tr>'
    ).join("");

    // "Playing with" — other players sharing this player's PlayerKey
    // (the physical scorecard group), self excluded. Section omitted
    // entirely when there's no group (no PlayerKey, or nobody else on it).
    const groupmates = scoreId
      ? (state.roster || []).filter(x =>
          safeString(x.dbPlayers_PlayerKey).trim() === scoreId &&
          safeString(x.dbPlayers_PlayerGHIN) !== ownGhin
        )
      : [];

    const groupmatesHtml = groupmates.length
      ? '<div class="gsPlayerModal__groupmates">' +
          '<div class="gsPlayerModal__groupmatesLabel">Playing with</div>' +
          groupmates.map(m => {
            const mName = valueOrDash(m.dbPlayers_Name);
            const initials = mName.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
            return '<div class="gsPlayerModal__mate">' +
              '<span class="gsPlayerModal__mateAvatar">' + esc(initials) + '</span>' +
              '<span>' + esc(mName) + '</span>' +
            '</div>';
          }).join("") +
        '</div>'
      : "";

    const overlay = document.createElement("div");
    overlay.className = "maModalOverlay is-open";
    overlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="gsPlayerModalTitle">
        <header class="maModal__hdr">
          <div>
            <div class="maModal__title" id="gsPlayerModalTitle">${esc(name)}</div>
            <div class="maModal__subtitle">${esc([flightsActive() ? flight : "", teamsActive() ? team : "", tee !== "—" ? "Tee " + tee : ""].filter(Boolean).join(" · "))}</div>
          </div>
          <button type="button" class="iconBtn btnSecondary" data-ma-action="close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </header>
        <div class="maModal__body">
          <table class="gsPlayerModal__fields">${fieldRowsHtml}</table>
          ${groupmatesHtml}
        </div>
        <footer class="maModal__ftr maModalFtr--right">
          <button type="button" class="maModalFtr__btn maModalFtr__btn--cancel" data-ma-action="close">Close</button>
          <button type="button" class="maModalFtr__btn maModalFtr__btn--confirm" data-ma-action="scorecard">Go to scorecard</button>
        </footer>
      </section>`;

    function close() {
      overlay.remove();
      syncOverlayOpenClass();
    }

    overlay.querySelectorAll("[data-ma-action='close']").forEach(btn => btn.addEventListener("click", close));
    overlay.querySelector("[data-ma-action='scorecard']").addEventListener("click", () => {
      close();
      goToScorecard(scoreId);
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
    syncOverlayOpenClass();
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

  // Flat player rows for a view, regardless of scope's grouping shape —
  // shared by the player-count helper below and by CSV export, which
  // always wants a flat list no matter which scope tab is active.
  function flattenViewRows(views, scope) {
    if (!views) return [];
    if (scope === "byPlayer") {
      return views.byPlayer?.players || [];
    }
    if (scope === "byPairing") {
      const out = [];
      (views.byPairing?.flightGroups || []).forEach(fg =>
        (fg.groups || []).forEach(g =>
          (g.pairings || []).forEach(pr => { out.push(...(pr.players || [])); })));
      return out;
    }
    const out = [];
    (views.byPlayingGroup?.flightGroups || []).forEach(fg =>
      (fg.playingGroups || []).forEach(pg => { out.push(...(pg.players || [])); }));
    return out;
  }

  // Flat player count for a view, regardless of scope's grouping shape —
  // used for the "(N)" count in the card title and the empty-state hint.
  // byPlayer's view is already flat; byPairing/byPlayingGroup need
  // flattening through their flightGroups→groups/playingGroups nesting.
  function flatPlayerCountForScope(views, scope) {
    return flattenViewRows(views, scope).length;
  }

  function renderRoster() {
    const views = state.views || {};
    const count = flatPlayerCountForScope(views, state.scope);

    if (el.emptyHint) el.emptyHint.style.display = count ? "none" : "block";

    if (el.scoreIdHeader) el.scoreIdHeader.textContent = "PlayGroup";

    const isPairPair = isPairPairCompetition();
    const hasTeams = teamsActive();
    // Flight is redundant as a per-row column wherever the view already
    // groups by Flight (currently just By Pairing — its own outer Match/
    // Pairing grouping already shows it once per group, not once per
    // player). By Player has no grouping at all, so it still needs the
    // column as the only place that info appears. By Playing Group still
    // groups by Flight too but hasn't had its own redesign pass yet —
    // worth revisiting when that view gets the same treatment.
    const hasFlights = flightsActive() && state.scope !== "byPairing";
    if (el.rosterTbody) {
      const table = el.rosterTbody.closest("table");
      if (table) {
        table.classList.toggle("is-match-play", isPairPair);
        table.classList.toggle("is-has-teams", hasTeams);
        table.classList.toggle("is-has-flights", hasFlights);
      }
    }
    if (el.mobileList) {
      el.mobileList.classList.toggle("is-match-play", isPairPair);
      el.mobileList.classList.toggle("is-has-teams", hasTeams);
    }

    const playerCount = count ? ' (' + count + ')' : '';

    if (state.scope === "byPlayer") {
      if (el.cardTitle) el.cardTitle.textContent = "Players by Name" + playerCount;
      renderRosterByPlayer(views.byPlayer?.players || []);
    } else if (state.scope === "byPairing") {
      if (el.cardTitle) el.cardTitle.textContent = "Players organized Competitively" + playerCount;
      renderRosterByPairing(views.byPairing || { flightGroups: [] });
    } else {
      if (el.cardTitle) el.cardTitle.textContent = "Players organized by Tee Assignments" + playerCount;
      renderRosterByPlayingGroup(views.byPlayingGroup || { flightGroups: [] });
    }
  }

  function renderRosterByPlayer(sorted) {
    const desktopParts = [];
    const mob = [];

    sorted.forEach((p) => {
      const name    = valueOrDash(p.dbPlayers_Name);
      const tee     = valueOrDash(p.dbPlayers_TeeSetName);
      const hi      = numberOrDash(p.dbPlayers_HI);
      const ch      = numberOrDash(p.dbPlayers_CH);
      const ph      = numberOrDash(p.dbPlayers_PH);
      const so      = numberOrDash(p.dbPlayers_SO);
      const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
      const start   = valueOrDash(getFormattedStartHole(p));
      const flight  = valueOrDash(resolveFlightName(p.dbPlayers_FlightKey) || p.dbPlayers_FlightKey);
      const match   = valueOrDash(p.dbPlayers_MatchID);
      const side    = valueOrDash(p.dbPlayers_MatchPos);
      const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
      const pair    = valueOrDash(p.dbPlayers_PairingID);
      const pos     = valueOrDash(p.dbPlayers_PairingPos);
      const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

      desktopParts.push(
        "<tr>" +
          "<td title=\"" + esc(name) + "\">" + esc(name) + "</td>" +
          "<td title=\"" + esc(tee) + "\">" + esc(tee) + "</td>" +
          "<td class=\"gsCenter gsMono col-flight\">" + esc(flight) + "</td>" +
          "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
          "<td class=\"gsCenter gsMono col-match\">" + esc(match) + "</td>" +
          "<td class=\"gsCenter gsMono col-flightpos\">" + esc(side) + "</td>" +
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
      mob.push(buildPlayerRowMobile(p));
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");
    if (el.mobileList) el.mobileList.innerHTML = mob.join("");

    wireScoreLinks();
    wirePlayerRows(sorted);
  }

  function renderRosterByPairing(view) {
    const flightGroups = view.flightGroups || [];
    const isPairPair = isPairPairCompetition();
    const useFlights = flightsActive();
    const colspan = isPairPair ? 15 : 13;
    const desktopParts = [];
    const mob = [];

    flightGroups.forEach((fg) => {
      if (useFlights) {
        desktopParts.push(buildFlightHeaderRow(fg, colspan));
        mob.push(buildFlightHeaderMobile(fg));
      }
      if (useFlights && state.collapsedFlights.has(fg.flightKey)) return;

      // ── Desktop: Match → Pairing(s), with per-pairing summary rows ──────
      const desktopGroups = fg.groups || [];

      desktopGroups.forEach((group) => {
        if (group.matchId) {
          desktopParts.push(buildMatchBandRow(group.matchId, colspan));
        } else if (group.pairings.length === 1) {
          // PairField — no Match tier, so the Pairing itself carries the
          // top band, same tinted treatment.
          desktopParts.push(buildPairingFieldBandRow(group.pairings[0], colspan));
        }

        group.pairings.forEach((pairing, idx) => {
          pairing.players.forEach((p) => {
            const name    = valueOrDash(p.dbPlayers_Name);
            const tee     = valueOrDash(p.dbPlayers_TeeSetName);
            const hi      = numberOrDash(p.dbPlayers_HI);
            const ch      = numberOrDash(p.dbPlayers_CH);
            const ph      = numberOrDash(p.dbPlayers_PH);
            const so      = numberOrDash(p.dbPlayers_SO);
            const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
            const start   = valueOrDash(getFormattedStartHole(p));
            const flight  = valueOrDash(resolveFlightName(p.dbPlayers_FlightKey) || p.dbPlayers_FlightKey);
            const match   = valueOrDash(p.dbPlayers_MatchID);
            const side    = valueOrDash(p.dbPlayers_MatchPos);
            const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
            const pair    = valueOrDash(p.dbPlayers_PairingID);
            const pos     = valueOrDash(p.dbPlayers_PairingPos);
            const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

            desktopParts.push(
              "<tr>" +
                "<td class=\"gsPairIndent\">" + esc(name) + "</td>" +
                "<td>" + esc(tee) + "</td>" +
                "<td class=\"gsCenter gsMono col-flight\">" + esc(flight) + "</td>" +
                "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
                "<td class=\"gsCenter gsMono col-match\">" + esc(match) + "</td>" +
                "<td class=\"gsCenter gsMono col-flightpos\">" + esc(side) + "</td>" +
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

          desktopParts.push(buildPairingSummaryRow(pairing));

          // Divider only between sibling pairings within the same group
          // (i.e. only ever fires for PairPair's two pairings under one
          // Match) — never after the last pairing, and never at all for
          // PairField's single-pairing groups.
          if (idx < group.pairings.length - 1) {
            desktopParts.push(buildPairingDividerRow(colspan));
          }
        });
      });

      // ── Mobile: one card per Match (PairPair) or per Pairing (PairField),
      // built from the exact same desktopGroups computed above. ──────────
      desktopGroups.forEach((group) => {
        if (group.matchId) {
          mob.push(buildMatchCardMobile(group));
        } else {
          mob.push(buildPairingFieldCardMobile(group.pairings[0]));
        }
      });
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");
    if (el.mobileList) el.mobileList.innerHTML = mob.join("");

    wireScoreLinks();
    wireFlightToggles();
  }

  // ── By Playing Group mobile cards ───────────────────────────────────────
  // One .maCard per PlayerKey group — no Match/Pairing nesting, no
  // summary line (this view has no subtotals). Match/Side and Pair/Pos
  // are shown per-player here (unlike By Pairing's cards) since there's
  // no card-level Match/Pairing identity implying them.
  function buildPlayingGroupPlayerLineMobile(p) {
    const name  = valueOrDash(p.dbPlayers_Name);
    const tee   = valueOrDash(p.dbPlayers_TeeSetName);
    const hi    = numberOrDash(p.dbPlayers_HI);
    const ch    = numberOrDash(p.dbPlayers_CH);
    const ph    = numberOrDash(p.dbPlayers_PH);
    const so    = numberOrDash(p.dbPlayers_SO);
    const pair  = valueOrDash(p.dbPlayers_PairingID);
    const pos   = valueOrDash(p.dbPlayers_PairingPos);
    const team  = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));

    const metaParts = ["HI " + hi, "CH " + ch, "PH " + ph, "SO " + so];

    if (isPairPairCompetition()) {
      const match = valueOrDash(p.dbPlayers_MatchID);
      const side  = valueOrDash(p.dbPlayers_MatchPos);
      metaParts.push("Match " + match + " · Side " + side);
    }
    metaParts.push("Pair " + pair + " · Pos " + pos);
    if (teamsActive()) metaParts.push(team);

    return (
      '<div class="gsPairPlayerLine">' +
        '<div class="gsPairPlayerLine__name">' + esc(name) + (tee !== "—" ? " · Tee " + esc(tee) : "") + '</div>' +
        '<div class="gsPairPlayerLine__meta">' + esc(metaParts.join(" · ")) + '</div>' +
      '</div>'
    );
  }

  function buildPlayingGroupCardMobile(group) {
    const first = group.players[0] || {};
    const time  = formatTimeAmPm(valueOrDash(first.dbPlayers_TeeTime));
    const start = valueOrDash(getFormattedStartHole(first));
    const scoreId = valueOrDash(group.playerKey);

    const lines = group.players.map(buildPlayingGroupPlayerLineMobile).join("");

    return (
      '<section class="maCard gsMatchCard">' +
        '<header class="maCard__hdr">' +
          '<div class="maCard__title">' + esc(time) + ' · Hole ' + esc(start) + '</div>' +
          '<div class="maCard__actions">' +
            '<a class="gsScoreLink gsScoreBadge" href="#" data-scoreid="' + esc(scoreId) + '">' + esc(scoreId) + '</a>' +
          '</div>' +
        '</header>' +
        '<div class="maCard__body">' + lines + '</div>' +
      '</section>'
    );
  }

  function renderRosterByPlayingGroup(view) {
    const flightGroups = view.flightGroups || [];
    const isPairPair = isPairPairCompetition();
    const useFlights = flightsActive();
    const colspan = isPairPair ? 15 : 13;
    const desktopParts = [];
    const mob = [];

    flightGroups.forEach((fg) => {
      if (useFlights) {
        desktopParts.push(buildFlightHeaderRow(fg, colspan));
        mob.push(buildFlightHeaderMobile(fg));
      }
      if (useFlights && state.collapsedFlights.has(fg.flightKey)) return;

      const groups = fg.playingGroups || [];

      groups.forEach((group) => {
        desktopParts.push(
          '<tr class="gsGroupHdr"><td colspan="' + colspan + '">' + buildPlayingGroupHeader(group) + '</td></tr>'
        );
        mob.push(buildPlayingGroupCardMobile(group));

        group.players.forEach((p) => {
          const name    = valueOrDash(p.dbPlayers_Name);
          const tee     = valueOrDash(p.dbPlayers_TeeSetName);
          const hi      = numberOrDash(p.dbPlayers_HI);
          const ch      = numberOrDash(p.dbPlayers_CH);
          const ph      = numberOrDash(p.dbPlayers_PH);
          const so      = numberOrDash(p.dbPlayers_SO);
          const time    = formatTimeAmPm(valueOrDash(p.dbPlayers_TeeTime));
          const start   = valueOrDash(getFormattedStartHole(p));
          const flight  = valueOrDash(resolveFlightName(p.dbPlayers_FlightKey) || p.dbPlayers_FlightKey);
          const match   = valueOrDash(p.dbPlayers_MatchID);
          const side    = valueOrDash(p.dbPlayers_MatchPos);
          const teamKey = resolveTeamName(valueOrDash(p.dbPlayers_TeamKey));
          const pair    = valueOrDash(p.dbPlayers_PairingID);
          const pos     = valueOrDash(p.dbPlayers_PairingPos);
          const scoreId = valueOrDash(p.dbPlayers_PlayerKey);

          desktopParts.push(
            "<tr>" +
              "<td>" + esc(name) + "</td>" +
              "<td>" + esc(tee) + "</td>" +
              "<td class=\"gsCenter gsMono col-flight\">" + esc(flight) + "</td>" +
              "<td class=\"gsCenter gsMono col-team\">" + esc(teamKey) + "</td>" +
              "<td class=\"gsCenter gsMono col-match\">" + esc(match) + "</td>" +
              "<td class=\"gsCenter gsMono col-flightpos\">" + esc(side) + "</td>" +
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
    });

    if (el.rosterTbody) el.rosterTbody.innerHTML = desktopParts.join("");
    if (el.mobileList) el.mobileList.innerHTML = mob.join("");

    wireScoreLinks();
    wireFlightToggles();
  }

  // Shared by the desktop PlayGroup link (wireScoreLinks) and the mobile
  // detail modal's "Go to scorecard" button — same destination, same
  // fallback, one place to change it.
  function goToScorecard(scoreId) {
    const id = String(scoreId || "").trim();
    if (!id || id === "—") return;

    if (typeof MA.routerGo === "function") {
      try {
        MA.routerGo("scorehome", { scoreId: id });
        return;
      } catch (err) {
        console.warn(err);
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(() => {
        setStatus("ScoreID copied: " + id, "ok");
      }).catch(() => {
        setStatus("ScoreID: " + id, "info");
      });
    } else {
      setStatus("ScoreID: " + id, "info");
    }
  }

  function wireScoreLinks() {
    const links = document.querySelectorAll(".gsScoreLink[data-scoreid]");
    links.forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        goToScorecard(a.getAttribute("data-scoreid"));
      });
    });
  }

  // ---- actions ----
  function buildCsvText() {
    const rows = flattenViewRows(state.views, state.scope);

    const header = ["Name","Tee","Flight","Team","Match","Side","Pair","Pos","HI","CH","PH","SO","Time","Start","PlayGroup"];
    const lines = [header.join(",")];

    rows.forEach(p => {
      const teeName = safeString(p.dbPlayers_TeeSetName);
      const flightName = resolveFlightName(p.dbPlayers_FlightKey) || safeString(p.dbPlayers_FlightKey);
      const vals = [
        `"` + safeString(p.dbPlayers_Name).replace(/"/g, '""') + `"`,
        teeName.includes('/') ? `="` + teeName.replace(/"/g, '""') + `"` : `"` + teeName.replace(/"/g, '""') + `"`,
        `"` + safeString(flightName).replace(/"/g, '""') + `"`,
        `"` + safeString(resolveTeamName(p.dbPlayers_TeamKey)).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_MatchID).replace(/"/g, '""') + `"`,
        `"` + safeString(p.dbPlayers_MatchPos).replace(/"/g, '""') + `"`,
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
    const views = state.views || {};

    const g = state.game || {};
    const isPairPair = g.dbGames_Competition === 'PairPair';

    let html = `
      <h2 style="font-family: sans-serif;">${esc(g.dbGames_Title || "Game Summary")}</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 10pt; width: 100%;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th>Name</th><th>Tee</th><th>Flight</th><th>Team</th><th>Match</th><th>Side</th>
            <th>Pair</th><th>Pos</th><th>HI</th><th>CH</th><th>PH</th><th>SO</th>
            <th>Time</th><th>Start</th><th>PlayGroup</th>
          </tr>
        </thead>
        <tbody>`;

    const buildRow = (p) => {
      const startHole = getFormattedStartHole(p);
      const flightName = resolveFlightName(p.dbPlayers_FlightKey) || safeString(p.dbPlayers_FlightKey);
      return `<tr>
        <td>${esc(p.dbPlayers_Name)}</td>
        <td>${esc(p.dbPlayers_TeeSetName)}</td>
        <td align="center">${esc(flightName)}</td>
        <td align="center">${esc(resolveTeamName(p.dbPlayers_TeamKey))}</td>
        <td align="center">${esc(p.dbPlayers_MatchID)}</td>
        <td align="center">${esc(p.dbPlayers_MatchPos)}</td>
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

    // 15 real columns now (Flight added) — this export is a static,
    // fully-inlined table with no CSS-driven column hiding, so a fixed
    // colspan here is safe (unlike the live page, where col-flight/
    // col-team can be display:none'd out of the table entirely).
    if (state.scope === "byPairing") {
      const flightGroups = views.byPairing?.flightGroups || [];
      const showFlights = flightsActive();

      flightGroups.forEach((fg) => {
        if (showFlights) {
          html += `<tr style="background-color:#e5e5e5;"><td colspan="15"><strong>Flight ${esc(fg.flightLabel)}</strong></td></tr>`;
        }

        (fg.groups || []).forEach((group) => {
          if (group.matchId) {
            html += `<tr style="background-color:#eaf5ef;"><td colspan="15"><strong>Match ${esc(group.matchId)}</strong></td></tr>`;
          } else if (group.pairings.length === 1) {
            const prefix = group.pairings[0].labelPrefix || "";
            const pid = group.pairings[0].pairingId;
            const label = prefix ? `${prefix}, Pairing ${pid}` : `Pairing ${pid}`;
            html += `<tr style="background-color:#eaf5ef;"><td colspan="15"><strong>${esc(label)}</strong></td></tr>`;
          }

          group.pairings.forEach((pairing) => {
            pairing.players.forEach((p) => { html += buildRow(p); });

            const avgHI = pairing.averages?.avgHI ?? "0.0";
            const avgCH = pairing.averages?.avgCH ?? "0.0";
            const avgPH = pairing.averages?.avgPH ?? "0.0";
            const prefix = pairing.labelPrefix || "";
            const label = prefix ? `${prefix}, Pair ${pairing.pairingId}` : `Pair ${pairing.pairingId}`;
            html += `<tr>
              <td colspan="8" style="font-weight:bold; border-top:2px solid #333;">${esc(label)}</td>
              <td align="center" style="font-weight:bold; border-top:2px solid #333;">${esc(avgHI)}</td>
              <td align="center" style="font-weight:bold; border-top:2px solid #333;">${esc(avgCH)}</td>
              <td align="center" style="font-weight:bold; border-top:2px solid #333;">${esc(avgPH)}</td>
              <td colspan="4" style="border-top:2px solid #333;"></td>
            </tr>`;
          });
        });
      });
    } else if (state.scope === "byPlayingGroup") {
      const flightGroups = views.byPlayingGroup?.flightGroups || [];
      flightGroups.forEach((fg) => {
        (fg.playingGroups || []).forEach((group) => {
          html += `<tr style="background-color:#f9f9f9;"><td colspan="15">${buildPlayingGroupHeader(group)}</td></tr>`;
          group.players.forEach((p) => { html += buildRow(p); });
        });
      });
    } else {
      (views.byPlayer?.players || []).forEach((p) => { html += buildRow(p); });
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

  // ── Send Tee Sheet ───────────────────────────────────────────────────
  // The plain-text tee sheet that used to be built here (buildPlayingGroupsText())
  // now lives server-side, in ServiceGameRosterViews::buildByPlayingGroupView()
  // + renderTeeSheetPlainText() in initPlayerNotifications.php, returned as
  // game.gameInfoBody and used automatically as MA.notify's default
  // "gameInfo" body — identical output, but now available from every page
  // that sends a tee sheet, not just this one. This function's remaining
  // job is purely the rich-HTML clipboard copy, which stays a summary-
  // specific affordance layered on top of that standard message body for
  // admins who know how to paste it in.
  async function emailSelectedRecipients() {
    if (!MA.notify || typeof MA.notify.open !== "function") {
      setStatus("Messaging module not loaded.", "error");
      return;
    }

    const g = state.game || {};
    const ggid = String(g.dbGames_GGID || g.dbGames_GGIDnum || "").trim();

    MA.notify.open({
      ggid:    ggid,
      apiPath: MA.paths?.apiNotify,
      intent:  "gameInfo",
    });

    try {
      await copyRichTextToClipboard();
    } catch (e) {
      console.warn("[MA] Clipboard copy failed:", e);
      // modal still opens regardless
    }
  }

  // ── Send Invitation ──────────────────────────────────────────────────
  // Brings Summary in line with the other four pages — always enabled,
  // readiness is a gameInfo-only concept and doesn't apply here.
  function inviteSelectedRecipients() {
    if (!MA.notify || typeof MA.notify.open !== "function") {
      setStatus("Messaging module not loaded.", "error");
      return;
    }

    const g = state.game || {};
    const ggid = String(g.dbGames_GGID || g.dbGames_GGIDnum || "").trim();

    MA.notify.open({
      ggid:    ggid,
      apiPath: MA.paths?.apiNotify,
      intent:  "invite",
    });
  }

  // ── Send General Message ─────────────────────────────────────────────
  // Always enabled — deliberately ungated even when the game has zero
  // enrolled players (a possible future isRosterReady gate was considered
  // and not implemented; see player_notifications.js).
  function messageSelectedRecipients() {
    if (!MA.notify || typeof MA.notify.open !== "function") {
      setStatus("Messaging module not loaded.", "error");
      return;
    }

    const g = state.game || {};
    const ggid = String(g.dbGames_GGID || g.dbGames_GGIDnum || "").trim();

    MA.notify.open({
      ggid:    ggid,
      apiPath: MA.paths?.apiNotify,
      intent:  "message",
    });
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
    state.views  = init.views  || init.payload?.views  || null;
    state.portal = init.portal || init.payload?.portal || "";
  }

  function wireEvents() {
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
      { category: "Export" },
      { label: "Download View to CSV",   action: downloadCsv,            indent: true },
      { label: "Copy View to Clipboard", action: copySummaryToClipboard, indent: true },

      { category: "Admin Services" },
      { label: "Display Game Settings", action: () => MA.gameDetails.open(state.game), indent: true },
      { label: "Recalculate Handicaps", action: recalculateHandicaps, indent: true },

      { category: "Messaging and Calendar" },
      { label: "Send Invitation",       action: inviteSelectedRecipients,  indent: true },
      { label: "Send Tee Sheet",        action: emailSelectedRecipients,   indent: true },
      { label: "Send General Message",  action: messageSelectedRecipients, indent: true },
      { label: "Add Game to Calendar",  action: downloadIcsForGame,   indent: true },
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  function applyChrome() {
    const g = state.game || {};
    const title    = String(g.dbGames_Title || "");
    const course   = String(g.dbGames_CourseName || "");
    const date     = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    const isEventGame = !!(state.game?.dbGames_EID);
    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines([isEventGame ? "Round Summary" : "Game Summary", title, subTitle]);
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
        ? ["player", "roster", "summary"]
        : isEventGame
          ? ["eventrounds", "roundedit", "roundsettings", "roundroster", "roundpairings", "roundteetimes", "roundsummary", "roundscorecard"]
          : [homeRoute, "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"];

      chrome.setBottomNav({
        visible: visible,
        root: isPlayerPortal ? ["player"] : (isEventGame ? ["eventrounds"] : ["admin"]),
        active: isEventGame ? "roundsummary" : "summary",
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