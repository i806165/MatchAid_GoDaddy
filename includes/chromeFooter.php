<?php
// /includes/chromeFooter.php
?>
<footer class="maChrome__ftr" role="contentinfo">
  <!-- Message / status area (yellow strip in your diagram) -->
  <div id="chromeStatusLine" class="maChrome__status status-info" aria-live="polite"></div>

  <!-- iOS-like bottom navigation (catalog-driven; page activates items) -->
  <nav id="chromeBottomNav" class="maChrome__bottomNav" aria-label="Primary">
    <!-- Buttons can be shown/hidden/enabled/active by JS -->
    <button type="button" class="maNavBtn" data-nav="home" aria-label="Home">
      <span class="maNavIcon" aria-hidden="true">⌂</span>
      <span class="maNavLabel">Home</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="admin" aria-label="Admin">
      <span class="maNavIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/><path d="M12 4.5c-1.8 0-3.3 1.3-3.5 3h7c-.2-1.7-1.7-3-3.5-3z" opacity=".3"/><path d="M12 2C9.5 2 7.3 3.3 6.2 5.3c.6-.2 1.3-.3 2-.3 2.8 0 5 2.2 5 5h2c0-4.4-3.6-8-8-8z" transform="translate(1.5, -1.5) scale(0.9)"/></svg>
      </span>
      <span class="maNavLabel">Admin</span>
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
      <span class="maNavLabel">Import</span>
    </button>
  </nav>
</footer>
