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

  function clearHost() {
    if (el.host) el.host.innerHTML = "";
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

  // ==================== Shared Scorecard Render Primitives ====================

  function buildStrokeMark(n) {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num === 0) return "";

    // Display as superscript number (use minus for plus-handicaps / givebacks)
    const abs = Math.abs(num);
    const sign = num < 0 ? "−" : ""; // nicer minus
    return `<sup class="scStrokeSup" aria-label="strokes">${sign}${abs}</sup>`;
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

  function renderTable(group, densityClass) {
    const courseRows = Array.isArray(group.courseInfo) ? group.courseInfo : [];
    const players = Array.isArray(group.players) ? group.players : [];
    
    const scoringMethod = String(game.dbGames_ScoringMethod || "NET").toUpperCase();
    const isAdjGross = (scoringMethod === "ADJ GROSS");
    const isMatchPlay = (String(group.competition || "").toLowerCase() === "pairpair");
    
    let html = '<table class="scTable" role="table" aria-label="scorecard">';
    html += "<thead><tr>";
    html += '<th class="scName">HOLE</th>';

    // 1..9
    for (let h = 1; h <= 9; h++) html += `<th>${h}</th>`;
    html += '<th class="scMeta">Out</th>';

    // 10..18
    for (let h = 10; h <= 18; h++) html += `<th>${h}</th>`;
    html += '<th class="scMeta">In</th><th class="scMeta">Tot</th>';

    html += "</tr></thead>";
    html += "<tbody>";

    // Course rows (Yards + optionally Par/HCP rows)
    courseRows.forEach((r) => {
      const label = esc(r.label || "");
      const tee = esc(r.tee || "");
      html += "<tr>";
      html += `<td class="scName">${label}${tee && label !== "Par" && label !== "HCP" ? " — " + tee : ""}</td>`;
      // 1..9
      for (let h = 1; h <= 9; h++) html += `<td>${esc(r["h" + h] ?? "")}</td>`;
      html += `<td class="scMeta">${esc(r["9a"] ?? "")}</td>`;

      // 10..18
      for (let h = 10; h <= 18; h++) html += `<td>${esc(r["h" + h] ?? "")}</td>`;
      html += `<td class="scMeta">${esc(r["9b"] ?? "")}</td><td class="scMeta">${esc(r["9c"] ?? "")}</td>`;
      html += "</tr>";
    });

    // Player Section: Fixed 6 rows total
    // Match Play: Team A (2) + Separator (1) + Team B (2) + Bottom (1)
    // Standard: Players (4) + Bottom (2)
    
    const renderPlayerRow = (p) => {
      if (!p) {
        // Empty scoring row
        let rowHtml = "<tr>";
        rowHtml += `<td class="scName">&nbsp;</td>`;
        for (let h = 1; h <= 9; h++) rowHtml += `<td></td>`;
        rowHtml += `<td class="scMeta"></td>`;
        for (let h = 10; h <= 18; h++) rowHtml += `<td></td>`;
        rowHtml += `<td class="scMeta"></td><td class="scMeta"></td>`;
        rowHtml += "</tr>";
        return rowHtml;
      }

      // Real player
      const name = String(p.playerName || "").trim();
      const teeName = String(p.tee || "").trim();

      // Handicap display rules:
      // - ADJ GROSS => blank
      // - Otherwise show computed playerHC (including 0)
      let hcText = "";
      if (!isAdjGross) {
        const hcVal = Number(p.playerHC);
        if (Number.isFinite(hcVal)) hcText = `(${hcVal})`;
      }

      const gender = String(p.dbPlayers_Gender || "").trim();
      let rowHtml = `<tr data-gender="${esc(gender)}">`;
      rowHtml += `<td class="scName">
        <div class="scPLine1">${esc(name)} ${hcText ? `<span class="scPHC">${esc(hcText)}</span>` : ""}</div>
        <div class="scPLine2">${esc(teeName)}</div>
      </td>`;
      // 1..9
      for (let h = 1; h <= 9; h++) {
        const v = p.strokes ? p.strokes["h" + h] : 0;
        rowHtml += `<td class="scStrokeCell">${buildStrokeMark(v)}</td>`;
      }

      // Out
      rowHtml += `<td class="scMeta"></td>`;

      // 10..18
      for (let h = 10; h <= 18; h++) {
        const v = p.strokes ? p.strokes["h" + h] : 0;
        rowHtml += `<td class="scStrokeCell">${buildStrokeMark(v)}</td>`;
      }

      // In + Tot
      rowHtml += `<td class="scMeta"></td><td class="scMeta"></td>`;
      rowHtml += "</tr>";
      return rowHtml;
    };

    // Build the 6-row structure
    const rowsToRender = [];
    if (isMatchPlay) {
      // Team A (slots 0,1)
      rowsToRender.push(players[0] || null);
      rowsToRender.push(players[1] || null);
      // Separator
      rowsToRender.push(null); // Blank separator line
      // Team B (slots 2,3)
      rowsToRender.push(players[2] || null);
      rowsToRender.push(players[3] || null);
      // Bottom empty
      rowsToRender.push(null);
    } else {
      // Standard: 4 players + 2 empty
      for (let i=0; i<4; i++) rowsToRender.push(players[i] || null);
      rowsToRender.push(null);
      rowsToRender.push(null);
    }

    // Render
    rowsToRender.forEach(r => html += renderPlayerRow(r));

    html += "</tbody></table>";
    return html;
  }

  function renderGroup(group) {
    // Calculate Density
    const courseRows = Array.isArray(group.courseInfo) ? group.courseInfo.length : 0;
    const playerSectionRows = 6; // Fixed
    const totalRows = courseRows + playerSectionRows;
    
    let densityClass = "";
    if (totalRows > 14) densityClass = "scDenseC";
    else if (totalRows > 12) densityClass = "scDenseB";
    else if (totalRows > 10) densityClass = "scDenseA";

    const gh = group.gameHeader || {};
    const subLine = [esc(gh.courseName), formatDate(gh.playDate), group.teeTime ? esc(group.teeTime) : ""].filter(Boolean).join(" • ");
    const scoreCardId = String(gh.playerKey || "").trim();
    const origin = window.location.origin;
    const qrUrl = (scoreCardId && gh.GGID) ? `${origin}/app/score_entry/scoreentry.php?key=${encodeURIComponent(scoreCardId)}` : "";

      return `
        <div class="scGroup ${densityClass}">
          <div class="scHdr">
            <div class="scHdr__left">

              <div class="scHdrTop">
                <img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
                <div class="scHdrText">
                  <div class="scHdr__title">${esc(gh.gameTitle || "Game")}</div>
                  <div class="scHdr__sub">${subLine}</div>
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

          ${renderTable(group, densityClass)}
          ${renderFooter(group)}
        </div>
      `;
  }
  function renderFooter(group) {
      const gh = group.gameHeader || {};

      const ggid = String(gh.GGID || "").trim();
      const flightID = String(group.flightID || "").trim();
      const pairingID = String(group.pairingID || "").trim();

      // Example footer left: "Game 00000440 Flight 2, Pairing 006"
      const left = [
        ggid ? `Game ${ggid}` : "",
        flightID ? `Match ${flightID}` : "",
        pairingID ? `Pairing ${pairingID}` : ""
      ].filter(Boolean).join(" • ");

      const year = new Date().getFullYear();

      return `
        <div class="scFooter">
          <div class="scFooterRow">
            <div class="scFooterBox">
              <div class="scFooterLine"></div>
              <div class="scFooterLabel">SCORER</div>
            </div>

            <div class="scFooterBox">
              <div class="scFooterLine"></div>
              <div class="scFooterLabel">ATTEST</div>
            </div>
          </div>

          <div class="scFooterMeta">
            <div class="scFooterLeft">${esc(left)}</div>
            <div class="scFooterRight">© ${year} MatchAid — All Rights Reserved</div>
          </div>
        </div>
      `;
    }

  function renderPages(rows) {
    clearHost();
    if (!el.host) return;

    if (!rows.length) {
      if (el.empty) el.empty.style.display = "block";
      return;
    }
    if (el.empty) el.empty.style.display = "none";

    // Two groups per page
    for (let i = 0; i < rows.length; i += 2) {
      const top = rows[i];
      const bottom = rows[i + 1] || null;

      const page = document.createElement("section");
      page.className = "scPage";
      page.innerHTML = renderGroup(top) + (bottom ? `<div class="scPage__divider"></div>${renderGroup(bottom)}` : "");
      el.host.appendChild(page);
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

  function onPrint() {
    try { window.print(); } catch (e) { /* ignore */ }
  }
  function applyChrome() {
    const title = String(game.dbGames_Title || "Game");
    const course = String(game.dbGames_CourseName || "");
    const date = formatDate(game.dbGames_PlayDate);
    const subtitle = [course, date].filter(Boolean).join(" • ");
    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Scorecard", title, subtitle]);
    }
    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        right: { show: true, label: "Print", onClick: onPrint }
      });
    }
    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
        active: "scorecard",
        onNavigate: (id) => { if (typeof MA.routerGo === "function") MA.routerGo(id); }
      });
    }
  }
  function bindActions() {
    // Placeholder for future expansion toggle events
  }

  // ==========================================================================
  // 8. Page Controller
  // ==========================================================================

  function render() {
    const payload = normalizePayload(scorecards);
    renderPages(payload.rows || []);
  }
  function initialize() {
    try {
      applyChrome();
      render();
      const ap = qs("autoprint");
      if (String(ap || "") === "1") {
        setTimeout(onPrint, 250);
      }
    } catch (e) {
      console.error("[SCORECARDS_INIT_ERR]", e);
      setStatus("Failed to render scorecards.", "error");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
