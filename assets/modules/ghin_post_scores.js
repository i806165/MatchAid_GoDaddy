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

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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
    if (!_config.ggid) return console.error("GHIN Posting: Missing GGID.");
    ensureOverlay();

    try {
      if (typeof MA.setStatus === 'function') MA.setStatus("Preparing score review...", "info");
      const payload = await fetchReviewData();
      
      const blocker = getPostingBlocker(payload);
      renderModal(payload, blocker);
    } catch (e) {
      renderModal(null, e.message || "Unable to load score summary.");
    }
  }

  function getPostingBlocker(payload) {
    const p = payload?.scorecards?.rows?.[0]?.players?.[0];
    const userGhin = window.__MA_INIT__?.user?.ghin || window.__INIT__?.user?.ghin;

    // 1. Identity & Data Checks
    if (!userGhin) return "GHIN identity not found. Please log in.";
    if (!p) return "Score summary data is incomplete.";
    if (p.dbPlayers_GHINPostID) return "This round has already been posted to GHIN.";

    // 2. Determine Hole Scope (F9, B9, or 18)
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
    const holes = payload?.meta?.holes === 'B9' ? Array.from({length:9},(_,i)=>i+10) : Array.from({length:payload?.meta?.holes === 'F9' ? 9 : 18},(_,i)=>i+1);
    
    // Extract summary scores from the payload totals
    const scoreOut = p?.totals?.gross?.['9a'] || '—';
    const scoreIn  = p?.totals?.gross?.['9b'] || '—';
    const scoreTot = p?.totals?.gross?.['9c'] || '—';

    let scoreRowsHtml = '';
    if (p) {
      holes.forEach(h => {
        const score = p.holes?.['h' + h]?.display?.gross || '—';
        scoreRowsHtml += `
          <div class="maListRow">
            <div class="maListRow__col">Hole ${h}</div>
            <div class="maListRow__col maListRow__col--right" style="font-weight:800;">${esc(score)}</div>
          </div>`;
      });
    }

    const isBlocked = !!blockerMessage;

    _overlay.innerHTML = `
      <section class="maModal" style="max-width:400px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Confirm GHIN Posting</div>
            <div class="maModal__subtitle">${esc(game.dbGames_Title || "Post Scores")}</div>
          </div>
          <button id="btnGhinClose" class="iconBtn btnPrimary" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </header>
        <div class="maModal__controls">
          <div class="maHelpText" style="margin-bottom:12px; font-weight:700;">
            ${esc(game.dbGames_CourseName)} • ${esc(p?.tee || "No Tee Set")}
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:16px; padding:10px; background:rgba(0,0,0,0.04); border-radius:8px;">
            <div class="maPillKV"><span class="maPillLabel">OUT</span><span class="maPillValue">${esc(scoreOut)}</span></div>
            <div class="maPillKV"><span class="maPillLabel">IN</span><span class="maPillValue">${esc(scoreIn)}</span></div>
            <div class="maPillKV"><span class="maPillLabel">TOTAL</span><span class="maPillValue" style="color:var(--brandColor3);">${esc(scoreTot)}</span></div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button id="btnGhinCancel" class="btn btnPrimary" type="button">Cancel</button>
            <button id="btnGhinConfirm" class="btn btnSecondary" type="button"
              ${isBlocked ? 'disabled' : ''}>
              Post to GHIN
            </button>
          </div>
        </div>
        <div class="maModal__body" style="padding:0;">
          <div class="maListRows">${scoreRowsHtml || '<div class="maEmptyState">No score data available.</div>'}</div>
        </div>
        ${isBlocked ? `
          <footer class="maModal__ftr" style="background:var(--statusWarnBg); color:var(--statusWarnText); padding:12px; font-size:13px; font-weight:700; text-align:center; display:block; border-top:1px solid rgba(0,0,0,0.1);">
            ${esc(blockerMessage)}
          </footer>` : ''}
      </section>
    `;

    _overlay.classList.add("is-open");
    document.documentElement.classList.add("maOverlayOpen");

    _overlay.querySelector('#btnGhinClose').onclick = close;
    _overlay.querySelector('#btnGhinCancel').onclick = close;
    _overlay.querySelector('#btnGhinConfirm').onclick = executePost;
  }

  async function executePost() {
    const btn = _overlay.querySelector('#btnGhinConfirm');
    btn.disabled = true;
    btn.textContent = "Posting...";

    try {
      const base = (MA.paths && MA.paths.apiGHIN) ? MA.paths.apiGHIN : "/api/GHIN";
      const res = await MA.postJson(`${base}/post_score.php`, { ggid: _config.ggid });
      if (res && res.ok) {
        if (typeof MA.setStatus === 'function') MA.setStatus("Score posted to GHIN successfully!", "success");
        close();
        if (typeof _config.onPosted === 'function') _config.onPosted(res);
      } else {
        if (typeof MA.setStatus === 'function') MA.setStatus(res.message || "Failed to post score.", "error");
        btn.disabled = false;
        btn.textContent = "Post to GHIN";
      }
    } catch (err) {
      if (typeof MA.setStatus === 'function') MA.setStatus("An error occurred while posting.", "error");
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