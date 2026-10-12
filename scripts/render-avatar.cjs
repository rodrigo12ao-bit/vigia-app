const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function main(){
  const puppeteer=(await import('puppeteer')).default;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'vigia-avatar-'));
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,userDataDir:profile,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-background-networking'],timeout:60000});
  try{
    for(const gender of ['female','male']){
      const context=await browser.createBrowserContext(),page=await context.newPage();
      page.on('pageerror',e=>console.log('PAGEERROR '+e.message));page.on('console',m=>{if(m.type()==='error')console.log('ERROR '+m.text());});await page.setViewport({width:900,height:900});await page.evaluateOnNewDocument(gender=>{localStorage.setItem('dc_is_guest','true');localStorage.setItem('vigia_progress:guest',JSON.stringify({avatarGender:gender}));},gender);
      await page.goto('http://localhost:3000',{waitUntil:'networkidle2'});await page.waitForSelector('[aria-label="Ativar avatar 3D"]');
      await page.evaluate(()=>{const button=document.querySelector('[aria-label="Ativar avatar 3D"]');const stage=button.parentElement;button.click();document.body.appendChild(stage);Object.assign(stage.style,{position:'fixed',width:'512px',height:'512px',top:'100px',left:'100px',right:'auto',bottom:'auto',zIndex:'9000',background:'#020617'});});
      await page.waitForSelector('canvas',{timeout:30000});await page.waitForFunction(gender=>performance.getEntriesByType('resource').some(r=>r.name.includes(gender==='male'?'avatar_2.glb':'avatar_1.glb')),{},gender);
      await new Promise(r=>setTimeout(r,4000));
      const box=await (await page.$('canvas')).boundingBox();await page.screenshot({path:'public/model/avatar-preview-'+gender+'.png',clip:{x:box.x+140,y:box.y+230,width:232,height:128},omitBackground:true});
      console.log('Preview rendered: '+gender);await context.close();
    }
  }finally{await browser.close();if(profile.startsWith(path.join(os.tmpdir(),'vigia-avatar-')))fs.rmSync(profile,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
