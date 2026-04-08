/* /assets/pages/game_slotting.js */
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__MA_INIT__ || {};

  const el = {
    canvas: document.getElementById("gsCanvas"),
    trayList: document.getElementById("gsTrayList"),
    trayCount: document.getElementById("gsTrayCount"),
    traySearch: document.getElementById("gsTraySearch"),
    traySearchClear: document.getElementById("gsTraySearchClear"),
    trayMasterCheck: document.getElementById("gsTrayMasterCheck"),
    btnAssign: document.getElementById("gsBtnAssign"),
    btnDrawerAssign: document.getElementById("gsBtnDrawerAssign"),
    btnTrayOpen: document.getElementById("gsBtnTrayOpen"),
    btnToggleAll: document.getElementById("gsBtnToggleAll"),
    panelsWrap: document.getElementById("gsTabPanels"),
    mobileCloseBtns: document.querySelectorAll(".gpMobileCloseBtn"),
  };

  const state = {
    ggid: init.ggid,
    players: [],
    competition: init.game?.dbGames_Competition || "PairField",
    toMethod: init.meta?.toMethod || "TeeTimes",
    interval: init.meta?.teeTimeInterval || 9,
    selectedBlockIds: new Set(),
    targetSlotId: "",
    editMode: false,
    allCollapsed: false,
    dirty: new Set(),
    busy: false
  };

  // ---- Icons ----
  const ICONS = {
    minus: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    check: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    unpair: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="2" y1="2" x2="22" y2="22"></line></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`,
    del: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  };

  // ---- Helpers ----
  function isPairPair() { return state.competition === "PairPair"; }
  function isShotgun() { return state.toMethod === "Shotgun"; }
  function setBusy(on) { state.busy = !!on; }
  
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function randPlayerKey(len = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out;
  }

  function toggleMobileTray() {
    const isOpen = el.panelsWrap.classList.toggle("is-tray-open");
    if (el.btnTrayOpen) el.btnTrayOpen.textContent = isOpen ? "Show Slots" : "Add Pairs";
  }

  function markDirty(ghin) {
    if (!ghin) return;
    state.dirty.add(String(ghin));
    if (MA.setStatus) MA.setStatus("Unsaved changes.", "warn");
  }

  // ---- FIFO Assignment Engine ----
  function assignSelection() {
    if (state.selectedBlockIds.size === 0) return;

    const selectedIds = Array.from(state.selectedBlockIds);
    const blocks = selectedIds.map(id => getBlockPlayers(id));
    
    let currentSlotId = state.targetSlotId || getNextAvailableSlot();

    blocks.forEach(block => {
      const blockCount = block.length;
      const slotPlayers = getPlayersInSlot(currentSlotId);
      const currentCount = slotPlayers.length;

      // Overflow Logic
      if (currentCount + blockCount > 4) {
        if (state.editMode && !isShotgun()) {
          if (MA.setStatus) MA.setStatus("Tee Time slot is full (max 4).", "warn");
          return;
        }
        currentSlotId = getNextAvailableSlot(currentSlotId);
      }

      const slotMeta = parseSlotId(currentSlotId);
      const slotKey = getExistingPlayerKey(currentSlotId) || randPlayerKey();

      block.forEach(p => {
        p.teeTime = slotMeta.time;
        p.startHole = slotMeta.hole;
        p.startHoleSuffix = slotMeta.suffix;
        p.playerKey = slotKey;
        markDirty(p.playerGHIN);
      });

      // For FIFO, if we filled this slot or moved to next, keep the chain going
      if (!state.editMode) currentSlotId = getNextAvailableSlot(currentSlotId);
    });

    state.selectedBlockIds.clear();
    state.targetSlotId = "";
    state.editMode = false;
    render();
    if (window.matchMedia("(max-width: 900px)").matches) toggleMobileTray();
  }

  function getNextAvailableSlot(afterSlotId) {
    if (!afterSlotId) {
      // Return current highest or default
      return isShotgun() ? "08:00 AM|1|A" : "08:00 AM|1|";
    }
    const meta = parseSlotId(afterSlotId);
    if (isShotgun()) {
      const nextSuffix = String.fromCharCode(meta.suffix.charCodeAt(0) + 1);
      if (nextSuffix <= "D") return `${meta.time}|${meta.hole}|${nextSuffix}`;
      return `${meta.time}|${parseInt(meta.hole) + 1}|A`;
    } else {
      // Tee Time increment
      return "Next Time|1|"; // Placeholder for interval math
    }
  }

  function parseSlotId(sid) {
    const parts = sid.split("|");
    return { time: parts[0], hole: parts[1], suffix: parts[2] || "" };
  }

  function getPlayersInSlot(sid) {
    return state.players.filter(p => `${p.teeTime}|${p.startHole}|${p.startHoleSuffix}` === sid);
  }

  function getExistingPlayerKey(sid) {
    const match = state.players.find(p => `${p.teeTime}|${p.startHole}|${p.startHoleSuffix}` === sid && p.playerKey);
    return match ? match.playerKey : null;
  }

  function getBlockPlayers(blockId) {
    return state.players.filter(p => (isPairPair() ? p.flightId : p.pairingId) === blockId);
  }

  // ---- Rendering: Tray ----
  function renderTray() {
    const q = el.traySearch.value.toLowerCase();
    const uncarded = state.players.filter(p => !p.playerKey);
    const blocks = {};

    uncarded.forEach(p => {
      const id = isPairPair() ? p.flightId : p.pairingId;
      if (id === "000" || !id) return;
      if (!blocks[id]) blocks[id] = [];
      blocks[id].push(p);
    });

    const items = Object.entries(blocks)
      .filter(([id, players]) => {
        if (!q) return true;
        return id.includes(q) || players.some(p => p.name.toLowerCase().includes(q));
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    el.trayCount.textContent = items.length;
    
    el.trayList.innerHTML = items.map(([id, players]) => {
      const sel = state.selectedBlockIds.has(id);
      const names = players.map(p => p.name).join(", ");
      return `
        <div class="maListRow ${sel ? "is-selected" : ""}" data-action="selectBlock" data-id="${id}">
          <div class="gpRowCheck ${sel ? "is-selected" : ""}">
            ${sel ? ICONS.check : ""}
          </div>
          <div class="gpUnpairedItem">
            <div class="gpUnpairedItem__primary">${isPairPair() ? "Match" : "Group"} ${id}</div>
            <div class="gpUnpairedItem__secondary">${names}</div>
          </div>
        </div>`;
    }).join("");
  }

  // ---- Rendering: Canvas ----
  function renderCanvas() {
    const slots = {};
    state.players.filter(p => p.playerKey).forEach(p => {
      const sid = `${p.teeTime}|${p.startHole}|${p.startHoleSuffix}`;
      if (!slots[sid]) slots[sid] = { meta: parseSlotId(sid), key: p.playerKey, players: [] };
      slots[sid].players.push(p);
    });

    const sortedSlots = Object.values(slots).sort((a, b) => {
      if (a.meta.time !== b.meta.time) return a.meta.time.localeCompare(b.meta.time);
      return parseInt(a.meta.hole) - parseInt(b.meta.hole);
    });

    if (!sortedSlots.length) {
      el.canvas.innerHTML = `<div class="maEmpty">No slots assigned yet. Select from the tray to begin.</div>`;
      return;
    }

    el.canvas.innerHTML = sortedSlots.map(slot => {
      const sid = `${slot.meta.time}|${slot.meta.hole}|${slot.meta.suffix}`;
      const isTarget = state.targetSlotId === sid;
      const title = `${slot.meta.time} • Hole ${slot.meta.hole}${slot.meta.suffix}`;
      
      // Group players inside the card by PairingID/FlightID for removal logic
      const blockGroups = {};
      slot.players.forEach(p => {
        const bid = isPairPair() ? p.flightId : p.pairingId;
        if (!blockGroups[bid]) blockGroups[bid] = [];
        blockGroups[bid].push(p);
      });

      const body = Object.entries(blockGroups).map(([bid, players]) => {
        const names = players.map(p => p.name).join(" • ");
        return `
          <div class="gpCardRow">
            <button type="button" class="iconBtn btnPrimary gpCardRow__del" data-action="unslotBlock" data-id="${bid}" title="Remove">
              ${ICONS.del}
            </button>
            <div class="gpCardRow__info" data-action="toggle-truncate" title="${esc(names)}">${isPairPair() ? "Match" : "Pair"} ${bid}: ${names}</div>
          </div>`;
      }).join("");

      return `
        <div class="gpGroupCard ${isTarget ? "is-target" : ""} ${state.allCollapsed ? "is-collapsed" : ""}" data-sid="${sid}">
          <div class="gpGroupCard__hdr gpGroupCard__hdr--expanded">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse">
              ${ICONS.minus}
            </button>
            <div class="gpGroupCard__title">${title} • <small>${slot.key}</small></div>
            <div class="gpCardActions">
              <button class="iconBtn btnSecondary" type="button" data-action="unslotCard" data-sid="${sid}" title="UnSlot">
                ${ICONS.unpair}
              </button>
              <button class="iconBtn btnSecondary" type="button" data-action="editSlot" data-sid="${sid}" title="Edit">
                ${ICONS.edit}
              </button>
            </div>
          </div>
          <div class="gpGroupCard__hdr gpGroupCard__hdr--collapsed">
             <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse">
              ${ICONS.plus}
            </button>
            <div class="gpGroupCard__title">${title} (${slot.players.length} players)</div>
          </div>
          <div class="gpGroupCard__body">${body}</div>
        </div>`;
    }).join("");
  }

  function render() {
    renderTray();
    renderCanvas();
    setHints();
    
    const canAssign = state.selectedBlockIds.size > 0;
    el.btnAssign.disabled = !canAssign;
    el.btnDrawerAssign.disabled = !canAssign;

    // Update Master Check visual state
    if (el.trayMasterCheck) {
      if (state.selectedBlockIds.size > 0) {
        el.trayMasterCheck.classList.add("has-selection");
        el.trayMasterCheck.innerHTML = ICONS.minus;
      } else {
        el.trayMasterCheck.classList.remove("has-selection");
        el.trayMasterCheck.innerHTML = "";
      }
    }

    // Update Toggle All Icon
    if (el.btnToggleAll) {
      el.btnToggleAll.innerHTML = state.allCollapsed ? ICONS.plus : ICONS.minus;
      el.btnToggleAll.title = state.allCollapsed ? "Expand All" : "Collapse All";
    }
  }

  function setHints() {
    const hintEl = document.getElementById("gsTrayHint");
    if (!hintEl) return;
    if (state.editMode) {
      hintEl.textContent = `EDIT MODE: Targetting slot ${parseSlotId(state.targetSlotId).hole}. Select pairings to add.`;
    } else if (state.selectedBlockIds.size > 0) {
      hintEl.textContent = `Selected ${state.selectedBlockIds.size}. Tap Assign >> to slot.`;
    } else {
      hintEl.textContent = "Select blocks from tray to slot onto course.";
    }
  }

  // ---- Actions ----
  async function doSave() {
    if (state.busy || state.dirty.size === 0) return;
    setBusy(true);
    if (MA.setStatus) MA.setStatus("Saving slot assignments...", "info");

    const payload = {
      ggid: state.ggid,
      assignments: Array.from(state.dirty).map(ghin => {
        const p = state.players.find(x => x.playerGHIN === ghin);
        return {
          playerGHIN: p.playerGHIN,
          teeTime: p.teeTime,
          startHole: p.startHole,
          startHoleSuffix: p.startHoleSuffix,
          playerKey: p.playerKey
        };
      })
    };

    try {
      const res = await MA.postJson("/api/game_pairings/savePairings.php", payload);
      if (res.ok) {
        state.dirty.clear();
        if (MA.setStatus) MA.setStatus("Saved successfully.", "success");
        render();
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      if (MA.setStatus) MA.setStatus(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function unslotBlock(blockId) {
    const block = getBlockPlayers(blockId);
    block.forEach(p => {
      p.teeTime = "";
      p.startHole = "";
      p.startHoleSuffix = "";
      p.playerKey = "";
      markDirty(p.playerGHIN);
    });
    render();
  }

  function unslotCard(sid) {
    const players = getPlayersInSlot(sid);
    players.forEach(p => {
      p.teeTime = "";
      p.startHole = "";
      p.startHoleSuffix = "";
      p.playerKey = "";
      markDirty(p.playerGHIN);
    });
    render();
  }

  // ---- Event Wiring ----
  function wireEvents() {
    el.btnAssign.onclick = assignSelection;
    el.btnDrawerAssign.onclick = assignSelection;
    el.btnTrayOpen.onclick = toggleMobileTray;
    
    el.mobileCloseBtns.forEach(btn => {
      btn.onclick = toggleMobileTray;
    });

    el.btnToggleAll.onclick = () => {
      state.allCollapsed = !state.allCollapsed;
      render();
    };

    el.traySearch.oninput = () => {
      renderTray();
      el.traySearchClear.classList.toggle("isHidden", !el.traySearch.value);
    };

    el.traySearchClear.onclick = () => {
      el.traySearch.value = "";
      el.traySearchClear.classList.add("isHidden");
      renderTray();
    };

    el.trayMasterCheck.onclick = () => {
      if (state.selectedBlockIds.size > 0) {
        state.selectedBlockIds.clear();
        render();
      }
    };

    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const action = a.dataset.action;

      if (action === "selectBlock") {
        const id = a.dataset.id;
        if (state.selectedBlockIds.has(id)) state.selectedBlockIds.delete(id);
        else state.selectedBlockIds.add(id);
        renderTray();
        const canAssign = state.selectedBlockIds.size > 0;
        el.btnAssign.disabled = !canAssign;
        el.btnDrawerAssign.disabled = !canAssign;
      }

      if (action === "toggle-collapse") {
        const card = a.closest(".gpGroupCard");
        card.classList.toggle("is-collapsed");
      }

      if (action === "toggle-truncate") {
        // Only toggle if the text is actually overflowing
        if (a.scrollWidth > a.clientWidth) {
          a.classList.toggle("is-expanded");
        }
      }

      if (action === "editSlot") {
        const sid = a.dataset.sid;
        if (state.editMode && state.targetSlotId === sid) {
          state.editMode = false;
          state.targetSlotId = "";
        } else {
          state.editMode = true;
          state.targetSlotId = sid;
          if (window.matchMedia("(max-width: 900px)").matches) toggleMobileTray();
        }
        render();
      }

      if (action === "unslotBlock") {
        unslotBlock(a.dataset.id);
      }

      if (action === "unslotCard") {
        unslotCard(a.dataset.sid);
      }
    });
  }

  function normalizePlayers(rows) {
    return rows.map(r => ({
      playerGHIN: String(r.dbPlayers_PlayerGHIN || ""),
      name: String(r.dbPlayers_Name || ""),
      pairingId: String(r.dbPlayers_PairingID || "000"),
      flightId: String(r.dbPlayers_FlightID || ""),
      teeTime: String(r.dbPlayers_TeeTime || ""),
      startHole: String(r.dbPlayers_StartHole || ""),
      startHoleSuffix: String(r.dbPlayers_StartHoleSuffix || ""),
      playerKey: String(r.dbPlayers_PlayerKey || ""),
      size: 1
    }));
  }

  function applyChrome() {
    if (chrome.setHeaderLines) {
      chrome.setHeaderLines([
        "Game Slotting",
        init.game?.dbGames_Title || "Slotting Board",
        init.game?.dbGames_CourseName || ""
      ]);
    }

    if (chrome.setActions) {
      chrome.setActions({
        left: { show: true, label: "Actions", onClick: openActionsMenu },
        right: { show: true, label: "Save", onClick: doSave }
      });
    }

    if (chrome.setBottomNav) {
      chrome.setBottomNav({
        visible: ["admin", "edit", "roster", "pairings", "teetimes", "summary"],
        active: "teetimes",
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "AutoSlot (By Handicap)", action: () => console.log("AutoSlot Logic Deferred") },
      { separator: true },
      { label: "Game Settings", action: () => MA.routerGo("settings") },
      { label: "Reset Changes", action: () => window.location.reload(), danger: true }
    ]);
  }

  function initialize() {
    state.players = normalizePlayers(init.players || []);
    applyChrome();
    wireEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();