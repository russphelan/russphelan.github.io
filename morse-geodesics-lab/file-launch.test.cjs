'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('./surface.js'),G=require('./solver.js');
const full=JSON.parse(fs.readFileSync(require.resolve('./catalogues/torus-default.json'),'utf8'));
const config={surface:'torus',endpointPreset:'default',geometryVersion:S.getModel('torus').geometryVersion,
  solverVersion:G.solverVersion,normalCurvature:.36,endpoints:S.getModel('torus').endpoints.default};
const four=full.curves.slice().sort((a,b)=>a.length-b.length||a.theta-b.theta).slice(0,4);
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};

test('the main page loads the compact collar before its surface in local classic scripts',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\s+defer\s+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  assert.ok(scripts.indexOf('./compact-collar.js')>=0);
  assert.ok(scripts.indexOf('./compact-collar.js')<scripts.indexOf('./surface.js'));
  const context={};vm.createContext(context);
  for(const file of scripts.filter(file=>['./compact-collar.js','./surface.js','./solver.js'].includes(file)))
    vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
  for(const id of ['torus','double','triple']){
    const expected=S.getModel(id),actual=context.GeodesicSurface.getModel(id);
    assert.equal(actual.geometryVersion,expected.geometryVersion);
    const p=expected.endpoints.default.p;
    assert.ok(Math.abs(actual.value(p))<1e-10);
  }
});
function clock(){
  let time=0,serial=0;const timers=new Map();
  return {now:()=>time,setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+delay,fn});return id;},clearTimer:id=>timers.delete(id),
    async advance(ms){const end=time+ms;let count=0;
      while(true){await settle();const next=[...timers].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
        if(!next)break;if(++count>1000)throw Error('Unsettled timer');time=next[1].at;timers.delete(next[0]);next[1].fn();}
      time=end;await settle();}};
}
async function fixture(marked){
  const time=clock(),scripts=[],workers=[],published=[],blobs=new Map(),revoked=[];let fetchCalls=0;
  const record={curves:four,coverage:{jobs:[{quality:'extended',round:1,nextSeed:6,total:356,accepted:2,stopReason:'attempt-limit'}],
    automatic:{quality:'extended',round:1,accepted:2,limit:36,done:false},pausedByUser:true,nextRound:2},updatedAt:0};
  if(marked)record.coverage.pauseReason='user';
  const context=vm.createContext({location:{protocol:'file:'},setTimeout:time.setTimer,clearTimeout:time.clearTimer,
    currentConfigJSON:JSON.stringify(config),legacyRecordJSON:JSON.stringify(record),
    fetch(){fetchCalls++;throw new Error('fetch(file:) is unavailable');},
    Blob:class{constructor(parts,options){this.parts=parts;this.type=options.type;}},
    URL:{createObjectURL(blob){const url='blob:null/test-'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL(url){revoked.push(url);}},
    Worker:class{
      constructor(url){assert.match(url,/^blob:null\//,'A file launch must never construct an external file worker.');
        this.url=url;this.messages=[];workers.push(this);}
      postMessage(message){this.messages.push(message);}
      addEventListener(){}
      terminate(){this.terminated=true;}
    },
    document:{createElement(tag){assert.equal(tag,'script');return {remove(){this.removed=true;}};},
      head:{appendChild(script){
        scripts.push(script.src);const file=script.src.split('?')[0];
        assert.match(file,/^\.\/catalogues\/torus-default\.js$/);
        vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});script.onload();
      }}},
    onCurves(curves){published.push(curves);},now:time.now
  });
  for(const file of ['starter-data.js','catalogue-loader.js','search-store.js','search-manager.js','solver-worker-source.js','search-worker-factory.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
  await vm.runInContext(`(async()=>{
    var currentConfig=JSON.parse(currentConfigJSON),legacyRecord=JSON.parse(legacyRecordJSON);
    var store=GeodesicSearchStore.create({indexedDB:null});
    if(!GeodesicSearchStore.validateRecord(legacyRecord,currentConfig))throw Error('Invalid legacy test data');
    await store.put(currentConfig,legacyRecord);
    var loader=GeodesicCatalogues.create();
    var manager=GeodesicSearchManager.create({store,loadCatalogue:loader.load,
      getStarter:config=>GeodesicStarterData.catalogues[config.surface+':'+config.endpointPreset],
      validateCurve:GeodesicSearchStore.validateCurve,createWorker:GeodesicSearchWorkers.create(),
      onCurves,now,setTimer:setTimeout,clearTimer:clearTimeout});
    globalThis.manager=manager;globalThis.store=store;globalThis.currentConfig=currentConfig;
    await manager.activate(currentConfig);
  })()`,context);
  await time.advance(750);
  return {context,time,scripts,workers,published,blobs,revoked,fetchCalls:()=>fetchCalls};
}

test('a local-file launch restores the full torus catalogue and resumes a legacy four-path cache in a Blob worker',async()=>{
  const v=await fixture(false),state=v.context.manager.snapshot();
  assert.equal(v.fetchCalls(),0,'The file: path must not depend on JSON fetch.');
  assert.equal(v.scripts.length,1);assert.equal(state.found,36);assert.equal(state.error,null);
  assert.equal(v.published.at(-1).length,36);assert.equal(v.workers.length,1);
  const worker=v.workers[0],options=worker.messages[0].options;
  assert.equal(options.startSeed,6);assert.equal(options.round,1);assert.equal(options.maxCurves,34);
  assert.equal(options.existing.length,36);assert.equal(options.quality,'extended');
  assert.equal(v.blobs.get(worker.url).type,'text/javascript');
  for(const original of full.curves){
    const restored=v.published.at(-1).find(c=>c.theta===original.theta&&c.length===original.length);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.points)),original.points);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.jacobi)),original.jacobi);
  }
  worker.onmessage({data:{type:'progress',progress:{nextSeed:12,total:356}}});
  v.context.manager.interact();assert.equal(worker.terminated,true);assert.deepEqual(v.revoked,[worker.url]);
  await v.time.advance(749);assert.equal(v.workers.length,1);
  await v.time.advance(1);assert.equal(v.workers.length,2);
  assert.equal(v.workers[1].messages[0].options.startSeed,12);
  await v.context.manager.flush();const saved=await v.context.store.get(v.context.currentConfig);
  assert.equal(saved.coverage.pausedByUser,false);assert.equal(saved.coverage.jobs[0].nextSeed,12);
  await v.context.manager.destroy();assert.equal(v.revoked.length,2);
});

test('an explicit user Stop does not hide the full file-loaded catalogue or start a worker',async()=>{
  const v=await fixture(true);assert.equal(v.fetchCalls(),0);
  assert.equal(v.context.manager.snapshot().found,36);assert.equal(v.context.manager.snapshot().running,false);
  assert.equal(v.published.at(-1).length,36);assert.equal(v.workers.length,0);
  await v.context.manager.flush();const saved=await v.context.store.get(v.context.currentConfig);
  assert.equal(saved.coverage.pausedByUser,true);assert.equal(saved.coverage.pauseReason,'user');
  await v.context.manager.destroy();
});
