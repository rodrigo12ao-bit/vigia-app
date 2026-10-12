import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LEARNING_MISSIONS} from '../src/data/learningMissions';
import {emptyLearning,evaluateMission,learningStorageKey,normalizeLearning,readLearningCache,recommendMission} from '../src/lib/learningModel';
test('missões exigem respostas corretas antes da conclusão, sem aceitar alternativas fora do contrato',()=>{
 const good={choices:{water:0,wire:0,adult:1}};
 assert.equal(evaluateMission('perigos',good).complete,true);
 assert.equal(evaluateMission('perigos',{choices:{water:1,wire:0,adult:1}}).complete,false);
 assert.throws(()=>evaluateMission('perigos',{choices:{water:90,wire:0,adult:1}}));
 assert.throws(()=>evaluateMission('perigos',{choices:{water:0,wire:0,adult:1,admin:1}}));
});
test('mochila exige os itens previstos e recusa duplicatas ou objetos inventados',()=>{
 assert.equal(evaluateMission('mochila',{items:['water','light','documents','personal']}).complete,true);
 assert.equal(evaluateMission('mochila',{items:['water','light','documents','personal','glass']}).complete,false);
 assert.equal(evaluateMission('mochila',{items:['water','light']}).complete,false);
 assert.throws(()=>evaluateMission('mochila',{items:['water','water']}));
});
test('história e sequência têm resultados reproduzíveis',()=>{
 assert.equal(evaluateMission('atitude',{choices:{shelter:0,route:0,help:0}}).score,100);
 assert.equal(evaluateMission('passos',{order:['adult','official','kit','review']}).complete,true);
 assert.equal(evaluateMission('passos',{order:['official','adult','kit','review']}).complete,false);
 assert.throws(()=>evaluateMission('passos',{order:['adult','adult','kit','review']}));
});
test('recomendação usa missões pendentes e revisa dificuldades após concluir todas',()=>{
 const p=emptyLearning();assert.equal(recommendMission(p).id,'perigos');
 for(const m of LEARNING_MISSIONS)p.lessons[m.id]={score:100,completedAt:'2026-10-12T12:00:00Z',mistakes:m.id==='atitude'?2:0};
 assert.equal(recommendMission(p).id,'atitude');
});
test('cache autenticado e visitante não compartilham progresso nem respostas pendentes',()=>{
 const a=emptyLearning();a.lessons.perigos={score:100,completedAt:'2026-10-12T12:00:00Z',mistakes:1};
 const rows=new Map([[learningStorageKey('a'),JSON.stringify({progress:a,pending:[]})]]),storage={getItem:(key:string)=>rows.get(key)||null};
 assert.equal(Object.keys(readLearningCache(storage,'a').progress.lessons).length,1);
 assert.equal(Object.keys(readLearningCache(storage,'b').progress.lessons).length,0);
 assert.equal(Object.keys(readLearningCache(storage).progress.lessons).length,0);
});
test('progresso corrompido e conclusões inválidas falham sem alterar o registro original',()=>{
 const raw='{broken',rows=new Map([[learningStorageKey('a'),raw]]);
 assert.throws(()=>readLearningCache({getItem:key=>rows.get(key)||null},'a'));assert.equal(rows.get(learningStorageKey('a')),raw);
 assert.throws(()=>normalizeLearning({...emptyLearning(),lessons:{perigos:{score:55,mistakes:0,completedAt:'2026-10-12'}}}));
});
