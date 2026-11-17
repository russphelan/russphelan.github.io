'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./diagnostics.js');
const norm=p=>Math.hypot(...p),sub=(a,b)=>a.map((x,k)=>x-b[k]);
const near=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} versus ${b}`);
const cylinder={domain:()=>[-1,1],evaluate(profile,x,theta){
  const c=Math.cos(theta),s=Math.sin(theta),r=.4;
  return {point:[x,r*c,r*s],du:[1,0,0],dv:[0,-r*s,r*c],duu:[0,0,0],duv:[0,0,0],dvv:[0,-r*c,-r*s],normal:[0,c,s],principal:[0,1/r],gaussian:0,radius:r};
}};
const profile={id:'analytic-cylinder'};
test('cylinder curvature and straight meridian have the analytic scales without manufactured turning',()=>{
  const scan=D.scanCurvature(cylinder,profile,{nx:16,ntheta:16});
  near(scan.maxPrincipal,2.5);near(scan.maxAbsGaussian,0);near(scan.minArea,.4);near(scan.minRadius,.4);
  for(const direction of [1,2]){
    const probe=D.sampleProbe(cylinder,profile,{theta:.31,count:200,direction});
    near(probe.length,2);near(probe.metrics.maxNormalTurn,0);near(probe.metrics.maxAxisTurn,0);
    near(probe.metrics.appliedGain,3);near(probe.metrics.minForward,1);near(probe.metrics.peakDisplacement,.36);
    assert.deepEqual(probe.points[0].point,probe.points[0].original);assert.deepEqual(probe.points.at(-1).point,probe.points.at(-1).original);
    assert.match(probe.disclaimer,/common sine test envelope/);assert.match(probe.disclaimer,/not a recomputed geodesic/);
  }
});
test('zero push has no field and changing amplitude preserves the actual test-envelope ratios',()=>{
  const small=D.sampleProbe(cylinder,profile,{amplitude:.06,count:160}),large=D.sampleProbe(cylinder,profile,{amplitude:.12,count:160}),zero=D.sampleProbe(cylinder,profile,{amplitude:0,count:160});
  assert.equal(zero.guides.length,0);near(zero.metrics.peakDisplacement,0);
  for(let i=0;i<small.points.length;i++){
    near(norm(sub(large.points[i].point,large.points[i].original)),2*norm(sub(small.points[i].point,small.points[i].original)));
    assert.deepEqual(zero.points[i].point,zero.points[i].original);
  }
});
test('general probe frame derivatives agree with independent centered finite differences',()=>{
  // A varying-pitch winding on a cylinder has nonzero geodesic curvature;
  // a constant-pitch helix would itself be a geodesic on the cylinder.
  const twisted={domain:()=>[-1,1],evaluate(profile,x,theta){
    const r=.4,k=1.2,a=theta+k*x*x,v=2*k*x,acc=2*k,c=Math.cos(a),s=Math.sin(a);
    return {point:[x,r*c,r*s],du:[1,-r*v*s,r*v*c],dv:[0,-r*s,r*c],
      duu:[0,-r*(v*v*c+acc*s),r*(-v*v*s+acc*c)],duv:[0,-r*v*c,-r*v*s],
      dvv:[0,-r*c,-r*s],normal:[0,c,s],principal:[0,2.5],gaussian:0,radius:r};
  }};
  const probe=D.sampleProbe(twisted,profile,{theta:.4,count:2000,safety:false,gain:3});
  for(let i=10;i<probe.points.length-10;i+=37){
    const p=probe.points[i],before=probe.points[i-1],after=probe.points[i+1],ds=after.s-before.s;
    const velocity=sub(after.point,before.point).map(x=>x/ds);
    near(norm(velocity),p.displaySpeed,2e-5);
    near(velocity.reduce((sum,x,k)=>sum+x*p.tangent[k],0),p.forward,2e-5);
  }
});

test('oblique probes use the actual winding geometry and retain exact pinned endpoints',()=>{
  const probe=D.sampleObliqueProbe(cylinder,profile,{theta:.2,turn:Math.PI/2,count:200,direction:2});
  assert.equal(probe.probeKind,'oblique');near(probe.turn,Math.PI/2);
  near(probe.length,Math.hypot(2,.4*Math.PI/2));
  for(const p of [probe.points[0],probe.points.at(-1)])assert.deepEqual(p.point,p.original);
  for(let i=0;i<probe.points.length;i++){
    const p=probe.points[i],angle=.2+Math.PI/2*i/200;
    near(p.original[1],.4*Math.cos(angle));near(p.original[2],.4*Math.sin(angle));
  }
});
test('bad geometry and unresolved probe settings fail explicitly',()=>{
  assert.throws(()=>D.sampleProbe({},profile),/geometry evaluator/);
  assert.throws(()=>D.sampleProbe(cylinder,profile,{count:3}),/probe settings/);
  assert.throws(()=>D.scanCurvature(cylinder,profile,{ntheta:2}),/curvature grids/);
});
