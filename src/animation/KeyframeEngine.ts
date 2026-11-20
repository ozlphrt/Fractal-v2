// src/animation/KeyframeEngine.ts
// Keyframe track & smooth cubic loop engine based on reference implementation
// Interpolates camera vectors and tab parameter states with monotonic cubic tangents

export interface CameraSnapshot {
  pos: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  orbitRadius: number;
}

export interface Keyframe {
  id: string;
  formulaId: string;
  tabId: string;
  camera: CameraSnapshot;
  values: Record<string, number>;
  timestamp: number;
}

function tangent(before: number, after: number): number {
  return before * after > 0 ? (2 * before * after) / (before + after) : 0;
}

export function cubicHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const delta = p2 - p1;
  const startVelocity = tangent(p1 - p0, delta);
  const endVelocity = tangent(delta, p3 - p2);
  if (startVelocity === 0 && endVelocity === 0) {
    const ease = t * t * t * (t * (6 * t - 15) + 10);
    return p1 + delta * ease;
  }
  return p1 + delta * t * t * (3 - 2 * t)
    + startVelocity * t * (1 - t) ** 2
    - endVelocity * (1 - t) * t * t;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function interpolateAngle(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const end = p1 + wrapAngle(p2 - p1);
  return wrapAngle(cubicHermite(p1 + wrapAngle(p0 - p1), p1, end, end + wrapAngle(p3 - p2), t));
}

export class KeyframeEngine {
  private keyframes: Keyframe[] = [];
  public isPlaying: boolean = false;
  public playingTabId: string | null = null;
  public playingFormulaId: string | null = null;

  public segmentDuration: number = 5.0; // seconds per segment
  private elapsed: number = 0;
  private currentSegment: number = 0;

  public onApplyState?: (camera: CameraSnapshot, values: Record<string, number>, tabId: string) => void;
  public onTrackChange?: () => void;

  constructor() {
    this.loadFromStorage();
  }

  public getFramesFor(formulaId: string, tabId: string): Keyframe[] {
    return this.keyframes.filter(k => k.formulaId === formulaId && k.tabId === tabId);
  }

  public addKeyframe(formulaId: string, tabId: string, camera: CameraSnapshot, values: Record<string, number>): Keyframe {
    const frame: Keyframe = {
      id: 'kf_' + Math.random().toString(36).slice(2, 9),
      formulaId,
      tabId,
      camera: {
        pos: [...camera.pos],
        target: [...camera.target],
        up: [...camera.up],
        orbitRadius: camera.orbitRadius
      },
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

  public clearTrack(formulaId: string, tabId: string) {
    this.keyframes = this.keyframes.filter(k => !(k.formulaId === formulaId && k.tabId === tabId));
    this.saveToStorage();
    this.onTrackChange?.();
  }

  public play(formulaId: string, tabId: string): boolean {
    const track = this.getFramesFor(formulaId, tabId);
    if (track.length < 2) return false;

    this.isPlaying = true;
    this.playingFormulaId = formulaId;
    this.playingTabId = tabId;
    this.elapsed = 0;
    this.currentSegment = 0;
    return true;
  }

  public stop() {
    this.isPlaying = false;
    this.playingTabId = null;
    this.playingFormulaId = null;
  }

  public togglePlay(formulaId: string, tabId: string): boolean {
    if (this.isPlaying && this.playingTabId === tabId && this.playingFormulaId === formulaId) {
      this.stop();
      return false;
    }
    return this.play(formulaId, tabId);
  }

  public update(dt: number) {
    if (!this.isPlaying || !this.playingFormulaId || !this.playingTabId) return;
    const track = this.getFramesFor(this.playingFormulaId, this.playingTabId);
    const n = track.length;
    if (n < 2) {
      this.stop();
      return;
    }

    this.elapsed += dt;
    while (this.elapsed >= this.segmentDuration) {
      this.elapsed -= this.segmentDuration;
      this.currentSegment = (this.currentSegment + 1) % n;
    }

    const t = Math.max(0.0, Math.min(1.0, this.elapsed / this.segmentDuration));
    const idx0 = (this.currentSegment - 1 + n) % n;
    const idx1 = this.currentSegment;
    const idx2 = (this.currentSegment + 1) % n;
    const idx3 = (this.currentSegment + 2) % n;

    const kf0 = track[idx0];
    const kf1 = track[idx1];
    const kf2 = track[idx2];
    const kf3 = track[idx3];

    // 1. Interpolate camera position and spherical coordinates around center (0,0,0)
    const rad0 = kf0.camera.orbitRadius;
    const rad1 = kf1.camera.orbitRadius;
    const rad2 = kf2.camera.orbitRadius;
    const rad3 = kf3.camera.orbitRadius;
    const radius = cubicHermite(rad0, rad1, rad2, rad3, t);

    // Spherical yaw and pitch
    const yaw0 = Math.atan2(kf0.camera.pos[0], kf0.camera.pos[2]);
    const yaw1 = Math.atan2(kf1.camera.pos[0], kf1.camera.pos[2]);
    const yaw2 = Math.atan2(kf2.camera.pos[0], kf2.camera.pos[2]);
    const yaw3 = Math.atan2(kf3.camera.pos[0], kf3.camera.pos[2]);
    const yaw = interpolateAngle(yaw0, yaw1, yaw2, yaw3, t);

    const pitch0 = Math.asin(Math.max(-1, Math.min(1, kf0.camera.pos[1] / (rad0 || 1))));
    const pitch1 = Math.asin(Math.max(-1, Math.min(1, kf1.camera.pos[1] / (rad1 || 1))));
    const pitch2 = Math.asin(Math.max(-1, Math.min(1, kf2.camera.pos[1] / (rad2 || 1))));
    const pitch3 = Math.asin(Math.max(-1, Math.min(1, kf3.camera.pos[1] / (rad3 || 1))));
    const pitch = cubicHermite(pitch0, pitch1, pitch2, pitch3, t);

    const cosPitch = Math.cos(pitch);
    const interpolatedCamera: CameraSnapshot = {
      pos: [
        radius * cosPitch * Math.sin(yaw),
        radius * Math.sin(pitch),
        radius * cosPitch * Math.cos(yaw)
      ],
      target: [0, 0, 0],
      up: [
        cubicHermite(kf0.camera.up[0], kf1.camera.up[0], kf2.camera.up[0], kf3.camera.up[0], t),
        cubicHermite(kf0.camera.up[1], kf1.camera.up[1], kf2.camera.up[1], kf3.camera.up[1], t),
        cubicHermite(kf0.camera.up[2], kf1.camera.up[2], kf2.camera.up[2], kf3.camera.up[2], t)
      ],
      orbitRadius: radius
    };

    // 2. Interpolate parameter values
    const interpolatedValues: Record<string, number> = {};
    const allKeys = new Set([
      ...Object.keys(kf1.values),
      ...Object.keys(kf2.values)
    ]);

    for (const key of allKeys) {
      const v0 = kf0.values[key] ?? kf1.values[key] ?? 0;
      const v1 = kf1.values[key] ?? v0;
      const v2 = kf2.values[key] ?? v1;
      const v3 = kf3.values[key] ?? v2;
      interpolatedValues[key] = cubicHermite(v0, v1, v2, v3, t);
    }

    this.onApplyState?.(interpolatedCamera, interpolatedValues, this.playingTabId);
  }

  private saveToStorage() {
    try {
      localStorage.setItem('fractal_v2_keyframes', JSON.stringify(this.keyframes));
    } catch {
      // Ignore quota errors
    }
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem('fractal_v2_keyframes');
      if (data) {
        this.keyframes = JSON.parse(data);
      }
    } catch {
      this.keyframes = [];
    }
  }
}
