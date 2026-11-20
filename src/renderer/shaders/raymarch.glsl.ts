// src/renderer/shaders/raymarch.glsl.ts
// Primary raymarching shader supporting thin-lens DoF, chromatic dispersion, SSS, and volumetrics

import { COMMON_GLSL } from './common.glsl.ts';
import { FormulaDefinition } from '../../core/types.ts';

export const RAYMARCH_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export function buildRaymarchFrag(formula: FormulaDefinition): string {
  const formulaUniforms = formula.params
    .map(p => `uniform ${p.type === 'int' ? 'int' : 'float'} ${p.uniform};`)
    .join('\n');

  return /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Camera & Frame Uniforms
uniform vec3 u_camPos;
uniform vec3 u_camTarget;
uniform vec3 u_camUp;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_jitter; // Halton sub-pixel jitter
uniform vec2 u_lensJitter; // Halton lens bokeh jitter

// Optics & Physics Uniforms
uniform float u_focalDistance;
uniform float u_aperture;
uniform float u_ior;
uniform float u_dispersion;
uniform float u_subsurface;
uniform float u_emissiveVeins;

// Volumetrics & Lighting
uniform vec3 u_lightDir;
uniform float u_fogDensity;
uniform float u_godraysIntensity;

// IQ Cosine Palette
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;

// Formula-specific dynamic parameter uniforms
${formulaUniforms}

${COMMON_GLSL}

// Injected formula distance estimator
${formula.glslDE}

// Macroscopic 4-tap Tetrahedron Normal (Analytic gradient, zero micro-grit flickering)
vec3 calcNormal(vec3 p, float eps) {
    const vec2 k = vec2(1.0, -1.0);
    vec4 t;
    return normalize(
        k.xyy * mapFractal(p + k.xyy * eps, t) +
        k.yyx * mapFractal(p + k.yyx * eps, t) +
        k.yxy * mapFractal(p + k.yxy * eps, t) +
        k.xxx * mapFractal(p + k.xxx * eps, t)
    );
}

// Continuous soft shadow with penumbra
float calcShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    vec4 trap;
    for (int i = 0; i < 24; i++) {
        if (t >= maxt) break;
        float h = mapFractal(ro + rd * t, trap);
        if (h < 0.0005) return 0.0;
        res = min(res, k * h / t);
        t += clamp(h * 0.85, 0.015, 0.25);
    }
    return clamp(res, 0.0, 1.0);
}

// Ambient occlusion with multi-step radius filtering
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    vec4 trap;
    for (int i = 0; i < 4; i++) {
        float h = 0.02 + 0.12 * float(i);
        float d = mapFractal(pos + h * nor, trap);
        occ += max(0.0, h - d) * sca;
        sca *= 0.75;
    }
    return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

// Primary Raymarcher
void main() {
    // Screen coordinates with sub-pixel jitter
    vec2 p = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // Camera basis vectors
    vec3 cw = normalize(u_camTarget - u_camPos);
    vec3 cu = normalize(cross(cw, u_camUp));
    vec3 cv = cross(cu, cw);

    // Focal plane & Thin-lens Depth of Field (DoF) Bokeh
    vec3 primaryDir = normalize(p.x * cu + p.y * cv + 1.8 * cw);
    vec3 focalPoint = u_camPos + primaryDir * u_focalDistance;

    // Lens aperture disk offset
    vec2 lensOffset = u_lensJitter * u_aperture;
    vec3 rayOrigin = u_camPos + cu * lensOffset.x + cv * lensOffset.y;
    vec3 rayDir = normalize(focalPoint - rayOrigin);

    // Primary raymarch traversal
    float t = 0.05;
    float maxDist = 12.0;
    vec4 trap = vec4(100.0);
    vec4 finalTrap = vec4(0.0);
    bool hit = false;
    vec3 hitPos = vec3(0.0);
    float glow = 0.0;
    float godrays = 0.0;

    for (int i = 0; i < 140; i++) {
        if (t > maxDist) break;
        vec3 currPos = rayOrigin + rayDir * t;
        float d = mapFractal(currPos, trap);

        // Subtle, bounded volumetric glow near surface boundaries
        float g = max(0.0, 1.0 - d * 2.8);
        glow += g * g;

        // Soft volumetric god rays
        if (u_godraysIntensity > 0.01) {
            float lightAlign = dot(rayDir, u_lightDir);
            float phase = henyeyGreenstein(lightAlign, 0.65);
            godrays += phase * exp(-t * u_fogDensity * 0.5) * 0.001 * u_godraysIntensity;
        }

        float hitThresh = 0.0006 * (1.0 + t * 0.02);
        if (d < hitThresh) {
            // Hit refinement step to eliminate chatter
            t += d * 0.5;
            hit = true;
            hitPos = rayOrigin + rayDir * t;
            finalTrap = trap;
            break;
        }
        // Conservative 0.68x ray stepping to eliminate grazing lattice overshoots
        t += max(hitThresh * 0.4, d * 0.68);
    }

    vec3 sceneColor = vec3(0.0);

    if (hit) {
        // Macroscopic curvature normal: filters out chaotic sub-pixel micro-grit
        float normEps = max(0.0028, t * 0.0012);
        vec3 nor = calcNormal(hitPos, normEps);
        vec3 viewDir = -rayDir;
        
        // PBR & Cosine Palette Surface Coloring
        float orbitCoord = clamp(finalTrap.y * 1.8 + finalTrap.z * 0.6, 0.0, 1.0);
        vec3 albedo = cosinePalette(orbitCoord, u_palA, u_palB, u_palC, u_palD);
        albedo = clamp(albedo, 0.0, 1.0);

        // Diffuse & Specular Lighting
        float diff = clamp(dot(nor, u_lightDir), 0.0, 1.0);
        vec3 halfVec = normalize(u_lightDir + viewDir);
        float spec = pow(clamp(dot(nor, halfVec), 0.0, 1.0), 32.0);

        // Shadows & AO
        float shadow = (diff > 0.01) ? calcShadow(hitPos + nor * max(0.012, normEps * 3.0), u_lightDir, 0.02, 3.5, 12.0) : 0.0;
        float ao = calcAO(hitPos, nor);

        // Subtle crevice weathering
        albedo = mix(albedo * 0.6, albedo, smoothstep(0.1, 0.9, ao));

        // Fresnel reflection
        float fresnel = pow(clamp(1.0 - dot(viewDir, nor), 0.0, 1.0), 4.0);

        // Subsurface Scattering (SSS) approximation
        vec4 sssTrap;
        float sss = smoothstep(0.0, 0.15, mapFractal(hitPos + u_lightDir * 0.08, sssTrap)) * u_subsurface * 0.3;

        // Subtle emissive veins from orbit trap
        float veinMask = pow(clamp(1.0 - finalTrap.y * 2.5, 0.0, 1.0), 4.0);
        vec3 emissive = albedo * veinMask * u_emissiveVeins * 0.4;

        // Assemble PBR surface lighting
        vec3 ambient = vec3(0.04, 0.05, 0.08) * albedo * ao;
        vec3 direct = (diff * shadow + sss) * albedo * vec3(1.1, 1.05, 0.95);
        vec3 specularLight = spec * shadow * vec3(0.9, 0.88, 0.85);

        // Chromatic dispersion transmission
        if (u_dispersion > 0.001) {
            vec3 refractR = refract(rayDir, nor, 1.0 / (u_ior - u_dispersion));
            vec3 refractG = refract(rayDir, nor, 1.0 / u_ior);
            vec3 refractB = refract(rayDir, nor, 1.0 / (u_ior + u_dispersion));
            direct.r += max(dot(refractR, u_lightDir), 0.0) * 0.15;
            direct.g += max(dot(refractG, u_lightDir), 0.0) * 0.15;
            direct.b += max(dot(refractB, u_lightDir), 0.0) * 0.15;
        }

        sceneColor = ambient + direct + specularLight + emissive + fresnel * 0.25;

        // Volumetric distance fog
        float fogFactor = 1.0 - exp(-t * u_fogDensity);
        vec3 fogColor = vec3(0.015, 0.025, 0.045);
        sceneColor = mix(sceneColor, fogColor, fogFactor);

    } else {
        // Celestial deep midnight space background with subtle sun glow
        float sunHighlight = pow(max(dot(rayDir, u_lightDir), 0.0), 16.0);
        vec3 skyTop = vec3(0.012, 0.018, 0.035);
        vec3 skyBottom = vec3(0.004, 0.006, 0.012);
        vec3 skyBg = mix(skyBottom, skyTop, clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0));
        sceneColor = skyBg + vec3(0.18, 0.15, 0.1) * sunHighlight;
    }

    // Additive bounded volumetric glow and god rays
    sceneColor += glow * 0.0015 * cosinePalette(0.65, u_palA, u_palB, u_palC, u_palD);
    sceneColor += godrays * vec3(0.9, 0.85, 0.75);

    fragColor = vec4(sceneColor, 1.0);
}
`;
}
