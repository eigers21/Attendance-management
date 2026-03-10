const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8123/v5/index.html', { waitUntil: 'networkidle0' });
  await page.click('#tab-fee');
  await new Promise(r => setTimeout(r, 2000));
  const result = await page.evaluate(() => {
     const vf = document.getElementById('view-fee');
     if(!vf) return 'Not found';
     const style = window.getComputedStyle(vf);
     const rect = vf.getBoundingClientRect();
     return 'display: ' + style.display + ', height: ' + rect.height + ', HTML: ' + vf.outerHTML.substring(0, 500);
  });
  console.log('RESULT:', result);
  await browser.close();
})();
