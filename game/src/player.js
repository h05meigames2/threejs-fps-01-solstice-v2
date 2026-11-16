// The player: acceleration-based movement with friction, crouch and jump,
// resolved as a circle against the world's AABB colliders one axis at a
// time. Eye height lerps between stand and crouch. Damage passes through
// armour first. The simulation owns the numbers; main.js owns the camera.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createPlayer(spawn) {
  const pos = new THREE.Vector3(spawn.x, 0, spawn.z);
  const vel = new THREE.Vector3();
  const state = {
    pos, vel,
    yaw: spawn.yaw || 0,
    pitch: 0,
    health: CONFIG.playerHealth,
    armor: 0,
    alive: true,
    crouched: false,
    onGround: true,
    eyeHeight: CONFIG.playerEyeStand,
    speed2D: 0,          // horizontal speed, for spread + HUD
    moving: false,
    // v2 — counter-strafe tracking: seconds since the last A/D direction
    // reversal, and the last strafe direction (-1 left, +1 right, 0 none).
    strafeFlipT: 99,
    lastStrafeDir: 0,
  };

  const R = CONFIG.playerRadius;

  function collideAxis(axis, delta) {
    // Move along one axis, then push out of any overlapping collider.
    if (axis === 0) pos.x += delta; else pos.z += delta;
    for (const c of state.colliders) {
      if (pos.y >= c.top) continue; // jumped clear of this obstacle
      if (pos.x + R <= c.minX || pos.x - R >= c.maxX) continue;
      if (pos.z + R <= c.minZ || pos.z - R >= c.maxZ) continue;
      if (axis === 0) {
        pos.x = delta > 0 ? c.minX - R : c.maxX + R;
        vel.x = 0;
      } else {
        pos.z = delta > 0 ? c.minZ - R : c.maxZ + R;
        vel.z = 0;
      }
    }
  }

  return {
    state,
    reset() {
      pos.set(spawn.x, 0, spawn.z);
      vel.set(0, 0, 0);
      state.yaw = spawn.yaw || 0;
      state.pitch = 0;
      state.health = CONFIG.playerHealth;
      state.alive = true;
      state.crouched = false;
      state.eyeHeight = CONFIG.playerEyeStand;
      state.strafeFlipT = 99;
      state.lastStrafeDir = 0;
    },
    setColliders(list) { state.colliders = list; },

    look(dx, dy) {
      state.yaw -= dx * 0.0022;
      state.pitch -= dy * 0.0022;
      const lim = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
    },

    update(dt, input) {
      if (!state.alive) return;
      const axis = input.axis();
      state.crouched = input.crouching();
      const wantCrouch = state.crouched;
      const targetEye = wantCrouch ? CONFIG.playerEyeCrouch : CONFIG.playerEyeStand;
      state.eyeHeight += (targetEye - state.eyeHeight) * Math.min(1, dt * 12);

      const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
      // forward is -z rotated by yaw
      let fx = -sin, fz = -cos;
      let rx = cos, rz = -sin;
      let mx = fx * -axis.z + rx * axis.x;
      let mz = fz * -axis.z + rz * axis.x;
      const len = Math.hypot(mx, mz);
      state.moving = len > 0.01;
      if (len > 0) { mx /= len; mz /= len; }

      // v2 — counter-strafe: reversing the strafe key (A<->D) starts a short
      // window in which the aim steadies once the feet stop.
      state.strafeFlipT += dt;
      const strafeDir = axis.x === 0 ? 0 : Math.sign(axis.x);
      if (strafeDir !== 0 && state.lastStrafeDir !== 0 && strafeDir !== state.lastStrafeDir) {
        state.strafeFlipT = 0;
      }
      if (strafeDir !== 0) state.lastStrafeDir = strafeDir;

      const sprint = input.sprinting() && !wantCrouch && axis.z < 0;
      const speed = wantCrouch ? CONFIG.crouchSpeed : (sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed);
      vel.x += mx * CONFIG.accel * dt;
      vel.z += mz * CONFIG.accel * dt;
      // friction when no input, and cap speed
      const hv = Math.hypot(vel.x, vel.z);
      if (len === 0 && hv > 0) {
        const f = Math.max(0, hv - CONFIG.friction * hv * dt);
        vel.x *= f / hv; vel.z *= f / hv;
      }
      const hv2 = Math.hypot(vel.x, vel.z);
      if (hv2 > speed) { vel.x *= speed / hv2; vel.z *= speed / hv2; }
      state.speed2D = Math.hypot(vel.x, vel.z);

      // jump
      if (input.consumePressed('Space') && state.onGround) {
        vel.y = 7.5;
        state.onGround = false;
      }
      vel.y -= CONFIG.gravity * dt;
      pos.y += vel.y * dt;
      if (pos.y <= 0) { pos.y = 0; vel.y = 0; state.onGround = true; }

      collideAxis(0, vel.x * dt);
      collideAxis(1, vel.z * dt);
    },

    damage(amount) {
      if (!state.alive) return 0;
      let remaining = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, amount * 0.5);
        state.armor -= absorbed;
        remaining = amount - absorbed;
      }
      state.health -= remaining;
      if (state.health <= 0) {
        state.health = 0;
        state.alive = false;
      }
      return remaining;
    },

    eye(out) {
      out.set(pos.x, pos.y + state.eyeHeight, pos.z);
      return out;
    },
    forward(out) {
      out.set(-Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
      return out;
    },
  };
}
