// src/renderer/shaders/raymarch.glsl.ts
// Primary raymarching shader supporting thin-lens DoF, chromatic dispersion, SSS, and volumetrics

import { COMMON_GLSL } from './common.glsl.ts';

export const RAYMARCH_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export function buildRaymarchFrag(formulaGLSL: string): string {
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

${COMMON_GLSL}

// Injected formula distance estimator
${formulaGLSL}

// Normal calculation via tetrahedron gradient
vec3 calcNormal(vec3 pos) {
    const vec2 e = vec2(1.0, -1.0) * 0.0008;
    vec4 t;
    return normalize(
        e.xyy * mapFractal(pos + e.xyy, t) +
        e.yyx * mapFractal(pos + e.yyx, t) +
        e.yxy * mapFractal(pos + e.yxy, t) +
        e.xxx * mapFractal(pos + e.xxx, t)
    );
}

// Soft shadow calculation
float calcShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float t = mint;
    vec4 trap;
    for (int i = 0; i < 32; i++) {
        if (t >= maxt) break;
        float h = mapFractal(ro + rd * t, trap);
        if (h < 0.0004) return 0.0;
        res = min(res, k * h / t);
        t += clamp(h, 0.002, 0.08);
    }
    return clamp(res, 0.0, 1.0);
}

// Ambient occlusion calculation
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    vec4 trap;
    for (int i = 0; i < 5; i++) {
        float h = 0.005 + 0.03 * float(i);
        float d = mapFractal(pos + h * nor, trap);
        occ += (h - d) * sca;
        sca *= 0.85;
    }
    return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

// Primary Raymarcher
void main() {
    // Screen coordinates with sub-pixel jitter
    vec2 p = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / u_resolution.y;

    // Camera basis vectors
    vec3 cw = normalize(u_camTarget - u_camPos);
    vec3 cp = u_camUp;
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));

    // Focal plane & Thin-lens Depth of Field (DoF) Bokeh
    vec3 primaryDir = normalize(p.x * cu + p.y * cv + 1.8 * cw);
    vec3 focalPoint = u_camPos + primaryDir * u_focalDistance;

    // Lens aperture disk offset
    vec2 lensOffset = u_lensJitter * u_aperture;
    vec3 rayOrigin = u_camPos + cu * lensOffset.x + cv * lensOffset.y;
    vec3 rayDir = normalize(focalPoint - rayOrigin);

    // Primary raymarch traversal
    float t = 0.01;
    float maxDist = 20.0;
    vec4 trap = vec4(0.0);
    bool hit = false;
    vec3 hitPos = vec3(0.0);
    float glow = 0.0;
    float godrays = 0.0;

    for (int i = 0; i < 110; i++) {
        vec3 currPos = rayOrigin + rayDir * t;
        float d = mapFractal(currPos, trap);

        // Volumetric step accumulation (inner ethereal glow)
        glow += 0.0015 / (0.015 + d * d);

        // Volumetric light shafts (God rays)
        if (u_godraysIntensity > 0.01) {
            float lightAlign = dot(rayDir, u_lightDir);
            float phase = henyeyGreenstein(lightAlign, 0.65);
            godrays += phase * exp(-t * u_fogDensity * 0.8) * 0.002 * u_godraysIntensity;
        }

        if (d < 0.0005 * t) {
            hit = true;
            hitPos = currPos;
            break;
        }
        t += d * 0.85;
        if (t > maxDist) break;
    }

    vec3 sceneColor = vec3(0.0);

    if (hit) {
        vec3 nor = calcNormal(hitPos);
        vec3 viewDir = -rayDir;
        
        // PBR & Cosine Palette Surface Coloring
        float orbitCoord = clamp(length(trap.xyz) * 0.45 + trap.w * 0.15, 0.0, 1.0);
        vec3 albedo = cosinePalette(orbitCoord, u_palA, u_palB, u_palC, u_palD);

        // Diffuse & Direct Specular (GGX-like)
        float diff = max(dot(nor, u_lightDir), 0.0);
        vec3 halfVec = normalize(u_lightDir + viewDir);
        float spec = pow(max(dot(nor, halfVec), 0.0), 32.0);

        // Shadows & AO
        float shadow = calcShadow(hitPos + nor * 0.002, u_lightDir, 0.01, 4.0, 16.0);
        float ao = calcAO(hitPos, nor);

        // Fresnel term
        float fresnel = pow(clamp(1.0 - dot(viewDir, nor), 0.0, 1.0), 4.0);

        // Subsurface Scattering (SSS) approximation
        float sss = smoothstep(0.0, 0.2, mapFractal(hitPos + u_lightDir * 0.1, trap)) * u_subsurface;

        // Emissive Orbit Trap Veins
        vec3 emissive = albedo * pow(clamp(1.0 - trap.w, 0.0, 1.0), 4.0) * u_emissiveVeins;

        // Assemble PBR surface lighting
        vec3 ambient = vec3(0.03, 0.04, 0.07) * albedo * ao;
        vec3 direct = (diff * shadow + sss) * albedo * vec3(1.2, 1.15, 1.0);
        vec3 specularLight = spec * shadow * vec3(1.0, 0.95, 0.9);

        // Chromatic dispersion transmission
        if (u_dispersion > 0.001) {
            vec3 refractR = refract(rayDir, nor, 1.0 / (u_ior - u_dispersion));
            vec3 refractG = refract(rayDir, nor, 1.0 / u_ior);
            vec3 refractB = refract(rayDir, nor, 1.0 / (u_ior + u_dispersion));
            direct.r += max(dot(refractR, u_lightDir), 0.0) * 0.3;
            direct.g += max(dot(refractG, u_lightDir), 0.0) * 0.3;
            direct.b += max(dot(refractB, u_lightDir), 0.0) * 0.3;
        }

        sceneColor = ambient + direct + specularLight + emissive + fresnel * 0.4;

        // Volumetric distance fog
        float fogFactor = 1.0 - exp(-t * u_fogDensity);
        vec3 fogColor = vec3(0.02, 0.03, 0.06);
        sceneColor = mix(sceneColor, fogColor, fogFactor);

    } else {
        // Deep cosmos background with subtle directional light gradient
        float sunHighlight = pow(max(dot(rayDir, u_lightDir), 0.0), 8.0);
        sceneColor = vec3(0.015, 0.02, 0.035) + vec3(0.12, 0.1, 0.08) * sunHighlight;
    }

    // Additive volumetric glow and god rays
    sceneColor += glow * cosinePalette(0.7, u_palA, u_palB, u_palC, u_palD);
    sceneColor += godrays * vec3(1.0, 0.9, 0.7);

    fragColor = vec4(sceneColor, 1.0);
}
`;
}
