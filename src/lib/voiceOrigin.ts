const directVoiceOrigin='https://vigia-app.onrender.com';
type VoiceLocation=Pick<Location,'protocol'|'host'>;

// HTTP remains on the page's origin, including its HttpOnly guest cookie. Only
// the one-use voice ticket crosses directly to this explicitly allowed backend.
export function buildVoiceSocketUrl(location:VoiceLocation,ticket:string,context?:string,override?:string):string {
  let origin:string;
  if(override===undefined||override===''){
    if(!['http:','https:'].includes(location.protocol)||!location.host)throw Error('Endereço de voz indisponível.');
    origin=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host;
  }else{
    if(typeof override!=='string'||!/^https:\/\/vigia-app\.onrender\.com\/?$/.test(override))throw Error('O endereço configurado para voz não é permitido.');
    origin=directVoiceOrigin.replace('https:','wss:');
  }
  if(typeof ticket!=='string'||!ticket)throw Error('Não foi possível confirmar a sessão de voz. Tente novamente.');
  return `${origin}/api/live-ws?ticket=${encodeURIComponent(ticket)}&voiceProtocol=stream-v1${context?`&context=${encodeURIComponent(context)}`:''}`;
}
