/* /assets/modules/module_defineHandicapSettings.js
 *
 * MA.defineHandicapSettings — Define Handicaps module.
 * Shared by Event Roster and Game/Round Roster, following the exact
 * dual-usage pattern already established by module_defineFlights.js:
 * showModeToggle:true renders the "Apply to all rounds?" yes/no toggle
 * (is-active-accent blue) on Event Roster; omitted entirely on
 * Game/Round Roster, where a flat game or unlocked round edits its own
 * rules independently.
 *
 * Unlike Teams/Flights, there is no per-player roster in this modal —
 * Method/Allowance/Effectivity/Date are rules, not per-player
 * assignments, so there's nothing to list or group. No expand/collapse
 * chevron either (Teams' rationale applies here too: a small, fixed
 * field set, not a variable-length list like Flights).
 *
 * Method chips render in the standard tan .is-selected — unlike Flights'
 * chip, there's no nearby tan control in this modal to compete with
 * (the Yes/No toggle here is deliberately blue, not tan, since it's a
 * consequential decision — see module_defineFlights.js's identical
 * reasoning), so no green accent variant is needed here.
 *
 * Public API:
 *   MA.defineHandicapSettings.open(options)
 *   MA.defineHandicapSettings.close()
 *
 * Options:
 *   {
 *     method         : string       — "CH"|"SO", current dbGames_HCMethod / dbEvents_HCMethod
 *     allowance      : number       — 0-100 in steps of 5, current dbGames_Allowance / dbEvents_Allowance
 *     effectivity    : string       — "PlayDate"|"Low3"|"Low6"|"Low12"|"Date"
 *     effDate        : string       — "YYYY-MM-DD", only meaningful when effectivity is "Date"
 *     mode           : string       — current dbEvents_HandicapMode ("fixed"|"none"). Only
 *                                      meaningful when showModeToggle is true.
 *     showModeToggle : bool         — true only for the Event Roster usage. Renders the
 *                                      "Apply to all rounds?" yes/no toggle. Omit (or false)
 *                                      for the round/flat-game usage.
 *     apiBase        : string       — "/api/event_roster" or "/api/game_players"
 *     saveEndpoint   : string       — "saveEventHandicapSettings.php" or
 *                                      "saveGameHandicapSettings.php". Explicit, not inferred
 *                                      from showModeToggle — the two are semantically distinct
 *                                      (whether the toggle shows vs. which file to call), and
 *                                      the two endpoints are deliberately named differently to
 *                                      avoid the same-filename-in-two-folders confusion Teams/
 *                                      Flights have.
 *     onApply        : function({ method, allowance, effectivity, effDate, mode })
 *   }
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.defineHandicapSettings = MA.defineHandicapSettings || {};

  // ── Constants ────────────────────────────────────────────────────────────────
  const OVERLAY_ID = "maDefineHandicapSettingsOverlay";

  const EFFECTIVITY_OPTIONS = [
    { value: "PlayDate", label: "Play Date" },
    { value: "Low3",     label: "3-Month Low" },
    { value: "Low6",     label: "6-Month Low" },
    { value: "Low12",    label: "12-Month Low" },
    { value: "Date",     label: "Choose Date" },
  ];

  // ── Module state ─────────────────────────────────────────────────────────────
  let _opts        = {};
  let _method       = "CH";
  let _allowance    = 100;
  let _effectivity  = "PlayDate";
  let _effDate      = "";
  let _mode         = "none"; // "fixed" | "none" — see showModeToggle in options
  let _busy         = false;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safe(v) { return String(v ?? "").trim(); }

  function allowanceOptions() {
    const out = [];
    for (let i = 100; i >= 0; i -= 5) out.push(i);
    return out;
  }

  function apiPath(endpoint) {
    return safe(_opts.apiBase || "/api/event_roster").replace(/\/$/, "") + "/" + endpoint;
  }

  // ── Overlay ──────────────────────────────────────────────────────────────────

  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) MA.defineHandicapSettings.close(); });
      document.body.appendChild(el);
    }
    return el;
  }

  function _setScrollLock(on) {
    document.documentElement.classList.toggle("maOverlayOpen", !!on);
  }

  function _getModal() {
    return document.querySelector(`#${OVERLAY_ID} .maModal`);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  MA.defineHandicapSettings.open = function (options) {
    _opts       = options || {};
    _method      = (_opts.method === "SO") ? "SO" : "CH";
    _allowance   = Number.isFinite(+_opts.allowance) ? +_opts.allowance : 100;
    _effectivity = EFFECTIVITY_OPTIONS.some(o => o.value === _opts.effectivity) ? _opts.effectivity : "PlayDate";
    _effDate     = safe(_opts.effDate);
    _mode        = (_opts.mode === "fixed") ? "fixed" : "none";
    _busy        = false;

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal();
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _setScrollLock(true);
    _wireEvents();
  };

  MA.defineHandicapSettings.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _setScrollLock(false);
    _busy = false;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  function _renderModal() {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-label="Define Handicaps">
        ${_renderHeader()}
        <div class="maModal__body">
          ${_renderApplyToggle()}
          <div style="${_opts.showModeToggle ? "border-top:1px solid var(--border); margin-top:12px; padding-top:12px;" : ""}">
            ${_renderMethodField()}
            ${_renderAllowanceField()}
            ${_renderEffectivityField()}
          </div>
        </div>
        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="dhBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="dhBtnApply">Apply</button>
        </footer>
      </section>`;
  }

  function _renderHeader() {
    return `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Define Handicaps</div>
        </div>
        <button type="button" class="iconBtn btnPrimary" id="dhBtnClose" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>`;
  }

  // "Apply to all rounds?" — Event Roster usage only. Same yes/no reframe,
  // same is-active-accent blue, same hint pattern as module_defineFlights.js.
  function _renderApplyToggle() {
    if (!_opts.showModeToggle) return "";
    const yesActive = (_mode === "fixed");
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col" style="flex:0 0 auto; white-space:nowrap;">Apply to all rounds?</span>
          <div class="maSeg" id="dhModeToggle" style="width:auto; flex:0 0 auto;" role="group" aria-label="Apply this handicap configuration to all rounds">
            <button type="button" class="maSegBtn${yesActive ? " is-active-accent" : ""}"
                    data-mode="fixed" aria-pressed="${yesActive}">Yes</button>
            <button type="button" class="maSegBtn${!yesActive ? " is-active-accent" : ""}"
                    data-mode="none" aria-pressed="${!yesActive}">No</button>
          </div>
        </div>
        <div class="maHintText" id="dhModeHint">${esc(_applyHintText())}</div>
      </div>`;
  }

  function _applyHintText() {
    return (_mode === "fixed")
      ? "This handicap configuration will apply to every round in this event."
      : "Each round can set its own handicap rules. Changing this does not refresh existing handicaps.";
  }

  function _renderMethodField() {
    return `
      <div style="margin-top:12px;">
        <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:6px;">Method</div>
        <div class="maChoiceChips" id="dhMethodChips" role="group" aria-label="Handicap method">
          <button type="button" class="maChoiceChip${_method === "CH" ? " is-selected" : ""}"
                  style="flex:1; text-align:center;" data-method="CH" aria-pressed="${_method === "CH"}">CH with Allowance</button>
          <button type="button" class="maChoiceChip${_method === "SO" ? " is-selected" : ""}"
                  style="flex:1; text-align:center;" data-method="SO" aria-pressed="${_method === "SO"}">Shots-Off</button>
        </div>
      </div>`;
  }

  function _renderAllowanceField() {
    const opts = allowanceOptions()
      .map(v => `<option value="${v}" ${v === _allowance ? "selected" : ""}>${v}%</option>`)
      .join("");
    return `
      <div style="margin-top:12px;">
        <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:6px;">Allowance</div>
        <select class="maTextInput" id="dhAllowanceSelect" style="width:100%; height:34px; font-size:13px !important;" aria-label="Allowance">
          ${opts}
        </select>
      </div>`;
  }

  function _renderEffectivityField() {
    const opts = EFFECTIVITY_OPTIONS
      .map(o => `<option value="${o.value}" ${o.value === _effectivity ? "selected" : ""}>${esc(o.label)}</option>`)
      .join("");
    return `
      <div style="margin-top:12px;">
        <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:6px;">Handicap effective as of</div>
        <select class="maTextInput" id="dhEffectivitySelect" style="width:100%; height:34px; font-size:13px !important;" aria-label="Handicap effective as of">
          ${opts}
        </select>
      </div>
      <div id="dhEffDateWrap" style="margin-top:12px; display:${_effectivity === "Date" ? "block" : "none"};">
        <div style="font-size:11px; font-weight:700; color:var(--mutedText); margin-bottom:6px;">Date</div>
        <input type="date" class="maTextInput" id="dhEffDateInput" value="${esc(_effDate)}"
               style="width:100%; height:34px; font-size:13px !important; padding:0 8px;" aria-label="Handicap effective date">
      </div>`;
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#dhBtnClose")?.addEventListener("click", () => { if (!_busy) MA.defineHandicapSettings.close(); });
    overlay.querySelector("#dhBtnCancel")?.addEventListener("click", () => { if (!_busy) MA.defineHandicapSettings.close(); });

    overlay.querySelector("#dhModeToggle")?.addEventListener("click", e => {
      const seg = e.target.closest("[data-mode]");
      if (!seg) return;
      _mode = seg.dataset.mode;
      _refreshModeToggle();
    });

    overlay.querySelector("#dhMethodChips")?.addEventListener("click", e => {
      const chip = e.target.closest("[data-method]");
      if (!chip) return;
      _method = chip.dataset.method;
      overlay.querySelectorAll("#dhMethodChips [data-method]").forEach(b => {
        const on = (b.dataset.method === _method);
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
      });
    });

    overlay.querySelector("#dhAllowanceSelect")?.addEventListener("change", e => {
      _allowance = parseInt(e.target.value, 10) || 0;
    });

    overlay.querySelector("#dhEffectivitySelect")?.addEventListener("change", e => {
      _effectivity = e.target.value;
      const wrap = overlay.querySelector("#dhEffDateWrap");
      if (wrap) wrap.style.display = (_effectivity === "Date") ? "block" : "none";
    });

    overlay.querySelector("#dhEffDateInput")?.addEventListener("change", e => {
      _effDate = safe(e.target.value);
    });

    overlay.querySelector("#dhBtnApply")?.addEventListener("click", _applyChanges);
  }

  function _refreshModeToggle() {
    const wrap = document.getElementById("dhModeToggle");
    if (!wrap) return;
    wrap.querySelectorAll("[data-mode]").forEach(seg => {
      const on = (seg.dataset.mode === _mode);
      seg.classList.toggle("is-active-accent", on);
      seg.setAttribute("aria-pressed", String(on));
    });
    const hint = document.getElementById("dhModeHint");
    if (hint) hint.textContent = _applyHintText();
  }

  // ── API calls ────────────────────────────────────────────────────────────────

  async function _applyChanges() {
    if (_busy) return;
    _busy = true; _showBusy("Saving handicap settings — please wait...");
    try {
      const body = {
        method: _method,
        allowance: _allowance,
        effectivity: _effectivity,
      };
      if (_effectivity === "Date") body.effDate = _effDate;
      if (_opts.showModeToggle) body.mode = _mode;

      const endpoint = _opts.saveEndpoint || "saveGameHandicapSettings.php";
      const res = await MA.postJson(apiPath(endpoint), body);
      if (!res?.ok) { MA.setStatus(res?.message || "Unable to save handicap settings.", "danger"); return; }

      const cfg = res.payload?.handicapConfig || {};
      _method      = cfg.method      || _method;
      _allowance   = (cfg.allowance != null) ? cfg.allowance : _allowance;
      _effectivity = cfg.effectivity || _effectivity;
      _effDate     = cfg.effDate     || _effDate;
      if (_opts.showModeToggle) _mode = res.payload?.mode || _mode;

      MA.setStatus("Handicap settings saved.", "success");
      if (typeof _opts.onApply === "function") {
        _opts.onApply({
          method: _method,
          allowance: _allowance,
          effectivity: _effectivity,
          effDate: _effDate,
          mode: _mode,
        });
      }
      MA.defineHandicapSettings.close();
    } catch (e) {
      console.error("[MA.defineHandicapSettings]", e);
      MA.setStatus("Error saving handicap settings.", "danger");
    } finally { _busy = false; _hideBusy(); }
  }

  const BUSY_ID = "dhBusyOverlay";

  function _ensureBusyOverlay() {
    if (document.getElementById(BUSY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = BUSY_ID;
    overlay.className = "maModalOverlay";

    const modal = document.createElement("section");
    modal.className = "maModal";
    modal.innerHTML = `
      <header class="maModal__hdr">
        <div class="maModal__titles">
          <div class="maModal__title">Define Handicaps</div>
        </div>
      </header>
      <div class="maModal__body" id="dhBusyBody">
        <p id="dhBusyMessage" style="line-height:1.6;"></p>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function _showBusy(message) {
    _ensureBusyOverlay();
    const overlay = document.getElementById(BUSY_ID);
    const body    = document.getElementById("dhBusyBody");
    if (body) body.innerHTML = `<p style="line-height:1.6;">${message || "Processing — please wait..."}</p>`;
    if (overlay) overlay.classList.add("is-open");
  }

  function _hideBusy() {
    const overlay = document.getElementById(BUSY_ID);
    if (overlay) overlay.classList.remove("is-open");
  }

  window.MA = MA;

})();
