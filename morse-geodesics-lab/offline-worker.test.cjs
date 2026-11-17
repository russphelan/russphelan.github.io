'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const createWorker=require('./service-worker.js');
const BASE='https://example.test/morse-geodesics-lab/';
function release(letter){
 const version=letter.repeat(20),files=[
  {urls:['./index.html'],body:'<!doctype html><meta name="offline-release" content="'+version+'">'},
  {urls:['./app.js'],body:'app '+letter},
  {urls:['./surface.js?v=index','./surface.js?v=worker'],body:'surface '+letter},
  {urls:['./solver-worker.js?v=geometry'],body:'importScripts("./surface.js?v=worker"); // '+letter},
  {urls:['./catalogues/torus-default.json?v=geometry'],body:JSON.stringify({curves:[letter]})}
 ];
 return {schemaVersion:1,version,assets:files.map(f=>({urls:f.urls,size:Buffer.byteLength(f.body),sha256:crypto.createHash('sha256').update(f.body).digest('hex')})),files};
}
function storage(){
 const stores=new Map(),key=r=>typeof r==='string'?r:r.url;
 return {stores,async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},async open(name){
  if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
  return {async match(request){return entries.get(key(request))?.clone();},async put(request,response){entries.set(key(request),response.clone());},async delete(request){return entries.delete(key(request));},async keys(){return [...entries.keys()].map(url=>new Request(url));}};
 }};
}
function environment(){
 const caches=storage(),clients=new Map(),network=[],state={offline:false,failPath:null,badPath:null},bodies=new Map();
 return {caches,clients,network,state,bodies,load(r){for(const f of r.files)for(const u of f.urls)bodies.set(new URL(u,BASE).pathname,f.body);},
  async fetch(request){const u=new URL(typeof request==='string'?request:request.url);network.push(u.href);
   if(state.offline)throw Error('Network is offline');
   if(u.pathname===state.failPath)return new Response('failure',{status:503});
   const body=u.pathname===state.badPath?'wrong release':bodies.get(u.pathname);return body===undefined?new Response('not found',{status:404}):new Response(body,{headers:{'Content-Type':u.pathname.endsWith('.html')?'text/html':'application/javascript'}});
  }};
}
function worker(env,r){
 const events={},scope={registration:{scope:BASE},caches:env.caches,crypto:crypto.webcrypto,fetch:r=>env.fetch(r),claims:0,skips:0,
  clients:{async claim(){scope.claims++;},async get(id){return env.clients.get(id);},async matchAll(options){assert.equal(options.type,'all');return [...env.clients.values()];}},
  skipWaiting:async()=>{scope.skips++;},addEventListener:(type,fn)=>{events[type]=fn;}};
 const api=createWorker(scope,r);
 async function lifecycle(type){let task;events[type]({waitUntil(p){task=p;}});await task;}
 async function message(type,extra={}){const values=[];let task;events.message({data:{type,...extra},ports:[{postMessage(value){values.push(value);}}],waitUntil(p){task=p;}});await task;return values;}
 async function fetch(url,extra={}){const request={url:new URL(url,BASE).href,method:'GET',mode:'same-origin',destination:'script',...extra.request};let task;
  events.fetch({request,clientId:extra.clientId||'',resultingClientId:extra.resultingClientId||'',respondWith(p){task=p;}});return task===undefined?null:await task;}
 return {scope,api,lifecycle,message,fetch};
}

test('registration installs and activates without eagerly downloading the app',async()=>{
 const e=environment(),r=release('a');e.load(r);const w=worker(e,r);await w.lifecycle('install');await w.lifecycle('activate');
 assert.equal(e.network.length,0);assert.equal(w.scope.skips,0);assert.equal(w.scope.claims,1);
 const status=(await w.message('STATUS',{pageVersion:r.version})).at(-1);assert.equal(status.ready,false);assert.equal(status.pageReady,false);assert.equal(status.activeVersion,null);
});

test('preparation verifies every file, records all exact aliases, and cold navigation works entirely offline',async()=>{
 const e=environment(),r=release('a');e.load(r);e.clients.set('page',{id:'page',url:BASE,type:'window'});const w=worker(e,r);
 const result=await w.message('PREPARE_OFFLINE',{pageVersion:r.version}),ready=result.at(-1);
 assert.equal(ready.type,'READY');assert.equal(ready.ready,true);assert.equal(ready.pageReady,true);assert.equal(ready.activeVersion,r.version);
 assert.equal(ready.completed,r.assets.length);assert.equal(e.network.length,r.assets.length,'Aliases share one verified body download.');
 assert.equal(w.scope.skips,0,'Saving never activates an update without a separate request.');
 e.state.offline=true;const count=e.network.length;
 const nav=await w.fetch('./?source=homescreen',{request:{mode:'navigate',destination:'document'},resultingClientId:'cold'});assert.match(await nav.text(),new RegExp(r.version));
 assert.equal(await(await w.fetch('./app.js',{clientId:'cold'})).text(),'app a');
 assert.equal(await(await w.fetch('./surface.js?v=worker',{clientId:'cold'})).text(),'surface a');assert.equal(e.network.length,count);
 assert.equal((await w.message('STATUS',{pageVersion:r.version})).at(-1).pageReady,true);
});

test('failed and wrong-version downloads never mark readiness; retry reuses only hash-verified partial files',async()=>{
 for(const failure of ['failPath','badPath']){
  const e=environment(),r=release('a');e.load(r);e.state[failure]=new URL('./surface.js',BASE).pathname;const w=worker(e,r);
  const failed=await w.message('PREPARE_OFFLINE',{pageVersion:r.version});assert.equal(failed.at(-1).type,'ERROR');assert.equal(failed.at(-1).ready,false);
  assert.equal((await w.message('STATUS',{pageVersion:r.version})).at(-1).ready,false);
  const firstAppRequests=e.network.filter(u=>new URL(u).pathname.endsWith('/app.js')).length;
  e.state[failure]=null;const ready=(await w.message('PREPARE_OFFLINE',{pageVersion:r.version})).at(-1);assert.equal(ready.type,'READY');
  assert.equal(e.network.filter(u=>new URL(u).pathname.endsWith('/app.js')).length,firstAppRequests,'A retained correct partial body needs no second network request.');
 }
});

test('cached incomplete copies cannot be applied and eviction removes the ready claim',async()=>{
 const e=environment(),r=release('a');e.load(r);const w=worker(e,r);
 assert.equal((await w.message('APPLY_UPDATE')).at(-1).type,'ERROR');assert.equal(w.scope.skips,0);
 await w.message('PREPARE_OFFLINE',{pageVersion:r.version});const cache=await e.caches.open(w.api.cacheName);await cache.delete(new URL('./app.js',BASE).href);
 const state=(await w.message('STATUS',{pageVersion:r.version})).at(-1);assert.equal(state.ready,false);assert.equal(state.pageReady,false);
 assert.equal((await w.message('APPLY_UPDATE')).at(-1).type,'ERROR');assert.equal(w.scope.skips,0);
});

test('a complete bundle recovers boot metadata after an interrupted preparation or metadata eviction',async()=>{
 const e=environment(),r=release('a');e.load(r);const w=worker(e,r);await w.message('PREPARE_OFFLINE',{pageVersion:r.version});
 await e.caches.delete(w.api.metaName);e.state.offline=true;
 const status=(await w.message('STATUS',{pageVersion:r.version})).at(-1);assert.equal(status.ready,true);assert.equal(status.activeVersion,r.version);
 const nav=await w.fetch('./',{request:{mode:'navigate'},resultingClientId:'new'});assert.match(await nav.text(),new RegExp(r.version));
 await e.caches.delete(w.api.metaName);const done=(await w.message('PREPARE_OFFLINE',{pageVersion:r.version})).at(-1);assert.equal(done.activeVersion,r.version);
});

test('new or automatically activated workers retain the prior offline release until a complete update is applied',async()=>{
 const e=environment(),a=release('a'),b=release('b');e.load(a);e.clients.set('old',{id:'old',url:BASE,type:'window'});
 const old=worker(e,a);await old.lifecycle('install');await old.lifecycle('activate');await old.message('PREPARE_OFFLINE',{pageVersion:a.version});
 e.load(b);const fresh=worker(e,b);await fresh.lifecycle('install');await fresh.lifecycle('activate');
 const before=(await fresh.message('STATUS',{pageVersion:a.version})).at(-1);assert.equal(before.ready,false);assert.equal(before.pageReady,true);assert.equal(before.activeVersion,a.version);
 e.state.offline=true;assert.match(await(await fresh.fetch('./',{request:{mode:'navigate'},resultingClientId:'pre-update'})).text(),new RegExp(a.version));
 e.state.offline=false;const prepared=(await fresh.message('PREPARE_OFFLINE',{pageVersion:a.version})).at(-1);assert.equal(prepared.pageReady,true);assert.equal(prepared.activeVersion,a.version);assert.equal(fresh.scope.skips,0);
 const applied=(await fresh.message('APPLY_UPDATE')).at(-1);assert.equal(applied.type,'APPLIED');assert.equal(fresh.scope.skips,1);
 e.state.offline=true;
 assert.equal(await(await fresh.fetch('./app.js',{clientId:'old'})).text(),'app a','An already open old tab keeps its unversioned old app source.');
 assert.match(await(await fresh.fetch('./',{request:{mode:'navigate'},resultingClientId:'new'})).text(),new RegExp(b.version));
 assert.equal(await(await fresh.fetch('./app.js',{clientId:'new'})).text(),'app b');
 assert.ok((await e.caches.keys()).includes(old.api.cacheName),'The live old tab protects its complete release.');
});

test('worker entry requests inherit the parent release and imports stay isolated, including missing reserved-client IDs',async()=>{
 const e=environment(),a=release('a'),b=release('b');e.load(a);e.clients.set('old',{id:'old',url:BASE,type:'window'});
 const old=worker(e,a);await old.message('PREPARE_OFFLINE',{pageVersion:a.version});e.load(b);
 const fresh=worker(e,b);await fresh.lifecycle('install');await fresh.message('PREPARE_OFFLINE',{pageVersion:a.version});await fresh.message('APPLY_UPDATE');e.state.offline=true;
 const entry=await fresh.fetch('./solver-worker.js?v=geometry',{clientId:'old',resultingClientId:'worker-old',request:{destination:'worker'}});
 assert.equal(entry.status,200);assert.match(await entry.text(),/\/\/ a$/);
 e.clients.set('worker-old',{id:'worker-old',url:BASE+'solver-worker.js?v=geometry',type:'worker'});
 assert.equal(await(await fresh.fetch('./surface.js?v=worker',{clientId:'worker-old'})).text(),'surface a');
 const redirect=await fresh.fetch('./solver-worker.js?v=geometry',{clientId:'old',request:{destination:'worker'}});assert.equal(redirect.status,302);
 const url=redirect.headers.get('location');assert.equal(new URL(url).searchParams.get('__offline_release'),a.version);
 const fallback=await fresh.fetch(url,{clientId:'old',request:{destination:'worker'}});assert.equal(fallback.status,200);assert.equal(fallback.url,'','The cache-busting download URL must not override WorkerLocation.');
 e.clients.set('fallback-worker',{id:'fallback-worker',url,type:'worker'});
 assert.equal(await(await fresh.fetch('./surface.js?v=worker',{clientId:'fallback-worker'})).text(),'surface a');
 await fresh.lifecycle('activate');assert.equal(await(await fresh.fetch('./surface.js?v=worker',{clientId:'worker-old'})).text(),'surface a','Cleanup includes live workers, not only windows.');
});

test('unknown queries, non-GET requests and other scopes never borrow cached resources',async()=>{
 const e=environment(),r=release('a');e.load(r);const w=worker(e,r);await w.message('PREPARE_OFFLINE',{pageVersion:r.version});e.state.offline=true;
 await assert.rejects(w.fetch('./surface.js?v=unknown'),/offline/);
 assert.equal(await w.fetch('https://other.test/app.js'),null);assert.equal(await w.fetch('https://example.test/another-app.js'),null);
 assert.equal(await w.fetch('./app.js',{request:{method:'POST'}}),null);
});

test('the generated release is deterministic, content-accurate, and covers the runtime without legacy duplicate catalogues',()=>{
 const {generate}=require('./prepare-offline.cjs'),result=generate({write:false});assert.equal(result.stale,false);
 const context={self:{}};vm.runInNewContext(fs.readFileSync(require.resolve('./offline-assets.js'),'utf8'),context);
 const manifest=JSON.parse(JSON.stringify(context.self.GeodesicOfflineAssets));assert.deepEqual(manifest,result.manifest);
 for(const a of manifest.assets){const bytes=fs.readFileSync(require('node:path').join(__dirname,a.urls[0].split('?')[0]));assert.equal(bytes.length,a.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);}
 const urls=manifest.assets.flatMap(a=>a.urls);assert.equal(urls.filter(u=>u.startsWith('./catalogues/')&&u.includes('.json?')).length,6);
 assert.ok(urls.includes('./surface.js?v=surface-traversal-1'));assert.ok(urls.includes('./surface.js?v=compact-collar-3'));
 assert.ok(urls.includes('./solver-worker.js?v=compact-collar-3'));assert.ok(urls.includes('./surgery-preparation-worker.js?v=compact-collar-3'));
 assert.ok(urls.some(u=>u.includes('apple-touch-icon.png')));assert.ok(urls.includes('./manifest.webmanifest'));
 assert.ok(!urls.some(u=>u.includes('catalogue-data.js')||u.endsWith('.cjs')||u.includes('/prototypes/')||u.startsWith('./catalogues/')&&u.includes('.js?')));
});
