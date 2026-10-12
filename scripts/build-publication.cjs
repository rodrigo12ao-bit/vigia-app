const {spawnSync}=require('node:child_process');
const env={...process.env,VITE_FIREBASE_MODE:'cloud',PUPPETEER_SKIP_DOWNLOAD:'true'};
for(const [entry,args] of [
 ['node_modules/vite/bin/vite.js',['build','--mode','publication','--outDir','dist/publication/public']],
 ['node_modules/esbuild/bin/esbuild',['server.ts','--bundle','--platform=node','--format=cjs','--packages=external','--outfile=dist/publication/server/server.cjs']]
]){const r=spawnSync(process.execPath,[entry,...args],{env,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
