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

  // Envelope Followers, Dynamic Range & Beat Detection
  private smoothBass: number = 0.0;
  private smoothMid: number = 0.0;
  private smoothTreble: number = 0.0;
  private smoothLevel: number = 0.0;
  private beatValue: number = 0.0;
  private bassHistory: number[] = [];
  private lastBeatTime: number = 0;

  // Adaptive Noise Floor & Peak Trackers (separates transients from continuous music hum)
  private floorBass: number = 0.12;
  private floorMid: number = 0.08;
  private floorTreble: number = 0.04;
  private peakBass: number = 0.35;
  private peakMid: number = 0.28;
  private peakTreble: number = 0.20;

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
      this.analyser.smoothingTimeConstant = 0.45;
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
    this.floorBass = 0.12;
    this.floorMid = 0.08;
    this.floorTreble = 0.04;
    this.peakBass = 0.35;
    this.peakMid = 0.28;
    this.peakTreble = 0.20;
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
    // 1. Sub-bass & Bass: Bins 1..6 (~86 - 510 Hz)
    let sumBass = 0;
    for (let i = 1; i <= 6; i++) sumBass += this.freqData[i];
    const rawBass = sumBass / (6 * 255.0);

    // 2. Mids: Bins 7..35 (~600 - 3000 Hz)
    let sumMid = 0;
    for (let i = 7; i <= 35; i++) sumMid += this.freqData[i];
    const rawMid = sumMid / (29 * 255.0);

    // 3. Treble: Bins 36..120 (~3100 - 10300 Hz)
    let sumTreble = 0;
    for (let i = 36; i <= 120; i++) sumTreble += this.freqData[i];
    const rawTreble = sumTreble / (85 * 255.0);

    // Adaptive noise floor & peak tracking: separates musical transients from continuous noise floor
    // Floor tracks quietest baseline; peak tracks loud hits
    this.floorBass = (rawBass < this.floorBass)
      ? this.floorBass + (rawBass - this.floorBass) * 0.18
      : this.floorBass + (rawBass - this.floorBass) * 0.003;
    this.peakBass = (rawBass > this.peakBass)
      ? this.peakBass + (rawBass - this.peakBass) * 0.35
      : Math.max(this.floorBass + 0.12, this.peakBass * 0.993);

    const rangeBass = Math.max(0.10, this.peakBass - this.floorBass);
    const normBass = Math.max(0.0, Math.min(1.0, (rawBass - this.floorBass) / rangeBass));
    const targetBass = Math.pow(normBass, 2.0); // Quadratic dropoff: quiet passages drop cleanly to 0.0!

    // Mid
    this.floorMid = (rawMid < this.floorMid)
      ? this.floorMid + (rawMid - this.floorMid) * 0.18
      : this.floorMid + (rawMid - this.floorMid) * 0.003;
    this.peakMid = (rawMid > this.peakMid)
      ? this.peakMid + (rawMid - this.peakMid) * 0.35
      : Math.max(this.floorMid + 0.10, this.peakMid * 0.993);

    const rangeMid = Math.max(0.10, this.peakMid - this.floorMid);
    const normMid = Math.max(0.0, Math.min(1.0, (rawMid - this.floorMid) / rangeMid));
    const targetMid = Math.pow(normMid, 1.8);

    // Treble
    this.floorTreble = (rawTreble < this.floorTreble)
      ? this.floorTreble + (rawTreble - this.floorTreble) * 0.18
      : this.floorTreble + (rawTreble - this.floorTreble) * 0.003;
    this.peakTreble = (rawTreble > this.peakTreble)
      ? this.peakTreble + (rawTreble - this.peakTreble) * 0.35
      : Math.max(this.floorTreble + 0.08, this.peakTreble * 0.993);

    const rangeTreble = Math.max(0.08, this.peakTreble - this.floorTreble);
    const normTreble = Math.max(0.0, Math.min(1.0, (rawTreble - this.floorTreble) / rangeTreble));
    const targetTreble = Math.pow(normTreble, 1.8);

    // Dynamic level
    const targetLevel = targetBass * 0.45 + targetMid * 0.35 + targetTreble * 0.20;

    // Asymmetric Attack/Decay Envelope Followers:
    // Fast attack (0.70) on transients, fast decay (0.22) so the object exhales and lights dim when sound drops!
    const attackBass = 0.70, decayBass = 0.22;
    this.smoothBass += (targetBass > this.smoothBass)
      ? (targetBass - this.smoothBass) * attackBass
      : (targetBass - this.smoothBass) * decayBass;

    const attackMid = 0.65, decayMid = 0.20;
    this.smoothMid += (targetMid > this.smoothMid)
      ? (targetMid - this.smoothMid) * attackMid
      : (targetMid - this.smoothMid) * decayMid;

    const attackTreble = 0.75, decayTreble = 0.22;
    this.smoothTreble += (targetTreble > this.smoothTreble)
      ? (targetTreble - this.smoothTreble) * attackTreble
      : (targetTreble - this.smoothTreble) * decayTreble;

    this.smoothLevel += (targetLevel > this.smoothLevel)
      ? (targetLevel - this.smoothLevel) * 0.65
      : (targetLevel - this.smoothLevel) * 0.20;

    // Beat / Transient Onset Detector
    this.bassHistory.push(targetBass);
    if (this.bassHistory.length > 20) this.bassHistory.shift();

    const avgBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
    const now = performance.now();
    const threshold = Math.max(0.20, avgBass * 1.35);

    if (targetBass > threshold && targetBass > 0.25 && (now - this.lastBeatTime) > 160) {
      this.beatValue = 1.0;
      this.lastBeatTime = now;
    } else {
      this.beatValue *= 0.78; // Snappy beat decay (~100ms)
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
