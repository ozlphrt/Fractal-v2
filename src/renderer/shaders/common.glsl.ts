// src/renderer/shaders/common.glsl.ts
// Shared GLSL functions: Inigo Quilez palettes, ray optics, PBR normals, soft shadows, AO, volumetrics

export const COMMON_GLSL = /* glsl */ `
// Cosine palette generator (Inigo Quilez)
vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318530718 * (c * t + d));
}

// Henyey-Greenstein volumetric phase function for forward/backward scattering
float henyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Sub-pixel random noise generator
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// 3D random hash functions
float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
    vec3 p = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

// Fast 3D value noise for organic interstellar dust & nebulae
float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, u.x);
    float x10 = mix(n010, n110, u.x);
    float x01 = mix(n001, n101, u.x);
    float x11 = mix(n011, n111, u.x);

    float y0 = mix(x00, x10, u.y);
    float y1 = mix(x01, x11, u.y);

    return mix(y0, y1, u.z);
}

// 4-octave Fractional Brownian Motion for cosmic nebulae and dark dust rifts
float fbm3D(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    mat3 rot = mat3(
        0.00,  0.80,  0.60,
       -0.80,  0.36, -0.48,
       -0.60, -0.48,  0.64
    );
    for (int i = 0; i < 4; i++) {
        v += a * noise3D(p);
        p = rot * p * 2.02;
        a *= 0.5;
    }
    return v;
}

// Passing comet simulation (coma nucleus, ion tail, dust tail)
vec3 renderComet(vec3 dir, vec3 sunDir, float time, float period, float duration, float seedOffset) {
    float t = time + seedOffset;
    float cycle = mod(t, period);
    if (cycle > duration) return vec3(0.0);

    float progress = cycle / duration;
    float cycleId = floor(t / period) + seedOffset;

    // Pseudo-random start & end coordinates across celestial hemisphere
    vec3 pStart = normalize(hash33(vec3(cycleId * 13.1, 7.31, 19.82)) - 0.5);
    vec3 pEnd = normalize(hash33(vec3(cycleId * 17.7, 31.25, 5.14)) - 0.5);

    // Ensure adequate celestial separation
    if (dot(pStart, pEnd) > 0.85) {
        pEnd = normalize(pEnd + vec3(0.4, -0.6, 0.5));
    }

    // Great circle trajectory
    vec3 headPos = normalize(mix(pStart, pEnd, progress));
    vec3 motionDir = normalize(pEnd - pStart);

    // Tails:
    // 1. Ion tail (pushed antisolar + behind motion)
    vec3 ionTailDir = normalize(-motionDir * 0.65 - sunDir * 0.35);
    // 2. Dust tail (trailing curved momentum)
    vec3 dustTailDir = -motionDir;

    vec3 toRay = dir - headPos;
    float headDist = length(toRay);

    // Fade-in / fade-out envelope
    float envelope = smoothstep(0.0, 0.18, progress) * smoothstep(1.0, 0.78, progress);

    // 1. Brilliant Nucleus & Glowing Coma
    float core = smoothstep(0.0035, 0.0, headDist);
    float coma = 0.00065 / (headDist * headDist + 0.00007);
    vec3 nucleusColor = vec3(0.85, 1.15, 1.35) * (core * 2.8 + coma * 0.45);

    // 2. Delicate Ion Tail (bluish, narrow, energetic)
    float ionProj = dot(toRay, ionTailDir);
    vec3 ionColor = vec3(0.0);
    if (ionProj > 0.0) {
        float ionOrtho = length(toRay - ionTailDir * ionProj);
        float ionWidth = 0.0022 + ionProj * 0.045;
        float ionFade = exp(-ionProj * 6.5) * smoothstep(0.55, 0.25, ionProj);
        float ionProfile = exp(-ionOrtho * ionOrtho / (ionWidth * ionWidth * 2.0));
        ionColor = vec3(0.35, 0.70, 1.1) * (ionFade * ionProfile * 1.6);
    }

    // 3. Diffuse Dust Tail (warm starlight reflection, slightly wider)
    float dustProj = dot(toRay, dustTailDir);
    vec3 dustColor = vec3(0.0);
    if (dustProj > 0.0) {
        float dustOrtho = length(toRay - dustTailDir * dustProj);
        float dustWidth = 0.0035 + dustProj * 0.085;
        float dustFade = exp(-dustProj * 5.0) * smoothstep(0.45, 0.20, dustProj);
        float dustProfile = exp(-dustOrtho * dustOrtho / (dustWidth * dustWidth * 2.0));
        dustColor = vec3(0.85, 0.80, 0.70) * (dustFade * dustProfile * 0.9);
    }

    return (nucleusColor + ionColor + dustColor) * envelope;
}

// Photorealistic celestial background: Realistic stars & Milky Way dust cloud
vec3 renderSpaceBackground(vec3 dir, vec3 sunDir, float time) {
    // 1. Deep cosmic gradient & solar corona glow
    float sunDot = max(dot(dir, sunDir), 0.0);
    float sunGlow = pow(sunDot, 20.0) * 0.16 + pow(sunDot, 2.0) * 0.02;
    vec3 skyTop = vec3(0.003, 0.004, 0.009);
    vec3 skyBottom = vec3(0.001, 0.0015, 0.003);
    vec3 spaceColor = mix(skyBottom, skyTop, clamp(dir.y * 0.5 + 0.5, 0.0, 1.0));
    spaceColor += vec3(0.12, 0.09, 0.06) * sunGlow;

    // 2. Milky Way Galactic Plane & Core Bulge
    // Realistic galactic tilt across celestial sphere
    vec3 galPole = normalize(vec3(0.54, 0.74, -0.39));
    vec3 galCenter = normalize(vec3(-0.64, -0.24, 0.73));
    
    float galLat = dot(dir, galPole);
    float band = exp(-galLat * galLat * 24.0); // Dense galactic plane
    float diffuseBand = exp(-galLat * galLat * 5.5); // Soft outer glow
    float broadGlow = exp(-galLat * galLat * 1.8); // Faint halo

    if (diffuseBand > 0.005) {
        // Multi-scale volumetric gas clouds and dark absorption dust lanes (The Great Rift)
        vec3 mwCoord = dir * 3.8;
        float dustA = fbm3D(mwCoord);
        float dustB = fbm3D(mwCoord * 2.0 + vec3(1.7, 4.3, 2.1));
        
        float darkRift = smoothstep(0.40, 0.60, dustA);
        float absorption = clamp(1.0 - darkRift * 0.55, 0.25, 1.0);

        // Core bulge concentration (gentle, authentic)
        float coreAlign = max(0.0, dot(dir, galCenter));
        float coreBulge = pow(coreAlign, 4.0) * 1.5;

        // Subtle, authentic astrophotography palette:
        // Soft warm stellar core, faint cool dust reflections, delicate faint ionized hints
        vec3 coreColor = vec3(0.48, 0.42, 0.34);
        vec3 diskColor = vec3(0.20, 0.26, 0.38);
        vec3 nebulaTint = vec3(0.30, 0.18, 0.25);

        vec3 mwTint = mix(diskColor, coreColor, clamp(coreBulge * 0.5 + band * 0.3, 0.0, 1.0));
        mwTint += nebulaTint * (dustB - 0.5) * 0.2;

        float mwEmission = (band * 0.52 + diffuseBand * 0.18 + coreBulge * band * 0.75) * absorption;
        // Subtle, non-intrusive ethereal Milky Way glow
        spaceColor += mwTint * mwEmission * 0.15;
    }

    // 3. Realistic Stars (Dense micro-star background + crisp prominent foreground stars)
    // Layer A: Micro-star background field (density modulated by Milky Way band)
    {
        vec3 scA = dir * 320.0;
        vec3 idA = floor(scA);
        vec3 fA = fract(scA) - 0.5;
        vec3 rPosA = (hash33(idA) - 0.5) * 0.76;
        float distA = length(fA - rPosA);
        float rndA = hash13(idA);
        
        // Higher stellar density along the galactic disc
        float threshA = mix(0.972, 0.895, band);
        if (rndA > threshA) {
            float b = pow((rndA - threshA) / (1.0 - threshA), 3.0) * 0.70;
            float star = smoothstep(0.12, 0.0, distA);
            float temp = hash13(idA + 7.3);
            vec3 tint = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.85, 0.65), temp);
            spaceColor += tint * b * star;
        }
    }

    // Layer B: Bright foreground stars with spectral colors & optical diffraction
    {
        vec3 scB = dir * 125.0;
        vec3 idB = floor(scB);
        vec3 fB = fract(scB) - 0.5;
        vec3 rPosB = (hash33(idB + 41.7) - 0.5) * 0.72;
        float distB = length(fB - rPosB);
        float rndB = hash13(idB + 83.1);
        
        if (rndB > 0.983) {
            float mag = pow((rndB - 0.983) / 0.017, 4.0) * 1.8 + 0.35;
            float starCore = smoothstep(0.08, 0.0, distB);
            float halo = 0.012 / (distB * distB + 0.0028);

            // Spectral classification: O/B (Blue), A/F (White), G (Yellow), K/M (Amber-Orange)
            float specType = hash13(idB + 19.4);
            vec3 sColor = (specType < 0.22) ? vec3(0.70, 0.84, 1.0) :
                          (specType < 0.58) ? vec3(0.98, 0.99, 1.0) :
                          (specType < 0.84) ? vec3(1.0, 0.88, 0.65) : vec3(1.0, 0.54, 0.36);

            spaceColor += sColor * (starCore * 1.1 + halo * 0.12) * mag;

            // Optical 4-point diffraction spike on the brightest stellar giants
            if (rndB > 0.996) {
                vec2 crossDist = abs(fB.xy - rPosB.xy);
                float spike = max(smoothstep(0.014, 0.0, crossDist.x) * smoothstep(0.38, 0.0, crossDist.y),
                                  smoothstep(0.014, 0.0, crossDist.y) * smoothstep(0.38, 0.0, crossDist.x));
                spaceColor += sColor * spike * 0.38 * mag;
            }
        }
    }

    // 4. Passing Comets (realistic sporadic celestial visitors every now and then)
    vec3 cometA = renderComet(dir, sunDir, time, 24.0, 3.4, 5.0);
    vec3 cometB = renderComet(dir, sunDir, time, 39.0, 4.2, 18.0);
    spaceColor += cometA + cometB;

    return spaceColor;
}

// Rotation matrices for 3D space folding and formulas
mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}
mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}
mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

// Smooth-min (exponential or polynomial) for hybrid fractal blending
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}
`;
