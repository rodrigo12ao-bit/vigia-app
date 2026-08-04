import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  page.on('error', err => console.log('BROWSER ERROR EVENT:', err.toString()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // click "Modo Visitante"
  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Modo Visitante')) {
      await btn.click();
      console.log('Clicked visitor');
      break;
    }
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Jogos')) {
      await tab.click();
      console.log('Clicked Jogos');
      break;
    }
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('JOGAR AGORA')) {
      await btn.click();
      console.log('Clicked JOGAR AGORA');
      break;
    }
  }

  await new Promise(r => setTimeout(r, 4000));
  
  const html = await page.content();
  fs.writeFileSync('dom2.html', html);
  console.log("DOM saved to dom2.html");
  await page.screenshot({ path: 'screenshot4.png' });

  await browser.close();
})();
