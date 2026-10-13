// Used only by the isolated test process with --require; no production mocks.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(!url.startsWith('https://api.openai.com/v1/'))return originalFetch(input,options);
 const route=url.split('/v1/')[1];
 if(route==='audio/transcriptions')return new Response(JSON.stringify({text:'Onde guardo a lanterna fictícia?'}));
 const body=JSON.parse(options.body);
 if(route==='moderations')return new Response(JSON.stringify({results:[{flagged:false}]}));
 if(route==='audio/speech')return new Response(new Uint8Array(24000),{headers:{'Content-Type':'audio/pcm'}});
 if(route==='responses'){
  const input=body.input[0].content;
  if(JSON.stringify(input).includes('FALHA_FORNECEDOR'))return new Response('Synthetic provider failure',{status:503});
  const props=body.text?.format?.schema?.properties;
  const answer=props?.riskLevel?{riskLevel:'Baixo',riskScore:10,summary:'Resultado fictício do teste de contrato, não diagnóstico real.',actionSteps:['Conversar com um adulto'],essentialKitItems:['Lanterna'],emergencyNumbersToCall:[],customQuiz:{question:'Quem ajuda?',options:['Adulto','Ninguém','Só criança'],correctIndex:0,explanation:'Um adulto ajuda.'},encouragement:'Continue praticando.'}:props?.question?{question:'Quem prepara a mochila?',options:['Adulto','Ninguém','Só criança'],correctIndex:0,explanation:'Um adulto ajuda.',rewardStars:10}:props?.reply?{reply:input.some(p=>p.type==='input_image')?'CONTRATO: imagem recebida com a pergunta.':'CONTRATO: '+input.filter(p=>p.type==='input_text').map(p=>p.text).join(' ').slice(-170),avatarState:'explaining',interactiveOptions:[],suggestedFollowUps:[]}:null;
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:answer?JSON.stringify(answer):'CONTRATO: resposta educativa fictícia.'}]}]}));
 }
 throw Error('Unexpected paid endpoint during contract test');
};
