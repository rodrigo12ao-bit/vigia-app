const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const javaRoot=path.join(root,'.tools/java');
const javaExecutable=process.platform==='win32'?'java.exe':'java';
const java=fs.existsSync(javaRoot)?fs.readdirSync(javaRoot).find(p=>fs.existsSync(path.join(javaRoot,p,'bin',javaExecutable))):null;
const windowsSocketOption=process.platform==='win32'?' -Djdk.net.unixdomain.tmpdir=C:/vigia-unused-socket-directory':'';
const env={...process.env,...(java?{JAVA_HOME:path.join(javaRoot,java),PATH:path.join(javaRoot,java,'bin')+path.delimiter+process.env.PATH}:{}),JAVA_TOOL_OPTIONS:(process.env.JAVA_TOOL_OPTIONS||'')+' -Duser.language=en -Duser.country=US'+windowsSocketOption,FIREBASE_EMULATORS_PATH:path.join(root,'.tools/emulators')};
const local=path.join(root,'.tools/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js');
if(!fs.existsSync(local)){console.error('Instale a ferramenta local com: npm install --prefix .tools/firebase-cli --no-save firebase-tools@15.33.0 --ignore-scripts');process.exit(1);}
const child=spawn(process.execPath,[local,'emulators:start','--project','demo-vigia','--only','auth,firestore'],{env,stdio:'inherit',cwd:root});
child.on('error',error=>{console.error('Não foi possível iniciar os emuladores:',error.message);process.exitCode=1;});
child.on('exit',code=>process.exit(code??1));process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
