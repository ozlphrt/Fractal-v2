// src/audio/AudioEngine.ts
// Real-time Web Audio API signal processing engine with dual inputs:
// 1. Live Microphone / Stereo Mix (getUserMedia)
// 2. Local Audio File Player (MP3 / WAV / OGG / FLAC / AAC)
// 3. Built-in Generative Ambient Drone Synth (instant zero-friction demo)
//
// Computes 4 smooth envelope-followed frequency bands + beat transient detection
// designed specifically for subtle, organic breathing in raymarching shaders.

export interface AudioMetrics {
  active: boolean;
  source: 'off' | 'mic' | 'file' | 'synth';
  bass: number;       // 0.0 - 1.0 (sub-bass & kick energy, medium decay)
  mid: number;        // 0.0 - 1.0 (melody, vocals, synth harmonics)
  treble: number;     // 0.0 - 1.0 (shimmer, hi-hats, percussive air)
  level: number;      // 0.0 - 1.0 (overall RMS volume)
  beat: number;       // 0.0 - 1.0 (transient kick impulse with exponential decay)
  trackName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  // Input Nodes
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private fileSource: MediaElementAudioSourceNode | null = null;

  // Generative Synth Nodes
  private synthOsc1: OscillatorNode | null = null;
  private synthOsc2: OscillatorNode | null = null;
  private synthFilter: BiquadFilterNode | null = null;
  private synthTimer: number | null = null;

  // Analysis State
  private sourceMode: 'off' | 'mic' | 'file' | 'synth' = 'off';
  private trackName: string = '';
  private isPlaying: boolean = false;
  private freqData: Uint8Array = new Uint8Array(256);

  // Envelope Followers & Beat Detection
  private smoothBass: number = 0.0;
  private smoothMid: number = 0.0;
  private smoothTreble: number = 0.0;
  private smoothLevel: number = 0.0;
  private beatValue: number = 0.0;
  private bassHistory: number[] = [];
  private lastBeatTime: number = 0;

  // Callback on audio state change
  public onStateChange?: (metrics: AudioMetrics) => void;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.78;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 1.0;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Connects to live microphone or stereo mix */
  public async enableMic(): Promise<boolean> {
    try {
      this.cleanupCurrentSource();
      const ctx = this.ensureContext();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.analyser!);
      // Note: microphone is NOT connected to gainNode/destination to prevent acoustic feedback howl

      this.sourceMode = 'mic';
      this.trackName = 'Live Microphone / Input';
      this.isPlaying = true;
      this.notifyState();
      return true;
    } catch (err) {
      console.warn('Microphone permission denied or unavailable:', err);
      this.disable();
      return false;
    }
  }

  /** Loads an audio file (MP3, WAV, FLAC, OGG, etc.) */
  public loadFile(file: File): void {
    this.cleanupCurrentSource();
    const ctx = this.ensureContext();

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = objectUrl;
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    this.audioElement = audio;

    this.fileSource = ctx.createMediaElementSource(audio);
    this.fileSource.connect(this.analyser!);
    this.fileSource.connect(this.gainNode!);

    this.sourceMode = 'file';
    this.trackName = file.name.replace(/\.[^/.]+$/, '');

    audio.play().then(() => {
      this.isPlaying = true;
      this.notifyState();
    }).catch(err => {
      console.warn('Audio playback error:', err);
      this.isPlaying = false;
      this.notifyState();
    });

    audio.onended = () => {
      this.isPlaying = false;
      this.notifyState();
    };
  }

  /** Plays built-in generative ambient drone synth (instant zero-friction demo) */
  public enableSynth(): void {
    this.cleanupCurrentSource();
    const ctx = this.ensureContext();

    // 1. Resonant lowpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3.5;

    // 2. Dual detuned warm chord oscillators (F minor 9th: 174 Hz & 261 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 174.61; // F3

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 261.63; // C4
    osc2.detune.value = 9;

    const synthGain = ctx.createGain();
    synthGain.gain.value = 0.28;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(synthGain);
    synthGain.connect(this.analyser!);
    synthGain.connect(this.gainNode!);

    osc1.start();
    osc2.start();

    this.synthOsc1 = osc1;
    this.synthOsc2 = osc2;
    this.synthFilter = filter;

    // Periodic pulsing bass sweep at ~96 BPM (ambient pulse)
    let beatStep = 0;
    this.synthTimer = window.setInterval(() => {
      if (!this.ctx || this.sourceMode !== 'synth') return;
      const t = this.ctx.currentTime;
      beatStep = (beatStep + 1) % 4;
      const targetFreq = beatStep === 0 ? 880 : 360 + Math.sin(beatStep) * 120;
      filter.frequency.cancelScheduledValues(t);
      filter.frequency.setValueAtTime(filter.frequency.value, t);
      filter.frequency.exponentialRampToValueAtTime(targetFreq, t + 0.12);
      filter.frequency.exponentialRampToValueAtTime(280, t + 0.55);
    }, 625); // 96 BPM

    this.sourceMode = 'synth';
    this.trackName = 'Ambient Fractal Drone';
    this.isPlaying = true;
    this.notifyState();
  }

  /** Toggles play/pause for file and synth playback */
  public togglePlayPause(): void {
    if (this.sourceMode === 'file' && this.audioElement) {
      if (this.audioElement.paused) {
        this.audioElement.play().then(() => {
          this.isPlaying = true;
          this.notifyState();
        });
      } else {
        this.audioElement.pause();
        this.isPlaying = false;
        this.notifyState();
      }
    } else if (this.sourceMode === 'synth') {
      if (this.isPlaying) {
        this.gainNode?.gain.setTargetAtTime(0.0, this.ctx!.currentTime, 0.05);
        this.isPlaying = false;
      } else {
        this.gainNode?.gain.setTargetAtTime(1.0, this.ctx!.currentTime, 0.05);
        this.isPlaying = true;
      }
      this.notifyState();
    }
  }

  /** Cleans up active audio stream or nodes */
  private cleanupCurrentSource(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.fileSource) {
      this.fileSource.disconnect();
      this.fileSource = null;
    }
    if (this.synthOsc1) {
      try { this.synthOsc1.stop(); } catch { /* ignore */ }
      this.synthOsc1.disconnect();
      this.synthOsc1 = null;
    }
    if (this.synthOsc2) {
      try { this.synthOsc2.stop(); } catch { /* ignore */ }
      this.synthOsc2.disconnect();
      this.synthOsc2 = null;
    }
    if (this.synthFilter) {
      this.synthFilter.disconnect();
      this.synthFilter = null;
    }
    if (this.synthTimer !== null) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  /** Disables audio reactivity */
  public disable(): void {
    this.cleanupCurrentSource();
    this.sourceMode = 'off';
    this.trackName = '';
    this.isPlaying = false;
    this.smoothBass = 0.0;
    this.smoothMid = 0.0;
    this.smoothTreble = 0.0;
    this.smoothLevel = 0.0;
    this.beatValue = 0.0;
    this.notifyState();
  }

  /** Per-frame signal analysis and envelope followers */
  public update(_dt: number): void {
    if (this.sourceMode === 'off' || !this.analyser || !this.isPlaying) {
      this.smoothBass *= 0.90;
      this.smoothMid *= 0.90;
      this.smoothTreble *= 0.90;
      this.smoothLevel *= 0.90;
      this.beatValue *= 0.85;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData as any);

    // Frequency band bin ranges (256 bins across 0 - 22,050 Hz, ~86 Hz per bin)
    // 1. Sub-bass & Bass: Bins 1..5 (~86 - 430 Hz)
    let sumBass = 0;
    for (let i = 1; i <= 5; i++) sumBass += this.freqData[i];
    const rawBass = sumBass / (5 * 255.0);

    // 2. Mids: Bins 6..28 (~500 - 2400 Hz)
    let sumMid = 0;
    for (let i = 6; i <= 28; i++) sumMid += this.freqData[i];
    const rawMid = sumMid / (23 * 255.0);

    // 3. Treble: Bins 29..110 (~2500 - 9500 Hz)
    let sumTreble = 0;
    for (let i = 29; i <= 110; i++) sumTreble += this.freqData[i];
    const rawTreble = sumTreble / (82 * 255.0);

    // 4. Overall RMS Level
    const rawLevel = rawBass * 0.45 + rawMid * 0.35 + rawTreble * 0.20;

    // Asymmetric Attack/Decay Envelope Followers (fast punch, organic smooth release)
    const attackBass = 0.50, decayBass = 0.09;
    this.smoothBass += (rawBass > this.smoothBass)
      ? (rawBass - this.smoothBass) * attackBass
      : (rawBass - this.smoothBass) * decayBass;

    const attackMid = 0.40, decayMid = 0.08;
    this.smoothMid += (rawMid > this.smoothMid)
      ? (rawMid - this.smoothMid) * attackMid
      : (rawMid - this.smoothMid) * decayMid;

    const attackTreble = 0.60, decayTreble = 0.12;
    this.smoothTreble += (rawTreble > this.smoothTreble)
      ? (rawTreble - this.smoothTreble) * attackTreble
      : (rawTreble - this.smoothTreble) * decayTreble;

    this.smoothLevel += (rawLevel - this.smoothLevel) * 0.15;

    // Beat / Transient Onset Detector
    // Keeps a 24-frame moving average of bass energy
    this.bassHistory.push(rawBass);
    if (this.bassHistory.length > 24) this.bassHistory.shift();

    const avgBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
    const now = performance.now();
    const threshold = Math.max(0.18, avgBass * 1.35);

    if (rawBass > threshold && rawBass > 0.15 && (now - this.lastBeatTime) > 175) {
      this.beatValue = 1.0;
      this.lastBeatTime = now;
    } else {
      this.beatValue *= 0.88; // Exponential beat decay (~140ms duration)
    }
  }

  /** Returns normalized [0, 1] metrics for shaders and camera breathing */
  public getMetrics(): AudioMetrics {
    return {
      active: this.sourceMode !== 'off' && this.isPlaying,
      source: this.sourceMode,
      bass: Math.min(1.0, Math.max(0.0, this.smoothBass)),
      mid: Math.min(1.0, Math.max(0.0, this.smoothMid)),
      treble: Math.min(1.0, Math.max(0.0, this.smoothTreble)),
      level: Math.min(1.0, Math.max(0.0, this.smoothLevel)),
      beat: Math.min(1.0, Math.max(0.0, this.beatValue)),
      trackName: this.trackName,
      isPlaying: this.isPlaying,
      currentTime: this.audioElement?.currentTime ?? 0,
      duration: this.audioElement?.duration ?? 0
    };
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getMetrics());
    }
  }
}
