"""Models the katana and its scabbard in Blender and exports them for the site.

    blender --background --python tools/katana/build_katana.py
    blender --background --python tools/katana/build_katana.py -- --blend --renders <dir>

Writes assets/models/katana.glb and katana.glb.gz (read by assets/scripts/blade.js).
  --blend     also saves tools/katana/katana.blend, to open and edit by hand
  --renders   writes a few preview renders into <dir>

Everything is built in the site's own axes - x along the blade (0 at the
collar, 6.2 at the tip), y towards the spine, z across the thickness - and
converted to Blender's on the way in, so the exported file needs no fixing
on the other side. The dimensions at the top are mirrored in blade.js, which
draws the edge light and slides the scabbard along the same curve.

Materials only carry a name and a rough colour: blade.js assigns the real
ones (one set per theme) by that name. Each vertex stores how enclosed it is
(ambient occlusion, cast here with rays) as its colour, which is what gives
the wrap and the fittings their contact shadows.
"""
import bisect
import gzip
import json
import math
import os
import struct
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "models", "katana.glb")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

TAU = math.pi * 2

# ---------------------------------------------------------------- dimensions
L = 6.2          # blade, collar to tip
SORI = 0.42      # depth of the curve
W = 0.33         # blade width at the collar
TH = 0.07        # blade thickness
TIP0 = 0.905     # where the point (kissaki) starts

A_H, B_H = 0.148, 0.104   # handle core: half width / half thickness
X_GRIP0, X_GRIP1 = -0.25, -2.07   # the part of the handle that shows the wrap
DIAMONDS = 13
PITCH = (X_GRIP0 - X_GRIP1) / DIAMONDS
X_TSUBA = -0.06
R_TSUBA = 0.45

A_S, B_S = 0.205, 0.118   # scabbard: half width / half thickness
S_T0, S_T1 = -0.004, 1.035

# the knob and the cord tied round it (only this script needs these)
T_KNOB = 0.14                                 # where the knob sits on the outward face
KNOB_L, KNOB_W, KNOB_H = 0.095, 0.06, 0.07    # its half length, half width and height
CORD_W, CORD_H = 0.076, 0.012                 # the cord, a flat braid: its width, and how far it stands off what it lies on
CORD_STEP = 0.078                             # from one turn of it to the next
CORD_TURNS = 4                                # on each side of the knob
PLAIT_S = 0.15                                # where its twisted part lies, round from the middle of the face


def lerp(a, b, f):
    return a + (b - a) * f


def smooth(f):
    f = min(1.0, max(0.0, f))
    return f * f * (3 - 2 * f)


def frame(t):
    """Centre, tangent and normal (towards the spine) of the curve at t."""
    tl = math.hypot(L, 2 * SORI * t)
    tx, ty = L / tl, 2 * SORI * t / tl
    return (L * t, SORI * t * t), (tx, ty), (-ty, tx)


def on_curve(t, o, z):
    (cx, cy), _, (nx, ny) = frame(t)
    return (cx + nx * o, cy + ny * o, z)


# ------------------------------------------------------------------- meshing
def to_blender(p):
    # site (x, y, z) -> Blender (x, -z, y); the glTF exporter turns it back
    return (p[0], -p[2], p[1])


class Part:
    """Collects quads and triangles in site coordinates, with a uv per corner."""

    def __init__(self, name, material):
        self.name = name
        self.material = material
        self.v = []
        self.f = []
        self.uv = []

    def _orient(self, first, score):
        if score >= 0:
            return
        for i in range(first, len(self.f)):
            self.f[i] = tuple(reversed(self.f[i]))
            self.uv[i] = tuple(reversed(self.uv[i]))

    def grid(self, rings, uvs, centres=None, closed=True, facets=False):
        """A sheet through `rings` (same number of points in each).

        uvs[i][j] is given per point; a closed ring gets one more uv than it
        has points, for the corner that meets the first one again.
        `facets` gives every column its own vertices, so it shades flat.
        """
        n, m = len(rings), len(rings[0])
        cols = m if closed else m - 1
        if centres is None:
            centres = [tuple(sum(p[k] for p in r) / m for k in range(3)) for r in rings]
        first = len(self.f)
        score = 0.0

        def add(i, j, ja, a, b, c, d):
            nonlocal score
            self.f.append((a, b, c, d))
            self.uv.append((uvs[i][j], uvs[i][ja], uvs[i + 1][ja], uvs[i + 1][j]))
            pa, pb, pd = Vector(self.v[a]), Vector(self.v[b]), Vector(self.v[d])
            nrm = (pb - pa).cross(pd - pa)
            mid = (pa + pb + Vector(self.v[c]) + pd) / 4
            ref = mid - (Vector(centres[i]) + Vector(centres[i + 1])) / 2
            score += nrm.dot(ref)

        if facets:
            for j in range(cols):
                jb = (j + 1) % m
                base = len(self.v)
                for r in rings:
                    self.v.append(tuple(r[j]))
                    self.v.append(tuple(r[jb]))
                for i in range(n - 1):
                    a = base + i * 2
                    add(i, j, j + 1, a, a + 1, a + 3, a + 2)
        else:
            base = len(self.v)
            for r in rings:
                self.v.extend(tuple(p) for p in r)
            for i in range(n - 1):
                for j in range(cols):
                    jb = (j + 1) % m
                    add(i, j, j + 1, base + i * m + j, base + i * m + jb,
                        base + (i + 1) * m + jb, base + (i + 1) * m + j)
        self._orient(first, score)

    def fan(self, ring, towards, uv=(0.5, 0.5)):
        """Closes a ring with triangles around its middle, facing `towards`."""
        m = len(ring)
        c = tuple(sum(p[k] for p in ring) / m for k in range(3))
        base = len(self.v)
        self.v.append(c)
        self.v.extend(tuple(p) for p in ring)
        first = len(self.f)
        score = 0.0
        for j in range(m):
            a, b = base + 1 + j, base + 1 + (j + 1) % m
            self.f.append((base, a, b))
            self.uv.append((uv, uv, uv))
            nrm = (Vector(self.v[a]) - Vector(c)).cross(Vector(self.v[b]) - Vector(c))
            score += nrm.dot(Vector(towards))
        self._orient(first, score)

    def raw(self, verts, faces, uv_of=lambda p: (0.5, 0.5)):
        base = len(self.v)
        self.v.extend(tuple(p) for p in verts)
        for f in faces:
            self.f.append(tuple(base + i for i in f))
            self.uv.append(tuple(uv_of(verts[i]) for i in f))

    def build(self, collection, sharp=None):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([to_blender(p) for p in self.v], [], self.f)
        me.update()
        layer = me.uv_layers.new(name="UVMap")
        for poly, uvs in zip(me.polygons, self.uv):
            for li, uv in zip(poly.loop_indices, uvs):
                layer.data[li].uv = uv
        if sharp is not None:
            bm = bmesh.new()
            bm.from_mesh(me)
            hard = [e for e in bm.edges
                    if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(sharp)]
            if hard:
                bmesh.ops.split_edges(bm, edges=hard)
            bm.to_mesh(me)
            bm.free()
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        me.materials.append(self.material)
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob


def ellipse(a, b, n, x=None, t=None):
    """A ring of n points: around the x axis, or around the curve at t."""
    pts = []
    for j in range(n):
        ph = TAU * j / n
        if t is None:
            pts.append((x, a * math.cos(ph), b * math.sin(ph)))
        else:
            pts.append(on_curve(t, a * math.cos(ph), b * math.sin(ph)))
    return pts


def ring_uv(u, n):
    return [(u, j / n) for j in range(n + 1)]


# ---------------------------------------------------------------------- blade
def blade_profile(t):
    """Half of the cross-section at t, spine to edge, as (offset, half thickness, v)."""
    w = W * (1 - 0.26 * max(t, 0))
    th = TH * (1 - 0.32 * max(t, 0))
    u = (t - TIP0) / (1 - TIP0) if t > TIP0 else 0.0
    k = u * u                       # the edge sweeps up to meet the spine
    spine = w / 2
    edge = -w / 2 + w * k
    ridge = lerp(w * 0.16, spine, k)
    thin = 1 - 0.9 * u
    shoulder = spine - 0.011 * (1 - k)
    z_sh = th * 0.36 * thin
    z_ri = th * 0.5 * thin

    def flat(o):
        return lerp(z_ri, z_sh, (o - ridge) / max(1e-6, shoulder - ridge))

    # the groove (bo-hi) runs from the collar and dies out before the point
    depth = 0.0125 * (1 - smooth((t - 0.66) / 0.09))
    ga = lerp(ridge, shoulder, 0.86)
    gb = lerp(ridge, shoulder, 0.16)
    pts = [(spine, 0.0), (shoulder, z_sh), (ga, flat(ga))]
    for f, d in ((0.2, 0.62), (0.5, 1.0), (0.8, 0.62)):
        o = lerp(ga, gb, f)
        pts.append((o, flat(o) - depth * d))
    pts += [(gb, flat(gb)), (ridge, z_ri), (lerp(ridge, edge, 0.5), z_ri * 0.5), (edge, 0.0)]
    span = max(1e-6, spine - edge)
    return [(o, z, (spine - o) / span) for o, z in pts]


def build_blade(mat):
    part = Part("blade", mat)
    N = 120
    ts = [lerp(-0.004, 1.0, i / N) for i in range(N + 1)]
    prof = [blade_profile(t) for t in ts]
    centres = [on_curve(t, 0, 0) for t in ts]

    def strip(idx, side):
        rings = [[on_curve(t, p[j][0], p[j][1] * side) for j in idx] for t, p in zip(ts, prof)]
        uvs = [[(max(t, 0), p[j][2]) for j in idx] for t, p in zip(ts, prof)]
        part.grid(rings, uvs, centres=centres, closed=False)

    # the back of the blade is one rounded strip; each face is two: the flat
    # with the groove, then the bevel down to the edge
    rings = [[on_curve(t, p[1][0], -p[1][1]), on_curve(t, p[0][0], 0), on_curve(t, p[1][0], p[1][1])]
             for t, p in zip(ts, prof)]
    part.grid(rings, [[(max(t, 0), 0.0)] * 3 for t in ts], centres=centres, closed=False)
    for side in (1, -1):
        strip([1, 2, 3, 4, 5, 6, 7], side)
        strip([7, 8, 9], side)
    return part


# ------------------------------------------------------------------- fittings
def habaki_section(x, e):
    hs = W / 2
    zt = 0.36 * TH + e * 0.62
    zb = 0.013 + e * 0.4
    zr = TH / 2 + e
    ridge = W * 0.16
    return [(x, hs + e, zt), (x, ridge, zr), (x, -hs - e, zb),
            (x, -hs - e, -zb), (x, ridge, -zr), (x, hs + e, -zt)]


def build_habaki(mat):
    part = Part("habaki", mat)
    for stops in (
        [(-0.02, 0.018), (-0.012, 0.024), (0.122, 0.024), (0.131, 0.018)],
        [(0.124, 0.013), (0.25, 0.013), (0.262, 0.005)],
    ):
        rings = [habaki_section(x, e) for x, e in stops]
        uvs = [[(x, j / 6) for j in range(7)] for x, _ in stops]
        part.grid(rings, uvs, facets=True)
        part.fan(rings[-1], (1, 0, 0))
    return part


def build_washers(mat):
    part = Part("seppa", mat)
    for x0, x1 in ((-0.03, -0.017), (-0.103, -0.09)):
        stops = [(x0, 0.965), (x0 + 0.003, 1.0), (x1 - 0.003, 1.0), (x1, 0.965)]
        rings = [ellipse(0.215 * s, 0.122 * s, 56, x=x) for x, s in stops]
        part.grid(rings, [ring_uv(x, 56) for x, _ in stops])
        part.fan(rings[0], (-1, 0, 0))
        part.fan(rings[-1], (1, 0, 0))
    return part


def mokko(radius, steps=96):
    """The four-lobed outline of the guard, in its own plane."""
    pts = []
    for i in range(steps):
        a = TAU * i / steps
        r = radius * (0.9 + 0.1 * abs(math.cos(2 * a)) ** 0.7)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def oval(cx, cy, rx, ry, steps=22, squeeze=0.0):
    pts = []
    for i in range(steps):
        a = TAU * i / steps
        # squeeze > 0 pinches one end: the boar's-eye openings
        k = 1 - squeeze * max(0.0, math.sin(a)) ** 2 if squeeze else 1.0
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry))
    return pts


def curve_plate(outlines, extrude, bevel):
    """Extrudes flat outlines (the first is the outside, the rest are holes)
    with rounded edges, using a Blender curve. Returns verts and faces with
    the plate lying in its local xy plane."""
    cu = bpy.data.curves.new("tmp", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    for pts in outlines:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0, 1)
        sp.use_cyclic_u = True
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    ob = bpy.data.objects.new("tmp", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    verts = [tuple(v.co) for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    # outward-facing: a closed mesh wound correctly has a positive volume
    vol = 0.0
    for f in faces:
        a = Vector(verts[f[0]])
        for i in range(1, len(f) - 1):
            vol += a.dot(Vector(verts[f[i]]).cross(Vector(verts[f[i + 1]])))
    if vol < 0:
        faces = [tuple(reversed(f)) for f in faces]
    return verts, faces


def build_tsuba(mat_plate, mat_rim):
    R = R_TSUBA

    def place(verts):
        # the plate's plane becomes the site's yz plane, facing along x
        return [(X_TSUBA + z, x, y) for x, y, z in verts]

    def uv_of(p):
        return (0.5 + p[1] / (2 * R), 0.5 + p[2] / (2 * R))

    plate = Part("tsuba_plate", mat_plate)
    holes = [
        oval(0, 0.215, 0.062, 0.1, squeeze=0.0),     # the two side openings
        oval(0, -0.215, 0.062, 0.1),
        oval(0.275, 0, 0.07, 0.062),                 # above and below the blade
        oval(-0.275, 0, 0.07, 0.062),
    ]
    for a in (45, 135, 225, 315):
        r = R * 0.6
        holes.append(oval(math.cos(math.radians(a)) * r, math.sin(math.radians(a)) * r, 0.034, 0.034, 18))
    verts, faces = curve_plate([mokko(R * 0.93)] + holes, 0.013, 0.006)
    plate.raw(place(verts), faces, uv_of)

    rim = Part("tsuba_rim", mat_rim)
    verts, faces = curve_plate([mokko(R - 0.008), mokko(R * 0.885 + 0.008)], 0.022, 0.008)
    rim.raw(place(verts), faces, uv_of)
    # the raised seat the washers sit on
    verts, faces = curve_plate([oval(0, 0, 0.2, 0.108, 48)], 0.02, 0.004)
    rim.raw(place(verts), faces, uv_of)
    return plate, rim


def grip_scale(x):
    # the handle is a touch slimmer in the middle
    s = (X_GRIP0 - x) / (X_GRIP0 - X_GRIP1)
    return 1 - 0.055 * math.sin(math.pi * min(1.0, max(0.0, s)))


def build_core(mat):
    part = Part("same", mat)
    n, m = 150, 36
    xs = [lerp(-0.2, -2.12, i / n) for i in range(n + 1)]
    rings = [ellipse(A_H * grip_scale(x), B_H * grip_scale(x), m, x=x) for x in xs]
    uvs = [[(-x, j / m) for j in range(m + 1)] for x in xs]
    part.grid(rings, uvs)
    return part


def build_collar_and_cap(mat):
    fuchi = Part("fuchi", mat)
    a, b = A_H + 0.034, B_H + 0.034
    stops = [(-0.103, 0.955), (-0.112, 1.0), (-0.232, 1.0), (-0.243, 0.985), (-0.25, 0.9)]
    rings = [ellipse(a * s, b * s, 56, x=x) for x, s in stops]
    fuchi.grid(rings, [ring_uv(-x, 56) for x, _ in stops])
    fuchi.fan(rings[0], (1, 0, 0))

    kashira = Part("kashira", mat)
    a, b = A_H + 0.03, B_H + 0.03
    stops = [(-2.062, 0.9), (-2.07, 0.985), (-2.082, 1.0), (-2.15, 1.0)]
    for i in range(1, 7):                      # the rounded end
        ps = (i / 6) * math.pi / 2
        stops.append((-2.15 - 0.06 * math.sin(ps), max(0.05, math.cos(ps))))
    rings = [ellipse(a * s, b * s, 56, x=x) for x, s in stops]
    kashira.grid(rings, [ring_uv(-x, 56) for x, _ in stops])
    kashira.fan(rings[-1], (-1, 0, 0))
    return fuchi, kashira


# A flat braid laid along a path. Seen end-on it is a low pillow: rolled-down
# edges, a gently domed top and a closed underside.
RIBBON = [(-1.0, -0.3), (-0.95, 0.66), (-0.72, 0.95), (0.0, 1.0),
          (0.72, 0.95), (0.95, 0.66), (1.0, -0.3), (0.0, -0.4)]
RIBBON_V = [0.0, 0.04, 0.16, 0.5, 0.84, 0.96, 1.0, 0.5, 0.0]


def ribbon(part, samples, u_scale):
    """samples: (position, surface normal, width, height, lift) along the path."""
    n = len(samples)
    pos = [Vector(s[0]) for s in samples]
    rings, uvs = [], []
    run = 0.0
    for i, (_, normal, width, height, lift) in enumerate(samples):
        tan = (pos[min(n - 1, i + 1)] - pos[max(0, i - 1)]).normalized()
        nrm = Vector(normal)
        nrm = (nrm - tan * nrm.dot(tan)).normalized()
        side = tan.cross(nrm).normalized()
        if i:
            run += (pos[i] - pos[i - 1]).length
        rings.append([tuple(pos[i] + side * (width / 2 * v) + nrm * (lift + height * h))
                      for v, h in RIBBON])
        uvs.append([(run * u_scale, v) for v in RIBBON_V])
    part.grid(rings, uvs, centres=[tuple(p) for p in pos])
    part.fan(rings[0], tuple(pos[0] - pos[1]))
    part.fan(rings[-1], tuple(pos[-1] - pos[-2]))


ITO_W = PITCH / 2 * 0.985
ITO_H = 0.0105


def build_wrap(mat):
    """The handle wrap: two braids wound in opposite directions. They cross
    on the middle of each flat face, taking turns to pass over each other,
    and leave a diamond of ray skin showing between crossings."""
    part = Part("ito", mat)
    x0 = X_GRIP0 + PITCH * 0.25        # the first crossing hides under the collar
    turns = (x0 - (X_GRIP1 - 0.03)) / PITCH
    steps = int(turns * 36)
    for strand in (1, -1):
        samples = []
        for i in range(steps + 1):
            w = TAU * turns * i / steps
            m = round(w / math.pi)                       # nearest crossing
            near = math.cos(w - m * math.pi) ** 2        # 1 on it, 0 at the edges
            over = (1 if m % 4 in (0, 1) else -1) * strand > 0
            x = x0 - PITCH * w / TAU
            g = grip_scale(x)
            th = math.pi / 2 + strand * w
            c, s = math.cos(th), math.sin(th)
            # it lies flat where it runs under the collar and the end cap
            shown = smooth((X_GRIP0 - x) / 0.045) * smooth((x - X_GRIP1) / 0.045)
            # pinched and thicker where it folds over the other braid
            width = ITO_W * (1 - 0.2 * near)
            height = ITO_H * (0.5 + shown * (0.5 + 0.7 * near))
            lift = ITO_H * 1.6 * near * shown if over else 0.0
            samples.append(((x, A_H * g * c, B_H * g * s), (0, c / A_H, s / B_H), width, height, lift))
        ribbon(part, samples, 1 / ITO_W)
    return part


# ------------------------------------------------------------------- scabbard
def saya_radii(t):
    k = (t - S_T0) / (S_T1 - S_T0)
    taper = 1 - 0.14 * min(1.0, max(0.0, k))
    return A_S * taper, B_S * taper


def tube(part, stops, n, grow=0.0):
    """Rings around the curve. stops: (t, scale); the scale shrinks a ring in
    place, which is what rounds off an end."""
    rings, uvs = [], []
    for t, s in stops:
        a, b = saya_radii(t)
        rings.append(ellipse((a + grow) * s, (b + grow) * s, n, t=t))
        uvs.append(ring_uv((t - S_T0) / (S_T1 - S_T0), n))
    part.grid(rings, uvs, centres=[on_curve(t, 0, 0) for t, _ in stops])
    return rings


def round_end(t_end, reach, steps=7):
    out = []
    for i in range(1, steps + 1):
        ps = (i / steps) * math.pi / 2
        out.append((t_end + reach * math.sin(ps), max(0.04, math.cos(ps))))
    return out


def build_saya(mat_lacquer, mat_fitting, mat_void):
    shell = Part("saya", mat_lacquer)
    n = 96
    stops = [(lerp(S_T0 + 0.004, S_T1, i / n), 1.0) for i in range(n + 1)]
    rings = tube(shell, stops + round_end(S_T1, 0.019), 36)
    shell.fan(rings[-1], (1, 0, 0))

    # the mouth: a ring a little proud of the lacquer, and the dark inside
    mouth = Part("koiguchi", mat_fitting)
    stops = [(S_T0 - 0.0015, 0.9), (S_T0 - 0.0015, 0.99), (S_T0, 1.0), (0.019, 1.0), (0.021, 0.985)]
    rings = tube(mouth, stops, 56, grow=0.008)
    void = Part("saya_mouth", mat_void)
    a, b = saya_radii(S_T0)
    void.fan(ellipse(a * 0.93, b * 0.9, 40, t=S_T0 - 0.001), (-1, 0, 0))

    # the end cap
    cap = Part("kojiri", mat_fitting)
    stops = [(0.983, 0.985), (0.985, 1.0), (S_T1, 1.0)] + round_end(S_T1, 0.021)
    rings = tube(cap, stops, 44, grow=0.007)
    cap.fan(rings[-1], (1, 0, 0))

    return [(shell, None), (mouth, 40), (void, None), (cap, 45)]


class Skin:
    """The scabbard's surface, unrolled. u runs along it (the site's x) and s
    round it: the distance over the surface from the middle of the outward
    face, growing towards the spine. `lap` is once round."""

    def __init__(self, t, n=720):
        a, b = saya_radii(t)
        self.angles = [math.pi / 2 - TAU * i / n for i in range(n + 1)]
        self.laps = [0.0]
        for th0, th1 in zip(self.angles, self.angles[1:]):
            self.laps.append(self.laps[-1] + math.hypot(a * (math.cos(th1) - math.cos(th0)),
                                                        b * (math.sin(th1) - math.sin(th0))))
        self.lap = self.laps[-1]

    def angle(self, s):
        s %= self.lap
        i = min(len(self.laps) - 2, bisect.bisect_right(self.laps, s) - 1)
        return lerp(self.angles[i], self.angles[i + 1],
                    (s - self.laps[i]) / (self.laps[i + 1] - self.laps[i]))

    def at(self, u, s, lift=0.0):
        """The point `lift` above the surface, and the way out of it there."""
        t = u / L
        a, b = saya_radii(t)
        th = self.angle(s)
        c, sn = math.cos(th), math.sin(th)
        _, _, (nx, ny) = frame(t)
        out = Vector((nx * c / a, ny * c / a, sn / b)).normalized()
        return Vector(on_curve(t, a * c, b * sn)) + out * lift, out


def bell(x):
    return (1 - x * x) ** 2 if abs(x) < 1 else 0.0


def thin(samples, turn=math.radians(9), reach=0.045):
    """Drops the samples a path can do without. One is kept wherever the path
    has turned or twisted, has gone a while without one, or changes size."""
    def ahead(i):
        return (Vector(samples[i + 1][0]) - Vector(samples[i][0])).normalized()

    out = [samples[0]]
    way = ahead(0)
    for i in range(1, len(samples) - 1):
        s, last = samples[i], out[-1]
        if (ahead(i).angle(way, 0.0) > turn
                or Vector(s[1]).angle(Vector(last[1]), 0.0) > turn
                or (Vector(s[0]) - Vector(last[0])).length > reach
                or abs(s[2] - last[2]) > 0.04 * CORD_W or abs(s[3] - last[3]) > 0.06 * CORD_H):
            out.append(s)
            way = ahead(i)
    out.append(samples[-1])
    return out


HOLE_LIFT = 0.011      # the cord rides this high through the knob


def build_knob(mat_lacquer, mat_gold, mat_void):
    """The knob the cord is tied through (kurigata), on the outward face,
    and the two metal eyelets (shitodome) the cord goes in and out by."""
    knob = Part("kurigata", mat_lacquer)
    (cx, cy), (tx, ty), (nx, ny) = frame(T_KNOB)
    _, bk = saya_radii(T_KNOB)
    sink = 0.014

    def power(v, e):
        return math.copysign(abs(v) ** e, v)

    # a rounded block: near-upright sides, a low domed top
    verts, faces = [], []
    nu, nv = 28, 24
    for i in range(nu + 1):
        ph = math.pi * i / nu                       # pole to pole, along the scabbard
        r = math.sin(ph) ** 0.7
        for j in range(nv):
            th = TAU * j / nv
            lx = KNOB_L * math.cos(ph)
            ly = KNOB_W * r * power(math.cos(th), 0.7)
            lz = bk - sink + (KNOB_H + sink) * r * power(max(-0.2, math.sin(th)), 0.7)
            verts.append((cx + tx * lx + nx * ly, cy + ty * lx + ny * ly, lz))
    for i in range(nu):
        for j in range(nv):
            a0 = i * nv + j
            b0 = i * nv + (j + 1) % nv
            faces.append((a0, b0, b0 + nv, a0 + nv))
    c = Vector((cx, cy, bk + 0.01))
    vol = sum((Vector(verts[f[0]]) - c).dot((Vector(verts[f[1]]) - c).cross(Vector(verts[f[2]]) - c))
              for f in faces)
    if vol < 0:
        faces = [tuple(reversed(f)) for f in faces]
    knob.raw(verts, faces)

    # the eyelets: an oval sleeve with a rolled lip standing a little proud
    # of each side, and the dark of the hole inside it
    eyelet = Part("shitodome", mat_gold)
    hole = Part("shitodome_void", mat_void)
    skin = Skin(T_KNOB)
    uk = L * T_KNOB
    along = Vector((tx, ty, 0.0))
    m = 32
    # the opening is a slot the flat cord just fits; the metal round it is
    # `wall` thick. (how far out of the knob, how much of the wall is left)
    slot_w, slot_h, wall = CORD_W / 2 + 0.003, CORD_H * 0.7 + 0.003, 0.0105
    stops = [(off, slot_w + wall * k, slot_h + wall * k) for off, k in (
        (-0.018, 1.0), (0.0, 1.0), (0.0035, 0.9), (0.0055, 0.62), (0.0055, 0.38),
        (0.0035, 0.1), (0.0, 0.0), (-0.018, 0.0))]
    for sd in (1, -1):
        s = sd * (KNOB_W - 0.003)
        centre, out = skin.at(uk, s, HOLE_LIFT + CORD_H * 0.3)
        away = (skin.at(uk, s + sd * 0.004)[0] - skin.at(uk, s - sd * 0.004)[0]).normalized()

        def oval(off, ru, rz):
            return [tuple(centre + away * off + along * (ru * math.cos(TAU * j / m))
                          + out * (rz * math.sin(TAU * j / m))) for j in range(m)]

        rings = [oval(*stop) for stop in stops]
        uvs = [[(i / len(stops), j / m) for j in range(m + 1)] for i in range(len(stops))]
        eyelet.grid(rings, uvs, centres=[tuple(centre + away * off) for off, _, _ in stops])
        hole.fan(oval(-0.006, slot_w + 0.001, slot_h + 0.001), tuple(away))
    return [(knob, None), (eyelet, None), (hole, None)]


def build_cord(mat):
    """The cord (sageo): a flat braid, tied the way a sword is dressed for
    display. It goes through the knob and once round the scabbard, and is
    wound round it in a run of turns on each side of the knob. The rest of
    it, doubled, lies twisted along the scabbard on top of those turns and
    is held down by the outermost turn on each side: its fold stands out
    beyond one of them as a loop, its two fringed ends fly free beyond the
    other."""
    part = Part("sageo", mat)
    skin = Skin(T_KNOB)
    uk = L * T_KNOB
    lap = skin.lap

    def lay(path):
        ribbon(part, thin(path), 1 / CORD_W)

    # once round, through the knob: it starts and ends inside it, and comes
    # out of the eyelets a little above the lacquer before settling onto it
    ring = []
    for i in range(361):
        s = lap * i / 360
        lift = HOLE_LIFT * (1 - smooth((min(s, lap - s) - KNOB_W) / 0.05))
        p, out = skin.at(uk, s, lift)
        ring.append((p, out, CORD_W, CORD_H, 0.0))
    lay(ring)

    first = KNOB_L + 0.012 + CORD_W / 2             # the middle of the turn nearest the knob
    last = first + CORD_STEP * (CORD_TURNS - 1)     # and of the one that holds the twist down
    beyond = last + CORD_W / 2 + 0.012              # just clear of that one

    # The twist: two strands, each a flat band that crosses over the top,
    # folds round the edge and comes back underneath.
    TW_W, TW_H = 0.066, 0.013       # a strand: width, and how far it stands off what it lies on
    SWING, DEPTH = 0.046, 0.006     # how far a strand swings to each side, and above / below the middle
    HALF_TURNS = 7
    reach = (last - CORD_W / 2 - 0.005) * HALF_TURNS / (HALF_TURNS + 1)    # the twisted stretch, each way from the knob
    half = reach / HALF_TURNS                                             # half of one crossing
    SIDE = TW_W / 2 + 0.004         # where the strands lie once they are side by side
    HOLD = CORD_H + TW_H * 0.85 + 0.006     # the holding turn rides this high over them

    # The turns. They sit square to the scabbard: each moves over to its
    # place next to the last underneath the twist, where it does not show.
    # The outermost goes over the twist instead, and comes down onto itself.
    for side in (1, -1):
        s_from = PLAIT_S - 0.02
        s_to = PLAIT_S + 0.13 + CORD_TURNS * lap
        steps = math.ceil((s_to - s_from) / 0.004)
        path = []
        for i in range(steps + 1):
            s = lerp(s_from, s_to, i / steps)
            moved = sum(smooth((s - (PLAIT_S - 0.05 + k * lap)) / 0.1) for k in range(1, CORD_TURNS))
            off = abs(s - CORD_TURNS * lap - PLAIT_S)
            begun = smooth((s - s_from) / 0.03)
            ended = 1 - smooth((s_to - s) / 0.035)
            lift = HOLD * (1 - smooth((off - 0.072) / 0.05)) - 0.004 * ended
            p, out = skin.at(uk + side * (first + CORD_STEP * moved), s, lift)
            path.append((p, out, CORD_W * lerp(0.6, 1.0, begun),
                         CORD_H * lerp(0.4, 1.0, begun) * lerp(1.0, 0.7, ended), 0.0))
        lay(path)

    def fold(turn):
        """A band a `turn` of the way round the twist (pi / 2 = the middle
        of the top): how far to the side it is, from -1 to 1, and which way
        it faces. It is no screw thread: it runs straight and flat across
        the top, rolls over at the edge, and runs back flat underneath."""
        k = round((turn - math.pi / 2) / math.pi)
        x = (turn - math.pi / 2 - k * math.pi) / (math.pi / 2)        # -1 .. 1 across this pass
        run = abs(x) * 8 / 7 if abs(x) < 0.75 else 1 - 16 / 7 * (1 - abs(x)) ** 2
        return (-math.copysign(run, x) * (-1) ** k,
                math.pi / 2 + k * math.pi + math.copysign(abs(x) ** 5, x) * math.pi / 2)

    def strand(j, u):
        """Strand j of the twist where it passes u (measured from the knob):
        its place round the scabbard, its lift, which way it faces, and how
        far it has come out of the twist (0 in it, 1 side by side)."""
        turn = math.pi / 2 + j * math.pi + HALF_TURNS * math.pi * (u + reach) / (2 * reach)
        lo, hi = math.pi / 2 + j * math.pi, math.pi / 2 + (j + HALF_TURNS) * math.pi
        facing = fold(min(hi, max(lo, turn)))[1]
        out_of = smooth((abs(u) - reach) / half)
        swing = SWING * fold(min(hi + math.pi / 2, max(lo - math.pi / 2, turn)))[0]
        to_side = smooth((abs(u) - reach - half) / 0.03)
        s = PLAIT_S + lerp(swing, (SIDE if j == 0 else -SIDE), to_side)
        rest = TW_H if math.sin(facing) < 0 else 0.0
        lift = CORD_H + lerp(TW_H + DEPTH * (1 + math.sin(facing)), rest, out_of)
        return s, lift, facing, out_of

    def on_skin(j, u):
        s, lift, facing, out_of = strand(j, u)
        p, out = skin.at(uk + u, s, lift)
        spineward = (skin.at(uk + u, s + 0.004)[0] - skin.at(uk + u, s - 0.004)[0]).normalized()
        return (p, spineward * math.cos(facing) + out * math.sin(facing),
                TW_W, TW_H * lerp(1.0, 0.85, out_of), 0.0)

    rnd = [0.37]

    def chance():
        rnd[0] = (rnd[0] * 9301.0 + 0.2113) % 1.0
        return rnd[0]

    def fringe(p, way, face, width):
        """The frayed end of a band: a fan of loose threads."""
        edge = way.cross(face).normalized()
        count = 9
        for k in range(count):
            f = k / (count - 1) - 0.5
            at = p + edge * (f * width * 0.9) - way * 0.008
            fan = f * 0.7 + (chance() - 0.5) * 0.22
            tilt = (chance() - 0.5) * 0.45
            heading = (way * math.cos(fan) + edge * math.sin(fan)).normalized()
            heading = (heading * math.cos(tilt) + face * math.sin(tilt)).normalized()
            length = 0.075 + chance() * 0.035
            curl = (chance() - 0.5) * 1.2
            thread = []
            for i in range(6):
                g = i / 5
                q = at + heading * (length * g) + face * (curl * (length * g) ** 2)
                thread.append((q, face, lerp(0.014, 0.007, g), 0.006, 0.0))
            ribbon(part, thread, 1 / CORD_W)

    # Each strand, from under the turn that holds it at the end nearer the
    # mouth, through the twist, out past the other holding turn and away
    # from the scabbard as a loose end.
    for j, (veer, rise, length, roll) in enumerate(((0.3, 0.2, 0.46, 0.22), (0.1, 0.3, 0.37, -0.18))):
        steps = math.ceil((beyond + last) / 0.003)
        path = [on_skin(j, lerp(-last, beyond, i / steps)) for i in range(steps + 1)]
        p = Vector(path[-1][0])
        s, _, facing, _ = strand(j, beyond)
        _, up = skin.at(uk + beyond, s)
        fwd = (skin.at(uk + beyond + 0.01, s)[0] - skin.at(uk + beyond - 0.01, s)[0]).normalized()
        left = up.cross(fwd).normalized()
        flip = 1 if math.sin(facing) > 0 else -1
        n = 44
        for i in range(1, n + 1):
            d = length * i / n
            yaw = veer * smooth(d / 0.16)
            pitch = rise * smooth(d / 0.1) - 0.16 * smooth((d - 0.14) / 0.3)
            flat = fwd * math.cos(yaw) + left * math.sin(yaw)
            way = flat * math.cos(pitch) + up * math.sin(pitch)
            square = up * math.cos(pitch) - flat * math.sin(pitch)
            turn = roll * smooth(d / length)
            face = (square * math.cos(turn) + way.cross(square) * math.sin(turn)) * flip
            p = p + way * (length / n)
            bound = 1 - 0.2 * smooth((d - (length - 0.045)) / 0.03)
            path.append((tuple(p), face, TW_W * bound, TW_H, 0.0))
        lay(path)
        fringe(p, way, face, TW_W * 0.8)

    # The loop: the fold of the doubled cord, standing out beyond the turn
    # that holds it at the end nearer the mouth. Its upper leg is strand 0,
    # its lower one strand 1 the other way up, which is how the twist begins.
    LOOP_L, LOOP_W = 0.25, 0.034
    base, up = skin.at(uk - beyond, PLAIT_S)
    back = (skin.at(uk - beyond - 0.01, PLAIT_S)[0] - skin.at(uk - beyond + 0.01, PLAIT_S)[0]).normalized()
    left = (skin.at(uk - beyond, PLAIT_S + 0.004)[0] - skin.at(uk - beyond, PLAIT_S - 0.004)[0]).normalized()
    out_way = (back * math.cos(0.2) + left * math.sin(0.2)).normalized()
    path = [on_skin(0, lerp(-last, -beyond, i / 12)) for i in range(13)]
    n = 72
    pts = []
    for i in range(n + 1):
        w = TAU * i / n
        along = LOOP_L * (1 - math.cos(w)) / 2
        across = LOOP_W * math.sin(w) * (1 - math.cos(w)) / 2
        climb = math.tan(0.3) * along * smooth(along / 0.1)
        height = lerp(CORD_H, CORD_H + TW_H, i / n)
        pts.append(base + out_way * along + up * (height + climb + across) + left * (SIDE * math.cos(w / 2)))
    for i in range(1, n):
        tan = (pts[i + 1] - pts[i - 1]).normalized()
        path.append((tuple(pts[i]), left.cross(tan), TW_W, TW_H, 0.0))
    path += [on_skin(1, lerp(-beyond, -last, i / 12)) for i in range(13)]
    lay(path)
    return [(part, None)]


# ---------------------------------------------------------- ambient occlusion
def bake_occlusion(objects, reach=0.13, rays=28):
    """For every vertex: how much of what is around it is blocked by the rest
    of the model. Stored as the vertex colour."""
    verts, polys = [], []
    for ob in objects:
        base = len(verts)
        verts.extend(v.co.copy() for v in ob.data.vertices)
        polys.extend([base + i for i in p.vertices] for p in ob.data.polygons)
    tree = BVHTree.FromPolygons(verts, polys, all_triangles=False)

    # the same spread of directions for every vertex, denser near the normal
    dirs = []
    for k in range(rays):
        r = math.sqrt((k + 0.5) / rays)
        ph = k * 2.399963
        dirs.append((r * math.cos(ph), r * math.sin(ph), math.sqrt(max(0.0, 1 - r * r))))

    for ob in objects:
        me = ob.data
        layer = me.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
        normals = [n.vector.copy() for n in me.vertex_normals]
        values = []
        for v, n in zip(me.vertices, normals):
            if n.length < 1e-6:
                values.append(1.0)
                continue
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            origin = v.co + n * 0.0025
            blocked = 0.0
            for dx, dy, dz in dirs:
                d = t1 * dx + t2 * dy + n * dz
                hit = tree.ray_cast(origin, d, reach)
                if hit[0] is not None:
                    blocked += 1 - hit[3] / reach
            values.append(1 - blocked / rays)
        for i, a in enumerate(values):
            a = 0.2 + 0.8 * max(0.0, min(1.0, a)) ** 1.35
            layer.data[i].color = (a, a, a, 1.0)
        me.color_attributes.active_color = layer
        me.color_attributes.render_color_index = me.color_attributes.find("ao")


# ------------------------------------------------------------------ materials
def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    # show the baked occlusion in Blender's own viewport and renders
    ao = nodes.new("ShaderNodeVertexColor")
    ao.layer_name = "ao"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = (*color, 1)
    links.new(ao.outputs["Color"], mix.inputs[7])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return mat


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    sword = bpy.data.collections.new("katana")
    sheath = bpy.data.collections.new("saya")
    scene.collection.children.link(sword)
    scene.collection.children.link(sheath)

    M = {
        "steel": material("steel", (0.78, 0.8, 0.83), 1.0, 0.16),
        "gold": material("gold", (0.83, 0.61, 0.22), 1.0, 0.3),
        "tsuba": material("tsuba", (0.8, 0.58, 0.2), 1.0, 0.42),
        "fitting": material("fitting", (0.83, 0.61, 0.22), 1.0, 0.32),
        "ito": material("ito", (0.9, 0.89, 0.85), 0.0, 0.85),
        "same": material("same", (0.86, 0.83, 0.74), 0.0, 0.7),
        "lacquer": material("lacquer", (0.9, 0.89, 0.86), 0.0, 0.18),
        "sageo": material("sageo", (0.78, 0.6, 0.25), 0.0, 0.8),
        "void": material("void", (0.01, 0.01, 0.012), 0.0, 0.9),
    }

    plate, rim = build_tsuba(M["tsuba"], M["gold"])
    fuchi, kashira = build_collar_and_cap(M["fitting"])
    katana = [
        build_blade(M["steel"]).build(sword),
        build_habaki(M["gold"]).build(sword, sharp=28),
        build_washers(M["gold"]).build(sword, sharp=40),
        plate.build(sword, sharp=32),
        rim.build(sword, sharp=32),
        fuchi.build(sword, sharp=40),
        kashira.build(sword, sharp=50),
        build_core(M["same"]).build(sword),
        build_wrap(M["ito"]).build(sword),
    ]
    pieces = (build_saya(M["lacquer"], M["fitting"], M["void"])
              + build_knob(M["lacquer"], M["gold"], M["void"])
              + build_cord(M["sageo"]))
    saya = [part.build(sheath, sharp=sharp) for part, sharp in pieces]
    bake_occlusion(katana)
    bake_occlusion(saya)
    return katana, saya


# --------------------------------------------------------------------- export
def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True,
        export_normals=True, export_texcoords=True, export_tangents=False,
        export_materials="EXPORT", export_vertex_color="ACTIVE",
        export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
        export_animations=False, export_cameras=False, export_lights=False,
        export_extras=False, export_skins=False, export_morph=False,
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})
    slim(path)
    # the copy the page actually downloads (blade.js unpacks it itself)
    with open(path, "rb") as src, gzip.open(path + ".gz", "wb", compresslevel=9) as dst:
        dst.write(src.read())


FLOAT, UBYTE, BYTE = 5126, 5121, 5120


def slim(path):
    """Repacks the exported file: normals as signed bytes and the occlusion
    as one byte per channel instead of floats. Still a standard GLB
    (KHR_mesh_quantization), about a third smaller."""
    with open(path, "rb") as fh:
        data = fh.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    bin_at = 20 + jlen + 8
    blob = data[bin_at:bin_at + struct.unpack_from("<I", data, 20 + jlen)[0]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}

    normals, colors = set(), set()
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            if "NORMAL" in prim["attributes"]:
                normals.add(prim["attributes"]["NORMAL"])
            if "COLOR_0" in prim["attributes"]:
                colors.add(prim["attributes"]["COLOR_0"])

    out = bytearray()
    views = []
    for i, acc in enumerate(doc["accessors"]):
        view = doc["bufferViews"][acc["bufferView"]]
        n = comps[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        size = acc["count"] * n * sizes[acc["componentType"]]
        raw = blob[start:start + size]
        if i in normals and acc["componentType"] == FLOAT:
            vals = struct.unpack("<%df" % (acc["count"] * 3), raw)
            packed = bytearray()
            for k in range(0, len(vals), 3):
                packed += struct.pack("<bbbx", *(max(-127, min(127, round(v * 127))) for v in vals[k:k + 3]))
            raw = bytes(packed)
            acc.update(componentType=BYTE, normalized=True)
            stride = 4
        elif i in colors:
            fmt = {5126: "f", 5123: "H", 5121: "B"}[acc["componentType"]]
            top = {5126: 1.0, 5123: 65535.0, 5121: 255.0}[acc["componentType"]]
            vals = struct.unpack("<%d%s" % (acc["count"] * n, fmt), raw)
            packed = bytearray()
            for k in range(0, len(vals), n):
                px = [max(0, min(255, round(v / top * 255))) for v in vals[k:k + n]]
                packed += bytes((px + [255])[:4])
            raw = bytes(packed)
            acc.update(componentType=UBYTE, normalized=True, type="VEC4")
            stride = None
        else:
            stride = None
        acc.pop("byteOffset", None)
        acc.pop("min", None) if i in normals or i in colors else None
        acc.pop("max", None) if i in normals or i in colors else None
        while len(out) % 4:
            out.append(0)
        nv = {"buffer": 0, "byteOffset": len(out), "byteLength": len(raw)}
        if "target" in view:
            nv["target"] = view["target"]
        if stride:
            nv["byteStride"] = stride
        acc["bufferView"] = len(views)
        views.append(nv)
        out += raw
    while len(out) % 4:
        out.append(0)
    doc["bufferViews"] = views
    doc["buffers"] = [{"byteLength": len(out)}]
    ext = set(doc.get("extensionsUsed", [])) | {"KHR_mesh_quantization"}
    doc["extensionsUsed"] = sorted(ext)
    doc["extensionsRequired"] = sorted(set(doc.get("extensionsRequired", [])) | {"KHR_mesh_quantization"})
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(struct.pack("<II", len(out), 0x004E4942))
        fh.write(out)


# -------------------------------------------------------------------- renders
def render_previews(folder):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 700
    world = bpy.data.worlds.new("w")
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.52, 0.56, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    for loc, energy in (((2, -8, 6), 3.2), ((-6, -4, -3), 1.2)):
        light = bpy.data.lights.new("sun", "SUN")
        light.energy = energy
        ob = bpy.data.objects.new("sun", light)
        scene.collection.objects.link(ob)
        ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam_ob = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(cam_ob)
    scene.camera = cam_ob
    shots = {
        "full": ((2.0, -9, 2.2), (2.0, 0, 0.1), 9.4),
        "handle": ((-1.0, -5, 1.4), (-1.0, 0, 0.0), 2.6),
        "guard": ((0.9, -2.2, 1.0), (-0.05, 0, 0.0), 1.5),
        "mouth": ((1.6, -4, 2.2), (0.9, 0, 0.05), 2.4),
        "tip": ((5.6, -5, 1.2), (5.6, 0, 0.35), 2.2),
        # the cord, from the face it is tied on, from the spine, three
        # quarters on and from behind (the scabbard is 0.75 lower here)
        "cord": ((0.9, -4, 0.2), (0.9, 0, -0.7), 2.1),
        "cord-spine": ((0.9, -1.2, 3.2), (0.9, 0, -0.7), 2.1),
        "cord-angle": ((-1.3, -2.6, 0.9), (0.9, 0, -0.7), 2.2),
        "cord-back": ((0.9, 4, 0.2), (0.9, 0, -0.7), 2.1),
    }
    for name, (eye, target, scale) in shots.items():
        cam_ob.location = eye
        cam_ob.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        cam.ortho_scale = scale
        scene.render.filepath = os.path.join(folder, f"katana-{name}.png")
        bpy.ops.render.render(write_still=True)


def main():
    katana, saya = build_scene()
    count = sum(len(o.data.vertices) for o in katana + saya)
    tris = sum(len(p.vertices) - 2 for o in katana + saya for p in o.data.polygons)
    export(OUT)
    print(f"katana: {count} vertices, {tris} triangles -> {OUT} ({os.path.getsize(OUT) // 1024} KB)")
    if "--renders" in ARGS:
        # sheath off to the side for the pictures, then back
        folder = ARGS[ARGS.index("--renders") + 1]
        for ob in saya:
            ob.location = (0, 0, -0.75)
        render_previews(folder)
        for ob in saya:
            ob.location = (0, 0, 0)
    if "--blend" in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "katana.blend"))


main()
