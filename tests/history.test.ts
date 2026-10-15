import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryStore, guestHistoryKey } from '../src/lib/historyStore';
const session=(id='s',content='Mensagem preservada')=>({id,title:'Título original',createdAt:'2020-01-01',updatedAt:'2026-10-12',messages:[{id:'m',role:'user' as const,content,timestamp:new Date()}]});
function fixture(){const rows=new Map<string,any[]>(),local=new Map<string,string>();const store=createHistoryStore({read:async uid=>rows.get(uid)||[],write:async(uid,s)=>{rows.set(uid,[s]);},remove:async(uid,id)=>{rows.set(uid,(rows.get(uid)||[]).filter(s=>s.id!==id));}}, {getItem:key=>local.get(key)||null,setItem:(key,value)=>{local.set(key,value);}});return {store,rows,local};}
test('salvar e carregar preserva título, criação, conteúdo e datas',async()=>{const {store}=fixture();await store.save(session(),'a');const [loaded]=await store.load('a');assert.equal(loaded.title,'Título original');assert.equal(loaded.createdAt,'2020-01-01');assert.equal(loaded.messages[0].content,'Mensagem preservada');assert.ok(loaded.messages[0].timestamp instanceof Date);});
test('conta A, B e visitante ficam isolados inclusive ao excluir',async()=>{const {store,local}=fixture();await store.save(session(),'a');await store.save(session('guest'),'');assert.equal((await store.load('b')).length,0);await store.remove('s','a');assert.equal((await store.load()).length,1);assert.ok(local.has(guestHistoryKey));});
test('falha autenticada não escreve nem lê dados do visitante',async()=>{const local=new Map([[guestHistoryKey,JSON.stringify([session('private-guest')])]]);const store=createHistoryStore({read:async()=>{throw Error('offline');},write:async()=>{throw Error('offline');},remove:async()=>{throw Error('offline');}},{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)});await assert.rejects(store.load('a'));await assert.rejects(store.save(session(),'a'));await assert.rejects(store.remove('s','a'));assert.equal(JSON.parse(local.get(guestHistoryKey)!)[0].id,'private-guest');});
test('gravações concorrentes preservam a versão mais recente',async()=>{const {store}=fixture();await Promise.all([store.save(session('s','antiga'),'a'),store.save(session('s','nova'),'a')]);assert.equal((await store.load('a'))[0].messages[0].content,'nova');});

test('visitante preserva sessões de IDs diferentes salvas ao mesmo tempo',async()=>{
  const {store}=fixture();
  await Promise.all([store.save(session('one','Primeira conversa')),store.save(session('two','Segunda conversa'))]);
  const saved=new Map((await store.load()).map(item=>[item.id,item.messages[0].content]));
  assert.deepEqual(saved,new Map([['one','Primeira conversa'],['two','Segunda conversa']]));
});

test('salvar e excluir sessões concorrentes seguem a ordem sem recriar conversa apagada',async()=>{
  const {store}=fixture();await store.save(session('one'));
  await Promise.all([store.save(session('one','Atualizada')),store.remove('one'),store.save(session('two','Preservada'))]);
  const saved=await store.load();assert.equal(saved.length,1);assert.equal(saved[0].id,'two');assert.equal(saved[0].messages[0].content,'Preservada');
});

test('fila lenta de uma conta não bloqueia outra conta nem o visitante',async()=>{
  let release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
  const rows=new Map<string,any>(),local=new Map<string,string>();
  const store=createHistoryStore({read:async uid=>rows.has(uid)?[rows.get(uid)]:[],write:async(uid,value)=>{if(uid==='a'){started();await gate;}rows.set(uid,value);},remove:async()=>{}},{getItem:key=>local.get(key)||null,setItem:(key,value)=>{local.set(key,value);}});
  const delayed=store.save(session('same','Conta A'),'a');await entered;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    await Promise.race([Promise.all([store.save(session('same','Conta B'),'b'),store.save(session('same','Visitante'))]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A fila de outra conta bloqueou o salvamento.')),2000);})]);
    assert.equal((await store.load('b'))[0].messages[0].content,'Conta B');
    assert.equal((await store.load())[0].messages[0].content,'Visitante');
  } finally {clearTimeout(timer);release();await delayed;}
  assert.equal((await store.load('a'))[0].messages[0].content,'Conta A');
});
test('histórico inválido falha sem apagar o conteúdo original',async()=>{const {store,local}=fixture();local.set(guestHistoryKey,'{broken');await assert.rejects(store.load());assert.equal(local.get(guestHistoryKey),'{broken');});

test('gravação e exclusão preservam registro corrompido e a fila aceita operação posterior',async()=>{
  const {store,local}=fixture();local.set(guestHistoryKey,'{broken');
  const results=await Promise.allSettled([store.save(session('one')),store.remove('two')]);
  assert.ok(results.every(result=>result.status==='rejected'));assert.equal(local.get(guestHistoryKey),'{broken');
  // Explicit repair by the fixture, after checking that failed operations did not overwrite data.
  local.set(guestHistoryKey,'[]');await store.save(session('after-repair'));
  assert.equal((await store.load())[0].id,'after-repair');
});
