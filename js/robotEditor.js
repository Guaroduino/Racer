// js/robotEditor.js
console.log("Robot Editor Version: 1.1 - Zoom Fix Loading...");
import { getDOMElements, updateDynamicCodeHelp } from './ui.js';
import { DEFAULT_ROBOT_GEOMETRY, PIXELS_PER_METER } from './config.js';
import { Robot } from './robot.js';
import { initRobotParts, drawRobotPreview, getPlacedParts } from './robotParts.js';

let previewCanvas, previewCtx;
let previewRobot;
let currentGeometry = { ...DEFAULT_ROBOT_GEOMETRY };
let mainAppInterface;
let previewZoom = 1.0;
const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4.0;

export function initRobotEditor(appInterface) {
    console.log("Initializing robot editor...");
    mainAppInterface = appInterface;
    
    // We need to re-fetch elements after they might have been injected/moved
    let elems = getDOMElements();

    previewCanvas = elems.robotPreviewCanvas;
    if (!previewCanvas) {
        console.error("Robot Preview Canvas not found!");
        return;
    }
    previewCtx = previewCanvas.getContext('2d');
    console.log("Zoom buttons found:", { in: !!elems.zoomInBtn, out: !!elems.zoomOutBtn, reset: !!elems.zoomResetBtn });
    window.renderRobotPreview = renderRobotPreview;
    window.previewCenterOffset = { x: 0, y: 0 }; // Initialize for panning

    // Set fixed canvas size to 500x450 pixels (50cm x 45cm)
    previewCanvas.width = 500;
    previewCanvas.height = 450;

    // Set display size to match canvas size exactly (1:1 pixel mapping)
    previewCanvas.style.width = '100%';
    previewCanvas.style.height = '100%';

    console.log("Canvas size set to:", { width: previewCanvas.width, height: previewCanvas.height });

    // Initialize preview robot with default geometry
    previewRobot = new Robot(previewCanvas.width / 2 / PIXELS_PER_METER, previewCanvas.height / 2 / PIXELS_PER_METER, -Math.PI / 2);
    previewRobot.updateGeometry(DEFAULT_ROBOT_GEOMETRY);
    updateDynamicCodeHelp(DEFAULT_ROBOT_GEOMETRY);

    console.log("Preview robot initialized with geometry:", DEFAULT_ROBOT_GEOMETRY);

    // Load default geometry into input fields
    setFormValues(DEFAULT_ROBOT_GEOMETRY);

    // Initialize robot parts
    initRobotParts();

    // Set default zoom to Extents after initial loading
    setTimeout(() => {
        zoomExtents();
    }, 100);

    // Initialize robot selection dropdown
    initRobotSelectionDropdown();

    // Event listeners
    elems.applyRobotGeometryButton.addEventListener('click', () => {
        console.log("Applying robot geometry...");
        window.forceGeometrySync();
        // Get decorative parts and pass them to the simulation
        const decorativeParts = getPlacedParts();
        console.log("Decorative parts:", decorativeParts);
        mainAppInterface.updateRobotGeometry(currentGeometry, decorativeParts);
        alert("Geometría del robot actualizada y aplicada a la simulación (requiere reinicio de sim).");
    });

    // Zoom Controls
    const setZoom = (newZoom) => {
        previewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        console.log("Preview zoom set to:", previewZoom);
        renderRobotPreview();
    };

    if (elems.zoomInBtn) {
        elems.zoomInBtn.addEventListener('click', () => setZoom(previewZoom + ZOOM_STEP));
    }
    if (elems.zoomOutBtn) {
        elems.zoomOutBtn.addEventListener('click', () => setZoom(previewZoom - ZOOM_STEP));
    }
    if (elems.zoomResetBtn) {
        elems.zoomResetBtn.addEventListener('click', () => setZoom(1.0));
    }
    if (elems.zoomExtentsBtn) {
        elems.zoomExtentsBtn.addEventListener('click', () => zoomExtents());
    }

    window.getPreviewZoom = () => previewZoom;

    function updateDisabledPins() {
        // Obtenemos todos los selectores de pines relevantes (Sensores y Motores)
        const sensorContainer = document.getElementById('sensorConnectionsContainer');
        const motorContainer = elems.motorConnectionsContainer;
        if (!sensorContainer && !motorContainer) return;

        let allSelects = [];
        if (sensorContainer) allSelects = allSelects.concat(Array.from(sensorContainer.querySelectorAll('select')));
        if (motorContainer) allSelects = allSelects.concat(Array.from(motorContainer.querySelectorAll('select')));

        // Recolectar pines en uso (ignorando repetibles como VCC y GND, o vacíos)
        const usedPins = new Set();
        allSelects.forEach(sel => {
            const val = sel.value;
            if (val && val !== 'VCC' && val !== 'GND') {
                usedPins.add(val);
            }
        });

        // Iterar de nuevo para deshabilitar las opciones usadas
        allSelects.forEach(sel => {
            if (sel.dataset && sel.dataset.fixed === 'true') return;
            const currentVal = sel.value;
            Array.from(sel.options).forEach(opt => {
                const optVal = opt.value;
                if (!optVal || optVal === 'VCC' || optVal === 'GND' || opt.disabled === true && optVal === "") {
                    // Mantenemos el placeholders "sin seleccionar" intacto
                    return;
                }

                if (usedPins.has(optVal) && optVal !== currentVal) {
                    opt.disabled = true;
                    // opcional visual feedback (en uso)
                    if (!opt.text.endsWith(' (En uso)')) opt.text += ' (En uso)';
                } else {
                    opt.disabled = false;
                    opt.text = opt.text.replace(' (En uso)', '');
                }
            });
        });
    }

    window.forceGeometrySync = () => {
        currentGeometry = getFormValues();
        previewRobot.updateGeometry(currentGeometry);
        syncDecorativeSensorsWithGeometry();
        renderRobotPreview();
        updateDisabledPins();
        updateDynamicCodeHelp(currentGeometry);
    };

    // --- Dynamic UI for Connections ---
    function pinSelect(id, defaultVal, pwmOnly = false) {
        const board = document.getElementById('arduinoBoardSelect') ? document.getElementById('arduinoBoardSelect').value : 'uno';
        
        let pwmPins = [];
        let allPins = [];
        
        if (board === 'uno') {
            pwmPins = [3, 5, 6, 9, 10, 11];
            allPins = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
        } else if (board === 'mega') {
            pwmPins = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]; // Common PWMs on MEGA
            for(let i=0; i<=53; i++) allPins.push(i);
            for(let i=0; i<=15; i++) allPins.push(`A${i}`);
        }

        const pins = pwmOnly ? pwmPins : allPins;
        const pwmSet = new Set(pwmPins);

        let opts = `<option value="" disabled selected>(sin seleccionar)</option>`;
        opts += `<option value="VCC">Puente a Positivo (VCC)</option>`;
        opts += `<option value="GND">Puente a Negativo (GND)</option>`;

        opts += pins.map(p => {
            const label = pwmSet.has(p) ? `${p} — PWM~ / Digital` : `${p} — Digital/Analógico`;
            return `<option value="${p}">${label}</option>`;
        }).join('');
        return `<select id="${id}">${opts}</select>`;
    }

    function getBoardFixedPins() {
        const board = document.getElementById('arduinoBoardSelect') ? document.getElementById('arduinoBoardSelect').value : 'uno';
        if (board === 'mega') {
            return {
                i2cSDA: '20',
                i2cSCL: '21',
                spiSCK: '52',
                spiMOSI: '51',
                spiMISO: '50'
            };
        }
        return {
            i2cSDA: 'A4',
            i2cSCL: 'A5',
            spiSCK: '13',
            spiMOSI: '11',
            spiMISO: '12'
        };
    }

    function fixedPinSelect(id, pinValue, busLabel) {
        return `<select id="${id}" data-fixed="true" disabled><option value="${pinValue}" selected>${pinValue} — Fijo ${busLabel}</option></select>`;
    }

    function updateMotorConnectionsUI() {
        if (!elems.motorDriverTypeSelect || !elems.motorConnectionsContainer) return;
        const type = elems.motorDriverTypeSelect.value;
        let html = '';
        if (type === 'l298n') {
            html = `
                <div class="pin-row">
                    <span><strong>Motor Izq.</strong> — ENA (PWM~):</span>
                    ${pinSelect('pinMotorLeftEn', '', true)}
                </div>
                <div class="pin-row">
                    <span>IN1 (dirección):</span>
                    ${pinSelect('pinMotorLeftIn1', '')}
                </div>
                <div class="pin-row">
                    <span>IN2 (dirección):</span>
                    ${pinSelect('pinMotorLeftIn2', '')}
                </div>
                <div class="pin-row" style="margin-top:0.5em;">
                    <span><strong>Motor Der.</strong> — ENB (PWM~):</span>
                    ${pinSelect('pinMotorRightEn', '', true)}
                </div>
                <div class="pin-row">
                    <span>IN3 (dirección):</span>
                    ${pinSelect('pinMotorRightIn3', '')}
                </div>
                <div class="pin-row">
                    <span>IN4 (dirección):</span>
                    ${pinSelect('pinMotorRightIn4', '')}
                </div>`;
        } else if (type === 'mx1616') {
            html = `
                <div class="pin-row">
                    <span><strong>Motor Izq.</strong> — IN1 (PWM~):</span>
                    ${pinSelect('pinMotorLeftIn1', '', true)}
                </div>
                <div class="pin-row">
                    <span>IN2 (PWM~):</span>
                    ${pinSelect('pinMotorLeftIn2', '', true)}
                </div>
                <div class="pin-row" style="margin-top:0.5em;">
                    <span><strong>Motor Der.</strong> — IN3 (PWM~):</span>
                    ${pinSelect('pinMotorRightIn3', '', true)}
                </div>
                <div class="pin-row">
                    <span>IN4 (PWM~):</span>
                    ${pinSelect('pinMotorRightIn4', '', true)}
                </div>`;
        } else { // single / ESCs
            html = `
                <div class="pin-row">
                    <span><strong>Motor Izq. (ESC)</strong> — PWM~:</span>
                    ${pinSelect('pinMotorLeftPWM', '', true)}
                </div>
                <div class="pin-row">
                    <span><strong>Motor Der. (ESC)</strong> — PWM~:</span>
                    ${pinSelect('pinMotorRightPWM', '', true)}
                </div>`;
        }
        elems.motorConnectionsContainer.innerHTML = html;

        // Re-bind listeners for the newly injected selects
        const selects = elems.motorConnectionsContainer.querySelectorAll('select');
        selects.forEach(sel => {
            sel.addEventListener('change', () => { window.forceGeometrySync(); });
        });
    }

    if (elems.motorDriverTypeSelect) {
        elems.motorDriverTypeSelect.addEventListener('change', () => {
            updateMotorConnectionsUI();
            window.forceGeometrySync();
        });
        updateMotorConnectionsUI(); // Initial call

        // Bind sensor selects to trigger sync (selects use 'change', not 'input')
        [elems.pinSensorFarLeftInput, elems.pinSensorLeftInput, elems.pinSensorCenterInput, elems.pinSensorRightInput, elems.pinSensorFarRightInput].forEach(sel => {
            if (sel) sel.addEventListener('change', () => { window.forceGeometrySync(); });
        });
    }

    function updateSensorConnectionsUI(count) {
        // Rebuild static IR selects with board-specific options (UNO/MEGA)
        // so loaded values like 22/23/24 are valid options on MEGA.
        const staticSensorMap = {
            pinSensorFullFarLeft: 'fullFarLeft',
            pinSensorFarLeft: 'farLeft',
            pinSensorLeft: 'left',
            pinSensorCenter: 'center',
            pinSensorRight: 'right',
            pinSensorFarRight: 'farRight',
            pinSensorFullFarRight: 'fullFarRight'
        };

        Object.entries(staticSensorMap).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (!el) return;

            const desired = (currentGeometry && currentGeometry.connections && currentGeometry.connections.sensorPins)
                ? (currentGeometry.connections.sensorPins[key] || '')
                : (el.value || '');

            const wrapper = el.parentNode;
            if (!wrapper) return;

            el.outerHTML = pinSelect(id, desired);
            const rebuilt = document.getElementById(id);
            if (rebuilt) {
                if (desired) rebuilt.value = String(desired);
                rebuilt.addEventListener('change', () => window.forceGeometrySync());
            }
        });

        const rowFarLeft = document.getElementById('rowSensorFarLeft');
        const rowCenter = document.getElementById('rowSensorCenter');
        const rowFarRight = document.getElementById('rowSensorFarRight');
        const rowFullFarLeft = document.getElementById('rowSensorFullFarLeft');
        const rowFullFarRight = document.getElementById('rowSensorFullFarRight');

        if (rowFarLeft) rowFarLeft.style.display = (count >= 4) ? 'flex' : 'none';
        if (rowCenter) rowCenter.style.display = (count % 2 !== 0 && count !== 8) ? 'flex' : 'none'; 
        if (rowFarRight) rowFarRight.style.display = (count >= 4) ? 'flex' : 'none';
        if (rowFullFarLeft) rowFullFarLeft.style.display = (count >= 6) ? 'flex' : 'none';
        if (rowFullFarRight) rowFullFarRight.style.display = (count >= 6) ? 'flex' : 'none';

        // Render Custom Sensors Pins
        const container = document.getElementById('sensorConnectionsContainer');
        if (container) {
            // Remove existing static/dynamic sensor pin rows for special sensors if not in HTML
            // Note: Since we only have static rows in HTML for 5+2=7 sensors, 
            // for the 8th sensor (center split), we might need to inject rows if we don't want to over-complicate HTML.
            // But let's see if 8 sensors is okay with current names. 
            // 8 sensors use: fullFarLeft, farLeft, left, centerLeft, centerRight, right, farRight, fullFarRight.
            // We need 2 more rows for centerLeft/centerRight when count == 8.
            const existingSpecial = container.querySelectorAll('.special-sensor-pin');
            existingSpecial.forEach(el => el.remove());

            if (count === 8) {
                // Find where to insert (between pinSensorLeft and pinSensorRight)
                const rowLeft = document.getElementById('pinSensorLeft').parentNode;
                const rowRight = document.getElementById('pinSensorRight').parentNode;

                const rowCL = document.createElement('div');
                rowCL.className = 'pin-row sensor-pin-config special-sensor-pin';
                rowCL.innerHTML = `<span>Pin Sensor Centro Izq.:</span>${pinSelect('pinSensorCenterLeft', '')}`;
                
                const rowCR = document.createElement('div');
                rowCR.className = 'pin-row sensor-pin-config special-sensor-pin';
                rowCR.innerHTML = `<span>Pin Sensor Centro Der.:</span>${pinSelect('pinSensorCenterRight', '')}`;

                // Insert into the ordered sequence
                container.insertBefore(rowCL, rowRight);
                container.insertBefore(rowCR, rowRight);

                // Set values if they exist in currentGeometry
                const selCL = rowCL.querySelector('select');
                const selCR = rowCR.querySelector('select');
                if (currentGeometry?.connections?.sensorPins) {
                    if (selCL) selCL.value = currentGeometry.connections.sensorPins.centerLeft || '';
                    if (selCR) selCR.value = currentGeometry.connections.sensorPins.centerRight || '';
                }
                [selCL, selCR].forEach(s => s?.addEventListener('change', () => window.forceGeometrySync()));
            }

            // Normal sensors symmetry (_rear)
            const sym = typeof elems !== 'undefined' && elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : (document.getElementById('horizontalSymmetryToggle') ? document.getElementById('horizontalSymmetryToggle').checked : false);
            if (sym) {
                let activeSensors = [];
                if (count === 1) activeSensors = ['center'];
                else if (count === 2) activeSensors = ['left', 'right'];
                else if (count === 3) activeSensors = ['left', 'center', 'right'];
                else if (count === 4) activeSensors = ['farLeft', 'left', 'right', 'farRight'];
                else if (count === 5) activeSensors = ['farLeft', 'left', 'center', 'right', 'farRight'];
                else if (count === 6) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'right', 'farRight', 'fullFarRight'];
                else if (count === 7) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'center', 'right', 'farRight', 'fullFarRight'];
                else if (count === 8) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'centerLeft', 'centerRight', 'right', 'farRight', 'fullFarRight'];

                const labelMap = {
                    center: 'Centro',
                    left: 'Izq.',
                    right: 'Der.',
                    farLeft: 'Ext. Izq.',
                    farRight: 'Ext. Der.',
                    fullFarLeft: 'Max. Izq.',
                    fullFarRight: 'Max. Der.',
                    centerLeft: 'Cen. Izq.',
                    centerRight: 'Cen. Der.'
                };

                // Add to DOM right before custom sensors
                activeSensors.forEach(sensorKey => {
                    const rowRear = document.createElement('div');
                    rowRear.className = 'pin-row sensor-pin-config special-sensor-pin';
                    const idKey = 'pinSensor' + sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1) + '_rear';
                    rowRear.innerHTML = `<span>Pin Sensor ${labelMap[sensorKey]} Tras:</span>${pinSelect(idKey, '')}`;
                    
                    container.appendChild(rowRear);
                    const selRear = rowRear.querySelector('select');
                    if (currentGeometry?.connections?.sensorPins) {
                        if (selRear) selRear.value = currentGeometry.connections.sensorPins[sensorKey + '_rear'] || '';
                    }
                    if (selRear) selRear.addEventListener('change', () => window.forceGeometrySync());
                });
            }

            // existing custom sensor logic...
            const existingCustoms = container.querySelectorAll('.custom-sensor-pin');
            existingCustoms.forEach(el => el.remove());

            if (currentGeometry && currentGeometry.customSensors) {
                const sym = typeof elems !== 'undefined' && elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : (document.getElementById('horizontalSymmetryToggle') ? document.getElementById('horizontalSymmetryToggle').checked : false);
                const fixedPins = getBoardFixedPins();

                currentGeometry.customSensors.forEach((sensor, idx) => {
                    let typeLabel = "Custom";
                    if (sensor.type === 'ir') typeLabel = "IR Custom";
                    else if (sensor.type === 'rgb') typeLabel = "Color RGB";
                    else if (sensor.type === 'rfid') typeLabel = "RFID";
                    else if (sensor.type === 'tof') typeLabel = "ToF";
                    else if (sensor.type === 'led') typeLabel = "LED";
                    else if (sensor.type === 'screen') typeLabel = "OLED";

                    const isMultiPin = sensor.type === 'rgb' || sensor.type === 'tof' || sensor.type === 'rfid' || sensor.type === 'screen';
                    
                    const groupContainer = document.createElement('div');
                    groupContainer.className = 'custom-sensor-pin'; // use same class so it gets cleared properly on redraw
                    if (isMultiPin) {
                        groupContainer.style.borderLeft = '3px solid #ff7f50';
                        groupContainer.style.paddingLeft = '10px';
                        groupContainer.style.marginLeft = '4px';
                        groupContainer.style.marginBottom = '8px';
                    } else {
                        groupContainer.style.marginBottom = '8px';
                    }
                    container.appendChild(groupContainer);

                    const createRow = (labelText, idSuffix, fixedPinValue = null, fixedBusLabel = '', pwmOnly = false) => {
                        const r = document.createElement('div');
                        r.className = 'pin-row sensor-pin-config';
                        
                        // We no longer need the hardcoded inline left margin if it's placed inside the grouped bordered container.
                        r.innerHTML = `
                            <span>${labelText}:</span>
                            ${fixedPinValue ? fixedPinSelect(`pinSensorCustom_${idx}${idSuffix}`, fixedPinValue, fixedBusLabel) : pinSelect(`pinSensorCustom_${idx}${idSuffix}`, '', pwmOnly)}
                        `;
                        groupContainer.appendChild(r);

                        const sel = r.querySelector('select');
                        if (sel) {
                            const pinKey = `custom_${idx}${idSuffix}`;
                            if (fixedPinValue) {
                                sel.value = String(fixedPinValue);
                            } else {
                                sel.addEventListener('change', () => { window.forceGeometrySync(); });
                            }
                            if (!fixedPinValue && currentGeometry.connections && currentGeometry.connections.sensorPins && currentGeometry.connections.sensorPins[pinKey]) {
                                sel.value = currentGeometry.connections.sensorPins[pinKey];
                            }
                        }
                    };

                    if (sensor.type === 'rgb' || sensor.type === 'tof' || sensor.type === 'screen') {
                        createRow(`Pin ${typeLabel} ${idx + 1} (SDA, fijo) <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_SDA', fixedPins.i2cSDA, 'I2C');
                        createRow(`Pin ${typeLabel} ${idx + 1} (SCL, fijo) <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_SCL', fixedPins.i2cSCL, 'I2C');
                    } else if (sensor.type === 'rfid') {
                        createRow(`Pin ${typeLabel} ${idx + 1} (SDA_SS)`, '_SDA');
                        createRow(`Pin ${typeLabel} ${idx + 1} (SCK, fijo) <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_SCK', fixedPins.spiSCK, 'SPI');
                        createRow(`Pin ${typeLabel} ${idx + 1} (MOSI, fijo) <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_MOSI', fixedPins.spiMOSI, 'SPI');
                        createRow(`Pin ${typeLabel} ${idx + 1} (MISO, fijo) <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_MISO', fixedPins.spiMISO, 'SPI');
                        createRow(`Pin ${typeLabel} ${idx + 1} (RST)`, '_RST');
                    } else if (sensor.type === 'led') {
                        createRow(`Pin ${typeLabel} ${idx + 1} (PWM recomendado)`, '', null, '', true);
                    } else {
                        createRow(`Pin ${typeLabel} ${idx + 1}`, '');
                    }

                    // Clones for custom sensors based on symmetry
                    if (sym) {
                        const createRowClone = (labelText, idSuffix) => {
                            createRow(labelText + ' C.', '_sym' + idSuffix);
                        };

                        if (sensor.type === 'rgb' || sensor.type === 'tof' || sensor.type === 'screen') {
                            createRow(`Pin ${typeLabel} ${idx + 1} (SDA, fijo) C. <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_sym_SDA', fixedPins.i2cSDA, 'I2C');
                            createRow(`Pin ${typeLabel} ${idx + 1} (SCL, fijo) C. <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_sym_SCL', fixedPins.i2cSCL, 'I2C');
                        } else if (sensor.type === 'rfid') {
                            createRowClone(`Pin ${typeLabel} ${idx + 1} (SDA_SS)`, '_SDA');
                            createRow(`Pin ${typeLabel} ${idx + 1} (SCK, fijo) C. <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_sym_SCK', fixedPins.spiSCK, 'SPI');
                            createRow(`Pin ${typeLabel} ${idx + 1} (MOSI, fijo) C. <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_sym_MOSI', fixedPins.spiMOSI, 'SPI');
                            createRow(`Pin ${typeLabel} ${idx + 1} (MISO, fijo) C. <span class="fixed-pin-badge" title="Pin fijo por hardware">🔒</span>`, '_sym_MISO', fixedPins.spiMISO, 'SPI');
                            createRowClone(`Pin ${typeLabel} ${idx + 1} (RST)`, '_RST');
                        } else if (sensor.type === 'led') {
                            createRow(`Pin ${typeLabel} ${idx + 1} (PWM recomendado) C.`, '_sym', null, '', true);
                        } else {
                            createRowClone(`Pin ${typeLabel} ${idx + 1}`, '');
                        }
                    }
                });
            }
        }
    }

    window.updateSensorConnectionsUI = updateSensorConnectionsUI;
    window.updateMotorConnectionsUI = updateMotorConnectionsUI;

    // --- Sensor count dropdown logic ---
    if (elems.sensorCountSelect) {
        elems.sensorCountSelect.addEventListener('change', () => {
            const count = parseInt(elems.sensorCountSelect.value);
            currentGeometry.sensorCount = count;
            updateSensorConnectionsUI(count);
            previewRobot.updateGeometry(currentGeometry);
            syncDecorativeSensorsWithGeometry();
            renderRobotPreview();
        });
        updateSensorConnectionsUI(parseInt(elems.sensorCountSelect.value) || 3);
    }
    
    // --- Arduino Board Select logic ---
    if (elems.arduinoBoardSelect) {
        elems.arduinoBoardSelect.addEventListener('change', () => {
            // Re-render connections UI to update available pins
            const count = parseInt(elems.sensorCountSelect ? elems.sensorCountSelect.value : 3);
            updateSensorConnectionsUI(count);
            updateMotorConnectionsUI();
            if (window.renderCustomSensorsList) {
                window.renderCustomSensorsList();
            }
            if (window.renderPanelConfig) {
                window.renderPanelConfig();
            }
        });
    }

    // --- Custom Sensors Logic ---
    const panelT = document.getElementById('panelScreenToggle');
    if (panelT) {
        panelT.addEventListener('change', () => {
            if(window.renderPanelConfig) window.renderPanelConfig();
            window.forceGeometrySync();
        });
    }
    const panelC = document.getElementById('panelButtonCount');
    if (panelC) {
        panelC.addEventListener('change', () => {
            if(window.renderPanelConfig) window.renderPanelConfig();
            window.forceGeometrySync();
        });
    }

    if (elems.horizontalSymmetryToggle) {
        elems.horizontalSymmetryToggle.addEventListener('change', (e) => {
            const isSym = e.target.checked;
            // Actualizar el modo de simetría local si existe
            if(window.setSymmetryMode) window.setSymmetryMode(isSym);
            
            // Forzamos sync para actualizar geometría con la nueva bandera
            let newGeo = getFormValues();
            currentGeometry.horizontalSymmetry = isSym; // Force true here as getFormValues might be slightly out of sync if DOM hasn't flushed
            
            // Re-render custom sensors list para mostrar/ocultar sombras
            if (window.renderCustomSensorsList) {
                window.renderCustomSensorsList();
            }
            
            updateSensorConnectionsUI(currentGeometry.sensorCount || 3);
            window.forceGeometrySync();
        });
    }

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
        const isScreen = document.getElementById('panelScreenToggle')?.checked;
        const count = parseInt(document.getElementById('panelButtonCount')?.value || 0);
        const fixedPins = getBoardFixedPins();
        
        let html = '';
        if (isScreen) {
            html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Pin Pantalla (SDA, fijo) <span class=\"fixed-pin-badge\" title=\"Pin fijo por hardware\">🔒</span>:</span>'+fixedPinSelect('pinPanelScreen_SDA', fixedPins.i2cSDA, 'I2C')+'</div>';
            html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Pin Pantalla (SCL, fijo) <span class=\"fixed-pin-badge\" title=\"Pin fijo por hardware\">🔒</span>:</span>'+fixedPinSelect('pinPanelScreen_SCL', fixedPins.i2cSCL, 'I2C')+'</div>';
        }
        for(let i=0; i<count; i++) {
            const c = currentGeometry && currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].color : '#ff0000';
            const s = currentGeometry && currentGeometry.panelButtons && currentGeometry.panelButtons[i] ? currentGeometry.panelButtons[i].size : 12;
            html += '<div style=\"background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.1); padding: 8px; margin-bottom: 5px; border-radius:4px;\">';
            html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Color Botón '+(i+1)+':</span><input type=\"color\" id=\"panelBtnColor_'+i+'\" value=\"'+c+'\" onchange=\"window.forceGeometrySync()\"></div>';
            html += '<div style=\"display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;\"><span>Tamaño '+(i+1)+':</span><input type=\"number\" style=\"width:60px;\" id=\"panelBtnSize_'+i+'\" value=\"'+s+'\" min=\"4\" max=\"20\" onchange=\"window.forceGeometrySync()\"></div>';
            html += '<div class=\"pin-row\" style=\"display:flex; justify-content:space-between; align-items:center;\"><span>Pin Botón '+(i+1)+':</span>'+pinSelect('pinPanelBtn_'+i, '')+'</div>';
            html += '</div>';
        }
        configDiv.innerHTML = html;
        
        configDiv.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', window.forceGeometrySync);
            if (sel.dataset && sel.dataset.fixed === 'true') {
                sel.value = sel.options[0]?.value || sel.value;
                return;
            }
            if(currentGeometry && currentGeometry.connections && currentGeometry.connections.sensorPins) {
                const val = currentGeometry.connections.sensorPins[sel.id];
                if(val) sel.value = val;
            }
        });
    };

    window.renderCustomSensorsList = function() {
        const elems = getDOMElements();
        if (!elems.customSensorsList) return;
        elems.customSensorsList.innerHTML = '';
        if (!currentGeometry.customSensors) currentGeometry.customSensors = [];

        currentGeometry.customSensors.forEach((sensor, idx) => {
            const createSensorRow = (isClone) => {
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.gap = '5px';
                item.style.marginBottom = '5px';
                item.style.alignItems = 'center';
                if (isClone) {
                    item.style.opacity = '0.6';
                    item.style.backgroundColor = '#f0f0f0';
                    item.style.padding = '2px';
                    item.style.borderRadius = '4px';
                }

                let extraHTML = '';
                if (sensor.type === 'tof') {
                    let dispAngle = sensor.angle || 0;
                    if (isClone) {
                        dispAngle = 180 - dispAngle;
                        if (dispAngle > 180) dispAngle -= 360;
                    }
                    extraHTML = `<input type="number" step="1" id="customSensorAngle_${idx}${isClone ? '_sym' : ''}" value="${dispAngle}" placeholder="Ángulo (°)" style="width: 70px; font-size: 0.8em;" title="Ángulo" ${isClone ? 'disabled' : ''}>
                                 <input type="number" step="1" id="customSensorMaxDist_${idx}${isClone ? '_sym' : ''}" value="${sensor.maxDistance || 500}" placeholder="Máx (mm)" style="width: 70px; font-size: 0.8em;" title="Distancia Máxima (mm)" ${isClone ? 'disabled' : ''}>
                                 <input type="text" id="customSensorI2C_${idx}${isClone ? '_sym' : ''}" value="${isClone ? (sensor.i2cAddressSym || '0x2A') : (sensor.i2cAddress || '0x29')}" placeholder="I2C" style="width: 50px; font-size: 0.8em;" title="Dirección I2C">`;
                } else if (sensor.type === 'rgb' || sensor.type === 'rfid' || sensor.type === 'led') {
                    extraHTML = `<input type="number" step="1" id="customSensorDiam_${idx}${isClone ? '_sym' : ''}" value="${sensor.detectionDiameter || 50}" placeholder="Diám. (mm)" style="width: 70px; font-size: 0.8em;" title="Diámetro" ${isClone ? 'disabled' : ''}>`;
                    if (sensor.type === 'led') {
                        extraHTML += `<input type="color" id="customSensorColor_${idx}${isClone ? '_sym' : ''}" value="${sensor.color || '#ff0000'}" style="width: 30px; height: 20px; padding:0; border:none; margin-left: 5px;" title="Color LED" ${isClone ? 'disabled' : ''}>`;
                    }
                } else if (sensor.type === 'ir') {
                    extraHTML = `<input type="number" step="1" id="customSensorNumPins_${idx}${isClone ? '_sym' : ''}" value="${sensor.numPins || 1}" placeholder="Pines" style="width: 60px; font-size: 0.8em;" title="Cantidad de Pines" ${isClone ? 'disabled' : ''}>`;
                }

                let typeLabel = "Custom";
                if (sensor.type === 'ir') typeLabel = "IR Custom";
                else if (sensor.type === 'rgb') typeLabel = "Color RGB";
                else if (sensor.type === 'rfid') typeLabel = "RFID";
                else if (sensor.type === 'tof') typeLabel = "ToF";
                else if (sensor.type === 'led') typeLabel = "LED";
                else if (sensor.type === 'screen') typeLabel = "OLED";

                if (isClone) typeLabel += " (Espejo)";

                let valX = sensor.x_mm;
                if (isClone) valX = -valX;

                item.innerHTML = `
                    <span style="font-size:0.8em; min-width:60px;">${typeLabel}:</span>
                    <input type="number" step="1" id="customSensorX_${idx}${isClone ? '_sym' : ''}" value="${valX}" placeholder="X (mm)" style="width: 60px; font-size: 0.8em;" ${isClone ? 'disabled' : ''}>
                    <input type="number" step="1" id="customSensorY_${idx}${isClone ? '_sym' : ''}" value="${sensor.y_mm}" placeholder="Y (mm)" style="width: 60px; font-size: 0.8em;" ${isClone ? 'disabled' : ''}>
                    ${extraHTML}
                    ${!isClone ? `
                    <label style="font-size: 0.8em; display:flex; align-items:center; cursor:pointer;" title="Simétrico atrás">
                        <input type="checkbox" id="customSensorSym_${idx}" ${sensor.symmetric ? 'checked' : ''}> Sym
                    </label>
                    <button type="button" class="delCustomSensorBtn" data-idx="${idx}" style="padding: 2px 5px; font-size: 0.8em; background-color: #dc3545;" title="Borrar">X</button>` : `<div style="width: 20px;"></div>`}
                `;
                return item;
            };

            const mainItem = createSensorRow(false);
            elems.customSensorsList.appendChild(mainItem);

            let cloneItem = null;
            if (sensor.symmetric) {
                cloneItem = createSensorRow(true);
                elems.customSensorsList.appendChild(cloneItem);
            }

            // Bind events for live update on original
            const inX = mainItem.querySelector(`#customSensorX_${idx}`);
            const inY = mainItem.querySelector(`#customSensorY_${idx}`);
            const inSym = mainItem.querySelector(`#customSensorSym_${idx}`);
            let inAngle = null;
            let inDiam = null;
            let inCol = null;
            let inMaxDist = null;
            let inI2C = null;
              let inNumPins = null;
              if (sensor.type === 'tof') {
                  inAngle = mainItem.querySelector(`#customSensorAngle_${idx}`);
                  inMaxDist = mainItem.querySelector(`#customSensorMaxDist_${idx}`);
                  inI2C = mainItem.querySelector(`#customSensorI2C_${idx}`);
              }
              if (sensor.type === 'rgb' || sensor.type === 'rfid' || sensor.type === 'led') inDiam = mainItem.querySelector(`#customSensorDiam_${idx}`);
              if (sensor.type === 'led') inCol = mainItem.querySelector(`#customSensorColor_${idx}`);
              if (sensor.type === 'ir') inNumPins = mainItem.querySelector(`#customSensorNumPins_${idx}`);

              const updateVal = () => {
                  let newX = parseFloat(inX.value) || 0;
                  if (sensor.symmetric && newX < 0) {
                      newX = Math.abs(newX);
                      inX.value = newX;
                  }
                  currentGeometry.customSensors[idx].x_mm = newX;
                  currentGeometry.customSensors[idx].y_mm = parseFloat(inY.value) || 0;
                  if (inAngle) currentGeometry.customSensors[idx].angle = parseFloat(inAngle.value) || 0;
                  if (inMaxDist) currentGeometry.customSensors[idx].maxDistance = parseFloat(inMaxDist.value) || 500;
                  if (inI2C) currentGeometry.customSensors[idx].i2cAddress = inI2C.value || '0x29';
                  if (inDiam) currentGeometry.customSensors[idx].detectionDiameter = parseFloat(inDiam.value) || 0;
                  if (inCol) currentGeometry.customSensors[idx].color = inCol.value;
                  if (inNumPins) currentGeometry.customSensors[idx].numPins = parseInt(inNumPins.value) || 1;
                  if (cloneItem) {
                         const cX = cloneItem.querySelector(`#customSensorX_${idx}_sym`);
                         const cY = cloneItem.querySelector(`#customSensorY_${idx}_sym`);
                         if (cX) cX.value = -(currentGeometry.customSensors[idx].x_mm);
                         if (cY) cY.value = currentGeometry.customSensors[idx].y_mm;
                         if (inAngle) {
                             const cA = cloneItem.querySelector(`#customSensorAngle_${idx}_sym`);
                             if (cA) {
                                  let a = 180 - (currentGeometry.customSensors[idx].angle || 0);
                                  if (a > 180) a -= 360;
                                  cA.value = a;
                             }
                         }
                         if (inMaxDist) {
                             const cM = cloneItem.querySelector(`#customSensorMaxDist_${idx}_sym`);
                             if (cM) cM.value = currentGeometry.customSensors[idx].maxDistance || 500;
                         }
                         if (inDiam) {
                             const cD = cloneItem.querySelector(`#customSensorDiam_${idx}_sym`);
                             if (cD) cD.value = currentGeometry.customSensors[idx].detectionDiameter || 0;
                         }
                  }
                  window.forceGeometrySync();
            };
            inX.addEventListener('input', updateVal);
            inY.addEventListener('input', updateVal);
            if (inSym) {
                inSym.addEventListener('change', (e) => {
                    currentGeometry.customSensors[idx].symmetric = e.target.checked;
                    updateVal(); // Recalculate clamps
                    window.renderCustomSensorsList();
                    if(typeof updateSensorConnectionsUI === 'function') updateSensorConnectionsUI(currentGeometry.sensorCount);
                    window.forceGeometrySync();
                });
            }
            if (inAngle) inAngle.addEventListener('input', updateVal);
            if (inMaxDist) inMaxDist.addEventListener('input', updateVal);
            if (inI2C) inI2C.addEventListener('input', updateVal);
            if (inDiam) inDiam.addEventListener('input', updateVal);
            if (inCol) inCol.addEventListener('input', updateVal);
            if (cloneItem && sensor.type === 'tof') {
                const cI = cloneItem.querySelector(`#customSensorI2C_${idx}_sym`);
                if (cI) {
                    cI.addEventListener('input', () => {
                        currentGeometry.customSensors[idx].i2cAddressSym = cI.value;
                        window.forceGeometrySync();
                    });
                }
            }
        });

        // Bind delete buttons
        const delBtns = elems.customSensorsList.querySelectorAll('.delCustomSensorBtn');
        delBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                currentGeometry.customSensors.splice(idx, 1);

                // Cleanup pin config if needed
                if (currentGeometry.connections && currentGeometry.connections.sensorPins) {
                    delete currentGeometry.connections.sensorPins[`custom_${idx}`];
                    // shift remaining pins
                    for (let i = idx; i < currentGeometry.customSensors.length; i++) {
                        currentGeometry.connections.sensorPins[`custom_${i}`] = currentGeometry.connections.sensorPins[`custom_${i + 1}`] || '';
                    }
                    delete currentGeometry.connections.sensorPins[`custom_${currentGeometry.customSensors.length}`];
                }

                window.renderCustomSensorsList();
                if (typeof updateSensorConnectionsUI === 'function') {
                    updateSensorConnectionsUI(currentGeometry.sensorCount);
                } else if (window.updateSensorConnectionsUI) {
                    window.updateSensorConnectionsUI(currentGeometry.sensorCount);
                }
                window.forceGeometrySync();
            });
        });
    };
    const renderCustomSensorsList = window.renderCustomSensorsList;

    if (elems.addCustomSensorBtn) {
        elems.addCustomSensorBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            currentGeometry.customSensors.push({ type: 'ir', x_mm: 50, y_mm: 0 }); // Default pos
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }

    if (elems.addLEDBtn) {
        elems.addLEDBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            currentGeometry.customSensors.push({ type: 'led', x_mm: 50, y_mm: 0, detectionDiameter: 10, color: '#ff0000' });
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }

    if (elems.addScreenBtn) {
        elems.addScreenBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            currentGeometry.customSensors.push({ type: 'screen', x_mm: 50, y_mm: 0 });
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }
    
    if (elems.addRFIDReaderBtn) {
        elems.addRFIDReaderBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            currentGeometry.customSensors.push({ type: 'rfid', x_mm: 50, y_mm: 0, detectionDiameter: 50 }); // Default pos
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }
    
    if (elems.addColorSensorBtn) {
        elems.addColorSensorBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            currentGeometry.customSensors.push({ type: 'rgb', x_mm: 50, y_mm: 0, detectionDiameter: 5 }); // Default pos
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }
    
    if (elems.addDistanceSensorBtn) {
        elems.addDistanceSensorBtn.addEventListener('click', () => {
            if (!currentGeometry.customSensors) currentGeometry.customSensors = [];
            
            // Encuentra una dirección I2C disponible base partiendo de 0x24 y el de simétrico en 0x25, etc.
            let i2cBase = 41; // 0x29 en decimal
            let iter = 0;
            let currentI2C = '0x29';
            let currentI2CSym = '0x2A';

            // Comprueba simples conflictos para generar uno nuevo automáticamente.
            while (true) {
                currentI2C = '0x' + i2cBase.toString(16).toUpperCase();
                currentI2CSym = '0x' + (i2cBase + 1).toString(16).toUpperCase();
                let conflict = currentGeometry.customSensors.some(s => s.type === 'tof' && (s.i2cAddress === currentI2C || s.i2cAddressSym === currentI2C || s.i2cAddress === currentI2CSym || s.i2cAddressSym === currentI2CSym));
                if (!conflict) break;
                i2cBase += 2;
                iter++;
                if (iter > 10) break; // fallback emergency
            }

            currentGeometry.customSensors.push({ type: 'tof', x_mm: 50, y_mm: 0, angle: 0, maxDistance: 500, i2cAddress: currentI2C, i2cAddressSym: currentI2CSym }); 
            renderCustomSensorsList();
            updateSensorConnectionsUI(currentGeometry.sensorCount);
            window.forceGeometrySync();
        });
    }

    // Update preview dynamically as user types
    const inputs = [elems.robotWidthInput, elems.sensorOffsetInput, elems.sensorSpreadInput, elems.sensorDiameterInput, elems.robotMassInput, elems.comOffsetInput, elems.tireGripInput];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                currentGeometry = getFormValues();
                previewRobot.updateGeometry(currentGeometry);
                syncDecorativeSensorsWithGeometry();
                renderRobotPreview();
            });
        }
    });

    // Initial render
    console.log("Loading robot assets...");
    mainAppInterface.loadRobotAssets((wheelImg) => {
        console.log("Robot assets loaded, setting images...");
        previewRobot.setImages(wheelImg);
        // Load default robot JSON only on first load
        if (!window._defaultRobotLoaded) {
            window._defaultRobotLoaded = true;
            loadDefaultRobotJSON();
        } else {
            zoomExtents();
            renderRobotPreview();
        }
    });

    // Setup tab change observer
    const robotEditorTab = document.getElementById('robot-editor');
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (robotEditorTab.classList.contains('active')) {
                    renderRobotPreview();
                }
            }
        });
    });
    observer.observe(robotEditorTab, { attributes: true });

    // Custom Parts Dialog Logic
    if (elems.editorSymmetryBtn) {
        elems.editorSymmetryBtn.addEventListener('click', (e) => {
            // we toggle the state using our window function (if symmetryModeEnabled in robotParts isn't easily accessible, we handle state here and push downstream)
            // It was defined as a let in robotParts, so let's keep track locally or use window.symmetryModeEnabled if exported correctly
            const current = e.target.textContent.includes('(Activa)');
            const nextState = !current;
            if(window.setSymmetryMode) window.setSymmetryMode(nextState);
            e.target.textContent = nextState ? 'Simetría (Activa)' : 'Simetría (Inactiva)';
            e.target.style.background = nextState ? '#ffca28' : '';
        });
    }

    if (elems.addCustomWheelsBtn) {
        const colorContainer = elems.customPartColorContainer || elems.customPartColorInput?.parentElement;
        const setVisible = (el, visible) => {
            if (el) el.style.display = visible ? 'block' : 'none';
        };

        elems.addCustomWheelsBtn.addEventListener('click', () => {
            elems.customPartTitle.textContent = 'Añadir Ruedas Custom';
            elems.customPartType.value = 'wheels';
            elems.customPartOffsetContainer.style.display = 'none';
            if(elems.customPartRotationContainer) elems.customPartRotationContainer.style.display = 'none';
            if(elems.customPartUIDContainer) elems.customPartUIDContainer.style.display = 'none';
            if(elems.customPartWidthContainer) elems.customPartWidthContainer.style.display = 'block';
            setVisible(colorContainer, true);
            elems.customPartLengthInput.parentElement.style.display = 'block';
            
            elems.customPartLengthInput.value = 65;
            elems.customPartWidthInput.value = 25;
            elems.customPartColorInput.value = '#000000';
            elems.customPartDialog.showModal();
        });

        elems.addCustomBodyBtn.addEventListener('click', () => {
            elems.customPartTitle.textContent = 'Añadir Cuerpo Custom';
            elems.customPartType.value = 'body';
            elems.customPartOffsetContainer.style.display = 'block';
            if(elems.customPartRotationContainer) elems.customPartRotationContainer.style.display = 'none';
            if(elems.customPartUIDContainer) elems.customPartUIDContainer.style.display = 'none';
            if(elems.customPartWidthContainer) elems.customPartWidthContainer.style.display = 'block';
            setVisible(colorContainer, true);
            elems.customPartLengthInput.parentElement.style.display = 'block';

            elems.customPartLengthInput.value = 120;
            elems.customPartWidthInput.value = 80;
            elems.customPartOffsetInput.value = 0;
            elems.customPartColorInput.value = '#3366cc';
            elems.customPartDialog.showModal();
        });

        const resetForm = () => {
            elems.customPartOffsetContainer.style.display = 'none';
            if(elems.customPartRotationContainer) elems.customPartRotationContainer.style.display = 'none';
            if(elems.customPartUIDContainer) elems.customPartUIDContainer.style.display = 'none';
            if(elems.customPartWidthContainer) elems.customPartWidthContainer.style.display = 'none';
            setVisible(colorContainer, false);
            elems.customPartLengthInput.parentElement.style.display = 'none';
        };

        elems.cancelCustomPartBtn.addEventListener('click', () => {
            elems.customPartDialog.close();
        });

        // Evento custom para someter el dialogo
        const nextSubmit = () => {
            const type = elems.customPartType.value;
            const length_mm = parseFloat(elems.customPartLengthInput.value) || 0;
            const width_mm = parseFloat(elems.customPartWidthInput.value) || 0;
            const offset_mm = parseFloat(elems.customPartOffsetInput.value) || 0;
            const color = elems.customPartColorInput.value;
            const rot = parseFloat(elems.customPartRotationInput.value) || 0;
            const uid = elems.customPartUIDInput.value;
            
            const hex2rgb = (hex) => {
                let r = parseInt(hex.slice(1,3), 16) || 255;
                let g = parseInt(hex.slice(3,5), 16) || 255;
                let b = parseInt(hex.slice(5,7), 16) || 255;
                return {r, g, b};
            };

            const cx = (previewCanvas ? previewCanvas.width : 500) / 2;
            const cy = (previewCanvas ? previewCanvas.height : 450) / 2 - 50;
            let p;

            if (type === 'wheels') {
                currentGeometry.customWheels = { length_m: length_mm / 1000, width_m: width_mm / 1000, color };
                previewRobot.updateGeometry(currentGeometry);
                renderRobotPreview();
            } else if (type === 'body') {
                if (window.addParametricBodyPart) {
                    window.addParametricBodyPart(width_mm, length_mm, offset_mm, color);
                }
            } else if (type === 'rfid' && window.PARTS) {
                p = new window.RFIDReader({ id: 'rfid_'+Date.now(), name: 'Lector RFID', x: cx, y: cy, rotation: rot * Math.PI / 180, uid: uid, type:'RFIDReader' });
            } else if (type === 'rgb' && window.PARTS) {
                p = new window.ColorSensor({ id: 'rgb_'+Date.now(), name: 'Sensor Color', x: cx, y: cy, rotation: rot * Math.PI / 180, rgb: hex2rgb(color), type:'ColorSensor' });
            } else if (type === 'tof' && window.PARTS) {
                p = new window.DistanceSensor({ id: 'tof_'+Date.now(), name: 'Sensor ToF', x: cx, y: cy, rotation: rot * Math.PI / 180, type:'DistanceSensor' });
            }
            
            if (p) {
                window.placedParts.push(p);
                if (window.syncTwin) window.syncTwin(p, previewCanvas);
                if (window.renderRobotPreview) window.renderRobotPreview();
            }
        };

        // Remove old submit wrapper to avoid duplicate events
        let newForm = elems.customPartForm.cloneNode(true);
        elems.customPartForm.parentNode.replaceChild(newForm, elems.customPartForm);
        elems = getDOMElements(); // refresh
        elems.customPartForm.addEventListener('submit', nextSubmit);
    }

    // Guardar y cargar robot
    document.querySelectorAll('#saveRobotButton').forEach(btn => {
        btn.addEventListener('click', () => {
            const geometry = getFormValues();
            const parts = window.getPlacedPartsRaw ? window.getPlacedPartsRaw() : getPlacedPartsRaw();
            const robotData = {
                geometry,
                parts
            };
            const jsonData = JSON.stringify(robotData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'robot.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    document.querySelectorAll('#loadRobotInput').forEach(input => {
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const robotData = JSON.parse(e.target.result);
                    if (robotData.geometry) {
                        setFormValues(robotData.geometry);
                        currentGeometry = getFormValues();
                        previewRobot.updateGeometry(currentGeometry);
                    }
                    if (robotData.parts && window.restorePlacedPartsRaw) {
                        window.restorePlacedPartsRaw(robotData.parts);
                    }
                    renderRobotPreview();
                } catch (err) { }
            };
            reader.readAsText(file);
            event.target.value = null;
        });
    });

    window.loadExampleRobot = async function(options = {}) {
        try {
            const response = await fetch('assets/robots/Robot Ejemplo.json');
            if (!response.ok) throw new Error('No se pudo cargar el Robot Ejemplo.json');
            const robotData = await response.json();
            
            if (robotData.geometry) {
                setFormValues(robotData.geometry);
                currentGeometry = getFormValues();
                previewRobot.updateGeometry(currentGeometry);
            }
            if (robotData.parts && window.restorePlacedPartsRaw) {
                window.restorePlacedPartsRaw(robotData.parts);
            }
            renderRobotPreview();
            
            if (options.apply !== false) {
                window.forceGeometrySync();
                const decorativeParts = window.getPlacedParts ? window.getPlacedParts() : [];
                if (mainAppInterface && typeof mainAppInterface.updateRobotGeometry === 'function') {
                    mainAppInterface.updateRobotGeometry(currentGeometry, decorativeParts);
                }
            }
            return true;
        } catch (err) {
            console.error(err);
            if (!options.silent) alert("💥 Error al cargar el robot de ejemplo.");
            return false;
        }
    };

    document.querySelectorAll('#loadExampleRobotButton').forEach(btn => {
        btn.addEventListener('click', async () => {
            const success = await window.loadExampleRobot({ apply: true, silent: false });
            if (success) {
                alert("✅ Robot de Ejemplo cargado y aplicado.");
            }
        });
    });
}

// Las partes decorativas 'sensor' ya no se usan para los IR, pero mantenemos la función para limpiar si existían.
function syncDecorativeSensorsWithGeometry() {
    // Elimina partes 'sensor' existentes sin reemplazar el array
    if (window.placedParts) {
        for (let i = window.placedParts.length - 1; i >= 0; i--) {
            if (window.placedParts[i].id === 'sensor') {
                window.placedParts.splice(i, 1);
            }
        }
    }
}

function getFormValues() {
    const elems = getDOMElements();

    // Connections state extraction
    const driverType = elems.motorDriverTypeSelect ? elems.motorDriverTypeSelect.value : 'legacy';
    let motorPins = {};
    if (driverType === 'l298n') {
        motorPins = {
            leftEn: document.getElementById('pinMotorLeftEn')?.value || '',
            leftIn1: document.getElementById('pinMotorLeftIn1')?.value || '',
            leftIn2: document.getElementById('pinMotorLeftIn2')?.value || '',
            rightIn3: document.getElementById('pinMotorRightIn3')?.value || '',
            rightIn4: document.getElementById('pinMotorRightIn4')?.value || '',
            rightEn: document.getElementById('pinMotorRightEn')?.value || ''
        };
    } else if (driverType === 'mx1616') {
        motorPins = {
            leftIn1: document.getElementById('pinMotorLeftIn1')?.value || '',
            leftIn2: document.getElementById('pinMotorLeftIn2')?.value || '',
            rightIn3: document.getElementById('pinMotorRightIn3')?.value || '',
            rightIn4: document.getElementById('pinMotorRightIn4')?.value || ''
        };
    } else { // single / ESCs
        motorPins = {
            leftPWM: document.getElementById('pinMotorLeftPWM')?.value || '',
            rightPWM: document.getElementById('pinMotorRightPWM')?.value || ''
        };
    }

    const connections = {
        sensorPins: {
            fullFarLeft: document.getElementById('pinSensorFullFarLeft')?.value || '',
            farLeft: elems.pinSensorFarLeftInput?.value || '',
            left: elems.pinSensorLeftInput?.value || '',
            center: elems.pinSensorCenterInput?.value || '',
            centerLeft: document.getElementById('pinSensorCenterLeft')?.value || '',
            centerRight: document.getElementById('pinSensorCenterRight')?.value || '',
            right: elems.pinSensorRightInput?.value || '',
            farRight: elems.pinSensorFarRightInput?.value || '',
            fullFarRight: document.getElementById('pinSensorFullFarRight')?.value || '',
        },
        driverType: driverType,
        motorPins: motorPins
    };

    if (document.getElementById('panelScreenToggle')?.checked) {
        connections.sensorPins['pinPanelScreen_SDA'] = document.getElementById('pinPanelScreen_SDA')?.value || '';
        connections.sensorPins['pinPanelScreen_SCL'] = document.getElementById('pinPanelScreen_SCL')?.value || '';
    }
    const panelBtnCount = parseInt(document.getElementById('panelButtonCount')?.value || 0);
    for (let i = 0; i < panelBtnCount; i++) {
        connections.sensorPins[`pinPanelBtn_${i}`] = document.getElementById(`pinPanelBtn_${i}`)?.value || '';
    }

    const sym = elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : false;
    
    if (sym) {
        let count = parseInt(elems.sensorCountSelect ? elems.sensorCountSelect.value : 3);
        let activeSensors = [];
        if (count === 1) activeSensors = ['center'];
        else if (count === 2) activeSensors = ['left', 'right'];
        else if (count === 3) activeSensors = ['left', 'center', 'right'];
        else if (count === 4) activeSensors = ['farLeft', 'left', 'right', 'farRight'];
        else if (count === 5) activeSensors = ['farLeft', 'left', 'center', 'right', 'farRight'];
        else if (count === 6) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'right', 'farRight', 'fullFarRight'];
        else if (count === 7) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'center', 'right', 'farRight', 'fullFarRight'];
        else if (count === 8) activeSensors = ['fullFarLeft', 'farLeft', 'left', 'centerLeft', 'centerRight', 'right', 'farRight', 'fullFarRight'];

        activeSensors.forEach(k => {
            const idKey = 'pinSensor' + k.charAt(0).toUpperCase() + k.slice(1) + '_rear';
            const el = document.getElementById(idKey);
            if (el && el.value) connections.sensorPins[k + '_rear'] = el.value;
        });
    }

    if (currentGeometry && currentGeometry.customSensors) {
        currentGeometry.customSensors.forEach((sensor, idx) => {
            const type = sensor.type || 'ir';
            if (type === 'rgb' || type === 'tof' || type === 'screen') {
                const elSDA = document.getElementById(`pinSensorCustom_${idx}_SDA`);
                const elSCL = document.getElementById(`pinSensorCustom_${idx}_SCL`);
                if (elSDA && elSDA.value) connections.sensorPins[`custom_${idx}_SDA`] = elSDA.value;
                if (elSCL && elSCL.value) connections.sensorPins[`custom_${idx}_SCL`] = elSCL.value;
                
                if (sym) {
                    const cSDA = document.getElementById(`pinSensorCustom_${idx}_sym_SDA`);
                    const cSCL = document.getElementById(`pinSensorCustom_${idx}_sym_SCL`);
                    if (cSDA && cSDA.value) connections.sensorPins[`custom_${idx}_sym_SDA`] = cSDA.value;
                    if (cSCL && cSCL.value) connections.sensorPins[`custom_${idx}_sym_SCL`] = cSCL.value;
                }
            } else if (type === 'rfid') {
                ['SDA','SCK','MOSI','MISO','RST'].forEach(p => {
                    const el = document.getElementById(`pinSensorCustom_${idx}_${p}`);
                    if (el && el.value) connections.sensorPins[`custom_${idx}_${p}`] = el.value;
                    if (sym) {
                        const elSym = document.getElementById(`pinSensorCustom_${idx}_sym_${p}`);
                        if (elSym && elSym.value) connections.sensorPins[`custom_${idx}_sym_${p}`] = elSym.value;
                    }
                });
            } else {
                const el = document.getElementById(`pinSensorCustom_${idx}`);
                if (el && el.value) {
                    connections.sensorPins[`custom_${idx}`] = el.value;
                }
                if (sym) {
                    const elSym = document.getElementById(`pinSensorCustom_${idx}_sym`);
                    if (elSym && elSym.value) {
                        connections.sensorPins[`custom_${idx}_sym`] = elSym.value;
                    }
                }
            }
        });
    }

    // Leer valores en milímetros y convertir a metros (o valores por default)
    return {
        arduinoBoard: elems.arduinoBoardSelect ? elems.arduinoBoardSelect.value : 'uno',
        width_m: parseFloat(elems.robotWidthInput.value) / 1000 || DEFAULT_ROBOT_GEOMETRY.width_m,
        sensorOffset_m: parseFloat(elems.sensorOffsetInput.value) / 1000 || DEFAULT_ROBOT_GEOMETRY.sensorOffset_m,
        sensorSpread_m: parseFloat(elems.sensorSpreadInput.value) / 1000 || DEFAULT_ROBOT_GEOMETRY.sensorSpread_m,
        sensorDiameter_m: parseFloat(elems.sensorDiameterInput.value) / 1000 || DEFAULT_ROBOT_GEOMETRY.sensorDiameter_m,
        sensorCount: parseInt(elems.sensorCountSelect?.value) || 3,
        robotMass_kg: elems.robotMassInput ? parseFloat(elems.robotMassInput.value) : DEFAULT_ROBOT_GEOMETRY.robotMass_kg,
        comOffset_m: elems.comOffsetInput ? (parseFloat(elems.comOffsetInput.value) / 1000) : DEFAULT_ROBOT_GEOMETRY.comOffset_m,
        tireGrip: elems.tireGripInput ? parseFloat(elems.tireGripInput.value) : DEFAULT_ROBOT_GEOMETRY.tireGrip,
        customWheels: currentGeometry ? currentGeometry.customWheels : null,
        panelScreen: document.getElementById('panelScreenToggle')?.checked || false,
        panelButtons: typeof window.getPanelButtonsState === 'function' ? window.getPanelButtonsState() : [],
        customSensors: currentGeometry ? currentGeometry.customSensors : null,
        connections: connections,
        horizontalSymmetry: elems.horizontalSymmetryToggle ? elems.horizontalSymmetryToggle.checked : false
    };
}

function setFormValues(geometry) {
    const elems = getDOMElements();

    if (elems.arduinoBoardSelect) {
        elems.arduinoBoardSelect.value = geometry.arduinoBoard || 'uno';
        elems.arduinoBoardSelect.dispatchEvent(new Event('change'));
    }

    // Mostrar valores en milímetros en los inputs
    elems.robotWidthInput.value = (geometry.width_m * 1000).toFixed(1);
    elems.robotWidthInput.placeholder = 'Ancho (mm)';
    elems.sensorOffsetInput.value = (geometry.sensorOffset_m * 1000).toFixed(1);
    elems.sensorOffsetInput.placeholder = 'Offset sensores (mm)';
    elems.sensorSpreadInput.value = (geometry.sensorSpread_m * 1000).toFixed(1);
    elems.sensorSpreadInput.placeholder = 'Separación sensores (mm)';
    elems.sensorDiameterInput.value = (geometry.sensorDiameter_m * 1000).toFixed(1);
    elems.sensorDiameterInput.placeholder = 'Diámetro de detección (mm)';

    const pt = document.getElementById('panelScreenToggle');
    if (pt) pt.checked = !!geometry.panelScreen;
    const ptC = document.getElementById('panelButtonCount');
    if (ptC) ptC.value = geometry.panelButtons ? geometry.panelButtons.length : 0;
    if (typeof window.renderPanelConfig === 'function') window.renderPanelConfig();

    if (elems.sensorCountSelect && geometry.sensorCount) {
        elems.sensorCountSelect.value = geometry.sensorCount;
    }

    // Configurar campos físicos que quizás falten en robots JSON antiguos
    if (elems.robotMassInput) elems.robotMassInput.value = geometry.robotMass_kg ?? DEFAULT_ROBOT_GEOMETRY.robotMass_kg;
    if (elems.comOffsetInput) elems.comOffsetInput.value = ((geometry.comOffset_m ?? DEFAULT_ROBOT_GEOMETRY.comOffset_m) * 1000).toFixed(1);
    if (elems.tireGripInput) elems.tireGripInput.value = geometry.tireGrip ?? DEFAULT_ROBOT_GEOMETRY.tireGrip;

    if (elems.horizontalSymmetryToggle) {
        elems.horizontalSymmetryToggle.checked = geometry.horizontalSymmetry || false;
    }

    if (geometry.customWheels !== undefined) {
        currentGeometry.customWheels = geometry.customWheels;
    } else {
        currentGeometry.customWheels = null;
    }

    if (geometry.customSensors !== undefined) {
        currentGeometry.customSensors = geometry.customSensors;
    } else {
        currentGeometry.customSensors = [];
    }

    currentGeometry.connections = geometry.connections || currentGeometry.connections || { sensorPins: {}, motorPins: {}, driverType: 'l298n' };

    const applySensorPinValues = (sensorPins) => {
        if (!sensorPins) return;
        const mapKeyToId = (key) => {
            if (key === 'left') return 'pinSensorLeft';
            if (key === 'center') return 'pinSensorCenter';
            if (key === 'right') return 'pinSensorRight';
            if (key === 'farLeft') return 'pinSensorFarLeft';
            if (key === 'farRight') return 'pinSensorFarRight';
            if (key === 'fullFarLeft') return 'pinSensorFullFarLeft';
            if (key === 'fullFarRight') return 'pinSensorFullFarRight';
            if (key === 'centerLeft') return 'pinSensorCenterLeft';
            if (key === 'centerRight') return 'pinSensorCenterRight';
            if (key.endsWith('_rear')) {
                const base = key.replace('_rear', '');
                return 'pinSensor' + base.charAt(0).toUpperCase() + base.slice(1) + '_rear';
            }
            if (key.startsWith('custom_')) return 'pinSensorCustom_' + key.substring('custom_'.length);
            if (key.startsWith('pinPanel')) return key;
            return null;
        };

        Object.entries(sensorPins).forEach(([k, v]) => {
            const id = mapKeyToId(k);
            if (!id) return;
            const el = document.getElementById(id);
            if (el && v !== undefined && v !== null && v !== '') {
                el.value = String(v);
            }
        });
    };
    if (window.renderCustomSensorsList) window.renderCustomSensorsList();

    // Set Connections
    if (geometry.connections) {
        const c = geometry.connections;
        if (elems.pinSensorFarLeftInput && c.sensorPins.farLeft) elems.pinSensorFarLeftInput.value = c.sensorPins.farLeft;
        if (elems.pinSensorLeftInput && c.sensorPins.left) elems.pinSensorLeftInput.value = c.sensorPins.left;
        if (elems.pinSensorCenterInput && c.sensorPins.center) elems.pinSensorCenterInput.value = c.sensorPins.center;
        if (elems.pinSensorRightInput && c.sensorPins.right) elems.pinSensorRightInput.value = c.sensorPins.right;
        if (elems.pinSensorFarRightInput && c.sensorPins.farRight) elems.pinSensorFarRightInput.value = c.sensorPins.farRight;

        if (elems.motorDriverTypeSelect && c.driverType) {
            elems.motorDriverTypeSelect.value = c.driverType;
            // Force UI update for motor connections container so the inputs exist
            if (typeof updateMotorConnectionsUI === 'function') updateMotorConnectionsUI();
            // The listener for change triggered it in getFormValues context but here we must manually set values
            // Workaround since updateMotorConnectionsUI might not be in scope if not careful, actually we can just re-dispatch the event
            const event = new Event('change');
            elems.motorDriverTypeSelect.dispatchEvent(event);

            // Now populate the inputs if they exist
            setTimeout(() => { // wait a tick for DOM update
                if (c.driverType === 'l298n') {
                    const lEn = document.getElementById('pinMotorLeftEn'); if (lEn) lEn.value = c.motorPins.leftEn || '';
                    const lIn1 = document.getElementById('pinMotorLeftIn1'); if (lIn1) lIn1.value = c.motorPins.leftIn1 || '';
                    const lIn2 = document.getElementById('pinMotorLeftIn2'); if (lIn2) lIn2.value = c.motorPins.leftIn2 || '';
                    const rIn3 = document.getElementById('pinMotorRightIn3'); if (rIn3) rIn3.value = c.motorPins.rightIn3 || '';
                    const rIn4 = document.getElementById('pinMotorRightIn4'); if (rIn4) rIn4.value = c.motorPins.rightIn4 || '';
                    const rEn = document.getElementById('pinMotorRightEn'); if (rEn) rEn.value = c.motorPins.rightEn || '';
                } else if (c.driverType === 'mx1616') {
                    const lIn1 = document.getElementById('pinMotorLeftIn1'); if (lIn1) lIn1.value = c.motorPins.leftIn1 || '';
                    const lIn2 = document.getElementById('pinMotorLeftIn2'); if (lIn2) lIn2.value = c.motorPins.leftIn2 || '';
                    const rIn3 = document.getElementById('pinMotorRightIn3'); if (rIn3) rIn3.value = c.motorPins.rightIn3 || '';
                    const rIn4 = document.getElementById('pinMotorRightIn4'); if (rIn4) rIn4.value = c.motorPins.rightIn4 || '';
                } else { // single / ESCs
                    const lPWM = document.getElementById('pinMotorLeftPWM'); if (lPWM) lPWM.value = c.motorPins.leftPWM || '';
                    const rPWM = document.getElementById('pinMotorRightPWM'); if (rPWM) rPWM.value = c.motorPins.rightPWM || '';
                }
                // Trigger geometry sync after setting values
                if (window.forceGeometrySync) { window.forceGeometrySync(); }
            }, 0);
        }
    }

    // Visually show/hide sensor rows and rebuild dynamic IR/custom pin rows
    if (typeof window.updateSensorConnectionsUI === 'function') {
        window.updateSensorConnectionsUI(geometry.sensorCount || 3);
    }

    if (typeof window.renderPanelConfig === 'function') window.renderPanelConfig();
    if (window.renderCustomSensorsList) window.renderCustomSensorsList();
    applySensorPinValues(geometry.connections?.sensorPins || {});
    if (typeof window.forceGeometrySync === 'function') window.forceGeometrySync();

    syncDecorativeSensorsWithGeometry();
}

function drawDimensionLine(ctx, startX, startY, endX, endY, offset, text) {
    const arrowSize = 5 / ctx.getTransform().a; // Ajustar tamaño de flecha para la escala
    const textOffset = 10 / ctx.getTransform().a; // Ajustar offset de texto para la escala

    // Dibujar línea principal
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Dibujar flechas
    const angle = Math.atan2(endY - startY, endX - startX);

    // Flecha 1
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle + Math.PI - Math.PI / 6) * arrowSize,
        startY + Math.sin(angle + Math.PI - Math.PI / 6) * arrowSize);
    ctx.lineTo(startX + Math.cos(angle + Math.PI + Math.PI / 6) * arrowSize,
        startY + Math.sin(angle + Math.PI + Math.PI / 6) * arrowSize);
    ctx.closePath();
    ctx.fill();

    // Flecha 2
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + Math.cos(angle - Math.PI / 6) * arrowSize,
        endY + Math.sin(angle - Math.PI / 6) * arrowSize);
    ctx.lineTo(endX + Math.cos(angle + Math.PI / 6) * arrowSize,
        endY + Math.sin(angle + Math.PI / 6) * arrowSize);
    ctx.closePath();
    ctx.fill();

    // Dibujar texto
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, -textOffset);
    ctx.restore();
}

/**
 * Ajusta el zoom para que el robot completo y sus piezas quepan en la vista
 */
export function zoomExtents() {
    if (!previewRobot || !previewCanvas) return;

    console.log("Calculating zoom extents...");
    // 1. Determinar límites en metros
    // Empezamos con el chasis básico (ruedas y sensores básicos)
    let minX = -previewRobot.wheelbase_m / 2 - 0.02; // +2cm margin
    let maxX = previewRobot.wheelbase_m / 2 + 0.02;
    let minY = -previewRobot.sensorForwardProtrusion_m - 0.04; // +4cm margin forward for sensors
    let maxY = 0.04; // +4cm margin backward

    // Incluir límites de las cotas/dimensiones en el cálculo de zoom
    // Cota izquierda (Offset Sensor)
    const wheelbaseOffset_m = (previewRobot.wheelbase_m / 2 + 0.03); 
    minX = Math.min(minX, -wheelbaseOffset_m - 0.05); // Margen extra para el texto

    // Cota superior (Separación Sensor)
    const sensorSpreadYOffset_m = -previewRobot.sensorForwardProtrusion_m - 0.03;
    minY = Math.min(minY, sensorSpreadYOffset_m - 0.05); // Margen extra para el texto

    // Cota derecha (Punta de línea Separación Sensor)
    maxX = Math.max(maxX, previewRobot.sensorSideSpread_m + 0.05);

    // Incluir piezas decorativas si existen
    if (window.placedParts && window.placedParts.length > 0) {
        window.placedParts.forEach(part => {
            // Posición de la pieza en metros relativa al centro del canvas (origen del robot)
            const px_m = (part.x - previewCanvas.width / 2) / PIXELS_PER_METER;
            const py_m = (part.y - previewCanvas.height / 2) / PIXELS_PER_METER;

            // Tamaño de la pieza en metros
            let hw = 0.025; // Default radio 2.5cm
            let hh = 0.025;

            if (part.img && part.img.complete) {
                hw = (part.img.width / 2) / PIXELS_PER_METER;
                hh = (part.img.height / 2) / PIXELS_PER_METER;
            }

            minX = Math.min(minX, px_m - hw);
            maxX = Math.max(maxX, px_m + hw);
            minY = Math.min(minY, py_m - hh);
            maxY = Math.max(maxY, py_m + hh);
        });
    }

    // Cota inferior (Ancho Ruedas) - depende de la parte inferior máxima (maxY)
    const wheelbaseYOffset_m = maxY + 0.03; 
    maxY = Math.max(maxY, wheelbaseYOffset_m + 0.05); // Margen extra para el texto

    const width_m = maxX - minX;
    const height_m = maxY - minY;

    // Guardar el centro del robot para usarlo en el renderizado
    window.previewCenterOffset = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2
    };

    console.log("Robot bounds (m):", { minX, maxX, minY, maxY, width_m, height_m, center: window.previewCenterOffset });

    // 2. Calcular zoom para encajar en 500x300 con margen del 15%
    const margin = 0.85;
    const zoomX = (previewCanvas.width * margin) / (width_m * PIXELS_PER_METER);
    const zoomY = (previewCanvas.height * margin) / (height_m * PIXELS_PER_METER);

    // Usamos el menor de los dos para asegurar que quepa en ambas dimensiones
    let bestZoom = Math.min(zoomX, zoomY);

    // Limitar al rango permitido
    previewZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, bestZoom));

    console.log("Auto-zoom calculated:", previewZoom);
    renderRobotPreview();
}

export function renderRobotPreview() {
    if (!previewCtx || !previewRobot) {
        console.error("Missing previewCtx or previewRobot:", { previewCtx: !!previewCtx, previewRobot: !!previewRobot });
        return;
    }

    console.log("Rendering robot preview...");
    console.log("Robot state:", {
        x: previewRobot.x_m,
        y: previewRobot.y_m,
        angle: previewRobot.angle_rad,
        wheelbase: previewRobot.wheelbase_m,
        sensorOffset: previewRobot.sensorForwardProtrusion_m,
        sensorSpread: previewRobot.sensorSideSpread_m
    });

    // Clear the canvas
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    // We used to draw center guides here, but it's better to draw them after translation

    previewCtx.save();
    // Centrar el rectángulo contenedor del robot en el canvas
    const offsetX = window.previewCenterOffset ? window.previewCenterOffset.x * PIXELS_PER_METER : 0;
    const offsetY = window.previewCenterOffset ? window.previewCenterOffset.y * PIXELS_PER_METER : 0;

    previewCtx.translate(previewCanvas.width / 2 - offsetX * previewZoom, previewCanvas.height / 2 - offsetY * previewZoom);
    previewCtx.scale(previewZoom, previewZoom);

    // Draw center guides explicitly within the world coordinates
    previewCtx.save();
    previewCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)';  // Líneas más oscuras y notorias (negro semitransparente)
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([5, 5]); // Dashed line
    // Vertical center line
    previewCtx.beginPath();
    previewCtx.moveTo(0, -2000);
    previewCtx.lineTo(0, 2000);
    previewCtx.stroke();
    // Horizontal center line
    previewCtx.beginPath();
    previewCtx.moveTo(-2000, 0);
    previewCtx.lineTo(2000, 0);
    previewCtx.stroke();
    previewCtx.setLineDash([]); // Reset dash
    previewCtx.restore();

    // Draw robot
    const tempX = previewRobot.x_m;
    const tempY = previewRobot.y_m;
    const tempAngle = previewRobot.angle_rad;

    previewRobot.x_m = 0;
    previewRobot.y_m = 0;
    previewRobot.angle_rad = -Math.PI / 2;

    console.log("Drawing robot at center...");
    // Draw the robot with its current sensor states
    previewRobot.draw(previewCtx, previewRobot.sensors);

    // Draw dimension lines
    previewCtx.strokeStyle = 'black';
    previewCtx.fillStyle = 'black';
    previewCtx.lineWidth = 1;
    previewCtx.font = '10px Arial';

    // Convert meters to pixels
    const wheelbaseOffset = (previewRobot.wheelbase_m / 2 + 0.03) * PIXELS_PER_METER; // 3cm extra outside robot
    const sensorSpreadYOffset = (-previewRobot.sensorForwardProtrusion_m - 0.03) * PIXELS_PER_METER; // 3cm above sensors
    
    // Calcular cota inferior (ancho) dinámicamente buscando la parte más larga del robot
    let bottomMargin_m = 0.05; // 5cm por defecto para cubrir media rueda estándar
    if (window.placedParts && window.placedParts.length > 0) {
        window.placedParts.forEach(part => {
            const py_m = (part.y - previewCanvas.height / 2) / PIXELS_PER_METER;
            let hh = 0.025;
            if (part.img && part.img.complete) {
                hh = (part.img.height / 2) / PIXELS_PER_METER;
            }
            bottomMargin_m = Math.max(bottomMargin_m, py_m + hh);
        });
    }
    const wheelbaseYOffset = (bottomMargin_m + 0.03) * PIXELS_PER_METER; // 3cm por debajo del máximo

    console.log("Drawing dimension lines...");
    // Robot width (wheelbase)
    const wheelbaseStartX = -previewRobot.wheelbase_m / 2 * PIXELS_PER_METER;
    const wheelbaseEndX = previewRobot.wheelbase_m / 2 * PIXELS_PER_METER;
    drawDimensionLine(previewCtx,
        wheelbaseStartX, wheelbaseYOffset, // Horizontal line below robot
        wheelbaseEndX, wheelbaseYOffset,
        20, `${(previewRobot.wheelbase_m * 1000).toFixed(1)} mm`);

    // Sensor offset (vertical dimension, offset to the left)
    const sensorLineY = 0;
    const sensorLineYEnd = -previewRobot.sensorForwardProtrusion_m * PIXELS_PER_METER;
    drawDimensionLine(previewCtx,
        -wheelbaseOffset, sensorLineY, // Offset to the left
        -wheelbaseOffset, sensorLineYEnd,
        20, `${(previewRobot.sensorForwardProtrusion_m * 1000).toFixed(1)} mm`);

    // Sensor spread (horizontal dimension, above sensors, showing just one side!)
    const sensorSpreadStartX = 0; // Starts from center
    const sensorSpreadEndX = previewRobot.sensorSideSpread_m * PIXELS_PER_METER; // To one side
    drawDimensionLine(previewCtx,
        sensorSpreadStartX, sensorSpreadYOffset,
        sensorSpreadEndX, sensorSpreadYOffset,
        20, `${(previewRobot.sensorSideSpread_m * 1000).toFixed(1)} mm`);

    // Restore robot's original position
    previewRobot.x_m = tempX;
    previewRobot.y_m = tempY;
    previewRobot.angle_rad = tempAngle;

    console.log("Drawing decorative parts...");
    // Draw decorative parts inside the transformed context
    drawRobotPreview(previewZoom);

    // Draw sensors on top
    previewCtx.save();

    // Draw Center of Mass Symbol
    const comY_px = -previewRobot.comOffset_m * PIXELS_PER_METER;
    previewCtx.save();
    previewCtx.translate(0, comY_px);

    // CG circle with alternating quadrants
    const cgRadius = 6;
    previewCtx.beginPath();
    previewCtx.arc(0, 0, cgRadius, 0, Math.PI * 2);
    previewCtx.fillStyle = 'white';
    previewCtx.fill();
    previewCtx.lineWidth = 1;
    previewCtx.strokeStyle = 'black';
    previewCtx.stroke();

    // Q1 (Black)
    previewCtx.beginPath();
    previewCtx.moveTo(0, 0);
    previewCtx.arc(0, 0, cgRadius, 0, Math.PI / 2);
    previewCtx.lineTo(0, 0);
    previewCtx.fillStyle = 'black';
    previewCtx.fill();

    // Q3 (Black)
    previewCtx.beginPath();
    previewCtx.moveTo(0, 0);
    previewCtx.arc(0, 0, cgRadius, Math.PI, Math.PI * 1.5);
    previewCtx.lineTo(0, 0);
    previewCtx.fill();

    // Cross lines extending slightly outward
    previewCtx.beginPath();
    previewCtx.moveTo(-cgRadius - 3, 0);
    previewCtx.lineTo(cgRadius + 3, 0);
    previewCtx.moveTo(0, -cgRadius - 3);
    previewCtx.lineTo(0, cgRadius + 3);
    previewCtx.lineWidth = 1.5;
    previewCtx.stroke();

    previewCtx.restore();

    previewRobot.x_m = 0;
    previewRobot.y_m = 0;
    previewRobot.angle_rad = -Math.PI / 2;
    previewRobot.drawSensorsForDisplay(previewCtx, previewRobot.sensors);
    previewRobot.x_m = tempX;
    previewRobot.y_m = tempY;
    previewRobot.angle_rad = tempAngle;

    // Restore the main coordinate translation
    previewCtx.restore();

    // Pop the very first save() that setup the scaling/translation matrix
    previewCtx.restore();
}

export function getCurrentRobotGeometry() {
    return { ...currentGeometry };
}

// Devuelve las partes decorativas en formato serializable (sin la imagen)
function getPlacedPartsRaw() {
    const parts = window.getPlacedParts ? window.getPlacedParts() : [];
    return parts.map(p => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        rotation: p.rotation || 0
    }));
}

export async function loadDefaultRobotJSON() {
    try {
        const response = await fetch('assets/robots/Robot Ejemplo.json');
        if (!response.ok) throw new Error('No se pudo cargar Robot Ejemplo.json');
        const robotData = await response.json();
        if (robotData.geometry) {
            setFormValues(robotData.geometry);
            currentGeometry = getFormValues();
            previewRobot.updateGeometry(currentGeometry);
        }
        if (robotData.parts && window.restorePlacedPartsRaw) {
            window.restorePlacedPartsRaw(robotData.parts);
        }
        renderRobotPreview();
        // Notificar a la simulación
        if (mainAppInterface && typeof mainAppInterface.updateRobotGeometry === 'function') {
            const decorativeParts = window.getPlacedParts ? window.getPlacedParts() : [];
            mainAppInterface.updateRobotGeometry(currentGeometry, decorativeParts);
        }
    } catch (err) {
        console.warn('No se pudo cargar el robot por defecto:', err);
    }
}

async function initRobotSelectionDropdown() {
    const dropdowns = document.querySelectorAll('#robotSelectionDropdown');
    
    // Add predefined robots
    const robots = [
        { name: 'Robot Genérico OnOff', file: 'Robot Generico OnOff.json' },
        { name: 'SL Genérico', file: 'SL Generico.json' },
        { name: 'SLC SVP 2025', file: 'SLC_SVP_2025.json' }
    ];

    dropdowns.forEach(dropdown => {
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Seleccionar robot...';
        defaultOption.selected = true; // <--- Seleccionado por defecto para forzar cambio al elegir uno
        dropdown.appendChild(defaultOption);

        robots.forEach((robot) => {
            const option = document.createElement('option');
            option.value = robot.file;
            option.textContent = robot.name;
            dropdown.appendChild(option);
        });

        // Add change event listener
        dropdown.addEventListener('change', async (event) => {
            const selectedFile = event.target.value;
            if (!selectedFile) return;

            try {
                const response = await fetch(`assets/robots/${selectedFile}`);
                if (!response.ok) throw new Error(`No se pudo cargar ${selectedFile}`);
                const robotData = await response.json();

                if (robotData.geometry) {
                    setFormValues(robotData.geometry);
                    currentGeometry = getFormValues();
                    previewRobot.updateGeometry(currentGeometry);
                }

                if (robotData.parts && window.restorePlacedPartsRaw) {
                    window.restorePlacedPartsRaw(robotData.parts);
                }

                renderRobotPreview();

                // Aplicar automáticamente
                window.forceGeometrySync();
                const decorativeParts = window.getPlacedParts ? window.getPlacedParts() : [];
                zoomExtents();
                mainAppInterface.updateRobotGeometry(currentGeometry, decorativeParts);
                console.log("✅ Robot de Dropdown cargado y aplicado.");

            } catch (err) {
                console.warn('No se pudo cargar el robot predefinido:', err);
                alert('No se pudo cargar el robot predefinido.');
            }
            
            // Sync all dropdowns
            dropdowns.forEach(dd => {
                if(dd !== dropdown) dd.value = selectedFile;
            });
        });
    });
}