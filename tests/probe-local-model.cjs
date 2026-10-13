const {startModel}=require('../scripts/local-model.cjs');
const fs=require('node:fs');
(async()=>{const model=await startModel();try{
 const results=[];
 for(const text of ['O que é uma enchente? Responda em português em duas frases.','O que vai em uma mochila de emergência? Responda em português em duas frases.']){
 const t=Date.now(),r=await fetch('http://127.0.0.1:3210/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+model.key,'Content-Type':'application/json'},body:JSON.stringify({model:'vigia-local',messages:[{role:'system',content:'Você é uma IA educativa para prevenção de desastres. Use português brasileiro. Oriente sempre a procurar um adulto. Nunca invente observações ou pontuações de risco.'},{role:'user',content:text}],max_tokens:160,temperature:0.2,cache_prompt:false,chat_template_kwargs:{enable_thinking:false}}),signal:AbortSignal.timeout(90000)});
 const body=await r.json();const result={status:r.status,ms:Date.now()-t,text,body};results.push(result);console.log(JSON.stringify(result));
 }
 fs.writeFileSync('artifacts/local-ai-probe.json',JSON.stringify(results,null,2));
}finally{model.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
