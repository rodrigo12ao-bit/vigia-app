import {feedbackPreferences} from '../lib/activityFeedback';
// Web Audio API Synthesizer for Games
// Provides immediate, rich sound effects and ambient music with 0 external asset dependency.

class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private bgmOscillator: OscillatorNode | null = null;
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (mute && this.bgmGain) {
      this.bgmGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    } else if (!mute && this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playClick() {
    if (this.muted||!feedbackPreferences().sounds) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {
      // Audio fallback
    }
  }

  public playCorrect() {
    if (this.muted||!feedbackPreferences().sounds) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch (e) {}
  }

  public playWrong() {
    if (this.muted||!feedbackPreferences().sounds) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const freqs = [220, 196]; // A3 to G3 low

      freqs.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.12, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.2);
      });
    } catch (e) {}
  }

  public playVictory() {
    if (this.muted||!feedbackPreferences().sounds) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [
        { f: 523.25, t: 0, d: 0.15 },
        { f: 659.25, t: 0.15, d: 0.15 },
        { f: 783.99, t: 0.30, d: 0.15 },
        { f: 1046.50, t: 0.45, d: 0.4 },
      ];

      notes.forEach((note) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(note.f, now + note.t);

        gain.gain.setValueAtTime(0.15, now + note.t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + note.t);
        osc.stop(now + note.t + note.d);
      });
    } catch (e) {}
  }

  public playBadgeUnlock() {
    if (this.muted||!feedbackPreferences().sounds) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const freqs = [440, 554.37, 659.25, 880, 1108.73];

      freqs.forEach((f, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.07);

        gain.gain.setValueAtTime(0.18, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.3);
      });
    } catch (e) {}
  }

  public toggleBgm(start: boolean) {
    if(start&&!feedbackPreferences().sounds)return;
    if (start && !this.isBgmPlaying) {
      try {
        this.initContext();
        if (!this.ctx) return;

        this.bgmOscillator = this.ctx.createOscillator();
        this.bgmGain = this.ctx.createGain();

        this.bgmOscillator.type = 'sine';
        this.bgmOscillator.frequency.setValueAtTime(329.63, this.ctx.currentTime); // E4

        this.bgmGain.gain.setValueAtTime(this.muted ? 0 : 0.03, this.ctx.currentTime);

        this.bgmOscillator.connect(this.bgmGain);
        this.bgmGain.connect(this.ctx.destination);

        this.bgmOscillator.start();
        this.isBgmPlaying = true;
      } catch (e) {}
    } else if (!start && this.isBgmPlaying) {
      try {
        if (this.bgmOscillator) {
          this.bgmOscillator.stop();
          this.bgmOscillator.disconnect();
          this.bgmOscillator = null;
        }
        this.isBgmPlaying = false;
      } catch (e) {}
    }
  }

  public isBgmOn(): boolean {
    return this.isBgmPlaying;
  }
}

export const gameAudio = new GameAudioEngine();

if(typeof window!=='undefined')window.addEventListener('vigia-feedback-settings',()=>{if(!feedbackPreferences().sounds)gameAudio.toggleBgm(false);});
