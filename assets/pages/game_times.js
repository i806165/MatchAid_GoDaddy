/* /assets/pages/game_times.js
 * Tee Times page controller (GoDaddy/PHP).
 * Aligns to gamemaint.php patterns:
 * - Reads INIT from window.__MA_INIT__/__INIT__
 * - Uses MA.postJson + MA.setStatus + MA.routes
 * - Renders .maCard list into #gtCards
 * - Uses shared actionMenu overlay styling (provided by chrome/actions_menu)
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  const init = window.__MA_INIT__ || window.__INIT__ || {};
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const routes = MA.routes || {};
  const paths = MA.paths || {};
  const apiGameTimes = routes.apiGameTimes || paths.apiGameTimes || "/api/game_times/hydrateGameTimes.php";
  const returnToUrl = init.returnTo || "/app/admin_games/gameslist.php";

  // ---- DOM ----
  const el = {
    cards: document.getElementById("gtCards"),
  };

  // ---- State ----
  const state = {
    meta: init?.payload?.meta || init?.meta || {},
    groups: Array.isArray(init?.payload?.groups) ? init.payload.groups : (Array.isArray(init?.groups) ? init.groups : []),
    originalById: new Map(),
    busy: false,
    dirtyCount: 0,
  };

  // ---- Helpers ----
  function setStatus(msg, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(String(msg || ""), level || "");
    else if (msg) console.log("[STATUS]", level || "", msg);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function isShotgun() {
    return String(state.meta?.toMethod || "").toLowerCase() === "shotgun";
  }

  function snapshotOriginal() {
    state.originalById.clear();
    for (const g of state.groups) {
      state.originalById.set(String(g.id), {
        teeTime: String(g.teeTime || ""),
        startHole: String(g.startHole || ""),
        startHoleSuffix: String(g.startHoleSuffix || ""),
      });
    }
  }

  function isDirty(g) {
    const o = state.originalById.get(String(g.id));
    if (!o) return false;
    return (
      String(g.teeTime || "") !== String(o.teeTime || "") ||
      String(g.startHole || "") !== String(o.startHole || "") ||
      String(g.startHoleSuffix || "") !== String(o.startHoleSuffix || "")
    );
  }

  function recalcDirtyCount() {
    let n = 0;
    for (const g of state.groups) if (isDirty(g)) n++;
    state.dirtyCount = n;
    return n;
  }

  function setBusy(on) {
    state.busy = !!on;
    // Re-apply chrome actions to update disabled state
    if (chrome && typeof chrome.setActions === "function") {
      applyChrome();
    }
  }

  function minutesFromHMMA(s) {
    const t = String(s || "").trim().split(/\s+/);
    if (t.length !== 2) return Number.POSITIVE_INFINITY;
    const [hm, apRaw] = t;
    const ap = apRaw.toUpperCase();
    const parts = hm.split(":");
    if (parts.length !== 2) return Number.POSITIVE_INFINITY;
    let h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  function sortForDisplay(list) {
    const arr = list.slice();
    arr.sort((a, b) => {
      const ta = minutesFromHMMA(a.teeTime);
      const tb = minutesFromHMMA(b.teeTime);
      if (ta !== tb) return ta - tb;

      const ha = parseInt(String(a.startHole || "999"), 10);
      const hb = parseInt(String(b.startHole || "999"), 10);
      if (ha !== hb) return ha - hb;

      return String(a.id).localeCompare(String(b.id));
    });
    return arr;
  }

  // ---- Shotgun suffix helpers ----
  function suffixList() {
    return Array.isArray(state.meta?.availableSuffixes) ? state.meta.availableSuffixes : ["A","B","C","D"];
  }

  function defaultSuffix() {
    const arr = suffixList();
    return arr.includes("A") ? "A" : String(arr[0] || "A");
  }

  function normSuffix(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase();
    const arr = suffixList();
    return arr.includes(s) ? s : null;
  }

  function takenSuffixes(time, hole, excludingId) {
    const set = new Set();
    for (const g of state.groups) {
      if (String(g.teeTime || "") === String(time || "") && String(g.startHole || "") === String(hole || "")) {
        if (excludingId && String(g.id) === String(excludingId)) continue;
        const s = normSuffix(g.startHoleSuffix);
        if (s) set.add(s);
      }
    }
    return set;
  }

  function suggestSuffix(time, hole, excludingId) {
    const used = takenSuffixes(time, hole, excludingId);
    for (const s of suffixList()) if (!used.has(s)) return s;
    return null;
  }

  // ---- Assignments ----
  function assignTime(groupId, time) {
    const g = state.groups.find((x) => String(x.id) === String(groupId));
    if (!g) return;

    g.teeTime = String(time || "");

    if (isShotgun() && g.teeTime && g.startHole) {
      const desired = normSuffix(g.startHoleSuffix) || defaultSuffix();
      const ok = !takenSuffixes(g.teeTime, g.startHole, groupId).has(desired);
      g.startHoleSuffix = ok ? desired : (suggestSuffix(g.teeTime, g.startHole, groupId) || defaultSuffix());
    }

    state.groups = sortForDisplay(state.groups);
    render();
  }

  function assignHole(groupId, hole) {
    const g = state.groups.find((x) => String(x.id) === String(groupId));
    if (!g) return;

    g.startHole = String(hole || "");
    g.startHoleSuffix = normSuffix(g.startHoleSuffix) || defaultSuffix();

    if (isShotgun() && g.teeTime) {
      const desired = normSuffix(g.startHoleSuffix) || defaultSuffix();
      const ok = !takenSuffixes(g.teeTime, g.startHole, groupId).has(desired);
      g.startHoleSuffix = ok ? desired : (suggestSuffix(g.teeTime, g.startHole, groupId) || defaultSuffix());
    }

    state.groups = sortForDisplay(state.groups);
    render();
  }

  function assignSuffix(groupId, suffixRaw) {
    const g = state.groups.find((x) => String(x.id) === String(groupId));
    if (!g) return;

    const s = normSuffix(suffixRaw);
    if (!s) return;

    if (isShotgun() && g.teeTime && g.startHole) {
      const ok = !takenSuffixes(g.teeTime, g.startHole, groupId).has(s);
      g.startHoleSuffix = ok ? s : (suggestSuffix(g.teeTime, g.startHole, groupId) || defaultSuffix());
    } else {
      g.startHoleSuffix = s;
    }

    state.groups = sortForDisplay(state.groups);
    render();
  }

  function buildAssignments(onlyDirty) {
    const out = [];
    for (const g of state.groups) {
      if (onlyDirty && !isDirty(g)) continue;
      out.push({
        pairingIds: Array.isArray(g.pairingIds) ? g.pairingIds : [],
        teeTime: g.teeTime || null,
        startHole: g.startHole || null,
        startHoleSuffix: isShotgun() ? (normSuffix(g.startHoleSuffix) || defaultSuffix()) : "",
      });
    }
    return out;
  }

  // ---- Rendering ----
  function render() {
    if (!el.cards) return;

    const dirtyCount = recalcDirtyCount();
    applyChrome(); // Update Save button state

    el.cards.innerHTML = state.groups.map(renderGroupCard).join("");

    // Wire per-card actions
    state.groups.forEach((g) => {
      const gid = String(g.id);
      const timeBtn = document.querySelector(`[data-gt-action="time"][data-gt-id="${CSS.escape(gid)}"]`);
      if (timeBtn) timeBtn.addEventListener("click", () => openTimePicker(gid));

      const holeBtn = document.querySelector(`[data-gt-action="hole"][data-gt-id="${CSS.escape(gid)}"]`);
      if (holeBtn) holeBtn.addEventListener("click", () => openHolePicker(gid));

      const suffixBtn = document.querySelector(`[data-gt-action="suffix"][data-gt-id="${CSS.escape(gid)}"]`);
      if (suffixBtn) suffixBtn.addEventListener("click", () => openSuffixPicker(gid));
    });

    if (dirtyCount > 0) setStatus(`${dirtyCount} unsaved change(s).`, "warn");
    else setStatus("READY", "");
  }

  function renderGroupCard(g) {
    const dirty = isDirty(g);
    const cardClass = dirty ? "maCard is-dirty" : "maCard";

    const title = esc(g.displayTitle || "");
    const size = Number(g.size || 0) || 0;

    const teamLine = (Array.isArray(g.teamA) && Array.isArray(g.teamB) && (g.teamA.length || g.teamB.length))
      ? `Team A: ${esc(g.teamA.join(" · "))} vs Team B: ${esc(g.teamB.join(" · "))}`
      : "";

    const names = Array.isArray(g.playerLastNames) ? esc(g.playerLastNames.join(" · ")) : "";

    const timeText = g.teeTime ? esc(g.teeTime) : "Set Time";
    const holeText = g.startHole ? `Start ${esc(g.startHole)}` : "Start Tee";

    const showSuffix = isShotgun();
    const suffixText = g.startHoleSuffix ? esc(g.startHoleSuffix) : defaultSuffix();

    return `
      <section class="${cardClass}">
        <header class="maCard__hdr">
          <div class="gtCardHdrRow">
            <div>
              <div class="maCard__titleRow">
                <div class="maCard__title">${title}</div>
                <div class="maCard__meta">${size} players</div>
              </div>
              ${teamLine ? `<div class="maCard__sub">${teamLine}</div>` : `<div class="maCard__sub">${names}</div>`}
            </div>

            <div class="gtCardActions">
              <button type="button" class="btn btnLink" data-gt-action="time" data-gt-id="${esc(g.id)}">${timeText}</button>
              <button type="button" class="btn btnLink" data-gt-action="hole" data-gt-id="${esc(g.id)}">${holeText}</button>
              ${showSuffix ? `<button type="button" class="btn btnLink" data-gt-action="suffix" data-gt-id="${esc(g.id)}">Slot ${suffixText}</button>` : ""}
            </div>
          </div>
        </header>
      </section>
    `;
  }

  // ---- Pickers ----
  function openTimePicker(groupId) {
    const arr = Array.isArray(state.meta?.availableTimes) ? state.meta.availableTimes : [];
    const items = ['<div class="actionMenu_item" data-gt-time="">(Clear)</div>']
      .concat(arr.map((t, idx) => `<div class="actionMenu_item" data-gt-time="${esc(t)}">${esc(t)}</div>`))
      .join("");

    // Use shared MA.ui.openActionsMenu but inject custom HTML body logic via a workaround or
    // better yet, map these to standard items if possible. 
    // Since game_times uses custom pickers (chips/lists), we can use the shared overlay's DOM if exposed,
    // OR adapt openActionsMenu to support custom HTML body.
    // However, the prompt asks to match game_pairings.js pattern which uses MA.ui.openActionsMenu.
    // game_pairings uses standard items. game_times needs custom pickers.
    // We will use the shared MA.ui.openActionsMenu but pass a custom render function or HTML string if supported,
    // OR we can use the shared overlay DOM directly like game_pairings does for its modal?
    // Actually, game_pairings uses a custom modal for AutoPair.
    // Let's stick to the existing custom menu logic for pickers but use the shared overlay ID "maActionMenuOverlay".
    
    openCustomMenu("Tee Time", "Select a time.", items, (host) => {
        host.querySelectorAll("[data-gt-time]").forEach((node) => {
          node.addEventListener("click", () => {
            const t = node.getAttribute("data-gt-time") || "";
            closeMenu();
            assignTime(groupId, t);
          });
        });
      });
  }

  function openHolePicker(groupId) {
    const holes = Array.isArray(state.meta?.availableHoles) ? state.meta.availableHoles : [];
    const chips = holes.map((h) => `<button type="button" class="maChoiceChip" data-gt-hole="${esc(h)}">${esc(h)}</button>`).join("");

    openCustomMenu("Start Hole", isShotgun() ? "Select a hole (then choose slot)." : "Select a hole.", `<div class="maChoiceChips">${chips}</div>`, (host) => {
        host.querySelectorAll("[data-gt-hole]").forEach((node) => {
          node.addEventListener("click", () => {
            const h = node.getAttribute("data-gt-hole") || "";
            closeMenu();
            assignHole(groupId, h);
          });
        });
      });
  }

  function openSuffixPicker(groupId) {
    if (!isShotgun()) return;

    const g = state.groups.find((x) => String(x.id) === String(groupId));
    const time = String(g?.teeTime || "");
    const hole = String(g?.startHole || "");
    if (!time || !hole) {
      setStatus("Select a tee time and start hole first.", "warn");
      return;
    }

    const arr = suffixList();
    const chips = arr.map((s) => {
      const ok = !takenSuffixes(time, hole, groupId).has(s);
      const cls = ok ? "maChoiceChip" : "maChoiceChip is-disabled";
      return `<button type="button" class="${cls}" data-gt-suffix="${esc(s)}" ${ok ? "" : "disabled"}>${esc(s)}</button>`;
    }).join("");

    openCustomMenu("Shotgun Slot", `Time ${esc(time)} • Hole ${esc(hole)}`, `<div class="maChoiceChips">${chips}</div>`, (host) => {
        host.querySelectorAll("[data-gt-suffix]").forEach((node) => {
          node.addEventListener("click", () => {
            const s = node.getAttribute("data-gt-suffix") || "";
            closeMenu();
            assignSuffix(groupId, s);
          });
        });
      });
  }

  // Helper to reuse the shared overlay for custom content (Pickers)
  function openCustomMenu(title, subtitle, bodyHtml, onWire) {
    // We can reuse the structure created by actions_menu.js
    let overlay = document.getElementById("maActionMenuOverlay");
    if (!overlay) {
      // If not present, create it (or rely on actions_menu.js to have created it)
      // For now, assume actions_menu.js is loaded.
      console.warn("maActionMenuOverlay not found. Ensure actions_menu.js is loaded.");
      return;
    }
    const host = document.getElementById("maActionMenuHost");
    if (!host) return;

    const html = `
      <div class="actionMenu">
        <div class="actionMenu_header">
          <div class="actionMenu_headerRow">
            <div class="actionMenu_headerSpacer"></div>
            <div>
              <div class="actionMenu_title">${esc(title)}</div>
              ${subtitle ? `<div class="actionMenu_subtitle">${esc(subtitle)}</div>` : ""}
            </div>
            <button class="actionMenu_closeBtn" type="button" data-close="1">✕</button>
          </div>
        </div>
        <div class="actionMenu_body">${bodyHtml}</div>
      </div>
    `;

    host.innerHTML = html;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("maOverlayOpen");

    // Wire close
    const closeBtn = host.querySelector("[data-close='1']");
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    
    // Wire custom events
    if (typeof onWire === "function") onWire(host);
  }

  function closeMenu() {
    if (MA.ui && MA.ui.closeActionsMenu) {
      MA.ui.closeActionsMenu();
    } else {
      const overlay = document.getElementById("maActionMenuOverlay");
      if (overlay) {
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
      }
      document.documentElement.classList.remove("maOverlayOpen");
    }
  }

  // ---- Actions ----
  async function doSave() {
    if (state.busy) return;

    const assignments = buildAssignments(true);
    if (!assignments.length) {
      setStatus("No changes to save.", "warn");
      return;
    }

    setStatus(`Saving ${assignments.length} change(s)…`, "info");
    setBusy(true);

    try {
      const payload = { action: "SAVE", ggid: state.meta?.ggid || init.ggid || "", assignments };
      console.log("[GAME_TIMES] save payload", payload);

      const res = await postJson(apiGameTimes, payload);
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      // After save, server returns refreshed INIT shape
      state.meta = res.payload?.meta || state.meta;
      state.groups = Array.isArray(res.payload?.groups) ? res.payload.groups : state.groups;
      state.groups = sortForDisplay(state.groups);

      snapshotOriginal();
      render();

      setStatus("Changes saved.", "success");
    } catch (e) {
      console.error("[GAME_TIMES] save error", e);
      setStatus(String(e?.message || e || "Save error."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (state.dirtyCount > 0) {
      const ok = confirm("Discard unsaved changes and reload from last save?");
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await postJson(apiGameTimes, { action: "INIT", ggid: state.meta?.ggid || init.ggid || "" });
      if (!res || !res.ok) throw new Error(res?.message || "Refresh failed.");
      state.meta = res.payload?.meta || state.meta;
      state.groups = Array.isArray(res.payload?.groups) ? res.payload.groups : [];
      state.groups = sortForDisplay(state.groups);
      snapshotOriginal();
      render();
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || e), "error");
    } finally {
      setBusy(false);
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    
    const items = [
      { label: "Reset / Reload", action: doReset },
      { separator: true },
      { label: "Close Menu", action: () => {} } // Implicit close
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  // ---- Chrome ----
  function applyChrome() {
    const g = state.meta || {};
    const title = String(g.title || "Game") || `GGID ${state.meta.ggid}`;

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["ADMIN PORTAL", "Tee Times", title]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      const canSave = state.dirtyCount > 0 && !state.busy;
      chrome.setActions({
        left: { show: true, label: "Actions", onClick: openActionsMenu },
        right: { show: true, label: "Save", onClick: doSave, disabled: !canSave }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
        active: "teetimes",
        onNavigate: (id) => {
          if (typeof MA.routerGo === "function") MA.routerGo(id);
        }
      });
    }
  }

  // ---- Boot ----
  function boot() {
    if (!state.meta || !state.meta.ggid) {
      setStatus("Missing GGID context. Returning to games list…", "warn");
      window.location.assign(returnToUrl);
      return;
    }

    console.log("[GAME_TIMES] init", init);

    state.groups = sortForDisplay(state.groups);
    snapshotOriginal();
    applyChrome();
    render();
  }

  boot();
})();
