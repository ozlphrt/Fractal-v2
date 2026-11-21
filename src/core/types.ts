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

export interface OrbColorPreset {
  name: string;
  colors: [[number, number, number], [number, number, number], [number, number, number]];
}

export const ORB_COLOR_PRESETS: Record<string, OrbColorPreset> = {
  trichrome: {
    name: 'Tri-Chromatic (Amber / Cyan / Magenta)',
    colors: [
      [1.0, 0.75, 0.28],   // Solar Amber
      [0.18, 0.85, 1.0],   // Electric Cyan
      [0.95, 0.25, 1.0]    // Plasma Magenta
    ]
  },
  monochrome_gold: {
    name: 'All Same: Incandescent Gold',
    colors: [
      [1.0, 0.72, 0.22],
      [1.0, 0.72, 0.22],
      [1.0, 0.72, 0.22]
    ]
  },
  monochrome_cyan: {
    name: 'All Same: Electric Cyan',
    colors: [
      [0.20, 0.88, 1.0],
      [0.20, 0.88, 1.0],
      [0.20, 0.88, 1.0]
    ]
  },
  monochrome_white: {
    name: 'All Same: Pure Starlight Supernova',
    colors: [
      [0.96, 0.98, 1.0],
      [0.96, 0.98, 1.0],
      [0.96, 0.98, 1.0]
    ]
  },
  ultraviolet: {
    name: 'Ultraviolet & Deep Violet Glow',
    colors: [
      [0.55, 0.15, 1.0],   // Deep Ultraviolet
      [0.72, 0.22, 1.0],   // Electric Violet
      [0.88, 0.35, 1.0]    // Fluorescent Orchid
    ]
  },
  blacklight: {
    name: 'Blacklight Neon (UV / Acid Green / Pink)',
    colors: [
      [0.40, 0.10, 0.98],  // Deep UV Blue
      [0.25, 1.0, 0.35],   // Fluorescent Acid Green
      [1.0, 0.15, 0.75]    // Hot Neon Pink
    ]
  },
  emerald_bio: {
    name: 'Bioluminescent Emerald Spores',
    colors: [
      [0.15, 1.0, 0.65],   // Mint Emerald
      [0.10, 0.92, 0.40],  // Bio Jade
      [0.20, 0.85, 0.95]   // Phosphor Aqua
    ]
  },
  inferno: {
    name: 'Inferno & Molten Magma',
    colors: [
      [1.0, 0.55, 0.12],   // Blazing Orange
      [1.0, 0.15, 0.10],   // Crimson Heat
      [1.0, 0.88, 0.20]    // Molten Yellow
    ]
  }
};

export interface RenderSettings {
  // Optics & Physics
  focalDistance: number;
  aperture: number;
  ior: number;
  dispersion: number;
  subsurface: number;
  emissiveVeins: number;

  // Flying Cavity Lights (Photon Orbs)
  orbEnabled: boolean;       // Master on/off toggle for flying cavity lights
  orbIntensity: number;      // Intensity of flying cavity light sources (0.0 - 3.0, default 1.20)
  orbSpeed: number;          // Speed of cavity light orbs (0.1 - 3.0, default 1.00)
  orbRadius: number;         // Physical size of the light balls (0.006 - 0.040, default 0.016)
  orbTail: number;           // Length of fading comet tail (0.0 - 2.5, default 1.00)
  orbPreset: string;         // 'trichrome' | 'monochrome_gold' | 'monochrome_cyan' | 'monochrome_white' | 'ultraviolet' | 'blacklight' | 'emerald_bio' | 'inferno'

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
