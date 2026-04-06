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
    game: init?.payload?.game || init?.game || {},
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

  function randPlayerKey(len = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789'; // No I, O, 0
    let out = '';
    for (let i = 0; i < len; i++) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatDate(s) {
    if (!s) return "";
    // Try to parse YYYY-MM-DD or similar
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

  function isShotgun() {
    return String(state.game?.dbGames_TOMethod || state.meta?.toMethod || "").toLowerCase() === "shotgun";
  }

  function snapshotOriginal() {
    state.originalById.clear();
    for (const g of state.groups) {
      state.originalById.set(String(g.id), {
        teeTime: String(g.teeTime || ""),
        startHole: String(g.startHole || ""),
        startHoleSuffix: String(g.startHoleSuffix || ""),
        playerKey: String(g.playerKey || ""),
      });
    }
  }

  function isDirty(g) {
    const o = state.originalById.get(String(g.id));
    if (!o) return false;
    return (
      String(g.teeTime || "") !== String(o.teeTime || "") ||
      String(g.startHole || "") !== String(o.startHole || "") ||
      String(g.startHoleSuffix || "") !== String(o.startHoleSuffix || "") ||
      String(g.playerKey || "") !== String(o.playerKey || "")
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

  function applyTeeTimeDefaults() {
    if (isShotgun()) return;
    const holes = String(state.game?.dbGames_Holes || state.meta?.holesSetting || "").toLowerCase();
    const def = (holes === "b9" || holes === "back" || holes === "back 9") ? "10" : "1";
    
    for (const g of state.groups) {
      if (!g.startHole) g.startHole = def;
    }
  }

  /**
   * Sync Pass: Ensures all groups sharing a physical slot share the same PlayerKey.
   * Generates a new key only if the slot is entirely empty.
   */
  function syncSlotKeys() {
    const slots = new Map();
    
    // Pass 1: Identify existing keys per slot
    state.groups.forEach(g => {
      if (!g.teeTime || !g.startHole) return;
      const slotId = `${g.teeTime}|${g.startHole}|${g.startHoleSuffix || ""}`;
      if (!slots.has(slotId)) slots.set(slotId, g.playerKey || "");
      else if (!slots.get(slotId) && g.playerKey) slots.set(slotId, g.playerKey);
    });

    // Pass 2: Propagate or Generate
    state.groups.forEach(g => {
      if (!g.teeTime || !g.startHole) {
        g.playerKey = "";
        return;
      }
      const slotId = `${g.teeTime}|${g.startHole}|${g.startHoleSuffix || ""}`;
      let key = slots.get(slotId);
      if (!key) {
        key = randPlayerKey();
        slots.set(slotId, key);
      }
      g.playerKey = key;
    });
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

    syncSlotKeys();
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
    } else if (!isShotgun() && !g.startHole) {
      // Smart default for TeeTimes: if hole empty, set based on settings
      const holes = String(state.game?.dbGames_Holes || state.meta?.holesSetting || "").toLowerCase();
      if (holes === "b9" || holes === "back" || holes === "back 9") {
        g.startHole = "10";
      } else {
        // All 18 or Front 9 -> Hole 1
        g.startHole = "1";
      }
      // No suffix needed for TeeTimes
    }

    syncSlotKeys();
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

    syncSlotKeys();
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
        playerKey: g.playerKey || null,
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
    
    // Collate slots for rendering
    const collated = [];
    const slotMap = new Map();

    state.groups.forEach(g => {
      const slotId = g.teeTime && g.startHole 
        ? `${g.teeTime}|${g.startHole}|${g.startHoleSuffix || ""}` 
        : `unscheduled|${g.id}`;
      
      if (!slotMap.has(slotId)) {
        const slotObj = {
          id: slotId,
          teeTime: g.teeTime,
          startHole: g.startHole,
          startHoleSuffix: g.startHoleSuffix,
          playerKey: g.playerKey,
          isDirty: false,
          groups: []
        };
        slotMap.set(slotId, slotObj);
        collated.push(slotObj);
      }
      const s = slotMap.get(slotId);
      s.groups.push(g);
      if (isDirty(g)) s.isDirty = true;
    });

    el.cards.innerHTML = collated.map(renderSlotCard).join("");

    // Wire per-card actions
    collated.forEach((s) => {
      const sid = s.id;
      const timeBtn = el.cards.querySelector(`[data-gt-action="time"][data-gt-sid="${CSS.escape(sid)}"]`);
      if (timeBtn) timeBtn.addEventListener("click", () => openTimePicker(s.groups[0].id));

      const holeBtn = el.cards.querySelector(`[data-gt-action="hole"][data-gt-sid="${CSS.escape(sid)}"]`);
      if (holeBtn) holeBtn.addEventListener("click", () => openHolePicker(s.groups[0].id));

      const suffixBtn = el.cards.querySelector(`[data-gt-action="suffix"][data-gt-sid="${CSS.escape(sid)}"]`);
      if (suffixBtn) suffixBtn.addEventListener("click", () => openSuffixPicker(s.groups[0].id));
    });

    if (dirtyCount > 0) setStatus(`${dirtyCount} unsaved change(s).`, "warn");
    else setStatus("READY", "");
  }

  function renderSlotCard(s) {
    const cardClass = s.isDirty ? "maCard is-dirty" : "maCard";
    const totalPlayers = s.groups.reduce((sum, g) => sum + (g.size || 0), 0);

    const timeText = s.teeTime ? esc(s.teeTime) : "Set Time";
    const holeText = s.startHole ? `Hole ${esc(s.startHole)}` : "Hole";
    const showSuffix = isShotgun();
    const suffixText = s.startHoleSuffix ? esc(s.startHoleSuffix) : defaultSuffix();
    const keyText = s.playerKey ? `<span class="maPill" style="font-size:10px; padding:2px 6px;">Key: ${esc(s.playerKey)}</span>` : "";

    const groupsHtml = s.groups.map(g => {
      const hasTeams = g.isFlightGroup && ((g.teamA?.length) || (g.teamB?.length));
      if (hasTeams) {
        const namesA = (g.teamA || []).join(" · ");
        const namesB = (g.teamB || []).join(" · ");
        return `
          <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">
            <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:2px;">${esc(g.displayTitle)}</div>
            <div style="font-size:13px;"><span style="font-weight:600;">A:</span> ${esc(namesA)}</div>
            <div style="font-size:13px;"><span style="font-weight:600;">B:</span> ${esc(namesB)}</div>
          </div>`;
      }
      return `
        <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;">
          <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:2px;">${esc(g.displayTitle)}</div>
          <div style="font-size:13px;">${esc((g.playerLastNames || []).join(" · "))}</div>
        </div>`;
    }).join("");

    return `
      <section class="${cardClass}">
        <header class="maCard__hdr">
          <div class="maCard__titleRow">
            <div class="maCard__title" style="display:flex; align-items:center; gap:8px;">
              ${timeText} • ${holeText}${showSuffix ? suffixText : ""}
              ${keyText}
            </div>
          </div>
          <div class="maCard__actions">
             <button type="button" class="btn btnLink" data-gt-action="time" data-gt-sid="${esc(s.id)}">Time</button>
             <button type="button" class="btn btnLink" data-gt-action="hole" data-gt-sid="${esc(s.id)}">Hole</button>
             ${showSuffix ? `<button type="button" class="btn btnLink" data-gt-action="suffix" data-gt-sid="${esc(s.id)}">Slot</button>` : ""}
          </div>
        </header>
        <div class="maCard__body">
           ${groupsHtml}
           <div style="font-size:11px; color:var(--mutedText); text-align:right;">${totalPlayers} players total</div>
        </div>
      </section>
    `;
  }

    function buildActionRows(values, attrName, labelPrefix) {
      return (Array.isArray(values) ? values : []).map((value) => {
        const raw = String(value ?? "");
        const label = labelPrefix ? `${labelPrefix} ${raw}` : raw;
        return `<button class="actionMenu_item" type="button" ${attrName}="${esc(raw)}">${esc(label)}</button>`;
      }).join("");
    }

    function buildHoleMenuRows(holes) {
      const list = Array.isArray(holes) ? holes.map((h) => String(h)) : [];
      const top = [];

      if (list.includes("1")) top.push("1");
      if (list.includes("10")) top.push("10");

      const topRows = top.length
        ? buildActionRows(top, 'data-gt-hole', 'Hole')
        : "";

      const allRows = buildActionRows(list, 'data-gt-hole', 'Hole');

      if (topRows && allRows) {
        return `${topRows}<div class="actionMenu_divider"></div>${allRows}`;
      }
      return topRows || allRows;
    }

  // ---- Pickers ----
    function openTimePicker(groupId) {
      const arr = Array.isArray(state.meta?.availableTimes) ? state.meta.availableTimes : [];
      const items = buildActionRows(arr, 'data-gt-time', '');

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
      const items = buildHoleMenuRows(holes);

      openCustomMenu(
        "Start Hole",
        isShotgun() ? "Select a hole (then choose slot)." : "Select a hole.",
        items,
        (host) => {
          host.querySelectorAll("[data-gt-hole]").forEach((node) => {
            node.addEventListener("click", () => {
              const h = node.getAttribute("data-gt-hole") || "";
              closeMenu();
              assignHole(groupId, h);
            });
          });
        }
      );
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
    const items = arr.map((s) => {
      const ok = !takenSuffixes(time, hole, groupId).has(s);
      const dangerClass = ok ? "" : " disabled";
      const disabledAttr = ok ? "" : " disabled";
      return `<button class="actionMenu_item${dangerClass}" type="button" data-gt-suffix="${esc(s)}"${disabledAttr}>Slot ${esc(s)}</button>`;
    }).join("");

    openCustomMenu("Shotgun Slot", `Time ${esc(time)} • Hole ${esc(hole)}`, items, (host) => {
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
    let overlay = document.getElementById("maActionMenuOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "maActionMenuOverlay";
      overlay.className = "maModalOverlay";
      overlay.innerHTML = '<div id="maActionMenuHost"></div>';
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeMenu();
      });
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
            <button class="iconBtn btnPrimary" type="button" data-close="1" aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;

    host.innerHTML = html;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("maOverlayOpen");

    const closeBtn = host.querySelector("[data-close='1']");
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);

    if (typeof onWire === "function") onWire(host);
  }

  function closeMenu() {
    if (MA.ui && MA.ui.closeActionsMenu) {
      MA.ui.closeActionsMenu();
    } else {
      const overlay = document.getElementById("maActionMenuOverlay");
      if (overlay) {
        overlay.classList.remove("is-open");
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

      const res = await postJson(apiGameTimes, payload);
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      // After save, server returns refreshed INIT shape
      state.game = res.payload?.game || state.game;
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
      state.game = res.payload?.game || state.game;
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
      { label: "Game Settings", action: "settings" },
    ];
    MA.ui.openActionsMenu("Actions", items);
  }

  // ---- Chrome ----
  function applyChrome() {
    const g = state.game || {};
    const title = String(g.dbGames_Title || "Game");
    const course = String(g.dbGames_CourseName || "");
    const date = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    if (chrome && typeof chrome.setHeaderLines === "function") {
      chrome.setHeaderLines(["Tee Times", title, subTitle]);
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
    if (!state.game || !state.game.dbGames_GGID) {
      setStatus("Missing GGID context. Returning to games list…", "warn");
      window.location.assign(returnToUrl);
      return;
    }

    state.groups = sortForDisplay(state.groups || []);
    snapshotOriginal();
    applyTeeTimeDefaults();
    applyChrome();
    render();
  }

  boot();
})();
