// src/ui/HUD.ts
// Industrial Studio HUD coordinator: quick-select popovers, precision sliders, formula archives, and 6DOF mode toggles

import { FormulaDefinition, PalettePreset, RenderSettings } from '../core/types.ts';
import { FORMULAS, FORMULA_CYCLE_ORDER, FORMULA_GROUPS, PALETTES } from '../formulas/registry.ts';

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

      // Calibrated 3-Point Studio Lighting & Atmosphere
      sunIntensity: 1.0,
      rimIntensity: 0.32,     // Subtle, non-overpowering dark midnight rim light
      rimElevation: 30,
      fillIntensity: 0.38,    // Gentle cool fill so shadowed faces retain geological detail
      glowIntensity: 0.35,    // Volumetric mist glow around fractal surface
      headlamp: true,         // Active ONLY in 6DOF Flight mode
      headlampIntensity: 1.5,
      fogDensity: 0.03,
      godraysIntensity: 0.0,
      lightAzimuth: 45,
      lightElevation: 48,

      // 6DOF Flight Dynamics
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

    // Display update helpers
    const labelFormula = document.getElementById('current-formula-label')!;
    const labelPalette = document.getElementById('current-palette-label')!;

    const updateDisplays = () => {
      const f = this.getActiveFormula();
      labelFormula.textContent = `${this.activeFormulaIndex + 1}. ${f.name}`;
      labelPalette.textContent = this.getActivePalette().name;

      const dropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement;
      if (dropdown && dropdown.value !== f.id) {
        dropdown.value = f.id;
      }

      this.updatePopoverActiveStates();
    };

    // Populate Grouped Formula Dropdown in settings drawer
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
          this.selectFormula(targetIdx);
        }
      });
    }

    // Prev / Next Formula Arrows
    document.getElementById('btn-prev-formula')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectFormula((this.activeFormulaIndex - 1 + this.formulaList.length) % this.formulaList.length);
    });

    document.getElementById('btn-next-formula')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectFormula((this.activeFormulaIndex + 1) % this.formulaList.length);
    });

    // Prev / Next Palette Arrows
    document.getElementById('btn-prev-palette')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectPalette((this.activePaletteIndex - 1 + PALETTES.length) % PALETTES.length);
    });

    document.getElementById('btn-next-palette')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectPalette((this.activePaletteIndex + 1) % PALETTES.length);
    });

    // Popover Setup
    this.setupPopovers();

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
      // Close popovers if drawer opened
      if (isOpen) {
        this.closeAllPopovers();
      }
    });

    btnCloseDrawer.addEventListener('click', () => {
      drawer.classList.add('closed');
      btnToggleSettings.setAttribute('aria-pressed', 'false');
    });

    // Drawer Tab Switching
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

    // Optics & Physics sliders
    this.bindRange('param-focal-dist', 'val-focal-dist', val => this.settings.focalDistance = val);
    this.bindRange('param-aperture', 'val-aperture', val => this.settings.aperture = val);
    this.bindRange('param-ior', 'val-ior', val => this.settings.ior = val);
    this.bindRange('param-dispersion', 'val-dispersion', val => this.settings.dispersion = val);
    this.bindRange('param-sss', 'val-sss', val => this.settings.subsurface = val);
    this.bindRange('param-emissive', 'val-emissive', val => this.settings.emissiveVeins = val);
    this.bindRange('param-bloom', 'val-bloom', val => this.settings.bloomIntensity = val);
    this.bindRange('param-exposure', 'val-exposure', val => this.settings.exposure = val);

    // 3-Point Lighting & Atmosphere sliders
    this.bindRange('param-sun-intensity', 'val-sun-intensity', val => this.settings.sunIntensity = val);
    this.bindRange('param-rim-intensity', 'val-rim-intensity', val => this.settings.rimIntensity = val);
    this.bindRange('param-rim-elevation', 'val-rim-elevation', val => this.settings.rimElevation = val, '°');
    this.bindRange('param-fill-intensity', 'val-fill-intensity', val => this.settings.fillIntensity = val);
    this.bindRange('param-glow-intensity', 'val-glow-intensity', val => this.settings.glowIntensity = val);
    this.bindRange('param-light-azimuth', 'val-light-azimuth', val => this.settings.lightAzimuth = val, '°');
    this.bindRange('param-light-elevation', 'val-light-elevation', val => this.settings.lightElevation = val, '°');
    this.bindRange('param-fog', 'val-fog', val => this.settings.fogDensity = val);
    this.bindRange('param-godrays', 'val-godrays', val => this.settings.godraysIntensity = val);

    // 6DOF Flight controls
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

    updateDisplays();
    this.populateFormulaParams();
  }

  private setupPopovers() {
    const formulaPopover = document.getElementById('formula-popover')!;
    const palettePopover = document.getElementById('palette-popover')!;
    const btnFormulaSelect = document.getElementById('btn-select-formula')!;
    const btnPaletteSelect = document.getElementById('btn-select-palette')!;
    const btnCloseFormula = document.getElementById('btn-close-formula-popover')!;
    const btnClosePalette = document.getElementById('btn-close-palette-popover')!;

    // Populate Formula Popover with all 7 groups and 20 numbered formulas
    const formulaListContainer = document.getElementById('formula-popover-list')!;
    formulaListContainer.innerHTML = '';

    for (const group of FORMULA_GROUPS) {
      const groupSection = document.createElement('div');
      groupSection.className = 'popover-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'popover-group-header';
      groupHeader.innerHTML = `<span class="group-badge">${group.badge}</span> <span class="group-title">${group.name}</span>`;
      groupSection.appendChild(groupHeader);

      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'popover-items-grid';

      for (const id of group.ids) {
        const f = FORMULAS[id];
        if (!f) continue;
        const idx = this.formulaList.findIndex(item => item.id === id);

        const card = document.createElement('button');
        card.className = 'popover-card formula-card';
        card.dataset.formulaId = id;
        card.dataset.index = String(idx);
        card.innerHTML = `
          <div class="card-row-top">
            <span class="card-num">${idx + 1}.</span>
            <span class="card-name">${f.name}</span>
          </div>
          <div class="card-subtitle">${f.subtitle}</div>
        `;

        card.addEventListener('click', () => {
          this.selectFormula(idx);
          this.closeAllPopovers();
        });

        itemsGrid.appendChild(card);
      }

      groupSection.appendChild(itemsGrid);
      formulaListContainer.appendChild(groupSection);
    }

    // Populate Material Palette Popover with all 9 geological presets and color previews
    const paletteListContainer = document.getElementById('palette-popover-list')!;
    paletteListContainer.innerHTML = '';

    const paletteGrid = document.createElement('div');
    paletteGrid.className = 'popover-palette-grid';

    PALETTES.forEach((pal, idx) => {
      const card = document.createElement('button');
      card.className = 'popover-card palette-card';
      card.dataset.paletteIndex = String(idx);

      // Generate preview swatch gradient using cosine values
      const c1 = this.evalPaletteRGB(0.15, pal);
      const c2 = this.evalPaletteRGB(0.50, pal);
      const c3 = this.evalPaletteRGB(0.85, pal);

      card.innerHTML = `
        <div class="swatch-strip" style="background: linear-gradient(90deg, ${c1}, ${c2}, ${c3})"></div>
        <div class="palette-card-name">${pal.name}</div>
      `;

      card.addEventListener('click', () => {
        this.selectPalette(idx);
        this.closeAllPopovers();
      });

      paletteGrid.appendChild(card);
    });

    paletteListContainer.appendChild(paletteGrid);

    // Click triggers
    btnFormulaSelect.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosed = formulaPopover.classList.contains('closed');
      this.closeAllPopovers();
      if (isClosed) {
        formulaPopover.classList.remove('closed');
      }
    });

    btnPaletteSelect.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosed = palettePopover.classList.contains('closed');
      this.closeAllPopovers();
      if (isClosed) {
        palettePopover.classList.remove('closed');
      }
    });

    btnCloseFormula.addEventListener('click', () => formulaPopover.classList.add('closed'));
    btnClosePalette.addEventListener('click', () => palettePopover.classList.add('closed'));

    // Close on click outside
    window.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#formula-popover') && !target.closest('#btn-select-formula')) {
        formulaPopover.classList.add('closed');
      }
      if (!target.closest('#palette-popover') && !target.closest('#btn-select-palette')) {
        palettePopover.classList.add('closed');
      }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllPopovers();
        document.getElementById('settings-drawer')?.classList.add('closed');
      }
    });
  }

  private evalPaletteRGB(t: number, pal: PalettePreset): string {
    const twoPi = 6.2831853;
    const r = Math.round(clamp01(pal.a[0] + pal.b[0] * Math.cos(twoPi * (pal.c[0] * t + pal.d[0]))) * 255);
    const g = Math.round(clamp01(pal.a[1] + pal.b[1] * Math.cos(twoPi * (pal.c[1] * t + pal.d[1]))) * 255);
    const b = Math.round(clamp01(pal.a[2] + pal.b[2] * Math.cos(twoPi * (pal.c[2] * t + pal.d[2]))) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private closeAllPopovers() {
    document.getElementById('formula-popover')?.classList.add('closed');
    document.getElementById('palette-popover')?.classList.add('closed');
  }

  private updatePopoverActiveStates() {
    // Highlight active formula card
    const currentId = this.getActiveFormula().id;
    document.querySelectorAll<HTMLElement>('.formula-card').forEach(card => {
      card.classList.toggle('active', card.dataset.formulaId === currentId);
    });

    // Highlight active palette card
    document.querySelectorAll<HTMLElement>('.palette-card').forEach(card => {
      card.classList.toggle('active', card.dataset.paletteIndex === String(this.activePaletteIndex));
    });
  }

  public selectFormula(index: number) {
    this.activeFormulaIndex = index;
    const f = this.getActiveFormula();
    const labelFormula = document.getElementById('current-formula-label');
    if (labelFormula) {
      labelFormula.textContent = `${this.activeFormulaIndex + 1}. ${f.name}`;
    }

    const dropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement;
    if (dropdown && dropdown.value !== f.id) {
      dropdown.value = f.id;
    }

    this.updatePopoverActiveStates();
    this.populateFormulaParams();
    this.onFormulaChange?.(f);
  }

  public selectPalette(index: number) {
    this.activePaletteIndex = index;
    const pal = this.getActivePalette();
    const labelPalette = document.getElementById('current-palette-label');
    if (labelPalette) {
      labelPalette.textContent = pal.name;
    }

    this.updatePopoverActiveStates();
    this.onPaletteChange?.(pal);
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
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}" id="dyn-param-${p.id}" class="studio-slider">
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
        accumPill.textContent = `${sampleCount} Spp (Accumulated)`;
      } else {
        accumPill.textContent = 'Interactive';
      }
    }
  }
}

function clamp01(x: number): number {
  return Math.max(0.0, Math.min(1.0, x));
}
