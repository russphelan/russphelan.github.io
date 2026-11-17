'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Downhill=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
const near=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<tolerance,`${message||'agreement'}: ${a} versus ${b}`);
function sphereData(length=4){
  const data={length,curvature:.36,eventTolerance:1e-8,events:[{s:Math.PI,surface:true,hidden:false}],
    sampleAt:s=>({s,point:[Math.cos(s),Math.sin(s),0],tangent:[-Math.sin(s),Math.cos(s),0]})};
  const model={normal:p=>{const n=Math.hypot(...p);return p.map(x=>x/n);},project:p=>{const n=Math.hypot(...p);return p.map(x=>x/n);},curvature:()=>1};
  return {data,model};
}
function integrate(fn,T,N=4000){let sum=0;for(let i=0;i<=N;i++)sum+=(i===0||i===N?1:i%2?4:2)*fn(T*i/N);return sum*T/(3*N);}

test('reusing baseline derivatives preserves the original paired quadrature bit for bit',()=>{
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function derivative(points,i,h){
    const N=points.length-1,c=i===0?[-25,48,-36,16,-3]:i===1?[-3,-10,18,-6,1]:i===N?[3,-16,36,-48,25]:i===N-1?[-1,6,-18,10,3]:[1,-8,0,8,-1],start=i<2?0:i>N-2?N-4:i-2;
    return [0,1,2].map(k=>c.reduce((sum,v,j)=>sum+v*points[start+j][k],0)/(12*h));
  }
  function originalQuadrature(data,model,profile,A,N){
    const T=profile.T,original=[],points=[];
    for(let i=0;i<=N;i++){
      const s=i===N?T:i===0?0:T*i/N,p=data.sampleAt(s),direction=cross(model.normal(p.point),p.tangent),n=Math.hypot(...direction),f=profile.coefficient(s);
      original.push(p.point.slice());points.push(i===0||i===N?p.point.slice():model.project(p.point.map((v,k)=>v+A*f*(direction[k]/n))));
    }
    let energy=0,length=0;const h=T/N;
    for(let i=0;i<=N;i++){
      const v=derivative(points,i,h),v0=derivative(original,i,h),delta=dot(v.map((x,k)=>x-v0[k]),v.map((x,k)=>x+v0[k])),w=i===0||i===N?1:i%2?4:2;
      energy+=w*.5*delta;length+=w*delta/(Math.hypot(...v)+Math.hypot(...v0));
    }
    return {energy:energy*h/3,length:length*h/3};
  }
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978;
  for(const mode of [1,2]){
    const p=Downhill.prepare({data,model,T,type:'surface',mode}),N=Math.ceil(Math.max(512,Math.min(4096,Math.ceil(T/.008)))/2)*2;
    for(const A of [-.12,.000001,.073,.12]){
      const coarse=originalQuadrature(data,model,p,A,N),fine=originalQuadrature(data,model,p,A,2*N);
      for(const kind of ['energy','length']){
        const result=p[kind](A),error=2*Math.abs(fine[kind]-coarse[kind])+1e-9*Math.max(1,T);
        assert.equal(result.delta,fine[kind]);assert.equal(result.error,error);
      }
    }
  }
});

test('long push sessions bound retained numerical results without changing recomputed lengths or energies',()=>{
  const maps=[];
  class TrackedMap extends Map{constructor(...args){super(...args);maps.push(this);}}
  const context={module:{exports:{}},Map:TrackedMap};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downhill.js'),'utf8'),context);
  const {data,model}=sphereData(8);
  for(const type of ['hidden','surface']){
    maps.length=0;
    const profile=context.module.exports.prepare({data,model,T:3.5,type,mode:1});
    const energy=profile.energy(.000001),length=profile.length(.000001);
    const count=type==='hidden'?3000:600;
    for(let i=0;i<count;i++){const a=.12*(i+.5)/count;profile.energy(a);profile.length(a);}
    assert.ok(maps.every(cache=>{
      const value=cache.values().next().value,geometryNodes=value?.original&&value?.direction&&typeof value.f==='number';
      return cache.size<=(geometryNodes?16384:512);
    }),'Continuous input must respect the separate bounds for exact geometry nodes and amplitude history.');
    const restoredEnergy=profile.energy(.000001),restoredLength=profile.length(.000001);
    assert.notEqual(restoredEnergy,energy,'This amplitude was evicted and actually recomputed.');
    assert.notEqual(restoredLength,length);
    assert.deepEqual(restoredEnergy,energy);assert.deepEqual(restoredLength,length);
    assert.equal(profile.energy(.000001),restoredEnergy,'Repeated current values still reuse their checked result.');
    assert.equal(profile.length(.000001),restoredLength);
  }
});

test('analytic hidden directions switch sign at the actual focus and have radial finite energy',()=>{
  const {data,model}=sphereData(18),root=3*Math.PI/.6;
  for(const [offset,status]of [[-.2,'uphill'],[0,'neutral'],[.2,'downhill']]){
    const profile=Downhill.prepare({data,model,T:root+offset,type:'hidden',mode:3,eventS:root});
    assert.equal(profile.status,status);
    assert.equal(profile.maxAmplitude,.12,'the same physical range is available on both sides and at the focus');
    near(profile.eigenvalue,offset===0?0:(3*Math.PI/profile.T)**2-.36,1e-12);
    if(status==='downhill'){
      assert.ok(profile.maxAmplitude>0);
      const a=profile.maxAmplitude,e=profile.energy(a);
      assert.ok(e.verified&&e.delta< -e.error);
      near(e.energy,profile.energy(0,a).energy,1e-13,'the two axes have identical energy');
      near(e.energy,profile.energy(a/Math.sqrt(2),a/Math.sqrt(2)).energy,1e-13,'every angle in their plane agrees');
    }else assert.ok(profile.energy(profile.maxAmplitude).delta>0,'the finite rise before/at focus remains measurable');
  }
  const at=Downhill.prepare({data,model,T:root,type:'hidden',mode:3});
  assert.ok(at.energy(.1).delta>0,'neutral Hessian does not fabricate a flat finite-energy family');
  const r=.02,quartic=.36**2*root*r**4/16;
  near(at.energy(r).delta/quartic,1,3e-5,'neutral hidden mode has the expected quartic energy rise');
  assert.equal(at.energy(1e-7).verified,false,'unresolved finite changes remain explicitly unresolved');
});

test('hidden finite energy agrees with the tube metric and its quadratic variation',()=>{
  const {data,model}=sphereData(8),T=6.1,profile=Downhill.prepare({data,model,T,type:'hidden',mode:1}),A=.08,B=-.06,r=Math.hypot(A,B),w=Math.PI/T;
  const expected=integrate(s=>.5*(r*r*w*w*Math.cos(w*s)**2+Math.cos(.6*r*Math.sin(w*s))**2),T);
  near(profile.energy(A,B).energy,expected,1e-11,'actual tube energy');
  const a=.001,second=(profile.energy(a).delta+profile.energy(-a).delta)/(a*a);
  near(second,profile.eigenvalue*T/2,1e-7,'energy Hessian equals the index form');
  assert.throws(()=>profile.energy(.2),/neighborhood/);
});

test('hidden arc length integrates actual ambient speed and is not reconstructed from energy',()=>{
  const {data,model}=sphereData(8),T=6.1,profile=Downhill.prepare({data,model,T,type:'hidden',mode:1});
  const A=.08,B=-.06,r=Math.hypot(A,B),w=Math.PI/T;
  const expected=integrate(s=>Math.sqrt(r*r*w*w*Math.cos(w*s)**2+Math.cos(.6*r*Math.sin(w*s))**2),T);
  const measured=profile.length(A,B);
  near(measured.length,expected,1e-11,'actual ambient arc length');
  near(measured.length,profile.length(r).length,1e-13,'hidden length is radial');
  assert.ok(Math.sqrt(2*T*profile.energy(A,B).energy)-measured.length>1e-6,'RMS speed cannot replace the integral of speed');
  const a=.001,second=(profile.length(a).delta+profile.length(-a).delta)/(a*a);
  near(second,profile.eigenvalue*T/2,1e-7,'length has the same normal index form at unit speed');
  assert.throws(()=>profile.length(.2),/neighborhood/);
});

test('the neutral hidden length retains its sixth-order rise instead of the energy quartic rise',()=>{
  const {data,model}=sphereData(8),T=Math.PI/.6,profile=Downhill.prepare({data,model,T,type:'hidden',mode:1});
  const a=.04,leading=T*.36**3*a**6/72,measured=profile.length(a);
  near(measured.delta/leading,1,.001,'sixth-order hidden length variation');
  assert.ok(measured.delta>0&&measured.verified);
  assert.ok(profile.energy(a).delta>1000*measured.delta,'neutral length and energy must retain their distinct higher-order behavior');
  assert.equal(profile.length(1e-7).verified,false,'tiny length changes retain numerical uncertainty');
});

test('surface Dirichlet modes reproduce the round-sphere spectrum and true projected-curve energy',()=>{
  const {data,model}=sphereData();
  for(const [offset,status]of [[-.2,'uphill'],[0,'neutral'],[.2,'downhill']]){
    const profile=Downhill.prepare({data,model,T:Math.PI+offset,type:'surface',mode:1,eventS:Math.PI});
    assert.equal(profile.status,status);
    assert.equal(profile.maxAmplitude,.12);
    assert.ok(profile.coefficient(profile.T/100)>0,'the initial lobe fixes a consistent signed orientation');
    if(offset!==0)assert.ok(Math.abs(profile.eigenvalue-((Math.PI/profile.T)**2-1))<profile.eigenError);
    if(offset>0){
      assert.ok(profile.maxAmplitude>0);
      const A=.08,w=Math.PI/profile.T;
      const expected=integrate(s=>{const f=Math.sin(w*s),df=w*Math.cos(w*s),d=1+A*A*f*f;return .5*(1/d+A*A*df*df/(d*d));},profile.T);
      near(profile.energy(A).energy,expected,2e-8,'finite surface-curve energy');
      for(const sign of [-1,1])assert.ok(profile.energy(sign*profile.maxAmplitude).delta<0);
      const a=.01,second=(profile.energy(a).delta+profile.energy(-a).delta)/(a*a);
      near(second,((Math.PI/profile.T)**2-1)*profile.T/2,2e-4,'surface Hessian');
    }else for(const sign of [-1,1])assert.ok(profile.energy(sign*.12).delta>profile.energy(sign*.12).error,'before and at focus give genuine finite rises on the sphere');
  }
});

test('surface arc length uses projected speed and detects a neutral great-circle family despite its varying speed',()=>{
  const {data,model}=sphereData(),T=Math.PI+.2,profile=Downhill.prepare({data,model,T,type:'surface',mode:1}),A=.08,w=Math.PI/T;
  const expected=integrate(s=>{const f=Math.sin(w*s),df=w*Math.cos(w*s),d=1+A*A*f*f;return Math.sqrt(1/d+A*A*df*df/(d*d));},T);
  near(profile.length(A).length,expected,2e-8,'actual projected surface arc length');
  assert.ok(Math.sqrt(2*T*profile.energy(A).energy)-profile.length(A).length>1e-6);
  const neutral=Downhill.prepare({data,model,T:Math.PI,type:'surface',mode:1});
  // project((cos s,sin s, A sin s)) stays on the great circle z=A y.
  assert.ok(Math.abs(neutral.length(.12).delta)<=neutral.length(.12).error,'the neutral family has length π to numerical resolution');
  assert.ok(neutral.energy(.12).delta>neutral.energy(.12).error,'nonuniform parameter speed can raise energy on that same great circle');
});

test('all finite paths have exactly pinned endpoints and zero amplitude reproduces the segment',()=>{
  const {data,model}=sphereData(),T=3.6;
  for(const type of ['surface','hidden']){
    const profile=Downhill.prepare({data,model,T,type,mode:1}),sample=profile.sample(.08,type==='hidden'?.03:0,{count:80}),zero=profile.sample(0);
    assert.deepEqual(sample.points[0].point,data.sampleAt(0).point);
    assert.deepEqual(sample.points.at(-1).point,data.sampleAt(T).point);
    assert.deepEqual(sample.samples[0].y,[0,0]);assert.deepEqual(sample.samples.at(-1).y,[0,0]);
    assert.ok(zero.points.every(p=>p.point.every((v,k)=>v===p.original[k])));
    assert.deepEqual(zero.energy,{energy:T/2,baseline:T/2,delta:0,relativeChange:0,error:0,verified:true});
    assert.deepEqual(zero.length,{length:T,baseline:T,delta:0,relativeChange:0,error:0,verified:true});
    assert.deepEqual(sample.length,profile.length(.08,type==='hidden'?.03:0));
  }
});

test('the two selected geodesics support resolved downhill surface and hidden deformations after their focus',()=>{
  const model=S.getModel('double');
  for(const pick of D.picks){
    const data=J.prepare(D.curves.find(c=>c.id===pick.curveId),model);
    for(const type of ['surface','hidden']){
      const root=type==='surface'?pick.surfaceEventS:pick.hiddenEventS;
      const mode=type==='surface'?data.events.filter(e=>e.surface&&e.s<=root+1e-7).length:Math.round(root*.6/Math.PI);
      const profile=Downhill.prepare({data,model,T:root+.2,type,mode,eventS:root});
      assert.equal(profile.status,'downhill',pick.id+' '+type);
      assert.ok(profile.eigenvalue< -profile.eigenError&&profile.maxAmplitude>0);
      for(const sign of [-1,1]){
        let previous=0;
        for(const fraction of [.25,.5,.75,1]){
          const result=profile.energy(sign*profile.maxAmplitude*fraction);
          assert.ok(result.verified&&result.delta< -result.error&&result.delta<previous);
          previous=result.delta;
        }
      }
      const sample=profile.sample(profile.maxAmplitude);
      assert.deepEqual(sample.points.at(-1).point,data.sampleAt(profile.T).point);
      if(type==='surface')for(const p of sample.points)assert.ok(Math.abs(model.value(p.point))<1e-8);
    }
  }
});

test('the same real surface and hidden mode remains pushable and correctly oriented before, at, and after focus',()=>{
  const model=S.getModel('double');
  for(const pick of D.picks){
    const data=J.prepare(D.curves.find(c=>c.id===pick.curveId),model);
    for(const type of ['surface','hidden']){
      const root=type==='surface'?pick.surfaceEventS:pick.hiddenEventS;
      const mode=type==='surface'?data.events.filter(e=>e.surface&&e.s<=root+1e-7).length:Math.round(root*.6/Math.PI);
      const profiles=[-.2,0,.2].map(offset=>Downhill.prepare({data,model,T:root+offset,type,mode,eventS:root}));
      assert.deepEqual(profiles.map(p=>p.status),['uphill','neutral','downhill']);
      assert.deepEqual(profiles.map(p=>p.maxAmplitude),[.12,.12,.12]);
      for(const p of profiles){
        assert.ok(p.coefficient(p.T/1000)>0,'a consistent first-lobe sign follows the same eigenmode rank');
        for(const sign of [-1,1]){
          const sample=p.sample(sign*.12),e=sample.energy,l=sample.length;
          assert.ok(Number.isFinite(e.delta)&&Number.isFinite(e.error));
          assert.ok(Number.isFinite(l.delta)&&Number.isFinite(l.error));
          assert.deepEqual(sample.points[0].point,data.sampleAt(0).point);
          assert.deepEqual(sample.points.at(-1).point,data.sampleAt(p.T).point);
          assert.deepEqual(sample.samples[0].y,[0,0]);assert.deepEqual(sample.samples.at(-1).y,[0,0]);
          if(p.status==='uphill')assert.ok(e.verified&&e.delta>e.error,'the new direction is uphill before its focus');
          if(p.status==='downhill')assert.ok(e.verified&&e.delta< -e.error,'the new direction is downhill after its focus');
          if(p.status==='uphill')assert.ok(l.verified&&l.delta>l.error,'the true finite curve is longer before the focus');
          if(p.status==='downhill')assert.ok(l.verified&&l.delta< -l.error,'the true finite curve is shorter after the focus');
        }
      }
      const neutral=profiles[1];
      assert.equal(neutral.eigenvalue,0,'second-order neutrality is separate from finite energy');
      assert.ok(Math.abs(neutral.energy(.12).delta)>neutral.energy(.12).error,'finite higher-order change is retained at the focus');
    }
  }
});

test('a failed finite projection does not enable pushes merely because its mode is uphill or neutral',()=>{
  const {data,model}=sphereData();
  for(const T of [Math.PI-.2,Math.PI,Math.PI+.2]){
    const bad={...model,project:()=>[NaN,NaN,NaN]};
    assert.equal(Downhill.prepare({data,model:bad,T,type:'surface',mode:1}).maxAmplitude,0);
  }
});

test('invalid mode bookmarks, intervals, and coefficients cannot create a claimed downhill direction',()=>{
  const {data,model}=sphereData();
  assert.throws(()=>Downhill.prepare({data,model,T:0}),/endpoint/);
  assert.throws(()=>Downhill.prepare({data,model,T:8}),/endpoint/);
  assert.throws(()=>Downhill.prepare({data,model,T:3,type:'surface',mode:0}),/rank/);
  assert.throws(()=>Downhill.prepare({data,model,T:3,type:'surface',eventS:2}),/focus/);
  const profile=Downhill.prepare({data,model,T:3.5,type:'surface'});
  assert.throws(()=>profile.energy(.05,.01),/coefficients/);
  assert.throws(()=>profile.length(.05,.01),/coefficients/);
});
