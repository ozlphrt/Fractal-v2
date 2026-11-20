// src/formulas/registry.ts
// Catalog of fractal formulas with GLSL DE snippets and CPU distance mirrors for proximity flight scaling

import { FormulaDefinition, PalettePreset } from '../core/types.ts';

export const PALETTES: PalettePreset[] = [
  {
    id: 'amethyst_quartz',
    name: 'Amethyst Quartz',
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.5, 0.2, 0.8]
  },
  {
    id: 'obsidian_gold',
    name: 'Obsidian & Gold',
    a: [0.2, 0.15, 0.1],
    b: [0.8, 0.7, 0.4],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.1, 0.2]
  },
  {
    id: 'cyan_bioluminescence',
    name: 'Deep Sea Bioluminescence',
    a: [0.1, 0.3, 0.4],
    b: [0.3, 0.6, 0.8],
    c: [0.8, 1.0, 1.0],
    d: [0.0, 0.33, 0.67]
  },
  {
    id: 'lapis_lazuli',
    name: 'Lapis Lazuli',
    a: [0.1, 0.2, 0.5],
    b: [0.4, 0.5, 0.7],
    c: [1.0, 1.0, 1.0],
    d: [0.1, 0.25, 0.6]
  },
  {
    id: 'solar_flare',
    name: 'Solar Flare Magma',
    a: [0.5, 0.4, 0.3],
    b: [0.6, 0.4, 0.2],
    c: [2.0, 1.0, 0.5],
    d: [0.0, 0.15, 0.3]
  }
];

export const FORMULAS: Record<string, FormulaDefinition> = {
  mandelbulb: {
    id: 'mandelbulb',
    name: 'Mandelbulb',
    subtitle: 'Spherical 3D Power Fold',
    defaultCam: {
      pos: [0.0, 0.0, 2.35],
      target: [0.0, 0.0, 0.0]
    },
    params: [
      { id: 'mb_power', name: 'Power', min: 4.0, max: 12.0, step: 0.05, default: 8.0, uniform: 'u_mb_power', type: 'float' },
      { id: 'mb_iterations', name: 'Iterations', min: 4, max: 24, step: 1, default: 12, uniform: 'u_mb_iterations', type: 'int' }
    ],
    glslDE: /* glsl */ `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 w = pos;
    vec4 orbit = vec4(100.0);
    float dz = 1.0;
    float power = u_mb_power;
    int maxIt = int(u_mb_iterations);
    float m = dot(w, w);
    
    for (int i = 0; i < 24; i++) {
        if (i >= maxIt) break;
        
        float r = sqrt(m);
        dz = power * pow(r, power - 1.0) * dz + 1.0;
        
        float theta = acos(clamp(w.z / max(1e-5, r), -1.0, 1.0));
        float phi = atan(w.y, w.x);
        
        theta *= power;
        phi *= power;
        
        float zr = pow(r, power);
        w = pos + zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
        
        orbit.x = min(orbit.x, r);
        orbit.y = min(orbit.y, abs(sin(theta) * cos(phi)));
        orbit.z = min(orbit.z, abs(dot(w, vec3(0.577))));
        orbit.w = min(orbit.w, m);
        
        m = dot(w, w);
        if (m > 8.0) break;
    }
    
    trap = orbit;
    if (m < 1.0) return 0.0;
    return 0.25 * log(m) * sqrt(m) / max(1e-4, dz);
}
`,
    cpuDE: (pos, params) => {
      const power = params.mb_power ?? 8.0;
      const maxIt = Math.min(16, Math.round(params.mb_iterations ?? 12));
      let x = pos[0], y = pos[1], z = pos[2];
      let dz = 1.0;
      let m = x * x + y * y + z * z;

      for (let i = 0; i < maxIt; i++) {
        const r = Math.sqrt(m);
        dz = power * Math.pow(r, power - 1.0) * dz + 1.0;

        let theta = Math.acos(Math.max(-1.0, Math.min(1.0, z / Math.max(1e-5, r))));
        let phi = Math.atan2(y, x);

        theta *= power;
        phi *= power;

        const zr = Math.pow(r, power);
        x = pos[0] + zr * Math.sin(theta) * Math.cos(phi);
        y = pos[1] + zr * Math.sin(theta) * Math.sin(phi);
        z = pos[2] + zr * Math.cos(theta);

        m = x * x + y * y + z * z;
        if (m > 8.0) break;
      }
      if (m < 1.0) return 0.0;
      return 0.25 * Math.log(m) * Math.sqrt(m) / Math.max(1e-4, dz);
    }
  },

  quat_julia: {
    id: 'quat_julia',
    name: '4D Quaternion Julia',
    subtitle: 'Hypercomplex 4D Slice',
    defaultCam: {
      pos: [0.0, 0.0, 2.1],
      target: [0.0, 0.0, 0.0]
    },
    params: [
      { id: 'qj_cx', name: 'Quaternion C.X', min: -1.0, max: 1.0, step: 0.01, default: -0.2, uniform: 'u_qj_cx', type: 'float' },
      { id: 'qj_cy', name: 'Quaternion C.Y', min: -1.0, max: 1.0, step: 0.01, default: 0.6, uniform: 'u_qj_cy', type: 'float' },
      { id: 'qj_cz', name: 'Quaternion C.Z', min: -1.0, max: 1.0, step: 0.01, default: -0.15, uniform: 'u_qj_cz', type: 'float' },
      { id: 'qj_cw', name: 'Quaternion C.W', min: -1.0, max: 1.0, step: 0.01, default: 0.35, uniform: 'u_qj_cw', type: 'float' }
    ],
    glslDE: /* glsl */ `
vec4 qSquare(vec4 q) {
    return vec4(
        q.x * q.x - dot(q.yzw, q.yzw),
        2.0 * q.x * q.yzw
    );
}

float mapFractal(vec3 pos, out vec4 trap) {
    vec4 z = vec4(pos, 0.0);
    vec4 c = vec4(u_qj_cx, u_qj_cy, u_qj_cz, u_qj_cw);
    vec4 orbit = vec4(100.0);
    float md2 = 1.0;
    float mz2 = dot(z, z);
    
    for (int i = 0; i < 16; i++) {
        md2 *= 4.0 * mz2;
        z = qSquare(z) + c;
        mz2 = dot(z, z);
        orbit = min(orbit, abs(z));
        if (mz2 > 4.0) break;
    }
    trap = orbit;
    return 0.25 * sqrt(mz2 / md2) * log(mz2);
}
`,
    cpuDE: (pos, params) => {
      let x = pos[0], y = pos[1], z = pos[2], w = 0.0;
      const cx = params.qj_cx ?? -0.2;
      const cy = params.qj_cy ?? 0.6;
      const cz = params.qj_cz ?? -0.15;
      const cw = params.qj_cw ?? 0.35;
      let md2 = 1.0;
      let mz2 = x * x + y * y + z * z + w * w;

      for (let i = 0; i < 16; i++) {
        md2 *= 4.0 * mz2;
        const nx = x * x - (y * y + z * z + w * w) + cx;
        const ny = 2.0 * x * y + cy;
        const nz = 2.0 * x * z + cz;
        const nw = 2.0 * x * w + cw;
        x = nx; y = ny; z = nz; w = nw;
        mz2 = x * x + y * y + z * z + w * w;
        if (mz2 > 4.0) break;
      }
      return 0.25 * Math.sqrt(mz2 / md2) * Math.log(mz2 || 1e-6);
    }
  },

  menger: {
    id: 'menger',
    name: 'Menger Sponge',
    subtitle: 'Recursive Cubic Cavities',
    defaultCam: {
      pos: [1.8, 1.4, 2.2],
      target: [0.0, 0.0, 0.0]
    },
    params: [
      { id: 'menger_scale', name: 'Scale', min: 2.0, max: 4.0, step: 0.05, default: 3.0, uniform: 'u_menger_scale', type: 'float' },
      { id: 'menger_offset', name: 'Offset', min: 0.5, max: 2.0, step: 0.05, default: 1.0, uniform: 'u_menger_offset', type: 'float' }
    ],
    glslDE: /* glsl */ `
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float mapFractal(vec3 p, out vec4 trap) {
    float d = sdBox(p, vec3(1.0));
    vec4 orbit = vec4(100.0);
    float s = 1.0;
    
    for (int i = 0; i < 5; i++) {
        vec3 a = mod(p * s, 2.0) - 1.0;
        s *= u_menger_scale;
        vec3 r = abs(1.0 - 3.0 * abs(a));
        float da = max(r.x, r.y);
        float db = max(r.y, r.z);
        float dc = max(r.z, r.x);
        float c = (min(da, min(db, dc)) - 1.0) / s;
        d = max(d, c);
        orbit = min(orbit, vec4(abs(a), d));
    }
    trap = orbit;
    return d;
}
`,
    cpuDE: (pos, params) => {
      const scale = params.menger_scale ?? 3.0;
      let p = [Math.abs(pos[0]), Math.abs(pos[1]), Math.abs(pos[2])];
      let d = Math.max(p[0] - 1.0, Math.max(p[1] - 1.0, p[2] - 1.0));
      let s = 1.0;
      for (let i = 0; i < 4; i++) {
        const a = [
          Math.abs(((pos[0] * s) % 2.0) - 1.0),
          Math.abs(((pos[1] * s) % 2.0) - 1.0),
          Math.abs(((pos[2] * s) % 2.0) - 1.0)
        ];
        s *= scale;
        const r = [
          Math.abs(1.0 - 3.0 * a[0]),
          Math.abs(1.0 - 3.0 * a[1]),
          Math.abs(1.0 - 3.0 * a[2])
        ];
        const da = Math.max(r[0], r[1]);
        const db = Math.max(r[1], r[2]);
        const dc = Math.max(r[2], r[0]);
        const c = (Math.min(da, Math.min(db, dc)) - 1.0) / s;
        d = Math.max(d, c);
      }
      return d;
    }
  },

  kifs: {
    id: 'kifs',
    name: 'Kaleidoscopic IFS',
    subtitle: 'Polyhedral Reflection Origami',
    defaultCam: {
      pos: [2.0, 1.6, 2.2],
      target: [0.0, 0.0, 0.0]
    },
    params: [
      { id: 'kifs_scale', name: 'Scale', min: 1.2, max: 2.5, step: 0.02, default: 1.85, uniform: 'u_kifs_scale', type: 'float' },
      { id: 'kifs_rot', name: 'Fold Angle', min: 0.0, max: 3.14, step: 0.02, default: 0.95, uniform: 'u_kifs_rot', type: 'float' }
    ],
    glslDE: /* glsl */ `
float mapFractal(vec3 p, out vec4 trap) {
    vec4 orbit = vec4(100.0);
    float scale = u_kifs_scale;
    float c = cos(u_kifs_rot);
    float s = sin(u_kifs_rot);
    mat2 rot = mat2(c, -s, s, c);
    
    for (int i = 0; i < 14; i++) {
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        
        p.xy = rot * p.xy;
        p = p * scale - vec3(1.0) * (scale - 1.0);
        orbit = min(orbit, vec4(abs(p), length(p)));
    }
    trap = orbit;
    return (length(p) - 1.2) * pow(scale, -14.0);
}
`,
    cpuDE: (pos, params) => {
      const scale = params.kifs_scale ?? 1.85;
      let p = [...pos];
      for (let i = 0; i < 10; i++) {
        p = [Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])];
        if (p[0] < p[1]) [p[0], p[1]] = [p[1], p[0]];
        if (p[0] < p[2]) [p[0], p[2]] = [p[2], p[0]];
        if (p[1] < p[2]) [p[1], p[2]] = [p[2], p[1]];
        p[0] = p[0] * scale - (scale - 1.0);
        p[1] = p[1] * scale - (scale - 1.0);
        p[2] = p[2] * scale - (scale - 1.0);
      }
      const len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      return (len - 1.2) * Math.pow(scale, -10.0);
    }
  }
};
