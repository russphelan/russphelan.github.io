/* Transverse Jacobi data for the chosen four-dimensional tube metric.
 * Event locations come from the solver's integration grid, never from the
 * projected picture. Display gains can be fixed per mode without moving zeros.
 */
(function (root, factory) {
  'use strict';
  const solver = typeof module === 'object' && module.exports ? require('./solver.js') : root.GeodesicSolver;
  const sampling = typeof module === 'object' && module.exports ? require('./jacobi-sampling.js') : root.GeodesicJacobiSampling;
  const api = factory(solver, sampling);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicJacobi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (solver, sampling) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const n = Math.hypot(...a); return a.map(x => x / (n || 1)); };
  function hiddenValue(s, c) {
    if (c > 0) return Math.sin(Math.sqrt(c) * s) / Math.sqrt(c);
    if (c < 0) return Math.sinh(Math.sqrt(-c) * s) / Math.sqrt(-c);
    return s;
  }
  function hiddenDerivative(s, c) {
    return c > 0 ? Math.cos(Math.sqrt(c) * s) : c < 0 ? Math.cosh(Math.sqrt(-c) * s) : 1;
  }
  const hermite = sampling.hermite, hermiteDerivative = sampling.derivative;

  function prepare(curve, model, curvature = .36) {
    const length = curve.length;
    if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(curvature)) {
      throw new RangeError('Finite positive curve length and finite normal curvature required.');
    }
    // Catalogue samples are a drawing mesh, not dense numerical output. Even
    // newer shots may have thinned their fields for transport from the worker.
    // Verify the selected IVP on nested grids, retain its full fine grid only
    // temporarily, then keep additional Hermite knots wherever they are needed.
    // The app caches this preparation once per curve.
    if (!Number.isFinite(curve.theta) || !curve.points?.[0]) throw Error('Missing initial geodesic data.');
    const recorded = solver.integrateVerified(model, curve.points[0], curve.theta, length,
      {step: .005, recordStride: 1, maxSamples: 100001});
    if (!recorded?.verification.converged) throw Error('The geodesic and Jacobi field did not converge within the integration budget.');
    const output = sampling.compress(recorded.samples);
    let orientation = recorded.orientation;
    if (orientation !== 1 && orientation !== -1) {
      const basis = model.tangentBasis(recorded.samples[0].point), theta = curve.theta || 0;
      const angular = basis[0].map((x, i) => -Math.sin(theta) * x + Math.cos(theta) * basis[1][i]);
      orientation = dot(angular, cross(model.normal(recorded.samples[0].point), recorded.samples[0].tangent)) >= 0 ? 1 : -1;
    }
    const step = recorded.step || .0025;
    // Coincidences are numerical: use only an integration-scale root tolerance,
    // not the much wider endpoint warning band used by the catalogue filter.
    const eventTolerance = Math.max(1e-8, 4 * recorded.verification.rootTimeError,
      16 * step ** 4, 128 * Number.EPSILON * Math.max(1, length));
    const raw = [];
    for (const s of recorded.conjugateTimes) if (s > eventTolerance && s <= length + eventTolerance) {
      raw.push({s: Math.abs(s - length) <= eventTolerance ? length : s, surface: true, hidden: false});
    }
    const last = recorded.samples[recorded.samples.length - 1];
    // An endpoint zero need not change sign before integration stops.
    if (Math.abs(last.j) / Math.max(1e-100, Math.hypot(last.j, last.jPrime)) <= eventTolerance &&
        !raw.some(e => Math.abs(e.s - length) <= eventTolerance)) {
      raw.push({s: length, surface: true, hidden: false});
    }
    if (curvature > 0) {
      const spacing = Math.PI / Math.sqrt(curvature);
      for (let n = 1; n * spacing <= length + eventTolerance; n++) {
        const s = n * spacing;
        // Analytic normal endpoint coincidences need only rounding tolerance.
        const rounding = 64 * Number.EPSILON * Math.max(1, length, s);
        if (s > length + rounding) continue;
        raw.push({s: Math.abs(s - length) <= rounding ? length : s, surface: false, hidden: true});
      }
    }
    raw.sort((a, b) => a.s - b.s);
    const events = [];
    for (const e of raw) {
      const previous = events[events.length - 1];
      if (previous && Math.abs(previous.s - e.s) <= eventTolerance &&
          !((previous.s === length) !== (e.s === length))) {
        previous.surface ||= e.surface;
        previous.hidden ||= e.hidden;
        // Keep an analytic hidden location when a surface root coincides.
        if (e.hidden) previous.s = e.s;
      } else events.push({...e});
    }
    for (const e of events) {
      e.multiplicity = (e.surface ? 1 : 0) + (e.hidden ? 2 : 0);
      e.endpoint = e.s === length;
    }
    const interiorEvents = events.filter(e => !e.endpoint), endpointEvents = events.filter(e => e.endpoint);
    const samples = output.samples.map(p => ({...p, point: p.point.slice(), tangent: p.tangent.slice()}));
    // Explicit zero samples keep the rendered ribbon pinched at the refined
    // roots even when the regular display grid straddles a narrow oscillation.
    samples.push(...(recorded.conjugateSamples || []).map(p => ({...p, point: p.point.slice(), tangent: p.tangent.slice()})));
    samples.sort((a, b) => a.s - b.s);
    for (let i = samples.length - 1; i > 0; i--) {
      if (Math.abs(samples[i].s - samples[i - 1].s) < 1e-13) {
        if (samples[i].j === 0) samples[i - 1] = samples[i];
        samples.splice(i, 1);
      }
    }
    function sampleAt(position) {
      const s = clamp(position, 0, length);
      let lo = 0, hi = samples.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].s <= s) lo = mid; else hi = mid; }
      const a = samples[lo], b = samples[hi], h = b.s - a.s, t = h > 0 ? (s - a.s) / h : 0;
      const point = model.project(a.point.map((x, i) => hermite(x, b.point[i], a.tangent[i], b.tangent[i], h, t)));
      const velocity = a.point.map((x, i) => hermiteDerivative(x, b.point[i], a.tangent[i], b.tangent[i], h, t));
      const normal = model.normal(point), normalPart = dot(velocity, normal);
      const tangent = unit(velocity.map((x, i) => x - normalPart * normal[i]));
      return {s, point, tangent, j: hermite(a.j, b.j, a.jPrime, b.jPrime, h, t),
        jPrime: hermiteDerivative(a.j, b.j, a.jPrime, b.jPrime, h, t),
        hidden: hiddenValue(s, curvature), hiddenPrime: hiddenDerivative(s, curvature)};
    }
    let maxSurfaceAmplitude = 1e-12;
    for (const p of recorded.samples) maxSurfaceAmplitude = Math.max(maxSurfaceAmplitude, Math.abs(p.j));
    const maxHiddenAmplitude = curvature > 0 && length >= Math.PI / (2 * Math.sqrt(curvature)) ?
      1 / Math.sqrt(curvature) : Math.max(1e-12, Math.abs(hiddenValue(length, curvature)));
    return {length, curvature, orientation, samples, events, interiorEvents, endpointEvents,
      index: interiorEvents.reduce((sum, e) => sum + e.multiplicity, 0),
      nullity: endpointEvents.reduce((sum, e) => sum + e.multiplicity, 0),
      maxSurfaceAmplitude, maxHiddenAmplitude, eventTolerance, sampleAt,
      verification: recorded.verification, sampling: output.diagnostics, integrationError: recorded.error,
      endpoint: recorded.endpoint, integrationStep: recorded.step,
      // Strict inequality is intentional: a conjugate point at the moving
      // endpoint is nullity there and contributes index only after passing it.
      countBefore: position => {
        const s = clamp(position, 0, length);
        const rounding = 16 * Number.EPSILON * Math.max(1, length, s);
        return interiorEvents.reduce((sum, e) => sum + (e.s < s - rounding ? e.multiplicity : 0), 0);
      }};
  }
  return {prepare, hiddenValue};
});
