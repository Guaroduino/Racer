const fs = require('fs');

function fixEditor() {
    let t = fs.readFileSync('js/robotEditor.js', 'utf8');

    // 1. Inject panelScreen/panelButtons in getFormValues
    t = t.replace('customSensors: currentGeometry ? currentGeometry.customSensors : null,', 
        'panelScreen: document.getElementById(\"panelScreenToggle\") ? document.getElementById(\"panelScreenToggle\").checked : false,\n        panelButtons: window.getPanelButtonsState ? window.getPanelButtonsState() : [],\n        customSensors: currentGeometry ? currentGeometry.customSensors : null,');

    // 2. Inject panel functions
    const funcStr = "\nwindow.getPanelButtonsState = function() {\n  let btns = [];\n  let pb = document.getElementById('panelButtonCount');\n  let count = pb ? parseInt(pb.value) : 0;\n  for(let i=0; i<count; i++) {\n    btns.push({\n      color: document.getElementById('panelBtnColor_'+i) ? document.getElementById('panelBtnColor_'+i).value : '#ff0000',\n      size: document.getElementById('panelBtnSize_'+i) ? parseInt(document.getElementById('panelBtnSize_'+i).value) : 8\n    });\n  }\n  return btns;\n};\nwindow.renderPanelConfig = function() {\n  const cd = document.getElementById('panelButtonsConfig');\n  if(!cd) return;\n  const isSc = document.getElementById('panelScreenToggle').checked;\n  const count = parseInt(document.getElementById('panelButtonCount').value);\n  let html = '';\n  if(isSc) {\n    html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Pin Pantalla (SDA):</span>' + pinSelect('pinPanelScreen_SDA', 'A4') + '</div>';\n    html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Pin Pantalla (SCL):</span>' + pinSelect('pinPanelScreen_SCL', 'A5') + '</div>';\n  }\n  for(let i=0; i<count; i++) {\n    let c = currentGeometry && currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].color : '#ff0000';\n    let s = currentGeometry && currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].size : 8;\n    html += '<div style=\"background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.1); padding: 8px; margin-bottom: 5px; border-radius:4px;\">';\n    html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Color Botón '+(i+1)+':</span><input type=\"color\" id=\"panelBtnColor_'+i+'\" value=\"'+c+'\" onchange=\"window.forceGeometrySync()\"></div>';\n    html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Tamaño Botón '+(i+1)+':</span><input type=\"number\" style=\"width:60px;\" id=\"panelBtnSize_'+i+'\" value=\"'+s+'\" min=\"4\" max=\"15\" onchange=\"window.forceGeometrySync()\"></div>';\n    html += '<div class=\"pin-row\"><span>Pin Botón '+(i+1)+':</span>'+pinSelect('pinPanelBtn_'+i, '')+'</div>';\n    html += '</div>';\n  }\n  cd.innerHTML = html;\n  cd.querySelectorAll('select').forEach(sel => {\n    sel.addEventListener('change', window.forceGeometrySync);\n    if(currentGeometry && currentGeometry.connections && currentGeometry.connections.sensorPins && currentGeometry.connections.sensorPins[sel.id]) {\n      sel.value = currentGeometry.connections.sensorPins[sel.id];\n    }\n  });\n};\n";

    // inject after unction pinSelect body. Let's find end of pinSelect. Or just inside updateSensorConnectionsUI
    t = t.replace('window.renderCustomSensorsList = function() {', funcStr + '\n    window.renderCustomSensorsList = function() {');

    // hook up events
    t = t.replace('renderCustomSensorsList();', 'renderCustomSensorsList();\n                if(typeof window.renderPanelConfig===\"function\") window.renderPanelConfig();');

    // event listeners
    t = t.replace('elems.horizontalSymmetryToggle.addEventListener(\\'change\\', () => { window.forceGeometrySync(); });', 
        'elems.horizontalSymmetryToggle.addEventListener(\\'change\\', () => { window.forceGeometrySync(); });\n    let pt = document.getElementById(\"panelScreenToggle\"); if(pt) pt.addEventListener(\"change\", () => { window.renderPanelConfig(); window.forceGeometrySync(); });\n    let pb = document.getElementById(\"panelButtonCount\"); if(pb) pb.addEventListener(\"change\", () => { window.renderPanelConfig(); window.forceGeometrySync(); });');

    // Connections getFormValues
    t = t.replace('motorPins: motorPins\n    };', 'motorPins: motorPins\n    };\n    if(document.getElementById(\"panelScreenToggle\") && document.getElementById(\"panelScreenToggle\").checked) {\n      connections.sensorPins.pinPanelScreen_SDA = document.getElementById(\"pinPanelScreen_SDA\") ? document.getElementById(\"pinPanelScreen_SDA\").value : \"\";\n      connections.sensorPins.pinPanelScreen_SCL = document.getElementById(\"pinPanelScreen_SCL\") ? document.getElementById(\"pinPanelScreen_SCL\").value : \"\";\n    }\n    let pbC = document.getElementById(\"panelButtonCount\");\n    if (pbC) {\n      for(let i=0; i<parseInt(pbC.value); i++) {\n        let s = document.getElementById(\"pinPanelBtn_\"+i);\n        if(s) connections.sensorPins[\"pinPanelBtn_\"+i] = s.value;\n      }\n    }\n');

    // setFormValues
    t = t.replace('if (elems.sensorCountSelect && geometry.sensorCount) {', 'if(document.getElementById(\"panelScreenToggle\")) document.getElementById(\"panelScreenToggle\").checked = !!geometry.panelScreen;\n      if(document.getElementById(\"panelButtonCount\")) document.getElementById(\"panelButtonCount\").value = geometry.panelButtons ? geometry.panelButtons.length : 0;\n      if(typeof window.renderPanelConfig === \"function\") window.renderPanelConfig();\n      if (elems.sensorCountSelect && geometry.sensorCount) {');

    fs.writeFileSync('js/robotEditor.js', t);
}

fixEditor();
console.log('done');
