import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Dimensions are metres. The surrounding landscape is an architectural study.
export function createSetting(scene, renderer, { quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'Coastal setting';
  scene.add(group);
  let seed = 84719;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const physical = (color, roughness = .8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const stone = physical('#c9c6b9', .87);
  const edgeStone = physical('#bcb9aa', .85);
  const sand = physical('#bcb7a7', .95);
  const asphalt = physical('#535758', .93);
  const metal = physical('#747b7b', .38, { metalness: .65 });
  const shadowCasters = [];
  const batches = new Map();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  function add(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = false } = {}) {
    geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz); geometry.translate(x, y, z);
    const key = `${material.uuid}:${cast}`;
    if (!batches.has(key)) batches.set(key, { material, cast, geometries: [] });
    batches.get(key).geometries.push(geometry);
  }
  function oval(rx, rz, depth, y, material) {
    const g = new THREE.CylinderGeometry(1, 1, depth, 160, 1);
    g.scale(rx, 1, rz);
    add(g, material, { y });
  }
  function ovalRing(rx, rz, inset, y, material) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, rx - inset, rz - inset, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    add(new THREE.ShapeGeometry(shape, 160), material, { rx: -Math.PI / 2, y });
  }
  function box(w, h, d, x, y, z, material, cast = false) { add(new THREE.BoxGeometry(w, h, d), material, { x, y, z, cast }); }
  function branch(a, b, r1, r2, material, sides = 5, cast = false) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r2, r1, direction.length(), sides, 1);
    rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    matrix.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), rotation, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(matrix); add(g, material, { cast });
  }

  // A light joint pattern stays subordinate to the facade at every distance.
  const pavingCanvas = document.createElement('canvas');
  pavingCanvas.width = pavingCanvas.height = 512;
  const ctx = pavingCanvas.getContext('2d');
  ctx.fillStyle = '#c9c6b9'; ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    for (let column = -1; column < 5; column++) {
      const value = 191 + Math.floor(random() * 13);
      ctx.fillStyle = `rgb(${value + 7},${value + 5},${value - 6})`;
      ctx.fillRect(column * 128 + (row % 2) * 64 + 1, row * 64 + 1, 126, 62);
    }
  }
  for (let i = 0; i < 22000; i++) {
    ctx.fillStyle = random() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(55,55,40,.035)';
    ctx.fillRect(random() * 512, random() * 512, 1, 1);
  }
  const paving = new THREE.CanvasTexture(pavingCanvas);
  paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
  paving.repeat.set(52, 42); paving.colorSpace = THREE.SRGBColorSpace;
  paving.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pavingMaterial = physical('#ffffff', .86, { map: paving, bumpMap: paving, bumpScale: .013 });

  box(12000, .5, 6100, 0, -.91, 2945, sand);
  oval(130, 99, .08, -.60, asphalt);
  oval(116, 85, .10, -.57, sand);
  oval(100, 74, .19, -.51, edgeStone);
  oval(96, 70, .19, -.32, stone);
  oval(92, 66, .23, -.11, pavingMaterial);
  ovalRing(127, 96, .14, -.51, physical('#c1beb0', .9));
  ovalRing(117.5, 86.5, .12, -.51, physical('#b3b1a5', .9));
  // Walkway across the entrance forecourt.
  box(12, .06, 29, 0, .035, 75, stone);
  box(1400, 1.7, 1.8, 0, -.69, -105, edgeStone);
  box(1400, .14, 2.7, 0, .08, -105, stone);
  box(1400, .035, 7, 0, -.61, -99.5, stone);

  // Sparse planting beds and date palms follow the outer pedestrian paths.
  const soil = physical('#7b7964', 1);
  const turf = physical('#777e60', 1);
  const bark = physical('#8a8070', .97);
  const leaves = physical('#56664b', .83, { side: THREE.DoubleSide });
  const leafLight = physical('#6d7859', .84, { side: THREE.DoubleSide });
  const beds = [ [-82, -24], [-83, 0], [-82, 24], [82, -24], [83, 0], [82, 24], [-58, 49], [58, 49], [-58, -50], [58, -50] ];
  function palm(x, z, height, phase) {
    const start = new THREE.Vector3(x, .03, z);
    const crown = new THREE.Vector3(x + Math.sin(phase) * .55, height, z + Math.cos(phase) * .4);
    branch(start, crown, .31, .16, bark, 8, true);
    for (let ring = 0; ring < 11; ring++) {
      const yy = .45 + ring * (height - 1) / 11;
      const rr = .3 - yy / height * .12;
      add(new THREE.CylinderGeometry(rr, rr + .012, .065, 8), bark, { x: x + Math.sin(phase) * .55 * yy / height, y: yy, z: z + Math.cos(phase) * .4 * yy / height });
    }
    for (let frond = 0; frond < 11; frond++) {
      const angle = phase + frond * Math.PI * 2 / 11;
      const length = 3.5 + random() * 1.6;
      const points = [];
      for (let j = 0; j <= 6; j++) {
        const s = j / 6;
        points.push(new THREE.Vector3(crown.x + Math.cos(angle) * length * s, crown.y + Math.sin(s * Math.PI) * 1.15 - s * 1.35, crown.z + Math.sin(angle) * length * s));
      }
      for (let j = 0; j < 6; j++) branch(points[j], points[j + 1], .026 * (1 - j / 7), .018, leafLight, 3);
      const positions = [];
      for (let j = 1; j < 17; j++) {
        const t = j / 18, step = t * 6, index = Math.floor(step);
        const center = points[index].clone().lerp(points[index + 1], step - index);
        const width = Math.sin(t * Math.PI) * .83;
        for (const side of [-1, 1]) {
          const tip = center.clone().add(new THREE.Vector3(Math.cos(angle + side * 1.1) * width, -.16 - t * .12, Math.sin(angle + side * 1.1) * width));
          const base = center.clone().add(new THREE.Vector3(Math.cos(angle) * .17, .015, Math.sin(angle) * .17));
          positions.push(...center.toArray(), ...tip.toArray(), ...base.toArray());
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals();
      add(g, frond % 3 ? leaves : leafLight);
    }
  }
  for (const [x, z] of beds) {
    const g = new THREE.CylinderGeometry(3.4, 3.4, .11, 32); add(g, edgeStone, { x, y: .045, z });
    add(new THREE.CircleGeometry(3.16, 32), soil, { x, y: .108, z, rx: -Math.PI / 2 });
    palm(x, z, 9.2 + random() * 2.5, random() * Math.PI * 2);
    for (let n = 0; n < 6; n++) {
      const angle = n * Math.PI / 3;
      const shrub = new THREE.IcosahedronGeometry(.45 + random() * .28, 1); shrub.scale(1, .6, 1);
      add(shrub, turf, { x: x + Math.cos(angle) * 2.3, y: .32, z: z + Math.sin(angle) * 2.3 });
    }
  }
  // Bollards and timber benches remain at human scale.
  const timber = physical('#8c8170', .81);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = -.8 + i * .2;
      const x = side * Math.cos(a) * 103, z = Math.sin(a) * 77;
      add(new THREE.CylinderGeometry(.1, .12, .85, 8), metal, { x, y: -.17, z });
      add(new THREE.CylinderGeometry(.105, .105, .065, 8), stone, { x, y: .19, z });
    }
    for (const z of [-33, 33]) {
      const x = side * 72;
      box(.7, .16, 2.4, x, .48, z, timber);
      box(.45, .43, .13, x, .22, z - .88, metal);
      box(.45, .43, .13, x, .22, z + .88, metal);
    }
  }

  // Low silhouettes on a distant shore become part of the aerial perspective.
  const distant = physical('#a9b0b0', .94);
  const distantAccent = physical('#a0a7a7', .92);
  box(3400, 2, 350, 0, -1.5, -1700, sand);
  for (let i = 0; i < 34; i++) {
    const x = -1400 + i * 85 + random() * 35;
    const z = -1735 - random() * 140;
    const height = 9 + random() * 26;
    const width = 35 + random() * 40;
    box(width, height, 35 + random() * 30, x, height / 2 - .5, z, distant);
    if (i % 3 === 0) box(width * .67, 5, 25, x, height + 2, z, distantAccent);
  }

  for (const batch of batches.values()) {
    // Unify indexed and non-indexed source primitives for the batched mesh.
    const geometries = batch.geometries.map(g => {
      const geometry = g.index ? g.toNonIndexed() : g;
      geometry.deleteAttribute('uv');
      return geometry;
    });
    // Preserve the paving UVs for the top plaza material.
    if (batch.material === pavingMaterial) {
      for (const g of geometries) {
        const p = g.getAttribute('position'); const uv = [];
        for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + 92) / 184, (p.getZ(i) + 66) / 132);
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      }
    }
    const merged = mergeGeometries(geometries, false);
    const mesh = new THREE.Mesh(merged, batch.material);
    mesh.castShadow = batch.cast && quality === 'high'; mesh.receiveShadow = true;
    mesh.name = batch.material === pavingMaterial ? 'Limestone paving' : 'Site geometry';
    group.add(mesh);
    if (batch.cast) shadowCasters.push(mesh);
    for (const g of batch.geometries) g.dispose();
    for (const g of geometries) g.dispose();
  }

  // Planar reflection renders the original scene through a reflected camera.
  const normalSize = 256, normalData = new Uint8Array(normalSize * normalSize * 4);
  const waveSpectrum = Array.from({ length: 28 }, (_, i) => {
    const x = Math.floor(random() * 33) - 16;
    const y = Math.floor(random() * 33) - 16 || 1;
    return { x, y, phase: random() * Math.PI * 2, amplitude: .046 / (1 + i * .055), length: Math.hypot(x, y) };
  });
  for (let y = 0; y < normalSize; y++) {
    for (let x = 0; x < normalSize; x++) {
      const u = x / normalSize * Math.PI * 2, v = y / normalSize * Math.PI * 2;
      let nx = 0, ny = 0;
      for (const wave of waveSpectrum) {
        const gradient = Math.cos(u * wave.x + v * wave.y + wave.phase) * wave.amplitude / wave.length;
        nx += gradient * wave.x; ny += gradient * wave.y;
      }
      const n = new THREE.Vector3(nx, ny, 1).normalize(), i = (y * normalSize + x) * 4;
      normalData[i] = (n.x * .5 + .5) * 255; normalData[i + 1] = (n.y * .5 + .5) * 255;
      normalData[i + 2] = (n.z * .5 + .5) * 255; normalData[i + 3] = 255;
    }
  }
  const normals = new THREE.DataTexture(normalData, normalSize, normalSize);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = THREE.LinearFilter; normals.minFilter = THREE.LinearMipmapLinearFilter;
  normals.generateMipmaps = true; normals.needsUpdate = true;
  const sun = new THREE.Vector3(-.55, .65, .5).normalize();
  const water = new Water(new THREE.PlaneGeometry(12000, 10000), {
    textureWidth: quality === 'high' ? 768 : 384, textureHeight: quality === 'high' ? 768 : 384,
    waterNormals: normals, sunDirection: sun, sunColor: '#fff3df', waterColor: '#315b60',
    distortionScale: .85, alpha: 1, fog: true,
  });
  water.rotation.x = -Math.PI / 2; water.position.set(0, -.72, -5107);
  water.material.uniforms.size.value = 16;
  water.material.fragmentShader = water.material.fragmentShader
    .replace('vec2( 8907.0, 9803.0 )', 'vec2( 317.0, 293.0 )')
    .replace('vec2( 1091.0, 1027.0 )', 'vec2( 163.0, 173.0 )')
    .replace('float rf0 = 0.3;', 'float rf0 = 0.04;');
  water.name = 'Coastal water'; group.add(water);
  const stats = { meshes: group.children.length, palms: beds.length, reflectedScene: true, reflectionInterval: quality === 'high' ? 1 : 3, reflectionFrames: 0 };
  const reflect = water.onBeforeRender;
  let reflectionTick = 0;
  const lastReflectionPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const lastReflectionRotation = new THREE.Quaternion();
  const lastReflectionProjection = new THREE.Matrix4();
  water.onBeforeRender = function (activeRenderer, activeScene, activeCamera) {
    const cameraChanged = lastReflectionPosition.distanceToSquared(activeCamera.position) > 1e-10
      || lastReflectionRotation.angleTo(activeCamera.quaternion) > 1e-7
      || !lastReflectionProjection.equals(activeCamera.projectionMatrix);
    const shouldRefresh = quality === 'high' || reflectionTick++ % 3 === 0 || cameraChanged;
    if (!shouldRefresh) return;
    reflect.call(this, activeRenderer, activeScene, activeCamera);
    lastReflectionPosition.copy(activeCamera.position);
    lastReflectionRotation.copy(activeCamera.quaternion);
    lastReflectionProjection.copy(activeCamera.projectionMatrix);
    stats.reflectionFrames++;
  };
  return {
    group, sun, stats,
    update(p, time) {
      water.material.uniforms.time.value = (Number.isFinite(time) ? time : 0) * .24;
      water.material.uniforms.sunDirection.value.copy(sun).normalize();
    },
    setQuality(next) {
      quality = next;
      stats.reflectionInterval = next === 'high' ? 1 : 3;
      reflectionTick = 0;
      shadowCasters.forEach(mesh => { mesh.castShadow = next === 'high'; });
      paving.anisotropy = Math.min(next === 'high' ? 8 : 2, renderer.capabilities.getMaxAnisotropy());
    },
  };
}
