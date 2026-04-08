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
    del: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    up: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    down: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
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

    function parseTimeToMinutes(timeText) {
    const raw = String(timeText || "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return null;

    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const meridiem = m[3].toUpperCase();

    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;

    return hour * 60 + minute;
  }

  function formatMinutesToTime(totalMinutes) {
    if (!Number.isFinite(totalMinutes)) return "";

    let mins = totalMinutes % (24 * 60);
    if (mins < 0) mins += 24 * 60;

    let hour24 = Math.floor(mins / 60);
    const minute = mins % 60;
    const meridiem = hour24 >= 12 ? "PM" : "AM";

    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;

    return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;
  }

  function getDefaultStartTime() {
    const playTime = String(init.game?.dbGames_PlayTime || "").trim();
    return playTime || "08:00 AM";
  }

  function toggleMobileTray() {
    const isOpen = el.panelsWrap.classList.toggle("is-tray-open");
    if (el.btnTrayOpen) el.btnTrayOpen.textContent = isOpen ? "Show Slots" : "Add Slot";
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

      if (!state.editMode) {
        let slotPlayers = getPlayersInSlot(currentSlotId);
        while (slotPlayers.length + blockCount > 4) {
          currentSlotId = getNextAvailableSlot(currentSlotId);
          slotPlayers = getPlayersInSlot(currentSlotId);
        }
      } else {
        const slotPlayers = getPlayersInSlot(currentSlotId);
        if (slotPlayers.length + blockCount > 4) {
          if (MA.setStatus) MA.setStatus("Tee Time slot is full (max 4).", "warn");
          return;
        }
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

      if (!state.editMode) {
        currentSlotId = getNextAvailableSlot(currentSlotId);
      }
    });

    state.selectedBlockIds.clear();
    state.targetSlotId = "";
    state.editMode = false;
    render();
    if (window.matchMedia("(max-width: 900px)").matches) toggleMobileTray();
  }

  function getNextAvailableSlot(afterSlotId) {
    if (!afterSlotId) {
      if (isShotgun()) {
        return "08:00 AM|1|A";
      }

      const assignedSlotIds = Array.from(new Set(
        state.players
          .filter(p => p.playerKey && p.teeTime)
          .map(p => `${p.teeTime}|${p.startHole || "1"}|${p.startHoleSuffix || ""}`)
      ));

      if (!assignedSlotIds.length) {
        return `${getDefaultStartTime()}|1|`;
      }

      assignedSlotIds.sort((a, b) => compareSlotMeta(parseSlotId(a), parseSlotId(b)));

      const highestSlotId = assignedSlotIds[assignedSlotIds.length - 1];
      const highestPlayers = getPlayersInSlot(highestSlotId);

      if (highestPlayers.length < 4) {
        return highestSlotId;
      }

      return getNextAvailableSlot(highestSlotId);
    }

    const meta = parseSlotId(afterSlotId);

    if (isShotgun()) {
      const nextSuffix = String.fromCharCode((meta.suffix || "A").charCodeAt(0) + 1);
      if (nextSuffix <= "D") return `${meta.time}|${meta.hole}|${nextSuffix}`;
      return `${meta.time}|${parseInt(meta.hole, 10) + 1}|A`;
    }

    const startMinutes = parseTimeToMinutes(meta.time);
    const intervalMinutes = parseInt(state.interval, 10) || 9;
    const nextMinutes = (startMinutes ?? parseTimeToMinutes(getDefaultStartTime()) ?? 480) + intervalMinutes;
    const nextTime = formatMinutesToTime(nextMinutes);

    return `${nextTime}|1|`;
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

  function slotSuffixRank(suffix) {
    const s = String(suffix || "").trim().toUpperCase();
    if (!s) return 0;
    return s.charCodeAt(0) - 64; // A=1, B=2, ...
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

  function compareSlotMeta(a, b) {
    if (isShotgun()) {
      const holeA = parseInt(a.hole || "0", 10);
      const holeB = parseInt(b.hole || "0", 10);
      if (holeA !== holeB) return holeA - holeB;
      return slotSuffixRank(a.suffix) - slotSuffixRank(b.suffix);
    }

    const ta = parseTimeToMinutes(a.time);
    const tb = parseTimeToMinutes(b.time);
    if (ta !== tb) return (ta ?? 0) - (tb ?? 0);

    const holeA = parseInt(a.hole || "0", 10);
    const holeB = parseInt(b.hole || "0", 10);
    if (holeA !== holeB) return holeA - holeB;

    return slotSuffixRank(a.suffix) - slotSuffixRank(b.suffix);
  }

    function sortSlotsForDisplay(list) {
    const arr = list.slice();

    arr.sort((a, b) => {
      if (isShotgun()) {
        const ha = parseInt(String(a.meta?.hole || "999"), 10);
        const hb = parseInt(String(b.meta?.hole || "999"), 10);
        if (ha !== hb) return ha - hb;

        const sa = slotSuffixRank(a.meta?.suffix);
        const sb = slotSuffixRank(b.meta?.suffix);
        if (sa !== sb) return sa - sb;

        return String(a.key || "").localeCompare(String(b.key || ""));
      }

      const ta = minutesFromHMMA(a.meta?.time);
      const tb = minutesFromHMMA(b.meta?.time);
      if (ta !== tb) return ta - tb;

      const ha = parseInt(String(a.meta?.hole || "999"), 10);
      const hb = parseInt(String(b.meta?.hole || "999"), 10);
      if (ha !== hb) return ha - hb;

      return String(a.key || "").localeCompare(String(b.key || ""));
    });

    return arr;
  }

  function getOccupiedSlots() {
    const slots = {};
    state.players.filter(p => p.playerKey).forEach(p => {
      const sid = `${p.teeTime}|${p.startHole}|${p.startHoleSuffix}`;
      if (!slots[sid]) {
        slots[sid] = {
          sid,
          meta: parseSlotId(sid),
          players: []
        };
      }
      slots[sid].players.push(p);
    });

    return Object.values(slots).sort((a, b) => compareSlotMeta(a.meta, b.meta));
  }

  function getCardPlayersBySid(sid) {
    return state.players.filter(p => `${p.teeTime}|${p.startHole}|${p.startHoleSuffix}` === sid);
  }

  function getShotgunOpenTarget(currentMeta, direction) {
    const currentHole = parseInt(currentMeta.hole || "0", 10);
    const currentSuffixRank = slotSuffixRank(currentMeta.suffix || "A");
    const suffixes = ["A", "B", "C", "D"];

    if (direction === "up") {
      for (let rank = currentSuffixRank - 1; rank >= 1; rank--) {
        const suffix = suffixes[rank - 1];
        const sid = `${currentMeta.time}|${currentHole}|${suffix}`;
        if (getPlayersInSlot(sid).length === 0) return sid;
      }

      for (let hole = currentHole - 1; hole >= 1; hole--) {
        for (const suffix of suffixes) {
          const sid = `${currentMeta.time}|${hole}|${suffix}`;
          if (getPlayersInSlot(sid).length === 0) return sid;
        }
      }
      return null;
    }

    for (let rank = currentSuffixRank + 1; rank <= suffixes.length; rank++) {
      const suffix = suffixes[rank - 1];
      const sid = `${currentMeta.time}|${currentHole}|${suffix}`;
      if (getPlayersInSlot(sid).length === 0) return sid;
    }

    for (let hole = currentHole + 1; hole <= 18; hole++) {
      for (const suffix of suffixes) {
        const sid = `${currentMeta.time}|${hole}|${suffix}`;
        if (getPlayersInSlot(sid).length === 0) return sid;
      }
    }

    return null;
  }

  function getTeeTimeOpenTarget(currentMeta, direction) {
    const currentMinutes = parseTimeToMinutes(currentMeta.time);
    const intervalMinutes = parseInt(state.interval, 10) || 9;
    if (!Number.isFinite(currentMinutes)) return null;

    let probe = currentMinutes + (direction === "up" ? -intervalMinutes : intervalMinutes);

    while (probe >= 0 && probe < (24 * 60)) {
      const sid = `${formatMinutesToTime(probe)}|1|`;
      if (getPlayersInSlot(sid).length === 0) return sid;
      probe += (direction === "up" ? -intervalMinutes : intervalMinutes);
    }

    return null;
  }

  function findPromoteTarget(sid, direction) {
    const occupied = getOccupiedSlots();
    const idx = occupied.findIndex(x => x.sid === sid);
    if (idx === -1) return null;

    const current = occupied[idx];
    const currentMeta = current.meta;

    const openSid = isShotgun()
      ? getShotgunOpenTarget(currentMeta, direction)
      : getTeeTimeOpenTarget(currentMeta, direction);

    if (openSid) {
      return { mode: "move", sid: openSid };
    }

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= occupied.length) return null;

    return { mode: "swap", sid: occupied[swapIdx].sid };
  }

  function moveCardToOpenSlot(sourceSid, targetSid) {
    const sourcePlayers = getCardPlayersBySid(sourceSid);
    if (!sourcePlayers.length) return;

    const targetMeta = parseSlotId(targetSid);

    sourcePlayers.forEach(p => {
      p.teeTime = targetMeta.time;
      p.startHole = targetMeta.hole;
      p.startHoleSuffix = targetMeta.suffix;
      markDirty(p.playerGHIN);
    });

    state.editMode = false;
    state.targetSlotId = "";
  }

  function swapCardSlotFields(sourceSid, targetSid) {
    const sourcePlayers = getCardPlayersBySid(sourceSid);
    const targetPlayers = getCardPlayersBySid(targetSid);
    if (!sourcePlayers.length || !targetPlayers.length) return;

    const sourceMeta = parseSlotId(sourceSid);
    const targetMeta = parseSlotId(targetSid);

    if (isShotgun()) {
      sourcePlayers.forEach(p => {
        p.startHole = targetMeta.hole;
        p.startHoleSuffix = targetMeta.suffix;
        markDirty(p.playerGHIN);
      });

      targetPlayers.forEach(p => {
        p.startHole = sourceMeta.hole;
        p.startHoleSuffix = sourceMeta.suffix;
        markDirty(p.playerGHIN);
      });
    } else {
      sourcePlayers.forEach(p => {
        p.teeTime = targetMeta.time;
        markDirty(p.playerGHIN);
      });

      targetPlayers.forEach(p => {
        p.teeTime = sourceMeta.time;
        markDirty(p.playerGHIN);
      });
    }

    state.editMode = false;
    state.targetSlotId = "";
  }

  function promoteSlot(sid, direction) {
    const target = findPromoteTarget(sid, direction);
    if (!target) {
      if (MA.setStatus) MA.setStatus(`No ${direction === "up" ? "earlier" : "later"} slot available.`, "info");
      return;
    }

    if (target.mode === "move") {
      moveCardToOpenSlot(sid, target.sid);
      if (MA.setStatus) {
        const meta = parseSlotId(target.sid);
        MA.setStatus(
          isShotgun()
            ? `Moved group to Hole ${meta.hole}${meta.suffix}.`
            : `Moved group to ${meta.time}.`,
          "success"
        );
      }
    } else {
      swapCardSlotFields(sid, target.sid);
      if (MA.setStatus) {
        MA.setStatus(
          isShotgun()
            ? `Swapped start positions with ${direction === "up" ? "previous" : "next"} group.`
            : `Swapped tee times with ${direction === "up" ? "previous" : "next"} group.`,
          "success"
        );
      }
    }

    render();
  }

  function canPromoteUp(sid) {
    return !!findPromoteTarget(sid, "up");
  }

  function canPromoteDown(sid) {
    return !!findPromoteTarget(sid, "down");
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

    const sortedSlots = sortSlotsForDisplay(Object.values(slots));

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
              <button class="iconBtn btnSecondary" type="button" data-action="promoteUp" data-sid="${sid}" title="Move Up" ${canPromoteUp(sid) ? "" : "disabled"}>
                ${ICONS.up}
              </button>
              <button class="iconBtn btnSecondary" type="button" data-action="promoteDown" data-sid="${sid}" title="Move Down" ${canPromoteDown(sid) ? "" : "disabled"}>
                ${ICONS.down}
              </button>
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
        render();
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

      if (action === "promoteUp") {
        promoteSlot(a.dataset.sid, "up");
      }

      if (action === "promoteDown") {
        promoteSlot(a.dataset.sid, "down");
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