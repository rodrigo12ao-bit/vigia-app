const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');

const jsx=(type,props)=>({type,props:props||{}}),jsxRuntime={jsx,jsxs:jsx,Fragment:'fragment'};
const icons=new Proxy({},{get:(_target,key)=>String(key)}),motion={motion:icons,AnimatePresence:'presence'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function textOf(tree){if(tree==null)return '';if(typeof tree!=='object')return String(tree);return [tree.props?.children].flat(Infinity).map(textOf).join('');}
function find(tree,predicate){if(!tree||typeof tree!=='object')return;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}}
function button(tree,label){const found=find(tree,node=>node.type==='button'&&textOf(node)===label);assert.ok(found,`Missing button: ${label}`);return found;}
function hookRuntime(){
 const slots=[],effects=[];let index=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const React={
  useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},
  useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value;},
  useEffect(effect,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:effect()};});}},
 };
 return {React,render(fn){index=0;const output=fn();effects.splice(0).forEach(run=>run());return output;},unmount(){slots.forEach(slot=>slot?.cleanup?.());},replayEffects(){slots.forEach(slot=>{if(slot&&'cleanup' in slot){slot.cleanup?.();slot.deps=undefined;}});}};
}
function moduleFrom(path,deps,ports={}){
 const module={exports:{}};
 const code=transformSync(readFileSync(path,'utf8'),{loader:path.endsWith('tsx')?'tsx':'ts',format:'cjs',jsx:'automatic'}).code;
 new Function('require','module','exports',...Object.keys(ports),code)(name=>{assert.ok(name in deps,`Unexpected import ${name} in ${path}`);return deps[name];},module,module.exports,...Object.values(ports));
 return module.exports;
}
const missions=moduleFrom('src/data/learningMissions.ts',{});
const learningModel=moduleFrom('src/lib/learningModel.ts',{'../data/learningMissions':missions});
function storage(){const rows=new Map();return {rows,getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value)};}
function learningHarness(uid){
 if(arguments.length===0)uid='a';
 const hooks=hookRuntime(),auth={currentUser:uid?{uid}:null},store=storage(),requests=[],events=[],window=new EventTarget();
 window.dispatchEvent=event=>{events.push(event);return true;};
 const deps={react:hooks.React,'../lib/firebaseAuth':{auth},'../lib/activityFeedback':{announceReward:()=>{}},'../lib/learningModel':learningModel,'../lib/learningApi':{learningRequest:(path,payload)=>{const wait=deferred();requests.push({path,payload,...wait});return wait.promise;}}};
 const {useLearning}=moduleFrom('src/hooks/useLearning.ts',deps,{localStorage:store,window,navigator:{onLine:true},CustomEvent});
 let account=uid;
 const h={auth,store,requests,events,hooks,render(next=account){account=next;h.value=hooks.render(()=>useLearning(account));return h.value;}};h.render();h.render();return h;
}
const progress=()=>learningModel.emptyLearning();
const loadBody=(data=progress())=>({progress:data,assignments:[],familyRequests:[]});
async function settleInitial(h){h.requests[0]?.resolve(loadBody());await flush();h.render();}

test('rapid preference changes are serialized and the latest choice remains pending until saved',async()=>{
 const h=learningHarness();await settleInitial(h);
 const first=h.value.preferences('standard','normal');h.render();
 await h.value.preferences('advanced','large');h.render();
 assert.equal(h.requests.length,2);
 assert.equal(JSON.parse(h.store.getItem(learningModel.learningStorageKey('a'))).preferencesDirty,true);
 h.requests[1].resolve({});await flush();h.render();
 assert.equal(h.requests.length,3);assert.deepEqual(h.requests[2].payload,{reading:'advanced',textSize:'large'});
 assert.equal(JSON.parse(h.store.getItem(learningModel.learningStorageKey('a'))).preferencesDirty,true);
 h.requests[2].resolve({});await first;h.render();
 assert.equal(h.value.progress.reading,'advanced');assert.equal(h.value.progress.textSize,'large');
 assert.equal(JSON.parse(h.store.getItem(learningModel.learningStorageKey('a'))).preferencesDirty,false);
});

test('lesson synchronization cannot overwrite reading preferences changed while saving',async()=>{
 const h=learningHarness();await settleInitial(h);
 const completion=h.value.complete('perigos',{choices:{water:0,wire:0,adult:1}},0);h.render();
 await h.value.preferences('advanced','large');h.render();
 const remote=progress();remote.lessons.perigos={completedAt:'2026-10-16T12:00:00Z',score:100,mistakes:0};
 h.requests[1].resolve({progress:remote,awarded:true,xp:20});await flush();h.render();
 assert.equal(h.value.progress.reading,'advanced');assert.equal(h.value.progress.textSize,'large');
 assert.equal(h.requests[2].path,'/api/learning/preferences');
 h.requests[2].resolve({});await completion;h.render();assert.equal(h.value.pending,0);
});

test('a delayed progress read cannot roll back an already synchronized lesson',async()=>{
 const h=learningHarness();await settleInitial(h);
 const reload=h.value.reload();
 const completion=h.value.complete('perigos',{choices:{water:0,wire:0,adult:1}},0);
 const remote=progress();remote.lessons.perigos={completedAt:'2026-10-16T12:00:00Z',score:100,mistakes:0};
 h.requests[2].resolve({progress:remote,awarded:true,xp:20});await completion;
 h.requests[1].resolve(loadBody());await reload;h.render();
 assert.ok(h.value.progress.lessons.perigos);assert.equal(h.value.pending,0);
});

test('switching accounts away and back ignores responses from the previous lifetime',async()=>{
 const h=learningHarness('a');h.auth.currentUser={uid:'b'};h.render('b');h.render('b');h.auth.currentUser={uid:'a'};h.render('a');h.render('a');
 const latest={...progress(),reading:'advanced'};h.requests[2].resolve(loadBody(latest));await flush();
 h.requests[0].resolve(loadBody());h.requests[1].resolve(loadBody());await flush();h.render();
 assert.equal(h.value.progress.reading,'advanced');assert.equal(h.store.getItem(learningModel.learningStorageKey('b')),null);
});

test('a stale guest activity cannot save or award progress after signing in',async()=>{
 const h=learningHarness(undefined);await flush();h.render();h.auth.currentUser={uid:'signed-in'};
 await assert.rejects(h.value.complete('perigos',{choices:{water:0,wire:0,adult:1}},0),/conta mudou/);
 assert.equal(h.store.rows.size,0);
});

function gameHarness(name,level,ports={}){
 const hooks=hookRuntime(),completed=[];
 const { [name]:Game }=moduleFrom(`src/components/learning/${name}.tsx`,{react:hooks.React,'react/jsx-runtime':jsxRuntime,'lucide-react':icons,'motion/react':motion},ports);
 const h={hooks,completed,render(){h.tree=hooks.render(()=>Game({level,onComplete:(...args)=>completed.push(args)}));return h.tree;}};h.render();return h;
}

test('sequence success is invalidated when a checked stage is removed',()=>{
 const h=gameHarness('SequenceOrderGame',{title:'Sequence',content:{correctSequence:['One','Two','Three']}});
 for(const item of ['One','Two','Three']){button(h.tree,item).props.onClick();h.render();}
 button(h.tree,'Verificar Sequência').props.onClick();h.render();
 assert.ok(button(h.tree,'Concluir Fase'));
 const remove=find(h.tree,node=>node.props?.['aria-label']==='Remover etapa: One');assert.ok(remove);remove.props.onClick();h.render();
 assert.equal(find(h.tree,node=>node.type==='button'&&textOf(node)==='Concluir Fase'),undefined);
 assert.equal(h.completed.length,0);
});

test('interactive story cancels delayed completion on exit and deduplicates a rapid choice',()=>{
 const timers=new Map();let next=0;
 const h=gameHarness('InteractiveStoryGame',{title:'Story',content:{nodes:{start:{text:'Story',question:'Question',choices:[{text:'Finish',feedback:'Done',isCorrect:true,nextScenario:'victory'}]}}}},{setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
 const choice=button(h.tree,'1Finish');choice.props.onClick();choice.props.onClick();assert.equal(timers.size,1);
 h.hooks.unmount();assert.equal(timers.size,0);assert.equal(h.completed.length,0);
});

for(const [name,content,answerLabel,nextLabel] of [
 ['QuizChallengeGame',{questions:[{question:'First',options:['Yes','No'],correctIndex:0,explanation:'Correct'},{question:'Second',options:['Yes','No'],correctIndex:0,explanation:'Correct'},{question:'Third',options:['Yes','No'],correctIndex:0,explanation:'Correct'}]},'AYes','Próxima Pergunta'],
 ['TrueFalseGame',{questions:[{statement:'First',isTrue:true,explanation:'Correct'},{statement:'Second',isTrue:true,explanation:'Correct'},{statement:'Third',isTrue:true,explanation:'Correct'}]},'VERDADEIRO','Próxima Afirmação'],
])test(`${name} does not skip questions after repeated next clicks`,()=>{
 const h=gameHarness(name,{title:'Quiz',content});const answer=button(h.tree,answerLabel);answer.props.onClick();answer.props.onClick();h.render();
 const nextButton=button(h.tree,nextLabel);nextButton.props.onClick();nextButton.props.onClick();h.render();
 assert.ok(textOf(h.tree).includes('Second'));assert.equal(h.completed.length,0);
});

function pwaHarness(){
 const hooks=hookRuntime(),listeners=new Map(),window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),matchMedia:()=>({matches:false})};
 const {PWAPrompt}=moduleFrom('src/components/PWAPrompt.tsx',{react:hooks.React,'react/jsx-runtime':jsxRuntime,'lucide-react':icons,'motion/react':motion,'virtual:pwa-register/react':{useRegisterSW:()=>({offlineReady:[false,()=>{}],needRefresh:[false,()=>{}],updateServiceWorker:async()=>{}})}},{window});
 const h={hooks,listeners,render(){h.tree=hooks.render(()=>PWAPrompt({visible:true}));return h.tree;}};h.render();return h;
}
test('declining installation consumes the browser prompt and removes the inactive install button',async()=>{
 const h=pwaHarness(),wait=deferred();let prompts=0;
 h.listeners.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{prompts++;},userChoice:wait.promise});h.render();
 const install=button(h.tree,'Instalar App');const installing=install.props.onClick();install.props.onClick();h.render();assert.equal(prompts,1);
 assert.equal(find(h.tree,node=>node.type==='button'&&textOf(node)==='Instalar App'),undefined);
 wait.resolve({outcome:'dismissed'});await installing;h.render();assert.equal(find(h.tree,node=>node.type==='button'&&textOf(node)==='Instalar App'),undefined);
 h.listeners.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});h.render();assert.ok(button(h.tree,'Instalar App'));
 h.listeners.get('appinstalled')();h.render();assert.equal(find(h.tree,node=>node.type==='button'&&textOf(node)==='Instalar App'),undefined);
});
test('installation prompt failures are handled without unhandled event-handler rejection',async()=>{
 const h=pwaHarness();h.listeners.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{throw Error('Installation unavailable');},userChoice:Promise.resolve({})});h.render();
 await button(h.tree,'Instalar App').props.onClick();h.render();assert.ok(textOf(h.tree).includes('menu do navegador'));
});

function salaHarness(){
 const hooks=hookRuntime(),profile=deferred(),sent=[],messages=new Map(),timers=new Map();let nextTimer=0,chatListener;
 const service={fetchOrCreateUserProfile:()=>profile.promise,subscribeUserChats:(_uid,fn)=>{chatListener=fn;return()=>{};},subscribePendingInvites:()=>()=>{},subscribeChatMessages:(id,fn)=>{messages.set(id,fn);return()=>{};},markChatAsRead:async()=>{},sendMessage:(...args)=>{const wait=deferred();sent.push({args,...wait});return wait.promise;}};
 const {SalaSeguraTab}=moduleFrom('src/components/salasegura/SalaSeguraTab.tsx',{react:hooks.React,'react/jsx-runtime':jsxRuntime,'lucide-react':icons,'motion/react':motion,'../../lib/salaSeguraService':service,'../Avatar':{Avatar:'avatar'},'../../lib/audience':{adultAudience:true}},{navigator:{clipboard:{writeText:async()=>{}}},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 const user={uid:'self',email:'test@example.test',displayName:'Self'};
 const h={hooks,profile,sent,messages,chatListener:()=>chatListener,render(){h.tree=hooks.render(()=>SalaSeguraTab({currentUser:user,isGuest:false,onOpenAuth(){}}));return h.tree;}};h.render();h.render();return h;
}
function chat(id,nickname){return {id,participants:['self',id],participantProfiles:{[id]:{nickname,role:'infantil',avatarId:'default'}},unreadCount:{self:0},lastMessageText:'Greeting',lastMessageTimestamp:'2026-10-16T12:00:00Z',isApproved:true};}
async function readySala(h){h.profile.resolve({uid:'self',nickname:'Self',inviteCode:'VIGIA-TEST',role:'infantil',blockedUsers:[]});await flush();h.chatListener()([chat('a','Contact A'),chat('b','Contact B')]);h.render();}
function openSala(h,name){const contact=find(h.tree,node=>node.type==='button'&&textOf(node).includes(name));assert.ok(contact);contact.props.onClick();h.render();h.render();}
function salaInput(h,value){const input=find(h.tree,node=>node.type==='input'&&node.props.placeholder==='Digite uma mensagem segura...');assert.ok(input);input.props.onChange({target:{value}});h.render();}
function submitSala(h){const form=find(h.tree,node=>node.type==='form'&&find(node,child=>child.type==='input'&&child.props.placeholder==='Digite uma mensagem segura...'));assert.ok(form);return form.props.onSubmit({preventDefault(){}});}

test('private room hides previous conversation messages and ignores callbacks after switching contacts',async()=>{
 const h=salaHarness();await readySala(h);openSala(h,'Contact A');
 h.messages.get('a')([{id:'one',senderUid:'self',text:'Private message A',createdAt:'2026-10-16T12:00:00Z',readBy:['self'],status:'sent'}]);h.render();assert.ok(textOf(h.tree).includes('Private message A'));
 find(h.tree,node=>node.type==='button'&&node.props.title==='Voltar para a Lista').props.onClick();h.render();h.render();
 openSala(h,'Contact B');assert.equal(textOf(h.tree).includes('Private message A'),false);
 h.messages.get('a')([{id:'late',senderUid:'self',text:'Late private message A',createdAt:'2026-10-16T12:00:00Z',readBy:['self'],status:'sent'}]);h.render();assert.equal(textOf(h.tree).includes('Late private message A'),false);
 h.hooks.unmount();
});
test('a completed send preserves the new draft typed while that message was being sent',async()=>{
 const h=salaHarness();await readySala(h);openSala(h,'Contact A');salaInput(h,'First message');const sending=submitSala(h);h.render();salaInput(h,'Next draft');
 h.sent[0].resolve({});await sending;h.render();const input=find(h.tree,node=>node.type==='input'&&node.props.placeholder==='Digite uma mensagem segura...');assert.equal(input.props.value,'Next draft');h.hooks.unmount();
});
test('an old private-room send cannot erase the draft for a different contact',async()=>{
 const h=salaHarness();await readySala(h);openSala(h,'Contact A');salaInput(h,'First message');const sending=submitSala(h);h.render();
 find(h.tree,node=>node.type==='button'&&node.props.title==='Voltar para a Lista').props.onClick();h.render();h.render();openSala(h,'Contact B');salaInput(h,'Draft for contact B');
 h.sent[0].resolve({});await sending;h.render();const input=find(h.tree,node=>node.type==='input'&&node.props.placeholder==='Digite uma mensagem segura...');assert.equal(input.props.value,'Draft for contact B');h.hooks.unmount();
});

const adventureModel=moduleFrom('src/lib/adventureModel.ts',{});
const quizzes=moduleFrom('src/data/quizzes.ts',{});
const badges=moduleFrom('src/lib/badges.ts',{'../data/learningMissions':missions,'./adventureModel':adventureModel,'../data/quizzes':quizzes});
const {normalizeProfileProgress}=moduleFrom('src/lib/profileProgress.ts',{'./badges':badges});
const {finishDeletedAccountSession}=moduleFrom('src/lib/accountSession.ts',{});

test('offline profiles accept account badge IDs and old object caches without losing earned badges',()=>{
 const id=badges.defaultBadges[0].id;
 const old=normalizeProfileProgress({nickname:'  Protetor  ',starsScore:150,badges:[{id,unlocked:true,unlockedAt:'16/10/2026'}],avatarGender:'male'});
 assert.equal(old.nickname,'Protetor');assert.equal(old.starsScore,150);assert.equal(old.avatarGender,'male');assert.equal(old.badges.find(b=>b.id===id).unlocked,true);assert.equal(old.badges.find(b=>b.id===id).unlockedAt,'16/10/2026');
 assert.equal(normalizeProfileProgress({badges:[id]}).badges.find(b=>b.id===id).unlocked,true);
 assert.equal(normalizeProfileProgress({badges:[{id,unlocked:false}]}).badges.find(b=>b.id===id).unlocked,false);
});
test('malformed profile caches are rejected without changing the previous data',()=>{
 for(const value of [null,[],{nickname:{}},{starsScore:'100'},{starsScore:-1},{badges:'broken'},{badges:[null]}]){const original=JSON.stringify(value);assert.throws(()=>normalizeProfileProgress(value));assert.equal(JSON.stringify(value),original);}
});

function accountHarness(onDeleted,store={}){
 const hooks=hookRuntime(),auth={currentUser:{uid:'a'}},requests=[];let confirmations=0,downloads=0;
 const document={body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 const {AccountDataControls}=moduleFrom('src/components/AccountDataControls.tsx',{react:hooks.React,'react/jsx-runtime':jsxRuntime,'../lib/firebaseAuth':{auth},'../lib/learningApi':{learningRequest:(path,payload)=>{const wait=deferred();requests.push({path,payload,...wait});return wait.promise;}}},{window:{confirm:()=>{confirmations++;return true;}},localStorage:store,document});
 const h={hooks,auth,requests,confirmations:()=>confirmations,downloads:()=>downloads,render(){h.tree=hooks.render(()=>AccountDataControls({uid:'a',role:'responsavel',onDeleted:uid=>onDeleted(uid,auth)}));return h.tree;}};h.render();return h;
}
test('completed account deletion signs out once without trying to save deleted conversations',async()=>{
 let stopped=0,signouts=0,closed=0;
 const h=accountHarness((uid,auth)=>finishDeletedAccountSession(uid,{currentUid:()=>auth.currentUser?.uid,isCurrent:()=>true,stopActivity:()=>{stopped++;},signOut:async()=>{signouts++;auth.currentUser=null;},onSignedOut:()=>{closed++;}}),{'vigia_learning_v2:a':'cached',removeItem(){throw Error('Storage unavailable');}});
 find(h.tree,node=>node.type==='input'&&node.props.id==='delete-confirmation').props.onChange({target:{value:'EXCLUIR'}});h.render();
 const remove=button(h.tree,'Excluir conta da demonstração');const pending=remove.props.onClick();remove.props.onClick();assert.equal(h.requests.length,1);assert.equal(h.confirmations(),1);
 h.requests[0].resolve({success:true,deletedUid:'a'});await pending;await flush();h.render();
 assert.deepEqual(h.requests.map(r=>r.path),['/api/account/delete']);assert.equal(stopped,1);assert.equal(signouts,1);assert.equal(closed,1);
});
test('stale account controls cannot export or delete the newly signed-in account',async()=>{
 const h=accountHarness(()=>{});h.auth.currentUser={uid:'b'};
 button(h.tree,'Exportar meus dados').props.onClick();await flush();h.render();assert.equal(h.requests.length,0);assert.ok(textOf(h.tree).includes('conta mudou'));
 find(h.tree,node=>node.type==='input'&&node.props.id==='delete-confirmation').props.onChange({target:{value:'EXCLUIR'}});h.render();button(h.tree,'Excluir conta da demonstração').props.onClick();await flush();assert.equal(h.requests.length,0);assert.equal(h.confirmations(),0);
});
test('an export response received after an account switch cannot download private data',async()=>{
 const h=accountHarness(()=>{});button(h.tree,'Exportar meus dados').props.onClick();h.auth.currentUser={uid:'b'};h.requests[0].resolve({ownerUid:'a'});await flush();h.render();assert.equal(h.downloads(),0);assert.ok(textOf(h.tree).includes('conta mudou'));
});
test('deleted-session cleanup never closes a different account',async()=>{
 let uid='b',signouts=0,closed=0;const wait=deferred();
 const actions={currentUid:()=>uid,isCurrent:()=>true,stopActivity(){},signOut:async()=>{signouts++;await wait.promise;},onSignedOut:()=>{closed++;}};
 await finishDeletedAccountSession('a',actions);assert.equal(signouts,0);
 uid='a';const completion=finishDeletedAccountSession('a',actions);uid='b';wait.resolve();await completion;assert.equal(signouts,1);assert.equal(closed,0);
});

function trailHarness(){
 const hooks=hookRuntime(),awards=[],music=[],store=storage();
 const journeyData=moduleFrom('src/data/learningJourneyData.ts',{}),avatars=moduleFrom('src/data/playerAvatarsData.ts',{});
 const deps={react:hooks.React,'react/jsx-runtime':jsxRuntime,'lucide-react':icons,'motion/react':motion,'../../lib/activityFeedback':{playActivityFeedback(){},feedbackPreferences:()=>({sounds:true})},'../../data/learningJourneyData':journeyData,'../../data/playerAvatarsData':avatars,'../../utils/gameAudio':{gameAudio:new Proxy({toggleBgm:on=>music.push(on)},{get:(target,key)=>target[key]||(()=>{})})},'../../lib/firebase':{auth:{currentUser:null}}};
 for(const name of ['HazardFinderGame','PathChoiceGame','SequenceOrderGame','BackpackBuilderGame','InteractiveStoryGame','TrueFalseGame','QuizChallengeGame','EmergencyCentralGame','HomeSafetyGame','CertificateModal','AvatarClosetModal','PlayerAvatarModal'])deps['./'+name]={[name]:name};
 deps['../DailyMissionCard']={DailyMissionCard:'daily'};
 const {LearningTrailMap}=moduleFrom('src/components/learning/LearningTrailMap.tsx',deps,{localStorage:store,window:{confirm:()=>true},setTimeout:()=>1,clearTimeout(){}});
 const h={hooks,awards,music,render(){h.tree=hooks.render(()=>LearningTrailMap({onAddStars(){},onUnlockBadge(){},onReward:async(...args)=>{awards.push(args);}}));return h.tree;}};h.render();h.render();return h;
}
test('the learning trail awards each open activity once and rejects stale completion callbacks',()=>{
 const h=trailHarness();button(h.tree,'Continuar Missão').props.onClick();h.render();const game=find(h.tree,node=>typeof node.props?.onComplete==='function');assert.ok(game);
 game.props.onComplete(3,80);game.props.onComplete(3,80);h.render();assert.equal(h.awards.length,1);
 button(h.tree,'Continuar Missão').props.onClick();h.render();game.props.onComplete(3,80);assert.equal(h.awards.length,1);
 h.hooks.unmount();assert.ok(h.music.includes(false));
});

test('adventure cache normalizes empty state and preserves invalid earned records',async()=>{
 const hooks=hookRuntime(),store=storage(),window=new EventTarget();store.setItem(adventureModel.adventureKey(),JSON.stringify({state:null,earned:[],pending:[]}));
 const {useAdventure}=moduleFrom('src/hooks/useAdventure.ts',{react:hooks.React,'../lib/firebaseAuth':{auth:{currentUser:null}},'../lib/learningApi':{learningRequest:async()=>{}},'../lib/adventureModel':adventureModel,'../lib/activityFeedback':{announceReward(){},stopActivityFeedback(){}},'../data/learningJourneyData':{MODULES_DATA:[]}},{localStorage:store,window,navigator:{onLine:true}});
 const render=()=>hooks.render(()=>useAdventure(undefined,0,()=>{},()=>{}));render();const valid=render();assert.equal(valid.state.completed,0);hooks.unmount();
 const raw=JSON.stringify({state:adventureModel.emptyAdventure(),earned:[null],pending:[]});store.setItem(adventureModel.adventureKey(),raw);hooks.replayEffects();render();const invalid=render();await assert.rejects(invalid.earn({kind:'quiz',id:'synthetic'},20),/preservado/);assert.equal(store.getItem(adventureModel.adventureKey()),raw);
});
