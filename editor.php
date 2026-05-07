<?php
/**
 * Editor - Manage flipbook (add video overlays, edit metadata)
 */
require_once 'config.php';

$flipbookId = $_GET['id'] ?? '';
if (empty($flipbookId)) {
    header('Location: ' . BASE_PATH . '/index.php');
    exit;
}

$pageTitle = 'Edit Flipbook';
require_once 'includes/header.php';
?>

<div class="page-header">
    <h1>Edit Flipbook</h1>
    <a href="index.php" class="btn btn-secondary btn-sm">
        <i class="fas fa-arrow-left"></i> Back
    </a>
</div>

<div id="editorApp">
    <div class="text-center mt-3">
        <div class="spinner" style="margin:0 auto;"></div>
        <p class="mt-1" style="color:var(--gray-500);">Loading...</p>
    </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<!-- Add Video Modal -->
<div class="modal-backdrop" id="addVideoModal">
    <div class="modal">
        <div class="modal-header">
            <span>Add YouTube Video</span>
            <button class="btn btn-icon btn-ghost" onclick="closeModal('addVideoModal')">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>YouTube URL</label>
                <input type="text" id="videoUrl" class="form-control" placeholder="https://www.youtube.com/watch?v=...">
            </div>
            <div class="form-group">
                <label>Page Number</label>
                <input type="number" id="videoPage" class="form-control" min="1" value="1">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                    <label>X Position (%)</label>
                    <input type="number" id="videoPosX" class="form-control" min="0" max="100" value="10">
                </div>
                <div class="form-group">
                    <label>Y Position (%)</label>
                    <input type="number" id="videoPosY" class="form-control" min="0" max="100" value="10">
                </div>
                <div class="form-group">
                    <label>Width (%)</label>
                    <input type="number" id="videoWidth" class="form-control" min="10" max="100" value="40">
                </div>
                <div class="form-group">
                    <label>Height (%)</label>
                    <input type="number" id="videoHeight" class="form-control" min="10" max="100" value="30">
                </div>
            </div>
            <div id="videoPreview" style="display:none;margin-top:1rem;">
                <img id="videoThumb" style="width:100%;border-radius:var(--radius);">
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('addVideoModal')">Cancel</button>
            <button class="btn btn-primary" id="saveVideoBtn">
                <i class="fas fa-plus"></i> Add Video
            </button>
        </div>
    </div>
</div>

<script>
const BASE_PATH = '<?= BASE_PATH ?>';
const FLIPBOOK_ID = <?= (int)$flipbookId ?>;
let flipbookData = null;
let videos = [];

async function loadEditor() {
    try {
        const resp = await fetch(`api/flipbooks.php?id=${FLIPBOOK_ID}`);
        if (!resp.ok) throw new Error('Flipbook not found');
        flipbookData = await resp.json();
        videos = flipbookData.videos || [];
        renderEditor();
    } catch (err) {
        document.getElementById('editorApp').innerHTML =
            `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

function renderEditor() {
    const app = document.getElementById('editorApp');
    app.innerHTML = `
        <div class="editor-grid">
            <!-- Metadata Card -->
            <div class="card">
                <div class="card-header">Flipbook Details</div>
                <div class="card-body">
                    <form id="metadataForm">
                        <div class="form-group">
                            <label>Title</label>
                            <input type="text" id="editTitle" class="form-control" value="${escapeAttr(flipbookData.title)}">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="editDescription" class="form-control">${escapeHtml(flipbookData.description || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>PDF File</label>
                            <p style="font-size:0.875rem;color:var(--gray-600);">
                                <i class="fas fa-file-pdf" style="color:var(--danger);"></i>
                                ${escapeHtml(flipbookData.pdf_filename || 'No file')}
                            </p>
                        </div>
                        <div class="form-group">
                            <label>Pages</label>
                            <p style="font-size:0.875rem;color:var(--gray-600);">${flipbookData.page_count || 'Not yet counted'}</p>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                        <a href="viewer.php?slug=${flipbookData.slug}" class="btn btn-secondary" style="margin-left:0.5rem;">
                            <i class="fas fa-eye"></i> View Flipbook
                        </a>
                    </form>
                </div>
            </div>

            <!-- Videos Card -->
            <div class="card">
                <div class="card-header">
                    <span>Video Overlays</span>
                    <button class="btn btn-primary btn-sm" onclick="openAddVideo()">
                        <i class="fas fa-plus"></i> Add Video
                    </button>
                </div>
                <div class="card-body" id="videosList">
                    ${renderVideoList()}
                </div>
            </div>
        </div>

        <!-- Embed Code Card -->
        <div class="card mt-2">
            <div class="card-header">Embed Code</div>
            <div class="card-body">
                <p style="margin-bottom:0.75rem;font-size:0.875rem;color:var(--gray-600);">Use this code to embed the flipbook on other websites:</p>
                <div class="embed-code">${generateEmbedCode()}</div>
                <button class="btn btn-primary btn-sm mt-1" onclick="copyEmbedCode()">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
            </div>
        </div>
    `;

    // Metadata form
    document.getElementById('metadataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await fetch('api/flipbooks.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: FLIPBOOK_ID,
                    title: document.getElementById('editTitle').value,
                    description: document.getElementById('editDescription').value,
                })
            });
            showToast('Saved successfully!', 'success');
        } catch (err) {
            showToast('Failed to save: ' + err.message, 'error');
        }
    });
}

function renderVideoList() {
    if (videos.length === 0) {
        return '<p style="color:var(--gray-500);font-size:0.875rem;">No video overlays added yet. Click "Add Video" to place a YouTube video on a page.</p>';
    }

    return videos.map(v => {
        const ytId = extractYouTubeId(v.youtube_url);
        return `
        <div class="video-list-item">
            <div class="video-thumb">
                ${ytId ? `<img src="https://img.youtube.com/vi/${ytId}/default.jpg" alt="Video">` : ''}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:500;">Page ${v.page_number}</div>
                <div style="color:var(--gray-500);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(v.youtube_url)}</div>
            </div>
            <button class="btn btn-icon btn-ghost" onclick="deleteVideo(${v.id})" title="Remove" style="color:var(--danger);">
                <i class="fas fa-trash"></i>
            </button>
        </div>`;
    }).join('');
}

function generateEmbedCode() {
    const url = window.location.origin + BASE_PATH + '/viewer.php?slug=' + flipbookData.slug + '&embed=1';
    return escapeHtml(`<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen title="${flipbookData.title}"></iframe>`);
}

function copyEmbedCode() {
    const url = window.location.origin + BASE_PATH + '/viewer.php?slug=' + flipbookData.slug + '&embed=1';
    const code = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen title="${flipbookData.title}"></iframe>`;
    navigator.clipboard.writeText(code).then(() => showToast('Copied!', 'success'));
}

// Add video
function openAddVideo() {
    document.getElementById('videoUrl').value = '';
    document.getElementById('videoPage').value = '1';
    document.getElementById('videoPage').max = flipbookData.page_count || 999;
    document.getElementById('videoPosX').value = '10';
    document.getElementById('videoPosY').value = '10';
    document.getElementById('videoWidth').value = '40';
    document.getElementById('videoHeight').value = '30';
    document.getElementById('videoPreview').style.display = 'none';
    document.getElementById('addVideoModal').classList.add('open');
}

// Preview video thumbnail
document.getElementById('videoUrl').addEventListener('input', function() {
    const ytId = extractYouTubeId(this.value);
    const preview = document.getElementById('videoPreview');
    if (ytId) {
        document.getElementById('videoThumb').src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
});

document.getElementById('saveVideoBtn').addEventListener('click', async () => {
    const url = document.getElementById('videoUrl').value.trim();
    const page = parseInt(document.getElementById('videoPage').value);

    if (!url) { showToast('Please enter a YouTube URL', 'error'); return; }
    if (!extractYouTubeId(url)) { showToast('Invalid YouTube URL', 'error'); return; }
    if (!page || page < 1) { showToast('Invalid page number', 'error'); return; }

    try {
        const resp = await fetch('api/videos.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                flipbook_id: FLIPBOOK_ID,
                page_number: page,
                youtube_url: url,
                pos_x_percent: parseFloat(document.getElementById('videoPosX').value),
                pos_y_percent: parseFloat(document.getElementById('videoPosY').value),
                width_percent: parseFloat(document.getElementById('videoWidth').value),
                height_percent: parseFloat(document.getElementById('videoHeight').value),
            })
        });

        const data = await resp.json();
        if (data.success) {
            closeModal('addVideoModal');
            showToast('Video added!', 'success');
            loadEditor(); // Reload to get fresh data
        } else {
            showToast(data.error || 'Failed to add video', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

async function deleteVideo(id) {
    if (!confirm('Remove this video overlay?')) return;
    try {
        await fetch('api/videos.php', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        showToast('Video removed', 'success');
        loadEditor();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

function extractYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

// Utilities
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}
function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
});

loadEditor();
</script>

<?php require_once 'includes/footer.php'; ?>
