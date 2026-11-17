/* One bounded pool of exact, resumable numerical profiles. Speculation never
 * publishes a partly checked profile and yields between short work slices. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicDownhillPreparation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const abort=()=>{const error=new Error('The numerical preparation was superseded.');error.name='AbortError';return error;};
  function create({window:win,prepareSteps,prepareBasisSteps,maxEntries=8,quietMs=180,budgetMs=4}={}){
    if(!win||typeof win.setTimeout!=='function'||typeof win.clearTimeout!=='function'||typeof prepareSteps!=='function')throw TypeError('A scheduler and resumable preparation are required.');
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||![quietMs,budgetMs].every(Number.isFinite)||quietMs<0||budgetMs<=0)throw RangeError('Finite preparation limits are required.');
    const now=()=>win.performance?.now?.()??Date.now(),priorityTasks=typeof win.scheduler?.postTask==='function'&&typeof win.AbortController==='function';
    const ready=[],jobs=[],blocks=new Map(),listeners=[];
    let context={data:null,model:null,position:0,active:false,playing:false,surgery:false},contextOwned=false,destroyed=false,scheduled=null,lastInteraction=now(),serial=0;
    const listen=(target,type,fn)=>{if(typeof target?.addEventListener==='function'){target.addEventListener(type,fn);listeners.push([target,type,fn]);}};
    const matches=(a,b)=>a.data===b.data&&a.model===b.model&&a.T===b.T&&a.type===b.type&&a.mode===b.mode;
    function traversalHeld(){for(const allowDemand of blocks.values())if(allowDemand)return true;return false;}
    function hardPaused(){
      if(destroyed||win.document?.hidden||context.playing||context.surgery)return true;
      for(const allowDemand of blocks.values())if(!allowDemand)return true;return false;
    }
    const paused=()=>hardPaused()||traversalHeld()&&!nextJob();
    function optionsOf(input={}){
      const {data,model}=input,T=input.T,type=input.type??'surface',mode=input.mode??1;
      if(!data||typeof data.sampleAt!=='function'||!Number.isFinite(data.length)||data.length<=0||!model||typeof model!=='object')throw TypeError('Prepared geodesic data and a metric model are required.');
      if(!Number.isFinite(T)||T<=0||T>data.length+1e-10||!['surface','hidden'].includes(type)||!Number.isSafeInteger(mode)||mode<1||mode>128)throw RangeError('A valid fixed segment and mode are required.');
      const result={data,model,T:Math.min(T,data.length),type,mode};
      if(input.eventS!==undefined)result.eventS=input.eventS;
      validateEvent(result);return result;
    }
    function validateEvent(options,profile){
      if(options.eventS===undefined)return;
      const curvature=options.data.curvature??.36;
      const root=profile?profile.root:options.type==='hidden'&&curvature>0?options.mode*Math.PI/Math.sqrt(curvature):
        options.type==='surface'?(options.data.events||[]).filter(e=>e.surface)[options.mode-1]?.s:null;
      if(!Number.isFinite(options.eventS)||!Number.isFinite(root)||Math.abs(options.eventS-root)>Math.max(1e-6,options.data.eventTolerance||0))throw RangeError('The chosen focus does not match this mode.');
    }
    function cached(options){
      const index=ready.findIndex(entry=>matches(entry.options,options));if(index<0)return null;
      const [entry]=ready.splice(index,1);validateEvent(options,entry.profile);ready.push(entry);return entry.profile;
    }
    function cancelSchedule(){
      if(!scheduled)return;
      const handle=scheduled;scheduled=null;
      if(handle.kind==='task')handle.controller.abort();else win.clearTimeout(handle.id);
    }
    function settle(job,error,profile){
      const index=jobs.indexOf(job);if(index<0)return;
      jobs.splice(index,1);
      if(error){for(const task of job.currents||[])task.reject(error);job.reject(error);return;}
      ready.push({options:job.options,profile});if(ready.length>maxEntries)ready.shift();job.resolve(profile);
    }
    const priority=name=>name==='demand'?0:name==='warm'?1:2;
    // Finish the range of an already displayed push before preparing modes the
    // audience has not selected. It still uses quiet background work slices.
    const jobPriority=job=>job.currents?.length?0:job.currentReady?.length?Math.min(.5,job.priority):job.priority;
    const mayRun=job=>!traversalHeld()||jobPriority(job)===0&&(!job.staged||job.currents.length>0)&&job.options.data===context.data&&job.options.model===context.model&&job.options.T===context.position;
    function nextJob(){return jobs.filter(job=>!job.cancelled&&mayRun(job))
      .sort((a,b)=>jobPriority(a)-jobPriority(b)||a.serial-b.serial)[0]||null;}
    function schedule(){
      cancelSchedule();if(paused())return;
      const job=nextJob();if(!job)return;
      const delay=jobPriority(job)===0?0:Math.max(0,lastInteraction+quietMs-now());
      if(delay>0){const handle={kind:'timer',id:0};handle.id=win.setTimeout(()=>{if(scheduled!==handle)return;scheduled=null;schedule();},delay);scheduled=handle;return;}
      const handle={kind:priorityTasks?'task':'timer',id:0,controller:priorityTasks?new win.AbortController():null};
      const run=deadline=>{if(scheduled!==handle)return;scheduled=null;work(deadline);};
      scheduled=handle;
      if(priorityTasks){
        const fallback=()=>{if(scheduled!==handle)return;handle.kind='timer';handle.id=win.setTimeout(run,0);};
        try{win.scheduler.postTask(()=>run(),{priority:jobPriority(job)===0?'user-visible':'background',signal:handle.controller.signal}).catch(fallback);}catch(_){fallback();}
      }else handle.id=win.setTimeout(run,0);
    }
    function work(deadline){
      if(paused())return;
      const job=nextJob();if(!job)return;
      const start=now(),sliceBudget=jobPriority(job)===0&&!traversalHeld()?Math.max(8,budgetMs):budgetMs;let count=0;
      try{
        do{
          let iterator,stage,task;
          if(job.staged){
            if(!job.basis){stage='basis';iterator=job.iterator||(job.iterator=prepareBasisSteps(job.options));}
            else if(job.currents.length){stage='current';task=job.currents[0];iterator=task.iterator||(task.iterator=job.basis.verifyCurrentSteps(task.A,{referenceAmplitude:task.referenceAmplitude,B:task.B}));}
            else{stage='full';iterator=job.fullIterator||(job.fullIterator=job.basis.finishSteps());}
          }else{stage='full';iterator=job.iterator||(job.iterator=prepareSteps(job.options));}
          let step;
          try{step=iterator.next();}catch(error){
            if(stage!=='current')throw error;
            job.currents.shift();task.reject(error);continue;
          }
          count++;
          if(step.done){
            if(!step.value)throw Error('Numerical preparation returned no verified profile.');
            if(stage==='basis'){job.basis=step.value;job.iterator=null;continue;}
            validateEvent(job.options,step.value);
            if(stage==='current'){
              job.currents.shift();job.currentReady.push({A:task.A,B:task.B,referenceAmplitude:task.referenceAmplitude,profile:step.value});
              if(job.currentReady.length>2)job.currentReady.shift();task.resolve(step.value);
              // Publish the exact current push before starting any range work.
              break;
            }
            settle(job,null,step.value);break;
          }
        // Cheap Sturm checkpoints should fill the same short time budget.
        // A 64-checkpoint ceiling caused hundreds of mostly empty timer tasks;
        // clamped fallback timers then dominated the actual numerical work.
        // Retain a finite guard for a missing/nonadvancing clock as well.
        }while(!hardPaused()&&mayRun(job)&&jobs.includes(job)&&count<2048&&now()-start<sliceBudget&&(!deadline||deadline.didTimeout||deadline.timeRemaining()>0));
      }catch(error){settle(job,error);}
      schedule();
    }
    function cancelIterator(job){
      try{job.iterator?.return?.();}catch(_){}
      try{job.fullIterator?.return?.();}catch(_){}
      for(const task of job.currents||[])try{task.iterator?.return?.();}catch(_){}
    }
    function newJob(options,requestedPriority){
      if(jobs.length>=Math.max(4,maxEntries+2)){
        const obsolete=jobs.slice().sort((a,b)=>jobPriority(b)-jobPriority(a)||a.serial-b.serial)[0];obsolete.cancelled=true;
        cancelIterator(obsolete);settle(obsolete,abort());
      }
      let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      // A current-only request may never attach to the full-range promise.
      promise.catch(()=>{});
      const job={options,priority:priority(requestedPriority),serial:++serial,iterator:null,promise,resolve,reject,
        staged:typeof prepareBasisSteps==='function',basis:null,fullIterator:null,currents:[],currentReady:[]};
      jobs.push(job);return job;
    }
    function enqueue(options,requestedPriority){
      const hit=cached(options);if(hit)return Promise.resolve(hit);
      let job=jobs.find(entry=>matches(entry.options,options));
      if(job){job.priority=Math.min(job.priority,priority(requestedPriority));schedule();return job.promise.then(profile=>{validateEvent(options,profile);return profile;});}
      job=newJob(options,requestedPriority);schedule();return job.promise;
    }
    function enqueueCurrent(options,A,B,referenceAmplitude){
      const hit=cached(options);if(hit)return Promise.resolve(hit);
      if(typeof prepareBasisSteps!=='function')return enqueue(options,'demand');
      let job=jobs.find(entry=>matches(entry.options,options));if(!job)job=newJob(options,'reference');
      const samePush=entry=>Object.is(entry.A,A)&&Object.is(entry.B,B)&&Object.is(entry.referenceAmplitude,referenceAmplitude);
      const ready=job.currentReady.find(samePush);
      if(ready)return Promise.resolve(ready.profile);
      let task=job.currents.find(samePush);
      if(task){schedule();return task.promise;}
      if(job.currents.length>=4){const obsolete=job.currents.shift();try{obsolete.iterator?.return?.();}catch(_){}obsolete.reject(abort());}
      let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      task={A,B,referenceAmplitude,promise,resolve,reject,iterator:null};job.currents.push(task);schedule();return promise;
    }
    function cancelJobs(){
      cancelSchedule();for(const job of jobs.splice(0)){job.cancelled=true;cancelIterator(job);const error=abort();for(const task of job.currents)task.reject(error);job.reject(error);}
    }
    function prewarm(){
      if(!context.active||context.playing||context.surgery||!context.data||!context.model||!(context.position>0)||context.position>context.data.length+1e-10)return;
      for(const mode of [1,2]){
        try{enqueue(optionsOf({data:context.data,model:context.model,T:context.position,type:'surface',mode}),'warm').catch(()=>{});}catch(_){}
      }
    }
    const visibility=()=>{if(win.document?.hidden)cancelSchedule();else{lastInteraction=now();prewarm();schedule();}};
    listen(win.document,'visibilitychange',visibility);
    listen(win,'pagehide',()=>{blocks.set('page hidden',false);cancelSchedule();});
    listen(win,'pageshow',()=>{blocks.delete('page hidden');lastInteraction=now();prewarm();schedule();});
    return Object.freeze({
      peek(input){if(destroyed)return null;return cached(optionsOf(input));},
      request(input,{priority:requestedPriority='demand'}={}){
        if(destroyed)return Promise.reject(abort());
        if(!['demand','warm','reference'].includes(requestedPriority))return Promise.reject(RangeError('Unknown preparation priority.'));
        try{
          const options=optionsOf(input);
          if(contextOwned&&(options.data!==context.data||options.model!==context.model))return Promise.reject(abort());
          return enqueue(options,requestedPriority);
        }catch(error){return Promise.reject(error);}
      },
      requestCurrent(input,A,{referenceAmplitude=.12,B=0}={}){
        if(destroyed)return Promise.reject(abort());
        if(!Number.isFinite(A)||!Number.isFinite(B)||!Number.isFinite(referenceAmplitude)||referenceAmplitude<=0||Math.hypot(A,B)>referenceAmplitude)return Promise.reject(RangeError('A finite current push and display reference are required.'));
        try{
          const options=optionsOf(input);
          if(options.type==='surface'&&B!==0)throw RangeError('The surface mode has only one push coordinate.');
          if(contextOwned&&(options.data!==context.data||options.model!==context.model))return Promise.reject(abort());
          return enqueueCurrent(options,A,B,referenceAmplitude);
        }catch(error){return Promise.reject(error);}
      },
      setContext(next={}){
        if(destroyed)return;
        const previous=context;context={...context,...next};
        if(context.active&&context.data&&context.model)contextOwned=true;
        if(previous.data===context.data&&previous.model===context.model&&Math.abs(previous.position-context.position)<=1e-10)context.position=previous.position;
        const changed=previous.data!==context.data||previous.model!==context.model||previous.position!==context.position||previous.active&&!context.active;
        if(changed){cancelJobs();lastInteraction=now();}
        if(previous.playing&&!context.playing||previous.surgery&&!context.surgery)lastInteraction=now();
        prewarm();schedule();
      },
      block(reason,value,{allowDemand=false}={}){if(destroyed)return;if(value)blocks.set(reason,allowDemand);else if(blocks.delete(reason))lastInteraction=now();schedule();},
      interact(){if(destroyed)return;lastInteraction=now();schedule();},
      snapshot(){return {ready:ready.length,pending:jobs.length,blocked:paused(),traversalHeld:traversalHeld(),position:context.position,jobs:jobs.map(job=>({T:job.options.T,mode:job.options.mode,priority:jobPriority(job),started:!!(job.iterator||job.basis),current:job.currents.length}))};},
      destroy(){if(destroyed)return;destroyed=true;cancelJobs();ready.length=0;for(const [target,type,fn]of listeners)target.removeEventListener(type,fn);}
    });
  }
  return Object.freeze({create});
});
