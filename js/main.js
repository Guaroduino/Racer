// js/main.js
import { getDOMElements, setupTabs, updateTelemetry, updateLapTimerDisplay, updateCodeTypeDisplay } from './ui.js';
import { DEFAULT_ROBOT_GEOMETRY, PIXELS_PER_METER } from './config.js';
import { Simulation } from './simulation.js';
import { initCodeEditor, loadUserCode, executeUserSetup, executeUserLoop, getMotorPWMOutputs, getSerialOutput, clearSerial, getCurrentCodeType } from './codeEditor.js';
import { initRobotEditor, getCurrentRobotGeometry } from './robotEditor.js';
import { initTrackEditor } from './trackEditor.js';
import { loadAndScaleImage, getAssetPath } from './utils.js';
import './monaco-setup.js';

// Función para esperar a que Monaco esté listo
function waitForMonaco(maxAttempts = 50) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const checkMonaco = setInterval(() => {
            attempts++;
            if (window.monacoEditor) {
                clearInterval(checkMonaco);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkMonaco);
                reject(new Error("Monaco Editor no se pudo inicializar"));
            }
        }, 100);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const elems = getDOMElements();
    setupTabs();

    let simulationInstance = null;
    let simulationRunning = false;
    let animationFrameId;
    let lastFrameTime = 0;

    let robotBodyImage = null;
    let robotWheelImage = null;
    let watermarkTrackImage = null;

    let isPlacingStartLineSim = false;
    let lastPlacedStartLineSim = null;
    let isDemoMode = false;

    const DEMO_GEOMETRY = {
        width_m: 0.10, length_m: 0.15, sensorOffset_m: 0.05, sensorSpread_m: 0.035,
        sensorDiameter_m: 0.005, sensorCount: 3, robotMass_kg: 0.25,
        comOffset_m: 0.0, tireGrip: 0.8,
        connections: {
            driverType: 'l298n',
            sensorPins: { left: 'A1', center: 'A2', right: 'A3', farLeft: '', farRight: '' },
            motorPins: { leftEn: '10', leftIn1: '3', leftIn2: '5', rightIn3: '6', rightIn4: '9', rightEn: '11', leftPWM: '', rightPWM: '' }
        }
    };

    const DEMO_CODE = `// --- Configuración de Pines ---
const int S_IZQ = A1;
const int S_CEN = A2;
const int S_DER = A3;

// Motor Izquierdo
const int ENA = 10; 
const int IN1 = 3;
const int IN2 = 5;

// Motor Derecho
const int ENB = 11; 
const int IN3 = 6;
const int IN4 = 9;

// --- Variables de Control ---
int vel = 230;
int velinv = 80;
int ultimoDir = 2; //1 izquierda, 2 centro, 3 derecha

void setup() {
  Serial.begin(9600);
  pinMode(S_IZQ, INPUT);
  pinMode(S_CEN, INPUT);
  pinMode(S_DER, INPUT);
  
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
}

void loop() {
  int izq = digitalRead(S_IZQ);
  int cen = digitalRead(S_CEN);
  int der = digitalRead(S_DER);

  if (der && izq) { // Simplificado para simulación
    analogWrite(ENA, vel); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, velinv); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    ultimoDir = 3;
  }
  else if (cen && izq) {
    analogWrite(ENA, 40); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, vel); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    ultimoDir = 1;
  }
  else if (cen && der) {
    analogWrite(ENA, vel); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, 40); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    ultimoDir = 3;
  }
  else if (der) {
    analogWrite(ENA, vel); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, velinv); digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
    ultimoDir = 3;
  }
  else if (izq) {
    analogWrite(ENA, velinv); digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    analogWrite(ENB, vel); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    ultimoDir = 1;
  }
  else if (cen) {
    analogWrite(ENA, vel); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, vel); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    ultimoDir = 2;
  }
  else if (!izq && !cen && !der && ultimoDir == 1) {
    analogWrite(ENA, velinv); digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    analogWrite(ENB, vel); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  }
  else if (!izq && !cen && !der && ultimoDir == 3) {
    analogWrite(ENA, vel); digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    analogWrite(ENB, velinv); digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
  }
  delay(5);
}`;

    function refreshWhenDecorativePartsReady(decorativeParts = []) {
        if (!simulationInstance || !Array.isArray(decorativeParts) || decorativeParts.length === 0) {
            return;
        }

        let hasPendingImages = false;

        decorativeParts.forEach(part => {
            const img = part && part.img;
            if (!img) return;

            if (img.complete && img.naturalWidth > 0) {
                return;
            }

            hasPendingImages = true;

            if (img._simPreviewHooked) {
                return;
            }

            img._simPreviewHooked = true;
            const redraw = () => {
                if (simulationInstance) {
                    drawCurrentSimulationState();
                }
            };

            img.addEventListener('load', redraw, { once: true });
            img.addEventListener('error', redraw, { once: true });
        });

        // Si todas las imágenes ya estaban listas, renderizar de inmediato.
        if (!hasPendingImages) {
            drawCurrentSimulationState();
        }
    }

    // --- Main App Interface for modules ---
    const mainAppInterface = {
        // Called by TrackEditor when "Use this Track" is clicked
        loadTrackFromEditor: (trackCanvas, startX_m, startY_m, startAngle_rad) => {
            if (simulationInstance) {
                trackCanvas.dataset.fromEditor = 'true';
                simulationInstance.loadTrack(trackCanvas, startX_m, startY_m, startAngle_rad,
                    (success, trackWidth, trackHeight) => {
                        if (success) {
                            // Mantener el canvas en su tamaño CSS (no al tamaño de la pista)
                            // para que los clicks del mouse y la cámara estén en el mismo sistema de coordenadas.
                            const displayW = elems.simulationDisplayCanvas.offsetWidth || elems.simulationDisplayCanvas.width;
                            const displayH = elems.simulationDisplayCanvas.offsetHeight || elems.simulationDisplayCanvas.height;
                            elems.simulationDisplayCanvas.width = displayW;
                            elems.simulationDisplayCanvas.height = displayH;
                            simulationInstance.centerCameraOnTrack(displayW, displayH);
                            drawCurrentSimulationState();
                        } else {
                            alert("Error al cargar la pista del editor en la simulación.");
                        }
                    });
            }
        },
        // Called by Simulation when a track is loaded
        loadTrackToEditor: (trackCanvas) => {
            if (window.trackEditorInstance) {
                window.trackEditorInstance.loadTrackFromSimulation(trackCanvas);
            }
        },
        // Called by RobotEditor when geometry is applied
        updateRobotGeometry: (newGeometry, decorativeParts = []) => {
            if (simulationInstance) {
                const currentSimParams = getSimulationParamsFromUI();
                currentSimParams.robotGeometry = newGeometry;
                simulationInstance.updateParameters(currentSimParams);
                simulationInstance.robotVisible = true; // <--- Mostrar el robot cuando se aplica geometría
                // Resetting simulation is often needed if robot size changes drastically
                if (simulationInstance.track.imageData) {
                    const currentPose = { x: simulationInstance.robot.x_m, y: simulationInstance.robot.y_m, angle: simulationInstance.robot.angle_rad };
                    simulationInstance.resetSimulationState(currentPose.x, currentPose.y, currentPose.angle, newGeometry);
                }
                // Update decorative parts AFTER reset
                simulationInstance.robot.setDecorativeParts(decorativeParts);
                refreshWhenDecorativePartsReady(decorativeParts);
                drawCurrentSimulationState();
            }
        },
        // Called by RobotEditor to load assets for preview
        loadRobotAssets: (callback) => {
            // This assumes assets are already being loaded or are loaded by main init
            // Let's ensure they are loaded here if not already.
            if (robotWheelImage) {
                if (callback) callback(robotWheelImage);
            } else {
                // Load only wheel image
                loadAndScaleImage(getAssetPath('robot_wheel.png'), null, null, (wheelImg) => {
                    robotWheelImage = wheelImg;
                    if (callback) callback(robotWheelImage);
                });
            }
        },
        // switchToTab: (tabId) => { /* ... implementation ... */ } 
    };

    // Store mainAppInterface globally for simulation to access
    window.mainAppInterface = mainAppInterface;

    // --- Initialization Functions ---
    async function initializeSimulator() {
        try {
            // Esperar a que Monaco esté listo
            await waitForMonaco();

            // Load robot assets
            await new Promise(resolve => {
                mainAppInterface.loadRobotAssets((b, w) => { resolve(); });
            });
            // Load watermark
            await new Promise(resolve => {
                loadAndScaleImage(getAssetPath('watermark.png'), null, null, (img) => {
                    watermarkTrackImage = img;
                    resolve();
                });
            });

            const initialSimParams = getSimulationParamsFromUI();
            initialSimParams.robotGeometry = getCurrentRobotGeometry(); // Get from robot editor

            simulationInstance = new Simulation(
                { wheel: robotWheelImage },
                watermarkTrackImage,
                initialSimParams.robotGeometry
            );
            simulationInstance.updateParameters(initialSimParams);

            // Initialize other modules that depend on simulation state
            const codeLoaded = initCodeEditor(simulationInstance); // Pass full sim instance for API access
            if (!codeLoaded) {
                throw new Error("Error al cargar el código inicial del robot.");
            }
            updateCodeTypeDisplay(getCurrentCodeType()); // Update code type display

            initRobotEditor(mainAppInterface);
            initTrackEditor(mainAppInterface); // Track editor might generate a default track

            // Esperar a que el editor cargue la pista por defecto y exportarla al simulador
            await new Promise(resolve => {
                setTimeout(() => {
                    if (window.trackEditorInstance && typeof exportTrackAsCanvas === 'function') {
                        const exportedCanvas = exportTrackAsCanvas();
                        if (exportedCanvas) {
                            mainAppInterface.loadTrackFromEditor(exportedCanvas, 0, 0, 0);
                        }
                    }
                    resolve();
                }, 500);
            });

            // Cargar por defecto robot para dejar la simulación lista al abrir.
            if (typeof window.loadExampleRobot === 'function') {
                await window.loadExampleRobot({ silent: true, apply: true });
            }

            // Esperar a que Mónaco cargue su instancia antes de cargar y compilar el código de ejemplo
            const initCode = async () => {
                let attempts = 0;
                while (!window.monacoEditor && attempts < 50) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }
                if (typeof window.loadExampleCode === 'function') {
                    await window.loadExampleCode({ silent: true });
                }
                if (window.monacoEditor && typeof window.monacoEditor.getValue === 'function') {
                    loadUserCode(window.monacoEditor.getValue());
                    updateCodeTypeDisplay(getCurrentCodeType());
                }
                clearSerial();
            };
            initCode();

            // Load a default track or wait for user
            // For now, let's assume track editor handles its default view.
            // Simulation will start with no track until one is exported from editor.
            // Usar el tamaño CSS real del canvas para que los clicks y la cámara estén alineados
            elems.simulationDisplayCanvas.width = elems.simulationDisplayCanvas.offsetWidth || 700;
            elems.simulationDisplayCanvas.height = elems.simulationDisplayCanvas.offsetHeight || 500;

            // Initial Camera Fit
            simulationInstance.centerCameraOnTrack(elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);

            drawCurrentSimulationState();
            updateLapTimerDisplay(simulationInstance.lapTimer.getDisplayData()); // Initial lap display

        } catch (err) {
            console.error("Critical Start Error:", err);
            alert("Error crítico durante la inicialización. Revisa la consola. " + err.message);
        }
    }

    let userLoopActive = false;
    let userLoopToken = 0;

    async function startUserLoop() {
        const myToken = ++userLoopToken;
        if (userLoopActive) return;
        userLoopActive = true;

        while (simulationRunning && myToken === userLoopToken) {
            try {
                await executeUserLoop();
                // Breve espera para no saturar si el loop es muy corto
                await new Promise(resolve => setTimeout(resolve, 1));
            } catch (e) {
                if (e.message !== "Abortado por reinicio") {
                    console.error("Error en user loop:", e);
                    stopSimulation();
                    alert("Error en tu función loop(). Revisa el Monitor Serial.");
                }
                break;
            }
        }
        userLoopActive = false;
    }

    // --- Simulation Loop ---
    function simulationLoop(timestamp) {
        if (!simulationRunning) return;

        // Note: we don't 'await' anything here anymore to keep FPS high
        const deltaTime = (timestamp - lastFrameTime) / 1000.0;
        lastFrameTime = timestamp;

        // Get PWMs that user code set (set asynchronously by startUserLoop)
        const userPWMs = simulationInstance.robot.motorPWMSpeeds;

        // Step the simulation physics and logic with these PWMs
        const simData = simulationInstance.simulationStep(userPWMs.left, userPWMs.right);

        // Update Camera
        if (simulationInstance.cameraFollowRobot) {
            simulationInstance.cameraX = simulationInstance.robot.x_m * PIXELS_PER_METER;
            simulationInstance.cameraY = simulationInstance.robot.y_m * PIXELS_PER_METER;
        }

        // Update UI
        drawCurrentSimulationState();
        updateTelemetry({
            motorPWMs: { leftPWM: userPWMs.left, rightPWM: userPWMs.right, leftDirForward: true, rightDirForward: true },
            sensorStates: simData.sensorStates,
            simTime: simData.simTime_s,
            outOfBounds: simData.outOfBounds
        });
        updateLapTimerDisplay(simData.lapData);

        // El serial monitor se actualiza desde el loop asíncrono o aquí
        const serialText = getSerialOutput();
        elems.serialMonitorOutput.textContent = serialText;
        if (elems.serialMonitorOutput.textContent.length > 0) {
            elems.serialMonitorOutput.scrollTop = elems.serialMonitorOutput.scrollHeight;
        }
        if (elems.serialMonitorOutputCodeEditor) {
            elems.serialMonitorOutputCodeEditor.textContent = serialText;
            if (elems.serialMonitorOutputCodeEditor.textContent.length > 0) {
                elems.serialMonitorOutputCodeEditor.scrollTop = elems.serialMonitorOutputCodeEditor.scrollHeight;
            }
        }

        if (simData.outOfBounds) {
            stopSimulation();
        }

        if (simulationRunning) {
            animationFrameId = requestAnimationFrame(simulationLoop);
        }
    }

    // --- Simulation Control Functions ---
    async function startSimulation() {
        if (simulationRunning) return;
        if (!simulationInstance || !simulationInstance.track.imageData) {
            alert("No hay una pista cargada en la simulación. Carga una desde el Editor de Pista.");
            return;
        }

        if (!simulationInstance.robotVisible) {
            alert("No hay un robot cargado en la simulación. Configura uno en el Editor de Robot y haz clic en 'Aplicar Diseño'.");
            return;
        }

        isDemoMode = false;

        // Ensure latest code from editor is loaded
        if (!loadUserCode(window.monacoEditor.getValue())) {
            alert("Error en el código del robot. No se puede iniciar la simulación. Revisa el Monitor Serial.");
            return;
        }
        updateCodeTypeDisplay(getCurrentCodeType()); // Update code type display

        // Ensure latest simulation parameters are applied
        const params = getSimulationParamsFromUI();
        params.robotGeometry = getCurrentRobotGeometry();
        simulationInstance.updateParameters(params);

        // Reset simulation instance position based on latest geometry 
        // to avoid snapping issues if the user changed geometry
        const currentGeo = simulationInstance.getCurrentRobotGeometry();
        let startX = simulationInstance.robot.x_m, startY = simulationInstance.robot.y_m, startAngle = simulationInstance.robot.angle_rad;
        if (simulationInstance.track.imageData && simulationInstance.lapTimer.startLine) {
            startX = (simulationInstance.lapTimer.startLine.x1 + simulationInstance.lapTimer.startLine.x2) / 2;
            startY = (simulationInstance.lapTimer.startLine.y1 + simulationInstance.lapTimer.startLine.y2) / 2;
            const dx = simulationInstance.lapTimer.startLine.x2 - simulationInstance.lapTimer.startLine.x1;
            const dy = simulationInstance.lapTimer.startLine.y2 - simulationInstance.lapTimer.startLine.y1;
            startAngle = Math.atan2(dy, dx) - Math.PI / 2;
        }
        simulationInstance.resetSimulationState(startX, startY, startAngle, currentGeo);

        try {
            await executeUserSetup(); // Run user's setup() function
        } catch (e) {
            alert("Error durante la ejecución de setup(). La simulación no comenzará. Revisa la consola y el Monitor Serial.");
            return;
        }

        simulationRunning = true;
        startUserLoop(); // Lanzar el loop de código de usuario en paralelo

        elems.startSimButton.disabled = true;
        elems.stopSimButton.disabled = false;
        elems.resetSimButton.disabled = true; // Disable reset while running
        if (window.monacoEditor) {
            window.monacoEditor.updateOptions({ readOnly: true });
        }
        elems.applySimParamsButton.disabled = true;
        // Robot editor and track editor controls could also be disabled

        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(simulationLoop);
    }

    function _forceStop() {
        // Siempre detiene el loop y reactiva los botones, sin importar simulationRunning
        simulationRunning = false;
        userLoopToken++; // CLAVE: Detener cualquier loop de usuario asíncrono que esté en medio de un delay

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        elems.startSimButton.disabled = false;
        elems.stopSimButton.disabled = true;
        elems.resetSimButton.disabled = false;
        if (window.monacoEditor) {
            window.monacoEditor.updateOptions({ readOnly: false });
        }
        elems.applySimParamsButton.disabled = false;
    }

    function stopSimulation() {
        if (!simulationRunning) return;
        _forceStop();
    }

    async function resetSimulation() {
        _forceStop(); // Siempre fuerza la parada (no depende de simulationRunning)
        if (simulationInstance) {
            if (isDemoMode) {
                // --- Salir del modo Demo limpiamente ---
                isDemoMode = false;

                // Restaurar la geometría del usuario desde el Robot Editor
                const userGeo = getCurrentRobotGeometry();
                const params = getSimulationParamsFromUI();
                params.robotGeometry = userGeo;
                simulationInstance.updateParameters(params);

                // Limpiar las partes decorativas del robot demo
                simulationInstance.robot.setDecorativeParts([]);
                simulationInstance.robot.customWheels = null;

                // Reposicionar en la línea de salida con la geometría del usuario
                let startX = 0.1, startY = 0.1, startAngle = 0;
                if (simulationInstance.track.imageData && simulationInstance.lapTimer.startLine) {
                    startX = (simulationInstance.lapTimer.startLine.x1 + simulationInstance.lapTimer.startLine.x2) / 2;
                    startY = (simulationInstance.lapTimer.startLine.y1 + simulationInstance.lapTimer.startLine.y2) / 2;
                    const dx = simulationInstance.lapTimer.startLine.x2 - simulationInstance.lapTimer.startLine.x1;
                    const dy = simulationInstance.lapTimer.startLine.y2 - simulationInstance.lapTimer.startLine.y1;
                    startAngle = Math.atan2(dy, dx) - Math.PI / 2;
                }
                simulationInstance.resetSimulationState(startX, startY, startAngle, userGeo);

                // Restaurar el código del usuario desde Monaco y hacer setup
                const userCode = window.monacoEditor ? window.monacoEditor.getValue() : '';
                if (window.monacoEditor) window.monacoEditor.updateOptions({ readOnly: false });
                if (loadUserCode(userCode)) {
                    updateCodeTypeDisplay(getCurrentCodeType());
                    try { await executeUserSetup(); } catch (e) { /* mostrado en Serial */ }
                }
                clearSerial();

                drawCurrentSimulationState();
                updateLapTimerDisplay(simulationInstance.lapTimer.getDisplayData());
                updateTelemetry({});
                return;
            }

            // --- Reset normal (sin demo) ---
            const params = getSimulationParamsFromUI();
            params.robotGeometry = getCurrentRobotGeometry();
            simulationInstance.updateParameters(params);

            const currentGeo = simulationInstance.getCurrentRobotGeometry();

            // Get the original start position from the lap timer's start line
            let startX = 0.1, startY = 0.1, startAngle = 0;
            if (simulationInstance.track.imageData && simulationInstance.lapTimer.startLine) {
                startX = (simulationInstance.lapTimer.startLine.x1 + simulationInstance.lapTimer.startLine.x2) / 2;
                startY = (simulationInstance.lapTimer.startLine.y1 + simulationInstance.lapTimer.startLine.y2) / 2;
                const dx = simulationInstance.lapTimer.startLine.x2 - simulationInstance.lapTimer.startLine.x1;
                const dy = simulationInstance.lapTimer.startLine.y2 - simulationInstance.lapTimer.startLine.y1;
                startAngle = Math.atan2(dy, dx) - Math.PI / 2;
            }
            simulationInstance.resetSimulationState(startX, startY, startAngle, currentGeo);

            // Reload user code and re-run setup
            if (loadUserCode(window.monacoEditor.getValue())) {
                try { await executeUserSetup(); } catch (e) { /* mostrado en Serial */ }
            }
            clearSerial();

            drawCurrentSimulationState();
            updateLapTimerDisplay(simulationInstance.lapTimer.getDisplayData());
            updateTelemetry({});
        }
    }

    function drawCurrentSimulationState() {
        if (simulationInstance && elems.simulationDisplayCanvas) {
            const ctx = elems.simulationDisplayCanvas.getContext('2d');
            simulationInstance.draw(ctx, elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);
        }
    }

    function getSimulationParamsFromUI() {
        return {
            timeStep: parseFloat(elems.timeStepInput.value),
            maxRobotSpeedMPS: parseFloat(elems.maxRobotSpeedInput.value),
            motorEfficiency: parseFloat(elems.motorEfficiencyInput.value),
            motorImbalance: parseFloat(elems.motorImbalanceInput.value),
            motorResponseFactor: parseFloat(elems.motorResponseInput.value),
            sensorNoiseProb: parseFloat(elems.sensorNoiseInput.value),
            movementPerturbFactor: parseFloat(elems.movementPerturbInput.value),
            motorDeadbandPWM: parseInt(elems.motorDeadbandInput.value),
            lineThreshold: parseInt(elems.lineThresholdInput.value)
            // robotGeometry is handled by robotEditor
        };
    }

    function applySimulationParameters() {
        if (simulationInstance) {
            const params = getSimulationParamsFromUI();
            if (!isDemoMode) {
                params.robotGeometry = getCurrentRobotGeometry();
            } else {
                params.robotGeometry = DEMO_GEOMETRY;
            }
            simulationInstance.updateParameters(params);
        }
    }

    async function startDemoSimulation() {
        console.log('[DEMO] startDemoSimulation called. simulationInstance:', !!simulationInstance, 'track.imageData:', !!(simulationInstance && simulationInstance.track.imageData));
        if (simulationRunning) stopSimulation();
        if (!simulationInstance || !simulationInstance.track.imageData) {
            alert("Carga una pista antes de reproducir la Demo.");
            return;
        }

        const confirmDemo = confirm(
            "Se iniciará una simulación demostrativa con el Robot SLC SVP 2025 (3 sensores) y código Arduino precargado.\n\n" +
            "Tus diseños y códigos actuales en los otros paneles se conservarán intactos y volverán a cargarse automáticamente al terminar la prueba y presionar 'Iniciar'.\n\n" +
            "¿Continuar?"
        );

        if (!confirmDemo) return;

        isDemoMode = true;

        // --- Load SLC SVP 2025 template ---
        let svpGeometry = DEMO_GEOMETRY; // fallback
        let svpParts = [];
        try {
            const response = await fetch('assets/robots/SLC_SVP_2025.json');
            if (response.ok) {
                const robotData = await response.json();
                if (robotData.geometry) {
                    // Merge template geometry with DEMO pin connections and sensorCount
                    svpGeometry = {
                        ...DEMO_GEOMETRY,         // provides connections, mass, grip, etc.
                        ...robotData.geometry,    // overrides width, sensorOffset, sensorSpread, sensorDiameter
                        sensorCount: DEMO_GEOMETRY.sensorCount,      // keep 3 sensors
                        connections: DEMO_GEOMETRY.connections        // keep demo pin config
                    };
                }
                if (robotData.parts) {
                    svpParts = robotData.parts;
                }
            }
        } catch (err) {
            console.warn('[DEMO] Could not load SLC_SVP_2025.json, using fallback geometry:', err);
        }

        // Apply SVP geometry to simulation
        const params = getSimulationParamsFromUI();
        params.robotGeometry = svpGeometry;
        simulationInstance.updateParameters(params);

        // Load decorative parts DIRECTLY into simulation robot (no Robot Editor involvement)
        if (svpParts.length > 0) {
            const PART_SRCS = {
                robot_body: 'parts/robot_body.png',
                robot_body_2: 'parts/robot_body_2.png',
                robot_board: 'parts/robot_board.png'
                // add more part IDs here if needed
            };
            const directParts = await Promise.all(svpParts.map(p => new Promise(resolve => {
                const src = PART_SRCS[p.id];
                if (!src) return resolve(null);
                const img = new Image();
                const assetPath = window.getAssetPath ? window.getAssetPath(src) : `assets/${src}`;
                // Apply same transform as getPlacedParts(): rotate90(x,y) + PI/2 to rotation
                const rx = -p.y; // rotate90
                const ry = p.x;
                img.onload = () => resolve({ id: p.id, name: p.name, img, x: rx, y: ry, rotation: (p.rotation || 0) + Math.PI / 2 });
                img.onerror = () => resolve(null);
                img.src = assetPath;
            })));
            simulationInstance.robot.setDecorativeParts(directParts.filter(Boolean));
        } else {
            simulationInstance.robot.decorativeParts = [];
        }
        simulationInstance.robot.customWheels = null; // use real wheel image

        // Load demo code
        if (!loadUserCode(DEMO_CODE)) {
            alert("Error al cargar código Demo.");
            return;
        }
        updateCodeTypeDisplay('arduino');

        // Position the robot at the start line
        let startX = simulationInstance.robot.x_m, startY = simulationInstance.robot.y_m, startAngle = simulationInstance.robot.angle_rad;
        if (simulationInstance.track.imageData && simulationInstance.lapTimer.startLine) {
            startX = (simulationInstance.lapTimer.startLine.x1 + simulationInstance.lapTimer.startLine.x2) / 2;
            startY = (simulationInstance.lapTimer.startLine.y1 + simulationInstance.lapTimer.startLine.y2) / 2;
            const dx = simulationInstance.lapTimer.startLine.x2 - simulationInstance.lapTimer.startLine.x1;
            const dy = simulationInstance.lapTimer.startLine.y2 - simulationInstance.lapTimer.startLine.y1;
            startAngle = Math.atan2(dy, dx) - Math.PI / 2;
        }
        simulationInstance.resetSimulationState(startX, startY, startAngle, svpGeometry);
        simulationInstance.robotVisible = true;
        drawCurrentSimulationState();

        try {
            await executeUserSetup();
        } catch (e) {
            alert("Error en la demostración.");
            return;
        }

        simulationRunning = true;
        startUserLoop();

        elems.startSimButton.disabled = true;
        elems.stopSimButton.disabled = false;
        elems.resetSimButton.disabled = false; // Permitir reiniciar/salir de la demo en cualquier momento
        if (window.monacoEditor) {
            window.monacoEditor.updateOptions({ readOnly: true });
        }
        elems.applySimParamsButton.disabled = true;

        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(simulationLoop);
    }

    // --- Event Listeners for UI ---
    elems.startSimButton.addEventListener('click', startSimulation);
    elems.stopSimButton.addEventListener('click', stopSimulation);
    elems.resetSimButton.addEventListener('click', resetSimulation);
    elems.applySimParamsButton.addEventListener('click', applySimulationParameters);

    // Botón aplicar código en el editor
    elems.applyCodeButton.addEventListener('click', () => {
        if (loadUserCode(window.monacoEditor.getValue())) {
            updateCodeTypeDisplay(getCurrentCodeType());
            alert("✅ Código aplicado con éxito. Puedes iniciar la simulación.");
        } else {
            alert("❌ Error en el código. Revisa el Monitor Serial para más detalles.");
        }
    });

    // --- Event Listeners for Camera ---
    const simZoomInBtn = document.getElementById('simZoomInBtn');
    const simZoomOutBtn = document.getElementById('simZoomOutBtn');
    const simFitTrackBtn = document.getElementById('simFitTrackBtn');
    const simFollowRobotBtn = document.getElementById('simFollowRobotBtn');
    const simFullscreenBtn = document.getElementById('simFullscreenBtn');
    const simDemoBtn = document.getElementById('simDemoBtn');
    const simulationLayout = document.querySelector('.simulation-layout');

    if (simDemoBtn) {
        simDemoBtn.addEventListener('click', startDemoSimulation);
    }

    simZoomInBtn.addEventListener('click', () => {
        if (simulationInstance) {
            simulationInstance.cameraZoom *= 1.2;
            drawCurrentSimulationState();
        }
    });

    simZoomOutBtn.addEventListener('click', () => {
        if (simulationInstance) {
            simulationInstance.cameraZoom /= 1.2;
            drawCurrentSimulationState();
        }
    });

    simFitTrackBtn.addEventListener('click', () => {
        if (simulationInstance) {
            simulationInstance.centerCameraOnTrack(elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);
            drawCurrentSimulationState();
        }
    });

    simFollowRobotBtn.addEventListener('click', () => {
        if (simulationInstance) {
            simulationInstance.cameraFollowRobot = !simulationInstance.cameraFollowRobot;
            simFollowRobotBtn.classList.toggle('active', simulationInstance.cameraFollowRobot);
            if (simulationInstance.cameraFollowRobot && !simulationRunning) {
                // Instantly jump to robot if toggled while paused
                simulationInstance.cameraX = simulationInstance.robot.x_m * PIXELS_PER_METER;
                simulationInstance.cameraY = simulationInstance.robot.y_m * PIXELS_PER_METER;
                drawCurrentSimulationState();
            }
        }
    });

    const resizeCanvasForSimulation = () => {
        if (elems.simulationDisplayCanvas) {
            const displayW = elems.simulationDisplayCanvas.offsetWidth || 700;
            const displayH = elems.simulationDisplayCanvas.offsetHeight || 500;
            elems.simulationDisplayCanvas.width = displayW;
            elems.simulationDisplayCanvas.height = displayH;
            if (simulationInstance) drawCurrentSimulationState();
        }
    };

    const fitTrackToCanvas = () => {
        if (simulationInstance && elems.simulationDisplayCanvas) {
            const displayW = elems.simulationDisplayCanvas.offsetWidth || 700;
            const displayH = elems.simulationDisplayCanvas.offsetHeight || 500;
            elems.simulationDisplayCanvas.width = displayW;
            elems.simulationDisplayCanvas.height = displayH;
            simulationInstance.centerCameraOnTrack(displayW, displayH);
            drawCurrentSimulationState();
        }
    };

    if (simFullscreenBtn) {
        simFullscreenBtn.addEventListener('click', () => {
            if (!simulationLayout.classList.contains('is-fullscreen')) {
                simulationLayout.classList.add('is-fullscreen');
                if (simulationLayout.requestFullscreen) {
                    simulationLayout.requestFullscreen().catch(err => console.error("Error intentando fullscreen:", err));
                }
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    simulationLayout.classList.remove('is-fullscreen');
                    setTimeout(fitTrackToCanvas, 100);
                }
            }
            // Retraso para dejar que el layout cambie, luego zoom extents
            setTimeout(fitTrackToCanvas, 150);
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                simulationLayout.classList.remove('is-fullscreen');
            }
            // Zoom extents al terminar la transición
            setTimeout(fitTrackToCanvas, 150);
        });

        // Also listen to window resize just in case
        window.addEventListener('resize', () => {
            if (simulationLayout.classList.contains('is-fullscreen')) {
                resizeCanvasForSimulation();
            }
        });
    }

    // Botón para ubicar línea de comienzo en simulación
    const placeStartLineSimButton = document.getElementById('placeStartLineSimButton');
    let startLineStartPoint = null;

    placeStartLineSimButton.addEventListener('click', () => {
        isPlacingStartLineSim = !isPlacingStartLineSim;
        placeStartLineSimButton.textContent = isPlacingStartLineSim ? 'Cancelar Ubicación' : 'Ubicar Línea de Comienzo';
        placeStartLineSimButton.style.backgroundColor = isPlacingStartLineSim ? '#d9534f' : '';

        if (isPlacingStartLineSim) {
            elems.simulationDisplayCanvas.style.cursor = 'crosshair';
        } else {
            elems.simulationDisplayCanvas.style.cursor = 'default';
            startLineStartPoint = null;
        }
    });

    // Helper for Control Panel buttons
    function checkPanelButtonClick(canvas, event) {
        if (!simulationInstance || !simulationInstance.robot) return -1;
        const geom = simulationInstance.robot.geometry || simulationInstance.robot;
        const btns = geom.panelButtons;
        if (!geom.panelScreen && (!btns || btns.length === 0)) return -1;
        if (!btns || btns.length === 0) return -1;
    
        const rect = canvas.getBoundingClientRect();
        
        // Manejar object-fit: contain
        const renderWidth = rect.width;
        const renderHeight = rect.height;
        const canvasAspect = canvas.width / canvas.height;
        const containerAspect = renderWidth / renderHeight;
    
        let actualWidth, actualHeight, offsetX, offsetY;
    
        if (containerAspect > canvasAspect) {
            actualHeight = renderHeight;
            actualWidth = renderHeight * canvasAspect;
            offsetX = (renderWidth - actualWidth) / 2;
            offsetY = 0;
        } else {
            actualWidth = renderWidth;
            actualHeight = renderWidth / canvasAspect;
            offsetX = 0;
            offsetY = (renderHeight - actualHeight) / 2;
        }
    
        let clientX = event.clientX;
        let clientY = event.clientY;
        if(event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        }

        let adjustedPx_x = (clientX - rect.left) - offsetX;
        let adjustedPx_y = (clientY - rect.top) - offsetY;
    
        const x = adjustedPx_x * (canvas.width / actualWidth);
        const y = adjustedPx_y * (canvas.height / actualHeight);
    
        const count = btns.length;
        const panelWidth = 180;
        const panelHeight = 80;
        const panelX = 16;
        const panelY = canvas.height - panelHeight - 14;

        const startX = panelX + 76;
        const endX = panelX + panelWidth - 16;
        const step = (endX - startX) / (count + 1);

        for (let i=0; i<count; i++) {
            const cx = startX + step * (i + 1);
            const cy = panelY + panelHeight / 2;
            const r = (btns[i].size || 8) / 2;

            const dx = x - cx;
            const dy = y - cy;
            // Pad hit area by a few pixels
            if (dx*dx + dy*dy <= (r + 12) * (r + 12)) {
                return i;
            }
        }
        return -1;
    }

    // --- Mouse Events ---
    // Helper: usa la inversa de la matriz de cámara exacta capturada en draw() para máxima precisión
    function screenToWorld(event) {
        let clientX = event.clientX;
        let clientY = event.clientY;
        
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        }

        const rect = elems.simulationDisplayCanvas.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        return simulationInstance.screenToWorld(cx, cy, elems.simulationDisplayCanvas);
    }

    elems.simulationDisplayCanvas.addEventListener('mousedown', (event) => {
        const btnIdx = checkPanelButtonClick(elems.simulationDisplayCanvas, event);
        if (btnIdx !== -1) {
            simulationInstance.robot.sensors['btn_' + btnIdx] = 1;
            // update UI immediately
            if (!simulationRunning) {
                simulationInstance.draw(elems.simulationDisplayCanvas.getContext('2d'), elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);
            }
            return; // We consumed the click for a button
        }
        
        if (!isPlacingStartLineSim || !simulationInstance || !simulationInstance.track.imageData) return;
        startLineStartPoint = screenToWorld(event);
    });

    elems.simulationDisplayCanvas.addEventListener('mousemove', (event) => {
        if (!isPlacingStartLineSim || !startLineStartPoint || !simulationInstance || !simulationInstance.track.imageData) return;

        const world = screenToWorld(event);

        // Draw preview line using world->canvas transform to keep it aligned with the camera
        const canvasW = elems.simulationDisplayCanvas.width;
        const canvasH = elems.simulationDisplayCanvas.height;
        const zoom = simulationInstance.cameraZoom;
        const camX = simulationInstance.cameraX;
        const camY = simulationInstance.cameraY;
        const toCanvas = (wx, wy) => ({
            x: (wx - camX) * zoom + canvasW / 2,
            y: (wy - camY) * zoom + canvasH / 2,
        });

        const startCanvas = toCanvas(startLineStartPoint.x, startLineStartPoint.y);
        const endCanvas = toCanvas(world.x, world.y);

        const ctx = elems.simulationDisplayCanvas.getContext('2d');
        simulationInstance.draw(ctx, canvasW, canvasH);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#FF00FF";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(startCanvas.x, startCanvas.y);
        ctx.lineTo(endCanvas.x, endCanvas.y);
        ctx.stroke();
        ctx.restore();
    });

    // Mouse up general handler to release all panel buttons
    const releaseAllPanelButtons = () => {
        if (simulationInstance && simulationInstance.robot) {
            let redraw = false;
            for (let i = 0; i < 10; i++) {
                if (simulationInstance.robot.sensors['btn_' + i] === 1) {
                    simulationInstance.robot.sensors['btn_' + i] = 0;
                    redraw = true;
                }
            }
            if (redraw && !simulationRunning) {
                simulationInstance.draw(elems.simulationDisplayCanvas.getContext('2d'), elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);
            }
        }
    };

    elems.simulationDisplayCanvas.addEventListener('mouseup', (event) => {
        releaseAllPanelButtons();
        
        if (!isPlacingStartLineSim || !startLineStartPoint || !simulationInstance || !simulationInstance.track.imageData) return;

        const world = screenToWorld(event);

        // Convert to meters for simulation
        const x1_m = startLineStartPoint.x / PIXELS_PER_METER;
        const y1_m = startLineStartPoint.y / PIXELS_PER_METER;
        const x2_m = world.x / PIXELS_PER_METER;
        const y2_m = world.y / PIXELS_PER_METER;

        // Calculate angle for robot orientation (perpendicular to line, facing forward)
        const dx = x2_m - x1_m;
        const dy = y2_m - y1_m;
        const angle_rad = Math.atan2(dy, dx) - Math.PI / 2; // FIX: -PI/2 para que mire hacia adelante en la pista

        // Calculate center point of line for robot position
        const center_x_m = (x1_m + x2_m) / 2;
        const center_y_m = (y1_m + y2_m) / 2;

        // Reset simulation with new start position
        simulationInstance.resetSimulationState(center_x_m, center_y_m, angle_rad);

        // Initialize lap timer with new start line
        simulationInstance.lapTimer.initialize(
            { x_m: center_x_m, y_m: center_y_m, angle_rad: angle_rad },
            simulationInstance.totalSimTime_s,
            { x1: x1_m, y1: y1_m, x2: x2_m, y2: y2_m }
        );

        // Exit placement mode
        isPlacingStartLineSim = false;
        placeStartLineSimButton.textContent = 'Ubicar Línea de Comienzo';
        placeStartLineSimButton.style.backgroundColor = '';
        elems.simulationDisplayCanvas.style.cursor = 'default';
        startLineStartPoint = null;

        // Redraw final state
        drawCurrentSimulationState();
    });

    // --- Touch Events for Mobile ---
    elems.simulationDisplayCanvas.addEventListener('touchstart', (event) => {
        if (event.touches.length > 0) {
            const btnIdx = checkPanelButtonClick(elems.simulationDisplayCanvas, event);
            if (btnIdx !== -1) {
                simulationInstance.robot.sensors['btn_' + btnIdx] = 1;
                if (!simulationRunning) {
                    simulationInstance.draw(elems.simulationDisplayCanvas.getContext('2d'), elems.simulationDisplayCanvas.width, elems.simulationDisplayCanvas.height);
                }
                event.preventDefault(); // We consumed the touch for a button
                return;
            }
        }
        
        if (!isPlacingStartLineSim || !simulationInstance || !simulationInstance.track.imageData) return;
        if (event.touches.length !== 1) return;

        startLineStartPoint = screenToWorld(event);
        event.preventDefault();
    }, { passive: false });

    elems.simulationDisplayCanvas.addEventListener('touchmove', (event) => {
        if (!isPlacingStartLineSim || !startLineStartPoint || !simulationInstance || !simulationInstance.track.imageData) return;
        if (event.touches.length !== 1) return;

        const world = screenToWorld(event);

        // Draw preview line using world->canvas transform to keep it aligned con track
        const canvasW = elems.simulationDisplayCanvas.width;
        const canvasH = elems.simulationDisplayCanvas.height;
        const zoom = simulationInstance.cameraZoom;
        const camX = simulationInstance.cameraX;
        const camY = simulationInstance.cameraY;
        const toCanvas = (wx, wy) => ({
            x: (wx - camX) * zoom + canvasW / 2,
            y: (wy - camY) * zoom + canvasH / 2,
        });

        const startCanvas = toCanvas(startLineStartPoint.x, startLineStartPoint.y);
        const endCanvas = toCanvas(world.x, world.y);

        // Draw current track state
        const ctx = elems.simulationDisplayCanvas.getContext('2d');
        simulationInstance.draw(ctx, canvasW, canvasH);

        // Draw preview line
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#FF00FF";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(startCanvas.x, startCanvas.y);
        ctx.lineTo(endCanvas.x, endCanvas.y);
        ctx.stroke();
        ctx.restore();
        event.preventDefault();
    }, { passive: false });

    elems.simulationDisplayCanvas.addEventListener('touchend', (event) => {
        releaseAllPanelButtons();
        if (!isPlacingStartLineSim || !startLineStartPoint || !simulationInstance || !simulationInstance.track.imageData) return;

        const world = screenToWorld(event);

        // Convert to meters for simulation
        const line = {
            x1: startLineStartPoint.x / PIXELS_PER_METER,
            y1: startLineStartPoint.y / PIXELS_PER_METER,
            x2: world.x / PIXELS_PER_METER,
            y2: world.y / PIXELS_PER_METER
        };

        // Calculate angle for robot orientation (perpendicular to line)
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const angle_rad = Math.atan2(dy, dx) - Math.PI / 2; // Perpendicular to line

        // Calculate center point of line for robot position
        const center_x_m = (line.x1 + line.x2) / 2;
        const center_y_m = (line.y1 + line.y2) / 2;

        // Reset simulation with new start position
        simulationInstance.resetSimulationState(center_x_m, center_y_m, angle_rad);

        // Initialize lap timer with new start line
        simulationInstance.lapTimer.initialize(
            { x_m: center_x_m, y_m: center_y_m, angle_rad: angle_rad },
            simulationInstance.totalSimTime_s,
            line
        );

        // Exit placement mode
        isPlacingStartLineSim = false;
        elems.simulationDisplayCanvas.classList.remove('placing-line');
        if (elems.simPlaceStartLineBtn) {
            elems.simPlaceStartLineBtn.classList.remove('active');
        }
        startLineStartPoint = null;

        // Redraw final state
        drawCurrentSimulationState();
        event.preventDefault();
    }, { passive: false });

    // --- Start Everything ---
    initializeSimulator().then(() => {
    }).catch(err => {
        console.error("Critical Start Error:", err);
        alert("Error crítico durante la inicialización. Revisa la consola. " + err.message);
    });
});
