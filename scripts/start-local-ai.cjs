const {spawn}=require('node:child_process'),fs=require('node:fs');
const {startModel}=require('./local-model.cjs');
let model,server;
function stop(){server?.kill();model?.close();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
(async()=>{
 if(process.env.RENDER==='true')throw Error('Esta versão gratuita não pode ser iniciada no servidor publicado.');
 if(!fs.existsSync('dist/presentation/server/server.cjs'))throw Error('Prepare a versão local com npm run build:presentation.');
 for(const url of ['http://127.0.0.1:9099/','http://127.0.0.1:8080/'])try{await fetch(url,{signal:AbortSignal.timeout(2500)});}catch{throw Error('Inicie os emuladores em outro terminal: npm run emulators. Depois prepare as contas fictícias: npm run demo:seed.');}
 console.log('Iniciando IA gratuita no computador. Nenhuma API paga será usada.');
 model=await startModel();
 const port=process.env.PORT||'3001';
 const env={...process.env,NODE_ENV:'production',VIGIA_MODE:'local-real',VIGIA_PRESENTATION_BUILD:'true',ENABLE_REAL_AI:'true',ENABLE_CLOUD_FIREBASE:'false',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_PROJECT_ID:'demo-vigia',FIREBASE_DATABASE_ID:'(default)',HOST:'127.0.0.1',PORT:port,ALLOWED_ORIGINS:`http://localhost:${port},http://127.0.0.1:${port}`,AI_PROVIDER:'local',AI_TEST_SCOPE:'local-synthetic',AI_COST_AUTHORIZED:'false',LOCAL_AI_TOKEN:model.key};
 delete env.OPENAI_API_KEY;delete env.GEMINI_API_KEY;delete env.GOOGLE_APPLICATION_CREDENTIALS;
 server=spawn(process.execPath,['dist/presentation/server/server.cjs'],{env,windowsHide:true,stdio:'inherit'});
 server.on('error',e=>{stop();console.error(e.message);process.exitCode=1;});
 server.on('exit',code=>{model.close();process.exitCode=code||0;});
 model.child.on('exit',()=>server?.kill());
})().catch(e=>{stop();console.error(e.message);process.exitCode=1;});
