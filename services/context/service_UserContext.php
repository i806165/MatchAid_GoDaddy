<?php
declare(strict_types=1);
// /public_html/services/context/service_UserContext.php

final class ServiceUserContext {
    
    public static function setScorerContext(string $ghin): void {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $_SESSION['SessionScorerGHIN'] = trim($ghin);
    }

    /**
     * Priority: 
     * 1. Specifically selected Scorer for this session
     * 2. The Logged-in user identity
     */
    public static function getEffectivePlayerGHIN(): ?string {
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        $ghin = $_SESSION['SessionScorerGHIN'] ?? $_SESSION['SessionGHINLogonID'] ?? null;
        return ($ghin !== null && trim((string)$ghin) !== "") ? trim((string)$ghin) : null;
    }
}