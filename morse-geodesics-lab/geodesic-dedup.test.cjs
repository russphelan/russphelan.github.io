'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Solver=require('./solver.js');
function curve(sign=1,count=65){
  const length=25,points=[],jacobi=[];
  for(let i=0;i<count;i++){
    // Uneven stations ensure comparisons use arclength, rather than array index.
    const t=(i/(count-1))**1.2;
    points.push([length*t,.2*Math.sin(Math.PI*t),sign*.45*Math.sin(2*Math.PI*t)]);
    jacobi.push({s:length*t});
  }
  return {theta:Math.PI+sign*.0012,length,points,jacobi};
}
test('nearby shooting parameters retain geometrically distinct reflected geodesics',()=>{
  const a=curve(1),b=curve(-1);
  assert.ok(Solver.angleDistance(a.theta,b.theta)<.004);
  assert.equal(Solver.duplicate(a,b),false);
  assert.equal(Solver.duplicate(a,Solver.searchSeed(b)),false);
  assert.equal(Solver.duplicate(Solver.searchSeed(a),Solver.searchSeed(b)),false);
});
test('the same trajectory deduplicates across sample densities and compact worker witnesses',()=>{
  const a=curve(1,65),b=curve(1,129);
  assert.equal(Solver.duplicate(a,b),true);
  const seed=Solver.searchSeed(a);
  assert.equal(seed.pathWitness.length,17);assert.equal(seed.points,undefined);assert.equal(seed.jacobi,undefined);
  assert.equal(Solver.duplicate(b,seed),true);
  seed.pathWitness[0][0]=100;
  assert.equal(Solver.searchSeed(a).pathWitness[0][0],0,'Worker descriptors cannot mutate cached witnesses.');
});
test('metadata-only callers retain the existing near-shot fallback and angle wrapping',()=>{
  assert.equal(Solver.duplicate({theta:0,length:4},{theta:2*Math.PI-.001,length:4.001}),true);
  assert.equal(Solver.duplicate({theta:0,length:4},{theta:.01,length:4}),false);
  assert.equal(Solver.duplicate({theta:0,length:4},{theta:0,length:4.03}),false);
  assert.deepEqual(Solver.searchSeed({theta:1,length:4}),{theta:1,length:4});
});
