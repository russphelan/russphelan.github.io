/* Progressive, resumable exploration. Automatic numerical work only runs in a
 * worker, between interactions and outside connected-sum preparation/animation. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSearchManager=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create({store,loadCatalogue,getStarter=()=>null,validateCurve,createWorker,searchFallback,sameCurve,searchSeed,onCurves=()=>{},onStatus=()=>{},
    now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,quietMs=750,gapMs=100,batchMs=180,automaticLimit=36}={}){
    const sessions=new Map(),blocks=new Set();
    let current=null,worker=null,workerToken=0,timer=null,changedTimer=null,saveTimer=null,quietUntil=0,manual=null,destroyed=false;
    const keyFor=config=>JSON.stringify([config.surface,config.endpointPreset,config.geometryVersion,config.solverVersion,config.normalCurvature,config.endpoints]);
    const same=sameCurve||((a,b)=>Math.abs(a.length-b.length)<.015&&Math.abs(Math.atan2(Math.sin(a.theta-b.theta),Math.cos(a.theta-b.theta)))<.008);
    const seed=searchSeed||(c=>({theta:c.theta,length:c.length}));
    const emptyCoverage=()=>({jobs:[],automatic:null,pausedByUser:false,nextRound:0});
    const activeJob=s=>manual?.session===s?manual.job:s.coverage.automatic&&!s.coverage.automatic.done?
      s.coverage.jobs.find(j=>j.quality===s.coverage.automatic.quality&&j.round===s.coverage.automatic.round):null;
    function status(){
      const s=current,job=s&&activeJob(s),coverage=job||s?.coverage.jobs.at(-1),
        downloading=!!s?.cataloguePending&&manual?.session!==s,waiting=blocks.size>0||now()<quietUntil||downloading;
      return {loading:!!s&&!s.ready,catalogueLoading:downloading,running:!!s&&s.ready&&!!job&&!s.coverage.pausedByUser&&!s.error&&!downloading,
        workerActive:!!worker,paused:waiting,reason:[...blocks][0]||(now()<quietUntil?'interaction':downloading?'more paths to load':null),
        automatic:manual?.session!==s,found:s?.curves.length||0,progress:coverage?.total?100*coverage.nextSeed/coverage.total:0,
        coverage:coverage?{...coverage}:null,storageAvailable:s?.storageAvailable!==false,error:s?.error||null};
    }
    function emit(){if(!destroyed)onStatus(status());}
    function clear(name){if(name==='work'&&timer!==null){clearTimer(timer);timer=null;}
      if(name==='changed'&&changedTimer!==null){clearTimer(changedTimer);changedTimer=null;}}
    function publish(s){
      if(destroyed||s!==current||!s.changed)return;
      if(blocks.size||now()<quietUntil){queuePublish(s);return;}
      s.changed=false;onCurves(s.curves.slice(),s.config);emit();
    }
    function queuePublish(s){
      s.changed=true;if(s!==current||changedTimer!==null||destroyed)return;
      changedTimer=setTimer(()=>{changedTimer=null;publish(s);},Math.max(batchMs,quietUntil-now()));
    }
    function merge(s,curves){
      let added=0;
      for(const curve of curves||[]){
        if(s.curves.length>=512)break;
        if(!validateCurve(curve,s.config)||s.curves.some(other=>same(curve,other)))continue;
        // A shot identifies a path independently of discovery or arrival order.
        const copy={...curve,id:`${s.config.surface}-${s.config.endpointPreset}-${curve.theta.toPrecision(16)}-${curve.length.toPrecision(16)}`};
        s.curves.push(copy);added++;
      }
      if(added){s.dirty=true;queuePublish(s);}return added;
    }
    function save(s,immediate=false){
      if(!s?.ready||!s.dirty)return;
      if(!immediate){
        if(saveTimer===null)saveTimer=setTimer(()=>{saveTimer=null;
          if(blocks.size||now()<quietUntil){save(s);return;}
          for(const session of sessions.values())save(session,true);
        },1500);return;
      }
      s.dirty=false;
      // Manual requests are intentionally not resumed without another request.
      const record={curves:s.curves.slice(),coverage:JSON.parse(JSON.stringify(s.coverage)),updatedAt:now()};
      Promise.resolve(store?.put(s.config,record)).then(ok=>{s.storageAvailable=ok!==false;if(s===current)emit();},()=>{s.storageAvailable=false;});
    }
    function halt(){
      workerToken++;clear('work');
      if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();worker=null;}
    }
    function schedule(delay=gapMs){
      clear('work');if(destroyed||!current?.ready||!activeJob(current)||current.coverage.pausedByUser||current.error||
        current.cataloguePending&&manual?.session!==current||blocks.size||worker)return;
      timer=setTimer(()=>{timer=null;run();},Math.max(delay,quietUntil-now(),0));
    }
    function newJob(s,quality,round){
      // Keep unfinished coverage when changing depth; discard only old completed
      // schedules if a very long exploration reaches the bookkeeping bound.
      if(s.coverage.jobs.length>=64){const index=s.coverage.jobs.findIndex(j=>j.stopReason==='complete');if(index>=0)s.coverage.jobs.splice(index,1);else return null;}
      const job={quality,round,nextSeed:0,total:0,accepted:0,stopReason:'attempt-limit'};
      s.coverage.jobs.push(job);s.coverage.nextRound=Math.max(s.coverage.nextRound,round+1);return job;
    }
    function updateProgress(s,job,p){
      if(!p||!Number.isInteger(p.nextSeed)||!Number.isInteger(p.total)||p.nextSeed<job.nextSeed||p.nextSeed>p.total)return;
      job.nextSeed=p.nextSeed;job.total=p.total;job.stopReason=p.stopReason||'attempt-limit';s.dirty=true;
    }
    function received(s,job,curve){
      if(merge(s,[curve])){
        job.accepted++;
        const auto=s.coverage.automatic;
        if(auto&&!auto.done&&auto.round===job.round&&auto.quality===job.quality){
          auto.accepted++;if(auto.accepted>=auto.limit)auto.done=true;
        }
        if(manual?.session===s&&manual.job===job)manual.accepted++;
      }
    }
    function completed(s,job,p){
      updateProgress(s,job,p);
      const auto=s.coverage.automatic;
      if(auto&&auto.round===job.round&&auto.quality===job.quality&&
        (job.stopReason==='complete'||auto.accepted>=auto.limit||s.curves.length>=512))auto.done=true;
      if(manual?.session===s&&manual.job===job&&(job.stopReason==='complete'||manual.accepted>=36||s.curves.length>=512))manual=null;
      s.dirty=true;save(s);queuePublish(s);emit();schedule();
    }
    function failed(s,error){
      // A failed worker is a runtime condition, not the user's persistent Stop
      // choice. Retain accepted paths/cursors but allow a later visit to retry.
      halt();s.error=error?.message||'Background search is unavailable.';s.dirty=true;save(s);emit();
    }
    function run(){
      const s=current,job=s&&activeJob(s);
      if(!s?.ready||!job||blocks.size||s.coverage.pausedByUser||s.error||
        s.cataloguePending&&manual?.session!==s||worker||destroyed)return;
      if(now()<quietUntil){schedule();return;}
      const token=++workerToken,requested=manual?.session===s;
      const remaining=requested?36-manual.accepted:s.coverage.automatic.limit-s.coverage.automatic.accepted;
      if(remaining<=0||s.curves.length>=512){completed(s,job);return;}
      const options={surface:s.config.surface,endpointPreset:s.config.endpointPreset,normalCurvature:s.config.normalCurvature,
        quality:job.quality,round:job.round,startSeed:job.nextSeed,maxAttempts:6,maxCurves:Math.max(1,remaining),
        existing:s.curves.map(seed)};
      const active=()=>!destroyed&&current===s&&workerToken===token;
      let fallingBack=false;
      const workerActive=()=>active()&&!fallingBack;
      function fallback(error){
        if(!active()||fallingBack)return;
        // A worker may be unavailable, fail to construct, or fail while loading
        // its scripts. Only an explicit manual request may use the drawing
        // thread, one unchanged shooting attempt at a time.
        if(!requested||!searchFallback){failed(s,error||new Error('Automatic search needs browser workers; saved paths remain available.'));return;}
        fallingBack=true;
        if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();}
        const fallbackOptions={...options,startSeed:job.nextSeed,maxAttempts:1,
          maxCurves:Math.max(1,36-manual.accepted),existing:s.curves.map(seed)};
        worker={terminate(){}};emit();
        Promise.resolve().then(()=>{
          if(!active())return null;
          return searchFallback(fallbackOptions,c=>{if(active())received(s,job,c);},
            p=>{if(active())updateProgress(s,job,p);},()=>!active());
        }).then(result=>{if(!active())return;worker=null;completed(s,job,result.searchProgress);},
          failure=>{if(active())failed(s,failure);});
      }
      try{
        worker=createWorker?.()||null;
        if(!worker){
          fallback();return;
        }
        worker.onmessage=event=>{
          if(!workerActive())return;const message=event.data;
          if(message?.type==='curve')received(s,job,message.curve);
          else if(message?.type==='progress'){updateProgress(s,job,message.progress);emit();}
          else if(message?.type==='done'){const value=worker;worker=null;value.terminate();completed(s,job,message.progress);}
          else if(message?.type==='error')fallback(new Error(message.message));
        };
        worker.onerror=event=>{event?.preventDefault?.();if(workerActive())fallback(new Error(event?.message||'Background search failed.'));};
        worker.onmessageerror=()=>{if(workerActive())fallback(new Error('Search results could not be received.'));};
        worker.postMessage({type:'search',options});emit();
      }catch(error){if(workerActive())fallback(error);}
    }
    async function activate(config){
      if(destroyed)return;deactivate();
      const key=keyFor(config);let s=sessions.get(key);
      if(!s){s={config,curves:[],coverage:emptyCoverage(),ready:false,dirty:false,changed:false};sessions.set(key,s);}
      // A failed worker is a transient availability problem, not the user's Stop.
      s.error=null;
      current=s;quietUntil=Math.max(quietUntil,now()+quietMs);emit();
      if(s.ready){s.changed=true;publish(s);emit();schedule();return;}
      if(!s.loading)s.loading=(async()=>{
        let catalogue=null,stored=null;
        const acceptCatalogue=value=>{
          if(value&&value.geometryVersion===config.geometryVersion&&value.normalCurvature===config.normalCurvature){
            merge(s,value.curves);catalogue=value;
          }
        };
        // These few full-precision paths arrive with the application itself.
        // Neither a failed JSON request nor an unavailable worker can erase them.
        try{acceptCatalogue(getStarter(config));}catch(_){}
        const hasStarter=s.curves.length>0;
        s.cataloguePending=true;
        const catalogueTask=Promise.resolve().then(()=>loadCatalogue(config.surface,config.endpointPreset))
          .then(acceptCatalogue).catch(()=>{}).finally(()=>{
            s.cataloguePending=false;
            if(s.ready){s.dirty=true;save(s);queuePublish(s);if(s===current){emit();schedule();}}
          });
        const restoreTask=Promise.resolve().then(()=>store?.get(config)).then(value=>{
          stored=value;if(value)merge(s,value.curves);
        }).catch(()=>{});
        // With a bundled starter, the full download need not hold up the picker
        // or a manual search. Automatic enrichment waits to deduplicate against it.
        await Promise.allSettled(hasStarter?[restoreTask]:[catalogueTask,restoreTask]);
        if(stored?.coverage){
          s.coverage=stored.coverage;
          // Older worker failures were saved as Stop, even after accepting a
          // partial collection. Only an explicitly marked user Stop persists.
          if(s.coverage.pausedByUser&&s.coverage.pauseReason!=='user')s.coverage.pausedByUser=false;
        }
        if(!s.coverage.automatic){
          const round=catalogue?.curves?.length?Math.max(1,(catalogue.searchOptions?.round||0)+1):0;
          const job=newJob(s,'extended',round);
          s.coverage.automatic={quality:'extended',round,accepted:0,limit:automaticLimit,done:!job};
        }
        if(s.coverage.automatic.accepted>=s.coverage.automatic.limit)s.coverage.automatic.done=true;
        s.ready=true;s.dirty=true;s.changed=true;
      })();
      await s.loading;if(destroyed||current!==s)return;
      publish(s);save(s);emit();schedule();
    }
    function deactivate(){
      halt();clear('changed');manual=null;
      if(current){save(current);current=null;}emit();
    }
    return Object.freeze({activate,deactivate,
      manual(quality='extended'){
        const s=current;if(!s?.ready)return false;
        halt();s.error=null;s.coverage.pausedByUser=false;s.coverage.pauseReason=null;
        const depth=quality==='standard'?'standard':'extended';
        const job=s.coverage.jobs.find(j=>j.quality===depth&&j.stopReason!=='complete')||newJob(s,depth,s.coverage.nextRound);
        if(!job)return false;manual={session:s,job,accepted:0};s.dirty=true;emit();schedule(0);return true;
      },
      stop(){halt();if(current){current.coverage.pausedByUser=true;current.coverage.pauseReason='user';current.dirty=true;save(current);}manual=null;emit();},
      block(reason,value){
        if(value===blocks.has(reason))return;
        if(value){blocks.add(reason);halt();}else blocks.delete(reason);
        if(current?.changed)queuePublish(current);emit();schedule();
      },
      interact(){quietUntil=now()+quietMs;halt();if(current?.changed)queuePublish(current);emit();schedule();},
      flush(){if(saveTimer!==null){clearTimer(saveTimer);saveTimer=null;}for(const s of sessions.values())save(s,true);return store?.flush?.();},
      snapshot:status,
      destroy(){
        if(destroyed)return;
        deactivate();
        if(saveTimer!==null)clearTimer(saveTimer);saveTimer=null;
        // Deactivation normally defers serialization until interaction is quiet.
        // Destruction has no later idle interval, so retain unpublished arrivals
        // and their completed-seed cursors before discarding the save timer.
        for(const s of sessions.values())save(s,true);
        destroyed=true;return store?.flush?.();
      }
    });
  }
  return Object.freeze({create});
});
