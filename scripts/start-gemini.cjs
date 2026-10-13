const fs=require('node:fs'),{spawn}=require('node:child_process'),dotenv=require('dotenv');
const saved=fs.existsSync('.env')?dotenv.parse(fs.readFileSync('.env','utf8')):{};
const proof=JSON.parse(fs.readFileSync('.tools/gemini/free-tier.json','utf8'));
if(proof.tier!=='free'||process.env.RENDER==='true')throw Error('Esta inicialização usa somente o projeto gratuito verificado e os emuladores locais.');
const port=process.env.PORT||'3001';
const env={...saved,...process.env,NODE_ENV:'production',VIGIA_MODE:'local-real',VIGIA_PRESENTATION_BUILD:'true',ENABLE_REAL_AI:'true',ENABLE_CLOUD_FIREBASE:'false',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_PROJECT_ID:'demo-vigia',FIREBASE_DATABASE_ID:'(default)',HOST:'127.0.0.1',PORT:port,ALLOWED_ORIGINS:`http://localhost:${port},http://127.0.0.1:${port}`,AI_PROVIDER:'gemini',AI_AUDIENCE:'18plus',AI_COST_AUTHORIZED:'false',GEMINI_FREE_KEY_SHA256:proof.keyHash};
delete env.OPENAI_API_KEY;delete env.GOOGLE_APPLICATION_CREDENTIALS;
const child=spawn(process.execPath,['--use-system-ca','dist/presentation/server/server.cjs'],{env,windowsHide:true,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code||0);for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>child.kill(s));
