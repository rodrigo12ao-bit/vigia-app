import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // Click visitor mode
  const btns = await page.$$('button');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Modo Visitante')) {
      await btn.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  // Click "Jogos" tab
  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Jogos')) {
      await tab.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  // Click "JOGAR AGORA"
  const allBtns = await page.$$('button');
  for (const btn of allBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('JOGAR AGORA')) {
      await btn.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'final_escape_25d.png' });
  console.log("Final screenshot saved!");

  await browser.close();
})();
