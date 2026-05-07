/**
 * Flipbook Viewer - Core JavaScript
 * Handles PDF rendering, page flipping, search, TOC, links, sound, and video overlays.
 */

// ============================================================
// State
// ============================================================
let pdfDoc = null;
let flipbook = null;
let flipbookData = null;
let pageCanvases = [];
let pageTexts = [];
let totalPages = 0;
let currentSpread = 0; // 0-indexed spread (pair of pages)
let scale = 1.5;
let zoomLevel = 100;
let soundEnabled = true;
let fitScale = 1;
let resizeTimer = null;
let searchOpen = false;
let tocOpen = false;
let pageFlipInstance = null;
let videoOverlays = [];
let searchDebounce = null;
let basePath = '';
let isEmbedMode = false;
let editMode = false;
let editPanelOpen = false;
let draggedVideo = null;
let dragStartX = 0;
let dragStartY = 0;
let resizingVideo = null;
let resizeHandle = null;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;
let resizeStartLeft = 0;
let resizeStartTop = 0;
// Pending edits: map of videoId -> {pos_x_percent, pos_y_percent, width_percent, height_percent}
let pendingEdits = {};
// Pending deletes: set of videoIds to delete
let pendingDeletes = new Set();
// Pending adds: array of new video objects (not yet saved)
let pendingAdds = [];

// Link overlays
let linkOverlays = [];
let pendingLinkEdits = {};
let pendingLinkDeletes = new Set();
let pendingLinkAdds = [];

// Custom TOC (editable)
let customToc = null;     // null = use PDF outline; array = custom items
let tocEditBuffer = [];   // working copy while editing

// Search highlighting
let lastSearchQuery = '';

// Web Audio API sound generator (loaded from flip-sound.js)
let flipSoundGen = null;

// ============================================================
// Initialize
// ============================================================
async function initViewer(slug, base, embed) {
    basePath = base;
    isEmbedMode = embed;

    // Init audio (Web Audio API)
    try {
        flipSoundGen = new FlipSoundGenerator();
    } catch(e) { /* audio not supported */ }

    // Load flipbook data from API
    try {
        const resp = await fetch(`api/flipbooks.php?slug=${encodeURIComponent(slug)}`);
        if (!resp.ok) throw new Error('Flipbook not found');
        flipbookData = await resp.json();

        document.getElementById('viewerTitle').textContent = flipbookData.title;
        document.title = flipbookData.title + ' - Flipbook';

        videoOverlays = flipbookData.videos || [];

        // Load link overlays
        try {
            const lr = await fetch(`api/links.php?flipbook_id=${flipbookData.id}`);
            if (lr.ok) { const ld = await lr.json(); linkOverlays = ld.links || []; }
        } catch(e) { console.warn('Could not load links:', e); }

        // Parse custom TOC if present
        if (flipbookData.toc_json) {
            try { customToc = JSON.parse(flipbookData.toc_json); } catch(e) { customToc = null; }
        }

        // Load PDF
        if (flipbookData.pdf_filename) {
            await loadPDF(`uploads/${flipbookData.pdf_filename}`);
        } else {
            throw new Error('No PDF file associated with this flipbook');
        }
    } catch (err) {
        document.getElementById('loadingText').textContent = 'Error: ' + err.message;
        console.error('Viewer init error:', err);
    }
}

// ============================================================
// PDF Loading & Rendering
// ============================================================
async function loadPDF(url) {
    updateLoading('Loading PDF...', 5);

    const loadingTask = pdfjsLib.getDocument(url);
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;

    updateLoading('Rendering pages...', 10);

    // Calculate page dimensions from first page
    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const pageRatio = viewport.width / viewport.height;

    // Fixed high-quality render size — CSS will scale to fit the viewport
    let pageWidth, pageHeight;
    if (pageRatio >= 1) {
        // Landscape page
        pageWidth = 900;
        pageHeight = Math.round(900 / pageRatio);
    } else {
        // Portrait page
        pageHeight = 1000;
        pageWidth = Math.round(1000 * pageRatio);
    }

    const renderScale = pageHeight / viewport.height * 1.5; // Higher res for quality

    // Render all pages to canvases
    pageCanvases = [];
    pageTexts = [];

    for (let i = 1; i <= totalPages; i++) {
        updateLoading(`Rendering page ${i} of ${totalPages}...`, 10 + (i / totalPages) * 80);

        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: renderScale });

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        pageCanvases.push(canvas);

        // Extract text
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map(item => ({
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height
        }));
        const fullText = textContent.items.map(item => item.str).join(' ');
        pageTexts.push({ items: textItems, fullText, viewport: vp, rawTextContent: textContent });
    }

    updateLoading('Finalizing...', 95);

    // Extract TOC / outline
    await loadOutline();

    // Extract and store text for server-side search
    saveTextToServer();

    // Initialize the page flip
    initPageFlip(Math.round(pageWidth), Math.round(pageHeight));

    // Fit to viewport and watch for future resizes
    fitFlipbookToContainer();
    const stageEl = document.getElementById('flipbookStage');
    if (window.ResizeObserver) {
        // Watch the stage: its width shrinks when the edit panel opens as a flex sibling
        new ResizeObserver(() => fitFlipbookToContainer()).observe(stageEl);
    } else {
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(fitFlipbookToContainer, 150);
        });
    }

    updateLoading('Ready!', 100);
    // Brief pause so 100% is visible before hiding
    await new Promise(r => setTimeout(r, 300));

    // Hide loading
    document.getElementById('loadingOverlay').style.display = 'none';

    // Setup controls
    setupControls();

    // Show cover hint on page 1
    showCoverHint();

    // Show keyboard hint briefly
    showKeyboardHint();
}

function updateLoading(text, progress) {
    const el = document.getElementById('loadingText');
    if (el) el.textContent = text;
    if (progress !== undefined) {
        const bar = document.getElementById('loadingBar');
        if (bar) bar.style.width = Math.round(progress) + '%';
    }
}

// ============================================================
// Fit flipbook to available stage size (CSS scale, no re-render)
// ============================================================
function fitFlipbookToContainer() {
    const stage = document.getElementById('flipbookStage');
    const container = document.getElementById('flipbookContainer');
    if (!stage || !container || !container.dataset.baseWidth) return;

    const baseW = parseFloat(container.dataset.baseWidth);
    const baseH = parseFloat(container.dataset.baseHeight);
    const padding = 32;
    // Use stage dimensions — they shrink naturally when the edit panel opens as a flex sibling
    const availW = stage.clientWidth - padding;
    const availH = stage.clientHeight - padding;

    fitScale = Math.min(availW / baseW, availH / baseH);
    applyZoom();
}

// ============================================================
// Page Flip Initialization (using CSS + JS approach)
// ============================================================
function initPageFlip(pageW, pageH) {
    const container = document.getElementById('flipbookContainer');
    container.innerHTML = '';
    container.style.width = (pageW * 2) + 'px';
    container.style.height = pageH + 'px';
    container.dataset.baseWidth = pageW * 2;
    container.dataset.baseHeight = pageH;

    // Create the book element
    const bookEl = document.createElement('div');
    bookEl.id = 'flipBook';
    bookEl.className = 'flip-book';
    bookEl.style.width = (pageW * 2) + 'px';
    bookEl.style.height = pageH + 'px';
    container.appendChild(bookEl);

    // Create page elements
    for (let i = 0; i < totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-wrapper';
        pageDiv.style.position = 'relative';
        pageDiv.setAttribute('data-page', i + 1);

        // Canvas as image
        const img = document.createElement('img');
        img.src = pageCanvases[i].toDataURL('image/jpeg', 0.92);
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.display = 'block';
        img.draggable = false;
        pageDiv.appendChild(img);

        // Add annotation (link) layer
        addAnnotationLayer(pageDiv, i);

        // Add text selection layer
        addTextLayer(pageDiv, i);

        // Add video overlays if any
        addVideoOverlays(pageDiv, i + 1, pageW, pageH);

        // Add link overlays if any
        addLinkOverlays(pageDiv, i + 1);

        // Page number
        const pageNum = document.createElement('div');
        pageNum.className = 'page-number-indicator ' + (i % 2 === 0 ? 'right' : 'left');
        pageNum.textContent = i + 1;
        pageDiv.appendChild(pageNum);

        bookEl.appendChild(pageDiv);
    }

    // Initialize StPageFlip
    loadPageFlipLibrary(() => {
        pageFlipInstance = new St.PageFlip(bookEl, {
            width: pageW,
            height: pageH,
            size: 'fixed',
            minWidth: 200,
            maxWidth: pageW,
            minHeight: 200,
            maxHeight: pageH,
            maxShadowOpacity: 0.5,
            showCover: true,
            mobileScrollSupport: true,
            usePortrait: false,
            startPage: 0,
            drawShadow: true,
            flippingTime: 800,
            useMouseEvents: true,
            swipeDistance: 30,
            showPageCorners: false,
            disableFlipByClick: true,
        });

        // Load pages
        const pages = bookEl.querySelectorAll('.page-wrapper');
        pageFlipInstance.loadFromHTML(pages);

        // Events
        pageFlipInstance.on('flip', (e) => {
            playFlipSound();
            updatePageInfo(e.data);
        });

        pageFlipInstance.on('changeState', (e) => {
            // Update navigation state
        });

        updatePageInfo(0);
    });
}

function loadPageFlipLibrary(callback) {
    if (typeof St !== 'undefined' && St.PageFlip) {
        callback();
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js';
    script.onload = callback;
    script.onerror = () => {
        // Fallback: use simple page-by-page navigation
        console.warn('PageFlip library failed to load, using fallback navigation');
        initFallbackNavigation();
    };
    document.head.appendChild(script);
}

// Fallback if page-flip library fails
function initFallbackNavigation() {
    const container = document.getElementById('flipbookContainer');
    container.innerHTML = '';

    let currentPage = 0;

    const pageEl = document.createElement('div');
    pageEl.className = 'page-wrapper';
    pageEl.style.width = '100%';
    pageEl.style.height = '100%';
    container.appendChild(pageEl);

    function showPage(idx) {
        if (idx < 0 || idx >= totalPages) return;
        currentPage = idx;
        pageEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = pageCanvases[idx].toDataURL('image/jpeg', 0.92);
        img.style.width = '100%';
        img.style.height = '100%';
        pageEl.appendChild(img);
        updatePageInfo(idx);
    }

    window._fbNext = () => { playFlipSound(); showPage(currentPage + 1); };
    window._fbPrev = () => { playFlipSound(); showPage(currentPage - 1); };
    window._fbGoTo = (p) => { playFlipSound(); showPage(p); };
    window._fbCurrent = () => currentPage;

    showPage(0);
}

// ============================================================
// Annotations (Links) Layer
// ============================================================

// Blocks mousedown/touchstart from bubbling up to StPageFlip so it
// doesn't start a flip animation when the user clicks a PDF link.
function stopFlipEvents(el) {
    const stop = (e) => { e.stopPropagation(); };
    el.addEventListener('mousedown',  stop);
    el.addEventListener('mouseup',    stop);
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('touchend',   stop, { passive: true });
}

async function addTextLayer(pageDiv, pageIndex) {
    const pageData = pageTexts[pageIndex];
    if (!pageData || !pageData.rawTextContent) return;

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.inset = '0';
    textLayerDiv.style.zIndex = '5'; // Above canvas, below annotations
    textLayerDiv.style.pointerEvents = 'auto'; // allow text selection
    
    // Stop flip events on the text layer so dragging to select text doesn't turn the page
    stopFlipEvents(textLayerDiv);
    
    // The canvas was rendered at a higher scale for quality, but its CSS size is constrained by pageDiv.
    // The textLayer must be positioned using a viewport that matches the CSS size of pageDiv.
    try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        const unscaledVp = page.getViewport({ scale: 1 });
        const container = document.getElementById('flipbookContainer');
        const targetHeight = parseFloat(container.dataset.baseHeight);
        const targetScale = targetHeight / unscaledVp.height;
        const textVp = page.getViewport({ scale: targetScale });
        
        // Ensure the textLayer perfectly covers the pageDiv
        textLayerDiv.style.width = textVp.width + 'px';
        textLayerDiv.style.height = textVp.height + 'px';
        
        pageDiv.appendChild(textLayerDiv);

        if (pdfjsLib.renderTextLayer) {
            pdfjsLib.renderTextLayer({
                textContentSource: pageData.rawTextContent,
                container: textLayerDiv,
                viewport: textVp,
                textDivs: []
            });
        }
    } catch(e) {
        console.warn('Failed to render text layer on page', pageIndex + 1, e);
    }
}

async function addAnnotationLayer(pageDiv, pageIndex) {
    try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        const annotations = await page.getAnnotations();
        const vp = page.getViewport({ scale: 1 });

        if (annotations.length === 0) return;

        const layer = document.createElement('div');
        layer.className = 'page-annotation-layer';
        layer.style.position = 'absolute';
        layer.style.inset = '0';

        const scaleX = 1 / vp.width;
        const scaleY = 1 / vp.height;

        annotations.forEach(ann => {
            if (!ann.rect) return;

            const [x1, y1, x2, y2] = ann.rect;
            const left = (x1 * scaleX * 100).toFixed(2) + '%';
            const width = ((x2 - x1) * scaleX * 100).toFixed(2) + '%';
            const height = ((y2 - y1) * scaleY * 100).toFixed(2) + '%';
            const top = ((1 - y2 * scaleY) * 100).toFixed(2) + '%';

            if (ann.url) {
                // External link
                const a = document.createElement('a');
                a.href = ann.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.style.cssText = `position:absolute;left:${left};top:${top};width:${width};height:${height};`;
                a.title = ann.url;
                // Prevent StPageFlip from starting a flip on mousedown over a link
                stopFlipEvents(a);
                layer.appendChild(a);
            } else if (ann.dest || ann.action) {
                // Internal link (TOC anchor or goto page)
                const link = document.createElement('div');
                link.className = 'internal-link';
                link.style.cssText = `position:absolute;left:${left};top:${top};width:${width};height:${height};`;

                // Resolve destination eagerly so goToPage fires synchronously on click
                const destPromise = ann.dest
                    ? resolveDestination(ann.dest)
                    : (ann.action?.dest ? resolveDestination(ann.action.dest) : Promise.resolve(null));

                // Cache the result so click handler is synchronous
                let cachedDest = null;
                destPromise.then(d => { cachedDest = d; });

                // Prevent StPageFlip from starting a flip on mousedown over a link
                stopFlipEvents(link);

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (cachedDest !== null) {
                        goToPage(cachedDest);
                    } else {
                        // Fallback: resolve now if not yet cached
                        destPromise.then(d => { if (d !== null) goToPage(d); });
                    }
                });
                layer.appendChild(link);
            }
        });

        pageDiv.appendChild(layer);
    } catch(e) {
        // Annotations may not be available for some pages
    }
}

async function resolveDestination(dest) {
    try {
        if (typeof dest === 'string') {
            const d = await pdfDoc.getDestination(dest);
            if (d) {
                const ref = d[0];
                const pageIdx = await pdfDoc.getPageIndex(ref);
                return pageIdx; // 0-based
            }
        } else if (Array.isArray(dest)) {
            const ref = dest[0];
            const pageIdx = await pdfDoc.getPageIndex(ref);
            return pageIdx;
        }
    } catch(e) {}
    return null;
}

// ============================================================
// Table of Contents (Outline)
// ============================================================
async function loadOutline() {
    // If a custom TOC was saved, render it and skip PDF outline
    if (customToc && customToc.length > 0) {
        renderCustomToc();
        const btn = document.getElementById('btnToc');
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; }
        return;
    }

    try {
        const outline = await pdfDoc.getOutline();
        if (!outline || outline.length === 0) {
            const btn = document.getElementById('btnToc');
            if (btn) {
                btn.disabled = true;
                btn.title = 'No table of contents available';
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
            }
            return;
        }

        const tocList = document.getElementById('tocList');
        tocList.innerHTML = '';

        await renderOutlineItems(outline, tocList, 1);
    } catch(e) {
        console.warn('Failed to load outline:', e);
    }
}

function renderCustomToc() {
    const tocList = document.getElementById('tocList');
    if (!tocList) return;
    tocList.innerHTML = '';
    (customToc || []).forEach(item => {
        const div = document.createElement('div');
        const level = item.level || 1;
        div.className = 'toc-item level-' + level;
        div.setAttribute('data-page', item.page - 1);
        div.innerHTML = `<span>${escapeHtml(item.title)}</span><span class="toc-page">${item.page}</span>`;
        div.addEventListener('click', () => { goToPage(item.page - 1); toggleToc(); });
        tocList.appendChild(div);
    });
}

async function renderOutlineItems(items, container, level) {
    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'toc-item level-' + Math.min(level, 3);

        let pageNum = '';
        if (item.dest) {
            const destPage = await resolveDestination(item.dest);
            if (destPage !== null) {
                pageNum = destPage + 1;
                div.setAttribute('data-page', destPage);
                div.addEventListener('click', () => {
                    goToPage(destPage);
                    toggleToc();
                });
            }
        }

        div.innerHTML = `<span>${escapeHtml(item.title)}</span><span class="toc-page">${pageNum}</span>`;
        container.appendChild(div);

        if (item.items && item.items.length > 0) {
            await renderOutlineItems(item.items, container, level + 1);
        }
    }
}

// ============================================================
// Video Overlays
// ============================================================
async function loadVideos() {
    try {
        const resp = await fetch(`api/videos.php?flipbook_id=${flipbookData.id}`);
        if (resp.ok) {
            const data = await resp.json();
            videoOverlays = data.videos || [];
        }
    } catch (e) {
        console.warn('Failed to load videos:', e);
    }
}

function renderVideoOverlays() {
    // Remove existing video overlays
    document.querySelectorAll('.video-overlay').forEach(el => el.remove());

    // Re-add videos to all pages
    document.querySelectorAll('.page-wrapper').forEach(pageDiv => {
        const pageNum = parseInt(pageDiv.dataset.page);
        if (pageNum) {
            addVideoOverlays(pageDiv, pageNum, 0, 0);
        }
    });

    // Re-enable edit controls if in edit mode
    if (editMode) {
        enableVideoDragging();
    }
}

function addVideoOverlays(pageDiv, pageNumber, pageW, pageH) {
    const videos = videoOverlays.filter(v => parseInt(v.page_number) === pageNumber);
    videos.forEach(video => {
        const overlay = document.createElement('div');
        overlay.className = 'page-video-overlay video-overlay';
        overlay.dataset.videoId = video.id;
        overlay.style.left = video.pos_x_percent + '%';
        overlay.style.top = video.pos_y_percent + '%';
        overlay.style.width = video.width_percent + '%';
        overlay.style.height = video.height_percent + '%';

        const youtubeId = extractYouTubeId(video.youtube_url);
        if (!youtubeId) return;

        // Thumbnail background
        const thumbBg = document.createElement('div');
        thumbBg.className = 'video-thumb-bg';
        thumbBg.style.backgroundImage = `url(https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg)`;
        overlay.appendChild(thumbBg);

        // Play button trigger
        const playTrigger = document.createElement('div');
        playTrigger.className = 'video-play-trigger';
        playTrigger.innerHTML = '<i class="fas fa-play-circle"></i><span>Click to play</span>';
        playTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!editMode) {
                overlay.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
            }
        });
        overlay.appendChild(playTrigger);

        pageDiv.appendChild(overlay);
    });
}

// ============================================================
// Link Overlays
// ============================================================
function renderLinkOverlays() {
    document.querySelectorAll('.link-overlay').forEach(el => el.remove());
    document.querySelectorAll('.page-wrapper').forEach(pageDiv => {
        const pageNum = parseInt(pageDiv.dataset.page);
        if (pageNum) addLinkOverlays(pageDiv, pageNum);
    });
    if (editMode) enableVideoDragging();
}

async function loadLinks() {
    try {
        const resp = await fetch(`api/links.php?flipbook_id=${flipbookData.id}`);
        if (resp.ok) { const d = await resp.json(); linkOverlays = d.links || []; }
    } catch(e) { console.warn('Failed to load links:', e); }
}

function addLinkOverlays(pageDiv, pageNumber) {
    const links = linkOverlays.filter(l => parseInt(l.page_number) === pageNumber);
    links.forEach(link => {
        const overlay = document.createElement('div');
        overlay.className = 'link-overlay';
        overlay.dataset.linkId = link.id;
        overlay.style.left   = link.pos_x_percent  + '%';
        overlay.style.top    = link.pos_y_percent   + '%';
        overlay.style.width  = link.width_percent   + '%';
        overlay.style.height = link.height_percent  + '%';
        overlay.innerHTML = `<i class="fas fa-external-link-alt"></i> <span>${escapeHtml(link.label || 'Click here')}</span>`;
        overlay.title = link.url;

        overlay.addEventListener('click', e => {
            e.stopPropagation();
            if (!editMode) window.open(link.url, '_blank', 'noopener,noreferrer');
        });
        stopFlipEvents(overlay);
        pageDiv.appendChild(overlay);
    });
}

function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

// ============================================================
// Sound Effect
// ============================================================
function playFlipSound() {
    if (!soundEnabled || !flipSoundGen) return;
    try {
        flipSoundGen.play();
    } catch(e) {}
}

// ============================================================
// Navigation
// ============================================================
function goToPage(pageIndex) {
    // pageIndex is 0-based; use turnToPage for reliable programmatic navigation
    if (pageFlipInstance) {
        pageFlipInstance.turnToPage(pageIndex);
        updatePageInfo(pageIndex);
    } else if (window._fbGoTo) {
        window._fbGoTo(pageIndex);
    }
    // Close search/TOC panels so the book is visible after navigating
    if (searchOpen) toggleSearch();
    if (tocOpen) toggleToc();
}

function showPageJumpPopover(anchor) {
    // Remove any existing popover
    const existing = document.getElementById('pageJumpPopover');
    if (existing) { existing.remove(); return; }

    const pop = document.createElement('div');
    pop.id = 'pageJumpPopover';
    pop.className = 'page-jump-popover';
    pop.innerHTML = `
        <span class="page-jump-label">Go to page</span>
        <input type="number" id="pageJumpInput" class="page-jump-input" min="1" max="${totalPages}" placeholder="1–${totalPages}">
        <button class="page-jump-go">Go</button>
    `;

    // Position below the anchor
    const rect = anchor.getBoundingClientRect();
    pop.style.top = (rect.bottom + 6) + 'px';
    pop.style.left = (rect.left + rect.width / 2) + 'px';
    document.body.appendChild(pop);

    const input = document.getElementById('pageJumpInput');
    input.focus();

    const commit = () => {
        const page = parseInt(input.value);
        if (!isNaN(page) && page >= 1 && page <= totalPages) goToPage(page - 1);
        pop.remove();
    };

    pop.querySelector('.page-jump-go').addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') pop.remove();
    });

    // Click outside to close
    setTimeout(() => {
        document.addEventListener('click', function outside(e) {
            if (!pop.contains(e.target) && e.target !== anchor) {
                pop.remove();
                document.removeEventListener('click', outside);
            }
        });
    }, 0);
}

function flipNext() {
    if (pageFlipInstance) {
        pageFlipInstance.flipNext();
    } else if (window._fbNext) {
        window._fbNext();
    }
}

function flipPrev() {
    if (pageFlipInstance) {
        pageFlipInstance.flipPrev();
    } else if (window._fbPrev) {
        window._fbPrev();
    }
}

function updatePageInfo(currentPageIndex) {
    let current;
    if (typeof currentPageIndex === 'number') {
        current = currentPageIndex + 1;
    } else {
        current = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() + 1 : 1;
    }
    document.getElementById('pageInfo').textContent = `${current} / ${totalPages}`;

    // Disable prev/next toolbar buttons and nav arrows at boundaries.
    // In double-spread mode StPageFlip reports the LEFT page index, so the
    // viewer is "at the end" when that index + 2 reaches totalPages.
    const atStart = (current <= 1);
    const atEnd = (typeof currentPageIndex === 'number')
        ? (currentPageIndex + 2 >= totalPages)
        : (current >= totalPages);
    const prevBtn = document.getElementById('btnPrev');
    const nextBtn = document.getElementById('btnNext');
    const navPrev = document.getElementById('navPrev');
    const navNext = document.getElementById('navNext');
    if (prevBtn) prevBtn.disabled = atStart;
    if (nextBtn) nextBtn.disabled = atEnd;
    if (navPrev) navPrev.disabled = atStart;
    if (navNext) navNext.disabled = atEnd;

    // Hide cover hint once user navigates past page 1
    if (current > 1) hideCoverHint();

    // Keep edit page label in sync while editing
    if (editMode) updateEditPageLabel();

    // Update TOC active state
    document.querySelectorAll('.toc-item').forEach(item => {
        const p = parseInt(item.getAttribute('data-page'));
        item.classList.toggle('active', p === currentPageIndex);
    });
}

// ============================================================
// Search
// ============================================================
function toggleSearch() {
    const panel = document.getElementById('searchPanel');
    const btn = document.getElementById('btnSearch');
    searchOpen = !searchOpen;
    panel.classList.toggle('open', searchOpen);
    if (btn) btn.classList.toggle('active', searchOpen);
    if (searchOpen) {
        document.getElementById('searchInput').focus();
    }
}

function performSearch(query) {
    lastSearchQuery = query;   // track for page highlight
    const resultsEl = document.getElementById('searchResults');

    if (!query || query.length < 2) {
        resultsEl.innerHTML = '<p style="padding:1rem;color:var(--gray-500);font-size:0.875rem;">Type at least 2 characters to search...</p>';
        return;
    }

    const hasAnyText = pageTexts.some(pt => pt.fullText.trim().length > 0);
    if (!hasAnyText) {
        resultsEl.innerHTML = '<p style="padding:1rem;color:var(--gray-500);font-size:0.875rem;"><i class="fas fa-image" style="margin-right:0.5rem;"></i>This document has no searchable text (image-based PDF).</p>';
        return;
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    // Strip dot-leader noise — PDF.js emits U+FFFD for undecodable glyphs (TOC dot leaders)
    const cleanText = (t) => t
        // Collapse runs of replacement chars / bullets (optionally spaced)
        .replace(/([\uFFFD\u2022\u25CF\u25C6\u25A0\u2023\u00B7\u22C5\u2666\u25AA\u2027]\s*){2,}/g, ' ')
        // Collapse 4+ consecutive dots
        .replace(/\.{4,}/g, ' ')
        // Collapse excess whitespace
        .replace(/\s{2,}/g, ' ')
        .trim();

    for (let i = 0; i < pageTexts.length; i++) {
        const raw = pageTexts[i].fullText;
        const text = cleanText(raw);
        if (text.toLowerCase().includes(lowerQuery)) {
            const pos = text.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, pos - 50);
            const end = Math.min(text.length, pos + query.length + 80);
            let snippet = text.substring(start, end);
            if (start > 0) snippet = '…' + snippet;
            if (end < text.length) snippet += '…';

            // Highlight query in snippet
            const escapedQuery = escapeHtml(query);
            const highlighted = escapeHtml(snippet).replace(
                new RegExp(escapeRegex(escapedQuery), 'gi'),
                '<mark>$&</mark>'
            );

            results.push({ page: i + 1, pageIndex: i, snippet: highlighted });
        }
    }

    if (results.length === 0) {
        resultsEl.innerHTML = '<p class="search-empty">No results found for "<strong>' + escapeHtml(query) + '</strong>".</p>';
        return;
    }

    resultsEl.innerHTML =
        `<div class="search-count">${results.length} result${results.length !== 1 ? 's' : ''} for "<strong>${escapeHtml(query)}</strong>"</div>` +
        results.map(r => `
            <div class="search-result-item" onclick="goToPageFromSearch(${r.pageIndex}, ${escapeAttrSimple(JSON.stringify(query))});">
                <div class="page-num">Page ${r.page}</div>
                <div class="snippet">${r.snippet}</div>
            </div>
        `).join('');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// Search → Page Highlight
// ============================================================
function goToPageFromSearch(pageIndex, query) {
    if (pageFlipInstance) {
        pageFlipInstance.turnToPage(pageIndex);
        updatePageInfo(pageIndex);
    } else if (window._fbGoTo) {
        window._fbGoTo(pageIndex);
    }
    // Intentionally do NOT close the search panel here.
    
    // Wait for the flip animation before highlighting
    setTimeout(() => highlightSearchOnPage(pageIndex, query), 900);
}

function highlightSearchOnPage(pageIndex, query) {
    // Clear any previous highlights
    document.querySelectorAll('.search-highlight-overlay').forEach(el => el.remove());
    if (!query || !pageTexts[pageIndex]) return;

    const pt = pageTexts[pageIndex];
    const lowerQ = query.toLowerCase();
    const pageDiv = document.querySelector(`.page-wrapper[data-page="${pageIndex + 1}"]`);
    if (!pageDiv) return;

    const vp = pt.viewport;
    const baseW = vp.width / vp.scale;
    const baseH = vp.height / vp.scale;

    pt.items.forEach(item => {
        if (!item.str || !item.str.toLowerCase().includes(lowerQ)) return;
        // PDF transform: [scaleX, skewX, skewY, scaleY, tx, ty]
        const [, , , itemScaleY, tx, ty] = item.transform;
        const pdfW = item.width  || (query.length * Math.abs(itemScaleY) * 0.6);
        const pdfH = Math.abs(itemScaleY) || 12;

        const highlight = document.createElement('div');
        highlight.className = 'search-highlight-overlay';
        highlight.style.left   = (tx / baseW * 100) + '%';
        highlight.style.top    = ((baseH - ty - pdfH) / baseH * 100) + '%';
        highlight.style.width  = (pdfW / baseW * 100) + '%';
        highlight.style.height = ((pdfH * 1.2) / baseH * 100) + '%';
        pageDiv.appendChild(highlight);
    });
}

// ============================================================
// TOC
// ============================================================
function toggleToc() {
    tocOpen = !tocOpen;
    document.getElementById('tocPanel').classList.toggle('open', tocOpen);
    const btn = document.getElementById('btnToc');
    if (btn) btn.classList.toggle('active', tocOpen);
}

// ============================================================
// Zoom
// ============================================================
function zoomIn() {
    if (zoomLevel >= 200) return;
    zoomLevel += 10;
    applyZoom();
}

function zoomOut() {
    if (zoomLevel <= 50) return;
    zoomLevel -= 10;
    applyZoom();
}

function applyZoom() {
    document.getElementById('zoomLevel').textContent = zoomLevel + '%';
    const container = document.getElementById('flipbookContainer');
    container.style.transform = `scale(${fitScale * zoomLevel / 100})`;
    container.style.transformOrigin = 'center center';
}

// ============================================================
// Fullscreen
// ============================================================
function toggleFullscreen() {
    const el = document.getElementById('viewerWrapper');
    if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btnFullscreen');
    if (!btn) return;
    const isFs = !!document.fullscreenElement;
    btn.querySelector('i').className = isFs ? 'fas fa-compress' : 'fas fa-expand';
    btn.title = isFs ? 'Exit Fullscreen (F)' : 'Fullscreen (F)';
    btn.classList.toggle('active', isFs);
});

function closeAddVideoModal() {
    document.getElementById('addVideoModal').classList.remove('open');
    document.getElementById('addVideoForm').reset();
    document.getElementById('ytPreview').classList.remove('visible');
    const submitBtn = document.getElementById('btnAddVideoSubmit');
    if (submitBtn) submitBtn.disabled = true;
}

// ============================================================
// Save text to server for persistent search
// ============================================================
async function saveTextToServer() {
    if (!flipbookData || !flipbookData.id) return;

    try {
        const pages = pageTexts.map((pt, i) => ({
            page_number: i + 1,
            text: pt.fullText
        }));

        await fetch('api/text.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                flipbook_id: flipbookData.id,
                pages: pages
            })
        });
    } catch(e) {
        console.warn('Failed to save text to server:', e);
    }
}

// ============================================================
// Controls Setup
// ============================================================
function setupControls() {
    // Toolbar buttons
    document.getElementById('btnPrev').addEventListener('click', flipPrev);
    document.getElementById('btnNext').addEventListener('click', flipNext);
    document.getElementById('btnSearch').addEventListener('click', toggleSearch);
    document.getElementById('btnToc').addEventListener('click', toggleToc);
    document.getElementById('btnZoomIn').addEventListener('click', zoomIn);
    document.getElementById('btnZoomOut').addEventListener('click', zoomOut);
    document.getElementById('btnFullscreen').addEventListener('click', toggleFullscreen);

    // Sound toggle
    document.getElementById('btnSound').addEventListener('click', () => {
        if (flipSoundGen) {
            soundEnabled = flipSoundGen.toggle();
        } else {
            soundEnabled = !soundEnabled;
        }
        const btn = document.getElementById('btnSound');
        btn.querySelector('i').className = soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        btn.classList.toggle('muted', !soundEnabled);
    });

    // Edit mode button
    const editModeBtn = document.getElementById('btnEditMode');
    if (editModeBtn) {
        editModeBtn.addEventListener('click', toggleEditMode);
    }

    // Download PDF button
    const downloadBtn = document.getElementById('btnDownload');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadPDF);
    }

    // Embed button
    const embedBtn = document.getElementById('btnEmbed');
    if (embedBtn) {
        embedBtn.addEventListener('click', () => {
            const url = window.location.origin + basePath + '/viewer.php?slug=' + flipbookData.slug + '&embed=1';
            const code = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen title="${flipbookData.title}"></iframe>`;
            document.getElementById('embedCodeViewer').textContent = code;
            document.getElementById('embedModal').classList.add('open');
        });
    }

    // Add video button
    const addVideoBtn = document.getElementById('btnAddVideo');
    if (addVideoBtn) {
        addVideoBtn.addEventListener('click', () => {
            const currentPage = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() + 1 : 1;
            document.getElementById('videoPage').value = currentPage;
            const hint = document.getElementById('videoPageHint');
            if (hint) hint.textContent = `of ${totalPages}`;
            // Reset preview state
            document.getElementById('ytPreview').classList.remove('visible');
            document.getElementById('videoUrl').value = '';
            const submitBtn = document.getElementById('btnAddVideoSubmit');
            if (submitBtn) submitBtn.disabled = true;
            document.getElementById('addVideoModal').classList.add('open');
            setTimeout(() => document.getElementById('videoUrl').focus(), 150);
        });
    }

    // Live YouTube URL preview
    const videoUrlInput = document.getElementById('videoUrl');
    if (videoUrlInput) {
        videoUrlInput.addEventListener('input', () => {
            const ytId = extractYouTubeId(videoUrlInput.value.trim());
            const preview = document.getElementById('ytPreview');
            const thumb = document.getElementById('ytThumb');
            const idEl = document.getElementById('ytPreviewId');
            const submitBtn = document.getElementById('btnAddVideoSubmit');
            if (ytId) {
                thumb.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                if (idEl) idEl.textContent = `ID: ${ytId}`;
                preview.classList.add('visible');
                if (submitBtn) submitBtn.disabled = false;
            } else {
                preview.classList.remove('visible');
                if (submitBtn) submitBtn.disabled = true;
            }
        });
    }

    // Add video form
    const addVideoForm = document.getElementById('addVideoForm');
    if (addVideoForm) {
        addVideoForm.addEventListener('submit', handleAddVideo);
    }

    // Add link button
    const addLinkBtn = document.getElementById('btnAddLink');
    if (addLinkBtn) {
        addLinkBtn.addEventListener('click', () => {
            const currentPage = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() + 1 : 1;
            document.getElementById('linkPage').value = currentPage;
            const hint = document.getElementById('linkPageHint');
            if (hint) hint.textContent = `of ${totalPages}`;
            document.getElementById('linkUrl').value = '';
            document.getElementById('linkLabel').value = '';
            document.getElementById('addLinkModal').classList.add('open');
            setTimeout(() => document.getElementById('linkUrl').focus(), 150);
        });
    }

    // Add link form
    const addLinkForm = document.getElementById('addLinkForm');
    if (addLinkForm) {
        addLinkForm.addEventListener('submit', handleAddLink);
    }

    // Edit TOC button
    const editTocBtn = document.getElementById('btnEditToc');
    if (editTocBtn) {
        editTocBtn.addEventListener('click', openTocEditModal);
    }

    // Save / Cancel edit buttons
    const saveBtn = document.getElementById('btnSaveEdit');
    if (saveBtn) saveBtn.addEventListener('click', saveEdit);

    const cancelBtn = document.getElementById('btnCancelEdit');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);

    // Nav arrows
    document.getElementById('navPrev').addEventListener('click', flipPrev);
    document.getElementById('navNext').addEventListener('click', flipNext);

    // Page jump on click — inline popover input (no native prompt)
    const pageInfoEl = document.getElementById('pageInfo');
    pageInfoEl.style.cursor = 'pointer';
    pageInfoEl.title = 'Click to jump to page';
    pageInfoEl.addEventListener('click', () => showPageJumpPopover(pageInfoEl));

    // Reset zoom to fit on click
    const zoomLevelEl = document.getElementById('zoomLevel');
    zoomLevelEl.style.cursor = 'pointer';
    zoomLevelEl.title = 'Click to reset zoom';
    zoomLevelEl.addEventListener('click', () => {
        zoomLevel = 100;
        fitFlipbookToContainer();
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            performSearch(searchInput.value.trim());
        }, 300);
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        // Don't handle if typing in search
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                if (searchOpen) toggleSearch();
                e.target.blur();
            }
            return;
        }

        switch(e.key) {
            case 'ArrowRight':
            case 'PageDown':
                e.preventDefault();
                flipNext();
                break;
            case 'ArrowLeft':
            case 'PageUp':
                e.preventDefault();
                flipPrev();
                break;
            case 'Home':
                e.preventDefault();
                goToPage(0);
                break;
            case 'End':
                e.preventDefault();
                goToPage(totalPages - 1);
                break;
            case 'f':
                if (!e.ctrlKey && !e.metaKey) toggleFullscreen();
                break;
            case 'Escape': {
                if (searchOpen) toggleSearch();
                if (tocOpen) toggleToc();
                if (editMode) cancelEdit();
                const popover = document.getElementById('pageJumpPopover');
                if (popover) popover.remove();
                break;
            }
        }

        // Ctrl+F or Cmd+F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleSearch();
        }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el) el.classList.remove('open');
        });
    });
}

function copyEmbed() {
    const text = document.getElementById('embedCodeViewer').textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Embed code copied!', 'success');
    });
}

// ============================================================
// Cover hint
// ============================================================
function showCoverHint() {
    const hint = document.getElementById('coverHint');
    if (!hint) return;
    setTimeout(() => hint.classList.add('visible'), 800);
}

function hideCoverHint() {
    const hint = document.getElementById('coverHint');
    if (hint) hint.classList.remove('visible');
}

// ============================================================
// Keyboard hint
// ============================================================
function showKeyboardHint() {
    const hint = document.createElement('div');
    hint.className = 'keyboard-hint';
    hint.innerHTML = '<kbd>←</kbd><kbd>→</kbd> Navigate &nbsp; <kbd>F</kbd> Fullscreen &nbsp; <kbd>Ctrl+F</kbd> Search';
    document.getElementById('viewerBody').appendChild(hint);

    setTimeout(() => hint.classList.add('visible'), 500);
    setTimeout(() => {
        hint.classList.remove('visible');
        setTimeout(() => hint.remove(), 300);
    }, 4000);
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// Edit Mode
// ============================================================
function toggleEditMode() {
    if (editMode) {
        cancelEdit();
    } else {
        enterEditMode();
    }
}

function updateEditPageLabel() {
    const label = document.getElementById('editPageLabel');
    if (!label) return;
    const current = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() + 1 : 1;
    label.textContent = `Page ${current} of ${totalPages}`;
}

function enterEditMode() {
    editMode = true;
    pendingEdits = {};
    pendingDeletes = new Set();
    pendingAdds = [];
    pendingLinkEdits = {};
    pendingLinkDeletes = new Set();
    pendingLinkAdds = [];

    const wrapper = document.getElementById('viewerWrapper');
    const panel = document.getElementById('editPanel');
    const btn = document.getElementById('btnEditMode');

    wrapper.classList.add('edit-mode');
    panel.classList.add('open');
    btn.classList.add('active');

    // Update the page badge
    updateEditPageLabel();

    // Disable page flipping
    if (pageFlipInstance) {
        pageFlipInstance.getSettings().useMouseEvents = false;
    }

    enableVideoDragging();
}

function exitEditMode() {
    editMode = false;

    const wrapper = document.getElementById('viewerWrapper');
    const panel = document.getElementById('editPanel');
    const btn = document.getElementById('btnEditMode');

    wrapper.classList.remove('edit-mode');
    panel.classList.remove('open');
    btn.classList.remove('active');

    // Re-enable page flipping
    if (pageFlipInstance) {
        pageFlipInstance.getSettings().useMouseEvents = true;
    }

    disableVideoDragging();
}

async function saveEdit() {
    const btn = document.getElementById('btnSaveEdit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        // 1. Save position/size changes (existing videos only)
        for (const [videoId, changes] of Object.entries(pendingEdits)) {
            if (pendingDeletes.has(videoId)) continue;
            if (String(videoId).startsWith('new_')) continue;
            const resp = await fetch('api/videos.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(videoId), ...changes })
            });
            if (!resp.ok) throw new Error(`PUT failed for video ${videoId}: ${resp.status}`);
        }

        // 2. Delete removed videos
        for (const videoId of pendingDeletes) {
            const resp = await fetch('api/videos.php', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(videoId) })
            });
            if (!resp.ok) throw new Error(`DELETE failed for video ${videoId}: ${resp.status}`);
        }

        // 3. Add new videos — sync final position/size from DOM before POSTing
        for (const newVideo of pendingAdds) {
            const domEl = document.querySelector(`.video-overlay[data-video-id="${newVideo.id}"]`);
            if (domEl) {
                newVideo.pos_x_percent = parseFloat(domEl.style.left) || newVideo.pos_x_percent;
                newVideo.pos_y_percent = parseFloat(domEl.style.top) || newVideo.pos_y_percent;
                newVideo.width_percent = parseFloat(domEl.style.width) || newVideo.width_percent;
                newVideo.height_percent = parseFloat(domEl.style.height) || newVideo.height_percent;
            }
            const { id: _tempId, ...videoPayload } = newVideo;
            const resp = await fetch('api/videos.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(videoPayload)
            });
            if (!resp.ok) throw new Error(`POST failed for new video: ${resp.status}`);
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save';
        showToast('Changes saved!', 'success');
        exitEditMode();
        await loadVideos();
        renderVideoOverlays();
        // 4. Link edits
        for (const [linkId, changes] of Object.entries(pendingLinkEdits)) {
            if (pendingLinkDeletes.has(linkId) || String(linkId).startsWith('new_')) continue;
            await fetch('api/links.php', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(linkId), ...changes })
            });
        }
        // 5. Link deletes
        for (const linkId of pendingLinkDeletes) {
            await fetch('api/links.php', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(linkId) })
            });
        }
        // 6. Link adds
        for (const newLink of pendingLinkAdds) {
            const domEl = document.querySelector(`.link-overlay[data-link-id="${newLink.id}"]`);
            if (domEl) {
                newLink.pos_x_percent  = parseFloat(domEl.style.left)   || newLink.pos_x_percent;
                newLink.pos_y_percent  = parseFloat(domEl.style.top)    || newLink.pos_y_percent;
                newLink.width_percent  = parseFloat(domEl.style.width)  || newLink.width_percent;
                newLink.height_percent = parseFloat(domEl.style.height) || newLink.height_percent;
            }
            const { id: _tmp, ...payload } = newLink;
            await fetch('api/links.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        await loadLinks();
        renderLinkOverlays();
    } catch (err) {
        console.error('[saveEdit]', err);
        showToast('Failed to save: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save';
    }
}

function cancelEdit() {
    // Revert all visual changes by re-rendering from original videoOverlays
    exitEditMode();
    renderVideoOverlays();
    renderLinkOverlays();
}

function enableVideoDragging() {
    document.querySelectorAll('.video-overlay, .link-overlay').forEach(overlay => {
        makeDraggable(overlay);
        addEditControls(overlay);
    });
}

function disableVideoDragging() {
    document.querySelectorAll('.video-overlay, .link-overlay').forEach(overlay => {
        overlay.removeEventListener('mousedown', onOverlayMouseDown);
        overlay.removeEventListener('touchstart', onOverlayMouseDown);
    });
}

function addEditControls(overlay) {
    const isLink = overlay.classList.contains('link-overlay');

    // Delete button
    if (!overlay.querySelector('.video-delete-btn')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'video-delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (isLink) markLinkDeleted(overlay.dataset.linkId);
            else markVideoDeleted(overlay.dataset.videoId);
        };
        overlay.appendChild(deleteBtn);
    }

    // Resize handles (corners)
    ['nw', 'ne', 'sw', 'se'].forEach(dir => {
        if (!overlay.querySelector(`.video-resize-handle.${dir}`)) {
            const handle = document.createElement('div');
            handle.className = `video-resize-handle ${dir}`;
            handle.addEventListener('mousedown', (e) => startResize(e, overlay, dir));
            handle.addEventListener('touchstart', (e) => startResize(e, overlay, dir));
            overlay.appendChild(handle);
        }
    });
}

function makeDraggable(overlay) {
    overlay.addEventListener('mousedown', onOverlayMouseDown);
    overlay.addEventListener('touchstart', onOverlayMouseDown, { passive: false });
}

function onOverlayMouseDown(e) {
    if (!editMode) return;
    // Don't drag if clicking a handle or delete btn
    if (e.target.classList.contains('video-resize-handle') ||
        e.target.classList.contains('video-delete-btn') ||
        e.target.closest('.video-delete-btn')) return;

    e.preventDefault();
    e.stopPropagation();

    draggedVideo = e.currentTarget;
    draggedVideo.classList.add('dragging');

    const touch = e.touches ? e.touches[0] : e;
    const rect = draggedVideo.getBoundingClientRect();
    dragStartX = touch.clientX - rect.left;
    dragStartY = touch.clientY - rect.top;

    document.addEventListener('mousemove', dragVideo);
    document.addEventListener('mouseup', stopDragVideo);
    document.addEventListener('touchmove', dragVideo, { passive: false });
    document.addEventListener('touchend', stopDragVideo);
}

function dragVideo(e) {
    if (!draggedVideo) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    const parentRect = draggedVideo.parentElement.getBoundingClientRect();

    const xPercent = ((touch.clientX - parentRect.left - dragStartX) / parentRect.width) * 100;
    const yPercent = ((touch.clientY - parentRect.top - dragStartY) / parentRect.height) * 100;
    const wPercent = parseFloat(draggedVideo.style.width);
    const hPercent = parseFloat(draggedVideo.style.height);

    const clampedX = Math.max(0, Math.min(100 - wPercent, xPercent));
    const clampedY = Math.max(0, Math.min(100 - hPercent, yPercent));

    draggedVideo.style.left = clampedX + '%';
    draggedVideo.style.top = clampedY + '%';
}

function stopDragVideo() {
    if (!draggedVideo) return;

    document.removeEventListener('mousemove', dragVideo);
    document.removeEventListener('mouseup', stopDragVideo);
    document.removeEventListener('touchmove', dragVideo);
    document.removeEventListener('touchend', stopDragVideo);

    draggedVideo.classList.remove('dragging');

    // Record pending edit
    const videoId = draggedVideo.dataset.videoId;
    pendingEdits[videoId] = pendingEdits[videoId] || {};
    pendingEdits[videoId].pos_x_percent = parseFloat(draggedVideo.style.left);
    pendingEdits[videoId].pos_y_percent = parseFloat(draggedVideo.style.top);

    draggedVideo = null;
}

// ---- Resize ----
function startResize(e, overlay, dir) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();

    resizingVideo = overlay;
    resizeHandle = dir;

    const touch = e.touches ? e.touches[0] : e;
    resizeStartX = touch.clientX;
    resizeStartY = touch.clientY;

    const parentRect = overlay.parentElement.getBoundingClientRect();
    resizeStartW = (parseFloat(overlay.style.width) / 100) * parentRect.width;
    resizeStartH = (parseFloat(overlay.style.height) / 100) * parentRect.height;
    resizeStartLeft = (parseFloat(overlay.style.left) / 100) * parentRect.width;
    resizeStartTop = (parseFloat(overlay.style.top) / 100) * parentRect.height;

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', doResize, { passive: false });
    document.addEventListener('touchend', stopResize);
}

function doResize(e) {
    if (!resizingVideo) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - resizeStartX;
    const dy = touch.clientY - resizeStartY;
    const parentRect = resizingVideo.parentElement.getBoundingClientRect();
    const minPx = 80;

    let newW = resizeStartW;
    let newH = resizeStartH;
    let newLeft = resizeStartLeft;
    let newTop = resizeStartTop;

    if (resizeHandle.includes('e')) newW = Math.max(minPx, resizeStartW + dx);
    if (resizeHandle.includes('s')) newH = Math.max(minPx, resizeStartH + dy);
    if (resizeHandle.includes('w')) {
        newW = Math.max(minPx, resizeStartW - dx);
        newLeft = resizeStartLeft + (resizeStartW - newW);
    }
    if (resizeHandle.includes('n')) {
        newH = Math.max(minPx, resizeStartH - dy);
        newTop = resizeStartTop + (resizeStartH - newH);
    }

    // Clamp to parent bounds
    newLeft = Math.max(0, Math.min(parentRect.width - minPx, newLeft));
    newTop = Math.max(0, Math.min(parentRect.height - minPx, newTop));

    resizingVideo.style.width = (newW / parentRect.width * 100) + '%';
    resizingVideo.style.height = (newH / parentRect.height * 100) + '%';
    resizingVideo.style.left = (newLeft / parentRect.width * 100) + '%';
    resizingVideo.style.top = (newTop / parentRect.height * 100) + '%';
}

function stopResize() {
    if (!resizingVideo) return;

    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', doResize);
    document.removeEventListener('touchend', stopResize);

    // Record pending edit
    const videoId = resizingVideo.dataset.videoId;
    pendingEdits[videoId] = pendingEdits[videoId] || {};
    pendingEdits[videoId].width_percent = parseFloat(resizingVideo.style.width);
    pendingEdits[videoId].height_percent = parseFloat(resizingVideo.style.height);
    pendingEdits[videoId].pos_x_percent = parseFloat(resizingVideo.style.left);
    pendingEdits[videoId].pos_y_percent = parseFloat(resizingVideo.style.top);

    resizingVideo = null;
    resizeHandle = null;
}

function handleAddVideo(e) {
    e.preventDefault();

    const url = document.getElementById('videoUrl').value.trim();
    const pageNum = parseInt(document.getElementById('videoPage').value);

    if (!url || !pageNum) {
        showToast('Please fill all fields', 'error');
        return;
    }

    // Extract YouTube ID to validate
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) {
        showToast('Invalid YouTube URL', 'error');
        return;
    }

    // Create a temporary local ID for tracking
    const tempId = 'new_' + Date.now();

    const newVideo = {
        id: tempId,
        flipbook_id: flipbookData.id,
        page_number: pageNum,
        youtube_url: url,
        pos_x_percent: 10,
        pos_y_percent: 10,
        width_percent: 40,
        height_percent: 30
    };

    pendingAdds.push(newVideo);

    // Add to local videoOverlays for immediate rendering
    videoOverlays.push(newVideo);

    closeAddVideoModal();

    // Re-render and re-enable edit controls
    renderVideoOverlays();
    showToast('Video added — click Save to confirm', 'info');
}

function markVideoDeleted(videoId) {
    if (String(videoId).startsWith('new_')) {
        // Remove from pendingAdds
        const idx = pendingAdds.findIndex(v => v.id === videoId);
        if (idx !== -1) pendingAdds.splice(idx, 1);
        // Remove from local videoOverlays
        const vi = videoOverlays.findIndex(v => String(v.id) === String(videoId));
        if (vi !== -1) videoOverlays.splice(vi, 1);
    } else {
        pendingDeletes.add(String(videoId));
    }
    document.querySelector(`.video-overlay[data-video-id="${videoId}"]`)?.remove();
}

// ============================================================
// PDF Download
// ============================================================
async function downloadPDF() {
    showToast('Downloading PDF...', 'info');
    window.location.href = basePath + '/api/download.php?id=' + flipbookData.id;
}

// ============================================================
// Link Overlay — Add / Delete
// ============================================================
function closeAddLinkModal() {
    document.getElementById('addLinkModal').classList.remove('open');
    document.getElementById('addLinkForm').reset();
}

function handleAddLink(e) {
    e.preventDefault();
    const url   = document.getElementById('linkUrl').value.trim();
    const label = document.getElementById('linkLabel').value.trim() || 'Click here';
    const page  = parseInt(document.getElementById('linkPage').value);

    if (!url || !page) { showToast('Please fill all fields', 'error'); return; }

    const tempId = 'new_' + Date.now();
    const newLink = {
        id: tempId,
        flipbook_id: flipbookData.id,
        page_number: page,
        url,
        label,
        pos_x_percent:  10,
        pos_y_percent:  10,
        width_percent:  22,
        height_percent: 6,
    };

    pendingLinkAdds.push(newLink);
    linkOverlays.push(newLink);
    closeAddLinkModal();
    renderLinkOverlays();
    showToast('Link added — click Save to confirm', 'info');
}

function markLinkDeleted(linkId) {
    if (String(linkId).startsWith('new_')) {
        const idx = pendingLinkAdds.findIndex(l => l.id === linkId);
        if (idx !== -1) pendingLinkAdds.splice(idx, 1);
        const vi = linkOverlays.findIndex(l => String(l.id) === String(linkId));
        if (vi !== -1) linkOverlays.splice(vi, 1);
    } else {
        pendingLinkDeletes.add(String(linkId));
    }
    document.querySelector(`.link-overlay[data-link-id="${linkId}"]`)?.remove();
}

// ============================================================
// TOC Edit Modal
// ============================================================
function openTocEditModal() {
    if (customToc && customToc.length > 0) {
        tocEditBuffer = customToc.map(item => ({ ...item }));
    } else {
        // Import from current PDF outline in DOM if empty
        tocEditBuffer = [];
        document.querySelectorAll('#tocList .toc-item').forEach(el => {
            const titleSpan = el.querySelector('span:first-child');
            const title = titleSpan ? titleSpan.textContent : '';
            const pageNum = parseInt(el.getAttribute('data-page')) + 1 || 1;
            let level = 1;
            if (el.classList.contains('level-2')) level = 2;
            if (el.classList.contains('level-3')) level = 3;
            tocEditBuffer.push({ title: title, page: pageNum, level: level });
        });
    }
    renderTocEditList();
    document.getElementById('tocEditModal').classList.add('open');
}

function closeTocEditModal() {
    document.getElementById('tocEditModal').classList.remove('open');
}

function renderTocEditList() {
    const list = document.getElementById('tocEditList');
    if (!list) return;
    if (tocEditBuffer.length === 0) {
        list.innerHTML = '<p style="padding:0.75rem;color:var(--gray-500);font-size:0.875rem;">No items yet. Click "Add Item" below.</p>';
        return;
    }
    list.innerHTML = tocEditBuffer.map((item, i) => `
        <div class="toc-edit-row" data-index="${i}">
            <div style="width: ${(item.level || 1) * 15 - 15}px"></div>
            <input class="toc-edit-input" type="text" value="${escapeAttrSimple(item.title)}"
                   onchange="tocEditBuffer[${i}].title = this.value" placeholder="Title">
            <input class="toc-edit-page" type="number" min="1" max="${totalPages}"
                   value="${item.page}"
                   onchange="tocEditBuffer[${i}].page = parseInt(this.value)||1" placeholder="Pg">
            <div class="toc-edit-actions">
                <button class="btn btn-icon btn-ghost btn-sm" onclick="indentTocItem(${i},-1)" title="Outdent" ${(item.level||1)<=1?'disabled':''}>
                    <i class="fas fa-outdent"></i></button>
                <button class="btn btn-icon btn-ghost btn-sm" onclick="indentTocItem(${i},1)" title="Indent" ${(item.level||1)>=3?'disabled':''}>
                    <i class="fas fa-indent"></i></button>
                <button class="btn btn-icon btn-ghost btn-sm" onclick="moveTocItem(${i},-1)" title="Move up" ${i===0?'disabled':''}>
                    <i class="fas fa-chevron-up"></i></button>
                <button class="btn btn-icon btn-ghost btn-sm" onclick="moveTocItem(${i},1)" title="Move down" ${i===tocEditBuffer.length-1?'disabled':''}>
                    <i class="fas fa-chevron-down"></i></button>
                <button class="btn btn-icon btn-ghost btn-sm" onclick="deleteTocItem(${i})" title="Delete" style="color:var(--danger)">
                    <i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function escapeAttrSimple(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addTocItem() {
    const currentPage = pageFlipInstance ? pageFlipInstance.getCurrentPageIndex() + 1 : 1;
    tocEditBuffer.push({ title: 'New Item', page: currentPage, level: 1 });
    renderTocEditList();
}

function indentTocItem(index, direction) {
    let level = tocEditBuffer[index].level || 1;
    level += direction;
    if (level < 1) level = 1;
    if (level > 3) level = 3;
    tocEditBuffer[index].level = level;
    renderTocEditList();
}

function deleteTocItem(index) {
    tocEditBuffer.splice(index, 1);
    renderTocEditList();
}

function moveTocItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tocEditBuffer.length) return;
    [tocEditBuffer[index], tocEditBuffer[newIndex]] = [tocEditBuffer[newIndex], tocEditBuffer[index]];
    renderTocEditList();
}

async function saveToc() {
    // Read any unsaved text/page field changes directly from inputs
    document.querySelectorAll('#tocEditList .toc-edit-row').forEach(row => {
        const i = parseInt(row.dataset.index);
        const titleInput = row.querySelector('.toc-edit-input');
        const pageInput  = row.querySelector('.toc-edit-page');
        if (titleInput && tocEditBuffer[i] !== undefined) tocEditBuffer[i].title = titleInput.value;
        if (pageInput  && tocEditBuffer[i] !== undefined) tocEditBuffer[i].page  = parseInt(pageInput.value) || 1;
    });

    try {
        const resp = await fetch('api/flipbooks.php', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: flipbookData.id,
                toc_json: JSON.stringify(tocEditBuffer)
            })
        });
        if (!resp.ok) throw new Error('Server error ' + resp.status);

        customToc = tocEditBuffer.map(item => ({ ...item }));
        flipbookData.toc_json = JSON.stringify(customToc);

        // Re-render TOC panel and enable button if needed
        renderCustomToc();
        const btn = document.getElementById('btnToc');
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = ''; }

        closeTocEditModal();
        showToast('Table of contents saved!', 'success');
    } catch(err) {
        showToast('Failed to save TOC: ' + err.message, 'error');
    }
}
