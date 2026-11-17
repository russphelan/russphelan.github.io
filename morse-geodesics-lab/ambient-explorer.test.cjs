'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('./ambient-explorer.js');
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));

test('equator pairs have exactly two independent circle coordinates and round-trip the visible torus',()=>{
 for(let i=0;i<33;i++)for(let j=0;j<19;j++){
  const u=2*Math.PI*i/33,v=2*Math.PI*j/19,p=A.torusPoint(u,v),q=A.torusCoordinates(p),pair=A.productPoint(u,v);
  assert.ok(distance(A.torusPoint(q.u,q.v),p)<1e-12);
  assert.equal(pair[0][2],0);assert.equal(pair[1][2],0);
  assert.ok(Math.abs(Math.hypot(...pair[0])-1)<1e-14);assert.ok(Math.abs(Math.hypot(...pair[1])-1)<1e-14);
 }
});

test('the two latitude freedoms leave the torus independently while staying on the product of spheres',()=>{
 const equators=A.productPoint(.7,1.2),a=A.productPoint(.7,1.2,.4,0),b=A.productPoint(.7,1.2,0,-.3);
 assert.deepEqual(a[1],equators[1]);assert.deepEqual(b[0],equators[0]);
 assert.ok(a[0][2]>0);assert.ok(b[1][2]<0);
 for(const point of [...a,...b])assert.ok(Math.abs(Math.hypot(...point)-1)<1e-14);
});

test('each generator contracts through its sphere with the other coordinate fixed, to exactly one point',()=>{
 for(const cycle of ['a','b'])for(const progress of [0,.001,.3,.8,1]){
  const fixed=.73,which=cycle==='a'?0:1,other=1-which;
  const origin=A.loopPair(0,progress,cycle,fixed);
  for(let i=0;i<=100;i++){
   const pair=A.loopPair(2*Math.PI*i/100,progress,cycle,fixed);
   assert.deepEqual(pair[other],origin[other]);
   for(const point of pair)assert.ok(Math.abs(Math.hypot(...point)-1)<1e-14);
   if(progress===0)assert.equal(pair[which][2],0);
   else assert.ok(pair[which][2]>0,'The contracting loop immediately leaves the marked equator.');
   if(progress===1)assert.deepEqual(pair[which],[0,0,1]);
  }
  assert.ok(distance(A.loopPair(0,progress,cycle,fixed)[which],A.loopPair(2*Math.PI,progress,cycle,fixed)[which])<1e-14);
 }
});

test('manual/animated contraction is bounded and cannot jump after a delayed frame',()=>{
 assert.equal(A.advance(0,0),0);assert.equal(A.advance(1,50),1);
 assert.equal(A.advance(.2,-100),.2);
 assert.equal(A.advance(.2,10000),A.advance(.2,50));
 assert.ok(A.advance(.2,50)>.2);
 assert.throws(()=>A.advance(0,50,0),RangeError);
});

test('the explanation loads without dependencies and validates mathematical coordinates',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./ambient-explorer.js'),'utf8'),context);
 assert.equal(typeof context.GeodesicAmbientExplorer.create,'function');
 assert.throws(()=>A.productPoint(NaN,0),RangeError);assert.throws(()=>A.torusCoordinates([1,2]),TypeError);
 assert.throws(()=>A.loopPair(0,.5,'c'),RangeError);
});

function componentFixture(record=false){
 const nodes={},tasks=new Map(),commands=[];let draws=0,serial=0;
 function element(){return {value:'',textContent:'',hidden:false,disabled:false,style:{},dataset:{},handlers:{},attributes:{},
  classList:{add(){}},setAttribute(k,v){this.attributes[k]=String(v);},addEventListener(k,v){this.handlers[k]=v;},removeEventListener(k){delete this.handlers[k];},
  setPointerCapture(){},focus(){},getBoundingClientRect(){return {width:900,height:300};}};}
 const ctx={setTransform(){},clearRect(){draws++;commands.length=0;},fillRect(){},beginPath(){},moveTo(...args){if(record)commands.push(['move',...args]);},lineTo(...args){if(record)commands.push(['line',...args]);},closePath(){},arc(...args){if(record)commands.push(['arc',...args]);},fill(){},stroke(){},setLineDash(){},fillText(){},
  createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};}};
 const win={...element(),devicePixelRatio:1,matchMedia(){return {matches:false};},ResizeObserver:class{observe(){}disconnect(){}},
  requestAnimationFrame(fn){tasks.set(++serial,fn);return serial;},cancelAnimationFrame(id){tasks.delete(id);}};
 const doc={...element(),hidden:false,defaultView:win};
 const root={...element(),ownerDocument:doc,id:'ambient-test',querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];if(!nodes[key])nodes[key]=element();nodes[key].getContext=()=>ctx;return nodes[key];}};
 const view=A.create(root);
 return {view,nodes,win,doc,tasks,commands,draws:()=>draws,step(now){const pending=[...tasks];tasks.clear();for(const [,fn]of pending)fn(now);}};
}

test('cached reference geometry remains identical after camera reset, contraction, and a fresh viewer',()=>{
 const f=componentFixture(true);f.view.setContext({active:true});const original=JSON.stringify(f.commands);
 const key=key=>f.nodes.canvas.handlers.keydown({key,preventDefault(){}});
 key('ArrowRight');assert.notEqual(JSON.stringify(f.commands),original,'Camera changes still reproject the same reference coordinates.');
 key('Home');assert.equal(JSON.stringify(f.commands),original);
 f.nodes['mode-loop'].handlers.click();f.nodes.cycle.value='b';f.nodes.cycle.handlers.change();f.nodes.contraction.value='750';f.nodes.contraction.handlers.input();
 f.nodes['mode-points'].handlers.click();assert.equal(JSON.stringify(f.commands),original,'The dynamic loop must never mutate the cached surface or sphere grids.');
 const fresh=componentFixture(true);fresh.view.setContext({active:true});assert.equal(JSON.stringify(fresh.commands),original);
 f.view.destroy();fresh.view.destroy();
});

test('ambient camera gestures keep pointer ownership and cannot survive interruption',()=>{
 for(const interruption of ['blur','pagehide','hidden','closed','released']){
  const f=componentFixture();f.view.setContext({active:true});
  const event=(id=7,extra={})=>({button:0,buttons:1,pointerId:id,clientX:100,clientY:100,...extra});
  const pointer=(type,id=7,extra={})=>f.nodes.canvas.handlers[type](event(id,extra));
  pointer('pointerdown');pointer('pointerdown',8,{isPrimary:false});pointer('pointerup',8);
  let before=f.draws();pointer('pointermove',7,{clientX:110});assert.equal(f.draws(),before+1);
  if(interruption==='hidden'){f.doc.hidden=true;f.doc.handlers.visibilitychange();f.doc.hidden=false;f.doc.handlers.visibilitychange();}
  else if(interruption==='closed'){f.view.setContext({active:false});f.view.setContext({active:true});}
  else if(interruption==='released')pointer('pointermove',7,{buttons:0,clientX:120});
  else f.win.handlers[interruption]();
  before=f.draws();pointer('pointermove',7,{clientX:140});assert.equal(f.draws(),before,interruption+' must end the old camera drag.');
  f.view.destroy();f.view.setContext({active:true});assert.equal(f.draws(),before);
 }
});

test('ambient animation stops when closed, hidden, or destroyed and never schedules idle frames',()=>{
 for(const interruption of ['closed','hidden','destroyed']){
  const f=componentFixture();f.view.setContext({active:true});assert.equal(f.tasks.size,0);
  f.nodes['mode-loop'].handlers.click();f.nodes.play.handlers.click();assert.equal(f.tasks.size,1);
  f.step(100);f.step(150);assert.ok(f.view.getState().contraction>0);
  if(interruption==='closed')f.view.setContext({active:false});
  else if(interruption==='hidden'){f.doc.hidden=true;f.doc.handlers.visibilitychange();}
  else f.view.destroy();
  assert.equal(f.tasks.size,0);assert.equal(f.view.getState().playing,false);
  const before=f.draws();f.step(200);assert.equal(f.draws(),before);f.view.destroy();
 }
});
