/* /assets/modules/module_sourceEventRoster.js
 * MA.eventRosterSource — Event Roster enrollment source module.
 *
 * Used exclusively by game_players.js when operating in event mode
 * (dbGames_EID is present on the game object). Presents the event
 * roster from db_EventPlayers as a selectable list for round enrollment.
 *
 * Public API:
 *   MA.eventRosterSource.mount(cfg)
 *   MA.eventRosterSource.refresh(controlsEl)
 *
 * mount() cfg:
 *   controlsEl    {HTMLElement}        renders controls (filter + Multi-Add)
 *   bodyEl        {HTMLElement}        renders rows
 *   eventId       {string}             EID for the linked event
 *   apiPath       {string}             getEventRoster endpoint
 *   existingGHINs {Set}                players already enrolled in this round
 *   onSelect      {function(player)}   single-add callback
 *   onSelectMany  {function(players)}  multi-add confirm callback
 *
 * Normalized player object (extends standard shape per spec §11.5):
 *   ghin, first_name, last_name, name, gender, hi,
 *   club_name, email, mobile, recentTeeSetId,
 *   teamKey, pairingId, pairingPos,   ← event-specific fields
 *   source: "eventRoster"
 *
 * Dependencies:
 *   ma_shared.js loaded first (MA.postJson, MA.setStatus)
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.eventRosterSource = MA.eventRosterSource || {};

  // ── Utilities ───────────────────────────────────────────────────────────────
  function safe(v) { return (v == null) ? "" : String(v); }
  function esc(v) {
    return safe(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ── SVG icons ───────────────────────────────────────────────────────────────
  const ICON_CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const ICON_ADD   = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

  // ── WeakMap sticky state ────────────────────────────────────────────────────
  const _states = new WeakMap();

  function _getState(controlsEl) {
    return _states.get(controlsEl) || null;
  }

  function _initState(controlsEl, cfg) {
    const st = {
      // Data
      players:          [],
      // Filter state
      nameFilter:       "",
      // Multi-add state
      multiAddMode:     false,
      multiAddSelected: [],
      // Scroll
      scrollTop:        0,
      // Live cfg refs
      existingGHINs:    cfg.existingGHINs instanceof Set ? cfg.existingGHINs : new Set(),
      onSelect:         cfg.onSelect     || null,
      onSelectMany:     cfg.onSelectMany || null,
      apiPath:          cfg.apiPath      || "",
      eventId:          safe(cfg.eventId || ""),
      bodyEl:           cfg.bodyEl       || null,
      _controlsEl:      controlsEl,
    };
    _states.set(controlsEl, st);
    return st;
  }

  // ── Data fetch ──────────────────────────────────────────────────────────────
  async function _fetchRoster(st) {
    if (!st.apiPath) return;
    const res = await MA.postJson(st.apiPath, {});
    st.players = Array.isArray(res?.payload?.roster) ? res.payload.roster : [];
  }

  // ── Normalize player (spec §11.5) ───────────────────────────────────────────
  function _normalize(p) {
    const fullName  = safe(p.dbEventPlayers_Name || "");
    const lastName  = safe(p.dbEventPlayers_LName || "");
    const firstName = fullName.replace(lastName, "").trim();

    return {
      ghin:           safe(p.dbEventPlayers_GHIN),
      first_name:     firstName,
      last_name:      lastName,
      name:           fullName,
      gender:         safe(p.dbEventPlayers_Gender  || ""),
      hi:             safe(p.dbEventPlayers_HI       || ""),
      club_name:      safe(p.dbEventPlayers_ClubName || ""),
      email:          "",
      mobile:         "",
      recentTeeSetId: "",
      // Event-specific fields — written to db_Players on enrollment
      teamKey:        safe(p.dbEventPlayers_TeamKey    || ""),
      pairingId:      safe(p.dbEventPlayers_PairingID  || ""),
      pairingPos:     safe(p.dbEventPlayers_PairingPos || ""),
      source:         "eventRoster",
    };
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  function _getFiltered(st) {
    const q = safe(st.nameFilter).trim().toLowerCase();
    if (!q) return st.players || [];
    return (st.players || []).filter(p => {
      const name = safe(p.dbEventPlayers_Name).toLowerCase();
      return name.includes(q);
    });
  }

  function _isSelected(st, ghin) {
    return st.multiAddSelected.includes(safe(ghin));
  }

  // ── Team badge ──────────────────────────────────────────────────────────────
  function _teamBadge(teamKey) {
    if (!teamKey) return "";
    const color = teamKey === "T1" ? "red" : "blue";
    return `<span class="maTeamBadge maTeamBadge--${color}">${esc(teamKey)}</span>`;
  }

  // ── Pairing badge ───────────────────────────────────────────────────────────
  function _pairingBadge(pairingId, pairingPos) {
    if (!pairingId) return "";
    const label = pairingPos ? `${pairingId}-${pairingPos}` : pairingId;
    return `<span class="maBadge">${esc(label)}</span>`;
  }

  // ── Render: controls ────────────────────────────────────────────────────────
  function _renderControls(controlsEl, st) {
    controlsEl.innerHTML = `
      <div class="maFieldRow" style="flex-wrap:nowrap; align-items:center; gap:6px;">
        <div class="maField" style="flex:1 1 0; min-width:0;">
          <div class="maInputWrap--clearable">
            <input class="maTextInput erSrcFilter"
              placeholder="Player name"
              value="${esc(st.nameFilter)}"
              autocomplete="off">
            <button class="maClearBtn erSrcFilterClear ${st.nameFilter ? "" : "isHidden"}"
              type="button" aria-label="Clear">×</button>
          </div>
        </div>
        <button class="btn btnSecondary erSrcMultiBtn" type="button" style="flex-shrink:0;">
          ${st.multiAddMode ? "Cancel" : "Multi-Add"}
        </button>
      </div>`;

    const filterInp = controlsEl.querySelector(".erSrcFilter");
    const filterClr = controlsEl.querySelector(".erSrcFilterClear");
    const multiBtn  = controlsEl.querySelector(".erSrcMultiBtn");

    if (filterInp) {
      filterInp.addEventListener("input", () => {
        st.nameFilter = safe(filterInp.value);
        if (filterClr) filterClr.classList.toggle("isHidden", !st.nameFilter);
        _renderBody(st);
      });
    }
    if (filterClr) {
      filterClr.addEventListener("click", () => {
        st.nameFilter = "";
        if (filterInp) { filterInp.value = ""; filterInp.focus(); }
        filterClr.classList.add("isHidden");
        _renderBody(st);
      });
    }

    if (multiBtn) {
      multiBtn.addEventListener("click", () => {
        if (st.multiAddMode) {
          _cancelMultiAdd(st, controlsEl);
        } else {
          _beginMultiAdd(st, controlsEl);
        }
      });
    }
  }

  // ── Render: footer (multi-add confirm) ─────────────────────────────────────
  // Note: eventRosterSource has no footerEl — multi-add confirm is handled
  // inline via the controls Multi-Add / Cancel button per spec §11.3.
  // onSelectMany is called directly when multi-add confirm fires.

  // ── Render: body ────────────────────────────────────────────────────────────
  function _renderBody(st) {
    const bodyEl = st.bodyEl;
    if (!bodyEl) return;

    const filtered = _getFiltered(st);

    if (!filtered.length) {
      bodyEl.innerHTML = `<div class="maEmptyState">${
        st.players.length
          ? "No players match your filter."
          : "Event roster is empty."
      }</div>`;
      return;
    }

    if (!st.multiAddMode) {
      // ── Single-add mode ────────────────────────────────────────────────
      const rows = filtered.map(p => {
        const ghin     = safe(p.dbEventPlayers_GHIN);
        const name     = safe(p.dbEventPlayers_Name);
        const hi       = safe(p.dbEventPlayers_HI    || "");
        const gender   = safe(p.dbEventPlayers_Gender || "");
        const teamKey  = safe(p.dbEventPlayers_TeamKey   || "");
        const pairId   = safe(p.dbEventPlayers_PairingID  || "");
        const pairPos  = safe(p.dbEventPlayers_PairingPos || "");
        const enrolled = st.existingGHINs.has(ghin);
        const meta     = [hi && `HI ${hi}`, gender].filter(Boolean).join(" · ");

        const indicator = enrolled
          ? `<button class="iconBtn iconBtn--check" disabled aria-label="Enrolled">${ICON_CHECK}</button>`
          : `<button class="iconBtn iconBtn--add"   disabled aria-label="Add">${ICON_ADD}</button>`;

        return `<div class="maListRow maListRow--player ${enrolled ? "maListRow--enrolled" : ""}"
          data-er-ghin="${esc(ghin)}"
          data-disabled="${enrolled ? "1" : "0"}"
          style="cursor:${enrolled ? "default" : "pointer"};">
          <div style="min-width:0; flex:1;">
            <div class="maListRow__col">${esc(name)}</div>
            <div class="maListRow__subline">${esc(meta)}</div>
          </div>
          <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
            ${_teamBadge(teamKey)}
            ${_pairingBadge(pairId, pairPos)}
          </div>
          ${indicator}
        </div>`;
      }).join("");

      bodyEl.innerHTML = `<div class="maListRows">${rows}</div>`;

      bodyEl.querySelectorAll("[data-er-ghin]").forEach(row => {
        row.addEventListener("click", () => {
          if (row.getAttribute("data-disabled") === "1") return;
          const ghin = row.getAttribute("data-er-ghin");
          const p = st.players.find(x => safe(x.dbEventPlayers_GHIN) === ghin);
          if (p && typeof st.onSelect === "function") {
            st.onSelect(_normalize(p));
          }
        });
      });

    } else {
      // ── Multi-add mode ─────────────────────────────────────────────────
      const selectable = filtered
        .map(p => safe(p.dbEventPlayers_GHIN))
        .filter(g => !st.existingGHINs.has(g));

      const allSelected = selectable.length > 0 &&
        selectable.every(g => _isSelected(st, g));

      const rows = filtered.map(p => {
        const ghin     = safe(p.dbEventPlayers_GHIN);
        const name     = safe(p.dbEventPlayers_Name);
        const hi       = safe(p.dbEventPlayers_HI    || "");
        const gender   = safe(p.dbEventPlayers_Gender || "");
        const teamKey  = safe(p.dbEventPlayers_TeamKey   || "");
        const pairId   = safe(p.dbEventPlayers_PairingID  || "");
        const pairPos  = safe(p.dbEventPlayers_PairingPos || "");
        const enrolled = st.existingGHINs.has(ghin);
        const selected = _isSelected(st, ghin);
        const meta     = [hi && `HI ${hi}`, gender].filter(Boolean).join(" · ");

        return `<div class="maListRow maListRow--player
          ${selected  ? "maListRow--selected"  : ""}
          ${enrolled  ? "maListRow--enrolled"  : ""}"
          data-er-ghin="${esc(ghin)}"
          data-disabled="${enrolled ? "1" : "0"}"
          style="cursor:${enrolled ? "default" : "pointer"};">
          <div class="maCheckbox ${selected ? "is-checked" : ""} ${enrolled ? "is-disabled" : ""}"></div>
          <div style="min-width:0; flex:1;">
            <div class="maListRow__col">${esc(name)}</div>
            <div class="maListRow__subline">${esc(meta)}</div>
          </div>
          <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
            ${_teamBadge(teamKey)}
            ${_pairingBadge(pairId, pairPos)}
            ${enrolled ? `<button class="iconBtn iconBtn--check" disabled>${ICON_CHECK}</button>` : ""}
          </div>
        </div>`;
      }).join("");

      bodyEl.innerHTML = `
        <div class="maMultiToggle">
          <span class="maMultiToggle__action erSrcToggleAll">${allSelected ? "Clear All" : "Select All"}</span>
          ${st.multiAddSelected.length
            ? `&nbsp;·&nbsp;<span class="maMultiToggle__action erSrcConfirm">Add Selected (${st.multiAddSelected.length})</span>`
            : ""}
        </div>
        <div class="maListRows">${rows}</div>`;

      // Wire Select All / Clear All
      bodyEl.querySelector(".erSrcToggleAll")?.addEventListener("click", () => {
        const sel = filtered
          .map(p => safe(p.dbEventPlayers_GHIN))
          .filter(g => !st.existingGHINs.has(g));
        const all = sel.length > 0 && sel.every(g => _isSelected(st, g));
        st.multiAddSelected = all ? [] : sel.slice();
        _renderBody(st);
      });

      // Wire confirm
      bodyEl.querySelector(".erSrcConfirm")?.addEventListener("click", () => {
        const selected = filtered.filter(p => {
          const g = safe(p.dbEventPlayers_GHIN);
          return st.multiAddSelected.includes(g) && !st.existingGHINs.has(g);
        });
        if (selected.length && typeof st.onSelectMany === "function") {
          st.onSelectMany(selected.map(_normalize));
        }
      });

      // Wire row clicks
      bodyEl.querySelectorAll("[data-er-ghin]").forEach(row => {
        row.addEventListener("click", () => {
          if (row.getAttribute("data-disabled") === "1") return;
          const ghin = row.getAttribute("data-er-ghin");
          if (!ghin) return;
          if (_isSelected(st, ghin)) {
            st.multiAddSelected = st.multiAddSelected.filter(x => x !== ghin);
          } else {
            st.multiAddSelected = st.multiAddSelected.concat(ghin);
          }
          _renderBody(st);
        });
      });
    }

    // Restore scroll
    requestAnimationFrame(() => { bodyEl.scrollTop = st.scrollTop; });
    bodyEl.addEventListener("scroll", () => { st.scrollTop = bodyEl.scrollTop; }, { passive: true });
  }

  // ── Multi-add transitions ───────────────────────────────────────────────────
  function _beginMultiAdd(st, controlsEl) {
    st.multiAddMode     = true;
    st.multiAddSelected = [];
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  function _cancelMultiAdd(st, controlsEl) {
    st.multiAddMode     = false;
    st.multiAddSelected = [];
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * mount() — safe to call on every parent render cycle.
   * First call: fetches event roster, builds controls and body.
   * Subsequent calls: refreshes existingGHINs and re-renders rows.
   */
  async function mount(cfg) {
    const controlsEl = cfg.controlsEl;
    const bodyEl     = cfg.bodyEl;
    if (!controlsEl || !bodyEl) return;

    const existingGHINs = cfg.existingGHINs instanceof Set
      ? cfg.existingGHINs
      : new Set();

    // ── Already initialized? ─────────────────────────────────────────────
    if (_states.has(controlsEl)) {
      const st = _states.get(controlsEl);

      st.existingGHINs = existingGHINs;
      st.onSelect      = cfg.onSelect      || st.onSelect;
      st.onSelectMany  = cfg.onSelectMany  || st.onSelectMany;
      st.bodyEl        = bodyEl;

      _renderBody(st);

      if (st.scrollTop && bodyEl) {
        requestAnimationFrame(() => { bodyEl.scrollTop = st.scrollTop; });
      }
      return;
    }

    // ── First mount ──────────────────────────────────────────────────────
    const st = _initState(controlsEl, cfg);
    st.bodyEl = bodyEl;

    try {
      await _fetchRoster(st);
    } catch (e) {
      MA.setStatus("Unable to load event roster.", "warn");
    }

    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  /**
   * refresh(controlsEl) — re-fetches event roster and re-renders.
   * Called after a player is enrolled in the round.
   */
  async function refresh(controlsEl) {
    const st = _getState(controlsEl);
    if (!st) return;

    try {
      await _fetchRoster(st);
    } catch (e) {
      MA.setStatus("Unable to refresh event roster.", "warn");
    }

    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  // ── Register public API ─────────────────────────────────────────────────────
  MA.eventRosterSource.mount   = mount;
  MA.eventRosterSource.refresh = refresh;

})();
