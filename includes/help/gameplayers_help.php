<?php
// /public_html/includes/help/gameplayers_help.php
declare(strict_types=1);

return [
    'title' => 'Game Players Help',
    'intro' => 'Manage the roster for this game — add, update, and remove players.',
    'sections' => [
        [
            'icon'    => 'target',
            'heading' => 'Purpose',
            'body'    => 'This page builds and manages the player roster for the game. Each player must be assigned a tee set before they can be included in pairings or scoring. Complete the roster before moving to the Pairings step.',
        ],
        [
            'icon'    => 'people',
            'heading' => 'Prerequisites',
            'bullets' => [
                'A game must be established before players can be added.',
                'Game Settings may or may not be configured at this point. A roster can be built in advance of finalizing settings.',
            ],
        ],
        [
            'icon'    => 'list',
            'heading' => 'Key Fields',
            'bullets' => [
                [
                    'bullet'     => 'Roster tab — all currently enrolled players with their assigned tee set.',
                    'subbullets' => [
                        'Each row shows the player name, GHIN number, handicap index, and tee assignment.',
                    ],
                ],
                'Self tab — your own player record, pre-filled from your logged-in GHIN identity.',
                [
                    'bullet'     => 'Favorites tab — your personally saved players list.',
                    'subbullets' => [
                        'Filterable by player name or by favorite group.',
                        'Supports single-player and batch (multi-select) add.',
                    ],
                ],
                'GHIN tab — search across all GHIN-registered players by name, state, or club.',
                'Non-Rated tab — players who do not have a GHIN number. A placeholder GHIN is assigned automatically.',
                [
                    'bullet'     => 'Import tab — bulk-add players (desktop only).',
                    'subbullets' => [
                        'Enter or paste a list of GHIN numbers.',
                        'Copy the entire roster from a previous game.',
                    ],
                ],
                'Tee Set — each player must have a tee set assigned. The system attempts automatic resolution based on gender and handicap index; you can override manually.',
            ],
        ],
        [
            'icon'    => 'route',
            'heading' => 'Available Actions',
            'bullets' => [
                'Add a player — available from the Self, Favorites, GHIN, Non-Rated, and Import tabs. Each triggers the tee picker to confirm the tee assignment before saving.',
                'Remove a player — tap the delete icon on any roster row. If the player is in a pairing, shot calculations are automatically recalculated.',
                'Save / remove a favorite — tap the heart icon on any roster row to add or remove that player from your personal favorites list.',
                'Change a tee assignment — tap the tee badge on any roster row to reopen the tee picker for that player.',
                'Batch add from Favorites — use Select mode to choose multiple favorites, then add them in one operation. A fallback tee is chosen once for the batch; the system attempts individual tee resolution for each player first.',
                'Import from GHIN list — paste one GHIN number per line, validate, then commit all in one step.',
                'Import from existing game — select a previous game to copy its roster. Tee assignments are resolved automatically using a three-tier hierarchy; a fallback tee covers any that cannot be resolved.',
                'Actions > Game Settings — navigates to advanced game configuration.',
            ],
        ],
        [
            'icon'    => 'tip',
            'heading' => 'Tips',
            'bullets' => [
                'Add all players before building pairings — removing a paired player triggers recalculation but may leave incomplete groups.',
                'Use the Favorites tab for regular playing groups; use GHIN search for one-off additions.',
                'When importing from an existing game, the tee hierarchy attempts to carry over each player\'s previous tee assignment. Use Force Assign in the tee picker to override the hierarchy and apply one tee to everyone.',
                'The Import tab is only available on wider screens (tablet and desktop).',
            ],
        ],
    ],
];