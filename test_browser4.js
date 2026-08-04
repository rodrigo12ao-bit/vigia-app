import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // click "Jogos" tab
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Jogos')) {
      await tab.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div.bg-slate-900'));
    const escapeCard = cards.find(c => c.textContent.includes('ESCAPE!'));
    if (escapeCard) {
      const btn = Array.from(escapeCard.querySelectorAll('button')).find(b => b.textContent.includes('JOGAR'));
      if (btn) btn.click();
    }
  });

  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({ path: 'screenshot2.png' });
  console.log("Screenshot2 saved.");

  await browser.close();
})();
