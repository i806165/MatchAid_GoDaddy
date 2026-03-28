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
    if(!state.cardStates[groupId]) state.cardStates[groupId] = { expanded:true, teamExpanded:false, colsExpanded:false, furledSegments: {} };
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

    const activeNav =
        state.mode === 'player' ? 'scorecardPlayer' :
        state.mode === 'group'  ? 'scorecardGroup'  :
        'scorecardGame';
        
    if (chrome.setBottomNav) {
      chrome.setBottomNav({
        visible: ['home', 'scoreentry', 'scorecardPlayer', 'scorecardGroup', 'scorecardGame'],
        active: activeNav,
        onNavigate: (id) => MA.routerGo?.(id)
      });
    }
  }

  function renderControls(){
    if(!dom.controls) return;
    const supportsPoints = !!payload.meta?.supportsPoints;
    const icon = state.globalExpanded ? 
      `<svg viewBox="0 0 24 24" class="scIcon"><path d="M19 13H5v-2h14v2z"/></svg>` : 
      `<svg viewBox="0 0 24 24" class="scIcon"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;

    const modes = [ ['gross','Gross'], ['net','Net'], ['diff','Diff'] ].concat(supportsPoints ? [['points','Points']] : []);
    dom.controls.innerHTML = `<div class="scBrowserControls">
      <div class="scBrowserControls__group">
        <button id="scGlobalToggle" class="scCtlBtn scCtlBtn--icon" type="button" title="Toggle All Cards">${icon}</button>
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
    const isCompact = !cardState.colsExpanded;
    const classes = ['scMeta', 'scMetaCol'];
    if (key !== '9c') classes.push('scMetaCol--minor');
    if (isCompact) classes.push('is-compact');
    
    let val = '';
    if (options.isHeader) {
      if (key === '9a') val = 'Out'; else if (key === '9b') val = 'In'; else if (key === '9c') val = 'Tot';
      else val = 'S' + (key.charCodeAt(1) - 96);
    } else {
      val = rowData[key] ?? rowData.cells?.[key] ?? '';
      if (options.isPlayer) {
        const pk = (key === '9a' ? 'out' : (key === '9b' ? 'in' : (key === '9c' ? 'tot' : '')));
        if (pk) val = totalForPlayer(rowData, pk);
      }
    }
    const tag = options.isHeader ? 'th' : 'td';
    const dSeg = (key !== '9c') ? `data-segment="${segmentId}"` : '';
    return `<${tag} class="${classes.join(' ')}" ${dSeg}>${esc(val)}</${tag}>`;
  }

  function renderUnifiedRow(cardState, rowData, options = {}) {
    const seg = getSegmentConfig();
    let html = '';
    
    const numSegments = Math.ceil((seg.end - seg.start + 1) / seg.size);

    for (let i = 0; i < numSegments; i++) {
      const currentStart = seg.start + (i * seg.size);
      const currentEnd = Math.min(currentStart + seg.size - 1, seg.end);
      const sId = 's' + Math.ceil(currentStart / seg.size); const furled = cardState.furledSegments[sId];
      for (let h = currentStart; h <= currentEnd; h++) {
        if (options.isHeader) html += `<th class="${furled ? 'is-furled' : ''}">${h}</th>`;
        else if (options.isCourse) html += `<td class="${furled ? 'is-furled' : ''}">${esc(rowData['h'+h] ?? '')}</td>`;
        else if (options.isPlayer) html += renderPlayerCell(rowData, h, false, cardState);
        else if (options.isTotal) html += renderPlayerCell(rowData, h, true, cardState);
        else if (options.isStroke) html += `<td class="${furled ? 'is-furled' : ''}">${esc(String(rowData.holes?.['h'+h]?.strokeMarks || ''))}</td>`;
      }
      // Map segment index to appropriate data key (a, b, c...)
      const key = seg.prefix + String.fromCharCode(97 + (Math.ceil(currentStart / seg.size) - 1));
      html += renderSummaryCell(cardState, rowData, key, sId, options);
    }
    if (seg.hasTot) html += renderSummaryCell(cardState, rowData, '9c', 'tot', options);
    return html;
  }

  function buildCourseRows(courseRows, cardState){
    return (courseRows || []).map((r)=>{
      return `<tr><td class="scName">${esc(r.label)}${r.tee && !['Par','HCP'].includes(r.label) ? ' — ' + esc(r.tee) : ''}</td>
        ${renderUnifiedRow(cardState, r, { isCourse: true })}
      </tr>`;
    }).join('');
  }

  function valueForCell(cell){ return cell?.display?.[state.valueMode] ?? ''; }

  function totalForPlayer(player, key){ return player?.totals?.[state.valueMode]?.[key] ?? ''; }

  function renderPlayerRows(players, cardState){
    return (players || []).map((p)=>{
      const main = `<tr><td class="scName"><div class="scPLine1">${esc(p.playerName)} <span class="scPHC">${esc(p.playerHC ? '('+p.playerHC+')' : '')}</span></div><div class="scPLine2">${esc(p.tee || '')}</div></td>${renderUnifiedRow(cardState, p, { isPlayer: true, isPlayerRow: true })}</tr>`;
      const detail = `<tr class="scDetailRow ${cardState.teamExpanded ? '' : 'is-hidden'}"><td class="scName">Stroke Marks</td>
        ${renderUnifiedRow(cardState, p, { isStroke: true })}
      </tr>`;
      return main + detail;
    }).join('');
  }

  function renderPlayerCell(player, holeNumber, isTotal = false, cardState = {}){
    const furled = cardState.furledSegments?.[getSegmentForHole(holeNumber)];
    if (isTotal) {
      return `<td class="${furled ? 'is-furled' : ''}"><div class="scCell scCell--total"><span class="scCellVal">${esc(player?.['h'+holeNumber] ?? '')}</span></div></td>`;
    }
    const cell = player?.holes?.['h'+holeNumber] || {};
    const classes = ['scCell'];
    if (cell.declared) classes.push('scCell--declared');
    if (cell.shape) classes.push('scCell--' + cell.shape);
    return `<td class="${furled ? 'is-furled' : ''}"><div class="${classes.join(' ')}"><span class="scCellVal">${esc(valueForCell(cell))}</span>${cell.strokeMarks ? `<span class="scCellMarks">${esc(String(cell.strokeMarks))}</span>` : ''}</div></td>`;
  }

  function renderTotalRows(totals, cardState){
    return (totals || []).map(row => {
      return `<tr class="scTotalRow">
        <td class="scName" data-action="toggle-all-segments">${esc(row.label)}</td>
        ${renderUnifiedRow(cardState, row.cells, { isTotal: true })}
      </tr>`;
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
    
    const title = row.pairingID ? `Pairing ${row.pairingID}` : (row.flightID ? `Match ${row.flightID}` : `Group ${row.groupId}`);
    return `${title}: ${names}`;
  }

  function renderCard(row){
    const gid = row.groupId || row.pairingID || row.flightID || 'row';
    const cardState = ensureCardState(gid);

    const title = state.mode === 'player'
      ? ((row.players && row.players[0]?.playerName) || 'Player Scorecard')
      : (row.pairingID ? `Pairing ${row.pairingID}` : (row.flightID ? `Match ${row.flightID}` : `Group ${row.groupId}`));
    
    const headerText = [title, row.teeTime].filter(Boolean).join(' • ');
    const summaryTitle = getCardSummaryTitle(row);

    const iconMinus = `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`;
    const iconPlus = `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;

    return `<section class="scGroupCard ${cardState.expanded ? '' : 'is-collapsed'}" data-groupid="${esc(gid)}">
      <!-- Expanded Header -->
      <div class="scGroupCard__hdr scGroupCard__hdr--expanded">
        <div class="scGroupCard__titleRow">
          <button class="scToggleBtn" type="button" data-card-toggle="${esc(gid)}" title="Collapse Card">${iconMinus}</button>
          <div class="scGroupCard__title">${esc(headerText)}</div>
        </div>
        <div class="scGroupCard__actions">
          <button type="button" class="scMiniBtn" data-cols-toggle="${esc(gid)}">${cardState.colsExpanded ? 'Expand' : 'Compact'}</button>
        </div>
      </div>

      <!-- Collapsed Header -->
      <div class="scGroupCard__hdr scGroupCard__hdr--collapsed">
        <div class="scGroupCard__titleRow">
          <button class="scToggleBtn" type="button" data-card-toggle="${esc(gid)}" title="Expand Card">${iconPlus}</button>
          <div class="scGroupCard__title">${esc(summaryTitle)}</div>
        </div>
      </div>

      <div class="scGroupCard__body">
        <div class="scGroup scDenseA"><table class="scTable ${cardState.colsExpanded ? '' : 'scTable--compact'}" role="table" aria-label="scorecard">${renderHeaderRow(cardState)}<tbody>${buildCourseRows(row.courseInfo, cardState)}${renderPlayerRows(row.players, cardState)}${renderTotalRows(row.columnTotals, cardState)}</tbody></table></div>
      </div>
    </section>`;
  }

  function bindCardActions(){
    dom.host.querySelectorAll('[data-card-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.cardToggle); s.expanded = !s.expanded; renderBody(); }));
    dom.host.querySelectorAll('[data-cols-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.colsToggle); s.colsExpanded = !s.colsExpanded; renderBody(); }));

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
          const allHoles = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
          const segments = new Set(allHoles.map(getSegmentForHole));
          const currentlyAnyFurled = Object.values(s.furledSegments).some(v => v === true);
          
          segments.forEach(segId => {
            s.furledSegments[segId] = !currentlyAnyFurled;
          });
          const cfg = getSegmentConfig();
          const segs = []; for(let i=1; i<=(18/cfg.size); i++) segs.push('s'+i);
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
