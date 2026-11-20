// src/renderer/PostProcessor.ts
// Post-processing pipeline: ACES filmic tonemapping, exposure, chromatic aberration, vignette

import { POST_PROCESS_VERT, COMPOSITE_FRAG } from './shaders/postprocess.glsl.ts';

export class PostProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private quadVAO: WebGLVertexArrayObject;

  private accumTextureLoc: WebGLUniformLocation | null = null;
  private exposureLoc: WebGLUniformLocation | null = null;
  private bloomIntensityLoc: WebGLUniformLocation | null = null;
  private chromaticAberrationLoc: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext, quadVAO: WebGLVertexArrayObject) {
    this.gl = gl;
    this.quadVAO = quadVAO;
    this.initShaders();
  }

  private initShaders() {
    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, POST_PROCESS_VERT);
    gl.compileShader(vert);

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, COMPOSITE_FRAG);
    gl.compileShader(frag);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);

    this.program = prog;
    this.accumTextureLoc = gl.getUniformLocation(prog, 'u_accumTexture');
    this.exposureLoc = gl.getUniformLocation(prog, 'u_exposure');
    this.bloomIntensityLoc = gl.getUniformLocation(prog, 'u_bloomIntensity');
    this.chromaticAberrationLoc = gl.getUniformLocation(prog, 'u_chromaticAberration');
  }

  public render(
    accumTexture: WebGLTexture,
    exposure: number = 1.0,
    bloomIntensity: number = 0.8,
    chromaticAberration: number = 1.0
  ) {
    const gl = this.gl;
    if (!this.program) return;

    // Render directly to default screen framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumTexture);
    gl.uniform1i(this.accumTextureLoc, 0);

    gl.uniform1f(this.exposureLoc, exposure);
    gl.uniform1f(this.bloomIntensityLoc, bloomIntensity);
    gl.uniform1f(this.chromaticAberrationLoc, chromaticAberration);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
