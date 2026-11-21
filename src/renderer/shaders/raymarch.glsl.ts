// src/renderer/shaders/raymarch.glsl.ts
// Optimized raymarching engine with bounding sphere early-out, cool dark blue rim, and volumetric glow

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
uniform vec2 u_screenOffset; // Viewport center offset (e.g. for side drawer compensation)
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

// 3-Point Studio Lighting & Atmosphere
uniform vec3 u_lightDir;
uniform float u_sunIntensity;
uniform float u_rimIntensity;
uniform float u_rimElevation;
uniform float u_fillIntensity;
uniform float u_glowIntensity;
uniform float u_headlampIntensity;
uniform float u_fogDensity;
uniform float u_godraysIntensity;
uniform float u_boundRadius;
uniform int u_maxSteps;

// Audio Reactivity & Structural Mutation Uniforms
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioTreble;
uniform float u_audioLevel;
uniform float u_audioBeat;
uniform float u_audioGlowMod;
uniform float u_audioColorShift;

// Natural Geological Cosine Palette
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;

// Flying Cavity Lights (Photon Orbs)
uniform float u_orbIntensity;
uniform float u_orbRadius;
uniform vec3 u_orbPos0;
uniform vec3 u_orbPos1;
uniform vec3 u_orbPos2;
uniform vec3 u_orbTail0;
uniform vec3 u_orbTail1;
uniform vec3 u_orbTail2;
uniform vec3 u_orbCol0;
uniform vec3 u_orbCol1;
uniform vec3 u_orbCol2;

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

// Continuous soft shadow with geometric penumbra & early exit
float calcShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
    float res = 1.0;
    float ph = 1e10;
    float t = mint;
    vec4 trap;
    for (int i = 0; i < 10; i++) {
        if (t >= maxt) break;
        float h = mapFractal(ro + rd * t, trap);
        if (h < 0.0005) return 0.0;
        float y = h * h / (2.0 * ph);
        float d = sqrt(max(0.0, h * h - y * y));
        res = min(res, k * d / max(0.0, t - y));
        ph = h;
        if (res < 0.02) return 0.0; // Early exit when already in deep shadow
        t += clamp(h * 0.92, 0.03, 0.45);
    }
    return clamp(res, 0.0, 1.0);
}

// High-efficiency Ambient Occlusion with macro-radius filtering and subpixel dither
float calcAO(vec3 pos, vec3 nor, vec2 jitter) {
    float occ = 0.0;
    float sca = 1.0;
    vec4 trap;
    float randOffset = fract(sin(dot(pos.xy + jitter, vec2(12.9898, 78.233))) * 43758.5453);
    for (int i = 0; i < 4; i++) {
        float h = 0.025 + (0.11 + 0.025 * randOffset) * float(i);
        float d = mapFractal(pos + h * nor, trap);
        occ += max(0.0, h - d) * sca;
        sca *= 0.70;
    }
    return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

// Distance to 3D line segment with projection parameter h in [0, 1]
float distToSegment(vec3 p, vec3 a, vec3 b, out float h) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float d2 = dot(ba, ba);
    h = (d2 > 1e-6) ? clamp(dot(pa, ba) / d2, 0.0, 1.0) : 0.0;
    return length(pa - ba * h);
}

// Primary Raymarcher
void main() {
    // Screen coordinates with sub-pixel jitter and viewport offset compensation for side drawer
    vec2 center = 0.5 * u_resolution.xy + u_screenOffset;
    float visibleWidth = u_resolution.x - 2.0 * abs(u_screenOffset.x);
    float visibleHeight = u_resolution.y - 2.0 * abs(u_screenOffset.y);
    float aspectMin = min(visibleWidth, visibleHeight);
    vec2 p = (2.0 * (gl_FragCoord.xy + u_jitter - center)) / aspectMin;

    // Camera basis vectors
    vec3 cw = normalize(u_camTarget - u_camPos);
    vec3 cu = normalize(cross(cw, u_camUp));
    vec3 cv = cross(cu, cw);

    // Focal plane & Thin-lens Depth of Field (DoF) - steady optical scale
    float camFocalScale = 1.8;
    vec3 primaryDir = normalize(p.x * cu + p.y * cv + camFocalScale * cw);
    vec3 focalPoint = u_camPos + primaryDir * u_focalDistance;

    // Lens aperture disk offset
    vec2 lensOffset = u_lensJitter * u_aperture;
    vec3 rayOrigin = u_camPos + cu * lensOffset.x + cv * lensOffset.y;
    vec3 rayDir = normalize(focalPoint - rayOrigin);

    // Primary raymarch traversal (no artificial bounding sphere clipping to prevent corner cut-offs)
    float t = 0.02;
    float maxDist = 18.0;

    vec4 trap = vec4(100.0);
    vec4 finalTrap = vec4(0.0);
    bool hit = false;
    vec3 hitPos = vec3(0.0);
    vec3 glowAccum = vec3(0.0);
    float godrays = 0.0;
    vec3 baseGlowTint = mix(u_palA * 0.7, vec3(0.1, 0.35, 0.9), 0.45);

    int hitOrbIdx = -1;
    float dOrbs = 100.0;
    float dOrb0 = 100.0;
    float dOrb1 = 100.0;
    float dOrb2 = 100.0;

    int maxIters = u_maxSteps > 0 ? u_maxSteps : 180;
    for (int i = 0; i < 350; i++) {
        if (i >= maxIters || t > maxDist) break;
        vec3 currPos = rayOrigin + rayDir * t;
        float dFractal = mapFractal(currPos, trap);

        // Distance to the 3 flying luminous orbs (using u_orbRadius)
        if (u_orbIntensity > 0.001) {
            dOrb0 = length(currPos - u_orbPos0) - u_orbRadius;
            dOrb1 = length(currPos - u_orbPos1) - u_orbRadius;
            dOrb2 = length(currPos - u_orbPos2) - u_orbRadius;
            dOrbs = min(dOrb0, min(dOrb1, dOrb2));
        }

        float d = (u_orbIntensity > 0.001) ? min(dFractal, dOrbs) : dFractal;

        // Subtle, localized volumetric comet tail mist - strictly bounded so it NEVER blows out the scene
        if (u_orbIntensity > 0.001) {
            float tailHaloRadius = max(0.05, u_orbRadius * 3.6);
            float orbAudioMod = 1.0 + (u_audioBass * 0.65 + u_audioBeat * 0.75) * u_audioGlowMod;

            // Orb 0 Head & Fading Tail
            float h0;
            float dTail0 = distToSegment(currPos, u_orbTail0, u_orbPos0, h0);
            if (dTail0 < tailHaloRadius) {
                float mist0 = 1.0 - dTail0 / tailHaloRadius;
                glowAccum += u_orbCol0 * (mist0 * mist0 * pow(h0, 1.8) * 0.038 * u_orbIntensity * orbAudioMod);
            }

            // Orb 1 Head & Fading Tail
            float h1;
            float dTail1 = distToSegment(currPos, u_orbTail1, u_orbPos1, h1);
            if (dTail1 < tailHaloRadius) {
                float mist1 = 1.0 - dTail1 / tailHaloRadius;
                glowAccum += u_orbCol1 * (mist1 * mist1 * pow(h1, 1.8) * 0.038 * u_orbIntensity * orbAudioMod);
            }

            // Orb 2 Head & Fading Tail
            float h2;
            float dTail2 = distToSegment(currPos, u_orbTail2, u_orbPos2, h2);
            if (dTail2 < tailHaloRadius) {
                float mist2 = 1.0 - dTail2 / tailHaloRadius;
                glowAccum += u_orbCol2 * (mist2 * mist2 * pow(h2, 1.8) * 0.038 * u_orbIntensity * orbAudioMod);
            }
        }

        // Calibrated volumetric step glow with organic audio breathing
        if (u_glowIntensity > 0.001 && dFractal < 0.35) {
            float g = max(0.0, 1.0 - dFractal * 2.8);
            float audioGlow = 1.0 + (u_audioMid * 1.8 + u_audioBass * 1.4 + u_audioBeat * 2.0) * u_audioGlowMod;
            glowAccum += baseGlowTint * (g * g * 0.012 * u_glowIntensity * audioGlow);
        }

        // Soft atmospheric god rays with bass modulation
        if (u_godraysIntensity > 0.01) {
            float lightAlign = dot(rayDir, u_lightDir);
            float phase = henyeyGreenstein(lightAlign, 0.65);
            float audioRays = 1.0 + (u_audioBass * 2.2 + u_audioBeat * 1.6) * u_audioGlowMod;
            godrays += phase * exp(-t * u_fogDensity * 0.5) * 0.0006 * u_godraysIntensity * audioRays;
        }

        float hitThresh = 0.0011 * (1.0 + t * 0.015);
        if (d < hitThresh) {
            t += d * 0.5;
            hit = true;
            hitPos = rayOrigin + rayDir * t;
            finalTrap = trap;

            if (u_orbIntensity > 0.001 && dOrbs <= dFractal + 0.0005) {
                if (dOrb0 <= dOrb1 && dOrb0 <= dOrb2) hitOrbIdx = 0;
                else if (dOrb1 <= dOrb2) hitOrbIdx = 1;
                else hitOrbIdx = 2;
            }
            break;
        }
        t += max(hitThresh * 0.35, d * 0.86);
    }

    vec3 sceneColor = vec3(0.0);

    // If ray hit the luminous core of a flying orb, render incandescent light sphere
    if (hitOrbIdx >= 0) {
        vec3 orbCoreCol = (hitOrbIdx == 0) ? u_orbCol0 :
                          (hitOrbIdx == 1) ? u_orbCol1 :
                                             u_orbCol2;
        float orbAudio = 1.0 + (u_audioBass * 1.1 + u_audioBeat * 1.3) * u_audioGlowMod;
        sceneColor = orbCoreCol * (2.8 * u_orbIntensity * orbAudio);
        sceneColor += glowAccum;
        sceneColor += godrays * vec3(0.9, 0.85, 0.7);
        fragColor = vec4(sceneColor, 1.0);
        return;
    }

    if (hit) {
        // Macroscopic curvature normal
        float normEps = max(0.0028, t * 0.0012);
        vec3 nor = calcNormal(hitPos, normEps);
        vec3 viewDir = -rayDir;
        
        // Natural Geological Surface Coloring with dynamic audio phase cascade
        float trapVal = finalTrap.x;
        float colorFlow = (u_audioLevel * 0.45 + u_audioBeat * 0.35) * u_audioColorShift;
        float tCoord = trapVal * 0.45 + colorFlow;
        vec3 bedrockAlbedo = clamp(cosinePalette(tCoord, u_palA, u_palB, u_palC, u_palD), 0.0, 1.0);

        // Soft Shadows & AO
        float diff = clamp(dot(nor, u_lightDir), 0.0, 1.0);
        vec3 halfVec = normalize(u_lightDir + viewDir);
        float shadow = (diff > 0.015) ? calcShadow(hitPos + nor * max(0.012, normEps * 3.0), u_lightDir, 0.025, 4.0, 12.0) : 0.0;
        float ao = calcAO(hitPos, nor, u_jitter);

        // Natural rock crevice weathering
        bedrockAlbedo = mix(bedrockAlbedo * 0.65, bedrockAlbedo, smoothstep(0.1, 0.9, ao));

        // Micro-facet specular highlight
        float specTreble = 0.22 + (u_audioTreble * 1.35 + u_audioBeat * 0.65) * u_audioGlowMod;
        float specShininess = 28.0;
        float specRoughFactor = pow(clamp(dot(nor, halfVec), 0.0, 1.0), specShininess);
        vec3 sunColor = vec3(1.0, 0.94, 0.85);
        vec3 specularLight = specRoughFactor * shadow * sunColor * specTreble * u_sunIntensity;

        // 1. Primary Sun Light with bass breathing
        float sunAudio = 1.0 + (u_audioBass * 0.70 + u_audioBeat * 0.55) * u_audioGlowMod;
        vec3 directLight = diff * shadow * sunColor * 0.95 * u_sunIntensity * sunAudio;

        // 2. Secondary Fill / Bounce Light (soft cool ambient bounce so shadows reveal geological detail)
        vec3 fillDir = normalize(vec3(-u_lightDir.z, -0.3, u_lightDir.x));
        float fillDiff = clamp(dot(nor, fillDir), 0.0, 1.0);
        float fillAudio = 1.0 + (u_audioMid * 0.45 + u_audioLevel * 0.35) * u_audioGlowMod;
        vec3 fillLight = fillDiff * u_fillIntensity * vec3(0.55, 0.62, 0.72) * 0.75 * fillAudio;

        // 3. Subtle Cool Dark Midnight Blue Rim / Backlight (Cinematic edge separation)
        vec3 coolDarkBlue = vec3(0.04, 0.16, 0.52);
        float rimRad = radians(u_rimElevation);
        vec3 rimDir = normalize(vec3(-u_lightDir.x, sin(rimRad), -u_lightDir.z));
        float rimDiff = clamp(dot(nor, rimDir), 0.0, 1.0);
        float rimFresnel = pow(clamp(1.0 + dot(nor, rayDir), 0.0, 1.0), 4.2);
        float rimAudio = 1.0 + (u_audioMid * 1.40 + u_audioBeat * 1.10) * u_audioGlowMod;
        vec3 rimLight = (rimDiff * 0.25 + rimFresnel * 0.75) * u_rimIntensity * coolDarkBlue * rimAudio;

        // 4. Camera-Tracking Flashlight / Headlamp (6DOF Flight Mode ONLY)
        vec3 headlampLight = vec3(0.0);
        if (u_headlampIntensity > 0.01) {
            vec3 toLight = u_camPos - hitPos;
            float lDist = length(toLight);
            vec3 lDir = toLight / max(lDist, 1e-4);
            float spotAlign = dot(-lDir, cw);
            float spotCone = smoothstep(0.68, 0.92, spotAlign);
            float spotAtten = 1.0 / (1.0 + 0.35 * lDist + 0.15 * lDist * lDist);
            float spotDiff = max(dot(nor, lDir), 0.0);
            headlampLight = spotDiff * spotCone * spotAtten * u_headlampIntensity * vec3(1.0, 0.97, 0.92);
        }

        // Ambient environmental fill
        vec3 ambientFill = vec3(0.12, 0.14, 0.18) * (0.5 + 0.5 * nor.y);
        vec3 ambientLight = ambientFill * ao * 0.5;

        // Assemble base illuminated surface
        sceneColor = (directLight + fillLight + ambientLight + headlampLight) * bedrockAlbedo + specularLight + rimLight;

        // 5. Dynamic Flying Cavity Lights (Lighting Neighboring Surfaces with Line-of-Sight Occlusion)
        if (u_orbIntensity > 0.001) {
            vec3 orbPositions[3];
            orbPositions[0] = u_orbPos0;
            orbPositions[1] = u_orbPos1;
            orbPositions[2] = u_orbPos2;

            vec3 orbColors[3];
            orbColors[0] = u_orbCol0;
            orbColors[1] = u_orbCol1;
            orbColors[2] = u_orbCol2;

            float orbAudio = 1.0 + (u_audioBass * 0.55 + u_audioBeat * 0.70) * u_audioGlowMod;
            vec3 cavityLights = vec3(0.0);
            float maxLightRadius = 0.38;

            for (int k = 0; k < 3; k++) {
                vec3 toOrb = orbPositions[k] - hitPos;
                float dOrb = length(toOrb);
                if (dOrb < maxLightRadius) {
                    vec3 lDir = toOrb / max(dOrb, 1e-4);
                    float nDotL = max(dot(nor, lDir), 0.0);

                    // 3-step line-of-sight visibility test: light cannot shine through solid walls
                    float orbVis = 1.0;
                    if (nDotL > 0.015 && dOrb > 0.04) {
                        float stepLen = dOrb * 0.28;
                        vec4 tTrap;
                        for (int s = 1; s <= 3; s++) {
                            float sd = mapFractal(hitPos + nor * 0.012 + lDir * (float(s) * stepLen), tTrap);
                            if (sd < 0.005) { orbVis = 0.0; break; }
                        }
                    }

                    // Windowed quadratic attenuation: exactly 0.0 at maxLightRadius to avoid broad scene washing
                    float normDist = dOrb / maxLightRadius;
                    float window = clamp(1.0 - normDist * normDist, 0.0, 1.0);
                    float atten = (window * window) / (1.0 + 16.0 * normDist * normDist);

                    vec3 halfV = normalize(lDir + viewDir);
                    float spec = pow(max(dot(nor, halfV), 0.0), 24.0);

                    cavityLights += orbColors[k] * (nDotL * bedrockAlbedo * 0.95 + spec * 0.60) * atten * ao * orbVis;
                }
            }
            sceneColor += cavityLights * u_orbIntensity * orbAudio;
        }

        // Subtle optional emissive veins with bass pulse
        if (u_emissiveVeins > 0.01) {
            float vein = pow(clamp(1.0 - finalTrap.y * 3.0, 0.0, 1.0), 4.0);
            float veinAudio = 1.0 + (u_audioBass * 1.2 + u_audioBeat * 1.0) * u_audioGlowMod;
            sceneColor += bedrockAlbedo * vein * u_emissiveVeins * 0.3 * veinAudio;
        }

        // Distance fog smoothly dissolving into deep space background (evaluated only near horizon for massive FPS gain)
        float fogFactor = 1.0 - exp(-t * u_fogDensity);
        if (fogFactor > 0.04) {
            vec3 spaceBackdrop = renderSpaceBackground(rayDir, u_lightDir, u_time);
            sceneColor = mix(sceneColor, spaceBackdrop * 0.45, fogFactor);
        }

    } else {
        // Photorealistic celestial background: Realistic stars, Milky Way & Passing comets
        sceneColor = renderSpaceBackground(rayDir, u_lightDir, u_time);
    }

    // Additive volumetric glow
    sceneColor += glowAccum;
    sceneColor += godrays * vec3(0.9, 0.85, 0.7);

    fragColor = vec4(sceneColor, 1.0);
}
`;
}
