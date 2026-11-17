'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('./jacobi-ribbon.js');

function data(length, fn, derivative, surfaceRoots = [], hiddenRoots = [], count = 41) {
  const sampleAt = s => ({s, point: [s, 0, 0], tangent: [1, 0, 0], j: fn(s), jPrime: derivative(s)});
  return {length, sampleAt,
    samples: Array.from({length: count}, (_, i) => sampleAt(length * i / (count - 1))),
    events: [...surfaceRoots.map(s => ({s, surface: true, hidden: false})),
      ...hiddenRoots.map(s => ({s, surface: false, hidden: true}))]};
}
const sine = (length, roots = []) => data(length, s => Math.sin(Math.PI * s), s => Math.PI * Math.cos(Math.PI * s), roots);
const focus = field => R.profile(field, {mode: 'focus', halfWidth: .30, power: .7});

function at(result, s) { return result.find(p => Math.abs(p.sample.s - s) < 1e-12); }

test('surface zeros stay exact and have extra samples on both sides of their sharpened pinch', () => {
  const field = sine(3.5, [1, 2, 3]), result = R.profile(field);
  for (const root of [1, 2, 3]) {
    assert.equal(at(result, root).sample.j, 0);
    assert.equal(at(result, root).width, 0);
    assert.ok(Math.abs(at(result, root - .025).width) > 0);
    assert.ok(Math.abs(at(result, root + .025).width) > 0);
    assert.ok(Math.abs(at(result, root + .08).width) > Math.abs(at(result, root + .025).width));
  }
  assert.ok(Math.abs(at(result, 1.025).width) > .3 * Math.abs(Math.sin(Math.PI * 1.025)),
    'The illustrative gain broadens near-root separations into a visible cusp.');
  assert.ok(result.every((p, i) => i === 0 || p.sample.s > result[i - 1].sample.s));
});

test('hidden conjugate points do not create pinches or change the local gain', () => {
  const withHidden = data(4, s => s * (5 - s), s => 5 - 2 * s, [], [2]);
  const withoutHidden = data(4, s => s * (5 - s), s => 5 - 2 * s);
  assert.deepEqual(R.profile(withHidden), R.profile(withoutHidden));
  assert.ok(at(R.profile(withHidden), 2).width > 0);
});

test('focus conditioning preserves width under arbitrary constant rescaling of a Jacobi solution', () => {
  const base = sine(2, [1, 2]), expected = focus(base);
  for (const scale of [1e-200, 1e200, -7]) {
    const field = data(2, s => scale * Math.sin(Math.PI * s), s => scale * Math.PI * Math.cos(Math.PI * s), [1, 2]);
    const result = focus(field);
    for (let i = 0; i < result.length; i++) {
      assert.ok(Math.abs(result[i].width - Math.sign(scale) * expected[i].width) < 2e-14);
    }
  }
});

test('exponential separation from constant negative curvature does not hide the earlier field', () => {
  // This is the actual initially vanishing solution of j'' - 25 j = 0.
  const field = data(25, s => Math.sinh(5 * s) / 5, s => Math.cosh(5 * s), [], [], 501);
  const result = focus(field);
  assert.ok(Math.abs(field.sampleAt(25).j / field.sampleAt(1).j) > 1e50);
  for (const {sample, width} of result.filter(p => p.sample.s >= .1)) {
    assert.ok(width > .12, `Nonzero field at s=${sample.s} must remain visible.`);
  }
  assert.equal(result[0].width, 0);
});

test('nonconjugate endpoints stay open, with sign preserved and no dependence on travel', () => {
  const field = data(.1, s => s, () => 1), before = JSON.stringify(field.samples);
  const result = R.profile(field);
  assert.equal(result[0].width, 0);
  assert.ok(result.at(-1).width > .1);
  assert.ok(result.every(p => p.sample.j === 0 || Math.sign(p.width) === Math.sign(p.sample.j)));
  assert.equal(JSON.stringify(field.samples), before);
  assert.deepEqual(result, R.profile(field));
});

test('real root-free catalogue curves stay visible instead of disappearing inside the selected tube', () => {
  const S = require('./surface.js'), J = require('./jacobi.js');
  const catalogue = require('./catalogue-data.js').catalogues['double:alternate'];
  const curves = catalogue.curves.filter(curve => curve.intrinsicIndex === 0 && !curve.intrinsicNearConjugate)
    .slice().sort((a,b) => b.length-a.length || a.theta-b.theta).slice(0,2);
  assert.equal(curves.length,2,'The current catalogue supplies two long root-free examples.');
  for (const curve of curves) {
    const field = J.prepare(curve, S.getModel('double'));
    assert.equal(field.events.filter(e => e.surface).length, 0);
    const result = focus(field).filter(p => p.sample.s > .1 && p.sample.s < field.length - .1);
    assert.ok(result.every(p => p.sample.j !== 0 && Math.abs(p.width) > .1),
      `Curve ${curve.id}: previous whole-lobe scaling hid most of this nonzero field under the highlighted curve.`);
  }
});

test('close roots and extreme finite field/derivative scales yield finite nonzero widths', () => {
  const close = data(.003, s => Math.sin(Math.PI * s / .001), s => Math.PI / .001 * Math.cos(Math.PI * s / .001), [.001, .002], [], 5);
  assert.ok(R.profile(close).every(p => Number.isFinite(p.width)));
  const extreme = data(2, s => s * 1e-200, () => 1e200, [], [], 9);
  const result = focus(extreme);
  assert.ok(at(result, .5).width > 0, 'Logarithms avoid premature quotient underflow.');
  assert.ok(result.every(p => Number.isFinite(p.width)));
  const rescaled = R.profile(extreme, {mode: 'focus', halfWidth: 1e200, power: 1});
  assert.ok(at(rescaled, .5).width > 0 && Number.isFinite(at(rescaled, .5).width),
    'Apply the display scale in log space before a tiny normalized fraction underflows.');
  const unrepresentable = data(2, s => s === 0 ? 0 : Number.MIN_VALUE, () => Number.MAX_VALUE);
  assert.throws(() => focus(unrepresentable), /representable ribbon display range/,
    'An unrepresentable display width must not silently become a fabricated conjugate point.');
});

test('browser loading and validation include the field derivative and conditioning length', () => {
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('./jacobi-ribbon.js'), 'utf8'), context);
  assert.equal(typeof context.GeodesicJacobiRibbon.profile, 'function');
  assert.throws(() => R.profile(data(1, s => s, () => 1), {halfWidth: 0}), RangeError);
  assert.throws(() => R.profile(data(1, s => s, () => 1), {power: Infinity}), RangeError);
  assert.throws(() => R.profile(data(1, s => s, () => 1), {conditioningLength: 0}), RangeError);
  assert.throws(() => R.profile(data(1, s => s, () => 1), {mode: 'unknown'}), RangeError);
  assert.throws(() => R.profile(data(1, s => s, () => NaN)), /derivative must be finite/);
});

test('proportional amplitude mode preserves actual size ratios across successive lobes', () => {
  const field = data(2, s => Math.exp(2*s)*Math.sin(Math.PI*s),
    s => Math.exp(2*s)*(2*Math.sin(Math.PI*s)+Math.PI*Math.cos(Math.PI*s)), [1, 2]);
  const result = R.profile(field, {mode: 'amplitude', halfWidth: .16, power: 1});
  const first = at(result, .5), second = at(result, 1.5);
  assert.ok(Math.abs(second.width/first.width - second.sample.j/first.sample.j) < 1e-12);
  assert.ok(Math.abs(second.width) > 7*Math.abs(first.width), 'Growth across a zero must not be normalized away.');
  for (const root of [0, 1, 2]) assert.equal(at(result, root).width, 0);
});

test('amplitude compression is a predictable adjustable signed power, with a smaller default width', () => {
  const field = data(2, s => s, () => 1);
  const proportional = R.profile(field, {power: 1}), compressed = R.profile(field);
  assert.ok(Math.abs(proportional.at(-1).width - .16) < 1e-14);
  assert.ok(Math.abs(at(proportional, .5).width/at(proportional, 1).width - .5) < 1e-14);
  assert.ok(Math.abs(at(compressed, .5).width/at(compressed, 1).width - Math.sqrt(.5)) < 1e-14);
  assert.ok(at(compressed, .5).width > at(proportional, .5).width);
  assert.ok(compressed.every(p => p.width <= .16000000000001));
  assert.ok(Math.abs(R.profile(field, {halfWidth: .08}).at(-1).width - .08) < 1e-14);
});

test('amplitude mode uses one fixed field scale and does not substitute derivative or phase size', () => {
  const field = data(2, s => s, () => 1), changedDerivative = data(2, s => s, () => 100);
  const amplitude = R.profile(field, {power: 1}), changed = R.profile(changedDerivative, {power: 1});
  assert.deepEqual(amplitude.map(p => p.width), changed.map(p => p.width));
  assert.notEqual(at(focus(field), 1).width, at(focus(changedDerivative), 1).width);
  field.maxSurfaceAmplitude = 10;
  const scaled = R.profile(field, {power: 1});
  assert.ok(Math.abs(scaled.at(-1).width - .16 * 2/10) < 1e-14);
  assert.ok(Math.abs(at(scaled, 1).width - .16/10) < 1e-14);
});

test('amplitude scaling is invariant under extreme finite constant rescaling without a width floor', () => {
  const expected = R.profile(data(2, s => s, () => 1), {power: 1});
  for (const scale of [1e-200, 1e200, -7]) {
    const field = data(2, s => scale*s, () => scale);
    const result = R.profile(field, {power: 1});
    for (let i = 0; i < result.length; i++) assert.ok(Math.abs(result[i].width-Math.sign(scale)*expected[i].width) < 2e-14);
  }
  const field = data(2, s => s === 0 ? 0 : s < 1 ? 1e-10 : 1, () => 1);
  const result = R.profile(field, {power: 1});
  assert.ok(at(result, .5).width < 1e-9 && at(result, .5).width > 0);
});
