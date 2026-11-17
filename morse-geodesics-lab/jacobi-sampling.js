/* Error-checked Hermite output for an already integrated geodesic and field.
 * Keep extra knots where curvature changes quickly; rendering elsewhere can
 * use fewer samples without weakening the integration's accuracy checks.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicJacobiSampling = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function hermite(a, b, da, db, h, t) {
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * h * da +
      (-2 * t3 + 3 * t2) * b + (t3 - t2) * h * db;
  }
  function derivative(a, b, da, db, h, t) {
    const t2 = t * t;
    return ((6 * t2 - 6 * t) * a + (3 * t2 - 4 * t + 1) * h * da +
      (-6 * t2 + 6 * t) * b + (3 * t2 - 2 * t) * h * db) / h;
  }
  // Count roots of the interpolant on the OPEN interval, including an
  // artificial tangency. Checking the cubic's extrema avoids missing a pair
  // of invented zeros between two positive fine-grid values.
  function rootsBetween(a, b) {
    const h = b.s - a.s, scale = Math.max(Math.abs(a.j), Math.abs(b.j),
      Math.abs(h * a.jPrime), Math.abs(h * b.jPrime));
    if (!(scale > 0)) return Infinity;
    const x = a.j / scale, y = b.j / scale, dx = h * a.jPrime / scale, dy = h * b.jPrime / scale;
    const A = 2 * x - 2 * y + dx + dy, B = -3 * x + 3 * y - 2 * dx - dy, C = dx;
    const cuts = [0, 1], add = t => { if (t > 0 && t < 1 && Number.isFinite(t)) cuts.push(t); };
    if (Math.abs(A) < 1e-15) {
      if (B !== 0) add(-C / (2 * B));
    } else {
      const discriminant = B * B - 3 * A * C;
      if (discriminant >= 0) {
        const q = -B - (B < 0 ? -1 : 1) * Math.sqrt(discriminant);
        add(q / (3 * A));
        if (q !== 0) add(C / q);
      }
    }
    cuts.sort((p, q) => p - q);
    let count = 0, previous = x;
    for (let i = 1; i < cuts.length; i++) {
      const t = cuts[i], value = t === 1 ? y : ((A * t + B) * t + C) * t + x;
      if (previous !== 0 && value !== 0 && Math.sign(previous) !== Math.sign(value)) count++;
      if (value === 0 && t < 1) count++;
      previous = value;
    }
    return count;
  }
  function compress(dense, options = {}) {
    const pathTolerance = options.pathTolerance ?? 1e-7;
    const jacobiTolerance = options.jacobiTolerance ?? 1e-6;
    const maxSpacing = options.maxSpacing ?? .06;
    if (![pathTolerance, jacobiTolerance, maxSpacing].every(x => Number.isFinite(x) && x > 0)) {
      throw new RangeError('Positive finite sampling tolerances are required.');
    }
    if (!Array.isArray(dense) || dense.length < 2) throw new TypeError('At least two fine-grid samples are required.');
    const crossings = [0];
    let previousSign = Math.sign(dense[0].j);
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i];
      if (![p.s, p.j, p.jPrime, ...p.point, ...p.tangent].every(Number.isFinite) ||
          p.point.length !== 3 || p.tangent.length !== 3 || i && p.s <= dense[i - 1].s) {
        throw new TypeError('Fine-grid samples must be finite and strictly ordered.');
      }
      if (i) {
        const sign = Math.sign(p.j);
        crossings[i] = crossings[i - 1] + (sign && previousSign && sign !== previousSign ? 1 : 0);
        if (sign) previousSign = sign;
      }
    }
    const keep = new Set([0, dense.length - 1]), pending = [[0, dense.length - 1]];
    let maxPathError = 0, maxJacobiError = 0;
    while (pending.length) {
      const [lo, hi] = pending.pop(), a = dense[lo], b = dense[hi], h = b.s - a.s;
      if (hi === lo + 1) continue;
      let split = (lo + hi) >> 1, worst = 0, pathError = 0, jacobiError = 0;
      // Split long intervals before doing expensive interpolation comparisons.
      let refine = h > maxSpacing;
      if (!refine) {
        for (let i = lo + 1; i < hi; i++) {
          const p = dense[i], t = (p.s - a.s) / h;
          const j = hermite(a.j, b.j, a.jPrime, b.jPrime, h, t);
          const dj = derivative(a.j, b.j, a.jPrime, b.jPrime, h, t);
          const stateScale = Math.max(Math.hypot(p.j, p.jPrime), Math.hypot(j, dj), Number.MIN_VALUE);
          const fieldError = Math.hypot((j - p.j) / stateScale, (dj - p.jPrime) / stateScale);
          const d0 = hermite(a.point[0], b.point[0], a.tangent[0], b.tangent[0], h, t) - p.point[0];
          const d1 = hermite(a.point[1], b.point[1], a.tangent[1], b.tangent[1], h, t) - p.point[1];
          const d2 = hermite(a.point[2], b.point[2], a.tangent[2], b.tangent[2], h, t) - p.point[2];
          const positionError = Math.hypot(d0, d1, d2);
          pathError = Math.max(pathError, positionError); jacobiError = Math.max(jacobiError, fieldError);
          const score = Math.max(positionError / pathTolerance, fieldError / jacobiTolerance);
          if (score > worst) { worst = score; split = i; }
        }
        refine = worst > 1 || rootsBetween(a, b) !== crossings[hi] - crossings[lo];
      }
      if (refine) {
        keep.add(split); pending.push([lo, split], [split, hi]);
      } else {
        maxPathError = Math.max(maxPathError, pathError); maxJacobiError = Math.max(maxJacobiError, jacobiError);
      }
    }
    const samples = [...keep].sort((a, b) => a - b).map(i => dense[i]);
    return {samples, diagnostics: {version: 1, denseSamples: dense.length, retainedSamples: samples.length,
      pathTolerance, jacobiTolerance, maxSpacing, pathError: maxPathError, jacobiError: maxJacobiError}};
  }
  return {compress, hermite, derivative, rootsBetween};
});
