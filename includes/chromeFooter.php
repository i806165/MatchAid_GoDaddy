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

  <!-- Mobile Navigate button (mobile only, hidden on desktop via CSS) -->
  <div id="chromeNavHub" class="maChrome__navHub">
    <button id="chromeNavHubBtn" type="button" class="maChrome__navHubBtn" aria-haspopup="true" aria-expanded="false" aria-controls="chromeHubTray">
      <span class="maChrome__navHubIcon" aria-hidden="true">&#9776;</span>
      <span class="maChrome__navHubLabel">Navigate</span>
    </button>
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
  <nav id="chromeBottomNav" class="maChrome__bottomNav" aria-label="Primary">

    <button type="button" class="maNavBtn" data-nav="home" aria-label="Home">
      <span class="maNavIcon" aria-hidden="true">⌂</span>
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
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
          <path d="M8.2 4.8c1-.9 2.4-1.4 3.9-1.4 2.1 0 3.9 1 4.8 2.7h-2.4c-.7-.6-1.6-.9-2.6-.9-1.1 0-2.1.4-2.9 1.1L8.2 4.8z"></path>
          <path d="M8.9 6.4h7c-.4 1.1-1.8 1.8-3.6 1.8-1.9 0-3.1-.7-3.4-1.8z"></path>
          <circle cx="12.2" cy="9" r="2.4"></circle>
          <path d="M7.2 19.4c.6-3 2.6-4.8 5-4.8 1.4 0 2.7.6 3.6 1.7l-1.5 1.2c-.6-.7-1.3-1.1-2.1-1.1-1.4 0-2.7 1.1-3.2 3H7.8c-.4 0-.7-.4-.6-.8z"></path>
          <rect x="16.3" y="12.3" width="4.2" height="6" rx="0.8"></rect>
          <path d="M17.6 12.2c0-.5.4-.9.9-.9h.2c.5 0 .9.4.9.9v.7h-2v-.7z" fill="white"></path>
          <rect x="17.3" y="14.6" width="2.2" height=".45" rx=".2" fill="white"></rect>
          <rect x="17.3" y="16.0" width="2.2" height=".45" rx=".2" fill="white"></rect>
          <circle cx="8.2" cy="14.3" r="1.35"></circle>
          <path d="M8.65 13.8a.55.55 0 1 0 0 .9" fill="white"></path>
        </svg>
      </span>
      <span class="maNavLabel">Admin Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="player" aria-label="Player">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
          <path d="M7.5 3.5h8.8c1.1 0 2 .9 2 2v13.2c0 1.1-.9 2-2 2H7.5c-1.1 0-2-.9-2-2V5.5c0-1.1.9-2 2-2z"></path>
          <path d="M9.1 3.5h5.6c-.2 1.2-1.3 2.1-2.8 2.1s-2.6-.9-2.8-2.1z" fill="white"></path>
          <rect x="7.6" y="7.0" width="8.6" height="1.1" rx=".55" fill="white"></rect>
          <rect x="7.9" y="9.1" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <rect x="12.2" y="9.1" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <rect x="7.9" y="11.6" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <rect x="12.2" y="11.6" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <rect x="7.9" y="14.1" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <rect x="12.2" y="14.1" width="3.8" height="2.0" rx=".35" fill="white"></rect>
          <path d="M16.2 15.9l1.9-1.9 1.2 1.2-1.9 1.9-.9.2.2-.9z" fill="white"></path>
          <path d="M17.5 13.6l.7-.7c.2-.2.5-.2.7 0l.6.6c.2.2.2.5 0 .7l-.7.7-1.3-1.3z" fill="white"></path>
        </svg>
      </span>
      <span class="maNavLabel">Player Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="edit" aria-label="Edit">
      <span class="maNavIcon" aria-hidden="true">✎</span>
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

    <button class="maNavBtn" data-nav="import" aria-label="Import Games">
      <span class="maNavIcon" aria-hidden="true">⭳</span>
      <span class="maNavLabel">Import Games</span>
    </button>

    <button class="maNavBtn" data-nav="scoreentry" aria-label="Enter Scores">
      <span class="maNavIcon" aria-hidden="true">📄</span>
      <span class="maNavLabel">Enter Scores</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardPlayer" aria-label="Player Scorecard">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M6.5 3.8h9.2c1 0 1.8.8 1.8 1.8v12.8c0 1-.8 1.8-1.8 1.8H6.5c-1 0-1.8-.8-1.8-1.8V5.6c0-1 .8-1.8 1.8-1.8z"></path>
          <rect x="7.3" y="6.5" width="7.6" height="1.1" rx=".55" fill="white"></rect>
          <rect x="7.3" y="9.1" width="2.7" height="2.0" rx=".3" fill="white"></rect>
          <rect x="10.7" y="9.1" width="2.7" height="2.0" rx=".3" fill="white"></rect>
          <rect x="14.1" y="9.1" width="1.8" height="2.0" rx=".3" fill="white"></rect>
          <rect x="7.3" y="11.8" width="2.7" height="2.0" rx=".3" fill="white"></rect>
          <rect x="10.7" y="11.8" width="2.7" height="2.0" rx=".3" fill="white"></rect>
          <rect x="14.1" y="11.8" width="1.8" height="2.0" rx=".3" fill="white"></rect>
          <circle cx="18.3" cy="16.8" r="2.3"></circle>
          <circle cx="18.3" cy="16.0" r=".75" fill="white"></circle>
          <path d="M17.1 18.1c.25-.7.8-1.05 1.2-1.05s.95.35 1.2 1.05" fill="white"></path>
        </svg>
      </span>
      <span class="maNavLabel">Player Card</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardGroup" aria-label="Group Scorecard">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M5.5 4.0h10.2c1 0 1.8.8 1.8 1.8v12.4c0 1-.8 1.8-1.8 1.8H5.5c-1 0-1.8-.8-1.8-1.8V5.8c0-1 .8-1.8 1.8-1.8z"></path>
          <rect x="6.4" y="6.4" width="8.4" height="1.0" rx=".5" fill="white"></rect>
          <rect x="6.4" y="8.8" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <rect x="9.2" y="8.8" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <rect x="12.0" y="8.8" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <rect x="6.4" y="11.2" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <rect x="9.2" y="11.2" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <rect x="12.0" y="11.2" width="2.3" height="1.8" rx=".25" fill="white"></rect>
          <circle cx="18.4" cy="15.2" r="1.25"></circle>
          <circle cx="20.6" cy="16.4" r="1.0"></circle>
          <circle cx="16.3" cy="16.4" r="1.0"></circle>
        </svg>
      </span>
      <span class="maNavLabel">Group Card</span>
    </button>

    <button class="maNavBtn" data-nav="scorecardGame" aria-label="Game Scorecards">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M7.5 4.0h8.8c.9 0 1.7.8 1.7 1.7v10.8c0 .9-.8 1.7-1.7 1.7H7.5c-.9 0-1.7-.8-1.7-1.7V5.7c0-.9.8-1.7 1.7-1.7z"></path>
          <path d="M5.8 6.0H4.9c-.8 0-1.4.6-1.4 1.4v10c0 .8.6 1.4 1.4 1.4h8.3c.8 0 1.4-.6 1.4-1.4v-.6H7.5c-1.5 0-2.7-1.2-2.7-2.7V6.0z" opacity=".35"></path>
          <rect x="8.2" y="6.3" width="7.3" height="1.0" rx=".5" fill="white"></rect>
          <rect x="8.2" y="8.6" width="2.1" height="1.6" rx=".25" fill="white"></rect>
          <rect x="10.9" y="8.6" width="2.1" height="1.6" rx=".25" fill="white"></rect>
          <rect x="13.6" y="8.6" width="1.6" height="1.6" rx=".25" fill="white"></rect>
          <rect x="8.2" y="10.9" width="2.1" height="1.6" rx=".25" fill="white"></rect>
          <rect x="10.9" y="10.9" width="2.1" height="1.6" rx=".25" fill="white"></rect>
          <rect x="13.6" y="10.9" width="1.6" height="1.6" rx=".25" fill="white"></rect>
        </svg>
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