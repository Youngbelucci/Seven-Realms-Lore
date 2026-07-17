// audio.ts — Procedural Web Audio sound system for "The Seven Realms".
// No external audio files: every sound effect and the ambient music loop is
// synthesized at runtime with OscillatorNode / GainNode / BiquadFilterNode and
// short noise buffers. Fully functional out of the box.

/** Names of all available one-shot sound effects. */
export type SfxName =
  | 'swing'
  | 'hit'
  | 'crit'
  | 'enemyDeath'
  | 'playerHurt'
  | 'levelUp'
  | 'pickup'
  | 'skill'
  | 'bossRoar';

/** Small helper: the browser AudioContext constructor may be prefixed. */
type AudioContextCtor = typeof AudioContext;

class AudioManager {
  // Core graph. Created lazily on first unlock() (a user gesture) because
  // browsers refuse to start audio before an interaction.
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private muted = false;
  private readonly masterVolume = 0.5;

  // Reusable white-noise buffer (built once the context exists).
  private noiseBuffer: AudioBuffer | null = null;

  // Rate-limiting: track the last time (in ctx.currentTime seconds) each sfx
  // was fired so rapid identical bursts don't stack up and clip.
  private lastPlayed: Partial<Record<SfxName, number>> = {};
  private readonly minInterval = 0.03; // ~30ms

  // Ambient music graph — kept around so stopMusic() can tear it down cleanly.
  private musicNodes: AudioNode[] = [];
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private musicMode: 'ambient' | 'boss' | null = null;
  // Boss theme rhythm scheduler (setInterval id).
  private bossPulseTimer: number | null = null;
  private bossStep = 0;

  // ---------------------------------------------------------------------------
  // Context lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create (if needed) and resume the AudioContext. Must be called from within
   * a user gesture handler (keydown/mousedown/touchstart). Safe to call often.
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: AudioContextCtor | undefined =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: AudioContextCtor })
            .webkitAudioContext;
        if (!Ctor) return; // Web Audio unavailable — no-op.

        this.ctx = new Ctor();

        // Master gain feeds the destination and honors mute state.
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.masterVolume;
        this.master.connect(this.ctx.destination);

        this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      }

      // Resume if the context was suspended (autoplay policy).
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // Never throw from audio setup.
      this.ctx = null;
      this.master = null;
    }
  }

  /** Build ~2s of white noise for filtered noise-based effects. */
  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // ---------------------------------------------------------------------------
  // Mute controls
  // ---------------------------------------------------------------------------

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      // Smooth ramp to avoid clicks when toggling.
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(m ? 0 : this.masterVolume, now, 0.02);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ---------------------------------------------------------------------------
  // Low-level synthesis helpers
  // ---------------------------------------------------------------------------

  /** True if we can currently produce sound. */
  private canPlay(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === 'running';
  }

  /**
   * Create an oscillator with an attack/decay envelope, connected through the
   * given (or master) destination. Auto-cleans on stop.
   */
  private tone(
    type: OscillatorType,
    freq: number,
    start: number,
    duration: number,
    peakGain: number,
    dest?: AudioNode,
    freqEnd?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
    }

    // Fast attack, exponential-ish decay.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(dest ?? this.master);

    osc.start(start);
    osc.stop(start + duration + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  /**
   * Create a filtered noise burst. Returns nothing; auto-cleans on stop.
   */
  private noise(
    start: number,
    duration: number,
    peakGain: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    src.start(start);
    src.stop(start + duration + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Public one-shot API
  // ---------------------------------------------------------------------------

  /** Play a named sound effect. No-ops safely if audio is off; never throws. */
  play(name: SfxName): void {
    try {
      if (!this.canPlay() || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Rate-limit identical rapid triggers.
      const last = this.lastPlayed[name];
      if (last !== undefined && now - last < this.minInterval) return;
      this.lastPlayed[name] = now;

      switch (name) {
        case 'swing':
          this.sfxSwing(now);
          break;
        case 'hit':
          this.sfxHit(now);
          break;
        case 'crit':
          this.sfxCrit(now);
          break;
        case 'enemyDeath':
          this.sfxEnemyDeath(now);
          break;
        case 'playerHurt':
          this.sfxPlayerHurt(now);
          break;
        case 'levelUp':
          this.sfxLevelUp(now);
          break;
        case 'pickup':
          this.sfxPickup(now);
          break;
        case 'skill':
          this.sfxSkill(now);
          break;
        case 'bossRoar':
          this.sfxBossRoar(now);
          break;
      }
    } catch {
      // Swallow any synthesis error — audio must never break the game.
    }
  }

  // Quick descending whoosh — bandpass noise sweeping down.
  private sfxSwing(now: number): void {
    this.noise(now, 0.12, 0.28, 'bandpass', 3200, 700);
  }

  // Short punchy thud — low sine body + a tiny noise click.
  private sfxHit(now: number): void {
    this.tone('sine', 160, now, 0.14, 0.5, undefined, 70);
    this.noise(now, 0.05, 0.22, 'lowpass', 2600, 900);
  }

  // Brighter, louder hit with a quick two-note metallic ring.
  private sfxCrit(now: number): void {
    this.tone('sine', 200, now, 0.16, 0.6, undefined, 90);
    this.noise(now, 0.06, 0.3, 'highpass', 1800, 4000);
    // Two-note ring.
    this.tone('triangle', 880, now + 0.02, 0.12, 0.28);
    this.tone('triangle', 1320, now + 0.09, 0.14, 0.24);
  }

  // Downward pitch sweep — enemy dying.
  private sfxEnemyDeath(now: number): void {
    this.tone('sawtooth', 520, now, 0.35, 0.35, undefined, 90);
    this.noise(now, 0.3, 0.14, 'lowpass', 1600, 300);
  }

  // Dissonant low buzz — player getting hurt.
  private sfxPlayerHurt(now: number): void {
    this.tone('square', 150, now, 0.22, 0.32);
    this.tone('square', 159, now, 0.22, 0.3); // slight detune → beating/dissonance
    this.noise(now, 0.12, 0.12, 'lowpass', 900, 400);
  }

  // Bright ascending arpeggio (4 notes).
  private sfxLevelUp(now: number): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      this.tone('triangle', f, now + i * 0.08, 0.2, 0.3);
    });
  }

  // Short pleasant two-note chime.
  private sfxPickup(now: number): void {
    this.tone('sine', 987.77, now, 0.12, 0.28); // B5
    this.tone('sine', 1318.51, now + 0.07, 0.16, 0.26); // E6
  }

  // Sci-fi zap sweep.
  private sfxSkill(now: number): void {
    this.tone('sawtooth', 300, now, 0.25, 0.3, undefined, 2400);
    this.noise(now, 0.2, 0.16, 'bandpass', 800, 5000);
  }

  // Deep detuned rumble (~0.8s) — boss roar.
  private sfxBossRoar(now: number): void {
    const dur = 0.8;
    this.tone('sawtooth', 70, now, dur, 0.4, undefined, 45);
    this.tone('sawtooth', 73, now, dur, 0.36, undefined, 47); // detune
    this.tone('square', 100, now, dur, 0.22, undefined, 60);
    this.noise(now, dur, 0.18, 'lowpass', 600, 120);
  }

  // ---------------------------------------------------------------------------
  // Ambient music — slow, dark, cold drone/pad loop.
  // ---------------------------------------------------------------------------

  /**
   * Start a continuous ambient drone. Idempotent: calling twice does nothing
   * while already playing. Requires unlock() to have created the context.
   */
  startMusic(): void {
    try {
      if (this.musicPlaying) return;
      if (!this.ctx || !this.master) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Dedicated low-gain bus for the pad.
      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(0.0001, now);
      musicGain.gain.exponentialRampToValueAtTime(0.08, now + 3); // slow fade-in
      musicGain.connect(this.master);
      this.musicGain = musicGain;

      // A gently sweeping lowpass filter gives the pad slow motion.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      filter.Q.value = 3;
      filter.connect(musicGain);

      // Slow LFO modulating the filter cutoff — the "cold wind" motion.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06; // very slow
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(now);

      // A few detuned low oscillators form a dark minor-ish drone (A / C / E).
      const droneFreqs = [55, 55.4, 82.41, 65.41]; // A1 (+detune), E2, C2
      const oscillators: OscillatorNode[] = droneFreqs.map((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start(now);
        return osc;
      });

      // Cold wind: filtered noise, with a slow LFO swelling the gusts.
      const windNodes: AudioNode[] = [];
      if (this.noiseBuffer) {
        const wind = ctx.createBufferSource();
        wind.buffer = this.noiseBuffer;
        wind.loop = true;

        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 480;
        windFilter.Q.value = 0.6;

        const windGain = ctx.createGain();
        windGain.gain.value = 0.16;

        // Gust LFO: slowly swells the wind volume and sweeps its pitch.
        const gustLfo = ctx.createOscillator();
        gustLfo.type = 'sine';
        gustLfo.frequency.value = 0.09;
        const gustGain = ctx.createGain();
        gustGain.gain.value = 0.10;
        gustLfo.connect(gustGain);
        gustGain.connect(windGain.gain);

        const gustPitch = ctx.createGain();
        gustPitch.gain.value = 180;
        gustLfo.connect(gustPitch);
        gustPitch.connect(windFilter.frequency);

        wind.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(musicGain);
        wind.start(now);
        gustLfo.start(now);
        windNodes.push(wind, windFilter, windGain, gustLfo, gustGain, gustPitch);
      }

      // Track everything for teardown.
      this.musicNodes = [filter, lfo, lfoGain, ...oscillators, ...windNodes];
      this.musicPlaying = true;
      this.musicMode = 'ambient';
    } catch {
      // Never throw — just leave music off.
      this.musicPlaying = false;
    }
  }

  /**
   * Tense boss battle theme: darker drone, driving bass ostinato and a
   * heartbeat-like percussion pulse. Replaces whatever music is playing.
   */
  startBossMusic(): void {
    try {
      if (this.musicMode === 'boss') return;
      if (this.musicPlaying) this.stopMusic();
      if (!this.ctx || !this.master) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(0.0001, now);
      musicGain.gain.exponentialRampToValueAtTime(0.11, now + 1.2); // faster fade-in
      musicGain.connect(this.master);
      this.musicGain = musicGain;

      // Darker, more open filter than the ambient pad.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 2;
      filter.connect(musicGain);

      // Dissonant drone: D minor-ish with a tritone rub for menace.
      const droneFreqs = [36.71, 73.42, 87.31, 51.91]; // D1, D2, F2, Ab1 (tritone)
      const oscillators = droneFreqs.map((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = i === 3 ? 0.35 : 0.8; // tritone quieter, just a shadow
        osc.connect(g);
        g.connect(filter);
        osc.start(now);
        return osc;
      });

      this.musicNodes = [filter, ...oscillators];
      this.musicPlaying = true;
      this.musicMode = 'boss';

      // Rhythm: bass ostinato stabs + heartbeat thump, scheduled on a timer.
      // D–D–F–D  D–C–Ab–A pattern, one step per 240ms (~125bpm eighths).
      const pattern = [73.42, 73.42, 87.31, 73.42, 73.42, 65.41, 51.91, 55.0];
      this.bossStep = 0;
      this.bossPulseTimer = window.setInterval(() => {
        if (!this.canPlay() || this.musicMode !== 'boss' || !this.ctx || !this.musicGain) return;
        const t = this.ctx.currentTime;
        const step = this.bossStep++ % pattern.length;

        // Bass stab
        this.tone('sawtooth', pattern[step], t, 0.18, 0.20, this.musicGain);

        // Heartbeat thump on beats 1 and 5 (low sine knock)
        if (step % 4 === 0 && this.noiseBuffer) {
          this.tone('sine', 55, t, 0.14, 0.5, this.musicGain, 38);
        }
      }, 240);
    } catch {
      this.musicPlaying = false;
      this.musicMode = null;
    }
  }

  /** Stop the ambient music and disconnect all its nodes. */
  stopMusic(): void {
    try {
      if (this.bossPulseTimer !== null) {
        window.clearInterval(this.bossPulseTimer);
        this.bossPulseTimer = null;
      }
      this.musicMode = null;
      if (!this.musicPlaying) return;
      const ctx = this.ctx;
      const now = ctx ? ctx.currentTime : 0;

      // Fade the bus out to avoid a click, then tear down.
      if (this.musicGain && ctx) {
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setTargetAtTime(0.0001, now, 0.4);
      }

      const stopAt = now + 1.2;
      for (const node of this.musicNodes) {
        // Oscillators must be stopped; all nodes get disconnected.
        const maybeOsc = node as Partial<OscillatorNode>;
        if (typeof maybeOsc.stop === 'function') {
          try {
            maybeOsc.stop(stopAt);
          } catch {
            /* already stopped */
          }
        }
      }

      // Disconnect after the fade completes.
      const nodesToClean = this.musicNodes;
      const gainToClean = this.musicGain;
      const cleanup = () => {
        for (const node of nodesToClean) {
          try {
            node.disconnect();
          } catch {
            /* ignore */
          }
        }
        try {
          gainToClean?.disconnect();
        } catch {
          /* ignore */
        }
      };
      // Use setTimeout for disconnect since AudioNodes have no reliable
      // "all done" event for non-source nodes.
      setTimeout(cleanup, 1400);

      this.musicNodes = [];
      this.musicGain = null;
      this.musicPlaying = false;
    } catch {
      this.musicNodes = [];
      this.musicGain = null;
      this.musicPlaying = false;
    }
  }
}

/** Singleton audio manager for the whole game. */
export const audio = new AudioManager();
