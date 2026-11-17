/* Theorem B lower bounds for connected sums of S² × S².
 * The degree bound counts ambient index-N geodesics under the experiment's
 * fixed-endpoint Morse nondegeneracy assumptions. Summing degrees gives the
 * corresponding bound for the index ≤ N filter, not a count of found curves.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicTheorem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bounds(k, degree) {
    if (!Number.isSafeInteger(k) || k < 1 || !Number.isSafeInteger(degree) || degree < 0) {
      throw new RangeError('A positive integer summand count and a nonnegative integer degree are required.');
    }
    // The connected-sum theorem does not apply to the one-summand preview.
    if (k === 1) return {applicable: false, degree: null, cumulative: null};
    if (degree === 0) return {applicable: true, degree: 1n, cumulative: 1n};

    const coefficient = 2n * BigInt(k), ratio = 2n * (BigInt(k) - 1n);
    const exactDegree = coefficient * ratio ** BigInt(degree - 1);
    const cumulative = 1n + (exactDegree * ratio - coefficient) / (ratio - 1n);
    return {applicable: true, degree: exactDegree, cumulative};
  }

  return {bounds};
});
