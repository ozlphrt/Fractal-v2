// src/main.ts
// Main entry point for Fractal Studio v2

import { Raymarcher } from './renderer/Raymarcher.ts';
import { Camera } from './camera/Camera.ts';
import { OrbitController } from './camera/OrbitController.ts';
import { GamepadController } from './camera/GamepadController.ts';
import { HUD } from './ui/HUD.ts';

class App {
  private canvas: HTMLCanvasElement;
  private raymarcher: Raymarcher;
  private camera: Camera;
  private orbitController: OrbitController;
  private gamepadController: GamepadController;
  private hud: HUD;

  private lastTime: number = performance.now();
  private fps: number = 60.0;
  private currentOffsetX: number = 0;
  private currentOffsetY: number = 0;
  private prevBaseCam: { pos: [number, number, number]; target: [number, number, number] } | null = null;

  constructor() {
    this.canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    this.raymarcher = new Raymarcher(this.canvas);
    this.hud = new HUD();

    const initialFormula = this.hud.getActiveFormula();
    this.camera = new Camera(
      initialFormula.defaultCam.pos,
      initialFormula.defaultCam.target
    );

    this.orbitController = new OrbitController(this.camera, this.canvas);
    this.gamepadController = new GamepadController(this.camera, this.orbitController, this.hud);

    this.setupHUDListeners();
    this.setupWindowListeners();
    this.startLoop();

    // Grabbing the camera or using gamepad takes control back from the auto-play tour
    this.orbitController.onUserInteract = () => this.hud.pauseTourOnInteract();
    this.gamepadController.onInteract = () => this.hud.pauseTourOnInteract();

    // Auto-play in autonomous Random Mode on launch (starts on a random formula with procedural flythrough)
    setTimeout(() => this.hud.autoStartRandom(), 900);

    // Pre-compile every other formula's shader in the background so formula switches never hitch
    this.hud.onWarmFormula = (f) => this.raymarcher.warm(f);
    this.hud.isFormulaReady = (f) => this.raymarcher.isReady(f);
    this.hud.getAllFormulas().forEach((f, i) => setTimeout(() => this.raymarcher.warm(f), 2500 + i * 600));
  }

  private setupHUDListeners() {
    const invalidateAccum = () => {
      this.raymarcher.resetAccumulation();
    };

    this.orbitController.onChange = invalidateAccum;
    this.hud.onSettingChange = invalidateAccum;

    this.hud.getCameraSnapshot = () => {
      const offset = this.camera.position.clone().sub(this.camera.target);
      return {
        pos: this.camera.position.toArray(),
        target: this.camera.target.toArray(),
        up: this.camera.up.toArray(),
        orbitRadius: Math.max(0.04, offset.length())
      };
    };

    this.hud.onApplyKeyframeCamera = (camSnap) => {
      if (this.hud.isRandomMode && this.orbitController.hasUserInteracted && this.prevBaseCam) {
        // User has customized zoom, angle, or pan in Random Mode:
        // Keep animation flowing by applying the flight motion delta to the user's camera!
        const dx = camSnap.pos[0] - this.prevBaseCam.pos[0];
        const dy = camSnap.pos[1] - this.prevBaseCam.pos[1];
        const dz = camSnap.pos[2] - this.prevBaseCam.pos[2];

        const dtx = camSnap.target[0] - this.prevBaseCam.target[0];
        const dty = camSnap.target[1] - this.prevBaseCam.target[1];
        const dtz = camSnap.target[2] - this.prevBaseCam.target[2];

        this.camera.position.x += dx;
        this.camera.position.y += dy;
        this.camera.position.z += dz;

        this.camera.target.x += dtx;
        this.camera.target.y += dty;
        this.camera.target.z += dtz;

        this.camera.up.set(...camSnap.up);
        this.orbitController.syncFromCamera();
      } else {
        this.camera.setView(camSnap.pos, camSnap.target);
        this.camera.up.set(...camSnap.up);
        this.orbitController.syncFromCamera();
      }
      this.prevBaseCam = { pos: [...camSnap.pos], target: [...camSnap.target] };
      invalidateAccum();
    };

    this.hud.onFormulaChange = (formula, fromTour) => {
      this.orbitController.resetInteraction();
      this.prevBaseCam = null;
      // Tour & Random mode: aligned with 6.5s in-formula pacing for an ultra-seamless, smooth, slow dissolve.
      // Manual switch: 2.5s for a graceful interactive dissolve.
      this.raymarcher.crossfadeDuration = fromTour ? 6.5 : 2.5;
      // During the auto-play tour the HUD drives the camera itself (glides to the next loop's first keyframe)
      if (!fromTour) {
        this.orbitController.transitionTo(formula.defaultCam.pos, formula.defaultCam.target, [0, 1, 0], 1.5);
      }
      invalidateAccum();
    };

    this.hud.onPaletteChange = () => {
      invalidateAccum();
    };

    this.hud.onResetView = () => {
      const formula = this.hud.getActiveFormula();
      this.orbitController.transitionTo(formula.defaultCam.pos, formula.defaultCam.target, [0, 1, 0], 0.75);
      invalidateAccum();
    };

    this.hud.onTransitionProgress = (weight, isDone) => {
      this.raymarcher.setTransitionState(weight, isDone);
    };

    this.hud.onToggleAccumulation = () => {
      invalidateAccum();
    };
  }

  private setupWindowListeners() {
    window.addEventListener('resize', () => {
      this.raymarcher.resize();
      this.raymarcher.resetAccumulation();
    });

    // Click-to-focus depth of field
    this.canvas.addEventListener('click', () => {
      const dist = this.camera.position.clone().sub(this.camera.target).length();
      this.hud.settings.focalDistance = dist;
      const focalSlider = document.getElementById('param-focal-dist') as HTMLInputElement;
      const focalVal = document.getElementById('val-focal-dist');
      if (focalSlider && focalVal) {
        focalSlider.value = dist.toFixed(2);
        focalVal.textContent = dist.toFixed(2);
      }
      this.raymarcher.resetAccumulation();
    });
  }

  private startLoop() {
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastTime) / 1000.0);
      this.lastTime = now;

      // FPS smoothing
      const instantFps = 1.0 / Math.max(0.001, dt);
      this.fps += (instantFps - this.fps) * 0.05;

      // Keyframe animation loop interpolation
      this.hud.keyframeEngine.update(dt);

      // Audio engine update and visualizer sync
      this.hud.audioEngine.update(dt);
      const audioMetrics = this.hud.audioEngine.getMetrics();
      this.hud.updateAudioVisualizer(audioMetrics);

      // Camera controller update
      this.orbitController.update(dt);
      this.gamepadController.update(dt);

      // Viewport compensation when settings panel is open
      const drawer = document.getElementById('settings-drawer');
      const isDrawerOpen = drawer && !drawer.classList.contains('closed');
      // Desktop: drawer is a left side panel (shift horizontally). Mobile: bottom sheet (shift vertically).
      const isMobile = window.innerWidth <= 720;
      const drawerSize = drawer ? (isMobile ? drawer.offsetHeight : drawer.offsetWidth) : 420;
      const targetOffsetX = isDrawerOpen && !isMobile ? drawerSize * 0.5 : 0.0;
      const targetOffsetY = isDrawerOpen && isMobile ? drawerSize * 0.5 : 0.0;
      const diff = targetOffsetX - this.currentOffsetX;
      const diffY = targetOffsetY - this.currentOffsetY;
      if (Math.abs(diff) > 0.2 || Math.abs(diffY) > 0.2) {
        const k = Math.min(1.0, dt * 10.0);
        this.currentOffsetX += diff * k;
        this.currentOffsetY += diffY * k;
        this.raymarcher.resetAccumulation();
      } else if (this.currentOffsetX !== targetOffsetX || this.currentOffsetY !== targetOffsetY) {
        this.currentOffsetX = targetOffsetX;
        this.currentOffsetY = targetOffsetY;
        this.raymarcher.resetAccumulation();
      }

      // Render frame
      const formula = this.hud.getActiveFormula();
      const formulaParams = this.hud.getDynamicParams();
      const palette = this.hud.getActivePalette();

      this.raymarcher.render(
        formula,
        formulaParams,
        palette,
        this.hud.settings,
        this.camera.position,
        this.camera.target,
        this.camera.up,
        now * 0.001,
        false,
        [this.currentOffsetX, this.currentOffsetY],
        dt,
        audioMetrics
      );

      // Update HUD stats
      this.hud.updateStats(this.fps, this.raymarcher.getSampleCount());

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
