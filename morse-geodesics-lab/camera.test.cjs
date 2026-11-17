'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('./camera.js'),S=require('./surface.js');
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const sphere={value:p=>Math.hypot(...p)-1};
const bounds=[[-1.2,-1.2,-1.2],[1.2,1.2,1.2]];

test('orbit frames stay orthonormal and continuous through both poles and complete revolutions',()=>{
 const initial=C.defaultCamera();
 for(const pitch of [-4*Math.PI,-Math.PI,-Math.PI/2-.001,-Math.PI/2,0,.95,Math.PI/2,Math.PI/2+.001,Math.PI,3*Math.PI/2,9*Math.PI]){
  const f=C.frame(bounds,{...initial,pitch},900,600);
  assert.ok(Array.from(f.m).every(Number.isFinite));
  for(const axis of [f.right,f.up,f.back])near(Math.hypot(...axis),1);
  near(dot(f.right,f.up),0);near(dot(f.right,f.back),0);near(dot(f.up,f.back),0);
  near(C.project(f,f.target).x,450);near(C.project(f,f.target).y,300);
 }
 for(const pole of [-Math.PI/2,Math.PI/2]){
  const a=C.frame(bounds,{...initial,pitch:pole-1e-8},900,600),b=C.frame(bounds,{...initial,pitch:pole+1e-8},900,600);
  assert.ok(distance(a.right,b.right)<1e-12);
  assert.ok(distance(a.up,b.up)<3e-8);
 }
 const inverted=C.frame(bounds,C.turn(initial,0,Math.PI),900,600);
 assert.ok(inverted.up[2]<0,'The screen-up direction can point below the world equator.');
});

test('perspective zoom preserves a real surface anchor under the cursor and is reversible',()=>{
 const camera=C.defaultCamera(),old=C.frame(bounds,camera,900,600),x=500,y=280;
 const anchor=C.anchorAt(old,x,y,sphere);
 assert.equal(anchor.hit,true);near(sphere.value(anchor.point),0,1e-8);
 const initialPixel=C.project(old,anchor.point);near(initialPixel.x,x);near(initialPixel.y,y);
 const next=C.zoomAt({bounds,camera,width:900,height:600,x,y,factor:.55,model:sphere});
 const f=C.frame(bounds,next,900,600),pixel=C.project(f,anchor.point);
 near(pixel.x,x);near(pixel.y,y);near(pixel.depth-initialPixel.depth,f.distance-old.distance);
 near(dot(next.targetOffset,f.back),dot(camera.targetOffset,old.back));
 assert.ok(distance(next.targetOffset,[0,0,0])>.1,'Zooming toward a point should compensate the orbit target.');
 const back=C.zoomAt({bounds,camera:next,width:900,height:600,x,y,factor:1/.55,model:sphere});
 near(back.zoom,camera.zoom);assert.ok(distance(back.targetOffset,camera.targetOffset)<1e-8);
});

test('zooming at different successive pixels preserves each picked point at that step',()=>{
 let camera=C.defaultCamera();
 for(const [x,y,factor] of [[490,290,.7],[410,320,.8],[455,265,1.4],[550,330,.65]]){
  const f=C.frame(bounds,camera,900,600),anchor=C.anchorAt(f,x,y,sphere);
  const next=C.zoomAt({bounds,camera,width:900,height:600,x,y,factor,model:sphere});
  const pixel=C.project(C.frame(bounds,next,900,600),anchor.point);
  near(pixel.x,x);near(pixel.y,y);assert.ok(pixel.depth>0);
  camera=next;
 }
});

test('empty-space zoom uses the current target plane without a jump or numerical singularity',()=>{
 const camera=C.turn({...C.defaultCamera(),targetOffset:[.3,-.2,.4]},.4,Math.PI/2-.95);
 const old=C.frame(bounds,camera,900,600),anchor=C.anchorAt(old,0,0,sphere);
 assert.equal(anchor.hit,false);near(dot(anchor.point.map((x,i)=>x-old.target[i]),old.back),0);
 const next=C.zoomAt({bounds,camera,width:900,height:600,x:0,y:0,factor:1.5,model:sphere});
 const pixel=C.project(C.frame(bounds,next,900,600),anchor.point);
 near(pixel.x,0);near(pixel.y,0);
 assert.ok(next.targetOffset.every(Number.isFinite));
});

test('zoom limits preserve the cursor anchor and further inward clamped input cannot pan',()=>{
 const camera=C.defaultCamera(),f=C.frame(bounds,camera,900,600),anchor=C.anchorAt(f,490,290,sphere);
 const min=C.zoomAt({bounds,camera,width:900,height:600,x:490,y:290,factor:1e-10,model:sphere});
 assert.equal(min.zoom,C.MIN_ZOOM);
 const pixel=C.project(C.frame(bounds,min,900,600),anchor.point);near(pixel.x,490);near(pixel.y,290);
 assert.deepEqual(C.zoomAt({bounds,camera:min,width:900,height:600,x:800,y:500,factor:.1,model:sphere}),min);
 const max=C.zoomAt({bounds,camera,width:900,height:600,x:490,y:290,factor:1e10,model:sphere});
 assert.equal(max.zoom,C.MAX_ZOOM);
 near(C.project(C.frame(bounds,max,900,600),anchor.point).x,490);
});

test('the actual round torus can be picked and anchored from above, below, and inverted views',()=>{
 const model=S.getModel('torus');
 for(const pitch of [.95,-.95,2.1,-2.1]){
  const camera={...C.defaultCamera(),pitch},f=C.frame(model.bounds,camera,900,600);
  const u=Math.atan2(f.eye[1],f.eye[0]),v=Math.atan2(f.eye[2],Math.hypot(f.eye[0],f.eye[1]));
  const visible=model.point(u,v),at=C.project(f,visible),anchor=C.anchorAt(f,at.x,at.y,model);
  assert.equal(anchor.hit,true);near(model.value(anchor.point),0,1e-8);
  const next=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,x:at.x,y:at.y,factor:.6,model});
  const p=C.project(C.frame(model.bounds,next,900,600),anchor.point);near(p.x,at.x);near(p.y,at.y);
 }
});

test('camera functions preserve caller data, reset offsets, and work as a standalone browser module',()=>{
 const camera={...C.defaultCamera(),targetOffset:[.2,.3,-.1]},before=JSON.stringify(camera);
 C.turn(camera,.4,10);C.frame(bounds,camera,900,600);C.zoomAt({bounds,camera,width:900,height:600,x:450,y:300,factor:.9});
 assert.equal(JSON.stringify(camera),before);assert.deepEqual(C.defaultCamera().targetOffset,[0,0,0]);
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./camera.js'),'utf8'),context);
 assert.equal(typeof context.GeodesicCamera.zoomAt,'function');
 assert.deepEqual(C.zoomAt({bounds,camera,width:900,height:600,x:2,y:3,factor:NaN}),camera);
});

test('connected-sum body and neck ray hits remain fixed while zooming',()=>{
 for(const id of ['double','triple']){
  const model=S.getModel(id),camera=C.defaultCamera(),f=C.frame(model.bounds,camera,1000,550);
  const yz=Math.hypot(f.back[1],f.back[2]);
  const targets=[model.point(-1.35,.95),[model.bridges[0],model.neckRadius*f.back[1]/yz,model.neckRadius*f.back[2]/yz]];
  for(const point of targets){
   const p=C.project(f,point),anchor=C.anchorAt(f,p.x,p.y,model);
   assert.equal(anchor.hit,true,id+' surface should intersect the cursor ray.');
   near(model.value(anchor.point),0,1e-8);
   const next=C.zoomAt({bounds:model.bounds,camera,width:1000,height:550,x:p.x,y:p.y,factor:.75,model});
   const after=C.project(C.frame(model.bounds,next,1000,550),anchor.point);near(after.x,p.x);near(after.y,p.y);
  }
 }
});

const corners=b=>[0,1].flatMap(a=>[0,1].flatMap(c=>[0,1].map(d=>[b[a][0],b[c][1],b[d][2]])));
function assertFits(model,camera,width=900,height=600){
 const f=C.frame(model.bounds,camera,width,height);
 for(const point of corners(model.bounds)){
  const p=C.project(f,point);
  assert.ok(p.depth>f.near&&p.depth<f.far,'Zoomed-out bounds must be in front of the eye and inside clipping planes.');
  assert.ok(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height,'The whole model must fit before outward zoom may stop.');
 }
}
function zoomOutToFit(model,camera,at={x:450,y:300}){
 for(let i=0;i<80;i++){
  const next=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,...at,factor:1.2});
  if(next.zoom===camera.zoom){assertFits(model,next);return next;}
  camera=next;
 }
 assert.fail('Button zoom-out should reach a comfortably framed model.');
}

test('zoom-out controls recover a cursor-zoom/orbit trap at the old maximum',()=>{
 const model=S.getModel('torus');
 // Captured from alternate edge zooms followed by a quarter turn. The target
 // is far from the torus, but its eye is near the hole despite zoom=MAX_ZOOM.
 const camera={...C.defaultCamera(),yaw:.22+Math.PI/2,pitch:0,zoom:C.MAX_ZOOM,
  targetOffset:[-16.6249,-3.71765,0]};
 const f=C.frame(model.bounds,camera,900,600);
 assert.ok(distance(f.eye,[0,0,0])<.1,'Reproduce the close eye at the nominal outward limit.');
 const button=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,x:450,y:300,factor:1/.9});
 assert.ok(button.zoom>C.MAX_ZOOM);
 assert.ok(distance(button.targetOffset,camera.targetOffset)<1e-12);
 assert.ok(distance(C.frame(model.bounds,button,900,600).eye,f.eye)>1,'Minus must actually move the eye back.');
 const anchor=C.anchorAt(f,600,240,model);
 assert.equal(anchor.hit,true);
 const wheel=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,x:600,y:240,factor:1.2,model});
 const after=C.frame(model.bounds,wheel,900,600),pixel=C.project(after,anchor.point);
 assert.ok(distance(after.eye,f.eye)>.01,'Trackpad zoom-out must move the eye too.');
 near(pixel.x,600);near(pixel.y,240);
 assert.ok(pixel.depth>C.project(f,anchor.point).depth,'The anchored surface recedes.');
 assertFits(model,zoomOutToFit(model,camera));
 let recovered=camera;
 for(let i=0;i<4;i++)recovered=C.zoomAt({bounds:model.bounds,camera:recovered,width:900,height:600,x:600,y:240,factor:1/.9,model});
 assertFits(model,recovered);
 assert.ok(Math.hypot(...recovered.targetOffset)<18,'Wheel recovery must not accumulate enormous hidden depth offsets.');
});

test('outward limits fit the model from displaced targets at every orbit orientation',()=>{
 for(const id of ['torus','double','triple'])for(const pitch of [-2.1,0,.95,Math.PI/2]){
  const model=S.getModel(id),initial={...C.defaultCamera(),pitch,zoom:C.MAX_ZOOM};
  const f=C.frame(model.bounds,initial,900,600);
  // Place the eye at the bounds center, then pan laterally as well. This
  // represents the target drift that an unrestricted orbit can bring forward.
  const camera={...initial,targetOffset:f.back.map((v,i)=>-v*f.distance+f.right[i]*f.radius*.5)};
  const next=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,factor:1.2});
  assert.ok(next.zoom>camera.zoom,id+' must not stop while the eye is inside the scene.');
  assertFits(model,zoomOutToFit(model,camera));
 }
});

test('ray picking ignores an eye-on-surface hit and lets trackpad zoom-out escape',()=>{
 const model=S.getModel('torus'),initial=C.defaultCamera(),f=C.frame(model.bounds,initial,900,600);
 const point=model.point(0,0);
 const camera={...initial,targetOffset:point.map((x,i)=>x-f.center[i]-f.back[i]*f.distance)};
 const before=C.frame(model.bounds,camera,900,600);
 assert.ok(distance(before.eye,point)<1e-12);
 const anchor=C.anchorAt(before,450,300,model);
 assert.ok(C.project(before,anchor.point).depth>=before.near-1e-12,'An invisible near-plane hit cannot anchor the camera to itself.');
 const next=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,x:450,y:300,factor:1.2,model});
 const after=C.frame(model.bounds,next,900,600);
 assert.ok(distance(after.eye,before.eye)>.009);
 assert.ok(dot(after.eye.map((x,i)=>x-before.eye[i]),before.back)>0);
 assert.ok(Array.from(after.m).every(Number.isFinite));
 assertFits(model,zoomOutToFit(model,next));
});

test('mouse compensation remains in the screen plane across repeated pointer changes',()=>{
 const model=S.getModel('torus');let camera=C.defaultCamera();
 const original=C.frame(model.bounds,camera,900,600),axis=original.back;
 for(let i=0;i<100;i++)for(const [x,y,factor] of [[0,200,.9],[900,400,1/.9]]){
  camera=C.zoomAt({bounds:model.bounds,camera,width:900,height:600,x,y,factor,model});
  near(dot(camera.targetOffset,axis),0,1e-10);
 }
 const rotated=C.turn(camera,Math.PI/2,-.95);
 assertFits(model,zoomOutToFit(model,rotated));
});

test('inward clipping protection never blocks an outward request',()=>{
 const initial=C.defaultCamera(),f=C.frame(bounds,initial,900,600);
 const camera={...initial,targetOffset:f.back.map(x=>x*(1.2-f.distance))};
 const before=C.frame(bounds,camera,900,600);
 const next=C.zoomAt({bounds,camera,width:900,height:600,x:450,y:300,factor:.1,model:sphere});
 const close=C.frame(bounds,next,900,600),anchor=C.anchorAt(before,450,300,sphere);
 near(C.project(close,anchor.point).depth,close.near,1e-9);
 const out=C.zoomAt({bounds,camera:next,width:900,height:600,x:450,y:300,factor:1.1,model:sphere});
 assert.ok(C.project(C.frame(bounds,out,900,600),anchor.point).depth>.1);
 assert.deepEqual(out.targetOffset,next.targetOffset,'Centered zoom never pans the orbit target.');
});
