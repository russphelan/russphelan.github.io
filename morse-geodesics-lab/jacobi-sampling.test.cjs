'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const H = require('./jacobi-sampling.js'), S = require('./surface.js');
const G = require('./solver.js'), J = require('./jacobi.js');
const C = require('./catalogue-data.js').catalogues;

function sample(s, j, jPrime) { return {s, point: [s, 0, 0], tangent: [1, 0, 0], j, jPrime}; }
function interpolant(samples, s) {
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].s <= s) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], h = b.s - a.s, t = (s - a.s) / h;
  return [H.hermite(a.j, b.j, a.jPrime, b.jPrime, h, t), H.derivative(a.j, b.j, a.jPrime, b.jPrime, h, t)];
}

test('adaptive Hermite output retains field and derivative accuracy without keeping the whole grid', () => {
  const exact = s => [Math.sinh(5 * s) / 5, Math.cosh(5 * s)];
  const dense = Array.from({length: 4001}, (_, i) => sample(i / 1000, ...exact(i / 1000)));
  const {samples, diagnostics} = H.compress(dense);
  assert.ok(samples.length < dense.length / 4);
  assert.ok(diagnostics.jacobiError <= diagnostics.jacobiTolerance);
  for (let i = 0; i < 8001; i++) {
    const s = i / 2000, truth = exact(s), actual = interpolant(samples, s);
    assert.ok(Math.hypot(actual[0] - truth[0], actual[1] - truth[1]) / Math.hypot(...truth) < 1.1e-6);
  }
});

test('compression rejects interpolant zeros invented between positive data', () => {
  const dense = Array.from({length: 2001}, (_, i) => {
    const s = i / 2000, j = Math.exp(-50 * s); return sample(s, j, -50 * j);
  });
  assert.equal(H.rootsBetween(dense[0], dense.at(-1)), 2, 'A coarse cubic would fake two zeros.');
  const {samples} = H.compress(dense, {maxSpacing: 1});
  for (let i = 1; i < samples.length; i++) assert.equal(H.rootsBetween(samples[i - 1], samples[i]), 0);
  for (let i = 0; i <= 4000; i++) assert.ok(interpolant(samples, i / 4000)[0] > 0);
});

test('selected long catalogue paths keep the integration accuracy after display sampling', () => {
  const entry = C['triple:alternate'], curve = entry.curves.reduce((a, b) => a.length > b.length ? a : b);
  const model = S.getModel('triple'), before = JSON.stringify(curve);
  const data = J.prepare(curve, model);
  const step = data.verification.history.at(-1).step;
  const dense = G.integrate(model, curve.points[0], curve.theta, curve.length,
    {steps: Math.round(curve.length / step), maxSteps: 100000, record: true, recordStride: 1});
  let maxState = 0, maxPoint = 0;
  for (let i = 1; i < dense.samples.length; i += 3) {
    const p = dense.samples[i], q = data.sampleAt(p.s);
    maxState = Math.max(maxState, Math.hypot(p.j - q.j, p.jPrime - q.jPrime) / Math.hypot(p.j, p.jPrime));
    maxPoint = Math.max(maxPoint, Math.hypot(...p.point.map((x, k) => x - q.point[k])));
    const n = model.normal(q.point);
    assert.ok(Math.abs(n.reduce((v, x, k) => v + x * q.tangent[k], 0)) < 1e-12);
  }
  assert.ok(maxState < 2e-6, `Display interpolation state error ${maxState}`);
  assert.ok(maxPoint < 2e-7, `Display interpolation path error ${maxPoint}`);
  assert.equal(data.index, curve.index);
  assert.ok(data.sampling.retainedSamples < data.sampling.denseSamples / 3);
  assert.equal(JSON.stringify(curve), before);
});

test('sampling helper is dependency-free in a browser and validates its inputs', () => {
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('./jacobi-sampling.js'), 'utf8'), context);
  assert.equal(typeof context.GeodesicJacobiSampling.compress, 'function');
  assert.throws(() => H.compress([]), TypeError);
  assert.throws(() => H.compress([sample(0, 0, 1), sample(1, 1, 1)], {jacobiTolerance: 0}), RangeError);
});
