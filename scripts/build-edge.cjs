const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const env={...process.env,VITE_FIREBASE_MODE:'cloud',VITE_AUDIENCE:'18plus',VITE_API_ORIGIN:'',PUPPETEER_SKIP_DOWNLOAD:'true'};
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','publication','--outDir','dist/edge/public'],{env,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
require('esbuild').buildSync({entryPoints:['edge/pages-entry.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:'dist/edge/public/_worker.js',logLevel:'info'});
for(const [source,target] of [['edge/pages-routes.json','_routes.json'],['edge/pages-headers.txt','_headers']])fs.copyFileSync(source,'dist/edge/public/'+target);
console.log('Pacote estático preparado em dist/edge/public. Nenhuma publicação foi executada.');
