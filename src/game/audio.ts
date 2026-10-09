const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Synthesised electric-car audio: inverter whine that climbs with speed, a low drive hum,
 * regen whine when you lift off, road + wind noise, tyre squeal, plus one-shot effects.
 */
export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  muted = false;

  private noiseBuf: AudioBuffer | null = null;
  private whine: OscillatorNode[] = [];
  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  private musicTimer = 0;
  private step = 0;
  private started = false;

  private noise(ctx: AudioContext): AudioBufferSourceNode {
    if (!this.noiseBuf) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.35 + w * 0.65; // slightly soft white noise
        d[i] = last;
      }
      this.noiseBuf = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  unlock() {
    if (this.started && this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx({ latencyHint: "interactive" });
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.085;
    this.musicGain.connect(master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(master);

    // Motor whine: three partials through a speed-following lowpass.
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = "lowpass";
    this.motorFilter.frequency.value = 2000;
    this.motorFilter.Q.value = 0.7;
    this.motorFilter.connect(this.motorGain);
    this.motorGain.connect(master);
    const partials: [OscillatorType, number][] = [["sine", 1], ["triangle", 0.45], ["sine", 0.22]];
    for (const [type, level] of partials) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = 200;
      g.gain.value = level;
      o.connect(g);
      g.connect(this.motorFilter);
      o.start();
      this.whine.push(o);
    }

    // Low drive hum.
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = "sawtooth";
    this.humOsc.frequency.value = 55;
    const humF = ctx.createBiquadFilter();
    humF.type = "lowpass";
    humF.frequency.value = 260;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humOsc.connect(humF);
    humF.connect(this.humGain);
    this.humGain.connect(master);
    this.humOsc.start();

    // Road noise.
    const road = this.noise(ctx);
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = "bandpass";
    this.roadFilter.frequency.value = 400;
    this.roadFilter.Q.value = 0.8;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    road.connect(this.roadFilter);
    this.roadFilter.connect(this.roadGain);
    this.roadGain.connect(master);
    road.start();

    // Wind.
    const wind = this.noise(ctx);
    const windF = ctx.createBiquadFilter();
    windF.type = "highpass";
    windF.frequency.value = 1500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(windF);
    windF.connect(this.windGain);
    this.windGain.connect(master);
    wind.start();

    // Tyre squeal: noise band + a thin tone.
    const sk = this.noise(ctx);
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = "bandpass";
    this.skidFilter.frequency.value = 1600;
    this.skidFilter.Q.value = 2.4;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    sk.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(master);
    sk.start();
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = "sine";
    this.squealOsc.frequency.value = 880;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealOsc.connect(this.squealGain);
    this.squealGain.connect(master);
    this.squealOsc.start();

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

  /** Called every frame while racing. `speed` in world units/s (~330 is flat out). */
  engine(speed: number, throttle: number, dt: number, brake = 0, offRoad = false) {
    const ctx = this.ctx;
    if (!ctx || !this.motorGain || !this.motorFilter || !this.humOsc || !this.humGain || !this.roadFilter || !this.roadGain || !this.windGain) return;
    const t = ctx.currentTime;
    const s = clamp(Math.abs(speed) / 330, 0, 1.2);

    const hz = 150 + s * 1450 + throttle * 70;
    this.whine[0].frequency.setTargetAtTime(hz, t, 0.05);
    this.whine[1].frequency.setTargetAtTime(hz * 2.003, t, 0.05);
    this.whine[2].frequency.setTargetAtTime(hz * 3.01, t, 0.05);
    this.motorFilter.frequency.setTargetAtTime(1300 + s * 4200, t, 0.08);

    const idle = s > 0.015 ? 0.012 : 0.006;
    const load = throttle * (0.02 + s * 0.05);
    const regen = (1 - throttle) * s * (brake > 0.1 ? 0.042 : 0.026);
    this.motorGain.gain.setTargetAtTime(Math.min(0.12, idle + load + regen), t, 0.06);

    this.humOsc.frequency.setTargetAtTime(48 + s * 70 + throttle * 12, t, 0.08);
    this.humGain.gain.setTargetAtTime(0.014 + throttle * 0.026 + s * 0.012, t, 0.08);

    this.roadFilter.frequency.setTargetAtTime((offRoad ? 170 : 260) + s * (offRoad ? 520 : 900), t, 0.1);
    this.roadGain.gain.setTargetAtTime(Math.pow(s, 0.75) * (offRoad ? 0.15 : 0.08), t, 0.1);
    this.windGain.gain.setTargetAtTime(s * s * 0.05, t, 0.12);

    this.tickMusic(dt);
  }

  skid(amount: number) {
    const ctx = this.ctx;
    if (!ctx || !this.skidGain || !this.skidFilter || !this.squealGain || !this.squealOsc) return;
    const t = ctx.currentTime;
    const a = clamp(amount, 0, 1);
    this.skidGain.gain.setTargetAtTime(Math.min(0.1, a * 0.085), t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1300 + a * 900, t, 0.1);
    this.squealOsc.frequency.setTargetAtTime(760 + a * 260, t, 0.1);
    this.squealGain.gain.setTargetAtTime(a > 0.35 ? (a - 0.35) * 0.03 : 0, t, 0.06);
  }

  beep(freq = 880, dur = 0.12, gain = 0.12) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain * 1.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur);
  }

  lapChime() {
    this.beep(880, 0.14, 0.09);
    window.setTimeout(() => this.beep(1318, 0.22, 0.09), 110);
  }

  crash() {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(f);
    f.connect(ng);
    ng.connect(this.sfxGain);
    n.start(t);
    n.stop(t + 0.3);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** Drift-boost release: rising whoosh. */
  boost() {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    const n = this.noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    n.start(t);
    n.stop(t + 0.65);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.07, t + 0.15);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(og);
    og.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.6);
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
    const note = (freq: number, type: OscillatorType, vol: number, len: number) => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + len);
    };
    note(bass[i], "triangle", 0.11, 0.2);
    if (i % 2 === 0) note(lead[i], "square", 0.04, 0.16);
    if (i === 0 || i === 4) note(60, "square", 0.05, 0.08);
  }
}
