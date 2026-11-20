// src/camera/OrbitController.ts
// Precision Heavy Flywheel Orbit Controller with liquid-smooth exponential damping, 360° unconstrained rotation, right-click pan, and optical zoom

import { Camera } from './Camera.ts';
import { Vec3 } from '../core/math.ts';

export class OrbitController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private dragMode: 'orbit' | 'pan' = 'orbit';
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Continuous smoothed angular and pan momentum accumulators
  private accumYaw = 0;
  private accumPitch = 0;
  private accumPanX = 0;
  private accumPanY = 0;

  // Zoom state
  private orbitRadius = 2.5;
  private targetOrbitRadius = 2.5;

  public onChange?: () => void;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    this.syncFromCamera();
    this.bindEvents();
  }

  public syncFromCamera() {
    const offset = this.camera.position.clone().sub(this.camera.target);
    this.orbitRadius = Math.max(0.04, offset.length());
    this.targetOrbitRadius = this.orbitRadius;
    this.accumYaw = 0;
    this.accumPitch = 0;
    this.accumPanX = 0;
    this.accumPanY = 0;
  }

  /**
   * Continuous 360° unconstrained rotation around camera right and up axes.
   * Rotates around camera.target (which defaults to 0,0,0 object center).
   */
  public rotateOrbit(dYaw: number, dPitch: number) {
    const offset = this.camera.position.clone().sub(this.camera.target);
    const radius = Math.max(0.02, offset.length());
    const forward = offset.clone().normalize().scale(-1.0); // pointing towards target
    
    // Right vector is perpendicular to forward and camera up
    const right = forward.clone().cross(this.camera.up).normalize();
    if (right.lengthSq() < 1e-4) {
      right.set(1, 0, 0);
    }

    // 1. Pitch: Vertical 360° rotation around camera right axis (loops infinitely)
    if (Math.abs(dPitch) > 1e-7) {
      offset.applyAxisAngle(right, -dPitch);
      this.camera.up.applyAxisAngle(right, -dPitch).normalize();
    }

    // 2. Yaw: Horizontal 360° rotation around camera up axis
    if (Math.abs(dYaw) > 1e-7) {
      offset.applyAxisAngle(this.camera.up, -dYaw);
    }

    // Preserve exact radial distance
    offset.normalize().scale(radius);
    this.camera.position.copy(this.camera.target).add(offset);
  }

  /**
   * Translate camera and target along the viewport plane.
   */
  public applyPan(px: number, py: number) {
    const offset = this.camera.position.clone().sub(this.camera.target);
    const forward = offset.clone().normalize().scale(-1.0);
    const right = forward.clone().cross(this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();

    const panVector = new Vec3()
      .addScaled(right, -px)
      .addScaled(up, py);

    this.camera.target.add(panVector);
    this.camera.position.add(panVector);
  }

  private bindEvents() {
    // Disable default browser context menu to allow smooth right-click panning
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('pointerdown', (e) => {
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

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.dragMode === 'pan') {
        // Right click + drag -> Pan along viewport plane
        const panFactor = Math.max(0.1, this.orbitRadius) * 0.0016;
        this.accumPanX += dx * panFactor;
        this.accumPanY += dy * panFactor;
      } else {
        // Left click + drag -> Smooth orbit rotation around center
        this.accumYaw += dx * 0.0032;
        this.accumPitch += dy * 0.0032;
      }
    });

    // Weighted optical-grade wheel zoom with smooth exponential glide
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1);
      const clampedDelta = Math.max(-120, Math.min(120, pixels));
      const zoomFactor = Math.exp(clampedDelta * 0.00065);
      this.targetOrbitRadius = Math.max(0.04, Math.min(45.0, this.targetOrbitRadius * zoomFactor));
    }, { passive: false });

    // Keyboard support: Q and E to rotate horizontally with smooth momentum
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (key === 'q' || e.code === 'KeyQ') {
        this.accumYaw -= 0.08;
      } else if (key === 'e' || e.code === 'KeyE') {
        this.accumYaw += 0.08;
      }
    });

    // Double-click resets pan back to object center (0, 0, 0)
    this.canvas.addEventListener('dblclick', () => {
      const offset = this.camera.position.clone().sub(this.camera.target);
      this.camera.target.set(0, 0, 0);
      this.camera.position.copy(offset);
      this.onChange?.();
    });
  }

  public update(dt: number) {
    let moved = false;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // 1. Damped Flywheel Orbit Rotation
    const damping = 1.0 - Math.exp(-12.0 * clampedDt);
    const stepYaw = this.accumYaw * damping;
    const stepPitch = this.accumPitch * damping;

    this.accumYaw -= stepYaw;
    this.accumPitch -= stepPitch;

    if (Math.abs(stepYaw) > 1e-7 || Math.abs(stepPitch) > 1e-7) {
      this.rotateOrbit(stepYaw, stepPitch);
      moved = true;
    }

    // Heavy viscous friction drag when released to sustain flywheel glide
    if (!this.isDragging) {
      const friction = Math.pow(0.95, clampedDt * 60.0);
      this.accumYaw *= friction;
      this.accumPitch *= friction;
    }

    // 2. Damped Pan Processing
    const panDamp = 1.0 - Math.exp(-14.0 * clampedDt);
    const stepPanX = this.accumPanX * panDamp;
    const stepPanY = this.accumPanY * panDamp;

    this.accumPanX -= stepPanX;
    this.accumPanY -= stepPanY;

    if (Math.abs(stepPanX) > 1e-6 || Math.abs(stepPanY) > 1e-6) {
      this.applyPan(stepPanX, stepPanY);
      moved = true;
    }

    if (!this.isDragging) {
      const panFriction = Math.pow(0.90, clampedDt * 60.0);
      this.accumPanX *= panFriction;
      this.accumPanY *= panFriction;
    }

    // 3. Heavy Optical Zoom Glide
    const diffRadius = this.targetOrbitRadius - this.orbitRadius;
    if (Math.abs(diffRadius) > 0.0001) {
      const zoomEase = 1.0 - Math.exp(-7.5 * clampedDt);
      this.orbitRadius += diffRadius * zoomEase;

      const offset = this.camera.position.clone().sub(this.camera.target);
      const curDist = offset.length() || 1.0;
      offset.scale(this.orbitRadius / curDist);
      this.camera.position.copy(this.camera.target).add(offset);
      moved = true;
    }

    if (moved) {
      this.onChange?.();
    }
  }
}
