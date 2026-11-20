// src/camera/OrbitController.ts
// Heavy Flywheel Orbit & Pan Controller with liquid-smooth exponential damping, 360° unconstrained rotation around object center (0,0,0), right-click pan, and optical zoom

import { Camera } from './Camera.ts';
import { Vec3 } from '../core/math.ts';
import { slerpVec3 } from '../animation/KeyframeEngine.ts';

function rotateVecAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = axis.dot(v);
  const cross = axis.clone().cross(v);
  return new Vec3(
    v.x * c + cross.x * s + axis.x * dot * (1.0 - c),
    v.y * c + cross.y * s + axis.y * dot * (1.0 - c),
    v.z * c + cross.z * s + axis.z * dot * (1.0 - c)
  );
}

export class OrbitController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private dragMode: 'orbit' | 'pan' = 'orbit';
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Flywheel momentum velocities
  private angularVelYaw = 0;
  private angularVelPitch = 0;
  private panVelX = 0;
  private panVelY = 0;

  // Zoom state
  private orbitRadius = 2.5;
  private targetOrbitRadius = 2.5;

  // Multi-touch (pinch zoom / two-finger pan) state
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchMidX = 0;
  private pinchMidY = 0;

  // Cinematic smooth camera transition tween
  private activeCamTween: {
    startPos: Vec3;
    targetPos: Vec3;
    startTarget: Vec3;
    targetCenter: Vec3;
    startUp: Vec3;
    targetUp: Vec3;
    startRadius: number;
    targetRadius: number;
    startTime: number;
    durationSec: number;
  } | null = null;

  public onChange?: () => void;
  /** Fired when the user actively drags / pinches / scrolls to move the camera */
  public onUserInteract?: () => void;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    this.syncFromCamera();
    this.bindEvents();
  }

  public syncFromCamera() {
    this.activeCamTween = null;
    this.orbitRadius = Math.max(0.04, this.camera.position.length());
    this.targetOrbitRadius = this.orbitRadius;
    this.angularVelYaw = 0;
    this.angularVelPitch = 0;
    this.panVelX = 0;
    this.panVelY = 0;
  }

  /**
   * Continuous 360° unconstrained rotation around camera right and up axes.
   * Rotation is ALWAYS anchored around the center of the object (0, 0, 0).
   * Both position and target pivot around (0, 0, 0), preserving any user pan offset without drifting.
   */
  public rotateOrbit(dYaw: number, dPitch: number) {
    let pos = this.camera.position.clone();
    let tgt = this.camera.target.clone();

    const forward = tgt.clone().sub(pos).normalize();
    let right = forward.clone().cross(this.camera.up).normalize();
    if (right.lengthSq() < 1e-4) {
      right.set(1, 0, 0);
    }
    const up = right.clone().cross(forward).normalize();
    this.camera.up.copy(up);

    // 1. Pitch: 360° rotation around right vector
    if (Math.abs(dPitch) > 1e-7) {
      pos = rotateVecAroundAxis(pos, right, -dPitch);
      tgt = rotateVecAroundAxis(tgt, right, -dPitch);
      this.camera.up = rotateVecAroundAxis(this.camera.up, right, -dPitch).normalize();
    }

    // 2. Yaw: 360° rotation around up vector
    if (Math.abs(dYaw) > 1e-7) {
      pos = rotateVecAroundAxis(pos, this.camera.up, -dYaw);
      tgt = rotateVecAroundAxis(tgt, this.camera.up, -dYaw);
    }

    this.camera.position.copy(pos);
    this.camera.target.copy(tgt);
    this.orbitRadius = Math.max(0.04, this.camera.position.length());
  }

  /**
   * Translate camera and target along the viewport plane.
   */
  public applyPan(px: number, py: number) {
    const forward = this.camera.target.clone().sub(this.camera.position).normalize();
    const right = forward.clone().cross(this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();

    const panVector = new Vec3()
      .addScaled(right, -px)
      .addScaled(up, py);

    this.camera.target.add(panVector);
    this.camera.position.add(panVector);
  }

  public transitionTo(
    targetPos: [number, number, number] | Vec3,
    targetCenter: [number, number, number] | Vec3,
    targetUp: [number, number, number] | Vec3 = [0, 1, 0],
    durationSec: number = 0.85
  ) {
    const tPos = targetPos instanceof Vec3 ? targetPos : new Vec3(...targetPos);
    const tCenter = targetCenter instanceof Vec3 ? targetCenter : new Vec3(...targetCenter);
    const tUp = targetUp instanceof Vec3 ? targetUp : new Vec3(...targetUp);

    this.angularVelYaw = 0;
    this.angularVelPitch = 0;
    this.panVelX = 0;
    this.panVelY = 0;

    const startOffset = this.camera.position.clone().sub(this.camera.target);
    const targetOffset = tPos.clone().sub(tCenter);

    this.activeCamTween = {
      startPos: this.camera.position.clone(),
      targetPos: tPos,
      startTarget: this.camera.target.clone(),
      targetCenter: tCenter,
      startUp: this.camera.up.clone(),
      targetUp: tUp,
      startRadius: Math.max(0.04, startOffset.length()),
      targetRadius: Math.max(0.04, targetOffset.length()),
      startTime: performance.now(),
      durationSec
    };
  }

  public recenter() {
    const curDist = Math.max(0.04, this.camera.position.length());
    const forward = this.camera.position.clone().normalize();
    const targetPos = forward.scale(curDist);
    this.transitionTo(targetPos, new Vec3(0, 0, 0), this.camera.up, 0.6);
  }

  private bindEvents() {
    // Disable default browser context menu to allow smooth right-click panning
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.activeCamTween = null; // Instantly yield control to user mouse interaction
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        // Second finger down: switch from orbit to pinch-zoom / two-finger pan
        this.isDragging = false;
        const [a, b] = Array.from(this.pointers.values());
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchMidX = (a.x + b.x) / 2;
        this.pinchMidY = (a.y + b.y) / 2;
        return;
      }
      this.isDragging = true;
      // Right-click (button 2), middle click (button 1), or Shift+left click -> PAN
      if (e.button === 2 || e.button === 1 || e.shiftKey) {
        this.dragMode = 'pan';
      } else {
        this.dragMode = 'orbit';
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    const endPointer = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.isDragging = false;
      this.pinchDist = 0;
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pointers.size >= 2 && this.pinchDist > 0) {
        const [a, b] = Array.from(this.pointers.values());
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        // Pinch -> zoom
        this.targetOrbitRadius = Math.max(0.04, Math.min(45.0, this.targetOrbitRadius * (this.pinchDist / dist)));
        // Two-finger drag -> pan
        const panFactor = Math.max(0.1, this.orbitRadius) * 0.0016;
        this.applyPan((midX - this.pinchMidX) * panFactor, (midY - this.pinchMidY) * panFactor);
        this.pinchDist = dist;
        this.pinchMidX = midX;
        this.pinchMidY = midY;
        this.onUserInteract?.();
        this.onChange?.();
        return;
      }
      if (!this.isDragging) return;
      this.onUserInteract?.();
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.dragMode === 'pan') {
        // Right click + drag -> Liquid responsive Pan along viewport plane
        const panFactor = Math.max(0.1, this.orbitRadius) * 0.0016;
        const targetPanX = dx * panFactor;
        const targetPanY = dy * panFactor;
        this.panVelX += (targetPanX - this.panVelX) * 0.35;
        this.panVelY += (targetPanY - this.panVelY) * 0.35;
        this.applyPan(this.panVelX, this.panVelY);
        this.onChange?.();
      } else {
        // Left click + drag -> Instant responsive 360° orbit rotation around center
        const targetVelX = dx * 0.0028;
        const targetVelY = dy * 0.0028;
        this.angularVelYaw += (targetVelX - this.angularVelYaw) * 0.32;
        this.angularVelPitch += (targetVelY - this.angularVelPitch) * 0.32;
        this.rotateOrbit(this.angularVelYaw, this.angularVelPitch);
        this.onChange?.();
      }
    });

    // Weighted optical-grade wheel zoom with smooth exponential glide
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.onUserInteract?.();
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1);
      const clampedDelta = Math.max(-100, Math.min(100, pixels));
      const zoomFactor = Math.exp(clampedDelta * 0.00065);
      this.targetOrbitRadius = Math.max(0.04, Math.min(45.0, this.targetOrbitRadius * zoomFactor));
    }, { passive: false });

    // Keyboard support: Q and E to rotate horizontally with smooth momentum
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (key === 'q' || e.code === 'KeyQ') {
        this.angularVelYaw -= 0.04;
      } else if (key === 'e' || e.code === 'KeyE') {
        this.angularVelYaw += 0.04;
      }
    });

    // Double-click resets pan back to object center (0, 0, 0)
    this.canvas.addEventListener('dblclick', () => {
      this.recenter();
    });
  }

  public update(dt: number) {
    let moved = false;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // Active cinematic camera transition tween (seamless, no abrupt cuts)
    if (this.activeCamTween) {
      const now = performance.now();
      const elapsed = (now - this.activeCamTween.startTime) / 1000.0;
      const rawT = Math.min(1.0, elapsed / this.activeCamTween.durationSec);
      // Silky cosine ease for zero initial and final velocity without sluggishness
      const t = 0.5 * (1.0 - Math.cos(Math.PI * rawT));
      const tw = this.activeCamTween;

      const curTarget = new Vec3(
        tw.startTarget.x + (tw.targetCenter.x - tw.startTarget.x) * t,
        tw.startTarget.y + (tw.targetCenter.y - tw.startTarget.y) * t,
        tw.startTarget.z + (tw.targetCenter.z - tw.startTarget.z) * t
      );

      const startDir = tw.startPos.clone().sub(tw.startTarget);
      const targetDir = tw.targetPos.clone().sub(tw.targetCenter);
      const sLen = startDir.length() || 1.0;
      const tLen = targetDir.length() || 1.0;
      const u1: [number, number, number] = [startDir.x / sLen, startDir.y / sLen, startDir.z / sLen];
      const u2: [number, number, number] = [targetDir.x / tLen, targetDir.y / tLen, targetDir.z / tLen];

      const sDir = slerpVec3(u1, u2, t);
      const curRadius = tw.startRadius + (tw.targetRadius - tw.startRadius) * t;

      this.camera.target.copy(curTarget);
      this.camera.position.set(
        curTarget.x + sDir[0] * curRadius,
        curTarget.y + sDir[1] * curRadius,
        curTarget.z + sDir[2] * curRadius
      );

      const up1: [number, number, number] = [tw.startUp.x, tw.startUp.y, tw.startUp.z];
      const up2: [number, number, number] = [tw.targetUp.x, tw.targetUp.y, tw.targetUp.z];
      const sUp = slerpVec3(up1, up2, t);
      this.camera.up.set(sUp[0], sUp[1], sUp[2]);

      this.orbitRadius = curRadius;
      this.targetOrbitRadius = curRadius;
      this.onChange?.();

      if (rawT >= 1.0) {
        this.activeCamTween = null;
        this.syncFromCamera();
      }
      return;
    }

    // 1. Heavy physical flywheel inertia when mouse is released
    if (!this.isDragging) {
      const friction = Math.pow(0.965, clampedDt * 60.0);
      this.angularVelYaw *= friction;
      this.angularVelPitch *= friction;

      if (Math.abs(this.angularVelYaw) > 1e-6 || Math.abs(this.angularVelPitch) > 1e-6) {
        this.rotateOrbit(this.angularVelYaw, this.angularVelPitch);
        moved = true;
      }

      const panFriction = Math.pow(0.92, clampedDt * 60.0);
      this.panVelX *= panFriction;
      this.panVelY *= panFriction;

      if (Math.abs(this.panVelX) > 1e-6 || Math.abs(this.panVelY) > 1e-6) {
        this.applyPan(this.panVelX, this.panVelY);
        moved = true;
      }
    }

    // 2. Heavy Optical Zoom Glide towards target radius
    const diffRadius = this.targetOrbitRadius - this.orbitRadius;
    if (Math.abs(diffRadius) > 0.0001) {
      const zoomEase = 1.0 - Math.exp(-9.0 * clampedDt);
      this.orbitRadius += diffRadius * zoomEase;

      const curDist = Math.max(0.001, this.camera.position.length());
      this.camera.position.scale(this.orbitRadius / curDist);
      moved = true;
    }

    if (moved) {
      this.onChange?.();
    }
  }
}
