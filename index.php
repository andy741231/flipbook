<?php
/**
 * Dashboard - List all flipbooks
 */
$pageTitle = 'Dashboard';
require_once 'includes/header.php';
?>

<div class="page-header">
    <h1>My Flipbooks</h1>
</div>

<div id="flipbook-list">
    <div class="text-center mt-3">
        <div class="spinner" style="margin: 0 auto;"></div>
        <p class="mt-1" style="color:var(--gray-500);">Loading flipbooks...</p>
    </div>
</div>

<!-- Delete Confirmation Modal -->
<div class="modal-backdrop" id="deleteModal">
    <div class="modal">
        <div class="modal-header">
            <span>Delete Flipbook</span>
            <button class="btn btn-icon btn-ghost" onclick="closeModal('deleteModal')">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <p>Are you sure you want to delete <strong id="deleteTitle"></strong>? This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal('deleteModal')">Cancel</button>
            <button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
        </div>
    </div>
</div>

<!-- Embed Code Modal -->
<div class="modal-backdrop" id="embedModal">
    <div class="modal">
        <div class="modal-header">
            <span>Embed Flipbook</span>
            <button class="btn btn-icon btn-ghost" onclick="closeModal('embedModal')">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <p class="mb-2">Copy and paste this code to embed the flipbook on your website:</p>
            <div class="embed-code" id="embedCode"></div>
            <div class="mt-2">
                <button class="btn btn-primary btn-sm" onclick="copyEmbedCode()">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
            </div>
        </div>
    </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
const BASE_PATH = '<?= BASE_PATH ?>';

async function loadFlipbooks() {
    try {
        const resp = await fetch(`api/flipbooks.php`);
        const data = await resp.json();

        const container = document.getElementById('flipbook-list');

        if (!data.flipbooks || data.flipbooks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No flipbooks yet</h3>
                    <p>Upload a PDF to create your first flipbook.</p>
                    <a href="upload.php" class="btn btn-primary mt-2">
                        <i class="fas fa-plus"></i> Upload PDF
                    </a>
                </div>`;
            return;
        }

        container.innerHTML = '<div class="flipbook-grid">' +
            data.flipbooks.map(fb => {
                const thumbHtml = fb.thumbnail 
                    ? `<img src="${BASE_PATH}/uploads/${fb.thumbnail}" alt="Cover" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<i class=\\'fas fa-file-pdf\\' style=\\'font-size:4rem;color:var(--primary)\\'></i>')">` 
                    : `<i class="fas fa-file-pdf" style="font-size: 4rem; color: var(--primary);"></i>`;
                return `
                <div class="flipbook-card card" onclick="window.location.href='viewer.php?slug=${fb.slug}'">
                    <div class="card-thumbnail">
                        ${thumbHtml}
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-icon" onclick="event.stopPropagation(); showEmbed('${fb.slug}', '${escapeHtml(fb.title)}')" title="Embed">
                            <i class="fas fa-code"></i>
                        </button>
                        <button class="btn btn-icon" onclick="event.stopPropagation(); window.location.href='editor.php?id=${fb.id}'" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-icon" onclick="event.stopPropagation(); confirmDelete(${fb.id}, '${escapeHtml(fb.title)}')" title="Delete" style="color:var(--danger);">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="card-info">
                        <h3>${escapeHtml(fb.title)}</h3>
                        <p>${fb.page_count || 0} pages &middot; ${formatDate(fb.created_at)}</p>
                    </div>
                </div>
            `}).join('') + '</div>';
    } catch (err) {
        document.getElementById('flipbook-list').innerHTML =
            '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading flipbooks</h3><p>' + err.message + '</p></div>';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Delete
let deleteId = null;
function confirmDelete(id, title) {
    deleteId = id;
    document.getElementById('deleteTitle').textContent = title;
    document.getElementById('deleteModal').classList.add('open');
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!deleteId) return;
    try {
        await fetch('api/flipbooks.php', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: deleteId })
        });
        closeModal('deleteModal');
        showToast('Flipbook deleted', 'success');
        loadFlipbooks();
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
});

// Embed
function showEmbed(slug, title) {
    const url = window.location.origin + BASE_PATH + '/viewer.php?slug=' + slug + '&embed=1';
    const code = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen title="${title}"></iframe>`;
    document.getElementById('embedCode').textContent = code;
    document.getElementById('embedModal').classList.add('open');
}

function copyEmbedCode() {
    const text = document.getElementById('embedCode').textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Embed code copied!', 'success');
    });
}

// Modal
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// Click outside modal to close
document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('open');
    });
});

loadFlipbooks();
</script>

<?php require_once 'includes/footer.php'; ?>
