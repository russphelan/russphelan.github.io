'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Views=require('./view-modes.js'),Motion=require('./surgery-motion.js');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
const catalogueSource=between('  function updateCatalogue()','  function searchConfig()');
const searchSource=between('  function searchConfig()',"  $('experience-mode').addEventListener");
const modeSource=between('  function setExperienceMode(mode)','  function currentShowcase()');
const drawSource=between('  function requestDraw()','  function cancelSurgeryWarmup()');
function fixture(){
  const nodes={},events=[],camera={yaw:.4,pitch:.8,zoom:1},old={id:'keep',index:2,length:8,theta:.3,normalCurvature:.36};
  const node=()=>({textContent:'',value:'',max:18,hidden:false,disabled:false,checked:false,children:[],dataset:{},
    style:{setProperty(){}},setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name];},
    replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},
    contains(){return false;},addEventListener(){},querySelector(){return null;},focus(){},scrollIntoView(){}});
  const state={surface:'double',endpointPreset:'default',c:.36,cutoff:7,mode:'explore',curves:[old],selected:'keep',lastSelected:'keep',
    running:false,playing:false,travel:.42,viewMode:'focus',camera,surgery:null,ribbon:{},focusing:true,speed:1};
  const configs=[],manual=[],frames=new Map(),preparationEvents=[];let frameId=0;
  const context={state,cache:new Map(),meshes:new Map(['torus','double','triple'].map(id=>[id,{}])),surfaceGPU:null,wireGPU:null,
    surfaceTraversal:null,cancelSurfaceTraversal(){},
    downhillPreparation:{block(...args){preparationEvents.push(args);}},
    reveal:null,explorationSnapshot:null,showcaseReturn:null,frame:0,downhillStudy:null,lastCompletedNeck:null,
    $:id=>nodes[id]||(nodes[id]=node()),key:()=>state.surface+':'+state.endpointPreset,
    model:()=>({geometryVersion:'geometry-v1',genus:state.surface==='torus'?1:state.surface==='double'?2:3,name:state.surface}),
    endpoints:()=>({p:[0,0,0],q:[1,0,0]}),knownIndex:c=>!c.nearConjugate&&Number.isFinite(c.index),
    visible:()=>state.surgery||state.mode==='explore'&&state.cutoff===0?[]:state.curves.filter(c=>c.index<=state.cutoff),
    Views,cssColor:()=>'',subscript:String,selectShowcase:id=>events.push(['selectShowcase',id]),
    pauseReveal(){},updateDetails(){},updateTheory(){},updateSurgeryUI(){},updatePresentationUI(){},
    updateText(id,value){context.$(id).textContent=value;},clearGPU(){},removeGPU(){},announce(){},
    initialCatalogue:()=>state.mode==='explore'?[]:[{id:'curated',index:3,length:7,normalCurvature:.36}],
    cancelSurgery(){state.surgery=null;},warmNextSurgery(){events.push(['warm']);},
    Camera:{defaultCamera:()=>({yaw:0})},S:{modelIds:['torus','double','triple'],buildMesh(){throw Error('Unexpected numerical mesh work');}},
    Solver:{solverVersion:'verified-search-v2',classifyCurve:(curve,c)=>({...curve,normalCurvature:c})},
    searchManager:{activate(config){configs.push(config);events.push(['activate']);},deactivate(){events.push(['deactivate']);},
      stop(){events.push(['stop']);},manual(quality){manual.push(quality);},block(reason,value){events.push(['block',reason,value]);}},
    document:{hidden:false,activeElement:null,createElement:()=>node()},Option:function(label,value){this.label=label;this.value=value;},
    window:{matchMedia:()=>({matches:false}),GeodesicPresentationData:{indexCutoff:24},
      GeodesicShowcaseData:{indexCutoff:20,picks:[{id:'example'}]},GeodesicPresentation:{create(){return {play(){events.push(['reveal']);}};}}},
    requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);return id;},draw(){},requestDraw(){events.push(['draw']);}
  };
  vm.runInNewContext(catalogueSource+'\n'+searchSource+'\n'+modeSource,context);
  context.$('sort-curves').value='index';context.$('search-quality').value='extended';context.$('index-cutoff').max=18;
  return {context,state,nodes,events,configs,manual,frames,old,camera,preparationEvents};
}

test('automatic arrivals preserve the selected path, traversal, camera, cutoff and cached curve objects',()=>{
  const v=fixture(),config=v.context.searchConfig(),extra={id:'new',index:30,length:15,theta:1,normalCurvature:.36};
  v.context.acceptSearchCurves([v.old,extra],config);
  assert.equal(v.state.curves[0],v.old);assert.equal(v.state.curves[1],extra);
  assert.equal(v.state.selected,'keep');assert.equal(v.state.lastSelected,'keep');assert.equal(v.state.travel,.42);
  assert.equal(v.state.camera,v.camera);assert.equal(v.state.cutoff,7);assert.equal(v.nodes['index-cutoff'].value,7);
  assert.equal(v.nodes['index-cutoff'].max,30);assert.equal(v.nodes.travel.value,.42);
  assert.equal(v.nodes['study-curve'].value,'keep');assert.equal(v.nodes['visible-count'].textContent,1);
  assert.equal(v.nodes['index-reveal-hint'].dataset.visible,'false');
});

test('the zero-cutoff introduction stays empty as paths are restored or discovered',()=>{
  const v=fixture();Object.assign(v.state,{cutoff:0,selected:null,lastSelected:null,viewMode:'all'});
  v.context.acceptSearchCurves([v.old],v.context.searchConfig());
  assert.equal(v.state.cutoff,0);assert.equal(v.state.selected,null);assert.equal(v.state.travel,.42);
  assert.equal(v.nodes['visible-count'].textContent,0);assert.equal(v.nodes['scene-empty'].hidden,false);
  assert.match(v.nodes['scene-empty'].textContent,/Increase the index slider/);
  assert.equal(v.nodes['index-reveal-hint'].dataset.visible,'true');
});

test('late search delivery cannot overwrite another surface, endpoints, surgery, presentation or showcase',()=>{
  for(const change of [s=>s.surface='triple',s=>s.endpointPreset='alternate',s=>s.surgery={},s=>s.mode='presentation',s=>s.mode='showcase']){
    const v=fixture(),config=v.context.searchConfig(),before=v.state.curves;change(v.state);
    v.context.acceptSearchCurves([{id:'stale',index:1}],config);
    assert.equal(v.state.curves,before);assert.equal(v.state.selected,'keep');assert.equal(v.state.travel,.42);
    assert.equal(v.events.length,0);
  }
});

test('presentation and showcase remain curated and do not activate persistent exploration or numerical searching',()=>{
  for(const mode of ['presentation','showcase']){
    const v=fixture();v.context.setExperienceMode(mode);
    assert.equal(v.state.mode,mode);assert.equal(v.state.endpointPreset,'presentation');
    assert.equal(v.configs.length,0);assert.ok(v.events.some(event=>event[0]==='deactivate'));
    assert.equal(v.state.curves.length,1);assert.equal(v.state.curves[0].id,'curated');
    v.context.startSearch();assert.equal(v.manual.length,0);
    v.context.acceptSearchCurves([v.old],{surface:v.state.surface,endpointPreset:'presentation'});
    assert.equal(v.state.curves[0].id,'curated');
  }
});

test('exploration activates the exact current configuration and manual search obeys mode and surgery guards',()=>{
  const v=fixture();v.context.setSurface('triple','alternate');
  assert.equal(v.configs.length,1);assert.deepEqual(JSON.parse(JSON.stringify(v.configs[0])),{
    surface:'triple',endpointPreset:'alternate',geometryVersion:'geometry-v1',solverVersion:'verified-search-v2',
    normalCurvature:.36,endpoints:{p:[0,0,0],q:[1,0,0]}});
  assert.equal(v.state.cutoff,7);v.context.startSearch();assert.deepEqual(v.manual,['extended']);
  for(const block of [{running:true},{surgery:{}},{mode:'presentation'},{mode:'showcase'}]){
    Object.assign(v.state,{running:false,surgery:null,mode:'explore'},block);v.context.startSearch();assert.equal(v.manual.length,1);
  }
});

test('search status reports real partial-grid coverage and user Stop differs from leaving the view',()=>{
  const v=fixture();v.context.updateSearchStatus({running:false,loading:false,progress:43.82,found:73,storageAvailable:true});
  assert.equal(v.nodes['search-progress'].value,43.82);assert.match(v.nodes['search-status'].textContent,/73 validated/);
  assert.match(v.nodes['search-status'].textContent,/finite, not exhaustive/);
  v.context.stopSearch(null,true);assert.ok(v.events.some(event=>event[0]==='stop'));
  v.context.stopSearch();assert.ok(v.events.some(event=>event[0]==='deactivate'));
  v.context.updateSearchStatus({running:true,loading:false,progress:5,found:73,storageAvailable:true,paused:true,reason:'geometry preparation'});
  assert.match(v.nodes['search-status'].textContent,/waits for geometry preparation/);
});

test('every draw synchronizes construction, traversal and length-study blocks before drawing',()=>{
  const v=fixture();vm.runInNewContext(drawSource,v.context);
  v.context.requestDraw();assert.equal(v.frames.size,1);
  assert.deepEqual(v.events.slice(-3),[['block','connected sum',false],['block','traversal',false],['block','length study',false]]);
  v.state.surgery={};v.state.playing=true;v.context.downhillStudy={active:true};v.context.requestDraw();
  assert.deepEqual(v.events.slice(-3),[['block','connected sum',true],['block','traversal',true],['block','length study',true]]);
  assert.equal(v.frames.size,1,'Repeated updates never queue duplicate rendering frames.');
  assert.deepEqual(v.preparationEvents.slice(-2),[['connected sum',true],['traversal',true]],'Resumable profile work pauses before construction or playback can draw.');
});

test('document interaction hooks hold the worker through a stationary drag and release only the owning pointers',()=>{
  const start=source.indexOf('  const searchPointers=new Set();'),end=source.indexOf("  for(const id of ['endpoint-x'",start);
  assert.ok(start>=0&&end>start);const documentHandlers={},windowHandlers={},events=[];
  const preparationEvents=[];
  const context={downhillPreparation:{block(...args){preparationEvents.push(args);},interact(){preparationEvents.push(['interact']);}},document:{addEventListener(type,fn,options){documentHandlers[type]=fn;assert.equal(options.capture,true);}},
    window:{addEventListener(type,fn){windowHandlers[type]=fn;}},searchManager:{block(reason,value){events.push([reason,value]);},interact(){events.push(['interact']);}}};
  vm.runInNewContext(source.slice(start,end),context);
  documentHandlers.pointerdown({pointerId:0});documentHandlers.pointerdown({pointerId:2});
  documentHandlers.pointerup({pointerId:0});assert.deepEqual(events.at(-2),['pointer held',true]);
  documentHandlers.pointercancel({pointerId:2});assert.deepEqual(events.at(-2),['pointer held',false]);
  for(const type of ['input','keydown','wheel']){const count=events.length;documentHandlers[type]();assert.equal(events.length,count+1);assert.deepEqual(events.at(-1),['interact']);}
  documentHandlers.pointerdown({pointerId:7});windowHandlers.blur();assert.deepEqual(events.at(-2),['pointer held',false]);
  assert.deepEqual(preparationEvents.at(-2),['pointer held',false]);
  assert.ok(preparationEvents.some(e=>e[0]==='pointer held'&&e[1]===true),'A stationary held slider also pauses Hessian prewarming.');
});

test('page lifecycle halts hidden work, flushes on departure and resumes only exploration on return',()=>{
  const lifecycle=between("  document.addEventListener('visibilitychange'","  $('jacobi').closest('details')");
  const events=[],documentHandlers={},windowHandlers={},state={mode:'explore',surgery:null,playing:true};
  const context={cancelSurfaceTraversal(){},downhillPreparation:{block(){}},state,frame:1,lastTime:1,dragging:{id:1},document:{hidden:true,addEventListener(type,fn){documentHandlers[type]=fn;}},
    window:{addEventListener(type,fn){windowHandlers[type]=fn;}},
    searchManager:{block(reason,value){events.push(['block',reason,value]);},activate(){events.push(['activate']);},flush(){events.push(['flush']);}},
    searchConfig:()=>({}),cancelSurgeryWarmup(){events.push(['cancel warm']);},surgeryPreparation:{cancelPending(){events.push(['cancel preparation']);}},
    pauseReveal(){},ambientExplorer:{setContext(){}},hiddenCutaway:{setContext(){}},neckResize:{setContext(next){events.push(['neck resize active',next.active]);}},neckViewer:{setContext(next){events.push(['neck active',next.active]);}},updateSurgeryUI(){},updateCatalogue(){},
    cancelAnimationFrame(){events.push(['cancel frame']);},requestDraw(){events.push(['draw']);},warmNextSurgery(){events.push(['warm']);},
    stopSearch(){events.push(['stop']);},cancelSurgery(){state.surgery=null;}};
  vm.runInNewContext(lifecycle,context);documentHandlers.visibilitychange();
  assert.deepEqual(events[0],['block','hidden page',true]);assert.equal(state.playing,false);assert.equal(context.dragging,null);assert.equal(context.frame,0);
  assert.ok(events.some(event=>event[0]==='neck active'&&event[1]===false),'Hidden pages stop the optional neck explanation too.');
  assert.ok(events.some(event=>event[0]==='neck resize active'&&event[1]===false),'Hidden pages deactivate neck resize handles before the animation frame is canceled.');
  context.document.hidden=false;documentHandlers.visibilitychange();assert.ok(events.some(event=>event[0]==='warm'));
  events.length=0;windowHandlers.pagehide();
  assert.deepEqual(events[0],['block','hidden page',true]);assert.ok(events.findIndex(event=>event[0]==='cancel preparation')<events.findIndex(event=>event[0]==='stop'));
  assert.deepEqual(events.at(-1),['flush']);
  for(const mode of ['explore','presentation','showcase']){
    state.mode=mode;events.length=0;windowHandlers.pageshow();
    assert.equal(events.some(event=>event[0]==='activate'),mode==='explore',mode);
  }
});

test('connected-sum setup stops the numerical worker before changing layers or requesting preparation',async()=>{
  const surgerySource=between('  async function startSurgery()','  function cancelSurgery()');
  const v=fixture(),order=[],frames=[];Object.assign(v.context,{surgeryToken:0,surgeryPlans:new Map(),lastTime:0,SurgeryMotion:Motion,
    stopSearch(){order.push('stop worker');},clearSurgeryGPU(){order.push('layers');},prepareSurgeryGPU(){},updateCatalogue(){},updateSurgeryUI(){},requestDraw(){},
    requestAnimationFrame(fn){frames.push(fn);},surgeryPreparation:{prepare(){order.push('prepare');return Promise.resolve();}},finishSurgery(){}});
  vm.runInNewContext(surgerySource,v.context);const starting=v.context.startSurgery();
  assert.deepEqual(order,['stop worker','layers']);assert.equal(v.state.surgery.plan,null);
  frames.shift()();frames.shift()();await starting;
  assert.deepEqual(order,['stop worker','layers','prepare']);
});
