/* The Typing Knight — procedural audio (WebAudio, no assets).
 * The AudioContext is created lazily on the first user gesture (browser autoplay rules).
 */
window.TKAudio = class TKAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastCoin = 0;
    this.musicTimer = null;
    this.bossMode = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  get ok() { return !!this.ctx && !this.muted; }

  tone({ type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.2, when = 0, attack = 0.003, lp = 0, dest = null }) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = lp;
      node.connect(fl);
      node = fl;
    }
    node.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.2, type = 'bandpass', f = 2000, f2 = null, q = 1, when = 0, dest = null }) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  key(combo) {
    if (!this.ok) return;
    const f = 620 * Math.pow(2, Math.min(combo, 48) / 48);
    this.tone({ type: 'square', f, dur: 0.035, vol: 0.035, lp: 3200 });
  }
  slash() {
    if (!this.ok) return;
    this.noise({ dur: 0.16, vol: 0.32, f: 5200, f2: 700, q: 0.8 });
    this.tone({ type: 'sine', f: 190, f2: 55, dur: 0.14, vol: 0.32 });
  }
  error() {
    if (!this.ok) return;
    this.tone({ type: 'square', f: 105, f2: 70, dur: 0.15, vol: 0.16, lp: 520 });
    this.noise({ dur: 0.09, vol: 0.18, type: 'lowpass', f: 380 });
  }
  coin() {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCoin < 0.045) return;
    this.lastCoin = now;
    this.tone({ type: 'square', f: 988, dur: 0.05, vol: 0.04 });
    this.tone({ type: 'square', f: 1319, dur: 0.09, vol: 0.04, when: 0.05 });
  }
  hurt() {
    if (!this.ok) return;
    this.noise({ dur: 0.32, vol: 0.45, type: 'lowpass', f: 1100, f2: 160 });
    this.tone({ type: 'sawtooth', f: 170, f2: 40, dur: 0.38, vol: 0.2, lp: 900 });
  }
  block() {
    if (!this.ok) return;
    this.tone({ type: 'triangle', f: 1400, f2: 700, dur: 0.22, vol: 0.14 });
    this.noise({ dur: 0.12, vol: 0.12, type: 'highpass', f: 3000 });
  }
  repel() {
    if (!this.ok) return;
    this.tone({ type: 'sine', f: 140, f2: 40, dur: 0.28, vol: 0.3 });
    this.noise({ dur: 0.2, vol: 0.12, f: 900, f2: 200 });
  }
  zap() {
    if (!this.ok) return;
    this.tone({ type: 'sawtooth', f: 1900, f2: 260, dur: 0.14, vol: 0.06 });
    this.noise({ dur: 0.08, vol: 0.08, type: 'highpass', f: 3500 });
  }
  burst() {
    if (!this.ok) return;
    this.noise({ dur: 0.22, vol: 0.2, type: 'lowpass', f: 1800, f2: 200 });
  }
  explode() {
    if (!this.ok) return;
    this.noise({ dur: 0.5, vol: 0.45, type: 'lowpass', f: 2200, f2: 120 });
    this.tone({ type: 'sine', f: 110, f2: 32, dur: 0.5, vol: 0.38 });
  }
  ultimate() {
    if (!this.ok) return;
    this.noise({ dur: 0.32, vol: 0.28, type: 'highpass', f: 300, f2: 7000 });
    this.tone({ type: 'sawtooth', f: 220, f2: 880, dur: 0.3, vol: 0.06 });
    this.tone({ type: 'sine', f: 95, f2: 28, dur: 1.0, vol: 0.6, when: 0.28 });
    this.noise({ dur: 1.1, vol: 0.5, type: 'lowpass', f: 1600, f2: 90, when: 0.28 });
    this.tone({ type: 'sawtooth', f: 240, f2: 50, dur: 0.7, vol: 0.12, when: 0.28, lp: 1200 });
  }
  denied() {
    if (!this.ok) return;
    this.tone({ type: 'triangle', f: 240, dur: 0.06, vol: 0.06 });
    this.tone({ type: 'triangle', f: 190, dur: 0.08, vol: 0.06, when: 0.06 });
  }
  roar() {
    if (!this.ok) return;
    this.tone({ type: 'sawtooth', f: 72, f2: 44, dur: 1.5, vol: 0.26, lp: 520, attack: 0.08 });
    this.tone({ type: 'square', f: 76, f2: 46, dur: 1.4, vol: 0.1, lp: 380, attack: 0.08 });
    this.noise({ dur: 1.3, vol: 0.22, type: 'lowpass', f: 500, f2: 150 });
  }
  bossHit() {
    if (!this.ok) return;
    this.slash();
    this.tone({ type: 'square', f: 320, f2: 70, dur: 0.3, vol: 0.12, lp: 1400 });
  }
  bossCast() {
    if (!this.ok) return;
    this.tone({ type: 'sawtooth', f: 400, f2: 90, dur: 0.45, vol: 0.12, lp: 1800 });
    this.noise({ dur: 0.4, vol: 0.25, f: 600, f2: 3000, q: 2 });
  }
  jump() {
    if (!this.ok) return;
    this.noise({ dur: 0.5, vol: 0.22, type: 'bandpass', f: 500, f2: 3200, q: 0.7 });
    this.tone({ type: 'triangle', f: 260, f2: 720, dur: 0.22, vol: 0.08 });
  }
  land() {
    if (!this.ok) return;
    this.tone({ type: 'sine', f: 130, f2: 38, dur: 0.28, vol: 0.42 });
    this.noise({ dur: 0.22, vol: 0.3, type: 'lowpass', f: 900, f2: 120 });
  }
  floorClear() {
    if (!this.ok) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.22, vol: 0.13, when: i * 0.09 }));
  }
  rescue() {
    if (!this.ok) return;
    [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.3, vol: 0.1, when: i * 0.08 }));
    this.tone({ type: 'sine', f: 2093, dur: 0.5, vol: 0.05, when: 0.4 });
  }
  pick() {
    if (!this.ok) return;
    this.tone({ type: 'square', f: 784, dur: 0.07, vol: 0.06 });
    this.tone({ type: 'square', f: 1175, dur: 0.14, vol: 0.06, when: 0.07 });
  }
  reroll() {
    if (!this.ok) return;
    [600, 760, 920].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.06, vol: 0.07, when: i * 0.045 }));
  }
  ui() {
    if (!this.ok) return;
    this.tone({ type: 'triangle', f: 880, dur: 0.05, vol: 0.06 });
  }
  gameOver() {
    if (!this.ok) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.4, vol: 0.14, when: i * 0.24 }));
  }

  /* ---- music: a dark Am–F–Dm–E progression, faster and heavier on boss floors ---- */
  startMusic(boss = false) {
    if (!this.ctx) return;
    this.bossMode = boss;
    this.music.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.6);
    if (this.musicTimer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 25);
  }
  duckMusic(level) {
    if (this.ctx) this.music.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
  }
  stopMusic() {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
  schedule() {
    const stepDur = 60 / (this.bossMode ? 132 : 84) / 2;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime - this.ctx.currentTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }
  playStep(s, when, d) {
    if (this.muted) return;
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
    const ch = chords[Math.floor(s / 8) % 4];
    const i = s % 8;
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const dest = this.music;
    if (i === 0 || i === 4) this.tone({ type: 'triangle', f: hz(ch[0] - 24), dur: d * 3.6, vol: 0.2, when, dest, attack: 0.01 });
    const arp = [0, 1, 2, 1, 0, 2, 1, 2][i];
    this.tone({ type: 'triangle', f: hz(ch[arp] + 12), dur: d * 0.9, vol: 0.045, when, dest });
    if (this.bossMode) {
      if (i % 2 === 0) this.tone({ type: 'sine', f: 150, f2: 40, dur: 0.14, vol: 0.22, when, dest });
      if (i === 2 || i === 6) this.noise({ dur: 0.09, vol: 0.06, type: 'highpass', f: 5000, when, dest });
      this.tone({ type: 'sawtooth', f: hz(ch[0] - 12), dur: d * 0.8, vol: 0.025, when, dest, lp: 700 });
    } else if (i === 7 && Math.floor(s / 8) % 2 === 1) {
      this.tone({ type: 'sine', f: hz(ch[2] + 24), dur: d * 2, vol: 0.02, when, dest });
    }
  }
};
