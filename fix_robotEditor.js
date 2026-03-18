const fs = require('fs');
let code = fs.readFileSync('js/robotEditor.js', 'utf8');

// 1. ToF specific HTML block for clones
code = code.replace(
    /if \\(sensor\\.type === 'tof'\\) \\{\\s*let dispAngle = sensor\\.angle \\|\\| 0;\\s*if \\(isClone\\) dispAngle = -dispAngle;/,
    \if (sensor.type === 'tof') {
                      let dispAngle = sensor.angle || 0;
                      if (isClone) {
                          dispAngle = 180 - dispAngle;
                          if (dispAngle > 180) dispAngle -= 360;
                      }\
);

// 2. Extra HTML for ToF
code = code.replace(
    /<input type="text"\\s*id="customSensorI2C_\\$\\{idx\\}\\$\\{isClone \\? '_sym' : ''\\}"\\s*value="\\$\\{sensor\\.i2cAddress \\|\\| '0x29'\\}"\\s*placeholder="I2C"\\s*style="width: 50px; font-size: 0\\.8em;"\\s*title="DirecciÃ³n I2C"\\s*\\$\\{isClone \\? 'disabled' : ''\\}>/g,
    \<input type="text" id="customSensorI2C_\\" value="\" placeholder="I2C" style="width: 50px; font-size: 0.8em;" title="Dirección I2C">\
);

code = code.replace(
    /title="Direcci\\xc3\\xb3n I2C"\\s*\\$\\{isClone \\? 'disabled' : ''\\}>/g,
    \	itle="Direcci\u00f3n I2C">\
);

// 3. Update value for angle in updateVal
code = code.replace(
    /if \\(cA\\) cA\\.value = -\\(currentGeometry\\.customSensors\\[idx\\]\\.angle \\|\\| 0\\);/g,
    \if (cA) {
                                   let a = 180 - (currentGeometry.customSensors[idx].angle || 0);
                                   if (a > 180) a -= 360;
                                   cA.value = a;
                               }\
);

// 4. Do not override I2C clone value from main value
code = code.replace(
    /if \\(inI2C\\) \\{\\s*const cI = cloneItem\\.querySelector\\(\#customSensorI2C_\\$\\{idx\\}_sym\\\);\\s*if \\(cI\\) cI\\.value = currentGeometry\\.customSensors\\[idx\\]\\.i2cAddress \\|\\| '0x29';\\s*\\}/g,
    \// Independently handled I2C\
);

// 5. Add event listener for cloned I2C input
code = code.replace(
    /if \\(inDiam\\) inDiam\\.addEventListener\\('input', updateVal\\);/g,
    \if (inDiam) inDiam.addEventListener('input', updateVal);
              if (cloneItem) {
                  const cI = cloneItem.querySelector(\\\#customSensorI2C_\_sym\\\);
                  if (cI) {
                      cI.addEventListener('input', () => {
                          currentGeometry.customSensors[idx].i2cAddressSym = cI.value;
                          window.forceGeometrySync();
                      });
                  }
              }\
);

fs.writeFileSync('js/robotEditor.js', code);
console.log("Updated robotEditor.js");
