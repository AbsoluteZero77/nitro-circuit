export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  engineGain: GainNode | null = null;
  engineOsc: OscillatorNode | null = null;
  engineFilter: BiquadFilterNode | null = null;
  skidGain: GainNode | null = null;
  muted = false;
  private musicTimer = 0;
  private step = 0;
  private started = false;

  unlock() {
    if (this.started && this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.engineGain = ctx.createGain();
    this.skidGain = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.musicGain.gain.value = 0.12;
    this.sfxGain.gain.value = 0.45;
    this.engineGain.gain.value = 0;
    this.skidGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.engineGain.connect(this.master);
    this.skidGain.connect(this.master);
    this.master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = 48;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    osc.connect(filter);
    filter.connect(this.engineGain);
    osc.start();
    this.engineOsc = osc;
    this.engineFilter = filter;

    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900;
    nf.Q.value = 0.8;
    noise.connect(nf);
    nf.connect(this.skidGain);
    noise.start();

    this.started = true;
    if (ctx.state === "suspended") void ctx.resume();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void ctx.resume();
      else void ctx.suspend();
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.04);
    }
  }

  engine(speed: number, throttle: number, dt: number) {
    if (!this.ctx || !this.engineOsc || !this.engineFilter || !this.engineGain) return;
    const rpm = 48 + Math.abs(speed) * 1.35 + throttle * 18;
    this.engineOsc.frequency.setTargetAtTime(rpm, this.ctx.currentTime, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + Math.abs(speed) * 5.5, this.ctx.currentTime, 0.08);
    const g = 0.02 + Math.min(0.09, Math.abs(speed) * 0.00022 + throttle * 0.03);
    this.engineGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.06);
    this.tickMusic(dt);
  }

  skid(amount: number) {
    if (!this.ctx || !this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.12, amount * 0.1), this.ctx.currentTime, 0.05);
  }

  beep(freq = 880, dur = 0.12, gain = 0.12) {
    if (!this.ctx || !this.sfxGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  crash() {
    if (!this.ctx || !this.sfxGain) return;
    const dur = 0.22;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = 90;
    o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + dur);
    g.gain.value = 0.16;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  private tickMusic(dt: number) {
    if (!this.ctx || !this.musicGain) return;
    this.musicTimer += dt;
    const stepLen = 0.214;
    if (this.musicTimer < stepLen) return;
    this.musicTimer -= stepLen;
    const bass = [98, 98, 110, 98, 87, 87, 73, 82];
    const lead = [196, 220, 262, 220, 196, 175, 165, 196];
    const i = this.step % 8;
    this.step++;
    const note = (freq: number, type: OscillatorType, vol: number, t: number) => {
      if (!this.ctx || !this.musicGain) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + t);
      o.connect(g);
      g.connect(this.musicGain);
      o.start();
      o.stop(this.ctx.currentTime + t);
    };
    note(bass[i], "triangle", 0.11, 0.2);
    if (i % 2 === 0) note(lead[i], "square", 0.045, 0.16);
    if (i === 0 || i === 4) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "square";
      o.frequency.value = 60;
      g.gain.value = 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      o.connect(g);
      g.connect(this.musicGain);
      o.start();
      o.stop(this.ctx.currentTime + 0.08);
    }
  }
}
