'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Surface = require('./surface.js');
const Collar = require('./compact-collar.js');

const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected}`);

test('classic local scripts load without CommonJS or remote dependencies', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./compact-collar.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(require.resolve('./surface.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.GeodesicSurface.getModel, 'function');
  assert.equal(sandbox.GeodesicSurface.getModel('double').genus, 2);
  assert.equal(sandbox.GeodesicSurface.getModel('triple').genus, 3);
  assert.throws(() => Surface.getModel('missing'), /Unknown surface/);
});

for (const id of Surface.modelIds) {
  const model = Surface.getModel(id);

  test(`${id}: analytic gradient and Hessian agree with finite differences`, () => {
    const samples = [[0.71, 0.33, 0.19], [-1.12, 0.63, -0.24], [1.89, -0.16, 0.37], model.endpoints.default.p, model.endpoints.alternate.q];
    const step = 1e-5;
    for (const p of samples) {
      const gradient = model.gradient(p);
      const hessian = model.hessian(p);
      assert.equal(hessian.length, 9);
      for (let axis = 0; axis < 3; axis += 1) {
        const plus = p.slice(), minus = p.slice();
        plus[axis] += step; minus[axis] -= step;
        const numericalGradient = (model.value(plus) - model.value(minus)) / (2 * step);
        near(gradient[axis], numericalGradient, 2e-6 * Math.max(1, Math.abs(gradient[axis])), 'gradient');
        const plusGradient = model.gradient(plus), minusGradient = model.gradient(minus);
        for (let row = 0; row < 3; row += 1) {
          const numericalHessian = (plusGradient[row] - minusGradient[row]) / (2 * step);
          near(hessian[3 * row + axis], numericalHessian, 2e-6 * Math.max(1, Math.abs(hessian[3 * row + axis])), 'Hessian');
          near(hessian[3 * row + axis], hessian[3 * axis + row], 1e-12, 'Hessian symmetry');
        }
      }
    }
  });

  test(`${id}: endpoints are regular surface points, and projection is a cloning retraction`, () => {
    for (const [preset,endpoints] of Object.entries(model.endpoints)) {
      assert.ok(norm(sub(endpoints.p, endpoints.q)) > 0.5, 'endpoints must be distinct');
      if(preset==='presentation'){
        assert.equal(endpoints.p[2],0);assert.equal(endpoints.q[2],0);
      }else assert.ok(Math.abs(endpoints.p[2]) > 0.05 && Math.abs(endpoints.q[2]) > 0.05, 'exploration endpoints avoid the reflection-symmetric equator');
      for (const p of [endpoints.p, endpoints.q]) {
        near(model.value(p), 0, 1e-10, 'endpoint constraint');
        assert.ok(norm(model.gradient(p)) > 0.05, 'regular gradient');
        assert.ok(Number.isFinite(model.curvature(p)), 'finite curvature');
        const original = p.slice();
        const exact = model.project(p);
        assert.notEqual(exact, p, 'project must return a new array');
        assert.deepEqual(p, original, 'project must not mutate its input');
        const n = model.normal(p);
        near(norm(n), 1, 1e-12, 'normal length');
        const basis = model.tangentBasis(p);
        near(norm(basis[0]), 1, 1e-12, 'first basis length');
        near(norm(basis[1]), 1, 1e-12, 'second basis length');
        near(dot(basis[0], basis[1]), 0, 1e-12, 'basis orthogonality');
        near(dot(basis[0], n), 0, 1e-12, 'first tangent');
        near(dot(basis[1], n), 0, 1e-12, 'second tangent');
        near(dot(cross(basis[0], basis[1]), n), 1, 1e-12, 'basis orientation');
        for (const offset of [-0.03, 0.03]) {
          const perturbed = p.map((value, axis) => value + offset * n[axis] + 0.007 * basis[0][axis]);
          const projected = model.project(perturbed);
          near(model.value(projected), 0, 1e-9, 'projected constraint');
          assert.ok(norm(sub(projected, p)) < 0.02, 'local projection stays near its starting surface point');
        }
      }
    }
    assert.throws(() => model.project([NaN, 0, 0]), /finite coordinates/);
  });

  test(`${id}: the meshing box encloses the whole sampled solid without a cut boundary`, () => {
    for (let normalAxis = 0; normalAxis < 3; normalAxis += 1) {
      const firstAxis = (normalAxis + 1) % 3, secondAxis = (normalAxis + 2) % 3;
      for (const side of [0, 1]) {
        for (let i = 0; i <= 18; i += 1) {
          for (let j = 0; j <= 18; j += 1) {
            const p = [0, 0, 0];
            p[normalAxis] = model.bounds[side][normalAxis];
            p[firstAxis] = model.bounds[0][firstAxis] + i / 18 * (model.bounds[1][firstAxis] - model.bounds[0][firstAxis]);
            p[secondAxis] = model.bounds[0][secondAxis] + j / 18 * (model.bounds[1][secondAxis] - model.bounds[0][secondAxis]);
            assert.ok(model.value(p) > 0, 'every sampled box boundary point must lie outside');
          }
        }
      }
    }
  });
}

test('implicit torus curvature agrees with the independent analytic formula, including negative inner curvature', () => {
  const model = Surface.getModel('torus');
  for (const u of [0, 0.37, 2.11]) {
    for (const v of [0, 0.45, Math.PI / 2, 2.12, Math.PI, 4.77]) {
      const p = model.point(u, v);
      const expected = Math.cos(v) / (model.minorRadius * (model.majorRadius + model.minorRadius * Math.cos(v)));
      near(model.value(p), 0, 2e-13, 'parameterized torus constraint');
      near(model.curvature(p), expected, 2e-11, 'analytic torus curvature');
    }
  }
  assert.ok(model.curvature(model.point(0, 0)) > 0);
  assert.ok(model.curvature(model.point(0, Math.PI)) < 0);
});

for (const id of ['double', 'triple']) {
  const model = Surface.getModel(id);

  test(`${id}: unmodified round torus patches retain their exact positions, normals, and metric curvature`, () => {
    assert.equal(model.majorRadius, 1.35);
    assert.equal(model.minorRadius, 0.45);
    assert.equal(model.neckRadius, 0.45);
    assert.equal(model.neckWidth, 1.05);
    assert.equal(model.neckProfile.seamX, .94);
    assert.equal(model.geometryVersion, 'compact-collar-v1');
    const original = Surface.getModel('torus');
    near(norm(sub(model.endpoints.default.p, original.endpoints.default.p)), 0, 1e-15, 'the first endpoint stays on the original torus');
    near(norm(sub(model.endpoints.default.q, original.endpoints.default.q.map((value, axis) => value + (axis === 0 ? model.centers.at(-1) : 0)))), 0, 1e-15, 'the other endpoint is an exact translated copy');
    for (const center of model.centers) {
      // The entire inner circular cross-section must survive each attachment.
      for (let i = 0; i < 80; i += 1) {
        const u = 2 * Math.PI * i / 80;
        const local = original.point(u, Math.PI), p = local.map((v, axis) => v + (axis === 0 ? center : 0));
        near(model.value(p), 0, 1e-13, 'inner circular cross-section');
        near(norm(sub(model.normal(p), original.normal(local))), 0, 1e-12, 'unchanged inner normal');
        near(model.curvature(p), original.curvature(local), 2e-11, 'unchanged inner curvature');
      }
      // Full circular tube cross-sections on the sides away from the joining caps.
      for (const u of [Math.PI / 2, -Math.PI / 2]) for (let i = 0; i < 32; i += 1) {
        const v = 2 * Math.PI * i / 32;
        const local = original.point(u, v), p = local.map((value, axis) => value + (axis === 0 ? center : 0));
        near(model.value(p), 0, 1e-13, 'unchanged round tube');
        near(norm(sub(model.normal(p), original.normal(local))), 0, 1e-12, 'unchanged tube normal');
        near(model.curvature(p), original.curvature(local), 2e-11, 'unchanged tube curvature');
      }
    }
  });

  test(`${id}: exact height-bounded stadium necks and smooth collar jets match the selected surface`, () => {
    const step = 2e-6;
    for (const midpoint of model.bridges) {
      for (const angle of [0, 0.7, Math.PI / 2, 2.2]) {
        const section=model.neckSection(midpoint,angle),p=section.point;
        near(model.value(p),0,2e-13,'exact stadium section');
        near(norm(sub(model.normal(p),section.normal)),0,2e-12,'section normal');
        near(model.curvature(p),0,2e-12,'extruded section Gaussian curvature');
        assert.ok(Math.abs(p[2])<=.45+1e-14);
      }
      const offset=midpoint-2;
      for(const localX of [.94,.95,.98,1.3,1.62,1.64,1.66,1.89,2,2.11,2.34,3.05,3.06])for(const angle of [.2,.7,1.4]){
        const section=model.neckSection(offset+localX,angle),p=section.point,evaluation=model.jet(p);
        near(evaluation.value,model.value(p),2e-14,'jet/scalar value');
        assert.ok(norm(evaluation.gradient)>.1,'regular collar gradient');
        near(model.curvature(p),section.gaussian,3e-11,'analytic parametric curvature');
        for(let axis=0;axis<3;axis++){
          const plus=p.slice(),minus=p.slice();plus[axis]+=step;minus[axis]-=step;
          near(evaluation.gradient[axis],(model.value(plus)-model.value(minus))/(2*step),3e-7,'collar gradient');
          const gp=model.gradient(plus),gm=model.gradient(minus);
          for(let row=0;row<3;row++)near(evaluation.hessian[3*row+axis],(gp[row]-gm[row])/(2*step),5e-5,'collar Hessian');
        }
      }
    }
  });

}

function checkMeshTopology(mesh, model) {
  assert.ok(mesh.positions instanceof Float32Array);
  assert.ok(mesh.normals instanceof Float32Array);
  assert.equal(mesh.positions.length, mesh.normals.length);
  assert.equal(mesh.positions.length % 9, 0);
  assert.equal(mesh.triangleCount, mesh.positions.length / 9);
  const vertices = new Map(), edges = new Map(), adjacency = [];
  const ids = [];
  const p = mesh.positions, n = mesh.normals;
  for (let offset = 0; offset < p.length; offset += 3) {
    const point = [p[offset], p[offset + 1], p[offset + 2]];
    const key = point.map(value => Math.round(value * 1e7)).join(',');
    if (!vertices.has(key)) { vertices.set(key, vertices.size); adjacency.push([]); }
    ids.push(vertices.get(key));
    assert.ok(Math.abs(model.value(point)) < 1e-5, 'projected mesh points satisfy the implicit equation after Float32 rounding');
    const normal = [n[offset], n[offset + 1], n[offset + 2]];
    near(norm(normal), 1, 1e-6, 'unit vertex normal');
    const gradient = model.gradient(point);
    assert.ok(norm(gradient) > 0.1, 'sampled surface is regular');
    assert.ok(dot(normal, gradient) > 0, 'vertex normal points outside');
  }
  for (let face = 0; face < ids.length; face += 3) {
    assert.equal(new Set(ids.slice(face, face + 3)).size, 3, 'no collapsed triangles');
    const a = Array.from(p.slice(3 * face, 3 * face + 3));
    const b = Array.from(p.slice(3 * face + 3, 3 * face + 6));
    const c = Array.from(p.slice(3 * face + 6, 3 * face + 9));
    const middle = a.map((value, axis) => (value + b[axis] + c[axis]) / 3);
    assert.ok(dot(cross(sub(b, a), sub(c, a)), model.gradient(middle)) > 0, 'triangle winding agrees with the analytic outside normal');
    for (let side = 0; side < 3; side += 1) {
      const first = ids[face + side], second = ids[face + (side + 1) % 3];
      const key = first < second ? `${first},${second}` : `${second},${first}`;
      edges.set(key, (edges.get(key) || 0) + 1);
      adjacency[first].push(second); adjacency[second].push(first);
    }
  }
  for (const multiplicity of edges.values()) assert.equal(multiplicity, 2, 'a closed manifold edge has exactly two incident triangles');
  const visited = new Set([0]), stack = [0];
  while (stack.length) {
    const vertex = stack.pop();
    for (const neighbor of adjacency[vertex]) if (!visited.has(neighbor)) { visited.add(neighbor); stack.push(neighbor); }
  }
  assert.equal(visited.size, vertices.size, 'the surface is connected');
  const eulerCharacteristic = vertices.size - edges.size + mesh.triangleCount;
  assert.equal(eulerCharacteristic, 2 - 2 * model.genus, 'the closed mesh has the intended genus');
}

for (const id of Surface.modelIds) {
  test(`${id}: projected marching-tetrahedra mesh is closed, consistently oriented, and has the intended Euler characteristic`, () => {
    const model = Surface.getModel(id);
    checkMeshTopology(Surface.buildMesh(id, 40), model);
    checkMeshTopology(Surface.buildMesh(id), model);
  });

  test(`${id}: curvature integral agrees numerically with Gauss–Bonnet`, () => {
    // Equal longest-axis resolution undersamples a three-body chain's necks;
    // resolve the longer domain before applying midpoint curvature quadrature.
    const model = Surface.getModel(id), mesh = Surface.buildMesh(id, id==='triple'?56:40), p = mesh.positions;
    let integral = 0;
    for (let offset = 0; offset < p.length; offset += 9) {
      const a = Array.from(p.slice(offset, offset + 3)), b = Array.from(p.slice(offset + 3, offset + 6)), c = Array.from(p.slice(offset + 6, offset + 9));
      const area = norm(cross(sub(b, a), sub(c, a))) / 2;
      const midpoint = model.project(a.map((value, axis) => (value + b[axis] + c[axis]) / 3));
      integral += area * model.curvature(midpoint);
    }
    near(integral, 2 * Math.PI * (2 - 2 * model.genus), 0.35, 'Gauss–Bonnet integral');
  });
}

// Preserve the former string-key welding rule as an independent equivalence
// oracle. Optimization must retain the first matching vertex and its normal.
  function legacyWeldSlivers(mesh, tolerance = 1e-5) {
    // A projected isosurface can pass within a few microns of a grid corner.
    // Welding these sub-grid slivers also closes holes left by omitted zero-area
    // triangles. Nearby buckets are checked so a bucket boundary cannot make a crack.
    const points = [], vertexNormals = [], buckets = new Map(), exact = new Map(), faces = [];
    for (let offset = 0; offset < mesh.positions.length; offset += 9) {
      const ids = [];
      for (let corner = 0; corner < 9; corner += 3) {
        const p = Array.from(mesh.positions.slice(offset + corner, offset + corner + 3));
        const exactKey = p.join(',');
        let id = exact.get(exactKey);
        if (id === undefined) {
          const cell = p.map(v => Math.floor(v / tolerance));
          search: for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) for (let z = -1; z <= 1; z += 1) {
            const neighbors = buckets.get([cell[0] + x, cell[1] + y, cell[2] + z].join(':')) || [];
            for (const candidate of neighbors) {
              if (Math.hypot(...p.map((v, k) => v - points[candidate][k])) < tolerance) {
                id = candidate; break search;
              }
            }
          }
          if (id === undefined) {
            id = points.length; points.push(p);
            vertexNormals.push(Array.from(mesh.normals.slice(offset + corner, offset + corner + 3)));
            const key = cell.join(':');
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(id);
          }
          exact.set(exactKey, id);
        }
        ids.push(id);
      }
      if (new Set(ids).size === 3) faces.push(ids);
    }
    const positions = new Float32Array(faces.length * 9), normals = new Float32Array(faces.length * 9);
    let offset = 0;
    for (const face of faces) for (const id of face) {
      positions.set(points[id], offset); normals.set(vertexNormals[id], offset); offset += 3;
    }
    return {...mesh, positions, normals, triangleCount: faces.length, weldTolerance: tolerance};
  }


test('numeric welding keeps byte-identical vertices, normals, and triangle order', () => {
  const source = fs.readFileSync(require.resolve('./surface.js'), 'utf8');
  let raw;
  const sandbox = {GeodesicCompactCollar:Collar,captureWeld(mesh) { raw = mesh; return mesh; }};
  vm.runInNewContext(source
    .replace('return weldSlivers({positions:', 'return captureWeld({positions:')
    .replace('return { getModel, buildMesh, modelIds:', 'return { getModel, buildMesh, weldSlivers, modelIds:'), sandbox);
  const optimized = sandbox.GeodesicSurface;
  const equivalent = mesh => {
    const expected = legacyWeldSlivers(mesh), actual = optimized.weldSlivers(mesh);
    const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    assert.deepEqual(bytes(actual.positions), bytes(expected.positions));
    assert.deepEqual(bytes(actual.normals), bytes(expected.normals));
    assert.equal(actual.triangleCount, expected.triangleCount);
    assert.equal(actual.weldTolerance, expected.weldTolerance);
  };
  for (const id of Surface.modelIds) {
    optimized.buildMesh(id, 40);
    equivalent(raw);
  }
  // Exercise near-neighbors across negative/positive bucket boundaries,
  // signed zero, repeated exact corners, and triangles collapsed by welding.
  const points = [
    [-0, 0, 0], [1, 0, 0], [0, 1, 0],
    [0, 0, 0], [1, 0, 0], [0, 1, 0],
    [-.000009, -.000009, 0], [-.000011, -.000011, 0], [0, 0, 1],
    [.000009, .000009, 0], [.000011, .000011, 0], [0, 1, 1],
    [1.000001, 0, 0], [1, 0, 0], [0, 0, 2]
  ];
  equivalent({positions: new Float32Array(points.flat()), normals: new Float32Array(points.flatMap((_, i) => [i, i + .25, i + .5]))});
});
