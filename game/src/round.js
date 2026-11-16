// Rounds and money: buy phase, live round, plant/defuse, detonation, match
// end. First to 7 rounds takes the match (max 13). The player defends the
// observatory; the attackers win a round by detonating the device or wiping
// the defender out. State lives in one object; main.js reads it, HUD shows it.
import { CONFIG, WEAPONS, GEAR } from './config.js';

export function createRound() {
  const state = {
    phase: 'menu',        // menu | buy | live | planted | roundEnd | matchEnd
    round: 1,
    wins: 0,              // player rounds won
    losses: 0,            // player rounds lost
    money: CONFIG.startMoney,
    lossStreak: 0,
    timer: 0,
    bombPlanted: false,
    bombSite: null,
    bombPos: null,
    bombTimer: 0,
    defuseT: 0,
    defusing: false,
    plantCarrier: null,
    endReason: '',
    endWinner: null,      // 'player' | 'bots'
    matchWinner: null,
    killsThisRound: 0,
  };

  return {
    state,
    resetMatch() {
      state.round = 1;
      state.wins = 0;
      state.losses = 0;
      state.money = CONFIG.startMoney;
      state.lossStreak = 0;
      state.matchWinner = null;
      state.bombPlanted = false;
      state.bombSite = null;
      state.bombPos = null;
      this.startBuy();
    },
    startBuy() {
      state.phase = 'buy';
      state.timer = CONFIG.buyTime;
      state.bombPlanted = false;
      state.bombSite = null;
      state.bombPos = null;
      state.defuseT = 0;
      state.defusing = false;
      state.killsThisRound = 0;
      state.endReason = '';
      state.endWinner = null;
    },
    startLive() {
      state.phase = 'live';
      state.timer = CONFIG.roundTime;
    },
    onPlanted(site, pos) {
      state.phase = 'planted';
      state.bombPlanted = true;
      state.bombSite = site;
      state.bombPos = { x: pos.x, z: pos.z };
      state.bombTimer = CONFIG.bombTimer;
      // no money: the raiders planted, the defender earns nothing for it
    },
    onKill() {
      state.money += CONFIG.killReward;
      state.killsThisRound++;
    },
    buy(key) {
      if (state.phase !== 'buy') return { ok: false, why: 'buy phase over' };
      let price;
      if (key === 'armor') price = GEAR.armor.price;
      else if (key === 'frag') price = GEAR.frag.price;
      else if (key === 'smoke') price = GEAR.smoke.price;
      else if (WEAPONS[key]) price = WEAPONS[key].price;
      else return { ok: false, why: 'unknown item' };
      if (state.money < price) return { ok: false, why: 'not enough money' };
      return { ok: true, price };
    },
    pay(price) { state.money -= price; },

    endRound(winner, reason) {
      if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
      state.phase = 'roundEnd';
      state.endWinner = winner;
      state.endReason = reason;
      state.timer = 4;
      state.defusing = false;
      state.defuseT = 0;
      if (winner === 'player') {
        state.wins++;
        state.money += CONFIG.winReward;
        state.lossStreak = 0;
      } else {
        state.losses++;
        state.money += CONFIG.lossReward + Math.min(2, state.lossStreak) * CONFIG.lossStreakBonus;
        state.lossStreak++;
      }
      if (state.wins >= CONFIG.roundsToWin || state.losses >= CONFIG.roundsToWin ||
          state.round >= CONFIG.maxRounds) {
        state.matchWinner = state.wins > state.losses ? 'player' : 'bots';
        state.phase = 'matchEnd';
        state.timer = 0;
      }
    },

    nextRound() {
      state.round++;
      this.startBuy();
    },

    update(dt, world) {
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) this.startLive();
      } else if (state.phase === 'live') {
        state.timer -= dt;
        if (state.timer <= 0) {
          // time out with no plant: defenders win the round
          this.endRound('player', 'Time expired — the observatory holds.');
        }
      } else if (state.phase === 'planted') {
        state.bombTimer -= dt;
        if (state.bombTimer <= 0) {
          this.endRound('bots', 'The device detonated.');
        }
      } else if (state.phase === 'roundEnd') {
        state.timer -= dt;
        if (state.timer <= 0 && !state.matchWinner) this.nextRound();
      }
    },
  };
}
