'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('./traversal-hold.js');

function fixture(){
  function target(){
    const listeners=new Map();
    return {disabled:false,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
      removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
      fire(type,extra={}){for(const fn of listeners.get(type)||[])fn({type,target:this,currentTarget:this,eventPhase:2,pointerId:1,button:0,buttons:1,isPrimary:true,...extra});},
      count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);}};
  }
  const win=target(),doc={...target(),hidden:false,defaultView:win},sliders=[target(),target()];
  for(const slider of sliders)slider.ownerDocument=doc;
  const changes=[],hold=H.create(sliders,{onChange:held=>changes.push(held)});
  return {win,doc,sliders,changes,hold};
}

test('a stationary hold remains active until release, with no input or motion timer',()=>{
  const f=fixture();f.sliders[0].fire('pointerdown');
  assert.equal(f.hold.isHeld(),true);assert.deepEqual(f.changes,[true]);
  for(let n=0;n<5;n++){
    f.sliders[0].fire('input');f.win.fire('pointermove');
    assert.equal(f.hold.isHeld(),true);
  }
  f.win.fire('pointerup');assert.equal(f.hold.isHeld(),false);assert.deepEqual(f.changes,[true,false]);
  f.hold.destroy();
});

test('both sliders share one active pointer and release outside their bounds',()=>{
  const f=fixture();f.sliders[0].fire('pointerdown',{pointerId:7});
  f.sliders[1].fire('pointerdown',{pointerId:8});
  f.win.fire('pointerup',{pointerId:8});f.win.fire('pointercancel',{pointerId:8});
  assert.equal(f.hold.isHeld(),true);assert.deepEqual(f.changes,[true]);
  f.win.fire('pointerup',{pointerId:7});assert.equal(f.hold.isHeld(),false);
  f.sliders[1].fire('pointerdown',{pointerId:0});assert.equal(f.hold.isHeld(),true);
  f.win.fire('pointerup',{pointerId:0});assert.deepEqual(f.changes,[true,false,true,false]);
  f.hold.destroy();
});

test('focusing a stationary traversal slider cannot mistake the previous button blur for window blur',()=>{
  const f=fixture(),button={tagName:'BUTTON'},position=37;
  f.sliders[0].value=position;
  // Native pointerdown precedes the old focused control's blur. That blur is
  // captured by the window even though the browser window retains focus.
  f.sliders[0].fire('pointerdown');
  f.win.fire('blur',{target:button,eventPhase:1,relatedTarget:f.sliders[0]});
  assert.equal(f.hold.isHeld(),true,'A descendant blur must not cancel the pointer that just pressed the slider.');
  assert.deepEqual(f.changes,[true]);
  assert.equal(f.sliders[0].value,position,'No thumb movement or input event is needed to keep global framing active.');
  for(let n=0;n<5;n++)f.win.fire('pointermove',{target:f.sliders[0]});
  assert.equal(f.hold.isHeld(),true);
  f.win.fire('pointerup',{target:f.sliders[0]});
  assert.deepEqual(f.changes,[true,false]);f.hold.destroy();
});

test('focus transfer between the two traversal sliders preserves each new hold until release',()=>{
  const f=fixture();
  for(const [oldIndex,nextIndex,pointerId]of [[1,0,4],[0,1,5]]){
    f.sliders[nextIndex].fire('pointerdown',{pointerId});
    f.win.fire('blur',{target:f.sliders[oldIndex],eventPhase:1,relatedTarget:f.sliders[nextIndex]});
    f.win.fire('blur',{target:f.doc,eventPhase:1});
    assert.equal(f.hold.isHeld(),true,'Captured blur belongs to the previously focused control, not the window.');
    f.win.fire('pointerup',{pointerId,target:f.sliders[nextIndex]});
    assert.equal(f.hold.isHeld(),false);
  }
  assert.deepEqual(f.changes,[true,false,true,false]);f.hold.destroy();
});

test('genuine window blur still cancels a hold after descendant focus changes were ignored',()=>{
  const f=fixture();f.sliders[0].fire('pointerdown');
  f.win.fire('blur',{target:f.sliders[1],eventPhase:1});assert.equal(f.hold.isHeld(),true);
  f.win.fire('blur');assert.equal(f.hold.isHeld(),false);
  f.win.fire('pointerup');assert.deepEqual(f.changes,[true,false]);f.hold.destroy();
});

test('touch and pen holds finish on cancellation or lost native capture',()=>{
  const f=fixture();
  f.sliders[0].fire('pointerdown',{pointerType:'touch',pointerId:5});
  f.win.fire('pointercancel',{pointerType:'touch',pointerId:5});assert.equal(f.hold.isHeld(),false);
  f.sliders[1].fire('pointerdown',{pointerType:'pen',pointerId:6});
  f.sliders[1].fire('lostpointercapture',{pointerId:9});assert.equal(f.hold.isHeld(),true);
  f.sliders[1].fire('lostpointercapture',{pointerId:6});assert.equal(f.hold.isHeld(),false);
  assert.deepEqual(f.changes,[true,false,true,false]);f.hold.destroy();
});

test('blur, page exit, hidden document and missed-release movement clear held state',()=>{
  const f=fixture();
  for(const end of [()=>f.win.fire('blur'),()=>f.win.fire('pagehide'),()=>{f.doc.hidden=true;f.doc.fire('visibilitychange');},()=>f.win.fire('pointermove',{buttons:0})]){
    f.doc.hidden=false;f.sliders[0].fire('pointerdown');assert.equal(f.hold.isHeld(),true);
    end();assert.equal(f.hold.isHeld(),false);
  }
  assert.deepEqual(f.changes,[true,false,true,false,true,false,true,false]);f.hold.destroy();
});

test('unrelated movement and visible-document events cannot end a hold',()=>{
  const f=fixture();f.sliders[1].fire('pointerdown',{pointerId:3});
  f.win.fire('pointermove',{pointerId:4,buttons:0});f.doc.fire('visibilitychange');
  assert.equal(f.hold.isHeld(),true);f.hold.clear();assert.equal(f.hold.isHeld(),false);
  f.hold.clear();assert.deepEqual(f.changes,[true,false]);f.hold.destroy();
});

test('keyboard input, secondary buttons, disabled sliders and nonprimary touch never activate a hold',()=>{
  const f=fixture();
  f.sliders[0].fire('keydown',{key:'ArrowRight'});f.sliders[0].fire('input');f.sliders[0].fire('change');
  f.sliders[0].fire('pointerdown',{button:2});f.sliders[1].fire('pointerdown',{isPrimary:false,pointerType:'touch'});
  f.sliders[0].disabled=true;f.sliders[0].fire('pointerdown');
  f.doc.hidden=true;f.sliders[1].fire('pointerdown');
  assert.equal(f.hold.isHeld(),false);assert.deepEqual(f.changes,[]);f.hold.destroy();
});

test('destroy clears a held pointer once and detaches every listener',()=>{
  const f=fixture();f.sliders[0].fire('pointerdown');f.hold.destroy();f.hold.destroy();
  assert.equal(f.hold.isHeld(),false);assert.deepEqual(f.changes,[true,false]);
  for(const target of [...f.sliders,f.doc,f.win])assert.equal(target.count(),0);
  f.sliders[0].fire('pointerdown');assert.equal(f.hold.isHeld(),false);
});

test('the dependency-free browser export validates its inputs',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./traversal-hold.js'),'utf8'),context);
  assert.equal(typeof context.GeodesicTraversalHold.create,'function');
  assert.throws(()=>H.create([]),TypeError);assert.throws(()=>H.create([{}]),TypeError);
});
