const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {reviewEnvironment} = require('./review-local.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (!args.length) {
  console.error('Uso: node scripts/with-review-services.cjs <script-node> [argumentos]');
  process.exit(1);
}
const directory = path.join(root, 'artifacts', 'review-20261123');
fs.mkdirSync(directory, {recursive:true});
const runId = Date.now().toString();
const env = reviewEnvironment({...process.env, PORT:'3000'});
const children = [];
const logs = [];
let shuttingDown = false;
let shutdownPromise;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({host:'127.0.0.1', port});
    let finished = false;
    const finish = value => { if (!finished) { finished = true; socket.destroy(); resolve(value); } };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
function service(label, script) {
  const logPath = path.join(directory, `${runId}-${label}.log`);
  const log = fs.createWriteStream(logPath);
  logs.push(log);
  const child = spawn(process.execPath, [script], {cwd:root, env, stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log, {end:false});
  child.stderr.pipe(log, {end:false});
  child.on('error', error => { child.startError = error; });
  children.push(child);
  return {child, logPath};
}
async function ready(check, label, record) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (shuttingDown) throw new Error('Revisão local interrompida.');
    if (record.child.startError) throw record.child.startError;
    if (record.child.exitCode !== null || record.child.signalCode !== null) {
      throw new Error(`${label} encerrou antes de ficar disponível; confira ${path.relative(root, record.logPath)}.`);
    }
    try { if (await check()) return; } catch { /* Retry only during bounded local startup. */ }
    await pause(200);
  }
  throw new Error(`${label} não iniciou em 60 segundos; confira ${path.relative(root, record.logPath)}.`);
}
function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    for (const child of [...children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill('SIGINT');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(5000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await Promise.all(logs.map(log => new Promise(resolve => log.end(resolve))));
  })();
  return shutdownPromise;
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => {
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  void shutdown();
});

(async () => {
  try {
    for (const port of [3000,8080,9099]) {
      if (await portOpen(port)) throw new Error(`A porta local ${port} já está ocupada. Encerre a sua instância de teste antes de iniciar outra.`);
    }
    const emulator = service('emulators', 'scripts/emulators.cjs');
    await ready(async () => (await portOpen(8080)) && (await portOpen(9099)), 'Firebase local', emulator);
    if (shuttingDown) throw new Error('Revisão local interrompida.');
    const app = service('app', 'scripts/review-local.cjs');
    await ready(async () => {
      const response = await fetch('http://127.0.0.1:3000/api/status', {signal:AbortSignal.timeout(1500)});
      if (!response.ok) return false;
      const state = await response.json();
      return state.demo === true && state.localDemo === true && state.realAI === false
        && state.firebase === 'emulator' && state.audience === '18plus';
    }, 'Vigia local 18+', app);
    if (shuttingDown) throw new Error('Revisão local interrompida.');
    console.log('Auth, Firestore e API locais prontos. Executando: node '+args.join(' '));
    const test = spawn(process.execPath, args, {cwd:root, env, stdio:'inherit'});
    children.push(test);
    const code = await new Promise((resolve,reject) => {
      test.once('error',reject);
      test.once('exit',code => resolve(code ?? 1));
    });
    if (!shuttingDown) process.exitCode = code;
  } catch (error) {
    console.error(error.message);
    if (!shuttingDown) process.exitCode = 1;
  } finally {
    await shutdown();
  }
})();
