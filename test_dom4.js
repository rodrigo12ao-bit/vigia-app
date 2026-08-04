import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // click "Modo Visitante"
  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Modo Visitante')) {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Jogos')) {
      await tab.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('JOGAR AGORA')) {
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 2000));
  
  const rects = await page.evaluate(() => {
    const main = document.querySelector('main');
    const escapeGame = document.querySelector('main > div');
    const container = escapeGame ? escapeGame.querySelector('div.bg-slate-900') : null;
    return {
      main: main ? main.getBoundingClientRect() : null,
      escapeGame: escapeGame ? escapeGame.getBoundingClientRect() : null,
      container: container ? container.getBoundingClientRect() : null,
    };
  });
  console.log("RECTS:", JSON.stringify(rects, null, 2));
  
  await browser.close();
})();
