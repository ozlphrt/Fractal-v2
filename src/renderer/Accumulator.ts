// src/renderer/Accumulator.ts
// Ping-pong floating-point accumulation engine for progressive path-tracing & subpixel DoF anti-aliasing

export const ACCUM_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const ACCUM_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_currentFrame;
uniform sampler2D u_prevAccum;
uniform float u_sampleCount;

void main() {
    vec4 current = texture(u_currentFrame, v_uv);
    if (u_sampleCount <= 1.0) {
        fragColor = current;
    } else {
        vec4 prev = texture(u_prevAccum, v_uv);
        float weight = 1.0 / u_sampleCount;
        fragColor = mix(prev, current, weight);
    }
}
`;

export class Accumulator {
  private gl: WebGL2RenderingContext;
  private width: number = 0;
  private height: number = 0;
  
  // Ping-pong textures and framebuffers
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private textures: [WebGLTexture, WebGLTexture] | null = null;
  private currentReadIndex = 0;
  
  // Accumulation shader program
  private program: WebGLProgram | null = null;
  private currentFrameLoc: WebGLUniformLocation | null = null;
  private prevAccumLoc: WebGLUniformLocation | null = null;
  private sampleCountLoc: WebGLUniformLocation | null = null;

  public sampleCount: number = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initProgram();
  }

  private initProgram() {
    const gl = this.gl;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, ACCUM_VERT);
    gl.compileShader(vert);

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, ACCUM_FRAG);
    gl.compileShader(frag);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);

    this.program = prog;
    this.currentFrameLoc = gl.getUniformLocation(prog, 'u_currentFrame');
    this.prevAccumLoc = gl.getUniformLocation(prog, 'u_prevAccum');
    this.sampleCountLoc = gl.getUniformLocation(prog, 'u_sampleCount');
  }

  public resize(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;

    const gl = this.gl;
    // Clean up old textures/fbos
    if (this.textures) {
      gl.deleteTexture(this.textures[0]);
      gl.deleteTexture(this.textures[1]);
      gl.deleteFramebuffer(this.fbos![0]);
      gl.deleteFramebuffer(this.fbos![1]);
    }

    const ext = gl.getExtension('EXT_color_buffer_float');
    const internalFormat = ext ? gl.RGBA16F : gl.RGBA;
    const type = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const createFBO = (): [WebGLFramebuffer, WebGLTexture] => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

      return [fbo, tex];
    };

    const [fbo0, tex0] = createFBO();
    const [fbo1, tex1] = createFBO();

    this.fbos = [fbo0, fbo1];
    this.textures = [tex0, tex1];
    this.reset();
  }

  public reset() {
    this.sampleCount = 0;
  }

  public accumulate(currentFrameTexture: WebGLTexture, quadVAO: WebGLVertexArrayObject): WebGLTexture {
    const gl = this.gl;
    if (!this.fbos || !this.textures || !this.program) return currentFrameTexture;

    this.sampleCount++;
    const writeIndex = 1 - this.currentReadIndex;
    const writeFBO = this.fbos[writeIndex];
    const prevTexture = this.textures[this.currentReadIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO);
    gl.viewport(0, 0, this.width, this.height);

    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentFrameTexture);
    gl.uniform1i(this.currentFrameLoc, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prevTexture);
    gl.uniform1i(this.prevAccumLoc, 1);

    gl.uniform1f(this.sampleCountLoc, this.sampleCount);

    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.currentReadIndex = writeIndex;
    return this.textures[writeIndex];
  }

  public getOutputTexture(): WebGLTexture | null {
    if (!this.textures) return null;
    return this.textures[this.currentReadIndex];
  }
}
