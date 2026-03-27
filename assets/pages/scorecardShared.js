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
    if(!state.cardStates[groupId]) state.cardStates[groupId] = { expanded:true, teamExpanded:false, colsExpanded:false };
    return state.cardStates[groupId];
  }
  function activeRows(){ return Array.isArray(payload.rows) ? payload.rows : []; }

  function applyChrome(){
    const subtitle = init.header?.subtitle || [game.dbGames_CourseName, formatDate(game.dbGames_PlayDate)].filter(Boolean).join(' • ');
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
    const modes = [ ['gross','Gross'], ['net','Net'], ['diff','Diff'] ].concat(supportsPoints ? [['points','Points']] : []);
    dom.controls.innerHTML = `<div class="scBrowserControls">
      <div class="scBrowserControls__group">${modes.map(([key,label]) => `<button class="scCtlBtn ${state.valueMode===key?'is-active':''}" type="button" data-mode="${key}">${label}</button>`).join('')}</div>
      <div class="scPageSummary"><span>${esc(init.header?.title || '')}</span><span>${esc(game.dbGames_GameFormat || '')} ${esc(game.dbGames_ScoringMethod || '')}</span></div>
    </div>`;
    dom.controls.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { state.valueMode = btn.dataset.mode; renderBody(); renderControls(); }));
  }

  function buildCourseRows(courseRows, cardState){
    return (courseRows || []).map((r)=>{
      const metaClass = cardState.colsExpanded ? '' : ' is-compact';
      return `<tr><td class="scName">${esc(r.label)}${r.tee && !['Par','HCP'].includes(r.label) ? ' — ' + esc(r.tee) : ''}</td>
        ${holesToCells((h)=> `<td>${esc(r['h'+h] ?? '')}</td>`)}
        <td class="scMeta scMetaCol scMetaCol--minor${metaClass}">${esc(r['9a'] ?? '')}</td>
        ${holesToCells((h)=> h>=10 ? `<td>${esc(r['h'+h] ?? '')}</td>` : '', 10)}
        <td class="scMeta scMetaCol scMetaCol--minor${metaClass}">${esc(r['9b'] ?? '')}</td>
        <td class="scMeta scMetaCol${metaClass}">${esc(r['9c'] ?? '')}</td></tr>`;
    }).join('');
  }

  function holesToCells(cb,start){
    let html=''; const from = start || 1; const to = from===1 ? 9 : 18; for(let h=from; h<=to; h++) html += cb(h); return html;
  }

  function valueForCell(cell){
    const mode = state.valueMode;
    return cell?.display?.[mode] ?? '';
  }

  function totalForPlayer(player, key){ return player?.totals?.[state.valueMode]?.[key] ?? ''; }

  function renderPlayerRows(players, cardState){
    return (players || []).map((p)=>{
      const main = `<tr><td class="scName"><div class="scPLine1">${esc(p.playerName)} <span class="scPHC">${esc(p.playerHC ? '('+p.playerHC+')' : '')}</span></div><div class="scPLine2">${esc(p.tee || '')}</div></td>
        ${holesToCells((h)=> renderPlayerCell(p, h))} <!-- Holes 1-9 -->
        ${renderTotalsCols(totalForPlayer(p,'out'), '', '', cardState)} <!-- Out Total -->
        ${holesToCells((h)=> h>=10 ? renderPlayerCell(p, h) : '', 10)} <!-- Holes 10-18 -->
        ${renderTotalsCols('', totalForPlayer(p,'in'), totalForPlayer(p,'tot'), cardState)} <!-- In and Total -->
      </tr>`;
      const detail = `<tr class="scDetailRow ${cardState.teamExpanded ? '' : 'is-hidden'}"><td class="scName">Stroke Marks</td>
        ${holesToCells((h)=> `<td>${esc(String(p.holes?.['h'+h]?.strokeMarks || ''))}</td>`)} <!-- Holes 1-9 Stroke Marks -->
        ${renderTotalsCols('', '', '', cardState)} <!-- Empty cells for alignment -->
        ${holesToCells((h)=> h>=10 ? `<td>${esc(String(p.holes?.['h'+h]?.strokeMarks || ''))}</td>` : '', 10)} <!-- Holes 10-18 Stroke Marks -->
        ${renderTotalsCols('', '', '', cardState)} <!-- Empty cells for alignment -->
      </tr>`;
      return main + detail;
    }).join('');
  }

  function renderPlayerCell(player, holeNumber){
    const cell = player?.holes?.['h'+holeNumber] || {};
    const classes = ['scCell'];
    if (cell.declared) classes.push('scCell--declared');
    if (cell.shape) classes.push('scCell--' + cell.shape);
    return `<td><div class="${classes.join(' ')}"><span class="scCellVal">${esc(valueForCell(cell))}</span>${cell.strokeMarks ? `<span class="scCellMarks">${esc(String(cell.strokeMarks))}</span>` : ''}</div></td>`;
  }

  function renderTotalsCols(outVal, inVal, totVal, cardState){
    const metaClass = cardState.colsExpanded ? '' : ' is-compact';
    return `<td class="scMeta scMetaCol scMetaCol--minor${metaClass}">${esc(outVal)}</td><td class="scMeta scMetaCol scMetaCol--minor${metaClass}">${esc(inVal)}</td><td class="scMeta scMetaCol${metaClass}">${esc(totVal)}</td>`;
  }

  function renderHeaderRow(cardState){
    const metaClass = cardState.colsExpanded ? '' : ' is-compact';
    return `<thead><tr><th class="scName">HOLE</th>${holesToCells((h)=> `<th>${h}</th>`)}<th class="scMeta scMetaCol scMetaCol--minor${metaClass}">Out</th>${holesToCells((h)=> h>=10 ? `<th>${h}</th>` : '', 10)}<th class="scMeta scMetaCol scMetaCol--minor${metaClass}">In</th><th class="scMeta scMetaCol${metaClass}">Tot</th></tr></thead>`;
  }

  function renderSummaryRow(summary, cardState){
    if (!summary) return '';
    return `<div class="scGroupCard__summary">${esc(summary.label || '')}: ${esc(summary.value || '')}</div>`;
  }

  function renderCard(row){
    const cardState = ensureCardState(row.groupId || row.pairingID || row.flightID || 'row');
    const gh = row.gameHeader || {};
    const title = state.mode === 'player'
      ? ((row.players && row.players[0]?.playerName) || 'Player Scorecard')
      : (row.pairingID ? `Pairing ${row.pairingID}` : (row.flightID ? `Match ${row.flightID}` : `Group ${row.groupId}`));
    const sub = [gh.courseName, formatDate(gh.playDate), row.teeTime].filter(Boolean).join(' • ');
    return `<section class="scGroupCard ${cardState.expanded ? '' : 'is-collapsed'}" data-groupid="${esc(row.groupId || '')}">
      <div class="scGroupCard__hdr">
        <div><div class="scGroupCard__title">${esc(title)}</div><div class="scGroupCard__sub">${esc(sub)}</div></div>
        <div class="scGroupCard__actions">
          <button type="button" class="scMiniBtn" data-card-toggle="${esc(row.groupId || '')}">${cardState.expanded ? 'Collapse Card' : 'Expand Card'}</button>
          <button type="button" class="scMiniBtn" data-team-toggle="${esc(row.groupId || '')}">${cardState.teamExpanded ? 'Hide Detail' : 'Show Detail'}</button>
          <button type="button" class="scMiniBtn" data-cols-toggle="${esc(row.groupId || '')}">${cardState.colsExpanded ? 'Compact Columns' : 'Expand Columns'}</button>
        </div>
      </div>
      ${renderSummaryRow(row.summary, cardState)}
      <div class="scGroupCard__body">
        <div class="scGroup scDenseA"><table class="scTable ${cardState.colsExpanded ? '' : 'scTable--compact'}" role="table" aria-label="scorecard">${renderHeaderRow(cardState)}<tbody>${buildCourseRows(row.courseInfo, cardState)}${renderPlayerRows(row.players, cardState)}</tbody></table></div>
      </div>
    </section>`;
  }

  function bindCardActions(){
    dom.host.querySelectorAll('[data-card-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.cardToggle); s.expanded = !s.expanded; renderBody(); }));
    dom.host.querySelectorAll('[data-team-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.teamToggle); s.teamExpanded = !s.teamExpanded; renderBody(); }));
    dom.host.querySelectorAll('[data-cols-toggle]').forEach((btn)=> btn.addEventListener('click', ()=> { const s = ensureCardState(btn.dataset.colsToggle); s.colsExpanded = !s.colsExpanded; renderBody(); }));
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
