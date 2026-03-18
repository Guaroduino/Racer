const fs = require('fs');
let file = fs.readFileSync('js/simulation.js', 'utf8');

let target = \        // Calculate sensor radius in pixels using robot's parameter
        const sensorRadiusPx = Math.max(1, (this.robot.sensorDiameter_m / 2) * PIXELS_PER_METER);

        // For each sensor, compute state
        for (const key in sensorPositions_m) {
            const pos = sensorPositions_m[key];
            const px = pos.x_m * PIXELS_PER_METER;
            const py = pos.y_m * PIXELS_PER_METER;
            let onLine = this.track.isAreaOnLine(px, py, sensorRadiusPx);\;

let repl = \        // Calculate sensor radius in pixels using robot's parameter
        const globalSensorRadiusPx = Math.max(1, (this.robot.sensorDiameter_m / 2) * PIXELS_PER_METER);

        // For each sensor, compute state
        for (const key in sensorPositions_m) {
            const pos = sensorPositions_m[key];
            const px = pos.x_m * PIXELS_PER_METER;
            const py = pos.y_m * PIXELS_PER_METER;
            
            let physicsRadiusPx = globalSensorRadiusPx;
            if (key.startsWith('custom_')) {
                // custom IRs shouldn't scale with global sensor diameter (we use a rough 10mm diam fallback)
                physicsRadiusPx = Math.max(2, 0.005 * PIXELS_PER_METER);
                let cleanKey = key;
                if (key.endsWith('_sym')) cleanKey = key.replace('_sym', '');
                const idxStr = cleanKey.replace('custom_', '');
                const idx = parseInt(idxStr);
                if (this.robot.customSensors && this.robot.customSensors[idx]) {
                    const cSens = this.robot.customSensors[idx];
                    if (cSens.detectionDiameter) {
                        physicsRadiusPx = Math.max(1, (parseFloat(cSens.detectionDiameter) / 1000 / 2) * PIXELS_PER_METER);
                    }
                }
            }

            let onLine = this.track.isAreaOnLine(px, py, physicsRadiusPx);\;

file = file.replace(target, repl);
fs.writeFileSync('js/simulation.js', file);
