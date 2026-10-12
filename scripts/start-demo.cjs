const {spawn}=require('node:child_process');
const env={...process.env,NODE_ENV:'production',VIGIA_MODE:'demo',ALLOW_LOCAL_DEMO:'true',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_PROJECT_ID:'demo-vigia',HOST:'127.0.0.1'};
const child=spawn(process.execPath,[...(process.allowedNodeEnvironmentFlags.has('--use-system-ca')?['--use-system-ca']:[]),'dist/server/server.cjs'],{env,stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill('SIGINT'));
