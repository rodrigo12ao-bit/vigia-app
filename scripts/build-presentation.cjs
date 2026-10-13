const {spawnSync}=require('node:child_process');
const env={...process.env,VITE_FIREBASE_MODE:'emulator',VITE_AUDIENCE:'18plus',PUPPETEER_SKIP_DOWNLOAD:'true'};
const vite=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','presentation','--outDir','dist/presentation/public'],{env,stdio:'inherit'});
if(vite.status!==0)process.exit(vite.status??1);
require('esbuild').buildSync({entryPoints:['server.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'dist/presentation/server/server.cjs',logLevel:'info'});
