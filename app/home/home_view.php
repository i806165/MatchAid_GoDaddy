<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>MatchAid • Golf Game Management</title>
  <meta name="description" content="MatchAid helps golf games run smoothly — from game inception to score management." />
  <meta name="theme-color" content="#07432A" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

  <!-- Styles -->
  <link rel="stylesheet" href="/assets/css/ma_shared.css">
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

        <div class="hdr__right">
          <?php if (!empty($isLoggedIn)): ?>
            <button
              type="button"
              class="iconBtn acctBtn acctBtn--loggedIn"
              id="acctBtn"
              aria-label="Account"
              title="Account"
              data-logged-in="1"
            >
              <span class="acctBtn__initial" aria-hidden="true"><?= htmlspecialchars($userInitial) ?></span>
            </button>
          <?php else: ?>
            <a
              class="iconBtn acctBtn acctBtn--loggedOut"
              href="<?= htmlspecialchars($loginHref) ?>"
              aria-label="Sign In"
              title="Sign In"
            >
              <svg class="acctBtn__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2c-4.42 0-8 3.13-8 7h2c0-2.76 2.69-5 6-5s6 2.24 6 5h2c0-3.87-3.58-7-8-7Zm0-10c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3Z"/>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>
              </svg>
            </a>
          <?php endif; ?>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="main">
      <section class="hero" aria-label="Welcome">
        <h1 class="hero__title">Run better golf games — with less friction.</h1>
        <p class="hero__subtitle">
          Make your golf games easier to manage, easier for players to participate, and an experience for all to enjoy.
        </p>
      </section>

      <section class="grid" aria-label="Portals">
        <!-- Left: CTAs -->
        <div class="card">
          <div class="card__hdr card__hdr--compact">
            <h2 class="card__title">Select where you’d like to go.</h2>
          </div>
          <div class="card__body">

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
          <div class="card__hdr card__hdr--compact">
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
      </div>
    </footer>
  </div>

<?php if (!empty($isLoggedIn)): ?>
  <script src="/assets/modules/actions_menu.js?v=1"></script>
  <script>
  (function () {
    const acctBtn = document.getElementById('acctBtn');
    if (!acctBtn || !window.MA || !MA.ui || typeof MA.ui.openActionsMenu !== 'function') return;

    async function doLogout() {
      try {
        const res = await fetch('/api/auth/logout.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        const out = await res.json().catch(() => ({}));
        if (out && out.ok) {
          window.location.assign('/');
          return;
        }
      } catch (err) {
        console.error('Logout failed', err);
      }
      window.location.assign('/');
    }

    acctBtn.addEventListener('click', function () {
      MA.ui.openActionsMenu('Account', [
        {
          label: 'User Settings',
          action: function () {
            window.location.assign('/app/user_settings/usersettings.php');
          }
        },
        { separator: true },
        {
          label: 'Log Out',
          action: doLogout,
          danger: true
        }
      ]);
    });
  })();
  </script>
<?php endif; ?>

</body>
</html>