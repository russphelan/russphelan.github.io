/* Shared, cancellable preparation of the unchanged connected-sum geometry.
 * Background warm-up never runs heavy fallback work on the drawing thread. */
(function(root,factory){
  'use strict';
  const surgery=typeof module==='object'&&module.exports?require('./surgery.js'):root.GeodesicSurgery;
  const api=factory(surgery);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSurgeryPreparation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Surgery){
  'use strict';
  const CANCELLED='SURGERY_PREPARATION_CANCELLED';
  const cancellation=()=>Object.assign(new Error('Connected-sum preparation was cancelled.'),{code:CANCELLED});
  function create({createWorker,prepareFallback,onReady}={}){
    const ready=new Map(),pending=new Map();let destroyed=false;
    const valid=fromId=>Surgery.availableFromIds.includes(fromId);
    function active(job){return !destroyed&&pending.get(job.fromId)===job;}
    function terminate(job){
      const worker=job.worker;job.worker=null;
      if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();}
    }
    function reject(job,error){
      if(!active(job))return;
      terminate(job);pending.delete(job.fromId);job.reject(error);
    }
    function complete(job,value,fromWorker=false){
      if(!active(job))return;
      try{
        const plan=Surgery.hydratePlan(value?.plan||value);
        if(plan.fromId!==job.fromId)throw new Error('The prepared connected sum has the wrong source surface.');
        const result={plan,targetMesh:plan.meshes.target};
        if(value?.targetWire!==undefined){
          const wire=value.targetWire,length=plan.meshes.target.positions.length*2;
          if(!wire||Object.prototype.toString.call(wire.positions)!=='[object Float32Array]'||
            Object.prototype.toString.call(wire.normals)!=='[object Float32Array]'||
            wire.positions.length!==length||wire.normals.length!==length)
            throw new Error('The prepared surface grid does not match the target geometry.');
          for(let i=0;i<length;i++)if(!Number.isFinite(wire.positions[i])||!Number.isFinite(wire.normals[i]))
            throw new Error('The prepared surface grid contains invalid coordinates.');
          result.targetWire=wire;
        }
        onReady?.(job.fromId,result);
        if(!active(job))return;
        terminate(job);pending.delete(job.fromId);ready.set(job.fromId,result);job.resolve(result);
      }catch(error){if(fromWorker)fallback(job,error);else reject(job,error);}
    }
    function fallback(job,error){
      if(!active(job)||job.fallback)return;
      terminate(job);
      if(!job.demanded||typeof prepareFallback!=='function'){reject(job,error);return;}
      job.fallback=true;
      Promise.resolve().then(()=>{
        if(!active(job))return;
        return prepareFallback(job.fromId);
      }).then(value=>{if(active(job))complete(job,value);},failure=>reject(job,failure));
    }
    function begin(fromId,demanded){
      if(destroyed)return Promise.reject(cancellation());
      if(!valid(fromId))return Promise.reject(new RangeError('A connected sum can be prepared from one or two summands.'));
      if(ready.has(fromId))return Promise.resolve(ready.get(fromId));
      if(pending.has(fromId)){const job=pending.get(fromId);job.demanded ||= demanded;return job.promise;}
      let resolve,rejectPromise;
      const promise=new Promise((yes,no)=>{resolve=yes;rejectPromise=no;});
      const job={fromId,demanded,promise,resolve,reject:rejectPromise,worker:null,fallback:false};
      pending.set(fromId,job);
      try{
        job.worker=createWorker?.()||null;
        if(!job.worker){fallback(job,new Error('Background preparation is unavailable.'));return promise;}
        job.worker.onmessage=event=>{
          if(!active(job))return;
          const message=event.data;
          if(message?.type==='ready'){
            if(message.fromId!==fromId)fallback(job,new Error('The prepared connected sum has the wrong source surface.'));
            else complete(job,{plan:message.plan,targetWire:message.targetWire},true);
          }
          else if(message?.type==='error')fallback(job,new Error(message.message||'Background preparation failed.'));
        };
        job.worker.onerror=event=>{event?.preventDefault?.();fallback(job,new Error(event?.message||'Background preparation failed.'));};
        job.worker.onmessageerror=()=>fallback(job,new Error('The prepared geometry could not be received.'));
        job.worker.postMessage({type:'prepare',fromId});
      }catch(error){fallback(job,error);}
      return promise;
    }
    function cancelPending(){
      for(const job of pending.values()){terminate(job);job.reject(cancellation());}
      pending.clear();
    }
    return Object.freeze({
      warm(fromId){if(destroyed||!valid(fromId))return Promise.resolve(null);return begin(fromId,false).catch(()=>null);},
      prepare(fromId){return begin(fromId,true);},
      cancelPending,
      destroy(){if(destroyed)return;cancelPending();destroyed=true;ready.clear();}
    });
  }
  return Object.freeze({create,cancelledCode:CANCELLED});
});
