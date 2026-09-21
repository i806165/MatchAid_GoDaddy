/* /assets/modules/module_setGameSideBets.js
 *
 * MA.setGameSideBets — Side Bets configuration module.
 * Owns: dbGames_CustomScores (bet DEFINITIONS only — claims live per
 * player in db_Players.dbPlayers_CustomScores and are written by the
 * score entry side bets view, never by this module).
 *
 * ── Catalog-driven ──────────────────────────────────────────────────────
 * The list of bets, their order, grouping, default payouts and rule text
 * come from includes/sideBetsCatalog.php (hidden DOM, read at open time),
 * the same split as gameSettingsMenuRows.php / module_menuGameSettings.js.
 * Adding or editing a bet is a change to the include, not to this file.
 * This module owns behavior only: merge, edit, validate, save.
 *
 * ── Stored shape ────────────────────────────────────────────────────────
 * {
 *   "version": 1,
 *   "status": "active"|"disabled",          // master switch
 *   "bets": [
 *     { "key", "name", "description", "type": "achievement"|"competitive",
 *       "status": "active"|"disabled", "payout": { "unit": "points"|"dollars", "value": n } }
 *   ]
 * }
 * Every catalog bet is written on save, active or not — the array is never
 * added to or removed from by toggling, only `status` changes. Each record
 * is a self-describing snapshot so the scoring portal and back-end reports
 * never need the catalog.
 *
 * ── Master switch (top-level status) ────────────────────────────────────
 * "active" = side bets are in play for this game; anything else = off, and
 * downstream code ignores the bets. New games are primed "disabled" by
 * ServiceDbGames::applyDefaultsForAdd(). The switch changes ONLY this flag
 * and the visibility of the bet list — it never resets a bet's status,
 * payout or text, so a user can flip it off and on again and find their
 * selections intact. Save is always allowed; the one blocked state is
 * switch on with no bet active. While the switch is off, validation is
 * skipped and the bets are saved as-is.
 *
 * ── Display order ───────────────────────────────────────────────────────
 * Within each group, bets that are active when the modal opens are listed
 * first, then the rest; each half keeps catalog order. Sorted once at open
 * (rows do not jump while the user ticks them). Display order only — the
 * saved array stays in catalog order.
 *
 * ── Compact rows (phone height) ─────────────────────────────────────────
 * The whole bet row is the tap target: an active bet's row toggles its
 * editor (chevron shows the state); tapping an inactive bet's row acts like
 * its checkbox. Custom slots appear only when in use (active, named, or just
 * added); "+ Add custom bet" reveals the next free slot. All five slots are
 * still written on save. The game title and course sit in the modal header
 * subtitle, so the controls band holds only the switch.
 *
 * ── Merge rules (catalog + stored) ──────────────────────────────────────
 *   - Fixed template bets: name/description/type come from the catalog;
 *     status and payout come from the stored record (catalog defaults when
 *     there is none — new bets appear disabled).
 *   - Custom slots (data-custom="true"): name/description/type/status/
 *     payout all come from the stored record.
 *   - A stored bet whose key is no longer rendered (retired in the catalog,
 *     or removed from it) is preserved untouched on save. Never dropped.
 *   - data-retired="true" hides a bet unless the game already has it active.
 *
 * ── Module contract (same as every module in this family) ───────────────
 * Self-hydrating: open({ onDone }) takes no game data and fetches its own
 * context. onDone(wasSaved) fires on EVERY exit path. wasSaved is true only
 * after a confirmed save — an unchanged Save is a plain dismiss (false), so
 * the Game Settings menu does not reload the page for nothing.
 *
 * Public API:
 *   MA.setGameSideBets.open({ onDone })
 *   MA.setGameSideBets.close()
 *
 * ── Save endpoint ───────────────────────────────────────────────────────
 * POST /api/game_settings/saveGameSideBets.php
 *   { payload: { dbGames_GGID, dbGames_CustomScores: { version, status, bets } } }
 * Rejects a change of `type` on a bet that already has claims.
 *
 * ── Messages ────────────────────────────────────────────────────────────
 * Every problem (validation, save failure, load failure) is an OK-only
 * MA.ui.confirm dialog — see _showNotice(). The only inline text is the
 * state hint under the switch.
 *
 * ── Styling ─────────────────────────────────────────────────────────────
 * ma_shared.css classes only (maToggleRow / maToggle for the switch); no
 * injected stylesheet. Three small inline styles (editor card margin, row
 * text wrapper, payout value width) have no shared-class equivalent.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameSideBets = MA.setGameSideBets || {};

  const OVERLAY_ID       = "maSetGameSideBetsOverlay";
  const CATALOG_ID       = "sideBetsCatalog";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameSideBets.php";
  const SCHEMA_VERSION   = 1;

  // ── Helpers ──────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function numOr(v, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Module state ─────────────────────────────────────────────────────
  let _overlay   = null;
  let _ctx       = null; // fresh-fetched { ggid, game, roster, coursePars }
  let _state     = null; // { groups, rows, extras }
  let _baseline  = "";   // JSON of collect() at open — dirty check
  let _onDone    = null;
  let _onEsc     = null;
  let _busy      = false;
  let _lockDepth = 0;

  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  // One OK-only dialog for every problem this module reports. level "danger"
  // (save/load failures) turns the OK button red; "warn" (fix-it-yourself
  // validation) leaves it neutral. Messages are plain text — escaped here so
  // bet names and server text can never inject markup. _busy is held while it
  // is open so Escape / backdrop clicks can't also dismiss this modal.
  async function _showNotice(message, level) {
    if (typeof MA.ui?.confirm !== "function") { MA.setStatus?.(message, level); return; }
    const wasBusy = _busy;
    _busy = true;
    try {
      await MA.ui.confirm({
        title: "Side Bets",
        message: esc(message),
        confirmLabel: "OK",
        okOnly: true,
        danger: level === "danger",
      });
    } finally {
      _busy = wasBusy;
    }
  }

  const HINT_ON  = "In play for this game.";
  const HINT_OFF = "Off. Turn on to choose bets.";

  // ── Catalog + stored parsing ─────────────────────────────────────────
  function readCatalog() {
    const root = document.getElementById(CATALOG_ID);
    if (!root) return null;
    return Array.from(root.querySelectorAll("[data-group]")).map(g => ({
      id: g.getAttribute("data-group"),
      label: g.getAttribute("data-label") || "",
      bets: Array.from(g.querySelectorAll("[data-bet]")).map(b => ({
        key:     b.getAttribute("data-bet"),
        custom:  b.getAttribute("data-custom") === "true",
        retired: b.getAttribute("data-retired") === "true",
        label:   b.getAttribute("data-label") || "",
        desc:    b.getAttribute("data-desc") || "",
        type:    b.getAttribute("data-type") === "competitive" ? "competitive" : "achievement",
        unit:    b.getAttribute("data-unit") === "dollars" ? "dollars" : "points",
        value:   numOr(b.getAttribute("data-value"), 1),
      })),
    }));
  }

  function parseStored(raw) {
    let p = raw;
    if (typeof p === "string" && p.trim() !== "") { try { p = JSON.parse(p); } catch (e) { p = null; } }
    const bets = (p && Array.isArray(p.bets))
      ? p.bets.filter(b => b && typeof b.key === "string" && b.key)
      : [];
    const status = (p && p.status === "active") ? "active" : "disabled";
    return { status, bets };
  }

  function buildState(game) {
    const catalog = readCatalog();
    if (!catalog) return null;

    const stored   = parseStored(game.dbGames_CustomScores);
    const byKey    = new Map(stored.bets.map(b => [b.key, b]));
    const rendered = new Set();
    const rows     = [];

    const groups = catalog.map(g => {
      const activeKeys = [];
      const otherKeys  = [];
      g.bets.forEach(c => {
        const s      = byKey.get(c.key);
        const status = (s && s.status === "active") ? "active" : "disabled";
        if (c.retired && status !== "active") return; // hidden; stored record preserved via extras
        rendered.add(c.key);

        const pay  = (s && s.payout) || {};
        const unit = (pay.unit === "dollars" || pay.unit === "points") ? pay.unit : c.unit;
        const sType = s && (s.type === "competitive" || s.type === "achievement") ? s.type : c.type;

        rows.push({
          key: c.key,
          custom: c.custom,
          status,
          open: false,
          revealed: false,
          name: c.custom ? String(s?.name ?? "") : c.label,
          desc: c.custom ? String(s?.description ?? "") : c.desc,
          type: c.custom ? sType : c.type,
          unit,
          value: String(pay.value != null ? pay.value : c.value),
        });
        (status === "active" ? activeKeys : otherKeys).push(c.key);
      });
      // Active-at-open first; each half keeps catalog order. Display only —
      // rows[] (and so the saved array) stays in catalog order.
      return { id: g.id, label: g.label, keys: activeKeys.concat(otherKeys) };
    });

    const extras = stored.bets.filter(b => !rendered.has(b.key));
    return { status: stored.status, groups, rows, extras };
  }

  function rowOf(key) { return _state.rows.find(r => r.key === key); }

  function recordOf(r) {
    return {
      key: r.key,
      name: r.name.trim(),
      description: r.desc.trim(),
      type: r.type,
      status: r.status,
      payout: { unit: r.unit, value: Math.max(0, numOr(r.value, 0)) },
    };
  }

  function collect() {
    return {
      version: SCHEMA_VERSION,
      status: _state.status,
      bets: _state.rows.map(recordOf).concat(clone(_state.extras)),
    };
  }

  // Only checked while the switch is on — while it is off the bet list is
  // hidden, so a hidden draft must never block Save. The server relaxes the
  // same rules for a disabled game.
  function validate() {
    if (_state.status !== "active") return null;
    if (!_state.rows.some(r => r.status === "active")) {
      return { key: null, message: "Choose at least one side bet, or set Activate to No." };
    }
    for (const r of _state.rows) {
      if (r.status !== "active") continue;
      if (r.custom && !r.name.trim()) {
        return { key: r.key, message: "Give each custom bet a name before saving it as active." };
      }
      const v = parseFloat(r.value);
      if (!Number.isFinite(v) || v < 0) {
        return { key: r.key, message: `Enter a payout of 0 or more for ${r.name.trim() || "this bet"}.` };
      }
    }
    return null;
  }

  // ── Rendering (ma_shared.css classes only) ───────────────────────────
  function labelOf(r) {
    return r.name.trim() || (r.custom ? `Custom bet ${r.key.replace(/\D+/g, "")}` : r.key);
  }

  function payoutText(r) {
    const v = numOr(r.value, 0);
    const amt = r.unit === "dollars" ? `$${v}` : `${v} ${v === 1 ? "point" : "points"}`;
    return `${amt} ${r.type === "competitive" ? "per win" : "per claim"}`;
  }

  function sublineOf(r) {
    if (r.custom && !r.name.trim() && r.status !== "active") return "Not in use";
    return [r.desc.trim(), r.status === "active" ? payoutText(r) : ""].filter(Boolean).join(" · ");
  }

  function chipHtml(key, field, value, text, selected) {
    return `<button class="maChoiceChip ${selected ? "is-selected" : ""}" type="button"
              data-key="${esc(key)}" data-chip="${field}:${value}">${text}</button>`;
  }

  // Whole row is the tap target (data-tap on the text block, plus a row-level
  // click fallback in wireBody). Active row: tap opens/closes its editor.
  // Inactive row: tap behaves like the checkbox (turns it on and opens it).
  function rowHtml(r) {
    const on = r.status === "active";
    const chevron = on ? `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="${r.open ? "6 15 12 9 18 15" : "6 9 12 15 18 9"}"/>
        </svg>` : "";
    return `
      <div class="maListRow" data-row="${esc(r.key)}">
        <div class="maCheckbox ${on ? "is-checked" : ""}" data-check="${esc(r.key)}"
             role="checkbox" aria-checked="${on}" tabindex="0" aria-label="${esc(labelOf(r))}"></div>
        <div style="flex:1 1 auto; min-width:0; cursor:pointer;" data-tap="${esc(r.key)}"
             role="button" tabindex="0"${on ? ` aria-expanded="${r.open}"` : ""}>
          <div class="maListRow__col" data-role="label">${esc(labelOf(r))}</div>
          <div class="maListRow__subline" data-role="sub">${esc(sublineOf(r))}</div>
        </div>${chevron}
      </div>`;
  }

  // Custom slots: shown only when in use (active, named, or just added) so
  // five empty "Not in use" rows don't eat a phone's height. All five slots
  // are still saved; "+ Add custom bet" reveals the next free one.
  function isVisible(r) {
    return !r.custom || r.status === "active" || r.name.trim() !== "" || r.revealed;
  }

  function addRowHtml(groupId) {
    return `
      <div class="maListRow">
        <button class="btn btnLink" type="button" data-add="${esc(groupId)}">+ Add custom bet</button>
      </div>`;
  }

  function cardHtml(r) {
    const k = esc(r.key);
    const nameField = r.custom ? `
        <div class="maField">
          <input class="maTextInput" type="text" data-key="${k}" data-f="name" value="${esc(r.name)}" placeholder="Name (required)" aria-label="Bet name">
        </div>` : "";
    const descField = r.custom ? `
        <div class="maField">
          <input class="maTextInput" type="text" data-key="${k}" data-f="desc" value="${esc(r.desc)}" placeholder="Description" aria-label="Description">
        </div>` : "";
    const typeField = r.custom ? `
        <div class="maField">
          <div class="maChoiceChips" role="group" aria-label="Bet type">
            ${chipHtml(r.key, "type", "achievement", "Achievement", r.type === "achievement")}
            ${chipHtml(r.key, "type", "competitive", "Competitive", r.type === "competitive")}
          </div>
        </div>` : "";
    const payField = `
        <div class="maField" style="flex:0 0 auto;">
          <div class="maConfigRow">
            <div class="maChoiceChips" style="flex:0 0 auto; flex-wrap:nowrap;" role="group" aria-label="Payout unit">
              ${chipHtml(r.key, "unit", "points", "Points", r.unit === "points")}
              ${chipHtml(r.key, "unit", "dollars", "Dollars", r.unit === "dollars")}
            </div>
            <input class="maTextInput" style="flex:0 0 64px; width:64px; padding:0 8px; text-align:right;"
                   type="number" min="0" step="0.5" data-key="${k}" data-f="value" value="${esc(r.value)}" aria-label="Payout value">
          </div>
        </div>`;
    return `
      <div class="maCard" style="margin:0 14px 8px;" data-card="${k}">
        <div class="maCard__body">
          <div class="maFieldRow" style="margin-top:0;">
            ${nameField}${descField}${typeField}${payField}
          </div>
        </div>
      </div>`;
  }

  function renderBody() {
    const body = document.getElementById("sgsbBody");
    if (!body || !_state) return;
    const scroll = body.scrollTop;
    body.innerHTML = _state.groups.map(g => {
      const all    = g.keys.map(rowOf);
      const shown  = all.filter(isVisible);
      const hasFreeSlot = all.some(r => r.custom && !isVisible(r));
      const rows = shown.map(r =>
        rowHtml(r) + (r.status === "active" && r.open ? cardHtml(r) : "")
      ).join("") + (hasFreeSlot ? addRowHtml(g.id) : "");
      return rows ? `<div class="actionMenu_category">${esc(g.label.toUpperCase())}</div>${rows}` : "";
    }).join("");
    body.scrollTop = scroll;
  }

  function updateRowText(key) {
    const r = rowOf(key);
    const row = document.querySelector(`#sgsbBody [data-row="${CSS.escape(key)}"]`);
    if (!r || !row) return;
    const lab = row.querySelector('[data-role="label"]');
    const sub = row.querySelector('[data-role="sub"]');
    if (lab) lab.textContent = labelOf(r);
    if (sub) sub.textContent = sublineOf(r);
  }

  function _renderControls() {
    const el = document.getElementById("sgsbControls");
    if (!el || !_ctx) return;
    const on = _state.status === "active";
    // Game title/course live in the modal header, so the band is just the
    // switch: label + state hint on the left (same two-line shape as a list
    // row), Yes/No on the right.
    el.innerHTML = `
      <div class="maToggleRow">
        <div style="flex:1 1 auto; min-width:0;">
          <div class="maListRow__col">Activate</div>
          <div class="maListRow__subline" id="sgsbHint">${esc(on ? HINT_ON : HINT_OFF)}</div>
        </div>
        <div class="maToggle" id="sgsbToggle" role="group" aria-label="Activate side bets for this game">
          <button type="button" class="maToggle__btn${on ? " is-active" : ""}" data-status="active" aria-pressed="${on}">Yes</button>
          <button type="button" class="maToggle__btn${!on ? " is-active" : ""}" data-status="disabled" aria-pressed="${!on}">No</button>
        </div>
      </div>`;
  }

  // Header subtitle: which game this is (title · course).
  function _subtitleText() {
    const g = _ctx?.game || {};
    const title = String(g.dbGames_Title || (_ctx?.ggid ? `GGID ${_ctx.ggid}` : "")).trim();
    return [title, g.dbGames_CourseName].filter(Boolean).join(" · ") || "Choose which side bets are in play.";
  }

  // Master switch: visibility only. Never touches a bet's status/payout/text,
  // so flipping off and on again keeps the user's selections.
  function _applyStatusUi() {
    const on = _state.status === "active";
    document.querySelectorAll("#sgsbToggle [data-status]").forEach(btn => {
      const sel = (btn.getAttribute("data-status") === "active") === on;
      btn.classList.toggle("is-active", sel);
      btn.setAttribute("aria-pressed", String(sel));
    });
    const hint = document.getElementById("sgsbHint");
    if (hint) hint.textContent = on ? HINT_ON : HINT_OFF;
    const body = document.getElementById("sgsbBody");
    if (body) body.style.display = on ? "" : "none";
  }

  function setStatus(value) {
    if (!_state || (value !== "active" && value !== "disabled") || _state.status === value) return;
    _state.status = value;
    _applyStatusUi();
  }

  // ── Interaction ──────────────────────────────────────────────────────
  function toggleStatus(key) {
    const r = rowOf(key);
    if (!r) return;
    r.status = r.status === "active" ? "disabled" : "active";
    // An unused custom slot the user just added and un-ticked goes back to hidden.
    if (r.custom && r.status !== "active" && !r.name.trim()) r.revealed = false;
    _state.rows.forEach(x => { x.open = false; });
    r.open = r.status === "active";
    renderBody();
  }

  // Row tap: editor on/off for an active bet; same as the checkbox otherwise.
  function tapRow(key) {
    const r = rowOf(key);
    if (!r) return;
    if (r.status === "active") toggleOpen(key); else toggleStatus(key);
  }

  // "+ Add custom bet": reveal the next free custom slot, on and open, at the
  // bottom of its group, so the user lands on its name field.
  function addCustom(groupId) {
    const g = _state.groups.find(x => x.id === groupId);
    if (!g) return;
    const free = g.keys.map(rowOf).find(r => r.custom && !isVisible(r));
    if (!free) return;
    free.revealed = true;
    free.status = "active";
    g.keys = g.keys.filter(k => k !== free.key).concat(free.key);
    _state.rows.forEach(x => { x.open = false; });
    free.open = true;
    renderBody();
  }

  function toggleOpen(key) {
    const r = rowOf(key);
    if (!r) return;
    const wasOpen = r.open;
    _state.rows.forEach(x => { x.open = false; });
    r.open = !wasOpen;
    renderBody();
  }

  function setChip(key, spec) {
    const r = rowOf(key);
    const [field, value] = String(spec).split(":");
    if (!r) return;
    if (field === "unit" && (value === "points" || value === "dollars")) r.unit = value;
    else if (field === "type" && r.custom && (value === "achievement" || value === "competitive")) r.type = value;
    else return;
    renderBody();
  }

  function wireControls(controls) {
    controls.addEventListener("click", e => {
      const btn = e.target.closest("[data-status]");
      if (btn) setStatus(btn.getAttribute("data-status"));
    });
  }

  function wireBody(body) {
    body.addEventListener("click", e => {
      const chk = e.target.closest("[data-check]");
      if (chk) { toggleStatus(chk.getAttribute("data-check")); return; }
      const add = e.target.closest("[data-add]");
      if (add) { addCustom(add.getAttribute("data-add")); return; }
      const chip = e.target.closest("[data-chip]");
      if (chip) { setChip(chip.getAttribute("data-key"), chip.getAttribute("data-chip")); return; }
      // Anywhere else on a bet row (text, chevron, padding) is the row tap.
      const row = e.target.closest("[data-row]");
      if (row) tapRow(row.getAttribute("data-row"));
    });
    body.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chk = e.target.closest("[data-check]");
      if (chk) { e.preventDefault(); toggleStatus(chk.getAttribute("data-check")); return; }
      const tap = e.target.closest("[data-tap]");
      if (tap) { e.preventDefault(); tapRow(tap.getAttribute("data-tap")); }
    });
    body.addEventListener("input", e => {
      const f = e.target.closest("[data-f]");
      if (!f) return;
      const r = rowOf(f.getAttribute("data-key"));
      if (!r) return;
      r[f.getAttribute("data-f")] = f.value; // name | desc | value
      updateRowText(r.key);
    });
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  function buildOverlay(isEvent) {
    const overlay = document.createElement("div");
    overlay.id        = OVERLAY_ID;
    overlay.className = "maModalOverlay is-open";

    overlay.innerHTML = `
      <div class="maModal" role="dialog" aria-modal="true" aria-label="Side Bets">

        <div class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div>
            <div class="maModal__title">Side Bets</div>
            <div class="maModal__subtitle">${esc(_subtitleText())}</div>
          </div>
          <button id="sgsbBtnClose" class="iconBtn btnSecondary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="maModal__controls" id="sgsbControls"></div>

        <div class="maModal__body maModal__body--flush" id="sgsbBody"></div>

        <div class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button id="sgsbBtnCancel" class="maFtrBtn maFtrBtn--cancel" type="button">Cancel</button>
            <button id="sgsbBtnApply"  class="maFtrBtn maFtrBtn--save"   type="button">Save</button>
          </div>
        </div>

      </div>`;

    overlay.querySelector("#sgsbBtnClose")?.addEventListener("click",  () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgsbBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgsbBtnApply")?.addEventListener("click",  doApply);
    overlay.addEventListener("click", e => { if (e.target === overlay && !_busy) _dismiss(); });
    wireControls(overlay.querySelector("#sgsbControls"));
    wireBody(overlay.querySelector("#sgsbBody"));

    return overlay;
  }

  function _dismiss(wasSaved) {
    if (_busy) return;
    MA.setGameSideBets.close();
    if (typeof _onDone === "function") _onDone(wasSaved === true);
  }

  // ── Save ─────────────────────────────────────────────────────────────
  async function doApply() {
    if (_busy || !_state) return;

    const problem = validate();
    if (problem) {
      // Open the offending bet's editor so the user lands on the field to fix.
      const r = problem.key ? rowOf(problem.key) : null;
      if (r) {
        _state.rows.forEach(x => { x.open = false; });
        r.open = true;
        renderBody();
      }
      await _showNotice(problem.message, "warn");
      return;
    }

    const result = collect();
    if (JSON.stringify(result) === _baseline) { _dismiss(false); return; } // nothing changed

    _busy = true;
    MA.ui?.showBusy?.({ title: "Side Bets", message: "Saving — please wait..." });
    let saved = false;
    let failure = "";
    try {
      const payload = { dbGames_GGID: _ctx.ggid, dbGames_CustomScores: result };
      const res = await MA.postJson(SAVE_ENDPOINT, { payload });
      if (!res?.ok) failure = res?.message || "Unable to save Side Bets.";
      else saved = true;
    } catch (e) {
      console.error("[MA.setGameSideBets]", e);
      failure = "Error saving Side Bets.";
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
    // Shown only after the busy overlay is gone, so the dialog is never stacked under it.
    if (failure) { await _showNotice(failure, "danger"); return; }
    if (saved) _dismiss(true);
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setGameSideBets.open = async function (options) {
    if (_overlay) MA.setGameSideBets.close();
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Side Bets", message: "Loading..." });
    let ctx;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINT, {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load game context.");
      ctx = res.payload;
    } catch (e) {
      MA.ui?.hideBusy?.();
      console.error("[MA.setGameSideBets]", e);
      await _showNotice("Side Bets couldn't load this game's settings. Please try again.", "danger");
      if (typeof _onDone === "function") _onDone(false); // menu still needs to reopen
      return;
    }
    MA.ui?.hideBusy?.();

    const state = buildState(ctx.game);
    if (!state) {
      await _showNotice("Side bets catalog not available on this page (includes/sideBetsCatalog.php).", "danger");
      if (typeof _onDone === "function") _onDone(false);
      return;
    }

    _ctx   = ctx;
    _state = state;
    _baseline = JSON.stringify(collect());

    _overlay = buildOverlay(!!ctx.game.dbGames_EID);
    document.body.appendChild(_overlay);
    _lockScroll(true);

    _renderControls();
    renderBody();
    _applyStatusUi(); // collapses the bet list when the game opens with side bets off

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGameSideBets.close = function () {
    if (_overlay) { _overlay.remove(); _overlay = null; _lockScroll(false); }
    _ctx = null;
    _state = null;
    _baseline = "";
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

})();
