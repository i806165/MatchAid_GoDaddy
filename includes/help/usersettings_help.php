<?php
// /public_html/includes/help/usersettings_help.php
declare(strict_types=1);

return [
    'title' => 'User Settings Help',
    'intro' => 'Manage your user profile.',
    'sections' => [
        [
            'icon'    => 'target',
            'heading' => 'Purpose',
            'body'    => 'User Settings stores the contact and playing-preference information used to support game administration, player communications, registration, and tee selection.',
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
                'First / Last Name — Name for communications.',
                'Email — used when your preferred communications method is Email.',
                'Mobile Phone / Carrier — used when your preferred communications method is SMS.',
                'Preferred Communications Method — the best way for Game Administrators to contact you with game information and alerts.',
                'Preferred playing yardage — helps the application recommend an appropriate tee set when you register for games.'
            ],
        ],
        [
            'icon'    => 'route',
            'heading' => 'Available Actions',
            'bullets' => [
                'Save — saves all field changes.',
                'Cancel — discards unsaved changes and returns to Admin home.',
            ],
        ],
    ],
];

