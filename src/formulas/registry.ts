// src/formulas/registry.ts
// Catalog of all 35 fractal formulas grouped into 12 mathematical families with numbering
// 100% natural, geological, mineral, and organic materials (rocks, sands, soils, moss, clays, slates)

import { FormulaDefinition, PalettePreset } from '../core/types.ts';
import { FORMULAS as RAW_FORMULAS, FORMULA_IDS } from './formulas-raw.ts';
import { NEW_FORMULAS, NEW_FORMULA_IDS } from './new-formulas.ts';

export { FORMULA_IDS, NEW_FORMULA_IDS };

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
  }
];

export interface FormulaGroup {
  name: string;
  badge: string;
  ids: string[];
}

export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    name: 'Spherical & Bulbs',
    badge: 'SPH',
    ids: ['mandelbulb', 'juliabulb']
  },
  {
    name: 'Kleinian & Gothic Architecture',
    badge: 'KLE',
    ids: ['pseudo_kleinian', 'cathedral']
  },
  {
    name: 'Polyhedral Solids & Lattices',
    badge: 'POL',
    ids: ['menger', 'tetra', 'jerusalem', 'twist_cube', 'vault_cube']
  },
  {
    name: 'Hypercomplex 4D Julia',
    badge: '4D',
    ids: ['quat_julia', 'ribbon_julia', 'quartz_julia']
  },
  {
    name: 'Kaleidoscopic & Box Folds',
    badge: 'KIF',
    ids: ['kalibox', 'kifs']
  },
  {
    name: 'Apollonian Sphere Gaskets',
    badge: 'APO',
    ids: ['apollonian', 'pearl_gasket', 'lace_gasket']
  },
  {
    name: 'Non-Analytic & Helical Folds',
    badge: 'ABS',
    ids: ['burning_ship', 'wind_ship', 'helix_bulb']
  },
  {
    name: 'Mandelbox & Tglad Folds',
    badge: 'MBOX',
    ids: ['mandelbox', 'amazing_surf', 'rot_mandelbox']
  },
  {
    name: 'Triply Periodic Minimal Surfaces',
    badge: 'TPMS',
    ids: ['schoen_gyroid', 'schwarz_p', 'neovius']
  },
  {
    name: 'Hyperbolic & Coxeter Honeycombs',
    badge: 'COX',
    ids: ['poincare_dodec', 'coxeter_octa', 'klein_torus']
  },
  {
    name: 'Clifford & Hopf Fibrations',
    badge: 'HOPF',
    ids: ['hopf_rings', 'villarceau_torus', 'clifford_manifold']
  },
  {
    name: 'Biomorphs & Bicomplex Dendrites',
    badge: 'BIO',
    ids: ['pickover_biomorph', 'bicomplex_dendrite', 'coral_nautilus']
  }
];

// Ordered list of formula IDs grouped logically
export const FORMULA_CYCLE_ORDER: string[] = FORMULA_GROUPS.flatMap(g => g.ids);

// Build typed definitions for all 35 formulas
export const FORMULAS: Record<string, FormulaDefinition> = {};

for (const id of FORMULA_CYCLE_ORDER) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (RAW_FORMULAS as Record<string, any>)[id] || (NEW_FORMULAS as Record<string, any>)[id];
  if (raw) {
    FORMULAS[id] = {
      id: raw.id,
      name: raw.name,
      subtitle: raw.subtitle || '',
      defaultCam: raw.defaultCam || { pos: [0, 0, 2.5], target: [0, 0, 0] },
      boundRadius: raw.boundRadius ?? 4.5,
      params: raw.params || [],
      glslDE: raw.glsl,
      cpuDE: (pos: [number, number, number], params: Record<string, number>) => {
        return raw.cpuEvalDE ? raw.cpuEvalDE(pos, params) : 1.0;
      }
    };
  }
}

export function getFormulaGroup(id: string): FormulaGroup | undefined {
  return FORMULA_GROUPS.find(g => g.ids.includes(id));
}

export function getFormulaNumberedTitle(id: string): string {
  const index = FORMULA_CYCLE_ORDER.indexOf(id);
  const f = FORMULAS[id];
  if (!f) return id;
  const num = index >= 0 ? `${index + 1}. ` : '';
  return `${num}${f.name}`;
}
