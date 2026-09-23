import type { MusicCue } from '@family-adventure/shared';

interface Score {
  bpm: number;
  lead: Array<number | null>;
  bass: Array<number | null>;
  harmony?: Array<number | null>;
}

const scores: Record<Exclude<MusicCue, 'silence'>, Score> = {
  exploration: {
    bpm: 88,
    lead: [64, null, 67, null, 71, null, 67, 69, 64, null, 62, null, 59, null, 62, null],
    bass: [40, null, null, null, 43, null, null, null, 45, null, null, null, 43, null, null, null],
  },
  wonder: {
    bpm: 82,
    lead: [67, null, 71, 74, null, 71, 76, null, 74, null, 71, 67, 69, null, 71, null],
    bass: [43, null, null, null, 47, null, null, null, 45, null, null, null, 40, null, null, null],
    harmony: [55, null, 59, null, 62, null, 59, null, 57, null, 55, null, 52, null, 55, null],
  },
  mystery: {
    bpm: 72,
    lead: [64, null, 65, null, 71, null, 68, null, 64, null, 62, null, 65, null, 61, null],
    bass: [40, null, null, null, 39, null, null, null, 37, null, null, null, 36, null, null, null],
  },
  tension: {
    bpm: 94,
    lead: [61, null, 62, 61, null, 65, 62, null, 61, 62, 68, null, 65, 62, 61, null],
    bass: [37, null, 37, null, 36, null, 36, null, 34, null, 34, null, 36, null, 36, null],
    harmony: [49, null, 50, null, 49, null, 53, null, 50, null, 49, null, 48, null, 49, null],
  },
  chase: {
    bpm: 142,
    lead: [64, 67, 71, 67, 65, 69, 72, 69, 62, 65, 69, 65, 61, 64, 68, 71],
    bass: [40, null, 40, null, 41, null, 41, null, 38, null, 38, null, 37, null, 39, null],
    harmony: [52, null, 55, null, 53, null, 57, null, 50, null, 53, null, 49, null, 52, null],
  },
  reveal: {
    bpm: 76,
    lead: [60, null, 64, null, 67, null, 72, 71, 67, null, 64, null, 60, null, 67, null],
    bass: [36, null, null, null, 43, null, null, null, 40, null, null, null, 36, null, null, null],
    harmony: [48, null, 52, null, 55, null, 60, null, 55, null, 52, null, 48, null, 55, null],
  },
  rest: {
    bpm: 68,
    lead: [64, null, 67, null, 71, null, 69, null, 64, null, 62, null, 59, null, 64, null],
    bass: [40, null, null, null, 43, null, null, null, 45, null, null, null, 40, null, null, null],
  },
  triumph: {
    bpm: 112,
    lead: [60, 64, 67, 72, 71, 67, 69, 71, 72, 76, 79, 76, 72, 71, 72, null],
    bass: [36, null, 43, null, 41, null, 43, null, 36, null, 40, null, 43, null, 36, null],
    harmony: [48, null, 55, null, 53, null, 55, null, 48, null, 52, null, 55, null, 60, null],
  },
  sorrow: {
    bpm: 62,
    lead: [69, null, 68, null, 64, null, 61, null, 62, null, 64, null, 61, null, 57, null],
    bass: [45, null, null, null, 40, null, null, null, 41, null, null, null, 37, null, null, null],
  },
};

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class ChiptuneEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextStepAt = 0;
  private step = 0;
  private cue: MusicCue = 'silence';
  private intensity = 0;
  private volume = 0.55;
  private ducked = false;

  async start(cue: MusicCue, intensity: number, volume: number): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.cue = cue;
    this.intensity = intensity;
    this.volume = volume;
    this.nextStepAt = this.context.currentTime + 0.05;
    this.step = 0;
    this.fadeToTarget(0.35);
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.schedule(), 70);
    }
  }

  setScene(cue: MusicCue, intensity: number): void {
    const changed = cue !== this.cue;
    this.cue = cue;
    this.intensity = intensity;
    if (!this.context || !this.master) return;
    if (changed) {
      this.step = 0;
      this.nextStepAt = this.context.currentTime + 0.18;
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.08);
      this.fadeToTarget(0.42, 0.16);
      if (cue === 'reveal' || cue === 'triumph') this.stinger(cue);
    } else {
      this.fadeToTarget(0.25);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.fadeToTarget(0.18);
  }

  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.fadeToTarget(0.22);
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (!this.context) return;
    if (this.context.state === 'suspended') await this.context.resume();
    this.nextStepAt = this.context.currentTime + 0.05;
  }

  async stop(): Promise<void> {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.context) await this.context.close();
    this.context = null;
    this.master = null;
  }

  private targetGain(): number {
    if (this.cue === 'silence' || this.intensity === 0) return 0.0001;
    const sceneLevel = 0.055 + this.intensity * 0.012;
    return sceneLevel * this.volume * (this.ducked ? 0.28 : 1);
  }

  private fadeToTarget(duration: number, delay = 0): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.linearRampToValueAtTime(this.targetGain(), now + delay + duration);
  }

  private schedule(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.cue === 'silence') return;
    const score = scores[this.cue];
    const stepDuration = 60 / score.bpm / 2;
    while (this.nextStepAt < context.currentTime + 0.28) {
      this.scheduleStep(score, this.step, this.nextStepAt, stepDuration);
      this.step = (this.step + 1) % score.lead.length;
      this.nextStepAt += stepDuration;
    }
  }

  private scheduleStep(score: Score, step: number, at: number, duration: number): void {
    const lead = score.lead[step % score.lead.length];
    const bass = score.bass[step % score.bass.length];
    const harmony = score.harmony?.[step % score.harmony.length];
    if (lead !== null && lead !== undefined) {
      this.tone(lead, at, duration * 0.78, 'square', 0.34);
    }
    if (bass !== null && bass !== undefined) {
      this.tone(bass, at, duration * 1.7, 'triangle', 0.5);
    }
    if (this.intensity >= 2 && harmony !== null && harmony !== undefined) {
      this.tone(harmony, at, duration * 0.7, 'square', 0.16);
    }
    if (this.intensity >= 2 && step % 4 === 0) this.kick(at);
    if (this.intensity >= 3 && step % 2 === 1) this.tick(at);
  }

  private tone(
    midi: number,
    at: number,
    duration: number,
    type: OscillatorType,
    level: number,
  ): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency(midi), at);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  private kick(at: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(95, at);
    oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    envelope.gain.setValueAtTime(0.35, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + 0.15);
  }

  private tick(at: number): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1800, at);
    envelope.gain.setValueAtTime(0.06, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + 0.03);
  }

  private stinger(cue: MusicCue): void {
    if (!this.context) return;
    const now = this.context.currentTime + 0.05;
    const notes = cue === 'triumph' ? [60, 64, 67, 72] : [48, 55, 60, 64];
    notes.forEach((note, index) => this.tone(note, now + index * 0.09, 0.24, 'square', 0.28));
  }
}
