<?php
// /public_html/includes/mobile_carriers.php
declare(strict_types=1);

/**
 * MatchAid mobile carrier SMS gateway map.
 *
 * IMPORTANT:
 * Keep this shape:
 *
 *   "Carrier Display Name" => "@gateway-domain.com"
 *
 * ServiceUserContext expects each value to be a string gateway.
 * Do not change values to arrays unless buildUserSettingsPayload()
 * and save validation are also updated.
 */
return [
    // Major U.S. carriers
    "AT&T"              => "@txt.att.net", 
    "AT&T Wireless"     => "@txt.att.net",       // AT&T email-to-text support may be deprecated/limited
    "Verizon"           => "@vtext.com",        // Verizon legacy email-to-text may be deprecated/limited
    "T-Mobile"          => "@tmomail.net",
    "Sprint PCS"        => "@messaging.sprintpcs.com",
    // Common U.S. regional / prepaid / MVNO carriers
    "US Cellular"       => "@email.uscc.net",
    "Google Fi"         => "@msg.fi.google.com",
    "Boost Mobile"      => "@myboostmobile.com",
    "Metro by T-Mobile" => "@mymetropcs.com",
    "Cricket Wireless"  => "@sms.cricketwireless.net",
    "Consumer Cellular" => "@mailmymobile.net",
    "Straight Talk"     => "@vtext.com",        // Often Verizon-backed; may vary by underlying network
    "Tracfone"          => "@mmst5.tracfone.com",
    "Mint Mobile"       => "@tmomail.net",      // T-Mobile network
    "Visible"           => "@vtext.com",        // Verizon network
    "Xfinity Mobile"    => "@vtext.com",        // Verizon network
    "Spectrum Mobile"   => "@vtext.com",        // Verizon network
    // Legacy/common listings
    "Virgin Mobile"     => "@vmobl.com",
    "Nextel"            => "@messaging.nextel.com",
    // Twilio listings
    "AT&T Mobility"                => "@txt.att.net",
    "Verizon Wireless"             => "@vtext.com",
    "T-Mobile USA"                 => "@tmomail.net",
    "Sprint Spectrum"              => "@tmomail.net",  // merged into T-Mobile
    "Nextel Communications"        => "@tmomail.net",  // merged into T-Mobile
    "United States Cellular Corp"  => "@email.uscc.net",
];