const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { transformSync } = require('esbuild');
require('../scripts/register-test-typescript.cjs');
const motionPreference = require('../src/lib/avatarAnimation.ts');

function withWindow(value, action) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
  try { return action(); }
  finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  }
}

class MediaPreference extends EventTarget {
  matches = false;
  installed = 0;
  removed = 0;
  addEventListener(type, listener) { this.installed++; super.addEventListener(type, listener); }
  removeEventListener(type, listener) { this.removed++; super.removeEventListener(type, listener); }
  change(matches) { this.matches = matches; this.dispatchEvent(new Event('change')); }
}

test('reduced-motion subscription follows changes and releases its actual media-query listener', () => {
  const media = new MediaPreference(), observed = [];
  withWindow({ matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; } }, () => {
    assert.equal(motionPreference.avatarPrefersReducedMotion(), false);
    const cleanup = motionPreference.bindAvatarReducedMotion(value => observed.push(value));
    media.change(true); media.change(false);
    assert.deepEqual(observed, [false, true, false]);
    assert.equal(media.installed, 1);
    cleanup();
    media.change(true);
    assert.deepEqual(observed, [false, true, false], 'Unmounted avatars receive no more updates.');
    assert.equal(media.removed, 1);
  });
});

test('legacy Safari listeners, missing browser APIs and unavailable media queries remain safe', () => {
  const listeners = new Set(), media = {
    matches: true,
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
  };
  withWindow({ matchMedia: () => media }, () => {
    const observed = [], cleanup = motionPreference.bindAvatarReducedMotion(value => observed.push(value));
    media.matches = false; for (const listener of listeners) listener();
    assert.deepEqual(observed, [true, false]);
    cleanup(); assert.equal(listeners.size, 0);
  });
  for (const browser of [undefined, {}, { matchMedia() { throw Error('Unavailable API'); } }]) {
    withWindow(browser, () => {
      const observed = [];
      assert.equal(motionPreference.avatarPrefersReducedMotion(), false);
      const cleanup = motionPreference.bindAvatarReducedMotion(value => observed.push(value));
      assert.deepEqual(observed, [false]); cleanup();
    });
  }
});

// Render the actual component's event lifecycle through minimal React ports.
// WebGL drawing is covered by the browser regression; here the same mounted
// component must change its frame scheduling and clean up the device listener.
test('an already mounted avatar switches its Canvas to demand rendering without reinstalling the listener', () => {
  const media = new MediaPreference();
  withWindow({ matchMedia: () => media }, () => {
    const states = [], effects = [];
    let stateIndex, effectIndex, pending;
    const jsx = (type, props) => ({ type, props: props || {} });
    const React = {
      memo: component => component,
      Suspense: 'suspense',
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
      },
      useEffect(action, dependencies) {
        const index = effectIndex++, previous = effects[index];
        if (!previous || dependencies.some((value, position) => value !== previous.dependencies[position])) {
          pending.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: action() }; });
        }
      },
    };
    const deps = {
      react: React,
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
      '@react-three/fiber': { Canvas: 'canvas-fixture' },
      '@react-three/drei': {},
      'motion/react': { motion: new Proxy({}, { get: (_target, key) => key }) },
      'three/examples/jsm/utils/SkeletonUtils.js': {},
      '../lib/avatarAnimation': motionPreference,
      three: {},
    };
    const module = { exports: {} };
    const source = transformSync(readFileSync('src/components/Avatar3D.tsx', 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
    new Function('require', 'module', 'exports', source)(name => { assert.ok(name in deps, 'Unexpected import ' + name); return deps[name]; }, module, module.exports);
    const render = () => {
      stateIndex = 0; effectIndex = 0; pending = [];
      const tree = module.exports.AvatarComponent({ showSubtitle: false });
      for (const run of pending) run();
      return tree.props.children.find(child => child?.type === 'canvas-fixture');
    };
    assert.equal(render().props.frameloop, 'always');
    media.change(true);
    assert.equal(render().props.frameloop, 'demand', 'The mounted avatar freezes as soon as the device requests it.');
    media.change(false);
    assert.equal(render().props.frameloop, 'always', 'Movement resumes when the preference changes back.');
    assert.equal(media.installed, 1, 'A component rerender does not create duplicate listeners.');
    for (const effect of effects) effect.cleanup?.();
    assert.equal(media.removed, 1);
  });
});
