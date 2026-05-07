<?php
/**
 * PDF Upload API
 * POST: Upload a PDF file and create a flipbook
 */
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

// Validate file upload
if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds server upload limit',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds form upload limit',
        UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
    ];
    $code = $_FILES['pdf']['error'] ?? UPLOAD_ERR_NO_FILE;
    jsonResponse(['error' => $errors[$code] ?? 'Upload failed'], 400);
}

$file = $_FILES['pdf'];

// Validate extension
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ALLOWED_EXTENSIONS)) {
    jsonResponse(['error' => 'Only PDF files are allowed'], 400);
}

// Validate size
if ($file['size'] > MAX_UPLOAD_SIZE) {
    jsonResponse(['error' => 'File exceeds maximum size of ' . (MAX_UPLOAD_SIZE / 1024 / 1024) . 'MB'], 400);
}

// Get title from POST or filename
$title = trim($_POST['title'] ?? pathinfo($file['name'], PATHINFO_FILENAME));
$description = trim($_POST['description'] ?? '');

// Generate unique slug
$slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($title));
$slug = trim($slug, '-');
if (empty($slug)) {
    $slug = 'flipbook';
}

// Ensure slug uniqueness
$db = getDB();
$stmt = $db->prepare("SELECT COUNT(*) FROM flipbooks WHERE slug = ? OR slug LIKE ?");
$stmt->execute([$slug, $slug . '-%']);
$count = $stmt->fetchColumn();
if ($count > 0) {
    $slug .= '-' . ($count + 1);
}

// Create upload directory if needed
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

// Save file with unique name
$filename = $slug . '_' . time() . '.pdf';
$destPath = UPLOAD_DIR . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    jsonResponse(['error' => 'Failed to save uploaded file'], 500);
}

// Handle cover image if provided
$thumbnailFilename = null;
if (!empty($_POST['cover_image'])) {
    $data = $_POST['cover_image'];
    if (preg_match('/^data:image\/(\w+);base64,/', $data, $type)) {
        $data = substr($data, strpos($data, ',') + 1);
        $type = strtolower($type[1]); // jpg, png, etc.

        if (in_array($type, ['jpg', 'jpeg', 'png'])) {
            $data = base64_decode($data);
            if ($data !== false) {
                $thumbnailFilename = $slug . '_' . time() . '_cover.' . $type;
                file_put_contents(UPLOAD_DIR . '/' . $thumbnailFilename, $data);
            }
        }
    }
}

// Insert into database
try {
    $stmt = $db->prepare(
        "INSERT INTO flipbooks (title, slug, description, pdf_filename, thumbnail) VALUES (?, ?, ?, ?, ?)"
    );
    $stmt->execute([$title, $slug, $description, $filename, $thumbnailFilename]);
    $flipbookId = $db->lastInsertId();

    jsonResponse([
        'success' => true,
        'flipbook' => [
            'id' => (int)$flipbookId,
            'title' => $title,
            'slug' => $slug,
            'pdf_filename' => $filename,
        ]
    ], 201);
} catch (PDOException $e) {
    // Clean up uploaded file on DB error
    @unlink($destPath);
    jsonResponse(['error' => 'Failed to create flipbook: ' . $e->getMessage()], 500);
}
