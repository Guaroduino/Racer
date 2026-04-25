// js/monaco-setup.js

// Esquemas de código simplificados (Solo 2 opciones)
const codeTemplates = {
    paredDerecha: `#include <NewPing.h>

// ==========================================
// PARAMETROS AJUSTABLES (Configuración)
// ==========================================
int velCrucero = 100;      
int velReducida = 40;      
int tiempoGiroCiego = 150; // Aumentamos un poco para esquivar esquinas
int umbralFreno = 10;      
int distanciaIdeal = 15;   // <--- NUEVO: La distancia que quieres mantener de la pared
// ==========================================

// Configuración de pines (según Robot Ejemplo.json)
const int IN1 = 5; const int IN2 = 6; 
const int IN3 = 9; const int IN4 = 10; 

#define MAX_DIST 100 
NewPing sensorF(2, 4, MAX_DIST);  
NewPing sensorD(7, 8, MAX_DIST);  
NewPing sensorI(12, 13, MAX_DIST); 

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  // 1. LEO SENSORES
  int distF = sensorF.ping_cm();
  int distD = sensorD.ping_cm();
  int distI = sensorI.ping_cm(); 

  if (distF == 0) distF = MAX_DIST;
  if (distD == 0) distD = MAX_DIST;
  if (distI == 0) distI = MAX_DIST;

  // 2. LÓGICA DE MOVIMIENTO

  // --- CASO A: EMERGENCIA (Pared frontal) ---
  if (distF < umbralFreno) {
    moverMotores(0, velCrucero); 
    delay(tiempoGiroCiego);
  }
  // --- CASO B: SEGUIDOR DE PARED DERECHA ---
  else {
    int diferencia = distD - distanciaIdeal;

    if (diferencia == 0) {
      moverMotores(velCrucero, velCrucero);
    } 
    else if (diferencia < 0) {
      moverMotores(velReducida, velCrucero); 
    } 
    else if (diferencia > 0) {
      moverMotores(velCrucero, velReducida);
    }
  }
}

void moverMotores(int vI, int vD) {
  analogWrite(5, vI);
  digitalWrite(6, LOW);
  analogWrite(9, vD);
  digitalWrite(10, LOW);
}
`,
    pasillos: `#include <NewPing.h>

// ==========================================
// PARAMETROS AJUSTABLES (Configuración)
// ==========================================
int velCrucero = 100;      // Velocidad cuando va recto o el motor rápido en giros
int velReducida = 40;      // Velocidad del motor que frena para corregir el pasillo
int tiempoGiroCiego = 100; // Milisegundos que dura el giro de emergencia
int umbralFreno = 10;      // Distancia (cm) para detectar pared al frente
// ==========================================

// Configuración de pines
const int IN1 = 5; const int IN2 = 6;
const int IN3 = 9; const int IN4 = 10;

#define MAX_DIST 100
NewPing sensorF(2, 4, MAX_DIST);  
NewPing sensorD(7, 8, MAX_DIST);  
NewPing sensorI(12, 13, MAX_DIST);

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  // 1. LEO SENSORES
  int distF = sensorF.ping_cm();
  int distD = sensorD.ping_cm();
  int distI = sensorI.ping_cm();

  // Corrección de lectura 0
  if (distF == 0) distF = MAX_DIST;
  if (distD == 0) distD = MAX_DIST;
  if (distI == 0) distI = MAX_DIST;

  // 2. LÓGICA DE MOVIMIENTO

  // --- CASO A: EMERGENCIA (Pared frontal) ---
  if (distF < umbralFreno) {
    if (distI > distD) {
      moverMotores(0, velCrucero);
      delay(tiempoGiroCiego);
    } else {
      moverMotores(velCrucero, 0);
      delay(tiempoGiroCiego);
    }
  }
  // --- CASO B: SEGUIDOR DE PASILLO (Diferencia) ---
  else {
    int diferencia = distI - distD;

    if (diferencia == 0) {
      moverMotores(velCrucero, velCrucero);
    }
    else if (diferencia < 0) {
      moverMotores(velCrucero, velReducida);
    }
    else if (diferencia > 0) {
      moverMotores(velReducida, velCrucero);
    }
  }
}

void moverMotores(int vI, int vD) {
  analogWrite(5, vI);
  digitalWrite(6, LOW);
  analogWrite(9, vD);
  digitalWrite(10, LOW);
}
`
};

const codeExplanations = {
    paredDerecha: `🌟 <b>Seguidor de Pared Derecha</b>\n\nMantiene una distancia fija (15cm) respecto a la pared derecha usando un sensor ultrasónico lateral.`,
    pasillos: `🌟 <b>Seguidor de Pasillos</b>\n\nMantiene el robot en el centro del pasillo comparando las distancias de los sensores izquierdo y derecho.`
};

let editor;

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: codeTemplates.paredDerecha,
        language: 'cpp',
        theme: 'vs',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        tabSize: 2,
        renderLineHighlight: 'all',
        contextmenu: true,
        quickSuggestions: true,
        wordWrap: 'on'
    });

    window.monacoEditor = editor;

    // Inicializar tip por defecto
    setTimeout(() => {
        showExampleTip('paredDerecha');
    }, 1200);
});

export function showExampleTip(templateKey) {
    const explanation = codeExplanations[templateKey];
    if (!explanation) return;

    const tipContainer = document.getElementById('exampleTipContainer');
    if (tipContainer) {
        tipContainer.innerHTML = `
            <div class="example-tip" style="margin-bottom: 1.5em; padding: 1em; background-color: #f0f9ff; border: 1px solid #bae6fd; border-left: 5px solid #0ea5e9; border-radius: 8px; color: #0369a1;">
                ${explanation.replace(/\n/g, '<br>')}
            </div>
        `;
        
        const explanationPanel = document.querySelector('.code-explanation');
        if (explanationPanel) explanationPanel.scrollTop = 0;
    }
}

window.showExampleTip = showExampleTip;

// --- Configuración de Eventos al cargar el DOM ---
document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('downloadCodeButton');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const text = window.monacoEditor ? window.monacoEditor.getValue() : '';
            const blob = new Blob([text], { type: 'text/plain' });
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

    const uploadInp = document.getElementById('uploadCodeInput');
    if (uploadInp) {
        uploadInp.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (window.monacoEditor) window.monacoEditor.setValue(evt.target.result);
            };
            reader.readAsText(file);
        });
    }

    const loadExampleBtn = document.getElementById('loadExampleCodeButton');
    const exampleSel = document.getElementById('codeExampleSelect');

    if (loadExampleBtn && exampleSel) {
        loadExampleBtn.addEventListener('click', () => {
            const val = exampleSel.value;
            const code = codeTemplates[val];
            if (code && window.monacoEditor) {
                window.monacoEditor.setValue(code);
                showExampleTip(val);
            }
        });
    }
});

// Helper para main.js
export async function loadExampleCode(options = {}) {
    const targetEditor = window.monacoEditor || editor;
    if (targetEditor) {
        targetEditor.setValue(codeTemplates.paredDerecha);
        showExampleTip('paredDerecha');
        return true;
    }
    return false;
}

window.loadExampleCode = loadExampleCode;

window.addEventListener('resize', () => {
    if (editor) editor.layout();
});