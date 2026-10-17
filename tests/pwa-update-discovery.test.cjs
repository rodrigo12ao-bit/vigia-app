const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/register-test-typescript.cjs');
const { discoverPwaUpdates } = require('../src/lib/pwaUpdates.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness({ online = true, visible = true, active = { state: 'activated' }, waiting = null, installing = null, update } = {}) {
  const window = new EventTarget(), document = new EventTarget(), registration = new EventTarget();
  document.visibilityState = visible ? 'visible' : 'hidden';
  registration.active = active;
  registration.waiting = waiting;
  registration.installing = installing;
  const states = [];
  let calls = 0, available = 0, time = 0, cancelled = false, tick;
  registration.update = async () => { calls++; return update ? update(registration) : registration; };
  const watcher = discoverPwaUpdates(registration, {
    window, document, online: () => online,
    now: () => time, onStatus: status => states.push(status), onAvailable: () => { available++; },
    repeat: callback => { tick = callback; return 'fake-interval'; },
    cancelRepeat: timer => { assert.equal(timer, 'fake-interval'); cancelled = true; },
  });
  return {
    window, document, registration, states, watcher,
    calls: () => calls, available: () => available, cancelled: () => cancelled,
    online: value => { online = value; }, advance: value => { time += value; },
    tick: () => tick(),
  };
}

test('startup discovery, focus and visible interval are throttled while manual checks are explicit', async () => {
  const h = harness();
  try {
    await flush();
    assert.equal(h.calls(), 1);
    assert.equal(h.states.at(-1), 'current');
    h.window.dispatchEvent(new Event('focus')); h.tick();
    await flush(); assert.equal(h.calls(), 1);
    h.advance(60001); h.window.dispatchEvent(new Event('focus'));
    await flush(); assert.equal(h.calls(), 2);
    await h.watcher.check(true); assert.equal(h.calls(), 3);
  } finally { h.watcher.dispose(); }
});

test('hidden applications make no periodic request and resume discovery when visible', async () => {
  const h = harness({ visible: false });
  try {
    await flush(); h.tick(); await flush(); assert.equal(h.calls(), 0);
    h.document.visibilityState = 'visible'; h.document.dispatchEvent(new Event('visibilitychange'));
    await flush(); assert.equal(h.calls(), 1);
    h.document.visibilityState = 'hidden'; h.advance(60001); h.tick();
    await flush(); assert.equal(h.calls(), 1);
  } finally { h.watcher.dispose(); }
});

test('offline checks preserve the current application and check when the network returns', async () => {
  const h = harness({ online: false });
  try {
    await flush(); assert.equal(h.calls(), 0); assert.equal(h.states.at(-1), 'offline');
    h.online(true); h.window.dispatchEvent(new Event('online'));
    await flush(); assert.equal(h.calls(), 1); assert.equal(h.states.at(-1), 'current');
  } finally { h.watcher.dispose(); }
});

test('an existing waiting worker remains discoverable after its notice was dismissed', async () => {
  const h = harness({ waiting: { state: 'installed' } });
  try {
    await flush(); const initial = h.available();
    assert.equal(h.calls(), 0); assert.equal(h.states.at(-1), 'available');
    h.window.dispatchEvent(new Event('focus'));
    assert.ok(h.available() > initial);
    const beforeManual = h.available(); await h.watcher.check(true);
    assert.ok(h.available() > beforeManual); assert.equal(h.calls(), 0);
  } finally { h.watcher.dispose(); }
});

test('first installation keeps watching through transient waiting without announcing an update', async () => {
  const worker = new EventTarget(); worker.state = 'installing';
  const h = harness({ active: null, installing: worker });
  try {
    await flush(); assert.equal(h.calls(), 0); assert.equal(h.available(), 0);
    h.registration.waiting = worker; h.registration.installing = null; worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange')); await flush();
    assert.equal(h.available(), 0); assert.equal(h.states.at(-1), 'checking');
    h.registration.waiting = null; h.registration.active = worker; worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange')); await flush();
    assert.equal(h.available(), 0); assert.equal(h.states.at(-1), 'current');

    // A later worker for this same registration is a genuine update.
    const next = new EventTarget(); next.state = 'installing';
    h.registration.installing = next; h.registration.dispatchEvent(new Event('updatefound'));
    h.registration.waiting = next; h.registration.installing = null; next.state = 'installed';
    next.dispatchEvent(new Event('statechange')); await flush();
    assert.ok(h.available() > 0); assert.equal(h.states.at(-1), 'available');
  } finally { h.watcher.dispose(); }
});

test('concurrent checks share the request and installation completion announces the update', async () => {
  const request = deferred();
  const h = harness({ update: () => request.promise });
  try {
    const first = h.watcher.check(true), second = h.watcher.check(true);
    assert.equal(first, second); assert.equal(h.calls(), 1);
    const worker = new EventTarget(); worker.state = 'installing';
    h.registration.installing = worker; h.registration.dispatchEvent(new Event('updatefound'));
    request.resolve(h.registration); await first;
    assert.equal(h.states.at(-1), 'checking'); assert.equal(h.available(), 0);
    h.registration.waiting = worker; h.registration.installing = null; worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange')); await flush();
    assert.equal(h.states.at(-1), 'available'); assert.ok(h.available() > 0);
  } finally { h.watcher.dispose(); }
});

test('cleanup removes discovery listeners and suppresses a delayed response', async () => {
  const request = deferred(), h = harness({ update: () => request.promise });
  const before = [...h.states]; h.watcher.dispose();
  assert.equal(h.cancelled(), true);
  request.resolve(h.registration); await flush();
  h.advance(60001); h.window.dispatchEvent(new Event('focus')); h.window.dispatchEvent(new Event('online'));
  h.document.dispatchEvent(new Event('visibilitychange')); h.tick(); await flush();
  assert.equal(h.calls(), 1); assert.deepEqual(h.states, before);
});

test('a failed network check allows an explicit retry without activating or reloading', async () => {
  let fail = true;
  const h = harness({ update: registration => { if (fail) throw Error('Synthetic transport failure'); return registration; } });
  try {
    await flush(); assert.equal(h.states.at(-1), 'error');
    fail = false; await h.watcher.check(true);
    assert.equal(h.calls(), 2); assert.equal(h.states.at(-1), 'current'); assert.equal(h.available(), 0);
  } finally { h.watcher.dispose(); }
});
