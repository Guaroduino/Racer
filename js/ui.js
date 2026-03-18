// js/ui.js

export function getDOMElements() {
    return {
        // Tabs
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),

        // Simulation Tab
        simulationDisplayCanvas: document.getElementById('simulationDisplayCanvas'),
        startSimButton: document.getElementById('startSimButton'),
        stopSimButton: document.getElementById('stopSimButton'),
        resetSimButton: document.getElementById('resetSimButton'),
        timeStepInput: document.getElementById('timeStep'),
        maxRobotSpeedInput: document.getElementById('maxRobotSpeed'),
        motorEfficiencyInput: document.getElementById('motorEfficiency'),
        motorImbalanceInput: document.getElementById('motorImbalance'),
        motorResponseInput: document.getElementById('motorResponse'),
        sensorNoiseInput: document.getElementById('sensorNoise'),
        movementPerturbInput: document.getElementById('movementPerturb'),
        motorDeadbandInput: document.getElementById('motorDeadband'),
        lineThresholdInput: document.getElementById('lineThreshold'),
        robotMassInput: document.getElementById('robotMass'),
        comOffsetInput: document.getElementById('comOffset'),
        tireGripInput: document.getElementById('tireGrip'),
        applySimParamsButton: document.getElementById('applySimParamsButton'),
        telemetryOutput: document.getElementById('telemetryOutput'),
        lapTimerOutput: document.getElementById('lapTimerOutput'),

        // Code Editor Tab
        codeEditorArea: document.getElementById('codeEditorArea'),
        applyCodeButton: document.getElementById('applyCodeButton'),
        loadExampleCodeButton: document.getElementById('loadExampleCodeButton'),
        currentCodeType: document.getElementById('currentCodeType'),
        codeExplanation: document.querySelector('.code-explanation'),
        editorHelp: document.querySelector('.editor-help'),
        serialMonitorOutput: document.getElementById('serialMonitorOutput'),
        clearSerialButton: document.getElementById('clearSerialButton'),
        serialMonitorOutputCodeEditor: document.getElementById('serialMonitorOutputCodeEditor'),
        clearSerialButtonCodeEditor: document.getElementById('clearSerialButtonCodeEditor'),

        // Robot Editor Tab
        robotPreviewCanvas: document.getElementById('robotPreviewCanvas'),
        robotWidthInput: document.getElementById('robotWidth'),
        sensorOffsetInput: document.getElementById('sensorOffset'),
        sensorSpreadInput: document.getElementById('sensorSpread'),
        sensorDiameterInput: document.getElementById('sensorDiameter'),
        sensorCountSelect: document.getElementById('sensorCount'),
        horizontalSymmetryToggle: document.getElementById('horizontalSymmetryToggle'),
        addCustomSensorBtn: document.getElementById('addCustomSensorBtn'),
        addLEDBtn: document.getElementById('addLEDBtn'),
        addScreenBtn: document.getElementById('addScreenBtn'),
        arduinoBoardSelect: document.getElementById('arduinoBoardSelect'),
        customSensorsList: document.getElementById('customSensorsList'),
        applyRobotGeometryButton: document.getElementById('applyRobotGeometryButton'),
        resetRobotGeometryButton: document.getElementById('resetRobotGeometryButton'),
        robotPartsPalette: document.getElementById('robotPartsPalette'),
        saveRobotButton: document.getElementById('saveRobotButton'),
        loadRobotInput: document.getElementById('loadRobotInput'),
        loadExampleRobotButton: document.getElementById('loadExampleRobotButton'),
        robotSelectionDropdown: document.getElementById('robotSelectionDropdown'),
        editorPanBtn: document.getElementById('editorPanBtn'),
        zoomInBtn: document.getElementById('editorZoomInBtn'),
        zoomOutBtn: document.getElementById('editorZoomOutBtn'),
        zoomResetBtn: document.getElementById('editorZoomResetBtn'),
        zoomExtentsBtn: document.getElementById('editorZoomExtentsBtn'),

        // Pin Connections UI
        sensorConnectionsContainer: document.getElementById('sensorConnectionsContainer'),
        pinSensorFarLeftInput: document.getElementById('pinSensorFarLeft'),
        pinSensorFullFarLeftInput: document.getElementById('pinSensorFullFarLeft'),
        pinSensorLeftInput: document.getElementById('pinSensorLeft'),
        pinSensorCenterInput: document.getElementById('pinSensorCenter'),
        pinSensorRightInput: document.getElementById('pinSensorRight'),
        pinSensorFarRightInput: document.getElementById('pinSensorFarRight'),
        pinSensorFullFarRightInput: document.getElementById('pinSensorFullFarRight'),
        motorDriverTypeSelect: document.getElementById('motorDriverType'),
        motorConnectionsContainer: document.getElementById('motorConnectionsContainer'),

        // Custom Parts UI
        addCustomWheelsBtn: document.getElementById('addCustomWheelsBtn'),
        addCustomBodyBtn: document.getElementById('addCustomBodyBtn'),
        addRFIDReaderBtn: document.getElementById('addRFIDReaderBtn'),
        addColorSensorBtn: document.getElementById('addColorSensorBtn'),
        addDistanceSensorBtn: document.getElementById('addDistanceSensorBtn'),
        editorSymmetryBtn: document.getElementById('editorSymmetryBtn'),
        customPartDialog: document.getElementById('customPartDialog'),
        customPartForm: document.getElementById('customPartForm'),
        customPartTitle: document.getElementById('customPartTitle'),
        customPartType: document.getElementById('customPartType'),
        customPartLengthInput: document.getElementById('customPartLength'),
        customPartWidthInput: document.getElementById('customPartWidth'),
        customPartOffsetInput: document.getElementById('customPartOffset'),
        customPartRotationInput: document.getElementById('customPartRotation'),
        customPartUIDInput: document.getElementById('customPartUID'),
        customPartColorInput: document.getElementById('customPartColor'),
        cancelCustomPartBtn: document.getElementById('cancelCustomPart'),
        confirmCustomPartBtn: document.getElementById('confirmCustomPart'),
        customPartWidthContainer: document.getElementById('customPartWidthContainer'),
        customPartOffsetContainer: document.getElementById('customPartOffsetContainer'),
        customPartRotationContainer: document.getElementById('customPartRotationContainer'),
        customPartUIDContainer: document.getElementById('customPartUIDContainer'),
        customPartColorContainer: document.getElementById('customPartColorContainer'),

        // Track Editor Tab
        trackEditorCanvas: document.getElementById('trackEditorCanvas'),
        trackGridSizeSelect: document.getElementById('trackGridSize'),
        generateRandomTrackButton: document.getElementById('generateRandomTrack'),
        trackEditorTrackNameInput: document.getElementById('trackEditorTrackName'),
        saveTrackDesignButton: document.getElementById('saveTrackDesignButton'),
        loadTrackDesignInput: document.getElementById('loadTrackDesignInput'),
        loadTrackObstaclesSvgInput: document.getElementById('loadTrackObstaclesSvgInput'),
        loadTrackObstaclesSvgFitInput: document.getElementById('loadTrackObstaclesSvgFitInput'),
        exportTrackToSimulatorButton: document.getElementById('exportTrackToSimulator'),
        trackPartsPalette: document.getElementById('trackPartsPalette'),
        trackEditorControls: document.querySelector('.track-editor-controls'),
        trackModeDropdown: document.getElementById('trackModeDropdown'),
        
        // Interactive Elements
        toolModeTrack: document.getElementById('toolModeTrack'),
        toolModeRFID: document.getElementById('toolModeRFID'),
        toolModeColor: document.getElementById('toolModeColor'),
        toolModeHopper: document.getElementById('toolModeHopper'),
        toolModeObstacle: document.getElementById('toolModeObstacle'),
        toolModeMoveInt: document.getElementById('toolModeMoveInt'),
        toolModeEraseInt: document.getElementById('toolModeEraseInt'),
        intSettWidth: document.getElementById('intSettWidth'),
        intSettLength: document.getElementById('intSettLength'),
        lblIntVal: document.getElementById('lblIntVal'),
        intSettValue: document.getElementById('intSettValue'),
        lblIntColor: document.getElementById('lblIntColor'),
        intSettColor: document.getElementById('intSettColor'),
        lblIntShape: document.getElementById('lblIntShape'),
        obstacleShape: document.getElementById('obstacleShape')
    };
}

export function setupTabs() {
    const { tabButtons, tabContents } = getDOMElements();
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            tabContents.forEach(content => {
                if (content.id === targetTab) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}

export function updateTelemetry(data) {
    const elems = getDOMElements();
    if (!elems.telemetryOutput) return;

    let output = "Telemetría del Robot:\n";
    if (data.error !== undefined) output += `Error PID: ${data.error.toFixed(2)}\n`;
    if (data.pidTerms) {
        output += `  P: ${data.pidTerms.P?.toFixed(2) ?? 'N/A'}\n`;
        output += `  I: ${data.pidTerms.I?.toFixed(2) ?? 'N/A'}\n`;
        output += `  D: ${data.pidTerms.D?.toFixed(2) ?? 'N/A'}\n`;
    }
    if (data.motorPWMs) {
        output += `PWM Izquierdo: ${data.motorPWMs.leftPWM} (${data.motorPWMs.leftDirForward ? 'Fwd' : 'Rev'})\n`;
        output += `PWM Derecho: ${data.motorPWMs.rightPWM} (${data.motorPWMs.rightDirForward ? 'Fwd' : 'Rev'})\n`;
    }
    if (data.sensorStates) {
        output += `Sensor Izquierdo: ${data.sensorStates.left ? 'ON' : 'OFF'} Linea\n`;
        output += `Sensor Centro: ${data.sensorStates.center ? 'ON' : 'OFF'} Linea\n`;
        output += `Sensor Derecho: ${data.sensorStates.right ? 'ON' : 'OFF'} Linea\n`;
    }
    if (data.simTime !== undefined) output += `Tiempo Sim: ${data.simTime.toFixed(2)}s\n`;
    if (data.outOfBounds) output += `Estado: ¡Robot fuera de pista!\n`;

    elems.telemetryOutput.textContent = output;
}

export function updateLapTimerDisplay(lapData) {
    const elems = getDOMElements();
    if (!elems.lapTimerOutput || !lapData) return;

    const formatTime = (time_ms) => {
        if (time_ms === null || time_ms === Infinity || isNaN(time_ms)) return '--:--:---';
        let ms = Math.floor(time_ms % 1000);
        let secs = Math.floor((time_ms / 1000) % 60);
        let mins = Math.floor(time_ms / (1000 * 60));
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(3, '0')}`;
    };

    let output = `Vueltas: ${lapData.lapCount}\n`;
    output += `Mejor: ${formatTime(lapData.bestLapTime_ms)}\n`;
    output += `Última: ${formatTime(lapData.lastLapTime_ms)}\n`;
    output += `Actual: ${formatTime(lapData.currentLapTime_ms)}\n\n`;

    // Add lap history
    if (lapData.lapHistory && lapData.lapHistory.length > 0) {
        output += "Últimas 10 vueltas:\n";
        lapData.lapHistory.forEach((lapTime, index) => {
            output += `${index + 1}. ${formatTime(lapTime)}\n`;
        });
    }

    elems.lapTimerOutput.textContent = output;
}

export function updateCodeTypeDisplay(codeType) {
    const elems = getDOMElements();
    if (!elems.currentCodeType) return;

    let displayText = '';
    switch (codeType) {
        case 'onoff':
            displayText = 'Control On/Off';
            break;
        case 'continuous-turn':
            displayText = 'Control Giro Continuo';
            break;
        case 'proportional':
            displayText = 'Control Proporcional';
            break;
        case 'pid':
            displayText = 'Control PID';
            break;
        default:
            displayText = 'Código Personalizado';
    }
    elems.currentCodeType.textContent = displayText;
}

/**
 * Actualiza los textos de ayuda del robot dinámicamente según la configuración
 */
export function updateDynamicCodeHelp(geometry) {
    const elems = getDOMElements();
    if (!elems.codeExplanation || !elems.editorHelp) return;

    const c = geometry.connections;
    const driverType = c.driverType;
    const motorPins = c.motorPins;
    const sensorPins = c.sensorPins;
    const count = geometry.sensorCount;

    // Helper to format pin
    const fmtPin = (p) => (p && p.trim() !== '') ? p : null;

    // Build quick reference list
    let pinsHtml = `<div style="background: rgba(255,255,255,0.5); padding: 8px; border-radius: 4px; border: 1px solid #ddd; margin-bottom: 12px; font-size: 0.9em;">
<b>📌 Referencia Rápida de Pines (En Uso):</b><br>
<ul style="margin: 5px 0 0 20px; padding: 0;">`;

    // Sensors
    if (count >= 5 && fmtPin(sensorPins.farLeft)) pinsHtml += `<li><b>${sensorPins.farLeft}</b>: Sensor Izquierdo (Externo)</li>`;
    if (count >= 2 && fmtPin(sensorPins.left)) pinsHtml += `<li><b>${sensorPins.left}</b>: Sensor Izquierdo</li>`;
    if ((count == 1 || count == 3 || count == 5) && fmtPin(sensorPins.center)) pinsHtml += `<li><b>${sensorPins.center}</b>: Sensor Central</li>`;
    if (count >= 2 && fmtPin(sensorPins.right)) pinsHtml += `<li><b>${sensorPins.right}</b>: Sensor Derecho</li>`;
    if (count >= 5 && fmtPin(sensorPins.farRight)) pinsHtml += `<li><b>${sensorPins.farRight}</b>: Sensor Derecho (Externo)</li>`;

    // Custom Sensors
    if (geometry.customSensors && geometry.customSensors.length > 0) {
        geometry.customSensors.forEach((s, idx) => {
            const type = s.type || 'ir';
            const basePin = `custom_${idx}`;
            let typeLabel = "Custom";
            
            if (type === 'rgb' || type === 'tof') {
                typeLabel = type === 'rgb' ? "Color RGB" : "ToF";
                if (fmtPin(sensorPins[`${basePin}_SDA`])) pinsHtml += `<li><b>${sensorPins[`${basePin}_SDA`]}</b>: Sensor ${typeLabel} ${idx + 1} (SDA)</li>`;
                if (fmtPin(sensorPins[`${basePin}_SCL`])) pinsHtml += `<li><b>${sensorPins[`${basePin}_SCL`]}</b>: Sensor ${typeLabel} ${idx + 1} (SCL)</li>`;
            } else if (type === 'rfid') {
                typeLabel = "RFID";
                ['SDA','SCK','MOSI','MISO','RST'].forEach(p => {
                    if (fmtPin(sensorPins[`${basePin}_${p}`])) pinsHtml += `<li><b>${sensorPins[`${basePin}_${p}`]}</b>: Sensor ${typeLabel} ${idx + 1} (${p})</li>`;
                });
            } else {
                typeLabel = type === 'ir' ? "IR Custom" : "LED";
                if (fmtPin(sensorPins[basePin])) {
                    pinsHtml += `<li><b>${sensorPins[basePin]}</b>: ${typeLabel} ${idx + 1}</li>`;
                }
            }
        });
    }

    // Motors
    if (driverType === 'l298n') {
        if (fmtPin(motorPins.leftEn)) pinsHtml += `<li><b>${motorPins.leftEn}</b>: Motor Izq. ENA (PWM)</li>`;
        if (fmtPin(motorPins.leftIn1)) pinsHtml += `<li><b>${motorPins.leftIn1}</b>: Motor Izq. IN1 (Dir)</li>`;
        if (fmtPin(motorPins.leftIn2)) pinsHtml += `<li><b>${motorPins.leftIn2}</b>: Motor Izq. IN2 (Dir)</li>`;
        if (fmtPin(motorPins.rightIn3)) pinsHtml += `<li><b>${motorPins.rightIn3}</b>: Motor Der. IN3 (Dir)</li>`;
        if (fmtPin(motorPins.rightIn4)) pinsHtml += `<li><b>${motorPins.rightIn4}</b>: Motor Der. IN4 (Dir)</li>`;
        if (fmtPin(motorPins.rightEn)) pinsHtml += `<li><b>${motorPins.rightEn}</b>: Motor Der. ENB (PWM)</li>`;
    } else if (driverType === 'mx1616') {
        if (fmtPin(motorPins.leftIn1)) pinsHtml += `<li><b>${motorPins.leftIn1}</b>: Motor Izq. IN1 (PWM)</li>`;
        if (fmtPin(motorPins.leftIn2)) pinsHtml += `<li><b>${motorPins.leftIn2}</b>: Motor Izq. IN2 (PWM)</li>`;
        if (fmtPin(motorPins.rightIn3)) pinsHtml += `<li><b>${motorPins.rightIn3}</b>: Motor Der. IN3 (PWM)</li>`;
        if (fmtPin(motorPins.rightIn4)) pinsHtml += `<li><b>${motorPins.rightIn4}</b>: Motor Der. IN4 (PWM)</li>`;
    } else { // esc
        if (fmtPin(motorPins.leftPWM)) pinsHtml += `<li><b>${motorPins.leftPWM}</b>: Motor Izq. (ESC PWM)</li>`;
        if (fmtPin(motorPins.rightPWM)) pinsHtml += `<li><b>${motorPins.rightPWM}</b>: Motor Der. (ESC PWM)</li>`;
    }

    // Check if empty
    if (pinsHtml.endsWith('<ul style="margin: 5px 0 0 20px; padding: 0;">')) {
        pinsHtml += `<li><i>Ningún pin seleccionado.</i></li>`;
    }
    pinsHtml += `</ul></div>`;

    // --- 1. Guía del Código (code-explanation) ---
    let guideHtml = `<h3>Guía de Configuración</h3><div style='font-family:inherit; white-space:pre-wrap;'>`;
    guideHtml += pinsHtml;

    // Instrucciones del Driver
    if (driverType === 'l298n') {
        guideHtml += `🎮 <b>Para usar el driver L298N:</b>
Debes configurar los pines <b>ENA (${motorPins.leftEn})</b> y <b>ENB (${motorPins.rightEn})</b> como <code>OUTPUT</code> para controlar la <i>velocidad</i> (PWM). Para la <i>dirección</i>, usa los pines <b>IN1 (${motorPins.leftIn1})/IN2 (${motorPins.leftIn2})</b> para el motor izquierdo e <b>IN3 (${motorPins.rightIn3})/IN4 (${motorPins.rightIn4})</b> para el derecho.`;
    } else if (driverType === 'mx1616') {
        guideHtml += `🎮 <b>Para usar el driver MX1616:</b>
Debes usar 4 pines PWM (p.ej. <code>analogWrite</code>). Controla el motor izquierdo con <b>IN1 (${motorPins.leftIn1})</b> e <b>IN2 (${motorPins.leftIn2})</b>, y el motor derecho con <b>IN3 (${motorPins.rightIn3})</b> e <b>IN4 (${motorPins.rightIn4})</b>.`;
    } else {
        guideHtml += `🎮 <b>Para usar ESCs:</b>
Debes conectar el pin <b>IZQ (${motorPins.leftPWM})</b> al motor izquierdo y el pin <b>DER (${motorPins.rightPWM})</b> al motor derecho, ambos configurados como <code>OUTPUT</code> para señales PWM.`;
    }

    guideHtml += `\n\n`;

    // Instrucciones de los Sensores
    if (count == 1) {
        guideHtml += `📡 <b>Para usar 1 sensor:</b>
Debes leer el pin <b>${sensorPins.center}</b> (Centro). Recuerda que <code>HIGH</code> significa que ha detectado la línea negra.`;
    } else if (count == 2) {
        guideHtml += `📡 <b>Para usar 2 sensores:</b>
Debes leer los pines <b>${sensorPins.left}</b> (Izq.) y <b>${sensorPins.right}</b> (Der.). Si el izquierdo detecta <code>HIGH</code>, el robot debe girar a la izquierda.`;
    } else if (count == 3) {
        guideHtml += `📡 <b>Para usar 3 sensores:</b>
Debes leer los pines <b>${sensorPins.left}</b>, <b>${sensorPins.center}</b> y <b>${sensorPins.right}</b>. El sensor central te indica si el robot está centrado en la línea.`;
    } else if (count == 4) {
        guideHtml += `📡 <b>Para usar 4 sensores:</b>
Debes leer desde <b>${sensorPins.farLeft}</b> hasta <b>${sensorPins.farRight}</b>. Los sensores externos son ideales para detectar curvas cerradas.`;
    } else if (count == 5) {
        guideHtml += `📡 <b>Para usar 5 sensores:</b>
Debes leer los 5 pines configurados (desde <b>${sensorPins.farLeft}</b> hasta <b>${sensorPins.farRight}</b>) para un control de precisión máxima sobre la línea.`;
    }

    guideHtml += `\n\n<b>¿Qué puedes probar?</b>
- Cambia la velocidad en <code>analogWrite</code> para ajustar el ritmo.
- Observa cómo reacciona el robot en las curvas según la lectura de los sensores.
</div>`;
    elems.codeExplanation.innerHTML = guideHtml;

    // --- 2. Editor de Código (editor-help) ---
    let sensorsText = "";
    if (count == 1) {
        sensorsText = `<li><b>Robot de 1 Sensor:</b> <code>${sensorPins.center}</code> (Centro)</li>`;
    } else if (count == 2) {
        sensorsText = `<li><b>Robot de 2 Sensores:</b> <code>${sensorPins.left}</code> (Izquierdo) y <code>${sensorPins.right}</code> (Derecho)</li>`;
    } else if (count == 3) {
        sensorsText = `<li><b>Robot de 3 Sensores:</b> <code>${sensorPins.left}</code> (Izq.), <code>${sensorPins.center}</code> (Centro), <code>${sensorPins.right}</code> (Der.)</li>`;
    } else if (count == 4) {
        sensorsText = `<li><b>Robot de 4 Sensores:</b> <code>${sensorPins.farLeft}</code> (Ext. Izq.), <code>${sensorPins.left}</code> (Izq.), <code>${sensorPins.right}</code> (Der.), <code>${sensorPins.farRight}</code> (Ext. Der.)</li>`;
    } else if (count == 5) {
        sensorsText = `<li><b>Robot de 5 Sensores:</b> <code>${sensorPins.farLeft}</code>, <code>${sensorPins.left}</code>, <code>${sensorPins.center}</code>, <code>${sensorPins.right}</code>, <code>${sensorPins.farRight}</code></li>`;
    }

    let motorsText = "";
    if (driverType === 'l298n') {
        motorsText = `<li><b>Motor Izquierdo:</b> <code>${motorPins.leftEn}</code> (PWM), <code>${motorPins.leftIn1}</code>/<code>${motorPins.leftIn2}</code> (DIR)</li>
                      <li><b>Motor Derecho:</b> <code>${motorPins.rightEn}</code> (PWM), <code>${motorPins.rightIn3}</code>/<code>${motorPins.rightIn4}</code> (DIR)</li>`;
    } else if (driverType === 'mx1616') {
        motorsText = `<li><b>Motor Izquierdo:</b> <code>${motorPins.leftIn1}</code> y <code>${motorPins.leftIn2}</code> (PWM)</li>
                      <li><b>Motor Derecho:</b> <code>${motorPins.rightIn3}</code> y <code>${motorPins.rightIn4}</code> (PWM)</li>`;
    } else {
        motorsText = `<li><b>Motor Izquierdo:</b> <code>${motorPins.leftPWM}</code> (PWM)</li>
                      <li><b>Motor Derecho:</b> <code>${motorPins.rightPWM}</code> (PWM)</li>`;
    }

    const sensorPinExample = sensorPins.left || sensorPins.center || '2';

    elems.editorHelp.innerHTML = `
        <h2>Editor de Código</h2>
        <h3>¿Cómo usar este editor?</h3>
        <p>Escribe tu código en lenguaje C++ (estilo Arduino) y haz click en <b>'Aplicar Código'</b> para compilarlo antes de iniciar la simulación. El Monitor Serial de arriba te avisará de errores básicos en la sintaxis. Si necesitas volver al estado inicial, puedes simplemente recargar la página.</p>

        <h3>Estructura Básica de Arduino</h3>
        <p>Tu código debe seguir la estructura clásica de un programa de Arduino:</p>
        <ul>
            <li><b>Sección Global:</b> Aquí defines tus variables (ej. <code>int velocidad = 150;</code>) al inicio de tu código. <br><span style="color: #d9534f; font-weight: bold;">⚠️ NOTA: El simulador NO soporta el uso de librerías externas (ej: <code>#include &lt;Servo.h&gt;</code>).</span></li>
            <li><code>void setup() { ... }</code>: Se ejecuta <b>una sola vez</b> al iniciar. Úsalo para configurar tus pines usando <code>pinMode()</code> y para iniciar la comunicación con <code>Serial.begin()</code>.</li>
            <li><code>void loop() { ... }</code>: Se ejecuta <b>repetidamente en un ciclo infinito</b>. Aquí va la lógica principal de lectura de sensores y control de motores.</li>
            <li><b>Funciones Propias:</b> Puedes crear funciones adicionales libremente abajo del loop, por ejemplo <code>void avanzar()</code> o <code>int leerSensor()</code>.</li>
        </ul>

        <h3>Lógica de Control y Variables</h3>
        <p>Están soportadas las estructuras nativas <code>if</code>, <code>else if</code>, <code>else</code>, <code>while</code>, y <code>for</code>. Puedes declarar variables como lo harías en C++ (<code>int</code>, <code>float</code>, <code>unsigned long</code>, <code>bool</code>). Ejemplo de uso:</p>
        <pre style="background:#eee; padding:0.5em; border-radius:4px;">if (digitalRead(${sensorPinExample}) == HIGH) {
  // El sensor detecta la línea, gira a un lado
}</pre>

        <h3>¿Cómo referenciar componentes?</h3>
        <p>Los <b>pines de los sensores</b> (Debes leerlos usando siempre <code>digitalRead(pin)</code>, incluso si en el Robot Editor los conectaste a puertos analógicos como A0 o A1):</p>
        <ul>${sensorsText}</ul>

        <p>Los <b>pines de los motores</b> (Para controlarlos usa <code>analogWrite(pin, valor)</code> o <code>digitalWrite(pin, valor)</code> según la placa elegida en el editor):</p>
        <ul>${motorsText}</ul>

        <p style="color: #d9534f; font-weight: bold; background: #fdf2f2; padding: 0.5em; border-radius: 4px; border-left: 4px solid #d9534f;">
            ⚠️ IMPORTANTE: 'analogRead(pin)' NO está soportado en esta versión. Todos los sensores infrarrojos de las pistas son sensores binarios; leen blanco o negro. Usa 'digitalRead()' obligatoriamente para sensores de línea.
        </p>

        <h3>Funciones de Arduino Soportadas por el Simulador:</h3>
        <ul>
            <li><code>setup()</code> y <code>loop()</code>: Funciones principales y obligatorias de arduino.</li>
            <li><code>pinMode(pin, mode)</code>: Configura el comportamiento de un pin (<code>INPUT</code> o <code>OUTPUT</code>).</li>
            <li><code>digitalRead(pin)</code>: Retorna <b>1 (HIGH)</b> si el sensor detecta línea negra, o <b>0 (LOW)</b> si detecta fondo blanco.</li>
            <li><code>digitalWrite(pin, val)</code>: Envía <b>HIGH</b> o <b>LOW</b>. Útil para habilitar pines de dirección en motores (IN1, IN2...).</li>
            <li><code>analogWrite(pin, val)</code>: Envía una señal PWM (0-255) para controlar la velocidad de un motor.</li>
            <li><code>delay(ms)</code>: Pausa la ejecución del código durante los milisegundos indicados.</li>
            <li><code>millis()</code>: Retorna la cantidad de milisegundos desde que inició la simulación.</li>
            <li><code>Serial.begin(baud)</code>, <code>Serial.print("texto")</code> y <code>Serial.println(var)</code>: Envía mensajes para depuración visual al Monitor Serial de esta pantalla.</li>
            <li><code>constrain(val, min, max)</code>: Limita un número para que no se salga de un rango especificado.</li>
            <li><code>abs(x)</code>: Devuelve el valor absoluto de un número.</li>
            <li><code>min(x, y)</code>, <code>max(x, y)</code>: Devuelve el mínimo/máximo entre dos números.</li>
            <li><code>map(val, fromLow, fromHigh, toLow, toHigh)</code>: Re-mapea un número de un rango a otro.</li>
        </ul>
    `;
}