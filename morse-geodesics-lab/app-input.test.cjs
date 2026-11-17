'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const start=source.indexOf("  canvas.addEventListener('pointerdown'");
const end=source.indexOf("  $('scene-stage').addEventListener('wheel'",start);
assert.ok(start>=0&&end>start,'Exercise the actual main-scene camera handlers.');
function cameraInput(){
 const handlers={},windowHandlers={},captures=[],turns=[];
 const context={dragging:null,canvas:{addEventListener(type,fn){handlers[type]=fn;},setPointerCapture(id){captures.push(id);}},
  window:{addEventListener(type,fn){windowHandlers[type]=fn;}},
  cameraChange(...args){turns.push(args);}};
 vm.runInNewContext(source.slice(start,end),context);
 const fire=(type,id,x=100,y=100,extra={})=>handlers[type]({button:0,isPrimary:true,pointerId:id,clientX:x,clientY:y,...extra});
 return {context,turns,captures,fire,windowHandlers};
}
test('scene camera movement belongs to the primary captured pointer, including id zero',()=>{
 const v=cameraInput();
 v.fire('pointerdown',0,100,100);assert.deepEqual(v.captures,[0]);
 v.fire('pointermove',0,110,120);assert.equal(v.turns.length,1);
 assert.ok(Math.abs(v.turns[0][0]-.07)<1e-12);assert.ok(Math.abs(v.turns[0][1]+.14)<1e-12);
 v.fire('pointermove',8,900,900);v.fire('pointerup',8);
 v.fire('pointerdown',8,900,900,{isPrimary:false});v.fire('pointerdown',9,900,900);
 assert.equal(v.captures.length,1,'An existing gesture cannot be replaced by another pointer.');
 v.fire('pointermove',0,115,117);assert.equal(v.turns.length,2);
 assert.ok(Math.abs(v.turns[1][0]-.035)<1e-12);assert.ok(Math.abs(v.turns[1][1]-.021)<1e-12,
  'Unrelated events cannot move the active drag origin.');
 v.fire('pointerup',0);v.fire('pointermove',0,200,200);assert.equal(v.turns.length,2);
});
test('window blur and a missed release stop camera motion before a fresh gesture',()=>{
 for(const action of ['blur','missed-release']){
  const v=cameraInput();v.fire('pointerdown',1,100,100);
  if(action==='blur')v.windowHandlers.blur();
  else v.fire('pointermove',1,900,900,{buttons:0});
  v.fire('pointermove',1,110,120);assert.equal(v.turns.length,0,action+' cannot leave rotation active.');
  v.fire('pointerdown',2,200,200);v.fire('pointermove',2,210,210);
  assert.equal(v.turns.length,1,'A new drag works after '+action+'.');
 }
});
test('scene camera ignores nonprimary starts and ends only the matching cancelled or lost pointer',()=>{
 for(const end of ['pointerup','pointercancel','lostpointercapture']){
  const v=cameraInput();v.fire('pointerdown',2,0,0,{isPrimary:false});v.fire('pointerdown',3,0,0,{button:2});
  assert.equal(v.captures.length,0);assert.equal(v.turns.length,0);
  v.fire('pointerdown',4,30,40);v.fire(end,7);v.fire('pointermove',4,35,45);
  assert.equal(v.turns.length,1,'Another pointer cannot end the primary camera gesture.');
  v.fire(end,4);v.fire('pointermove',4,55,65);assert.equal(v.turns.length,1);
  v.fire('pointerdown',5,55,65);v.fire('pointermove',5,60,70);assert.equal(v.turns.length,2,'A fresh gesture works after '+end+'.');
 }
});
