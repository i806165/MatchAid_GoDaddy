<?php
// /public_html/app/event_summary/eventsummary_view.php
//
// Single panel — unlike score_summary's two tab-switched panels (Score
// Summary / Leaderboard), event summary is one continuous view: Flight
// tabs (data-driven, hidden entirely when the event has only the implicit
// single flight), an Individual/Pairing/Team pill group, and a Gross/Net
// pill group (Individual view only — Pairing/Team have no gross/net split,
// they're points-only; see event_leaderboard_spec.md §3). All three live
// in #esPanelControls at page level (eventsummary.php), same placement
// pattern as #ssPanelControls/#ssControls in score_summary, so they stay
// visible above the scrollable results as the user scrolls.
?>

<section class="maPanel maPanel--primary" aria-label="Event Leaderboard">
  <div class="maCards" id="esCards">
    <section class="maCard" id="esHostCard" aria-label="Event Leaderboard">
      <header class="maCard__hdr">
        <div class="maCard__title">EVENT LEADERBOARD</div>
        <div class="maCard__actions">
          <span class="maHint" id="esHint">Toggle flight, view, or gross/net standings below.</span>
        </div>
      </header>
      <div class="maCard__body">
        <div id="esHost" class="esHost" aria-label="Event leaderboard standings"></div>
        <div id="esEmpty" class="maEmptyState" style="display:none;">No leaderboard data available.</div>
      </div>
    </section>
  </div>
</section>
