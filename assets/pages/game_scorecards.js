/* /assets/pages/game_scorecards.js
 * Scorecards page controller (GoDaddy/PHP).
 * - Reads INIT from window.__MA_INIT__/__INIT__
 * - Renders print-first scorecards into #scHost
 * - Two groups per printed page (top/bottom) w/ divider
 * - Print triggers window.print()
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const game = init.game || {};
  const scorecards = init.scorecards || init; // fallback during transition
  
  const setStatus = (msg, level) => (typeof MA.setStatus === "function" ? MA.setStatus(msg, level) : console.log("[STATUS]", level || "info", msg));

  const el = {
    host: document.getElementById("scHost"),
    empty: document.getElementById("scEmpty"),
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
  }

  function normalizePayload(p) {
    const competition = String(p?.competition ?? "");
    const grouping = String(p?.grouping ?? "");
    const rows = Array.isArray(p?.rows) ? p.rows : [];
    const meta = p?.meta || {};
    return { competition, grouping, rows, meta };
  }

  function clearHost() {
    if (el.host) el.host.innerHTML = "";
  }

  function buildStrokeMark(n) {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num === 0) return "";

    // Display as superscript number (use minus for plus-handicaps / givebacks)
    const abs = Math.abs(num);
    const sign = num < 0 ? "−" : ""; // nicer minus
    return `<sup class="scStrokeSup" aria-label="strokes">${sign}${abs}</sup>`;
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
      html += "<tr>";
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

      let rowHtml = "<tr>";
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

  function formatDate(s) {
    if (!s) return "";
    // Try to parse YYYY-MM-DD or similar
    // Note: "2026-02-21" parses as UTC in JS Date usually, but we want local date parts.
    // Best to split string if ISO.
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s); // fallback
    }
    if (isNaN(d.getTime())) return s; // return original if invalid
    
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }); // Sat
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    
    return `${dayName} ${mm}/${dd}/${yy}`;
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
    const title = esc(gh.gameTitle || "Game");
    const courseName = esc(gh.courseName || "");
    const qrKey = String(gh.playerKey || "").trim();
    const ggid = esc(gh.GGID || "");

    // Header Line 2 Construction
    // 1) Date: dd mm/dd/yy (e.g. Sat 02/21/26)
    let dateStr = "";
    if (gh.playDate) {
      dateStr = formatDate(gh.playDate);
    }

    // 2) Tee Time
    const teeTime = group.teeTime ? esc(group.teeTime) : "";

    // 3) Starting Hole (implied from tee time usually, or explicit if we had it)
    const startHole = group.startHole ? `Hole ${esc(group.startHole)}` : "";

    // 4) HC Effectivity
    // This comes from game object in init, not group.
    const hcEff = game.dbGames_HCEffectivity || "";
    const hcDate = game.dbGames_HCEffectivityDate || "";
    let hcLabel = "";
    if (hcEff === "Date" && hcDate) hcLabel = `HC ${esc(hcDate)}`;
    else if (hcEff && hcEff !== "PlayDate") hcLabel = `HC ${esc(hcEff)}`;

    // Combine parts
    const parts = [courseName, dateStr, teeTime, startHole, hcLabel].filter(Boolean);
    const subLine = parts.join(" • ");

    // Header Line 3: Scoring System Details
    let scoringLine = "";
    const sys = String(game.dbGames_ScoringSystem || "").trim();
    
    if (sys === "BestBall") {
      const cnt = game.dbGames_BestBallCnt || "1";
      scoringLine = ` (${cnt}) Best Ball(s)`;
    } else if (sys === "DeclareHole") {
      // Format: H1:1, H2:2...
      try {
        const raw = JSON.parse(game.dbGames_HoleDeclaration || "[]");
        // Normalize to map: hole -> count
        const map = {};
        if (Array.isArray(raw)) {
          raw.forEach(r => { if (r && r.hole) map[r.hole] = r.count; });
        } else {
          // fallback if stored as object { "1": "2" }
          Object.assign(map, raw);
        }

        const pairs = [];
        // We'll iterate 1..18
        for (let h=1; h<=18; h++) {
          const val = map[h] ?? map[String(h)];
          if (val != null) pairs.push(`H${h}:${val}`);
        }
        if (pairs.length > 0) scoringLine = "Balls per Hole: " + pairs.join(" • ");
        else scoringLine = "Hole Declarations1";
      } catch (e) {
        scoringLine = "Hole Declarations2";
      }
    } else if (sys === "DeclarePlayer") {
      scoringLine = String(game.dbGames_PlayerDeclarations + "x (per Player)" || "Game Declarations");
    } else if (sys) {
      // Fallback for other systems (e.g. "Individual")
      scoringLine = sys;
    }


    // QR url contract (update later if your scoring URL differs)
    const qrUrl = qrKey && ggid
      ? `https://www.matchaid.net/scorekeeping?ggid=${encodeURIComponent(ggid)}&key=${encodeURIComponent(qrKey)}`
      : "";

      const scoreCardId = qrKey; // dbPlayers_PlayerKey (first player in group per your existing rule)

      return `
        <div class="scGroup ${densityClass}">
          <div class="scHdr">
            <div class="scHdr__left">

              <div class="scHdrTop">
                <img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
                <div class="scHdrText">
                  <div class="scHdr__title">${title}</div>
                  <div class="scHdr__sub">${subLine}</div>
                  ${scoringLine ? `<div class="scHdr__sub2">${esc(scoringLine)}</div>` : ""}
                </div>
              </div>

            </div>

            <div class="scHdr__right">
              <div class="scHdrRightText">
                <div class="scHdrLink">Live Scoring at www.matchaid.net/scorekeeping</div>
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
    console.log("[SCORECARDS] Rendering pages for rows:", rows.length);

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

  function onPrint() {
    try { window.print(); } catch (e) { /* ignore */ }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    
    const items = [
      { label: "Game Settings", action: "settings", params: { returnTo: "scorecard" } },
      { separator: true },
      { label: "Print", action: onPrint }
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  function applyChrome(payload) {
    const title = String(game.dbGames_Title || "Game");
    const course = String(game.dbGames_CourseName || "");
    const date = formatDate(game.dbGames_PlayDate);
    const subtitle = [course, date].filter(Boolean).join(" • ");

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Scorecard", title, subtitle]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Actions", onClick: openActionsMenu },
        right: { show: true, label: "Print", onClick: onPrint }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
        active: "summary",
        onNavigate: (id) => { if (typeof MA.routerGo === "function") MA.routerGo(id); }
      });
    }
  }

  function initPage() {
    try {
      //console.log("[SCORECARDS] Init payload:", init);
      const payload = normalizePayload(scorecards);
      payload.meta = init.meta || payload.meta || {};      
      if (!el.host) console.error("[SCORECARDS] DOM Error: #scHost element not found.");

      applyChrome(payload);
      renderPages(payload.rows || []);
      setStatus("Ready.", "success");

      const ap = qs("autoprint");
      if (String(ap || "") === "1") {
        setTimeout(onPrint, 250);
      }
    } catch (e) {
      console.error("[SCORECARDS_INIT_ERR]", e);
      setStatus("Failed to render scorecards.", "error");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPage);
  else initPage();
})();
