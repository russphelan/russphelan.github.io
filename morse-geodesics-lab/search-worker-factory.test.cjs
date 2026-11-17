'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Worker:ThreadWorker}=require('node:worker_threads');
const Factory=require('./search-worker-factory.js'),source=require('./solver-worker-source.js');
const {buildSource}=require('./prepare-solver-worker.cjs'),Solver=require('./solver.js');
function fixture(overrides={}){
  const urls=[],revoked=[],workers=[],blobs=[];
  class Blob{constructor(parts,options){this.parts=parts;this.options=options;blobs.push(this);}}
  class Worker{constructor(url){if(overrides.throwWorker)throw new Error('worker rejected');this.url=url;this.listeners={};this.terminations=0;workers.push(this);}
    terminate(){this.terminations++;if(overrides.throwTerminate)throw new Error('termination failed');}
    addEventListener(type,handler,options){this.listeners[type]={handler,options};}}
  const URL={createObjectURL(blob){const url='blob:local-search-'+urls.length;urls.push({url,blob});return url;},revokeObjectURL(url){revoked.push(url);}};
  const create=Factory.create({protocol:'file:',Worker,Blob,URL,source,...overrides});
  return {create,urls,revoked,workers,blobs};
}

test('generated file worker exactly contains the canonical numerical sources without runtime imports',()=>{
  assert.equal(source,buildSource());assert.doesNotMatch(source,/\bimportScripts\s*\(/);
  for(const file of ['compact-collar.js','surface.js','solver.js'])assert.ok(source.includes(fs.readFileSync(require.resolve('./'+file),'utf8')));
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./solver-worker-source.js'),'utf8'),context);
  assert.equal(context.GeodesicSolverWorkerSource,source);
  assert.ok(fs.statSync(require.resolve('./solver-worker-source.js')).size<64*1024);
});

test('HTTP launches retain the external worker and do not allocate Blob URLs',()=>{
  const v=fixture({protocol:'https:'}),worker=v.create();
  assert.equal(worker.url,'./solver-worker.js?v=compact-collar-3');assert.equal(v.urls.length,0);assert.equal(v.blobs.length,0);
});

test('file launches use a self-contained classic Blob worker and release its URL exactly once on termination',()=>{
  const v=fixture(),worker=v.create();
  assert.equal(worker.url,'blob:local-search-0');assert.deepEqual(v.blobs[0].parts,[source]);
  assert.equal(v.blobs[0].options.type,'text/javascript');assert.equal(v.revoked.length,0,'Do not revoke while the browser may still be reading the source.');
  worker.terminate();worker.terminate();assert.deepEqual(v.revoked,['blob:local-search-0']);assert.equal(worker.terminations,2);
});

test('worker construction and loading failures do not leak URLs or take over the manager error handler',()=>{
  const rejected=fixture({throwWorker:true});assert.throws(rejected.create,/worker rejected/);assert.deepEqual(rejected.revoked,['blob:local-search-0']);
  const v=fixture(),worker=v.create(),handler=()=>{};worker.onerror=handler;
  assert.equal(worker.listeners.error.options.once,true);worker.listeners.error.handler();
  assert.equal(worker.onerror,handler);assert.deepEqual(v.revoked,['blob:local-search-0']);worker.terminate();assert.equal(v.revoked.length,1);
  const stopped=fixture({throwTerminate:true}),other=stopped.create();assert.throws(()=>other.terminate(),/termination failed/);
  assert.equal(stopped.revoked.length,1);
});

test('unsupported workers and missing local source fail without any main-thread numerical work',()=>{
  const unavailable=fixture({Worker:null});assert.equal(unavailable.create(),null);assert.equal(unavailable.urls.length,0);
  for(const options of [{source:null},{Blob:null},{URL:null}]){
    const v=fixture(options);assert.throws(v.create,/could not be prepared/);assert.equal(v.urls.length,0);
  }
});

async function runThread(options){
  const adapter=`'use strict';const {parentPort,workerData}=require('node:worker_threads'),vm=require('node:vm');
    const scope={setTimeout,clearTimeout};scope.self=scope;scope.postMessage=value=>parentPort.postMessage(value);
    vm.runInNewContext(workerData.source,scope);parentPort.on('message',data=>scope.onmessage({data}));`;
  const thread=new ThreadWorker(adapter,{eval:true,workerData:{source}}),messages=[];
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The standalone solver worker did not complete.')),10000);
    thread.on('error',error=>{clearTimeout(timer);reject(error);});
    thread.on('message',message=>{messages.push(message);
      if(message.type==='error'){clearTimeout(timer);reject(new Error(message.message));}
      if(message.type==='done'){clearTimeout(timer);resolve(messages);}});
    thread.postMessage({type:'search',options});
  });}finally{await thread.terminate();}
}

test('standalone Blob source produces identical verified curves and resumable coverage in a real worker thread',async()=>{
  for(const surface of ['torus','double']){
    const options={surface,endpointPreset:'default',quality:'extended',round:1,maxLength:surface==='torus'?8:12,maxAttempts:3,maxCurves:48};
    const direct=await Solver.search(options),messages=await runThread(options);
    const curves=messages.filter(message=>message.type==='curve').map(message=>message.curve);
    assert.ok(direct.length>0,surface+' exercises verified curve delivery');
    assert.deepEqual(curves,[...direct],surface+' coordinates, Jacobi fields, and numerical diagnostics');
    assert.deepEqual(messages.at(-1).progress,direct.searchProgress,surface+' seed cursor and stopping reason');
    const next={...options,startSeed:direct.searchProgress.nextSeed,maxAttempts:2,existing:direct.map(({theta,length})=>({theta,length}))};
    const resumed=await Solver.search(next),resumedMessages=await runThread(next);
    assert.deepEqual(resumedMessages.filter(message=>message.type==='curve').map(message=>message.curve),[...resumed]);
    assert.deepEqual(resumedMessages.at(-1).progress,resumed.searchProgress);
  }
});
