// Motion layer: a 3D katana and its scabbard that travel through the page
// behind the glass panels. Loaded lazily by motion.js (never under reduced
// motion), so the page works the same if this file, the model or WebGL is
// missing.
//
//   model      assets/models/katana.glb, built in Blender by
//              tools/katana/build_katana.py. It only carries shapes: the
//              materials are made here, one finish per theme - a white sword
//              on the dark page, a black one on the light page
//   story      drawn halfway out of the scabbard on the hero, free during the
//              page, sliding back in over Contact, home over the footer. The
//              scabbard only ever joins or leaves the blade over its point
//   cursor     the steel lights up under the pointer; both pieces can be
//              pushed, grabbed, dragged and thrown. A push springs back; a
//              piece that was carried stays where it is left until the page
//              scrolls. What counts as touching is the shape itself
//   theme      the switch is a cut: the sword leaves, comes down the diagonal
//              of the screen, and the new theme opens from the line it
//              leaves ("blade:cut", motion.js)
//   pile       it cuts the certificates the same way, one stroke a card
//   sound      the blade sliding in the scabbard, the ring as it comes out
//              and the click as it goes home ("blade:sfx" and "blade:scrape"
//              events, played by motion.js)
import * as THREE from "../vendor/three.module.min.js";

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// ---------------------------------------------------------------- geometry

// The same numbers as tools/katana/build_katana.py: the edge light and the
// scabbard's slide are drawn here along the curve the model was built on.
const BLADE = { length: 6.2, sori: 0.42, width: 0.33, thick: 0.07, tip: 0.905 };
const SAYA = { a: 0.205, b: 0.118, t0: -0.004, t1: 1.035 };
// The curve is a shallow parabola, which is a circle of this radius to within
// a hair. Sliding the scabbard is a turn around that circle's centre, so the
// blade stays inside it the whole way.
const ARC_R = (BLADE.length * BLADE.length) / (2 * BLADE.sori);
const GRIP_END = -2.2;
const BODY_X = -2.1;
const CAM_Z = 12;

// Centre, tangent and normal (towards the spine) of the curve at t.
function curve(t) {
    const { length, sori } = BLADE;
    const tl = Math.hypot(length, 2 * sori * t);
    const tx = length / tl;
    const ty = (2 * sori * t) / tl;
    return { cx: length * t, cy: sori * t * t, tx, ty, nx: -ty, ny: tx };
}

// One cross-section of the blade at t (0 = collar, 1 = tip).
// +Y is the spine, -Y the cutting edge, Z the thickness.
function ring(t) {
    const { width, thick, tip } = BLADE;
    const f = curve(t);
    const w = width * (1 - 0.26 * t);
    const th = thick * (1 - 0.32 * t);
    const u = t > tip ? (t - tip) / (1 - tip) : 0;
    const k = u * u; // the edge sweeps up to meet the spine at the tip
    const spine = w / 2;
    const edge = -w / 2 + w * k;
    const ridge = lerp(w * 0.16, spine, k);
    const thin = 1 - 0.9 * u;
    const at = (o, z) => [f.cx + f.nx * o, f.cy + f.ny * o, z];
    // outward direction of the edge light: down, then forward at the tip
    const gx = lerp(-f.nx, f.tx, k);
    const gy = lerp(-f.ny, f.ty, k);
    const gl = Math.hypot(gx, gy) || 1;
    return {
        s: at(spine, 0),
        rl: at(ridge, th * 0.5 * thin),
        rr: at(ridge, -th * 0.5 * thin),
        e: at(edge, 0),
        glow: [gx / gl, gy / gl],
        t,
    };
}

// Indexed strip between two rails: smooth along the blade, hard across it.
function strip(rings, railA, railB) {
    const pos = [];
    const uv = [];
    const idx = [];
    rings.forEach((r, i) => {
        pos.push(...railA(r), ...railB(r));
        uv.push(r.t, 0, r.t, 1);
        if (i < rings.length - 1) {
            const a = i * 2;
            idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
}

// A closed tube through rings of points: only used for hit-testing.
function hull(rings) {
    const pos = [];
    const idx = [];
    const m = rings[0].length;
    rings.forEach((r, i) => {
        r.forEach((p) => pos.push(...p));
        if (i === rings.length - 1) return;
        for (let j = 0; j < m; j++) {
            const a = i * m + j;
            const b = i * m + ((j + 1) % m);
            idx.push(a, b, b + m, a, b + m, a + m);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
}

// ------------------------------------------------------------------ the file

// Reads the handful of things a Blender-exported GLB holds for this model:
// one mesh per part, with its normals, texture coordinates and the baked
// occlusion as vertex colours. (three's own loader is five times the size of
// this file and nothing else on the page needs it.)
const ARRAYS = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array,
};
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
// how much of the baked shadow each material keeps
const SHADE = { ito: 0.62, same: 0.75, lacquer: 0.5, sageo: 0.7 };

async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model: ${res.status}`);
    let buf = await res.arrayBuffer();
    const head = new Uint8Array(buf, 0, 2);
    if (head[0] === 0x1f && head[1] === 0x8b) {
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
        buf = await new Response(stream).arrayBuffer();
    }
    return buf;
}

function parseModel(buf) {
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error("model: not a GLB");
    const jsonLength = view.getUint32(12, true);
    const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLength)));
    const bin = 20 + jsonLength + 8;

    const read = (index) => {
        const acc = doc.accessors[index];
        const bv = doc.bufferViews[acc.bufferView];
        const Type = ARRAYS[acc.componentType];
        const n = WIDTHS[acc.type];
        const size = Type.BYTES_PER_ELEMENT;
        const offset = bin + (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const step = (bv.byteStride || n * size) / size;
        // copied out, so the 1 MB file itself can be let go
        const src = new Type(buf.slice(offset, offset + ((acc.count - 1) * step + n) * size));
        const out = new Type(acc.count * n);
        for (let i = 0; i < acc.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = src[i * step + c];
        return new THREE.BufferAttribute(out, n, !!acc.normalized);
    };

    const parts = {};
    for (const node of doc.nodes) {
        if (node.mesh === undefined) continue;
        const prim = doc.meshes[node.mesh].primitives[0];
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", read(prim.attributes.POSITION));
        if (prim.attributes.NORMAL !== undefined) g.setAttribute("normal", read(prim.attributes.NORMAL));
        if (prim.attributes.TEXCOORD_0 !== undefined) {
            const uv = read(prim.attributes.TEXCOORD_0);
            // the exporter counts v from the top; back to how the model was built
            for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
            g.setAttribute("uv", uv);
        }
        const material = prim.material !== undefined ? doc.materials[prim.material].name : "";
        if (prim.attributes.COLOR_0 !== undefined) {
            // the baked shadows, as one shade per vertex. Cloth and lacquer
            // take them more gently than metal, or white turns grubby.
            const baked = read(prim.attributes.COLOR_0);
            const keep = SHADE[material] ?? 1;
            const shade = new Float32Array(baked.count * 3);
            for (let i = 0; i < baked.count; i++) shade.fill(1 - (1 - baked.getX(i)) * keep, i * 3, i * 3 + 3);
            g.setAttribute("color", new THREE.BufferAttribute(shade, 3));
        }
        if (prim.indices !== undefined) g.setIndex(read(prim.indices));
        if (!g.attributes.normal) g.computeVertexNormals();
        parts[node.name] = { geometry: g, material };
    }
    return parts;
}

// ------------------------------------------------------------------ textures

function canvasTexture(w, h, draw, srgb = true) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    // v runs down the canvas, the way the model's coordinates were laid out
    tex.flipY = false;
    tex.anisotropy = 8;
    return tex;
}

// A height field turned into a normal map. `height(x, y)` wraps on both axes.
function normalTexture(w, h, height, strength) {
    const field = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) field[y * w + x] = height(x / w, y / h);
    const tex = canvasTexture(
        w,
        h,
        (ctx) => {
            const img = ctx.createImageData(w, h);
            const at = (x, y) => field[((y + h) % h) * w + ((x + w) % w)];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
                    const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
                    const l = Math.hypot(dx, dy, 1);
                    const i = (y * w + x) * 4;
                    img.data[i] = (dx / l) * 127.5 + 127.5;
                    img.data[i + 1] = (dy / l) * 127.5 + 127.5;
                    img.data[i + 2] = (1 / l) * 127.5 + 127.5;
                    img.data[i + 3] = 255;
                }
            }
            ctx.putImageData(img, 0, 0);
        },
        false,
    );
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// Silk braid: ribs that lean in from both edges and meet along the middle.
function braidNormals() {
    return normalTexture(
        64,
        64,
        (u, v) => {
            const across = Math.abs(v - 0.5) * 2;
            const ribs = 0.5 + 0.5 * Math.cos(TAU * (u * 2 + across * 0.9));
            return ribs * 0.8 + (1 - across * across) * 0.5;
        },
        2.2,
    );
}

// Ray skin: a field of small rounded grains, no two the same size.
function grainNormals() {
    const N = 256;
    const dots = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1500; i++) dots.push([rnd(), rnd(), 0.014 + rnd() * 0.016]);
    const field = new Float32Array(N * N);
    for (const [cx, cy, r] of dots) {
        const reach = Math.ceil(r * N);
        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const d = Math.hypot(dx, dy) / (r * N);
                if (d >= 1) continue;
                const x = (Math.round(cx * N) + dx + N) % N;
                const y = (Math.round(cy * N) + dy + N) % N;
                field[y * N + x] = Math.max(field[y * N + x], Math.sqrt(1 - d * d));
            }
        }
    }
    return normalTexture(N, N, (u, v) => field[Math.floor(v * N) * N + Math.floor(u * N)], 2.6);
}

// The blade's own finish, painted along its length (u) and from the spine
// (v = 0) to the edge (v = 1): mirror-bright flats, satin below the ridge and
// the frosted, wavy temper line (hamon) along the edge.
function bladeMaps() {
    const W = 2048;
    const H = 256;
    const colour = new Uint8ClampedArray(W * H * 4);
    const finish = new Uint8ClampedArray(W * H * 4);
    for (let x = 0; x < W; x++) {
        const u = x / W;
        const peaks = Math.pow(Math.abs(Math.sin(u * 58 + 0.4)), 0.7);
        const line =
            0.775 - 0.085 * peaks + 0.03 * Math.sin(u * 143 + 2.1) + 0.016 * Math.sin(u * 331) +
            0.012 * Math.sin(u * 17);
        // the point is polished a little brighter than the rest. It comes in
        // over a long stretch: drawn as a line across the blade (the yokote
        // of a real one) it read as a scratch
        const point = smooth(ramp(u, BLADE.tip - 0.09, BLADE.tip + 0.03));
        for (let y = 0; y < H; y++) {
            const v = y / H;
            const streak = Math.sin(y * 12.9898 + Math.floor(x / 9) * 78.233) * 43758.5453;
            const grain = (streak - Math.floor(streak) - 0.5) * 0.02;
            let c;
            let rough;
            const below = v >= 0.345;
            if (!below) {
                // the back and the burnished flat, with its groove
                const groove = ramp(v, 0.07, 0.11) * (1 - ramp(v, 0.27, 0.31)) * (1 - ramp(u, 0.66, 0.75));
                c = 0.7 - 0.1 * groove;
                rough = 0.2 + 0.1 * groove;
            } else {
                c = 0.8 + grain;
                rough = 0.33;
            }
            if (below) {
                c = lerp(c, 0.86, point);
                rough = lerp(rough, 0.3, point);
            }
            const temper = ramp(v, line - 0.012, line + 0.02);
            const halo = Math.exp(-Math.pow((v - line) / 0.022, 2));
            c = lerp(c, 0.95, temper) + halo * 0.05;
            rough = lerp(rough, 0.56, temper) - halo * 0.1;
            const i = (y * W + x) * 4;
            colour[i] = c * 247;
            colour[i + 1] = c * 251;
            colour[i + 2] = c * 255;
            colour[i + 3] = 255;
            finish[i] = 255;
            finish[i + 1] = rough * 255; // three reads roughness from green
            finish[i + 2] = 218; // and metalness from blue
            finish[i + 3] = 255;
        }
    }
    const put = (data) => (ctx) => ctx.putImageData(new ImageData(data, W, H), 0, 0);
    return { map: canvasTexture(W, H, put(colour)), finish: canvasTexture(W, H, put(finish), false) };
}

// Studio reflections painted on a canvas and blurred into an environment:
// soft boxes of light in a dark room for the dark page, a bright room with a
// few dark flags (so the metal still has something to show) for the light one.
function buildEnvironment(renderer, light) {
    const tex = canvasTexture(1024, 512, (ctx, w, h) => {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        if (light) {
            bg.addColorStop(0, "#f4f7fb");
            bg.addColorStop(0.5, "#c3ccd9");
            bg.addColorStop(1, "#6d7889");
        } else {
            bg.addColorStop(0, "#b6c2d1");
            bg.addColorStop(0.4, "#687789");
            bg.addColorStop(0.6, "#303a49");
            bg.addColorStop(1, "#161c26");
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        const box = (cx, cy, rw, rh, color) => {
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
            g.addColorStop(0, color);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, rh / rw);
            ctx.translate(-cx, -cy);
            ctx.fillStyle = g;
            ctx.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);
            ctx.restore();
        };
        if (light) {
            box(w * 0.46, h * 0.1, 300, 80, "rgba(255,255,255,1)");
            box(w * 0.18, h * 0.36, 180, 110, "rgba(255,255,255,0.9)");
            box(w * 0.74, h * 0.32, 170, 80, "rgba(255,244,224,0.9)");
            box(w * 0.32, h * 0.62, 150, 60, "rgba(18,28,44,0.75)");
            box(w * 0.62, h * 0.56, 120, 90, "rgba(18,28,44,0.6)");
            box(w * 0.92, h * 0.5, 110, 150, "rgba(0,119,182,0.35)");
        } else {
            box(w * 0.48, h * 0.1, 320, 90, "rgba(255,255,255,1)");
            box(w * 0.2, h * 0.34, 220, 110, "rgba(255,255,255,0.95)");
            box(w * 0.74, h * 0.36, 230, 120, "rgba(255,246,232,0.95)");
            box(w * 0.5, h * 0.5, 130, 70, "rgba(235,244,255,0.5)");
            box(w * 0.3, h * 0.82, 260, 60, "rgba(255,238,214,0.3)");
            box(w * 0.94, h * 0.6, 110, 130, "rgba(170,225,255,0.5)");
        }
    });
    tex.flipY = true;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
}

// ----------------------------------------------------------------- materials

// Shared by every material that should light up under the pointer.
// x, y: pointer in framebuffer pixels (origin bottom-left); z: radius.
const cursorUniforms = {
    uCur: { value: new THREE.Vector3(-9999, -9999, 200) },
    uGlow: { value: 0 },
    uGlowCol: { value: new THREE.Color(0x35d2ff) },
    // blade parameter (0 collar .. 1 tip) from which the scabbard covers it
    uCover: { value: 2 },
};

function litByCursor(mat, strength) {
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, cursorUniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                "#include <common>\nuniform vec3 uCur;\nuniform float uGlow;\nuniform vec3 uGlowCol;",
            )
            .replace(
                "#include <emissivemap_fragment>",
                `#include <emissivemap_fragment>
                vec2 curD = gl_FragCoord.xy - uCur.xy;
                float curK = exp(-dot(curD, curD) / (uCur.z * uCur.z));
                totalEmissiveRadiance += uGlowCol * (uGlow * curK * ${strength.toFixed(2)});`,
            );
    };
    // three.js caches programs by the hook's source, which is the same for
    // every strength
    mat.customProgramCacheKey = () => `lit${strength}`;
    return mat;
}

// The edge light: fades in from the collar, stops where the scabbard starts,
// and flares where the pointer is.
function flaredByCursor(mat, strength) {
    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, cursorUniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                "#include <common>\nuniform vec3 uCur;\nuniform float uGlow;\nuniform float uCover;",
            )
            .replace(
                "#include <map_fragment>",
                `#include <map_fragment>
                vec2 curD = gl_FragCoord.xy - uCur.xy;
                float curK = exp(-dot(curD, curD) / (uCur.z * uCur.z * 2.2));
                diffuseColor.rgb *= 1.0 + uGlow * curK * ${strength.toFixed(2)};
                diffuseColor.a *= smoothstep(0.0, 0.2, vMapUv.x)
                    * (1.0 - smoothstep(uCover - 0.05, uCover, vMapUv.x));`,
            );
    };
    mat.customProgramCacheKey = () => `flare${strength}`;
    return mat;
}

// The two finishes. Every entry is [white sword, black sword]; switching
// theme only moves these numbers, the shapes and textures are shared.
const FINISH = {
    steel: { color: [0xffffff, 0xf2f4f7], rough: [1, 1], metal: [1, 1] },
    gold: { color: [0xe0b055, 0xd5a546], rough: [0.3, 0.3], metal: [1, 1] },
    tsuba: { color: [0xcf9f44, 0x1b1c21], rough: [0.4, 0.5], metal: [1, 0.9] },
    fitting: { color: [0xe0b055, 0x202128], rough: [0.3, 0.4], metal: [1, 0.9] },
    // the wrap is white braid on the white sword and black on the black one;
    // the core that shows through its diamonds is gold on both
    ito: { color: [0xf3f0e8, 0x161924], rough: [0.8, 0.86], metal: [0, 0] },
    same: { color: [0xe0b055, 0xd5a546], rough: [0.4, 0.4], metal: [1, 1] },
    lacquer: { color: [0xf4f1ea, 0x0b0c11], rough: [0.3, 0.22], metal: [0, 0] },
    sageo: { color: [0xd2aa55, 0xbf9a48], rough: [0.8, 0.8], metal: [0, 0] },
    void: { color: [0x05080c, 0x05080c], rough: [0.9, 0.9], metal: [0, 0] },
};

function buildMaterials() {
    const braid = braidNormals();
    const grain = grainNormals();
    const blade = bladeMaps();
    const std = (opts) => new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
    const tile = (tex, x, y) => {
        const t = tex.clone();
        t.repeat.set(x, y);
        t.needsUpdate = true;
        return t;
    };

    const M = {
        steel: litByCursor(std({ map: blade.map, roughnessMap: blade.finish, metalnessMap: blade.finish }), 0.55),
        gold: litByCursor(std({}), 0.3),
        tsuba: litByCursor(std({ normalMap: tile(grain, 3, 3), normalScale: new THREE.Vector2(0.35, 0.35) }), 0.3),
        fitting: litByCursor(std({}), 0.3),
        ito: std({ normalMap: tile(braid, 1, 1), normalScale: new THREE.Vector2(0.7, 0.7) }),
        same: std({ normalMap: tile(grain, 7, 5.6), normalScale: new THREE.Vector2(0.55, 0.55) }),
        lacquer: new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.06 }),
        sageo: std({ normalMap: tile(braid, 1, 1), normalScale: new THREE.Vector2(0.8, 0.8) }),
        void: std({ vertexColors: false }),
        // the scabbard's own metal: it changes finish on its own clock
        sheathFitting: litByCursor(std({}), 0.3),
    };
    const SHEATH = ["lacquer", "sageo", "void", "sheathFitting"];
    const looks = { ...FINISH, sheathFitting: FINISH.fitting };
    const a = new THREE.Color();
    const b = new THREE.Color();
    // 0 = the white sword, 1 = the black one. The sword and its scabbard are
    // set apart: during a theme cut one is on screen while the other is not.
    const setFinish = (f, sheath) => {
        for (const [name, look] of Object.entries(looks)) {
            if (SHEATH.includes(name) !== sheath) continue;
            const mat = M[name];
            mat.color.copy(a.set(look.color[0])).lerp(b.set(look.color[1]), f);
            mat.roughness = lerp(look.rough[0], look.rough[1], f);
            mat.metalness = lerp(look.metal[0], look.metal[1], f);
        }
    };
    setFinish(0, false);
    setFinish(0, true);
    return { M, setFinish };
}

// ---------------------------------------------------------------- the pieces

function buildKatana(parts, M) {
    const body = new THREE.Group();
    for (const name of ["blade", "habaki", "seppa", "tsuba_plate", "tsuba_rim", "fuchi", "kashira", "same", "ito"]) {
        const part = parts[name];
        if (part) body.add(new THREE.Mesh(part.geometry, M[part.material] || M.gold));
    }

    const rings = [];
    for (let i = 0; i <= 96; i++) rings.push(ring(i / 96));

    // Edge light. The strip's v runs from the edge (0) outwards (1): light
    // that is strongest on the steel and dies away from it. (Painted the
    // other way round it reads as a pane of glass bolted to the blade.)
    const auraTex = canvasTexture(4, 128, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0.85)");
        g.addColorStop(0.1, "rgba(255,255,255,0.42)");
        g.addColorStop(0.3, "rgba(255,255,255,0.16)");
        g.addColorStop(0.62, "rgba(255,255,255,0.04)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
    const aura = flaredByCursor(
        new THREE.MeshBasicMaterial({
            map: auraTex,
            color: 0x00c6ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
        2.2,
    );
    const core = new THREE.MeshBasicMaterial({
        color: 0xbff1ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const out = (r, d) => [r.e[0] + r.glow[0] * d, r.e[1] + r.glow[1] * d, 0];
    body.add(new THREE.Mesh(strip(rings, (r) => r.e, (r) => out(r, 0.26)), aura));
    body.add(new THREE.Mesh(strip(rings, (r) => out(r, -0.003), (r) => out(r, 0.011)), core));

    // what the pointer can touch: the blade as a slim four-sided bar, the
    // guard as a disc, the grip and the collar as boxes round them
    const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const proxy = new THREE.Group();
    const coarse = [];
    for (let i = 0; i <= 28; i++) coarse.push(ring(i / 28));
    proxy.add(new THREE.Mesh(hull(coarse.map((r) => [r.s, r.rl, r.e, r.rr])), solid));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 24), solid);
    disc.rotation.z = HALF;
    disc.position.x = -0.06;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14), solid);
    grip.rotation.z = HALF;
    grip.scale.set(0.178, -GRIP_END - 0.1, 0.132);
    grip.position.x = (GRIP_END - 0.1) / 2;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.38, 0.1), solid);
    collar.position.x = 0.12;
    proxy.add(disc, grip, collar);
    proxy.visible = false;
    body.add(proxy);

    // recentre: the whole sword spans x in [-2.2, 6.2]
    body.position.set(BODY_X, -BLADE.sori * 0.32, 0);
    const katana = new THREE.Group();
    katana.add(body);
    return { katana, body, aura, core, proxy };
}

function buildSaya(parts, M) {
    const seat = new THREE.Group();
    for (const name of ["saya", "koiguchi", "saya_mouth", "kojiri", "kurigata", "shitodome", "shitodome_void", "sageo"]) {
        const part = parts[name];
        if (!part) continue;
        const finish = part.material === "fitting" ? "sheathFitting" : part.material;
        seat.add(new THREE.Mesh(part.geometry, M[finish] || M.lacquer));
    }

    const rings = [];
    for (let i = 0; i <= 20; i++) {
        const k = i / 20;
        const f = curve(lerp(SAYA.t0, SAYA.t1 + 0.02, k));
        const taper = 1 - 0.14 * k;
        const row = [];
        for (let j = 0; j < 12; j++) {
            const ph = (j / 12) * TAU;
            const o = (SAYA.a + 0.008) * taper * Math.cos(ph);
            row.push([f.cx + f.nx * o, f.cy + f.ny * o, (SAYA.b + 0.008) * taper * Math.sin(ph)]);
        }
        rings.push(row);
    }
    const proxy = new THREE.Mesh(hull(rings), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    proxy.visible = false;
    seat.add(proxy);

    // pivot for the sheathing slide: a turn around the centre of the curve
    const arc = new THREE.Group();
    arc.position.set(0, ARC_R, 0);
    seat.position.set(0, -ARC_R, 0);
    arc.add(seat);

    const body = new THREE.Group();
    body.position.set(BODY_X, -BLADE.sori * 0.32, 0);
    body.add(arc);

    const saya = new THREE.Group();
    saya.add(body);
    return { saya, arc, body, proxy };
}

// The model, its materials and both rooms of reflections.
export async function loadSword(renderer) {
    const zipped = "DecompressionStream" in window;
    const url = new URL(`../models/katana.glb${zipped ? ".gz" : ""}`, import.meta.url);
    const parts = parseModel(await fetchBytes(url));
    const { M, setFinish } = buildMaterials();
    const sword = buildKatana(parts, M);
    const sheath = buildSaya(parts, M);
    const rooms = [buildEnvironment(renderer, false), buildEnvironment(renderer, true)];
    return { ...sword, sheath, M, setFinish, rooms };
}

// ------------------------------------------------------------ choreography

// A pose is where a piece rests while a section is centred on screen.
// x / y are in half-viewports (-1..1), rotations in radians. `follow` pins
// y to an element that is travelling through the viewport.
//
// The sword and the scabbard each have their own list of waypoints. The
// scabbard never tumbles: it hangs upright at the side of the page, leaves
// and returns over the top or bottom edge, and only turns around while it is
// off-screen. A scabbard waypoint is either a place of its own or a ride on
// the blade, `slide` units away from being fully sheathed. Getting from one
// kind to the other is not written here: stepSheath (below) only lets it
// join or leave the blade over the tip, the way a real one does.
function buildStations(narrow) {
    const q = (s) => document.querySelector(s);
    const span = (el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + window.scrollY, height: r.height, mid: r.top + window.scrollY + r.height / 2 };
    };
    const vh = window.innerHeight;
    const K = [];
    const S = [];
    // far enough past an edge that neither end of the scabbard shows
    const OFF = 2.45;
    const free = { x: 0, y: -OFF, z: -1.4, rx: 0.3, ry: 0.5, rz: HALF, s: 0.76 };
    const k = (anchor, pose, follow, lift = 0) => {
        if (Number.isFinite(anchor)) K.push({ a: anchor, p: pose, follow, lift });
    };
    const s = (anchor, pose) => {
        if (Number.isFinite(anchor)) S.push({ a: anchor, p: { ...free, ...pose }, on: false, slide: 0 });
    };
    const ride = (anchor, slide) => {
        if (Number.isFinite(anchor)) S.push({ a: anchor, p: null, on: true, slide });
    };
    const el = {
        about: q("#about"),
        band: q(".kinetic"),
        tech: q("#technologies"),
        exp: q("#experience"),
        proj: q("#projects"),
        cert: q("#certificates"),
        honors: q("#honors"),
        contact: q("#contact"),
        mark: q(".footer-mark"),
    };
    // Resting at the side of the text column. When the window leaves almost
    // no margin there, both sit half off-screen rather than on top of the
    // words: a white sword behind white text is a sentence nobody can read.
    // (They hang a little behind the page, so "1" is still inside the edge.)
    const tight = !narrow && window.innerWidth < 1320;
    const edge = narrow ? 1.1 : tight ? 1.04 : 0.955;
    const side = tight ? 1.1 : edge + 0.02;
    // on wide screens the section rail lives in the right margin: stay clear
    const right = narrow || tight ? edge : edge - 0.055;
    // the hanging scabbard leans a little; less where there is no room for it
    const lean = narrow || tight ? 0.04 : 0.1;
    const up = { rx: 0.3, ry: 0.5, rz: HALF - lean };
    const down = { rx: 0.3, ry: -0.4, rz: -HALF + lean };

    // hero: caught halfway out of the scabbard
    const hero = narrow
        ? { x: 0.62, y: -0.5, z: -1, rx: 0.2, ry: -0.5, rz: 1.05, s: 0.82 }
        : { x: 0.46, y: -0.08, z: 0, rx: 0.28, ry: -0.5, rz: 0.66, s: 0.9 };
    k(vh / 2, hero);
    ride(vh / 2, 3.3);

    if (el.about) {
        const a = span(el.about);
        // in place by the time the section's title is under the navbar (where
        // the menu link lands), not halfway across its first paragraph
        const at = Math.min(a.mid, a.top + vh * 0.6);
        k(at, { x: -edge, y: 0, z: -1, rx: 0, ry: TAU - 0.5, rz: HALF, s: 0.82 });
        // the scabbard comes off over the tip while the sword is still in its
        // hero pose, and only then goes to hang at the side
        ride(lerp(vh / 2, at, 0.3), 8.4);
        s(at, { x: side, y: 0.05, ...up });
    }
    if (el.band) {
        const b = span(el.band);
        k(b.mid, { x: 0, y: 0, z: 0, rx: 0.62, ry: TAU, rz: 0, s: narrow ? 1.5 : 1.12 }, el.band);
        // drops out under the page on the right, comes back up on the left
        s(b.mid - 1, { x: side, y: -OFF, ...up });
        s(b.mid + 1, { x: -side, y: -OFF, ...up });
    }
    if (el.tech) {
        const t = span(el.tech);
        k(t.mid, { x: right, y: 0, z: -1, rx: 0, ry: TAU + 0.55, rz: -HALF, s: 0.82 });
        s(t.mid, { x: -side, y: -0.05, ...up });
    }
    if (el.exp) {
        const e = span(el.exp);
        k(
            e.mid,
            narrow
                ? { x: edge, y: 0, z: -1, rx: 0, ry: TAU + 2.2, rz: -HALF, s: 0.82 }
                : { x: 0.56, y: -0.04, z: -1.6, rx: 0, ry: TAU + 2.3, rz: -HALF + 0.14, s: 1.02 },
        );
        s(e.mid, { x: -side, y: OFF, ...up });
    }
    // a pinned section scrolls sideways: the blade crosses behind the cards
    // (motion.js marks a section it has pinned with .hscroll)
    const pinned = (node, y, spin) => {
        const r = span(node);
        if (!node.classList.contains("hscroll") || r.height <= vh * 1.2) return false;
        k(r.top + vh / 2, { x: -0.5, y, z: -1, rx: 0.45 + spin, ry: TAU * 2, rz: 0, s: 1.22 });
        k(r.top + r.height - vh / 2, { x: 0.2, y, z: -1, rx: 0.45 + spin + TAU, ry: TAU * 2, rz: 0, s: 1.22 });
        return true;
    };
    // The pile of certificates is cut along the screen's diagonal (motion.js,
    // .deck). Between cuts the sword rests on that line behind the pile; it
    // leaves it for each stroke (initBlade, "deck").
    const deck = (node) => {
        const r = span(node);
        if (!node.classList.contains("deck") || r.height <= vh * 1.2) return false;
        const rz = Math.atan2(vh, window.innerWidth);
        const pose = { x: 0.04, y: -0.06, z: -1, rx: TAU + 0.45, ry: TAU * 2, rz, s: 1.3 };
        k(r.top + vh / 2, pose);
        k(r.top + r.height - vh / 2, pose);
        return true;
    };
    if (el.proj && !pinned(el.proj, -0.06, 0))
        k(span(el.proj).mid, { x: -edge, y: 0, z: -1, rx: TAU, ry: TAU * 2 + 0.4, rz: HALF, s: 0.82 });
    // how many times it has turned over by the end of Certificates: resting
    // behind the pile it does not turn, the other layouts give it one more
    let turned = TAU * 2;
    if (el.cert) {
        if (deck(el.cert)) turned = TAU;
        else if (!pinned(el.cert, 0.08, TAU))
            k(span(el.cert).mid, { x: -edge, y: 0, z: -1, rx: TAU * 2, ry: TAU * 2 + 0.6, rz: HALF, s: 0.82 });
    }
    // out of sight for both: this is where the scabbard turns tip-down
    if (el.proj) s(span(el.proj).top + vh / 2, { x: -side, y: OFF, ...down });
    if (el.cert) {
        const c = span(el.cert);
        s(c.top + c.height - vh / 2, { x: -side, y: OFF, ...down });
    }
    let honorsEnd = NaN;
    if (el.honors) {
        const h = span(el.honors);
        honorsEnd = h.top + h.height;
        k(h.mid, { x: right, y: 0, z: -1, rx: turned, ry: TAU * 2 - 0.5, rz: HALF * 3, s: 0.82 });
        s(h.mid, { x: -side, y: 0, ...down });
        s(honorsEnd, { x: -side, y: -OFF, ...down });
    }
    if (el.contact) {
        const pose = narrow
            ? { x: -edge, y: 0.1, z: -1, rx: turned, ry: TAU * 2 + 0.3, rz: HALF * 3, s: 0.82 }
            : { x: -0.075, y: 0.1, z: -1.4, rx: turned, ry: TAU * 2 + 0.35, rz: HALF * 3, s: 0.8 };
        const c = span(el.contact);
        k(c.mid, pose);
        // The scabbard waits under the page, already on the line the blade
        // hangs along, and rises along it: the tip goes in first.
        const from = Number.isFinite(honorsEnd) ? Math.min(honorsEnd, c.mid - 2) : c.top;
        ride(lerp(from, c.mid, 0.22), 16);
        ride(c.mid, 4.3);
    }
    if (el.mark) {
        // home: back in the scabbard, resting just above the wordmark
        const bottom = document.documentElement.scrollHeight - vh / 2;
        const pose = { x: 0, y: -0.2, z: 0, rx: turned + 0.5, ry: TAU * 2, rz: TAU, s: narrow ? 1.4 : 1.1 };
        const r = el.mark.getBoundingClientRect();
        k(bottom, pose, el.mark, r.height / vh + 0.2);
        ride(bottom, 0);
    }

    K.sort((a, b) => a.a - b.a);
    S.sort((a, b) => a.a - b.a);
    // A ride has no place of its own. Where the scabbard goes when it lets
    // go there is the nearest waypoint that has one.
    S.forEach((w, i) => {
        if (w.p) return;
        const next = S.slice(i + 1).find((o) => !o.on);
        const prev = S.slice(0, i).reverse().find((o) => !o.on);
        w.p = (next || prev || { p: free }).p;
    });
    return { K, S };
}

const POSE_KEYS = ["x", "y", "z", "rx", "ry", "rz", "s"];
// Slid this far along the blade, the scabbard's mouth is clear of the point;
// a little further out is where it meets the blade's line again.
const SHEATH_OUT = BLADE.length + 0.9;
const SHEATH_MEET = SHEATH_OUT + 0.9;

// Where a scroll position falls in a list of waypoints: the two it sits
// between and how far along (holding near each, travelling in the middle).
function sample(list, c) {
    let i = 0;
    while (i < list.length - 2 && c > list[i + 1].a) i++;
    const A = list[i];
    const B = list[Math.min(i + 1, list.length - 1)];
    const raw = clamp((c - A.a) / Math.max(1, B.a - A.a), 0, 1);
    return { A, B, i, t: smooth(clamp((raw - 0.18) / 0.64, 0, 1)) };
}

// Offsets added on top of a pose when the pointer pushes, drags or throws a
// piece. A damped spring pulls every one of them back to zero - except the
// place of a piece that was carried and let go (`parked`): that one only
// coasts to a stop, and stays there until the page scrolls.
const makeBody = () => ({
    ox: 0, oy: 0, vx: 0, vy: 0, az: 0, vaz: 0, roll: 0, vroll: 0,
    a: [0, 0], b: [0, 0], z: 0, held: false, parked: false,
});

function stepBody(p, dt) {
    const spring = (x, v, k, c) => v + (-k * x - c * v) * dt;
    if (!p.held) {
        if (p.parked) {
            const drag = Math.exp(-dt * 3.4);
            p.vx *= drag;
            p.vy *= drag;
        } else {
            // soft enough that a throw travels before it is pulled home
            p.vx = spring(p.ox, p.vx, 20, 3.6);
            p.vy = spring(p.oy, p.vy, 20, 3.6);
        }
        p.ox += p.vx * dt;
        p.oy += p.vy * dt;
    }
    p.vaz = spring(p.az, p.vaz, 30, 4.6);
    p.vroll = spring(p.roll, p.vroll, 16, 2.6);
    p.az += p.vaz * dt;
    p.roll += p.vroll * dt;
    const away = p.parked ? 0 : Math.abs(p.ox) + Math.abs(p.oy);
    const energy =
        away + Math.abs(p.az) + Math.abs(p.roll) +
        (Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.vaz) + Math.abs(p.vroll)) * 0.1;
    if (energy < 0.0006 && !p.held) {
        if (!p.parked) p.ox = p.oy = 0;
        p.az = p.roll = p.vx = p.vy = p.vaz = p.vroll = 0;
        return false;
    }
    return true;
}


const sfx = (name, v = 1) =>
    window.dispatchEvent(new CustomEvent("blade:sfx", { detail: { name, v: clamp(v, 0, 1) } }));
// how loud the steel sliding in the scabbard is right now (0 = not sliding)
const sfxScrape = (v) => window.dispatchEvent(new CustomEvent("blade:scrape", { detail: { v } }));

// A cut - the theme switch, and each certificate of the pile - is one stroke
// down the diagonal of the screen. Where the sword is on it takes two
// numbers: `along`, how far its middle has come down the diagonal from the
// top right corner (in half-screens), and `phi`, the angle of the blade to
// the diagonal. It waits raised (PHI_UP) further up than the corner, comes
// down turning over the top until it points along the line it has cut
// (phi = PI, at REACH), and leaves over the bottom left (BEYOND). The same
// stroke turned half round goes up the diagonal instead: that is how one cut
// follows another without the sword leaving (FOLLOW is how far it runs on
// before it comes back).
const PHI_UP = 0.45;
const REACH = 1.45;
const BEYOND = 1.3;
const FOLLOW = 0.5;
// the two raised places, one for each way, are this far apart
const ACROSS = 1.6;
// How far through a stroke it is, `u` of the way through its time: it
// gathers speed all the way. `flying` is the share of the distance it covers
// at a steady pace on top of that - none for a stroke that starts in view,
// from rest; some for one that starts out of sight, which should not be
// long in coming.
const STRIKE_POW = 1.6;
const travel = (u, flying) => (1 - flying) * Math.pow(u, STRIKE_POW) + flying * u;
// the part of its time a stroke that starts `a0` (zero or less) up the
// diagonal spends before it is over the screen
function runUp(a0, flying) {
    const back = Math.max(0, -a0);
    const goal = back / (REACH + back);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (travel(mid, flying) < goal) lo = mid;
        else hi = mid;
    }
    return hi;
}
// Whatever the run-up, the part of a stroke that crosses the screen lasts
// the same.
const STRIKE_ON = 160;
const strikeMs = (a0, flying) => STRIKE_ON / (1 - runUp(a0, flying));
const FOLLOW_MS = 110;

// Where a piece is in the world: place, turn and size.
const makePose = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 });
const copyPose = (out, a) => {
    out.p.copy(a.p);
    out.q.copy(a.q);
    out.s = a.s;
    return out;
};
// part of the way from one to another, by the shortest turn
const mixPose = (out, a, b, t) => {
    out.p.lerpVectors(a.p, b.p, t);
    out.q.slerpQuaternions(a.q, b.q, t);
    out.s = lerp(a.s, b.s, t);
    return out;
};
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// in the sword's own coordinates: the centre of the circle its curve lies on,
const ARC_C = new THREE.Vector3(BODY_X, ARC_R - BLADE.sori * 0.32, 0);
// the two ends of the cutting edge,
const EDGE_A = new THREE.Vector3(BODY_X + 0.4, -0.12 - BLADE.sori * 0.32, 0);
const EDGE_B = new THREE.Vector3(BODY_X + BLADE.length, BLADE.sori * 0.68, 0);
// and points all along it, pommel to tip, a guard's radius apart at most
const HULL = [];
for (let i = 0; i <= 22; i++) {
    const x = lerp(GRIP_END - 0.15, BLADE.length + 0.05, i / 22);
    const lift = x > 0 ? BLADE.sori * Math.pow(x / BLADE.length, 2) : 0;
    HULL.push(new THREE.Vector3(BODY_X + x, lift - BLADE.sori * 0.32, 0));
}
const GUARD_R = 0.5;

export async function initBlade() {
    const canvas = document.createElement("canvas");
    canvas.className = "blade-canvas";
    canvas.setAttribute("aria-hidden", "true");

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
        });
    } catch (err) {
        return false;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    let sword;
    try {
        sword = await loadSword(renderer);
    } catch (err) {
        renderer.dispose();
        return false;
    }
    const { katana, body, aura, core, sheath, setFinish, rooms } = sword;
    const { saya, arc, body: sayaBody } = sheath;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.z = CAM_Z;

    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-3, 5, 6);
    const fill = new THREE.PointLight(0xcfe9ff, 12, 30);
    fill.position.set(4, -2, 5);
    // rides with the pointer, so the highlights on the steel chase it
    const torch = new THREE.PointLight(0xdff2ff, 0, 9, 2);
    scene.add(key, fill, torch);
    scene.add(katana, saya);

    // ---- the cut: a line of light across the screen and the arc the blade
    // leaves behind it. Both only exist during a theme switch.
    const lineTex = canvasTexture(4, 64, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.42, "rgba(255,255,255,0.22)");
        g.addColorStop(0.5, "rgba(255,255,255,1)");
        g.addColorStop(0.58, "rgba(255,255,255,0.22)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
    const lineGeo = new THREE.PlaneGeometry(1, 1);
    lineGeo.translate(-0.5, 0, 0); // it grows from its right end
    const cutLine = new THREE.Mesh(
        lineGeo,
        new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, depthWrite: false, depthTest: false }),
    );
    cutLine.visible = false;
    cutLine.renderOrder = 5;
    const TRAIL = 40;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 6), 3));
    trailGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 8), 4));
    const trailIdx = [];
    for (let i = 0; i < TRAIL - 1; i++) trailIdx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    trailGeo.setIndex(trailIdx);
    const trail = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
        }),
    );
    trail.frustumCulled = false;
    trail.visible = false;
    trail.renderOrder = 4;
    scene.add(cutLine, trail);

    const world = document.querySelector(".world");
    if (world) world.after(canvas);
    else document.body.prepend(canvas);

    // ---- state
    let vw = 1;
    let vh = 1;
    let halfW = 1;
    let halfH = 1;
    let unit = 1;
    let narrow = false;
    let ratio = 1;
    let ratioCap = 1.5;
    let stations = { K: [], S: [] };
    let dirty = true;
    let visible = !document.hidden;
    let last = 0;
    let ignite = 0;
    let lightMode = false;
    let slow = 0;
    let flourish = 1;
    let lastScroll = window.scrollY;
    let sway = 0;
    let sheathed = true;
    let wasInside = true;
    let slidWas = 0;
    let lastRing = -1e9;
    let scrapeLevel = 0;
    let grab = null;
    let hovering = "";
    // the stroke in progress, if any (see "the cut" below)
    let cut = null;
    let armed = false;
    // During a stroke: how far back along its own line the sword is drawn,
    // or -1 while it is off that line altogether.
    let lineD = -1;
    // how far along the blade the scabbard sits, as drawn
    let slidNow = 0;
    let sheathLook = 0;
    let sheathGoal = 0;
    let parkedAt = 0;
    // what the scroll asks of the scabbard: on the blade or not, and how far along
    const ride = { want: true, goal: 0 };
    const mouse = { x: 0, y: 0, cx: 0, cy: 0, px: -9999, py: -9999, t: 0, seen: false, glow: 0, near: false };
    // starts off-screen and mid-spin, so the first frames are an entrance
    const cur = { x: 1.9, y: 0.5, z: -2, rx: 1.2, ry: -4, rz: 2.4, s: 0.7 };
    const tgt = { ...cur };
    const sCur = { x: 1.9, y: 0.5, z: -2, rx: 0, ry: 0, rz: 0, s: 0.7, lock: 1, slide: 0 };
    const sTgt = { ...sCur };
    const kBody = makeBody();
    const sBody = makeBody();

    const eul = new THREE.Euler();
    const qFree = new THREE.Quaternion();
    const qTurn = new THREE.Quaternion();
    const vFree = new THREE.Vector3();
    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const caster = new THREE.Raycaster();
    // where the scroll wants the sword, and where it is drawn (a stroke
    // takes it away from there)
    const home = makePose();
    const shown = makePose();
    const poseA = makePose();
    const poseB = makePose();
    const poseC = makePose();

    function setRatio() {
        // cap the pixels the sword costs: it sits under every frosted panel
        const budget = Math.sqrt(3.6e6 / Math.max(1, vw * vh));
        ratio = Math.max(0.75, Math.min(window.devicePixelRatio || 1, ratioCap, budget));
        renderer.setPixelRatio(ratio);
        renderer.setSize(vw, vh, false);
    }

    function measure() {
        vw = window.innerWidth;
        vh = window.innerHeight;
        narrow = vw < 900;
        setRatio();
        camera.aspect = vw / vh;
        camera.updateProjectionMatrix();
        halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
        halfW = halfH * camera.aspect;
        unit = clamp((halfW * 2) / 11, 0.42, 1.2);
        stations = buildStations(narrow);
        dirty = true;
    }

    function followY(el) {
        const r = el.getBoundingClientRect();
        return clamp(-(((r.top + r.height / 2) / vh) * 2 - 1), -1.6, 1.6);
    }

    function updateTarget() {
        if (!stations.K.length) return 0;
        const c = window.scrollY + vh / 2;
        const k = sample(stations.K, c);
        for (const key2 of POSE_KEYS) tgt[key2] = lerp(k.A.p[key2], k.B.p[key2], k.t);
        const ya = k.A.follow ? followY(k.A.follow) + k.A.lift : k.A.p.y;
        const yb = k.B.follow ? followY(k.B.follow) + k.B.lift : k.B.p.y;
        tgt.y = lerp(ya, yb, k.t);
        const s = sample(stations.S, c);
        for (const key2 of POSE_KEYS) sTgt[key2] = lerp(s.A.p[key2], s.B.p[key2], s.t);
        // it rides between two waypoints that both ride; otherwise it lets
        // go as it leaves one, and takes hold again as it reaches one
        ride.want = (s.A.on && s.B.on) || (s.A.on && s.t < 0.04) || (s.B.on && s.t > 0.96);
        ride.goal = s.A.on && s.B.on ? lerp(s.A.slide, s.B.slide, s.t) : s.A.on ? s.A.slide : s.B.slide;
        return k.i === 0 ? 1 - k.t : 0; // how much of the hero pose is showing
    }

    // The scabbard is either on the blade's own line (lock 1, `slide` units
    // along it) or flying between that line and its own place. It changes
    // over past the point and nowhere else, so however fast the page is
    // scrolled the only way on or off the blade is to slide over its tip.
    // (`shown` scales the slide during the opening draw.)
    function stepSheath(dt, shown) {
        const lock0 = sCur.lock;
        const slide0 = sCur.slide;
        if (sCur.lock >= 1) {
            const to = ride.want ? ride.goal : SHEATH_MEET;
            const d = to - sCur.slide;
            const step = Math.max(Math.abs(d) * (1 - Math.exp(-dt * 5)), 2.4 * dt);
            sCur.slide = Math.abs(d) <= step ? to : sCur.slide + Math.sign(d) * step;
            if (!ride.want && sCur.slide * shown >= SHEATH_OUT) sCur.lock = 0.999;
            // on the blade it has no will of its own
            if (grab && grab.body === sBody) release();
            sBody.ox = sBody.oy = sBody.vx = sBody.vy = 0;
            sBody.parked = false;
        } else {
            if (ride.want) {
                const meet = Math.max(ride.goal, SHEATH_MEET);
                sCur.slide = sCur.lock <= 0 ? meet : sCur.slide + (meet - sCur.slide) * (1 - Math.exp(-dt * 6));
            }
            const step = dt / 0.62;
            sCur.lock = ride.want ? Math.min(1, sCur.lock + step) : Math.max(0, sCur.lock - step);
        }
        return sCur.lock !== lock0 || Math.abs(sCur.slide - slide0) > 0.0004;
    }

    // told only when it changes enough to hear
    function scrape(v) {
        if (v === scrapeLevel || (v > 0 && Math.abs(v - scrapeLevel) < 0.05)) return;
        scrapeLevel = v;
        sfxScrape(v);
    }

    // A piece left somewhere stays on the screen: the edges turn it back.
    function keepIn(p, at) {
        if (!p.parked || p.held) return;
        const mx = halfW * 0.9;
        const my = halfH * 0.84;
        const x = at.x * halfW + p.ox;
        const y = at.y * halfH + p.oy;
        if (Math.abs(x) > mx) {
            p.ox -= x - Math.sign(x) * mx;
            if (p.vx * x > 0) p.vx *= -0.45;
        }
        if (Math.abs(y) > my) {
            p.oy -= y - Math.sign(y) * my;
            if (p.vy * y > 0) p.vy *= -0.45;
        }
    }

    // which sword the page is showing: white on dark, black on light
    function applyTheme() {
        const light = document.body.classList.contains("light-mode");
        // mid-cut the swap waits until the sword has left the screen
        if (armed || (cut && !cut.swapped)) return;
        lightMode = light;
        setFinish(light ? 1 : 0, false);
        if (!cut) {
            sheathLook = sheathGoal = light ? 1 : 0;
            setFinish(sheathLook, true);
        }
        scene.environment = rooms[light ? 1 : 0];
        renderer.toneMappingExposure = light ? 1.0 : 1.15;
        fill.color.set(light ? 0xfff1dc : 0xcfe9ff);
        fill.intensity = light ? 10 : 12;
        const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
        aura.blending = core.blending = blend;
        aura.color.set(light ? 0x0090d8 : 0x00c6ff);
        core.color.set(light ? 0x0077b6 : 0xbff1ff);
        cursorUniforms.uGlowCol.value.set(light ? 0x0a6fb0 : 0x35d2ff);
        aura.needsUpdate = core.needsUpdate = true;
        dirty = true;
    }

    // where a piece's long axis sits on screen: the centre a push turns it
    // around, and how far the pointer is from it (for the glow)
    function toPx(group, v, out) {
        group.localToWorld(v).project(camera);
        out[0] = (v.x * 0.5 + 0.5) * vw;
        out[1] = (-v.y * 0.5 + 0.5) * vh;
    }

    function project(group, x0, x1, store) {
        toPx(group, v0.set(x0, 0, 0), store.a);
        toPx(group, v1.set(x1, BLADE.sori * 0.6, 0), store.b);
        store.z = group.parent.position.z;
    }

    function distance(p, x, y) {
        const dx = p.b[0] - p.a[0];
        const dy = p.b[1] - p.a[1];
        const len2 = dx * dx + dy * dy || 1;
        const u = clamp(((x - p.a[0]) * dx + (y - p.a[1]) * dy) / len2, 0, 1);
        return Math.hypot(x - p.a[0] - dx * u, y - p.a[1] - dy * u);
    }

    // What is under a point of the screen: a ray against the shapes
    // themselves. The scabbard goes with the sword while it is on it.
    function probe(x, y) {
        ndc.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
        caster.setFromCamera(ndc, camera);
        const hits = caster.intersectObjects([sword.proxy, sheath.proxy], true);
        if (!hits.length) return null;
        let o = hits[0].object;
        while (o && o !== sword.proxy && o !== sheath.proxy) o = o.parent;
        return o === sheath.proxy && sCur.lock <= 0.5 ? sBody : kBody;
    }

    // a little forgiveness for picking up something this thin
    const NEAR = [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]];
    function pick(x, y) {
        if (cut) return null;
        for (const [dx, dy] of NEAR) {
            const p = probe(x + dx, y + dy);
            if (p) return p;
        }
        return null;
    }

    // screen pixels to world units at a piece's depth
    const toWorld = (p) => ((halfH * 2) / vh) * ((CAM_Z - p.z) / CAM_Z);

    function torque(p, x, y, vx, vy, gain) {
        // off-centre pushes spin it: the further from the middle, the harder
        const cx = (p.a[0] + p.b[0]) / 2;
        const cy = (p.a[1] + p.b[1]) / 2;
        const tq = (x - cx) * vy - (y - cy) * vx;
        p.vaz = clamp(p.vaz - tq * 0.000011 * gain, -5, 5);
        p.vroll = clamp(p.vroll + (vy - vx) * 0.0016 * gain, -7, 7);
    }

    function push(p, x, y, vx, vy) {
        const w = toWorld(p);
        p.vx = clamp(p.vx + vx * w * 0.065, -9, 9);
        p.vy = clamp(p.vy - vy * w * 0.065, -9, 9);
        torque(p, x, y, vx, vy, 0.9);
    }

    const INTERACTIVE = "a, button, input, textarea, select, label, [role='button'], .project-card.has-demo, .moment";
    const blocked = (target) => target instanceof Element && !!target.closest(INTERACTIVE);

    function setHover(over, held) {
        const state = held ? "held" : over ? "over" : "";
        if (state === hovering) return;
        hovering = state;
        window.dispatchEvent(new CustomEvent("blade:hover", { detail: { state } }));
    }

    // ---- the cut -----------------------------------------------------------
    // One stroke at a time (`cut`), in phases:
    //   wind     from wherever it is to raised, beyond the top right corner.
    //            A blade that is in its scabbard is drawn out of it first
    //   hold     waiting there, out of sight, for the page (theme switch only)
    //   strike   down the diagonal
    //   follow   another cut is wanted: it does not leave, it turns for the
    //            stroke back up
    //   exit     off over the far corner
    //   away     out of sight, until it may come back
    //   back     home again, point first along its own line
    // For the theme switch the page draws this canvas above itself for as
    // long as the new theme takes to open (motion.js, a view transition). The
    // sword is off the screen at both ends of that, so nobody sees it change
    // layer - and the moment the page freezes to take its picture of itself
    // falls while there is nothing moving to freeze. A cut through the pile
    // of certificates brings the canvas in front the same way, with a class.
    const front = (on) => canvas.classList.toggle("is-front", on);

    function pathPose(along, phi, dir, out) {
        const k = (0.8 - along) * dir;
        out.p.set(k * halfW, k * halfH, 0);
        // Turned over, so the edge leads the swing (and so the blade points
        // at minus the angle it is given).
        eul.set(Math.PI, 0, -(Math.atan2(halfH, halfW) + phi + (dir < 0 ? Math.PI : 0)));
        out.q.setFromEuler(eul);
        out.s = 1.3 * unit;
        return out;
    }

    // `from`, pulled back by `d` along the curve of its own blade: the way a
    // sword leaves a scabbard, and the way it goes back into one.
    function drawnBack(from, d, out) {
        const th = d / ARC_R;
        const c = Math.cos(th);
        const s = Math.sin(th);
        v1.set(ARC_C.x - (ARC_C.x * c + ARC_C.y * s), ARC_C.y - (ARC_C.y * c - ARC_C.x * s), 0);
        out.p.copy(v1).multiplyScalar(from.s).applyQuaternion(from.q).add(from.p);
        out.q.copy(from.q).multiply(qTurn.setFromAxisAngle(Z_AXIS, -th));
        out.s = from.s;
        return out;
    }

    // Is any of the sword over this part of the screen?
    function touches(at, left, top, right, bottom) {
        const pad = (GUARD_R * at.s * vh) / (halfH * 2) + 8;
        for (const point of HULL) {
            v0.copy(point).multiplyScalar(at.s).applyQuaternion(at.q).add(at.p).project(camera);
            const x = (v0.x * 0.5 + 0.5) * vw;
            const y = (-v0.y * 0.5 + 0.5) * vh;
            if (x > left - pad && x < right + pad && y > top - pad && y < bottom + pad) return true;
        }
        return false;
    }
    const onScreen = (at) => touches(at, 0, 0, vw, vh);

    // the arc the edge has swept in the last moments of a stroke
    const swept = [];
    const TRAIL_MS = 170;
    function sweep(at, when) {
        swept.push({
            a: EDGE_A.clone().multiplyScalar(at.s).applyQuaternion(at.q).add(at.p),
            b: EDGE_B.clone().multiplyScalar(at.s).applyQuaternion(at.q).add(at.p),
            t: when,
        });
        if (swept.length > TRAIL) swept.shift();
    }

    function drawTrail(now) {
        const pos = trailGeo.attributes.position;
        const col = trailGeo.attributes.color;
        const ink = cut.fromLight;
        const tone = ink ? [0.03, 0.2, 0.36] : [0.62, 0.92, 1];
        for (let i = 0; i < TRAIL; i++) {
            const s = swept[Math.max(0, swept.length - TRAIL + i)] || swept[0];
            const age = s ? clamp(1 - (now - s.t) / (TRAIL_MS * cut.slow), 0, 1) : 0;
            const base = s ? s.a : v0.set(0, 0, 0);
            const tip = s ? s.b : v0;
            pos.setXYZ(i * 2, base.x, base.y, base.z);
            pos.setXYZ(i * 2 + 1, tip.x, tip.y, tip.z);
            col.setXYZW(i * 2, tone[0], tone[1], tone[2], 0);
            col.setXYZW(i * 2 + 1, tone[0], tone[1], tone[2], age * age * (ink ? 0.5 : 0.6));
        }
        pos.needsUpdate = col.needsUpdate = true;
    }

    // Leaves for a stroke, from wherever it is drawn now. `clear` is the part
    // of the screen ([left, top, right, bottom]) it has to be raised clear
    // of. Returns how long until it is there.
    function windUp(kind, clear, slow) {
        release();
        flourish = 1;
        // a sword that was left somewhere gives its place up
        kBody.parked = false;
        const sheathed =
            sCur.lock >= 1 && (!cut || lineD >= 0) && slidNow + Math.max(0, lineD) < BLADE.length;
        // far enough that the point is out with a fifth of the pull to go
        const out = sheathed ? (BLADE.length - slidNow + 0.15) / 0.8 : 0;
        const d0 = sheathed ? Math.max(0, lineD) : 0;
        let a0 = 0;
        while (a0 > -3 && touches(pathPose(a0, PHI_UP, 1, poseA), clear[0], clear[1], clear[2], clear[3])) a0 -= 0.05;
        a0 -= 0.05;
        // it comes back in from out of sight for the theme switch, and
        // from beside the pile for a certificate
        const flying = kind === "theme" ? 0.3 : 0;
        cut = {
            kind,
            slow,
            dir: 1,
            a0,
            flying,
            run: runUp(a0, flying),
            phase: "wind",
            t: performance.now(),
            prev: 0,
            from: copyPose(makePose(), shown),
            out,
            d0,
            drawMs: sheathed ? (80 + 24 * (out - d0)) * slow : 0,
            windMs: (kind === "deck" ? 170 : 280) * slow,
            ms: strikeMs(a0, flying) * slow,
            outMs: 0,
            gone: [0, FOLLOW, 0],
            again: false,
            go: null,
            struckAt: 0,
            cross: 0,
            first: 0,
            until: 0,
            far: 0,
            off: null,
            flyMs: 0,
            slideMs: 0,
            fromLight: lightMode,
            swapped: kind !== "theme",
        };
        front(false);
        swept.length = 0;
        trail.visible = cutLine.visible = false;
        setHover(false, false);
        dirty = true;
        const whole = cut.drawMs * 0.72 + cut.windMs;
        if (kind !== "theme") return whole;
        // The page only has to wait until the sword is out of sight: the
        // last moments of its way up are spent where nobody sees it.
        for (let t = whole - cut.windMs * 0.6; t < whole; t += 8 * slow) {
            if (!onScreen(windAt(cut, t, poseB))) return t + 16 * slow;
        }
        return whole;
    }

    // On its way up, `t` ms after it left. A blade that was in its scabbard
    // is drawn out along its own line (drawnAt: how far, or -1 if it was
    // not in one), and leaves that line once the point is clear.
    const drawnAt = (c, t) => (c.drawMs ? lerp(c.d0, c.out, smooth(clamp(t / c.drawMs, 0, 1))) : -1);
    function windAt(c, t, out) {
        const d = drawnAt(c, t);
        const base = d < 0 ? c.from : drawnBack(home, d, poseA);
        const up = smooth(clamp((t - c.drawMs * 0.72) / c.windMs, 0, 1));
        return mixPose(out, base, pathPose(c.a0, PHI_UP, c.dir, poseC), up);
    }

    function strike(now, wait) {
        const c = cut;
        c.phase = "strike";
        c.t = now + wait;
        c.prev = -wait;
        if (!c.struckAt) {
            c.struckAt = c.t;
            c.first = c.ms;
            c.cross = c.ms * c.run;
        }
        if (c.kind === "deck") front(true);
    }

    // the same stroke, the other way: it starts from where the last one took it
    function strikeBack(when, gone) {
        const c = cut;
        c.dir = -c.dir;
        c.a0 = ACROSS - REACH - gone;
        c.flying = 0;
        c.run = runUp(c.a0, 0);
        c.ms = strikeMs(c.a0, 0) * c.slow;
        c.phase = "strike";
        c.t = when;
        c.prev = 0;
    }

    function onPath(c, at, out) {
        if (c.phase === "strike") {
            const along = c.a0 + (REACH - c.a0) * travel(clamp(at / c.ms, 0, 1), c.flying);
            const fall = Math.pow(clamp(along / REACH, 0, 1), 1 / 1.4);
            return pathPose(along, PHI_UP + smooth(fall) * (Math.PI - PHI_UP), c.dir, out);
        }
        const u = clamp(at / c.outMs, 0, 1);
        // it slows, turns on past the line, and is raised for the stroke back
        if (c.phase === "follow") {
            const gone = lerp(c.gone[0], c.gone[1], 1 - (1 - u) * (1 - u));
            return pathPose(REACH + gone, Math.PI + lerp(c.gone[2], PHI_UP, smooth(u)), c.dir, out);
        }
        return pathPose(REACH + BEYOND * (1 - Math.pow(1 - u, 1.5)), Math.PI + 0.4 * u, c.dir, out);
    }

    // It is not to leave after all: from `gone` past the end of its stroke
    // (and `phi` past the line) it runs on a little, slowing, and turns for
    // the stroke back.
    function turnBack(when, gone, phi, ms) {
        const c = cut;
        c.phase = "follow";
        c.gone = [gone, gone + (gone > 0 ? 0.3 : FOLLOW), phi];
        c.outMs = ms * c.slow;
        c.t = when;
        c.prev = 0;
    }

    // Home again. A blade whose line lies across the screen comes in along
    // it, point first - into the scabbard, if that is where it belongs. One
    // that points at the viewer (the hero) flies in from the corner it left
    // by to the mouth of the scabbard, and slides in from there.
    function comeBack(now) {
        const c = cut;
        front(false);
        trail.visible = cutLine.visible = false;
        swept.length = 0;
        c.phase = "back";
        c.t = now;
        const sheathed = sCur.lock >= 1 && slidNow < BLADE.length;
        const need = sheathed ? BLADE.length - slidNow + 0.5 : 0;
        v0.copy(X_AXIS).applyQuaternion(home.q);
        if (Math.abs(v0.z) <= 0.4) {
            // (after a stroke up the diagonal it went out point first: it
            // comes back the way it went)
            const way = c.kind === "deck" && c.dir < 0 ? -1 : 1;
            let far = need;
            while (far < 60 && onScreen(drawnBack(home, way * far, poseA))) far += 0.5;
            c.far = way * (far + 0.5);
            c.flyMs = 0;
            c.slideMs = (430 + 22 * far * home.s) * c.slow;
        } else {
            const corner = new THREE.Vector3(-halfW, -halfH, 0).normalize().multiplyScalar(c.dir);
            drawnBack(home, need, poseA);
            let k = 0;
            do {
                k += 0.5;
                poseB.p.copy(corner).multiplyScalar(k).add(poseA.p);
                poseB.q.copy(poseA.q);
                poseB.s = poseA.s;
            } while (k < 60 && onScreen(poseB));
            c.far = need;
            c.off = corner.multiplyScalar(k + 0.5);
            c.flyMs = 540 * c.slow;
            c.slideMs = need ? 420 * c.slow : 0;
        }
    }

    function stepCut(now) {
        const c = cut;
        const t = now - c.t;
        lineD = -1;
        if (c.phase === "wind") {
            windAt(c, t, shown);
            if (t <= c.drawMs * 0.72) lineD = drawnAt(c, t);
            if (t >= c.drawMs * 0.72 + c.windMs) {
                if (c.kind === "deck") strike(now, 0);
                else if (c.go) {
                    c.until = now + c.go.total;
                    strike(now, c.go.hold);
                } else {
                    c.phase = "hold";
                    c.t = now;
                }
            }
        } else if (c.phase === "hold") {
            pathPose(c.a0, PHI_UP, c.dir, shown);
            // the page never said go
            if (t > 3000) {
                c.swapped = true;
                applyTheme();
                comeBack(now);
            }
        } else if (c.phase === "away") {
            if (now >= c.until) comeBack(now);
        } else if (c.phase === "back") {
            const fly = c.flyMs ? 1 - Math.pow(1 - clamp(t / c.flyMs, 0, 1), 3) : 1;
            const d = c.flyMs
                ? c.far * (1 - smooth(clamp((t - c.flyMs * 0.78) / Math.max(1, c.slideMs), 0, 1)))
                : c.far * Math.pow(1 - clamp(t / c.slideMs, 0, 1), 3);
            drawnBack(home, d, shown);
            if (fly < 1) {
                shown.p.addScaledVector(c.off, 1 - fly);
                shown.q.multiply(qTurn.setFromAxisAngle(X_AXIS, -1.3 * (1 - fly)));
            }
            if (fly > 0.985) lineD = Math.max(0, d);
            if (t >= (c.flyMs ? Math.max(c.flyMs, c.flyMs * 0.78 + c.slideMs) : c.slideMs)) {
                cut = null;
                lineD = -1;
                return;
            }
        } else {
            // strike, follow, exit: several points of the path in every
            // frame, for the arc the edge leaves behind it
            for (let i = 1; i <= 4; i++) {
                const at = c.prev + ((t - c.prev) * i) / 4;
                onPath(c, at, shown);
                if (c.phase !== "strike" || at > c.ms * c.run * 0.8) sweep(shown, c.t + at);
            }
            c.prev = t;
            if (c.phase === "strike") {
                if (t >= c.ms) {
                    // the speed it ends the stroke with is the speed it leaves at
                    const speed = (((1 - c.flying) * STRIKE_POW + c.flying) * (REACH - c.a0)) / c.ms;
                    if (c.again) {
                        c.again = false;
                        turnBack(c.t + c.ms, 0, 0, FOLLOW_MS);
                    } else {
                        c.phase = "exit";
                        c.outMs = (1.5 * BEYOND) / speed;
                        c.t += c.ms;
                        c.prev = 0;
                    }
                }
            } else if (t >= c.outMs) {
                if (c.phase === "follow") {
                    strikeBack(c.t + c.outMs, c.gone[1]);
                } else {
                    // out of sight: this is where one sword becomes the other
                    c.phase = "away";
                    if (c.kind === "theme") {
                        c.swapped = true;
                        applyTheme();
                    } else {
                        c.until = now + 90 * c.slow;
                    }
                }
            }
        }
        katana.position.copy(shown.p);
        katana.quaternion.copy(shown.q);
        katana.scale.setScalar(shown.s);
        if (c.phase === "back") return;

        drawTrail(now);
        trail.visible = swept.length > 1;
        trail.material.blending = c.fromLight ? THREE.NormalBlending : THREE.AdditiveBlending;
        if (c.kind !== "theme" || !c.struckAt) return;
        // since the stroke began
        const ms = now - c.struckAt;
        const across = c.first - c.cross;
        // the scabbard stays on screen, so it takes its new finish as the new
        // theme opens over it
        if (ms >= c.cross + across * 0.5) sheathGoal = document.body.classList.contains("light-mode") ? 1 : 0;
        // the line: drawn corner to corner as the blade comes down, then fades
        const drawn = ramp(ms, c.cross + across * 0.1, c.first);
        const fade = 1 - ramp(ms, c.first + 55 * c.slow, c.first + 400 * c.slow);
        cutLine.visible = drawn > 0 && fade > 0;
        if (cutLine.visible) {
            const len = Math.hypot(halfW, halfH) * 2.3;
            cutLine.position.set(halfW * 1.12, halfH * 1.12, 0);
            cutLine.rotation.z = Math.atan2(halfH, halfW);
            cutLine.scale.set(len * drawn, (c.fromLight ? 0.1 : 0.16) * (0.5 + 0.5 * fade), 1);
            cutLine.material.color.set(c.fromLight ? 0x06263f : 0xcdf3ff);
            cutLine.material.blending = c.fromLight ? THREE.NormalBlending : THREE.AdditiveBlending;
            cutLine.material.opacity = fade;
        }
    }

    // A cut through the pile of certificates (motion.js asks for one each
    // time a card is to part). Returns how long until the edge is on the
    // card, or null if the sword cannot do it.
    function deckStroke(clear, slow) {
        const now = performance.now();
        // the card starts to part a moment before the stroke is through
        const early = 45 * slow;
        if (!cut || cut.phase === "back") return windUp("deck", clear, slow) + cut.ms - early;
        const c = cut;
        if (c.kind !== "deck") return null;
        const t = now - c.t;
        const round = (gone) => strikeMs(ACROSS - REACH - gone, 0) * slow - early;
        if (c.phase === "wind") return Math.max(0, c.windMs - t) + c.ms - early;
        // this stroke will do it; later than that, it takes the one back
        if (c.phase === "strike" && t < c.ms - early * 2) return c.ms - t - early;
        if (c.phase === "strike") {
            c.again = true;
            return c.ms - t + FOLLOW_MS * slow + round(FOLLOW);
        }
        if (c.phase === "exit") {
            // on its way out: it turns where it is
            const u = clamp(t / c.outMs, 0, 1);
            turnBack(now, BEYOND * (1 - Math.pow(1 - u, 1.5)), 0.4 * u, 90);
        } else if (c.phase === "away") {
            // out of sight already: back in from there
            strikeBack(now, BEYOND);
            return round(BEYOND);
        }
        return c.outMs - (now - c.t) + round(c.gone[1]);
    }

    function frame(now) {
        requestAnimationFrame(frame);
        if (!visible) return;
        const elapsed = (now - last) / 1000 || 0.016;
        const dt = Math.min(0.05, elapsed);
        last = now;

        const heroWeight = updateTarget();
        mouse.cx += (mouse.x - mouse.cx) * Math.min(1, dt * 4);
        mouse.cy += (mouse.y - mouse.cy) * Math.min(1, dt * 4);

        const ease = 1 - Math.exp(-dt * 4.2);
        let moving = false;
        const chase = (c, t, keys) => {
            for (const k of keys) {
                const d = t[k] - c[k];
                if (Math.abs(d) > 0.0004) {
                    c[k] += d * ease;
                    moving = true;
                } else {
                    c[k] = t[k];
                }
            }
        };
        // (during a stroke too: this is the place it comes back to)
        chase(cur, tgt, POSE_KEYS);
        chase(sCur, sTgt, POSE_KEYS);
        // the opening draw: it slides from sheathed to the hero's half-drawn
        const opening = lerp(0.12, 1, smooth(clamp(ignite * 1.25, 0, 1)));
        if (stepSheath(dt, opening)) moving = true;

        // the hanging scabbard leans into the scroll and settles afterwards
        const sy = window.scrollY;
        const swayTarget = clamp(((sy - lastScroll) / Math.max(dt, 0.008)) * 0.00011, -0.26, 0.26);
        lastScroll = sy;
        sway += (swayTarget - sway) * Math.min(1, dt * 3.2);
        if (Math.abs(sway) > 0.0008) moving = true;
        else sway = 0;

        let swinging = stepBody(kBody, dt) | stepBody(sBody, dt);
        keepIn(kBody, cur);
        keepIn(sBody, sCur);
        // the flourish: one clean turn that eases out
        let spin = 0;
        if (flourish < 1) {
            flourish = Math.min(1, flourish + dt / 1.05);
            spin = -TAU * Math.pow(1 - flourish, 4);
            swinging = 1;
        }
        // the tilt towards the pointer only exists on the hero
        const tilting =
            heroWeight > 0.02 && Math.abs(mouse.x - mouse.cx) + Math.abs(mouse.y - mouse.cy) > 0.002;
        const glowTarget = mouse.seen && mouse.near && !cut ? 1 : 0;
        const glowing = Math.abs(glowTarget - mouse.glow) > 0.004;
        if (glowing) mouse.glow += (glowTarget - mouse.glow) * Math.min(1, dt * 7);
        else mouse.glow = glowTarget;
        if (sheathLook !== sheathGoal) {
            const step = dt / (0.32 * (cut ? cut.slow : 1));
            sheathLook = sheathGoal > sheathLook ? Math.min(sheathGoal, sheathLook + step) : Math.max(sheathGoal, sheathLook - step);
            setFinish(smooth(sheathLook), true);
            dirty = true;
        }
        const igniting = ignite < 1;
        // the idle float only runs on the hero, so nothing repaints behind
        // the frosted panels further down while the page is at rest
        const idle = heroWeight > 0.02;
        if (!(moving || swinging || tilting || glowing || igniting || idle || dirty || cut)) {
            // nothing is moving any more: nothing is sliding either
            scrape(0);
            return;
        }
        const pointerOnly = !(moving || swinging || tilting || igniting || idle || cut);
        dirty = false;

        if (igniting) ignite = Math.min(1, ignite + dt / 1.6);
        const lit = smooth(clamp((ignite - 0.35) / 0.65, 0, 1));
        aura.opacity = (lightMode ? 0.45 : 0.6) * lit;
        core.opacity = (lightMode ? 0.8 : 0.9) * lit;

        const bob = idle ? heroWeight : 0;
        const time = now / 1000;
        const sc = cur.s * unit;
        katana.position.set(
            cur.x * halfW + kBody.ox,
            cur.y * halfH + Math.sin(time * 0.9) * 0.07 * bob + kBody.oy,
            cur.z,
        );
        katana.rotation.set(
            cur.rx - mouse.cy * 0.12 * bob + Math.sin(time * 0.7) * 0.05 * bob + kBody.roll,
            cur.ry + mouse.cx * 0.2 * bob,
            cur.rz + Math.sin(time * 0.5) * 0.015 * bob + kBody.az + spin,
        );
        katana.scale.setScalar(sc);
        // where the sword belongs: the scabbard stays there during a cut
        home.p.copy(katana.position);
        home.q.copy(katana.quaternion);
        home.s = sc;

        // scabbard: its own place, or the blade's line, or the flight between
        // the two - which always ends past the point (stepSheath)
        const riding = sCur.lock >= 1;
        const lock = riding ? 1 : smooth(clamp(sCur.lock, 0, 1));
        const free = 1 - lock;
        const slid = sCur.slide * opening;
        slidNow = slid;
        arc.rotation.z = (slid * lock) / ARC_R;
        eul.set(sCur.rx + sBody.roll * free, sCur.ry, sCur.rz + (sBody.az + sway) * free);
        qFree.setFromEuler(eul);
        vFree.set(
            sCur.x * halfW + sBody.ox * free,
            sCur.y * halfH + (sBody.oy - Math.abs(sway) * 0.5) * free,
            sCur.z,
        );
        saya.position.copy(vFree).lerp(home.p, lock);
        saya.quaternion.copy(qFree).slerp(home.q, lock);
        saya.scale.setScalar(lerp(sCur.s * unit, sc, lock));

        if (cut) stepCut(now);
        if (!cut) copyPose(shown, home);
        // A stroke takes the blade off the scabbard's line, or along it:
        // `out` is how far out of the scabbard it is, all told.
        const lined = riding && (!cut || lineD >= 0);
        const out = slid + (cut ? Math.max(0, lineD) : 0);
        cursorUniforms.uCover.value = lined ? out / BLADE.length + 0.02 : 2;

        // What is heard is what is happening, at the speed it is happening:
        // the steel sliding for as long as some of the blade is moving
        // inside the scabbard, the ring at the moment its point comes out
        // of the mouth, and the click when it is all the way home. So a
        // blade that starts half drawn only has the second half to say.
        const seated = lined && out < 0.3;
        const inside = lined && out < BLADE.length;
        const rate = Math.abs(out - slidWas) / Math.max(dt, 0.004); // units a second
        if (ignite >= 1) {
            if (seated && !sheathed) sfx("sheath", 0.8);
            if (wasInside && riding && !inside && now - lastRing > 500) {
                lastRing = now;
                sfx("ring", 0.45 + rate / 14);
            }
            scrape(inside && !seated ? clamp(rate / 7, 0, 1) : 0);
        }
        sheathed = seated;
        wasInside = inside;
        slidWas = out;
        // (the opening draw plays before any sound is allowed, so it is silent)

        scene.updateMatrixWorld();
        project(body, GRIP_END, BLADE.length, kBody);
        project(sayaBody, arc.rotation.z * ARC_R, arc.rotation.z * ARC_R + BLADE.length, sBody);
        // the page scrolls under a pointer that is not moving: what it is
        // over changes anyway
        if (mouse.seen && !grab && moving) {
            const under = document.elementFromPoint(mouse.px, mouse.py);
            setHover(!blocked(under) && !!pick(mouse.px, mouse.py), false);
        }

        cursorUniforms.uCur.value.set(mouse.px * ratio, (vh - mouse.py) * ratio, 110 * ratio);
        cursorUniforms.uGlow.value = mouse.glow;
        if (mouse.seen) {
            const wx = ((mouse.px / vw) * 2 - 1) * halfW;
            const wy = -((mouse.py / vh) * 2 - 1) * halfH;
            torch.position.set(wx, wy, cur.z + 1.5);
            torch.intensity = 5 * mouse.glow;
        }
        renderer.render(scene, camera);

        // drop resolution if this machine cannot hold the frame rate
        if (!pointerOnly && elapsed < 0.2) {
            slow = elapsed > 0.026 ? slow + 1 : Math.max(0, slow - 0.25);
            if (slow > 45 && ratioCap > 0.8) {
                ratioCap = Math.max(0.75, ratio - 0.25);
                slow = 0;
                setRatio();
                dirty = true;
            }
        }
    }

    measure();
    applyTheme();
    // Every shader now, while the canvas is still fading in - the line and
    // the arc of a cut included, which are not drawn until the first one
    // (compiling them then cost that cut a frame or two in mid-stroke).
    renderer.compile(scene, camera);

    let resizeTimer = 0;
    const remeasure = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measure, 120);
    };
    window.addEventListener("resize", remeasure);
    if ("ResizeObserver" in window) new ResizeObserver(remeasure).observe(document.body);
    window.addEventListener(
        "scroll",
        () => {
            dirty = true;
            // scrolling is what sends a piece that was left somewhere back home
            if ((kBody.parked || sBody.parked) && Math.abs(window.scrollY - parkedAt) > 4) {
                kBody.parked = sBody.parked = false;
            }
        },
        { passive: true },
    );

    window.addEventListener(
        "pointermove",
        (e) => {
            if (e.pointerType === "touch") return;
            const dtMs = Math.max(8, e.timeStamp - mouse.t);
            const moved = mouse.seen && dtMs < 120;
            const fromX = mouse.px;
            const fromY = mouse.py;
            const dx = moved ? e.clientX - fromX : 0;
            const dy = moved ? e.clientY - fromY : 0;
            const cap = (v) => clamp(v, -3200, 3200);
            const vx = cap((dx / dtMs) * 1000);
            const vy = cap((dy / dtMs) * 1000);
            mouse.t = e.timeStamp;
            mouse.px = e.clientX;
            mouse.py = e.clientY;
            mouse.x = (e.clientX / vw) * 2 - 1;
            mouse.y = (e.clientY / vh) * 2 - 1;
            mouse.seen = true;
            if (cut) return;

            if (grab) {
                // carried: it goes where the pointer goes and swings from the grip
                const p = grab.body;
                const w = toWorld(p);
                p.ox += dx * w;
                p.oy -= dy * w;
                p.vx = lerp(p.vx, vx * w, 0.45);
                p.vy = lerp(p.vy, -vy * w, 0.45);
                torque(p, mouse.px, mouse.py, vx, vy, 0.55);
                grab.moved += Math.abs(dx) + Math.abs(dy);
                mouse.near = true;
                dirty = true;
                return;
            }

            const wasNear = mouse.near;
            mouse.near = Math.min(distance(kBody, mouse.px, mouse.py), distance(sBody, mouse.px, mouse.py)) < 420;
            // only repaint for the pointer when it is close enough to matter
            if (mouse.near || wasNear) dirty = true;
            if (!mouse.near) {
                setHover(false, false);
                return;
            }
            // A push lands only where the pointer's path actually crosses a
            // piece. The path is walked in short steps, so a fast sweep that
            // jumps over the blade between two events still counts.
            const travel = Math.hypot(dx, dy);
            if (travel > 0.5) {
                const steps = clamp(Math.ceil(travel / 7), 1, 12);
                for (let i = 1; i <= steps; i++) {
                    const x = fromX + (dx * i) / steps;
                    const y = fromY + (dy * i) / steps;
                    const p = probe(x, y);
                    if (!p) continue;
                    push(p, x, y, vx, vy);
                    break;
                }
            }
            setHover(!blocked(e.target) && !!pick(mouse.px, mouse.py), false);
        },
        { passive: true },
    );

    // grab, drag, throw
    window.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" || e.button !== 0 || blocked(e.target)) return;
        const got = pick(e.clientX, e.clientY);
        if (!got) return;
        e.preventDefault();
        grab = { body: got, moved: 0 };
        got.held = true;
        got.vx = got.vy = 0;
        setHover(true, true);
        dirty = true;
    });
    const release = () => {
        if (!grab) return;
        const p = grab.body;
        p.held = false;
        // let go with whatever speed it had: that is the throw
        p.vx = clamp(p.vx, -30, 30);
        p.vy = clamp(p.vy, -30, 30);
        if (grab.moved > 6) {
            // carried somewhere: it stays there until the page scrolls
            p.parked = true;
            parkedAt = window.scrollY;
            // a drag is not a click on whatever was underneath: swallow the
            // click that follows this release, and only that one
            const swallow = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            window.addEventListener("click", swallow, { capture: true, once: true });
            setTimeout(() => window.removeEventListener("click", swallow, true), 80);
        }
        grab = null;
        setHover(!!pick(mouse.px, mouse.py), false);
        dirty = true;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);

    document.documentElement.addEventListener("pointerleave", () => {
        mouse.near = false;
        setHover(false, false);
        dirty = true;
    });
    // a full flourish, on request (the CV button asks)
    window.addEventListener("blade:slash", () => {
        if (cut) return;
        flourish = 0;
        kBody.vroll += 7;
        dirty = true;
    });
    // What motion.js asks of the sword, and what it is told back (written
    // into the event's detail, since the events are handled on the spot):
    //   wind    the theme is about to switch: leave for the stroke. Answers
    //           `lead` (ms until it is raised, out of sight), `strike` (how
    //           long the stroke will take) and `enter` (the part of that
    //           spent before it is over the screen)
    //   arm     the page is about to change theme: keep this finish for now
    //   go      the new theme is ready underneath: strike (`timing.hold` ms
    //           from now; the page has it back after `timing.total`)
    //   cancel  there will be no go
    //   deck    cut the certificate on top of the pile; `clear` is the part
    //           of the screen the pile takes. Answers `at`: ms until the
    //           edge is on the card
    window.addEventListener("blade:cut", (e) => {
        const d = e.detail;
        const now = performance.now();
        if (d.phase === "arm") {
            armed = true;
        } else if (d.phase === "wind") {
            if (!visible) return;
            d.lead = windUp("theme", [0, 0, vw, vh], d.slow || 1);
            d.strike = cut.ms;
            d.enter = cut.run;
        } else if (d.phase === "deck") {
            if (visible) d.at = deckStroke(d.clear, d.slow || 1);
        } else if (d.phase === "go" && cut && cut.kind === "theme" && !cut.struckAt) {
            armed = false;
            // still in sight on its way up: it strikes as soon as it is there
            if (cut.phase === "wind" && onScreen(shown)) {
                cut.go = d.timing;
                return;
            }
            cut.until = now + d.timing.total;
            strike(now, d.timing.hold);
        } else {
            // no stroke after all: the sword that left comes straight back
            armed = false;
            if (cut && cut.kind === "theme" && !cut.swapped) {
                cut.swapped = true;
                applyTheme();
                comeBack(now);
            } else {
                applyTheme();
            }
        }
    });
    // motion.js found the machine struggling: render at screen resolution
    const goLite = () => {
        ratioCap = Math.min(ratioCap, 1);
        setRatio();
        dirty = true;
    };
    window.addEventListener("fx:lite", goLite);
    if (document.documentElement.classList.contains("lite")) goLite();
    document.addEventListener("visibilitychange", () => {
        visible = !document.hidden;
        if (!visible) scrape(0);
        dirty = true;
    });
    new MutationObserver(applyTheme).observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
    });
    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextrestored", () => (dirty = true));

    requestAnimationFrame(frame);
    requestAnimationFrame(() => canvas.classList.add("is-live"));
    return true;
}
