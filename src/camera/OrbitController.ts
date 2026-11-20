// src/camera/OrbitController.ts
// Precision Heavy Flywheel Orbit Controller with liquid-smooth exponential damping, 360° unconstrained rotation, and optical-grade zoom

import { Camera } from './Camera.ts';

export class OrbitController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Continuous smoothed angular momentum accumulators (Three.js OrbitControls style damping)
  private accumYaw = 0;
  private accumPitch = 0;

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

  /**
   * Firmly anchors the target to the object center (0, 0, 0) and computes initial radial distance.
   */
  public syncFromCamera() {
    this.camera.target.set(0, 0, 0);
    const offset = this.camera.position.clone();
    this.orbitRadius = Math.max(0.04, offset.length());
    this.targetOrbitRadius = this.orbitRadius;
    this.accumYaw = 0;
    this.accumPitch = 0;
  }

  /**
   * Continuous 360° unconstrained rotation around camera right and up axes.
   * Rotation is ALWAYS strictly anchored around the center of the object (0, 0, 0).
   */
  public rotateOrbit(dYaw: number, dPitch: number) {
    // Ensure target is strictly locked to object center
    this.camera.target.set(0, 0, 0);

    // Vector from object center (0,0,0) to camera position
    const offset = this.camera.position.clone();
    const radius = Math.max(0.02, offset.length());
    const forward = offset.clone().normalize().scale(-1.0); // pointing towards center
    
    // Right vector is perpendicular to forward and camera up
    const right = forward.clone().cross(this.camera.up).normalize();
    if (right.lengthSq() < 1e-4) {
      right.set(1, 0, 0);
    }

    // 1. Pitch: Vertical 360° rotation around camera right axis (no clamping, loops infinitely over poles)
    if (Math.abs(dPitch) > 1e-7) {
      offset.applyAxisAngle(right, -dPitch);
      this.camera.up.applyAxisAngle(right, -dPitch).normalize();
    }

    // 2. Yaw: Horizontal 360° rotation around camera up axis
    if (Math.abs(dYaw) > 1e-7) {
      offset.applyAxisAngle(this.camera.up, -dYaw);
    }

    // Preserve exact radial distance from object center
    offset.normalize().scale(radius);
    this.camera.position.copy(offset);
  }

  private bindEvents() {
    // Disable default browser context menu to allow drag with any button
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
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

      // Accumulate angular deltas with heavy mass resistance
      this.accumYaw += dx * 0.0032;
      this.accumPitch += dy * 0.0032;
    });

    // Weighted optical-grade wheel zoom with smooth exponential glide
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.canvas.clientHeight : 1);
      const clampedDelta = Math.max(-120, Math.min(120, pixels));
      // Logarithmic zoom scaling: proportional step regardless of scale
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
  }

  public update(dt: number) {
    let moved = false;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // 1. Damped Flywheel Orbit Rotation
    // Critically damped exponential ease-in & ease-out
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

    // 2. Heavy Optical Zoom Glide (exponential critically damped)
    const diffRadius = this.targetOrbitRadius - this.orbitRadius;
    if (Math.abs(diffRadius) > 0.0001) {
      const zoomEase = 1.0 - Math.exp(-7.5 * clampedDt);
      this.orbitRadius += diffRadius * zoomEase;

      // Lock position strictly along radial vector from object center (0, 0, 0)
      this.camera.target.set(0, 0, 0);
      const offset = this.camera.position.clone();
      const curDist = offset.length() || 1.0;
      offset.scale(this.orbitRadius / curDist);
      this.camera.position.copy(offset);
      moved = true;
    }

    if (moved) {
      this.onChange?.();
    }
  }
}
