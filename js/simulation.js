// js/simulation.js (Simulation Engine)
import { Robot } from './robot.js';
// PIDController is not used here if PID is in user code.
// import { PIDController } from './pidController.js';
import { Track } from './track.js';
import { PIXELS_PER_METER, DEFAULT_ROBOT_GEOMETRY } from './config.js';
import { LapTimer } from './lapTimer.js';

export class Simulation {
    constructor(robotImages, watermarkImage, initialGeometry = DEFAULT_ROBOT_GEOMETRY) {
        this.robot = new Robot(0, 0, 0, initialGeometry); // Initial position set by loadTrack
        this.robotVisible = false; // <--- Robot oculto por defecto
        if (robotImages) this.robot.setImages(robotImages.wheel);

        // Ensure robot geometry is valid
        if (!this.robot.length_m || isNaN(this.robot.length_m)) {
            this.robot.length_m = 0.15; // Default length in meters
        }
        if (!this.robot.wheelbase_m || isNaN(this.robot.wheelbase_m)) {
            this.robot.wheelbase_m = 0.1; // Default wheelbase in meters
        }

        this.track = new Track();
        if (watermarkImage) this.track.setWatermark(watermarkImage);

        this.lapTimer = new LapTimer(this.robot.wheelbase_m, this.robot.length_m);

        this.params = {
            timeStep: 0.02, // Corresponds to user code delay(20) for ~50 FPS
            maxRobotSpeedMPS: 0.5, // Max physical speed robot can achieve at 255 PWM
            motorEfficiency: 0.85, // Factor reducing max speed
            motorImbalance: 0.01, // Differencial imbalance factor (-0.5 to 0.5)
            motorResponseFactor: 0.05, // How quickly motors reach target speed (0-1, higher is faster)
            sensorNoiseProb: 0.0, // Probability (0-1) of a sensor flipping its reading
            movementPerturbFactor: 0.0, // Random perturbation to movement (0-1)
            motorDeadbandPWM: 10, // PWM values below this (absolute) are treated as 0
            lineThreshold: 100 // For track's isPixelOnLine
        };
        this.totalSimTime_s = 0;
        this.isOutOfTrack = false;

        // Camera State
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraZoom = 1;
        this.cameraFollowRobot = false;

        this._shapeHitCanvas = null;
        this._shapeHitCtx = null;
    }

    _getShapeHitCtx() {
        if (this._shapeHitCtx) return this._shapeHitCtx;
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                const c = new OffscreenCanvas(4, 4);
                this._shapeHitCanvas = c;
                this._shapeHitCtx = c.getContext('2d');
                return this._shapeHitCtx;
            }
        } catch (e) {
            // Fallback below.
        }

        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 4;
        this._shapeHitCanvas = c;
        this._shapeHitCtx = c.getContext('2d');
        return this._shapeHitCtx;
    }

    _buildObstaclePath(shape, halfW, halfH) {
        const path = new Path2D();
        if (shape === 'circle') {
            path.ellipse(0, 0, halfW, halfH, 0, 0, Math.PI * 2);
            return path;
        }
        if (shape === 'triangle') {
            path.moveTo(0, -halfH);
            path.lineTo(halfW, halfH);
            path.lineTo(-halfW, halfH);
            path.closePath();
            return path;
        }
        if (shape === 'outer_curve') {
            path.moveTo(-halfW, halfH);
            path.ellipse(-halfW, halfH, halfW * 2, halfH * 2, 0, 0, -Math.PI / 2, true);
            path.lineTo(-halfW, halfH);
            path.closePath();
            return path;
        }
        if (shape === 'inner_curve') {
            path.moveTo(-halfW, -halfH);
            path.lineTo(halfW, -halfH);
            path.lineTo(halfW, halfH);
            path.ellipse(-halfW, halfH, halfW * 2, halfH * 2, 0, 0, -Math.PI / 2, true);
            path.closePath();
            return path;
        }

        // Default rectangle.
        path.rect(-halfW, -halfH, halfW * 2, halfH * 2);
        return path;
    }

    // Reusable point-vs-shape hit-test in world coordinates.
    // Useful for keeping all collision/sensor checks consistent with editor shapes.
    _isPointInsideElement(px, py, el, padding = 0) {
        if (!el) return false;

        const width = Math.max(0, Number(el.width) || 0);
        const height = Math.max(0, Number(el.height) || 0);
        if (width === 0 || height === 0) return false;

        const cx = (Number(el.x) || 0) + width / 2;
        const cy = (Number(el.y) || 0) + height / 2;
        const rot_rad = (Number(el.rotation) || 0) * Math.PI / 180;
        const cosR = Math.cos(-rot_rad);
        const sinR = Math.sin(-rot_rad);

        const dx = px - cx;
        const dy = py - cy;
        const localX = dx * cosR - dy * sinR;
        const localY = dx * sinR + dy * cosR;

        const halfW = width / 2 + Math.max(0, padding);
        const halfH = height / 2 + Math.max(0, padding);

        const shape = String(el.shape || 'rect').toLowerCase();
        const elementType = String(el.type || '').toLowerCase();

        // Non-obstacle interactives are treated as rects for now.
        if (elementType !== 'obstacle' || shape === 'rect') {
            return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
        }

        if (shape === 'circle') {
            if (halfW <= 0 || halfH <= 0) return false;
            const nx = localX / halfW;
            const ny = localY / halfH;
            return nx * nx + ny * ny <= 1;
        }

        const ctx = this._getShapeHitCtx();
        if (!ctx) {
            return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
        }

        const path = this._buildObstaclePath(shape, halfW, halfH);
        return ctx.isPointInPath(path, localX, localY);
    }

    _raycastShapeLocal(startX_px, startY_px, angle_rad, maxDistance_px, cx, cy, rot_rad, halfW, halfH, shape) {
        const dirX = Math.cos(angle_rad);
        const dirY = Math.sin(angle_rad);
        const rayEl = {
            type: 'obstacle',
            shape,
            x: cx - halfW,
            y: cy - halfH,
            width: halfW * 2,
            height: halfH * 2,
            rotation: rot_rad * 180 / Math.PI
        };

        // 1 px step gives reliable hit for small/curved features.
        const step = 1;
        for (let d = 1; d <= maxDistance_px; d += step) {
            const wx = startX_px + dirX * d;
            const wy = startY_px + dirY * d;
            if (this._isPointInsideElement(wx, wy, rayEl, 0)) {
                return d * d;
            }
        }

        return null;
    }

    centerCameraOnTrack(canvasWidth, canvasHeight) {
        if (!this.track || !this.track.width_px) return;

        // Calculate the zoom needed to fit the track width or height
        const scaleX = canvasWidth / this.track.width_px;
        const scaleY = canvasHeight / this.track.height_px;

        // Use the smaller scale so it fully fits
        this.cameraZoom = Math.min(scaleX, scaleY) * 0.95; // 95% to leave a tiny margin

        // El centro de la pista en píxeles. 
        // Ya que la pista va de (0,0) a (track.width_px, track.height_px).
        this.cameraX = this.track.width_px / 2;
        this.cameraY = this.track.height_px / 2;
    }

    // Generate a start line at a connection between pieces (preferred)
    _generateStartLineFromConnection() {
        // Accede a la grilla del editor
        const grid = window.trackEditorInstance?.grid;
        if (!grid) {
            console.warn('[RandomStart] No se encontró la grilla de piezas.');
            return null;
        }
        const rows = grid.length;
        const cols = grid[0].length;
        if (!rows || !cols) {
            console.warn('[RandomStart] Grilla vacía.');
            return null;
        }
        // Lista de conexiones válidas
        const conexiones = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const pieza = grid[r][c];
                if (!pieza) continue;
                // Conexión Este
                if (c < cols - 1 && grid[r][c + 1]) {
                    conexiones.push({ r1: r, c1: c, r2: r, c2: c + 1 });
                }
                // Conexión Sur
                if (r < rows - 1 && grid[r + 1][c]) {
                    conexiones.push({ r1: r, c1: c, r2: r + 1, c2: c });
                }
            }
        }
        if (conexiones.length === 0) {
            console.warn('[RandomStart] No se encontraron conexiones entre piezas.');
            return null;
        }
        // Elige una conexión aleatoria
        const idx = Math.floor(Math.random() * conexiones.length);
        const { r1, c1, r2, c2 } = conexiones[idx];
        // Calcula el centro de cada celda en píxeles
        const cellSize_px = this.track.width_px / cols;
        const x1 = (c1 + 0.5) * cellSize_px;
        const y1 = (r1 + 0.5) * cellSize_px;
        const x2 = (c2 + 0.5) * cellSize_px;
        const y2 = (r2 + 0.5) * cellSize_px;
        // Centro de la conexión
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        // Ángulo de la línea que une los centros
        const angle = Math.atan2(y2 - y1, x2 - x1);
        // Perpendicular para la línea de inicio
        const perpAngle = angle + Math.PI / 2;
        const lineLength_px = this.robot.wheelbase_m * 1.5 * PIXELS_PER_METER;
        const halfLength_px = lineLength_px / 2;
        const dx = Math.cos(perpAngle) * halfLength_px;
        const dy = Math.sin(perpAngle) * halfLength_px;
        // Extremos de la línea de inicio
        const x1_line = cx - dx;
        const y1_line = cy - dy;
        const x2_line = cx + dx;
        const y2_line = cy + dy;
        // Devuelve en metros
        return {
            startLine: {
                x1: x1_line / PIXELS_PER_METER,
                y1: y1_line / PIXELS_PER_METER,
                x2: x2_line / PIXELS_PER_METER,
                y2: y2_line / PIXELS_PER_METER
            },
            startX: cx / PIXELS_PER_METER,
            startY: cy / PIXELS_PER_METER,
            startAngle: perpAngle
        };
    }

    // Reemplaza la generación aleatoria por la de conexión si es posible
    _generateRandomStartLine() {
        // Prioridad 1: RFID superior del editor (default del proyecto)
        const interactiveRFID = (window.trackEditorInstance && typeof window.trackEditorInstance.getInteractiveElements === 'function')
            ? window.trackEditorInstance.getInteractiveElements().filter(el => el && el.type === 'rfid')
            : [];

        if (interactiveRFID.length > 0) {
            const topRfid = interactiveRFID.reduce((best, el) => (el.y < best.y ? el : best), interactiveRFID[0]);
            const cx_px = topRfid.x + (topRfid.width || 30) / 2;
            const cy_px = topRfid.y + (topRfid.height || 30) / 2;

            // Línea vertical con vector hacia arriba->abajo invertido (dy < 0)
            // para que startAngle quede orientado hacia la izquierda.
            const lineLength_px = Math.max(this.robot.wheelbase_m * 1.8 * PIXELS_PER_METER, 60);
            const half = lineLength_px / 2;
            const x1 = cx_px;
            const y1 = cy_px + half;
            const x2 = cx_px;
            const y2 = cy_px - half;
            const startAngle = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;

            return {
                startLine: {
                    x1: x1 / PIXELS_PER_METER,
                    y1: y1 / PIXELS_PER_METER,
                    x2: x2 / PIXELS_PER_METER,
                    y2: y2 / PIXELS_PER_METER
                },
                startX: cx_px / PIXELS_PER_METER,
                startY: cy_px / PIXELS_PER_METER,
                startAngle
            };
        }

        // Intenta primero con la conexión entre piezas
        const fromConnection = this._generateStartLineFromConnection();
        if (fromConnection) {
            console.log('[RandomStart] Línea generada en conexión entre piezas:', fromConnection);
            return fromConnection;
        }
        // Si no es posible, usa la línea de inicio por defecto proporcionada
        console.warn('[RandomStart] No se pudo generar una línea en conexión, usando línea de inicio por defecto.');
        // Coordenadas por defecto en píxeles (zona superior de la pista por defecto)
        const x1 = 1320;
        const y1 = 24;
        const x2 = 1320;
        const y2 = 240;
        return {
            startLine: {
                x1: x1 / PIXELS_PER_METER,
                y1: y1 / PIXELS_PER_METER,
                x2: x2 / PIXELS_PER_METER,
                y2: y2 / PIXELS_PER_METER
            },
            startX: (x1 + x2) / 2 / PIXELS_PER_METER,
            startY: (y1 + y2) / 2 / PIXELS_PER_METER,
            startAngle: Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2
        };
    }

    // Update simulation parameters (from UI)
    updateParameters(newParams) {
        if (newParams.robotGeometry) {
            this.robot.updateGeometry(newParams.robotGeometry);
            // LapTimer might need update if robot dimensions change significantly for start line
            this.lapTimer.robotWidth_m = this.robot.wheelbase_m;
            this.lapTimer.robotLength_m = this.robot.length_m;
        }
        this.params.timeStep = newParams.timeStep ?? this.params.timeStep;
        this.params.maxRobotSpeedMPS = newParams.maxRobotSpeedMPS ?? this.params.maxRobotSpeedMPS;
        this.params.motorEfficiency = newParams.motorEfficiency ?? this.params.motorEfficiency;
        this.params.motorImbalance = newParams.motorImbalance ?? this.params.motorImbalance;
        this.params.motorResponseFactor = newParams.motorResponseFactor ?? this.params.motorResponseFactor;
        this.params.sensorNoiseProb = newParams.sensorNoiseProb ?? this.params.sensorNoiseProb;
        this.params.movementPerturbFactor = newParams.movementPerturbFactor ?? this.params.movementPerturbFactor;
        this.params.motorDeadbandPWM = newParams.motorDeadbandPWM ?? this.params.motorDeadbandPWM;
        this.params.lineThreshold = newParams.lineThreshold ?? this.params.lineThreshold;

        this.track.lineThreshold = this.params.lineThreshold; // Update track's threshold
    }

    // Load a track (from file or editor canvas)
    loadTrack(source, startX_m, startY_m, startAngle_rad, callback) {
        this.track.load(source, null, null, this.params.lineThreshold, (success, trackWidthPx, trackHeightPx) => {
            if (success) {
                // If the source is a canvas with start position data, use that
                if (
                    source instanceof HTMLCanvasElement &&
                    source.dataset.startX !== undefined &&
                    source.dataset.startY !== undefined &&
                    source.dataset.startAngle !== undefined
                ) {
                    startX_m = parseFloat(source.dataset.startX);
                    startY_m = parseFloat(source.dataset.startY);
                    startAngle_rad = parseFloat(source.dataset.startAngle);
                } else {
                    console.log('[RandomStart] No hay línea de inicio en el editor, generando aleatoria...');
                    // Generate random start line if no start position is provided
                    const randomStart = this._generateRandomStartLine();
                    if (randomStart) {
                        startX_m = randomStart.startX;
                        startY_m = randomStart.startY;
                        startAngle_rad = randomStart.startAngle;
                    } else {
                        console.warn('[RandomStart] No se pudo generar una línea aleatoria, usando valores por defecto.');
                    }
                }

                // Reset simulation state first
                this.resetSimulationState(startX_m, startY_m, startAngle_rad);

                // Ensure LapTimer has up-to-date robot dimensions
                if (!this.robot.length_m || isNaN(this.robot.length_m)) {
                    this.robot.length_m = 0.15;
                }
                if (!this.robot.wheelbase_m || isNaN(this.robot.wheelbase_m)) {
                    this.robot.wheelbase_m = 0.1;
                }
                this.lapTimer.robotWidth_m = this.robot.wheelbase_m;
                this.lapTimer.robotLength_m = this.robot.length_m;

                // Initialize lap timer with the new start pose
                this.lapTimer.initialize({ x_m: startX_m, y_m: startY_m, angle_rad: startAngle_rad }, this.totalSimTime_s);

                // Position robot at start line
                if (this.lapTimer.isActive && this.lapTimer.startLine) {
                    // Calculate robot position at start line
                    const lineCenterX = (this.lapTimer.startLine.x1 + this.lapTimer.startLine.x2) / 2;
                    const lineCenterY = (this.lapTimer.startLine.y1 + this.lapTimer.startLine.y2) / 2;

                    // Position robot slightly behind the start line
                    const backOffset = -this.robot.length_m / 2;
                    const cosA = Math.cos(startAngle_rad);
                    const sinA = Math.sin(startAngle_rad);

                    this.robot.x_m = lineCenterX + backOffset * cosA;
                    this.robot.y_m = lineCenterY + backOffset * sinA;
                    this.robot.angle_rad = startAngle_rad;
                }

                // Notify track editor if the track was loaded from a source other than the editor
                if (source instanceof HTMLCanvasElement && !source.dataset.fromEditor) {
                    // Create a copy of the canvas to send to the editor
                    const trackCanvas = document.createElement('canvas');
                    trackCanvas.width = trackWidthPx;
                    trackCanvas.height = trackHeightPx;
                    const ctx = trackCanvas.getContext('2d');
                    ctx.drawImage(source, 0, 0);
                    trackCanvas.dataset.fromEditor = 'true';

                    // Notify the track editor through the main app interface
                    if (window.mainAppInterface) {
                        window.mainAppInterface.loadTrackToEditor(trackCanvas);
                    }
                }
            }
            if (callback) callback(success, trackWidthPx, trackHeightPx);
        }, source instanceof HTMLCanvasElement);
    }

    resetSimulationState(startX_m, startY_m, startAngle_rad, newGeometry = null) {
        if (newGeometry) this.robot.updateGeometry(newGeometry);
        this.robot.resetState(startX_m, startY_m, startAngle_rad);
        this.totalSimTime_s = 0;
        this.isOutOfTrack = false;
        this.lapTimer.reset(); // Reset lap data, but don't re-initialize line until new track/start
        if (this.track.imageData) { // Re-initialize if track already loaded
            this.lapTimer.initialize(
                { x_m: startX_m, y_m: startY_m, angle_rad: startAngle_rad },
                this.totalSimTime_s,
                this.lapTimer.startLine // <-- Mantener la línea de comienzo actual
            );
        }
    }

    // This is the main step function called by the simulation loop in main.js
    // It takes PWM values from the user's code.
    simulationStep(userLeftPWM, userRightPWM) {
        if (!this.track.imageData) {
            return { error: "No track loaded." }; // Early exit if no track
        }

        // 1. Update robot's internal sensor readings based on its current position and track
        this._updateRobotSensors();

        // (User code runs here, via main.js, and sets robot.motorPWMSpeeds)
        // For this method, userLeftPWM and userRightPWM are passed in.

        // 2. Calculate target motor speeds from PWMs
        let leftPWM = userLeftPWM;
        let rightPWM = userRightPWM;

        // Apply deadband (user code's constrain should handle 0-255, but good to be safe)
        leftPWM = (Math.abs(leftPWM) < this.params.motorDeadbandPWM && leftPWM !== 0) ? 0 : leftPWM;
        rightPWM = (Math.abs(rightPWM) < this.params.motorDeadbandPWM && rightPWM !== 0) ? 0 : rightPWM;

        const effectiveMaxSpeed = this.params.maxRobotSpeedMPS * this.params.motorEfficiency;

        // Motor Imbalance
        const imbalance = this.params.motorImbalance;
        // If > 0, left motor is weaker. If < 0, right motor is weaker.
        const leftFactor = 1.0 - Math.max(0, imbalance);
        const rightFactor = 1.0 - Math.max(0, -imbalance);

        let target_vL_mps = (leftPWM / 255.0) * effectiveMaxSpeed * leftFactor;
        let target_vR_mps = (rightPWM / 255.0) * effectiveMaxSpeed * rightFactor;

        // 3. Update robot physics (movement)
        this.robot.updateMovement(
            this.params.timeStep,
            target_vL_mps,
            target_vR_mps,
            this.params.motorResponseFactor,
            effectiveMaxSpeed, // Max physical speed used for clamping inside updateMovement
            this.params.movementPerturbFactor
        );

        // 4. Update total simulation time and lap timer
        this.totalSimTime_s += this.params.timeStep;
        const lapUpdate = this.lapTimer.update(this.totalSimTime_s, { x_m: this.robot.x_m, y_m: this.robot.y_m, angle_rad: this.robot.angle_rad });

        // 5. Check if robot is out of track boundaries
        // A simple boundary check. More sophisticated would be checking if far from any line.
        const boundaryMargin_m = Math.max(this.robot.length_m, this.robot.wheelbase_m); // Generous margin
        this.isOutOfTrack = (
            this.robot.x_m < -boundaryMargin_m ||
            this.robot.x_m * PIXELS_PER_METER > this.track.width_px + boundaryMargin_m * PIXELS_PER_METER ||
            this.robot.y_m < -boundaryMargin_m ||
            this.robot.y_m * PIXELS_PER_METER > this.track.height_px + boundaryMargin_m * PIXELS_PER_METER
        );

        // 6. Return data for UI update
        return {
            sensorStates: { ...this.robot.sensors }, // Current sensor readings (0=online, 1=offline)
            motorPWMsFromUser: { leftPWM: userLeftPWM, rightPWM: userRightPWM }, // PWMs from user code
            actualMotorSpeeds: { left_mps: this.robot.currentApplied_vL_mps, right_mps: this.robot.currentApplied_vR_mps },
            lapData: this.lapTimer.getDisplayData(),
            newLapCompleted: lapUpdate.newLapCompleted,
            completedLapTime: lapUpdate.completedLapTime,
            simTime_s: this.totalSimTime_s,
            outOfBounds: this.isOutOfTrack
        };
    }

    // Internal helper for ToF raycasting against obstacles
    _raycastObstacles(startX_px, startY_px, angle_rad, maxDistance_px) {
        let minDistanceSq = maxDistance_px * maxDistance_px;
        let p_endX = startX_px + Math.cos(angle_rad) * maxDistance_px;
        let p_endY = startY_px + Math.sin(angle_rad) * maxDistance_px;

        // Array combinado o vivo de los obstáculos sin necesidad de presionar exportar
        const liveElements = (window.trackEditorInstance && typeof window.trackEditorInstance.getInteractiveElements === 'function') 
            ? window.trackEditorInstance.getInteractiveElements() 
            : (this.track && this.track.interactiveElements ? this.track.interactiveElements : []);

        if (liveElements && liveElements.length > 0) {
            for (const el of liveElements) {
                if (el.type === 'obstacle' || el.type === 'hopper') {
                    const cx = el.x + el.width / 2;
                    const cy = el.y + el.height / 2;
                    const halfW = el.width / 2;
                    const halfH = el.height / 2;
                    const rot_rad = (el.rotation || 0) * Math.PI / 180;
                    const shape = (el.shape || 'rect').toLowerCase();

                    // For non-rect obstacle shapes, raycast against the actual shape.
                    if (el.type === 'obstacle' && shape !== 'rect') {
                        const hitDistSq = this._raycastShapeLocal(
                            startX_px,
                            startY_px,
                            angle_rad,
                            maxDistance_px,
                            cx,
                            cy,
                            rot_rad,
                            halfW,
                            halfH,
                            shape
                        );
                        if (hitDistSq !== null && hitDistSq < minDistanceSq && hitDistSq > 0) {
                            minDistanceSq = hitDistSq;
                        }
                        continue;
                    }

                    // Convert ray start and end points directly into OBB local space
                    const dx0 = startX_px - cx;
                    const dy0 = startY_px - cy;
                    const localX0 = dx0 * Math.cos(-rot_rad) - dy0 * Math.sin(-rot_rad);
                    const localY0 = dx0 * Math.sin(-rot_rad) + dy0 * Math.cos(-rot_rad);

                    const dx1 = p_endX - cx;
                    const dy1 = p_endY - cy;
                    const localX1 = dx1 * Math.cos(-rot_rad) - dy1 * Math.sin(-rot_rad);
                    const localY1 = dx1 * Math.sin(-rot_rad) + dy1 * Math.cos(-rot_rad);

                    // Liang-Barsky line clipping against AABB (-halfW, -halfH) to (halfW, halfH)
                    let t0 = 0.0, t1 = 1.0;
                    const p = [-(localX1 - localX0), localX1 - localX0, -(localY1 - localY0), localY1 - localY0];
                    const q = [localX0 + halfW, halfW - localX0, localY0 + halfH, halfH - localY0];

                    let hit = true;
                    for (let i = 0; i < 4; i++) {
                        if (p[i] === 0) {
                            if (q[i] < 0) hit = false;
                        } else {
                            const t = q[i] / p[i];
                            if (p[i] < 0) {
                                if (t > t1) hit = false;
                                else if (t > t0) t0 = t;
                            } else {
                                if (t < t0) hit = false;
                                else if (t < t1) t1 = t;
                            }
                        }
                    }

                    if (hit && t0 <= t1 && t0 >= 0 && t0 <= 1) {
                        // The intersection point t0 is valid
                        const hitX = startX_px + t0 * (p_endX - startX_px);
                        const hitY = startY_px + t0 * (p_endY - startY_px);
                        const distSq = (hitX - startX_px)**2 + (hitY - startY_px)**2;
                        if (distSq < minDistanceSq && distSq > 0) {
                            minDistanceSq = distSq;
                        }
                    }
                }
            }
        }
        
        // Also raycast against track boundaries (walls)
        if (this.track && this.track.width_px > 0 && this.track.height_px > 0) {
            let hit = true;
            let t0 = 0.0, t1 = 1.0;
            const p = [-(p_endX - startX_px), p_endX - startX_px, -(p_endY - startY_px), p_endY - startY_px];
            const q = [startX_px - 0, this.track.width_px - startX_px, startY_px - 0, this.track.height_px - startY_px];

            for (let i = 0; i < 4; i++) {
                if (p[i] === 0) {
                    if (q[i] < 0) hit = false;
                } else {
                    const t = q[i] / p[i];
                    if (p[i] < 0) {
                        if (t > t1) hit = false;
                        else if (t > t0) t0 = t;
                    } else {
                        if (t < t0) hit = false;
                        else if (t < t1) t1 = t;
                    }
                }
            }

            if (hit && t0 <= t1 && t0 >= 0 && t0 <= 1) {
                const hitX = startX_px + t0 * (p_endX - startX_px);
                const hitY = startY_px + t0 * (p_endY - startY_px);
                const distSq = (hitX - startX_px)**2 + (hitY - startY_px)**2;
                if (distSq < minDistanceSq && distSq > 0) {
                    minDistanceSq = distSq;
                }
            }
        }

        return Math.sqrt(minDistanceSq);
    }

    _updateRobotSensors() {
        if (!this.track.imageData) {
            // All off line if no track
            this.robot._initSensorState();
            for (const key in this.robot.sensors) {
                this.robot.sensors[key] = 1;
            }
            return;
        }
        const sensorPositions_m = this.robot.getSensorPositions_world_m();
        const interactiveRFID = (window.trackEditorInstance && typeof window.trackEditorInstance.getInteractiveElements === 'function')
            ? window.trackEditorInstance.getInteractiveElements().filter(el => el && el.type === 'rfid')
            : [];

        let firstDetectedTag = null;

        const parseRFIDUid = (value) => {
            const raw = String(value ?? '').trim();
            if (!raw) return [0xDE, 0xAD, 0xBE, 0xEF];

            const hexCandidates = raw.match(/[0-9a-fA-F]{2}/g);
            if (hexCandidates && hexCandidates.length >= 1) {
                return hexCandidates.slice(0, 10).map(h => parseInt(h, 16) & 0xFF);
            }

            const decCandidates = raw.match(/\d+/g);
            if (decCandidates && decCandidates.length >= 1) {
                return decCandidates.slice(0, 10).map(n => (parseInt(n, 10) || 0) & 0xFF);
            }

            return [0xDE, 0xAD, 0xBE, 0xEF];
        };

        const isSensorOverRFIDTag = (sensorX_px, sensorY_px, sensorRadius_px) => {
            for (const tag of interactiveRFID) {
                if (this._isPointInsideElement(sensorX_px, sensorY_px, tag, sensorRadius_px)) {
                    return tag;
                }
            }
            return null;
        };
        // Calculate sensor radius in pixels using robot's parameter
        const defaultSensorRadiusPx = Math.max(1, (this.robot.sensorDiameter_m / 2) * PIXELS_PER_METER);

        delete this.robot.sensors.tofMm; // Reset for recalculation

        // For each sensor, compute state
        for (const key in sensorPositions_m) {
            const pos = sensorPositions_m[key];
            const px = pos.x_m * PIXELS_PER_METER;
            const py = pos.y_m * PIXELS_PER_METER;
            
            let physicsRadiusPx = defaultSensorRadiusPx;
            
            let isOutputSensor = false;
            if (key.startsWith('custom_')) {
                physicsRadiusPx = Math.max(2, 0.005 * PIXELS_PER_METER); // 10mm fixed for custom
                let cleanKey = key;
                if (key.endsWith('_sym')) cleanKey = key.replace('_sym', '');
                const idxStr = cleanKey.replace('custom_', '');
                const idx = parseInt(idxStr);
                if (this.robot.customSensors && this.robot.customSensors[idx]) {
                    const cSens = this.robot.customSensors[idx];
                    if (cSens.detectionDiameter) {
                        physicsRadiusPx = Math.max(1, (parseFloat(cSens.detectionDiameter) / 1000 / 2) * PIXELS_PER_METER);
                    }
                    if (cSens.type === 'tof' || cSens.type === 'rgb' || cSens.type === 'rfid' || cSens.type === 'led' || cSens.type === 'screen') {
                        if (cSens.type === 'led' || cSens.type === 'screen') {
                            isOutputSensor = true;
                        }
                        if (cSens.type === 'tof') {
                            const customMaxDist_mm = cSens.maxDistance || 500;
                            const maxDist_px = (customMaxDist_mm / 1000) * PIXELS_PER_METER;
                            
                            let absoluteAngle_rad = this.robot.angle_rad + (cSens.angle || 0) * Math.PI / 180;
                            if (key.endsWith('_sym')) {
                                absoluteAngle_rad = this.robot.angle_rad + (180 - (cSens.angle || 0)) * Math.PI / 180;
                            }
                            
                            const measuredDist_px = this._raycastObstacles(px, py, absoluteAngle_rad, maxDist_px);
                            const measuredDist_mm = (measuredDist_px / PIXELS_PER_METER) * 1000;
                            
                            // Store generic distance
                            this.robot.sensors[key + '_distance_mm'] = measuredDist_mm;
                            
                            // Update shared tofMm (for codeEditor backward compatibility, keeps smallest if multiple exist)
                            if (typeof this.robot.sensors.tofMm !== 'number') {
                                this.robot.sensors.tofMm = measuredDist_mm;
                            } else {
                                this.robot.sensors.tofMm = Math.min(this.robot.sensors.tofMm, measuredDist_mm);
                            }
                        }
                        if (cSens.type === 'rfid') {
                            const foundTag = isSensorOverRFIDTag(px, py, physicsRadiusPx);
                            this.robot.sensors[key] = foundTag ? 1 : 0;
                            if (!firstDetectedTag && foundTag) {
                                firstDetectedTag = foundTag;
                            }
                            isOutputSensor = true;
                        }
                        // These don't directly read the line, but we can set their physics radius to be bounding-box-ish or skip. We keep line detection output anyway just in case users use it, using a fixed 2px radius as fallback if not IR.
                        if (cSens.type !== 'ir') physicsRadiusPx = 2;
                    }
                }
            }

            if (!isOutputSensor) {
                let onLine = this.track.isAreaOnLine(px, py, physicsRadiusPx);
                // Apply sensor noise if enabled
                if (this.params.sensorNoiseProb > 0 && Math.random() < this.params.sensorNoiseProb) {
                    onLine = !onLine;
                }
                // 1 = on line (HIGH), 0 = off line (LOW)
                this.robot.sensors[key] = onLine ? 1 : 0;
            }
        }

        this.robot.sensors.rfidPresent = !!firstDetectedTag;
        if (firstDetectedTag) {
            this.robot.sensors.rfidUid = parseRFIDUid(firstDetectedTag.value);
            this.robot.sensors.rfidTagRaw = String(firstDetectedTag.value ?? '');
        } else {
            this.robot.sensors.rfidUid = [];
            this.robot.sensors.rfidTagRaw = '';
        }
    }

    draw(displayCtx, displayCanvasWidth, displayCanvasHeight) {
        if (!displayCtx) return;

        displayCtx.save();
        displayCtx.clearRect(0, 0, displayCanvasWidth, displayCanvasHeight);

        // Calculate Camera Transform
        // We want the rendering to be centered on (cameraX, cameraY) with scale cameraZoom
        const centerX = displayCanvasWidth / 2;
        const centerY = displayCanvasHeight / 2;

        displayCtx.translate(centerX, centerY);
        displayCtx.scale(this.cameraZoom, this.cameraZoom);
        displayCtx.translate(-this.cameraX, -this.cameraY);

        if (this.track) {
            this.track.draw(displayCtx, displayCanvasWidth, displayCanvasHeight); // Note: track drawer might ignore width/height if it draws its own bounds
        }
        if (this.robot && this.track && this.track.imageData && this.robotVisible) {
            // Pass all sensor states for display
            const displaySensorStates = {};
            for (const key in this.robot.sensors) {
                if (key.endsWith('_distance_mm')) {
                    displaySensorStates[key] = this.robot.sensors[key];
                } else {
                    // Pass true if on line (1), false if off line (0)
                    displaySensorStates[key] = this.robot.sensors[key] === 1;
                }
            }
            this.robot.draw(displayCtx, displaySensorStates);
        }

        // Draw Lap Timer Start/Finish Line
        if (this.lapTimer.isActive) {
            const x1 = this.lapTimer.startLine.x1 * PIXELS_PER_METER;
            const y1 = this.lapTimer.startLine.y1 * PIXELS_PER_METER;
            const x2 = this.lapTimer.startLine.x2 * PIXELS_PER_METER;
            const y2 = this.lapTimer.startLine.y2 * PIXELS_PER_METER;
            displayCtx.save();
            displayCtx.setLineDash([]); // solid line
            displayCtx.strokeStyle = "#FF9999"; // light red
            displayCtx.lineWidth = 2; // thinner line
            displayCtx.beginPath();
            displayCtx.moveTo(x1, y1);
            displayCtx.lineTo(x2, y2);
            displayCtx.stroke();

            // Draw endpoint circles in the same color as the line
            displayCtx.fillStyle = "#FF9999";
            displayCtx.beginPath();
            displayCtx.arc(x1, y1, 4, 0, 2 * Math.PI);
            displayCtx.fill();
            displayCtx.beginPath();
            displayCtx.arc(x2, y2, 4, 0, 2 * Math.PI);
            displayCtx.fill();

            displayCtx.restore();
        }

        // Guardar la matriz de cámara antes de restaurar para poder invertirla en screenToWorld()
        // getTransform() devuelve la matriz ACTUAL (con el camera transform aplicado)
        this._cameraMatrix = displayCtx.getTransform();

        displayCtx.restore();
    }

    /**
     * Convierte posición de pantalla (CSS px relativo al canvas) a coordenadas del mundo (px de pista).
     * Usa la inversa de la verdadera matriz de cámara usada en draw(), garantizando precisión exacta.
     * @param {number} cssPx_x  - event.clientX - canvas.getBoundingClientRect().left
     * @param {number} cssPx_y  - event.clientY - canvas.getBoundingClientRect().top
     * @param {HTMLCanvasElement} canvas
     * @returns {{ x: number, y: number }} world pixel coordinates
     */
    screenToWorld(cssPx_x, cssPx_y, canvas) {
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

        // Si el click fue en el letterbox (fuera del area dibujada), podemos ajustarlo a los bordes
        let adjustedPx_x = cssPx_x - offsetX;
        let adjustedPx_y = cssPx_y - offsetY;

        // Convertir al internal pixel de canvas (0..canvas.width, 0..canvas.height)
        const internalX = adjustedPx_x * (canvas.width / actualWidth);
        const internalY = adjustedPx_y * (canvas.height / actualHeight);

        if (!this._cameraMatrix) {
            return { x: internalX, y: internalY };
        }

        const inv = this._cameraMatrix.inverse();
        return {
            x: inv.a * internalX + inv.c * internalY + inv.e,
            y: inv.b * internalX + inv.d * internalY + inv.f,
        };
    }

    // Utility to get current robot geometry
    getCurrentRobotGeometry() {
        // Return a full geometry snapshot so reset/start keeps custom devices
        // such as LEDs, panel elements and symmetry settings.
        return {
            width_m: this.robot.wheelbase_m,
            length_m: this.robot.length_m,
            sensorOffset_m: this.robot.sensorForwardProtrusion_m,
            sensorSpread_m: this.robot.sensorSideSpread_m,
            sensorDiameter_m: this.robot.sensorDiameter_m,
            sensorCount: this.robot.sensorCount, // <-- Mantener la cantidad de sensores
            robotMass_kg: this.robot.robotMass_kg,
            comOffset_m: this.robot.comOffset_m,
            tireGrip: this.robot.tireGrip,
            customWheels: this.robot.customWheels || null,
            customSensors: this.robot.customSensors || null,
            panelScreen: this.robot.panelScreen || false,
            panelButtons: this.robot.panelButtons || [],
            horizontalSymmetry: this.robot.horizontalSymmetry || false,
            connections: this.robot.connections || null, // ← CRÍTICO: sin esto, se pierde la config de pines al reiniciar
        };
    }
}