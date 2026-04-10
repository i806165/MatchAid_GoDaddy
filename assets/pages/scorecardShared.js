/* /assets/pages/scorecardShared.js */
(function(){
  'use strict';
  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__INIT__ || window.__MA_INIT__ || {};
  const payload = init.scorecards || {};
  const game = init.game || {};

  const state = {
    mode: String(init.mode || payload.mode || 'game'),
    valueMode: String(payload.meta?.defaultValueMode || 'gross'),
    globalExpanded: true,
    cardStates: {},
  };

  const dom = {
    controls: document.getElementById('scControls'),
    host: document.getElementById('scHost'),
    empty: document.getElementById('scEmpty'),
  };

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function formatDate(s){
    if(!s) return '';
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(...s.split('-').map((n,i)=> i===1 ? n-1 : n)) : new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }
  function ensureCardState(groupId){
    if(!state.cardStates[groupId]) state.cardStates[groupId] = { expanded:true, teamExpanded:false, furledSegments: {} };
    return state.cardStates[groupId];
  }
  function activeRows(){ return Array.isArray(payload.rows) ? payload.rows : []; }

  function getSegmentForHole(h){
    const seg = String(game.dbGames_Segments || '9');
    if(seg === 'None') return 'tot';
    const size = parseInt(seg, 10);
    return 's' + Math.ceil(h / size);
  }

  function getSegmentConfig(){
    const segStr = String(game.dbGames_Segments || '9');
    const holesStr = String(game.dbGames_Holes || 'All 18');
    const size = (segStr === 'None') ? 18 : parseInt(segStr, 10);
    const prefix = (size === 18) ? '9' : String(size);
    
    let start = 1, end = 18;
    if (holesStr === 'F9') end = 9;
    if (holesStr === 'B9') start = 10;

    return { size, prefix, hasTot: (size === 9 && holesStr === 'All 18'), start, end };
  }

  function applyChrome(){
    const subtitle = init.header?.subtitle || [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');
    // If subtitle exists, it usually contains play date. Let's make it richer
    const chromeSubtitle = [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');

    if (chrome.setHeaderLines) chrome.setHeaderLines(['Scorecard', init.header?.title || 'Scorecards', subtitle]);

    if (chrome.setActions) {
      chrome.setActions({
        left: { show: state.mode === 'player', label: 'Actions', onClick: openActionsMenu },
        right: { show: false }
      });
    }

    const activeNav =
        state.mode === 'player' ? 'scorecardPlayer' :
        state.mode === 'group'  ? 'scorecardGroup'  :
        'scorecardGame';
        
        
    if (chrome.setBottomNav) {
      const portal = init.portal || init.payload?.portal || "";
      const homeRoute = (portal === "ADMIN PORTAL") ? "admin" 
                      : (portal === "PLAYER PORTAL" ? "player" : "home");

      chrome.setBottomNav({
        visible: [homeRoute, 'scoreentry', 'scorecardPlayer', 'scorecardGame', 'scoresummary', 'scoreskins'],
        active: activeNav,
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;

    const items = [];
    const rows = activeRows();
    if (state.mode === 'player') {
      items.push({ 
        label: 'Post to GHIN', 
        action: () => MA.ghinPostScores.open({ 
          ggid: game.dbGames_GGID,
          onPosted: (res) => {
            const p = rows[0]?.players?.[0];
            if (p) p.dbPlayers_GHINPostID = res.ghinPostId;
            applyChrome();
          }
        })
      });
    }

    if (items.length) {
      MA.ui.openActionsMenu("Scorecard Actions", items);
    }
  }

  function renderControls(){
    if(!dom.controls) return;
    const supportsPoints = !!payload.meta?.supportsPoints;
    const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    const icon = state.globalExpanded ? iconMinus : iconPlus;

    const modes = [ 
      ['gross','Gross'], 
      ['net','Net'], 
      ['grossDiff','Gross +/-'], 
      ['netDiff', 'Net +/-'] 
    ].concat(supportsPoints ? [['points','Points']] : []);
    dom.controls.innerHTML = `<div class="scBrowserControls">
      <div class="scBrowserControls__group">
        <button id="scGlobalToggle" class="iconBtn btnSecondary" type="button" title="Toggle All Cards">${icon}</button>
        ${modes.map(([key,label]) => `<button class="scCtlBtn ${state.valueMode===key?'is-active':''}" type="button" data-mode="${key}">${label}</button>`).join('')}
      </div>
      <div class="scPageSummary"><span>${esc(init.header?.title || '')}</span><span>${esc(game.dbGames_GameFormat || '')} ${esc(game.dbGames_ScoringMethod || '')}</span></div>
    </div>`;

    document.getElementById('scGlobalToggle')?.addEventListener('click', toggleAllCards);
    dom.controls.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { state.valueMode = btn.dataset.mode; renderBody(); renderControls(); }));
  }

  function toggleAllCards(){
    state.globalExpanded = !state.globalExpanded;
    activeRows().forEach(row => {
      const s = ensureCardState(row.groupId || row.pairingID || row.flightID || 'row');
      s.expanded = state.globalExpanded;
    });
    renderBody();
    renderControls();
  }

  function renderSummaryCell(cardState, rowData, key, segmentId, options = {}) {
    const classes = ['scMeta', 'scMetaCol'];
    if (key !== '9c') classes.push('scMetaCol--minor');
    
    let val = '';
    if (options.isHeader) {
      if (key === '9a') val = 'Out'; 
      else if (key === '9b') val = 'In'; 
      else if (key === '9c') val = 'Tot';
      else val = 'S' + (key.charCodeAt(1) - 96);
    } else {
      if (options.isPlayer) {
        val = totalForPlayer(rowData, key);
      } else {
        const cell = rowData[key] ?? rowData.cells?.[key];

        let summaryMode = state.valueMode;
        if (options.isTotal) {
          if (summaryMode === 'gross') summaryMode = 'grossDiff';
          if (summaryMode === 'net') summaryMode = 'netDiff';
        }

        val = (cell && typeof cell === 'object') ? (cell.display?.[summaryMode] ?? '-') : (cell ?? '-');
      }
    }
    const tag = options.isHeader ? 'th' : 'td';
    const dSeg = (key !== '9c') ? `data-segment="${segmentId}"` : '';
    return `<${tag} class="${classes.join(' ')}" ${dSeg}>${esc(val)}</${tag}>`;
  }

  function renderUnifiedRow(cardState, rowData, options = {}) {
    const seg = getSegmentConfig();
    let html = '';

    for (let h = seg.start; h <= seg.end; h++) {
      const sId = getSegmentForHole(h);
      const furled = cardState.furledSegments[sId];

      if (options.isHeader) html += `<th class="${furled ? 'is-furled' : ''}">${h}</th>`;
      else if (options.isCourse) html += `<td class="${furled ? 'is-furled' : ''}">${esc(rowData['h'+h] ?? '')}</td>`;
      else if (options.isPlayer) html += renderPlayerCell(rowData, h, false, cardState);
      else if (options.isTotal) html += renderPlayerCell(rowData, h, true, cardState);
      else if (options.isStroke) html += `<td class="${furled ? 'is-furled' : ''}">${esc(String(rowData.holes?.['h'+h]?.strokeMarks || ''))}</td>`;

      // If at segment boundary or end of range, insert summary anchor
      const isSegEnd = (h % seg.size === 0);
      const isRangeEnd = (h === seg.end);

      if (isSegEnd || isRangeEnd) {
        const segIndex = Math.ceil(h / seg.size);
        let key = (seg.size === 18 ? '9' : String(seg.size)) + String.fromCharCode(96 + segIndex);
        if (seg.size === 18 && isRangeEnd) key = '9c';
        html += renderSummaryCell(cardState, rowData, key, sId, options);
      }
    }
    if (seg.hasTot) html += renderSummaryCell(cardState, rowData, '9c', 'tot', options);
    return html;
  }

  function buildCourseRows(courseRows, cardState){
    return (courseRows || []).map((r)=>{
      return `<tr><td class="scName" data-action="toggle-all-segments">${esc(r.label)}${r.tee && !['Par','HCP'].includes(r.label) ? ' — ' + esc(r.tee) : ''}</td>
        ${renderUnifiedRow(cardState, r, { isCourse: true })}
      </tr>`;
    }).join('');
  }

  function valueForCell(cell){ return cell?.display?.[state.valueMode] ?? ''; }

  function totalForPlayer(player, key){ return player?.totals?.[state.valueMode]?.[key] ?? ''; }

  function groupPlayersByPairing(players){
  const groups = [];
  let currentPairingId = null;
  let currentPlayers = [];

  (players || []).forEach((p) => {
    const pairingId = String(p.dbPlayers_PairingID || p.pairingID || '').trim() || '000';

    if (currentPairingId === null) {
      currentPairingId = pairingId;
    }

    if (pairingId !== currentPairingId) {
      groups.push({ pairingId: currentPairingId, players: currentPlayers });
      currentPairingId = pairingId;
      currentPlayers = [];
    }

    currentPlayers.push(p);
  });

  if (currentPlayers.length) {
    groups.push({ pairingId: currentPairingId, players: currentPlayers });
  }

  return groups;
}

function totalsForPairing(totals, pairingId){
  const needle = `PAIR ${String(pairingId).trim()}`;
  return (totals || []).filter(row => String(row.label || '').includes(needle));
}

function renderPairingBlock(pairingId, players, totals, cardState){
  const playerHtml = renderPlayerRows(players, cardState);
  if (state.mode === 'player') return playerHtml;

  const pairingTotals = totalsForPairing(totals, pairingId);
  const totalsHtml = renderTotalRows(pairingTotals, cardState);

  return playerHtml + totalsHtml;
}


function renderPlayerRows(players, cardState){
  return (players || []).map((p)=>{
    const main = `<tr><td class="scName" data-action="toggle-all-segments"><div class="scPLine1">${esc(p.playerName)} <span class="scPHC">${esc(p.playerHC ? '('+p.playerHC+')' : '')}</span></div><div class="scPLine2">${esc(p.tee || '')}</div></td>${renderUnifiedRow(cardState, p, { isPlayer: true, isPlayerRow: true })}</tr>`;
    const detail = `<tr class="scDetailRow ${cardState.teamExpanded ? '' : 'is-hidden'}"><td class="scName" data-action="toggle-all-segments">Stroke Marks</td>
      ${renderUnifiedRow(cardState, p, { isStroke: true })}
    </tr>`;
    return main + detail;
  }).join('');
}

  function renderPlayerCell(player, holeNumber, isTotal = false, cardState = {}){
    const furled = cardState.furledSegments?.[getSegmentForHole(holeNumber)];
    if (isTotal) {
      const cell = player?.['h'+holeNumber];

      let totalMode = state.valueMode;
      if (totalMode === 'gross') totalMode = 'grossDiff';
      if (totalMode === 'net') totalMode = 'netDiff';

      const val = (cell && typeof cell === 'object') ? (cell.display?.[totalMode] ?? '-') : (cell ?? '-');
      return `<td class="${furled ? 'is-furled' : ''}"><div class="scCell scCell--total"><span class="scCellVal">${esc(val)}</span></div></td>`;
    }
    const cell = player?.holes?.['h'+holeNumber] || {};
    const classes = ['scCell'];
    if (cell.declared) classes.push('scCell--declared');
    
    let sm = state.valueMode;
    if (sm === 'grossDiff') sm = 'gross';
    if (sm === 'netDiff') sm = 'net';
    const shape = cell.shapes?.[sm] || cell.shape;

    if (shape && shape !== 'par') classes.push('scCell--' + shape);
    return `<td class="${furled ? 'is-furled' : ''}"><div class="${classes.join(' ')}"><span class="scCellVal">${esc(valueForCell(cell))}</span>${cell.strokeMarks ? `<span class="scCellMarks">${esc(String(cell.strokeMarks))}</span>` : ''}</div></td>`;
  }

  function renderTotalRows(totals, cardState){
    const kpiLabel = 
        state.valueMode === 'gross' ? 'GROSS' :
        state.valueMode === 'net'   ? 'NET' :
        state.valueMode === 'grossDiff' ? 'GROSS +/-' :
        state.valueMode === 'netDiff' ? 'NET +/-' :
        state.valueMode === 'points' ? 'POINTS' : '';

    return (totals || []).map(row => {
      const label = `${row.label} ${kpiLabel}`.trim();
      return `<tr class="scTotalRow">
        <td class="scName" data-action="toggle-all-segments">${esc(label)}</td>
        ${renderUnifiedRow(cardState, row.cells, { isTotal: true })}
      </tr>`;
    }).join('');
  }

  function renderPlayerAndTotalRowsByPairing(row, cardState){
    const groups = groupPlayersByPairing(row.players || []);
    return groups.map(group => {
      return renderPairingBlock(group.pairingId, group.players, row.columnTotals || [], cardState);
    }).join('');
  }

  function renderHeaderRow(cardState){
    return `<thead><tr><th class="scName" data-action="toggle-all-segments">HOLE</th>${renderUnifiedRow(cardState, {}, { isHeader: true })}</tr></thead>`;
  }

  function getCardSummaryTitle(row){
    const names = (row.players || []).map(p => {
      const parts = String(p.playerName || '').split(/\s+/);
      return parts[parts.length - 1] || '';
    }).filter(Boolean).join(' • ');

    const playerKey = row.gameHeader?.playerKey || row.groupId || '';
    const pairingIDs = Array.isArray(row.pairingIDs) ? row.pairingIDs.filter(Boolean) : [];
    const flightIDs = Array.isArray(row.flightIDs) ? row.flightIDs.filter(Boolean) : [];
    const isPairPair = String(row.gameHeader?.dbGames_Competition || '').trim() === 'PairPair';

    const parts = [];
    if (playerKey) parts.push(`ScoreCard ${playerKey}`);
    if (isPairPair && flightIDs.length) parts.push(`Match ${flightIDs.join(', ')}`);
    if (pairingIDs.length) parts.push(`Pairings ${pairingIDs.join(', ')}`);

    return `${parts.join(' • ')}: ${names}`;
  }

  function renderCard(row){
    const gid = row.groupId || row.pairingID || row.flightID || 'row';
    const cardState = ensureCardState(gid);

    const playerKey = row.gameHeader?.playerKey || row.groupId || '';
    const pairingIDs = Array.isArray(row.pairingIDs) ? row.pairingIDs.filter(Boolean) : [];
    const flightIDs = Array.isArray(row.flightIDs) ? row.flightIDs.filter(Boolean) : [];
    const isPairPair = String(row.gameHeader?.dbGames_Competition || '').trim() === 'PairPair';

    const titleParts = [];
    if (state.mode === 'player') {
      titleParts.push((row.players && row.players[0]?.playerName) || 'Player Scorecard');
    } else {
      if (playerKey) titleParts.push(`ScoreCard ${playerKey}`);
      if (isPairPair && flightIDs.length) titleParts.push(`Match ${flightIDs.join(', ')}`);
      if (pairingIDs.length) titleParts.push(`Pairings ${pairingIDs.join(', ')}`);
    }

    const headerText = [...titleParts, row.teeTime].filter(Boolean).join(' • ');
    const summaryTitle = getCardSummaryTitle(row);

    const iconMinus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

    return `<section class="scGroupCard ${cardState.expanded ? '' : 'is-collapsed'}" data-groupid="${esc(gid)}">
      <!-- Expanded Header -->
      <div class="scGroupCard__hdr scGroupCard__hdr--expanded">
        <div class="scGroupCard__titleRow">
          <button class="iconBtn btnSecondary" type="button" data-card-toggle="${esc(gid)}" title="Collapse Card">${iconMinus}</button>
          <div class="scGroupCard__title">${esc(headerText)}</div>
        </div>
      </div>

      <!-- Collapsed Header -->
      <div class="scGroupCard__hdr scGroupCard__hdr--collapsed">
        <div class="scGroupCard__titleRow">
          <button class="iconBtn btnSecondary" type="button" data-card-toggle="${esc(gid)}" title="Expand Card">${iconPlus}</button>
          <div class="scGroupCard__title">${esc(summaryTitle)}</div>
        </div>
      </div>

      <div class="scGroupCard__body">
      <div class="scGroup scDenseA"><table class="scTable" role="table" aria-label="scorecard">${renderHeaderRow(cardState)}<tbody>${buildCourseRows(row.courseInfo, cardState)}${renderPlayerAndTotalRowsByPairing(row, cardState)}</tbody></table></div>
      </div>
    </section>`;
  }

  function bindCardActions(){
    dom.host.querySelectorAll('[data-card-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.cardToggle); s.expanded = !s.expanded; renderBody(); }));

    // Accordion Delegation
    dom.host.querySelectorAll('.scGroupCard').forEach(card => {
      const gid = card.dataset.groupid;
      const s = ensureCardState(gid);

      // Toggle Segment
      card.querySelectorAll('[data-segment]').forEach(th => {
        th.addEventListener('click', () => {
          const segId = th.dataset.segment;
          s.furledSegments[segId] = !s.furledSegments[segId];
          renderBody();
        });
      });

      // Master Accordion Toggle
      card.querySelectorAll('[data-action="toggle-all-segments"]').forEach(el => {
        el.addEventListener('click', () => {
          const cfg = getSegmentConfig();
          const startSeg = Math.ceil(cfg.start / cfg.size);
          const numSegs = Math.ceil((cfg.end - cfg.start + 1) / cfg.size);
          const segs = []; for(let i=0; i<numSegs; i++) segs.push('s' + (startSeg + i));
          
          const anyOn = segs.some(id => s.furledSegments[id]);
          segs.forEach(id => s.furledSegments[id] = !anyOn);
          renderBody();
        });
      });
    });
  }

  function renderBody(){
    const rows = activeRows();
    if(!dom.host) return;
    if(!rows.length){ dom.host.innerHTML = ''; if(dom.empty) dom.empty.style.display='block'; return; }
    if(dom.empty) dom.empty.style.display='none';
    
    dom.host.innerHTML = rows.map(renderCard).join('');
    bindCardActions();
  }

  function initialize(){ applyChrome(); renderControls(); renderBody(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
