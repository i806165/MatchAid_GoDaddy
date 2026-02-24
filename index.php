<?php
// index.php — MatchAid Home

// Handle portal selection before rendering the page.
// This sets the session variable so the login page knows where to return.
session_start();
if (isset($_GET['portal'])) {
    $portal = trim((string)$_GET['portal']);
    if ($portal === 'admin') {
        $_SESSION['SessionPortal'] = 'ADMIN PORTAL';
        session_write_close();
        header('Location: /app/admin_games/gameslist.php');
        exit;
    } elseif ($portal === 'player') {
        $_SESSION['SessionPortal'] = 'PLAYER PORTAL';
        session_write_close();
        header('Location: /app/player_games/playergames.php');
        exit;
    }
}

$adminPortalHref  = "/index.php?portal=admin";
$playerPortalHref = "/index.php?portal=player"; 
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <title>MatchAid • Golf Game Management</title>
  <meta name="description" content="MatchAid helps golf groups run games smoothly — from admin setup to player participation." />
  <meta name="theme-color" content="#07432A" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    :root {
      /* Brand */
      --brandPrimary: #07432A;
      --brandSecondary: #3F7652;
      --brandAccent: #CDB278;

      /* Neutrals */
      --bg: #0b1511;
      --panel: rgba(255,255,255,0.06);
      --panel2: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --muted: rgba(255,255,255,0.70);
      --border: rgba(255,255,255,0.14);

      /* Layout tokens */
      --radiusLg: 1.25rem;
      --radiusMd: 0.9rem;
      --shadow: 0 12px 34px rgba(0,0,0,0.35);

      --maxW: 72rem;
      --padXs: 0.5rem;
      --padSm: 0.9rem;
      --padMd: 1.25rem;
      --padLg: 1.75rem;
      --gapSm: 0.75rem;
      --gapMd: 1.1rem;
      --gapLg: 1.6rem;

      --ctlH: 2.75rem;
      --focus: 0 0 0 0.22rem rgba(205,178,120,0.35);
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: "Montserrat", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 800px at 15% 0%, rgba(63,118,82,0.30), transparent 55%),
        radial-gradient(900px 700px at 85% 15%, rgba(205,178,120,0.18), transparent 55%),
        linear-gradient(180deg, #06110c, var(--bg));
    }

    a { color: inherit; text-decoration: none; }
    .page {
      min-height: 100%;
      display: grid;
      grid-template-rows: auto 1fr auto;
    }

    /* Header */
    .hdr {
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(10px);
      background: linear-gradient(180deg, rgba(6,17,12,0.86), rgba(6,17,12,0.58));
      border-bottom: 1px solid var(--border);
    }
    .hdr__inner {
      max-width: var(--maxW);
      margin: 0 auto;
      padding: var(--padMd);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gapMd);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: var(--gapSm);
      min-width: 0;
    }
    .logoMark {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.7rem;
      background: linear-gradient(135deg, var(--brandPrimary), var(--brandSecondary));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18), 0 10px 22px rgba(0,0,0,0.28);
      display: grid;
      place-items: center;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: rgba(255,255,255,0.92);
      flex: 0 0 auto;
    }
    .brandText {
      min-width: 0;
      line-height: 1.1;
    }
    .brandText__name {
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: 0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brandText__tag {
      font-size: 0.9rem;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hdr__right {
      display: flex;
      align-items: center;
      gap: var(--gapSm);
      flex: 0 0 auto;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.8rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.9rem;
      user-select: none;
    }
    .dot {
      width: 0.55rem; height: 0.55rem; border-radius: 999px;
      background: var(--brandAccent);
      box-shadow: 0 0 0 0.18rem rgba(205,178,120,0.20);
    }

    /* Main */
    .main {
      max-width: var(--maxW);
      width: 100%;
      margin: 0 auto;
      padding: clamp(1.1rem, 3vw, 2.2rem) var(--padMd);
      display: grid;
      align-content: start;
      gap: var(--gapLg);
    }

    .hero {
      display: grid;
      gap: var(--gapMd);
      padding: clamp(1.2rem, 2.6vw, 2.0rem);
      border-radius: var(--radiusLg);
      background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      overflow: hidden;
      position: relative;
    }
    .hero::before {
      content: "";
      position: absolute;
      inset: -40% -20% auto -30%;
      height: 14rem;
      background: radial-gradient(circle at 30% 30%, rgba(63,118,82,0.45), transparent 60%);
      pointer-events: none;
      filter: blur(0.2rem);
    }
    .hero__title {
      position: relative;
      margin: 0;
      font-weight: 700;
      letter-spacing: 0.01em;
      font-size: clamp(1.5rem, 3.2vw, 2.4rem);
    }
    .hero__subtitle {
      position: relative;
      margin: 0;
      color: var(--muted);
      font-size: 1rem;
      max-width: 58ch;
      line-height: 1.45;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: var(--gapLg);
      align-items: start;
    }
    @media (max-width: 58rem) {
      .grid { grid-template-columns: 1fr; }
    }

    .card {
      border-radius: var(--radiusLg);
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 10px 26px rgba(0,0,0,0.25);
      overflow: hidden;
    }
    .card__hdr {
      padding: var(--padLg);
      border-bottom: 1px solid rgba(255,255,255,0.10);
      background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
    }
    .card__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    .card__body {
      padding: var(--padLg);
      display: grid;
      gap: var(--gapMd);
    }
    .copy {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 0.98rem;
    }

    .ctaRow {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--gapSm);
    }
    @media (max-width: 34rem) {
      .ctaRow { grid-template-columns: 1fr; }
    }

    .btn {
      height: var(--ctlH);
      border-radius: 0.9rem;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.06);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 0 1rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      user-select: none;
    }
    .btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.20); }
    .btn:active { transform: translateY(0px); }
    .btn:focus-visible { outline: none; box-shadow: var(--focus); }

    .btn--primary {
      background: linear-gradient(180deg, rgba(63,118,82,0.92), rgba(63,118,82,0.74));
      border-color: rgba(255,255,255,0.18);
    }
    .btn--primary:hover { background: linear-gradient(180deg, rgba(63,118,82,0.98), rgba(63,118,82,0.80)); }

    .btn--ghost {
      background: rgba(255,255,255,0.02);
      border-color: rgba(255,255,255,0.22);
      color: rgba(255,255,255,0.92);
    }

    .btn--disabled,
    .btn[aria-disabled="true"] {
      opacity: 0.55;
      cursor: not-allowed;
      pointer-events: none;
      transform: none !important;
    }

    .miniList {
      display: grid;
      gap: 0.65rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .miniItem {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      align-items: start;
      padding: 0.85rem 0.95rem;
      border-radius: var(--radiusMd);
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
    }
    .miniIcon {
      width: 2rem;
      height: 2rem;
      border-radius: 0.75rem;
      display: grid;
      place-items: center;
      background: rgba(205,178,120,0.14);
      border: 1px solid rgba(205,178,120,0.25);
      color: rgba(255,255,255,0.92);
      font-weight: 800;
      flex: 0 0 auto;
    }
    .miniText strong {
      display: block;
      font-size: 0.98rem;
      margin-bottom: 0.18rem;
      letter-spacing: 0.01em;
    }
    .miniText span {
      display: block;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.35;
    }

    /* Footer */
    .ftr {
      border-top: 1px solid var(--border);
      background: rgba(6,17,12,0.72);
      backdrop-filter: blur(10px);
    }
    .ftr__inner {
      max-width: var(--maxW);
      margin: 0 auto;
      padding: var(--padMd);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gapMd);
      color: var(--muted);
      font-size: 0.9rem;
      flex-wrap: wrap;
    }
    .fineprint { margin: 0; }
    .link {
      color: rgba(255,255,255,0.82);
      border-bottom: 1px solid rgba(255,255,255,0.22);
      padding-bottom: 0.08rem;
    }
    .link:hover { border-bottom-color: rgba(255,255,255,0.40); }

    /* Utility */
    .srOnly {
      position: absolute !important;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }
  </style>
</head>

<body>
  <div class="page">
    <!-- Header -->
    <header class="hdr">
      <div class="hdr__inner">
        <div class="brand" aria-label="MatchAid Home">
          <div class="logoMark" aria-hidden="true">M</div>
          <div class="brandText">
            <div class="brandText__name">MatchAid</div>
            <div class="brandText__tag">Golf game management • Admin + Player experience</div>
          </div>
        </div>

        <div class="hdr__right">
          <div class="pill" title="Environment status">
            <span class="dot" aria-hidden="true"></span>
            <span>Home</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="main">
      <section class="hero" aria-label="Welcome">
        <h1 class="hero__title">Run better golf games — with less friction.</h1>
        <p class="hero__subtitle">
          MatchAid supports administrators and players with a clean workflow: games, roster, pairings, tee times, and scoring —
          all aligned to your club’s process.
        </p>
      </section>

      <section class="grid" aria-label="Portals">
        <!-- Left: CTAs -->
        <div class="card">
          <div class="card__hdr">
            <h2 class="card__title">Choose your portal</h2>
          </div>
          <div class="card__body">
            <p class="copy">
              Select where you’d like to go.
            </p>

            <div class="ctaRow" role="group" aria-label="Portal navigation">
              <!-- Player Portal -->
              <a class="btn btn--primary"
                 href="<?= htmlspecialchars($playerPortalHref) ?>"
                <span aria-hidden="true">🏌️</span>
                <span>Player Portal</span>
              </a>

              <!-- Admin Portal -->
              <a class="btn btn--primary"
                 href="<?= htmlspecialchars($adminPortalHref) ?>">
                <span aria-hidden="true">🛠️</span>
                <span>Administrator Portal</span>
              </a>
            </div>

            <p class="copy" style="margin-top: 0.2rem;">
              <span style="color: rgba(205,178,120,0.92); font-weight: 600;">Admin tip:</span>
              Bookmark your Portal for quick access during game day.
            </p>
          </div>
        </div>

        <!-- Right: What’s inside -->
        <aside class="card" aria-label="What MatchAid provides">
          <div class="card__hdr">
            <h2 class="card__title">What MatchAid provides</h2>
          </div>
          <div class="card__body">
            <ul class="miniList">
              <li class="miniItem">
                <div class="miniIcon" aria-hidden="true">G</div>
                <div class="miniText">
                  <strong>Game workflows</strong>
                  <span>Create and manage games with consistent options and rules.</span>
                </div>
              </li>
              <li class="miniItem">
                <div class="miniIcon" aria-hidden="true">R</div>
                <div class="miniText">
                  <strong>Roster building</strong>
                  <span>Add players quickly (favorites, GHIN search, non-rated).</span>
                </div>
              </li>
              <li class="miniItem">
                <div class="miniIcon" aria-hidden="true">P</div>
                <div class="miniText">
                  <strong>Pairings + tee times</strong>
                  <span>Assign pairings and starts with clean, readable screens.</span>
                </div>
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </main>

    <!-- Footer -->
    <footer class="ftr">
      <div class="ftr__inner">
        <p class="fineprint">© <?= date("Y") ?> MatchAid • All rights reserved</p>
        <p class="fineprint">
          Need admin access? Go to
          <a class="link" href="<?= htmlspecialchars($adminPortalHref) ?>">Administrator Portal</a>
        </p>
      </div>
    </footer>
  </div>
</body>
</html>
