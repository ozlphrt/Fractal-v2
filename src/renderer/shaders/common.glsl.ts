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

// Photorealistic celestial background: Realistic stars & Milky Way dust cloud
vec3 renderSpaceBackground(vec3 dir, vec3 sunDir) {
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
        vec3 mwCoord = dir * 4.2;
        float dustA = fbm3D(mwCoord);
        float dustB = fbm3D(mwCoord * 2.2 + vec3(1.7, 4.3, 2.1));
        
        float darkRift = smoothstep(0.36, 0.64, dustA);
        float fineRift = smoothstep(0.38, 0.62, dustB);
        float absorption = clamp(1.0 - (darkRift * 0.78 + fineRift * 0.35), 0.09, 1.0);

        // Core bulge concentration
        float coreAlign = max(0.0, dot(dir, galCenter));
        float coreBulge = pow(coreAlign, 4.2) * 2.5;

        // Nebular color distribution:
        // - Dense galactic core: Warm golden/amber stellar glow
        // - Interstellar dust: Deep cyan/indigo starlight reflection
        // - H-II Ionization: Subtle magenta/pink emission nebulosity
        vec3 coreColor = vec3(1.0, 0.82, 0.58);
        vec3 diskColor = vec3(0.36, 0.46, 0.76);
        vec3 nebulaPink = vec3(0.85, 0.35, 0.52);

        vec3 mwTint = mix(diskColor, coreColor, clamp(coreBulge * 0.65 + band * 0.35, 0.0, 1.0));
        mwTint += nebulaPink * dustB * band * 0.35;

        float mwEmission = (band * 0.68 + diffuseBand * 0.26 + broadGlow * 0.06 + coreBulge * band * 1.4) * absorption;
        spaceColor += mwTint * mwEmission * 0.45;
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
