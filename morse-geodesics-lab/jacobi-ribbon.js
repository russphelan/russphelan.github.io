/* Configurable illustrations of the surface Jacobi field.
 * Amplitude mode uses one fixed scale for the whole path: power=1 preserves
 * actual magnitude ratios; smaller powers compress the dynamic range. Focus
 * mode uses j / hypot(j, ell*jPrime) as a separately labelled focusing aid.
 * Neither mode describes finite neighboring geodesics. Both preserve the
 * computed zeros, signs and directions, independently of the travel cursor.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicJacobiRibbon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function profile(data, options = {}) {
    const halfWidth = options.halfWidth ?? .16, power = options.power ?? .5;
    const mode = options.mode ?? 'amplitude';
    // j has units of length and jPrime is its arclength derivative. A fixed
    // ell = .30 surface units sets the visible focusing neighbourhood at a
    // simple zero. It is a display length, independent of the solution's scale.
    const conditioningLength = options.conditioningLength ?? .30;
    if (!data || !Number.isFinite(data.length) || data.length <= 0 ||
        !Array.isArray(data.samples) || typeof data.sampleAt !== 'function') {
      throw new TypeError('A sampled positive-length Jacobi field is required.');
    }
    if (!Number.isFinite(halfWidth) || halfWidth <= 0 || !Number.isFinite(power) || power <= 0 ||
        !Number.isFinite(conditioningLength) || conditioningLength <= 0) {
      throw new RangeError('Ribbon half-width, power, and conditioning length must be finite and positive.');
    }
    if (mode !== 'amplitude' && mode !== 'focus') throw new RangeError('Unknown ribbon scaling mode.');
    const length = data.length, rounding = 16 * Number.EPSILON * Math.max(1, length);
    const events = data.events || [...(data.interiorEvents || []), ...(data.endpointEvents || [])];
    const roots = events.filter(e => e.surface && e.s > 0 && e.s <= length)
      .map(e => e.s).sort((a, b) => a - b)
      .filter((s, i, all) => i === 0 || s - all[i - 1] > rounding);
    const zeros = [0, ...roots];
    const boundaries = [...zeros];
    if (boundaries[boundaries.length - 1] < length) boundaries.push(length);
    const original = data.samples.filter(p => p.s >= 0 && p.s <= length).map(p => ({...p}));
    const add = (s, zero = false) => {
      const sample = data.sampleAt(s);
      if (!Number.isFinite(sample.j) || !Number.isFinite(sample.jPrime)) {
        throw new RangeError('The surface Jacobi field and its derivative must be finite.');
      }
      original.push({...sample, s, ...(zero ? {j: 0} : {})});
    };
    // Endpoint L is a sampling boundary, not necessarily a zero of the field.
    add(0, true); add(length, roots.includes(length));
    for (let i = 0; i < roots.length; i++) {
      const s = roots[i]; add(s, true);
      const left = s - (i === 0 ? 0 : roots[i - 1]);
      const right = (i + 1 < roots.length ? roots[i + 1] : length) - s;
      for (const offset of [.025, .08]) {
        if (left > rounding) add(s - Math.min(offset, left * (offset === .025 ? .15 : .30)));
        if (right > rounding) add(s + Math.min(offset, right * (offset === .025 ? .15 : .30)));
      }
    }
    // A few interior samples also support short lobes and sparse inputs.
    for (let i = 1; i < boundaries.length; i++) {
      const a = boundaries[i - 1], span = boundaries[i] - a;
      for (const fraction of [.25, .5, .75]) add(a + span * fraction);
    }
    original.sort((a, b) => a.s - b.s);
    const samples = [];
    for (const sample of original) {
      if (!Number.isFinite(sample.j) || !Number.isFinite(sample.jPrime)) {
        throw new RangeError('The surface Jacobi field and its derivative must be finite.');
      }
      const last = samples[samples.length - 1];
      if (last && Math.abs(sample.s - last.s) <= rounding) {
        // Prefer explicit root samples over regular samples near a crossing.
        if (sample.j === 0 && zeros.includes(sample.s)) samples[samples.length - 1] = sample;
      } else samples.push(sample);
    }
    // A constant whole-path scale allows an experienced eye to compare growth
    // across successive wraps and zero-separated lobes. The retained fine-grid
    // maximum, if supplied, also avoids dependence on display downsampling.
    let maxAmplitude = Number.isFinite(data.maxSurfaceAmplitude) ? Math.abs(data.maxSurfaceAmplitude) : 0;
    for (const sample of samples) maxAmplitude = Math.max(maxAmplitude, Math.abs(sample.j));
    return samples.map(sample => {
      if (sample.j === 0) return {sample, width: 0};
      // Evaluate normalized widths in log space. Dividing before applying the
      // display power can underflow; the focus aid's ell*jPrime can overflow
      // for finite inputs even when the final width is representable.
      const logJ = Math.log(Math.abs(sample.j));
      let logFraction;
      if (mode === 'amplitude') {
        logFraction = Math.min(0, logJ - Math.log(maxAmplitude));
      } else {
        const logDerivative = sample.jPrime === 0 ? -Infinity :
          Math.log(Math.abs(sample.jPrime)) + Math.log(conditioningLength);
        const largest = Math.max(logJ, logDerivative);
        const logPairNorm = largest + .5 * Math.log(
          Math.exp(2 * (logJ - largest)) + Math.exp(2 * (logDerivative - largest)));
        logFraction = Math.min(0, logJ - logPairNorm);
      }
      const magnitude = Math.min(halfWidth, Math.exp(Math.log(halfWidth) + power * logFraction));
      if (magnitude === 0) {
        // Never silently turn a nonzero field into a displayed conjugate point.
        // No width floor is applied: input outside the representable display
        // range is an error rather than a fabricated zero or minimum amplitude.
        throw new RangeError('The nonzero Jacobi field exceeds the representable ribbon display range.');
      }
      return {sample, width: Math.sign(sample.j) * magnitude};
    });
  }
  return {profile};
});
