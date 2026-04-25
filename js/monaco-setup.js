// Esquemas de código
const codeTemplates = {
        simpleOnOff: `#include <NewPing.h>

const int IN1 = 5; const int IN2 = 6; 
const int IN3 = 9; const int IN4 = 10; 

#define MAX_DIST 100 // Aumentamos un poco para "ver" la curva desde antes
NewPing us_Frontal(2, 4, MAX_DIST);
NewPing us_Derecho(7, 8, MAX_DIST);
NewPing us_Izquierdo(12, 13, MAX_DIST);

// --- CONFIGURACIÓN CONTROL ---
int velMax = 180;       // Velocidad en rectas largas
int velMinPasillo = 80; // Velocidad mínima en curvas
float Kp = 3.5; 
float Kd = 12.0; 
int errorAnterior = 0;

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int d_frt = us_Frontal.ping_cm();    
  int d_der = us_Derecho.ping_cm();    
  int d_izq = us_Izquierdo.ping_cm();    
  
  if (d_frt <= 0) d_frt = MAX_DIST;
  if (d_der <= 0) d_der = MAX_DIST;
  if (d_izq <= 0) d_izq = MAX_DIST;

  // --- 1. GESTIÓN DE VELOCIDAD ADAPTATIVA ---
  // Calculamos una velocidad base proporcional a la distancia frontal
  // A más distancia frontal, más velocidad.
  int velAdaptativa = map(d_frt, 15, MAX_DIST, velMinPasillo, velMax);
  velAdaptativa = constrain(velAdaptativa, velMinPasillo, velMax);

  // --- 2. CONTROL PD DE PASILLO (Siempre activo) ---
  int errorActual = d_izq - d_der; 
  float derivativa = (errorActual - errorAnterior);
  int correccion = (errorActual * Kp) + (derivativa * Kd);
  
  // La velocidad base ya no es fija, es velAdaptativa
  int vI = velAdaptativa - correccion;
  int vD = velAdaptativa + correccion;
  
  aplicarMotores(vI, vD);
  errorAnterior = errorActual;

  // Debug para ver cómo cambia la velocidad
  Serial.print("Dist Frontal: "); Serial.print(d_frt);
  Serial.print(" | Vel Base: "); Serial.println(velAdaptativa);
}

void aplicarMotores(int vL, int vR) {
  // Evitamos inversión de motores para mantener tracción constante
  vL = constrain(vL, 0, 255);
  vR = constrain(vR, 0, 255);
  analogWrite(IN1, vL); digitalWrite(IN2, LOW);
  analogWrite(IN3, vR); digitalWrite(IN4, LOW);
}
`};

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
});

// --- Descargar y cargar código desde archivo ---
const downloadCodeButton = document.getElementById('downloadCodeButton');
if (downloadCodeButton) {
    downloadCodeButton.addEventListener('click', function () {
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
}

const uploadCodeInput = document.getElementById('uploadCodeInput');
if (uploadCodeInput) {
    uploadCodeInput.addEventListener('change', function (e) {
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
}

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
const loadExampleCodeButton = document.getElementById('loadExampleCodeButton');
if (loadExampleCodeButton) {
    loadExampleCodeButton.addEventListener('click', async function () {
        await loadExampleCode({ silent: false });
    });
}

// Handle window resize
window.addEventListener('resize', function () {
    if (editor) {
        editor.layout();
    }
});