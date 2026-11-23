const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');

// Component state and rendered controls are exercised without a browser. The
// transport is a controlled session double; history uses the real memory model.
const jsx=(type,props)=>({type,props:props||{}}),jsxRuntime={jsx,jsxs:jsx,Fragment:'fragment'};
const icons=new Proxy({},{get:(_target,key)=>String(key)});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function textOf(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree!=='object')return String(tree);return [tree.props?.children].flat(Infinity).map(textOf).join('');}
function find(tree,predicate){if(!tree||typeof tree!=='object')return;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}}
function button(tree,label){const found=find(tree,node=>node.type==='button'&&(node.props['aria-label']===label||node.props.title===label||textOf(node)===label));assert.ok(found,`Missing button: ${label}`);return found;}
function hooks(){
  const slots=[];let index=0,dirty=false,effects=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  const React={
    useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){const i=index++;return slots[i]??=( {current:initial});},
    useMemo(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useCallback(fn,deps){return React.useMemo(()=>fn,deps);},
    useEffect(effect,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:effect()};});}},
  };
  return {React,render(fn){let result,attempts=0;do{dirty=false;index=0;result=fn();const pending=effects;effects=[];pending.forEach(run=>run());if(++attempts>20)throw Error('Unstable component fixture');}while(dirty);return result;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function load(path,deps={},ports={}){
  const module={exports:{}},code=transformSync(readFileSync(path,'utf8'),{loader:path.endsWith('tsx')?'tsx':'ts',format:'cjs',jsx:'automatic',define:{'import.meta.env.MODE':'"test"','import.meta.env.DEV':'false'}}).code;
  new Function('require','module','exports',...Object.keys(ports),code)(name=>{assert.ok(name in deps,`Unexpected dependency ${name}`);return deps[name];},module,module.exports,...Object.values(ports));return module.exports;
}
const conversation=load('src/lib/conversationState.ts');
const voice=load('src/lib/voiceConversationState.ts',{'./conversationState':conversation});
const preference=load('src/lib/voicePreference.ts');

async function harness({legacy='local',storageBlocked=false}={}){
  const runtime=hooks(),sessions=[],saved=[],turns=[],modes=[],rows=new Map([['vigia_voice_preference:guest',legacy]]);let speechStops=0,accessChecks=0;
  const storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem(key){if(storageBlocked)throw new DOMException('blocked','SecurityError');rows.delete(key);}};
  class Session{
    constructor(callbacks){this.callbacks=callbacks;this.muted=[];this.pauses=[];this.interruptions=0;this.stopped=false;sessions.push(this);}
    start(){this.callbacks.onStateChange?.('listening');this.callbacks.onMicrophoneActivityChange?.(true);return Promise.resolve();}
    stop(){this.stopped=true;}
    setMuted(value){this.muted.push(value);}
    pauseMicrophone(value){this.pauses.push(value);this.callbacks.onMicrophoneActivityChange?.(!value);this.callbacks.onStateChange?.(value?'idle':'listening');}
    interruptPlayback(){this.interruptions++;this.callbacks.onInterrupted?.();this.callbacks.onProcessingStageChange?.(null);this.callbacks.onStateChange?.('listening');this.callbacks.onMicrophoneActivityChange?.(true);}
    processing(stage){this.callbacks.onStateChange?.('processing');this.callbacks.onProcessingStageChange?.(stage);this.callbacks.onMicrophoneActivityChange?.(false);}
  }
  const window=new EventTarget();Object.assign(window,{setTimeout,clearTimeout,setInterval,clearInterval,confirm:()=>true});
  const deps={react:runtime.React,'react/jsx-runtime':jsxRuntime,'motion/react':{motion:icons,AnimatePresence:'presence',useMotionValue:initial=>runtime.React.useRef({value:initial,set(value){this.value=value;}}).current},'lucide-react':icons,
    '../lib/api':{apiFetch:()=>{throw Error('No HTTP allowed in component fixture');},getAiStatus:async()=>({demo:false}),getAiAccess:async()=>{accessChecks++;return {voice:true};}},
    '../lib/images':{prepareImage:()=>{throw Error('No image processing in voice fixture');}},'./AudioActivityMeter':{AudioActivityMeter:'meter'},'./VoiceHistoryDialog':{VoiceHistoryDialog:'voice-history'},'./Avatar':{Avatar:'avatar'},
    '../utils/speech':{stopSpeaking:()=>speechStops++,isSpeechRecognitionSupported:()=>false},'../utils/geminiLive':{GeminiLiveSession:Session},'../lib/voicePreference':preference,
    '../utils/audioWave':{recordingToWave:()=>{throw Error('No microphone recording in voice fixture');}},'../lib/firebaseAuth':{auth:{currentUser:null}},'../lib/conversationState':conversation,'../lib/voiceConversationState':voice,
    '../lib/historyStore':{mergeHistorySummaries:(list,next)=>[...list.filter(item=>!next.some(value=>value.id===item.id)),...next]},
    '../lib/chatHistoryService':{loadSessionPage:async()=>({sessions:[],cursor:null,hasMore:false}),loadSession:async id=>saved.find(session=>session.id===id),saveSession:async session=>{saved.push(session);},stageGuestSession(){},supportsGuestHistoryLocks:()=>true},
  };
  const {ChatTab}=load('src/components/ChatTab.tsx',deps,{window,localStorage:storage,navigator:{onLine:true}});
  const h={runtime,rows,sessions,saved,turns,modes,accessChecks:()=>accessChecks,speechStops:()=>speechStops,props:{messages:[],isLoading:false,avatarState:'idle',isSpeaking:false,isGuest:true,isAudioMuted:false,
    conversationMemory:conversation.createConversationMemory(),voiceConversationMemory:voice.createVoiceConversationMemory(),voiceMessages:[],onSendMessage:async()=>true,onReplayAudio(){},onSelectPrompt(){},
    onChatModeChange:mode=>{modes.push(mode);},onVoiceTurn(input,reply){turns.push({input,reply});voice.appendVoiceConversationTurn(h.props.voiceConversationMemory,input,reply);h.props.voiceMessages=h.props.voiceConversationMemory.messages;},
    onResetVoice(){h.props.voiceConversationMemory=voice.createVoiceConversationMemory();h.props.voiceMessages=[];},onToggleAudioMute(){h.props.isAudioMuted=!h.props.isAudioMuted;},
  },render(){h.tree=runtime.render(()=>ChatTab(h.props));return h.tree;},async open(){button(h.tree,'Conversa por voz').props.onClick();h.render();await flush();h.render();return sessions.at(-1);},unmount(){runtime.unmount();}};
  h.render();await flush();h.render();return h;
}

for(const legacy of ['local','google'])test(`conversation presents one voice with obsolete ${legacy} preference and retains its controls`,async()=>{
  const h=await harness({legacy});try{
    await h.open();assert.equal(h.rows.has('vigia_voice_preference:guest'),false);assert.equal(h.accessChecks(),0,'Live session authorization belongs to its mandatory ticket, not an extra access probe.');
    assert.doesNotMatch(textOf(h.tree),/Voz rápida|Voz Google|Usar voz do aparelho|Sem voz local/);assert.equal(find(h.tree,node=>node.props['aria-label']==='Tipo de voz'),undefined);
    for(const label of ['Silenciar som da Vigia','Pausar microfone','Ocultar legendas','Encerrar conversa por voz','Iniciar uma nova conversa por voz','Abrir histórico de conversas'])button(h.tree,label);
    button(h.tree,'Silenciar som da Vigia').props.onClick();h.render();assert.equal(h.sessions[0].muted.at(-1),true);
    button(h.tree,'Pausar microfone').props.onClick();h.render();assert.equal(h.sessions[0].pauses.at(-1),true);
    button(h.tree,'Ativar microfone').props.onClick();h.render();assert.equal(h.sessions[0].pauses.at(-1),false);assert.equal(h.sessions.length,1);
  }finally{h.unmount();}
});

test('blocked legacy preference storage does not block cloud conversation',async()=>{
  const h=await harness({storageBlocked:true});try{await h.open();assert.equal(h.sessions.length,1);assert.doesNotMatch(textOf(h.tree),/Voz rápida|Voz Google|voz do aparelho/i);}finally{h.unmount();}
});

test('real preparation stages remain accessible and interruption preserves only the checked answer',async()=>{
  const h=await harness();try{
    const session=await h.open();session.processing('transcribing');h.render();assert.match(textOf(find(h.tree,node=>node.props.role==='status')),/Entendendo sua fala/);
    session.callbacks.onInputTranscription('Onde guardo a lanterna?');session.processing('thinking');h.render();assert.match(textOf(find(h.tree,node=>node.props.role==='status')),/Preparando a resposta/);
    const reply='Guarde a lanterna e as pilhas em um lugar seco e fácil de alcançar.';
    session.callbacks.onOutputTranscription(reply);session.callbacks.onTurnComplete();session.processing('synthesizing');h.render();
    assert.match(textOf(find(h.tree,node=>node.props.role==='status')),/Preparando a voz/);assert.ok(textOf(h.tree).includes(reply));assert.equal(h.turns.length,1);
    button(h.tree,'Interromper resposta da Vigia').props.onClick();h.render();assert.equal(session.interruptions,1);assert.ok(textOf(h.tree).includes(reply));
    session.callbacks.onTurnComplete();assert.equal(h.turns.length,1,'A later audio completion cannot save the same checked reply twice.');
    session.processing('thinking');h.render();assert.match(textOf(find(h.tree,node=>node.props.role==='status')),/Preparando a resposta/,'A previous subtitle must not label the next reasoning stage as speech synthesis.');
    await flush();h.render();assert.equal(h.saved.length,1);assert.ok(h.saved[0].id.startsWith('voice:'));
  }finally{h.unmount();}
});

test('a voice failure keeps the complete checked text and offers a retry without offering a different voice',async()=>{
  const h=await harness();try{
    const session=await h.open(),reply='Resposta completa validada, disponível apesar da falha de áudio.';
    session.callbacks.onInputTranscription('Pergunta válida.');session.callbacks.onOutputTranscription(reply);session.callbacks.onTurnComplete();session.callbacks.onSpeechUnavailable('A voz está temporariamente indisponível.');h.render();
    assert.ok(textOf(h.tree).includes(reply));assert.equal(h.turns.length,1);button(h.tree,'Continuar por texto');button(h.tree,'Tentar voz novamente');
    assert.doesNotMatch(textOf(h.tree),/Usar voz do aparelho|Voz rápida|Voz Google/);
    button(h.tree,'Tentar voz novamente').props.onClick();h.render();assert.equal(session.pauses.at(-1),false);assert.equal(h.sessions.length,1);
  }finally{h.unmount();}
});

test('new voice and text switches stop the old session and reject its late transcript or stage callbacks',async()=>{
  const h=await harness();try{
    const first=await h.open();await button(h.tree,'Iniciar uma nova conversa por voz').props.onClick();h.render();await flush();h.render();
    assert.equal(first.stopped,true);assert.equal(h.sessions.length,2);first.callbacks.onInputTranscription('Pergunta antiga');first.callbacks.onOutputTranscription('Áudio antigo');first.callbacks.onTurnComplete();first.processing('synthesizing');h.render();
    assert.equal(h.turns.length,0);assert.doesNotMatch(textOf(h.tree),/Pergunta antiga|Áudio antigo|Preparando a voz/);
    const current=h.sessions[1];button(h.tree,'Conversa por texto').props.onClick();h.render();assert.equal(current.stopped,true);
    current.callbacks.onOutputTranscription('Outra resposta antiga');current.callbacks.onTurnComplete();h.render();assert.equal(h.turns.length,0);assert.doesNotMatch(textOf(h.tree),/Outra resposta antiga/);
  }finally{h.unmount();}
});

test('text loading reports the actual upstream preparation phase and removes it when loading ends',async()=>{
  const h=await harness();try{
    h.props.isLoading=true;h.props.chatProgress='Conectando ao serviço…';h.render();assert.equal(textOf(find(h.tree,node=>node.props.role==='status')),'Conectando ao serviço…');
    h.props.chatProgress='Preparando a resposta…';h.render();assert.equal(textOf(find(h.tree,node=>node.props.role==='status')),'Preparando a resposta…');
    h.props.isLoading=false;h.props.chatProgress='';h.render();assert.equal(find(h.tree,node=>node.props.role==='status'),undefined);
  }finally{h.unmount();}
});

test('replay preparation is announced with a cancel action while the avatar and microphone remain idle',async()=>{
  const h=await harness();try{
    h.props.isPreparingSpeech=true;h.render();
    assert.equal(textOf(find(h.tree,node=>node.props.role==='status')),'Preparando a voz…');
    const avatar=find(h.tree,node=>node.type==='avatar');assert.equal(avatar.props.isSpeaking,false);assert.equal(avatar.props.state,'idle');
    button(h.tree,'Falar pelo microfone');button(h.tree,'Enviar mensagem');
    const before=h.speechStops();button(h.tree,'Cancelar leitura').props.onClick();assert.equal(h.speechStops(),before+1);
    h.props.isPreparingSpeech=false;h.props.isSpeaking=true;h.render();assert.equal(find(h.tree,node=>node.props.role==='status'),undefined);button(h.tree,'Parar áudio da Vigia');
  }finally{h.unmount();}
});

function replayHarness(){
  const app=readFileSync('src/App.tsx','utf8');
  const start=app.indexOf('  const speakMessage = (text: string) => {'),end=app.indexOf('  const handleSendMessage = async',start);
  assert.ok(start>0&&end>start,'Replay handler must remain available for its lifecycle contract.');
  const code=transformSync(app.slice(start,end),{loader:'ts',format:'cjs'}).code;
  const h={reads:[],accountVersion:{current:0},conversationVersion:{current:0},speechReplayToken:{current:0},state:{preparing:false,speaking:false,muted:true,avatar:'idle',debug:{}},active:null};
  h.stop=()=>{const read=h.active;h.active=null;read?.end();};
  h.render=()=>new Function('accountVersion','conversationVersion','renderedAccountVersion','renderedConversationVersion','speechReplayToken','setIsPreparingSpeech','setIsSpeaking','setIsAudioMuted','setAvatarState','setDebugInfo','speakText',code+'\nreturn speakMessage;')(
    h.accountVersion,h.conversationVersion,h.accountVersion.current,h.conversationVersion.current,h.speechReplayToken,
    value=>{h.state.preparing=value;},value=>{h.state.speaking=value;},value=>{h.state.muted=value;},fn=>{h.state.avatar=fn(h.state.avatar);},fn=>{h.state.debug=fn(h.state.debug);},
    (text,start,end)=>{h.stop();const read={text,start,end};h.reads.push(read);h.active=read;},
  );
  return h;
}

test('App replay announces preparation immediately and marks speech only when audio starts',()=>{
  const h=replayHarness();h.render()('Resposta completa.');
  assert.equal(h.state.preparing,true);assert.equal(h.state.speaking,false);assert.equal(h.state.muted,false);
  h.reads[0].start();assert.equal(h.state.preparing,false);assert.equal(h.state.speaking,true);
  h.reads[0].end();assert.equal(h.state.preparing,false);assert.equal(h.state.speaking,false);
  h.reads[0].start();assert.equal(h.state.speaking,false,'A callback queued before cancellation cannot reactivate the avatar.');
});

test('starting a new replay ignores cancellation and late callbacks of the old read in the same conversation',()=>{
  const h=replayHarness(),replay=h.render();replay('Primeira resposta.');const old=h.reads[0];old.start();
  replay('Segunda resposta.');assert.equal(h.state.preparing,true);assert.equal(h.state.speaking,false);
  old.end();old.start();assert.equal(h.state.preparing,true);assert.equal(h.state.speaking,false);
  h.reads[1].start();old.end();assert.equal(h.state.preparing,false);assert.equal(h.state.speaking,true);
  h.stop();assert.equal(h.state.preparing,false);assert.equal(h.state.speaking,false);
});

test('cancelling preparation clears it even after the account or conversation changes, without clearing a later replay',()=>{
  for(const scope of ['accountVersion','conversationVersion']){
    const h=replayHarness();h.render()('Resposta anterior.');const old=h.reads[0];h[scope].current++;h.stop();
    assert.equal(h.state.preparing,false);h.render()('Resposta atual.');old.end();old.start();
    assert.equal(h.state.preparing,true);assert.equal(h.state.speaking,false);h.stop();assert.equal(h.state.preparing,false);
  }
});
