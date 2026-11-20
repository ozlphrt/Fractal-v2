// src/renderer/Raymarcher.ts
// Primary WebGL2 rendering coordinator linking Raymarching, Accumulation, and Post-Processing

import { FormulaDefinition, PalettePreset, RenderSettings } from '../core/types.ts';
import { RAYMARCH_VERT, buildRaymarchFrag } from './shaders/raymarch.glsl.ts';
import { Accumulator } from './Accumulator.ts';
import { PostProcessor } from './PostProcessor.ts';
import { halton, Vec3 } from '../core/math.ts';

export class Raymarcher {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private quadVAO: WebGLVertexArrayObject;

  private accumulator: Accumulator;
  private postProcessor: PostProcessor;

  // Single-frame render target
  private rawFBO: WebGLFramebuffer | null = null;
  private rawTexture: WebGLTexture | null = null;

  // Compiled shader programs cache
  private programs: Map<string, WebGLProgram> = new Map();
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

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;

      if (this.rawTexture) {
        gl.deleteTexture(this.rawTexture);
        gl.deleteFramebuffer(this.rawFBO!);
      }

      const ext = gl.getExtension('EXT_color_buffer_float');
      const internalFormat = ext ? gl.RGBA16F : gl.RGBA;
      const type = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

      this.rawTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.rawFBO = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rawFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rawTexture, 0);

      this.accumulator.resize(width, height);
    }
  }

  public resetAccumulation() {
    this.accumulator.reset();
  }

  public getSampleCount(): number {
    return this.accumulator.sampleCount;
  }

  private getOrCompileProgram(formula: FormulaDefinition): WebGLProgram {
    if (this.programs.has(formula.id)) {
      return this.programs.get(formula.id)!;
    }

    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, RAYMARCH_VERT);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      throw new Error(`Vertex compile failed: ${gl.getShaderInfoLog(vert)}`);
    }

    const fragSource = buildRaymarchFrag(formula.glslDE);
    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, fragSource);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      throw new Error(`Formula [${formula.id}] compile failed: ${gl.getShaderInfoLog(frag)}`);
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
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
    time: number
  ) {
    const gl = this.gl;
    this.resize();

    if (this.currentFormulaId !== formula.id) {
      this.currentFormulaId = formula.id;
      this.currentProgram = this.getOrCompileProgram(formula);
      this.resetAccumulation();
    }

    const prog = this.currentProgram!;
    gl.useProgram(prog);

    // Render into raw single-frame FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rawFBO);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

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
    set2f('u_resolution', this.canvas.width, this.canvas.height);
    set1f('u_time', time);

    // Halton subpixel jitter & lens bokeh jitter
    const sampleIdx = settings.progressiveAccumulation ? this.accumulator.sampleCount + 1 : 1;
    const jx = settings.progressiveAccumulation ? halton(sampleIdx, 2) - 0.5 : 0.0;
    const jy = settings.progressiveAccumulation ? halton(sampleIdx, 3) - 0.5 : 0.0;
    set2f('u_jitter', jx, jy);

    // Circular lens aperture jitter
    const lensR = settings.progressiveAccumulation ? Math.sqrt(halton(sampleIdx, 5)) : 0.0;
    const lensTheta = settings.progressiveAccumulation ? halton(sampleIdx, 7) * 2.0 * Math.PI : 0.0;
    set2f('u_lensJitter', lensR * Math.cos(lensTheta), lensR * Math.sin(lensTheta));

    // Optics & Materials
    set1f('u_focalDistance', settings.focalDistance);
    set1f('u_aperture', settings.aperture);
    set1f('u_ior', settings.ior);
    set1f('u_dispersion', settings.dispersion);
    set1f('u_subsurface', settings.subsurface);
    set1f('u_emissiveVeins', settings.emissiveVeins);

    // Volumetrics & Lighting
    const azRad = (settings.lightAzimuth * Math.PI) / 180.0;
    const elRad = (settings.lightElevation * Math.PI) / 180.0;
    const lx = Math.cos(elRad) * Math.sin(azRad);
    const ly = Math.sin(elRad);
    const lz = Math.cos(elRad) * Math.cos(azRad);
    set3f('u_lightDir', lx, ly, lz);
    set1f('u_fogDensity', settings.fogDensity);
    set1f('u_godraysIntensity', settings.godraysIntensity);

    // Palette presets
    set3f('u_palA', palette.a[0], palette.a[1], palette.a[2]);
    set3f('u_palB', palette.b[0], palette.b[1], palette.b[2]);
    set3f('u_palC', palette.c[0], palette.c[1], palette.c[2]);
    set3f('u_palD', palette.d[0], palette.d[1], palette.d[2]);

    // Custom formula parameters
    for (const p of formula.params) {
      const val = formulaParams[p.id] ?? p.default;
      if (p.type === 'int') {
        set1i(p.uniform, Math.round(val));
      } else {
        set1f(p.uniform, val);
      }
    }

    // Draw single raymarch pass
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Accumulation Pass
    let finalAccumTexture = this.rawTexture!;
    if (settings.progressiveAccumulation) {
      finalAccumTexture = this.accumulator.accumulate(this.rawTexture!, this.quadVAO);
    } else {
      this.accumulator.reset();
    }

    // Post-Processing Pass (Bloom, ACES tonemap, Chromatic aberration, Screen output)
    this.postProcessor.render(
      finalAccumTexture,
      settings.exposure,
      settings.bloomIntensity,
      settings.progressiveAccumulation ? 0.35 : 0.65
    );
  }
}
