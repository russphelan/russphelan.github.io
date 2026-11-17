'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Display=require('./hidden-push-display.js'),Downhill=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
const near=(a,b,tolerance=1e-11)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const plane={normal:()=>[0,0,1]};
function straight(direction=1,amplitude=.08,mode=1,count=80){
  const T=4,points=Array.from({length:count+1},(_,i)=>{
    const s=T*i/count,f=i===0||i===count?0:Math.sin(mode*Math.PI*i/count),original=[s,0,0];
    return {s,f,original,point:original.slice(),y:direction===1?[amplitude*f,0]:[0,amplitude*f]};
  });
  return {type:'hidden',T,hiddenDirection:direction,result:{points}};
}

test('the two schematic directions are independent equal-size tilted lifts with exactly pinned endpoints',()=>{
  const first=straight(1),second=straight(2),a=Display.build(first,plane),b=Display.build(second,plane),i=40;
  const da=sub(a.points[i],first.result.points[i].original),db=sub(b.points[i],second.result.points[i].original);
  assert.ok(da[2]>0&&db[2]>0,'Each positive first-mode push visibly leaves the surface.');
  assert.ok(da[1]>0&&db[1]<0,'The two choices lean to opposite sides of the path.');
  near(dot(da,db),0);near(Math.hypot(...da),3*.08);near(Math.hypot(...db),3*.08);
  near(da[2]/Math.hypot(...da),1/Math.sqrt(2));near(db[2]/Math.hypot(...db),1/Math.sqrt(2));
  for(const [result,study]of [[a,first],[b,second]]){
    assert.deepEqual(result.points[0],study.result.points[0].original);
    assert.deepEqual(result.points.at(-1),study.result.points.at(-1).original);
    assert.equal(result.points.length,study.result.points.length);assert.equal(result.normals.length,result.points.length);
    for(let j=0;j<result.points.length;j++){
      assert.ok(result.points[j].every(Number.isFinite));near(Math.hypot(...result.normals[j]),1);
      const lo=Math.max(0,j-1),hi=Math.min(result.points.length-1,j+1),t=sub(result.points[hi],result.points[lo]);
      near(dot(t,result.normals[j]),0);
    }
  }
});

test('higher hidden modes preserve the signed alternating lobes rather than folding them outward',()=>{
  for(const direction of [1,2]){
    const study=straight(direction,.08,2),result=Display.build(study,plane,{magnification:2});
    assert.ok(result.points[20][2]>0);assert.ok(result.points[60][2]<0);
    near(result.points[40][2],0);
    for(let i=0;i<result.points.length;i++)near(result.points[i][2],2*.08*study.result.points[i].f/Math.sqrt(2));
    assert.ok(result.guides.some(g=>g.point[2]>0)&&result.guides.some(g=>g.point[2]<0),'Guides reveal both sides of a signed mode.');
  }
  const manyNodes=Display.build(straight(1,.1,9,360),plane);
  assert.equal(manyNodes.guides.length,8,'Evenly located nodes cannot erase every displacement guide.');
});

test('zero and tiny pushes have a stable frame, with no radius-dependent orientation or endpoint drift',()=>{
  for(const direction of [1,2]){
    const zero=straight(direction,0),tiny=straight(direction,1e-10),result=Display.build(zero,plane),small=Display.build(tiny,plane);
    assert.deepEqual(result.points,zero.result.points.map(p=>p.original));assert.deepEqual(result.guides,[]);
    for(let i=0;i<result.points.length;i++){
      assert.ok(result.normals[i].every(Number.isFinite));near(Math.hypot(...result.normals[i]),1);
      assert.ok(Math.hypot(...sub(small.points[i],result.points[i]))<=3.01e-10);
    }
    assert.equal(result.direction,direction);
  }
  const inferred=straight(2);delete inferred.hiddenDirection;assert.equal(Display.build(inferred,plane).direction,2);
});

test('repeated original samples can recover a neighboring tangent without manufacturing a displacement direction',()=>{
  const study=straight();
  study.result.points[1].original=study.result.points[0].original.slice();
  study.result.points[2].original=study.result.points[0].original.slice();
  const result=Display.build(study,plane);
  assert.ok(result.points.flat().every(Number.isFinite));assert.ok(result.normals.flat().every(Number.isFinite));
  const invalid=straight();for(const p of invalid.result.points)p.original=[0,0,0];
  assert.throws(()=>Display.build(invalid,plane),/distinct neighboring/);
});

test('real hidden samples retain the accurate ambient length and all physical data at every display magnification',()=>{
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-clear-pinch'),model);
  const T=Math.PI/.6+.2,profile=Downhill.prepare({data,model,T,type:'hidden',mode:1}),amplitude=.09;
  const first=profile.sample(amplitude,0,{count:120}),second=profile.sample(0,amplitude,{count:120});
  assert.deepEqual(first.length,second.length,'The two physical hidden directions have the same metric length.');
  const snapshot=JSON.parse(JSON.stringify(first));
  const study={type:'hidden',T,hiddenDirection:1,result:first};
  const small=Display.build(study,model,{magnification:1}),large=Display.build(study,model,{magnification:6});
  for(let i=0;i<small.points.length;i++){
    const origin=first.points[i].original;
    const ratio=large.effectiveMagnification/small.effectiveMagnification;
    sub(large.points[i],origin).forEach((x,k)=>near(x,ratio*(small.points[i][k]-origin[k]),2e-14));
  }
  assert.deepEqual(first,snapshot,'Drawing must not alter physical samples, length, quadrature error, or energy.');
  assert.deepEqual(first.length,profile.length(amplitude));
  const other=Display.build({type:'hidden',T,hiddenDirection:2,result:second},model,{magnification:6});
  for(let i=0;i<large.points.length;i++)near(Math.hypot(...sub(large.points[i],first.points[i].original)),Math.hypot(...sub(other.points[i],second.points[i].original)),2e-14);
  assert.notDeepEqual(large.points,other.points,'Equal physical lengths still produce two independently legible drawings.');
  assert.ok(first.length.verified&&first.length.delta<0);
  assert.equal('length' in large,false,'The display must not offer its Euclidean drawing length as a metric measurement.');
});

test('the compact collar retains visible magnification without backward folds in either hidden direction',()=>{
  const model=S.getModel('double'),curve=require('./catalogues/double-default.json').curves[21],data=J.prepare(curve,model),T=7.29;
  const profile=Downhill.prepare({data,model,T,type:'hidden',mode:1});
  const gains=[];
  for(const direction of [1,2]){
    const amplitude=direction===1?[.12,0]:[0,.12],result=profile.sample(...amplitude);
    const study={type:'hidden',T,mode:1,data,profile,amplitude,hiddenDirection:direction,result};
    const snapshot=JSON.stringify(result),mapping=Display.createMap(study,model,{magnification:3});
    const count=2400,samples=Array.from({length:count+1},(_,i)=>profile.displaySampleAt(...amplitude,T*i/count));
    const display=Display.build(study,model,{samples,mapping});gains.push(display.effectiveMagnification);
    assert.ok(display.effectiveMagnification>1&&display.effectiveMagnification<=3,'The gentler collar retains a useful field scale while honoring the display bound.');
    assert.ok(display.frameDriftBound<=.45);
    for(let i=1;i<samples.length-1;i++){
      const ds=samples[i+1].s-samples[i-1].s,v=sub(display.points[i+1],display.points[i-1]).map(x=>x/ds);
      assert.ok(dot(v,samples[i].tangent)>.5,'The displayed path must continue forward through the collar.');
      near(Math.hypot(...sub(display.points[i],samples[i].original)),display.effectiveMagnification*Math.hypot(...samples[i].y),2e-13);
    }
    assert.deepEqual(display.points[0],samples[0].original);assert.deepEqual(display.points.at(-1),samples.at(-1).original);
    assert.equal(JSON.stringify(result),snapshot,'Display safety never alters finite samples or measured lengths.');
    const resampled={...study,result:profile.sample(...amplitude,{count:120})};
    near(Display.createMap(resampled,model,{magnification:3}).effectiveMagnification,display.effectiveMagnification);
  }
  near(gains[0],gains[1]);
});

test('the curvature limiter is continuous at zero and increasing push never shrinks the displayed displacement',()=>{
  const model=S.getModel('double'),curve=require('./catalogues/double-default.json').curves[21],data=J.prepare(curve,model),T=7.29;
  const profile=Downhill.prepare({data,model,T,type:'hidden',mode:1});
  let previous=-1;
  for(const size of [0,1e-10,.001,.01,.02,.04,.08,.12]){
    const amplitude=[size,0],result=profile.sample(...amplitude);
    const mapping=Display.createMap({type:'hidden',T,mode:1,data,profile,amplitude,hiddenDirection:1,result},model,{magnification:3});
    const displayed=size*mapping.effectiveMagnification;
    assert.ok(displayed>previous);previous=displayed;
    if(size<=1e-10)near(mapping.effectiveMagnification,3);
  }
});

test('fixed bounding stations preserve arbitrary study endpoints exactly',()=>{
  const model=S.getModel('double'),curve=require('./catalogues/double-default.json').curves.at(-1),data=J.prepare(curve,model),T=.85*data.length;
  const profile=Downhill.prepare({data,model,T,type:'hidden',mode:2}),amplitude=[0,.12],result=profile.sample(...amplitude);
  const study={type:'hidden',T,mode:2,data,profile,amplitude,hiddenDirection:2,result};
  const mapping=Display.createMap(study,model,{magnification:6}),display=Display.build(study,model,{mapping});
  assert.deepEqual(display.points[0],result.points[0].original);
  assert.deepEqual(display.points.at(-1),result.points.at(-1).original);
  assert.ok(display.effectiveMagnification>0&&display.frameDriftBound<=.45);
});

test('fixed presentation axes preserve a clear equal scale as traversal extends across the neck',()=>{
  const model=S.getModel('double'),curve=require('./catalogues/double-default.json').curves[21],data=J.prepare(curve,model);
  const Camera=require('./camera.js'),back=Camera.frame(model.bounds,Camera.defaultCamera(),1440,1000).back;
  let previousAxes=null;
  for(const T of [4.7,5.7,7.29,9.4]){
    const profile=Downhill.prepare({data,model,T,type:'hidden',mode:1}),axes=[];
    for(const direction of [1,2]){
      const amplitude=direction===1?[.12,0]:[0,.12],result=profile.sample(...amplitude),snapshot=JSON.stringify(result);
      const study={type:'hidden',T,mode:1,data,profile,amplitude,hiddenDirection:direction,result};
      const mapping=Display.createMap(study,model,{projection:'fixed',magnification:3});
      const display=Display.build(study,model,{mapping});
      assert.equal(display.projection,'fixed');assert.equal(display.limited,false);near(display.effectiveMagnification,3);
      const peak=profile.displaySampleAt(...amplitude,T/2),delta=sub(mapping.mapSample(peak),peak.original);
      near(Math.hypot(...delta),.36);axes.push(delta.map(x=>x/.36));
      assert.deepEqual(display.points[0],result.points[0].original);assert.deepEqual(display.points.at(-1),result.points.at(-1).original);
      assert.equal(JSON.stringify(result),snapshot,'The fixed display cannot alter physical samples or measured length.');
      assert.deepEqual(result.length,profile.length(...amplitude));
      const count=1600;
      for(let i=1;i<count;i++){
        const s=T*i/count,h=1e-5,p=profile.displaySampleAt(...amplitude,s);
        const before=mapping.mapSample(profile.displaySampleAt(...amplitude,s-h)),after=mapping.mapSample(profile.displaySampleAt(...amplitude,s+h));
        const velocity=sub(after,before).map(x=>x/(2*h));
        assert.ok(dot(velocity,p.tangent)>.45,'The fixed projection stays regular and moves forward across the collar.');
      }
    }
    near(dot(axes[0],axes[1]),0);
    for(const axis of axes)assert.ok(Math.sqrt(1-dot(axis,back)**2)>=1/Math.sqrt(2)-1e-12,'Both fixed axes remain legible in the canonical default view.');
    if(previousAxes)for(let direction=0;direction<2;direction++)axes[direction].forEach((x,k)=>near(x,previousAxes[direction][k]));
    previousAxes=axes;
  }
});

test('fixed presentation scaling is proportional to physical push, including signed higher lobes',()=>{
  const model=S.getModel('double'),curve=require('./catalogues/double-default.json').curves[21],data=J.prepare(curve,model),T=7.29;
  for(const mode of [1,2])for(const direction of [1,2]){
    const profile=Downhill.prepare({data,model,T,type:'hidden',mode});let large=null;
    for(const size of [.12,.06,1e-10,0]){
      const amplitude=direction===1?[size,0]:[0,size],result=profile.sample(...amplitude);
      const study={type:'hidden',T,mode,data,profile,amplitude,hiddenDirection:direction,result};
      const mapping=Display.createMap(study,model,{projection:'fixed',magnification:6});
      const points=result.points.map(p=>mapping.mapSample(p));
      if(!large)large={points,gain:mapping.effectiveMagnification};
      near(mapping.effectiveMagnification,large.gain);
      for(let i=0;i<points.length;i++){
        const delta=sub(points[i],result.points[i].original),full=sub(large.points[i],result.points[i].original);
        delta.forEach((x,k)=>near(x,full[k]*size/.12,3e-13));
        near(Math.hypot(...delta),mapping.effectiveMagnification*Math.hypot(...result.points[i].y),3e-13);
      }
      if(mode===2&&size>0){
        const first=sub(points[90],result.points[90].original),second=sub(points[270],result.points[270].original);
        assert.ok(dot(first,second)<0,'The higher mode keeps opposite signed lobes.');
      }
      if(size===0)assert.deepEqual(points,result.points.map(p=>p.original));
    }
  }
});

test('the fixed-axis short-segment limit is explicit, smooth, shared, and independent of current push',()=>{
  const gains=[];
  for(const T of [.1,.2,.5,1,2,4,8]){
    const data={length:10,curvature:.36,events:[],sampleAt:s=>({s,point:[s,0,0],tangent:[1,0,0]})};
    const model={normal:()=>[0,0,1],project:p=>p.slice(),curvature:()=>0};
    const profile=Downhill.prepare({data,model,T,type:'hidden',mode:2});let gain=null;
    for(const [direction,size]of [[1,.12],[2,.12],[1,.03],[2,0]]){
      const amplitude=direction===1?[size,0]:[0,size],result=profile.sample(...amplitude);
      const mapping=Display.createMap({type:'hidden',T,mode:2,data,profile,amplitude,hiddenDirection:direction,result},model,{projection:'fixed',magnification:3});
      assert.ok(mapping.displacementDerivativeBound<=.55+1e-15);
      if(gain===null)gain=mapping.effectiveMagnification;else near(mapping.effectiveMagnification,gain);
      assert.equal(mapping.limitReason,mapping.limited?'short-segment':null);
    }
    gains.push(gain);
  }
  assert.ok(gains.every((value,i)=>i===0||value>=gains[i-1]),'Extending a segment cannot progressively shrink this projection.');
  near(gains.at(-1),3);
  const study=straight();assert.throws(()=>Display.createMap(study,plane,{projection:'unknown'}),/projection/);
});

test('the mapper accepts frozen data, rejects mixed or invalid inputs, and keeps its classic browser API',()=>{
  const study=straight();
  for(const p of study.result.points){Object.freeze(p.original);Object.freeze(p.point);Object.freeze(p.y);Object.freeze(p);}
  Object.freeze(study.result.points);Object.freeze(study.result);Object.freeze(study);
  assert.ok(Display.build(study,plane).points.length>0);
  assert.throws(()=>Display.build(null,plane),/sampled hidden/);
  assert.throws(()=>Display.build({...study,type:'surface'},plane),/sampled hidden/);
  assert.throws(()=>Display.build(study,{}),/normal model/);
  for(const magnification of [NaN,Infinity,0,-1])assert.throws(()=>Display.build(study,plane,{magnification}),/magnification/);
  assert.throws(()=>Display.build({...study,hiddenDirection:2},plane),/match/);
  assert.throws(()=>Display.build({...study,hiddenDirection:3},plane),/direction/);
  const mixed=straight();mixed.result.points[20].y=[.04,.04];assert.throws(()=>Display.build(mixed,plane),/one hidden direction/);
  const unpinned=straight();unpinned.result.points[0].y=[.01,0];assert.throws(()=>Display.build(unpinned,plane),/pinned/);
  const unordered=straight();unordered.result.points[20].s=0;assert.throws(()=>Display.build(unordered,plane),/Ordered finite/);
  const nonfinite=straight();nonfinite.result.points[20].y=[NaN,0];assert.throws(()=>Display.build(nonfinite,plane),/Ordered finite/);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./hidden-push-display.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicHiddenPushDisplay.build,'function');
});
