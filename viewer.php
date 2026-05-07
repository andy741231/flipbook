<?php
/**
 * Flipbook Viewer - The main flipbook reading experience
 */
require_once 'config.php';

$slug = $_GET['slug'] ?? '';
$isEmbed = isset($_GET['embed']) && $_GET['embed'] == '1';

if (empty($slug)) {
    header('Location: ' . BASE_PATH . '/index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flipbook Viewer</title>
    <base href="<?= BASE_PATH ?>/">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="assets/css/app.css">
    <link rel="stylesheet" href="assets/css/viewer.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    </script>
</head>
<body>
    <div class="viewer-wrapper" id="viewerWrapper">
        <!-- Toolbar -->
        <div class="viewer-toolbar" id="viewerToolbar">
            <div class="toolbar-left">
                <?php if (!$isEmbed): ?>
                <a href="index.php" class="btn btn-sm" title="Back to Dashboard">
                    <i class="fas fa-arrow-left"></i>
                </a>
                <?php endif; ?>
                <span class="title" id="viewerTitle">Loading...</span>
            </div>
            <div class="toolbar-center">
                <button class="btn btn-sm" id="btnToc" title="Table of Contents">
                    <i class="fas fa-list"></i>
                </button>
                <div class="viewer-toolbar-sep"></div>
                <button class="btn btn-sm" id="btnPrev" title="Previous Page (←)">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="page-info" id="pageInfo" title="Click to jump to page">-- / --</span>
                <button class="btn btn-sm" id="btnNext" title="Next Page (→)">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <div class="viewer-toolbar-sep"></div>
                <button class="btn btn-sm" id="btnSearch" title="Search (Ctrl+F)">
                    <i class="fas fa-search"></i>
                </button>
            </div>
            <div class="toolbar-right">
                <button class="btn btn-sm sound-toggle" id="btnSound" title="Toggle Sound">
                    <i class="fas fa-volume-up"></i>
                </button>
                <div class="viewer-toolbar-sep"></div>
                <button class="btn btn-sm" id="btnZoomOut" title="Zoom Out">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="page-info" id="zoomLevel" title="Click to reset zoom">100%</span>
                <button class="btn btn-sm" id="btnZoomIn" title="Zoom In">
                    <i class="fas fa-plus"></i>
                </button>
                <div class="viewer-toolbar-sep"></div>
                <button class="btn btn-sm" id="btnFullscreen" title="Fullscreen (F)">
                    <i class="fas fa-expand"></i>
                </button>
                <?php if (!$isEmbed): ?>
                <div class="viewer-toolbar-sep"></div>
                <button class="btn btn-sm" id="btnDownload" title="Download PDF">
                    <i class="fas fa-download"></i>
                </button>
                <button class="btn btn-sm" id="btnEditMode" title="Edit Mode">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm" id="btnEmbed" title="Get Embed Code">
                    <i class="fas fa-code"></i>
                </button>
                <?php endif; ?>
            </div>
        </div>

        <!-- Viewer Body -->
        <div class="viewer-body" id="viewerBody">
            <!-- TOC Panel -->
            <div class="toc-panel" id="tocPanel">
                <div class="toc-panel-header">
                    <span>Table of Contents</span>
                    <div style="display:flex;align-items:center;gap:0.375rem;">
                        <?php if (!$isEmbed): ?>
                        <button class="btn btn-icon btn-ghost btn-sm" id="btnEditToc" title="Edit Table of Contents">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <?php endif; ?>
                        <button class="btn btn-icon btn-ghost btn-sm" onclick="toggleToc()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="toc-list" id="tocList">
                    <p style="padding:1rem;color:var(--gray-500);font-size:0.875rem;">No table of contents available.</p>
                </div>
            </div>

            <!-- Flipbook -->
            <div class="flipbook-stage" id="flipbookStage">
                <div class="flipbook-container" id="flipbookContainer"></div>
            </div>

            <!-- Edit Mode Panel (flex sibling — pushes book left as it opens) -->
            <div class="edit-panel" id="editPanel">
                <div class="edit-panel-inner">
                    <div class="edit-panel-header">
                        <div class="edit-panel-title">
                            <i class="fas fa-pencil-alt"></i>
                            <span>Edit Mode</span>
                        </div>
                        <button class="btn btn-icon btn-sm edit-panel-close" onclick="toggleEditMode()" title="Exit Edit Mode">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="edit-panel-page-badge">
                        <i class="fas fa-file-alt"></i>
                        <span id="editPageLabel">Page 1</span>
                    </div>
                    <div class="edit-panel-body">
                        <button class="btn btn-primary w-full" id="btnAddVideo">
                            <i class="fas fa-video"></i> Add Video to This Page
                        </button>
                        <button class="btn btn-secondary w-full" id="btnAddLink" style="margin-top:0.5rem;">
                            <i class="fas fa-link"></i> Add Link to This Page
                        </button>
                        <div class="edit-tips">
                            <div class="edit-tip"><i class="fas fa-arrows-alt"></i><span>Drag videos to reposition</span></div>
                            <div class="edit-tip"><i class="fas fa-expand-arrows-alt"></i><span>Drag corner handles to resize</span></div>
                            <div class="edit-tip"><i class="fas fa-times-circle"></i><span>Click <strong>×</strong> to delete a video</span></div>
                            <div class="edit-tip warning"><i class="fas fa-lock"></i><span>Page flipping is disabled</span></div>
                        </div>
                    </div>
                    <div class="edit-panel-footer">
                        <button class="btn btn-primary" id="btnSaveEdit">
                            <i class="fas fa-save"></i> Save
                        </button>
                        <button class="btn btn-secondary" id="btnCancelEdit">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            </div>

            <!-- Navigation Arrows -->
            <button class="nav-arrow prev" id="navPrev" title="Previous"><i class="fas fa-chevron-left"></i></button>
            <button class="nav-arrow next" id="navNext" title="Next"><i class="fas fa-chevron-right"></i></button>

            <!-- Edit mode stage banner (absolute within viewer-body) -->
            <div class="edit-mode-banner"><i class="fas fa-pencil-alt"></i> Editing</div>

            <!-- Search Panel -->
            <div class="search-panel" id="searchPanel">
                <div class="search-panel-header">
                    <input type="text" id="searchInput" placeholder="Search in document..." autocomplete="off">
                    <button class="btn btn-icon btn-ghost btn-sm" onclick="toggleSearch()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="search-results" id="searchResults">
                    <p style="padding:1rem;color:var(--gray-500);font-size:0.875rem;">Type to search...</p>
                </div>
            </div>

            <!-- Loading Overlay -->
            <div class="loading-overlay" id="loadingOverlay">
                <div class="loading-book-icon"><i class="fas fa-book-open"></i></div>
                <p id="loadingText">Loading flipbook...</p>
                <div class="loading-bar-wrap">
                    <div class="loading-bar-fill" id="loadingBar"></div>
                </div>
            </div>

            <!-- Cover hint (shown only on page 1) -->
            <div class="cover-hint" id="coverHint">
                <i class="fas fa-hand-point-right"></i>
                <span>Swipe or click to open</span>
            </div>
        </div>
    </div>

    <!-- Embed Modal -->
    <div class="modal-backdrop" id="embedModal">
        <div class="modal">
            <div class="modal-header">
                <span>Embed Flipbook</span>
                <button class="btn btn-icon btn-ghost" onclick="document.getElementById('embedModal').classList.remove('open')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p class="mb-2">Copy this code to embed the flipbook on your website:</p>
                <div class="embed-code" id="embedCodeViewer"></div>
                <div class="mt-2">
                    <button class="btn btn-primary btn-sm" onclick="copyEmbed()">
                        <i class="fas fa-copy"></i> Copy Code
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Add Link Modal -->
    <div class="modal-backdrop" id="addLinkModal">
        <div class="modal add-link-modal">
            <div class="modal-header">
                <div class="add-video-modal-title">
                    <i class="fas fa-link" style="color:var(--primary)"></i>
                    <span>Add Link Overlay</span>
                </div>
                <button class="btn btn-icon btn-ghost" onclick="closeAddLinkModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="addLinkForm">
                    <div class="form-group">
                        <label>URL</label>
                        <input type="url" id="linkUrl" class="form-control" placeholder="https://example.com" autocomplete="off" required>
                    </div>
                    <div class="form-group">
                        <label>Display Label</label>
                        <input type="text" id="linkLabel" class="form-control" placeholder="Click here" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>Place on Page</label>
                        <div class="video-page-input-row">
                            <input type="number" id="linkPage" class="form-control" min="1" required>
                            <span class="video-page-hint" id="linkPageHint">of —</span>
                        </div>
                    </div>
                    <div class="modal-footer-btns">
                        <button type="submit" class="btn btn-primary" id="btnAddLinkSubmit">
                            <i class="fas fa-plus"></i> Add Link
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="closeAddLinkModal()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- TOC Edit Modal -->
    <div class="modal-backdrop" id="tocEditModal">
        <div class="modal toc-edit-modal">
            <div class="modal-header">
                <div class="add-video-modal-title">
                    <i class="fas fa-list" style="color:var(--primary)"></i>
                    <span>Edit Table of Contents</span>
                </div>
                <button class="btn btn-icon btn-ghost" onclick="closeTocEditModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
                <div id="tocEditList"></div>
                <button class="btn btn-secondary w-full mt-1" id="btnAddTocItem" onclick="addTocItem()">
                    <i class="fas fa-plus"></i> Add Item
                </button>
            </div>
            <div class="modal-footer" style="display:flex;gap:0.5rem;padding:1rem;border-top:1px solid var(--gray-200);">
                <button class="btn btn-primary" style="flex:1;" onclick="saveToc()"><i class="fas fa-save"></i> Save</button>
                <button class="btn btn-secondary" style="flex:1;" onclick="closeTocEditModal()">Cancel</button>
            </div>
        </div>
    </div>

    <div class="modal-backdrop" id="addVideoModal">
        <div class="modal add-video-modal">
            <div class="modal-header">
                <div class="add-video-modal-title">
                    <i class="fas fa-video" style="color:var(--primary)"></i>
                    <span>Add YouTube Video</span>
                </div>
                <button class="btn btn-icon btn-ghost" onclick="closeAddVideoModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="addVideoForm">
                    <div class="form-group">
                        <label>YouTube URL</label>
                        <input type="text" id="videoUrl" class="form-control" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" required>
                    </div>
                    <!-- Live preview -->
                    <div class="yt-preview" id="ytPreview">
                        <img id="ytThumb" src="" alt="Video thumbnail">
                        <div class="yt-preview-info">
                            <div class="yt-preview-label"><i class="fas fa-check-circle" style="color:#22c55e"></i> Valid YouTube URL</div>
                            <div class="yt-preview-id" id="ytPreviewId"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Place on Page</label>
                        <div class="video-page-input-row">
                            <input type="number" id="videoPage" class="form-control" min="1" required>
                            <span class="video-page-hint" id="videoPageHint">of —</span>
                        </div>
                        <p class="form-hint">The video will appear at the top-left of the page. Drag to reposition after adding.</p>
                    </div>
                    <div class="modal-footer-btns">
                        <button type="submit" class="btn btn-primary" id="btnAddVideoSubmit" disabled>
                            <i class="fas fa-plus"></i> Add Video
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="closeAddVideoModal()">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <script src="assets/js/flip-sound.js"></script>
    <script src="assets/js/viewer.js"></script>
    <script>
        const SLUG = '<?= addslashes($slug) ?>';
        const BASE = '<?= BASE_PATH ?>';
        const IS_EMBED = <?= $isEmbed ? 'true' : 'false' ?>;
        initViewer(SLUG, BASE, IS_EMBED);
    </script>
</body>
</html>
