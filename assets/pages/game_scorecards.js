/* /assets/pages/game_scorecards.js
 * Scorecards page controller (GoDaddy/PHP).
 * - Reads INIT from window.__MA_INIT__/__INIT__
 * - Renders print-first scorecards into #scHost
 * - Two groups per printed page (top/bottom) w/ divider
 * - Print triggers window.print()
 */
(function () {
  "use strict";

  // ==========================================================================
  // 1. Bootstrap / INIT
  // ==========================================================================
  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const paths = MA.paths || {};
  const game = init.game || {};
  const scorecards = init.scorecards || {};

  // ==========================================================================
  // 2. Generic DOM Helpers
  // ==========================================================================
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
  }
  function clearHost() {
    const host = document.getElementById("scHost");
    if (host) host.innerHTML = "";
  }
  function formatDate(s) {
    if (!s) return "";
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(...s.split("-").map((n, i) => i === 1 ? n - 1 : n)) : new Date(s);
    if (isNaN(d.getTime())) return s;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  // ==========================================================================
  // 3. Payload Normalization
  // ==========================================================================
  function normalizePayload(p) {
    const competition = String(p?.competition || "");
    const grouping = String(p?.grouping || "");
    const rows = Array.isArray(p?.rows) ? p.rows : [];
    const meta = p?.meta || {};
    return { competition, grouping, rows, meta };
  }

  // ==========================================================================
  // 4. Shared Scorecard Render Primitives
  // ==========================================================================
  function buildStrokeMark(n) {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num === 0) return "";
    return `<sup class="scStrokeSup" aria-label="strokes">${num < 0 ? "−" : ""}${Math.abs(num)}</sup>`;
  }

  function renderTable(group) {
    const courseRows = Array.isArray(group.courseInfo) ? group.courseInfo : [];
    const players = Array.isArray(group.players) ? group.players : [];
    const isAdjGross = (String(game.dbGames_ScoringMethod || "").toUpperCase() === "ADJ GROSS");
    const isMatchPlay = (String(group.competition || "").toLowerCase() === "pairpair");
    
    let html = '<table class="scTable" role="table" aria-label="scorecard"><thead><tr><th class="scName">HOLE</th>';
    for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
    html += '<th class="scMeta">Out</th>';
    for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
    html += '<th class="scMeta">In</th><th class="scMeta">Tot</th></tr></thead><tbody>';

    courseRows.forEach((r) => {
      html += `<tr><td class="scName">${esc(r.label)}${r.tee && !["Par","HCP"].includes(r.label) ? " — " + esc(r.tee) : ""}</td>`;
      for (let h = 1; h <= 9; h++) html += `<td>${esc(r["h" + h] ?? "")}</td>`;
      html += `<td class="scMeta">${esc(r["9a"] ?? "")}</td>`;
      for (let h = 10; h <= 18; h++) html += `<td>${esc(r["h" + h] ?? "")}</td>`;
      html += `<td class="scMeta">${esc(r["9b"] ?? "")}</td><td class="scMeta">${esc(r["9c"] ?? "")}</td></tr>`;
    });

    const rowsToRender = isMatchPlay ? [players[0], players[1], null, players[2], players[3], null] : [...players.slice(0,4), null, null];

    rowsToRender.forEach(p => {
      html += "<tr>";
      if (!p) {
        html += '<td class="scName">&nbsp;</td>' + '<td></td>'.repeat(9) + '<td class="scMeta"></td>' + '<td></td>'.repeat(9) + '<td class="scMeta"></td><td class="scMeta"></td>';
      } else {
        const hcText = !isAdjGross && Number.isFinite(Number(p.playerHC)) ? `(${p.playerHC})` : "";
        html += `<td class="scName"><div class="scPLine1">${esc(p.playerName)} <span class="scPHC">${esc(hcText)}</span></div><div class="scPLine2">${esc(p.tee || "")}</div></td>`;
        for (let h = 1; h <= 9; h++) html += `<td class="scStrokeCell">${buildStrokeMark(p.strokes?.["h" + h])}</td>`;
        html += '<td class="scMeta"></td>';
        for (let h = 10; h <= 18; h++) html += `<td class="scStrokeCell">${buildStrokeMark(p.strokes?.["h" + h])}</td>`;
        html += '<td class="scMeta"></td><td class="scMeta"></td>';
      }
      html += "</tr>";
    });
    return html + "</tbody></table>";
  }

  /*
  function renderGroup(group) {
    const courseRowsCount = Array.isArray(group.courseInfo) ? group.courseInfo.length : 0;
    const densityClass = (courseRowsCount + 6 > 14) ? "scDenseC" : (courseRowsCount + 6 > 12) ? "scDenseB" : (courseRowsCount + 6 > 10) ? "scDenseA" : "";
    const gh = group.gameHeader || {};
    const subLine = [esc(gh.courseName), formatDate(gh.playDate), group.teeTime ? esc(group.teeTime) : ""].filter(Boolean).join(" • ");
    const scoreCardId = String(gh.playerKey || "").trim();
    const qrUrl = (scoreCardId && gh.GGID) ? `${window.location.origin}/app/score_entry/scoreentry.php?key=${encodeURIComponent(scoreCardId)}` : "";

    return `<div class="scGroup ${densityClass}"><div class="scHdr"><div class="scHdr__left"><div class="scHdrTop"><img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" /><div class="scHdrText"><div class="scHdr__title">${esc(gh.gameTitle || "Game")}</div><div class="scHdr__sub">${subLine}</div></div></div></div><div class="scHdr__right"><div class="scHdrRightText"><div class="scHdrLink">Live Scoring at ${window.location.host}/app/score_entry/scoreentry.php</div><div class="scHdrKey">Use ScoreCard-ID: <span class="scHdrKeyVal">${esc(scoreCardId)}</span></div></div><div class="scQR">${qrUrl ? `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}">` : ""}</div></div></div>${renderTable(group)}${renderFooter(group)}</div>`;
  }
  */

function renderGroup(group) {
  const courseRowsCount = Array.isArray(group.courseInfo) ? group.courseInfo.length : 0;
  const densityClass =
    (courseRowsCount + 6 > 14) ? "scDenseC" :
    (courseRowsCount + 6 > 12) ? "scDenseB" :
    (courseRowsCount + 6 > 10) ? "scDenseA" : "";

  const gh = group.gameHeader || {};
  const title = esc(gh.gameTitle || "Game");

  // ==========================================================================
  // Header Line 2
  // ==========================================================================
  const courseName = esc(gh.courseName || "");
  const dateStr = gh.playDate ? formatDate(gh.playDate) : "";
  const teeTime = group.teeTime ? esc(group.teeTime) : "";

  let suffix = group.startHoleSuffix || "";
  if (!suffix && Array.isArray(group.players)) {
    const p = group.players.find((x) => x && (x.dbPlayers_StartHoleSuffix || x.startHoleSuffix));
    if (p) suffix = p.dbPlayers_StartHoleSuffix || p.startHoleSuffix;
  }
  const startHole = group.startHole ? `Start: Hole ${esc(group.startHole)}${esc(suffix)}` : "";

  const subLine = [courseName, dateStr, teeTime, startHole].filter(Boolean).join(" • ");

  // ==========================================================================
  // Header Line 3
  // ==========================================================================
  const gameFormat = String(gh.dbGames_GameFormat || game.dbGames_GameFormat || "").trim();
  const scoringBasis = String(game.dbGames_ScoringBasis || "").trim();
  const scoringMethod = String(game.dbGames_ScoringMethod || "").trim();
  const strokeDist = String(game.dbGames_StrokeDistribution || "").trim();
  const allowanceRaw = String(game.dbGames_Allowance || "").trim();

  const hcEff = String(game.dbGames_HCEffectivity || "").trim();
  const hcDate = String(game.dbGames_HCEffectivityDate || "").trim();

  let formatLabel = "";
  if (gameFormat && scoringBasis && scoringMethod) {
    formatLabel = `Format: ${esc(gameFormat)} based on ${esc(scoringBasis)} using ${esc(scoringMethod)} scoring`;
  } else if (gameFormat && scoringBasis) {
    formatLabel = `Format: ${esc(gameFormat)} based on ${esc(scoringBasis)}`;
  } else if (gameFormat && scoringMethod) {
    formatLabel = `Format: ${esc(gameFormat)} using ${esc(scoringMethod)} scoring`;
  } else if (gameFormat) {
    formatLabel = `Format: ${esc(gameFormat)}`;
  }

  const isGrossScoring = scoringMethod.toUpperCase() === "GROSS" || scoringMethod.toUpperCase() === "ADJ GROSS";

  let hcLabel = "";
  if (!isGrossScoring) {
    if (hcEff === "Date" && hcDate) hcLabel = `HC Effective as of ${esc(hcDate)}`;
    else if (hcEff) hcLabel = `HCP Effective using ${esc(hcEff)}`;
  }

  let allowanceLabel = "";
  if (!isGrossScoring && allowanceRaw) {
    allowanceLabel = `Allowance ${esc(allowanceRaw)}%`;
  }

  let strokeDistLabel = "";
  if (strokeDist) strokeDistLabel = `Stroke Distribution ${esc(strokeDist)}`;

  let segmentLabel = "";
  if (String(gh.dbGames_RotationMethod || game.dbGames_RotationMethod || "").trim() !== "None") {
    const seg = String(gh.dbGames_Segments || game.dbGames_Segments || "").trim();
    if (seg) segmentLabel = `${esc(seg)}-Hole Segments`;
  }

  const line3 = [
    formatLabel,
    hcLabel,
    allowanceLabel,
    strokeDistLabel,
    segmentLabel
  ].filter(Boolean).join(" • ");

  // ==========================================================================
  // Header Line 4
  // ==========================================================================
  const sys = String(game.dbGames_ScoringSystem || "").trim();
  let line4 = "";

  if (sys === "BestBall") {
    const cnt =
      String(
        game.dbGames_BestBallCnt ||
        game.dbGames_BestBall ||
        ""
      ).trim();

    line4 = cnt
      ? `Scoring System: Best ${esc(cnt)} Ball${cnt === "1" ? "" : "s"}`
      : "Scoring System: Best Ball";

  } else if (sys === "DeclareHole") {
    try {
      const raw = game.dbGames_HoleDeclaration;
      const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      const map = {};

      if (Array.isArray(parsed)) {
        parsed.forEach((r) => {
          if (r && r.hole != null) map[r.hole] = r.count;
        });
      } else {
        Object.assign(map, parsed);
      }

      const pairs = [];
      for (let h = 1; h <= 18; h++) {
        const val = map[h] ?? map[String(h)];
        if (val != null && val !== "") pairs.push(`H${h}:${val}`);
      }

      line4 = pairs.length
        ? `Scoring System: Declare by Hole (${pairs.join(" • ")})`
        : "Scoring System: Declare by Hole";

    } catch (e) {
      line4 = "Scoring System: Declare by Hole";
    }

  } else if (sys === "DeclarePlayer") {
    const perPlayer = String(game.dbGames_PlayerDeclaration || "1").trim();
    line4 = `Scoring System: Declare by Player (${esc(perPlayer)}x per player)`;

  } else if (sys === "DeclareManual") {
    line4 = "Scoring System: Declare Scores Discretionally";

  } else if (sys === "AllScores") {
    line4 = "Scoring System: Use All Scores";

  } else if (sys) {
    line4 = `Scoring System: ${esc(sys)}`;
  }

  // ==========================================================================
  // QR / Right Side
  // ==========================================================================
  const scoreCardId = String(gh.playerKey || "").trim();
  const qrUrl =
    (scoreCardId && gh.GGID)
      ? `${window.location.origin}${paths.scoreHome || '/app/score_home/scorehome.php'}?key=${encodeURIComponent(scoreCardId)}`
      : "";

  return `
    <div class="scGroup ${densityClass}">
      <div class="scHdr">
        <div class="scHdr__left">
          <div class="scHdrTop">
            <img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
            <div class="scHdrText">
              <div class="scHdr__title">${title}</div>
              <div class="scHdr__sub">${subLine}</div>
              ${line3 ? `<div class="scHdr__sub2" style="font-weight:700;">${esc(line3)}</div>` : ""}
              ${line4 ? `<div class="scHdr__sub2">${esc(line4)}</div>` : ""}
            </div>
          </div>
        </div>

        <div class="scHdr__right">
          <div class="scHdrRightText">
            <div class="scHdrLink">Live Scoring at ${window.location.host}/app/score_entry/scoreentry.php</div>
            <div class="scHdrKey">Use ScoreCard-ID: <span class="scHdrKeyVal">${esc(scoreCardId)}</span></div>
          </div>
          <div class="scQR">
            ${qrUrl ? `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}">` : ""}
          </div>
        </div>
      </div>

      ${renderTable(group)}
      ${renderFooter(group)}
    </div>
  `;
}

  function renderFooter(group) {
    const gh = group.gameHeader || {};
    const isPairPair = String(gh.dbGames_Competition || "").trim() === "PairPair";

    const pairingIDs = Array.isArray(group.pairingIDs)
      ? group.pairingIDs.filter(Boolean)
      : (group.pairingID ? [group.pairingID] : []);

    const flightIDs = Array.isArray(group.flightIDs)
      ? group.flightIDs.filter(Boolean)
      : (group.flightID ? [group.flightID] : []);

    const leftParts = [];

    if (gh.GGID) leftParts.push(`Game ${gh.GGID}`);
    if (isPairPair && flightIDs.length) leftParts.push(`Match ${flightIDs.join(", ")}`);
    if (pairingIDs.length) leftParts.push(`Pairings ${pairingIDs.join(", ")}`);

    const left = leftParts.join(" • ");

    return `<div class="scFooter"><div class="scFooterRow"><div class="scFooterBox"><div class="scFooterLine"></div><div class="scFooterLabel">SCORER</div></div><div class="scFooterBox"><div class="scFooterLine"></div><div class="scFooterLabel">ATTEST</div></div></div><div class="scFooterMeta"><div class="scFooterLeft">${esc(left)}</div><div class="scFooterRight">© ${new Date().getFullYear()} MatchAid</div></div></div>`;
  }

  function renderPages(rows) {
    const host = document.getElementById("scHost");
    const empty = document.getElementById("scEmpty");
    if (!host) return;
    clearHost();
    if (!rows.length) { if (empty) empty.style.display = "block"; return; }
    if (empty) empty.style.display = "none";
    for (let i = 0; i < rows.length; i += 2) {
      const page = document.createElement("section");
      page.className = "scPage";
      page.innerHTML = renderGroup(rows[i]) + (rows[i+1] ? `<div class="scPage__divider"></div>${renderGroup(rows[i+1])}` : "");
      host.appendChild(page);
    }
  }

  // ==========================================================================
  // 5. Display-Mode Adapters
  // ==========================================================================
  function getActiveValueMode() { return "blank"; }
  function getCellDisplayValue(p, hole) { return ""; }
  function getRowTotals(p) { return { out: "", in: "", tot: "" }; }
  function getSummaryRows(p) { return []; }

  // ==========================================================================
  // 6. Expansion-State Adapters
  // ==========================================================================
  function isPlayerExpanded(pId) { return false; }
  function isTotalsExpanded() { return false; }
  function renderExpandedPlayerRows(p) { return ""; }
  function renderExpandedTotalsColumns(p) { return ""; }

  // ==========================================================================
  // 7. Page Actions / Print
  // ==========================================================================
  function onPrint() { try { window.print(); } catch (e) {} }
  function applyChrome() {
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(" • ");
    if (chrome.setHeaderLines) chrome.setHeaderLines(["Scorecard", game.dbGames_Title || "Game", subtitle]);
    if (chrome.setActions) chrome.setActions({ right: { show: true, label: "Print", onClick: onPrint } });
    if (chrome.setBottomNav) chrome.setBottomNav({ visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"], active: "scorecard", onNavigate: (id) => MA.routerGo?.(id) });
  }
  function bindActions() {}

  // ==========================================================================
  // 8. Page Controller
  // ==========================================================================
  function render() {
    const payload = normalizePayload(scorecards);
    renderPages(payload.rows);
  }
  function initialize() {
    applyChrome();
    render();
    if (qs("autoprint") === "1") setTimeout(onPrint, 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
