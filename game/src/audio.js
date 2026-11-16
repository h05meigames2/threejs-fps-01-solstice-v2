// Synthesised sound, WebAudio only — no audio files, no network. Every
// effect is a short oscillator/noise envelope built on first use; the master
// gain stays low so gunfire never clips the mix.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst({ dur = 0.12, freq = 180, type = 'square', gain = 0.5, slide = 0, noise = 0, hp = 0 }) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(gain, t0);
    out.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    out.connect(master);
    if (noise > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(dur);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = hp || 1200;
      f.Q.value = 0.8;
      src.connect(f); f.connect(out);
      src.start(t0); src.stop(t0 + dur);
    }
    if (freq > 0) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
      osc.connect(out);
      osc.start(t0); osc.stop(t0 + dur);
    }
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'scatter') burst({ dur: 0.22, freq: 120, slide: -70, gain: 0.9, noise: 0.7, hp: 900 });
      else if (kind === 'longshot') burst({ dur: 0.3, freq: 90, slide: -50, gain: 1.0, noise: 0.8, hp: 700 });
      else burst({ dur: 0.11, freq: 160, slide: -90, gain: 0.55, noise: 0.6, hp: 1400 });
    },
    enemyShot(dist) {
      const g = Math.max(0.08, 0.5 - dist * 0.008);
      burst({ dur: 0.12, freq: 140, slide: -80, gain: g, noise: 0.5, hp: 1000 });
    },
    dryFire() { burst({ dur: 0.05, freq: 900, type: 'square', gain: 0.2 }); },
    reload() {
      burst({ dur: 0.06, freq: 500, type: 'square', gain: 0.25 });
      setTimeout(() => burst({ dur: 0.06, freq: 700, type: 'square', gain: 0.25 }), 220);
    },
    hit() { burst({ dur: 0.07, freq: 1400, type: 'sine', gain: 0.35 }); },
    kill() {
      burst({ dur: 0.09, freq: 1100, type: 'sine', gain: 0.4 });
      setTimeout(() => burst({ dur: 0.12, freq: 1600, type: 'sine', gain: 0.4 }), 90);
    },
    hurt() { burst({ dur: 0.15, freq: 220, slide: -120, gain: 0.5, noise: 0.3, hp: 500 }); },
    plant() { burst({ dur: 0.1, freq: 880, type: 'sine', gain: 0.3 }); },
    beep() { burst({ dur: 0.12, freq: 660, type: 'sine', gain: 0.3 }); },
    defuseTick() { burst({ dur: 0.05, freq: 1200, type: 'sine', gain: 0.2 }); },
    explosion() {
      burst({ dur: 0.9, freq: 60, slide: -30, gain: 1.0, noise: 1.0, hp: 300 });
    },
    buy() { burst({ dur: 0.08, freq: 990, type: 'sine', gain: 0.3 }); },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => burst({ dur: 0.16, freq: f, type: 'sine', gain: 0.35 }), i * 110));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => burst({ dur: 0.18, freq: f, type: 'sine', gain: 0.3 }), i * 120));
    },
    setMuted(m) { muted = m; },
  };
}
