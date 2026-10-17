const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let THREE, gltf, document;
before(async () => {
  THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const bytes = fs.readFileSync(path.resolve(__dirname, '../public/model/vigia-original.glb'));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'valid GLB header');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'complete file');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
});

test('the delivered avatar loads without external files and stays small', () => {
  assert.ok(!document.buffers.some(buffer => buffer.uri));
  assert.ok(!(document.images || []).some(image => image.uri));
  assert.ok(fs.statSync(path.resolve(__dirname, '../public/model/vigia-original.glb')).size < 1500000);
  const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  assert.ok(size.y > 1.7 && size.y < 2.2, 'human scale in metres');
  let triangles = 0;
  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    const positions = node.geometry.getAttribute('position');
    assert.ok(Array.from(positions.array).every(Number.isFinite), 'finite mesh coordinates');
    triangles += (node.geometry.index?.count || positions.count) / 3;
  });
  assert.ok(triangles > 1000 && triangles < 25000);
});

test('each embedded gesture animates the loaded character and loops seamlessly', () => {
  assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), ['Idle', 'Happy', 'Alert', 'LookAround', 'Sad'].sort());
  const snapshot = scene => {
    const values = [];
    scene.traverse(node => { if (!node.isMesh) values.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()); });
    return values;
  };
  for (const clip of gltf.animations) {
    const copy = gltf.scene.clone(true), mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(clip).play();
    mixer.setTime(0.1);
    const start = snapshot(copy);
    mixer.setTime(1);
    assert.notDeepEqual(snapshot(copy), start, clip.name + ' must move actual scene nodes');
    for (const track of clip.tracks) {
      const width = track.getValueSize();
      assert.deepEqual(Array.from(track.values.slice(0, width)), Array.from(track.values.slice(-width)), track.name + ' returns to its starting pose');
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(copy);
  }
});
