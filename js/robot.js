// js/robot.js
import { PIXELS_PER_METER, WHEEL_LENGTH_M, WHEEL_WIDTH_M, DEFAULT_ROBOT_GEOMETRY } from './config.js';
import { clamp } from './utils.js';

export class Robot {
    constructor(initialX_m = 0.1, initialY_m = 0.1, initialAngle_rad = 0, geometry = DEFAULT_ROBOT_GEOMETRY) {
        this.x_m = initialX_m;
        this.y_m = initialY_m;
        this.angle_rad = initialAngle_rad; // Angle in radians, 0 is along positive X-axis

        // Default to 3 sensors if not specified
        const sensorCount = geometry && geometry.sensorCount ? geometry.sensorCount : 3;
        this.sensorCount = sensorCount;
        this.sensors = {};
        this._initSensorState();
        // Motor speeds as PWM values (0-255), set by user's analogWrite
        this.motorPWMSpeeds = {
            left: 0,
            right: 0
        };

        this.updateGeometry(geometry, false); // false to skip trail reset if called from constructor

        this.currentApplied_vL_mps = 0; // Actual speed of left wheel
        this.currentApplied_vR_mps = 0; // Actual speed of right wheel

        this.centerTrail = [];
        this.leftWheelTrail = [];
        this.rightWheelTrail = [];
        this.maxTrailLength = 300; // Shorter trail for performance

        this.wheelImage = null;
        this.decorativeParts = []; // Array to store decorative parts
    }

    _initSensorState() {
        // Always use keys: left, center, right, farLeft, farRight (for up to 5 sensors)
        // For 2 sensors: left, right
        // For 3 sensors: left, center, right
        // For 4 sensors: farLeft, left, right, farRight
        // For 5 sensors: farLeft, left, center, right, farRight
        this.sensors = {};
        if (this.sensorCount === 1) {
            this.sensors.center = 0;
        } else if (this.sensorCount === 2) {
            this.sensors.left = 0;
            this.sensors.right = 0;
        } else if (this.sensorCount === 3) {
            this.sensors.left = 0;
            this.sensors.center = 0;
            this.sensors.right = 0;
        } else if (this.sensorCount === 4) {
            this.sensors.farLeft = 0;
            this.sensors.left = 0;
            this.sensors.right = 0;
            this.sensors.farRight = 0;
        } else if (this.sensorCount === 5) {
            this.sensors.farLeft = 0;
            this.sensors.left = 0;
            this.sensors.center = 0;
            this.sensors.right = 0;
            this.sensors.farRight = 0;
        } else if (this.sensorCount === 6) {
            this.sensors.fullFarLeft = 0;
            this.sensors.farLeft = 0;
            this.sensors.left = 0;
            this.sensors.right = 0;
            this.sensors.farRight = 0;
            this.sensors.fullFarRight = 0;
        } else if (this.sensorCount === 7) {
            this.sensors.fullFarLeft = 0;
            this.sensors.farLeft = 0;
            this.sensors.left = 0;
            this.sensors.center = 0;
            this.sensors.right = 0;
            this.sensors.farRight = 0;
            this.sensors.fullFarRight = 0;
        } else if (this.sensorCount === 8) {
            this.sensors.fullFarLeft = 0;
            this.sensors.farLeft = 0;
            this.sensors.left = 0;
            this.sensors.centerLeft = 0; // Addition for 8 sensors to keep symmetry
            this.sensors.centerRight = 0;
            this.sensors.right = 0;
            this.sensors.farRight = 0;
            this.sensors.fullFarRight = 0;
        }

        if (this.customSensors && this.customSensors.length > 0) {
            this.customSensors.forEach((s, idx) => {
                this.sensors[`custom_${idx}`] = 0;
            });
        }

        if (this.horizontalSymmetry) {
            const keys = Object.keys(this.sensors).filter(k => !k.startsWith('custom_') && !k.endsWith('_rear') && !k.endsWith('_sym'));
            keys.forEach(k => { this.sensors[k + '_rear'] = 0; });
        }
        
        if (this.customSensors && this.customSensors.length > 0) {
            this.customSensors.forEach((s, idx) => {
                if (s.symmetric) {
                    this.sensors[`custom_${idx}_sym`] = 0;
                }
            });
        }

        if (!this.oledDisplays || typeof this.oledDisplays !== 'object') {
            this.oledDisplays = {};
        }
    }

    setImages(wheelImg) {
        this.wheelImage = wheelImg;
    }

    setDecorativeParts(parts) {
        this.decorativeParts = parts;
    }

    updateGeometry(geometry, resetTrails = true) {
        if (!geometry) return;

        this.wheelbase_m = geometry.width_m;
        this.length_m = geometry.length_m || 0.15; // Use provided length or default to 0.15m
        this.sensorForwardProtrusion_m = geometry.sensorOffset_m;
        this.sensorSideSpread_m = geometry.sensorSpread_m;
        this.sensorDiameter_m = geometry.sensorDiameter_m;
        this.sensorCount = geometry.sensorCount || 3;

        // Asignar parámetros físicos de la geometría (o usar defaults de config en caso que no vengan)
        this.robotMass_kg = geometry.robotMass_kg ?? 0.25;
        this.comOffset_m = geometry.comOffset_m ?? 0.0;
        this.tireGrip = geometry.tireGrip ?? 0.8;

        // Asignar llantas paramétricas si existen
        this.customWheels = geometry.customWheels || null;

        // Asignar sensores customizados
        this.customSensors = geometry.customSensors || null;

        // Asignar panel
        this.panelScreen = geometry.panelScreen || false;
        this.panelButtons = geometry.panelButtons || [];

        // Asignar simetría 
        this.horizontalSymmetry = geometry.horizontalSymmetry || false;

        // Asignar conexiones de pines
        this.connections = geometry.connections || null;

        this._initSensorState();

        if (resetTrails) this.resetTrails();
    }

    resetState(x_m, y_m, angle_rad, geometry = null) {
        this.x_m = x_m;
        this.y_m = y_m;
        this.angle_rad = angle_rad;
        if (geometry) this.updateGeometry(geometry);

        this.currentApplied_vL_mps = 0;
        this.currentApplied_vR_mps = 0;
        this.motorPWMSpeeds = { left: 0, right: 0 };
        this._initSensorState();
        this.resetTrails();
    }

    resetTrails() {
        this.centerTrail = [];
        this.leftWheelTrail = [];
        this.rightWheelTrail = [];
    }

    // Called by the simulation loop AFTER user code has run and set motorPWMSpeeds
    updateMovement(dt_s, target_vL_mps, target_vR_mps, motorResponseFactor, maxPhysicalSpeed_mps, movementPerturbationFactor) {
        // --- 1. inercia longitudinal y rotacional avanzada ---
        // Basic inertia modified by mass and CoM
        const massFactor = Math.max(0.1, this.robotMass_kg); // Evitamos masas demasiado bajas
        // Un centro de masa alejado (mayor inercia rotacional) afecta cuán lento cambian las velocidades asimétricas

        let actualResponseL = motorResponseFactor / Math.sqrt(massFactor);
        let actualResponseR = motorResponseFactor / Math.sqrt(massFactor);

        // Asimetría (si comOffset_m está desplazado, las ruedas no levantan parejo la fuerza)
        this.currentApplied_vL_mps += (target_vL_mps - this.currentApplied_vL_mps) * actualResponseL;
        this.currentApplied_vR_mps += (target_vR_mps - this.currentApplied_vR_mps) * actualResponseR;

        this.currentApplied_vL_mps = clamp(this.currentApplied_vL_mps, -maxPhysicalSpeed_mps, maxPhysicalSpeed_mps);
        this.currentApplied_vR_mps = clamp(this.currentApplied_vR_mps, -maxPhysicalSpeed_mps, maxPhysicalSpeed_mps);

        let linear_displacement_m = (this.currentApplied_vR_mps + this.currentApplied_vL_mps) / 2.0 * dt_s;
        let d_theta_rad = 0;

        if (this.wheelbase_m > 0.001) {
            // For Y-down screen coordinates, positive (vL - vR) means turning RIGHT (clockwise)
            d_theta_rad = (this.currentApplied_vL_mps - this.currentApplied_vR_mps) / this.wheelbase_m * dt_s;
            // Moderador de inercia rotacional por posición del CG ("péndulo")
            // Un CoM desplazado requiere más energía para rotar.
            let momentOfInertiaMod = 1 + Math.abs(this.comOffset_m) * 10;
            d_theta_rad /= momentOfInertiaMod;
        }

        // --- 2. Perturbaciones Aleatorias ---
        if (movementPerturbationFactor > 0) {
            // El ruido lineal afecta ligeramente el avance
            const perturbLinear = (Math.random() * 2 - 1) * movementPerturbationFactor * 0.1; 
            // El ruido angular se AGREGA en base a qué tanto avanzó el robot (baches en la pista)
            // Se multiplica por la distancia para que no vibre cuando el robot está totalmente detenido
            const perturbAngular = (Math.random() * 2 - 1) * movementPerturbationFactor * 5.0 * Math.abs(linear_displacement_m);

            linear_displacement_m *= (1 + perturbLinear);
            d_theta_rad += perturbAngular; 
        }

        // --- 3. Posicionamiento Teórico ---
        let deltaX_m = linear_displacement_m * Math.cos(this.angle_rad);
        let deltaY_m = linear_displacement_m * Math.sin(this.angle_rad);

        // --- 4. Derrape (Slip Model) ---
        // Velocidad tangencial v y velocidad angular W
        let v_tan = linear_displacement_m / dt_s;
        let omega = d_theta_rad / dt_s;

        if (Math.abs(omega) > 0.1 && Math.abs(v_tan) > 0.1) {
            // F_c = m * v * w (centripetal force required to turn)
            let F_centripetal = Math.abs(massFactor * v_tan * omega);
            // F_f = m * g * mu (max friction force available)
            const g = 9.81;
            let F_friction_max = massFactor * g * this.tireGrip;

            // Si la fuerza centrífuga supera la fricción disponible, ocurre el derrape!
            if (F_centripetal > F_friction_max) {
                let slipForce = F_centripetal - F_friction_max;
                let slipFactor = slipForce / massFactor; // a = F/m

                // El derrape empuja radialmente "hacia afuera" de la curva
                // Direction of centrifugal force is 90 deg off from current heading
                // Orientación: Si w es positivo (gira a la izq), la fuerza empuja a la derecha (-90 deg)
                let centrifugalAngle = this.angle_rad + (omega > 0 ? -Math.PI / 2 : Math.PI / 2);

                let slip_displacement_m = slipFactor * dt_s * 0.1; // Scale factor for realism

                deltaX_m += slip_displacement_m * Math.cos(centrifugalAngle);
                deltaY_m += slip_displacement_m * Math.sin(centrifugalAngle);
            }
        }

        // --- 5. Actualización final ---
        this.x_m += deltaX_m;
        this.y_m += deltaY_m;
        this.angle_rad += d_theta_rad;
        this.angle_rad = Math.atan2(Math.sin(this.angle_rad), Math.cos(this.angle_rad)); // Normalize angle to [-PI, PI]

        this._updateTrails();
    }

    _updateTrails() {
        this.centerTrail.push({ x_m: this.x_m, y_m: this.y_m });
        if (this.centerTrail.length > this.maxTrailLength) this.centerTrail.shift();

        const halfWheelbase_m = this.wheelbase_m / 2;
        const sinAngle = Math.sin(this.angle_rad);
        const cosAngle = Math.cos(this.angle_rad);

        // Left wheel trail (robot's left)
        const x_lw_m = this.x_m + halfWheelbase_m * Math.sin(this.angle_rad); // sin for y offset in robot frame
        const y_lw_m = this.y_m - halfWheelbase_m * Math.cos(this.angle_rad); // -cos for x offset in robot frame
        this.leftWheelTrail.push({ x_m: x_lw_m, y_m: y_lw_m });
        if (this.leftWheelTrail.length > this.maxTrailLength) this.leftWheelTrail.shift();

        // Right wheel trail (robot's right)
        const x_rw_m = this.x_m - halfWheelbase_m * Math.sin(this.angle_rad);
        const y_rw_m = this.y_m + halfWheelbase_m * Math.cos(this.angle_rad);
        this.rightWheelTrail.push({ x_m: x_rw_m, y_m: y_rw_m });
        if (this.rightWheelTrail.length > this.maxTrailLength) this.rightWheelTrail.shift();
    }

    // Gets sensor positions in meters, relative to robot's origin (center of axle line) and orientation
    // Returns an object with keys matching this.sensors
    getSensorPositions_world_m() {
        const count = this.sensorCount || 3;
        const offset = this.sensorForwardProtrusion_m;
        const spread = this.sensorSideSpread_m;
        const cosA = Math.cos(this.angle_rad);
        const sinA = Math.sin(this.angle_rad);
        // Positions along the y axis (robot local frame)
        let positions = {};
        if (count === 2) {
            // left/right only
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.left = {
                x_m: x + ySpread * sinA,
                y_m: y - ySpread * cosA
            };
            positions.right = {
                x_m: x - ySpread * sinA,
                y_m: y + ySpread * cosA
            };
        } else if (count === 3) {
            // left, center, right
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.left = {
                x_m: x + ySpread * sinA,
                y_m: y - ySpread * cosA
            };
            positions.center = { x_m: x, y_m: y };
            positions.right = {
                x_m: x - ySpread * sinA,
                y_m: y + ySpread * cosA
            };
        } else if (count === 4) {
            // farLeft, left, right, farRight
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.farLeft = {
                x_m: x + 1.5 * ySpread * sinA,
                y_m: y - 1.5 * ySpread * cosA
            };
            positions.left = {
                x_m: x + 0.5 * ySpread * sinA,
                y_m: y - 0.5 * ySpread * cosA
            };
            positions.right = {
                x_m: x - 0.5 * ySpread * sinA,
                y_m: y + 0.5 * ySpread * cosA
            };
            positions.farRight = {
                x_m: x - 1.5 * ySpread * sinA,
                y_m: y + 1.5 * ySpread * cosA
            };
        } else if (count === 5) {
            // farLeft, left, center, right, farRight
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.farLeft = {
                x_m: x + 2 * ySpread * sinA,
                y_m: y - 2 * ySpread * cosA
            };
            positions.left = {
                x_m: x + ySpread * sinA,
                y_m: y - ySpread * cosA
            };
            positions.center = { x_m: x, y_m: y };
            positions.right = {
                x_m: x - ySpread * sinA,
                y_m: y + ySpread * cosA
            };
            positions.farRight = {
                x_m: x - 2 * ySpread * sinA,
                y_m: y + 2 * ySpread * cosA
            };
        } else if (count === 6) {
            // fullFarLeft, farLeft, left, right, farRight, fullFarRight
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.fullFarLeft = { x_m: x + 2.5 * ySpread * sinA, y_m: y - 2.5 * ySpread * cosA };
            positions.farLeft = { x_m: x + 1.5 * ySpread * sinA, y_m: y - 1.5 * ySpread * cosA };
            positions.left = { x_m: x + 0.5 * ySpread * sinA, y_m: y - 0.5 * ySpread * cosA };
            positions.right = { x_m: x - 0.5 * ySpread * sinA, y_m: y + 0.5 * ySpread * cosA };
            positions.farRight = { x_m: x - 1.5 * ySpread * sinA, y_m: y + 1.5 * ySpread * cosA };
            positions.fullFarRight = { x_m: x - 2.5 * ySpread * sinA, y_m: y + 2.5 * ySpread * cosA };
        } else if (count === 7) {
            // fullFarLeft, farLeft, left, center, right, farRight, fullFarRight
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.fullFarLeft = { x_m: x + 3 * ySpread * sinA, y_m: y - 3 * ySpread * cosA };
            positions.farLeft = { x_m: x + 2 * ySpread * sinA, y_m: y - 2 * ySpread * cosA };
            positions.left = { x_m: x + ySpread * sinA, y_m: y - ySpread * cosA };
            positions.center = { x_m: x, y_m: y };
            positions.right = { x_m: x - ySpread * sinA, y_m: y + ySpread * cosA };
            positions.farRight = { x_m: x - 2 * ySpread * sinA, y_m: y + 2 * ySpread * cosA };
            positions.fullFarRight = { x_m: x - 3 * ySpread * sinA, y_m: y + 3 * ySpread * cosA };
        } else if (count === 8) {
            // same as 7 but with center split
            const ySpread = spread;
            const x = this.x_m + offset * cosA;
            const y = this.y_m + offset * sinA;
            positions.fullFarLeft = { x_m: x + 3.5 * ySpread * sinA, y_m: y - 3.5 * ySpread * cosA };
            positions.farLeft = { x_m: x + 2.5 * ySpread * sinA, y_m: y - 2.5 * ySpread * cosA };
            positions.left = { x_m: x + 1.5 * ySpread * sinA, y_m: y - 1.5 * ySpread * cosA };
            positions.centerLeft = { x_m: x + 0.5 * ySpread * sinA, y_m: y - 0.5 * ySpread * cosA };
            positions.centerRight = { x_m: x - 0.5 * ySpread * sinA, y_m: y + 0.5 * ySpread * cosA };
            positions.right = { x_m: x - 1.5 * ySpread * sinA, y_m: y + 1.5 * ySpread * cosA };
            positions.farRight = { x_m: x - 2.5 * ySpread * sinA, y_m: y + 2.5 * ySpread * cosA };
            positions.fullFarRight = { x_m: x - 3.5 * ySpread * sinA, y_m: y + 3.5 * ySpread * cosA };
        }

        if (this.horizontalSymmetry) {
            const symPositions = {};
            for (const key in positions) {
                if (positions.hasOwnProperty(key)) {
                    // Reverse the local X offset
                    symPositions[key + '_rear'] = {
                        x_m: positions[key].x_m - 2 * offset * cosA,
                        y_m: positions[key].y_m - 2 * offset * sinA
                    };
                }
            }
            Object.assign(positions, symPositions);
        }

        if (this.customSensors && this.customSensors.length > 0) {
            this.customSensors.forEach((s, idx) => {
                const xLocal_m = s.x_mm / 1000.0;
                const yLocal_m = s.y_mm / 1000.0;
                const wx = this.x_m + xLocal_m * cosA - yLocal_m * sinA;
                const wy = this.y_m + xLocal_m * sinA + yLocal_m * cosA;
                positions[`custom_${idx}`] = { x_m: wx, y_m: wy };
                
                if (s.symmetric) {
                    const xLocal_m_sym = -xLocal_m; // Flip X for vertical/front-back symmetry
                    const wx_sym = this.x_m + xLocal_m_sym * cosA - yLocal_m * sinA;
                    const wy_sym = this.y_m + xLocal_m_sym * sinA + yLocal_m * cosA;
                    positions[`custom_${idx}_sym`] = { x_m: wx_sym, y_m: wy_sym };
                }
            });
        }

        return positions;
    }

    draw(ctx, displaySensorStates = null) {
        ctx.save();
        ctx.translate(this.x_m * PIXELS_PER_METER, this.y_m * PIXELS_PER_METER);
        ctx.rotate(this.angle_rad);

        // Draw Wheels
        let wheelLengthPx = WHEEL_LENGTH_M * PIXELS_PER_METER;
        let wheelWidthPx = WHEEL_WIDTH_M * PIXELS_PER_METER;
        let wheelYOffsetPx = this.wheelbase_m / 2 * PIXELS_PER_METER;
        let wheelColor = 'rgba(80, 80, 80, 0.9)';
        let useImage = false;

        if (this.customWheels) {
            wheelLengthPx = this.customWheels.length_m * PIXELS_PER_METER;
            wheelWidthPx = this.customWheels.width_m * PIXELS_PER_METER;
            wheelColor = this.customWheels.color;
        } else if (this.wheelImage && this.wheelImage.complete && this.wheelImage.naturalWidth > 0) {
            useImage = true;
        }

        if (useImage) {
            // Left wheel
            ctx.drawImage(this.wheelImage, -wheelLengthPx / 2, wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
            // Right wheel
            ctx.drawImage(this.wheelImage, -wheelLengthPx / 2, -wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
        } else {
            ctx.fillStyle = wheelColor;
            ctx.fillRect(-wheelLengthPx / 2, wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
            ctx.fillRect(-wheelLengthPx / 2, -wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
            if (this.customWheels) {
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(-wheelLengthPx / 2, wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
                ctx.strokeRect(-wheelLengthPx / 2, -wheelYOffsetPx - wheelWidthPx / 2, wheelLengthPx, wheelWidthPx);
            }
        }

        // Draw direction indicator
        ctx.fillStyle = 'rgba(173, 216, 230, 0.9)';
        ctx.beginPath();
        const indicatorTipX = wheelLengthPx / 2;
        const indicatorBaseX = wheelLengthPx / 2 - Math.min(10, wheelLengthPx * 0.2);
        const indicatorBaseSpread = wheelWidthPx / 3;
        ctx.moveTo(indicatorTipX, 0);
        ctx.lineTo(indicatorBaseX, -indicatorBaseSpread / 2);
        ctx.lineTo(indicatorBaseX, indicatorBaseSpread / 2);
        ctx.closePath();
        ctx.fill();

        // Draw decorative parts
        if (this.decorativeParts && this.decorativeParts.length > 0) {
            this.decorativeParts.forEach(part => {
                if (part.img && part.img.complete && part.img.naturalWidth > 0) {
                    const x = part.x * PIXELS_PER_METER;
                    const y = part.y * PIXELS_PER_METER;
                    const sizeW = part.img.width;
                    const sizeH = part.img.height;
                    ctx.save();
                    // Always fully opaque
                    ctx.translate(x, y);
                    ctx.rotate(part.rotation || 0); // Apply the part's rotation
                    ctx.drawImage(part.img, -sizeW / 2, -sizeH / 2, sizeW, sizeH);
                    ctx.restore();
                }
            });
        }

        const geom = this.geometry || this;
        const hasScreen = geom.panelScreen;
        const hasBtns = geom.panelButtons && geom.panelButtons.length > 0;
        
        ctx.restore(); // <-- End robot-local transform

        // Draw Control Panel on the bottom-left corner of the screen
        if (hasScreen || hasBtns) {
            ctx.save();
            // Reset to screen coordinates
            ctx.resetTransform();

            const panelWidth = 180;
            const panelHeight = 80;
            const panelX = 16;
            const panelY = ctx.canvas.height - panelHeight - 14;

            // Draw horizontal panel anchored to lower-left corner
            ctx.fillStyle = 'rgba(40, 40, 40, 0.8)';
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1.5;
            ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
            ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

            if (hasScreen) {
                ctx.fillStyle = 'black';
                ctx.fillRect(panelX + 10, panelY + 10, 60, 60);

                ctx.fillStyle = 'cyan';
                ctx.font = '8px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                const panelText = this.oledDisplays?.panel?.text || this.oledDisplays?.__last?.text || '';
                const lines = String(panelText).split('\n').slice(0, 6);
                lines.forEach((line, i) => {
                    ctx.fillText(line.slice(0, 12), panelX + 12, panelY + 12 + i * 9);
                });
            }

            if (hasBtns) {
                const btns = geom.panelButtons;
                const count = btns.length;
                const startX = panelX + 76;
                const endX = panelX + panelWidth - 16;
                const step = (endX - startX) / (count + 1);

                for(let i=0; i<count; i++) {
                    const btn = btns[i];
                    const cx = startX + step * (i + 1);
                    const cy = panelY + panelHeight / 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, (btn.size || 8) / 2, 0, Math.PI * 2);
                    
                    const isPressed = this.sensors[`btn_${i}`] === 1;
                    if (isPressed) {
                        ctx.fillStyle = '#ffffff';
                    } else {
                        ctx.fillStyle = btn.color || '#ff0000';
                    }
                    
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    if (isPressed) {
                        ctx.strokeStyle = '#888';
                        ctx.lineWidth = 2;
                    } else {
                        ctx.lineWidth = 1;
                    }
                    ctx.stroke();

                    // Draw pin number
                    let pinNum = "";
                    if (geom.connections && geom.connections.sensorPins) {
                        pinNum = geom.connections.sensorPins[`pinPanelBtn_${i}`] || "";
                    }
                    if (pinNum) {
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = "black";
                        ctx.shadowBlur = 3;
                        ctx.fillText(pinNum, cx, cy);
                        ctx.shadowBlur = 0; // reset
                    }
                }
            }
            ctx.restore();
        }

        // Draw Trails (world space)
        const drawTrail = (trail, color, lineWidth) => {
            if (trail.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.moveTo(trail[0].x_m * PIXELS_PER_METER, trail[0].y_m * PIXELS_PER_METER);
                for (let i = 1; i < trail.length; i++) {
                    ctx.lineTo(trail[i].x_m * PIXELS_PER_METER, trail[i].y_m * PIXELS_PER_METER);
                }
                ctx.stroke();
            }
        };
        drawTrail(this.centerTrail, 'rgba(0, 0, 255, 0.2)', 3);
        drawTrail(this.leftWheelTrail, 'rgba(255, 0, 0, 0.2)', 2);
        drawTrail(this.rightWheelTrail, 'rgba(0, 255, 0, 0.2)', 2);

        // Draw Sensors (world space, after transform restored)
        if (displaySensorStates) {
            this.drawSensorsForDisplay(ctx, displaySensorStates);
        }
    }

    drawSensorsForDisplay(ctx, sensorReadings) {
        // Called in WORLD-SPACE (outside robot local transform)
        // getSensorPositions_world_m() returns world meter coords -> convert to world pixels
        const sensorPositions_world = this.getSensorPositions_world_m();
        const sensorRadiusPx = Math.max(2, (this.sensorDiameter_m / 2) * PIXELS_PER_METER);

        for (const key in sensorPositions_world) {
            const pos = sensorPositions_world[key];
            const px = pos.x_m * PIXELS_PER_METER;
            const py = pos.y_m * PIXELS_PER_METER;
            const isOnLine = sensorReadings[key];

              let currentDrawRadiusPx = sensorRadiusPx;

              let numP = 1;
              let isIR = true;
              let isToF = false;
              let isLED = false;
              let isRGB = false;
              let isRFID = false;
              let isScreen = false;
              let ledColor = '#ff0000';
              let customIdx = -1;
              let tofIdx = -1;
              let tofAngle = 0;

              if (key.startsWith('custom_')) {
                  // Ignore global diagram for custom IRs (fallback to 10mm visually)
                  currentDrawRadiusPx = Math.max(3, 0.005 * PIXELS_PER_METER);

                  // handle clone naming like 'custom_0_sym'
                  let cleanKey = key;
                  if (key.endsWith('_sym')) cleanKey = key.replace('_sym', '');
                  const idxStr = cleanKey.replace('custom_', '');
                  const idx = parseInt(idxStr);
                  if (this.customSensors && this.customSensors[idx]) {
                      const cSens = this.customSensors[idx];

                      if (cSens.detectionDiameter) {
                          currentDrawRadiusPx = Math.max(2, (parseFloat(cSens.detectionDiameter) / 1000 / 2) * PIXELS_PER_METER);
                      }

                      if (cSens.type === 'ir') {
                          numP = parseInt(cSens.numPins) || 1;
                      } else {
                          isIR = false;
                      }
                      
                      if (cSens.type === 'rgb') {
                          isRGB = true;
                          customIdx = idx;
                      }
                      if (cSens.type === 'rfid') {
                          isRFID = true;
                          customIdx = idx;
                      }

                      if (cSens.type === 'tof') {
                          isToF = true;
                          tofIdx = idx;
                          tofAngle = cSens.angle || 0;

                          // Invert the angle display if this is the symmetric twin, mirroring the math in robotEditor.js
                          if (key.endsWith('_sym')) {
                                tofAngle = 180 - tofAngle;
                          }
                      }
                      if (cSens.type === 'led') {
                          isLED = true;
                          ledColor = cSens.color || '#ff0000';
                      }
                      if (cSens.type === 'screen') {
                          isScreen = true;
                          customIdx = idx;
                      }
                  }
              }

              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(this.angle_rad);

              if (isIR) {
                  const rectWidth = currentDrawRadiusPx * 2;
                  const rectHeight = currentDrawRadiusPx * 2;
                  const totalWidth = numP * rectWidth;
                  const startY = -totalWidth / 2 + rectWidth / 2; // y acts as the horizontal spread along sensory array axis

                  for (let i = 0; i < numP; i++) {
                      ctx.beginPath();
                      // X is forward, Y is lateral in robot local space
                      // So we position them along Y axis
                      ctx.arc(0, startY + i * rectWidth, currentDrawRadiusPx, 0, 2 * Math.PI);
                      ctx.fillStyle = isOnLine ? 'lime' : 'gray';
                      ctx.fill();
                      ctx.strokeStyle = 'black';
                      ctx.lineWidth = 1;
                      ctx.stroke();
                  }
              } else if (isToF) {
                  // ToF specific rendering: Orange circle
                  ctx.beginPath();
                  ctx.arc(0, 0, currentDrawRadiusPx, 0, 2 * Math.PI);
                  ctx.fillStyle = 'orange'; // Requested by user
                  ctx.fill();
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 1;
                  ctx.stroke();

                  // Directional Line for ToF Angle
                  ctx.save();
                  // tofAngle comes in degrees from the UI, so convert to radians. 
                  // In local robot space, an angle of 0 points forward (towards positive X).
                  let rad = (tofAngle * Math.PI) / 180;
                  ctx.rotate(rad);
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  
                  // Extract the measured distance from sensor readings if available
                  let measured_mm = sensorReadings[key + '_distance_mm'];
                  let drawLen = currentDrawRadiusPx * 9; // Fallback default length
                  if (typeof measured_mm === 'number') {
                      drawLen = (measured_mm / 1000) * PIXELS_PER_METER;
                  }
                  
                  ctx.lineTo(drawLen, 0); 
                  ctx.strokeStyle = 'orange';
                  ctx.lineWidth = 2;
                  ctx.stroke();
                  ctx.restore();
              } else if (isLED) {
                  ctx.beginPath();
                  ctx.arc(0, 0, currentDrawRadiusPx, 0, 2 * Math.PI);
                  if (isOnLine) {
                      ctx.fillStyle = ledColor;
                      ctx.shadowBlur = 8;
                      ctx.shadowColor = ledColor;
                  } else {
                      let r = parseInt(ledColor.slice(1,3), 16) || 0;
                      let g = parseInt(ledColor.slice(3,5), 16) || 0;
                      let b = parseInt(ledColor.slice(5,7), 16) || 0;
                      let avg = (r + g + b) / 3;
                      r = Math.floor(r * 0.3 + avg * 0.2);
                      g = Math.floor(g * 0.3 + avg * 0.2);
                      b = Math.floor(b * 0.3 + avg * 0.2);
                      ctx.fillStyle = `rgb(${r},${g},${b})`;
                      ctx.shadowBlur = 0;
                  }
                  ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
              } else if (isRGB || isRFID) {
                  // Dashed circle for detection radius (in currentDrawRadiusPx)
                  ctx.beginPath();
                  ctx.arc(0, 0, currentDrawRadiusPx, 0, 2 * Math.PI);
                  ctx.strokeStyle = isRGB ? 'blue' : 'purple';
                  ctx.setLineDash([4, 4]);
                  ctx.stroke();
                  ctx.setLineDash([]); // reset dash

                  // Rectangle for the sensor body
                  ctx.fillStyle = 'white';
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 1;
                  const rw = 40; // rectangle width
                  const rh = 16;
                  ctx.fillRect(-rw/2, -rh/2, rw, rh);
                  ctx.strokeRect(-rw/2, -rh/2, rw, rh);

                  // Text inside
                  ctx.save();
                  // Cancel the robot rotation purely for text legibility if desired - 
                  // actually, rotating text with sensor block is usually fine.
                  // The prompt asks for rectangle with text inside.
                  ctx.fillStyle = 'black';
                  ctx.font = 'bold 9px Arial';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(`${isRGB ? 'Color' : 'RFID'}${(customIdx + 1)}`, 0, 0);
                  ctx.restore();

              } else if (isScreen) {
                  const sw = 40;
                  const sh = 30;
                  ctx.fillStyle = 'black';
                  ctx.strokeStyle = '#cccccc';
                  ctx.lineWidth = 2;
                  ctx.fillRect(-sw/2, -sh/2, sw, sh);
                  ctx.strokeRect(-sw/2, -sh/2, sw, sh);

                  ctx.save();
                  ctx.fillStyle = '#7CFFFD';
                  ctx.font = '6px monospace';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'top';
                  const oledEntry = this.oledDisplays?.[key] || this.oledDisplays?.__last || null;
                  const lines = String(oledEntry?.text || '').split('\n').slice(0, 4);
                  lines.forEach((line, i) => {
                      ctx.fillText(line.slice(0, 10), -sw / 2 + 3, -sh / 2 + 3 + i * 7);
                  });
                  ctx.restore();

              } else {
                  ctx.beginPath();
                  ctx.arc(0, 0, currentDrawRadiusPx, 0, 2 * Math.PI);
                  ctx.fillStyle = isOnLine ? 'lime' : 'gray';
                  ctx.fill();
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 1;
                  ctx.stroke();
              }
              ctx.restore();
            let pinNumber = '';
            const conns = this.connections?.sensorPins;
            if (conns) {
                if (key.endsWith('_rear')) {
                    pinNumber = conns[key] || '';
                }
                if (key === 'left') pinNumber = conns.left || '';
                else if (key === 'center') pinNumber = conns.center || '';
                else if (key === 'right') pinNumber = conns.right || '';
                else if (key === 'farLeft') pinNumber = conns.farLeft || '';
                else if (key === 'farRight') pinNumber = conns.farRight || '';
                else if (key === 'fullFarLeft') pinNumber = conns.fullFarLeft || '';
                else if (key === 'fullFarRight') pinNumber = conns.fullFarRight || '';
                else if (key === 'centerLeft') pinNumber = conns.centerLeft || '';
                else if (key === 'centerRight') pinNumber = conns.centerRight || '';
                else if (key.startsWith('custom_')) pinNumber = conns[key] || '';
            } else {
                if (this.sensorCount === 2) {
                    if (key === 'left') pinNumber = '2';
                    else if (key === 'right') pinNumber = '3';
                } else if (this.sensorCount === 3) {
                    if (key === 'left') pinNumber = '2';
                    else if (key === 'center') pinNumber = '3';
                    else if (key === 'right') pinNumber = '4';
                } else if (this.sensorCount === 4) {
                    if (key === 'farLeft') pinNumber = '2';
                    else if (key === 'left') pinNumber = '3';
                    else if (key === 'right') pinNumber = '4';
                    else if (key === 'farRight') pinNumber = '5';
                } else if (this.sensorCount === 5) {
                    if (key === 'farLeft') pinNumber = '2';
                    else if (key === 'left') pinNumber = '3';
                    else if (key === 'center') pinNumber = '4';
                    else if (key === 'right') pinNumber = '5';
                    else if (key === 'farRight') pinNumber = '6';
                } else if (this.sensorCount === 6) {
                    if (key === 'fullFarLeft') pinNumber = '2';
                    else if (key === 'farLeft') pinNumber = '3';
                    else if (key === 'left') pinNumber = '4';
                    else if (key === 'right') pinNumber = '5';
                    else if (key === 'farRight') pinNumber = '6';
                    else if (key === 'fullFarRight') pinNumber = '7';
                } else if (this.sensorCount === 7) {
                    if (key === 'fullFarLeft') pinNumber = '2';
                    else if (key === 'farLeft') pinNumber = '3';
                    else if (key === 'left') pinNumber = '4';
                    else if (key === 'center') pinNumber = '5';
                    else if (key === 'right') pinNumber = '6';
                    else if (key === 'farRight') pinNumber = '7';
                    else if (key === 'fullFarRight') pinNumber = '8';
                } else if (this.sensorCount === 8) {
                    if (key === 'fullFarLeft') pinNumber = '2';
                    else if (key === 'farLeft') pinNumber = '3';
                    else if (key === 'left') pinNumber = '4';
                    else if (key === 'centerLeft') pinNumber = '5';
                    else if (key === 'centerRight') pinNumber = '6';
                    else if (key === 'right') pinNumber = '7';
                    else if (key === 'farRight') pinNumber = '8';
                    else if (key === 'fullFarRight') pinNumber = '9';
                }
            }

            if (pinNumber) {
                ctx.save();
                ctx.fillStyle = 'black';
                let fontSize = Math.max(8, currentDrawRadiusPx * 0.9);
                let label = pinNumber;

                // Adjust font size and text if this is a ToF
                if (isToF) {
                    fontSize = Math.max(6, currentDrawRadiusPx * 0.6); // Smaller to fit word 'TOF'
                    // Ensure the generic idx gets shown exactly as TOF <idx+1>
                    // Only printing label if there's no custom text override
                    label = "TOF " + (tofIdx + 1); 
                }

                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, px, py);
                ctx.restore();
            }
        }
    }
}