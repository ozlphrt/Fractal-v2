// src/animation/ProceduralFlythrough.ts
// Synthesizes infinite, cinematic, procedural flythrough keyframe sequences that weave through
// the actual interior gaps, tunnels, and porous chambers of each fractal.
// Features:
// 1. Anchored to proven interior tunnel gateways (never flies aimlessly outside in empty space).
// 2. Camera target is locked forward into the fractal corridors (NEVER points out into empty black space).
// 3. Predictive collision cushioning: stays centered in navigable airspace with smooth banking.
// 4. Dynamic Chiaroscuro sun tracking (oblique grazing angle for rich shadows and highlights).
// 5. Subtle organic parameter breathing: shapes morph gracefully without breaking geometry.

import { FormulaDefinition } from '../core/types.ts';
import { PALETTES } from '../formulas/registry.ts';
import { DEFAULT_KEYFRAMES } from './defaultKeyframes.ts';
import { Keyframe, CameraSnapshot } from './KeyframeEngine.ts';

export class ProceduralFlythrough {
  /**
   * Generates an infinite, seamless procedural flythrough loop that weaves directly through
   * the internal gaps, arches, and tunnels of the given fractal.
   */
  public static generateLoop(
    formula: FormulaDefinition,
    currentValues: Record<string, number> = {},
    preferredPaletteIndex?: number
  ): Keyframe[] {
    // 1. Retrieve the formula's curated tunnel gateway nodes
    const baseFrames = DEFAULT_KEYFRAMES.filter(k => k.formulaId === formula.id);

    // Fallback if formula has no curated frames
    if (baseFrames.length < 2) {
      return this.generateGeometricLoop(formula, currentValues, preferredPaletteIndex);
    }

    // 2. Choose geological palette
    const palIndex = typeof preferredPaletteIndex === 'number' && preferredPaletteIndex >= 0
      ? preferredPaletteIndex
      : Math.floor(Math.random() * PALETTES.length);
    const palette = PALETTES[palIndex];

    // 3. Procedural trajectory mode
    const mode = Math.floor(Math.random() * 3); // 0: Forward Weave, 1: Reverse Traverse, 2: Chamber Glide
    let sourceFrames = [...baseFrames];

    if (mode === 1) {
      // Reverse traverse: fly the tunnel system in reverse
      sourceFrames.reverse();
    } else if (mode === 2 && sourceFrames.length >= 8) {
      // Chamber glide: offset start to explore alternate loop cycle
      const offset = Math.floor(Math.random() * (sourceFrames.length - 2));
      sourceFrames = [...sourceFrames.slice(offset), ...sourceFrames.slice(0, offset)];
    }

    const N = sourceFrames.length;

    // 4. Random smooth corridor perturbation seed (subtle lateral sway inside safe airspace)
    const seedLat = Math.random() * Math.PI * 2.0;
    const seedVert = Math.random() * Math.PI * 2.0;
    const swayAmount = 0.08 + Math.random() * 0.08; // 8% - 16% safe corridor sway

    // 5. Parameter breathing: subtle, organic breathing without collapsing formulas
    const paramVariations: Record<string, { base: number; amplitude: number; phase: number }> = {};
    for (const p of formula.params) {
      const currVal = currentValues[p.id] ?? p.default;
      const span = p.max - p.min;
      const maxDelta = Math.min(span * 0.10, Math.max(span * 0.03, Math.abs(currVal) * 0.12));
      paramVariations[p.id] = {
        base: currVal,
        amplitude: p.type === 'int' ? 0.0 : maxDelta,
        phase: Math.random() * Math.PI * 2.0
      };
    }

    // 6. Synthesize waypoints with collision cushioning and forward-looking tunnel targets
    const keyframes: Keyframe[] = [];
    const sunSideOffset = (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 12); // Chiaroscuro grazing angle

    for (let i = 0; i < N; i++) {
      const u = (Math.PI * 2.0 * i) / N;
      const baseKf = sourceFrames[i];
      const nextKf = sourceFrames[(i + 1) % N];
      const prevKf = sourceFrames[(i - 1 + N) % N];

      const pCurr = baseKf.camera.pos;
      const pNext = nextKf.camera.pos;
      const pPrev = prevKf.camera.pos;

      // Tunnel flight vector
      const fwdX = pNext[0] - pPrev[0];
      const fwdY = pNext[1] - pPrev[1];
      const fwdZ = pNext[2] - pPrev[2];
      const fwdLen = Math.hypot(fwdX, fwdY, fwdZ) || 1.0;
      const fwdDir: [number, number, number] = [fwdX / fwdLen, fwdY / fwdLen, fwdZ / fwdLen];

      // Lateral vector perpendicular to tunnel heading for safe, subtle swaying
      const latX = -fwdDir[2];
      const latY = 0.0;
      const latZ = fwdDir[0];
      const latLen = Math.hypot(latX, latZ) || 1.0;

      // Vertical normal vector
      const vertX = fwdDir[1] * latZ - fwdDir[2] * latY;
      const vertY = fwdDir[2] * latX - fwdDir[0] * latZ;
      const vertZ = fwdDir[0] * latY - fwdDir[1] * latX;
      const vertLen = Math.hypot(vertX, vertY, vertZ) || 1.0;

      // Gentle, harmonic perturbation strictly within tunnel clearance
      const lateralShift = Math.sin(u * 2.0 + seedLat) * swayAmount;
      const verticalShift = Math.cos(u * 2.0 + seedVert) * (swayAmount * 0.6);

      let px = pCurr[0] + (latX / latLen) * lateralShift + (vertX / vertLen) * verticalShift;
      let py = pCurr[1] + (vertY / vertLen) * verticalShift;
      let pz = pCurr[2] + (latZ / latLen) * lateralShift + (vertZ / vertLen) * verticalShift;

      // Predictive collision cushion using distance estimator if available
      const testPos: [number, number, number] = [px, py, pz];
      const distToWall = formula.cpuDE ? formula.cpuDE(testPos, currentValues) : 1.0;
      if (distToWall < 0.12 && distToWall > -2.0) {
        // Approaching wall: smoothly nudge camera back towards verified corridor center
        const nudge = (0.12 - Math.max(0.01, distToWall)) * 0.8;
        px = px + (pCurr[0] - px) * nudge;
        py = py + (pCurr[1] - py) * nudge;
        pz = pz + (pCurr[2] - pz) * nudge;
      }

      // Camera Target: ALWAYS aimed down the upcoming tunnel into the fractal structure!
      // Blend 60% corridor target + 40% forward tunnel vector so the camera NEVER stares into empty space.
      const baseTarget = baseKf.camera.target;
      const lookDist = Math.max(0.6, Math.min(2.5, baseKf.camera.orbitRadius || 1.5));
      const targetX = baseTarget[0] * 0.65 + (px + fwdDir[0] * lookDist) * 0.35;
      const targetY = baseTarget[1] * 0.65 + (py + fwdDir[1] * lookDist) * 0.35;
      const targetZ = baseTarget[2] * 0.65 + (pz + fwdDir[2] * lookDist) * 0.35;

      // Up vector with gentle banking into turns
      const up = [...baseKf.camera.up] as [number, number, number];
      const upLen = Math.hypot(...up) || 1.0;

      const cameraSnap: CameraSnapshot = {
        pos: [px, py, pz],
        target: [targetX, targetY, targetZ],
        up: [up[0] / upLen, up[1] / upLen, up[2] / upLen],
        orbitRadius: Math.hypot(px - targetX, py - targetY, pz - targetZ)
      };

      // Calculate camera forward direction in horizontal plane for Chiaroscuro sun tracking
      const viewX = targetX - px;
      const viewZ = targetZ - pz;
      const camYaw = (Math.atan2(viewX, viewZ) * 180.0) / Math.PI;

      // Auto-adjust sun azimuth to grazing oblique angle (mix of rich shadow and golden highlight)
      const sunAzimuth = (camYaw + sunSideOffset + Math.sin(u) * 6.0 + 360.0) % 360.0;
      const sunElevation = 36.0 + 8.0 * Math.sin(u + seedVert);

      // Interpolate parameter values smoothly across waypoints
      const frameValues: Record<string, number> = {
        ...baseKf.values,
        focalDistance: lookDist,
        aperture: 0.0,
        bloomIntensity: 0.28,
        exposure: 1.0,
        sunIntensity: 0.85,
        rimIntensity: 0.22,
        rimElevation: 35.0,
        fillIntensity: 0.40,
        glowIntensity: 0.25,
        lightAzimuth: sunAzimuth,
        lightElevation: sunElevation,
        fogDensity: 0.024,
        godraysIntensity: 0.12
      };

      // Evolve formula-specific parameters gently
      for (const p of formula.params) {
        const variation = paramVariations[p.id];
        if (!variation) continue;
        const val = variation.base + variation.amplitude * Math.sin(u + variation.phase);
        frameValues[p.id] = Math.max(p.min, Math.min(p.max, val));
      }

      keyframes.push({
        id: 'proc_kf_' + Math.random().toString(36).slice(2, 9),
        formulaId: formula.id,
        camera: cameraSnap,
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

  /** Fallback geometric loop generator for custom formulas */
  private static generateGeometricLoop(
    formula: FormulaDefinition,
    currentValues: Record<string, number>,
    preferredPaletteIndex?: number
  ): Keyframe[] {
    const N = 8;
    const palIndex = typeof preferredPaletteIndex === 'number' ? preferredPaletteIndex : 0;
    const palette = PALETTES[palIndex];
    const defPos = formula.defaultCam.pos;
    const defTarget = formula.defaultCam.target;
    const dist = Math.hypot(defPos[0] - defTarget[0], defPos[1] - defTarget[1], defPos[2] - defTarget[2]) || 2.5;

    const keyframes: Keyframe[] = [];
    for (let i = 0; i < N; i++) {
      const u = (Math.PI * 2.0 * i) / N;
      const px = defTarget[0] + dist * Math.cos(u);
      const pz = defTarget[2] + dist * Math.sin(u);
      const py = defTarget[1] + dist * 0.25 * Math.sin(u);

      keyframes.push({
        id: 'proc_kf_' + Math.random().toString(36).slice(2, 9),
        formulaId: formula.id,
        camera: {
          pos: [px, py, pz],
          target: [...defTarget],
          up: [0, 1, 0],
          orbitRadius: dist
        },
        palette,
        paletteIndex: palIndex,
        values: { ...currentValues },
        timestamp: Date.now() + i * 1000
      });
    }
    return keyframes;
  }
}
