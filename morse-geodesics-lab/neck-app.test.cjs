'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8'),html=fs.readFileSync(require.resolve('./index.html'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const neckSource=between('  function clearNeckOverlay()','  function syncDownhillLayout()');
function node(){
 const classes=new Set(),attributes={};return {children:[],parentElement:null,hidden:false,style:{values:{'--view-surface-height':'560px','--view-surface-track':'.6fr'}},
  classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
  setAttribute(name,value){attributes[name]=value;},getAttribute:name=>attributes[name],
  append(child){if(child.parentElement){const old=child.parentElement.children;old.splice(old.indexOf(child),1);}this.children.push(child);child.parentElement=this;},
  insertBefore(child,next){if(child.parentElement){const old=child.parentElement.children;old.splice(old.indexOf(child),1);}const index=this.children.indexOf(next);this.children.splice(index<0?this.children.length:index,0,child);child.parentElement=this;},
  get nextSibling(){if(!this.parentElement)return null;return this.parentElement.children[this.parentElement.children.indexOf(this)+1]||null;}};
}
function fixture(){
 const nodes={},events=[],resizeEvents=[],removed=[],sections=[],stage=node(),camera={yaw:.3,pitch:1,zoom:.7,targetOffset:[1,2,0]};
 const $=id=>nodes[id]||(nodes[id]=node());
 stage.append($('surgery-controls-home'));stage.append($('surgery-controls'));stage.append($('bottom-line'));
 const plan={fromCount:1,cuts:[1,3],
  sample(geometry){const joinProgress=geometry<.6?0:geometry>=.94?1:.5;
   return {joinProgress,gap:[1+joinProgress,3-joinProgress],pieces:[{key:'incoming',translation:[1,0,1.4]}]};},
  sectionAt(x,count){sections.push({x,count});const p=new Float32Array(count*3),n=new Float32Array(count*3);
   for(let i=0;i<count;i++){const theta=2*Math.PI*i/count;p.set([x,Math.cos(theta),Math.sin(theta)],3*i);n.set([0,Math.cos(theta),Math.sin(theta)],3*i);}return {positions:p,normals:n};}};
 const operation={plan,token:42,progress:.73,paused:true,to:'double',endpointPreset:'default',snapshot:{camera,selected:'keep',travel:.4},
  motion:{sample(progress){return {geometry:progress,phase:progress>.94?'fade-out':'construct'};}}};
 const state={surface:'torus',mode:'explore',neckOpen:false,surgery:operation,camera,selected:'keep',travel:.4,cutoff:7,cutawayDock:true,curves:[]};
 const context={cancelSurfaceTraversal(){},state,document:{hidden:false},neckResize:{
   setContext(value){resizeEvents.push({...value});this.context={...this.context,...value};}},neckViewer:{
   setContext(value){events.push(['context',value]);this.context={...this.context,...value};},
   selection(){events.push(['selection']);return {side:this.side||'old',theta:this.context.geometry*Math.PI*2,station:this.station,following:this.station==null,mode:this.mode,scannerBlend:this.scannerBlend};}},
  lastCompletedNeck:null,neckScene:null,neckOverlayPlan:null,neckOverlayGPU:new Map(),neckSections:new WeakMap(),
  $: $,model:()=>({genus:state.surface==='torus'?1:state.surface==='double'?2:3,name:state.surface}),
  requestDraw(){events.push(['draw']);},removeGPU(item){removed.push(item);},
  gl:null,fallback:null,cssW:500,cssH:400,screenPoint:p=>({x:100+p[0]*10,y:100+p[1]*10,z:0})};
 vm.runInNewContext(neckSource,context);
 return {context,state,operation,plan,nodes,stage,camera,events,resizeEvents,removed,sections,$};
}
function recordGPU(v){
 const rendered=[];let bound=null,depth=true;
 v.context.gl={ARRAY_BUFFER:'array',DYNAMIC_DRAW:'dynamic',DEPTH_TEST:'depth',LINES:'lines',
  depthMask(){},enable(){depth=true;},disable(){depth=false;},bindBuffer(_target,value){bound=value;},
  bufferData(_target,data){bound.data=new Float32Array(data);}};
 v.context.upload=(positions,normals)=>({a:{data:new Float32Array(positions)},b:{data:new Float32Array(normals)}});
 v.context.renderGPU=(item,primitive,color,_scale,_lift,alpha,_normal,translation)=>{
  rendered.push({item,primitive,color:Array.from(color),x:item.a.data[0],alpha,translation:Array.from(translation),highlighted:!depth});
 };
 return rendered;
}

test('opening and closing the explanation moves the existing construction controls and preserves presentation state',()=>{
 const v=fixture(),controls=v.$('surgery-controls'),anchor=v.$('surgery-controls-home'),before=JSON.stringify(v.state),sizes=JSON.stringify(v.$('workspace').style.values);
 v.context.setNeckOpen(true);
 assert.equal(controls.parentElement,v.$('neck-construction-controls'));assert.equal(v.stage.children.includes(controls),false);
 assert.equal(v.$('neck-construction-controls').children.filter(n=>n===controls).length,1);
 assert.equal(v.$('neck-explanation').hidden,false);assert.equal(v.$('neck-explanation-toggle').getAttribute('aria-expanded'),'true');
 assert.equal(v.operation.progress,.73);assert.equal(v.operation.paused,true);assert.equal(v.state.camera,v.camera);
 assert.equal(v.state.cutawayDock,true);assert.equal(v.state.cutoff,7);assert.equal(JSON.stringify(v.$('workspace').style.values),sizes);
 v.context.setNeckOpen(false);
 assert.equal(controls.parentElement,v.stage);assert.equal(anchor.nextSibling,controls);assert.equal(v.stage.children.filter(n=>n===controls).length,1);
 assert.equal(v.$('neck-explanation').hidden,true);assert.equal(v.$('neck-main-marker').hidden,true);
 assert.equal(JSON.stringify(v.state),before);assert.equal(JSON.stringify(v.$('workspace').style.values),sizes);
});

test('neck resize controls remain active during construction and follow optional-panel and page visibility',()=>{
 const v=fixture();v.context.neckViewer.station=.125;v.context.neckViewer.side='new';
 const sizes=JSON.stringify(v.$('workspace').style.values),camera=JSON.stringify(v.camera),operation=JSON.stringify(v.operation);
 v.context.setNeckOpen(true);
 assert.equal(v.resizeEvents.at(-1).active,true,'Construction does not lock the explicitly requested resize controls.');
 assert.equal(Object.hasOwn(v.resizeEvents.at(-1),'locked'),false);
 assert.equal(v.context.neckViewer.station,.125);assert.equal(v.context.neckViewer.side,'new');
 v.context.setNeckOpen(false);assert.equal(v.resizeEvents.at(-1).active,false);
 v.context.setNeckOpen(true);assert.equal(v.resizeEvents.at(-1).active,true);
 v.context.document.hidden=true;v.context.updateNeckExplanation();assert.equal(v.resizeEvents.at(-1).active,false);
 v.context.document.hidden=false;v.context.updateNeckExplanation();assert.equal(v.resizeEvents.at(-1).active,true);
 assert.equal(JSON.stringify(v.operation),operation,'Layout activation preserves the construction clock, progress and pause state.');
 assert.equal(JSON.stringify(v.camera),camera);assert.equal(v.state.camera,v.camera);
 assert.equal(JSON.stringify(v.$('workspace').style.values),sizes,'The hidden/Jacobi panes keep their existing width and height settings.');
 assert.equal(v.context.neckViewer.station,.125,'Showing, hiding or resizing cannot reset manual inspection.');
 v.context.neckViewer=null;v.state.neckOpen=false;v.context.updateNeckExplanation();
 assert.equal(v.resizeEvents.at(-1).active,false,'Resize gestures deactivate even if the explanatory renderer is unavailable.');
});

test('resize handles are initialized after their explanation canvases and use the existing layout and draw callback',()=>{
 const nodes={},calls=[];let rendered=false;
 const $=id=>nodes[id]||(nodes[id]={id});const surfacePanel={id:'surface-panel'};
 $('scene-stage').closest=selector=>{assert.equal(selector,'.scene-panel');return surfacePanel;};
 const resize={setContext(){}},viewer={selection(){}},requestDraw=()=>calls.push('draw');
 const context={$: $,requestDraw,neckViewer:null,neckResize:null,window:{
  GeodesicNeckExplanation:{create(root,options){assert.equal(root,$('neck-explanation-view'));assert.equal(options.onChange,requestDraw);rendered=true;calls.push('viewer');return viewer;}},
  GeodesicNeckViewResize:{create(options){
   assert.equal(rendered,true,'Canvas wrappers exist before the resize controller queries them.');calls.push('resize');
   assert.equal(options.workspace,$('workspace'));assert.equal(options.sceneColumn,$('observation-console'));
   assert.equal(options.surfacePanel,surfacePanel);assert.equal(options.neckPanel,$('neck-explanation'));
   assert.equal(options.constructionControls,$('neck-construction-controls'));assert.equal(options.onResize,requestDraw);
   return resize;
  }}
 }};
 vm.runInNewContext(between('  neckViewer=window.GeodesicNeckExplanation.create(', '  const searchStore='),context);
 assert.deepEqual(calls,['viewer','resize']);assert.equal(context.neckViewer,viewer);assert.equal(context.neckResize,resize);
});

test('the companion receives real geometry, join progress and construction ownership before the scanner is read',()=>{
 const v=fixture();v.state.neckOpen=true;v.context.neckViewer.side='new';v.operation.progress=.4;
 let scene=v.context.updateNeckExplanation();
 assert.deepEqual(v.events.map(e=>e[0]),['context','selection']);assert.equal(scene.theta,.4*2*Math.PI);
 assert.equal(v.context.neckViewer.context.joinProgress,0);assert.equal(v.context.neckViewer.context.constructionId,42);
 assert.equal(scene.x,3);assert.deepEqual(Array.from(scene.translation),[1,0,1.4]);
 v.operation.progress=.73;scene=v.context.updateNeckExplanation();assert.equal(scene.x,2.5);assert.deepEqual(Array.from(scene.translation),[0,0,0]);
 assert.equal(v.context.neckViewer.context.joinProgress,.5,'The eased plan output is distinct from slider progress .73.');
 assert.equal(v.operation.progress,.73);assert.equal(v.operation.paused,true);
});

test('manual scanning maps built collar positions and the completed neck to actual surface sections',()=>{
 const v=fixture();v.state.neckOpen=true;v.context.neckViewer.station=.125;
 let scene=v.context.updateNeckExplanation();assert.equal(scene.x,1.25);assert.deepEqual(Array.from(scene.translation),[0,0,0]);
 v.context.drawNeckOverlay();assert.ok(v.sections.some(section=>section.x===1.25&&section.count===64));
 v.context.neckViewer.station=.875;scene=v.context.updateNeckExplanation();assert.equal(scene.x,2.75);
 v.state.surgery=null;v.state.surface='double';v.context.lastCompletedNeck={surface:'double',plan:v.plan,id:42};
 v.context.neckViewer.station=.375;scene=v.context.updateNeckExplanation();assert.equal(scene.x,1.75);
 assert.equal(v.context.neckViewer.context.joinProgress,1);assert.equal(v.context.neckViewer.context.constructionId,42);
 assert.equal(v.context.neckViewer.context.completed,true);assert.deepEqual(Array.from(scene.translation),[0,0,0]);
 v.context.neckViewer.station=.123456789;scene=v.context.updateNeckExplanation();
 const raw=1+2*.123456789;assert.equal(scene.x,Math.fround(raw));assert.notEqual(scene.x,raw);
 v.context.drawNeckOverlay();assert.ok(v.sections.some(section=>section.x===Math.fround(raw)),'The highlighted scan matches the float-rounded collar geometry.');
});

test('a stale manual position never samples the unbuilt gap when construction is scrubbed backward',()=>{
 const v=fixture();v.state.neckOpen=true;v.operation.progress=1;v.context.neckViewer.station=.5;
 const sectionAt=v.plan.sectionAt;
 v.plan.sectionAt=(x,count)=>{const gap=v.plan.sample(v.operation.progress).gap;
  assert.ok(x<=Math.fround(gap[0])||x>=Math.fround(gap[1]),'Every sampled section lies on constructed material.');return sectionAt(x,count);};
 const inspect=()=>{const scene=v.context.updateNeckExplanation();v.context.drawNeckOverlay();return scene;};
 assert.equal(inspect().x,2);
 v.operation.progress=.73;assert.equal(inspect().x,1.5,'A tied gap snaps to the preferred old edge.');
 v.context.neckViewer.side='new';assert.equal(inspect().x,2.5,'The other preference resolves the same tie consistently.');
 v.operation.progress=.4;assert.equal(inspect().x,3);
 v.context.neckViewer.side='old';v.context.neckViewer.station=.6;
 const scene=inspect();assert.equal(scene.x,3,'The nearest built edge wins for a non-tied gap.');
 assert.deepEqual(Array.from(scene.translation),[1,0,1.4]);
 assert.ok(v.sections.length>0);
});

test('manual scanning uses the resolved collar for incoming translation rather than the follow-edge preference',()=>{
 const v=fixture();v.state.neckOpen=true;v.operation.progress=.4;
 v.context.neckViewer.side='old';v.context.neckViewer.station=1;
 let scene=v.context.updateNeckExplanation();assert.equal(scene.x,3);assert.deepEqual(Array.from(scene.translation),[1,0,1.4]);
 v.context.neckViewer.side='new';v.context.neckViewer.station=0;
 scene=v.context.updateNeckExplanation();assert.equal(scene.x,1);assert.deepEqual(Array.from(scene.translation),[0,0,0]);
 v.operation.progress=.73;v.context.neckViewer.station=1;
 scene=v.context.updateNeckExplanation();assert.equal(scene.x,3);assert.deepEqual(Array.from(scene.translation),[0,0,0],'Aligned collars have no residual incoming offset.');
});

test('the paired close-up highlights both actual fronts with the incoming translation and a shared component mode',()=>{
 const v=fixture(),rendered=recordGPU(v);v.state.neckOpen=true;v.operation.progress=.4;
 v.context.neckViewer.mode='join';v.context.neckViewer.scannerBlend=0;
 let scene=v.context.updateNeckExplanation();assert.equal(scene.mode,'join');assert.equal(scene.scannerBlend,0);
 v.context.drawNeckOverlay();
 assert.equal(v.$('neck-main-marker').getAttribute('data-neck-mode'),'join');
 let fronts=rendered.filter(draw=>draw.highlighted);
 assert.equal(fronts.length,2);assert.deepEqual(fronts.map(draw=>draw.x),[1,3]);
 assert.deepEqual(fronts.map(draw=>draw.translation),[[0,0,0],[1,0,1.4]]);
 assert.ok(fronts.every(draw=>draw.primitive==='lines'));
 const other=v.context.neckOverlayGPU.get('other-front');assert.ok(other);
 rendered.length=0;v.context.neckViewer.side='new';scene=v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 fronts=rendered.filter(draw=>draw.highlighted);
 assert.deepEqual(fronts.map(draw=>draw.x),[3,1]);assert.deepEqual(fronts.map(draw=>draw.translation),[[1,0,1.4],[0,0,0]]);
 assert.equal(v.context.neckOverlayGPU.get('other-front'),other,'Switching the preferred edge reuses the counterpart slot.');
});

test('coincident fronts and manual scanner mode return to one highlighted section and release the counterpart once',()=>{
 for(const leave of ['meeting','manual']){
  const v=fixture(),rendered=recordGPU(v);v.state.neckOpen=true;v.context.neckViewer.mode='join';v.context.neckViewer.scannerBlend=0;
  v.context.updateNeckExplanation();v.context.drawNeckOverlay();
  const counterpart=v.context.neckOverlayGPU.get('other-front');assert.ok(counterpart);rendered.length=0;
  if(leave==='meeting'){v.operation.progress=.96;v.context.neckViewer.mode='handoff';v.context.neckViewer.scannerBlend=.4;}
  else{v.context.neckViewer.mode='scanner';v.context.neckViewer.scannerBlend=1;v.context.neckViewer.station=.125;}
  v.context.updateNeckExplanation();v.context.drawNeckOverlay();
  assert.equal(rendered.filter(draw=>draw.highlighted).length,1);
  assert.equal(v.context.neckOverlayGPU.has('other-front'),false);assert.equal(v.removed.filter(item=>item===counterpart).length,1);
  v.context.drawNeckOverlay();assert.equal(v.removed.filter(item=>item===counterpart).length,1);
 }
});

test('moving paired fronts keep bounded cache and GPU slots while the counterpart fades during handoff',()=>{
 const v=fixture(),rendered=recordGPU(v);v.state.neckOpen=true;v.context.neckViewer.mode='join';v.context.neckViewer.scannerBlend=0;
 v.plan.sample=geometry=>{const joinProgress=Math.min(1,Math.max(0,(geometry-.6)/.34));
  return {joinProgress,gap:[1+joinProgress,3-joinProgress],pieces:[{key:'incoming',translation:[1,0,1.4]}]};};
 for(let i=0;i<200;i++){
  v.operation.progress=.6+.33*i/199;v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 }
 assert.ok(v.context.neckSections.get(v.plan).size<=7);assert.ok(v.context.neckOverlayGPU.size<=7);
 assert.ok(v.context.neckOverlayGPU.has('other-front'));
 assert.ok(Array.from(v.context.neckOverlayGPU.keys()).every(key=>/^(selected|other-front|trace-[0-4])$/.test(key)));
 rendered.length=0;v.context.neckViewer.mode='handoff';v.context.neckViewer.scannerBlend=.6;
 v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 const other=rendered.find(draw=>draw.item===v.context.neckOverlayGPU.get('other-front'));
 assert.ok(other);assert.ok(Math.abs(other.alpha-.3)<1e-12);
});

test('Canvas fallback highlights both translated fronts and deduplicates the completed join',()=>{
 const v=fixture(),strokes=[];let path=[];
 v.context.fallback={save(){},restore(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},
  stroke(){strokes.push({path:path.slice(),width:this.lineWidth,color:this.strokeStyle});}};
 v.state.neckOpen=true;v.operation.progress=.4;v.context.neckViewer.mode='join';v.context.neckViewer.scannerBlend=0;
 v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 assert.equal(strokes.length,2);assert.deepEqual(strokes.map(stroke=>stroke.path[0][0]),[110,140]);
 assert.ok(strokes.every(stroke=>stroke.width===2));
 strokes.length=0;v.operation.progress=1;v.context.neckViewer.mode='handoff';v.context.neckViewer.scannerBlend=.5;
 v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 assert.equal(strokes.filter(stroke=>stroke.width===2).length,1);
});

test('preparation, completed construction, closed panels and hidden pages cannot display stale active-neck context',()=>{
 const v=fixture();v.state.neckOpen=true;v.operation.plan=null;
 assert.equal(v.context.updateNeckExplanation(),null);assert.equal(v.context.neckViewer.context.phase,'preparing');assert.equal(v.context.neckViewer.context.ready,false);
 assert.equal(v.sections.length,0);
 v.operation.plan=v.plan;v.state.surgery=null;v.state.surface='double';v.context.lastCompletedNeck={surface:'double',plan:v.plan};
 const scene=v.context.updateNeckExplanation();assert.equal(scene.geometry,1);assert.equal(v.context.neckViewer.context.phase,'complete');assert.equal(v.context.neckViewer.context.completed,true);
 v.state.surface='triple';assert.equal(v.context.updateNeckExplanation(),null);assert.equal(v.context.neckViewer.context.ready,false);
 v.state.neckOpen=false;v.context.updateNeckExplanation();assert.equal(v.context.neckViewer.context.active,false);assert.equal(v.context.neckScene,null);
 v.state.neckOpen=true;v.context.document.hidden=true;v.context.updateNeckExplanation();assert.equal(v.context.neckViewer.context.active,false);assert.equal(v.context.neckScene,null);
});

test('section samples are shared with rendering and replace moving coordinates instead of growing an unbounded cache',()=>{
 const v=fixture();const first=v.context.neckSection(v.plan,1,'old');assert.equal(v.context.neckSection(v.plan,1,'old'),first);assert.equal(v.sections.length,1);
 for(let i=0;i<200;i++){
  v.context.neckSection(v.plan,1+i*.001,'old');v.context.neckSection(v.plan,3-i*.001,'new');
  for(let j=0;j<5;j++)v.context.neckSection(v.plan,1+j*.5,'trace-'+j);
 }
 assert.equal(v.context.neckSections.get(v.plan).size,7);assert.ok(v.sections.every(sample=>sample.count===64));
 const section=v.context.neckSection(v.plan,1,'old'),mesh=v.context.neckLineMesh(section);
 assert.equal(mesh.positions.length,64*6);assert.deepEqual(Array.from(mesh.positions.slice(0,3)),Array.from(section.positions.slice(0,3)));
 assert.deepEqual(Array.from(mesh.positions.slice(-3)),Array.from(section.positions.slice(0,3)),'The outline closes exactly on its first section vertex.');
});

test('hundreds of manual scanner positions reuse one cache slot alongside fixed trace and moving-edge slots',()=>{
 const v=fixture();v.state.neckOpen=true;v.operation.progress=1;
 v.context.neckSection(v.plan,1,'old');v.context.neckSection(v.plan,3,'new');
 for(let i=0;i<200;i++){
  v.context.neckViewer.station=i/199;v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 }
 const cache=v.context.neckSections.get(v.plan);assert.equal(cache.size,8);assert.ok(cache.has('scanner'));
 assert.ok(Array.from(cache.keys()).every(key=>/^(old|new|scanner|trace-[0-4])$/.test(key)));
 assert.ok(v.sections.every(section=>section.count===64));
 const draws=v.sections.length;v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 assert.equal(v.sections.length,draws,'An unchanged scanner reuses its exact surface section.');
});

test('cancelled, hidden, closed and unrelated views promptly release the old neck overlay buffers',()=>{
 for(const leave of [v=>{v.state.surgery=null;v.context.lastCompletedNeck=null;},v=>{v.state.surgery=null;v.state.surface='triple';v.context.lastCompletedNeck={surface:'double',plan:v.plan};},v=>{v.context.document.hidden=true;},v=>{v.state.neckOpen=false;}]){
  const v=fixture(),buffers=[{},{}];v.state.neckOpen=true;v.context.updateNeckExplanation();
  v.context.neckOverlayPlan=v.plan;buffers.forEach((item,i)=>v.context.neckOverlayGPU.set('buffer-'+i,item));
  leave(v);assert.equal(v.context.updateNeckExplanation(),null);v.context.drawNeckOverlay();
  assert.equal(v.context.neckOverlayGPU.size,0);assert.equal(v.context.neckOverlayPlan,null);assert.equal(v.$('neck-main-marker').hidden,true);
  assert.deepEqual(v.removed,buffers);v.context.drawNeckOverlay();assert.equal(v.removed.length,2,'Each buffer is released once.');
 }
});

test('the main marker interpolates the actual selected ring continuously and includes incoming-surface translation',()=>{
 const v=fixture();v.state.neckOpen=true;v.operation.progress=.4;v.context.neckViewer.side='new';
 v.context.updateNeckExplanation();v.context.drawNeckOverlay();
 const section=v.context.neckSection(v.plan,3,'new'),count=64,fraction=.4*count,i=Math.floor(fraction),amount=fraction-i;
 const y=section.positions[3*i+1]*(1-amount)+section.positions[3*((i+1)%count)+1]*amount;
 assert.equal(v.$('neck-main-marker').hidden,false);
 assert.equal(v.$('neck-main-marker').style.transform,`translate(${100+4*10-5.5}px,${100+y*10-5.5}px)`);
});

test('cancel and surface switches clear unrelated completed-neck ownership while completion retains only the target neck',()=>{
 const v=fixture();Object.assign(v.context,{surgeryToken:0,lastTime:0,surgeryGPU:new Map(),cache:new Map(),meshes:new Map([['double',{}],['triple',{}]]),surfaceGPU:null,wireGPU:null,
  clearSurgeryGPU(){},restoreSurgeryLayers(){},updateCatalogue(){},announce(){},searchConfig:()=>({}),searchManager:{activate(){}},
  stopSearch(){},clearGPU(){},knownIndex:()=>true,initialCatalogue:()=>[],Camera:{defaultCamera:()=>({})},S:{modelIds:['torus','double','triple']},
  key:()=>v.state.surface+':default',warmNextSurgery(){},window:{GeodesicPresentationData:{indexCutoff:24}}});
 for(const id of ['add-handle','surface-double','surface-triple'])v.$(id).focus=()=>{};
 vm.runInNewContext(between('  function cancelSurgery()','  function updateTheory()'),v.context);
 v.context.lastCompletedNeck={surface:'double',plan:v.plan};v.context.cancelSurgery();assert.equal(v.context.lastCompletedNeck,null);assert.equal(v.state.surgery,null);
 v.state.surgery=v.operation;v.context.setSurface=(id)=>{v.state.surface=id;};v.context.completeSurgery();
 assert.equal(v.context.lastCompletedNeck.plan,v.plan);assert.equal(v.context.lastCompletedNeck.surface,'double');
 vm.runInNewContext(between('  function setSurface(',"  $('experience-mode').addEventListener"),v.context);
 v.state.surgery=null;v.context.setSurface('triple','default');assert.equal(v.context.lastCompletedNeck,null);
});

test('the explanation uses file-compatible scripts and the original timeline controls exactly once',()=>{
 assert.equal((html.match(/id="surgery-controls"/g)||[]).length,1);assert.equal((html.match(/id="surgery-progress"/g)||[]).length,1);
 for(const file of ['neck-explanation-math.js','neck-explanation.js','neck-view-resize.js']){
  assert.ok(html.indexOf('./'+file)>0);assert.ok(html.indexOf('./'+file)<html.indexOf('./app.js'));
  assert.doesNotMatch(fs.readFileSync(require.resolve('./'+file),'utf8'),/\bfetch\s*\(|\bimportScripts\s*\(/);
 }
 assert.ok(html.indexOf('./neck-view-resize.js')>html.indexOf('./neck-explanation.js'),'The layout controller loads after its component dependency.');
 const draw=between('  function draw(now)','  const eventColor');
 assert.ok(draw.indexOf('updateNeckExplanation();')<draw.indexOf('drawSurgeryGL();'));
 assert.ok(draw.indexOf('drawSurgeryGL();')<draw.indexOf('drawNeckOverlay();'));
});
