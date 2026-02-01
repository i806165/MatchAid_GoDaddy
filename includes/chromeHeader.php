<?php
// /includes/chromeHeader.php
// Chrome header: brand + left/right action slots + 3 header lines (collapsible)
?>
<header class="maChrome__hdr" role="banner">
  <div class="maChrome__hdrRow">

    <div id="chromeBrandSlot" class="maChrome__brand" aria-label="MatchAid Brand">
      <img src="/assets/images/MatchAidLogoSquare.jpeg" alt="MatchAid" />
    </div>

    <!-- Left page action -->
    <div class="maChrome__hdrLeft">
      <button id="chromeBtnLeft" type="button" class="maChrome__hdrBtn" style="display:none;"></button>
    </div>

    <!-- 3-line centered header text -->
    <div class="maChrome__titles" aria-label="Page header">
      <div id="chromeHdrLine1" class="maChrome__title" style="display:none;"></div>
      <div id="chromeHdrLine2" class="maChrome__subtitle" style="display:none;"></div>
      <div id="chromeHdrLine3" class="maChrome__subtitle2" style="display:none;"></div>
    </div>

    <!-- Right page action -->
    <div class="maChrome__hdrRight">
      <button id="chromeBtnRight" type="button" class="maChrome__hdrBtn" style="display:none;"></button>
    </div>

  </div>
</header>
