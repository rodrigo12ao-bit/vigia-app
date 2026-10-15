const {spawnSync}=require('node:child_process');
const {copyFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'dist','netlify','public');

function buildNetlify({spawn=spawnSync,copy=copyFileSync,environment=process.env,log=console.log}={}) {
  const env={...environment,VITE_FIREBASE_MODE:'cloud',VITE_AUDIENCE:'18plus',VITE_VOICE_ORIGIN:'https://vigia-app.onrender.com',PUPPETEER_SKIP_DOWNLOAD:'true'};
  const result=spawn(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','publication','--outDir','dist/netlify/public'],{cwd:root,env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)return result.status??1;
  // Only public frontend output. The API bridge is deployed separately by Netlify
  // from netlify/functions; Render's server and private release files stay out.
  for(const name of ['_redirects','_headers'])copy(path.join(root,'netlify',name),path.join(publicDir,name));
  log('Pacote Netlify preparado em dist/netlify/public. Nenhuma publicação foi executada.');
  return 0;
}

module.exports={buildNetlify};
if(require.main===module)process.exitCode=buildNetlify();
