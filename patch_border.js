const fs = require('fs');
const path = 'js/trackEditor.js';
let c = fs.readFileSync(path, 'utf8');

const s1 = "clearTrackButton.addEventListener('click', () => {";

const s2 = `const btnAddBorder = document.getElementById('btnAddBorder');
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
    clearTrackButton.addEventListener('click', () => {`;

c = c.replace(s1, s2);
fs.writeFileSync(path, c);
console.log('Border button listener added.');
