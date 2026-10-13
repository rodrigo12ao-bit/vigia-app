import {AiUnavailable} from './realAi';
export function voiceText(raw:string){
 let text=raw.trim();
 if(text.startsWith('```')){const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);if(!fenced||!fenced[1].trim().startsWith('{'))throw new AiUnavailable('invalid_response','A IA não retornou uma fala válida.');text=fenced[1].trim();}
 if(text.startsWith('{')){try{const value=JSON.parse(text);if(typeof value.reply!=='string')throw Error();text=value.reply.trim();}catch{throw new AiUnavailable('invalid_response','A IA não retornou uma fala válida.');}}
 if(!text||text.length>1500||/[{}]|```|<think>|<tool_call>/.test(text))throw new AiUnavailable('invalid_response','A IA não retornou uma fala válida.');
 return text.replace(/\*\*/g,'').replace(/^#{1,6}\s+/gm,'');
}
