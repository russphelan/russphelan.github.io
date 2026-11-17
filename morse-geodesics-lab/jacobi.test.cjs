'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./surface.js');
const G = require('./solver.js');
const J = require('./jacobi.js');
const catalogues = require('./catalogue-data.js').catalogues;

function equator(length, rich = false) {
  const model = S.getModel('torus'), p = model.point(0, 0), basis = model.tangentBasis(p);
  const theta = Math.atan2(basis[1][1], basis[0][1]);
  const recorded = G.integrate(model, p, theta, length, {step: .0025, record: true});
  const curve = {theta, length, points: recorded.samples.map(p => p.point),
    jacobi: recorded.samples.map(({s, j}) => ({s, j})), integrationStep: recorded.step};
  if (rich) Object.assign(curve, {jacobi: recorded.samples.map(({s, j, jPrime, tangent}) => ({s, j, jPrime, tangent})),
    conjugateTimes: recorded.conjugateTimes, conjugateSamples: recorded.conjugateSamples,
    jacobiOrientation: recorded.orientation});
  const curvature = 1 / (model.minorRadius * (model.majorRadius + model.minorRadius));
  return {model, curve, curvature, recorded};
}

test('refined integration-grid roots match the analytic torus equator, independent of display stride', () => {
  const {model, curve, curvature} = equator(10);
  const coarseDisplay = G.integrate(model, curve.points[0], curve.theta, curve.length,
    {step: .007, record: true, maxSamples: 9});
  assert.ok(coarseDisplay.samples.length <= 10);
  const spacing = Math.PI / Math.sqrt(curvature);
  assert.equal(coarseDisplay.conjugateTimes.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(coarseDisplay.conjugateTimes[i] - (i + 1) * spacing) < 3e-9);
    assert.equal(coarseDisplay.conjugateSamples[i].j, 0);
  }
});

test('one surface and two hidden directions merge at simultaneous roots and count only after passage', () => {
  const {model, curve, curvature} = equator(10);
  const data = J.prepare(curve, model, curvature);
  assert.equal(data.events.length, 3);
  assert.equal(data.index, 9);
  assert.equal(data.nullity, 0);
  assert.ok(data.orientation === 1 || data.orientation === -1);
  data.events.forEach((event, i) => {
    assert.equal(event.multiplicity, 3);
    assert.equal(event.surface, true);
    assert.equal(event.hidden, true);
    assert.equal(data.countBefore(event.s), i * 3);
    assert.equal(data.countBefore(event.s / data.length * data.length), i * 3,
      'Travel-slider fraction roundtrips must not count an event prematurely.');
    assert.equal(data.countBefore(event.s + 1e-6), (i + 1) * 3);
    assert.ok(Math.abs(data.sampleAt(event.s).j) < 1e-7);
    assert.ok(Math.abs(data.sampleAt(event.s).hidden) < 1e-12);
  });
  assert.equal(data.countBefore(0), 0);
  assert.equal(data.countBefore(10), 9);
});

test('conjugate endpoints contribute nullity and nearby strict interior roots still contribute index', () => {
  const {curvature} = equator(1), first = Math.PI / Math.sqrt(curvature);
  const endpoint = equator(first);
  const data = J.prepare(endpoint.curve, endpoint.model, curvature);
  assert.equal(data.index, 0);
  assert.equal(data.nullity, 3);
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].s, first);
  assert.equal(data.countBefore(first), 0);
  const beyond = equator(first + .001);
  const after = J.prepare(beyond.curve, beyond.model, curvature);
  assert.equal(after.index, 3, 'The catalogue warning band must not erase a strict interior event.');
  assert.equal(after.nullity, 0);
});

test('nearby but distinct surface and hidden conjugate points do not merge', () => {
  const {model, curve, curvature} = equator(4);
  const shifted = Math.PI / (Math.PI / Math.sqrt(curvature) + .0001);
  const data = J.prepare(curve, model, shifted * shifted);
  assert.deepEqual(data.events.map(e => e.multiplicity), [1, 2]);
});

test('rich samples interpolate the actual field and surface point without modifying catalogue data', () => {
  const {model, curve, curvature} = equator(5, true), before = JSON.stringify(curve);
  const data = J.prepare(curve, model, .36), s = 1.234, sample = data.sampleAt(s);
  const radius = model.majorRadius + model.minorRadius;
  assert.ok(Math.abs(sample.j - Math.sin(Math.sqrt(curvature) * s) / Math.sqrt(curvature)) < 1e-7);
  assert.ok(Math.hypot(sample.point[0] - radius * Math.cos(s / radius),
    sample.point[1] - radius * Math.sin(s / radius), sample.point[2]) < 1e-7);
  assert.ok(Math.abs(Math.hypot(...sample.tangent) - 1) < 1e-12);
  assert.equal(JSON.stringify(curve), before);
  assert.equal(J.hiddenValue(3, 0), 3);
  assert.equal(J.prepare(curve, model, 0).events.some(e => e.hidden), false);
});

test('legacy catalogue preparation recovers every displayed index on representative long connected-sum paths', () => {
  for (const [key, entry] of Object.entries(catalogues)) {
    const model = S.getModel(key.split(':')[0]);
    const candidates = [entry.curves.find(c => c.intrinsicIndex > 0 && c.normalIndex > 0),
      entry.curves.reduce((a, b) => a.index > b.index ? a : b)];
    for (const curve of candidates) {
      const data = J.prepare(curve, model, .36);
      assert.equal(data.index, curve.index, `${key}, L=${curve.length}`);
      assert.equal(data.interiorEvents.filter(e => e.surface).length, curve.intrinsicIndex);
      assert.equal(data.interiorEvents.filter(e => e.hidden).length * 2, curve.normalIndex);
      assert.ok(data.samples.every(p => Number.isFinite(p.j) && Number.isFinite(p.jPrime)));
      assert.ok(data.maxSurfaceAmplitude > 0);
      assert.equal(data.countBefore(curve.length), curve.index);
    }
  }
});
