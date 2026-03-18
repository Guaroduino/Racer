function traducirArduinoAJS(codigoArduino) {
    // Escapar \r para uniformidad
    codigoArduino = codigoArduino.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return codigoArduino
        // 1. Elimina las librerías (#include <...>)
        .replace(/#include\s*[<"].*?[>"]/g, '')
        // 2. Elimina/ignora Serial.begin(baudios);
        .replace(/\bSerial\s*\.\s*begin\s*\([^)]*\)\s*;/g, '')
        // 3. Convierte Serial.print(ln) a console.log
        .replace(/\bSerial\s*\.\s*println?\b/g, 'console.log')
        // 4. Transforma funciones: elimina tipos de retorno y tipos de argumentos
        .replace(/\b(void|int|float|double|long|bool|unsigned\s+long|String|char)\s+(\w+)\s*\(([^)]*)\)/g, (match, tipo, nombre, args) => {
            let argsLimpios = args.replace(/\b(?:const\s+)?(?:unsigned\s+long|int|float|double|long|bool|String|char)\s+[\*\&]*\s*(\w+)/g, '$1');
            if (nombre === 'setup') return `function setup(${argsLimpios})`;
            if (nombre === 'loop') return `async function loop(${argsLimpios})`;
            return `function ${nombre}(${argsLimpios})`;
        })
        // 5. Constantes: C++ "const int" -> JS "const"
        .replace(/\bconst\s+(?:unsigned\s+long|int|float|double|long|bool|String|char)\b/g, 'const')
        // 6. Variables: C++ "int", "float" -> JS "let"
        .replace(/\b(?:unsigned\s+long|int|float|double|long|bool|String|char)\b/g, 'let')
        // 7. Gestión de Tiempo: "delay(X)" -> "await delay(X)"
        .replace(/\bdelay\s*\(/g, 'await delay(')
        // 8. Prevención de cuelgues: obliga delay(10) al final del loop
        .replace(/(async\s+function\s+loop\s*\([^)]*\)\s*\{)([\s\S]*?)(\s*\})(?=\s*$|\s*function\b)/g,
            '$1$2\n    await delay(10);\n$3');
}

const inputCode = `// Definición de pines según la guía
int sensorIzquierdo = 2;
int sensorDerecho = 4;
int motorIzquierdo = 9;
int motorDerecho = 10;

// Velocidad de los motores (0 a 255)
int velocidad = 120; 

void setup() {
  // Configuración de pines
  pinMode(sensorIzquierdo, INPUT);
  pinMode(sensorDerecho, INPUT);
  pinMode(motorIzquierdo, OUTPUT);
  pinMode(motorDerecho, OUTPUT);
}

void loop() {
  int lecturaIzq = digitalRead(sensorIzquierdo);
  if (lecturaIzq == 0) {
    delay(50);
  } else {
    delay(100);
  }
}`;

console.log("----------");
console.log(traducirArduinoAJS(inputCode));
console.log("----------");
