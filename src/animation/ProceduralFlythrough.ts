// src/animation/ProceduralFlythrough.ts
// Synthesizes infinite, cinematic, procedural flythrough keyframe sequences that weave through
// interior fractal crevices and tunnels with continuous velocity and dynamic chiaroscuro lighting.

import { FormulaDefinition } from '../core/types.ts';
import { PALETTES } from '../formulas/registry.ts';
import { Keyframe, CameraSnapshot } from './KeyframeEngine.ts';

export class ProceduralFlythrough {
  /**
   * Generates a seamless, smooth-flowing procedural flythrough loop for the given formula.
   * Rules:
   * 1. Trajectory weaves through internal gaps and porous hollows (camera looks forward along path).
   * 2. Continuous velocity with Catmull-Rom splines for zero jerk and seamless loop closure.
   * 3. Sun azimuth & elevation dynamically set to optimal grazing angles (75°-95° relative to camera heading)
   *    to guarantee rich chiaroscuro (never completely pitch dark, never flat flashbulb white).
   * 4. Shapes mutate organically but stay structurally recognizable (bounded sinusoidal breathing).
   */
  public static generateLoop(
    formula: FormulaDefinition,
    currentValues: Record<string, number> = {},
    preferredPaletteIndex?: number,
    numWaypoints: number = 8
  ): Keyframe[] {
    const N = Math.max(6, Math.min(12, numWaypoints));

    // 1. Choose geological palette
    const palIndex = typeof preferredPaletteIndex === 'number' && preferredPaletteIndex >= 0
      ? preferredPaletteIndex
      : Math.floor(Math.random() * PALETTES.length);
    const palette = PALETTES[palIndex];

    // 2. Derive scale benchmarks from formula's default camera
    const defPos = formula.defaultCam.pos;
    const defDist = Math.hypot(defPos[0], defPos[1], defPos[2]) || 2.5;
    
    // Gap corridor radius: bringing the camera inside the porous fractal cavities (between 45% and 85% of outer bounds)
    const gapRadius = Math.max(0.5, defDist * (0.48 + Math.random() * 0.15));
    const verticalSpan = gapRadius * (0.35 + Math.random() * 0.25);

    // Random flight harmonic parameters
    const seedAngle = Math.random() * Math.PI * 2.0;
    const seedHeight = Math.random() * Math.PI * 2.0;
    const flightMode = Math.floor(Math.random() * 3); // 0: Lissajous Tunnel, 1: Trefoil Weave, 2: Helical Cavity
    const direction = Math.random() > 0.5 ? 1 : -1;

    // 3. Generate raw 3D position samples along a closed parametric loop
    const rawPositions: [number, number, number][] = [];
    for (let i = 0; i < N; i++) {
      const u = (Math.PI * 2.0 * i) / N;
      let px = 0;
      let py = 0;
      let pz = 0;

      if (flightMode === 0) {
        // Lissajous Cavity Weave: enters tunnels, curves across center, loops out
        const r = gapRadius * (0.75 + 0.3 * Math.sin(2.0 * u * direction + seedAngle));
        px = r * Math.cos(u * direction + seedAngle);
        pz = r * Math.sin(u * direction + seedAngle);
        py = verticalSpan * Math.sin(2.0 * u + seedHeight);
      } else if (flightMode === 1) {
        // Trefoil 3-arch Dive: navigates through 3-fold symmetry portals
        const r = gapRadius * (0.8 + 0.28 * Math.cos(3.0 * u * direction + seedAngle));
        px = r * Math.cos(u * direction + seedAngle);
        pz = r * Math.sin(u * direction + seedAngle);
        py = verticalSpan * Math.sin(3.0 * u + seedHeight) * 0.8;
      } else {
        // Figure-8 Internal Core Traverse: passes through central hollow chamber
        px = gapRadius * Math.sin(u * direction + seedAngle);
        pz = gapRadius * Math.sin(2.0 * u * direction + seedAngle) * 0.65;
        py = verticalSpan * Math.cos(u + seedHeight);
      }

      // Add gentle center bias based on formula default target
      px += formula.defaultCam.target[0] * 0.3;
      py += formula.defaultCam.target[1] * 0.3;
      pz += formula.defaultCam.target[2] * 0.3;

      rawPositions.push([px, py, pz]);
    }

    // 4. Generate forward-looking camera targets and banking up-vectors
    const cameraSnapshots: CameraSnapshot[] = [];
    for (let i = 0; i < N; i++) {
      const curr = rawPositions[i];
      const next = rawPositions[(i + 1) % N];
      const prev = rawPositions[(i - 1 + N) % N];

      // Tangent forward velocity vector along the spline
      const fwdX = next[0] - prev[0];
      const fwdY = next[1] - prev[1];
      const fwdZ = next[2] - prev[2];
      const fwdLen = Math.hypot(fwdX, fwdY, fwdZ) || 1.0;
      const dir: [number, number, number] = [fwdX / fwdLen, fwdY / fwdLen, fwdZ / fwdLen];

      // Look ahead distance along the flight path
      const lookDist = Math.max(0.6, gapRadius * 0.7);
      const target: [number, number, number] = [
        curr[0] + dir[0] * lookDist,
        curr[1] + dir[1] * lookDist,
        curr[2] + dir[2] * lookDist
      ];

      // Smooth stable up vector with subtle banking into curves
      const lateralX = -dir[2];
      const lateralZ = dir[0];
      const latLen = Math.hypot(lateralX, lateralZ) || 1.0;
      const bankFactor = 0.18 * Math.sin((i / N) * Math.PI * 4.0);

      const up: [number, number, number] = [
        (lateralX / latLen) * bankFactor,
        Math.sqrt(Math.max(0.1, 1.0 - bankFactor * bankFactor)),
        (lateralZ / latLen) * bankFactor
      ];
      const upLen = Math.hypot(...up) || 1.0;

      cameraSnapshots.push({
        pos: [...curr],
        target,
        up: [up[0] / upLen, up[1] / upLen, up[2] / upLen],
        orbitRadius: lookDist
      });
    }

    // 5. Parameter evolution: subtle, organic breathing without collapsing formulas
    // Assign each dynamic parameter a coherent, bounded sinusoidal modulation
    const paramVariations: Record<string, { base: number; amplitude: number; phase: number }> = {};
    for (const p of formula.params) {
      const currVal = currentValues[p.id] ?? p.default;
      const span = p.max - p.min;
      // Keep changes subtle (5% to 15% of span, or up to 20% of base)
      const maxDelta = Math.min(span * 0.14, Math.max(span * 0.04, Math.abs(currVal) * 0.18));
      paramVariations[p.id] = {
        base: currVal,
        amplitude: p.type === 'int' ? 0.0 : maxDelta,
        phase: Math.random() * Math.PI * 2.0
      };
    }

    // 6. Build the keyframe list with dynamic Chiaroscuro sun angles
    const keyframes: Keyframe[] = [];
    const sunSideOffset = (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 15); // Grazing side light

    for (let i = 0; i < N; i++) {
      const u = (Math.PI * 2.0 * i) / N;
      const cam = cameraSnapshots[i];

      // Calculate camera forward direction in horizontal plane
      const viewX = cam.target[0] - cam.pos[0];
      const viewZ = cam.target[2] - cam.pos[2];
      const camYaw = (Math.atan2(viewX, viewZ) * 180.0) / Math.PI;

      // Auto-adjust sun azimuth to grazing oblique angle (mix of rich shadow and golden highlight)
      const sunAzimuth = (camYaw + sunSideOffset + Math.sin(u * 2.0) * 10.0 + 360.0) % 360.0;
      // Sun elevation between 28° and 48° for dramatic architectural relief
      const sunElevation = 38.0 + 9.0 * Math.sin(u + seedAngle);

      // Interpolate parameter values smoothly across waypoints
      const frameValues: Record<string, number> = {
        focalDistance: cam.orbitRadius,
        aperture: 0.0,
        bloomIntensity: 0.28,
        exposure: 1.0,
        ior: 1.45,
        dispersion: 0.0,
        subsurface: 0.22,
        emissiveVeins: 0.0,
        sunIntensity: 0.85,
        rimIntensity: 0.22,
        rimElevation: 35.0,
        fillIntensity: 0.38,
        glowIntensity: 0.22,
        lightAzimuth: sunAzimuth,
        lightElevation: sunElevation,
        fogDensity: 0.024,
        godraysIntensity: 0.12
      };

      for (const p of formula.params) {
        const variation = paramVariations[p.id];
        if (!variation) continue;
        const val = variation.base + variation.amplitude * Math.sin(u + variation.phase);
        frameValues[p.id] = Math.max(p.min, Math.min(p.max, val));
      }

      keyframes.push({
        id: 'proc_kf_' + Math.random().toString(36).slice(2, 9),
        formulaId: formula.id,
        camera: cam,
        palette: {
          id: palette.id,
          name: palette.name,
          a: [...palette.a],
          b: [...palette.b],
          c: [...palette.c],
          d: [...palette.d]
        },
        paletteIndex: palIndex,
        values: frameValues,
        timestamp: Date.now() + i * 1000
      });
    }

    return keyframes;
  }
}
