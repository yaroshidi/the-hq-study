import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Metres. The elevation is an upright circle, trimmed at grade.
export const RADIUS = 60.45;
export const CENTRE_Y = 49.55;
const FACE_RADIUS = RADIUS - 1.25;
const CAP_RADIUS = 122;
const FLOOR_HEIGHT = 4.4;
const TAU = Math.PI * 2;
const fract = n => n - Math.floor(n);
const noise = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const clamp = n => THREE.MathUtils.clamp(n, 0, 1);
export const facadeDepth = (x, v) => 19 + Math.sqrt(Math.max(0, CAP_RADIUS ** 2 - x * x - v * v)) - CAP_RADIUS;
const point = (x, v, side, offset = 0) => new THREE.Vector3(x, v + CENTRE_Y, side * (facadeDepth(x, v) + offset));
const normal = (x, v, side) => new THREE.Vector3(x, v, side * Math.sqrt(Math.max(0, CAP_RADIUS ** 2 - x * x - v * v))).normalize();

function geometry(positions, normals, colors, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else g.computeVertexNormals();
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

function clipPolygon(poly, nx, ny, d) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a[0] * nx + a[1] * ny - d;
    const db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) result.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function clipFace(poly) {
  if (poly.every(p => p[0] ** 2 + p[1] ** 2 > (FACE_RADIUS + 4) ** 2)) return [];
  poly = clipPolygon(poly, 0, -1, CENTRE_Y - .25);
  if (poly.some(p => p[0] ** 2 + p[1] ** 2 > FACE_RADIUS ** 2)) {
    for (let i = 0; i < 192 && poly.length; i++) {
      const a = i / 192 * TAU;
      poly = clipPolygon(poly, Math.cos(a), Math.sin(a), FACE_RADIUS);
    }
  }
  return poly;
}

// A shallow rectangular section follows the local glass curvature.
function curvedMember(a, b, side, width, depth, lift, segments = 1, ribbon = false) {
  const pos = [], norms = [];
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments, t1 = (i + 1) / segments;
    const p0 = point(THREE.MathUtils.lerp(a[0], b[0], t0), THREE.MathUtils.lerp(a[1], b[1], t0), side, lift);
    const p1 = point(THREE.MathUtils.lerp(a[0], b[0], t1), THREE.MathUtils.lerp(a[1], b[1], t1), side, lift);
    const n = normal((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 - CENTRE_Y, side);
    const tangent = p1.clone().sub(p0).normalize();
    const transverse = new THREE.Vector3().crossVectors(tangent, n).normalize();
    const corners = [];
    for (const p of [p0, p1]) {
      corners.push(p.clone().addScaledVector(transverse, -width / 2).addScaledVector(n, -depth / 2));
      corners.push(p.clone().addScaledVector(transverse, width / 2).addScaledVector(n, -depth / 2));
      corners.push(p.clone().addScaledVector(transverse, width / 2).addScaledVector(n, depth / 2));
      corners.push(p.clone().addScaledVector(transverse, -width / 2).addScaledVector(n, depth / 2));
    }
    const surfaces = ribbon ? [[2, 3, 7, 6]] : [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1], [4, 5, 6, 7]];
    for (const [j, k, l, m] of surfaces) {
      const nn = new THREE.Vector3().subVectors(corners[l], corners[j]).cross(new THREE.Vector3().subVectors(corners[k], corners[j])).normalize();
      for (const q of [j, l, k, j, m, l]) { pos.push(...corners[q]); norms.push(...nn); }
    }
  }
  return geometry(pos, norms);
}

function mergedMesh(geometries, material) {
  if (!geometries.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach(g => g.dispose());
  return mesh;
}

function beamBetween(a, b, width, depth, material) {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, direction.length(), depth), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.updateMatrix();
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
  mesh.geometry.dispose();
  return g;
}

function fineSurfaceTexture() {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    data[o] = 128 + Math.round(Math.sin(x * .12 + y * .024) * 3);
    data[o + 1] = 128 + Math.round(Math.sin(y * .14) * 2);
    data[o + 2] = 255; data[o + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createArchitecture({ quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'Aldar Headquarters';
  const high = quality !== 'low';
  const materials = {
    glass: new THREE.MeshPhysicalMaterial({ color: '#465f6e', metalness: .64, roughness: .12, clearcoat: .65, clearcoatRoughness: .08, transmission: 0, thickness: .12, ior: 1.48, transparent: true, opacity: .95, vertexColors: true, envMapIntensity: 1.04, normalMap: fineSurfaceTexture(), normalScale: new THREE.Vector2(.065, .065) }),
    joint: new THREE.MeshStandardMaterial({ color: '#596873', metalness: .55, roughness: .38, envMapIntensity: .85 }),
    silver: new THREE.MeshStandardMaterial({ color: '#bec3c2', metalness: .73, roughness: .27, envMapIntensity: 1.05 }),
    rim: new THREE.MeshStandardMaterial({ color: '#c4c7c3', metalness: .68, roughness: .31, envMapIntensity: 1 }),
    channel: new THREE.MeshPhysicalMaterial({ color: '#334c5a', metalness: .46, roughness: .15, clearcoat: .8, envMapIntensity: 1, transparent: true, opacity: .86 }),
    floor: new THREE.MeshStandardMaterial({ color: '#96968d', roughness: .86, metalness: .02 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#b6b3a6', roughness: .87 }),
    core: new THREE.MeshStandardMaterial({ color: '#a3a298', roughness: .88 }),
    partition: new THREE.MeshStandardMaterial({ color: '#717b7a', roughness: .42, metalness: .16 }),
    interiorLight: new THREE.MeshStandardMaterial({ color: '#ebe6d5', emissive: '#ffce8b', emissiveIntensity: .04, roughness: .5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#252d31', metalness: .48, roughness: .4 }),
    stone: new THREE.MeshStandardMaterial({ color: '#b9b1a0', roughness: .89 }),
  };
  const movable = [], facadeGroups = [], structureGroups = [], floors = [], rimGroups = [];
  const stats = { glassPanels: 0, floors: 23, mainDiagridLines: 0, meshes: 0, triangles: 0 };
  const addMove = (object, displacement, delay = 0, rotation = new THREE.Vector3()) => {
    movable.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), displacement, delay, rotation });
  };
  const sectors = 12;
  const paneSide = 2.54, paneHeight = paneSide * Math.sqrt(3) / 2;
  for (const side of [1, -1]) {
    const data = Array.from({ length: sectors }, () => ({ p: [], n: [], c: [], uv: [], joints: [], edges: new Set() }));
    for (let row = -28; row < 29; row++) for (let col = -42; col < 42; col++) {
      const x = col * paneSide + row * paneSide / 2, v = row * paneHeight + .4;
      const p0 = [x, v], p1 = [x + paneSide, v], p2 = [x + paneSide / 2, v + paneHeight], p3 = [x + paneSide * 1.5, v + paneHeight];
      for (const triangle of [[p0, p1, p2], [p1, p3, p2]]) {
        const poly = clipFace(triangle);
        if (poly.length < 3) continue;
        const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
        const cv = poly.reduce((a, p) => a + p[1], 0) / poly.length;
        const sector = Math.floor((Math.atan2(cv, cx) + Math.PI) / TAU * sectors) % sectors;
        const d = data[sector];
        const tint = .985 + noise(cx * 5.3 + cv * 3.7) * .03;
        const points = poly.map(p => point(p[0], p[1], side));
        const normalX = (noise(cx * 2 + cv * 3) - .5) * .0008;
        const normalY = (noise(cx * 4 - cv * 2) - .5) * .0008;
        for (let j = 1; j < points.length - 1; j++) {
          for (const k of side > 0 ? [0, j, j + 1] : [0, j + 1, j]) {
            const paneNormal = normal(poly[k][0], poly[k][1], side);
            paneNormal.x += normalX; paneNormal.y += normalY; paneNormal.normalize();
            d.p.push(...points[k]); d.n.push(...paneNormal); d.c.push(tint, tint, tint);
            d.uv.push(poly[k][0] / 9, poly[k][1] / 9);
          }
        }
        for (let j = 0; j < poly.length; j++) {
          const a = poly[j], b = poly[(j + 1) % poly.length];
          const key = [a, b].map(p => p.map(v => v.toFixed(3)).join(',')).sort().join(':');
          if (d.edges.has(key)) continue;
          d.edges.add(key);
          d.joints.push(curvedMember(a, b, side, high ? .035 : .041, .025, .031, 1, true));
        }
        stats.glassPanels++;
      }
    }
    for (let sector = 0; sector < sectors; sector++) {
      const d = data[sector]; if (!d.p.length) continue;
      const panelGroup = new THREE.Group(); panelGroup.name = `Facade ${side > 0 ? 'south' : 'north'} ${sector + 1}`;
      const glass = new THREE.Mesh(geometry(d.p, d.n, d.c, d.uv), materials.glass);
      glass.castShadow = true;
      glass.receiveShadow = true;
      panelGroup.add(glass);
      const joints = mergedMesh(d.joints, materials.joint); panelGroup.add(joints);
      group.add(panelGroup); facadeGroups.push(panelGroup);
      const a = (sector + .5) / sectors * TAU - Math.PI;
      addMove(panelGroup, new THREE.Vector3(Math.cos(a) * 14, Math.sin(a) * 10 + 6, side * (31 + noise(sector) * 8)), .03, new THREE.Vector3(0, Math.cos(a) * .055, 0));
    }

    // The cladding follows the main structural diamonds, with panel joints every 2.2 m.
    const frame = new THREE.Group(); frame.name = `Diagrid ${side}`;
    const members = [], seams = [];
    const slope = Math.sqrt(3), intercept = 34.6;
    for (const sign of [-1, 1]) for (let line = -3; line <= 3; line++) {
      const m = sign * slope, c = line * intercept;
      const A = 1 + m * m, B = 2 * m * c, C = c * c - FACE_RADIUS * FACE_RADIUS;
      const discriminant = B * B - 4 * A * C; if (discriminant <= 0) continue;
      let x0 = (-B - Math.sqrt(discriminant)) / (2 * A), x1 = (-B + Math.sqrt(discriminant)) / (2 * A);
      const groundX = (.32 - CENTRE_Y - c) / m;
      if (m > 0) x0 = Math.max(x0, groundX); else x1 = Math.min(x1, groundX);
      if (x0 >= x1) continue;
      const start = [x0, m * x0 + c], end = [x1, m * x1 + c];
      const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
      members.push(curvedMember(start, end, side, .74, .38, .22 + (sign > 0 ? .006 : 0), Math.ceil(len / 2.2)));
      const direction = new THREE.Vector2(end[0] - start[0], end[1] - start[1]).normalize();
      for (let distance = 2.2; distance < len - .4; distance += 2.2) {
        const x = start[0] + direction.x * distance, v = start[1] + direction.y * distance;
        seams.push(curvedMember([x - direction.y * .37, v + direction.x * .37], [x + direction.y * .37, v - direction.x * .37], side, .017, .01, .425));
      }
      stats.mainDiagridLines++;
    }
    const beams = mergedMesh(members, materials.silver); beams.castShadow = true; beams.receiveShadow = true;
    frame.add(beams, mergedMesh(seams, materials.joint));
    group.add(frame); structureGroups.push(frame);
    addMove(frame, new THREE.Vector3(0, 0, side * 13), .2);
  }

  // The outer rim is two metal lips with a recessed band of glazed skylight.
  const minA = Math.asin(-CENTRE_Y / RADIUS);
  const arcStart = minA, arcEnd = Math.PI - minA;
  for (let sector = 0; sector < 12; sector++) {
    const arc = new THREE.Group(); arc.name = `Perimeter ${sector + 1}`;
    const a0 = THREE.MathUtils.lerp(arcStart, arcEnd, sector / 12), a1 = THREE.MathUtils.lerp(arcStart, arcEnd, (sector + 1) / 12);
    const panels = [], panelNormals = [], channel = [], channelNormals = [], seams = [], braces = [];
    const N = Math.ceil((a1 - a0) * RADIUS / 1.8);
    for (let i = 0; i < N; i++) {
      const aa = THREE.MathUtils.lerp(a0, a1, i / N), ab = THREE.MathUtils.lerp(a0, a1, (i + 1) / N);
      for (const side of [-1, 1]) {
        const ringPoint = (a, r, z) => new THREE.Vector3(Math.cos(a) * r, CENTRE_Y + Math.sin(a) * r, side * z);
        const zInner = facadeDepth(FACE_RADIUS, 0) + .11;
        const zOuter = facadeDepth(RADIUS, 0) + .11;
        for (const vertices of [
          [ringPoint(aa, FACE_RADIUS, zInner), ringPoint(ab, FACE_RADIUS, zInner), ringPoint(ab, RADIUS, zOuter), ringPoint(aa, RADIUS, zOuter)],
          [ringPoint(aa, RADIUS, zOuter), ringPoint(ab, RADIUS, zOuter), ringPoint(ab, RADIUS - .45, 2.55), ringPoint(aa, RADIUS - .45, 2.55)],
        ]) {
          const n = new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0])).normalize();
          const order = side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
          for (const j of order) { panels.push(...vertices[j]); panelNormals.push(...n.clone().multiplyScalar(side > 0 ? -1 : 1)); }
        }
        seams.push(beamBetween(ringPoint(aa, FACE_RADIUS, zInner + .014), ringPoint(aa, RADIUS, zOuter + .014), .018, .018, materials.joint));
        seams.push(beamBetween(ringPoint(aa, RADIUS, zOuter + .02), ringPoint(aa, RADIUS - .45, 2.55), .018, .018, materials.joint));
      }
      const r = RADIUS - 1.05;
      const vertices = [new THREE.Vector3(Math.cos(aa) * r, CENTRE_Y + Math.sin(aa) * r, -2.55), new THREE.Vector3(Math.cos(ab) * r, CENTRE_Y + Math.sin(ab) * r, -2.55), new THREE.Vector3(Math.cos(ab) * r, CENTRE_Y + Math.sin(ab) * r, 2.55), new THREE.Vector3(Math.cos(aa) * r, CENTRE_Y + Math.sin(aa) * r, 2.55)];
      const n = new THREE.Vector3(Math.cos((aa + ab) / 2), Math.sin((aa + ab) / 2), 0);
      for (const j of [0, 1, 2, 0, 2, 3]) { channel.push(...vertices[j]); channelNormals.push(...n); }
      braces.push(beamBetween(vertices[0], vertices[2], .085, .085, materials.silver));
      braces.push(beamBetween(vertices[1], vertices[3], .085, .085, materials.silver));
      braces.push(beamBetween(vertices[0], vertices[3], .07, .09, materials.silver));
    }
    const metal = new THREE.Mesh(geometry(panels, panelNormals), materials.rim); metal.castShadow = true; metal.receiveShadow = true;
    arc.add(metal, new THREE.Mesh(geometry(channel, channelNormals), materials.channel), mergedMesh(seams, materials.joint), mergedMesh(braces, materials.silver));
    group.add(arc); rimGroups.push(arc);
    const a = (a0 + a1) / 2;
    addMove(arc, new THREE.Vector3(Math.cos(a) * 18, Math.sin(a) * 18 + 4, 0), .32);
  }

  // Floor slabs sit behind the skin. Their lens-shaped edges follow each elevation.
  const officeDetails = [], officeLights = [];
  for (let level = 0; level < 23; level++) {
    const y = .55 + level * FLOOR_HEIGHT, v = y - CENTRE_Y;
    const radius = FACE_RADIUS - 1.2;
    const halfWidth = Math.sqrt(Math.max(0, radius ** 2 - v ** 2));
    const floorShape = elevation => {
      const vv = elevation - CENTRE_Y;
      const hw = Math.sqrt(Math.max(0, radius ** 2 - vv ** 2));
      const shape = new THREE.Shape();
      for (let i = 0; i <= 40; i++) {
        const x = THREE.MathUtils.lerp(-hw, hw, i / 40), z = Math.max(.5, facadeDepth(x, vv) - 1.15);
        if (!i) shape.moveTo(x, z); else shape.lineTo(x, z);
      }
      for (let i = 40; i >= 0; i--) {
        const x = THREE.MathUtils.lerp(-hw, hw, i / 40), z = -Math.max(.5, facadeDepth(x, vv) - 1.15);
        shape.lineTo(x, z);
      }
      shape.closePath();
      return shape;
    };
    const shape = floorShape(y);
    const floorGroup = new THREE.Group(); floorGroup.name = `Level ${String(level + 1).padStart(2, '0')}`; floorGroup.position.y = y;
    const slabGeometry = new THREE.ExtrudeGeometry(shape, { depth: .28, bevelEnabled: false });
    slabGeometry.rotateX(Math.PI / 2);
    const slab = new THREE.Mesh(slabGeometry, materials.floor); slab.receiveShadow = true;
    floorGroup.add(slab);
    const ceilingGeometry = new THREE.ShapeGeometry(floorShape(y + FLOOR_HEIGHT - .48)); ceilingGeometry.rotateX(Math.PI / 2);
    const ceiling = new THREE.Mesh(ceilingGeometry, materials.ceiling); ceiling.position.y = FLOOR_HEIGHT - .48;
    floorGroup.add(ceiling);
    const details = [], lights = [];
    const box = (w, h, d, x, yy, z, list) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, yy, z); list.push(g); };
    const detailV = Math.abs(y + FLOOR_HEIGHT - CENTRE_Y) > Math.abs(v) ? y + FLOOR_HEIGHT - CENTRE_Y : v;
    const detailWidth = Math.sqrt(Math.max(0, radius ** 2 - detailV ** 2));
    for (let x = -detailWidth + 4; x < detailWidth - 4; x += 5.4) {
      const depth = facadeDepth(x, detailV) - 3;
      if (depth < 2) continue;
      for (const side of [-1, 1]) {
        const z = side * Math.min(depth - 1, 11.5);
        if (noise(x + level * 1.7) > .17) {
          box(2.6, .09, 1.25, x, .82, z, details);
          box(.12, .8, .12, x - 1, .4, z, details); box(.12, .8, .12, x + 1, .4, z, details);
          box(.63, .42, .07, x, 1.12, z + side * .27, details);
          box(.48, .06, .45, x, .53, z - side, details);
        }
        if (noise(x * .7 + level * 3) > .35) box(2.6, .04, .12, x, FLOOR_HEIGHT - .57, z, lights);
        if (noise(x * 1.1 + level) > .75) box(.11, 2.65, Math.min(depth * .8, 6), x + 2.7, 1.33, side * 5, details);
      }
    }
    if (details.length) { const mesh = mergedMesh(details, materials.partition); floorGroup.add(mesh); officeDetails.push(mesh); }
    if (lights.length) { const mesh = mergedMesh(lights, materials.interiorLight); floorGroup.add(mesh); officeLights.push(mesh); }
    group.add(floorGroup); floors.push(floorGroup);
    addMove(floorGroup, new THREE.Vector3((level % 2 ? 1 : -1) * (10 + level * .35), (level - 11) * .72, 0), .4);
  }
  const cores = new THREE.Group(); cores.name = 'Twin concrete service cores';
  for (const x of [-17, 17]) {
    const core = new THREE.Mesh(new THREE.BoxGeometry(8.2, 99.5, 7.5), materials.core); core.position.set(x, 49.8, 0); core.castShadow = true; cores.add(core);
    const doors = [];
    for (let level = 0; level < 23; level++) for (const side of [-1, 1]) for (const offset of [-1.75, 1.75]) {
      const g = new THREE.BoxGeometry(1.5, 2.5, .06); g.translate(x + offset, 1.85 + level * FLOOR_HEIGHT, side * 3.79); doors.push(g);
    }
    cores.add(mergedMesh(doors, materials.dark));
  }
  group.add(cores);

  const entrance = new THREE.Group(); entrance.name = 'Entrance pavilion';
  const entranceGlass = materials.channel.clone(); entranceGlass.opacity = .83;
  const entranceMetal = [];
  for (const side of [1, -1]) {
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(25, 5.4, 6), entranceGlass); lobby.position.set(0, 2.7, side * 10); entrance.add(lobby);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(29, .28, 9), materials.silver); canopy.position.set(0, 5.45, side * 12); canopy.castShadow = true; entrance.add(canopy);
    for (let x = -12; x <= 12; x += 3) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 5.4, .1), materials.silver); post.position.set(x, 2.7, side * 13.03); post.updateMatrix(); entranceMetal.push(post.geometry.applyMatrix4(post.matrix));
    }
    for (const x of [-4, 0, 4]) {
      const door = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.8, 20, 1, true), entranceGlass); door.position.set(x, 1.4, side * 13.5); entrance.add(door);
    }
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(75, .45, 34), materials.stone); plinth.position.y = .02; plinth.receiveShadow = true; entrance.add(plinth);
  entrance.add(mergedMesh(entranceMetal, materials.silver));
  group.add(entrance);

  // Recessed rooftop plant, seen through the crown glazing.
  const crown = new THREE.Group(); crown.name = 'Crown plant';
  const plant = new THREE.Mesh(new THREE.BoxGeometry(20, 2.6, 7), materials.dark); plant.position.set(0, 103, 0); crown.add(plant);
  const crownFins = [];
  for (let x = -9; x <= 9; x += 1.2) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, 7.15), materials.silver); fin.position.set(x, 103.4, 0); fin.updateMatrix(); crownFins.push(fin.geometry.applyMatrix4(fin.matrix));
  }
  crown.add(mergedMesh(crownFins, materials.silver));
  group.add(crown);

  const anchors = {
    centre: new THREE.Vector3(0, CENTRE_Y, 0),
    crown: new THREE.Vector3(0, 109.7, 3.2),
    entrance: new THREE.Vector3(0, 2.5, 16.5),
    facade: point(20, 10, 1, .5),
    diagrid: point(10, 17.3, 1, .5),
    floor: new THREE.Vector3(30, .55 + 12 * FLOOR_HEIGHT, 10),
    core: new THREE.Vector3(17, 53, 3.9),
    rim: new THREE.Vector3(57, 70, 1),
  };
  let lastExplode = -1, lastNight = -1;
  function setExplode(amount) {
    amount = clamp(amount); if (Math.abs(amount - lastExplode) < .00001) return;
    lastExplode = amount;
    for (const entry of movable) {
      const t = clamp((amount - entry.delay) / (1 - entry.delay));
      const k = t * t * (3 - 2 * t);
      entry.object.position.copy(entry.position).addScaledVector(entry.displacement, k);
      entry.object.quaternion.copy(entry.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(entry.rotation.x * k, entry.rotation.y * k, entry.rotation.z * k)));
    }
  }
  function setNight(amount) {
    amount = clamp(amount); if (Math.abs(amount - lastNight) < .0001) return;
    lastNight = amount;
    materials.interiorLight.emissiveIntensity = .04 + amount * 3.3;
    materials.floor.emissive.set('#e6b77e'); materials.floor.emissiveIntensity = amount * .055;
    materials.ceiling.emissive.set('#f3d7a5'); materials.ceiling.emissiveIntensity = amount * .11;
    materials.glass.opacity = .95 - amount * .08;
  }
  group.traverse(object => {
    if (!object.isMesh) return;
    stats.meshes++;
    const g = object.geometry;
    stats.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  setExplode(0); setNight(0);
  return { group, setExplode, setNight, anchors, stats, materials, facadeGroups, structureGroups, floors, rimGroups, cores, entrance, crown };
}
