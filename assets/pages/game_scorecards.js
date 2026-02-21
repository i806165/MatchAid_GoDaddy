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
  const init = window.__MA_INIT__ || window.__INIT__ || {};
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

  function buildDots(n) {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num === 0) return "";
    const dots = Math.min(Math.abs(num), 3); // visual cap for compactness
    const sign = num < 0 ? "-" : "";
    let html = '<div class="scDots" aria-label="strokes">';
    for (let i = 0; i < dots; i++) html += '<span class="scDot"></span>';
    html += sign ? `<span style="font-weight:800;margin-left:4px;">${sign}</span>` : "";
    html += "</div>";
    return html;
  }

  function renderTable(group) {
    const courseRows = Array.isArray(group.courseInfo) ? group.courseInfo : [];
    const players = Array.isArray(group.players) ? group.players : [];
    const holes = Array.from({ length: 18 }, (_, i) => i + 1);

    // Header row: Name + holes + totals (9a/9b/9c)
    let html = '<table class="scTable" role="table" aria-label="scorecard">';
    html += "<thead><tr>";
    html += '<th class="scName">Name</th>';
    holes.forEach((h) => (html += `<th>${h}</th>`));
    html += '<th class="scMeta">F9</th><th class="scMeta">B9</th><th class="scMeta">Tot</th>';
    html += "</tr></thead>";
    html += "<tbody>";

    // Course rows (Yards + optionally Par/HCP rows)
    courseRows.forEach((r) => {
      const label = esc(r.label || "");
      const tee = esc(r.tee || "");
      html += "<tr>";
      html += `<td class="scName">${label}${tee && label !== "Par" && label !== "HCP" ? " — " + tee : ""}</td>`;
      holes.forEach((h) => (html += `<td>${esc(r["h" + h] ?? "")}</td>`));
      html += `<td>${esc(r["9a"] ?? "")}</td><td>${esc(r["9b"] ?? "")}</td><td>${esc(r["9c"] ?? "")}</td>`;
      html += "</tr>";
    });

    // Player rows (blank score entry cells; dots can be shown but cells blank)
    players.forEach((p) => {
      html += "<tr>";
      html += `<td class="scName">${esc(p.playerName || "")}</td>`;
      holes.forEach((h) => {
        const v = p.strokes ? p.strokes["h" + h] : 0;
        // show dots but keep cell otherwise blank
        html += `<td>${buildDots(v)}</td>`;
      });
      html += "<td></td><td></td><td></td>";
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
    const summaryText = esc(gh.summaryText || "");
    const teeTime = esc(group.teeTime || "");
    const groupId = esc(group.groupId || "");
    const qrKey = String(gh.playerKey || "").trim();
    const ggid = esc(gh.GGID || "");

    // QR url contract (update later if your scoring URL differs)
    const qrUrl = qrKey && ggid ? `/scorekeeping/scorekeeping.php?ggid=${encodeURIComponent(ggid)}&key=${encodeURIComponent(qrKey)}` : "";

    return `
      <div class="scGroup">
        <div class="scHdr">
          <div class="scHdr__left">
            <div class="scHdr__title">${title}</div>
            <div class="scHdr__sub">${courseName}${playDate ? " • " + playDate : ""}${teeTime ? " • " + teeTime : ""}${holesPlayed ? " • " + holesPlayed : ""}${groupId ? " • " + groupId : ""}</div>
            ${summaryText ? `<div class="scHdr__sub">${summaryText}</div>` : ""}
          </div>
          <div class="scHdr__right">
            <div class="scQR">${qrUrl ? `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}">` : ""}</div>
          </div>
        </div>
        ${renderTable(group)}
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
      const payload = normalizePayload(init);
      
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
