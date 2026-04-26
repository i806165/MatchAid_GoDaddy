/* /assets/pages/game_settings.js
   Game Settings — Wizard (Guided) controller only.
   Uses /assets/js/ma_shared.js (MA.postJson, MA.chrome, MA.setStatus, MA.routerGo)
*/
(function () {
  "use strict";

  const MA = window.MA || {};
  const chrome = MA.chrome || {};

  const init = window.__MA_INIT__ || window.__INIT__ || {};

  const postJson = typeof MA.postJson === "function" ? MA.postJson : null;
  if (!postJson) throw new Error("ma_shared.js not loaded (MA.postJson missing).");

  const routes = MA.routes || {};
  const gsApiBase = routes.apiGameSettings || MA.paths?.apiGameSettings || "/api/game_settings";
  const apiGHIN = MA.paths?.apiGHIN || "/api/GHIN";
  const returnToUrl = init.returnTo || routes.returnTo || "/app/admin_games/gameslist.php";

  // =========================================================================
  // CONSTANTS
  // =========================================================================

  const stablefordTemplate = [
    { reltoPar: -3, defaultPoints: 5 },
    { reltoPar: -2, defaultPoints: 4 },
    { reltoPar: -1, defaultPoints: 3 },
    { reltoPar:  0, defaultPoints: 2 },
    { reltoPar:  1, defaultPoints: 1 },
    { reltoPar:  2, defaultPoints: 0 },
  ];

  // Points strategies available per pairing type.
  // compFilter: 'PairField' | 'PairPair' | 'both'
  const POINTS_STRATEGIES = [
    {
      strategy:   "Stableford",
      label:      "Stableford",
      compFilter: "both",
      hint:       "Points awarded per hole based on score relative to par.",
      hasConfig:  true,  // shows the stableford grid
    },
    {
      strategy:   "Nines",
      label:      "9's",
      compFilter: "both",
      hint:       "A pool of 9 points is distributed each hole by finish position within the group.",
      hasConfig:  true,  // shows nines distribution chips
    },
    {
      strategy:   "LowBallLowTotal",
      label:      "Low-Ball / Low-Total",
      compFilter: "PairPair",
      hint:       "1 point for the side with the lowest individual score, 1 point for the lowest combined team score.",
      hasConfig:  false,
    },
    {
      strategy:   "LowBallHighBall",
      label:      "Low-Ball / High-Ball",
      compFilter: "PairPair",
      hint:       "1 point for the side with the lowest individual score, 1 point for the side with the lower high score between partners.",
      hasConfig:  false,
    },
    {
      strategy:   "Vegas",
      label:      "Vegas",
      compFilter: "PairPair",
      hint:       "Each side's scores combine into a two-digit number. The difference between the two numbers determines points won or lost per hole.",
      hasConfig:  false,
    },
    {
      strategy:   "Chicago",
      label:      "Chicago",
      compFilter: "PairField",
      hint:       "Each player has a points quota based on handicap. The winner is whoever most exceeds their quota.",
      hasConfig:  false,
    },
  ];

  const gameFormatConfig = {
    StrokePlay: { label: "Stroke Play", basis: "Strokes" },
    Stableford: { label: "Stableford",  basis: "Points"  },
    MatchPlay:  { label: "Match Play",  basis: "Holes"   },
    Skins:      { label: "Skins",       basis: "Skins"   },
    Scramble:   { label: "Scramble",    basis: "Strokes" },
    Shamble:    { label: "Shamble",     basis: "Strokes" },
    AltShot:    { label: "Alt-Shot",    basis: "Strokes" },
    Chapman:    { label: "Chapman",     basis: "Strokes" },
  };

  const allowanceOptions = (() => {
    const out = [];
    for (let i = 0; i <= 20; i++) out.push({ label: `${100 - i * 5}%`, value: String(100 - i * 5) });
    return out;
  })();

  const strokeDistOptions = [
    { label: "Standard stroke allocation",               value: "Standard"         },
    { label: "Strokes trimmed and distributed to spins", value: "Balanced"         },
    { label: "Strokes rounded and distributed to spins", value: "Balanced-Rounded" },
  ];

  const hcEffectivityOptions = [
    { label: "Play Date",    value: "PlayDate" },
    { label: "3-Month Low",  value: "Low3"     },
    { label: "6-Month Low",  value: "Low6"     },
    { label: "12-Month Low", value: "Low12"    },
    { label: "Choose Date",  value: "Date"     },
  ];

  const rotationBase = [{ label: "None", value: "None" }];
  const rotationCOD  = { label: "COD",  value: "COD"  };
  const rotation1324 = { label: "1324", value: "1324" };
  const rotation1423 = { label: "1423", value: "1423" };

  // compFilter: null = both, "PairField" = field only, "PairPair" = pair only
  const GAME_LABELS = [
    // ── Stroke Play / Field ──
    { label: "Stroke Play",  dbFormat: "StrokePlay", basis: "Strokes", compFilter: "PairField", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    // ── Points / Field ──
    { label: "Points",       dbFormat: "Stableford", basis: "Points",  compFilter: "PairField", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    // ── Skins / Field ──
    { label: "Skins",        dbFormat: "Skins",      basis: "Skins",   compFilter: "PairField", scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    // ── PairPair ──
    { label: "Medal Match",  dbFormat: "MatchPlay",  basis: "Strokes", compFilter: "PairPair",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Four Ball",    dbFormat: "MatchPlay",  basis: "Holes",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Skins Match",  dbFormat: "Skins",      basis: "Skins",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Points Match", dbFormat: "MatchPlay",  basis: "Points",  compFilter: "PairPair",  scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    // ── Team formats — available for both ──
    { label: "Alt-Shot",     dbFormat: "AltShot",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Chapman",      dbFormat: "Chapman",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Scramble",     dbFormat: "Scramble",   basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Shamble",      dbFormat: "Shamble",    basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    // ── Legacy / COD — kept for backward compat, hidden from new carousel ──
    { label: "C-O-D",        dbFormat: "MatchPlay",  basis: "Holes",   compFilter: "PairPair",  scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false, legacy: true },
    { label: "Best Ball",    dbFormat: "StrokePlay", basis: "Strokes", compFilter: null,        scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false, legacy: true },
    { label: "Declare",      dbFormat: "StrokePlay", basis: "Strokes", compFilter: null,        scoringSystem: "DeclareManual", scoringSystemLock: true,  bbCount: null, bbCountLock: true,  legacy: true },
    { label: "Stableford",   dbFormat: "Stableford", basis: "Points",  compFilter: null,        scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false,  legacy: true },
  ];

  const GAME_HINTS = {
    "Stroke Play":  "Every player counts their own score on every hole.",
    "Points":       "Points awarded per hole. Choose your points strategy on the next step.",
    "Points Match": "Two sides compete head to head on points. Higher cumulative points wins the match.",
    "Four Ball":    "1 or 2 player teams compete head to head. One best ball from each side wins hole.",
    "C-O-D":        "Foursomes organized into twosomes, rotating every three/six holes (spins) Carts, Opposites, Drivers.",
    "Medal Match":  "Two sides compete head to head on total net strokes. Lower cumulative score wins the match.",
    "Stableford":   "Points awarded per hole relative to par.",
    "Skins":        "Players compete for skins against the field. Ties carry forward.",
    "Skins Match":  "Two teams compete against each other for skins. Ties carry forward.",
    "Alt-Shot":     "Partners alternate shots on the same ball throughout the round. One score per team per hole.",
    "Chapman":      "Each player hits a tee shot, then switches — best second shot chosen, alternate shot to finish.",
    "Scramble":     "All players hit every shot from the best lie. One team score per hole.",
    "Shamble":      "All players hit tee shots, best drive chosen — each player finishes their own ball from there.",
    "Best Ball":    "Each team counts their lowest N scores. Fixed count on every hole or vary count per hole.",
    "Declare":      "Players choose which scores they wish to count on each hole. N scores must be declared by games end.",
  };

  const PAIRING_HINTS = {
    PairField: "Each pairing competes against the full field of players.",
    PairPair:  "Each pairing competes head-to-head against one other pairing.",
  };

  const WIZ_SYSTEMS = {
    AllScores:     { label: "Use All Scores",        desc: "Every player's score counts on every hole." },
    BestBall:      { label: "Best Ball",             desc: "The lowest N scores from the team count on each hole." },
    DeclareHole:   { label: "Declare per Hole",      desc: "The administrator sets how many scores count on each hole before the round." },
    DeclareManual: { label: "Declare at Discretion", desc: "Players declare which scores count at their own discretion." },
  };

  // =========================================================================
  // STATE
  // =========================================================================

  const state = {
    ggid:             null,
    game:             null,
    players:          [],
    roster:           [],
    coursePars:       [],
    courseParsByHole: null,
    recallTemplates:  [],
    dirty:            false,
    busy:             false,
    wizStep:          1,
  };

  // Wizard step state — source of truth for save
  const wiz = {
    // Step 1 — Format
    pairing:            null,   // 'PairField' | 'PairPair'
    selectedLabel:      null,
    selectedFormat:     null,
    selectedBasis:      null,
    compLock:           null,
    scoringSystem:      null,
    scoringSystemLock:  false,
    bbCount:            null,
    bbCountLock:        false,
    segments:           null,
    rotation:           null,
    // Step 2 — Scoring
    scoringMethod:      null,
    scoringSystemVal:   null,
    bestBall:           null,
    holeDecls:          [],
    pointsStrategy:     null,   // strategy key e.g. 'Stableford', 'Nines', etc.
    pointsConfig:       null,   // strategy-specific config object
    // Step 3 — Handicaps
    hcMethod:           null,
    allowance:          null,
    strokeDistribution: null,
    hcEffectivity:      null,
    hcEffectivityDate:  null,
  };

  // =========================================================================
  // DOM REFS — wizard only
  // =========================================================================

  const el = {
    wizContainer: document.getElementById("gsWizardContainer"),
    wizSteps: {
      s1: document.getElementById("gsWizStep1"),
      s2: document.getElementById("gsWizStep2"),
      s3: document.getElementById("gsWizStep3"),
    },
    wizDots: [
      document.getElementById("gsWizDot1"),
      document.getElementById("gsWizDot2"),
      document.getElementById("gsWizDot3"),
    ],

    // Step 1
    wizPairingChips:  document.getElementById("gsWizPairingChips"),
    wizPairingHint:   document.getElementById("gsWizPairingHint"),
    wizCarousel:      document.getElementById("gsWizCarousel"),
    wizGroupSegments: document.getElementById("gsWizGroupSegments"),
    wizGroupRotation: document.getElementById("gsWizGroupRotation"),
    wizSegChips:      document.getElementById("gsWizSegChips"),
    wizRotChips:      document.getElementById("gsWizRotChips"),
    wizRotNote:       document.getElementById("gsWizRotNote"),

    // Step 2
    wizMethodChips:          document.getElementById("gsWizMethodChips"),
    wizGroupBB:              document.getElementById("gsWizGroupBB"),
    wizBBChips:              document.getElementById("gsWizBBChips"),
    wizGroupHoleDecl:        document.getElementById("gsWizGroupHoleDecl"),
    wizHoleDeclGrid:         document.getElementById("gsWizHoleDeclGrid"),
    wizGroupPoints:          document.getElementById("gsWizGroupPoints"),
    wizPointsStrategyChips:  document.getElementById("gsWizPointsStrategyChips"),
    wizPointsStrategyHint:   document.getElementById("gsWizPointsStrategyHint"),
    wizGroupStableford:      document.getElementById("gsWizGroupStableford"),
    wizStablefordGrid:       document.getElementById("gsWizStablefordGrid"),
    wizGroupNines:           document.getElementById("gsWizGroupNines"),
    wizGroupLBLT:            document.getElementById("gsWizGroupLBLT"),
    wizGroupLBHB:            document.getElementById("gsWizGroupLBHB"),
    wizGroupVegas:           document.getElementById("gsWizGroupVegas"),

    // Step 3
    wizHCMethodChips:   document.getElementById("gsWizHCMethodChips"),
    wizAllowanceSelect: document.getElementById("gsWizAllowanceSelect"),
    wizStrokeDistChips: document.getElementById("gsWizStrokeDistChips"),
    wizStrokeDistNote:  document.getElementById("gsWizStrokeDistNote"),
    wizEffSelect:       document.getElementById("gsWizEffSelect"),
    wizEffDateWrap:     document.getElementById("gsWizEffDateWrap"),
    wizEffDateInput:    document.getElementById("gsWizEffDateInput"),

    // Summary panel
    wizSummary: {
      label:          document.getElementById("gsWizSvLabel"),
      format:         document.getElementById("gsWizSvFormat"),
      competition:    document.getElementById("gsWizSvCompetition"),
      segments:       document.getElementById("gsWizSvSegments"),
      rotation:       document.getElementById("gsWizSvRotation"),
      basis:          document.getElementById("gsWizSvBasis"),
      method:         document.getElementById("gsWizSvMethod"),
      system:         document.getElementById("gsWizSvSystem"),
      bb:             document.getElementById("gsWizSvBB"),
      pointsStrategy: document.getElementById("gsWizSvPointsStrategy"),
      hcmethod:       document.getElementById("gsWizSvHCMethod"),
      allowance:      document.getElementById("gsWizSvAllowance"),
      strokedist:     document.getElementById("gsWizSvStrokeDist"),
      hceff:          document.getElementById("gsWizSvHCEff"),
    },

    // Nav buttons
    wizBtnBack: document.getElementById("gsWizBtnBack"),
    wizBtnNext: document.getElementById("gsWizBtnNext"),
  };

  // =========================================================================
  // HELPERS
  // =========================================================================

  const setStatus = typeof MA.setStatus === "function"
    ? MA.setStatus
    : (msg, level) => {
        const s = document.getElementById("chromeStatusLine");
        if (!s) return;
        s.className = "maChrome__status " + (level ? ("status-" + level) : "status-info");
        s.textContent = msg || "";
      };

  function setBusy(on) {
    state.busy = !!on;
    if (typeof MA.chrome.setFooterSaveDisabled === "function") {
      MA.chrome.setFooterSaveDisabled(!!on);
    }
  }

  function setDirty(on) {
    state.dirty = !!on;
    setStatus(on ? "Unsaved changes." : "", on ? "warn" : "");
    applyChrome();
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function isoDate(v) {
    const s = String(v || "").trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }

  function formatDate(s) {
    if (!s) return "";
    let d = String(s).match(/^\d{4}-\d{2}-\d{2}$/)
      ? (() => { const [y,m,day] = s.split("-").map(Number); return new Date(y, m-1, day); })()
      : new Date(s);
    if (isNaN(d.getTime())) return s;
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${d.toLocaleDateString("en-US",{weekday:"short"})} ${mm}/${dd}/${yy}`;
  }

  function show(node, on) {
    if (!node) return;
    node.classList.toggle("hidden", !on);
    node.style.display = on ? "" : "none";
  }

  // =========================================================================
  // SHARED LOGIC
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
    return String(state.courseParsByHole?.[holeNum] || "").trim();
  }

  function buildSegmentsOptionsFromHoles() {
    const holesSetting = String(state.game?.dbGames_Holes || "All 18");
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

  function defaultSegmentsForLabel(gameLabel, holesVal) {
    if (gameLabel === "C-O-D") return (holesVal === "All 18") ? "6" : "3";
    return "9";
  }

  function normalizeStableford(existing) {
    let arr = existing;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
    arr = Array.isArray(arr) ? arr : [];
    // Support both old flat array and new strategy envelope
    if (arr.strategy === "Stableford" && Array.isArray(arr.values)) arr = arr.values;
    if (!arr.length) return stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
    return arr.map((r, i) => ({
      reltoPar: Number(r.reltoPar ?? stablefordTemplate[i]?.reltoPar ?? 0),
      points:   Number(r.points   ?? r.defaultPoints ?? stablefordTemplate[i]?.defaultPoints ?? 0),
    }));
  }

  /**
   * Parse saved dbGames_PointsConfig into wiz.pointsStrategy + wiz.pointsConfig.
   * Supports both old flat Stableford array and new strategy envelope.
   */
  function parsePointsConfig(raw) {
    let parsed = raw;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }
    if (!parsed) return { strategy: null, config: null };

    // New envelope format: { strategy, values }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.strategy) {
      return { strategy: parsed.strategy, config: parsed };
    }

    // Legacy: flat array of stableford rows
    if (Array.isArray(parsed) && parsed.length) {
      return {
        strategy: "Stableford",
        config: { strategy: "Stableford", values: parsed },
      };
    }

    return { strategy: null, config: null };
  }

  /**
   * Build the dbGames_PointsConfig envelope from current wiz state.
   */
  function buildPointsConfig() {
    if (!wiz.pointsStrategy) return null;

    switch (wiz.pointsStrategy) {
      case "Stableford": {
        const g = state.game || {};
        const existingRaw = g.dbGames_PointsConfig ?? g.dbGames_StablefordPoints ?? null;
        let existingValues = null;
        if (existingRaw) {
          const parsed = parsePointsConfig(existingRaw);
          if (parsed.strategy === "Stableford") existingValues = parsed.config?.values ?? null;
        }
        return {
          strategy: "Stableford",
          values: normalizeStableford(existingValues),
        };
      }
      case "Nines":
        return {
          strategy: "Nines",
          values: Array.isArray(wiz.pointsConfig?.values) ? wiz.pointsConfig.values : [5, 3, 1, 0],
        };
      case "LowBallLowTotal":
        return { strategy: "LowBallLowTotal", values: { category1: 1, category2: 1 } };
      case "LowBallHighBall":
        return { strategy: "LowBallHighBall", values: { category1: 1, category2: 1 } };
      case "Vegas":
        return { strategy: "Vegas", values: { pointsPerUnit: 1 } };
      case "Chicago":
        return { strategy: "Chicago", values: { quotaMethod: "handicap" } };
      default:
        return { strategy: wiz.pointsStrategy, values: wiz.pointsConfig?.values ?? null };
    }
  }

  /**
   * Returns GAME_LABELS filtered to the current pairing strategy.
   * Legacy entries are excluded from the carousel but used for hydration.
   */
  function filteredGameLabels() {
    const pairing = wiz.pairing || "PairField";
    return GAME_LABELS.filter(gl => {
      if (gl.legacy) return false;
      if (!gl.compFilter) return true;          // 'both' — team formats
      return gl.compFilter === pairing;
    });
  }

  /**
   * Returns POINTS_STRATEGIES filtered to the current pairing strategy.
   */
  function filteredPointsStrategies() {
    const pairing = wiz.pairing || "PairField";
    return POINTS_STRATEGIES.filter(ps =>
      ps.compFilter === "both" || ps.compFilter === pairing
    );
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
      chrome.setHeaderLines(["Game Settings", gameTitle, [course, date].filter(Boolean).join(" • ")]);
    }
    if (chrome && typeof chrome.setActions === "function") {
      chrome.setActions({
        left:  { show: false },
        right: { show: false },
        footer: state.dirty
          ? {
              save:   { label: "Save",   onClick: doSave },
              cancel: { label: "Cancel", onClick: () => { if (confirm("Discard unsaved changes?")) window.location.reload(); } }
            }
          : null
      });
    }
    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary", "scorecard"],
        active: "settings",
        onNavigate: id => (typeof MA.routerGo === "function" ? MA.routerGo(id) : null),
      });
    }
  }

  function onCancel() {
    if (state.dirty && !confirm("Discard unsaved changes and go back?")) return;
    window.location.assign(returnToUrl);
  }

  // =========================================================================
  // SAVE — reads directly from wiz.* state
  // =========================================================================

  function buildPatchFromWiz() {
    const g = state.game || {};

    const holeDecls = (wiz.scoringSystemVal === "DeclareHole" && wiz.holeDecls.length)
      ? wiz.holeDecls.map(r => ({ hole: Number(r.hole), count: String(r.count || "0") }))
      : [];

    const pointsConfig = (wiz.selectedBasis === "Points")
      ? buildPointsConfig()
      : null;

    const eff     = wiz.hcEffectivity || "PlayDate";
    const playIso = isoDate(g.dbGames_PlayDate);
    let effDate   = (eff === "Date") ? (wiz.hcEffectivityDate || null) : null;
    if (effDate && playIso && effDate > playIso) effDate = playIso;

    return {
      dbGames_GGID:               state.ggid,
      dbGames_GameLabel:          wiz.selectedLabel          || "",
      dbGames_GameFormat:         wiz.selectedFormat         || "StrokePlay",
      dbGames_TOMethod:           String(g.dbGames_TOMethod  || "TeeTimes"),
      dbGames_ScoringBasis:       wiz.selectedBasis          || "Strokes",
      dbGames_Competition:        wiz.pairing                || "PairField",
      dbGames_Segments:           wiz.segments               || "9",
      dbGames_RotationMethod:     wiz.rotation               || "None",
      dbGames_BlindPlayers:       Array.isArray(g.dbGames_BlindPlayers) ? g.dbGames_BlindPlayers : [],
      dbGames_ScoringMethod:      wiz.scoringMethod          || "NET",
      dbGames_ScoringSystem:      wiz.scoringSystemVal       || "BestBall",
      dbGames_BestBall:           wiz.bestBall               || "4",
      dbGames_PlayerDeclaration:  String(g.dbGames_PlayerDeclaration || "11"),
      dbGames_HCMethod:           wiz.hcMethod               || "CH",
      dbGames_Allowance:          parseInt(wiz.allowance || "100", 10) || 100,
      dbGames_StrokeDistribution: wiz.strokeDistribution     || "Standard",
      dbGames_HCEffectivity:      eff,
      dbGames_HCEffectivityDate:  effDate,
      dbGames_PointsConfig:       pointsConfig,              // replaces dbGames_StablefordPoints
      dbGames_HoleDeclaration:    holeDecls,
      dbGames_CustomScores:       g.dbGames_CustomScores     || null,
    };
  }

  async function doSave() {
    if (state.busy) return;
    if (!state.dirty) return; 
    setStatus("Saving...", "info");
    setBusy(true);
    try {
      const patch = buildPatchFromWiz();
      const url = `${String(gsApiBase).replace(/\/$/, "")}/saveGameSettings.php`;
      const res = await postJson(url, { payload: { patch } });
      if (!res || !res.ok) throw new Error(res?.message || "Save failed.");
      state.game = res.payload?.game || state.game;
      setDirty(false);
      setStatus("Settings saved successfully.", "success");
      if (MA.recalculateHandicaps) await MA.recalculateHandicaps(apiGHIN);
    } catch (e) {
      console.error(e);
      setStatus(String(e?.message || "An error occurred during save."), "error");
    } finally {
      setBusy(false);
    }
  }

  // =========================================================================
  // WIZARD — HYDRATE FROM GAME (populate wiz.* from saved game data)
  // =========================================================================

  function wizHydrateFromGame() {
    const g = state.game || {};

    // Pairing strategy — derived from dbGames_Competition
    wiz.pairing = String(g.dbGames_Competition || "PairField");

    // Step 1 — match saved format/label to a GAME_LABELS entry
    // Check all labels including legacy entries for backward compat
    const savedFmt   = String(g.dbGames_GameFormat  || "StrokePlay");
    const savedLabel = String(g.dbGames_GameLabel   || "");
    const match = GAME_LABELS.find(gl => gl.label === savedLabel && gl.dbFormat === savedFmt)
               || GAME_LABELS.find(gl => gl.dbFormat === savedFmt)
               || GAME_LABELS[0];
    wiz.selectedLabel     = match.label;
    wiz.selectedFormat    = match.dbFormat;
    wiz.selectedBasis     = match.basis || (gameFormatConfig[match.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock          = match.compLock    || null;
    wiz.scoringSystem     = match.scoringSystem  || null;
    wiz.scoringSystemLock = match.scoringSystemLock || false;
    wiz.bbCount           = match.bbCount        || null;
    wiz.bbCountLock       = match.bbCountLock    || false;

    wiz.segments = String(g.dbGames_Segments       || "9");
    wiz.rotation = String(g.dbGames_RotationMethod || "None");

    // Step 2
    wiz.scoringMethod    = String(g.dbGames_ScoringMethod  || "NET");
    wiz.scoringSystemVal = String(g.dbGames_ScoringSystem  || match.scoringSystem || "BestBall");
    wiz.bestBall         = String(g.dbGames_BestBall        ?? "2");
    wiz.holeDecls        = [];

    // Points config — support both new field and legacy field
    const rawConfig = g.dbGames_PointsConfig ?? g.dbGames_StablefordPoints ?? null;
    const parsed = parsePointsConfig(rawConfig);
    wiz.pointsStrategy = parsed.strategy;
    wiz.pointsConfig   = parsed.config;

    // Step 3
    wiz.hcMethod           = String(g.dbGames_HCMethod           || "CH");
    wiz.allowance          = String(g.dbGames_Allowance           ?? "100");
    wiz.strokeDistribution = String(g.dbGames_StrokeDistribution  || "Standard");
    wiz.hcEffectivity      = String(g.dbGames_HCEffectivity       || "PlayDate");
    wiz.hcEffectivityDate  = isoDate(g.dbGames_HCEffectivityDate  || g.dbGames_PlayDate);
  }

  // =========================================================================
  // WIZARD — STEP RENDERING
  // =========================================================================

  function wizRenderStep(step) {
    state.wizStep = step;
    const totalSteps = 3;

    // Progress dots
    el.wizDots.forEach((dot, i) => {
      if (!dot) return;
      const n = i + 1;
      const stepEl = dot.parentElement;
      stepEl.classList.toggle("active", n === step);
      stepEl.classList.remove("done", "upcoming");
      dot.textContent = "";
    });

    // Show only current step panel
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

    // Next button — hidden on final step (chrome footer Save owns that action)
    if (el.wizBtnNext) {
      el.wizBtnNext.style.display = (step === totalSteps) ? "none" : "";
      el.wizBtnNext.textContent = "Next →";
    }

    switch (step) {
      case 1: wizRenderStep1(); break;
      case 2: wizRenderStep2(); break;
      case 3: wizRenderStep3(); break;
    }

    wizUpdateSummary();
    wizCheckComplete();
  }

  // ---- Step 1: Format — Pairing chips + Carousel + Segments + Rotation ----
  function wizRenderStep1() {
    // Pairing chips
    if (el.wizPairingChips) {
      el.wizPairingChips.querySelectorAll(".wizChip").forEach(b => {
        b.classList.toggle("selected", b.dataset.val === wiz.pairing);
      });
    }
    if (el.wizPairingHint) {
      el.wizPairingHint.textContent = PAIRING_HINTS[wiz.pairing] || "";
    }

    // Carousel — filtered by pairing
    if (el.wizCarousel) {
      el.wizCarousel.innerHTML = "";
      filteredGameLabels().forEach(game => {
        const card = document.createElement("div");
        card.className = "wizGameCard" + (wiz.selectedLabel === game.label ? " selected" : "");
        card.dataset.label = game.label;
        card.innerHTML = `
          <div class="wizGameCard__name">${esc(game.label)}</div>
          <div class="wizGameCard__fmt">${esc(game.dbFormat)}</div>
          <div class="wizGameCard__fmt">${esc(game.basis)}</div>
        `;
        card.addEventListener("click", () => wizSelectGame(game.label));
        el.wizCarousel.appendChild(card);
      });
      wizDragScroll(el.wizCarousel);
      if (wiz.selectedLabel) {
        const sel = el.wizCarousel.querySelector(`[data-label="${CSS.escape(wiz.selectedLabel)}"]`);
        if (sel) sel.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }

    const hintEl = document.getElementById("gsWizGameHint");
    if (hintEl) hintEl.textContent = GAME_HINTS[wiz.selectedLabel] || "";

    // Segments + Rotation — PairPair only
    const isPairPair = (wiz.pairing === "PairPair");
    show(el.wizGroupSegments, isPairPair);
    show(el.wizGroupRotation, isPairPair);

    if (isPairPair) {
      // Segments chips
      if (el.wizSegChips) {
        const opts = buildSegmentsOptionsFromHoles();
        el.wizSegChips.innerHTML = "";
        const holesVal = String(state.game?.dbGames_Holes || "All 18");
        const defSeg = defaultSegmentsForLabel(wiz.selectedLabel, holesVal);
        const validVals = opts.map(o => o.value);
        if (!validVals.includes(wiz.segments)) {
          wiz.segments = validVals.includes(defSeg) ? defSeg : validVals[0];
        }
        const isCOD = (wiz.selectedLabel === "C-O-D");
        if (isCOD) wiz.segments = defSeg;

        opts.forEach(opt => {
          const b = document.createElement("button");
          b.dataset.val = opt.value;
          b.textContent = opt.label;
          if (isCOD && opt.value === defSeg) {
            b.className = "wizChip locked";
          } else if (isCOD) {
            b.className = "wizChip disabled";
          } else {
            b.className = "wizChip" + (wiz.segments === opt.value ? " selected" : "");
            b.addEventListener("click", () => wizSelectSegments(opt.value));
          }
          el.wizSegChips.appendChild(b);
        });
      }

      // Rotation chips
      wizRenderRotChips();
    }
  }

  function wizRenderRotChips() {
    if (!el.wizRotChips) return;
    const opts = buildRotationOptions(wiz.segments, wiz.pairing);
    el.wizRotChips.innerHTML = "";
    const validVals = opts.map(o => o.value);
    if (!validVals.includes(wiz.rotation)) wiz.rotation = validVals[0] || "None";

    const isCOD = (wiz.selectedLabel === "C-O-D");
    if (isCOD) wiz.rotation = "COD";

    opts.forEach(opt => {
      const b = document.createElement("button");
      b.dataset.val = opt.value;
      b.textContent = opt.label;
      if (isCOD && opt.value === "COD") {
        b.className = "wizChip locked";
      } else if (isCOD) {
        b.className = "wizChip disabled";
      } else {
        b.className = "wizChip" + (wiz.rotation === opt.value ? " selected" : "");
        b.addEventListener("click", () => wizSelectRotation(opt.value));
      }
      el.wizRotChips.appendChild(b);
    });

    wizUpdateRotNote();
  }

  function wizUpdateRotNote() {
    if (!el.wizRotNote) return;
    const seg = wiz.segments; const rot = wiz.rotation;
    if (wiz.pairing === "PairField") { el.wizRotNote.textContent = ""; return; }
    if (seg === "9") { el.wizRotNote.textContent = rot !== "None" ? "Partners rotate between the two 9-hole segments." : ""; return; }
    if (seg === "6" || seg === "3") {
      el.wizRotNote.textContent = rot === "COD" ? "COD rotation — partners change each segment." : "Select COD to rotate partners.";
    }
  }

  // ---- Step 2: Scoring ----
  function wizRenderStep2() {
    const fmt = wiz.selectedFormat || "StrokePlay";

    // Method chips
    if (el.wizMethodChips) {
      el.wizMethodChips.querySelectorAll(".wizChip").forEach(b =>
        b.classList.toggle("selected", b.dataset.val === wiz.scoringMethod)
      );
    }

    // System dropdown
    const sysSel = document.getElementById("gsWizSystemList");
    if (sysSel) {
      const locked = wiz.scoringSystemLock;
      const preset = wiz.scoringSystem;
      const teamFmts = ["Scramble", "Shamble", "AltShot", "Chapman"];
      const isPoints = (wiz.selectedBasis === "Points");
      // Points games use BestBall only for system (simplest path)
      const avail = isPoints
        ? ["BestBall"]
        : teamFmts.includes(fmt)
          ? ["BestBall"]
          : ["AllScores", "BestBall", "DeclareHole", "DeclareManual"];
      sysSel.innerHTML = "";
      avail.forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = WIZ_SYSTEMS[key].label;
        sysSel.appendChild(opt);
      });
      if (locked && preset) {
        sysSel.value = preset;
        sysSel.disabled = true;
        wiz.scoringSystemVal = preset;
      } else {
        sysSel.disabled = false;
        if (wiz.scoringSystemVal && avail.includes(wiz.scoringSystemVal)) {
          sysSel.value = wiz.scoringSystemVal;
        } else if (avail.length) {
          sysSel.value = avail[0];
          wiz.scoringSystemVal = avail[0];
        }
      }
      sysSel.onchange = () => wizSelectSystem(sysSel.value);
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
          const isLocked   = wiz.bbCountLock && wiz.bbCount === v;
          const isDisabled = wiz.bbCountLock && wiz.bbCount !== v;
          if (isLocked)        b.classList.add("locked");
          else if (isDisabled) b.classList.add("disabled");
          else {
            b.addEventListener("click", () => wizSelectBB(v));
            if (wiz.bestBall === v) b.classList.add("selected");
          }
          el.wizBBChips.appendChild(b);
        });
        if (wiz.bbCountLock && wiz.bbCount) wiz.bestBall = wiz.bbCount;
      }
    }

    // Hole Declarations
    if (el.wizGroupHoleDecl) {
      const showHD = (wiz.scoringSystemVal === "DeclareHole");
      show(el.wizGroupHoleDecl, showHD);
      if (showHD) wizRenderHoleDeclGrid();
    }

    // Points Strategy section — only when basis === 'Points'
    const isPoints = (wiz.selectedBasis === "Points");
    show(el.wizGroupPoints, isPoints);

    if (isPoints) {
      wizRenderPointsStrategyChips();
    }

    // Points config sub-sections
    wizRenderPointsConfigSections();
  }

  function wizRenderPointsStrategyChips() {
    if (!el.wizPointsStrategyChips) return;
    el.wizPointsStrategyChips.innerHTML = "";
    const strategies = filteredPointsStrategies();

    strategies.forEach(ps => {
      const b = document.createElement("button");
      b.className = "wizChip" + (wiz.pointsStrategy === ps.strategy ? " selected" : "");
      b.dataset.val = ps.strategy;
      b.textContent = ps.label;
      b.addEventListener("click", () => wizSelectPointsStrategy(ps.strategy));
      el.wizPointsStrategyChips.appendChild(b);
    });

    // Update hint
    if (el.wizPointsStrategyHint) {
      const current = strategies.find(ps => ps.strategy === wiz.pointsStrategy);
      el.wizPointsStrategyHint.textContent = current?.hint || "";
    }
  }

  function wizRenderPointsConfigSections() {
    const strategy = wiz.pointsStrategy;
    const cfg      = wiz.pointsConfig || {};

    // ── Stableford / Chicago grid ─────────────────────────────────────────────
    const showSF = (strategy === "Stableford" || strategy === "Chicago");
    show(el.wizGroupStableford, showSF);
    if (showSF && el.wizStablefordGrid) {
      // Label varies by strategy
      const labelEl = document.getElementById("gsWizStablefordLabel");
      if (labelEl) labelEl.textContent = strategy === "Chicago" ? "Points per Score" : "Stableford Points";

      // Chicago quota note
      const noteEl = document.getElementById("gsWizChicagoNote");
      if (noteEl) show(noteEl, strategy === "Chicago");

      // Build editable grid from saved values or template defaults
      const savedValues = Array.isArray(cfg.values) ? cfg.values : [];
      const relLabels   = { "-3":"−3", "-2":"−2", "-1":"−1", "0":"E", "1":"+1", "2":"+2" };
      const scoreNames  = ["Albatross", "Eagle", "Birdie", "Par", "Bogey", "Dbl Bogey"];

      el.wizStablefordGrid.innerHTML = "";
      stablefordTemplate.forEach((row, i) => {
        const saved = savedValues.find(r => r.reltoPar === row.reltoPar);
        const pts   = saved ? saved.points : row.defaultPoints;

        const cell = document.createElement("div");
        cell.className = "wizStableford__cell";

        const relDiv  = document.createElement("div");
        relDiv.className = "wizStableford__rel";
        relDiv.textContent = relLabels[String(row.reltoPar)] || String(row.reltoPar);

        const ptsDiv  = document.createElement("div");
        ptsDiv.className = "wizStableford__pts";

        const input = document.createElement("input");
        input.type  = "number";
        input.min   = "0";
        input.max   = "99";
        input.step  = "1";
        input.value = String(pts);
        input.setAttribute("aria-label", `Points for ${scoreNames[i] || row.reltoPar}`);
        input.addEventListener("change", () => {
          wizSyncStablefordConfig();
          setDirty(true); wizCheckComplete();
        });

        ptsDiv.appendChild(input);

        const nameDiv = document.createElement("div");
        nameDiv.className = "wizStableford__name";
        nameDiv.textContent = scoreNames[i] || "";

        cell.appendChild(relDiv);
        cell.appendChild(ptsDiv);
        cell.appendChild(nameDiv);
        el.wizStablefordGrid.appendChild(cell);
      });

      // Sync initial config state
      wizSyncStablefordConfig();
    }

    // ── Nines table ───────────────────────────────────────────────────────────
    const showNines = (strategy === "Nines");
    const ninesTable = document.getElementById("gsWizNinesTable");
    show(el.wizGroupNines, showNines);
    if (showNines && ninesTable) {
      ninesTable.innerHTML = "";

      const savedVals = (cfg.values && typeof cfg.values === "object" && !Array.isArray(cfg.values))
        ? cfg.values
        : {};

      const rows = [
        { key: "4", label: "4 Players", defaults: [5, 3, 1, 0] },
        { key: "3", label: "3 Players", defaults: [4, 3, 2]    },
      ];

      rows.forEach(r => {
        const saved  = Array.isArray(savedVals[r.key]) ? savedVals[r.key] : r.defaults;
        const rowDiv = document.createElement("div");
        rowDiv.className = "gsWizNinesRow";

        const lbl = document.createElement("div");
        lbl.className   = "gsWizNinesRowLabel";
        lbl.textContent = r.label;

        const inputsDiv = document.createElement("div");
        inputsDiv.className = "gsWizNinesInputs";

        saved.forEach((val, idx) => {
          if (idx > 0) {
            const sep = document.createElement("span");
            sep.className   = "gsWizNinesSep";
            sep.textContent = "·";
            inputsDiv.appendChild(sep);
          }
          const inp = document.createElement("input");
          inp.type      = "number";
          inp.min       = "0";
          inp.max       = "9";
          inp.step      = "1";
          inp.value     = String(val);
          inp.className = "gsWizNinesInput maTextInput";
          inp.setAttribute("aria-label", `Position ${idx + 1} points for ${r.label}`);
          inp.addEventListener("change", () => {
            wizSyncNinesConfig();
            setDirty(true); wizCheckComplete();
          });
          inputsDiv.appendChild(inp);
        });

        rowDiv.appendChild(lbl);
        rowDiv.appendChild(inputsDiv);
        ninesTable.appendChild(rowDiv);
      });

      wizSyncNinesConfig();
    }

    // ── LowBall / LowTotal ────────────────────────────────────────────────────
    const showLBLT = (strategy === "LowBallLowTotal");
    show(el.wizGroupLBLT, showLBLT);
    if (showLBLT) {
      const lb = document.getElementById("gsWizLBLT_LowBall");
      const lt = document.getElementById("gsWizLBLT_LowTotal");
      if (lb) lb.value = String(cfg.values?.lowBall  ?? 1);
      if (lt) lt.value = String(cfg.values?.lowTotal ?? 1);
      wizSyncSimplePointsConfig();
    }

    // ── LowBall / HighBall ────────────────────────────────────────────────────
    const showLBHB = (strategy === "LowBallHighBall");
    show(el.wizGroupLBHB, showLBHB);
    if (showLBHB) {
      const lb = document.getElementById("gsWizLBHB_LowBall");
      const hb = document.getElementById("gsWizLBHB_HighBall");
      if (lb) lb.value = String(cfg.values?.lowBall  ?? 1);
      if (hb) hb.value = String(cfg.values?.highBall ?? 1);
      wizSyncSimplePointsConfig();
    }

    // ── Vegas ─────────────────────────────────────────────────────────────────
    const showVegas = (strategy === "Vegas");
    show(el.wizGroupVegas, showVegas);
    if (showVegas) {
      const ppu = document.getElementById("gsWizVegas_PointsPerUnit");
      if (ppu) ppu.value = String(cfg.values?.pointsPerUnit ?? 1);
      wizSyncSimplePointsConfig();
    }
  }

  // Sync stableford/Chicago grid inputs → wiz.pointsConfig
  function wizSyncStablefordConfig() {
    if (!el.wizStablefordGrid) return;
    const inputs = el.wizStablefordGrid.querySelectorAll("input[type=number]");
    const values = [];
    stablefordTemplate.forEach((row, i) => {
      const inp = inputs[i];
      values.push({
        reltoPar: row.reltoPar,
        points:   inp ? Math.max(0, parseInt(inp.value, 10) || 0) : row.defaultPoints,
      });
    });
    const base = { strategy: wiz.pointsStrategy, values };
    if (wiz.pointsStrategy === "Chicago") {
      base.quota = { method: "handicap", base: 36 };
    }
    wiz.pointsConfig = base;
  }

  // Sync nines table inputs → wiz.pointsConfig
  function wizSyncNinesConfig() {
    const ninesTable = document.getElementById("gsWizNinesTable");
    if (!ninesTable) return;
    const rowEls = ninesTable.querySelectorAll(".gsWizNinesRow");
    const keys   = ["4", "3"];
    const values = {};
    rowEls.forEach((rowEl, i) => {
      const key    = keys[i];
      const inputs = rowEl.querySelectorAll("input[type=number]");
      values[key]  = Array.from(inputs).map(inp => Math.max(0, parseInt(inp.value, 10) || 0));
    });
    wiz.pointsConfig = { strategy: "Nines", values };
  }

  // Sync simple point input grids → wiz.pointsConfig
  function wizSyncSimplePointsConfig() {
    const strategy = wiz.pointsStrategy;
    let values = {};

    if (strategy === "LowBallLowTotal") {
      const lb = document.getElementById("gsWizLBLT_LowBall");
      const lt = document.getElementById("gsWizLBLT_LowTotal");
      values = {
        lowBall:  Math.max(0, parseInt(lb?.value || "1", 10)),
        lowTotal: Math.max(0, parseInt(lt?.value || "1", 10)),
      };
    } else if (strategy === "LowBallHighBall") {
      const lb = document.getElementById("gsWizLBHB_LowBall");
      const hb = document.getElementById("gsWizLBHB_HighBall");
      values = {
        lowBall:  Math.max(0, parseInt(lb?.value || "1", 10)),
        highBall: Math.max(0, parseInt(hb?.value || "1", 10)),
      };
    } else if (strategy === "Vegas") {
      const ppu = document.getElementById("gsWizVegas_PointsPerUnit");
      values = { pointsPerUnit: Math.max(1, parseInt(ppu?.value || "1", 10)) };
    }

    wiz.pointsConfig = { strategy, values };
  }

  function wizSelectPointsStrategy(strategy) {
    wiz.pointsStrategy = strategy;
    wiz.pointsConfig   = null; // reset config when strategy changes

    if (el.wizPointsStrategyChips) {
      el.wizPointsStrategyChips.querySelectorAll(".wizChip").forEach(b =>
        b.classList.toggle("selected", b.dataset.val === strategy)
      );
    }
    if (el.wizPointsStrategyHint) {
      const ps = POINTS_STRATEGIES.find(p => p.strategy === strategy);
      el.wizPointsStrategyHint.textContent = ps?.hint || "";
    }

    wizRenderPointsConfigSections();
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function onPointsInputChange() {
    const strategy = wiz.pointsStrategy;
    if (strategy === "Stableford" || strategy === "Chicago") wizSyncStablefordConfig();
    else if (strategy === "Nines")                           wizSyncNinesConfig();
    else                                                     wizSyncSimplePointsConfig();
    setDirty(true); wizCheckComplete();
  }

  // ---- Step 3: Handicaps ----
  function wizRenderStep3() {
    const isAdjGross = (wiz.scoringMethod === "ADJ GROSS");

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

    // Stroke distribution
    if (el.wizStrokeDistChips) {
      const allowSD = (!isAdjGross && wiz.rotation === "COD");
      el.wizStrokeDistChips.innerHTML = "";
      if (!allowSD) {
        const b = document.createElement("button");
        b.className = "wizChip locked"; b.textContent = "Standard";
        el.wizStrokeDistChips.appendChild(b);
        wiz.strokeDistribution = "Standard";
        wizSetStrokeDistHint("Standard");
      } else {
        strokeDistOptions.forEach(opt => {
          const b = document.createElement("button");
          b.className = "wizChip" + (wiz.strokeDistribution === opt.value ? " selected" : "");
          b.dataset.val = opt.value; b.textContent = opt.label;
          b.addEventListener("click", () => wizSelectStrokeDist(opt.value));
          el.wizStrokeDistChips.appendChild(b);
        });
        wizSetStrokeDistHint(wiz.strokeDistribution || "Standard");
      }
    }

    // Effectivity select
    if (el.wizEffSelect) {
      if (!el.wizEffSelect.options.length) {
        hcEffectivityOptions.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label + " — " + ({
            PlayDate: "Handicap index as of the day of play.",
            Low3:     "Lowest index over the past 3 months.",
            Low6:     "Lowest index over the past 6 months.",
            Low12:    "Lowest index over the past 12 months.",
            Date:     "Specify an exact date to lock the index.",
          }[opt.value] || "");
          el.wizEffSelect.appendChild(o);
        });
      }
      el.wizEffSelect.value = wiz.hcEffectivity || "PlayDate";
    }

    // Effectivity date
    if (el.wizEffDateWrap) show(el.wizEffDateWrap, wiz.hcEffectivity === "Date");
    if (el.wizEffDateInput) {
      const playIso = isoDate(state.game?.dbGames_PlayDate);
      if (playIso) el.wizEffDateInput.max = playIso;
      if (wiz.hcEffectivityDate) el.wizEffDateInput.value = wiz.hcEffectivityDate;
    }
  }

  function wizSetStrokeDistHint(val) {
    if (!el.wizStrokeDistNote) return;
    const seg = parseInt(wiz.segments || "9", 10);
    const holesVal = String(state.game?.dbGames_Holes || "All 18");
    const totalHoles = (holesVal === "F9" || holesVal === "B9") ? 9 : 18;
    const spinCount = seg > 0 ? Math.round(totalHoles / seg) : 3;
    const hints = {
      Standard:           "Use standard hole handicaps.",
      Balanced:           "Strokes trimmed and distributed evenly across spins.",
      "Balanced-Rounded": `Player handicaps are rounded to nearest multiple of ${spinCount} and distributed evenly across spins.`,
    };
    el.wizStrokeDistNote.textContent = hints[val] || "";
  }

  // =========================================================================
  // WIZARD — ACTION HANDLERS
  // =========================================================================

  function wizSelectPairing(val) {
    wiz.pairing = val;

    // If current game label not valid for new pairing, reset it
    const valid = filteredGameLabels();
    if (!valid.find(gl => gl.label === wiz.selectedLabel)) {
      const first = valid[0];
      if (first) {
        wiz.selectedLabel     = first.label;
        wiz.selectedFormat    = first.dbFormat;
        wiz.selectedBasis     = (gameFormatConfig[first.dbFormat] || gameFormatConfig.StrokePlay).basis;
        wiz.compLock          = first.compLock    || null;
        wiz.scoringSystem     = first.scoringSystem  || null;
        wiz.scoringSystemLock = first.scoringSystemLock || false;
        wiz.bbCount           = first.bbCount        || null;
        wiz.bbCountLock       = first.bbCountLock    || false;
      }
    }

    // Reset points strategy if it's no longer valid for new pairing
    if (wiz.pointsStrategy) {
      const validStrategies = filteredPointsStrategies();
      if (!validStrategies.find(ps => ps.strategy === wiz.pointsStrategy)) {
        wiz.pointsStrategy = null;
        wiz.pointsConfig   = null;
      }
    }

    // Re-render Step 1 in place
    wizRenderStep1();
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectGame(label) {
    const game = GAME_LABELS.find(g => g.label === label);
    if (!game) return;
    wiz.selectedLabel     = game.label;
    wiz.selectedFormat    = game.dbFormat;
    wiz.selectedBasis     = game.basis || (gameFormatConfig[game.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock          = game.compLock    || null;
    wiz.scoringSystem     = game.scoringSystem  || null;
    wiz.scoringSystemLock = game.scoringSystemLock || false;
    wiz.bbCount           = game.bbCount        || null;
    wiz.bbCountLock       = game.bbCountLock    || false;

    // COD enforcement
    if (label === "C-O-D") {
      const holesVal = String(state.game?.dbGames_Holes || "All 18");
      wiz.segments = holesVal === "All 18" ? "6" : "3";
      wiz.rotation = "COD";
    }

    // Reset points strategy if basis changed away from Points
    if (wiz.selectedBasis !== "Points") {
      wiz.pointsStrategy = null;
      wiz.pointsConfig   = null;
    }

    const hintEl = document.getElementById("gsWizGameHint");
    if (hintEl) hintEl.textContent = GAME_HINTS[label] || "";

    if (el.wizCarousel) {
      el.wizCarousel.querySelectorAll(".wizGameCard").forEach(c =>
        c.classList.toggle("selected", c.dataset.label === label)
      );
    }

    // Re-render segments/rotation if visible
    if (wiz.pairing === "PairPair") {
      if (el.wizSegChips) wizRenderStep1();
    }

    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectSegments(val) {
    wiz.segments = val;
    if (el.wizSegChips) el.wizSegChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizRenderRotChips();
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectRotation(val) {
    wiz.rotation = val;
    if (el.wizRotChips) el.wizRotChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizUpdateRotNote();
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectMethod(val) {
    wiz.scoringMethod = val;
    if (el.wizMethodChips) el.wizMethodChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectSystem(val) {
    wiz.scoringSystemVal = val;
    const sysSel = document.getElementById("gsWizSystemList");
    if (sysSel && !sysSel.disabled) sysSel.value = val;
    if (el.wizGroupBB)       show(el.wizGroupBB,       val === "BestBall");
    if (el.wizGroupHoleDecl) {
      show(el.wizGroupHoleDecl, val === "DeclareHole");
      if (val === "DeclareHole") wizRenderHoleDeclGrid();
    }
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectBB(val) {
    wiz.bestBall = val;
    if (el.wizBBChips) el.wizBBChips.querySelectorAll(".wizChip:not(.locked):not(.disabled)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizRenderHoleDeclGrid() {
    if (!el.wizHoleDeclGrid) return;
    el.wizHoleDeclGrid.innerHTML = "";
    const g = state.game || {};
    const holesVal = String(g.dbGames_Holes || "All 18");
    let hStart = 1, hEnd = 18;
    if (holesVal === "F9") { hStart = 1;  hEnd = 9;  }
    if (holesVal === "B9") { hStart = 10; hEnd = 18; }
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
      cell.appendChild(lbl);
      cell.appendChild(sel);
      el.wizHoleDeclGrid.appendChild(cell);
    });
  }

  function wizSetAllHoles(val) {
    wiz.holeDecls.forEach(r => r.count = val);
    wizRenderHoleDeclGrid();
  }

  function wizSelectHCMethod(val) {
    wiz.hcMethod = val;
    if (el.wizHCMethodChips) el.wizHCMethodChips.querySelectorAll(".wizChip:not(.locked):not(.disabled)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectAllowance(val) {
    wiz.allowance = val;
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectStrokeDist(val) {
    wiz.strokeDistribution = val;
    if (el.wizStrokeDistChips) el.wizStrokeDistChips.querySelectorAll(".wizChip:not(.locked)").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizSetStrokeDistHint(val);
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizSelectEffectivity(val) {
    wiz.hcEffectivity = val;
    if (el.wizEffDateWrap) show(el.wizEffDateWrap, val === "Date");
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  function wizOnEffDateChange(val) {
    wiz.hcEffectivityDate = val || null;
    setDirty(true); wizUpdateSummary(); wizCheckComplete();
  }

  // =========================================================================
  // WIZARD — SUMMARY
  // =========================================================================

  function wizUpdateSummary() {
    const s = el.wizSummary;
    if (!s) return;
    function sv(el, val, empty) {
      if (!el) return;
      const isEmpty = !val;
      el.textContent = isEmpty ? "—" : val;
      el.classList.toggle("empty",  isEmpty);
      el.classList.toggle("forced", !isEmpty && empty === false);
    }
    sv(s.label,          wiz.selectedLabel,     true);
    sv(s.format,         wiz.selectedFormat,    true);
    sv(s.competition,    wiz.pairing,           true);
    sv(s.segments,       wiz.pairing === "PairPair" && wiz.segments ? wiz.segments + "'s" : null, true);
    sv(s.rotation,       wiz.pairing === "PairPair" ? wiz.rotation : null, true);
    sv(s.basis,          wiz.selectedBasis,     false);
    sv(s.method,         wiz.scoringMethod,     true);
    sv(s.system,         wiz.scoringSystemVal ? (WIZ_SYSTEMS[wiz.scoringSystemVal]?.label || wiz.scoringSystemVal) : null, true);
    sv(s.bb,             wiz.scoringSystemVal === "BestBall" ? wiz.bestBall : null, true);
    const psLabel = wiz.pointsStrategy ? (POINTS_STRATEGIES.find(p => p.strategy === wiz.pointsStrategy)?.label || wiz.pointsStrategy) : null;
    sv(s.pointsStrategy, wiz.selectedBasis === "Points" ? psLabel : null, true);
    sv(s.hcmethod,       wiz.hcMethod,          true);
    sv(s.allowance,      wiz.allowance ? wiz.allowance + "%" : null, true);
    sv(s.strokedist,     wiz.strokeDistribution, true);
    sv(s.hceff,          wiz.hcEffectivity,     true);
  }

  // =========================================================================
  // WIZARD — COMPLETION CHECK
  // =========================================================================

  function wizCheckComplete() {
    if (!el.wizBtnNext) return;
    let ok = false;
    switch (state.wizStep) {
      case 1:
        ok = !!(wiz.pairing && wiz.selectedLabel);
        // PairPair also needs segments and rotation
        if (ok && wiz.pairing === "PairPair") {
          ok = !!(wiz.segments && wiz.rotation !== null);
        }
        break;
      case 2: {
        const bbOk    = wiz.scoringSystemVal !== "BestBall"    || !!wiz.bestBall;
        const hdOk    = wiz.scoringSystemVal !== "DeclareHole" || wiz.holeDecls.length > 0;
        const ptsOk   = wiz.selectedBasis !== "Points"         || !!wiz.pointsStrategy;
        ok = !!(wiz.scoringMethod && wiz.scoringSystemVal && bbOk && hdOk && ptsOk);
        break;
      }
      case 3: {
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
    wizRenderStep(state.wizStep + 1);
  }

  function wizGoBack() {
    if (state.wizStep > 1) wizRenderStep(state.wizStep - 1);
  }

  function wizGoToStep(n) {
    if (n >= 1 && n <= 3) wizRenderStep(n);
  }

  // =========================================================================
  // WIZARD — CAROUSEL DRAG SCROLL
  // =========================================================================

  function wizDragScroll(carousel) {
    let isDown = false, startX = 0, scrollLeft = 0;
    carousel.addEventListener("mousedown",  e => { isDown = true; startX = e.pageX - carousel.offsetLeft; scrollLeft = carousel.scrollLeft; });
    carousel.addEventListener("mouseleave", () => { isDown = false; });
    carousel.addEventListener("mouseup",    () => { isDown = false; });
    carousel.addEventListener("mousemove",  e => {
      if (!isDown) return;
      e.preventDefault();
      carousel.scrollLeft = scrollLeft - (e.pageX - carousel.offsetLeft - startX) * 1.2;
    });
  }

  function wizScrollCarousel(dir) {
    if (el.wizCarousel) el.wizCarousel.scrollBy({ left: dir * 240, behavior: "smooth" });
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  function wireEvents() {
    if (el.wizBtnBack) el.wizBtnBack.addEventListener("click", wizGoBack);
    if (el.wizBtnNext) el.wizBtnNext.addEventListener("click", wizGoNext);

    el.wizDots.forEach((dot, i) => {
      if (!dot) return;
      dot.addEventListener("click", () => wizGoToStep(i + 1));
    });

    const carouselLeft  = document.getElementById("gsWizCarouselLeft");
    const carouselRight = document.getElementById("gsWizCarouselRight");
    if (carouselLeft)  carouselLeft.addEventListener("click",  () => wizScrollCarousel(-1));
    if (carouselRight) carouselRight.addEventListener("click", () => wizScrollCarousel(1));

    window.gsWiz = {
      selectPairing:         wizSelectPairing,
      selectGame:            wizSelectGame,
      selectSegments:        wizSelectSegments,
      selectRotation:        wizSelectRotation,
      selectMethod:          wizSelectMethod,
      selectSystem:          wizSelectSystem,
      selectBB:              wizSelectBB,
      setAllHoles:           wizSetAllHoles,
      selectPointsStrategy:  wizSelectPointsStrategy,
      onPointsInputChange:   onPointsInputChange,
      selectHCMethod:        wizSelectHCMethod,
      selectAllowance:       wizSelectAllowance,
      selectStrokeDist:      wizSelectStrokeDist,
      selectEffectivity:     wizSelectEffectivity,
      onEffDateChange:       wizOnEffDateChange,
      scrollCarousel:        wizScrollCarousel,
      goToStep:              wizGoToStep,
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
    state.ggid             = init.ggid ?? init.GGID ?? null;
    state.game             = init.game || null;
    state.players          = Array.isArray(init.players)          ? init.players          : [];
    state.roster           = Array.isArray(init.roster)           ? init.roster           : state.players;
    state.coursePars       = Array.isArray(init.coursePars)       ? init.coursePars       : [];
    state.courseParsByHole = buildCourseParsByHole(state.coursePars);
    state.recallTemplates  = Array.isArray(init.recallTemplates)  ? init.recallTemplates  : [];
    return true;
  }

  function initialize() {
    if (!loadContext()) return;
    wizHydrateFromGame();
    applyChrome();
    show(el.wizContainer, true);
    show(document.getElementById("gsWizProgress"), true);
    wizRenderStep(1);
    wireEvents();
    setDirty(false);
    setStatus("Ready", "info");
  }

  document.addEventListener("DOMContentLoaded", initialize);

})();
