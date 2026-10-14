// One fictional sentence in the existing verified free project. No retry or paid fallback.
const fs=require('node:fs'),crypto=require('node:crypto'),{geminiEnv}=require('../scripts/gemini-env.cjs');
(async()=>{
 const env=geminiEnv(),report={scope:'Uma frase fictícia no TTS gratuito, sem repetição. Somente limites e espera do provedor são registrados.'};
 if(env.GEMINI_FREE_KEY_SHA256!==crypto.createHash('sha256').update(env.GEMINI_API_KEY).digest('hex'))throw Error('Projeto gratuito não verificado.');
 try{
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gemini-3.8-flash-lite-tts',store:false,input:[{type:'user_input',content:[{type:'text',text:'Confira as pilhas da lanterna.'}]}],generation_config:{speech_config:[{voice:'Aoede'}]},response_format:{type:'audio'},stream:true}),signal:AbortSignal.timeout(20000)});
  report.httpStatus=r.status;report.retryAfter=r.headers.get('retry-after');
  if(r.ok){await r.body?.cancel();report.status='available';}
  else{
   const b=await r.json().catch(()=>({}));report.status='unavailable';report.providerStatus=b.error?.status;
   report.retryDelays=(b.error?.details||[]).filter(d=>d['@type']==='type.googleapis.com/google.rpc.RetryInfo').map(d=>d.retryDelay);
   report.limits=(b.error?.details||[]).filter(d=>d['@type']==='type.googleapis.com/google.rpc.QuotaFailure').flatMap(d=>(d.violations||[]).map(v=>({metric:v.quotaMetric,id:v.quotaId,value:v.quotaValue,model:v.quotaDimensions?.model})));
  }
 }catch(e){report.status='unavailable';report.error='Não foi possível concluir o diagnóstico de cota.';}
 finally{fs.writeFileSync('artifacts/gemini-quota-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
