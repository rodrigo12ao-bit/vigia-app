const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/register-test-typescript.cjs');
const { avatarCameraFrame, avatarModelPath, avatarMouthScale, avatarPreviewPath, avatarStaticPoseTime, bindAvatarContextLoss, canAnimateAvatar, isAvatarMouthTrack, resolveAvatarState, selectAvatarAnimation } = require('../src/lib/avatarAnimation.ts');

const clips = ['Idle', 'Happy', 'Alert', 'LookAround', 'Sad'];

test('audio activity takes priority over a stale conversational state', () => {
  assert.equal(resolveAvatarState('idle', true, false), 'speaking');
  assert.equal(resolveAvatarState('thinking', false, true), 'listening');
  assert.equal(resolveAvatarState('listening', true, true), 'speaking');
  assert.equal(resolveAvatarState('alert', false, false), 'alert');
});

test('conversation states select the original character animations', () => {
  const expected = {
    idle: 'Idle', speaking: 'Happy', explaining: 'Happy', celebrating: 'Happy',
    listening: 'Alert', asking: 'Alert', alert: 'Alert', thinking: 'LookAround',
    serious: 'Sad', closing: 'Idle',
  };
  for (const [state, animation] of Object.entries(expected)) {
    assert.equal(selectAvatarAnimation(state, clips), animation, state);
  }
  assert.equal(selectAvatarAnimation('idle', clips, 'sad'), 'Sad');
});

test('other imported characters use idle before an arbitrary fallback clip', () => {
  assert.equal(selectAvatarAnimation('speaking', ['Walk', 'idle']), 'idle');
  assert.equal(selectAvatarAnimation('speaking', ['HAPPY', 'idle']), 'HAPPY');
  assert.equal(selectAvatarAnimation('listening', ['Breathing']), 'Breathing');
  assert.equal(selectAvatarAnimation('idle', []), undefined);
});

test('both tutors use original human models, head previews in small spaces and bust previews elsewhere', () => {
  assert.equal(avatarModelPath(), '/model/vigia-original.glb');
  assert.equal(avatarPreviewPath('female'), '/model/vigia-original-preview.png');
  assert.equal(avatarPreviewPath('female', 'sm'), '/model/vigia-original-head.png');
  assert.equal(avatarPreviewPath('female', 'lg'), '/model/vigia-original-preview.png');
  assert.equal(avatarModelPath('male'), '/model/vigia-original-male.glb');
  assert.equal(avatarPreviewPath('male'), '/model/vigia-original-male-preview.png');
  assert.equal(avatarPreviewPath('male', 'sm'), '/model/vigia-original-male-head.png');
});

test('automatic movement is limited to conversation canvases, preserving inexpensive avatar lists', () => {
  assert.equal(canAnimateAvatar(), true);
  assert.equal(canAnimateAvatar('lg'), true);
  assert.equal(canAnimateAvatar('md'), true);
  assert.equal(canAnimateAvatar('sm'), false);
  assert.equal(canAnimateAvatar('sm', true), true);
  assert.equal(canAnimateAvatar('lg', false), false);
  assert.equal(canAnimateAvatar('sm', false), false);
});

test('mouth cadence runs only during playback and honors reduced motion immediately', () => {
  const silent = [], speaking = [];
  for (let index = 0; index < 240; index++) {
    const seconds = index / 60;
    silent.push(avatarMouthScale(seconds, false));
    speaking.push(avatarMouthScale(seconds, true));
    assert.equal(avatarMouthScale(seconds, true, true), 1);
  }
  assert.ok(silent.every(value => value === 1));
  assert.ok(Math.max(...speaking) > 3, 'Playback opens the actual mouth noticeably.');
  assert.ok(speaking.filter(value => value === 1).length > 40, 'Syllables contain repeated closed-mouth intervals.');
  assert.ok(speaking.every(value => value >= 1 && value <= 3.7));
  assert.equal(avatarMouthScale(NaN, true), 1);
  assert.equal(avatarMouthScale(Infinity, true), 1);
  assert.equal(avatarMouthScale(0.02, false), 1, 'Cancellation or mute closes it without waiting for the gesture to finish.');
});

test('mouth playback overrides gestures on each real tutor without moving their shared model cache', async () => {
  const { readFileSync } = require('node:fs');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  for (const gender of ['female', 'male']) {
    const bytes = readFileSync('public' + avatarModelPath(gender));
    const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const copy = model.scene.clone(true), mouth = copy.getObjectByName('Mouth');
    assert.ok(mouth);
    const clip = model.animations.find(value => value.name === 'Happy').clone();
    assert.ok(clip.tracks.some(track => isAvatarMouthTrack(track.name)));
    clip.tracks = clip.tracks.filter(track => !isAvatarMouthTrack(track.name));
    const mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(clip).play();
    for (const seconds of [0.02, 0.11, 0.39, 1.2, 2.4]) {
      mixer.setTime(seconds);
      mouth.scale.y = avatarMouthScale(seconds, false);
      assert.equal(mouth.scale.y, 1, 'A happy/celebrating silent tutor must not lip-sync.');
    }
    mixer.setTime(0.04);
    mouth.scale.y = avatarMouthScale(0.04, true);
    assert.ok(mouth.scale.y > 2);
    assert.equal(model.scene.getObjectByName('Mouth').scale.y, 1, 'A second canvas starts from an unmodified cached model.');
    assert.equal(isAvatarMouthTrack('Spine.scale'), false);
    assert.equal(isAvatarMouthTrack('Head.quaternion'), false);
    mixer.stopAllAction();mixer.uncacheRoot(copy);
  }
});

test('head and bust camera frames preserve face margins on narrow and wide screens', () => {
  for (const size of ['sm', 'md', 'lg']) {
    for (const aspect of [0.4, 1, 2.5, 0, NaN]) {
      const frame = avatarCameraFrame(size, aspect);
      assert.ok(Number.isFinite(frame.distance) && frame.distance > 0);
      const field = 2 * (frame.distance - 0.38) * Math.tan(20 * Math.PI / 180);
      assert.ok(frame.targetY + field / 2 > 1.65, 'The top of the head keeps a margin.');
      assert.ok(frame.targetY - field / 2 < 0.855, 'The chin remains visible.');
      assert.equal(frame.clipY, size === 'sm' ? 0.78 : 0);
    }
  }
  assert.ok(avatarCameraFrame('lg', 0.4).distance > avatarCameraFrame('lg', 1).distance);
});

test('runtime context loss invokes the fallback, and unmount removes its listener', () => {
  const canvas = new EventTarget();
  let failures = 0;
  const cleanup = bindAvatarContextLoss(canvas, () => { failures++; });
  const event = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(failures, 1);
  cleanup();
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(failures, 1);
});

test('reduced motion samples a meaningful static pose from the actual original model', async () => {
  const { readFileSync } = require('node:fs');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const bytes = readFileSync('public/model/vigia-original.glb');
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const neck = model.scene.getObjectByName('Neck');
  assert.ok(neck);
  const rest = neck.quaternion.clone();
  const mixer = new THREE.AnimationMixer(model.scene);
  const action = mixer.clipAction(model.animations.find(clip => clip.name === 'Sad'));
  action.play();
  action.time = avatarStaticPoseTime(action.getClip().duration);
  mixer.update(0);
  action.paused = true;
  assert.ok(neck.quaternion.angleTo(rest) > 0.1, 'The static expression differs from the shared neutral opening pose.');
  const paused = neck.quaternion.clone();
  mixer.update(4);
  assert.deepEqual(neck.quaternion.toArray(), paused.toArray());
  assert.equal(avatarStaticPoseTime(NaN), 0);
  assert.equal(avatarStaticPoseTime(0), 0);
});
