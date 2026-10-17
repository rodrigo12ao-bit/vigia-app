import {createHash} from 'node:crypto';
import type {Request,RequestHandler} from 'express';
import {rateLimit} from 'express-rate-limit';

export const rateLimitMessage={status:'unavailable',error:'Muitas requisições. Aguarde um momento e tente novamente.',reply:'Muitas requisições. Aguarde um momento e tente novamente.',avatarState:'serious',interactiveOptions:['Tentar novamente em instantes'],suggestedFollowUps:[]};
const publicPaths=new Set(['/status','/session']);
const routePath=(request:Request)=>request.path.replace(/^\/api(?=\/)/i,'').replace(/\/$/,'').toLowerCase();
const aiPaths=new Set(['/chat','/analyze-scenario','/generate-quiz','/transcribe','/tts','/speak','/live-ticket']);
function credential(request:Request){
  if(request.headers.authorization?.startsWith('Bearer '))return request.headers.authorization;
  return /(?:^|;\s*)vigia_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie||'')?.[1];
}

// Apply before JSON parsing. Proxy egress IPs only rate-limit public/anonymous
// calls. Protected calls use a verified identity, never a client-provided UID/IP.
export function createAuthenticatedApiLimiter(options:{demo:boolean;authenticate:(request:Request)=>Promise<{uid:string;authTime?:number;firebaseUser?:boolean}>;publicLimit?:number;credentialLimit?:number;userLimit?:number;aiLimit?:number;maxAuthentications?:number}){
  const common={windowMs:60000,standardHeaders:true,legacyHeaders:false,message:rateLimitMessage};
  const publicLimiter=rateLimit({...common,limit:options.publicLimit??(options.demo?600:120)});
  const credentialLimiter=rateLimit({...common,limit:options.credentialLimit??(options.demo?600:120),keyGenerator:request=>createHash('sha256').update(credential(request)||'').digest('hex')});
  // Independent stores: ordinary API reads must not consume the smaller AI quota.
  const userLimiter=rateLimit({...common,limit:options.userLimit??(options.demo?300:120),keyGenerator:request=>request.res!.locals.uid});
  const aiLimiter=rateLimit({...common,limit:options.aiLimit??(options.demo?120:20),keyGenerator:request=>request.res!.locals.uid});
  const maximum=options.maxAuthentications??16;
  let authenticating=0;
  const middleware:RequestHandler=(request,response,next)=>{
    const path=routePath(request),value=credential(request);
    if(publicPaths.has(path))return publicLimiter(request,response,next);
    if(!value||value.length>8192)return publicLimiter(request,response,()=>{response.status(401).json({error:'Entre novamente ou inicie uma sessão de visitante.'});});
    return credentialLimiter(request,response,async()=>{
      if(authenticating>=maximum)return void response.status(503).json({status:'unavailable',error:'Verificação ocupada. Tente novamente.'});
      authenticating++;
      try{
        Object.assign(response.locals,await options.authenticate(request));
      }catch{
        response.status(401).json({error:'Entre novamente ou inicie uma sessão de visitante.'});return;
      }finally{authenticating--;}
      if(request.aborted||response.destroyed)return;
      userLimiter(request,response,()=>aiPaths.has(path)?aiLimiter(request,response,next):next());
    });
  };
  return middleware;
}
