const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reviewEnvironment} = require('../scripts/review-local.cjs');
require('../scripts/register-test-typescript.cjs');
const {runtimeConfig} = require('../server/runtime.ts');
const {realAiConfig} = require('../server/realAi.ts');

test('review mode remains local and simulated despite inherited production settings', () => {
  const inherited = {
    NODE_ENV:'production', RENDER:'true', VIGIA_MODE:'adult-live',
    ENABLE_CLOUD_FIREBASE:'true', VITE_FIREBASE_MODE:'cloud',
    FIREBASE_PROJECT_ID:'production-fixture', FIREBASE_DATABASE_ID:'production-fixture',
    FIREBASE_AUTH_EMULATOR_HOST:'', FIRESTORE_EMULATOR_HOST:'',
    AI_PROVIDER:'gemini', ENABLE_REAL_AI:'true', AI_COST_AUTHORIZED:'true',
    GEMINI_API_KEY:'fixture-only', OPENAI_API_KEY:'fixture-only',
    GOOGLE_APPLICATION_CREDENTIALS:'fixture-only', HOST:'0.0.0.0', PORT:'3125',
    ALLOWED_ORIGINS:'https://production.example.invalid', DOTENV_CONFIG_OVERRIDE:'true',
  };
  const env = reviewEnvironment(inherited);
  const runtime = runtimeConfig(env);
  assert.equal(runtime.demo, true);
  assert.equal(runtime.adultAudience, true);
  assert.equal(runtime.localFirebase, true);
  assert.equal(runtime.cloud, false);
  assert.equal(runtime.adultLive, false);
  assert.equal(runtime.host, '127.0.0.1');
  assert.deepEqual(runtime.origins, ['http://localhost:3125', 'http://127.0.0.1:3125']);
  assert.equal(realAiConfig(env).enabled, false);
  for (const key of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) assert.equal(env[key], '');
  assert.equal(env.DOTENV_CONFIG_OVERRIDE, undefined);
  assert.equal(inherited.VIGIA_MODE, 'adult-live');
});

test('review mode rejects invalid ports and keeps a usable default', () => {
  assert.equal(reviewEnvironment({}).PORT, '3000');
  for (const value of ['0', '443', '-1', '65536', '3000.5', 'https://example.invalid']) {
    assert.throws(() => reviewEnvironment({PORT:value}), /porta local/);
  }
});
