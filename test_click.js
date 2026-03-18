const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Escuchar por console logs y alertas
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('dialog', async dialog => {
            console.log('BROWSER DIALOG:', dialog.message());
            await dialog.accept();
        });

        await page.goto('http://localhost:3000/');
        console.log("Página cargada");

        // Click a simulation tab if needed (assuming defaults are handled)
        const simTabBtn = await page.$('.tab-button[data-tab="simulation"]');
        if (simTabBtn) {
            await simTabBtn.click();
            console.log("Tab de simulación clickeado");
        }

        // Wait a bit
        await new Promise(r => setTimeout(r, 1000));

        // Let's see if the button exists
        const demoBtn = await page.$('#simDemoBtn');
        console.log("Button demoBtn exists:", !!demoBtn);

        if (demoBtn) {
            await demoBtn.click();
            console.log("Button clicked!");
        }

        await new Promise(r => setTimeout(r, 2000));

        await browser.close();
    } catch (e) {
        console.error("Script error:", e);
    }
})();
