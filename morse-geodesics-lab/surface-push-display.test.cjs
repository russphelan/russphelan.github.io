'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Display=require('./surface-push-display.js');
const sub=(a,b)=>a.map((x,i)=>x-b[i]),distance=(a,b)=>Math.hypot(...sub(a,b));
function planeProfile(mode=1,T=6){return {type:'surface',T,mode,maxAmplitude:.12,
  displaySampleAt(A,B,s){const f=s===0||s===T?0:Math.sin(mode*Math.PI*s/T);return {s,original:[s,0,0],point:[s,A*f,0],normal:[0,0,1],tangent:[1,0,0],f};}};}
function study(profiles,mode=1,A=.12){return {type:'surface',T:profiles[0].T,profile:profiles[mode-1],displayProfiles:profiles,
  displayMaxAmplitude:Math.min(...profiles.map(p=>p.maxAmplitude)),amplitude:[A,0]};}
const plane={normal:()=>[0,0,1],project:p=>[p[0],p[1],0],value:p=>p[2]};
test('surface drawing magnifies exact modes, keeps pins and nodes, and preserves signs near zero',()=>{
  const profiles=[planeProfile(1),planeProfile(2)];
  for(const mode of [1,2])for(const A of [-.12,-.00001,0,.00001,.12]){
    const source=study(profiles,mode,A),before=JSON.stringify(source),map=Display.createMap(source,plane);
    assert.equal(map.magnification,3);assert.equal(map.effectiveMagnification,3);assert.equal(map.projection,'surface');
    assert.equal(map.referenceAmplitude,.12);assert.equal(map.limited,false);
    for(const s of [0,.5,1.5,3,4.5,6]){
      const sample=source.profile.displaySampleAt(A,0,s),point=map.mapSample(sample);
      assert.ok(distance(point,[s,3*A*sample.f,0])<1e-12);
    }
    assert.equal(JSON.stringify(source),before);
  }
});
test('one cached safety gain covers both modes and signs independently of the current amplitude',()=>{
  const profiles=[planeProfile(1),planeProfile(2)];let projections=0;
  const bounded={...plane,project(p){projections++;if(Math.abs(p[1])>.2)throw RangeError('Local drawing range');return p.slice();}};
  const first=Display.createMap(study(profiles,1,.12),bounded),initial=projections;
  assert.ok(first.limited&&first.effectiveMagnification>1&&first.effectiveMagnification<3);
  for(const mode of [1,2])for(const A of [-.12,0,.00001,.12]){
    const mapping=Display.createMap(study(profiles,mode,A),bounded);
    assert.equal(mapping.effectiveMagnification,first.effectiveMagnification);
  }
  assert.equal(projections,initial,'Slider motion and mode switches reuse the checked common gain.');
  const source=study(profiles,2,.12),mapping=Display.createMap(source,bounded);
  assert.ok(Math.abs(mapping.mapSample(source.profile.displaySampleAt(.12,0,1.5))[1])<=.2);
});
test('a verified current push uses the same drawing scale without claiming a verified slider range',()=>{
  const full=[planeProfile(1),planeProfile(2)];
  for(const A of [-.12,0,.06,.12]){
    const current=full.map(p=>({...p,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:A,displayReferenceAmplitude:.12}));
    for(const mode of [1,2]){
      const expected=Display.createMap(study(full,mode,A),plane),source=study(current,mode,A),mapping=Display.createMap(source,plane);
      assert.equal(source.displayMaxAmplitude,0,'Physical range metadata remains unavailable.');
      assert.equal(mapping.referenceAmplitude,.12);assert.equal(mapping.effectiveMagnification,expected.effectiveMagnification);
      for(let i=0;i<=48;i++){
        const sample=source.profile.displaySampleAt(0,0,source.T*i/48);
        assert.deepEqual(mapping.mapSample(sample),expected.mapSample(sample));
      }
      assert.equal(source.profile.maxAmplitude,0);assert.equal(source.profile.currentVerified,true);
      if(A!==0)assert.throws(()=>Display.createMap({...source,amplitude:[A/2,0]},plane),/current surface push/);
      assert.throws(()=>Display.createMap({...source,displayProfiles:current.map(p=>({...p,currentVerified:false}))},plane),/profiles must share|current surface push/);
    }
  }
});
test('both real showcase modes retain clear, on-surface drawings without changing physical curves or lengths',()=>{
  const S=require('./surface.js'),J=require('./jacobi.js'),H=require('./downhill.js'),Comparison=require('./surface-mode-comparison.js'),D=require('./showcase-data.js');
  const model=S.getModel('double');
  for(const curve of D.curves){
    const data=J.prepare(curve,model),T=Comparison.secondSurfaceEnd(data);
    assert.ok(T>0);
    const profiles=[1,2].map(mode=>H.prepare({data,model,T,type:'surface',mode}));
    let common=null;
    for(const mode of [1,2])for(const sign of [-1,1]){
      const A=.12*sign,result=profiles[mode-1].sample(A),source={...study(profiles,mode,A),data,result};
      const original=JSON.stringify(result),measured=profiles[mode-1].length(A),mapping=Display.createMap(source,model);
      if(common===null)common=mapping.effectiveMagnification;
      assert.equal(mapping.effectiveMagnification,common);assert.ok(common>=2.9,'The compact collar supports an impactful shared drawing scale.');
      let maximum=0;
      for(let i=0;i<=256;i++){
        const s=i===256?T:T*i/256,p=profiles[mode-1].displaySampleAt(A,0,s),point=mapping.mapSample(p);
        assert.ok(point.every(Number.isFinite));assert.ok(Math.abs(model.value(point))<2e-10);
        if(i===0||i===256)assert.deepEqual(point,p.original);
        maximum=Math.max(maximum,distance(point,p.original));
      }
      assert.ok(maximum>.25,'Full-slider surface movement is comparable with the enlarged hidden push.');
      assert.equal(JSON.stringify(result),original);assert.deepEqual(profiles[mode-1].length(A),measured);
    }
  }
});
test('current-only real surface profiles draw exactly the fully verified curves and safety gains',()=>{
  const S=require('./surface.js'),J=require('./jacobi.js'),H=require('./downhill.js'),D=require('./showcase-data.js');
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978;
  const full=[1,2].map(mode=>H.prepare({data,model,T,type:'surface',mode}));
  for(const A of [-.12,.12])for(const mode of [1,2]){
    const current=full.map(p=>({...p,maxAmplitude:0,rangePending:true,currentVerified:true,currentAmplitude:A,displayReferenceAmplitude:.12}));
    const verified=Display.createMap(study(full,mode,A),model),live=Display.createMap(study(current,mode,A),model);
    assert.equal(live.effectiveMagnification,verified.effectiveMagnification);
    for(let i=0;i<=96;i++){
      const sample=full[mode-1].displaySampleAt(0,0,T*i/96);
      assert.deepEqual(live.mapSample(sample),verified.mapSample(sample));
    }
  }
});
test('invalid drawing inputs fail explicitly and a zero physical range remains an identity drawing',()=>{
  const profiles=[planeProfile(1),planeProfile(2)],source=study(profiles);
  for(const magnification of [0,-1,NaN,Infinity])assert.throws(()=>Display.createMap(source,plane,{magnification}),RangeError);
  assert.throws(()=>Display.createMap({...source,type:'hidden'},plane),TypeError);
  assert.throws(()=>Display.createMap({...source,displayMaxAmplitude:.2},plane),RangeError);
  assert.throws(()=>Display.createMap({...source,displayProfiles:[{...profiles[0],T:7}]},plane),TypeError);
  assert.throws(()=>Display.createMap(source,{}),TypeError);
  const mapping=Display.createMap(source,plane);
  assert.throws(()=>mapping.mapSample({s:-1,point:[0,0,0]}),RangeError);
  profiles[0].maxAmplitude=0;const zero=study(profiles,1,0),identity=Display.createMap(zero,plane);
  assert.deepEqual(identity.mapSample({s:2,original:[2,0,0]}),[2,0,0]);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./surface-push-display.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicSurfacePushDisplay.createMap,'function');
});
