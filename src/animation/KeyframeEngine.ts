// src/animation/KeyframeEngine.ts
// Global Keyframe track & smooth cubic loop engine
// Captures full studio scene (Camera, Optics, Lighting, Materials/Palette vectors, and Fractal Math parameters)
// Interpolates continuous parameters with monotonic cubic Hermite splines without double-easing

import { PalettePreset } from '../core/types.ts';
import { DEFAULT_KEYFRAMES } from './defaultKeyframes.ts';

export interface CameraSnapshot {
  pos: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  orbitRadius: number;
}

export interface Keyframe {
  id: string;
  formulaId: string;
  camera: CameraSnapshot;
  palette: PalettePreset;
  paletteIndex: number;
  values: Record<string, number>;
  timestamp: number;
}

export function slerpVec3(v1: [number, number, number], v2: [number, number, number], t: number): [number, number, number] {
  let dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  dot = Math.max(-1.0, Math.min(1.0, dot));

  if (dot > 0.99995) {
    const rx = v1[0] + (v2[0] - v1[0]) * t;
    const ry = v1[1] + (v2[1] - v1[1]) * t;
    const rz = v1[2] + (v2[2] - v1[2]) * t;
    const l = Math.hypot(rx, ry, rz) || 1.0;
    return [rx / l, ry / l, rz / l];
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  if (sinTheta < 1e-6) {
    return [...v1];
  }

  const w1 = Math.sin((1.0 - t) * theta) / sinTheta;
  const w2 = Math.sin(t * theta) / sinTheta;

  return [
    w1 * v1[0] + w2 * v2[0],
    w1 * v1[1] + w2 * v2[1],
    w1 * v1[2] + w2 * v2[2]
  ];
}

function tangent(before: number, after: number): number {
  return before * after > 0 ? (2 * before * after) / (before + after) : 0;
}

function unwrapAngleDeg(ref: number, target: number): number {
  let diff = (target - ref) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ref + diff;
}

// Monotone (Fritsch-Butland) cubic Hermite: C1-continuous across keyframes, no overshoot.
// Used for slider/material scalar values.
export function cubicHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const delta = p2 - p1;
  const m1 = tangent(p1 - p0, delta);
  const m2 = tangent(delta, p3 - p2);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1
    + (t3 - 2 * t2 + t) * m1
    + (-2 * t3 + 3 * t2) * p2
    + (t3 - t2) * m2;
}

// Uniform Catmull-Rom: velocity is continuous through keyframes (no stopping, no kinks).
// Used for camera motion.
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export class KeyframeEngine {
  private keyframes: Keyframe[] = [];
  public isPlaying: boolean = false;
  public playingFormulaId: string | null = null;

  public segmentDuration: number = 4.5; // seconds per segment for smooth cinematic transitions
  private elapsed: number = 0;
  private currentSegment: number = 0;
  public activeIndex: number = -1;
  public segmentProgress: number = 0;

  public onApplyState?: (
    camera: CameraSnapshot,
    values: Record<string, number>,
    palette: PalettePreset,
    paletteIndex: number
  ) => void;
  public onTrackChange?: () => void;
  /** Fired after the loop has played one full cycle (all segments, back to keyframe #1) */
  public onCycleComplete?: (formulaId: string) => void;
  private segmentsPlayed: number = 0;
  /** When true, onCycleComplete fires on arrival at the last keyframe (used by the auto-play tour) */
  public cycleAtLastKeyframe: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  public getFramesFor(formulaId: string): Keyframe[] {
    return this.keyframes.filter(k => k.formulaId === formulaId);
  }

  public addKeyframe(
    formulaId: string,
    camera: CameraSnapshot,
    values: Record<string, number>,
    palette: PalettePreset,
    paletteIndex: number
  ): Keyframe {
    const frame: Keyframe = {
      id: 'kf_' + Math.random().toString(36).slice(2, 9),
      formulaId,
      camera: {
        pos: [...camera.pos],
        target: [...camera.target],
        up: [...camera.up],
        orbitRadius: camera.orbitRadius
      },
      palette: {
        id: palette.id,
        name: palette.name,
        a: [...palette.a],
        b: [...palette.b],
        c: [...palette.c],
        d: [...palette.d]
      },
      paletteIndex,
      values: { ...values },
      timestamp: Date.now()
    };
    this.keyframes.push(frame);
    this.saveToStorage();
    this.onTrackChange?.();
    return frame;
  }

  public removeKeyframe(id: string) {
    this.keyframes = this.keyframes.filter(k => k.id !== id);
    this.saveToStorage();
    this.onTrackChange?.();
  }

  public updateKeyframe(
    id: string,
    camera: CameraSnapshot,
    values: Record<string, number>,
    palette: PalettePreset,
    paletteIndex: number
  ): boolean {
    const kf = this.keyframes.find(k => k.id === id);
    if (!kf) return false;
    kf.camera = {
      pos: [...camera.pos],
      target: [...camera.target],
      up: [...camera.up],
      orbitRadius: camera.orbitRadius
    };
    kf.palette = {
      id: palette.id,
      name: palette.name,
      a: [...palette.a],
      b: [...palette.b],
      c: [...palette.c],
      d: [...palette.d]
    };
    kf.paletteIndex = paletteIndex;
    kf.values = { ...values };
    kf.timestamp = Date.now();
    this.saveToStorage();
    this.onTrackChange?.();
    return true;
  }

  public clearTrack(formulaId: string) {
    this.keyframes = this.keyframes.filter(k => k.formulaId !== formulaId);
    this.saveToStorage();
    this.onTrackChange?.();
  }

  public replaceTrackForFormula(formulaId: string, frames: Keyframe[]) {
    this.keyframes = this.keyframes.filter(k => k.formulaId !== formulaId).concat(frames);
    this.saveToStorage();
    this.onTrackChange?.();
  }

  public play(formulaId: string): boolean {
    const track = this.getFramesFor(formulaId);
    if (track.length < 2) return false;

    this.isPlaying = true;
    this.playingFormulaId = formulaId;
    this.elapsed = 0;
    this.segmentsPlayed = 0;
    this.currentSegment = 0;
    return true;
  }

  public stop() {
    this.activeIndex = -1;
    this.isPlaying = false;
    this.playingFormulaId = null;
  }

  public togglePlay(formulaId: string): boolean {
    if (this.isPlaying && this.playingFormulaId === formulaId) {
      this.stop();
      return false;
    }
    return this.play(formulaId);
  }

  public update(dt: number) {
    if (!this.isPlaying || !this.playingFormulaId) return;
    const track = this.getFramesFor(this.playingFormulaId);
    const n = track.length;
    if (n < 2) {
      this.stop();
      return;
    }

    this.elapsed += dt;
    let cycleDone = false;
    while (this.elapsed >= this.segmentDuration) {
      this.elapsed -= this.segmentDuration;
      this.currentSegment = (this.currentSegment + 1) % n;
      this.segmentsPlayed++;
      // Tour mode fires as soon as the last keyframe is reached; normal mode after the full wrap-around
      const threshold = this.cycleAtLastKeyframe ? n - 1 : n;
      if (this.segmentsPlayed >= threshold) {
        this.segmentsPlayed = 0;
        cycleDone = true;
      }
    }

    // Single linear normalized progress in [0, 1] — NO double-easing
    const t = Math.max(0.0, Math.min(1.0, this.elapsed / this.segmentDuration));
    const idx0 = (this.currentSegment - 1 + n) % n;
    const idx1 = this.currentSegment;
    // Keyframe the playhead is currently closest to (for UI highlighting)
    this.activeIndex = t < 0.5 ? idx1 : (this.currentSegment + 1) % n;
    this.segmentProgress = t;
    const idx2 = (this.currentSegment + 1) % n;
    const idx3 = (this.currentSegment + 2) % n;

    const kf0 = track[idx0];
    const kf1 = track[idx1];
    const kf2 = track[idx2];
    const kf3 = track[idx3];

    // 1. Camera interpolation
    const cam0 = track[0].camera;
    const isCamStatic = track.every(k => {
      const p = k.camera.pos;
      const tg = k.camera.target;
      return (
        Math.hypot(p[0] - cam0.pos[0], p[1] - cam0.pos[1], p[2] - cam0.pos[2]) < 1e-4 &&
        Math.hypot(tg[0] - cam0.target[0], tg[1] - cam0.target[1], tg[2] - cam0.target[2]) < 1e-4
      );
    });

    let interpolatedCamera: CameraSnapshot;
    if (isCamStatic) {
      interpolatedCamera = {
        pos: [...cam0.pos],
        target: [...cam0.target],
        up: [...cam0.up],
        orbitRadius: cam0.orbitRadius
      };
    } else if (n === 2) {
      // 2-keyframe loop: Direct continuous hermite on position and target
      const easeT = t * t * (3.0 - 2.0 * t);
      const kfA = kf1;
      const kfB = kf2;

      const posX = kfA.camera.pos[0] + (kfB.camera.pos[0] - kfA.camera.pos[0]) * easeT;
      const posY = kfA.camera.pos[1] + (kfB.camera.pos[1] - kfA.camera.pos[1]) * easeT;
      const posZ = kfA.camera.pos[2] + (kfB.camera.pos[2] - kfA.camera.pos[2]) * easeT;

      const targetX = kfA.camera.target[0] + (kfB.camera.target[0] - kfA.camera.target[0]) * easeT;
      const targetY = kfA.camera.target[1] + (kfB.camera.target[1] - kfA.camera.target[1]) * easeT;
      const targetZ = kfA.camera.target[2] + (kfB.camera.target[2] - kfA.camera.target[2]) * easeT;

      const curUp = slerpVec3(kfA.camera.up, kfB.camera.up, easeT);

      interpolatedCamera = {
        pos: [posX, posY, posZ],
        target: [targetX, targetY, targetZ],
        up: curUp,
        orbitRadius: Math.hypot(posX - targetX, posY - targetY, posZ - targetZ)
      };
    } else {
      // 3+ keyframes: Continuous Catmull-Rom spline with continuous velocity
      // Direct 3D Euclidean Catmull-Rom on camera pos (zero jump, zero spherical distortion)
      const posX = catmullRom(kf0.camera.pos[0], kf1.camera.pos[0], kf2.camera.pos[0], kf3.camera.pos[0], t);
      const posY = catmullRom(kf0.camera.pos[1], kf1.camera.pos[1], kf2.camera.pos[1], kf3.camera.pos[1], t);
      const posZ = catmullRom(kf0.camera.pos[2], kf1.camera.pos[2], kf2.camera.pos[2], kf3.camera.pos[2], t);

      // Interpolate target center smoothly with cubic Hermite
      const targetX = catmullRom(kf0.camera.target[0], kf1.camera.target[0], kf2.camera.target[0], kf3.camera.target[0], t);
      const targetY = catmullRom(kf0.camera.target[1], kf1.camera.target[1], kf2.camera.target[1], kf3.camera.target[1], t);
      const targetZ = catmullRom(kf0.camera.target[2], kf1.camera.target[2], kf2.camera.target[2], kf3.camera.target[2], t);

      const upX = catmullRom(kf0.camera.up[0], kf1.camera.up[0], kf2.camera.up[0], kf3.camera.up[0], t);
      const upY = catmullRom(kf0.camera.up[1], kf1.camera.up[1], kf2.camera.up[1], kf3.camera.up[1], t);
      const upZ = catmullRom(kf0.camera.up[2], kf1.camera.up[2], kf2.camera.up[2], kf3.camera.up[2], t);
      const upLen = Math.hypot(upX, upY, upZ) || 1.0;

      interpolatedCamera = {
        pos: [posX, posY, posZ],
        target: [targetX, targetY, targetZ],
        up: [upX / upLen, upY / upLen, upZ / upLen],
        orbitRadius: Math.hypot(posX - targetX, posY - targetY, posZ - targetZ)
      };
    }

    // 2. Continuous direct Palette Vector interpolation (a, b, c, d)
    // Directly interpolates from Material 1 to Material 4 WITHOUT cycling through 2 and 3!
    const palA: [number, number, number] = [
      cubicHermite(kf0.palette.a[0], kf1.palette.a[0], kf2.palette.a[0], kf3.palette.a[0], t),
      cubicHermite(kf0.palette.a[1], kf1.palette.a[1], kf2.palette.a[1], kf3.palette.a[1], t),
      cubicHermite(kf0.palette.a[2], kf1.palette.a[2], kf2.palette.a[2], kf3.palette.a[2], t)
    ];
    const palB: [number, number, number] = [
      cubicHermite(kf0.palette.b[0], kf1.palette.b[0], kf2.palette.b[0], kf3.palette.b[0], t),
      cubicHermite(kf0.palette.b[1], kf1.palette.b[1], kf2.palette.b[1], kf3.palette.b[1], t),
      cubicHermite(kf0.palette.b[2], kf1.palette.b[2], kf2.palette.b[2], kf3.palette.b[2], t)
    ];
    const palC: [number, number, number] = [
      cubicHermite(kf0.palette.c[0], kf1.palette.c[0], kf2.palette.c[0], kf3.palette.c[0], t),
      cubicHermite(kf0.palette.c[1], kf1.palette.c[1], kf2.palette.c[1], kf3.palette.c[1], t),
      cubicHermite(kf0.palette.c[2], kf1.palette.c[2], kf2.palette.c[2], kf3.palette.c[2], t)
    ];
    const palD: [number, number, number] = [
      cubicHermite(kf0.palette.d[0], kf1.palette.d[0], kf2.palette.d[0], kf3.palette.d[0], t),
      cubicHermite(kf0.palette.d[1], kf1.palette.d[1], kf2.palette.d[1], kf3.palette.d[1], t),
      cubicHermite(kf0.palette.d[2], kf1.palette.d[2], kf2.palette.d[2], kf3.palette.d[2], t)
    ];

    const targetPal = t < 0.5 ? kf1.palette : kf2.palette;
    const activePalIdx = t < 0.5 ? kf1.paletteIndex : kf2.paletteIndex;
    const interpolatedPalette: PalettePreset = {
      id: targetPal.id,
      name: targetPal.name,
      a: palA,
      b: palB,
      c: palC,
      d: palD
    };

    // 3. Interpolate all parameter values (Optics, Lighting, Materials, Fractal Math)
    const interpolatedValues: Record<string, number> = {};
    const allKeys = new Set(track.flatMap(k => Object.keys(k.values)));

    for (const key of allKeys) {
      let v0 = kf0.values[key] ?? kf1.values[key] ?? 0;
      let v1 = kf1.values[key] ?? v0;
      let v2 = kf2.values[key] ?? v1;
      let v3 = kf3.values[key] ?? v2;

      if (key === 'lightAzimuth') {
        v1 = unwrapAngleDeg(v0, v1);
        v2 = unwrapAngleDeg(v1, v2);
        v3 = unwrapAngleDeg(v2, v3);
        const interp = cubicHermite(v0, v1, v2, v3, t);
        interpolatedValues[key] = (interp % 360 + 360) % 360;
      } else {
        interpolatedValues[key] = cubicHermite(v0, v1, v2, v3, t);
      }
    }

    this.onApplyState?.(interpolatedCamera, interpolatedValues, interpolatedPalette, activePalIdx);
    if (cycleDone) this.onCycleComplete?.(this.playingFormulaId!);
  }

  private saveToStorage() {
    try {
      localStorage.setItem('fractal_v2_global_keyframes', JSON.stringify(this.keyframes));
    } catch {
      // Ignore quota errors
    }
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem('fractal_v2_global_keyframes');
      if (data) {
        this.keyframes = JSON.parse(data);
        return;
      }
    } catch {
      // fall through to built-in defaults
    }
    // First run (or unreadable storage): start from the built-in defaults
    this.keyframes = JSON.parse(JSON.stringify(DEFAULT_KEYFRAMES));
  }

  /** Serializes all keyframes as a versioned JSON document */
  public exportJSON(): string {
    return JSON.stringify({ app: 'fractal-v2', version: 1, keyframes: this.keyframes }, null, 2);
  }

  /** Replaces all keyframes with those from an exported JSON document. Returns count, or throws on invalid data. */
  public importJSON(text: string): number {
    const data = JSON.parse(text);
    const list: unknown = Array.isArray(data) ? data : data?.keyframes;
    if (!Array.isArray(list)) throw new Error('No keyframes array found');
    const valid = list.filter((k: any) =>
      k && typeof k.formulaId === 'string' && k.camera && Array.isArray(k.camera.pos) &&
      Array.isArray(k.camera.target) && Array.isArray(k.camera.up) && k.palette &&
      Array.isArray(k.palette.a) && k.values && typeof k.values === 'object'
    ) as Keyframe[];
    if (valid.length === 0) throw new Error('No valid keyframes in file');
    this.keyframes = valid.map(k => ({
      ...k,
      id: k.id || 'kf_' + Math.random().toString(36).slice(2, 9),
      paletteIndex: typeof k.paletteIndex === 'number' ? k.paletteIndex : 0,
      timestamp: k.timestamp || Date.now()
    }));
    this.stop();
    this.saveToStorage();
    this.onTrackChange?.();
    return this.keyframes.length;
  }

  /** Discards user keyframes and restores the built-in defaults */
  public restoreDefaults() {
    this.keyframes = JSON.parse(JSON.stringify(DEFAULT_KEYFRAMES));
    this.saveToStorage();
    this.onTrackChange?.();
  }
}
