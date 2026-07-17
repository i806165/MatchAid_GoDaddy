/* /assets/modules/module_setGameBlindPlayer.js
 *
 * MA.setGameBlindPlayer — Blind Player editor module.
 * Owns: dbGames_BlindPlayers.
 *
 * Zero injected CSS. All classes come from ma_shared.css — modal, seg
 * control, .maListRow + .maCheckbox--accent (blue checkbox, not the
 * default green .maCheckbox.is-checked — matches the same blue used for
 * Apply/Save via .maFtrBtn--save), action-menu category headers.
 *
 * Public API:
 *   MA.setGameBlindPlayer.open({ onDone })
 *   MA.setGameBlindPlayer.close()
 *
 * Self-hydrating: no game data passed in. GGID comes from session
 * server-side. Fetches its own complete context on open — host-agnostic.
 *
 * Built correctly from day one: onDone fires on every exit path (Apply,
 * Cancel, backdrop, Escape). MA.ui.showModalNotice()/hideModalNotice() for
 * in-modal errors, not MA.setStatus() (invisible behind an open modal).
 *
 * ── PairField only — mirror image of Segments' PairPair-only gate ───────
 * Blind Player has no meaning outside PairField (a PairPair match has two
 * full sides, no "field" to fill a group up to). Unlike Segments, where
 * Holes/Stroke Allocation still apply regardless of pairing, nothing in
 * this module applies to a PairPair game — so the whole body swaps to a
 * not-applicable message rather than hiding some sections and keeping
 * others live.
 *
 * ── Relocated verbatim from game_settings.js ─────────────────────────────
 * The dbGames_BlindPlayers array parse (load) and rebuild (save) shapes,
 * the roster-select population/sort logic, and the expand/collapse rules
 * (useBlind gates the whole config block; blindMode==="game" additionally
 * gates the player-select dropdown within it).
 *
 * ── Not yet resolved ─────────────────────────────────────────────────────
 * Save endpoint below (/api/game_settings/saveGameBlindPlayer.php) does
 * not exist yet — same open endpoint-architecture question as every other
 * new module.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.setGameBlindPlayer = MA.setGameBlindPlayer || {};

  const OVERLAY_ID = "maSetGameBlindPlayerOverlay";
  const NOTICE_ID  = "sgbNoticeSlot";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";
  const SAVE_ENDPOINT    = "/api/game_settings/saveGameBlindPlayer.php"; // TODO — does not exist yet

  const TARGET_OPTIONS = [2, 3, 4]; // fixed, hardcoded in the original view markup — not derived

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── Module state ─────────────────────────────────────────────────────
  let _ctx    = null;   // fresh-fetched { ggid, game, roster, coursePars }
  let _draft  = null;   // private working copy — only Blind Player's own fields
  let _onDone = null;
  let _onEsc  = null;
  let _busy   = false;

  // ── Relocated verbatim — parse dbGames_BlindPlayers: [{ghin,name}, {target}]
  function _draftFromGame(g) {
    const blindArr = (() => {
      let raw = g.dbGames_BlindPlayers;
      if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
      return Array.isArray(raw) ? raw : [];
    })();
    let blindGHIN = "", blindName = "", blindTarget = null;
    for (const item of blindArr) {
      if (!item || typeof item !== "object") continue;
      if (item.target !== undefined) { blindTarget = Number(item.target) || null; }
      else if (item.ghin)            { blindGHIN = String(item.ghin); blindName = String(item.name || ""); }
    }
    return {
      blindGHIN,
      blindName,
      blindTarget,
      blindMode: blindGHIN ? "game" : "group",
      useBlind:  blindTarget !== null,
    };
  }

  function _pairing() { return _ctx.game.dbGames_Competition || "PairField"; }

  // ── Selection ────────────────────────────────────────────────────────
  function _toggleBlind(on) {
    _draft.useBlind = on;
    if (!on) {
      _draft.blindMode   = "group";
      _draft.blindGHIN   = "";
      _draft.blindName   = "";
      _draft.blindTarget = null;
    }
  }

  function _selectBlindMode(mode) {
    _draft.blindMode = mode;
    if (mode === "group") {
      _draft.blindGHIN = "";
      _draft.blindName = "";
    }
  }

  function _selectBlind(ghin) {
    _draft.blindGHIN = ghin;
    const player = (_ctx.roster || []).find(p => String(p.dbPlayers_PlayerGHIN || "").trim() === ghin);
    const name = player
      ? (String(player.dbPlayers_Name || "").trim() ||
         `${String(player.dbPlayers_FName || "").trim()} ${String(player.dbPlayers_LName || "").trim()}`.trim())
      : "";
    _draft.blindName = name;
  }

  function _selectBlindTarget(target) {
    _draft.blindTarget = Number(target);
  }

  // ── Save payload — relocated verbatim from buildPatchFromWiz() ─────────
  function _buildSavePayload() {
    const blindPlayers = (() => {
      if (!_draft.useBlind || _draft.blindTarget === null) return [];
      const arr = [];
      if (_draft.blindMode === "game" && _draft.blindGHIN) {
        arr.push({ ghin: _draft.blindGHIN, name: _draft.blindName });
      }
      arr.push({ target: _draft.blindTarget });
      return arr;
    })();

    return {
      dbGames_GGID:          _ctx.ggid,
      dbGames_BlindPlayers:  blindPlayers,
    };
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el && !_busy) _dismiss(); });
      document.body.appendChild(el);
    }
    return el;
  }

  let _lockDepth = 0;
  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  function _dismiss() {
    if (_busy) return;
    MA.setGameBlindPlayer.close();
    if (typeof _onDone === "function") _onDone();
  }

  function _showModalNotice(message, level) {
    const slot = document.getElementById(NOTICE_ID);
    if (!slot) { MA.setStatus?.(message, level); return; }
    MA.ui.showModalNotice(slot, { message, tone: level });
  }

  // ── Render ───────────────────────────────────────────────────────────
  function _renderModal(isEvent) {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="sgbTitle">
        <header class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__title" id="sgbTitle">Blind Player</div>
          <button type="button" class="iconBtn btnPrimary" id="sgbBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="sgbControls"></div>
        <div id="${NOTICE_ID}"></div>

        <div class="maModal__body" id="sgbBody"></div>

        <footer class="maModal__ftr">
          <button type="button" class="maFtrBtn maFtrBtn--cancel" id="sgbBtnCancel">Cancel</button>
          <button type="button" class="maFtrBtn maFtrBtn--save" id="sgbBtnApply">Save</button>
        </footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("sgbControls");
    if (!el || !_ctx) return;
    const g = _ctx.game;

    const gameTitle = String(g.dbGames_Title || `GGID ${_ctx.ggid || ""}`).trim();
    const line1 = [gameTitle, `GGID ${esc(_ctx.ggid ?? "")}`].join(" · ");
    const line2 = [g.dbGames_CourseName, g.dbGames_PlayDate].filter(Boolean).join(" • ");
    const line3 = g.dbGames_EID
      ? [g.dbEvents_Title, `EID ${g.dbGames_EID}`].filter(Boolean).map(esc).join(" · ")
      : "";

    el.innerHTML = `
      <div class="maListRow__col">${esc(line1)}</div>
      <div class="maListRow__subline">${esc(line2)}</div>
      ${line3 ? `<div class="maListRow__subline">${line3}</div>` : ""}`;
  }

  function _rosterOptionsHtml() {
    const roster = (_ctx.roster || []).slice().sort((a, b) =>
      String(a.dbPlayers_LName || "").toLowerCase().localeCompare(String(b.dbPlayers_LName || "").toLowerCase())
    );
    const opts = roster.map(p => {
      const ghin = String(p.dbPlayers_PlayerGHIN || "").trim();
      if (!ghin) return "";
      const name = String(p.dbPlayers_Name || "").trim() ||
        `${String(p.dbPlayers_FName || "").trim()} ${String(p.dbPlayers_LName || "").trim()}`.trim();
      return `<option value="${esc(ghin)}"${_draft.blindGHIN === ghin ? " selected" : ""}>${esc(name || ghin)}</option>`;
    }).join("");
    return `<option value="">Select player...</option>${opts}`;
  }

  function _renderBody() {
    const body = document.getElementById("sgbBody");
    if (!body || !_draft) return;

    if (_pairing() !== "PairField") {
      body.innerHTML = `
        <div class="maCard">
          <div class="actionMenu_category">Use a Blind Player</div>
          <div style="padding:14px; display:flex; align-items:center; justify-content:space-between;">
            <span class="maListRow__col">Does this game need a blind player?</span>
            <div class="maSeg" style="width:auto;" role="group" aria-label="Use a blind player">
              <button type="button" class="maSegBtn" disabled aria-pressed="false">Yes</button>
              <button type="button" class="maSegBtn is-active" disabled aria-pressed="true">No</button>
            </div>
          </div>
          <div style="padding:0 14px 14px;">
            <div class="maHintText">Not applicable for Pair vs. Pair games.</div>
          </div>
        </div>`;
      return;
    }

    body.innerHTML = `
      <div class="maCard">

        <div class="actionMenu_category">Use a Blind Player</div>
        <div style="padding:14px; display:flex; align-items:center; justify-content:space-between;">
          <span class="maListRow__col">Does this game need a blind player?</span>
          <div class="maSeg" id="sgbUseBlindSeg" style="width:auto;" role="group" aria-label="Use a blind player">
            <button type="button" class="maSegBtn${_draft.useBlind ? " is-active" : ""}" data-use="1" aria-pressed="${_draft.useBlind}">Yes</button>
            <button type="button" class="maSegBtn${!_draft.useBlind ? " is-active" : ""}" data-use="0" aria-pressed="${!_draft.useBlind}">No</button>
          </div>
        </div>

        <div id="sgbConfigWrap" style="${_draft.useBlind ? "" : "display:none;"}">

          <div class="actionMenu_category">Who Selects the Blind Player?</div>
          <div style="padding:14px; display:flex; flex-direction:column; gap:8px;">

            <div class="maListRow${_draft.blindMode === "group" ? " is-selected" : ""}" role="button" tabindex="0" data-mode="group" style="border:1px solid var(--border); border-radius:8px;">
              <span class="maCheckbox--accent${_draft.blindMode === "group" ? " is-checked" : ""}" aria-hidden="true"></span>
              <div style="flex:1 1 auto; min-width:0;">
                <div class="maListRow__col">The blind player(s) are selected in the Digital Scoring page</div>
                <div class="maListRow__subline">Allows each group to select their own individual blind player.</div>
              </div>
            </div>

            <div class="maListRow${_draft.blindMode === "game" ? " is-selected" : ""}" role="button" tabindex="0" data-mode="game" style="border:1px solid var(--border); border-radius:8px;">
              <span class="maCheckbox--accent${_draft.blindMode === "game" ? " is-checked" : ""}" aria-hidden="true"></span>
              <div style="flex:1 1 auto; min-width:0;">
                <div class="maListRow__col">Assign a single blind player</div>
                <div class="maListRow__subline">The blind player below will be assigned to all groups.</div>
              </div>
            </div>

          </div>

          <div id="sgbPlayerWrap" style="${_draft.blindMode === "game" ? "" : "display:none;"} padding:0 14px 14px;">
            <div class="maListRow__col" style="margin-bottom:6px;">Blind Player</div>
            <select class="maTextInput" id="sgbBlindSelect" style="width:100%;">${_rosterOptionsHtml()}</select>
          </div>

          <div class="actionMenu_category">Target Group Size</div>
          <div style="padding:14px;">
            <div class="maChoiceChips" id="sgbTargetChips">
              ${TARGET_OPTIONS.map(n => `
                <button type="button" class="maChoiceChip${_draft.blindTarget === n ? " is-selected" : ""}"
                        data-target="${n}" aria-pressed="${_draft.blindTarget === n}">${n}</button>
              `).join("")}
            </div>
            <div class="maHintText" style="margin-top:8px;">The total number of scoring players the blind fills up to.</div>
          </div>

        </div>
      </div>`;
  }

  // ── Event wiring — consolidated, delegated ──────────────────────────
  function _wireEvents() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.querySelector("#sgbBtnClose")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgbBtnCancel")?.addEventListener("click", () => { if (!_busy) _dismiss(); });
    overlay.querySelector("#sgbBtnApply")?.addEventListener("click", _apply);

    const body = document.getElementById("sgbBody");
    if (!body) return;

    body.addEventListener("click", (e) => {
      const useBtn = e.target.closest("[data-use]");
      if (useBtn) { _toggleBlind(useBtn.dataset.use === "1"); _renderBody(); _wireBodyEvents(); return; }

      const modeRow = e.target.closest("[data-mode]");
      if (modeRow) { _selectBlindMode(modeRow.dataset.mode); _renderBody(); _wireBodyEvents(); return; }

      const targetChip = e.target.closest("[data-target]");
      if (targetChip) {
        _selectBlindTarget(targetChip.dataset.target);
        body.querySelectorAll("#sgbTargetChips [data-target]").forEach(b => {
          const on = Number(b.dataset.target) === _draft.blindTarget;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-pressed", String(on));
        });
      }
    });

    body.addEventListener("keydown", (e) => {
      const modeRow = e.target.closest("[data-mode]");
      if (modeRow && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        _selectBlindMode(modeRow.dataset.mode);
        _renderBody();
        _wireBodyEvents();
      }
    });

    _wireBodyEvents();
  }

  // select dropdown is rebuilt on every _renderBody() call, so its
  // listener needs rebinding each time too — kept separate from the
  // delegated body click handler above (which is attached once and
  // survives innerHTML swaps on its own children automatically).
  function _wireBodyEvents() {
    const select = document.getElementById("sgbBlindSelect");
    select?.addEventListener("change", (e) => _selectBlind(e.target.value));
  }

  async function _apply() {
    if (_busy) return;
    _busy = true;
    MA.ui?.showBusy?.({ title: "Blind Player", message: "Saving — please wait..." });
    try {
      const res = await MA.postJson(SAVE_ENDPOINT, { payload: _buildSavePayload() });
      if (!res?.ok) { _showModalNotice(res?.message || "Unable to save Blind Player.", "danger"); return; }
      MA.ui?.hideBusy?.();
      _busy = false;
      _dismiss();
      return;
    } catch (e) {
      console.error("[MA.setGameBlindPlayer]", e);
      _showModalNotice("Error saving Blind Player.", "danger");
    } finally {
      MA.ui?.hideBusy?.();
      _busy = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.setGameBlindPlayer.open = async function (options) {
    _onDone = options?.onDone || null;
    _busy = false;

    MA.ui?.showBusy?.({ title: "Blind Player", message: "Loading..." });
    let ctx;
    try {
      const res = await MA.postJson(CONTEXT_ENDPOINT, {});
      if (!res || !res.ok) throw new Error(res?.message || "Failed to load game context.");
      ctx = res.payload;
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load game context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();

    _ctx = ctx;
    _draft = _draftFromGame(ctx.game);

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal(!!ctx.game.dbGames_EID);
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    _renderControls();
    _renderBody();
    _wireEvents();

    _onEsc = (e) => { if (e.key === "Escape" && !_busy) _dismiss(); };
    document.addEventListener("keydown", _onEsc);
  };

  MA.setGameBlindPlayer.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _lockScroll(false);
    if (_onEsc) { document.removeEventListener("keydown", _onEsc); _onEsc = null; }
  };

})();
