/* /assets/pages/score_skins.js */
(function(){
  'use strict';

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || {};
  const payload = init.scorecards || {};
  const game = init.game || {};

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function formatDate(s){
    if(!s) return '';
    const d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(...s.split('-').map((n, i) => i === 1 ? n - 1 : n))
      : new Date(s);

    if (isNaN(d.getTime())) return String(s);

    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function applyChrome(){
    const subtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)]
      .filter(Boolean)
      .join(' • ');

    if (chrome.setHeaderLines) {
      chrome.setHeaderLines(['Hole Champions', init.header?.title || 'Skins', subtitle]);
    }

    if (chrome.setBottomNav) {
      const portal = init.portal || "";
      const homeRoute = (portal === "ADMIN PORTAL")
        ? "admin"
        : (portal === "PLAYER PORTAL" ? "player" : "home");

      chrome.setBottomNav({
        visible: [homeRoute, 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoresummary', 'scoreskins'],
        active: 'scoreskins',
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function getPlayers(){
    const players = [];
    (payload.rows || []).forEach(group => {
      (group.players || []).forEach(p => players.push(p));
    });
    return players;
  }

  function getHoleWindow(){
    const holesStr = String(game.dbGames_Holes || 'All 18').trim();
    if (holesStr === 'F9') return { start: 1, end: 9, key: 'F9' };
    if (holesStr === 'B9') return { start: 10, end: 18, key: 'B9' };
    return { start: 1, end: 18, key: 'ALL18' };
  }

  function getCardRanges(){
    const holeWindow = getHoleWindow();

    if (holeWindow.key === 'F9') {
      return [{ start: 1, end: 9, title: 'Front 9 Champions' }];
    }

    if (holeWindow.key === 'B9') {
      return [{ start: 10, end: 18, title: 'Back 9 Champions' }];
    }

    return [
      { start: 1, end: 9, title: 'Front 9 Champions' },
      { start: 10, end: 18, title: 'Back 9 Champions' }
    ];
  }

  function computeHoleResult(players, h){
    let par = '—';
    const grossList = [];
    const netList = [];

    players.forEach((p) => {
      const holeKey = 'h' + h;
      const details = p.holes?.[holeKey];
      if (!details) return;

      if (par === '—' && details.par != null && details.par !== '') {
        par = details.par;
      }

      const grossScore = parseFloat(details.display?.gross);
      if (isNaN(grossScore)) return;

      grossList.push({
        name: p.playerName,
        score: grossScore
      });

      const dots = parseFloat(details.strokeMarks || 0);
      const netValue = grossScore - (0.5 * dots);

      netList.push({
        name: p.playerName,
        score: netValue
      });
    });

    return {
      hole: h,
      par,
      grossHtml: findChampion(grossList, false),
      netHtml: findChampion(netList, true)
    };
  }

  function findChampion(list, isNet){
    if (!list.length) return '—';

    const min = Math.min(...list.map(i => i.score));
    const tied = list.filter(i => i.score === min);
    const displayScore = isNet ? min.toFixed(1) : String(Math.floor(min));

    if (tied.length === 1) {
      const fullName = tied[0].name || '';
      const parts = fullName.trim().split(/\s+/);
      const displayName = parts[parts.length - 1] || fullName;
      return `<strong>${esc(displayName)} (${esc(displayScore)})</strong>`;
    }

    return `<span class="scTied">${tied.length} Tied ${esc(displayScore)}</span>`;
  }

  function buildRowsHtml(players, startHole, endHole){
    let html = '';

    for (let h = startHole; h <= endHole; h++) {
      const row = computeHoleResult(players, h);

      html += `
        <tr>
          <td class="scName">
            <span class="scHoleLabel">Hole ${row.hole}</span>
            <span class="scPHC">Par ${esc(row.par)}</span>
          </td>
          <td class="scMetaCol">${row.grossHtml}</td>
          <td class="scMetaCol">${row.netHtml}</td>
        </tr>
      `;
    }

    return html;
  }

  function buildCardHtml(players, range){
    return `
      <section class="maCard scSplitCard" aria-label="${esc(range.title)}">
        <div class="maCard__hdr">
          <div class="maCard__title">${esc(range.title)}</div>
          <div class="scCardNote">Hole-by-hole low gross and net winners.</div>
        </div>

        <div class="maCard__body">
          <table class="scTable">
            <thead>
              <tr>
                <th class="scName">Hole / Par</th>
                <th class="scMeta">Best Gross</th>
                <th class="scMeta">Best Net</th>
              </tr>
            </thead>
            <tbody>
              ${buildRowsHtml(players, range.start, range.end)}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderSkins(){
    const sourceTbody = document.getElementById('frmHoleChampList');
    if (!sourceTbody) return;

    const sourceTable = sourceTbody.closest('table');
    if (!sourceTable) return;

    const sourceCard = sourceTable.closest('.maCard');
    const sourceMount = sourceCard || sourceTable.parentElement;
    if (!sourceMount || !sourceMount.parentNode) return;

    const players = getPlayers();
    const cardRanges = getCardRanges();

    const host = document.createElement('div');
    host.className = 'scCardsGrid';
    host.innerHTML = cardRanges.map(range => buildCardHtml(players, range)).join('');

    sourceMount.parentNode.replaceChild(host, sourceMount);
  }

  function initialize(){
    applyChrome();
    renderSkins();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();