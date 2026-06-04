<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
  <title>MatchAid • Unlock Your Club</title>
  <meta name="description" content="Enroll your club in MatchAid to give administrators, players, and club professionals access to powerful golf game management tools." />
  <meta name="theme-color" content="#07432A" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Montserrat', sans-serif;
      background: #f4f4f0;
      color: #1a1a1a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem 1rem 3rem;
    }

    .page {
      width: 100%;
      max-width: 680px;
    }

    /* ── Header ── */
    .mk-hdr {
      background: #07432A;
      border-radius: 12px 12px 0 0;
      padding: 1.125rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .mk-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .mk-logo {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: rgba(255,255,255,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    .mk-brandname {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
    }

    .mk-brandtag {
      font-size: 11px;
      color: rgba(255,255,255,0.6);
    }

    .mk-home-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.9);
      text-decoration: none;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .mk-home-btn:hover {
      background: rgba(255,255,255,0.2);
    }

    /* ── Hero ── */
    .mk-hero {
      background: #0A5235;
      padding: 1.5rem;
    }

    .mk-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 11px;
      color: rgba(255,255,255,0.9);
      margin-bottom: 0.875rem;
    }

    .mk-hero-title {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 0.5rem;
      line-height: 1.3;
    }

    .mk-hero-sub {
      font-size: 13px;
      color: rgba(255,255,255,0.75);
      line-height: 1.65;
    }

    /* ── Body ── */
    .mk-body {
      background: #fff;
      border: 1px solid #e0e0d8;
      border-top: none;
      border-radius: 0 0 12px 12px;
      padding: 1.25rem 1.5rem;
    }

    .mk-alert {
      background: #f8f6f0;
      border-left: 3px solid #C4692A;
      border-radius: 0 8px 8px 0;
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
      font-size: 13px;
      color: #555;
      line-height: 1.65;
    }

    .mk-alert strong {
      display: block;
      color: #1a1a1a;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .mk-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 0.75rem;
    }

    /* ── Portal cards ── */
    .mk-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 1.25rem;
    }

    @media (max-width: 520px) {
      .mk-grid { grid-template-columns: 1fr; }
    }

    .mk-card {
      background: #f8f8f4;
      border: 1px solid #e4e4dc;
      border-radius: 8px;
      padding: 0.875rem;
    }

    .mk-card-icon {
      font-size: 22px;
      color: #07432A;
      margin-bottom: 8px;
      line-height: 1;
    }

    .mk-card-role {
      font-size: 10px;
      font-weight: 700;
      color: #C4692A;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }

    .mk-card-title {
      font-size: 12px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .mk-card-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .mk-card-list li {
      font-size: 11px;
      color: #555;
      line-height: 1.4;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }

    .mk-card-list li::before {
      content: "✓";
      color: #07432A;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 0;
    }

    /* ── CTA ── */
    .mk-cta {
      background: #07432A;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .mk-cta-free {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 2px 10px;
      font-size: 11px;
      color: rgba(255,255,255,0.8);
      margin-bottom: 5px;
    }

    .mk-cta-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 3px;
    }

    .mk-cta-sub {
      font-size: 12px;
      color: rgba(255,255,255,0.65);
    }

    .mk-email-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #C4692A;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: 'Montserrat', sans-serif;
      cursor: pointer;
      white-space: nowrap;
      text-decoration: none;
      flex-shrink: 0;
    }

    .mk-email-btn:hover { background: #b05c24; }

    /* ── Header email btn ── */
    .mk-hdr-email {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #C4692A;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Montserrat', sans-serif;
      cursor: pointer;
      white-space: nowrap;
      text-decoration: none;
      flex-shrink: 0;
    }

    .mk-hdr-email:hover { background: #b05c24; }

    .mk-hdr-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .mk-fine {
      font-size: 12px;
      color: #888;
      text-align: center;
      margin-top: 1rem;
      line-height: 1.65;
    }

    /* SVG icons inline */
    .ico {
      width: 14px;
      height: 14px;
      display: inline-block;
      vertical-align: middle;
      fill: currentColor;
      flex-shrink: 0;
    }
    .ico-lg {
      width: 22px;
      height: 22px;
    }
  </style>
</head>
<?php
$emailSubject = !empty($clubName)
    ? rawurlencode("Club Enrollment Request – " . $clubName . (!empty($clubId) ? " (ID: " . $clubId . ")" : ""))
    : rawurlencode("Club Enrollment Request");
$mailtoHref = "mailto:signup@matchaid.org?subject=" . $emailSubject;
?>
<body>
<div class="page">

  <!-- Header -->
  <div class="mk-hdr">
    <div class="mk-brand">
      <div class="mk-logo">M</div>
      <div>
        <div class="mk-brandname">MatchAid</div>
        <div class="mk-brandtag">Golf game management</div>
      </div>
    </div>
    <div class="mk-hdr-actions">
      <a class="mk-home-btn" href="<?= htmlspecialchars($homeUrl) ?>">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        Return to home
      </a>
      <a class="mk-hdr-email" href="<?= htmlspecialchars($mailtoHref) ?>">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/></svg>
        Contact us to enroll
      </a>
    </div>
  </div>

  <!-- Hero -->
  <div class="mk-hero">
    <div class="mk-badge">&#x1F512; Club enrollment required</div>
    <h1 class="mk-hero-title">Unlock the MatchAid experience for your club</h1>
    <p class="mk-hero-sub">Your GHIN profile is linked to a club that isn't yet enrolled in MatchAid. Enrollment is free — reach out and we'll get you set up.</p>
  </div>

  <!-- Body -->
  <div class="mk-body">

    <div class="mk-alert">
      <strong>Why am I seeing this?</strong>
      To maintain secure GHIN integration and platform integrity, each participating club must be enrolled in MatchAid. Once your club is enrolled, all members can sign in and access the tools below.
      <?php if (!empty($clubName)): ?>
        <br><br>Your club is <strong><?= htmlspecialchars($clubName) ?></strong><?php if (!empty($clubId)): ?> (Club ID: <strong><?= htmlspecialchars($clubId) ?></strong>)<?php endif; ?><?php if (!empty($facilityName)): ?>, facility <strong><?= htmlspecialchars($facilityName) ?></strong><?php endif; ?> — include this information in your enrollment email so we can get you set up quickly.
      <?php endif; ?>
    </div>

    <div class="mk-section-title">What MatchAid gives your club</div>

    <div class="mk-grid">

      <div class="mk-card">
        <div class="mk-card-icon">
          <svg class="ico ico-lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-7 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm6 13H6v-.6C6 16 9 14 12 14s6 2 6 4.4V19Z"/></svg>
        </div>
        <div class="mk-card-role">Game Administrators</div>
        <div class="mk-card-title">Run better games with less friction</div>
        <ul class="mk-card-list">
          <li>Create and manage games</li>
          <li>Build rosters and set pairings</li>
          <li>Assign tee times and manage scoring</li>
          <li>Replace spreadsheets and text chains</li>
        </ul>
      </div>

      <div class="mk-card">
        <div class="mk-card-icon">
          <svg class="ico ico-lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2Zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4Z"/></svg>
        </div>
        <div class="mk-card-role">Players</div>
        <div class="mk-card-title">Stay connected to every game</div>
        <ul class="mk-card-list">
          <li>Find and join games from your phone</li>
          <li>View pairings, tee times, and starting holes</li>
          <li>Enter scores and follow results</li>
          <li>No texts or manual updates needed</li>
        </ul>
      </div>

      <div class="mk-card">
        <div class="mk-card-icon">
          <svg class="ico ico-lg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 12h3v9h6v-5h2v5h6v-9h3L12 3Zm0 12.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z"/></svg>
        </div>
        <div class="mk-card-role">Club Professionals</div>
        <div class="mk-card-title">Greater visibility. Better planning.</div>
        <ul class="mk-card-list">
          <li>See member-game demand as it forms</li>
          <li>Plan tee-time capacity earlier</li>
          <li>Support smarter tee-sheet decisions</li>
          <li>Reduce last-minute operational churn</li>
        </ul>
      </div>

    </div>

    <!-- CTA -->
    <div class="mk-cta">
      <div>
        <div class="mk-cta-free">&#x1F381; Enrollment is free</div>
        <div class="mk-cta-title">Ready to get your club enrolled?</div>
        <div class="mk-cta-sub">E-mail us at signup@matchaid.org — we'll respond within one business day.</div>
      </div>
      <a class="mk-email-btn" href="<?= htmlspecialchars($mailtoHref) ?>">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/></svg>
        Get started
      </a>
    </div>

    <p class="mk-fine">Have questions before enrolling? Feel free to reach out — we're happy to help.</p>

  </div>

  <!-- Footer -->
  <p style="font-size:11px; color:#aaa; text-align:center; margin-top:1.5rem;">
    &copy; <?= date("Y") ?> MatchAid &bull; All rights reserved
  </p>

</div>
</body>
</html>