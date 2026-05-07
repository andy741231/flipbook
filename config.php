<?php
/**
 * Flipbook App Configuration
 */

// Auto-detect base path from the document root and script location.
// Works on both local dev (localhost:8000) and production IIS (/apps/flipbook).
// You can manually override by setting BASE_PATH_OVERRIDE environment variable.
(function() {
    // Manual override for production (uncomment if auto-detection fails on IIS)
    // $base = '/apps/flipbook';
    $base = getenv('BASE_PATH_OVERRIDE') ?: '';
    
    // Auto-detect production vs local
    if (empty($base)) {
        $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
        // If on localhost, use empty base path
        if (strpos($host, 'localhost') !== false || strpos($host, '127.0.0.1') !== false) {
            $base = '';
        }
        // If on production domain, use production path
        elseif (strpos($host, 'uhph.uh.edu') !== false || strpos($host, 'cougarnet.uh.edu') !== false) {
            $base = '/apps/flipbook';
        }
    }
    
    // Auto-detect if not manually set
    if (empty($base)) {
        // Try using PHP_SELF or SCRIPT_NAME for IIS compatibility
        $scriptPath = $_SERVER['PHP_SELF'] ?? $_SERVER['SCRIPT_NAME'] ?? '';
        if ($scriptPath) {
            // Extract directory from script path
            $scriptDir = dirname($scriptPath);
            // Remove trailing slash
            $base = rtrim($scriptDir, '/\\');
        }
        
        // Fallback: Try DOCUMENT_ROOT method for Apache
        if (empty($base) || $base === '.') {
            $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_FILENAME'] ?? ''));
            $docRoot   = str_replace('\\', '/', rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/'));
            if ($docRoot && strpos($scriptDir, $docRoot) === 0) {
                $base = substr($scriptDir, strlen($docRoot));
            }
        }
        
        // Walk up from the current script to the app root (config.php is at app root)
        $appRoot = str_replace('\\', '/', dirname(__FILE__));
        $docRoot = str_replace('\\', '/', rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/'));
        if ($docRoot && strpos($appRoot, $docRoot) === 0) {
            $base = substr($appRoot, strlen($docRoot));
        }
    }
    
    define('BASE_PATH', rtrim($base, '/'));
})();

// Database configuration
define('DB_HOST', 'uhph-server1.cougarnet.uh.edu');
define('DB_PORT', 3306);
define('DB_NAME', 'flipbook');
define('DB_USER', 'web_app');
define('DB_PASS', 'UHPH@2025_again');

// Upload settings
define('UPLOAD_DIR', __DIR__ . '/uploads');
define('MAX_UPLOAD_SIZE', 100 * 1024 * 1024); // 100MB
define('ALLOWED_EXTENSIONS', ['pdf']);

// App settings
define('APP_NAME', 'Flipbook');
define('APP_VERSION', '1.0.0');
