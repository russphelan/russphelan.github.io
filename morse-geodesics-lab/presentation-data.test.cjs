'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('./surface.js');
const Solver=require('./solver.js');
const Jacobi=require('./jacobi.js');
const catalogue=require('./presentation-data.js');
const distance=(p,q)=>Math.hypot(...p.map((v,k)=>v-q[k]));

test('presentation fixes identical endpoints outside every surgery patch and uses one ambient index cutoff',()=>{
  assert.equal(catalogue.schemaVersion,1);
  assert.equal(catalogue.normalCurvature,.36);
  assert.equal(catalogue.indexCutoff,24);
  const {p,q}=catalogue.endpoints;
  assert.equal(p[2],0);assert.equal(q[2],0);
  assert.ok(p[0]<0&&q[0]<0);
  for(const id of S.modelIds){
    const model=S.getModel(id);
    assert.deepEqual(model.endpoints.presentation,{p,q,label:'Fixed in the original torus'});
    assert.equal(model.geometryVersion,catalogue.stages[id].geometryVersion);
    assert.equal(model.geometryVersion,catalogue.geometryVersions[id]);
    for(const point of [p,q])assert.ok(Math.abs(model.value(point))<1e-12);
    for(const curve of catalogue.stages[id].curves){
      assert.ok(curve.index<=catalogue.indexCutoff&&!curve.nearConjugate);
      assert.ok(distance(curve.points[0],p)<1e-8);
      assert.ok(distance(curve.points.at(-1),q)<2e-5);
    }
  }
});

test('each presentation stage retains its verified predecessors and adds four actual new-summand excursions',()=>{
  let previous=[];
  for(const [k,id]of S.modelIds.entries()){
    const model=S.getModel(id),stage=catalogue.stages[id];
    assert.equal(stage.count,4*(k+1));assert.equal(stage.newCount,4);
    assert.equal(stage.curves.length,stage.count);
    for(const old of previous){
      const retained=stage.curves.find(c=>c.id===old.id);
      assert.ok(retained);
      assert.ok(Solver.angleDistance(retained.theta,old.theta)<1e-7);
      assert.ok(Math.abs(retained.length-old.length)<1e-7);
      assert.equal(retained.index,old.index);
    }
    const added=stage.curves.filter(c=>c.presentation.group===k+1);
    assert.equal(added.length,4);
    for(const c of added){
      assert.equal(c.presentation.maxBody,k+1);
      const maxX=Math.max(...c.points.map(p=>p[0]));
      assert.ok(maxX>model.centers[k]-(model.neckSeamX??1.05),`path ${c.id} must enter body ${k+1}`);
      if(k>0)assert.ok(c.points.some(p=>p[0]>model.centers[k]-(model.neckSeamX??1.05)));
      assert.ok(Math.max(...c.points.map(p=>Math.abs(p[2])))>.1,'new routes must be visually distinct off-plane paths');
    }
    for(let i=0;i<stage.curves.length;i++)for(let j=i+1;j<stage.curves.length;j++)
      assert.ok(!Solver.duplicate(stage.curves[i],stage.curves[j]));
    previous=stage.curves;
  }
});

test('all 24 stored stage records reproduce their endpoint, full ambient index, and Jacobi convergence',()=>{
  for(const id of S.modelIds){
    const model=S.getModel(id);
    for(const curve of catalogue.stages[id].curves){
      assert.ok(curve.verification.converged);
      assert.ok(curve.residual<=2e-5&&curve.refinementError<=2e-5);
      const fields=Jacobi.prepare(curve,model,catalogue.normalCurvature);
      assert.ok(fields.verification.converged,curve.id);
      assert.equal(fields.index,curve.index,curve.id);
      assert.ok(distance(fields.endpoint,catalogue.endpoints.q)<2e-5,curve.id);
      assert.equal(fields.endpointEvents.length,0,'presentation paths must have nonconjugate endpoints');
      assert.equal(curve.normalIndex,Solver.normalIndex(curve.length,catalogue.normalCurvature));
    }
  }
});

test('reflected pairs have matching lengths and index but occupy opposite sides of the surface',()=>{
  for(const id of S.modelIds){
    const curves=catalogue.stages[id].curves;
    for(let i=0;i<curves.length;i+=2){
      const a=curves[i],b=curves[i+1];
      assert.ok(Math.abs(a.length-b.length)<1e-6);
      assert.equal(a.index,b.index);
      assert.ok(Solver.angleDistance(a.theta,2*Math.PI-b.theta)<1e-6);
      assert.ok(a.points.some(p=>Math.abs(p[2])>.1));
      assert.ok(b.points.some(p=>Math.abs(p[2])>.1));
    }
  }
});
