/* Surface-following tessellation of an illustrative Jacobi ribbon.
 * Projected boundary vertices alone are insufficient: a wide flat triangle can
 * cut through a convex surface. Include the centerline and refine both mesh
 * directions until edge/face probes retain positive clearance from the smooth
 * defining surface. This changes the drawing mesh, never the Jacobi solution.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicJacobiRibbonMesh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const unit = a => { const n = Math.hypot(...a); if (!(n > 1e-14)) throw Error('Degenerate ribbon tangent.'); return a.map(x => x / n); };
  const midpoint = (a, b) => mix(a, b, .5);

  function build(model, profile, orientation = 1, options = {}) {
    // Leave room for the displayed surface's own triangulation error (its
    // concave collar facets can sit about .005 outside the smooth surface).
    const lift = options.lift ?? .012, clearance = options.clearance ?? .007;
    const maxSegments = options.maxSegments ?? 64, maxTriangles = options.maxTriangles ?? 250000;
    const maxRefinements = options.maxRefinements ?? 10;
    if (!(lift > 0 && clearance > 0 && clearance < lift) || ![lift, clearance].every(Number.isFinite) ||
        !Number.isInteger(maxSegments) || maxSegments < 4 || maxSegments > 128 ||
        !Number.isInteger(maxTriangles) || maxTriangles < 1 || !Number.isInteger(maxRefinements) || maxRefinements < 1) {
      throw new RangeError('Invalid ribbon mesh clearance or refinement budget.');
    }
    if (orientation !== 1 && orientation !== -1) throw new RangeError('Ribbon orientation must be +1 or −1.');
    if (!Array.isArray(profile) || profile.length < 2) throw new TypeError('A ribbon needs at least two ordered profile samples.');
    let rows = profile.map((p, i) => {
      if (!Number.isFinite(p.width) || !Number.isFinite(p.sample?.s) ||
          p.sample.point?.length !== 3 || p.sample.tangent?.length !== 3 ||
          ![...p.sample.point, ...p.sample.tangent].every(Number.isFinite) || i && p.sample.s <= profile[i - 1].sample.s) {
        throw new TypeError('Ribbon profile samples must be finite and strictly ordered.');
      }
      return p;
    });
    const signedDistance = p => {
      const jet = model.jet?.(p), value = jet ? jet.value : model.value(p);
      const gradient = jet ? jet.gradient : model.gradient(p);
      return value / Math.max(1e-14, Math.hypot(...gradient));
    };
    const clear = p => signedDistance(p) >= clearance;
    function ring(row, segments) {
      const normal = model.normal(row.sample.point), direction = unit(cross(normal, row.sample.tangent));
      return Array.from({length: segments + 1}, (_, i) => {
        const side = 2 * i / segments - 1;
        const point = model.project(row.sample.point.map((x, k) => x + side * row.width * orientation * direction[k]));
        const n = model.normal(point);
        return {p: point.map((x, k) => x + lift * n[k]), n};
      });
    }
    function halfway(a, b) {
      const h = b.sample.s - a.sample.s;
      // The center curve uses a Hermite midpoint; width is the existing strip's
      // linear interpolation. Exact root rows are retained and never moved.
      const raw = a.sample.point.map((x, k) => .5 * (x + b.sample.point[k]) + h * (a.sample.tangent[k] - b.sample.tangent[k]) / 8);
      const point = model.project(raw), n = model.normal(point);
      const v = a.sample.point.map((x, k) => 1.5 * (b.sample.point[k] - x) / h - .25 * (a.sample.tangent[k] + b.sample.tangent[k]));
      const normalPart = dot(v, n), tangent = unit(v.map((x, k) => x - normalPart * n[k]));
      return {sample: {s: (a.sample.s + b.sample.s) / 2, point, tangent}, width: (a.width + b.width) / 2};
    }
    const centroid = (a, b, c) => a.p.map((x, k) => (x + b.p[k] + c.p[k]) / 3);
    let segments = 4, rings, refinements = 0;
    while (true) {
      if (2 * segments * (rows.length - 1) > maxTriangles) throw Error('Ribbon mesh triangle budget exceeded.');
      rings = rows.map(row => ring(row, segments));
      // All rows share the transverse grid. Independent per-face subdivisions
      // would introduce T-junction cracks exactly where the surface bends most.
      const crossClear = rings.every(r => r.every((v, i) => !i || clear(midpoint(r[i - 1].p, v.p))));
      if (!crossClear) {
        if (segments * 2 > maxSegments) throw Error('Ribbon cross-section refinement budget exceeded.');
        segments *= 2;
        continue;
      }
      const split = [];
      for (let i = 1; i < rings.length; i++) {
        // Transverse edges were checked above. Test each longitudinal edge
        // once, then each diagonal and face center; shared edges do not need
        // duplicate analytic derivative evaluations for the adjacent faces.
        let safe = rings[i].every((v, j) => clear(midpoint(rings[i - 1][j].p, v.p)));
        for (let j = 0; j < segments && safe; j++) {
          safe = clear(midpoint(rings[i - 1][j].p, rings[i][j + 1].p)) &&
            clear(centroid(rings[i - 1][j], rings[i][j], rings[i][j + 1])) &&
            clear(centroid(rings[i - 1][j], rings[i][j + 1], rings[i - 1][j + 1]));
        }
        if (!safe) split.push(i);
      }
      if (!split.length) break;
      if (++refinements > maxRefinements) throw Error('Ribbon longitudinal refinement budget exceeded.');
      const indices = new Set(split), refined = [rows[0]];
      for (let i = 1; i < rows.length; i++) {
        if (indices.has(i)) refined.push(halfway(rows[i - 1], rows[i]));
        refined.push(rows[i]);
      }
      rows = refined;
    }
    const positions = [], normals = [], edges = [], edgeNormals = [];
    const triangle = (a, b, c) => {
      if (dot(cross(sub(b.p, a.p), sub(c.p, a.p)), a.n.map((x, k) => x + b.n[k] + c.n[k])) < 0) [b, c] = [c, b];
      for (const v of [a, b, c]) { positions.push(...v.p); normals.push(...v.n); }
    };
    for (let i = 1; i < rings.length; i++) {
      for (let j = 0; j < segments; j++) {
        triangle(rings[i - 1][j], rings[i][j], rings[i][j + 1]);
        triangle(rings[i - 1][j], rings[i][j + 1], rings[i - 1][j + 1]);
      }
      // Keep the two old interior guide lines without displaying every new
      // tessellation edge as visual clutter.
      for (const j of [0, segments / 4, 3 * segments / 4, segments]) for (const r of [i - 1, i]) {
        edges.push(...rings[r][j].p); edgeNormals.push(...rings[r][j].n);
      }
    }
    return {positions: new Float32Array(positions), normals: new Float32Array(normals),
      edges: new Float32Array(edges), edgeNormals: new Float32Array(edgeNormals), rings, rows,
      diagnostics: {segments, rows: rows.length, originalRows: profile.length, refinements,
        triangles: positions.length / 9, lift, clearance}};
  }
  return {build};
});
