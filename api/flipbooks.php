<?php
/**
 * Flipbooks API
 * GET: List all flipbooks or get one by id/slug
 * PUT: Update flipbook metadata
 * DELETE: Delete a flipbook
 */
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Get single flipbook by ID
            $stmt = $db->prepare("SELECT * FROM flipbooks WHERE id = ?");
            $stmt->execute([(int)$_GET['id']]);
            $flipbook = $stmt->fetch();
            if (!$flipbook) {
                jsonResponse(['error' => 'Flipbook not found'], 404);
            }
            // Get videos for this flipbook
            $vstmt = $db->prepare("SELECT * FROM flipbook_videos WHERE flipbook_id = ? ORDER BY page_number");
            $vstmt->execute([$flipbook['id']]);
            $flipbook['videos'] = $vstmt->fetchAll();
            jsonResponse($flipbook);

        } elseif (isset($_GET['slug'])) {
            // Get single flipbook by slug
            $stmt = $db->prepare("SELECT * FROM flipbooks WHERE slug = ?");
            $stmt->execute([$_GET['slug']]);
            $flipbook = $stmt->fetch();
            if (!$flipbook) {
                jsonResponse(['error' => 'Flipbook not found'], 404);
            }
            $vstmt = $db->prepare("SELECT * FROM flipbook_videos WHERE flipbook_id = ? ORDER BY page_number");
            $vstmt->execute([$flipbook['id']]);
            $flipbook['videos'] = $vstmt->fetchAll();
            jsonResponse($flipbook);

        } else {
            // List all flipbooks
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = min(50, max(1, (int)($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $countStmt = $db->query("SELECT COUNT(*) FROM flipbooks");
            $total = $countStmt->fetchColumn();

            $stmt = $db->prepare("SELECT * FROM flipbooks ORDER BY created_at DESC LIMIT ? OFFSET ?");
            $stmt->execute([$limit, $offset]);
            $flipbooks = $stmt->fetchAll();

            jsonResponse([
                'flipbooks' => $flipbooks,
                'total' => (int)$total,
                'page' => $page,
                'limit' => $limit,
                'pages' => ceil($total / $limit),
            ]);
        }
        break;

    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['id'])) {
            jsonResponse(['error' => 'Flipbook ID required'], 400);
        }

        $fields = [];
        $params = [];

        if (isset($input['title'])) {
            $fields[] = "title = ?";
            $params[] = trim($input['title']);
        }
        if (isset($input['description'])) {
            $fields[] = "description = ?";
            $params[] = trim($input['description']);
        }
        if (isset($input['toc_json'])) {
            $fields[] = "toc_json = ?";
            $params[] = $input['toc_json'] === null ? null : (string)$input['toc_json'];
        }
        if (isset($input['page_count'])) {
            $fields[] = "page_count = ?";
            $params[] = (int)$input['page_count'];
        }

        if (empty($fields)) {
            jsonResponse(['error' => 'No fields to update'], 400);
        }

        $params[] = (int)$input['id'];
        $sql = "UPDATE flipbooks SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        jsonResponse(['success' => true]);
        break;

    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['id'])) {
            jsonResponse(['error' => 'Flipbook ID required'], 400);
        }

        // Get flipbook to delete file
        $stmt = $db->prepare("SELECT pdf_filename FROM flipbooks WHERE id = ?");
        $stmt->execute([(int)$input['id']]);
        $flipbook = $stmt->fetch();

        if ($flipbook) {
            // Delete PDF file
            $filePath = UPLOAD_DIR . '/' . $flipbook['pdf_filename'];
            if (file_exists($filePath)) {
                @unlink($filePath);
            }
            // Delete from DB (cascades to pages and videos)
            $stmt = $db->prepare("DELETE FROM flipbooks WHERE id = ?");
            $stmt->execute([(int)$input['id']]);
        }

        jsonResponse(['success' => true]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
