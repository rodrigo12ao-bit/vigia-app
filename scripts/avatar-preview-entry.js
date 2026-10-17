import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const embeddedModel = __AVATAR_GLB_BASE64__;
const assetName = __AVATAR_ASSET_NAME__;
const container = document.getElementById('stage');
const status = document.getElementById('status');
const modeTitle = document.getElementById('mode-title');
const modeDescription = document.getElementById('mode-description');
const modeInfo = {
  idle: ['Idle', 'Pronto para conversar', 'Um companheiro atento, com movimentos suaves de repouso.'],
  speaking: ['Happy', 'Conversando', 'Gestos de fala. Esta prévia não sincroniza a boca com áudio.'],
  listening: ['Alert', 'Ouvindo com atenção', 'Uma postura acolhedora para acompanhar a conversa.'],
  thinking: ['LookAround', 'Pensando', 'Um pequeno movimento de cabeça enquanto organiza as ideias.'],
  sad: ['Sad', 'Acolhendo', 'Uma expressão mais tranquila para momentos de cuidado.'],
};
let renderer, scene, camera, controls, model, mixer, ground;
let activeAction, activeMode = 'idle', running = true, readyState = false;
let activeFraming = 'bust', activeView = 'three-quarter';
const frameBoxes = {};
let lastTime = performance.now();
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
// Keep rejection observable through the API without creating a browser unhandled rejection.
ready.catch(() => {});

function decodeModel() {
  const binary = atob(embeddedModel);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function resize() {
  if (!renderer) return;
  const { width, height } = container.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (readyState) fitCamera();
  renderer.render(scene, camera);
}

function setView(view = 'front') {
  if (!camera) return;
  activeView = view;
  fitCamera();
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

function fitCamera() {
  const box = frameBoxes[activeFraming];
  if (!camera || !box) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const angle = activeView === 'three-quarter' ? Math.PI / 6 : 0;
  const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const projectedWidth = size.x * Math.cos(angle) + size.z * Math.sin(angle);
  const projectedDepth = size.z * Math.cos(angle) + size.x * Math.sin(angle);
  const distance = (Math.max(size.y / (2 * verticalTangent), projectedWidth / (2 * verticalTangent * camera.aspect)) + projectedDepth / 2) * 1.10;
  const direction = new THREE.Vector3(Math.sin(angle), 0.04, Math.cos(angle)).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  controls.minDistance = Math.max(0.55, distance * 0.62);
  controls.maxDistance = distance * 3.0;
  controls.update();
}

function setFraming(framing = 'bust') {
  if (!['bust', 'head', 'full'].includes(framing)) throw new Error('Enquadramento desconhecido.');
  activeFraming = framing;
  renderer.clippingPlanes = framing === 'full' || !frameBoxes[framing]
    ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), -frameBoxes[framing].min.y)];
  document.querySelectorAll('[data-framing]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.framing === framing)));
  fitCamera();
}

function setMode(mode = 'idle', immediate = false) {
  if (!modeInfo[mode]) throw new Error('Modo de animação desconhecido.');
  const [clipName, title, description] = modeInfo[mode];
  activeMode = mode;
  modeTitle.textContent = title;
  modeDescription.textContent = description;
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  if (!mixer || !model) return;
  const clip = model.animations.find(animation => animation.name === clipName) || model.animations[0];
  if (!clip) return;
  const next = mixer.clipAction(clip);
  if (next === activeAction) return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  if (activeAction) {
    if (immediate) activeAction.stop();
    else next.crossFadeFrom(activeAction, 0.35, false);
  }
  activeAction = next;
  renderer.render(scene, camera);
}

function diagnostics() {
  if (!readyState) return { ready: false };
  const joints = [];
  model.scene.traverse(node => {
    if (node.isBone || /Head|Neck|Shoulder|Arm|Elbow|Wrist|Root|Hip|Leg|Hand/i.test(node.name)) {
      joints.push({ name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray() });
    }
  });
  return {
    ready: true,
    mode: activeMode,
    framing: activeFraming,
    clip: activeAction?.getClip().name,
    clips: model.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
    joints,
    renderer: { width: renderer.domElement.width, height: renderer.domElement.height },
    bytes: __AVATAR_GLB_BYTES__,
  };
}

function capturePNG({ width = 1200, height = 1200, transparent = true, view = 'three-quarter', framing = 'bust' } = {}) {
  if (!readyState) throw new Error('Aguarde o avatar terminar de carregar.');
  const oldPosition = camera.position.clone();
  const oldTarget = controls.target.clone();
  const oldAspect = camera.aspect;
  const oldPixelRatio = renderer.getPixelRatio();
  const oldSize = renderer.getSize(new THREE.Vector2());
  const oldBackground = scene.background;
  const oldGround = ground.visible;
  const oldView = activeView, oldFraming = activeFraming;
  try {
    scene.background = transparent ? null : oldBackground;
    ground.visible = !transparent;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    setFraming(framing);
    setView(view);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    scene.background = oldBackground;
    ground.visible = oldGround;
    setFraming(oldFraming);
    setView(oldView);
    camera.position.copy(oldPosition);
    controls.target.copy(oldTarget);
    camera.aspect = oldAspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(oldPixelRatio);
    renderer.setSize(oldSize.x, oldSize.y, false);
    controls.update();
    renderer.render(scene, camera);
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

window.avatarPreview = {
  ready, setMode, setView, setFraming, diagnostics, capturePNG,
  pause() { running = false; document.getElementById('pause').textContent = 'Retomar movimento'; },
  play() { running = true; lastTime = performance.now(); document.getElementById('pause').textContent = 'Pausar movimento'; },
  advance(seconds) {
    if (!mixer) return;
    mixer.update(seconds);
    renderer.render(scene, camera);
    return diagnostics();
  },
};

async function start() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f4f5f7');
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Avatar Vigia em três dimensões. Arraste para girar e use a roda do mouse ou dois dedos para aproximar.');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 4.8;
  controls.maxDistance = 13;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.maxPolarAngle = Math.PI * 0.66;
  controls.autoRotateSpeed = 1.0;
  scene.add(new THREE.HemisphereLight('#eef4ff', '#a8a1ae', 2.6));
  const key = new THREE.DirectionalLight('#fff7ed', 4.5);
  key.position.set(4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -4;
  key.shadow.camera.right = key.shadow.camera.top = 4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.normalBias = 0.04;
  key.shadow.bias = -0.0003;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b3d3ff', 2.0);
  rim.position.set(-4, 4, -4);
  scene.add(rim);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  ground.receiveShadow = true;
  scene.add(ground);
  model = await new GLTFLoader().parseAsync(decodeModel().buffer, '');
  const bounds = new THREE.Box3().setFromObject(model.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 3.5 / Math.max(size.y, 0.001);
  const placement = new THREE.Group();
  placement.scale.setScalar(scale);
  placement.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  placement.add(model.scene);
  scene.add(placement);
  placement.updateWorldMatrix(true, true);
  frameBoxes.full = new THREE.Box3().setFromObject(model.scene);
  frameBoxes.bust = new THREE.Box3().setFromObject(model.scene.getObjectByName('Spine') || model.scene);
  frameBoxes.head = new THREE.Box3().setFromObject(model.scene.getObjectByName('Head') || model.scene);
  // Hands may hang below the coat: use a fixed torso cutoff, then clip the
  // lower body so a narrow screen or zoom-out cannot reveal legs in bust mode.
  frameBoxes.bust.min.y = frameBoxes.full.min.y + frameBoxes.full.getSize(new THREE.Vector3()).y * 0.535;
  model.scene.traverse(node => {
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
  });
  mixer = new THREE.AnimationMixer(model.scene);
  readyState = true;
  setFraming('bust');
  setView('three-quarter');
  setMode('idle');
  resize();
  new ResizeObserver(resize).observe(container);
  status.textContent = 'Avatar original · 3D animado';
  status.classList.add('loaded');
  document.body.classList.add('ready');
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-framing]').forEach(button => button.addEventListener('click', () => setFraming(button.dataset.framing)));
  document.getElementById('spin').addEventListener('click', event => {
    controls.autoRotate = !controls.autoRotate;
    event.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
  });
  document.getElementById('pause').addEventListener('click', () => running ? window.avatarPreview.pause() : window.avatarPreview.play());
  document.getElementById('download-glb').addEventListener('click', () => download(new Blob([decodeModel()], { type: 'model/gltf-binary' }), assetName + '.glb'));
  document.getElementById('download-png').addEventListener('click', () => {
    const data = capturePNG({ framing: activeFraming });
    fetch(data).then(response => response.blob()).then(blob => download(blob, assetName + '.png'));
  });
  resolveReady(diagnostics());
  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    if (running) mixer.update(delta);
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

start().catch(error => {
  status.textContent = 'Não foi possível mostrar o avatar neste navegador.';
  modeTitle.textContent = 'Abra esta prévia em um navegador com suporte a 3D';
  modeDescription.textContent = 'O arquivo do avatar continua disponível na pasta public/model do projeto.';
  console.error('Avatar preview:', error);
  rejectReady(error);
});
