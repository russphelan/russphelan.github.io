'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('./view-resize.js');

test('pane sizes retain useful minima and bounded widths without overflow',()=>{
  assert.equal(V.height(100),160);assert.equal(V.height(2500,{viewport:700}),1400);
  assert.equal(V.height(200,{minimum:220}),220);
  for(const width of [701,850,1200])for(const ratio of [-2,0,.2,.5,1,3]){
    const r=V.split(ratio,width),available=width-8;
    assert.ok(available*r>=240-1e-10);assert.ok(available*(1-r)>=240-1e-10);
    assert.equal(available*r+available*(1-r),available);
  }
  assert.equal(V.split(.2,390),.5,'Narrow panes cannot request two unusable columns.');
  assert.throws(()=>V.split(NaN,1000),RangeError);assert.throws(()=>V.height(Infinity),RangeError);
});

function fixture(){
  let updates=0;
  function element(rect={left:0,top:0,width:500,height:350}){
    const classes=new Set(),styleValues=new Map();
    return {children:[],dataset:{},attributes:{},handlers:{},rect,
      classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},toggle(n,v){if(v)classes.add(n);else classes.delete(n);},contains(n){return classes.has(n);}},
      style:{getPropertyValue(n){return styleValues.get(n)||'';},setProperty(n,v){styleValues.set(n,v);},removeProperty(n){styleValues.delete(n);}},
      append(child){this.children.push(child);child.parent=this;},remove(){this.parent.children=this.parent.children.filter(c=>c!==this);},
      setAttribute(n,v){this.attributes[n]=String(v);},getAttribute(n){return this.attributes[n];},
      addEventListener(n,fn){this.handlers[n]=fn;},removeEventListener(n){delete this.handlers[n];},
      getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};},
      setPointerCapture(id){this.pointer=id;},querySelector(){return null;}};
  }
  const win={innerHeight:720,innerWidth:1200,...element()},doc={...element(),defaultView:win,createElement:()=>element(),hidden:false};
  const workspace=element(),sceneColumn=element({left:0,top:0,width:1008,height:600}),surfacePanel=element(),hiddenPanel=element({left:508,top:0,width:500,height:350}),canvas=element({left:0,top:0,width:1000,height:330}),toolbar=element();
  const panelBox=(panel,hidden=false)=>{
    const track=parseFloat(workspace.style.getPropertyValue('--view-surface-track'));
    if(!Number.isFinite(track)||win.innerWidth<=700)return {...panel.rect,right:panel.rect.left+panel.rect.width,bottom:panel.rect.top+panel.rect.height};
    const available=sceneColumn.rect.width-8,left=hidden?available*track+8:0,width=available*(hidden?1-track:track);
    return {...panel.rect,left,width,right:left+width,bottom:panel.rect.top+panel.rect.height};
  };
  surfacePanel.getBoundingClientRect=()=>panelBox(surfacePanel);hiddenPanel.getBoundingClientRect=()=>panelBox(hiddenPanel,true);
  workspace.ownerDocument=doc;surfacePanel.querySelector=()=>toolbar;hiddenPanel.querySelector=()=>canvas;
  const view=V.create({workspace,sceneColumn,surfacePanel,hiddenPanel,onResize(){updates++;}});
  const seam=sceneColumn.children[0],surfaceGrip=surfacePanel.children[0],hiddenGrip=hiddenPanel.children[0],reset=toolbar.children[0];
  const event=(key,extra={})=>({key,preventDefault(){},stopPropagation(){},...extra});
  const key=(grip,key,extra={})=>grip.handlers.keydown(event(key,extra));
  return {view,workspace,sceneColumn,surfacePanel,hiddenPanel,win,doc,seam,surfaceGrip,hiddenGrip,reset,key,event,updates:()=>updates};
}

test('unmodified panes leave the responsive grid height and stretch behavior intact',()=>{
  const f=fixture();
  for(const docked of [true,false,true]){
    f.view.setContext({docked});
    assert.equal(f.workspace.classList.contains('view-heights-custom'),false);
    assert.equal(f.workspace.style.getPropertyValue('--view-surface-height'),'');
    assert.equal(f.workspace.style.getPropertyValue('--view-row-height'),'');
    assert.equal(f.view.snapshot().surface,null);assert.equal(f.view.snapshot().hidden,null);
  }
  const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'view-resize.css'),'utf8');
  assert.match(css,/\.view-resize-surface-pane,\.view-resize-hidden-pane\{position:relative\}/,
    'Default panels must keep the existing grid stretch; align-self:start would collapse their flex canvas.');
  assert.match(css,/view-heights-custom[^}]+\.view-resize-surface-pane\{height:var\(--view-surface-height\);align-self:start\}/);
  f.view.destroy();
});

test('keyboard sizing is independent for both panes and survives layout transitions',()=>{
  const f=fixture();f.view.setContext({docked:true});
  assert.equal(f.seam.hidden,false);f.key(f.surfaceGrip,'ArrowDown',{shiftKey:true});
  assert.equal(f.view.snapshot().surface,400);assert.equal(f.view.snapshot().hidden,350);
  f.key(f.hiddenGrip,'ArrowUp');assert.equal(f.view.snapshot().hidden,340);assert.equal(f.view.snapshot().surface,400);
  f.key(f.seam,'ArrowLeft');assert.equal(f.view.snapshot().split,.48);
  f.view.setContext({docked:false});assert.equal(f.seam.hidden,true);
  f.view.setContext({docked:true});assert.equal(f.view.snapshot().split,.48);assert.equal(f.view.snapshot().hidden,340);
  assert.ok(f.updates()>0);f.view.destroy();
  assert.equal(f.workspace.classList.contains('view-resize-ready'),false);
});

test('construction locks resizing and reset restores every automatic dimension',()=>{
  const f=fixture();f.view.setContext({docked:true});f.key(f.surfaceGrip,'ArrowDown');f.key(f.seam,'ArrowRight');
  const before=f.view.snapshot();f.view.setContext({locked:true});
  f.key(f.surfaceGrip,'ArrowDown');f.key(f.hiddenGrip,'ArrowDown');f.reset.handlers.click();
  assert.equal(f.view.snapshot().surface,before.surface);assert.equal(f.view.snapshot().hidden,before.hidden);assert.equal(f.view.snapshot().split,before.split);
  assert.equal(f.surfaceGrip.disabled,true);assert.equal(f.seam.disabled,true);
  f.view.setContext({locked:false});f.reset.handlers.click();
  assert.deepEqual(f.view.snapshot(),{surface:null,hidden:null,standalone:null,split:null,docked:true,locked:false});
  assert.equal(f.workspace.style.getPropertyValue('--view-row-height'),'');assert.equal(f.workspace.classList.contains('view-heights-custom'),false);
  f.view.destroy();
});

test('responsive width fitting retains the requested split when a narrow window grows again',()=>{
  const f=fixture();f.view.setContext({docked:true});
  for(let i=0;i<8;i++)f.key(f.seam,'ArrowLeft');
  const requested=f.view.snapshot().split;assert.ok(requested<.35);
  f.win.innerWidth=390;f.sceneColumn.rect.width=358;f.win.handlers.resize();
  assert.equal(f.view.snapshot().split,requested,'Stacked mobile fitting must retain the desktop preference.');
  assert.equal(f.workspace.style.getPropertyValue('--view-surface-track'),'0.5fr');
  f.win.innerWidth=1200;f.sceneColumn.rect.width=1008;f.win.handlers.resize();
  assert.equal(f.view.snapshot().split,requested);
  assert.equal(parseFloat(f.workspace.style.getPropertyValue('--view-surface-track')),requested);
  f.view.destroy();
});

test('keyboard width adjustments start from the visible fitted divider after a responsive clamp',()=>{
  const f=fixture();f.view.setContext({docked:true});
  for(let i=0;i<10;i++)f.key(f.seam,'ArrowLeft');
  const requested=f.view.snapshot().split;assert.ok(requested<.32);
  f.win.innerWidth=701;f.sceneColumn.rect.width=669;f.win.handlers.resize();
  const effective=parseFloat(f.workspace.style.getPropertyValue('--view-surface-track'));
  assert.ok(effective>requested);assert.equal(f.view.snapshot().split,requested);
  f.key(f.seam,'ArrowRight');
  assert.ok(Math.abs(f.view.snapshot().split-(effective+.02))<1e-12,'One key press should move the displayed divider.');
  f.view.destroy();
});

test('full-width hidden canvas sizing is independent and mobile disables the width seam',()=>{
  const f=fixture();f.key(f.hiddenGrip,'ArrowDown',{shiftKey:true});assert.equal(f.view.snapshot().standalone,380);assert.equal(f.view.snapshot().surface,null);
  f.win.innerWidth=390;f.view.setContext({docked:true});assert.equal(f.seam.hidden,true);
  f.key(f.seam,'ArrowRight');assert.equal(f.view.snapshot().split,null);
  f.key(f.surfaceGrip,'ArrowUp');assert.equal(f.view.snapshot().surface,340);
  assert.equal(f.view.snapshot().standalone,380);f.key(f.surfaceGrip,'Home');assert.equal(f.view.snapshot().standalone,null);f.view.destroy();
});

test('pointer grips change sizes only for the active captured pointer',()=>{
  const f=fixture();f.view.setContext({docked:true});
  f.surfaceGrip.handlers.pointerdown(f.event(null,{button:0,pointerId:7,clientX:100,clientY:350}));
  f.surfaceGrip.handlers.pointermove(f.event(null,{pointerId:8,clientX:100,clientY:450}));assert.equal(f.view.snapshot().surface,null);
  f.surfaceGrip.handlers.pointermove(f.event(null,{pointerId:7,clientX:100,clientY:450}));assert.equal(f.view.snapshot().surface,450);
  f.surfaceGrip.handlers.pointerup();f.surfaceGrip.handlers.pointermove(f.event(null,{pointerId:7,clientX:100,clientY:650}));assert.equal(f.view.snapshot().surface,450);
  f.view.destroy();
});

test('both height edges announce their purpose and reserve a full-width footer',()=>{
  const f=fixture();f.view.setContext({docked:true});
  for(const grip of [f.surfaceGrip,f.hiddenGrip]){
    assert.equal(grip.textContent,'↕ Drag to resize height');
    assert.equal(grip.attributes.role,'separator');assert.equal(grip.attributes['aria-orientation'],'horizontal');
    assert.match(grip.title,/Drag, or use arrow keys/);
    assert.equal(grip.attributes['aria-valuetext'],'350 pixels tall');
  }
  const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'view-resize.css'),'utf8');
  assert.match(css,/--view-height-handle:24px/,'Mouse targets must be taller than the old tiny corner grip.');
  assert.match(css,/--view-height-handle:28px/,'Stacked mobile panes retain a usable touch edge.');
  assert.match(css,/\.view-resize-surface,\.view-resize-hidden\{[^}]+width:100%/);
  assert.match(css,/\.hidden-cutaway\{bottom:var\(--view-height-handle\)\}/,'The hidden canvas and controls must end above the resize footer.');
  assert.match(css,/flex:0 0 var\(--view-height-handle\)/,'The surface canvas must leave room for its height footer.');
  f.view.destroy();
});

test('vertical dragging stays attached to the pane edge while the page scrolls',()=>{
  const f=fixture();f.view.setContext({docked:true});
  f.surfaceGrip.handlers.pointerdown(f.event(null,{button:0,pointerId:7,clientX:100,clientY:350}));
  f.win.scrollY=100;
  f.surfaceGrip.handlers.pointermove(f.event(null,{pointerId:7,clientX:100,clientY:400}));
  assert.equal(f.view.snapshot().surface,500,'Height follows the pointer in document space.');
  assert.equal(f.view.snapshot().hidden,350,'Resizing one edge must not resize the other pane.');
  f.surfaceGrip.handlers.pointerup();f.win.scrollY=150;
  f.surfaceGrip.handlers.pointermove(f.event(null,{pointerId:7,clientX:100,clientY:420}));
  assert.equal(f.view.snapshot().surface,500);f.view.destroy();
});

test('resize drags keep pointer ownership and stop when their input or layout is interrupted',()=>{
  for(const interruption of ['blur','pagehide','hidden','released','layout','resize']){
    const f=fixture();f.view.setContext({docked:true});
    const event=(id=7,extra={})=>f.event(null,{button:0,buttons:1,pointerId:id,clientX:100,clientY:350,...extra});
    f.surfaceGrip.handlers.pointerdown(event());
    f.hiddenGrip.handlers.pointerdown(event(8,{isPrimary:false}));
    f.hiddenGrip.handlers.pointerup(event(8));
    f.surfaceGrip.handlers.pointermove(event(7,{clientY:400}));
    assert.equal(f.view.snapshot().surface,400,'An unrelated pointer cannot steal or end the active resize.');
    if(interruption==='hidden'){f.doc.hidden=true;f.doc.handlers.visibilitychange();f.doc.hidden=false;}
    else if(interruption==='released')f.surfaceGrip.handlers.pointermove(event(7,{buttons:0,clientY:500}));
    else if(interruption==='layout')f.view.setContext({docked:false});
    else f.win.handlers[interruption]();
    f.surfaceGrip.handlers.pointermove(event(7,{clientY:550}));
    assert.equal(f.view.snapshot().surface,400,interruption+' must end the old gesture.');
    assert.equal(f.workspace.classList.contains('view-resize-dragging'),false);
    f.view.destroy();
  }
});
