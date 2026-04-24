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
    panelsWrap: document.querySelector("#gsTabPanels .gpTabPanel"),
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

  const AUTO_SLOT_SORT_OPTIONS = [
    { value: "pairingId", label: "As Paired" },
    { value: "lowFirst", label: "by Low HI" },
    { value: "highFirst", label: "by High HC" },
    { value: "balanced", label: "Balanced / Interleaved" },
    { value: "random", label: "Randomly" }
  ];

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
  function isShotgun() { return state.toMethod === "ShotGun"; }
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
    if (!raw) return null;

    // 12-hour with optional seconds and optional space before AM/PM
    let m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)\b/i);
    if (m) {
      let hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      const meridiem = m[3].toUpperCase();

      if (hour === 12) hour = 0;
      if (meridiem === "PM") hour += 12;

      return hour * 60 + minute;
    }

    // 24-hour with optional seconds
    m = raw.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:$|\s)/);
    if (m) {
      const hour = parseInt(m[1], 10);
      const minute = parseInt(m[2], 10);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return hour * 60 + minute;
      }
    }

    return null;
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
    const raw = String(init.game?.dbGames_PlayTime || "").trim();
    if (!raw) return "08:00 AM";

    const mins = parseTimeToMinutes(raw);
    return mins != null ? formatMinutesToTime(mins) : raw;
  }

  function getAllowedHoleRange() {
    const raw = String(init.game?.dbGames_Holes || "").trim().toLowerCase();

    if (raw === "f9") {
      return { min: 1, max: 9 };
    }

    if (raw === "b9") {
      return { min: 10, max: 18 };
    }

    return { min: 1, max: 18 };
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

  function getBlockIdForPlayer(p) {
  return isPairPair()
    ? String(p.flightId || "").trim()
    : String(p.pairingId || "").trim();
}

function normalizeBlockId(v) {
  return String(v || "").trim();
}

function phValue(p) {
  const v = p.ph ?? p.ch ?? p.hi ?? 999;
  const n = Number(v);
  return Number.isFinite(n) ? n : 999;
}

function average(nums) {
  if (!nums.length) return 999;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function getUnassignedGroups() {
  const byBlock = {};

  state.players.forEach((p) => {
    const playerKey = String(p.playerKey || "").trim();
    if (playerKey !== "") return;

    const blockId = getBlockIdForPlayer(p);
    if (!blockId) return;

    if (!byBlock[blockId]) {
      byBlock[blockId] = {
        blockId,
        pairingId: blockId,
        players: []
      };
    }
    byBlock[blockId].players.push(p);
  });

  return Object.values(byBlock).map((g) => ({
    blockId: g.blockId,
    pairingId: g.blockId,
    players: g.players,
    size: g.players.length,
    avgHandicap: average(g.players.map(phValue))
  }));
}

function getAutoSlotGroupLabel(group) {
  const names = group.players
    .map((p) => String(p.lName || p.name || "").trim())
    .filter(Boolean);

  return {
    pairingId: group.blockId,
    playerLastNames: names
  };
}

function shuffleArray(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const AutoSlotEngine = {
  validateConfig(cfg, groups) {
    if (!groups.length) {
      return { ok: false, message: "All pairings are already assigned." };
    }

    if (cfg.toMethod === "TeeTimes") {
      if (parseTimeToMinutes(cfg.startTime) == null) {
        return { ok: false, message: "Please enter a valid start time." };
      }
      if (!Number.isFinite(Number(cfg.intervalMinutes)) || Number(cfg.intervalMinutes) < 1) {
        return { ok: false, message: "Please enter a valid interval." };
      }
      if (cfg.startHole === "split" && !(cfg.holesScope.min === 1 && cfg.holesScope.max === 18)) {
        return { ok: false, message: "Split tee is only available for All 18 games." };
      }
      return { ok: true, message: "" };
    }

    const stacksNeeded = this.requiredStacks(groups, cfg.holesScope);
    if ((cfg.stackedHoles || []).length < stacksNeeded) {
      return {
        ok: false,
        message: `${groups.length} groups require ${stacksNeeded} stacked holes. Please check ${stacksNeeded} holes to stack.`
      };
    }

    const startHole = parseInt(cfg.startHole, 10);
    if (!Number.isFinite(startHole) || startHole < cfg.holesScope.min || startHole > cfg.holesScope.max) {
      return { ok: false, message: "Please enter a valid shotgun starting hole." };
    }

    return { ok: true, message: "" };
  },

  getHoleSequence(cfg) {
    const { min, max } = cfg.holesScope;
    const start = parseInt(cfg.startHole, 10);
    const total = max - min + 1;
    const sequence = [];
    for (let i = 0; i < total; i++) {
      const hole = ((start - min + i) % total) + min;
      sequence.push(hole);
    }
    return sequence;
  },

  requiredStacks(groups, holesScope) {
    const holesCount = (holesScope.max - holesScope.min + 1);
    return Math.max(0, groups.length - holesCount);
  },

  sortGroups(sortOrder, groups) {
    const src = groups.slice();

    if (sortOrder === "random") return shuffleArray(src);

    if (sortOrder === "pairingId") {
      return src.sort((a, b) => String(a.blockId).localeCompare(String(b.blockId), undefined, { numeric: true }));
    }

    if (sortOrder === "lowFirst") {
      return src.sort((a, b) => a.avgHandicap - b.avgHandicap);
    }

    if (sortOrder === "highFirst") {
      return src.sort((a, b) => b.avgHandicap - a.avgHandicap);
    }

    if (sortOrder === "balanced") {
      const ranked = src.sort((a, b) => a.avgHandicap - b.avgHandicap);
      const out = [];
      let lo = 0;
      let hi = ranked.length - 1;
      while (lo <= hi) {
        out.push(ranked[lo++]);
        if (lo <= hi) out.push(ranked[hi--]);
      }
      return out;
    }

    return src;
  },

  buildSlots(cfg, neededCount) {
    const slots = [];

    if (cfg.toMethod === "TeeTimes") {
      const startMinutes = parseTimeToMinutes(cfg.startTime);
      const interval = Number(cfg.intervalMinutes) || 9;

      for (let i = 0; i < neededCount; i++) {
        const time = formatMinutesToTime(startMinutes + (i * interval));
        let hole = "1";

        if (cfg.startHole === "10") hole = "10";
        if (cfg.startHole === "split") hole = (i % 2 === 0) ? "1" : "10";

        slots.push({ time, hole, suffix: "" });
      }

      return slots;
    }

    const orderedHoles = this.getHoleSequence(cfg);
    const stacked = new Set((cfg.stackedHoles || []).map((n) => parseInt(n, 10)));
    const playTime = getDefaultStartTime();

    orderedHoles.forEach((hole) => {
      slots.push({ time: playTime, hole: String(hole), suffix: "" });
      if (stacked.has(hole)) {
        slots.push({ time: playTime, hole: String(hole), suffix: "B" });
      }
    });

    return slots;
  },

  run(cfg, groups) {
    const valid = this.validateConfig(cfg, groups);
    if (!valid.ok) {
      return { ok: false, slots: [], unassigned: groups.slice(), message: valid.message };
    }

    const sortedGroups = this.sortGroups(cfg.sortOrder, groups);
    const slotsSeed = this.buildSlots(cfg, sortedGroups.length);

    const slots = slotsSeed.map((s) => ({
      time: s.time,
      hole: s.hole,
      suffix: s.suffix,
      playerKey: randPlayerKey(),
      golferCount: 0,
      groups: []
    }));

    const unassigned = [];
    let slotIndex = 0;
    let currentCount = 0;

    sortedGroups.forEach((group) => {
      while (slotIndex < slots.length && currentCount + group.size > 4) {
        slotIndex += 1;
        currentCount = 0;
      }

      if (slotIndex >= slots.length) {
        unassigned.push(group);
        return;
      }

      const slot = slots[slotIndex];
      slot.groups.push(getAutoSlotGroupLabel(group));
      slot.golferCount += group.size;
      currentCount += group.size;
    });

    return {
      ok: true,
      slots: slots.filter((s) => s.groups.length > 0),
      unassigned,
      message: ""
    };
  }
};

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
        const updatedSlotPlayers = getPlayersInSlot(currentSlotId);
        if (updatedSlotPlayers.length >= 4) {
          currentSlotId = getNextAvailableSlot(currentSlotId);
        }
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

  function getCardPlayersByKey(playerKey) {
  return state.players.filter(p => String(p.playerKey || "") === String(playerKey || ""));
}

function getDisplayedCards() {
  const cards = {};

  state.players
    .filter(p => String(p.playerKey || "").trim() !== "")
    .forEach(p => {
      const key = String(p.playerKey || "").trim();
      if (!cards[key]) {
        cards[key] = {
          key,
          players: [],
          meta: {
            time: p.teeTime || "",
            hole: p.startHole || "",
            suffix: p.startHoleSuffix || ""
          }
        };
      }
      cards[key].players.push(p);
    });

  return Object.values(cards).sort((a, b) => compareSlotMeta(a.meta, b.meta));
}

function findDisplayedCardByKey(cards, playerKey) {
  return cards.find(c => String(c.key || "") === String(playerKey || "")) || null;
}

function findDisplayedCardBySlot(cards, attrs, excludingKey) {
  return cards.find(c =>
    String(c.key || "") !== String(excludingKey || "") &&
    String(c.meta.time || "") === String(attrs.time || "") &&
    String(c.meta.hole || "") === String(attrs.hole || "") &&
    String(c.meta.suffix || "") === String(attrs.suffix || "")
  ) || null;
}

function applySlotAttrsToCard(playerKey, attrs) {
  const players = getCardPlayersByKey(playerKey);
  if (!players.length) return;

  players.forEach(p => {
    p.teeTime = String(attrs.time || "");
    p.teeTimeMinutes = parseTimeToMinutes(p.teeTime);
    p.startHole = String(attrs.hole || "");
    p.startHoleNumber = parseInt(String(attrs.hole || "0"), 10) || 0;
    p.startHoleSuffix = String(attrs.suffix || "").toUpperCase();
    markDirty(p.playerGHIN);
  });
}

  function slotSuffixRank(suffix) {
    const s = String(suffix || "").trim().toUpperCase();
    if (!s) return 0;
    return s.charCodeAt(0) - 64; // A=1, B=2, ...
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

    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;

    const rawTimeCompare = String(a.time || "").localeCompare(String(b.time || ""));
    if (rawTimeCompare !== 0) return rawTimeCompare;

    const holeA = parseInt(a.hole || "0", 10);
    const holeB = parseInt(b.hole || "0", 10);
    if (holeA !== holeB) return holeA - holeB;

    return slotSuffixRank(a.suffix) - slotSuffixRank(b.suffix);
  }

  function makeSlotAttrs(time, hole, suffix) {
  return {
    time: String(time || ""),
    hole: String(hole || ""),
    suffix: String(suffix || "").toUpperCase()
  };
}

function earliestOpenSuffixOnHole(cards, time, hole, excludingKey) {
  const suffixes = ["A", "B", "C", "D"];
  for (const suffix of suffixes) {
    const attrs = makeSlotAttrs(time, hole, suffix);
    if (!findDisplayedCardBySlot(cards, attrs, excludingKey)) return attrs;
  }
  return null;
}

function nextOpenSuffixOnHole(cards, time, hole, currentSuffix, excludingKey) {
  const suffixes = ["A", "B", "C", "D"];
  const startIdx = Math.max(0, suffixes.indexOf(String(currentSuffix || "").toUpperCase()));
  for (let i = startIdx + 1; i < suffixes.length; i++) {
    const attrs = makeSlotAttrs(time, hole, suffixes[i]);
    if (!findDisplayedCardBySlot(cards, attrs, excludingKey)) return attrs;
  }
  return null;
}

function deriveTeeTarget(card, direction) {
  const currentMinutes = parseTimeToMinutes(card.meta.time);
  const intervalMinutes = parseInt(state.interval, 10) || 9;
  if (!Number.isFinite(currentMinutes)) return null;

  const nextMinutes = currentMinutes + (direction === "up" ? -intervalMinutes : intervalMinutes);
  if (nextMinutes < 0 || nextMinutes >= 24 * 60) return null;

  return makeSlotAttrs(
    formatMinutesToTime(nextMinutes),
    card.meta.hole || "1",
    ""
  );
}

function deriveShotgunUpTarget(card, cards) {
  const hole = parseInt(card.meta.hole || "0", 10);
  const suffix = String(card.meta.suffix || "").toUpperCase();
  const range = getAllowedHoleRange();

  // If already on B/C/D, move to previous suffix on same hole.
  if (suffix && suffix !== "A") {
    const prevSuffix = String.fromCharCode(suffix.charCodeAt(0) - 1);
    return makeSlotAttrs(card.meta.time, hole, prevSuffix);
  }

  // If on A, respect the configured lower boundary.
  if (hole <= range.min) return null;

  const targetHole = hole - 1;

  const openAttrs = earliestOpenSuffixOnHole(cards, card.meta.time, targetHole, card.key);
  if (openAttrs) return openAttrs;

  // If no open suffix on previous hole, target the primary slot on that hole for a swap.
  return makeSlotAttrs(card.meta.time, targetHole, "A");
}

function deriveShotgunDownTarget(card) {
  const hole = parseInt(card.meta.hole || "0", 10);
  const suffix = String(card.meta.suffix || "").toUpperCase();
  const range = getAllowedHoleRange();

  // Within the configured upper boundary hole, continue through suffixes until D.
  if (hole >= range.max) {
    if (!suffix || suffix === "D") return null;
    const nextSuffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
    return makeSlotAttrs(card.meta.time, range.max, nextSuffix);
  }

  // Otherwise Down targets the next hole primary slot.
  return makeSlotAttrs(card.meta.time, hole + 1, "A");
}

function moveCardByKey(playerKey, targetAttrs) {
  applySlotAttrsToCard(playerKey, targetAttrs);
  state.editMode = false;
  state.targetSlotId = "";
}

function swapCardsByKey(sourceKey, targetKey, sourceAttrs, targetAttrs) {
  applySlotAttrsToCard(sourceKey, targetAttrs);
  applySlotAttrsToCard(targetKey, sourceAttrs);
  state.editMode = false;
  state.targetSlotId = "";
}

function displaceCardOnHole(cards, displacedKey, occupiedAttrs) {
  const openAttrs = nextOpenSuffixOnHole(cards, occupiedAttrs.time, occupiedAttrs.hole, occupiedAttrs.suffix, displacedKey);
  if (!openAttrs) return false;
  applySlotAttrsToCard(displacedKey, openAttrs);
  return true;
}

function promoteTeeTime(playerKey, direction) {
  const cards = getDisplayedCards();
  const source = findDisplayedCardByKey(cards, playerKey);
  if (!source) return;

  const sourceAttrs = makeSlotAttrs(source.meta.time, source.meta.hole, "");
  const targetAttrs = deriveTeeTarget(source, direction);
  if (!targetAttrs) {
    if (MA.setStatus) MA.setStatus(`No ${direction === "up" ? "earlier" : "later"} slot available.`, "info");
    return;
  }

  const affected = findDisplayedCardBySlot(cards, targetAttrs, source.key);

  if (!affected) {
    moveCardByKey(source.key, targetAttrs);
    if (MA.setStatus) MA.setStatus(`Moved group to ${targetAttrs.time}.`, "success");
  } else {
    const affectedAttrs = makeSlotAttrs(affected.meta.time, affected.meta.hole, "");
    swapCardsByKey(source.key, affected.key, sourceAttrs, affectedAttrs);
    if (MA.setStatus) MA.setStatus(`Swapped tee times with ${direction === "up" ? "previous" : "next"} group.`, "success");
  }

  render();
}

function promoteShotgunUp(playerKey) {
  const cards = getDisplayedCards();
  const source = findDisplayedCardByKey(cards, playerKey);
  if (!source) return;

  const sourceAttrs = makeSlotAttrs(source.meta.time, source.meta.hole, source.meta.suffix);
  const targetAttrs = deriveShotgunUpTarget(source, cards);
  if (!targetAttrs) {
    if (MA.setStatus) MA.setStatus("No earlier slot available.", "info");
    return;
  }

  const affected = findDisplayedCardBySlot(cards, targetAttrs, source.key);

  if (!affected) {
    moveCardByKey(source.key, targetAttrs);
    if (MA.setStatus) MA.setStatus(`Moved group to Hole ${targetAttrs.hole}${targetAttrs.suffix}.`, "success");
  } else {
    const affectedAttrs = makeSlotAttrs(affected.meta.time, affected.meta.hole, affected.meta.suffix);
    swapCardsByKey(source.key, affected.key, sourceAttrs, affectedAttrs);
    if (MA.setStatus) MA.setStatus("Swapped start positions with previous group.", "success");
  }

  render();
}

function promoteShotgunDown(playerKey) {
  const cards = getDisplayedCards();
  const source = findDisplayedCardByKey(cards, playerKey);
  if (!source) return;

  const sourceAttrs = makeSlotAttrs(source.meta.time, source.meta.hole, source.meta.suffix);
  const targetAttrs = deriveShotgunDownTarget(source);
  if (!targetAttrs) {
    if (MA.setStatus) MA.setStatus("No later slot available.", "info");
    return;
  }

  const affected = findDisplayedCardBySlot(cards, targetAttrs, source.key);

  if (!affected) {
    moveCardByKey(source.key, targetAttrs);
    if (MA.setStatus) MA.setStatus(`Moved group to Hole ${targetAttrs.hole}${targetAttrs.suffix}.`, "success");
    render();
    return;
  }

  // Downward shotgun rule: moving card takes target slot; displaced card moves to next open suffix on same hole.
  const displaced = displaceCardOnHole(cards, affected.key, targetAttrs);
  if (!displaced) {
    if (MA.setStatus) MA.setStatus("No open suffix available to displace the affected group.", "warn");
    return;
  }

  moveCardByKey(source.key, targetAttrs);
  if (MA.setStatus) MA.setStatus(`Moved group to Hole ${targetAttrs.hole}${targetAttrs.suffix}.`, "success");
  render();
}

function promoteCard(playerKey, direction) {
  if (isShotgun()) {
    if (direction === "up") promoteShotgunUp(playerKey);
    else promoteShotgunDown(playerKey);
    return;
  }

  promoteTeeTime(playerKey, direction);
}

function canPromoteUp(playerKey) {
  const cards = getDisplayedCards();
  const source = findDisplayedCardByKey(cards, playerKey);
  if (!source) return false;

  if (isShotgun()) return !!deriveShotgunUpTarget(source, cards);
  return !!deriveTeeTarget(source, "up");
}

function canPromoteDown(playerKey) {
  const cards = getDisplayedCards();
  const source = findDisplayedCardByKey(cards, playerKey);
  if (!source) return false;

  if (isShotgun()) return !!deriveShotgunDownTarget(source);
  return !!deriveTeeTarget(source, "down");
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
      const cards = getDisplayedCards();

      if (!cards.length) {
        el.canvas.innerHTML = `<div class="maEmpty">No slots assigned yet. Select from the tray to begin.</div>`;
        return;
      }

      el.canvas.innerHTML = cards.map(card => {
        const sid = `${card.meta.time}|${card.meta.hole}|${card.meta.suffix}`;
        const isTarget = state.targetSlotId === sid;
        const title = `${card.meta.time} • Hole ${card.meta.hole}${card.meta.suffix}`;
      
      // Group players inside the card by PairingID/FlightID for removal logic
      const blockGroups = {};
      card.players.forEach(p => {
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
        <div class="gpGroupCard ${isTarget ? "is-target" : ""} ${state.allCollapsed ? "is-collapsed" : ""}" data-playerkey="${esc(card.key)}">
          <div class="gpGroupCard__hdr gpGroupCard__hdr--expanded">
            <button class="iconBtn btnSecondary" type="button" data-action="toggle-collapse">
              ${ICONS.minus}
            </button>
            <div class="gpGroupCard__title">${title} • <small>${card.key}</small></div>
             <div class="gpCardActions">
              <button class="iconBtn btnSecondary" type="button" data-action="promoteUp" data-playerkey="${esc(card.key)}" title="Move Up" ${canPromoteUp(card.key) ? "" : "disabled"}>
                ${ICONS.up}
              </button>
              <button class="iconBtn btnSecondary" type="button" data-action="promoteDown" data-playerkey="${esc(card.key)}" title="Move Down" ${canPromoteDown(card.key) ? "" : "disabled"}>
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
            <div class="gpGroupCard__title">${title} (${card.players.length} players)</div>
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

  function renderAutoSlotModeFields(dialog, groups) {
  const modeFields = dialog.querySelector("#asModeFields");
  if (!modeFields) return;

  const range = getAllowedHoleRange();
  const isAll18 = range.min === 1 && range.max === 18;

  if (!isShotgun()) {
    modeFields.innerHTML = `
      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel" for="asStartTime">Start Time</label>
          <input id="asStartTime" class="maTextInput" type="text" value="${esc(getDefaultStartTime())}">
        </div>
        <div class="maField">
          <label class="maLabel" for="asInterval">Interval (min)</label>
          <input id="asInterval" class="maTextInput" type="number" min="1" step="1" value="${esc(state.interval || 9)}">
        </div>
      </div>

      <div class="maFieldRow">
        <div class="maField">
          <label class="maLabel">Start Hole</label>
          <div class="asStartHoleChips">
            <button type="button" class="maChoiceChip is-selected" data-as-start-hole="1">Hole 1</button>
            <button type="button" class="maChoiceChip" data-as-start-hole="10">Hole 10</button>
            ${isAll18 ? `<button type="button" class="maChoiceChip" data-as-start-hole="split">Split</button>` : ``}
          </div>
          <input id="asStartHoleValue" type="hidden" value="1">
        </div>
      </div>
    `;
    return;
  }

  const holeItems = [];
  for (let h = range.min; h <= range.max; h++) {
    holeItems.push(`
      <label class="asStackGrid__item">
        <input type="checkbox" value="${h}">
        <span>${h}</span>
      </label>
    `);
  }

  const stacksNeeded = AutoSlotEngine.requiredStacks(groups, range);

  modeFields.innerHTML = `
    <div class="maFieldRow">
      <div class="maField">
        <label class="maLabel" for="asStartHole">Start Hole</label>
        <input id="asStartHole" class="maTextInput" type="number" min="${range.min}" max="${range.max}" step="1" value="${range.min}">
      </div>
    </div>

    <div class="maFieldRow">
      <div class="maField">
        <label class="maLabel">Stack these holes</label>
        <div id="asStackGrid" class="asStackGrid">${holeItems.join("")}</div>
        <div id="asStackInfo" class="asStackInfo">${groups.length} groups • ${range.max - range.min + 1} holes • ${stacksNeeded} stacks needed</div>
      </div>
    </div>
  `;
}

function updateAutoSlotStartHoleChips(dialog) {
  const selected = dialog.querySelector("#asStartHoleValue")?.value || "1";
  dialog.querySelectorAll("[data-as-start-hole]").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.asStartHole === selected);
  });
}

function updateAutoSlotStackInfo(dialog, groups) {
  const info = dialog.querySelector("#asStackInfo");
  if (!info) return;

  const range = getAllowedHoleRange();
  const selectedCount = dialog.querySelectorAll("#asStackGrid input:checked").length;
  const needed = AutoSlotEngine.requiredStacks(groups, range);

  info.classList.remove("asStackInfo--warn", "asStackInfo--ok");
  info.textContent = `${groups.length} groups • ${range.max - range.min + 1} holes • ${needed} stacks needed`;

  if (needed <= 0) return;
  if (selectedCount < needed) {
    info.classList.add("asStackInfo--warn");
  } else {
    info.classList.add("asStackInfo--ok");
  }
}

function buildAutoSlotConfig(dialog) {
  const range = getAllowedHoleRange();

  if (!isShotgun()) {
    return {
      sortOrder: dialog.querySelector("#asSortOrder")?.value || "pairingId",
      toMethod: "TeeTimes",
      startTime: dialog.querySelector("#asStartTime")?.value || getDefaultStartTime(),
      intervalMinutes: Number(dialog.querySelector("#asInterval")?.value || state.interval || 9),
      startHole: dialog.querySelector("#asStartHoleValue")?.value || "1",
      holesScope: range,
      stackedHoles: []
    };
  }

  return {
    sortOrder: dialog.querySelector("#asSortOrder")?.value || "pairingId",
    toMethod: "Shotgun",
    startTime: getDefaultStartTime(),
    intervalMinutes: Number(state.interval || 9),
    startHole: dialog.querySelector("#asStartHole")?.value || String(range.min),
    holesScope: range,
    stackedHoles: Array.from(dialog.querySelectorAll("#asStackGrid input:checked")).map((cb) => Number(cb.value))
  };
}

function getAutoSlotSortLabel(sortOrder) {
  switch (String(sortOrder || "")) {
    case "lowFirst":
      return "Low First";
    case "highFirst":
      return "High First";
    case "balanced":
      return "Balanced";
    case "random":
      return "Random";
    case "pairingId":
    default:
      return "as Paired";
  }
}

function renderAutoSlotSortOptions(dialog, selectedValue = "pairingId") {
  const select = dialog.querySelector("#asSortOrder");
  if (!select) return;

  select.innerHTML = AUTO_SLOT_SORT_OPTIONS.map((opt) => `
    <option value="${esc(opt.value)}" ${opt.value === selectedValue ? "selected" : ""}>
      ${esc(opt.label)}
    </option>
  `).join("");
}

function renderAutoSlotPreview(dialog, result, cfg) {
  const summary = dialog.querySelector("#asPreviewSummary");
  const list = dialog.querySelector("#asPreviewList");

  if (!summary || !list) return;

  const sortLabel = getAutoSlotSortLabel(cfg?.sortOrder);

  if (!result.unassigned.length) {
    summary.textContent = `✓ ${result.slots.length} slots assigned using ${sortLabel}.`;
    summary.className = "asStackInfo asStackInfo--ok";
  } else {
    summary.textContent = `⚠ ${result.slots.length} slots assigned using ${sortLabel} — ${result.unassigned.length} groups could not fit.`;
    summary.className = "asStackInfo asStackInfo--warn";
  }

  list.innerHTML = result.slots.map((slot) => {
    const slotLabel = isShotgun()
      ? `Hole ${slot.hole}${slot.suffix}`
      : slot.time;

    const names = slot.groups
      .map((g) => g.playerLastNames.join(", "))
      .join(" • ");

    return `
      <div class="maListRow asPreviewRow">
        <div class="asPreviewRow__slot">${esc(slotLabel)}</div>
        <div class="asPreviewRow__count">${esc(slot.golferCount)}</div>
        <div class="asPreviewRow__names">${esc(names)}</div>
      </div>
    `;
  }).join("");
}

function applyAutoSlotGroups(slots) {
  slots.forEach((slot) => {
    slot.groups.forEach((group) => {
      state.players
        .filter((p) => normalizeBlockId(getBlockIdForPlayer(p)) === normalizeBlockId(group.pairingId))
        .forEach((p) => {
          p.teeTime = slot.time;
          p.teeTimeMinutes = parseTimeToMinutes(slot.time);
          p.startHole = String(slot.hole);
          p.startHoleNumber = parseInt(slot.hole, 10) || 0;
          p.startHoleSuffix = slot.suffix;
          p.playerKey = slot.playerKey;
          markDirty(p.playerGHIN);
        });
    });
  });

  render();
  if (MA.setStatus) MA.setStatus(`Auto-slotted ${slots.length} slots. Review and Save when ready.`, "success");
}

function openAutoSlotModal() {
  const dialog = document.getElementById("gsAutoSlotDialog");
  if (!dialog) return;

  const groups = getUnassignedGroups();
  const golfers = groups.reduce((s, g) => s + g.size, 0);
  const subtitle = dialog.querySelector("#asSubtitle");
  const msg = dialog.querySelector("#asMsg");
  const controls = dialog.querySelector("#asControls");
  const body = dialog.querySelector("#asBody");
  const btnRun = dialog.querySelector("#asBtnRun");
  const btnRetry = dialog.querySelector("#asBtnRetry");
  const btnApply = dialog.querySelector("#asBtnApply");
  const btnClose = dialog.querySelector("#asBtnClose");
  const btnCancel = dialog.querySelector("#asBtnCancel");

  if (subtitle) subtitle.textContent = `${groups.length} Groups • ${golfers} Golfers`;
  if (msg) msg.textContent = "";

  renderAutoSlotSortOptions(dialog, "pairingId");
  renderAutoSlotModeFields(dialog, groups);
  updateAutoSlotStartHoleChips(dialog);
  updateAutoSlotStackInfo(dialog, groups);

  controls.style.display = "block";
  body.style.display = "none";
  btnRun.style.display = "inline-flex";
  btnRetry.style.display = "none";
  btnApply.style.display = "none";

  let lastResult = null;

  function closeDialog() {
    dialog.classList.remove("is-open");
    if (dialog.open) dialog.close();
  }

  dialog.oncancel = (e) => {
    e.preventDefault();
    closeDialog();
  };

  dialog.onclick = (e) => {
    if (e.target === dialog) closeDialog();
  };

  dialog.querySelectorAll("[data-as-start-hole]").forEach((btn) => {
    btn.onclick = () => {
      const hidden = dialog.querySelector("#asStartHoleValue");
      if (hidden) hidden.value = btn.dataset.asStartHole || "1";
      updateAutoSlotStartHoleChips(dialog);
    };
  });

  dialog.querySelectorAll("#asStackGrid input").forEach((cb) => {
    cb.onchange = () => updateAutoSlotStackInfo(dialog, groups);
  });

  btnRun.onclick = () => {
    const cfg = buildAutoSlotConfig(dialog);
    const result = AutoSlotEngine.run(cfg, groups);

    if (!result.ok) {
      if (msg) msg.textContent = result.message || "Unable to auto slot.";
      return;
    }

    lastResult = result;
    if (msg) msg.textContent = "";

    renderAutoSlotPreview(dialog, result, cfg);

    controls.style.display = "none";
    body.style.display = "block";
    btnRun.style.display = "none";
    btnRetry.style.display = "inline-flex";
    btnApply.style.display = "inline-flex";
  };

  btnRetry.onclick = () => {
    body.style.display = "none";
    controls.style.display = "block";
    btnApply.style.display = "none";
    btnRetry.style.display = "none";
    btnRun.style.display = "inline-flex";
  };

  btnApply.onclick = () => {
    if (!lastResult || !lastResult.ok) return;
    applyAutoSlotGroups(lastResult.slots);
    closeDialog();
  };

  btnClose.onclick = closeDialog;
  btnCancel.onclick = closeDialog;

  dialog.classList.add("is-open");
    if (!dialog.open) dialog.showModal();

    // On mobile, when the keyboard opens it reduces the viewport.
    // Scroll the active input into view so it stays above the keyboard.
    dialog.addEventListener("focusin", (e) => {
      if (e.target.matches("input, select, textarea")) {
        setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
      }
    }, { once: false });
}

function onResetChanges() {
  if (state.dirty.size === 0) {
    if (MA.setStatus) MA.setStatus("No unsaved changes to reset.", "info");
    return;
  }

  if (confirm("Discard all unsaved changes and revert to last save?")) {
    window.location.reload();
  }
}

  // ---- Actions ----
  async function doSave() {
    if (state.busy || state.dirty.size === 0) return;
    setBusy(true);
    if (MA.setStatus) MA.setStatus("Saving slot assignments.", "info");

    const payload = {
      ggid: state.ggid,
      assignments: Array.from(state.dirty).map((ghin) => {
        const p = state.players.find((x) => x.playerGHIN === ghin);
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
      const res = await MA.postJson(MA.routes?.apiSave || "/api/game_pairings/savePairings.php", payload);
      if (res.ok) {
        state.dirty.clear();
        if (MA.setStatus) MA.setStatus("Saved successfully.", "success");
        render();
      } else {
        throw new Error(res.message || "Save failed.");
      }
    } catch (e) {
      if (MA.setStatus) MA.setStatus(e.message || "Save failed.", "danger");
    } finally {
      setBusy(false);
    }
  }

  function unslotBlock(blockId) {
    const block = getBlockPlayers(blockId);
    block.forEach(p => {
      p.teeTime = "";
      p.teeTimeMinutes = null;
      p.startHole = "";
      p.startHoleNumber = 0;
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
      p.teeTimeMinutes = null;
      p.startHole = "";
      p.startHoleNumber = 0;
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
        promoteCard(a.dataset.playerkey, "up");
      }

      if (action === "promoteDown") {
        promoteCard(a.dataset.playerkey, "down");
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
    return rows.map(r => {
      const rawTeeTime = String(r.dbPlayers_TeeTime || "").trim();
      const teeTimeMinutes = parseTimeToMinutes(rawTeeTime);

      return {
        playerGHIN: String(r.dbPlayers_PlayerGHIN || ""),
        name: String(r.dbPlayers_Name || ""),
        lName: String(r.dbPlayers_LName || ""),
        pairingId: String(r.dbPlayers_PairingID || "000"),
        flightId: String(r.dbPlayers_FlightID || ""),
        teeTime: teeTimeMinutes != null ? formatMinutesToTime(teeTimeMinutes) : rawTeeTime,
        teeTimeMinutes: teeTimeMinutes,
        startHole: String(r.dbPlayers_StartHole || "").trim(),
        startHoleNumber: parseInt(String(r.dbPlayers_StartHole || "").trim() || "0", 10) || 0,
        startHoleSuffix: String(r.dbPlayers_StartHoleSuffix || "").trim().toUpperCase(),
        playerKey: String(r.dbPlayers_PlayerKey || ""),
        ph: Number(r.dbPlayers_PH ?? ""),
        ch: Number(r.dbPlayers_CH ?? ""),
        hi: Number(r.dbPlayers_HI ?? ""),
        size: 1
      };
    });
  }

  function applyChrome() {
    if (chrome.setHeaderLines) {
      chrome.setHeaderLines([
        "Tee Assignments",
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
      { label: "Open Auto Slotting", action: () => openAutoSlotModal() },
      { separator: true },
      { separator: true },
      { label: "Game Settings", action: () => MA.routerGo("settings") },
      { separator: true },
      { separator: true },
      { label: "Reset Changes to Last Save", action: () => onResetChanges(), danger: true }
    ]);
  }

  function initialize() {
    state.players = normalizePlayers(init.players || []);
    applyChrome();
    wireEvents();

    // Move Assign button to the controls area and apply standard classes
    const trayPanel = el.trayList.closest('.maPanel');
    if (trayPanel) {
      const controlsArea = trayPanel.querySelector('.maPanel__controls');
      if (controlsArea && el.btnAssign) {
        controlsArea.appendChild(el.btnAssign);
        el.btnAssign.classList.add('btn', 'btnSecondary');
      }
    }

    render();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();