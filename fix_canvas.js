const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

// 1. Fix resizeTrackEditorCanvas
code = code.replace(
    /function resizeTrackEditorCanvas\(\) \{[\s\S]*?renderEditor\(cellSize\);\n\}/,
    \unction resizeTrackEditorCanvas() {
    if (!editorCanvas) return;
    const container = editorCanvas.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    
    editorCanvas.width = containerRect.width;
    editorCanvas.height = containerRect.height;
    
    editorCanvas.style.width = '100%';
    editorCanvas.style.height = '100%';

    const cellSize = Math.min(editorCanvas.width / currentGridSize.cols, editorCanvas.height / currentGridSize.rows);
    
    // Auto extents after resizing
    zoomToExtents();
}\
);

// 2. Fix zoomToExtents
code = code.replace(
    /function zoomToExtents\(\) \{[\s\S]*?renderEditor\(\);\n  \}/,
    \unction zoomToExtents() {
    if(!editorCanvas) return;
    const padding = 20;
    
    const baseCellSize = Math.min(
        editorCanvas.width / currentGridSize.cols,
        editorCanvas.height / currentGridSize.rows
    );
    
    const contentW = currentGridSize.cols * baseCellSize;
    const contentH = currentGridSize.rows * baseCellSize;

    if (contentW === 0 || contentH === 0) { trackZoom = 1; trackPanX = 0; trackPanY = 0; renderEditor(); return; }

    trackPanX = (editorCanvas.width - contentW) / 2;
    trackPanY = (editorCanvas.height - contentH) / 2;
    trackZoom = 1.0; 
    
    // Fit within paddings if needed, but since we map size to fit width/height, 1.0 scale perfectly fits with padding=0.
    // So we'll just apply zoom 0.9 to give some slight margin
    trackZoom = 0.95;
    
    // Recalculate pan to keep centered with 0.95 zoom
    trackPanX = (editorCanvas.width - contentW * trackZoom) / 2;
    trackPanY = (editorCanvas.height - contentH * trackZoom) / 2;

    renderEditor();
  }\
);

// 3. Fix getCanvasCoords
code = code.replace(
    /function getCanvasCoords\(event\) \{[\s\S]*?return \{ x_canvas, y_canvas, p_x, p_y \};\n\}/,
    \unction getCanvasCoords(event) {
    if (!editorCanvas) return null;
    const rect = editorCanvas.getBoundingClientRect();
    
    // Remove letterboxing calculations because the canvas fills the container exactly
    const x_relative = event.clientX - rect.left;
    const y_relative = event.clientY - rect.top;

    let x_canvas = x_relative;
    let y_canvas = y_relative;

    // Apply Inverse Zoom and Pan
    x_canvas = (x_canvas - trackPanX) / trackZoom;
    y_canvas = (y_canvas - trackPanY) / trackZoom;

    // Get correct internal cell size based on rect dimensions vs cols/rows
    const cellSize = Math.min(editorCanvas.width / currentGridSize.cols, editorCanvas.height / currentGridSize.rows);
    
    // Map to physical size (TRACK_PART_SIZE_PX)
    const exportScale = TRACK_PART_SIZE_PX / cellSize;
    const p_x = x_canvas * exportScale;
    const p_y = y_canvas * exportScale;

    return { x_canvas, y_canvas, p_x, p_y };
}\
);


// 4. Update the renderEditor cellSize calc
code = code.replace(
    /cellSize = editorCanvas\.width \/ Math\.max\(currentGridSize\.rows, currentGridSize\.cols\);/g,
    \cellSize = Math.min(editorCanvas.width / currentGridSize.cols, editorCanvas.height / currentGridSize.rows);\
);

fs.writeFileSync('js/trackEditor.js', code);
console.log('Fixed canvas resizing!');