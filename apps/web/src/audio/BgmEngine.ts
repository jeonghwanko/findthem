/**
 * 8-bit chiptune BGM engine using Web Audio API.
 * Generates a catchy looping beat with drums, bass, and melody.
 * Ported from memebattle project.
 */
export class BgmEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _playing = false;
  private _volume = 0.3;

  // Look-ahead scheduler
  private nextNoteTime = 0;
  private currentStep = 0;
  private timerID: ReturnType<typeof setTimeout> | null = null;
  private readonly SCHEDULE_AHEAD = 0.1; // seconds
  private readonly LOOKAHEAD = 25; // ms

  // Music config
  private readonly BPM = 125;
  private readonly STEPS_PER_BEAT = 4; // 16th notes
  private readonly TOTAL_STEPS = 64; // 4 bars × 16 steps

  // Noise buffer (shared, created once)
  private noiseBuffer: AudioBuffer | null = null;

  get playing() { return this._playing; }
  get volume() { return this._volume; }

  // ─── Patterns (per bar = 16 steps) ──────────────

  //                           1 e & a  2 e & a  3 e & a  4 e & a
  private readonly kickPat  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0];
  private readonly snarePat = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
  private readonly hihatPat = [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1];

  // Melody: 16 quarter notes across 4 bars (C major pentatonic)
  private readonly melodyPat = [
    523.25,   0, 659.25,   0,      // C5 . E5 .
    783.99, 659.25, 523.25,   0,   // G5 E5 C5 .
    587.33,   0, 659.25,   0,      // D5 . E5 .
    783.99, 659.25, 523.25, 392.00 // G5 E5 C5 G4
  ];

  // Bass: 16 quarter notes across 4 bars
  private readonly bassPat = [
    130.81,   0, 130.81,   0,   // C3 . C3 .
    110.00,   0, 130.81,   0,   // A2 . C3 .
    146.83,   0, 164.81,   0,   // D3 . E3 .
     98.00,   0, 130.81,   0    // G2 . C3 .
  ];

  // ─── Public API ─────────────────────────────────

  async start() {
    if (this._playing) return;

    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this._playing = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduler();
  }

  stop() {
    this._playing = false;
    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
    this.currentStep = 0;
  }

  async toggle(): Promise<boolean> {
    if (this._playing) {
      this.stop();
    } else {
      await this.start();
    }
    return this._playing;
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  // ─── Scheduler ──────────────────────────────────

  private scheduler() {
    if (!this._playing || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.SCHEDULE_AHEAD) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += 60.0 / this.BPM / this.STEPS_PER_BEAT;
      this.currentStep = (this.currentStep + 1) % this.TOTAL_STEPS;
    }

    this.timerID = setTimeout(() => this.scheduler(), this.LOOKAHEAD);
  }

  private scheduleStep(step: number, time: number) {
    const barStep = step % 16;

    // Drums (repeat every bar)
    if (this.kickPat[barStep]) this.playKick(time);
    if (this.snarePat[barStep]) this.playSnare(time);
    if (this.hihatPat[barStep]) this.playHihat(time);

    // Melody + Bass (every quarter note = every 4 steps)
    if (step % 4 === 0) {
      const qi = Math.floor(step / 4); // quarter index 0-15
      if (this.melodyPat[qi]) this.playMelody(this.melodyPat[qi], time);
      if (this.bassPat[qi]) this.playBass(this.bassPat[qi], time);
    }
  }

  // ─── Instruments ────────────────────────────────

  private playKick(time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private playSnare(time: number) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer!;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    source.start(time);
    source.stop(time + 0.12);
  }

  private playHihat(time: number) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer!;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    source.start(time);
    source.stop(time + 0.04);
  }

  private playMelody(freq: number, time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.setValueAtTime(0.1, time + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  private playBass(freq: number, time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.setValueAtTime(0.2, time + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  // ─── Helpers ────────────────────────────────────

  private createNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const size = ctx.sampleRate; // 1 second of noise
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

// Singleton
let instance: BgmEngine | null = null;

export function getBgmEngine(): BgmEngine {
  if (!instance) instance = new BgmEngine();
  return instance;
}
