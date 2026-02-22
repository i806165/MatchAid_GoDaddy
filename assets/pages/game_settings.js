/* /assets/pages/game_settings.js
   Game Settings page controller (GoDaddy/PHP).
   - Aligns field-dependency logic to Wix HTML reference
   - Uses /assets/js/ma_shared.js (MA.postJson, MA.chrome, MA.setStatus, MA.routerGo)
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

  // ---- Constants (Wix-aligned) ----
  const stablefordTemplate = [
    { reltoPar: -3, defaultPoints: 5 },
    { reltoPar: -2, defaultPoints: 4 },
    { reltoPar: -1, defaultPoints: 3 },
    { reltoPar: 0, defaultPoints: 2 },
    { reltoPar: 1, defaultPoints: 1 },
    { reltoPar: 2, defaultPoints: 0 },
  ];

  // GameFormat => basis + constrained options (Wix logic)
  const gameFormatConfig = {
    StrokePlay: { label: "Stroke Play", basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    Stableford: { label: "Stableford", basis: "Points", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    MatchPlay:  { label: "Match Play",  basis: "Holes",  methods: ["NET", "ADJ GROSS"], competition: ["PairPair"] },
    Skins:      { label: "Skins",      basis: "Skins",  methods: ["NET", "ADJ GROSS"], competition: ["PairPair"] },
    Scramble:   { label: "Scramble",   basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    Shamble:    { label: "Shamble",    basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
    AltShot:    { label: "Alt-Shot",   basis: "Strokes", methods: ["NET", "ADJ GROSS"], competition: ["PairPair", "PairField"] },
  };

  const competitionConfig = {
    PairPair: { label: "Pair vs. Pair", value: "PairPair" },
    PairField:{ label: "Pair vs. Field",value: "PairField" },
  };

  const scoringSystemOptions = [
    { label: "All Scores",        value: "AllScores" },
    { label: "Best Ball",         value: "BestBall" },
    { label: "Hole Declarations", value: "DeclareHole" },
    { label: "Game Declarations", value: "DeclarePlayer" },
  ];

  const toMethodOptions = [
    { label: "ShotGun",  value: "ShotGun" },
    { label: "Tee Times",value: "TeeTimes" },
  ];

  const hcMethodOptions = [
    { label: "CH with Allowance", value: "CH" },
    { label: "Shots-Off",         value: "SO" }, // Wix supports SO variants in other places; keep core value
  ];

  const allowanceOptions = (() => {
    const out = [];
    for (let i = 0; i <= 20; i++) out.push({ label: `${100 - i * 5}%`, value: String(100 - i * 5) });
    return out;
  })();

  const strokeDistOptions = [
    { label: "Standard stroke allocation",            value: "Standard" },
    { label: "Strokes distributed across spins",      value: "Balanced" },
    { label: "Round HCP's and distribute across spins", value: "Balanced-Rounded" },
  ];

  const hcEffectivityOptions = [
    { label: "Play Date",     value: "PlayDate" },
    { label: "3-Month Low",   value: "Low3" },
    { label: "6-Month Low",   value: "Low6" },
    { label: "12-Month Low",  value: "Low12" },
    { label: "Choose Date",   value: "Date" },
  ];

  // Static basis list for display (basis is forced by format)
  const scoringBasisOptions = [
    { label: "Strokes", value: "Strokes" },
    { label: "Points",  value: "Points" },
    { label: "Holes",   value: "Holes" },
    { label: "Skins",   value: "Skins" },
  ];

  // Rotation options are *dependency-built* in applyDependencies()
  const rotationBase = [
    { label: "None", value: "None" },
  ];
  const rotationCOD = { label: "COD", value: "COD" };
  const rotation1324 = { label: "1324", value: "1324" };
  const rotation1423 = { label: "1423", value: "1423" };

  // Best ball options (MatchPlay restricts to 1/2)
  function bestBallOptionsForFormat(fmt) {
    const base = [
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "4", value: "4" }, // "Use All Scores"
    ];
    if (fmt === "MatchPlay") return base.filter(o => o.value === "1" || o.value === "2");
    return base;
  }

  // ---- DOM ----
  const el = {
    tabs: document.getElementById("gsTabs"),
    panels: {
      general: document.getElementById("gsPanelGeneral"),
      scoring: document.getElementById("gsPanelScoring"),
      handicaps: document.getElementById("gsPanelHandicaps"),
    },

    // General
    gameFormat: document.getElementById("gsGameFormat"),
    toMethod: document.getElementById("gsTOMethod"),
    scoringBasis: document.getElementById("gsScoringBasis"),
    competition: document.getElementById("gsCompetition"),
    segments: document.getElementById("gsSegments"),
    holesDisplay: document.getElementById("gsHoles"),
    rotation: document.getElementById("gsRotationMethod"),
    useBlind: document.getElementById("gsUseBlindPlayer"),
    blindPlayer: document.getElementById("gsBlindPlayer"),

    // Scoring
    scoringMethod: document.getElementById("gsScoringMethod"),
    scoringSystem: document.getElementById("gsScoringSystem"),
    bestBallCnt: document.getElementById("gsBestBallCnt"),
    playerDecl: document.getElementById("gsPlayerDeclaration"),

    // Dynamic cards
    cardHoleDecl: document.getElementById("gsCardHoleDecl"),
    listHoleDecl: document.getElementById("gsListHoleDecl"),
    cardStableford: document.getElementById("gsCardStableford"),
    listStableford: document.getElementById("gsListStableford"),
    resetStableford: document.getElementById("gsResetStableford"),

    // Handicaps
    hcMethod: document.getElementById("gsHCMethod"),
    allowance: document.getElementById("gsAllowance"),
    strokeDistribution: document.getElementById("gsStrokeDistribution"),
    hcEffectivity: document.getElementById("gsHCEffectivity"),
    hcEffDate: document.getElementById("gsHCEffectivityDate"),
    divHCEffDate: document.getElementById("divHCEffDate"),

    // Optional wrappers (if your HTML has them)
    divBestBall: document.getElementById("divBestBall"),
    divPlayerDecl: document.getElementById("divPlayerDecl"),
  };

  // ---- State ----
  const state = {
    ggid: null,
    game: null,
    players: [],      // Wix calls this players (roster)
    roster: [],       // tolerate alternate naming
    coursePars: [],
    courseParsByHole: null,

    stableford: [],   // [{reltoPar, points}]
    holeDecls: [],    // [{_id,hole,count}]
    activeTab: "general",
    dirty: false,
    busy: false,
  };

  // ---- Helpers ----
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
    // Accepts: YYYY-MM-DD, YYYY-MM-DDTHH:MM..., Date, null
    const s = String(v || "").trim();
    if (!s) return "";
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
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

  function setDisabled(node, disabled) {
    if (!node) return;
    node.disabled = !!disabled;
    node.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function show(node, on) {
    if (!node) return;
    node.classList.toggle("hidden", !on);
    // tolerate non-hidden CSS patterns too
    node.style.display = on ? "" : "none";
  }

  function setSelectOptions(sel, opts) {
    if (!sel) return;
    const current = String(sel.value ?? "");
    sel.innerHTML = (opts || []).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
    // Restore prior selection if still present
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

  // ---- Pars by hole (Wix parity support) ----
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

  // ---- Stableford normalize/render (Wix-aligned) ----
  function normalizeStableford(existing) {
    let arr = existing;
    if (typeof arr === "string") {
      try { arr = JSON.parse(arr); } catch (e) { arr = []; }
    }
    arr = Array.isArray(arr) ? arr : [];
    if (!arr.length) {
      return stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
    }
    // Normalize
    return arr.map((r, i) => ({
      reltoPar: Number(r.reltoPar ?? stablefordTemplate[i]?.reltoPar ?? 0),
      points: Number(r.points ?? r.defaultPoints ?? stablefordTemplate[i]?.defaultPoints ?? 0),
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
      const sign = (row.reltoPar > 0) ? "+" : "";
      lab.textContent = `${sign}${row.reltoPar}`;

      const sel = document.createElement("select");
      sel.className = "maTextInput";
      
      const opts = [];
      for (let i = -3; i <= 8; i++) opts.push({ label: String(i), value: String(i) });
      sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      sel.value = String(row.points);

      sel.addEventListener("change", () => {
        row.points = Number(sel.value);
        setDirty(true);
      });

      cell.appendChild(lab);
      cell.appendChild(sel);
      el.listStableford.appendChild(cell);
    }
  }

  // ---- Hole decl normalize/render (Wix-aligned) ----
  function normalizeHoleDecls(existing) {
    const g = state.game || {};
    const holesSetting = String(g.dbGames_Holes || "All 18");
    let start = 1, end = 18;
    if (holesSetting === "F9") { start = 1; end = 9; }
    if (holesSetting === "B9") { start = 10; end = 18; }

    const bestBallDefault = String(el.bestBallCnt?.value || "2");
    
    let arr = existing;
    if (typeof arr === "string") {
      try { arr = JSON.parse(arr); } catch (e) { arr = []; }
    }
    arr = Array.isArray(arr) ? arr : [];
    
    // Map existing values by hole number
    const map = {};
    arr.forEach(r => {
      if (r && r.hole) map[String(r.hole)] = String(r.count);
    });

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
      sel.className = "maTextInput"; // Use shared input style
      const parText = getParTextForHole(row.hole);
      sel.setAttribute("aria-label", parText ? `Count for Hole ${row.hole} ${parText}` : `Count for Hole ${row.hole}`);

      const opts = [0, 1, 2, 3, 4].map(v => ({ label: String(v), value: String(v) }));
      sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
      sel.value = String(row.count ?? "2");

      sel.addEventListener("change", () => {
        row.count = String(sel.value);
        setDirty(true);
      });

      cell.appendChild(sel);
      el.listHoleDecl.appendChild(cell);
    }
  }

  // ---- Chrome ----
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
        left: { show: true, label: "Cancel", onClick: onCancel },
        right: { show: true, label: "Save", onClick: doSave },
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

  // ---- Dropdown population (static lists) ----
  function populateDropdowns() {
    // Game Format
    setSelectOptions(el.gameFormat, Object.entries(gameFormatConfig).map(([k, cfg]) => ({ value: k, label: cfg.label })));

    // Static selects
    setSelectOptions(el.toMethod, toMethodOptions);
    setSelectOptions(el.scoringBasis, scoringBasisOptions);
    setSelectOptions(el.scoringSystem, scoringSystemOptions);
    setSelectOptions(el.hcMethod, hcMethodOptions);
    setSelectOptions(el.allowance, allowanceOptions);
    setSelectOptions(el.strokeDistribution, strokeDistOptions);
    setSelectOptions(el.hcEffectivity, hcEffectivityOptions);

    // Competition + Rotation + Segments are dependency-built
    setSelectOptions(el.competition, Object.values(competitionConfig));
    setSelectOptions(el.rotation, rotationBase);

    // PlayerDecl is stored as opaque string in Wix; we fill with current value on hydrate
    if (el.playerDecl) setSelectOptions(el.playerDecl, [{ label: "11", value: "11" }]);

    // BestBall is dependency-built (MatchPlay restriction)
    setSelectOptions(el.bestBallCnt, bestBallOptionsForFormat("StrokePlay"));
  }

  function populateBlindPlayerSelect() {
    if (!el.blindPlayer) return;

    const arr = (Array.isArray(state.players) && state.players.length)
      ? state.players
      : (Array.isArray(state.roster) ? state.roster : []);

    // Wix sorts by last name (dbPlayers_LName)
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

  // ---- Hydrate from INIT game ----
  function hydrateFromGame() {
    const g = state.game || {};

    // Holes display is read-only reference to dbGames_Holes (All 18/F9/B9)
    if (el.holesDisplay) el.holesDisplay.value = String(g.dbGames_Holes || "");

    // General
    if (el.toMethod) el.toMethod.value = String(g.dbGames_TOMethod || "TeeTimes");
    if (el.gameFormat) el.gameFormat.value = String(g.dbGames_GameFormat || "StrokePlay");

    // Scoring (method/system set before applyDependencies so constraints can preserve stored values)
    if (el.scoringMethod) el.scoringMethod.value = String(g.dbGames_ScoringMethod || "NET");
    if (el.scoringSystem) el.scoringSystem.value = String(g.dbGames_ScoringSystem || "BestBall");

    if (el.bestBallCnt) el.bestBallCnt.value = String(g.dbGames_BestBall ?? "2");

    // PlayerDeclaration is stored as opaque string in Wix; keep current value
    const playerDecl = String(g.dbGames_PlayerDeclaration || "11");
    if (el.playerDecl) {
      setSelectOptions(el.playerDecl, [{ label: playerDecl, value: playerDecl }]);
      el.playerDecl.value = playerDecl;
    }

    // Competition/Segments/Rotation restored after dependencies build correct option sets
    if (el.competition) el.competition.value = String(g.dbGames_Competition || "PairField");
    if (el.segments) el.segments.value = String(g.dbGames_Segments || "9");
    if (el.rotation) el.rotation.value = String(g.dbGames_RotationMethod || "None");

    // Blind player stored as array<string> JSON
    const blindArr = Array.isArray(g.dbGames_BlindPlayers) ? g.dbGames_BlindPlayers : [];
    let blindGHIN = "";
    if (blindArr.length > 0) {
      try { blindGHIN = JSON.parse(blindArr[0] || "{}").ghin || ""; } catch (e) {}
    }
    if (el.useBlind) el.useBlind.checked = !!blindGHIN;
    if (el.blindPlayer) el.blindPlayer.value = blindGHIN;

    // Handicaps
    if (el.hcMethod) el.hcMethod.value = String(g.dbGames_HCMethod || "CH");
    if (el.allowance) el.allowance.value = String(g.dbGames_Allowance ?? "100");
    if (el.strokeDistribution) el.strokeDistribution.value = String(g.dbGames_StrokeDistribution || "Standard");

    // Effectivity: tolerate legacy values by appending option if missing
    const eff = String(g.dbGames_HCEffectivity || "PlayDate");
    if (el.hcEffectivity) {
      ensureOption(el.hcEffectivity, eff);
      el.hcEffectivity.value = eff;
    }

    // Date defaults to stored or play date; max date is play date
    const effDateRaw = g.dbGames_HCEffectivityDate || g.dbGames_PlayDate;
    if (el.hcEffDate) el.hcEffDate.value = isoDate(effDateRaw);

    const playIso = isoDate(g.dbGames_PlayDate);
    if (playIso && el.hcEffDate) el.hcEffDate.max = playIso;

    // Stableford + hole decls
    state.stableford = normalizeStableford(g.dbGames_StablefordPoints);
    state.holeDecls = normalizeHoleDecls(g.dbGames_HoleDeclaration);
  }

  // ---- Dependency logic (Wix parity core) ----
  function buildSegmentsOptionsFromHoles() {
    const g = state.game || {};
    const holesSetting = String(g.dbGames_Holes || "All 18");

    // Wix rule: All18 => 6/9 ; F9/B9 => 3/9
    if (holesSetting === "F9" || holesSetting === "B9") {
      return [
        { label: "3's", value: "3" },
        { label: "9's", value: "9" },
      ];
    }
    return [
      { label: "6's", value: "6" },
      { label: "9's", value: "9" },
    ];
  }

  function buildRotationOptions(segmentsValue, competitionValue) {
    const seg = String(segmentsValue || "9");
    const comp = String(competitionValue || "PairField");

    // Wix: PairField disables Rotation (forces None)
    if (comp === "PairField") return rotationBase.slice();

    // PairPair: 6/3 => COD ; 9 => 1324/1423 ; None always available
    const opts = rotationBase.slice();
    if (seg === "6" || seg === "3") opts.push(rotationCOD);
    if (seg === "9") opts.push(rotation1324, rotation1423);
    return opts;
  }

  function applyDependencies() {
    const g = state.game || {};

    const fmt = String(el.gameFormat?.value || "StrokePlay");
    const cfg = gameFormatConfig[fmt] || gameFormatConfig.StrokePlay;

    // Basis forced
    if (el.scoringBasis) {
      el.scoringBasis.value = cfg.basis;
      setDisabled(el.scoringBasis, true);
    }

    // Segments options derived from holes (preserve stored value if possible)
    if (el.segments) {
      const desiredSeg = String(el.segments.value ?? g.dbGames_Segments ?? "").trim() || "9";
      setSelectOptions(el.segments, buildSegmentsOptionsFromHoles());
      if (Array.from(el.segments.options).some(o => o.value === desiredSeg)) el.segments.value = desiredSeg;
      else el.segments.value = el.segments.options[0]?.value || "9";
    }

    // Scoring Method constrained (PRESERVE STORED VALUE)
    if (el.scoringMethod) {
      const desiredMethod = String(el.scoringMethod.value ?? g.dbGames_ScoringMethod ?? "").trim();
      const methodOptions = cfg.methods.map(m => ({ label: m, value: m }));
      setSelectOptions(el.scoringMethod, methodOptions);

      const valid = cfg.methods.map(m => String(m));
      if (desiredMethod && valid.includes(desiredMethod)) el.scoringMethod.value = desiredMethod;
      else if (!valid.includes(String(el.scoringMethod.value))) el.scoringMethod.value = cfg.methods[0] || "NET";
    }

    // Competition constrained (PRESERVE STORED VALUE)
    if (el.competition) {
      const desiredComp = String(el.competition.value ?? g.dbGames_Competition ?? "").trim();
      const compOpts = (cfg.competition || []).map(c => competitionConfig[c]).filter(Boolean);
      setSelectOptions(el.competition, compOpts);

      const valid = compOpts.map(o => String(o.value));
      if (desiredComp && valid.includes(desiredComp)) el.competition.value = desiredComp;
      else if (!valid.includes(String(el.competition.value))) el.competition.value = valid[0] || "PairField";
    }

    // Rotation depends on Segments + Competition (and PairField forces None)
    if (el.rotation) {
      const desiredRot = String(el.rotation.value ?? g.dbGames_RotationMethod ?? "").trim() || "None";
      const rotOpts = buildRotationOptions(el.segments?.value, el.competition?.value);
      setSelectOptions(el.rotation, rotOpts);

      const valid = rotOpts.map(o => String(o.value));
      if (valid.includes(desiredRot)) el.rotation.value = desiredRot;
      else el.rotation.value = valid[0] || "None";
    }

    // BestBall options depend on format (MatchPlay restrict 1/2)
    if (el.bestBallCnt) {
      const desiredBB = String(el.bestBallCnt.value ?? g.dbGames_BestBall ?? "").trim() || "2";
      const bbOpts = bestBallOptionsForFormat(fmt);
      setSelectOptions(el.bestBallCnt, bbOpts);

      const valid = bbOpts.map(o => String(o.value));
      if (valid.includes(desiredBB)) el.bestBallCnt.value = desiredBB;
      else el.bestBallCnt.value = valid[valid.length - 1] || "2";
    }

    // ADJ GROSS forces HCMethod=CH and Allowance=100 (Wix rule)
    const scoringMethod = String(el.scoringMethod?.value || "NET");
    const isAdjGross = (scoringMethod === "ADJ GROSS");

    if (el.hcMethod) {
      if (isAdjGross) el.hcMethod.value = "CH";
      setDisabled(el.hcMethod, isAdjGross);
    }
    if (el.allowance) {
      if (isAdjGross) el.allowance.value = "100";
      setDisabled(el.allowance, isAdjGross);
    }

    // StrokeDistribution: forced Standard unless (Rotation == COD && scoringMethod != ADJ GROSS)
    // Preserve user's prior selection to restore when the control becomes enabled again.
    const rot = String(el.rotation?.value || "None");
    const allowStrokeDist = (!isAdjGross && rot === "COD");

    if (el.strokeDistribution) {
      if (!allowStrokeDist) {
        // capture current selection once before we force/disable
        if (!el.strokeDistribution.disabled) {
          state._strokeDistPrior = String(el.strokeDistribution.value ?? "").trim();
        }
        el.strokeDistribution.value = "Standard";
        setDisabled(el.strokeDistribution, true);
      } else {
        setDisabled(el.strokeDistribution, false);

        // prefer current UI selection; if empty, restore prior remembered selection (if valid)
        const want = String(el.strokeDistribution.value ?? "").trim() || String(state._strokeDistPrior ?? "").trim();
        if (want && Array.from(el.strokeDistribution.options).some(o => o.value === want)) {
          el.strokeDistribution.value = want;
        }
      }
    }


    // ScoringSystem show/hide rules (Wix-aligned)
    const sys = String(el.scoringSystem?.value || "BestBall");

    // Scoring system toggles (Wix-style: fully collapse via display none)
    const showBB = (sys === "BestBall");
    show(el.divBestBall, showBB);
    if (el.bestBallCnt) setDisabled(el.bestBallCnt, !showBB);

    // PlayerDeclaration visible only for DeclarePlayer
    const showPD = (sys === "DeclarePlayer");
    show(el.divPlayerDecl, showPD);
    if (el.playerDecl) setDisabled(el.playerDecl, !showPD);

    // Dynamic cards:
    // Stableford only when basis=Points
    const basis = String(el.scoringBasis?.value || cfg.basis);
    const showStableford = (basis === "Points");
    show(el.cardStableford, showStableford);

    // HoleDecl only when scoringSystem=DeclareHole
    const showHoleDecl = (sys === "DeclareHole");
    show(el.cardHoleDecl, showHoleDecl);

    // Refresh renders when visible (keeps UX consistent)
    if (showStableford) renderStableford();
    if (showHoleDecl) renderHoleDecls();

    // Blind select enabled only when checkbox checked
    if (el.blindPlayer && el.useBlind) {
      el.blindPlayer.disabled = !el.useBlind.checked;
    }

    // Effectivity date visibility
    toggleHCEffDate();
  }

  function toggleHCEffDate() {
    if (!el.hcEffectivity || !el.divHCEffDate) return;
    const showDate = (String(el.hcEffectivity.value) === "Date");
    show(el.divHCEffDate, showDate);

    if (!showDate && el.hcEffDate) {
      // keep value, but save mapper will send null unless Date
    }
  }

  // ---- Save mapping (Wix-aligned) ----
  function buildPatchFromUI() {
    const g = state.game || {};

    // Blind player stored as array<string> JSON
    const blindValue = String(el.blindPlayer?.value || "").trim();
    const blindLabel = el.blindPlayer
      ? (Array.from(el.blindPlayer.options).find(o => o.value === blindValue)?.textContent || "")
      : "";
    const blindPlayersArray = (el.useBlind?.checked && blindValue && blindLabel)
      ? [JSON.stringify({ ghin: blindValue, name: String(blindLabel).trim() })]
      : [];

    // Effectivity date only sent when HCEffectivity = Date
    const eff = String(el.hcEffectivity?.value || "PlayDate");
    let effDate = (eff === "Date") ? String(el.hcEffDate?.value || "").trim() : null;

    // Clamp effectivity date to play date (Wix max behavior)
    const playIso = isoDate(g.dbGames_PlayDate);
    if (effDate && playIso && effDate > playIso) effDate = playIso;

    // Stableford only when basis=Points, else keep existing
    const basis = String(el.scoringBasis?.value || "");
    const stableford = (basis === "Points")
      ? (state.stableford || []).map(r => ({ reltoPar: Number(r.reltoPar), points: Number(r.points) }))
      : (Array.isArray(g.dbGames_StablefordPoints) ? g.dbGames_StablefordPoints : []);

    // Hole decls only when scoring system=DeclareHole
    const scoringSystem = String(el.scoringSystem?.value || "");
    const holeDecls = (scoringSystem === "DeclareHole")
      ? (state.holeDecls || []).map(r => ({ hole: Number(r.hole), count: String(r.count || "0") }))
      : [];

    const patch = {
      dbGames_GGID: state.ggid, // harmless if server ignores; helpful for logs
      dbGames_GameFormat: String(el.gameFormat?.value || "StrokePlay"),
      dbGames_TOMethod: String(el.toMethod?.value || "TeeTimes"),
      dbGames_ScoringBasis: String(el.scoringBasis?.value || ""),
      dbGames_Competition: String(el.competition?.value || "PairField"),
      dbGames_Segments: String(el.segments?.value || "9"),
      dbGames_RotationMethod: String(el.rotation?.value || "None"),

      dbGames_BlindPlayers: blindPlayersArray,

      dbGames_ScoringMethod: String(el.scoringMethod?.value || "NET"),
      dbGames_ScoringSystem: scoringSystem,
      dbGames_BestBall: String(el.bestBallCnt?.value || "4"),
      dbGames_PlayerDeclaration: String(el.playerDecl?.value || "11"),

      dbGames_HCMethod: String(el.hcMethod?.value || "CH"),
      dbGames_Allowance: parseInt(String(el.allowance?.value || "100"), 10) || 100,
      dbGames_StrokeDistribution: String(el.strokeDistribution?.value || "Standard"),
      dbGames_HCEffectivity: eff,
      dbGames_HCEffectivityDate: effDate,

      dbGames_StablefordPoints: stableford,
      dbGames_HoleDeclaration: holeDecls,
    };

    return patch;
  }

  async function doSave() {
    if (state.busy) return;
    if (!state.dirty) {
      window.location.assign(returnToUrl);
      return;
    }

    setStatus("Saving...", "info");
    setBusy(true);

    try {
      const patch = buildPatchFromUI();

      // Maintain established contract: { payload: {...} } like Game Maintenance
      const baseClean = String(gsApiBase || "").replace(/\/$/, "");
      const url = `${baseClean}/saveGameSettings.php`;

      const res = await postJson(url, { payload: { patch } });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");

      // Allow API to return updated game payload
      state.game = res.payload?.game || state.game;

      setDirty(false);
      setStatus("Settings saved successfully.", "success");

      // Trigger-3: Recalculate handicaps (Pass-A + Pass-B)
      setStatus("Recalculating handicaps...", "info");
      try {
        // Pass-A: Base Refresh (HI/CH/Baseline PH)
        await postJson(`${apiGHIN}/refreshHandicaps.php`, { ghin: "all" });
        // Pass-B: Competition Calc (PH/SO)
        await postJson(`${apiGHIN}/calcPHSO.php`, { action: "all" });
        setStatus("Handicaps updated.", "success");
      } catch (e) { console.error("Recalc failed", e); }

      // Re-apply dependencies (server may coerce fields)
      hydrateFromGame();
      applyDependencies();
      // Return to caller
      window.location.assign(returnToUrl);

    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || "An error occurred during save."), "error");
    } finally {
      setBusy(false);
    }
  }

  // ---- Tabs ----
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

  // ---- Events ----
  function wireEvents() {
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

    wireDirty(el.gameFormat, applyDependencies);
    wireDirty(el.toMethod);
    wireDirty(el.competition, applyDependencies);
    wireDirty(el.segments, applyDependencies);
    wireDirty(el.rotation, applyDependencies);

    wireDirty(el.scoringMethod, applyDependencies);
    wireDirty(el.scoringSystem, applyDependencies);
    wireDirty(el.bestBallCnt, () => {
      // BestBallCnt influences hole decl defaults
      if (String(el.scoringSystem?.value || "") === "DeclareHole") renderHoleDecls();
      applyDependencies();
    });
    wireDirty(el.playerDecl);

    wireDirty(el.hcMethod, applyDependencies);
    wireDirty(el.allowance);
    wireDirty(el.strokeDistribution);
    wireDirty(el.hcEffectivity, toggleHCEffDate);
    wireDirty(el.hcEffDate);

    if (el.useBlind) {
      el.useBlind.addEventListener("change", () => {
        if (el.blindPlayer) el.blindPlayer.disabled = !el.useBlind.checked;
        setDirty(true);
      });
    }
    wireDirty(el.blindPlayer);

    if (el.resetStableford) {
      el.resetStableford.addEventListener("click", () => {
        const ok = confirm("Reset Stableford points to defaults?");
        if (!ok) return;
        state.stableford = stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
        renderStableford();
        setDirty(true);
      });
    }
  }

  // ---- Init ----
  function loadContext() {
    if (!init || !init.ok) {
      setStatus("Failed to load game context.", "error");
      console.error("Missing or invalid __MA_INIT__ payload.", init);
      return false;
    }

    state.ggid = init.ggid ?? init.GGID ?? null;
    state.game = init.game || null;

    // tolerate either players or roster naming
    state.players = Array.isArray(init.players) ? init.players : [];
    state.roster = Array.isArray(init.roster) ? init.roster : state.players;

    state.coursePars = Array.isArray(init.coursePars) ? init.coursePars : [];
    state.courseParsByHole = buildCourseParsByHole(state.coursePars);

    return true;
  }

  function initialize() {
    const ok = loadContext();
    if (!ok) return;

    populateDropdowns();
    populateBlindPlayerSelect();

    hydrateFromGame();
    applyChrome();

    // Apply dependencies *after* hydration so stored values are preserved
    applyDependencies();

    // Initial tab
    setActiveTab("general");

    wireEvents();
    setDirty(false);
    setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();
