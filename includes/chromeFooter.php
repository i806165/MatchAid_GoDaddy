<?php
// /includes/chromeFooter.php
// Chrome footer: status line + footer action bar (save/cancel) + iOS-like bottom nav.
//
// The footer action bar (.maChrome__ftrActions) is always present in the DOM but
// hidden by default. MA.chrome.setActions({ footer: { save, cancel } }) toggles
// the .maChrome__ftr--actions class on this element to swap nav ↔ action bar.
// The status line always renders above both — no markup changes needed per page.
?>
<footer class="maChrome__ftr" role="contentinfo">

  <!-- Page action slot — optional, hidden by default, shown by MA.chrome.setActions({ page: ... }) -->
  <div id="chromePageAction" class="maChrome__pageAction" style="display:none;">
    <button id="chromePageActionBtn" type="button" class="maChrome__pageActionBtn"></button>
  </div>

  <!-- Status / message area — always visible, sits above nav or action bar -->
  <div id="chromeStatusLine" class="maChrome__status status-info" aria-live="polite"></div>

  <!-- Footer action bar (Save + Cancel) — hidden until dirty/add mode active -->
  <div id="chromeFtrActions" class="maChrome__ftrActions" role="group" aria-label="Form actions">
    <button id="chromeFtrCancel" type="button" class="maFtrBtn maFtrBtn--cancel">Cancel</button>
    <button id="chromeFtrSave"   type="button" class="maFtrBtn maFtrBtn--save">Save</button>
  </div>

  <!-- Hub tray overlay (mobile only, populated by MA.chrome.setBottomNav) -->
  <div id="chromeHubTray" class="maChrome__hubTray" role="dialog" aria-modal="true" aria-label="Navigation" hidden>
    <div class="maChrome__hubBackdrop" id="chromeHubBackdrop"></div>
    <div class="maChrome__hubSheet" role="document">
      <div class="maChrome__hubHandle" aria-hidden="true"></div>
      <div class="maChrome__hubHeader">
        <span class="maChrome__hubTitle">Go to</span>
        <button id="chromeHubClose" type="button" class="maChrome__hubClose" aria-label="Close navigation">&#10005;</button>
      </div>
      <div class="maChrome__hubScroll" id="chromeHubRows">
        <!-- Rows injected by MA.chrome.setBottomNav() -->
      </div>
    </div>
  </div>

  <!-- iOS-like bottom navigation (catalog-driven; page activates items) -->
  <!-- The Navigate button lives INSIDE the nav so it occupies exactly the
       same space as the icon buttons. CSS swaps visibility via media query. -->
  <nav id="chromeBottomNav" class="maChrome__bottomNav" aria-label="Primary">

    <div id="chromeNavHub" class="maChrome__navHub">
      <button id="chromeNavHubBtn" type="button" class="maChrome__navHubBtn" aria-haspopup="true" aria-expanded="false" aria-controls="chromeHubTray">
        <span class="maChrome__navHubIcon" aria-hidden="true">&#9776;</span>
        <span class="maChrome__navHubLabel">Navigate</span>
      </button>
    </div>

    <button type="button" class="maNavBtn" data-nav="home" aria-label="Home">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-app-home.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">MatchAid Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="adminOld" aria-label="Admin">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/><path d="M12 4.5c-1.8 0-3.3 1.3-3.5 3h7c-.2-1.7-1.7-3-3.5-3z" opacity=".3"/><path d="M12 2C9.5 2 7.3 3.3 6.2 5.3c.6-.2 1.3-.3 2-.3 2.8 0 5 2.2 5 5h2c0-4.4-3.6-8-8-8z" transform="translate(1.5, -1.5) scale(0.9)"/></svg>
      </span>
      <span class="maNavLabel">Admin</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="admin" aria-label="Admin">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-admin-home.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Admin Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="player" aria-label="Player">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-player-home.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Player Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="edit" aria-label="Edit">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-edit.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Edit</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="favorites" aria-label="Favorites">
      <span class="maNavIcon" aria-hidden="true">★</span>
      <span class="maNavLabel">Favorites</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="roster" aria-label="Roster">
      <span class="maNavIcon" aria-hidden="true">👥</span>
      <span class="maNavLabel">Roster</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="settings" aria-label="Game Settings">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-settings.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Settings</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="pairings" aria-label="Pairings">
      <span class="maNavIcon" aria-hidden="true">🔗</span>
      <span class="maNavLabel">Pairings</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="teetimes" aria-label="Tee Times">
      <span class="maNavIcon" aria-hidden="true">⏱</span>
      <span class="maNavLabel">Tee Times</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="summary" aria-label="Summary">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
      </span>
      <span class="maNavLabel">Summary</span>
    </button>

    <button class="maNavBtn" data-nav="scorecard" aria-label="Scorecard">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-scorecard.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Score Card</span>
    </button>

    <button class="maNavBtn" data-nav="import" aria-label="Import Games">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-import.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Import Games</span>
    </button>

    <button class="maNavBtn" data-nav="scoreentry" aria-label="Enter Scores">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-score-entry.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Enter Scores</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardPlayer" aria-label="Player Scorecard">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-scorecard.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Player Card</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardGroup" aria-label="Group Scorecard">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-scorecard-group.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Group Card</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardGame" aria-label="Game Scorecards">
      <span class="maNavIcon" aria-hidden="true">
        <img src="/assets/images/nav-scorecard-game.png" alt="" width="26" height="26" style="display:block; object-fit:contain;">
      </span>
      <span class="maNavLabel">Game Cards</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="scoreskins" aria-label="Skins">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M16 9c0-1.66-1.34-3-3-3h-2c-1.66 0-3 1.34-3 3 0 .78.32 1.49.82 2H7c-1.1 0-2 .9-2 2v5c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2h-1.82c.5-.51.82-1.22.82-2z"></path>
          <path d="M12.5 13c-1.3 0-2 .6-2 1.5s.7 1.5 2 1.5 2 .6 2 1.5-.7 1.5-2 1.5v1h-1v-1c-1.3 0-2-.6-2-1.5h1.5c0 .6.7 1 1.5 1s1.5-.4 1.5-1-.7-1-2-1-2-.6-2-1.5.7-1.5 2-1.5v-1h1v1c1.3 0 2 .6 2 1.5h-1.5c0-.6-.7-1-1.5-1z" fill="white"></path>
        </svg>
      </span>
      <span class="maNavLabel">Skins</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="scoresummary" aria-label="Leaders">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <rect x="4" y="18.5" width="16" height="1.5" rx=".75"></rect>
          <rect x="5.2" y="11.5" width="3.6" height="6.4" rx=".6"></rect>
          <rect x="10.2" y="8.0" width="3.6" height="9.9" rx=".6"></rect>
          <rect x="15.2" y="13.3" width="3.6" height="4.6" rx=".6"></rect>
        </svg>
      </span>
      <span class="maNavLabel">Leaders</span>
    </button>

  </nav>
</footer>