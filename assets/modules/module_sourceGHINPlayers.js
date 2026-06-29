/* /assets/modules/module_sourceGHINPlayers.js
 * Shared GHIN search module for MatchAid pages.
 *
 * Exposes two entry points:
 *
 *   Modal mode (Favorites page — unchanged call signature):
 *     MA.ghinSearch.open({ title, defaultState, existingGHINs, onSelect })
 *     MA.ghinSearch.close()
 *
 *   Panel mode (Game Players, Event Roster — new):
 *     MA.ghinSearch.mount({ controlsEl, bodyEl, footerEl, defaultState,
 *                           existingGHINs, onSelect })
 *
 * Both modes share doSearch() and renderRows() internally.
 * Panel mode uses WeakMap sticky state keyed on controlsEl.
 *
 * Dependencies:
 *   ma_shared.js loaded first (MA.postJson, MA.setStatus, etc.)
 *   MA.paths.ghinPlayerSearch set by the hosting page.
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.ghinSearch = MA.ghinSearch || {};

  const TRUNCATION_THRESHOLD = 90;

  // ── Small DOM helper ────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls)     n.className   = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function safeStr(v) { return (v == null) ? "" : String(v); }
  function isAllDigits(s) { return /^[0-9]+$/.test(s); }

  // ── SVG icons ───────────────────────────────────────────────────────────────
  const ICON_CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const ICON_ADD   = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  // ── Results header HTML (shared by both modes) ───────────────────────────────
  // Uses maListRow--player grid: name | HI | G | indicator
  const RESULTS_HDR_HTML = `<div class="maListRow maListRow--static maListRow--player">
    <div class="maListRow__col">Name</div>
    <div class="maListRow__col">HI</div>
    <div class="maListRow__col">G</div>
    <div class="maListRow__col"></div>
  </div>`;

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED CORE — doSearch() and renderRows()
  // Both modal and panel modes delegate to these.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * doSearch — reads search criteria from inputRefs, calls the API,
   * stores results in state, then calls renderRows() into targetEl.
   *
   * @param {object} inputRefs  - { stateInp, lastInp, firstInp }
   * @param {object} cfg        - { existingGHINs, onSelect, defaultState }
   * @param {object} state      - module state bucket (modal or WeakMap panel slot)
   * @param {HTMLElement} targetEl   - the rows container to render into
   * @param {function} setStatus     - function(msg, level) for local feedback
   */
  async function doSearch(inputRefs, cfg, state, targetEl, setStatus) {
    const st        = safeStr(inputRefs.stateInp?.value).trim().toUpperCase();
    const lastOrId  = safeStr(inputRefs.lastInp?.value).trim();
    const first     = safeStr(inputRefs.firstInp?.value).trim();
    const club      = safeStr(inputRefs.clubInp?.value).trim();

    if (!lastOrId) {
      setStatus("Enter last name or GHIN#.", "warn");
      return;
    }

    if (!MA.paths || !MA.paths.ghinPlayerSearch) {
      setStatus("GHIN search API path not configured.", "error");
      return;
    }

    setStatus("Searching…", "info");
    targetEl.innerHTML = "";

    try {
      const mode    = isAllDigits(lastOrId) ? "id" : "name";
      const payload = (mode === "id")
        ? { mode, ghin: lastOrId }
        : { mode, state: st, lastName: lastOrId, firstName: first, clubName: club };

      const res = await MA.postJson(MA.paths.ghinPlayerSearch, payload);

      if (!res || !res.ok) {
        throw new Error(res?.message || "Search failed.");
      }

      const rows      = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
      const truncated = !!res.payload?.truncated || rows.length >= TRUNCATION_THRESHOLD;

      // Store in whichever state bucket was passed in
      state.rows      = rows;
      state.truncated = truncated;

      renderRows(rows, truncated, cfg.existingGHINs, targetEl, cfg.onSelect);

      if (!rows.length) {
        setStatus("Results: 0 found", "info");
      } else if (truncated) {
        setStatus(`Results: ${rows.length}+ found (truncated — refine search)`, "warn");
      } else {
        setStatus(`Results: ${rows.length} found`, "info");
      }

    } catch (e) {
      console.error("[GHIN_SEARCH] doSearch error", {
        message: e?.message,
        url:     MA?.paths?.ghinPlayerSearch,
      });
      setStatus(safeStr(e?.message || e), "error");
    }
  }

  /**
   * renderRows — renders result rows into targetEl.
   * Uses shared CSS vocabulary: maListRow--player, iconBtn--add, iconBtn--check.
   *
   * @param {Array}       rows          - raw API rows
   * @param {boolean}     truncated     - whether results were cut off
   * @param {Set}         existingGHINs - already-enrolled GHINs
   * @param {HTMLElement} targetEl      - container to render into
   * @param {function}    onSelect      - callback(normalizedPlayer)
   */
  function renderRows(rows, truncated, existingGHINs, targetEl, onSelect) {
    targetEl.innerHTML = "";

    if (truncated) {
      const band = el("div", "maInlineStatus",
        "Results truncated — refine your search.");
      targetEl.appendChild(band);
    }

    rows.forEach(row => {
      const ghin   = safeStr(row.ghin).trim();
      const name   = safeStr(row.name).trim();
      const hi     = safeStr(row.hi).trim();
      const gender = safeStr(row.gender).trim();
      const club   = safeStr(row.club_name || row.clubName || "").trim();

      const already = existingGHINs && existingGHINs.has(ghin);

      // Row: maListRow + maListRow--player for the 4-col grid
      const item = el("div", `maListRow maListRow--player${already ? " maListRow--enrolled" : ""}`);
      item.setAttribute("data-ghin", ghin);

      const nameLine = club ? `${name} · ${club}` : name;
      const c1 = el("div", "maListRow__col", nameLine);
      const c2 = el("div", "maListRow__col", hi);
      const c3 = el("div", "maListRow__col", gender);

      // Indicator button — iconBtn--check (enrolled) or iconBtn--add (available)
      const c4    = el("button", `iconBtn ${already ? "iconBtn--check" : "iconBtn--add"}`);
      c4.type     = "button";
      c4.disabled = true; // indicator only — click is on the row
      c4.innerHTML = already ? ICON_CHECK : ICON_ADD;
      c4.setAttribute("aria-label", already ? "Enrolled" : "Add player");

      item.appendChild(c1);
      item.appendChild(c2);
      item.appendChild(c3);
      item.appendChild(c4);

      if (!already) {
        item.style.cursor = "pointer";
        item.addEventListener("click", () => {
          if (typeof onSelect !== "function") return;
          // Deliver normalized player object per spec §2.3
          onSelect({
            ghin:           safeStr(row.ghin),
            first_name:     safeStr(row.first_name || ""),
            last_name:      safeStr(row.last_name  || ""),
            name:           safeStr(row.name),
            gender:         safeStr(row.gender),
            hi:             safeStr(row.hi),
            club_name:      safeStr(row.club_name || row.clubName || ""),
            email:          safeStr(row.email     || ""),
            mobile:         safeStr(row.mobile    || ""),
            recentTeeSetId: "",
            source:         "ghin",
          });
        });
      }

      targetEl.appendChild(item);
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL MODE — open() / close()
  // Call signature unchanged — Favorites page requires zero changes.
  // ═══════════════════════════════════════════════════════════════════════════

  let _mounted = false;
  let _root, _panel, _title, _statusEl, _stateInp, _lastInp, _firstInp, _clubInp,
      _btnSearch, _btnClose, _resultsEl;

  // Modal-mode state bucket (mirrors panel WeakMap slots)
  const _modalState = { rows: [], truncated: false, scrollTop: 0 };

  function mountModalOnce() {
    if (_mounted) return;

    _root  = el("div", "maModalOverlay");
    _root.id = "ghinSearchModal";
    _panel = el("div", "maModal");

    // Header
    const hdr   = el("div", "maModal__hdr");
    _title      = el("div", "maModal__title", "GHIN Player Search");
    _btnClose   = el("button", "iconBtn btnPrimary");
    _btnClose.type    = "button";
    _btnClose.innerHTML = ICON_CLOSE;
    hdr.appendChild(_title);
    hdr.appendChild(_btnClose);

    // Controls — Row 1: State · Last name · Search button
    const controls = el("div", "maModal__controls");
    const row1     = el("div", "maFieldRow ghinSearchRow");
    row1.style.cssText = "gap:6px; align-items:center; flex-wrap:nowrap;";

    const wState = el("div", "maInputWrap--clearable");
    wState.style.cssText = "flex:0 0 72px;";
    _stateInp    = el("input", "maTextInput");
    _stateInp.placeholder = "State";
    _stateInp.maxLength   = 2;
    wState.appendChild(_stateInp);

    const wLast  = el("div", "maInputWrap--clearable");
    wLast.style.cssText = "flex:1 1 110px;";
    _lastInp     = el("input", "maTextInput");
    _lastInp.placeholder = "Last name or GHIN# (required)";
    wLast.appendChild(_lastInp);

    const fBtn   = el("div", "maField ghinFieldBtn");
    fBtn.style.flex = "0 0 auto";
    _btnSearch   = el("button", "btn btnSecondary", "Search");
    _btnSearch.type = "button";
    fBtn.appendChild(_btnSearch);

    row1.appendChild(wState);
    row1.appendChild(wLast);
    row1.appendChild(fBtn);

    // Row 2: First name · Club name
    const row2   = el("div", "maFieldRow");
    row2.style.cssText = "gap:6px; align-items:center; flex-wrap:wrap; margin-top:4px;";

    const wFirst = el("div", "maInputWrap--clearable");
    wFirst.style.cssText = "flex:1 1 110px;";
    _firstInp    = el("input", "maTextInput");
    _firstInp.placeholder = "First name (optional)";
    wFirst.appendChild(_firstInp);

    const wClub  = el("div", "maInputWrap--clearable");
    wClub.style.cssText = "flex:1 1 110px;";
    _clubInp     = el("input", "maTextInput");
    _clubInp.placeholder = "Club name (optional)";
    wClub.appendChild(_clubInp);

    row2.appendChild(wFirst);
    row2.appendChild(wClub);

    controls.appendChild(row1);
    controls.appendChild(row2);

    // Body
    const body = el("div", "maModal__body maModal__body--flush");
    body.insertAdjacentHTML("beforeend", RESULTS_HDR_HTML);
    _resultsEl = el("div", "maListRows");
    body.appendChild(_resultsEl);

    // Footer (local status line)
    const ftr = el("footer", "maModal__ftr");
    _statusEl  = el("div", "maHelpText");
    ftr.appendChild(_statusEl);

    _panel.appendChild(hdr);
    _panel.appendChild(controls);
    _panel.appendChild(body);
    _panel.appendChild(ftr);
    _root.appendChild(_panel);
    document.body.appendChild(_root);

    // Outside-click suppressed per original spec
    _root.addEventListener("click", e => {
      if (e.target === _root) { e.preventDefault(); e.stopPropagation(); }
    });

    _btnClose.addEventListener("click",  () => close());
    _btnSearch.addEventListener("click", () => _modalDoSearch());
    [_stateInp, _lastInp, _firstInp, _clubInp].forEach(inp => {
      inp.addEventListener("keydown", e => { if (e.key === "Enter") _modalDoSearch(); });
    });

    _mounted = true;
  }

  let _cfg = null;

  function _modalSetStatus(msg, level) {
    _statusEl.textContent = safeStr(msg);
    _statusEl.setAttribute("data-level", safeStr(level || ""));
  }

  function _modalDoSearch() {
    if (!_cfg) return;
    doSearch(
      { stateInp: _stateInp, lastInp: _lastInp, firstInp: _firstInp, clubInp: _clubInp },
      _cfg,
      _modalState,
      _resultsEl,
      _modalSetStatus
    );
  }

  function open(cfg) {
    mountModalOnce();
    _cfg = Object.assign({
      title:         "GHIN Player Search",
      defaultState:  "",
      existingGHINs: new Set(),
      onSelect:      null,
    }, cfg || {});

    _title.textContent    = safeStr(_cfg.title || "GHIN Player Search");
    _stateInp.value       = safeStr(_cfg.defaultState || "").toUpperCase();
    _lastInp.value        = "";
    _firstInp.value       = "";
    _clubInp.value        = "";
    _statusEl.textContent = "";
    _resultsEl.innerHTML  = "";
    _modalState.rows      = [];
    _modalState.truncated = false;

    _root.classList.add("is-open");
    document.body.classList.add("maOverlayOpen");
    setTimeout(() => _lastInp && _lastInp.focus(), 0);
  }

  function close() {
    if (!_mounted) return;
    _root.classList.remove("is-open");
    document.body.classList.remove("maOverlayOpen");
    _cfg = null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL MODE — mount()
  // Renders search controls inline into host-supplied DOM elements.
  // WeakMap keyed on controlsEl — Game Players and Event Roster never collide.
  // ═══════════════════════════════════════════════════════════════════════════

  // WeakMap: controlsEl → panel state object
  const _panelStates = new WeakMap();

  /**
   * mount() — safe to call on every parent render cycle.
   * Detects whether controlsEl is already initialized and updates
   * existingGHINs without re-rendering the controls or resetting state.
   *
   * @param {object} cfg
   *   controlsEl    {HTMLElement}        host supplies — renders controls here
   *   bodyEl        {HTMLElement}        host supplies — renders rows here
   *   footerEl      {HTMLElement|null}   not used by ghinSearch (pass null)
   *   defaultState  {string}             used only on first mount
   *   existingGHINs {Set}                refreshed on every mount call
   *   onSelect      {function(player)}   callback
   */
  function mount(cfg) {
    const controlsEl = cfg.controlsEl;
    const bodyEl     = cfg.bodyEl;
    if (!controlsEl || !bodyEl) return;

    const existingGHINs = cfg.existingGHINs instanceof Set
      ? cfg.existingGHINs
      : new Set();

    // ── Already initialized? ─────────────────────────────────────────────
    if (_panelStates.has(controlsEl)) {
      const st = _panelStates.get(controlsEl);

      // Refresh live enrollment set — re-evaluate existing rows in place
      st.existingGHINs = existingGHINs;
      st.onSelect      = cfg.onSelect || st.onSelect;

      // Re-render rows from cached results so checkmarks update without a search
      if (st.rows.length) {
        renderRows(st.rows, st.truncated, st.existingGHINs, st._rowsEl, st.onSelect);
      }

      // Restore scroll position
      if (st.scrollTop && bodyEl) {
        requestAnimationFrame(() => { bodyEl.scrollTop = st.scrollTop; });
      }
      return;
    }

    // ── First mount: build controls HTML ────────────────────────────────
    const defaultState = safeStr(cfg.defaultState || "").toUpperCase();

    const st = {
      ghinState:    defaultState,
      ghinLast:     "",
      ghinFirst:    "",
      ghinClub:     "",
      rows:         [],
      truncated:    false,
      scrollTop:    0,
      existingGHINs,
      onSelect:     cfg.onSelect || null,
      _rowsEl:      null,   // assigned below after DOM build
      _statusEl:    null,
    };
    _panelStates.set(controlsEl, st);

    // Build controls
    controlsEl.innerHTML = `
      <div class="maFieldRow" style="gap:6px; align-items:center; flex-wrap:nowrap;">
        <div class="maInputWrap--clearable" style="flex:0 0 72px;">
          <input class="maTextInput ghinPanelState" maxlength="2"
            placeholder="State" value="${_esc(defaultState)}" autocomplete="off">
        </div>
        <div class="maInputWrap--clearable" style="flex:1 1 110px;">
          <input class="maTextInput ghinPanelLast"
            placeholder="Last name or GHIN#" autocomplete="off">
          <button class="maClearBtn isHidden ghinPanelLastClear"
            type="button" aria-label="Clear">×</button>
        </div>
        <button class="btn btnSecondary ghinPanelSearch"
          type="button" style="flex-shrink:0;">Search</button>
      </div>
      <div class="maFieldRow" style="gap:6px; align-items:center; flex-wrap:wrap; margin-top:4px;">
        <div class="maInputWrap--clearable" style="flex:1 1 110px;">
          <input class="maTextInput ghinPanelFirst"
            placeholder="First name (optional)" autocomplete="off">
          <button class="maClearBtn isHidden ghinPanelFirstClear"
            type="button" aria-label="Clear">×</button>
        </div>
        <div class="maInputWrap--clearable" style="flex:1 1 110px;">
          <input class="maTextInput ghinPanelClub"
            placeholder="Club name (optional)" autocomplete="off">
          <button class="maClearBtn isHidden ghinPanelClubClear"
            type="button" aria-label="Clear">×</button>
        </div>
      </div>`;

    // Results header + rows container into bodyEl
    bodyEl.innerHTML = RESULTS_HDR_HTML;
    const rowsEl = el("div", "maListRows");
    bodyEl.appendChild(rowsEl);
    st._rowsEl = rowsEl;

    // Local status uses MA.setStatus so the page chrome gets the feedback,
    // consistent with how the existing game_players GHIN tab works
    function panelSetStatus(msg) {
      if (typeof MA.setStatus === "function") MA.setStatus(msg, "info");
    }

    // Wire inputs
    const stateInp  = controlsEl.querySelector(".ghinPanelState");
    const lastInp   = controlsEl.querySelector(".ghinPanelLast");
    const firstInp  = controlsEl.querySelector(".ghinPanelFirst");
    const clubInp   = controlsEl.querySelector(".ghinPanelClub");
    const lastClear = controlsEl.querySelector(".ghinPanelLastClear");
    const firstClear= controlsEl.querySelector(".ghinPanelFirstClear");
    const clubClear = controlsEl.querySelector(".ghinPanelClubClear");
    const btnSearch = controlsEl.querySelector(".ghinPanelSearch");

    // State field — normalize to uppercase, max 2 chars
    if (stateInp) {
      stateInp.addEventListener("input", () => {
        const v = stateInp.value.toUpperCase().slice(0, 2);
        stateInp.value = v;
        st.ghinState   = v;
      });
    }

    // Last name / GHIN field + clear button
    if (lastInp) {
      lastInp.addEventListener("input", () => {
        st.ghinLast = safeStr(lastInp.value);
        if (lastClear) lastClear.classList.toggle("isHidden", !st.ghinLast);
      });
    }
    if (lastClear) {
      lastClear.addEventListener("click", () => {
        st.ghinLast = "";
        if (lastInp) { lastInp.value = ""; lastInp.focus(); }
        lastClear.classList.add("isHidden");
      });
    }

    // First name field + clear button
    if (firstInp) {
      firstInp.addEventListener("input", () => {
        st.ghinFirst = safeStr(firstInp.value);
        if (firstClear) firstClear.classList.toggle("isHidden", !st.ghinFirst);
      });
    }
    if (firstClear) {
      firstClear.addEventListener("click", () => {
        st.ghinFirst = "";
        if (firstInp) { firstInp.value = ""; firstInp.focus(); }
        firstClear.classList.add("isHidden");
      });
    }

    // Club name field + clear button
    if (clubInp) {
      clubInp.addEventListener("input", () => {
        st.ghinClub = safeStr(clubInp.value);
        if (clubClear) clubClear.classList.toggle("isHidden", !st.ghinClub);
      });
    }
    if (clubClear) {
      clubClear.addEventListener("click", () => {
        st.ghinClub = "";
        if (clubInp) { clubInp.value = ""; clubInp.focus(); }
        clubClear.classList.add("isHidden");
      });
    }

    // Scroll position save
    if (bodyEl) {
      bodyEl.addEventListener("scroll", () => { st.scrollTop = bodyEl.scrollTop; }, { passive: true });
    }

    function runSearch() {
      doSearch(
        { stateInp, lastInp, firstInp, clubInp },
        { existingGHINs: st.existingGHINs, onSelect: st.onSelect },
        st,
        rowsEl,
        panelSetStatus
      );
    }

    if (btnSearch) btnSearch.addEventListener("click", runSearch);
    [stateInp, lastInp, firstInp, clubInp].forEach(inp => {
      if (!inp) return;
      inp.addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); });
    });
  }


  // ── Tiny HTML-escape helper (panel controls only — body uses renderRows) ──
  function _esc(v) {
    return safeStr(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }


  // ── Public API ──────────────────────────────────────────────────────────────
  MA.ghinSearch.open  = open;
  MA.ghinSearch.close = close;
  MA.ghinSearch.mount = mount;

})();