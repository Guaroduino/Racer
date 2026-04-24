// Esquemas de código
const codeTemplates = {
        simpleOnOff: `#include <NewPing.h>

// ====================================================================
// 1. CONFIGURACION DE PINES MOTORES (L298N simple sin PWM Enable)
// ====================================================================
// Motor Izquierdo
const int IN1 = 5;
const int IN2 = 6;
// Motor Derecho
const int IN3 = 7;
const int IN4 = 8;

// ====================================================================
// 2. CONFIGURACION ULTRASONIDOS (HC-SR04)
// ====================================================================
#define MAX_DIST 400

// HC-SR04 Frontal
const int TRG_F = 9;
const int ECH_F = 10;
NewPing us_Frontal(TRG_F, ECH_F, MAX_DIST);

// HC-SR04 Derecho
const int TRG_D = 11;
const int ECH_D = 12;
NewPing us_Derecho(TRG_D, ECH_D, MAX_DIST);

// HC-SR04 Izquierdo
const int TRG_I = 3;
const int ECH_I = 4;
NewPing us_Izquierdo(TRG_I, ECH_I, MAX_DIST);

// ====================================================================
// 3. VARIABLES DE NAVEGACION (Pared Derecha)
// ====================================================================
int velBase = 150;      
int distParedEsperada = 20; // cm a la pared derecha
int distFreno = 25;         // cm para esquivar pared frontal
float Kp = 10.0;            // Ganancia Proporcional

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);

  Serial.begin(9600);
  delay(500);
}

void loop() {
  // LECTURA DE SENSORES EN CM
  int d_frt = us_Frontal.ping_cm();
  int d_der = us_Derecho.ping_cm();
  int d_izq = us_Izquierdo.ping_cm();

  // NewPing devuelve 0 si no hay eco (obstaculo demasiado lejos).
  // Lo forzamos a una distancia grande.
  if (d_frt == 0) d_frt = MAX_DIST;
  if (d_der == 0) d_der = MAX_DIST;
  if (d_izq == 0) d_izq = MAX_DIST;

  // LOGICA SENSORIAL
  // A. Pared al Frente: Prioridad 1
  if (d_frt < distFreno) {
     // Girar bruscamente a la izquierda sobre su propio eje
     aplicarMotores(-150, 150);
  }
  else {
     // B. Seguidor de pared derecha activado
     if (d_der < 100) { 
        int error = distParedEsperada - d_der; 
        int correccion = error * Kp;
        
        // Si error > 0 (muy cerca) correccion es +, frena motor derecho
        int vI = velBase + correccion;
        int vD = velBase - correccion;
        
        aplicarMotores(vI, vD);
     }
     else {
        // C. No hay pared derecha -> Curvar hacia la pared
        aplicarMotores(180, 80); 
     }
  }

  Serial.print("F:"); Serial.print(d_frt);
  Serial.print(" | D:"); Serial.println(d_der);

  delay(30); 
}

// Control de L298N simulando PWM en pines IN
void aplicarMotores(int vL, int vR) {
  vL = constrain(vL, -255, 255);
  vR = constrain(vR, -255, 255);

  if (vL >= 0) {
    analogWrite(IN1, vL);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    analogWrite(IN2, abs(vL));
  }

  if (vR >= 0) {
    analogWrite(IN3, vR);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    analogWrite(IN4, abs(vR));
  }
}\`
};;

// Textos explicativos para cada plantilla
const codeExplanations = {
    simpleOnOff: `🌟 <b>Nuevo Proyecto</b>\n\nEste es un lienzo en blanco para tu código de Arduino. \n\n<b>Pasos recomendados:</b>\n1. Configura tus pines en <code>setup()</code> usando <code>pinMode()</code>.\n2. Escribe tu lógica de control en <code>loop()</code>.\n3. Consulta la <b>Guía del Editor</b> de abajo para ver los pines según tu robot.`
};

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' } });

let editor = null;

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: codeTemplates.simpleOnOff, // Start with the single default template
        language: 'cpp', // Use C++ for basic syntax highlighting and native brace matching
        theme: 'vs',
        minimap: {
            enabled: false
        },
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: 'line',
        selectOnLineNumbers: true,
        contextmenu: true,
        quickSuggestions: true,
        wordWrap: 'on'
    });

    // Make the editor instance available globally
    window.monacoEditor = editor;

    window.monacoEditor = editor;
});

// --- Descargar y cargar código desde archivo ---
document.getElementById('downloadCodeButton').addEventListener('click', function () {
    let code = '';
    if (window.monacoEditor && typeof window.monacoEditor.getValue === 'function') {
        code = window.monacoEditor.getValue();
    } else if (window.editor && typeof window.editor.getValue === 'function') {
        code = window.editor.getValue();
    }
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codigo_robot.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});

document.getElementById('uploadCodeInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        // Cambia el dropdown a 'custom' antes de cargar el código
        const templateSelect = document.getElementById('codeTemplate');
        if (templateSelect) templateSelect.value = 'custom';
        // Si hay un evento de cambio, disparemoslo para que el editor se actualice si es necesario
        if (templateSelect) {
            const event = new Event('change', { bubbles: true });
            templateSelect.dispatchEvent(event);
        }
        // Espera un pequeño tiempo para asegurar que el editor esté en modo custom
        setTimeout(function () {
            if (window.editor && typeof window.editor.setValue === 'function') {
                window.editor.setValue(evt.target.result);
            } else if (typeof editor !== 'undefined' && typeof editor.setValue === 'function') {
                editor.setValue(evt.target.result);
            }
        }, 100);
    };
    reader.readAsText(file);
});

async function loadExampleCode(options = {}) {
    const { silent = false } = options;
    try {
        const response = await fetch('assets/robots/Codigo_Ejemplo.txt');
        if (!response.ok) throw new Error('No se pudo cargar Codigo_Ejemplo.txt');
        const text = await response.text();

        const targetEditor = window.monacoEditor || editor || window.editor;
        if (targetEditor && typeof targetEditor.setValue === 'function') {
            targetEditor.setValue(text);
            return true;
        }

        throw new Error('Editor Monaco no disponible para cargar ejemplo.');
    } catch (err) {
        console.error(err);
        if (!silent) {
            alert('Error al cargar el código de ejemplo.');
        }
        return false;
    }
}

window.loadExampleCode = loadExampleCode;

// --- Cargar código de ejemplo ---
document.getElementById('loadExampleCodeButton').addEventListener('click', async function () {
    await loadExampleCode({ silent: false });
});

// Handle window resize
window.addEventListener('resize', function () {
    if (editor) {
        editor.layout();
    }
});