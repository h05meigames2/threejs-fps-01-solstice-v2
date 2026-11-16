// SOLSTICE map: a golden-hour alpine observatory. Two sites — the white Dome
// (A, west) and the Relay mast (B, east) — joined by three lanes: West Ridge,
// Mid Pass through the lodge, East Gully. Snow, granite, pines and timber;
// a low warm sun throws long shadows across everything, so silhouettes read
// at a glance. All geometry is procedural; textures are painted on canvas.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUND = { x: 46, z: 34 }; // playable half-extents

function canvasTexture(size, painter) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, base, dots, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(20,30,50,${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];   // {minX,maxX,minZ,maxZ,top} — movement + grenade bounce
  const shootMeshes = []; // meshes bullets can hit (and bots check LOS against)
  const tmp = new THREE.Vector3();

  // ---- sky: gradient dome + low sun disc ---------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      sunDir: { value: new THREE.Vector3(-0.82, 0.22, -0.35).normalize() },
      sunCol: { value: new THREE.Color(PALETTE.sun) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunCol * (pow(s, 350.0) * 1.6 + pow(s, 18.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
  group.add(sky);

  // ---- light --------------------------------------------------------------
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.1);
  sun.position.set(-70, 26, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0x8fb0e0, 0xe8dcc8, 0.85);
  scene.add(hemi);
  // warm fill from the south-east lifts faces the low sun never reaches
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.65);
  fill.position.set(40, 24, 70);
  scene.add(fill);
  scene.add(fill.target);
  scene.fog = new THREE.Fog(0xf2c184, 70, 260);

  // ---- textures -----------------------------------------------------------
  const snowTex = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#eef0ea', 2600, 0.10);
    for (let i = 0; i < 40; i++) { // soft drifts
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 20 + Math.random() * 40, 8 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2); ctx.fill();
    }
  });
  snowTex.repeat.set(24, 18);
  const rockTex = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#6d6a66', 3200, 0.22);
    ctx.strokeStyle = 'rgba(30,28,30,0.35)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
  rockTex.repeat.set(3, 3);
  const woodTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      ctx.fillStyle = p % 2 ? '#6e4a2b' : '#835a35';
      ctx.fillRect(0, p * 64, s, 62);
      ctx.fillStyle = 'rgba(40,25,10,0.5)';
      ctx.fillRect(0, p * 64 + 62, s, 2);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = 'rgba(60,35,15,0.35)';
        ctx.fillRect(Math.random() * s, p * 64 + 6, 2, 50);
      }
    }
  });
  const domeTex = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(120,118,110,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, s); ctx.stroke(); }
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(s, i * 64); ctx.stroke(); }
  });

  const mats = {
    snow: new THREE.MeshStandardMaterial({ map: snowTex, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1, metalness: 0 }),
    rockDark: new THREE.MeshStandardMaterial({ color: PALETTE.rockDark, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 }),
    woodDark: new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.9 }),
    dome: new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.55, metalness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.45, metalness: 0.7 }),
    metalDark: new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.6, metalness: 0.5 }),
    pine: new THREE.MeshStandardMaterial({ color: PALETTE.pine, roughness: 1 }),
    pineDark: new THREE.MeshStandardMaterial({ color: PALETTE.pineDark, roughness: 1 }),
    snowDrift: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    accent: new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 0.9, roughness: 0.4 }),
    visor: new THREE.MeshStandardMaterial({ color: PALETTE.enemyVisor, emissive: PALETTE.enemyVisor, emissiveIntensity: 1.6 }),
  };

  function add(mesh, { collider = false, shoot = true, shadow = true, pen = 0 } = {}) {
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
    if (shoot) shootMeshes.push(mesh);
    // v2 — wallbangs: pen is the damage fraction kept when a bullet punches
    // through this cover (0 = solid). Wood crates, the lodge and the huts
    // are thin; dome, mast, rock and boulders are not.
    if (pen > 0) mesh.userData.penetrable = pen;
    if (collider) {
      const box = new THREE.Box3().setFromObject(mesh);
      colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, top: box.max.y });
    }
    return mesh;
  }
  function box(w, h, d, x, y, z, mat, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return add(m, opts);
  }

  // ---- ground -------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), mats.snow);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootMeshes.push(ground);

  // snow drifts (visual only)
  const driftGeo = new THREE.SphereGeometry(1, 12, 8);
  const driftSpots = [[-30, 8, 6], [18, 20, 8], [-8, -26, 5], [32, 2, 7], [-38, -22, 6], [8, 28, 5], [40, -26, 6], [-16, 18, 4.5]];
  for (const [x, z, r] of driftSpots) {
    const d = new THREE.Mesh(driftGeo, mats.snowDrift);
    d.scale.set(r, r * 0.22, r * 0.7);
    d.position.set(x, -0.05, z);
    d.receiveShadow = true;
    group.add(d);
  }

  // ---- boundary cliffs ----------------------------------------------------
  const cliffGeo = new THREE.ConeGeometry(1, 1, 5);
  const cliffSpots = [];
  for (let x = -52; x <= 52; x += 9) { cliffSpots.push([x, -44, 14 + Math.random() * 10, 18 + Math.random() * 8]); cliffSpots.push([x, 42, 12 + Math.random() * 8, 14 + Math.random() * 8]); }
  for (let z = -38; z <= 38; z += 9) { cliffSpots.push([-56, z, 13 + Math.random() * 9, 16 + Math.random() * 8]); cliffSpots.push([56, z, 13 + Math.random() * 9, 16 + Math.random() * 8]); }
  for (const [x, z, r, h] of cliffSpots) {
    const c = new THREE.Mesh(cliffGeo, mats.rock);
    c.scale.set(r, h, r);
    c.position.set(x, h / 2 - 1, z);
    c.rotation.y = Math.random() * Math.PI;
    c.castShadow = true; c.receiveShadow = true;
    group.add(c);
  }
  // invisible boundary colliders
  colliders.push({ minX: -BOUND.x, maxX: -BOUND.x + 0.5, minZ: -BOUND.z, maxZ: BOUND.z, top: 99 });
  colliders.push({ minX: BOUND.x - 0.5, maxX: BOUND.x, minZ: -BOUND.z, maxZ: BOUND.z, top: 99 });
  colliders.push({ minX: -BOUND.x, maxX: BOUND.x, minZ: -BOUND.z, maxZ: -BOUND.z + 0.5, top: 99 });
  colliders.push({ minX: -BOUND.x, maxX: BOUND.x, minZ: BOUND.z - 0.5, maxZ: BOUND.z, top: 99 });

  // ---- Site A: observatory dome (west) ------------------------------------
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 3.2, 24), mats.dome);
  domeBase.position.set(-24, 1.6, -14);
  add(domeBase, { collider: true });
  const domeTop = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.dome);
  domeTop.position.set(-24, 3.2, -14);
  add(domeTop, { collider: false });
  const slit = box(1.6, 4.4, 0.4, -24, 5.4, -20.6, mats.metalDark, { collider: false });
  slit.rotation.y = 0;
  // dome door hut
  box(3.4, 2.6, 2.4, -24, 1.3, -6.2, mats.wood, { collider: true, pen: 0.55 });
  box(3.8, 0.3, 2.8, -24, 2.75, -6.2, mats.woodDark, { collider: false });
  // site A ring + letter
  const ringA = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.1, 40), new THREE.MeshBasicMaterial({ color: PALETTE.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  ringA.rotation.x = -Math.PI / 2; ringA.position.set(-24, 0.06, -14);
  group.add(ringA);

  // ---- Site B: relay mast (east) ------------------------------------------
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 17, 8), mats.metal);
  mast.position.set(24, 8.5, -16);
  add(mast, { collider: true });
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4 - i * 0.7, 0.22, 0.22), mats.metalDark);
    bar.position.set(24, 12 + i * 2.2, -16);
    add(bar, { collider: false });
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.metal);
  dish.position.set(24, 10.5, -16); dish.rotation.x = -Math.PI / 3.2;
  add(dish, { collider: false });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 2.5 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), beaconMat);
  beacon.position.set(24, 17.3, -16);
  group.add(beacon);
  const beaconLight = new THREE.PointLight(0xff2a1a, 6, 18);
  beaconLight.position.set(24, 17.3, -16);
  group.add(beaconLight);
  // equipment hut + crates at B
  box(4.2, 2.8, 3, 28.5, 1.4, -20, mats.wood, { collider: true, pen: 0.55 });
  box(4.6, 0.3, 3.4, 28.5, 2.95, -20, mats.woodDark, { collider: false });
  const ringB = ringA.clone();
  ringB.position.set(24, 0.06, -16);
  group.add(ringB);

  // ---- Mid lodge (central cover, splits the lanes) ------------------------
  box(8, 3.4, 5, 0, 1.7, 4, mats.wood, { collider: true, pen: 0.5 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.6, 4), mats.woodDark);
  roof.position.set(0, 4.7, 4); roof.rotation.y = Math.PI / 4;
  add(roof, { collider: false });
  box(1.2, 3.4, 0.4, -2.5, 1.7, 1.4, mats.metalDark, { collider: true }); // lodge door post
  box(1.2, 3.4, 0.4, 2.5, 1.7, 1.4, mats.metalDark, { collider: true });

  // ---- ridge rock (west cover, off the mid lane) ---------------------------
  const ridge = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 0), mats.rock);
  ridge.scale.set(1.6, 0.8, 1); ridge.position.set(-30, 1.2, 0);
  add(ridge, { collider: true });
  const boulder2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), mats.rock);
  boulder2.scale.set(1.4, 0.7, 1.1); boulder2.position.set(14, 0.8, -6);
  add(boulder2, { collider: true });
  const boulder3 = new THREE.Mesh(new THREE.DodecahedronGeometry(3, 0), mats.rock);
  boulder3.scale.set(1.3, 0.75, 1); boulder3.position.set(-16, 0.9, 2);
  add(boulder3, { collider: true });

  // ---- crates & low walls (lane cover) ------------------------------------
  const crateSpots = [
    [-12, -2, 1.6], [-12, -2, 1.6, 1], [-10.4, -3.4, 1.2], [10, -14, 1.6], [11.8, -12.6, 1.2],
    [8, 12, 1.6], [9.8, 13.4, 1.2], [-8, 14, 1.6], [30, -8, 1.6], [-30, -4, 1.6],
    [-18, -22, 1.2], [18, -22, 1.2], [2, -18, 1.6], [-34, 12, 1.6], [34, 14, 1.6],
  ];
  for (const [x, z, s, stack] of crateSpots) {
    box(s, s, s, x, s / 2, z, mats.wood, { collider: true, pen: 0.6 });
    if (stack) box(s * 0.8, s * 0.8, s * 0.8, x, s + s * 0.4, z, mats.woodDark, { collider: true, pen: 0.6 });
  }
  // low stone walls (thin — wallbangable at a steep cost)
  box(10, 1.1, 0.8, -6, 0.55, -20, mats.rock, { collider: true, pen: 0.35 });
  box(10, 1.1, 0.8, 8, 0.55, -22, mats.rock, { collider: true, pen: 0.35 });
  box(0.8, 1.1, 8, -32, 0.55, 6, mats.rock, { collider: true, pen: 0.35 });
  box(0.8, 1.1, 8, 32, 0.55, 8, mats.rock, { collider: true, pen: 0.35 });
  box(8, 1.1, 0.8, 0, 0.55, 20, mats.rock, { collider: true, pen: 0.35 });

  // ---- pines ---------------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
  const coneGeo = new THREE.ConeGeometry(1.7, 4.4, 8);
  const cone2Geo = new THREE.ConeGeometry(1.25, 3.2, 8);
  const pineSpots = [
    [-38, -26], [-36, 18], [-20, 26], [26, 24], [38, -2], [40, 20], [-42, 2],
    [16, -28], [-6, -30], [36, -28], [-28, 24], [4, 30], [-14, -28], [22, 6],
  ];
  for (const [x, z] of pineSpots) {
    const t = new THREE.Mesh(trunkGeo, mats.woodDark);
    t.position.set(x, 0.8, z); t.castShadow = true;
    group.add(t);
    const c1 = new THREE.Mesh(coneGeo, Math.random() > 0.5 ? mats.pine : mats.pineDark);
    c1.position.set(x, 3.4, z); c1.castShadow = true;
    group.add(c1);
    const c2 = new THREE.Mesh(cone2Geo, mats.pine);
    c2.position.set(x, 5.6, z); c2.castShadow = true;
    group.add(c2);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, top: 1.6 });
  }

  // ---- site letters (canvas sprites, float above each site) ---------------
  function letterSprite(letter) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    // opaque background: canvas alpha on sprites is unreliable in some
    // renderers, so the sign is a solid dark square, not a transparent disc.
    ctx.fillStyle = '#241f18';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffb45e'; ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.fillStyle = '#ffb45e'; ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: false, depthWrite: false }));
    sp.scale.set(2.6, 2.6, 1);
    return sp;
  }
  const spriteA = letterSprite('A'); spriteA.position.set(-24, 8.5, -14); group.add(spriteA);
  const spriteB = letterSprite('B'); spriteB.position.set(24, 8.5, -16); group.add(spriteB);

  // warm window glow on the lodge + dome door light
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc27a });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), glowMat);
  win.position.set(0, 1.9, 1.44); group.add(win);
  const porchLight = new THREE.PointLight(0xffc27a, 5, 12);
  porchLight.position.set(-24, 3.4, -5.4);
  group.add(porchLight);

  // v2 — named ground: the HUD compass and the location callout read from
  // here, so every corner of the ridge has a name worth calling.
  function zoneAt(x, z) {
    if (Math.hypot(x + 24, z + 14) < 9) return 'SOLSTICE DOME';
    if (Math.hypot(x - 24, z + 16) < 9) return 'RELAY MAST';
    if (Math.abs(x) < 7 && z > -2 && z < 10) return 'THE LODGE';
    if (z > 18) return 'WARDEN RIDGE';
    if (x < -14) return 'WEST RIDGE';
    if (x > 14) return 'EAST GULLY';
    return 'MID PASS';
  }

  return {
    group, colliders, shootMeshes, bound: BOUND, zoneAt,
    sites: {
      A: { x: -24, z: -14, name: 'SOLSTICE DOME' },
      B: { x: 24, z: -16, name: 'RELAY MAST' },
    },
    spawns: {
      player: { x: 0, z: 26, yaw: 0 },         // facing north (-z)
      bots: [
        { x: -8, z: -30 }, { x: -2, z: -31 }, { x: 4, z: -30 }, { x: 10, z: -31 },
      ],
    },
    update(dt, t) {
      const blink = (Math.sin(t * 2.4) > 0.2) ? 2.5 : 0.15;
      beaconMat.emissiveIntensity = blink;
      beaconLight.intensity = blink * 2.4;
      spriteA.position.y = 8.5 + Math.sin(t * 1.2) * 0.25;
      spriteB.position.y = 8.5 + Math.cos(t * 1.2) * 0.25;
    },
  };
}
