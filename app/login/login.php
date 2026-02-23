<?php
// /public_html/app/login/login.php
declare(strict_types=1);

session_start();
require_once __DIR__ . "/../../bootstrap.php";

/**
 * Route table: ONLY place where physical paths live.
 * Keep these as absolute-from-domain-root URLs.
 */
$ROUTES = [
  "home"   => "/",
  "player" => "/app/player_games/player_games.php",
  "admin" => "/app/admin_games/gameslist.php",
];

/**
 * Keys only (NOT paths). Defaults to home.
 * Example:
 *   /app/login/login.php?returnAction=admin&cancelAction=home
 */
$portalLabel = strtoupper(trim((string)($_SESSION["SessionPortal"] ?? "")));

$cancelAction = "home";
if ($portalLabel === "ADMIN PORTAL") {
  $returnAction = "admin";
} elseif ($portalLabel === "PLAYER PORTAL") {
  $returnAction = "player";
} else {
  $returnAction = "home";
}

// Validate action keys to prevent open-redirect behavior
if (!isset($ROUTES[$returnAction])) $returnAction = "home";
if (!isset($ROUTES[$cancelAction])) $cancelAction = "home";

// Optional passthrough params (ONLY if you want them available to HTML)
$mode = isset($_GET["mode"]) ? trim((string)$_GET["mode"]) : "";
$ggid = isset($_GET["ggid"]) ? trim((string)$_GET["ggid"]) : "";

// Boot payload injected into the page for login.html JS to read
$boot = [
  "routes"       => $ROUTES,
  "returnAction" => $returnAction,
  "cancelAction" => $cancelAction,
  "mode"         => $mode,
  "ggid"         => $ggid,
];

header("Content-Type: text/html; charset=utf-8");
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <title>MatchAid • Login</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">

  <style>
            :root {
            /* ---  MatchAid Tokens (Canonical) --- */
            /* Brand */
            --brandPrimary: #07432A;
            --brandSecondary: #3F7652;
            --segmentSelectedBg: #CDB278;
            --onBrandText: #FFFFFF;

            /* Surfaces */
            --appBg: #FFFFFF;
            --surface: #FFFFFF;
            --surfaceRaised: #FFFFFF;

            /* Inks (3-inks rule) */
            --onSurfaceText: #111111;
            --onSurfaceMutedText: rgba(17, 17, 17, .62);
            --onSurfaceSoftText: rgba(17, 17, 17, .45);

            /* Borders / dividers */
            --border: rgba(0, 0, 0, .12);
            --divider: rgba(0, 0, 0, .10);
            --controlBorder: rgba(0, 0, 0, .15);

            /* Status */
            --danger: #c62828;
            --warn: #f6d365;
            --success: #0aa45c;
            --statusSuccessBg: var(--success);
            --statusSuccessText: #ffffff;
            --statusWarnBg: var(--warn);
            --statusWarnText: #111111;
            --statusErrorBg: var(--danger);
            --statusErrorText: #ffffff;
            --statusInfoBg: var(--brandSecondary);
            --statusInfoText: #ffffff;

            /* Layout */
            --pagePad: 12px;
            --cardPad: 12px;
            --cardRadius: 14px;
            --rowPadX: 12px;
            --rowPadTop: 10px;
            /* padding ABOVE drives rhythm */
            --rowPadBottom: 8px;

            /* Controls */
            --controlsBg: color-mix(in srgb, var(--brandSecondary) 6%, var(--appBg));
            --controlH: 36px;
            --controlRadius: 14px;
            --chipH: 36px;
            --chipRadius: 14px;

            /* Footer */
            --footerBarH: 30px;
            --footerTopLine: rgba(0, 0, 0, .22);
            --footerShadow: 0 -8px 18px rgba(0, 0, 0, .10);

            /* Typography (Montserrat) */
            --fs-title: 18px;
            --fs-subtitle: 15px;
            --fs-section: 16px;
            --fs-body: 13px;
            --fs-label: 13px;
            --fs-input: 13px;
            --fs-caption: 11px;
            --fs-micro: 10px;

            --fw-regular: 400;
            --fw-medium: 500;
            --fw-semibold: 600;

            --lh-tight: 1.15;
            --lh-normal: 1.35;

            /* Z scale */
            --zBase: 0;
            --zHeader: 100;
            --zControls: 105;
            --zFooter: 110;

            /* Aliases */
            --bodyPad: var(--pagePad);
            --footerHeight: var(--footerBarH);
            --focusRing: rgba(0, 120, 212, 0.35);
            --focusRingW: 3px;
        }

        @media (max-width: 520px) {
            :root {
                --pagePad: 10px;
                --controlH: 34px;
                --chipH: 34px;
                --footerBarH: 28px;

                --fs-title: 17px;
                --fs-subtitle: 14px;
                --fs-section: 15px;
                --fs-body: 13px;
                --fs-label: 13px;
                --fs-input: 13px;
                --fs-caption: 11px;
                --fs-micro: 10px;
            }
        }

        html,
        body {
            height: 100%;
        }

        body {
            margin: 0;
            font-family: Montserrat, Arial, sans-serif;
            background: var(--appBg);
            color: var(--onSurfaceText);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Text roles */
        .text--title {
            font-size: var(--fs-title);
            line-height: var(--lh-tight);
            font-weight: var(--fw-semibold);
        }

        .text--subtitle {
            font-size: var(--fs-subtitle);
            line-height: var(--lh-normal);
            font-weight: var(--fw-medium);
        }

        .text--section {
            font-size: var(--fs-section);
            line-height: var(--lh-tight);
            font-weight: var(--fw-semibold);
        }

        .text--body {
            font-size: var(--fs-body);
            line-height: var(--lh-normal);
            font-weight: var(--fw-regular);
        }

        .text--label {
            font-size: var(--fs-label);
            line-height: var(--lh-tight);
            font-weight: var(--fw-medium);
        }

        .text--input {
            font-size: var(--fs-input);
            line-height: var(--lh-tight);
            font-weight: var(--fw-regular);
        }

        .text--caption {
            font-size: var(--fs-caption);
            line-height: var(--lh-normal);
            font-weight: var(--fw-regular);
        }

        .text--micro {
            font-size: var(--fs-micro);
            line-height: var(--lh-tight);
            font-weight: var(--fw-regular);
        }

        /* Ink helpers */
        .ink--brand {
            color: var(--onBrandText);
        }

        .ink--default {
            color: var(--onSurfaceText);
        }

        .ink--muted {
            color: var(--onSurfaceMutedText);
        }

        .hidden {
            display: none !important;
        }

        .nowrap {
            white-space: nowrap;
        }

        /* Page chrome (header/controls/body/footer) */
        .pageHeader {
            position: relative;
            z-index: var(--zHeader);
            background: var(--brandPrimary);
            border-bottom: 1px solid var(--border);
            padding: 10px var(--pagePad);
        }

        .hdrLeft {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            /* equal flexible sides + centered middle */
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .hdrTitleWrap {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
            flex: 1 1 auto;
            align-items: center;
            text-align: center;

            grid-column: 2;
            /* middle column */
            justify-self: center;
        }


        .hdrTitle,
        .hdrSub {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .hdrRight {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-self: end;
            /* right column */
        }

        .hdrLeftSlot {
            justify-self: start;
            /* left column */
            /* placeholder to keep header layout stable */
            height: var(--controlH);
            flex: 0 0 auto;
        }


        .controls {
            position: relative;
            z-index: var(--zControls);
            background: var(--controlsBg);
            border-bottom: 1px solid var(--divider);
            padding: 8px var(--pagePad);
        }

        .controlsRow {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-width: 0;
            flex-wrap: wrap;
        }

        .content {
            flex: 1 1 auto;
            min-height: 0;
            overflow: auto;
            padding: var(--bodyPad);
            padding-bottom: var(--bodyPad);
        }

        .footerBar {
            z-index: var(--zFooter);
            height: var(--footerHeight);
            display: flex;
            align-items: center;
            padding: 0 var(--pagePad);
            background: var(--surface);
            border-top: 1px solid var(--footerTopLine);
            box-shadow: var(--footerShadow);
            font-size: var(--fs-caption);
            color: var(--onSurfaceText);
        }

        .footerBar.is-success {
            background: var(--statusSuccessBg);
            color: var(--statusSuccessText);
        }

        .footerBar.is-warn {
            background: var(--statusWarnBg);
            color: var(--statusWarnText);
        }

        .footerBar.is-error {
            background: var(--statusErrorBg);
            color: var(--statusErrorText);
        }

        .footerBar.is-info {
            background: var(--statusInfoBg);
            color: var(--statusInfoText);
        }

        /* Cards / layout */
        .card {
            background: var(--surfaceRaised);
            border: 1px solid var(--border);
            border-radius: var(--cardRadius);
            padding: var(--cardPad);
            box-shadow: 0 8px 18px rgba(0, 0, 0, .06);
            max-width: 820px;
            margin: 0 auto;
        }

        .cardHdr {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
        }

        .formGrid {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 10px 10px;
            align-items: center;
        }

        @media (max-width: 520px) {
            .formGrid {
                grid-template-columns: 1fr;
            }

            .rowLabel {
                margin-top: 6px;
            }
        }

        .rowLabel {
            color: var(--onSurfaceMutedText);
        }

        .rowInline {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .actionsRow {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 12px;
            flex-wrap: nowrap;
        }

        .actionsRow .btn {
            min-width: 140px;
        }


        /* Controls */
        .ctrl {
            height: var(--controlH);
            border-radius: var(--controlRadius);
            border: 1px solid var(--controlBorder);
            background: var(--surface);
            color: var(--onSurfaceText);
            padding: 0 12px;
            font-size: var(--fs-input);
            line-height: var(--lh-tight);
            outline: none;
            width: 100%;
            box-sizing: border-box;
        }

        .ctrl:focus-visible {
            box-shadow: 0 0 0 var(--focusRingW) var(--focusRing);
        }

        .ctrl:disabled {
            opacity: .6;
            cursor: not-allowed;
        }

        /* Password field: industry-standard eye toggle inside input */
        .pwdWrap {
            position: relative;
            width: 100%;
        }

        .pwdWrap .ctrl {
            padding-right: 46px;
            /* space for eye button */
        }

        .pwdToggle {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            height: 30px;
            width: 34px;
            border: none;
            background: transparent;
            color: var(--onSurfaceMutedText);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        .pwdToggle:focus-visible {
            outline: none;
            box-shadow: 0 0 0 var(--focusRingW) var(--focusRing);
        }

        .pwdIco {
            width: 18px;
            height: 18px;
            fill: currentColor;
        }


        /* Buttons (keep small set; tokens only) */
        .btn {
            height: var(--controlH);
            padding: 0 12px;
            border-radius: var(--controlRadius);
            border: 1px solid var(--controlBorder);
            background: var(--surface);
            color: var(--onSurfaceText);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: var(--fs-label);
            font-weight: var(--fw-medium);
            line-height: var(--lh-tight);
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        .btn:focus-visible {
            outline: none;
            box-shadow: 0 0 0 var(--focusRingW) var(--focusRing);
        }

        .btn:disabled {
            opacity: .55;
            cursor: not-allowed;
        }

        .btn--hdr {
            background: var(--appBg);
            color: var(--onSurfaceText);
            border-color: var(--controlBorder);
        }

        .btn--primary {
            background: var(--brandSecondary);
            border-color: var(--brandSecondary);
            color: var(--onBrandText);
        }

        .btn--ghost {
            background: transparent;
            border-color: var(--controlBorder);
            color: var(--onSurfaceText);
        }

        /* Inline status */
        .msg {
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid var(--divider);
            background: color-mix(in srgb, var(--danger) 12%, var(--surface));
            color: var(--onSurfaceText);
            margin-top: 10px;
        }

        .msg--error {
            border-color: color-mix(in srgb, var(--danger) 45%, var(--divider));
            background: color-mix(in srgb, var(--danger) 14%, var(--surface));
        }

        /* Tiny spinner (optional) */
        .spin {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 2px solid color-mix(in srgb, var(--onSurfaceText) 18%, transparent);
            border-top-color: var(--onSurfaceText);
            animation: spin 0.85s linear infinite;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        .hintLine {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        @media (max-width: 520px) {
            .actionsRow {
                width: 100%;
            }

            .actionsRow .btn {
                flex: 1 1 0;
                /* equal widths */
                min-width: 0;
                /* allows shrink instead of wrapping */
            }
        }
  </style>

  <script>
    // Injected by login.php; consumed by login.html JS.
    window.MA_BOOT = <?= json_encode(
        $boot,
        JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
      ) ?>;
  </script>
</head>
<body>
  <?php
    // Serve the existing HTML UI inside this wrapper
    readfile(MA_APP . "/login/login.html");
  ?>
</body>
</html>
