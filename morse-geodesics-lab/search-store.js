/* Validated, asynchronous persistence of numerical trajectories and search coverage.
 * Storage is optional: denied/blocked/full databases keep a bounded session cache. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSearchStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const SCHEMA=1,MAX_CURVES=512,MAX_POINTS=20000,MAX_RECORDS=12;
  const finite=Number.isFinite,integer=n=>Number.isSafeInteger(n)&&n>=0;
  const point=p=>Array.isArray(p)&&p.length===3&&p.every(finite);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const text=value=>typeof value==='string'&&value.length>0&&value.length<=200;
  const clone=value=>typeof root.structuredClone==='function'?root.structuredClone(value):JSON.parse(JSON.stringify(value));
  function configValid(config){
    return !!config&&text(config.surface)&&text(config.endpointPreset)&&text(config.geometryVersion)&&
      text(config.solverVersion)&&finite(config.normalCurvature)&&point(config.endpoints?.p)&&point(config.endpoints?.q);
  }
  function keyFor(config){
    if(!configValid(config))return null;
    return JSON.stringify([SCHEMA,config.surface,config.endpointPreset,config.geometryVersion,
      config.solverVersion,config.normalCurvature,config.endpoints.p,config.endpoints.q]);
  }
  // Reject invalid numbers even in optional numerical diagnostics. No quantization
  // or coercion is performed when a verified curve is saved or restored.
  function finiteTree(value,depth=0){
    if(depth>12)return false;
    if(typeof value==='number')return finite(value);
    if(value===null||typeof value==='string'||typeof value==='boolean'||value===undefined)return true;
    if(Array.isArray(value))return value.length<=MAX_POINTS&&value.every(v=>finiteTree(v,depth+1));
    return typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&
      Object.keys(value).length<=100&&Object.values(value).every(v=>finiteTree(v,depth+1));
  }
  function validateCurve(curve,config){
    if(!configValid(config)||!curve||curve.geometryVersion!==config.geometryVersion||
      !finite(curve.theta)||!finite(curve.length)||curve.length<=0||!integer(curve.intrinsicIndex)||
      curve.nearConjugate||curve.intrinsicNearConjugate||
      !finite(curve.residual)||curve.residual<0||curve.residual>2e-5||
      !finite(curve.refinementError)||curve.refinementError<0||curve.refinementError>2e-5||
      !Array.isArray(curve.points)||curve.points.length<2||curve.points.length>MAX_POINTS||
      !curve.points.every(point)||!Array.isArray(curve.jacobi)||curve.jacobi.length!==curve.points.length||
      curve.normalCurvature!==undefined&&curve.normalCurvature!==config.normalCurvature||
      curve.surface!==undefined&&curve.surface!==config.surface||
      curve.endpointPreset!==undefined&&curve.endpointPreset!==config.endpointPreset)return false;
    if(distance(curve.points[0],config.endpoints.p)>1e-8||
      distance(curve.points.at(-1),config.endpoints.q)>2e-5)return false;
    let previous=-1;
    for(const sample of curve.jacobi){
      if(!sample||!finite(sample.s)||sample.s<0||sample.s<=previous||sample.s>curve.length+1e-8||
        !finite(sample.j)||sample.jPrime!==undefined&&!finite(sample.jPrime)||
        sample.tangent!==undefined&&!point(sample.tangent))return false;
      previous=sample.s;
    }
    if(Math.abs(curve.jacobi[0].s)>1e-8||Math.abs(previous-curve.length)>1e-8)return false;
    return finiteTree(curve);
  }
  function validateRecord(record,config){
    if(!configValid(config)||!record||!Array.isArray(record.curves)||record.curves.length>MAX_CURVES||
      !record.curves.every(curve=>validateCurve(curve,config)))return false;
    const coverage=record.coverage;
    if(!coverage||!Array.isArray(coverage.jobs)||coverage.jobs.length>64||
      !coverage.jobs.every(job=>job&&['standard','extended'].includes(job.quality)&&integer(job.round)&&
        integer(job.nextSeed)&&integer(job.total)&&job.nextSeed<=job.total&&integer(job.accepted)&&
        ['complete','attempt-limit','curve-limit','cancelled'].includes(job.stopReason)&&
        (job.stopReason!=='complete'||job.nextSeed===job.total))||
      !integer(coverage.nextRound)||typeof coverage.pausedByUser!=='boolean')return false;
    const jobKeys=coverage.jobs.map(job=>job.quality+':'+job.round);
    if(new Set(jobKeys).size!==jobKeys.length||
      coverage.jobs.some(job=>coverage.nextRound<=job.round))return false;
    const automatic=coverage.automatic;
    if(automatic!==null&&(!automatic||!['standard','extended'].includes(automatic.quality)||
      !integer(automatic.round)||!integer(automatic.accepted)||!integer(automatic.limit)||
      automatic.limit===0||automatic.limit>MAX_CURVES||automatic.accepted>automatic.limit||
      typeof automatic.done!=='boolean'||!automatic.done&&!jobKeys.includes(automatic.quality+':'+automatic.round)))return false;
    return finiteTree(coverage)&&(record.updatedAt===undefined||finite(record.updatedAt)&&record.updatedAt>=0);
  }
  function create(options={}){
    let factory;
    try{factory=Object.hasOwn(options,'indexedDB')?options.indexedDB:root.indexedDB;}catch(_){factory=null;}
    const now=options.now||Date.now,timeoutMs=options.timeoutMs??1500;
    const memory=new Map(),writes=new Set();let opening=null,db=null,disabled=!factory,closed=false;
    function remember(key,record){
      memory.delete(key);memory.set(key,record);
      while(memory.size>MAX_RECORDS)memory.delete(memory.keys().next().value);
    }
    function open(){
      if(closed||disabled)return Promise.resolve(null);
      if(db)return Promise.resolve(db);
      if(opening)return opening;
      opening=new Promise(resolve=>{
        let settled=false,timer;
        const finish=value=>{if(settled){value?.close();return;}settled=true;clearTimeout(timer);
          if(!value)disabled=true;else db=value;resolve(value);};
        timer=setTimeout(()=>finish(null),timeoutMs);
        try{
          const request=factory.open('morse-geodesics-search',SCHEMA);
          request.onupgradeneeded=()=>{
            const database=request.result;
            if(!database.objectStoreNames.contains('entries'))database.createObjectStore('entries',{keyPath:'slot'});
            if(!database.objectStoreNames.contains('recent'))database.createObjectStore('recent',{keyPath:'slot'});
          };
          request.onsuccess=()=>{
            const database=request.result;
            if(closed){database.close();finish(null);return;}
            database.onversionchange=()=>{database.close();if(db===database)db=null;disabled=true;};
            finish(database);
          };
          request.onerror=request.onblocked=()=>finish(null);
        }catch(_){finish(null);}
      });
      return opening;
    }
    async function get(config){
      const key=keyFor(config);if(!key||closed)return null;
      if(memory.has(key))return clone(memory.get(key));
      const database=await open();if(!database||closed)return null;
      const slot=JSON.stringify([config.surface,config.endpointPreset]);
      const envelope=await new Promise(resolve=>{
        let tx,timer;
        const finish=value=>{clearTimeout(timer);resolve(value);};
        timer=setTimeout(()=>{try{tx?.abort();}catch(_){}finish(null);},timeoutMs);
        try{
          tx=database.transaction('entries','readonly');let value=null;
          tx.objectStore('entries').get(slot).onsuccess=event=>{value=event.target.result;};
          tx.oncomplete=()=>finish(value);tx.onerror=tx.onabort=()=>finish(null);
        }catch(_){finish(null);}
      });
      if(closed)return null;
      // A write may have arrived while IndexedDB was opening/reading. Its
      // newer session value wins over the older disk snapshot.
      if(memory.has(key))return clone(memory.get(key));
      if(envelope?.schemaVersion!==SCHEMA||envelope.key!==key||!validateRecord(envelope.record,config))return null;
      remember(key,envelope.record);return clone(envelope.record);
    }
    function put(config,record){
      const key=keyFor(config);
      if(!key||closed||!validateRecord(record,config))return Promise.resolve(false);
      const snapshot=clone({...record,updatedAt:record.updatedAt??now()});remember(key,snapshot);
      const slot=JSON.stringify([config.surface,config.endpointPreset]);
      const write=(async()=>{
        const database=await open();if(!database||closed)return false;
        return new Promise(resolve=>{
          let tx,timer;
          const finish=value=>{clearTimeout(timer);resolve(value);};
          timer=setTimeout(()=>{try{tx?.abort();}catch(_){}finish(false);},timeoutMs);
          try{
            tx=database.transaction(['entries','recent'],'readwrite');
            tx.objectStore('entries').put({slot,key,schemaVersion:SCHEMA,record:snapshot});
            const recent=tx.objectStore('recent');recent.put({slot,updatedAt:snapshot.updatedAt});
            recent.getAll().onsuccess=event=>{
              const entries=event.target.result.sort((a,b)=>b.updatedAt-a.updatedAt);
              for(const entry of entries.slice(MAX_RECORDS)){
                tx.objectStore('entries').delete(entry.slot);recent.delete(entry.slot);
              }
            };
            tx.oncomplete=()=>finish(true);tx.onerror=tx.onabort=()=>finish(false);
          }catch(_){finish(false);}
        });
      })();
      writes.add(write);write.finally(()=>writes.delete(write));return write;
    }
    return Object.freeze({get,put,flush:()=>Promise.all([...writes]),close(){closed=true;db?.close();db=null;memory.clear();}});
  }
  return Object.freeze({schemaVersion:SCHEMA,keyFor,validateCurve,validateRecord,create});
});
