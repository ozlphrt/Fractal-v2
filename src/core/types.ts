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

  // Render State
  progressiveAccumulation: boolean;
}
