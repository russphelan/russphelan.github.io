'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
function finish(iterator,between=()=>{}){
  let step,count=0;
  while(!(step=iterator.next()).done){assert.equal(step.value,undefined,'Unverified state must not escape through a checkpoint.');between(++count);}
  return step.value;
}
function plane(){
  let projections=0,curvatures=0;
  const model={normal:()=>[0,0,1],project:p=>{projections++;return p.slice();},curvature:()=>{curvatures++;return 0;},value:p=>p[2]};
  const data={length:12,events:[],sampleAt:s=>({s,point:[s,0,0],tangent:[1,0,0]})};
  return {model,data,counts:()=>({projections,curvatures})};
}
function metadata(p){return Object.fromEntries(Object.entries(p).filter(([,value])=>typeof value!=='function'));}
function originalHiddenMeasurements(radius,T,mode,curvature){
  const simpson=(fn,N)=>{let total=0;for(let i=0;i<=N;i++)total+=(i===0||i===N?1:i%2?4:2)*fn(i*T/N);return total*T/(3*N);};
  const omega=mode*Math.PI/T,N=Math.max(256,mode*128),baseline=T/2;
  const q=s=>{const wave=Math.sin(omega*s),velocity=radius*omega*Math.cos(omega*s),r=radius*wave;
    const warping=curvature>0?-(Math.sin(Math.sqrt(curvature)*r)**2):curvature<0?Math.sinh(Math.sqrt(-curvature)*r)**2:0;return velocity*velocity+warping;};
  if(radius===0)return {energy:{energy:baseline,baseline,delta:0,relativeChange:0,error:0,verified:true},length:{length:T,baseline:T,delta:0,relativeChange:0,error:0,verified:true}};
  const e0=simpson(s=>.5*q(s),N),e1=simpson(s=>.5*q(s),2*N),eError=2*Math.abs(e1-e0)+32*Number.EPSILON*T;
  const l0=simpson(s=>{const value=q(s);return value/(Math.sqrt(1+value)+1);},N),l1=simpson(s=>{const value=q(s);return value/(Math.sqrt(1+value)+1);},2*N),lError=2*Math.abs(l1-l0)+32*Number.EPSILON*T;
  return {energy:{energy:baseline+e1,baseline,delta:e1,relativeChange:e1/baseline,error:eError,verified:Number.isFinite(e1)&&Math.abs(e1)>eError},
    length:{length:T+l1,baseline:T,delta:l1,relativeChange:l1/T,error:lError,verified:Number.isFinite(l1)&&Math.abs(l1)>lError}};
}

test('an exact basis verifies one current push before claiming any finite push range',()=>{
  const v=plane(),options={...v,T:8,type:'surface',mode:2},basis=finish(H.prepareBasisSteps(options));
  assert.equal(Object.isFrozen(basis),true);assert.equal('maxAmplitude'in basis,false);assert.equal(v.counts().projections,0);
  const eigenWork=v.counts().curvatures,current=finish(basis.verifyCurrentSteps(.12)),currentWork=v.counts().projections;
  assert.equal(Object.isFrozen(current),true);assert.equal(current.maxAmplitude,0);
  assert.equal(current.currentVerified,true);assert.equal(current.rangePending,true);assert.equal(current.currentAmplitude,.12);assert.equal(current.displayReferenceAmplitude,.12);
  assert.equal(current.coefficient,basis.coefficient);assert.ok(currentWork>0);
  const full=finish(basis.finishSteps());assert.equal(full.maxAmplitude,.12);
  assert.equal('rangePending'in full,false);assert.equal(v.counts().curvatures,eigenWork,'Current and full verification share the original resolved eigenfunction.');
  assert.ok(currentWork<v.counts().projections/10,'One current push must not run the complete amplitude scan.');
  assert.equal(finish(basis.finishSteps()),full,'A completed full profile is reused.');
});

test('current verification returns the same real eigenfunction, finite curve, length and error as full preparation',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978;
  for(const mode of [1,2]){
    const options={data,model,T,type:'surface',mode},full=H.prepare(options),basis=finish(H.prepareBasisSteps(options));
    for(const A of [-.12,-.073,0,.073,.12]){
      const current=finish(basis.verifyCurrentSteps(A));
      for(const key of ['T','type','mode','eigenvalue','rawEigenvalue','eigenError','status','root','meshIntervals'])assert.equal(current[key],full[key]);
      assert.deepEqual(current.energy(A),full.energy(A));assert.deepEqual(current.length(A),full.length(A));
      assert.deepEqual(current.sample(A,0,{count:120}),full.sample(A,0,{count:120}));
      for(let i=0;i<=50;i++){
        const s=T*i/50;assert.equal(current.coefficient(s),full.coefficient(s));
        assert.deepEqual(current.displaySampleAt(A,0,s),full.displaySampleAt(A,0,s));
        assert.deepEqual(current.displaySampleAt(0,0,s),full.displaySampleAt(0,0,s));
      }
    }
    const completed=finish(basis.finishSteps());assert.deepEqual(metadata(completed),metadata(full));assert.deepEqual(completed.sample(.12),full.sample(.12));
  }
});

test('a current profile cannot be used to measure or draw an unverified finite push',()=>{
  const v=plane(),basis=finish(H.prepareBasisSteps({...v,T:8,type:'surface',mode:1})),p=finish(basis.verifyCurrentSteps(-.073,{referenceAmplitude:.1}));
  assert.equal(p.displayReferenceAmplitude,.1);
  for(const method of ['energy','length','sample']){
    assert.throws(()=>p[method](.073),/only its current physical push/);
    assert.throws(()=>p[method](-.073,.01),/only its current physical push/);
    assert.doesNotThrow(()=>p[method](-.073,0));
  }
  assert.doesNotThrow(()=>p.displaySampleAt(0,0,4));assert.doesNotThrow(()=>p.displaySampleAt(-.073,0,4));
  assert.throws(()=>p.displaySampleAt(.03,0,4),/only its current physical push/);
  for(const [A,referenceAmplitude]of [[NaN,.12],[Infinity,.12],[.13,.12],[.1,.09],[.1,.13],[0,-1]])
    assert.throws(()=>finish(basis.verifyCurrentSteps(A,{referenceAmplitude})),/current push inside its display reference/);
});

test('failed current geometry checks never publish a profile, while complete range verification still reports no safe cap',()=>{
  const v=plane();v.model.project=p=>[p[0],p[1],1];
  const basis=finish(H.prepareBasisSteps({...v,T:8,type:'surface',mode:1}));
  assert.throws(()=>finish(basis.verifyCurrentSteps(.12)),/geometry and convergence checks/);
  assert.equal(finish(basis.finishSteps()).maxAmplitude,0);
  const broken=plane();broken.model.project=()=>{throw RangeError('Projection failed.');};
  const b=finish(H.prepareBasisSteps({...broken,T:8,type:'surface',mode:1}));
  assert.throws(()=>finish(b.verifyCurrentSteps(.12)),/Projection failed/);
});

test('cancelled and interleaved current checks leave the eventual full profile unchanged',()=>{
  const v=plane(),options={...v,T:8,type:'surface',mode:2},direct=H.prepare(options),basis=finish(H.prepareBasisSteps(options));
  const cancelled=basis.verifyCurrentSteps(.09);for(let i=0;i<20;i++)assert.equal(cancelled.next().done,false);
  const before=v.counts().projections;assert.deepEqual(cancelled.return(),{value:undefined,done:true});assert.deepEqual(cancelled.next(),{value:undefined,done:true});
  assert.equal(v.counts().projections,before);
  const currentJob=basis.verifyCurrentSteps(.073),rangeJob=basis.finishSteps();let currentStep,rangeStep;
  do{
    if(!currentStep?.done)currentStep=currentJob.next();
    if(!rangeStep?.done)rangeStep=rangeJob.next();
  }while(!currentStep.done||!rangeStep.done);
  assert.equal(currentStep.value.currentVerified,true);assert.deepEqual(currentStep.value.sample(.073),direct.sample(.073));
  assert.deepEqual(metadata(rangeStep.value),metadata(direct));
  for(const A of [-.12,-1e-9,0,.073,.12]){assert.deepEqual(rangeStep.value.energy(A),direct.energy(A));assert.deepEqual(rangeStep.value.length(A),direct.length(A));}
});

test('a hidden current profile verifies both hidden axes at one exact radial push',()=>{
  const v=plane();v.data.length=120;v.data.curvature=.36;
  for(const [T,mode]of [[5.236,1],[37.251,2],[120,8]]){
    const options={...v,T,type:'hidden',mode},basis=finish(H.prepareBasisSteps(options)),full=H.prepare(options);
    for(const [A,B]of [[.12,0],[0,-.12],[.06,.08],[0,0]]){
      const radius=Math.hypot(A,B),current=finish(basis.verifyCurrentSteps(A,{B}));
      assert.equal(current.maxAmplitude,0);assert.equal(current.rangePending,true);assert.equal(current.currentVerified,true);
      assert.equal(current.currentAmplitude,A);assert.equal(current.currentSecondAmplitude,B);assert.equal(current.currentRadius,radius);
      const exact=originalHiddenMeasurements(radius,T,mode,v.data.curvature);
      for(const [a,b]of [[A,B],[radius,0],[0,radius],[0,-radius]]){
        assert.deepEqual(current.energy(a,b),exact.energy);assert.deepEqual(current.length(a,b),exact.length);
        assert.deepEqual(current.sample(a,b,{count:64}),{...full.sample(a,b,{count:64}),...exact});
        for(const s of [0,T*.2,T*.5,T*.8,T])assert.deepEqual(current.displaySampleAt(a,b,s),full.displaySampleAt(a,b,s));
      }
      assert.deepEqual(current.displaySampleAt(0,0,T*.37),full.displaySampleAt(0,0,T*.37));
      if(radius){
        for(const method of ['energy','length','sample']){
          assert.throws(()=>current[method](0,0),/only its current physical push/);
          assert.throws(()=>current[method](radius*.999,0),/only its current physical push/);
        }
        assert.throws(()=>current.displaySampleAt(radius*.999,0,T*.5),/only its current physical push/);
      }
    }
    const completed=finish(basis.finishSteps());assert.deepEqual(metadata(completed),metadata(full));assert.deepEqual(completed.sample(0,.12),full.sample(0,.12));
  }
});

test('hidden current validation uses the entire physical radius and retains surface coefficient restrictions',()=>{
  const v=plane(),basis=finish(H.prepareBasisSteps({...v,T:8,type:'hidden',mode:1}));
  for(const [A,B,referenceAmplitude]of [[.1,.1,.12],[0,.13,.12],[0,NaN,.12],[NaN,0,.12],[.06,.08,.09],[0,.1,.13]])
    assert.throws(()=>finish(basis.verifyCurrentSteps(A,{B,referenceAmplitude})),/current push inside its display reference/);
  const p=finish(basis.verifyCurrentSteps(0,{B:.1,referenceAmplitude:.1}));
  assert.throws(()=>p.sample(.1,.001),/only its current physical push/);
  assert.throws(()=>p.energy(Infinity,0),/only its current physical push/);
  const surface=finish(H.prepareBasisSteps({...v,T:8,type:'surface',mode:1}));
  assert.throws(()=>finish(surface.verifyCurrentSteps(0,{B:.1})),/current push inside its display reference/);
});

test('cancelled and interleaved hidden current checks retain the original complete finite range',()=>{
  const v=plane();v.data.length=90;v.data.curvature=-.17;
  const options={...v,T:73.25,type:'hidden',mode:8},direct=H.prepare(options),basis=finish(H.prepareBasisSteps(options));
  const cancelled=basis.verifyCurrentSteps(0,{B:.12});for(let i=0;i<3;i++)assert.equal(cancelled.next().done,false);
  assert.deepEqual(cancelled.return(),{value:undefined,done:true});
  const current=basis.verifyCurrentSteps(.06,{B:.08}),full=basis.finishSteps();let c,f;
  do{if(!c?.done)c=current.next();if(!f?.done)f=full.next();}while(!c.done||!f.done);
  assert.deepEqual(c.value.sample(0,.1),{...direct.sample(0,.1),...originalHiddenMeasurements(.1,options.T,options.mode,v.data.curvature)});assert.deepEqual(metadata(f.value),metadata(direct));
  for(const [A,B]of [[.12,0],[0,.12],[.06,.08],[1e-9,0],[0,0]]){
    assert.deepEqual(f.value.energy(A,B),direct.energy(A,B));assert.deepEqual(f.value.length(A,B),direct.length(A,B));
  }
});

test('current checks cannot change full results through rounded coefficient-cache aliases',()=>{
  const v=plane();v.data.curvature=.36;
  for(const type of ['surface','hidden'])for(const mode of [1,2]){
    const options={...v,T:8,type,mode},direct=H.prepare(options),basis=finish(H.prepareBasisSteps(options));
    const current=finish(basis.verifyCurrentSteps(.1)),before=current.sample(.1),full=finish(basis.finishSteps());
    assert.deepEqual(metadata(full),metadata(direct));
    for(const A of [.01,.02,.03,.06,.1,.12]){
      assert.deepEqual(full.energy(A),direct.energy(A));assert.deepEqual(full.length(A),direct.length(A));
    }
    assert.deepEqual(current.sample(.1),before,'The exact current measurement does not change when the original finite range finishes.');
  }
});

test('profile drawing ownership is bound to its actual model without changing full metadata',()=>{
  const v=plane(),basis=finish(H.prepareBasisSteps({...v,T:8,type:'hidden',mode:1})),current=finish(basis.verifyCurrentSteps(0,{B:.12})),full=finish(basis.finishSteps());
  assert.equal(H.displayProfileModel(current),v.model);assert.equal(H.displayProfileModel(full),v.model);
  assert.equal(H.displayProfileModel({...full}),undefined);assert.equal(H.displayProfileModel(basis),undefined);
  assert.equal('model'in full,false);assert.equal(Object.isFrozen(full),true);
});

test('long hidden push sessions recompute evicted measurements with identical original quadrature',()=>{
  const v=plane();v.data.length=120;v.data.curvature=.36;
  const options={...v,T:117.25,type:'hidden',mode:2},full=H.prepare(options),A=.00314159,initialEnergy=full.energy(A),initialLength=full.length(A);
  for(let i=0;i<1100;i++){const a=.0001+.119*i/1100;full.energy(a);full.length(a);}
  const energy=full.energy(A),length=full.length(A),exact=originalHiddenMeasurements(A,options.T,options.mode,v.data.curvature);
  assert.notEqual(energy,initialEnergy);assert.notEqual(length,initialLength);
  assert.deepEqual(energy,initialEnergy);assert.deepEqual(length,initialLength);assert.deepEqual(energy,exact.energy);assert.deepEqual(length,exact.length);
});

test('nested surface meshes reuse only identical sampled positions and their exact drawing baselines',()=>{
  const v=plane(),original=v.data.sampleAt,sampled=new Map();
  v.data.sampleAt=s=>{sampled.set(s,(sampled.get(s)||0)+1);return original(s);};
  const basis=finish(H.prepareBasisSteps({...v,T:12,type:'surface',mode:2}));
  assert.ok(sampled.size>1000);assert.ok([...sampled.values()].every(count=>count===1),'The eigenproblem evaluates each exact curvature position once.');
  assert.equal(v.counts().curvatures,sampled.size);
  sampled.clear();const profile=finish(basis.verifyCurrentSteps(.12)),points=profile.sample(.12).points;
  assert.ok(sampled.size>2000);assert.ok([...sampled.values()].every(count=>count===1),'Nested finite-curve meshes share identical baseline nodes.');
  const calls=sampled.size;
  for(const p of points){
    const baseline=profile.displaySampleAt(0,0,p.s);assert.deepEqual(baseline.point,p.original);assert.deepEqual(baseline.tangent,[1,0,0]);
    const drawing=profile.displaySampleAt(.12,0,p.s);assert.deepEqual(drawing.point,p.point);assert.deepEqual(drawing.normal,p.normal);
  }
  assert.equal(sampled.size,calls,'Exact drawing baselines reuse the already prepared finite-curve nodes.');
  assert.ok([...sampled.values()].every(count=>count===1));
});
