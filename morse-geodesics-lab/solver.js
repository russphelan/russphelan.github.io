/* Numerical geodesics of an implicit surface, with endpoint shooting and
 * transverse Jacobi indices. Only converged, step-refined shots are results.
 * Multistart search is a finite search, never a completeness certificate.
 */
(function (root, factory) {
  'use strict';
  const surfaces = typeof module === 'object' && module.exports ?
    require('./surface.js') : root.GeodesicSurface;
  const api = factory(surfaces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (surfaces) {
  'use strict';
  const TAU = 2 * Math.PI;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, b) => a.map(v => v * b);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const distance = (a, b) => norm(sub(a, b));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrap = angle => ((angle % TAU) + TAU) % TAU;
  const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const unit = a => { const n = norm(a); if (!(n > 1e-15)) throw Error('Degenerate tangent.'); return scale(a, 1 / n); };
  const joined = model => (model.genus || model.count || 1) > 1;

  function curvatureFromJet(g, H) {
    const a = H[0], b = H[1], c = H[2], d = H[4], e = H[5], f = H[8];
    const gg = dot(g, g);
    return ((d * f - e * e) * g[0] * g[0] +
      (a * f - c * c) * g[1] * g[1] + (a * d - b * b) * g[2] * g[2] +
      2 * (c * e - b * f) * g[0] * g[1] +
      2 * (b * e - c * d) * g[0] * g[2] +
      2 * (b * c - a * e) * g[1] * g[2]) / (gg * gg);
  }

  function frameAt(model, p, theta) {
    const basis = model.tangentBasis(p), e1 = basis[0], e2 = basis[1];
    const c = Math.cos(theta), s = Math.sin(theta);
    const velocity = unit(e1.map((x, i) => c * x + s * e2[i]));
    const angular = e1.map((x, i) => -s * x + c * e2[i]);
    const orientation = dot(angular, cross(model.normal(p), velocity)) >= 0 ? 1 : -1;
    return {velocity, orientation};
  }

  function rhs(model, y) {
    const p = y.slice(0, 3), v = y.slice(3, 6), jet = model.jet?.(p);
    const g = jet ? jet.gradient : model.gradient(p);
    const H = jet ? jet.hessian : model.hessian(p), gg = dot(g, g);
    if (!(gg > 1e-20)) throw Error('Surface gradient vanishes.');
    const quadratic = v[0] * (H[0] * v[0] + H[1] * v[1] + H[2] * v[2]) +
      v[1] * (H[3] * v[0] + H[4] * v[1] + H[5] * v[2]) +
      v[2] * (H[6] * v[0] + H[7] * v[1] + H[8] * v[2]);
    const a = -quadratic / gg;
    // Reuse the same analytic derivative jet for acceleration and curvature.
    // Joined models need several compact blends, so recomputing it is costly.
    const K = curvatureFromJet(g, H);
    const result = [v[0], v[1], v[2], a * g[0], a * g[1], a * g[2], y[7], -K * y[6]];
    if (!result.every(Number.isFinite)) throw Error('Geodesic integration exceeded numerical range.');
    return result;
  }

  function rk4(model, y, h) {
    const a = rhs(model, y);
    const b = rhs(model, y.map((v, i) => v + h * a[i] / 2));
    const c = rhs(model, y.map((v, i) => v + h * b[i] / 2));
    const d = rhs(model, y.map((v, i) => v + h * c[i]));
    return y.map((v, i) => v + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
  }

  // A scalar cubic Hermite interpolant retains both endpoint derivatives. Root
  // refinement happens on the integration grid, before display downsampling.
  function zeroFraction(a, b, da, db, h) {
    if (a === 0) return 0;
    if (b === 0) return 1;
    let lo = 0, hi = 1;
    for (let k = 0; k < 44; k++) {
      const t = (lo + hi) / 2, t2 = t * t, t3 = t2 * t;
      const value = (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * h * da +
        (-2 * t3 + 3 * t2) * b + (t3 - t2) * h * db;
      if (Math.sign(value) === Math.sign(a)) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }

  function integrate(model, p, theta, length, options = {}) {
    if (!Number.isFinite(theta) || !Number.isFinite(length) || length < 0) {
      throw new RangeError('Finite angle and nonnegative length required.');
    }
    const requestedStep = options.step || 0.025;
    if (!(requestedStep > 0)) throw new RangeError('Integration step must be positive.');
    const steps = options.steps || Math.max(1, Math.ceil(length / requestedStep)), h = length / steps;
    if (!Number.isSafeInteger(steps) || steps < 1) throw new RangeError('Step count must be a positive integer.');
    const maxSteps = options.maxSteps ?? 50000;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 200000) {
      throw new RangeError('Integration step budget must be an integer from 1 to 200000.');
    }
    if (steps > maxSteps) throw Error('Integration step budget exceeded.');
    const initial = model.project(p.slice()), initialFrame = frameAt(model, initial, theta);
    let y = [...initial, ...initialFrame.velocity, 0, 1];
    let maxSurface = 0, maxSpeed = 0, maxDrift = 0, previousSign = 1;
    let maxRawSurface = 0, maxRawSpeed = 0, maxRawTangency = 0;
    const zeros = [], conjugateSamples = [], samples = [], maxSamples = options.maxSamples || 801;
    const stride = options.recordStride || Math.max(1, Math.ceil(steps / (maxSamples - 1)));
    const record = s => samples.push({s, point: y.slice(0, 3), tangent: y.slice(3, 6), j: y[6], jPrime: y[7]});
    if (options.record) record(0);
    for (let i = 1; i <= steps; i++) {
      if (i % 64 === 0 && options.shouldCancel?.()) return null;
      const oldY = y, oldJ = y[6], oldS = (i - 1) * h;
      y = rk4(model, y, h);
      const rawPoint = y.slice(0, 3), v = y.slice(3, 6), rawJet = model.jet?.(rawPoint);
      const rawGradient = rawJet ? rawJet.gradient : model.gradient(rawPoint), rawGradientNorm = norm(rawGradient);
      maxRawSurface = Math.max(maxRawSurface,
        Math.abs(rawJet?.value ?? model.value(rawPoint)) / Math.max(rawGradientNorm, 1e-14));
      maxRawSpeed = Math.max(maxRawSpeed, Math.abs(norm(v) - 1));
      maxRawTangency = Math.max(maxRawTangency, Math.abs(dot(v, rawGradient)) / Math.max(rawGradientNorm, 1e-14));
      const projected = model.project(rawPoint);
      maxDrift = Math.max(maxDrift, distance(rawPoint, projected));
      const projectedJet = model.jet?.(projected);
      const gradient = projectedJet ? projectedJet.gradient : model.gradient(projected), gradientNorm = norm(gradient);
      const n = gradient.map(x => x / gradientNorm), normalVelocity = dot(v, n);
      const tangent = unit(v.map((x, j) => x - normalVelocity * n[j]));
      y.splice(0, 6, ...projected, ...tangent);
      maxSurface = Math.max(maxSurface,
        Math.abs(projectedJet?.value ?? model.value(projected)) / Math.max(gradientNorm, 1e-14));
      maxSpeed = Math.max(maxSpeed, Math.abs(norm(tangent) - 1));
      // At an exact zero the derivative gives the outgoing sign. A magnitude
      // cutoff could postpone the crossing to the next, unbracketed step.
      const nextSign = Math.sign(y[6]) || Math.sign(y[7]) || previousSign;
      if (nextSign !== previousSign) {
        const fraction = zeroFraction(oldJ, y[6], oldY[7], y[7], h);
        const s = oldS + h * fraction;
        zeros.push(s);
        if (options.record) {
          const rootY = rk4(model, oldY, h * fraction), point = model.project(rootY.slice(0, 3));
          const rootN = model.normal(point), rootV = rootY.slice(3, 6);
          const rootT = unit(rootV.map((v, j) => v - dot(rootV, rootN) * rootN[j]));
          conjugateSamples.push({s, point, tangent: rootT, j: 0, jPrime: rootY[7]});
        }
      }
      previousSign = nextSign;
      if (options.record && (i % stride === 0 || i === steps)) record(i * h);
    }
    const endpoint = y.slice(0, 3), tangent = y.slice(3, 6);
    const endpointJacobi = scale(cross(model.normal(endpoint), tangent), y[6] * initialFrame.orientation);
    const endGuard = options.conjugateTolerance || 0.002;
    const nearConjugate = length > endGuard &&
      Math.abs(y[6]) / Math.max(1e-100, Math.hypot(y[6], y[7])) < endGuard;
    // A warning band must not erase a genuine interior event. Endpoint nullity
    // uses a separate rounding guard; nearConjugate still warns of uncertainty.
    const roundingGuard = 16 * Number.EPSILON * Math.max(1, length);
    const intrinsicIndex = zeros.filter(s => s > roundingGuard && s < length - roundingGuard).length;
    return {point: endpoint, endpoint, finalpoint: endpoint, tangent,
      j: y[6], jPrime: y[7], endpointJacobi, intrinsicIndex,
      nearConjugate, conjugateTimes: zeros, conjugateSamples, samples,
      orientation: initialFrame.orientation, step: h, steps, recordStride: stride,
      error: {surface: maxSurface, speed: maxSpeed, projectionDrift: maxDrift,
        rawSurface: maxRawSurface, rawSpeed: maxRawSpeed, rawTangency: maxRawTangency}};
  }

  function compareRefinement(coarse, fine) {
    if (!coarse.samples.length || !fine.samples.length) {
      throw Error('Refinement comparison requires recorded samples.');
    }
    let pathError = 0, jacobiError = 0, fineIndex = 0;
    for (const a of coarse.samples) {
      const guard = 32 * Number.EPSILON * Math.max(1, a.s);
      while (fineIndex < fine.samples.length - 1 && fine.samples[fineIndex].s < a.s - guard) fineIndex++;
      const b = fine.samples[fineIndex];
      if (Math.abs(a.s - b.s) > guard) throw Error('Refinement samples have different arclengths.');
      pathError = Math.max(pathError, distance(a.point, b.point));
      // A field and its derivative cannot vanish together. Their joint norm
      // avoids dividing by j near a root or by one global huge amplitude.
      jacobiError = Math.max(jacobiError,
        Math.hypot(a.j - b.j, a.jPrime - b.jPrime) /
          Math.max(Number.MIN_VALUE, Math.hypot(a.j, a.jPrime), Math.hypot(b.j, b.jPrime)));
    }
    const aRoots = coarse.conjugateTimes, bRoots = fine.conjugateTimes;
    const rootCountEqual = aRoots.length === bRoots.length;
    let rootTimeError = rootCountEqual ? 0 : Infinity;
    if (rootCountEqual) for (let i = 0; i < aRoots.length; i++) {
      rootTimeError = Math.max(rootTimeError, Math.abs(aRoots[i] - bRoots[i]));
    }
    return {pathError, jacobiError, rootTimeError, rootCountEqual,
      indexEqual: coarse.intrinsicIndex === fine.intrinsicIndex};
  }

  // Selectively refine sensitive IVPs. Nested sample locations keep interpolation
  // error out of the integration check. recordStride:1 retains every fine state
  // for callers that also certify their display interpolation.
  function integrateVerified(model, p, theta, length, options = {}) {
    const maxSteps = options.maxSteps ?? 100000, maxRefinements = options.maxRefinements ?? 4;
    if (!Number.isSafeInteger(maxRefinements) || maxRefinements < 1 || maxRefinements > 12) {
      throw new RangeError('Verification refinements must be an integer from 1 to 12.');
    }
    const pathTolerance = options.pathTolerance ?? 5e-7;
    const jacobiTolerance = options.jacobiTolerance ?? 2e-6;
    const rootTolerance = options.rootTolerance ?? 2e-7;
    for (const tolerance of [pathTolerance, jacobiTolerance, rootTolerance]) {
      if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError('Positive finite verification tolerances required.');
    }
    let current = integrate(model, p, theta, length, {...options, maxSteps, record: true});
    if (!current) return null;
    const history = [];
    for (let refinement = 1; refinement <= maxRefinements; refinement++) {
      if (current.steps * 2 > maxSteps) break;
      const fine = integrate(model, p, theta, length, {...options, maxSteps,
        steps: 2 * current.steps, recordStride: options.recordStride === 1 ? 1 : 2 * current.recordStride, record: true});
      if (!fine) return null;
      const comparison = compareRefinement(current, fine);
      history.push({step: fine.step, ...comparison});
      const converged = comparison.pathError <= pathTolerance && comparison.jacobiError <= jacobiTolerance &&
        comparison.rootTimeError <= rootTolerance && comparison.indexEqual;
      current = fine;
      current.verification = {converged, ...comparison, refinements: refinement, history,
        pathTolerance, jacobiTolerance, rootTolerance};
      if (converged) return current;
    }
    if (!current.verification) current.verification = {converged: false, refinements: 0, history,
      pathError: Infinity, jacobiError: Infinity, rootTimeError: Infinity,
      rootCountEqual: false, indexEqual: false, pathTolerance, jacobiTolerance, rootTolerance};
    current.verification.reason = current.steps * 2 > maxSteps ? 'step-budget' : 'refinement-budget';
    return current;
  }

  function normalContribution(length, curvature, tolerance = 0.002) {
    if (!(curvature > 0) || !(length > 0)) return {index: 0, nearConjugate: false};
    const spacing = Math.PI / Math.sqrt(curvature), ratio = length / spacing;
    const nearest = Math.round(ratio);
    const roundingGuard = 16 * Number.EPSILON * Math.max(1, length, nearest * spacing);
    const nearConjugate = nearest > 0 && Math.abs(length - nearest * spacing) <= tolerance + roundingGuard;
    // Count strict interior zeros independently of the warning band. Subtracting
    // that band from L would incorrectly remove an interior zero just beyond it.
    // Only a machine-precision endpoint coincidence removes the endpoint zero.
    const exactEndpoint = Math.abs(ratio - nearest) <= 16 * Number.EPSILON * Math.max(1, ratio);
    const count = Math.max(0, exactEndpoint ? nearest - 1 : Math.floor(ratio));
    return {index: 2 * count, nearConjugate};
  }

  function normalIndex(length, curvature) { return normalContribution(length, curvature).index; }

  function classifyCurve(curve, curvature) {
    const normal = normalContribution(curve.length, curvature);
    return {...curve, normalCurvature: curvature, normalIndex: normal.index,
      index: curve.intrinsicIndex + normal.index,
      nearConjugate: !!curve.intrinsicNearConjugate || normal.nearConjugate};
  }

  function solveShot(model, p, q, theta, length, options = {}) {
    const step = options.step || (joined(model) ? 0.02 : 0.035);
    const tolerance = options.tolerance || 8e-5;
    const minimum = options.minLength || Math.max(0.02, distance(p, q) * 0.98);
    const maximum = options.maxLength || 32;
    const qBasis = model.tangentBasis(q);
    theta = wrap(theta); length = clamp(length, minimum, maximum);
    for (let iteration = 0; iteration < (options.maxIterations || 12); iteration++) {
      if (options.shouldCancel?.()) return null;
      const result = integrate(model, p, theta, length, {step, shouldCancel: options.shouldCancel});
      if (!result) return null;
      const difference = sub(result.endpoint, q), residual = norm(difference);
      if (residual < tolerance) return {theta, length, result, residual, iterations: iteration + 1};
      const a = dot(result.endpointJacobi, qBasis[0]), b = dot(result.tangent, qBasis[0]);
      const c = dot(result.endpointJacobi, qBasis[1]), d = dot(result.tangent, qBasis[1]);
      const f = dot(difference, qBasis[0]), g = dot(difference, qBasis[1]);
      const determinant = a * d - b * c;
      let deltaTheta, deltaLength;
      if (Math.abs(determinant) > 1e-10 * Math.max(1, Math.abs(result.j))) {
        deltaTheta = (-d * f + b * g) / determinant;
        deltaLength = (c * f - a * g) / determinant;
      } else {
        // Damped least squares is also useful far from q's coordinate patch.
        const A = dot(result.endpointJacobi, result.endpointJacobi) + 0.01;
        const B = dot(result.endpointJacobi, result.tangent);
        const D = 1.01, F = -dot(result.endpointJacobi, difference), G = -dot(result.tangent, difference);
        const den = A * D - B * B;
        deltaTheta = (D * F - B * G) / den;
        deltaLength = (A * G - B * F) / den;
      }
      deltaTheta = clamp(deltaTheta, -0.6, 0.6);
      deltaLength = clamp(deltaLength, -3, 3);
      let improved = false;
      for (const damping of [1, 0.5, 0.25, 0.1]) {
        const nextTheta = wrap(theta + damping * deltaTheta);
        const nextLength = clamp(length + damping * deltaLength, minimum, maximum);
        const candidate = integrate(model, p, nextTheta, nextLength, {step, shouldCancel: options.shouldCancel});
        if (!candidate) return null;
        if (distance(candidate.endpoint, q) < residual * (1 - 1e-4 * damping)) {
          theta = nextTheta; length = nextLength; improved = true; break;
        }
      }
      if (!improved) return null;
    }
    return null;
  }

  function shoot(model, p, q, theta, length, options = {}) {
    try {
      const coarse = solveShot(model, p, q, theta, length, options);
      if (!coarse) return null;
      const refinementStep = joined(model) ? 0.005 : 0.01;
      const refined = solveShot(model, p, q, coarse.theta, coarse.length,
        {...options, step: refinementStep, tolerance: 3e-7, maxIterations: 7});
      if (!refined) return null;
      const verification = integrateVerified(model, p, refined.theta, refined.length,
        {step: refinementStep, record: true, maxSamples: options.maxSamples || 701,
          shouldCancel: options.shouldCancel});
      if (!verification || !verification.verification.converged) return null;
      const residual = distance(verification.endpoint, q);
      const refinementError = verification.verification.pathError;
      if (residual > 2e-5 || refinementError > 2e-5 || verification.error.surface > 1e-7 ||
          verification.error.rawSpeed > 1e-7 || verification.error.rawTangency > 1e-7 ||
          verification.error.rawSurface > 1e-7 || verification.error.projectionDrift > 1e-5) return null;
      if (verification.intrinsicIndex !== refined.result.intrinsicIndex &&
          !verification.nearConjugate && !refined.result.nearConjugate) return null;
      const curve = {theta: refined.theta, length: refined.length,
        intrinsicIndex: verification.intrinsicIndex,
        intrinsicNearConjugate: verification.nearConjugate || refined.result.nearConjugate,
        points: verification.samples.map(sample => sample.point),
        jacobi: verification.samples.map(({s, j, jPrime, tangent}) => ({s, j, jPrime, tangent})),
        conjugateTimes: verification.conjugateTimes,
        conjugateSamples: verification.conjugateSamples,
        jacobiOrientation: verification.orientation,
        residual, refinementError, maxSurfaceError: verification.error.surface,
        maxSpeedError: verification.error.speed, projectionDrift: verification.error.projectionDrift,
        rawSurfaceError: verification.error.rawSurface, rawSpeedError: verification.error.rawSpeed,
        rawTangencyError: verification.error.rawTangency, verification: verification.verification,
        integrationStep: verification.step,
        geometryVersion: model.geometryVersion || model.id};
      return classifyCurve(curve, options.normalCurvature ?? 0.36);
    } catch (error) {
      if (options.throwOnError) throw error;
      return null;
    }
  }

  const witnessCache = new WeakMap();
  function pathWitness(curve) {
    const valid = points => Array.isArray(points) && points.length === 17 &&
      points.every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
    if (valid(curve.pathWitness)) return curve.pathWitness;
    if (!Array.isArray(curve.points) || curve.points.length < 2 || !(curve.length > 0)) return null;
    const cached = witnessCache.get(curve);
    if (cached?.points === curve.points && cached.jacobi === curve.jacobi && cached.length === curve.length) return cached.witness;
    const points = curve.points, samples = curve.jacobi;
    const arclength = Array.isArray(samples) && samples.length === points.length && samples.every((p,i) =>
      Number.isFinite(p.s) && (i === 0 || p.s > samples[i-1].s));
    const stations = arclength ? samples.map(p => p.s / curve.length) : points.map((_,i) => i / (points.length-1));
    const witness = []; let j = 1;
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      while (j < points.length-1 && stations[j] < t) j++;
      const a = points[j-1], b = points[j], f = clamp((t-stations[j-1])/(stations[j]-stations[j-1]),0,1);
      witness.push(a.map((v,i) => v + f*(b[i]-v)));
    }
    if (!valid(witness)) return null;
    witnessCache.set(curve,{points:curve.points,jacobi:curve.jacobi,length:curve.length,witness});
    return witness;
  }

  // Nearby shooting angles are only a candidate bucket. A long sensitive
  // geodesic can separate far from its reflected partner despite a tiny initial
  // angular difference. Compare the paths before declaring them duplicates.
  function duplicate(a, b) {
    if (!(angleDistance(a.theta, b.theta) < 0.004 && Math.abs(a.length - b.length) < 0.015)) return false;
    const first = pathWitness(a), second = pathWitness(b);
    return !first || !second || first.every((p,i) => distance(p,second[i]) <= 0.03);
  }

  function searchSeed(curve) {
    const witness = pathWitness(curve);
    return {theta:curve.theta,length:curve.length,...(witness?{pathWitness:witness.map(p=>p.slice())}:{})};
  }

  async function search(options = {}, onCurve = () => {}, onProgress = () => {}, shouldCancel = () => false) {
    if (options.startSeed !== undefined && (!Number.isSafeInteger(options.startSeed) || options.startSeed < 0))
      throw new RangeError('Search startSeed must be a nonnegative integer.');
    if (options.maxAttempts !== undefined && (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 0))
      throw new RangeError('Search maxAttempts must be a nonnegative integer.');
    const surface = options.surface || 'torus', endpointPreset = options.endpointPreset || 'default';
    const model = surfaces.getModel(surface), endpoints = model.endpoints[endpointPreset];
    if (!endpoints) throw Error('Unknown endpoint preset.');
    const {p, q} = endpoints;
    const maximum = options.maxLength || model.searchMaxLength ||
      ((model.genus || model.count || 1) >= 3 ? 42 : 32);
    const quality = options.quality === 'extended' ? 'extended' : 'standard';
    const count = quality === 'extended' ? 44 : 28;
    const round = Math.max(0, options.round || 0), offset = (round * 0.3819660112501051) % 1;
    const d = distance(p, q), first = Math.min(maximum, d * 1.08 + 0.15);
    const lengths = [first, d + 3, d + 6, d + 10, d + 16, maximum * 0.94];
    if (quality === 'extended') lengths.push(d + 13, maximum * 0.76);
    const validLengths = [...new Set(lengths.map(x => Math.round(clamp(x, first, maximum) * 100) / 100))];
    const basis = model.tangentBasis(p), toward = sub(q, p);
    const preferred = Math.atan2(dot(toward, basis[1]), dot(toward, basis[0]));
    const seeds = [];
    for (const angle of [preferred, preferred + 0.3, preferred - 0.3, preferred + Math.PI]) {
      seeds.push([angle + offset * 0.3, first]);
    }
    for (const length of validLengths) for (let i = 0; i < count; i++) {
      seeds.push([TAU * ((i / count + offset) % 1), length]);
    }
    const known = (options.existing || []).filter(c => Number.isFinite(c.theta) && Number.isFinite(c.length)).slice();
    const curves = [], maxCurves = options.maxCurves || 48;
    const startSeed = Math.min(options.startSeed || 0, seeds.length);
    const maxAttempts = options.maxAttempts ?? Infinity;
    let completed = startSeed, stopReason = 'complete';
    const snapshot = reason => ({completed, nextSeed: completed, startSeed, total: seeds.length,
      attempted: completed - startSeed, accepted: curves.length, percent: 100 * completed / seeds.length,
      round, quality, ...(reason ? {stopReason: reason} : {})});
    const progress = reason => onProgress(snapshot(reason));
    progress();
    while (completed < seeds.length) {
      if (shouldCancel()) { stopReason = 'cancelled'; break; }
      if (completed - startSeed >= maxAttempts) { stopReason = 'attempt-limit'; break; }
      const [theta, length] = seeds[completed];
      const curve = shoot(model, p, q, theta, length, {maxLength: maximum,
        step: joined(model) ? 0.02 : 0.035,
        normalCurvature: options.normalCurvature ?? 0.36, shouldCancel});
      // Cancellation inside an integration can leave this attempt unfinished.
      // Keep its cursor unchanged so a resumed search will try it again.
      if (shouldCancel()) { stopReason = 'cancelled'; break; }
      completed++;
      if (curve && !known.some(other => duplicate(curve, other))) {
        curve.surface = surface; curve.endpointPreset = endpointPreset;
        curve.id = `${surface}-${endpointPreset}-${Math.round(curve.theta * 1e6)}-${Math.round(curve.length * 1e5)}`;
        known.push(curve); curves.push(curve); onCurve(curve);
      }
      progress();
      if (curves.length >= maxCurves && completed < seeds.length) { stopReason = 'curve-limit'; break; }
      // Yield after every attempt: worker cancellation and main-thread fallback
      // stay responsive even when many seeds fail to converge.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    Object.defineProperty(curves, 'searchProgress', {value: Object.freeze(snapshot(stopReason))});
    progress(stopReason);
    return curves;
  }

  return Object.freeze({solverVersion: 'verified-search-v2', integrate, integrateVerified, compareRefinement, shoot, search, normalContribution, normalIndex,
    classifyCurve, angleDistance, duplicate, searchSeed});
});
