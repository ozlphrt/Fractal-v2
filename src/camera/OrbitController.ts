// src/camera/OrbitController.ts
// Heavy physical flywheel orbit controller with continuous 360° unconstrained rotation, viscous drag, and inertial glide

import { Camera } from './Camera.ts';
import { Vec3 } from '../core/math.ts';

export class OrbitController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private dragMode: 'orbit' | 'pan' = 'orbit';
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Heavy moment of inertia: angular velocities and pan velocities
  private velYaw = 0;
  private velPitch = 0;
  private panVelX = 0;
  private panVelY = 0;

  // Heavy inertial zoom glide
  private targetRadius = 2.5;

  public onChange?: () => void;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    this.syncFromCamera();
    this.bindEvents();
  }

  public syncFromCamera() {
    const offset = this.camera.position.clone().sub(this.camera.target);
    this.targetRadius = Math.max(0.04, offset.length());
    this.velYaw = 0;
    this.velPitch = 0;
    this.panVelX = 0;
    this.panVelY = 0;
  }

  /**
   * Continuous 360° unconstrained rotation around camera right and up axes.
   * Completely eliminates 180° pole walls, allowing infinite vertical & horizontal looping.
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

    // 1. Pitch: Vertical 360° rotation around camera right axis (no clamping, loops infinitely)
    if (Math.abs(dPitch) > 1e-7) {
      offset.applyAxisAngle(right, -dPitch);
      this.camera.up.applyAxisAngle(right, -dPitch).normalize();
    }

    // 2. Yaw: Horizontal 360° rotation around camera up axis
    if (Math.abs(dYaw) > 1e-7) {
      offset.applyAxisAngle(this.camera.up, -dYaw);
    }

    // Preserve current zoom distance
    offset.normalize().scale(radius);
    this.camera.position.copy(this.camera.target).add(offset);
    this.onChange?.();
  }

  private applyPan(dx: number, dy: number) {
    const offset = this.camera.position.clone().sub(this.camera.target);
    const forward = offset.clone().normalize().scale(-1.0);
    const right = forward.clone().cross(this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();
    const panFactor = Math.max(0.05, offset.length()) * 0.0012;

    const panOffset = new Vec3()
      .addScaled(right, -dx * panFactor)
      .addScaled(up, dy * panFactor);

    this.camera.target.add(panOffset);
    this.camera.position.add(panOffset);
    this.onChange?.();
  }

  private bindEvents() {
    // Disable default browser context menu on right-click to enable panning
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
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
        // Heavy smooth pan with inertia
        this.applyPan(dx, dy);
        this.panVelX = dx * 0.45;
        this.panVelY = dy * 0.45;
      } else {
        // Physical flywheel drag: smoothly accumulates torque with mass resistance
        const targetVelX = dx * 0.0035;
        const targetVelY = dy * 0.0035;
        
        // Heavy mass resistance: lerp towards target velocity
        this.velYaw += (targetVelX - this.velYaw) * 0.42;
        this.velPitch += (targetVelY - this.velPitch) * 0.42;
        
        this.rotateOrbit(this.velYaw, this.velPitch);
      }
    });

    // Heavy inertial wheel zoom (buttery smooth exponential glide with physical mass feeling)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.0012;
      this.targetRadius = Math.max(0.04, Math.min(30.0, this.targetRadius * (1.0 + zoomDelta)));
      this.onChange?.();
    }, { passive: false });

    // Keyboard support: Q and E to rotate horizontally with inertia
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'q' || e.code === 'KeyQ') {
        this.velYaw -= 0.025;
        this.onChange?.();
      } else if (key === 'e' || e.code === 'KeyE') {
        this.velYaw += 0.025;
        this.onChange?.();
      }
    });
  }

  public update(dt: number) {
    let moved = false;

    // Heavy viscous friction drag (preserves sustained weighty glide)
    if (!this.isDragging && (Math.abs(this.velYaw) > 1e-5 || Math.abs(this.velPitch) > 1e-5)) {
      this.rotateOrbit(this.velYaw, this.velPitch);
      const friction = Math.pow(0.91, Math.min(3.0, dt * 60.0));
      this.velYaw *= friction;
      this.velPitch *= friction;
      moved = true;
    }

    // Heavy pan momentum decay
    if (!this.isDragging && (Math.abs(this.panVelX) > 1e-3 || Math.abs(this.panVelY) > 1e-3)) {
      this.applyPan(this.panVelX, this.panVelY);
      const panFriction = Math.pow(0.88, Math.min(3.0, dt * 60.0));
      this.panVelX *= panFriction;
      this.panVelY *= panFriction;
      moved = true;
    }

    // Heavy inertial exponential zoom glide
    const offset = this.camera.position.clone().sub(this.camera.target);
    const currentRadius = offset.length();
    if (Math.abs(currentRadius - this.targetRadius) > 1e-4) {
      const zoomEase = Math.min(1.0, dt * 7.5);
      const newRadius = currentRadius + (this.targetRadius - currentRadius) * zoomEase;
      offset.normalize().scale(newRadius);
      this.camera.position.copy(this.camera.target).add(offset);
      moved = true;
    }

    if (moved) {
      this.onChange?.();
    }
  }
}
