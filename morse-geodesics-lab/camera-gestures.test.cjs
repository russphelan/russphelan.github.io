'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const G=require('./camera-gestures.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} differs from ${b}`);
function fixture(){
  function target(){
    const listeners=new Map();return {
      addEventListener(type,fn,options){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({fn,options});},
      removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(row=>row.fn!==fn));},
      send(event){for(const row of [...listeners.get(event.type)||[]])row.fn(event);},
      count(){return [...listeners.values()].reduce((sum,rows)=>sum+rows.length,0);}
    };
  }
  const win=target(),doc=Object.assign(target(),{defaultView:win,hidden:false}),captures=new Set(),released=[],
    element=Object.assign(target(),{ownerDocument:doc,getBoundingClientRect:()=>({left:100,top:50,width:800,height:500}),
      setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),
      releasePointerCapture:id=>{released.push(id);captures.delete(id);},contains:node=>node===element,
      focus:options=>{element.focused=options;}}),outside=target();
  let clock=0,available=true;const rotations=[],transforms=[],focuses=[],inputs=[],starts=[],ends=[];
  const controller=G.create({element,enabled:()=>available,onRotate:event=>rotations.push(event),onTransform:event=>transforms.push(event),
    onFocus:event=>focuses.push(event),onInput:input=>inputs.push(input),onStart:event=>starts.push(event),onEnd:event=>ends.push(event)});
  function fire(name,extra={},at=element){
    const event={type:name,pointerId:1,pointerType:'touch',button:0,buttons:1,isPrimary:true,clientX:200,clientY:150,
      timeStamp:clock+=16,target:at,cancelable:true,preventDefault(){this.prevented=true;},...extra};
    win.send(event);if(at!==win)doc.send(event);if(at!==win&&at!==doc)at.send(event);return event;
  }
  return {win,doc,element,outside,captures,released,rotations,transforms,focuses,inputs,starts,ends,controller,fire,
    available(value){available=value;}};
}

test('single contact turns with local pixel deltas, captures the pointer, and accepts nonprimary touch',()=>{
  const f=fixture(),down=f.fire('pointerdown',{pointerId:4,isPrimary:false,clientX:130,clientY:90});
  assert.equal(down.prevented,true);assert.ok(f.captures.has(4));assert.deepEqual(f.element.focused,{preventScroll:true});
  f.fire('pointermove',{pointerId:4,isPrimary:false,clientX:145,clientY:84,buttons:0},f.outside);
  assert.deepEqual(f.rotations,[{dx:15,dy:-6,pointerType:'touch'}]);
  f.fire('pointerup',{pointerId:4,clientX:145,clientY:84},f.outside);
  assert.equal(f.captures.size,0);assert.equal(f.starts.length,1);assert.equal(f.ends.length,1);
  f.controller.destroy();
});

test('two fingers combine centroid pan and inverse span zoom while contact-count transitions rebase',()=>{
  const f=fixture();
  f.fire('pointerdown',{pointerId:1,clientX:150,clientY:100});
  f.fire('pointermove',{pointerId:1,clientX:160,clientY:100});
  f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:260,clientY:100});
  assert.equal(f.rotations.length,1);assert.equal(f.transforms.length,0);
  f.fire('pointermove',{pointerId:2,isPrimary:false,clientX:280,clientY:120});
  assert.equal(f.transforms.length,1);
  assert.deepEqual(f.transforms[0].from,{x:110,y:50,span:100});
  assert.deepEqual(f.transforms[0].to,{x:120,y:60,span:Math.hypot(120,20)});
  near(f.transforms[0].factor,100/Math.hypot(120,20));
  f.fire('pointerup',{pointerId:1,clientX:160,clientY:100});
  assert.equal(f.ends.length,0,'Lifting one finger does not end the remaining contact.');
  f.fire('pointermove',{pointerId:2,isPrimary:false,clientX:283,clientY:118});
  assert.deepEqual(f.rotations[1],{dx:3,dy:-2,pointerType:'touch'});
  f.fire('pointerup',{pointerId:2,clientX:283,clientY:118});
  assert.equal(f.ends.length,1);assert.deepEqual(f.focuses,[]);f.controller.destroy();
});

test('translating both fingers keeps net scale unchanged and reports their total centroid movement',()=>{
  const f=fixture();f.fire('pointerdown',{pointerId:1,clientX:150,clientY:100});
  f.fire('pointerdown',{pointerId:2,clientX:250,clientY:100,isPrimary:false});
  f.fire('pointermove',{pointerId:1,clientX:170,clientY:130});
  f.fire('pointermove',{pointerId:2,clientX:270,clientY:130,isPrimary:false});
  near(f.transforms.reduce((scale,row)=>scale*row.factor,1),1);
  near(f.transforms.reduce((dx,row)=>dx+row.to.x-row.from.x,0),20);
  near(f.transforms.reduce((dy,row)=>dy+row.to.y-row.from.y,0),30);
  assert.equal(f.rotations.length,0);f.controller.destroy();
});

test('extra fingers do not replace the active pair or introduce a jump when a pair member lifts',()=>{
  const f=fixture();f.fire('pointerdown',{pointerId:1,clientX:150,clientY:100});
  f.fire('pointerdown',{pointerId:2,clientX:250,clientY:100,isPrimary:false});
  f.fire('pointerdown',{pointerId:3,clientX:350,clientY:100,isPrimary:false});
  f.fire('pointermove',{pointerId:3,clientX:450,clientY:200,isPrimary:false});
  assert.equal(f.transforms.length,0);
  f.fire('pointerup',{pointerId:1,clientX:150,clientY:100});
  assert.equal(f.transforms.length,0);
  f.fire('pointermove',{pointerId:2,clientX:260,clientY:110,isPrimary:false});
  assert.deepEqual(f.transforms[0].from,{x:250,y:100,span:Math.hypot(200,100)});
  assert.equal(f.rotations.length,0);f.controller.destroy();
});

test('nearly coincident fingers can pan without sending an infinite pinch factor',()=>{
  const f=fixture();f.fire('pointerdown',{pointerId:1,clientX:150,clientY:100});
  f.fire('pointerdown',{pointerId:2,clientX:151,clientY:100,isPrimary:false});
  f.fire('pointermove',{pointerId:1,clientX:151,clientY:101});
  assert.equal(f.transforms[0].factor,1);assert.ok(Number.isFinite(f.transforms[0].to.span));f.controller.destroy();
});

test('a small fast double tap focuses at the contact location and has no compatibility mouse duplicate',()=>{
  const f=fixture();f.fire('pointerdown',{clientX:210,clientY:160,timeStamp:100});
  f.fire('pointerup',{clientX:211,clientY:160,timeStamp:150});
  assert.deepEqual(f.focuses,[]);
  f.fire('pointerdown',{clientX:212,clientY:162,timeStamp:250});
  f.fire('pointerup',{clientX:212,clientY:162,timeStamp:300});
  assert.deepEqual(f.focuses,[{x:112,y:112,pointerType:'touch'}]);
  f.fire('dblclick',{clientX:212,clientY:162,timeStamp:301,pointerType:undefined});
  assert.equal(f.focuses.length,1);f.controller.destroy();
});

test('long taps, distant taps, a drag returning to its start, and multifinger gestures never focus',()=>{
  for(const invalid of ['long','distant','drag','multi']){
    const f=fixture();f.fire('pointerdown',{timeStamp:0});f.fire('pointerup',{timeStamp:50});
    f.fire('pointerdown',{timeStamp:150,clientX:invalid==='distant'?300:200});
    if(invalid==='drag'){
      f.fire('pointermove',{clientX:230,timeStamp:180});f.fire('pointermove',{clientX:200,timeStamp:200});
    }
    if(invalid==='multi'){
      f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:300,timeStamp:180});
      f.fire('pointerup',{pointerId:2,clientX:300,timeStamp:200});
    }
    f.fire('pointerup',{timeStamp:invalid==='long'?500:250,clientX:invalid==='distant'?300:200});
    assert.equal(f.focuses.length,0,invalid);f.controller.destroy();
  }
});

test('using an outside control between taps clears the focus shortcut without swallowing that control',()=>{
  const f=fixture();f.fire('pointerdown',{timeStamp:0});f.fire('pointerup',{timeStamp:50});
  const controlDown=f.fire('pointerdown',{pointerId:3,timeStamp:80},f.outside);
  f.fire('pointerup',{pointerId:3,timeStamp:100},f.outside);
  assert.notEqual(controlDown.prevented,true);
  f.fire('pointerdown',{timeStamp:150});f.fire('pointerup',{timeStamp:200});
  assert.equal(f.focuses.length,0);f.controller.destroy();
});

test('mouse drag, hover rejection, secondary buttons and double-click retain desktop behavior',()=>{
  const f=fixture();f.fire('pointermove',{pointerType:'mouse',buttons:0,clientX:300});
  f.fire('pointerdown',{pointerType:'mouse',button:2});assert.equal(f.starts.length,0);
  f.fire('pointerdown',{pointerType:'mouse'});
  f.fire('pointermove',{pointerType:'mouse',clientX:215,clientY:145});
  assert.deepEqual(f.rotations,[{dx:15,dy:-5,pointerType:'mouse'}]);
  f.fire('pointermove',{pointerType:'mouse',buttons:0,clientX:220});
  assert.equal(f.ends.length,1);assert.equal(f.ends[0].cancelled,true);assert.equal(f.captures.size,0);
  f.fire('dblclick',{pointerType:'mouse',clientX:215,clientY:145});
  assert.deepEqual(f.focuses,[{x:115,y:95,pointerType:'mouse'}]);f.controller.destroy();
});

test('Pencil contact on an outside control cancels a resting palm and suppresses it until a fresh touch',()=>{
  const f=fixture();f.fire('pointerdown',{pointerId:1});
  const pencil=f.fire('pointerdown',{pointerId:20,pointerType:'pen'},f.outside);
  assert.notEqual(pencil.prevented,true);assert.equal(f.captures.size,0);assert.equal(f.ends.length,1);
  f.fire('pointermove',{pointerId:1,clientX:230});
  f.fire('pointerdown',{pointerId:2,isPrimary:false});f.fire('pointermove',{pointerId:2,clientX:240});
  assert.equal(f.rotations.length,0);
  f.fire('pointerup',{pointerId:20,pointerType:'pen'},f.outside);
  f.fire('pointermove',{pointerId:1,clientX:260});f.fire('pointerup',{pointerId:1});
  assert.equal(f.rotations.length,0,'An old resting touch is never revived after pen lift.');
  f.fire('pointerdown',{pointerId:3});f.fire('pointermove',{pointerId:3,clientX:207});
  assert.deepEqual(f.rotations,[{dx:7,dy:0,pointerType:'touch'}]);f.controller.destroy();
});

test('Pencil can take over the view, rotate with zero buttons reports, and keep palm suppression after capture loss',()=>{
  const f=fixture();f.fire('pointerdown',{pointerId:1});
  f.fire('pointerdown',{pointerId:10,pointerType:'pen'});
  f.fire('pointermove',{pointerId:10,pointerType:'pen',buttons:0,clientX:213});
  assert.deepEqual(f.rotations,[{dx:13,dy:0,pointerType:'pen'}]);
  f.fire('lostpointercapture',{pointerId:10,pointerType:'pen'});
  f.fire('pointerdown',{pointerId:2});f.fire('pointermove',{pointerId:2,clientX:230});
  assert.equal(f.rotations.length,1);
  f.fire('pointerup',{pointerId:10,pointerType:'pen'},f.outside);
  f.fire('pointerdown',{pointerId:3});f.fire('pointermove',{pointerId:3,clientX:209});
  assert.equal(f.rotations.length,2);assert.equal(f.rotations[1].pointerType,'touch');f.controller.destroy();
});

test('cancellation and lifecycle exits release all captures once and clear pending taps',()=>{
  for(const exit of ['pointercancel','lostpointercapture','blur','pagehide','resize','scroll','visibilitychange','disabled']){
    const f=fixture();f.fire('pointerdown',{pointerId:1});f.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:300});
    if(exit==='visibilitychange'){f.doc.hidden=true;f.fire(exit,{},f.doc);}
    else if(exit==='disabled'){f.available(false);f.fire('pointermove');}
    else if(exit==='pointercancel'||exit==='lostpointercapture'){
      f.fire(exit,{pointerId:1});f.fire(exit,{pointerId:2});
    }else f.fire(exit,{},f.win);
    assert.equal(f.captures.size,0,exit);assert.equal(f.ends.length,1,exit);
    f.fire('pointerup');f.fire('pointerup',{pointerId:2});assert.equal(f.ends.length,1,exit);
    f.controller.destroy();
  }
});

test('descendant focus blur leaves a held camera gesture intact, but disabled or hidden views reject starts',()=>{
  const f=fixture();f.fire('pointerdown');f.fire('blur',{},f.outside);
  f.fire('pointermove',{clientX:209});assert.equal(f.rotations.length,1);
  f.controller.cancel();f.available(false);f.fire('pointerdown',{pointerId:2});
  f.available(true);f.doc.hidden=true;f.fire('pointerdown',{pointerId:3});
  assert.equal(f.starts.length,1);f.controller.destroy();
});

test('destroy detaches every listener and the browser export validates its element',()=>{
  const f=fixture();f.fire('pointerdown');f.controller.destroy();f.controller.destroy();
  assert.equal(f.ends.length,1);assert.equal(f.captures.size,0);
  for(const target of [f.win,f.doc,f.element])assert.equal(target.count(),0);
  f.fire('pointerdown');assert.equal(f.starts.length,1);
  assert.throws(()=>G.create({element:{}}),TypeError);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./camera-gestures.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicCameraGestures.create,'function');
});
