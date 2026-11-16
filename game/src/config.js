// SOLSTICE tuning — every number the game balances on lives here, in one
// place, so the round, weapons and bots all read the same truth.
export const CONFIG = {
  roundTime: 100,        // seconds of live round
  buyTime: 20,           // seconds of buy phase (B skips)
  roundsToWin: 7,
  maxRounds: 13,
  plantTime: 3.5,        // seconds to plant the device
  defuseTime: 5.0,       // seconds to defuse (hold E)
  bombTimer: 35,         // seconds from plant to detonation
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,  // extra per consecutive loss, capped at 2 steps
  playerHealth: 100,
  botHealth: 100,
  botCount: 4,
  // v2 — wallbangs: damage kept when a bullet punches through thin cover
  // (fraction of the hit's damage, by cover material).
  penetration: { wood: 0.6, thinMetal: 0.5, stone: 0.35 },
  // v2 — counter-strafing: stopping dead right after reversing a strafe
  // steadies the aim for a short window (fraction of spread kept).
  counterStrafeWindow: 0.22, // seconds after the strafe flip
  counterStrafeSpread: 0.55,
  counterStrafeMaxSpeed: 2.5,
  gravity: 22,
  playerRadius: 0.42,
  playerEyeStand: 1.62,
  playerEyeCrouch: 1.05,
  walkSpeed: 5.2,
  sprintSpeed: 6.8,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 11,
};

// Weapons: damage is per pellet at close range; falloff starts past
// `falloffStart` metres and bottoms at `falloffMin` (fraction of damage).
// Spread is in radians (half-angle); moving / firing widens it.
export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', slot: 1, price: 0, auto: false, rpm: 320,
    damage: 34, headMult: 2.2, legMult: 0.8, mag: 12, reserve: 48,
    reload: 1.15, spread: 0.011, moveSpread: 0.030, adsSpread: 0.004,
    recoil: 0.011, falloffStart: 18, falloffMin: 0.55, range: 90,
    tracer: 0xffd9a0, kick: 0.35,
  },
  wasp: {
    name: 'Wasp SMG', slot: 2, price: 1200, auto: true, rpm: 780,
    damage: 26, headMult: 2.0, legMult: 0.8, mag: 28, reserve: 112,
    reload: 1.7, spread: 0.016, moveSpread: 0.042, adsSpread: 0.007,
    recoil: 0.009, falloffStart: 16, falloffMin: 0.45, range: 80,
    tracer: 0xffc27a, kick: 0.3,
  },
  scatter: {
    name: 'Scattergun', slot: 3, price: 1100, auto: false, rpm: 75,
    damage: 15, pellets: 8, headMult: 1.8, legMult: 0.8, mag: 6, reserve: 24,
    reload: 2.4, spread: 0.055, moveSpread: 0.075, adsSpread: 0.040,
    recoil: 0.05, falloffStart: 9, falloffMin: 0.25, range: 40,
    tracer: 0xffe9c0, kick: 1.0,
  },
  vk7: {
    name: 'VK-7 Carbine', slot: 4, price: 2700, auto: true, rpm: 600,
    damage: 33, headMult: 2.4, legMult: 0.8, mag: 30, reserve: 90,
    reload: 2.0, spread: 0.009, moveSpread: 0.028, adsSpread: 0.003,
    recoil: 0.014, falloffStart: 24, falloffMin: 0.6, range: 120,
    tracer: 0xffb45e, kick: 0.45,
  },
  longshot: {
    name: 'Longshot DMR', slot: 5, price: 4000, auto: false, rpm: 55,
    damage: 88, headMult: 2.6, legMult: 0.8, mag: 5, reserve: 20,
    reload: 2.8, spread: 0.002, moveSpread: 0.05, adsSpread: 0.0008,
    recoil: 0.06, falloffStart: 40, falloffMin: 0.8, range: 160,
    tracer: 0xfff2d0, kick: 1.2,
  },
};

export const GEAR = {
  armor: { name: 'Plated Vest', price: 650, absorb: 0.5 },
  frag: { name: 'Frag Grenade', price: 300 },
  smoke: { name: 'Smoke Grenade', price: 300 },
};

export const BOT_NAMES = ['ASH', 'CINDER', 'EMBER', 'SLAG'];
