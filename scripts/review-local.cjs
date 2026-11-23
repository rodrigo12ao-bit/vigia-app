const path = require('node:path');
const {spawn} = require('node:child_process');

// A reproducible adult review mode. The existing demo command keeps its
// historical audience; this command deliberately uses only local test services.
function reviewEnvironment(environment = process.env) {
  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT precisa ser uma porta local entre 1024 e 65535.');
  }
  const env = {
    ...environment,
    NODE_ENV: 'development',
    RENDER: 'false',
    VIGIA_MODE: 'demo',
    ALLOW_LOCAL_DEMO: 'true',
    AI_AUDIENCE: '18plus',
    VITE_AUDIENCE: '18plus',
    ENABLE_REAL_AI: 'false',
    AI_COST_AUTHORIZED: 'false',
    AI_PROVIDER: 'disabled',
    ENABLE_CLOUD_FIREBASE: 'false',
    VITE_FIREBASE_MODE: 'emulator',
    VITE_API_ORIGIN: '',
    VITE_VOICE_ORIGIN: '',
    FIREBASE_PROJECT_ID: 'demo-vigia',
    FIREBASE_DATABASE_ID: '(default)',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    HOST: '127.0.0.1',
    PORT: String(port),
    ALLOWED_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`,
  };
  // dotenv may fill missing values, but must never replace these local choices.
  delete env.DOTENV_CONFIG_OVERRIDE;
  return env;
}

function startReview({environment = process.env, spawnProcess = spawn} = {}) {
  const env = reviewEnvironment(environment);
  console.log(`Revisão local 18+ em http://localhost:${env.PORT}; IA simulada e Firebase emulado.`);
  const child = spawnProcess(process.execPath, [
    ...(process.allowedNodeEnvironmentFlags.has('--use-system-ca') ? ['--use-system-ca'] : []),
    '--import', 'tsx', 'server.ts',
  ], {cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit'});
  child.on('error', error => {
    console.error('Não foi possível iniciar a revisão:', error.message);
    process.exitCode = 1;
  });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  return child;
}

module.exports = {reviewEnvironment, startReview};
if (require.main === module) {
  try { startReview(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
