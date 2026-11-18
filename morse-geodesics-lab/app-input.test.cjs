'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Controls=require('./surface-camera-controls.js'),Camera=require('./camera.js'),Surface=require('./surface.js');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
function fixture({reduced=true}={}){
  function target(){const handlers=new Map();return {dataset:{},style:{},hidden:false,textContent:'',value:'',
    addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},
    removeEventListener(type,fn){handlers.set(type,(handlers.get(type)||[]).filter(row=>row!==fn));},
    send(event){for(const fn of [...handlers.get(event.type)||[]])fn(event);},closest:()=>null};}
  let clock=100,nextFrame=0;const frames=new Map(),changes=[],win=Object.assign(target(),{navigator:{maxTouchPoints:5},performance:{now:()=>clock},
    matchMedia:query=>({matches:query.includes('reduced-motion')?reduced:query.includes('coarse')}),
    requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)});
  const doc=Object.assign(target(),{defaultView:win,hidden:false}),captures=new Set(),
    canvas=Object.assign(target(),{ownerDocument:doc,getBoundingClientRect:()=>({left:20,top:30,width:900,height:600}),
      setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),focus(){},contains:n=>n===canvas}),
    stage=target(),help=target(),marker=target(),buttons=Object.fromEntries(['left','right','in','out','reset','fit','view'].map(key=>[key,target()])),
    model=Surface.getModel('torus'),state={camera:Camera.defaultCamera()};let begins=0;
  const controls=Controls.create({canvas,stage,help,marker,buttons,getScene:()=>({camera:state.camera,bounds:model.bounds,model}),
    onChange:camera=>{state.camera=camera;changes.push(camera);},onBegin:()=>begins++});
  function fire(type,extra={},at=canvas){const event={type,pointerType:'touch',pointerId:1,isPrimary:true,button:0,buttons:1,
    clientX:470,clientY:330,timeStamp:clock+=16,target:at,cancelable:true,preventDefault(){this.prevented=true;},...extra};
    win.send(event);if(at!==win)doc.send(event);if(at!==win&&at!==doc)at.send(event);return event;}
  function pump(time){clock=time;const current=[...frames.values()];frames.clear();for(const fn of current)fn(time);}
  return {win,doc,canvas,stage,help,marker,buttons,model,state,controls,changes,frames,captures,fire,pump,begins:()=>begins,
    frame:()=>Camera.frame(model.bounds,state.camera,900,600),pick:()=>{const f=Camera.frame(model.bounds,state.camera,900,600),u=Math.atan2(f.eye[1],f.eye[0]),v=Math.atan2(f.eye[2],Math.hypot(f.eye[0],f.eye[1]));return Camera.project(f,model.point(u,v));}};
}

test('the main app binds the shared camera controller and the offline page loads it before both views',()=>{
  const app=fs.readFileSync(require.resolve('./app.js'),'utf8'),html=fs.readFileSync(require.resolve('./index.html'),'utf8');
  assert.match(app,/surfaceCameraControls=window.GeodesicSurfaceCameraControls.create/);
  assert.doesNotMatch(app,/canvas.addEventListener\('pointer(?:down|move)'/,'There is one camera gesture owner.');
  assert.ok(html.indexOf('./camera-gestures.js')<html.indexOf('./hidden-cutaway.js'));
  assert.ok(html.indexOf('./surface-camera-controls.js')<html.indexOf('./app.js'));
});

test('one finger orbits continuously through the bottom and extra touch contacts start pan/pinch without a jump',()=>{
  const f=fixture(),start=f.state.camera;
  f.fire('pointerdown');f.fire('pointermove',{clientX:480,clientY:830});
  near(f.state.camera.yaw,start.yaw+.07);assert.ok(f.frame().up[2]<0,'A finger drag can turn the torus entirely upside down.');
  const held=JSON.stringify(f.state.camera);
  f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:680,clientY:830});
  assert.equal(JSON.stringify(f.state.camera),held);
  f.fire('pointerup',{pointerId:1,clientX:480,clientY:830});assert.equal(JSON.stringify(f.state.camera),held);
  f.fire('pointermove',{pointerId:2,isPrimary:false,clientX:685,clientY:827});
  near(f.state.camera.yaw,Camera.turn(JSON.parse(held),.035,.021).yaw);
  f.controls.destroy();
});

test('two-finger pan/pinch preserves the picked surface under the moving midpoint and +/- recover outward',()=>{
  const f=fixture(),p=f.pick();f.fire('pointerdown',{clientX:p.x-30,clientY:p.y+30});
  f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:p.x+70,clientY:p.y+30});
  const anchor=Camera.anchorAt(f.frame(),p.x,p.y,f.model);assert.equal(anchor.hit,true);
  f.fire('pointermove',{pointerId:2,isPrimary:false,clientX:p.x+120,clientY:p.y+50});
  const pixel=Camera.project(f.frame(),anchor.point);near(pixel.x,p.x+25);near(pixel.y,p.y+10);
  assert.equal(f.canvas.dataset.cameraInput,'touch');assert.match(f.help.textContent,/two fingers/);
  f.fire('pointerup');f.fire('pointerup',{pointerId:2});
  const distance=f.frame().distance;f.buttons.out.send({type:'click'});assert.ok(f.frame().distance>distance);
  f.buttons.fit.send({type:'click'});assert.deepEqual(f.state.camera.targetOffset,[0,0,0]);assert.equal(f.state.camera.localFocus,false);
  f.controls.destroy();
});

test('double tapping a surface point focuses its neighborhood, then bottom view keeps the same local distance',()=>{
  const f=fixture(),p=f.pick(),pixel={clientX:p.x+20,clientY:p.y+30};
  const anchor=Camera.anchorAt(f.frame(),pixel.clientX-20,pixel.clientY-30,f.model);assert.equal(anchor.hit,true);
  for(let i=0;i<2;i++){f.fire('pointerdown',pixel);f.fire('pointerup',pixel);}
  assert.equal(f.state.camera.localFocus,true);near(Camera.project(f.frame(),anchor.point).x,450);near(Camera.project(f.frame(),anchor.point).y,300);
  assert.equal(f.marker.hidden,false);const before=f.frame().distance;
  f.buttons.view.value='bottom';f.buttons.view.send({type:'change'});near(f.state.camera.pitch,-Math.PI/2);near(f.frame().distance,before);
  assert.equal(f.buttons.view.value,'');f.controls.destroy();
});

test('mouse rotation, anchored wheel zoom, keyboard and resetting retain their established behavior',()=>{
  const f=fixture(),start=f.state.camera;f.fire('pointerdown',{pointerType:'mouse',pointerId:0});
  f.fire('pointermove',{pointerType:'mouse',pointerId:0,clientX:480,clientY:320});
  near(f.state.camera.yaw,start.yaw+.07);near(f.state.camera.pitch,start.pitch+.07);f.fire('pointerup',{pointerType:'mouse',pointerId:0});
  const before=f.frame(),anchor=Camera.anchorAt(before,490,300,f.model);
  f.stage.send({type:'wheel',target:f.canvas,deltaY:-80,deltaMode:0,clientX:510,clientY:330,preventDefault(){}});
  const at=Camera.project(f.frame(),anchor.point);near(at.x,490);near(at.y,300);assert.equal(f.canvas.dataset.cameraInput,'mouse');
  const zoom=f.state.camera.zoom;f.canvas.send({type:'keydown',key:'-',preventDefault(){}});assert.ok(f.state.camera.zoom>zoom);
  f.canvas.send({type:'keydown',key:'Home',preventDefault(){}});assert.deepEqual(f.state.camera,Camera.defaultCamera());
  f.controls.destroy();
});

test('Pencil use on a control cancels a resting palm without swallowing control input or the next finger gesture',()=>{
  const f=fixture();f.fire('pointerdown');const camera=JSON.stringify(f.state.camera);
  const control=f.fire('pointerdown',{pointerType:'pen',pointerId:9},f.buttons.in);assert.notEqual(control.prevented,true);
  f.fire('pointermove',{clientX:700});assert.equal(JSON.stringify(f.state.camera),camera);
  f.fire('pointerup',{pointerType:'pen',pointerId:9},f.buttons.in);f.fire('pointermove',{clientX:720});assert.equal(JSON.stringify(f.state.camera),camera);
  f.fire('pointerdown',{pointerId:2});f.fire('pointermove',{pointerId:2,clientX:490});assert.notEqual(JSON.stringify(f.state.camera),camera);
  f.controls.destroy();
});

test('focus animation preserves physical distance at its start and cancels cleanly on a fresh gesture or hidden page',()=>{
  const f=fixture({reduced:false}),before=f.frame().distance;
  f.controls.focus({x:490,y:300});assert.equal(f.frames.size,1);f.pump(100);near(f.frame().distance,before);
  f.pump(195);assert.ok(f.frame().distance>f.frame().near);assert.equal(f.frames.size,1);
  f.fire('pointerdown');assert.equal(f.frames.size,0);f.fire('pointerup');
  f.controls.focus({x:450,y:300});assert.equal(f.frames.size,1);f.doc.send({type:'keydown',key:'Enter',target:f.buttons.view});assert.equal(f.frames.size,0);
  f.controls.focus({x:450,y:300});assert.equal(f.frames.size,1);f.doc.hidden=true;f.doc.send({type:'visibilitychange'});
  assert.equal(f.frames.size,0);assert.equal(f.captures.size,0);f.controls.destroy();
});
