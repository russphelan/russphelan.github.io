/* Complete, verified offline releases. No numerical work is performed here. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports){module.exports=factory;return;}
  const RELEASE = 'afaf379ca23fc4b3f337';
  root.importScripts('./offline-assets.js?v='+RELEASE);
  if(root.GeodesicOfflineAssets?.version!==RELEASE)throw Error('The offline release is still updating. Try again shortly.');
  factory(root,root.GeodesicOfflineAssets);
})(typeof self!=='undefined'?self:null,function(scope,manifest){
  'use strict';
  const base=new URL(scope.registration.scope),prefix='geodesics-offline-'+encodeURIComponent(base.pathname)+'-',
    version=manifest.version,cacheName=prefix+version,metaName=prefix+'metadata',
    markerURL=new URL('__offline__/complete',base).href;
  const assetURL=value=>new URL(value,base).href;
  const validVersion=value=>typeof value==='string'&&/^[a-f0-9]{20}$/.test(value);
  const inScope=url=>url.origin===base.origin&&url.pathname.startsWith(base.pathname);
  const metaURL=key=>new URL('__offline__/'+key,base).href;
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const totalBytes=manifest.assets.reduce((sum,a)=>sum+a.size,0),readers=new Map(),subscribers=new Map();
  let preparing=null;
  if(!validVersion(version)||!manifest.assets.length)throw Error('Invalid offline release.');
  async function readMeta(key){try{return await(await(await scope.caches.open(metaName)).match(metaURL(key)))?.json();}catch(_){return null;}}
  async function writeMeta(key,value){await(await scope.caches.open(metaName)).put(metaURL(key),json(value));}
  async function bundle(v){
    if(!validVersion(v))return null;
    if(readers.has(v))return readers.get(v);
    const pending=(async()=>{
      if(!(await scope.caches.keys()).includes(prefix+v))return null;
      const cache=await scope.caches.open(prefix+v),response=await cache.match(markerURL);
      if(!response)return null;
      const record=await response.json();
      if(record.version!==v||record.complete!==true||!Array.isArray(record.assets)||!record.assets.length||
        !record.assets.every(a=>Number.isSafeInteger(a.size)&&a.size>=0&&/^[a-f0-9]{64}$/.test(a.sha256)&&Array.isArray(a.urls)&&a.urls.length&&a.urls.every(u=>inScope(new URL(u,base)))))return null;
      return {cache,record};
    })().catch(()=>null);
    readers.set(v,pending);return pending;
  }
  async function complete(v){
    readers.delete(v);const b=await bundle(v);if(!b)return false;
    for(const a of b.record.assets)for(const url of a.urls)if(!await b.cache.match(assetURL(url)))return false;
    return true;
  }
  async function status(pageVersion){
    const ready=await complete(version),activeVersion=await repairActive(pageVersion);
    return {type:'STATUS',version,ready,pageReady:pageVersion===version?ready:await complete(pageVersion),activeVersion:activeVersion||null,total:manifest.assets.length,totalBytes};
  }
  function send(port,value){try{port?.postMessage(value);}catch(_){}}
  async function publish(value){for(const [port,pageVersion] of subscribers){
    const state=value.type==='READY'||value.type==='ERROR'?await status(pageVersion):{};
    send(port,{...state,version,total:manifest.assets.length,totalBytes,...value});
  }}
  async function digest(buffer){return [...new Uint8Array(await scope.crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  async function verified(response,asset){
    if(!response||!response.ok||response.type==='opaque')return false;
    const bytes=await response.clone().arrayBuffer();return bytes.byteLength===asset.size&&await digest(bytes)===asset.sha256;
  }
  async function pinExisting(){
    const active=await readMeta('active');if(!validVersion(active))return;
    for(const client of await scope.clients.matchAll({includeUncontrolled:true,type:'all'})){
      try{if(inScope(new URL(client.url))&&!await readMeta('client/'+client.id))await writeMeta('client/'+client.id,active);}catch(_){}
    }
  }
  async function repairActive(preferred){
    const active=await readMeta('active');if(validVersion(active)&&await complete(active))return active;
    const candidates=[preferred,version,...(await scope.caches.keys()).filter(n=>n.startsWith(prefix)&&n!==metaName).map(n=>n.slice(prefix.length))];
    for(const candidate of candidates)if(validVersion(candidate)&&await complete(candidate)){
      await writeMeta('active',candidate);await pinExisting();return candidate;
    }
    return null;
  }
  async function clean(){
    const clients=await scope.clients.matchAll({includeUncontrolled:true,type:'all'}),live=new Set(clients.map(c=>c.id)),
      keep=new Set([version,await readMeta('active'),await readMeta('available')]);
    const meta=await scope.caches.open(metaName);
    for(const request of await meta.keys()){
      const start=metaURL('client/');if(!request.url.startsWith(start))continue;
      const id=request.url.slice(start.length);
      if(live.has(id))keep.add(await(await meta.match(request)).json());else await meta.delete(request);
    }
    for(const name of await scope.caches.keys())if(name.startsWith(prefix)&&name!==metaName&&!keep.has(name.slice(prefix.length)))await scope.caches.delete(name);
  }
  async function prepare(){
    if(await complete(version)){await repairActive(version);await publish({type:'READY',ready:true,completed:manifest.assets.length,bytes:totalBytes});return;}
    const cache=await scope.caches.open(cacheName);await cache.delete(markerURL);readers.delete(version);
    let bytes=0,completed=0;
    publish({type:'PROGRESS',ready:false,completed,bytes});
    for(const asset of manifest.assets){
      let response=await cache.match(assetURL(asset.urls[0]));
      if(!await verified(response,asset)){
        const url=new URL(asset.urls[0],base);url.searchParams.set('__offline_download',version);
        response=await scope.fetch(new Request(url.href,{cache:'no-store',credentials:'same-origin'}));
        if(!await verified(response,asset))throw Error('A download is incomplete or belongs to a different app version. Reconnect and try again.');
      }
      for(const url of asset.urls)await cache.put(assetURL(url),response.clone());
      bytes+=asset.size;completed++;publish({type:'PROGRESS',ready:false,completed,bytes});
    }
    await cache.put(markerURL,json({version,complete:true,assets:manifest.assets}));readers.delete(version);
    if(!await complete(version))throw Error('The offline download could not be retained. Free storage and try again.');
    if(!await readMeta('active')){await writeMeta('active',version);await pinExisting();}
    await clean();await publish({type:'READY',ready:true,completed,bytes});
  }
  async function clientVersion(event,url){
    const hint=url.searchParams.get('__offline_release');
    if(validVersion(hint)&&await bundle(hint))return hint;
    if(event.clientId){
      const known=await readMeta('client/'+event.clientId);if(validVersion(known))return known;
      const client=await scope.clients.get(event.clientId);
      if(client){
        const workerHint=new URL(client.url).searchParams.get('__offline_release');
        if(validVersion(workerHint)&&await bundle(workerHint)){await writeMeta('client/'+event.clientId,workerHint);return workerHint;}
      }
    }
    return await readMeta('active');
  }
  async function handleFetch(event){
    const request=event.request,url=new URL(request.url),navigation=request.mode==='navigate'&&(url.pathname===base.pathname||url.pathname===base.pathname+'index.html');
    const v=navigation?await repairActive():await clientVersion(event,url),b=await bundle(v);
    if(!b)return scope.fetch(request);
    let matched;
    if(navigation)matched=b.record.assets.find(a=>a.urls.some(u=>new URL(u,base).pathname===base.pathname+'index.html'))?.urls[0];
    else{
      const cleanURL=new URL(url);cleanURL.searchParams.delete('__offline_release');
      for(const a of b.record.assets){matched=a.urls.find(u=>assetURL(u)===cleanURL.href);if(matched)break;}
    }
    if(!matched)return scope.fetch(request);
    if((request.destination==='worker'||request.destination==='sharedworker')&&!event.resultingClientId&&!url.searchParams.has('__offline_release')){
      const target=new URL(url);target.searchParams.set('__offline_release',v);return Response.redirect(target.href,302);
    }
    const response=await b.cache.match(assetURL(matched));
    if(!response)return new Response('This offline copy is incomplete. Reconnect and prepare offline use again.',{status:503,headers:{'Content-Type':'text/plain'}});
    const id=event.resultingClientId||navigation&&event.clientId;
    if(id)await writeMeta('client/'+id,v);
    // A download used a cache-busting URL. Do not propagate that Response.url
    // into WorkerLocation; imports must keep the entry request's release hint.
    const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
  scope.addEventListener('install',event=>event.waitUntil((async()=>{await pinExisting();await writeMeta('available',version);})()));
  scope.addEventListener('activate',event=>event.waitUntil((async()=>{await scope.clients.claim();await clean();})()));
  scope.addEventListener('fetch',event=>{
    const url=new URL(event.request.url);
    if(event.request.method==='GET'&&inScope(url))event.respondWith(handleFetch(event));
  });
  scope.addEventListener('message',event=>{
    const port=event.ports?.[0],message=event.data||{};
    const task=(async()=>{
      if(message.type==='STATUS'){send(port,await status(message.pageVersion));return;}
      if(message.type==='PREPARE_OFFLINE'){
        subscribers.set(port,message.pageVersion);
        if(!preparing)preparing=prepare().catch(error=>publish({type:'ERROR',ready:false,error:error.message})).finally(()=>{preparing=null;subscribers.clear();});
        await preparing;return;
      }
      if(message.type==='APPLY_UPDATE'){
        if(!await complete(version))throw Error('Download the complete offline update before applying it.');
        await writeMeta('active',version);send(port,{type:'APPLIED',version,ready:true,activeVersion:version});await scope.skipWaiting();
      }
    })().catch(error=>send(port,{type:'ERROR',version,error:error.message,ready:false}));
    event.waitUntil(task);
  });
  return Object.freeze({status,prepare,handleFetch,complete,cacheName,metaName,version});
});
