<?php
/**
 * PDF Download API
 * Downloads the original PDF file
 * Note: To embed video thumbnails in PDF, install FPDI library via composer
 */
require_once __DIR__ . '/../includes/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$flipbookId = $_GET['id'] ?? null;
if (!$flipbookId) {
    http_response_code(400);
    echo json_encode(['error' => 'Flipbook ID required']);
    exit;
}

$db = getDB();

// Get flipbook
$stmt = $db->prepare("SELECT * FROM flipbooks WHERE id = ?");
$stmt->execute([(int)$flipbookId]);
$flipbook = $stmt->fetch();

if (!$flipbook) {
    http_response_code(404);
    echo json_encode(['error' => 'Flipbook not found']);
    exit;
}

$pdfPath = UPLOAD_DIR . '/' . $flipbook['pdf_filename'];
if (!file_exists($pdfPath)) {
    http_response_code(404);
    echo json_encode(['error' => 'PDF file not found']);
    exit;
}

// Serve the PDF file
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . basename($flipbook['pdf_filename']) . '"');
header('Content-Length: ' . filesize($pdfPath));
header('Cache-Control: private, max-age=0, must-revalidate');
header('Pragma: public');

readfile($pdfPath);
exit;
