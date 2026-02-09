(function(){
  "use strict";
  const MA = window.MA || {};
  const init = window.__MA_INIT__ || {};

  const state = {
    activeTab: "roster",
    game: init.game || {},
    context: init.context || {},
    players: [],
    favorites: [],
    pendingPlayer: null,
    teeOptions: [],
    selectedTee: null,
  };

  const tabs = [
    { id: "roster", label: "Roster" },
    { id: "self", label: "Self" },
    { id: "favorites", label: "Favorites" },
    { id: "ghin", label: "GHIN" },
    { id: "nonrated", label: "Non-Rated" }
  ];

  const el = {
    tabStrip: document.getElementById("gpTabStrip"),
    controls: document.getElementById("gpTabControls"),
    body: document.getElementById("gpBody"),
    teeOverlay: document.getElementById("gpTeeOverlay"),
    teeRows: document.getElementById("gpTeeRows"),
    teeSave: document.getElementById("gpTeeSave"),
    teeCancel: document.getElementById("gpTeeCancel"),
    teeStatus: document.getElementById("gpTeeStatus"),
  };

  function safe(v){ return v == null ? "" : String(v); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

  async function boot(){
    applyChrome();
    wireModal();
    await refreshPlayers();
    renderTabs();
    render();
  }

  function applyChrome(){
    if (MA.chrome && MA.chrome.setHeaderLines) MA.chrome.setHeaderLines(["ADMIN PORTAL", "Game Players", `GGID ${safe(init.ggid)}`]);
    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        left: { show:true, label:"Back", onClick:()=>MA.routerGo && MA.routerGo("edit") },
        right: { show:false }
      });
    }
    if (MA.chrome && MA.chrome.setBottomNav) {
      MA.chrome.setBottomNav({ visible:["admin","edit","roster","pairings","teetimes","summary"], active:"roster", onNavigate:(id)=>MA.routerGo(id) });
    }
  }

  async function refreshPlayers(){
    const res = await MA.postJson(MA.paths.gamePlayersGet, {});
    if (!res?.ok) throw new Error(res?.message || "Load failed");
    state.players = Array.isArray(res.payload?.players) ? res.payload.players : [];
    state.game = res.payload?.game || state.game;
    state.context = res.payload?.context || state.context;
  }

  async function refreshFavorites(){
    const res = await MA.postJson(MA.paths.favPlayersInit, {});
    state.favorites = Array.isArray(res?.payload?.favorites) ? res.payload.favorites : [];
  }

  function renderTabs(){
    el.tabStrip.innerHTML = tabs.map(t=>`<button class="gpTabBtn ${state.activeTab===t.id?"is-on":""}" data-tab="${t.id}" role="tab">${t.label}</button>`).join("");
    el.tabStrip.querySelectorAll(".gpTabBtn").forEach(btn=>btn.addEventListener("click", async ()=>{
      state.activeTab = btn.dataset.tab;
      if (state.activeTab === "favorites") await refreshFavorites();
      renderTabs();
      render();
    }));
  }

  function render(){
    renderControls();
    renderBody();
  }

  function renderControls(){
    if (state.activeTab === "ghin") {
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnSearchGhin" class="maBtn gpAddBtn" type="button">Add from GHIN</button></div>`;
      document.getElementById("gpBtnSearchGhin").onclick = openGHINSearch;
      return;
    }
    if (state.activeTab === "favorites") {
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnFavoritesPage" class="maBtn gpAddBtn" type="button">Open Favorites</button></div>`;
      document.getElementById("gpBtnFavoritesPage").onclick = () => MA.routerGo("favorites");
      return;
    }
    if (state.activeTab === "nonrated") {
      el.controls.innerHTML = `<div class="maFieldRow">
        <div class="maField"><input id="gpNrFirst" class="maTextInput" placeholder="First name"></div>
        <div class="maField"><input id="gpNrLast" class="maTextInput" placeholder="Last name"></div>
        <div class="maField" style="flex:0 0 78px;"><input id="gpNrHi" class="maTextInput" placeholder="HI"></div>
        <div class="maField" style="flex:0 0 72px;"><select id="gpNrGender" class="maTextInput"><option>M</option><option>F</option></select></div>
        <div class="maField" style="flex:0 0 auto;"><button id="gpNrAdd" class="maBtn gpAddBtn" type="button">Add</button></div>
      </div>`;
      document.getElementById("gpNrAdd").onclick = addNonRated;
      return;
    }
    if (state.activeTab === "self") {
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnAddSelf" class="maBtn gpAddBtn" type="button">Add Me</button></div>`;
      document.getElementById("gpBtnAddSelf").onclick = addSelf;
      return;
    }
    el.controls.innerHTML = `<div class="maFieldRow"><div class="maField"><div class="gpMeta">Tap ♥ on a roster row to jump to Favorites.</div></div></div>`;
  }

  function renderBody(){
    let html = `<section class="gpSection"><div class="gpSection__hdr">Current Roster (${state.players.length})</div><div class="gpRows">`;
    if (!state.players.length) html += `<div class="gpEmpty">No players registered yet.</div>`;
    html += state.players.map(p => {
      const ghin = safe(p.dbPlayers_PlayerGHIN);
      return `<div class="gpRow" data-ghin="${ghin}">
        <div class="gpStack"><div class="gpName">${safe(p.dbPlayers_Name)}</div><div class="gpMeta">${ghin} • ${safe(p.dbPlayers_TeeSetName)}</div></div>
        <div class="gpHideSm">HI ${safe(p.dbPlayers_HI)}</div>
        <div class="gpHideSm">CH ${safe(p.dbPlayers_CH)}</div>
        <button class="btnIcon" data-act="fav" title="Favorites">♥</button>
        <button class="btnIcon" data-act="tee" title="Change Tee">⛳</button>
        <button class="btnIcon" data-act="del" title="Remove">✕</button>
      </div>`;
    }).join("");
    html += `</div></section>`;

    if (state.activeTab === "favorites") {
      html += `<section class="gpSection"><div class="gpSection__hdr">Favorite Players</div><div class="gpRows">`;
      html += (state.favorites || []).map(f => `<div class="gpRow"><div class="gpStack"><div class="gpName">${safe(f.name || f.playerName)}</div><div class="gpMeta">${safe(f.playerGHIN)}</div></div><button class="btnIcon" data-fav-ghin="${safe(f.playerGHIN)}" data-act="addfav">＋</button></div>`).join("");
      if (!state.favorites.length) html += `<div class="gpEmpty">No favorites found.</div>`;
      html += `</div></section>`;
    }

    el.body.innerHTML = html;

    el.body.querySelectorAll("button[data-act='del']").forEach(b=>b.onclick = onDeleteRow);
    el.body.querySelectorAll("button[data-act='tee']").forEach(b=>b.onclick = onChangeTee);
    el.body.querySelectorAll("button[data-act='fav']").forEach(b=>b.onclick = onRowFavorite);
    el.body.querySelectorAll("button[data-act='addfav']").forEach(b=>b.onclick = onAddFavoriteRow);
  }

  async function onAddFavoriteRow(e){
    const ghin = e.currentTarget.getAttribute("data-fav-ghin");
    const row = (state.favorites || []).find(f => safe(f.playerGHIN) === safe(ghin));
    if (!row) return;
    const parts = safe(row.name || "").split(" ");
    const first = parts.slice(0, -1).join(" ") || safe(row.name || "");
    const last = parts.slice(-1).join("");
    await beginTeeFlow({ ghin, first_name:first, last_name:last, gender:safe(row.gender || "M"), hi:safe(row.hi || "0") });
  }

  async function addSelf(){
    await beginTeeFlow({
      ghin: safe(state.context.userGHIN),
      first_name: safe(state.context.userName).split(" ").slice(0,-1).join(" "),
      last_name: safe(state.context.userName).split(" ").slice(-1).join(""),
      gender: "M"
    });
  }

  async function addNonRated(){
    const first = safe(document.getElementById("gpNrFirst")?.value).trim();
    const last = safe(document.getElementById("gpNrLast")?.value).trim();
    const hi = safe(document.getElementById("gpNrHi")?.value).trim();
    const gender = safe(document.getElementById("gpNrGender")?.value || "M");
    if (!first || !last) return MA.setStatus("Enter non-rated first/last name", "warn");
    const ghin = `NH${Date.now()}${Math.floor(Math.random()*1000)}`;
    await beginTeeFlow({ ghin, first_name:first, last_name:last, gender, hi });
  }

  function openGHINSearch(){
    const existing = new Set(state.players.map(p => safe(p.dbPlayers_PlayerGHIN)));
    MA.ghinSearch.open({
      title: "Add Player from GHIN",
      defaultState: safe(state.context.userState).toUpperCase(),
      existingGHINs: existing,
      onSelect: async (row) => {
        await beginTeeFlow({
          ghin: safe(row.ghin),
          first_name: safe(row.name).split(" ").slice(0,-1).join(" "),
          last_name: safe(row.name).split(" ").slice(-1).join(""),
          gender: safe(row.gender),
          hi: safe(row.hi)
        });
      }
    });
  }

  async function beginTeeFlow(player){
    state.pendingPlayer = Object.assign({}, player);
    const res = await MA.postJson(MA.paths.ghinGetTeeSets, { player: state.pendingPlayer });
    if (!res?.ok) return MA.setStatus(res?.message || "Unable to get tee sets", "danger");
    state.pendingPlayer.hi = safe(res.payload?.hi);
    state.teeOptions = Array.isArray(res.payload?.teeSets) ? res.payload.teeSets : [];
    state.selectedTee = state.teeOptions[0] || null;
    openTeeModal();
  }

  function wireModal(){
    el.teeCancel.onclick = closeTeeModal;
    el.teeSave.onclick = commitPending;
  }

  function openTeeModal(){
    el.teeRows.innerHTML = state.teeOptions.map((t, idx) => `<div class="gpTeeRow ${idx===0?"is-on":""}" data-tee-id="${safe(t.teeSetID || t.value)}"><span>${safe(t.label)}</span><span>${safe(t.teeSetSlope)}</span></div>`).join("");
    el.teeRows.querySelectorAll(".gpTeeRow").forEach(row => row.onclick = () => {
      el.teeRows.querySelectorAll(".gpTeeRow").forEach(r=>r.classList.remove("is-on"));
      row.classList.add("is-on");
      const id = row.getAttribute("data-tee-id");
      state.selectedTee = state.teeOptions.find(t => safe(t.teeSetID || t.value) === safe(id)) || null;
    });
    el.teeOverlay.classList.add("is-open");
    el.teeOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("maOverlayOpen");
  }

  function closeTeeModal(){
    el.teeOverlay.classList.remove("is-open");
    el.teeOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("maOverlayOpen");
  }

  async function commitPending(){
    if (!state.pendingPlayer || !state.selectedTee) return;
    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player: state.pendingPlayer, selectedTee: state.selectedTee });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to save player", "danger");
      return;
    }
    closeTeeModal();
    if (safe(state.pendingPlayer.ghin).startsWith("NH")) MA.ghinSearch.close && MA.ghinSearch.close();
    state.pendingPlayer = null;
    await refreshPlayers();
    renderBody();
    MA.setStatus("Player added/updated.", "success");
  }

  async function onDeleteRow(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;
    const res = await MA.postJson(MA.paths.gamePlayersDelete, { playerGHIN: ghin });
    if (!res?.ok) return MA.setStatus("Unable to delete player", "danger");
    await refreshPlayers();
    renderBody();
  }

  async function onChangeTee(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
    if (!p) return;
    await beginTeeFlow({
      ghin: safe(p.dbPlayers_PlayerGHIN),
      first_name: safe(p.dbPlayers_Name).split(" ").slice(0,-1).join(" "),
      last_name: safe(p.dbPlayers_LName),
      gender: safe(p.dbPlayers_Gender),
      hi: safe(p.dbPlayers_HI)
    });
  }

  function onRowFavorite(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;
    MA.postJson(MA.paths.routerApi, { action:"favorites", mode:"registrations", returnTo:"roster", favPlayerGHIN: ghin })
      .then(r => { if (r?.ok && r.redirectUrl) window.location.assign(r.redirectUrl); });
  }

  boot().catch(err => {
    console.error(err);
    MA.setStatus("Failed to initialize page.", "danger");
  });
})();
