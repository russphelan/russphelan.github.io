'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Motion=require('./surgery-motion.js');

test('grid-only construction starts on the original grid and ends on the target grid',()=>{
 const m=Motion.create({durationMs:10000,surfaceVisible:false,wire:true,surfaceOpacity:.55});
 assert.deepEqual([m.sample(0).geometry,m.sample(0).fill,m.sample(0).grid],[0,0,.18]);
 assert.deepEqual([m.sample(1).geometry,m.sample(1).fill,m.sample(1).grid],[1,0,.18]);
 const start=m.sample(m.fadeFraction),end=m.sample(m.fadeOutStart);
 assert.deepEqual([start.geometry,start.fill,start.grid],[0,.55,0]);
 assert.deepEqual([end.geometry,end.fill,end.grid],[1,.55,0]);
});
test('layer fades and geometric parameter meet continuously at both construction boundaries',()=>{
 const m=Motion.create({surfaceVisible:false,wire:true});
 for(const boundary of [m.fadeFraction,m.fadeOutStart]){
  const a=m.sample(boundary-1e-9),b=m.sample(boundary+1e-9);
  for(const key of ['geometry','fill','grid'])assert.ok(Math.abs(a[key]-b[key])<1e-6,key);
 }
 const a=m.sample(m.fadeFraction/2),b=m.sample((1+m.fadeOutStart)/2);
 assert.equal(a.geometry,0);assert.equal(b.geometry,1);
 assert.ok(a.fill>0&&a.fill<.55&&a.grid>0&&a.grid<.18);
 assert.ok(b.fill>0&&b.fill<.55&&b.grid>0&&b.grid<.18);
});
test('all layer choices restore their exact starting surface and grid settings',()=>{
 for(const surfaceVisible of [false,true])for(const wire of [false,true]){
  const m=Motion.create({surfaceVisible,wire,surfaceOpacity:.8});
  for(const p of [0,1]){const f=m.sample(p);assert.equal(f.fill,surfaceVisible?.8:0);assert.equal(f.grid,wire?.18:0);}
  assert.equal(m.sample(.5).fill,.8);assert.equal(m.sample(.5).grid,0);
 }
});
test('preparation and pause cannot advance animation; resumed frames cannot leap ahead',()=>{
 const m=Motion.create({surfaceVisible:false,wire:true});
 assert.equal(m.advance(0,20000,{ready:false}),0);
 assert.equal(m.advance(.4,20000,{paused:true}),.4);
 assert.equal(m.advance(.4,0),.4);
 assert.ok(m.advance(0,20000)<m.fadeFraction);
 assert.equal(m.advance(.4,-50),.4);
 assert.equal(m.advance(1,50),1);
});
test('scrubbing is reversible and Finish now still restores grid via the final fade',()=>{
 const m=Motion.create({surfaceVisible:false,wire:true});
 assert.equal(m.sample(m.finishProgress(.4)).phase,'fade-out');
 assert.equal(m.finishProgress(.4,true),1);
 assert.equal(m.finishProgress(m.fadeOutStart),1);
 const late=m.sample(.8);assert.ok(late.geometry>.5);
 const rewind=m.sample(0);assert.deepEqual([rewind.geometry,rewind.fill,rewind.grid],[0,0,.18]);
 const middle=m.sample(.5);assert.ok(Math.abs(middle.geometry-.5)<1e-12);
 const backToFade=m.sample(m.fadeFraction/2);assert.equal(backToFade.geometry,0);assert.ok(backToFade.fill>0&&backToFade.fill<.55);
 assert.equal(m.sample(0).phase,'fade-in');assert.equal(m.sample(1).phase,'fade-out');
});
test('surface-only construction needs no layer fades and invalid durations are rejected',()=>{
 const m=Motion.create({surfaceVisible:true,wire:false,durationMs:12000});
 assert.equal(m.durationMs,12000);assert.equal(m.fadeFraction,0);assert.equal(m.finishProgress(.3),1);
 assert.equal(m.sample(0).geometry,0);assert.equal(m.sample(1).geometry,1);
 assert.throws(()=>Motion.create({durationMs:0}),RangeError);assert.throws(()=>Motion.create({fadeMs:-1}),RangeError);
});
test('construction framing eases from a displaced close-up without changing the initial view or orbit angle',()=>{
 const from={yaw:.6,pitch:-2.4,zoom:.18,targetOffset:[4,-2,1]},to={...from,zoom:.9,targetOffset:[0,0,0]};
 const before=JSON.stringify(from);
 assert.equal(Motion.cameraAt(from,to,0),from);
 assert.equal(Motion.cameraAt(from,to,.12),to);
 for(const t of [.001,.03,.06,.09,.119]){
  const camera=Motion.cameraAt(from,to,t);
  assert.equal(camera.yaw,from.yaw);assert.equal(camera.pitch,from.pitch);
  assert.ok(camera.zoom>from.zoom&&camera.zoom<to.zoom);
  assert.ok(camera.targetOffset[0]>0&&camera.targetOffset[0]<4);
 }
 assert.equal(JSON.stringify(from),before);
 const nearEnd=Motion.cameraAt(from,to,.12-1e-7);
 assert.ok(Math.abs(nearEnd.zoom-to.zoom)<1e-9);
 assert.ok(Math.hypot(...nearEnd.targetOffset)<1e-9);
});
test('camera adjustments during construction use the short orbit arc and stay responsive after framing',()=>{
 const from={yaw:Math.PI-.05,pitch:0,zoom:.9,targetOffset:[0,0,0]},to={yaw:-Math.PI+.05,pitch:.2,zoom:1.1,targetOffset:[.1,0,0]};
 const halfway=Motion.cameraAt(from,to,.06);
 assert.ok(Math.abs(halfway.yaw-Math.PI)<1e-12,'Never spin through a full turn when an orbit crosses its wrap.');
 assert.equal(Motion.cameraAt(from,to,.5),to);
});

test('local focus staging interpolates physical distance and returns the exact ordinary camera at the end',()=>{
 const Camera=require('./camera.js');
 const initialBounds=[[-4,-4,-1],[4,4,1]],grownBounds=[[-5,-4,-1],[8,4,1]],
  boundsAt=t=>initialBounds.map((point,i)=>point.map((v,j)=>v+(grownBounds[i][j]-v)*t));
 const from={yaw:.6,pitch:-2.4,zoom:.008,targetOffset:[2,-1,.4],localFocus:true,localFit:31},
  to={yaw:from.yaw,pitch:from.pitch,zoom:.9,targetOffset:[0,0,0]},before=JSON.stringify([from,to]);
 const current=t=>{const bounds=boundsAt(t),fit=Camera.frame(bounds,to,1024,700).fit;
  return {bounds,fit,camera:Motion.cameraAt(from,to,t,{fit})};};
 assert.equal(current(0).camera,from);assert.equal(current(.12).camera,to);
 for(const t of [.000001,.03,.06,.09,.119999]){
  const {bounds,fit,camera}=current(t),u=t/.12,amount=u*u*(3-2*u);
  const expected=Math.exp(Math.log(from.zoom*from.localFit)*(1-amount)+Math.log(to.zoom*fit)*amount);
  assert.equal(camera.localFocus,true);assert.ok(Number.isFinite(camera.localFit)&&camera.localFit>0);
  assert.ok(Math.abs(Camera.frame(bounds,camera,1024,700).distance-expected)<1e-10);
 }
 const atStart=current(0),nearStart=current(1e-8),atEnd=current(.12),nearEnd=current(.12-1e-8);
 const startFrame=Camera.frame(atStart.bounds,atStart.camera,1024,700),nextFrame=Camera.frame(nearStart.bounds,nearStart.camera,1024,700),
  endFrame=Camera.frame(atEnd.bounds,atEnd.camera,1024,700),previousFrame=Camera.frame(nearEnd.bounds,nearEnd.camera,1024,700);
 for(const [a,b]of [[startFrame,nextFrame],[previousFrame,endFrame]]){
  assert.ok(Math.abs(a.distance-b.distance)<1e-5);
  assert.ok(Math.hypot(...a.eye.map((v,i)=>v-b.eye[i]))<1e-5,'Staging cannot jump at a local/ordinary camera boundary.');
 }
 assert.equal(atEnd.camera.localFocus,undefined);assert.equal(atEnd.camera.localFit,undefined);
 assert.equal(JSON.stringify([from,to]),before);
});

test('ordinary desktop staging is unchanged by the optional local-focus fit context',()=>{
 const from={yaw:2.8,pitch:.3,zoom:.4,targetOffset:[3,-2,1]},to={yaw:-2.9,pitch:-.8,zoom:.9,targetOffset:[0,0,0]};
 for(const t of [0,.001,.03,.06,.119,.12,.5]){
  assert.deepEqual(Motion.cameraAt(from,to,t,{fit:37}),Motion.cameraAt(from,to,t));
 }
});

test('staging between two local cameras preserves both distance references',()=>{
 const from={yaw:.6,pitch:-2.4,zoom:.008,targetOffset:[2,-1,.4],localFocus:true,localFit:31},
  to={yaw:.6,pitch:-2.4,zoom:.02,targetOffset:[0,0,0],localFocus:true,localFit:12};
 const halfway=Motion.cameraAt(from,to,.06,{fit:99});
 assert.ok(Math.abs(halfway.zoom*halfway.localFit-Math.sqrt(from.zoom*from.localFit*to.zoom*to.localFit))<1e-12);
 assert.equal(Motion.cameraAt(from,to,.12,{fit:99}),to);
});
