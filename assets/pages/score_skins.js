/* /assets/pages/score_skins.js */
(function(){
  'use strict';
  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || {};
  const payload = init.scorecards || {};
  const game = init.game || {};

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function formatDate(s){
    if(!s) return '';
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(...s.split('-').map((n,i)=> i===1 ? n-1 : n)) : new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function applyChrome(){
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');
    if (chrome.setHeaderLines) chrome.setHeaderLines(['Hole Champions', init.header?.title || 'Skins', subtitle]);
    if (chrome.setBottomNav) {
      chrome.setBottomNav({
        visible: ['home', 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoreskins'],
        active: 'skins',
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function renderSkins(){
    const tbody = document.getElementById('frmHoleChampList');
    if (!tbody) return;

    // Flatten players from all group cards
    const players = [];
    (payload.rows || []).forEach(group => {
      (group.players || []).forEach(p => players.push(p));
    });

    const holesStr = String(game.dbGames_Holes || 'All 18');
    let start = 1, end = 18;
    if (holesStr === 'F9') end = 9;
    if (holesStr === 'B9') start = 10;

    let html = '';
    for (let h = start; h <= end; h++) {
      let par = '—';
      const grossList = [];
      const netList = [];

      players.forEach(p => {
        const holeKey = 'h' + h;
        const details = p.holes?.[holeKey];
        if (!details) return;

        if (par === '—' && details.par) par = details.par;

        const grossScore = parseFloat(details.display?.gross);
        if (!isNaN(grossScore)) {
          grossList.push({ name: p.playerName, score: grossScore });
          
          // Net calculation: gross - 0.5 * handicap dots
          const dots = parseFloat(details.strokeMarks || 0);
          const netValue = grossScore - (0.5 * dots);
          netList.push({ name: p.playerName, score: netValue });
        }
      });

      const bestGross = findChampion(grossList, false);
      const bestNet = findChampion(netList, true);

      html += `<tr>
        <td class="scName">Hole ${h} <span class="scPHC" style="float:right;">Par ${par}</span></td>
        <td class="scMetaCol" style="text-align:center;">${bestGross}</td>
        <td class="scMetaCol" style="text-align:center;">${bestNet}</td>
      </tr>`;
    }
    tbody.innerHTML = html;
  }

  function findChampion(list, isNet) {
    if (!list.length) return '—';
    
    const min = Math.min(...list.map(i => i.score));
    const tied = list.filter(i => i.score === min);
    const displayScore = isNet ? min.toFixed(1) : Math.floor(min);

    if (tied.length === 1) {
      // Extract last name for cleaner grid fit
      const fullName = tied[0].name || '';
      const parts = fullName.split(/\s+/);
      const displayName = parts[parts.length - 1] || fullName;
      return `<strong>${esc(displayName)} (${displayScore})</strong>`;
    } else {
      // Tie feedback per refinement
      return `<span class="scTied">${tied.length} Tied ${displayScore}</span>`;
    }
  }

  function initialize(){ applyChrome(); renderSkins(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();