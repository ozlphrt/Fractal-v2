// src/ui/HUD.ts
// Industrial Studio HUD coordinator: quick-select popovers, precision sliders, tab defaults storage,
// global full-scene keyframe loops with monotonic cubic interpolation and direct palette morphing

import { FormulaDefinition, PalettePreset, RenderSettings } from '../core/types.ts';
import { FORMULAS, FORMULA_CYCLE_ORDER, FORMULA_GROUPS, PALETTES } from '../formulas/registry.ts';
import { CameraSnapshot, Keyframe, KeyframeEngine, slerpVec3 } from '../animation/KeyframeEngine.ts';
import { ProceduralFlythrough } from '../animation/ProceduralFlythrough.ts';
import { AudioEngine, AudioMetrics } from '../audio/AudioEngine.ts';

/** Formula numbers (as shown in the UI) the auto-play tour visits first; everything else follows in numeric order */
const TOUR_PRIORITY = [3, 4, 15, 16, 17, 7, 8, 9];

function buildTourOrder(count: number): number[] {
  const first = TOUR_PRIORITY.map(n => n - 1).filter(i => i >= 0 && i < count);
  const rest: number[] = [];
  for (let i = 0; i < count; i++) if (!first.includes(i)) rest.push(i);
  return [...first, ...rest];
}

export class HUD {
  public settings: RenderSettings;
  public activeFormulaIndex: number = 0;
  public activePaletteIndex: number = 0;
  public currentPalette: PalettePreset;

  public keyframeEngine: KeyframeEngine = new KeyframeEngine();
  public audioEngine: AudioEngine = new AudioEngine();
  public isRandomMode: boolean = false;
  public selectedKeyframeId: string | null = null;
  public dynamicParamValues: Record<string, number> = {};

  public onSettingChange?: () => void;
  public onFormulaChange?: (formula: FormulaDefinition, fromTour?: boolean) => void;
  /** Ask the renderer to start compiling a formula's shader in the background */
  public onWarmFormula?: (formula: FormulaDefinition) => void;
  /** Whether a formula's shader is compiled and can be used without a hitch */
  public isFormulaReady?: (formula: FormulaDefinition) => boolean;
  public onPaletteChange?: (palette: PalettePreset) => void;
  public onResetView?: () => void;
  public onToggleAccumulation?: (enabled: boolean) => void;

  public getCameraSnapshot?: () => CameraSnapshot;
  public onApplyKeyframeCamera?: (camera: CameraSnapshot) => void;
  public onTransitionProgress?: (weight: number, isDone: boolean) => void;

  private formulaList: FormulaDefinition[] = FORMULA_CYCLE_ORDER.map(id => FORMULAS[id]).filter(Boolean);
  private randomDeck: number[] = [];

  constructor() {
    // Shuffled random formula sequence by default
    this.refillRandomDeck();
    this.activeFormulaIndex = this.getNextRandomFormulaIndex();

    // Default to Desert Sandstone
    const initialPal = PALETTES[0];
    this.currentPalette = {
      id: initialPal.id,
      name: initialPal.name,
      a: [...initialPal.a],
      b: [...initialPal.b],
      c: [...initialPal.c],
      d: [...initialPal.d]
    };

    this.settings = {
      focalDistance: 2.35,
      aperture: 0.0,
      ior: 1.45,
      dispersion: 0.0,
      subsurface: 0.2,
      emissiveVeins: 0.0,
      bloomIntensity: 0.25,
      exposure: 1.0,

      // Flying Cavity Lights (Photon Orbs)
      orbEnabled: true,
      orbIntensity: 1.20,
      orbSpeed: 1.00,
      orbRadius: 0.016,
      orbTail: 1.00,
      orbPreset: 'trichrome',

      // Calibrated 3-Point Studio Lighting & Atmosphere
      sunIntensity: 1.0,
      rimIntensity: 0.32,
      rimElevation: 30,
      fillIntensity: 0.38,
      glowIntensity: 0.35,
      headlamp: true,
      headlampIntensity: 1.5,
      fogDensity: 0.03,
      godraysIntensity: 0.0,
      lightAzimuth: 45,
      lightElevation: 48,

      // 6DOF Flight Dynamics
      flightSpeed: 0.6,
      adaptiveSpeed: true,
      wallCushion: true,
      progressiveAccumulation: false,

      // Audio Reactivity (Lights, Glow & Subtle Breathing)
      audioEnabled: false,
      audioSensitivity: 1.40,
      audioBreathing: 0.50,
      audioGlow: 1.20,
      audioColorShift: 0.60
    };

    // Load any saved defaults from localStorage
    this.loadAllDefaults();

    this.initKeyframeEngine();
    this.setupEventListeners();
  }

  public getActiveFormula(): FormulaDefinition {
    return this.formulaList[this.activeFormulaIndex] || this.formulaList[0];
  }

  public getAllFormulas(): FormulaDefinition[] {
    return this.formulaList;
  }

  public getActivePalette(): PalettePreset {
    return this.currentPalette;
  }

  private updateOrbToggleUI(enabled: boolean) {
    const btn = document.getElementById('param-orb-toggle');
    const text = document.getElementById('param-orb-toggle-text');
    const led = document.getElementById('param-orb-toggle-led');
    if (!btn || !text || !led) return;
    if (enabled) {
      btn.style.background = 'rgba(56, 189, 248, 0.12)';
      btn.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      btn.style.color = '#38bdf8';
      text.textContent = 'ENABLED';
      led.style.background = '#38bdf8';
      led.style.boxShadow = '0 0 8px #38bdf8';
    } else {
      btn.style.background = 'rgba(255, 255, 255, 0.04)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      btn.style.color = 'var(--text-tertiary)';
      text.textContent = 'DISABLED';
      led.style.background = '#555';
      led.style.boxShadow = 'none';
    }
  }

  private setupEventListeners() {
    const updateDisplays = () => {
      this.setRangeValue('param-focal-dist', 'val-focal-dist', this.settings.focalDistance);
      this.setRangeValue('param-aperture', 'val-aperture', this.settings.aperture);
      this.setRangeValue('param-bloom', 'val-bloom', this.settings.bloomIntensity);
      this.setRangeValue('param-exposure', 'val-exposure', this.settings.exposure);

      this.setRangeValue('param-mat-ior', 'val-mat-ior', this.settings.ior);
      this.setRangeValue('param-mat-dispersion', 'val-mat-dispersion', this.settings.dispersion);
      this.setRangeValue('param-mat-sss', 'val-mat-sss', this.settings.subsurface);
      this.setRangeValue('param-mat-emissive', 'val-mat-emissive', this.settings.emissiveVeins);
      this.updateOrbToggleUI(this.settings.orbEnabled);
      this.setRangeValue('param-orb-intensity', 'val-orb-intensity', this.settings.orbIntensity);
      this.setRangeValue('param-orb-speed', 'val-orb-speed', this.settings.orbSpeed);
      this.setRangeValue('param-orb-radius', 'val-orb-radius', this.settings.orbRadius);
      this.setRangeValue('param-orb-tail', 'val-orb-tail', this.settings.orbTail);
      const presetSelect = document.getElementById('param-orb-preset') as HTMLSelectElement | null;
      if (presetSelect) presetSelect.value = this.settings.orbPreset || 'trichrome';

      this.setRangeValue('param-sun-intensity', 'val-sun-intensity', this.settings.sunIntensity);
      this.setRangeValue('param-rim-intensity', 'val-rim-intensity', this.settings.rimIntensity);
      this.setRangeValue('param-rim-elevation', 'val-rim-elevation', this.settings.rimElevation, '°');
      this.setRangeValue('param-fill-intensity', 'val-fill-intensity', this.settings.fillIntensity);
      this.setRangeValue('param-glow-intensity', 'val-glow-intensity', this.settings.glowIntensity);
      this.setRangeValue('param-light-azimuth', 'val-light-azimuth', this.settings.lightAzimuth, '°');
      this.setRangeValue('param-light-elevation', 'val-light-elevation', this.settings.lightElevation, '°');
      this.setRangeValue('param-fog', 'val-fog', this.settings.fogDensity);
      this.setRangeValue('param-godrays', 'val-godrays', this.settings.godraysIntensity);
    };

    // Formula label and smooth transition
    const f = this.getActiveFormula();
    const labelFormula = document.getElementById('current-formula-label');
    if (labelFormula) {
      labelFormula.textContent = `${this.activeFormulaIndex + 1}. ${f.name}`;
    }

    // Material label
    const pal = this.getActivePalette();
    const labelPalette = document.getElementById('current-palette-label');
    if (labelPalette) {
      labelPalette.textContent = pal.name;
    }

    // Prev / Next Formula Arrows with subtle label cross-fade
    const btnPrevFormula = document.getElementById('btn-prev-formula');
    const btnNextFormula = document.getElementById('btn-next-formula');
    btnPrevFormula?.addEventListener('click', (e) => {
      e.stopPropagation();
      labelFormula?.classList.add('fading');
      setTimeout(() => labelFormula?.classList.remove('fading'), 250);
      this.selectFormula((this.activeFormulaIndex - 1 + this.formulaList.length) % this.formulaList.length);
    });

    btnNextFormula?.addEventListener('click', (e) => {
      e.stopPropagation();
      labelFormula?.classList.add('fading');
      setTimeout(() => labelFormula?.classList.remove('fading'), 250);
      this.selectFormula((this.activeFormulaIndex + 1) % this.formulaList.length);
    });

    // Prev / Next Palette Arrows with subtle label cross-fade
    const btnPrevPalette = document.getElementById('btn-prev-palette');
    const btnNextPalette = document.getElementById('btn-next-palette');
    btnPrevPalette?.addEventListener('click', (e) => {
      e.stopPropagation();
      labelPalette?.classList.add('fading');
      setTimeout(() => labelPalette?.classList.remove('fading'), 250);
      this.selectPalette((this.activePaletteIndex - 1 + PALETTES.length) % PALETTES.length);
    });

    btnNextPalette?.addEventListener('click', (e) => {
      e.stopPropagation();
      labelPalette?.classList.add('fading');
      setTimeout(() => labelPalette?.classList.remove('fading'), 250);
      this.selectPalette((this.activePaletteIndex + 1) % PALETTES.length);
    });

    // Popover Setup
    this.setupPopovers();

    // Accumulation button (if present)
    const btnAccum = document.getElementById('btn-toggle-pathtrace');
    btnAccum?.addEventListener('click', () => {
      this.settings.progressiveAccumulation = !this.settings.progressiveAccumulation;
      if (this.settings.progressiveAccumulation && this.settings.aperture === 0.0) {
        this.settings.aperture = 0.012;
        this.setRangeValue('param-aperture', 'val-aperture', 0.012);
      }
      btnAccum.classList.toggle('active', this.settings.progressiveAccumulation);
      btnAccum.setAttribute('aria-pressed', String(this.settings.progressiveAccumulation));
      this.onToggleAccumulation?.(this.settings.progressiveAccumulation);
    });

    // Reset view button (if present)
    const btnResetCam = document.getElementById('btn-reset-cam');
    btnResetCam?.addEventListener('click', () => {
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
      });
    });

    // Optics & Physics sliders
    this.bindRange('param-focal-dist', 'val-focal-dist', val => this.settings.focalDistance = val);
    this.bindRange('param-aperture', 'val-aperture', val => this.settings.aperture = val);
    this.bindRange('param-bloom', 'val-bloom', val => this.settings.bloomIntensity = val);
    this.bindRange('param-exposure', 'val-exposure', val => this.settings.exposure = val);

    // Materials sliders
    this.bindRange('param-mat-ior', 'val-mat-ior', val => this.settings.ior = val);
    this.bindRange('param-mat-dispersion', 'val-mat-dispersion', val => this.settings.dispersion = val);
    this.bindRange('param-mat-sss', 'val-mat-sss', val => this.settings.subsurface = val);
    this.bindRange('param-mat-emissive', 'val-mat-emissive', val => this.settings.emissiveVeins = val);
    document.getElementById('param-orb-toggle')?.addEventListener('click', () => {
      this.settings.orbEnabled = !this.settings.orbEnabled;
      this.updateOrbToggleUI(this.settings.orbEnabled);
      this.onSettingChange?.();
    });
    document.getElementById('param-orb-preset')?.addEventListener('change', (e) => {
      this.settings.orbPreset = (e.target as HTMLSelectElement).value;
      this.onSettingChange?.();
    });
    this.bindRange('param-orb-intensity', 'val-orb-intensity', val => this.settings.orbIntensity = val);
    this.bindRange('param-orb-speed', 'val-orb-speed', val => this.settings.orbSpeed = val);
    this.bindRange('param-orb-radius', 'val-orb-radius', val => this.settings.orbRadius = val);
    this.bindRange('param-orb-tail', 'val-orb-tail', val => this.settings.orbTail = val);

    // Populate Material dropdown in Materials tab
    const matDropdown = document.getElementById('material-dropdown-select') as HTMLSelectElement | null;
    if (matDropdown) {
      matDropdown.innerHTML = '';
      PALETTES.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${idx + 1}. ${p.name}`;
        matDropdown.appendChild(opt);
      });
      matDropdown.value = String(this.activePaletteIndex);
      matDropdown.addEventListener('change', () => {
        this.selectPalette(parseInt(matDropdown.value, 10));
      });
    }

    // Populate Formula dropdown in Parameters tab
    const formulaDropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement | null;
    if (formulaDropdown) {
      this.syncFormulaDropdown();
      formulaDropdown.addEventListener('change', () => {
        const idx = this.formulaList.findIndex(item => item.id === formulaDropdown.value);
        if (idx >= 0) {
          this.selectFormula(idx);
        }
      });
    }

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

    // Detailed Audio, Lighting & Subtle Breathing Sliders
    this.bindRange('param-audio-sens', 'val-audio-sens', val => this.settings.audioSensitivity = val);
    this.bindRange('param-audio-breath', 'val-audio-breath', val => this.settings.audioBreathing = val);
    this.bindRange('param-audio-glow', 'val-audio-glow', val => this.settings.audioGlow = val);
    this.bindRange('param-audio-color', 'val-audio-color', val => this.settings.audioColorShift = val);

    // One-Click Sound Presets (Lights & Glow Focused)
    document.getElementById('btn-sound-preset-radical')?.addEventListener('click', () => {
      this.applySoundPreset({ audioBreathing: 0.6, audioGlow: 1.8, audioColorShift: 0.9, audioSensitivity: 1.6 });
    });
    document.getElementById('btn-sound-preset-flow')?.addEventListener('click', () => {
      this.applySoundPreset({ audioBreathing: 0.4, audioGlow: 1.4, audioColorShift: 0.6, audioSensitivity: 1.4 });
    });
    document.getElementById('btn-sound-preset-cathedral')?.addEventListener('click', () => {
      this.applySoundPreset({ audioBreathing: 0.3, audioGlow: 2.2, audioColorShift: 0.4, audioSensitivity: 1.5 });
    });
    document.getElementById('btn-sound-preset-subtle')?.addEventListener('click', () => {
      this.applySoundPreset({ audioBreathing: 0.2, audioGlow: 0.7, audioColorShift: 0.3, audioSensitivity: 1.1 });
    });

    // Audio Reactivity Header Toggle & File Picker
    const btnAudioToggle = document.getElementById('btn-audio-toggle');
    const btnOpenAudioFile = document.getElementById('btn-open-audio-file');
    const audioFileInput = document.getElementById('audio-file-input') as HTMLInputElement | null;

    btnAudioToggle?.addEventListener('click', () => {
      this.cycleAudioSource();
    });

    btnOpenAudioFile?.addEventListener('click', (e) => {
      e.stopPropagation();
      audioFileInput?.click();
    });

    audioFileInput?.addEventListener('change', () => {
      const file = audioFileInput.files?.[0];
      if (file) {
        this.audioEngine.loadFile(file);
        this.settings.audioEnabled = true;
      }
    });

    // Audio Source Segmented Control Buttons in Settings Drawer
    const btnSrcOff = document.getElementById('btn-audio-src-off');
    const btnSrcMic = document.getElementById('btn-audio-src-mic');
    const btnSrcFile = document.getElementById('btn-audio-src-file');
    const btnSrcSynth = document.getElementById('btn-audio-src-synth');

    btnSrcOff?.addEventListener('click', () => {
      this.settings.audioEnabled = false;
      this.audioEngine.disable();
    });
    btnSrcMic?.addEventListener('click', async () => {
      const ok = await this.audioEngine.enableMic();
      this.settings.audioEnabled = ok;
    });
    btnSrcFile?.addEventListener('click', () => {
      audioFileInput?.click();
    });
    btnSrcSynth?.addEventListener('click', () => {
      this.audioEngine.enableSynth();
      this.settings.audioEnabled = true;
    });

    // Window Drag & Drop for Audio Files
    this.setupAudioDragDrop();

    // Wire Save / Copy / Paste / Reset Defaults buttons for each tab
    document.querySelectorAll<HTMLButtonElement>('.save-defaults-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.saveTabDefaults(tabId, btn);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.copy-settings-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.copyTabSettings(tabId, btn);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.paste-settings-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.pasteTabSettings(tabId, btn);
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.reset-defaults-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab!;
        this.resetTabDefaults(tabId);
      });
    });

    // Global Keyframe Controls
    const btnAddGlobal = document.getElementById('btn-add-global');
    btnAddGlobal?.addEventListener('click', () => {
      const f = this.getActiveFormula();
      const fallbackCam: CameraSnapshot = { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
      const cam = this.getCameraSnapshot ? this.getCameraSnapshot() : fallbackCam;
      const allVals = this.getAllValues();
      const frame = this.keyframeEngine.addKeyframe(
        f.id,
        cam,
        allVals,
        this.currentPalette,
        this.activePaletteIndex
      );
      this.selectedKeyframeId = frame.id;
      this.refreshGlobalKeyframeTrack();
    });

    const btnUpdateGlobal = document.getElementById('btn-update-global') as HTMLButtonElement | null;
    btnUpdateGlobal?.addEventListener('click', () => {
      this.updateActiveGlobalKeyframe(btnUpdateGlobal);
    });

    const btnPlayGlobal = document.getElementById('btn-play-global');
    btnPlayGlobal?.addEventListener('click', () => {
      // Same behaviour as the dock play button: auto-play every formula's loop until paused
      this.toggleStoredLoopForActiveFormula();
    });

    const btnExportGlobal = document.getElementById('btn-export-global');
    const flashLabel = (btn: HTMLElement | null, text: string, orig: string) => {
      if (!btn) return;
      btn.textContent = text;
      setTimeout(() => { btn.textContent = orig; }, 1800);
    };
    btnExportGlobal?.addEventListener('click', () => {
      const blob = new Blob([this.keyframeEngine.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fractal-keyframes.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flashLabel(btnExportGlobal, 'Saved ✓', '⇩ Export JSON');
    });

    const btnImportGlobal = document.getElementById('btn-import-global');
    const fileInput = document.getElementById('input-import-global') as HTMLInputElement | null;
    btnImportGlobal?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const count = this.keyframeEngine.importJSON(await file.text());
        this.selectedKeyframeId = null;
        flashLabel(btnImportGlobal, `Loaded ${count} ✓`, '⇧ Import JSON');
      } catch {
        flashLabel(btnImportGlobal, 'Invalid file', '⇧ Import JSON');
      }
      fileInput.value = '';
    });

    // Play Stored Loop for active formula directly from dock button
    const btnDockPlay = document.getElementById('btn-dock-play');
    btnDockPlay?.addEventListener('click', () => {
      this.toggleStoredLoopForActiveFormula();
    });

    // Random Procedural Flythrough Dice Button
    const btnDockRandom = document.getElementById('btn-dock-random');
    btnDockRandom?.addEventListener('click', () => {
      this.triggerProceduralFlythrough();
    });

    // Collapsible keyframe footer (starts collapsed on small screens to free up space)
    const kfFooter = document.getElementById('drawer-global-footer');
    const kfToggle = document.getElementById('btn-toggle-kf');
    const setKfCollapsed = (collapsed: boolean) => {
      kfFooter?.classList.toggle('collapsed', collapsed);
      kfToggle?.setAttribute('aria-expanded', String(!collapsed));
    };
    setKfCollapsed(window.innerWidth <= 720);
    kfToggle?.addEventListener('click', () => {
      setKfCollapsed(!kfFooter?.classList.contains('collapsed'));
    });

    updateDisplays();
    this.updateGlyphs();
    this.populateFormulaParams();
    this.refreshGlobalKeyframeTrack();
    this.setupAutoHide();
  }

  private autoHideTimer: number | null = null;
  private isHudFaded: boolean = false;

  private setupAutoHide() {
    const hudContainer = document.getElementById('hud-container');
    if (!hudContainer) return;

    const wakeHUD = () => {
      if (this.isHudFaded) {
        this.isHudFaded = false;
        hudContainer.classList.remove('hud-faded');
      }
      this.resetAutoHideTimer();
    };

    // Listen to user touches, pointer interactions, clicks, keyboard navigation, and mouse motion
    window.addEventListener('touchstart', wakeHUD, { passive: true });
    window.addEventListener('touchmove', wakeHUD, { passive: true });
    window.addEventListener('pointerdown', wakeHUD, { passive: true });
    window.addEventListener('pointermove', wakeHUD, { passive: true });
    window.addEventListener('keydown', wakeHUD, { passive: true });
    window.addEventListener('wheel', wakeHUD, { passive: true });

    this.resetAutoHideTimer();
  }

  public resetAutoHideTimer() {
    if (this.autoHideTimer !== null) {
      window.clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    // If debug screen is ON, auto hide is disabled
    if (this.isDebugMode) return;

    // Auto-hide all onscreen HUD elements after 3.5 seconds of inactivity
    this.autoHideTimer = window.setTimeout(() => {
      if (this.isDebugMode) return;
      const drawer = document.getElementById('settings-drawer');
      const drawerOpen = drawer && !drawer.classList.contains('closed');
      const popoverOpen = document.querySelector('.studio-popover:not(.closed)');
      // Do not hide if user has an active menu, drawer, or popover open
      if (!drawerOpen && !popoverOpen) {
        this.isHudFaded = true;
        document.getElementById('hud-container')?.classList.add('hud-faded');
      }
    }, 3500);
  }

  public updateActiveGlobalKeyframe(triggerBtn?: HTMLElement | null) {
    const f = this.getActiveFormula();
    const frames = this.keyframeEngine.getFramesFor(f.id);
    if (frames.length === 0) return;

    let targetId = this.selectedKeyframeId;
    if (!targetId || !frames.some(k => k.id === targetId)) {
      targetId = frames[frames.length - 1].id;
      this.selectedKeyframeId = targetId;
    }

    const fallbackCam: CameraSnapshot = { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
    const cam = this.getCameraSnapshot ? this.getCameraSnapshot() : fallbackCam;
    const vals = this.getAllValues();

    const success = this.keyframeEngine.updateKeyframe(
      targetId,
      cam,
      vals,
      this.currentPalette,
      this.activePaletteIndex
    );
    if (success) {
      if (triggerBtn) {
        triggerBtn.classList.add('updated-flash');
        setTimeout(() => triggerBtn.classList.remove('updated-flash'), 600);
      }
      this.refreshGlobalKeyframeTrack();
    }
  }

  private initKeyframeEngine() {
    this.keyframeEngine.onTrackChange = () => {
      this.refreshGlobalKeyframeTrack();
    };

    this.keyframeEngine.onApplyState = (camera, values, palette, paletteIndex) => {
      this.onApplyKeyframeCamera?.(camera);
      this.applyAllValues(values, palette, paletteIndex);
      this.onSettingChange?.();
      this.highlightPlayingChip();
    };

    this.keyframeEngine.onCycleComplete = () => {
      if (this.tourActive) {
        this.advanceTour();
      } else if (this.isRandomMode) {
        this.advanceRandomFormula();
      }
    };
  }

  private lastPlayingIndex = -2;

  // Highlights the keyframe chip the loop is currently at/heading to, without rebuilding the DOM
  private highlightPlayingChip() {
    const strip = document.getElementById('kf-strip-global');
    if (!strip) return;
    const f = this.getActiveFormula();
    const playing = this.keyframeEngine.isPlaying && this.keyframeEngine.playingFormulaId === f.id;
    const idx = playing ? this.keyframeEngine.activeIndex : -1;
    const nowBadge = document.getElementById('kf-now-badge');
    if (nowBadge) {
      const total = this.keyframeEngine.getFramesFor(f.id).length;
      if (idx >= 0) {
        nowBadge.textContent = this.isRandomMode ? `🎲 #${idx + 1}/${total}` : `▶ #${idx + 1}/${total}`;
      } else {
        nowBadge.textContent = '';
      }
    }
    if (idx !== this.lastPlayingIndex) {
      this.lastPlayingIndex = idx;
      Array.from(strip.children).forEach((el, i) => el.classList.toggle('playing', i === idx));
    }
  }

  public toggleStoredLoopForActiveFormula() {
    const f = this.getActiveFormula();
    // Pressing play while the tour, random mode, or a loop is running pauses everything
    if (this.tourActive || this.isRandomMode || (this.keyframeEngine.isPlaying && this.keyframeEngine.playingFormulaId === f.id)) {
      this.stopTour();
      return;
    }
    const frames = this.keyframeEngine.getFramesFor(f.id);

    // If no loop is stored yet for this object, automatically seed a gentle cinematic orbit loop!
    if (frames.length < 2) {
      const fallbackCam: CameraSnapshot = { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
      const curCam = this.getCameraSnapshot ? this.getCameraSnapshot() : fallbackCam;
      const allVals = this.getAllValues();

      // Keyframe 1: current state
      this.keyframeEngine.addKeyframe(f.id, curCam, allVals, this.currentPalette, this.activePaletteIndex);

      // Keyframe 2: cinematic orbit angle around target
      const dist = curCam.orbitRadius || 2.5;
      const yaw = Math.atan2(curCam.pos[0] - curCam.target[0], curCam.pos[2] - curCam.target[2]) + 0.85;
      const pitch = Math.asin(Math.max(-0.85, Math.min(0.85, (curCam.pos[1] - curCam.target[1]) / dist))) + 0.12;
      const cosP = Math.cos(pitch);

      const orbitCam: CameraSnapshot = {
        pos: [
          curCam.target[0] + dist * cosP * Math.sin(yaw),
          curCam.target[1] + dist * Math.sin(pitch),
          curCam.target[2] + dist * cosP * Math.cos(yaw)
        ],
        target: [...curCam.target],
        up: [0, 1, 0],
        orbitRadius: dist
      };
      this.keyframeEngine.addKeyframe(f.id, orbitCam, allVals, this.currentPalette, this.activePaletteIndex);
    }

    this.tourActive = true;
    this.keyframeEngine.cycleAtLastKeyframe = true;
    this.keyframeEngine.segmentDuration = this.tourSegmentDuration(f.id);
    this.keyframeEngine.play(f.id);
    this.refreshGlobalKeyframeTrack();
  }

  // ---- Auto-play tour: play each formula's stored loop one after another until the user pauses ----
  private tourActive = false;
  private tourTimer: number | null = null;

  /** Pace each formula so a whole pass takes roughly 35-45s regardless of how many keyframes it has */
  private tourSegmentDuration(formulaId: string): number {
    const n = this.keyframeEngine.getFramesFor(formulaId).length;
    return Math.max(3.0, Math.min(6.0, 40 / Math.max(1, n - 1)));
  }

  /** Starts the tour automatically on launch (no-op if the current formula has no loop or something is already playing) */
  public autoStartTour() {
    if (this.tourActive || this.keyframeEngine.isPlaying) return;
    const f = this.getActiveFormula();
    const frames = this.keyframeEngine.getFramesFor(f.id);
    if (frames.length < 2) return;

    this.tourActive = true;
    this.keyframeEngine.cycleAtLastKeyframe = true;
    this.keyframeEngine.segmentDuration = this.tourSegmentDuration(f.id);
    const intro = 1.2;
    this.transitionToGlobalKeyframe(frames[0], intro);
    this.refreshGlobalKeyframeTrack();
    this.tourTimer = window.setTimeout(() => {
      this.tourTimer = null;
      if (!this.tourActive) return;
      this.keyframeEngine.play(f.id);
      this.warmNextTourFormula();
      this.refreshGlobalKeyframeTrack();
    }, intro * 1000 + 60);
  }

  /** Called when the user drags / pinches / scrolls the camera: hand control back by pausing playback */
  public pauseTourOnInteract() {
    if (this.isRandomMode) {
      // In Random Mode, user zoom/pan/rotate is preserved live while the flythrough continues!
      return;
    }
    if (this.tourActive || this.keyframeEngine.isPlaying) this.stopTour();
  }

  public stopTour() {
    this.tourActive = false;
    this.isRandomMode = false;
    this.keyframeEngine.cycleAtLastKeyframe = false;
    this.keyframeEngine.segmentDuration = 4.5;
    if (this.tourTimer !== null) {
      clearTimeout(this.tourTimer);
      this.tourTimer = null;
    }
    if (this.activeTween !== null) {
      cancelAnimationFrame(this.activeTween);
      this.activeTween = null;
    }
    this.keyframeEngine.stop();
    this.refreshGlobalKeyframeTrack();
  }

  /** Launches the studio directly into autonomous procedural random exploration */
  public autoStartRandom() {
    if (this.tourActive || this.keyframeEngine.isPlaying) return;
    this.triggerProceduralFlythrough(false);
  }

  private refillRandomDeck() {
    const total = this.formulaList.length;
    const indices: number[] = [];
    for (let i = 0; i < total; i++) {
      indices.push(i);
    }
    // Fisher-Yates true random shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    if (indices[0] === this.activeFormulaIndex && indices.length > 1) {
      [indices[0], indices[1]] = [indices[1], indices[0]];
    }
    this.randomDeck = indices;
  }

  public getNextRandomFormulaIndex(): number {
    if (this.randomDeck.length === 0) {
      this.refillRandomDeck();
    }
    return this.randomDeck.shift() ?? Math.floor(Math.random() * this.formulaList.length);
  }

  /** Generates and launches an infinite, seamless procedural flythrough that weaves through interior gaps */
  public triggerProceduralFlythrough(pickNew: boolean = false) {
    const btnDockRandom = document.getElementById('btn-dock-random');
    btnDockRandom?.classList.remove('rolling');
    void btnDockRandom?.offsetWidth;
    btnDockRandom?.classList.add('rolling');
    setTimeout(() => btnDockRandom?.classList.remove('rolling'), 700);

    // If random mode is already running or pickNew requested, jump directly to a fresh random formula!
    if (pickNew || (this.isRandomMode && this.keyframeEngine.isPlaying)) {
      this.advanceRandomFormula();
      return;
    }

    const f = this.getActiveFormula();
    const curParams = this.getDynamicParams();
    const randomPalIdx = Math.floor(Math.random() * PALETTES.length);
    const loop = ProceduralFlythrough.generateLoop(f, curParams, randomPalIdx);

    // Stop tour if running
    this.tourActive = false;
    if (this.tourTimer !== null) {
      clearTimeout(this.tourTimer);
      this.tourTimer = null;
    }
    if (this.activeTween !== null) {
      cancelAnimationFrame(this.activeTween);
      this.activeTween = null;
    }

    // Install procedural track in keyframe engine
    this.keyframeEngine.replaceTrackForFormula(f.id, loop);
    this.keyframeEngine.segmentDuration = 6.5; // Smooth, gradual, cinematic pacing
    this.keyframeEngine.cycleAtLastKeyframe = true; // Auto-cycle to next random formula when complete!
    this.isRandomMode = true;

    // Smoothly transition into the first waypoint aligned with segmentDuration
    const firstFrame = loop[0];
    const glideDuration = this.keyframeEngine.segmentDuration;
    this.transitionToGlobalKeyframe(firstFrame, glideDuration, () => {
      if (!this.isRandomMode) return;
      this.keyframeEngine.play(f.id);
      this.warmNextRandomFormula();
      this.refreshGlobalKeyframeTrack();
    });
    this.refreshGlobalKeyframeTrack();
  }

  private advanceRandomFormula() {
    this.isRandomMode = true;
    this.keyframeEngine.stop();

    // Pull next formula from the true random shuffle deck
    const nextIdx = this.getNextRandomFormulaIndex();
    const nextFormula = this.formulaList[nextIdx];

    this.onWarmFormula?.(nextFormula);
    const proceed = () => {
      this.tourTimer = null;
      if (!this.isRandomMode) return;
      if (this.isFormulaReady && !this.isFormulaReady(nextFormula)) {
        this.tourTimer = window.setTimeout(proceed, 100);
        return;
      }
      this.beginRandomFormulaTransition(nextIdx);
    };
    proceed();
  }

  private beginRandomFormulaTransition(nextIdx: number) {
    this.selectFormula(nextIdx, true);
    const f = this.formulaList[nextIdx];
    const curParams = this.getDynamicParams();
    const randomPalIdx = Math.floor(Math.random() * PALETTES.length);
    const loop = ProceduralFlythrough.generateLoop(f, curParams, randomPalIdx);

    this.keyframeEngine.replaceTrackForFormula(f.id, loop);
    this.keyframeEngine.segmentDuration = 6.5;
    this.keyframeEngine.cycleAtLastKeyframe = true; // Auto-cycle to next random formula!

    const firstFrame = loop[0];
    // Keep formula-to-formula transitions aligned with in-formula motions (6.5s) for seamless, smooth pacing
    const duration = this.keyframeEngine.segmentDuration;
    this.transitionToGlobalKeyframe(firstFrame, duration, () => {
      if (!this.isRandomMode) return;
      this.keyframeEngine.play(f.id);
      this.warmNextRandomFormula();
      this.refreshGlobalKeyframeTrack();
    });
    this.refreshGlobalKeyframeTrack();
  }

  private warmNextRandomFormula() {
    if (this.randomDeck.length > 0) {
      this.onWarmFormula?.(this.formulaList[this.randomDeck[0]]);
    }
  }

  private advanceTour() {
    const next = this.nextTourIndex();
    // Only one formula has a loop: the engine simply keeps looping it
    if (next === -1 || next === this.activeFormulaIndex) return;

    this.keyframeEngine.stop();
    const nextFormula = this.formulaList[next];
    this.onWarmFormula?.(nextFormula);
    const proceed = () => {
      this.tourTimer = null;
      if (!this.tourActive) return;
      // Never switch to a shader that is still compiling (it would stall a frame mid-transition)
      if (this.isFormulaReady && !this.isFormulaReady(nextFormula)) {
        this.tourTimer = window.setTimeout(proceed, 120);
        return;
      }
      this.beginTourTransition(next);
    };
    proceed();
  }

  /** Index of the formula the tour visits after the current one (follows TOUR_ORDER), or -1 if none has a loop */
  private nextTourIndex(): number {
    const order = buildTourOrder(this.formulaList.length);
    const pos = Math.max(0, order.indexOf(this.activeFormulaIndex));
    for (let step = 1; step <= order.length; step++) {
      const i = order[(pos + step) % order.length];
      if (this.keyframeEngine.getFramesFor(this.formulaList[i].id).length >= 2) return i;
    }
    return -1;
  }

  /** Pre-compile the shader of the formula the tour will visit next, so the switch is instant */
  private warmNextTourFormula() {
    const i = this.nextTourIndex();
    if (i >= 0) this.onWarmFormula?.(this.formulaList[i]);
  }

  private beginTourTransition(next: number) {
    this.selectFormula(next, true);
    const first = this.keyframeEngine.getFramesFor(this.formulaList[next].id)[0];
    const duration = this.keyframeEngine.segmentDuration;
    this.transitionToGlobalKeyframe(first, duration, () => {
      if (!this.tourActive) return;
      this.keyframeEngine.segmentDuration = this.tourSegmentDuration(this.getActiveFormula().id);
      this.keyframeEngine.play(this.getActiveFormula().id);
      this.warmNextTourFormula();
      this.refreshGlobalKeyframeTrack();
    });
    this.refreshGlobalKeyframeTrack();
  }

  public refreshGlobalKeyframeTrack() {
    const f = this.getActiveFormula();
    const frames = this.keyframeEngine.getFramesFor(f.id);
    const isPlaying = (this.keyframeEngine.isPlaying && this.keyframeEngine.playingFormulaId === f.id) || this.tourActive;
    const countEl = document.getElementById('kf-count-global');
    if (countEl) {
      countEl.textContent = `${frames.length} Frame${frames.length === 1 ? '' : 's'}`;
    }

    // Sync Drawer Loop button
    const playBtn = document.getElementById('btn-play-global') as HTMLButtonElement | null;
    if (playBtn) {
      playBtn.disabled = frames.length < 2 && !isPlaying;
      playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Loop';
      playBtn.classList.toggle('active', isPlaying);
    }

    // Sync Dock Play button
    const dockPlayBtn = document.getElementById('btn-dock-play') as HTMLButtonElement | null;
    if (dockPlayBtn) {
      dockPlayBtn.classList.toggle('active', isPlaying);
      dockPlayBtn.setAttribute('aria-pressed', String(isPlaying));
      dockPlayBtn.title = isPlaying ? 'Pause Stored Loop' : 'Play Stored Loop for Selected Object';
      const playIcon = dockPlayBtn.querySelector('.play-icon') as HTMLElement | null;
      const pauseIcon = dockPlayBtn.querySelector('.pause-icon') as HTMLElement | null;
      if (playIcon && pauseIcon) {
        playIcon.style.display = isPlaying ? 'none' : 'block';
        pauseIcon.style.display = isPlaying ? 'block' : 'none';
      }
    }

    // Sync Dock Random (Dice) button
    const btnDockRandom = document.getElementById('btn-dock-random') as HTMLButtonElement | null;
    if (btnDockRandom) {
      const isRandomActive = this.isRandomMode && isPlaying;
      btnDockRandom.classList.toggle('active', isRandomActive);
      btnDockRandom.setAttribute('aria-pressed', String(isRandomActive));
      btnDockRandom.title = isRandomActive
        ? 'Procedural Flythrough Running (Click to re-roll new path)'
        : 'Random Procedural Flythrough (Roll Dice)';
    }

    const updateBtn = document.getElementById('btn-update-global') as HTMLButtonElement | null;
    if (updateBtn) {
      updateBtn.disabled = frames.length === 0;
    }

    const strip = document.getElementById('kf-strip-global');
    if (strip) {
      strip.innerHTML = '';
      frames.forEach((kf, idx) => {
        const chip = document.createElement('div');
        const isSelected = this.selectedKeyframeId === kf.id;
        chip.className = `keyframe-chip${isSelected ? ' active' : ''}`;
        chip.dataset.keyframeId = kf.id;
        chip.innerHTML = `
          <span class="kf-chip-label" title="Jump to & Smoothly Transition to Keyframe #${idx + 1}">#${idx + 1}</span>
          <button class="kf-chip-update" title="Update Keyframe #${idx + 1} with current full scene">↺</button>
          <button class="kf-chip-del" title="Delete Keyframe">✕</button>
        `;

        // Smooth transition to keyframe when clicked
        chip.querySelector('.kf-chip-label')!.addEventListener('click', () => {
          this.selectedKeyframeId = kf.id;
          this.transitionToGlobalKeyframe(kf, 0.75);
          this.refreshGlobalKeyframeTrack();
        });

        // In-place update keyframe
        chip.querySelector('.kf-chip-update')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedKeyframeId = kf.id;
          const fallbackCam: CameraSnapshot = { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
          const cam = this.getCameraSnapshot ? this.getCameraSnapshot() : fallbackCam;
          const vals = this.getAllValues();
          this.keyframeEngine.updateKeyframe(
            kf.id,
            cam,
            vals,
            this.currentPalette,
            this.activePaletteIndex
          );

          chip.classList.add('updated-flash');
          setTimeout(() => chip.classList.remove('updated-flash'), 600);

          const headerUpdateBtn = document.getElementById('btn-update-global');
          if (headerUpdateBtn) {
            headerUpdateBtn.classList.add('updated-flash');
            setTimeout(() => headerUpdateBtn.classList.remove('updated-flash'), 600);
          }
        });

        // Delete keyframe
        chip.querySelector('.kf-chip-del')!.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.selectedKeyframeId === kf.id) {
            this.selectedKeyframeId = null;
          }
          this.keyframeEngine.removeKeyframe(kf.id);
        });

        strip.appendChild(chip);
      });
      this.lastPlayingIndex = -2;
      this.highlightPlayingChip();
    }
  }

  public getAllValues(): Record<string, number> {
    const paramIds = new Set(this.getActiveFormula().params.map(p => p.id));
    const dyn: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.dynamicParamValues)) {
      if (paramIds.has(k)) dyn[k] = v;
    }
    return {
      ...dyn,
      ...this.getTabValues('tab-optics'),
      ...this.getTabValues('tab-materials'),
      ...this.getTabValues('tab-lighting')
    };
  }

  public applyAllValues(
    values: Record<string, number>,
    palette?: PalettePreset,
    paletteIndex?: number
  ) {
    this.applyTabValues('tab-optics', values);
    this.applyTabValues('tab-materials', values);
    this.applyTabValues('tab-lighting', values);
    this.applyTabValues('tab-params', values);

    if (palette) {
      this.currentPalette = {
        id: palette.id,
        name: palette.name,
        a: [...palette.a],
        b: [...palette.b],
        c: [...palette.c],
        d: [...palette.d]
      };
      this.updatePaletteSwatch();
    }
    if (paletteIndex !== undefined && paletteIndex >= 0 && paletteIndex < PALETTES.length) {
      this.activePaletteIndex = paletteIndex;
      const label = document.getElementById('current-palette-label');
      if (label) label.textContent = this.currentPalette.name || PALETTES[paletteIndex].name;
      const select = document.getElementById('material-dropdown-select') as HTMLSelectElement | null;
      if (select && select.value !== String(paletteIndex)) {
        select.value = String(paletteIndex);
      }
      this.updatePopoverActiveStates();
    }
  }

  public getTabValues(tabId: string): Record<string, any> {
    if (tabId === 'tab-optics') {
      return {
        focalDistance: this.settings.focalDistance,
        aperture: this.settings.aperture,
        bloomIntensity: this.settings.bloomIntensity,
        exposure: this.settings.exposure
      };
    } else if (tabId === 'tab-materials') {
      return {
        ior: this.settings.ior,
        dispersion: this.settings.dispersion,
        subsurface: this.settings.subsurface,
        emissiveVeins: this.settings.emissiveVeins
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
        godraysIntensity: this.settings.godraysIntensity,
        orbEnabled: this.settings.orbEnabled,
        orbIntensity: this.settings.orbIntensity,
        orbSpeed: this.settings.orbSpeed,
        orbRadius: this.settings.orbRadius,
        orbTail: this.settings.orbTail,
        orbPreset: this.settings.orbPreset
      };
    } else if (tabId === 'tab-params') {
      return this.getDynamicParams();
    }
    return {};
  }

  public applyTabValues(tabId: string, values: Record<string, any>) {
    if (tabId === 'tab-optics') {
      if (values.focalDistance !== undefined) this.setRangeValue('param-focal-dist', 'val-focal-dist', this.settings.focalDistance = values.focalDistance);
      if (values.aperture !== undefined) this.setRangeValue('param-aperture', 'val-aperture', this.settings.aperture = values.aperture);
      if (values.bloomIntensity !== undefined) this.setRangeValue('param-bloom', 'val-bloom', this.settings.bloomIntensity = values.bloomIntensity);
      if (values.exposure !== undefined) this.setRangeValue('param-exposure', 'val-exposure', this.settings.exposure = values.exposure);
    } else if (tabId === 'tab-materials') {
      if (values.ior !== undefined) this.setRangeValue('param-mat-ior', 'val-mat-ior', this.settings.ior = values.ior);
      if (values.dispersion !== undefined) this.setRangeValue('param-mat-dispersion', 'val-mat-dispersion', this.settings.dispersion = values.dispersion);
      if (values.subsurface !== undefined) this.setRangeValue('param-mat-sss', 'val-mat-sss', this.settings.subsurface = values.subsurface);
      if (values.emissiveVeins !== undefined) this.setRangeValue('param-mat-emissive', 'val-mat-emissive', this.settings.emissiveVeins = values.emissiveVeins);
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
      if (values.orbEnabled !== undefined) {
        this.settings.orbEnabled = values.orbEnabled;
        this.updateOrbToggleUI(this.settings.orbEnabled);
      }
      if (values.orbPreset !== undefined) {
        this.settings.orbPreset = values.orbPreset;
        const presetEl = document.getElementById('param-orb-preset') as HTMLSelectElement | null;
        if (presetEl) presetEl.value = values.orbPreset;
      }
      if (values.orbIntensity !== undefined) this.setRangeValue('param-orb-intensity', 'val-orb-intensity', this.settings.orbIntensity = values.orbIntensity);
      if (values.orbSpeed !== undefined) this.setRangeValue('param-orb-speed', 'val-orb-speed', this.settings.orbSpeed = values.orbSpeed);
      if (values.orbRadius !== undefined) this.setRangeValue('param-orb-radius', 'val-orb-radius', this.settings.orbRadius = values.orbRadius);
      if (values.orbTail !== undefined) this.setRangeValue('param-orb-tail', 'val-orb-tail', this.settings.orbTail = values.orbTail);
    } else if (tabId === 'tab-params') {
      // In Random Mode, keep user's live formula parameters intact during flythrough
      if (this.isRandomMode) return;
      // Only apply keys that belong to the active formula's parameters. Writing other keys
      // (lighting, optics...) into dynamicParamValues would shadow live slider values in getAllValues().
      const paramIds = new Set(this.getActiveFormula().params.map(p => p.id));
      for (const [key, val] of Object.entries(values)) {
        if (!paramIds.has(key)) continue;
        const input = document.getElementById(`dyn-param-${key}`) as HTMLInputElement;
        // Never overwrite a slider while the user is actively focusing or adjusting it
        if (input && document.activeElement === input) continue;
        this.dynamicParamValues[key] = val;
        const disp = document.getElementById(`dyn-val-${key}`);
        if (input) input.value = String(val);
        if (disp) {
          const isInt = this.getActiveFormula().params.find(p => p.id === key)?.type === 'int';
          disp.textContent = isInt ? Math.round(val).toString() : val.toFixed(3);
        }
      }
    }
  }

  private setRangeValue(id: string, dispId: string, val: number, suffix = '') {
    const el = document.getElementById(id) as HTMLInputElement;
    const disp = document.getElementById(dispId);
    if (el) {
      el.value = String(val);
    }
    if (disp) {
      const decimals = suffix === '°' ? 1 : (Math.abs(val) < 0.1 ? 3 : 2);
      disp.textContent = val.toFixed(decimals) + suffix;
    }
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

  public async copyTabSettings(tabId: string, btn?: HTMLButtonElement) {
    const vals = this.getTabValues(tabId);
    const text = JSON.stringify(vals, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (btn) {
        const origText = btn.innerHTML;
        btn.innerHTML = `<span>Copied ✓</span>`;
        btn.classList.add('saved-active');
        setTimeout(() => {
          btn.innerHTML = origText;
          btn.classList.remove('saved-active');
        }, 1800);
      }
    } catch {
      // Ignore
    }
  }

  public async pasteTabSettings(tabId: string, btn?: HTMLButtonElement) {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      } else {
        const promptVal = prompt('Paste JSON settings:');
        if (promptVal) text = promptVal;
      }
      if (!text) return;
      const data = JSON.parse(text);
      if (typeof data === 'object' && data !== null) {
        this.applyTabValues(tabId, data);
        this.onSettingChange?.();
        if (btn) {
          const origText = btn.innerHTML;
          btn.innerHTML = `<span>Pasted ✓</span>`;
          btn.classList.add('saved-active');
          setTimeout(() => {
            btn.innerHTML = origText;
            btn.classList.remove('saved-active');
          }, 1800);
        }
      }
    } catch {
      if (btn) {
        const origText = btn.innerHTML;
        btn.innerHTML = `<span style="color:#ef4444">Invalid</span>`;
        setTimeout(() => {
          btn.innerHTML = origText;
        }, 1500);
      }
    }
  }

  public resetTabDefaults(tabId: string) {
    const key = tabId === 'tab-params'
      ? `fractal_v2_defaults_formula_${this.getActiveFormula().id}`
      : `fractal_v2_defaults_${tabId}`;

    try {
      localStorage.removeItem(key);
      if (tabId === 'tab-optics') {
        this.applyTabValues('tab-optics', { focalDistance: 2.35, aperture: 0.0, bloomIntensity: 0.25, exposure: 1.0 });
      } else if (tabId === 'tab-materials') {
        this.applyTabValues('tab-materials', { ior: 1.45, dispersion: 0.0, subsurface: 0.2, emissiveVeins: 0.0 });
      } else if (tabId === 'tab-lighting') {
        this.applyTabValues('tab-lighting', { sunIntensity: 1.0, rimIntensity: 0.32, rimElevation: 30, fillIntensity: 0.38, glowIntensity: 0.35, lightAzimuth: 45, lightElevation: 48, fogDensity: 0.03, godraysIntensity: 0.0 });
      } else if (tabId === 'tab-params') {
        this.populateFormulaParams();
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

      const materials = localStorage.getItem('fractal_v2_defaults_tab-materials');
      if (materials) Object.assign(this.settings, JSON.parse(materials));

      const lighting = localStorage.getItem('fractal_v2_defaults_tab-lighting');
      if (lighting) Object.assign(this.settings, JSON.parse(lighting));
    } catch {
      // Ignore
    }
  }

  private setupPopovers() {
    const formulaPopover = document.getElementById('formula-popover')!;
    const palettePopover = document.getElementById('palette-popover')!;
    const btnFormulaSelect = document.getElementById('btn-select-formula')!;
    const btnPaletteSelect = document.getElementById('btn-select-palette');
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
          <span class="card-text">
            <span class="card-row-top">
              <span class="card-num">${idx + 1}.</span>
              <span class="card-name">${f.name}</span>
            </span>
            <span class="card-subtitle">${f.subtitle}</span>
          </span>
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

    btnPaletteSelect?.addEventListener('click', (e) => {
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

    // Debug mode toggle (Keystroke 'D')
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        this.toggleDebugMode();
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

  private updateGlyphs() {
    const f = this.getActiveFormula();
    const glyph = document.getElementById('formula-glyph');
    if (glyph) glyph.innerHTML = formulaGlyphSVG(f.id, this.activeFormulaIndex);
    this.updatePaletteSwatch();
  }

  private updatePaletteSwatch() {
    const sw = document.getElementById('palette-swatch');
    if (sw) sw.style.background = paletteGradientCSS(this.currentPalette);
  }

  public selectFormula(index: number, fromTour = false) {
    // Manually switching formula pauses the auto-play tour
    if (!fromTour && (this.tourActive || this.keyframeEngine.isPlaying)) {
      this.stopTour();
    }
    this.activeFormulaIndex = index;
    const f = this.getActiveFormula();
    this.updateGlyphs();
    const labelFormula = document.getElementById('current-formula-label');
    if (labelFormula) {
      labelFormula.textContent = `${this.activeFormulaIndex + 1}. ${f.name}`;
    }

    this.syncFormulaDropdown();

    this.updatePopoverActiveStates();
    this.selectedKeyframeId = null;
    this.populateFormulaParams();
    this.refreshGlobalKeyframeTrack();
    this.updateDebugOverlay();
    this.onFormulaChange?.(f, fromTour);
  }

  public selectPalette(index: number) {
    this.activePaletteIndex = index;
    const pal = PALETTES[index] || PALETTES[0];
    this.currentPalette = {
      id: pal.id,
      name: pal.name,
      a: [...pal.a],
      b: [...pal.b],
      c: [...pal.c],
      d: [...pal.d]
    };

    const labelPalette = document.getElementById('current-palette-label');
    if (labelPalette) {
      labelPalette.textContent = pal.name;
    }

    const matDropdown = document.getElementById('material-dropdown-select') as HTMLSelectElement | null;
    if (matDropdown && matDropdown.value !== String(index)) {
      matDropdown.value = String(index);
    }

    this.updatePopoverActiveStates();
    this.updatePaletteSwatch();
    this.updateDebugOverlay();
    this.onPaletteChange?.(this.currentPalette);
  }

  private activeTween: number | null = null;

  public transitionToGlobalKeyframe(
    targetKf: Keyframe,
    durationSec: number = 0.75,
    onComplete?: () => void
  ) {
    if (this.activeTween !== null) {
      cancelAnimationFrame(this.activeTween);
      this.activeTween = null;
    }

    const startCam: CameraSnapshot = this.getCameraSnapshot
      ? this.getCameraSnapshot()
      : { pos: [0, 0, 2.5], target: [0, 0, 0], up: [0, 1, 0], orbitRadius: 2.5 };
    const targetCam = targetKf.camera;

    const startPal = { ...this.getActivePalette() };
    const targetPal = targetKf.palette;

    const startValues = this.getAllValues();
    const targetValues = targetKf.values;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsedSec = (now - startTime) / 1000.0;
      const rawT = Math.min(1.0, elapsedSec / durationSec);
      // Momentum-preserving ease: keeps positive forward velocity (0.35 * cruise speed) at boundaries
      // so the camera never hits a sudden dead stop or abruptly lurches forward
      const cosineEase = 0.5 * (1.0 - Math.cos(Math.PI * rawT));
      const t = 0.35 * rawT + 0.65 * cosineEase;

      // Lockstep shader crossfade blending synchronized to camera flight
      this.onTransitionProgress?.(Math.max(0.0, 1.0 - rawT), rawT >= 1.0);

      // 1. Direct 3D Euclidean camera interpolation: straight, silky glide from start to target pose
      // Eliminates orbital swings and lateral jumps at the onset of transitions
      const curPos: [number, number, number] = [
        startCam.pos[0] + (targetCam.pos[0] - startCam.pos[0]) * t,
        startCam.pos[1] + (targetCam.pos[1] - startCam.pos[1]) * t,
        startCam.pos[2] + (targetCam.pos[2] - startCam.pos[2]) * t
      ];
      const curTarget: [number, number, number] = [
        startCam.target[0] + (targetCam.target[0] - startCam.target[0]) * t,
        startCam.target[1] + (targetCam.target[1] - startCam.target[1]) * t,
        startCam.target[2] + (targetCam.target[2] - startCam.target[2]) * t
      ];
      const curUp = slerpVec3(startCam.up, targetCam.up, t);

      const curCam: CameraSnapshot = {
        pos: curPos,
        target: curTarget,
        up: curUp,
        orbitRadius: Math.hypot(curPos[0] - curTarget[0], curPos[1] - curTarget[1], curPos[2] - curTarget[2])
      };
      this.onApplyKeyframeCamera?.(curCam);

      // 2. Continuous direct Palette Vector interpolation (a, b, c, d)
      // Directly interpolates from Material 1 to Material 4 WITHOUT cycling through 2 and 3!
      const curPal: PalettePreset = {
        id: t < 0.5 ? startPal.id : targetPal.id,
        name: t < 0.5 ? startPal.name : targetPal.name,
        a: [
          startPal.a[0] + (targetPal.a[0] - startPal.a[0]) * t,
          startPal.a[1] + (targetPal.a[1] - startPal.a[1]) * t,
          startPal.a[2] + (targetPal.a[2] - startPal.a[2]) * t
        ],
        b: [
          startPal.b[0] + (targetPal.b[0] - startPal.b[0]) * t,
          startPal.b[1] + (targetPal.b[1] - startPal.b[1]) * t,
          startPal.b[2] + (targetPal.b[2] - startPal.b[2]) * t
        ],
        c: [
          startPal.c[0] + (targetPal.c[0] - startPal.c[0]) * t,
          startPal.c[1] + (targetPal.c[1] - startPal.c[1]) * t,
          startPal.c[2] + (targetPal.c[2] - startPal.c[2]) * t
        ],
        d: [
          startPal.d[0] + (targetPal.d[0] - startPal.d[0]) * t,
          startPal.d[1] + (targetPal.d[1] - startPal.d[1]) * t,
          startPal.d[2] + (targetPal.d[2] - startPal.d[2]) * t
        ]
      };

      // 3. Values interpolation across all tabs
      const curValues: Record<string, number> = {};
      const allKeys = new Set([...Object.keys(startValues), ...Object.keys(targetValues)]);
      for (const k of allKeys) {
        const sv = startValues[k] ?? targetValues[k] ?? 0;
        const tv = targetValues[k] ?? sv;
        curValues[k] = sv + (tv - sv) * t;
      }

      const activePalIdx = t < 0.5 ? this.activePaletteIndex : targetKf.paletteIndex;
      this.applyAllValues(curValues, curPal, activePalIdx);
      this.onSettingChange?.();

      if (rawT < 1.0) {
        this.activeTween = requestAnimationFrame(step);
      } else {
        this.activeTween = null;
        this.activePaletteIndex = targetKf.paletteIndex;
        this.currentPalette = { ...targetPal };
        const label = document.getElementById('current-palette-label');
        if (label) label.textContent = targetPal.name;
        const select = document.getElementById('material-dropdown-select') as HTMLSelectElement | null;
        if (select) select.value = String(targetKf.paletteIndex);
        this.updatePopoverActiveStates();
        onComplete?.();
      }
    };

    this.activeTween = requestAnimationFrame(step);
  }

  private bindRange(id: string, displayId: string, setter: (val: number) => void, suffix = '') {
    const el = document.getElementById(id) as HTMLInputElement;
    const disp = document.getElementById(displayId);
    if (!el || !disp) return;

    el.step = 'any';
    const min = parseFloat(el.min) || 0.0;
    const max = parseFloat(el.max) || 100.0;

    const updateDisplay = (val: number) => {
      const decimals = suffix === '°' ? 1 : 3;
      disp.textContent = val.toFixed(decimals) + suffix;
    };

    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      updateDisplay(val);
      setter(val);
      this.onSettingChange?.();
    });

    // Mouse wheel fine-step control (Shift for 5x fine micro-tuning)
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      const span = max - min;
      const baseStep = Math.max(0.001, span * 0.005);
      const stepSize = e.shiftKey ? baseStep * 0.2 : baseStep;
      const curVal = parseFloat(el.value);
      const nextVal = Math.max(min, Math.min(max, curVal + delta * stepSize));
      el.value = String(nextVal);
      updateDisplay(nextVal);
      setter(nextVal);
      this.onSettingChange?.();
    }, { passive: false });
  }

  public syncFormulaDropdown() {
    const formulaDropdown = document.getElementById('formula-dropdown-select') as HTMLSelectElement | null;
    if (!formulaDropdown) return;
    if (formulaDropdown.options.length === 0) {
      formulaDropdown.innerHTML = '';
      for (const group of FORMULA_GROUPS) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.name;
        for (const id of group.ids) {
          const f = FORMULAS[id];
          if (!f) continue;
          const idx = this.formulaList.findIndex(item => item.id === id);
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = `${idx + 1}. ${f.name}`;
          optgroup.appendChild(opt);
        }
        formulaDropdown.appendChild(optgroup);
      }
    }
    const currentId = this.getActiveFormula().id;
    if (formulaDropdown.value !== currentId) {
      formulaDropdown.value = currentId;
    }
  }

  public populateFormulaParams() {
    this.syncFormulaDropdown();
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
      this.dynamicParamValues[p.id] = currentVal;
      const isInt = p.type === 'int';
      const stepAttr = isInt ? '1' : 'any';
      const decimals = isInt ? 0 : 3;

      const row = document.createElement('div');
      row.className = 'control-row';
      row.innerHTML = `
        <label>${p.name}</label>
        <input type="range" min="${p.min}" max="${p.max}" step="${stepAttr}" value="${currentVal}" id="dyn-param-${p.id}" class="studio-slider">
        <span class="val-display" id="dyn-val-${p.id}">${isInt ? Math.round(currentVal).toString() : currentVal.toFixed(decimals)}</span>
      `;
      container.appendChild(row);

      const input = row.querySelector('input')!;
      const valDisp = row.querySelector('.val-display')!;

      input.addEventListener('input', () => {
        if (!this.isRandomMode && (this.tourActive || this.keyframeEngine.isPlaying)) {
          this.stopTour();
        }
        const v = parseFloat(input.value);
        this.dynamicParamValues[p.id] = v;
        valDisp.textContent = isInt ? Math.round(v).toString() : v.toFixed(decimals);
        this.onSettingChange?.();
      });

      // Mouse wheel fine-tuning on formula parameter sliders
      input.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!this.isRandomMode && (this.tourActive || this.keyframeEngine.isPlaying)) {
          this.stopTour();
        }
        const delta = e.deltaY < 0 ? 1 : -1;
        const span = p.max - p.min;
        const baseStep = isInt ? 1 : Math.max(0.001, span * 0.005);
        const stepSize = isInt ? 1 : (e.shiftKey ? baseStep * 0.2 : baseStep);
        const curVal = this.dynamicParamValues[p.id] ?? parseFloat(input.value);
        const nextVal = Math.max(p.min, Math.min(p.max, curVal + delta * stepSize));
        this.dynamicParamValues[p.id] = nextVal;
        input.value = String(nextVal);
        valDisp.textContent = isInt ? Math.round(nextVal).toString() : nextVal.toFixed(decimals);
        this.onSettingChange?.();
      }, { passive: false });
    }
  }

  public getDynamicParams(): Record<string, number> {
    return { ...this.dynamicParamValues };
  }

  public isDebugMode: boolean = false;

  public toggleDebugMode() {
    this.isDebugMode = !this.isDebugMode;
    const overlay = document.getElementById('debug-overlay');
    if (overlay) {
      if (this.isDebugMode) {
        overlay.classList.remove('hidden');
        this.updateDebugOverlay();
        // If debug screen is ON, auto hide is disabled: keep HUD visibly active
        this.isHudFaded = false;
        document.getElementById('hud-container')?.classList.remove('hud-faded');
        if (this.autoHideTimer !== null) {
          window.clearTimeout(this.autoHideTimer);
          this.autoHideTimer = null;
        }
      } else {
        overlay.classList.add('hidden');
        // Resume normal auto-hide behavior when debug mode is toggled off
        this.resetAutoHideTimer();
      }
    }
  }

  public updateDebugOverlay() {
    if (!this.isDebugMode) return;
    const f = this.getActiveFormula();
    const pal = this.getActivePalette();

    const fVal = document.getElementById('debug-formula-val');
    if (fVal) {
      fVal.textContent = `${this.activeFormulaIndex + 1}. ${f.name}`;
    }

    const mVal = document.getElementById('debug-material-val');
    if (mVal) {
      mVal.textContent = `${this.activePaletteIndex + 1}. ${pal.name}`;
    }
  }

  public updateStats(fps: number, _sampleCount: number) {
    const fpsCounter = document.getElementById('fps-counter');
    if (fpsCounter) fpsCounter.textContent = Math.round(fps).toString();
    if (this.isDebugMode) {
      const debugFps = document.getElementById('debug-fps-val');
      if (debugFps) debugFps.textContent = Math.round(fps).toString();
    }
  }

  public async cycleAudioSource() {
    const metrics = this.audioEngine.getMetrics();
    if (!metrics.active || metrics.source === 'off') {
      const ok = await this.audioEngine.enableMic();
      if (ok) {
        this.settings.audioEnabled = true;
      } else {
        this.audioEngine.enableSynth();
        this.settings.audioEnabled = true;
      }
    } else if (metrics.source === 'mic') {
      this.audioEngine.enableSynth();
      this.settings.audioEnabled = true;
    } else if (metrics.source === 'synth') {
      this.settings.audioEnabled = false;
      this.audioEngine.disable();
    } else if (metrics.source === 'file') {
      this.audioEngine.togglePlayPause();
    }
  }

  private setupAudioDragDrop() {
    const overlay = document.getElementById('audio-dropzone-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.remove('hidden');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0 && overlay) overlay.classList.add('hidden');
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (overlay) overlay.classList.remove('hidden');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (overlay) overlay.classList.add('hidden');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
          this.audioEngine.loadFile(file);
          this.settings.audioEnabled = true;
        }
      }
    });
  }

  public updateAudioVisualizer(metrics: AudioMetrics) {
    const chip = document.getElementById('chip-audio');
    const icon = document.getElementById('audio-icon');
    const label = document.getElementById('audio-label');
    const spec = document.getElementById('audio-spectrum-mini');
    const trackNameEl = document.getElementById('audio-track-name');
    const trackRow = document.getElementById('audio-track-info-row');

    if (!chip || !icon || !label) return;

    const SVG_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
    const SVG_MIC = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
    const SVG_FILE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
    const SVG_PAUSE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    const SVG_SYNTH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`;

    if (!metrics.active || metrics.source === 'off') {
      chip.classList.remove('active');
      icon.innerHTML = SVG_OFF;
      label.textContent = 'Audio: Off';
      if (spec) spec.style.display = 'none';
      if (trackRow) trackRow.style.display = 'none';
      this.updateAudioSourceButtons('off');
      return;
    }

    chip.classList.add('active');
    if (spec) spec.style.display = 'flex';

    if (metrics.source === 'mic') {
      icon.innerHTML = SVG_MIC;
      label.textContent = 'Audio: Mic';
      if (trackRow) trackRow.style.display = 'none';
      this.updateAudioSourceButtons('mic');
    } else if (metrics.source === 'file') {
      icon.innerHTML = metrics.isPlaying ? SVG_FILE : SVG_PAUSE;
      label.textContent = metrics.trackName ? `Audio: ${metrics.trackName}` : 'Audio: File';
      if (trackRow) {
        trackRow.style.display = 'flex';
        if (trackNameEl) trackNameEl.textContent = metrics.trackName || 'Loaded Track';
      }
      this.updateAudioSourceButtons('file');
    } else if (metrics.source === 'synth') {
      icon.innerHTML = SVG_SYNTH;
      label.textContent = 'Audio: Synth';
      if (trackRow) {
        trackRow.style.display = 'flex';
        if (trackNameEl) trackNameEl.textContent = 'Ambient Drone (Built-in)';
      }
      this.updateAudioSourceButtons('synth');
    }

    // Update spectrum bars
    const bBass = document.getElementById('spec-bar-bass');
    const bMid = document.getElementById('spec-bar-mid');
    const bTreb = document.getElementById('spec-bar-treble');
    const bBeat = document.getElementById('spec-bar-beat');

    if (bBass) bBass.style.height = `${Math.max(2, Math.round(metrics.bass * 14))}px`;
    if (bMid) bMid.style.height = `${Math.max(2, Math.round(metrics.mid * 14))}px`;
    if (bTreb) bTreb.style.height = `${Math.max(2, Math.round(metrics.treble * 14))}px`;
    if (bBeat) {
      const beatH = Math.max(2, Math.round(metrics.beat * 14));
      bBeat.style.height = `${beatH}px`;
      bBeat.style.opacity = `${0.3 + metrics.beat * 0.7}`;
    }

    // Update live horizontal VU meters in Sound Tab
    const vuBass = document.getElementById('vu-bar-bass');
    const vuMid = document.getElementById('vu-bar-mid');
    const vuTreb = document.getElementById('vu-bar-treb');
    const vuBeat = document.getElementById('vu-bar-beat');

    const vuValBass = document.getElementById('vu-val-bass');
    const vuValMid = document.getElementById('vu-val-mid');
    const vuValTreb = document.getElementById('vu-val-treb');
    const vuValBeat = document.getElementById('vu-val-beat');

    if (vuBass) vuBass.style.width = `${Math.round(metrics.bass * 100)}%`;
    if (vuMid) vuMid.style.width = `${Math.round(metrics.mid * 100)}%`;
    if (vuTreb) vuTreb.style.width = `${Math.round(metrics.treble * 100)}%`;
    if (vuBeat) vuBeat.style.width = `${Math.round(metrics.beat * 100)}%`;

    if (vuValBass) vuValBass.textContent = `${Math.round(metrics.bass * 100)}%`;
    if (vuValMid) vuValMid.textContent = `${Math.round(metrics.mid * 100)}%`;
    if (vuValTreb) vuValTreb.textContent = `${Math.round(metrics.treble * 100)}%`;
    if (vuValBeat) vuValBeat.textContent = metrics.beat > 0.4 ? 'BEAT!' : `${Math.round(metrics.beat * 100)}%`;
  }

  public applySoundPreset(p: {
    audioBreathing: number;
    audioGlow: number;
    audioColorShift: number;
    audioSensitivity: number;
  }) {
    this.settings.audioBreathing = p.audioBreathing;
    this.settings.audioGlow = p.audioGlow;
    this.settings.audioColorShift = p.audioColorShift;
    this.settings.audioSensitivity = p.audioSensitivity;

    this.setRangeValue('param-audio-breath', 'val-audio-breath', p.audioBreathing);
    this.setRangeValue('param-audio-glow', 'val-audio-glow', p.audioGlow);
    this.setRangeValue('param-audio-color', 'val-audio-color', p.audioColorShift);
    this.setRangeValue('param-audio-sens', 'val-audio-sens', p.audioSensitivity);
    this.onSettingChange?.();
  }

  private updateAudioSourceButtons(source: 'off' | 'mic' | 'file' | 'synth') {
    const ids = ['off', 'mic', 'file', 'synth'] as const;
    ids.forEach(s => {
      const btn = document.getElementById(`btn-audio-src-${s}`);
      if (btn) {
        if (s === source) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
  }
}

function clamp01(x: number): number {
  return Math.max(0.0, Math.min(1.0, x));
}

/** Deterministic pictorial emblem per formula: nested, twisting polygons tinted by its list position. */
export function formulaGlyphSVG(id: string, index: number): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  const sides = 3 + (h % 6);
  const twist = 0.12 + ((h >>> 8) % 40) / 100;
  const hue = (index * 37 + 200) % 360;
  let paths = '';
  const layers = 6;
  for (let l = 0; l < layers; l++) {
    const r = 17 * Math.pow(0.82, l);
    const rot = l * twist + ((h >>> 16) % 628) / 100;
    const pts: string[] = [];
    for (let s = 0; s < sides; s++) {
      const a = rot + (s / sides) * Math.PI * 2;
      pts.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`);
    }
    const light = 70 - l * 6;
    paths += `<polygon points="${pts.join(' ')}" fill="hsla(${hue},70%,${light}%,${0.06 + l * 0.02})" ` +
      `stroke="hsl(${hue},75%,${light}%)" stroke-width="1" stroke-opacity="${1 - l * 0.12}"/>`;
  }
  return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">${paths}` +
    `<circle cx="20" cy="20" r="1.4" fill="hsl(${hue},80%,80%)"/></svg>`;
}

function paletteGradientCSS(pal: PalettePreset): string {
  const twoPi = 6.2831853;
  const stops: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = 0.1 + (i / 4) * 0.8;
    const ch = (k: number) => Math.round(clamp01(pal.a[k] + pal.b[k] * Math.cos(twoPi * (pal.c[k] * t + pal.d[k]))) * 255);
    stops.push(`rgb(${ch(0)},${ch(1)},${ch(2)})`);
  }
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}
