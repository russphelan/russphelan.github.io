'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('./neck-view-resize.js');

test('width bounds preserve useful torus and neck minima on desktop and narrow screens',()=>{
 for(const [width,narrow,left,right]of [[1248,false,240,240],[701,false,240,240],[390,true,120,160]])for(const value of [-2,0,.3,.7,1,4]){
  const ratio=V.split(value,width,{narrow}),available=width-8;
  assert.ok(ratio*available>=left-1e-9);assert.ok((1-ratio)*available>=right-1e-9);
 }
 assert.ok(V.split(0,220,{narrow:true})>0);assert.ok(V.split(1,220,{narrow:true})<1);
 for(const call of [()=>V.split(NaN,1000),()=>V.split(.4,0),()=>V.split(.4,1000,{gap:-1})])assert.throws(call);
});

test('height fitting allows independent changes and borrows the other canvas only at the shared limit',()=>{
 assert.deepEqual(V.fitHeights(150,230,400),{overview:150,scanner:230,budget:400,minimumOverview:90,minimumScanner:120});
 const tallOverview=V.fitHeights(350,230,400,{priority:'overview'});
 assert.equal(tallOverview.overview,280);assert.equal(tallOverview.scanner,120);
 const tallScanner=V.fitHeights(150,350,400,{priority:'scanner'});
 assert.equal(tallScanner.overview,90);assert.equal(tallScanner.scanner,310);
 const fit=V.fitHeights(300,500,400);assert.equal(fit.overview+fit.scanner,400);assert.ok(fit.overview>=90);assert.ok(fit.scanner>=120);
 const tight=V.fitHeights(150,230,130);assert.ok(tight.overview+tight.scanner<=130);assert.ok(tight.overview>0&&tight.scanner>0);
 for(const call of [()=>V.fitHeights(NaN,200,400),()=>V.fitHeights(100,200,0),()=>V.fitHeights(100,200,400,{priority:'other'})])assert.throws(call);
});

function fixture({observer=true}={}){
 let updates=0,observations=0,disconnected=0;
 function element(){const classes=new Set(),values=new Map();return {children:[],handlers:{},dataset:{},attributes:{},hidden:false,disabled:false,
  classList:{add(...ns){ns.forEach(n=>classes.add(n));},remove(...ns){ns.forEach(n=>classes.delete(n));},contains:n=>classes.has(n)},
  style:{getPropertyValue:n=>values.get(n)||'',setProperty(n,v){values.set(n,v);},removeProperty(n){values.delete(n);}},
  append(child){this.children.push(child);child.parentElement=this;},remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);},
  addEventListener(type,fn){this.handlers[type]=fn;},removeEventListener(type){delete this.handlers[type];},
  setAttribute(n,v){this.attributes[n]=String(v);},getAttribute(n){return this.attributes[n];},
  setPointerCapture(id){this.captured=id;},hasPointerCapture(id){return this.captured===id;},releasePointerCapture(id){assert.equal(this.captured,id);this.captured=null;},
  getBoundingClientRect(){return this.box();},querySelector(){return null;}};}
 const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
 const observers=[];
 const win={...element(),innerWidth:1280,innerHeight:720,scrollX:0,scrollY:0,
  getComputedStyle:()=>({paddingTop:'8px',paddingBottom:'8px',borderTopWidth:'1px',borderBottomWidth:'1px',rowGap:'8px'}),
  ResizeObserver:class{constructor(fn){observers.push(fn);}observe(){observations++;}disconnect(){disconnected++;}}};
 if(!observer)delete win.ResizeObserver;
 const doc={...element(),defaultView:win,hidden:false,createElement:()=>element()};
 const workspace=element(),sceneColumn=element(),surfacePanel=element(),neckPanel=element(),component=element(),overview=element(),scanner=element(),overviewWrap=element(),scannerWrap=element(),scanControls=element(),sideControls=element(),topline=element(),constructionControls=element();
 workspace.ownerDocument=doc;neckPanel.scrollTop=0;
 const dimensions={width:1248,height:540,notes:50,visible:true,headerTop:40,controlsHeight:55};
 const pixels=(name,fallback)=>{const value=parseFloat(workspace.style.getPropertyValue(name));return Number.isFinite(value)?value:fallback;};
 const ratio=()=>pixels('--neck-surface-track',.55);
 const leftWidth=()=>Math.max(1,dimensions.width-8)*ratio();
 const a=()=>pixels('--neck-overview-height',150),b=()=>pixels('--neck-scanner-height',250),top=()=>dimensions.headerTop+8-neckPanel.scrollTop-win.scrollY;
 const chrome=()=>94+(overviewWrap.children[0]?.hidden?0:18)+(scannerWrap.children[0]?.hidden?0:18);
 sceneColumn.box=()=>box(16,dimensions.headerTop-win.scrollY,dimensions.width,dimensions.height+70);
 surfacePanel.box=()=>box(16,dimensions.headerTop-win.scrollY,leftWidth(),dimensions.height);
 neckPanel.box=()=>box(24+leftWidth(),dimensions.headerTop-win.scrollY,dimensions.visible?dimensions.width-8-leftWidth():0,dimensions.visible?dimensions.height:0);
 Object.defineProperty(neckPanel,'clientHeight',{get:()=>dimensions.height-2});
 component.box=()=>box(32+leftWidth(),top(),dimensions.width-24-leftWidth(),chrome()+a()+b()+dimensions.notes);
 overview.box=()=>box(32+leftWidth(),top()+35,dimensions.width-24-leftWidth(),a());
 scanner.box=()=>box(32+leftWidth(),top()+70+a(),dimensions.width-24-leftWidth(),b());
 overviewWrap.box=()=>box(32+leftWidth(),top()+35,dimensions.width-24-leftWidth(),a()+18);
 scannerWrap.box=()=>box(32+leftWidth(),top()+70+a(),dimensions.width-24-leftWidth(),b()+32);
 scanControls.box=()=>box(32+leftWidth(),top()+chrome()-20+a()+b(),200,20);
 sideControls.box=()=>box(240+leftWidth(),top()+chrome()-20+a()+b(),150,20);
 topline.box=()=>box(32+leftWidth(),top(),300,20);constructionControls.box=()=>box(16,dimensions.headerTop+8+dimensions.height-win.scrollY,dimensions.width,dimensions.controlsHeight);
 const mapping={'[data-neck="overview"]':overview,'[data-neck="canvas"]':scanner,'.neck-overview-wrap':overviewWrap,'.neck-scanner-wrap':scannerWrap,'.neck-explanation':component,'.neck-scan-controls':scanControls,'.neck-side-controls':sideControls,'.neck-topline':topline};
 neckPanel.querySelector=s=>mapping[s]||null;
 workspace.style.setProperty('--view-surface-height','550px');workspace.style.setProperty('--view-hidden-track','.5fr');
 const view=V.create({workspace,sceneColumn,surfacePanel,neckPanel,constructionControls,onResize(){updates++;}});
 const seam=sceneColumn.children[0],overviewGrip=overviewWrap.children[0],scannerGrip=scannerWrap.children[0],reset=topline.children[0];
 const event=(extra={})=>({preventDefault(){},stopPropagation(){},...extra});
 const key=(node,key,extra={})=>node.handlers.keydown(event({key,...extra}));
 const pointer=(node,type,extra={})=>node.handlers[type](event({button:0,buttons:1,isPrimary:true,pointerId:7,clientX:500,clientY:300,...extra}));
 return {view,workspace,sceneColumn,surfacePanel,neckPanel,component,overview,scanner,overviewGrip,scannerGrip,seam,reset,constructionControls,win,doc,dimensions,key,pointer,
  resizeObserver(){observers.forEach(fn=>fn());},updates:()=>updates,observations:()=>observations,disconnected:()=>disconnected};
}

test('optional controls fit both canvases while preserving unrelated sizes and the fixed construction row',()=>{
 const f=fixture();assert.equal(f.seam.hidden,true);assert.equal(f.overviewGrip.hidden,true);assert.equal(f.updates(),0);
 f.view.setContext({active:true});const state=f.view.snapshot();
 assert.equal(state.effective.budget,392);assert.equal(state.effective.overview+state.effective.scanner,392);
 assert.equal(f.workspace.style.getPropertyValue('--view-surface-height'),'550px');assert.equal(f.workspace.style.getPropertyValue('--view-hidden-track'),'.5fr');
 assert.equal(f.dimensions.height,540);assert.equal(f.seam.hidden,false);assert.ok(f.observations()>3);
 assert.equal(f.overviewGrip.attributes.role,'separator');assert.equal(f.overviewGrip.attributes['aria-orientation'],'horizontal');
 assert.match(f.scannerGrip.attributes['aria-valuetext'],/construction slider remains below/);
 f.view.destroy();assert.equal(f.disconnected(),1);assert.equal(f.workspace.style.getPropertyValue('--neck-overview-height'),'');
 assert.equal(f.workspace.style.getPropertyValue('--view-surface-height'),'550px');
});

test('the initial budget includes visible grip footers even without ResizeObserver',()=>{
 const f=fixture({observer:false});f.view.setContext({active:true});
 assert.equal(f.view.snapshot().effective.budget,392);assert.equal(f.overviewGrip.hidden,false);assert.equal(f.scannerGrip.hidden,false);
 f.view.setContext({active:false});f.view.setContext({active:true});assert.equal(f.view.snapshot().effective.budget,392);
 f.view.destroy();
});

test('the outer row reserves changing headers and construction controls without touching saved view heights',()=>{
 const f=fixture();f.view.setContext({active:true});
 assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'605px');
 f.dimensions.headerTop=120;f.resizeObserver();assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'525px');
 f.dimensions.controlsHeight=90;f.resizeObserver();assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'490px');
 f.constructionControls.hidden=true;f.resizeObserver();
 assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'580px');
 f.constructionControls.hidden=false;f.dimensions.headerTop=1000;f.resizeObserver();
 assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'1px');
 assert.equal(f.workspace.style.getPropertyValue('--view-surface-height'),'550px');
 f.view.destroy();assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'');
});

test('row limits are scroll invariant and repeated active contexts redraw only for a real position change',()=>{
 const f=fixture();f.view.setContext({active:true});const before=f.updates();
 f.win.scrollY=160;f.neckPanel.scrollTop=80;f.resizeObserver();
 assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'605px');assert.equal(f.updates(),before);
 for(let i=0;i<8;i++)f.view.setContext({active:true});assert.equal(f.updates(),before);
 f.dimensions.headerTop=90;f.view.setContext({active:true});
 assert.equal(f.workspace.style.getPropertyValue('--neck-row-limit'),'555px');assert.equal(f.updates(),before+1);
 for(let i=0;i<8;i++){f.view.setContext({active:true});f.resizeObserver();}assert.equal(f.updates(),before+1);
 f.view.destroy();
});

test('keyboard resizing stays available during construction and dimensions reset independently',()=>{
 const f=fixture();f.view.setContext({active:true,locked:true});
 const initial=f.view.snapshot().effective;
 f.key(f.overviewGrip,'ArrowDown',{shiftKey:true});let state=f.view.snapshot();assert.equal(state.effective.overview,initial.overview+40);assert.equal(state.effective.overview+state.effective.scanner,392);
 f.key(f.scannerGrip,'ArrowUp');state=f.view.snapshot();const heights={...state.effective};
 f.key(f.seam,'ArrowRight');assert.ok(f.view.snapshot().requested.split>.55);assert.equal(f.view.snapshot().effective.overview,heights.overview);
 f.key(f.seam,'Home');assert.equal(f.view.snapshot().requested.split,null);assert.equal(f.view.snapshot().effective.scanner,heights.scanner);
 f.key(f.overviewGrip,'Home');assert.equal(f.view.snapshot().requested.overview,null);assert.equal(f.view.snapshot().requested.scanner,state.requested.scanner);
 f.reset.handlers.click();assert.deepEqual(f.view.snapshot().requested,{split:null,overview:null,scanner:null});
 f.view.destroy();
});

test('pointer drags own their gesture, enlarge by borrowing space, and release capture on interruption',()=>{
 const f=fixture();f.view.setContext({active:true});const before=f.view.snapshot().effective;
 f.pointer(f.overviewGrip,'pointerdown');f.pointer(f.scannerGrip,'pointerdown',{pointerId:8,isPrimary:false});
 f.pointer(f.overviewGrip,'pointermove',{pointerId:8,clientY:500});assert.equal(f.view.snapshot().requested.overview,null);
 f.pointer(f.overviewGrip,'pointermove',{clientY:500});let state=f.view.snapshot();
 assert.equal(state.effective.overview,262);assert.equal(state.effective.scanner,130);assert.ok(state.effective.overview>before.overview);
 f.pointer(f.overviewGrip,'pointerup',{pointerId:8});assert.equal(f.overviewGrip.captured,7);
 f.win.handlers.blur();assert.equal(f.overviewGrip.captured,null);
 f.pointer(f.overviewGrip,'pointermove',{clientY:650});assert.deepEqual(f.view.snapshot().effective,state.effective);
 f.pointer(f.seam,'pointerdown',{clientX:500});f.pointer(f.seam,'pointermove',{clientX:650});assert.ok(f.view.snapshot().requested.split>.55);
 f.pointer(f.seam,'pointerup');assert.equal(f.seam.captured,null);f.view.destroy();
});

test('panel scrolling and expanded mathematical notes cannot inflate the canvas budget or start feedback drawing',()=>{
 const f=fixture();f.view.setContext({active:true});const before=f.view.snapshot(),updates=f.updates();
 f.neckPanel.scrollTop=180;f.dimensions.notes=1800;f.resizeObserver();
 assert.deepEqual(f.view.snapshot(),before);assert.equal(f.updates(),updates);
 for(let i=0;i<5;i++)f.resizeObserver();assert.equal(f.updates(),updates,'Unchanged ResizeObserver measurements do not request new drawing.');
 f.view.destroy();
});

test('responsive fitting preserves requested preferences through smaller, larger, closed and reopened layouts',()=>{
 const f=fixture();f.view.setContext({active:true});f.key(f.overviewGrip,'ArrowDown',{shiftKey:true});const requested=f.view.snapshot().requested;
 f.dimensions.height=380;f.win.innerHeight=560;f.win.handlers.resize();let state=f.view.snapshot();
 assert.ok(state.effective.overview+state.effective.scanner<=232);assert.deepEqual(state.requested,requested);
 f.view.setContext({active:false});f.dimensions.visible=false;f.resizeObserver();assert.deepEqual(f.view.snapshot().requested,requested);assert.equal(f.overviewGrip.hidden,true);
 f.dimensions.visible=true;f.dimensions.height=620;f.view.setContext({active:true});state=f.view.snapshot();assert.deepEqual(state.requested,requested);assert.ok(state.effective.overview>100);
 f.win.innerWidth=390;f.dimensions.width=374;f.win.handlers.resize();f.key(f.seam,'ArrowRight',{shiftKey:true});
 const r=f.view.snapshot().requested.split;assert.ok(r*(374-8)>=120-1e-8);assert.ok((1-r)*(374-8)>=160-1e-8);
 f.view.destroy();
});

test('a keyboard width adjustment starts from the visible responsive split, not an off-screen stored preference',()=>{
 const f=fixture();f.view.setContext({active:true});
 for(let i=0;i<8;i++)f.key(f.seam,'ArrowRight',{shiftKey:true});
 const wide=f.view.snapshot().requested.split;assert.ok(wide>.7);
 f.win.innerWidth=390;f.dimensions.width=374;f.win.handlers.resize();
 const before=f.surfacePanel.getBoundingClientRect().width/(374-8);
 assert.equal(f.view.snapshot().requested.split,wide,'Passive responsive fitting retains the wide preference.');
 f.key(f.seam,'ArrowLeft');
 assert.ok(Math.abs(f.view.snapshot().requested.split-(before-.02))<1e-12,'One arrow press visibly changes the clamped split.');
 f.view.destroy();
});

test('an extremely short saved pane can recover its automatic canvases when space returns',()=>{
 const f=fixture();f.view.setContext({active:true});
 f.dimensions.height=100;f.win.handlers.resize();assert.ok(f.view.snapshot().effective.budget<10);
 f.dimensions.height=540;f.win.handlers.resize();
 assert.equal(f.view.snapshot().effective.budget,392);assert.ok(f.view.snapshot().effective.overview>100);assert.ok(f.view.snapshot().effective.scanner>200);
 f.view.destroy();
});

test('scrolling the page adjusts the captured vertical gesture, and all lifecycle exits stop it',()=>{
 for(const reason of ['pointercancel','lostpointercapture','blur','pagehide','hidden','resize','closed','released']){
  const f=fixture();f.view.setContext({active:true});f.pointer(f.overviewGrip,'pointerdown');f.win.scrollY=30;
  f.pointer(f.overviewGrip,'pointermove',{clientY:310});const before=f.view.snapshot().effective.overview;
  assert.equal(before,187);
  if(reason==='hidden'){f.doc.hidden=true;f.doc.handlers.visibilitychange();f.doc.hidden=false;}
  else if(reason==='closed')f.view.setContext({active:false});
  else if(reason==='released')f.pointer(f.overviewGrip,'pointermove',{buttons:0,clientY:400});
  else if(f.win.handlers[reason])f.win.handlers[reason]();
  else f.pointer(f.overviewGrip,reason);
  f.pointer(f.overviewGrip,'pointermove',{clientY:450});assert.equal(f.view.snapshot().effective.overview,before,reason);
  assert.equal(f.workspace.classList.contains('neck-resize-dragging'),false);f.view.destroy();
 }
});

test('inactive and destroyed controls cannot mutate preferences, leak handlers or request drawing',()=>{
 const f=fixture();f.key(f.overviewGrip,'ArrowDown');f.pointer(f.seam,'pointerdown');assert.deepEqual(f.view.snapshot().requested,{split:null,overview:null,scanner:null});
 f.view.setContext({active:true});f.doc.hidden=true;f.doc.handlers.visibilitychange();const before=f.view.snapshot(),updates=f.updates();
 f.key(f.scannerGrip,'ArrowDown');f.pointer(f.overviewGrip,'pointerdown');assert.deepEqual(f.view.snapshot(),before);assert.equal(f.updates(),updates);
 f.doc.hidden=false;f.view.destroy();f.view.setContext({active:true});f.view.reset();assert.equal(f.seam.handlers.pointerdown,undefined);assert.equal(f.doc.handlers.visibilitychange,undefined);
 assert.equal(f.sceneColumn.children.length,0);assert.equal(f.workspace.classList.contains('neck-resize-ready'),false);
 assert.equal(f.workspace.style.getPropertyValue('--neck-panel-track'),'');
});
