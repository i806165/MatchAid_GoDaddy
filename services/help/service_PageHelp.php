<?php
// /public_html/services/help/service_PageHelp.php
declare(strict_types=1);

final class ServicePageHelp
{
    public static function keyFromControllerFile(string $controllerFile): string
    {
        $key = pathinfo($controllerFile, PATHINFO_FILENAME);
        return self::sanitizeKey($key);
    }

    public static function hasHelp(?string $helpKey): bool
    {
        if (empty($helpKey)) {
            return false;
        }
        return is_file(self::helpFileForKey($helpKey));
    }

    public static function renderByKey(?string $helpKey): void
    {
        if (empty($helpKey)) {
            return;
        }

        $helpFile = self::helpFileForKey($helpKey);

        if (!is_file($helpFile)) {
            return;
        }

        $help = require $helpFile;

        if (!is_array($help)) {
            return;
        }

        self::render($help);
    }

    private static function helpFileForKey(string $helpKey): string
    {
        $safeKey = self::sanitizeKey($helpKey);
        return MA_HELP_INCLUDES . '/' . $safeKey . '_help.php';
    }

    private static function sanitizeKey(string $key): string
    {
        return preg_replace('/[^a-zA-Z0-9_\-]/', '', $key) ?? '';
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    // -------------------------------------------------------------------------
    // Top-level render — detects layout and dispatches
    // -------------------------------------------------------------------------

    private static function render(array $help): void
    {
        $title   = self::e((string)($help['title'] ?? 'Help'));
        $intro   = self::e((string)($help['intro'] ?? ''));
        $hasTabs = !empty($help['tabs']) && is_array($help['tabs']);

        ?>
        <div id="maHelpOverlay" class="maModalOverlay" aria-hidden="true">
          <div class="maModal maHelpModal" role="dialog" aria-modal="true" aria-labelledby="maHelpTitle">

            <header class="maModal__hdr">
              <div>
                <div class="maModal__title" id="maHelpTitle"><?= $title ?></div>
                <?php if ($intro !== ''): ?>
                  <div class="maModal__subtitle"><?= $intro ?></div>
                <?php endif; ?>
              </div>
              <button type="button" class="iconBtn btnPrimary" data-help-close aria-label="Close help">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </header>

            <?php if ($hasTabs): ?>
              <?= self::renderTabControls($help['tabs']) ?>
            <?php endif; ?>

            <div class="maModal__body maHelpBody">
              <?php if ($hasTabs): ?>
                <?= self::renderTabPanels($help['tabs']) ?>
              <?php else: ?>
                <?= self::renderSections($help['sections'] ?? []) ?>
              <?php endif; ?>
            </div>

          </div>
        </div>
        <?php
    }

    // -------------------------------------------------------------------------
    // Tab layout — segmented control in maModal__controls
    // -------------------------------------------------------------------------

    private static function renderTabControls(array $tabs): string
    {
        $html  = '<div class="maModal__controls">';
        $html .= '<div class="maSeg maHelpSeg" role="tablist" aria-label="Help sections">';

        foreach ($tabs as $i => $tab) {
            if (!is_array($tab)) { continue; }
            $label   = self::e((string)($tab['label'] ?? 'Tab'));
            $panelId = 'maHelpPanel-' . $i;
            $active  = ($i === 0) ? ' is-active' : '';
            $selected = ($i === 0) ? 'true' : 'false';
            $html .= sprintf(
                '<button type="button" class="maSegBtn%s" role="tab" aria-selected="%s" aria-controls="%s" data-help-tab="%d">%s</button>',
                $active, $selected, $panelId, $i, $label
            );
        }

        $html .= '</div></div>';
        return $html;
    }

    private static function renderTabPanels(array $tabs): string
    {
        $html = '';

        foreach ($tabs as $i => $tab) {
            if (!is_array($tab)) { continue; }
            $panelId = 'maHelpPanel-' . $i;
            $active  = ($i === 0) ? ' is-active' : '';
            $html .= sprintf(
                '<div id="%s" class="maHelpTabPanel%s" role="tabpanel">',
                $panelId, $active
            );
            $html .= self::renderSections($tab['sections'] ?? []);
            $html .= '</div>';
        }

        return $html;
    }

    // -------------------------------------------------------------------------
    // Section renderer — shared by both single-pane and tabbed layouts
    // -------------------------------------------------------------------------

    private static function renderSections(array $sections): string
    {
        $html = '';

        foreach ($sections as $section) {
            if (!is_array($section)) { continue; }

            $html .= '<section class="maHelpSection">';
            $html .= '<div class="maHelpIcon" aria-hidden="true">';
            $html .= self::renderIcon((string)($section['icon'] ?? 'default'));
            $html .= '</div>';
            $html .= '<div class="maHelpSection__content">';

            if (!empty($section['heading'])) {
                $html .= '<h3 class="maHelpSection__title">' . self::e((string)$section['heading']) . '</h3>';
            }

            if (!empty($section['body'])) {
                $html .= '<p class="maHelpSection__body">' . self::e((string)$section['body']) . '</p>';
            }

            if (!empty($section['bullets']) && is_array($section['bullets'])) {
                $html .= self::renderBullets($section['bullets']);
            }

            $html .= '</div></section>';
        }

        return $html;
    }

    // -------------------------------------------------------------------------
    // Bullet renderer — handles plain strings and array bullets with subbullets
    // -------------------------------------------------------------------------

    private static function renderBullets(array $bullets): string
    {
        $html = '<ul class="maHelpList">';

        foreach ($bullets as $bullet) {
            if (is_array($bullet)) {
                $html .= '<li>' . self::e((string)($bullet['bullet'] ?? ''));
                if (!empty($bullet['subbullets']) && is_array($bullet['subbullets'])) {
                    $html .= '<ul class="maHelpSubList">';
                    foreach ($bullet['subbullets'] as $sub) {
                        $html .= '<li>' . self::e((string)$sub) . '</li>';
                    }
                    $html .= '</ul>';
                }
                $html .= '</li>';
            } else {
                $html .= '<li>' . self::e((string)$bullet) . '</li>';
            }
        }

        $html .= '</ul>';
        return $html;
    }

    // -------------------------------------------------------------------------
    // Icon renderer — inline SVG by named key
    // -------------------------------------------------------------------------

    private static function renderIcon(string $icon): string
    {
        return match ($icon) {
            'target' => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
            'list'   => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
            'route'  => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
            'tip'    => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
            'people' => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
            'score'  => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
            default  => '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        };
    }
}