// src/camera/Camera.ts
// Camera state and transformation matrices

import { Vec3 } from '../core/math.ts';

export class Camera {
  public position: Vec3;
  public target: Vec3;
  public up: Vec3;
  public fov: number = 60.0;

  constructor(
    pos: [number, number, number] = [0, 0, 2.5],
    target: [number, number, number] = [0, 0, 0],
    up: [number, number, number] = [0, 1, 0]
  ) {
    this.position = new Vec3(...pos);
    this.target = new Vec3(...target);
    this.up = new Vec3(...up);
  }

  public setView(pos: [number, number, number], target: [number, number, number]) {
    this.position.set(...pos);
    this.target.set(...target);
    this.up.set(0, 1, 0);
  }

  public getForward(): Vec3 {
    return this.target.clone().sub(this.position).normalize();
  }

  public getRight(): Vec3 {
    return this.getForward().cross(this.up).normalize();
  }
}
