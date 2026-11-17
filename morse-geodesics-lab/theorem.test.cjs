'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Theorem = require('./theorem.js');

test('the picker cutoff and exact-degree guarantee use different correct counts', () => {
  assert.deepEqual(Theorem.bounds(2, 8), {applicable: true, degree: 512n, cumulative: 1021n});
  assert.deepEqual(Theorem.bounds(3, 8), {applicable: true, degree: 98304n, cumulative: 131071n});
});

test('degree zero and the first positive degree include the constant path-space class once', () => {
  for (const k of [2, 3, 4, 12]) {
    assert.deepEqual(Theorem.bounds(k, 0), {applicable: true, degree: 1n, cumulative: 1n});
    assert.deepEqual(Theorem.bounds(k, 1), {
      applicable: true, degree: 2n * BigInt(k), cumulative: 1n + 2n * BigInt(k)
    });
  }
});

test('cumulative guarantees agree with independently accumulated per-degree bounds through degree 100', () => {
  for (const k of [2, 3, 7]) {
    let degree = 2n * BigInt(k), cumulative = 1n;
    for (let n = 1; n <= 100; n++) {
      cumulative += degree;
      const result = Theorem.bounds(k, n);
      assert.equal(result.degree, degree);
      assert.equal(result.cumulative, cumulative);
      degree *= 2n * BigInt(k - 1);
    }
  }
  assert.equal(Theorem.bounds(2, 100).cumulative, 2n ** 102n - 3n);
  assert.equal(Theorem.bounds(3, 100).cumulative, 2n * 4n ** 100n - 1n);
});

test('one summand explicitly has no connected-sum guarantee', () => {
  for (const n of [0, 1, 8, 100]) {
    assert.deepEqual(Theorem.bounds(1, n), {applicable: false, degree: null, cumulative: null});
  }
});

test('invalid or imprecise summand counts and degrees are rejected', () => {
  for (const k of [0, -1, 2.5, Infinity, NaN, undefined, null, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => Theorem.bounds(k, 8), RangeError);
  }
  for (const n of [-1, .5, Infinity, NaN, undefined, null, '8', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => Theorem.bounds(2, n), RangeError);
  }
});

test('the dependency-free module exposes the same exact bounds in a browser', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./theorem.js'), 'utf8'), context);
  const result = context.GeodesicTheorem.bounds(3, 8);
  assert.equal(result.applicable, true);
  assert.equal(result.degree, 98304n);
  assert.equal(result.cumulative, 131071n);
});
