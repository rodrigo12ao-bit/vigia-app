// Fixed synthetic identities and loopback hosts; this script cannot target production.
import {createHash} from 'node:crypto';
const root='http://localhost:3000';
const status=await (await fetch(root+'/api/status')).json();
if(!status.demo || status.realAI || status.firebase!=='emulator')throw new Error('Inicie o modo de demonstração com os emuladores locais.');
const tokens:Record<string,string>={};
for(const uid of ['demo-ana','demo-bruno','demo-responsavel']){
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid+'@example.invalid',password:'DemoLocal!123',returnSecureToken:true})});
  const data=await response.json();
  if(!response.ok || !data.idToken)throw new Error('Prepare as contas fictícias com npm run demo:seed.');
  tokens[uid]=data.idToken;
}
async function call(uid:string,action:string,data:any){
  const response=await fetch(root+'/api/sala/'+action,{method:'POST',headers:{Origin:root,'Content-Type':'application/json',Authorization:'Bearer '+tokens[uid]},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error || 'Preparação indisponível.');return result;
}
await call('demo-ana','profile',{});
const target=await call('demo-bruno','profile',{});
await call('demo-ana','invite',{code:target.inviteCode});
const id=createHash('sha256').update(JSON.stringify(['demo-ana','demo-bruno'].sort())).digest('hex');
await call('demo-responsavel','decision',{id,decision:'approve'});
await call('demo-bruno','decision',{id,decision:'approve'});
await call('demo-ana','message',{chatId:id,text:'Mensagem fictícia do teste',messageId:'demo-contact-welcome-001'});
console.log('Contato fictício Aurora/Sol aprovado no emulador. Nenhum dado de produção foi alterado.');
