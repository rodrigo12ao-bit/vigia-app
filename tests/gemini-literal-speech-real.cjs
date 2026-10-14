// Real Gemini free-tier synthesis of a fictional, fixed educational sentence.
const fs=require('node:fs'),{geminiEnv}=require('../scripts/gemini-env.cjs');
fs.mkdirSync('.tools/gemini',{recursive:true});
require('esbuild').buildSync({entryPoints:['server/geminiLiteralSpeech.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'.tools/gemini/literal-speech-probe.cjs',logLevel:'silent'});
const {geminiLiteralSpeech}=require('../.tools/gemini/literal-speech-probe.cjs');
(async()=>{
 const text='Guarde a lanterna na mochila. Confira também as pilhas.',start=performance.now();
 const report={scope:'Leitura literal real de uma frase fictícia adulta, Gemini gratuito. Nenhum microfone físico, resposta pronta ou cobrança.',text,events:[]};
 const connect=(url,options)=>{const WS=require('ws'),socket=new WS(url,options);socket.on('message',(raw,isBinary)=>{const bytes=Buffer.byteLength(raw.toString());let data;try{data=JSON.parse(raw.toString());}catch{}const content=data?.serverContent;report.events.push({isBinary,bytes,fields:data?Object.keys(data):[],contentFields:content?Object.keys(content):[],transcriptFields:content?.outputTranscription?Object.keys(content.outputTranscription):[],transcriptType:typeof content?.outputTranscription?.text,transcript:content?.outputTranscription?.text,parts:content?.modelTurn?.parts?.map(p=>({fields:Object.keys(p),mimeType:p.inlineData?.mimeType,dataLength:p.inlineData?.data?.length}))});});return socket;};
 try{const voice=await geminiLiteralSpeech(text,undefined,geminiEnv(),connect);report.durationMs=Math.round(performance.now()-start);report.audioBytes=voice.pcm.length;report.sampleRate=voice.sampleRate;let energy=0;for(let i=0;i<voice.pcm.length;i+=2)energy+=(voice.pcm.readInt16LE(i)/32768)**2;report.rms=Math.sqrt(energy/(voice.pcm.length/2));if(voice.pcm.length<24000||report.rms<0.001)throw Error('Não foi recebida uma fala substancial.');report.status='passed';}
 catch(e){report.status='failed';report.code=e.code;report.error=e.message;process.exitCode=1;}
 finally{fs.writeFileSync('artifacts/gemini-literal-speech-real.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,events:report.events.filter(e=>e.transcript||e.contentFields.includes('generationComplete')||e.fields.includes('error'))}));}
})();
