// src/ui/HUD.ts
// Glassmorphism HUD coordinator: tabs, parameter inputs, formula groups, and mode switching

import { FormulaDefinition, PalettePreset, RenderSettings } from '../core/types.ts';
import { FORMULAS, FORMULA_CYCLE_ORDER, FORMULA_GROUPS, PALETTES, getFormulaGroup } from '../formulas/registry.ts';

export class HUD {
  public settings: RenderSettings;
  public activeFormulaIndex: number = 0;
  public activePaletteIndex: number = 0;
  public currentMode: 'orbit' | 'flight' = 'orbit';

  public onSettingChange?: () => void;
  public onFormulaChange?: (formula: FormulaDefinition) => void;
  public onPaletteChange?: (palette: PalettePreset) => void;
  public onModeChange?: (mode: 'orbit' | 'flight') => void;
  public onResetView?: () => void;
  public onToggleAccumulation?: (enabled: boolean) => void;

  private formulaList: FormulaDefinition[] = FORMULA_CYCLE_ORDER.map(id => FORMULAS[id]).filter(Boolean);

  constructor() {
    this.settings = {
      focalDistance: 2.35,
      aperture: 0.0,
      ior: 1.45,
      dispersion: 0.0,
      subsurface: 0.2,
      emissiveVeins: 0.0,
      bloomIntensity: 0.25,
      exposure: 1.0,

      // 3-Point Studio Lighting & Atmosphere
      sunIntensity: 1.0,
      rimIntensity: 0.45,
      rimElevation: 30,
      fillIntensity: 0.35,
      headlamp: true,
      headlampIntensity: 1.5,
      fogDensity: 0.03,
      godraysIntensity: 0.0,
      lightAzimuth: 45,
      lightElevation: 48,

      // Flight Sim
      flightSpeed: 0.6,
      adaptiveSpeed: true,
      wallCushion: true,
      progressiveAccumulation: false
    };

    this.initDOM();
  }

  public getActiveFormula(): FormulaDefinition {
    return this.formulaList[this.activeFormulaIndex];
  }

  public getActivePalette(): PalettePreset {
    return PALETTES[this.activePaletteIndex];
  }

  private initDOM() {
    // Mode toggles
    const btnOrbit = document.getElementById('btn-mode-orbit')!;
    const btnFlight = document.getElementById('btn-mode-flight')!;
    const crosshair = document.getElementById('view-crosshair')!;

    btnOrbit.addEventListener('click', () => {
      this.currentMode = 'orbit';
      btnOrbit.classList.add('active');
      btnFlight.classList.remove('active');
      crosshair.classList.add('hidden');
      this.onModeChange?.('orbit');
    });

    btnFlight.addEventListener('click', () => {
      this.currentMode = 'flight';
      btnFlight.classList.add('active');
      btnOrbit.classList.remove('active');
      crosshair.classList.remove('hidden');
      this.onModeChange?.('flight');
    });

    // Formula label update helper
    const labelFormula = document.getElementById('current-formula-label')!;
    const updateFormulaDisplay = () => {
      const f = this.getActiveFormula();
      const group = getFormulaGroup(f.id);
      const title = `${this.activeFormulaIndex + 1}. ${f.name}`;
      labelFormula.textContent = title;
      labelFormula.title = group ? `${group.badge} — ${f.subtitle}` : f.subtitle;

      const dropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement;
      if (dropdown && dropdown.value !== f.id) {
        dropdown.value = f.id;
      }
    };

    updateFormulaDisplay();

    // Populate Grouped Formula Dropdown
    const dropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement;
    if (dropdown) {
      dropdown.innerHTML = '';
      for (const group of FORMULA_GROUPS) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `${group.badge} (${group.name})`;
        for (const id of group.ids) {
          const f = FORMULAS[id];
          if (!f) continue;
          const idx = this.formulaList.findIndex(item => item.id === id);
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = `${idx + 1}. ${f.name}`;
          optgroup.appendChild(opt);
        }
        dropdown.appendChild(optgroup);
      }

      dropdown.addEventListener('change', () => {
        const targetId = dropdown.value;
        const targetIdx = this.formulaList.findIndex(f => f.id === targetId);
        if (targetIdx >= 0) {
          this.activeFormulaIndex = targetIdx;
          updateFormulaDisplay();
          this.populateFormulaParams();
          this.onFormulaChange?.(this.getActiveFormula());
        }
      });
    }

    // Formula prev/next arrows
    document.getElementById('btn-prev-formula')!.addEventListener('click', () => {
      this.activeFormulaIndex = (this.activeFormulaIndex - 1 + this.formulaList.length) % this.formulaList.length;
      updateFormulaDisplay();
      this.populateFormulaParams();
      this.onFormulaChange?.(this.getActiveFormula());
    });

    document.getElementById('btn-next-formula')!.addEventListener('click', () => {
      this.activeFormulaIndex = (this.activeFormulaIndex + 1) % this.formulaList.length;
      updateFormulaDisplay();
      this.populateFormulaParams();
      this.onFormulaChange?.(this.getActiveFormula());
    });

    // Palette cycle
    const labelPalette = document.getElementById('current-palette-label')!;
    labelPalette.textContent = this.getActivePalette().name;

    document.getElementById('btn-prev-palette')!.addEventListener('click', () => {
      this.activePaletteIndex = (this.activePaletteIndex - 1 + PALETTES.length) % PALETTES.length;
      labelPalette.textContent = this.getActivePalette().name;
      this.onPaletteChange?.(this.getActivePalette());
    });

    document.getElementById('btn-next-palette')!.addEventListener('click', () => {
      this.activePaletteIndex = (this.activePaletteIndex + 1) % PALETTES.length;
      labelPalette.textContent = this.getActivePalette().name;
      this.onPaletteChange?.(this.getActivePalette());
    });

    // Accumulation button
    const btnAccum = document.getElementById('btn-toggle-pathtrace')!;
    btnAccum.addEventListener('click', () => {
      this.settings.progressiveAccumulation = !this.settings.progressiveAccumulation;
      btnAccum.classList.toggle('active', this.settings.progressiveAccumulation);
      btnAccum.setAttribute('aria-pressed', String(this.settings.progressiveAccumulation));
      this.onToggleAccumulation?.(this.settings.progressiveAccumulation);
    });

    // Reset view
    document.getElementById('btn-reset-cam')!.addEventListener('click', () => {
      this.onResetView?.();
    });

    // Drawer toggle
    const drawer = document.getElementById('settings-drawer')!;
    const btnToggleSettings = document.getElementById('btn-toggle-settings')!;
    const btnCloseDrawer = document.getElementById('btn-close-drawer')!;

    btnToggleSettings.addEventListener('click', () => {
      drawer.classList.toggle('closed');
      const isOpen = !drawer.classList.contains('closed');
      btnToggleSettings.setAttribute('aria-pressed', String(isOpen));
    });

    btnCloseDrawer.addEventListener('click', () => {
      drawer.classList.add('closed');
      btnToggleSettings.setAttribute('aria-pressed', 'false');
    });

    // Tab buttons
    const tabBtns = document.querySelectorAll<HTMLButtonElement>('.drawer-tabs .tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.tab!;
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // Bind range sliders for optics
    this.bindRange('param-focal-dist', 'val-focal-dist', val => this.settings.focalDistance = val);
    this.bindRange('param-aperture', 'val-aperture', val => this.settings.aperture = val);
    this.bindRange('param-ior', 'val-ior', val => this.settings.ior = val);
    this.bindRange('param-dispersion', 'val-dispersion', val => this.settings.dispersion = val);
    this.bindRange('param-sss', 'val-sss', val => this.settings.subsurface = val);
    this.bindRange('param-emissive', 'val-emissive', val => this.settings.emissiveVeins = val);
    this.bindRange('param-bloom', 'val-bloom', val => this.settings.bloomIntensity = val);
    this.bindRange('param-exposure', 'val-exposure', val => this.settings.exposure = val);

    // Bind range sliders for 3-point lighting
    this.bindRange('param-sun-intensity', 'val-sun-intensity', val => this.settings.sunIntensity = val);
    this.bindRange('param-rim-intensity', 'val-rim-intensity', val => this.settings.rimIntensity = val);
    this.bindRange('param-rim-elevation', 'val-rim-elevation', val => this.settings.rimElevation = val, '°');
    this.bindRange('param-fill-intensity', 'val-fill-intensity', val => this.settings.fillIntensity = val);
    this.bindRange('param-light-azimuth', 'val-light-azimuth', val => this.settings.lightAzimuth = val, '°');
    this.bindRange('param-light-elevation', 'val-light-elevation', val => this.settings.lightElevation = val, '°');
    this.bindRange('param-fog', 'val-fog', val => this.settings.fogDensity = val);
    this.bindRange('param-godrays', 'val-godrays', val => this.settings.godraysIntensity = val);

    // Bind Flight controls
    this.bindRange('param-flight-speed', 'val-flight-speed', val => this.settings.flightSpeed = val);
    this.bindRange('param-headlamp-intensity', 'val-headlamp-intensity', val => this.settings.headlampIntensity = val);

    const checkHeadlamp = document.getElementById('param-headlamp') as HTMLInputElement;
    checkHeadlamp?.addEventListener('change', () => {
      this.settings.headlamp = checkHeadlamp.checked;
      this.onSettingChange?.();
    });

    const checkAdaptive = document.getElementById('param-adaptive-speed') as HTMLInputElement;
    checkAdaptive?.addEventListener('change', () => {
      this.settings.adaptiveSpeed = checkAdaptive.checked;
      this.onSettingChange?.();
    });

    const checkCushion = document.getElementById('param-wall-cushion') as HTMLInputElement;
    checkCushion?.addEventListener('change', () => {
      this.settings.wallCushion = checkCushion.checked;
      this.onSettingChange?.();
    });

    this.populateFormulaParams();
  }

  private bindRange(id: string, displayId: string, setter: (val: number) => void, suffix = '') {
    const el = document.getElementById(id) as HTMLInputElement;
    const disp = document.getElementById(displayId);
    if (!el || !disp) return;

    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      disp.textContent = val.toFixed(2) + suffix;
      setter(val);
      this.onSettingChange?.();
    });
  }

  public populateFormulaParams() {
    const container = document.getElementById('dynamic-formula-controls');
    if (!container) return;
    const formula = this.getActiveFormula();
    container.innerHTML = `<h3>${this.activeFormulaIndex + 1}. ${formula.name} Parameters</h3>`;

    for (const p of formula.params) {
      const row = document.createElement('div');
      row.className = 'control-row';
      row.innerHTML = `
        <label>${p.name}</label>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}" id="dyn-param-${p.id}">
        <span class="val-display" id="dyn-val-${p.id}">${p.default.toFixed(2)}</span>
      `;
      container.appendChild(row);

      const input = row.querySelector('input')!;
      const valDisp = row.querySelector('.val-display')!;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        valDisp.textContent = v.toFixed(2);
        this.onSettingChange?.();
      });
    }
  }

  public getDynamicParams(): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of this.getActiveFormula().params) {
      const el = document.getElementById(`dyn-param-${p.id}`) as HTMLInputElement;
      params[p.id] = el ? parseFloat(el.value) : p.default;
    }
    return params;
  }

  public updateStats(fps: number, sampleCount: number) {
    const fpsCounter = document.getElementById('fps-counter');
    if (fpsCounter) fpsCounter.textContent = Math.round(fps).toString();

    const accumPill = document.getElementById('accum-samples-pill');
    if (accumPill) {
      if (this.settings.progressiveAccumulation) {
        accumPill.textContent = `${sampleCount} Spp (Path Tracing)`;
      } else {
        accumPill.textContent = 'Interactive';
      }
    }
  }
}
