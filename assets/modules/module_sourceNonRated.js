/* /assets/modules/module_sourceNonRated.js
 * MA.nonRatedSource — Non-Rated player enrollment source module.
 *
 * Extracted from game_players.js. Reusable by any host page
 * (Game Players, Event Roster) via the standard mount() contract.
 *
 * Public API:
 *   MA.nonRatedSource.mount(cfg)
 *   MA.nonRatedSource.clearForm(controlsEl)
 *   MA.nonRatedSource.clearSelection(controlsEl)
 *
 * mount() cfg:
 *   controlsEl      {HTMLElement}             renders form controls
 *   bodyEl          {HTMLElement}             renders NH- player list
 *   footerEl        {HTMLElement|null}        not used — pass null
 *   existingPlayers {Array}                   full roster; module filters to NH- rows
 *   onAdd           {function({first_name, last_name, gender, hi})}
 *   onUpdate        {function(player, existingTee)}
 *
 * Note: existingGHINs is NOT used by this module — it receives the full
 * existingPlayers array instead (needs complete records for the edit form).
 * NH- GHIN generation is the responsibility of the host page, not this module.
 *
 * Dependencies:
 *   ma_shared.js loaded first (MA.postJson, MA.setStatus)
 */
(function () {
  "use strict";

  const MA = (window.MA = window.MA || {});
  MA.nonRatedSource = MA.nonRatedSource || {};

  // ── Utilities ───────────────────────────────────────────────────────────────

  function safe(v) { return (v == null) ? "" : String(v); }
  function esc(v) {
    return safe(v).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ── WeakMap sticky state ────────────────────────────────────────────────────
  const _states = new WeakMap();

  function _initState(controlsEl, cfg) {
    const st = {
      // Form field values — preserved across tab switches
      nrFirst:          "",
      nrLast:           "",
      nrHi:             "",
      nrGender:         "M",
      // Edit mode — which NH- GHIN is loaded into the form
      selectedGHIN:     null,
      // Live cfg refs — updated on every mount() call
      existingPlayers:  cfg.existingPlayers || [],
      onAdd:            cfg.onAdd           || null,
      onUpdate:         cfg.onUpdate        || null,
      bodyEl:           cfg.bodyEl          || null,
      _controlsEl:      controlsEl,
    };
    _states.set(controlsEl, st);
    return st;
  }

  // ── NH- player list helpers ─────────────────────────────────────────────────

  function _getNHPlayers(st) {
    return (st.existingPlayers || []).filter(p =>
      safe(p.dbPlayers_PlayerGHIN).startsWith("NH")
    );
  }

  // ── Render: controls (form) ─────────────────────────────────────────────────

  function _renderControls(controlsEl, st) {
    const isEditMode = !!st.selectedGHIN;

    controlsEl.innerHTML = `
      <div class="maFieldRow" style="gap:6px; align-items:center; flex-wrap:nowrap;">
        <div class="maInputWrap--clearable" style="flex:1 1 auto;">
          <input class="maTextInput nrFirst" placeholder="First name"
            value="${esc(st.nrFirst)}" autocomplete="off">
          <button class="maClearBtn nrFirstClear ${st.nrFirst ? "" : "isHidden"}"
            type="button" aria-label="Clear first name">×</button>
        </div>
        <div class="maInputWrap--clearable" style="flex:1 1 auto;">
          <input class="maTextInput nrLast" placeholder="Last name"
            value="${esc(st.nrLast)}" autocomplete="off">
          <button class="maClearBtn nrLastClear ${st.nrLast ? "" : "isHidden"}"
            type="button" aria-label="Clear last name">×</button>
        </div>
      </div>
      <div class="maFieldRow" style="gap:6px; align-items:center; flex-wrap:nowrap;">
        <div class="maInputWrap--clearable" style="flex:0 0 80px;">
          <input class="maTextInput nrHi" placeholder="HI"
            value="${esc(st.nrHi)}" autocomplete="off">
          <button class="maClearBtn nrHiClear ${st.nrHi ? "" : "isHidden"}"
            type="button" aria-label="Clear HI">×</button>
        </div>
        <select class="maTextInput nrGender" style="flex:0 0 58px; padding-right:4px;">
          <option value="M"${st.nrGender === "M" ? " selected" : ""}>M</option>
          <option value="F"${st.nrGender === "F" ? " selected" : ""}>F</option>
        </select>
        ${isEditMode
          ? `<button class="btn btn--confirm nrUpdate" type="button">Update Player</button>
             <button class="btn btn--danger  nrCancel" type="button">Cancel</button>`
          : `<button class="btn btnSecondary nrAdd"    type="button">Find Tee Sets</button>`
        }
      </div>`;

    // ── Wire fields ───────────────────────────────────────────────────────

    const firstInp  = controlsEl.querySelector(".nrFirst");
    const lastInp   = controlsEl.querySelector(".nrLast");
    const hiInp     = controlsEl.querySelector(".nrHi");
    const genderSel = controlsEl.querySelector(".nrGender");
    const firstClr  = controlsEl.querySelector(".nrFirstClear");
    const lastClr   = controlsEl.querySelector(".nrLastClear");
    const hiClr     = controlsEl.querySelector(".nrHiClear");

    if (firstInp) {
      firstInp.addEventListener("input", () => {
        st.nrFirst = safe(firstInp.value);
        if (firstClr) firstClr.classList.toggle("isHidden", !st.nrFirst);
      });
    }
    if (firstClr) {
      firstClr.addEventListener("click", () => {
        st.nrFirst = "";
        if (firstInp) { firstInp.value = ""; firstInp.focus(); }
        firstClr.classList.add("isHidden");
      });
    }

    if (lastInp) {
      lastInp.addEventListener("input", () => {
        st.nrLast = safe(lastInp.value);
        if (lastClr) lastClr.classList.toggle("isHidden", !st.nrLast);
      });
    }
    if (lastClr) {
      lastClr.addEventListener("click", () => {
        st.nrLast = "";
        if (lastInp) { lastInp.value = ""; lastInp.focus(); }
        lastClr.classList.add("isHidden");
      });
    }

    if (hiInp) {
      hiInp.addEventListener("input", () => {
        st.nrHi = safe(hiInp.value);
        if (hiClr) hiClr.classList.toggle("isHidden", !st.nrHi);
      });
    }
    if (hiClr) {
      hiClr.addEventListener("click", () => {
        st.nrHi = "";
        if (hiInp) { hiInp.value = ""; hiInp.focus(); }
        hiClr.classList.add("isHidden");
      });
    }

    if (genderSel) {
      genderSel.addEventListener("change", () => {
        st.nrGender = safe(genderSel.value) || "M";
      });
    }

    // ── Wire action buttons ───────────────────────────────────────────────

    if (!isEditMode) {
      const btnAdd = controlsEl.querySelector(".nrAdd");
      if (btnAdd) {
        btnAdd.addEventListener("click", () => _doAdd(st, controlsEl));
      }
    } else {
      const btnUpdate = controlsEl.querySelector(".nrUpdate");
      const btnCancel = controlsEl.querySelector(".nrCancel");
      if (btnUpdate) {
        btnUpdate.addEventListener("click", () => _doUpdate(st, controlsEl));
      }
      if (btnCancel) {
        btnCancel.addEventListener("click", () => _doCancel(st, controlsEl));
      }
    }
  }

  // ── Render: body (NH- player list) ─────────────────────────────────────────

  function _renderBody(st) {
    const bodyEl = st.bodyEl;
    if (!bodyEl) return;

    const nhPlayers = _getNHPlayers(st);

    if (!nhPlayers.length) {
      bodyEl.innerHTML = `<div class="maEmptyState">
        Enter name, handicap index, and gender above.<br>
        Non-rated players are assigned an NH- number.
      </div>`;
      return;
    }

    const hint = `<div class="maInlineStatus">Tap a player to edit their attributes</div>`;

    const rows = nhPlayers.map(p => {
      const ghin      = safe(p.dbPlayers_PlayerGHIN);
      const name      = safe(p.dbPlayers_Name);
      const hi        = safe(p.dbPlayers_HI    || "");
      const gender    = safe(p.dbPlayers_Gender || "");
      const isActive  = st.selectedGHIN === ghin;
      const subParts  = [hi && `HI ${hi}`, gender, ghin].filter(Boolean).join(" · ");

      return `<div class="maListRow ${isActive ? "maListRow--active" : ""} nrPlayerRow"
        data-ghin="${esc(ghin)}" style="cursor:pointer; flex-direction:column; align-items:flex-start;">
        <div style="font-size:13px; font-weight:700;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          width:100%;">${esc(name)}</div>
        <div class="maListRow__subline">${esc(subParts)}</div>
      </div>`;
    }).join("");

    bodyEl.innerHTML = `${hint}<div class="maListRows">${rows}</div>`;

    // Wire row clicks
    bodyEl.querySelectorAll(".nrPlayerRow").forEach(row => {
      row.addEventListener("click", () => {
        const ghin = row.getAttribute("data-ghin");
        if (!ghin) return;

        // Tap active row → deselect (exit edit mode)
        if (st.selectedGHIN === ghin) {
          st.selectedGHIN = null;
          _renderControls(st._controlsEl, st);
          _renderBody(st);
          return;
        }

        // Select row → load into form
        st.selectedGHIN = ghin;
        const p = (st.existingPlayers || []).find(x =>
          safe(x.dbPlayers_PlayerGHIN) === ghin
        );

        if (p) {
          const fullName  = safe(p.dbPlayers_Name).trim();
          const nameParts = fullName.split(/\s+/);
          const last      = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
          const first     = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : fullName;
          st.nrFirst  = first;
          st.nrLast   = last;
          st.nrHi     = safe(p.dbPlayers_HI     || "");
          st.nrGender = safe(p.dbPlayers_Gender  || "M");
        }

        _renderControls(st._controlsEl, st);
        _renderBody(st);
      });
    });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function _doAdd(st, controlsEl) {
    const first  = safe(st.nrFirst).trim();
    const last   = safe(st.nrLast).trim();
    const hi     = safe(st.nrHi).trim();
    const gender = safe(st.nrGender) || "M";

    if (!first || !last) {
      MA.setStatus("Enter non-rated player first and last name.", "warn");
      return;
    }

    if (typeof st.onAdd === "function") {
      st.onAdd({ first_name: first, last_name: last, gender, hi });
    }
    // Host page calls clearForm() after successful enrollment
  }

  function _doUpdate(st, controlsEl) {
    const ghin   = st.selectedGHIN;
    if (!ghin) return;

    const first  = safe(st.nrFirst).trim();
    const last   = safe(st.nrLast).trim();
    const hi     = safe(st.nrHi).trim();
    const gender = safe(st.nrGender) || "M";

    if (!first || !last) {
      MA.setStatus("Enter non-rated player first and last name.", "warn");
      return;
    }

    const existing = (st.existingPlayers || []).find(p =>
      safe(p.dbPlayers_PlayerGHIN) === ghin
    );
    const existingTee = existing
      ? { teeSetID: safe(existing.dbPlayers_TeeSetID || ""),
          value:    safe(existing.dbPlayers_TeeSetID || "") }
      : null;

    const player = {
      ghin,
      first_name: first,
      last_name:  last,
      name:       `${first} ${last}`.trim(),
      gender,
      hi,
      club_name:  "",
      email:      "",
      mobile:     "",
      recentTeeSetId: "",
      source:     "nonrated",
    };

    if (typeof st.onUpdate === "function") {
      st.onUpdate(player, existingTee);
    }
    // Host page calls clearSelection() after successful update
  }

  function _doCancel(st, controlsEl) {
    st.selectedGHIN = null;
    _clearFormFields(st, controlsEl);
    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  // ── Field helpers ───────────────────────────────────────────────────────────

  function _clearFormFields(st, controlsEl) {
    st.nrFirst  = "";
    st.nrLast   = "";
    st.nrHi     = "";
    st.nrGender = "M";
    // Re-render controls to reflect cleared state
    _renderControls(controlsEl, st);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * mount() — safe to call on every parent render cycle.
   * First call: builds form and NH- list.
   * Subsequent calls: refreshes existingPlayers and re-renders body
   * (checkmarks / active row) without resetting form field values.
   */
  function mount(cfg) {
    const controlsEl = cfg.controlsEl;
    const bodyEl     = cfg.bodyEl;
    if (!controlsEl || !bodyEl) return;

    // ── Already initialized? ─────────────────────────────────────────────
    if (_states.has(controlsEl)) {
      const st = _states.get(controlsEl);

      // Refresh live refs
      st.existingPlayers = cfg.existingPlayers || st.existingPlayers;
      st.onAdd           = cfg.onAdd           || st.onAdd;
      st.onUpdate        = cfg.onUpdate        || st.onUpdate;
      st.bodyEl          = bodyEl;

      // Re-render body — NH- list may have changed after enrollment
      _renderBody(st);
      return;
    }

    // ── First mount ──────────────────────────────────────────────────────
    const st  = _initState(controlsEl, cfg);
    st.bodyEl = bodyEl;

    _renderControls(controlsEl, st);
    _renderBody(st);
  }

  /**
   * clearForm(controlsEl) — resets all form fields and exits edit mode.
   * Called by host page after a successful onAdd() enrollment.
   */
  function clearForm(controlsEl) {
    const st = _states.get(controlsEl);
    if (!st) return;
    st.selectedGHIN = null;
    _clearFormFields(st, controlsEl);
    _renderBody(st);
  }

  /**
   * clearSelection(controlsEl) — exits edit mode without clearing fields.
   * Called by host page after a successful onUpdate() save,
   * or when the user switches tabs.
   */
  function clearSelection(controlsEl) {
    const st = _states.get(controlsEl);
    if (!st) return;
    if (!st.selectedGHIN) return;
    _doCancel(st, controlsEl);
  }


  // ── Register public API ─────────────────────────────────────────────────────
  MA.nonRatedSource.mount          = mount;
  MA.nonRatedSource.clearForm      = clearForm;
  MA.nonRatedSource.clearSelection = clearSelection;

})();
