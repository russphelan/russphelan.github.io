'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Motion=require('./surgery-motion.js'),Camera=require('./camera.js'),source=fs.readFileSync(require.resolve('./app.js'),'utf8');
const startSource=source.slice(source.indexOf('  async function startSurgery()'),source.indexOf('  function restoreSurgeryLayers('));
const warmSource=source.slice(source.indexOf('  function cancelSurgeryWarmup()'),source.indexOf('  function pauseReveal()'));
function harness(){
 const nodes={},frames=new Map(),jobs=[],warm=[],messages=[];let serial=0,finishes=0;
 const node=()=>({checked:false,textContent:'',focus(){context.document.activeElement=this;}});
 const context={state:{surface:'torus',mode:'explore',selected:'path',travel:.35,camera:{yaw:.4},surfaceVisible:false,wire:true,surfaceOpacity:.55,surgery:null,curves:[]},
  surgeryToken:0,surgeryWarmFrame:0,surgeryWarmToken:0,lastTime:0,surgeryPlans:new Map(),SurgeryMotion:Motion,Camera,lastCompletedNeck:null,
  searchManager:{block(){},activate(){}},downhillPreparation:{block(){}},cancelSurfaceTraversal(){},searchConfig:()=>({}),
  document:{hidden:false,activeElement:null},window:{matchMedia:()=>({matches:false})},
  $:id=>nodes[id]||(nodes[id]=node()),model:()=>({genus:context.state.surface==='torus'?1:context.state.surface==='double'?2:3}),
  pauseReveal(){},stopSearch(){},clearSurgeryGPU(){},prepareSurgeryGPU(){},updateCatalogue(){},updateSurgeryUI(){},requestDraw(){},
  restoreSurgeryLayers(op){Object.assign(context.state,{surfaceVisible:op.snapshot.surfaceVisible,wire:op.snapshot.wire});},
  announce(message){messages.push(message);},finishSurgery(){finishes++;},
  requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},
  surgeryPreparation:{warm(from){warm.push(from);return Promise.resolve(null);},prepare(from){return new Promise((resolve,reject)=>jobs.push({from,resolve,reject}));}}
 };
 vm.runInNewContext(warmSource+'\n'+startSource,context);
 const tick=async()=>{const current=[...frames];frames.clear();for(const [,fn]of current)fn(0);await Promise.resolve();};
 const ready=(index=0)=>{const plan={durationMs:10000};context.surgeryPlans.set(jobs[index].from,plan);jobs[index].resolve({plan});return plan;};
 return {context,nodes,frames,jobs,warm,messages,tick,ready,finishes:()=>finishes};
}
test('cold preparation stays asynchronous and keeps the exact initial grid snapshot until ready',async()=>{
 const v=harness(),operation=v.context.startSurgery();
 assert.equal(v.context.state.surgery.plan,null);assert.equal(v.context.state.surgery.progress,0);
 assert.equal(v.context.state.surgery.snapshot.wire,true);assert.equal(v.context.state.surgery.snapshot.surfaceVisible,false);
 await v.tick();assert.equal(v.jobs.length,0,'Initial paint precedes any geometry request.');
 await v.tick();assert.equal(v.jobs.length,1);assert.equal(v.context.state.surgery.plan,null);
 const plan=v.ready();await operation;
 assert.equal(v.context.state.surgery.plan,plan);assert.equal(v.context.state.surgery.progress,0);
 const display=v.context.state.surgery.motion.sample(0);assert.equal(display.geometry,0);assert.equal(display.grid,.18);assert.equal(display.fill,0);
});
test('a ready plan avoids a new preparation request and pending Finish is honored when the plan arrives',async()=>{
 const cached=harness(),plan={durationMs:10000};cached.context.surgeryPlans.set('torus',plan);
 const warm=cached.context.startSurgery();await cached.tick();await cached.tick();await warm;
 assert.equal(cached.jobs.length,0);assert.equal(cached.context.state.surgery.plan,plan);
 const cold=harness(),waiting=cold.context.startSurgery();await cold.tick();await cold.tick();
 cold.context.state.surgery.finishRequested=true;cold.ready();await waiting;
 assert.equal(cold.finishes(),1);
});
test('cancelled and superseded operations cannot start animation or cancel a newer operation on error',async()=>{
 for(const outcome of ['resolve','reject']){
  const v=harness(),first=v.context.startSurgery();await v.tick();await v.tick();
  v.context.cancelSurgery();const second=v.context.startSurgery();await v.tick();await v.tick();
  const token=v.context.state.surgery.token;
  if(outcome==='resolve')v.ready(0);else v.jobs[0].reject(Error('old worker failed'));
  await first;assert.equal(v.context.state.surgery.token,token);assert.equal(v.context.state.surgery.plan,null);
  assert.ok(!v.messages.includes('The construction could not start.'));
  v.ready(1);await second;assert.equal(v.context.state.surgery.token,token);assert.ok(v.context.state.surgery.plan);
 }
});
test('cancelling a later addition preserves the completed neck on the restored surface',async()=>{
 const v=harness();v.context.state.surface='double';
 const completed={surface:'double',plan:{fromCount:1},id:4};v.context.lastCompletedNeck=completed;
 const starting=v.context.startSurgery();await v.tick();await v.tick();
 assert.equal(v.context.state.surgery.to,'triple');v.context.cancelSurgery();
 assert.equal(v.context.state.surface,'double');assert.equal(v.context.lastCompletedNeck,completed,
  'The intact first neck must remain available to the scanner after cancelling the second construction.');
 v.ready();await starting;assert.equal(v.context.lastCompletedNeck,completed);
 assert.equal(v.context.state.surgery,null,'Late preparation must not replace the restored scanner.');
});
test('background warmup begins after paint and ignores stale, hidden, showcase, and final-stage requests',async()=>{
 const v=harness();v.context.warmNextSurgery();assert.equal(v.warm.length,0);
 await v.tick();assert.equal(v.warm.length,0);await v.tick();assert.deepEqual(v.warm,['torus']);
 v.context.warmNextSurgery();await v.tick();v.context.state.surface='double';await v.tick();assert.equal(v.warm.length,1);
 v.context.warmNextSurgery();v.context.cancelSurgeryWarmup();await v.tick();assert.equal(v.warm.length,1);
 for(const [mode,surface,hidden]of [['showcase','double',false],['explore','triple',false],['explore','double',true]]){
  Object.assign(v.context.state,{mode,surface});v.context.document.hidden=hidden;
  v.context.warmNextSurgery();assert.equal(v.frames.size,0);
 }
});

test('geometry preparation owns search priority until the current warmup settles',async()=>{
 const v=harness(),blocks=new Map(),pending=[];
 v.context.searchManager.block=(reason,value)=>blocks.set(reason,value);
 v.context.surgeryPreparation.warm=()=>new Promise(resolve=>pending.push(resolve));
 v.context.warmNextSurgery();assert.equal(blocks.get('geometry preparation'),true);
 await v.tick();await v.tick();assert.equal(pending.length,1);
 assert.equal(blocks.get('geometry preparation'),true,'Numerical search cannot compete with pending mesh preparation.');
 v.context.warmNextSurgery();await v.tick();await v.tick();assert.equal(pending.length,2);
 pending[0](null);await Promise.resolve();await Promise.resolve();
 assert.equal(blocks.get('geometry preparation'),true,'A stale completion cannot release a newer warmup priority hold.');
 pending[1](null);await Promise.resolve();await Promise.resolve();assert.equal(blocks.get('geometry preparation'),false);
});

test('switching to the final surface cannot leave stale geometry-priority search blocking behind',async()=>{
 const v=harness(),blocks=new Map();let finish;
 v.context.searchManager.block=(reason,value)=>blocks.set(reason,value);
 v.context.surgeryPreparation.warm=()=>new Promise(resolve=>{finish=resolve;});
 v.context.warmNextSurgery();await v.tick();await v.tick();assert.equal(blocks.get('geometry preparation'),true);
 v.context.state.surface='triple';v.context.warmNextSurgery();assert.equal(blocks.get('geometry preparation'),false);
 finish(null);await Promise.resolve();await Promise.resolve();assert.equal(blocks.get('geometry preparation'),false);
});
