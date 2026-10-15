const fs=require('node:fs'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
try{
 const {verifyRelease,releaseSummary}=require('./publication-assets.cjs');
 console.log(releaseSummary(verifyRelease()));
}catch{
 console.error('Pacote de publicação inválido ou desatualizado. Refaça o build antes de iniciar.');
 process.exit(1);
}
const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
try{
 if(!credentialPath)throw Error('Configure GOOGLE_APPLICATION_CREDENTIALS com o arquivo privado do Firebase no servidor.');
 const account=JSON.parse(fs.readFileSync(credentialPath,'utf8'));
 if(account.type!=='service_account'||account.project_id!==process.env.FIREBASE_PROJECT_ID||!account.client_email)throw Error('A credencial precisa pertencer ao projeto Firebase configurado.');
 crypto.createPrivateKey(account.private_key);
 if(!process.env.FIREBASE_DATABASE_ID)throw Error('Informe FIREBASE_DATABASE_ID para usar o banco existente.');
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.ALLOW_LOCAL_DEMO==='true')throw Error('Retire as configurações de emuladores da publicação.');
}catch(e){const safe=e instanceof Error&&/^(Configure GOOGLE_|A credencial precisa|Informe FIREBASE_|Retire as configurações)/.test(e.message);console.error(safe?e.message:'A credencial do Firebase está inválida. Confira o arquivo privado no servidor.');process.exit(1);}
const real=process.env.VIGIA_MODE==='adult-live';
if(real&&(!process.env.GEMINI_API_KEY||process.env.AI_AUDIENCE!=='18plus'||process.env.AI_PROVIDER!=='gemini'||process.env.GEMINI_FREE_KEY_SHA256!==crypto.createHash('sha256').update(process.env.GEMINI_API_KEY).digest('hex'))){console.error('A publicação real exige público 18+ e a mesma chave Gemini do projeto gratuito verificado.');process.exit(1);}
const env={...process.env,NODE_ENV:'production',VIGIA_MODE:real?'adult-live':'preview',VIGIA_PUBLICATION_BUILD:'true',ENABLE_CLOUD_FIREBASE:'true',ENABLE_REAL_AI:real?'true':'false',AI_COST_AUTHORIZED:'false'};
const child=spawn(process.execPath,[...(process.allowedNodeEnvironmentFlags.has('--use-system-ca')?['--use-system-ca']:[]),'dist/publication/server/server.cjs'],{env,stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill('SIGINT'));
