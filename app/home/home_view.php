<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>MatchAid • Golf Game Management</title>
  <meta name="description" content="MatchAid helps golf groups run games smoothly — from admin setup to player participation." />
  <meta name="theme-color" content="#07432A" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

  <!-- Styles -->
  <link rel="stylesheet" href="/assets/css/home.css" />
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
            <div class="brandText__tag">Golf game management</div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="main">
      <section class="hero" aria-label="Welcome">
        <h1 class="hero__title">Run better golf games — with less friction.</h1>
        <p class="hero__subtitle">
          Make your golf games easier to manage, easier for players to participate making the experience enjoyable for all.
        </p>
      </section>

      <section class="grid" aria-label="Portals">
        <!-- Left: CTAs -->
        <div class="card">
          <div class="card__hdr">
            <h2 class="card__title">Choose your role</h2>
          </div>
          <div class="card__body">
            <p class="copy">
              Select where you’d like to go.
            </p>

            <div class="ctaRow" role="group" aria-label="Portal navigation">
              <!-- Player Portal -->
              <a class="btn btn--primary"
                 href="<?= htmlspecialchars($playerPortalHref) ?>">
                <span aria-hidden="true">🏌️</span>
                <span>Enter as Game Player</span>
              </a>

              <!-- Admin Portal -->
              <a class="btn btn--primary"
                 href="<?= htmlspecialchars($adminPortalHref) ?>">
                <span aria-hidden="true">🛠️</span>
                <span>Enter as Game Admin</span>
              </a>
            </div>

            <p class="copy" style="margin-top: 0.2rem;">
              <span style="color: rgba(205,178,120,0.92); font-weight: 600;">Tip:</span>
              Bookmark your Portal for quick access during game day.
            </p>
          </div>
        </div>

        <!-- Right: What’s inside -->
        <aside class="card" aria-label="The MatchAid value proposition">
          <div class="card__hdr">
            <h2 class="card__title">The MatchAid value proposition</h2>
          </div>
            <div class="card__body">
                <ul class="miniList">
                    <li class="miniItem">
                    <div class="miniIcon" aria-hidden="true">A</div>
                    <div class="miniText">
                        <strong>Built for game administrators</strong>
                        <span>Organize golf games and engage players from inception to scoring.</span>
                    </div>
                    </li>
                    <li class="miniItem">
                    <div class="miniIcon" aria-hidden="true">P</div>
                    <div class="miniText">
                        <strong>Friendly to players</strong>
                        <span>Explore available games, and enroll earlier with better visibility.</span>
                    </div>
                    </li>
                    <li class="miniItem">
                    <div class="miniIcon" aria-hidden="true">C</div>
                    <div class="miniText">
                        <strong>Helpful to club professional staff</strong>
                        <span>Optimize member participation and improve tee-time utilization.</span>
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