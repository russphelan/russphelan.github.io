'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Preparation=require('./surgery-preparation.js'),Surgery=require('./surgery.js'),S=require('./surface.js');

function planData(fromId='torus'){
  const fromCount=fromId==='torus'?1:2,toId=fromCount===1?'double':'triple',target=S.getModel(toId);
  const mesh={positions:new Float32Array([0,0,0,1,0,0,0,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),triangleCount:1};
  const oldCenter=4*(fromCount-1),newCenter=4*fromCount,cutDistance=Surgery.cutDistance,cuts=[oldCenter+cutDistance,newCenter-cutDistance];
  return {fromId,toId,fromCount,toCount:fromCount+1,geometryVersion:target.geometryVersion,
    cutDistance,oldCenter,newCenter,midpoint:(cuts[0]+cuts[1])/2,durationMs:10000,cuts,bounds:target.bounds,
    meshes:Object.fromEntries(['retained','incoming','removedOld','removedNew','join','target'].map(key=>[key,{...mesh,role:key}])),
    boundaries:{old:{...mesh,vertexCount:3},new:{...mesh,vertexCount:3}}};
}
function fixture(settings={}){
  const workers=[],fallbackCalls=[],ready=[];
  const manager=Preparation.create({
    createWorker(){
      if(settings.unsupported)return null;
      if(settings.createError)throw new Error('Worker construction failed.');
      const worker={messages:[],terminated:false,postMessage(data){this.messages.push(data);if(settings.postError)throw new Error('Worker posting failed.');},terminate(){this.terminated=true;}};
      workers.push(worker);return worker;
    },
    prepareFallback(fromId){fallbackCalls.push(fromId);return settings.fallback?settings.fallback(fromId):{plan:planData(fromId)};},
    onReady(fromId,result){ready.push({fromId,result});}
  });
  const complete=(index,fromId='torus',plan=planData(fromId))=>workers[index].onmessage({data:{type:'ready',fromId,plan}});
  return {manager,workers,fallbackCalls,ready,complete};
}

test('warm-up and on-demand preparation share one worker and retain the exact ready result',async()=>{
  const v=fixture(),warm=v.manager.warm('torus'),first=v.manager.prepare('torus'),second=v.manager.prepare('torus');
  assert.equal(first,second);assert.equal(v.workers.length,1);assert.equal(v.fallbackCalls.length,0);
  assert.deepEqual(v.workers[0].messages,[{type:'prepare',fromId:'torus'}]);
  v.complete(0);const result=await first;
  assert.equal(await warm,result);assert.equal(await v.manager.prepare('torus'),result);
  assert.equal(await v.manager.warm('torus'),result);assert.equal(v.workers.length,1);
  assert.equal(result.targetMesh,result.plan.meshes.target);assert.equal(typeof result.plan.sectionAt,'function');
  assert.equal(typeof result.plan.sample,'function');assert.equal(v.ready[0].fromId,'torus');assert.equal(v.ready[0].result,result);
  assert.equal(v.workers[0].terminated,true);v.manager.destroy();
});

test('unsupported or failed background warm-up never runs main-thread fallback',async()=>{
  for(const settings of [{unsupported:true},{createError:true},{postError:true},{}]){
    const v=fixture(settings),warm=v.manager.warm('torus');
    if(Object.keys(settings).length===0)v.workers[0].onerror({message:'worker failed',preventDefault(){}});
    assert.equal(await warm,null);assert.equal(v.fallbackCalls.length,0);
    const demand=v.manager.prepare('torus');
    if(Object.keys(settings).length===0)v.workers.at(-1).onerror({message:'worker failed',preventDefault(){}});
    const result=await demand;
    assert.equal(result.plan.fromId,'torus');assert.deepEqual(v.fallbackCalls,['torus']);v.manager.destroy();
  }
});

test('on-demand worker faults fall back once, and stale or malformed geometry cannot populate the cache',async()=>{
  for(const fault of ['error','messageerror','wrong-source','wrong-version']){
    const v=fixture(),p=v.manager.prepare('torus'),worker=v.workers[0];
    const error=worker.onerror;
    if(fault==='error')worker.onerror({message:'failed',preventDefault(){}});
    if(fault==='messageerror')worker.onmessageerror();
    if(fault==='wrong-source')v.complete(0,'double');
    if(fault==='wrong-version')v.complete(0,'torus',{...planData(),geometryVersion:'obsolete'});
    error({message:'late error',preventDefault(){}});
    const result=await p;assert.equal(result.plan.fromId,'torus');assert.deepEqual(v.fallbackCalls,['torus']);
    assert.equal(v.ready.length,1);assert.equal(worker.terminated,true);v.manager.destroy();
  }
});

test('cancellation rejects demand without fallback and ignores a late result after retry',async()=>{
  const v=fixture(),warm=v.manager.warm('torus'),first=v.manager.prepare('torus'),late=v.workers[0].onmessage;
  const rejected=assert.rejects(first,{code:Preparation.cancelledCode});v.manager.cancelPending();await rejected;
  assert.equal(await warm,null);assert.equal(v.workers[0].terminated,true);assert.equal(v.fallbackCalls.length,0);
  const next=v.manager.prepare('torus');late({data:{type:'ready',fromId:'torus',plan:planData()}});
  assert.equal(v.ready.length,0);v.complete(1);const result=await next;
  assert.equal(v.ready.length,1);assert.equal(await v.manager.prepare('torus'),result);v.manager.destroy();
});

test('cancellation also guards a pending asynchronous fallback and destroy closes all jobs',async()=>{
  let finish;
  const v=fixture({unsupported:true,fallback:()=>new Promise(resolve=>{finish=resolve;})}),first=v.manager.prepare('torus');
  await Promise.resolve();const rejected=assert.rejects(first,{code:Preparation.cancelledCode});v.manager.cancelPending();await rejected;
  finish({plan:planData()});await Promise.resolve();await Promise.resolve();assert.equal(v.ready.length,0);
  const w=fixture(),a=w.manager.prepare('torus'),b=w.manager.prepare('double');
  const ar=assert.rejects(a,{code:Preparation.cancelledCode}),br=assert.rejects(b,{code:Preparation.cancelledCode});
  w.manager.destroy();await Promise.all([ar,br]);assert.ok(w.workers.every(worker=>worker.terminated));
  assert.equal(await w.manager.warm('torus'),null);await assert.rejects(w.manager.prepare('torus'),{code:Preparation.cancelledCode});
  assert.equal(w.workers.length,2);v.manager.destroy();
});

test('independent surface jobs finish in either order without mixing geometry or losing fallback failures',async()=>{
  const v=fixture(),a=v.manager.prepare('torus'),b=v.manager.prepare('double');v.complete(1,'double');v.complete(0,'torus');
  assert.equal((await a).plan.toId,'double');assert.equal((await b).plan.toId,'triple');v.manager.destroy();
  const failed=fixture({unsupported:true,fallback(){throw new Error('fallback failed');}});
  await assert.rejects(failed.manager.prepare('torus'),/fallback failed/);assert.equal(failed.ready.length,0);failed.manager.destroy();
});

test('prepared wire buffers pass through to the ready cache and malformed worker grids use the demanded fallback',async()=>{
  const v=fixture(),prepared=v.manager.prepare('torus'),plan=planData();
  const wire={positions:new Float32Array(plan.meshes.target.positions.length*2),normals:new Float32Array(plan.meshes.target.normals.length*2)};
  v.workers[0].onmessage({data:{type:'ready',fromId:'torus',plan,targetWire:wire}});
  const result=await prepared;assert.equal(result.targetWire,wire);assert.equal(v.ready[0].result.targetWire,wire);
  assert.equal((await v.manager.prepare('torus')).targetWire,wire);v.manager.destroy();
  for(const type of ['length','type','nonfinite']){
    const invalid=fixture(),pending=invalid.manager.prepare('torus'),data=planData();
    const grid={positions:new Float32Array(18),normals:new Float32Array(18)};
    if(type==='length')grid.positions=new Float32Array(9);
    if(type==='type')grid.normals=Array(18).fill(0);
    if(type==='nonfinite')grid.positions[4]=NaN;
    invalid.workers[0].onmessage({data:{type:'ready',fromId:'torus',plan:data,targetWire:grid}});
    const fallback=await pending;assert.equal(fallback.targetWire,undefined);assert.deepEqual(invalid.fallbackCalls,['torus']);
    assert.equal(invalid.ready.length,1);assert.equal(invalid.workers[0].terminated,true);invalid.manager.destroy();
  }
});

test('worker transfers exactly the direct default meshes and restores identical animation and collar functions',()=>{
  const source=fs.readFileSync(require.resolve('./surgery-preparation-worker.js'),'utf8');
  for(const fromId of ['torus','double']){
    const toId=fromId==='torus'?'double':'triple',target=S.getModel(toId),mesh=S.buildMesh(target,target.meshResolution);
    const direct=Surgery.prepareTransition(fromId,{targetMesh:mesh}),messages=[],imports=[];
    const self={GeodesicSurface:S,GeodesicSurgery:Surgery,postMessage(message,transfers=[]){
      assert.equal(new Set(transfers).size,transfers.length,'An aliased buffer is transferred only once.');
      assert.ok(transfers.includes(message.targetWire.positions.buffer));assert.ok(transfers.includes(message.targetWire.normals.buffer));
      messages.push(structuredClone(message,{transfer:transfers}));
    }};
    vm.runInNewContext(source,{self,importScripts(...files){imports.push(...files);}});
    self.onmessage({data:{type:'prepare',fromId}});
    assert.deepEqual(imports,['./compact-collar.js?v=compact-collar-3','./surface.js?v=compact-collar-3','./surgery.js?v=compact-collar-3']);assert.equal(messages.length,1);
    const message=messages[0];assert.equal(message.type,'ready');assert.equal(message.fromId,fromId);
    assert.deepEqual(message.plan,Surgery.serializePlan(direct),'Every Float32 mesh and boundary, resolution, normal, and metadata field stays identical.');
    const hydrated=Surgery.hydratePlan(message.plan);
    const expected={positions:new Float32Array(mesh.positions.length*2),normals:new Float32Array(mesh.normals.length*2)};let next=0;
    for(let i=0;i<mesh.positions.length;i+=9)for(const j of [0,3,3,6,6,0]){
      expected.positions.set(mesh.positions.slice(i+j,i+j+3),next);expected.normals.set(mesh.normals.slice(i+j,i+j+3),next);next+=3;
    }
    assert.deepEqual(message.targetWire,expected,
      'Worker grid order and Float32 values match the displayed triangle edges exactly.');
    for(const t of [0,.14,.23,.35,.36,.5,.60,.8,.94,1])assert.deepEqual(hydrated.sample(t),direct.sample(t));
    for(const x of [direct.cuts[0],direct.midpoint,direct.cuts[1]])assert.deepEqual(hydrated.sectionAt(x),direct.sectionAt(x));
    assert.equal(hydrated.meshes.target.positions.length,mesh.positions.length);
  }
});

test('worker failures and hydration schema mismatches remain explicit',()=>{
  assert.throws(()=>Surgery.hydratePlan({...planData(),geometryVersion:'old'}),/geometry/);
  assert.throws(()=>Surgery.hydratePlan({...planData(),meshes:{target:{}}}),/geometry/);
  const messages=[],self={GeodesicSurface:S,GeodesicSurgery:Surgery,postMessage(message){messages.push(message);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./surgery-preparation-worker.js'),'utf8'),{self,importScripts(){}});
  self.onmessage({data:{type:'prepare',fromId:'triple'}});assert.equal(messages[0].type,'error');
});
