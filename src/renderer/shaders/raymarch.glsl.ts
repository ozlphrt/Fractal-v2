// src/renderer/shaders/raymarch.glsl.ts
// Primary raymarching shader with natural geological materials, soft shadows, and clean lighting

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
uniform float u_sunIntensity;
uniform float u_rimIntensity;
uniform float u_rimElevation;
uniform float u_fillIntensity;
uniform float u_headlampIntensity;
uniform float u_fogDensity;
uniform float u_godraysIntensity;

// Natural Geological Cosine Palette
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

// Continuous soft shadow with geometric penumbra
float calcShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float ph = 1e10;
    float t = mint;
    vec4 trap;
    for (int i = 0; i < 20; i++) {
        if (t >= maxt) break;
        float h = mapFractal(ro + rd * t, trap);
        if (h < 0.0005) return 0.0;
        float y = h * h / (2.0 * ph);
        float d = sqrt(max(0.0, h * h - y * y));
        res = min(res, k * d / max(0.0, t - y));
        ph = h;
        if (res < 0.02) return 0.0;
        t += clamp(h * 0.85, 0.02, 0.3);
    }
    return clamp(res, 0.0, 1.0);
}

// High-efficiency Ambient Occlusion with macro-radius filtering
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    vec4 trap;
    for (int i = 0; i < 4; i++) {
        float h = 0.025 + 0.12 * float(i);
        float d = mapFractal(pos + h * nor, trap);
        occ += max(0.0, h - d) * sca;
        sca *= 0.72;
    }
    return clamp(1.0 - 1.8 * occ, 0.0, 1.0);
}

// Primary Raymarcher
void main() {
    // Screen coordinates with sub-pixel jitter
    vec2 p = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // Camera basis vectors
    vec3 cw = normalize(u_camTarget - u_camPos);
    vec3 cu = normalize(cross(cw, u_camUp));
    vec3 cv = cross(cu, cw);

    // Focal plane & Thin-lens Depth of Field (DoF)
    vec3 primaryDir = normalize(p.x * cu + p.y * cv + 1.8 * cw);
    vec3 focalPoint = u_camPos + primaryDir * u_focalDistance;

    // Lens aperture disk offset
    vec2 lensOffset = u_lensJitter * u_aperture;
    vec3 rayOrigin = u_camPos + cu * lensOffset.x + cv * lensOffset.y;
    vec3 rayDir = normalize(focalPoint - rayOrigin);

    // Primary raymarch traversal
    float t = 0.05;
    float maxDist = 14.0;
    vec4 trap = vec4(100.0);
    vec4 finalTrap = vec4(0.0);
    bool hit = false;
    vec3 hitPos = vec3(0.0);
    float glow = 0.0;
    float godrays = 0.0;

    for (int i = 0; i < 260; i++) {
        if (t > maxDist) break;
        vec3 currPos = rayOrigin + rayDir * t;
        float d = mapFractal(currPos, trap);

        // Bounded volumetric glow
        if (d < 0.25) {
            float g = max(0.0, 1.0 - d * 4.0);
            glow += g * g * 0.0006;
        }

        // Soft volumetric god rays
        if (u_godraysIntensity > 0.01) {
            float lightAlign = dot(rayDir, u_lightDir);
            float phase = henyeyGreenstein(lightAlign, 0.65);
            godrays += phase * exp(-t * u_fogDensity * 0.5) * 0.0004 * u_godraysIntensity;
        }

        float hitThresh = 0.0012 * (1.0 + t * 0.015);
        if (d < hitThresh) {
            t += d * 0.5;
            hit = true;
            hitPos = rayOrigin + rayDir * t;
            finalTrap = trap;
            break;
        }
        // Conservative 0.68x ray stepping to eliminate grazing lattice overshoots
        t += max(hitThresh * 0.35, d * 0.68);
    }

    vec3 sceneColor = vec3(0.0);

    if (hit) {
        // Macroscopic curvature normal: filters out chaotic sub-pixel micro-grit
        float normEps = max(0.0028, t * 0.0012);
        vec3 nor = calcNormal(hitPos, normEps);
        vec3 viewDir = -rayDir;
        
        // Natural Geological Surface Coloring (stratified mineral layers from radial trap)
        float trapVal = finalTrap.x;
        float tCoord = trapVal * 0.45;
        vec3 albedo = clamp(cosinePalette(tCoord, u_palA, u_palB, u_palC, u_palD), 0.0, 1.0);

        // Diffuse & Specular Lighting
        float diff = clamp(dot(nor, u_lightDir), 0.0, 1.0);
        vec3 halfVec = normalize(u_lightDir + viewDir);
        float spec = pow(clamp(dot(nor, halfVec), 0.0, 1.0), 24.0);

        // Soft Shadows & AO
        float shadow = (diff > 0.005) ? calcShadow(hitPos + nor * max(0.012, normEps * 3.0), u_lightDir, 0.025, 4.0, 12.0) : 0.0;
        float ao = calcAO(hitPos, nor);

        // Natural rock crevice weathering
        albedo = mix(albedo * 0.65, albedo, smoothstep(0.1, 0.9, ao));

        // Subtle mineral specular reflection
        vec3 sunColor = vec3(1.0, 0.94, 0.85);
        vec3 ambientFill = vec3(0.14, 0.16, 0.20) * (0.5 + 0.5 * nor.y);

        // 1. Primary Key Light (Sun)
        vec3 directLight = diff * shadow * sunColor * 0.95 * u_sunIntensity;
        vec3 specularLight = spec * shadow * sunColor * 0.22 * u_sunIntensity;
        vec3 ambientLight = ambientFill * ao * 0.6;

        // 2. Secondary Fill / Bounce Light (soft complementary light)
        vec3 fillDir = normalize(vec3(-u_lightDir.z, 0.35, u_lightDir.x));
        float fillDiff = clamp(dot(nor, fillDir), 0.0, 1.0);
        vec3 fillLight = fillDiff * u_fillIntensity * vec3(0.85, 0.90, 0.95);

        // 3. Rim / Backlight (opposing edge light to illuminate silhouettes)
        float rimRad = radians(u_rimElevation);
        vec3 rimDir = normalize(vec3(-u_lightDir.x, sin(rimRad), -u_lightDir.z));
        float rimDiff = clamp(dot(nor, rimDir), 0.0, 1.0);
        float rimFresnel = pow(clamp(1.0 + dot(nor, rayDir), 0.0, 1.0), 3.0);
        vec3 rimLight = (rimDiff * 0.45 + rimFresnel * 0.55) * u_rimIntensity * vec3(0.70, 0.82, 1.0);

        // 4. Camera-Tracking Flashlight / Headlamp (used in 6DOF Flight Mode)
        vec3 headlampLight = vec3(0.0);
        if (u_headlampIntensity > 0.01) {
            vec3 toLight = u_camPos - hitPos;
            float lDist = length(toLight);
            vec3 lDir = toLight / max(lDist, 1e-4);
            float spotAlign = dot(-lDir, cw); // cw is camera forward
            float spotCone = smoothstep(0.68, 0.92, spotAlign);
            float spotAtten = 1.0 / (1.0 + 0.35 * lDist + 0.15 * lDist * lDist);
            float spotDiff = max(dot(nor, lDir), 0.0);
            headlampLight = spotDiff * spotCone * spotAtten * u_headlampIntensity * vec3(1.0, 0.97, 0.92);
        }

        sceneColor = (directLight + fillLight + ambientLight + headlampLight) * albedo + specularLight + rimLight * albedo;

        // Subtle optional emissive veins
        if (u_emissiveVeins > 0.01) {
            float vein = pow(clamp(1.0 - finalTrap.y * 3.0, 0.0, 1.0), 4.0);
            sceneColor += albedo * vein * u_emissiveVeins * 0.3;
        }

        // Distance fog
        float fogFactor = 1.0 - exp(-t * u_fogDensity);
        vec3 fogColor = vec3(0.03, 0.04, 0.06);
        sceneColor = mix(sceneColor, fogColor, fogFactor);

    } else {
        // Deep natural midnight sky with subtle warm sun glow
        float sunGlow = pow(max(dot(rayDir, u_lightDir), 0.0), 16.0);
        vec3 skyTop = vec3(0.015, 0.02, 0.035);
        vec3 skyBottom = vec3(0.005, 0.008, 0.014);
        vec3 skyBg = mix(skyBottom, skyTop, clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0));
        sceneColor = skyBg + vec3(0.12, 0.10, 0.07) * sunGlow;
    }

    // Soft bounded volumetric glow & atmospheric light shafts
    sceneColor += glow * u_palA * 0.8;
    sceneColor += godrays * vec3(0.9, 0.85, 0.7);

    fragColor = vec4(sceneColor, 1.0);
}
`;
}
