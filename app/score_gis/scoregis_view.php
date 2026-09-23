<?php
// /public_html/app/score_gis/scoregis_view.php
?>

<div class="maControlArea maControlArea--bare isHidden" id="gisControlArea" role="region" aria-label="Course GIS controls">
    <div class="scoreHoleNavInner">
        <button id="gisPrevHoleBtn" class="btn btnSecondary" type="button">Prev</button>
        <select id="gisHoleSelect" class="maTextInput scoreHoleSelect" aria-label="Hole"></select>
        <button id="gisNextHoleBtn" class="btn btnSecondary" type="button">Next</button>
    </div>
</div>

<main class="maPage" role="main">
    <div class="maCards">
        <section class="maCard" aria-label="Course GPS">
            <div class="maCard__body">
                <div id="scoreGisModuleHost"></div>
            </div>
        </section>
    </div>
</main>
