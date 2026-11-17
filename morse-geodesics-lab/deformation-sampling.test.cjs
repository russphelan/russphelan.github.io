'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sampling=require('./deformation-sampling.js'),Downhill=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js');
const near=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<tolerance,`${a} versus ${b}`);
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,k)=>v-b[k]);
function turn(points){
  let maximum=0;
  for(let i=1;i<points.length-1;i++){
    const a=sub(points[i],points[i-1]),b=sub(points[i+1],points[i]);
    maximum=Math.max(maximum,Math.acos(Math.max(-1,Math.min(1,a.reduce((v,x,k)=>v+x*b[k],0)/(norm(a)*norm(b))))));
  }
  return maximum;
}

test('adaptive vertices resolve a localized bend without moving or smoothing the underlying curve',()=>{
  const evaluate=s=>({s,point:[s,.2*Math.exp(-(((s-.45)/.025)**2)),0]});
  const result=Sampling.sampleCurve(evaluate,1);
  assert.equal(result.diagnostics.limited,false);
  assert.ok(result.diagnostics.maxSagitta<=.00012*(1+1e-10));
  assert.ok(result.diagnostics.maxTurn<=.03*(1+1e-10));
  assert.ok(turn(result.displayPoints)<.05,'Adjacent drawing chords also follow the bend smoothly.');
  assert.ok(result.points.filter(p=>p.s>.4&&p.s<.5).length>result.points.filter(p=>p.s<.1).length*5,'Vertices concentrate around the bend.');
  for(const p of result.points)assert.deepEqual(p.point,evaluate(p.s).point);
  assert.equal(result.points[0].s,0);assert.equal(result.points.at(-1).s,1);
});

test('mode-aware seeds retain every alternating lobe, including midpoint-aliasing modes',()=>{
  const mode=32,T=3,result=Sampling.sampleCurve(s=>[s,.1*Math.sin(mode*Math.PI*s/T),0],T,{mode});
  assert.equal(result.diagnostics.limited,false);
  for(let i=0;i<mode;i++){
    const expected=T*(i+.5)/mode,p=result.points.find(p=>Math.abs(p.s-expected)<1e-12);
    assert.ok(p,'Every mode extremum is seeded.');near(p.point[1],i%2?-.1:.1);
  }
  assert.ok(result.points.length<14000);
});

test('mapping is evaluated during refinement, and budgets preserve endpoints and report unresolved bends',()=>{
  const evaluate=s=>({point:[s,0,0],hidden:Math.sin(6*Math.PI*s)});
  const mapped=Sampling.sampleCurve(evaluate,1,{mode:6,mapSample:p=>[p.s,p.hidden,0]});
  assert.ok(mapped.points.length>100);assert.equal(mapped.diagnostics.limited,false);
  for(let i=0;i<mapped.points.length;i++)assert.deepEqual(mapped.displayPoints[i],[mapped.points[i].s,mapped.points[i].hidden,0]);
  const limited=Sampling.sampleCurve(evaluate,1,{maxPoints:26,mapSample:p=>[p.s,p.hidden,0],seeds:[1-1e-14]});
  assert.ok(limited.diagnostics.limited);assert.equal(limited.points.length,26);
  assert.equal(limited.points[0].s,0);assert.equal(limited.points.at(-1).s,1);
});

test('surface drawing resolves a coarse compact-collar variation without changing modes or metric measurements',()=>{
  const curve=require('./catalogues/double-default.json').curves[21],model=S.getModel('double'),data=J.prepare(curve,model),T=7.29;
  for(const mode of [1,2]){
    const profile=Downhill.prepare({data,model,T,type:'surface',mode}),A=.12,result=profile.sample(A,0,{count:40}),snapshot=structuredClone(result);
    const study={type:'surface',T,mode,profile,data,amplitude:[A,0],result};
    const mesh=Sampling.sample(study,model),coarseTurn=turn(result.points.map(p=>p.point));
    assert.equal(mesh.diagnostics.limited,false);
    assert.ok(turn(mesh.displayPoints)<.05);assert.ok(turn(mesh.displayPoints)<coarseTurn/2);
    assert.deepEqual(mesh.points[0].point,result.points[0].point);assert.deepEqual(mesh.points.at(-1).point,result.points.at(-1).point);
    assert.deepEqual(result,snapshot,'Drawing does not mutate the sampled physical result.');
    assert.deepEqual(profile.sample(A,0,{count:40}),result,'The prepared mode and metric measurements are unchanged.');
    for(const p of mesh.points){near(p.f,profile.coefficient(p.s));assert.ok(Math.abs(model.value(p.point))<1e-8);}
  }
});

test('arbitrary hidden display evaluation retains exact sine profiles and original analytic tangents',()=>{
  const T=6,data={length:T,curvature:.36,events:[],sampleAt:s=>({point:[Math.cos(s),Math.sin(s),0],tangent:[-Math.sin(s),Math.cos(s),0]})};
  const model={normal:p=>p.slice(),project:p=>p.map(v=>v/norm(p)),curvature:()=>1};
  const profile=Downhill.prepare({data,model,T,type:'hidden',mode:3});
  for(const amplitude of [[.08,0],[0,.08]]){
    const result=profile.sample(...amplitude),sampled=Sampling.sample({T,type:'hidden',mode:3,profile,data,amplitude,result},model);
    assert.equal(sampled.diagnostics.limited,false);
    for(const p of sampled.points){
      assert.deepEqual(p.tangent,data.sampleAt(p.s).tangent);
      near(p.y[0],amplitude[0]*profile.coefficient(p.s));near(p.y[1],amplitude[1]*profile.coefficient(p.s));
    }
    assert.deepEqual(result.length,profile.length(...amplitude));
  }
});

test('exact display baselines are reused across amplitudes, protected from mutation, and bounded across modes and traversal',()=>{
  const maps=[];
  class TrackedMap extends Map{constructor(...args){super(...args);maps.push(this);}}
  const context={module:{exports:{}},Map:TrackedMap};vm.runInNewContext(fs.readFileSync(require.resolve('./downhill.js'),'utf8'),context);
  let evaluations=0;
  const data={length:6,curvature:.36,events:[],sampleAt:s=>{evaluations++;return {point:[s,0,0],tangent:[1,0,0]};}};
  const model={normal:()=>[0,0,1],project:p=>p.slice(),curvature:()=>0};
  const prepare=mode=>context.module.exports.prepare({data,model,T:6,type:'hidden',mode});
  const p=prepare(1),first=p.displaySampleAt(.1,0,2),snapshot=JSON.stringify(first),before=evaluations;
  const second=p.displaySampleAt(0,.08,2);assert.equal(evaluations,before,'Changing physical amplitude uses the same exact original sample.');
  first.original[0]=999;first.tangent[0]=999;first.normal[0]=999;
  assert.equal(JSON.stringify(p.displaySampleAt(.1,0,2)),snapshot,'Callers cannot corrupt a cached baseline.');
  near(second.y[1],.08*Math.sin(Math.PI/3));
  for(let i=0;i<33000;i++)p.displaySampleAt(.1,0,6*i/33000);
  assert.ok(maps.every(map=>map.size<=32768),'Arbitrary traversal cannot grow an unbounded display cache.');
  prepare(2).displaySampleAt(.1,0,2);prepare(3).displaySampleAt(.1,0,2);
  const evicted=evaluations;p.displaySampleAt(.1,0,2);assert.equal(evaluations,evicted+1,'Only two recent display profiles retain large baseline caches.');
  assert.equal(JSON.stringify(p.displaySampleAt(.1,0,2)),snapshot,'Eviction recomputes exactly the same mathematical data.');
});

test('invalid curves and tolerance configurations fail explicitly',()=>{
  assert.throws(()=>Sampling.sampleCurve(null,1),/drawing curve/);
  assert.throws(()=>Sampling.sampleCurve(s=>[s,0,0],1,{sagitta:0}),/tolerances/);
  assert.throws(()=>Sampling.sampleCurve(s=>[s,0,NaN],1),/finite three/);
  assert.throws(()=>Sampling.sample({},{}),/prepared finite/);
});
