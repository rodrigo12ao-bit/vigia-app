const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{transform}=require('esbuild');
const helpers=transform(readFileSync('src/lib/voicePreference.ts','utf8'),{loader:'ts',format:'cjs'}).then(result=>{const module={exports:{}};new Function('module','exports',result.code)(module,module.exports);return module.exports;});
function storage(){const rows=new Map();return {rows,getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}

for(const legacy of ['local','google','unexpected'])test(`obsolete ${legacy} preference is removed without changing history or another account`,async()=>{
  const {clearLegacyVoicePreference}=await helpers,s=storage();
  s.setItem('vigia_voice_preference:account-a',legacy);s.setItem('vigia_voice_preference:account-b','local');s.setItem('vigia_voice_preference:guest','google');s.setItem('vigia_history_v1','history');
  clearLegacyVoicePreference(s,'account-a');
  assert.equal(s.getItem('vigia_voice_preference:account-a'),null);assert.equal(s.getItem('vigia_voice_preference:account-b'),'local');assert.equal(s.getItem('vigia_voice_preference:guest'),'google');assert.equal(s.getItem('vigia_history_v1'),'history');
});
test('guest migration is idempotent and does not persist any replacement preference',async()=>{
  const {clearLegacyVoicePreference}=await helpers,s=storage();s.setItem('vigia_voice_preference:guest','local');clearLegacyVoicePreference(s);clearLegacyVoicePreference(s);
  assert.equal(s.rows.size,0);
});
test('blocked preference cleanup never prevents a conversation or requires reading the old value',async()=>{
  const {clearLegacyVoicePreference}=await helpers;let attempts=0;
  assert.doesNotThrow(()=>clearLegacyVoicePreference({getItem(){throw Error('Old values must not be read');},removeItem(){attempts++;throw new DOMException('blocked','SecurityError');}},'account'));
  assert.equal(attempts,1);
});
