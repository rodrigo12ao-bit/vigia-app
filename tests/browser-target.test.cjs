const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolvePublicTestOrigin,expectedVoiceSocketOrigin}=require('./browser-target.cjs');

test('public test target defaults to Render and normalizes only an optional final slash',()=>{
  for(const value of [undefined,'','https://vigia-app.onrender.com','https://vigia-app.onrender.com/'])
    assert.equal(resolvePublicTestOrigin(value),'https://vigia-app.onrender.com');
});
test('explicit target accepts only the requested Vigia Netlify site naming pattern',()=>{
  for(const value of ['https://vigia-aplicativo-synthetic.netlify.app','https://vigia-aplicativo-synthetic-123.netlify.app/'])
    assert.equal(resolvePublicTestOrigin(value),value.replace(/\/$/,''));
});
for(const value of ['http://vigia-aplicativo-synthetic.netlify.app','https://another-site.netlify.app','https://vigia-aplicativo-.netlify.app','https://vigia-aplicativo-synthetic.netlify.app.attacker.example','https://attacker.example@vigia-aplicativo-synthetic.netlify.app','https://user:password@vigia-app.onrender.com','https://vigia-aplicativo-synthetic.netlify.app/path','https://vigia-aplicativo-synthetic.netlify.app?ticket=secret','https://vigia-aplicativo-synthetic.netlify.app#fragment','https://vigia-aplicativo-synthetic.netlify.app:443',' https://vigia-aplicativo-synthetic.netlify.app','https://vigia-aplicativo-synthetic.netlify.app/../','https://vigia-aplicativo-synthetic.netlify.app\\@attacker.example','https://deploy-preview-1--vigia-aplicativo-synthetic.netlify.app','https://VIGIA-APLICATIVO-synthetic.netlify.app','http://localhost:3119'])
  test('reject unapproved browser test target '+value,()=>assert.throws(()=>resolvePublicTestOrigin(value),/não autorizado/));
test('voice expectation is direct Render for Netlify while existing Render/local flows stay unchanged',()=>{
  assert.equal(expectedVoiceSocketOrigin('https://vigia-aplicativo-synthetic.netlify.app'),'wss://vigia-app.onrender.com');
  assert.equal(expectedVoiceSocketOrigin('https://vigia-app.onrender.com'),'wss://vigia-app.onrender.com');
  assert.equal(expectedVoiceSocketOrigin('http://localhost:3119'),'ws://localhost:3119');
  assert.equal(expectedVoiceSocketOrigin('http://localhost:3122'),'ws://localhost:3122');
  assert.throws(()=>expectedVoiceSocketOrigin('https://unapproved.invalid'),/não autorizado/);
});
