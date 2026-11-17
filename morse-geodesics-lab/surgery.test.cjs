'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('./surface.js');
const Surgery = require('./surgery.js');

const near = (a, b, tolerance, description) => assert.ok(Math.abs(a - b) <= tolerance, `${description}: ${a} versus ${b}`);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = p => Math.hypot(...p);

function topology(meshes) {
  const vertices = new Map(), edges = new Map(), parents = [];
  let faceCount = 0;
  const find = a => { while (parents[a] !== a) { parents[a] = parents[parents[a]]; a = parents[a]; } return a; };
  for (const mesh of meshes) {
    assert.equal(mesh.positions.length, mesh.normals.length);
    assert.equal(mesh.positions.length, mesh.triangleCount * 9);
    for (let offset = 0; offset < mesh.positions.length; offset += 9) {
      const ids = [];
      for (let corner = 0; corner < 9; corner += 3) {
        const p = Array.from(mesh.positions.slice(offset + corner, offset + corner + 3));
        const key = p.join(',');
        if (!vertices.has(key)) { vertices.set(key, vertices.size); parents.push(parents.length); }
        ids.push(vertices.get(key));
      }
      assert.equal(new Set(ids).size, 3, 'no collapsed triangles');
      faceCount += 1;
      for (let side = 0; side < 3; side += 1) {
        const a = ids[side], b = ids[(side + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a;
        if (!edges.has(key)) edges.set(key, {count: 0, direction: 0, a, b});
        const edge = edges.get(key); edge.count += 1; edge.direction += a < b ? 1 : -1;
        parents[find(a)] = find(b);
      }
    }
  }
  const boundary = [...edges.values()].filter(e => e.count === 1);
  for (const edge of edges.values()) {
    assert.ok(edge.count === 1 || edge.count === 2, 'no nonmanifold edges');
    if (edge.count === 2) assert.equal(edge.direction, 0, 'neighboring triangles have consistent orientations');
  }
  const boundaryParents = new Map();
  const boundaryFind = a => { if (!boundaryParents.has(a)) boundaryParents.set(a, a); let v = a; while (boundaryParents.get(v) !== v) v = boundaryParents.get(v); return v; };
  for (const e of boundary) boundaryParents.set(boundaryFind(e.a), boundaryFind(e.b));
  const boundaryCount = new Set([...boundaryParents.keys()].map(boundaryFind)).size;
  return {euler: vertices.size - edges.size + faceCount, components: new Set(parents.map((_, i) => find(i))).size,
    boundaryCount, boundaryEdges: boundary.length};
}

const plans = Object.fromEntries(['torus', 'double'].map(id => [id, Surgery.prepareTransition(id, {resolution: 40})]));

test('UMD helper needs no browser, animation runtime, or remote dependency', () => {
  const sandbox = {GeodesicSurface: S};
  vm.runInNewContext(fs.readFileSync(require.resolve('./surgery.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.GeodesicSurgery.prepareTransition, 'function');
  assert.throws(() => Surgery.prepareTransition('triple'), /one or two/);
  assert.throws(() => Surgery.prepareTransition(0), /one, two, or three/);
});

test('analytic cut ovals lie on the true torus and stay outside the blend modification', () => {
  const torus = S.getModel('torus');
  for (const plan of Object.values(plans)) {
    const target = S.getModel(plan.toId);
    for (const [center, side] of [[plan.oldCenter, 1], [plan.newCenter, -1]]) {
      for (let i = 0; i < 120; i += 1) {
        const p = Surgery.boundaryPoint(center, side, 2 * Math.PI * i / 120);
        near(torus.value([p[0] - center, p[1], p[2]]), 0, 1e-12, 'true torus oval');
        near(target.value(p), 0, 1e-12, 'cut is outside target modification');
      }
    }
  }
});

for (const [fromId, plan] of Object.entries(plans)) {
  const {retained, incoming, removedOld, removedNew, join} = plan.meshes;
  const source = S.getModel(fromId), target = S.getModel(plan.toId), torus = S.getModel('torus');

  test(`${fromId} → ${plan.toId}: punctured pieces, curved discs, and annular join have the correct topology`, () => {
    assert.deepEqual(topology([retained]), {euler: 1 - 2 * plan.fromCount, components: 1, boundaryCount: 1, boundaryEdges: plan.boundaries.old.vertexCount});
    assert.deepEqual(topology([incoming]), {euler: -1, components: 1, boundaryCount: 1, boundaryEdges: plan.boundaries.new.vertexCount});
    assert.deepEqual(topology([removedOld]), {euler: 1, components: 1, boundaryCount: 1, boundaryEdges: plan.boundaries.old.vertexCount});
    assert.deepEqual(topology([removedNew]), {euler: 1, components: 1, boundaryCount: 1, boundaryEdges: plan.boundaries.new.vertexCount});
    assert.deepEqual(topology([join]), {euler: 0, components: 1, boundaryCount: 2, boundaryEdges: plan.boundaries.old.vertexCount + plan.boundaries.new.vertexCount});
    assert.deepEqual(topology([retained, removedOld]), {euler: 2 - 2 * plan.fromCount, components: 1, boundaryCount: 0, boundaryEdges: 0});
    assert.deepEqual(topology([incoming, removedNew]), {euler: 0, components: 1, boundaryCount: 0, boundaryEdges: 0});
    assert.deepEqual(topology([retained, incoming, join]), {euler: 2 - 2 * plan.toCount, components: 1, boundaryCount: 0, boundaryEdges: 0});
  });

  test(`${fromId} → ${plan.toId}: retained source, incoming torus, and removed discs are genuine original surface patches`, () => {
    for (const [mesh, implicit] of [[retained, p => source.value(p)], [incoming, p => torus.value([p[0] - plan.newCenter, p[1], p[2]])],
      [removedOld, p => torus.value([p[0] - plan.oldCenter, p[1], p[2]])], [removedNew, p => torus.value([p[0] - plan.newCenter, p[1], p[2]])]]) {
      for (let offset = 0; offset < mesh.positions.length; offset += 3) {
        const p = Array.from(mesh.positions.slice(offset, offset + 3));
        assert.ok(Math.abs(implicit(p)) < 2e-5, 'each displayed point is on its original curved surface');
      }
    }
    for (const [mesh, center, side] of [[removedOld, plan.oldCenter, 1], [removedNew, plan.newCenter, -1]]) {
      let minimumX = Infinity, maximumX = -Infinity;
      for (let offset = 0; offset < mesh.positions.length; offset += 9) {
        const a = Array.from(mesh.positions.slice(offset, offset + 3)), b = Array.from(mesh.positions.slice(offset + 3, offset + 6)), c = Array.from(mesh.positions.slice(offset + 6, offset + 9));
        const midpoint = a.map((v, i) => (v + b[i] + c[i]) / 3);
        const outward = torus.normal([midpoint[0] - center, midpoint[1], midpoint[2]]);
        assert.ok(dot(cross(sub(b, a), sub(c, a)), outward) > 0, 'removed-disc winding points outward, including the reflected cap');
        for (const p of [a, b, c]) {
          assert.ok(side * (p[0] - center) >= plan.cutDistance - 1e-6, 'disc stays inside the removed cap');
          minimumX = Math.min(minimumX, p[0]); maximumX = Math.max(maximumX, p[0]);
        }
      }
      assert.ok(maximumX - minimumX > 0.7, 'the removed disc is curved rather than a planar lid');
    }
  });

  test(`${fromId} → ${plan.toId}: final annulus and both retained pieces reproduce the exact target field`, () => {
    assert.equal(plan.geometryVersion, target.geometryVersion);
    for (const mesh of [retained, incoming, join]) for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      const p = Array.from(mesh.positions.slice(offset, offset + 3));
      assert.ok(Math.abs(target.value(p)) < 2e-6, 'final pieces lie on the target defining equation');
      const n = Array.from(mesh.normals.slice(offset, offset + 3));
      near(norm(n), 1, 1e-6, 'unit normal');
      assert.ok(dot(n, target.normal(p)) > 0.9999, 'target normal agrees');
    }
    // In 2→3, the pre-existing neck belongs entirely to the untouched retained piece.
    for (const midpoint of source.bridges) {
      assert.ok(midpoint + 0.9 < plan.cuts[0]);
      for (let i = 0; i < 20; i += 1) {
        const p = source.neckSection(midpoint, i).point;
        near(source.value(p), target.value(p), 1e-13, 'the old neck remains unchanged');
      }
    }
  });

  test(`${fromId} → ${plan.toId}: animation moves rigid pieces and reveals the target annulus from both boundaries`, () => {
    assert.equal(plan, Surgery.prepareTransition(fromId, {resolution: 40}), 'prepared geometry is cached');
    const first = plan.sample(0), aligned = plan.sample(0.60), middle = plan.sample(0.80), last = plan.sample(1);
    assert.equal(first.phase, 'Separate surfaces');
    assert.deepEqual(first.pieces.find(p => p.key === 'incoming').translation, [1.2, 0, 1.4]);
    assert.deepEqual(aligned.pieces.find(p => p.key === 'incoming').translation, [0, 0, 0]);
    assert.equal(first.pieces.find(p => p.key === 'join').visible, false);
    assert.ok(middle.gap[0] > plan.cuts[0] && middle.gap[0] < plan.midpoint);
    assert.ok(middle.gap[1] < plan.cuts[1] && middle.gap[1] > plan.midpoint);
    assert.deepEqual(last.gap, [plan.midpoint, plan.midpoint]);
    assert.equal(last.complete, true);
    for (const key of ['removedOld', 'removedNew']) assert.equal(last.pieces.find(p => p.key === key).visible, false);
    for (let i = 0; i <= 60; i += 1) for (const piece of plan.sample(i / 60).pieces) {
      assert.equal(piece.mesh, plan.meshes[piece.key], 'no mesh is regenerated or rescaled during playback');
      assert.ok(piece.translation.every(Number.isFinite));
      assert.ok(piece.opacity >= 0 && piece.opacity <= 1);
    }
  });

  test(`${fromId} → ${plan.toId}: moving collar sections lie on the target and become the exact height-safe stadium at the midpoint`, () => {
    for (const fraction of [0, 0.13, 0.37, 0.5, 0.86, 1]) {
      const x = plan.cuts[0] + fraction * (plan.cuts[1] - plan.cuts[0]);
      const section = plan.sectionAt(x);
      assert.equal(section.vertexCount, 64);
      assert.equal(section.cutX, Math.fround(x));
      for (let offset = 0; offset < section.positions.length; offset += 3) {
        const p = Array.from(section.positions.slice(offset, offset + 3));
        assert.equal(p[0], section.cutX, 'ring and shader use the same cut plane');
        near(target.value(p), 0, 2e-6, 'section lies on the target surface');
        near(norm(Array.from(section.normals.slice(offset, offset + 3))), 1, 1e-6, 'section normal is unit length');
        assert.ok(Math.abs(p[2]) <= target.minorRadius + 3e-8, 'the whole revealed collar obeys the original torus height');
        const exact = target.neckSection(section.cutX, 2 * Math.PI * offset / section.positions.length).point;
        for (let axis = 0; axis < 3; axis += 1) near(p[axis], exact[axis], 1e-7, 'ring samples the exact selected profile');
      }
      if (fraction === 0.5) {
        near(section.positions[1], target.neckProfile.halfWidth, 1e-7, 'midpoint horizontal half-width');
        near(section.positions[3 * 16 + 2], target.neckProfile.halfHeight, 3e-8, 'midpoint vertical half-height');
      }
    }
    assert.throws(() => plan.sectionAt(plan.cuts[0] - 1), /between the two cut planes/);
  });
}

test('surgery cut planes follow the selected collar seam and stale cuts cannot hydrate', () => {
  assert.equal(Surgery.cutDistance, S.getModel('double').neckProfile.seamX);
  for (const plan of Object.values(plans)) {
    assert.equal(plan.cutDistance, .94);
    assert.throws(() => Surgery.hydratePlan({...Surgery.serializePlan(plan), cutDistance:1.02}), /cuts/);
    assert.throws(() => Surgery.hydratePlan({...Surgery.serializePlan(plan), cuts:[plan.cuts[0]+.01,plan.cuts[1]]}), /cuts/);
  }
});

test('full-resolution collar cuts retain ordered ovals and outward display triangles in both stages', () => {
  for (const fromId of ['torus','double']) {
    const plan = Surgery.prepareTransition(fromId);
    for (const boundary of Object.values(plan.boundaries)) {
      const p = boundary.positions, changes = [];
      for (let i = 0; i < p.length; i += 3) {
        const j = (i + 3) % p.length, d = Math.atan2(p[j+2],p[j+1]) - Math.atan2(p[i+2],p[i+1]);
        changes.push(Math.atan2(Math.sin(d),Math.cos(d)));
      }
      const direction = Math.sign(changes.reduce((sum,value)=>sum+value,0));
      assert.ok(changes.every(value=>value*direction>=-1e-7),'A thin torus cut cannot fold backward around its polar angle.');
    }
    for (const key of ['retained','incoming','join','removedOld','removedNew']) {
      const mesh = plan.meshes[key];
      for (let i = 0; i < mesh.positions.length; i += 9) {
        const a = Array.from(mesh.positions.slice(i,i+3)), b = Array.from(mesh.positions.slice(i+3,i+6)), c = Array.from(mesh.positions.slice(i+6,i+9)),
          outward = [0,1,2].map(axis=>mesh.normals[i+axis]+mesh.normals[i+3+axis]+mesh.normals[i+6+axis]);
        assert.ok(dot(cross(sub(b,a),sub(c,a)),outward)>=-1e-13,`${fromId}: ${key} has no reversed display triangle.`);
      }
    }
  }
});
