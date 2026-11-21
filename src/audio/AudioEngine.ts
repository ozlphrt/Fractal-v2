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

export interface FractalMathAudioState {
  formulaId: string;
  params: Record<string, number>;
  cameraDistance: number;
}

const FORMULA_BASE_FREQS: Record<string, number> = {
  // Deep cosmic D minor drone
  quaternion_julia: 73.42, // D2
  ribbon_julia: 73.42,
  quartz_julia: 73.42,
  // A minor spherical warm harmonics
  mandelbulb: 110.00, // A2
  juliabulb: 110.00,
  helix_bulb: 110.00,
  // F minor organic gasket resonances
  apollonian_gasket: 87.31, // F2
  lace_gasket: 87.31,
  pearl_gasket: 87.31,
  // G minor crystalline origami
  kifs: 98.00, // G2
  wind_ship: 98.00,
  burning_ship: 98.00,
  // C minor deep structural / architectural bass
  menger_sponge: 65.41, // C2
  jerusalem_cube: 65.41,
  vault_cube: 65.41,
  twist_cube: 65.41,
  // E minor sacred cathedral / geometric
  cathedral: 82.41, // E2
  tetrahedron: 82.41,
  kaliset: 82.41,
  kleinian: 82.41,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  // Input Nodes
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private fileSource: MediaElementAudioSourceNode | null = null;

  // 3-Voice Generative Fractal Math Synthesizer
  private synthOsc1: OscillatorNode | null = null; // Sub-bass fundamental drone
  private synthOsc2: OscillatorNode | null = null; // Harmonic chord / fifth (tracks primary math param)
  private synthOsc3: OscillatorNode | null = null; // High crystalline shimmer overtone (tracks detail/iterations)
  private synthFilter: BiquadFilterNode | null = null;
  private synthGain1: GainNode | null = null;
  private synthGain2: GainNode | null = null;
  private synthGain3: GainNode | null = null;
  private synthMasterGain: GainNode | null = null;
  private synthTimer: number | null = null;
  private currentBaseFreq: number = 73.42;

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

  /** Plays built-in generative fractal math synthesizer (frequency, chords and filters sculpted by fractal math) */
  public enableSynth(): void {
    this.cleanupCurrentSource();
    const ctx = this.ensureContext();

    // 1. Resonant lowpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;
    filter.Q.value = 2.4;

    // Master synth gain node
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.32;

    // Voice 1: Sub-Bass Fundamental Drone (warm triangle wave)
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = this.currentBaseFreq;
    const gain1 = ctx.createGain();
    gain1.gain.value = 0.52;
    osc1.connect(gain1);
    gain1.connect(filter);

    // Voice 2: Harmonic Chord / Melodic Voice (rich sawtooth/triangle wave with detune)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = this.currentBaseFreq * 1.5; // Musical fifth
    osc2.detune.value = 6;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.28;
    osc2.connect(gain2);
    gain2.connect(filter);

    // Voice 3: Crystalline Shimmer / High Overtones (pure sine wave)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = this.currentBaseFreq * 3.0; // High harmonic
    const gain3 = ctx.createGain();
    gain3.gain.value = 0.14;
    osc3.connect(gain3);
    gain3.connect(filter);

    filter.connect(masterGain);
    masterGain.connect(this.analyser!);
    masterGain.connect(this.gainNode!);

    osc1.start();
    osc2.start();
    osc3.start();

    this.synthOsc1 = osc1;
    this.synthOsc2 = osc2;
    this.synthOsc3 = osc3;
    this.synthGain1 = gain1;
    this.synthGain2 = gain2;
    this.synthGain3 = gain3;
    this.synthFilter = filter;
    this.synthMasterGain = masterGain;

    // Organic LFO filter breathing (smooth slow ambient sweep)
    let lfoPhase = 0;
    this.synthTimer = window.setInterval(() => {
      if (!this.ctx || this.sourceMode !== 'synth' || !this.synthFilter) return;
      const t = this.ctx.currentTime;
      lfoPhase += 0.25;
      const lfoMod = Math.sin(lfoPhase) * 90;
      const curFreq = this.synthFilter.frequency.value;
      this.synthFilter.frequency.setTargetAtTime(Math.max(180, curFreq + lfoMod * 0.15), t, 0.35);
    }, 450);

    this.sourceMode = 'synth';
    this.trackName = 'Fractal Math Synthesizer';
    this.isPlaying = true;
    this.notifyState();
  }

  /** Dynamically sculpts synth pitch, harmonics, filter cutoff & resonance from live fractal math */
  public updateFractalMath(state: FractalMathAudioState): void {
    if (this.sourceMode !== 'synth' || !this.ctx || !this.synthOsc1 || !this.synthOsc2 || !this.synthFilter) {
      return;
    }
    const t = this.ctx.currentTime;

    // 1. Base harmonic frequency for formula family
    const baseFreq = FORMULA_BASE_FREQS[state.formulaId] ?? 73.42;
    this.currentBaseFreq = baseFreq;

    // 2. Extract primary and secondary mathematical parameters
    const values = Object.values(state.params);
    const p1 = values.length > 0 ? values[0] : 1.0;
    const p2 = values.length > 1 ? values[1] : 0.0;
    const p3 = values.length > 2 ? values[2] : 0.0;

    // 3. Primary Parameter -> Continuous Harmonic Pitch Glide
    const normalizedParam = Math.max(0.1, Math.min(12.0, Math.abs(p1)));
    const pitchRatio = Math.pow(2.0, (Math.log2(normalizedParam) * 0.30));
    const targetFreq1 = baseFreq;
    const targetFreq2 = baseFreq * 1.5 * pitchRatio; // Fifth transposed by fractal scale
    const targetFreq3 = baseFreq * 3.0 * Math.max(0.75, Math.min(2.0, 1.0 + p2 * 0.15));

    this.synthOsc1.frequency.setTargetAtTime(targetFreq1, t, 0.08);
    this.synthOsc2.frequency.setTargetAtTime(Math.max(40, Math.min(1200, targetFreq2)), t, 0.08);
    if (this.synthOsc3) {
      this.synthOsc3.frequency.setTargetAtTime(Math.max(100, Math.min(2400, targetFreq3)), t, 0.08);
    }

    // 4. Secondary Parameter (Twist, Wave, Fold) -> Filter Cutoff, Resonance & Detune
    const targetCutoff = Math.max(200, Math.min(2600, 320 + Math.abs(p1) * 140 + Math.abs(p2) * 260));
    const targetQ = Math.max(1.0, Math.min(5.5, 1.8 + Math.abs(p2) * 2.8));
    this.synthFilter.frequency.setTargetAtTime(targetCutoff, t, 0.08);
    this.synthFilter.Q.setTargetAtTime(targetQ, t, 0.08);

    // Detune modulation (analog chorus width from twist/wave)
    const targetDetune = Math.max(-20, Math.min(20, p2 * 10.0 + (p3 - 1.0) * 6.0));
    this.synthOsc2.detune.setTargetAtTime(targetDetune, t, 0.08);

    // 5. Camera Proximity -> Sub-Bass & Air Balance
    if (this.synthGain1 && this.synthGain3) {
      const dist = Math.max(0.5, Math.min(10.0, state.cameraDistance));
      const subGain = Math.max(0.35, Math.min(0.68, 0.65 - dist * 0.035));
      const shimmerGain = Math.max(0.06, Math.min(0.30, 0.08 + dist * 0.022));
      this.synthGain1.gain.setTargetAtTime(subGain, t, 0.1);
      this.synthGain3.gain.setTargetAtTime(shimmerGain, t, 0.1);
    }
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
    if (this.synthOsc3) {
      try { this.synthOsc3.stop(); } catch { /* ignore */ }
      this.synthOsc3.disconnect();
      this.synthOsc3 = null;
    }
    if (this.synthGain1) {
      this.synthGain1.disconnect();
      this.synthGain1 = null;
    }
    if (this.synthGain2) {
      this.synthGain2.disconnect();
      this.synthGain2 = null;
    }
    if (this.synthGain3) {
      this.synthGain3.disconnect();
      this.synthGain3 = null;
    }
    if (this.synthFilter) {
      this.synthFilter.disconnect();
      this.synthFilter = null;
    }
    if (this.synthMasterGain) {
      this.synthMasterGain.disconnect();
      this.synthMasterGain = null;
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
