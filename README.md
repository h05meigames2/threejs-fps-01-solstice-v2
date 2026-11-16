# threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/h05meigames2/threejs-fps-01-solstice-v2/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/h05meigames2/threejs-fps-01-solstice-v2/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

**SOLSTICE v2** is an original round-based tactical FPS for the browser, built on three.js 0.187.0 with no build step and no network requests. You hold a golden-hour alpine observatory — the Dome (site A) and the Relay (site B) — for the Wardens against four raiders carrying a device. Rounds are won by eliminating the other side, stopping the plant, or defusing the device (hold E); the raiders win by detonating it or wiping your team. First to 7 rounds takes the match.

Between rounds a buy phase turns earnings (kill, win and loss bonuses) into five guns — the P9 sidearm, Wasp SMG, Scattergun, VK-7 Carbine and Longshot DMR — plus armour and frag/smoke grenades. Gunplay is hitscan with head/leg hit zones, distance falloff, spread that punishes firing on the move, recoil and bloom; stopping, crouching and aiming down sights all tighten the cone. v2 adds wallbangs — thin wood crates, the lodge, the huts and low stone walls can be shot through at a damage cost — and counter-strafing: tap the opposite strafe key and your aim steadies (STEADY) the instant your feet stop. The raiders are modelled soldiers now — helmeted, shoulder-padded, arms on their rifles, legs swinging in a walk cycle, rifles rising as they engage — and the fight talks back: a compass strip with site markers, a location callout for every corner of the ridge (Solstice Dome, Relay Mast, the Lodge, West Ridge, Mid Pass, East Gully), a round-opening intel plan naming the carrier's target site, and a threat chevron that points at the last shot you heard. Bots perceive through a view cone, line of sight and gunfire noise, follow a waypoint graph across the ridge's three lanes, hold sites, plant and guard the device, and fight with bursts, strafes and crouches. The map is fully original: a snowfield observatory under a low sun, a domed hall, a relay mast, pine stands and boulder cover, with procedural canvas textures and fully synthesised WebAudio sound — no asset files at all.

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080 — open it in desktop Chrome and click Deploy
# hand the entry in (what the grader runs):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=77v1ce78&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
