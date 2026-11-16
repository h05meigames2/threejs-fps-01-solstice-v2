// SOLSTICE palette — golden-hour alpine observatory.
// One chosen palette, used by world, HUD and effects alike: warm low sun,
// cold snow and rock, deep pine green, and a single hot accent for tracers
// and the bomb light. Bright, high-contrast, reads at a glance.
export const PALETTE = {
  skyTop: 0x2e4a7a,      // deep dusk blue overhead
  skyHorizon: 0xffb45e,  // golden horizon band
  sun: 0xffd9a0,         // low sun disc / key light
  sunLight: 0xffc27a,    // directional light colour
  snow: 0xf2f0ea,        // snow fields
  snowShadow: 0xc9d2e0,  // snow in shadow
  rock: 0x6d6a66,        // granite outcrops
  rockDark: 0x45424a,
  pine: 0x1e4d33,        // pine green
  pineDark: 0x143626,
  wood: 0x7a5230,        // timber huts / crates
  woodDark: 0x54371f,
  dome: 0xe8e4da,        // observatory dome white
  metal: 0x8f9aa3,       // antenna mast, railings
  metalDark: 0x3a4148,
  accent: 0xff5a1f,      // tracer / muzzle / bomb blink
  enemy: 0x232833,      // attacker uniform (dark navy, reads against snow)
  enemyVisor: 0xff7a2a,  // attacker visor glow
  ally: 0x2f6b4f,        // defender accent
  hudInk: '#f5f1e8',
  hudMuted: '#c8c2b4',
  hudAccent: '#ffb45e',
  hudDanger: '#ff5a1f',
};
