const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');

const jsx=(type,props)=>({type,props:props||{}}),jsxRuntime={jsx,jsxs:jsx,Fragment:'fragment'};
const icons=new Proxy({},{get:(_target,key)=>String(key)}),motion={motion:icons,AnimatePresence:'presence'};
function load(path,deps={},ports={}){
 const module={exports:{}};
 const code=transformSync(readFileSync(path,'utf8'),{loader:path.endsWith('.tsx')?'tsx':'ts',format:'cjs',jsx:'automatic',supported:{'dynamic-import':false},define:{'import.meta.env.VITE_AUDIENCE':'"18plus"','import.meta.env.MODE':'"publication"'}}).code;
 new Function('require','module','exports',...Object.keys(ports),code)(name=>{assert.ok(name in deps,'Unexpected import: '+name);return deps[name];},module,module.exports,...Object.values(ports));
 return module.exports;
}
function hooks(){
 const slots=[],effects=[];let index=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const React={
  useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>slots[i].value=typeof next==='function'?next(slots[i].value):next];},
  useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useId(){const i=index++;return 'test-'+i;},
  useEffect(effect,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:effect()};});},
 };
 return{React,render(fn){index=0;const result=fn();effects.splice(0).forEach(fn=>fn());return result;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function text(tree){if(tree==null)return '';if(typeof tree!=='object')return String(tree);return [tree.props?.children].flat(Infinity).map(text).join('');}
function all(tree,predicate){if(!tree||typeof tree!=='object')return[];return [...(predicate(tree)?[tree]:[]),...[tree.props?.children].flat(Infinity).flatMap(child=>all(child,predicate))];}
const find=(tree,predicate)=>all(tree,predicate)[0];
const button=(tree,label)=>{const node=find(tree,n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label));assert.ok(node,'Missing button '+label);return node;};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const blocked={getItem(){throw new DOMException('Denied','SecurityError');},setItem(){throw new DOMException('Denied','SecurityError');},removeItem(){throw new DOMException('Denied','SecurityError');}};
const event={preventDefault(){}};

test('blocked sessionStorage cannot grant adult access or crash the entry gate',()=>{
 const audience=load('src/lib/audience.ts',{}, {sessionStorage:blocked}),runtime=hooks();
 const {AdultGate}=load('src/components/AdultGate.tsx',{react:runtime.React,'react/jsx-runtime':jsxRuntime,'../lib/audience':audience});
 let tree=runtime.render(()=>AdultGate({children:'Protected application'}));
 assert.equal(audience.hasAdultAccessDeclaration(),false);assert.ok(text(tree).includes('18 anos'));
 const continueButton=button(tree,'Continuar');assert.equal(continueButton.props.disabled,true);
 continueButton.props.onClick();tree=runtime.render(()=>AdultGate({children:'Protected application'}));
 assert.equal(text(tree).includes('Protected application'),false);
 find(tree,n=>n.type==='input').props.onChange({target:{checked:true}});
 tree=runtime.render(()=>AdultGate({children:'Protected application'}));button(tree,'Continuar').props.onClick();
 tree=runtime.render(()=>AdultGate({children:'Protected application'}));assert.equal(text(tree),'Protected application');
 assert.equal(audience.hasAdultAccessDeclaration(),true);
 assert.equal(load('src/lib/audience.ts',{}, {sessionStorage:blocked}).hasAdultAccessDeclaration(),false,'a new page must ask again');
});

test('declining age never sets an accepted declaration',()=>{
 const audience=load('src/lib/audience.ts',{}, {sessionStorage:blocked}),runtime=hooks();
 const {AdultGate}=load('src/components/AdultGate.tsx',{react:runtime.React,'react/jsx-runtime':jsxRuntime,'../lib/audience':audience});
 let tree=runtime.render(()=>AdultGate({children:'Protected'}));button(tree,'Tenho menos de 18 anos').props.onClick();
 tree=runtime.render(()=>AdultGate({children:'Protected'}));assert.equal(audience.hasAdultAccessDeclaration(),false);
 assert.ok(find(tree,n=>n.props.role==='alert'));assert.equal(find(tree,n=>n.type==='button'&&text(n)==='Continuar'),undefined);
});

test('an accessible cleared or obsolete declaration revokes the client hint',()=>{
 const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value)};
 const audience=load('src/lib/audience.ts',{}, {sessionStorage:storage});
 audience.acceptAdultAccessDeclaration();assert.equal(audience.hasAdultAccessDeclaration(),true);
 rows.delete('vigia_adult_access');assert.equal(audience.hasAdultAccessDeclaration(),false);
 rows.set('vigia_adult_access','obsolete');assert.equal(audience.hasAdultAccessDeclaration(),false);
});

test('a denied storage write cannot erase an explicit same-page declaration when reads work',()=>{
 for(const initial of [null,'obsolete']){
  const storage={getItem:()=>initial,setItem(){throw new DOMException('Synthetic quota','QuotaExceededError');}};
  const audience=load('src/lib/audience.ts',{}, {sessionStorage:storage});
  assert.equal(audience.hasAdultAccessDeclaration(),false);
  audience.acceptAdultAccessDeclaration();
  assert.equal(audience.hasAdultAccessDeclaration(),true);assert.equal(audience.hasAdultAccessDeclaration(),true);
  assert.equal(load('src/lib/audience.ts',{}, {sessionStorage:storage}).hasAdultAccessDeclaration(),false);
 }
});

test('same-page fallback still requires server adult approval before a private operation',async()=>{
 const audience=load('src/lib/audience.ts',{}, {sessionStorage:blocked}),calls=[];
 const response=(code,body)=>new Response(JSON.stringify(body),{status:code});
 let allowed=false;
 const api=load('src/lib/api.ts',{'./firebaseAuth':{auth:{currentUser:null}},'../../server/safety':{isEmergency:()=>false},'./audience':audience},{
  sessionStorage:blocked,localStorage:{getItem:()=>null},window:{addEventListener(){}},
  fetch:async(path)=>{calls.push(path);if(path==='/api/status')return response(200,{demo:true,realAI:false,audience:'18plus'});if(path==='/api/adult-access')return response(allowed?200:403,{error:'Acesso revogado no servidor.'});return response(200,{ok:true});},
 });
 await assert.rejects(api.salaRequest('invite',{}),/18 anos/);assert.deepEqual(calls,['/api/status']);
 audience.acceptAdultAccessDeclaration();await assert.rejects(api.salaRequest('invite',{}),/revogado/);
 assert.equal(calls.includes('/api/sala/invite'),false);
 allowed=true;assert.deepEqual(await api.salaRequest('invite',{}),{ok:true});
 assert.equal(calls.filter(path=>path==='/api/adult-access').length,2);
 assert.equal(calls.filter(path=>path==='/api/sala/invite').length,1);
});

test('registration nickname survives blocked storage only until registration finishes',()=>{
 const registration=load('src/lib/registrationNickname.ts',{}, {sessionStorage:blocked});
 assert.equal(registration.getRegistrationNickname(),null);registration.setRegistrationNickname('Apelido fictício');
 assert.equal(registration.getRegistrationNickname(),'Apelido fictício');registration.clearRegistrationNickname();
 assert.equal(registration.getRegistrationNickname(),null);
});
test('registration write and removal failures cannot revive a stale stored nickname',()=>{
 const storage={getItem:()=> 'Stale prior nickname',setItem(){throw new DOMException('Synthetic quota','QuotaExceededError');},removeItem(){throw new DOMException('Synthetic denied removal','SecurityError');}};
 const registration=load('src/lib/registrationNickname.ts',{}, {sessionStorage:storage});
 registration.setRegistrationNickname('Current nickname');assert.equal(registration.getRegistrationNickname(),'Current nickname');
 registration.clearRegistrationNickname();assert.equal(registration.getRegistrationNickname(),null);
});

function profileHarness(save){
 const runtime=hooks();let props={isOpen:true,userId:'a',userEmail:'a@example.test',nickname:'Original',badges:[],starsScore:0,completedGamesCount:0,isGuest:false,onClose(){},onUpdateNickname:save,onSignOut(){},onAccountDeleted(){},onResetProgress(){}};
 const {ProfileModal}=load('src/components/ProfileModal.tsx',{react:runtime.React,'react/jsx-runtime':jsxRuntime,'motion/react':motion,'lucide-react':icons,'../hooks/useDialog':{useDialog:()=>({current:null})},'./Avatar':{Avatar:'avatar'},'./AccountDataControls':{AccountDataControls:'data'}});
 const h={render(next={}){props={...props,...next};h.tree=runtime.render(()=>ProfileModal(props));return h.tree;},runtime};h.render();h.render();
 h.edit=value=>{button(h.tree,'Editar apelido').props.onClick();h.render();find(h.tree,n=>n.type==='input').props.onChange({target:{value}});h.render();};
 h.submit=()=>find(h.tree,n=>n.type==='form').props.onSubmit(event);return h;
}
test('profile waits for persistence, disables duplicate saves and announces success',async()=>{
 const pending=deferred(),saved=[];const h=profileHarness(value=>{saved.push(value);return pending.promise;});
 h.edit('Novo apelido');const first=h.submit(),second=h.submit();h.render();
 assert.deepEqual(saved,['Novo apelido']);assert.ok(find(h.tree,n=>n.type==='input'));
 assert.equal(button(h.tree,'Salvando apelido').props.disabled,true);assert.ok(text(h.tree).includes('Salvando apelido'));
 pending.resolve();await Promise.all([first,second]);h.render({nickname:'Novo apelido'});
 assert.equal(find(h.tree,n=>n.type==='input'),undefined);assert.ok(text(h.tree).includes('Apelido salvo.'));
});
test('profile keeps the failed draft and allows retry with the same value',async()=>{
 const saved=[];let fail=true;const h=profileHarness(async value=>{saved.push(value);if(fail)throw Error('Falha fictícia de gravação');});
 h.edit('Rascunho preservado');await h.submit();h.render();
 assert.equal(find(h.tree,n=>n.type==='input').props.value,'Rascunho preservado');
 assert.ok(text(find(h.tree,n=>n.props.role==='alert')).includes('Falha fictícia'));assert.equal(button(h.tree,'Salvar apelido').props.disabled,false);
 fail=false;await h.submit();h.render();assert.deepEqual(saved,['Rascunho preservado','Rascunho preservado']);assert.ok(text(h.tree).includes('Apelido salvo.'));
});
test('an old profile request cannot close a reopened editor or change its feedback',async()=>{
 const pending=deferred();const h=profileHarness(()=>pending.promise);h.edit('Primeiro');const old=h.submit();
 h.render({isOpen:false});h.render({isOpen:true});h.render();h.edit('Segundo');
 pending.resolve();await old;h.render();assert.equal(find(h.tree,n=>n.type==='input').props.value,'Segundo');
 assert.equal(text(h.tree).includes('Apelido salvo.'),false);
});
test('an old profile failure cannot leak into another account',async()=>{
 const pending=deferred();const h=profileHarness(()=>pending.promise);h.edit('Conta A');const old=h.submit();
 h.render({userId:'b',nickname:'Conta B'});h.render();pending.reject(Error('Falha privada da conta A'));await old;h.render();
 assert.ok(text(h.tree).includes('Conta B'));assert.equal(text(h.tree).includes('Falha privada'),false);
});

function authHarness({login=async()=>{}}={}){
 const runtime=hooks(),registration=load('src/lib/registrationNickname.ts',{}, {sessionStorage:blocked});
 const auth={currentUser:null},closed=[];
 const firebase={auth,googleProvider:{},signInWithEmailAndPassword:login,createUserWithEmailAndPassword:async()=>{auth.currentUser={uid:'new'};return{user:{uid:'new',email:'new@example.test'}};},signInWithPopup:async()=>{throw Error('Unused');},sendPasswordResetEmail:async()=>{}};
 const {AuthModal}=load('src/components/AuthModal.tsx',{react:runtime.React,'react/jsx-runtime':jsxRuntime,'motion/react':motion,'lucide-react':icons,'../hooks/useDialog':{useDialog:()=>({current:null})},'../lib/api':{salaRequest:async()=>({})},'../lib/audience':{adultAudience:true},'../lib/registrationNickname':registration,'./auth-modal.css':{},'../lib/firebaseAuth':firebase,'../lib/firebase':{db:{},doc:()=>({}),updateDoc:async()=>{}}},{requestAnimationFrame:()=>1,cancelAnimationFrame(){},window:{confirm:()=>true}});
 const h={registration,render(){h.tree=runtime.render(()=>AuthModal({isOpen:true,onClose:()=>closed.push(true),onContinueAsGuest(){},onOpenLegal(){}}));return h.tree;},closed};h.render();h.render();return h;
}
test('Auth fields retain labels across forms and switching forms hides the password',()=>{
 const h=authHarness();
 const assertLabels=()=>{for(const input of all(h.tree,n=>n.type==='input'&&n.props.type!=='checkbox'))assert.ok(find(h.tree,n=>n.type==='label'&&n.props.htmlFor===input.props.id),'Unlabelled '+input.props.name);};
 assertLabels();button(h.tree,'Mostrar senha').props.onClick();h.render();assert.equal(find(h.tree,n=>n.type==='input'&&n.props.name==='password').props.type,'text');
 button(h.tree,'Criar Conta').props.onClick();h.render();assertLabels();assert.equal(find(h.tree,n=>n.type==='input'&&n.props.name==='password').props.type,'password');
 assert.equal(find(h.tree,n=>n.type==='input'&&n.props.name==='password').props.autoComplete,'new-password');
 button(h.tree,'Entrar').props.onClick();h.render();button(h.tree,'Esqueci minha senha').props.onClick();h.render();assertLabels();
});
test('Auth announces failure and keeps form switching disabled while sign-in is pending',async()=>{
 const pending=deferred();const h=authHarness({login:()=>pending.promise});
 for(const [name,value] of [['email','adult@example.test'],['password','synthetic']]){find(h.tree,n=>n.type==='input'&&n.props.name===name).props.onChange({target:{value}});h.render();}
 const request=find(h.tree,n=>n.type==='form').props.onSubmit(event);h.render();assert.equal(button(h.tree,'Criar Conta').props.disabled,true);
 pending.reject({code:'auth/invalid-credential'});await request;h.render();assert.ok(text(find(h.tree,n=>n.props.role==='alert')).includes('incorretos'));
 assert.equal(button(h.tree,'Criar Conta').props.disabled,false);
});
test('registration succeeds with denied sessionStorage and clears the temporary nickname',async()=>{
 const h=authHarness();button(h.tree,'Criar Conta').props.onClick();h.render();
 for(const [name,value] of [['nickname','Adulto fictício'],['email','adult@example.test'],['password','synthetic']]){find(h.tree,n=>n.type==='input'&&n.props.name===name).props.onChange({target:{value}});h.render();}
 find(h.tree,n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
 await find(h.tree,n=>n.type==='form').props.onSubmit(event);h.render();
 assert.equal(h.closed.length,1);assert.equal(h.registration.getRegistrationNickname(),null);assert.equal(find(h.tree,n=>n.props.role==='alert'),undefined);
});

function dialogFixture(){
 const listeners=new Map(),frames=new Map(),dialogs=[];let frameId=0;
 const document={activeElement:null,querySelectorAll:()=>dialogs.filter(el=>el.isConnected),addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
 const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};
 function element(name,kind='button'){
  const attributes=new Map();const el={name,kind,tabIndex:0,isConnected:true,hidden:false,children:[],getClientRects(){return this.hidden||!this.isConnected?[]:[{}];},closest(){return this.hidden?{}:null;},querySelectorAll(){return this.children;},contains(node){return this===node||this.children.includes(node);},matches(){return ['input','textarea','select'].includes(kind);},getAttribute:key=>attributes.get(key)??null,removeAttribute:key=>attributes.delete(key),focus(){document.activeElement=this;emit('focusin',{target:this});}};return el;
 }
 function mount(dialog,close=()=>{}){
  dialogs.push(dialog);let cleanup;
  const React={useRef:initial=>({current:initial===null?dialog:initial}),useEffect:effect=>{cleanup=effect();}};
  const {useDialog}=load('src/hooks/useDialog.ts',{react:React},{document,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
  useDialog(true,close);return()=>{dialog.isConnected=false;cleanup();};
 }
 return{document,element,mount,flush(){while(frames.size){const list=[...frames.values()];frames.clear();list.forEach(fn=>fn());}},key(key,shiftKey=false){let prevented=false;emit('keydown',{key,shiftKey,preventDefault(){prevented=true;}});return prevented;}};
}
test('dialog traps Tab in both directions and redirects programmatic background focus',()=>{
 const f=dialogFixture(),background=f.element('Background'),dialog=f.element('Dialog','dialog'),first=f.element('First'),input=f.element('Email','input'),last=f.element('Last');
 dialog.children=[first,input,last];background.focus();f.mount(dialog);f.flush();assert.equal(f.document.activeElement,input);
 last.focus();assert.equal(f.key('Tab'),true);assert.equal(f.document.activeElement,first);
 assert.equal(f.key('Tab',true),true);assert.equal(f.document.activeElement,last);
 background.focus();assert.equal(f.document.activeElement,input);
});
test('only the top dialog handles Escape and focus returns to its mounted trigger',()=>{
 const f=dialogFixture(),welcome=f.element('Welcome','dialog'),trigger=f.element('Enter'),other=f.element('Guest');welcome.children=[trigger,other];
 let lowerClosed=0,upperClosed=0;f.mount(welcome,()=>lowerClosed++);f.flush();trigger.focus();
 const auth=f.element('Auth','dialog'),email=f.element('Email','input');auth.children=[email];const unmount=f.mount(auth,()=>upperClosed++);f.flush();
 assert.equal(f.document.activeElement,email);f.key('Escape');assert.equal(upperClosed,1);assert.equal(lowerClosed,0);
 unmount();f.flush();assert.equal(f.document.activeElement,trigger);
});
test('a removed lower dialog never steals focus from a remaining upper dialog',()=>{
 const f=dialogFixture(),welcome=f.element('Welcome','dialog'),trigger=f.element('Enter');welcome.children=[trigger];
 const unmountWelcome=f.mount(welcome);f.flush();
 const auth=f.element('Auth','dialog'),email=f.element('Email','input');auth.children=[email];f.mount(auth);f.flush();
 unmountWelcome();trigger.isConnected=false;f.flush();assert.equal(f.document.activeElement,email);
});
test('a temporarily empty dialog holds focus instead of allowing Tab into the page',()=>{
 const f=dialogFixture(),dialog=f.element('Loading dialog','dialog');f.mount(dialog);f.flush();
 assert.equal(f.document.activeElement,dialog);assert.equal(f.key('Tab'),true);assert.equal(f.document.activeElement,dialog);
});
