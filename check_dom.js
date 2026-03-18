import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { 
    url: "http://localhost",
    runScripts: "dangerously", 
    resources: "usable" 
});

dom.window.onerror = function(msg, file, line, col, error) {
    console.error("DOM ERROR:", msg, file, line, col, error);
};

dom.window.onunhandledrejection = function(event) {
    console.error("Unhandled Rejection:", event.reason);
};

setTimeout(() => {
    console.log("Done checking.");
    process.exit(0);
}, 2000);
