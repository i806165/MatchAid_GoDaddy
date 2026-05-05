<?php
// /public_html/includes/help/gamemaint_help.php
declare(strict_types=1);

return [
    'title' => 'Game Maintenance Help',
    'intro' => 'Create or update the core setup for a game.',
    'sections' => [
        [
            'icon'    => 'target',
            'heading' => 'Purpose',
            'body'    => 'This page defines the game shell — the foundational record that all other game activity builds on. Set it up first before adding players, building pairings, or assigning tee times.',
        ],
        [
            'icon'    => 'people',
            'heading' => 'Prerequisites',
            'bullets' => [
                'None',
            ],
        ],
        [
            'icon'    => 'list',
            'heading' => 'Key Fields',
            'bullets' => [
                'Title — identifies the event for admins and players.',
                'Course — the facility and course where the game is played. Use Change Course to search or select from recent courses. Mark as Confirmed when the venue is locked in.',
                'Play Date / Play Time — controls when the game appears to players and sets the base time for tee time generation.',
                'Tee Off Method — Tee Times staggers groups at intervals from the play time; Shotgun starts all groups simultaneously from different holes.',
                'Tee Time Count / Slot Count — the number of groups the game supports.',
                'Tee Time Interval — minutes between tee times (Tee Times mode only). A live preview of generated times appears below the field.',
                'Holes — All 18, Front 9, or Back 9.',
                'Visibility — controls who can see the game in the Player Portal: Only Me, Players, Buddies, or Club.',
                'Comments — optional notes visible to the game admin.',
            ],
        ],
        [
            'icon'    => 'route',
            'heading' => 'Available Actions',
            'bullets' => [
                'Save — saves all field changes.',
                'Cancel — discards unsaved changes and returns to Admin home.',
                'Change Course — opens the course picker to search or select courses.',
                'Confirmed / Tentative — toggles the course confirmation status. Allows early player enrollment even when the course is not yet finalized.',
            ],
        ],
        [
            'icon'    => 'tip',
            'heading' => 'Tips',
            'bullets' => [
                'Complete the game shell and save before moving to the Roster or Pairings steps.',
                'Set Visibility appropriately so the game is discoverable by the correct audience.',
                'Establish games early to accomodate early player enrollment. Tee times and course selection are easily adjusted',
                'If players are already enrolled, changing the course will trigger automatic tee re-assignment.  Check results',
                'Use Game Import feature to add multiple games',
            ],
        ],
    ],
];