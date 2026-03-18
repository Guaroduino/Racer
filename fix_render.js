const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

// Fix renderEditor
code = code.replace(
    /function renderEditor\(cellSize\) \{[\s\S]*?\/\/ Clear the canvas with white background\n    ctx\.fillStyle \= 'white';\n    ctx\.fillRect\(0, 0, editorCanvas\.width, editorCanvas\.height\);/,
    \unction renderEditor(cellSize) {
    if (!ctx || !editorCanvas || editorCanvas.width === 0 || editorCanvas.height === 0) {
        return;
    }

    if (!cellSize) {
        cellSize = editorCanvas.width / Math.max(currentGridSize.rows, currentGridSize.cols);
    }

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

    ctx.save();
    ctx.translate(trackPanX, trackPanY);
    ctx.scale(trackZoom, trackZoom);\
);

code = code.replace(
    /if \(AVAILABLE_TRACK_PARTS\.length === 0 && editorCanvas\.width > 0\) \{/,
    \ctx.restore();\n\n    if (AVAILABLE_TRACK_PARTS.length === 0 && editorCanvas.width > 0) {\
);

// Fix getCanvasCoords
code = code.replace(
    /const scale = editorCanvas\.width \/ actualWidth;\n    const x_canvas = x_relative \* scale;\n    const y_canvas = y_relative \* scale;/,
    \const scale = editorCanvas.width / actualWidth;
    let x_canvas = x_relative * scale;
    let y_canvas = y_relative * scale;

    // Apply Inverse Zoom and Pan
    x_canvas = (x_canvas - trackPanX) / trackZoom;
    y_canvas = (y_canvas - trackPanY) / trackZoom;\
);

// Fix onGridSingleClick
code = code.replace(
    /function onGridSingleClick\(event\) \{[\s\S]*?const p_y = y_canvas \* exportScale;/,
    \unction onGridSingleClick(event) {
    if (!editorCanvas) return;
    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { p_x, p_y, x_canvas, y_canvas } = coords;\
);

// Fix onGridDoubleClick
code = code.replace(
    /function onGridDoubleClick\(event\) \{[\s\S]*?const p_y = y_canvas \* exportScale;/,
    \unction onGridDoubleClick(event) {
    if (!editorCanvas) return;
    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { p_x, p_y, x_canvas, y_canvas } = coords;\
);

fs.writeFileSync('js/trackEditor.js', code);
console.log('Fixed render code');
