const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const {transform}=require('esbuild');

// Render event-handler trees with minimal React/DOM ports. Browser layout and
// the SW lifecycle are left to browser regression tests; no browser is launched.
const jsx=(type,props)=>({type,props:props||{}}),jsxRuntime={jsx,jsxs:jsx,Fragment:'fragment'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function find(tree,predicate){
  if(!tree||typeof tree!=='object')return;
  if(predicate(tree))return tree;
  for(const child of [tree.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function pwa(beforeUpdate,update=async()=>{}){
  const states=[];
  const React={useRef:value=>({current:value}),useEffect:()=>{},useState:value=>[value,next=>states.push(next)]};
  const deps={react:React,'react/jsx-runtime':jsxRuntime,'virtual:pwa-register/react':{useRegisterSW:()=>({offlineReady:[false,()=>{}],needRefresh:[true,()=>{}],updateServiceWorker:update})},'lucide-react':new Proxy({},{get:(_target,key)=>String(key)}),'motion/react':{motion:new Proxy({},{get:(_target,key)=>String(key)}),AnimatePresence:'presence'}};
  const code=await transform(readFileSync('src/components/PWAPrompt.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}),module={exports:{}};
  new Function('require','module','exports',code.code)(name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];},module,module.exports);
  const tree=module.exports.PWAPrompt({onBeforeUpdate:beforeUpdate});
  const button=find(tree,node=>node.type==='button'&&node.props.children==='Atualizar Agora');assert.ok(button);
  return {click:button.props.onClick,states};
}

test('update control waits for persistence and deduplicates repeated clicks',async()=>{
  const wait=deferred();let preparations=0,updates=0;
  const h=await pwa(()=>{preparations++;return wait.promise;},async()=>{updates++;});
  h.click();h.click();await flush();assert.equal(preparations,1);assert.equal(updates,0);
  wait.resolve();await flush();assert.equal(updates,1);
});

test('failed persistence leaves the existing application and shows the actual reason',async()=>{
  let updates=0;
  const h=await pwa(async()=>{throw Error('Synthetic save failed; conversation preserved.');},async()=>{updates++;});
  h.click();await flush();assert.equal(updates,0);assert.ok(h.states.includes('Synthetic save failed; conversation preserved.'));
});

test('startup import failure offers only explicit retry without deleting browser storage',async()=>{
  let load,reloads=0,rendered;
  const source=readFileSync('src/main.tsx','utf8').replace("import('./App.tsx')",'testEnv.loadApp()').replace(/^import '\.\/(?:index|learning)\.css';\r?\n/gm,'');
  const deps={'react':{StrictMode:'strict',Suspense:'suspense',lazy:loader=>{load=loader;return 'lazy-app';}},'react-dom/client':{createRoot:()=>({render:tree=>{rendered=tree;}})},'react/jsx-runtime':jsxRuntime,'./components/AdultGate':{AdultGate:'adult-gate'}};
  const code=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'});
  new Function('require','document','window','testEnv',code.code)(name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];},{getElementById:()=>({})},{location:{reload:()=>{reloads++;}}},{loadApp:async()=>{throw Error('Synthetic chunk fetch failed');}});
  assert.ok(rendered);const fallback=(await load()).default();assert.equal(reloads,0);
  const button=find(fallback,node=>node.type==='button'&&node.props.children==='Tentar carregar novamente');assert.ok(button);button.props.onClick();assert.equal(reloads,1);
});

async function boundary(beforeReload){
  let reloads=0,resets=0;
  class Component{constructor(props){this.props=props;}setState(next){Object.assign(this.state,next);}}
  const code=await transform(readFileSync('src/components/FeatureBoundary.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}),module={exports:{}};
  const deps={react:{Component},'react/jsx-runtime':jsxRuntime};
  new Function('require','module','exports','window',code.code)(name=>deps[name],module,module.exports,{location:{reload:()=>{reloads++;}}});
  const instance=new module.exports.FeatureBoundary({onReset:()=>{resets++;},onReload:beforeReload,children:'existing feature'});instance.componentDidMount();instance.state.failed=true;
  const button=find(instance.render(),node=>node.type==='button'&&node.props.children==='Recarregar aplicativo');assert.ok(button);
  return {instance,click:button.props.onClick,reloads:()=>reloads,resets:()=>resets};
}

test('optional feature import recovery awaits saving and keeps navigation available on failure',async()=>{
  const h=await boundary(async()=>{throw Error('Rascunho preservado.');});h.click();await flush();
  assert.equal(h.reloads(),0);assert.equal(h.instance.state.error,'Rascunho preservado.');
  const back=find(h.instance.render(),node=>node.type==='button'&&node.props.children==='Voltar');back.props.onClick();assert.equal(h.resets(),1);
});

test('leaving the failed feature cancels a delayed reload without resetting a different screen',async()=>{
  const pending=deferred(),h=await boundary(()=>pending.promise);h.click();h.instance.componentWillUnmount();pending.resolve();await flush();assert.equal(h.reloads(),0);
});
