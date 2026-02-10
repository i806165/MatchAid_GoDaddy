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
  function esc(v){ return safe(v).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

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
        //left: { show:true, label:"Back", onClick:()=>MA.routerGo && MA.routerGo("edit") },
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
    el.tabStrip.classList.add("maSeg");
    el.tabStrip.innerHTML = tabs.map(t=>`<button class="gpTabBtn maSegBtn ${state.activeTab===t.id?"is-on is-active":""}" data-tab="${t.id}" role="tab" aria-selected="${state.activeTab===t.id?"true":"false"}">${esc(t.label)}</button>`).join("");
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
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnSearchGhin" class="btn btnPrimary gpAddBtn" type="button">Add from GHIN</button></div>`;
      document.getElementById("gpBtnSearchGhin").onclick = openGHINSearch;
      return;
    }
    if (state.activeTab === "favorites") {
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnFavoritesPage" class="btn btnSecondary gpAddBtn" type="button">Open Favorites</button></div>`;
      document.getElementById("gpBtnFavoritesPage").onclick = () => MA.routerGo("favorites");
      return;
    }
    if (state.activeTab === "nonrated") {
      el.controls.innerHTML = `<div class="maFieldRow">
        <div class="maField"><input id="gpNrFirst" class="maTextInput" placeholder="First name"></div>
        <div class="maField"><input id="gpNrLast" class="maTextInput" placeholder="Last name"></div>
        <div class="maField" style="flex:0 0 68px;"><input id="gpNrHi" class="maTextInput" placeholder="HI"></div>
        <div class="maField" style="flex:0 0 62px;"><select id="gpNrGender" class="maTextInput"><option>M</option><option>F</option></select></div>
        <div class="maField" style="flex:0 0 auto;"><button id="gpNrAdd" class="btn btnPrimary gpAddBtn" type="button">Find Tee Sets</button></div>
      </div>`;
      document.getElementById("gpNrAdd").onclick = addNonRated;
      return;
    }
    if (state.activeTab === "self") {
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnAddSelf" class="btn btnPrimary gpAddBtn" type="button">Add Self</button></div>`;
      document.getElementById("gpBtnAddSelf").onclick = addSelf;
      return;
    }
    el.controls.innerHTML = `<div class="maFieldRow"><div class="maField"><div class="gpMeta">Tap ♥ to route to Favorites.</div></div></div>`;
  }

  function renderBody(){
    const rows = state.players.map((p) => {
      const ghin = safe(p.dbPlayers_PlayerGHIN);
      const isFav = false;
      return `<div class="gpListRow gpRow" data-ghin="${esc(ghin)}">
        <div>
          <div class="gpName">${esc(p.dbPlayers_Name)}</div>
          <div class="gpMeta">${esc(p.dbPlayers_TeeSetName || "No tee selected")}</div>
        </div>
        <div class="gpStat">${esc(p.dbPlayers_HI || "0")}</div>
        <div class="gpStat">${esc(p.dbPlayers_CH || "0")}</div>
        <button class="iconBtn gpIconBtn ${isFav?"":"is-off"}" data-act="fav" title="Favorites" aria-label="Favorites">♥</button>
        <button class="iconBtn gpIconBtn" data-act="tee" title="Change Tee" aria-label="Change Tee">⛳</button>
        <button class="iconBtn gpIconBtn" data-act="del" title="Remove" aria-label="Remove">✕</button>
      </div>`;
    }).join("");

    let html = `<section class="gpList">
      <div class="gpListHdr">
        <div>Roster (${state.players.length})</div>
        <div class="gpStat">HI</div>
        <div class="gpStat">CH</div>
        <div></div><div></div><div></div>
      </div>
      ${rows || `<div class="gpEmpty">No players registered yet.</div>`}
    </section>`;

    if (state.activeTab === "favorites") {
      const favRows = (state.favorites || []).map((f) => {
        const g = safe(f.playerGHIN);
        const n = safe(f.name || f.playerName);
        return `<div class="gpListRow">
          <div><div class="gpName">${esc(n)}</div><div class="gpMeta">Favorite player</div></div>
          <div class="gpStat">${esc(f.hi || "")}</div>
          <div class="gpStat">${esc(f.gender || "")}</div>
          <button class="iconBtn gpIconBtn" data-fav-ghin="${esc(g)}" data-act="addfav" title="Add" aria-label="Add">＋</button>
          <div></div><div></div>
        </div>`;
      }).join("");
      html += `<section class="gpList">
        <div class="gpListHdr"><div>Favorites</div><div class="gpStat">HI</div><div class="gpStat">G</div><div></div><div></div><div></div></div>
        ${favRows || `<div class="gpEmpty">No favorites found.</div>`}
      </section>`;
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
    const sub = document.getElementById("gpTeeSubTitle");
    if (sub) sub.textContent = `${safe(state.pendingPlayer?.first_name)} ${safe(state.pendingPlayer?.last_name)}`.trim();
    el.teeRows.innerHTML = state.teeOptions.map((t, idx) => {
      const id = safe(t.teeSetID || t.value);
      const line1 = `${safe(t.teeSetName || t.name || "Tee Set")} • CH ${safe(t.playerCH || t.ch || "")}`;
      const line2 = `${safe(t.teeSetYards || t.yards || "")} yds • Slope ${safe(t.teeSetSlope || t.slope || "")} • CR ${safe(t.teeSetRating || t.rating || "")}`;
      return `<div class="gpTeeCard gpTeeRow ${idx===0?"is-on":""}" data-tee-id="${esc(id)}"><div class="gpTeeLine1">${esc(line1)}</div><div class="gpTeeLine2">${esc(line2)}</div></div>`;
    }).join("");
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
