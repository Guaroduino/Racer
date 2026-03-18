const fs = require('fs');
const src = fs.readFileSync('js/codeEditor.js','utf8');
const sig = 'function traducirArduinoAJS(codigoArduino)';
const s = src.indexOf(sig);
const r = src.indexOf('return transpiled;', s);
const e = src.indexOf('\n}', r);
const fn = src.slice(s, e + 2);
eval(fn);

const input = `String leerUIDComoTexto() {
  String uidTxt = "";
  return uidTxt;
}

void dibujarOLED(int a, int b, String uid, bool tarjeta) {
}

void setup() {}
void loop() {
  String uid = leerUIDComoTexto();
  dibujarOLED(1,2,uid,true);
}`;

const out = traducirArduinoAJS(input);
console.log(out);
try { new Function(out); console.log('OK: compilable JS'); }
catch(e){ console.log('COMPILE ERROR:', e.message); }
