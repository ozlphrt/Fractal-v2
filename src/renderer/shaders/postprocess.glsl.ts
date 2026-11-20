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
uniform sampler2D u_transitionTexture;
uniform float u_transitionWeight;
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

    // Optical Bloom: Multi-tap HDR specular highlight scattering
    if (u_bloomIntensity > 0.001) {
        vec2 texel = 1.0 / vec2(textureSize(u_accumTexture, 0));
        vec3 bloom = vec3(0.0);
        vec2 bOffsets[8] = vec2[](
            vec2(-2.5, -2.5), vec2(2.5, -2.5), vec2(-2.5, 2.5), vec2(2.5, 2.5),
            vec2(-4.5,  0.0), vec2(4.5,  0.0), vec2( 0.0, -4.5), vec2(0.0,  4.5)
        );
        for (int i = 0; i < 8; i++) {
            vec3 tap = texture(u_accumTexture, uv + bOffsets[i] * texel * 1.8).rgb;
            vec3 bright = max(vec3(0.0), tap - 0.65);
            bloom += bright * 0.125;
        }
        color += bloom * u_bloomIntensity * 2.5;
    }

    // Apply exposure
    color *= u_exposure;

    // ACES filmic tone reproduction
    vec3 mapped = ACESFilm(color);

    // Subtle natural optical vignette
    float vignette = smoothstep(1.2, 0.45, dist);
    mapped *= vignette;

    // Standard gamma correction
    mapped = pow(mapped, vec3(1.0 / 2.2));

    // Seamless formula transition cross-dissolve
    if (u_transitionWeight > 0.001) {
        float tr_r = texture(u_transitionTexture, uv + offset * ca).r;
        float tr_g = texture(u_transitionTexture, uv).g;
        float tr_b = texture(u_transitionTexture, uv - offset * ca).b;
        vec3 tr_color = vec3(tr_r, tr_g, tr_b);
        tr_color *= u_exposure;
        vec3 tr_mapped = ACESFilm(tr_color) * vignette;
        tr_mapped = pow(tr_mapped, vec3(1.0 / 2.2));

        // Smooth cubic blending
        float w = u_transitionWeight * u_transitionWeight * (3.0 - 2.0 * u_transitionWeight);
        mapped = mix(mapped, tr_mapped, w);
    }

    fragColor = vec4(mapped, 1.0);
}
`;
