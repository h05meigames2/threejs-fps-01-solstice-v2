// SOLSTICE boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. Shooting is hitscan against bot hit meshes and the
// world; rounds, money and the device live in round.js; bots live in bots.js.
// ?shot=cover|play|site|end with &seed=N stages a deterministic frame for a
// capture, renders it, then sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CONFIG, WEAPONS } from './config.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createRound } from './round.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || 7);

// deterministic rng for staged shots and bot lanes
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 600);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && !shotMode && round.state.phase === 'live' && player.state.alive) {
    hud.showOverlay('paused');
  }
});
const player = createPlayer(world.spawns.player);
player.setColliders(world.colliders);
const weapons = createWeapons(camera);
const bots = createBots(scene, world, effects, audio);
bots.init(rng);
const round = createRound();
const hud = createHud({
  onPlay: () => deploy(),
  onBuy: (key) => tryBuy(key),
});

const raycaster = new THREE.Raycaster();
const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _point = new THREE.Vector3();

// v2 — hearing / threat cue: the last shot heard, as a bearing relative to
// the player's view (radians), a strength, and when it happened (seconds).
const threat = { rel: 0, strong: false, t: -99 };

function setThreat(fromX, fromZ, strong) {
  const dx = fromX - player.state.pos.x, dz = fromZ - player.state.pos.z;
  const bearing = Math.atan2(-dx, -dz); // yaw that would face the shooter
  let rel = bearing - player.state.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  threat.rel = rel;
  threat.strong = strong;
  threat.t = nowSec;
}

// live grenades: {mesh, vel, kind, fuse, bounced}
const grenades = [];
const smokeCenters = []; // {x,y,z,r,life} — blocks bot line of sight
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.4, metalness: 0.7 });

let prevPhase = 'menu';
let shotReadyAt = 0;
let shotStaged = false;
let shotRestaged = false;
let restageFrame = -1;
let frameNo = 0;
let shotAction = null; // re-fired just before capture: tracers live ~60 ms

function deploy() {
  audio.unlock();
  hud.hideOverlay();
  if (round.state.phase === 'menu' || round.state.phase === 'matchEnd') {
    startMatch();
  }
  renderer.domElement.requestPointerLock();
}

function startMatch() {
  round.resetMatch();
  resetPositions();
  hud.banner('ROUND 1', 'Buy phase — spend your $800, then hold the ridge.', 3);
}

function resetPositions() {
  player.reset();
  player.state.armor = weapons.state.armor ? 50 : 0;
  bots.reset(rng);
  weapons.resetForRound(true);
  effects.hideBomb();
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  smokeCenters.length = 0;
}

function tryBuy(key) {
  const check = round.buy(key);
  if (!check.ok) { hud.feed(check.why, false); return; }
  if (!weapons.buy(key)) { hud.feed('Already owned', false); return; }
  round.pay(check.price);
  if (key === 'armor') player.state.armor = 50;
  audio.buy();
  hud.feed(`Bought ${key === 'armor' ? 'Plated Vest' : key === 'frag' ? 'Frag Grenade' : key === 'smoke' ? 'Smoke Grenade' : WEAPONS[key].name}`);
}

function throwGrenade(kind) {
  if (weapons.state.grenades[kind] <= 0) return;
  weapons.state.grenades[kind]--;
  player.eye(_eye);
  player.forward(_fwd);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  mesh.position.copy(_eye).addScaledVector(_fwd, 0.5);
  scene.add(mesh);
  const vel = _fwd.clone().multiplyScalar(17).add(player.state.vel);
  vel.y += 3.5;
  grenades.push({ mesh, vel, kind, fuse: kind === 'frag' ? 1.6 : 99, bounced: false });
  audio.reload();
}

function explodeGrenade(g) {
  const p = g.mesh.position;
  effects.explosion(p);
  audio.explosion();
  const R = 8;
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
    if (d < R) {
      const dmg = Math.round(120 * (1 - d / R) + 10);
      if (bots.damage(b.id, dmg, 'body')) onBotKilled(b);
    }
  }
  const pd = Math.hypot(player.state.pos.x - p.x, player.state.pos.z - p.z);
  if (pd < R * 0.6 && player.state.alive) {
    const dmg = Math.round(70 * (1 - pd / R));
    hurtPlayer(dmg, 'body', null);
  }
  scene.remove(g.mesh);
}

function onBotKilled(b) {
  round.onKill();
  audio.kill();
  hud.hit(true);
  hud.feed(`You eliminated ${b.name}  +$${CONFIG.killReward}`);
  if (bots.aliveCount() === 0 && !round.state.bombPlanted && (round.state.phase === 'live')) {
    round.endRound('player', 'All raiders eliminated — the ridge is quiet.');
  }
}

function hurtPlayer(dmg, part, bot) {
  if (!player.state.alive) return;
  if (bot) setThreat(bot.pos.x, bot.pos.z, true);
  const dealt = player.damage(dmg);
  audio.hurt();
  hud.feed(bot ? `${bot.name} hit you (${part === 'head' ? 'headshot' : 'torso'})` : 'Caught by the blast', false);
  if (!player.state.alive) {
    input.firing = false;
    if (round.state.phase === 'live' || round.state.phase === 'planted') {
      round.endRound('bots', 'You were eliminated — the raiders take the ridge.');
    }
  }
}

function shoot() {
  const d = WEAPONS[weapons.state.current];
  player.eye(_eye);
  player.forward(_fwd);
  const spread = weapons.spread(player.state);
  const pellets = d.pellets || 1;
  let anyHit = false, anyKill = false;
  for (let p = 0; p < pellets; p++) {
    _dir.copy(_fwd);
    _dir.x += (Math.random() - 0.5) * spread * 2;
    _dir.y += (Math.random() - 0.5) * spread * 2;
    _dir.z += (Math.random() - 0.5) * spread * 2;
    _dir.normalize();
    raycaster.set(_eye, _dir);
    raycaster.far = d.range;
    const botHits = raycaster.intersectObjects(bots.hitMeshes(), false);
    const wallHits = raycaster.intersectObjects(world.shootMeshes, false);
    const wallDist = wallHits.length ? wallHits[0].distance : d.range;
    let end;
    if (botHits.length && botHits[0].distance < wallDist) {
      const h = botHits[0];
      const part = h.object.userData.part;
      const dist = h.distance;
      const falloff = dist < d.falloffStart ? 1 : Math.max(d.falloffMin, 1 - (dist - d.falloffStart) / 90);
      const mult = part === 'head' ? d.headMult : part === 'leg' ? d.legMult : 1;
      const dmg = Math.round(d.damage * mult * falloff);
      const killed = bots.damage(h.object.userData.bot, dmg, part);
      anyHit = true;
      if (killed) { anyKill = true; onBotKilled(bots.bots[h.object.userData.bot]); }
      else { audio.hit(); }
      end = h.point;
      effects.sparks(h.point, 3);
    } else if (wallHits.length && wallHits[0].object.userData.penetrable) {
      // v2 — wallbang: thin cover (crates, lodge, huts, low walls) can be
      // punched through at a damage cost. Re-cast from just past the wall;
      // a second solid wall behind it stops the bullet.
      const pen = wallHits[0].object.userData.penetrable;
      const wp = wallHits[0].point;
      effects.sparks(wp, 4);
      raycaster.set(_point.copy(wp).addScaledVector(_dir, 0.08), _dir);
      raycaster.far = d.range;
      const behind = raycaster.intersectObjects(bots.hitMeshes(), false);
      const wall2 = raycaster.intersectObjects(world.shootMeshes, false);
      const wall2Dist = wall2.length ? wall2[0].distance : d.range;
      if (behind.length && behind[0].distance < wall2Dist) {
        const h = behind[0];
        const part = h.object.userData.part;
        const dist = h.distance + wallDist;
        const falloff = dist < d.falloffStart ? 1 : Math.max(d.falloffMin, 1 - (dist - d.falloffStart) / 90);
        const mult = part === 'head' ? d.headMult : part === 'leg' ? d.legMult : 1;
        const dmg = Math.max(1, Math.round(d.damage * mult * falloff * pen));
        const killed = bots.damage(h.object.userData.bot, dmg, part);
        anyHit = true;
        if (killed) { anyKill = true; onBotKilled(bots.bots[h.object.userData.bot]); }
        else { audio.hit(); }
        hud.feed(`WALLBANG — ${bots.bots[h.object.userData.bot].name} through cover (${dmg})`);
        end = h.point;
        effects.sparks(h.point, 3);
      } else {
        end = wp;
      }
    } else if (wallHits.length) {
      end = wallHits[0].point;
      effects.sparks(end, 5);
    } else {
      end = _point.copy(_eye).addScaledVector(_dir, d.range);
    }
    weapons.muzzleWorld(_muzzle, _eye, _fwd);
    effects.tracer(_muzzle, end, d.tracer);
  }
  weapons.muzzleWorld(_muzzle, _eye, _fwd);
  effects.muzzle(_muzzle);
  audio.shot(weapons.state.current);
  bots.hearShot(player.state.pos);
  player.state.pitch += weapons.recoilPitch() * (0.7 + Math.random() * 0.6);
  if (anyHit) hud.hit(anyKill);
}

// ---- fixed-step simulation -----------------------------------------------
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let nowSec = 0;

function step(dt) {
  nowSec += dt;
  const rs = round.state;
  const prev = rs.phase;
  round.update(dt, world);
  if (rs.phase !== prev) {
    if (rs.phase === 'live') {
      // v2 — team-plan intel: the carrier's target site is real sim state,
      // so the round opens with a plan worth following, not a guess.
      const carrier = bots.carrier;
      const site = carrier ? world.sites[carrier.site] : null;
      const intel = site
        ? `Intel: carrier ${carrier.name} is pushing ${site.name} (${carrier.site}) — hold it.`
        : 'Hold the Dome and the Relay.';
      hud.banner(`ROUND ${rs.round}`, intel, 3.2);
      hud.feed(`Plan: hold ${site ? site.name : 'both sites'}`, true);
    } else if (rs.phase === 'buy' && prev === 'roundEnd') {
      resetPositions();
      hud.banner(`ROUND ${rs.round}`, `Buy phase — $${rs.money} to spend.`, 2.6);
    } else if (rs.phase === 'roundEnd') {
      if (rs.endWinner === 'player') audio.roundWin(); else audio.roundLose();
      if (!shotMode) hud.showOverlay('roundEnd', { winner: rs.endWinner, reason: rs.endReason });
    } else if (rs.phase === 'matchEnd') {
      if (!shotMode) hud.showOverlay('matchEnd', { winner: rs.matchWinner, wins: rs.wins, losses: rs.losses });
    }
  }

  // input: look + movement (frozen on overlays, except buy phase allows move)
  const overlayOpen = hud.overlayVisible() && !shotMode;
  if (!overlayOpen && player.state.alive) {
    const look = input.consumeLook();
    player.look(look.dx * (1 - weapons.state.ads * 0.55), look.dy * (1 - weapons.state.ads * 0.55));
    if (rs.phase !== 'menu') player.update(dt, input);
  } else {
    input.consumeLook();
  }

  // weapon slots / buy keys / grenades / reload / defuse
  if (!overlayOpen && rs.phase !== 'menu') {
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
      if (!input.consumePressed(code)) continue;
      const n = Number(code.slice(5));
      if (rs.phase === 'buy') {
        const buyKeys = ['wasp', 'scatter', 'vk7', 'longshot', 'armor'];
        tryBuy(buyKeys[n - 1]);
      } else {
        const slotKeys = Object.keys(WEAPONS).filter((k) => WEAPONS[k].slot === n);
        if (slotKeys.length) weapons.equip(slotKeys[0]);
      }
    }
    if (input.consumePressed('KeyB') && rs.phase === 'buy') round.startLive();
    if (input.consumePressed('KeyR')) weapons.startReload(audio);
    if (input.consumePressed('Digit6')) throwGrenade('frag');
    if (input.consumePressed('Digit7')) throwGrenade('smoke');
    // also allow 4/5 as grenade keys during live (slots are 1-5 weapons; grenades on 6/7)
    const fire = weapons.update(dt, input, player.state, audio);
    if (fire === 'shot' && player.state.alive) shoot();
  } else {
    weapons.update(dt, { ...input, firing: false, ads: () => false, axis: () => ({ x: 0, z: 0 }) }, player.state, null);
  }

  // bots (frozen during buy/menu/roundEnd)
  const worldState = { phase: rs.phase, bombPlanted: rs.bombPlanted, smoke: smokeCenters };
  if (!shotMode && (rs.phase === 'live' || rs.phase === 'planted')) {
    bots.update(dt, nowSec, player.state, worldState,
      (dmg, part, bot) => hurtPlayer(dmg, part, bot),
      (bot) => {
        round.onPlanted(bot.site, bot.pos);
        effects.showBomb(bot.pos);
        audio.plant();
        hud.banner('DEVICE PLANTED', `At site ${bot.site} — defuse it (hold E).`, 3);
        hud.feed(`Device planted at site ${bot.site}`, false);
      },
      // v2 — hearing cue: a raider's shot pings its direction, even unheard.
      (bot, dist) => { if (dist < 45) setThreat(bot.pos.x, bot.pos.z, false); });
  }

  // plant progress indicator (carrier planting)
  const carrier = bots.carrier;
  const planting = carrier && carrier.alive && carrier.mode === 'plant' && rs.phase === 'live';

  // defuse: hold E near the device
  let defusing = false;
  if (rs.phase === 'planted' && rs.bombPos && player.state.alive) {
    const d = Math.hypot(player.state.pos.x - rs.bombPos.x, player.state.pos.z - rs.bombPos.z);
    if (d < 2.4 && input.keys.has('KeyE')) {
      defusing = true;
      rs.defuseT += dt;
      if (Math.floor(rs.defuseT * 4) !== Math.floor((rs.defuseT - dt) * 4)) audio.defuseTick();
      if (rs.defuseT >= CONFIG.defuseTime) {
        effects.hideBomb();
        round.endRound('player', 'Device defused — the observatory stands.');
      }
    } else {
      rs.defuseT = Math.max(0, rs.defuseT - dt * 2);
    }
  }
  rs.defusing = defusing;

  // grenades
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p = g.mesh.position;
    if (p.y <= 0.12) {
      p.y = 0.12;
      if (!g.bounced) { g.bounced = true; if (g.kind === 'smoke') { deploySmoke(p); scene.remove(g.mesh); grenades.splice(i, 1); continue; } }
      g.vel.y *= -0.35;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
      if (Math.abs(g.vel.y) < 1) g.vel.y = 0;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      if (g.kind === 'frag') explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
  for (let i = smokeCenters.length - 1; i >= 0; i--) {
    smokeCenters[i].life -= dt;
    if (smokeCenters[i].life <= 0) smokeCenters.splice(i, 1);
  }

  // bomb detonation handled by round.update; clear the visual on round end
  if (rs.phase === 'roundEnd' && rs.endReason.includes('detonated')) {
    if (rs.bombPos) effects.explosion(new THREE.Vector3(rs.bombPos.x, 0.5, rs.bombPos.z));
    effects.hideBomb();
  }
  if (prev === 'planted' && rs.phase === 'roundEnd' && rs.endWinner === 'player') effects.hideBomb();

  effects.update(dt, nowSec);
  world.update(dt, nowSec);

  // camera
  player.eye(_eye);
  camera.position.copy(_eye);
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;
  camera.rotation.z = 0;
  const targetFov = 75 - weapons.state.ads * 20;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // HUD snapshot
  const w = weapons.state;
  const cur = WEAPONS[w.current];
  hud.update({
    health: player.state.health,
    armor: player.state.armor,
    mag: w.mag[w.current],
    reserve: w.reserve[w.current],
    weaponName: cur.name,
    money: rs.money,
    timer: rs.phase === 'planted' ? rs.bombTimer : rs.timer,
    wins: rs.wins,
    losses: rs.losses,
    round: rs.round,
    phase: rs.phase,
    spread: weapons.spread(player.state),
    ads: w.ads,
    owned: w.owned,
    hasArmor: w.armor,
    grenades: w.grenades,
    endReason: rs.endReason,
    bombTimer: rs.bombTimer,
    defusing: rs.defusing,
    defuseT: rs.defuseT,
    planting,
    plantT: carrier ? carrier.plantT : 0,
    // v2 — compass, zone callout, counter-strafe state, hearing cue
    yaw: player.state.yaw,
    posX: player.state.pos.x,
    posZ: player.state.pos.z,
    zone: world.zoneAt(player.state.pos.x, player.state.pos.z),
    sites: world.sites,
    steady: weapons.steady(player.state),
    threatRel: threat.rel,
    threatAge: nowSec - threat.t,
    threatStrong: threat.strong,
    hint: rs.phase === 'buy' ? 'Buy with mouse or keys 1–5 · B to deploy early'
      : rs.phase === 'planted' ? 'Hold E near the device to defuse'
      : '',
  }, dt);
}

function deploySmoke(p) {
  effects.smoke(p, true);
  smokeCenters.push({ x: p.x, y: 1.2, z: p.z, r: 3.2, life: 12 });
}

// ---- staged shots ---------------------------------------------------------
function stageShot() {
  const s = shotMode;
  startMatch();
  hud.banner('', '', 0); // staged shots want a clean frame, no banner
  round.startLive();
  const ps = player.state;
  if (s === 'cover') {
    // dramatic firefight: player just north of the lodge facing the Dome,
    // three raiders in the open between player and dome, one firing across.
    ps.pos.set(-2, 0, -1); ps.yaw = 0.96; ps.pitch = -0.04;
    weapons.buy('vk7'); weapons.equip('vk7');
    weapons.state.mag.vk7 = 24;
    const b0 = bots.bots[0], b1 = bots.bots[1];
    b0.pos.set(-12, 0, -8); b0.yaw = -2.18; b0.mode = 'hold';
    b1.pos.set(-16, 0, -6); b1.yaw = -1.91; b1.mode = 'hold';
    bots.bots[2].pos.set(-6, 0, -14); bots.bots[2].yaw = -2.84; bots.bots[2].mode = 'hold';
    bots.bots[3].pos.set(-20, 0, -10); bots.bots[3].yaw = -2.03; bots.bots[3].mode = 'hold';
    bots.syncMeshes();
    // one bot fires across the player's view right now (aimed just past the
    // player, so the tracer cuts diagonally across the frame)
    const botFire = () => {
      _eye.set(b0.pos.x, 1.45, b0.pos.z);
      _to.set(ps.pos.x + 2.5, 1.5, ps.pos.z + 1.5);
      effects.tracer(_eye, _to, 0xff8a3a);
      effects.muzzle(_eye);
    };
    botFire();
    // player fires too (direct shoot() skips the mag bookkeeping, so do it)
    weapons.state.mag.vk7--;
    shoot();
    shotAction = () => { botFire(); weapons.state.mag.vk7--; shoot(); };
    hud.feed('ASH spotted near the Dome', false);
  } else if (s === 'play') {
    ps.pos.set(-6, 0, 2); ps.yaw = 0.54; ps.pitch = -0.04;
    weapons.buy('wasp'); weapons.equip('wasp');
    const b0 = bots.bots[0];
    b0.pos.set(-12, 0, -8); b0.yaw = -2.3; b0.mode = 'hold';
    bots.bots[1].pos.set(-18, 0, -4); bots.bots[1].yaw = -2.0; bots.bots[1].mode = 'hold';
    bots.syncMeshes();
    weapons.state.mag.wasp--;
    shoot();
    shotAction = () => { weapons.state.mag.wasp--; shoot(); };
  } else if (s === 'site') {
    // at the Relay: device planted, beacon blinking, defender closing in
    ps.pos.set(12, 0, -6); ps.yaw = -0.50; ps.pitch = 0.10;
    weapons.buy('longshot'); weapons.equip('longshot');
    round.onPlanted('B', { x: 24, z: -16 });
    effects.showBomb({ x: 24, z: -16 });
    bots.bots[0].pos.set(20, 0, -12); bots.bots[0].mode = 'guard';
    bots.bots[1].pos.set(28, 0, -20); bots.bots[1].mode = 'guard';
  } else if (s === 'end') {
    round.endRound('player', 'All raiders eliminated — the ridge is quiet.');
    hud.showOverlay('roundEnd', { winner: 'player', reason: round.state.endReason });
  }
  shotStaged = true;
  shotReadyAt = performance.now() + 900;
  bots.syncMeshes(); // staged shots freeze the per-step update, so sync here
}

// ---- frame loop -----------------------------------------------------------
function frame() {
  // Use performance.now(), not the rAF timestamp: in some headless builds
  // the rAF timestamp runs on a lagging clock and can go backwards, which
  // starves the fixed-step accumulator.
  const now = performance.now();
  frameNo++;
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - last);
  last = now;
  acc += dtMs / 1000;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n++;
  }
  renderer.render(scene, camera);
  if (shotStaged && !shotRestaged && shotAction && performance.now() >= shotReadyAt - 120) {
    shotRestaged = true;
    restageFrame = frameNo;
    shotAction();
  }
  // __shotReady only after a frame has RENDERED with the restage in it:
  // headless frames run ~1 s apart, so setting it in the restage frame
  // would capture the pre-restage render.
  const actionDone = !shotAction || (shotRestaged && frameNo > restageFrame);
  if (shotStaged && actionDone && !window.__shotReady && performance.now() >= shotReadyAt) {
    window.__shotReady = true;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

hud.showOverlay('menu');
if (shotMode) {
  hud.hideOverlay(); // staged shots manage their own overlay (e.g. round end)
  stageShot();
} else {
  round.state.phase = 'menu';
}
requestAnimationFrame(frame);
