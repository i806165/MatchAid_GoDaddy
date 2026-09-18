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
 * POST /api/game_settings/saveGameSideBets.php   (TODO — does not exist yet)
 *   { payload: { dbGames_GGID, dbGames_CustomScores: { version, bets } } }
 * Must reject a change of `type` on a bet that already has claims.
 *
 * ── Styling ─────────────────────────────────────────────────────────────
 * ma_shared.css classes only; no injected stylesheet. Three small inline
 * styles (editor card margin, row text wrapper, payout value width) have no
 * shared-class equivalent.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameSideBets = MA.setGameSideBets || {};

  const OVERLAY_ID       = "maSetGameSideBetsOverlay";
  const NOTICE_ID        = "sgsbNotice";
  const CATALOG_ID       = "sideBetsCatalog";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameSideBets.php"; // TODO — does not exist yet
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

  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

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
    return { bets };
  }

  function buildState(game) {
    const catalog = readCatalog();
    if (!catalog) return null;

    const stored   = parseStored(game.dbGames_CustomScores);
    const byKey    = new Map(stored.bets.map(b => [b.key, b]));
    const rendered = new Set();
    const rows     = [];

    const groups = catalog.map(g => {
      const keys = [];
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
          name: c.custom ? String(s?.name ?? "") : c.label,
          desc: c.custom ? String(s?.description ?? "") : c.desc,
          type: c.custom ? sType : c.type,
          unit,
          value: String(pay.value != null ? pay.value : c.value),
        });
        keys.push(c.key);
      });
      return { id: g.id, label: g.label, keys };
    });

    const extras = stored.bets.filter(b => !rendered.has(b.key));
    return { groups, rows, extras };
  }

  function rowOf(key) { return _state.rows.find(r => r.key === key); }

  function recordOf(r) {
    return {
      key: r.key,
      name: r.name.trim(),
      description: r.desc.trim(),
      type: r.type,
      status: r.status,
      payout: { unit: r.unit, value: numOr(r.value, 0) },
    };
  }

  function collect() {
    return {
      version: SCHEMA_VERSION,
      bets: _state.rows.map(recordOf).concat(clone(_state.extras)),
    };
  }

  function validate() {
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

  function rowHtml(r) {
    const on = r.status === "active";
    return `
      <div class="maListRow" data-row="${esc(r.key)}">
        <div class="maCheckbox ${on ? "is-checked" : ""}" data-check="${esc(r.key)}"
             role="checkbox" aria-checked="${on}" tabindex="0" aria-label="${esc(labelOf(r))}"></div>
        <div style="flex:1 1 auto; min-width:0;">
          <div class="maListRow__col" data-role="label">${esc(labelOf(r))}</div>
          <div class="maListRow__subline" data-role="sub">${esc(sublineOf(r))}</div>
        </div>
        ${on ? `<button class="btn btnLink" type="button" data-toggle="${esc(r.key)}">${r.open ? "Hide settings" : "Edit settings"}</button>` : ""}
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
      const rows = g.keys.map(k => {
        const r = rowOf(k);
        return rowHtml(r) + (r.status === "active" && r.open ? cardHtml(r) : "");
      }).join("");
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
    const g = _ctx.game;
    const gameTitle = String(g.dbGames_Title || `GGID ${_ctx.ggid || ""}`).trim();
    const line1 = [gameTitle, `GGID ${_ctx.ggid ?? ""}`].join(" · ");
    const line2 = [g.dbGames_CourseName, g.dbGames_PlayDate].filter(Boolean).join(" • ");
    const line3 = g.dbGames_EID
      ? [g.dbEvents_Title, `EID ${g.dbGames_EID}`].filter(Boolean).join(" · ")
      : "";
    el.innerHTML = `
      <div class="maListRow__col">${esc(line1)}</div>
      <div class="maListRow__subline">${esc(line2)}</div>
      ${line3 ? `<div class="maListRow__subline">${esc(line3)}</div>` : ""}`;
  }

  // ── Interaction ──────────────────────────────────────────────────────
  function toggleStatus(key) {
    const r = rowOf(key);
    if (!r) return;
    r.status = r.status === "active" ? "disabled" : "active";
    _state.rows.forEach(x => { x.open = false; });
    r.open = r.status === "active";
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

  function wireBody(body) {
    body.addEventListener("click", e => {
      const chk = e.target.closest("[data-check]");
      if (chk) { toggleStatus(chk.getAttribute("data-check")); return; }
      const tg = e.target.closest("[data-toggle]");
      if (tg) { toggleOpen(tg.getAttribute("data-toggle")); return; }
      const chip = e.target.closest("[data-chip]");
      if (chip) setChip(chip.getAttribute("data-key"), chip.getAttribute("data-chip"));
    });
    body.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chk = e.target.closest("[data-check]");
      if (chk) { e.preventDefault(); toggleStatus(chk.getAttribute("data-check")); }
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
            <div class="maModal__subtitle">Choose which side bets are in play, and what each is worth.</div>
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
        <div id="${NOTICE_ID}"></div>

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
      _state.rows.forEach(x => { x.open = false; });
      const r = rowOf(problem.key);
      if (r) r.open = true;
      renderBody();
      _showModalNotice(problem.message, "danger");
      return;
    }

    const result = collect();
    if (JSON.stringify(result) === _baseline) { _dismiss(false); return; } // nothing changed

    _busy = true;
    MA.ui?.showBusy?.({ title: "Side Bets", message: "Saving — please wait..." });
    let saved = false;
    try {
      const payload = { dbGames_GGID: _ctx.ggid, dbGames_CustomScores: result };
      const res = await MA.postJson(SAVE_ENDPOINT, { payload });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Side Bets.", "danger"); return; }
      saved = true;
    } catch (e) {
      console.error("[MA.setGameSideBets]", e);
      _showModalNotice("Error saving Side Bets.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
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
      MA.setStatus?.(e.message || "Failed to load game context.", "error");
      if (typeof _onDone === "function") _onDone(false); // menu still needs to reopen
      return;
    }
    MA.ui?.hideBusy?.();

    const state = buildState(ctx.game);
    if (!state) {
      MA.setStatus?.("Side bets catalog not available on this page (includes/sideBetsCatalog.php).", "error");
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
