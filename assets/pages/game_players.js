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
    portal: init.portal || "",
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
    multiAddMode: false,
    multiAddSelected: [],
    multiAddBusy: false,
    importText: "",
    importRows: [],
    importMode: "entry",     // entry | review
    importBusy: false,
    courseTeePayload: init.courseTeePayload || null,
    importTeeOptions: [],
    importSelectedTeeId: "",
    importSelectedTee: null,
    ghinState: "",
    ghinLast: "",
    ghinFirst: "",
    ghinClub: "",
    ghinRows: [],
    ghinTruncated: false,
    ghinStatus: "",
  };

  function isImportDesktopEnabled(){
    return window.matchMedia("(min-width: 560px)").matches;
  }

  function getTabs(){
    const baseTabs = [
      { id: "roster", label: "Roster" },
      { id: "self", label: "Self" },
      { id: "favorites", label: "Favorites" },
      { id: "ghin", label: "GHIN" },
      { id: "nonrated", label: "Non-Rated" }
    ];
    if (isImportDesktopEnabled()) baseTabs.push({ id: "import", label: "Import" });
    return baseTabs;
  }

  const el = {
    tabStrip: document.getElementById("gpTabStrip"),
    controls: document.getElementById("gpTabControls"),
    body: document.getElementById("gpBody"),
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
  function getFavoriteLastTee(f){
    return safe(f?.lastCourse?.teeSetName || "");
  }
  function getFavoriteLastTeeId(f){
    return safe(f?.lastCourse?.teeSetId || "");
  }

  function getFilteredFavorites(){
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

    return filtered;
  }

  function isFavoriteSelected(ghin){
    return state.multiAddSelected.includes(safe(ghin));
  }

  function toggleFavoriteSelected(ghin){
    const id = safe(ghin);
    if (!id) return;
    if (isFavoriteSelected(id)) {
      state.multiAddSelected = state.multiAddSelected.filter(x => x !== id);
    } else {
      state.multiAddSelected = state.multiAddSelected.concat(id);
    }
    renderControls();
    renderBody();
  }

  function beginMultiAddMode(){
    state.multiAddMode = true;
    state.multiAddSelected = [];
    renderControls();
    renderBody();
  }

  function cancelMultiAddMode(){
    state.multiAddMode = false;
    state.multiAddSelected = [];
    renderControls();
    renderBody();
  }

  function toggleAllVisibleFavorites(){
    const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
    const visibleSelectable = getFilteredFavorites()
      .map(f => safe(f.playerGHIN))
      .filter(Boolean)
      .filter(ghin => !enrolledSet.has(ghin));

    const allSelected = visibleSelectable.length > 0 && visibleSelectable.every(ghin => isFavoriteSelected(ghin));

    state.multiAddSelected = allSelected ? [] : visibleSelectable.slice();
    renderControls();
    renderBody();
  }
    function parseImportLines(text){
    return safe(text)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function buildEmptyImportPlayer(){
    return {
      ghin: "",
      first_name: "",
      last_name: "",
      name: "",
      gender: "",
      hi: ""
    };
  }

  function buildImportRow(raw){
    const trimmed = safe(raw).trim();
    return {
      source: "ghin",
      raw: trimmed,
      ghin: trimmed,
      ok: false,
      status: "",
      error: "",
      player: buildEmptyImportPlayer()
    };
  }

  function canImportAllRows(){
    return state.importRows.length > 0 && state.importRows.every(r => r.ok) && !!state.importSelectedTeeId;
  }

  function hydrateImportTeeOptionsFromPayload(){
    const payload = state.courseTeePayload || {};
    const teeSets = Array.isArray(payload.TeeSets) ? payload.TeeSets : [];

    state.importTeeOptions = teeSets
      .filter(t => safe(t.TeeSetStatus) === "Active")
      .map(t => {
        const totalRating = Array.isArray(t.Ratings)
          ? t.Ratings.find(r => safe(r.RatingType) === "Total")
          : null;

        return {
          teeSetID: safe(t.TeeSetRatingId || ""),
          teeSetName: safe(t.TeeSetRatingName || ""),
          gender: safe(t.Gender || ""),
          teeSetYards: safe(t.TotalYardage || ""),
          teeSetSlope: safe(totalRating?.SlopeRating || ""),
          teeSetRating: safe(totalRating?.CourseRating || "")
        };
      })
      .sort((a, b) => {
        const genderDiff = safe(b.gender).localeCompare(safe(a.gender));
        if (genderDiff !== 0) return genderDiff;

        return Number(b.teeSetYards || 0) - Number(a.teeSetYards || 0);
      });
    }

  async function ensureImportTeeOptions(){
    if (state.importTeeOptions.length) return;

    hydrateImportTeeOptionsFromPayload();

    if (!state.importTeeOptions.length) {
      MA.setStatus("No course tee sets were provided for this game.", "warn");
    }
  }

  function getImportSelectedTee(){
    return state.importTeeOptions.find(t =>
      String(t.teeSetID || t.value || "") === String(state.importSelectedTeeId || "")
    ) || null;
  }

  function resetImportMode(){
    state.importMode = "entry";
    state.importRows = [];
  }

  function showBusyModal(message){
    let overlay = document.getElementById("gpBusyModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "gpBusyModal";
      overlay.className = "maModalOverlay is-open";
      overlay.innerHTML = `
        <section class="maModal" role="dialog" aria-modal="true" aria-labelledby="gpBusyTitle">
          <header class="maModal__hdr">
            <div id="gpBusyTitle" class="maModal__title">Working</div>
          </header>
          <div class="maModal__body">
            <div id="gpBusyMessage" class="gpBusyMessage"></div>
          </div>
        </section>
      `;
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add("is-open");
    }

    const msg = document.getElementById("gpBusyMessage");
    if (msg) msg.textContent = message || "Processing...";
    document.body.classList.add("maOverlayOpen");
  }

  function updateBusyModal(message){
    const msg = document.getElementById("gpBusyMessage");
    if (msg) msg.textContent = message || "Processing...";
  }

  function hideBusyModal(){
    const overlay = document.getElementById("gpBusyModal");
    if (overlay) overlay.classList.remove("is-open");
    document.body.classList.remove("maOverlayOpen");
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
    await refreshPlayers();
    await refreshFavorites();
    if (isImportDesktopEnabled()) await ensureImportTeeOptions();
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
      const isPlayer = (state.portal === "PLAYER PORTAL");
      const visible = isPlayer 
        ? ["player", "roster", "summary"] 
        : ["admin", "edit", "roster", "pairings", "teetimes", "summary"];

      MA.chrome.setBottomNav({ visible: visible, active:"roster", onNavigate:(id)=>MA.routerGo(id) });
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
        const tabs = getTabs();
    el.tabStrip.innerHTML = tabs.map(t=>`<button class="maSegBtn ${state.activeTab===t.id?"is-active":""}" data-tab="${t.id}" role="tab" aria-selected="${state.activeTab===t.id?"true":"false"}">${esc(t.label)}</button>`).join("");

    el.tabStrip.querySelectorAll(".maSegBtn").forEach(btn=>btn.addEventListener("click", async ()=>{
      state.activeTab = btn.dataset.tab;
      if (state.activeTab === "favorites") await refreshFavorites();
      if (state.activeTab === "import") await ensureImportTeeOptions();
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
        <div class="maField gpFieldClub"><div class="maInputWrap gpInputClearWrap"><input id="gpGhinClub" class="maTextInput" placeholder="Club name (optional)" value="${esc(state.ghinClub)}"><button id="gpGhinClubClear" class="clearBtn ${state.ghinClub ? "" : "isHidden"}" type="button" aria-label="Clear club name">×</button></div></div>
        <div class="maField gpFieldBtn"><button id="gpBtnSearchGhin" class="btn btnPrimary" type="button">Search</button></div>
      </div>`;
      const inpState = document.getElementById("gpGhinState");
      const inpLast = document.getElementById("gpGhinLast");
      const inpFirst = document.getElementById("gpGhinFirst");
      const inpClub = document.getElementById("gpGhinClub");
      const clrLast = document.getElementById("gpGhinLastClear");
      const clrFirst = document.getElementById("gpGhinFirstClear");
      const clrClub = document.getElementById("gpGhinClubClear");
      const doSearch = ()=>searchGHINTab();
      if (inpState) inpState.oninput = ()=>{ state.ghinState = normalizeState(inpState.value); inpState.value = state.ghinState; };
      if (inpLast) inpLast.oninput = ()=>{ state.ghinLast = safe(inpLast.value); if (clrLast) clrLast.classList.toggle("isHidden", !state.ghinLast); };
      if (inpFirst) inpFirst.oninput = ()=>{ state.ghinFirst = safe(inpFirst.value); if (clrFirst) clrFirst.classList.toggle("isHidden", !state.ghinFirst); };
      if (inpClub) inpClub.oninput = ()=>{ state.ghinClub = safe(inpClub.value); if (clrClub) clrClub.classList.toggle("isHidden", !state.ghinClub); };
      if (clrLast) clrLast.onclick = ()=>{ state.ghinLast=""; if (inpLast) inpLast.value=""; clrLast.classList.add("isHidden"); inpLast && inpLast.focus(); };
      if (clrFirst) clrFirst.onclick = ()=>{ state.ghinFirst=""; if (inpFirst) inpFirst.value=""; clrFirst.classList.add("isHidden"); inpFirst && inpFirst.focus(); };
      if (clrClub) clrClub.onclick = ()=>{ state.ghinClub=""; if (inpClub) inpClub.value=""; clrClub.classList.add("isHidden"); inpClub && inpClub.focus(); };
      [inpState, inpLast, inpFirst, inpClub].forEach((n)=>{ if (!n) return; n.onkeydown = (e)=>{ if (e.key === "Enter") doSearch(); }; });
      document.getElementById("gpBtnSearchGhin").onclick = doSearch;
      return;
    }
    if (state.activeTab === "favorites") {
      const opts = ["All groups"].concat(state.groups || []).map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join("");

      const actionButtons = state.multiAddMode
        ? `
          <div class="gpFavBtnRow">
            <button id="gpBtnSelectTee" class="btn btnSecondary" type="button" ${state.multiAddSelected.length ? "" : "disabled"}>
              Select Tee${state.multiAddSelected.length ? ` (${state.multiAddSelected.length})` : ""}
            </button>
            <button id="gpBtnCancelMulti" class="btn btnSecondary" type="button">Cancel Multi-Select</button>
          </div>
        `
        : `
          <div class="gpFavBtnRow">
            <button id="gpBtnMultiAdd" class="btn btnSecondary" type="button">Multi-Add</button>
            <button id="gpBtnFavoritesPage" class="btn btnSecondary" type="button">Manage Favorites</button>
          </div>
        `;

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
        <div class="maField gpFieldBtn">${actionButtons}</div>
      </div>`;

      el.controls.innerHTML += `<div class="maFieldRow"><div class="maField"><div id="gpFavHint" class="maHelpText gpHint ${state.favBroadened ? "" : "isHidden"}">No match in selected group — showing all groups.</div></div></div>`;

      const sel = document.getElementById("gpFavGroup");
      if (sel) {
        sel.value = state.favGroupFilter;
        sel.onchange = () => {
          state.favGroupFilter = safe(sel.value) || "All groups";
          renderControls();
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
        if (inp) {
          inp.value = "";
          inp.focus();
        }
        clr.classList.add("isHidden");
        renderBody();
      };

      const btnManage = document.getElementById("gpBtnFavoritesPage");
      if (btnManage) btnManage.onclick = () => MA.routerGo("favorites", { returnTo: "roster" });

      const btnMulti = document.getElementById("gpBtnMultiAdd");
      if (btnMulti) btnMulti.onclick = beginMultiAddMode;

      const btnCancel = document.getElementById("gpBtnCancelMulti");
      if (btnCancel) btnCancel.onclick = cancelMultiAddMode;

      const btnSelectTee = document.getElementById("gpBtnSelectTee");
      if (btnSelectTee) btnSelectTee.onclick = beginBatchTeeFlow;

      return;
    }
    if (state.activeTab === "import") {
      const teeOptions = state.importTeeOptions || [];
      const teeValue = safe(state.importSelectedTeeId);
      const teeOptionsHtml = [`<option value="">Select Tee</option>`].concat(
        teeOptions.map(t => {
          const id = safe(t.teeSetID || "");
          const name = safe(t.teeSetName || "");
          const gender = safe(t.gender || "");
          const yards = safe(t.teeSetYards || "");
          const slope = safe(t.teeSetSlope || "");
          const rating = safe(t.teeSetRating || "");

          const label = [
            //id,  hide the teesetid from dropdown
            gender && `(${gender.charAt(0)})`,
            name,
            yards && `${yards} yds`,
            slope && `Slope ${slope}`,
            rating && `CR ${rating}`
          ].filter(Boolean).join(" • ");

          return `<option value="${esc(id)}">${esc(label)}</option>`;
        })
      ).join("");

      if (state.importMode === "entry") {
        el.controls.innerHTML = `<div class="maFieldRow gpImportRow">
          <div class="maField gpFieldTeeImport">
            <select id="gpImportTee" class="maTextInput">${teeOptionsHtml}</select>
          </div>
          <div class="maField gpFieldBtn">
            <div class="gpFavBtnRow">
              <button id="gpBtnImportEvaluate" class="btn btnSecondary" type="button">Evaluate</button>
            </div>
          </div>
        </div>
        <div class="maFieldRow">
          <div class="maField">
            <div class="maHelpText">Enter one player GHIN number per line.</div>
          </div>
        </div>`;

        const sel = document.getElementById("gpImportTee");
        if (sel) {
          sel.value = teeValue;
          sel.onchange = () => {
            state.importSelectedTeeId = safe(sel.value);
            state.importSelectedTee = getImportSelectedTee();
          };
        }

        const btnEval = document.getElementById("gpBtnImportEvaluate");
        if (btnEval) btnEval.onclick = evaluateImportRows;
        return;
      }

      const selectedTee = getImportSelectedTee();
      const teeDisplay = selectedTee
        ? `${safe(selectedTee.teeSetName || selectedTee.label || selectedTee.name || "")}`
        : "No tee selected";

      el.controls.innerHTML = `<div class="maFieldRow gpImportRow">
        <div class="maField">
          <div class="maHelpText">Assigned Tee: ${esc(teeDisplay)}</div>
        </div>
        <div class="maField gpFieldBtn">
          <div class="gpFavBtnRow">
            <button id="gpBtnImportBack" class="btn btnSecondary" type="button">Back</button>
            <button id="gpBtnImportRun" class="btn btnSecondary" type="button" ${canImportAllRows() ? "" : "disabled"}>Import</button>
          </div>
        </div>
      </div>`;

      const btnBack = document.getElementById("gpBtnImportBack");
      if (btnBack) btnBack.onclick = () => { resetImportMode(); render(); };

      const btnRun = document.getElementById("gpBtnImportRun");
      if (btnRun) btnRun.onclick = beginImportBatch;
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
        const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        return `<div class="maListRow gpRow gpRow--ghin ${isEnrolled ? "" : "gpRowClickable"}" data-act="ghin-row" data-ghin="${esc(ghin)}" data-disabled="${isEnrolled ? "1" : "0"}">
          <div class="maListRow__col">${esc(r.name || ghin)}${club ? ` • ${esc(club)}` : ""}</div>
          <div class="maListRow__col maListRow__col--right">${esc(r.hi || "")}</div>
          <div class="maListRow__col maListRow__col--right">${esc(r.gender || "")}</div>
          <div class="maListRow__col maListRow__col--right gpEnrolledMark">${isEnrolled ? checkIcon : ""}</div>
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
        if (state.activeTab === "import") {
      if (state.importMode === "entry") {
        el.body.innerHTML = `<section class="maPanel gpImportPanel">
          <div class="maField">
            <textarea id="gpImportText" class="maTextInput gpImportText" placeholder="6105388&#10;1234567&#10;7654321">${esc(state.importText)}</textarea>
          </div>
        </section>`;

        const ta = document.getElementById("gpImportText");
        if (ta) {
          ta.oninput = () => {
            state.importText = safe(ta.value);
          };
        }
        return;
      }

      const rows = state.importRows.map((r) => {
        const p = r.player || buildEmptyImportPlayer();
        const tee = getImportSelectedTee();
        const teeId = safe(tee?.teeSetID || tee?.value || "");
        const teeName = safe(tee?.teeName || tee?.label || tee?.name || "");
        return `<div class="maListRow gpRow gpRow--import">
          <div class="maListRow__col">${esc(r.ghin || r.raw)}</div>
          <div class="maListRow__col">${esc(p.name || "")}</div>
          <div class="maListRow__col maListRow__col--right">${esc(p.gender || "")}</div>
          <div class="maListRow__col maListRow__col--right">${esc(p.hi || "")}</div>
          <div class="maListRow__col">${esc(teeName)}</div>
          <div class="maListRow__col">${esc(r.status)}</div>
        </div>`;
      }).join("");

      el.body.innerHTML = `<section class="maPanel gpImportPanel">
        <div class="maListRow maListRow--hdr gpRow--import">
          <div class="maListRow__col">GHIN</div>
          <div class="maListRow__col">Name</div>
          <div class="maListRow__col maListRow__col--right">G</div>
          <div class="maListRow__col maListRow__col--right">HI</div>
          <div class="maListRow__col">Tee Name</div>
          <div class="maListRow__col">Status</div>
        </div>
        <div class="maListRows">${rows || `<div class="gpEmpty">No import rows evaluated.</div>`}</div>
      </section>`;
      return;
    }

    if (state.activeTab === "favorites") {
      const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const filtered = getFilteredFavorites();

      const grpEl = document.getElementById("gpFavGroup");
      if (grpEl && grpEl.value !== state.favGroupFilter) grpEl.value = state.favGroupFilter;
      const hintEl = document.getElementById("gpFavHint");
      if (hintEl) hintEl.classList.toggle("isHidden", !state.favBroadened);

      if (!state.multiAddMode) {
        const favRows = filtered.map((f) => {
          const g = safe(f.playerGHIN);
          const n = safe(f.name || f.playerName);
          const enrolled = enrolledSet.has(g);
          const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

          return `<div class="maListRow gpRow gpRow--ghin ${enrolled ? "" : "gpRowClickable"}" data-fav-ghin="${esc(g)}" data-act="addfav" data-disabled="${enrolled ? "1" : "0"}">
            <div class="maListRow__col">${esc(n)}</div>
            <div class="maListRow__col maListRow__col--right"></div>
            <div class="maListRow__col maListRow__col--right">${esc(f.gender || "")}</div>
            <div class="maListRow__col maListRow__col--right gpEnrolledMark">${enrolled ? checkIcon : ""}</div>
          </div>`;
        }).join("");

        el.body.innerHTML = `<section class="maPanel">
          <div class="maListRow maListRow--hdr gpRow--ghin">
            <div class="maListRow__col">Favorites</div>
            <div class="maListRow__col maListRow__col--right">HI</div>
            <div class="maListRow__col maListRow__col--right">G</div>
            <div class="maListRow__col"></div>
          </div>
          <div class="maListRows">${favRows || `<div class="gpEmpty">No favorites found.</div>`}</div>
        </section>`;

        el.body.querySelectorAll("[data-act='addfav']").forEach(r=>r.onclick = (e) => {
          if (r.getAttribute("data-disabled") === "1") return;
          onAddFavoriteRow(e);
        });
        return;
      }

      const visibleSelectable = filtered
        .map(f => safe(f.playerGHIN))
        .filter(Boolean)
        .filter(ghin => !enrolledSet.has(ghin));

      const allSelected = visibleSelectable.length > 0 && visibleSelectable.every(ghin => isFavoriteSelected(ghin));
      const hdrToggleText = allSelected ? "Clear" : "All";

      const favRows = filtered.map((f) => {
        const g = safe(f.playerGHIN);
        const n = safe(f.name || f.playerName);
        const enrolled = enrolledSet.has(g);
        const selected = isFavoriteSelected(g);
        const lastTee = getFavoriteLastTee(f);
        const checkIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        const checkIconSm = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        return `<div class="maListRow gpRow gpRow--favMulti ${selected ? "is-multiSelected" : ""} ${enrolled ? "is-multiDisabled" : "gpRowClickable"}" data-fav-ghin="${esc(g)}" data-act="multifav" data-disabled="${enrolled ? "1" : "0"}">
          <div class="maListRow__col">
            <button type="button" class="gpMultiCheck ${selected ? "is-on" : ""}" ${enrolled ? "disabled" : ""} aria-label="${selected ? "Deselect player" : "Select player"}">${selected ? checkIconSm : ""}</button>
          </div>
          <div class="maListRow__col">
            ${esc(n)}
            <div class="maListRow__col--muted gpLastTee">${esc(lastTee || "—")}</div>
          </div>
          <div class="maListRow__col maListRow__col--right">${esc(f.gender || "")}</div>
          <div class="maListRow__col maListRow__col--right gpEnrolledMark">${enrolled ? checkIcon : ""}</div>
        </div>`;
      }).join("");

      el.body.innerHTML = `<section class="maPanel">
        <div class="maListRow maListRow--hdr gpRow--favMulti">
          <div class="maListRow__col"><button type="button" id="gpHdrToggleAll" class="gpMultiHdrToggle">${hdrToggleText}</button></div>
          <div class="maListRow__col">Favorites</div>
          <div class="maListRow__col maListRow__col--right">G</div>
          <div class="maListRow__col maListRow__col--right">In</div>
        </div>
        <div class="maListRows">${favRows || `<div class="gpEmpty">No favorites found.</div>`}</div>
      </section>`;

      const hdrBtn = document.getElementById("gpHdrToggleAll");
      if (hdrBtn) hdrBtn.onclick = toggleAllVisibleFavorites;

      el.body.querySelectorAll("[data-act='multifav']").forEach(r => {
        r.onclick = () => {
          if (r.getAttribute("data-disabled") === "1") return;
          toggleFavoriteSelected(r.getAttribute("data-fav-ghin"));
        };
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

      const heartIcon = isFav 
        ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

      return `<div class="maListRow gpRow gpRow--roster" data-ghin="${esc(ghin)}">
        <div class="maListRow__col">${esc(nameLine)}<div class="maListRow__col--muted gpSub">${esc(meta)}</div></div>
        <button class="iconBtn btnSecondary" data-act="fav" title="Favorites" aria-label="Favorites">${heartIcon}</button>
        <button class="iconBtn btnPrimary" data-act="del" title="Remove" aria-label="Remove"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
    await beginTeeFlow({
      ghin,
      first_name:first,
      last_name:last,
      gender:safe(row.gender || "M"),
      hi:safe(row.hi || "0"),
      recentTeeSetId: getFavoriteLastTeeId(row)
    });
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
    const club = safe(state.ghinClub).trim();
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
      : { mode, state: stateCode, lastName: lastOrId, firstName: first, clubName: club };
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
    async function evaluateImportRows(){
    if (state.importBusy) return;

    const selectedTee = getImportSelectedTee();
    if (!selectedTee) {
      MA.setStatus("Select a tee before evaluating import rows.", "warn");
      return;
    }

    const lines = parseImportLines(state.importText);
    if (!lines.length) {
      MA.setStatus("Enter at least one GHIN number.", "warn");
      return;
    }

    state.importBusy = true;
    showBusyModal("Evaluating GHIN list...");

    try {
      const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
      const seen = new Set();
      const rows = [];

      let index = 0;
      for (const raw of lines) {
        index += 1;
        updateBusyModal(`Evaluating ${index} of ${lines.length}...`);

        const row = buildImportRow(raw);
        const ghin = safe(row.ghin);

        if (!/^\d+$/.test(ghin)) {
          row.ok = false;
          row.status = "Invalid GHIN";
          row.error = "GHIN must be numeric";
          rows.push(row);
          continue;
        }

        if (seen.has(ghin)) {
          row.ok = false;
          row.status = "Duplicate in input";
          row.error = "Duplicate GHIN in pasted list";
          rows.push(row);
          continue;
        }
        seen.add(ghin);

        if (enrolledSet.has(ghin)) {
          row.ok = false;
          row.status = "Already in roster";
          row.error = "Player is already in the roster";
          rows.push(row);
          continue;
        }

        const res = await MA.postJson(MA.paths.ghinPlayerSearch, { mode: "id", ghin });
        const hit = Array.isArray(res?.payload?.rows) ? res.payload.rows[0] : null;

        if (!res?.ok || !hit) {
          row.ok = false;
          row.status = "GHIN not found";
          row.error = "No GHIN player found";
          rows.push(row);
          continue;
        }

        const nm = splitName(hit.name || "");
        row.ok = true;
        row.status = "OK";
        row.error = "";
        row.player = {
          ghin: safe(hit.ghin || ghin),
          first_name: safe(nm.first),
          last_name: safe(nm.last),
          name: safe(hit.name || ""),
          gender: safe(hit.gender || ""),
          hi: safe(hit.hi || "")
        };
        rows.push(row);
      }

      state.importRows = rows;
      state.importSelectedTee = selectedTee;
      state.importMode = "review";
      render();
      if (canImportAllRows()) MA.setStatus(`Evaluated ${rows.length} rows. All rows valid.`, "success");
      else MA.setStatus(`Evaluated ${rows.length} rows. Fix errors before import.`, "warn");
    } finally {
      state.importBusy = false;
      hideBusyModal();
    }
  }

  async function beginImportBatch(){
    if (state.importBusy) return;
    if (!canImportAllRows()) {
      MA.setStatus("All rows must be valid before import can proceed.", "warn");
      return;
    }
    const selectedTee = getImportSelectedTee();
    if (!selectedTee) {
      MA.setStatus("Select a tee before importing.", "warn");
      return;
    }
    await commitImportBatch(state.importRows.slice(), selectedTee);
  }

  async function commitImportBatch(rows, selectedTee){
    if (!rows.length || !selectedTee) return;
    state.importBusy = true;
    showBusyModal(`Importing ${rows.length} players...`);

    let added = 0;
    let failed = 0;

    try {
      let index = 0;
      for (const row of rows) {
        index += 1;
        updateBusyModal(`Importing ${index} of ${rows.length} players...`);

        const p = row.player || buildEmptyImportPlayer();
        const player = {
          ghin: safe(p.ghin),
          first_name: safe(p.first_name),
          last_name: safe(p.last_name),
          gender: safe(p.gender),
          hi: safe(p.hi)
        };

        const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee });
        if (res?.ok) added++;
        else failed++;
      }

      await refreshPlayers();
      await refreshFavorites();
      state.importText = "";
      state.importRows = [];
      state.importMode = "entry";
      render();

      if (failed) MA.setStatus(`Imported ${added} players. ${failed} failed.`, "warn");
      else MA.setStatus(`Imported ${added} players.`, "success");
    } finally {
      state.importBusy = false;
      hideBusyModal();
    }
  }

  async function beginBatchTeeFlow(){
    if (state.multiAddBusy) return;

    const enrolledSet = new Set((state.players || []).map((p) => safe(p.dbPlayers_PlayerGHIN)));
    const filtered = getFilteredFavorites();
    const selectedRows = filtered.filter((f) => {
      const g = safe(f.playerGHIN);
      return state.multiAddSelected.includes(g) && !enrolledSet.has(g);
    });

    if (!selectedRows.length) {
      MA.setStatus("Select at least one favorite.", "warn");
      return;
    }

    const genders = Array.from(new Set(selectedRows.map(f => safe(f.gender || "").toUpperCase()).filter(Boolean)));
    if (genders.length > 1) {
      MA.setStatus("Multi-Add currently requires selected favorites to share the same gender.", "warn");
      return;
    }

    const firstRow = selectedRows[0];
    const parts = safe(firstRow.name || firstRow.playerName || "").split(" ");
    const proxyPlayer = {
      ghin: safe(firstRow.playerGHIN),
      first_name: parts.slice(0, -1).join(" ") || safe(firstRow.name || firstRow.playerName || ""),
      last_name: parts.slice(-1).join(""),
      gender: safe(firstRow.gender || "M"),
      hi: safe(firstRow.hi || "0")
    };

    const g = state.game || {};
    const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();

    MA.TeeSetSelection.open({
      mode: "batch",
      gameId,
      player: proxyPlayer,
      subtitle: `Apply one tee to ${selectedRows.length} selected players`,
      onSaveBatch: async (selectedTee) => {
        await commitBatchPending(selectedRows, selectedTee);
      }
    });
  }

  async function commitBatchPending(selectedRows, selectedTee){
    if (!selectedRows.length || !selectedTee) return;
      state.multiAddBusy = true;
      showBusyModal(`Adding ${selectedRows.length} selected favorites...`);

    let added = 0;
    let failed = 0;

    try {
      let index = 0;
      for (const row of selectedRows) {
        index += 1;
        updateBusyModal(`Adding ${index} of ${selectedRows.length} selected favorites...`);

        const fullName = safe(row.name || row.playerName || "");
        const parts = fullName.split(" ");
        const first = parts.slice(0, -1).join(" ") || fullName;
        const last = parts.slice(-1).join("");

        const player = {
          ghin: safe(row.playerGHIN),
          first_name: first,
          last_name: last,
          gender: safe(row.gender || "M"),
          hi: safe(row.hi || "0")
        };

        const res = await MA.postJson(MA.paths.gamePlayersUpsert, { player, selectedTee });
        if (res?.ok) added++;
        else failed++;
      }

      await refreshPlayers();
      await refreshFavorites();
      state.multiAddSelected = [];
      state.multiAddMode = false;
      render();

      if (failed) MA.setStatus(`Added ${added} favorites. ${failed} failed.`, "warn");
      else MA.setStatus(`Added ${added} favorites.`, "success");
    } finally {
      state.multiAddBusy = false;
      hideBusyModal();
    }
  }

    async function beginTeeFlow(player){
      state.pendingPlayer = Object.assign({}, player);

      const g = state.game || {};
      const gameId = String(g.dbGames_GGID || g.dbGames_GGIDnum || g.ggid || "").trim();

      MA.TeeSetSelection.open({
        gameId,
        player: state.pendingPlayer,
        currentTeeSetId: safe(state.pendingPlayer.selectedTeeSetId || ""),
        recentTeeSetId: safe(state.pendingPlayer.recentTeeSetId || ""),
        onSave: async (selectedTee) => {
          state.selectedTee = selectedTee || null;
          await commitPending();
        }
      });
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
