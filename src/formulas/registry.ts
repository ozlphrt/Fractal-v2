// src/formulas/registry.ts
// Catalog of all 20 fractal formulas with GLSL DE snippets and CPU distance mirrors
// 100% natural, geological, mineral, and organic materials (rocks, sands, soils, moss, clays, slates)

import { FormulaDefinition, PalettePreset } from '../core/types.ts';
import { FORMULAS as RAW_FORMULAS, FORMULA_CYCLE_ORDER as RAW_ORDER, FORMULA_IDS } from './formulas-raw.ts';

export { FORMULA_IDS };

export const PALETTES: PalettePreset[] = [
  {
    id: 'desert_sandstone',
    name: 'Desert Sandstone',
    a: [0.45, 0.30, 0.18],
    b: [0.18, 0.12, 0.08],
    c: [1.00, 1.00, 1.00],
    d: [0.00, 0.10, 0.20]
  },
  {
    id: 'forest_moss',
    name: 'Forest Moss & Cedar',
    a: [0.26, 0.32, 0.20],
    b: [0.14, 0.16, 0.10],
    c: [1.00, 1.20, 1.00],
    d: [0.10, 0.25, 0.40]
  },
  {
    id: 'dark_loam',
    name: 'Dark Loam & Soil',
    a: [0.24, 0.18, 0.13],
    b: [0.14, 0.10, 0.07],
    c: [1.00, 1.00, 1.00],
    d: [0.05, 0.10, 0.15]
  },
  {
    id: 'ancient_limestone',
    name: 'Ancient Limestone',
    a: [0.46, 0.44, 0.38],
    b: [0.14, 0.12, 0.10],
    c: [1.00, 1.00, 1.00],
    d: [0.00, 0.08, 0.15]
  },
  {
    id: 'volcanic_basalt',
    name: 'Volcanic Basalt',
    a: [0.18, 0.19, 0.21],
    b: [0.10, 0.10, 0.11],
    c: [1.00, 1.00, 1.00],
    d: [0.00, 0.05, 0.10]
  },
  {
    id: 'terracotta_adobe',
    name: 'Terracotta Clay',
    a: [0.44, 0.24, 0.15],
    b: [0.18, 0.11, 0.07],
    c: [1.00, 1.00, 1.00],
    d: [0.00, 0.08, 0.16]
  },
  {
    id: 'riverbed_granite',
    name: 'Riverbed Granite',
    a: [0.34, 0.34, 0.36],
    b: [0.12, 0.12, 0.14],
    c: [1.20, 1.20, 1.00],
    d: [0.00, 0.05, 0.10]
  },
  {
    id: 'weathered_timber',
    name: 'Weathered Timber',
    a: [0.40, 0.36, 0.32],
    b: [0.12, 0.11, 0.10],
    c: [1.00, 1.00, 1.00],
    d: [0.05, 0.10, 0.15]
  },
  {
    id: 'nordic_slate',
    name: 'Nordic Slate',
    a: [0.22, 0.26, 0.32],
    b: [0.10, 0.12, 0.15],
    c: [1.00, 1.00, 1.20],
    d: [0.20, 0.25, 0.35]
  }
];

export const FORMULA_CYCLE_ORDER: string[] = RAW_ORDER;

// Build typed definitions for all 20 formulas
export const FORMULAS: Record<string, FormulaDefinition> = {};

for (const id of FORMULA_CYCLE_ORDER) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (RAW_FORMULAS as Record<string, any>)[id];
  if (raw) {
    FORMULAS[id] = {
      id: raw.id,
      name: raw.name,
      subtitle: raw.subtitle || '',
      defaultCam: raw.defaultCam || { pos: [0, 0, 2.5], target: [0, 0, 0] },
      params: raw.params || [],
      glslDE: raw.glsl,
      cpuDE: (pos: [number, number, number], params: Record<string, number>) => {
        return raw.cpuEvalDE ? raw.cpuEvalDE(pos, params) : 1.0;
      }
    };
  }
}
