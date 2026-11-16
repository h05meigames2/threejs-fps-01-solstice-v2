// Transient combat effects, all pooled and reused — no allocations in the
// hot loop: tracers, muzzle flash, impact sparks, smoke puffs, the explosion
// and the planted device itself. Each effect is a mesh or sprite the pool
// re-arms; update() advances and hides them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 40;
const MAX_SMOKE = 28;

export function createEffects(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- tracers: stretched glowing boxes, reused in a ring -----------------
  const tracerGeo = new THREE.BoxGeometry(0.045, 0.045, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    group.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerIdx = 0;

  // ---- muzzle flash: a point light + sprite at the gun --------------------
  const flashLight = new THREE.PointLight(0xffc27a, 0, 14);
  group.add(flashLight);
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,180,80,0.85)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  fctx.fillStyle = grad; fctx.fillRect(0, 0, 64, 64);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.scale.set(0.7, 0.7, 1);
  flashSprite.visible = false;
  group.add(flashSprite);
  let flashLife = 0;

  // ---- impact sparks: small additive round dots, pooled -------------------
  // Round dot texture: untextured gl.POINTS render as squares.
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 32;
  const dctx = dotCanvas.getContext('2d');
  const dgrad = dctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  dgrad.addColorStop(0, 'rgba(255,240,200,1)');
  dgrad.addColorStop(0.5, 'rgba(255,180,80,0.8)');
  dgrad.addColorStop(1, 'rgba(255,90,20,0)');
  dctx.fillStyle = dgrad; dctx.fillRect(0, 0, 32, 32);
  const dotTex = new THREE.CanvasTexture(dotCanvas);
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  for (let i = 0; i < MAX_SPARKS; i++) sparkPos[i * 3 + 1] = -100; // unused points park below the map
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, map: dotTex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, alphaTest: 0.01 });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  let sparkIdx = 0;

  // ---- smoke puffs: soft sprites that grow and fade -----------------------
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = smokeCanvas.height = 128;
  const sctx = smokeCanvas.getContext('2d');
  const sgrad = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  sgrad.addColorStop(0, 'rgba(235,235,230,0.85)');
  sgrad.addColorStop(1, 'rgba(235,235,230,0)');
  sctx.fillStyle = sgrad; sctx.fillRect(0, 0, 128, 128);
  const smokeTex = new THREE.CanvasTexture(smokeCanvas);
  const smokes = [];
  for (let i = 0; i < MAX_SMOKE; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    group.add(sp);
    smokes.push({ sprite: sp, life: 0, max: 1, grow: 1 });
  }
  let smokeIdx = 0;

  // ---- explosion: light + expanding shell ---------------------------------
  const boomLight = new THREE.PointLight(0xff7a2a, 0, 30);
  group.add(boomLight);
  const boomMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb45e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boomMesh.visible = false;
  group.add(boomMesh);
  let boomLife = 0;

  // ---- planted device: blinking box with an antenna -----------------------
  const bomb = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5, metalness: 0.6 }),
  );
  bombBody.castShadow = true;
  bomb.add(bombBody);
  const bombBlinkMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 2 });
  const bombBlink = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bombBlinkMat);
  bombBlink.position.set(0.18, 0.2, 0);
  bomb.add(bombBlink);
  const bombLight = new THREE.PointLight(PALETTE.accent, 0, 8);
  bombLight.position.set(0, 0.5, 0);
  bomb.add(bombLight);
  bomb.visible = false;
  group.add(bomb);
  let bombBlinkT = 0;

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

  return {
    // A bright line from muzzle to impact, alive for 60 ms.
    tracer(from, to, color) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % MAX_TRACERS;
      _d.subVectors(to, from);
      const len = _d.length();
      t.mesh.position.copy(from).addScaledVector(_d, 0.5);
      t.mesh.scale.set(1, 1, Math.max(len, 0.1));
      t.mesh.lookAt(to);
      t.mesh.material = t.mesh.material; // shared material; colour set per call below
      tracerMat.color.setHex(color || PALETTE.accent);
      t.mesh.visible = true;
      t.life = 0.25; // long enough to survive to a screenshot capture
    },
    muzzle(at) {
      flashSprite.position.copy(at);
      flashSprite.visible = true;
      flashLight.position.copy(at);
      flashLight.intensity = 14;
      flashLife = 0.2;
      flashSprite.material.rotation = Math.random() * Math.PI;
    },
    sparks(at, n) {
      for (let i = 0; i < n; i++) {
        const j = sparkIdx;
        sparkIdx = (sparkIdx + 1) % MAX_SPARKS;
        sparkPos[j * 3] = at.x; sparkPos[j * 3 + 1] = at.y; sparkPos[j * 3 + 2] = at.z;
        sparkVel[j * 3] = (Math.random() - 0.5) * 6;
        sparkVel[j * 3 + 1] = Math.random() * 5 + 1;
        sparkVel[j * 3 + 2] = (Math.random() - 0.5) * 6;
        sparkLife[j] = 0.35 + Math.random() * 0.25;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    smoke(at, big) {
      for (let k = 0; k < (big ? 10 : 6); k++) {
        const s = smokes[smokeIdx];
        smokeIdx = (smokeIdx + 1) % MAX_SMOKE;
        s.sprite.position.set(
          at.x + (Math.random() - 0.5) * 1.6,
          at.y + Math.random() * 1.2,
          at.z + (Math.random() - 0.5) * 1.6,
        );
        s.sprite.scale.set(1.2, 1.2, 1);
        s.sprite.material.opacity = 0.85;
        s.sprite.visible = true;
        s.life = 0; s.max = 5 + Math.random() * 2; s.grow = 1.6 + Math.random();
      }
    },
    explosion(at) {
      boomMesh.position.copy(at);
      boomMesh.visible = true;
      boomLight.position.copy(at);
      boomLight.intensity = 60;
      boomLife = 0.7;
    },
    showBomb(at) { bomb.position.set(at.x, 0.18, at.z); bomb.visible = true; },
    hideBomb() { bomb.visible = false; bombLight.intensity = 0; },
    update(dt, t) {
      for (const tr of tracers) {
        if (!tr.mesh.visible) continue;
        tr.life -= dt;
        if (tr.life <= 0) tr.mesh.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) { flashSprite.visible = false; flashLight.intensity = 0; }
      }
      let anySpark = false;
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 14 * dt;
        if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] = 0; }
        anySpark = true;
      }
      if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
      for (const s of smokes) {
        if (!s.sprite.visible) continue;
        s.life += dt;
        const f = s.life / s.max;
        if (f >= 1) { s.sprite.visible = false; continue; }
        const sc = 1.2 + s.grow * s.life;
        s.sprite.scale.set(sc, sc, 1);
        s.sprite.material.opacity = 0.85 * (1 - f * f);
        s.sprite.position.y += dt * 0.35;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const f = 1 - boomLife / 0.7;
        boomMesh.scale.setScalar(1 + f * 9);
        boomMesh.material.opacity = 0.85 * (1 - f);
        boomLight.intensity = 60 * (1 - f);
        if (boomLife <= 0) { boomMesh.visible = false; boomLight.intensity = 0; }
      }
      if (bomb.visible) {
        bombBlinkT += dt;
        const on = (bombBlinkT % 0.9) < 0.45;
        bombBlinkMat.emissiveIntensity = on ? 2.5 : 0.1;
        bombLight.intensity = on ? 5 : 0;
      }
    },
  };
}
