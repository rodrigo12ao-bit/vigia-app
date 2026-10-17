import {test} from 'node:test';import assert from 'node:assert/strict';import {voiceText} from '../server/voiceText';
test('fala contém somente a resposta gerada, sem ler o envelope JSON',()=>{assert.equal(voiceText('```json\n{"reply":"Guarde a lanterna na mochila.","options":[]}\n```'),'Guarde a lanterna na mochila.');assert.equal(voiceText('Guarde a **lanterna** na mochila.'),'Guarde a lanterna na mochila.');});
test('JSON incompleto, vazio, sem reply e texto enorme não viram fala',()=>{for(const raw of ['','{"reply":','{"options":[]}','```javascript\nwindow.alert(1)\n```','x'.repeat(1501)])assert.throws(()=>voiceText(raw));});
test('fala vazia após Markdown e tags internas em qualquer caixa são rejeitadas',()=>{
 for(const raw of ['**','** **','# **','<THINK>raciocínio</THINK>','</think>','<tool_call name="x">','<TOOL_CALL>','{"reply":"** **"}',null as any])assert.throws(()=>voiceText(raw));
 assert.equal(voiceText('# Confira a **lanterna**.\n\nUse pilhas novas.'),'Confira a lanterna.\n\nUse pilhas novas.');
});
