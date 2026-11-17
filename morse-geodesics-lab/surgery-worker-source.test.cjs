'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Worker}=require('node:worker_threads');
const S=require('./surface.js'),Surgery=require('./surgery.js'),Factory=require('./search-worker-factory.js');
const {buildSource}=require('./prepare-surgery-worker.cjs');

test('local-file surgery source contains the exact canonical geometry and preparation protocol without imports',()=>{
  const source=require('./surgery-worker-source.js');
  assert.equal(source,buildSource());assert.doesNotMatch(source,/\bimportScripts\s*\(/);
  for(const file of ['compact-collar.js','surface.js','surgery.js'])assert.ok(source.includes(fs.readFileSync(require.resolve('./'+file),'utf8')));
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./surgery-worker-source.js'),'utf8'),context);
  assert.equal(context.GeodesicSurgeryWorkerSource,source);
});

test('the shared file-worker factory accepts preparation source and cleans up its Blob URL',()=>{
  const source=require('./surgery-worker-source.js'),revoked=[],created=[];
  class Blob{constructor(parts,options){assert.deepEqual(parts,[source]);assert.equal(options.type,'text/javascript');}}
  class Worker{constructor(url){created.push(url);}terminate(){this.stopped=true;}addEventListener(){}}
  const create=Factory.create({protocol:'file:',source,Worker,Blob,
    URL:{createObjectURL:()=> 'blob:preparation',revokeObjectURL:url=>revoked.push(url)},
    workerURL:'./surgery-preparation-worker.js?v=surgery-consistency-1'});
  const worker=create();assert.deepEqual(created,['blob:preparation']);assert.equal(revoked.length,0);
  worker.terminate();assert.equal(worker.stopped,true);assert.deepEqual(revoked,['blob:preparation']);
});

async function prepareThread(fromId){
  const source=require('./surgery-worker-source.js');
  const adapter=`'use strict';const {parentPort,workerData}=require('node:worker_threads'),vm=require('node:vm');
    const scope={};scope.self=scope;scope.postMessage=(value,transfers)=>parentPort.postMessage(value,transfers);
    vm.runInNewContext(workerData.source,scope);parentPort.on('message',data=>scope.onmessage({data}));`;
  const thread=new Worker(adapter,{eval:true,workerData:{source}});
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Local-file geometry preparation did not complete.')),30000);
    thread.on('error',error=>{clearTimeout(timer);reject(error);});
    thread.on('message',message=>{clearTimeout(timer);
      if(message.type==='error')reject(new Error(message.message));else resolve(message);});
    thread.postMessage({type:'prepare',fromId});
  });}finally{await thread.terminate();}
}

test('file-worker preparation transfers identical full-resolution geometry for both connected-sum stages',async()=>{
  for(const fromId of ['torus','double']){
    const target=S.getModel(fromId==='torus'?'double':'triple');
    const direct=Surgery.prepareTransition(fromId,{targetMesh:S.buildMesh(target,target.meshResolution)});
    const result=await prepareThread(fromId);
    assert.equal(result.type,'ready');assert.equal(result.fromId,fromId);
    assert.deepEqual(result.plan,Surgery.serializePlan(direct),'All mesh vertices, normals, boundaries, and metadata retain exact values.');
    assert.equal(result.targetWire.positions.length,direct.meshes.target.positions.length*2);
    assert.equal(result.targetWire.normals.length,result.targetWire.positions.length);
    let offset=0;
    for(let i=0;i<direct.meshes.target.positions.length;i+=9)for(const edge of [0,3,3,6,6,0])for(let j=0;j<3;j++){
      assert.equal(result.targetWire.positions[offset],direct.meshes.target.positions[i+edge+j]);
      assert.equal(result.targetWire.normals[offset],direct.meshes.target.normals[i+edge+j]);offset++;
    }
    const hydrated=Surgery.hydratePlan(result.plan);
    for(const t of [0,.14,.35,.60,.8,.94,1])assert.deepEqual(hydrated.sample(t),direct.sample(t));
    for(const x of direct.cuts.concat(direct.midpoint))assert.deepEqual(hydrated.sectionAt(x),direct.sectionAt(x));
  }
});
