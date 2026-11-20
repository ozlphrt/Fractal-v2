// src/camera/OrbitController.ts
// Smooth momentum turntable orbit controller

import { Camera } from './Camera.ts';

export class OrbitController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  private radius = 2.5;
  private theta = 0.0;
  private phi = Math.PI * 0.45;

  private targetTheta = 0.0;
  private targetPhi = Math.PI * 0.45;
  private targetRadius = 2.5;

  public onChange?: () => void;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    this.syncFromCamera();
    this.bindEvents();
  }

  public syncFromCamera() {
    const dir = this.camera.position.clone().sub(this.camera.target);
    this.radius = Math.max(0.2, dir.length());
    this.targetRadius = this.radius;
    this.phi = Math.acos(Math.max(-1, Math.min(1, dir.y / (this.radius || 1e-6))));
    this.targetPhi = this.phi;
    this.theta = Math.atan2(dir.x, dir.z);
    this.targetTheta = this.theta;
  }

  private bindEvents() {
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

      this.targetTheta -= dx * 0.006;
      this.targetPhi = Math.max(0.01, Math.min(Math.PI - 0.01, this.targetPhi - dy * 0.006));
      this.onChange?.();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.0015;
      this.targetRadius = Math.max(0.05, Math.min(12.0, this.targetRadius * (1.0 + zoomDelta)));
      this.onChange?.();
    }, { passive: false });
  }

  public update(dt: number) {
    const damping = Math.min(1.0, dt * 14.0);
    this.theta += (this.targetTheta - this.theta) * damping;
    this.phi += (this.targetPhi - this.phi) * damping;
    this.radius += (this.targetRadius - this.radius) * damping;

    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    const oldPos = this.camera.position.clone();
    this.camera.position.set(
      this.camera.target.x + x,
      this.camera.target.y + y,
      this.camera.target.z + z
    );

    if (this.camera.position.distanceToSq(oldPos) > 1e-6) {
      this.onChange?.();
    }
  }
}
