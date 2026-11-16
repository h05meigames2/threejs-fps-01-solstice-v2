// Weapons: one view model per gun, a magazine, reload, recoil and the spread
// that punishes firing on the move. Hitscan is resolved by main.js; this
// module owns the gun's state and feel — kick, bloom, ADS and the reload
// timer — and tells main.js when a shot actually leaves the barrel.
import * as THREE from 'three';
import { CONFIG, WEAPONS, GEAR } from './config.js';

const VIEW_POS = { x: 0.28, y: -0.26, z: -0.5 };
const ADS_POS = { x: 0, y: -0.185, z: -0.34 };

function buildViewModel(scene, key) {
  // A simple rifle silhouette from boxes, dark metal with a warm wood grip.
  // Different barrel lengths / scopes per weapon so the eye can tell them apart.
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.45, metalness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.6, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2b, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffb45e, emissive: 0xffb45e, emissiveIntensity: 0.35 });
  const def = WEAPONS[key];
  const barrelLen = key === 'longshot' ? 0.62 : key === 'scatter' ? 0.5 : key === 'wasp' ? 0.34 : 0.44;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.42), metal);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, barrelLen, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -0.21 - barrelLen / 2 + 0.1);
  g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), wood);
  grip.position.set(0, -0.11, 0.1);
  grip.rotation.x = 0.25;
  g.add(grip);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, key === 'wasp' ? 0.2 : 0.14, 0.08), dark);
  mag.position.set(0, -0.12, -0.03);
  mag.rotation.x = 0.12;
  g.add(mag);
  if (key === 'longshot' || key === 'vk7') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.095, -0.02);
    g.add(scope);
  }
  if (key === 'scatter') {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.2), wood);
    pump.position.set(0, -0.045, -0.28);
    g.add(pump);
  }
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), accent);
  sight.position.set(0, 0.08, -0.18);
  g.add(sight);
  g.position.set(VIEW_POS.x, VIEW_POS.y, VIEW_POS.z);
  scene.add(g);
  return g;
}

export function createWeapons(camera) {
  const state = {
    owned: { p9: true },
    current: 'p9',
    mag: {},          // per-weapon magazine
    reserve: {},      // per-weapon reserve
    reloading: false,
    reloadT: 0,
    cooldown: 0,
    bloom: 0,         // accumulated spread from firing
    kick: 0,          // view-model kick, decays
    ads: 0,           // 0 hip .. 1 aimed
    grenades: { frag: 0, smoke: 0 },
    armor: false,
    switchT: 0,
  };
  for (const k of Object.keys(WEAPONS)) {
    state.mag[k] = WEAPONS[k].mag;
    state.reserve[k] = WEAPONS[k].reserve;
  }

  let viewModel = buildViewModel(camera, 'p9');
  const _v = new THREE.Vector3();

  function def() { return WEAPONS[state.current]; }

  return {
    state,
    viewModel,

    resetForRound(keepWeapons) {
      if (!keepWeapons) {
        state.owned = { p9: true };
        state.current = 'p9';
        state.grenades = { frag: 0, smoke: 0 };
        state.armor = false;
        for (const k of Object.keys(WEAPONS)) {
          state.mag[k] = WEAPONS[k].mag;
          state.reserve[k] = WEAPONS[k].reserve;
        }
      }
      state.reloading = false;
      state.cooldown = 0;
      state.bloom = 0;
      this.equip(state.current);
    },

    buy(key) {
      if (key === 'armor') {
        if (state.armor) return false;
        state.armor = true;
        return true;
      }
      if (key === 'frag' || key === 'smoke') {
        if (state.grenades[key] >= 2) return false;
        state.grenades[key]++;
        return true;
      }
      const w = WEAPONS[key];
      if (!w || state.owned[key]) return false;
      state.owned[key] = true;
      state.mag[key] = w.mag;
      state.reserve[key] = w.reserve;
      this.equip(key);
      return true;
    },

    equip(key) {
      if (!state.owned[key] || state.current === key) return false;
      state.current = key;
      state.reloading = false;
      state.switchT = 0.28;
      camera.remove(viewModel);
      viewModel = buildViewModel(camera, key);
      this.viewModel = viewModel;
      return true;
    },

    startReload(audio) {
      const d = def();
      if (state.reloading || state.mag[state.current] >= d.mag || state.reserve[state.current] <= 0) return false;
      state.reloading = true;
      state.reloadT = d.reload;
      if (audio) audio.reload();
      return true;
    },

    // Called every fixed step. Returns 'shot' when a round leaves the barrel.
    update(dt, input, playerState, audio) {
      const d = def();
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.switchT = Math.max(0, state.switchT - dt);
      state.bloom = Math.max(0, state.bloom - dt * 0.09);
      state.kick = Math.max(0, state.kick - dt * 6);

      const wantAds = input.ads() && !state.reloading;
      state.ads += ((wantAds ? 1 : 0) - state.ads) * Math.min(1, dt * 10);

      if (state.reloading) {
        state.reloadT -= dt;
        if (state.reloadT <= 0) {
          state.reloading = false;
          const need = d.mag - state.mag[state.current];
          const take = Math.min(need, state.reserve[state.current]);
          state.mag[state.current] += take;
          state.reserve[state.current] -= take;
        }
      }

      // view model: sway with movement, kick on fire, ADS centring
      const bob = playerState.moving ? Math.sin(performance.now() * 0.008) * 0.008 : 0;
      const tx = VIEW_POS.x + (ADS_POS.x - VIEW_POS.x) * state.ads;
      const ty = VIEW_POS.y + (ADS_POS.y - VIEW_POS.y) * state.ads + bob;
      const tz = VIEW_POS.z + (ADS_POS.z - VIEW_POS.z) * state.ads + state.kick * 0.09;
      viewModel.position.set(tx, ty, tz);
      viewModel.rotation.x = state.kick * 0.14 + (state.reloading ? -0.5 : 0);

      const gap = 60 / d.rpm;
      const wantFire = input.firing && !state.reloading && state.switchT <= 0;
      if (!wantFire) return null;
      if (state.cooldown > 0) return null;
      if (state.mag[state.current] <= 0) {
        state.cooldown = 0.25;
        if (audio) audio.dryFire();
        this.startReload(audio);
        return 'dry';
      }
      state.cooldown = gap;
      state.mag[state.current]--;
      state.bloom = Math.min(0.09, state.bloom + d.recoil * 0.9);
      state.kick = Math.min(1, state.kick + d.kick);
      if (!d.auto) input.firing = false; // semi-auto: one shot per click
      return 'shot';
    },

    // Current half-angle spread, radians. Moving, firing and hip-fire widen it.
    // v2 — counter-strafe: just after reversing a strafe, once the feet have
    // nearly stopped, the cone tightens sharply — stopping to aim pays.
    spread(playerState) {
      const d = def();
      const move = Math.min(1, playerState.speed2D / 5);
      let s = d.spread + state.bloom;
      s += move * (d.moveSpread - d.spread);
      if (playerState.crouched) s *= 0.7;
      if (this.steady(playerState)) s *= CONFIG.counterStrafeSpread;
      s = s * (1 - state.ads) + d.adsSpread * state.ads;
      return Math.max(s, 0.0005);
    },

    // True while the counter-strafe window is open and the player is
    // (nearly) still — the HUD shows STEADY then.
    steady(playerState) {
      return playerState.strafeFlipT < CONFIG.counterStrafeWindow
        && playerState.speed2D < CONFIG.counterStrafeMaxSpeed;
    },

    recoilPitch() { return def().recoil; },
    muzzleWorld(out, eye, forward) {
      // muzzle sits just below-right of the camera, forward of it
      out.copy(eye).addScaledVector(forward, 0.7);
      out.x += 0.2; out.y -= 0.18;
      return out;
    },
  };
}
