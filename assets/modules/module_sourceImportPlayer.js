/* /assets/modules/module_sourceImportPlayer.js
 * MA.importPlayerSource — Player Import source module.
 *
 * Phase 1 (this build): Event Roster destination only. No tee logic
 * anywhere in this file — event rosters carry no tee concept. Flat-game
 * Import stays on its existing, separate, inline implementation in
 * game_players.js until Phase 2 ports it onto this same module and
 * re-wires the host's existing tee-resolution flow (beginTeeFlow /
 * TeeSetSelection) around this module's onImportMany callback — that
 * flow is NOT duplicated here; it stays host-side, same as every other
 * source module's tee handling already does today.
 *
 * Public API:
 *   MA.importPlayerSource.mount(cfg)
 *
 * mount() cfg:
 *   controlsEl    {HTMLElement}         unused for rendering — kept only as
 *                                       the WeakMap state anchor, same slot
 *                                       every sibling module keys state on.
 *                                       Mode switching lives in the footer.
 *   bodyEl        {HTMLElement}         renders entry surface / review rows
 *   footerEl      {HTMLElement}         renders entry hint / Back+Import (required)
 *   modes         {string[]}            subset of ["external","game","event"],
 *                                       in display order. Host decides which
 *                                       sub-features are enabled — the module
 *                                       never assumes a fixed 2-vs-3 split.
 *   existingGHINs {Set}                 destination roster GHINs, refreshed on
 *                                       every mount call
 *   paths         {object}              { resolveIdentifiers, ghinSearch,
 *                                         sourceGames, gamePlayersEventImport,
 *                                         sourceEvents, eventPlayersEventImport }
 *   onImportMany  {function(players)}   commit callback — host owns the actual
 *                                       persistence call (enrollMany /
 *                                       saveEventRosterPlayer), same contract
 *                                       as every other module's onSelectMany
 *
 * Normalized player object handed to onImportMany:
 *   { ghin, first_name, last_name, name, gender, source }
 *
 * Dependencies:
 *   ma_shared.js (MA.postJson, MA.ui.notify)
 *   module_parseImportPlayers.js (MA.parseImportPlayers) — unchanged, reused as-is
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.importPlayerSource = MA.importPlayerSource || {};

  // ── Utilities ───────────────────────────────────────────────────────────────
  function safe(v) { return (v == null) ? "" : String(v); }
  function esc(v) {
    return safe(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function notify(msg, level) {
    if (MA.ui && typeof MA.ui.notify === "function") MA.ui.notify(msg, level);
    else if (typeof MA.setStatus === "function") MA.setStatus(msg, level);
  }
  function splitName(full) {
    const s = safe(full).trim();
    if (!s) return { first: "", last: "" };
    const parts = s.split(/\s+/);
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last:  parts.length > 1 ? parts[parts.length - 1] : "",
    };
  }

  // ── SVG icons — same set as eventRosterSource/favoritesSource ────────────────
  const ICON_CHECK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const ICON_ALERT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12" y2="16.51"></line></svg>`;
  const ICON_CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
  const ICON_CHEVRON_DOWN  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

  const MODE_LABELS = {
    external: "External List",
    game:     "Existing Game",
    event:    "Existing Event",
  };

  // ── WeakMap sticky state — keyed on controlsEl ────────────────────────────
  const _states = new WeakMap();

  function _initState(controlsEl, cfg) {
    const st = {
      modes:         Array.isArray(cfg.modes) && cfg.modes.length ? cfg.modes : ["external"],
      activeMode:    "",
      step:          "entry",     // entry | review
      importText:    "",
      sourceGames:   null,        // null = not yet fetched
      sourceEvents:  null,
      reviewRows:    [],          // built by evaluate/load, consumed by review render
      busy:          false,
      existingGHINs: cfg.existingGHINs instanceof Set ? cfg.existingGHINs : new Set(),
      paths:         cfg.paths || {},
      onImportMany:  typeof cfg.onImportMany === "function" ? cfg.onImportMany : null,
      bodyEl:        cfg.bodyEl,
      footerEl:      cfg.footerEl,
      _controlsEl:   controlsEl,
    };
    st.activeMode = st.modes[0];
    _states.set(controlsEl, st);
    return st;
  }

  // ── Selectable-row helpers ────────────────────────────────────────────────
  function _validRows(st)   { return st.reviewRows.filter(r => r.selectable); }
  function _checkedRows(st) { return _validRows(st).filter(r => r.checked); }

  // ── Row label — Name (Gender), or the raw unresolved token, never both ────
  function _rowLabel(row) {
    if (row.selectable || row.status === "enrolled") {
      const g = safe(row.gender);
      return esc(row.name) + (g ? ` <span style="font-weight:400;">(${esc(g)})</span>` : "");
    }
    // Unresolved — show only what the admin themselves typed/knows. Never
    // pair a raw Golf Network ID with a resolved name under any circumstance.
    return esc(row.rawDisplay);
  }

  function _rowIcon(row) {
    if (row.status === "enrolled") return `<button class="iconBtn iconBtn--check" disabled aria-label="Already on roster">${ICON_CHECK}</button>`;
    if (!row.selectable)           return `<span style="color:var(--danger); display:inline-flex;" aria-label="${esc(row.errorReason || "Unresolved")}">${ICON_ALERT}</span>`;
    return "";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — controls / body / footer
  //
  // controlsEl is unused for Import — no toggle lives there. Mode switching
  // moved to the footer (two full-width buttons, excluding whichever mode
  // is currently active) precisely because the controls-area toggle sat
  // immediately adjacent to the host's own top-level tab strip and the two
  // segmented bars visually blended into one. Footer has no such neighbor.
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderControls(st) {
    const controlsEl = st._controlsEl;

    if (st.step === "review") {
      controlsEl.innerHTML = "";
      controlsEl.style.display = "none";
      return;
    }

    controlsEl.style.display = "";

    const HINTS = {
      external: `<div class="maHelpText">Accepts golf network ID and email addresses.</div>
                  <div class="maHelpText">Paste content using comma/semicolon separators.</div>`,
      game:     `<div class="maHelpText">Select a Game to copy its roster.</div>`,
      event:    `<div class="maHelpText">Select an Event to copy its roster.</div>`,
    };

    controlsEl.innerHTML = HINTS[st.activeMode] || "";
  }

  function _renderFooter(st) {
    const footerEl = st.footerEl;
    if (!footerEl) return;

    if (st.step === "entry") {
      const others = st.modes.filter(m => m !== st.activeMode);
      footerEl.innerHTML = others.map((m, idx) => `
        <button type="button" class="btn btnPrimary" data-switch-mode="${esc(m)}"
          style="width:100%; ${idx > 0 ? "margin-top:6px;" : ""} display:flex; align-items:center; justify-content:space-between;">
          <span>Import from ${esc(MODE_LABELS[m] || m)}</span>
          ${ICON_CHEVRON_DOWN}
        </button>`).join("");

      footerEl.querySelectorAll("[data-switch-mode]").forEach(btn => {
        btn.addEventListener("click", () => {
          st.activeMode = btn.getAttribute("data-switch-mode");
          st.step = "entry";
          st.reviewRows = [];
          _renderAll(st);
        });
      });
      return;
    }

    // Review step — Back / Import(N). No mode-switch buttons here; Back
    // is the only way out, matching the earlier design decision.
    const checkedCount = _checkedRows(st).length;
    footerEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <button type="button" class="btn btnPrimary" id="ipsBackBtn">Back</button>
        <button type="button" class="btn btnSecondary" id="ipsImportBtn" ${checkedCount ? "" : "disabled"}>Import ${checkedCount} Player${checkedCount !== 1 ? "s" : ""}</button>
      </div>`;

    const backBtn = footerEl.querySelector("#ipsBackBtn");
    if (backBtn) backBtn.addEventListener("click", () => {
      st.step = "entry";
      st.reviewRows = [];
      _renderAll(st);
    });

    const importBtn = footerEl.querySelector("#ipsImportBtn");
    if (importBtn) importBtn.addEventListener("click", () => _commit(st));
  }

  function _renderBody(st) {
    const bodyEl = st.bodyEl;
    if (!bodyEl) return;

    if (st.step === "review") {
      _renderReviewBody(st);
      return;
    }

    if (st.busy) {
      bodyEl.innerHTML = `<div class="maEmptyState">Working…</div>`;
      return;
    }

    if (st.activeMode === "external") {
      bodyEl.innerHTML = `
        <textarea id="ipsTextarea" class="maTextInput" style="width:100%; min-height:180px; resize:vertical;" placeholder="123456&#10;player@email.com&#10;987654">${esc(st.importText)}</textarea>
        <button type="button" class="btn btnSecondary" id="ipsEvaluateBtn" style="width:100%; margin-top:8px;">Evaluate</button>`;

      const ta = bodyEl.querySelector("#ipsTextarea");
      if (ta) ta.addEventListener("input", () => { st.importText = safe(ta.value); });

      const evalBtn = bodyEl.querySelector("#ipsEvaluateBtn");
      if (evalBtn) evalBtn.addEventListener("click", () => _evaluateExternal(st));
      return;
    }

    if (st.activeMode === "game") {
      _renderPickerBody(st, "game");
      return;
    }

    if (st.activeMode === "event") {
      _renderPickerBody(st, "event");
      return;
    }
  }

  function _renderPickerBody(st, kind) {
    const bodyEl = st.bodyEl;
    const cacheKey = kind === "game" ? "sourceGames" : "sourceEvents";

    if (st[cacheKey] === null) {
      bodyEl.innerHTML = `<div class="maEmptyState">Loading…</div>`;
      _fetchPickerList(st, kind).then(() => _renderPickerBody(st, kind));
      return;
    }

    const rows = st[cacheKey] || [];
    if (!rows.length) {
      bodyEl.innerHTML = `<div class="maEmptyState">No ${kind === "game" ? "games" : "events"} found.</div>`;
      return;
    }

    bodyEl.innerHTML = `<div class="maListRows">${rows.map((r, idx) => `
      <div class="maListRow" data-picker-idx="${idx}" style="cursor:pointer;">
        <div style="min-width:0; flex:1;">
          <div class="maListRow__col">${esc(r.title)}</div>
          <div class="maListRow__subline">${esc(r.sub)}</div>
        </div>
        ${ICON_CHEVRON_RIGHT}
      </div>`).join("")}</div>`;

    bodyEl.querySelectorAll("[data-picker-idx]").forEach(row => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.getAttribute("data-picker-idx"), 10);
        const picked = rows[idx];
        if (!picked) return;
        if (kind === "game") _loadFromGame(st, picked.ggid);
        else _loadFromEvent(st, picked.eid);
      });
    });
  }

  function _renderReviewBody(st) {
    const bodyEl = st.bodyEl;
    const okRows = _validRows(st);
    const allChecked = okRows.length > 0 && okRows.every(r => r.checked);

    const toggleBand = okRows.length ? `
      <div class="maMultiToggle">
        <button type="button" class="btn btnLink" id="ipsToggleAll">${allChecked ? "Clear All" : "Select All"}</button>
      </div>` : "";

    const rows = st.reviewRows.map((r, idx) => `
      <div class="maListRow maListRow--playerMulti ${r.status === "enrolled" ? "maListRow--enrolled" : ""}"
        data-review-idx="${idx}"
        style="cursor:${r.selectable ? "pointer" : "default"};">
        <div class="maCheckbox maCheckbox--accent ${r.checked ? "is-checked" : ""} ${!r.selectable ? "is-disabled" : ""}"></div>
        <div style="min-width:0;">
          <div class="maListRow__col">${_rowLabel(r)}</div>
        </div>
        <div></div>
        ${_rowIcon(r)}
      </div>`).join("");

    bodyEl.innerHTML = toggleBand + `<div class="maListRows">${rows || `<div class="maEmptyState">No rows evaluated.</div>`}</div>`;

    const toggleAllBtn = bodyEl.querySelector("#ipsToggleAll");
    if (toggleAllBtn) toggleAllBtn.addEventListener("click", () => {
      const target = !allChecked;
      okRows.forEach(r => { r.checked = target; });
      _renderAll(st);
    });

    bodyEl.querySelectorAll("[data-review-idx]").forEach(rowEl => {
      rowEl.addEventListener("click", () => {
        const idx = parseInt(rowEl.getAttribute("data-review-idx"), 10);
        const row = st.reviewRows[idx];
        if (!row || !row.selectable) return;
        row.checked = !row.checked;
        _renderAll(st);
      });
    });
  }

  function _renderAll(st) {
    _renderControls(st);
    _renderBody(st);
    _renderFooter(st);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA — picker lists
  // ═══════════════════════════════════════════════════════════════════════════

  async function _fetchPickerList(st, kind) {
    const path = kind === "game" ? st.paths.sourceGames : st.paths.sourceEvents;
    if (!path) { st[kind === "game" ? "sourceGames" : "sourceEvents"] = []; return; }

    try {
      const res = await MA.postJson(path, {});
      const raw = kind === "game"
        ? (Array.isArray(res?.payload?.games) ? res.payload.games : [])
        : (Array.isArray(res?.payload?.events) ? res.payload.events : []);

      if (kind === "game") {
        st.sourceGames = raw.map(g => ({
          ggid:  safe(g.ggid),
          title: safe(g.title || "Untitled Game"),
          sub:   [safe(g.playDate), (g.playerCount != null ? `${g.playerCount} players` : "")].filter(Boolean).join(" · "),
        }));
      } else {
        st.sourceEvents = raw.map(e => ({
          eid:   safe(e.eid),
          title: safe(e.title || "Untitled Event"),
          sub:   [safe(e.startDate), (e.rosterCount != null ? `${e.rosterCount} players` : "")].filter(Boolean).join(" · "),
        }));
      }
    } catch (e) {
      notify(`Unable to load ${kind === "game" ? "games" : "events"}.`, "warn");
      st[kind === "game" ? "sourceGames" : "sourceEvents"] = [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVALUATE — External List
  // ═══════════════════════════════════════════════════════════════════════════

  async function _evaluateExternal(st) {
    if (st.busy) return;

    const parsed = MA.parseImportPlayers(st.importText);
    if (!parsed.length) {
      notify("Enter at least one Golf Network number or email address.", "warn");
      return;
    }

    const unknown    = parsed.filter(p => p.type === "unknown");
    const actionable = parsed.filter(p => p.type === "ghin" || p.type === "email");

    if (unknown.length) {
      notify(`${unknown.length} unrecognized entr${unknown.length === 1 ? "y" : "ies"} will be skipped.`, "warn");
    }
    if (!actionable.length) {
      notify("No valid Golf Network numbers or email addresses found.", "warn");
      return;
    }

    st.busy = true;
    _renderAll(st);

    try {
      // Step 1 — Favorites-first resolution for BOTH token types.
      let resolved = [];
      if (st.paths.resolveIdentifiers) {
        const res = await MA.postJson(st.paths.resolveIdentifiers, { identifiers: actionable });
        if (res?.ok) {
          resolved = res.resolved || [];
          const unresolved = res.unresolved || [];
          if (unresolved.length) {
            notify(`${unresolved.length} entr${unresolved.length === 1 ? "y" : "ies"} could not be matched to a Favorites email.`, "warn");
          }
        }
      }

      // Step 2 — live GHIN lookup fallback, only for rows Favorites had no name for.
      // Sequential, same fragility as the existing loop it replaces — a single
      // failed row aborts the remaining ones. Deliberately not fixed here;
      // deferred as a separate unit of work across all commit/evaluate loops.
      const seen = new Set();
      const rows = [];

      for (const item of resolved) {
        const ghin = safe(item.ghin);
        const row = {
          ghin,
          name: safe(item.name),
          gender: safe(item.gender),
          rawDisplay: item.type === "email" ? safe(item.input) : safe(ghin || item.input),
          status: "",
          selectable: false,
          checked: false,
          errorReason: "",
        };

        if (!ghin) {
          row.status = "notfound";
          row.errorReason = "Not found";
          rows.push(row);
          continue;
        }

        if (seen.has(ghin)) {
          row.status = "duplicate";
          row.errorReason = "Resolves to the same identity as another entry";
          rows.push(row);
          continue;
        }
        seen.add(ghin);

        if (st.existingGHINs.has(ghin)) {
          row.status = "enrolled";
          rows.push(row);
          continue;
        }

        if (!row.name && st.paths.ghinSearch) {
          const gres = await MA.postJson(st.paths.ghinSearch, { mode: "id", ghin });
          const hit  = Array.isArray(gres?.payload?.rows) ? gres.payload.rows[0] : null;
          if (hit) {
            row.name   = safe(hit.name);
            row.gender = safe(hit.gender);
          }
        }

        if (!row.name) {
          row.status = "notfound";
          row.errorReason = "Golf Network ID not found";
          rows.push(row);
          continue;
        }

        row.status = "ok";
        row.selectable = true;
        row.checked = true;
        rows.push(row);
      }

      st.reviewRows = rows;
      st.step = "review";
    } catch (e) {
      notify("Evaluation failed. Please try again.", "danger");
    } finally {
      st.busy = false;
      _renderAll(st);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD — Existing Game / Existing Event
  // ═══════════════════════════════════════════════════════════════════════════

  async function _loadFromGame(st, sourceGGID) {
    await _loadFromSource(st, st.paths.gamePlayersEventImport, { sourceGGID });
  }

  async function _loadFromEvent(st, sourceEID) {
    await _loadFromSource(st, st.paths.eventPlayersEventImport, { sourceEID });
  }

  async function _loadFromSource(st, path, body) {
    if (st.busy || !path) return;
    st.busy = true;
    _renderAll(st);

    try {
      const res = await MA.postJson(path, body);
      if (!res?.ok) {
        notify(res?.message || "Unable to load players.", "warn");
        return;
      }
      const rawRows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];

      st.reviewRows = rawRows.map(r => {
        const ghin      = safe(r.ghin);
        const enrolled  = !!r.alreadyOnRoster || st.existingGHINs.has(ghin);
        return {
          ghin,
          name:        safe(r.playerName),
          gender:      safe(r.gender),
          rawDisplay:  ghin,
          status:      enrolled ? "enrolled" : "ok",
          selectable:  !enrolled,
          checked:     !enrolled,
          errorReason: "",
        };
      });
      st.step = "review";
    } catch (e) {
      notify("Unable to load players.", "danger");
    } finally {
      st.busy = false;
      _renderAll(st);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMIT — hand off to host, never persists directly
  // ═══════════════════════════════════════════════════════════════════════════

  function _commit(st) {
    const checked = _checkedRows(st);
    if (!checked.length || typeof st.onImportMany !== "function") return;

    const players = checked.map(r => {
      const nm = splitName(r.name);
      return {
        ghin:       r.ghin,
        first_name: nm.first,
        last_name:  nm.last,
        name:       r.name,
        gender:     r.gender,
        source:     "import",
      };
    });

    st.onImportMany(players);

    // Reset to entry — same as Back, plus clearing the source text/picks,
    // since a successful commit means this batch is done.
    st.step = "entry";
    st.reviewRows = [];
    st.importText = "";
    _renderAll(st);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * mount() — safe to call on every parent render cycle.
   * First call: initializes state, renders entry view for the first mode.
   * Subsequent calls: refreshes existingGHINs/callbacks only — step,
   * importText, and reviewRows are left untouched, same preserve-on-
   * remount contract every sibling module already follows.
   */
  function mount(cfg) {
    const controlsEl = cfg.controlsEl;
    const bodyEl     = cfg.bodyEl;
    if (!controlsEl || !bodyEl) return;

    const existingGHINs = cfg.existingGHINs instanceof Set ? cfg.existingGHINs : new Set();

    if (_states.has(controlsEl)) {
      const st = _states.get(controlsEl);
      st.existingGHINs = existingGHINs;
      st.paths         = cfg.paths        || st.paths;
      st.onImportMany  = typeof cfg.onImportMany === "function" ? cfg.onImportMany : st.onImportMany;
      st.footerEl      = cfg.footerEl     || st.footerEl;
      st.bodyEl        = bodyEl;
      return;
    }

    const st = _initState(controlsEl, cfg);
    _renderAll(st);
  }

  /**
   * cancel(controlsEl) — force back to entry state, discarding any pending
   * review batch. Called by the host on tab-away, same role as
   * favoritesSource.cancelMultiAdd() / nonRatedSource.clearSelection().
   * importText and any picker selection are intentionally left intact —
   * only the staged review batch is discarded, so returning to the tab
   * lands back at entry with the paste/pick still there.
   */
  function cancel(controlsEl) {
    const st = _states.get(controlsEl);
    if (!st || st.step !== "review") return;
    st.step = "entry";
    st.reviewRows = [];
    _renderAll(st);
  }

  MA.importPlayerSource.mount  = mount;
  MA.importPlayerSource.cancel = cancel;

})();
