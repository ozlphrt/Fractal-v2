// src/core/types.ts

export interface FormulaParam {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  default: number;
  uniform: string;
  type: 'float' | 'int';
}

export interface FormulaDefinition {
  id: string;
  name: string;
  subtitle: string;
  defaultCam: {
    pos: [number, number, number];
    target: [number, number, number];
  };
  boundRadius?: number;
  params: FormulaParam[];
  glslDE: string;
  cpuDE: (pos: [number, number, number], params: Record<string, number>) => number;
}

export interface PalettePreset {
  id: string;
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
}

export interface RenderSettings {
  // Optics & Physics
  focalDistance: number;
  aperture: number;
  ior: number;
  dispersion: number;
  subsurface: number;
  emissiveVeins: number;

  // Post & Bloom
  bloomIntensity: number;
  exposure: number;

  // Volumetrics & Lighting
  sunIntensity: number;
  rimIntensity: number;
  rimElevation: number;
  fillIntensity: number;
  glowIntensity: number;
  headlamp: boolean;
  headlampIntensity: number;
  fogDensity: number;
  godraysIntensity: number;
  lightAzimuth: number;
  lightElevation: number;

  // Flight Sim
  flightSpeed: number;
  adaptiveSpeed: boolean;
  wallCushion: boolean;

  // Audio Reactivity & Structural Mutation Matrix
  audioEnabled: boolean;
  audioSensitivity: number; // Master gain (0.2 - 3.0, default 1.4)
  audioBreathing: number;   // Primary math scale expansion (0.0 - 2.0, default 0.9)
  audioMutation: number;    // Multi-parameter topological morphing (0.0 - 2.5, default 1.2)
  audioWarp: number;        // Acoustic harmonic domain twist & 3D standing waves (0.0 - 2.0, default 0.85)
  audioBeatPunch: number;   // Camera optical zoom recoil (0.0 - 2.0, default 0.70)
  audioGlow: number;        // Volumetric aura & godrays flare (0.0 - 2.0, default 0.80)
  audioColorShift: number;  // Palette phase flow & mineral flash (0.0 - 2.0, default 0.75)

  // Render State
  progressiveAccumulation: boolean;
}
