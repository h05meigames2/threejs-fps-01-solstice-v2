// The attackers: four bots (ASH, CINDER, EMBER, SLAG) who push the three
// lanes, plant the device at a site and guard it. Each bot perceives through
// a view cone, line of sight and gunfire noise; fights in bursts with
// strafes and crouches; and falls over when killed. One shared raycaster,
// reused vectors, no allocations in the step.
import * as THREE from 'three';
import { CONFIG, BOT_NAMES } from './config.js';
import { NAV, pickLane, laneTarget, nearestPoint } from './nav.js';

const BOT_SPEED = 3.6;
const BOT_ENGAGE_RANGE = 55;
const FOV_COS = Math.cos(THREE.MathUtils.degToRad(75));

export function createBots(scene, world, effects, audio) {
  const group = new THREE.Group();
  scene.add(group);
  const raycaster = new THREE.Raycaster();
  const _eye = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const bots = [];
  let carrierId = 0;

  function buildMesh(i) {
    const g = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.9 });
    const visor = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff7a2a, emissiveIntensity: 1.8 });
    const vest = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.9 });

    // Legs pivot at the hip: geometry shifted down so rotation.x swings the
    // whole leg from the hip, not from mid-thigh. Knee pads ride the legs.
    const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
    legGeo.translate(0, -0.39, 0);
    const legL = new THREE.Mesh(legGeo, dark);
    legL.position.set(-0.11, 0.78, 0);
    const legR = legL.clone(); legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), uniform);
    torso.position.y = 1.12;
    const vestM = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.32), vest);
    vestM.position.y = 1.14;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), uniform);
    head.position.y = 1.64;
    const visorM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.02), visor);
    visorM.position.set(0, 1.66, 0.17);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.72), dark);
    gun.position.set(0.18, 1.2, 0.28);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.14), vest);
    pack.position.set(0, 1.15, -0.22);
    // v2 — modelled soldier: helmet, shoulder pads and arms that hold the
    // rifle, so the raider reads as a person at a glance, not a target.
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), dark);
    helmet.position.y = 1.84;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.42), dark);
    brim.position.set(0, 1.79, 0.03);
    const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.32), vest);
    padL.position.set(-0.32, 1.44, 0);
    const padR = padL.clone(); padR.position.x = 0.32;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.14), uniform);
    armL.position.set(-0.3, 1.18, 0.16);
    armL.rotation.x = -0.7;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.14), uniform);
    armR.position.set(0.3, 1.18, 0.2);
    armR.rotation.x = -0.9;
    const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.05), vest);
    kneeL.position.set(0, -0.16, 0.1);
    legL.add(kneeL);
    const kneeR = kneeL.clone();
    legR.add(kneeR);

    g.add(legL, legR, torso, vestM, head, visorM, gun, pack,
      helmet, brim, padL, padR, armL, armR);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    // hit meshes: head counts double, torso normal, legs reduced
    head.userData = { bot: i, part: 'head' };
    helmet.userData = { bot: i, part: 'head' };
    torso.userData = { bot: i, part: 'body' };
    vestM.userData = { bot: i, part: 'body' };
    legL.userData = { bot: i, part: 'leg' };
    legR.userData = { bot: i, part: 'leg' };
    g.userData.hitMeshes = [head, helmet, torso, vestM, legL, legR];
    g.userData.visor = visorM;
    // v2 — walk-cycle + aim-pose pivots (legs swing, arms raise the rifle)
    g.userData.limbs = { legL, legR, armL, armR, gun };
    return g;
  }

  function spawnBot(i, rng) {
    const mesh = buildMesh(i);
    group.add(mesh);
    const lane = pickLane(rng);
    const b = {
      id: i,
      name: BOT_NAMES[i],
      mesh,
      pos: new THREE.Vector3(),
      yaw: 0,
      hp: CONFIG.botHealth,
      alive: true,
      lane,
      site: laneTarget(lane),
      path: NAV.lanes[lane].slice(),
      pathIdx: 0,
      mode: 'advance',      // advance | hold | plant | guard | hunt | dead
      thinkT: Math.random() * 0.2,
      seeT: -10,            // last time player was seen
      lastSeen: new THREE.Vector3(),
      lastHeard: null,
      heardT: -10,
      burstLeft: 0,
      shotT: 0,
      burstPauseT: 0,
      plantT: 0,
      strafeDir: 1,
      strafeT: 0,
      crouched: false,
      speed: BOT_SPEED * (0.92 + rng() * 0.16),
      accuracy: 0.85 + rng() * 0.3, // higher = worse aim
      respawnGuard: false,
    };
    bots.push(b);
    return b;
  }

  function reset(rng) {
    carrierId = 0;
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const s = world.spawns.bots[i];
      b.pos.set(s.x, 0, s.z);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.set(0, 0, 0);
      b.mesh.visible = true;
      b.hp = CONFIG.botHealth;
      b.alive = true;
      b.lane = pickLane(rng);
      b.site = laneTarget(b.lane);
      b.path = NAV.lanes[b.lane].slice();
      b.pathIdx = 0;
      b.mode = 'advance';
      b.seeT = -10;
      b.heardT = -10;
      b.burstLeft = 0;
      b.plantT = 0;
      b.crouched = false;
    }
  }

  function collide(b, dx, dz) {
    const R = 0.42;
    b.pos.x += dx;
    b.pos.z += dz;
    for (const c of world.colliders) {
      if (b.pos.x + R <= c.minX || b.pos.x - R >= c.maxX) continue;
      if (b.pos.z + R <= c.minZ || b.pos.z - R >= c.maxZ) continue;
      // push out along the smaller penetration
      const px = Math.min(b.pos.x + R - c.minX, c.maxX - (b.pos.x - R));
      const pz = Math.min(b.pos.z + R - c.minZ, c.maxZ - (b.pos.z - R));
      if (px < pz) b.pos.x += (b.pos.x < (c.minX + c.maxX) / 2) ? -px : px;
      else b.pos.z += (b.pos.z < (c.minZ + c.maxZ) / 2) ? -pz : pz;
    }
    b.pos.x = Math.max(-45, Math.min(45, b.pos.x));
    b.pos.z = Math.max(-33, Math.min(33, b.pos.z));
  }

  function canSee(b, playerPos, now, smoke) {
    _eye.set(b.pos.x, b.pos.y + 1.55, b.pos.z);
    _to.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
    const dist = _eye.distanceTo(_to);
    if (dist > BOT_ENGAGE_RANGE) return false;
    _dir.subVectors(_to, _eye).normalize();
    _fwd.set(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
    if (_dir.dot(_fwd) < FOV_COS - 0.25 && dist > 8) return false; // outside the cone
    // smoke screens the line of sight
    if (smoke) {
      for (const s of smoke) {
        _v1.subVectors(_to, _eye);
        const segLen = _v1.length();
        _v1.normalize();
        const t = THREE.MathUtils.clamp(_v2.set(s.x, s.y, s.z).sub(_eye).dot(_v1), 0, segLen);
        const closest = _v3.copy(_eye).addScaledVector(_v1, t);
        if (closest.distanceTo(_v2.set(s.x, s.y, s.z)) < s.r) return false;
      }
    }
    raycaster.set(_eye, _dir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootMeshes, false);
    return hits.length === 0;
  }

  function botShoot(b, player, now, dt, onPlayerHit, onEnemyShot) {
    // burst fire: 3-5 shots, then a pause; accuracy falls with distance
    if (b.burstLeft <= 0) {
      if (b.burstPauseT > 0) { b.burstPauseT -= dt; return; }
      b.burstLeft = 3 + Math.floor(Math.random() * 3);
      b.burstPauseT = 0.7 + Math.random() * 0.9;
    }
    b.shotT -= dt;
    if (b.shotT > 0) return;
    b.shotT = 0.13;
    b.burstLeft--;

    _eye.set(b.pos.x, b.pos.y + 1.45, b.pos.z);
    const target = _to.set(player.pos.x, player.pos.y + 1.15, player.pos.z);
    const dist = _eye.distanceTo(target);
    _dir.subVectors(target, _eye).normalize();
    // spread grows with distance and with the bot's own movement
    const spread = (0.012 + dist * 0.0009) * b.accuracy;
    _dir.x += (Math.random() - 0.5) * spread * 2;
    _dir.y += (Math.random() - 0.5) * spread * 2;
    _dir.z += (Math.random() - 0.5) * spread * 2;
    _dir.normalize();
    _muzzle.copy(_eye).addScaledVector(_dir, 0.8);
    effects.muzzle(_muzzle);
    audio.enemyShot(dist);
    // v2 — hearing cue: the defender hears the shot's direction.
    if (onEnemyShot) onEnemyShot(b, dist);

    // hit test: ray against the player's chest/head spheres (reused temps)
    const toChest = _v1.subVectors(_v2.set(player.pos.x, player.pos.y + 1.1, player.pos.z), _eye);
    const proj = toChest.dot(_dir);
    let hitPart = null;
    if (proj > 0 && proj < 120) {
      const perp = _v3.copy(toChest).addScaledVector(_dir, -proj).length();
      if (perp < 0.42) hitPart = 'body';
      const toHead = _v2.set(player.pos.x, player.pos.y + player.eyeHeight + 0.08, player.pos.z).sub(_eye);
      const projH = toHead.dot(_dir);
      if (projH > 0 && projH < 120) {
        const perpH = _v3.copy(toHead).addScaledVector(_dir, -projH).length();
        if (perpH < 0.26) hitPart = 'head';
      }
    }
    // world block check
    raycaster.set(_eye, _dir);
    raycaster.far = 120;
    const wall = raycaster.intersectObjects(world.shootMeshes, false);
    const wallDist = wall.length ? wall[0].distance : 120;
    const end = _v3.copy(_eye).addScaledVector(_dir, Math.min(wallDist, 120));
    effects.tracer(_muzzle, end, 0xff8a3a);
    if (hitPart && proj < wallDist) {
      const falloff = Math.max(0.5, 1 - dist / 140);
      const dmg = (hitPart === 'head' ? 34 : 17) * falloff;
      onPlayerHit(dmg, hitPart, b);
    } else if (wall.length) {
      effects.sparks(wall[0].point, 4);
    }
  }

  function moveToward(b, tx, tz, dt, speed) {
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const vx = (dx / d) * speed, vz = (dz / d) * speed;
    const targetYaw = Math.atan2(-vx, -vz);
    let dy = targetYaw - b.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    b.yaw += THREE.MathUtils.clamp(dy, -dt * 6, dt * 6);
    collide(b, vx * dt, vz * dt);
    return false;
  }

  return {
    bots,
    get carrier() { return bots[carrierId]; },
    init(rng) {
      for (let i = 0; i < CONFIG.botCount; i++) spawnBot(i, rng);
    },
    reset,
    // Keep meshes where the sim says the bots are (used by staged shots,
    // where the per-step update is frozen so the frame holds still).
    syncMeshes() {
      for (const b of bots) {
        b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
        b.mesh.rotation.set(0, b.yaw, 0);
      }
    },
    hitMeshes() {
      const out = [];
      for (const b of bots) if (b.alive) out.push(...b.mesh.userData.hitMeshes);
      return out;
    },
    aliveCount() { return bots.filter((b) => b.alive).length; },
    hearShot(pos) {
      for (const b of bots) {
        if (!b.alive) continue;
        if (b.pos.distanceTo(pos) < 45) {
          b.lastHeard = pos.clone();
          b.heardT = performance.now() / 1000;
        }
      }
    },
    update(dt, now, player, worldState, onPlayerHit, onPlanted, onEnemyShot) {
      const pAlive = player.alive;
      for (const b of bots) {
        if (!b.alive) continue;
        b.mesh.position.set(b.pos.x, b.pos.y + (b.crouched ? -0.25 : 0), b.pos.z);
        b.mesh.rotation.y = b.yaw;
        // v2 — walk cycle: legs swing while advancing, settle when holding;
        // arms lift the rifle to the shoulder while engaging.
        const L = b.mesh.userData.limbs;
        const walking = b.mode === 'advance';
        const swing = walking ? Math.sin(now * 9 + b.id * 1.7) * 0.55 : 0;
        L.legL.rotation.x = swing;
        L.legR.rotation.x = -swing;
        b.mesh.position.y = b.pos.y + (b.crouched ? -0.25 : 0)
          + (walking ? Math.abs(Math.sin(now * 9 + b.id * 1.7)) * 0.03 : 0);
        const engaging = pAlive && (now - b.seeT) < 1.2;
        const aim = engaging ? 1 : 0;
        L.armR.rotation.x = -0.9 - aim * 0.35;
        L.armL.rotation.x = -0.7 - aim * 0.25;
        L.gun.rotation.x = -aim * 0.12;

        b.thinkT -= dt;
        const smoke = worldState.smoke;
        if (b.thinkT <= 0) {
          b.thinkT = 0.15;
          if (pAlive && canSee(b, player.pos, now, smoke)) {
            b.seeT = now;
            b.lastSeen.copy(player.pos);
          }
        }

        if (worldState.phase === 'planted' || worldState.phase === 'live') {
          if (b.id === carrierId && !worldState.bombPlanted && b.mode !== 'plant') {
            // carrier pushes to its site
            if (b.mode !== 'advance') b.mode = 'advance';
          }
        }

        if (engaging) {
          // face the player, strafe, fire in bursts
          const dx = player.pos.x - b.pos.x, dz = player.pos.z - b.pos.z;
          const targetYaw = Math.atan2(-dx, -dz);
          let dy = targetYaw - b.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          b.yaw += THREE.MathUtils.clamp(dy, -dt * 8, dt * 8);
          b.strafeT -= dt;
          if (b.strafeT <= 0) { b.strafeT = 0.6 + Math.random() * 0.8; b.strafeDir *= -1; }
          const dist = Math.hypot(dx, dz);
          if (dist > 14) {
            moveToward(b, player.pos.x, player.pos.z, dt, b.speed * 0.8);
          } else {
            const sx = Math.cos(b.yaw) * b.strafeDir, sz = -Math.sin(b.yaw) * b.strafeDir;
            collide(b, sx * b.speed * 0.5 * dt, sz * b.speed * 0.5 * dt);
            b.crouched = Math.random() < 0.02 ? !b.crouched : b.crouched;
          }
          botShoot(b, player, now, dt, onPlayerHit, onEnemyShot);
          continue;
        }

        // not engaging: follow the plan
        if (b.mode === 'plant') {
          b.plantT += dt;
          b.crouched = true;
          if (b.plantT >= CONFIG.plantTime) {
            b.mode = 'guard';
            b.crouched = false;
            onPlanted(b);
          }
          continue;
        }
        if (b.mode === 'guard' || b.mode === 'hold') {
          // hold position, scan
          b.yaw += dt * 0.5 * (b.id % 2 ? 1 : -1);
          if (b.heardT > now - 3 && b.lastHeard) {
            moveToward(b, b.lastHeard.x, b.lastHeard.z, dt, b.speed);
          }
          continue;
        }
        // advance along the lane
        const site = world.sites[b.site];
        const wp = b.path[Math.min(b.pathIdx, b.path.length - 1)];
        const arrived = moveToward(b, wp.x, wp.z, dt, b.speed);
        if (arrived) {
          b.pathIdx++;
          if (b.pathIdx >= b.path.length) {
            const dSite = Math.hypot(b.pos.x - site.x, b.pos.z - site.z);
            if (dSite < 5) {
              if (b.id === carrierId && !worldState.bombPlanted && worldState.phase === 'live') {
                b.mode = 'plant';
                b.plantT = 0;
              } else {
                b.mode = 'guard';
                const hold = nearestPoint(NAV.holds[b.site], b.pos.x, b.pos.z);
                b.path = [hold];
                b.pathIdx = 0;
              }
            } else {
              // reroute: walk straight to the site
              b.path = [{ x: site.x, z: site.z }];
              b.pathIdx = 0;
            }
          }
        }
      }
    },
    damage(botId, amount, part) {
      const b = bots[botId];
      if (!b || !b.alive) return false;
      b.hp -= amount;
      if (b.hp <= 0) {
        b.hp = 0;
        b.alive = false;
        b.mode = 'dead';
        // fall over
        b.mesh.rotation.x = -Math.PI / 2;
        b.mesh.position.y = 0.25;
        // carrier dies: next alive bot carries
        if (botId === carrierId) {
          const next = bots.find((x) => x.alive);
          if (next) carrierId = next.id;
        }
        return true; // killed
      }
      // getting shot wakes the bot up
      b.seeT = performance.now() / 1000;
      return false;
    },
  };
}
