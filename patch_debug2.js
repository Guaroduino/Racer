const fs = require('fs');
let code = fs.readFileSync('js/codeEditor.js', 'utf8');
code = code.replace(
    /ArduinoSerial\.println\(`Advertencia: analogWrite\(\$\{pin\}\) - El pin \$\{pin\} no es.*?\);/s,
    'ArduinoSerial.println(`Advertencia: analogWrite(${pin}) - El pin ${pin} no está conectado a ningún motor ni LED en el Editor de Robot. (Debug: pNum=${pin} custSensors=${JSON.stringify(sharedSimulationState.robot.customSensors)} isLED=${isLED})`);'
);
fs.writeFileSync('js/codeEditor.js', code);
