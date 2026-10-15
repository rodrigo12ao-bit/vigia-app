import {apiFetch} from './api';
import {auth} from './firebaseAuth';
export async function learningRequest(path:string,data:Record<string,unknown>={}){
 const uid=auth.currentUser?.uid;if(!uid)throw Error('Entre na sua conta para continuar.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await apiFetch(path,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,ownerUid:uid})});
  const body=await response.json();if(auth.currentUser?.uid!==uid)throw Error('A conta mudou. Reabra esta tela.');
  if(!response.ok)throw Error(body.error||'Operação indisponível.');return body;
 }catch(e){if(controller.signal.aborted)throw Error('A conexão demorou. Tente novamente.');throw e;}finally{clearTimeout(timer);}
}
