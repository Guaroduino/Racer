const fs = require('fs');
let code = fs.readFileSync('js/codeEditor.js', 'utf8');
code = code.replace(
    /ArduinoSerial\.println\(`Advertencia: Pin \$\{pin\} es un SENSOR en el editor, pero lo declaraste como OUTPUT\..*?\);/s,
    'ArduinoSerial.println(`Advertencia: Pin ${pin} es un SENSOR en el editor, pero lo declaraste como OUTPUT. (Debug: pNum=${pin} sensorPins=${JSON.stringify(sensorPins)} ledPins=${JSON.stringify(ledPins)} custSensors=${JSON.stringify(sharedSimulationState.robot.customSensors)} conns=${JSON.stringify(conns.sensorPins)})`);'
);
fs.writeFileSync('js/codeEditor.js', code);
