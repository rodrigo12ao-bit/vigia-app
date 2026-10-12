import type {Express} from 'express';
export const INMET_FEED='https://apiprevmet3.inmet.gov.br/avisos/rss';
export interface OfficialAlert {id:string;title:string;severity:string;area:string;description:string;issuedAt:string;ends:string;url:string;}
const plain=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
export function parseInmetFeed(xml:string):OfficialAlert[]{
 if(xml.length>1000000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<rss\s/.test(xml)||!/<channel>/.test(xml))throw Error('Fonte inválida.');
 const alerts:OfficialAlert[]=[];
 for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){
  const item=match[1],tag=(key:string)=>item.match(new RegExp('<'+key+'>([\\s\\S]*?)<\\/'+key+'>'))?.[1]||'';
  const field=(key:string)=>plain(item.match(new RegExp('<th[^>]*>'+key+'<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>','i'))?.[1]||'').slice(0,1500);
  const url=plain(tag('link'));const id=url.match(/^https:\/\/apiprevmet3\.inmet\.gov\.br\/avisos\/rss\/(\d+)$/)?.[1];
  const issuedAt=plain(tag('pubDate')),title=plain(tag('title')).slice(0,200);
  if(!id||!title||!Number.isFinite(Date.parse(issuedAt)))continue;
  alerts.push({id,title,severity:field('Severidade'),area:field('Área'),description:field('Descrição'),issuedAt,ends:field('Fim'),url:'https://avisos.inmet.gov.br/'+id});
  if(alerts.length>=100)break;
 }
 if(xml.includes('<item>')&&alerts.length===0)throw Error('Formato da fonte indisponível.');return alerts;
}
let cached:{fetchedAt:string;expires:number;alerts:OfficialAlert[]}|undefined;
export async function loadOfficialAlerts(fetcher:typeof fetch=fetch){
 if(cached&&cached.expires>Date.now())return cached;
 const response=await fetcher(INMET_FEED,{signal:AbortSignal.timeout(8000),redirect:'error'});
 if(!response.ok)throw Error('Fonte indisponível.');
 const reader=response.body?.getReader();if(!reader)throw Error('Fonte indisponível.');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1000000)throw Error('Fonte grande demais.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
 const xml=Buffer.concat(chunks).toString('utf8'),alerts=parseInmetFeed(xml);
 cached={alerts,fetchedAt:new Date().toISOString(),expires:Date.now()+5*60000};return cached;
}
export function installAlertRoutes(app:Express){
 app.get('/api/official-alerts',async(req,res)=>{
  try{const result=await loadOfficialAlerts();res.json({status:'ok',source:'INMET',sourceUrl:'https://avisos.inmet.gov.br/',fetchedAt:result.fetchedAt,alerts:result.alerts});}
  catch{res.status(503).json({status:'unavailable',source:'INMET',sourceUrl:'https://avisos.inmet.gov.br/',error:'Não foi possível consultar os avisos oficiais agora. Consulte a fonte diretamente com um adulto.'});}
 });
}
