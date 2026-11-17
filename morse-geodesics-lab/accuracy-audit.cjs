'use strict';
// Reproducible, read-only numerical audit. No catalogue is rewritten.
// node morse-geodesics-lab/accuracy-audit.cjs [--limit N] [--json report.json]
// The independent reference shares the analytic surface jet, but neither the
// RK4 update nor projection, velocity normalization, or root count of solver.js.
const fs = require('node:fs');
const Surface = require('./surface.js');
const Solver = require('./solver.js');
const Catalogues = require('./catalogue-data.js');
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const max = values => Math.max(0, ...values);

// Gaussian curvature computed as det(II)/det(I) in an orthonormal tangent
// frame, independently of solver.js's ambient adjugate-Hessian formula.
function geometry(model, y) {
  const p = y.slice(0, 3), v = y.slice(3, 6), jet = model.jet(p);
  const g = jet.gradient, H = jet.hessian, gn = Math.hypot(...g);
  const n = g.map(x => x / gn), r = Math.abs(n[2]) < .8 ? [0, 0, 1] : [1, 0, 0];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const u0 = cross(n, r), un = Math.hypot(...u0), u = u0.map(x => x / un), w = cross(n, u);
  const quadratic = (a, b) => a.reduce((s, x, i) => s + x *
    (H[3*i]*b[0] + H[3*i+1]*b[1] + H[3*i+2]*b[2]), 0);
  const K = (quadratic(u, u)*quadratic(w, w) - quadratic(u, w)**2) / (gn*gn);
  return {g, gn, K, normalAcceleration: -quadratic(v, v)/(gn*gn), value: jet.value};
}

function independentRhs(model, y) {
  const {g, K, normalAcceleration: a} = geometry(model, y);
  const speedSquared = dot(y.slice(3, 6), y.slice(3, 6));
  const k = K * speedSquared, sn = Math.sin(y[8]), cs = Math.cos(y[8]);
  return [y[3], y[4], y[5], a*g[0], a*g[1], a*g[2], y[7], -k*y[6], cs*cs+k*sn*sn];
}

const A = [[], [1/5], [3/40, 9/40], [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]];
const B5 = A[6], B4 = [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40];
function dopriStep(model, y, h, first) {
  const k = [first || independentRhs(model, y)];
  for (let stage = 1; stage < 7; stage++) {
    k.push(independentRhs(model, y.map((x, i) => x + h * A[stage].reduce((s, a, j) => s + a*k[j][i], 0))));
  }
  return {
    y: y.map((x, i) => x + h * B5.reduce((s, b, j) => s + b*k[j][i], 0)),
    error: y.map((_, i) => h * B4.reduce((s, b, j) => s + ((B5[j] || 0)-b)*k[j][i], 0)),
    next: k[6]
  };
}

function hermite(a, b, da, db, h, t) {
  return (2*t*t*t-3*t*t+1)*a + (t*t*t-2*t*t+t)*h*da +
    (-2*t*t*t+3*t*t)*b + (t*t*t-t*t)*h*db;
}
function bracketRoot(a, b, da, db, h) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const t = (lo+hi)/2;
    if (Math.sign(hermite(a, b, da, db, h, t)) === Math.sign(a)) lo = t; else hi = t;
  }
  return (lo+hi)/2;
}

function reference(model, p, theta, targets, tolerance = 1e-14) {
  // A single initial projection agrees on the IVP. Thereafter no projection or
  // speed correction is made, making constraint diagnostics meaningful.
  p = model.project(p);
  const basis = model.tangentBasis(p), v = basis[0].map((x, i) => x*Math.cos(theta)+basis[1][i]*Math.sin(theta));
  let y = [...p, ...v, 0, 1, 0], s = 0, h = .005, first = null;
  let steps = 0, rejected = 0, maxSurface = 0, maxSpeed = 0, maxTangency = 0, sign = 1;
  const samples = [], roots = [], phaseRoots = [];
  for (const target of targets) {
    while (s < target - 4*Number.EPSILON*Math.max(1, target)) {
      h = Math.min(h, target-s, .04);
      const step = dopriStep(model, y, h, first);
      let error = 0;
      for (let i = 0; i < y.length; i++) {
        const scale = tolerance * (1 + Math.max(Math.abs(y[i]), Math.abs(step.y[i])));
        error = Math.max(error, Math.abs(step.error[i])/scale);
      }
      if (error <= 1) {
        const nextSign = Math.sign(step.y[6]) || Math.sign(step.y[7]) || sign;
        if (nextSign !== sign) roots.push(s + h*bracketRoot(y[6], step.y[6], y[7], step.y[7], h));
        const nextPhaseRoot = (phaseRoots.length+1)*Math.PI;
        if (y[8] < nextPhaseRoot && step.y[8] >= nextPhaseRoot) {
          phaseRoots.push(s + h*bracketRoot(y[8]-nextPhaseRoot, step.y[8]-nextPhaseRoot, first?.[8] ?? independentRhs(model,y)[8], step.next[8], h));
        }
        sign = nextSign; s += h; y = step.y; first = step.next; steps++;
        const geom = geometry(model, y);
        maxSurface = Math.max(maxSurface, Math.abs(geom.value)/geom.gn);
        maxSpeed = Math.max(maxSpeed, Math.abs(Math.hypot(...y.slice(3, 6))-1));
        maxTangency = Math.max(maxTangency, Math.abs(dot(geom.g, y.slice(3, 6)))/geom.gn);
      } else rejected++;
      h *= Math.min(4, Math.max(.15, .9*Math.max(error, 1e-15)**(-.2)));
      if (steps+rejected > 200000 || h < 1e-12) throw Error('Independent reference step budget exceeded.');
    }
    s = target;
    samples.push({s, point: y.slice(0, 3), tangent: y.slice(3, 6), j: y[6], jPrime: y[7], phase: y[8]});
  }
  return {samples, conjugateTimes: roots, phaseRoots, steps, rejected,
    error: {surface: maxSurface, speed: maxSpeed, tangency: maxTangency}};
}

function compare(a, b) {
  if (a.samples.length > b.samples.length) [a,b] = [b,a];
  let path = 0, jacobiStateRelative = 0, jAbsolute = 0, jPrimeAbsolute = 0, globalScale = 1;
  let index = 0;
  for (let i = 0; i < a.samples.length; i++) {
    const x = a.samples[i];
    while (index < b.samples.length-1 && b.samples[index].s < x.s-1e-10) index++;
    const y = b.samples[index];
    if (Math.abs(x.s-y.s) > 1e-10) throw Error('Comparison arclength mismatch.');
    path = Math.max(path, distance(x.point, y.point));
    jAbsolute = Math.max(jAbsolute, Math.abs(x.j-y.j));
    jPrimeAbsolute = Math.max(jPrimeAbsolute, Math.abs(x.jPrime-y.jPrime));
    globalScale = Math.max(globalScale, Math.hypot(y.j, y.jPrime));
    jacobiStateRelative = Math.max(jacobiStateRelative,
      Math.hypot(x.j-y.j, x.jPrime-y.jPrime)/
        Math.max(Number.MIN_VALUE, Math.hypot(x.j, x.jPrime), Math.hypot(y.j, y.jPrime)));
  }
  const aEnd = a.samples.at(-1), bEnd = b.samples.at(-1);
  return {path, endpoint: distance(aEnd.point, bEnd.point), jacobiStateRelative,
    jAbsolute, jPrimeAbsolute, jGlobalRelative: jAbsolute/globalScale,
    jPrimeGlobalRelative: jPrimeAbsolute/globalScale,
    rootTime: a.conjugateTimes.length === b.conjugateTimes.length ?
      max(a.conjugateTimes.map((s, i) => Math.abs(s-b.conjugateTimes[i]))) : null,
    rootCountEqual: a.conjugateTimes.length === b.conjugateTimes.length};
}

function analyticChecks() {
  const model = Surface.getModel('torus'), checks = [];
  for (const inner of [false, true]) {
    const radius = model.majorRadius + (inner ? -1 : 1)*model.minorRadius;
    const p = [radius, 0, 0], basis = model.tangentBasis(p), velocity = [0, 1, 0];
    const theta = Math.atan2(dot(velocity, basis[1]), dot(velocity, basis[0]));
    const K = (inner ? -1 : 1)/(model.minorRadius*radius), frequency = Math.sqrt(Math.abs(K)), length = inner ? 8 : 12;
    const targets = Array.from({length: 241}, (_, i) => i*length/240);
    const ref = reference(model, p, theta, targets);
    const exact = {samples: targets.map(s => ({s, point: [radius*Math.cos(s/radius), radius*Math.sin(s/radius), 0],
      j: (inner ? Math.sinh(frequency*s) : Math.sin(frequency*s))/frequency,
      jPrime: inner ? Math.cosh(frequency*s) : Math.cos(frequency*s)})),
      conjugateTimes: inner ? [] : Array.from({length: Math.floor(length*frequency/Math.PI)}, (_, i) => (i+1)*Math.PI/frequency)};
    const rk = Solver.integrate(model, p, theta, length, {steps: 4800, recordStride: 20, record: true});
    checks.push({name: inner ? 'negative-curvature inner equator' : 'positive-curvature outer equator',
      rk4: compare(rk, exact), independent: compare(ref, exact), independentConstraints: ref.error,
      independentRootPhaseDifference: max(ref.conjugateTimes.map((s,i) => Math.abs(s-ref.phaseRoots[i])))});
  }
  return checks;
}

function storedConsistency(curve, result) {
  const byS = new Map(result.samples.map(x => [Math.round(x.s/result.step), x]));
  let path = 0, jRelative = 0, misaligned = 0;
  for (let i = 0; i < curve.jacobi.length; i++) {
    const old = curve.jacobi[i], sample = byS.get(Math.round(old.s/result.step));
    if (!sample || Math.abs(sample.s-old.s) > 1e-10) { misaligned++; continue; }
    path = Math.max(path, distance(curve.points[i], sample.point));
    jRelative = Math.max(jRelative, Math.abs(old.j-sample.j)/Math.max(1,Math.abs(sample.j)));
  }
  return {path, jRelative, misaligned};
}

function run() {
  const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name)+1] : undefined;
  const limit = Number(option('--limit') || Infinity), report = {referenceTolerance: 1e-14, analytic: analyticChecks(), curves: []};
  console.log('Analytic torus checks:', JSON.stringify(report.analytic));
  const started = Date.now();
  for (const [key, catalogue] of Object.entries(Catalogues.catalogues)) {
    const model = Surface.getModel(key.split(':')[0]), p = catalogue.endpoints.p, q = catalogue.endpoints.q;
    for (const curve of catalogue.curves) {
      if (report.curves.length >= limit) break;
      const storedSteps = Math.round(curve.length/curve.integrationStep), steps = Math.round(storedSteps/2);
      if (storedSteps !== 2*steps) throw Error('Stored verification is not a nested doubled grid.');
      // Audit the actual accepted grid and one further halving. Sensitive
      // collars can require more than the ordinary 50k integration budget.
      const stride = Math.max(1, Math.ceil(steps/512));
      const integrate = factor => Solver.integrate(model, p, curve.theta, curve.length,
        {steps: factor*steps, maxSteps:200000, recordStride: factor*stride, record: true});
      const coarse = integrate(1), current = integrate(2), fine = integrate(4);
      const independent = reference(model, p, curve.theta, fine.samples.map(x => x.s));
      const verified = Solver.integrateVerified(model, p, curve.theta, curve.length,
        {steps, maxSteps:200000, recordStride: stride});
      // Reconstruct every original sample without assuming that display sampling
      // used a uniform number of points per trajectory.
      const originalStride = Math.round(curve.jacobi[1].s/curve.integrationStep);
      const original = Solver.integrate(model, p, curve.theta, curve.length,
        {steps: storedSteps, maxSteps:200000, recordStride: originalStride, record: true});
      const row = {key, id: curve.id, length: curve.length, intrinsicIndex: curve.intrinsicIndex,
        coarseStep: coarse.step, currentStep: current.step, fineStep: fine.step,
        coarseToCurrent: compare(coarse, current), currentToFine: compare(current, fine),
        currentToIndependent: compare(current, independent), fineToIndependent: compare(fine, independent),
        verifiedToIndependent: compare(verified, independent), verified: verified.verification,
        verifiedSteps: verified.steps, verifiedRawConstraints: verified.error,
        currentEndpointResidual: distance(current.endpoint, q), independentEndpointResidual: distance(independent.samples.at(-1).point, q),
        stored: storedConsistency(curve, original), independentSteps: independent.steps,
        independentRejectedSteps: independent.rejected, independentConstraints: independent.error,
        independentPhaseRootCountEqual: independent.phaseRoots.length === independent.conjugateTimes.length,
        independentRootPhaseDifference: max(independent.conjugateTimes.map((s,i) => Math.abs(s-independent.phaseRoots[i]))),
        maxJacobi: max(independent.samples.map(x => Math.abs(x.j))),
        indexMatches: current.intrinsicIndex === curve.intrinsicIndex && fine.intrinsicIndex === curve.intrinsicIndex &&
          independent.conjugateTimes.filter(s => s > 16*Number.EPSILON*Math.max(1,curve.length) &&
            s < curve.length-16*Number.EPSILON*Math.max(1,curve.length)).length === curve.intrinsicIndex};
      report.curves.push(row);
      console.log(JSON.stringify(row));
    }
  }
  const worst = (key, field) => report.curves.reduce((a,b) => !a || (b[key]?.[field] ?? -1) > (a[key]?.[field] ?? -1) ? b : a, null);
  report.summary = {count: report.curves.length, seconds: (Date.now()-started)/1000,
    indexMismatches: report.curves.filter(x => !x.indexMatches).map(x => x.id),
    rootCountMismatches: report.curves.filter(x => !x.currentToIndependent.rootCountEqual || !x.independentPhaseRootCountEqual).map(x => x.id),
    worstCurrentPath: worst('currentToIndependent','path'), worstCurrentJacobi: worst('currentToIndependent','jacobiStateRelative'),
    worstCurrentRootTime: worst('currentToIndependent','rootTime'), worstFinePath: worst('fineToIndependent','path'),
    worstFineJacobi: worst('fineToIndependent','jacobiStateRelative'),
    worstVerifiedPath: worst('verifiedToIndependent','path'),
    worstVerifiedJacobi: worst('verifiedToIndependent','jacobiStateRelative'),
    worstVerifiedRootTime: worst('verifiedToIndependent','rootTime'),
    unverified: report.curves.filter(x => !x.verified.converged).map(x => x.id),
    verificationRefinementCounts: report.curves.reduce((counts,x) => {
      counts[x.verified.refinements] = (counts[x.verified.refinements] || 0)+1; return counts;
    }, {}),
    maxIndependentSurfaceDrift: max(report.curves.map(x => x.independentConstraints.surface)),
    maxIndependentSpeedDrift: max(report.curves.map(x => x.independentConstraints.speed)),
    maxIndependentTangencyDrift: max(report.curves.map(x => x.independentConstraints.tangency)),
    maxStoredPathMismatch: max(report.curves.map(x => x.stored.path)),
    maxStoredJacobiMismatch: max(report.curves.map(x => x.stored.jRelative)),
    storedSampleMisalignments: report.curves.reduce((s,x) => s+x.stored.misaligned,0)};
  // The longest unstable IVPs amplify tiny constraint errors. State the
  // reference's own measured tolerance sensitivity instead of treating it as
  // exact or interpreting low-order-looking ratios against an uncertain answer.
  const suspect = report.summary.worstCurrentJacobi;
  if (suspect) {
    const catalogue = Catalogues.catalogues[suspect.key], curve = catalogue.curves.find(x => x.id === suspect.id);
    const model = Surface.getModel(suspect.key.split(':')[0]);
    const targets = Array.from({length: 513}, (_,i) => i*curve.length/512);
    const standard = reference(model, catalogue.endpoints.p, curve.theta, targets);
    const tighter = reference(model, catalogue.endpoints.p, curve.theta, targets, 2e-15);
    report.referenceConvergence = {id: curve.id, comparison: compare(standard,tighter),
      tolerances: [1e-14,2e-15], steps: [standard.steps,tighter.steps]};
  }
  if (option('--json')) fs.writeFileSync(option('--json'), JSON.stringify(report,null,2)+'\n');
  console.log('SUMMARY',JSON.stringify(report.summary));
  return report;
}

module.exports = {reference, compare, analyticChecks, run};
if (require.main === module) run();
