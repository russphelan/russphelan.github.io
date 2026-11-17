/* Load only the current surface's verified starter paths. Presentation and
 * showcase catalogues deliberately keep their separate, deterministic loading. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicCatalogues=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const surfaces=new Set(['torus','double','triple']),presets=new Set(['default','alternate']);
  function create({fetch:fetchCatalogue,baseURL='./catalogues/',version='compact-collar-3',scriptVersion='compact-collar-3',timeoutMs=15000,
    protocol=root.location?.protocol,document:documentRef=root.document,registry,loadScript,
    setTimer=setTimeout,clearTimer=clearTimeout,AbortController:Controller=root.AbortController}={}){
    const pending=new Map();
    const request=fetchCatalogue||(typeof root.fetch==='function'?root.fetch.bind(root):null);
    const entries=registry||(root.GeodesicCatalogueEntries||(root.GeodesicCatalogueEntries=Object.create(null)));
    const valid=entry=>entry?.schemaVersion===1&&entry.endpoints&&Array.isArray(entry.curves);
    const delay=Number.isFinite(timeoutMs)&&timeoutMs>=0?timeoutMs:15000;
    function fetchEntry(url){
      if(!request)return Promise.reject(new Error('Catalogue fetching is unavailable.'));
      let controller=null,timer;
      try{if(typeof Controller==='function')controller=new Controller();}catch(_){}
      const responseTask=Promise.resolve().then(()=>request(url,controller?{signal:controller.signal}:undefined)).then(response=>{
        if(!response?.ok)throw new Error('The starter catalogue could not be loaded.');
        return response.json();
      }).then(entry=>{
        if(!valid(entry))throw new Error('The starter catalogue has an unsupported format.');
        return entry;
      });
      // The deadline covers both the request and body parsing. A stalled file
      // must not indefinitely delay saved results or the live numerical search.
      const deadline=new Promise((_,reject)=>{
        timer=setTimer(()=>{
          reject(new Error('The starter catalogue took too long to load.'));
          controller?.abort();
        },delay);
      });
      return Promise.race([responseTask,deadline]).finally(()=>clearTimer(timer));
    }
    function scriptEntry(url,key){
      let script=null,timer,settled=false;
      return new Promise((resolve,reject)=>{
        const finish=(error,value)=>{
          if(settled)return;settled=true;clearTimer(timer);
          if(script){script.onload=script.onerror=null;script.remove();}
          if(error)reject(error);else resolve(value);
        };
        timer=setTimer(()=>finish(new Error('The starter script took too long to load.')),delay);
        try{
          if(loadScript){
            Promise.resolve().then(()=>loadScript(url,key,entries)).then(value=>{
              const entry=value||entries[key];
              finish(valid(entry)?null:new Error('The starter script has an unsupported format.'),entry);
            },error=>finish(error));
            return;
          }
          if(!documentRef?.createElement)throw new Error('Catalogue script loading is unavailable.');
          script=documentRef.createElement('script');script.async=true;script.src=url;
          script.onload=()=>{
            const entry=entries[key];
            finish(valid(entry)?null:new Error('The starter script did not register its catalogue.'),entry);
          };
          script.onerror=()=>finish(new Error('The starter script could not be loaded.'));
          (documentRef.head||documentRef.documentElement).appendChild(script);
        }catch(error){finish(error);}
      });
    }
    function load(surface,preset='default'){
      if(!surfaces.has(surface)||!presets.has(preset))return Promise.resolve(null);
      const key=surface+':'+preset;
      if(pending.has(key))return pending.get(key);
      if(valid(entries[key])){const loaded=Promise.resolve(entries[key]);pending.set(key,loaded);return loaded;}
      const stem=baseURL+surface+'-'+preset;
      const scriptURL=stem+'.js?v='+encodeURIComponent(scriptVersion);
      // Local files permit classic script loading but browsers commonly reject
      // fetch(file:) and external file workers. Keep the complete catalogue
      // available without asking the user to change browser security settings.
      const attempt=protocol==='file:'?scriptEntry(scriptURL,key):
        fetchEntry(stem+'.json?v='+encodeURIComponent(version)).catch(error=>{
          if(loadScript||documentRef?.createElement)return scriptEntry(scriptURL,key);
          throw error;
        });
      const job=attempt.catch(()=>{
        // A temporary network failure must not poison future visits to this
        // configuration. The numerical worker can still supply new paths.
        if(pending.get(key)===job)pending.delete(key);
        return null;
      });
      pending.set(key,job);
      return job;
    }
    return Object.freeze({load});
  }
  return Object.freeze({create});
});
