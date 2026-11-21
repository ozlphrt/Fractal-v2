// src/formulas/new-formulas.ts
// Mathematical definitions for 15 new fractal formulas across 5 advanced mathematical families:
// 1. Mandelbox & Tglad Folds (MBOX)
// 2. Triply Periodic Minimal Surfaces (TPMS)
// 3. Hyperbolic Honeycombs & Coxeter Tessellations (COX)
// 4. Clifford Torus & Hopf Fibrations (HOPF)
// 5. Organic Biomorphs & Bicomplex Dendrites (BIO)

export const NEW_FORMULA_IDS = {
  // Group 1: Mandelbox & Tglad Folds
  ROT_MANDELBOX: 'rot_mandelbox',

  // Group 2: Triply Periodic Minimal Surfaces
  SCHOEN_GYROID: 'schoen_gyroid',
  SCHWARZ_P: 'schwarz_p',

  // Group 3: Hyperbolic & Coxeter Honeycombs
  KLEIN_TORUS: 'klein_torus',

  // Group 4: Clifford Torus & Hopf Fibrations
  HOPF_RINGS: 'hopf_rings',

  // Group 5: Biological Shells & Growth
  CORAL_NAUTILUS: 'coral_nautilus'
} as const;

export const NEW_FORMULAS: Record<string, any> = {
  // =========================================================================
  // GROUP 1: MANDELBOX & TGLAD FOLDS (MBOX)
  // =========================================================================

  [NEW_FORMULA_IDS.ROT_MANDELBOX]: {
    id: NEW_FORMULA_IDS.ROT_MANDELBOX,
    name: 'Rotated Mandelbox',
    subtitle: 'Affine Rotated Baroque Spire',
    defaultCam: {
      pos: [0.0, 0.4, 3.0],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 6.0,
    params: [
      { id: 'rm_scale', name: 'Scale Factor', min: -2.3, max: -1.3, step: 0.02, default: -1.78, uniform: 'u_rm_scale', type: 'float' },
      { id: 'rm_rot_angle', name: 'Rotation Angle', min: 0.0, max: 60.0, step: 0.5, default: 22.5, uniform: 'u_rm_rot_angle', type: 'float' },
      { id: 'rm_fold_limit', name: 'Folding Limit', min: 0.6, max: 1.5, step: 0.02, default: 1.0, uniform: 'u_rm_fold_limit', type: 'float' },
      { id: 'rm_min_radius', name: 'Min Radius', min: 0.1, max: 0.7, step: 0.02, default: 0.42, uniform: 'u_rm_min_radius', type: 'float' },
      { id: 'rm_iterations', name: 'Iterations', min: 8, max: 18, step: 1, default: 13, uniform: 'u_rm_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Twisting Gothic Cathedral', values: { rm_scale: -1.78, rm_rot_angle: 22.5, rm_fold_limit: 1.0, rm_min_radius: 0.42, rm_iterations: 13 } },
      { name: 'Spiral Crystal Fortress', values: { rm_scale: -1.95, rm_rot_angle: 34.0, rm_fold_limit: 0.9, rm_min_radius: 0.38, rm_iterations: 14 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 c = pos;
    vec3 p = pos;
    float scale = u_rm_scale;
    float fold = u_rm_fold_limit;
    float minRad2 = u_rm_min_radius * u_rm_min_radius;
    float dr = 1.0;
    vec4 orbit = vec4(100.0);
    float ang = radians(u_rm_rot_angle);
    float ca = cos(ang), sa = sin(ang);
    mat3 rot = mat3(
        ca,  0.0, sa,
        0.0, 1.0, 0.0,
       -sa,  0.0, ca
    );

    for (int i = 0; i < 20; i++) {
        if (i >= u_rm_iterations) break;
        p = clamp(p, -fold, fold) * 2.0 - p;
        p = rot * p;
        float r2 = dot(p, p);
        orbit = min(orbit, vec4(abs(p), sqrt(r2)));
        if (r2 < minRad2) {
            float temp = 1.0 / minRad2;
            p *= temp;
            dr *= temp;
        } else if (r2 < 1.0) {
            float temp = 1.0 / r2;
            p *= temp;
            dr *= temp;
        }
        p = p * scale + c;
        dr = dr * abs(scale) + 1.0;
    }
    trap = orbit;
    return (length(p) - abs(scale - 1.0)) / dr;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const scale = values.rm_scale ?? -1.78;
      const fold = values.rm_fold_limit ?? 1.0;
      const minRad2 = Math.pow(values.rm_min_radius ?? 0.42, 2);
      const iters = Math.round(values.rm_iterations ?? 13);
      const ang = (values.rm_rot_angle ?? 22.5) * Math.PI / 180;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let px = pos[0], py = pos[1], pz = pos[2];
      let dr = 1.0;
      for (let i = 0; i < iters; i++) {
        px = Math.max(-fold, Math.min(fold, px)) * 2 - px;
        py = Math.max(-fold, Math.min(fold, py)) * 2 - py;
        pz = Math.max(-fold, Math.min(fold, pz)) * 2 - pz;
        const rx = ca * px + sa * pz;
        const rz = -sa * px + ca * pz;
        px = rx; pz = rz;
        const r2 = px * px + py * py + pz * pz;
        if (r2 < minRad2) {
          const t = 1.0 / minRad2;
          px *= t; py *= t; pz *= t; dr *= t;
        } else if (r2 < 1.0) {
          const t = 1.0 / r2;
          px *= t; py *= t; pz *= t; dr *= t;
        }
        px = px * scale + pos[0];
        py = py * scale + pos[1];
        pz = pz * scale + pos[2];
        dr = dr * Math.abs(scale) + 1.0;
      }
      return (Math.hypot(px, py, pz) - Math.abs(scale - 1.0)) / Math.max(1e-4, dr);
    }
  },

  // =========================================================================
  // GROUP 2: TRIPLY PERIODIC MINIMAL SURFACES (TPMS)
  // =========================================================================

  [NEW_FORMULA_IDS.SCHOEN_GYROID]: {
    id: NEW_FORMULA_IDS.SCHOEN_GYROID,
    name: 'Schoen Gyroid',
    subtitle: 'Infinite Porous Channel Labyrinth',
    defaultCam: {
      pos: [0.0, 0.0, 2.8],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.5,
    params: [
      { id: 'gy_scale', name: 'Channel Frequency', min: 1.5, max: 4.8, step: 0.05, default: 2.75, uniform: 'u_gy_scale', type: 'float' },
      { id: 'gy_thickness', name: 'Wall Thickness', min: 0.04, max: 0.35, step: 0.01, default: 0.12, uniform: 'u_gy_thickness', type: 'float' },
      { id: 'gy_octaves', name: 'Fractal Octaves', min: 2, max: 6, step: 1, default: 4, uniform: 'u_gy_octaves', type: 'int' },
      { id: 'gy_warp', name: 'Harmonic Twist', min: 0.0, max: 0.5, step: 0.01, default: 0.18, uniform: 'u_gy_warp', type: 'float' }
    ],
    presets: [
      { name: 'Bone Trabecular Porous Sponge', values: { gy_scale: 2.75, gy_thickness: 0.12, gy_octaves: 4, gy_warp: 0.18 } },
      { name: 'Biomorphic Aerogel Membrane', values: { gy_scale: 3.8, gy_thickness: 0.07, gy_octaves: 5, gy_warp: 0.28 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float sc = u_gy_scale;
    float d = 1e5;
    float amp = 1.0;
    vec4 orbit = vec4(100.0);

    for (int i = 0; i < 6; i++) {
        if (i >= u_gy_octaves) break;
        vec3 sp = p * sc;
        // Gyroid function: sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)
        float g = sin(sp.x) * cos(sp.y) + sin(sp.y) * cos(sp.z) + sin(sp.z) * cos(sp.x);
        float grad = 1.8 * sc;
        float layerD = (abs(g) - u_gy_thickness) / grad;
        d = min(d, layerD);
        orbit = min(orbit, vec4(abs(sp) / sc, abs(g)));
        // Harmonic domain rotation & scaling
        p = vec3(p.y - p.z, p.z - p.x, p.x - p.y) * 0.577 + p * 0.2;
        p += u_gy_warp * sin(sp.zxy);
        sc *= 1.85;
        amp *= 0.55;
    }
    // Smooth bounding cylinder to contain in studio airspace
    float bound = length(pos) - 2.8;
    trap = orbit;
    return max(d, bound);
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const sc = values.gy_scale ?? 2.75;
      const th = values.gy_thickness ?? 0.12;
      const g = Math.sin(pos[0] * sc) * Math.cos(pos[1] * sc) + Math.sin(pos[1] * sc) * Math.cos(pos[2] * sc) + Math.sin(pos[2] * sc) * Math.cos(pos[0] * sc);
      return Math.max((Math.abs(g) - th) / (1.8 * sc), Math.hypot(...pos) - 2.8);
    }
  },

  [NEW_FORMULA_IDS.SCHWARZ_P]: {
    id: NEW_FORMULA_IDS.SCHWARZ_P,
    name: 'Schwarz P-Surface',
    subtitle: 'Subterranean Cubic Vault Network',
    defaultCam: {
      pos: [0.0, 0.0, 2.6],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.0,
    params: [
      { id: 'sp_freq', name: 'Cell Frequency', min: 1.0, max: 4.2, step: 0.05, default: 2.15, uniform: 'u_sp_freq', type: 'float' },
      { id: 'sp_isoval', name: 'Isovalue Arch', min: 0.05, max: 0.75, step: 0.02, default: 0.28, uniform: 'u_sp_isoval', type: 'float' },
      { id: 'sp_depth', name: 'Fractal Octaves', min: 2, max: 5, step: 1, default: 3, uniform: 'u_sp_depth', type: 'int' },
      { id: 'sp_round', name: 'Curvature Soften', min: 0.05, max: 0.45, step: 0.01, default: 0.15, uniform: 'u_sp_round', type: 'float' }
    ],
    presets: [
      { name: 'Subterranean Monolithic Archways', values: { sp_freq: 2.15, sp_isoval: 0.28, sp_depth: 3, sp_round: 0.15 } },
      { name: 'Cubic Vault Colosseum', values: { sp_freq: 3.1, sp_isoval: 0.42, sp_depth: 4, sp_round: 0.22 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float sc = u_sp_freq;
    float d = 1e5;
    vec4 orbit = vec4(100.0);

    for (int i = 0; i < 5; i++) {
        if (i >= u_sp_depth) break;
        vec3 sp = p * sc;
        // Schwarz Primitive: cos(x) + cos(y) + cos(z) = isovalue
        float s = cos(sp.x) + cos(sp.y) + cos(sp.z);
        float grad = 1.7 * sc;
        float layerD = (abs(s) - u_sp_isoval) / grad;
        d = min(d, layerD);
        orbit = min(orbit, vec4(abs(sin(sp)), abs(s)));
        // Cubic cell fold
        p = abs(fract(p * 0.5 + 0.5) * 2.0 - 1.0) - u_sp_round;
        sc *= 1.75;
    }
    trap = orbit;
    return max(d, length(pos) - 2.65);
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const sc = values.sp_freq ?? 2.15;
      const s = Math.cos(pos[0] * sc) + Math.cos(pos[1] * sc) + Math.cos(pos[2] * sc);
      return Math.max((Math.abs(s) - (values.sp_isoval ?? 0.28)) / (1.7 * sc), Math.hypot(...pos) - 2.65);
    }
  },

  // =========================================================================
  // GROUP 3: HYPERBOLIC & COXETER HONEYCOMBS (COX)
  // =========================================================================

  [NEW_FORMULA_IDS.KLEIN_TORUS]: {
    id: NEW_FORMULA_IDS.KLEIN_TORUS,
    name: 'Klein Bottle Torus',
    subtitle: 'Non-Orientable 4D Twisted Tube',
    defaultCam: {
      pos: [0.0, 0.2, 2.7],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.0,
    params: [
      { id: 'kt_radius', name: 'Bottle Radius', min: 1.0, max: 2.6, step: 0.02, default: 1.75, uniform: 'u_kt_radius', type: 'float' },
      { id: 'kt_tube', name: 'Tube Thickness', min: 0.15, max: 0.8, step: 0.02, default: 0.42, uniform: 'u_kt_tube', type: 'float' },
      { id: 'kt_twist', name: 'Möbius Twist', min: 1.0, max: 4.0, step: 0.1, default: 2.0, uniform: 'u_kt_twist', type: 'float' },
      { id: 'kt_iterations', name: 'Fractal Folds', min: 4, max: 12, step: 1, default: 8, uniform: 'u_kt_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Self-Intersecting Möbius Manifold', values: { kt_radius: 1.75, kt_tube: 0.42, kt_twist: 2.0, kt_iterations: 8 } },
      { name: 'Intertwined 4D Figure-8 Knot', values: { kt_radius: 2.2, kt_tube: 0.32, kt_twist: 3.0, kt_iterations: 9 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float r = u_kt_radius;
    float tube = u_kt_tube;
    float dr = 1.0;
    vec4 orbit = vec4(100.0);

    for (int i = 0; i < 12; i++) {
        if (i >= u_kt_iterations) break;
        // Non-orientable Möbius tube coordinates
        float u = atan(p.y, p.x);
        float v = p.z;
        float halfU = u * 0.5 * u_kt_twist;
        vec2 q = vec2(length(p.xy) - r, p.z);
        // Rotation by half-angle twist
        vec2 rotatedQ = vec2(q.x * cos(halfU) - q.y * sin(halfU), q.x * sin(halfU) + q.y * cos(halfU));
        p.xy = rotatedQ;
        p.z = sin(u * 2.0) * 0.5;
        // Recursive inversion
        float d2 = dot(p, p);
        orbit = min(orbit, vec4(abs(p), sqrt(d2)));
        p = abs(p) / max(0.2, d2) - vec3(0.35, 0.45, 0.25);
        dr *= 1.45;
    }
    trap = orbit;
    return (length(p.xy) - tube) / dr;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const r = values.kt_radius ?? 1.75;
      const tube = values.kt_tube ?? 0.42;
      const q = Math.hypot(pos[0], pos[1]) - r;
      return Math.hypot(q, pos[2]) - tube;
    }
  },

  // =========================================================================
  // GROUP 4: CLIFFORD TORUS & HOPF FIBRATIONS (HOPF)
  // =========================================================================

  [NEW_FORMULA_IDS.HOPF_RINGS]: {
    id: NEW_FORMULA_IDS.HOPF_RINGS,
    name: 'Hopf Fibration',
    subtitle: 'Interlocking Cosmic Torus Links',
    defaultCam: {
      pos: [0.0, 0.0, 2.6],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 4.8,
    params: [
      { id: 'hf_ring_r', name: 'Major Ring Radius', min: 0.8, max: 2.2, step: 0.02, default: 1.45, uniform: 'u_hf_ring_r', type: 'float' },
      { id: 'hf_tube_r', name: 'Tube Thickness', min: 0.03, max: 0.22, step: 0.01, default: 0.08, uniform: 'u_hf_tube_r', type: 'float' },
      { id: 'hf_num_rings', name: 'Fiber Rings', min: 3, max: 12, step: 1, default: 6, uniform: 'u_hf_num_rings', type: 'int' },
      { id: 'hf_twist', name: 'Fibration Twist', min: 0.2, max: 2.0, step: 0.02, default: 0.85, uniform: 'u_hf_twist', type: 'float' }
    ],
    presets: [
      { name: 'Quantum Knot Flux Bundle', values: { hf_ring_r: 1.45, hf_tube_r: 0.08, hf_num_rings: 6, hf_twist: 0.85 } },
      { name: 'Concentric Magnetic Vortex Links', values: { hf_ring_r: 1.8, hf_tube_r: 0.06, hf_num_rings: 8, hf_twist: 1.25 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float d = 1e5;
    float majorR = u_hf_ring_r;
    float minorR = u_hf_tube_r;
    vec4 orbit = vec4(100.0);
    int nRings = u_hf_num_rings;

    for (int i = 0; i < 12; i++) {
        if (i >= nRings) break;
        float phi = float(i) * 3.14159265 / float(nRings);
        // Hopf fibration rotation axis
        float cp = cos(phi), sp = sin(phi);
        vec3 rotated = vec3(
            p.x * cp - p.z * sp,
            p.y,
            p.x * sp + p.z * cp
        );
        // Villarceau circle tilt
        float tilt = phi * u_hf_twist;
        float ct = cos(tilt), st = sin(tilt);
        vec3 tilted = vec3(rotated.x, rotated.y * ct - rotated.z * st, rotated.y * st + rotated.z * ct);
        // Torus distance estimator: length(vec2(length(p.xy) - R, p.z)) - r
        float qx = length(tilted.xy) - majorR;
        float ringD = length(vec2(qx, tilted.z)) - minorR;
        d = min(d, ringD);
        orbit = min(orbit, vec4(abs(tilted), ringD));
    }
    trap = orbit;
    return d;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const majorR = values.hf_ring_r ?? 1.45;
      const minorR = values.hf_tube_r ?? 0.08;
      const qx = Math.hypot(pos[0], pos[1]) - majorR;
      return Math.hypot(qx, pos[2]) - minorR;
    }
  },

  // =========================================================================
  // GROUP 5: BIOLOGICAL SHELLS & GROWTH (BIO)
  // =========================================================================

  [NEW_FORMULA_IDS.CORAL_NAUTILUS]: {
    id: NEW_FORMULA_IDS.CORAL_NAUTILUS,
    name: 'Coral Nautilus',
    subtitle: 'Logarithmic Spiral Fluted Shell',
    defaultCam: {
      pos: [0.0, 0.4, 2.7],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.0,
    params: [
      { id: 'cn_pitch', name: 'Spiral Pitch', min: 0.1, max: 0.6, step: 0.01, default: 0.28, uniform: 'u_cn_pitch', type: 'float' },
      { id: 'cn_flutes', name: 'Flute Chambers', min: 3, max: 12, step: 1, default: 6, uniform: 'u_cn_flutes', type: 'int' },
      { id: 'cn_curl', name: 'Logarithmic Curl', min: 0.5, max: 2.5, step: 0.05, default: 1.35, uniform: 'u_cn_curl', type: 'float' },
      { id: 'cn_iterations', name: 'Iterations', min: 5, max: 14, step: 1, default: 8, uniform: 'u_cn_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Fluted Ammonite Shell', values: { cn_pitch: 0.28, cn_flutes: 6, cn_curl: 1.35, cn_iterations: 8 } },
      { name: 'Deep Sea Nautilus Spiral', values: { cn_pitch: 0.38, cn_flutes: 8, cn_curl: 1.85, cn_iterations: 10 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float d = 1e5;
    vec4 orbit = vec4(100.0);
    float k = float(u_cn_flutes);

    for (int i = 0; i < 14; i++) {
        if (i >= u_cn_iterations) break;
        float r = length(p.xy);
        float theta = atan(p.y, p.x);
        // Logarithmic spiral fold: angle modulates with log radius
        float spiralAngle = mod(theta + u_cn_curl * log(max(0.01, r)), 6.2831853 / k) - 3.14159265 / k;
        p.xy = vec2(cos(spiralAngle), sin(spiralAngle)) * r;
        p.z -= u_cn_pitch * r;
        // Chamber shell cross section
        float chamberD = length(vec2(r - 0.95, p.z)) - 0.22;
        d = min(d, chamberD);
        orbit = min(orbit, vec4(abs(p), chamberD));
        // Recursive scale
        p = p * 1.55 - vec3(0.35, 0.0, 0.2);
    }
    trap = orbit;
    return d;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const r = Math.hypot(pos[0], pos[1]);
      const pitch = values.cn_pitch ?? 0.28;
      return Math.hypot(r - 0.95, pos[2] + pitch * 0.2) - 0.22;
    }
  }
};
