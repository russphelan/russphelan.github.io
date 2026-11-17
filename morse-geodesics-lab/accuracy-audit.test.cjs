'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Audit = require('./accuracy-audit.cjs');
const Surface = require('./surface.js');
const Solver = require('./solver.js');

test('independent unprojected reference agrees with both analytic torus equators', () => {
  for (const check of Audit.analyticChecks()) {
    assert.ok(check.independent.path < 1e-9, check.name);
    assert.ok(check.independent.jacobiStateRelative < 1e-9, check.name);
    assert.ok(check.independent.rootTime < 1e-9, check.name);
    assert.equal(check.independent.rootCountEqual, true, check.name);
    assert.ok(check.independentConstraints.surface < 1e-10, check.name);
    assert.ok(check.independentConstraints.speed < 1e-10, check.name);
    assert.ok(check.independentRootPhaseDifference < 1e-9, check.name);
  }
});

test('selective RK4 verification agrees with independent adaptive integration on a sensitive long IVP', () => {
  const catalogue = require('./catalogue-data.js').catalogues['triple:alternate'];
  const curve = catalogue.curves.slice().sort((a,b)=>b.length-a.length)[0];
  const model = Surface.getModel('triple'), p = catalogue.endpoints.p;
  const result = Solver.integrateVerified(model, p, curve.theta, curve.length,
    {step: .005, maxSamples: 513});
  assert.equal(result.verification.converged, true);
  const independent = Audit.reference(model, p, curve.theta, result.samples.map(x => x.s), 2e-15);
  const error = Audit.compare(result, independent);
  assert.ok(error.path < 2e-7, JSON.stringify(error));
  assert.ok(error.jacobiStateRelative < 1e-6, JSON.stringify(error));
  assert.ok(error.rootTime < 1e-7, JSON.stringify(error));
  assert.equal(error.rootCountEqual, true);
  assert.equal(independent.phaseRoots.length, independent.conjugateTimes.length);
});
