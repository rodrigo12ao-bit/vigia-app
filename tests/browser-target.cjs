const renderOrigin='https://vigia-app.onrender.com';

// Test operators explicitly opt in through VIGIA_TEST_URL. No arbitrary hosts,
// credentials, normalized paths or deploy-preview domains may receive accounts.
function resolvePublicTestOrigin(value) {
  if(value===undefined||value==='')return renderOrigin;
  if(typeof value!=='string'||!/^https:\/\/(?:vigia-app\.onrender\.com|vigia-aplicativo-[a-z0-9-]+\.netlify\.app)\/?$/.test(value))
    throw Error('Endereço externo não autorizado para este teste.');
  return value.replace(/\/$/,'');
}

function expectedVoiceSocketOrigin(pageOrigin) {
  if(/^http:\/\/localhost:(?:3119|3122)$/.test(pageOrigin))return pageOrigin.replace('http:','ws:');
  const origin=resolvePublicTestOrigin(pageOrigin);
  return(origin.endsWith('.netlify.app')?renderOrigin:origin).replace('https:','wss:');
}

module.exports={resolvePublicTestOrigin,expectedVoiceSocketOrigin};
