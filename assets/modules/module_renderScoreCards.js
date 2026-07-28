/* /assets/modules/module_renderScoreCards.js
 * MA.renderScoreCards — self-hydrating scorecard rendering module.
 *
 * Extracted from scorecardShared.js. Reusable by any host page
 * (Game/Group/Player Scorecards, Event Scorecards) via the standard
 * mount() contract already established by module_sourceFavorites.js
 * and friends.
 *
 * Public API:
 *   MA.renderScoreCards.mount(cfg)
 *
 * mount() cfg:
 *   hostEl        {HTMLElement}  required. Renders scorecard group cards
 *                                (.maPanel__body-equivalent — module does
 *                                NOT render its own outer card/panel shell,
 *                                host page owns that).
 *   controlsEl    {HTMLElement}  required. Renders KPI value-mode pills
 *                                (.maChoiceChips) + expand/collapse toggle.
 *   footerEl      {HTMLElement}  optional. Renders hint text.
 *   ggid          {string}       required. Game id to hydrate/render.
 *   mode          {string}       "game" | "group" | "player" (default "game").
 *                                Event Scorecards always passes "game".
 *   scope         {string}       playerGHIN scope for group/player modes.
 *   initialData   {object}       optional. A pre-hydrated payload in the
 *                                exact shape initSharedScoreCard.php /
 *                                initEventScorecard.php return. When
 *                                present, mount() skips the network call
 *                                entirely — used for first-paint on pages
 *                                that server-bake their initial round
 *                                (both Game pages and Event Scorecards'
 *                                first-load round).
 *   apiPath       {string}       endpoint to self-fetch from when
 *                                initialData is absent (round switches).
 *
 * Behavior contract:
 *   - Instances are keyed on hostEl via WeakMap — safe to mount multiple
 *     independent scorecard instances on one page (not currently needed —
 *     only one round is ever shown at a time — but costs nothing and
 *     matches the established module convention).
 *   - A mount() call with a DIFFERENT ggid than the instance's current one
 *     is a full reset: card expand/collapse state, segment furl state,
 *     value mode, and any open drawer are all cleared before the new
 *     round's cards render. (Round switch = reset, not persist — decided
 *     explicitly, not a default.)
 *   - A mount() call with the SAME ggid re-applies live cfg refs (e.g. a
 *     new footerEl) and re-renders from existing state, same as
 *     module_sourceFavorites.js's "already initialized" branch.
 *
 * Dependencies:
 *   ma_shared.js loaded first (MA.postJson, MA.ui).
 *   All classes/tokens used here come from ma_shared.css — see the
 *   accompanying CSS pass (.maChoiceChip, .maCard, .maTable, .isHidden,
 *   .maModalOverlay/.maModal) plus this module's own small,
 *   scorecard-specific CSS (.scCell/.scCellVal/shape classes, .scTable
 *   row/column semantics) which has no shared equivalent and isn't
 *   expected to.
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.renderScoreCards = MA.renderScoreCards || {};

  // ── WeakMap sticky state — keyed on hostEl ──────────────────────────────
  const _states = new WeakMap();

  // ── Utilities ────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function formatDate(s) {
    if (!s) return "";
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(...s.split("-").map((n, i) => (i === 1 ? n - 1 : n)))
      : new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function ensureCardState(st, groupId) {
    if (!st.cardStates[groupId]) {
      st.cardStates[groupId] = { expanded: true, teamExpanded: false, furledSegments: {} };
    }
    return st.cardStates[groupId];
  }

  function activeRows(st) {
    return Array.isArray(st.payload?.scorecards?.rows) ? st.payload.scorecards.rows : [];
  }

  function getSegmentForHole(st, h, row) {
    const seg = String(st.game.dbGames_Segments || "9");
    if (seg === "None") return "tot";

    const size = parseInt(seg, 10);
    const visibleHoles = Array.isArray(row?.visibleHoles) && row.visibleHoles.length
      ? row.visibleHoles.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : null;

    if (!visibleHoles) return "s" + Math.ceil(h / size);

    const idx = visibleHoles.indexOf(Number(h));
    if (idx < 0) return "s1";
    return "s" + (Math.floor(idx / size) + 1);
  }

  function getSegmentConfig(st, row) {
    const segStr = String(st.game.dbGames_Segments || "9");
    const holesStr = String(st.game.dbGames_Holes || "All 18");
    const size = (segStr === "None") ? 18 : parseInt(segStr, 10);
    const prefix = (size === 18) ? "9" : String(size);

    let fallbackStart = 1;
    let fallbackEnd = 18;
    if (holesStr === "F9") fallbackEnd = 9;
    if (holesStr === "B9") fallbackStart = 10;

    let holes = Array.isArray(row?.visibleHoles) && row.visibleHoles.length
      ? row.visibleHoles.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      : [];

    if (!holes.length) {
      holes = [];
      for (let h = fallbackStart; h <= fallbackEnd; h++) holes.push(h);
    }

    const start = holes[0];
    const end = holes[holes.length - 1];
    const hasTot = (size === 9 && holes.length > 9);

    return { size, prefix, hasTot, start, end, holes };
  }

  // ── Controls (KPI pills + expand/collapse) ──────────────────────────────

  function renderControls(st) {
    if (!st.controlsEl) return;
    const payload = st.payload?.scorecards || {};
    const supportsPoints = !!payload.meta?.supportsPoints;

    const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const icon = st.globalExpanded ? iconMinus : iconPlus;

    const modes = [
      ["gross", "Gross"], ["net", "Net"], ["grossDiff", "Gross +/-"], ["netDiff", "Net +/-"],
    ].concat(supportsPoints ? [["points", "Points"]] : []);

    st.controlsEl.innerHTML = `
      <div class="maCanvasControls">
        <button id="scGlobalToggle" class="iconBtn btnSecondary" type="button" title="Toggle All Cards">${icon}</button>
        <div class="maCanvasControls__right">
          <div class="maChoiceChips">
            ${modes.map(([key, label]) =>
              `<button class="maChoiceChip ${st.valueMode === key ? "is-selected" : ""}" type="button" data-mode="${key}">${label}</button>`
            ).join("")}
          </div>
        </div>
      </div>`;

    st.controlsEl.querySelector("#scGlobalToggle")?.addEventListener("click", () => toggleAllCards(st));
    st.controlsEl.querySelectorAll("[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => {
        st.valueMode = btn.dataset.mode;
        renderBody(st);
        renderControls(st);
      })
    );
  }

  function renderFooter(st) {
    if (!st.footerEl) return;
    st.footerEl.innerHTML = `<span class="maHintText">Toggle values and expand details below.</span>`;
  }

  function toggleAllCards(st) {
    st.globalExpanded = !st.globalExpanded;
    activeRows(st).forEach((row) => {
      const s = ensureCardState(st, row.groupId || row.rowId || row.virtualPlayerKey || row.pairingID || row.flightID || "row");
      s.expanded = st.globalExpanded;
    });
    renderBody(st);
    renderControls(st);
  }

  // ── Cell / row rendering ─────────────────────────────────────────────────

  function renderSummaryCell(st, cardState, rowData, key, segmentId, options = {}) {
    const classes = ["scMeta", "scMetaCol"];
    if (key !== "9c") classes.push("scMetaCol--minor");

    let val = "";
    if (options.isHeader) {
      if (key === "9a") val = "Out";
      else if (key === "9b") val = "In";
      else if (key === "9c") val = "Tot";
      else val = "S" + (key.charCodeAt(1) - 96);
    } else if (options.isPlayer) {
      val = totalForPlayer(st, rowData, key);
    } else {
      const cell = rowData[key] ?? rowData.cells?.[key];
      let summaryMode = st.valueMode;
      if (options.isTotal) {
        if (summaryMode === "gross") summaryMode = "grossDiff";
        if (summaryMode === "net") summaryMode = "netDiff";
      }
      val = (cell && typeof cell === "object") ? (cell.display?.[summaryMode] ?? "-") : (cell ?? "-");
    }

    const tag = options.isHeader ? "th" : "td";
    const dSeg = (key !== "9c") ? `data-segment="${segmentId}"` : "";
    return `<${tag} class="${classes.join(" ")}" ${dSeg}>${esc(val)}</${tag}>`;
  }

  function renderUnifiedRow(st, cardState, rowData, options = {}) {
    const rowContext = options.row || rowData || {};
    const seg = getSegmentConfig(st, rowContext);
    let html = "";

    seg.holes.forEach((h, idx) => {
      const sId = getSegmentForHole(st, h, rowContext);
      const furled = cardState.furledSegments[sId];
      const furledCls = furled ? "isHidden" : "";

      if (options.isHeader) {
        html += `<th class="${furledCls}" data-segment="${sId}">${h}</th>`;
      } else if (options.isCourse) {
        html += `<td class="${furledCls}">${esc(rowData["h" + h] ?? "")}</td>`;
      } else if (options.isPlayer) {
        html += renderPlayerCell(st, rowData, h, false, cardState, rowContext);
      } else if (options.isTotal) {
        html += renderPlayerCell(st, rowData, h, true, cardState, rowContext);
      } else if (options.isStroke) {
        html += `<td class="${furledCls}">${esc(String(rowData.holes?.["h" + h]?.strokeMarks || ""))}</td>`;
      }

      const isSegEnd = (((idx + 1) % seg.size) === 0);
      const isRangeEnd = (idx === seg.holes.length - 1);

      if (isSegEnd || isRangeEnd) {
        let key;
        if (seg.size === 18 && isRangeEnd) {
          key = "9c";
        } else if (seg.size === 18) {
          const segIndex = Math.floor(idx / seg.size) + 1;
          key = "9" + String.fromCharCode(96 + segIndex);
        } else {
          const segStartHole = seg.holes[Math.floor(idx / seg.size) * seg.size];
          const segIndex = Math.floor((segStartHole - 1) / seg.size) + 1;
          key = String(seg.size) + String.fromCharCode(96 + segIndex);
        }
        html += renderSummaryCell(st, cardState, rowData, key, sId, options);
      }
    });

    if (seg.hasTot) html += renderSummaryCell(st, cardState, rowData, "9c", "tot", options);
    return html;
  }

  function buildCourseRows(st, courseRows, cardState, row) {
    return (courseRows || []).map((r) => {
      return `<tr><td class="scName" data-action="toggle-all-segments">${esc(r.label)}${r.tee && !["Par", "HCP"].includes(r.label) ? " — " + esc(r.tee) : ""}</td>
        ${renderUnifiedRow(st, cardState, r, { isCourse: true, row })}
      </tr>`;
    }).join("");
  }

  function valueForCell(st, cell) { return cell?.display?.[st.valueMode] ?? ""; }
  function totalForPlayer(st, player, key) { return player?.totals?.[st.valueMode]?.[key] ?? ""; }

  function groupPlayersByPairing(players) {
    const groups = [];
    let currentPairingId = null;
    let currentPlayers = [];

    (players || []).forEach((p) => {
      const pairingId = String(p.pairingID || p.effectivePairingID || p.dbPlayers_PairingID || "").trim() || "000";
      if (currentPairingId === null) currentPairingId = pairingId;
      if (pairingId !== currentPairingId) {
        groups.push({ pairingId: currentPairingId, players: currentPlayers });
        currentPairingId = pairingId;
        currentPlayers = [];
      }
      currentPlayers.push(p);
    });

    if (currentPlayers.length) groups.push({ pairingId: currentPairingId, players: currentPlayers });
    return groups;
  }

  function totalsForPairing(totals, pairingId) {
    const wanted = String(pairingId).trim();
    return (totals || []).filter((row) => {
      const rowPairingId = String(row?.pairingID || "").trim();
      if (rowPairingId) return rowPairingId === wanted;
      const needle = `PAIR ${wanted}`;
      return String(row?.label || "").includes(needle);
    });
  }

  function renderPairingBlock(st, pairingId, players, totals, cardState, row) {
    const playerHtml = renderPlayerRows(st, players, cardState, row);
    if (st.mode === "player") return playerHtml;
    const pairingTotals = totalsForPairing(totals, pairingId);
    const totalsHtml = renderTotalRows(st, pairingTotals, cardState, row);
    return playerHtml + totalsHtml;
  }

  function renderPlayerRows(st, players, cardState, row) {
    return (players || []).map((p) => {
      const main = `<tr><td class="scName" data-action="toggle-all-segments"><div class="scPLine1">${esc(p.playerName)} <span class="scPHC">${esc(p.playerHC ? "(" + p.playerHC + ")" : "")}</span></div><div class="scPLine2">${esc(p.tee || "")}</div></td>${renderUnifiedRow(st, cardState, p, { isPlayer: true, isPlayerRow: true, row })}</tr>`;
      const detail = `<tr class="scDetailRow ${cardState.teamExpanded ? "" : "isHidden"}"><td class="scName" data-action="toggle-all-segments">Stroke Marks</td>
        ${renderUnifiedRow(st, cardState, p, { isStroke: true, row })}
      </tr>`;
      return main + detail;
    }).join("");
  }

  function renderPlayerCell(st, player, holeNumber, isTotal = false, cardState = {}, rowContext = null) {
    const furled = cardState.furledSegments?.[getSegmentForHole(st, holeNumber, rowContext)];
    const furledCls = furled ? "isHidden" : "";

    if (isTotal) {
      const cell = player?.["h" + holeNumber];
      let totalMode = st.valueMode;
      if (totalMode === "gross") totalMode = "grossDiff";
      if (totalMode === "net") totalMode = "netDiff";
      const val = (cell && typeof cell === "object") ? (cell.display?.[totalMode] ?? "-") : (cell ?? "-");
      return `<td class="${furledCls}"><div class="scCell scCell--total"><span class="scCellVal">${esc(val)}</span></div></td>`;
    }

    const cell = player?.holes?.["h" + holeNumber] || {};
    const classes = ["scCell"];
    if (cell.declared) classes.push("scCell--declared");

    let sm = st.valueMode;
    if (sm === "grossDiff") sm = "gross";
    if (sm === "netDiff") sm = "net";
    const shape = cell.shapes?.[sm] || cell.shape;
    if (shape && shape !== "par") classes.push("scCell--" + shape);

    return `<td class="${furledCls}"><div class="${classes.join(" ")}"><span class="scCellVal">${esc(valueForCell(st, cell))}</span>${cell.strokeMarks ? `<span class="scCellMarks">${esc(String(cell.strokeMarks))}</span>` : ""}</div></td>`;
  }

  function renderTotalRows(st, totals, cardState, parentRow) {
    const kpiLabel =
      st.valueMode === "gross" ? "GROSS" :
      st.valueMode === "net" ? "NET" :
      st.valueMode === "grossDiff" ? "GROSS +/-" :
      st.valueMode === "netDiff" ? "NET +/-" :
      st.valueMode === "points" ? "POINTS" : "";

    return (totals || []).map((row) => {
      const label = `${row.label} ${kpiLabel}`.trim();
      return `<tr class="maTable__totalRow">
        <td class="scName" data-action="toggle-all-segments">${esc(label)}</td>
        ${renderUnifiedRow(st, cardState, row.cells, { isTotal: true, row: parentRow })}
      </tr>`;
    }).join("");
  }

  function renderPlayerAndTotalRowsByPairing(st, row, cardState) {
    const groups = groupPlayersByPairing(row.players || []);
    return groups.map((group) =>
      renderPairingBlock(st, group.pairingId, group.players, row.columnTotals || [], cardState, row)
    ).join("");
  }

  function renderHeaderRow(st, cardState, row) {
    return `<thead><tr><th class="scName" data-action="toggle-all-segments">HOLE</th>${renderUnifiedRow(st, cardState, {}, { isHeader: true, row })}</tr></thead>`;
  }

  function getCardSummaryTitle(row) {
    const names = (row.players || []).map((p) => {
      const parts = String(p.playerName || "").split(/\s+/);
      return parts[parts.length - 1] || "";
    }).filter(Boolean).join(" • ");

    const playerKey = row.gameHeader?.playerKey || row.groupId || "";
    const pairingIDs = Array.isArray(row.pairingIDs) ? row.pairingIDs.filter(Boolean) : [];
    const flightIDs = Array.isArray(row.flightIDs) ? row.flightIDs.filter(Boolean) : [];
    const isPairPair = String(row.gameHeader?.dbGames_Competition || "").trim() === "PairPair";

    const parts = [];
    if (playerKey) parts.push(`Card ${playerKey}`);
    if (isPairPair && flightIDs.length) parts.push(`Match ${flightIDs.join(", ")}`);
    if (pairingIDs.length) parts.push(`Pairings ${pairingIDs.join(", ")}`);

    return `${parts.join(" • ")}: ${names}`;
  }

  function getSpinText(row) {
    const label = String(row?.spinLabel || "").trim();
    const start = Number(row?.spinStartHole || 0);
    const end = Number(row?.spinEndHole || 0);
    if (!label || label === "Round") return "";
    if (start > 0 && end > 0) return `${label} • Holes ${start}-${end}`;
    return label;
  }

  // ── Main card render ─────────────────────────────────────────────────────

  function renderCard(st, row) {
    const gid = row.groupId || row.rowId || row.virtualPlayerKey || row.pairingID || row.flightID || "row";
    const cardState = ensureCardState(st, gid);

    const playerKey = row.gameHeader?.playerKey || row.groupId || "";
    const pairingIDs = Array.isArray(row.pairingIDs) ? row.pairingIDs.filter(Boolean) : [];
    const flightIDs = Array.isArray(row.flightIDs) ? row.flightIDs.filter(Boolean) : [];
    const isPairPair = String(row.gameHeader?.dbGames_Competition || "").trim() === "PairPair";

    const titleParts = [];
    if (st.mode === "player") {
      titleParts.push((row.players && row.players[0]?.playerName) || "Player Scorecard");
    } else {
      if (playerKey) titleParts.push(`ScoreCard ${playerKey}`);
      if (isPairPair && flightIDs.length) titleParts.push(`Match ${flightIDs.join(", ")}`);
      if (pairingIDs.length) titleParts.push(`Pairings ${pairingIDs.join(", ")}`);
    }

    const spinText = getSpinText(row);
    const headerText = [...titleParts, spinText, row.teeTime].filter(Boolean).join(" • ");
    const summaryTitle = [getCardSummaryTitle(row), spinText].filter(Boolean).join(" • ");

    const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconZoom = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

    // Card shell: .maCard tokens (border/radius/bg) apply via CSS; scGroupCard
    // supplies only the dual expand/collapsed-header behavior maCard doesn't have.
    return `<section class="maCard scGroupCard ${cardState.expanded ? "" : "is-collapsed"}" data-groupid="${esc(gid)}">
      <div class="maCard__hdr scGroupCard__hdr scGroupCard__hdr--expanded">
        <div class="scGroupCard__titleRow">
          <button class="iconBtn btnSecondary" type="button" data-card-toggle="${esc(gid)}" title="Collapse Card">${iconMinus}</button>
          <div class="scGroupCard__title">${esc(headerText)}</div>
        </div>
        <button class="iconBtn btnSecondary" type="button" data-drawer-open="${esc(gid)}" title="View transposed scorecard" aria-label="Open full scorecard drawer">${iconZoom}</button>
      </div>

      <div class="maCard__hdr scGroupCard__hdr scGroupCard__hdr--collapsed">
        <div class="scGroupCard__titleRow">
          <button class="iconBtn btnSecondary" type="button" data-card-toggle="${esc(gid)}" title="Expand Card">${iconPlus}</button>
          <div class="scGroupCard__title">${esc(summaryTitle)}</div>
        </div>
        <button class="iconBtn btnSecondary" type="button" data-drawer-open="${esc(gid)}" title="View transposed scorecard" aria-label="Open full scorecard drawer">${iconZoom}</button>
      </div>

      <div class="maCard__body scGroupCard__body">
        <div class="scGroup scDenseA"><table class="maTable scTable" role="table" aria-label="scorecard">${renderHeaderRow(st, cardState, row)}<tbody>${buildCourseRows(st, row.courseInfo, cardState, row)}${renderPlayerAndTotalRowsByPairing(st, row, cardState)}</tbody></table></div>
      </div>
    </section>`;
  }

  // ── Drawer (transposed / pivoted scorecard) ─────────────────────────────
  // .maModalOverlay / .maModal — a centered dialog, NOT .maDrawer (confirmed
  // against ma_shared.css: .maModal is rounded on all corners / centered,
  // .maDrawer is bottom-anchored / flat-bottomed — they're visually distinct
  // components and this one is genuinely a modal). No drag handle: it implied
  // a swipe-to-dismiss gesture the component never actually wired, and would
  // be a UX lie on a centered dialog with no edge to swipe toward anyway.
  // Fully page-agnostic — appends to document.body, no page-specific state.

  function buildCourseInfoMap(courseInfo) {
    const map = {};
    (courseInfo || []).forEach((r) => {
      const label = String(r.label || "").trim();
      for (let h = 1; h <= 18; h++) {
        const v = r["h" + h];
        if (v === undefined || v === null || v === "") continue;
        if (!map[h]) map[h] = {};
        if (label === "Par") map[h].par = v;
        else if (label === "HCP") map[h].hcp = v;
      }
    });
    return map;
  }

  function segKeyForBoundary(idx, seg) {
    if (seg.size === 18) return "9c";
    const segStartHole = seg.holes[Math.floor(idx / seg.size) * seg.size];
    const segIndex = Math.floor((segStartHole - 1) / seg.size) + 1;
    return String(seg.size) + String.fromCharCode(96 + segIndex);
  }

  function segKeyLabel(key) {
    if (key === "9a") return "Out";
    if (key === "9b") return "In";
    if (key === "9c") return "Tot";
    return "S" + (key.charCodeAt(1) - 96);
  }

  function transposedPlayerCell(st, player, h) {
    const cell = player?.holes?.["h" + h] || {};
    const classes = ["scCell"];
    if (cell.declared) classes.push("scCell--declared");
    let sm = st.valueMode;
    if (sm === "grossDiff") sm = "gross";
    if (sm === "netDiff") sm = "net";
    const shape = cell.shapes?.[sm] || cell.shape;
    if (shape && shape !== "par") classes.push("scCell--" + shape);
    const val = valueForCell(st, cell);
    const marks = cell.strokeMarks ? `<span class="scCellMarks">${esc(String(cell.strokeMarks))}</span>` : "";
    return `<td><div class="${classes.join(" ")}"><span class="scCellVal">${esc(val)}</span>${marks}</div></td>`;
  }

  function transposedTotalCell(st, totalRow, h) {
    const cell = totalRow?.cells?.["h" + h];
    let totalMode = st.valueMode;
    if (totalMode === "gross") totalMode = "grossDiff";
    if (totalMode === "net") totalMode = "netDiff";
    const val = (cell && typeof cell === "object") ? (cell.display?.[totalMode] ?? "-") : (cell ?? "-");
    return `<td class="maTable__totalRow">${esc(val)}</td>`;
  }

  function transposedPlayerSegCell(st, player, key) {
    return `<td>${esc(totalForPlayer(st, player, key))}</td>`;
  }

  function transposedTotalSegCell(st, totalRow, key) {
    const cell = totalRow?.cells?.[key] ?? totalRow?.[key];
    let summaryMode = st.valueMode;
    if (summaryMode === "gross") summaryMode = "grossDiff";
    if (summaryMode === "net") summaryMode = "netDiff";
    const val = (cell && typeof cell === "object") ? (cell.display?.[summaryMode] ?? "-") : (cell ?? "-");
    return `<td class="maTable__totalRow">${esc(val)}</td>`;
  }

  function renderTransposedCard(st, row) {
    const gid = row.groupId || row.rowId || row.virtualPlayerKey || row.pairingID || row.flightID || "row";
    const seg = getSegmentConfig(st, row);
    const courseMap = buildCourseInfoMap(row.courseInfo);
    const groups = groupPlayersByPairing(row.players || []);
    const allColumnTotals = row.columnTotals || [];

    const kpiLabel =
      st.valueMode === "gross" ? "GROSS" :
      st.valueMode === "net" ? "NET" :
      st.valueMode === "grossDiff" ? "GROSS +/-" :
      st.valueMode === "netDiff" ? "NET +/-" :
      st.valueMode === "points" ? "POINTS" : "";

    let headerCols = "";
    groups.forEach((group) => {
      group.players.forEach((p) => {
        headerCols += `<th>${esc(p.playerName)}<span class="scTHdrSub">${esc(p.playerHC ? "(" + p.playerHC + ")" : "")} ${esc(p.tee || "")}</span></th>`;
      });
      if (st.mode !== "player") {
        const pairingTotals = totalsForPairing(allColumnTotals, group.pairingId);
        pairingTotals.forEach((t) => {
          const label = `${t.label} ${kpiLabel}`.trim();
          const totalIdx = label.indexOf("TOTAL");
          const totalPre = totalIdx > 0 ? label.slice(0, totalIdx).trim() : "";
          const totalPost = label.slice(totalIdx + 5).trim();
          headerCols += `<th class="scTTotalCol">${esc(totalPost)}<span class="scTHdrSub">${esc(totalPre)}</span></th>`;
        });
      }
    });

    const thead = `<thead><tr><th class="scTHoleCol">Hole</th>${headerCols}</tr></thead>`;

    let tbodyRows = "";
    seg.holes.forEach((h, idx) => {
      const cm = courseMap[h] || {};
      const parVal = cm.par !== undefined ? `Par ${cm.par}` : "";
      const hcpVal = cm.hcp !== undefined ? `(${cm.hcp})` : "";
      const metaLine = [parVal, hcpVal].filter(Boolean).join(" · ");

      let holeCols = "";
      groups.forEach((group) => {
        group.players.forEach((p) => { holeCols += transposedPlayerCell(st, p, h); });
        if (st.mode !== "player") {
          const pairingTotals = totalsForPairing(allColumnTotals, group.pairingId);
          pairingTotals.forEach((t) => { holeCols += transposedTotalCell(st, t, h); });
        }
      });

      tbodyRows += `<tr>
        <td class="scTHoleCol"><div class="scTHoleNum">${esc(String(h))}</div><div class="scTHoleMeta">${esc(metaLine)}</div></td>
        ${holeCols}
      </tr>`;

      const isSegEnd = (((idx + 1) % seg.size) === 0);
      const isRangeEnd = (idx === seg.holes.length - 1);

      if (isSegEnd || isRangeEnd) {
        const key = segKeyForBoundary(idx, seg);
        const label = segKeyLabel(key);
        const segPar = (() => {
          const startIdx = Math.floor(idx / seg.size) * seg.size;
          let total = 0; let valid = true;
          for (let i = startIdx; i <= idx; i++) {
            const p = courseMap[seg.holes[i]]?.par;
            if (p === undefined) { valid = false; break; }
            total += Number(p);
          }
          return valid ? `Par ${total}` : "";
        })();

        let segCols = "";
        groups.forEach((group) => {
          group.players.forEach((p) => { segCols += transposedPlayerSegCell(st, p, key); });
          if (st.mode !== "player") {
            const pairingTotals = totalsForPairing(allColumnTotals, group.pairingId);
            pairingTotals.forEach((t) => { segCols += transposedTotalSegCell(st, t, key); });
          }
        });

        tbodyRows += `<tr class="scTSegTotal">
          <td class="scTHoleCol"><div class="scTHoleNum">${esc(label)}</div><div class="scTHoleMeta">${esc(segPar)}</div></td>
          ${segCols}
        </tr>`;
      }
    });

    if (seg.hasTot) {
      const totPar = (() => {
        let total = 0; let valid = true;
        seg.holes.forEach((h) => {
          const p = courseMap[h]?.par;
          if (p === undefined) valid = false; else total += Number(p);
        });
        return valid ? `Par ${total}` : "";
      })();

      let totCols = "";
      groups.forEach((group) => {
        group.players.forEach((p) => { totCols += transposedPlayerSegCell(st, p, "9c"); });
        if (st.mode !== "player") {
          const pairingTotals = totalsForPairing(allColumnTotals, group.pairingId);
          pairingTotals.forEach((t) => { totCols += transposedTotalSegCell(st, t, "9c"); });
        }
      });

      tbodyRows += `<tr class="scTSegTotal">
        <td class="scTHoleCol"><div class="scTHoleNum">Tot</div><div class="scTHoleMeta">${esc(totPar)}</div></td>
        ${totCols}
      </tr>`;
    }

    const payload = st.payload?.scorecards || {};
    const supportsPoints = !!payload.meta?.supportsPoints;
    const modes = [["gross", "Gross"], ["net", "Net"], ["grossDiff", "Gross +/-"], ["netDiff", "Net +/-"]]
      .concat(supportsPoints ? [["points", "Points"]] : []);
    const pillsHtml = modes.map(([key, label]) =>
      `<button class="maChoiceChip ${st.valueMode === key ? "is-selected" : ""}" type="button" data-drawer-mode="${key}">${esc(label)}</button>`
    ).join("");

    const spinText = getSpinText(row);
    const subtitle = [st.game.dbGames_CourseName, formatDate(st.game.dbGames_PlayDate)].filter(Boolean).join(" • ");

    const playerKey = row.gameHeader?.playerKey || row.groupId || "";
    const pairingIDs = Array.isArray(row.pairingIDs) ? row.pairingIDs.filter(Boolean) : [];
    const flightIDs = Array.isArray(row.flightIDs) ? row.flightIDs.filter(Boolean) : [];
    const isPairPair = String(row.gameHeader?.dbGames_Competition || "").trim() === "PairPair";
    const titleParts = [];
    if (st.mode === "player") {
      titleParts.push((row.players && row.players[0]?.playerName) || "Player Scorecard");
    } else {
      if (playerKey) titleParts.push(`ScoreCard ${playerKey}`);
      if (isPairPair && flightIDs.length) titleParts.push(`Match ${flightIDs.join(", ")}`);
      if (pairingIDs.length) titleParts.push(`Pairings ${pairingIDs.join(", ")}`);
    }
    const drawerTitle = [...titleParts, spinText].filter(Boolean).join(" • ");

    return `<div class="maModalOverlay" id="scModal-${esc(gid)}" role="dialog" aria-modal="true" aria-label="${esc(drawerTitle)}">
      <section class="maModal">
        <header class="maModal__hdr">
          <div>
            <div class="maModal__title">${esc(playerKey ? `ScoreCard ${playerKey}` : "ScoreCard")}</div>
            <div class="maModal__subtitle">${esc(subtitle)}</div>
          </div>
          <button class="iconBtn btnSecondary" type="button" data-drawer-close="${esc(gid)}" aria-label="Close scorecard view">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="maModal__controls">
          <div class="maChoiceChips">${pillsHtml}</div>
        </div>
        <div class="maModal__body maModal__body--flush">
          <table class="maTable scTTable" role="table" aria-label="Transposed scorecard">
            ${thead}
            <tbody>${tbodyRows}</tbody>
          </table>
        </div>
      </section>
    </div>`;
  }

  function openDrawer(st, gid) {
    document.getElementById("scModal-" + gid)?.remove();

    const row = activeRows(st).find((r) =>
      String(r.groupId || r.rowId || r.virtualPlayerKey || r.pairingID || r.flightID || "row") === String(gid)
    );
    if (!row) return;

    const el = document.createElement("div");
    el.innerHTML = renderTransposedCard(st, row);
    const overlay = el.firstElementChild;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.documentElement.classList.add("maOverlayOpen");

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDrawer(gid); });

    overlay.querySelectorAll("[data-drawer-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        st.valueMode = btn.dataset.drawerMode;
        renderControls(st);
        renderBody(st);
        closeDrawer(gid);
        openDrawer(st, gid);
      });
    });

    overlay.querySelectorAll("[data-drawer-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeDrawer(btn.dataset.drawerClose));
    });
  }

  function closeDrawer(gid) {
    const overlay = document.getElementById("scModal-" + gid);
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    if (!document.querySelector(".maModalOverlay.is-open, .maDrawerOverlay.is-open")) {
      document.documentElement.classList.remove("maOverlayOpen");
    }
  }

  // ── Bind card interactions ──────────────────────────────────────────────

  function bindCardActions(st) {
    st.hostEl.querySelectorAll("[data-card-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const s = ensureCardState(st, btn.dataset.cardToggle);
        s.expanded = !s.expanded;
        renderBody(st);
      })
    );

    st.hostEl.querySelectorAll("[data-drawer-open]").forEach((btn) =>
      btn.addEventListener("click", () => openDrawer(st, btn.dataset.drawerOpen))
    );

    st.hostEl.querySelectorAll(".scGroupCard").forEach((card) => {
      const gid = card.dataset.groupid;
      const s = ensureCardState(st, gid);

      card.querySelectorAll("[data-segment]").forEach((th) => {
        th.addEventListener("click", () => {
          const segId = th.dataset.segment;
          s.furledSegments[segId] = !s.furledSegments[segId];
          renderBody(st);
        });
      });

      card.querySelectorAll('[data-action="toggle-all-segments"]').forEach((el) => {
        el.addEventListener("click", () => {
          const row = activeRows(st).find((r) =>
            String(r.groupId || r.rowId || r.virtualPlayerKey || r.pairingID || r.flightID || "row") === String(gid)
          ) || null;
          const cfg = getSegmentConfig(st, row);
          const numSegs = Math.ceil(cfg.holes.length / cfg.size);
          const segs = [];
          for (let i = 0; i < numSegs; i++) segs.push("s" + (i + 1));
          const anyOn = segs.some((id) => s.furledSegments[id]);
          segs.forEach((id) => { s.furledSegments[id] = !anyOn; });
          renderBody(st);
        });
      });
    });
  }

  function renderBody(st) {
    if (!st.hostEl) return;
    const rows = activeRows(st);

    if (st.loading) {
      st.hostEl.innerHTML = `<div class="maEmptyState">Loading scorecards…</div>`;
      return;
    }
    if (st.error) {
      st.hostEl.innerHTML = `<div class="maEmptyState">Unable to load scorecards.</div>`;
      return;
    }
    if (!rows.length) {
      st.hostEl.innerHTML = `<div class="maEmptyState">No scorecards available.</div>`;
      return;
    }

    st.hostEl.innerHTML = rows.map((row) => renderCard(st, row)).join("");
    bindCardActions(st);
  }

  // ── State lifecycle ──────────────────────────────────────────────────────

  function _initState(hostEl, cfg) {
    // Make the host focusable so keyboard scroll (arrows, space, page
    // up/down) actually targets it — browsers only route keyboard scroll
    // to an element that is, or contains, the current focus. Done here
    // once per instance rather than in CSS/markup, since hostEl is
    // whatever container the host page created and handed in — this way
    // it works regardless of which page mounts the module.
    if (!hostEl.hasAttribute("tabindex")) hostEl.setAttribute("tabindex", "0");

    const st = {
      hostEl,
      controlsEl: cfg.controlsEl || null,
      footerEl: cfg.footerEl || null,
      apiPath: cfg.apiPath || "",
      ggid: "",
      mode: "game",
      scope: "",
      game: {},
      payload: null,
      loading: false,
      error: false,
      valueMode: "gross",
      globalExpanded: true,
      cardStates: {},
    };
    _states.set(hostEl, st);
    return st;
  }

  function _resetState(st, cfg) {
    st.mode = String(cfg.mode || "game").toLowerCase();
    st.scope = String(cfg.scope || "");
    st.valueMode = "gross";
    st.globalExpanded = true;
    st.cardStates = {};
    st.error = false;
    // Close any drawer left open from the previous round — its ids are
    // scoped to the previous round's groupIds and would otherwise leak.
    document.querySelectorAll(".maModalOverlay").forEach((el) => el.remove());
    document.documentElement.classList.remove("maOverlayOpen");
  }

  async function _fetchScorecard(st, cfg) {
    const apiPath = cfg.apiPath || st.apiPath;
    if (!apiPath) throw new Error("renderScoreCards: no apiPath configured for self-fetch");
    const res = await MA.postJson(apiPath, {
      ggid: st.ggid,
      mode: st.mode,
      scope: st.scope,
    });
    if (!res || !res.ok) throw new Error(res?.error || "scorecard_fetch_failed");
    return res;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  async function mount(cfg) {
    const hostEl = cfg.hostEl;
    if (!hostEl) return;
    const ggid = String(cfg.ggid || "");
    if (!ggid) return;

    let st = _states.get(hostEl);
    const isNewGame = !st || st.ggid !== ggid;

    if (!st) {
      st = _initState(hostEl, cfg);
    } else {
      st.controlsEl = cfg.controlsEl || st.controlsEl;
      st.footerEl = cfg.footerEl || st.footerEl;
      st.apiPath = cfg.apiPath || st.apiPath;
    }

    if (isNewGame) {
      _resetState(st, cfg);
      st.ggid = ggid;
      st.loading = true;
      renderControls(st);
      renderFooter(st);
      renderBody(st);

      try {
        const payload = cfg.initialData || await _fetchScorecard(st, cfg);
        st.payload = payload;
        st.game = payload.game || {};
        st.mode = String(payload.mode || st.mode || "game").toLowerCase();
        st.loading = false;
      } catch (e) {
        st.loading = false;
        st.error = true;
        renderBody(st);
        return;
      }
    }

    renderControls(st);
    renderFooter(st);
    renderBody(st);
  }

  MA.renderScoreCards.mount = mount;
})();
