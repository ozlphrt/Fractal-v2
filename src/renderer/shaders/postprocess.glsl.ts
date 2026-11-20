// src/renderer/shaders/postprocess.glsl.ts
// HDR Post-Processing: Bloom downsample/upsample, ACES filmic tonemapping, chromatic aberration, vignette

export const POST_PROCESS_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_accumTexture;
uniform float u_exposure;
uniform float u_bloomIntensity;
uniform float u_chromaticAberration;

// ACES Filmic Tone Mapping Curve (Narkowicz 2015)
vec3 ACESFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 uv = v_uv;
    vec2 offset = (uv - 0.5);
    float dist = length(offset);

    // Subtle optical chromatic aberration along screen edges
    float ca = u_chromaticAberration * dist * 0.015;
    float r = texture(u_accumTexture, uv + offset * ca).r;
    float g = texture(u_accumTexture, uv).g;
    float b = texture(u_accumTexture, uv - offset * ca).b;
    vec3 color = vec3(r, g, b);

    // Apply exposure
    color *= u_exposure;

    // ACES filmic tone reproduction
    vec3 mapped = ACESFilm(color);

    // Subtle natural optical vignette
    float vignette = smoothstep(1.2, 0.45, dist);
    mapped *= vignette;

    // Standard gamma correction
    mapped = pow(mapped, vec3(1.0 / 2.2));

    fragColor = vec4(mapped, 1.0);
}
`;
