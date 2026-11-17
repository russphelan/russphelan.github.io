'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('./jacobi-ribbon-mesh.js'), S = require('./surface.js');
const J = require('./jacobi.js'), R = require('./jacobi-ribbon.js');
const catalogues = require('./catalogue-data.js').catalogues;
const signedDistance = (model, p) => { const jet = model.jet(p); return jet.value / Math.hypot(...jet.gradient); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function arc(s, width = .3) {
  const radius = 1.8, t = s / radius;
  return {sample: {s, point: [radius * Math.cos(t), radius * Math.sin(t), 0], tangent: [-Math.sin(t), Math.cos(t), 0]}, width};
}
function assertClear(model, mesh, dense = false) {
  let minimum = Infinity;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const a = Array.from(mesh.positions.slice(i, i + 3)), b = Array.from(mesh.positions.slice(i + 3, i + 6)), c = Array.from(mesh.positions.slice(i + 6, i + 9));
    const normal = Array.from(mesh.normals.slice(i, i + 3));
    assert.ok(dot(cross(sub(b, a), sub(c, a)), normal) > -1e-10, 'Triangle winding faces outward.');
    const count = dense ? 6 : 2;
    for (let j = 0; j <= count; j++) for (let k = 0; k <= count - j; k++) {
      const p = a.map((x, d) => x * j / count + b[d] * k / count + c[d] * (1 - (j + k) / count));
      minimum = Math.min(minimum, signedDistance(model, p));
    }
  }
  assert.ok(minimum > 0, `Every checked facet interior stays outside the surface: ${minimum}`);
  return minimum;
}

test('wide torus ribbon facets follow the surface where the former center strip cut underneath', () => {
  const model = S.getModel('torus');
  const old = [-.5, .5].map(side => {
    const p = model.project([1.8, 0, side * .3]), n = model.normal(p);
    return p.map((x, i) => x + .012 * n[i]);
  });
  assert.ok(signedDistance(model, old[0].map((x, i) => (x + old[1][i]) / 2)) < 0,
    'Reproduce the center strip dipping inside the opaque torus.');
  const profile = Array.from({length: 3}, (_, i) => arc(i * .8));
  const mesh = M.build(model, profile);
  assert.ok(mesh.diagnostics.segments >= 4);
  assert.ok(mesh.diagnostics.rows > profile.length, 'Wide longitudinal facets receive extra rows.');
  assert.ok(assertClear(model, mesh, true) >= mesh.diagnostics.clearance - 1e-6);
  assert.ok(mesh.diagnostics.triangles < 5000);
});

test('maximum-width focus ribbons keep Float32 facet interiors clear around difficult neck collars', () => {
  const model = S.getModel('double'), curve = catalogues['double:alternate'].curves[17];
  const data = J.prepare(curve, model), profile = R.profile(data, {mode: 'focus', halfWidth: .30, power: .2});
  const mesh = M.build(model, profile, data.orientation);
  assert.ok(assertClear(model, mesh, true) >= mesh.diagnostics.clearance - 1e-6,
    'Float32 facets retain enough clearance for the visible surface triangulation too.');
  assert.ok(mesh.diagnostics.triangles < 100000);
  assert.equal(mesh.rings[0].length, mesh.diagnostics.segments + 1);
  assert.ok(mesh.positions.every(Number.isFinite));
});

test('exact pinches and orientation survive tessellation without changing input samples', () => {
  const model = S.getModel('torus'), profile = [arc(0, .12), arc(.2, 0), arc(.4, -.12)];
  const before = JSON.stringify(profile);
  for (const orientation of [-1, 1]) {
    const mesh = M.build(model, profile, orientation);
    const root = mesh.rows.findIndex(row => row.sample.s === .2);
    assert.ok(root >= 0);
    assert.ok(mesh.rings[root].every(v => v.p.every((x, i) => x === mesh.rings[root][0].p[i])));
    assertClear(model, mesh);
    for (const row of profile) assert.ok(mesh.rows.includes(row), 'Original rows are retained exactly.');
  }
  assert.equal(JSON.stringify(profile), before);
});

test('mesh helper loads independently and reports bounded refinement failures', () => {
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('./jacobi-ribbon-mesh.js'), 'utf8'), context);
  assert.equal(typeof context.GeodesicJacobiRibbonMesh.build, 'function');
  const model = S.getModel('torus');
  assert.throws(() => M.build(model, [arc(0), arc(1)], 1, {maxTriangles: 1}), /budget/);
  assert.throws(() => M.build(model, [arc(0), arc(1)], 1, {clearance: .02}), RangeError);
});
