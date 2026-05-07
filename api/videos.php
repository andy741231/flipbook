<?php
/**
 * Video overlay API
 * GET: Get videos for a flipbook
 * POST: Add a video overlay to a page
 * PUT: Update video position/size
 * DELETE: Remove a video overlay
 */
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        if (!isset($_GET['flipbook_id'])) {
            jsonResponse(['error' => 'flipbook_id required'], 400);
        }
        $stmt = $db->prepare(
            "SELECT * FROM flipbook_videos WHERE flipbook_id = ? ORDER BY page_number"
        );
        $stmt->execute([(int)$_GET['flipbook_id']]);
        jsonResponse(['videos' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);
        $required = ['flipbook_id', 'page_number', 'youtube_url'];
        foreach ($required as $field) {
            if (!isset($input[$field]) || empty($input[$field])) {
                jsonResponse(['error' => "$field is required"], 400);
            }
        }

        // Extract YouTube video ID
        $youtubeUrl = $input['youtube_url'];
        $videoId = extractYouTubeId($youtubeUrl);
        if (!$videoId) {
            jsonResponse(['error' => 'Invalid YouTube URL'], 400);
        }

        $stmt = $db->prepare(
            "INSERT INTO flipbook_videos (flipbook_id, page_number, youtube_url, pos_x_percent, pos_y_percent, width_percent, height_percent) 
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            (int)$input['flipbook_id'],
            (int)$input['page_number'],
            $youtubeUrl,
            (float)($input['pos_x_percent'] ?? 10),
            (float)($input['pos_y_percent'] ?? 10),
            (float)($input['width_percent'] ?? 40),
            (float)($input['height_percent'] ?? 30),
        ]);

        jsonResponse([
            'success' => true,
            'video' => [
                'id' => (int)$db->lastInsertId(),
                'youtube_id' => $videoId,
            ]
        ], 201);
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['id'])) {
            jsonResponse(['error' => 'Video ID required'], 400);
        }

        $fields = [];
        $params = [];

        foreach (['pos_x_percent', 'pos_y_percent', 'width_percent', 'height_percent'] as $f) {
            if (isset($input[$f])) {
                $fields[] = "$f = ?";
                $params[] = (float)$input[$f];
            }
        }
        if (isset($input['page_number'])) {
            $fields[] = "page_number = ?";
            $params[] = (int)$input['page_number'];
        }

        if (empty($fields)) {
            jsonResponse(['error' => 'No fields to update'], 400);
        }

        $params[] = (int)$input['id'];
        $stmt = $db->prepare("UPDATE flipbook_videos SET " . implode(', ', $fields) . " WHERE id = ?");
        $stmt->execute($params);
        jsonResponse(['success' => true]);
        break;

    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['id'])) {
            jsonResponse(['error' => 'Video ID required'], 400);
        }
        $stmt = $db->prepare("DELETE FROM flipbook_videos WHERE id = ?");
        $stmt->execute([(int)$input['id']]);
        jsonResponse(['success' => true]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}

function extractYouTubeId($url) {
    $patterns = [
        '/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/',
        '/^([a-zA-Z0-9_-]{11})$/',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $url, $matches)) {
            return $matches[1];
        }
    }
    return null;
}
