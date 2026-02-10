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
    groups: [],
    favGroupFilter: "All groups",
    favNameFilter: "",
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
    teeCancel: document.getElementById("gpTeeCancel"),
    teeStatus: document.getElementById("gpTeeStatus"),
  };

  function safe(v){ return v == null ? "" : String(v); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function esc(v){ return safe(v).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function splitName(full){
    const s = safe(full).trim();
    if (!s) return { first:"", last:"" };
    const parts = s.split(/\s+/);
    return {
      first: parts.slice(0, -1).join(" ") || parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : ""
    };
  }

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
    const res = await MA.postJson(MA.paths.favPlayersInit, { courseId: safe(state.game?.dbGames_CourseID) });
    state.favorites = Array.isArray(res?.payload?.favorites) ? res.payload.favorites : [];
    state.groups = Array.isArray(res?.payload?.groups) ? res.payload.groups : [];
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
      el.controls.innerHTML = `<div class="maFieldRow"><button id="gpBtnSearchGhin" class="btn btnPrimary gpAddBtn" type="button">Search GHIN</button></div>`;
      document.getElementById("gpBtnSearchGhin").onclick = openGHINSearch;
      return;
    }
    if (state.activeTab === "favorites") {
      const opts = ["All groups"].concat(state.groups || []).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
      el.controls.innerHTML = `<div class="maFieldRow">
        <div class="maField" style="max-width: 220px;">
          <select id="gpFavGroup" class="maTextInput">${opts}</select>
        </div>
        <div class="maField">
          <div class="maInputWrap">
            <input id="gpFavFilter" class="maTextInput" placeholder="Player name" value="${esc(state.favNameFilter)}">
            <button id="gpFavSearchClear" class="clearBtn ${state.favNameFilter ? "" : "isHidden"}" type="button" aria-label="Clear filter">×</button>
          </div>
        </div>
        <div class="maField" style="flex:0 0 auto;"><button id="gpBtnFavoritesPage" class="btn btnSecondary gpAddBtn" type="button">Manage Favorites</button></div>
      </div>`;
      const sel = document.getElementById("gpFavGroup");
      if (sel) {
        sel.value = state.favGroupFilter;
        sel.onchange = () => {
          state.favGroupFilter = safe(sel.value) || "All groups";
          renderBody();
        };
      }
      const inp = document.getElementById("gpFavFilter");
      const clr = document.getElementById("gpFavSearchClear");
      if (inp) {
        inp.oninput = () => {
          state.favNameFilter = safe(inp.value);
          if (clr) clr.classList.toggle("isHidden", !state.favNameFilter);
          renderBody();
        };
      }
      if (clr) clr.onclick = () => {
        state.favNameFilter = "";
        if (inp) inp.value = "";
        clr.classList.add("isHidden");
        renderBody();
      };
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
      el.controls.innerHTML = `<div class="maFieldRow">
        <button id="gpBtnAddSelf" class="btn btnPrimary gpAddBtn" type="button">Find Tee Sets</button>
      </div>`;
      document.getElementById("gpBtnAddSelf").onclick = addSelf;
      return;
    }
    el.controls.innerHTML = `<div class="maFieldRow"><div class="maField"><div class="gpMeta">Tap ♥ to route to Favorites.</div></div></div>`;
  }

  function renderBody(){
    if (state.activeTab === "ghin") {
      el.body.innerHTML = `<section class="gpList">
        <div class="gpListHdr"><div>GHIN Lookup</div><div class="gpStat">HI</div><div class="gpStat">G</div><div></div><div></div></div>
        <div class="gpEmpty">Use <strong>Search GHIN</strong> above, then tap a result row in the search overlay to launch tee selection.</div>
      </section>`;
      return;
    }

    if (state.activeTab === "nonrated") {
      el.body.innerHTML = `<section class="gpList">
        <div class="gpListHdr"><div>Add Non-Rated</div><div class="gpStat">HI</div><div class="gpStat">G</div><div></div><div></div></div>
        <div class="gpListRow">
          <div>
            <div class="gpName">New Non-Rated Player</div>
            <div class="gpMeta">Enter first/last name, optional HI, and gender, then tap <strong>Find Tee Sets</strong>.</div>
          </div>
          <div class="gpStat">—</div>
          <div class="gpStat">—</div>
          <div class="gpTapHint">Controls above</div>
          <div></div>
        </div>
      </section>`;
      return;
    }

    if (state.activeTab === "self") {
      const selfName = safe(state.context.userName || "Current User");
      const exists = state.players.some((p) => safe(p.dbPlayers_PlayerGHIN) === safe(state.context.userGHIN));
      el.body.innerHTML = `<section class="gpList">
        <div class="gpListHdr"><div>Add Self</div><div class="gpStat">HI</div><div class="gpStat">CH</div><div></div><div></div></div>
        <div class="gpListRow gpRowClickable" data-act="selftee">
          <div>
            <div class="gpName">${esc(selfName)}</div>
            <div class="gpMeta">${exists ? "Already in roster. Tap Find Tee Sets to change tee." : "Not in roster yet."}</div>
          </div>
          <div class="gpStat">—</div>
          <div class="gpStat">—</div>
          <div class="gpTapHint">Tap row</div><div></div>
        </div>
      </section>`;
      const selfRow = el.body.querySelector("[data-act='selftee']");
      if (selfRow) selfRow.onclick = addSelf;
      return;
    }

    if (state.activeTab === "favorites") {
      const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const q = safe(state.favNameFilter).trim().toLowerCase();
      const grp = safe(state.favGroupFilter || "All groups");
      const favRows = (state.favorites || []).filter((f) => {
        const tags = Array.isArray(f.groups) ? f.groups : [];
        const inGroup = grp === "All groups" ? true : tags.includes(grp);
        if (!inGroup) return false;
        if (!q) return true;
        return safe(f.name || f.playerName).toLowerCase().includes(q);
      }).map((f) => {
        const g = safe(f.playerGHIN);
        const n = safe(f.name || f.playerName);
        const enrolled = enrolledSet.has(g);
        const lastTee = safe(f.lastCourse?.teeSetName || "");
        return `<div class="gpListRow ${enrolled ? "" : "gpRowClickable"}" data-fav-ghin="${esc(g)}" data-act="addfav" data-disabled="${enrolled ? "1" : "0"}">
          <div><div class="gpName">${esc(n)}</div><div class="gpMeta">${esc(lastTee || "No prior tee on this course")}</div></div>
          <div class="gpStat">${esc(f.gender || "")}</div>
          <div class="gpMeta">${esc(lastTee || "")}</div>
          <div class="gpTapHint">${enrolled ? "👤✕" : "Tap row"}</div>
          <div class="gpTapHint">${enrolled ? "Enrolled" : ""}</div>
        </div>`;
      }).join("");
      el.body.innerHTML = `<section class="gpList">
        <div class="gpListHdr"><div>Favorites</div><div class="gpStat">G</div><div class="gpMeta">Last Tee</div><div></div><div></div></div>
        ${favRows || `<div class="gpEmpty">No favorites found.</div>`}
      </section>`;
      el.body.querySelectorAll("[data-act='addfav']").forEach(r=>r.onclick = (e) => {
        if (r.getAttribute("data-disabled") === "1") return;
        onAddFavoriteRow(e);
      });
      return;
    }

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
        <button class="iconBtn gpIconBtn" data-act="del" title="Remove" aria-label="Remove">✕</button>
      </div>`;
    }).join("");

    const html = `<section class="gpList">
      <div class="gpListHdr">
        <div>Roster (${state.players.length})</div>
        <div class="gpStat">HI</div>
        <div class="gpStat">CH</div>
        <div></div><div></div>
      </div>
      ${rows || `<div class="gpEmpty">No players registered yet.</div>`}
    </section>`;

    el.body.innerHTML = html;
    el.body.querySelectorAll("button[data-act='del']").forEach(b=>b.onclick = onDeleteRow);
    el.body.querySelectorAll("button[data-act='fav']").forEach(b=>b.onclick = onRowFavorite);
    el.body.querySelectorAll("[data-act='addfav']").forEach(r=>r.onclick = onAddFavoriteRow);
    el.body.querySelectorAll(".gpRow").forEach(row => {
      row.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("button[data-act]");
        if (actionBtn) return;
        const ghin = row.getAttribute("data-ghin");
        if (!ghin) return;
        const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
        if (!p) return;
        beginTeeFlow({
          ghin: safe(p.dbPlayers_PlayerGHIN),
          first_name: safe(p.dbPlayers_Name).split(" ").slice(0,-1).join(" "),
          last_name: safe(p.dbPlayers_LName),
          gender: safe(p.dbPlayers_Gender),
          hi: safe(p.dbPlayers_HI),
          selectedTeeSetId: safe(p.dbPlayers_TeeSetID)
        });
      });
    });
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
    if (!safe(state.context.userGHIN)) {
      MA.setStatus("Missing user GHIN context.", "warn");
      return;
    }
    const nm = splitName(state.context.userName);
    await beginTeeFlow({
      ghin: safe(state.context.userGHIN),
      first_name: nm.first,
      last_name: nm.last,
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
    const preferred = safe(state.pendingPlayer?.selectedTeeSetId);
    state.selectedTee = state.teeOptions.find(t => safe(t.teeSetID || t.value) === preferred) || state.teeOptions[0] || null;
    openTeeModal();
  }

  function wireModal(){
    el.teeCancel.onclick = closeTeeModal;
  }

  function openTeeModal(){
    const sub = document.getElementById("gpTeeSubTitle");
    if (sub) sub.textContent = `${safe(state.pendingPlayer?.first_name)} ${safe(state.pendingPlayer?.last_name)}`.trim();
    el.teeRows.innerHTML = state.teeOptions.map((t, idx) => {
      const id = safe(t.teeSetID || t.value);
      const isSelected = state.selectedTee && safe(state.selectedTee.teeSetID || state.selectedTee.value) === id;
      const line1 = `${safe(t.teeSetName || t.name || "Tee Set")} • CH ${safe(t.playerCH || t.ch || "")}`;
      const line2 = `${safe(t.teeSetYards || t.yards || "")} yds • Slope ${safe(t.teeSetSlope || t.slope || "")} • CR ${safe(t.teeSetRating || t.rating || "")}`;
      return `<div class="gpTeeCard gpTeeRow ${isSelected?"is-on":""}" data-tee-id="${esc(id)}"><div class="gpTeeLine1">${esc(line1)}${isSelected ? '<span class="gpSelectedPill">Selected</span>' : ''}</div><div class="gpTeeLine2">${esc(line2)}</div></div>`;
    }).join("");
    el.teeRows.querySelectorAll(".gpTeeRow").forEach(row => row.onclick = async () => {
      el.teeRows.querySelectorAll(".gpTeeRow").forEach(r=>r.classList.remove("is-on"));
      row.classList.add("is-on");
      const id = row.getAttribute("data-tee-id");
      state.selectedTee = state.teeOptions.find(t => safe(t.teeSetID || t.value) === safe(id)) || null;
      await commitPending();
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
