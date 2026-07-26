/* /assets/modules/ghin_post_scores.js
 * Shared GHIN Score Posting module.
 * - Fetches player score summary for review.
 * - Renders confirmation modal with Hole/Score grid.
 * - Executes the GHIN API post call.
 */
(function (global) {
  "use strict";

  const MA = global.MA || {};
  MA.ghinPostScores = MA.ghinPostScores || {};

  let _overlay = null;
  let _config = null; // { ggid, onPosted }
  let _activeNine = 'front'; // 'front' | 'back' — reset on each open()

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // TeeSetDetails rides along on the player row as a JSON string (same
  // pattern as dbPlayers_Scores elsewhere in the app) — decode defensively
  // since callers may have already hydrated it to an object upstream.
  function decodeTeeSetDetails(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // Par-per-hole for the tee actually being played lives at
  // TeeSetDetails.Course.Holes[].Par, keyed by .Number (1-18) — not a
  // course default, so this reflects the exact tee this round was played
  // from.
  function getHoleParMap(p) {
    const details = decodeTeeSetDetails(p?.dbPlayers_TeeSetDetails);
    const holes = details?.Course?.Holes;
    const map = {};
    if (Array.isArray(holes)) {
      holes.forEach((h) => { if (h && h.Number != null) map[h.Number] = h.Par; });
    }
    return map;
  }

  function toParDisplay(gross, par) {
    if (gross == null || par == null || isNaN(gross) || isNaN(par)) return '—';
    const diff = gross - par;
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  function formatDate(s) {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    return `${m[2]}/${m[3]}/${m[1].slice(-2)}`;
  }

  function ensureOverlay() {
    if (_overlay) return;
    _overlay = document.createElement("div");
    _overlay.id = "ghinPostOverlay";
    _overlay.className = "maModalOverlay";

    // Clicking outside the modal does not dismiss it
    _overlay.addEventListener("click", (e) => {
      if (e.target === _overlay) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    document.body.appendChild(_overlay);
  }

  async function fetchReviewData() {
    // Dedicated endpoint pulls GGID and Identity from session. 
    // No GGID or Scope needed in the URL per architectural rules.
    const base = (MA.paths && MA.paths.apiGHIN) ? MA.paths.apiGHIN : "/api/GHIN";
    const res = await fetch(`${base}/lauchGHINPostScores.php`);
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.message || "Unable to load score summary.");
    return json;
  }

  async function open(config) {
    _config = config || {};
    _activeNine = 'front';
    if (!_config.ggid) return console.error("GHIN Posting: Missing GGID.");
    ensureOverlay();

    try {
      if (MA.ui && typeof MA.ui.notify === 'function') MA.ui.notify("Preparing score review...", "info");
      else if (typeof MA.setStatus === 'function') MA.setStatus("Preparing score review...", "info");
      const payload = await fetchReviewData();
      const holeScope = payload?.meta?.holes || 'All 18';
      _activeNine = (holeScope === 'B9') ? 'back' : 'front';

      const blocker = getPostingBlocker(payload);
      renderModal(payload, blocker);
    } catch (e) {
      renderModal(null, e.message || "Unable to load score summary.");
    }
  }

  function getPostingBlocker(payload) {
    const p = payload?.scorecards?.rows?.[0]?.players?.[0];
    // This module is shared across pages with genuinely different init
    // payload shapes: player_home's page hydrates a real, working
    // context.ghin/user.ghin (see player_home.js's own getUserCtx() —
    // "Player portal canonical: user info is hydrated under init.context"),
    // while scorehome.php/scoreentry.php expose a flat sessionGhin
    // instead, with no user/context object at all. Checking all three,
    // in the same preference order player_home.js itself uses
    // (context before user), covers every page this module is actually
    // loaded from rather than assuming one shape is universal.
    // Authoritative — lauchGHINPostScores.php already validated this
    // against $_SESSION["SessionGHINLogonID"] server-side (see that
    // file's own gate) and rides it along in the response. Reading it
    // from here, rather than window.__INIT__/window.__MA_INIT__, removes
    // the page-shape-guessing problem entirely: different pages that
    // load this shared module have different init payload shapes
    // (player_home's context.ghin/user.ghin vs. scorehome/scoreentry's
    // flat sessionGhin, or neither) — this value doesn't depend on any
    // of that.
    const userGhin = payload?.sessionGhin || "";
    const gameFormat = String(payload?.game?.dbGames_GameFormat || '').trim();

    // 1. Identity & Data Checks
    if (!userGhin) return "GHIN identity not found. Please log in.";
    if (!p) return "Score summary data is incomplete.";
    if (p.dbPlayers_GHINPostID) return "This round has already been posted to GHIN.";

    // 2. Format Guard
    if (["Scramble", "Shamble", "AltShot", "Chapman"].includes(gameFormat)) {
      return "GHIN posting is not available for Scramble, Shamble, Alt Shot, or Chapman formats.";
    }

    // 3. Determine Hole Scope (F9, B9, or 18)
    const holeScope = payload?.meta?.holes || 'All 18';
    const holes = holeScope === 'B9' 
      ? Array.from({length:9},(_,i)=>i+10) 
      : Array.from({length:holeScope === 'F9' ? 9 : 18},(_,i)=>i+1);

    // 3. Minimum Played Holes Guard (USGA: Need 9 for a valid side)
    const playedHoles = holes.filter(h => {
      const val = p.holes?.['h' + h]?.display?.gross;
      return val && val !== '—' && !isNaN(parseFloat(val)) && parseFloat(val) > 0;
    });

    if (playedHoles.length < 9) {
      return "A minimum of 9 holes with scores are required to post.";
    }

    // 4. Total Score Sanity Check
    const scoreTot = parseFloat(p?.totals?.gross?.['9c']);
    if (isNaN(scoreTot) || scoreTot <= 0) {
      return "Total score must be greater than zero to post.";
    }

    return "";
  }

  function renderModal(payload, blockerMessage) {
    const game = payload?.game || {};
    const p = payload?.scorecards?.rows?.[0]?.players?.[0];
    const playerName = p?.dbPlayers_Name || p?.playerName || "Player";

    const playDate = formatDate(game.dbGames_PlayDate);
    const gameTitle = game.dbGames_Title || "Post Scores";
    const courseTeeLine = [playDate, game.dbGames_CourseName, p?.tee ? `Tee ${p.tee}` : ""].filter(Boolean).join(" \u00b7 ");

    // Extract summary scores from the payload totals
    const scoreOut = p?.totals?.gross?.['9a'] || '—';
    const scoreIn  = p?.totals?.gross?.['9b'] || '—';
    const scoreTot = p?.totals?.gross?.['9c'] || '—';

    const parMap = p ? getHoleParMap(p) : {};
    const holeScope = payload?.meta?.holes || 'All 18';
    const showNineTabs = (holeScope === 'All 18');

    let activeHoles;
    if (holeScope === 'F9') {
      activeHoles = Array.from({ length: 9 }, (_, i) => i + 1);
    } else if (holeScope === 'B9') {
      activeHoles = Array.from({ length: 9 }, (_, i) => i + 10);
    } else {
      activeHoles = _activeNine === 'back'
        ? Array.from({ length: 9 }, (_, i) => i + 10)
        : Array.from({ length: 9 }, (_, i) => i + 1);
    }

    let scoreRowsHtml = '';
    if (p) {
      activeHoles.forEach((h) => {
        const grossRaw = p.holes?.['h' + h]?.display?.gross;
        const gross = parseFloat(grossRaw);
        const par = parMap[h];
        const diffDisplay = toParDisplay(isNaN(gross) ? null : gross, par);
        const diffStyle = diffDisplay.startsWith('+') ? 'color:var(--danger);'
          : (diffDisplay.startsWith('-') ? 'color:var(--success);' : '');
        scoreRowsHtml += `
          <div class="maListRow maListRow--static" style="font-size:var(--labelTextSize);">
            <span class="maListRow__col" style="flex:1 1 auto;">Hole ${h}</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 44px;">${esc(par ?? '—')}</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 56px;">${esc(isNaN(gross) ? '—' : gross)}</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 44px;${diffStyle}">${esc(diffDisplay)}</span>
          </div>`;
      });
    }

    const isBlocked = !!blockerMessage;

    _overlay.innerHTML = `
      <section class="maModal" style="max-width:400px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">${esc(playerName)}</div>
            <div class="maModal__subtitle">Confirm GHIN posting</div>
          </div>
          <button id="btnGhinClose" class="iconBtn btnPrimary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="maModal__controls">
          <div style="font-size:var(--fieldValueSize); font-weight:700; color:var(--ink);">${esc(gameTitle)}</div>
          <div style="font-size:var(--fieldValueSize); font-weight:700; color:var(--ink); margin-top:2px;">${esc(courseTeeLine)}</div>
          <div style="display:flex; justify-content:space-between; margin-top:var(--spaceMd); padding:10px; background:rgba(0,0,0,0.04); border-radius:8px;">
            <div class="maPillKV"><span class="maLabelLg">OUT</span><span class="maValueLg">${esc(scoreOut)}</span></div>
            <div class="maPillKV"><span class="maLabelLg">IN</span><span class="maValueLg">${esc(scoreIn)}</span></div>
            <div class="maPillKV"><span class="maLabelLg">TOTAL</span><span class="maValueLg">${esc(scoreTot)}</span></div>
          </div>
          ${showNineTabs ? `
          <div class="maSeg" style="margin-top:var(--spaceSm);">
            <button type="button" class="maSegBtn ${_activeNine === 'front' ? 'is-active' : ''}" data-nine="front">Front nine</button>
            <button type="button" class="maSegBtn ${_activeNine === 'back' ? 'is-active' : ''}" data-nine="back">Back nine</button>
          </div>` : ''}
        </div>
        <div class="maModal__body maModal__body--flush">
          <div class="maListRow maListRow--static" style="font-size:12px; font-weight:900;">
            <span class="maListRow__col" style="flex:1 1 auto;">Hole</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 44px;">Par</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 56px;">Gross</span>
            <span class="maListRow__col maListRow__col--right" style="flex:0 0 44px;">+/-</span>
          </div>
          ${scoreRowsHtml || '<div class="maEmptyState">No score data available.</div>'}
        </div>
        ${isBlocked ? `
          <div class="maInlineStatus status-warn" style="padding:12px; font-size:13px; font-weight:700; text-align:center; border-top:1px solid rgba(0,0,0,0.1);">
            ${esc(blockerMessage)}
          </div>` : ''}
        <footer class="maModal__ftr">
          <button id="btnGhinCancel" class="maModalFtr__btn maModalFtr__btn--cancel" type="button">Cancel</button>
          <button id="btnGhinConfirm" class="maModalFtr__btn maModalFtr__btn--confirm" type="button"
            ${isBlocked ? 'disabled' : ''}>
            Post to GHIN
          </button>
        </footer>
      </section>
    `;

    _overlay.classList.add("is-open");
    document.documentElement.classList.add("maOverlayOpen");

    _overlay.querySelector('#btnGhinClose').onclick = close;
    _overlay.querySelector('#btnGhinCancel').onclick = close;
    _overlay.querySelector('#btnGhinConfirm').onclick = executePost;
    _overlay.querySelectorAll('[data-nine]').forEach((btn) => {
      btn.onclick = () => {
        _activeNine = btn.dataset.nine;
        renderModal(payload, blockerMessage);
      };
    });
  }

  async function executePost() {
    const btn = _overlay.querySelector('#btnGhinConfirm');
    btn.disabled = true;
    btn.textContent = "Posting...";

    try {
      const base = (MA.paths && MA.paths.apiGHIN) ? MA.paths.apiGHIN : "/api/GHIN";
      const res = await MA.postJson(`${base}/post_score.php`, { ggid: _config.ggid });
      if (res && res.ok) {
        // Modal is still open at this exact point — close() hasn't run
        // yet — so this needs to route correctly if the timing ever
        // changes, not rely on close() happening to run right after.
        if (MA.ui && typeof MA.ui.notify === 'function') MA.ui.notify("Score posted to GHIN successfully!", "success");
        else if (typeof MA.setStatus === 'function') MA.setStatus("Score posted to GHIN successfully!", "success");
        close();
        if (typeof _config.onPosted === 'function') _config.onPosted(res);
      } else {
        // Modal does NOT close here — the button just re-enables — so a
        // direct MA.setStatus() call was permanently invisible behind
        // the still-open modal, not just briefly. Real bug, not timing.
        if (MA.ui && typeof MA.ui.notify === 'function') MA.ui.notify(res.message || "Failed to post score.", "error");
        else if (typeof MA.setStatus === 'function') MA.setStatus(res.message || "Failed to post score.", "error");
        btn.disabled = false;
        btn.textContent = "Post to GHIN";
      }
    } catch (err) {
      if (MA.ui && typeof MA.ui.notify === 'function') MA.ui.notify("An error occurred while posting.", "error");
      else if (typeof MA.setStatus === 'function') MA.setStatus("An error occurred while posting.", "error");
      close();
    }
  }

  function close() {
    if (_overlay) {
      _overlay.classList.remove("is-open");
      _overlay.innerHTML = "";
    }
    document.documentElement.classList.remove("maOverlayOpen");
  }

  MA.ghinPostScores.open = open;
  global.MA = MA;
})(window);