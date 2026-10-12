import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInmetFeed,loadOfficialAlerts} from '../server/alerts';
const item=(link='https://apiprevmet3.inmet.gov.br/avisos/rss/123')=>`<rss version="2.0"><channel><item><title>Aviso &amp; orientação</title><link>${link}</link><pubDate>Mon, 12 Oct 2026 12:00:00 +0000</pubDate><description><![CDATA[<table><tr><th>Severidade</th><td>Perigo</td></tr><tr><th>Área</th><td>Campinas</td></tr><tr><th>Descrição</th><td><b>Exemplo de teste</b></td></tr></table>]]></description></item></channel></rss>`;
test('aviso conserva origem, horário e região sem devolver HTML executável ou classificação de IA',()=>{
 const [a]=parseInmetFeed(item());assert.equal(a.id,'123');assert.equal(a.area,'Campinas');assert.equal(a.description,'Exemplo de teste');assert.equal(a.url,'https://avisos.inmet.gov.br/123');assert.equal((a as any).riskScore,undefined);
});
test('links externos, XML com entidades e documento grande são rejeitados',()=>{
 assert.throws(()=>parseInmetFeed(item('https://attacker.invalid/123')));
 assert.throws(()=>parseInmetFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///private">]>'+item()));
 assert.throws(()=>parseInmetFeed('x'.repeat(1000001)));
});
test('fonte vazia é distinta de fonte indisponível; falha não inventa aviso',async()=>{
 assert.deepEqual(parseInmetFeed('<rss version="2.0"><channel></channel></rss>'),[]);
 await assert.rejects(loadOfficialAlerts((async()=>{throw Error('offline');}) as typeof fetch));
});
