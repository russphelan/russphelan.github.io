'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Preparation=require('./downhill-preparation.js');
function fixture({idle=true,maxEntries=8,fail=false,checkpoints=4,checkpointCost=1}={}){
  let clock=0,id=0;const tasks=new Map(),calls=[],steps=[],cancelled=[],windowHandlers={},documentHandlers={};
  const target=handlers=>({addEventListener(type,fn){handlers[type]=fn;},removeEventListener(type){delete handlers[type];}});
  const win={...target(windowHandlers),performance:{now:()=>clock},document:{...target(documentHandlers),hidden:false},
    setTimeout(fn,delay=0){tasks.set(++id,{fn,due:clock+delay,kind:'timer'});return id;},clearTimeout(n){tasks.delete(n);cancelled.push(n);}};
  if(idle){win.AbortController=AbortController;win.scheduler={postTask(fn,{priority,signal}){
    const taskId=++id;signal.addEventListener('abort',()=>{tasks.delete(taskId);cancelled.push(taskId);},{once:true});
    tasks.set(taskId,{fn,due:clock,kind:'task',priority});return Promise.resolve();
  }};}
  function* prepareSteps(options){
    calls.push(options);
    for(let i=0;i<checkpoints;i++){clock+=checkpointCost;steps.push({options,step:i});yield;}
    clock+=checkpointCost;if(fail)throw Error('verification failed');
    return Object.freeze({T:options.T,type:options.type,mode:options.mode,maxAmplitude:.12,
      root:options.data.events.filter(e=>e.surface)[options.mode-1]?.s??null,
      eigenvalue:options.mode**2-options.T,verified:true});
  }
  const pool=Preparation.create({window:win,prepareSteps,maxEntries,quietMs:180,budgetMs:4});
  const data={length:12,curvature:.36,events:[{s:3,surface:true},{s:7,surface:true}],sampleAt(){}},model={};
  const options=(mode=1,T=9,extra={})=>({data,model,T,type:'surface',mode,...extra});
  const context=(next={})=>pool.setContext({data,model,position:9,active:true,playing:false,surgery:false,...next});
  const next=()=>{
    const entry=[...tasks].sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];if(!entry)return false;
    tasks.delete(entry[0]);clock=Math.max(clock,entry[1].due);entry[1].fn(entry[1].kind==='idle'?{didTimeout:false,timeRemaining:()=>50}:undefined);return true;
  };
  const flush=()=>{let n=0;while(next())assert.ok(++n<2000,'Background work must settle.');};
  const advance=ms=>{const end=clock+ms;let n=0;while([...tasks.values()].some(t=>t.due<=end)){assert.ok(++n<2000);next();}clock=Math.max(clock,end);};
  return {pool,win,data,model,options,context,tasks,calls,steps,cancelled,next,flush,advance,spend:ms=>{clock+=ms;},now:()=>clock,documentHandlers,windowHandlers};
}

test('a settled segment warms both exact modes and never exposes a partially verified profile',async()=>{
  const v=fixture();v.context();assert.equal(v.pool.snapshot().pending,2);assert.equal(v.calls.length,0);
  v.advance(179);assert.equal(v.calls.length,0);v.advance(1);assert.equal(v.calls.length,1);
  assert.equal(v.pool.peek(v.options()),null);assert.equal(v.pool.snapshot().ready,0);
  v.flush();assert.deepEqual(v.calls.map(c=>[c.T,c.mode]),[[9,1],[9,2]]);
  assert.equal(v.pool.snapshot().ready,2);assert.equal(v.pool.snapshot().pending,0);
  assert.equal(await v.pool.request(v.options()),v.pool.peek(v.options()));assert.equal(v.calls.length,2);v.pool.destroy();
});

test('foreground demand promotes existing background work without restarting its iterator',async()=>{
  const v=fixture();v.context();v.advance(180);assert.equal(v.steps.length,4);
  const first=v.pool.request(v.options()),second=v.pool.request(v.options());
  v.next();assert.equal(v.calls.length,1);assert.equal(v.steps.length,4,'The partially completed first profile must not restart.');
  const a=await first,b=await second;assert.equal(a,b);assert.equal(v.pool.peek(v.options()),a);
  const promoted=v.pool.request(v.options(2));v.flush();assert.equal((await promoted).mode,2);assert.equal(v.calls.length,2);v.pool.destroy();
});

test('demand preempts speculative modes and bookmark requests keep their own exact endpoint',async()=>{
  const v=fixture();v.context();const demand=v.pool.request(v.options(2,7.2),{priority:'demand'});
  v.next();assert.equal(v.calls[0].T,7.2);assert.equal(v.calls[0].mode,2);assert.equal(v.pool.snapshot().position,9);
  v.flush();assert.equal((await demand).T,7.2);assert.ok(v.pool.peek(v.options(2,9)));v.pool.destroy();
});

test('foreground demand uses immediate user-visible tasks while speculative slices remain background priority',async()=>{
  const v=fixture();v.context();const demand=v.pool.request(v.options());
  const scheduled=[...v.tasks.values()][0];assert.equal(scheduled.kind,'task');assert.equal(scheduled.priority,'user-visible');assert.equal(scheduled.due,0,'Foreground work must not wait for an idle period or warmup delay.');
  v.next();await demand;assert.equal(v.pool.snapshot().ready,1);assert.equal(v.now(),5,'Foreground can use its 8ms slice to finish a 5ms test profile.');
  v.advance(175);assert.equal(v.calls.length,2);
  assert.ok([...v.tasks.values()].every(task=>task.kind==='task'&&task.priority==='background'),'Remaining speculative checkpoints keep background priority.');
  v.flush();v.pool.destroy();
});

test('established ownership rejects foreign work while same-owner bookmark endpoints remain valid',async()=>{
  const v=fixture();v.context();
  await assert.rejects(v.pool.request(v.options(1,9,{data:{...v.data}})),{name:'AbortError'});
  await assert.rejects(v.pool.request(v.options(1,9,{model:{}})),{name:'AbortError'});
  const reference=v.pool.request(v.options(2,7.2),{priority:'reference'});v.flush();assert.equal((await reference).T,7.2);v.pool.destroy();
  const initial=fixture(),first=initial.pool.request(initial.options());initial.flush();assert.equal((await first).T,9,'Legacy callers can demand a profile before the first app context arrives.');initial.pool.destroy();
});

test('pointer, playback, construction, and hidden-page pauses preserve partial work and yield to interaction',async()=>{
  for(const pause of ['pointer','playing','surgery','hidden']){
    const v=fixture();v.context();v.advance(180);const before=v.steps.length;
    if(pause==='pointer')v.pool.block('pointer held',true);
    else if(pause==='hidden'){v.win.document.hidden=true;v.documentHandlers.visibilitychange();}
    else v.context({[pause]:true});
    v.advance(1000);assert.equal(v.steps.length,before,pause+' must pause every checkpoint');assert.equal(v.tasks.size,0);
    if(pause==='pointer')v.pool.block('pointer held',false);
    else if(pause==='hidden'){v.win.document.hidden=false;v.documentHandlers.visibilitychange();}
    else v.context();
    v.advance(179);assert.equal(v.steps.length,before,'Speculation waits for a quiet interval after '+pause);
    v.flush();assert.equal(v.calls.length,2);assert.equal(v.pool.snapshot().ready,2);v.pool.destroy();
  }
});

test('a held traversal may finish only its requested exact mode in small slices',async()=>{
  const v=fixture({checkpoints:20});v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  v.advance(1000);assert.equal(v.calls.length,0,'A traversal hold still pauses all speculation.');
  const requested=v.pool.request(v.options(2));assert.equal(v.pool.snapshot().traversalHeld,true);assert.equal(v.pool.snapshot().blocked,false);
  const start=v.now();v.next();assert.equal(v.now()-start,4,'A requested mode gets the small background-sized slice while traversal is held.');
  assert.equal(v.steps.length,4);assert.equal(v.pool.peek(v.options(2)),null,'A partial held-traversal mode cannot be displayed.');
  v.flush();assert.equal((await requested).mode,2);assert.ok(v.pool.peek(v.options(2)));
  assert.deepEqual(v.calls.map(call=>call.mode),[2]);assert.equal(v.pool.peek(v.options(1)),null,'The other speculative mode must remain paused.');
  assert.equal(v.pool.snapshot().blocked,true,'With no requested work left, the held traversal pauses the remaining speculative job.');
  v.pool.block('traversal pointer held',false);v.flush();assert.ok(v.pool.peek(v.options(1)));v.pool.destroy();
});

test('cheap numerical checkpoints fill the held-traversal time budget without creating mostly empty timer slices',async()=>{
 const v=fixture({idle:false,checkpoints:10000,checkpointCost:.002});v.context();v.pool.block('traversal held',true,{allowDemand:true});
 const promised=v.pool.request(v.options(2)),start=v.now();v.next();
 assert.ok(v.steps.length>1900&&v.steps.length<=2048,'Cheap arithmetic can use the retained 4ms budget instead of stopping at 64 checkpoints.');
 assert.ok(v.now()-start>=4&&v.now()-start<4.003,'The same time budget, with at most one checkpoint of overrun, still governs each slice.');
 assert.equal(v.pool.peek(v.options(2)),null,'An unfinished mode is never published.');
 const completed=v.steps.length;v.pool.block('other pointer',true);v.advance(1000);assert.equal(v.steps.length,completed,'An unrelated drag still cancels the next numerical slice.');
 v.pool.block('other pointer',false);v.flush();assert.equal((await promised).mode,2);v.pool.destroy();
});

test('a nonadvancing scheduler clock still has a finite checkpoint guard and yields for cancellation',async()=>{
 const v=fixture({idle:false,checkpoints:10000,checkpointCost:0});v.context();
 const promised=v.pool.request(v.options(2));v.next();assert.equal(v.steps.length,2048);assert.equal(v.pool.peek(v.options(2)),null);
 v.pool.destroy();await assert.rejects(promised,{name:'AbortError'});assert.equal(v.tasks.size,0);
});

test('other gestures and hard lifecycle pauses override requested work during a traversal hold',async()=>{
  for(const pause of ['other pointer','playing','surgery','hidden']){
    const v=fixture({checkpoints:20});v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
    const requested=v.pool.request(v.options());v.next();const count=v.steps.length;
    if(pause==='other pointer')v.pool.block('pointer held',true);
    else if(pause==='hidden'){v.win.document.hidden=true;v.documentHandlers.visibilitychange();}
    else v.context({[pause]:true});
    v.advance(1000);assert.equal(v.steps.length,count,pause+' must stop even requested held-traversal work');
    assert.equal(v.pool.snapshot().blocked,true);
    if(pause==='other pointer')v.pool.block('pointer held',false);
    else if(pause==='hidden'){v.win.document.hidden=false;v.documentHandlers.visibilitychange();}
    else v.context();
    v.flush();assert.equal((await requested).mode,1);assert.equal(v.pool.peek(v.options(2)),null);v.pool.destroy();
  }
});

test('held-traversal supersession never publishes an older segment and noncurrent demands stay paused',async()=>{
  const v=fixture({checkpoints:20});v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const old=v.pool.request(v.options()),oldRejected=assert.rejects(old,{name:'AbortError'});v.next();
  v.context({position:9.2});await oldRejected;
  const bookmark=v.pool.request(v.options(1,7.2)),bookmarkRejected=assert.rejects(bookmark,{name:'AbortError'});
  const current=v.pool.request(v.options(2,9.2));v.flush();assert.equal((await current).T,9.2);
  assert.equal(v.pool.peek(v.options()),null);assert.equal(v.pool.peek(v.options(1,7.2)),null);
  assert.ok(v.calls.every(call=>call.T===9||call.T===9.2),'A noncurrent requested bookmark cannot jump ahead of the held traversal.');
  v.pool.destroy();await bookmarkRejected;
});

test('interactions postpone only speculative work; a demanded result can proceed once unblocked',async()=>{
  const v=fixture();v.context();v.advance(100);v.pool.interact();v.advance(179);assert.equal(v.calls.length,0);
  const demand=v.pool.request(v.options());v.next();assert.equal(v.calls.length,1);v.flush();await demand;v.pool.destroy();
});

test('context changes reject stale jobs and stale scheduled callbacks cannot modify the new segment',async()=>{
  for(const change of [{position:10},{data:{length:12,events:[],sampleAt(){}}},{model:{}},{active:false}]){
    const v=fixture({checkpoints:12});v.context();const promise=v.pool.request(v.options());const rejected=assert.rejects(promise,{name:'AbortError'});
    const stale=[...v.tasks.values()][0].fn;v.next();v.context(change);await rejected;
    const count=v.steps.length;stale({didTimeout:false,timeRemaining:()=>50});assert.equal(v.steps.length,count);
    v.flush();assert.equal(v.pool.peek(v.options()),null,'The old profile must never be published after supersession.');v.pool.destroy();
  }
});

test('canonical traversal roundtrips share one job while actual segment changes prepare new modes',()=>{
  const v=fixture(),T=9.1;v.context({position:T});v.context({position:T+8*Number.EPSILON});
  assert.equal(v.pool.snapshot().position,T);v.flush();assert.ok(v.calls.every(c=>c.T===T));
  v.context({position:T+.001});v.flush();assert.equal(v.calls.length,4);assert.equal(v.pool.snapshot().position,T+.001);v.pool.destroy();
});

test('completed and pending histories are bounded, and evicted modes recompute unchanged',async()=>{
  const v=fixture({maxEntries:2}),results=[];
  for(const T of [7,8,9]){const p=v.pool.request(v.options(1,T));v.flush();results.push(await p);assert.ok(v.pool.snapshot().ready<=2);}
  assert.equal(v.pool.peek(v.options(1,7)),null);const p=v.pool.request(v.options(1,7));v.flush();const again=await p;
  assert.notEqual(again,results[0]);assert.deepEqual(again,results[0]);
  const promises=[];v.pool.block('held',true);
  for(let i=0;i<20;i++)promises.push(v.pool.request(v.options(1,1+i/10)).catch(e=>e));
  assert.ok(v.pool.snapshot().pending<=4);v.pool.destroy();const settled=await Promise.all(promises);assert.ok(settled.every(e=>e.name==='AbortError'));assert.equal(v.tasks.size,0);
});

test('event validation applies to requests and cache hits and failures never publish a profile',async()=>{
  const v=fixture();const p=v.pool.request(v.options());v.flush();await p;
  assert.equal(v.pool.peek(v.options(1,9,{eventS:3})),await v.pool.request(v.options()));
  await assert.rejects(v.pool.request(v.options(1,9,{eventS:3.1})),RangeError);
  assert.throws(()=>v.pool.peek(v.options(1,9,{eventS:NaN})),RangeError);
  const failed=fixture({fail:true}),bad=failed.pool.request(failed.options());failed.flush();await assert.rejects(bad,/verification failed/);
  assert.equal(failed.pool.snapshot().ready,0);v.pool.destroy();failed.pool.destroy();
});

test('timer fallback and page lifecycle remain cancellable and destruction releases all retained work',async()=>{
  const v=fixture({idle:false});v.context();v.windowHandlers.pagehide();v.advance(1000);assert.equal(v.calls.length,0);
  v.windowHandlers.pageshow();v.flush();assert.equal(v.pool.snapshot().ready,2);
  const p=v.pool.request(v.options(1,8)),rejected=assert.rejects(p,{name:'AbortError'});v.pool.destroy();await rejected;
  assert.equal(v.pool.snapshot().ready,0);assert.equal(v.tasks.size,0);assert.equal(v.pool.peek(v.options()),null);
  await assert.rejects(v.pool.request(v.options()),{name:'AbortError'});
  assert.deepEqual(Object.keys(v.windowHandlers),[]);assert.deepEqual(Object.keys(v.documentHandlers),[]);
});

test('unsupported or rejected priority tasks fall back to cancellable timer slices',async()=>{
  for(const failure of ['throw','reject']){
    const v=fixture();v.win.scheduler.postTask=()=>{if(failure==='throw')throw Error('Unsupported scheduler');return Promise.reject(Error('Rejected scheduler'));};
    const p=v.pool.request(v.options());await Promise.resolve();
    assert.equal([...v.tasks.values()][0].kind,'timer');v.flush();assert.equal((await p).verified,true);v.pool.destroy();
  }
});

test('the shared scheduler preserves the exact verified real surface profile and displayed samples',async()=>{
  const H=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model);
  const options={data,model,T:10.671975511965978,type:'surface',mode:2},tasks=new Map();let serial=0,slices=0;
  const win={performance,setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);}};
  const pool=Preparation.create({window:win,prepareSteps:H.prepareSteps,budgetMs:4}),promised=pool.request(options);
  while(tasks.size){const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn();assert.ok(++slices<10000);}
  const prepared=await promised,original=H.prepare(options);assert.ok(slices>1,'Real verification must yield between work slices.');
  for(const amplitude of [-.12,-.037,0,.000001,.12]){
    assert.deepEqual(prepared.length(amplitude),original.length(amplitude));assert.deepEqual(prepared.energy(amplitude),original.energy(amplitude));
    assert.deepEqual(prepared.sample(amplitude),original.sample(amplitude));
  }
  for(const key of ['eigenvalue','rawEigenvalue','eigenError','status','maxAmplitude','root','meshIntervals'])assert.equal(prepared[key],original[key]);
  assert.equal(pool.peek(options),prepared);pool.destroy();
});

function stagedFixture({failCurrent=false}={}){
  const v=fixture();v.pool.destroy();const stages=[];
  function profile(options,A,referenceAmplitude,B=0){
    const length=(a,b=0)=>({baseline:options.T,length:options.T+a*a+b*b,delta:a*a+b*b,error:0,relativeChange:(a*a+b*b)/options.T,verified:true});
    return Object.freeze({T:options.T,type:options.type,mode:options.mode,root:options.type==='hidden'?options.mode*Math.PI/Math.sqrt(options.data.curvature??.36):options.data.events.filter(e=>e.surface)[options.mode-1]?.s,
      maxAmplitude:A===undefined?.12:0,...(A===undefined?{}:{rangePending:true,currentVerified:true,currentAmplitude:A,currentSecondAmplitude:B,currentRadius:Math.hypot(A,B),displayReferenceAmplitude:referenceAmplitude}),length,
      sample:(a,b=0)=>({points:[{s:0,point:[0,0,0]},{s:options.T,point:[options.T,a,b]}],length:length(a,b)})});
  }
  function* prepareBasisSteps(options){
    stages.push(['basis',options]);for(let i=0;i<100;i++){v.spend(1);yield;}
    return Object.freeze({
      *verifyCurrentSteps(A,{referenceAmplitude,B=0}){stages.push(['current',options,A,B]);v.spend(1);yield;v.spend(1);yield;if(failCurrent)throw Error('Current push invalid');return profile(options,A,referenceAmplitude,B);},
      *finishSteps(){stages.push(['full',options]);for(let i=0;i<100;i++){v.spend(1);yield;}return profile(options);}
    });
  }
  const pool=Preparation.create({window:v.win,prepareSteps:function*(){throw Error('The staged path must share its basis.');},prepareBasisSteps,quietMs:0});
  const context=(next={})=>pool.setContext({data:v.data,model:v.model,position:9,active:true,playing:false,surgery:false,...next});
  return {...v,pool,context,stages};
}

test('an exact current push finishes before full range verification and reuses its basis',async()=>{
  const v=stagedFixture();v.context();v.next();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const current=v.pool.requestCurrent(v.options(),-.08,{referenceAmplitude:.12});v.flush();const live=await current;
  assert.equal(live.maxAmplitude,0);assert.equal(live.currentAmplitude,-.08);assert.equal(live.rangePending,true);assert.equal(live.currentVerified,true);
  assert.equal(v.pool.peek(v.options()),null);assert.ok(!v.stages.some(s=>s[0]==='full'),'A held traversal must not run slider-range checks.');
  const steps=v.stages.length;assert.equal(await v.pool.requestCurrent(v.options(),-.08,{referenceAmplitude:.12}),live);assert.equal(v.stages.length,steps);
  const full=v.pool.request(v.options(),{priority:'reference'});v.pool.block('traversal pointer held',false);v.flush();const verified=await full;
  assert.equal(verified.maxAmplitude,.12);assert.equal(verified.rangePending,undefined);assert.deepEqual(verified.sample(-.08),live.sample(-.08));
  assert.equal(v.stages.filter(s=>s[0]==='basis'&&s[1].mode===1).length,1,'Current and full results must share one exact eigenproblem.');
  assert.equal(v.pool.peek(v.options()),verified);v.pool.destroy();
});

test('current-push cancellation rejects stale demands without publishing a profile or range',async()=>{
  const v=stagedFixture();v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const current=v.pool.requestCurrent(v.options(),.08),rejected=assert.rejects(current,{name:'AbortError'});v.next();
  v.context({position:10});await rejected;assert.equal(v.pool.peek(v.options()),null);assert.equal(v.pool.snapshot().ready,0);
  const next=v.pool.requestCurrent(v.options(2,10),.04);v.flush();assert.equal((await next).T,10);assert.equal(v.pool.peek(v.options(2,10)),null);
  v.pool.destroy();
});

test('a failed current push does not certify its range or poison the later full verification',async()=>{
  const v=stagedFixture({failCurrent:true});v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const bad=v.pool.requestCurrent(v.options(),.08),rejected=assert.rejects(bad,/Current push invalid/);v.flush();await rejected;
  assert.equal(v.pool.snapshot().ready,0);const full=v.pool.request(v.options(),{priority:'reference'});
  v.pool.block('traversal pointer held',false);v.flush();assert.equal((await full).maxAmplitude,.12);v.pool.destroy();
});

test('rapid current-amplitude requests keep a bounded queue and reject superseded pushes',async()=>{
  const v=stagedFixture();v.context();v.pool.block('held',true);const promises=[];
  for(let i=1;i<=12;i++)promises.push(v.pool.requestCurrent(v.options(),i*.005).catch(e=>e));
  assert.equal(v.pool.snapshot().jobs.find(job=>job.mode===1).current,4);
  v.pool.destroy();assert.ok((await Promise.all(promises)).every(error=>error.name==='AbortError'));
});

test('hidden current preparation verifies the selected second coordinate before checking the full radial range',async()=>{
  const v=stagedFixture();v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const options=v.options(1,9,{type:'hidden'}),promise=v.pool.requestCurrent(options,0,{B:.08,referenceAmplitude:.12});
  v.flush();const current=await promise;
  assert.equal(current.type,'hidden');assert.equal(current.currentAmplitude,0);assert.equal(current.currentSecondAmplitude,.08);assert.equal(current.currentRadius,.08);
  assert.equal(current.maxAmplitude,0);assert.equal(v.pool.peek(options),null);
  assert.deepEqual(v.stages.filter(stage=>stage[0]==='current').map(stage=>stage.slice(2)),[[0,.08]]);
  assert.ok(!v.stages.some(stage=>stage[0]==='full'),'Held traversal never starts full radial verification.');
  assert.equal(await v.pool.requestCurrent(options,0,{B:.08,referenceAmplitude:.12}),current);
  const other=v.pool.requestCurrent(options,.03,{B:0,referenceAmplitude:.12});v.flush();assert.equal((await other).currentRadius,.03);
  assert.equal(v.stages.filter(stage=>stage[0]==='basis'&&stage[1].type==='hidden').length,1,'Both exact pushes share the same mode basis.');
  const full=v.pool.request(options,{priority:'reference'});v.pool.block('traversal pointer held',false);v.flush();assert.equal((await full).maxAmplitude,.12);v.pool.destroy();
});

test('the displayed hidden push finishes its slider range before unused surface warmups',async()=>{
  const v=stagedFixture();v.context();v.pool.block('traversal pointer held',true,{allowDemand:true});
  const options=v.options(1,9,{type:'hidden'}),current=v.pool.requestCurrent(options,0,{B:.08});v.flush();await current;
  assert.equal(v.pool.snapshot().jobs.filter(job=>job.priority===1).length,2,'The two surface modes remain speculative.');
  const range=v.pool.request(options,{priority:'reference'});v.pool.block('traversal pointer held',false);v.flush();await range;
  assert.deepEqual(v.stages.filter(stage=>stage[0]==='full').map(stage=>stage[1].type),['hidden','surface','surface']);v.pool.destroy();
});

test('hidden current requests validate their full radius and cancel stale second-direction work',async()=>{
  const v=stagedFixture();v.context();v.pool.block('held',true,{allowDemand:true});
  await assert.rejects(v.pool.requestCurrent(v.options(),0,{B:.02}),/one push coordinate/);
  await assert.rejects(v.pool.requestCurrent(v.options(1,9,{type:'hidden'}),.1,{B:.1}),/finite current push/);
  await assert.rejects(v.pool.requestCurrent(v.options(1,9,{type:'hidden'}),0,{B:NaN}),/finite current push/);
  const pending=v.pool.requestCurrent(v.options(1,9,{type:'hidden'}),0,{B:.08}),cancelled=assert.rejects(pending,{name:'AbortError'});v.next();
  v.context({position:10});await cancelled;
  const next=v.pool.requestCurrent(v.options(1,10,{type:'hidden'}),0,{B:.04});v.flush();const current=await next;
  assert.equal(current.T,10);assert.equal(current.currentSecondAmplitude,.04);assert.equal(v.pool.peek(v.options(1,9,{type:'hidden'})),null);v.pool.destroy();
});

test('real current-first preparation matches the full calculation at exactly the requested push',async()=>{
  const H=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978,A=-.08;
  const options={data,model,T,type:'surface',mode:2},tasks=new Map();let serial=0;
  const win={performance,setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);}};
  const pool=Preparation.create({window:win,prepareSteps:H.prepareSteps,prepareBasisSteps:H.prepareBasisSteps,quietMs:0});
  pool.setContext({data,model,position:T,active:true});pool.block('traversal pointer held',true,{allowDemand:true});
  const promised=pool.requestCurrent(options,A,{referenceAmplitude:.12});
  function flush(){let count=0;while(tasks.size){const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn();assert.ok(++count<10000);}}
  flush();const current=await promised,full=H.prepare(options);
  assert.deepEqual(current.sample(A),full.sample(A));assert.deepEqual(current.length(A),full.length(A));assert.deepEqual(current.energy(A),full.energy(A));
  assert.throws(()=>current.length(.03),RangeError);assert.equal(current.maxAmplitude,0);assert.equal(pool.peek(options),null);
  for(const s of [0,T*.25,T*.5,T])assert.deepEqual(current.displaySampleAt(A,0,s),full.displaySampleAt(A,0,s));
  const completed=pool.request(options,{priority:'reference'});pool.block('traversal pointer held',false);flush();
  assert.deepEqual((await completed).length(A),full.length(A));pool.destroy();
});

test('real hidden current-first preparation preserves exact length in either selected direction',async()=>{
  const H=require('./downhill.js'),S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js');
  const model=S.getModel('double'),data=J.prepare(D.curves.find(c=>c.id==='showcase-neck-return'),model),T=10.671975511965978,A=.09;
  const options={data,model,T,type:'hidden',mode:2},tasks=new Map();let serial=0;
  const win={performance,setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);}};
  const pool=Preparation.create({window:win,prepareSteps:H.prepareSteps,prepareBasisSteps:H.prepareBasisSteps,quietMs:0});
  pool.setContext({data,model,position:T,active:true});pool.block('traversal pointer held',true,{allowDemand:true});
  const promise=pool.requestCurrent(options,0,{B:A,referenceAmplitude:.12});
  function flush(){let count=0;while(tasks.size){const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn();assert.ok(++count<10000);}}
  flush();const current=await promise,full=H.prepare(options);
  assert.equal(current.currentRadius,A);assert.equal(current.currentSecondAmplitude,A);assert.equal(current.maxAmplitude,0);assert.equal(pool.peek(options),null);
  const drain=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;},basis=drain(H.prepareBasisSteps(options)),exact=drain(basis.verifyCurrentSteps(0,{B:A,referenceAmplitude:.12}));
  for(const [a,b]of [[0,A],[A,0]]){
    assert.deepEqual(current.length(a,b),exact.length(a,b));assert.deepEqual(current.energy(a,b),exact.energy(a,b));assert.deepEqual(current.sample(a,b),exact.sample(a,b));
    // The historical full profile rounds metric cache keys after sampling its
    // slider range; an adjacent IEEE coefficient can differ below roundoff.
    assert.equal(current.length(a,b).length,full.length(a,b).length);
    for(const method of ['length','energy'])for(const field of ['delta','error','relativeChange'])assert.ok(Math.abs(current[method](a,b)[field]-full[method](a,b)[field])<1e-15);
    assert.deepEqual(current.sample(a,b).points,full.sample(a,b).points);
    for(const s of [0,T*.25,T*.5,T])assert.deepEqual(current.displaySampleAt(a,b,s),full.displaySampleAt(a,b,s));
  }
  assert.throws(()=>current.sample(0,.08),RangeError);assert.throws(()=>current.length(.08,0),RangeError);
  const completed=pool.request(options,{priority:'reference'});pool.block('traversal pointer held',false);flush();
  assert.deepEqual((await completed).length(0,A),full.length(0,A));assert.equal(pool.peek(options).maxAmplitude,full.maxAmplitude);pool.destroy();
});
