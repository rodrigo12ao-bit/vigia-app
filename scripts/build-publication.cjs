const {spawnSync}=require('node:child_process');
const env={...process.env,VITE_FIREBASE_MODE:'cloud',VITE_AUDIENCE:'18plus',PUPPETEER_SKIP_DOWNLOAD:'true'};
const vite=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','publication','--outDir','dist/publication/public'],{env,stdio:'inherit'});
if(vite.status!==0)process.exit(vite.status??1);
// The package API selects the native executable for Windows or Linux.
require('esbuild').buildSync({entryPoints:['server.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'dist/publication/server/server.cjs',logLevel:'info'});
// Written outside public only after both build steps succeeded. Startup verifies
// these exact files and the hosting revision before reading private credentials.
const {writeRelease,releaseSummary}=require('./publication-assets.cjs');
console.log(releaseSummary(writeRelease()));
