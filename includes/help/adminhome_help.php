<?php
// /public_html/includes/help/adminhome_help.php
declare(strict_types=1);

return [
    'title' => 'Admin Portal Help',
    'intro' => 'The entry point to create and manage your games.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'The Admin Portal is the central hub for game management. It shows a filtered list of games you administer or have access to, and provides direct access to every stage of the game workflow — from setup through scoring.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'You must be logged in as a Site Admin, Facility Admin, or Game Admin to see and manage games here.',
                        'Games created by other admins at your facility appear when you filter by All or use Advanced Filters to select specific admins.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'The default view shows your current and upcoming games (today through the next 30 days) — use the Actions menu presets to quickly switch between views.',
                        'Tap or click any game card to open the game action menu — all game workflow steps are accessible from there.',
                        'Use Advanced Filters when you need to find games across a specific date range or games managed by a specific admin.',
                        'The + Add New Game button is always visible at the bottom of the page — use it to start a new game without opening the Actions menu.',
                    ],
                ],
            ],
        ],

        // ── GAMES LIST ────────────────────────────────────────────────────────
        [
            'label'    => 'Games List',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Each card in the list represents one game. The card shows the key details at a glance and provides access to the full game action menu. Tap or click any card — or the Manage button — to open the menu.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        'Date badge — the play date displayed as month, day, and weekday.',
                        'Game title and GGID — the name and unique identifier for the game.',
                        'Course and facility — where the game is being played.',
                        'Play time and holes — the scheduled tee-off time and hole configuration (All 18, F9, or B9).',
                        'Registered count — the number of players registered out of the total available slots (e.g. 8/16).',
                        'Visibility — who can see the game: Only Me, Players, Buddies, or Club.',
                        'Admin name — the game administrator shown in the card header.',
                        'Course not confirmed warning — a flag appears on the card if the course has not been confirmed in Game Maintenance.',
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        [
                            'bullet'     => 'Game action menu — tap or click any card (or the Manage button) to open the menu for that game.',
                            'subbullets' => [
                                'Edit Game — opens Game Maintenance to update the game shell (title, course, date, tee-off method, visibility).',
                                'Adjust Settings — opens Game Settings to configure scoring format, handicap rules, and competition structure.',
                                'Select Players — opens the Game Players roster page.',
                                'Pair Players — opens the Game Pairings page to build playing groups and matches.',
                                'Assign Tee Times — opens the Game Slotting page to assign groups to tee times or shotgun holes.',
                                'View Game Summary — opens the game summary with scores and standings.',
                                'Pre-Game Scorecards — generates printable scorecards for the game.',
                                'Add Game to Calendar — adds the game to your device calendar.',
                                'Send Message to Players — opens the messaging tool to notify enrolled players.',
                                'Delete the Game — permanently removes the game. This cannot be undone.',
                            ],
                        ],
                        [
                            'bullet'     => 'Actions menu (header) — global actions and filter presets.',
                            'subbullets' => [
                                'Add Game — starts a new game in Game Maintenance.',
                                'Import Games — opens the game import tool.',
                                'My Current Games — shows your games from today forward (next 30 days).',
                                'My Past Games — shows your games from the past 30 days.',
                                'All Current Games — shows all admins\' current games at your facility.',
                                'All Past Games — shows all admins\' past games at your facility.',
                                'Advanced Filters — opens the filter modal for custom date ranges and admin selection.',
                            ],
                        ],
                        '+ Add New Game — a persistent page-level button that opens Game Maintenance in Add mode without going through the Actions menu.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'The Manage button on each card (desktop) is a shortcut to the same game action menu as tapping the card.',
                        'A course not confirmed warning on a card means the game\'s course has not been locked in — return to Game Maintenance to confirm it before adding players.',
                        'The registered count (e.g. 8/16) helps you see at a glance whether a game still has capacity.',
                        'Delete Game requires confirmation — it cannot be undone and will remove all associated players, pairings, and scores.',
                    ],
                ],
            ],
        ],

        // ── FILTERS ───────────────────────────────────────────────────────────
        [
            'label'    => 'Filters',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Filters control which games appear in the list. Use the Actions menu presets for quick access to common views, or use Advanced Filters for precise control over date ranges and admin selection.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Filter presets (Actions menu) — one-tap shortcuts to common game views.',
                            'subbullets' => [
                                'My Current Games: your games from today forward.',
                                'My Past Games: your games from the past 30 days.',
                                'All Current Games: all admins\' upcoming games at your facility.',
                                'All Past Games: all admins\' past games at your facility.',
                            ],
                        ],
                        [
                            'bullet'     => 'Advanced Filters modal — Date tab.',
                            'subbullets' => [
                                'From / To — set a custom date range. Use the calendar icon to open the native date picker.',
                                'Apply — runs the query with the selected date range and current admin selection.',
                                'Cancel / Close — reverts the filter inputs to the last applied state without refreshing.',
                            ],
                        ],
                        [
                            'bullet'     => 'Advanced Filters modal — Admin tab.',
                            'subbullets' => [
                                'Admin list — shows all admins at your facility. Tap any row to include or exclude that admin\'s games.',
                                'Search — filter the admin list by name.',
                                'Select All — tap the checkbox icon in the header to select or deselect all admins at once.',
                                'Select Favorites — tap the heart icon in the header to select only your favorite admins.',
                                'Heart icon on each row — tap to add or remove that admin from your favorites list.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        'Apply — saves the current filter selections and refreshes the games list.',
                        'Cancel — closes the filter modal and reverts any unsaved filter changes.',
                        'Switch tabs — use the Date and Admin segmented control inside the filter modal to switch between date and admin filtering.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Admin selection changes inside the modal are not applied until you tap Apply — clicking away or tapping Cancel reverts your choices.',
                        'Favoriting an admin (heart icon) is persistent — it saves across sessions and is reflected in the Select Favorites shortcut.',
                        'Use All Current Games as a quick facility-wide check before a busy weekend.',
                        'If the games list is empty, check your date range first — the most common cause is a date window that doesn\'t include the game you\'re looking for.',
                    ],
                ],
            ],
        ],

    ],
];