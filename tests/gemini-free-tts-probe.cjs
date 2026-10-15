// Only fictional adult text; use the already verified free project. No billing changes.
const fs=require('node:fs'),{geminiEnv}=require('../scripts/gemini-env.cjs');
const env=geminiEnv(),text='Guarde a lanterna na mochila. Confira também as pilhas.';
(async()=>{
 const results=[];
 for(const model of ['gemini-3.8-flash-tts','gemini-3.1-flash-tts-preview','gemini-2.5-flash-preview-tts']){
  const start=performance.now(),result={model};
  try{
   const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[model.startsWith('gemini-3.8')?{text,speechMetadata:{style:'Português brasileiro, natural e acolhedor.'}}:{text:'Leia literalmente em português brasileiro, com naturalidade: '+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Aoede'}}},maxOutputTokens:1000}}),signal:AbortSignal.timeout(15000)});
   result.httpStatus=response.status;const body=await response.json();
   result.finishReason=body.candidates?.[0]?.finishReason;
   result.audioBytes=body.candidates?.[0]?.content?.parts?.reduce((n,p)=>n+(p.inlineData?Buffer.from(p.inlineData.data||'','base64').length:0),0)||0;
   result.code=body.error?.status;
   // Limit diagnostics to quota types/limits, never provider messages/project IDs.
   result.quota=body.error?.details?.flatMap(d=>d.violations||[]).map(v=>({metric:v.quotaMetric,id:v.quotaId,limit:v.quotaValue}));
  }catch(e){result.error=e.name;result.code=e.cause?.code;}
  result.durationMs=Math.round(performance.now()-start);results.push(result);console.log(JSON.stringify(result));
 }
 fs.writeFileSync('artifacts/gemini-free-tts-probe.json',JSON.stringify({scope:'Modelos TTS com modalidade gratuita documentada, mesmo projeto gratuito, fala fictícia adulta.',results},null,2));
})();
