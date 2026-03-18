const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

const singleClickMatch = /function onGridSingleClick\(event\) \{[\s\S]*?\/\/ --- INTERACTIVE ELEMENTS LOGIC ---/;
code = code.replace(singleClickMatch, \unction onGridSingleClick(event) {
    if (!editorCanvas) return;
    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { p_x, p_y } = coords;

    // --- INTERACTIVE ELEMENTS LOGIC ---\);

const doubleClickMatch = /function onGridDoubleClick\(event\) \{[\s\S]*?\/\/ Double click logic for interactive elements/;
code = code.replace(doubleClickMatch, \unction onGridDoubleClick(event) {
    if (!editorCanvas) return;
    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { p_x, p_y } = coords;

    // Double click logic for interactive elements\);

fs.writeFileSync('js/trackEditor.js', code);
console.log('replaced coordinates');