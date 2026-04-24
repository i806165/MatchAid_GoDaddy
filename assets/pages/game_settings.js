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
    { label: "Standard stroke allocation",              value: "Standard"         },
    { label: "Strokes trimmed and distributed to spins",        value: "Balanced"         },
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

  const GAME_LABELS = [
    // ── Stroke Play family ──
    { label: "Stroke Play",   dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Best Ball",     dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Declare",       dbFormat: "StrokePlay", basis: "Strokes", compLock: null,       scoringSystem: "DeclareManual", scoringSystemLock: true,  bbCount: null, bbCountLock: true  },
    // ── Match Play family ──
    { label: "C-O-D",         dbFormat: "MatchPlay",  basis: "Holes",   compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Four Ball",     dbFormat: "MatchPlay",  basis: "Holes",   compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: false, bbCount: "2",  bbCountLock: false },
    { label: "Medal Match",   dbFormat: "MatchPlay",  basis: "Strokes", compLock: "PairPair", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    { label: "Points Match",  dbFormat: "MatchPlay",  basis: "Points",  compLock: "PairPair", scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    // ── Points ──
    { label: "Stableford",    dbFormat: "Stableford", basis: "Points",  compLock: null,       scoringSystem: null,            scoringSystemLock: false, bbCount: null, bbCountLock: false },
    // ── Skins ──
    { label: "Skins",         dbFormat: "Skins",      basis: "Skins",   compLock: "PairField", scoringSystem: "BestBall",     scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Skins Match",   dbFormat: "Skins",      basis: "Skins",   compLock: "PairPair",  scoringSystem: "BestBall",     scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    // ── Team formats ──
    { label: "Alt-Shot",      dbFormat: "AltShot",    basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Chapman",       dbFormat: "Chapman",    basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Scramble",      dbFormat: "Scramble",   basis: "Strokes", compLock: "PairPair", scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
    { label: "Shamble",       dbFormat: "Shamble",    basis: "Strokes", compLock: null,       scoringSystem: "BestBall",      scoringSystemLock: true,  bbCount: "1",  bbCountLock: true  },
  ];

  const GAME_HINTS = {
    "Stroke Play":   "Every player counts their own score on every hole.",
    "Best Ball":     "Each team counts their lowest N scores. Fixed count on every hole or vary count per hole.",
    "Declare":       "Players choose which scores they wish to count on each hole. N scores must be declared by games end.",
    "Four Ball":     "1 or 2 player teams compete head to head. One best ball from each side wins hole.",
    "C-O-D":         "Foursomes organized into twosomes, rotating every three/six holes (spins) Carts, Opposites, Drivers.",
    "Medal Match":   "Two sides compete head to head on total net strokes. Lower cumulative score wins the match.",
    "Points Match":  "Two sides compete head to head on points. Higher cumulative points wins the match.",
    "Stableford":    "Points awarded per hole relative to par.",
    "Skins":         "Players compete for skins against the field. Ties carry forward.",
    "Skins Match":   "Two teams compete against each other for skins. Ties carry forward.",
    "Alt-Shot":      "Partners alternate shots on the same ball throughout the round. One score per team per hole.",
    "Chapman":       "Each player hits a tee shot, then switches — best second shot chosen, alternate shot to finish.",
    "Scramble":      "All players hit every shot from the best lie. One team score per hole.",
    "Shamble":       "All players hit tee shots, best drive chosen — each player finishes their own ball from there.",
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
    ggid:            null,
    game:            null,
    players:         [],
    roster:          [],
    coursePars:      [],
    courseParsByHole: null,
    recallTemplates: [],
    dirty:           false,
    busy:            false,
    wizStep:         1,
  };

  // Wizard step state — source of truth for save
  const wiz = {
    // Step 1
    selectedLabel:      null,
    selectedFormat:     null,
    selectedBasis:      null,
    compLock:           null,
    scoringSystem:      null,
    scoringSystemLock:  false,
    bbCount:            null,
    bbCountLock:        false,
    // Step 2
    competition:        null,
    segments:           null,
    rotation:           null,
    // Step 3
    scoringMethod:      null,
    scoringSystemVal:   null,
    bestBall:           null,
    holeDecls:          [],
    // Step 4
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
    // Wizard container + steps
    wizContainer: document.getElementById("gsWizardContainer"),
    wizSteps: {
      s1: document.getElementById("gsWizStep1"),
      s2: document.getElementById("gsWizStep2"),
      s3: document.getElementById("gsWizStep3"),
      s4: document.getElementById("gsWizStep4"),
    },
    wizDots: [
      document.getElementById("gsWizDot1"),
      document.getElementById("gsWizDot2"),
      document.getElementById("gsWizDot3"),
      document.getElementById("gsWizDot4"),
    ],

    // Step 1
    wizCarousel: document.getElementById("gsWizCarousel"),

    // Step 2
    wizCompChips: document.getElementById("gsWizCompChips"),
    wizSegChips:  document.getElementById("gsWizSegChips"),
    wizRotChips:  document.getElementById("gsWizRotChips"),
    wizRotNote:   document.getElementById("gsWizRotNote"),

    // Step 3 (wizSystemList resolved fresh each render)
    wizBasisVal:       document.getElementById("gsWizBasisVal"),
    wizMethodChips:    document.getElementById("gsWizMethodChips"),
    wizGroupBB:        document.getElementById("gsWizGroupBB"),
    wizBBChips:        document.getElementById("gsWizBBChips"),
    wizGroupHoleDecl:  document.getElementById("gsWizGroupHoleDecl"),
    wizHoleDeclGrid:   document.getElementById("gsWizHoleDeclGrid"),
    wizGroupStableford:document.getElementById("gsWizGroupStableford"),
    wizStablefordGrid: document.getElementById("gsWizStablefordGrid"),

    // Step 4
    wizHCMethodChips:  document.getElementById("gsWizHCMethodChips"),
    wizAllowanceSelect:document.getElementById("gsWizAllowanceSelect"),
    wizStrokeDistChips:document.getElementById("gsWizStrokeDistChips"),
    wizStrokeDistNote: document.getElementById("gsWizStrokeDistNote"),
    wizEffSelect:      document.getElementById("gsWizEffSelect"),
    wizEffDateWrap:    document.getElementById("gsWizEffDateWrap"),
    wizEffDateInput:   document.getElementById("gsWizEffDateInput"),

    // Summary panel
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
    const btn = document.getElementById("chromeBtnRight");
    if (btn) btn.disabled = state.busy;
  }

  function setDirty(on) {
    state.dirty = !!on;
    setStatus(on ? "Unsaved changes." : "", on ? "warn" : "");
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
    if (!arr.length) return stablefordTemplate.map(r => ({ reltoPar: r.reltoPar, points: r.defaultPoints }));
    return arr.map((r, i) => ({
      reltoPar: Number(r.reltoPar ?? stablefordTemplate[i]?.reltoPar ?? 0),
      points:   Number(r.points   ?? r.defaultPoints ?? stablefordTemplate[i]?.defaultPoints ?? 0),
    }));
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
        left:  { show: true, label: "Cancel", onClick: onCancel },
        right: { show: true, label: "Save",   onClick: doSave  },
      });
    }
    if (chrome && typeof chrome.setBottomNav === "function") {
      chrome.setBottomNav({
        visible: ["admin", "edit", "settings", "roster", "pairings", "teetimes", "summary"],
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

    const stableford = (wiz.selectedBasis === "Points")
      ? normalizeStableford(g.dbGames_StablefordPoints)
      : (Array.isArray(g.dbGames_StablefordPoints) ? g.dbGames_StablefordPoints : []);

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
      dbGames_Competition:        wiz.competition            || "PairField",
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
      dbGames_StablefordPoints:   stableford,
      dbGames_HoleDeclaration:    holeDecls,
      dbGames_CustomScores:       g.dbGames_CustomScores     || null,
    };
  }

  async function doSave() {
    if (state.busy) return;
    if (!state.dirty) { window.location.assign(returnToUrl); return; }
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
      window.location.assign(returnToUrl);
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

    // Step 1 — match saved format/label to a GAME_LABELS entry
    const savedFmt   = String(g.dbGames_GameFormat  || "StrokePlay");
    const savedLabel = String(g.dbGames_GameLabel   || "");
    const match = GAME_LABELS.find(gl => gl.label === savedLabel && gl.dbFormat === savedFmt)
               || GAME_LABELS.find(gl => gl.dbFormat === savedFmt)
               || GAME_LABELS[0];
    wiz.selectedLabel     = match.label;
    wiz.selectedFormat    = match.dbFormat;
    wiz.selectedBasis     = (gameFormatConfig[match.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock          = match.compLock;
    wiz.scoringSystem     = match.scoringSystem  || null;
    wiz.scoringSystemLock = match.scoringSystemLock || false;
    wiz.bbCount           = match.bbCount        || null;
    wiz.bbCountLock       = match.bbCountLock    || false;

    // Step 2
    wiz.competition = String(g.dbGames_Competition    || "PairField");
    wiz.segments    = String(g.dbGames_Segments       || "9");
    wiz.rotation    = String(g.dbGames_RotationMethod || "None");

    // Step 3
    wiz.scoringMethod   = String(g.dbGames_ScoringMethod  || "NET");
    wiz.scoringSystemVal= String(g.dbGames_ScoringSystem  || match.scoringSystem || "BestBall");
    wiz.bestBall        = String(g.dbGames_BestBall        ?? "2");
    wiz.holeDecls       = [];

    // Step 4
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

    // Progress dots — active only on current step
    el.wizDots.forEach((dot, i) => {
      if (!dot) return;
      const n = i + 1;
      const stepEl = dot.parentElement;
      stepEl.classList.toggle("active", n === step);
      stepEl.classList.remove("done", "upcoming");
      dot.textContent = "";
    });

    // Show only the current step panel
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
    if (!el.wizCarousel) return;
    el.wizCarousel.innerHTML = "";
    GAME_LABELS.forEach(game => {
      const card = document.createElement("div");
      card.className = "wizGameCard" + (wiz.selectedLabel === game.label ? " selected" : "");
      card.dataset.label = game.label;
      const cfg = gameFormatConfig[game.dbFormat] || gameFormatConfig.StrokePlay;
      card.innerHTML = `<div class="wizGameCard__name">${esc(game.label)}</div><div class="wizGameCard__fmt">${esc(cfg.basis)}</div>`;
      card.addEventListener("click", () => wizSelectGame(game.label));
      el.wizCarousel.appendChild(card);
    });
    wizDragScroll(el.wizCarousel);
    if (wiz.selectedLabel) {
      const sel = el.wizCarousel.querySelector(`[data-label="${CSS.escape(wiz.selectedLabel)}"]`);
      if (sel) sel.scrollIntoView({ block: "nearest", inline: "center" });
    }
    const hintEl = document.getElementById("gsWizGameHint");
    if (hintEl) hintEl.textContent = GAME_HINTS[wiz.selectedLabel] || "";
  }

function wizSelectGame(label) {
    const game = GAME_LABELS.find(g => g.label === label);
    if (!game) return;
    wiz.selectedLabel     = game.label;
    wiz.selectedFormat    = game.dbFormat;
    wiz.selectedBasis     = (gameFormatConfig[game.dbFormat] || gameFormatConfig.StrokePlay).basis;
    wiz.compLock          = game.compLock;
    wiz.scoringSystem     = game.scoringSystem  || null;
    wiz.scoringSystemLock = game.scoringSystemLock || false;
    wiz.bbCount           = game.bbCount        || null;
    wiz.bbCountLock       = game.bbCountLock    || false;

    // ── NEW: COD enforcement ──────────────────────────────────────────────────
    if (label === "C-O-D") {
        const holesVal = String(state.game?.dbGames_Holes || "All 18");
        wiz.segments = holesVal === "All 18" ? "6" : "3";
        wiz.rotation = "COD";
    }
    // ─────────────────────────────────────────────────────────────────────────

    const hintEl = document.getElementById("gsWizGameHint");
    if (hintEl) hintEl.textContent = GAME_HINTS[label] || "";

    if (el.wizCarousel) {
        el.wizCarousel.querySelectorAll(".wizGameCard").forEach(c =>
            c.classList.toggle("selected", c.dataset.label === label)
        );
    }
    setDirty(true);
    wizUpdateSummary();
    wizCheckComplete();
}

  // ---- Step 2: Structure ----
  function wizRenderStep2() {
    const lock = wiz.compLock;

    // Competition chips — hide if locked (value still set on wiz.competition)
    if (el.wizCompChips) {
      el.wizCompChips.style.display = lock ? "none" : "";
      if (lock) {
        wiz.competition = lock;
      } else {
        el.wizCompChips.querySelectorAll(".wizChip").forEach(b => {
          b.classList.toggle("selected", b.dataset.val === wiz.competition);
          b.classList.remove("locked", "disabled");
        });
      }
    }

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

        // ── NEW: lock segments for COD ───────────────────────────────────────────
        const isCOD = (wiz.selectedLabel === "C-O-D");
        if (isCOD) wiz.segments = defSeg; // enforce regardless of stored value
        // ────────────────────────────────────────────────────────────────────────

        opts.forEach(opt => {
            const b = document.createElement("button");
            b.dataset.val = opt.value;
            b.textContent = opt.label;

            // ── NEW: locked appearance for COD ──────────────────────────────────
            if (isCOD && opt.value === defSeg) {
                b.className = "wizChip locked";
            } else if (isCOD) {
                b.className = "wizChip disabled";
            } else {
                b.className = "wizChip" + (wiz.segments === opt.value ? " selected" : "");
                b.addEventListener("click", () => wizSelectSegments(opt.value));
            }
            // ────────────────────────────────────────────────────────────────────

            el.wizSegChips.appendChild(b);
        });
    }

    // Rotation chips
    wizRenderRotChips();
  }

  function wizRenderRotChips() {
      if (!el.wizRotChips) return;
      const opts = buildRotationOptions(wiz.segments, wiz.competition);
      el.wizRotChips.innerHTML = "";
      const validVals = opts.map(o => o.value);
      if (!validVals.includes(wiz.rotation)) wiz.rotation = validVals[0] || "None";

      // ── NEW: lock rotation for COD ───────────────────────────────────────────
      const isCOD = (wiz.selectedLabel === "C-O-D");
      if (isCOD) wiz.rotation = "COD";
      // ────────────────────────────────────────────────────────────────────────

      opts.forEach(opt => {
          const b = document.createElement("button");
          b.dataset.val = opt.value;
          b.textContent = opt.label;

          // ── NEW: locked/disabled appearance for COD ──────────────────────────
          if (isCOD && opt.value === "COD") {
              b.className = "wizChip locked";
          } else if (isCOD) {
              b.className = "wizChip disabled";
          } else {
              b.className = "wizChip" + (wiz.rotation === opt.value ? " selected" : "");
              b.addEventListener("click", () => wizSelectRotation(opt.value));
          }
          // ────────────────────────────────────────────────────────────────────

          el.wizRotChips.appendChild(b);
      });

      wizUpdateRotNote();
  }

  function wizUpdateRotNote() {
    if (!el.wizRotNote) return;
    const seg = wiz.segments; const rot = wiz.rotation; const comp = wiz.competition;
    if (comp === "PairField") { el.wizRotNote.textContent = "Rotation not available for Pair vs. the Field."; return; }
    if (seg === "9") { el.wizRotNote.textContent = rot !== "None" ? "Partners rotate between the two 9-hole segments." : ""; return; }
    if (seg === "6" || seg === "3") {
      el.wizRotNote.textContent = rot === "COD" ? "COD rotation — partners change each segment." : "Select COD to rotate partners.";
    }
  }

  function wizSelectCompetition(val) {
    wiz.competition = val;
    if (el.wizCompChips) el.wizCompChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === val));
    wizRenderRotChips();
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

  // ---- Step 3: Scoring ----
  function wizRenderStep3() {
    const fmt = wiz.selectedFormat || "StrokePlay";

    // Basis inline
    if (el.wizBasisVal) el.wizBasisVal.textContent = wiz.selectedBasis || "Strokes";

    // Stableford preview
    if (el.wizGroupStableford) {
      const showSF = (wiz.selectedBasis === "Points");
      show(el.wizGroupStableford, showSF);
      if (showSF && el.wizStablefordGrid) {
        const relLabels = { "-3":"−3","-2":"−2","-1":"−1","0":"E","1":"+1","2":"+2" };
        el.wizStablefordGrid.innerHTML = "";
        stablefordTemplate.forEach((row, i) => {
          const cell = document.createElement("div");
          cell.className = "wizStableford__cell";
          cell.innerHTML = `<div class="wizStableford__rel">${relLabels[String(row.reltoPar)] || row.reltoPar}</div><div class="wizStableford__pts">${row.defaultPoints}</div><div class="wizStableford__name">${["Albatross","Eagle","Birdie","Par","Bogey","Dbl Bogey"][i]||""}</div>`;
          el.wizStablefordGrid.appendChild(cell);
        });
      }
    }

    // Method chips
    if (el.wizMethodChips) {
      el.wizMethodChips.querySelectorAll(".wizChip").forEach(b => b.classList.toggle("selected", b.dataset.val === wiz.scoringMethod));
    }

    // System dropdown — resolved fresh to guarantee <select> reference
    const sysSel = document.getElementById("gsWizSystemList");
    if (sysSel) {
      const locked = wiz.scoringSystemLock;
      const preset = wiz.scoringSystem;
      const teamFmts = ["Scramble", "Shamble", "AltShot", "Chapman"];
      const avail = teamFmts.includes(fmt) ? ["BestBall"] : ["AllScores", "BestBall", "DeclareHole", "DeclareManual"];
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

  // ---- Step 4: Handicaps ----
  function wizRenderStep4() {
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
    sv(s.label,       wiz.selectedLabel,     true);
    sv(s.format,      wiz.selectedFormat,    true);
    sv(s.competition, wiz.competition,       true);
    sv(s.segments,    wiz.segments ? wiz.segments + "'s" : null, true);
    sv(s.rotation,    wiz.rotation,          true);
    sv(s.basis,       wiz.selectedBasis,     false);
    sv(s.method,      wiz.scoringMethod,     true);
    sv(s.system,      wiz.scoringSystemVal ? (WIZ_SYSTEMS[wiz.scoringSystemVal]?.label || wiz.scoringSystemVal) : null, true);
    sv(s.bb,          wiz.scoringSystemVal === "BestBall" ? wiz.bestBall : null, true);
    sv(s.hcmethod,    wiz.hcMethod,          true);
    sv(s.allowance,   wiz.allowance ? wiz.allowance + "%" : null, true);
    sv(s.strokedist,  wiz.strokeDistribution, true);
    sv(s.hceff,       wiz.hcEffectivity,     true);
  }

  // =========================================================================
  // WIZARD — COMPLETION CHECK
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
      doSave();
    } else {
      wizRenderStep(state.wizStep + 1);
    }
  }

  function wizGoBack() {
    if (state.wizStep > 1) wizRenderStep(state.wizStep - 1);
  }

  function wizGoToStep(n) {
    if (n >= 1 && n <= 4) wizRenderStep(n);
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
    state.ggid           = init.ggid ?? init.GGID ?? null;
    state.game           = init.game || null;
    state.players        = Array.isArray(init.players)         ? init.players         : [];
    state.roster         = Array.isArray(init.roster)          ? init.roster          : state.players;
    state.coursePars     = Array.isArray(init.coursePars)      ? init.coursePars      : [];
    state.courseParsByHole = buildCourseParsByHole(state.coursePars);
    state.recallTemplates  = Array.isArray(init.recallTemplates) ? init.recallTemplates : [];
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
