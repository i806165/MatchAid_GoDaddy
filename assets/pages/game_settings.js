/* /assets/pages/game_settings.js
   Game Settings page controller (GoDaddy/PHP).
   - Aligns field-dependency logic to Wix HTML reference
   - Uses /assets/js/ma_shared.js (MA.postJson, MA.chrome, MA.setStatus, MA.routerGo)
   - Includes wizard controller (Guided view) alongside existing form controller (Advanced view)
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  // INIT payload (server-embedded preferred)
  const init = window.__MA_INIT__ || window.__INIT__ || {};

  // Canonical client POST (centralized auth-fail -> login lives inside MA.postJson)
  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  // API bases injected by PHP (preferred). Fallbacks are last-resort.
  const routes = MA.routes || {};
  const gsApiBase = routes.apiGameSettings || MA.paths?.apiGameSettings || "/api/game_settings";
  const apiGHIN = MA.paths?.apiGHIN || "/api/GHIN";
  const returnToUrl = init.returnTo || routes.returnTo || "/app/admin_games/gameslist.php";

  // =========================================================================
  // SHARED CONSTANTS (used by both form and wizard controllers)
  // =========================================================================

  const stablefordTemplate = [
    { reltoPar: -3, defaultPoints: 5 },
    { reltoPar: -2, defaultPoints: 4 },
    { reltoPar: -1, defaultPoints: 3 },
    { reltoPar:  0, defaultPoints: 2 },
    { reltoPar:  1, defaultPoints: 1 },
    { reltoPar:  2, defaultPoints: 0 },
  ];

  // GameFormat => basis + constrained options (Wix logic)
  const gameFormatConfig = {
    StrokePlay: { label: "Stroke Play", basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    Stableford: { label: "Stableford",  basis: "Points",  methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    MatchPlay:  { label: "Match Play",  basis: "Holes",   methods: ["NET", "ADJ GROSS"], competition: ["PairPair"] },
    Skins:      { label: "Skins",       basis: "Skins",   methods: ["NET", "ADJ GROSS"], competition: ["PairPair"] },
    Scramble:   { label: "Scramble",    basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    Shamble:    { label: "Shamble",     basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    AltShot:    { label: "Alt-Shot",    basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    Chapman:    { label: "Chapman",     basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
  };

  const competitionConfig = {
    PairPair:  { label: "Pair v. another Pair", value: "PairPair" },
    PairField: { label: "Pair v. the Field",    value: "PairField" },
  };

  const scoringSystemOptions = [
    { label: "Use All Scores",                    value: "AllScores" },
    { label: "Use N Best Ball(s)",                value: "BestBall" },
    { label: "Use N Scores-Set per Hole",         value: "DeclareHole" },
    //{ label: "Use N Scores-Set per Group (33/44)", value: "DeclarePlayer" },
    { label: "Declare Scores at your Discretion", value: "DeclareManual" },
  ];

  const toMethodOptions = [
    { label: "ShotGun",   value: "ShotGun" },
    { label: "Tee Times", value: "TeeTimes" },
  ];

  const hcMethodOptions = [
    { label: "CH with Allowance", value: "CH" },
    { label: "Shots-Off",         value: "SO" },
  ];

  const allowanceOptions = (() => {
    const out = [];
    for (let i = 0; i <= 20; i++) out.push({ label: `${100 - i * 5}%`, value: String(100 - i * 5) });
    return out;
  })();

  const strokeDistOptions = [
    { label: "Standard stroke allocation",              value: "Standard" },
    { label: "Strokes distributed across spins",        value: "Balanced" },
    { label: "Round HCP's and distribute across spins", value: "Balanced-Rounded" },
  ];

  const hcEffectivityOptions = [
    { label: "Play Date",    value: "PlayDate" },
    { label: "3-Month Low",  value: "Low3" },
    { label: "6-Month Low",  value: "Low6" },
    { label: "12-Month Low", value: "Low12" },
    { label: "Choose Date",  value: "Date" },
  ];

  const scoringBasisOptions = [
    { label: "Strokes", value: "Strokes" },
    { label: "Points",  value: "Points" },
    { label: "Holes",   value: "Holes" },
    { label: "Skins",   value: "Skins" },
  ];

  const rotationBase = [{ label: "None", value: "None" }];
  const rotationCOD  = { label: "COD",  value: "COD" };
  const rotation1324 = { label: "1324", value: "1324" };
  const rotation1423 = { label: "1423", value: "1423" };

  // Game label → format/preset mapping (wizard carousel source of truth)
  const GAME_LABELS = [
    { label: "Alt-Shot",      dbFormat: "AltShot",   basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1", bbCountLock: true  },
    { label: "Best Ball",     dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2", bbCountLock: false },
    { label: "Chapman",       dbFormat: "Chapman",    basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1", bbCountLock: true  },
    { label: "C-O-D",         dbFormat: "MatchPlay",  basis: "Holes",   compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2", bbCountLock: false },
    { label: "Declare 33/44", dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: "DeclareManual", scoringSystemLock: true,  bbCount: null,bbCountLock: true  },
    { label: "Four Ball",     dbFormat: "MatchPlay",  basis: "Holes",   compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2", bbCountLock: false },
    { label: "Match Play",    dbFormat: "MatchPlay",  basis: "Holes",   compLock: "PairPair", scoringSystem: null,            scoringSystemLock: false, bbCount: null,bbCountLock: false },
    { label: "Scramble",      dbFormat: "Scramble",   basis: "Strokes", compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1", bbCountLock: true  },
    { label: "Shamble",       dbFormat: "Shamble",    basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1", bbCountLock: true  },
    { label: "Skins",         dbFormat: "Skins",      basis: "Skins",   compLock: "PairPair", scoringSystem: "AllScores",     scoringSystemLock: true,  bbCount: null,bbCountLock: true  },
    { label: "Stableford",    dbFormat: "Stableford", basis: "Points",  compLock: null,       scoringSystem: null,            scoringSystemLock: false, bbCount: null,bbCountLock: false },
    { label: "Stroke Play",   dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: null,            scoringSystemLock: false, bbCount: null,bbCountLock: false },
  ];

  function bestBallOptionsForFormat(fmt) {
    const base = [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" },
    ];
    if (["Scramble", "Shamble", "AltShot", "Chapman"].includes(fmt)) return base.filter(o => o.value === "1");
    if (fmt === "MatchPlay") return base.filter(o => o.value === "1" || o.value === "2");
    return base;
  }

  function scoringSystemOptionsForFormat(fmt) {
    const base = scoringSystemOptions.slice();
    if (["Scramble", "Shamble", "AltShot", "Chapman"].includes(fmt)) return base.filter(o => o.value === "BestBall");
    return base;
  }

  // =========================================================================
  // SHARED STATE
  // =========================================================================

  const state = {
    ggid: null,
    game: null,
    players: [],
    roster: [],
    coursePars: [],
    courseParsByHole: null,
    recallTemplates: [],
    stableford: [],
    holeDecls: [],
    activeTab: "general",
    customScores: { templateName: "", items: [] },
    dirty: false,
    busy: false,
    // Wizard state
    wizStep: 1,          // current active wizard step (1-4)
    wizMode: "guided",   // "guided" | "advanced"
    _strokeDistPrior: null,
  };

  // =========================================================================
  // SHARED DOM REFS (form fields — unchanged)
  // =========================================================================

  const el = {
    tabs: document.getElementById("gsTabs"),
    panels: {
      general:      document.getElementById("gsPanelGeneral"),
      scoring:      document.getElementById("gsPanelScoring"),
      handicaps:    document.getElementById("gsPanelHandicaps"),
      customPoints: document.getElementById("gsPanelCustomPoints"),
    },

    // General
    gameFormat:    document.getElementById("gsGameFormat"),
    toMethod:      document.getElementById("gsTOMethod"),
    scoringBasis:  document.getElementById("gsScoringBasis"),
    competition:   document.getElementById("gsCompetition"),
    segments:      document.getElementById("gsSegments"),
    holesDisplay:  document.getElementById("gsHoles"),
    rotation:      document.getElementById("gsRotationMethod"),
    useBlind:      document.getElementById("gsUseBlindPlayer"),
    blindPlayer:   document.getElementById("gsBlindPlayer"),

    // Scoring
    scoringMethod: document.getElementById("gsScoringMethod"),
    scoringSystem: document.getElementById("gsScoringSystem"),
    bestBallCnt:   document.getElementById("gsBestBallCnt"),
    playerDecl:    document.getElementById("gsPlayerDeclaration"),

    // Dynamic cards
    cardHoleDecl:    document.getElementById("gsCardHoleDecl"),
    listHoleDecl:    document.getElementById("gsListHoleDecl"),
    cardStableford:  document.getElementById("gsCardStableford"),
    listStableford:  document.getElementById("gsListStableford"),
    resetStableford: document.getElementById("gsResetStableford"),

    // Custom Points
    recallPattern:       document.getElementById("gsRecallPattern"),
    templateName:        document.getElementById("gsTemplateName"),
    customPointsRows:    document.getElementById("gsCustomPointsRows"),
    btnClearCustomPoints:document.getElementById("gsBtnClearCustomPoints"),

    // Handicaps
    hcMethod:           document.getElementById("gsHCMethod"),
    allowance:          document.getElementById("gsAllowance"),
    strokeDistribution: document.getElementById("gsStrokeDistribution"),
    hcEffectivity:      document.getElementById("gsHCEffectivity"),
    hcEffDate:          document.getElementById("gsHCEffectivityDate"),
    divHCEffDate:       document.getElementById("divHCEffDate"),

    // Wrappers
    divBestBall:   document.getElementById("divBestBall"),
    divPlayerDecl: document.getElementById("divPlayerDecl"),

    // View toggle
    viewToggle:    document.getElementById("gsViewToggle"),
    viewGuided:    document.getElementById("gsViewGuided"),
    viewAdvanced:  document.getElementById("gsViewAdvanced"),

    // Wizard containers
    wizContainer:  document.getElementById("gsWizardContainer"),
    wizSteps: {
      s1: document.getElementById("gsWizStep1"),
      s2: document.getElementById("gsWizStep2"),
      s3: document.getElementById("gsWizStep3"),
      s4: document.getElementById("gsWizStep4"),
    },
    // Wizard progress dots
    wizDots: [
      document.getElementById("gsWizDot1"),
      document.getElementById("gsWizDot2"),
      document.getElementById("gsWizDot3"),
      document.getElementById("gsWizDot4"),
    ],

    // Wizard step 1 — format
    wizCarousel:      document.getElementById("gsWizCarousel"),
    wizSelBanner:     document.getElementById("gsWizSelBanner"),
    wizSelLabel:      document.getElementById("gsWizSelLabel"),
    wizSelDetail:     document.getElementById("gsWizSelDetail"),

    // Wizard step 2 — structure
    wizCompChips:     document.getElementById("gsWizCompChips"),
    wizCompForced:    document.getElementById("gsWizCompForced"),
    wizCompForcedVal: document.getElementById("gsWizCompForcedVal"),
    wizCompForcedNote:document.getElementById("gsWizCompForcedNote"),
    wizSegChips:      document.getElementById("gsWizSegChips"),
    wizRotChips:      document.getElementById("gsWizRotChips"),
    wizRotNote:       document.getElementById("gsWizRotNote"),

    // Wizard step 3 — scoring
    wizBasisVal:      document.getElementById("gsWizBasisVal"),
    wizBasisNote:     document.getElementById("gsWizBasisNote"),
    wizMethodChips:   document.getElementById("gsWizMethodChips"),
    wizSystemList:    document.getElementById("gsWizSystemList"),
    wizGroupBB:       document.getElementById("gsWizGroupBB"),
    wizBBChips:       document.getElementById("gsWizBBChips"),
    wizGroupHoleDecl: document.getElementById("gsWizGroupHoleDecl"),
    wizHoleDeclGrid:  document.getElementById("gsWizHoleDeclGrid"),
    wizGroupStableford:document.getElementById("gsWizGroupStableford"),
    wizStablefordGrid:document.getElementById("gsWizStablefordGrid"),

    // Wizard step 4 — handicaps
    wizAdjBanner:      document.getElementById("gsWizAdjBanner"),
    wizHCMethodChips:  document.getElementById("gsWizHCMethodChips"),
    wizAllowanceSelect:document.getElementById("gsWizAllowanceSelect"),
    wizAllowanceLocked:document.getElementById("gsWizAllowanceLocked"),
    wizStrokeDistChips:document.getElementById("gsWizStrokeDistChips"),
    wizStrokeDistNote: document.getElementById("gsWizStrokeDistNote"),
    wizEffSelect:      document.getElementById("gsWizEffSelect"),
    wizEffDateWrap:    document.getElementById("gsWizEffDateWrap"),
    wizEffDateInput:   document.getElementById("gsWizEffDateInput"),

    // Wizard summary panel
    wizSummary: {
      label:       document.getElementById("gsWizSvLabel"),
      format:      document.getElementById("gsWizSvFormat"),
      competition: document.getElementById("gsWizSvCompetition"),
      segments:    document.getElementById("gsWizSvSegments"),
      rotation:    document.getElementById("gsWizSvRotation"),
      basis:       document.getElementById("gsWizSvBasis"),
      method:      document.getElementById("gsWizSvMethod"),
      system:      document.getElementById("gsWizSvSystem"),
      bb:          document.getElementById("gsWizSvBB"),
      hcmethod:    document.getElementById("gsWizSvHCMethod"),
      allowance:   document.getElementById("gsWizSvAllowance"),
      strokedist:  document.getElementById("gsWizSvStrokeDist"),
      hceff:       document.getElementById("gsWizSvHCEff"),
    },

    // Wizard nav buttons
    wizBtnBack: document.getElementById("gsWizBtnBack"),
    wizBtnNext: document.getElementById("gsWizBtnNext"),
  };

  // Wizard step-scoped state (separate from form state to avoid cross-contamination)
  const wiz = {
    // Step 1
    selectedLabel:       null,
    selectedFormat:      null,
    selectedBasis:       null,
    compLock:            null,
    scoringSystem:       null,
    scoringSystemLock:   false,
    bbCount:             null,
    bbCountLock:         false,
    // Step 2
    competition:         null,
    segments:            null,
    rotation:            null,
    // Step 3
    scoringMethod:       null,
    scoringSystemVal:    null,
    bestBall:            null,
    holeDecls:           [],
    // Step 4
    hcMethod:            null,
    allowance:           null,
    strokeDistribution:  null,
    hcEffectivity:       null,
    hcEffectivityDate:   null,
  };

  // =========================================================================
  // HELPERS (unchanged from original)
  // =========================================================================

  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : (msg, level) => {
        const s = document.getElementById("chromeStatusLine");
        if (!s) return;
        s.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
        s.textContent = msg || "";
      };

  function $(id) { return document.getElementById(id); }

  function setBusy(on) {
    state.busy = !!on;
    const saveBtn = document.getElementById("chromeBtnRight");
    if (saveBtn) saveBtn.disabled = state.busy;
  }

  function setDirty(on) {
    state.dirty = !!on;
    if (state.dirty) setStatus("Unsaved changes.", "warn");
    else setStatus("", "");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function isoDate(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function formatDate(s) {
    if (!s) return "";
    let d = null;
    if (String(s).match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [y, m, day] = s.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(s);
    }
    if (isNaN(d.getTime())) return s;
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dayName} ${mm}/${dd}/${yy}`;
  }

  function setDisabled(node, disabled) {
    if (!node) return;
    node.disabled = !!disabled;
    node.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function show(node, on) {
    if (!node) return;
    node.classList.toggle("hidden", !on);
    node.style.display = on ? "" : "none";
  }

  function setSelectOptions(sel, opts) {
    if (!sel) return;
    const current = String(sel.value ?? "");
    sel.innerHTML = (opts || []).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
    if (sel.options && Array.from(sel.options).some(o => o.value === current)) {
      sel.value = current;
    }
  }

  function ensureOption(sel, value) {
    if (!sel) return;
    const v = String(value ?? "").trim();
    if (!v) return;
    if (!Array.from(sel.options).some(o => o.value === v)) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
  }

  // =========================================================================
  // SHARED LOGIC (used by both form and wizard)
  // =========================================================================

  function buildCourseParsByHole(arr) {
    const map = {};
    if (!Array.isArray(arr)) return map;
    for (const p of arr) {
      const holeNum = Number(p?.hole);
      if (!Number.isFinite(holeNum)) continue;
      const parText = String(p?.parText || "").trim();
      if (parText) { map[holeNum] = parText; continue; }
      const par = Number(p?.par);
      if (Number.isFinite(par)) map[holeNum] = `Par ${par}`;
    }
    return map;
  }

  function getParTextForHole(holeNum) {
    const parText = state.courseParsByHole ? state.courseParsByHole[holeNum] : "";
    return String(parText || "").trim();
  }

  function buildSegmentsOptionsFromHoles() {
    const g = state.game || {};
    const holesSetting = String(g.dbGames_Holes || "All 18");
    if (holesSetting === "F9" || holesSetting === "B9") {
      return [{ label: "3's", value: "3" }, { label: "9's", value: "9" }];
    }
    return [{ label: "6's", value: "6" }, { label: "9's", value: "9" }];
  }

  function buildRotationOptions(segmentsValue, competitionValue) {
    const seg  = String(segmentsValue  || "9");
    const comp = String(competitionValue || "PairField");
    if (comp === "PairField") return rotationBase.slice();
    const opts = rotationBase.slice();
    if (seg === "6" || seg === "3") opts.push(rotationCOD);
    if (seg === "9")                opts.push(rotation1324, rotation1423);
    return opts;
  }

  // Default segments for a given game label + holes setting (wizard rule)
  function defaultSegmentsForLabel(gameLabel, holesVal) {
    if (gameLabel === "C-O-D") return (holesVal === "All 18") ? "6" : "3";
    return "9";
  }

  // =========================================================================
  // STABLEFORD (shared render, used by both views)
  // =========================================================================

  function normalizeStableford(existing) {
    let arr = existing;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
    arr = Array.isArray(arr) ? arr : [];
    if (!arr.length) return stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
    return arr.map((r, i) => ({
      reltoPar: Number(r.reltoPar ?? stablefordTemplate[i]?.reltoPar ?? 0),
      points:   Number(r.points   ?? r.defaultPoints ?? stablefordTemplate[i]?.defaultPoints ?? 0),
    }));
  }

  function renderStableford() {
    if (!el.listStableford) return;
    el.listStableford.innerHTML = "";
    state.stableford = normalizeStableford(state.stableford);
    for (const row of state.stableford) {
      const cell = document.createElement("div");
      cell.className = "stablefordCell";
      const lab = document.createElement("div");
      lab.className = "stablefordLabel";
      lab.textContent = (row.reltoPar > 0 ? "+" : "") + row.reltoPar;
      const sel = document.createElement("select");
      sel.className = "maTextInput";
      const opts = [];
      for (let i = -3; i <= 8; i++) opts.push({ label: String(i), value: String(i) });
      sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      sel.value = String(row.points);
      sel.addEventListener("change", () => { row.points = Number(sel.value); setDirty(true); });
      cell.appendChild(lab);
      cell.appendChild(sel);
      el.listStableford.appendChild(cell);
    }
  }

  // =========================================================================
  // HOLE DECLARATIONS (shared normalize, form render)
  // =========================================================================

  function normalizeHoleDecls(existing) {
    const g = state.game || {};
    const holesSetting = String(g.dbGames_Holes || "All 18");
    let start = 1, end = 18;
    if (holesSetting === "F9") { start = 1;  end = 9; }
    if (holesSetting === "B9") { start = 10; end = 18; }
    const bestBallDefault = String(el.bestBallCnt?.value || "2");
    let arr = existing;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
    arr = Array.isArray(arr) ? arr : [];
    const map = {};
    arr.forEach(r => { if (r && r.hole) map[String(r.hole)] = String(r.count); });
    const out = [];
    for (let h = start; h <= end; h++) {
      const val = (map[String(h)] !== undefined) ? String(map[String(h)]) : bestBallDefault;
      out.push({ _id: String(h), hole: h, count: val });
    }
    return out;
  }

  function buildHoleDeclLabelEl(holeNum) {
    const wrap = document.createElement("div");
    wrap.className = "holeDeclLabel";
    const s1 = document.createElement("span");
    s1.className = "holeDeclLabel__hole";
    s1.textContent = `Hole ${holeNum}`;
    wrap.appendChild(s1);
    const parText = getParTextForHole(holeNum);
    if (parText) {
      const s2 = document.createElement("span");
      s2.className = "holeDeclLabel__par";
      s2.textContent = parText;
      wrap.appendChild(s2);
    }
    return wrap;
  }

  function renderHoleDecls() {
    if (!el.listHoleDecl) return;
    el.listHoleDecl.innerHTML = "";
    state.holeDecls = normalizeHoleDecls(state.holeDecls);
    for (const row of state.holeDecls) {
      const cell = document.createElement("div");
      cell.className = "holeDeclCell";
      cell.appendChild(buildHoleDeclLabelEl(row.hole));
      const sel = document.createElement("select");
      sel.className = "maTextInput";
      const parText = getParTextForHole(row.hole);
      sel.setAttribute("aria-label", parText ? `Count for Hole ${row.hole} ${parText}` : `Count for Hole ${row.hole}`);
      const opts = [0, 1, 2, 3, 4].map(v => ({ label: String(v), value: String(v) }));
      sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      sel.value = String(row.count ?? "2");
      sel.addEventListener("change", () => { row.count = String(sel.value); setDirty(true); });
      cell.appendChild(sel);
      el.listHoleDecl.appendChild(cell);
    }
  }

  // =========================================================================
  // CUSTOM POINTS (unchanged)
  // =========================================================================

  function renderCustomPoints() {
    if (!el.customPointsRows) return;
    el.customPointsRows.innerHTML = "";
    const items = state.customScores?.items || [];
    for (let i = 0; i < 8; i++) {
      const item = items[i] || { label: "", points: "", awardTo: "" };
      const row = document.createElement("div");
      row.className = "maFieldRow";
      row.style.marginTop = "8px"; row.style.gap = "8px"; row.style.alignItems = "center";
      const labelIn = document.createElement("input");
      labelIn.type = "text"; labelIn.className = "maTextInput"; labelIn.style.flex = "1";
      labelIn.placeholder = "Item label"; labelIn.value = item.label || "";
      labelIn.dataset.idx = i; labelIn.dataset.field = "label";
      const pointsIn = document.createElement("input");
      pointsIn.type = "number"; pointsIn.className = "maTextInput"; pointsIn.style.width = "80px";
      pointsIn.style.textAlign = "center"; pointsIn.value = (item.points ?? "");
      pointsIn.dataset.idx = i; pointsIn.dataset.field = "points";
      const awardSel = document.createElement("select");
      awardSel.className = "maTextInput"; awardSel.style.width = "120px";
      awardSel.innerHTML = `<option value="">Select...</option><option value="Player">Player</option><option value="Team">Team</option>`;
      awardSel.value = item.awardTo || "";
      awardSel.dataset.idx = i; awardSel.dataset.field = "awardTo";
      const onInput = (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!state.customScores.items) state.customScores.items = [];
        if (!state.customScores.items[idx]) state.customScores.items[idx] = { label: "", points: "", awardTo: "" };
        const val = (e.target.dataset.field === "points") ? e.target.value : e.target.value.trim();
        state.customScores.items[idx][e.target.dataset.field] = val;
        setDirty(true);
      };
      labelIn.addEventListener("change", onInput);
      pointsIn.addEventListener("change", onInput);
      awardSel.addEventListener("change", onInput);
      row.appendChild(labelIn); row.appendChild(pointsIn); row.appendChild(awardSel);
      el.customPointsRows.appendChild(row);
    }
  }

  function populateRecallDropdown() {
    if (!el.recallPattern) return;
    const current = el.recallPattern.value;
    el.recallPattern.innerHTML = '<option value="">Select template...</option>';
    (state.recallTemplates || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.templateName;
      opt.textContent = t.templateName;
      el.recallPattern.appendChild(opt);
    });
    el.recallPattern.value = current;
  }

  function loadRecallTemplate(name) {
    const t = (state.recallTemplates || []).find(x => x.templateName === name);
    if (!t) return;
    if (state.dirty) {
      if (!confirm("This will overwrite your current entries. Continue?")) {
        el.recallPattern.value = "";
        return;
      }
    }
    state.customScores = JSON.parse(JSON.stringify(t));
    if (el.templateName) el.templateName.value = state.customScores.templateName || "";
    renderCustomPoints();
    setDirty(true);
  }

  // =========================================================================
  // CHROME
  // =========================================================================

  function applyChrome() {
    if (chrome && typeof chrome.setHeaderLines === "function") {
      const g = state.game || {};
      const gameTitle = String(g.dbGames_Title || `GGID ${state.ggid || ""}`).trim();
      const course = String(g.dbGames_CourseName || "");
      const date = formatDate(g.dbGames_PlayDate);
      const subTitle = [course, date].filter(Boolean).join(" • ");
      chrome.setHeaderLines(["Game Settings", gameTitle, subTitle]);
    }
    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: true, label: "Cancel", onClick: onCancel },
        right: { show: true, label: "Save",   onClick: doSave },
      });
    }
    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary"],
        active: "settings",
        onNavigate: (id) => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  function onCancel() {
    if (state.dirty) {
      const ok = confirm("Discard unsaved changes and go back?");
      if (!ok) return;
    }
    window.location.assign(returnToUrl);
  }

  // =========================================================================
  // DROPDOWN POPULATION (form view — unchanged)
  // =========================================================================

  function populateDropdowns() {
    setSelectOptions(el.gameFormat, Object.entries(gameFormatConfig).map(([k, cfg]) => ({ value: k, label: cfg.label })));
    setSelectOptions(el.toMethod, toMethodOptions);
    setSelectOptions(el.scoringBasis, scoringBasisOptions);
    setSelectOptions(el.scoringSystem, scoringSystemOptionsForFormat("StrokePlay"));
    setSelectOptions(el.hcMethod, hcMethodOptions);
    setSelectOptions(el.allowance, allowanceOptions);
    setSelectOptions(el.strokeDistribution, strokeDistOptions);
    setSelectOptions(el.hcEffectivity, hcEffectivityOptions);
    setSelectOptions(el.competition, Object.values(competitionConfig));
    setSelectOptions(el.rotation, rotationBase);
    if (el.playerDecl) setSelectOptions(el.playerDecl, [{ label: "11", value: "11" }]);
    setSelectOptions(el.bestBallCnt, bestBallOptionsForFormat("StrokePlay"));
    populateRecallDropdown();
  }

  function parseCustomScores(val) {
    if (!val) return { templateName: "", items: [] };
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch (e) { return { templateName: "", items: [] }; }
  }

  function populateBlindPlayerSelect() {
    if (!el.blindPlayer) return;
    const arr = (Array.isArray(state.players) && state.players.length) ? state.players : (Array.isArray(state.roster) ? state.roster : []);
    const rows = arr.slice().sort((a, b) => {
      const la = String(a.dbPlayers_LName || a.lname || "").toLowerCase();
      const lb = String(b.dbPlayers_LName || b.lname || "").toLowerCase();
      return la.localeCompare(lb);
    });
    const opts = [{ label: "Select…", value: "" }].concat(rows.map(p => {
      const ghin = String(p.dbPlayers_PlayerGHIN || p.ghin || "").trim();
      const name = String(p.dbPlayers_Name || p.name || "").trim()
        || `${String(p.dbPlayers_FName || p.fname || "").trim()} ${String(p.dbPlayers_LName || p.lname || "").trim()}`.trim();
      return { label: name || ghin, value: ghin };
    }));
    setSelectOptions(el.blindPlayer, opts);
  }

  // =========================================================================
  // HYDRATE FROM GAME (form view — with dbGames_GameLabel addition)
  // =========================================================================

  function hydrateFromGame() {
    const g = state.game || {};
    if (el.holesDisplay) el.holesDisplay.value = String(g.dbGames_Holes || "");
    if (el.toMethod)     el.toMethod.value     = String(g.dbGames_TOMethod    || "TeeTimes");
    if (el.gameFormat)   el.gameFormat.value   = String(g.dbGames_GameFormat  || "StrokePlay");
    if (el.scoringMethod) el.scoringMethod.value = String(g.dbGames_ScoringMethod || "NET");
    if (el.scoringSystem) el.scoringSystem.value = String(g.dbGames_ScoringSystem || "BestBall");
    if (el.bestBallCnt)   el.bestBallCnt.value   = String(g.dbGames_BestBall ?? "2");
    const playerDecl = String(g.dbGames_PlayerDeclaration || "11");
    if (el.playerDecl) {
      setSelectOptions(el.playerDecl, [{ label: playerDecl, value: playerDecl }]);
      el.playerDecl.value = playerDecl;
    }
    if (el.competition) el.competition.value = String(g.dbGames_Competition    || "PairField");
    if (el.segments)    el.segments.value    = String(g.dbGames_Segments       || "9");
    if (el.rotation)    el.rotation.value    = String(g.dbGames_RotationMethod || "None");
    const blindArr = Array.isArray(g.dbGames_BlindPlayers) ? g.dbGames_BlindPlayers : [];
    let blindGHIN = "";
    if (blindArr.length > 0) { try { blindGHIN = JSON.parse(blindArr[0] || "{}").ghin || ""; } catch (e) {} }
    if (el.useBlind)    el.useBlind.checked  = !!blindGHIN;
    if (el.blindPlayer) el.blindPlayer.value = blindGHIN;
    if (el.hcMethod)           el.hcMethod.value           = String(g.dbGames_HCMethod           || "CH");
    if (el.allowance)          el.allowance.value          = String(g.dbGames_Allowance           ?? "100");
    if (el.strokeDistribution) el.strokeDistribution.value = String(g.dbGames_StrokeDistribution  || "Standard");
    const eff = String(g.dbGames_HCEffectivity || "PlayDate");
    if (el.hcEffectivity) { ensureOption(el.hcEffectivity, eff); el.hcEffectivity.value = eff; }
    const effDateRaw = g.dbGames_HCEffectivityDate || g.dbGames_PlayDate;
    if (el.hcEffDate) el.hcEffDate.value = isoDate(effDateRaw);
    const playIso = isoDate(g.dbGames_PlayDate);
    if (playIso && el.hcEffDate) el.hcEffDate.max = playIso;
    state.stableford   = normalizeStableford(g.dbGames_StablefordPoints);
    state.holeDecls    = normalizeHoleDecls(g.dbGames_HoleDeclaration);
    state.customScores = parseCustomScores(g.dbGames_CustomScores);
    if (el.templateName) el.templateName.value = state.customScores.templateName || "";
    renderCustomPoints();
  }

  // =========================================================================
  // APPLY DEPENDENCIES (form view — unchanged logic, bug fix applied)
  // =========================================================================

  function applyDependencies() {
    const g = state.game || {};
    const fmt = String(el.gameFormat?.value || "StrokePlay");
    const cfg = gameFormatConfig[fmt] || gameFormatConfig.StrokePlay;

    // Basis forced
    if (el.scoringBasis) { el.scoringBasis.value = cfg.basis; setDisabled(el.scoringBasis, true); }
    if (el.toMethod)     { setDisabled(el.toMethod, true); }

    // Segments — BUG FIX: read g.dbGames_Segments before el.segments.value
    if (el.segments) {
      const desiredSeg = String(g.dbGames_Segments ?? el.segments.value ?? "").trim() || "9";
      setSelectOptions(el.segments, buildSegmentsOptionsFromHoles());
      if (Array.from(el.segments.options).some(o => o.value === desiredSeg)) el.segments.value = desiredSeg;
      else el.segments.value = el.segments.options[0]?.value || "9";
    }

    // Scoring Method
    if (el.scoringMethod) {
      const desiredMethod = String(el.scoringMethod.value ?? g.dbGames_ScoringMethod ?? "").trim();
      const methodOptions = cfg.methods.map(m => ({ label: m, value: m }));
      setSelectOptions(el.scoringMethod, methodOptions);
      const valid = cfg.methods.map(m => String(m));
      if (desiredMethod && valid.includes(desiredMethod)) el.scoringMethod.value = desiredMethod;
      else if (!valid.includes(String(el.scoringMethod.value))) el.scoringMethod.value = cfg.methods[0] || "NET";
    }

    // Scoring System
    if (el.scoringSystem) {
      const desiredSystem = String(el.scoringSystem.value ?? g.dbGames_ScoringSystem ?? "").trim();
      const systemOpts = scoringSystemOptionsForFormat(fmt);
      setSelectOptions(el.scoringSystem, systemOpts);
      const valid = systemOpts.map(o => String(o.value));
      if (desiredSystem && valid.includes(desiredSystem)) el.scoringSystem.value = desiredSystem;
      else if (!valid.includes(String(el.scoringSystem.value))) el.scoringSystem.value = valid[0] || "BestBall";
    }

    // Competition
    if (el.competition) {
      const desiredComp = String(el.competition.value ?? g.dbGames_Competition ?? "").trim();
      const compOpts = (cfg.competition || []).map(c => competitionConfig[c]).filter(Boolean);
      setSelectOptions(el.competition, compOpts);
      const valid = compOpts.map(o => String(o.value));
      if (desiredComp && valid.includes(desiredComp)) el.competition.value = desiredComp;
      else if (!valid.includes(String(el.competition.value))) el.competition.value = valid[0] || "PairField";
    }

    // Rotation
    if (el.rotation) {
      const desiredRot = String(el.rotation.value ?? g.dbGames_RotationMethod ?? "").trim() || "None";
      const rotOpts = buildRotationOptions(el.segments?.value, el.competition?.value);
      setSelectOptions(el.rotation, rotOpts);
      const valid = rotOpts.map(o => String(o.value));
      if (valid.includes(desiredRot)) el.rotation.value = desiredRot;
      else el.rotation.value = valid[0] || "None";
    }

    // BestBall count
    if (el.bestBallCnt) {
      const desiredBB = String(el.bestBallCnt.value ?? g.dbGames_BestBall ?? "").trim() || "2";
      const bbOpts = bestBallOptionsForFormat(fmt);
      setSelectOptions(el.bestBallCnt, bbOpts);
      const valid = bbOpts.map(o => String(o.value));
      if (valid.includes(desiredBB)) el.bestBallCnt.value = desiredBB;
      else el.bestBallCnt.value = valid[valid.length - 1] || "2";
    }

    // ADJ GROSS cascade
    const scoringMethod = String(el.scoringMethod?.value || "NET");
    const isAdjGross = (scoringMethod === "ADJ GROSS");
    if (el.hcMethod)  { if (isAdjGross) el.hcMethod.value  = "CH";  setDisabled(el.hcMethod,  isAdjGross); }
    if (el.allowance) { if (isAdjGross) el.allowance.value = "100"; setDisabled(el.allowance, isAdjGross); }

    // Stroke distribution
    const rot = String(el.rotation?.value || "None");
    const allowStrokeDist = (!isAdjGross && rot === "COD");
    if (el.strokeDistribution) {
      if (!allowStrokeDist) {
        if (!el.strokeDistribution.disabled) state._strokeDistPrior = String(el.strokeDistribution.value ?? "").trim();
        el.strokeDistribution.value = "Standard";
        setDisabled(el.strokeDistribution, true);
      } else {
        setDisabled(el.strokeDistribution, false);
        const want = String(el.strokeDistribution.value ?? "").trim() || String(state._strokeDistPrior ?? "").trim();
        if (want && Array.from(el.strokeDistribution.options).some(o => o.value === want)) el.strokeDistribution.value = want;
      }
    }

    // Show/hide dependent sections
    const sys = String(el.scoringSystem?.value || "BestBall");
    const showBB = (sys === "BestBall");
    show(el.divBestBall, showBB);
    if (el.bestBallCnt) setDisabled(el.bestBallCnt, !showBB);
    const showPD = (sys === "DeclarePlayer");
    show(el.divPlayerDecl, showPD);
    if (el.playerDecl) setDisabled(el.playerDecl, !showPD);
    const basis = String(el.scoringBasis?.value || cfg.basis);
    show(el.cardStableford, basis === "Points");
    show(el.cardHoleDecl, sys === "DeclareHole");
    if (basis === "Points") renderStableford();
    if (sys === "DeclareHole") renderHoleDecls();
    if (state.activeTab === "customPoints") renderCustomPoints();
    if (el.blindPlayer && el.useBlind) el.blindPlayer.disabled = !el.useBlind.checked;
    toggleHCEffDate();
  }

  function toggleHCEffDate() {
    if (!el.hcEffectivity || !el.divHCEffDate) return;
    show(el.divHCEffDate, String(el.hcEffectivity.value) === "Date");
  }

  // =========================================================================
  // SAVE (shared — called by form Save button AND wizard Save button)
  // =========================================================================

  function buildPatchFromUI() {
    const g = state.game || {};
    const blindValue = String(el.blindPlayer?.value || "").trim();
    const blindLabel = el.blindPlayer
      ? (Array.from(el.blindPlayer.options).find(o => o.value === blindValue)?.textContent || "")
      : "";
    const blindPlayersArray = (el.useBlind?.checked && blindValue && blindLabel)
      ? [JSON.stringify({ ghin: blindValue, name: String(blindLabel).trim() })]
      : [];
    const eff = String(el.hcEffectivity?.value || "PlayDate");
    let effDate = (eff === "Date") ? String(el.hcEffDate?.value || "").trim() : null;
    const playIso = isoDate(g.dbGames_PlayDate);
    if (effDate && playIso && effDate > playIso) effDate = playIso;
    const basis = String(el.scoringBasis?.value || "");
    const stableford = (basis === "Points")
      ? (state.stableford || []).map(r => ({ reltoPar: Number(r.reltoPar), points: Number(r.points) }))
      : (Array.isArray(g.dbGames_StablefordPoints) ? g.dbGames_StablefordPoints : []);
    const scoringSystem = String(el.scoringSystem?.value || "");
    const holeDecls = (scoringSystem === "DeclareHole")
      ? (state.holeDecls || []).map(r => ({ hole: Number(r.hole), count: String(r.count || "0") }))
      : [];
    let customScores = null;
    const rawItems = state.customScores?.items || [];
    const items = [];
    const seenLabels = new Set();
    for (const it of rawItems) {
      const label   = (it.label  || "").trim();
      const points  = it.points !== "" ? Number(it.points) : NaN;
      const awardTo = (it.awardTo || "").trim();
      if (!label && isNaN(points) && !awardTo) continue;
      const lKey = label.toLowerCase();
      if (seenLabels.has(lKey)) throw new Error(`Duplicate label in Custom Points: "${label}"`);
      seenLabels.add(lKey);
      if (!label || isNaN(points) || !awardTo) throw new Error("Custom Points rows must have a Label, Numeric Points, and Award To (or be fully blank).");
      items.push({ label, points, awardTo });
    }
    if (items.length > 0) {
      const tName = (el.templateName?.value || "").trim();
      if (!tName) throw new Error("Template Name is required when Custom Points exist.");
      const sameNameOtherContent = (state.recallTemplates || []).find(t =>
        t.templateName.toLowerCase() === tName.toLowerCase() &&
        JSON.stringify(t.items) !== JSON.stringify(items)
      );
      if (sameNameOtherContent) throw new Error(`Template name "${tName}" already exists with different items.`);
      customScores = { templateName: tName, items };
    }
    return {
      dbGames_GGID:               state.ggid,
      // NEW FIELD — game label captured from wizard or existing value
      dbGames_GameLabel:          String(g.dbGames_GameLabel || ""),
      dbGames_GameFormat:         String(el.gameFormat?.value    || "StrokePlay"),
      dbGames_TOMethod:           String(el.toMethod?.value      || "TeeTimes"),
      dbGames_ScoringBasis:       String(el.scoringBasis?.value  || ""),
      dbGames_Competition:        String(el.competition?.value   || "PairField"),
      dbGames_Segments:           String(el.segments?.value      || "9"),
      dbGames_RotationMethod:     String(el.rotation?.value      || "None"),
      dbGames_BlindPlayers:       blindPlayersArray,
      dbGames_ScoringMethod:      String(el.scoringMethod?.value  || "NET"),
      dbGames_ScoringSystem:      scoringSystem,
      dbGames_BestBall:           String(el.bestBallCnt?.value    || "4"),
      dbGames_PlayerDeclaration:  String(el.playerDecl?.value     || "11"),
      dbGames_HCMethod:           String(el.hcMethod?.value       || "CH"),
      dbGames_Allowance:          parseInt(String(el.allowance?.value || "100"), 10) || 100,
      dbGames_StrokeDistribution: String(el.strokeDistribution?.value || "Standard"),
      dbGames_HCEffectivity:      eff,
      dbGames_HCEffectivityDate:  effDate,
      dbGames_StablefordPoints:   stableford,
      dbGames_HoleDeclaration:    holeDecls,
      dbGames_CustomScores:       customScores,
    };
  }

  async function doSave() {
    if (state.busy) return;
    if (!state.dirty) { window.location.assign(returnToUrl); return; }
    setStatus("Saving...", "info");
    setBusy(true);
    try {
      const patch = buildPatchFromUI();
      const baseClean = String(gsApiBase || "").replace(/\/$/, "");
      const url = `${baseClean}/saveGameSettings.php`;
      const res = await postJson(url, { payload: { patch } });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");
      state.game = res.payload?.game || state.game;
      setDirty(false);
      setStatus("Settings saved successfully.", "success");
      if (MA.recalculateHandicaps) await MA.recalculateHandicaps(apiGHIN);
      hydrateFromGame();
      applyDependencies();
      window.location.assign(returnToUrl);
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || "An error occurred during save."), "error");
    } finally {
      setBusy(false);
    }
  }

  // =========================================================================
  // VIEW TOGGLE (Guided ↔ Advanced)
  // =========================================================================

  function setViewMode(mode) {
    state.wizMode = mode;
    const isGuided = (mode === "guided");

    // Toggle the maControlArea content
    if (el.viewToggle) {
      el.viewToggle.querySelectorAll(".maSegBtn").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.view === mode);
        btn.setAttribute("aria-selected", btn.dataset.view === mode ? "true" : "false");
      });
    }

    // Show wizard or tab view
    show(el.wizContainer,   isGuided);
    show(el.tabs,           !isGuided);

    // Show correct panels
    Object.values(el.panels).forEach(p => {
      if (!p) return;
      if (isGuided) {
        p.classList.add("hidden");
        p.style.display = "none";
      } else {
        // Restore to the active tab's panel
        const active = p.dataset.tabPanel === state.activeTab;
        p.classList.toggle("hidden", !active);
        p.style.display = active ? "" : "none";
      }
    });

    if (isGuided) {
      // Sync wizard state from current form values on first open
      wizHydrateFromForm();
      wizRenderStep(state.wizStep);
      wizUpdateSummary();
    }
  }

  // =========================================================================
  // TABS (form view — unchanged)
  // =========================================================================

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    if (el.tabs) {
      el.tabs.querySelectorAll(".maSegBtn").forEach(btn => {
        const on = btn.dataset.tab === tabId;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    Object.values(el.panels || {}).forEach(panel => {
      if (!panel) return;
      panel.classList.toggle("is-active", panel.dataset.tabPanel === tabId);
      panel.classList.toggle("hidden", panel.dataset.tabPanel !== tabId);
    });
  }

  // =========================================================================
  // WIZARD — HYDRATE FROM FORM
  // Syncs wiz{} state from the current form field values so the wizard
  // always reflects the live game record when first opened.
  // =========================================================================

  function wizHydrateFromForm() {
    const g = state.game || {};

    // Step 1 — find the game label; fall back to format matching
    const storedLabel = String(g.dbGames_GameLabel || "").trim();
    const storedFormat = String(g.dbGames_GameFormat || "StrokePlay");
    let labelEntry = storedLabel
      ? GAME_LABELS.find(x => x.label === storedLabel)
      : GAME_LABELS.find(x => x.dbFormat === storedFormat);
    if (!labelEntry) labelEntry = GAME_LABELS.find(x => x.label === "Stroke Play");

    wiz.selectedLabel      = labelEntry.label;
    wiz.selectedFormat     = labelEntry.dbFormat;
    wiz.selectedBasis      = (gameFormatConfig[labelEntry.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock           = labelEntry.compLock;
    wiz.scoringSystem      = labelEntry.scoringSystem;
    wiz.scoringSystemLock  = labelEntry.scoringSystemLock;
    wiz.bbCount            = labelEntry.bbCount;
    wiz.bbCountLock        = labelEntry.bbCountLock;

    // Step 2
    wiz.competition = String(g.dbGames_Competition    || "PairField");
    wiz.segments    = String(g.dbGames_Segments       || "9");
    wiz.rotation    = String(g.dbGames_RotationMethod || "None");

    // Step 3
    wiz.scoringMethod   = String(g.dbGames_ScoringMethod  || "NET");
    wiz.scoringSystemVal= String(g.dbGames_ScoringSystem  || "BestBall");
    wiz.bestBall        = String(g.dbGames_BestBall        || "2");

    // Hole decls
    const holesVal = String(g.dbGames_Holes || "All 18");
    let hStart = 1, hEnd = 18;
    if (holesVal === "F9") { hStart = 1;  hEnd = 9;  }
    if (holesVal === "B9") { hStart = 10; hEnd = 18; }
    let hArr = g.dbGames_HoleDeclaration;
    if (typeof hArr === "string") { try { hArr = JSON.parse(hArr); } catch (e) { hArr = []; } }
    hArr = Array.isArray(hArr) ? hArr : [];
    const hMap = {};
    hArr.forEach(r => { if (r && r.hole) hMap[String(r.hole)] = String(r.count); });
    wiz.holeDecls = [];
    for (let h = hStart; h <= hEnd; h++) {
      wiz.holeDecls.push({ hole: h, count: hMap[String(h)] !== undefined ? hMap[String(h)] : (wiz.bestBall || "2") });
    }

    // Step 4
    wiz.hcMethod           = String(g.dbGames_HCMethod           || "CH");
    wiz.allowance          = String(g.dbGames_Allowance           ?? "100");
    wiz.strokeDistribution = String(g.dbGames_StrokeDistribution  || "Standard");
    wiz.hcEffectivity      = String(g.dbGames_HCEffectivity       || "PlayDate");
    wiz.hcEffectivityDate  = g.dbGames_HCEffectivityDate ? isoDate(g.dbGames_HCEffectivityDate) : null;
  }

  // =========================================================================
  // WIZARD — APPLY TO FORM
  // Pushes wiz{} state into the existing form fields then calls
  // applyDependencies() so all cascades fire exactly as they do today.
  // doSave() then handles the actual save unchanged.
  // =========================================================================

  function wizApplyToForm() {
    const g = state.game || {};

    // Write GameLabel into game state so buildPatchFromUI() picks it up
    if (state.game) state.game.dbGames_GameLabel = wiz.selectedLabel || "";

    // Step 1
    if (el.gameFormat) el.gameFormat.value = wiz.selectedFormat || "StrokePlay";

    // Step 2
    if (el.competition) el.competition.value = wiz.competition || "PairField";
    if (el.segments)    el.segments.value    = wiz.segments    || "9";
    if (el.rotation)    el.rotation.value    = wiz.rotation    || "None";

    // Step 3
    if (el.scoringMethod) el.scoringMethod.value = wiz.scoringMethod    || "NET";
    if (el.scoringSystem) el.scoringSystem.value = wiz.scoringSystemVal || "BestBall";
    if (el.bestBallCnt)   el.bestBallCnt.value   = wiz.bestBall         || "2";

    // Hole decls — write into state.holeDecls so buildPatchFromUI picks them up
    if (wiz.scoringSystemVal === "DeclareHole" && wiz.holeDecls.length) {
      state.holeDecls = wiz.holeDecls.map(r => ({ _id: String(r.hole), hole: r.hole, count: r.count }));
    }

    // Step 4
    if (el.hcMethod)           el.hcMethod.value           = wiz.hcMethod           || "CH";
    if (el.allowance)          el.allowance.value          = wiz.allowance           || "100";
    if (el.strokeDistribution) el.strokeDistribution.value = wiz.strokeDistribution  || "Standard";
    if (el.hcEffectivity)      el.hcEffectivity.value      = wiz.hcEffectivity       || "PlayDate";
    if (el.hcEffDate && wiz.hcEffectivityDate) el.hcEffDate.value = wiz.hcEffectivityDate;

    // Fire cascade — same as if the user had changed the fields manually
    applyDependencies();
    setDirty(true);
  }

  // =========================================================================
  // WIZARD — STEP RENDERING
  // =========================================================================

  function wizRenderStep(step) {
    state.wizStep = step;

    // Update progress dots
    el.wizDots.forEach((dot, i) => {
      if (!dot) return;
      const n = i + 1;
      dot.classList.toggle("done",   n < step);
      dot.classList.toggle("active", n === step);
      dot.classList.toggle("upcoming", n > step);
      dot.textContent = n < step ? "✓" : "";
    });

    // Show/hide step panels
    Object.entries(el.wizSteps).forEach(([key, panel]) => {
      if (!panel) return;
      const n = parseInt(key.replace("s", ""), 10);
      show(panel, n === step);
    });

    // Back button
    if (el.wizBtnBack) {
      el.wizBtnBack.disabled = (step === 1);
      el.wizBtnBack.textContent = "← Back";
    }

    // Next/Save button
    if (el.wizBtnNext) {
      if (step === 4) {
        el.wizBtnNext.textContent = "Save Settings";
        el.wizBtnNext.classList.add("wiz-save");
      } else {
        el.wizBtnNext.textContent = "Next →";
        el.wizBtnNext.classList.remove("wiz-save");
      }
    }

    // Render the current step's content
    switch (step) {
      case 1: wizRenderStep1(); break;
      case 2: wizRenderStep2(); break;
      case 3: wizRenderStep3(); break;
      case 4: wizRenderStep4(); break;
    }

    wizUpdateSummary();
    wizCheckComplete();
  }

  // ---- Step 1: Game Format ----
  function wizRenderStep1() {
    const carousel = el.wizCarousel;
    if (!carousel) return;
    carousel.innerHTML = "";

    GAME_LABELS.forEach(game => {
      const card = document.createElement("div");
      card.className = "wizGameCard" + (wiz.selectedLabel === game.label ? " selected" : "");
      card.innerHTML = `<div class="wizGameCard__name">${esc(game.label)}</div><div class="wizGameCard__fmt">${esc(game.dbFormat)}</div>`;
      card.addEventListener("click", () => wizSelectGame(card, game));
      carousel.appendChild(card);
    });

    // Scroll to selected card
    const selectedCard = carousel.querySelector(".selected");
    if (selectedCard) setTimeout(() => selectedCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }), 100);

    // Banner
    if (wiz.selectedLabel && el.wizSelBanner) {
      el.wizSelBanner.classList.remove("hidden");
      if (el.wizSelLabel)  el.wizSelLabel.textContent  = wiz.selectedLabel + " selected";
      if (el.wizSelDetail) el.wizSelDetail.textContent =
        `GameFormat: ${wiz.selectedFormat} · Basis: ${wiz.selectedBasis}` +
        (wiz.compLock ? ` · Competition: ${wiz.compLock}` : "") +
        (wiz.scoringSystem ? ` · System: ${wiz.scoringSystem}${wiz.scoringSystemLock ? " (locked)" : ""}` : "");
    }

    wizDragScroll(carousel);
  }

  function wizSelectGame(card, game) {
    if (el.wizCarousel) el.wizCarousel.querySelectorAll(".wizGameCard").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    wiz.selectedLabel      = game.label;
    wiz.selectedFormat     = game.dbFormat;
    wiz.selectedBasis      = (gameFormatConfig[game.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock           = game.compLock;
    wiz.scoringSystem      = game.scoringSystem  || null;
    wiz.scoringSystemLock  = game.scoringSystemLock || false;
    wiz.bbCount            = game.bbCount        || null;
    wiz.bbCountLock        = game.bbCountLock    || false;
    if (el.wizSelBanner)  el.wizSelBanner.classList.remove("hidden");
    if (el.wizSelLabel)   el.wizSelLabel.textContent  = game.label + " selected";
    if (el.wizSelDetail)  el.wizSelDetail.textContent =
      `GameFormat: ${game.dbFormat} · Basis: ${wiz.selectedBasis}` +
      (game.compLock ? ` · Competition: ${game.compLock}` : "") +
      (game.scoringSystem ? ` · System: ${game.scoringSystem}${game.scoringSystemLock ? " (locked)" : ""}` : "");
    wizUpdateSummary();
    wizCheckComplete();
  }

  // ---- Step 2: Structure ----
  function wizRenderStep2() {
    const g = state.game || {};

    // Competition
    const lock = wiz.compLock;
    if (el.wizCompChips) {
      el.wizCompChips.style.display = lock ? "none" : "";
      if (!lock) {
        el.wizCompChips.querySelectorAll(".wizChip").forEach(b => {
          b.classList.toggle("selected", b.dataset.val === wiz.competition);
          if (lock) { b.classList.add(b.dataset.val === lock ? "locked" : "disabled"); }
          else      { b.classList.remove("locked", "disabled"); }
        });
      }
    }
    if (el.wizCompForced) {
      el.wizCompForced.classList.toggle("hidden", !lock);
      if (lock) {
        if (el.wizCompForcedVal)  el.wizCompForcedVal.textContent  = lock === "PairPair" ? "Pair vs. Pair" : "Pair vs. the Field";
        if (el.wizCompForcedNote) el.wizCompForcedNote.textContent = `${wiz.selectedLabel} always plays as ${lock === "PairPair" ? "Pair vs. Pair" : "Pair vs. the Field"}`;
        wiz.competition = lock;
      }
    }

    // Segments
    if (el.wizSegChips) {
      const opts = buildSegmentsOptionsFromHoles();
      el.wizSegChips.innerHTML = "";
      const defSeg = defaultSegmentsForLabel(wiz.selectedLabel, String(g.dbGames_Holes || "All 18"));
      // Pre-select: stored value if valid, else label default, else first option
      const validVals = opts.map(o => o.value);
      if (!validVals.includes(wiz.segments)) wiz.segments = validVals.includes(defSeg) ? defSeg : validVals[0];
      opts.forEach(opt => {
        const b = document.createElement("button");
        b.className = "wizChip" + (wiz.segments === opt.value ? " selected" : "");
        b.dataset.val = opt.value;
        b.textContent = opt.label;
        b.addEventListener("click", () => wizSelectSegments(opt.value));
        el.wizSegChips.appendChild(b);
      });
    }

    wizBuildRotation();
  }

  function wizSelectCompetition(val) {
    wiz.competition = val;
    if (el.wizCompChips) el.wizCompChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizBuildRotation();
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectSegments(val) {
    wiz.segments = val;
    if (el.wizSegChips) el.wizSegChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizBuildRotation();
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizBuildRotation() {
    if (!el.wizRotChips) return;
    const opts = buildRotationOptions(wiz.segments, wiz.competition);
    const validVals = opts.map(o => o.value);
    if (!validVals.includes(wiz.rotation)) wiz.rotation = validVals[0] || "None";
    el.wizRotChips.innerHTML = "";
    opts.forEach(opt => {
      const b = document.createElement("button");
      b.className = "wizChip" + (wiz.rotation === opt.value ? " selected" : "") + (opts.length === 1 ? " locked" : "");
      b.dataset.val = opt.value;
      b.textContent = opt.label;
      if (opts.length > 1) b.addEventListener("click", () => wizSelectRotation(opt.value));
      el.wizRotChips.appendChild(b);
    });
    if (el.wizRotNote) {
      const comp = wiz.competition; const seg = wiz.segments; const rot = wiz.rotation;
      if (comp === "PairField") el.wizRotNote.textContent = "Rotation not available for Pair vs. the Field.";
      else if (seg === "6" || seg === "3") el.wizRotNote.textContent = rot === "COD" ? "COD rotation — partners change each segment." : "Select COD to rotate partners.";
      else if (seg === "9") el.wizRotNote.textContent = (rot === "1324" || rot === "1423") ? `${rot} rotation pattern selected.` : "Select a rotation pattern, or None for fixed partners.";
      else el.wizRotNote.textContent = "";
    }
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectRotation(val) {
    wiz.rotation = val;
    if (el.wizRotChips) el.wizRotChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    if (el.wizRotNote) {
      const seg = wiz.segments; const rot = val;
      if (seg === "6" || seg === "3") el.wizRotNote.textContent = rot === "COD" ? "COD rotation — partners change each segment." : "Select COD to rotate partners.";
      else if (seg === "9") el.wizRotNote.textContent = (rot === "1324" || rot === "1423") ? `${rot} rotation selected.` : "None — fixed partners.";
    }
    wizUpdateSummary();
    wizCheckComplete();
  }

  // ---- Step 3: Scoring ----
  const WIZ_SYSTEMS = {
    AllScores:    { label: "Use All Scores",          desc: "Every player's score counts on every hole." },
    BestBall:     { label: "Best Ball",               desc: "The lowest N scores from the team count on each hole." },
    DeclareHole:  { label: "Declare per Hole",        desc: "The administrator sets how many scores count on each hole before the round." },
    DeclareManual:{ label: "Declare at Discretion",   desc: "Players declare which scores count at their own discretion." },
  };

  function wizRenderStep3() {
    const fmt = wiz.selectedFormat || "StrokePlay";

    // Basis
    if (el.wizBasisVal)  el.wizBasisVal.textContent  = wiz.selectedBasis || "Strokes";
    if (el.wizBasisNote) el.wizBasisNote.textContent = `— forced by ${wiz.selectedLabel || "format"}`;

    // Stableford preview
    if (el.wizGroupStableford) {
      const showSF = (wiz.selectedBasis === "Points");
      show(el.wizGroupStableford, showSF);
      if (showSF && el.wizStablefordGrid) {
        const relLabels = {"-3":"−3","-2":"−2","-1":"−1","0":"E","1":"+1","2":"+2"};
        el.wizStablefordGrid.innerHTML = "";
        stablefordTemplate.forEach(row => {
          const cell = document.createElement("div");
          cell.className = "wizStableford__cell";
          cell.innerHTML = `<div class="wizStableford__rel">${relLabels[String(row.reltoPar)]||row.reltoPar}</div><div class="wizStableford__pts">${row.defaultPoints}</div><div class="wizStableford__name">${["Albatross","Eagle","Birdie","Par","Bogey","Dbl Bogey"][stablefordTemplate.indexOf(row)]||""}</div>`;
          el.wizStablefordGrid.appendChild(cell);
        });
      }
    }

    // Method chips
    if (el.wizMethodChips) {
      el.wizMethodChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === wiz.scoringMethod));
    }

    // System option cards
    if (el.wizSystemList) {
      const locked = wiz.scoringSystemLock;
      const preset = wiz.scoringSystem;
      const teamFmts = ["Scramble", "Shamble", "AltShot", "Chapman"];
      const avail = teamFmts.includes(fmt) ? ["BestBall"] : ["AllScores", "BestBall", "DeclareHole", "DeclareManual"];
      el.wizSystemList.innerHTML = "";
      avail.forEach(key => {
        const def = WIZ_SYSTEMS[key];
        const card = document.createElement("div");
        card.className = "wizOptCard";
        card.dataset.val = key;
        const isLocked = locked && preset === key;
        if (isLocked) card.classList.add("locked");
        else card.addEventListener("click", () => wizSelectSystem(key));
        if (wiz.scoringSystemVal === key && !isLocked) card.classList.add("selected");
        card.innerHTML = `<div class="wizOptCard__radio"></div><div class="wizOptCard__body"><div class="wizOptCard__name">${esc(def.label)}${isLocked ? ' <small style="font-size:10px;opacity:.6">(locked)</small>' : ""}</div><div class="wizOptCard__desc">${esc(def.desc)}</div></div>`;
        el.wizSystemList.appendChild(card);
      });
      // Apply locked card visual
      if (locked && preset) {
        const lockedCard = el.wizSystemList.querySelector(`[data-val="${preset}"]`);
        if (lockedCard) { lockedCard.classList.add("locked"); lockedCard.querySelector(".wizOptCard__radio").style.background = "#07432A"; }
        wiz.scoringSystemVal = preset;
      }
    }

    // Best Ball
    if (el.wizGroupBB) {
      const showBB = (wiz.scoringSystemVal === "BestBall");
      show(el.wizGroupBB, showBB);
      if (showBB && el.wizBBChips) {
        const teamFmts = ["Scramble", "Shamble", "AltShot", "Chapman"];
        const opts = teamFmts.includes(fmt) ? ["1"] : fmt === "MatchPlay" ? ["1","2"] : ["1","2","3","4"];
        el.wizBBChips.innerHTML = "";
        opts.forEach(v => {
          const b = document.createElement("button");
          b.className = "wizChip";
          b.dataset.val = v;
          b.textContent = v;
          const isLocked = wiz.bbCountLock && wiz.bbCount === v;
          const isDisabled = wiz.bbCountLock && wiz.bbCount !== v;
          if (isLocked)   { b.classList.add("locked"); }
          else if (isDisabled) { b.classList.add("disabled"); }
          else {
            b.addEventListener("click", () => wizSelectBB(v));
            if (wiz.bestBall === v) b.classList.add("selected");
          }
          el.wizBBChips.appendChild(b);
        });
        if (wiz.bbCountLock && wiz.bbCount) wiz.bestBall = wiz.bbCount;
      }
    }

    // Hole Decl
    if (el.wizGroupHoleDecl) {
      const showHD = (wiz.scoringSystemVal === "DeclareHole");
      show(el.wizGroupHoleDecl, showHD);
      if (showHD) wizRenderHoleDeclGrid();
    }
  }

  function wizSelectMethod(val) {
    wiz.scoringMethod = val;
    if (el.wizMethodChips) el.wizMethodChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectSystem(val) {
    wiz.scoringSystemVal = val;
    if (el.wizSystemList) {
      el.wizSystemList.querySelectorAll(".wizOptCard:not(.locked)").forEach(c => {
        const sel = c.dataset.val === val;
        c.classList.toggle("selected", sel);
        const radio = c.querySelector(".wizOptCard__radio");
        if (radio) radio.style.background = sel ? "#07432A" : "";
      });
    }
    // Show/hide BB and HoleDecl
    if (el.wizGroupBB)       show(el.wizGroupBB,       val === "BestBall");
    if (el.wizGroupHoleDecl) {
      show(el.wizGroupHoleDecl, val === "DeclareHole");
      if (val === "DeclareHole") wizRenderHoleDeclGrid();
    }
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectBB(val) {
    wiz.bestBall = val;
    if (el.wizBBChips) el.wizBBChips.querySelectorAll(".wizChip:not(.locked):not(.disabled)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizRenderHoleDeclGrid() {
    if (!el.wizHoleDeclGrid) return;
    el.wizHoleDeclGrid.innerHTML = "";
    const g = state.game || {};
    const holesVal = String(g.dbGames_Holes || "All 18");
    let hStart = 1, hEnd = 18;
    if (holesVal === "F9") { hStart = 1;  hEnd = 9;  }
    if (holesVal === "B9") { hStart = 10; hEnd = 18; }

    // Ensure wiz.holeDecls covers the correct range
    if (!wiz.holeDecls.length || wiz.holeDecls[0].hole !== hStart) {
      const defCount = wiz.bestBall || "2";
      wiz.holeDecls = [];
      for (let h = hStart; h <= hEnd; h++) wiz.holeDecls.push({ hole: h, count: defCount });
    }

    wiz.holeDecls.forEach(row => {
      const cell = document.createElement("div");
      cell.className = "wizHoleCell";
      const lbl = document.createElement("div");
      lbl.className = "wizHoleCellLabel";
      const parText = getParTextForHole(row.hole);
      lbl.textContent = "H" + row.hole;
      if (parText) {
        const sub = document.createElement("span");
        sub.className = "par-text";
        sub.textContent = parText;
        lbl.appendChild(sub);
      }
      const sel = document.createElement("select");
      sel.className = "wizHoleCellSelect";
      sel.setAttribute("aria-label", `Count for Hole ${row.hole}${parText ? " " + parText : ""}`);
      [0,1,2,3,4].forEach(v => {
        const o = document.createElement("option");
        o.value = String(v); o.textContent = String(v);
        sel.appendChild(o);
      });
      sel.value = String(row.count);
      sel.addEventListener("change", () => { row.count = sel.value; wizUpdateSummary(); });
      cell.appendChild(lbl); cell.appendChild(sel);
      el.wizHoleDeclGrid.appendChild(cell);
    });
  }

  // Exposed for inline onclick in HTML
  function wizSetAllHoles(val) {
    wiz.holeDecls.forEach(r => r.count = val);
    wizRenderHoleDeclGrid();
  }

  // ---- Step 4: Handicaps ----
  function wizRenderStep4() {
    const g = state.game || {};
    const isAdjGross = (wiz.scoringMethod === "ADJ GROSS");

    // ADJ GROSS banner
    if (el.wizAdjBanner) el.wizAdjBanner.classList.toggle("hidden", !isAdjGross);

    // HC Method chips
    if (el.wizHCMethodChips) {
      el.wizHCMethodChips.querySelectorAll(".wizChip").forEach(b => {
        b.classList.remove("locked", "disabled", "selected");
        if (isAdjGross) {
          b.classList.add(b.dataset.val === "CH" ? "locked" : "disabled");
        } else {
          b.classList.toggle("selected", b.dataset.val === wiz.hcMethod);
        }
      });
      if (isAdjGross) wiz.hcMethod = "CH";
    }

    // Allowance select
    if (el.wizAllowanceSelect) {
      if (!el.wizAllowanceSelect.options.length) {
        allowanceOptions.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt.value; o.textContent = opt.label;
          el.wizAllowanceSelect.appendChild(o);
        });
      }
      el.wizAllowanceSelect.value    = isAdjGross ? "100" : (wiz.allowance || "100");
      el.wizAllowanceSelect.disabled = isAdjGross;
      if (isAdjGross) wiz.allowance = "100";
    }
    if (el.wizAllowanceLocked) el.wizAllowanceLocked.classList.toggle("hidden", !isAdjGross);

    // Stroke distribution
    if (el.wizStrokeDistChips) {
      const allowSD = (!isAdjGross && wiz.rotation === "COD");
      el.wizStrokeDistChips.innerHTML = "";
      if (!allowSD) {
        const b = document.createElement("button");
        b.className = "wizChip locked"; b.textContent = "Standard";
        el.wizStrokeDistChips.appendChild(b);
        if (el.wizStrokeDistNote) el.wizStrokeDistNote.textContent = isAdjGross ? "Forced to Standard — ADJ GROSS is selected." : "Only configurable when Rotation is COD.";
        wiz.strokeDistribution = "Standard";
      } else {
        if (el.wizStrokeDistNote) el.wizStrokeDistNote.textContent = "COD rotation active — choose how strokes are distributed across segments.";
        strokeDistOptions.forEach(opt => {
          const b = document.createElement("button");
          b.className = "wizChip" + (wiz.strokeDistribution === opt.value ? " selected" : "");
          b.dataset.val = opt.value; b.title = opt.label; b.textContent = opt.label;
          b.addEventListener("click", () => wizSelectStrokeDist(opt.value));
          el.wizStrokeDistChips.appendChild(b);
        });
      }
    }

    // Effectivity select
    if (el.wizEffSelect) {
      if (!el.wizEffSelect.options.length) {
        hcEffectivityOptions.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label + " — " + {
            PlayDate: "Handicap index as of the day of play.",
            Low3:     "Lowest index over the past 3 months.",
            Low6:     "Lowest index over the past 6 months.",
            Low12:    "Lowest index over the past 12 months.",
            Date:     "Specify an exact date to lock the index.",
          }[opt.value];
          el.wizEffSelect.appendChild(o);
        });
      }
      el.wizEffSelect.value = wiz.hcEffectivity || "PlayDate";
    }

    // Effectivity date
    if (el.wizEffDateWrap) show(el.wizEffDateWrap, wiz.hcEffectivity === "Date");
    if (el.wizEffDateInput) {
      const playIso = isoDate(g.dbGames_PlayDate);
      if (playIso) el.wizEffDateInput.max = playIso;
      if (wiz.hcEffectivityDate) el.wizEffDateInput.value = wiz.hcEffectivityDate;
    }

    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectHCMethod(val) {
    if (wiz.scoringMethod === "ADJ GROSS" && val !== "CH") return;
    wiz.hcMethod = val;
    if (el.wizHCMethodChips) el.wizHCMethodChips.querySelectorAll(".wizChip:not(.locked):not(.disabled)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectAllowance(val) {
    if (wiz.scoringMethod === "ADJ GROSS") return;
    wiz.allowance = val;
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectStrokeDist(val) {
    wiz.strokeDistribution = val;
    if (el.wizStrokeDistChips) el.wizStrokeDistChips.querySelectorAll(".wizChip:not(.locked)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizSelectEffectivity(val) {
    wiz.hcEffectivity = val;
    if (el.wizEffDateWrap) show(el.wizEffDateWrap, val === "Date");
    wizUpdateSummary();
    wizCheckComplete();
  }

  function wizOnEffDateChange(val) {
    wiz.hcEffectivityDate = val || null;
    wizUpdateSummary();
    wizCheckComplete();
  }

  // =========================================================================
  // WIZARD — SUMMARY PANEL
  // =========================================================================

  function wizUpdateSummary() {
    const sv = (elRef, val, forced) => {
      if (!elRef) return;
      if (val) { elRef.textContent = val; elRef.className = "wizSummary__val" + (forced ? " forced" : ""); }
      else     { elRef.textContent = "—"; elRef.className = "wizSummary__val empty"; }
    };
    const s = el.wizSummary;
    sv(s.label,       wiz.selectedLabel,  false);
    sv(s.format,      wiz.selectedFormat, false);
    sv(s.basis,       wiz.selectedBasis,  true);
    const cl = wiz.competition === "PairPair" ? "Pair v. Pair" : wiz.competition === "PairField" ? "Pair v. Field" : null;
    sv(s.competition, cl,                 !!wiz.compLock);
    sv(s.segments,    wiz.segments ? wiz.segments + "'s" : null, false);
    sv(s.rotation,    wiz.rotation,       false);
    sv(s.method,      wiz.scoringMethod,  false);
    sv(s.system,      wiz.scoringSystemVal, wiz.scoringSystemLock);
    sv(s.bb,          wiz.scoringSystemVal === "BestBall" && wiz.bestBall ? wiz.bestBall + (wiz.bestBall === "1" ? " ball" : " balls") : null, wiz.bbCountLock);
    sv(s.hcmethod,    wiz.hcMethod === "CH" ? "CH w/ Allow." : wiz.hcMethod, wiz.scoringMethod === "ADJ GROSS");
    sv(s.allowance,   wiz.allowance ? wiz.allowance + "%" : null, wiz.scoringMethod === "ADJ GROSS");
    sv(s.strokedist,  wiz.strokeDistribution, false);
    const effOpt  = hcEffectivityOptions.find(o => o.value === wiz.hcEffectivity);
    const effLabel = effOpt ? effOpt.label : null;
    sv(s.hceff, wiz.hcEffectivity === "Date" && wiz.hcEffectivityDate ? effLabel + " · " + wiz.hcEffectivityDate : effLabel, false);
  }

  // =========================================================================
  // WIZARD — COMPLETION CHECK PER STEP
  // =========================================================================

  function wizCheckComplete() {
    if (!el.wizBtnNext) return;
    let ok = false;
    switch (state.wizStep) {
      case 1: ok = !!wiz.selectedLabel; break;
      case 2: ok = !!(wiz.competition && wiz.segments && wiz.rotation !== null); break;
      case 3: {
        const bbOk = wiz.scoringSystemVal !== "BestBall"    || !!wiz.bestBall;
        const hdOk = wiz.scoringSystemVal !== "DeclareHole" || wiz.holeDecls.length > 0;
        ok = !!(wiz.scoringMethod && wiz.scoringSystemVal && bbOk && hdOk);
        break;
      }
      case 4: {
        const dateOk = wiz.hcEffectivity !== "Date" || !!wiz.hcEffectivityDate;
        ok = !!(wiz.hcMethod && wiz.allowance && wiz.strokeDistribution && wiz.hcEffectivity && dateOk);
        break;
      }
    }
    el.wizBtnNext.disabled = !ok;
  }

  // =========================================================================
  // WIZARD — NAVIGATION
  // =========================================================================

  function wizGoNext() {
    if (state.wizStep === 4) {
      // Final step — apply to form and save
      wizApplyToForm();
      doSave();
    } else {
      wizRenderStep(state.wizStep + 1);
    }
  }

  function wizGoBack() {
    if (state.wizStep > 1) wizRenderStep(state.wizStep - 1);
  }

  function wizGoToStep(n) {
    // All steps are always navigable (change record mode)
    if (n >= 1 && n <= 4) wizRenderStep(n);
  }

  // =========================================================================
  // WIZARD — DRAG SCROLL (carousel)
  // =========================================================================

  function wizDragScroll(el) {
    let isDown = false, startX = 0, scrollLeft = 0;
    el.addEventListener("mousedown", e => { isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
    el.addEventListener("mouseleave", () => { isDown = false; });
    el.addEventListener("mouseup",    () => { isDown = false; });
    el.addEventListener("mousemove",  e => {
      if (!isDown) return;
      e.preventDefault();
      el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX) * 1.2;
    });
  }

  function wizScrollCarousel(dir) {
    if (el.wizCarousel) el.wizCarousel.scrollBy({ left: dir * 240, behavior: "smooth" });
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  function wireEvents() {
    // View toggle (Guided / Advanced)
    if (el.viewToggle) {
      el.viewToggle.addEventListener("click", e => {
        const btn = e.target.closest(".maSegBtn");
        if (btn && btn.dataset.view) setViewMode(btn.dataset.view);
      });
    }

    // Form tab events (Advanced view)
    if (el.tabs) {
      el.tabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".maSegBtn");
        if (btn && !btn.disabled) setActiveTab(btn.dataset.tab);
      });
    }

    function wireDirty(input, onChange) {
      if (!input) return;
      input.addEventListener("change", () => {
        setDirty(true);
        if (typeof onChange === "function") onChange();
      });
    }

    wireDirty(el.gameFormat,       applyDependencies);
    wireDirty(el.toMethod);
    wireDirty(el.competition,      applyDependencies);
    wireDirty(el.segments,         applyDependencies);
    wireDirty(el.rotation,         applyDependencies);
    wireDirty(el.scoringMethod,    applyDependencies);
    wireDirty(el.scoringSystem,    applyDependencies);
    wireDirty(el.bestBallCnt, () => {
      if (String(el.scoringSystem?.value || "") === "DeclareHole") renderHoleDecls();
      applyDependencies();
    });
    wireDirty(el.playerDecl);
    wireDirty(el.hcMethod,         applyDependencies);
    wireDirty(el.allowance);
    wireDirty(el.strokeDistribution);
    wireDirty(el.hcEffectivity,    toggleHCEffDate);
    wireDirty(el.hcEffDate);

    if (el.useBlind) {
      el.useBlind.addEventListener("change", () => {
        if (el.blindPlayer) el.blindPlayer.disabled = !el.useBlind.checked;
        setDirty(true);
      });
    }
    wireDirty(el.blindPlayer);

    if (el.recallPattern) el.recallPattern.addEventListener("change", () => loadRecallTemplate(el.recallPattern.value));
    if (el.templateName)  el.templateName.addEventListener("change",  () => { state.customScores.templateName = el.templateName.value.trim(); setDirty(true); });

    if (el.btnClearCustomPoints) {
      el.btnClearCustomPoints.addEventListener("click", () => {
        if (!confirm("Clear this custom points pattern?")) return;
        state.customScores = { templateName: "", items: [] };
        if (el.templateName)   el.templateName.value  = "";
        if (el.recallPattern)  el.recallPattern.value = "";
        renderCustomPoints();
        setDirty(true);
      });
    }

    if (el.resetStableford) {
      el.resetStableford.addEventListener("click", () => {
        if (!confirm("Reset Stableford points to defaults?")) return;
        state.stableford = stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
        renderStableford();
        setDirty(true);
      });
    }

    // Wizard nav buttons
    if (el.wizBtnBack) el.wizBtnBack.addEventListener("click", wizGoBack);
    if (el.wizBtnNext) el.wizBtnNext.addEventListener("click", wizGoNext);

    // Wizard progress dots (all clickable — change record mode)
    el.wizDots.forEach((dot, i) => {
      if (!dot) return;
      dot.addEventListener("click", () => wizGoToStep(i + 1));
    });

    // Wizard carousel arrow buttons (set via onclick in HTML, but also support JS binding)
    const carouselLeft  = document.getElementById("gsWizCarouselLeft");
    const carouselRight = document.getElementById("gsWizCarouselRight");
    if (carouselLeft)  carouselLeft.addEventListener("click",  () => wizScrollCarousel(-1));
    if (carouselRight) carouselRight.addEventListener("click", () => wizScrollCarousel(1));

    // Wizard inline event handlers exposed on window for HTML onclick attributes
    window.gsWiz = {
      selectGame:        wizSelectGame,
      selectCompetition: wizSelectCompetition,
      selectSegments:    wizSelectSegments,
      selectRotation:    wizSelectRotation,
      selectMethod:      wizSelectMethod,
      selectSystem:      wizSelectSystem,
      selectBB:          wizSelectBB,
      setAllHoles:       wizSetAllHoles,
      selectHCMethod:    wizSelectHCMethod,
      selectAllowance:   wizSelectAllowance,
      selectStrokeDist:  wizSelectStrokeDist,
      selectEffectivity: wizSelectEffectivity,
      onEffDateChange:   wizOnEffDateChange,
      scrollCarousel:    wizScrollCarousel,
      goToStep:          wizGoToStep,
    };
  }

  // =========================================================================
  // INIT
  // =========================================================================

  function loadContext() {
    if (!init || !init.ok) {
      setStatus("Failed to load game context.", "error");
      console.error("Missing or invalid __MA_INIT__ payload.", init);
      return false;
    }
    state.ggid   = init.ggid ?? init.GGID ?? null;
    state.game   = init.game || null;
    state.players = Array.isArray(init.players) ? init.players : [];
    state.roster  = Array.isArray(init.roster)  ? init.roster  : state.players;
    state.coursePars       = Array.isArray(init.coursePars)       ? init.coursePars       : [];
    state.courseParsByHole = buildCourseParsByHole(state.coursePars);
    state.recallTemplates  = Array.isArray(init.recallTemplates)  ? init.recallTemplates  : [];
    return true;
  }

  function initialize() {
    const ok = loadContext();
    if (!ok) return;

    populateDropdowns();
    populateBlindPlayerSelect();
    hydrateFromGame();
    applyChrome();
    applyDependencies();
    setActiveTab("general");

    // Default view: guided (wizard)
    setViewMode("guided");

    wireEvents();
    setDirty(false);
    setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();