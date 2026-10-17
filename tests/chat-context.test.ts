import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildChatContext} from '../server/chatContext';

const base={message:'E as pilhas da lanterna?',systemInstruction:'Instruções educativas verificadas.',baseInstruction:'Uma orientação por vez.'};
const turn=(n:number)=>[{role:'user',content:'Pergunta '+n},{role:'assistant',content:'Resposta '+n}];

test('contexto usa seis turnos recentes completos e mantém todo histórico original',()=>{
  const history=Array.from({length:10},(_,i)=>turn(i)).flat(),snapshot=JSON.stringify(history);
  const result=buildChatContext({...base,history});
  assert.deepEqual(result.history,history.slice(-12));assert.equal(result.droppedMessages,8);
  assert.equal(JSON.stringify(history),snapshot);assert.match(result.contentsPrompt,/Mensagem atual: "E as pilhas da lanterna\?"$/);
});

test('boas-vindas, respostas vazias e falas órfãs não viram turnos completos',()=>{
  const history=[{role:'assistant',content:'Boas-vindas'},...turn(1),{role:'user',content:'Sem resposta'},{role:'assistant',content:''},...turn(2),{role:'user',content:'Ainda processando'}];
  assert.deepEqual(buildChatContext({...base,history}).history,[...turn(1),...turn(2)]);
});

test('orçamento UTF-8 conta sistema, pergunta inteira, wrappers e instrução visual',()=>{
  const history=[...turn(1),{role:'user',content:'á😀'.repeat(20)},{role:'assistant',content:'Resposta curta.'}];
  const options={...base,history,imageInstruction:'Identifique somente os objetos observáveis.'};
  const all=buildChatContext(options),without=buildChatContext({...options,maxTurns:0});
  assert.equal(all.inputBytes,Buffer.byteLength(options.systemInstruction+all.contentsPrompt));
  assert.ok(all.inputBytes>all.contentsPrompt.length);assert.match(all.contentsPrompt,/E as pilhas da lanterna/);assert.match(all.contentsPrompt,/Identifique somente/);
  const bounded=buildChatContext({...options,maxInputBytes:all.inputBytes-1});
  assert.ok(bounded.inputBytes<=all.inputBytes-1);assert.deepEqual(bounded.history,history.slice(-2));
  assert.ok(without.inputBytes<bounded.inputBytes);
});

test('não inclui turnos antigos se o último turno completo exceder o orçamento',()=>{
  const history=[...turn(1),{role:'user',content:'x'.repeat(1000)},{role:'assistant',content:'y'.repeat(1000)}];
  const result=buildChatContext({...base,history,maxHistoryBytes:200});
  assert.deepEqual(result.history,[]);assert.match(result.contentsPrompt,/pilhas da lanterna/);assert.doesNotMatch(result.contentsPrompt,/Pergunta 1/);
});

test('uma pergunta que não cabe é rejeitada sem truncar e limites inválidos falham',()=>{
  const huge='Pergunta inteira '.repeat(5000);
  assert.throws(()=>buildChatContext({...base,message:huge}),(error:any)=>error.code==='invalid_input'&&error.status===400);
  for(const invalid of [{maxTurns:-1},{maxTurns:16},{maxHistoryBytes:-1},{maxInputBytes:60001},{maxTurns:1.5}])assert.throws(()=>buildChatContext({...base,...invalid}),/Orçamento/);
});
