const {build,transform}=require('esbuild');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

async function loadHistoryModule(file,imports={}) {
  const result=await transform(readFileSync(file,'utf8'),{loader:'ts',format:'cjs'}),module={exports:{}};
  new Function('module','exports','require',result.code)(module,module.exports,name=>{
    assert.ok(name in imports,`Unexpected runtime import: ${name}`);return imports[name];
  });
  return module.exports;
}
let serviceCode;
function bundledService() {
  return serviceCode||(serviceCode=build({
    stdin:{contents:readFileSync('src/lib/chatHistoryService.ts','utf8'),resolveDir:path.resolve('src/lib'),sourcefile:'chatHistoryService.ts',loader:'ts'},
    bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',
    plugins:[{name:'isolated-history-ports',setup(builder){
      builder.onResolve({filter:/^(\.\/firebaseAuth|\.\/firebase|firebase\/firestore)$/},args=>({path:args.path,namespace:'history-port'}));
      builder.onLoad({filter:/.*/,namespace:'history-port'},args=>({contents:args.path==='./firebaseAuth'?'module.exports={auth:__historyAuth};':'module.exports=__historyFirebase;',loader:'js'}));
    }}],
  }).then(result=>result.outputFiles[0].text));
}
async function loadHistoryService({firebase,auth,storage}) {
  const module={exports:{}};
  new Function('module','exports','__historyFirebase','__historyAuth','localStorage',await bundledService())(module,module.exports,firebase,auth,storage);
  return module.exports;
}
function memoryStorage() {
  const data=new Map();
  return {data,get length(){return data.size;},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)||null,setItem:(key,value)=>{data.set(key,value);},removeItem:key=>{data.delete(key);}};
}
function historySession(id='s',turns=1,minute=1) {
  return {id,title:'Conversa '+id,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:new Date(Date.UTC(2026,10,1,0,minute)).toISOString(),lastMessagePreview:'Resposta '+turns,
    messages:Array.from({length:turns*2},(_,index)=>({id:id+'-m'+index,role:index%2?'assistant':'user',content:(index%2?'Resposta ':'Pergunta ')+(Math.floor(index/2)+1),timestamp:'2026-11-01T00:00:00.000Z'}))};
}
module.exports={loadHistoryModule,loadHistoryService,memoryStorage,historySession};
