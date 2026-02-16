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
    chromeBtnLeft: document.getElementById("chromeBtnLeft"),
    chromeBtnRight: document.getElementById("chromeBtnRight"),

    // These are expected to exist as part of chrome/actions_menu pattern
    overlay: document.getElementById("actionMenuOverlay"),
    menu: document.getElementById("actionMenu"),
    title: document.getElementById("actionMenuTitle"),
    subtitle: document.getElementById("actionMenuSubtitle"),
    body: document.getElementById("actionMenuBody"),
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
    if (el.chromeBtnRight) el.chromeBtnRight.disabled = state.busy || state.dirtyCount === 0;
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

  // ---- Overlay menu (assumes chrome/actions_menu supplies DOM) ----
  function closeMenu() {
    if (!el.overlay) return;
    el.overlay.classList.remove("is-open");
    el.overlay.setAttribute("aria-hidden", "true");
    if (el.body) el.body.innerHTML = "";
  }

  function openMenu({ title, subtitle, bodyHtml, onWire }) {
    if (!el.overlay || !el.body || !el.title) {
      setStatus("Action menu UI not available on this page (missing overlay).", "error");
      return;
    }

    el.title.textContent = String(title || "");
    if (el.subtitle) el.subtitle.textContent = String(subtitle || "");
    el.body.innerHTML = bodyHtml || "";

    el.overlay.classList.add("is-open");
    el.overlay.setAttribute("aria-hidden", "false");

    const closeOnBackdrop = (ev) => {
      if (ev.target === el.overlay) closeMenu();
    };
    el.overlay.addEventListener("click", closeOnBackdrop, { once: true });

    if (typeof onWire === "function") onWire();
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
    if (el.chromeBtnRight) el.chromeBtnRight.disabled = state.busy || dirtyCount === 0;

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
      .concat(arr.map((t) => `<div class="actionMenu_item" data-gt-time="${esc(t)}">${esc(t)}</div>`))
      .join("");

    openMenu({
      title: "Tee Time",
      subtitle: "Select a time.",
      bodyHtml: items,
      onWire: () => {
        el.body.querySelectorAll("[data-gt-time]").forEach((node) => {
          node.addEventListener("click", () => {
            const t = node.getAttribute("data-gt-time") || "";
            closeMenu();
            assignTime(groupId, t);
          });
        });
      },
    });
  }

  function openHolePicker(groupId) {
    const holes = Array.isArray(state.meta?.availableHoles) ? state.meta.availableHoles : [];
    const chips = holes.map((h) => `<button type="button" class="maChoiceChip" data-gt-hole="${esc(h)}">${esc(h)}</button>`).join("");

    openMenu({
      title: "Start Hole",
      subtitle: isShotgun() ? "Select a hole (then choose slot)." : "Select a hole.",
      bodyHtml: `<div class="maChoiceChips">${chips}</div>`,
      onWire: () => {
        el.body.querySelectorAll("[data-gt-hole]").forEach((node) => {
          node.addEventListener("click", () => {
            const h = node.getAttribute("data-gt-hole") || "";
            closeMenu();
            assignHole(groupId, h);
          });
        });
      },
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

    openMenu({
      title: "Shotgun Slot",
      subtitle: `Time ${esc(time)} • Hole ${esc(hole)}`,
      bodyHtml: `<div class="maChoiceChips">${chips}</div>`,
      onWire: () => {
        el.body.querySelectorAll("[data-gt-suffix]").forEach((node) => {
          node.addEventListener("click", () => {
            const s = node.getAttribute("data-gt-suffix") || "";
            closeMenu();
            assignSuffix(groupId, s);
          });
        });
      },
    });
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
    const canSave = state.dirtyCount > 0 && !state.busy;
    const items = [
      `<div class="actionMenu_item ${canSave ? "" : "is-disabled"}" data-gt-menu="save">Save</div>`,
      `<div class="actionMenu_item" data-gt-menu="reset">Reset / Reload</div>`,
      `<div class="actionMenu_divider"></div>`,
      `<div class="actionMenu_item" data-gt-menu="close">Close</div>`,
    ].join("");

    openMenu({
      title: "Actions",
      subtitle: "",
      bodyHtml: items,
      onWire: () => {
        el.body.querySelectorAll("[data-gt-menu]").forEach((node) => {
          node.addEventListener("click", () => {
            const cmd = node.getAttribute("data-gt-menu");
            closeMenu();
            if (cmd === "save") return doSave();
            if (cmd === "reset") return doReset();
            return;
          });
        });
      },
    });
  }

  // ---- Wire chrome buttons (fallback if MA.chrome not used) ----
  function wireChromeButtons() {
    if (el.chromeBtnLeft) el.chromeBtnLeft.addEventListener("click", openActionsMenu);
    if (el.chromeBtnRight) el.chromeBtnRight.addEventListener("click", doSave);
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
    wireChromeButtons();
    render();
  }

  boot();
})();
