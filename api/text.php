<?php
/**
 * Text extraction API
 * POST: Save extracted text for flipbook pages (sent from client after PDF.js extraction)
 * GET: Search text across pages
 */
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {
    case 'POST':
        // Save extracted text from client-side PDF.js processing
        $input = json_decode(file_get_contents('php://input'), true);

        if (!isset($input['flipbook_id']) || !isset($input['pages'])) {
            jsonResponse(['error' => 'flipbook_id and pages required'], 400);
        }

        $flipbookId = (int)$input['flipbook_id'];

        // Verify flipbook exists
        $stmt = $db->prepare("SELECT id FROM flipbooks WHERE id = ?");
        $stmt->execute([$flipbookId]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => 'Flipbook not found'], 404);
        }

        $db->beginTransaction();
        try {
            // Delete existing text for this flipbook
            $db->prepare("DELETE FROM flipbook_pages WHERE flipbook_id = ?")->execute([$flipbookId]);

            // Insert new text
            $stmt = $db->prepare(
                "INSERT INTO flipbook_pages (flipbook_id, page_number, text_content) VALUES (?, ?, ?)"
            );

            foreach ($input['pages'] as $page) {
                $stmt->execute([
                    $flipbookId,
                    (int)$page['page_number'],
                    $page['text'] ?? ''
                ]);
            }

            // Update page count
            $db->prepare("UPDATE flipbooks SET page_count = ? WHERE id = ?")
               ->execute([count($input['pages']), $flipbookId]);

            $db->commit();
            jsonResponse(['success' => true, 'pages_saved' => count($input['pages'])]);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Failed to save text: ' . $e->getMessage()], 500);
        }
        break;

    case 'GET':
        if (!isset($_GET['flipbook_id'])) {
            jsonResponse(['error' => 'flipbook_id required'], 400);
        }

        $flipbookId = (int)$_GET['flipbook_id'];

        if (isset($_GET['q']) && !empty(trim($_GET['q']))) {
            // Search within flipbook
            $query = '%' . trim($_GET['q']) . '%';
            $stmt = $db->prepare(
                "SELECT page_number, text_content FROM flipbook_pages 
                 WHERE flipbook_id = ? AND text_content LIKE ?
                 ORDER BY page_number"
            );
            $stmt->execute([$flipbookId, $query]);
            $results = $stmt->fetchAll();

            // Highlight matches
            $searchTerm = trim($_GET['q']);
            foreach ($results as &$r) {
                $pos = stripos($r['text_content'], $searchTerm);
                if ($pos !== false) {
                    $start = max(0, $pos - 50);
                    $r['snippet'] = '...' . substr($r['text_content'], $start, strlen($searchTerm) + 100) . '...';
                }
            }

            jsonResponse(['results' => $results, 'query' => $searchTerm]);
        } else {
            // Get all text for flipbook
            $stmt = $db->prepare(
                "SELECT page_number, text_content FROM flipbook_pages 
                 WHERE flipbook_id = ? ORDER BY page_number"
            );
            $stmt->execute([$flipbookId]);
            jsonResponse(['pages' => $stmt->fetchAll()]);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
