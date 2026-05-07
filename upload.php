<?php
/**
 * Upload page - Create a new flipbook from PDF
 */
$pageTitle = 'Upload PDF';
require_once 'includes/header.php';
?>

<div class="upload-container">
    <div class="page-header">
        <h1>Create New Flipbook</h1>
    </div>

    <!-- PDF.js for Thumbnail Generation -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    </script>

    <div class="card">
        <div class="card-body">
            <form id="uploadForm">
                <div class="form-group">
                    <label for="title">Title</label>
                    <input type="text" id="title" name="title" class="form-control" placeholder="Enter flipbook title">
                </div>

                <div class="form-group">
                    <label for="description">Description (optional)</label>
                    <textarea id="description" name="description" class="form-control" placeholder="Brief description of this flipbook"></textarea>
                </div>

                <div class="form-group">
                    <label>PDF File</label>
                    <div class="upload-zone" id="uploadZone">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h3>Drag & drop your PDF here</h3>
                        <p>or click to browse files (max 100MB)</p>
                        <input type="file" id="pdfFile" accept=".pdf" style="display:none;">
                    </div>
                    <div id="fileInfo" class="mt-1" style="display:none;">
                        <div class="d-flex align-center gap-1">
                            <i class="fas fa-file-pdf" style="color:var(--danger);"></i>
                            <span id="fileName"></span>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="clearFile()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="upload-progress" id="uploadProgress">
                    <div class="progress-bar">
                        <div class="progress-bar-fill" id="progressFill"></div>
                    </div>
                    <p class="progress-text" id="progressText">Uploading...</p>
                </div>

                <div class="mt-2">
                    <button type="submit" class="btn btn-primary btn-lg w-full" id="uploadBtn">
                        <i class="fas fa-upload"></i> Create Flipbook
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<div class="toast-container" id="toastContainer"></div>

<script>
const BASE_PATH = '<?= BASE_PATH ?>';
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('pdfFile');
const uploadForm = document.getElementById('uploadForm');
let selectedFile = null;
let generatedThumbnail = null;

// Drag & drop
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length && files[0].type === 'application/pdf') {
        handleFile(files[0]);
    } else {
        showToast('Please select a PDF file', 'error');
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
});

function handleFile(file) {
    selectedFile = file;
    document.getElementById('fileName').textContent = file.name + ' (' + formatSize(file.size) + ')';
    document.getElementById('fileInfo').style.display = 'block';
    uploadZone.style.display = 'none';

    // Auto-fill title from filename if empty
    const titleInput = document.getElementById('title');
    if (!titleInput.value) {
        titleInput.value = file.name.replace('.pdf', '').replace(/[-_]/g, ' ');
    }

    // Generate thumbnail
    generateThumbnail(file);
}

async function generateThumbnail(file) {
    try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedArray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            generatedThumbnail = canvas.toDataURL('image/jpeg', 0.8);
        };
        fileReader.readAsArrayBuffer(file);
    } catch (e) {
        console.error('Error generating thumbnail:', e);
    }
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    document.getElementById('fileInfo').style.display = 'none';
    uploadZone.style.display = '';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Upload
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) {
        showToast('Please select a PDF file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('title', document.getElementById('title').value);
    formData.append('description', document.getElementById('description').value);
    if (generatedThumbnail) {
        formData.append('cover_image', generatedThumbnail);
    }

    const progressEl = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadBtn = document.getElementById('uploadBtn');

    progressEl.classList.add('active');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Uploading...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api/upload.php');

    function handleUploadError(msg) {
        showToast(msg, 'error');
        progressEl.classList.remove('active');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Create Flipbook';
    }

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = `Uploading... ${pct}%`;
        }
    });

    xhr.onload = function() {
        try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                progressText.textContent = 'Upload complete! Redirecting...';
                showToast('Flipbook created successfully!', 'success');
                setTimeout(() => {
                    window.location.href = 'viewer.php?slug=' + data.flipbook.slug;
                }, 1000);
            } else {
                handleUploadError(data.error || 'Upload failed');
            }
        } catch (e) {
            handleUploadError('Invalid server response');
        }
    };

    xhr.onerror = function() {
        handleUploadError('Network error - please check your connection');
    };

    xhr.send(formData);
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
</script>

<?php require_once 'includes/footer.php'; ?>
