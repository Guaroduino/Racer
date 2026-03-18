const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

const badBlock = 
    // Crear botón de limpiar junto al botón de exportar
    const clearTrackButton = document.getElementById('clearTrackButton');
    if (clearTrackButton) {
        const btnAddBorder = document.getElementById('btnAddBorder');
    if (btnAddBorder) {
        btnAddBorder.addEventListener('click', () => {
            const w = currentGridSize.cols * TRACK_PART_SIZE_PX;
            const h = currentGridSize.rows * TRACK_PART_SIZE_PX;
            const t = 20; // 20 thickness for border
            interactiveElements.push({ id: Date.now()+1, type: 'obstacle', x: 0, y: -t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+2, type: 'obstacle', x: 0, y: h - t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+3, type: 'obstacle', x: -t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+4, type: 'obstacle', x: w - t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            renderEditor();
        });
    }
    clearTrackButton.addEventListener('click', () => {
;

const goodBlock = 
    const btnAddBorder = document.getElementById('btnAddBorder');
    if (btnAddBorder) {
        btnAddBorder.addEventListener('click', () => {
            const w = currentGridSize.cols * TRACK_PART_SIZE_PX;
            const h = currentGridSize.rows * TRACK_PART_SIZE_PX;
            const t = 20; // 20 thickness for border
            interactiveElements.push({ id: Date.now()+1, type: 'obstacle', x: 0, y: -t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+2, type: 'obstacle', x: 0, y: h - t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+3, type: 'obstacle', x: -t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+4, type: 'obstacle', x: w - t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            renderEditor();
        });
    }

    // Crear botón de limpiar junto al botón de exportar
    const clearTrackButton = document.getElementById('clearTrackButton');
    if (clearTrackButton) {
        clearTrackButton.addEventListener('click', () => {
;

code = code.replace(badBlock.trim(), goodBlock.trim());
fs.writeFileSync('js/trackEditor.js', code);
