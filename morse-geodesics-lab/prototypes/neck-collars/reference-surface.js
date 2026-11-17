/* Archived round-chain-v1 reference for this isolated comparison. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GeodesicSurface = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TAU = 2 * Math.PI;
  const TORUS_R = 1.35;
  const TORUS_r = 0.45;
  const CHAIN_SPACING = 4;
  const NECK_RADIUS = 0.40;
  const BRIDGE_HALF_LENGTH = 0.45;
  const CAP_SCALE = 0.10;
  const BLEND_WIDTH = 0.20;
  const GEOMETRY_VERSION = 'round-chain-v1';

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);

  function normalized(a) {
    const length = norm(a);
    if (!(length > 1e-14)) throw new RangeError('A surface normal requires a nonzero gradient.');
    return [a[0] / length, a[1] / length, a[2] / length];
  }

  // For a regular implicit surface, K = grad(F)^T adj(Hess(F)) grad(F) / |grad(F)|^4.
  // This expression is unchanged if F is replaced by a nonzero constant multiple.
  function implicitCurvature(model, p) {
    const evaluation = model.jet(p);
    const g = evaluation.gradient;
    const h = evaluation.hessian;
    const lengthSquared = dot(g, g);
    if (!(lengthSquared > 1e-28)) return NaN;
    const a = h[0], b = h[1], c = h[2], d = h[4], e = h[5], f = h[8];
    const adj00 = d * f - e * e;
    const adj01 = c * e - b * f;
    const adj02 = b * e - c * d;
    const adj11 = a * f - c * c;
    const adj12 = b * c - a * e;
    const adj22 = a * d - b * b;
    const numerator = adj00 * g[0] ** 2 + adj11 * g[1] ** 2 + adj22 * g[2] ** 2
      + 2 * adj01 * g[0] * g[1] + 2 * adj02 * g[0] * g[2] + 2 * adj12 * g[1] * g[2];
    return numerator / (lengthSquared * lengthSquared);
  }

  // A local normal-Newton retraction, not a promise of the globally closest point.
  // It always clones the input, including when it already lies on the surface.
  function projectToSurface(model, p) {
    if (!p || p.length !== 3 || !Array.from(p).every(Number.isFinite)) {
      throw new TypeError('Projection needs three finite coordinates.');
    }
    const q = [p[0], p[1], p[2]];
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const value = model.value(q);
      if (Math.abs(value) < 1e-12) return q;
      const g = model.gradient(q);
      const lengthSquared = dot(g, g);
      if (!(lengthSquared > 1e-26) || !Number.isFinite(value)) break;
      const scale = value / lengthSquared;
      let damping = 1;
      let candidate;
      let accepted = false;
      for (let trial = 0; trial < 14; trial += 1) {
        candidate = [q[0] - damping * scale * g[0], q[1] - damping * scale * g[1], q[2] - damping * scale * g[2]];
        if (Math.abs(model.value(candidate)) < Math.abs(value)) {
          accepted = true;
          break;
        }
        damping *= 0.5;
      }
      if (!accepted) break;
      q[0] = candidate[0]; q[1] = candidate[1]; q[2] = candidate[2];
    }
    if (Math.abs(model.value(q)) < 1e-9) return q;
    throw new RangeError('Normal-Newton projection did not converge; start near the regular surface.');
  }

  function finishModel(specification) {
    const model = specification;
    const originalGradient = model.gradient, originalHessian = model.hessian;
    const evaluate = model.jet || (p => ({value: model.value(p), gradient: originalGradient(p), hessian: originalHessian(p)}));
    let previousPoint = null, previousJet = null;
    model.jet = p => {
      if (!previousPoint || p[0] !== previousPoint[0] || p[1] !== previousPoint[1] || p[2] !== previousPoint[2]) {
        previousPoint = [p[0], p[1], p[2]];
        previousJet = evaluate(p);
      }
      return previousJet;
    };
    model.gradient = p => model.jet(p).gradient;
    model.hessian = p => model.jet(p).hessian;
    model.curvature = p => implicitCurvature(model, p);
    model.project = p => projectToSurface(model, p);
    model.normal = p => normalized(model.gradient(p));
    model.tangentBasis = p => {
      const n = model.normal(p);
      const reference = Math.abs(n[2]) < 0.85 ? [0, 0, 1] : [1, 0, 0];
      const first = normalized(cross(n, reference));
      return [first, cross(n, first)];
    };
    return model;
  }

  function torusPoint(u, v) {
    const radius = TORUS_R + TORUS_r * Math.cos(v);
    return [radius * Math.cos(u), radius * Math.sin(u), TORUS_r * Math.sin(v)];
  }

  const torus = finishModel({
    id: 'torus',
    name: 'One torus',
    genus: 1,
    count: 1,
    geometryVersion: GEOMETRY_VERSION,
    centers: [0],
    bridges: [],
    pivot: 0,
    meshResolution: [84, 84, 24],
    majorRadius: TORUS_R,
    minorRadius: TORUS_r,
    bounds: [[-1.91, -1.91, -0.51], [1.91, 1.91, 0.51]],
    endpoints: {
      default: { p: torusPoint(-2.35, 0.48), q: torusPoint(0.67, -0.59), label: 'Across the torus' },
      alternate: { p: torusPoint(-0.62, 1.03), q: torusPoint(2.08, -0.32), label: 'An oblique pair' },
      presentation: {p:torusPoint(-2.35,0),q:torusPoint(2.08,0),label:'Fixed in the original torus'}
    },
    point: torusPoint,
    value(p) {
      const x = p[0], y = p[1], z = p[2];
      const s = x * x + y * y + z * z + TORUS_R ** 2 - TORUS_r ** 2;
      return s * s - 4 * TORUS_R ** 2 * (x * x + y * y);
    },
    gradient(p) {
      const x = p[0], y = p[1], z = p[2];
      const s = x * x + y * y + z * z + TORUS_R ** 2 - TORUS_r ** 2;
      const t = s - 2 * TORUS_R ** 2;
      return [4 * x * t, 4 * y * t, 4 * z * s];
    },
    hessian(p) {
      const x = p[0], y = p[1], z = p[2];
      const s = x * x + y * y + z * z + TORUS_R ** 2 - TORUS_r ** 2;
      const t = s - 2 * TORUS_R ** 2;
      return [4 * t + 8 * x * x, 8 * x * y, 8 * x * z,
        8 * x * y, 4 * t + 8 * y * y, 8 * y * z,
        8 * x * z, 8 * y * z, 4 * s + 8 * z * z];
    }
  });

  function torusDistance(p, center) {
    return Math.hypot(Math.hypot(p[0] - center, p[1]) - TORUS_R, p[2]) - TORUS_r;
  }

  function torusDistanceJet(p, center) {
    const x = p[0] - center, y = p[1], z = p[2];
    const radial = Math.hypot(x, y), offset = radial - TORUS_R;
    const tubeDistance = Math.hypot(offset, z);
    if (radial < 1e-14 || tubeDistance < 1e-14) {
      // Distance fields have medial-axis singularities strictly away from F=0.
      return {value: tubeDistance - TORUS_r, gradient: [0, 0, 0], hessian: Array(9).fill(0)};
    }
    const radialGradient = [x / radial, y / radial, 0];
    const gradient = [offset * radialGradient[0] / tubeDistance, offset * radialGradient[1] / tubeDistance, z / tubeDistance];
    const hessian = Array(9);
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) {
      const radialHessian = i < 2 && j < 2 ? ((i === j ? 1 : 0) - radialGradient[i] * radialGradient[j]) / radial : 0;
      hessian[3 * i + j] = (radialGradient[i] * radialGradient[j] + (i === 2 && j === 2 ? 1 : 0)
        + offset * radialHessian - gradient[i] * gradient[j]) / tubeDistance;
    }
    return {value: tubeDistance - TORUS_r, gradient, hessian};
  }

  function capData(t) {
    if (t <= 0 || CAP_SCALE ** 2 / (t * t) > 740) return [0, 0, 0];
    const ratio = CAP_SCALE ** 2 / (t * t), exponential = Math.exp(-ratio);
    return [t * t * exponential, 2 * exponential * (t + CAP_SCALE ** 2 / t),
      2 * exponential * (1 + ratio + 2 * ratio * ratio)];
  }

  function bridgeDistance(p, center) {
    const t = Math.abs(p[0] - center) - BRIDGE_HALF_LENGTH;
    const cap = t > 0 ? t * t * Math.exp(-(CAP_SCALE ** 2) / (t * t)) : 0;
    return Math.sqrt(p[1] * p[1] + p[2] * p[2] + cap) - NECK_RADIUS;
  }

  function bridgeDistanceJet(p, center) {
    const axial = p[0] - center, t = Math.abs(axial) - BRIDGE_HALF_LENGTH;
    const [cap, capPrime, capSecond] = capData(t);
    const distance = Math.sqrt(p[1] * p[1] + p[2] * p[2] + cap);
    if (distance < 1e-14) return {value: -NECK_RADIUS, gradient: [0, 0, 0], hessian: Array(9).fill(0)};
    const gradient = [Math.sign(axial) * capPrime / (2 * distance), p[1] / distance, p[2] / distance];
    const hessian = Array(9), diagonal = [capSecond / 2, 1, 1];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) {
      hessian[3 * i + j] = ((i === j ? diagonal[i] : 0) - gradient[i] * gradient[j]) / distance;
    }
    return {value: distance - NECK_RADIUS, gradient, hessian};
  }

  // This compact smooth minimum is EXACTLY min(a,b) outside the blend band.
  // Its jets below use the chain rule, not finite differences of the surface.
  function smoothMinimum(a, b) {
    const difference = a - b;
    if (Math.abs(difference) >= BLEND_WIDTH) return Math.min(a, b);
    const w = 1 - (difference / BLEND_WIDTH) ** 2;
    const e = BLEND_WIDTH * Math.exp(-1 / w);
    return (a + b - Math.hypot(difference, e)) / 2;
  }

  function unionNode(a, b) {
    if (Math.abs(a.value - b.value) >= BLEND_WIDTH) return a.value < b.value ? a : b;
    return {kind: 'blend', value: smoothMinimum(a.value, b.value), a, b};
  }

  function evaluateNode(node, p) {
    if (node.kind === 'torus') return torusDistanceJet(p, node.center);
    if (node.kind === 'bridge') return bridgeDistanceJet(p, node.center);
    const a = evaluateNode(node.a, p), b = evaluateNode(node.b, p);
    const d = a.value - b.value, widthSquared = BLEND_WIDTH ** 2, w = 1 - d * d / widthSquared;
    const e = BLEND_WIDTH * Math.exp(-1 / w);
    const exponentPrime = -2 * d / (widthSquared * w * w);
    const exponentSecond = -2 / (widthSquared * w * w) - 8 * d * d / (widthSquared * widthSquared * w ** 3);
    const ePrime = e * exponentPrime, eSecond = e * (exponentPrime ** 2 + exponentSecond);
    const q = Math.hypot(d, e), numerator = d + e * ePrime;
    const qPrime = numerator / q;
    const qSecond = (1 + ePrime * ePrime + e * eSecond) / q - numerator * numerator / q ** 3;
    const weightA = (1 - qPrime) / 2, weightB = (1 + qPrime) / 2;
    const differenceGradient = a.gradient.map((v, i) => v - b.gradient[i]);
    const gradient = a.gradient.map((v, i) => weightA * v + weightB * b.gradient[i]);
    const hessian = a.hessian.map((v, k) => weightA * v + weightB * b.hessian[k]
      - qSecond * differenceGradient[Math.floor(k / 3)] * differenceGradient[k % 3] / 2);
    return {value: node.value, gradient, hessian};
  }

  function makeChain(count, id) {
    const centers = Array.from({length: count}, (_, i) => i * CHAIN_SPACING);
    const bridges = centers.slice(1).map(c => c - CHAIN_SPACING / 2);
    const translatedPoint = (u, v, body = 0) => {
      const p = torusPoint(u, v); p[0] += centers[body]; return p;
    };
    const model = finishModel({
      id, name: count === 2 ? 'Two round tori' : 'Three round tori', count, genus: count,
      geometryVersion: GEOMETRY_VERSION, centers, bridges, pivot: CHAIN_SPACING * (count - 1) / 2,
      majorRadius: TORUS_R, minorRadius: TORUS_r, neckRadius: NECK_RADIUS,
      spacing: CHAIN_SPACING, bridgeHalfLength: BRIDGE_HALF_LENGTH, capScale: CAP_SCALE, blendWidth: BLEND_WIDTH,
      meshResolution: count === 2 ? [140, 72, 24] : [179, 73, 25],
      bounds: [[-1.86, -1.86, -0.51], [centers[count - 1] + 1.86, 1.86, 0.51]],
      point: translatedPoint,
      endpoints: {
        default: {p: translatedPoint(-2.35, 0.48), q: translatedPoint(0.67, -0.59, count - 1), label: 'Across all summands'},
        alternate: {p: translatedPoint(-0.62, 1.03), q: [bridges[0], NECK_RADIUS * Math.cos(0.7), NECK_RADIUS * Math.sin(0.7)], label: 'First body to the first neck'},
        presentation: {p:torusPoint(-2.35,0),q:torusPoint(2.08,0),label:'Fixed in the original torus'}
      },
      value(p) {
        let value = torusDistance(p, centers[0]);
        for (let j = 1; j < count; j += 1) {
          value = smoothMinimum(smoothMinimum(value, bridgeDistance(p, bridges[j - 1])), torusDistance(p, centers[j]));
        }
        return value;
      },
      jet(p) {
        // Only differentiate primitives selected by the compact minimum.
        let node = {kind: 'torus', center: centers[0], value: torusDistance(p, centers[0])};
        for (let j = 1; j < count; j += 1) {
          node = unionNode(unionNode(node, {kind: 'bridge', center: bridges[j - 1], value: bridgeDistance(p, bridges[j - 1])}),
            {kind: 'torus', center: centers[j], value: torusDistance(p, centers[j])});
        }
        return evaluateNode(node, p);
      }
    });
    return model;
  }

  const models = {torus, double: makeChain(2, 'double'), triple: makeChain(3, 'triple')};

  function getModel(id) {
    if (!Object.prototype.hasOwnProperty.call(models, id)) throw new RangeError('Unknown surface model: ' + id);
    return models[id];
  }

  function gridResolution(bounds, resolution) {
    const spans = bounds[1].map((maximum, axis) => maximum - bounds[0][axis]);
    let counts;
    if (Array.isArray(resolution)) counts = resolution.slice(0, 3);
    else if (resolution && typeof resolution === 'object') {
      counts = [resolution.x || resolution.nx, resolution.y || resolution.ny, resolution.z || resolution.nz];
    } else {
      const longest = Math.max(...spans);
      const density = Number.isFinite(resolution) ? resolution : 72;
      counts = spans.map(span => Math.max(16, Math.round(density * span / longest)));
    }
    if (counts.length !== 3 || counts.some(n => !Number.isFinite(n))) throw new TypeError('Mesh resolution must be a number or three grid counts.');
    return counts.map(n => Math.min(180, Math.max(4, Math.round(n))));
  }

  // A consistent six-tetrahedron decomposition of every cube, sharing all face diagonals.
  const tetrahedra = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];

  function weldSlivers(mesh, tolerance = 1e-5) {
    // A projected isosurface can pass within a few microns of a grid corner.
    // Welding these sub-grid slivers also closes holes left by omitted zero-area
    // triangles. Nearby buckets are checked so a bucket boundary cannot make a crack.
    const points = [], vertexNormals = [], buckets = new Map(), exact = new Map(), faces = [];
    for (let offset = 0; offset < mesh.positions.length; offset += 9) {
      const ids = [];
      for (let corner = 0; corner < 9; corner += 3) {
        const index = offset + corner;
        const px = mesh.positions[index], py = mesh.positions[index + 1], pz = mesh.positions[index + 2];
        // Numeric coordinate maps identify the same Float32 triples as the old
        // string keys, without allocating a slice and key for every face corner.
        let exactY = exact.get(px), exactZ = exactY?.get(py);
        let id = exactZ?.get(pz);
        if (id === undefined) {
          const p = [px, py, pz];
          const cellX = Math.floor(px / tolerance), cellY = Math.floor(py / tolerance), cellZ = Math.floor(pz / tolerance);
          search: for (let x = -1; x <= 1; x += 1) {
            const neighborY = buckets.get(cellX + x);
            if (!neighborY) continue;
            for (let y = -1; y <= 1; y += 1) {
              const neighborZ = neighborY.get(cellY + y);
              if (!neighborZ) continue;
              for (let z = -1; z <= 1; z += 1) {
                const neighbors = neighborZ.get(cellZ + z);
                if (!neighbors) continue;
                for (const candidate of neighbors) {
                  const q = points[candidate];
                  if (Math.hypot(px - q[0], py - q[1], pz - q[2]) < tolerance) {
                    id = candidate; break search;
                  }
                }
              }
            }
          }
          if (id === undefined) {
            id = points.length; points.push(p);
            vertexNormals.push([mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2]]);
            let bucketY = buckets.get(cellX);
            if (!bucketY) { bucketY = new Map(); buckets.set(cellX, bucketY); }
            let bucketZ = bucketY.get(cellY);
            if (!bucketZ) { bucketZ = new Map(); bucketY.set(cellY, bucketZ); }
            let neighbors = bucketZ.get(cellZ);
            if (!neighbors) { neighbors = []; bucketZ.set(cellZ, neighbors); }
            neighbors.push(id);
          }
          if (!exactY) { exactY = new Map(); exact.set(px, exactY); }
          if (!exactZ) { exactZ = new Map(); exactY.set(py, exactZ); }
          exactZ.set(pz, id);
        }
        ids.push(id);
      }
      if (ids[0] !== ids[1] && ids[0] !== ids[2] && ids[1] !== ids[2]) faces.push(ids);
    }
    const positions = new Float32Array(faces.length * 9), normals = new Float32Array(faces.length * 9);
    let offset = 0;
    for (const face of faces) for (const id of face) {
      positions.set(points[id], offset); normals.set(vertexNormals[id], offset); offset += 3;
    }
    return {...mesh, positions, normals, triangleCount: faces.length, weldTolerance: tolerance};
  }

  function buildMesh(id, resolution) {
    const model = typeof id === 'string' ? getModel(id) : id;
    if (!model || typeof model.value !== 'function') throw new TypeError('Mesh construction needs a surface model or model ID.');
    const counts = gridResolution(model.bounds, resolution === undefined ? model.meshResolution : resolution);
    const nx = counts[0], ny = counts[1], nz = counts[2];
    const sx = nx + 1, sy = ny + 1;
    const planeSize = sx * sy;
    const coordinate = axis => Array.from({ length: counts[axis] + 1 }, (_, i) => model.bounds[0][axis] + i * (model.bounds[1][axis] - model.bounds[0][axis]) / counts[axis]);
    const xs = coordinate(0), ys = coordinate(1), zs = coordinate(2);
    const values = new Float64Array(sx * sy * (nz + 1));
    for (let z = 0; z <= nz; z += 1) {
      for (let y = 0; y <= ny; y += 1) {
        for (let x = 0; x <= nx; x += 1) values[x + sx * y + planeSize * z] = model.value([xs[x], ys[y], zs[z]]);
      }
    }
    const gridPoint = index => {
      const z = Math.floor(index / planeSize);
      const inPlane = index - z * planeSize;
      const y = Math.floor(inPlane / sx);
      return [xs[inPlane - y * sx], ys[y], zs[z]];
    };
    const edgeCache = new Map();
    const positions = [];
    const normals = [];

    function intersection(a, b) {
      if (a > b) { const oldA = a; a = b; b = oldA; }
      const key = a + ':' + b;
      if (edgeCache.has(key)) return edgeCache.get(key);
      const first = gridPoint(a), second = gridPoint(b);
      const fraction = values[a] / (values[a] - values[b]);
      const interpolated = first.map((v, axis) => v + fraction * (second[axis] - v));
      const p = model.project(interpolated);
      const result = { p, n: model.normal(p) };
      edgeCache.set(key, result);
      return result;
    }

    function triangle(a, b, c) {
      const ab = b.p.map((v, axis) => v - a.p[axis]);
      const ac = c.p.map((v, axis) => v - a.p[axis]);
      const faceNormal = cross(ab, ac);
      if (dot(faceNormal, faceNormal) < 1e-24) return;
      const averageNormal = a.n.map((v, axis) => v + b.n[axis] + c.n[axis]);
      if (dot(faceNormal, averageNormal) < 0) { const oldB = b; b = c; c = oldB; }
      positions.push(...a.p, ...b.p, ...c.p);
      normals.push(...a.n, ...b.n, ...c.n);
    }

    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const origin = x + sx * y + planeSize * z;
          const cube = [origin, origin + 1, origin + sx + 1, origin + sx,
            origin + planeSize, origin + planeSize + 1, origin + planeSize + sx + 1, origin + planeSize + sx];
          let negativeCount = 0;
          for (const vertex of cube) if (values[vertex] < 0) negativeCount += 1;
          if (negativeCount === 0 || negativeCount === 8) continue;
          for (const tetrahedron of tetrahedra) {
            const inside = [], outside = [];
            for (const corner of tetrahedron) {
              const vertex = cube[corner];
              (values[vertex] < 0 ? inside : outside).push(vertex);
            }
            if (inside.length === 0 || inside.length === 4) continue;
            if (inside.length === 1 || inside.length === 3) {
              const isolated = inside.length === 1 ? inside[0] : outside[0];
              const remaining = inside.length === 1 ? outside : inside;
              triangle(intersection(isolated, remaining[0]), intersection(isolated, remaining[1]), intersection(isolated, remaining[2]));
            } else {
              const a = intersection(inside[0], outside[0]);
              const b = intersection(inside[0], outside[1]);
              const c = intersection(inside[1], outside[0]);
              const d = intersection(inside[1], outside[1]);
              triangle(a, b, d);
              triangle(a, d, c);
            }
          }
        }
      }
    }
    return weldSlivers({positions: new Float32Array(positions), normals: new Float32Array(normals),
      triangleCount: positions.length / 9, resolution: counts, bounds: model.bounds.map(p => p.slice())});
  }

  return { getModel, buildMesh, modelIds: ['torus', 'double', 'triple'], TAU };
}));
