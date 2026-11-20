// src/formulas/new-formulas.ts
// Mathematical definitions for 15 new fractal formulas across 5 advanced mathematical families:
// 1. Mandelbox & Tglad Folds (MBOX)
// 2. Triply Periodic Minimal Surfaces (TPMS)
// 3. Hyperbolic Honeycombs & Coxeter Tessellations (COX)
// 4. Clifford Torus & Hopf Fibrations (HOPF)
// 5. Organic Biomorphs & Bicomplex Dendrites (BIO)

export const NEW_FORMULA_IDS = {
  // Group 1: Mandelbox & Tglad Folds
  MANDELBOX: 'mandelbox',
  AMAZING_SURF: 'amazing_surf',
  ROT_MANDELBOX: 'rot_mandelbox',

  // Group 2: Triply Periodic Minimal Surfaces
  SCHOEN_GYROID: 'schoen_gyroid',
  SCHWARZ_P: 'schwarz_p',

  // Group 3: Hyperbolic & Coxeter Honeycombs
  POINCARE_DODEC: 'poincare_dodec',
  KLEIN_TORUS: 'klein_torus',

  // Group 4: Clifford Torus & Hopf Fibrations
  HOPF_RINGS: 'hopf_rings',
  VILLARCEAU_TORUS: 'villarceau_torus',
  CLIFFORD_MANIFOLD: 'clifford_manifold',

  // Group 5: Biological Shells & Growth
  CORAL_NAUTILUS: 'coral_nautilus'
} as const;

export const NEW_FORMULAS: Record<string, any> = {
  // =========================================================================
  // GROUP 1: MANDELBOX & TGLAD FOLDS (MBOX)
  // =========================================================================

  [NEW_FORMULA_IDS.MANDELBOX]: {
    id: NEW_FORMULA_IDS.MANDELBOX,
    name: 'Mandelbox Classic',
    subtitle: 'Tglad Cubic & Spherical Fold',
    defaultCam: {
      pos: [0.0, 0.0, 3.2],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 6.0,
    params: [
      { id: 'mb_scale', name: 'Scale Factor', min: -2.5, max: -1.2, step: 0.02, default: -1.85, uniform: 'u_mb_scale', type: 'float' },
      { id: 'mb_fold_limit', name: 'Folding Limit', min: 0.5, max: 1.8, step: 0.02, default: 1.0, uniform: 'u_mb_fold_limit', type: 'float' },
      { id: 'mb_min_radius', name: 'Min Radius', min: 0.1, max: 0.8, step: 0.02, default: 0.45, uniform: 'u_mb_min_radius', type: 'float' },
      { id: 'mb_fixed_radius', name: 'Fixed Radius', min: 0.6, max: 1.6, step: 0.02, default: 1.0, uniform: 'u_mb_fixed_radius', type: 'float' },
      { id: 'mb_iterations', name: 'Iterations', min: 8, max: 20, step: 1, default: 13, uniform: 'u_mb_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Brutalist Monolith Citadel', values: { mb_scale: -1.85, mb_fold_limit: 1.0, mb_min_radius: 0.45, mb_fixed_radius: 1.0, mb_iterations: 13 } },
      { name: 'Cubic Circuit Matrix', values: { mb_scale: -2.05, mb_fold_limit: 0.85, mb_min_radius: 0.35, mb_fixed_radius: 0.9, mb_iterations: 15 } },
      { name: 'Dense Colonnade Core', values: { mb_scale: -1.65, mb_fold_limit: 1.15, mb_min_radius: 0.55, mb_fixed_radius: 1.1, mb_iterations: 12 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 c = pos;
    vec3 p = pos;
    float scale = u_mb_scale;
    float foldLimit = u_mb_fold_limit;
    float minRad2 = u_mb_min_radius * u_mb_min_radius;
    float fixRad2 = u_mb_fixed_radius * u_mb_fixed_radius;
    float dr = 1.0;
    vec4 orbit = vec4(100.0);

    for (int i = 0; i < 20; i++) {
        if (i >= u_mb_iterations) break;
        // 1. Box Fold
        p = clamp(p, -foldLimit, foldLimit) * 2.0 - p;
        // 2. Sphere Fold
        float r2 = dot(p, p);
        orbit = min(orbit, vec4(abs(p), sqrt(r2)));
        if (r2 < minRad2) {
            float temp = fixRad2 / minRad2;
            p *= temp;
            dr *= temp;
        } else if (r2 < fixRad2) {
            float temp = fixRad2 / r2;
            p *= temp;
            dr *= temp;
        }
        // 3. Scale and Translate
        p = p * scale + c;
        dr = dr * abs(scale) + 1.0;
    }
    trap = orbit;
    float r = length(p);
    return (r - abs(scale - 1.0)) / dr;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const scale = values.mb_scale ?? -1.85;
      const foldLimit = values.mb_fold_limit ?? 1.0;
      const minRad2 = Math.pow(values.mb_min_radius ?? 0.45, 2);
      const fixRad2 = Math.pow(values.mb_fixed_radius ?? 1.0, 2);
      const iters = Math.round(values.mb_iterations ?? 13);

      let px = pos[0], py = pos[1], pz = pos[2];
      const cx = px, cy = py, cz = pz;
      let dr = 1.0;

      for (let i = 0; i < iters; i++) {
        px = Math.max(-foldLimit, Math.min(foldLimit, px)) * 2.0 - px;
        py = Math.max(-foldLimit, Math.min(foldLimit, py)) * 2.0 - py;
        pz = Math.max(-foldLimit, Math.min(foldLimit, pz)) * 2.0 - pz;

        const r2 = px * px + py * py + pz * pz;
        if (r2 < minRad2) {
          const temp = fixRad2 / minRad2;
          px *= temp; py *= temp; pz *= temp; dr *= temp;
        } else if (r2 < fixRad2) {
          const temp = fixRad2 / r2;
          px *= temp; py *= temp; pz *= temp; dr *= temp;
        }
        px = px * scale + cx;
        py = py * scale + cy;
        pz = pz * scale + cz;
        dr = dr * Math.abs(scale) + 1.0;
      }
      return (Math.hypot(px, py, pz) - Math.abs(scale - 1.0)) / Math.max(1e-4, dr);
    }
  },

  [NEW_FORMULA_IDS.AMAZING_SURF]: {
    id: NEW_FORMULA_IDS.AMAZING_SURF,
    name: 'Amazing Surf',
    subtitle: 'Asymmetric Folding Plateaus',
    defaultCam: {
      pos: [0.0, 1.2, 2.8],
      target: [0.0, 0.2, 0.0]
    },
    boundRadius: 6.5,
    params: [
      { id: 'as_scale', name: 'Scale Factor', min: 1.2, max: 2.2, step: 0.02, default: 1.55, uniform: 'u_as_scale', type: 'float' },
      { id: 'as_fold_limit', name: 'Fold Limit', min: 0.6, max: 1.6, step: 0.02, default: 1.05, uniform: 'u_as_fold_limit', type: 'float' },
      { id: 'as_min_radius', name: 'Min Radius', min: 0.15, max: 0.7, step: 0.02, default: 0.4, uniform: 'u_as_min_radius', type: 'float' },
      { id: 'as_offset_z', name: 'Z Plateau Offset', min: -0.6, max: 0.8, step: 0.02, default: 0.25, uniform: 'u_as_offset_z', type: 'float' },
      { id: 'as_iterations', name: 'Iterations', min: 8, max: 18, step: 1, default: 12, uniform: 'u_as_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Stratified Terraced Cliffs', values: { as_scale: 1.55, as_fold_limit: 1.05, as_min_radius: 0.4, as_offset_z: 0.25, as_iterations: 12 } },
      { name: 'Floating Geometric Plateau', values: { as_scale: 1.72, as_fold_limit: 1.2, as_min_radius: 0.35, as_offset_z: 0.45, as_iterations: 14 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float scale = u_as_scale;
    float fold = u_as_fold_limit;
    float minRad2 = u_as_min_radius * u_as_min_radius;
    float dr = 1.0;
    vec4 orbit = vec4(100.0);

    for (int i = 0; i < 20; i++) {
        if (i >= u_as_iterations) break;
        // Asymmetric fold
        p.xy = abs(p.xy + fold) - abs(p.xy - fold) - p.xy;
        p.z = abs(p.z) - u_as_offset_z;
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
        p = p * scale + pos;
        dr = dr * scale + 1.0;
    }
    trap = orbit;
    return (length(p) - 1.2) / dr;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const scale = values.as_scale ?? 1.55;
      const fold = values.as_fold_limit ?? 1.05;
      const minRad2 = Math.pow(values.as_min_radius ?? 0.4, 2);
      const iters = Math.round(values.as_iterations ?? 12);
      let px = pos[0], py = pos[1], pz = pos[2];
      let dr = 1.0;
      for (let i = 0; i < iters; i++) {
        px = Math.abs(px + fold) - Math.abs(px - fold) - px;
        py = Math.abs(py + fold) - Math.abs(py - fold) - py;
        pz = Math.abs(pz) - (values.as_offset_z ?? 0.25);
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
        dr = dr * scale + 1.0;
      }
      return (Math.hypot(px, py, pz) - 1.2) / Math.max(1e-4, dr);
    }
  },

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

  [NEW_FORMULA_IDS.POINCARE_DODEC]: {
    id: NEW_FORMULA_IDS.POINCARE_DODEC,
    name: 'Poincaré Dodecahedron',
    subtitle: 'Hyperbolic Repeating Sphere Honeycomb',
    defaultCam: {
      pos: [0.0, 0.0, 2.45],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 4.8,
    params: [
      { id: 'pd_radius', name: 'Sphere Radius', min: 0.8, max: 1.6, step: 0.02, default: 1.15, uniform: 'u_pd_radius', type: 'float' },
      { id: 'pd_scale', name: 'Hyperbolic Scale', min: 1.2, max: 2.2, step: 0.02, default: 1.58, uniform: 'u_pd_scale', type: 'float' },
      { id: 'pd_offset', name: 'Mirror Spacing', min: 0.5, max: 1.5, step: 0.02, default: 0.95, uniform: 'u_pd_offset', type: 'float' },
      { id: 'pd_iterations', name: 'Iterations', min: 6, max: 16, step: 1, default: 10, uniform: 'u_pd_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Escher Infinite Dodecahedral Vault', values: { pd_radius: 1.15, pd_scale: 1.58, pd_offset: 0.95, pd_iterations: 10 } },
      { name: 'Conformal Horizon Labyrinth', values: { pd_radius: 1.35, pd_scale: 1.82, pd_offset: 1.15, pd_iterations: 12 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float sc = u_pd_scale;
    float r = u_pd_radius;
    float r2 = r * r;
    float dr = 1.0;
    vec4 orbit = vec4(100.0);
    // Golden ratio for dodecahedron icosahedral symmetry
    const float phi = 1.6180339887;
    vec3 n1 = normalize(vec3(phi, 1.0, 0.0));
    vec3 n2 = normalize(vec3(0.0, phi, 1.0));
    vec3 n3 = normalize(vec3(1.0, 0.0, phi));

    for (int i = 0; i < 16; i++) {
        if (i >= u_pd_iterations) break;
        p = abs(p);
        // Reflection in icosahedral/dodecahedral planes
        float d1 = dot(p, n1) - u_pd_offset;
        if (d1 < 0.0) p -= 2.0 * d1 * n1;
        float d2 = dot(p, n2) - u_pd_offset;
        if (d2 < 0.0) p -= 2.0 * d2 * n2;
        float d3 = dot(p, n3) - u_pd_offset;
        if (d3 < 0.0) p -= 2.0 * d3 * n3;

        // Hyperbolic inversion across sphere
        float d2p = dot(p, p);
        orbit = min(orbit, vec4(p, sqrt(d2p)));
        if (d2p < r2) {
            float k = r2 / d2p;
            p *= k;
            dr *= k;
        }
        p = p * sc - vec3(u_pd_offset);
        dr = dr * sc;
    }
    trap = orbit;
    return (length(p) - 0.75) / dr;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const sc = values.pd_scale ?? 1.58;
      const r2 = Math.pow(values.pd_radius ?? 1.15, 2);
      const off = values.pd_offset ?? 0.95;
      const iters = Math.round(values.pd_iterations ?? 10);
      let px = pos[0], py = pos[1], pz = pos[2];
      let dr = 1.0;
      for (let i = 0; i < iters; i++) {
        px = Math.abs(px); py = Math.abs(py); pz = Math.abs(pz);
        const d2 = px * px + py * py + pz * pz;
        if (d2 < r2) {
          const k = r2 / Math.max(1e-4, d2);
          px *= k; py *= k; pz *= k; dr *= k;
        }
        px = px * sc - off; py = py * sc - off; pz = pz * sc - off;
        dr *= sc;
      }
      return (Math.hypot(px, py, pz) - 0.75) / Math.max(1e-4, dr);
    }
  },

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

  [NEW_FORMULA_IDS.VILLARCEAU_TORUS]: {
    id: NEW_FORMULA_IDS.VILLARCEAU_TORUS,
    name: 'Villarceau Torus',
    subtitle: 'Helical Braided Ribbon Knots',
    defaultCam: {
      pos: [0.0, 0.4, 2.8],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.0,
    params: [
      { id: 'vt_major', name: 'Major Radius', min: 1.2, max: 2.8, step: 0.02, default: 1.95, uniform: 'u_vt_major', type: 'float' },
      { id: 'vt_minor', name: 'Minor Radius', min: 0.3, max: 1.2, step: 0.02, default: 0.75, uniform: 'u_vt_minor', type: 'float' },
      { id: 'vt_twist', name: 'Braided Pitch', min: 0.5, max: 3.5, step: 0.05, default: 1.7, uniform: 'u_vt_twist', type: 'float' },
      { id: 'vt_iterations', name: 'Ribbon Strands', min: 4, max: 12, step: 1, default: 7, uniform: 'u_vt_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Braided Vortex Ribbons', values: { vt_major: 1.95, vt_minor: 0.75, vt_twist: 1.7, vt_iterations: 7 } },
      { name: 'Tight Helical Plasma Tube', values: { vt_major: 2.3, vt_minor: 0.55, vt_twist: 2.4, vt_iterations: 9 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float R = u_vt_major;
    float r = u_vt_minor;
    float d = 1e5;
    vec4 orbit = vec4(100.0);
    int strands = u_vt_iterations;

    // Toroidal angle coordinates
    float theta = atan(p.y, p.x);
    float qx = length(p.xy) - R;
    vec2 torusCross = vec2(qx, p.z);

    for (int i = 0; i < 12; i++) {
        if (i >= strands) break;
        float phase = float(i) * 6.2831853 / float(strands);
        float strandAngle = theta * u_vt_twist + phase;
        vec2 strandCenter = vec2(cos(strandAngle), sin(strandAngle)) * r;
        float strandD = length(torusCross - strandCenter) - 0.065;
        d = min(d, strandD);
        orbit = min(orbit, vec4(torusCross - strandCenter, strandD, float(i) / float(strands)));
    }
    trap = orbit;
    return d;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const R = values.vt_major ?? 1.95;
      const r = values.vt_minor ?? 0.75;
      const qx = Math.hypot(pos[0], pos[1]) - R;
      return Math.abs(Math.hypot(qx, pos[2]) - r) - 0.065;
    }
  },

  [NEW_FORMULA_IDS.CLIFFORD_MANIFOLD]: {
    id: NEW_FORMULA_IDS.CLIFFORD_MANIFOLD,
    name: 'Clifford Manifold',
    subtitle: 'Continuous 4D Stereographic Torus Shell',
    defaultCam: {
      pos: [0.0, 0.0, 2.7],
      target: [0.0, 0.0, 0.0]
    },
    boundRadius: 5.0,
    params: [
      { id: 'cl_param_a', name: '4D Pitch Angle', min: -3.14, max: 3.14, step: 0.02, default: 0.65, uniform: 'u_cl_param_a', type: 'float' },
      { id: 'cl_param_b', name: '4D Yaw Angle', min: -3.14, max: 3.14, step: 0.02, default: 1.15, uniform: 'u_cl_param_b', type: 'float' },
      { id: 'cl_thickness', name: 'Shell Thickness', min: 0.04, max: 0.28, step: 0.01, default: 0.11, uniform: 'u_cl_thickness', type: 'float' },
      { id: 'cl_iterations', name: 'Manifold Layers', min: 1, max: 6, step: 1, default: 3, uniform: 'u_cl_iterations', type: 'int' }
    ],
    presets: [
      { name: 'Interlocking Clifford Cyclides', values: { cl_param_a: 0.65, cl_param_b: 1.15, cl_thickness: 0.11, cl_iterations: 3 } },
      { name: 'Continuous Monolithic 4D Torus', values: { cl_param_a: 0.0, cl_param_b: 0.0, cl_thickness: 0.14, cl_iterations: 1 } },
      { name: 'Braided Conformal Shells', values: { cl_param_a: 1.2, cl_param_b: -0.8, cl_thickness: 0.08, cl_iterations: 4 } }
    ],
    glsl: `
float mapFractal(vec3 pos, out vec4 trap) {
    vec3 p = pos;
    float r2 = dot(p, p);
    // Conformal stereographic inverse projection to 4D hypersphere S^3
    float denom = r2 + 1.0;
    vec4 p4 = vec4(2.0 * p, r2 - 1.0) / denom;

    // 4D hyper-rotations (SO(4) Clifford action)
    float a = u_cl_param_a;
    float b = u_cl_param_b;
    
    // Rotate in XW and YZ planes
    float cosA = cos(a), sinA = sin(a);
    float cosB = cos(b), sinB = sin(b);
    
    vec4 q4;
    q4.x = p4.x * cosA - p4.w * sinA;
    q4.w = p4.x * sinA + p4.w * cosA;
    q4.y = p4.y * cosB - p4.z * sinB;
    q4.z = p4.y * sinB + p4.z * cosB;

    float d = 1e5;
    vec4 orbit = vec4(100.0);
    int iters = u_cl_iterations;
    
    // Continuous connected nested Clifford cyclide sheets
    for (int i = 0; i < 6; i++) {
        if (i >= iters) break;
        float shift = float(i) * 0.785398;
        vec2 rotC = vec2(q4.x * cos(shift) - q4.y * sin(shift), q4.z);
        float rCross = length(rotC);
        float d4 = abs(rCross - 0.7071) - u_cl_thickness;
        // Conformal scale factor back to R^3: denom * 0.5
        float d3 = d4 * (denom * 0.5);
        d = min(d, d3);
        orbit = min(orbit, vec4(abs(p4.xyz), d3));
        
        // Gentle fold for structural richness without disconnecting geometry
        q4.xyz = abs(q4.xyz) - vec3(0.18, 0.18, 0.18);
    }

    trap = orbit;
    return d;
}
`,
    cpuEvalDE(pos: [number, number, number], values: Record<string, number>) {
      const r2 = pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2];
      const denom = r2 + 1.0;
      const p4w = (r2 - 1.0) / denom;
      const p4x = (2.0 * pos[0]) / denom;
      const th = values.cl_thickness ?? 0.11;
      const d4 = Math.abs(Math.hypot(p4x, p4w) - 0.7071) - th;
      return d4 * (denom * 0.5);
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
