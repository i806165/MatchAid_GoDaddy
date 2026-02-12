/* /assets/pages/game_settings.js
   Game Settings page controller.
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};
  const init = window.__MA_INIT__ || {};

  // API routes
  const routes = MA.routes || {};
  const apiBase = routes.apiGameSettings || "/api/game_settings";
  const returnToUrl = routes.returnTo || "/app/admin_games/gameslist.php";

  // ---- Definitions ----
  // Exact replica of Wix configuration objects
    const stablefordTemplate = [
            { reltoPar: -3, defaultPoints: 5 },
            { reltoPar: -2, defaultPoints: 4 },
            { reltoPar: -1, defaultPoints: 3 },
            { reltoPar: 0, defaultPoints: 2 },
            { reltoPar: 1, defaultPoints: 1 },
            { reltoPar: 2, defaultPoints: 0 }
    ];

  const gameFormatConfig = {
    StrokePlay: { label: 'Stroke Play', basis: 'Strokes', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair', 'PairField'] },
    Stableford: { label: 'Stableford', basis: 'Points', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair', 'PairField'] },
    MatchPlay: { label: 'Match Play', basis: 'Holes', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair'] },
    Skins: { label: 'Skins', basis: 'Skins', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair'] },
    Scramble: { label: 'Scramble', basis: 'Strokes', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair', 'PairField'] },
    Shamble: { label: 'Shamble', basis: 'Strokes', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair', 'PairField'] },
    AltShot: { label: 'Alt-Shot', basis: 'Strokes', methods: ['NET', 'ADJ GROSS'], competition: ['PairPair', 'PairField'] },
  };

  const competitionConfig = {
    PairPair: { label: 'Pair vs. Pair', value: 'PairPair' },
    PairField: { label: 'Pair vs. Field', value: 'PairField' },
  };

  const scoringSystemOptions = [
    { label: 'All Scores', value: 'AllScores' },
    { label: 'Best Ball', value: 'BestBall' },
    { label: 'Hole Declarations', value: 'DeclareHole' },
    { label: 'Game Declarations', value: 'DeclarePlayer' }
  ];

  const toMethodOptions = [
    { label: 'ShotGun', value: 'ShotGun' },
    { label: 'Tee Times', value: 'TeeTimes' }
  ];

  const hcMethodOptions = [
    { label: 'CH with Allowance', value: 'CH' },
    { label: 'Shots-Off', value: 'SO' }
  ];

  const allowanceOptions = (() => {
    const HA = [];
    for (let i = 0; i <= 20; i++) {
      const val = 100 - (i * 5);
      HA.push({ label: val + '%', value: String(val) });
    }
    return HA;
  })();

  const strokeDistOptions = [
    { label: 'Standard stroke allocation', value: 'Standard' },
    { label: 'Strokes distributed across spins', value: 'Balanced' },
    { label: "Round HCP's and distribute across spins", value: 'Balanced-Rounded' }
  ];

  const hcEffectivityOptions = [
    { label: 'Play Date', value: 'PlayDate' },
    { label: '3-Month Low', value: 'Low3' },
    { label: '6-Month Low', value: 'Low6' },
    { label: '12-Month Low', value: 'Low12' },
    { label: 'Choose Date', value: 'Date' },
  ];

  // Additional static lists needed for UI but not in snippet
  const scoringBasisOptions = [
    { label: 'Strokes', value: 'Strokes' },
    { label: 'Points', value: 'Points' },
    { label: 'Holes', value: 'Holes' },
    { label: 'Skins', value: 'Skins' }
  ];

  const segmentsOptions = [  
    { label: 'All 18', value: '18' },
    { label: 'Front 9', value: 'F9' },
    { label: 'Back 9', value: 'B9' }
  ];

  const rotationOptions = [
    { label: 'None', value: 'None' },
    { label: '6/6/6', value: '666' },
    { label: '9/9', value: '99' }
  ];

  const bestBallOptions = [
    { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }
  ];

  const playerDeclOptions = [
    { label: '9', value: '9' }, 
    { label: '10', value: '10' }, 
    { label: '11', value: '11' }, 
    { label: '12', value: '12' }, 
    { label: '13', value: '13' }, 
    { label: '14', value: '14' }
  ];

  const scoringMethodOptions = [
    { label: 'Net', value: 'NET' },
    { label: 'Gross', value: 'ADJ GROSS' }
  ];

  // ---- DOM ----
  const el = {
    tabs: document.getElementById("gsTabs"),
    panels: {
      general: document.getElementById("gsPanelGeneral"),
      scoring: document.getElementById("gsPanelScoring"),
      handicaps: document.getElementById("gsPanelHandicaps"),
    },
    // General Tab
    gameFormat: document.getElementById("gsGameFormat"),
    toMethod: document.getElementById("gsTOMethod"),
    scoringBasis: document.getElementById("gsScoringBasis"),
    competition: document.getElementById("gsCompetition"),
    segments: document.getElementById("gsSegments"),
    holesDisplay: document.getElementById("gsHoles"),
    rotation: document.getElementById("gsRotationMethod"),
    useBlind: document.getElementById("gsUseBlindPlayer"),
    blindPlayer: document.getElementById("gsBlindPlayer"),

    // Scoring Tab
    scoringMethod: document.getElementById("gsScoringMethod"),
    scoringSystem: document.getElementById("gsScoringSystem"),
    bestBallCnt: document.getElementById("gsBestBallCnt"),
    playerDecl: document.getElementById("gsPlayerDeclaration"),
    
    // Dynamic Cards
    cardHoleDecl: document.getElementById("gsCardHoleDecl"),
    listHoleDecl: document.getElementById("gsListHoleDecl"),
    cardStableford: document.getElementById("gsCardStableford"),
    listStableford: document.getElementById("gsListStableford"),
    resetStableford: document.getElementById("gsResetStableford"),

    // Handicaps Tab
    hcMethod: document.getElementById("gsHCMethod"),
    allowance: document.getElementById("gsAllowance"),
    strokeDistribution: document.getElementById("gsStrokeDistribution"),
    hcEffectivity: document.getElementById("gsHCEffectivity"),
    hcEffDate: document.getElementById("gsHCEffectivityDate"),
    divHCEffDate: document.getElementById("divHCEffDate"),
  };

  // ---- State ----
  const state = {
    ggid: null,
    game: null,
    roster: [],
    activeTab: "general",
    dirty: false,
    busy: false,
  };

  // ---- Utils ----
  function setBusy(on) {
    state.busy = !!on;
    const saveBtn = document.getElementById("chromeBtnRight");
    if (saveBtn) saveBtn.disabled = state.busy;
  }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) MA.setStatus("Unsaved changes.", "warn");
    else MA.setStatus("", "");
  }

  // ---- Chrome & Navigation ----
  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      const gameTitle = state.game?.dbGames_Title || `GGID ${state.ggid}`;
      chrome.setHeaderLines(["ADMIN PORTAL", "Game Settings", gameTitle]);
    }

    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left: { show: true, label: "Cancel", onClick: onCancel },
        right: { show: true, label: "Save", onClick: doSave }
      });
    }

    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary"],
        active: "settings",
        onNavigate: (id) => MA.routerGo(id)
      });
    }
  }

  function onCancel() {
    if (state.dirty) {
      if (!confirm("Discard unsaved changes and go back?")) return;
    }
    window.location.assign(returnToUrl);
  }

  // ---- Data & API ----
  async function doSave() {
    if (state.busy) return;
    MA.setStatus("Saving...", "info");
    setBusy(true);

    try {
      const patch = buildPatchFromUI();
      const res = await MA.postJson(`${apiBase}/saveGameSettings.php`, { patch });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      state.game = res.payload?.game || state.game;
      setDirty(false);
      MA.setStatus("Settings saved successfully.", "success");

    } catch (e) {
      console.error(e);
      MA.setStatus(e.message || "An error occurred during save.", "error");
    } finally {
      setBusy(false);
    }
  }

  function buildPatchFromUI() {
    const patch = {
      dbGames_GameFormat: el.gameFormat.value,
      dbGames_TOMethod: el.toMethod.value,
      dbGames_ScoringBasis: el.scoringBasis.value,
      dbGames_Competition: el.competition.value,
      dbGames_Segments: el.segments.value, // "18", "F9", etc.
      dbGames_RotationMethod: el.rotation.value,
      
      // Blind player logic
      dbGames_BlindPlayers: (el.useBlind.checked && el.blindPlayer.value) 
        ? [el.blindPlayer.value] 
        : [],

      dbGames_ScoringMethod: el.scoringMethod.value,
      dbGames_ScoringSystem: el.scoringSystem.value,
      dbGames_BestBall: el.bestBallCnt.value,
      dbGames_PlayerDeclaration: el.playerDecl.value,

      dbGames_HCMethod: el.hcMethod.value,
      dbGames_Allowance: parseInt(el.allowance.value || "100", 10),
      dbGames_StrokeDistribution: el.strokeDistribution.value,
      dbGames_HCEffectivity: el.hcEffectivity.value,
      dbGames_HCEffectivityDate: el.hcEffDate.value || null,

      // TODO: Collect dynamic HoleDecl and StablefordPoints from DOM
    };
    return patch;
  }

  // ---- Rendering ----
  function render() {
    const g = state.game || {};
    
    // General
    el.gameFormat.value = g.dbGames_GameFormat || "StrokePlay";
    // Run dependencies to set up options for Comp/Method based on Format
    updateDependencies();

    el.toMethod.value = g.dbGames_TOMethod || "TeeTimes";
    // el.scoringBasis is set by updateDependencies
    if (g.dbGames_Competition) el.competition.value = g.dbGames_Competition;
    el.segments.value = g.dbGames_Segments || "18";
    el.rotation.value = g.dbGames_RotationMethod || "None";
    
    // Blind Player
    const bp = Array.isArray(g.dbGames_BlindPlayers) ? g.dbGames_BlindPlayers[0] : "";
    el.useBlind.checked = !!bp;
    el.blindPlayer.value = bp || "";
    el.blindPlayer.disabled = !el.useBlind.checked;

    // Scoring
    if (g.dbGames_ScoringMethod) el.scoringMethod.value = g.dbGames_ScoringMethod;
    el.scoringSystem.value = g.dbGames_ScoringSystem || "BestBall";
    el.bestBallCnt.value = g.dbGames_BestBall || "4";
    el.playerDecl.value = g.dbGames_PlayerDeclaration || "11";
    // Run dependencies again to set visibility based on Scoring System
    updateDependencies();

    // Handicaps
    el.hcMethod.value = g.dbGames_HCMethod || "CH";
    el.allowance.value = String(g.dbGames_Allowance ?? 100);
    el.strokeDistribution.value = g.dbGames_StrokeDistribution || "Standard";
    el.hcEffectivity.value = g.dbGames_HCEffectivity || "PlayDate";
    el.hcEffDate.value = g.dbGames_HCEffectivityDate || "";

    // Derived UI states
    updateHolesDisplay();
    toggleHCEffDate();
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    el.tabs.querySelectorAll(".maSegBtn").forEach(btn => {
      const on = btn.dataset.tab === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    Object.values(el.panels).forEach(panel => {
      if (panel) {
        panel.classList.toggle("is-active", panel.dataset.tabPanel === tabId);
      }
    });
  }

  // ---- UI Helpers ----
  function updateDependencies() {
    const fmt = el.gameFormat.value;
    const cfg = gameFormatConfig[fmt];

    if (cfg) {
      // 1. Basis (read-only driven by format)
      el.scoringBasis.value = cfg.basis;

      // 2. Competition Options (filter based on format config)
      const currComp = el.competition.value;
      const validComps = cfg.competition || [];
      const compOpts = validComps.map(k => competitionConfig[k]).filter(Boolean);
      
      el.competition.innerHTML = compOpts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      
      // Restore selection if valid, else default to first available
      if (validComps.includes(currComp)) {
        el.competition.value = currComp;
      } else if (compOpts.length > 0) {
        el.competition.value = compOpts[0].value;
      }

      // 3. Scoring Method Options (filter based on format config)
      const currMeth = el.scoringMethod.value;
      const validMeths = cfg.methods || [];
      const methOpts = scoringMethodOptions.filter(o => validMeths.includes(o.value));
      
      el.scoringMethod.innerHTML = methOpts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      
      if (validMeths.includes(currMeth)) {
        el.scoringMethod.value = currMeth;
      } else if (methOpts.length > 0) {
        el.scoringMethod.value = methOpts[0].value;
      }
    }

    // 4. Scoring System Visibility
    const sys = el.scoringSystem.value;
    const divBB = document.getElementById("divBestBall");
    const divPD = document.getElementById("divPlayerDecl");

    // Show Best Ball Count for team-aggregate styles
    const showBB = ["BestBall", "Aggregate", "Shamble", "Scramble", "AltShot", "Chapman"].includes(sys);
    if (divBB) divBB.style.visibility = showBB ? "visible" : "hidden";

    // Show Player Declaration for "Game Declarations"
    if (divPD) divPD.style.visibility = (sys === "DeclarePlayer") ? "visible" : "hidden";

    toggleDynamicCards();
  }

  function updateHolesDisplay() {
    // Mirror segments dropdown to read-only input if needed, or just rely on dropdown
    const txt = el.segments.options[el.segments.selectedIndex]?.text || "";
    el.holesDisplay.value = txt;
  }

  function toggleHCEffDate() {
    const show = el.hcEffectivity.value === "Date";
    el.divHCEffDate.style.visibility = show ? "visible" : "hidden";
  }

  function toggleDynamicCards() {
    const isPoints = el.scoringBasis.value === "Points";
    if (el.cardStableford) el.cardStableford.style.display = isPoints ? "" : "none";
    
    // Hole Decl logic (e.g. if Rotation is 666 or 99)
    const rot = el.rotation.value;
    const sys = el.scoringSystem.value;
    const showHoleDecl = (rot === "666" || rot === "99" || sys === "DeclareHole");
    if (el.cardHoleDecl) el.cardHoleDecl.style.display = showHoleDecl ? "" : "none";
  }

  // ---- Event Wiring ----
  function wireEvents() {
    el.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".maSegBtn");
      if (btn && !btn.disabled) {
        setActiveTab(btn.dataset.tab);
      }
    });

    function wireDirty(input) {
      if (!input) return;
      input.addEventListener("change", () => setDirty(true));
    }

    wireDirty(el.gameFormat);
    el.gameFormat.addEventListener("change", updateDependencies);
    wireDirty(el.toMethod);
    wireDirty(el.competition);
    wireDirty(el.segments);
    wireDirty(el.rotation);
    wireDirty(el.blindPlayer);
    
    wireDirty(el.scoringMethod);
    wireDirty(el.scoringSystem);
    el.scoringSystem.addEventListener("change", updateDependencies);
    wireDirty(el.bestBallCnt);
    wireDirty(el.playerDecl);

    wireDirty(el.hcMethod);
    wireDirty(el.allowance);
    wireDirty(el.strokeDistribution);
    wireDirty(el.hcEffectivity);
    wireDirty(el.hcEffDate);

    el.useBlind.addEventListener("change", () => {
        el.blindPlayer.disabled = !el.useBlind.checked;
        setDirty(true);
    });

    el.segments.addEventListener("change", updateHolesDisplay);
    el.hcEffectivity.addEventListener("change", toggleHCEffDate);
    el.scoringBasis.addEventListener("change", toggleDynamicCards);
    el.rotation.addEventListener("change", toggleDynamicCards);
  }

  // ---- Init ----
  function loadContext() {
    if (!init || !init.ok) {
      MA.setStatus("Failed to load game context.", "error");
      console.error("Missing or invalid __INIT__ payload.");
      return;
    }
    state.ggid = init.ggid;
    state.game = init.game;
    state.roster = init.roster || [];

    populateDropdowns();
    populateBlindPlayerSelect();
  }

  function populateDropdowns() {
    // Helper to map {label, value} array to HTML
    const fill = (id, opts) => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    };

    // Game Format (derived from config keys)
    const fmtOpts = Object.keys(gameFormatConfig).map(k => ({ label: gameFormatConfig[k].label, value: k }));
    
    fill("gsGameFormat", fmtOpts);
    fill("gsTOMethod", toMethodOptions);
    fill("gsScoringBasis", scoringBasisOptions);
    fill("gsCompetition", Object.values(competitionConfig)); // Initial fill, updated by dependencies
    fill("gsSegments", segmentsOptions);
    fill("gsRotationMethod", rotationOptions);
    fill("gsScoringMethod", scoringMethodOptions);
    fill("gsScoringSystem", scoringSystemOptions);
    fill("gsBestBallCnt", bestBallOptions);
    fill("gsPlayerDeclaration", playerDeclOptions);
    fill("gsHCMethod", hcMethodOptions);
    fill("gsAllowance", allowanceOptions);
    fill("gsStrokeDistribution", strokeDistOptions);
    fill("gsHCEffectivity", hcEffectivityOptions);
  }

  function populateBlindPlayerSelect() {
    el.blindPlayer.innerHTML = '<option value="">(None)</option>';
    if (!state.roster || !state.roster.length) return;

    // Sort roster by name
    const sorted = [...state.roster].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    sorted.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.ghin || ""; // Assuming roster objects have 'ghin'
      opt.textContent = p.name || p.ghin;
      el.blindPlayer.appendChild(opt);
    });
  }

  function initialize() {
    loadContext();
    applyChrome();
    render();
    wireEvents();
    setDirty(false);
    MA.setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();