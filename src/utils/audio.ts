/**
 * Web Audio Engine Synthesizer for Remote Pilot Cockpit
 * Generates dynamic RC motor sounds, horn beeps, and brake screeches without external sound files.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private hornOsc: OscillatorNode | null = null;
  private hornGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isRunning: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setValueAtTime(muted ? 0 : 0.15, this.ctx.currentTime);
    }
  }

  public startEngine() {
    if (this.isRunning) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      this.engineOsc = this.ctx.createOscillator();
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();

      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime); // Low engine idle rumble

      this.engineSubOsc.type = 'triangle';
      this.engineSubOsc.frequency.setValueAtTime(90, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      this.engineSubOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.12, this.ctx.currentTime);

      this.engineOsc.start();
      this.engineSubOsc.start();
      this.isRunning = true;
    } catch {
      // Audio autoplay policy handled on first gesture
    }
  }

  public updateThrottle(throttlePercent: number) {
    if (!this.isRunning || !this.ctx || !this.engineOsc || !this.engineSubOsc) return;

    const absThrottle = Math.min(100, Math.abs(throttlePercent));
    const normalized = absThrottle / 100;

    // Pitch rises from 45Hz idle up to 240Hz under full throttle
    const baseFreq = 45 + normalized * 180;
    const now = this.ctx.currentTime;

    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.08);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 2, now, 0.08);

    if (this.engineGain && !this.isMuted) {
      const targetGain = 0.10 + normalized * 0.12;
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
    }
  }

  public playHorn(active: boolean) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (active) {
      if (this.hornOsc) return; // already active
      this.hornOsc = this.ctx.createOscillator();
      this.hornGain = this.ctx.createGain();

      this.hornOsc.type = 'square';
      this.hornOsc.frequency.setValueAtTime(440, this.ctx.currentTime); // A4 tone

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(440 * 1.25, this.ctx.currentTime); // Dual tone car horn

      this.hornGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      this.hornOsc.connect(this.hornGain);
      osc2.connect(this.hornGain);
      this.hornGain.connect(this.ctx.destination);

      this.hornOsc.start();
      osc2.start();

      setTimeout(() => {
        try {
          osc2.stop();
          osc2.disconnect();
        } catch {}
      }, 800);
    } else {
      if (this.hornOsc) {
        try {
          this.hornOsc.stop();
          this.hornOsc.disconnect();
          this.hornGain?.disconnect();
        } catch {}
        this.hornOsc = null;
        this.hornGain = null;
      }
    }
  }

  public playBrakeChirp() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }

  public stopAll() {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineSubOsc?.stop();
        this.engineOsc.disconnect();
        this.engineSubOsc?.disconnect();
      } catch {}
      this.engineOsc = null;
      this.engineSubOsc = null;
    }
    this.isRunning = false;
  }
}

export const soundEngine = new SoundEngine();
