// src/camera/FlightController.ts
// 6DOF Flight Cockpit Simulator with scale-invariant adaptive velocity and proximity wall repulsion

import { Camera } from './Camera.ts';
import { Vec3 } from '../core/math.ts';

export class FlightController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  // Flight vectors
  public velocity: Vec3 = new Vec3();
  public angularVelocity: Vec3 = new Vec3(); // pitch, yaw, roll

  // Key states
  private keys: Record<string, boolean> = {};
  private isPointerDown = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Proximity DE hook
  public deProvider?: (pos: [number, number, number]) => number;

  public baseSpeed: number = 0.6;
  public adaptiveSpeed: boolean = true;
  public wallCushion: boolean = true;

  public onChange?: () => void;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;
    this.bindEvents();
  }

  private bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('pointerup', () => {
      this.isPointerDown = false;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Mouse drag controls Pitch and Yaw
      this.angularVelocity.y -= dx * 0.0025;
      this.angularVelocity.x -= dy * 0.0025;
      this.onChange?.();
    });
  }

  public update(dt: number) {
    const forward = this.camera.getForward();
    const right = this.camera.getRight();
    const up = this.camera.up.clone().normalize();

    // 1. Calculate Local Surface Clearance (DE)
    let localDist = 1.0;
    if (this.deProvider) {
      localDist = Math.max(0.001, this.deProvider(this.camera.position.toArray()));
    }

    // 2. Scale-Invariant Adaptive Velocity
    let currentSpeed = this.baseSpeed;
    if (this.adaptiveSpeed) {
      const speedScale = Math.min(1.0, Math.max(0.02, localDist / 0.8));
      currentSpeed *= speedScale;
    }

    // Boost & Brake
    if (this.keys['Space']) currentSpeed *= 2.5;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) currentSpeed *= 0.35;

    // Movement input acceleration
    const accel = new Vec3();
    if (this.keys['KeyW']) accel.add(forward);
    if (this.keys['KeyS']) accel.sub(forward);
    if (this.keys['KeyD']) accel.add(right);
    if (this.keys['KeyA']) accel.sub(right);
    if (this.keys['KeyR']) accel.add(up);
    if (this.keys['KeyF']) accel.sub(up);

    // Roll input (Q / E)
    if (this.keys['KeyQ']) this.angularVelocity.z += 1.5 * dt;
    if (this.keys['KeyE']) this.angularVelocity.z -= 1.5 * dt;

    if (accel.lengthSq() > 0) {
      accel.normalize().scale(currentSpeed);
      this.velocity.lerp(accel, Math.min(1.0, dt * 8.0));
      this.onChange?.();
    } else {
      this.velocity.scale(Math.max(0, 1.0 - dt * 6.0));
    }

    // 3. Proximity Wall Repulsion Cushion
    if (this.wallCushion && this.deProvider && localDist < 0.12) {
      const p = this.camera.position.toArray();
      const eps = 0.002;
      const dx = this.deProvider([p[0] + eps, p[1], p[2]]) - this.deProvider([p[0] - eps, p[1], p[2]]);
      const dy = this.deProvider([p[0], p[1] + eps, p[2]]) - this.deProvider([p[0], p[1] - eps, p[2]]);
      const dz = this.deProvider([p[0], p[1], p[2] + eps]) - this.deProvider([p[0], p[1], p[2] - eps]);
      const normal = new Vec3(dx, dy, dz).normalize();

      // Push back gently along normal gradient
      const repulsion = Math.max(0, 0.12 - localDist) * 3.0;
      this.camera.position.addScaled(normal, repulsion * dt);
    }

    // Apply movement
    this.camera.position.addScaled(this.velocity, dt);

    // Apply angular rotation
    if (this.angularVelocity.lengthSq() > 1e-6) {
      // Rotate forward around right (pitch)
      const pitch = this.angularVelocity.x;
      const yaw = this.angularVelocity.y;

      // Update target based on forward rotation
      const newForward = forward.clone()
        .addScaled(up, pitch)
        .addScaled(right, yaw)
        .normalize();

      this.camera.target.copy(this.camera.position).add(newForward);
      this.angularVelocity.scale(Math.max(0, 1.0 - dt * 10.0));
      this.onChange?.();
    } else {
      this.camera.target.copy(this.camera.position).add(forward);
    }
  }
}
