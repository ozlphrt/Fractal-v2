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

    // 2. Optical Bloom: Smooth circular HDR highlight scattering (zero directional ghosting)
    if (u_bloomIntensity > 0.001) {
        vec2 texel = 1.0 / vec2(textureSize(u_accumTexture, 0));
        vec3 bloom = vec3(0.0);

        // 16-tap smooth concentric circular distribution (radii: 2.5px, 5.5px, 10.0px, 16.0px)
        // Uniform angular distribution prevents any discrete ghost twins or directional tearing
        const vec2 bloomOffsets[16] = vec2[](
            // Inner halo (2.5 texels)
            vec2( 2.50,  0.00), vec2( 0.00,  2.50), vec2(-2.50,  0.00), vec2( 0.00, -2.50),
            // Mid-inner halo (5.5 texels, rotated 45 deg)
            vec2( 3.89,  3.89), vec2(-3.89,  3.89), vec2(-3.89, -3.89), vec2( 3.89, -3.89),
            // Mid-outer aura (10.0 texels, rotated 22.5 deg)
            vec2( 9.24,  3.83), vec2(-3.83,  9.24), vec2(-9.24, -3.83), vec2( 3.83, -9.24),
            // Outer atmospheric glow (16.0 texels, rotated 67.5 deg)
            vec2( 6.12, 14.78), vec2(-14.78,  6.12), vec2(-6.12, -14.78), vec2(14.78, -6.12)
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
            
            // Soft-knee threshold extraction: highlights & specular glints glow, midtones keep rich contrast
            float threshold = 0.32;
            float knee = 0.25;
            float soft = clamp((luma - threshold + knee) / (2.0 * knee), 0.0, 1.0);
            float weight = max(soft * soft, max(0.0, luma - threshold));
            vec3 bright = tap * (weight / max(luma, 1e-4));

            bloom += bright * bloomWeights[i];
        }

        // Add subtle warm anamorphic tint to the outer bloom aura
        vec3 bloomTinted = mix(bloom, bloom * vec3(1.05, 0.98, 0.92), 0.30);
        color += bloomTinted * (u_bloomIntensity * 2.0);
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
