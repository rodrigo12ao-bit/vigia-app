import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmergency, validScenario, validQuiz } from '../server/safety';
for(const text of ['socorro me ajuda','tem fogo na minha casa','a água tá subindo muito rápido','meu irmão tomou choque no fio caído','o barranco tá caindo','emergência, alguém desmaiou','estou sozinha e a água está entrando em casa'])test('alerta: '+text,()=>assert.equal(isEmergency(text),true));
for(const text of ['como eu apago o fogo de uma panela?','o que é uma enchente?','oi vigia, tudo bem?'])test('educativo: '+text,()=>assert.equal(isEmergency(text),false));
test('resposta inválida da IA não produz classificação de risco',()=>{assert.equal(validScenario({riskLevel:'Médio',riskScore:50}),false);assert.equal(validScenario({riskLevel:'Alto',riskScore:150}),false);assert.equal(validQuiz({question:'Pergunta',options:['A','B','C'],correctIndex:9,explanation:'Texto'}),false);});
