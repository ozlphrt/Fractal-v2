// src/ui/HUD.ts
// Industrial Studio HUD coordinator: quick-select popovers, precision sliders, tab defaults storage, and keyframe loops

import { FormulaDefinition, PalettePreset, RenderSettings } from '../core/types.ts';
import { FORMULAS, FORMULA_CYCLE_ORDER, FORMULA_GROUPS, PALETTES } from '../formulas/registry.ts';
import { CameraSnapshot, KeyframeEngine } from '../animation/KeyframeEngine.ts';

export class HUD {
  public settings: RenderSettings;
  public activeFormulaIndex: number = 0;
  public activePaletteIndex: number = 0;
  public currentMode: 'orbit' | 'flight' = 'orbit';

  public keyframeEngine: KeyframeEngine = new KeyframeEngine();

  public onSettingChange?: () => void;
  public onFormulaChange?: (formula: FormulaDefinition) => void;
  public onPaletteChange?: (palette: PalettePreset) => void;
  public onModeChange?: (mode: 'orbit' | 'flight') => void;
  public onResetView?: () => void;
  public onToggleAccumulation?: (enabled: boolean) => void;

  public getCameraSnapshot?: () => CameraSnapshot;
  public onApplyKeyframeCamera?: (camera: CameraSnapshot) => void;

  private formulaList: FormulaDefinition[] = FORMULA_CYCLE_ORDER.map(id => FORMULAS[id]).filter(Boolean);

  constructor() {
    // Default to Lace Gasket
    const defaultIdx = this.formulaList.findIndex(f => f.id === 'lace_gasket');
    this.activeFormulaIndex = defaultIdx >= 0 ? defaultIdx : 0;

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

    // Load any saved defaults from localStorage
    this.loadAllDefaults();

    this.initDOM();
    this.initKeyframeEngine();
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
      this.refreshAllKeyframeTracks();
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
        this.refreshAllKeyframeTracks();
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

    // Wire Save / Reset Defaults buttons for each tab
    document.querySelectorAll<HTMLButtonElement>('.save-defaults-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.saveTabDefaults(tabId, btn);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.reset-defaults-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.resetTabDefaults(tabId);
      });
    });

    // Wire Keyframe Add & Play buttons for each tab
    const tabIds = ['tab-optics', 'tab-lighting', 'tab-params', 'tab-flight'];
    for (const tabId of tabIds) {
      const addBtn = document.getElementById(`btn-add-${tabId}`);
      addBtn?.addEventListener('click', () => {
        const f = this.getActiveFormula();
        const fallbackCam: CameraSnapshot = { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
        const cam = this.getCameraSnapshot ? this.getCameraSnapshot() : fallbackCam;
        const vals = this.getTabValues(tabId);
        this.keyframeEngine.addKeyframe(f.id, tabId, cam, vals);
      });

      const playBtn = document.getElementById(`btn-play-${tabId}`);
      playBtn?.addEventListener('click', () => {
        const f = this.getActiveFormula();
        this.keyframeEngine.togglePlay(f.id, tabId);
        this.refreshAllKeyframeTracks();
      });
    }

    updateDisplays();
    this.populateFormulaParams();
    this.refreshAllKeyframeTracks();
  }

  private initKeyframeEngine() {
    this.keyframeEngine.onTrackChange = () => {
      this.refreshAllKeyframeTracks();
    };

    this.keyframeEngine.onApplyState = (camera, values, tabId) => {
      this.onApplyKeyframeCamera?.(camera);
      this.applyTabValues(tabId, values);
      this.onSettingChange?.();
    };
  }

  public refreshAllKeyframeTracks() {
    const f = this.getActiveFormula();
    const tabIds = ['tab-optics', 'tab-lighting', 'tab-params', 'tab-flight'];

    for (const tabId of tabIds) {
      const frames = this.keyframeEngine.getFramesFor(f.id, tabId);
      const countEl = document.getElementById(`kf-count-${tabId}`);
      if (countEl) {
        countEl.textContent = `${frames.length} Frame${frames.length === 1 ? '' : 's'}`;
      }

      const playBtn = document.getElementById(`btn-play-${tabId}`) as HTMLButtonElement;
      if (playBtn) {
        const isPlayingThis = this.keyframeEngine.isPlaying && this.keyframeEngine.playingTabId === tabId && this.keyframeEngine.playingFormulaId === f.id;
        playBtn.disabled = frames.length < 2;
        playBtn.textContent = isPlayingThis ? '⏸ Pause' : '▶ Loop';
        playBtn.classList.toggle('active', isPlayingThis);
      }

      const strip = document.getElementById(`kf-strip-${tabId}`);
      if (strip) {
        strip.innerHTML = '';
        frames.forEach((kf, idx) => {
          const chip = document.createElement('div');
          chip.className = 'keyframe-chip';
          chip.innerHTML = `
            <span class="kf-chip-label" title="Jump to Keyframe #${idx + 1}">#${idx + 1}</span>
            <button class="kf-chip-del" title="Delete Keyframe">✕</button>
          `;

          chip.querySelector('.kf-chip-label')!.addEventListener('click', () => {
            this.onApplyKeyframeCamera?.(kf.camera);
            this.applyTabValues(tabId, kf.values);
            this.onSettingChange?.();
          });

          chip.querySelector('.kf-chip-del')!.addEventListener('click', (e) => {
            e.stopPropagation();
            this.keyframeEngine.removeKeyframe(kf.id);
          });

          strip.appendChild(chip);
        });
      }
    }
  }

  public getTabValues(tabId: string): Record<string, number> {
    if (tabId === 'tab-optics') {
      return {
        focalDistance: this.settings.focalDistance,
        aperture: this.settings.aperture,
        ior: this.settings.ior,
        dispersion: this.settings.dispersion,
        subsurface: this.settings.subsurface,
        emissiveVeins: this.settings.emissiveVeins,
        bloomIntensity: this.settings.bloomIntensity,
        exposure: this.settings.exposure
      };
    } else if (tabId === 'tab-lighting') {
      return {
        sunIntensity: this.settings.sunIntensity,
        rimIntensity: this.settings.rimIntensity,
        rimElevation: this.settings.rimElevation,
        fillIntensity: this.settings.fillIntensity,
        glowIntensity: this.settings.glowIntensity,
        lightAzimuth: this.settings.lightAzimuth,
        lightElevation: this.settings.lightElevation,
        fogDensity: this.settings.fogDensity,
        godraysIntensity: this.settings.godraysIntensity
      };
    } else if (tabId === 'tab-params') {
      return this.getDynamicParams();
    } else if (tabId === 'tab-flight') {
      return {
        flightSpeed: this.settings.flightSpeed,
        headlampIntensity: this.settings.headlampIntensity,
        headlamp: this.settings.headlamp ? 1 : 0,
        adaptiveSpeed: this.settings.adaptiveSpeed ? 1 : 0,
        wallCushion: this.settings.wallCushion ? 1 : 0
      };
    }
    return {};
  }

  public applyTabValues(tabId: string, values: Record<string, number>) {
    if (tabId === 'tab-optics') {
      if (values.focalDistance !== undefined) this.setRangeValue('param-focal-dist', 'val-focal-dist', this.settings.focalDistance = values.focalDistance);
      if (values.aperture !== undefined) this.setRangeValue('param-aperture', 'val-aperture', this.settings.aperture = values.aperture);
      if (values.ior !== undefined) this.setRangeValue('param-ior', 'val-ior', this.settings.ior = values.ior);
      if (values.dispersion !== undefined) this.setRangeValue('param-dispersion', 'val-dispersion', this.settings.dispersion = values.dispersion);
      if (values.subsurface !== undefined) this.setRangeValue('param-sss', 'val-sss', this.settings.subsurface = values.subsurface);
      if (values.emissiveVeins !== undefined) this.setRangeValue('param-emissive', 'val-emissive', this.settings.emissiveVeins = values.emissiveVeins);
      if (values.bloomIntensity !== undefined) this.setRangeValue('param-bloom', 'val-bloom', this.settings.bloomIntensity = values.bloomIntensity);
      if (values.exposure !== undefined) this.setRangeValue('param-exposure', 'val-exposure', this.settings.exposure = values.exposure);
    } else if (tabId === 'tab-lighting') {
      if (values.sunIntensity !== undefined) this.setRangeValue('param-sun-intensity', 'val-sun-intensity', this.settings.sunIntensity = values.sunIntensity);
      if (values.rimIntensity !== undefined) this.setRangeValue('param-rim-intensity', 'val-rim-intensity', this.settings.rimIntensity = values.rimIntensity);
      if (values.rimElevation !== undefined) this.setRangeValue('param-rim-elevation', 'val-rim-elevation', this.settings.rimElevation = values.rimElevation, '°');
      if (values.fillIntensity !== undefined) this.setRangeValue('param-fill-intensity', 'val-fill-intensity', this.settings.fillIntensity = values.fillIntensity);
      if (values.glowIntensity !== undefined) this.setRangeValue('param-glow-intensity', 'val-glow-intensity', this.settings.glowIntensity = values.glowIntensity);
      if (values.lightAzimuth !== undefined) this.setRangeValue('param-light-azimuth', 'val-light-azimuth', this.settings.lightAzimuth = values.lightAzimuth, '°');
      if (values.lightElevation !== undefined) this.setRangeValue('param-light-elevation', 'val-light-elevation', this.settings.lightElevation = values.lightElevation, '°');
      if (values.fogDensity !== undefined) this.setRangeValue('param-fog', 'val-fog', this.settings.fogDensity = values.fogDensity);
      if (values.godraysIntensity !== undefined) this.setRangeValue('param-godrays', 'val-godrays', this.settings.godraysIntensity = values.godraysIntensity);
    } else if (tabId === 'tab-params') {
      for (const [key, val] of Object.entries(values)) {
        const input = document.getElementById(`dyn-param-${key}`) as HTMLInputElement;
        const disp = document.getElementById(`dyn-val-${key}`);
        if (input) input.value = String(val);
        if (disp) disp.textContent = val.toFixed(2);
      }
    } else if (tabId === 'tab-flight') {
      if (values.flightSpeed !== undefined) this.setRangeValue('param-flight-speed', 'val-flight-speed', this.settings.flightSpeed = values.flightSpeed);
      if (values.headlampIntensity !== undefined) this.setRangeValue('param-headlamp-intensity', 'val-headlamp-intensity', this.settings.headlampIntensity = values.headlampIntensity);
      if (values.headlamp !== undefined) {
        const el = document.getElementById('param-headlamp') as HTMLInputElement;
        if (el) el.checked = Boolean(values.headlamp);
        this.settings.headlamp = Boolean(values.headlamp);
      }
    }
  }

  private setRangeValue(id: string, dispId: string, val: number, suffix = '') {
    const el = document.getElementById(id) as HTMLInputElement;
    const disp = document.getElementById(dispId);
    if (el) el.value = String(val);
    if (disp) disp.textContent = val.toFixed(2) + suffix;
  }

  public saveTabDefaults(tabId: string, btn?: HTMLButtonElement) {
    const vals = this.getTabValues(tabId);
    const key = tabId === 'tab-params'
      ? `fractal_v2_defaults_formula_${this.getActiveFormula().id}`
      : `fractal_v2_defaults_${tabId}`;

    try {
      localStorage.setItem(key, JSON.stringify(vals));
      if (btn) {
        const origText = btn.innerHTML;
        btn.innerHTML = `<span>Saved ✓</span>`;
        btn.classList.add('saved-active');
        setTimeout(() => {
          btn.innerHTML = origText;
          btn.classList.remove('saved-active');
        }, 1800);
      }
    } catch {
      // Ignore quota errors
    }
  }

  public resetTabDefaults(tabId: string) {
    const key = tabId === 'tab-params'
      ? `fractal_v2_defaults_formula_${this.getActiveFormula().id}`
      : `fractal_v2_defaults_${tabId}`;

    try {
      localStorage.removeItem(key);
      if (tabId === 'tab-optics') {
        this.applyTabValues('tab-optics', { focalDistance: 2.35, aperture: 0.0, ior: 1.45, dispersion: 0.0, subsurface: 0.2, emissiveVeins: 0.0, bloomIntensity: 0.25, exposure: 1.0 });
      } else if (tabId === 'tab-lighting') {
        this.applyTabValues('tab-lighting', { sunIntensity: 1.0, rimIntensity: 0.32, rimElevation: 30, fillIntensity: 0.38, glowIntensity: 0.35, lightAzimuth: 45, lightElevation: 48, fogDensity: 0.03, godraysIntensity: 0.0 });
      } else if (tabId === 'tab-params') {
        this.populateFormulaParams();
      } else if (tabId === 'tab-flight') {
        this.applyTabValues('tab-flight', { flightSpeed: 0.6, headlampIntensity: 1.5, headlamp: 1, adaptiveSpeed: 1, wallCushion: 1 });
      }
      this.onSettingChange?.();
    } catch {
      // Ignore
    }
  }

  private loadAllDefaults() {
    try {
      const optics = localStorage.getItem('fractal_v2_defaults_tab-optics');
      if (optics) Object.assign(this.settings, JSON.parse(optics));

      const lighting = localStorage.getItem('fractal_v2_defaults_tab-lighting');
      if (lighting) Object.assign(this.settings, JSON.parse(lighting));

      const flight = localStorage.getItem('fractal_v2_defaults_tab-flight');
      if (flight) Object.assign(this.settings, JSON.parse(flight));
    } catch {
      // Ignore
    }
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
    const currentId = this.getActiveFormula().id;
    document.querySelectorAll<HTMLElement>('.formula-card').forEach(card => {
      card.classList.toggle('active', card.dataset.formulaId === currentId);
    });

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
    this.refreshAllKeyframeTracks();
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

    // Check for saved formula defaults
    let savedFormulaValues: Record<string, number> = {};
    try {
      const saved = localStorage.getItem(`fractal_v2_defaults_formula_${formula.id}`);
      if (saved) savedFormulaValues = JSON.parse(saved);
    } catch {
      // Ignore
    }

    for (const p of formula.params) {
      const currentVal = savedFormulaValues[p.id] ?? p.default;
      const row = document.createElement('div');
      row.className = 'control-row';
      row.innerHTML = `
        <label>${p.name}</label>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${currentVal}" id="dyn-param-${p.id}" class="studio-slider">
        <span class="val-display" id="dyn-val-${p.id}">${currentVal.toFixed(2)}</span>
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
