const fs = require('fs');
let code = fs.readFileSync('js/robotEditor.js', 'utf8');

code = code.replace(
    /if \\(sensor\\.type === 'tof'\\) \\{\\s*let dispAngle = sensor\\.angle \\|\\| 0;\\s*if \\(isClone\\) dispAngle = -dispAngle;/,
    \if (sensor.type === 'tof') {
                    let dispAngle = sensor.angle || 0;
                    if (isClone) {
                        dispAngle = 180 - dispAngle;
                        if (dispAngle > 180) dispAngle -= 360;
                    }\
);

code = code.replace(
    /value="\\$\\{sensor\\.i2cAddress \\|\\| '0x29'\\}" placeholder="I2C" style="width: 50px; font-size: 0\\.8em;" title="([^"]+)" \\$\\{isClone \\? 'disabled' : ''\\}>/g,
    \alue="\\\" placeholder="I2C" style="width: 50px; font-size: 0.8em;" title="\">\
);

code = code.replace(
    /if \\(cA\\) cA\\.value = -\\(currentGeometry\\.customSensors\\[idx\\]\\.angle \\|\\| 0\\);/g,
    \if (cA) {
                               let a = 180 - (currentGeometry.customSensors[idx].angle || 0);
                               if (a > 180) a -= 360;
                               cA.value = a;
                           }\
);

code = code.replace(
    /if \\(inI2C\\) \\{\\s*const cI = cloneItem\\.querySelector\\(\#customSensorI2C_\\$\\{idx\\}_sym\\\);\\s*if \\(cI\\) cI\\.value = currentGeometry\\.customSensors\\[idx\\]\\.i2cAddress \\|\\| '0x29';\\s*\\}/g,
    \// Independently handled I2C\
);

code = code.replace(
    /if \\(inDiam\\) inDiam\\.addEventListener\\('input', updateVal\\);/g,
    \if (inDiam) inDiam.addEventListener('input', updateVal);
            if (cloneItem) {
                const cI = cloneItem.querySelector(\\\#customSensorI2C_\\\_sym\\\);
                if (cI) {
                    cI.addEventListener('input', () => {
                        currentGeometry.customSensors[idx].i2cAddressSym = cI.value;
                        window.forceGeometrySync();
                    });
                }
            }\
);

fs.writeFileSync('js/robotEditor.js', code);
console.log('Fixed robotEditor.js');
