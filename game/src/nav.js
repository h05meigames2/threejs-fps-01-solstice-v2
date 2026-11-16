// Waypoint graph for the bots: three lanes from the north spawn to the two
// sites, with hold points where bots stop, watch and plant. Paths are plain
// arrays of {x,z}; bots walk them node to node, so routes read as tactics,
// not wandering.
export const NAV = {
  // lanes: west ridge -> A, mid pass -> A or B, east gully -> B
  lanes: {
    west: [
      { x: -8, z: -30 }, { x: -14, z: -22 }, { x: -18, z: -12 }, { x: -22, z: -16 },
    ],
    midA: [
      { x: -2, z: -31 }, { x: -4, z: -20 }, { x: -6, z: -12 }, { x: -14, z: -14 }, { x: -20, z: -14 },
    ],
    midB: [
      { x: 4, z: -30 }, { x: 6, z: -18 }, { x: 10, z: -12 }, { x: 16, z: -14 }, { x: 20, z: -16 },
    ],
    east: [
      { x: 10, z: -31 }, { x: 16, z: -24 }, { x: 20, z: -18 }, { x: 22, z: -16 },
    ],
  },
  // where a bot stops and holds an angle once it reaches a site
  holds: {
    A: [
      { x: -18, z: -10 }, { x: -28, z: -20 }, { x: -16, z: -20 }, { x: -24, z: -6 },
    ],
    B: [
      { x: 18, z: -12 }, { x: 28, z: -10 }, { x: 20, z: -22 }, { x: 30, z: -18 },
    ],
  },
  // fallback wander points if a bot loses its route
  roam: [
    { x: 0, z: -8 }, { x: -12, z: 2 }, { x: 12, z: 0 }, { x: -20, z: 8 }, { x: 20, z: 10 },
  ],
};

export function pickLane(rng) {
  const keys = Object.keys(NAV.lanes);
  return keys[Math.floor(rng() * keys.length)];
}

export function laneTarget(lane) {
  return lane === 'west' || lane === 'midA' ? 'A' : 'B';
}

export function nearestPoint(points, x, z) {
  let best = points[0], bd = Infinity;
  for (const p of points) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
