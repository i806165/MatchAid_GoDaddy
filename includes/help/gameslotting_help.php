<?php
// /public_html/includes/help/gameslotting_help.php
declare(strict_types=1);

return [
    'title' => 'Game Slotting Help',
    'intro' => 'Assign playing groups to tee times or shotgun starting holes.',
    'tabs'  => [

        // ── OVERVIEW ──────────────────────────────────────────────────────────
        [
            'label'    => 'Overview',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'This page assigns competitve pairings to groups that will play together and their tee slots — either tee times or shotgun starting holes. The left tray shows unassigned groups; the right canvas shows the current slot assignments. The result feeds directly into scorecards and score entry.',
                ],
                [
                    'icon'    => 'people',
                    'heading' => 'Prerequisites',
                    'bullets' => [
                        'Pairings must be complete before slotting — all players must be assigned to a competitive group.',
                        'The tee-off method (Tee Times or Shotgun) that is set in the Game Maintenance page determines the slotting mode on this page.',
                        'For Shotgun games, the number of available holes is determined by the Holes setting in Game Maintenance (All 18, F9, or B9).',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Use Auto Slot in the Actions menu to assign groups in one step.',
                        'Save after completing all assignments — the Save button appears in the footer when there are unsaved changes.',
                        'Use the up/down arrows on each canvas card to reorder groups between adjacent slots without returning them to the tray.',
                        'Changes to pairings after slotting will require re-slotting affected groups.',
                    ],
                ],
            ],
        ],

        // ── SLOTTING ──────────────────────────────────────────────────────────
        [
            'label'    => 'Slotting',
            'sections' => [
                [
                    'icon'    => 'target',
                    'heading' => 'Purpose',
                    'body'    => 'Assign each playing group to a tee time or shotgun starting hole. The tray on the left shows groups waiting to be assigned; the canvas on the right shows all current slot assignments.',
                ],
                [
                    'icon'    => 'list',
                    'heading' => 'Key Fields',
                    'bullets' => [
                        [
                            'bullet'     => 'Unassigned Groups tray (left) — Groups not yet assigned to a slot.',
                            'subbullets' => [
                                'Each row shows the group and the player names in that group.',
                                'Select one or more groups using the checkboxes before assigning.',
                            ],
                        ],
                        [
                            'bullet'     => 'Assigned Groups canvas (right) — the Tee Time/Hole assignments.',
                            'subbullets' => [
                                'Tee Times mode: each card shows the tee time and starting hole (Hole 1, Hole 10, or Split).',
                                'Shotgun mode: each card shows the starting hole and suffix (e.g. Hole 4A, Hole 4B for stacked holes).',
                                'Each card shows the groups and players assigned to that slot.',
                                'Cards can be expanded or collapsed individually or all at once.',
                            ],
                        ],
                    ],
                ],
                [
                    'icon'    => 'route',
                    'heading' => 'Available Actions',
                    'bullets' => [
                        [
                            'bullet'     => 'Manual slotting — assign groups to slots one at a time.',
                            'subbullets' => [
                                'Select a group — tap a row in the tray to select it. Select multiple groups to assign them together.',
                                'Assign — tap Assign to place the selected group(s) into the next available slot, or into a targeted slot.',
                                'Target a specific slot — tap the edit icon on a canvas card to set it as the target, then assign from the tray.',
                                'Remove a group from a slot — tap the delete icon on a group row inside a canvas card to return it to the tray.',
                                'Unslot an entire card — tap the unslot icon on a card header to return all groups in that slot to the tray.',
                                'Reorder slots — use the up/down arrows on a card header to move the group to the adjacent earlier or later slot.',
                            ],
                        ],
                        [
                            'bullet'     => 'Auto Slot (Actions menu) — automatically assign all unassigned groups to slots.',
                            'subbullets' => [
                                'Sort Order — controls the order in which groups are assigned to slots: As Paired, by Low HI, by High HC, Balanced / Interleaved, or Randomly.',
                                'Tee Times mode: set Start Time, Interval (minutes between tee times), and Start Hole (Hole 1, Hole 10, or Split for All 18 games).',
                                'Shotgun mode: set Start Hole and select which holes to Stack. The info line shows how many stacks are needed to accommodate all groups.',
                                'Tap Run to preview the generated assignments. Review the result, then tap Retry to regenerate or Apply to commit.',
                            ],
                        ],
                        'Reset Changes — available in the Actions menu. Discards all unsaved changes and restores the last saved state.',
                        'Save — tap Save in the footer to persist all slot assignments.',
                    ],
                ],
                [
                    'icon'    => 'tip',
                    'heading' => 'Tips',
                    'bullets' => [
                        'Auto Slot with Balanced / Interleaved sort places the lowest and highest handicap groups alternately across slots — useful for mixed-ability fields.',
                        'For Shotgun games, check the stacks info line before running — it tells you exactly how many holes need to be stacked to fit all groups.',
                        'Split start (Tee Times mode) alternates groups between Hole 1 and Hole 10 — only available for All 18 games.',
                        'After Auto Slot, use the up/down arrows to fine-tune the order without unslotting and re-assigning.',
                        'On mobile, use the + Add Playing Group button to open the tray as an overlay.',
                    ],
                ],
            ],
        ],

    ],
];