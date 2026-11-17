/* Exact surface preparation profiler. Run with --timer-floor 4 to isolate
 * checkpoint scheduling overhead under a clamped timer fallback. This is a
 * controlled comparison, not a claim about a particular browser's frame rate. */
'use strict';
const {performance}=require('node:perf_hooks'),path=require('node:path');
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
if(args.includes('--help')){console.log('node profile-mode-preparation.cjs [--runs 3] [--timer-floor 4] [--baseline-service /path/file.js] [--baseline-math /path/file.js]');process.exit(0);}
const runs=Number(value('--runs')||3),floor=Number(value('--timer-floor')||0);
if(!Number.isSafeInteger(runs)||runs<1||runs>10||!Number.isFinite(floor)||floor<0||floor>20)throw RangeError('Choose 1–10 runs and a timer floor of 0–20 ms.');
const H=require(value('--baseline-math')?path.resolve(value('--baseline-math')):'./downhill.js');
const Preparation=require(value('--baseline-service')?path.resolve(value('--baseline-service')):'./downhill-preparation.js');
const S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js'),P=require('./presentation-data.js');
function drain(steps){let p;do{p=steps.next();}while(!p.done);return p.value;}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)],rows=[];
async function run(options){
 let tasks=0,sliceMs=0,maximumSliceMs=0;
 const win={performance,setTimeout(fn,delay=0){tasks++;return setTimeout(()=>{const start=performance.now();fn();const elapsed=performance.now()-start;sliceMs+=elapsed;maximumSliceMs=Math.max(maximumSliceMs,elapsed);},Math.max(floor,delay));},clearTimeout,document:{hidden:false}};
 const pool=Preparation.create({window:win,prepareSteps:H.prepareSteps,prepareBasisSteps:H.prepareBasisSteps});
 pool.setContext({data:options.data,model:options.model,position:options.T,active:false});
 pool.block('profile traversal',true,{allowDemand:true});
 const start=performance.now(),profile=await pool.requestCurrent(options,.12),currentMs=performance.now()-start;
 pool.destroy();const sampleStart=performance.now();profile.sample(.12,0);const sampleMs=performance.now()-sampleStart;
 return {currentMs,tasks,sliceMs,maximumSliceMs,sampleMs};
}
(async()=>{
 for(const [surface,curve,Ts]of [['double',D.curves.find(c=>c.id==='showcase-neck-return'),[6,12]],['triple',P.stages.triple.curves.at(-1),[30]]]){
  const model=S.getModel(surface),data=J.prepare(curve,model);
  for(const T of Ts)for(const mode of [1,2]){
   const options={data,model,T,type:'surface',mode},measurements=[];
   for(let i=0;i<runs;i++){
    const started=performance.now(),basis=drain(H.prepareBasisSteps(options)),basisMs=performance.now()-started;
    const currentStart=performance.now();drain(basis.verifyCurrentSteps(.12));const verifyMs=performance.now()-currentStart;
    measurements.push({basisMs,verifyMs,...await run(options)});
   }
   rows.push({surface,T,mode,runs,...Object.fromEntries(Object.keys(measurements[0]).map(key=>[key,median(measurements.map(m=>m[key]))]))});
  }
 }
 console.log(JSON.stringify({timerFloorMs:floor,description:'Median exact current-push preparation. currentMs includes cooperative scheduling; sliceMs is synchronous work in callbacks; sampleMs is the later physical display sampling.',rows},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
