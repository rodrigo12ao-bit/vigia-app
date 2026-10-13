const fs=require('node:fs'),crypto=require('node:crypto'),dotenv=require('dotenv');
const key=dotenv.parse(fs.readFileSync('.env','utf8')).GEMINI_API_KEY;
if(!key)throw Error('A chave anterior não está configurada.');
(async()=>{
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(20000)});
 const b=await r.json();
 if(!r.ok){console.log(JSON.stringify({status:r.status,code:b.error?.status,message:String(b.error?.message||'').split(key).join('[redacted]')}));process.exitCode=1;return;}
 const models=b.models.map(m=>({name:m.name,methods:m.supportedGenerationMethods}));
 fs.mkdirSync('.tools/gemini',{recursive:true});
 fs.writeFileSync('.tools/gemini/free-tier.json',JSON.stringify({projectId:'gen-lang-client-0221489651',tier:'free',verifiedAt:new Date().toISOString(),keyHash:crypto.createHash('sha256').update(key).digest('hex'),source:'Google AI Studio: chave existente correspondente ao projeto, Nível gratuito; verificado por interface, sem alterar faturamento.'},null,2));
 fs.writeFileSync('artifacts/gemini-available-models.json',JSON.stringify(models,null,2));
 console.log(JSON.stringify({keyValid:true,status:r.status,models:models.filter(m=>/flash-lite|tts|live|transcribe/.test(m.name))}));
})().catch(()=>{console.error('Não foi possível consultar a chave sem geração.');process.exitCode=1;});
