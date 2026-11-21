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

export const CORE_THEMES: Record<string, [number, number, number]> = {
  amber: [1.0, 0.62, 0.18],     // Solar Amber (Incandescent Warmth)
  cyan: [0.18, 0.85, 1.0],      // Electric Cyber Cyan
  magenta: [1.0, 0.22, 0.78],   // Plasma Magenta / Neon Violet
  emerald: [0.20, 1.0, 0.55],   // Bioluminescent Emerald
  gold: [1.0, 0.82, 0.30],      // Molten Imperial Gold
  white: [0.95, 0.98, 1.0]      // Starlight Supernova
};

export interface RenderSettings {
  // Optics & Physics
  focalDistance: number;
  aperture: number;
  ior: number;
  dispersion: number;
  subsurface: number;
  emissiveVeins: number;

  // Multi-Material Core & Self-Lit Glowing Elements
  coreGlow: number;          // Luminescence of micro-cores (0.0 - 4.0, default 1.40)
  coreThreshold: number;     // Size/density threshold (0.05 - 0.50, default 0.22)
  coreTheme: string;         // 'amber' | 'cyan' | 'magenta' | 'emerald' | 'gold' | 'white'
  corePolish: number;        // Core specular polish & sharpness (0.0 - 1.0, default 0.85)

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

  // Audio Reactivity (Lights, Glow & Subtle Breathing)
  audioEnabled: boolean;
  audioSensitivity: number; // Master gain (0.2 - 3.0, default 1.4)
  audioBreathing: number;   // Subtle scale breathing (0.0 - 1.5, default 0.50)
  audioGlow: number;        // Lights, specular & volumetric glow pulse (0.0 - 2.5, default 1.20)
  audioColorShift: number;  // Palette phase flow & mineral flash (0.0 - 2.0, default 0.60)

  // Render State
  progressiveAccumulation: boolean;
}
