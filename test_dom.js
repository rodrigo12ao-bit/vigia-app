import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // Click "Modo Visitante"
  const visitorBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Modo Visitante'));
  });
  if (visitorBtn) {
    await visitorBtn.click();
    console.log("Clicked visitor mode");
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // click "Jogos" tab
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Jogos')) {
      await tab.click();
      console.log("Clicked jogos tab");
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

  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.content();
  fs.writeFileSync('dom.html', html);
  console.log("DOM saved to dom.html");
  await page.screenshot({ path: 'screenshot3.png' });

  await browser.close();
})();
