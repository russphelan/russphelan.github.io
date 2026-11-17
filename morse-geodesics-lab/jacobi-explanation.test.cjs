'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('./jacobi-explanation.js');
const J = require('./jacobi.js');
const G = require('./solver.js');
const S = require('./surface.js');
const fixture = (j = 2, hidden = 3) => ({length: 10, sampleAt: () => ({j, hidden})});

test('surface focusing identifies one entire zero vector and two surviving fields', () => {
  const detail = E.describe(fixture(1e-14), 4, {surface: true, hidden: false, multiplicity: 1});
  assert.deepEqual(detail.vanishing, [0]);
  assert.deepEqual(detail.fields.map(f => f.components), [[0, 0, 0], [0, 3, 0], [0, 0, 3]]);
  assert.match(detail.title, /Jₛ vanishes completely/);
  assert.match(detail.why, /zero both at x and here/);
  assert.match(detail.why, /passing it adds 1 independent downhill mode/);
  assert.match(detail.remaining, /J₁ and J₂ remain nonzero/);
  assert.match(detail.remaining, /surface ribbon pinches/);
  assert.match(detail.remaining, /cutaway stay spread out/);
});

test('hidden focusing identifies two independent whole fields, not two components of one field', () => {
  const detail = E.describe(fixture(2, -1e-16), 5, {surface: false, hidden: true, multiplicity: 2});
  assert.deepEqual(detail.vanishing, [1, 2]);
  assert.deepEqual(detail.fields.map(f => f.components), [[2, 0, 0], [0, 0, 0], [0, 0, 0]]);
  assert.match(detail.title, /J₁ and J₂ vanish completely/);
  assert.match(detail.why, /2 independent Jacobi fields/);
  assert.match(detail.why, /multiplicity 2/);
  assert.match(detail.remaining, /ribbon stays open/);
  assert.match(detail.remaining, /Both off-surface fields return to the centerline/);
});

test('small displayed amplitudes are never confused with actual zeros', () => {
  const data = fixture(1e-50, -1e-70), detail = E.describe(data, 1);
  assert.deepEqual(detail.vanishing, []);
  assert.ok(detail.fields.every(field => !field.zero));
  assert.deepEqual(detail.fields[0].components, [1e-50, 0, 0]);
  assert.deepEqual(detail.fields[1].components, [0, -1e-70, 0]);
  assert.match(detail.title, /Three different/);
  assert.match(detail.why, /at least one/);
});

test('the shared starting zero is distinguished from conjugacy of nontrivial fields', () => {
  const detail = E.describe(fixture(0, 0), 0);
  assert.deepEqual(detail.vanishing, [0, 1, 2]);
  assert.ok(detail.fields.every(field => field.zero && field.status === 'Zero at the start'));
  assert.match(detail.why, /nontrivial Jacobi fields/);
  assert.match(detail.remaining, /contributes nothing/);
  assert.doesNotMatch(detail.why, /multiplicity/);
});

test('a conjugate destination is explained as nullity rather than a new index contribution', () => {
  const detail = E.describe(fixture(), 10, {surface: false, hidden: true, endpoint: true, multiplicity: 2});
  assert.deepEqual(detail.vanishing, [1, 2]);
  assert.match(detail.why, /endpoint nullity 2/);
  assert.doesNotMatch(detail.why, /increases/);
});

test('real simultaneous torus roots produce three separate whole zero fields', () => {
  const model = S.getModel('torus'), p = model.point(0, 0), basis = model.tangentBasis(p);
  const theta = Math.atan2(basis[1][1], basis[0][1]), length = 4;
  const r = G.integrate(model, p, theta, length, {step: .0025, record: true});
  const curve = {theta, length, integrationStep: r.step, points: r.samples.map(s => s.point),
    jacobi: r.samples.map(({s, j, jPrime, tangent}) => ({s, j, jPrime, tangent})),
    conjugateTimes: r.conjugateTimes, conjugateSamples: r.conjugateSamples, jacobiOrientation: r.orientation};
  const curvature = 1 / (model.minorRadius * (model.majorRadius + model.minorRadius));
  const data = J.prepare(curve, model, curvature), event = data.interiorEvents[0];
  assert.equal(event.multiplicity, 3);
  const detail = E.describe(data, event.s, event);
  assert.deepEqual(detail.vanishing, [0, 1, 2]);
  assert.ok(detail.fields.every(field => field.components.every(value => value === 0)));
  assert.match(detail.why, /multiplicity 3/);
  assert.match(detail.remaining, /surface ribbon pinches/);
  assert.match(detail.remaining, /both off-surface fields return to the centerline/);
});

test('explanations load as a dependency-free browser module', () => {
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('./jacobi-explanation.js'), 'utf8'), context);
  assert.equal(typeof context.GeodesicJacobiExplanation.describe, 'function');
  assert.throws(() => E.describe(null, 0), /Jacobi data/);
});
