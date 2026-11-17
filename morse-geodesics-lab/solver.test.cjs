'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./surface.js');
const G = require('./solver.js');
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('outer equator follows its analytic torus geodesic with conserved speed', () => {
  const m = S.getModel('torus'), R = m.majorRadius, r = m.minorRadius;
  const p = m.point(0, 0), basis = m.tangentBasis(p);
  const theta = Math.atan2(basis[1][1], basis[0][1]);
  const length = 8.2, result = G.integrate(m, p, theta, length, {step: .01, record: true});
  const expected = [(R + r) * Math.cos(length / (R + r)),
    (R + r) * Math.sin(length / (R + r)), 0];
  assert.ok(distance(result.endpoint, expected) < 1e-7);
  assert.ok(result.error.surface < 1e-10);
  assert.ok(result.error.speed < 1e-12);
  const K = 1 / (r * (R + r));
  assert.equal(result.intrinsicIndex, Math.floor(length * Math.sqrt(K) / Math.PI));
  assert.ok(Math.abs(result.j - Math.sin(Math.sqrt(K) * length) / Math.sqrt(K)) < 1e-6);
});

test('joined surfaces retain analytic round-torus geodesics and their index away from collars', () => {
  for (const id of ['double', 'triple']) {
    const m = S.getModel(id), radius = m.majorRadius + m.minorRadius;
    const center = m.centers[0], p = [center, radius, 0];
    const velocity = [-1, 0, 0], basis = m.tangentBasis(p);
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const theta = Math.atan2(dot(velocity, basis[1]), dot(velocity, basis[0]));
    // The unmodified left half of the first torus stays away from every neck.
    const length = 4.2, angle = Math.PI / 2 + length / radius;
    const result = G.integrate(m, p, theta, length, {step: .006});
    assert.ok(distance(result.endpoint, [center + radius * Math.cos(angle),
      radius * Math.sin(angle), 0]) < 2e-7, id + ' must retain the exact round arc.');
    const frequency = Math.sqrt(1 / (m.minorRadius * radius));
    assert.equal(result.intrinsicIndex, Math.floor(length * frequency / Math.PI));
    assert.ok(Math.abs(result.j - Math.sin(frequency * length) / frequency) < 2e-6);
  }
});

test('angular endpoint sensitivity agrees with finite-difference geodesics', () => {
  const m = S.getModel('torus'), p = m.endpoints.default.p, theta = .71, length = 3.2;
  const delta = 1e-5;
  const a = G.integrate(m, p, theta - delta, length, {step: .006});
  const b = G.integrate(m, p, theta + delta, length, {step: .006});
  const center = G.integrate(m, p, theta, length, {step: .006});
  const finiteDifference = b.endpoint.map((x, i) => (x - a.endpoint[i]) / (2 * delta));
  assert.ok(distance(center.endpointJacobi, finiteDifference) < 2e-5);
});

test('an actual shot converges to a generic endpoint and survives step refinement', () => {
  const m = S.getModel('torus'), p = m.endpoints.default.p;
  // A generic endpoint produced by the IVP makes an independently checkable
  // shooting target, without asserting an unproved analytic connecting path.
  const exact = G.integrate(m, p, .83, 4.6, {step: .0025});
  const curve = G.shoot(m, p, exact.endpoint, .88, 4.75,
    {maxLength: 10, normalCurvature: .36, throwOnError: true});
  assert.ok(curve, 'Nearby initial guess must converge.');
  assert.ok(curve.residual < 2e-5);
  assert.ok(curve.refinementError < 2e-5);
  assert.ok(distance(curve.points.at(-1), exact.endpoint) < 2e-5);
  assert.ok(Math.abs(curve.length - 4.6) < 1e-4);
  const fine = G.integrate(m, p, curve.theta, curve.length, {step: .0025});
  assert.ok(distance(fine.endpoint, exact.endpoint) < 2e-5);
});

test('normal indices count two transverse directions and flag endpoint resonance', () => {
  const c = .36, first = Math.PI / Math.sqrt(c);
  assert.equal(G.normalIndex(first - .02, c), 0);
  assert.equal(G.normalIndex(first + .02, c), 2);
  assert.equal(G.normalIndex(3 * first + .02, c), 6);
  assert.equal(G.normalContribution(first, c).nearConjugate, true);
  assert.equal(G.normalContribution(first, c).index, 0);
  assert.equal(G.normalContribution(first + .02, c).nearConjugate, false);
  for (const offset of [.002 - 1e-8, .002, .002 + 1e-8]) {
    const contribution = G.normalContribution(first + offset, c);
    assert.equal(contribution.index, 2, 'An interior zero must survive the warning-band boundary.');
    assert.equal(contribution.nearConjugate, offset <= .002);
  }
  assert.equal(G.normalContribution(3 * first, c).index, 4);
  assert.equal(G.normalIndex(100, 0), 0);
  assert.equal(G.normalIndex(100, -1), 0);
  const curve = G.classifyCurve({length: 2 * first + .03,
    intrinsicIndex: 3, intrinsicNearConjugate: false}, c);
  assert.equal(curve.normalIndex, 4);
  assert.equal(curve.index, 7);
});

test('search cancellation yields without accepting unverified seed curves', async () => {
  let cancel = false, progressCalls = 0;
  const curves = await G.search({surface: 'torus', maxLength: 8, maxCurves: 2},
    curve => { assert.ok(curve.residual < 2e-5); },
    progress => { progressCalls++; if (progress.completed >= 2) cancel = true; },
    () => cancel);
  assert.ok(progressCalls >= 2);
  assert.ok(curves.length <= 2);
  assert.equal(curves.searchProgress.stopReason, 'cancelled');
  assert.equal(curves.searchProgress.nextSeed, 2);
});

test('resumed seed batches produce the identical validated curves and coverage as one batch', async () => {
  const options = {surface:'torus', quality:'extended', round:1, maxLength:8, maxCurves:100};
  const whole = await G.search({...options, maxAttempts:9});
  const first = await G.search({...options, maxAttempts:4});
  const second = await G.search({...options, startSeed:first.searchProgress.nextSeed,
    maxAttempts:5, existing:first});
  assert.deepEqual([...first,...second], [...whole]);
  assert.equal(first.searchProgress.nextSeed,4);
  assert.equal(first.searchProgress.stopReason,'attempt-limit');
  assert.equal(second.searchProgress.nextSeed,9);
  assert.equal(second.searchProgress.startSeed,4);
  assert.equal(second.searchProgress.attempted,5);
  assert.equal(second.searchProgress.total,whole.searchProgress.total);
  assert.equal(second.searchProgress.round,1);
  assert.equal(second.searchProgress.quality,'extended');
  assert.equal(Object.keys(first).includes('searchProgress'),false,
    'Search results remain arrays of curves for existing consumers.');
  assert.ok(whole.length>0,'The comparison must exercise accepted numerical trajectories.');
});

test('cancellation during a shot retains its seed while cancellation after a published result advances it', async () => {
  let calls=0;
  const interrupted = await G.search({surface:'torus',maxLength:8,maxAttempts:2},
    ()=>assert.fail('An unfinished shot cannot be accepted.'),()=>{},()=>++calls>3);
  assert.equal(interrupted.searchProgress.nextSeed,0);
  assert.equal(interrupted.searchProgress.attempted,0);
  assert.equal(interrupted.searchProgress.stopReason,'cancelled');
  let cancel=false;
  const accepted = await G.search({surface:'torus',maxLength:8,maxAttempts:4,maxCurves:100},
    ()=>{cancel=true;},()=>{},()=>cancel);
  assert.equal(accepted.length,1);
  const nextSeed=accepted.searchProgress.nextSeed;
  assert.ok(nextSeed>0&&nextSeed<=4);
  assert.equal(accepted.searchProgress.stopReason,'cancelled');
  const full = await G.search({surface:'torus',maxLength:8,maxAttempts:4,maxCurves:100});
  const resumed = await G.search({surface:'torus',maxLength:8,maxAttempts:4-nextSeed,maxCurves:100,
    startSeed:nextSeed,existing:accepted});
  assert.deepEqual([...accepted,...resumed],[...full]);
});

test('coverage distinguishes trajectory limits, empty batches, completion, and invalid cursors', async () => {
  const capped=await G.search({surface:'torus',maxLength:8,maxCurves:1});
  assert.equal(capped.length,1);
  assert.equal(capped.searchProgress.stopReason,'curve-limit');
  assert.ok(capped.searchProgress.nextSeed<capped.searchProgress.total);
  assert.ok(capped.searchProgress.percent<100);
  const empty=await G.search({surface:'torus',maxAttempts:0,startSeed:5});
  assert.equal(empty.length,0);assert.equal(empty.searchProgress.nextSeed,5);
  assert.equal(empty.searchProgress.stopReason,'attempt-limit');
  const completed=await G.search({surface:'torus',startSeed:Number.MAX_SAFE_INTEGER});
  assert.equal(completed.searchProgress.nextSeed,completed.searchProgress.total);
  assert.equal(completed.searchProgress.percent,100);
  assert.equal(completed.searchProgress.stopReason,'complete');
  for(const options of [{startSeed:-1},{startSeed:.5},{startSeed:NaN},{maxAttempts:-1},{maxAttempts:Infinity}])
    await assert.rejects(G.search(options),RangeError);
  assert.equal(typeof G.solverVersion,'string');
});

test('all displayed surfaces produce step-verified geodesics between their prescribed endpoints', async () => {
  for (const surface of ['torus', 'double', 'triple']) {
    const model = S.getModel(surface), endpoints = model.endpoints.default;
    const curves = await G.search({surface, maxLength: surface === 'triple' ? 24 : 12, maxCurves: 1});
    assert.equal(curves.length, 1, surface + ' search should find an actual endpoint solution.');
    assert.ok(distance(curves[0].points[0], endpoints.p) < 1e-9);
    assert.ok(distance(curves[0].points.at(-1), endpoints.q) < 2e-5);
    assert.ok(curves[0].refinementError < 2e-5);
    assert.equal(curves[0].geometryVersion, model.geometryVersion);
    const finer = G.integrate(model, endpoints.p, curves[0].theta, curves[0].length, {step: .00125});
    assert.ok(distance(finer.endpoint, endpoints.q) < 2e-5);
    assert.equal(finer.intrinsicIndex, curves[0].intrinsicIndex);
  }
});

test('negative curvature grows a nonzero Jacobi field without conjugate points', () => {
  const model = S.getModel('torus'), radius = model.majorRadius - model.minorRadius;
  const p = [radius, 0, 0], basis = model.tangentBasis(p);
  const theta = Math.atan2(basis[1][1], basis[0][1]), length = 8;
  const result = G.integrate(model, p, theta, length, {step: .004});
  const frequency = Math.sqrt(1 / (model.minorRadius * radius));
  assert.equal(result.intrinsicIndex, 0);
  assert.deepEqual(result.conjugateTimes, []);
  assert.ok(Math.abs(result.j / (Math.sinh(frequency * length) / frequency) - 1) < 1e-8);
  assert.ok(Math.abs(result.jPrime / Math.cosh(frequency * length) - 1) < 1e-8);
});

test('an interior intrinsic zero counts even inside the endpoint warning band', () => {
  const model = S.getModel('torus'), radius = model.majorRadius + model.minorRadius;
  const p = [radius, 0, 0], basis = model.tangentBasis(p);
  const theta = Math.atan2(basis[1][1], basis[0][1]);
  const zero = Math.PI * Math.sqrt(model.minorRadius * radius);
  const before = G.integrate(model, p, theta, zero - .001, {step: .002});
  const after = G.integrate(model, p, theta, zero + .001, {step: .002});
  assert.equal(before.nearConjugate, true);
  assert.equal(after.nearConjugate, true);
  assert.equal(before.intrinsicIndex, 0);
  assert.equal(after.intrinsicIndex, 1);
});

test('raw constraint diagnostics measure errors before forced correction', () => {
  const model = S.getModel('torus'), p = model.endpoints.default.p;
  const result = G.integrate(model, p, .71, 3.2, {step: .1});
  assert.ok(result.error.rawSpeed > 100 * result.error.speed);
  assert.ok(result.error.rawTangency > 1e-8);
  assert.ok(result.error.rawSurface > result.error.surface);
  const fine = G.integrate(model, p, .71, 3.2, {step: .025});
  assert.ok(fine.error.rawSpeed < result.error.rawSpeed / 100);
  assert.ok(fine.error.rawTangency < result.error.rawTangency / 100);
});

test('sensitive long curves selectively refine Jacobi states and conjugate times', () => {
  const catalogue = require('./catalogue-data.js').catalogues['triple:alternate'];
  const curve = catalogue.curves.slice().sort((a,b)=>b.length/b.integrationStep-a.length/a.integrationStep)[0];
  const model = S.getModel('triple');
  const result = G.integrateVerified(model, catalogue.endpoints.p, curve.theta, curve.length,
    {step: .005, recordStride: 1});
  assert.equal(result.verification.converged, true);
  assert.ok(result.verification.refinements >= 2, 'Sensitive IVPs must receive extra refinement.');
  assert.ok(result.steps > 50000, 'Verified mode may explicitly exceed the ordinary integration budget.');
  assert.equal(result.samples.length, result.steps + 1, 'Keep dense final states for interpolation certification.');
  assert.ok(result.verification.pathError <= 5e-7);
  assert.ok(result.verification.jacobiError <= 2e-6);
  assert.ok(result.verification.rootTimeError <= 2e-7);
  assert.equal(result.intrinsicIndex, curve.intrinsicIndex);
});

test('verification reports exhausted budgets and honors cancellation', () => {
  const model = S.getModel('torus'), p = model.endpoints.default.p;
  const result = G.integrateVerified(model, p, .71, 3.2,
    {step: .1, maxSteps: 100, pathTolerance: 1e-15, jacobiTolerance: 1e-15, rootTolerance: 1e-15});
  assert.equal(result.verification.converged, false);
  assert.equal(result.verification.reason, 'step-budget');
  assert.equal(G.integrateVerified(model, p, .71, 3.2, {step: .01, shouldCancel: () => true}), null);
  assert.throws(() => G.integrate(model, p, .71, 3.2, {steps: 50001}), /budget/);
  assert.throws(() => G.integrate(model, p, .71, 3.2, {maxSteps: Infinity}), /budget/);
});

test('Jacobi refinement remains relative when both field and derivative contract', () => {
  const state = scale => ({samples: [{s: 1, point: [0, 0, 0], j: scale, jPrime: 2*scale}],
    conjugateTimes: [], intrinsicIndex: 0});
  const ordinary = G.compareRefinement(state(1), state(1.001));
  const contracted = G.compareRefinement(state(1e-30), state(1.001e-30));
  assert.ok(Math.abs(ordinary.jacobiError-contracted.jacobiError) < 1e-15);
  assert.ok(contracted.jacobiError > .0009);
});
