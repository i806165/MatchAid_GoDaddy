/* /assets/modules/module_sourceGames.js
 * MA.gamesSource — shared "games list" rendering module.
 *
 * Used in TWO contexts by the host page (today: adminhome.php; later: adminportal.php's
 * Games panel + the surviving Event Rounds page):
 *   1) Standalone/flat Games list  (isEventMode: false) — labeled "Game"
 *   2) Event Rounds list           (isEventMode: true)  — labeled "Round", filtered server-side by eid
 *
 * The module owns: card markup, date badge formatting, card-tap / MANAGE click wiring,
 * and the per-card actions menu (openGameMenu). It does NOT own data fetching, filters,
 * or the action handlers themselves — those stay host-side (host passes an onAction callback).
 *
 * Usage:
 *   MA.gamesSource.mount({
 *     cardsElId: "cards",
 *     emptyElId: "emptyState",
 *     isEventMode: false,
 *     getRows: () => state.games.dbRows,        // optional convenience accessor
 *     onAction: (action, ggid) => handleGameAction({ action, ggid })
 *   });
 *
 *   MA.gamesSource.render(dbRows);   // call whenever new game rows arrive from the server
 */
(function (global) {
  "use strict";

  const MA = global.MA = global.MA || {};

  // Sticky per-container mount state (mirrors the WeakMap-anchor pattern used elsewhere
  // this session). Keeping this separate from any tab-strip/controls container is what
  // keeps mount() idempotent across re-renders.
  const mounts = new WeakMap();

  // ---- local helpers (kept self-contained; do not depend on host globals) ----
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function parseYmd(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).slice(0, 10).split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function badgeParts(ymd) {
    const dt = parseYmd(ymd);
    if (!dt) return { top: "", day: "", bot: "" };
    const mon = dt.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
    const yy = String(dt.getFullYear()).slice(-2);
    const top = `${mon}'${yy}`; // matches legacy "JAN'26"
    const day = String(dt.getDate());
    const bot = dt.toLocaleDateString(undefined, { weekday: "short" }); // "Thu"
    return { top, day, bot };
  }

  function cardHtml(r) {
    const playDate = String(r.dbGames_PlayDate || "").trim();
    const b = badgeParts(playDate);

    const course = String(r.dbGames_CourseName || "").trim();
    const facility = String(r.dbGames_FacilityName || "").trim();
    const adminName = String(r.dbGames_AdminName || r.dbGames_AdminGHIN || "").trim();

    const playTimeDb = String(r.dbGames_PlayTime || "").trim();      // "09:51:00"
    const playTime = playTimeDb ? playTimeDb.substring(0, 5) : "";   // "09:51"

    const privacy = String(r.dbGames_Privacy || "").trim();
    const holes = String(r.dbGames_Holes || "").trim();

    const playerCount = Number(r.playerCount ?? r.dbGames_PlayerCount ?? 0);

    const teeCnt = Number(r.dbGames_TeeTimeCnt ?? 0);
    const totalSlots = teeCnt > 0 ? teeCnt * 4 : 0;
    const playersText = totalSlots > 0 ? `${playerCount}/${totalSlots}` : `${playerCount}`;

    const line2 = [playTime, holes].filter(Boolean).join(" • ");

    const line3 = [
      (playersText ? `Registered ${playersText}` : null),
      (privacy ? `Accessible by ${privacy}` : null),
    ].filter(Boolean).join(" • ");

    const title = String(r.dbGames_Title || "").trim();
    const ggid = String(r.dbGames_GGID ?? "").trim();
    const courseConfirmed = r.dbGames_CourseConfirmed == 1 || r.dbGames_CourseConfirmed === true;
    const provisionalHtml = !courseConfirmed
      ? `<div class="maGameCard__provisional">⚠ Course is not yet confirmed</div>`
      : ``;

    return `
      <div class="maCard maGameCard" data-ggid="${esc(ggid)}">
        <div class="maCard__hdr">
          <div class="maCard__title">
            <span class="maCard__titleText">${esc(title)}</span>
            <span class="maCard__titleGgid">${esc(ggid)}</span>
          </div>

          <div class="maCard__actions">
            <div class="maGameCard__hdrAdmin" title="${esc(adminName)}">${esc(adminName)}</div>
          </div>
        </div>

        <div class="maCard__body maGameCard__body">
          <div class="maGameCard__top">
            <div class="maDateBadge">
              <div class="maDateBadge__top">${esc(b.top)}</div>
              <div class="maDateBadge__mid">${esc(b.day)}</div>
              <div class="maDateBadge__bot">${esc(b.bot)}</div>
            </div>

            <div class="maGameCard__meta">
                <div class="maGameCard__line1">
                  <div class="maGameCard__courseWrap" title="${esc([course, facility].filter(Boolean).join(" • "))}">
                    <span class="maGameCard__courseName">${esc(course)}</span>
                    ${facility ? `<span class="maGameCard__facilityName"> • ${esc(facility)}</span>` : ``}
                  </div>

                  <!-- Desktop-only visual affordance; mobile hides this -->
                  <button
                    type="button"
                    class="maCard__actionBtn maGameCard__manageBtn"
                    data-game-action="menu"
                    data-ggid="${esc(ggid)}"
                    aria-label="Manage"
                  >MANAGE</button>
                </div>

                ${provisionalHtml}

                <div class="maGameCard__line2">
                  <div class="maGameCard__facts" title="${esc(line2)}">${esc(line2)}</div>
                </div>
                <div class="maGameCard__line3">
                  <div class="maGameCard__facts" title="${esc(line3)}">${esc(line3)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
  }

  function buildGameMenu(ctx, g) {
    if (!MA.ui || typeof MA.ui.openActionsMenu !== "function") {
      console.warn("[module_sourceGames] MA.ui.openActionsMenu not found.");
      return;
    }

    const dt = parseYmd(g.dbGames_PlayDate);
    const dateLine = dt ? dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit", year: "numeric" }) : "";
    const subtitle = [dateLine, g.dbGames_PlayTime || ""].filter(Boolean).join(" ");

    const gMode = ctx.isEventMode ? "Round" : "Game";
    const fire = (action) => ctx.onAction(action, g.dbGames_GGID);

    MA.ui.openActionsMenu(g.dbGames_Title || gMode, [
      { category: `${gMode.toUpperCase()} SETUP` },
      { label: `Edit ${gMode}`,            indent: true, action: () => fire("editGame") },
      { label: `Define ${gMode} Settings`, indent: true, action: () => fire("settings") },

      { category: `${gMode.toUpperCase()} ADMINISTRATION` },
      { label: `Select ${gMode} Players`,  indent: true, action: () => fire("roster") },
      { label: `Pair ${gMode} Players`,    indent: true, action: () => fire("pairings") },
      { label: `Assign ${gMode} TeeTimes`, indent: true, action: () => fire("teetimes") },
      { label: `View ${gMode} Summary`,    indent: true, action: () => fire("summary") },
      { label: `Pre-${gMode} Scorecards`,  indent: true, action: () => fire("scorecard") },

      { category: "ADMIN SERVICES" },
      { label: "View Players",             indent: true, action: () => fire("rosterView") },
      { label: "Send Message to Players",  indent: true, action: () => fire("notify") },
      { label: `Add ${gMode} to Calendar`, indent: true, action: () => fire("calendar") },

      { separator: true },
      { label: `Delete the ${gMode}`, danger: true, action: () => fire("deleteGame") },
    ], subtitle);
  }

  function render(ctx, rows) {
    const cardsEl = document.getElementById(ctx.cardsElId);
    const emptyEl = ctx.emptyElId ? document.getElementById(ctx.emptyElId) : null;
    if (!cardsEl) return;

    const dbRows = Array.isArray(rows) ? rows : [];
    ctx.rows = dbRows; // keep latest rows for click lookups

    if (!dbRows.length) {
      cardsEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    cardsEl.innerHTML = dbRows.map(cardHtml).join("");

    // 1) Card tap opens menu (ALL devices)
    cardsEl.querySelectorAll(".maGameCard").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button,a,input,label")) return; // let real controls handle themselves
        const ggid = card.getAttribute("data-ggid");
        const r = ctx.rows.find((x) => String(x.dbGames_GGID) === String(ggid)) || null;
        if (!r) return;
        buildGameMenu(ctx, r);
      });
    });

    // 2) MANAGE button: same behavior as card tap, but stop bubbling
    cardsEl.querySelectorAll('button[data-game-action="menu"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ggid = btn.getAttribute("data-ggid");
        const r = ctx.rows.find((x) => String(x.dbGames_GGID) === String(ggid)) || null;
        if (!r) return;
        buildGameMenu(ctx, r);
      });
    });
  }

  const api = {
    /**
     * mount(config) — idempotent; safe to call on every render cycle.
     * config:
     *   cardsElId   {string}  required — id of the container the cards render into
     *   emptyElId   {string}  optional — id of the "no games" empty-state element
     *   isEventMode {boolean} optional — flips "Game" labeling to "Round" (default false)
     *   onAction    {function(action, ggid)} required — host-side action dispatcher
     *               (host owns setGameSession, routerGo, apiSession/apiAdmin calls, etc.)
     */
    mount(config) {
      const cardsEl = document.getElementById(config.cardsElId);
      if (!cardsEl) {
        console.warn("[module_sourceGames] mount: cardsElId not found:", config.cardsElId);
        return null;
      }

      let ctx = mounts.get(cardsEl);
      if (!ctx) {
        ctx = { rows: [] };
        mounts.set(cardsEl, ctx);
      }

      ctx.cardsElId = config.cardsElId;
      ctx.emptyElId = config.emptyElId || null;
      ctx.isEventMode = !!config.isEventMode;
      ctx.onAction = typeof config.onAction === "function" ? config.onAction : () => {};
      ctx.getRows = typeof config.getRows === "function" ? config.getRows : null;

      mounts.set(cardsEl, ctx);
      return ctx;
    },

    /**
     * render(rows) — re-render the card list for the most recently mounted container.
     * For multi-instance use (e.g. side-by-side panels later in Phase 3), pass cardsElId
     * explicitly as the second arg.
     */
    render(rows, cardsElId) {
      const id = cardsElId || api._lastMountedId;
      const cardsEl = id ? document.getElementById(id) : null;
      const ctx = cardsEl ? mounts.get(cardsEl) : null;
      if (!ctx) {
        console.warn("[module_sourceGames] render called before mount().");
        return;
      }
      render(ctx, rows);
    },

    /** Expose for host pages that want to trigger the menu programmatically. */
    openGameMenu(row, cardsElId) {
      const id = cardsElId || api._lastMountedId;
      const cardsEl = id ? document.getElementById(id) : null;
      const ctx = cardsEl ? mounts.get(cardsEl) : null;
      if (!ctx) return;
      buildGameMenu(ctx, row);
    },

    // exposed for host reuse (e.g. badge previews elsewhere) — not required for mount/render
    _internals: { esc, parseYmd, badgeParts }
  };

  // Track last mounted container id for the common single-instance case (today's pages).
  const _mount = api.mount;
  api._lastMountedId = null;
  api.mount = function (config) {
    const ctx = _mount(config);
    if (ctx) api._lastMountedId = config.cardsElId;
    return ctx;
  };

  MA.gamesSource = api;
})(window);
