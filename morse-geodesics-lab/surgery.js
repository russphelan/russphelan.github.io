/* Mesh pieces for the actual round-torus connected sum. The moving pieces are
 * rigid: the annulus revealed during gluing is the final target surface itself.
 */
(function (root, factory) {
  'use strict';
  const surfaces = typeof module === 'object' && module.exports ? require('./surface.js') : root.GeodesicSurface;
  const api = factory(surfaces);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeodesicSurgery = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (surfaces) {
  'use strict';

  // Cut on the unchanged round torus exactly where the selected collar begins.
  // Keeping this tied to the production profile avoids exposing a replacement
  // disc through an already modified shoulder when a neck shape changes.
  const CUT_DISTANCE = surfaces.getModel('double').neckProfile.seamX;
  const INCOMING_OFFSET = [1.2, 0, 1.4];
  const cache = new Map();
  const TAU = 2 * Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const difference = (a, b) => a.map((v, i) => v - b[i]);
  const ease = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const interval = (t, start, end) => ease((t - start) / (end - start));
  const floatPoint = p => Array.from(new Float32Array(p));

  function modelId(count) {
    if (count === 1) return 'torus';
    if (count === 2) return 'double';
    if (count === 3) return 'triple';
    throw new RangeError('The surgery demonstration supports one, two, or three summands.');
  }

  // Exact star-shaped oval cut from the original round torus by x=center±cut.
  // CUT_DISTANCE lies strictly between R-r and R+r, so this slice is one oval.
  function boundaryPoint(center, side, theta, cutDistance = CUT_DISTANCE) {
    const torus = surfaces.getModel('torus'), R = torus.majorRadius, r = torus.minorRadius;
    const a = cutDistance * cutDistance + R * R - r * r;
    const b = 2 * a - 4 * R * R * Math.cos(theta) ** 2;
    const c = a * a - 4 * R * R * cutDistance * cutDistance;
    const discriminant = Math.sqrt(b * b - 4 * c);
    const radiusSquared = b >= 0 ? -2 * c / (b + discriminant) : (-b + discriminant) / 2;
    const radius = Math.sqrt(radiusSquared);
    return [center + side * cutDistance, radius * Math.cos(theta), radius * Math.sin(theta)];
  }

  function emit(faces, a, b, c) {
    if (a.key === b.key || b.key === c.key || c.key === a.key) return;
    faces.push([a, b, c]);
  }

  function pack(faces, role) {
    const positions = new Float32Array(faces.length * 9), normals = new Float32Array(faces.length * 9);
    let offset = 0;
    for (const face of faces) for (const vertex of face) {
      positions.set(vertex.p, offset); normals.set(vertex.n, offset); offset += 3;
    }
    return {positions, normals, triangleCount: faces.length, role};
  }

  function getBoundary(faces, planeIndex, center, side) {
    const vertices = new Map(), edges = new Map();
    for (const face of faces) for (let i = 0; i < 3; i += 1) {
      const a = face[i], b = face[(i + 1) % 3];
      if (a.plane === planeIndex && b.plane === planeIndex) {
        vertices.set(a.key, a); vertices.set(b.key, b);
        const key = a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key;
        if (!edges.has(key)) edges.set(key, {a: a.key, b: b.key, count: 0});
        edges.get(key).count += 1;
      }
    }
    const neighbors = new Map();
    for (const edge of edges.values()) if (edge.count === 1) {
      for (const [a, b] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        if (!neighbors.has(a)) neighbors.set(a, []);
        neighbors.get(a).push(b);
      }
    }
    for (const adjacent of neighbors.values()) if (adjacent.length !== 2) throw new Error('A cut boundary must be a closed, unbranched oval.');
    // Follow the actual mesh boundary edges. Sorting by polar angle can swap
    // nearly coincident vertices of a very thin clipped triangle and leave a crack.
    const first = neighbors.keys().next().value, ordered = [];
    let previous = null, current = first;
    do {
      if (ordered.length > neighbors.size) throw new Error('A cut boundary did not close.');
      ordered.push(vertices.get(current));
      const adjacent = neighbors.get(current);
      const next = adjacent[0] === previous ? adjacent[1] : adjacent[0];
      previous = current; current = next;
    } while (current !== first);
    if (ordered.length !== neighbors.size) throw new Error('A torus cap cut must have exactly one boundary component.');
    const angleSteps = ordered.map((vertex, i) => {
      const next = ordered[(i + 1) % ordered.length];
      const change = Math.atan2(next.p[2], next.p[1]) - Math.atan2(vertex.p[2], vertex.p[1]);
      return Math.atan2(Math.sin(change), Math.cos(change));
    });
    const direction = Math.sign(angleSteps.reduce((sum, v) => sum + v, 0));
    if (angleSteps.some(change => change * direction < -1e-7)) {
      const error = new Error('This target mesh is too coarse at the torus cut; use the model meshResolution.');
      error.code = 'SURGERY_CUT_RESOLUTION';
      throw error;
    }
    if (ordered.length < 8) throw new Error('The torus cut did not produce a resolved boundary oval.');
    const positions = new Float32Array(ordered.length * 3), normals = new Float32Array(ordered.length * 3);
    ordered.forEach((v, i) => { positions.set(v.p, 3 * i); normals.set(v.n, 3 * i); });
    return {positions, normals, vertexCount: ordered.length, closed: true, cutX: center + side * CUT_DISTANCE,
      center, side, cutDistance: CUT_DISTANCE, records: ordered};
  }

  function torusEdgeCut(a, b, center, side, fallbackAngle) {
    const torus = surfaces.getModel('torus'), R = torus.majorRadius, r = torus.minorRadius;
    const coordinates = vertex => {
      const x = side * (vertex.p[0] - center), y = vertex.p[1], z = vertex.p[2];
      return [Math.atan2(y, x), Math.atan2(z, Math.hypot(x, y) - R)];
    };
    const first = coordinates(a), last = coordinates(b),
      change = first.map((value, i) => Math.atan2(Math.sin(last[i] - value), Math.cos(last[i] - value)));
    const axial = t => (R + r * Math.cos(first[1] + t * change[1])) * Math.cos(first[0] + t * change[0]) - CUT_DISTANCE;
    const start = axial(0), end = axial(1);
    if (start * end > 0) return boundaryPoint(center, side, fallbackAngle);
    // Intersect the curved torus parameter edge, not the straight 3D facet.
    // Radially projecting a straight-facet intersection can reverse neighboring
    // angles on the thin, nonconvex cut oval. The parameter chart keeps their
    // order and the same shared vertex on both sides of the cut, with no edge
    // collapse, removed triangle, or folded cap.
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 42; iteration += 1) {
      const middle = (low + high) / 2;
      if (axial(middle) * start > 0) low = middle;
      else high = middle;
    }
    const amount = (low + high) / 2, q = torus.point(first[0] + amount * change[0], first[1] + amount * change[1]);
    return [center + side * CUT_DISTANCE, q[1], q[2]];
  }

  function discFromBoundary(boundary, radialSteps = 14) {
    const torus = surfaces.getModel('torus'), center = boundary.center, side = boundary.side;
    const ring = boundary.records;
    const coordinates = ring.map(vertex => {
      const y = vertex.p[1], z = vertex.p[2];
      return [Math.atan2(y, CUT_DISTANCE), Math.atan2(z, Math.hypot(CUT_DISTANCE, y) - torus.majorRadius)];
    });
    const tipPoint = [center + side * (torus.majorRadius + torus.minorRadius), 0, 0];
    const tip = {p: tipPoint, n: [side, 0, 0], key: tipPoint.join(',')};
    const rings = [];
    for (let layer = 1; layer <= radialSteps; layer += 1) {
      if (layer === radialSteps) { rings.push(ring); continue; }
      const amount = layer / radialSteps;
      rings.push(coordinates.map(([u, v]) => {
        const local = torus.point(amount * u, amount * v);
        local[0] *= side;
        const p = floatPoint([center + local[0], local[1], local[2]]);
        const n = torus.normal([p[0] - center, p[1], p[2]]);
        return {p, n, key: p.join(',')};
      }));
    }
    const faces = [];
    function outward(a, b, c) {
      const faceNormal = cross(difference(b.p, a.p), difference(c.p, a.p));
      const average = a.n.map((v, i) => v + b.n[i] + c.n[i]);
      if (dot(faceNormal, average) < 0) emit(faces, a, c, b);
      else emit(faces, a, b, c);
    }
    for (let i = 0; i < ring.length; i += 1) outward(tip, rings[0][i], rings[0][(i + 1) % ring.length]);
    for (let layer = 0; layer < rings.length - 1; layer += 1) {
      for (let i = 0; i < ring.length; i += 1) {
        const next = (i + 1) % ring.length;
        outward(rings[layer][i], rings[layer + 1][i], rings[layer + 1][next]);
        outward(rings[layer][i], rings[layer + 1][next], rings[layer][next]);
      }
    }
    return pack(faces, side > 0 ? 'removedOld' : 'removedNew');
  }

  function buildPieces(targetMesh, oldCenter, newCenter) {
    const cuts = [oldCenter + CUT_DISTANCE, newCenter - CUT_DISTANCE];
    const vertexCache = new Map(), intersectionCache = new Map(), cutVertices = new Map();
    const torus = surfaces.getModel('torus');
    function vertexAt(offset) {
      const p = [targetMesh.positions[offset], targetMesh.positions[offset + 1], targetMesh.positions[offset + 2]], key = p.join(',');
      if (!vertexCache.has(key)) vertexCache.set(key, {p, key, n: [targetMesh.normals[offset], targetMesh.normals[offset + 1], targetMesh.normals[offset + 2]]});
      return vertexCache.get(key);
    }
    function intersection(a, b, plane) {
      const edgeKey = plane + '|' + (a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key);
      if (intersectionCache.has(edgeKey)) return intersectionCache.get(edgeKey);
      const amount = (cuts[plane] - a.p[0]) / (b.p[0] - a.p[0]);
      const y = a.p[1] + amount * (b.p[1] - a.p[1]), z = a.p[2] + amount * (b.p[2] - a.p[2]);
      const center = plane === 0 ? oldCenter : newCenter, side = plane === 0 ? 1 : -1;
      const p = floatPoint(torusEdgeCut(a, b, center, side, Math.atan2(z, y)));
      const key = p.join(','), canonicalKey = plane + '|' + key;
      if (!cutVertices.has(canonicalKey)) cutVertices.set(canonicalKey,
        {p, key, plane, n: torus.normal([p[0] - center, p[1], p[2]])});
      const result = cutVertices.get(canonicalKey);
      intersectionCache.set(edgeKey, result);
      return result;
    }
    function clip(polygon, plane, keepLess) {
      const result = [];
      let previous = polygon[polygon.length - 1];
      let previousInside = keepLess ? previous.p[0] <= cuts[plane] : previous.p[0] >= cuts[plane];
      for (const current of polygon) {
        const currentInside = keepLess ? current.p[0] <= cuts[plane] : current.p[0] >= cuts[plane];
        if (currentInside !== previousInside) result.push(intersection(previous, current, plane));
        if (currentInside) result.push(current);
        previous = current; previousInside = currentInside;
      }
      return result;
    }
    const retained = [], incoming = [], join = [];
    function triangulate(polygon, faces) {
      for (let i = 1; i < polygon.length - 1; i += 1) emit(faces, polygon[0], polygon[i], polygon[i + 1]);
    }
    for (let offset = 0; offset < targetMesh.positions.length; offset += 9) {
      const triangle = [vertexAt(offset), vertexAt(offset + 3), vertexAt(offset + 6)];
      if (triangle.every(v => v.p[0] <= cuts[0])) { retained.push(triangle); continue; }
      if (triangle.every(v => v.p[0] >= cuts[1])) { incoming.push(triangle); continue; }
      if (triangle.every(v => v.p[0] >= cuts[0] && v.p[0] <= cuts[1])) { join.push(triangle); continue; }
      triangulate(clip(triangle, 0, true), retained);
      triangulate(clip(triangle, 1, false), incoming);
      const above = clip(triangle, 0, false);
      if (above.length) triangulate(clip(above, 1, true), join);
    }
    const oldBoundary = getBoundary(retained, 0, oldCenter, 1), newBoundary = getBoundary(incoming, 1, newCenter, -1);
    const meshes = {retained: pack(retained, 'retained'), incoming: pack(incoming, 'incoming'),
      removedOld: discFromBoundary(oldBoundary), removedNew: discFromBoundary(newBoundary), join: pack(join, 'join'), target: targetMesh};
    // Internal records are not exposed or needed after constructing the matching caps.
    delete oldBoundary.records; delete newBoundary.records;
    return {cuts, meshes, boundaries: {old: oldBoundary, new: newBoundary}};
  }

  function prepareTransition(fromId, options = {}) {
    if (typeof fromId === 'number') fromId = modelId(fromId);
    const source = surfaces.getModel(fromId);
    if (source.count !== 1 && source.count !== 2) throw new RangeError('A connected sum can be animated from one or two summands.');
    const toId = modelId(source.count + 1), target = surfaces.getModel(toId);
    const cacheKey = fromId + '|' + JSON.stringify(options.resolution || target.meshResolution);
    if (!options.targetMesh && cache.has(cacheKey)) return cache.get(cacheKey);
    const oldCenter = source.centers[source.centers.length - 1], newCenter = target.centers[target.centers.length - 1];
    let targetMesh = options.targetMesh || surfaces.buildMesh(target, options.resolution || target.meshResolution);
    let pieces;
    try { pieces = buildPieces(targetMesh, oldCenter, newCenter); }
    catch (error) {
      // Coarse marching triangles can backtrack after projection onto the exact
      // oval. Refine during preparation, never during playback, instead of
      // sweeping a folded or cracked replacement disc across that boundary.
      if (error.code !== 'SURGERY_CUT_RESOLUTION' || options.targetMesh || !options.resolution) throw error;
      targetMesh = surfaces.buildMesh(target, target.meshResolution);
      pieces = buildPieces(targetMesh, oldCenter, newCenter);
    }
    const bounds = target.bounds.map(p => p.slice());
    bounds[1][0] += INCOMING_OFFSET[0]; bounds[1][2] = 3.1;
    const midpoint = (pieces.cuts[0] + pieces.cuts[1]) / 2;
    const plan = {fromId, toId, fromCount: source.count, toCount: target.count, geometryVersion: target.geometryVersion,
      cutDistance: CUT_DISTANCE, oldCenter, newCenter, midpoint, durationMs: 10000,
      cuts: pieces.cuts, bounds, meshes: pieces.meshes, boundaries: pieces.boundaries};
    hydratePlan(plan);
    if (!options.targetMesh) cache.set(cacheKey, plan);
    return plan;
  }

  // Worker messages carry the exact prepared arrays and metadata; only these
  // lightweight runtime functions are reattached on the drawing thread.
  function hydratePlan(plan) {
    if (!plan || typeof plan !== 'object') throw new TypeError('A prepared surgery plan is required.');
    const source = surfaces.getModel(plan.fromId), target = surfaces.getModel(plan.toId);
    if (source.count < 1 || source.count > 2 || target.count !== source.count + 1 ||
        plan.fromCount !== source.count || plan.toCount !== target.count || plan.geometryVersion !== target.geometryVersion)
      throw new RangeError('The prepared surgery plan does not match the current surface geometry.');
    if (!Array.isArray(plan.cuts) || plan.cuts.length !== 2 || !plan.cuts.every(Number.isFinite) || !(plan.cuts[0] < plan.cuts[1]) ||
        !Number.isFinite(plan.midpoint) || !(plan.durationMs > 0) || !plan.meshes || !plan.boundaries || !plan.meshes.target)
      throw new RangeError('The prepared surgery plan is incomplete.');
    const oldCenter = source.centers[source.centers.length - 1], newCenter = target.centers[target.centers.length - 1];
    if (plan.cutDistance !== CUT_DISTANCE || plan.oldCenter !== oldCenter || plan.newCenter !== newCenter ||
        Math.abs(plan.cuts[0] - (oldCenter + CUT_DISTANCE)) > 1e-10 ||
        Math.abs(plan.cuts[1] - (newCenter - CUT_DISTANCE)) > 1e-10 ||
        Math.abs(plan.midpoint - (oldCenter + newCenter) / 2) > 1e-10)
      throw new RangeError('The prepared surgery cuts do not match the selected collar geometry.');
    const validArrays = part => part && Object.prototype.toString.call(part.positions) === '[object Float32Array]' &&
      Object.prototype.toString.call(part.normals) === '[object Float32Array]' && part.positions.length > 0 &&
      part.positions.length === part.normals.length && part.positions.length % 3 === 0;
    if (!['retained', 'incoming', 'removedOld', 'removedNew', 'join', 'target'].every(key => validArrays(plan.meshes[key])) ||
        !['old', 'new'].every(key => validArrays(plan.boundaries[key])))
      throw new RangeError('The prepared surgery geometry is incomplete.');
    plan.sectionAt = (x, count = 64) => {
      if (!Number.isFinite(x) || x < plan.cuts[0] - 1e-6 || x > plan.cuts[1] + 1e-6) {
        throw new RangeError('A collar section must lie between the two cut planes.');
      }
      if (!Number.isSafeInteger(count) || count < 3) throw new RangeError('A section needs at least three vertices.');
      // WebGL clips with a float uniform. Matching its rounded x coordinate
      // keeps the highlighted ring on the visible, moving open boundary.
      const cutX = Math.fround(clamp(x, plan.cuts[0], plan.cuts[1]));
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        const angle = TAU * i / count, cosine = Math.cos(angle), sine = Math.sin(angle);
        if (typeof target.neckSection === 'function') {
          // The analytic selected profile supplies the exact stadium/shoulder
          // section and normal without a radial solve on every animation frame.
          const section = target.neckSection(cutX, angle), p = floatPoint(section.point);
          positions.set(p, 3 * i); normals.set(section.normal, 3 * i);
          continue;
        }
        let low = 0, high = 2;
        const value = radius => target.value([cutX, radius * cosine, radius * sine]);
        if (!(value(low) < 0)) throw new Error('The connected-sum section has no interior on its axis.');
        while (value(high) <= 0 && high < 16) high *= 2;
        if (!(value(high) > 0)) throw new Error('The connected-sum section could not be bracketed.');
        for (let iteration = 0; iteration < 28; iteration += 1) {
          const radius = (low + high) / 2;
          if (value(radius) < 0) low = radius;
          else high = radius;
        }
        const radius = (low + high) / 2;
        const p = floatPoint([cutX, radius * cosine, radius * sine]);
        positions.set(p, 3 * i); normals.set(target.normal(p), 3 * i);
      }
      return {positions, normals, vertexCount: count, cutX, closed: true};
    };
    plan.sample = t => {
      t = clamp(Number.isFinite(t) ? t : 0, 0, 1);
      const cutting = interval(t, 0.14, 0.35), alignment = interval(t, 0.36, 0.60);
      const joinProgress = interval(t, 0.60, 0.94);
      const incomingTranslation = INCOMING_OFFSET.map(v => v * (1 - alignment));
      const discOpacity = 1 - interval(t, 0.23, 0.35);
      const phase = t < 0.14 ? 'Separate surfaces' : t < 0.36 ? 'Removing the discs' : t < 0.60 ? 'Aligning the boundaries' : t < 0.94 ? 'Attaching the smooth neck' : 'Connected sum complete';
      const piece = (key, translation, opacity = 1) => ({key, mesh: plan.meshes[key], translation, opacity, visible: opacity > 0});
      return {t, phase, joinProgress, complete: t >= 1,
        gap: [plan.cuts[0] + joinProgress * (plan.midpoint - plan.cuts[0]), plan.cuts[1] - joinProgress * (plan.cuts[1] - plan.midpoint)],
        pieces: [piece('retained', [0, 0, 0]), piece('incoming', incomingTranslation),
          piece('removedOld', [-0.18 * cutting, 0, 1.05 * cutting], discOpacity),
          piece('removedNew', incomingTranslation.map((v, i) => v + [0.18 * cutting, 0, 1.05 * cutting][i]), discOpacity),
          piece('join', [0, 0, 0], t >= 0.60 ? 1 : 0)]};
    };
    return plan;
  }

  function serializePlan(plan) {
    const {sample, sectionAt, ...data} = plan;
    return data;
  }

  return Object.freeze({prepareTransition, hydratePlan, serializePlan, boundaryPoint, cutDistance: CUT_DISTANCE, incomingOffset: INCOMING_OFFSET.slice(), availableFromIds: ['torus', 'double']});
}));
