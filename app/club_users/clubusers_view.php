<?php
// /public_html/app/club_users/clubusers_view.php
// Pure structure — no logic. JS hydrates all IDs from window.__INIT__.
?>

<!-- ============================================================
     CONTROLS BAND
     ============================================================ -->
<div class="maControlArea" id="cuControls" aria-label="Club Users Controls">
  <div class="maFieldRow" style="align-items:center; gap:8px;">
    <div class="maField" style="flex:1 1 auto; min-width:0;">
      <div class="maInputWrap cuInputClearWrap">
        <input type="text" id="cuSearch" class="maTextInput" placeholder="Search by name…" autocomplete="off" />
        <button id="cuSearchClear" class="clearBtn isHidden" type="button" aria-label="Clear search">×</button>
      </div>
    </div>
    <div class="cuUserCount" id="cuUserCount"></div>
  </div>
</div>

<!-- ============================================================
     MAIN PAGE BODY
     ============================================================ -->
<main class="maPage" role="main" id="cuPage">

  <!-- Desktop table -->
  <div class="cuTableWrap">
    <table class="cuTable" id="cuTable">
      <thead>
        <tr>
          <th>Name</th>
          <th>GHIN</th>
          <th>Email</th>
          <th>Mobile Phone</th>
          <th>Contact Method</th>
          <th class="cuRight">Favorites</th>
          <th class="cuRight">Games</th>
          <th>Created</th>
          <th>Last Activity</th>
        </tr>
      </thead>
      <tbody id="cuTbody"></tbody>
    </table>
  </div>

  <!-- Mobile card list -->
  <div class="cuMobileList" id="cuMobileList"></div>

  <!-- Empty state -->
  <div class="maHint" id="cuEmpty" style="display:none;">No users found.</div>

</main>