import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createArchitecture } from './architecture.js';
import { createSetting } from './setting.js';
import { trackP } from './track.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const smallScreen = () => innerWidth < 760;
let quality = smallScreen() ? 'low' : 'high';
let renderer, scene, camera, architecture, setting, controls, sun, fill;
let ready = false, exploring = false, frozen = null, progress = 0, targetProgress = 0;
let frame = 0, lastTime = 0, elapsed = 0, renderingError = null, total = 1;
let chapterPositions = [], activeChapter = -1, currentNight = 0;
const sections = [...document.querySelectorAll('[data-chapter]')];
const navButtons = [...document.querySelectorAll('[data-jump]')];
const look = new THREE.Vector3();
const mouse = new THREE.Vector2(), pointer = new THREE.Vector2();
const up = new THREE.Vector3(0, 1, 0);
const startPosition = new THREE.Vector3(), startLook = new THREE.Vector3();
let transitionStart = 0;
const savedOverflow = document.documentElement.style.overflow;

// Camera positions are authored in metres, with the same building throughout.
// Angles are continuous around the disc so intermediate views remain outside it.
const shots = [
  [0.00, 24, 273, 62, 47, -32, 36],
  [0.10, 8, 244, 49, 49, -30, 35],
  [0.18, -20, 215, 69, 52, -28, 35],
  [0.27, -46, 185, 91, 57, -17, 34],
  [0.36, -9, 107, 74, 61, 46, 34],
  [0.44, 10, 88, 94, 78, 43, 34],
  [0.54, 72, 180, 108, 59, -26, 36],
  [0.63, 96, 189, 82, 53, -20, 36],
  [0.72, 147, 320, 114, 54, 48, 38],
  [0.79, 168, 335, 113, 57, 49, 38],
  [0.86, 196, 301, 83, 54, -26, 36],
  [0.93, 215, 278, 60, 51, -29, 35],
  [1.00, 224, 275, 56, 49, -29, 35],
];

function sampleCamera(p) {
  let index = shots.findIndex((key, i) => i < shots.length - 1 && p >= key[0] && p <= shots[i + 1][0]);
  if (index < 0) index = p <= 0 ? 0 : shots.length - 2;
  const a = shots[index], b = shots[index + 1];
  const t = smooth(a[0], b[0], p);
  const vals = a.slice(1).map((v, i) => THREE.MathUtils.lerp(v, b[i + 1], t));
  let [angle, distance, height, targetY, offset, fov] = vals;
  angle *= Math.PI / 180;
  if (smallScreen()) {
    distance *= 1.30;
    distance *= 1 + .06 * smooth(.285, .315, p) * (1 - smooth(.465, .495, p));
    offset = 0;
    targetY += 29;
    height += 19;
    fov = 43;
  }
  const target = new THREE.Vector3(Math.cos(angle) * offset, targetY, -Math.sin(angle) * offset);
  const position = new THREE.Vector3(Math.sin(angle) * distance, height, Math.cos(angle) * distance);
  if (!reducedMotion.matches) {
    target.x += mouse.x * 1.6;
    target.y += mouse.y * .6;
  }
  return { position, target, fov };
}

function setLoading(value, label) {
  $('load-progress').textContent = `${Math.round(value)}%`;
  $('load-status').textContent = label;
}

function fail(error) {
  renderingError = error?.message || String(error);
  console.error('[Aldar]', error);
  $('loader').hidden = true;
  $('render-error').hidden = false;
  if (renderer && renderer.getContext().isContextLost()) $('render-error').querySelector('p').textContent = 'The graphics connection was interrupted. Reload the study to restore the view.';
}
$('retry-render').addEventListener('click', () => location.reload());

function resize() {
  total = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  chapterPositions = sections.map(section => section.offsetTop / total);
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  setQuality(quality);
}

function setQuality(value) {
  quality = value;
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.needsUpdate = true;
    setting?.setQuality(quality);
  }
  $('quality-toggle').setAttribute('aria-pressed', String(quality === 'high'));
  $('quality-toggle').querySelector('span:last-child').textContent = `Quality: ${quality === 'high' ? 'high' : 'balanced'}`;
}
$('quality-toggle').addEventListener('click', () => setQuality(quality === 'high' ? 'low' : 'high'));

function chapterAt(p) {
  let index = 0;
  chapterPositions.forEach((start, i) => { if (p >= start - .008) index = i; });
  return index;
}

function updateInterface(p) {
  const index = chapterAt(p);
  if (activeChapter !== index) {
    activeChapter = index;
    const name = sections[index].dataset.chapter;
    document.body.dataset.activeChapter = name;
    $('chapter-label').textContent = `${String(index + 1).padStart(2, '0')} / ${name[0].toUpperCase() + name.slice(1)}`;
    navButtons.forEach(button => {
      if (button.dataset.jump === name) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  $('progress-fill').style.transform = `scaleX(${p})`;
  document.body.style.setProperty('--story-progress', p);
}

function jump(id) {
  if (exploring) setExplore(false);
  frozen = null;
  const section = document.getElementById(id);
  if (section) window.scrollTo({ top: Math.min(section.offsetTop, total), behavior: 'instant' });
}
navButtons.forEach(button => button.addEventListener('click', () => jump(button.dataset.jump)));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); jump('arrival'); });

function setExplore(value) {
  if (!ready) return;
  exploring = value;
  frozen = null;
  document.body.classList.toggle('is-exploring', value);
  renderer.domElement.style.touchAction = value ? 'none' : 'pan-y';
  document.documentElement.style.overflow = value ? 'hidden' : savedOverflow;
  $('story').inert = value;
  $('explore-toggle').setAttribute('aria-pressed', String(value));
  $('explore-toggle').querySelector('span').textContent = value ? 'Return to story' : 'Explore in 3D';
  if (value) {
    controls.target.copy(look);
    controls.enabled = true;
    controls.minDistance = 76;
    controls.maxDistance = 680;
    controls.maxPolarAngle = Math.PI * .49;
    controls.update();
  } else {
    controls.enabled = false;
    startPosition.copy(camera.position);
    startLook.copy(controls.target);
    transitionStart = performance.now();
    document.querySelector('#explore-toggle').focus({ preventScroll: true });
  }
}
$('explore-toggle').addEventListener('click', () => setExplore(!exploring));
$('reset-view').addEventListener('click', () => {
  camera.position.set(120, 76, 246);
  controls.target.set(0, 48, 0);
  controls.update();
});
addEventListener('keydown', event => { if (event.key === 'Escape' && exploring) setExplore(false); });
addEventListener('pointermove', event => {
  pointer.set((event.clientX / innerWidth - .5) * 2, (.5 - event.clientY / innerHeight) * 2);
}, { passive: true });
addEventListener('resize', resize, { passive: true });
addEventListener('hashchange', () => { if (location.hash) jump(location.hash.slice(1)); });

function applyScene(p, now) {
  const view = sampleCamera(p);
  if (!exploring) {
    const transition = transitionStart ? (reducedMotion.matches ? 1 : smooth(transitionStart, transitionStart + 1000, now)) : 1;
    camera.position.copy(startPosition).lerp(view.position, transition);
    look.copy(startLook).lerp(view.target, transition);
    camera.fov = view.fov;
    camera.up.copy(up);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    if (transition >= 1) transitionStart = 0;
  } else {
    controls.update();
    look.copy(controls.target);
  }
  const explode = smooth(.675, .752, p) * (1 - smooth(.80, .88, p));
  architecture.setExplode(explode);
  if (explode > .001 && explode < .999) renderer.shadowMap.needsUpdate = true;
  currentNight = smooth(.85, .97, p);
  architecture.setNight(currentNight * .30);
  sun.color.set('#fff4e5').lerp(new THREE.Color('#ffd0a2'), currentNight * .75);
  sun.intensity = THREE.MathUtils.lerp(2.8, 2.15, currentNight);
  fill.intensity = THREE.MathUtils.lerp(.68, .45, currentNight);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(.89, .83, currentNight);
  scene.backgroundIntensity = THREE.MathUtils.lerp(.9, .76, currentNight);
  setting.update(p, reducedMotion.matches || frozen !== null ? 0 : elapsed);
  updateInterface(p);
}

function render(now) {
  requestAnimationFrame(render);
  if (!ready || document.hidden || renderer.getContext().isContextLost()) { lastTime = now; return; }
  const dt = Math.min(.06, (now - (lastTime || now)) / 1000);
  lastTime = now; elapsed += dt;
  targetProgress = clamp(scrollY / total, 0, 1);
  progress = frozen !== null ? frozen : THREE.MathUtils.lerp(progress, targetProgress, reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 8));
  if (Math.abs(progress - targetProgress) < .00001 && frozen === null) progress = targetProgress;
  mouse.lerp(pointer, 1 - Math.exp(-dt * 3));
  applyScene(progress, now);
  renderer.render(scene, camera);
  if (frame++ % 30 === 0) trackP(progress);
}

async function init() {
  setLoading(5, 'Preparing the scene');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor('#dce6e8');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  $('stage').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('Graphics context interrupted')); });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c9d6d7', .00043);
  // Keep centimetre-scale paving layers distinct across the full camera path.
  camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 3, 14000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  renderer.domElement.style.touchAction = 'pan-y';
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.enablePan = false;
  controls.rotateSpeed = .6;
  controls.zoomSpeed = .75;
  sun = new THREE.DirectionalLight('#fff4e5', 2.8);
  sun.position.set(-130, 175, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 160, bottom: -110, near: 1, far: 600 });
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .12;
  sun.target.position.set(0, 35, 0);
  scene.add(sun, sun.target);
  fill = new THREE.HemisphereLight('#d3e6ee', '#aa9d80', .68);
  scene.add(fill);
  setLoading(15, 'Loading the light');
  const env = await new RGBELoader().loadAsync('assets/environment.hdr', event => {
    if (event.total) setLoading(15 + event.loaded / event.total * 45, 'Loading the light');
  });
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = env;
  scene.backgroundRotation.y = -.85;
  scene.environmentRotation.y = -.85;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.environmentIntensity = 1;
  pmrem.dispose();
  setLoading(65, 'Building the facade');
  await new Promise(resolve => requestAnimationFrame(resolve));
  architecture = createArchitecture({ quality });
  scene.add(architecture.group);
  setLoading(80, 'Preparing the waterfront');
  await new Promise(resolve => requestAnimationFrame(resolve));
  setting = createSetting(scene, renderer, { quality });
  setting.sun.copy(sun.position).normalize();
  resize();
  progress = clamp(scrollY / total, 0, 1);
  applyScene(progress, performance.now());
  setLoading(94, 'Finishing the view');
  await renderer.compileAsync(scene, camera);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  ready = true;
  setLoading(100, 'Ready to explore');
  $('loader').classList.add('is-loaded');
  setTimeout(() => { $('loader').hidden = true; }, reducedMotion.matches ? 0 : 650);
  if (location.hash) jump(location.hash.slice(1));
  requestAnimationFrame(render);
}

window.__ALDAR = {
  get ready() { return ready; },
  get x() { return { renderer, scene, camera, architecture, setting, controls }; },
  freeze(p) {
    frozen = clamp(p, 0, 1);
    window.scrollTo({ top: frozen * total, behavior: 'instant' });
    progress = frozen;
    if (ready) { applyScene(progress, performance.now()); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); }
    return progress;
  },
  drive(p) { return this.freeze(p); },
  release() { frozen = null; },
  lost() { return renderer?.getContext().isContextLost() ?? true; },
  setQuality, setExplore,
  info() { return { ready, progress, exploring, quality, error: renderingError, drawCalls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles, model: architecture?.stats, context: setting?.stats, camera: camera?.position.toArray() }; },
};

init().catch(fail);
