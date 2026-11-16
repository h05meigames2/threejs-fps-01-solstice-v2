// The DOM HUD: health, armour, ammo, money, round timer, score, kill feed,
// buy menu and the overlay panels. It never touches the simulation; main.js
// pushes a snapshot in and reads the play / buy callbacks out.
import { WEAPONS, GEAR } from './config.js';

const BUY_ITEMS = [
  { key: 'wasp', name: 'Wasp SMG', price: 1200, desc: 'Fast, close quarters' },
  { key: 'scatter', name: 'Scattergun', price: 1100, desc: '8 pellets, brutal up close' },
  { key: 'vk7', name: 'VK-7 Carbine', price: 2700, desc: 'The all-rounder' },
  { key: 'longshot', name: 'Longshot DMR', price: 4000, desc: 'One shot, long lanes' },
  { key: 'armor', name: 'Plated Vest', price: 650, desc: 'Absorbs half of each hit' },
  { key: 'frag', name: 'Frag Grenade', price: 300, desc: 'Throw with [6]' },
  { key: 'smoke', name: 'Smoke Grenade', price: 300, desc: 'Throw with [7]' },
];

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    killmarker: $('killmarker'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    armor: $('armor'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    score: $('score'),
    roundLabel: $('round-label'),
    feed: $('feed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    bomb: $('bomb'),
    bombTimer: $('bomb-timer'),
    defuse: $('defuse'),
    defuseFill: $('defuse-fill'),
    plant: $('plant'),
    plantFill: $('plant-fill'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    buy: $('buy'),
    buyGrid: $('buy-grid'),
    buyMoney: $('buy-money'),
    buyTimer: $('buy-timer'),
    hint: $('hint'),
    steady: $('steady'),
    threat: $('threat'),
    zone: $('zone'),
    compass: $('compass'),
  };
  const compassMarks = {};
  for (const span of els.compass.querySelectorAll('span')) compassMarks[span.dataset.mark] = span;

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  let hitT = 0, killT = 0, bannerT = 0;

  // build the buy grid once
  for (const item of BUY_ITEMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy-item';
    btn.innerHTML = `<b>${item.name}</b><span>${item.desc}</span><i>$${item.price}</i>`;
    btn.addEventListener('click', () => callbacks.onBuy(item.key));
    btn.dataset.key = item.key;
    els.buyGrid.appendChild(btn);
  }
  els.play.addEventListener('click', () => callbacks.onPlay());

  function fmtTime(s) {
    const m = Math.floor(Math.max(0, s) / 60);
    const ss = Math.floor(Math.max(0, s) % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  }

  return {
    update(snap, dt) {
      // crosshair spread in px from the current spread (radians)
      const gap = 5 + snap.spread * 2600;
      els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
      els.crosshair.classList.toggle('ads', snap.ads > 0.5);

      els.healthBar.style.width = `${snap.health}%`;
      els.healthBar.classList.toggle('low', snap.health <= 30);
      els.healthNum.textContent = Math.ceil(snap.health);
      els.armor.textContent = snap.armor > 0 ? `ARMOR ${Math.ceil(snap.armor)}` : '';
      els.ammoMag.textContent = snap.mag;
      els.ammoReserve.textContent = `/ ${snap.reserve}`;
      els.ammo.classList.toggle('empty', snap.mag === 0);
      els.weaponName.textContent = snap.weaponName;
      els.money.textContent = `$${snap.money}`;
      els.timer.textContent = fmtTime(snap.timer);
      els.timer.classList.toggle('danger', snap.timer <= 10 && snap.phase === 'live');
      els.score.innerHTML = `SOLSTICE <b>${snap.wins} — ${snap.losses}</b> · ROUND ${snap.round}`;
      els.roundLabel.textContent = snap.phase === 'buy' ? 'BUY PHASE — press B when ready'
        : snap.phase === 'live' ? 'DEFEND THE OBSERVATORY'
        : snap.phase === 'planted' ? 'DEVICE PLANTED — DEFUSE IT'
        : snap.phase === 'roundEnd' ? snap.endReason
        : '';

      // bomb / defuse / plant bars
      els.bomb.hidden = snap.phase !== 'planted';
      if (snap.phase === 'planted') els.bombTimer.textContent = fmtTime(snap.bombTimer);
      els.defuse.hidden = !snap.defusing;
      if (snap.defusing) els.defuseFill.style.width = `${(snap.defuseT / 5) * 100}%`;
      els.plant.hidden = !snap.planting;
      if (snap.planting) els.plantFill.style.width = `${(snap.plantT / 3.5) * 100}%`;

      // buy panel
      const buying = snap.phase === 'buy';
      els.buy.hidden = !buying;
      if (buying) {
        els.buyMoney.textContent = `$${snap.money}`;
        els.buyTimer.textContent = fmtTime(snap.timer);
        for (const btn of els.buyGrid.children) {
          const key = btn.dataset.key;
          const owned = key === 'armor' ? snap.hasArmor
            : key === 'frag' ? snap.grenades.frag >= 2
            : key === 'smoke' ? snap.grenades.smoke >= 2
            : snap.owned[key];
          const price = key === 'armor' ? GEAR.armor.price
            : key === 'frag' ? GEAR.frag.price
            : key === 'smoke' ? GEAR.smoke.price
            : WEAPONS[key].price;
          btn.disabled = owned || snap.money < price;
          btn.classList.toggle('owned', !!owned);
        }
      }

      // hit / kill markers
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) els.hitmarker.classList.remove('on'); }
      if (killT > 0) { killT -= dt; if (killT <= 0) els.killmarker.classList.remove('on'); }
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) els.banner.hidden = true;
      }
      // v2 — STEADY tag when the counter-strafe window is open
      els.steady.hidden = !snap.steady;
      // v2 — zone callout: where on the ridge the player stands
      if (snap.zone) els.zone.textContent = snap.zone;

      // v2 — compass: cardinal points + site markers by bearing from yaw.
      // Bearing is the yaw that would face the point; north is yaw 0.
      if (snap.sites && snap.yaw !== undefined) {
        const HALF = 1.35; // radians either side of centre shown
        const place = (mark, bearing) => {
          const rel = wrapAngle(bearing - snap.yaw);
          const el = compassMarks[mark];
          if (!el) return;
          if (Math.abs(rel) > HALF) { el.style.display = 'none'; return; }
          el.style.display = '';
          el.style.left = `${50 + (rel / HALF) * 50}%`;
        };
        place('N', 0);
        place('E', -Math.PI / 2);
        place('S', Math.PI);
        place('W', Math.PI / 2);
        for (const key of ['A', 'B']) {
          const s = snap.sites[key];
          place(key, Math.atan2(-(s.x - snap.posX), -(s.z - snap.posZ)));
        }
      }

      // v2 — threat chevron: points at the last shot heard, fades in 1.5 s
      if (snap.threatAge !== undefined && snap.threatAge < 1.5) {
        els.threat.style.setProperty('--rot', `${snap.threatRel}rad`);
        els.threat.style.opacity = String((snap.threatStrong ? 1 : 0.7) * (1 - snap.threatAge / 1.5));
        els.threat.classList.toggle('weak', !snap.threatStrong);
      } else {
        els.threat.style.opacity = '0';
      }

      // hint line (contextual)
      els.hint.textContent = snap.hint || '';
    },

    hit(kill) {
      els.hitmarker.classList.add('on');
      hitT = 0.12;
      if (kill) {
        els.killmarker.classList.add('on');
        killT = 0.35;
      }
    },
    feed(text, good) {
      const div = document.createElement('div');
      div.className = 'feed-item' + (good === false ? ' bad' : '');
      div.textContent = text;
      els.feed.prepend(div);
      while (els.feed.children.length > 5) els.feed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    banner(title, sub, seconds = 2.6) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      if (seconds <= 0) { els.banner.hidden = true; bannerT = 0; return; }
      els.banner.hidden = false;
      bannerT = seconds;
    },
    showOverlay(kind, data = {}) {
      const copy = {
        menu: {
          title: 'SOLSTICE',
          body: 'Golden hour over the alpine observatory. You hold the Solstice Dome and the Relay Mast against four raiders carrying a device. Plant denied, or defuse in time — first to 7 rounds takes the match.',
          action: 'Deploy',
        },
        roundEnd: {
          title: data.winner === 'player' ? 'ROUND HELD' : 'ROUND LOST',
          body: data.reason,
          action: 'Next round',
        },
        matchEnd: {
          title: data.winner === 'player' ? 'THE OBSERVATORY HOLDS' : 'THE OBSERVATORY FALLS',
          body: `Final score ${data.wins} — ${data.losses}. ${data.winner === 'player' ? 'Solstice stays lit.' : 'The raiders take the ridge.'}`,
          action: 'Play again',
        },
        paused: {
          title: 'SOLSTICE',
          body: 'Paused. Click to return to the ridge.',
          action: 'Resume',
        },
      }[kind];
      els.overlayTitle.textContent = copy.title;
      els.overlayCopy.textContent = copy.body;
      els.play.textContent = copy.action;
      els.overlay.hidden = false;
      els.overlay.dataset.kind = kind;
    },
    hideOverlay() { els.overlay.hidden = true; },
    overlayKind() { return els.overlay.dataset.kind || ''; },
    overlayVisible() { return !els.overlay.hidden; },
  };
}
