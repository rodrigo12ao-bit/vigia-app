import type {Request,Response,RequestHandler} from 'express';

const aiPaths=new Set(['/chat','/analyze-scenario','/transcribe','/tts','/generate-quiz']);
const routePath=(request:Request)=>request.path.replace(/^\/api(?=\/)/i,'').replace(/\/$/,'').toLowerCase();
function validBody(request:Request,demo:boolean){
  const body=request.body,path=routePath(request);
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  if(Object.entries(body).some(([key,value])=>typeof value==='string'&&value.length>(key==='audio'&&!demo?1400000:250000)))return false;
  for(const key of ['message','scenario','text','audio','mimeType','topic','difficulty','houseType','location','readingLevel','avatarGender','nickname'])if(body[key]!==undefined&&typeof body[key]!=='string')return false;
  const required=path==='/chat'?'message':path==='/analyze-scenario'?'scenario':path==='/transcribe'?'audio':path==='/tts'?'text':null;
  if(required&&(typeof body[required]!=='string'||!body[required].trim()))return false;
  if(body.chatHistory!==undefined&&(!Array.isArray(body.chatHistory)||body.chatHistory.length>100||body.chatHistory.some((entry:any)=>!entry||!['user','assistant'].includes(entry.role)||typeof entry.content!=='string'||entry.content.length>10000)))return false;
  if(body.image!==undefined&&(!body.image||typeof body.image!=='object'||Array.isArray(body.image)||!['image/jpeg','image/png','image/webp'].includes(body.image.mimeType)||typeof body.image.data!=='string'||!body.image.data||body.image.data.length>250000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.image.data)))return false;
  return true;
}

type Handler=(request:Request,response:Response,signal:AbortSignal)=>Promise<unknown>|unknown;
export function createAiAdmission(options:{demo:boolean;maxConcurrent?:number;isEmergency:(text:string)=>boolean;emergencyReply:{reply:string;[key:string]:unknown}}){
  const limit=options.maxConcurrent??8;
  if(!Number.isSafeInteger(limit)||limit<1)throw Error('Limite de IA inválido.');
  let active=0;
  const validate:RequestHandler=(request,response,next)=>{
    if(!aiPaths.has(routePath(request)))return next();
    if(!validBody(request,options.demo)){response.status(400).json({error:'Conteúdo inválido ou grande demais.'});return;}
    response.locals.aiRequestBodyValidated=true;next();
  };
  function wrap(handler:Handler):RequestHandler {
    return async(request,response)=>{
      if(!response.locals.aiRequestBodyValidated&&!validBody(request,options.demo)){response.status(400).json({error:'Conteúdo inválido ou grande demais.'});return;}
      const path=routePath(request);
      // The local emergency directions never enter the provider admission limit.
      // Authentication, adult access and the request size/type checks still apply.
      if((path==='/chat'||path==='/analyze-scenario')&&options.isEmergency(request.body[path==='/chat'?'message':'scenario'])){
        response.json(path==='/chat'?options.emergencyReply:{...options.emergencyReply,summary:options.emergencyReply.reply});return;
      }
      if(options.demo&&request.headers['x-demo-failure']==='true'){response.status(503).json({status:'unavailable',error:'Simulação de indisponibilidade.',demo:true});return;}
      if(request.aborted||response.destroyed)return;
      if(active>=limit){response.status(503).json({status:'unavailable',error:'Serviço ocupado. Tente novamente.'});return;}
      active++;
      const controller=new AbortController();
      const disconnected=()=>{if(!response.writableEnded)controller.abort();};
      response.once('close',disconnected);
      try {await handler(request,response,controller.signal);}
      catch {if(!response.destroyed&&!response.headersSent)response.status(503).json({status:'unavailable',error:'Serviço de IA indisponível.'});}
      finally {
        // Do not release on socket close alone: an adapter may still be winding
        // down. A slot is reusable only when the admitted operation has settled.
        response.removeListener('close',disconnected);controller.abort();active--;
      }
    };
  }
  return {validate,wrap,get active(){return active;},limit};
}
