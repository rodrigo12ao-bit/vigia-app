const {spawn}=require('node:child_process');
const fs=require('node:fs');
const dotenv=require('dotenv');
// Existing .env is read without modifying or exposing it. No credentials enter Vite.
const saved=fs.existsSync('.env')?dotenv.parse(fs.readFileSync('.env')):{};
const local=fs.existsSync('.env.ai-local')?dotenv.parse(fs.readFileSync('.env.ai-local')):{};
const port=process.env.PORT||'3001';
const env={...saved,...local,...process.env,NODE_ENV:'production',VIGIA_MODE:'local-real',VIGIA_PRESENTATION_BUILD:'true',ENABLE_REAL_AI:'true',ENABLE_CLOUD_FIREBASE:'false',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_PROJECT_ID:'demo-vigia',FIREBASE_DATABASE_ID:'(default)',HOST:'127.0.0.1',PORT:port,ALLOWED_ORIGINS:`http://localhost:${port},http://127.0.0.1:${port}`,AI_PROVIDER:'openai',AI_TEST_SCOPE:'adult-synthetic',AI_TEST_UIDS:local.AI_TEST_UIDS||'demo-professor,demo-responsavel'};
if(process.env.RENDER==='true')throw Error('A apresentação real não pode ser iniciada em produção sem revisão e autorização.');
const child=spawn(process.execPath,[...(process.allowedNodeEnvironmentFlags.has('--use-system-ca')?['--use-system-ca']:[]),'dist/presentation/server/server.cjs'],{env,stdio:'inherit'});
child.on('exit',code=>process.exitCode=code||0);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
