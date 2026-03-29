/* /assets/pages/scorehome.js */
(function() {
  'use strict';
  const MA = window.MA || {};
  const el = {
    playerKey: document.getElementById('shPlayerKey'),
    btnLaunch: document.getElementById('shBtnLaunch'),
    launchCard: document.getElementById('shLaunchCard'),
    scorerCard: document.getElementById('shScorerCard'),
    scorerChips: document.getElementById('shScorerChips')
  };

  async function onLaunch() {
    const key = el.playerKey.value.trim().toUpperCase();
    if (!key) return MA.setStatus('Enter a ScoreCard ID.', 'warn');

    try {
      const res = await MA.postJson('/api/score_home.php', { playerKey: key });
      if (!res.ok) throw new Error(res.message);

      renderScorers(res.payload.players);
      el.launchCard.classList.add('isHidden');
      el.scorerCard.classList.remove('isHidden');
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

  function applyChrome() {
    if (MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({
        visible: ['home', 'player', 'admin'],
        active: '',
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  el.btnLaunch.onclick = onLaunch;
  applyChrome();
})();