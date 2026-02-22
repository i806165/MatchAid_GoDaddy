/* /assets/pages/game_players.js
   Game Players page controller (GoDaddy).
   - Hydrates from window.__MA_INIT__
*/
(function(){
  "use strict";
  const MA = window.MA || {};
  const init = window.__MA_INIT__ || {};
  const apiGHIN = MA.paths?.apiGHIN || "/api/GHIN";

  const state = {
    activeTab: "roster",
    game: init.game || {},
    context: init.context || {},
    players: [],
    favorites: [],
    groups: [],
    favGroupFilter: "All groups",
    favNameFilter: "",
    favBroadened: false,
    pendingPlayer: null,
    teeOptions: [],
    selectedTee: null,
    selfAutoLaunched: false,
    ghinState: "",
    ghinLast: "",
    ghinFirst: "",
    ghinRows: [],
    ghinTruncated: false,
    ghinStatus: "",
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
    teeOverlay: document.getElementById("maTeeOverlay"),
    teeRows: document.getElementById("maTeeRows"),
    teeCancel: document.getElementById("maTeeCancel"),
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

  function normalizeState(v){
    return safe(v).trim().toUpperCase().slice(0,2);
  }

  function favoriteMatchesSearch(f, q){
    const needle = safe(q).trim().toLowerCase();
    if (!needle) return true;
    const hay = `${safe(f.name || f.playerName)} ${safe(f.lname || "")}`.toLowerCase();
    return hay.includes(needle);
  }

  function formatDate(s) {
    if (!s) return "";
    // Try to parse YYYY-MM-DD or similar
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return s;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  async function boot(){
    applyChrome();
    wireModal();
    await refreshPlayers();
    await refreshFavorites();
    if (!state.ghinState) state.ghinState = normalizeState(state.context.userState || "");
    renderTabs();
    render();
  }

  function openActionsMenu() {
    if (!MA.ui || !MA.ui.openActionsMenu) return;
    MA.ui.openActionsMenu("Actions", [
      { label: "Game Settings", action: "settings", params: { returnTo: "roster" } }
    ]);
  }

  function applyChrome(){
    const g = state.game || {};
    const title = String(g.dbGames_Title || "Game");
    const course = String(g.dbGames_CourseName || "");
    const date = formatDate(g.dbGames_PlayDate);
    const subTitle = [course, date].filter(Boolean).join(" • ");

    if (MA.chrome && MA.chrome.setHeaderLines) MA.chrome.setHeaderLines(["Game Players", title, subTitle]);
    if (MA.chrome && MA.chrome.setActions) {
      MA.chrome.setActions({
        left: { show: true, label: "Actions", onClick: openActionsMenu },
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
    el.tabStrip.innerHTML = tabs.map(t=>`<button class="maSegBtn ${state.activeTab===t.id?"is-active":""}" data-tab="${t.id}" role="tab" aria-selected="${state.activeTab===t.id?"true":"false"}">${esc(t.label)}</button>`).join("");
    el.tabStrip.querySelectorAll(".maSegBtn").forEach(btn=>btn.addEventListener("click", async ()=>{
      state.activeTab = btn.dataset.tab;
      if (state.activeTab === "favorites") await refreshFavorites();
      if (state.activeTab !== "self") state.selfAutoLaunched = false;
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
      el.controls.innerHTML = `<div class="maFieldRow">
        <div class="maField gpFieldState"><div class="maInputWrap gpInputClearWrap"><input id="gpGhinState" class="maTextInput" maxlength="2" placeholder="State" value="${esc(state.ghinState)}"></div></div>
        <div class="maField gpFieldLast"><div class="maInputWrap gpInputClearWrap"><input id="gpGhinLast" class="maTextInput" placeholder="Last name or GHIN#" value="${esc(state.ghinLast)}"><button id="gpGhinLastClear" class="clearBtn ${state.ghinLast ? "" : "isHidden"}" type="button" aria-label="Clear last name">×</button></div></div>
        <div class="maField gpFieldFirst"><div class="maInputWrap gpInputClearWrap"><input id="gpGhinFirst" class="maTextInput" placeholder="First name (optional)" value="${esc(state.ghinFirst)}"><button id="gpGhinFirstClear" class="clearBtn ${state.ghinFirst ? "" : "isHidden"}" type="button" aria-label="Clear first name">×</button></div></div>
        <div class="maField gpFieldBtn"><button id="gpBtnSearchGhin" class="btn btnPrimary" type="button">Search</button></div>
      </div>`;
      const inpState = document.getElementById("gpGhinState");
      const inpLast = document.getElementById("gpGhinLast");
      const inpFirst = document.getElementById("gpGhinFirst");
      const clrLast = document.getElementById("gpGhinLastClear");
      const clrFirst = document.getElementById("gpGhinFirstClear");
      const doSearch = ()=>searchGHINTab();
      if (inpState) inpState.oninput = ()=>{ state.ghinState = normalizeState(inpState.value); inpState.value = state.ghinState; };
      if (inpLast) inpLast.oninput = ()=>{ state.ghinLast = safe(inpLast.value); if (clrLast) clrLast.classList.toggle("isHidden", !state.ghinLast); };
      if (inpFirst) inpFirst.oninput = ()=>{ state.ghinFirst = safe(inpFirst.value); if (clrFirst) clrFirst.classList.toggle("isHidden", !state.ghinFirst); };
      if (clrLast) clrLast.onclick = ()=>{ state.ghinLast=""; if (inpLast) inpLast.value=""; clrLast.classList.add("isHidden"); inpLast && inpLast.focus(); };
      if (clrFirst) clrFirst.onclick = ()=>{ state.ghinFirst=""; if (inpFirst) inpFirst.value=""; clrFirst.classList.add("isHidden"); inpFirst && inpFirst.focus(); };
      [inpState, inpLast, inpFirst].forEach((n)=>{ if (!n) return; n.onkeydown = (e)=>{ if (e.key === "Enter") doSearch(); }; });
      document.getElementById("gpBtnSearchGhin").onclick = doSearch;
      return;
    }
    if (state.activeTab === "favorites") {
      const opts = ["All groups"].concat(state.groups || []).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
      el.controls.innerHTML = `<div class="maFieldRow">
        <div class="maField gpFieldGroup">
          <select id="gpFavGroup" class="maTextInput">${opts}</select>
        </div>
        <div class="maField">
          <div class="maInputWrap gpInputClearWrap">
            <input id="gpFavFilter" class="maTextInput" placeholder="Player name" value="${esc(state.favNameFilter)}">
            <button id="gpFavSearchClear" class="clearBtn ${state.favNameFilter ? "" : "isHidden"}" type="button" aria-label="Clear filter">×</button>
          </div>
        </div>
        <div class="maField gpFieldBtn"><button id="gpBtnFavoritesPage" class="btn btnSecondary" type="button">Manage Favorites</button></div>
      </div>`;
      el.controls.innerHTML += `<div class="maFieldRow"><div class="maField"><div id="gpFavHint" class="maHelpText gpHint ${state.favBroadened ? "" : "isHidden"}">No match in selected group — showing all groups.</div></div></div>`;
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
      document.getElementById("gpBtnFavoritesPage").onclick = () => MA.routerGo("favorites", { returnTo: "roster" });
      return;
    }
    if (state.activeTab === "nonrated") {
      el.controls.innerHTML = `<div class="maFieldRow gpNrRow">
        <div class="maField gpFieldFirst"><div class="maInputWrap gpInputClearWrap"><input id="gpNrFirst" class="maTextInput" placeholder="First name"><button id="gpNrFirstClear" class="clearBtn isHidden" type="button" aria-label="Clear first name">×</button></div></div>
        <div class="maField gpFieldLast"><div class="maInputWrap gpInputClearWrap"><input id="gpNrLast" class="maTextInput" placeholder="Last name"><button id="gpNrLastClear" class="clearBtn isHidden" type="button" aria-label="Clear last name">×</button></div></div>
        <div class="maField gpFieldHi"><div class="maInputWrap gpInputClearWrap"><input id="gpNrHi" class="maTextInput" placeholder="HI"><button id="gpNrHiClear" class="clearBtn isHidden" type="button" aria-label="Clear HI">×</button></div></div>
        <div class="maField gpFieldGender"><select id="gpNrGender" class="maTextInput"><option>M</option><option>F</option></select></div>
        <div class="maField gpFieldBtn"><button id="gpNrAdd" class="btn btnPrimary" type="button">Find Tee Sets</button></div>
      </div>`;
      const nrFirst = document.getElementById("gpNrFirst");
      const nrLast = document.getElementById("gpNrLast");
      const nrHi = document.getElementById("gpNrHi");
      const nrFirstClr = document.getElementById("gpNrFirstClear");
      const nrLastClr = document.getElementById("gpNrLastClear");
      const nrHiClr = document.getElementById("gpNrHiClear");
      if (nrFirst) nrFirst.oninput = ()=> nrFirstClr && nrFirstClr.classList.toggle("isHidden", !safe(nrFirst.value));
      if (nrLast) nrLast.oninput = ()=> nrLastClr && nrLastClr.classList.toggle("isHidden", !safe(nrLast.value));
      if (nrHi) nrHi.oninput = ()=> nrHiClr && nrHiClr.classList.toggle("isHidden", !safe(nrHi.value));
      if (nrFirstClr) nrFirstClr.onclick = ()=>{ if (nrFirst) nrFirst.value=""; nrFirstClr.classList.add("isHidden"); nrFirst && nrFirst.focus(); };
      if (nrLastClr) nrLastClr.onclick = ()=>{ if (nrLast) nrLast.value=""; nrLastClr.classList.add("isHidden"); nrLast && nrLast.focus(); };
      if (nrHiClr) nrHiClr.onclick = ()=>{ if (nrHi) nrHi.value=""; nrHiClr.classList.add("isHidden"); nrHi && nrHi.focus(); };
      document.getElementById("gpNrAdd").onclick = addNonRated;
      return;
    }
    if (state.activeTab === "self") {
      el.controls.innerHTML = `<div class="maFieldRow"><div class="maField"><div class="maHelpText">Your player record will open tee selection automatically.</div></div></div>`;
      return;
    }

    const eff = state.game?.dbGames_HCEffectivity || "PlayDate";
    let hcLabel = "HCP as of Play Date";
    if (eff === "Low12") hcLabel = "HCP: 12m Low";
    else if (eff === "Low6") hcLabel = "HCP: 6m Low";
    else if (eff === "Low3") hcLabel = "HCP: 3m Low";
    else if (eff === "Date") {
      const d = state.game?.dbGames_HCEffectivityDate || "Date";
      hcLabel = `HCP as of ${d}`;
    }
    el.controls.innerHTML = `<div class="maFieldRow"><div class="maField"><div class="maHelpText">${esc(hcLabel)} • Tap ♥ to manage favorites.</div></div></div>`;
  }

  function renderBody(){
    if (state.activeTab === "ghin") {
      const enrolled = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const rows = (state.ghinRows || []).map((r) => {
        const ghin = safe(r.ghin);
        const isEnrolled = enrolled.has(ghin);
        const club = safe(r.club_name || r.clubName || "").trim();
        return `<div class="maListRow gpRow gpRow--ghin ${isEnrolled ? "" : "gpRowClickable"}" data-act="ghin-row" data-ghin="${esc(ghin)}" data-disabled="${isEnrolled ? "1" : "0"}">
          <div class="maListRow__col">${esc(r.name || ghin)}${club ? ` • ${esc(club)}` : ""}</div>
          <div class="maListRow__col maListRow__col--right">${esc(r.hi || "")}</div>
          <div class="maListRow__col maListRow__col--right">${esc(r.gender || "")}</div>
          <div class="maListRow__col maListRow__col--right gpEnrolledMark">${isEnrolled ? "☑" : ""}</div>
        </div>`;
      }).join("");
      const status = state.ghinStatus ? `<div class="gpInlineStatus">${esc(state.ghinStatus)}</div>` : "";
      const trunc = state.ghinTruncated ? `<div class="gpInlineStatus">Results truncated. Refine your search.</div>` : "";
      const empty = (!rows && !status) ? `<div class="gpEmpty">Enter search criteria above, then Search.</div>` : "";
      el.body.innerHTML = `<section class="maPanel">
        <div class="maListRow maListRow--hdr gpRow--ghin"><div class="maListRow__col">GHIN Lookup</div><div class="maListRow__col maListRow__col--right">HI</div><div class="maListRow__col maListRow__col--right">G</div><div class="maListRow__col"></div></div>
        <div class="maListRows">${status}${trunc}${rows}${empty}</div>
      </section>`;
      el.body.querySelectorAll("[data-act='ghin-row']").forEach((row)=>{
        row.onclick = ()=>{
          if (row.getAttribute("data-disabled") === "1") return;
          onSelectGHINRow(row.getAttribute("data-ghin"));
        };
      });
      return;
    }

    if (state.activeTab === "nonrated") {
      el.body.innerHTML = `<section class="maPanel">
        <div class="maListRow maListRow--hdr gpRow--favs"><div class="maListRow__col">Add Non-Rated</div><div class="maListRow__col maListRow__col--right">HI</div><div class="maListRow__col maListRow__col--right">G</div><div class="maListRow__col"></div><div class="maListRow__col"></div></div>
        <div class="maListRows"><div class="maListRow gpRow--favs">
          <div class="maListRow__col">New Non-Rated Player</div>
          <div class="maListRow__col maListRow__col--right">—</div>
          <div class="maListRow__col maListRow__col--right">—</div>
          <div class="maListRow__col maListRow__col--muted">Controls above</div>
          <div class="maListRow__col"></div>
        </div></div>
      </section>`;
      return;
    }

    if (state.activeTab === "self") {
      const selfName = safe(state.context.userName || "Current User");
      const exists = state.players.some((p) => safe(p.dbPlayers_PlayerGHIN) === safe(state.context.userGHIN));
      el.body.innerHTML = `<section class="maPanel">
        <div class="maListRow maListRow--hdr gpRow--favs"><div class="maListRow__col">Add Self</div><div class="maListRow__col maListRow__col--right">HI</div><div class="maListRow__col maListRow__col--right">CH</div><div class="maListRow__col"></div><div class="maListRow__col"></div></div>
        <div class="maListRows"><div class="maListRow gpRow gpRow--favs gpRowClickable" data-act="selftee">
          <div class="maListRow__col">${esc(selfName)}<div class="maListRow__col--muted gpSub">${exists ? "Already in roster." : "Not in roster yet."}</div></div>
          <div class="maListRow__col maListRow__col--right">—</div>
          <div class="maListRow__col maListRow__col--right">—</div>
          <div class="maListRow__col"></div><div class="maListRow__col"></div>
        </div></div>
      </section>`;
      const selfRow = el.body.querySelector("[data-act='selftee']");
      if (selfRow) selfRow.onclick = addSelf;
      if (!state.selfAutoLaunched) {
        state.selfAutoLaunched = true;
        setTimeout(() => { addSelf(); }, 0);
      }
      return;
    }

    if (state.activeTab === "favorites") {
      const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const q = safe(state.favNameFilter).trim().toLowerCase();
      const grp = safe(state.favGroupFilter || "All groups");
      state.favBroadened = false;
      let filtered = (state.favorites || []).filter((f) => {
        const tags = Array.isArray(f.groups) ? f.groups : [];
        const inGroup = grp === "All groups" ? true : tags.includes(grp);
        if (!inGroup) return false;
        return favoriteMatchesSearch(f, q);
      });

      if (q && filtered.length === 0 && grp !== "All groups") {
        state.favBroadened = true;
        state.favGroupFilter = "All groups";
        filtered = (state.favorites || []).filter((f) => favoriteMatchesSearch(f, q));
      }

      const grpEl = document.getElementById("gpFavGroup");
      if (grpEl && grpEl.value !== state.favGroupFilter) grpEl.value = state.favGroupFilter;
      const hintEl = document.getElementById("gpFavHint");
      if (hintEl) hintEl.classList.toggle("isHidden", !state.favBroadened);

      const favRows = filtered.map((f) => {
        const g = safe(f.playerGHIN);
        const n = safe(f.name || f.playerName);
        const enrolled = enrolledSet.has(g);
        const lastTee = safe(f.lastCourse?.teeSetName || "");
        return `<div class="maListRow gpRow gpRow--favs ${enrolled ? "" : "gpRowClickable"}" data-fav-ghin="${esc(g)}" data-act="addfav" data-disabled="${enrolled ? "1" : "0"}">
          <div class="maListRow__col">${esc(n)}<div class="maListRow__col--muted gpSub">${esc(lastTee)}</div></div>
          <div class="maListRow__col maListRow__col--right">${esc(f.gender || "")}</div>
          <div class="maListRow__col maListRow__col--right maListRow__col--muted">${esc(lastTee || "")}</div>
          <div class="maListRow__col maListRow__col--right gpEnrolledMark">${enrolled ? "☑" : ""}</div>
          <div class="maListRow__col"></div>
        </div>`;
      }).join("");
      el.body.innerHTML = `<section class="maPanel">
        <div class="maListRow maListRow--hdr gpRow--favs"><div class="maListRow__col">Favorites</div><div class="maListRow__col maListRow__col--right">G</div><div class="maListRow__col maListRow__col--right">Last Tee</div><div class="maListRow__col"></div><div class="maListRow__col"></div></div>
        <div class="maListRows">${favRows || `<div class="gpEmpty">No favorites found.</div>`}</div>
      </section>`;
      el.body.querySelectorAll("[data-act='addfav']").forEach(r=>r.onclick = (e) => {
        if (r.getAttribute("data-disabled") === "1") return;
        onAddFavoriteRow(e);
      });
      return;
    }

    const favoriteSet = new Set((state.favorites || []).map((f) => safe(f.playerGHIN)));
    const rows = state.players.map((p) => {
      const ghin = safe(p.dbPlayers_PlayerGHIN);
      const isFav = favoriteSet.has(ghin);
      const hi = safe(p.dbPlayers_HI || "");
      const ch = safe(p.dbPlayers_CH || "");
      const ph = safe(p.dbPlayers_PH || "");
      const so = safe(p.dbPlayers_SO);
      const pairing = safe(p.dbPlayers_PairingID || "");
      const meta = [hi && `HI ${hi}`, ch && `CH ${ch}`, ph && `PH ${ph}`, so && `SO ${so}`, pairing].filter(Boolean).join(" · ");
      const teeName = safe(p.dbPlayers_TeeSetName || "");
      const nameLine = teeName ? `${safe(p.dbPlayers_Name)} · ${teeName}` : safe(p.dbPlayers_Name);
      return `<div class="maListRow gpRow gpRow--roster" data-ghin="${esc(ghin)}">
        <div class="maListRow__col">${esc(nameLine)}<div class="maListRow__col--muted gpSub">${esc(meta)}</div></div>
        <button class="iconBtn gpIconBtn ${isFav?"is-fav":""}" data-act="fav" title="Favorites" aria-label="Favorites">${isFav?"♥":"♡"}</button>
        <button class="iconBtn gpIconBtn" data-act="del" title="Remove" aria-label="Remove">✕</button>
      </div>`;
    }).join("");

    const html = `<section class="maPanel">
      <div class="maListRow maListRow--hdr gpRow--roster"><div class="maListRow__col">Roster (${state.players.length})</div><div class="maListRow__col"></div><div class="maListRow__col"></div></div>
      <div class="maListRows">${rows || `<div class="gpEmpty">No players registered yet.</div>`}</div>
    </section>`;

    el.body.innerHTML = html;
    el.body.querySelectorAll("button[data-act='del']").forEach(b=>b.onclick = onDeleteRow);
    el.body.querySelectorAll("button[data-act='fav']").forEach(b=>b.onclick = onRowFavorite);
    el.body.querySelectorAll(".gpRow[data-ghin]").forEach(row => {
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
    const existing = state.players.find((p)=>safe(p.dbPlayers_PlayerGHIN) === safe(state.context.userGHIN));
    await beginTeeFlow({
      ghin: safe(state.context.userGHIN),
      first_name: nm.first,
      last_name: nm.last,
      gender: safe(existing?.dbPlayers_Gender || "M"),
      hi: safe(existing?.dbPlayers_HI || ""),
      selectedTeeSetId: safe(existing?.dbPlayers_TeeSetID || "")
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

  async function searchGHINTab(){
    state.ghinStatus = "";
    const lastOrId = safe(state.ghinLast).trim();
    const first = safe(state.ghinFirst).trim();
    const stateCode = normalizeState(state.ghinState);
    state.ghinState = stateCode;
    if (!lastOrId) {
      state.ghinRows = [];
      state.ghinTruncated = false;
      state.ghinStatus = "Enter last name or GHIN#.";
      renderBody();
      return;
    }
    const mode = /^\d+$/.test(lastOrId) ? "id" : "name";
    state.ghinStatus = "Searching…";
    renderBody();
    const payload = (mode === "id")
      ? { mode, ghin: lastOrId }
      : { mode, state: stateCode, lastName: lastOrId, firstName: first };
    const res = await MA.postJson(MA.paths.ghinPlayerSearch, payload);
    if (!res?.ok) {
      state.ghinRows = [];
      state.ghinTruncated = false;
      state.ghinStatus = res?.message || "GHIN search failed.";
      renderBody();
      return;
    }
    state.ghinRows = Array.isArray(res.payload?.rows) ? res.payload.rows : [];
    state.ghinTruncated = !!res.payload?.truncated;
    state.ghinStatus = state.ghinRows.length ? "" : "No players found.";
    renderBody();
  }

  async function onSelectGHINRow(ghin){
    const row = (state.ghinRows || []).find((r)=>safe(r.ghin) === safe(ghin));
    if (!row) return;
    const nm = splitName(row.name || "");
    await beginTeeFlow({
      ghin: safe(row.ghin),
      first_name: nm.first,
      last_name: nm.last,
      gender: safe(row.gender),
      hi: safe(row.hi)
    });
  }

  async function beginTeeFlow(player){
    state.pendingPlayer = Object.assign({}, player);
    const res = await MA.postJson(MA.paths.ghinGetTeeSets, { player: state.pendingPlayer });
    if (!res?.ok) return MA.setStatus(res?.message || "Unable to get tee sets", "danger");
    state.pendingPlayer.hi = safe(res.payload?.hi);
    state.teeOptions = Array.isArray(res.payload?.teeSets) ? res.payload.teeSets : [];
    const preferred = safe(state.pendingPlayer?.selectedTeeSetId);
    state.selectedTee = state.teeOptions.find(t => safe(t.teeSetID || t.value) === preferred) || null;
    openTeeModal();
  }

  function wireModal(){
    el.teeCancel.onclick = closeTeeModal;
  }

  function openTeeModal(){
    const sub = document.getElementById("maTeeSubTitle");
    if (sub) sub.textContent = `${safe(state.pendingPlayer?.first_name)} ${safe(state.pendingPlayer?.last_name)}`.trim();
    el.teeRows.innerHTML = state.teeOptions.map((t, idx) => {
      const id = safe(t.teeSetID || t.value);
      const isSelected = state.selectedTee && safe(state.selectedTee.teeSetID || state.selectedTee.value) === id;
      const line1 = `${safe(t.teeSetName || t.name || "Tee Set")} • CH ${safe(t.playerCH || t.ch || "")}`;
      const line2 = `${safe(t.teeSetYards || t.yards || "")} yds • Slope ${safe(t.teeSetSlope || t.slope || "")} • CR ${safe(t.teeSetRating || t.rating || "")}`;
      return `<div class="maCard gpTeeRow ${isSelected?"is-on":""}" data-tee-id="${esc(id)}"><div class="gpTeeLine1">${esc(line1)}${isSelected ? '<span class="gpSelectedPill">Selected</span>' : ''}</div><div class="gpTeeLine2">${esc(line2)}</div></div>`;
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

    // Trigger-2 Check: Is this an existing player in a pairing?
    const ghin = safe(state.pendingPlayer.ghin);
    const existing = state.players.find(p => safe(p.dbPlayers_PlayerGHIN) === ghin);
    let wasPaired = false;
    if (existing) {
      const comp = state.game?.dbGames_Competition || "PairField";
      const pid = safe(existing.dbPlayers_PairingID || "000");
      const fid = safe(existing.dbPlayers_FlightID || "");
      wasPaired = (comp === "PairPair") ? (pid !== "000" && fid !== "" && fid !== "0") : (pid !== "000");
    }

    const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player: state.pendingPlayer, selectedTee: state.selectedTee });
    if (!res?.ok) {
      MA.setStatus(res?.message || "Unable to save player", "danger");
      return;
    }
    closeTeeModal();
    if (ghin.startsWith("NH")) MA.ghinSearch.close && MA.ghinSearch.close();
    state.pendingPlayer = null;

    // Trigger-2 Action: Recalc PH/SO if paired
    if (wasPaired) {
      MA.setStatus("Calculating shots off...", "info");
      try {
        await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "player", id: ghin });
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    await refreshFavorites();
    renderBody();
    MA.setStatus("Player added/updated.", "success");
  }

  async function onDeleteRow(e){
    const ghin = e.currentTarget.closest(".gpRow")?.getAttribute("data-ghin");
    if (!ghin) return;

    // Trigger-2 Check: Was player paired?
    const p = state.players.find(x => safe(x.dbPlayers_PlayerGHIN) === safe(ghin));
    let wasPaired = false;
    let pid = "000";
    let fid = "";
    let comp = "PairField";

    if (p) {
      comp = state.game?.dbGames_Competition || "PairField";
      pid = safe(p.dbPlayers_PairingID || "000");
      fid = safe(p.dbPlayers_FlightID || "");
      wasPaired = (comp === "PairPair") ? (pid !== "000" && fid !== "" && fid !== "0") : (pid !== "000");
    }

    const res = await MA.postJson(MA.paths.gamePlayersDelete, { playerGHIN: ghin });
    if (!res?.ok) return MA.setStatus("Unable to delete player", "danger");

    // Trigger-2 Action: Recalc group
    if (wasPaired) {
      MA.setStatus("Calculating shots off...", "info");
      try {
        if (comp === "PairPair") {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "flight", id: fid });
        } else {
          await MA.postJson(`${apiGHIN}/calcPHSO.php`, { action: "pairing", id: pid });
        }
      } catch (e) { console.error(e); }
    }

    await refreshPlayers();
    await refreshFavorites();
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
