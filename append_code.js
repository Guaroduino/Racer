const fs = require('fs');
const ext = 
function setupTrackZoomPan() {
    const trackPanBtn = document.getElementById('trackPanBtn');
    const trackZoomInBtn = document.getElementById('trackZoomInBtn');
    const trackZoomOutBtn = document.getElementById('trackZoomOutBtn');
    const trackZoomResetBtn = document.getElementById('trackZoomResetBtn');
    const trackZoomExtentsBtn = document.getElementById('trackZoomExtentsBtn');

    if (trackZoomInBtn) trackZoomInBtn.addEventListener('click', () => { trackZoom = Math.min(5.0, trackZoom + 0.2); renderEditor(); });
    if (trackZoomOutBtn) trackZoomOutBtn.addEventListener('click', () => { trackZoom = Math.max(0.1, trackZoom - 0.2); renderEditor(); });
    if (trackZoomResetBtn) trackZoomResetBtn.addEventListener('click', () => { trackZoom = 1.0; trackPanX = 0; trackPanY = 0; renderEditor(); });

    if (trackPanBtn) {
        trackPanBtn.addEventListener('click', () => {
            isPanningTrack = !isPanningTrack;
            if (isPanningTrack) {
                trackPanBtn.style.backgroundColor = 'var(--primary-color)'; trackPanBtn.style.color = 'white'; editorCanvas.style.cursor = 'grab';
            } else {
                trackPanBtn.style.backgroundColor = ''; trackPanBtn.style.color = ''; editorCanvas.style.cursor = 'default';
            }
        });
    }

    if (trackZoomExtentsBtn) trackZoomExtentsBtn.addEventListener('click', zoomToExtents);

    if (editorCanvas) {
        editorCanvas.addEventListener('wheel', (event) => {
            if(!event.ctrlKey) return; 
            event.preventDefault();
            const zoomStep = Math.max(0.05, trackZoom * 0.1);
            const previousZoom = trackZoom;
            if (event.deltaY < 0) trackZoom = Math.min(5.0, trackZoom + zoomStep);
            else trackZoom = Math.max(0.1, trackZoom - zoomStep);

            const rect = editorCanvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            trackPanX = mouseX - (mouseX - trackPanX) * (trackZoom / previousZoom);
            trackPanY = mouseY - (mouseY - trackPanY) * (trackZoom / previousZoom);
            renderEditor();
        }, { passive: false });

        editorCanvas.addEventListener('mousedown', (event) => {
            if (event.button === 1 || isPanningTrack) {
                isPanningTrack = true;
                if(trackPanBtn) { trackPanBtn.style.backgroundColor = 'var(--primary-color)'; trackPanBtn.style.color = 'white'; }
                editorCanvas.style.cursor = 'grabbing';
                trackPanStartX = event.clientX;
                trackPanStartY = event.clientY;
            }
        });

        window.addEventListener('mousemove', (event) => {
            if (isPanningTrack && editorCanvas && event.buttons !== 0) {
                trackPanX += event.clientX - trackPanStartX;
                trackPanY += event.clientY - trackPanStartY;
                trackPanStartX = event.clientX;
                trackPanStartY = event.clientY;
                renderEditor();
            }
        });

        window.addEventListener('mouseup', (event) => {
            if (isPanningTrack && event.button === 1) {
                isPanningTrack = false;
                if(trackPanBtn) { trackPanBtn.style.backgroundColor = ''; trackPanBtn.style.color = ''; }
                editorCanvas.style.cursor = 'default';
            } else if (isPanningTrack && event.buttons === 0 && event.button === 0) {
                 editorCanvas.style.cursor = 'grab';
            }
        });
    }
}

function zoomToExtents() {
    if(!editorCanvas) return;
    const padding = 40;
    const cellSize = editorCanvas.width / Math.max(currentGridSize.rows, currentGridSize.cols);
    const contentW = currentGridSize.cols * cellSize;
    const contentH = currentGridSize.rows * cellSize;

    if (contentW === 0 || contentH === 0) { trackZoom = 1; trackPanX = 0; trackPanY = 0; renderEditor(); return; }

    const scaleX = (editorCanvas.width - padding*2) / contentW;
    const scaleY = (editorCanvas.height - padding*2) / contentH;
    trackZoom = Math.min(Math.min(scaleX, scaleY), 5.0);
    trackPanX = (editorCanvas.width - contentW * trackZoom) / 2;
    trackPanY = (editorCanvas.height - contentH * trackZoom) / 2;
    renderEditor();
}
;
fs.appendFileSync('js/trackEditor.js', ext);

