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

  function renderGroup(group) {
    const courseRowsCount = Array.isArray(group.courseInfo) ? group.courseInfo.length : 0;
    const densityClass = (courseRowsCount + 6 > 14) ? "scDenseC" : (courseRowsCount + 6 > 12) ? "scDenseB" : (courseRowsCount + 6 > 10) ? "scDenseA" : "";
    const gh = group.gameHeader || {};
    const subLine = [esc(gh.courseName), formatDate(gh.playDate), group.teeTime ? esc(group.teeTime) : ""].filter(Boolean).join(" • ");
    const scoreCardId = String(gh.playerKey || "").trim();
    const qrUrl = (scoreCardId && gh.GGID) ? `${window.location.origin}/app/score_entry/scoreentry.php?key=${encodeURIComponent(scoreCardId)}` : "";

    return `<div class="scGroup ${densityClass}"><div class="scHdr"><div class="scHdr__left"><div class="scHdrTop"><img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" /><div class="scHdrText"><div class="scHdr__title">${esc(gh.gameTitle || "Game")}</div><div class="scHdr__sub">${subLine}</div></div></div></div><div class="scHdr__right"><div class="scHdrRightText"><div class="scHdrLink">Live Scoring at ${window.location.host}/app/score_entry/scoreentry.php</div><div class="scHdrKey">Use ScoreCard-ID: <span class="scHdrKeyVal">${esc(scoreCardId)}</span></div></div><div class="scQR">${qrUrl ? `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}">` : ""}</div></div></div>${renderTable(group)}${renderFooter(group)}</div>`;
  }

  function renderFooter(group) {
    const gh = group.gameHeader || {};
    const left = [gh.GGID ? `Game ${gh.GGID}` : "", group.flightID ? `Match ${group.flightID}` : "", group.pairingID ? `Pairing ${group.pairingID}` : ""].filter(Boolean).join(" • ");
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
