/* /assets/pages/score_home.js */
(function() {
  'use strict';
  const MA = window.MA || {};
  const el = {
    playerKey: document.getElementById('shPlayerKey'),
    btnLaunch: document.getElementById('shBtnLaunch'),
    launchCard: document.getElementById('shLaunchCard'),
    scorerCard: document.getElementById('shScorerCard'),
    scorerChips: document.getElementById('shScorerChips'),
    gatingMsg: document.getElementById('shGatingMsg')
  };

  async function onLaunch() {
    const key = el.playerKey.value.trim().toUpperCase();
    if (!key) return MA.setStatus('Please enter a ScoreCard ID.', 'warn');

    try {
      MA.setStatus('Validating...', 'info');
      const res = await MA.postJson('/api/score_entry/score_home.php', { playerKey: key });
      if (!res.ok) throw new Error(res.message);

      // Check Game Day Gating (Commented logic per request)
      /*
      if (!res.payload.isGameDay) {
        el.launchCard.classList.add('isHidden');
        el.gatingMsg.classList.remove('isHidden');
        return;
      }
      */

      renderScorers(res.payload.players);
      el.launchCard.classList.add('isHidden');
      el.scorerCard.classList.remove('isHidden');
      MA.setStatus('Ready.', 'success');
    } catch (e) { MA.setStatus(e.message, 'error'); }
  }

  function renderScorers(players) {
    el.scorerChips.innerHTML = '';
    players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'maChoiceChip';
      btn.textContent = p.dbPlayers_Name;
      btn.onclick = async () => {
        await MA.postJson('/api/score_entry/setScorerContext.php', { ghin: p.dbPlayers_PlayerGHIN });
        window.location.href = '/app/score_entry/scoreentry.php';
      };
      el.scorerChips.appendChild(btn);
    });
  }

  el.btnLaunch.onclick = onLaunch;
  el.playerKey.onkeydown = (e) => { if (e.key === 'Enter') onLaunch(); };
})();