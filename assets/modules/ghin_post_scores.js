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
    document.body.appendChild(_overlay);
  }

  async function fetchReviewData(ggid) {
    // Call initScoreCard in player mode to get the review payload
    const res = await fetch(`/api/game_scorecard/initScoreCard.php?mode=player&ggid=${ggid}`);
    const json = await res.json();
    if (!json || !json.ok) throw new Error(json?.message || "Unable to load score summary.");
    return json;
  }

  async function open(config) {
    _config = config || {};
    if (!_config.ggid) return console.error("GHIN Posting: Missing GGID.");

    ensureOverlay();
    if (typeof MA.setStatus === 'function') MA.setStatus("Preparing score review...", "info");

    try {
      const payload = await fetchReviewData(_config.ggid);
      renderModal(payload);
    } catch (e) {
      if (typeof MA.setStatus === 'function') MA.setStatus(e.message, "error");
    }
  }

  function renderModal(payload) {
    const game = payload.game || {};
    const p = payload.scorecards?.rows?.[0]?.players?.[0];
    if (!p) throw new Error("Score summary data is incomplete.");

    const holes = payload.meta?.holes === 'B9' ? Array.from({length:9},(_,i)=>i+10) : Array.from({length:payload.meta?.holes === 'F9' ? 9 : 18},(_,i)=>i+1);
    
    let scoreRowsHtml = '';
    holes.forEach(h => {
      const score = p.holes?.['h' + h]?.display?.gross || '—';
      scoreRowsHtml += `
        <div class="maListRow">
          <div class="maListRow__col">Hole ${h}</div>
          <div class="maListRow__col maListRow__col--right" style="font-weight:800;">${esc(score)}</div>
        </div>`;
    });

    _overlay.innerHTML = `
      <section class="maModal" style="max-width:400px;">
        <header class="maModal__hdr">
          <div class="maModal__titles">
            <div class="maModal__title">Confirm GHIN Posting</div>
            <div class="maModal__subtitle">${esc(game.dbGames_Title)}</div>
          </div>
        </header>
        <div class="maModal__controls">
          <div class="maHelpText" style="margin-bottom:10px;">
            ${esc(game.dbGames_CourseName)} • ${esc(p.tee)}
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <button id="btnGhinCancel" class="btn btnSecondary" type="button">Cancel</button>
            <button id="btnGhinConfirm" class="btn btnPrimary" type="button" style="background:var(--success); color:#fff; border-color:var(--success);">Post to GHIN</button>
          </div>
        </div>
        <div class="maModal__body" style="padding:0;">
          <div class="maListRows">${scoreRowsHtml}</div>
        </div>
      </section>
    `;

    _overlay.classList.add("is-open");
    document.documentElement.classList.add("maOverlayOpen");

    _overlay.querySelector('#btnGhinCancel').onclick = close;
    _overlay.querySelector('#btnGhinConfirm').onclick = executePost;
  }

  async function executePost() {
    const btn = _overlay.querySelector('#btnGhinConfirm');
    btn.disabled = true;
    btn.textContent = "Posting...";

    try {
      const res = await MA.postJson('/api/GHIN/post_score.php', { ggid: _config.ggid });
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