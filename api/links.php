<?php
/**
 * Link Overlays API
 * GET:    ?flipbook_id=X  — fetch all link overlays for a flipbook
 * POST:   create a new link overlay
 * PUT:    update position / size / url / label
 * DELETE: remove a link overlay
 */
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

switch ($method) {

    // ------------------------------------------------------------------ GET
    case 'GET':
        if (!isset($_GET['flipbook_id'])) {
            jsonResponse(['error' => 'flipbook_id required'], 400);
        }
        $stmt = $db->prepare(
            "SELECT * FROM flipbook_links WHERE flipbook_id = ? ORDER BY page_number, id"
        );
        $stmt->execute([(int)$_GET['flipbook_id']]);
        jsonResponse(['links' => $stmt->fetchAll()]);
        break;

    // ----------------------------------------------------------------- POST
    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);
        $required = ['flipbook_id', 'page_number', 'url'];
        foreach ($required as $f) {
            if (empty($input[$f])) {
                jsonResponse(['error' => "$f is required"], 400);
            }
        }

        $stmt = $db->prepare("
            INSERT INTO flipbook_links
                (flipbook_id, page_number, url, label,
                 pos_x_percent, pos_y_percent, width_percent, height_percent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            (int)$input['flipbook_id'],
            (int)$input['page_number'],
            trim($input['url']),
            trim($input['label'] ?? 'Click here'),
            (float)($input['pos_x_percent']  ?? 10),
            (float)($input['pos_y_percent']  ?? 10),
            (float)($input['width_percent']  ?? 20),
            (float)($input['height_percent'] ?? 6),
        ]);

        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()]);
        break;

    // ------------------------------------------------------------------ PUT
    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['id'])) {
            jsonResponse(['error' => 'id required'], 400);
        }

        $fields = [];
        $params = [];

        $updatable = ['url', 'label', 'page_number',
                      'pos_x_percent', 'pos_y_percent',
                      'width_percent',  'height_percent'];

        foreach ($updatable as $col) {
            if (isset($input[$col])) {
                $fields[] = "$col = ?";
                $params[] = is_string($input[$col]) ? trim($input[$col]) : $input[$col];
            }
        }

        if (empty($fields)) {
            jsonResponse(['error' => 'Nothing to update'], 400);
        }

        $params[] = (int)$input['id'];
        $db->prepare("UPDATE flipbook_links SET " . implode(', ', $fields) . " WHERE id = ?")
           ->execute($params);

        jsonResponse(['success' => true]);
        break;

    // --------------------------------------------------------------- DELETE
    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['id'])) {
            jsonResponse(['error' => 'id required'], 400);
        }
        $db->prepare("DELETE FROM flipbook_links WHERE id = ?")
           ->execute([(int)$input['id']]);
        jsonResponse(['success' => true]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
