/* File launches cannot import sibling files from a worker. The generated Blob
 * contains the same numerical sources and runs them entirely off the UI thread. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSearchWorkers=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function create({Worker:WorkerClass=root.Worker,Blob:BlobClass=root.Blob,URL:URLApi=root.URL,
    protocol=root.location?.protocol,source=root.GeodesicSolverWorkerSource,
    workerURL='./solver-worker.js?v=compact-collar-3'}={}){
    return function createWorker(){
      if(typeof WorkerClass!=='function')return null;
      if(protocol!=='file:')return new WorkerClass(workerURL);
      if(typeof source!=='string'||!source.length||typeof BlobClass!=='function'||
        typeof URLApi?.createObjectURL!=='function'||typeof URLApi?.revokeObjectURL!=='function')
        throw new Error('The local-file background search could not be prepared.');
      const url=URLApi.createObjectURL(new BlobClass([source],{type:'text/javascript'}));
      let worker,released=false;
      const release=()=>{if(!released){released=true;URLApi.revokeObjectURL(url);}};
      try{
        worker=new WorkerClass(url);
        const terminate=worker.terminate.bind(worker);
        worker.terminate=()=>{try{return terminate();}finally{release();}};
        // Use a listener so the manager can own onerror without replacing URL
        // cleanup. Keep the URL alive until loading has finished or work stops.
        worker.addEventListener('error',release,{once:true});
        return worker;
      }catch(error){
        try{worker?.terminate();}finally{release();}
        throw error;
      }
    };
  }
  return Object.freeze({create});
});
