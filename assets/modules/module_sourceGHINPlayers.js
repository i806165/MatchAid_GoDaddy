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

      const rows             = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
      const truncated        = !!res.payload?.truncated || rows.length >= TRUNCATION_THRESHOLD;
      const truncatedMessage = safeStr(res.payload?.truncatedMessage || "");

      // Store in whichever state bucket was passed in
      state.rows      = rows;
      state.truncated = truncated;

      // If a prominent truncation message is supplied, render it into the
      // results body directly — more visible than the footer status line.
      if (truncated && truncatedMessage) {
        targetEl.innerHTML = "";
        const msgEl = document.createElement("div");
        msgEl.className = "maEmptyState";
        msgEl.style.cssText = "padding:24px 16px; text-align:center; font-weight:600; color:var(--mutedText);";
        msgEl.textContent = truncatedMessage;
        targetEl.appendChild(msgEl);
        setStatus("", "");
        return;
      }

      renderRows(rows, truncated, cfg.existingGHINs, targetEl, cfg.onSelect);

      if (!rows.length) {
        setStatus("Results: 0 found", "info");
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
  let _root, _panel, _title, _statusEl, _btnClose;
  let _modalControlsEl = null;
  let _modalBodyEl     = null;

  function mountModalOnce() {
    if (_mounted) return;

    _root  = el("div", "maModalOverlay");
    _root.id = "ghinSearchModal";
    _panel = el("div", "maModal");

    // Header
    const hdr = el("div", "maModal__hdr");
    _title    = el("div", "maModal__title", "GHIN Player Search");
    _btnClose = el("button", "iconBtn btnPrimary");
    _btnClose.type    = "button";
    _btnClose.innerHTML = ICON_CLOSE;
    hdr.appendChild(_title);
    hdr.appendChild(_btnClose);

    // Controls — owned by mount()
    _modalControlsEl = el("div", "maModal__controls");

    // Body — owned by mount()
    _modalBodyEl = el("div", "maModal__body maModal__body--flush");

    // Footer — local status line
    const ftr = el("footer", "maModal__ftr");
    _statusEl  = el("div", "maHelpText");
    ftr.appendChild(_statusEl);

    _panel.appendChild(hdr);
    _panel.appendChild(_modalControlsEl);
    _panel.appendChild(_modalBodyEl);
    _panel.appendChild(ftr);
    _root.appendChild(_panel);
    document.body.appendChild(_root);

    // Outside-click suppressed per original spec
    _root.addEventListener("click", e => {
      if (e.target === _root) { e.preventDefault(); e.stopPropagation(); }
    });

    _btnClose.addEventListener("click", () => close());

    _mounted = true;
  }

  let _cfg = null;

  function open(cfg) {
    mountModalOnce();
    _cfg = Object.assign({
      title:         "GHIN Player Search",
      defaultState:  "",
      existingGHINs: new Set(),
      onSelect:      null,
    }, cfg || {});

    _title.textContent = safeStr(_cfg.title || "GHIN Player Search");
    _statusEl.textContent = "";

    // Delegate all field building and wiring to mount() — single code path
    mount({
      controlsEl:    _modalControlsEl,
      bodyEl:        _modalBodyEl,
      defaultState:  _cfg.defaultState,
      existingGHINs: _cfg.existingGHINs,
      onSelect:      _cfg.onSelect,
      reset:         true,
      setStatus:     (msg, level) => {
        _statusEl.textContent = safeStr(msg);
        _statusEl.setAttribute("data-level", safeStr(level || ""));
      },
    });

    _root.classList.add("is-open");
    document.body.classList.add("maOverlayOpen");

    // Focus last name field after mount() has built it
    setTimeout(() => {
      const lastInp = _modalControlsEl.querySelector(".ghinPanelLast");
      if (lastInp) lastInp.focus();
    }, 0);
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
   * Used by both panel mode (Game Players, Event Roster) and modal mode.
   *
   * @param {object} cfg
   *   controlsEl    {HTMLElement}        host supplies — renders controls here
   *   bodyEl        {HTMLElement}        host supplies — renders rows here
   *   defaultState  {string}             used only on first mount (or reset)
   *   existingGHINs {Set}                refreshed on every mount call
   *   onSelect      {function(player)}   callback
   *   reset         {boolean}            force re-initialization (modal re-open)
   *   setStatus     {function(msg,level)} optional status callback; defaults to MA.setStatus
   */
  function mount(cfg) {
    const controlsEl = cfg.controlsEl;
    const bodyEl     = cfg.bodyEl;
    if (!controlsEl || !bodyEl) return;

    const existingGHINs = cfg.existingGHINs instanceof Set
      ? cfg.existingGHINs
      : new Set();

    // ── Reset: clear WeakMap entry so modal re-opens fresh ───────────────
    if (cfg.reset && _panelStates.has(controlsEl)) {
      _panelStates.delete(controlsEl);
    }

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
      _rowsEl:      null,
      _statusEl:    null,
    };
    _panelStates.set(controlsEl, st);

    // Status callback — host-supplied (modal footer) or page chrome default
    const setStatus = typeof cfg.setStatus === "function"
      ? cfg.setStatus
      : (msg) => { if (typeof MA.setStatus === "function") MA.setStatus(msg, "info"); };

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
        setStatus
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