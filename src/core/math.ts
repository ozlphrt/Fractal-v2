// src/core/math.ts
// Optimized 3D vector, matrix, and quaternion math for real-time raymarching and 6DOF flight

export class Vec3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  set(x: number, y: number, z: number): this {
    this.x = x; this.y = y; this.z = z;
    return this;
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  copy(v: Vec3): this {
    this.x = v.x; this.y = v.y; this.z = v.z;
    return this;
  }

  add(v: Vec3): this {
    this.x += v.x; this.y += v.y; this.z += v.z;
    return this;
  }

  addScaled(v: Vec3, s: number): this {
    this.x += v.x * s; this.y += v.y * s; this.z += v.z * s;
    return this;
  }

  sub(v: Vec3): this {
    this.x -= v.x; this.y -= v.y; this.z -= v.z;
    return this;
  }

  scale(s: number): this {
    this.x *= s; this.y *= s; this.z *= s;
    return this;
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vec3): this {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x; this.y = y; this.z = z;
    return this;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-6) {
      this.scale(1.0 / len);
    }
    return this;
  }

  lerp(target: Vec3, alpha: number): this {
    this.x += (target.x - this.x) * alpha;
    this.y += (target.y - this.y) * alpha;
    this.z += (target.z - this.z) * alpha;
    return this;
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}

export class Mat4 {
  elements: Float32Array;

  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  identity(): this {
    const e = this.elements;
    e[0] = 1; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = 1; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = 1; e[11] = 0;
    e[12] = 0; e[13] = 0; e[14] = 0; e[15] = 1;
    return this;
  }

  lookAt(eye: Vec3, target: Vec3, up: Vec3): this {
    const z = eye.clone().sub(target).normalize();
    const x = up.clone().cross(z).normalize();
    const y = z.clone().cross(x).normalize();

    const e = this.elements;
    e[0] = x.x; e[1] = y.x; e[2] = z.x; e[3] = 0;
    e[4] = x.y; e[5] = y.y; e[6] = z.y; e[7] = 0;
    e[8] = x.z; e[9] = y.z; e[10] = z.z; e[11] = 0;
    e[12] = -x.dot(eye);
    e[13] = -y.dot(eye);
    e[14] = -z.dot(eye);
    e[15] = 1;

    return this;
  }

  perspective(fovyRad: number, aspect: number, near: number, far: number): this {
    const f = 1.0 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    const e = this.elements;

    e[0] = f / aspect; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = 0; e[5] = f; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = (far + near) * nf; e[11] = -1;
    e[12] = 0; e[13] = 0; e[14] = (2 * far * near) * nf; e[15] = 0;

    return this;
  }

  invert(out: Mat4 = this): Mat4 {
    const m = this.elements;
    const inv = out.elements;

    const b00 = m[0] * m[5] - m[1] * m[4];
    const b01 = m[0] * m[6] - m[2] * m[4];
    const b02 = m[0] * m[7] - m[3] * m[4];
    const b03 = m[1] * m[6] - m[2] * m[5];
    const b04 = m[1] * m[7] - m[3] * m[5];
    const b05 = m[2] * m[7] - m[3] * m[6];
    const b06 = m[8] * m[13] - m[9] * m[12];
    const b07 = m[8] * m[14] - m[10] * m[12];
    const b08 = m[8] * m[15] - m[11] * m[12];
    const b09 = m[9] * m[14] - m[10] * m[13];
    const b10 = m[9] * m[15] - m[11] * m[13];
    const b11 = m[10] * m[15] - m[11] * m[14];

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-8) return out.identity();
    det = 1.0 / det;

    inv[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * det;
    inv[1] = (-m[1] * b11 + m[2] * b10 - m[3] * b09) * det;
    inv[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * det;
    inv[3] = (-m[9] * b05 + m[10] * b04 - m[11] * b03) * det;
    inv[4] = (-m[4] * b11 + m[6] * b08 - m[7] * b07) * det;
    inv[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * det;
    inv[6] = (-m[12] * b05 + m[14] * b02 - m[15] * b01) * det;
    inv[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * det;
    inv[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * det;
    inv[9] = (-m[0] * b10 + m[1] * b08 - m[3] * b06) * det;
    inv[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * det;
    inv[11] = (-m[8] * b04 + m[9] * b02 - m[11] * b00) * det;
    inv[12] = (-m[4] * b09 + m[5] * b07 - m[6] * b06) * det;
    inv[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * det;
    inv[14] = (-m[12] * b03 + m[13] * b01 - m[14] * b00) * det;
    inv[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * det;

    return out;
  }
}

// Low-discrepancy Halton sequence generator for Monte Carlo subpixel jitter & bokeh sampling
export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1.0 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f = f / base;
  }
  return result;
}
