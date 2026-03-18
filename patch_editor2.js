const fs = require('fs');
const path = 'js/trackEditor.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/let isDraggingInteractive = false;/g, `let isDraggingInteractive = false;
let dragTransformMode = '';
let startRotAngle = 0;
let dragStartAngle = 0;
let dragStartX = 0, dragStartY = 0;
let startElemX = 0, startElemY = 0, startElemW = 0, startElemH = 0;`);

const oldDraw = content.substring(content.indexOf('function drawInteractiveElements('), content.indexOf('function exportTrackAsCanvas() {') - 1);

const newDraw = `function drawInteractiveElements(targetCtx, scaleRatio) {
    interactiveElements.forEach(el => {
        targetCtx.save();
        const x = el.x * scaleRatio;
        const y = el.y * scaleRatio;
        const w = el.width * scaleRatio;
        const h = el.height * scaleRatio;
        const cx = x + w / 2;
        const cy = y + h / 2;
        
        targetCtx.translate(cx, cy);
        if (el.rotation) targetCtx.rotate(el.rotation * Math.PI / 180);
        
        if (el.type === 'color') {
            targetCtx.fillStyle = el.color || '#0000ff';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = 'white';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.strokeRect(-w/2, -h/2, w, h);
        } else if (el.type === 'rfid') {
            targetCtx.fillStyle = 'rgba(200, 200, 200, 0.8)';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = '#333';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.strokeRect(-w/2, -h/2, w, h);
            targetCtx.fillStyle = 'black';
            targetCtx.font = \`\${12 * scaleRatio}px Arial\`;
            targetCtx.textAlign = 'center';
            targetCtx.textBaseline = 'middle';
            targetCtx.fillText(\`RFID:\${el.value || 0}\`, 0, 0);
        } else if (el.type === 'hopper') {
            targetCtx.fillStyle = 'rgba(139, 69, 19, 0.8)';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = '#fff';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.beginPath();
            targetCtx.moveTo(-w/2, -h/2);
            targetCtx.lineTo(w/2, h/2);
            targetCtx.moveTo(w/2, -h/2);
            targetCtx.lineTo(-w/2, h/2);
            targetCtx.stroke();
        } else if (el.type === 'obstacle') {
            targetCtx.fillStyle = '#444';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = 'yellow';
            targetCtx.lineWidth = 3 * scaleRatio;
            targetCtx.strokeRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = 'yellow';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.beginPath();
            for (let i = -Math.max(w,h); i < Math.max(w,h) * 2; i += 15 * scaleRatio) {
                targetCtx.moveTo(i, -h/2);
                targetCtx.lineTo(i - h, h/2);
            }
            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.rect(-w/2, -h/2, w, h);
            targetCtx.clip();
            targetCtx.stroke();
            targetCtx.restore();
        }

        if (selectedInteractiveElement && selectedInteractiveElement.id === el.id) {
            targetCtx.strokeStyle = 'cyan';
            targetCtx.lineWidth = 3 * scaleRatio;
            targetCtx.setLineDash([5 * scaleRatio, 5 * scaleRatio]);
            targetCtx.strokeRect(-w/2 - 2*scaleRatio, -h/2 - 2*scaleRatio, w + 4*scaleRatio, h + 4*scaleRatio);
            targetCtx.setLineDash([]);
            
            if (currentToolMode === 'move') {
                targetCtx.fillStyle = 'cyan';
                const hs = 8 * scaleRatio;
                targetCtx.fillRect(-w/2 - hs/2, -h/2 - hs/2, hs, hs); // TL
                targetCtx.fillRect(w/2 - hs/2, -h/2 - hs/2, hs, hs);  // TR
                targetCtx.fillRect(-w/2 - hs/2, h/2 - hs/2, hs, hs);  // BL
                targetCtx.fillRect(w/2 - hs/2, h/2 - hs/2, hs, hs);   // BR
                
                targetCtx.beginPath();
                targetCtx.moveTo(0, -h/2);
                targetCtx.lineTo(0, -h/2 - 20 * scaleRatio);
                targetCtx.stroke();
                
                targetCtx.beginPath();
                targetCtx.arc(0, -h/2 - 25 * scaleRatio, 5 * scaleRatio, 0, Math.PI * 2);
                targetCtx.fill();
            }
        }
        targetCtx.restore();
    });
}
`;

content = content.replace(oldDraw, newDraw);
fs.writeFileSync(path, content);
console.log('Update Successful');
