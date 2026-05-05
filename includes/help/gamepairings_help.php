<?php
// /public_html/includes/help/gamepairings_help.php
declare(strict_types=1);

return [
    'title' => 'Game Pairings Help',
    'intro' => 'Build competitive playing groups and organize them into matches.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'This page allows the game administrator to build competitive playing groups, and then organize those groups into head-to-head matches (Pair vs Pair games only).',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'The roster must be complete before building pairings — all players must be added and have a tee set assigned.',
                        'Game Settings should be configured before pairing, as the competition type (Pair vs. Field or Pair vs. Pair) determines whether the Match Pairings tab is needed.',
                        'Match Pairings is only required for Pair vs. Pair games. For Pair vs. Field games, only Pair Players is needed.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'This page is used to assemble players into competitive groups of 1-4 players that compete together against the field or together in a match. Refer to the Tee Times page in order to assemble the competitive groups into groups that will play together; same tee time or same shotgun slot.',
                        'Complete the Player Pairings first — Match functionality draws from the completed pairing groups.',
                        'Save after each step — the Save button appears in the footer when there are unsaved changes.',
                        'Changes to the roster after pairings may impact pairings — review pairings and matches after any roster changes.',
                    ],
                ],
            ],
        ],

        // ── PAIR PLAYERS ──────────────────────────────────────────────────────
        [
            'label'    => 'Pairings',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Build the playing groups for the game. Each group becomes a pairing that is used for tee time assignment and score entry. The left tray shows unpaired players; the right canvas shows the completed pairings.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Unpaired players tray (left) — shows all players not yet assigned to a group.',
                            'subbullets' => [
                                'Sort players by Name, HI (handicap index), CH (course handicap), or SO (shots off) using the sort buttons.',
                                'Use the search field to find a specific player quickly.',
                                'Select one or more players using the checkboxes before assigning.',
                            ],
                        ],
                        [
                            'bullet'     => 'Pairings canvas (right) — the completed playing groups.',
                            'subbullets' => [
                                'Each card represents one playing group.',
                                'Cards can be expanded or collapsed using the chevron — collapse all with the button in the panel header.',
                                'Each player row shows name, tee set, handicap index, course handicap, and shots off.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        [
                            'bullet'     => 'Manual pairing — build groups one player at a time from the tray.',
                            'subbullets' => [
                                'Select a player — tap a row in the Unpaired tray to select it. Select multiple players to build a group in one step.',
                                'Assign to pairing — tap Assign to add the selected player(s) to a target group on the canvas, or to create a new group.',
                                'Select a target group — tap a group card on the canvas to set it as the assignment target before assigning.',
                                'Remove a player from a group — tap the edit icon on a pairing card, then tap the remove icon next to the player.',
                                'Disband a group — tap the edit icon on a pairing card, then tap Unpair Group to return all players to the tray.',
                            ],
                        ],
                        [
                            'bullet'     => 'Auto-Pair — use rules to automatically generate groups from unpaired players.',
                            'subbullets' => [
                                'No. of Groups — the number of groups to generate.',
                                'Group Mix — the size composition of the groups (e.g. foursomes, threesomes, mixed).',
                                'Outcome — the balancing method: Balanced (Snake) distributes players by handicap in a snake-draft order.',
                                'Buckets — the number of handicap tiers used when distributing players across groups.',
                                'Tap Run to preview the generated groups. Review the result, then tap Retry to regenerate or Apply to commit.',
                            ],
                        ],
                        'Save — tap Save in the footer to persist all pairing changes.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Sort the Unpaired tray by CH or SO to build balanced groups by course handicap.',
                        'Select multiple players before assigning to create a new group in one step.',
                        'Collapse all cards once groups are built to get a cleaner overview of the canvas.',
                    ],
                ],
            ],
        ],

        // ── MATCH PAIRINGS ────────────────────────────────────────────────────
        [
            'label'    => 'Matches',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Organize completed pairings into head-to-head matches. Each match pairs two groups (Side A vs. Side B). The left tray shows unmatched groups; the right canvas shows assembled matches.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Unmatched tray (left) — playing groups not yet assigned to a match.',
                            'subbullets' => [
                                'Each row represents a completed playing group from the Pair Players tab.',
                                'Use the search field to find a specific group or player.',
                                'Select one or more groups using the checkboxes before assigning.',
                            ],
                        ],
                        [
                            'bullet'     => 'Matches canvas (right) — the assembled head-to-head matches.',
                            'subbullets' => [
                                'Each match card has two slots: Side A and Side B.',
                                'A match is complete when both slots are filled.',
                                'Cards can be expanded or collapsed individually or all at once.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Select a group — tap a row in the Unmatched tray to select it.',
                        'Select multiple groups — select two groups to assign them to opposite sides of a new match in one step.',
                        'Assign to match — tap Assign to place the selected group into a target match slot (Side A or Side B), or to create a new match.',
                        'Select a target slot — tap a Side A or Side B slot on the canvas to set it as the assignment target.',
                        'Remove a group from a match — tap the edit icon on a match card, then tap the remove icon next to the group.',
                        'Disband a match — tap the edit icon on a match card, then tap Unmatch to return both groups to the tray.',
                        'Save — tap Save in the footer to persist all match changes.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Select two groups at once in the tray to create a complete match in one assign operation.',
                        'Matches only appear on this tab for Pair vs. Pair games — if the tab is disabled, adjust the competition type in Game Settings page.',
                        'All playing groups should be paired before moving to Match Pairings — unpaired players cannot be matched.',
                    ],
                ],
            ],
        ],

    ],
];