// sign typefaces (TeX Gyre Bonum/Adventor/Chorus/Heros Cn/Cursor: GUST Font License; Poppins: SIL Open Font License), sign glyphs only
// ===================== PARK GEOMETRY, REMODELLED =====================
// The park is built from a handful of primitive calls (box, cylinder, cone, sphere, lumpy "blob", beam, bar, tube, ring). They used to
// produce game-style low-poly shapes: razor-edged 12-triangle boxes, 5 to 10-sided "round" posts, 6-segment balls, 20-triangle rocks.
// These replacements keep every size, position and random number exactly as it was and return properly modelled shapes instead:
// boxes with chamfered, rounded-looking edges, truly round posts/drums with turned rims, smooth balls, and rocks/bushes/clouds with real
// form. Runs before the park's own script (a plain script, so it is defined by then); `b` is the THREE namespace the park passes in.
(function () {
  // the Studio's File menu can switch the remodelled shapes off for a slow machine ("Detailed park models"); that choice is kept in this browser
  let OFF = /[?&]rpgeo=0/.test(location.search); try { if (localStorage.getItem('rp_geo') === '0') OFF = true; } catch (e) { /* storage blocked: detailed */ }
  const LOG = /[?&]rpgeolog=1/.test(location.search);
  const ST = { calls: {}, tin: 0, tout: 0, log: [], off: OFF };
  const cnt = (k, tin, tout) => { const c = ST.calls[k] || (ST.calls[k] = [0, 0, 0]); c[0]++; c[1] += tin; c[2] += tout; ST.tin += tin; ST.tout += tout; };
  function mk(b, P, N, I) {
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new b.Float32BufferAttribute(N, 3)); g.setIndex(I); return g;
  }
  // push triangle a,b,c wound so it faces the way its vertex normals point
  function tri(P, N, I, a, b, c) {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz < 1e-24) return;
    const sx = N[a * 3] + N[b * 3] + N[c * 3], sy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], sz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (nx * sx + ny * sy + nz * sz >= 0) I.push(a, b, c); else I.push(a, c, b);
  }
  const quad = (P, N, I, a, b, c, d) => { tri(P, N, I, a, b, c); tri(P, N, I, a, c, d); };
  // Every remodelled shape carries the park's own plain shape with it (`rpLo`) and how far the two differ (`rpDev`, metres): the plain one
  // is drawn once that difference is too small to see, and it is the one the cast stand and walk on (see "levels of detail" below).
  // Whatever the park does to the detailed shape before placing it (a shift, a turn) is done to the plain one too.
  const link = (g, lo, dev) => { g.rpLo = lo; g.rpDev = dev; const ap = g.applyMatrix4; g.applyMatrix4 = function (m) { lo.applyMatrix4(m); return ap.call(this, m); }; return g; };

  // ---------------------------------------------------------------- box: chamfered edges whose shading rounds over (24 vertices, 44 triangles)
  // every face keeps its exact plane and its own flat normal; a narrow strip joins neighbouring faces and blends their normals
  function bevel(m) { return m < 0.018 ? 0 : Math.min(0.11 * m, 0.013); }
  // what is left of the water in the fountain and along the dry lazy river was a rectangular slab: a puddle has a wandering edge.
  // Same footprint (it stays inside the old rectangle), a flat top for the waves to play on, and an edge that thins out to nothing
  let PUD = 0;
  function puddle(b, w, h, d, lift, drop) {
    const n = 48, P = [0, h / 2 + lift, 0], N = [0, 1, 0], I = [], id = ++PUD, f1 = h3(id, 1, 3, 99) * 6.2832, f2 = h3(id, 2, 3, 99) * 6.2832;
    for (let i = 0; i < n; i++) { const t = i / n * 6.2832, r = 0.82 + 0.11 * Math.sin(2 * t + f1) + 0.07 * Math.sin(3 * t + f2), c = Math.cos(t), sn = Math.sin(t);
      P.push(w / 2 * r * 0.955 * c, h / 2 + lift, d / 2 * r * 0.955 * sn); N.push(0, 1, 0); P.push(w / 2 * r * c, -h / 2 + lift - drop, d / 2 * r * sn); N.push(c * 0.5, 0.86, sn * 0.5); }
    for (let i = 0; i < n; i++) { const a = 1 + i * 2, c = 1 + ((i + 1) % n) * 2; tri(P, N, I, 0, a, c); quad(P, N, I, a, c, c + 1, a + 1); }
    cnt('box', 12, I.length / 3); return mk(b, P, N, I);
  }
  // a chamfered box, optionally without the two big faces across axis `skip` and the four edge strips that run along axis `noStrip`
  // (the caller models those itself)
  function chamferBox(H, r, skip, noStrip) {
    const P = [], N = [], I = [];
    // vertex (axis a, corner c): on the face of axis a, at corner c (bits = sign per axis), inset by r along the other two axes
    for (let a = 0; a < 3; a++) for (let c = 0; c < 8; c++) { for (let k = 0; k < 3; k++) { const s = (c >> k) & 1 ? 1 : -1; P.push(s * (k === a ? H[k] : H[k] - r)); N.push(k === a ? s : 0); } }
    const V = (a, c) => a * 8 + c;
    for (let a = 0; a < 3; a++) { if (a === skip) continue; const u = (a + 1) % 3, v = (a + 2) % 3; for (const s of [0, 1]) { const c0 = s << a; quad(P, N, I, V(a, c0), V(a, c0 | (1 << u)), V(a, c0 | (1 << u) | (1 << v)), V(a, c0 | (1 << v))); } }
    // 12 edges: the edge runs along axis e, between the faces of the other two axes
    for (let e = 0; e < 3; e++) { if (e === noStrip) continue; const u = (e + 1) % 3, v = (e + 2) % 3; for (const su of [0, 1]) for (const sv of [0, 1]) { const c0 = (su << u) | (sv << v), c1 = c0 | (1 << e); quad(P, N, I, V(u, c0), V(u, c1), V(v, c1), V(v, c0)); } }
    for (let c = 0; c < 8; c++) tri(P, N, I, V(0, c), V(1, c), V(2, c));
    return { P, N, I };
  }
  // which way a thin slab lies: T its thin axis, U the longer of the other two (boards and ridges run along it), V across
  function slabAxes(D) { const T = D[0] <= D[1] && D[0] <= D[2] ? 0 : D[1] <= D[2] ? 1 : 2, o = [0, 1, 2].filter((k) => k !== T), U = D[o[0]] > D[o[1]] + 1e-6 ? o[0] : D[o[1]] > D[o[0]] + 1e-6 ? o[1] : (o.includes(1) ? 1 : o[0]), V = o[0] === U ? o[1] : o[0]; return [T, U, V]; }
  // a boarded panel: a wall, counter, shelf, roof or sign board of wood or painted wood is built of boards about a hand wide, with a
  // V-groove where two meet (both faces). The slab keeps its outline and its faces their planes; only the grooves are cut in
  function boardPanel(b, D, r) {
    const [T, U, V] = slabAxes(D), H = [D[0] / 2, D[1] / 2, D[2] / 2], n = Math.round(D[V] / 0.13), g = Math.min(0.004, 0.22 * D[T]), gw = Math.min(0.0045, D[V] / n * 0.12);
    const G = chamferBox(H, r, T, V), P = G.P, N = G.N, I = G.I, hu = H[U] - r, hv = H[V] - r;
    const put = (u, v, t, nu, nv, nt) => { const p = [0, 0, 0], q = [0, 0, 0]; p[U] = u; p[V] = v; p[T] = t; q[U] = nu; q[V] = nv; q[T] = nt; P.push(p[0], p[1], p[2]); N.push(q[0], q[1], q[2]); return P.length / 3 - 1; };
    const il = 1 / Math.hypot(g, gw);
    for (const sg of [1, -1]) { const t0 = sg * H[T], t1 = sg * (H[T] - g), cuts = [];
      for (let k = 0; k < n; k++) { const va = k === 0 ? -hv : -H[V] + k * D[V] / n + gw, vb = k === n - 1 ? hv : -H[V] + (k + 1) * D[V] / n - gw; cuts.push(va, vb);
        quad(P, N, I, put(-hu, va, t0, 0, 0, sg), put(hu, va, t0, 0, 0, sg), put(hu, vb, t0, 0, 0, sg), put(-hu, vb, t0, 0, 0, sg));
        if (k < n - 1) { const s0 = -H[V] + (k + 1) * D[V] / n; // the groove after this board: two walls, and a little triangle closing each end
          quad(P, N, I, put(-hu, s0 - gw, t0, 0, g * il, sg * gw * il), put(hu, s0 - gw, t0, 0, g * il, sg * gw * il), put(hu, s0, t1, 0, g * il, sg * gw * il), put(-hu, s0, t1, 0, g * il, sg * gw * il));
          quad(P, N, I, put(-hu, s0, t1, 0, -g * il, sg * gw * il), put(hu, s0, t1, 0, -g * il, sg * gw * il), put(hu, s0 + gw, t0, 0, -g * il, sg * gw * il), put(-hu, s0 + gw, t0, 0, -g * il, sg * gw * il));
          for (const eu of [1, -1]) tri(P, N, I, put(eu * hu, s0 - gw, t0, -eu, 0, 0), put(eu * hu, s0, t1, -eu, 0, 0), put(eu * hu, s0 + gw, t0, -eu, 0, 0)); } }   // (the end of a groove faces back along it)
      // the rounded edge across the board ends: cut where the boards and grooves are cut, so the two meet point for point (no seams)
      for (const eu of [1, -1]) { const d0 = put(eu * H[U], -hv, sg * (H[T] - r), eu, 0, 0), c0 = put(eu * H[U], hv, sg * (H[T] - r), eu, 0, 0), top = cuts.map((v) => put(eu * hu, v, t0, 0, 0, sg));
        for (let k = 0; k + 1 < top.length; k++) tri(P, N, I, d0, top[k], top[k + 1]); tri(P, N, I, d0, top[top.length - 1], c0); } }
    return mk(b, P, N, I);
  }
  function box(b, w, h, d, mat, tag) {
    TH = b;
    // (the fountain's sheet had its top exactly level with the basin floor, flickering in and out of it: its puddle lies on the floor.
    // The lazy river's hung 2 cm above the channel bed: their edges come down to it)
    if (!OFF && mat === 'Water_Stagnant' && h <= 0.03 && (tag === 'CentralPlaza' || tag === 'LazyRiver_DryChannel')) return puddle(b, w, h, d, tag === 'CentralPlaza' ? h + 0.002 : 0, tag === 'CentralPlaza' ? 0.003 : 0.021);
    const hx = Math.abs(w) / 2, hy = Math.abs(h) / 2, hz = Math.abs(d) / 2, mn = 2 * Math.min(hx, hy, hz), r = OFF ? 0 : bevel(mn);
    if (!(r > 0) || !(w > 0 && h > 0 && d > 0)) { cnt('box', 12, 12); return new b.BoxGeometry(w, h, d); }
    const D = [w, h, d], sl = slabAxes(D), name = mat || ''; let g, kind = 'plain';
    if (/Wood|Paint|Plank|Board/i.test(name) && !/Metal|Rust/i.test(name) && D[sl[0]] <= (/Wood|Plank|Board/i.test(name) ? 0.13 : 0.09) && D[sl[2]] >= 0.24 && Math.round(D[sl[2]] / 0.13) >= 2 && Math.round(D[sl[2]] / 0.13) <= 60) { g = boardPanel(b, D, r); kind = 'board'; }
    else { const G = chamferBox([hx, hy, hz], r, -1); g = mk(b, G.P, G.N, G.I); g.rpK = ['box', w, h, d]; }
    if (LOG) { const A = 2 * (w * h + h * d + w * d); ST.log.push('box ' + name + ' ' + kind + ' ' + (D[sl[0]] <= 0.09 ? 'thin' : D[sl[0]] <= 0.3 ? 'mid' : 'thick') + ' A' + (A < 0.1 ? '<.1' : A < 1 ? '<1' : A < 10 ? '<10' : '>=10')); }
    cnt('box', 12, g.index.count / 3); return link(g, new b.BoxGeometry(w, h, d), Math.max(0.7 * r, kind === 'board' ? 0.009 : 0));
  }

  // ---------------------------------------------------------------- round things
  // how many sides a circle of radius R needs to read as round from a few metres away
  // (the flat between two corners may bulge about 1.5 mm at arm's length, a centimetre or two on things metres across)
  function sidesFor(R) { return R < 0.006 ? 6 : R < 0.012 ? 8 : R < 0.03 ? 10 : R < 0.06 ? 14 : R < 0.12 ? 20 : R < 0.25 ? 28 : R < 0.6 ? 32 : R < 2 ? 40 : R < 6 ? 48 : 64; }
  // the park's own count `seg` says what was meant: 3 and 4 sides are prisms and pyramids (kept); 5 and up was "round, as cheaply as possible".
  // Big polygons keep their corners (the new count is a multiple of the old), so whatever stood on a corner still does
  function roundSides(R, seg) {
    if (OFF || seg < 5) return seg; const want = sidesFor(R); if (want <= seg) return seg;
    return R >= 0.25 ? seg * Math.max(1, Math.round(want / seg)) : want;
  }
  // lathe a profile [[radius, y, nr, ny], ...] (bottom to top) around Y; starts at angle 0 on +Z like three's CylinderGeometry
  function lathe(b, prof, n, capB, capT) {
    const P = [], N = [], I = [], rings = prof.length;
    for (let k = 0; k < rings; k++) { const [r, y, nr, ny] = prof[k]; for (let j = 0; j < n; j++) { const t = j / n * Math.PI * 2, s = Math.sin(t), c = Math.cos(t); P.push(r * s, y, r * c); N.push(nr * s, ny, nr * c); } }
    for (let k = 0; k + 1 < rings; k++) for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; quad(P, N, I, k * n + j, k * n + j1, (k + 1) * n + j1, (k + 1) * n + j); }
    const cap = (k, ny) => { const [r, y] = prof[k]; if (!(r > 1e-7)) return; const c = P.length / 3; P.push(0, y, 0); N.push(0, ny, 0); const o = P.length / 3; for (let j = 0; j < n; j++) { const t = j / n * Math.PI * 2; P.push(r * Math.sin(t), y, r * Math.cos(t)); N.push(0, ny, 0); } for (let j = 0; j < n; j++) tri(P, N, I, c, o + j, o + (j + 1) % n); };
    if (capB) cap(0, -1); if (capT) cap(rings - 1, 1);
    return mk(b, P, N, I);
  }
  function cylGeo(b, rt, rb, h, seg, open) {
    const R = Math.max(rt, rb), n = roundSides(R, seg), sl = (rb - rt) / h, il = 1 / Math.hypot(1, sl), nr = il, ny = sl * il, hh = h / 2;
    const rAt = (y) => rb + (rt - rb) * (y + hh) / h;
    // turned rims: a small chamfer where the side meets each flat end (only on shapes big enough to show it, and never on open tubes)
    const bv = (r) => { if (open || n < 8 || r < 0.02) return 0; const v = Math.min(0.16 * r, 0.14 * h, 0.012); return v < 0.003 ? 0 : v; }; const bb = bv(rb), bt = bv(rt);
    const prof = [];
    if (bb > 0) { prof.push([rb - bb, -hh, 0, -1]); prof.push([rAt(-hh + bb), -hh + bb, nr, ny]); } else prof.push([rb, -hh, nr, ny]);
    if (bt > 0) { prof.push([rAt(hh - bt), hh - bt, nr, ny]); prof.push([rt - bt, hh, 0, 1]); } else prof.push([rt, hh, nr, ny]);
    const g = lathe(b, prof, n, !open, !open); g.rpDev = Math.max(n > seg ? R * (1 - Math.cos(Math.PI / seg)) : 0, 0.7 * Math.max(bb, bt)); return g;
  }
  function cyl(b, rt, rb, h, seg, open, tag) {
    TH = b;
    const tin = seg * (open ? 2 : (rt > 0 ? 1 : 0) + (rb > 0 ? 1 : 0) + 2);
    if (OFF || !(h > 0) || rt < 0 || rb < 0 || !(seg >= 3)) { cnt('cyl', tin, tin); return new b.CylinderGeometry(rt, rb, h, seg, 1, open); }
    if (LOG && Math.max(rt, rb) >= 0.25 && seg >= 5 && seg <= 12) ST.log.push('cyl ' + tag + ' R=' + Math.max(rt, rb).toFixed(2) + ' h=' + h.toFixed(2) + ' seg=' + seg);
    const g = cylGeo(b, rt, rb, h, seg, open); cnt('cyl', tin, g.index.count / 3); g.rpK = ['cyl', rt, rb, h, seg, open ? 1 : 0]; return link(g, new b.CylinderGeometry(rt, rb, h, seg, 1, open), g.rpDev);
  }
  function cone(b, r, h, seg, tag) {
    const tin = 2 * seg; if (OFF || !(h > 0) || !(r > 0) || !(seg >= 3)) { cnt('cone', tin, tin); return new b.ConeGeometry(r, h, seg); }
    if (LOG && r >= 0.25 && seg >= 5 && seg <= 12) ST.log.push('cone ' + tag + ' R=' + r.toFixed(2) + ' h=' + h.toFixed(2) + ' seg=' + seg);
    const g = cylGeo(b, 0, r, h, seg, false); cnt('cone', tin, g.index.count / 3); g.rpK = ['cone', r, h, seg]; return link(g, new b.ConeGeometry(r, h, seg), g.rpDev);
  }
  // ball: the park's `seg` (often 5 to 8) becomes a count that suits its real size (`sc` = the scale the park stretches it by)
  function sph(b, r, seg, sc, tag) {
    const hs0 = Math.max(4, Math.round(seg * 0.7)), tin = 2 * seg * (hs0 - 1);
    if (OFF) { cnt('sph', tin, tin); return new b.SphereGeometry(r, seg, hs0); }
    const k = typeof sc === 'number' ? Math.abs(sc) : Math.max(Math.abs(sc[0]), Math.abs(sc[1]), Math.abs(sc[2]));
    if (LOG) ST.log.push('sph ' + tag + ' R~' + (r * k < 0.012 ? '<.012' : r * k < 0.03 ? '<.03' : r * k < 0.06 ? '<.06' : r * k < 0.12 ? '<.12' : r * k < 0.25 ? '<.25' : r * k < 0.6 ? '<.6' : r * k < 2 ? '<2' : '>=2'));
    const R = r * k, n = Math.max(seg, R < 0.012 ? 8 : R < 0.03 ? 10 : R < 0.06 ? 12 : R < 0.12 ? 16 : R < 0.25 ? 20 : R < 0.6 ? 22 : R < 2 ? 28 : 36), hs = Math.max(hs0, Math.round(n * 0.6));
    const g = new b.SphereGeometry(r, n, hs); cnt('sph', tin, 2 * n * (hs - 1)); return link(g, new b.SphereGeometry(r, seg, hs0), n > seg ? r * (1 - Math.cos(Math.PI / seg)) : hs > hs0 ? r * (1 - Math.cos(Math.PI / (2 * hs0))) : 0);
  }
  function torus(b, R, tube, radial, tubular, arc) {
    const tin = 2 * radial * tubular; if (OFF) { cnt('torus', tin, tin); return new b.TorusGeometry(R, tube, radial, tubular, arc); }
    const nr = Math.max(radial, Math.min(12, sidesFor(tube)));
    let nt = Math.max(tubular, Math.round(Math.min(32, sidesFor(R + tube)) * Math.min(1, Math.abs(arc) / (Math.PI * 2)))); if (nt > tubular) nt = tubular * Math.max(1, Math.round(nt / tubular));
    cnt('torus', tin, 2 * nr * nt); return link(new b.TorusGeometry(R, tube, nr, nt, arc), new b.TorusGeometry(R, tube, radial, tubular, arc), Math.max(nr > radial ? tube * (1 - Math.cos(Math.PI / radial)) : 0, nt > tubular ? (R + tube) * (1 - Math.cos(Math.abs(arc) / (2 * tubular))) : 0));
  }
  // a pipe along a curve: rounder, and with more steps along its bends
  function tube(b, curve, tubular, radius, radial, closed) {
    const tin = 2 * tubular * radial; if (OFF) { cnt('tube', tin, tin); return new b.TubeGeometry(curve, tubular, radius, radial, closed); }
    const nr = Math.max(radial, radius < 0.01 ? 5 : radius < 0.03 ? 6 : radius < 0.08 ? 8 : radius < 0.3 ? 12 : 20), nt = tubular * 2;
    if (LOG) ST.log.push('tube r=' + radius.toFixed(3) + ' radial ' + radial + '>' + nr + ' tubular ' + tubular + '>' + nt);
    cnt('tube', tin, 2 * nt * nr); return link(new b.TubeGeometry(curve, nt, radius, nr, closed), new b.TubeGeometry(curve, tubular, radius, radial, closed), 1.5 * radius * (1 - Math.cos(Math.PI / radial)));
  }
  // beam between two points (a thin round rod). Hair-thin ones (strings, wires) only need to stop being triangular
  function beam(b, r, len, seg) {
    const tin = 4 * seg; if (OFF || !(len > 0) || !(r > 0)) { cnt('beam', tin, tin); return new b.CylinderGeometry(r, r, len, seg, 1, false); }
    if (seg < 5) { const n = r < 0.012 ? Math.max(seg, 5) : seg; cnt('beam', tin, 4 * n); const g0 = new b.CylinderGeometry(r, r, len, n, 1, false); return n > seg ? link(g0, new b.CylinderGeometry(r, r, len, seg, 1, false), r * (1 - Math.cos(Math.PI / seg))) : g0; }
    const g = cylGeo(b, r, r, len, seg, false); cnt('beam', tin, g.index.count / 3); return link(g, new b.CylinderGeometry(r, r, len, seg, 1, false), g.rpDev);
  }

  // ---------------------------------------------------------------- blob: rocks, rubble, bushes, clouds, clumps
  // The park makes a 12, 42 or 92-point ball and pushes every point in or out at random. The same random pushes now steer a smooth,
  // finely divided surface (it swells and dips where the points were pushed), with smaller lumps and pits layered on top.
  const ICO = {};
  function ico(detail) {
    if (ICO[detail]) return ICO[detail];
    const t = (1 + Math.sqrt(5)) / 2, V0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const D = [], I = [], key = new Map(), n = detail + 1;
    const vid = (x, y, z) => { const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; const k = Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5); let i = key.get(k); if (i === undefined) { i = D.length / 3; D.push(x, y, z); key.set(k, i); } return i; };
    for (const [a, bb, c] of F0) { const A = V0[a], B = V0[bb], C = V0[c], row = [];
      for (let i = 0; i <= n; i++) { row.push([]); for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; row[i].push(vid(A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v)); } }
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) { I.push(row[i][j], row[i + 1][j], row[i][j + 1]); if (j < n - i - 1) I.push(row[i + 1][j], row[i + 1][j + 1], row[i][j + 1]); } }
    return (ICO[detail] = { D: new Float32Array(D), I });
  }
  function h3(i, j, k, s) { let n = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ s) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function vn(x, y, z, s) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), l = (a, c, t) => a + (c - a) * t;
    return l(l(l(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), u), l(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), u), v), l(l(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), u), l(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), u), v), w); }
  // leaf clumps (and moss cushions): K rounded domes spread over the ball, each with a crease where it meets its neighbours
  function clumpDirs(K, seed) { const D = new Float32Array(K * 3), ga = 2.39996323, jit = 1.1 / Math.sqrt(K);
    for (let j = 0; j < K; j++) { const y = 1 - (2 * j + 1) / K, r = Math.sqrt(Math.max(0, 1 - y * y)), t = j * ga + h3(j, 5, 1, seed) * 6.2832 * 0.15; let x = r * Math.cos(t) + (h3(j, 1, 2, seed) - 0.5) * jit, yy = y + (h3(j, 2, 2, seed) - 0.5) * jit, z = r * Math.sin(t) + (h3(j, 3, 2, seed) - 0.5) * jit; const l = Math.hypot(x, yy, z) || 1; D[j * 3] = x / l; D[j * 3 + 1] = yy / l; D[j * 3 + 2] = z / l; }
    return D; }
  // 0 in a crease .. 1 on the crown of a dome
  function clumpAt(D, x, y, z) { let d1 = -2, d2 = -2; for (let j = 0; j < D.length; j += 3) { const d = x * D[j] + y * D[j + 1] + z * D[j + 2]; if (d > d1) { d2 = d1; d1 = d; } else if (d > d2) d2 = d; }
    const a1 = Math.acos(Math.min(1, d1)), a2 = Math.acos(Math.max(-1, Math.min(1, d2))), e = Math.min(1, (a2 - a1) / (a2 + a1 + 1e-6) * 2.4); return 1 - (1 - e) * (1 - e); }
  // q: the park's ball (undisplaced, radius r0, welded); F: its random push per point (1 +- amp); sc: the scale the park applies after;
  // tag: "group|material" (the material picks the character: leaf clumps, cloud puffs, broken stone, soft stuffing); col: its vertex-colour argument
  function blob(b, q, F, r0, detail, amp, sc, tag, col) {
    const x = q.attributes.position, nc = x.count, tin = q.index ? q.index.count / 3 : nc / 3, mat = (tag || '').split('|')[1] || '';
    const k = typeof sc === 'number' ? Math.abs(sc) : Math.max(Math.abs(sc[0]), Math.abs(sc[1]), Math.abs(sc[2])), R = r0 * k;
    if (LOG) ST.log.push('blob ' + mat + ' d=' + detail + ' R~' + (R < 0.05 ? '<.05' : R < 0.15 ? '<.15' : R < 0.5 ? '<.5' : R < 1.5 ? '<1.5' : R < 4 ? '<4' : '>=4'));
    if (OFF) { for (let c = 0; c < nc; c++) x.setXYZ(c, x.getX(c) * F[c], x.getY(c) * F[c], x.getZ(c) * F[c]); q.computeVertexNormals(); cnt('blob', tin, tin); return q; }
    const cloud = /Cloud/i.test(mat), moss = /Moss/i.test(mat), leafy = moss || /Foliage|Leaf|Vine|Bush/i.test(mat), rock = !cloud && !leafy && /Concrete|Rock|Stone|Rubble|Asphalt|Brick|Volcanic/i.test(mat);
    const dN = Math.max(detail, cloud ? 3 : moss ? 2 : leafy ? (R < 1.5 ? 3 : R < 4 ? 5 : 6) : rock ? (R < 0.12 ? 7 : 11) : R < 0.05 ? 2 : R < 0.5 ? 3 : R < 1.5 ? 4 : R < 4 ? 5 : 6), T = ico(dN), D = T.D, nv = D.length / 3;
    const U = new Float32Array(nc * 3); for (let c = 0; c < nc; c++) { const X = x.getX(c), Y = x.getY(c), Z = x.getZ(c), l = Math.hypot(X, Y, Z) || 1; U[c * 3] = X / l; U[c * 3 + 1] = Y / l; U[c * 3 + 2] = Z / l; }
    // each control point's influence fades to nothing a little past its neighbours (spacing ~ sqrt(4 pi / count) radians)
    const th = Math.sqrt(4 * Math.PI / nc) * 1.35, c0 = Math.cos(th), ic = 1 / (1 - c0); let seed = 0; for (let c = 0; c < nc; c++) seed = (seed + Math.round(F[c] * 65536) * (c + 1)) | 0;
    const P = new Float32Array(nv * 3), fm = 1 / (2.6 * Math.sqrt(4 * Math.PI / nv)), f1 = fm * 0.45, f2 = fm, a1 = amp * 0.42, a2 = amp * 0.2, SH = leafy ? new Float32Array(nv) : null;
    // the park's lump was a faceted solid whose flats lay well inside its corners (a 12-point ball holds 60% of its sphere): the smooth one
    // is drawn in by that much, so it takes up the room the old one did and nothing near it is crowded
    const shr = nc <= 12 ? 0.87 : nc <= 42 ? 0.965 : 0.985;
    const CD = leafy ? clumpDirs(Math.max(6, Math.min(34, Math.round(nv / 13))), seed) : null;
    // Broken stone and concrete. The park's lump is twenty flat triangles meeting in razor edges. The stone drawn here is that same lump
    // worn: every break keeps its plane, the edges and corners between them are knocked off and rounded (more in some places than
    // others), and the faces are pitted. It stays inside the old lump, so it sits where the lump sat; the cast still walk on the lump
    // itself (the plain level), which is why their steps over the rubble are exactly what they were.
    const cuts = []; if (rock && q.index) { const ix = q.index.array; for (let t = 0; t < ix.length; t += 3) { const a = ix[t], bb = ix[t + 1], c = ix[t + 2];
        const ax = U[a * 3] * F[a], ay = U[a * 3 + 1] * F[a], az = U[a * 3 + 2] * F[a], ux = U[bb * 3] * F[bb] - ax, uy = U[bb * 3 + 1] * F[bb] - ay, uz = U[bb * 3 + 2] * F[bb] - az, vx = U[c * 3] * F[c] - ax, vy = U[c * 3 + 1] * F[c] - ay, vz = U[c * 3 + 2] * F[c] - az;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (!(l > 1e-9)) continue; nx /= l; ny /= l; nz /= l; let dd = nx * ax + ny * ay + nz * az; if (dd < 0) { nx = -nx; ny = -ny; nz = -nz; dd = -dd; } if (!(dd > 1e-4)) continue;
        // the cone this face spans from the centre: a direction belongs to the face when it is on the inner side of all three edge planes
        const A = [U[a * 3], U[a * 3 + 1], U[a * 3 + 2]], Bv = [U[bb * 3], U[bb * 3 + 1], U[bb * 3 + 2]], Cv = [U[c * 3], U[c * 3 + 1], U[c * 3 + 2]], cr = (p, q2) => [p[1] * q2[2] - p[2] * q2[1], p[2] * q2[0] - p[0] * q2[2], p[0] * q2[1] - p[1] * q2[0]];
        const e1 = cr(A, Bv), e2 = cr(Bv, Cv), e3 = cr(Cv, A), mx = A[0] + Bv[0] + Cv[0], my = A[1] + Bv[1] + Cv[1], mz = A[2] + Bv[2] + Cv[2], sg = e1[0] * mx + e1[1] * my + e1[2] * mz < 0 ? -1 : 1;
        cuts.push([nx, ny, nz, dd, e1[0] * sg, e1[1] * sg, e1[2] * sg, e2[0] * sg, e2[1] * sg, e2[2] * sg, e3[0] * sg, e3[1] * sg, e3[2] * sg]); } }
    // how far out the lump reaches along a direction: the plane of the face whose cone (from the centre) holds that direction
    let last = 0; const E0 = nc <= 12 ? 0.08 : nc <= 42 ? 0.05 : 0.035, rho = (x1, y1, z1) => { const m = cuts.length; for (let k = 0; k < m; k++) { const j = last + k < m ? last + k : last + k - m, c = cuts[j]; if (x1 * c[4] + y1 * c[5] + z1 * c[6] < -1e-6 || x1 * c[7] + y1 * c[8] + z1 * c[9] < -1e-6 || x1 * c[10] + y1 * c[11] + z1 * c[12] < -1e-6) continue; const dt = x1 * c[0] + y1 * c[1] + z1 * c[2]; if (dt > 1e-6) { last = j; return c[3] / dt; } } return -1; };
    for (let i = 0; i < nv; i++) { const dx = D[i * 3], dy = D[i * 3 + 1], dz = D[i * 3 + 2]; let ws = 0, fs = 0;
      for (let c = 0; c < nc; c++) { const dt = dx * U[c * 3] + dy * U[c * 3 + 1] + dz * U[c * 3 + 2]; if (dt <= c0) continue; let w = (dt - c0) * ic; w *= w; w *= w; ws += w; fs += w * F[c]; }
      let f = ws > 0 ? fs / ws : 1;
      if (leafy) { // clumps of leaves (moss: cushions): rounded domes with creases between, the creases a shade darker
        const cl = clumpAt(CD, dx, dy, dz); f += (moss ? 0.45 : 0.7) * amp * (cl - 0.62); SH[i] = 1 - 0.26 * (1 - cl) * (1 - cl);
      } else f += a1 * (vn(dx * f1 + 3.1, dy * f1 + 7.7, dz * f1 + 1.3, seed) - 0.5) + a2 * (vn(dx * f2 + 9.2, dy * f2, dz * f2 + 4.4, seed ^ 0x5bd1e995) - 0.5);
      f *= shr;
      if (cuts.length) { // the lump's own surface, averaged over a small ring of directions round this one: flat on a flat (the average is
        // taken of 1/distance, which is exact there), rounded over an edge or a corner
        const eps = E0 * (0.6 + 0.8 * vn(dx * 2.1 + 3.3, dy * 2.1 + 1.7, dz * 2.1 + 9.1, seed)), ax = Math.abs(dx) < 0.6 ? 1 : 0, ay = ax ? 0 : 1;
        let t1x = dy * 0 - dz * ay, t1y = dz * ax - dx * 0, t1z = dx * ay - dy * ax; const tl = 1 / Math.hypot(t1x, t1y, t1z); t1x *= tl; t1y *= tl; t1z *= tl; const t2x = dy * t1z - dz * t1y, t2y = dz * t1x - dx * t1z, t2z = dx * t1y - dy * t1x;
        let acc = 0, cntS = 0; for (let ring = 0; ring < 2; ring++) { const e = ring ? eps * 0.5 : eps, nrm = Math.sqrt(1 + e * e); for (let k = 0; k < 6; k++) { const a = (k + ring * 0.5) * 1.0471976, ca = Math.cos(a) * e, sa = Math.sin(a) * e, ux = dx + t1x * ca + t2x * sa, uy = dy + t1y * ca + t2y * sa, uz = dz + t1z * ca + t2z * sa, il = 1 / Math.hypot(ux, uy, uz), h = rho(ux * il, uy * il, uz * il); if (h > 0) { acc += nrm / h; cntS++; } } }
        const hit = cntS ? cntS / acc : rho(dx, dy, dz);
        if (hit > 0) f = hit * (1 - 0.004 * (1 - vn(dx * f2 * 1.7 + 5.1, dy * f2 * 1.7 + 2.2, dz * f2 * 1.7 + 8.3, seed)) - 0.014 * Math.max(0, vn(dx * 6.3 + 1.9, dy * 6.3 + 6.1, dz * 6.3 + 4.7, seed ^ 0x2545f491) - 0.7)); }
      P[i * 3] = dx * r0 * f; P[i * 3 + 1] = dy * r0 * f; P[i * 3 + 2] = dz * r0 * f; }
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.BufferAttribute(P, 3)); g.setIndex(T.I); g.computeVertexNormals();
    if (SH) { // shade rides on the vertex colour the park would have filled in (same 8-bit form, so the pieces still merge)
      let cr = 1, cg = 1, cb = 1; if (typeof col === 'number') { if (col <= 4) cr = cg = cb = col; else { const C = new b.Color().setHex(col); cr = C.r; cg = C.g; cb = C.b; } }
      const C8 = new Uint8Array(nv * 3); for (let i = 0; i < nv; i++) { C8[i * 3] = Math.max(0, Math.min(255, Math.round(cr * SH[i] * 255))); C8[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(cg * SH[i] * 255))); C8[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(cb * SH[i] * 255))); }
      g.setAttribute('color', new b.BufferAttribute(C8, 3, true)); }
    cnt('blob', tin, T.I.length / 3);
    if (leafy && !moss && !/Vine|Ooze/i.test(mat) && R >= 0.22) { // where its sprays of leaves will stand (see "leaves", with the jungle): points of its own surface, evenly picked
      const L0 = sprayLen(R), N = sprayCount(R * 0.9, L0), A = new Float32Array(N * 6); let cr = 1, cg = 1, cb = 1; if (typeof col === 'number') { if (col <= 4) cr = cg = cb = col; else { const C = new b.Color().setHex(col); cr = C.r; cg = C.g; cb = C.b; } }
      for (let i = 0; i < N; i++) { const j = Math.min(nv - 1, Math.floor(((i * 0.6180339887 + (seed & 1023) / 1024) % 1) * nv)); A[i * 6] = P[j * 3]; A[i * 6 + 1] = P[j * 3 + 1]; A[i * 6 + 2] = P[j * 3 + 2]; A[i * 6 + 3] = D[j * 3]; A[i * 6 + 4] = D[j * 3 + 1]; A[i * 6 + 5] = D[j * 3 + 2]; }
      g.rpLeaf = { A, L0, seed, col: [cr, cg, cb] }; }
    // the plain level: the park's own lump, its points pushed in and out exactly as the park pushed them
    for (let c = 0; c < nc; c++) x.setXYZ(c, x.getX(c) * F[c], x.getY(c) * F[c], x.getZ(c) * F[c]); q.computeVertexNormals();
    return link(g, q, r0 * (rock ? 0.03 : nc <= 12 ? 0.25 : nc <= 42 ? 0.14 : 0.08));
  }

  // ---------------------------------------------------------------- levels of detail, distance culling
  // Each (object, material) mesh of the park can exist twice. The PLAIN one is the park's own shape, under the mesh's own name: it is what
  // the rest of the page works with (the ground under the cast's feet and their routes, clicks, the Studio's object paths, exports of
  // the simple park) and what is drawn from far off. The DETAILED one (name + "@hi") is only ever looked at: it is drawn while the
  // difference between the two is big enough on screen to see (`dev` metres, seen from the distance to the mesh, in pixels of the picture
  // being drawn, so a long lens or a 4K render keeps detail further out). A mesh whose thickest member is under 0.4 px is not drawn
  // at all (it still stops a ray). Which of the two is drawn is switched with layers (layer 31 = not drawn), never with `.visible`, which stays the page's own.
  const HID = -2147483648, ENT = [], TWIN = new WeakMap(), QL = /[?&]rplod=(hi|lo)/.exec(location.search);
  const LOD = { ents: ENT, cams: new Set(), frame: 0, force: QL ? QL[1] : null, frozen: 0, px: 0.5, cap: 96, aux: [], stat: { near: 0, far: 0, culled: 0, lazy: 0 } };
  let TH = null;
  const push = (M, k, v) => { let a = M.get(k); if (!a) M.set(k, (a = [])); a.push(v); };
  const noRay = () => {};
  // a ray meant for what is on screen reaches the detailed mesh; it is answered by the plain one (same hits as everything else gets)
  function hiRay(r, hits) { const lo = TWIN.get(this); if (!lo || lo.layers.test(r.layers)) return; lo.raycast(r, hits); }
  // draw / don't draw, keeping whatever other layers the page gave the mesh (grass has its own for the outline pass)
  function show(m, on) { const L = m.layers, k = L.mask; if (on) { if (k < 0) L.mask = ((m.userData.rpL || 1) | (k & 0x7fffffff)) | 0; } else if (k !== HID) { m.userData.rpL = k < 0 ? (m.userData.rpL || 1) | (k & 0x7fffffff) : k; L.mask = HID; } }
  function reg(e) { e.box = new TH.Box3(); e.near = false; e.cull = false; e.g = null; e.t = 0; if (e.tol === undefined) e.tol = LOD.px; if (e.fpx === undefined) e.fpx = 0.4; for (const m of e.lo) show(m, true); if (e.hi) for (const m of e.hi) show(m, false); ENT.push(e); if (!LOD.hooked) { LOD.hooked = 1; hook(); } return e; }
  // the park's builder hands every finished shape here (B: the builder, e: the shape, o: its material, s: where it goes, r: its colour)
  function addM(B, e, o, s, r) {
    let L = e.rpLo, V = e.rpDev || 0; if (L) delete e.applyMatrix4; const K = e.rpK;
    if (B.rpFar) { push(B.far || (B.far = new Map()), o, B.addM1(L || e, o, s, r)); return B; }   // a far stand-in only (a prize plush's two balls)
    if (L && !(V > 0)) { e = L; L = null; }                                                        // no visible difference: the plain shape serves for both
    if (L) V *= (B.base ? B.base.clone().multiply(s) : s).getMaxScaleOnAxis();
    if (LOG && e.rpK) { const M = B.base ? B.base.clone().multiply(s) : s, m = M.elements, K = e.rpK, sy = Math.hypot(m[4], m[5], m[6]) || 1, sx = Math.hypot(m[0], m[1], m[2]) || 1; (ST.klog || (ST.klog = [])).push([B.group.name, o.name, K[0], +(K[1] * sx).toFixed(3), +((K[0] === 'cone' ? K[1] : K[2]) * sx).toFixed(3), +((K[0] === 'cone' ? K[2] : K[3]) * sy).toFixed(3), K[0] === 'cone' ? K[3] : K[4], +(m[5] / sy).toFixed(3), +(m[13]).toFixed(2), B.rpFar ? 1 : 0]); }
    if (e.rpLeaf && !B.rpFar) { if (o && o.name) LEAFY.add(o.name); (B.leaf || (B.leaf = [])).push({ L: e.rpLeaf, M: B.base ? B.base.clone().multiply(s) : s.clone(), c: o.color ? [o.color.r, o.color.g, o.color.b] : [0.3, 0.5, 0.25] }); delete e.rpLeaf; }
    const hi = B.addM1(e, o, s, r); push(B.parts, o, hi); push(B.lo || (B.lo = new Map()), o, L ? B.addM1(L, o, s, r) : hi);
    if (L) { const dv = B.dev || (B.dev = new Map()); dv.set(o, Math.max(dv.get(o) || 0, V)); }
    if (K && L && TH) { const ex = joinery(TH, B, K, o, s); if (ex) { for (const g of ex) push(B.parts, o, B.addM1(g, o, s, r)); const dv = B.dev || (B.dev = new Map()); dv.set(o, Math.max(dv.get(o) || 0, 0.03)); } }
    // the thickest member of this mesh so far (the middle side of each part's box): that decides when the mesh is too thin to draw
    hi.computeBoundingBox(); const bb = hi.boundingBox, d = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].sort((p, q) => p - q), ft = B.feat || (B.feat = new Map()); ft.set(o, Math.max(ft.get(o) || 0, d[1]));
    return B;
  }
  // ---- joinery. A post was a bare stick. In the detailed level every upright post or pole stands on something and ends in something:
  // a square timber, painted or metal post gets a foot block and a cap a little wider than itself; a round pole gets a base flange
  // and a collar. Only uprights of ordinary size (a square post 5 to 32 cm thick, a pole 4 to 24 cm across; at least 1.2 m long and
  // slender), of wood, paint or metal, standing plumb and not stretched. Drawn only: the plain level has none of it.
  // K: what the shape is (['box', w, h, d] or ['cyl', rt, rb, h, seg, open]); s: where the builder puts it. Returns the extra shapes, in the post's own space
  function joinery(b, B, K, o, s) {
    if (OFF || B.rpFar) return null; const name = o.name || ''; if (!/Wood|Plank|Paint|Rust|Steel|Metal|Chrome|Iron/i.test(name) || /Glass|Water|Foliage|Rubber|Canvas|Cloth|Vine|Rope|Chain/i.test(name)) return null;
    let ax, len, t0, t1;
    if (K[0] === 'box') { const D = [K[1], K[2], K[3]]; ax = D[0] >= D[1] && D[0] >= D[2] ? 0 : D[1] >= D[2] ? 1 : 2; len = D[ax]; t0 = D[(ax + 1) % 3]; t1 = D[(ax + 2) % 3]; const tx = Math.max(t0, t1), tn = Math.min(t0, t1); if (!(len >= 1.2) || tx > 0.32 || tn < 0.05 || len < 5 * tx || tx > 2.2 * tn) return null; }
    else if (K[0] === 'cyl') { ax = 1; len = K[3]; t0 = t1 = 2 * Math.max(K[1], K[2]); if (K[5] || !(len >= 1.2) || t0 < 0.04 || t0 > 0.24 || len < 6 * t0 || Math.abs(K[1] - K[2]) > 0.3 * Math.max(K[1], K[2])) return null; }
    else return null;
    const m = (B.base ? B.base.clone().multiply(s) : s).elements, cx = m[ax * 4], cy = m[ax * 4 + 1], cz = m[ax * 4 + 2], cl = Math.hypot(cx, cy, cz);
    if (Math.abs(cl - 1) > 0.02 || Math.abs(cy / cl) < 0.985 || Math.abs(Math.hypot(m[((ax + 1) % 3) * 4], m[((ax + 1) % 3) * 4 + 1], m[((ax + 1) % 3) * 4 + 2]) - 1) > 0.02) return null;
    const up = cy > 0 ? 1 : -1, out = [], put = (g, at) => { const v = [0, 0, 0]; v[ax] = at; g.translate(v[0], v[1], v[2]); out.push(g); };
    if (K[0] === 'box') { const tx = Math.max(t0, t1), fh = Math.min(0.11, Math.max(0.05, 0.45 * tx)), ch = 0.036;
      const blk = (k, add, h) => { const H = [0, 0, 0]; H[ax] = h / 2; H[(ax + 1) % 3] = t0 * k / 2 + add; H[(ax + 2) % 3] = t1 * k / 2 + add; const G = chamferBox(H, Math.min(0.012, h * 0.3), -1); return mk(b, G.P, G.N, G.I); };
      put(blk(1.3, 0.012, fh), -up * (len / 2 - fh / 2)); put(blk(1.22, 0.008, ch), up * (len / 2 - ch / 2)); cnt('joint', 0, 2 * 44); }
    else { const R = t0 / 2, n = sidesFor(R * 2.1), fl = cylGeo(b, R * 2.1, R * 2.1, 0.018, n, false), chh = Math.max(0.06, R * 1.6), co = up > 0 ? cylGeo(b, R * 1.3, R * 1.55, chh, n, false) : cylGeo(b, R * 1.55, R * 1.3, chh, n, false);
      put(fl, -up * (len / 2 - 0.009)); put(co, -up * (len / 2 - 0.018 - chh / 2)); cnt('joint', 0, (fl.index.count + co.index.count) / 3); }
    return out;
  }
  // ... and asks for the meshes here once an object is complete (opt: its shadow flags; merge: three's mergeGeometries)
  function build(B, opt, b, merge, blade) {
    TH = b; const G = B.group; grassTex(b, blade, 1);
    const mesh = (list, o, name) => { const g = list.length === 1 ? list[0] : merge(list, false); if (!g) { console.warn('merge failed', G.name, o.name); return null; } const m = new b.Mesh(g, o); m.name = name; m.castShadow = opt.cast ?? !o.transparent; m.receiveShadow = opt.receive ?? true; G.add(m); return m; };
    for (const [o, s] of B.parts) {
      const dev = (B.dev && B.dev.get(o)) || 0, name = G.name + '.' + o.name, grass = o.name === 'Grass_Blades', glow = !!(o.emissive && o.emissiveIntensity > 0.4 && o.emissive.getHex() !== 0);
      const feat = glow ? 0 : grass ? 0.05 : (B.feat && B.feat.get(o)) || 0, fpx = grass ? 0.35 : 0.4;
      const lo = mesh(dev > 0 ? B.lo.get(o) : s, o, name); if (!lo) continue; if (grass) lo.layers.enable(2);
      const hi = dev > 0 ? mesh(s, o, name + '@hi') : null;
      if (!hi) { reg({ lo: [lo], hi: null, ref: lo, dev: 0, feat, fpx }); continue; }
      hi.userData.rpHi = 1; hi.raycast = hiRay; TWIN.set(hi, lo); if (grass) hi.layers.enable(2);
      reg({ lo: [lo], hi: [hi], pair: 1, ref: lo, dev, tol: grass ? 1.5 : LOD.px, feat, fpx });
    }
    if (B.far) for (const [o, s] of B.far) { const m = mesh(s, o, G.name + '.' + o.name + '@far'); if (m) m.userData.rpFar = 1; }
    if (B.leaf && B.leaf.length && blade) leafSet(b, G, B.leaf, blade); B.leaf = null;
    B.parts.clear(); for (const k of ['lo', 'dev', 'feat', 'far']) if (B[k]) B[k].clear();
    return G;
  }
  // the sprays of leaves on an object's crowns and bushes (recs: each crown's anchor points and where the builder put it): one mesh for the
  // object, made the first time a camera comes near enough and dropped when it has long gone, drawn like grass (no ink lines)
  function leafSet(b, G, recs, blade) {
    const box = new b.Box3(), v = new b.Vector3(), n3 = new b.Matrix3();
    for (const r of recs) { const A = r.L.A; for (let i = 0; i < A.length; i += 6) box.expandByPoint(v.set(A[i], A[i + 1], A[i + 2]).applyMatrix4(r.M)); } box.expandByScalar(0.7);
    reg({ lo: [], hi: null, ref: { geometry: { boundingBox: box }, matrixWorld: G.matrixWorld }, dev: LEAF.dev, tol: LEAF.tol, feat: 0, mk: () => {
      const S = { p: [], c: [], i: [], v(x, y, z, r, g, bb) { this.p.push(x, y, z); this.c.push(r, g, bb); return this.p.length / 3 - 1; } };
      for (const r of recs) { const A = r.L.A, col = r.L.col; n3.getNormalMatrix(r.M); let h = (r.L.seed ^ 0x9e3779b9) >>> 0; const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
        for (let i = 0; i < A.length; i += 6) { const u1 = rnd(), sh = 0.8 + 0.34 * rnd(), warm = rnd() < 0.18, len = r.L.L0 * (0.75 + 0.5 * rnd()); if (A[i + 4] < -0.55 && u1 < 0.7) continue;
          v.set(A[i + 3], A[i + 4], A[i + 5]).applyMatrix3(n3).normalize(); const nx = v.x, ny = v.y, nz = v.z, k = sh * (0.72 + 0.28 * (A[i + 4] * 0.5 + 0.5)); v.set(A[i], A[i + 1], A[i + 2]).applyMatrix4(r.M);
          spray(S, v.x, v.y, v.z, nx, ny, nz, r.c[0] * col[0] * k * (warm ? 1.12 : 1), r.c[1] * col[1] * k * (warm ? 1.08 : 1), r.c[2] * col[2] * k * (warm ? 0.7 : 1), len, rnd); } }
      if (!S.i.length) return [];
      const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(S.p, 3)); if (S.anc && S.anc.length === S.p.length) g.setAttribute('aAnchor', new b.Float32BufferAttribute(S.anc, 3)); g.setAttribute('color', new b.Float32BufferAttribute(S.c, 3)); g.setIndex(S.i); g.computeVertexNormals();
      const h = new b.Mesh(g, leafMat(b, blade)); h.name = G.name + '.Leaf_Sprays@hi'; h.castShadow = false; h.receiveShadow = true; h.layers.enable(2); h.userData.rpHi = 1; h.raycast = noRay; G.add(h); h.updateWorldMatrix(true, false); cnt('spray', 0, S.i.length / 3); return [h]; } });
  }
  // a set made elsewhere: detailed meshes `hi` standing in for plain ones `lo` (the sculpted prize plushes over the park's own balls)
  function addSet(hi, lo, dev, tol) { for (const m of hi) { m.userData.rpHi = 1; m.raycast = noRay; } return reg({ lo, hi, ref: hi[0], dev, tol: tol || LOD.px, feat: 0 }); }
  // once for each view of each frame, before it is drawn (R: the renderer, cam: the view's camera, rt: where it is drawing)
  const CAMS = new WeakMap();
  function update(R, scene, cam, rt) {
    if (window.__rp && cam === window.__rp.camera && (cam.layers.mask & 1)) { try { atmosFrame(); grassUpdate(R, scene, cam); } catch (err) { if (!GRS.err) { GRS.err = String(err); console.warn('grass', err); } } }
    if (!LOD.cams.has(cam) || !ENT.length || !(cam.layers.mask & 1)) return;   // (only views that draw the world: not the caption pass)
    if (LOD.frozen) { if (performance.now() - LOD.frozen > 6e5) freeze(false); else return; }
    const ce = cam.matrixWorld.elements, cx = ce[12], cy = ce[13], cz = ce[14], H = rt ? rt.height : R.domElement.height, persp = !!cam.isPerspectiveCamera;
    const K = persp ? H * (cam.zoom || 1) / (2 * Math.tan((cam.fov || 40) * Math.PI / 360)) : H * (cam.zoom || 1) / Math.max(1e-6, (cam.top - cam.bottom) || 1), now = performance.now();
    let c = CAMS.get(cam); if (!c) CAMS.set(cam, (c = { x: NaN }));
    if (LOD.last === cam && c.x === cx && c.y === cy && c.z === cz && c.K === K && c.f === LOD.frame && c.n === ENT.length && now - c.t < 30) return;   // the same view again (a later pass of the same frame)
    LOD.last = cam; c.x = cx; c.y = cy; c.z = cz; c.K = K; c.f = LOD.frame; c.n = ENT.length; c.t = now;
    const st = LOD.stat; st.near = st.far = st.culled = 0; let builds = window.__rpRendering || LOD.burst || LOD.force === 'hi' ? 1e9 : 1, lazy = 0;   // (a video render gets every tile it needs at once)
    for (let i = 0; i < ENT.length; i++) { const e = ENT[i], m = e.ref, g = m.geometry, w = m.matrixWorld.elements;
      if (e.g !== g || e.w0 !== w[12] || e.w1 !== w[13] || e.w2 !== w[14] || e.w3 !== w[0] || e.w4 !== w[5] || e.w5 !== w[8]) { if (!g.boundingBox) g.computeBoundingBox(); e.box.copy(g.boundingBox).applyMatrix4(m.matrixWorld); e.g = g; e.w0 = w[12]; e.w1 = w[13]; e.w2 = w[14]; e.w3 = w[0]; e.w4 = w[5]; e.w5 = w[8]; }
      const B = e.box, dx = Math.max(B.min.x - cx, 0, cx - B.max.x), dy = Math.max(B.min.y - cy, 0, cy - B.max.y), dz = Math.max(B.min.z - cz, 0, cz - B.max.z), ppm = persp ? K / Math.max(0.05, Math.sqrt(dx * dx + dy * dy + dz * dz)) : K;   // pixels to the metre, at the mesh
      let cull = false; if (e.feat > 0 && !LOD.force) { const p = e.feat * ppm; cull = e.cull ? p < e.fpx * 1.25 : p < e.fpx; }
      let near = false; if ((e.hi || e.mk) && !cull) { const p = e.dev * ppm; near = LOD.force ? LOD.force === 'hi' : e.near ? p > e.tol * 0.8 : p > e.tol; }
      if (near && !e.hi) { if (builds > 0) { builds--; e.hi = e.mk(); if (!e.hi.length) { e.hi = null; e.mk = null; near = false; } } else near = false; }   // (a jungle tile's detailed trees are made when first needed, one tile a frame)
      e.near = near; e.cull = cull; if (near) e.t = now; if (e.mk && e.hi) lazy++; if (e.on && e.was !== near) { e.was = near; e.on(near); }
      for (let k = 0; k < e.lo.length; k++) show(e.lo[k], !near && !cull);
      if (e.hi) { for (let k = 0; k < e.hi.length; k++) show(e.hi[k], near);
        if (e.pair) { const lo = e.lo[0], hi = e.hi[0]; if (hi.visible !== lo.visible) hi.visible = lo.visible; if (hi.material !== lo.material) hi.material = lo.material; if (!hi.position.equals(lo.position)) hi.position.copy(lo.position); if (!hi.quaternion.equals(lo.quaternion)) hi.quaternion.copy(lo.quaternion); if (!hi.scale.equals(lo.scale)) hi.scale.copy(lo.scale); } }
      if (cull) st.culled++; else if (near) st.near++; else st.far++; }
    // detailed jungle tiles no longer near: only the most recently used stay in memory
    if (lazy > LOD.cap) { const idle = ENT.filter((e) => e.mk && e.hi && !e.near).sort((p, q) => p.t - q.t); for (let k = 0; k < idle.length && lazy > LOD.cap; k++, lazy--) { for (const m of idle[k].hi) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); } idle[k].hi = null; } }
    st.lazy = lazy; if (GR.dirty) GR.far();
  }
  // ================================================================ wind grass and the sky
  // GRASS: blades of real grass, made around the camera wherever the island's ground is grassy and nothing stands on it, and swayed by the
  // wind on the graphics card. The ground is cut into 5 m cells; a cell is made (seeded, so always the same) when the camera comes within
  // 30 m and dropped when it has gone; near cells have every tuft, farther ones fewer, and at the edge they shrink smoothly into the
  // painted grass of the ground, so there is no line where they stop. Each tuft is five curved blades; the wind bends them by the square
  // of their height, in travelling gusts (stronger in a storm, still in fog), with a little flutter of its own. Nothing here can be
  // stood on, hit or exported, and none of it exists in simple mode.
  const GRS = { on: false, cells: new Map(), cand: [], mat: null, geo: null, group: null, cam: null, T: null };
  function terrGrid(M) {   // the island's own heights and colours, by grid point
    const pa = M.geometry.attributes.position, ca = M.geometry.attributes.color, x0 = pa.getX(0), z0 = pa.getZ(0), S = (pa.getX(220) - x0) / 220, sz = (pa.getZ(220 * 221) - z0) / 220;
    const H = new Float32Array(221 * 221), C = new Float32Array(221 * 221 * 3);
    const W = new Int32Array(pa.count).fill(-1);   // (each vertex's grid point, by world position, x and z rising)
    for (let k = 0; k < pa.count; k++) { const i = Math.round((pa.getX(k) - x0) / S), j = Math.round((pa.getZ(k) - z0) / sz); if (i < 0 || j < 0 || i > 220 || j > 220) continue; const q = i + j * 221; H[q] = pa.getY(k); if (ca) { C[q * 3] = ca.getX(k); C[q * 3 + 1] = ca.getY(k); C[q * 3 + 2] = ca.getZ(k); } W[k] = (S > 0 ? i : 220 - i) + (sz > 0 ? j : 220 - j) * 221; }
    // which of each grid square's two triangles the island really has: the park cut the ground away under the water park (its basin, the
    // wave machine, its decks are their own floors), so there is no lawn to grow there; terrAt says "no ground" over any missing triangle
    let tri = null; const ix = M.geometry.index;
    if (ix) { tri = new Uint8Array(220 * 220); const A = ix.array;
      for (let t = 0; t + 2 < A.length; t += 3) { const v = [W[A[t]], W[A[t + 1]], W[A[t + 2]]]; if (v[0] < 0 || v[1] < 0 || v[2] < 0) continue;
        const iw = v.map((q) => q % 221), jw = v.map((q) => Math.floor(q / 221)), ci = Math.min(...iw), cj = Math.min(...jw); if (ci > 219 || cj > 219) continue;
        const has = (i, j) => v.indexOf(i + j * 221) >= 0, lo = has(ci, cj), hi = has(ci + 1, cj + 1); tri[ci + cj * 220] |= lo && !hi ? 1 : hi && !lo ? 2 : 3; } }
    return { x0, z0, S, sz, H, C, tri };
  }
  function terrAt(x, z, out, raw) {   // height (with the detailed ground's relief) and colour at (x, z), on the same triangles as the island mesh
    const T = GRS.T, xm = Math.min(T.x0, T.x0 + 220 * T.S), zm = Math.min(T.z0, T.z0 + 220 * T.sz), gx = (x - xm) / Math.abs(T.S), gz = (z - zm) / Math.abs(T.sz), i = Math.floor(gx), j = Math.floor(gz); if (i < 0 || j < 0 || i >= 220 || j >= 220) return false;
    const ix = (iw, jw) => (T.S > 0 ? iw : 220 - iw) + (T.sz > 0 ? jw : 220 - jw) * 221;   // (grid points by world position, x and z rising, as the park's own U0g)
    const u = gx - i, v = gz - j, a = ix(i, j), bq = ix(i, j + 1), d = ix(i + 1, j), c = ix(i + 1, j + 1), H = T.H, C = T.C;
    if (!raw && T.tri && !(T.tri[i + j * 220] & (u + v <= 1 ? 1 : 2))) return false;   // (a hole in the island: no ground here)
    let wa, wb, wc, wd; if (u + v <= 1) { wa = 1 - u - v; wd = u; wb = v; wc = 0; } else { wc = u + v - 1; wb = 1 - u; wd = 1 - v; wa = 0; }
    out.y = wa * H[a] + wb * H[bq] + wc * H[c] + wd * H[d] + ground(x, z);
    for (let k = 0; k < 3; k++) out.c[k] = wa * C[a * 3 + k] + wb * C[bq * 3 + k] + wc * C[c * 3 + k] + wd * C[d * 3 + k];
    return true;
  }
  // a square of lawn, 25 cm across, every blade its own: near, 16 blades (1.1–1.8 cm wide, 12–34 cm tall) on a jittered grid (tiles laid edge to edge make an even
  // carpet, no clumps, no gaps), each two segments and a point; far, 8 single-triangle blades. Each blade carries its own root (aRoot:
  // x, z in the tile, and a seed), so the graphics card gives every blade in the world its own height, lean, turn and place (no two
  // tiles alike). uv.y: how far up the blade
  function grassGeo(b, far, lvl2) {   // (far: only every third blade of the near tile, exactly the same blades, so the change at 8 m cannot be seen)
    const P = [], N = [], UV = [], RT = [], I = []; let s = 77, T = 0.25;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const G = 7;   // (49 blades a tile: 784 a square metre near)
    for (let gj = 0, k = 0; gj < G; gj++) for (let gi = 0; gi < G; gi++, k++) {
      const bx = ((gi + 0.1 + 0.8 * r()) / G - 0.5) * T, bz = ((gj + 0.1 + 0.8 * r()) / G - 0.5) * T, h = 0.09 + Math.pow(r(), 1.2) * 0.19, w = 0.0048 + r() * 0.003, lean = 0.15 + r() * 0.35, la = r() * 6.283, fa = la + Math.PI / 2 + (r() - 0.5) * 0.8, sd = r();
      const keep = k % 3 === 0, keep2 = k % 9 === 0; if (far && !keep) continue; if (lvl2 && !keep2) continue;
      const fx = Math.cos(fa), fz = Math.sin(fa), lx = Math.cos(la), lz = Math.sin(la), base = P.length / 3, nn = [lx * 0.25, 0.94, lz * 0.25], nl = Math.hypot(nn[0], nn[1], nn[2]);
      const SEG = far ? 1 : 3;   // (near: seven vertices, a smooth bend; far: three)
      for (let q = 0; q <= SEG; q++) { const t = q / SEG, ww = q === SEG ? 0 : w * (1 - 0.45 * t), off = lean * t * t * h, y = h * t * (1 - 0.15 * t * t);
        const cx = bx + lx * off, cz = bz + lz * off; if (q < SEG) { P.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww); UV.push(0, t, 1, t); } else { P.push(cx, y, cz); UV.push(0.5, 1); }
        for (let e = 0; e < (q < SEG ? 2 : 1); e++) { N.push(nn[0] / nl, nn[1] / nl, nn[2] / nl); RT.push(bx, bz, sd + (keep2 ? 4 : keep ? 2 : 0)); } }
      for (let q = 0; q < SEG - 1; q++) { const p = base + q * 2; I.push(p, p + 1, p + 3, p, p + 3, p + 2); }
      I.push(base + (SEG - 1) * 2, base + (SEG - 1) * 2 + 1, base + SEG * 2);
    }
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new b.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new b.Float32BufferAttribute(UV, 2)); g.setAttribute('aRoot', new b.Float32BufferAttribute(RT, 3)); g.setIndex(I);
    if (!far) { const roots = []; for (let k = 0; k < RT.length; k += 3) { const key = RT[k] + ',' + RT[k + 1]; if (!roots.some((q) => q.key === key)) roots.push({ key, x: RT[k], z: RT[k + 1] }); } GRS.roots = roots; }
    return g;
  }
  // one blade on its own (its root at the origin), for the edges of things: where a whole tile would reach into something, each of its
  // blades that is clear goes in on its own instead, so the grass grows right up to every wall, path and post with no gap and no blade in it
  function bladeGeo(b) {
    const P = [], N = [], UV = [], RT = [], I = [], h = 0.2, w = 0.0062, lean = 0.3, SEG = 3;
    for (let q = 0; q <= SEG; q++) { const t = q / SEG, ww = q === SEG ? 0 : w * (1 - 0.45 * t), off = lean * t * t * h, y = h * t * (1 - 0.15 * t * t);
      if (q < SEG) { P.push(off - 0, y, -ww, off, y, ww); UV.push(0, t, 1, t); } else { P.push(off, y, 0); UV.push(0.5, 1); }
      for (let e = 0; e < (q < SEG ? 2 : 1); e++) { N.push(0.25, 0.94, 0); RT.push(0, 0, 8.5); } }
    for (let q = 0; q < SEG - 1; q++) { const p = q * 2; I.push(p, p + 1, p + 3, p, p + 3, p + 2); } I.push((SEG - 1) * 2, (SEG - 1) * 2 + 1, SEG * 2);
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new b.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new b.Float32BufferAttribute(UV, 2)); g.setAttribute('aRoot', new b.Float32BufferAttribute(RT, 3)); g.setIndex(I); return g;
  }
  // the detailed tiles to 8 m, the simple ones beyond, gone by 22 m; 5 m cells of 25 cm tiles (400 blades a square metre near); keep-out grid step
  const GR_R0 = 8, GR_R2 = 20, GR_R1 = 36, GR_CELL = 5, GR_TILE = 0.25, GR_MASK = 0.125;
  // wind for everything that moves in it (grass, leaves): one clock and one wind, gusting, stronger in a storm, nearly still in fog
  // MICRO RELIEF: the ground is never perfectly flat: shallow dips (at most 2.8 cm, in three sizes from about 3 m down to 30 cm) drawn into
  // the island's surface on the graphics card, and every grass root follows them exactly. Only ever downward, so nothing standing on the
  // ground (paths, floors, feet) is ever buried, and nothing about where anyone walks changes (drawn only)
  const MICRO_GLSL = `
float rpMh( vec2 p ) { return fract( sin( dot( p, vec2( 269.5, 183.3 ) ) ) * 43758.5453 ); }
float rpMn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( rpMh( i ), rpMh( i + vec2( 1, 0 ) ), f.x ), mix( rpMh( i + vec2( 0, 1 ) ), rpMh( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float rpMicro( vec2 p ) { return -0.028 * ( rpMn( p * 0.33 ) * 0.55 + rpMn( p * 1.1 + 5.3 ) * 0.3 + rpMn( p * 3.3 + 9.1 ) * 0.15 ); }
`;
  const WIND = { t: { value: 0 }, w: { value: null } };
  const WIND_GLSL = `uniform float rpWiT; uniform vec3 rpWiW;
float rpGh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rpGn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rpGh(i), rpGh(i + vec2(1, 0)), f.x), mix(rpGh(i + vec2(0, 1)), rpGh(i + vec2(1, 1)), f.x), f.y); }
float rpGust(vec2 p){ vec2 d = normalize(rpWiW.xy + 1e-5); return rpGn(p * 0.045 - d * rpWiT * 0.9) * 0.7 + rpGn(p * 0.16 - d * rpWiT * 2.3) * 0.3; }
`;
  function grassMat(b) {
    const m = new b.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: b.DoubleSide }); m.name = 'Grass_Blades_Wind';
    GRS.cam = { value: new b.Vector3() }; GRS.rad = { value: GR_R1 }; GRS.sun = { value: new b.Vector3(0.3, 0.8, 0.5) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rpWiT = WIND.t; sh.uniforms.rpWiW = WIND.w; sh.uniforms.rpGC = GRS.cam; sh.uniforms.rpGR = GRS.rad;
      sh.vertexShader = (WIND_GLSL + MICRO_GLSL + 'uniform vec3 rpGC; uniform float rpGR; attribute vec3 aRoot; varying float vRpH; varying float vRpV; varying vec3 vRpW; varying float vRpP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{ vec3 rpRoot = ( modelMatrix * instanceMatrix * vec4( aRoot.x, 0.0, aRoot.y, 1.0 ) ).xyz; float rpH = uv.y; vRpH = rpH; vRpV = rpGh( rpRoot.xz * 41.0 + fract( aRoot.z ) );
  // this blade's own height, lean, turn and place
  float rpQ1 = rpGh( rpRoot.xz * 53.1 + fract( aRoot.z ) * 7.0 ), rpQ2 = rpGh( rpRoot.zx * 37.7 + 3.1 ), rpQ3 = rpGh( rpRoot.xz * 19.3 - 1.7 );
  vec3 rpL = transformed - vec3( aRoot.x, 0.0, aRoot.y ); float rpA = rpQ2 * 6.2832, rpCa = cos( rpA ), rpSa = sin( rpA );
  rpL.xz = mat2( rpCa, rpSa, -rpSa, rpCa ) * rpL.xz * mix( 0.7, 1.6, rpQ3 ); rpL.y *= 0.55 + 0.95 * rpQ1 * rpQ1;
  float rpHk = rpGh( rpRoot.xz * 7.7 ), rpLv = aRoot.z >= 8.0 ? ( rpHk > 0.889 ? 2.0 : rpHk > 0.667 ? 1.0 : 0.0 ) : aRoot.z >= 4.0 ? 2.0 : aRoot.z >= 2.0 ? 1.0 : 0.0, rpDd = distance( rpRoot.xz, rpGC.xz );
  rpL *= rpLv > 1.5 ? 1.0 : rpLv > 0.5 ? 1.0 - smoothstep( ${GR_R2 - 3}.0, ${GR_R2}.0 - 0.05, rpDd ) : 1.0 - smoothstep( ${GR_R0 - 3}.0, ${GR_R0}.0 - 0.05, rpDd );   // (blades thin out in two steps, each before its tile changes: no pop)   // (two blades in three fade out before 8 m, where the tile changes to the one with only the third: no pop)
  transformed = vec3( aRoot.x + ( rpQ3 - 0.5 ) * 0.035, 0.0, aRoot.y + ( rpQ2 - 0.5 ) * 0.035 ) + rpL;
  float rpD = distance( rpRoot.xz, rpGC.xz ), rpR = rpGh( rpRoot.xz * 3.1 );
  transformed *= 1.0 - smoothstep( rpGR - 8.0 + 5.0 * rpR, rpGR, rpD );   // (sinks into the painted grass toward the edge)
  vec2 rpW = rpWiW.xy * rpWiW.z, rpWd = normalize( rpWiW.xy + 1e-5 ); float rpG = rpGust( rpRoot.xz );
  float rpSw = sin( rpWiT * ( 1.6 + 0.6 * rpR ) + dot( rpRoot.xz, rpWd ) * 1.7 + rpR * 6.28 ) * ( 0.28 + 0.4 * rpG ) + sin( rpWiT * 4.3 + rpR * 17.0 + position.x * 40.0 ) * 0.1;
  vec2 rpB = ( rpW * ( 0.25 + 1.25 * rpG ) + rpWd * rpSw * ( 0.25 + 0.75 * rpWiW.z ) ) * rpH * rpH * 0.12;
  vec3 rpDisp = vec3( rpB.x, -0.5 * dot( rpB, rpB ) / max( 0.04, rpH * 0.2 ), rpB.y );
  float rpS2 = max( 1e-6, dot( instanceMatrix[ 0 ].xyz, instanceMatrix[ 0 ].xyz ) );
  transformed += transpose( mat3( instanceMatrix ) ) * rpDisp / rpS2;
  vRpW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz; vRpP = rpGn( rpRoot.xz * 0.045 + 3.7 ) * 0.65 + rpGn( rpRoot.xz * 0.13 + 8.1 ) * 0.35; }
#else
vRpH = uv.y; vRpV = 0.5; vRpW = vec3( 0.0 ); vRpP = 0.5;
#endif`)).replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef USE_INSTANCING\nworldPosition = modelMatrix * instanceMatrix * vec4( aRoot.x, 0.12, aRoot.y, 1.0 ); // (shadows: a blade takes the shade of the ground at its root, so grass lies in the shadows of things but no blade shades itself or its neighbours)\n#endif');
      sh.uniforms.rpGSun = GRS.sun; sh.fragmentShader = 'uniform vec3 rpGSun; varying float vRpH; varying float vRpV; varying vec3 vRpW; varying float vRpP;\n' + sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection; // (both faces of a blade lit as its front: light comes through grass)').replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix( 0.62, 1.08, pow( vRpH, 0.7 ) ) * mix( vec3( 1.0 ), vec3( 1.1, 1.06, 0.8 ), smoothstep( 0.8, 1.0, vRpH ) * 0.45 ) * mix( vec3( 0.84, 0.9, 0.86 ), vec3( 1.16, 1.1, 0.94 ), vRpV ) * ( vRpV > 0.94 ? vec3( 1.25, 1.12, 0.7 ) : vec3( 1.0 ) );   // (every blade its own shade; a few dry ones)
diffuseColor.rgb *= mix( mix( vec3( 0.86, 1.06, 0.84 ), vec3( 1.0 ), smoothstep( 0.25, 0.5, vRpP ) ), vec3( 1.14, 1.06, 0.72 ), smoothstep( 0.55, 0.8, vRpP ) );   // (broad patches: lush, ordinary, drier and yellower)`).replace('#include <opaque_fragment>', `{ vec3 rpV = normalize( vRpW - cameraPosition ); float rpT = pow( max( dot( rpV, normalize( rpGSun ) ), 0.0 ), 4.0 ) * smoothstep( 0.3, 1.0, vRpH ) * max( 0.0, rpGSun.y * 4.0 ) / max( 1.0, rpGSun.y * 4.0 );
  outgoingLight += diffuseColor.rgb * vec3( 1.1, 1.15, 0.7 ) * rpT * 0.55; }   // (looking toward the sun, light shines through the thin tips)
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'rpgrasswind12';
    return m;
  }
  // LEAVES in the wind: every tree crown, bush, palm frond, grass tuft and leaf spray of the park moves (on the graphics card, by where it
  // is): a slow sway that follows the gusts, and a quicker flutter of its own; stronger in a storm. Nothing about their shapes changes
  // for anything that stands on or bumps into them (it is only drawn).
  function leafWind(m, amp, flut, wall, anchored, crowned) {
    if (!m || !m.isMeshStandardMaterial || m.userData.rpWind) return; m.userData.rpWind = 1;
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r);
      if (!sh.vertexShader.includes('#include <begin_vertex>') || sh.vertexShader.includes('rpLeafW')) return;
      sh.uniforms.rpWiT = WIND.t; sh.uniforms.rpWiW = WIND.w;
      sh.vertexShader = WIND_GLSL + (wall ? 'attribute vec4 aWall;\n' : '') + (anchored ? 'attribute vec3 aAnchor;\n' : '') + (crowned ? 'attribute vec4 aCrown;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec4 rpLeafW = modelMatrix * vec4( ${anchored ? 'aAnchor' : 'transformed'}, 1.0 );${crowned ? ' vec3 rpCC = ( modelMatrix * vec4( aCrown.xyz, 1.0 ) ).xyz; if ( aCrown.w > 1.5 ) rpLeafW.xyz = rpCC;' : ''} vec2 rpWd = normalize( rpWiW.xy + 1e-5 ); float rpG = rpGust( rpLeafW.xz );
  // the whole crown moves as one: every motion here changes only over metres (a tree's size), so all of a crown's leaves go together,
  // leaning with the gusts, rocking back, and swelling and settling a little as the wind presses into it (no leaf flutters on its own)
  float rpLo = rpGn( rpLeafW.xz * 0.16 + 7.0 ), rpPh = rpLo * 6.28, rpSw = sin( rpWiT * ( 0.75 + 0.3 * rpLo ) + rpPh ) * 0.5 + sin( rpWiT * 1.9 + rpPh * 1.7 ) * 0.18;
  vec2 rpS = rpWd * ( rpG * 0.75 + 0.35 * rpSw ) * ${amp.toFixed(3)} * rpWiW.z;
  vec2 rpCx = vec2( rpGn( rpLeafW.xz * 0.35 + 3.0 ), rpGn( rpLeafW.zx * 0.35 + 11.0 ) ) - 0.5;   // (where in its crown this part is, roughly: the swell pushes it outward)
  float rpPuff = ( sin( rpWiT * 1.3 + rpPh * 2.0 ) * 0.6 + rpG - 0.5 ) * ${flut.toFixed(3)} * rpWiW.z;
  vec3 rpF = vec3( rpCx.x, 0.35 * ( rpLo - 0.5 ), rpCx.y ) * rpPuff * 2.0;
  vec3 rpWdisp = vec3( rpS.x, 0.0, rpS.y ) + rpF;${crowned ? `
  if ( aCrown.w > 1.5 ) rpWdisp = vec3( rpS.x, 0.0, rpS.y ) + ( ( modelMatrix * vec4( transformed, 1.0 ) ).xyz - rpCC ) * rpPuff * 0.6;   // (one crown, one motion: the whole crown and every leaf on it sway together and swell about its centre)` : ''}${wall ? `
  if ( aWall.w < 0.99 ) { float rpIn = -dot( rpWdisp, aWall.xyz ), rpOk = max( 0.0, aWall.w - 0.006 ); if ( rpIn > rpOk ) rpWdisp += aWall.xyz * ( rpIn - rpOk ); }   // (never closer to the wall it lies on than the wall allows)` : ''}
  transformed += ( vec4( rpWdisp, 0.0 ) * modelMatrix ).xyz / max( 1e-6, dot( modelMatrix[ 0 ].xyz, modelMatrix[ 0 ].xyz ) ); }`);
    };
    m.customProgramCacheKey = () => (key ? key() : '') + '|rpleafw3' + amp + ',' + flut + (wall ? 'w' : '') + (anchored ? 'a' : '') + (crowned ? 'c' : '');
    m.needsUpdate = true;
  }
  // NO PLANTS INDOORS: inside the booth Spondo wakes up in there is no grass or foliage (its footprint, a little inside its walls): no wind
  // grass tile goes there, and any park grass tuft or foliage triangle standing inside it is folded away to nothing
  const NOPLANT = { names: ['Booth_BalloonPop_SpondoWakes'], boxes: null };
  function noPlantBoxes(root) {
    if (NOPLANT.boxes) return NOPLANT.boxes; NOPLANT.boxes = [];
    for (const nm of NOPLANT.names) { const g = root.getObjectByName(nm); if (!g) continue; g.updateWorldMatrix(true, true); const bx = new TH.Box3();
      g.traverse((o) => { if (o.isMesh && !o.userData.rpHi && o.geometry && o.geometry.attributes.position && !/Grass_Blades|Foliage|Leaf/.test([].concat(o.material).map((m) => m && m.name).join())) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
      if (!bx.isEmpty()) { bx.expandByVector(new TH.Vector3(-0.05, 0, -0.05)); NOPLANT.boxes.push(bx); } }
    return NOPLANT.boxes;
  }
  const inNoPlant = (x, z) => { const B = NOPLANT.boxes; if (!B) return false; for (const bx of B) if (x > bx.min.x && x < bx.max.x && z > bx.min.z && z < bx.max.z) return true; return false; };
  function noPlantClear(root) {
    const B = noPlantBoxes(root); if (!B.length) return; const v = new TH.Vector3();
    root.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.userData.rpGrass || o.userData.rpNoPlant) return; const ms = [].concat(o.material); if (!ms.some((m) => m && /^(Grass_Blades|Foliage)$/.test(m.name || ''))) return;
      const g = o.geometry, pa = g && g.attributes.position; if (!pa) return; if (!g.boundingBox) g.computeBoundingBox(); o.updateWorldMatrix(true, false); const wb = g.boundingBox.clone().applyMatrix4(o.matrixWorld); if (!B.some((bx) => bx.intersectsBox(wb))) return;
      o.userData.rpNoPlant = 1; const ix = g.index ? g.index.array : null, nt = ix ? ix.length / 3 : pa.count / 3; let hit = 0;
      for (let t = 0; t < nt; t++) { const a = ix ? ix[t * 3] : t * 3, b2 = ix ? ix[t * 3 + 1] : t * 3 + 1, c = ix ? ix[t * 3 + 2] : t * 3 + 2;
        v.set((pa.getX(a) + pa.getX(b2) + pa.getX(c)) / 3, (pa.getY(a) + pa.getY(b2) + pa.getY(c)) / 3, (pa.getZ(a) + pa.getZ(b2) + pa.getZ(c)) / 3).applyMatrix4(o.matrixWorld);
        if (!inNoPlant(v.x, v.z) || v.y > B[0].max.y) continue; pa.setXYZ(b2, pa.getX(a), pa.getY(a), pa.getZ(a)); pa.setXYZ(c, pa.getX(a), pa.getY(a), pa.getZ(a)); hit++; }   // (a triangle folded onto one corner: nothing drawn)
      if (hit) { pa.needsUpdate = true; } });
  }
  // the long vine nearest the spot Spondo wakes up on is taken away (its stem, in every level of detail, and the leaves along it)
  const NOVINE = { at: [27.15, 1.0, 13.65], done: false, removed: 0 };
  function noVineNear(root) {
    if (NOVINE.done) return; NOVINE.done = true; const A = new TH.Vector3(...NOVINE.at), v = new TH.Vector3(), gone = [];
    const stems = [], leaves = []; root.traverse((o) => { if (!o.isMesh) return; const n = [].concat(o.material).map((m) => m && m.name).join(); if (/Vine_Stem/.test(n)) stems.push(o); else if (/Vine_Leaf/.test(n)) leaves.push(o); });
    const fold = (g, ix, t) => { const pa = g.attributes.position, a = ix ? ix[t * 3] : t * 3; for (const k of [1, 2]) { const q = ix ? ix[t * 3 + k] : t * 3 + k; pa.setXYZ(q, pa.getX(a), pa.getY(a), pa.getZ(a)); } };
    for (const o of stems) { const g = o.geometry, pa = g.attributes.position; o.updateWorldMatrix(true, false); if (!g.boundingBox) g.computeBoundingBox(); if (g.boundingBox.clone().applyMatrix4(o.matrixWorld).distanceToPoint(A) > 6) continue;
      // the stem's separate pieces (welded by position), each with its nearest point to the spot and its length
      const key = (k) => Math.round(pa.getX(k) * 1e3) + ',' + Math.round(pa.getY(k) * 1e3) + ',' + Math.round(pa.getZ(k) * 1e3), id = new Map(), par = [];
      const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }, uni = (a, b2) => { a = find(a); b2 = find(b2); if (a !== b2) par[a] = b2; };
      const vid = new Int32Array(pa.count); for (let k = 0; k < pa.count; k++) { const s2 = key(k); let q = id.get(s2); if (q === undefined) { q = par.length; par.push(q); id.set(s2, q); } vid[k] = q; }
      const ix = g.index ? g.index.array : null, nt = ix ? ix.length / 3 : pa.count / 3, T3 = (t, k) => (ix ? ix[t * 3 + k] : t * 3 + k);
      for (let t = 0; t < nt; t++) { uni(vid[T3(t, 0)], vid[T3(t, 1)]); uni(vid[T3(t, 0)], vid[T3(t, 2)]); }
      const comp = new Map(); for (let k = 0; k < pa.count; k++) { const c = find(vid[k]); v.set(pa.getX(k), pa.getY(k), pa.getZ(k)).applyMatrix4(o.matrixWorld); let e = comp.get(c); if (!e) comp.set(c, e = { d: 1e9, lo: v.clone(), hi: v.clone(), pts: [] }); e.d = Math.min(e.d, v.distanceTo(A)); e.lo.min(v); e.hi.max(v); if ((k & 7) === 0) e.pts.push(v.clone()); }
      let best = null, bc = -1; for (const [c, e] of comp) { if (e.hi.clone().sub(e.lo).length() < 0.9) continue; if (!best || e.d < best.d) { best = e; bc = c; } }
      if (!best || best.d > 4) continue;
      for (let t = 0; t < nt; t++) if (find(vid[T3(t, 0)]) === bc) fold(g, ix, t); pa.needsUpdate = true; gone.push(...best.pts); NOVINE.removed++; }
    if (!gone.length) return;
    for (const o of leaves) { const g = o.geometry, pa = g.attributes.position; o.updateWorldMatrix(true, false); const ix = g.index ? g.index.array : null, nt = ix ? ix.length / 3 : pa.count / 3; let hit = 0;
      for (let t = 0; t < nt; t++) { const a = ix ? ix[t * 3] : t * 3; v.set(pa.getX(a), pa.getY(a), pa.getZ(a)).applyMatrix4(o.matrixWorld); if (v.distanceTo(A) > 8) continue; let near = false; for (const p of gone) if (p.distanceToSquared(v) < 0.09) { near = true; break; } if (near) { fold(g, ix, t); hit++; } }
      if (hit) pa.needsUpdate = true; }
  }
  // PLANTS ONLY ON THE GROUND: a park grass tuft or a small plant (under 1.2 m across) whose foot is more than 25 cm above the island's
  // ground and that stands on some model (a short look down from its foot meets something that is not a plant or a trunk) is folded away
  const OFFGROUND = { done: false, removed: 0 };
  function offGroundClear(root) {
    if (OFFGROUND.done || !GRS.T) return; OFFGROUND.done = true; const v = new TH.Vector3(), pq = { y: 0, c: [0, 0, 0] }, rc = new TH.Raycaster(), dn = new TH.Vector3(0, -1, 0), hits = [];
    const sol = vineSolids(root).filter((q) => !/Bark|Trunk|Palm/i.test(q.ms.map((m) => m.name).join()));
    root.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.userData.rpGrass || /^Jungle_/.test(o.name || '')) return; const ms = [].concat(o.material); if (!ms.some((m) => m && /^(Grass_Blades|Foliage)$/.test(m.name || ''))) return;
      const g = o.geometry, pa = g && g.attributes.position; if (!pa || !g.index) return; o.updateWorldMatrix(true, false); const ix = g.index.array, nt = ix.length / 3, par = new Int32Array(pa.count); for (let k = 0; k < pa.count; k++) par[k] = k;
      const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
      for (let t = 0; t < nt; t++) { const a = find(ix[t * 3]); for (const k of [1, 2]) { const b2 = find(ix[t * 3 + k]); if (a !== b2) par[b2] = a; } }
      const C = new Map(); for (let k = 0; k < pa.count; k++) { const c = find(k); v.set(pa.getX(k), pa.getY(k), pa.getZ(k)).applyMatrix4(o.matrixWorld); let e = C.get(c); if (!e) C.set(c, (e = { lo: v.clone(), hi: v.clone(), foot: v.clone() })); e.lo.min(v); e.hi.max(v); if (v.y < e.foot.y) e.foot.copy(v); }
      const kill = new Set(); for (const [c, e] of C) { const ext = Math.max(e.hi.x - e.lo.x, e.hi.z - e.lo.z); if (ext > 1.2) continue; const fx = (e.lo.x + e.hi.x) / 2, fz = (e.lo.z + e.hi.z) / 2; if (!terrAt(fx, fz, pq, true) || e.lo.y - pq.y < 0.25) continue;
        let on = false; for (const q of sol) { if (fx < q.b.min.x || fx > q.b.max.x || fz < q.b.min.z || fz > q.b.max.z || q.o === o) continue; rc.set(v.set(fx, e.lo.y + 0.15, fz), dn); rc.far = 0.8; hits.length = 0; try { TH.Mesh.prototype.raycast.call(q.o, rc, hits); } catch (er) { /* skip */ } if (hits.length) { on = true; break; } }
        if (on) kill.add(c); }
      if (!kill.size) return; let hit = 0; for (let t = 0; t < nt; t++) if (kill.has(find(ix[t * 3]))) { const a = ix[t * 3]; for (const k of [1, 2]) { const q = ix[t * 3 + k]; pa.setXYZ(q, pa.getX(a), pa.getY(a), pa.getZ(a)); } hit++; }
      if (hit) { pa.needsUpdate = true; OFFGROUND.removed += kill.size; } });
  }
  function leafScan(scene) {
    try { offGroundClear(scene); } catch (e) { console.warn('offground', e); }
    try { noPlantClear(scene); } catch (e) { console.warn('noplant', e); }
    try { noVineNear(scene); } catch (e) { console.warn('novine', e); }

    scene.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.userData.rpGrass) return; if ([].concat(o.material).every((m) => m && m.name === 'Grass_Blades') && !/Leaf/.test(o.name || '')) { o.receiveShadow = false; o.castShadow = false; } for (const m of [].concat(o.material)) { if (!m || !m.name) continue;
      if (m.name === 'Foliage' || m.name === 'Grass_Blades_Leaf' || LEAFY.has(m.name)) leafWind(m, 0.36, 0.2, false, false, true); else if (m.name === 'Grass_Blades') leafWind(m, 0.08, 0.05); else if (m.name === 'Vine_Leaf') leafWind(m, 0.05, 0.01, true); else if (m.name === 'Vine_Stem') leafWind(m, 0.04, 0.006, true); } });
  }
  function grassCands(root) {   // what in the park can stand on the ground and so keep grass out from under it (with its box in the world)
    const out = [], bx = new TH.Box3(), SKIP = /Grass_Blades|Foliage|Vine_|Dead_Leaves|Cloud|Leaves|Leaf/;
    root.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.userData.rpGrass || o === GRS.M || /Ground_|@view|Leaf_Sprays|Jungle_Leaves/.test(o.name || '')) return; for (let q = o; q; q = q.parent) if (q.visible === false) return; const ms = [].concat(o.material);   // (the plain and the detailed shape alike: a board or step drawn only up close keeps grass out too)
      if (!ms.length || ms.every((m) => !m || SKIP.test(m.name || '') || m.isShaderMaterial || m.colorWrite === false)) return; const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
      if (!g.boundingBox) g.computeBoundingBox(); o.updateWorldMatrix(true, false); bx.copy(g.boundingBox).applyMatrix4(o.matrixWorld); if (!isFinite(bx.min.x) || bx.max.x - bx.min.x > 800 || bx.max.z - bx.min.z > 800) return;
      const ix = g.index ? g.index.count : g.attributes.position.count; out.push({ o, b: bx.clone(), big: ix > 9000 }); });
    return out;
  }
  function grassCell(b, key, cx, cz) {   // one 5 m cell of lawn (cx, cz its corner): a 25 cm tile on every square of grassy ground with nothing on it
    let s = (Math.imul(cx * 73856093 ^ cz * 19349663, 1) >>> 0) % 2147483646 + 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const x0 = cx * GR_CELL, z0 = cz * GR_CELL, n = Math.round(GR_CELL / GR_TILE), pt = { y: 0, c: [0, 0, 0] }, pa = { y: 0, c: [0, 0, 0] }, pb = { y: 0, c: [0, 0, 0] };
    let lo = 1e9, hi = -1e9; const pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * GR_TILE, z = z0 + (j + 0.5) * GR_TILE, rot = Math.floor(r() * 4) * Math.PI / 2, hs = 0.8 + 0.45 * r(), tv = r();
      if (!terrAt(x, z, pt) || inNoPlant(x, z)) continue; const c = pt.c, g = c[1] / Math.max(c[0], c[2], 1e-4); if (g < 0.96 || c[1] < 0.012) continue;   // (all grassy ground, olive lawns too: not sand, rock, mud or the sea bed)
      terrAt(x + 0.12, z, pa); terrAt(x, z + 0.12, pb); const sl = Math.hypot(pa.y - pt.y, pb.y - pt.y) / 0.12;   // (on a slope the tile sinks a little, so no corner of it floats)
      pts.push([x, pt.y - 0.012 - sl * 0.18, z, hs, rot, c[0], c[1], c[2], tv]); lo = Math.min(lo, pt.y); hi = Math.max(hi, pt.y); }
    if (!pts.length) return null;
    // the keep-out: a downward look every 25 cm over anything that stands in this cell, then every 6.25 cm wherever an edge of something
    // runs; a tile goes in whole where nothing is within 9 cm of it, and where something is, each of its blades that has 9 cm clear goes in
    // on its own: the grass grows right up to every wall, path, post and step, and no blade reaches into one
    const cs = GRS.cand.filter((q) => q.b.max.x > x0 - 0.5 && q.b.min.x < x0 + GR_CELL + 0.5 && q.b.max.z > z0 - 0.5 && q.b.min.z < z0 + GR_CELL + 0.5 && q.b.min.y < hi + 2.5 && q.b.max.y > lo - 0.3);
    if (performance.now() - GRS.t0 < 45000 && cs.some((q) => q.big && !q.o.userData.rpHi && !q.o.geometry.boundsTree)) return undefined;
    for (const q of cs) if (q.big && !q.o.geometry.boundsTree && q.o.geometry.computeBoundsTree) { try { q.o.geometry.computeBoundsTree(); } catch (e) { /* plain rays */ } }   // (a detailed mesh gets its ray tree here, once)
    const rc = new TH.Raycaster(), dn = new TH.Vector3(0, -1, 0), og = new TH.Vector3(), hits = [], pq = { y: 0, c: [0, 0, 0] }; rc.firstHitOnly = true;
    const blockedAt = (x, z) => { if (!terrAt(x, z, pq)) return false; for (const q of cs) { if (x < q.b.min.x || x > q.b.max.x || z < q.b.min.z || z > q.b.max.z) continue;
      rc.set(og.set(x, pq.y + 2.5, z), dn); rc.far = 2.62; hits.length = 0; try { b.Mesh.prototype.raycast.call(q.o, rc, hits); } catch (e) { /* skip */ } for (const h of hits) if (h.point.y > pq.y - 0.08) return true; } return false; };
    const C = 0.25, F = 0.0625, PAD = 2, NC = Math.round(GR_CELL / C) + 2 * PAD, NF = NC * 4, cb = new Uint8Array(NC * NC), fb = new Uint8Array(NF * NF), cx0 = x0 - PAD * C, cz0 = z0 - PAD * C;
    if (cs.length) {
      for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) cb[i + j * NC] = blockedAt(cx0 + (i + 0.5) * C, cz0 + (j + 0.5) * C) ? 1 : 0;
      for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) { const v0 = cb[i + j * NC]; let edge = false;
        for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < NC && jj < NC && cb[ii + jj * NC] !== v0) { edge = true; break; } }
        for (let fj = 0; fj < 4; fj++) for (let fi = 0; fi < 4; fi++) { const I2 = i * 4 + fi, J2 = j * 4 + fj; fb[I2 + J2 * NF] = edge ? (blockedAt(cx0 + (I2 + 0.5) * F, cz0 + (J2 + 0.5) * F) ? 1 : 0) : v0; } } }
    const RCL = 0.09, near = (x, z) => { if (!cs.length) return false; const fi = Math.floor((x - cx0) / F), fj = Math.floor((z - cz0) / F), rr = Math.ceil(RCL / F);
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) { const ii = fi + di, jj = fj + dj; if (ii < 0 || jj < 0 || ii >= NF || jj >= NF || !fb[ii + jj * NF]) continue;
        const ex = Math.max(0, Math.abs(cx0 + (ii + 0.5) * F - x) - F / 2), ez = Math.max(0, Math.abs(cz0 + (jj + 0.5) * F - z) - F / 2); if (ex * ex + ez * ez < RCL * RCL) return true; } return false; };
    const keep = [], singles = [], half = GR_TILE / 2 + RCL;
    for (const p of pts) {
      let clear = true; if (cs.length) { const i0 = Math.floor((p[0] - half - cx0) / F), i1 = Math.floor((p[0] + half - cx0) / F), j0 = Math.floor((p[2] - half - cz0) / F), j1 = Math.floor((p[2] + half - cz0) / F);
        for (let jj = Math.max(0, j0); jj <= Math.min(NF - 1, j1) && clear; jj++) for (let ii = Math.max(0, i0); ii <= Math.min(NF - 1, i1); ii++) if (fb[ii + jj * NF]) { clear = false; break; } }
      if (clear) { keep.push(p); continue; }
      const ca = Math.cos(p[4]), sa = Math.sin(p[4]);
      for (const bl of GRS.roots) { const x = p[0] + bl.x * ca + bl.z * sa, z = p[2] - bl.x * sa + bl.z * ca; if (!near(x, z)) singles.push([x, p[1], z, p[3], r() * 6.283, p[5], p[6], p[7], p[8]]); } }
    if (!keep.length && !singles.length) return null;
    const M4 = new b.Matrix4(), Q = new b.Quaternion(), V = new b.Vector3(), Sv = new b.Vector3(), col = new b.Color(), Y = new b.Vector3(0, 1, 0);
    const fill = (mm, list) => { list.forEach((p, i) => { Q.setFromAxisAngle(Y, p[4]); M4.compose(V.set(p[0], p[1], p[2]), Q, Sv.set(1, p[3], 1)); mm.setMatrixAt(i, M4);
      const v = (0.9 + 0.2 * p[8]) * 1.55, gq = Math.max(p[6] * v, 0.07), k2 = gq / Math.max(1e-4, p[6] * v); col.setRGB(Math.min(1, p[5] * v * k2), Math.min(1, gq), Math.min(1, p[7] * v * 0.92 * k2)); mm.setColorAt(i, col); });   /* (a little lighter than the ground: blades catch the light) */
      mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; mm.computeBoundingSphere(); mm.boundingSphere.radius += 0.5; mm.castShadow = false; mm.receiveShadow = true; mm.userData.rpHi = 1; mm.userData.rpGrass = 1; mm.raycast = noRay; mm.layers.set(4); };
    const m = new b.InstancedMesh(GRS.geo, GRS.mat, Math.max(1, keep.length)); if (keep.length) fill(m, keep); else { m.count = 0; m.userData.rpHi = 1; m.userData.rpGrass = 1; m.raycast = noRay; m.layers.set(4); }
    if (singles.length) { const sm = new b.InstancedMesh(GRS.blade, GRS.mat, singles.length); fill(sm, singles); sm.name = 'Grass_Wind_Edge_' + key; m.add(sm); }
    m.name = 'Grass_Wind_' + key; m.castShadow = false; m.receiveShadow = true;   /* (grass lies in the shadows of trees, booths and people, but no blade casts one) */ m.userData.rpHi = 1; m.userData.rpGrass = 1; m.raycast = noRay; m.layers.set(4);   // (its own layer: drawn in the main view only, not again in every mirror and preview)
    return m;
  }
  // VINES off the walls: some of the park's vines were laid partly inside the wall or post they climb (their stems, or the leaves either
  // side of a stem lying along a wall). Once the park's ray trees exist, every vine vertex is tested against the solid things around it
  // (six rays, both faces counted): a point that finds the inside face of one thing every way it looks is inside it, and is moved out the
  // shortest way onto the wall's surface (4 mm off it: lying on it, not in it and not floating). Every vine vertex also records the wall nearest it (its outward direction and how far, aWall), so the wind
  // can sway it but never push it closer to that wall than it is. A few milliseconds a frame until done.
  const VF = { jobs: null, i: 0, v: 0, done: false };
  function vineSolids(root) {
    const out = [], bx = new TH.Box3(), SKIP = /Grass_Blades|Foliage|Vine_|Dead_Leaves|Cloud|Leaves|Leaf|Glass|Water|Ocean|Rope|Chain|Wire/;
    root.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.rpGrass || o.userData.rpHi) return; const ms = [].concat(o.material);
      if (!ms.length || ms.some((m) => !m || SKIP.test(m.name || '') || m.isShaderMaterial || m.transparent || m.colorWrite === false)) return; const g = o.geometry; if (!g || !g.attributes || !g.attributes.position) return;
      if (!g.boundingBox) g.computeBoundingBox(); o.updateWorldMatrix(true, false); bx.copy(g.boundingBox).applyMatrix4(o.matrixWorld); if (!isFinite(bx.min.x) || bx.max.x - bx.min.x > 400 || bx.max.z - bx.min.z > 400) return;
      out.push({ o, b: bx.clone(), ms }); });
    return out;
  }
  function vineStep(root, budget) {
    if (VF.done || OFF) return; const b = TH; const t0 = performance.now();
    if (!VF.jobs) { VF.jobs = []; root.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m && /^Vine_(Leaf|Stem)$/.test(m.name || ''))) VF.jobs.push(o); });
      VF.sol = vineSolids(root); VF.rc = new b.Raycaster(); VF.dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new b.Vector3(...d)); VF.tmp = new b.Vector3(); VF.n = new b.Vector3(); VF.inv = new b.Matrix4(); VF.moved = 0; VF.pts = 0; }
    const rc = VF.rc, hits = [], P = VF.tmp, n3 = VF.n, raw = b.Mesh.prototype.raycast;
    while (VF.i < VF.jobs.length) {
      const o = VF.jobs[VF.i], g = o.geometry, pa = g.attributes.position;
      if (VF.v === 0) { o.updateWorldMatrix(true, false); if (!g.attributes.aWall) { const aw = new Float32Array(pa.count * 4); for (let k = 0; k < pa.count; k++) aw[k * 4 + 3] = 1; g.setAttribute('aWall', new b.BufferAttribute(aw, 4)); } VF.inv.copy(o.matrixWorld).invert(); VF.cs = null; }
      if (!VF.cs) { const ob = new b.Box3(); if (!g.boundingBox) g.computeBoundingBox(); ob.copy(g.boundingBox).applyMatrix4(o.matrixWorld).expandByScalar(0.35);
        VF.cs = VF.sol.filter((q) => q.o !== o && q.b.intersectsBox(ob)); if (performance.now() - GRS.t0 < 45000 && VF.cs.some((q) => !q.o.geometry.boundsTree)) { VF.cs = null; return; } }   // (waits for the park's ray trees, made in the background)
      const aw = g.attributes.aWall; let changed = false;
      for (; VF.v < pa.count; VF.v++) {
        if ((VF.v & 15) === 0 && performance.now() - t0 > budget) { if (changed) { pa.needsUpdate = true; aw.needsUpdate = true; } return; }
        P.set(pa.getX(VF.v), pa.getY(VF.v), pa.getZ(VF.v)).applyMatrix4(o.matrixWorld); VF.pts++;
        let push = null, wall = null;
        for (const q of VF.cs) { if (P.x < q.b.min.x - 0.3 || P.x > q.b.max.x + 0.3 || P.y < q.b.min.y - 0.3 || P.y > q.b.max.y + 0.3 || P.z < q.b.min.z - 0.3 || P.z > q.b.max.z + 0.3) continue;
          const sides = q.ms.map((m) => m.side); for (const m of q.ms) m.side = b.DoubleSide; let nHit = 0, nBack = 0, best = null;
          try { for (const d of VF.dirs) { rc.set(P, d); rc.far = 0.6; hits.length = 0; raw.call(q.o, rc, hits); if (!hits.length) continue; let h = hits[0]; for (const x of hits) if (x.distance < h.distance) h = x; nHit++;
              if (!h.face) continue; n3.copy(h.face.normal).transformDirection(q.o.matrixWorld); const back = n3.dot(d) > 0; if (back) { nBack++; if (!best || h.distance < best.dist) best = { d, dist: h.distance }; }
              else if (h.distance < 0.3 && (!wall || h.distance < wall.dist)) wall = { n: n3.clone(), dist: h.distance }; } }
          finally { q.ms.forEach((m, k) => { m.side = sides[k]; }); }
          if (nHit >= 4 && nBack === nHit && best && (!push || best.dist < push.dist)) push = best; }
        if (push) { P.addScaledVector(push.d, push.dist + 0.004); const L = P.clone().applyMatrix4(VF.inv); pa.setXYZ(VF.v, L.x, L.y, L.z); changed = true; VF.moved++; wall = { n: push.d.clone(), dist: 0.004 }; }
        if (wall) { aw.setXYZW(VF.v, wall.n.x, wall.n.y, wall.n.z, wall.dist); changed = true; }
      }
      if (changed) { pa.needsUpdate = true; aw.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox(); if (g.boundsTree && g.computeBoundsTree) { try { g.computeBoundsTree(); } catch (e) { /* keep */ } } }
      VF.i++; VF.v = 0; VF.cs = null;
    }
    VF.done = true; VF.sol = null; ST.vines = { meshes: VF.jobs.length, points: VF.pts, moved: VF.moved };
  }
  function grassUpdate(R, scene, cam) {
    if (OFF || !GRS.M || !GR.on || (window.__rp && window.__rp.park && window.__rp.park.root && !window.__rp.park.root.visible) || (window.__SBX && window.__SBX.active)) return; const b = TH; if (!b) return;
    if (!GRS.on) { GRS.on = true; GRS.t0 = performance.now(); let rt = GRS.M; while (rt.parent && rt.parent !== scene) rt = rt.parent; GRS.root = rt; WIND.w.value = WIND.w.value || new b.Vector3(0.8, 0.6, 0.7); GRS.T = terrGrid(GRS.M); GRS.geo = grassGeo(b, false); GRS.geoFar = grassGeo(b, true); GRS.geoFar2 = grassGeo(b, true, true); GRS.blade = bladeGeo(b); GRS.mat = grassMat(b); if (window.__rp && window.__rp.camera) window.__rp.camera.layers.enable(4); GRS.group = new b.Group(); GRS.group.name = 'RP_Wind_Grass'; GRS.group.userData.rpHi = 1; GRS.group.userData.rpGrass = 1; scene.add(GRS.group); }
    // (the grass is shown or hidden here only for an export freeze: this runs before every draw of the scene, the contact-shadow pass's too,
    // and turning the grass back on there put it into that pass, which blotched and flickered it black)
    if (LOD.frozen) { if (GRS.group.visible) { GRS.group.visible = false; GRS.frozeHid = true; } return; } if (GRS.frozeHid) { GRS.group.visible = true; GRS.frozeHid = false; }
    const now0 = performance.now(); if (!GRS.ct || now0 - GRS.ct > 6000) { GRS.ct = now0; let nm = 0; GRS.root.traverse((o) => { if (o.isMesh && !o.userData.rpHi) nm++; });
      if (nm !== GRS.nm) { GRS.nm = nm; GRS.cand = grassCands(GRS.root); leafScan(GRS.root); } }
    if (!VF.done && (now0 - GRS.t0 > 4000)) { try { vineStep(GRS.root, window.__rpRendering ? 30 : 3); } catch (err) { VF.done = true; console.warn('vines', err); } }   // (the park's own meshes only: a character, prop or effect in the studio never makes the grass start again)
    const e = cam.matrixWorld.elements, px = e[12], pz = e[14]; GRS.cam.value.set(px, e[13], pz);
    const q = 1, R1 = GR_R1 * q, R0 = GR_R0 * q; GRS.rad.value = R1;   // (q: the page's own quality setting, lowered on a slow computer; a render always gets all of it)
    const c0x = Math.floor((px - R1) / GR_CELL), c1x = Math.floor((px + R1) / GR_CELL), c0z = Math.floor((pz - R1) / GR_CELL), c1z = Math.floor((pz + R1) / GR_CELL), want = [], tnow = performance.now();
    const lodOf = (c, d) => { if (c.m) { const g = d < R0 ? GRS.geo : d < GR_R2 ? GRS.geoFar : GRS.geoFar2; if (c.m.geometry !== g) c.m.geometry = g; } };   // (near: every blade; farther: the simple tile)
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) { const dx = Math.max(cx * GR_CELL - px, 0, px - (cx + 1) * GR_CELL), dz = Math.max(cz * GR_CELL - pz, 0, pz - (cz + 1) * GR_CELL), d = Math.hypot(dx, dz); if (d > R1) continue;
      const k = cx + ',' + cz, c = GRS.cells.get(k); if (c) { c.t = tnow; lodOf(c, d); } else want.push([d, cx, cz, k]); }
    want.sort((p, q) => p[0] - q[0]); const budget = window.__rpRendering || LOD.burst ? 45 : 4;   // (a few milliseconds a frame: the view never stalls, and a video render's frames are not held up for long)
    for (const [d, cx, cz, k] of want) { if (performance.now() - tnow > budget) break; const m = grassCell(b, k, cx, cz); if (m === undefined) continue; const c = { m, t: tnow }; GRS.cells.set(k, c); if (m) { lodOf(c, d); GRS.group.add(m); } }
    if (GRS.cells.size > 380) { const old = [...GRS.cells.entries()].sort((p, q) => p[1].t - q[1].t); for (let i = 0; i < old.length - 330; i++) { const [k, c] = old[i]; if (c.m) { GRS.group.remove(c.m); for (const k of c.m.children) if (k.dispose) k.dispose(); c.m.dispose(); } GRS.cells.delete(k); } }
    for (const c of GRS.cells.values()) if (c.m) c.m.visible = c.t === tnow;   // (only the cells about the camera this frame)
  }
  // SKY: the park's own sky (three's physical sky model) is kept, made a truer blue by day, and has painted into it: a real sun (a disc
  // with a darker rim and a glow that widens as it nears the horizon, reddening there), a real moon (a lit sphere showing its phase by
  // the sun's direction, with grey seas, a faint earthshine on its dark side and a halo), and clouds: a layer 1.2 km up of drifting,
  // domain-warped noise in several sizes, lit from the sun's side and shadowed on the other, with bright edges toward the sun, warm at
  // sunrise and sunset, grey and thick in a storm, pale in fog, dim and blue by moonlight; how much of the sky they cover drifts slowly.
  // The 3D cloud models and the 3D moon ball are no longer shown.
  const SKYU = { t: WIND.t, cov: { value: 0.5 }, storm: { value: 0 }, fogw: { value: 0 }, day: { value: 1 }, night: { value: 0 }, sunCol: { value: null }, amb: { value: null }, wind: { value: null }, moon: { value: null }, moonOn: { value: 0 }, sunOn: { value: 1 } };
  const SKY_GLSL = `
uniform float rpT, rpCov, rpStorm, rpFogW, rpDay, rpNight, rpMoonOn, rpSunOn; uniform vec3 rpSunCol, rpAmb, rpWind, rpMoon;
float rpSh( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float rpSn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f ); return mix( mix( rpSh( i ), rpSh( i + vec2( 1, 0 ) ), u.x ), mix( rpSh( i + vec2( 0, 1 ) ), rpSh( i + vec2( 1, 1 ) ), u.x ), u.y ); }
float rpFbm( vec2 p ) { float a = 0.5, s = 0.0; mat2 m = mat2( 1.6, 1.2, -1.2, 1.6 ); for ( int i = 0; i < 5; i ++ ) { s += a * rpSn( p ); p = m * p + 3.7; a *= 0.5; } return s; }
float rpCloud( vec2 p, float t ) { vec2 q = vec2( rpFbm( p + vec2( 0.0, t * 0.011 ) ), rpFbm( p + vec2( 5.2, 1.3 ) - t * 0.008 ) ); return rpFbm( p * 1.15 + 1.7 * q + t * 0.004 ); }
`;
  const SKY_MAIN = `
{ vec3 rd = direction; float up = rd.y; vec3 sd0 = normalize( vSunDirection );
  // by day the zenith is a deep clear blue fading to a paler, whiter blue at the horizon
  float dk = rpDay * ( 1.0 - 0.85 * max( rpStorm, rpFogW ) );
  { float lum = dot( retColor, vec3( 0.2126, 0.7152, 0.0722 ) ), sunNear = pow( max( dot( rd, sd0 ), 0.0 ), 6.0 );
    vec3 blue = mix( vec3( 0.56, 0.74, 0.98 ), vec3( 0.1, 0.3, 0.84 ), pow( smoothstep( 0.0, 0.9, up ), 0.55 ) ) * lum * mix( 1.15, 0.9, smoothstep( 0.0, 0.5, up ) );
    retColor = mix( retColor, blue, dk * ( 0.9 - 0.6 * sunNear ) * smoothstep( -0.02, 0.06, up ) ); }
  // the sun: a disc 0.53 degrees across with a darker, redder rim, and a glow about it (wider and redder near the horizon)
  { float cs = dot( rd, sd0 ), ang = acos( clamp( cs, -1.0, 1.0 ) ), R = 0.0046, low = 1.0 - smoothstep( 0.0, 0.25, sd0.y );
    float disc = 1.0 - smoothstep( R * 0.9, R * 1.04, ang ), mu = sqrt( max( 0.0, 1.0 - pow( min( ang / R, 1.0 ), 2.0 ) ) );
    vec3 sc = mix( vec3( 1.0, 0.97, 0.9 ), vec3( 1.0, 0.55, 0.25 ), low ) * ( 0.4 + 0.6 * pow( mu, 0.5 ) );
    float glow = exp( -ang / ( 0.02 + 0.03 * low ) ) * 0.22 + exp( -ang / 0.005 ) * 0.45;
    float vis = rpSunOn * smoothstep( -0.03, 0.01, up ) * ( 1.0 - 0.8 * max( rpStorm, rpFogW ) );
    retColor += ( sc * disc * 6.0 + rpSunCol * glow * ( 1.0 - 0.6 * dk * 0.0 ) ) * vis; }
  // the moon: a lit sphere 0.52 degrees across, as it really is: its phase from where the sun is, grey seas, earthshine
  { vec3 md = normalize( rpMoon ); float cm = dot( rd, md ), ang = acos( clamp( cm, -1.0, 1.0 ) ), R = 0.0046;
    if ( rpMoonOn > 0.0 && ang < R * 8.0 ) {
      vec3 ax = normalize( cross( md, abs( md.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) ), ay = cross( ax, md );
      vec2 dq = vec2( dot( rd, ax ), dot( rd, ay ) ) / R; float rr = dot( dq, dq );
      float vis = rpMoonOn * smoothstep( -0.02, 0.02, up ) * ( 1.0 - 0.85 * max( rpStorm, rpFogW ) );
      if ( rr < 1.0 ) { vec3 nrm = normalize( dq.x * ax + dq.y * ay - sqrt( 1.0 - rr ) * md );
        float lit = max( dot( nrm, sd0 ), 0.0 ), seas = smoothstep( 0.42, 0.62, rpFbm( dq * 2.2 + 3.0 ) ) * 0.35 + rpSn( dq * 9.0 ) * 0.08;
        vec3 mc = vec3( 0.93, 0.92, 0.88 ) * ( 1.0 - seas ) * ( lit * 1.6 + 0.025 );
        float edge = 1.0 - smoothstep( 0.92, 1.0, rr );
        retColor = mix( retColor, retColor * ( 1.0 - 0.8 * rpNight ) + mc * ( 0.35 + 0.65 * rpNight ), edge * vis ); }
      retColor += vec3( 0.55, 0.62, 0.8 ) * exp( -max( sqrt( rr ) - 1.0, 0.0 ) * 1.4 ) * 0.025 * rpNight * vis * ( rr < 1.0 ? 0.0 : 1.0 ); } }
  if ( up > -0.02 ) {
    float u2 = max( up, 0.0 ), t = rpT;
    vec2 p = rd.xz / ( u2 + 0.085 ) * 1.45 + rpWind.xy * t * 0.006;
    float cov = clamp( rpCov + 0.12 * ( rpSn( vec2( t * 0.0021, 7.0 ) ) - 0.5 ), 0.0, 1.0 );
    vec2 qw = vec2( rpFbm( p + vec2( 0.0, t * 0.011 ) ), rpFbm( p + vec2( 5.2, 1.3 ) - t * 0.008 ) );   // (the drifting warp, shared by the looks below)
    float n = rpFbm( p * 1.15 + 1.7 * qw + t * 0.004 ), n2 = rpFbm( p * 2.7 + 11.0 + t * 0.006 );
    n = n * 0.82 + n2 * 0.18;
    float th = mix( 0.7, 0.3, cov );
    float dens = smoothstep( th, th + 0.17 + 0.08 * rpStorm, n );
    vec3 sd = normalize( sd0 + vec3( 0.0, 0.0001, 0.0 ) ); vec2 toS = sd.xz / ( length( sd.xz ) + 1e-4 );
    float nS = rpFbm( ( p + toS * 0.09 ) * 1.15 + 1.7 * qw + t * 0.004 ) * 0.82 + n2 * 0.18, dS = smoothstep( th, th + 0.25, nS );
    float lit = exp( -dS * 2.4 ) * ( 0.55 + 0.45 * ( 1.0 - dens ) );
    float cosT = dot( rd, sd ), silver = pow( max( cosT, 0.0 ), 10.0 ) * ( 1.0 - dens ) * 1.6;
    vec3 sunL = rpSunCol * ( 1.0 - 0.75 * rpStorm ), ambL = rpAmb;
    vec3 cCol = ambL * ( 0.85 + 0.25 * ( 1.0 - dens ) ) + sunL * ( 0.45 + lit * 1.05 + silver );
    cCol += vec3( 0.6, 0.66, 0.8 ) * 0.03 * rpNight * rpMoonOn * ( 0.5 + 0.5 * pow( max( dot( rd, normalize( rpMoon ) ), 0.0 ), 8.0 ) );   // (moonlit edges at night)
    cCol = mix( cCol, vec3( dot( cCol, vec3( 0.3, 0.5, 0.2 ) ) ) * vec3( 0.86, 0.9, 0.96 ) * ( 1.0 - 0.45 * dens ), rpStorm * 0.85 );   // (a storm: heavy grey, dark beneath)
    cCol = mix( cCol, vec3( dot( cCol, vec3( 0.33 ) ) ), rpFogW * 0.6 );
    float fade = smoothstep( -0.02, 0.1, up ) * ( 1.0 - 0.55 * ( 1.0 - smoothstep( 0.0, 0.25, up ) ) );   // (thin toward the horizon, where the haze takes over)
    retColor = mix( retColor, cCol, dens * fade * ( 0.9 + 0.1 * rpStorm ) );
  }
}
gl_FragColor = vec4( retColor, 1.0 );`;
  function skyPatch(mat) {
    if (!mat || !mat.isShaderMaterial || mat.userData.rpSky) return; mat.userData.rpSky = 1;
    const k = 'gl_FragColor = vec4( retColor, 1.0 );'; if (!mat.fragmentShader.includes(k)) return;
    Object.assign(mat.uniforms, { rpT: SKYU.t, rpCov: SKYU.cov, rpStorm: SKYU.storm, rpFogW: SKYU.fogw, rpDay: SKYU.day, rpNight: SKYU.night, rpSunCol: SKYU.sunCol, rpAmb: SKYU.amb, rpWind: SKYU.wind, rpMoon: SKYU.moon, rpMoonOn: SKYU.moonOn, rpSunOn: SKYU.sunOn });
    mat.fragmentShader = SKY_GLSL + mat.fragmentShader.replace(k, SKY_MAIN); mat.needsUpdate = true;
  }
  const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
  let ATM = null;
  // once a frame (before the scene is drawn): the clock, the wind, and the sky's light for this time of day and weather
  function atmosFrame() {
    if (!ATM) return; const o = ATM, s = o.state(), L = s.L || {}, F = s.F; if (!F) return;
    const wt = window.__rpWT; WIND.t.value = wt ? wt.value : performance.now() / 1000;
    const storm = L.weather === 'storm' ? 1 : 0, fogw = L.weather === 'fog' ? 1 : Math.max(0, Math.min(1, ((+L.fog || 0) - 0.35) * 1.5));
    const wa = 0.65 + 0.12 * Math.sin(WIND.t.value * 0.013), ws = (storm ? 2.1 : L.weather === 'fog' ? 0.22 : 0.75) * (0.85 + 0.25 * Math.sin(WIND.t.value * 0.05) * Math.sin(WIND.t.value * 0.017 + 1));
    WIND.w.value.set(Math.cos(wa), Math.sin(wa), ws); SKYU.wind.value.set(Math.cos(wa), Math.sin(wa), 0);
    SKYU.storm.value = storm; SKYU.fogw.value = fogw; SKYU.day.value = F.day; SKYU.night.value = F.night;
    SKYU.cov.value = storm ? 0.84 : L.weather === 'fog' ? 0.78 : 0.5 + 0.2 * fogw;
    const sc = F.sunCol, sunK = 0.95 * F.day + 0.03, sk = F.fog;
    SKYU.sunCol.value.set(sc[0] * sunK, sc[1] * sunK, sc[2] * sunK);
    const amb = lerp3([0.035, 0.045, 0.075], lerp3(sk, [sk[0] * 0.78, sk[1] * 0.85, sk[2] * 0.98], 0.5), F.day);
    SKYU.amb.value.set(amb[0] * 0.95, amb[1] * 0.95, amb[2] * 0.95);
    if (F.moonDir) SKYU.moon.value.set(F.moonDir[0], F.moonDir[1], F.moonDir[2]); SKYU.moonOn.value = F.moonAltDeg > -3 ? 1 : 0; SKYU.sunOn.value = F.sunAltDeg > -2 ? 1 : 0;
    const n = storm ? 1 : L.weather === 'fog' ? 0.55 : 0, m = Math.min(0.97, n * 0.92 + (+L.fog || 0) * 0.5), f = F.night * 0.94;
    if (o.over) o.over.opacity = Math.max(m * 0.38, f * 0.86);
    if (o.stars && o.stars.material) o.stars.material.opacity = F.night * (1 - m) * (1 - 0.6 * SKYU.cov.value);
    if (o.moon) o.moon.visible = false;   // (the moon is in the sky now)
    if (GRS.sun && o.sky.material.uniforms.sunPosition) GRS.sun.value.copy(o.sky.material.uniforms.sunPosition.value).normalize();
    const tu = o.sky.material.uniforms; if (tu && tu.turbidity) { tu.turbidity.value = 2.1 + 6 * (1 - F.day) + 7 * n; tu.rayleigh.value = 1.6 + 1.8 * (1 - Math.min(1, Math.max(0, F.sunAltDeg / 25))) * F.day; tu.mieCoefficient.value = 0.0035 + 0.02 * n; }
  }
  function atmos(b, o) {
    if (OFF) return; TH = TH || b; ATM = o;
    SKYU.sunCol.value = new b.Vector3(1, 1, 1); SKYU.amb.value = new b.Vector3(0.5, 0.6, 0.8); SKYU.wind.value = new b.Vector3(0.8, 0.6, 0); SKYU.moon.value = new b.Vector3(0, 1, 0); WIND.w.value = new b.Vector3(0.8, 0.6, 0.75);
    skyPatch(o.sky.material); if (o.env) skyPatch(o.env.material);
    o.sky.onBeforeRender = () => { try { atmosFrame(); } catch (e) { if (!SKYU.err) { SKYU.err = String(e); console.warn('sky', e); } } };
  }
  // the page's own scene and camera, as soon as they exist: the levels are chosen at the start of every draw of the scene
  function hook() { const R = window.__rp; if (!R || !R.scene || !R.camera) { setTimeout(hook, 150); return; } LOD.cams.add(R.camera); const prev = R.scene.onBeforeRender; R.scene.onBeforeRender = function (rd, sc, cam, rt) { if (prev) prev.call(this, rd, sc, cam, rt); try { update(rd, sc, cam, rt); } catch (err) { if (!LOD.err) { LOD.err = String(err); console.warn('levels of detail', err); } } }; }
  // An export takes one level of everything, under the park's own mesh names: while it runs, each plain mesh carries its detailed twin's
  // geometry (so the file holds the detailed park, as it always has) and the twin is out of sight. Nothing is hidden that the cast
  // stand on. The jungle goes out in its far form; a prize plush as its sculpted toy.
  function freeze(on) {
    if (on === !!LOD.frozen) return; LOD.frozen = on ? performance.now() : 0;
    for (const e of ENT) {
      if (e.mk) { if (e.hi) for (const m of e.hi) { m.visible = !on; show(m, false); } for (const m of e.lo) show(m, true); e.near = false; e.cull = false; if (e.on && e.was) { e.was = false; e.on(false); } }
      else if (!e.hi) { for (const m of e.lo) show(m, true); e.cull = false; }
      else if (e.pair) { const lo = e.lo[0], hi = e.hi[0]; if (on) { e.g0 = lo.geometry; lo.geometry = hi.geometry; hi.visible = false; show(lo, true); show(hi, false); e.near = false; e.cull = false; } else if (e.g0) { lo.geometry = e.g0; e.g0 = null; hi.visible = lo.visible; } }
      else if (on) { e.vis = e.lo.map((m) => m.visible); for (const m of e.lo) m.visible = false; for (const m of e.hi) show(m, true); e.near = true; e.cull = false; }
      else if (e.vis) { e.lo.forEach((m, k) => { m.visible = e.vis[k]; }); e.vis = null; }
    }
    for (const m of LOD.aux) m.visible = !on;   // (the island's drawn copy: the file gets the island's own mesh)
    if (GR.dirty) GR.far();
  }
  // objects taken out of the park for good (the park's own arcade, replaced by the remodelled one): forget their meshes
  function prune(root) { for (let i = ENT.length - 1; i >= 0; i--) { let o = ENT[i].ref; if (!o.isObject3D) continue; while (o && o !== root) o = o.parent; if (!o) ENT.splice(i, 1); } }
  LOD.update = update; LOD.freeze = freeze; LOD.prune = prune; LOD.set = addSet;

  // ---------------------------------------------------------------- the island's ground
  // The island is one mesh on a 9 m grid: right from far off, flat-faceted when a camera is down among the trees. Outside the park
  // (never inside it, nor on a road or path) the ground near a camera is drawn in 109 m tiles of 1.1 m mesh that carry real relief:
  // hummocks and hollows from a couple of metres to a dozen across, up to 65 cm high. The island's own mesh stays exactly as it is for everything that is
  // not drawing, and is what is drawn everywhere else (a second mesh on the same points, `@view`, whose triangle list leaves out the
  // tiles being drawn in detail). The jungle is planted on the relief (`ground`).
  const GR = { o1: null, zones: null, on: false, dirty: false, far: null };
  const sst = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const RMAX = 0.66, relief0 = (x, z) => 0.34 * vn(x / 14, 0.37, z / 14, 9151) + 0.22 * vn(x / 4.5 + 31.7, 1.91, z / 4.5 + 7.3, 4099) + 0.1 * vn(x / 2.3 + 3.1, 5.3, z / 2.3 + 44.4, 733);
  // how much of the relief there is at (x, z): none in the park or within 2 m of its edge, none on a road or path (zl: the park's own
  // list of circles and rectangles it keeps clear of trees), all of it from 26 m out
  function gweight(x, z, zl) {
    const o = GR.o1(x, z); if (o <= 2) return 0; let w = sst((o - 2) / 24);
    for (let i = 0; i < zl.length; i++) { const s = zl[i]; let d; if (s.r !== undefined) d = Math.hypot(x - s.x, z - s.z) - s.r; else { const dx = Math.max(s.x0 - x, x - s.x1), dz = Math.max(s.z0 - z, z - s.z1); d = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz); }
      if (d < 5) { if (d <= 0.5) return 0; w *= sst((d - 0.5) / 4.5); } }
    return w;
  }
  // ---------------------------------------------------------------- grass texture
  // Grass is never one flat colour: the island's ground (mode 0) and every blade (mode 1) take a painted, tiling grass texture, laid by
  // where things are in the world (no UVs needed). GT.blades: 512 px of overlapping blade strokes (fine detail, 2.7 m a tile, mip-mapped
  // so it melts into the ground's own colour far off instead of sparkling); GT.patch: 128 px of soft light and dark patches (clumps a few
  // metres across and fields tens of metres across). Both hold multipliers around 1, so the ground keeps the colours the park gave it.
  // Sand, rock and the park's own floor take the same grain far more faintly. Nothing here in simple mode (?rpgeo=0).
  const GT = { blades: null, patch: null, scale: null, done: new WeakSet() };
  function grassMaps(b) {
    if (GT.blades) return; let sd = 90210; const rnd = () => { sd = (sd + 0x6D2B79F5) | 0; let t = Math.imul(sd ^ (sd >>> 15), 1 | sd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const wrap = (N, x, y, r, fn) => { for (const ox of [0, x < r ? N : x > N - r ? -N : null]) { if (ox === null) continue; for (const oy of [0, y < r ? N : y > N - r ? -N : null]) { if (oy === null) continue; fn(x + ox, y + oy); } } };
    const mk = (N) => { const cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'); c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, N, N); return [cv, c]; };
    const [cb, c] = mk(512);
    for (let i = 0; i < 260; i++) { const x = rnd() * 512, y = rnd() * 512, r = 14 + rnd() * 44, lt = rnd() < 0.5; wrap(512, x, y, r, (px, py) => { const g = c.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, lt ? 'rgba(176,182,140,0.2)' : 'rgba(70,84,74,0.22)'); g.addColorStop(1, lt ? 'rgba(176,182,140,0)' : 'rgba(70,84,74,0)'); c.fillStyle = g; c.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
    c.lineCap = 'round';
    for (let i = 0; i < 15000; i++) { const x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI * 2, L = 5 + rnd() * 13, bend = (rnd() - 0.5) * 0.9, k = rnd(), l = 62 + rnd() * 140;
      const col = k < 0.1 ? [l * 1.2, l * 1.1, l * 0.66] : k < 0.24 ? [l * 0.8, l * 0.98, l * 0.86] : [l * 0.96, l * 1.06, l * 0.84];   // (a few dry yellow blades, a few deep cool ones, mostly fresh)
      c.strokeStyle = 'rgba(' + col.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(',') + ',' + (0.55 + rnd() * 0.4).toFixed(2) + ')'; c.lineWidth = 0.9 + rnd() * 1.3;
      wrap(512, x, y, L + 2, (px, py) => { const mx = px + Math.cos(a + bend) * L * 0.5, my = py + Math.sin(a + bend) * L * 0.5; c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(mx, my, px + Math.cos(a) * L, py + Math.sin(a) * L); c.stroke(); }); }
    const [cp, p] = mk(128);
    for (let i = 0; i < 150; i++) { const x = rnd() * 128, y = rnd() * 128, r = 7 + rnd() * 26, k = rnd(), col = k < 0.45 ? '188,186,128' : k < 0.9 ? '74,92,84' : '150,128,84'; wrap(128, x, y, r, (px, py) => { const g = p.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(' + col + ',0.42)'); g.addColorStop(1, 'rgba(' + col + ',0)'); p.fillStyle = g; p.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
    const mean = (cv, cx) => { const d = cx.getImageData(0, 0, cv.width, cv.height).data, m = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; } return m.map((v) => 255 / Math.max(1, v / (d.length / 4))); };
    const tex = (cv) => { const t = new b.CanvasTexture(cv); t.wrapS = t.wrapT = b.RepeatWrapping; t.anisotropy = 8; t.colorSpace = b.NoColorSpace; return t; };
    GT.scale = [new b.Vector3(...mean(cb, c)), new b.Vector3(...mean(cp, p))]; GT.blades = tex(cb); GT.blades.name = 'Grass_Detail_Tex'; GT.patch = tex(cp); GT.patch.name = 'Grass_Patch_Tex';
  }
  // the leaf sprays' own material: the grass blades' (same look) under its own name, so the wind can move them exactly as it moves the
  // crowns they grow on, while the grass tufts on the ground keep their own gentle sway
  let LEAFM = null; const LEAFY = new Set();   // (LEAFY: the materials of every leafy crown that carries sprays: they move with the same wind)
  // the crowns' material once leaves are baked in: the same foliage, both faces drawn (a leaflet is seen from either side), moved by the wind as one per crown
  const CROWNM = new Map();
  function crownMat(b, m) { if (!m || Array.isArray(m)) return m; let c = CROWNM.get(m); if (!c) { c = m.clone(); c.name = m.name; c.side = b.DoubleSide; leafWind(c, 0.36, 0.2, false, false, true); CROWNM.set(m, c); } return c; }
  function leafMat(b, blade) { if (!blade) return blade; if (!LEAFM) { LEAFM = blade.clone(); LEAFM.name = 'Grass_Blades_Leaf'; grassTex(b, LEAFM, 1); leafWind(LEAFM, 0.36, 0.2, false, true, true); /* (moved by the wind from the start: the sprays are made later, up close, after the first look round for plants) */ } return LEAFM; }
  function grassTex(b, m, mode) {
    if (OFF || !m || !m.isMeshStandardMaterial || GT.done.has(m) || typeof document === 'undefined') return; GT.done.add(m); grassMaps(b);
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <color_fragment>')) return;
      sh.uniforms.rpGT = { value: GT.blades }; sh.uniforms.rpGP = { value: GT.patch }; sh.uniforms.rpGS = { value: GT.scale[0] }; sh.uniforms.rpGQ = { value: GT.scale[1] };
      sh.vertexShader = 'varying vec3 rpW;\n' + sh.vertexShader.replace('#include <project_vertex>', 'rpW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
      // (v92: no drawn micro relief any more: the ground is exactly as built, as everything standing on it expects)
      sh.fragmentShader = 'varying vec3 rpW;\nuniform sampler2D rpGT, rpGP;\nuniform vec3 rpGS, rpGQ;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + (mode === 0 ? `{
  float rpG = smoothstep( 1.02, 1.3, diffuseColor.g / max( max( diffuseColor.r, diffuseColor.b ), 0.001 ) ), rpK = mix( 0.3, 1.0, rpG );
  vec3 rpD = texture2D( rpGT, rpW.xz * 0.37 ).rgb * rpGS, rpE = texture2D( rpGT, vec2( rpW.x * 0.8 - rpW.z * 0.6, rpW.x * 0.6 + rpW.z * 0.8 ) * 0.113 + 0.31 ).rgb * rpGS;
  vec3 rpP = texture2D( rpGP, rpW.zx * 0.052 ).rgb * rpGQ, rpF = texture2D( rpGP, vec2( rpW.x * 0.6 + rpW.z * 0.8, rpW.z * 0.6 - rpW.x * 0.8 ) * 0.0113 + 0.57 ).rgb * rpGQ;
  diffuseColor.rgb *= mix( vec3( 1.0 ), rpD, 0.9 * rpK ) * mix( vec3( 1.0 ), rpE, 0.85 * rpK ) * mix( vec3( 1.0 ), rpP, rpK ) * mix( vec3( 1.0 ), rpF, 0.9 * rpK );
}` : `{
  vec3 rpD = texture2D( rpGT, vec2( dot( rpW.xz, vec2( 2.3, 1.7 ) ), rpW.y * 0.55 + dot( rpW.xz, vec2( -0.5, 0.7 ) ) ) ).rgb * rpGS, rpP = texture2D( rpGP, rpW.zx * 0.21 + rpW.y * 0.13 ).rgb * rpGQ;
  diffuseColor.rgb *= mix( vec3( 1.0 ), rpD, 0.7 ) * mix( vec3( 1.0 ), rpP, 0.5 );
}`));
    };
    m.customProgramCacheKey = function () { return (prevKey ? prevKey() : '') + '|rpGrass3' + mode; };
    m.needsUpdate = true;
  }
  // how far the detailed ground stands above the island's own mesh at (x, z)
  function ground(x, z) { if (!GR.on) return 0; const w = gweight(x, z, GR.zones); return w > 0 ? w * relief0(x, z) : 0; }
  // G: the terrain's group, M: the island's mesh, o1: the park's own "how far outside the park" function, zones: its kept-clear list
  function terrain(b, G, M, o1, zones) {
    if (OFF) return; TH = b; grassTex(b, M.material, 0); GRS.M = M;
    const g = M.geometry, pa = g.attributes.position, ix = g.index && g.index.array; if (!ix || pa.count !== 221 * 221) return;   // (not the grid this was written for: leave the island as it is)
    GR.o1 = o1; GR.zones = zones.slice(); GR.on = true;
    const x0 = pa.getX(0), z0 = pa.getZ(0), S = (pa.getX(220) - x0) / 220, TN = 12, NT = Math.ceil(220 / TN), lists = new Map();
    for (let t = 0; t < ix.length; t += 3) { const a = ix[t], c1 = ix[t + 1], c2 = ix[t + 2], tx = Math.min(NT - 1, Math.max(0, Math.floor(((pa.getX(a) + pa.getX(c1) + pa.getX(c2)) / 3 - x0) / S / TN))), tz = Math.min(NT - 1, Math.max(0, Math.floor(((pa.getZ(a) + pa.getZ(c1) + pa.getZ(c2)) / 3 - z0) / S / TN))), k = tx + NT * tz; let l = lists.get(k); if (!l) lists.set(k, (l = [])); l.push(a, c1, c2); }
    const dg = new b.BufferGeometry(); for (const k of ['position', 'normal', 'color']) if (g.attributes[k]) dg.setAttribute(k, g.attributes[k]);
    const dix = new Uint32Array(ix.length); dg.setIndex(new b.BufferAttribute(dix, 1)); g.computeBoundingBox(); g.computeBoundingSphere(); dg.boundingBox = g.boundingBox.clone(); dg.boundingSphere = g.boundingSphere.clone();
    const V = new b.Mesh(dg, M.material); V.name = M.name + '@view'; V.castShadow = M.castShadow; V.receiveShadow = M.receiveShadow; V.userData.rpHi = 1; V.raycast = hiRay; TWIN.set(V, M); G.add(V); M.layers.mask = HID; LOD.aux.push(V);
    const tiles = [], v = new b.Vector3();
    GR.far = () => { let n = 0; for (const tl of tiles) if (!tl.near) { dix.set(tl.idx, n); n += tl.idx.length; } dg.setDrawRange(0, n); dg.index.needsUpdate = true; GR.dirty = false; };
    for (const [k, l] of lists) { const tl = { idx: Uint32Array.from(l), near: false }; tiles.push(tl);
      const box = new b.Box3(); let any = false; for (let i = 0; i < l.length; i++) { const q = l[i], x = pa.getX(q), y = pa.getY(q), z = pa.getZ(q); box.expandByPoint(v.set(x, y, z)); if (!any && y > -5.2 && o1(x, z) > 2) any = true; }
      if (!any) continue;   // (all park floor, or all sea bed: nothing to add)
      box.max.y += RMAX; const tx = k % NT, tz = (k - tx) / NT, bx = [x0 + tx * TN * S, z0 + tz * TN * S, x0 + (tx + 1) * TN * S, z0 + (tz + 1) * TN * S];
      reg({ lo: [], hi: null, ref: { geometry: { boundingBox: box }, matrixWorld: M.matrixWorld }, dev: RMAX, tol: 5, feat: 0, on: (near) => { tl.near = near; GR.dirty = true; }, mk: () => tileHi(b, G, M, tl.idx, M.name + '_Ground_' + tx + '_' + tz + '@hi', bx) }); }
    GR.far();
  }
  // one tile of detailed ground: every triangle of the island's mesh in it divided 8 x 8, lifted by the relief, shaded and tinted by it
  // (crests a little lighter, hollows darker); a curtain hangs from the tile's border down to the island's own surface, so there is
  // never a gap beside a neighbour that is being drawn plain. bx: the tile's border [x0, z0, x1, z1]
  function tileHi(b, G, M, idx, name, bx) {
    const g = M.geometry, pa = g.attributes.position.array, na = g.attributes.normal.array, cat = g.attributes.color, K = 8, e = 0.4, P = [], N = [], C = [], I = [];
    const zl = GR.zones.filter((s) => (s.r !== undefined ? s.x + s.r + 5.5 > bx[0] && s.x - s.r - 5.5 < bx[2] && s.z + s.r + 5.5 > bx[1] && s.z - s.r - 5.5 < bx[3] : s.x1 + 5.5 > bx[0] && s.x0 - 5.5 < bx[2] && s.z1 + 5.5 > bx[1] && s.z0 - 5.5 < bx[3]));
    const onB = (x, z, x2, z2) => (Math.abs(x - x2) < 1e-3 && (Math.abs(x - bx[0]) < 1e-3 || Math.abs(x - bx[2]) < 1e-3)) || (Math.abs(z - z2) < 1e-3 && (Math.abs(z - bx[1]) < 1e-3 || Math.abs(z - bx[3]) < 1e-3));
    for (let t = 0; t < idx.length; t += 3) { const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2], A = ia * 3, B = ib * 3, Cc = ic * 3, base = P.length / 3, row = (i) => base + i * (K + 1) - i * (i - 1) / 2;
      for (let i = 0; i <= K; i++) for (let j = 0; j <= K - i; j++) { const u = i / K, w2 = j / K, w = 1 - u - w2, x = w * pa[A] + u * pa[B] + w2 * pa[Cc], yb = w * pa[A + 1] + u * pa[B + 1] + w2 * pa[Cc + 1], z = w * pa[A + 2] + u * pa[B + 2] + w2 * pa[Cc + 2];
        let nx = w * na[A] + u * na[B] + w2 * na[Cc], ny = w * na[A + 1] + u * na[B + 1] + w2 * na[Cc + 1], nz = w * na[A + 2] + u * na[B + 2] + w2 * na[Cc + 2], r = 0, tint = 1; const wg = gweight(x, z, zl);
        if (wg > 0) { const r0 = relief0(x, z); r = wg * r0; tint = 1 + wg * 0.34 * (r0 / RMAX - 0.5); if (ny > 0.05) { nx = nx / ny - wg * (relief0(x + e, z) - r0) / e; nz = nz / ny - wg * (relief0(x, z + e) - r0) / e; ny = 1; } }
        const il = 1 / (Math.hypot(nx, ny, nz) || 1); P.push(x, yb + r, z); N.push(nx * il, ny * il, nz * il);
        if (cat) C.push(Math.min(1, (w * cat.getX(ia) + u * cat.getX(ib) + w2 * cat.getX(ic)) * tint), Math.min(1, (w * cat.getY(ia) + u * cat.getY(ib) + w2 * cat.getY(ic)) * tint), Math.min(1, (w * cat.getZ(ia) + u * cat.getZ(ib) + w2 * cat.getZ(ic)) * tint)); }
      for (let i = 0; i < K; i++) for (let j = 0; j < K - i; j++) { const p = row(i) + j, q = row(i + 1) + j; I.push(p, q, p + 1); if (j < K - i - 1) I.push(q, q + 1, p + 1); }
      for (const [p0, p1, at] of [[A, B, (m) => row(m)], [A, Cc, (m) => base + m], [B, Cc, (m) => row(K - m) + m]]) { if (!onB(pa[p0], pa[p0 + 2], pa[p1], pa[p1 + 2])) continue; const s0 = P.length / 3;
        for (let m = 0; m <= K; m++) { const q = at(m) * 3, f = m / K; P.push(P[q], (1 - f) * pa[p0 + 1] + f * pa[p1 + 1] - 0.03, P[q + 2]); N.push(N[q], N[q + 1], N[q + 2]); if (cat) C.push(C[q], C[q + 1], C[q + 2]); }
        for (let m = 0; m < K; m++) { const a = at(m), c = at(m + 1), d = s0 + m, f = s0 + m + 1; I.push(a, c, f, a, f, d, a, f, c, a, d, f); } } }
    const geo = new b.BufferGeometry(); geo.setAttribute('position', new b.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new b.Float32BufferAttribute(N, 3)); if (cat) geo.setAttribute('color', new b.Float32BufferAttribute(C, 3)); geo.setIndex(I);
    const h = new b.Mesh(geo, M.material); h.name = name; h.castShadow = false; h.receiveShadow = M.receiveShadow; h.userData.rpHi = 1; h.raycast = noRay; G.add(h); h.updateWorldMatrix(false, false); cnt('ground', idx.length / 3, I.length / 3); return [h];
  }

  // ---------------------------------------------------------------- bottles
  // The bottle-toss bottles were plain tapered cans. A bottle: a straight body, a rounded shoulder, a neck and a lip, turned on the same
  // axis to the same height and base (rt, rb, h, seg: what the park asked for)
  function bottle(b, rt, rb, h, seg) {
    const lo = new b.CylinderGeometry(rt, rb, h, seg, 1, false); if (OFF) return lo;
    const y0 = -h / 2, R = [[rb * 0.86, 0], [rb, 0.035], [rb, 0.5], [rb * 0.97, 0.56], [rb * 0.84, 0.62], [rb * 0.62, 0.675], [rt * 1.06, 0.725], [rt, 0.76], [rt, 0.925], [rt * 1.28, 0.94], [rt * 1.28, 0.985], [rt * 1.02, 1]];
    const prof = R.map(([r, t], i) => { const p = R[Math.max(0, i - 1)], q = R[Math.min(R.length - 1, i + 1)], dr = q[0] - p[0], dy = (q[1] - p[1]) * h, l = Math.hypot(dr, dy) || 1; return [r, y0 + t * h, dy / l, -dr / l]; });
    const g = lathe(b, prof, 16, true, true); cnt('bottle', 4 * seg, g.index.count / 3); return link(g, lo, 0.4 * rb);
  }

  // ---------------------------------------------------------------- balloons
  // A balloon was an oval. Detailed, it is a balloon: a pear of a body (fullest above the middle) drawn down to a neck, a rolled lip and
  // the knot's nub under it, with a little slack so no two are quite alike. The park squashes its oval with the object's scale (sc);
  // the balloon is built at its true size and then divided by that scale, so the lip and knot stay round while the body keeps the park's
  // width and height (its depth is fuller than the park's flat oval, but no deeper than `deep`: the ones on the dart board sit against it).
  // A popped one (scrap) was a small flat oval: a torn shred of latex with a ragged edge and a curl, inside the same box.
  let BN = 0; const BM = new Map();
  function bmat(m) {   // the balloon's own material: the park's colour, as soft dull latex
    if (OFF || !m || !m.isMaterial) return m; let x = BM.get(m);
    if (!x) { x = m.clone(); x.name = 'Rubber_Balloon_' + String(m.name || 'x').replace(/^Paint_/, ''); x.roughness = 0.36; x.metalness = 0; BM.set(m, x); }
    return x;
  }
  function unscale(b, P, I, sc) {   // a shape made at its true size, handed over divided by the scale the park will apply to it (normals to match)
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { p.setXYZ(i, p.getX(i) / sc[0], p.getY(i) / sc[1], p.getZ(i) / sc[2]); const x = n.getX(i) * sc[0], y = n.getY(i) * sc[1], z = n.getZ(i) * sc[2], l = Math.hypot(x, y, z) || 1; n.setXYZ(i, x / l, y / l, z / l); }
    return g;
  }
  function balloon(b, r, seg, sc, deep) {
    const hs0 = Math.max(4, Math.round(seg * 0.7)), lo = new b.SphereGeometry(r, seg, hs0); if (OFF) return lo;
    const id = BN++, W = r * sc[0], H = r * sc[1], D = Math.min(W, deep || W), nk = Math.max(0.011, 0.075 * W), n = 22, P = [], I = [], rings = [];
    const lean = 0.05 * (vn(id * 3.7, 1.3, 0.5, 811) - 0.5), slack = 0.5 + vn(id * 1.9, 4.1, 2.2, 97);   // (each a little different)
    // the body: 15 rings from the crown to where it draws in to the neck; rho is the outline, fullest above the middle
    for (let k = 0; k <= 14; k++) { const u = k / 14 * (Math.PI - 0.16), c = Math.cos(u), rho = Math.sin(u) * (1 + 0.2 * c), y = H * c, t = k / 14, f = t * t * t;
      rings.push([Math.max(W * rho, k === 0 ? 0 : nk), Math.max(D * rho, k === 0 ? 0 : nk) * (1 - f) + Math.max(W * rho, nk) * f, y, lean * W * (1 - c)]); }
    // the neck, the rolled lip and the knot under it (round, whatever the body's depth)
    const y0 = rings[14][2], off = rings[14][3];
    for (const [q, dy] of [[1, 0.9], [1.05, 1.7], [1.75, 2.1], [2.0, 2.65], [1.7, 3.2], [1.0, 3.5], [0.85, 4.3], [0.001, 4.9]]) rings.push([nk * q, nk * q, y0 - nk * dy, off]);
    P.push(0, H * 1.0, 0);
    for (let k = 1; k < rings.length; k++) { const [rx, rz, y, ox] = rings[k]; for (let j = 0; j < n; j++) { const t = j / n * Math.PI * 2, w = 1 + 0.035 * slack * Math.sin(3 * t + id) * Math.sin(Math.min(1, k / 14) * Math.PI); P.push(ox + rx * w * Math.sin(t), y, rz * w * Math.cos(t)); } }
    for (let j = 0; j < n; j++) I.push(0, 1 + j, 1 + (j + 1) % n);
    for (let k = 0; k + 2 < rings.length; k++) for (let j = 0; j < n; j++) { const p0 = 1 + k * n + j, p1 = 1 + k * n + (j + 1) % n, q0 = p0 + n, q1 = p1 + n; I.push(p0, q0, q1, p0, q1, p1); }
    const g = unscale(b, P, I, sc); cnt('balloon', 2 * seg * (hs0 - 1), I.length / 3); return link(g, lo, 0.35 * r * Math.max(sc[0], sc[1], sc[2]));
  }
  function scrap(b, r, seg, sc) {
    const hs0 = Math.max(4, Math.round(seg * 0.7)), lo = new b.SphereGeometry(r, seg, hs0); if (OFF) return lo;
    const id = BN++, e = [r * sc[0], r * sc[1], r * sc[2]], t = e[0] <= e[1] && e[0] <= e[2] ? 0 : e[1] <= e[2] ? 1 : 2, u = (t + 1) % 3, v = (t + 2) % 3, na = 12, nr = 3, P = [], I = [];
    // a patch in the plane of the box's two long sides: a torn outline (each spoke its own length), cupped and curled within the thin side
    const out = []; for (let a = 0; a < na; a++) out.push(0.55 + 0.45 * vn(a * 0.9 + id * 5.3, id * 0.7, 3.3, 421));
    const put = (s) => { const q = [0, 0, 0]; q[t] = s * 0.0012 + e[t] * 0.3 * (vn(id, 0.2, 0.4, 5) - 0.5); P.push(q[0], q[1], q[2]);
      for (let k = 1; k <= nr; k++) for (let a = 0; a < na; a++) { const an = a / na * Math.PI * 2, rr = k / nr * out[a], p = [0, 0, 0]; p[u] = e[u] * rr * Math.cos(an); p[v] = e[v] * rr * Math.sin(an);
        p[t] = s * 0.0012 + e[t] * (0.3 * (vn(id, 0.2, 0.4, 5) - 0.5) + 0.85 * rr * rr * (vn(a * 0.55 + id * 2.1, k * 0.8, id * 0.3, 77) - 0.5) * 1.6); P.push(p[0], p[1], p[2]); } };
    put(1); put(-1); const m = 1 + na * nr;
    for (const [o, f] of [[0, 0], [m, 1]]) { for (let a = 0; a < na; a++) { const x = o + 1 + a, y = o + 1 + (a + 1) % na; if (f) I.push(o, y, x); else I.push(o, x, y); }
      for (let k = 0; k + 1 < nr; k++) for (let a = 0; a < na; a++) { const p0 = o + 1 + k * na + a, p1 = o + 1 + k * na + (a + 1) % na, q0 = p0 + na, q1 = p1 + na; if (f) I.push(p0, q1, q0, p0, p1, q1); else I.push(p0, q0, q1, p0, q1, p1); } }
    const g = unscale(b, P, I, sc); cnt('scrap', 2 * seg * (hs0 - 1), I.length / 3); return link(g, lo, 0.6 * r * Math.max(sc[0], sc[1], sc[2]));
  }

  // A beach ball was a squashed sphere. Detailed, it is a ball that has lost some air: it sits flat where it rests, its six gores show as
  // shallow seams, and one shoulder has sunk in. Built at its true size and divided by the park's scale, like the balloons.
  function ball(b, r, seg, sc) {
    const hs0 = Math.max(4, Math.round(seg * 0.7)), lo = new b.SphereGeometry(r, seg, hs0); if (OFF) return lo;
    const W = r * sc[0], H = r * sc[1], D = r * sc[2], n = 36, m = 22, P = [], I = [];
    const at = (v, t) => { const sv = Math.sin(v), cv = Math.cos(v), ux = sv * Math.sin(t), uz = sv * Math.cos(t), seam = 1 - 0.014 * Math.pow(Math.abs(Math.cos(3 * t)), 26) * sv;
      const dx = ux - 0.5, dy = cv - 0.8, dz = uz - 0.28, dent = Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.1), f = seam * (1 - 0.15 * dent);
      P.push(W * ux * f, Math.max(-0.88 * H, H * cv * (1 - 0.22 * dent)), D * uz * f); };
    at(0, 0); for (let k = 1; k < m; k++) for (let j = 0; j < n; j++) at(k / m * Math.PI, j / n * Math.PI * 2); at(Math.PI, 0);
    const last = P.length / 3 - 1;
    for (let j = 0; j < n; j++) { I.push(0, 1 + j, 1 + (j + 1) % n); const o = 1 + (m - 2) * n; I.push(last, o + (j + 1) % n, o + j); }
    for (let k = 0; k + 2 < m; k++) for (let j = 0; j < n; j++) { const p0 = 1 + k * n + j, p1 = 1 + k * n + (j + 1) % n, q0 = p0 + n, q1 = p1 + n; I.push(p0, q0, q1, p0, q1, p1); }
    const g = unscale(b, P, I, sc); cnt('ball', 2 * seg * (hs0 - 1), I.length / 3); return link(g, lo, 0.25 * r);
  }

  // ---------------------------------------------------------------- awning scallops
  // An awning's scallop was a flat half-disc of 8 wedges. As cloth it has a smooth hem and hangs with a little billow, fuller toward the
  // bottom, with a slow ripple across it; its top edge stays on its line and its outline is the same. r: its radius; PI: the park's own pi
  function scallop(b, r, PI) {
    const lo = new b.CircleGeometry(r, 8, PI, PI); if (OFF) return lo;
    const na = 20, nr = 4, P = [0, 0, 0], I = [];
    for (let k = 1; k <= nr; k++) for (let a = 0; a <= na; a++) { const t = PI + PI * a / na, rr = r * k / nr, x = Math.cos(t) * rr, y = Math.sin(t) * rr, dp = -y / r; P.push(x, y, r * dp * (0.1 * dp + 0.035 * Math.sin(3.3 * x / r + 0.7))); }
    for (let a = 0; a < na; a++) I.push(0, 1 + a, 2 + a);
    for (let k = 0; k + 1 < nr; k++) for (let a = 0; a < na; a++) { const p = 1 + k * (na + 1) + a, q = p + na + 1; I.push(p, q, q + 1, p, q + 1, p + 1); }
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    cnt('scallop', 8, I.length / 3); return link(g, lo, 0.1 * r);
  }

  // ---------------------------------------------------------------- grass
  // A blade was one flat triangle. Detailed, it is a leaf: it rises from the same root to the same tip, bending over as it goes, tapering,
  // darker at the root and lighter toward the tip. sink(x, y, z, shade) takes its 7 points in order; the 5 triangles are BLADE_I.
  const BLADE_T = [0, 0.36, 0.7], BLADE_W = [1, 0.86, 0.55], BLADE_S = [0.8, 0.97, 1.08, 1.16], BLADE_I = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6];
  function bladePts(cx, cy, cz, wx, wy, wz, tx, ty, tz, sink) {   // root centre, half-width vector, root-to-tip vector
    for (let k = 0; k < 3; k++) { const t = BLADE_T[k], a = 0.3 * t * (1 - t) + t * t, bq = t * (1.5 - 0.5 * t), w = BLADE_W[k], px = cx + tx * a, py = cy + ty * bq, pz = cz + tz * a;
      sink(px + wx * w, py + wy * w, pz + wz * w, BLADE_S[k]); sink(px - wx * w, py - wy * w, pz - wz * w, BLADE_S[k]); }
    sink(cx + tx, cy + ty, cz + tz, BLADE_S[3]);
  }
  // the park's grass (its builder's `tri`): p0, p1 the two root corners, p2 the tip, col the blade's colour
  function grassTri(b, B, mat, p0, p1, p2, col) {
    const lo = new b.BufferGeometry(); lo.setAttribute('position', new b.BufferAttribute(new Float32Array([...p0, ...p1, ...p2]), 3)); lo.setIndex([0, 1, 2]); lo.computeVertexNormals();
    if (OFF || mat.name !== 'Grass_Blades') return B.addM(lo, mat, new b.Matrix4(), col);
    const P = [], C = [], cc = new b.Color(); if (typeof col === 'number') { if (col <= 4) cc.setRGB(col, col, col); else cc.setHex(col); }
    bladePts((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2, (p0[2] - p1[2]) / 2, p2[0] - (p0[0] + p1[0]) / 2, p2[1] - (p0[1] + p1[1]) / 2, p2[2] - (p0[2] + p1[2]) / 2,
      (x, y, z, s) => { P.push(x, y, z); C.push(Math.min(255, Math.round(cc.r * s * 255)), Math.min(255, Math.round(cc.g * s * 255)), Math.min(255, Math.round(cc.b * s * 255))); });
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('color', new b.BufferAttribute(new Uint8Array(C), 3, true)); g.setIndex(BLADE_I.slice()); g.computeVertexNormals();
    cnt('grass', 1, 5); return B.addM(link(g, lo, 0.035), mat, new b.Matrix4(), col);
  }

  // ---------------------------------------------------------------- vine leaves
  // A leaf on a vine was a flat kite (stem, side, tip, side). Detailed, it is a leaf through the same four points: a pointed oval, its
  // midrib a gentle curve, its two halves folded up a little from the midrib. (Every other flat four-cornered piece stays as it was.)
  const LEAF_I = [0, 5, 1, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 7, 4, 0, 1, 8, 1, 9, 8, 1, 2, 9, 2, 10, 9, 2, 3, 10, 3, 4, 10];   // (wound the way the kite was)
  function quadG(b, B, mat, p0, p1, p2, p3, col) {
    const lo = new b.BufferGeometry(); lo.setAttribute('position', new b.BufferAttribute(new Float32Array([...p0, ...p1, ...p2, ...p3]), 3)); lo.setIndex([0, 1, 2, 0, 2, 3]); lo.computeVertexNormals();
    const ax = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], L2 = ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2], u = [(p1[0] - p3[0]) / 2, (p1[1] - p3[1]) / 2, (p1[2] - p3[2]) / 2], ul = Math.hypot(u[0], u[1], u[2]);
    if (OFF || mat.name !== 'Vine_Leaf' || !(L2 > 1e-10) || !(ul > 1e-6)) return B.addM(lo, mat, new b.Matrix4(), col);
    const mid = [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2, (p1[2] + p3[2]) / 2];
    // how far along the leaf it is widest; the midrib is the curve from stem to tip that passes through the middle of the two sides there
    const tm = Math.min(0.6, Math.max(0.25, ((mid[0] - p0[0]) * ax[0] + (mid[1] - p0[1]) * ax[1] + (mid[2] - p0[2]) * ax[2]) / L2)), k = 1 / (2 * tm * (1 - tm));
    const ct = [0, 1, 2].map((i) => (mid[i] - (1 - tm) * (1 - tm) * p0[i] - tm * tm * p2[i]) * k), rib = (t) => [0, 1, 2].map((i) => (1 - t) * (1 - t) * p0[i] + 2 * t * (1 - t) * ct[i] + t * t * p2[i]);
    let n = [u[1] * ax[2] - u[2] * ax[1], u[2] * ax[0] - u[0] * ax[2], u[0] * ax[1] - u[1] * ax[0]]; const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / nl * ul * 0.22);   // the fold
    const T = [0.5 * tm, tm, tm + 0.55 * (1 - tm)], W = T.map((t) => (t <= tm ? Math.sin(Math.PI / 2 * t / tm) : Math.pow(Math.cos(Math.PI / 2 * (t - tm) / (1 - tm)), 0.85))), C = T.map(rib), P = [];
    P.push(...p0); for (const c of C) P.push(...c); P.push(...p2);
    for (const sg of [1, -1]) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) P.push(C[j][i] + sg * u[i] * W[j] + n[i] * W[j]);
    const g = new b.BufferGeometry(); g.setAttribute('position', new b.BufferAttribute(new Float32Array(P), 3)); g.setIndex(LEAF_I.slice()); g.computeVertexNormals();
    cnt('leaf', 2, 12); return B.addM(link(g, lo, 0.3 * ul), mat, new b.Matrix4(), col);
  }

  // ---------------------------------------------------------------- jungle: tree crowns, bushes, trunks, fronds, weeds
  // The park builds its jungle straight into one mesh for each 90 m tile. That mesh is now the tile's FAR level (smooth crowns, ribbon
  // fronds, 4 to 6-sided trunks), and every call is also noted, so the tile's DETAILED trees (leaf clumps with shaded creases, feather
  // fronds with separate leaflets, round trunks) can be made the first time a camera comes near enough to see the difference, anywhere
  // on the island, and dropped again when it has long gone. The weeds on the park floor are their own mesh per tile, same arrangement.
  // B is the tile's own builder: B.v pushes a coloured vertex and returns its index, B.i is its index list, B.n its vertex count.
  const JT = new Map(), jt = (B) => { let t = JT.get(B); if (!t) JT.set(B, (t = { rec: [], R: 0, tl: null, blades: [] })); return t; };
  // one crown or bush. c: the park's 12- or 42-point ball; Z, K: the random push and shade the park drew for each of its points;
  // centre e,o,s; radii r,n,a; colour; w,g: cos/sin of its turn; dN: how finely to divide it (-1: the park's own lump)
  function jemit(B, c, Z, K, e, o, s, r, n, a, cr, cg, cb, w, g, dN) {
    const nc = c.verts.length / 3, m = B.n;
    if (dN < 0) {
      for (let M = 0, q = 0; M < c.verts.length; M += 3, q++) { const z = Z[q], x1 = c.verts[M] * z, y1 = c.verts[M + 1] * z, z1 = c.verts[M + 2] * z, k = 0.62 + 0.38 * (y1 * 0.5 + 0.5) + K[q]; B.v(e + (x1 * w + z1 * g) * r, o + y1 * n, s + (-x1 * g + z1 * w) * a, cr * k, cg * k, cb * k); }
      for (const M of c.idx) B.i.push(m + M); cnt('jblob', c.idx.length / 3, c.idx.length / 3); return;
    }
    const T = ico(dN), D = T.D, nv = D.length / 3, U = c.verts, th = Math.sqrt(4 * Math.PI / nc) * 1.35, c0 = Math.cos(th), ic = 1 / (1 - c0);
    let seed = 0; for (let q = 0; q < nc; q++) seed = (seed + Math.round(Z[q] * 65536) * (q + 1)) | 0;
    // leaf clumps: rounded bumps with creases between them (finer on bigger crowns), and the creases sit in shade
    const bump = dN >= 4 ? 0.16 : dN === 3 ? 0.13 : dN === 2 ? 0.09 : 0, CD = bump ? clumpDirs(Math.max(6, Math.min(34, Math.round(nv / 13))), seed) : null;
    for (let i = 0; i < nv; i++) { const dx = D[i * 3], dy = D[i * 3 + 1], dz = D[i * 3 + 2]; let ws = 0, fs = 0, ks = 0;
      for (let q = 0; q < nc; q++) { const dt = dx * U[q * 3] + dy * U[q * 3 + 1] + dz * U[q * 3 + 2]; if (dt <= c0) continue; let wt = (dt - c0) * ic; wt *= wt; wt *= wt; ws += wt; fs += wt * Z[q]; ks += wt * K[q]; }
      let f = ws > 0 ? fs / ws : 1; const kj = ws > 0 ? ks / ws : 0;
      const cl = CD ? clumpAt(CD, dx, dy, dz) : 1; f = (f + bump * (cl - 0.62)) * (nc <= 12 ? 0.87 : 0.965);
      const x1 = dx * f, y1 = dy * f, z1 = dz * f, k = 0.62 + 0.38 * (y1 * 0.5 + 0.5) + kj - 0.17 * (1 - cl) * (1 - cl);
      B.v(e + (x1 * w + z1 * g) * r, o + y1 * n, s + (-x1 * g + z1 * w) * a, cr * k, cg * k, cb * k); }
    const I = T.I; for (let q = 0; q < I.length; q++) B.i.push(m + I[q]); cnt('jblob', c.idx.length / 3, I.length / 3);
  }
  function jblob(B, c, Z, K, e, o, s, r, n, a, col, w, g) {
    const nc = c.verts.length / 3, R = Math.max(r, n, a);
    if (OFF) { jemit(B, c, Z, K, e, o, s, r, n, a, col.r, col.g, col.b, w, g, -1); return; }
    const t = jt(B); if (R > t.R) t.R = R; t.rec.push([0, c, Z, K, e, o, s, r, n, a, col.r, col.g, col.b, w, g]);
    jemit(B, c, Z, K, e, o, s, r, n, a, col.r, col.g, col.b, w, g, R < 0.6 || (R < 3 && nc >= 42) ? -1 : R < 3 ? 1 : 2);   // far: small bushes as they were, crowns smooth
  }
  // a palm or fern frond: the park's flat ribbon (far), or a feather frond (detailed): a midrib that rises and droops the same way, with
  // separate leaflets down both sides, each pointing forward and hanging a little (same length, width and colour)
  function jfrondEmit(B, e, o, s, r, n, a, l, q, cr, cg, cb, c, feather) {
    const m = Math.cos(r), f = Math.sin(r), w = -f, g = m, cl = (v) => Math.min(1, Math.max(0, v));
    if (!feather) {
      let M = -1; for (let z = 0; z <= c; z++) { const t = z / c, R = n * t, A = o + l * n * t - q * n * t * t, k = a * Math.sin(Math.PI * cl(t * 0.9 + 0.08)) * 0.5 + 0.02, C = 0.7 + 0.3 * t;
        const p = B.v(e + m * R + w * k, A - 0.12 * k, s + f * R + g * k, cr * C, cg * C, cb * C); B.v(e + m * R - w * k, A - 0.12 * k, s + f * R - g * k, cr * C, cg * C, cb * C);
        if (M >= 0) B.i.push(M, p, M + 1, M + 1, p, p + 1); M = p; }
      cnt('jfrond', 2 * c, 2 * c); return; }
    // slim leaflets down both sides: each leaves the midrib at a narrow base, reaches out to the ribbon's old width, points a little
    // forward and hangs. A palm's frond has a stem as well (a narrow strip that tapers to the tip); on a fern's shorter frond the
    // leaflets' bases meet along the midrib and are the stem
    const stem = c >= 4, N = stem ? 11 : 8, bw = stem ? 0.19 : 0.27, at = (t) => [e + m * n * t, o + l * n * t - q * n * t * t, s + f * n * t], st = 1 / N; let prev = -1;
    if (stem) for (let z = 0; z <= N; z++) { const t = z / N, p = at(t), hw = 0.008 + 0.02 * (1 - t), C = 0.5 + 0.25 * t, v0 = B.v(p[0] + w * hw, p[1], p[2] + g * hw, cr * C, cg * C, cb * C); B.v(p[0] - w * hw, p[1], p[2] - g * hw, cr * C, cg * C, cb * C); if (prev >= 0) B.i.push(prev, v0, prev + 1, prev + 1, v0, v0 + 1); prev = v0; }
    for (let z = 0; z < N; z++) { const tm = (z + 0.5) / N; if (tm < 0.1) continue; const k = (a * Math.sin(Math.PI * cl(tm * 0.9 + 0.08)) * 0.5 + 0.02) * 1.15, pa = at(tm - bw * st), pb = at(tm + bw * st), pt = at(Math.min(1, tm + 0.85 * st)), C0 = 0.62 + 0.25 * tm, C1 = 0.85 + 0.3 * tm;
      for (const sd of [1, -1]) { const i0 = B.v(pa[0], pa[1], pa[2], cr * C0, cg * C0, cb * C0); B.v(pb[0], pb[1], pb[2], cr * C0, cg * C0, cb * C0); B.v(pt[0] + sd * w * k, pt[1] - 0.42 * k, pt[2] + sd * g * k, cr * C1, cg * C1, cb * C1); if (sd > 0) B.i.push(i0, i0 + 2, i0 + 1); else B.i.push(i0, i0 + 1, i0 + 2); } }
    cnt('jfrond', 2 * c, (stem ? 4 : 2) * N);
  }
  function jfrond(B, e, o, s, r, n, a, l, q, col, c) {
    if (!OFF) jt(B).rec.push([1, e, o, s, r, n, a, l, q, col.r, col.g, col.b, c]);
    jfrondEmit(B, e, o, s, r, n, a, l, q, col.r, col.g, col.b, c, false);
  }
  // a trunk (the park then builds its own 4 to 6-sided one, the far level): pts its rings {x, y, z, r}, hex its colour
  function jtrunk(B, pts, hex) { if (!OFF && pts.length > 1) jt(B).rec.push([2, pts.map((p) => [p.x, p.y, p.z, p.r]), hex]); }
  function jtrunkHi(B, pts, hex) {
    const col = new TH.Color().setHex(hex), big = pts[0][3] >= 0.2, s = big ? 10 : 8; let prev = -1;
    for (let n = 0; n < pts.length; n++) { const a = pts[n], l = B.n, q = 0.75 + 0.25 * (n / (pts.length - 1));
      for (let x = 0; x < s; x++) { const c = x / s * Math.PI * 2; B.v(a[0] + Math.cos(c) * a[3], a[1], a[2] + Math.sin(c) * a[3], col.r * q, col.g * q, col.b * q); }
      if (prev >= 0) for (let x = 0; x < s; x++) { const c = (x + 1) % s; B.i.push(prev + x, l + x, prev + c, prev + c, l + x, l + c); }
      prev = l; }
    cnt('jtrunk', 0, 2 * s * (pts.length - 1));
  }
  // a tuft of weeds on the park floor: n blades about (e, o, s), reach r. The random numbers are the park's own (h, d), drawn in its order
  function jtuft(B, e, o, s, r, n, col, h, d, P) {
    const t = OFF ? null : jt(B), S = t ? (t.tl || (t.tl = new B.constructor())) : B;
    for (let l = 0; l < n; l++) { const q = h(P), x = 0.035 + h(0.03), c = h(0.1, 0.5) * r, m = r * h(0.6, 1.1), f = e + d(0.12), w = s + d(0.12), g = h(0.75, 1.1);
      const M = S.v(f + Math.cos(q + 1.57) * x, o, w + Math.sin(q + 1.57) * x, col.r * g * 0.7, col.g * g * 0.7, col.b * g * 0.7);
      S.v(f - Math.cos(q + 1.57) * x, o, w - Math.sin(q + 1.57) * x, col.r * g * 0.7, col.g * g * 0.7, col.b * g * 0.7); S.v(f + Math.cos(q) * c, o + m, w + Math.sin(q) * c, col.r * g, col.g * g, col.b * g); S.i.push(M, M + 1, M + 2);
      if (t) t.blades.push(f, o, w, Math.cos(q + 1.57) * x, Math.sin(q + 1.57) * x, Math.cos(q) * c, m, Math.sin(q) * c, col.r * g, col.g * g, col.b * g); }
  }
  // a tile is complete: G the jungle's group, B the tile's builder, far its mesh (or null), key its name, blade the grass material
  // ---- leaves. Close to, a crown should not be a smooth lump. Within about 45 m on a 720-line picture (further on a bigger one) every
  // crown and bush wears sprays of leaves that stand off its surface: three leaflets to a spray, lying along the crown and lifting a
  // little, drooping at the tip, lighter toward the tip, each spray its own shade and some of them the yellow-green of new growth.
  // They are a mesh of their own for every 30 m square of jungle, made the first time a camera comes that near and dropped when it has
  // long gone (levels with nothing to hide: the crown itself stays underneath), and drawn without ink lines, like grass.
  const LEAF = { dev: 0.12, tol: 2, cell: 30, cover: 0.55 };
  // the surface jemit gives a crown, as a function of direction: [how far out, shade]
  function jsurf(c, Z, K, dN) {
    const nc = c.verts.length / 3, U = c.verts, th = Math.sqrt(4 * Math.PI / nc) * 1.35, c0 = Math.cos(th), ic = 1 / (1 - c0);
    let seed = 0; for (let q = 0; q < nc; q++) seed = (seed + Math.round(Z[q] * 65536) * (q + 1)) | 0;
    const nv = dN >= 0 ? ico(dN).D.length / 3 : 0, bump = dN >= 4 ? 0.16 : dN === 3 ? 0.13 : dN === 2 ? 0.09 : 0, CD = bump ? clumpDirs(Math.max(6, Math.min(34, Math.round(nv / 13))), seed) : null, sh = dN < 0 ? 0.93 : nc <= 12 ? 0.87 : 0.965;
    return { seed, at: (dx, dy, dz) => { let ws = 0, fs = 0, ks = 0;
      for (let q = 0; q < nc; q++) { const dt = dx * U[q * 3] + dy * U[q * 3 + 1] + dz * U[q * 3 + 2]; if (dt <= c0) continue; let wt = (dt - c0) * ic; wt *= wt; wt *= wt; ws += wt; fs += wt * Z[q]; ks += wt * K[q]; }
      const cl = CD ? clumpAt(CD, dx, dy, dz) : 1; return [((ws > 0 ? fs / ws : 1) + bump * (cl - 0.62)) * sh, (ws > 0 ? ks / ws : 0) - 0.17 * (1 - cl) * (1 - cl)]; } };
  }
  // one spray: its foot at p, "out" n (unit), colour (r0, g0, b0), length L; rnd: a stream of random numbers. S: where it is built
  function spray(S, px, py, pz, nx, ny, nz, r0, g0, b0, L, rnd) {
    // a direction along the surface, and the spray's line: mostly along the surface, out a little, hanging a little
    let tx = rnd() - 0.5, ty = rnd() - 0.5, tz = rnd() - 0.5; const td = tx * nx + ty * ny + tz * nz; tx -= td * nx; ty -= td * ny; tz -= td * nz; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let ux = tx * 0.8 + nx * 0.5, uy = ty * 0.8 + ny * 0.5 - 0.28, uz = tz * 0.8 + nz * 0.5; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    let sx = ny * uz - nz * uy, sy = nz * ux - nx * uz, sz = nx * uy - ny * ux; const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;   // across the spray
    const n0 = S.p.length / 3; const bi = S.v(px - nx * 0.03, py - ny * 0.03, pz - nz * 0.03, r0 * 0.7, g0 * 0.7, b0 * 0.7);   // its foot, just under the surface
    for (let j = -1; j <= 1; j++) { const ll = L * (j ? 0.76 : 1), vx = ux + sx * 0.6 * j, vy = uy + sy * 0.6 * j, vz = uz + sz * 0.6 * j, vl = Math.hypot(vx, vy, vz) || 1, ax = vx / vl, ay = vy / vl, az = vz / vl;
      const wx = ny * az - nz * ay, wy = nz * ax - nx * az, wz = nx * ay - ny * ax, hw = 0.21 * ll / (Math.hypot(wx, wy, wz) || 1);   // across this leaflet
      const mx = px + ax * ll * 0.48 + nx * 0.035 * ll, my = py + ay * ll * 0.48 + ny * 0.035 * ll, mz = pz + az * ll * 0.48 + nz * 0.035 * ll;
      const l = S.v(mx + wx * hw, my + wy * hw, mz + wz * hw, r0, g0, b0), r = S.v(mx - wx * hw, my - wy * hw, mz - wz * hw, r0, g0, b0), t = S.v(px + ax * ll, py + ay * ll - 0.06 * ll, pz + az * ll, r0 * 1.16, g0 * 1.16, b0 * 1.12);
      S.i.push(bi, l, t, bi, t, r); }
    const an = S.anc || (S.anc = []); for (let k = n0; k < S.p.length / 3; k++) an.push(px, py, pz);   // (where on the crown it grows from: the wind moves the whole spray with that point)
  }
  const sprayLen = (R) => 0.24 + 0.055 * Math.min(R, 4), sprayCount = (rm, L0) => Math.max(10, Math.min(800, Math.round(4 * Math.PI * rm * rm * LEAF.cover / (0.36 * L0 * L0))));
  function jsprays(S, a, dN) {   // a: a crown's record [0, ball, push, shade, centre x y z, radii x y z, colour r g b, cos, sin of its turn]
    const cx = a[4], cy = a[5], cz = a[6], rx = a[7], ry = a[8], rz = a[9], cr = a[10], cg = a[11], cb = a[12], w = a[13], g = a[14], R = Math.max(rx, ry, rz);
    const sf = jsurf(a[1], a[2], a[3], dN), L0 = sprayLen(R), N = sprayCount((rx + ry + rz) / 3, L0), ga = Math.PI * (3 - Math.sqrt(5));
    let h = (sf.seed ^ 0x9e3779b9) >>> 0; const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
    for (let i = 0; i < N; i++) {
      // an even scatter of directions (a sunflower spiral), each nudged; few underneath, where the trunk is and nobody looks
      const dy = 1 - 2 * (i + 0.5) / N, u1 = rnd(), u2 = rnd(); if (dy < -0.55 && u1 < 0.7) continue;
      const rr = Math.sqrt(1 - dy * dy), an = i * ga + (u2 - 0.5) * 0.5, dx = Math.cos(an) * rr, dz = Math.sin(an) * rr, fk = sf.at(dx, dy, dz), f = fk[0], y1 = dy * f;
      let nx = (dx * w + dz * g) / rx, ny = dy / ry, nz = (-dx * g + dz * w) / rz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;   // the ellipsoid's own normal there
      const sh = (0.62 + 0.38 * (y1 * 0.5 + 0.5) + fk[1]) * (0.86 + 0.3 * rnd()), warm = rnd() < 0.18;
      spray(S, cx + (dx * f * w + dz * f * g) * rx, cy + y1 * ry, cz + (-dx * f * g + dz * f * w) * rz, nx, ny, nz, cr * sh * (warm ? 1.12 : 1), cg * sh * (warm ? 1.08 : 1), cb * sh * (warm ? 0.7 : 1), L0 * (0.75 + 0.5 * rnd()), rnd); }
  }
  function jtile(b, G, B, far, key, blade) {
    TH = b; const t = JT.get(B); if (!t) return; JT.delete(B); const P2c = B.constructor;
    const made = (S, name, mat) => { const h = S.mesh(name); if (!h) return []; if (mat) { h.material = mat; h.layers.enable(2); } h.userData.rpHi = 1; h.raycast = noRay; G.add(h); h.updateWorldMatrix(false, false); return [h]; };
    if (far && t.rec.length) reg({ lo: [far], hi: null, ref: far, dev: 0.04 * Math.min(6, Math.max(1.5, t.R)), tol: 2, feat: 0, mk: () => { const S = new P2c(), CEN = [];
      for (const a of t.rec) { const n0 = S.p.length / 3; jrec(S, a); const isC = a[0] === 0; for (let k = n0; k < S.p.length / 3; k++) CEN.push(isC ? a[4] : 0, isC ? a[5] : 0, isC ? a[6] : 0, isC ? 2 : 0); }
      // the leaves baked into the crowns: each crown's sprays are part of the same mesh as the crown, carrying its centre, so every leaf
      // moves with its crown in one piece (sway and swell alike)
      for (const a of t.rec) { if (a[0] !== 0 || !blade) continue; const R = Math.max(a[7], a[8], a[9]), n0 = S.p.length / 3; jsprays(S, a, R < 0.6 ? (a[1].verts.length >= 126 ? -1 : 1) : R < 1.5 ? 2 : R < 3 ? 3 : 4); for (let k = n0; k < S.p.length / 3; k++) CEN.push(a[4], a[5], a[6], 2); }
      const hs0 = made(S, far.name + '@hi', null); for (const h of hs0) { h.material = crownMat(TH, h.material); } for (const h of hs0) if (h.geometry.attributes.position.count * 4 === CEN.length) h.geometry.setAttribute('aCrown', new TH.Float32BufferAttribute(CEN, 4)); return hs0;
      function jrec(S, a) { if (a[0] === 0) { const R = Math.max(a[7], a[8], a[9]); jemit(S, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], R < 0.6 ? (a[1].verts.length >= 126 ? -1 : 1) : R < 1.5 ? 2 : R < 3 ? 3 : 4); }
        else if (a[0] === 1) jfrondEmit(S, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], true); else jtrunkHi(S, a[1], a[2]); } } });
    if (false && far && blade) { // (v98: the sprays are baked into the crowns' own detailed mesh above)
      const cells = new Map(), TV = new TH.Vector3(); for (const a of t.rec) { if (a[0] !== 0) continue; const k = Math.floor(a[4] / LEAF.cell) + ',' + Math.floor(a[6] / LEAF.cell); let c = cells.get(k); if (!c) cells.set(k, (c = { list: [], box: new TH.Box3() })); c.list.push(a);
        const R = Math.max(a[7], a[8], a[9]) + 0.7; c.box.expandByPoint(TV.set(a[4] - R, a[5] - R, a[6] - R)); c.box.expandByPoint(TV.set(a[4] + R, a[5] + R, a[6] + R)); }
      for (const [k, c] of cells) reg({ lo: [], hi: null, ref: { geometry: { boundingBox: c.box }, matrixWorld: far.matrixWorld }, dev: LEAF.dev, tol: LEAF.tol, feat: 0, mk: () => { const S = new P2c();
        const CEN = []; for (const a of c.list) { const R = Math.max(a[7], a[8], a[9]), n0 = S.p.length / 3; jsprays(S, a, R < 0.6 ? (a[1].verts.length >= 126 ? -1 : 1) : R < 1.5 ? 2 : R < 3 ? 3 : 4); for (let k = n0; k < S.p.length / 3; k++) CEN.push(a[4], a[5], a[6], 2); } S.cen = CEN;
        const hs = made(S, 'Jungle_Leaves_' + key + '_' + k + '@hi', leafMat(TH, blade)); for (const h of hs) { if (S.anc && h.geometry.attributes.position.count * 3 === S.anc.length) h.geometry.setAttribute('aAnchor', new TH.Float32BufferAttribute(S.anc, 3)); if (S.cen && h.geometry.attributes.position.count * 4 === S.cen.length) h.geometry.setAttribute('aCrown', new TH.Float32BufferAttribute(S.cen, 4)); } for (const h of hs) h.castShadow = false; cnt('jleaf', 0, S.i.length / 3); return hs; } }); }
    if (t.tl) { const lo = t.tl.mesh('Jungle_Tufts_' + key); t.tl = null; if (lo) { G.add(lo); const bl = t.blades;
      reg({ lo: [lo], hi: null, ref: lo, dev: 0.035, tol: 1.5, feat: 0.07, fpx: 0.35, mk: () => { const S = new P2c();
        for (let i = 0; i < bl.length; i += 11) { const v0 = S.n; bladePts(bl[i], bl[i + 1], bl[i + 2], bl[i + 3], 0, bl[i + 4], bl[i + 5], bl[i + 6], bl[i + 7], (x, y, z, sh) => { const k = 0.7 + 0.3 * (sh - 0.8) / 0.36; S.v(x, y, z, bl[i + 8] * k, bl[i + 9] * k, bl[i + 10] * k); }); for (let k = 0; k < 15; k++) S.i.push(v0 + BLADE_I[k]); }
        return made(S, lo.name + '@hi', blade); } }); } }
  }

  // ---------------------------------------------------------------- sign lettering
  // Every sign used to be the same flat-fronted Helvetica. Each now gets a face and a build that suits it: fat Bookman for the carnival,
  // Avant Garde for the arcade and rides, a chancery script for welcomes and the gift shop, condensed gothic for staff and warning
  // signs, typewriter for the government notices. Raised letters have rounded-over fronts; the big signs sit on a trim layer of a second
  // colour or cast a painted drop shade, and the playful ones have letters that bounce. The lettering is fitted into the space the old
  // text took (never wider, never much taller), so it sits on its board exactly as before.
  const FCACHE = {};
  const fontOf = (HEL, key) => (key === 'HEL' || !window.RPF || !window.RPF[key]) ? HEL : (FCACHE[key] || (FCACHE[key] = new HEL.constructor(window.RPF[key])));
  const hs = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const title = (str) => str.toLowerCase().replace(/(^|[\s+])([a-z])/g, (m, a, c) => a + c.toUpperCase());
  // f: face; bev: front rounding (x size); trim: [material, offset x size]; shade: [material, dx, dy x size]; bounce: [tilt rad, lift x size]; tc: title case
  const SIGNS = {
    'RADIANT PARK!': { f: 'BON', bev: 0.02, trim: ['redBright', 0.04], bounce: [0.05, 0.035] },
    'WELCOME': { f: 'CHO', tc: 1, bev: 0.006, shade: ['redBright', 0.03, -0.03] },
    'RADIANT RIVERS': { f: 'ADV', bev: 0.022, trim: ['teal', 0.04], bounce: [0.04, 0.04] },
    'ARCADE': { f: 'ADV', bev: 0.024, trim: ['redBright', 0.045] },
    'SKY WHEEL': { f: 'BONI', bev: 0.014, trim: ['cream', 0.035] },
    'BUMPER CARS': { f: 'POP', bev: 0.024, trim: ['yellow', 0.04], bounce: [0.045, 0.03] },
    'RADIANT COMET': { f: 'BONI', bev: 0.014, trim: ['yellow', 0.04] },
    'JUNGLE RATTLER': { f: 'BON', bev: 0.014, trim: ['cream', 0.04], bounce: [0.04, 0.03] },
    'TWIN TWISTER': { f: 'BONI', bev: 0.014, trim: ['yellow', 0.04] },
    'SPLASH ZONE': { f: 'POP', bev: 0.022, trim: ['white', 0.04], bounce: [0.05, 0.035] },
    'PUPPET SHOW': { f: 'CHO', tc: 1, bev: 0.006, shade: ['yellow', 0.035, -0.035] },
    'GIFTS + PLUSH': { f: 'CHO', tc: 1, bev: 0.006, shade: ['yellow', 0.03, -0.03] },
    'TIKI SNACKS': { f: 'BON', bev: 0.012, shade: ['rustDark', 0.04, -0.04], bounce: [0.05, 0.03] },
    'WELCOME FRIENDS!': { f: 'CHO', tc: 1 },
    'POPCORN': { f: 'BON', bev: 0.012, shade: ['rustDark', 0.05, -0.05] },
    'SNACKS': { f: 'BONI' }, 'BALLOON': { f: 'BON' }, 'POP': { f: 'BON' },
    'TICKETS': { f: 'BON', bev: 0.012, shade: ['black', 0.04, -0.04] },
    'PARK MAP': { f: 'ADV', bev: 0.02 }, 'PRIZE CATCHER': { f: 'ADV' }, 'PRIZE COUNTER': { f: 'ADV', bev: 0.02, shade: ['redBright', 0.04, -0.04] },
    'RESTROOMS': { f: 'HCN', bev: 0.018 }, 'CHANGING ROOMS  +  LOCKERS': { f: 'HCN', bev: 0.018 }, 'MAINTENANCE': { f: 'HCN' }, 'STAFF': { f: 'HCN' },
    'DANGER': { f: 'HCN' }, 'WAVE PLANT': { f: 'HCN' }, '2.5M': { f: 'HCN' }, '1.0M': { f: 'HCN' }, 'CHLORO': { f: 'HCN' }, 'AUTHORIZED PERSONNEL ONLY': { f: 'HCN', bev: 0.014 },
    'RESTRICTED': { f: 'CUR' }, 'U.S. GOVT PROPERTY': { f: 'CUR' }, 'NO ENTRY': { f: 'CUR' },
    'RADIANT PARK SHUTTLE': { f: 'ADV' }, 'RADIANT PARK FERRY': { f: 'ADV', bev: 0.016 },
    // the midway's game and food booths: red raised letters on a cream board, each stall with its own lettering
    'RING TOSS': { f: 'BON', bev: 0.012, shade: ['black', 0.04, -0.04] }, 'LUCKY DUCKS': { f: 'POP', bev: 0.02, shade: ['yellow', 0.04, -0.04], bounce: [0.05, 0.03] },
    'CAN SMASH': { f: 'ADV', bev: 0.02, shade: ['black', 0.045, -0.045] }, 'HOOP SHOT': { f: 'BONI', bev: 0.012, shade: ['yellow', 0.04, -0.04] },
    'SPIN + WIN': { f: 'BON', bev: 0.012, shade: ['yellow', 0.04, -0.04], bounce: [0.06, 0.035] }, 'STICKY GRAB': { f: 'POP', bev: 0.02, shade: ['black', 0.04, -0.04] },
    'SPLASH RACE': { f: 'BONI', bev: 0.012, shade: ['blue', 0.04, -0.04] }, 'KINGYO SCOOP': { f: 'ADV', bev: 0.02, shade: ['orange', 0.04, -0.04] },
    'BOTTLE BASH': { f: 'BON', bev: 0.012, shade: ['black', 0.04, -0.04], bounce: [0.04, 0.025] }, 'PLUSH PRIZES': { f: 'CHO', tc: 1, bev: 0.006, shade: ['pink', 0.035, -0.035] },
    'YAKISOBA': { f: 'POP', bev: 0.02, shade: ['black', 0.04, -0.04] }, 'KAKIGORI ICE': { f: 'ADV', bev: 0.02, shade: ['blue', 0.04, -0.04] }, 'DARTS': { f: 'BON', bev: 0.012, shade: ['black', 0.04, -0.04] },
    'RAMEN': { f: 'POP', bev: 0.02, shade: ['black', 0.04, -0.04] }, 'TAKOYAKI': { f: 'ADV', bev: 0.02, shade: ['black', 0.04, -0.04] }, 'SOFT CREAM': { f: 'CHO', tc: 1, bev: 0.006, shade: ['pink', 0.035, -0.035] }, 'SOUVENIR FOTO': { f: 'BONI', bev: 0.012, shade: ['black', 0.04, -0.04] },
    'NE': { f: 'BON' }, 'MO': { f: 'BON' }, 'COASTERS': { f: 'HCN' }, 'MIDWAY': { f: 'HCN' },
  };
  function signStyle(str, depth, tag, size) {
    if (tag === 'CentralPlaza' && size <= 0.14) return { f: 'HCN', flat: 1 };   // the park map's labels: one plain hand
    const st = SIGNS[str] || { f: ['BON', 'ADV', 'POP', 'HCN'][hs(str) % 4], bev: 0.012 };
    return depth < 0.018 ? { f: st.f, tc: st.tc, flat: 1 } : st;   // paint-thin lettering stays plain: no rounding, trim or shade
  }
  const gtris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  // ExtrudeGeometry comes faceted (every triangle its own normal). Give it real shading: the flat front and back stay flat, the rounded
  // edge and the sides blend into each other around curves, and true corners (more than `crease` degrees) stay sharp
  function soften(g, crease) {
    const P = g.attributes.position.array, nt = P.length / 9, FN = new Float32Array(nt * 3), AR = new Float32Array(nt), cap = new Uint8Array(nt), N = new Float32Array(P.length), map = new Map(), ct = Math.cos((crease || 50) * Math.PI / 180);
    for (let t = 0; t < nt; t++) { const o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); AR[t] = l; if (l > 0) { nx /= l; ny /= l; nz /= l; } FN[t * 3] = nx; FN[t * 3 + 1] = ny; FN[t * 3 + 2] = nz; cap[t] = Math.abs(nz) > 0.9995 ? 1 : 0;
      for (let c = 0; c < 3; c++) { const k = Math.round(P[o + c * 3] * 2e4) + ',' + Math.round(P[o + c * 3 + 1] * 2e4) + ',' + Math.round(P[o + c * 3 + 2] * 2e4); const a = map.get(k); if (a) a.push(t); else map.set(k, [t]); } }
    for (let t = 0; t < nt; t++) { const o = t * 9, fx = FN[t * 3], fy = FN[t * 3 + 1], fz = FN[t * 3 + 2];
      for (let c = 0; c < 3; c++) { let nx = fx, ny = fy, nz = fz;
        if (!cap[t]) { nx = ny = nz = 0; const k = Math.round(P[o + c * 3] * 2e4) + ',' + Math.round(P[o + c * 3 + 1] * 2e4) + ',' + Math.round(P[o + c * 3 + 2] * 2e4);
          for (const u of map.get(k)) { if (cap[u]) continue; const ax = FN[u * 3], ay = FN[u * 3 + 1], az = FN[u * 3 + 2]; if (ax * fx + ay * fy + az * fz < ct) continue; nx += ax * AR[u]; ny += ay * AR[u]; nz += az * AR[u]; }
          const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; } else { nx = fx; ny = fy; nz = fz; } }
        N[o + c * 3] = nx; N[o + c * 3 + 1] = ny; N[o + c * 3 + 2] = nz; } }
    g.setAttribute('normal', new (g.attributes.position.constructor)(N, 3)); return g;
  }
  // one run of letters as solid geometry; `off` > 0 grows the outline by that much (the trim layer)
  function runGeo(TG, F, str, size, depth, bev, cs, off) {
    if (off > 0) return soften(new TG(str, { font: F, size, depth, curveSegments: cs, bevelEnabled: true, bevelThickness: depth * 0.02, bevelSize: size * 0.0005, bevelOffset: off, bevelSegments: 1 }));
    const bt = bev > 0 ? Math.min(depth * 0.42, bev * size) : 0;
    const g = soften(new TG(str, { font: F, size, depth: depth - bt, curveSegments: cs, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: size >= 0.45 ? 2 : 1 }));
    // from far off: the same face and outline, square-fronted and with coarser curves
    return bt > 0 || cs > 3 ? link(g, soften(new TG(str, { font: F, size, depth, curveSegments: Math.min(cs, 3), bevelEnabled: false })), Math.max(0.7 * bt, cs > 3 ? 0.004 * size : 0)) : g;
  }
  // B: the park's builder for this object (B.add puts a geometry in under a material); mats: the park's material table
  function text(b, TG, HEL, mats, B, mat, str0, size, depth, pos, rot, align, col) {
    const g0 = new TG(str0, { font: HEL, size, depth, curveSegments: 3, bevelEnabled: false }); g0.computeBoundingBox(); const bb = g0.boundingBox, t0 = gtris(g0);
    const ax = (bx) => (align === 'center' ? -(bx.max.x + bx.min.x) / 2 : align === 'right' ? -bx.max.x : bb.min.x - bx.min.x);
    if (LOG) ST.log.push('text "' + str0 + '" ' + B.group.name + ' ' + mat.name + ' size ' + size + ' depth ' + depth);
    if (OFF || !window.RPF || !(bb.max.x > bb.min.x)) { g0.translate(align === 'center' ? -(bb.max.x + bb.min.x) / 2 : align === 'right' ? -bb.max.x : 0, 0, 0); cnt('text', t0, t0); return B.add(g0, mat, pos, rot, 1, col); }
    const st = signStyle(str0, depth, B.group.name, size), str = st.tc ? title(str0) : str0; let F = fontOf(HEL, st.f); for (const ch of str) if (!F.data.glyphs[ch]) { F = HEL; break; }   // (a face missing a letter would print "?": the park's own face then)
    const round = /ADV|POP|HCN|HEL/.test(st.f), cs = size >= 0.6 ? (round ? 6 : 5) : size >= 0.25 ? (round ? 5 : 3) : 3, cs2 = round ? 3 : 2;
    // fit: as wide as the old lettering at most, and no more than a tenth taller (script in title case: four tenths)
    const m = new TG(str, { font: F, size, depth: 0.01, curveSegments: 2, bevelEnabled: false }); m.computeBoundingBox(); const mb = m.boundingBox;
    const w0 = bb.max.x - bb.min.x, h0 = bb.max.y - bb.min.y, pad = st.trim ? 1 + 2 * st.trim[1] * size / Math.max(h0, 1e-6) : 1;
    const k = Math.min(w0 / (mb.max.x - mb.min.x), (st.tc ? 1.4 : 1.1) * h0 / (mb.max.y - mb.min.y)) / pad, sz = size * k; let tout = 0;   // (lower case needs the extra height to carry as far)
    const put = (g, m2, dx, dy, dz) => { g.translate(dx, dy, dz); tout += gtris(g); B.add(g, m2, pos, rot, 1, m2 === mat ? col : undefined); };
    // the main run decides the placement (centred where the old text was centred); the trim and the shade follow it
    const main = runGeo(TG, F, str, sz, depth, st.flat ? 0 : st.bev || 0, cs, 0); main.computeBoundingBox(); const nb = main.boundingBox;
    const tx = ax(nb), ty = (bb.max.y + bb.min.y) / 2 - (nb.max.y + nb.min.y) / 2;
    if (!st.bounce || st.flat) {
      put(main, mat, tx, ty, 0);
      if (!st.flat && st.trim && mats[st.trim[0]]) put(runGeo(TG, F, str, sz, depth * 0.5, 0, cs2, st.trim[1] * sz), mats[st.trim[0]], tx, ty, 0);
      if (!st.flat && st.shade && mats[st.shade[0]]) put(runGeo(TG, F, str, sz, depth * 0.4, 0, cs2, 0), mats[st.shade[0]], tx + st.shade[1] * sz, ty + st.shade[2] * sz, 0);
    } else { // letter by letter: each tilts and lifts a little, alternating, about its own middle
      const sc = sz / F.data.resolution, H = hs(str0); let x = 0, i = 0;
      for (const ch of str) { const gl = F.data.glyphs[ch] || F.data.glyphs['?']; if (ch !== ' ') {
          const sgn = (i + (H & 1)) % 2 ? 1 : -1, tilt = sgn * st.bounce[0] * (0.7 + 0.3 * (((H >>> (i % 16)) & 3) / 3)), lift = -sgn * st.bounce[1] * sz * 0.5;
          const mk2 = (depth2, bev, off, dx, dy, m2, c2) => { const g = runGeo(TG, F, ch, sz, depth2, bev, c2 || cs, off); g.computeBoundingBox(); const c = g.boundingBox, cx = (c.max.x + c.min.x) / 2, cy = (c.max.y + c.min.y) / 2; g.translate(-cx, -cy, 0); g.rotateZ(tilt); put(g, m2, cx + x + tx + dx, cy + lift + ty + dy, 0); };
          mk2(depth, st.bev || 0, 0, 0, 0, mat);
          if (st.trim && mats[st.trim[0]]) mk2(depth * 0.5, 0, st.trim[1] * sz, 0, 0, mats[st.trim[0]], cs2);
          if (st.shade && mats[st.shade[0]]) mk2(depth * 0.4, 0, 0, st.shade[1] * sz, st.shade[2] * sz, mats[st.shade[0]], cs2);
          i++; }
        x += gl.ha * sc; }
    }
    cnt('text', t0, tout); return B;
  }
  // one giant free-standing letter (the RADIANT RIVERS marquee): same face and footprint, rounded-over edges, smooth curves
  function letter(TG, HEL, ch, size, depth) {
    if (OFF) return new TG(ch, { font: HEL, size, depth, curveSegments: 3, bevelEnabled: false });
    const bt = Math.min(depth * 0.3, 0.02 * size); return link(soften(new TG(ch, { font: HEL, size, depth: depth - 2 * bt, curveSegments: 8, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: 3 }).translate(0, 0, bt)), new TG(ch, { font: HEL, size, depth, curveSegments: 3, bevelEnabled: false }), Math.max(0.7 * bt, 0.004 * size));
  }
  // ---------------------------------------------------------------- prize plushes
  // The park used to drop two or three balls for each stuffed prize. It now only notes where each one sits (the builder's own object, its
  // place in it, its fabric and size); props.js puts a sculpted, sewn toy there once the models are loaded. mode: 0 a booth shelf,
  // 1 the gift shop and claw machines, 2 the big bears hanging on the prize pole (fb: the park's own bear, for the comparison switch)
  const TOYS = [];
  function toy(B, mat, pos, height, mode, rot, fb, lim) {
    const balls = () => {
      if (mode === 0) { B.sph(mat, 0.11, [pos[0], pos[1] + 0.13, pos[2]], [1, 1.1, 0.9], 6); B.sph(mat, 0.08, [pos[0], pos[1] + 0.3, pos[2]], 1, 6); }
      else if (mode === 1) { B.sph(mat, 0.1, [pos[0], pos[1] + 0.1, pos[2]], [1, 1.1, 0.9], 6); B.sph(mat, 0.075, [pos[0], pos[1] + 0.26, pos[2]], 1, 6); for (const s of [-1, 1]) B.sph(mat, 0.03, [pos[0] + s * 0.06, pos[1] + 0.33, pos[2]], 1, 4); }
      else if (fb) fb(rot); };
    if (OFF) { balls(); return B; }
    // the park's own balls stay as the toy's far level (and stand in if the sculpted models never arrive)
    B.rpFar = 1; try { balls(); } finally { B.rpFar = 0; }
    TOYS.push({ g: B.group, base: B.base ? B.base.clone() : null, mat, pos: pos.slice(), h: height, mode, rot: rot ? rot.slice() : null, lim: lim || 0, i: TOYS.length }); return B;
  }
  window.RPG = { box, cyl, cone, sph, torus, tube, beam, blob, jblob, jfrond, jtrunk, jtuft, jtile, text, letter, toy, toys: TOYS, ico, stats: ST, sidesFor, off: OFF, addM, build, tri: grassTri, quad: quadG, terrain, ground, atmos, grass: GRS, sky: SKYU, wind: WIND, noplant: NOPLANT, novine: NOVINE, offground: OFFGROUND, leafy: () => [...LEAFY], _grassMat: grassMat, _grassGeo: grassGeo, _leafWind: leafWind, _vineStep: (bud) => { const t = performance.now(); vineStep(GRS.root, bud); return { ms: Math.round(performance.now() - t), done: VF.done, stat: ST.vines || null }; }, scallop, bottle, balloon, scrap, bmat, ball, lod: LOD };
})();
