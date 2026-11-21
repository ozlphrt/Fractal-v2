// src/renderer/Raymarcher.ts
// Primary WebGL2 rendering coordinator linking Raymarching, Accumulation, and Post-Processing

import { FormulaDefinition, PalettePreset, RenderSettings, ORB_COLOR_PRESETS } from '../core/types.ts';
import { RAYMARCH_VERT, buildRaymarchFrag } from './shaders/raymarch.glsl.ts';
import { Accumulator } from './Accumulator.ts';
import { PostProcessor } from './PostProcessor.ts';
import { halton, Vec3 } from '../core/math.ts';
import { AudioMetrics } from '../audio/AudioEngine.ts';

export class Raymarcher {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private quadVAO: WebGLVertexArrayObject;

  private accumulator: Accumulator;
  private postProcessor: PostProcessor;

  // Single-frame render target
  private rawFBO: WebGLFramebuffer | null = null;
  private rawTexture: WebGLTexture | null = null;
  private transitionFBO: WebGLFramebuffer | null = null;
  private transitionTexture: WebGLTexture | null = null;
  public transitionWeight: number = 0.0;
  private hasRenderedAtLeastOnce: boolean = false;

  // Live formula cross-fade: the outgoing formula keeps rendering (with its own params) while it dissolves
  /** Duration in seconds of the next formula cross-fade (aligned with 6.5s in-formula pacing) */
  public crossfadeDuration: number = 6.5;
  private prevFormula: FormulaDefinition | null = null;
  private prevProgram: WebGLProgram | null = null;
  private prevParams: Record<string, number> = {};
  private lastFormula: FormulaDefinition | null = null;
  private lastParams: Record<string, number> = {};

  public setTransitionState(weight: number, isDone: boolean) {
    this.transitionWeight = Math.max(0.0, Math.min(1.0, weight));
    if (isDone || weight <= 0.0001) {
      this.prevFormula = null;
      this.prevProgram = null;
      this.transitionWeight = 0.0;
    }
  }

  // High-performance dynamic internal resolution
  public renderWidth: number = 0;
  public renderHeight: number = 0;

  // Compiled shader programs cache
  private programs: Map<string, WebGLProgram> = new Map();
  // Programs whose compile/link was kicked off (possibly asynchronously) but not yet verified
  private pending: Map<string, WebGLProgram> = new Map();
  private currentProgram: WebGLProgram | null = null;
  private currentFormulaId: string = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true
    });

    if (!gl) {
      throw new Error('WebGL 2.0 is required for Fractal v2.');
    }
    this.gl = gl;
    // Lets the driver compile/link shaders on background threads so warming never stalls rendering
    gl.getExtension('KHR_parallel_shader_compile');

    // Build full-screen quad
    const [vao] = this.initQuad();
    this.quadVAO = vao;

    this.accumulator = new Accumulator(gl);
    this.postProcessor = new PostProcessor(gl, vao);

    this.resize();
  }

  private initQuad(): [WebGLVertexArrayObject, WebGLBuffer] {
    const gl = this.gl;
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    return [vao, vbo];
  }

  public resize() {
    const gl = this.gl;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    // High-performance dynamic internal resolution scaling:
    // Caps excessive raymarch pixel loads on 1440p/4K monitors to preserve solid 60 FPS
    // while delivering crisp visuals with GPU hardware linear interpolation + ACES tonemapping
    const maxDim = 1440;
    const scale = Math.min(1.0, maxDim / Math.max(width, height));
    const rw = Math.max(320, Math.round(width * scale));
    const rh = Math.max(240, Math.round(height * scale));

    if (this.canvas.width !== width || this.canvas.height !== height || this.renderWidth !== rw || this.renderHeight !== rh) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.renderWidth = rw;
      this.renderHeight = rh;

      if (this.rawTexture) {
        gl.deleteTexture(this.rawTexture);
        gl.deleteFramebuffer(this.rawFBO!);
      }
      if (this.transitionTexture) {
        gl.deleteTexture(this.transitionTexture);
        gl.deleteFramebuffer(this.transitionFBO!);
      }

      const ext = gl.getExtension('EXT_color_buffer_float');
      const internalFormat = ext ? gl.RGBA16F : gl.RGBA;
      const type = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

      this.rawTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, rw, rh, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.rawFBO = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rawFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rawTexture, 0);

      this.transitionTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.transitionTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, rw, rh, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.transitionFBO = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.transitionFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.transitionTexture, 0);

      this.accumulator.resize(rw, rh);
    }
  }

  public resetAccumulation() {
    this.accumulator.reset();
  }

  public getSampleCount(): number {
    return this.accumulator.sampleCount;
  }

  private startCompile(formula: FormulaDefinition): WebGLProgram {
    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, RAYMARCH_VERT);
    gl.compileShader(vert);

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, buildRaymarchFrag(formula));
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(frag);
      throw new Error(`Formula [${formula.id}] fragment shader failed to compile: ${err}`);
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    return prog;
  }

  /** Begin compiling a formula's shader in the background (non-blocking where the driver supports it) */
  public warm(formula: FormulaDefinition) {
    if (this.programs.has(formula.id) || this.pending.has(formula.id)) return;
    try {
      this.pending.set(formula.id, this.startCompile(formula));
    } catch {
      // Will surface when the formula is actually used
    }
  }

  /** True when the formula's program can be used without blocking the frame */
  public isReady(formula: FormulaDefinition): boolean {
    if (this.programs.has(formula.id)) return true;
    const prog = this.pending.get(formula.id);
    if (!prog) {
      this.warm(formula);
      return false;
    }
    // COMPLETION_STATUS_KHR = 0x91B1
    return this.gl.getProgramParameter(prog, 0x91B1) === true;
  }

  private getOrCompileProgram(formula: FormulaDefinition): WebGLProgram {
    const cached = this.programs.get(formula.id);
    if (cached) return cached;

    const gl = this.gl;
    const prog = this.pending.get(formula.id) ?? this.startCompile(formula);
    this.pending.delete(formula.id);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Formula [${formula.id}] failed to build: ${gl.getProgramInfoLog(prog)}`);
    }
    this.programs.set(formula.id, prog);
    return prog;
  }

  public render(
    formula: FormulaDefinition,
    formulaParams: Record<string, number>,
    palette: PalettePreset,
    settings: RenderSettings,
    camPos: Vec3,
    camTarget: Vec3,
    camUp: Vec3,
    time: number,
    isFlightMode: boolean = false,
    screenOffset: [number, number] = [0, 0],
    _dt: number = 0.016,
    audioMetrics?: AudioMetrics
  ) {
    this.resize();

    if (this.currentFormulaId !== formula.id) {
      if (this.hasRenderedAtLeastOnce && this.currentProgram && this.lastFormula) {
        // Keep the outgoing formula alive so both fractals keep moving while they dissolve
        this.prevFormula = this.lastFormula;
        this.prevProgram = this.currentProgram;
        this.prevParams = this.lastParams;
        this.transitionWeight = 1.0;
      }
      this.currentFormulaId = formula.id;
      this.currentProgram = this.getOrCompileProgram(formula);
      this.resetAccumulation();
    }
    this.lastFormula = formula;
    this.lastParams = { ...formulaParams };

    // Decay transitionWeight smoothly over time unless driven in lockstep by HUD
    if (this.transitionWeight > 0.0) {
      const decay = _dt / Math.max(0.1, this.crossfadeDuration);
      this.transitionWeight = Math.max(0.0, this.transitionWeight - decay);
      if (this.transitionWeight <= 0.001) {
        this.transitionWeight = 0.0;
        this.prevFormula = null;
        this.prevProgram = null;
      }
    }

    // Consistent 135 raymarching steps across both passes eliminates any geometry/depth pop
    const maxSteps = 135;
    if (this.prevFormula && this.prevProgram && this.transitionFBO && this.transitionWeight > 0.001) {
      this.drawScene(this.transitionFBO, this.prevProgram, this.prevFormula, this.prevParams, palette, settings,
        camPos, camTarget, camUp, time, isFlightMode, screenOffset, maxSteps, audioMetrics);
    }
    this.drawScene(this.rawFBO!, this.currentProgram!, formula, formulaParams, palette, settings,
      camPos, camTarget, camUp, time, isFlightMode, screenOffset, maxSteps, audioMetrics);

    // Audio reactive exposure & bloom flare (Lights & Glow dynamics)
    const audioActive = (settings.audioEnabled && audioMetrics?.active) ? 1.0 : 0.0;
    const beat = (audioMetrics?.beat ?? 0.0) * audioActive;
    const mid = (audioMetrics?.mid ?? 0.0) * audioActive;
    const bass = (audioMetrics?.bass ?? 0.0) * audioActive;
    const glowScale = settings.audioGlow ?? 1.20;
    const exposureMod = 1.0 + (beat * 0.18 + bass * 0.12) * glowScale;
    const bloomMod = 1.0 + (mid * 0.95 + beat * 0.70) * glowScale;

    // Accumulation Pass
    let finalAccumTexture = this.rawTexture!;
    if (settings.progressiveAccumulation) {
      finalAccumTexture = this.accumulator.accumulate(this.rawTexture!, this.quadVAO);
    } else {
      this.accumulator.reset();
    }

    // Post-Processing Pass (Bloom, ACES tonemap, Chromatic aberration, Screen output, Smooth Formula Dissolve)
    this.postProcessor.render(
      finalAccumTexture,
      settings.exposure * exposureMod,
      settings.bloomIntensity * bloomMod,
      settings.progressiveAccumulation ? 0.35 : 0.65,
      this.transitionTexture,
      this.transitionWeight
    );

    this.hasRenderedAtLeastOnce = true;
  }

  private drawScene(
    fbo: WebGLFramebuffer,
    prog: WebGLProgram,
    formula: FormulaDefinition,
    formulaParams: Record<string, number>,
    palette: PalettePreset,
    settings: RenderSettings,
    camPos: Vec3,
    camTarget: Vec3,
    camUp: Vec3,
    time: number,
    isFlightMode: boolean,
    screenOffset: [number, number],
    maxSteps: number = 135,
    audioMetrics?: AudioMetrics
  ) {
    const gl = this.gl;
    gl.useProgram(prog);

    // Render into the given target with internal scaled resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);

    // Uniforms setup
    const set1f = (name: string, val: number) => {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform1f(loc, val);
    };
    const set1i = (name: string, val: number) => {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform1i(loc, val);
    };
    const set2f = (name: string, x: number, y: number) => {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform2f(loc, x, y);
    };
    const set3f = (name: string, x: number, y: number, z: number) => {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform3f(loc, x, y, z);
    };

    // Camera uniforms
    set3f('u_camPos', camPos.x, camPos.y, camPos.z);
    set3f('u_camTarget', camTarget.x, camTarget.y, camTarget.z);
    set3f('u_camUp', camUp.x, camUp.y, camUp.z);
    set2f('u_resolution', this.renderWidth, this.renderHeight);
    const scaleX = this.renderWidth / Math.max(1, this.canvas.width);
    const scaleY = this.renderHeight / Math.max(1, this.canvas.height);
    set2f('u_screenOffset', screenOffset[0] * scaleX, screenOffset[1] * scaleY);
    set1f('u_time', time);
    set1i('u_maxSteps', maxSteps);

    // Halton subpixel jitter & lens bokeh jitter
    const sampleIdx = settings.progressiveAccumulation ? this.accumulator.sampleCount + 1 : 1;
    const jx = settings.progressiveAccumulation ? halton(sampleIdx, 2) - 0.5 : 0.0;
    const jy = settings.progressiveAccumulation ? halton(sampleIdx, 3) - 0.5 : 0.0;
    set2f('u_jitter', jx, jy);

    // Circular lens aperture jitter (active whenever aperture > 0, responsive in real-time)
    let lensR = 0.0;
    let lensTheta = 0.0;
    if (settings.aperture > 0.0) {
      if (settings.progressiveAccumulation) {
        lensR = Math.sqrt(halton(sampleIdx, 5));
        lensTheta = halton(sampleIdx, 7) * 2.0 * Math.PI;
      } else {
        const sampleStep = (time * 60.0) % 64.0;
        lensR = Math.sqrt(halton(Math.floor(sampleStep) + 1, 5));
        lensTheta = halton(Math.floor(sampleStep) + 1, 7) * 2.0 * Math.PI;
      }
    }
    set2f('u_lensJitter', lensR * Math.cos(lensTheta), lensR * Math.sin(lensTheta));

    // Optics & Materials
    set1f('u_focalDistance', settings.focalDistance);
    set1f('u_aperture', settings.aperture);
    set1f('u_ior', settings.ior);
    set1f('u_dispersion', settings.dispersion);
    set1f('u_subsurface', settings.subsurface);
    set1f('u_emissiveVeins', settings.emissiveVeins);

    // Flying Cavity Lights (Photon Orbs) Uniforms
    const orbActive = settings.orbEnabled !== false && (settings.orbIntensity ?? 1.20) > 0.001;
    set1f('u_orbIntensity', orbActive ? (settings.orbIntensity ?? 1.20) : 0.0);
    set1f('u_orbRadius', settings.orbRadius ?? 0.016);

    const presetKey = settings.orbPreset || 'trichrome';
    const orbPreset = ORB_COLOR_PRESETS[presetKey] || ORB_COLOR_PRESETS.trichrome;
    set3f('u_orbCol0', orbPreset.colors[0][0], orbPreset.colors[0][1], orbPreset.colors[0][2]);
    set3f('u_orbCol1', orbPreset.colors[1][0], orbPreset.colors[1][1], orbPreset.colors[1][2]);
    set3f('u_orbCol2', orbPreset.colors[2][0], orbPreset.colors[2][1], orbPreset.colors[2][2]);

    if (orbActive) {
      const { positions: orbPos, tails: orbTails } = this.computeOrbPositions(formula, settings, formulaParams, time);
      set3f('u_orbPos0', orbPos[0][0], orbPos[0][1], orbPos[0][2]);
      set3f('u_orbPos1', orbPos[1][0], orbPos[1][1], orbPos[1][2]);
      set3f('u_orbPos2', orbPos[2][0], orbPos[2][1], orbPos[2][2]);
      set3f('u_orbTail0', orbTails[0][0], orbTails[0][1], orbTails[0][2]);
      set3f('u_orbTail1', orbTails[1][0], orbTails[1][1], orbTails[1][2]);
      set3f('u_orbTail2', orbTails[2][0], orbTails[2][1], orbTails[2][2]);
    } else {
      set3f('u_orbPos0', 0, 0, 0);
      set3f('u_orbPos1', 0, 0, 0);
      set3f('u_orbPos2', 0, 0, 0);
      set3f('u_orbTail0', 0, 0, 0);
      set3f('u_orbTail1', 0, 0, 0);
      set3f('u_orbTail2', 0, 0, 0);
    }

    // Volumetrics & Lighting
    const azRad = (settings.lightAzimuth * Math.PI) / 180.0;
    const elRad = (settings.lightElevation * Math.PI) / 180.0;
    let lx = Math.cos(elRad) * Math.sin(azRad);
    let ly = Math.sin(elRad);
    let lz = Math.cos(elRad) * Math.cos(azRad);

    // Monte Carlo sun disk jitter during progressive accumulation for soft penumbra
    if (settings.progressiveAccumulation && sampleIdx > 1) {
      const sunJitterR = Math.sqrt(halton(sampleIdx, 11)) * 0.022;
      const sunJitterTheta = halton(sampleIdx, 13) * 2.0 * Math.PI;
      lx += sunJitterR * Math.cos(sunJitterTheta);
      ly += sunJitterR * Math.sin(sunJitterTheta);
      lz += sunJitterR * Math.sin(sunJitterTheta * 0.5);
    }
    const lNorm = Math.hypot(lx, ly, lz) || 1.0;
    set3f('u_lightDir', lx / lNorm, ly / lNorm, lz / lNorm);
    set1f('u_sunIntensity', settings.sunIntensity);
    set1f('u_rimIntensity', settings.rimIntensity);
    set1f('u_rimElevation', settings.rimElevation);
    set1f('u_fillIntensity', settings.fillIntensity);
    set1f('u_glowIntensity', settings.glowIntensity ?? 0.35);

    // Camera-Tracking Headlamp (Active ONLY in 6DOF Flight mode)
    const headlampPower = (isFlightMode && settings.headlamp) ? settings.headlampIntensity : 0.0;
    set1f('u_headlampIntensity', headlampPower);

    set1f('u_fogDensity', settings.fogDensity);
    set1f('u_godraysIntensity', settings.godraysIntensity);

    // Audio Reactivity Uniforms
    const audioActive = (settings.audioEnabled && audioMetrics?.active) ? 1.0 : 0.0;
    const sens = settings.audioSensitivity ?? 1.4;
    const bass = (audioMetrics?.bass ?? 0.0) * audioActive * sens;
    const mid = (audioMetrics?.mid ?? 0.0) * audioActive * sens;
    const treble = (audioMetrics?.treble ?? 0.0) * audioActive * sens;
    const level = (audioMetrics?.level ?? 0.0) * audioActive * sens;
    const beat = (audioMetrics?.beat ?? 0.0) * audioActive * sens;
    const glowMod = (settings.audioGlow ?? 1.20) * audioActive;
    const colorShiftMod = (settings.audioColorShift ?? 0.60) * audioActive;

    set1f('u_audioBass', bass);
    set1f('u_audioMid', mid);
    set1f('u_audioTreble', treble);
    set1f('u_audioLevel', level);
    set1f('u_audioBeat', beat);
    set1f('u_audioGlowMod', glowMod);
    set1f('u_audioColorShift', colorShiftMod);

    // Palette presets
    set3f('u_palA', palette.a[0], palette.a[1], palette.a[2]);
    set3f('u_palB', palette.b[0], palette.b[1], palette.b[2]);
    set3f('u_palC', palette.c[0], palette.c[1], palette.c[2]);
    set3f('u_palD', palette.d[0], palette.d[1], palette.d[2]);

    // Formula parameters: audio strictly controls a subtle, organic scale breathing on primary dimension.
    // All other parameters remain 100% faithful to the formula and user sliders (zero shape distortion).
    const breathStrength = (settings.audioBreathing ?? 0.50) * audioActive;
    let paramIndex = 0;
    for (const p of formula.params) {
      let val = formulaParams[p.id] ?? p.default;
      if (p.type === 'int') {
        set1i(p.uniform, Math.round(val));
      } else {
        if (paramIndex === 0 && breathStrength > 0.001) {
          // Subtle, organic scale breathing on bass & kick drops (~5-10% max expansion)
          const pulse = (bass * 0.60 + beat * 0.35) * 0.08 * breathStrength;
          val = val * (1.0 + pulse);
        }
        val = Math.max(p.min * 0.9, Math.min(p.max * 1.1, val));
        set1f(p.uniform, val);
        paramIndex++;
      }
    }

    // Draw single raymarch pass
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Computes collision-free orbital cavity paths for 3 luminous light orbs.
   * Evaluates the formula's CPU distance estimator to continuously push orbs away from walls
   * into natural hollows, corridors, and cavities.
   */
  private computeOrbPositions(
    formula: FormulaDefinition,
    settings: RenderSettings,
    formulaParams: Record<string, number>,
    timeSec: number
  ): {
    positions: [number, number, number][];
    tails: [number, number, number][];
  } {
    const speed = settings.orbSpeed ?? 1.00;
    const tailLen = (settings.orbTail ?? 1.00) * 0.18 * speed;
    const orbRadius = settings.orbRadius ?? 0.016;
    const safeClearance = Math.max(0.045, orbRadius * 3.0);
    const boundR = Math.min(2.0, Math.max(0.85, (formula.boundRadius ?? 3.0) * 0.40));

    const getRawPos = (idx: number, t: number): [number, number, number] => {
      const s = t * speed;
      if (idx === 0) {
        const u = s * 0.38;
        return [
          boundR * Math.cos(u),
          boundR * 0.45 * Math.sin(u * 2.1),
          boundR * Math.sin(u)
        ];
      } else if (idx === 1) {
        const u = s * 0.42 + 2.094;
        return [
          boundR * 0.55 * Math.sin(u * 2.3),
          boundR * Math.cos(u),
          boundR * 0.80 * Math.sin(u * 1.2)
        ];
      } else {
        const u = s * 0.34 + 4.188;
        return [
          boundR * Math.sin(u * 1.4),
          boundR * 0.48 * Math.cos(u * 2.5),
          boundR * Math.cos(u * 1.4)
        ];
      }
    };

    const conformPos = (pos: [number, number, number]): [number, number, number] => {
      if (!formula.cpuDE) return pos;
      let [x, y, z] = pos;
      for (let iter = 0; iter < 3; iter++) {
        const d = formula.cpuDE([x, y, z], formulaParams);
        if (d < safeClearance) {
          const eps = 0.006;
          const dx = (formula.cpuDE([x + eps, y, z], formulaParams) - formula.cpuDE([x - eps, y, z], formulaParams)) / (2 * eps);
          const dy = (formula.cpuDE([x, y + eps, z], formulaParams) - formula.cpuDE([x, y - eps, z], formulaParams)) / (2 * eps);
          const dz = (formula.cpuDE([x, y, z + eps], formulaParams) - formula.cpuDE([x, y, z - eps], formulaParams)) / (2 * eps);
          const gLen = Math.hypot(dx, dy, dz) || 1.0;
          const push = (safeClearance - d) + 0.008;
          x += (dx / gLen) * push;
          y += (dy / gLen) * push;
          z += (dz / gLen) * push;
        } else {
          break;
        }
      }
      return [x, y, z];
    };

    const positions: [number, number, number][] = [];
    const tails: [number, number, number][] = [];

    for (let i = 0; i < 3; i++) {
      const p = conformPos(getRawPos(i, timeSec));
      const pPrev = conformPos(getRawPos(i, timeSec - 0.07));
      const vx = p[0] - pPrev[0];
      const vy = p[1] - pPrev[1];
      const vz = p[2] - pPrev[2];
      const vLen = Math.hypot(vx, vy, vz) || 1e-4;
      const tailEnd: [number, number, number] = [
        p[0] - (vx / vLen) * tailLen,
        p[1] - (vy / vLen) * tailLen,
        p[2] - (vz / vLen) * tailLen
      ];
      positions.push(p);
      tails.push(tailEnd);
    }

    return { positions, tails };
  }
}
