const fs = require('fs');
let t = fs.readFileSync('js/robotEditor.js', 'utf8');

// 1) Inject panel data into getFormValues
t = t.replace('customSensors: currentGeometry ? currentGeometry.customSensors : null,', 
    'panelScreen: document.getElementById(\"panelScreenToggle\")?.checked || false,\n          panelButtons: window.getPanelButtonsState ? window.getPanelButtonsState() : [],\n          customSensors: currentGeometry ? currentGeometry.customSensors : null,');

// 2) Inject UI update logic
let injection = \
window.getPanelButtonsState = function() {
    let btns = [];
    const count = parseInt(document.getElementById('panelButtonCount')?.value || 0);
    for(let i=0; i<count; i++) {
        btns.push({
            color: document.getElementById('panelBtnColor_'+i)?.value || '#ff0000',
            size: parseInt(document.getElementById('panelBtnSize_'+i)?.value || 8)
        });
    }
    return btns;
};
window.renderPanelConfig = function() {
    const configDiv = document.getElementById('panelButtonsConfig');
    if (!configDiv) return;
    const isScreen = document.getElementById('panelScreenToggle').checked;
    const count = parseInt(document.getElementById('panelButtonCount').value);
    
    let html = '';
    if (isScreen) {
        html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px;\"><span>Pin Pantalla (SDA):</span>'+pinSelect('pinPanelScreen_SDA', 'A4')+'</div>';
        html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px;\"><span>Pin Pantalla (SCL):</span>'+pinSelect('pinPanelScreen_SCL', 'A5')+'</div>';
    }
    for(let i=0; i<count; i++) {
        const c = currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].color : '#ff0000';
        const s = currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].size : 8;
        html += '<div style=\"border: 1px solid #ccc; padding: 5px; margin-bottom: 5px;\">';
        html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px;\"><span>Color Botón '+(i+1)+':</span><input type=\"color\" id=\"panelBtnColor_'+i+'\" value=\"'+c+'\" onchange=\"window.forceGeometrySync()\"></div>';
        html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px;\"><span>Tamaño Botón '+(i+1)+':</span><input type=\"number\" id=\"panelBtnSize_'+i+'\" value=\"'+s+'\" min=\"4\" max=\"15\" onchange=\"window.forceGeometrySync()\"></div>';
        html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between;\"><span>Pin Botón '+(i+1)+':</span>'+pinSelect('pinPanelBtn_'+i, '')+'</div>';
        html += '</div>';
    }
    configDiv.innerHTML = html;
    
    // Attach change events to selects
    configDiv.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', window.forceGeometrySync);
        if(currentGeometry.connections && currentGeometry.connections.sensorPins) {
            const val = currentGeometry.connections.sensorPins[sel.id];
            if(val) sel.value = val;
        }
    });
};
\;

// Let's insert injection before initRobotEditor
t = t.replace('export function initRobotEditor', injection + '\nexport function initRobotEditor');

// 3) Hook up the events
t = t.replace('elems.horizontalSymmetryToggle.addEventListener(\\'change\\', () => { window.forceGeometrySync(); });', 
    'elems.horizontalSymmetryToggle.addEventListener(\\'change\\', () => { window.forceGeometrySync(); });\\n    const pt = document.getElementById(\\'panelScreenToggle\\'); if(pt) pt.addEventListener(\\'change\\', () => { window.renderPanelConfig(); window.forceGeometrySync(); });\\n    const pb = document.getElementById(\\'panelButtonCount\\'); if(pb) pb.addEventListener(\\'change\\', () => { window.renderPanelConfig(); window.forceGeometrySync(); });');

t = t.replace('renderCustomSensorsList();', 'renderCustomSensorsList(); if(window.renderPanelConfig) window.renderPanelConfig();');

// 4) Ensure connections state captures the panel config
t = t.replace('driverType: driverType', 'driverType: driverType'); // search marker
t = t.replace('motorPins: motorPins\n    };', 'motorPins: motorPins\n    };\n    if(document.getElementById(\\'panelScreenToggle\\')?.checked) { connections.sensorPins.pinPanelScreen_SDA = document.getElementById(\\'pinPanelScreen_SDA\\')?.value; connections.sensorPins.pinPanelScreen_SCL = document.getElementById(\\'pinPanelScreen_SCL\\')?.value; }\n    for(let i=0; i<parseInt(document.getElementById(\\'panelButtonCount\\')?.value||0); i++) { connections.sensorPins[\\'pinPanelBtn_\\'+i] = document.getElementById(\\'pinPanelBtn_\\'+i)?.value; }');

// 5) setFormValues needs to populate the form
t = t.replace('if (elems.sensorCountSelect && geometry.sensorCount) {', 
    'if(document.getElementById(\\'panelScreenToggle\\')) document.getElementById(\\'panelScreenToggle\\').checked = !!geometry.panelScreen;\n    if(document.getElementById(\\'panelButtonCount\\')) document.getElementById(\\'panelButtonCount\\').value = geometry.panelButtons ? geometry.panelButtons.length : 0;\n    if(window.renderPanelConfig) window.renderPanelConfig();\n    if (elems.sensorCountSelect && geometry.sensorCount) {');

fs.writeFileSync('js/robotEditor.js', t);
