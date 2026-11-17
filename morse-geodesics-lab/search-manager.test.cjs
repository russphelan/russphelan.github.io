'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Manager=require('./search-manager.js');
const config=(surface='double',endpointPreset='default')=>({surface,endpointPreset,geometryVersion:'geometry-1',
  solverVersion:'verified-search-v2',normalCurvature:.36,endpoints:{p:[0,0,0],q:[1,0,0]}});
const curve=i=>({theta:.123456789012345+i*.1,length:3.123456789012345+i*.2,geometryVersion:'geometry-1',valid:true});
const catalogue=(curves=[curve(0)])=>({geometryVersion:'geometry-1',normalCurvature:.36,
  searchOptions:{quality:'standard',round:0},curves});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function clock(){
  let time=0,serial=0;const timers=new Map();
  return {now:()=>time,setTimer(fn,delay){const id=++serial;timers.set(id,{at:time+Math.max(0,delay),fn});return id;},
    clearTimer(id){timers.delete(id);},
    async advance(ms){const target=time+ms;let count=0;
      while(true){await settle();const next=[...timers].filter(([,job])=>job.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
        if(!next)break;if(++count>1000)throw Error('A timer failed to settle.');
        time=next[1].at;timers.delete(next[0]);next[1].fn();}
      time=target;await settle();},timers};
}
function fixture(options={}){
  const time=clock(),workers=[],publications=[],statuses=[],writes=[],fallbacks=[],loads=[],records=options.records||new Map();
  const key=c=>JSON.stringify(c),store={
    get(c){return options.get?options.get(c):Promise.resolve(structuredClone(records.get(key(c))||null));},
    put(c,record){writes.push({config:c,record:structuredClone(record)});records.set(key(c),structuredClone(record));return Promise.resolve(true);},
    flush(){return Promise.resolve();}
  };
  const manager=Manager.create({store,
    loadCatalogue(surface,preset){loads.push({surface,preset});return options.load?options.load(surface,preset):Promise.resolve(catalogue());},
    getStarter:options.getStarter||(()=>options.starter||null),
    validateCurve:options.validateCurve||((c)=>!!c&&c.valid!==false&&Number.isFinite(c.theta)&&Number.isFinite(c.length)),
    createWorker(){if(options.unsupported)return null;if(options.createError)throw new Error('Worker constructor failed.');
      const w={messages:[],terminated:false,postMessage(m){this.messages.push(m);},terminate(){this.terminated=true;}};
      workers.push(w);return w;},
    searchFallback(...args){fallbacks.push(args);return options.fallback?options.fallback(...args):Promise.resolve(Object.assign([],{searchProgress:{nextSeed:1,total:1,stopReason:'complete'}}));},
    onCurves(curves,c){publications.push({curves,config:c});},onStatus:s=>statuses.push(s),
    now:time.now,setTimer:time.setTimer,clearTimer:time.clearTimer,
    quietMs:750,gapMs:100,batchMs:180,automaticLimit:options.automaticLimit??36});
  const send=(index,type,data={})=>workers[index].onmessage({data:{type,...data}});
  const progress=(index,nextSeed,total=356)=>send(index,'progress',{progress:{nextSeed,total}});
  const done=(index,nextSeed,total=356,stopReason='attempt-limit')=>send(index,'done',{progress:{nextSeed,total,stopReason}});
  const start=async(c=config())=>{await manager.activate(c);await time.advance(750);return workers.at(-1);};
  return {manager,time,workers,publications,statuses,writes,fallbacks,loads,records,key,send,progress,done,start};
}

test('automatic extended work waits for loading and a quiet interval, then sends compact existing shots',async()=>{
  const disk=deferred(),bundled=deferred(),v=fixture({get:()=>disk.promise,load:()=>bundled.promise});
  const loading=v.manager.activate(config());assert.equal(v.manager.snapshot().loading,true);
  await v.time.advance(1000);assert.equal(v.workers.length,0);
  bundled.resolve(catalogue());await settle();assert.equal(v.workers.length,0);
  disk.resolve(null);await loading;await v.time.advance(99);assert.equal(v.workers.length,0);
  await v.time.advance(1);assert.equal(v.workers.length,1);
  const opts=v.workers[0].messages[0].options;
  assert.equal(opts.quality,'extended');assert.equal(opts.round,1);assert.equal(opts.startSeed,0);
  assert.equal(opts.maxAttempts,6);assert.equal(opts.maxCurves,36);
  assert.deepEqual(opts.existing,[{theta:curve(0).theta,length:curve(0).length}]);
  assert.equal(v.manager.snapshot().workerActive,true);assert.equal(v.fallbacks.length,0);v.manager.destroy();
});

test('interaction and construction blocks stop work immediately and resume the last completed seed',async()=>{
  const v=fixture();await v.start();const stale=v.workers[0].onmessage;
  v.progress(0,4);v.manager.interact();assert.equal(v.workers[0].terminated,true);
  stale({data:{type:'curve',curve:curve(9)}});assert.equal(v.manager.snapshot().found,1);
  await v.time.advance(749);assert.equal(v.workers.length,1);
  await v.time.advance(1);assert.equal(v.workers.length,2);
  assert.equal(v.workers[1].messages[0].options.startSeed,4);
  v.progress(1,7);v.manager.block('connected-sum',true);assert.equal(v.workers[1].terminated,true);
  await v.time.advance(2000);assert.equal(v.workers.length,2);
  assert.equal(v.manager.snapshot().reason,'connected-sum');
  v.manager.block('hidden-page',true);v.manager.block('connected-sum',false);
  await v.time.advance(1000);assert.equal(v.workers.length,2,'All construction/visibility blocks must clear.');
  v.manager.block('hidden-page',false);await v.time.advance(100);
  assert.equal(v.workers.length,3);assert.equal(v.workers[2].messages[0].options.startSeed,7);v.manager.destroy();
});

test('arrivals are batched, validated, deduplicated, and retain deterministic path IDs',async()=>{
  const v=fixture();await v.start();const before=v.publications.length;
  v.send(0,'curve',{curve:curve(1)});v.progress(0,1);
  v.send(0,'curve',{curve:curve(2)});v.progress(0,2);
  v.send(0,'curve',{curve:{...curve(2),theta:curve(2).theta+.0001,length:curve(2).length+.0001}});
  v.send(0,'curve',{curve:{...curve(3),valid:false}});
  assert.equal(v.manager.snapshot().found,3);assert.equal(v.publications.length,before);
  await v.time.advance(179);assert.equal(v.publications.length,before);
  await v.time.advance(1);assert.equal(v.publications.length,before+1);
  const published=v.publications.at(-1).curves;
  assert.equal(published[1].theta,curve(1).theta);assert.equal(published[1].length,curve(1).length);
  assert.equal(new Set(published.map(c=>c.id)).size,3);
  const other=fixture({load:()=>Promise.resolve(catalogue([curve(2),curve(0),curve(1)]))});await other.start();
  for(const c of other.publications.at(-1).curves)assert.equal(c.id,published.find(p=>p.theta===c.theta).id);
  v.manager.destroy();other.manager.destroy();
});

test('deactivation retains unpublished accepted paths for persistence and rejects stale callbacks from another mode',async()=>{
  const v=fixture();await v.start();const old=v.workers[0].onmessage;
  v.send(0,'curve',{curve:curve(1)});v.progress(0,3);v.manager.deactivate();await v.manager.flush();
  assert.equal(v.workers[0].terminated,true);assert.equal(v.writes.at(-1).record.curves.length,2);
  assert.equal(v.writes.at(-1).record.coverage.jobs[0].nextSeed,3);
  const published=v.publications.length;old({data:{type:'curve',curve:curve(5)}});
  old({data:{type:'progress',progress:{nextSeed:99,total:356}}});
  await v.time.advance(2000);assert.equal(v.publications.length,published);assert.equal(v.workers.length,1);
  await v.manager.activate(config('triple'));await v.time.advance(750);
  old({data:{type:'done',progress:{nextSeed:356,total:356,stopReason:'complete'}}});
  assert.equal(v.manager.snapshot().found,1);assert.equal(v.manager.snapshot().coverage.nextSeed,0);
  assert.equal(v.publications.at(-1).config.surface,'triple');v.manager.destroy();
});

test('late catalogue/cache restoration remains isolated after switching configurations',async()=>{
  const first=deferred(),v=fixture({load:surface=>surface==='double'?first.promise:Promise.resolve(catalogue([curve(4)]))});
  const oldLoad=v.manager.activate(config());await settle();
  await v.manager.activate(config('triple'));await v.time.advance(750);
  first.resolve(catalogue([curve(0),curve(1)]));await oldLoad;await v.time.advance(300);
  assert.equal(v.manager.snapshot().found,1);assert.equal(v.publications.at(-1).curves[0].theta,curve(4).theta);
  await v.manager.activate(config());await v.time.advance(750);
  assert.equal(v.manager.snapshot().found,2);assert.equal(v.publications.at(-1).config.surface,'double');v.manager.destroy();
});

test('automatic discovery stops at its 36-new-path budget without discarding unfinished coverage',async()=>{
  const v=fixture();await v.start();
  for(let chunk=0;chunk<6;chunk++){
    const index=v.workers.length-1,opts=v.workers[index].messages[0].options;
    assert.equal(opts.startSeed,chunk*6);assert.equal(opts.maxCurves,36-chunk*6);
    for(let j=1;j<=6;j++){v.send(index,'curve',{curve:curve(chunk*6+j)});v.progress(index,chunk*6+j);}
    v.done(index,(chunk+1)*6);await v.time.advance(100);
  }
  assert.equal(v.manager.snapshot().found,37);assert.equal(v.manager.snapshot().running,false);
  assert.equal(v.workers.length,6);await v.manager.flush();
  const saved=v.writes.at(-1).record;
  assert.equal(saved.coverage.automatic.accepted,36);assert.equal(saved.coverage.automatic.done,true);
  assert.equal(saved.coverage.jobs[0].nextSeed,36);assert.equal(saved.coverage.jobs[0].stopReason,'attempt-limit');
  v.manager.manual('extended');await v.time.advance(0);
  assert.equal(v.workers.at(-1).messages[0].options.startSeed,36);
  assert.equal(v.workers.at(-1).messages[0].options.maxCurves,36);v.manager.destroy();
});

test('an automatic budget reached before cursor delivery stays complete through interruption and restoration',async()=>{
  const records=new Map(),v=fixture({automaticLimit:1,records});await v.start();
  v.send(0,'curve',{curve:curve(1)});
  // Interrupt between the accepted-path message and its following cursor/done
  // messages, as a pointer event can do in the browser event queue.
  v.manager.interact();assert.equal(v.workers[0].terminated,true);
  await v.manager.flush();const saved=v.writes.at(-1).record;
  assert.equal(saved.coverage.automatic.accepted,1);assert.equal(saved.coverage.automatic.done,true);
  assert.equal(saved.coverage.jobs[0].nextSeed,0);assert.equal(saved.curves.length,2);
  await v.time.advance(2000);assert.equal(v.workers.length,1);assert.equal(v.manager.snapshot().running,false);
  await v.manager.destroy();
  // Also reconcile a previous stored snapshot whose cap was reached before its
  // completion flag was written. It must not spend a second automatic budget.
  saved.coverage.automatic.done=false;records.set(v.key(config()),saved);
  const restored=fixture({automaticLimit:1,records});await restored.start();
  assert.equal(restored.workers.length,0);assert.equal(restored.manager.snapshot().found,2);
  assert.equal(restored.manager.snapshot().running,false);await restored.manager.flush();
  assert.equal(restored.writes.at(-1).record.coverage.automatic.done,true);restored.manager.destroy();
});

test('interrupting the 36th manual arrival before completion cannot start a 37th discovery',async()=>{
  const v=fixture();await v.start();v.manager.manual('extended');await v.time.advance(0);
  for(let chunk=0;chunk<5;chunk++){
    const index=v.workers.length-1;
    for(let j=1;j<=6;j++){v.send(index,'curve',{curve:curve(chunk*6+j)});v.progress(index,chunk*6+j);}
    v.done(index,(chunk+1)*6);await v.time.advance(100);
  }
  const last=v.workers.length-1;
  assert.equal(v.workers[last].messages[0].options.maxCurves,6);
  for(let i=31;i<=35;i++){v.send(last,'curve',{curve:curve(i)});v.progress(last,i);}
  v.send(last,'curve',{curve:curve(36)});v.manager.interact();
  assert.equal(v.workers[last].terminated,true);assert.equal(v.manager.snapshot().found,37);
  const count=v.workers.length;await v.time.advance(749);assert.equal(v.workers.length,count);
  await v.time.advance(1);assert.equal(v.workers.length,count);
  assert.equal(v.manager.snapshot().running,false);
  await v.time.advance(2000);assert.equal(v.workers.length,count);await v.manager.flush();
  const saved=v.writes.at(-1).record;
  assert.equal(saved.coverage.jobs[0].accepted,36);assert.equal(saved.coverage.jobs[0].nextSeed,35);
  assert.equal(saved.coverage.automatic.accepted,36);assert.equal(saved.coverage.automatic.done,true);
  v.manager.destroy();
});

test('stored coverage restores the remaining automatic budget and user Stop survives another visit',async()=>{
  const records=new Map(),v=fixture({records});await v.start();
  v.send(0,'curve',{curve:curve(1)});v.send(0,'curve',{curve:curve(2)});v.progress(0,17);
  v.manager.stop();await v.manager.flush();const saved=v.writes.at(-1).record;
  assert.equal(saved.coverage.pausedByUser,true);assert.equal(saved.coverage.automatic.accepted,2);
  v.manager.destroy();const next=fixture({records});await next.start();
  assert.equal(next.workers.length,0);assert.equal(next.manager.snapshot().found,3);
  assert.equal(next.manager.snapshot().running,false);
  assert.equal(next.manager.manual('extended'),true);await next.time.advance(0);
  assert.equal(next.workers[0].messages[0].options.startSeed,17);
  assert.equal(next.workers[0].messages[0].options.maxCurves,36,'Manual requests have their own new-path budget.');
  next.manager.destroy();
  saved.coverage.pausedByUser=false;records.set(v.key(config()),saved);
  const resumed=fixture({records});await resumed.start();
  assert.equal(resumed.workers[0].messages[0].options.startSeed,17);
  assert.equal(resumed.workers[0].messages[0].options.maxCurves,34);resumed.manager.destroy();
});

test('different search depths retain separate unfinished schedules instead of losing their cursors',async()=>{
  const v=fixture();await v.start();v.progress(0,11);
  assert.equal(v.manager.manual('standard'),true);await v.time.advance(0);
  const standard=v.workers.at(-1).messages[0].options;
  assert.equal(standard.quality,'standard');assert.equal(standard.round,2);assert.equal(standard.startSeed,0);
  v.progress(1,5);v.manager.manual('extended');await v.time.advance(0);
  assert.equal(v.workers[2].messages[0].options.startSeed,11);assert.equal(v.workers[2].messages[0].options.round,1);
  v.manager.manual('standard');await v.time.advance(0);
  assert.equal(v.workers[3].messages[0].options.startSeed,5);assert.equal(v.workers[3].messages[0].options.round,2);
  await v.manager.flush();assert.equal(v.writes.at(-1).record.coverage.jobs.length,2);v.manager.destroy();
});

test('automatic search never invokes main-thread fallback; manual search may explicitly request it',async()=>{
  const v=fixture({unsupported:true});await v.start();
  assert.equal(v.workers.length,0);assert.equal(v.fallbacks.length,0);
  assert.match(v.manager.snapshot().error,/workers/);
  assert.equal(v.manager.snapshot().running,false,'Unsupported automatic work must leave manual search enabled.');
  v.manager.manual('extended');await v.time.advance(0);
  assert.equal(v.fallbacks.length,1);assert.equal(v.fallbacks[0][0].maxAttempts,1);
  await settle();assert.equal(v.manager.snapshot().workerActive,false);v.manager.destroy();
});

test('a Worker constructor failure pauses automatic work while explicit manual fallback remains usable',async()=>{
  const v=fixture({createError:true});await v.start();
  assert.equal(v.fallbacks.length,0);assert.equal(v.manager.snapshot().running,false);
  assert.match(v.manager.snapshot().error,/constructor/);
  assert.equal(v.manager.manual('extended'),true);await v.time.advance(0);
  assert.equal(v.fallbacks.length,1);assert.equal(v.fallbacks[0][0].maxAttempts,1);
  assert.equal(v.fallbacks[0][0].startSeed,0);
  assert.equal(v.manager.snapshot().error,null);v.manager.destroy();
});

test('a manual worker load failure falls back once at its current cursor and ignores late worker messages',async()=>{
  const pending=deferred(),v=fixture({fallback:()=>pending.promise});await v.start();
  v.manager.manual('extended');await v.time.advance(0);
  v.send(1,'curve',{curve:curve(1)});v.progress(1,4);
  const stale=v.workers[1].onmessage,staleError=v.workers[1].onerror;
  v.workers[1].onerror({message:'worker script unavailable',preventDefault(){}});await settle();
  assert.equal(v.workers[1].terminated,true);assert.equal(v.fallbacks.length,1);
  const [options,onCurve,onProgress,shouldCancel]=v.fallbacks[0];
  assert.equal(options.startSeed,4);assert.equal(options.maxAttempts,1);assert.equal(options.maxCurves,35);
  assert.equal(options.existing.length,2);assert.equal(shouldCancel(),false);
  stale({data:{type:'curve',curve:curve(9)}});staleError({message:'late failure'});
  assert.equal(v.manager.snapshot().found,2);assert.equal(v.fallbacks.length,1);
  onCurve(curve(2));onProgress({nextSeed:5,total:356});
  pending.resolve(Object.assign([],{searchProgress:{nextSeed:5,total:356,stopReason:'attempt-limit'}}));await settle();
  assert.equal(v.manager.snapshot().found,3);assert.equal(v.manager.snapshot().coverage.nextSeed,5);
  await v.time.advance(100);assert.equal(v.workers.at(-1).messages[0].options.startSeed,5);
  assert.equal(v.workers.at(-1).messages[0].options.maxCurves,34);v.manager.destroy();
});

test('cancelled manual fallbacks suppress ghost curves and errors, and fallback failure pauses without retrying',async()=>{
  const pending=deferred(),v=fixture({unsupported:true,fallback:()=>pending.promise});await v.start();
  v.manager.manual('extended');await v.time.advance(0);
  const [,onCurve,onProgress,shouldCancel]=v.fallbacks[0];v.manager.interact();
  assert.equal(shouldCancel(),true);onCurve(curve(9));onProgress({nextSeed:4,total:356});
  pending.reject(new Error('cancelled fallback error'));await settle();
  assert.equal(v.manager.snapshot().found,1);assert.equal(v.manager.snapshot().coverage.nextSeed,0);
  assert.equal(v.manager.snapshot().error,null);v.manager.destroy();
  const failure=fixture({createError:true,fallback(){throw new Error('fallback failed');}});await failure.start();
  failure.manager.manual('extended');await failure.time.advance(0);
  assert.equal(failure.fallbacks.length,1);assert.equal(failure.manager.snapshot().running,false);
  assert.match(failure.manager.snapshot().error,/fallback failed/);
  await failure.time.advance(3000);assert.equal(failure.fallbacks.length,1);failure.manager.destroy();
});

test('one debounced save retains every dirty configuration after switching surfaces',async()=>{
  const v=fixture();await v.start();
  v.send(0,'curve',{curve:curve(1)});v.progress(0,9);
  await v.manager.activate(config('triple'));
  assert.equal(v.writes.length,0,'Switching surfaces must not synchronously serialize trajectories.');
  await v.time.advance(750);
  const saved=new Map(v.writes.map(value=>[value.config.surface,value.record]));
  assert.equal(saved.size,2);assert.equal(saved.get('double').curves.length,2);
  assert.equal(saved.get('double').coverage.jobs[0].nextSeed,9);
  assert.equal(saved.get('triple').curves.length,1);
  assert.equal(saved.get('triple').coverage.automatic.accepted,0);v.manager.destroy();
});

test('destroy persists queued unpublished arrivals and coverage before cancelling all timers',async()=>{
  const v=fixture();await v.start();const published=v.publications.length;
  v.send(0,'curve',{curve:curve(1)});v.progress(0,9);
  assert.equal(v.publications.length,published);assert.equal(v.writes.length,0);
  await v.manager.destroy();
  assert.equal(v.workers[0].terminated,true);assert.equal(v.writes.length,1);
  assert.equal(v.writes[0].record.curves.length,2);assert.equal(v.writes[0].record.coverage.jobs[0].nextSeed,9);
  const statuses=v.statuses.length;await v.time.advance(5000);
  assert.equal(v.publications.length,published);assert.equal(v.statuses.length,statuses);
  assert.equal(v.time.timers.size,0);await v.manager.destroy();assert.equal(v.writes.length,1);
});

test('worker failures pause enrichment and late callbacks cannot leak results after destroy',async()=>{
  const v=fixture();await v.start();const late=v.workers[0].onmessage;
  v.workers[0].onerror({message:'worker unavailable',preventDefault(){}});
  assert.equal(v.workers[0].terminated,true);assert.match(v.manager.snapshot().error,/unavailable/);
  assert.equal(v.manager.snapshot().running,false);assert.equal(v.fallbacks.length,0);
  await v.time.advance(2000);assert.equal(v.workers.length,1);
  v.manager.destroy();late({data:{type:'curve',curve:curve(9)}});
  await v.time.advance(2000);assert.equal(v.workers.length,1);
});

test('an empty startup worker failure does not become a persistent user Stop on the next visit',async()=>{
  const records=new Map(),v=fixture({records,createError:true,load:()=>Promise.resolve(null)});
  await v.start();assert.equal(v.manager.snapshot().found,0);
  assert.equal(v.manager.snapshot().running,false);assert.match(v.manager.snapshot().error,/constructor/);
  await v.manager.flush();const saved=v.writes.at(-1).record;
  assert.equal(saved.coverage.pausedByUser,false,'A transient startup failure must not persist the Stop choice.');
  assert.equal(saved.coverage.pauseReason,undefined);await v.manager.destroy();
  const next=fixture({records,load:()=>Promise.resolve(null)});await next.start();
  assert.equal(next.workers.length,1,'A later visit retries when workers are available again.');
  assert.equal(next.workers[0].messages[0].options.startSeed,0);assert.equal(next.manager.snapshot().error,null);
  next.manager.destroy();
});

test('an explicit Stop before any trajectory is found remains a persistent user choice',async()=>{
  const records=new Map(),v=fixture({records,load:()=>Promise.resolve(null)});await v.start();
  v.manager.stop();await v.manager.flush();const saved=v.writes.at(-1).record;
  assert.equal(saved.curves.length,0);assert.equal(saved.coverage.pausedByUser,true);
  assert.equal(saved.coverage.pauseReason,'user');await v.manager.destroy();
  const next=fixture({records,load:()=>Promise.resolve(null)});await next.start();
  assert.equal(next.workers.length,0);assert.equal(next.manager.snapshot().running,false);
  assert.equal(next.manager.manual('extended'),true);await next.time.advance(0);
  assert.equal(next.workers.length,1);await next.manager.flush();
  assert.equal(next.writes.at(-1).record.coverage.pausedByUser,false);
  assert.equal(next.writes.at(-1).record.coverage.pauseReason,null);next.manager.destroy();
});

test('bundled starters publish without waiting for a stalled full catalogue or starting automatic work',async()=>{
  const pending=deferred(),v=fixture({starter:catalogue([curve(0),curve(1)]),load:()=>pending.promise});
  await v.start();
  assert.equal(v.manager.snapshot().loading,false,'A slow full download cannot block the starter picker.');
  assert.equal(v.manager.snapshot().catalogueLoading,true);
  assert.equal(v.manager.snapshot().running,false,'Pending automatic enrichment must leave the manual-search button enabled.');
  assert.equal(v.manager.snapshot().found,2);assert.equal(v.publications.at(-1).curves.length,2);
  assert.equal(v.workers.length,0,'Automatic work waits to deduplicate against the full collection.');
  await v.time.advance(3000);assert.equal(v.workers.length,0);
  assert.equal(v.manager.manual('extended'),true,'Explicit further search stays usable while the download is pending.');
  await v.time.advance(0);assert.equal(v.workers.length,1);
  assert.equal(v.workers[0].messages[0].options.round,1);
  assert.deepEqual(v.workers[0].messages[0].options.existing,[0,1].map(i=>({theta:curve(i).theta,length:curve(i).length})));
  v.manager.destroy();
});

test('failed full-catalogue and worker loading with an empty cache still leave validated starter paths available',async()=>{
  const v=fixture({starter:catalogue([curve(0),curve(1)]),load:()=>Promise.reject(new Error('catalogue unavailable')),createError:true});
  await v.start();
  assert.equal(v.manager.snapshot().found,2);assert.equal(v.manager.snapshot().loading,false);
  assert.equal(v.publications.at(-1).curves.length,2);assert.equal(v.manager.snapshot().running,false);
  assert.match(v.manager.snapshot().error,/constructor/);assert.equal(v.fallbacks.length,0);
  await v.manager.flush();assert.equal(v.writes.at(-1).record.curves.length,2);
  assert.equal(v.writes.at(-1).record.coverage.pausedByUser,false);
  assert.equal(v.manager.manual('extended'),true);await v.time.advance(0);
  assert.equal(v.fallbacks.length,1,'Manual search retains its explicit fallback.');v.manager.destroy();
});

test('a full catalogue arriving after starters merges once before automatic search without spending the discovery budget',async()=>{
  const pending=deferred(),v=fixture({starter:catalogue([curve(0),curve(1)]),load:()=>pending.promise});
  await v.start();const original=v.publications.at(-1).curves;
  pending.resolve(catalogue([curve(1),curve(2)]));await settle();
  assert.equal(v.manager.snapshot().found,3);assert.equal(v.workers.length,0);
  assert.equal(v.manager.snapshot().catalogueLoading,false);
  await v.time.advance(100);assert.equal(v.workers.length,1);
  assert.equal(v.workers[0].messages[0].options.maxCurves,36);
  assert.equal(v.workers[0].messages[0].options.existing.length,3);
  await v.time.advance(80);const merged=v.publications.at(-1).curves;
  assert.equal(merged.length,3);assert.equal(merged[0],original[0]);assert.equal(merged[1],original[1]);
  await v.manager.flush();assert.equal(v.writes.at(-1).record.coverage.automatic.accepted,0);v.manager.destroy();
});

test('a late full catalogue cannot replace another surface after its bundled starter is shown',async()=>{
  const first=deferred(),v=fixture({getStarter:c=>catalogue(c.surface==='double'?[curve(0),curve(1)]:[curve(5)]),
    load:surface=>surface==='double'?first.promise:Promise.resolve(catalogue([curve(5)]))});
  await v.start();await v.manager.activate(config('triple'));await v.time.advance(750);
  const published=v.publications.length;first.resolve(catalogue([curve(1),curve(2)]));await settle();await v.time.advance(300);
  assert.equal(v.manager.snapshot().found,1);assert.equal(v.publications.length,published);
  assert.equal(v.publications.at(-1).config.surface,'triple');
  await v.manager.activate(config());await v.time.advance(750);
  assert.equal(v.manager.snapshot().found,3);assert.equal(v.publications.at(-1).config.surface,'double');v.manager.destroy();
});

test('empty legacy failure records recover while marked user Stops remain paused with starters available',async()=>{
  const saved={curves:[],coverage:{jobs:[{quality:'extended',round:0,nextSeed:0,total:356,accepted:0,stopReason:'attempt-limit'}],
    automatic:{quality:'extended',round:0,accepted:0,limit:36,done:false},pausedByUser:true,nextRound:1},updatedAt:0};
  for(const marked of [false,true]){
    const record=structuredClone(saved);if(marked)record.coverage.pauseReason='user';
    const records=new Map([[JSON.stringify(config()),record]]),v=fixture({records,starter:catalogue([curve(0),curve(1)])});
    await v.start();assert.equal(v.manager.snapshot().found,2);
    assert.equal(v.workers.length,marked?0:1);await v.manager.flush();
    assert.equal(v.writes.at(-1).record.coverage.pausedByUser,marked);
    if(marked)assert.equal(v.writes.at(-1).record.coverage.pauseReason,'user');v.manager.destroy();
  }
});

test('a saved four-path legacy failure recovers with or without the full catalogue, preserving an explicit user Stop',async()=>{
  const fs=require('node:fs'),S=require('./surface.js'),G=require('./solver.js'),Store=require('./search-store.js');
  const full=JSON.parse(fs.readFileSync(require.resolve('./catalogues/torus-default.json'),'utf8'));
  const starter=require('./starter-data.js').catalogues['torus:default'];
  const c={surface:'torus',endpointPreset:'default',geometryVersion:S.getModel('torus').geometryVersion,
    solverVersion:G.solverVersion,normalCurvature:.36,endpoints:S.getModel('torus').endpoints.default};
  const four=full.curves.slice().sort((a,b)=>a.length-b.length||a.theta-b.theta).slice(0,4);
  for(const fullAvailable of [false,true])for(const marked of [false,true]){
    const record={curves:four,coverage:{jobs:[{quality:'extended',round:1,nextSeed:6,total:356,accepted:2,stopReason:'attempt-limit'}],
      automatic:{quality:'extended',round:1,accepted:2,limit:36,done:false},pausedByUser:true,nextRound:2},updatedAt:0};
    if(marked)record.coverage.pauseReason='user';
    assert.equal(Store.validateRecord(record,c),true,'The problematic legacy record is otherwise numerically valid.');
    const pending=deferred(),records=new Map([[JSON.stringify(c),record]]),v=fixture({records,starter,
      validateCurve:Store.validateCurve,load:()=>fullAvailable?pending.promise:Promise.resolve(null)});
    await v.start(c);assert.equal(v.manager.snapshot().found,4);
    if(fullAvailable){
      assert.equal(v.workers.length,0,'Automatic work waits for the complete file-compatible catalogue.');
      pending.resolve(full);await settle();await v.time.advance(180);
      assert.equal(v.manager.snapshot().found,36,'A cached partial collection cannot replace the complete catalogue.');
      assert.equal(v.publications.at(-1).curves.length,36);
    }
    assert.equal(v.workers.length,marked?0:1);
    if(!marked){
      const options=v.workers[0].messages[0].options;
      assert.equal(options.startSeed,6,'Recovery resumes the last completed numerical guess.');
      assert.equal(options.round,1);assert.equal(options.maxCurves,34);
      assert.equal(options.existing.length,fullAvailable?36:4);
      assert.equal(v.manager.snapshot().error,null);
    }
    await v.manager.flush();const saved=v.writes.at(-1).record;
    assert.equal(Store.validateRecord(saved,c),true);assert.equal(saved.coverage.pausedByUser,marked);
    for(const original of four){
      const restored=saved.curves.find(candidate=>candidate.theta===original.theta&&candidate.length===original.length);
      assert.deepEqual(restored.points,original.points);assert.deepEqual(restored.jacobi,original.jacobi);
    }
    v.manager.destroy();
  }
});

test('revisiting a configuration retries a transient worker error without losing its starting-guess cursor',async()=>{
  const v=fixture();await v.start();v.progress(0,6);
  v.workers[0].onerror({message:'temporary worker failure',preventDefault(){}});
  assert.equal(v.manager.snapshot().running,false);assert.match(v.manager.snapshot().error,/temporary/);
  await v.manager.activate(config());await v.time.advance(750);
  assert.equal(v.manager.snapshot().error,null);assert.equal(v.workers.length,2);
  assert.equal(v.workers[1].messages[0].options.startSeed,6);v.manager.destroy();
});
