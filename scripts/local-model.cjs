const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path'),fs=require('node:fs');
async function startModel(){
  if(process.env.RENDER==='true')throw Error('O modelo gratuito desta versão funciona somente neste computador.');
  const dir=path.resolve('.tools/local-ai'),key=randomBytes(32).toString('hex');
  for(const file of ['llama-b11577/llama-server.exe','Qwen3.5-0.8B-Q4_K_M.gguf','mmproj-F16.gguf'])if(!fs.existsSync(path.join(dir,file)))throw Error('Instale os componentes com o guia de IA local.');
  // No inherited provider credentials, agent tools, remote URLs or saved prompts.
  const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  env.LLAMA_API_KEY=key;
  const child=spawn(path.join(dir,'llama-b11577/llama-server.exe'),['-m',path.join(dir,'Qwen3.5-0.8B-Q4_K_M.gguf'),'--mmproj',path.join(dir,'mmproj-F16.gguf'),'--host','127.0.0.1','--port','3210','--alias','vigia-local','--ctx-size','4096','--parallel','1','--threads','4','--threads-batch','4','--batch-size','256','--ubatch-size','128','--gpu-layers','0','--no-mmproj-offload','--image-max-tokens','256','--cache-ram','0','--no-cache-prompt','--no-slots','--no-webui','--no-agent','--reasoning','off','--log-disable','--cors-origins','http://127.0.0.1:3210'],{env,windowsHide:true,stdio:'ignore'});
  let failure;child.on('error',e=>failure=e);child.on('exit',code=>{failure=Error('O modelo local foi encerrado ('+code+').');});
  for(let i=0;i<240;i++){
    if(failure)throw failure;
    try{const r=await fetch('http://127.0.0.1:3210/health',{headers:{Authorization:'Bearer '+key}});if(r.ok)return {child,key,close:()=>child.kill()};}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  child.kill();throw Error('O modelo não iniciou em 60 segundos.');
}
module.exports={startModel};
