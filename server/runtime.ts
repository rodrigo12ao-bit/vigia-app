export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const localFirebase = /^(127\.0\.0\.1|localhost):9099$/.test(env.FIREBASE_AUTH_EMULATOR_HOST || '')
    && /^(127\.0\.0\.1|localhost):8080$/.test(env.FIRESTORE_EMULATOR_HOST || '');
  const preview = env.VIGIA_MODE === 'preview';
  const demo = env.VIGIA_MODE === 'demo' || preview;
  const cloud = env.ENABLE_CLOUD_FIREBASE === 'true' && !localFirebase;
  if (preview && (!cloud || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_DATABASE_ID))
    throw Error('A prévia completa precisa do projeto e banco Firebase online configurados.');
  if (preview && (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST || env.ALLOW_LOCAL_DEMO === 'true'))
    throw Error('Emuladores e demonstração local não podem ser publicados.');
  if (preview && env.ENABLE_REAL_AI === 'true') throw Error('A prévia online usa somente IA simulada.');
  if (env.RENDER === 'true' && !preview) throw Error('Configure VIGIA_MODE=preview para publicar a versão revisada.');
  if (env.VIGIA_MODE === 'demo' && env.NODE_ENV === 'production' && env.ALLOW_LOCAL_DEMO !== 'true')
    throw Error('Demonstração restrita ao ambiente local.');
  const source = env.ALLOWED_ORIGINS || (preview ? env.RENDER_EXTERNAL_URL : 'http://localhost:3000,http://127.0.0.1:3000');
  const origins = (source || '').split(',').map(v => v.trim()).filter(Boolean);
  if (preview && (!origins.length || origins.some(value => {
    try {const url=new URL(value);return url.protocol!=='https:' || url.origin!==value || !!url.username || !!url.password;}
    catch {return true;}
  }))) throw Error('Informe somente os endereços HTTPS autorizados para a prévia.');
  return {demo, preview, localFirebase, cloud, origins, host:env.HOST || (env.RENDER==='true'?'0.0.0.0':'127.0.0.1')};
}
