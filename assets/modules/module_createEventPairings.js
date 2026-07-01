/* /assets/modules/module_createEventPairings.js
 * MA.createEventPairings — Event Roster pairing overlay module.
 *
 * Opens as a full-screen modal overlay containing a two-panel layout:
 *   Desktop (≥900px): tray (unassigned players) left + canvas (pairing cards) right
 *   Mobile (<900px):  canvas default, footer button opens tray (is-tray-open pattern)
 *
 * Scope: PairingID / PairingPos only — no tee times, no flight IDs, no match tab.
 * Saves via saveEventRosterPairings.php → ServiceDbEventPlayers::updatePairing().
 *
 * Usage:
 *   MA.createEventPairings.open({
 *     players:         [...],   // from event_roster.js — { ghin, name, lname, hi, pairingId, pairingPos, ... }
 *     apiSavePairings: url,
 *     onApply:         (players) => { ... }
 *   });
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function safe(v) { return v == null ? "" : String(v); }

  function pad3(v) {
    const n = parseInt(String(v || "0"), 10);
    if (!Number.isFinite(n) || n <= 0) return "000";
    return String(n).padStart(3, "0");
  }

  function setStatus(msg, level) {
    if (typeof MA.setStatus === "function") MA.setStatus(msg, level || "info");
  }

  async function postJson(url, payload) {
    if (typeof MA.postJson === "function") return MA.postJson(url, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ payload })
    });
    return res.json();
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
  }

  // ── Module-level singleton ───────────────────────────────────────────────────

  let _overlay = null;
  let _config  = null;
  let _state   = null;

  // ── State helpers ────────────────────────────────────────────────────────────

  function initState(config) {
    // Deep-copy players so we mutate our own copy, not the host's array
    _state = {
      players:       config.players.map(p => ({ ...p })),
      selected:      new Set(),      // GHINs selected in tray
      targetPairing: "",             // pairingId of the targeted canvas card
      sortMode:      "name",         // "name" | "hi"
      searchText:    "",
      allCollapsed:  false,
      dirty:         false,
      busy:          false,
    };
  }

  function getUnassigned() {
    let rows = _state.players.filter(p => pad3(p.pairingId) === "000");

    const q = _state.searchText.toLowerCase();
    if (q) rows = rows.filter(p => safe(p.name).toLowerCase().includes(q) || safe(p.lname).toLowerCase().includes(q));

    if (_state.sortMode === "hi") {
      rows.sort((a, b) => (parseFloat(a.hi) || 999) - (parseFloat(b.hi) || 999));
    } else {
      rows.sort((a, b) => safe(a.lname).localeCompare(safe(b.lname)) || safe(a.name).localeCompare(safe(b.name)));
    }

    return rows;
  }

  function getPairingIds() {
    const ids = [...new Set(_state.players.map(p => pad3(p.pairingId)).filter(id => id !== "000"))];
    return ids.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  function playersInPairing(pairingId) {
    return _state.players
      .filter(p => pad3(p.pairingId) === pairingId)
      .sort((a, b) => (parseInt(a.pairingPos, 10) || 0) - (parseInt(b.pairingPos, 10) || 0));
  }

  function nextPairingId() {
    const ids = _state.players
      .map(p => parseInt(pad3(p.pairingId), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    return pad3(ids.length ? Math.max(...ids) + 1 : 1);
  }

  function markDirty() {
    _state.dirty = true;
    const saveBtn = _overlay?.querySelector("#cepBtnSave");
    if (saveBtn) saveBtn.textContent = "Save Pairings";
    const hint = _overlay?.querySelector("#cepHint");
    if (hint) hint.textContent = "Unsaved changes — pairings will not apply until you save.";
  }

  // ── Pairing actions ──────────────────────────────────────────────────────────

  function assignSelected() {
    if (!_state.selected.size) return;

    const selected = [..._state.selected];
    const targetId = _state.targetPairing || nextPairingId();

    // Find next available position within this pairing
    const existing = playersInPairing(targetId);
    let pos = existing.length + 1;

    selected.forEach(ghin => {
      const p = _state.players.find(x => x.ghin === ghin);
      if (!p) return;
      p.pairingId  = targetId;
      p.pairingPos = String(pos++);
    });

    _state.selected.clear();
    _state.targetPairing = targetId; // keep targeting the same card
    markDirty();
    renderAll();
  }

  function removeFromPairing(ghin) {
    const p = _state.players.find(x => x.ghin === ghin);
    if (!p) return;
    p.pairingId  = "000";
    p.pairingPos = "";

    // Re-number remaining players in that pairing
    renumberPairing(p.pairingId);
    markDirty();
    renderAll();
  }

  function unpairGroup(pairingId) {
    _state.players.forEach(p => {
      if (pad3(p.pairingId) === pairingId) {
        p.pairingId  = "000";
        p.pairingPos = "";
      }
    });
    if (_state.targetPairing === pairingId) _state.targetPairing = "";
    markDirty();
    renderAll();
  }

  function renumberPairing(pairingId) {
    const members = playersInPairing(pairingId);
    members.forEach((p, i) => { p.pairingPos = String(i + 1); });
  }

  function setTarget(pairingId) {
    _state.targetPairing = (_state.targetPairing === pairingId) ? "" : pairingId;
    renderCanvas();
    renderTrayControls();
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function renderAll() {
    renderTray();
    renderCanvas();
    renderTrayControls();
  }

  function renderTrayControls() {
    const el = _overlay?.querySelector("#cepTrayControls");
    if (!el) return;

    const selCount  = _state.selected.size;
    const unCount   = getUnassigned().length;
    const hasTarget = !!_state.targetPairing;
    const btnLabel  = hasTarget
      ? `Assign >> to Pairing ${_state.targetPairing}`
      : `Assign >> New Pairing`;

    el.innerHTML = `
      <div class="maCanvasControls" style="gap:6px;">
        <div style="display:flex;gap:4px;align-items:center;">
          <button class="maSeg--sortBtn ${_state.sortMode === "name" ? "is-active" : ""}" data-sort="name" type="button">Name</button>
          <button class="maSeg--sortBtn ${_state.sortMode === "hi"   ? "is-active" : ""}" data-sort="hi"   type="button">HI</button>
        </div>
        <div class="maCanvasControls__right">
          <button id="cepBtnAssign" class="btn btnSecondary" type="button" ${!selCount ? "disabled" : ""}>${esc(btnLabel)}</button>
        </div>
      </div>
      <div style="padding:4px 0;font-size:11px;font-weight:700;color:var(--mutedText)">
        ${selCount ? `${selCount} selected · ` : ""}${unCount} unassigned
        ${hasTarget ? ` · targeting Pairing ${esc(_state.targetPairing)}` : ""}
      </div>
      <div style="margin-top:6px;">
        <input id="cepSearch" class="maTextInput" type="text" placeholder="Search players…" value="${esc(_state.searchText)}" autocomplete="off" style="width:100%;" />
      </div>`;

    el.querySelector("[data-sort]")?.parentElement.querySelectorAll("[data-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        _state.sortMode = btn.dataset.sort;
        renderTray();
        renderTrayControls();
      });
    });

    const assignBtn = el.querySelector("#cepBtnAssign");
    if (assignBtn) assignBtn.addEventListener("click", assignSelected);

    const searchEl = el.querySelector("#cepSearch");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        _state.searchText = searchEl.value;
        renderTray();
      });
    }
  }

  function renderTray() {
    const el = _overlay?.querySelector("#cepTrayBody");
    if (!el) return;

    const rows = getUnassigned();

    if (!rows.length) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--mutedText);font-size:12px;font-weight:700;">All players have been assigned.</div>`;
      return;
    }

    el.innerHTML = rows.map(p => {
      const on  = _state.selected.has(p.ghin);
      const hi  = safe(p.hi) || "—";
      return `
        <div class="maListRow" data-ghin="${esc(p.ghin)}" style="display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;padding:7px 8px;cursor:pointer;${on ? "background:rgba(63,118,82,.08);" : ""}">
          <div class="maCheckbox ${on ? "is-checked" : ""}"></div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--ink)">${esc(p.name)}</div>
            <div style="font-size:10px;font-weight:600;color:var(--mutedText)">HI ${esc(hi)}${p.gender ? " · " + esc(p.gender) : ""}</div>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--mutedText);white-space:nowrap;">${esc(hi)}</div>
        </div>`;
    }).join("");

    el.querySelectorAll(".maListRow[data-ghin]").forEach(row => {
      row.addEventListener("click", () => {
        const ghin = row.dataset.ghin;
        if (_state.selected.has(ghin)) _state.selected.delete(ghin);
        else _state.selected.add(ghin);
        renderTray();
        renderTrayControls();
      });
    });
  }

  function renderCanvas() {
    const el = _overlay?.querySelector("#cepCanvasBody");
    if (!el) return;

    const ids = getPairingIds();

    if (!ids.length) {
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--mutedText);font-size:12px;font-weight:700;">No pairings yet. Select players in the tray, then click Assign.</div>`;
      return;
    }

    const iconMinus = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    el.innerHTML = ids.map(pid => {
      const members  = playersInPairing(pid);
      const hiVals   = members.map(p => parseFloat(p.hi) || 0).filter(n => n > 0);
      const sumHI    = hiVals.reduce((a, b) => a + b, 0).toFixed(1);
      const avgHI    = hiVals.length ? (sumHI / hiVals.length).toFixed(1) : "—";
      const isTarget = _state.targetPairing === pid;
      const collapsed = _state.allCollapsed;

      const bodyHtml = members.map(p => `
        <div class="cep-card-row" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--borderSubtle);">
          <button type="button" class="iconBtn btnPrimary" data-action="remove" data-ghin="${esc(p.ghin)}" aria-label="Remove ${esc(p.name)}" style="width:24px;height:24px;color:var(--danger);">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</div>
          </div>
          <div style="font-size:10px;font-weight:700;color:var(--mutedText);white-space:nowrap;">HI ${esc(safe(p.hi) || "—")}</div>
        </div>`).join("");

      return `
        <div class="maCard cep-pairing-card" data-pid="${esc(pid)}" style="margin-bottom:8px;${isTarget ? "border:2px solid var(--brandSecondary);" : ""}">
          <div class="maCard__hdr" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;" data-action="target">
            <button type="button" class="iconBtn btnSecondary" data-action="collapse" style="width:24px;height:24px;color:rgba(255,255,255,.8);">
              ${collapsed ? iconPlus : iconMinus}
            </button>
            <div style="flex:1;font-size:12px;font-weight:900;color:#fff;">
              Pairing ${esc(pid)}${isTarget ? ' <span style="font-size:9px;background:rgba(255,255,255,.25);padding:1px 5px;border-radius:3px;margin-left:4px;">TARGET</span>' : ""}
            </div>
            <div style="font-size:10px;color:rgba(255,255,255,.78);font-weight:700;white-space:nowrap;">
              Σ ${esc(sumHI)} · Avg ${esc(avgHI)}
            </div>
            <button type="button" class="btn" data-action="unpair" style="font-size:10px;font-weight:800;padding:2px 6px;background:rgba(255,255,255,.2);color:#fff;border:0;border-radius:3px;">
              Unpair
            </button>
          </div>
          ${collapsed ? "" : `<div class="maCard__body" style="padding:0;">${bodyHtml}</div>`}
        </div>`;
    }).join("");

    // Wire card actions
    el.querySelectorAll(".cep-pairing-card").forEach(card => {
      const pid = card.dataset.pid;

      card.querySelector("[data-action='target']")?.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        setTarget(pid);
      });

      card.querySelector("[data-action='collapse']")?.addEventListener("click", () => {
        _state.allCollapsed = !_state.allCollapsed;
        renderCanvas();
      });

      card.querySelector("[data-action='unpair']")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Remove all players from Pairing ${pid}?`)) unpairGroup(pid);
      });

      card.querySelectorAll("[data-action='remove']").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeFromPairing(btn.dataset.ghin);
        });
      });
    });
  }

  // ── Auto-pair ────────────────────────────────────────────────────────────────

  function openAutoPair() {
    const unassigned = getUnassigned();
    if (unassigned.length < 2) {
      setStatus("Not enough unassigned players to auto-pair.", "warn");
      return;
    }

    const total = unassigned.length;
    // Calculate default mix: prefer foursomes, fill remainder with threesomes/twosomes
    let fours  = Math.floor(total / 4);
    let rem    = total - (fours * 4);
    let threes = 0;
    let twos   = 0;
    if (rem === 3) { threes = 1; }
    else if (rem === 2) { twos = 1; }
    else if (rem === 1) { fours--; threes = 1; twos = 1; }

    const apOverlay = document.createElement("div");
    apOverlay.className = "maModalOverlay is-open";
    apOverlay.style.cssText = "z-index:10001;";
    apOverlay.innerHTML = `
      <section class="maModal" role="dialog" aria-modal="true" style="max-width:380px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Auto-Pair</div>
            <div class="maModal__subtitle">${total} unassigned players</div>
          </div>
          <button id="apClose" type="button" class="iconBtn btnSecondary" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="maModal__body">
          <div class="maFieldRow">
            <div class="maField">
              <label class="maLabel">Foursomes</label>
              <input id="apFours" class="maTextInput" type="number" min="0" value="${fours}" />
            </div>
            <div class="maField">
              <label class="maLabel">Threesomes</label>
              <input id="apThrees" class="maTextInput" type="number" min="0" value="${threes}" />
            </div>
            <div class="maField">
              <label class="maLabel">Twosomes</label>
              <input id="apTwos" class="maTextInput" type="number" min="0" value="${twos}" />
            </div>
          </div>
          <div id="apHint" class="emHint" style="margin-top:8px;"></div>
          <div style="margin-top:4px;">
            <label class="maLabel">Outcome</label>
            <select id="apOutcome" class="maTextInput">
              <option value="balanced">Balanced — mix handicaps evenly across groups</option>
              <option value="similar">Similar — group players with closest handicaps together</option>
            </select>
          </div>
        </div>
        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button id="apCancel" class="btn btnPrimary" type="button">Cancel</button>
            <button id="apRun" class="btn btnSecondary" type="button">Apply</button>
          </div>
        </footer>
      </section>`;

    document.body.appendChild(apOverlay);

    function updateHint() {
      const f = parseInt(apOverlay.querySelector("#apFours").value, 10)  || 0;
      const t = parseInt(apOverlay.querySelector("#apThrees").value, 10) || 0;
      const tw= parseInt(apOverlay.querySelector("#apTwos").value, 10)   || 0;
      const placed = (f * 4) + (t * 3) + (tw * 2);
      const hint = apOverlay.querySelector("#apHint");
      if (hint) {
        hint.textContent = placed === total
          ? `✓ All ${total} players will be placed.`
          : `${placed} players placed, ${Math.abs(total - placed)} ${placed > total ? "too many" : "remaining"}.`;
        hint.style.color = placed === total ? "var(--success)" : "var(--danger)";
      }
      const runBtn = apOverlay.querySelector("#apRun");
      if (runBtn) runBtn.disabled = (placed !== total);
    }

    apOverlay.querySelectorAll("input[type='number']").forEach(el => el.addEventListener("input", updateHint));
    updateHint();

    apOverlay.querySelector("#apClose")?.addEventListener("click",  () => apOverlay.remove());
    apOverlay.querySelector("#apCancel")?.addEventListener("click", () => apOverlay.remove());
    apOverlay.querySelector("#apRun")?.addEventListener("click", () => {
      const f  = parseInt(apOverlay.querySelector("#apFours").value,  10) || 0;
      const t  = parseInt(apOverlay.querySelector("#apThrees").value, 10) || 0;
      const tw = parseInt(apOverlay.querySelector("#apTwos").value,   10) || 0;
      const outcome = apOverlay.querySelector("#apOutcome").value;
      applyAutoPair(f, t, tw, outcome);
      apOverlay.remove();
    });
  }

  function applyAutoPair(fours, threes, twos, outcome) {
    const pool = [...getUnassigned()];

    // Sort by HI for distribution
    pool.sort((a, b) => (parseFloat(a.hi) || 999) - (parseFloat(b.hi) || 999));

    // Build group size array
    const sizes = [];
    for (let i = 0; i < fours;  i++) sizes.push(4);
    for (let i = 0; i < threes; i++) sizes.push(3);
    for (let i = 0; i < twos;   i++) sizes.push(2);

    const groups = sizes.map(() => []);

    if (outcome === "balanced") {
      // Snake draft: distribute highest-to-lowest HI across groups alternately
      // to balance the total HI across pairings
      let dir = 1;
      let idx = 0;
      pool.forEach(player => {
        groups[idx].push(player);
        idx += dir;
        if (idx >= groups.length) { idx = groups.length - 1; dir = -1; }
        if (idx < 0)              { idx = 0;                  dir = 1;  }
      });
    } else {
      // Similar: consecutive players (already sorted by HI) go together
      let gi = 0;
      let count = 0;
      pool.forEach(player => {
        if (count >= sizes[gi] && gi < groups.length - 1) { gi++; count = 0; }
        groups[gi].push(player);
        count++;
      });
    }

    // Assign pairingId / pairingPos
    const startId = parseInt(nextPairingId(), 10);
    groups.forEach((group, i) => {
      const pid = pad3(startId + i);
      group.forEach((player, pos) => {
        const p = _state.players.find(x => x.ghin === player.ghin);
        if (p) { p.pairingId = pid; p.pairingPos = String(pos + 1); }
      });
    });

    markDirty();
    renderAll();
    setStatus(`Auto-paired ${pool.length} players into ${groups.length} groups.`, "success");
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function doSave() {
    if (!_state || !_config) return;
    if (_state.busy) return;
    _state.busy = true;

    const saveBtn = _overlay?.querySelector("#cepBtnSave");
    if (saveBtn) saveBtn.disabled = true;
    setStatus("Saving pairings…", "info");

    try {
      const assignments = _state.players.map(p => ({
        ghin:       p.ghin,
        pairingId:  pad3(p.pairingId),
        pairingPos: safe(p.pairingPos)
      }));

      const res = await postJson(_config.apiSavePairings, { assignments });

      if (!res?.ok) {
        throw new Error(res?.message || "Save failed.");
      }

      setStatus("Pairings saved.", "success");
      _state.dirty = false;

      if (typeof _config.onApply === "function") {
        _config.onApply(_state.players.map(p => ({ ...p })));
      }

      close();
    } catch (e) {
      console.error("[createEventPairings] save error:", e);
      setStatus(String(e.message || e), "danger");
    } finally {
      _state.busy = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // ── Mobile tray toggle ───────────────────────────────────────────────────────

  function openMobileTray() {
    const page = _overlay?.querySelector(".maPage--cepModal");
    if (page) page.classList.add("is-tray-open");
    const btn = _overlay?.querySelector("#cepBtnTrayOpen");
    if (btn) btn.textContent = "Show Pairings";
  }

  function closeMobileTray() {
    const page = _overlay?.querySelector(".maPage--cepModal");
    if (page) page.classList.remove("is-tray-open");
    const btn = _overlay?.querySelector("#cepBtnTrayOpen");
    if (btn) btn.textContent = "+ Assign Players";
  }

  // ── Build overlay DOM ────────────────────────────────────────────────────────

  function buildOverlay(config) {
    const ev    = config.players; // unused here but available
    const total = config.players.length;

    const overlay = document.createElement("div");
    overlay.id        = "cepOverlay";
    overlay.className = "maModalOverlay is-open";
    overlay.style.cssText = "z-index:10000;padding:0;align-items:stretch;";

    overlay.innerHTML = `
      <div class="maModal" style="width:100%;height:100%;max-width:100%;border-radius:0;display:flex;flex-direction:column;overflow:hidden;">

        <!-- Header -->
        <header class="maModal__hdr" style="background:var(--brandTertiary);flex-shrink:0;">
          <div class="maModal__titles">
            <div class="maModal__title" style="color:#fff;">Event Pairings</div>
            <div class="maModal__subtitle" style="color:rgba(255,255,255,.78);">${esc(String(total))} players</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="cepBtnAutoPair" type="button" class="btn" style="background:rgba(255,255,255,.18);color:#fff;border:0;font-size:12px;font-weight:800;">Auto-Pair</button>
            <button id="cepBtnClose"   type="button" class="btn btnPrimary" style="font-size:12px;">Close</button>
          </div>
        </header>

        <!-- Status hint -->
        <div id="cepHint" style="flex-shrink:0;padding:5px 12px;font-size:11px;font-weight:700;color:var(--mutedText);background:var(--surfaceChrome);border-bottom:1px solid var(--borderSubtle);">
          Select players in the tray, then click Assign &gt;&gt; to create a pairing.
        </div>

        <!-- Two-panel body -->
        <div class="maPage--cepModal" style="flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;">
          <div class="maPanels maPanels--2" style="flex:1 1 auto;min-height:0;">

            <!-- LEFT: Tray — unassigned players -->
            <section class="maPanel maPanel--secondary cepTrayPanel" aria-label="Unassigned players">
              <header class="maPanel__hdr">
                <div style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;">
                  <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.3px;color:#fff;">Unassigned</div>
                  <button class="iconBtn cepMobileCloseBtn" type="button" aria-label="Close tray"
                    style="position:absolute;right:0;display:none;width:28px;height:28px;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;border-radius:var(--radiusMd);">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </header>
              <div class="maPanel__controls" id="cepTrayControls"></div>
              <div class="maPanel__body" id="cepTrayBody"></div>
              <footer class="maPanel__ftr"></footer>
            </section>

            <!-- RIGHT: Canvas — pairing cards -->
            <section class="maPanel maPanel--primary" aria-label="Pairings">
              <header class="maPanel__hdr">
                <div style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;">
                  <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.3px;color:#fff;">Pairings</div>
                </div>
              </header>
              <div class="maPanel__controls">
                <div style="font-size:11px;font-weight:700;color:var(--mutedText);">
                  Tap a pairing card to target it, then Assign &gt;&gt; from the tray.
                </div>
              </div>
              <div class="maPanel__body" id="cepCanvasBody"></div>
              <footer class="maPanel__ftr">
                <button id="cepBtnTrayOpen" class="btn btnSecondary" type="button"
                  style="width:100%;display:none;">+ Assign Players</button>
              </footer>
            </section>

          </div>
        </div>

        <!-- Footer -->
        <footer class="maModal__ftr" style="flex-shrink:0;">
          <div style="flex:1;font-size:11px;font-weight:700;color:var(--mutedText);" id="cepFooterHint"></div>
          <button id="cepBtnCancel" class="btn btnPrimary"    type="button">Cancel</button>
          <button id="cepBtnSave"   class="btn btnSecondary"  type="button">Save Pairings</button>
        </footer>

      </div>`;

    // Wire static buttons
    overlay.querySelector("#cepBtnClose")?.addEventListener("click",    () => confirmClose());
    overlay.querySelector("#cepBtnCancel")?.addEventListener("click",   () => confirmClose());
    overlay.querySelector("#cepBtnSave")?.addEventListener("click",     () => doSave());
    overlay.querySelector("#cepBtnAutoPair")?.addEventListener("click", () => openAutoPair());
    overlay.querySelector("#cepBtnTrayOpen")?.addEventListener("click", () => openMobileTray());
    overlay.querySelector(".cepMobileCloseBtn")?.addEventListener("click", () => closeMobileTray());

    // Mobile: show tray open button + close button in tray header on narrow screens
    function applyMobileState() {
      const narrow = isMobile();
      const trayOpenBtn = overlay.querySelector("#cepBtnTrayOpen");
      const trayCloseBtn = overlay.querySelector(".cepMobileCloseBtn");
      if (trayOpenBtn)  trayOpenBtn.style.display  = narrow ? "" : "none";
      if (trayCloseBtn) trayCloseBtn.style.display = narrow ? "" : "none";
    }

    applyMobileState();
    window.addEventListener("resize", applyMobileState);
    overlay._cleanupResize = () => window.removeEventListener("resize", applyMobileState);

    return overlay;
  }

  function confirmClose() {
    if (_state?.dirty) {
      if (!confirm("Discard unsaved pairing changes?")) return;
    }
    close();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function open(config) {
    if (_overlay) close(); // safety — close any stale instance

    if (!config?.players?.length) {
      setStatus("No players available for pairing.", "warn");
      return;
    }

    _config = config;
    initState(config);

    _overlay = buildOverlay(config);
    document.body.appendChild(_overlay);

    renderAll();
  }

  function close() {
    if (_overlay) {
      if (_overlay._cleanupResize) _overlay._cleanupResize();
      _overlay.remove();
      _overlay = null;
    }
    _config = null;
    _state  = null;
  }

  MA.createEventPairings = { open, close };

})(window);
