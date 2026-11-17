'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Store=require('./search-store.js'),Surface=require('./surface.js');
const copy=value=>structuredClone(value);
function config(){
  const model=Surface.getModel('double');
  return {surface:'double',endpointPreset:'default',geometryVersion:model.geometryVersion,
    solverVersion:'verified-search-v1',normalCurvature:.36,endpoints:copy(model.endpoints.default)};
}
function curve(c=config()){
  return {theta:.30000000000000004,length:10,intrinsicIndex:0,intrinsicNearConjugate:false,
    points:[copy(c.endpoints.p),copy(c.endpoints.q)],jacobi:[{s:0,j:0,jPrime:1,tangent:[1,0,0]},
      {s:10,j:1.2345678901234567,jPrime:-2.345678901234567,tangent:[0,1,0]}],
    residual:1e-8,refinementError:1e-8,geometryVersion:c.geometryVersion,
    surface:c.surface,endpointPreset:c.endpointPreset,normalCurvature:c.normalCurvature,
    normalIndex:2,index:2,nearConjugate:false};
}
function record(c=config()){
  return {curves:[curve(c)],coverage:{jobs:[{quality:'extended',round:1,nextSeed:17,total:356,accepted:4,stopReason:'attempt-limit'}],
    automatic:{quality:'extended',round:1,accepted:4,limit:36,done:false},pausedByUser:false,nextRound:2}};
}
// A small transactional IDB fixture exercises actual asynchronous upgrade,
// request, commit, abort, and multiple-connection behavior without dependencies.
function indexedDB(settings={}){
  const stores=new Map(),queue=[];let busy=false,closed=0;
  function next(){
    if(busy||!queue.length)return;busy=true;
    const tx=queue.shift(),working=new Map([...stores].map(([name,map])=>[name,new Map(map)]));
    if(settings.neverTransaction)return;
    function run(){
      if(!tx.ops.length){
        if(!tx.failed&&tx.mode==='readwrite')for(const [name,map]of working)stores.set(name,map);
        if(tx.failed)tx.onerror?.({target:tx});else tx.oncomplete?.({target:tx});
        busy=false;next();return;
      }
      const {name,type,key,value,request}=tx.ops.shift();
      try{
        if(settings.quota&&type==='put')throw Error('QuotaExceededError');
        const map=working.get(name);if(!map)throw Error('Unknown store');
        if(type==='get')request.result=copy(map.get(key));
        if(type==='getAll')request.result=copy([...map.values()]);
        if(type==='put')map.set(value.slot,copy(value));
        if(type==='delete')map.delete(key);
        request.onsuccess?.({target:request});
      }catch(error){tx.failed=true;tx.error=error;tx.ops.length=0;}
      queueMicrotask(run);
    }
    queueMicrotask(run);
  }
  const db={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name){stores.set(name,new Map());},close(){closed++;},
    transaction(names,mode){
      if(settings.transactionError)throw Error('Database closed');
      const tx={ops:[],mode,objectStore(name){
        const request=(type,key,value)=>{const req={};tx.ops.push({name,type,key,value,request:req});return req;};
        return {get:key=>request('get',key),getAll:()=>request('getAll'),put:value=>request('put',null,value),delete:key=>request('delete',key)};
      }};
      queue.push(tx);queueMicrotask(next);return tx;
    }
  };
  let request;
  return {stores,db,settings,closed:()=>closed,
    open(){
      if(settings.openThrow)throw Error('SecurityError');
      request={};
      queueMicrotask(()=>{
        if(settings.neverOpen)return;
        if(settings.blocked){request.onblocked?.();return;}
        if(settings.openError){request.onerror?.();return;}
        request.result=db;if(!stores.size)request.onupgradeneeded?.();request.onsuccess?.();
      });return request;
    },lateSuccess(){request.result=db;request.onsuccess?.();}
  };
}

test('configuration key isolates exact endpoints, geometry, solver and curvature versions',()=>{
  const c=config(),key=Store.keyFor(c);assert.equal(key,Store.keyFor(copy(c)));
  for(const field of ['surface','endpointPreset','geometryVersion','solverVersion'])assert.notEqual(Store.keyFor({...c,[field]:'other'}),key);
  assert.notEqual(Store.keyFor({...c,normalCurvature:.36000000000000004}),key);
  const moved=copy(c);moved.endpoints.p[0]+=1e-12;assert.notEqual(Store.keyFor(moved),key);
  for(const broken of [{...c,solverVersion:''},{...c,normalCurvature:NaN},{...c,endpoints:{p:[0,1],q:[0,1,2]}}])assert.equal(Store.keyFor(broken),null);
});

test('all bundled legacy curves validate without requiring newer derivative samples',()=>{
  const catalogues=require('./catalogue-data.js').catalogues;
  for(const [key,entry]of Object.entries(catalogues)){
    const [surface,endpointPreset]=key.split(':'),c={...config(),surface,endpointPreset,
      geometryVersion:entry.geometryVersion,normalCurvature:entry.normalCurvature,endpoints:entry.endpoints};
    for(const path of entry.curves)assert.equal(Store.validateCurve(path,c),true,key+': '+path.id);
  }
});

test('invalid geometry, endpoint matches, numerical samples and coverage cannot enter persistence',async()=>{
  const c=config(),database=indexedDB(),store=Store.create({indexedDB:database});
  assert.equal(Store.validateRecord(record(c),c),true);
  const corruptions=[r=>r.curves[0].points[1][0]+=1e-3,r=>r.curves[0].points[0][1]+=1e-5,
    r=>r.curves[0].geometryVersion='old',r=>r.curves[0].theta=NaN,r=>r.curves[0].residual=2.1e-5,
    r=>r.curves[0].refinementError=-1,r=>r.curves[0].intrinsicIndex=.5,r=>r.curves[0].nearConjugate=true,
    r=>r.curves[0].intrinsicNearConjugate=true,r=>r.curves[0].jacobi[1].j=Infinity,
    r=>r.curves[0].jacobi[1].jPrime=NaN,r=>r.curves[0].jacobi[1].tangent=[1,2,Infinity],
    r=>r.curves[0].jacobi[1].s=0,r=>r.curves[0].jacobi.pop(),r=>r.curves[0].normalCurvature=.4,
    r=>r.curves[0].verification={pathError:Infinity},r=>r.coverage.jobs[0].nextSeed=400,
    r=>r.coverage.jobs[0].accepted=-1,r=>r.coverage.jobs[0].round=NaN,r=>r.coverage.jobs[0].quality='approximate',
    r=>r.coverage.automatic.limit=Infinity,r=>r.coverage.nextRound=-1,r=>r.coverage.pausedByUser='yes'];
  for(const corrupt of corruptions){const bad=record(c);corrupt(bad);assert.equal(Store.validateRecord(bad,c),false);assert.equal(await store.put(c,bad),false);}
  assert.equal(await store.get(c),null);store.close();
});

test('durable records survive another visit at full precision and returned data cannot mutate the cache',async()=>{
  const c=config(),data=record(c),database=indexedDB(),first=Store.create({indexedDB:database,now:()=>123});
  assert.equal(await first.put(c,data),true);data.curves[0].points[0][0]=999;
  const saved=await first.get(c);assert.equal(saved.updatedAt,123);assert.deepEqual(saved.curves,record(c).curves);
  saved.curves[0].jacobi[1].j=999;assert.notEqual((await first.get(c)).curves[0].jacobi[1].j,999);
  await first.flush();first.close();
  const second=Store.create({indexedDB:database});assert.deepEqual(await second.get(c),{...record(c),updatedAt:123});second.close();
});

test('inconsistent or corrupt coverage is rejected so exploration can start a fresh schedule',async()=>{
  const c=config(),database=indexedDB(),slot=JSON.stringify([c.surface,c.endpointPreset]);
  const corruptions=[r=>r.coverage.jobs.push(copy(r.coverage.jobs[0])),
    r=>r.coverage.jobs[0].stopReason='unknown',r=>r.coverage.jobs[0].stopReason='complete',
    r=>r.coverage.jobs=[],r=>r.coverage.automatic.round=0,r=>r.coverage.automatic.quality='standard',
    r=>r.coverage.automatic.accepted=37,r=>r.coverage.automatic.limit=0,r=>r.coverage.automatic.limit=513,
    r=>r.coverage.nextRound=1];
  for(const corrupt of corruptions){
    const good=record(c),bad=record(c);corrupt(bad);
    assert.equal(Store.validateRecord(bad,c),false);assert.equal(Store.validateRecord(good,c),true);
    const writer=Store.create({indexedDB:database});assert.equal(await writer.put(c,good),true);writer.close();
    database.stores.get('entries').get(slot).record=bad;
    const reader=Store.create({indexedDB:database});assert.equal(await reader.get(c),null);
    assert.equal(await reader.put(c,bad),false);assert.equal(await reader.put(c,good),true);reader.close();
  }
  for(const stopReason of ['attempt-limit','curve-limit','cancelled']){
    const r=record(c);r.coverage.jobs[0].stopReason=stopReason;assert.equal(Store.validateRecord(r,c),true);
  }
  const complete=record(c);complete.coverage.jobs[0].stopReason='complete';complete.coverage.jobs[0].nextSeed=356;
  assert.equal(Store.validateRecord(complete,c),true);
  const pruned=record(c);pruned.coverage.jobs=[];pruned.coverage.automatic.done=true;
  assert.equal(Store.validateRecord(pruned,c),true,'A finished automatic job may have been pruned from coverage history.');
  const empty=record(c);empty.coverage={jobs:[],automatic:null,pausedByUser:false,nextRound:0};
  assert.equal(Store.validateRecord(empty,c),true);
});

test('outdated or corrupted disk entries are ignored and changing versions replaces the same slot',async()=>{
  const c=config(),database=indexedDB(),first=Store.create({indexedDB:database});await first.put(c,record(c));first.close();
  const newer={...c,solverVersion:'verified-search-v2'},second=Store.create({indexedDB:database});
  assert.equal(await second.get(newer),null);assert.equal(await second.put(newer,record(newer)),true);second.close();
  assert.equal(database.stores.get('entries').size,1);
  const old=Store.create({indexedDB:database});assert.equal(await old.get(c),null);old.close();
  const envelope=[...database.stores.get('entries').values()][0];envelope.record.curves[0].jacobi[1].j=NaN;
  const third=Store.create({indexedDB:database});assert.equal(await third.get(newer),null);third.close();
});

test('unavailable, blocked, timed-out and quota-denied storage retain usable session results',async()=>{
  const c=config();
  for(const factory of [null,indexedDB({openThrow:true}),indexedDB({openError:true}),indexedDB({blocked:true}),
    indexedDB({neverOpen:true}),indexedDB({quota:true}),indexedDB({transactionError:true}),indexedDB({neverTransaction:true})]){
    const store=Store.create({indexedDB:factory,timeoutMs:5});assert.equal(await store.put(c,record(c)),false);
    assert.deepEqual((await store.get(c)).curves,record(c).curves);await store.flush();store.close();
  }
  const blocked=indexedDB({blocked:true}),store=Store.create({indexedDB:blocked});assert.equal(await store.get(c),null);
  blocked.lateSuccess();assert.equal(blocked.closed(),1);store.close();
});

test('newer writes win during asynchronous restoration and rapid saves remain ordered',async()=>{
  const c=config(),database=indexedDB(),first=Store.create({indexedDB:database});await first.put(c,record(c));first.close();
  const store=Store.create({indexedDB:database}),restoring=store.get(c),newer=record(c);newer.coverage.jobs[0].nextSeed=33;
  const writing=store.put(c,newer);assert.equal((await restoring).coverage.jobs[0].nextSeed,33);await writing;
  for(const nextSeed of [40,41,42]){const r=record(c);r.coverage.jobs[0].nextSeed=nextSeed;store.put(c,r);}
  await store.flush();store.close();
  const reopened=Store.create({indexedDB:database});assert.equal((await reopened.get(c)).coverage.jobs[0].nextSeed,42);reopened.close();
});

test('persistent and session records have a bounded configuration count',async()=>{
  const database=indexedDB(),store=Store.create({indexedDB:database});
  for(let i=0;i<15;i++){
    const c={...config(),endpointPreset:'preset-'+i},r=record(c);r.updatedAt=i;
    assert.equal(await store.put(c,r),true);
  }
  assert.equal(database.stores.get('entries').size,12);assert.equal(database.stores.get('recent').size,12);
  assert.equal(await store.get({...config(),endpointPreset:'preset-0'}),null);store.close();
});

test('closing during database opening prevents late reads and writes',async()=>{
  const c=config(),database=indexedDB(),store=Store.create({indexedDB:database}),pending=store.put(c,record(c));
  store.close();assert.equal(await pending,false);assert.equal(database.stores.get('entries')?.size||0,0);
  assert.equal(await store.get(c),null);assert.equal(await store.put(c,record(c)),false);
});
