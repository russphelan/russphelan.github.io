'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('./surface.js');
const Solver=require('./solver.js');
const Jacobi=require('./jacobi.js');
const data=require('./showcase-data.js');
const distance=(p,q)=>Math.hypot(...p.map((v,k)=>v-q[k]));

test('Jacobi presentation picks retain the presentation endpoints and common cutoff',()=>{
  const model=S.getModel('double');
  assert.deepEqual(data.endpoints,{p:model.endpoints.presentation.p,q:model.endpoints.presentation.q});
  assert.equal(data.normalCurvature,.36);assert.equal(data.indexCutoff,24);
  assert.equal(data.curves.length,2);assert.equal(data.picks.length,2);
  assert.ok(!Solver.duplicate(...data.curves));
  for(const curve of data.curves){
    assert.equal(curve.geometryVersion,data.geometryVersion);
    assert.ok(curve.index<=24&&!curve.nearConjugate);
    assert.ok(distance(curve.points[0],data.endpoints.p)<1e-8);
    assert.ok(distance(curve.points.at(-1),data.endpoints.q)<2e-5);
  }
});

test('each selected +1 and +2 event reproduces with clear fixed-scale ribbon widths',()=>{
  const model=S.getModel('double');
  for(const pick of data.picks){
    const curve=data.curves.find(c=>c.id===pick.curveId),fields=Jacobi.prepare(curve,model,.36);
    assert.ok(fields.verification.converged);
    assert.equal(fields.index,curve.index);assert.equal(fields.endpointEvents.length,0);
    assert.ok(distance(fields.endpoint,data.endpoints.q)<2e-5);
    const surface=fields.interiorEvents.find(e=>Math.abs(e.s-pick.surfaceEventS)<1e-7);
    const hidden=fields.interiorEvents.find(e=>Math.abs(e.s-pick.hiddenEventS)<1e-7);
    assert.ok(surface?.surface&&!surface.hidden&&surface.multiplicity===1);
    assert.ok(hidden?.hidden&&!hidden.surface&&hidden.multiplicity===2);
    const near=Math.min(...[-.4,.4].map(t=>Math.abs(fields.sampleAt(surface.s+t).j)/fields.maxSurfaceAmplitude));
    const open=Math.abs(fields.sampleAt(hidden.s).j)/fields.maxSurfaceAmplitude;
    assert.ok(near>(pick.id==='clear-pinch'?.07:.18));
    assert.ok(open>(pick.id==='clear-pinch'?.14:.30));
    assert.ok(Math.abs(surface.s-hidden.s)>.7);
    assert.equal(pick.ribbon.mode,'amplitude');assert.equal(pick.ribbon.power,.5);
    assert.equal(pick.ribbon.halfWidth,.22);
  }
});
