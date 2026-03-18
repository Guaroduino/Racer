const fs = require('fs');
let file = fs.readFileSync('js/robotEditor.js', 'utf8');

file = file.replace(/if \(sym && sensor\.y_mm !== 0\)/g, 'if (sym)');

let oldStr = '        currentGeometry.customSensors.forEach((sensor, idx) => {\n            const sym = elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : false;';

let newStr = \        const sym = elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : false;

        // Render Normal IR Sensors to the list too as read-only.
        const offset = (currentGeometry.sensorOffset_m || 0) * 1000;
        const spread = (currentGeometry.sensorSpread_m || 0) * 1000;
        const count = currentGeometry.sensorCount || 3;
        
        let normalIRs = [];
        if (count === 2) normalIRs = [{label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Der.', x: offset, y: spread}];
        else if (count === 3) normalIRs = [{label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Cen.', x: offset, y: 0}, {label: 'IR Normal Der.', x: offset, y: spread}];
        else if (count === 4) normalIRs = [{label: 'IR Nor. Ext. Izq.', x: offset, y: -spread*2}, {label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Der.', x: offset, y: spread}, {label: 'IR Nor. Ext. Der.', x: offset, y: spread*2}];
        else if (count === 5) normalIRs = [{label: 'IR Nor. Ext. Izq.', x: offset, y: -spread*2}, {label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Cen.', x: offset, y: 0}, {label: 'IR Normal Der.', x: offset, y: spread}, {label: 'IR Nor. Ext. Der.', x: offset, y: spread*2}];
        else if (count === 6) normalIRs = [{label: 'IRNor MaxExt Izq', x: offset, y: -spread*3}, {label: 'IR Nor. Ext. Izq.', x: offset, y: -spread*2}, {label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Der.', x: offset, y: spread}, {label: 'IR Nor. Ext. Der.', x: offset, y: spread*2}, {label: 'IRNor MaxExt Der', x: offset, y: spread*3}];
        else if (count === 7) normalIRs = [{label: 'IRNor MaxExt Izq', x: offset, y: -spread*3}, {label: 'IR Nor. Ext. Izq.', x: offset, y: -spread*2}, {label: 'IR Normal Izq.', x: offset, y: -spread}, {label: 'IR Normal Cen.', x: offset, y: 0}, {label: 'IR Normal Der.', x: offset, y: spread}, {label: 'IR Nor. Ext. Der.', x: offset, y: spread*2}, {label: 'IRNor MaxExt Der', x: offset, y: spread*3}];
        else if (count === 8) normalIRs = [{label: 'IRNor MaxExt Izq', x: offset, y: -spread*3.5}, {label: 'IR Nor. Ext. Izq.', x: offset, y: -spread*2.5}, {label: 'IR Normal Izq.', x: offset, y: -spread*1.5}, {label: 'IR Nor. Cen. Izq', x: offset, y: -spread*0.5}, {label: 'IR Nor. Cen. Der', x: offset, y: spread*0.5}, {label: 'IR Normal Der.', x: offset, y: spread*1.5}, {label: 'IR Nor. Ext. Der.', x: offset, y: spread*2.5}, {label: 'IRNor MaxExt Der', x: offset, y: spread*3.5}];

        normalIRs.forEach((nir) => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.gap = '5px';
            item.style.marginBottom = '5px';
            item.style.alignItems = 'center';
            item.style.opacity = '0.7';
            item.style.backgroundColor = '#eef';
            item.style.padding = '2px';
            item.style.borderRadius = '4px';
            item.innerHTML = \\\
                <span style="font-size:0.8em; min-width:60px; color:#555;">\\\:</span>
                <input type="number" value="\\\" placeholder="X (mm)" style="width: 60px; font-size: 0.8em;" disabled>
                <input type="number" value="\\\" placeholder="Y (mm)" style="width: 60px; font-size: 0.8em;" disabled>
                <div style="width: 20px;"></div>
            \\\;
            elems.customSensorsList.appendChild(item);
        });

        currentGeometry.customSensors.forEach((sensor, idx) => {\;

file = file.replace(oldStr, newStr);

fs.writeFileSync('js/robotEditor.js', file);
console.log('done text replace');
