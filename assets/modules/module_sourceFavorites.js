/* /assets/modules/module_sourceFavorites.js
 * MA.favoritesSource — Favorites enrollment source module.
 *
 * Extracted from game_players.js. Reusable by any host page
 * (Game Players, Event Roster) via the standard mount() contract.
 *
 * Public API:
 *   MA.favoritesSource.mount(cfg)
 *   MA.favoritesSource.refresh(controlsEl)
 *   MA.favoritesSource.cancelMultiAdd(controlsEl)
 *
 * mount() cfg:
 *   controlsEl    {HTMLElement}        renders controls (filters + Multi-Add button)
 *   bodyEl        {HTMLElement}        renders rows
 *   footerEl      {HTMLElement}        renders multi-add confirm/cancel footer (required)
 *   apiPath       {string}             favPlayersInit endpoint
 *   courseId      {string}             passed to favPlayersInit for tee history
 *   context       {object}             { userGHIN, userName, userGender }
 *   existingGHINs {Set}                refreshed on every mount call
 *   source        {string}             host page identifier: "gameplayers" | "eventroster"
 *                                      Drives copy/behavior differences between hosts:
 *                                      - "eventroster": suppresses the tee-history subline
 *                                        (no tee concept on this page) and labels the
 *                                        multi-add confirm button "Enroll Players"
 *                                      - "gameplayers" (default): unchanged legacy behavior,
 *                                        shows tee-history subline, confirm button reads
 *                                        "Select Tee" (enrollment is staged behind tee pick)
 *   onSelect      {function(player)}   single-add callback
 *   onSelectMany  {function(players)}  multi-add confirm callback
 *
 * Dependencies:
 *   ma_shared.js loaded first (MA.postJson, MA.setStatus, esc helpers)
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.favoritesSource = MA.favoritesSource || {};

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
  // Keyed on controlsEl — Game Players and Event Roster never collide.
  const _states = new WeakMap();

  function _getState(controlsEl) {
    return _states.get(controlsEl) || null;
  }

  function _initState(controlsEl, cfg) {
    const st = {
      // Data
      favorites:        [],
      groups:           [],
      // Filter state — preserved across tab switches
      favGroupFilter:   "All groups",
      favNameFilter:    "",
      favBroadened:     false,
      // Multi-add state
      multiAddMode:     false,
      multiAddSelected: [],
      // Scroll
      scrollTop:        0,
      // Live cfg refs — updated on every mount() call
      existingGHINs:    cfg.existingGHINs || new Set(),
      onSelect:         cfg.onSelect      || null,
      onSelectMany:     cfg.onSelectMany  || null,
      context:          cfg.context       || {},
      footerEl:         cfg.footerEl      || null,
      bodyEl:           cfg.bodyEl        || null,
      apiPath:          cfg.apiPath       || "",
      courseId:         cfg.courseId      || "",
      source:           cfg.source        || "gameplayers",
    };
    _states.set(controlsEl, st);
    return st;
  }

  // ── Favorite helpers ────────────────────────────────────────────────────────

  function _favoriteMatchesSearch(f, q) {
    const needle = safe(q).trim().toLowerCase();
    if (!needle) return true;
    const hay = `${safe(f.name || f.playerName)} ${safe(f.lname || "")}`.toLowerCase();
    return hay.includes(needle);
  }

  function _getFavoriteLastTee(f) {
    return safe(f?.lastCourse?.teeSetName || "");
  }

  function _getFavoriteLastTeeId(f) {
    return safe(f?.lastCourse?.teeSetId || "");
  }

  function _getFilteredFavorites(st) {
    const q   = safe(st.favNameFilter).trim().toLowerCase();
    const grp = safe(st.favGroupFilter || "All groups");
    st.favBroadened = false;

    let filtered = (st.favorites || []).filter(f => {
      const tags    = Array.isArray(f.groups) ? f.groups : [];
      const inGroup = grp === "All groups" ? true : tags.includes(grp);
      if (!inGroup) return false;
      return _favoriteMatchesSearch(f, q);
    });

    // Auto-broaden: if name filter yields nothing in selected group, show all groups
    if (q && filtered.length === 0 && grp !== "All groups") {
      st.favBroadened    = true;
      st.favGroupFilter  = "All groups";
      filtered = (st.favorites || []).filter(f => _favoriteMatchesSearch(f, q));
    }

    return filtered;
  }

  function _isFavoriteSelected(st, ghin) {
    return st.multiAddSelected.includes(safe(ghin));
  }

  function _toggleFavoriteSelected(st, ghin, controlsEl) {
    const id = safe(ghin);
    if (!id) return;
    if (_isFavoriteSelected(st, id)) {
      st.multiAddSelected = st.multiAddSelected.filter(x => x !== id);
    } else {
      st.multiAddSelected = st.multiAddSelected.concat(id);
    }
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  function _toggleAllVisible(st, controlsEl) {
    const filtered    = _getFilteredFavorites(st);
    const selectable  = filtered
      .map(f => safe(f.playerGHIN))
      .filter(Boolean)
      .filter(g => !st.existingGHINs.has(g));

    const allSelected = selectable.length > 0 &&
      selectable.every(g => _isFavoriteSelected(st, g));

    st.multiAddSelected = allSelected ? [] : selectable.slice();
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  // ── Avatar helpers ──────────────────────────────────────────────────────────

  function _avatarClass(gender) {
    const g = safe(gender).toUpperCase();
    return g === "M" ? "maListRow__avatar--m"
         : g === "F" ? "maListRow__avatar--f"
         : "maListRow__avatar--u";
  }

  function _avatarInitials(name) {
    const parts = safe(name).trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return safe(name).slice(0, 2).toUpperCase();
  }

  function _buildAvatar(name, gender) {
    return `<div class="maListRow__avatar ${_avatarClass(gender)}" aria-hidden="true">${esc(_avatarInitials(name))}</div>`;
  }

  function _buildIndicator(enrolled) {
    return enrolled
      ? `<button class="iconBtn iconBtn--check" disabled aria-label="Enrolled">${ICON_CHECK}</button>`
      : `<button class="iconBtn iconBtn--add"   disabled aria-label="Add player">${ICON_ADD}</button>`;
  }

  function _buildTeeSubline(st, lastTeeName) {
    if (st && st.source === "eventroster") return "";
    const tee = safe(lastTeeName);
    return tee
      ? `<div class="maListRow__subline">Previous Tee: ${esc(tee)}</div>`
      : `<div class="maListRow__subline--empty">No tee history</div>`;
  }

  function _buildGenderTag(gender) {
    const g = safe(gender);
    return g
      ? ` <span style="font-weight:400; color:var(--mutedText);">(${esc(g)})</span>`
      : "";
  }

  // ── Normalize player object (spec §2.3) ─────────────────────────────────────

  function _normalize(f) {
    const fullName = safe(f.name || f.playerName || "");
    const parts    = fullName.trim().split(/\s+/);
    const last     = parts.length > 1 ? parts[parts.length - 1] : "";
    const first    = parts.length > 1 ? parts.slice(0, -1).join(" ") : fullName;
    return {
      ghin:           safe(f.playerGHIN),
      first_name:     first,
      last_name:      last,
      name:           fullName,
      gender:         safe(f.gender || ""),
      hi:             safe(f.hi || ""),
      club_name:      safe(f.clubName || f.club_name || ""),
      email:          safe(f.email    || ""),
      mobile:         safe(f.mobile   || ""),
      recentTeeSetId: _getFavoriteLastTeeId(f),
      source:         "favorites",
    };
  }

  // ── API fetch ───────────────────────────────────────────────────────────────

  async function _fetchFavorites(st) {
    if (!st.apiPath) return;
    const res = await MA.postJson(st.apiPath, { courseId: st.courseId });
    st.favorites = Array.isArray(res?.payload?.favorites) ? res.payload.favorites : [];
    st.groups    = Array.isArray(res?.payload?.groups)    ? res.payload.groups    : [];
  }

  // ── Render: controls ────────────────────────────────────────────────────────

  function _renderControls(controlsEl, st) {
    const opts = ["All groups"]
      .concat(st.groups || [])
      .map(g => `<option value="${esc(g)}"${st.favGroupFilter === g ? " selected" : ""}>${esc(g)}</option>`)
      .join("");

    controlsEl.innerHTML = `
      <div class="maFieldRow" style="flex-wrap:nowrap; align-items:center; gap:6px;">
        <div class="maField" style="flex:1 1 0; min-width:0;">
          <select class="maTextInput favSrcGroup">${opts}</select>
        </div>
        <div class="maField" style="flex:1 1 0; min-width:0;">
          <div class="maInputWrap--clearable">
            <input class="maTextInput favSrcFilter"
              placeholder="Player name"
              value="${esc(st.favNameFilter)}"
              autocomplete="off">
            <button class="maClearBtn favSrcFilterClear ${st.favNameFilter ? "" : "isHidden"}"
              type="button" aria-label="Clear filter">×</button>
          </div>
        </div>
        <button class="btn btnSecondary favSrcMultiBtn"
          type="button" style="flex-shrink:0;">
          ${st.multiAddMode ? "Cancel" : "Multi-Add"}
        </button>
      </div>
      <div class="favSrcHint maHelpText${st.favBroadened ? "" : " isHidden"}"
        style="margin-top:4px;">
        No match in selected group — showing all groups.
      </div>`;

    // Wire group dropdown
    const selEl = controlsEl.querySelector(".favSrcGroup");
    if (selEl) {
      selEl.addEventListener("change", () => {
        st.favGroupFilter = safe(selEl.value) || "All groups";
        _renderBody(st);
        // Update hint visibility
        const hint = controlsEl.querySelector(".favSrcHint");
        if (hint) hint.classList.toggle("isHidden", !st.favBroadened);
      });
    }

    // Wire name filter
    const filterInp = controlsEl.querySelector(".favSrcFilter");
    const filterClr = controlsEl.querySelector(".favSrcFilterClear");
    if (filterInp) {
      filterInp.addEventListener("input", () => {
        st.favNameFilter = safe(filterInp.value);
        if (filterClr) filterClr.classList.toggle("isHidden", !st.favNameFilter);
        _renderBody(st);
        const hint = controlsEl.querySelector(".favSrcHint");
        if (hint) hint.classList.toggle("isHidden", !st.favBroadened);
      });
    }
    if (filterClr) {
      filterClr.addEventListener("click", () => {
        st.favNameFilter = "";
        if (filterInp) { filterInp.value = ""; filterInp.focus(); }
        filterClr.classList.add("isHidden");
        _renderBody(st);
        const hint = controlsEl.querySelector(".favSrcHint");
        if (hint) hint.classList.add("isHidden");
      });
    }

    // Wire Multi-Add / Cancel button
    const multiBtn = controlsEl.querySelector(".favSrcMultiBtn");
    if (multiBtn) {
      multiBtn.addEventListener("click", () => {
        if (st.multiAddMode) {
          _cancelMultiAdd(st, controlsEl);
        } else {
          _beginMultiAdd(st, controlsEl);
        }
      });
    }

    // Render multi-add footer if in multi-add mode
    _renderFooter(st, controlsEl);
  }

  // ── Render: footer (multi-add confirm strip) ────────────────────────────────

  function _renderFooter(st, controlsEl) {
    const footerEl = st.footerEl;
    if (!footerEl) return;

    if (!st.multiAddMode) {
      footerEl.innerHTML = "";
      return;
    }

    const count = st.multiAddSelected.length;
    const confirmLabel = st.source === "eventroster"
      ? `Enroll Players${count ? ` (${count})` : ""}`
      : `Select Tee${count ? ` (${count})` : ""}`;
    footerEl.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn btnSecondary favSrcConfirmBtn"
          type="button" ${count ? "" : "disabled"}>
          ${confirmLabel}
        </button>
        <button class="btn favSrcCancelBtn" type="button">Cancel</button>
      </div>`;

    const confirmBtn = footerEl.querySelector(".favSrcConfirmBtn");
    const cancelBtn  = footerEl.querySelector(".favSrcCancelBtn");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (!count) return;
        const filtered   = _getFilteredFavorites(st);
        const selected   = filtered.filter(f => {
          const g = safe(f.playerGHIN);
          return st.multiAddSelected.includes(g) && !st.existingGHINs.has(g);
        });
        if (typeof st.onSelectMany === "function") {
          st.onSelectMany(selected.map(_normalize));
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => _cancelMultiAdd(st, controlsEl));
    }
  }

  // ── Render: body ────────────────────────────────────────────────────────────

  function _renderBody(st) {
    const bodyEl = st.bodyEl;
    if (!bodyEl) return;

    const filtered    = _getFilteredFavorites(st);
    const userGHIN    = safe(st.context?.userGHIN   || "");
    const userName    = safe(st.context?.userName   || "");
    const userGender  = safe(st.context?.userGender || st.context?.gender || "M");
    const youEnrolled = userGHIN ? st.existingGHINs.has(userGHIN) : false;
    const youFav      = userGHIN
      ? (st.favorites || []).find(f => safe(f.playerGHIN) === userGHIN) || {}
      : {};
    const youLastTee  = userGHIN ? _getFavoriteLastTee(youFav) : "";

    if (!st.multiAddMode) {
      // ── Single-add mode ────────────────────────────────────────────────

      // "You" pinned row
      const youRow = userGHIN ? `
        <div class="maListRow maListRow--favorites maListRow--pinned ${youEnrolled ? "maListRow--enrolled" : ""}"
          data-fav-ghin="${esc(userGHIN)}" data-act="addfav"
          data-disabled="${youEnrolled ? "1" : "0"}"
          style="cursor:${youEnrolled ? "default" : "pointer"};">
          ${_buildAvatar(userName, userGender)}
          <div style="min-width:0;">
            <div class="maListRow__col">
              ${esc(userName)}${_buildGenderTag(userGender)}
              <span class="maListRow__pinnedLabel">You</span>
            </div>
            ${_buildTeeSubline(st, youLastTee)}
          </div>
          ${_buildIndicator(youEnrolled)}
        </div>` : "";

      // Favorites rows
      const favRows = filtered.map(f => {
        const g        = safe(f.playerGHIN);
        const n        = safe(f.name || f.playerName);
        const enrolled = st.existingGHINs.has(g);
        const gender   = safe(f.gender || "");
        const lastTee  = _getFavoriteLastTee(f);

        return `<div class="maListRow maListRow--favorites ${enrolled ? "maListRow--enrolled" : ""}"
          data-fav-ghin="${esc(g)}" data-act="addfav"
          data-disabled="${enrolled ? "1" : "0"}"
          style="cursor:${enrolled ? "default" : "pointer"};">
          ${_buildAvatar(n, gender)}
          <div style="min-width:0;">
            <div class="maListRow__col">${esc(n)}${_buildGenderTag(gender)}</div>
            ${_buildTeeSubline(st, lastTee)}
          </div>
          ${_buildIndicator(enrolled)}
        </div>`;
      }).join("");

      const groupDivider = `<div class="maListRow__group">Favorites</div>`;
      const empty = `<div class="maEmptyState">No favorites found.</div>`;

      bodyEl.innerHTML = `<div class="maListRows">
        ${youRow}
        ${groupDivider}
        ${favRows || empty}
      </div>`;

      // Wire row clicks
      bodyEl.querySelectorAll("[data-act='addfav']").forEach(row => {
        row.addEventListener("click", () => {
          if (row.getAttribute("data-disabled") === "1") return;
          const ghin = row.getAttribute("data-fav-ghin");

          // "You" row
          if (ghin === userGHIN) {
            const youPlayer = Object.assign({}, youFav, {
              playerGHIN: userGHIN,
              name:       userName,
              gender:     userGender,
            });
            if (typeof st.onSelect === "function") st.onSelect(_normalize(youPlayer));
            return;
          }

          const f = (st.favorites || []).find(x => safe(x.playerGHIN) === ghin);
          if (f && typeof st.onSelect === "function") st.onSelect(_normalize(f));
        });
      });

    } else {
      // ── Multi-add mode ─────────────────────────────────────────────────

      const selectable = filtered
        .map(f => safe(f.playerGHIN))
        .filter(Boolean)
        .filter(g => !st.existingGHINs.has(g));

      const allSelected = selectable.length > 0 &&
        selectable.every(g => _isFavoriteSelected(st, g));
      const toggleText  = allSelected ? "Clear All" : "Select All";

      // "You" pinned row in multi-add
      const youSelectedMulti = userGHIN ? _isFavoriteSelected(st, userGHIN) : false;
      const youMultiRow = userGHIN ? `
        <div class="maListRow maListRow--favoritesMulti maListRow--pinned
          ${youEnrolled    ? "maListRow--enrolled"  : ""}
          ${youSelectedMulti ? "maListRow--selected" : ""}"
          data-fav-ghin="${esc(userGHIN)}" data-act="multifav"
          data-disabled="${youEnrolled ? "1" : "0"}"
          style="cursor:${youEnrolled ? "default" : "pointer"};">
          <div class="maCheckbox ${youSelectedMulti ? "is-checked" : ""} ${youEnrolled ? "is-disabled" : ""}"></div>
          ${_buildAvatar(userName, userGender)}
          <div style="min-width:0;">
            <div class="maListRow__col">
              ${esc(userName)}${_buildGenderTag(userGender)}
              <span class="maListRow__pinnedLabel">You</span>
            </div>
            ${_buildTeeSubline(st, youLastTee)}
          </div>
          ${youEnrolled ? _buildIndicator(true) : ""}
        </div>` : "";

      // Favorites rows in multi-add
      const favRows = filtered.map(f => {
        const g        = safe(f.playerGHIN);
        const n        = safe(f.name || f.playerName);
        const enrolled = st.existingGHINs.has(g);
        const selected = _isFavoriteSelected(st, g);
        const gender   = safe(f.gender || "");
        const lastTee  = _getFavoriteLastTee(f);

        return `<div class="maListRow maListRow--favoritesMulti
          ${selected  ? "maListRow--selected"  : ""}
          ${enrolled  ? "maListRow--enrolled"  : ""}"
          data-fav-ghin="${esc(g)}" data-act="multifav"
          data-disabled="${enrolled ? "1" : "0"}"
          style="cursor:${enrolled ? "default" : "pointer"};">
          <div class="maCheckbox ${selected ? "is-checked" : ""} ${enrolled ? "is-disabled" : ""}"></div>
          ${_buildAvatar(n, gender)}
          <div style="min-width:0;">
            <div class="maListRow__col">${esc(n)}${_buildGenderTag(gender)}</div>
            ${_buildTeeSubline(st, lastTee)}
          </div>
          ${enrolled ? _buildIndicator(true) : ""}
        </div>`;
      }).join("");

      const groupDivider = `<div class="maListRow__group">Favorites</div>`;
      const empty = `<div class="maEmptyState">No favorites found.</div>`;

      bodyEl.innerHTML = `
        <div class="maMultiToggle">
          <span class="maMultiToggle__action favSrcToggleAll">${esc(toggleText)}</span>
        </div>
        <div class="maListRows">
          ${youMultiRow}
          ${groupDivider}
          ${favRows || empty}
        </div>`;

      // Wire Select All / Clear All
      bodyEl.querySelector(".favSrcToggleAll")?.addEventListener("click", () => {
        // Find the controlsEl from the WeakMap by scanning — we need it for _toggleAllVisible
        // We stored controlsEl reference on the state — look it up via the bodyEl
        // Instead, pass via closure: we locate it from our outer scope reference
        _toggleAllVisibleFromBody(st, bodyEl);
      });

      // Wire multi-select row clicks
      bodyEl.querySelectorAll("[data-act='multifav']").forEach(row => {
        row.addEventListener("click", () => {
          if (row.getAttribute("data-disabled") === "1") return;
          const ghin = row.getAttribute("data-fav-ghin");
          // Toggle selection in state, re-render body and footer
          const id = safe(ghin);
          if (!id) return;
          if (_isFavoriteSelected(st, id)) {
            st.multiAddSelected = st.multiAddSelected.filter(x => x !== id);
          } else {
            st.multiAddSelected = st.multiAddSelected.concat(id);
          }
          _renderBody(st);
          _renderFooterFromState(st);
        });
      });
    }

    // Restore scroll position
    requestAnimationFrame(() => { bodyEl.scrollTop = st.scrollTop; });
    bodyEl.addEventListener("scroll", () => { st.scrollTop = bodyEl.scrollTop; }, { passive: true, once: false });
  }

  // Toggle-all from body context (no controlsEl needed — footer re-render uses st.footerEl)
  function _toggleAllVisibleFromBody(st, bodyEl) {
    const filtered   = _getFilteredFavorites(st);
    const selectable = filtered
      .map(f => safe(f.playerGHIN))
      .filter(Boolean)
      .filter(g => !st.existingGHINs.has(g));

    const allSelected = selectable.length > 0 &&
      selectable.every(g => _isFavoriteSelected(st, g));

    st.multiAddSelected = allSelected ? [] : selectable.slice();
    _renderBody(st);
    _renderFooterFromState(st);
  }

  function _renderFooterFromState(st) {
    // Re-render footer without needing a controlsEl param from the caller.
    // Delegates to _renderFooter (single source of truth for footer markup/labels)
    // using the controlsEl captured on state at mount time.
    if (!st.footerEl || !st.multiAddMode) return;
    _renderFooter(st, st._controlsEl);
  }

  // ── Multi-add mode transitions ──────────────────────────────────────────────

  function _beginMultiAdd(st, controlsEl) {
    st.multiAddMode     = true;
    st.multiAddSelected = [];
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  function _cancelMultiAdd(st, controlsEl) {
    st.multiAddMode     = false;
    st.multiAddSelected = [];
    if (st.footerEl) st.footerEl.innerHTML = "";
    _renderControls(controlsEl, st);
    _renderBody(st);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * mount() — safe to call on every parent render cycle.
   * First call: fetches data, builds controls and body.
   * Subsequent calls: refreshes existingGHINs and re-evaluates enrollment
   * status in place without resetting filter state or scroll position.
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

      // Refresh live refs
      st.existingGHINs = existingGHINs;
      st.onSelect      = cfg.onSelect      || st.onSelect;
      st.onSelectMany  = cfg.onSelectMany  || st.onSelectMany;
      st.footerEl      = cfg.footerEl      || st.footerEl;
      st.source        = cfg.source        || st.source;

      // Re-render body so checkmarks update from fresh existingGHINs
      _renderBody(st);

      // Restore scroll
      if (st.scrollTop && bodyEl) {
        requestAnimationFrame(() => { bodyEl.scrollTop = st.scrollTop; });
      }
      return;
    }

    // ── First mount ──────────────────────────────────────────────────────
    const st = _initState(controlsEl, cfg);
    st.bodyEl     = bodyEl;
    st._controlsEl = controlsEl;

    // If the host page already has favorites data (e.g. game_players fetches
    // at boot for heart icons), accept it directly and skip the API call.
    if (cfg.initialData) {
      st.favorites = Array.isArray(cfg.initialData.favorites) ? cfg.initialData.favorites : [];
      st.groups    = Array.isArray(cfg.initialData.groups)    ? cfg.initialData.groups    : [];
    } else {
      // Self-contained fetch — used by pages that don't pre-load favorites
      // (e.g. Event Roster).
      try {
        await _fetchFavorites(st);
      } catch (e) {
        MA.setStatus("Unable to load favorites.", "warn");
      }
    }

    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  /**
   * refresh(controlsEl) — exits multi-add mode and re-renders.
   * Called by the host page after a successful multi-add enrollment to
   * clear the stale selection/footer state that mount() intentionally
   * preserves on re-invocation.
   *
   * Does NOT re-fetch favorites from the server. Both current host pages
   * (Game Players, Event Roster) preload favorites server-side and pass
   * them via mount()'s initialData — st.favorites is already current.
   * A fetch here was previously included but caused an unnecessary
   * network round-trip on every enroll; the host page's own state.favorites
   * stays the single source of truth and is what initialData reflects.
   */
  function refresh(controlsEl) {
    const st = _getState(controlsEl);
    if (!st) return;
    // Exit multi-add mode — enrollment state has changed
    st.multiAddMode     = false;
    st.multiAddSelected = [];
    if (st.footerEl) st.footerEl.innerHTML = "";
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  /**
   * cancelMultiAdd(controlsEl) — exits multi-add mode.
   * Called by the host page when the user switches tabs.
   */
  function cancelMultiAdd(controlsEl) {
    const st = _getState(controlsEl);
    if (!st || !st.multiAddMode) return;
    _cancelMultiAdd(st, controlsEl);
  }


  // ── Register public API ─────────────────────────────────────────────────────
  MA.favoritesSource.mount          = mount;
  MA.favoritesSource.refresh        = refresh;
  MA.favoritesSource.cancelMultiAdd = cancelMultiAdd;

})();