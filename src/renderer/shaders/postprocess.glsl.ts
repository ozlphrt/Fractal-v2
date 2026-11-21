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
uniform float u_focalDistance;
uniform float u_aperture;

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

    // 1. Depth-Aware Photographic Bokeh (Circle of Confusion DoF)
    if (u_aperture > 0.0005) {
        const float MAX_DEPTH = 25.0;
        float depth = texture(u_accumTexture, uv).a * MAX_DEPTH;
        // Thin-lens Circle of Confusion (CoC): pin-sharp at u_focalDistance, smoothly blurred elsewhere
        float coc = clamp(abs(depth - u_focalDistance) / max(0.4, depth) * u_aperture * 220.0, 0.0, 24.0);

        if (coc > 0.35) {
            vec2 texel = 1.0 / vec2(textureSize(u_accumTexture, 0));
            vec3 dofColor = color;
            float totalWeight = 1.0;

            // 16-tap dual-ring bokeh aperture pattern
            const vec2 bokehSamples[16] = vec2[](
                // Inner ring (radius 0.45)
                vec2( 0.450,  0.000), vec2( 0.225,  0.390), vec2(-0.225,  0.390),
                vec2(-0.450,  0.000), vec2(-0.225, -0.390), vec2( 0.225, -0.390),
                // Outer ring (radius 1.0)
                vec2( 1.000,  0.000), vec2( 0.766,  0.643), vec2( 0.174,  0.985),
                vec2(-0.500,  0.866), vec2(-0.940,  0.342), vec2(-0.866, -0.500),
                vec2(-0.342, -0.940), vec2( 0.342, -0.940), vec2( 0.866, -0.500),
                vec2( 0.940,  0.342)
            );

            for (int i = 0; i < 16; i++) {
                vec2 tapUV = uv + bokehSamples[i] * texel * coc;
                vec4 tapSample = texture(u_accumTexture, tapUV);
                float tapDepth = tapSample.a * MAX_DEPTH;
                float tapCoC = clamp(abs(tapDepth - u_focalDistance) / max(0.4, tapDepth) * u_aperture * 220.0, 0.0, 24.0);

                // Depth-aware bleeding control:
                // Foreground blur bleeds over background; background does not bleed into sharp foreground
                float depthDiff = tapDepth - depth;
                float w = (depthDiff >= -0.25) ? 1.0 : smoothstep(0.0, 1.0, tapCoC / max(0.1, coc));

                // Bokeh highlight boost: out-of-focus specular facets form luminous circular bokeh discs
                float luma = dot(tapSample.rgb, vec3(0.2126, 0.7152, 0.0722));
                w *= 1.0 + smoothstep(0.35, 1.1, luma) * 1.8;

                dofColor += tapSample.rgb * w;
                totalWeight += w;
            }
            color = dofColor / totalWeight;
        }
    }

    // 2. Optical Bloom: Multi-tier HDR specular highlight scattering & atmospheric radiance
    if (u_bloomIntensity > 0.001) {
        vec2 texel = 1.0 / vec2(textureSize(u_accumTexture, 0));
        vec3 bloom = vec3(0.0);

        // 16-tap multi-tier distribution (4 radial tiers: 3.5px, 9px, 22px, 52px)
        const vec2 bloomOffsets[16] = vec2[](
            // Tier 1: Tight specular halo (3.5 texels)
            vec2( 0.0,  3.5), vec2( 3.5,  0.0), vec2( 0.0, -3.5), vec2(-3.5,  0.0),
            // Tier 2: Medium specular body (9.0 texels)
            vec2( 6.3,  6.3), vec2( 6.3, -6.3), vec2(-6.3, -6.3), vec2(-6.3,  6.3),
            // Tier 3: Wide diffuse aura (22.0 texels)
            vec2( 0.0, 22.0), vec2(22.0,  0.0), vec2( 0.0,-22.0), vec2(-22.0,  0.0),
            // Tier 4: Broad atmospheric glow (52.0 texels)
            vec2(36.8, 36.8), vec2(36.8,-36.8), vec2(-36.8,-36.8), vec2(-36.8, 36.8)
        );

        const float bloomWeights[16] = float[](
            0.18, 0.18, 0.18, 0.18,
            0.10, 0.10, 0.10, 0.10,
            0.05, 0.05, 0.05, 0.05,
            0.025, 0.025, 0.025, 0.025
        );

        for (int i = 0; i < 16; i++) {
            vec2 tapUV = uv + bloomOffsets[i] * texel;
            vec3 tap = texture(u_accumTexture, tapUV).rgb;
            float luma = dot(tap, vec3(0.2126, 0.7152, 0.0722));
            
            // Soft-knee threshold extraction: captures highlights, specular facets, and glowing edges
            float threshold = 0.25;
            float knee = 0.25;
            float soft = clamp((luma - threshold + knee) / (2.0 * knee), 0.0, 1.0);
            float weight = max(soft * soft, max(0.0, luma - threshold));
            vec3 bright = tap * (weight / max(luma, 1e-4));

            bloom += bright * bloomWeights[i];
        }

        // Add subtle warm anamorphic tint to the outer bloom aura
        vec3 bloomTinted = mix(bloom, bloom * vec3(1.06, 0.98, 0.90), 0.35);
        color += bloomTinted * (u_bloomIntensity * 4.2);
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
