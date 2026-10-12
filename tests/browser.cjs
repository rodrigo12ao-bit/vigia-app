const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const result={checks:[],errors:[],externalRequests:[],screenshots:[],failedRequests:[]};
let activePage;
async function main(){
  const puppeteer=(await import('puppeteer')).default;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'vigia-test-'));
  let browser;
  try{
    browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,userDataDir:profile,args:['--no-sandbox','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--enable-unsafe-swiftshader','--use-angle=swiftshader'],timeout:60000,protocolTimeout:60000});
    const check=async(name,fn)=>{try{await fn();result.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(e){if(activePage){fs.writeFileSync('artifacts/browser-failure-dom.txt',await activePage.$eval('body',e=>e.innerText));await activePage.screenshot({path:'artifacts/browser-failure.png',fullPage:true});}
result.checks.push({name,status:'failed',error:e.message});console.log('FAIL '+name+': '+e.message);throw e;}};
    for(const mode of ['desktop','mobile']){
      const context=await browser.createBrowserContext(),page=await context.newPage();activePage=page;page.on('response',async r=>{if(r.status()>=400&&r.url().includes('9099')){const data=await r.json().catch(()=>({}));result.failedRequests.push({url:r.url(),status:r.status(),error:data.error});}});
      await page.setViewport(mode==='desktop'?{width:1280,height:900}:{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});
      page.on('dialog',d=>d.accept());page.on('pageerror',e=>result.errors.push({mode,message:e.message}));
      page.on('request',r=>{if(/^https?:/.test(r.url())&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(r.url()))result.externalRequests.push(r.url());});
      await page.evaluateOnNewDocument(()=>{localStorage.setItem('dc_is_guest','true');localStorage.setItem('vigia_ai_consent:guest','2026-10-12');});
      await page.goto('http://localhost:3000',{waitUntil:'domcontentloaded'});
      await check(mode+': entrada de visitante e simulações identificadas',async()=>{await page.waitForFunction(()=>document.body.innerText.includes('Olá,'),{timeout:30000});await page.click('[title="Conversa & Voz"]');await page.waitForSelector('textarea',{timeout:30000});await page.waitForFunction(()=>document.body.innerText.includes('DEMONSTRAÇÃO LOCAL'));assert.match(await page.$eval('body',e=>e.innerText),/DEMONSTRAÇÃO LOCAL/);});
      await check(mode+': sem 3D no carregamento inicial',async()=>{const requests=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));assert.ok(!requests.some(r=>/vendor-three|graphics-|avatar_[12]\.glb/.test(r)));});
      await check(mode+': chat e clique repetido não duplicam pergunta',async()=>{
        await page.type('textarea','Quero preparar uma mochila fictícia');
        await page.evaluate(()=>{const form=document.querySelector('textarea').closest('form');form.requestSubmit();form.requestSubmit();});
        await page.waitForFunction(()=>document.body.innerText.includes('SIMULAÇÃO EDUCATIVA'),{timeout:20000});
        await wait(800);const list=await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1')||'[]'));assert.equal(list[0].messages.filter(m=>m.role==='user').length,1);
      });
      await check(mode+': abrir histórico preserva conteúdo e datas',async()=>{
        const before=await page.evaluate(()=>localStorage.getItem('vigia_guest_chat_sessions_v1'));
        await page.click('[title="Iniciar uma nova conversa"]');await wait(300);
        await page.click('[title="Abrir histórico de conversas"]');await wait(400);
        await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(e=>e.textContent.startsWith('Quero preparar uma mochila')&&e.getClientRects().length&&e.getBoundingClientRect().right>0));
        const handle=await page.evaluateHandle(()=>Array.from(document.querySelectorAll('button')).find(e=>e.textContent.startsWith('Quero preparar uma mochila')&&e.getClientRects().length&&e.getBoundingClientRect().right>0));
        const el=handle.asElement();assert.ok(el);await el.click();await wait(1000);
        assert.equal(await page.evaluate(()=>localStorage.getItem('vigia_guest_chat_sessions_v1')),before);
        assert.match(await page.$eval('body',e=>e.innerText),/SIMULAÇÃO EDUCATIVA/);
      });
      await check(mode+': emergência textual',async()=>{await page.type('textarea','a água tá subindo muito rápido');await page.evaluate(()=>document.querySelector('textarea').closest('form').requestSubmit());await page.waitForFunction(()=>document.body.innerText.includes('[ALERTA DE SEGURANÇA]'));});
      await check(mode+': falha de rede é informada',async()=>{await page.setOfflineMode(true);await page.type('textarea','Pergunta fictícia sem rede');await page.evaluate(()=>document.querySelector('textarea').closest('form').requestSubmit());await wait(1000);assert.match(await page.$eval('body',e=>e.innerText),/conexão|conexao|rede|Rede|contratempo|indisponível/);await page.setOfflineMode(false);});
      await check(mode+': imagem sintética é preparada e enviada',async()=>{
        const file=path.join(profile,'synthetic.png');const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#2563eb';ctx.fillRect(0,0,64,64);return canvas.toDataURL('image/png').split(',')[1];});fs.writeFileSync(file,Buffer.from(png,'base64'));
        const input=await page.$('input[type="file"]');assert.ok(input);await input.uploadFile(file);await page.waitForFunction(()=>document.querySelector('img[src^="data:image/jpeg"]'),{timeout:10000});await page.type('textarea','Imagem sintética de teste');await page.evaluate(()=>document.querySelector('textarea').closest('form').requestSubmit());await page.waitForFunction(()=>JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1')||'[]').some(s=>s.messages.some(m=>m.imageUrl?.startsWith('data:image/jpeg'))),{timeout:15000});const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_guest_chat_sessions_v1')||'[]'));assert.ok(sessions.some(s=>s.messages.some(m=>m.imageUrl?.startsWith('data:image/jpeg'))));fs.unlinkSync(file);
      });
      await check(mode+': microfone negado não mantém recursos ativos',async()=>{
        await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Permissão negada','NotAllowedError'));});
        const offlineToast=await page.$('[aria-label="Fechar aviso offline"]');if(offlineToast)await offlineToast.click();
        await page.$eval('[title="Falar pelo microfone"]',b=>b.click());await wait(200);const allow=await page.evaluateHandle(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Permitir'));const el=allow.asElement();if(el)await page.evaluate(e=>e.click(),el);await wait(800);
        assert.match(await page.$eval('body',e=>e.innerText),/negad|áudio|microfone/i);
        const resources=await page.evaluate(()=>window.VigiaTelemetry.resources);assert.ok(Object.values(resources).every(r=>r.activeNow===0));
      });
      await page.screenshot({path:`artifacts/${mode}-chat.png`,fullPage:true});result.screenshots.push(`${mode}-chat.png`);
      const openExtras=async()=>{await page.click('[title="Início"]');await page.click('[title="Aprender com a Vigia"]');await page.waitForSelector('[title="Gerador de Desafios IA"]');};
      await check(mode+': quiz simulado premia uma vez em clique repetido',async()=>{
        await openExtras();await page.click('[title="Gerador de Desafios IA"]');await page.waitForSelector('[role="dialog"][aria-label="Quiz educativo"]');
        await page.evaluate(()=>Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('Gerar Nova Pergunta')).click());
        await page.waitForFunction(()=>document.body.innerText.includes('SIMULAÇÃO: quem ajuda'));
        const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_progress:guest')).starsScore);
        await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.trim()==='Um adulto');b.click();b.click();});await wait(700);
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_progress:guest')).starsScore),before+10);
        await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
      });
      await check(mode+': análise indisponível não apresenta classificação ou pontuação',async()=>{
        await page.setRequestInterception(true);const fail=r=>{if(r.url().endsWith('/api/analyze-scenario'))r.continue({headers:{...r.headers(),'x-demo-failure':'true'}});else r.continue();};page.on('request',fail);
        await openExtras();await page.click('[title="Simulador e Diagnóstico Inteligente IA"]');await page.waitForSelector('[role="dialog"] textarea');await page.type('[role="dialog"] textarea','Preparar mochila fictícia');
        await page.evaluate(()=>Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('Analisar e Gerar')).click());
        await page.waitForFunction(()=>document.body.innerText.includes('Simulação de indisponibilidade'));
        const text=await page.$eval('[role="dialog"]',e=>e.innerText);assert.ok(!/Pontuação de Risco|Risco fictício|Nível de Atenção Calculado/.test(text));
        await page.keyboard.press('Escape');page.off('request',fail);await page.setRequestInterception(false);
      });
      await check(mode+': cenário simulado é identificado e emergência não recebe score',async()=>{
        await page.click('[title="Simulador e Diagnóstico Inteligente IA"]');await page.waitForSelector('[role="dialog"] textarea');
        await page.evaluate(()=>{const t=document.querySelector('[role="dialog"] textarea');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(t,'Preparar mochila fictícia');t.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.evaluate(()=>Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('Analisar e Gerar')).click());await page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('risco fictício'));
        await page.keyboard.press('Escape');await page.click('[title="Simulador e Diagnóstico Inteligente IA"]');await page.waitForSelector('[role="dialog"] textarea');await page.click('[role="dialog"] textarea',{clickCount:3});await page.keyboard.press('Backspace');await page.type('[role="dialog"] textarea','a água tá subindo muito rápido');
        await page.evaluate(()=>Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('Analisar e Gerar')).click());await page.waitForFunction(()=>document.querySelector('[role="dialog"]').innerText.includes('[ALERTA DE SEGURANÇA]'));
        assert.ok(!(await page.$eval('[role="dialog"]',e=>e.innerText)).includes('Pontuação de Risco'));await page.keyboard.press('Escape');
      });
      await check(mode+': layout sem rolagem horizontal',async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));});
      await check(mode+': login, logout e troca de conta não revelam conversa anterior',async()=>{
        const login=async uid=>{const guest=await page.$('[title="Perfil (Modo Visitante)"]');if(guest){await guest.click();await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Trocar Conta')).click());await page.waitForSelector('[aria-label="Boas-vindas à Vigia"]');await page.evaluate(()=>Array.from(document.querySelectorAll('[aria-label="Boas-vindas à Vigia"] button')).find(b=>b.textContent.includes('Entrar ou criar conta')).click());}else await page.click('[title="Entrar ou Criar Conta"]');await page.waitForSelector('input[aria-label="E-mail"]');await wait(200);await page.type('input[aria-label="E-mail"]',uid+'@example.invalid');await page.type('input[aria-label="Senha"]','DemoLocal!123');const actualEmail=await page.$eval('input[aria-label="E-mail"]',e=>e.value);console.log('Login fictício: '+actualEmail);assert.equal(actualEmail,uid+'@example.invalid');await page.evaluate(()=>document.querySelector('input[aria-label="E-mail"]').closest('form').requestSubmit());await page.waitForSelector('[title="Meu Perfil"]',{timeout:45000});await page.click('[title="Conversa & Voz"]');await page.waitForSelector('textarea');};
        await login('demo-ana');await page.evaluate(()=>{localStorage.setItem('vigia_daily_date:demo-ana',new Date().toISOString().slice(0,10));localStorage.setItem('vigia_daily_streak:demo-ana','3');});await page.type('textarea','Segredo fictício da Aurora');await page.evaluate(()=>document.querySelector('textarea').closest('form').requestSubmit());await page.waitForFunction(()=>document.body.innerText.includes('SIMULAÇÃO EDUCATIVA'));await wait(1000);
        await page.click('[title="Meu Perfil"]');const logout=await page.evaluateHandle(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Sair da Conta')));await logout.asElement().click();await wait(500);
        await page.evaluate(()=>localStorage.setItem('dc_is_guest','true'));await page.reload({waitUntil:'domcontentloaded'});await login('demo-bruno');await openExtras();await page.click('[title="Missão Diária (Ganhe Estrelas)"]');await page.waitForSelector('[aria-label="Missão diária"]');assert.ok(!(await page.$eval('[aria-label="Missão diária"]',e=>e.innerText)).includes('Missão Concluída Hoje'));await page.keyboard.press('Escape');await page.click('[title="Conversa & Voz"]');await page.waitForSelector('textarea');assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Segredo fictício da Aurora'));
        await page.click('[title="Abrir histórico de conversas"]');await wait(500);assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Segredo fictício da Aurora'));await page.click('[title="Abrir histórico de conversas"]');
        await page.click('[title="Emergência"]');await page.waitForSelector('[title="Sala Segura"]');await page.click('[title="Sala Segura"]');await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Aurora')),{timeout:30000});
        const contact=await page.evaluateHandle(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Aurora')));assert.ok(contact.asElement());await contact.asElement().click();await page.waitForFunction(()=>document.body.innerText.includes('Mensagem fictícia do teste'),{timeout:15000});
        await page.type('[placeholder="Digite uma mensagem segura..."]','Olá na Sala Segura (sintético)');await page.evaluate(()=>document.querySelector('[placeholder="Digite uma mensagem segura..."]').closest('form').requestSubmit());await page.waitForFunction(()=>document.body.innerText.includes('Olá na Sala Segura (sintético)'));
        assert.ok(!(await page.$eval('body',e=>e.innerText)).includes('Não foi possível carregar o perfil'));
      });
      await check(mode+': trilhas anteriores preservadas e Escape fora da navegação principal',async()=>{
        await openExtras();await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.title==='Continuar trilhas anteriores').click());
        await page.waitForFunction(()=>!document.body.innerText.includes('Carregando seu progresso')&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Fase 1')));
        await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Fase 1')).click());await page.waitForFunction(()=>document.body.innerText.includes('Descobertos'));
        const hotspots=['Criança Andando na Água de Alagamento','Lixo Entupindo o Bueiro da Rua','Fio Elétrico Desencapado na Poça','Carro Tentando Atravessar a Enxurrada','Família em Local Seguro com um Adulto','Adulto Ligando 199 para Defesa Civil'];for(const t of hotspots){await page.evaluate(t=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(t)).click(),t);await wait(80);}
        await page.waitForFunction(()=>document.body.innerText.includes('Concluir Fase e Ganhar Estrelas'));await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Concluir Fase e Ganhar')).click());await wait(900);
        const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('vigia_journey:demo-bruno')));assert.equal(snapshot.levelProgress.m2_l1.completed,true);
        await page.click('[title="Início"]');await page.click('[title="Aprender com a Vigia"]');await page.waitForFunction(()=>document.body.innerText.includes('Reconheça os perigos'));assert.equal(await page.$('[aria-label="Escape em desenvolvimento"]'),null);
        await page.screenshot({path:'artifacts/'+mode+'-learning-regression.png',fullPage:true});result.screenshots.push(mode+'-learning-regression.png');
      });
      await context.close();
    }
    assert.deepEqual(result.errors,[],'JavaScript errors');
  } finally {
    await browser?.close();
    if(profile.startsWith(path.join(os.tmpdir(),'vigia-test-')))fs.rmSync(profile,{recursive:true,force:true});
    fs.writeFileSync('artifacts/browser-tests.json',JSON.stringify(result,null,2));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
