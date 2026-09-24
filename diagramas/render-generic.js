const path = require('path');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

const inputName = process.argv[2];
const outputName = process.argv[3] || inputName.replace(/\.html$/, '.png');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const fileUrl = 'file://' + path.join(process.cwd(), inputName);
  await page.goto(fileUrl);
  const el = await page.$('.wrap');
  await el.screenshot({ path: path.join(process.cwd(), outputName) });
  await browser.close();
  console.log('done:', outputName);
})();
