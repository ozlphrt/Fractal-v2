// src/camera/GamepadController.ts
// Precision Xbox / DualShock / Standard Gamepad Controller for 6DOF Flight & 360° Orbit Navigation

import { Camera } from './Camera.ts';
import { OrbitController } from './OrbitController.ts';
import { HUD } from '../ui/HUD.ts';
import { Vec3 } from '../core/math.ts';

export type GamepadMode = 'flight' | 'orbit';

function applyRadialDeadzone(x: number, y: number, deadzone = 0.12): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return [0, 0];
  const scaledMag = Math.min(1.0, (mag - deadzone) / (1.0 - deadzone));
  const curvedMag = Math.pow(scaledMag, 1.75); // Exponential precision curve
  const factor = curvedMag / mag;
  return [x * factor, y * factor];
}

function rotateVecAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = axis.dot(v);
  const cross = axis.clone().cross(v);
  return new Vec3(
    v.x * c + cross.x * s + axis.x * dot * (1.0 - c),
    v.y * c + cross.y * s + axis.y * dot * (1.0 - c),
    v.z * c + cross.z * s + axis.z * dot * (1.0 - c)
  );
}

export class GamepadController {
  private camera: Camera;
  private orbitController: OrbitController;
  private hud: HUD;

  public isConnected: boolean = false;
  public mode: GamepadMode = 'flight'; // Default to 6DOF Flight mode for Xbox controller

  private prevButtons: boolean[] = [];
  private lastHapticTime: number = 0;
  private toastTimer: number | null = null;
  private badgeEl: HTMLElement | null = null;
  private modeLabelEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;

  public onInteract?: () => void;

  constructor(camera: Camera, orbitController: OrbitController, hud: HUD) {
    this.camera = camera;
    this.orbitController = orbitController;
    this.hud = hud;

    this.initDOM();
    this.bindEvents();
  }

  private initDOM() {
    this.badgeEl = document.getElementById('hud-gamepad-badge');
    this.modeLabelEl = document.getElementById('gamepad-mode-label');
    this.toastEl = document.getElementById('gamepad-toast');
  }

  private bindEvents() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.isConnected = true;
      this.updateBadge();
      this.showToast(`🎮 ${e.gamepad.id.split('(')[0].trim() || 'Controller'} Connected`);
      this.triggerHaptic(80, 0.3, 0.5);
    });

    window.addEventListener('gamepaddisconnected', () => {
      const activeGamepads = this.getActiveGamepads();
      if (activeGamepads.length === 0) {
        this.isConnected = false;
        this.updateBadge();
        this.showToast('Controller Disconnected');
      }
    });
  }

  private getActiveGamepads(): Gamepad[] {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    const list: Gamepad[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i]!.connected) {
        list.push(raw[i]!);
      }
    }
    return list;
  }

  public update(dt: number) {
    const gamepads = this.getActiveGamepads();
    if (gamepads.length === 0) {
      if (this.isConnected) {
        this.isConnected = false;
        this.updateBadge();
      }
      return;
    }

    if (!this.isConnected) {
      this.isConnected = true;
      this.updateBadge();
    }

    const gp = gamepads[0];
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    this.handleButtons(gp);

    if (this.mode === 'flight') {
      this.updateFlight(gp, clampedDt);
    } else {
      this.updateOrbit(gp, clampedDt);
    }
  }

  private handleButtons(gp: Gamepad) {
    const justPressed = (idx: number): boolean => {
      const btn = gp.buttons[idx];
      const isDown = typeof btn === 'object' ? btn.pressed : Boolean(btn);
      const wasDown = Boolean(this.prevButtons[idx]);
      return isDown && !wasDown;
    };

    // View / Back button (Button 8): Toggle between Flight Mode and Orbit Mode!
    if (justPressed(8)) {
      this.mode = this.mode === 'flight' ? 'orbit' : 'flight';
      this.triggerHaptic(60, 0.4, 0.4);
      this.showToast(this.mode === 'flight' ? '🎮 6DOF Flight Mode Active' : '🎮 Orbit Inspector Active');
      this.updateBadge();
    }

    // Menu / Start button (Button 9): Toggle settings drawer
    if (justPressed(9)) {
      const drawer = document.getElementById('settings-drawer');
      drawer?.classList.toggle('closed');
      this.triggerHaptic(40, 0.2, 0.3);
    }

    // A Button (Button 0): Play / Pause Tour / Keyframe Loop
    if (justPressed(0)) {
      const btnPlay = document.getElementById('btn-play-tour');
      btnPlay?.click();
      this.triggerHaptic(50, 0.3, 0.4);
    }

    // B Button (Button 1): Toggle Cinematic Clean Screen (Hide/Show HUD)
    if (justPressed(1)) {
      const hudContainer = document.getElementById('hud-container');
      hudContainer?.classList.toggle('cinematic-hide');
      this.triggerHaptic(40, 0.2, 0.3);
    }

    // X Button (Button 2): Randomize / Mutate Formula Parameters
    if (justPressed(2)) {
      const btnDice = document.getElementById('btn-dice');
      btnDice?.click();
      this.triggerHaptic(70, 0.5, 0.5);
    }

    // Y Button (Button 3): Reset Camera / Recenter View
    if (justPressed(3)) {
      this.hud.onResetView?.();
      this.triggerHaptic(60, 0.3, 0.6);
      this.showToast('Camera Centered');
    }

    // Left Stick Click (L3 / Button 10): Toggle Adaptive Speed
    if (justPressed(10)) {
      this.hud.settings.adaptiveSpeed = !this.hud.settings.adaptiveSpeed;
      this.showToast(this.hud.settings.adaptiveSpeed ? 'Adaptive Speed: ON' : 'Adaptive Speed: OFF');
      this.triggerHaptic(50, 0.3, 0.3);
    }

    // Right Stick Click (R3 / Button 11): Level Horizon (re-orient up vector)
    if (justPressed(11)) {
      this.levelHorizon();
      this.triggerHaptic(50, 0.3, 0.5);
      this.showToast('Horizon Leveled');
    }

    // D-Pad Left (Button 14): Previous Formula
    if (justPressed(14)) {
      const btnPrev = document.getElementById('btn-prev-formula');
      btnPrev?.click();
      this.triggerHaptic(50, 0.2, 0.4);
    }

    // D-Pad Right (Button 15): Next Formula
    if (justPressed(15)) {
      const btnNext = document.getElementById('btn-next-formula');
      btnNext?.click();
      this.triggerHaptic(50, 0.2, 0.4);
    }

    // D-Pad Down (Button 13): Previous Palette
    if (justPressed(13)) {
      const btnPrevPal = document.getElementById('btn-prev-palette');
      btnPrevPal?.click();
      this.triggerHaptic(40, 0.2, 0.3);
    }

    // D-Pad Up (Button 12): Next Palette
    if (justPressed(12)) {
      const btnNextPal = document.getElementById('btn-next-palette');
      btnNextPal?.click();
      this.triggerHaptic(40, 0.2, 0.3);
    }

    // Record state for next frame's edge detection
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      this.prevButtons[i] = typeof b === 'object' ? b.pressed : Boolean(b);
    }
  }

  private updateFlight(gp: Gamepad, dt: number) {
    const [lx, ly] = applyRadialDeadzone(gp.axes[0], gp.axes[1], 0.12);
    const [rx, ry] = applyRadialDeadzone(gp.axes[2], gp.axes[3], 0.12);

    const lt = typeof gp.buttons[6] === 'object' ? gp.buttons[6].value : (gp.buttons[6] ? 1 : 0);
    const rt = typeof gp.buttons[7] === 'object' ? gp.buttons[7].value : (gp.buttons[7] ? 1 : 0);
    const triggerDelta = (rt > 0.08 ? rt : 0) - (lt > 0.08 ? lt : 0);

    const lbHeld = gp.buttons[4]?.pressed ?? false;
    const rbHeld = gp.buttons[5]?.pressed ?? false;

    let speedMultiplier = 1.0;
    if (lbHeld) speedMultiplier = 0.22; // Precision crawl
    else if (rbHeld) speedMultiplier = 3.2; // Turbo boost

    const distFromOrigin = Math.max(0.1, this.camera.position.length());
    const adaptiveFactor = this.hud.settings.adaptiveSpeed ? Math.min(2.5, Math.max(0.2, distFromOrigin * 0.4)) : 1.0;
    const baseSpeed = Math.max(0.2, (this.hud.settings.flightSpeed ?? 0.6) * 2.2) * adaptiveFactor;
    const speed = baseSpeed * speedMultiplier;
    const rotSpeed = 1.85;

    const hasTranslation = Math.abs(lx) > 1e-4 || Math.abs(ly) > 1e-4 || Math.abs(triggerDelta) > 1e-4;
    const hasRotation = Math.abs(rx) > 1e-4 || Math.abs(ry) > 1e-4;

    if (hasTranslation || hasRotation) {
      this.orbitController.hasUserInteracted = true;
      this.onInteract?.();
    }

    const forward = this.camera.getForward();
    let right = forward.clone().cross(this.camera.up).normalize();
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    const up = right.clone().cross(forward).normalize();
    this.camera.up.copy(up);

    // 1. Translation along local view axes
    if (hasTranslation) {
      const move = new Vec3();
      move.addScaled(forward, -ly * speed * dt);
      move.addScaled(right, lx * speed * dt);
      move.addScaled(up, triggerDelta * speed * dt);

      this.camera.position.add(move);
      this.camera.target.add(move);
    }

    // 2. Rotation (Look Pitch & Yaw)
    if (hasRotation) {
      const dYaw = -rx * rotSpeed * dt;
      const dPitch = -ry * rotSpeed * dt;

      const curDist = Math.max(0.1, this.camera.position.distanceTo(this.camera.target));
      let newForward = forward.clone();

      if (Math.abs(dPitch) > 1e-7) {
        newForward = rotateVecAroundAxis(newForward, right, dPitch).normalize();
        this.camera.up = rotateVecAroundAxis(this.camera.up, right, dPitch).normalize();
      }

      if (Math.abs(dYaw) > 1e-7) {
        newForward = rotateVecAroundAxis(newForward, this.camera.up, dYaw).normalize();
      }

      this.camera.target.copy(this.camera.position.clone().add(newForward.scale(curDist)));
    }

    if (hasTranslation || hasRotation) {
      this.orbitController.syncFromCamera();
      this.orbitController.onChange?.();
    }
  }

  private updateOrbit(gp: Gamepad, dt: number) {
    const [lx, ly] = applyRadialDeadzone(gp.axes[0], gp.axes[1], 0.12);
    const [rx, ry] = applyRadialDeadzone(gp.axes[2], gp.axes[3], 0.12);

    const lt = typeof gp.buttons[6] === 'object' ? gp.buttons[6].value : (gp.buttons[6] ? 1 : 0);
    const rt = typeof gp.buttons[7] === 'object' ? gp.buttons[7].value : (gp.buttons[7] ? 1 : 0);
    const triggerZoom = (lt > 0.08 ? lt : 0) - (rt > 0.08 ? rt : 0); // LT zooms out, RT zooms in

    const hasInput = Math.abs(lx) > 1e-4 || Math.abs(ly) > 1e-4 ||
                     Math.abs(rx) > 1e-4 || Math.abs(ry) > 1e-4 ||
                     Math.abs(triggerZoom) > 1e-4;

    if (hasInput) {
      this.orbitController.hasUserInteracted = true;
      this.onInteract?.();
    }

    // Left stick: 360° unconstrained orbit rotation around center
    if (Math.abs(lx) > 1e-4 || Math.abs(ly) > 1e-4) {
      this.orbitController.rotateOrbit(lx * 2.4 * dt, -ly * 2.4 * dt);
      this.orbitController.onChange?.();
    }

    // Right stick: pan focus point along viewport plane
    if (Math.abs(rx) > 1e-4 || Math.abs(ry) > 1e-4) {
      const panFactor = Math.max(0.1, this.camera.position.length()) * 1.6 * dt;
      this.orbitController.applyPan(rx * panFactor, -ry * panFactor);
      this.orbitController.onChange?.();
    }

    // Triggers: smooth optical continuous zoom
    if (Math.abs(triggerZoom) > 1e-4) {
      const zoomFactor = Math.exp(triggerZoom * 1.8 * dt);
      this.orbitController.zoomByFactor(zoomFactor);
      this.orbitController.onChange?.();
    }
  }

  private levelHorizon() {
    const forward = this.camera.getForward();
    let right = forward.clone().cross(new Vec3(0, 1, 0)).normalize();
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    const newUp = right.clone().cross(forward).normalize();
    this.camera.up.copy(newUp);
    this.orbitController.syncFromCamera();
    this.orbitController.onChange?.();
  }

  public triggerHaptic(duration = 60, weak = 0.3, strong = 0.3) {
    const now = performance.now();
    if (now - this.lastHapticTime < 60) return;
    this.lastHapticTime = now;

    const gamepads = this.getActiveGamepads();
    for (const gp of gamepads) {
      if (gp && (gp as any).vibrationActuator) {
        try {
          (gp as any).vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration,
            weakMagnitude: Math.min(1.0, Math.max(0.0, weak)),
            strongMagnitude: Math.min(1.0, Math.max(0.0, strong))
          });
        } catch {
          // Handled safely if browser restricts haptics
        }
      }
    }
  }

  private updateBadge() {
    if (!this.badgeEl) this.initDOM();
    if (this.badgeEl) {
      this.badgeEl.classList.toggle('hidden', !this.isConnected);
    }
    if (this.modeLabelEl) {
      this.modeLabelEl.textContent = this.mode === 'flight' ? 'FLIGHT' : 'ORBIT';
    }
  }

  public showToast(msg: string) {
    if (!this.toastEl) this.initDOM();
    if (!this.toastEl) return;

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }

    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.add('visible');

    this.toastTimer = window.setTimeout(() => {
      this.toastEl?.classList.remove('visible');
      setTimeout(() => this.toastEl?.classList.add('hidden'), 300);
      this.toastTimer = null;
    }, 1800);
  }
}
