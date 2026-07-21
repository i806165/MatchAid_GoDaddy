/* /assets/js/ma_SharedBusLogic.js
 *
 * Cross-page BUSINESS logic shared across MatchAid pages — distinct in
 * purpose from ma_shared.js, which is pure plumbing/chrome (MA.postJson,
 * MA.setStatus, MA.chrome, MA.ui, the MA namespace scaffold itself) and
 * has no domain rules of its own. This file is the intended home for
 * cross-page rules that would otherwise get copy-pasted per caller.
 *
 * Load this AFTER ma_shared.js on any page that needs it — currently:
 * game_players (gameplayers.php), event_roster (eventroster.php),
 * game_pairings (gamepairings.php).
 *
 * Round-Level Dimension Activation — isDimensionActive()
 * -------------------------------------------------------
 * Mirrors ServiceDbEvents::isDimensionActive() in service_dbEvents.php
 * exactly — same signature, same order of checks. Kept as a deliberate
 * duplicate across PHP/JS (project decision) rather than a single shared
 * implementation, since the hierarchy itself is only a few lines and
 * duplicating it here is lower-risk than the two-field ambiguity this
 * function replaces (see game_pairings.js's old teamsActive() and its
 * mirror in workflow_ReconcilePairingBoundaries.php — two independent
 * copies of the same inference that had to be kept in sync by hand).
 *
 * Deliberately excludes Pairing — no legitimate round-level "off" state
 * exists for Pairing (no dbGames_PairingMode column, none planned).
 * pairingsLockedByEvent() in game_pairings.js remains the entire answer
 * for Pairing; this function is never called for it.
 *
 * Future additions to this file: cross-page date-normalization helpers
 * (service_dbGames.php's normalizeDateYMD() and service_dbEvents.php's
 * own copy of the identical function are flagged as a good future
 * candidate — not part of this pass).
 */
(function () {
  "use strict";

  const MA = window.MA || {};
  window.MA = MA;

  const DIMENSION_FIELDS = {
    team:   { event: "dbEvents_TeamMode",   round: "dbGames_TeamMode"   },
    flight: { event: "dbEvents_FlightMode", round: "dbGames_FlightMode" },
  };

  /**
   * isDimensionActive(dimension, game, event)
   *
   * Strict two-level hierarchy, event first, round second, off if
   * neither claims it:
   *   1. If game.dbGames_EID is set AND event.dbEvents_{Dim}Mode is
   *      "fixed" -> ACTIVE, event-authoritative. Stop.
   *   2. Else if game.dbGames_{Dim}Mode is "active" -> ACTIVE,
   *      round-authoritative. Stop.
   *   3. Else -> INACTIVE.
   *
   * @param  {string}      dimension  "team" | "flight"
   * @param  {object}      game       object carrying dbGames_EID and
   *                                   dbGames_{Dim}Mode (e.g. state.game)
   * @param  {object|null} event      object carrying dbEvents_{Dim}Mode,
   *                                   or null/undefined. Many callers
   *                                   already have event fields merged
   *                                   directly onto `game` (full-row
   *                                   hydration via ServiceContextGame) —
   *                                   in that case pass the same object
   *                                   for both params.
   * @return {boolean}
   */
  MA.isDimensionActive = function (dimension, game, event) {
    const dim = String(dimension || "").toLowerCase().trim();
    const fields = DIMENSION_FIELDS[dim];
    if (!fields || !game) return false;

    const eid = parseInt(game.dbGames_EID, 10) || 0;

    // 1) Event-authoritative
    if (eid > 0 && event) {
      const eventMode = String(event[fields.event] || "").trim();
      if (eventMode === "fixed") return true;
    }

    // 2) Round-authoritative
    const roundMode = String(game[fields.round] || "").trim();
    if (roundMode === "active") return true;

    // 3) Neither claims it
    return false;
  };

  /**
   * describeGameFormat(game, opts)
   * ---------------------------------------------------------------------
   * Single source of truth for turning a game's raw dbGames_* config
   * fields into the plain-English format/scoring description shown on
   * printed scorecards (game_scorecards.js's renderGroup(), "Header
   * Line 3" / "Header Line 4") and, condensed, in player-facing email
   * notifications (game_summary.js's tee-sheet email body).
   *
   * Originally lived only in game_scorecards.js's renderGroup(); moved
   * here so both callers describe a game's format identically instead
   * of maintaining two independently-drifting phrasings.
   *
   * Returns everything UNESCAPED (plain text) — callers own HTML
   * escaping at their own render site (game_scorecards.js still calls
   * esc() before inserting into innerHTML; a mailto plain-text body
   * should NOT be escaped). This function does no HTML handling at all.
   *
   * Returns every constituent field individually (not just pre-joined
   * lines) so a future caller can compose its own cut of this
   * information without touching this function.
   *
   * @param {object} game - flat object carrying the dbGames_* fields
   *   (e.g. state.game). Callers whose data is split across a group
   *   header + outer game object (game_scorecards.js's `gh` vs `game`)
   *   should merge before calling: describeGameFormat({ ...game, ...gh }).
   * @param {object} [opts]
   * @param {boolean} [opts.condensed=false] - also populate condensedLine.
   * @return {{
   *   formatLine: string,
   *   hcLabel: string,
   *   allowanceLabel: string,
   *   strokeDistLabel: string,
   *   segmentLabel: string,
   *   scoringSystemLine: string,
   *   detailLine: string,
   *   condensedLine: string
   * }}
   */
  MA.describeGameFormat = function (game, opts) {
    const g = game || {};
    const o = opts || {};

    const gameFormat    = String(g.dbGames_GameFormat || "").trim();
    const scoringBasis  = String(g.dbGames_ScoringBasis || "").trim();
    const scoringMethod = String(g.dbGames_ScoringMethod || "").trim();
    const strokeDist    = String(g.dbGames_StrokeDistribution || "").trim();
    const allowanceRaw  = String(g.dbGames_Allowance || "").trim();
    const hcEff         = String(g.dbGames_HCEffectivity || "").trim();
    const hcDate        = String(g.dbGames_HCEffectivityDate || "").trim();

    // ── Format sentence ────────────────────────────────────────────────
    let formatLine = "";
    if (gameFormat && scoringBasis && scoringMethod) {
      formatLine = `Format: ${gameFormat} based on ${scoringBasis} using ${scoringMethod} scoring`;
    } else if (gameFormat && scoringBasis) {
      formatLine = `Format: ${gameFormat} based on ${scoringBasis}`;
    } else if (gameFormat && scoringMethod) {
      formatLine = `Format: ${gameFormat} using ${scoringMethod} scoring`;
    } else if (gameFormat) {
      formatLine = `Format: ${gameFormat}`;
    }

    const isGrossScoring = scoringMethod.toUpperCase() === "GROSS" || scoringMethod.toUpperCase() === "ADJ GROSS";

    // ── Handicap / allowance / stroke distribution ────────────────────
    let hcLabel = "";
    if (!isGrossScoring) {
      if (hcEff === "Date" && hcDate) hcLabel = `HC Effective as of ${hcDate}`;
      else if (hcEff) hcLabel = `HCP Effective using ${hcEff}`;
    }

    let allowanceLabel = "";
    if (!isGrossScoring && allowanceRaw) {
      allowanceLabel = `Allowance ${allowanceRaw}%`;
    }

    let strokeDistLabel = "";
    if (strokeDist) strokeDistLabel = `Stroke Distribution ${strokeDist}`;

    // ── Segments ────────────────────────────────────────────────────────
    let segmentLabel = "";
    if (String(g.dbGames_RotationMethod || "").trim() !== "None") {
      const seg = String(g.dbGames_Segments || "").trim();
      if (seg) segmentLabel = `${seg}-Hole Segments`;
    }

    const detailLine = [formatLine, hcLabel, allowanceLabel, strokeDistLabel, segmentLabel]
      .filter(Boolean).join(" \u2022 ");

    // ── Scoring system sentence ────────────────────────────────────────
    const sys = String(g.dbGames_ScoringSystem || "").trim();
    let scoringSystemLine = "";

    if (sys === "BestBall") {
      const cnt = String(g.dbGames_BestBallCnt || g.dbGames_BestBall || "").trim();
      scoringSystemLine = cnt
        ? `Scoring System: Best ${cnt} Ball${cnt === "1" ? "" : "s"}`
        : "Scoring System: Best Ball";

    } else if (sys === "DeclareHole") {
      try {
        const raw = g.dbGames_HoleDeclaration;
        const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
        const map = {};
        if (Array.isArray(parsed)) {
          parsed.forEach((r) => { if (r && r.hole != null) map[r.hole] = r.count; });
        } else {
          Object.assign(map, parsed);
        }
        const pairs = [];
        for (let h = 1; h <= 18; h++) {
          const val = map[h] ?? map[String(h)];
          if (val != null && val !== "") pairs.push(`H${h}:${val}`);
        }
        scoringSystemLine = pairs.length
          ? `Scoring System: Declare by Hole (${pairs.join(" \u2022 ")})`
          : "Scoring System: Declare by Hole";
      } catch (e) {
        scoringSystemLine = "Scoring System: Declare by Hole";
      }

    } else if (sys === "DeclarePlayer") {
      const perPlayer = String(g.dbGames_PlayerDeclaration || "1").trim();
      scoringSystemLine = `Scoring System: Declare by Player (${perPlayer}x per player)`;

    } else if (sys === "DeclareManual") {
      scoringSystemLine = "Scoring System: Declare Scores Discretionally";

    } else if (sys === "AllScores") {
      scoringSystemLine = "Scoring System: Use All Scores";

    } else if (sys) {
      scoringSystemLine = `Scoring System: ${sys}`;
    }

    // ── Condensed line — for short/plain-text contexts (email) ────────
    // Deliberately keeps just game format + scoring system (the two
    // pieces that change what a player should expect to do/see) and
    // drops the "Format:"/"Scoring System:" labels plus the handicap/
    // allowance/stroke-distribution detail, which matters for scoring
    // but not for "what game am I showing up to".
    let condensedLine = "";
    if (o.condensed) {
      const shortSys = scoringSystemLine.replace(/^Scoring System:\s*/, "");
      condensedLine = [gameFormat, shortSys].filter(Boolean).join(" \u2022 ");
    }

    return {
      formatLine,
      hcLabel,
      allowanceLabel,
      strokeDistLabel,
      segmentLabel,
      scoringSystemLine,
      detailLine,
      condensedLine
    };
  };

  window.MA = MA;

})();
