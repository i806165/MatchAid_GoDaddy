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
      <span class="maNavIcon" aria-hidden="true">▦</span>
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
      <span class="maNavIcon" aria-hidden="true">⇄</span>
      <span class="maNavLabel">Pairings</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="teetimes" aria-label="Tee Times">
      <span class="maNavIcon" aria-hidden="true">⏱</span>
      <span class="maNavLabel">Tee Times</span>
    </button>

    <button type="button" class="maNavBtn" data-nav="summary" aria-label="Summary">
      <span class="maNavIcon" aria-hidden="true">✓</span>
      <span class="maNavLabel">Summary</span>
    </button>
  </nav>
</footer>
