/* /assets/modules/module_menuGameSettings.js
 * MA.menuGameSettings — Game Settings menu module.
 *
 * Not a page. An overlay, summoned from wherever, closes back to whatever
 * was already showing — no router return-contract.
 *
 * ── Self-hydration ────────────────────────────────────────────────────
 * open() takes NO game data. Same as every page in this app, GGID comes
 * from session server-side (ServiceContextGame::getStoredGGID()) — the
 * module fetches its own complete context on every open(), including
 * reopens after a child module closes. Never carries data forward from a
 * previous open — a child's save may have changed fields this menu
 * doesn't own (cross-domain writes: GROSS<->NET resetting Handicaps,
 * locked Game Formats forcing Scoring System), so the only correct
 * summary data is freshly fetched, every time.
 *
 * Context endpoint reused as-is: /api/game_settings/initGameSettings.php
 * already does exactly what self-hydration needs (auth, GGID from
 * session, game+roster+coursePars). Its filename now undersells its
 * scope — it's not just for the Settings page anymore — worth a rename
 * later, not touched here.
 *
 * ── Sequencing ────────────────────────────────────────────────────────
 * Closes itself BEFORE opening any child, reopens only when the child
 * signals it's done. Never stacked (scroll-lock is a boolean toggle
 * elsewhere in this module family, not a reference count).
 *
 * ── Child module contracts — TWO DIFFERENT SHAPES RIGHT NOW ────────────
 * New modules (Format, Segments, Blind Player, Scoring) do not exist yet.
 * Calls below use optional chaining and no-op until each is built, one at
 * a time. They're expected to self-hydrate like this module does — no
 * data passed in, just an onDone callback.
 *
 * Existing modules (Placement Points, Handicaps, Teams, Flights) are NOT
 * refactored yet — left intact deliberately, refactored last. They still
 * expect caller-supplied data in their current shapes. The _adapt*()
 * functions below exist ONLY to bridge that gap using this module's fresh
 * context — delete each adapter the moment its module is refactored to
 * self-hydrate.
 *
 * KNOWN GAP, accepted for this build: those same four modules only fire
 * onApply, never on Cancel or backdrop-dismiss. Until each is retrofitted
 * with a real exit-path signal, backing out of one without saving strands
 * the user with no menu to return to.
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;
  MA.menuGameSettings = MA.menuGameSettings || {};

  const OVERLAY_ID = "maMenuGameSettingsOverlay";
  const CONTEXT_ENDPOINT = "/api/game_settings/initGameSettings.php";

  // ── Overlay-lock bookkeeping — counted, not a plain toggle. See header
  // note in earlier revisions: ma_shared.js already has the correct fix
  // for this (_overlayOpened/_overlayClosed backing MA.ui.showBusy) but
  // it's a private closure, not exposed on MA.ui. This module opens/closes
  // far more than any other in the family, so it uses the safer pattern
  // locally rather than copy the plain toggle the other modules use.
  let _lockDepth = 0;
  function _lockScroll(on) {
    _lockDepth = Math.max(0, _lockDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle("maOverlayOpen", _lockDepth > 0);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function pairingLabel(v) { return v === "PairPair" ? "Pair vs. Pair" : "Pair vs. Field"; }

  function handicapSummary(g) {
    const method = g.dbGames_HCMethod === "SO" ? "Shots-Off" : "CH with Allowance";
    const parts = [method];
    if (g.dbGames_HCMethod !== "SO" && g.dbGames_Allowance != null) parts.push(`${g.dbGames_Allowance}%`);
    return parts.join(" · ");
  }

  function scoringSummary(g) {
    const parts = [g.dbGames_ScoringMethod === "ADJ GROSS" ? "GROSS" : "NET"];
    if (g.dbGames_ScoringSystem === "BestBall" && g.dbGames_BestBall) parts.push(`Best Ball · ${g.dbGames_BestBall}`);
    else if (g.dbGames_ScoringSystem) parts.push(g.dbGames_ScoringSystem);
    return parts.join(" · ");
  }

  function blindPlayerSummary(raw) {
    let arr = raw;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
    if (!Array.isArray(arr) || !arr.length) return "Off";
    const named = arr.find(x => x && x.ghin);
    return named ? `Assigned · ${named.name || named.ghin}` : "Group-selected";
  }

  // Read-only. Mirrors buildPatchFromWiz()'s derivation in game_settings.js
  // — no write, just needed by the Placement Points adapter below.
  function effectiveScoringSegments(g) {
    const rotationLocksTo1 = !!g.dbGames_RotationMethod && g.dbGames_RotationMethod !== "None";
    if (g.dbGames_Competition !== "PairPair" || rotationLocksTo1) return 1;
    return parseInt(g.dbGames_ScoringSegments || "1", 10) === 3 ? 3 : 1;
  }

  // ── Row behavior — summary + open, keyed by id. Label/icon/order are
  // NOT here — they live in the DOM catalog (includes/gameSettingsMenuRows.php),
  // read at render time. This object only supplies what has to be code:
  // live-state summaries and which module opens.
  const ROW_BEHAVIOR = {
    format: {
      summary: (g) => [pairingLabel(g.dbGames_Competition), g.dbGames_GameLabel].filter(Boolean).join(" · "),
      open: (done) => MA.setGameFormat?.open({ onDone: done }),
    },
    segments: {
      summary: (g) => [g.dbGames_Segments ? `${g.dbGames_Segments}'s` : "", (!g.dbGames_RotationMethod || g.dbGames_RotationMethod === "None") ? "No rotation" : g.dbGames_RotationMethod].filter(Boolean).join(" · "),
      open: (done) => MA.setGameSegments?.open({ onDone: done }),
    },
    blindPlayer: {
      summary: (g) => blindPlayerSummary(g.dbGames_BlindPlayers),
      open: (done) => MA.setGameBlindPlayer?.open({ onDone: done }),
    },
    scoring: {
      summary: (g) => scoringSummary(g),
      open: (done) => MA.setGameScoring?.open({ onDone: done }),
    },
    placementPoints: {
      summary: () => "Configured",
      open: (done) => MA.setGamePlacementPoints?.open({ onDone: done }),
    },
    handicaps: {
      summary: (g) => handicapSummary(g),
      open: (done) => MA.setHandicapsGameEvent?.open({target: "game", onDone: done}),
    },
    teams: {
      summary: (g) => (g.dbGames_TeamMode === "active" ? "Active" : "Off"),
      open: (done) => MA.manageTeams?.open(_adaptTeams(done)),
    },
    flights: {
      summary: (g) => (g.dbGames_FlightMode === "active" ? "Active" : "Off"),
      open: (done) => MA.defineFlights?.open(_adaptFlights(done)),
    },
  };

  // ── TEMPORARY adapters — delete each one the moment its module is
  // refactored to self-hydrate. Built from this menu's freshly-fetched
  // _ctx, not from any caller-supplied data (there isn't any anymore).
  function _adaptPlacementPoints(done) {
    const g = _ctx.game;
    return {
      competition:     g.dbGames_Competition,
      scoringSegments: effectiveScoringSegments(g),
      placementPoints: g.dbGames_PlacementPoints,
      // Ignore returned values — self-hydration means the next open()
      // re-fetches fresh; no need to patch anything locally.
      onApply: () => done(),
    };
  }

  function _adaptHandicaps(done) {
    const g = _ctx.game;
    return {
      method:      g.dbGames_HCMethod,
      allowance:   g.dbGames_Allowance,
      effectivity: g.dbGames_HCEffectivity,
      effDate:     g.dbGames_HCEffectivityDate,
      apiBase:     "/api/game_settings",
      saveEndpoint: "saveGameHandicapSettings.php",
      onApply:     () => done(),
    };
  }

  function _adaptTeams(done) {
    return {
      players:    _ctx.roster,
      teamConfig: _ctx.game.dbGames_TeamConfig,
      onApply:    () => done(),
    };
  }

  function _adaptFlights(done) {
    return {
      players:      _ctx.roster,
      flightConfig: _ctx.game.dbGames_FlightConfig,
      onApply:      () => done(),
    };
  }

  // ── Context fetch ────────────────────────────────────────────────────
  async function _fetchContext() {
    if (typeof MA.postJson !== "function") throw new Error("ma_shared.js not loaded (MA.postJson missing).");
    const res = await MA.postJson(CONTEXT_ENDPOINT, {});
    if (!res || !res.ok) throw new Error(res?.message || "Failed to load game context.");
    return res.payload; // { ggid, game, roster, coursePars, recallTemplates }
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  let _ctx = null;
  let _isDirty = false; // set true only when a child module confirms a real save

  function _ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "maModalOverlay";
      el.setAttribute("aria-hidden", "true");
      el.addEventListener("click", e => { if (e.target === el) _finalClose(); });
      document.body.appendChild(el);
    }
    return el;
  }

  function _renderModal(isEvent) {
    return `
      <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="gsMenuTitle">
        <header class="maModal__hdr${isEvent ? " is-event-context" : ""}">
          <div class="maModal__title" id="gsMenuTitle">Game Settings</div>
          <button type="button" class="iconBtn btnPrimary" id="gsMenuBtnClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="maModal__controls" id="gsMenuControls"></div>

        <div class="maModal__body">
          <div class="maCard">
            <div class="maCard__body" id="gsMenuRows" role="list"></div>
          </div>
        </div>

        <footer class="maModal__ftr">
          <div class="maModal__ftrActions">
            <button type="button" class="maFtrBtn maFtrBtn--cancel" id="gsMenuBtnFooterClose">Close</button>
          </div>
        </footer>
      </section>`;
  }

  function _renderControls() {
    const el = document.getElementById("gsMenuControls");
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

  const CATEGORY_ORDER = ["setup", "roster"];

  function _categoryLabels(isEvent) {
    return isEvent
      ? { setup: "ROUND SETUP", roster: "ROUND ROSTER SETUP" }
      : { setup: "GAME SETUP", roster: "GAME ROSTER SETUP" };
  }

  function _renderRows() {
    const container = document.getElementById("gsMenuRows");
    const catalog = document.getElementById("gsMenuRowCatalog");
    if (!container || !_ctx) return;
    container.innerHTML = "";

    if (!catalog) {
      container.innerHTML = "<!-- includes/gameSettingsMenuRows.php not included on this page -->";
      return;
    }

    const isEvent = !!_ctx.game.dbGames_EID;
    const labels = _categoryLabels(isEvent);
    const entries = Array.from(catalog.querySelectorAll("[data-setting]"));

    CATEGORY_ORDER.forEach((cat) => {
      const inCategory = entries.filter(e => e.getAttribute("data-category") === cat);
      if (!inCategory.length) return;

      const header = document.createElement("div");
      header.className = "actionMenu_category";
      header.textContent = labels[cat];
      container.appendChild(header);

      inCategory.forEach((entry) => {
        const id = entry.getAttribute("data-setting");
        const label = entry.getAttribute("data-label") || id;
        const iconEl = entry.querySelector("svg, img");
        const iconHtml = iconEl ? iconEl.outerHTML : "";
        const behavior = ROW_BEHAVIOR[id];
        const summaryText = behavior ? behavior.summary(_ctx.game) : "";

        const row = document.createElement("div");
        row.className = "maListRow";
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("data-setting", id);
        row.id = `gsMenuRow-${id}`;
        row.innerHTML = `
          <span class="maListRow__avatar" style="border-radius: var(--radiusSq); background: transparent;" aria-hidden="true">${iconHtml}</span>
          <div style="flex:1 1 auto; min-width:0;">
            <div class="maListRow__col">${esc(label)}</div>
            <div class="maListRow__subline">${esc(summaryText)}</div>
          </div>
          <span class="maHubRow__arrow" aria-hidden="true">&rsaquo;</span>`;
        row.addEventListener("click", () => _openRow(id));
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); _openRow(id); }
        });
        container.appendChild(row);
      });
    });
  }

  function _openRow(id) {
    const behavior = ROW_BEHAVIOR[id];
    if (!behavior) return;
    MA.menuGameSettings.close(); // transient teardown only — not a final exit, no dirty check here
    behavior.open((wasSaved) => {
      if (wasSaved === true) _isDirty = true;
      MA.menuGameSettings.open();
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  MA.menuGameSettings.open = async function () {
    MA.ui?.showBusy?.({ title: "Game Settings", message: "Loading..." });
    let ctx;
    try {
      ctx = await _fetchContext();
    } catch (e) {
      MA.ui?.hideBusy?.();
      MA.setStatus?.(e.message || "Failed to load game context.", "error");
      return;
    }
    MA.ui?.hideBusy?.();
    _ctx = ctx;

    const overlay = _ensureOverlay();
    overlay.innerHTML = _renderModal(!!_ctx.game.dbGames_EID);
    overlay.className = "maModalOverlay is-open";
    overlay.setAttribute("aria-hidden", "false");
    _lockScroll(true);

    document.getElementById("gsMenuBtnClose")?.addEventListener("click", _finalClose);
    document.getElementById("gsMenuBtnFooterClose")?.addEventListener("click", _finalClose);
    _renderControls();
    _renderRows();
  };

  MA.menuGameSettings.close = function () {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.className = "maModalOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    }
    _lockScroll(false);
  };

  // The actual "user is leaving the whole menu" exit — X, footer Close,
  // and backdrop click all route here, not to close() directly. close()
  // alone is also used by _openRow() as a transient teardown between rows,
  // where a dirty check would be wrong (the user hasn't left, they're
  // diving into a row). This is the only place that decides whether a
  // reload is warranted.
  function _finalClose() {
    const wasDirty = _isDirty;
    _isDirty = false; // reset here, not in open() — this is the only true
                       // session boundary; open() also runs on the
                       // reopen-after-child cycle, where resetting would
                       // wipe out a flag a prior row just set
    MA.menuGameSettings.close();
    if (wasDirty) {
      window.location.reload();
    }
  }

  // The only place in the codebase that maps these action names to this
  // module — ma_shared.js's routerGo() just sees "something is
  // registered," it never mentions Game Settings by name.
  MA.moduleActions = MA.moduleActions || {};
  MA.moduleActions.settings = MA.moduleActions.roundsettings = () => MA.menuGameSettings.open();

})();
