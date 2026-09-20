import { MODEL_META, textureSideForCount } from './model-library.js';
import { GpuParticleSimulation, detectGpuSimulation } from './gpu-simulation.js';
import { CompatParticleSimulation } from './compat-simulation.js';
import { GestureController } from './gesture-controller.js';
import { UiController } from './ui-controller.js';

const THREE = window.THREE;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function setupLogin() {
  const gate = document.getElementById('loginGate');
  const form = document.getElementById('loginForm');
  const error = document.getElementById('loginError');
  async function digest(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  if (sessionStorage.getItem('gestura-access') === 'ok') gate.classList.add('done');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('loginPass').value;
    if (await digest(password) === 'e485f271f7db87ad8888f40c7b00412cc0c97c9bbf35790e7ba85e08ff602860') {
      sessionStorage.setItem('gestura-access', 'ok');
      gate.classList.add('done');
    } else error.textContent = '密码不正确，请重试。';
  });
}

function createStarfield(scene, mobile) {
  const count = mobile ? 1700 : 3200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 12 + Math.random() * 31;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const color = new THREE.Color().setHSL(0.54 + Math.random() * 0.2, 0.72, 0.52 + Math.random() * 0.32);
    colors.set([color.r, color.g, color.b], index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: mobile ? 0.025 : 0.021, vertexColors: true, transparent: true, opacity: 0.84, blending: THREE.AdditiveBlending, depthWrite: false });
  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
  return stars;
}

setupLogin();

const mobile = matchMedia('(pointer:coarse)').matches && (navigator.maxTouchPoints > 0 || Math.min(innerWidth, innerHeight) < 900);
const forceCompat = new URLSearchParams(location.search).has('compat');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x03030a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03030a, 0.034);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6.3);
const stars = createStarfield(scene, mobile);

let activeModel = 'saturn';
let simulation;
let simulationMode = 'compat';
let requestedCount = mobile ? 16384 : 36864;
let baseHue = 0.53;
let glow = 0.92;
let pointSize = mobile ? 0.084 : 0.074;
let gestureActive = false;
let pointerDown = false;
let lastHandSeen = 0;

const runtime = {
  time: 0,
  scale: 1.28,
  targetScale: 1.28,
  attraction: 0.052,
  damping: 0.91,
  rotationX: 0,
  rotationY: 0,
  targetRotationX: 0,
  targetRotationY: 0,
  hand: new THREE.Vector3(99, 99, 0),
  handVelocity: new THREE.Vector2(),
  handStrength: 0,
  burstOrigin: new THREE.Vector3(),
  burst: 0
};

let gestureController;
const ui = new UiController({
  mobile,
  onModel: model => {
    activeModel = model;
    simulation.setModel(model);
  },
  onDensity: count => rebuildSimulation(count),
  onColor: value => {
    const color = new THREE.Color(value);
    const hsl = {};
    color.getHSL(hsl);
    baseHue = hsl.h;
    updateVisuals();
  },
  onGlow: value => {
    glow = value;
    updateVisuals();
  },
  onCamera: () => gestureController.start()
});

function updateVisuals() {
  simulation?.setVisuals({ hue: baseHue, glow, pointSize });
}

function createSimulation(count) {
  const capability = detectGpuSimulation(renderer);
  if (!forceCompat && capability.supported) {
    try {
      const side = textureSideForCount(count, mobile);
      simulationMode = 'gpu';
      return new GpuParticleSimulation({ renderer, scene, side, model: activeModel });
    } catch (error) {
      console.warn('GPU simulation initialization failed; switching to compatibility mode.', error);
    }
  }
  simulationMode = 'compat';
  const fallbackCount = Math.min(count, mobile ? 7000 : 14000);
  return new CompatParticleSimulation({ scene, count: fallbackCount, model: activeModel });
}

function rebuildSimulation(count) {
  requestedCount = count;
  simulation?.dispose();
  simulation = createSimulation(count);
  updateVisuals();
  ui.setMode(simulationMode, simulation.count);
  ui.setSystemStatus(simulationMode === 'gpu' ? 'GPU 粒子引擎就绪' : '兼容粒子模式');
}

ui.setDensityRange({ min: mobile ? 9216 : 16384, max: mobile ? 25600 : 65536, value: requestedCount });
rebuildSimulation(requestedCount);

function modelRotationLimit() {
  return MODEL_META.find(model => model.id === activeModel)?.rotationLimit ?? 1;
}

function screenToWorld(x, y) {
  return { x: (x - 0.5) * 5.4, y: -(y - 0.5) * 3.5 };
}

function handleGesture(event) {
  if (!event.active) {
    gestureActive = false;
    return;
  }
  gestureActive = true;
  lastHandSeen = performance.now();
  runtime.targetScale = 0.22 + clamp(event.openness, 0, 1) * 1.28;
  const world = screenToWorld(event.x, event.y);
  runtime.hand.set(world.x, world.y, 0);
  runtime.handVelocity.set(event.velocityX * 0.36, -event.velocityY * 0.36);
  if (event.type === 'victory') {
    const limit = modelRotationLimit();
    runtime.targetRotationY += event.rotateY;
    runtime.targetRotationX = clamp(runtime.targetRotationX + event.rotateX, -1.05 * limit, 1.05 * limit);
    runtime.handStrength = 0.08;
  } else {
    runtime.handStrength = event.type === 'palm' ? 1 : 0.28;
  }
  if (event.burst) {
    const tip = screenToWorld(event.tipX, event.tipY);
    runtime.burstOrigin.set(tip.x, tip.y, 0);
    runtime.burst = 1.65;
    ui.pulseBurst();
  }
}

gestureController = new GestureController({
  video: document.getElementById('webcam'),
  mobile,
  onGesture: handleGesture,
  onStatus: (kind, detail) => {
    ui.setGesture(kind, detail);
    const status = { loading: '加载手势模块', searching: '正在寻找手掌', point: '食指烟花已锁定', victory: '双指旋转已锁定', closed: '手掌聚合', open: '手掌扰动', error: '手势识别不可用' };
    ui.setSystemStatus(status[kind] || '手势控制');
  }
});

stage.addEventListener('pointermove', event => {
  if (gestureActive) return;
  runtime.targetRotationY = (event.clientX / innerWidth - 0.5) * 2.7;
  runtime.targetRotationX = (event.clientY / innerHeight - 0.5) * 1.55;
});
stage.addEventListener('pointerdown', () => {
  if (gestureActive) return;
  pointerDown = true;
  runtime.targetScale = 0.22;
  ui.setGesture('closed', '松开以释放能量');
});
addEventListener('pointerup', () => {
  if (gestureActive) return;
  pointerDown = false;
  runtime.targetScale = 1.28;
  ui.setGesture('free', '移动鼠标旋转 · 按住收缩');
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 2));
  renderer.setSize(innerWidth, innerHeight);
});

document.addEventListener('visibilitychange', () => {
  clock.getDelta();
});

const clock = new THREE.Clock();
function render() {
  requestAnimationFrame(render);
  if (document.hidden) return;
  const delta = Math.min(clock.getDelta(), 0.033);
  runtime.time += delta;
  if (gestureActive && performance.now() - lastHandSeen > 850) gestureActive = false;
  if (!gestureActive && !pointerDown) {
    runtime.targetScale += (1.28 - runtime.targetScale) * 0.025;
    runtime.handStrength *= 0.9;
  }
  runtime.scale += (runtime.targetScale - runtime.scale) * Math.min(1, delta * 13.5);
  runtime.rotationX += (runtime.targetRotationX - runtime.rotationX) * Math.min(1, delta * 6.8);
  runtime.rotationY += (runtime.targetRotationY - runtime.rotationY) * Math.min(1, delta * 6.8);
  runtime.burst *= Math.exp(-delta * 3.2);
  runtime.handStrength *= Math.exp(-delta * 0.75);
  simulation.setRotation(runtime.rotationX, runtime.rotationY);
  simulation.update(delta, runtime);
  stars.rotation.y += delta * 0.009;
  stars.rotation.x += delta * 0.003;
  renderer.render(scene, camera);
}

render();
