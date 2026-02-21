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
    printBtn: document.getElementById("scPrintBtn"),
    pillPlayers: document.getElementById("scPillPlayers"),
    pillHoles: document.getElementById("scPillHoles"),
    pillHC: document.getElementById("scPillHC"),
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

  function renderTable(group) {
    const courseRows = Array.isArray(group.courseInfo) ? group.courseInfo : [];
    const players = Array.isArray(group.players) ? group.players : [];
    
    const scoringMethod = String(game.dbGames_ScoringMethod || "").toUpperCase();
    const hcMethod = String(game.dbGames_HCMethod || "").toUpperCase();
    const isAdjGross = (scoringMethod === "ADJ GROSS");
    
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

    // Player rows (blank score entry cells; dots can be shown but cells blank)
    players.forEach((p) => {
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

      html += `<td class="scName">
        <div class="scPLine1">${esc(name)} ${hcText ? `<span class="scPHC">${esc(hcText)}</span>` : ""}</div>
        <div class="scPLine2">${esc(teeName)}</div>
      </td>`;
      // 1..9
      for (let h = 1; h <= 9; h++) {
        const v = p.strokes ? p.strokes["h" + h] : 0;
        html += `<td>${buildStrokeMark(v)}</td>`;
      }

      // Out
      html += `<td class="scMeta"></td>`;

      // 10..18
      for (let h = 10; h <= 18; h++) {
        const v = p.strokes ? p.strokes["h" + h] : 0;
        html += `<td>${buildStrokeMark(v)}</td>`;
      }

      // In + Tot
      html += `<td class="scMeta"></td><td class="scMeta"></td>`;
      html += "</tr>";
    });

    html += "</tbody></table>";
    return html;
  }

  function renderGroup(group) {
    const gh = group.gameHeader || {};
    const title = esc(gh.gameTitle || "Game");
    const courseName = esc(gh.courseName || "");
    const playDate = esc(gh.playDate || "");
    const holesPlayed = esc(gh.holesPlayed || "");
    const qrKey = String(gh.playerKey || "").trim();
    const ggid = esc(gh.GGID || "");

    // QR url contract (update later if your scoring URL differs)
    const qrUrl = qrKey && ggid
      ? `https://www.matchaid.net/scorekeeping?ggid=${encodeURIComponent(ggid)}&key=${encodeURIComponent(qrKey)}`
      : "";

      const scoreCardId = qrKey; // dbPlayers_PlayerKey (first player in group per your existing rule)

      return `
        <div class="scGroup">
          <div class="scHdr">
            <div class="scHdr__left">

              <div class="scHdrTop">
                <img class="scLogo" src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
                <div class="scHdrText">
                  <div class="scHdr__title">${title}</div>
                  <div class="scHdr__sub">${courseName}${playDate ? " • " + playDate : ""}${holesPlayed ? " • " + holesPlayed : ""}</div>
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

          ${renderTable(group)}
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
      ].filter(Boolean).join(" ");

      const year = new Date().getFullYear();

      return `
        <div class="scFooter">
          <div class="scFooterRow">
            <div class="scFooterBox">
              <div class="scFooterLabel">SCORER</div>
              <div class="scFooterLine"></div>
            </div>

            <div class="scFooterBox">
              <div class="scFooterLabel">ATTEST</div>
              <div class="scFooterLine"></div>
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

  function applyMeta(meta) {
    const players = Number(meta?.playerCount ?? 0);
    const holes = String(meta?.holes ?? meta?.holesPlayed ?? "—");
    const hcMethod = String(meta?.hcMethod ?? "—");

    if (el.pillPlayers) el.pillPlayers.textContent = `Players: ${Number.isFinite(players) ? players : "—"}`;
    if (el.pillHoles) el.pillHoles.textContent = `Holes: ${holes || "—"}`;
    if (el.pillHC) el.pillHC.textContent = `HC: ${hcMethod || "—"}`;
  }

  function onPrint() {
    try { window.print(); } catch (e) { /* ignore */ }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    
    const items = [
      { label: "Game Settings", action: "settings", params: { returnTo: "scorecards" } },
      { label: "Game Summary", action: "summary" },
      { separator: true },
      { label: "Print", action: onPrint }
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  function applyChrome(payload) {
    // Derive title/subtitle from the first group's header if available
    let title = "Game";
    if (payload && payload.rows && payload.rows.length > 0) {
       const gh = payload.rows[0].gameHeader || {};
       if (gh.gameTitle) title = gh.gameTitle;
    }

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["ADMIN PORTAL", "Scorecards", title]);
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
      console.log("[SCORECARDS] Init payload:", init);
      const payload = normalizePayload(scorecards);
      payload.meta = init.meta || payload.meta || {};      
      if (!el.host) console.error("[SCORECARDS] DOM Error: #scHost element not found.");

      applyChrome(payload);
      applyMeta(payload.meta || {});
      renderPages(payload.rows || []);
      setStatus("Ready.", "success");

      if (el.printBtn) el.printBtn.addEventListener("click", onPrint);

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
