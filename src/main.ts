// src/main.ts
// Main entry point for Fractal Studio v2

import { Raymarcher } from './renderer/Raymarcher.ts';
import { Camera } from './camera/Camera.ts';
import { OrbitController } from './camera/OrbitController.ts';
import { HUD } from './ui/HUD.ts';

class App {
  private canvas: HTMLCanvasElement;
  private raymarcher: Raymarcher;
  private camera: Camera;
  private orbitController: OrbitController;
  private hud: HUD;

  private lastTime: number = performance.now();
  private fps: number = 60.0;

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

    this.setupHUDListeners();
    this.setupWindowListeners();
    this.startLoop();
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
      this.camera.setView(camSnap.pos, camSnap.target);
      this.camera.up.set(...camSnap.up);
      this.orbitController.syncFromCamera();
      invalidateAccum();
    };

    this.hud.onFormulaChange = (formula) => {
      this.camera.setView(formula.defaultCam.pos, formula.defaultCam.target);
      this.orbitController.syncFromCamera();
      invalidateAccum();
    };

    this.hud.onPaletteChange = () => {
      invalidateAccum();
    };

    this.hud.onResetView = () => {
      const formula = this.hud.getActiveFormula();
      this.camera.setView(formula.defaultCam.pos, formula.defaultCam.target);
      this.orbitController.syncFromCamera();
      invalidateAccum();
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

      // Camera controller update
      this.orbitController.update(dt);

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
        false
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
