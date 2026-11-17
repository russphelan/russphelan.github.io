'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./app.js'),'utf8'),html=fs.readFileSync(require.resolve('./index.html'),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}

test('the app shares one exact preparation service with the optional controls through file-compatible scripts',()=>{
 const service={},root={},prepareSteps=function*(){},prepareBasisSteps=function*(){},calls=[];
 const context={surfaceTraversal:null,startSurfaceTraversal(){},commitSurfaceTraversal(){},$:()=>root,window:{GeodesicDownhill:{prepareSteps,prepareBasisSteps},GeodesicDownhillPreparation:{create(options){
  assert.equal(options.window,context.window);assert.equal(options.prepareSteps,prepareSteps);assert.equal(options.prepareBasisSteps,prepareBasisSteps);calls.push('service');return service;
 }},GeodesicSurfaceTraversal:{create(){calls.push('traversal');return {};}},GeodesicDownhillControls:{create(node,options){assert.equal(node,root);assert.equal(options.preparation,service);calls.push('controls');return {};}}}};
 vm.runInNewContext(between('  let downhillControls=null;','  let gl=null'),context);
 assert.deepEqual(calls,['service','traversal','controls']);
 const scripts=Array.from(html.matchAll(/<script\s+defer\s+src="\.\/([^"?]+)(?:\?[^\"]*)?"/g),m=>m[1]);
 const order=['downhill.js','downhill-preparation.js','downhill-controls.js','app.js'].map(file=>scripts.indexOf(file));
 assert.ok(order.every(index=>index>=0));assert.deepEqual(order,order.slice().sort((a,b)=>a-b));
 assert.doesNotMatch(fs.readFileSync(require.resolve('./downhill-preparation.js'),'utf8'),/\bfetch\s*\(|\bimportScripts\s*\(/);
});

test('each draw offers the exact selected segment before controls, even while the push panel is closed',()=>{
 const data={length:19.2093052},model={},workspace={dataset:{}},events=[],state={travel:.37777,playing:false,surgery:null};
 const context={surfaceTraversal:{snapshot:()=>({running:null})},focusData:data,state,model:()=>model,$:()=>workspace,
  downhillPreparation:{setContext(value){events.push(['warm',value]);},snapshot:()=>({pending:2})},
  downhillControls:{snapshot:()=>({open:false}),setContext(value){events.push(['controls',value]);}}};
 const draw='{'+between('    const studyContext=','    syncDownhillLayout();')+'}';
 vm.runInNewContext(draw,context);
 assert.deepEqual(events.map(e=>e[0]),['warm','controls']);
 const warmed=events[0][1],displayed=events[1][1];assert.equal(warmed.data,data);assert.equal(warmed.model,model);
 assert.equal(warmed.position,state.travel*data.length);assert.equal(warmed.position,displayed.position);assert.equal(warmed.active,true);
 assert.equal(warmed.playing,false);assert.equal(warmed.surgery,false);assert.equal(JSON.parse(workspace.dataset.hessianPreparation).pending,2);
 context.focusData=null;events.length=0;vm.runInNewContext(draw,context);
 assert.equal(events[0][1].active,false);assert.equal(events[0][1].data,null);assert.equal(events[0][1].position,0);
});

test('construction, traversal, and staged path reveal block preparations before another rendering frame',()=>{
 const blocks=[],frames=[],state={surgery:null,playing:false};let revealPlaying=false;
 const context={state,frame:0,document:{hidden:false},reveal:{snapshot:()=>({playing:revealPlaying})},searchManager:null,
  downhillStudy:null,downhillPreparation:{block(...args){blocks.push(args);}},requestAnimationFrame(fn){frames.push(fn);return frames.length;},draw(){}};
 vm.runInNewContext(between('  function requestDraw()','  function cancelSurgeryWarmup()'),context);
 context.requestDraw();assert.deepEqual(blocks.slice(-2),[['connected sum',false],['traversal',false]]);assert.equal(frames.length,1);
 state.surgery={};context.requestDraw();assert.deepEqual(blocks.slice(-2),[['connected sum',true],['traversal',false]]);
 state.surgery=null;state.playing=true;context.requestDraw();assert.deepEqual(blocks.slice(-2),[['connected sum',false],['traversal',true]]);
 state.playing=false;revealPlaying=true;context.requestDraw();assert.deepEqual(blocks.slice(-2),[['connected sum',false],['traversal',true]]);
 assert.equal(frames.length,1,'Priority changes apply immediately without queuing duplicate frames.');
});

test('geometry warmup owns the Hessian preparation pause until the current warmup settles',async()=>{
 const blocks=[],frames=new Map(),pending=[],state={surface:'double',mode:'explore',surgery:null};let serial=0;
 const context={state,surgeryWarmToken:0,surgeryWarmFrame:0,document:{hidden:false},searchManager:null,
  downhillPreparation:{block(...args){blocks.push(args);}},surgeryPreparation:{warm(){return new Promise(resolve=>pending.push(resolve));}},
  requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id){frames.delete(id);}};
 vm.runInNewContext(between('  function cancelSurgeryWarmup()','  function pauseReveal()'),context);
 const tick=()=>{const current=[...frames.values()];frames.clear();current.forEach(fn=>fn());};
 context.warmNextSurgery();assert.deepEqual(blocks.at(-1),['geometry preparation',true]);tick();tick();
 context.warmNextSurgery();tick();tick();assert.equal(pending.length,2);
 pending[0](null);await Promise.resolve();assert.deepEqual(blocks.at(-1),['geometry preparation',true],'An obsolete completion cannot release the newer geometry hold.');
 pending[1](null);await Promise.resolve();assert.deepEqual(blocks.at(-1),['geometry preparation',false]);
});

test('captured gestures and page lifecycle synchronously pause or defer the next preparation quantum',()=>{
 const documentHandlers={},windowHandlers={},events=[];
 const context={downhillPreparation:{block(...args){events.push(['block',...args]);},interact(){events.push(['interact']);}},
  searchManager:{block(){},interact(){}},document:{addEventListener(type,handler,options){assert.equal(options.capture,true);documentHandlers[type]=handler;}},
  window:{addEventListener(type,handler){windowHandlers[type]=handler;}}};
 vm.runInNewContext(between('  const searchPointers=new Set();',"  for(const id of ['endpoint-x'"),context);
 documentHandlers.pointerdown({pointerId:0});documentHandlers.pointerdown({pointerId:2});documentHandlers.pointerup({pointerId:0});
 assert.deepEqual(events.at(-2),['block','pointer held',true]);documentHandlers.pointercancel({pointerId:2});assert.deepEqual(events.at(-2),['block','pointer held',false]);
 for(const type of ['input','keydown','wheel']){const count=events.length;documentHandlers[type]();assert.equal(events.length,count+1);assert.deepEqual(events.at(-1),['interact']);}
 documentHandlers.pointerdown({pointerId:7});windowHandlers.blur();assert.deepEqual(events.at(-2),['block','pointer held',false]);

 const lifecycle=between("  document.addEventListener('visibilitychange'","  $('jacobi').closest('details')"),state={mode:'explore',playing:true,surgery:null};
 Object.assign(context,{cancelSurfaceTraversal(){},state,frame:1,lastTime:1,dragging:{id:1},searchConfig:()=>({}),
  document:{hidden:true,addEventListener(type,handler){documentHandlers[type]=handler;}},
  searchManager:{block(){},activate(){},flush(){}},surgeryPreparation:{cancelPending(){events.push(['cancel geometry']);}},
  cancelSurgeryWarmup(){events.push(['cancel warm']);},pauseReveal(){},ambientExplorer:{setContext(){}},hiddenCutaway:{setContext(){}},
  neckResize:{setContext(){}},neckViewer:{setContext(){}},updateSurgeryUI(){},updateCatalogue(){},
  cancelAnimationFrame(){events.push(['cancel frame']);},requestDraw(){events.push(['draw']);},warmNextSurgery(){},stopSearch(){events.push(['stop']);},cancelSurgery(){}});
 vm.runInNewContext(lifecycle,context);events.length=0;documentHandlers.visibilitychange();
 assert.deepEqual(events[0],['block','hidden page',true]);assert.equal(state.playing,false);assert.ok(events.findIndex(e=>e[0]==='cancel frame')>0);
 events.length=0;windowHandlers.pagehide();assert.deepEqual(events[0],['block','hidden page',true]);assert.ok(events.findIndex(e=>e[0]==='cancel geometry')>0);
 context.document.hidden=false;events.length=0;windowHandlers.pageshow();assert.deepEqual(events[0],['block','hidden page',false]);assert.deepEqual(events.at(-1),['draw']);
});

test('only owning traversal pointers allow requested profile work while search and other drags stay paused',()=>{
 const documentHandlers={},windowHandlers={},blocks=new Map(),searchBlocks=new Map();
 const context={downhillPreparation:{block(reason,value,options){blocks.set(reason,{value,allowDemand:!!options?.allowDemand});},interact(){}},
  searchManager:{block(reason,value){searchBlocks.set(reason,value);},interact(){}},
  document:{addEventListener(type,handler){documentHandlers[type]=handler;}},window:{addEventListener(type,handler){windowHandlers[type]=handler;}}};
 vm.runInNewContext(between('  const searchPointers=new Set();',"  for(const id of ['endpoint-x'"),context);
 const traversal={closest(selector){assert.ok(selector.includes('#travel')&&selector.includes('[data-cutaway="position"]'));return this;}},other={closest(){return null;}};
 documentHandlers.pointerdown({pointerId:0,target:traversal});
 assert.deepEqual(blocks.get('traversal pointer held'),{value:true,allowDemand:true});assert.equal(blocks.get('pointer held').value,false);
 assert.equal(searchBlocks.get('pointer held'),true,'The background geodesic search still pauses through every traversal hold.');
 documentHandlers.pointerup({pointerId:7});assert.equal(blocks.get('traversal pointer held').value,true,'An unrelated release cannot end the held traversal.');
 documentHandlers.pointerdown({pointerId:2,target:other});assert.equal(blocks.get('pointer held').value,true);
 assert.equal(blocks.get('traversal pointer held').value,true,'The traversal owner survives another gesture.');
 documentHandlers.pointercancel({pointerId:2});assert.equal(blocks.get('pointer held').value,false);assert.equal(blocks.get('traversal pointer held').value,true);
 documentHandlers.pointerup({pointerId:0});assert.equal(blocks.get('traversal pointer held').value,false);assert.equal(searchBlocks.get('pointer held'),false);
 documentHandlers.pointerdown({pointerId:3,target:traversal});windowHandlers.blur();
 assert.equal(blocks.get('traversal pointer held').value,false);assert.equal(blocks.get('pointer held').value,false);assert.equal(searchBlocks.get('pointer held'),false);
});
