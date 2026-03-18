const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.tab-button[data-tab="robot-editor"]', { timeout: 20000 });
  await page.click('.tab-button[data-tab="robot-editor"]');

  await page.waitForSelector('#loadExampleRobotButton', { timeout: 20000 });
  await page.click('#loadExampleRobotButton');
  await new Promise(r => setTimeout(r, 2500));

  const data = await page.evaluate(() => ({
    board: document.getElementById('arduinoBoardSelect')?.value,
    left: document.getElementById('pinSensorLeft')?.value,
    center: document.getElementById('pinSensorCenter')?.value,
    right: document.getElementById('pinSensorRight')?.value,
    has22: !!Array.from(document.getElementById('pinSensorLeft')?.options || []).find(o => o.value === '22'),
    has23: !!Array.from(document.getElementById('pinSensorCenter')?.options || []).find(o => o.value === '23'),
    has24: !!Array.from(document.getElementById('pinSensorRight')?.options || []).find(o => o.value === '24')
  }));

  console.log('PIN_CHECK=' + JSON.stringify(data));
  await browser.close();
})();
