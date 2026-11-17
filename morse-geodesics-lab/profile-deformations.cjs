/* Drawing-only profiler; numerical preparation and full-range validation are
 * excluded from the measured time. Run with the same Node/browser workload
 * for comparisons. No timing is used as a correctness assertion.
 *
 * node profile-deformations.cjs [--runs 3] [--type surface] [--endpoints 12,30]
 *                             [--baseline-dir /path/to/sources]
 * A baseline directory contains prior app.js, hidden-push-display.js and
 * surface-push-display.js. Mathematical data and math code remain current.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const S=require('./surface.js'),J=require('./jacobi.js'),D=require('./showcase-data.js'),P=require('./presentation-data.js');
const H=require('./downhill.js'),Sampling=require('./deformation-sampling.js'),Tube=require('./deformation-tube.js'),Field=require('./variation-field.js');
const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
if(args.includes('--help')){
  console.log('node profile-deformations.cjs [--runs 3] [--type surface|hidden] [--endpoints 12,30] [--baseline-dir /path/to/prior/drawing/sources]');process.exit(0);
}
const runs=Number(value('--runs')||3),baseline=value('--baseline-dir'),selectedType=value('--type');
const selectedEndpoints=value('--endpoints')?.split(',').map(Number);
if(!Number.isSafeInteger(runs)||runs<1||runs>20)throw RangeError('Choose 1–20 repetitions.');
if(selectedType&&!['surface','hidden'].includes(selectedType))throw RangeError('Choose surface or hidden.');
if(selectedEndpoints?.some(T=>!Number.isFinite(T)||T<=0))throw RangeError('Choose positive finite endpoints.');
function displayModule(name){
  if(!baseline)return require('./'+name);
  // Compile both versions in the host realm: a separate VM realm changes
  // array/callback optimization and makes timing comparisons misleading.
  const loaded={exports:{}};
  new Function('module','exports','require',fs.readFileSync(path.join(baseline,name),'utf8'))(loaded,loaded.exports,require);
  return loaded.exports;
}
const Hidden=displayModule('hidden-push-display.js'),Surface=displayModule('surface-push-display.js');
const app=fs.readFileSync(path.join(baseline||__dirname,'app.js'),'utf8'),a=app.indexOf('  function hiddenDisplayGeometry('),b=app.indexOf('  function drawDownhillGL(',a);
if(a<0||b<=a)throw Error('The drawing implementation was not located.');
const clearStart=app.indexOf('  function clearDownhillGPU('),clearEnd=app.indexOf('  function hiddenStudyContext(',clearStart);
if(clearStart<0||clearEnd<=clearStart)throw Error('The drawing lifecycle implementation was not located.');
const drawingSource=app.slice(clearStart,clearEnd)+app.slice(a,b),rows=[];
function drain(steps){let p;do{p=steps.next();}while(!p.done);return p.value;}
function countedModel(actual){
  const counts={},model={...actual};
  for(const name of ['normal','jet','project'])model[name]=(...args)=>{counts[name]=(counts[name]||0)+1;return actual[name](...args);};
  return {model,reset(){for(const k of Object.keys(counts))delete counts[k];},counts};
}
function renderer(model){
  const context={downhillDisplayStudy:null,downhillDisplay:null,model:()=>model,focusData:null,downhillStudy:null,
    downhillReferenceData:null,downhillReferenceT:null,downhillOriginalGPU:null,downhillPathGPU:null,downhillGuidesGPU:null,
    upload:(positions,normals)=>({positions,normals}),removeGPU(){},
    window:{GeodesicDownhill:H,GeodesicHiddenPushDisplay:Hidden,GeodesicSurfacePushDisplay:Surface,
      GeodesicDeformationSampling:Sampling,GeodesicDeformationTube:Tube,GeodesicVariationField:Field}};
  context.activeDownhill=()=>context.downhillStudy;
  vm.runInNewContext(drawingSource,context);
  const draw=study=>context.deformationDisplayGeometry(study);
  draw.firstFrame=study=>{context.downhillStudy=study;context.focusData=study.data;return context.downhillBuffers();};
  return draw;
}
function measure(draw,study,counted){
  counted.reset();let started=performance.now();const display=draw(study),drawingMs=performance.now()-started;
  const calls={...counted.counts};started=performance.now();
  const tube=Tube.build(display.points,{lift:study.type==='surface'?.007:0,
    liftNormals:study.type==='surface'?display.normals:undefined,initialNormal:display.normals?.[0]});
  return {drawingMs,tubeMs:performance.now()-started,calls,points:display.points.length,
    evaluations:display.diagnostics.evaluations,tubeVertices:tube.positions.length/3,
    arrowVertices:display.field.positions.length/3,bandVertices:display.field.band.positions.length/3};
}
for(const [surface,curve,endpoints]of [['double',D.curves.find(c=>c.id==='showcase-neck-return'),[3,6,10,12]],
  ['triple',P.stages.triple.curves.at(-1),[20,30]]]){
  const counted=countedModel(S.getModel(surface)),data=J.prepare(curve,counted.model);
  for(const T of endpoints)for(const type of ['hidden','surface'])for(const mode of [1,2])for(const direction of type==='hidden'?[1,2]:[1]){
    if(selectedType&&type!==selectedType||selectedEndpoints&&!selectedEndpoints.includes(T))continue;
    const cold=[],upgrade=[],firstFrame=[];
    for(let run=0;run<runs;run++){
      const basis=drain(H.prepareBasisSteps({data,model:counted.model,T,type,mode})),amplitude=direction===2?[0,.12]:[.12,0];
      const current=drain(basis.verifyCurrentSteps(amplitude[0],{B:amplitude[1],referenceAmplitude:.12}));
      const study={active:true,data,T,type,mode,hiddenDirection:direction,profile:current,amplitude,result:current.sample(...amplitude)};
      const draw=renderer(counted.model);cold.push(measure(draw,study,counted));
      const full=drain(basis.finishSteps());
      // Full verification may reduce the range; a smaller range changes the
      // drawing preflight, so a cache hit is neither requested nor expected.
      const cap=full.maxAmplitude,A=Math.min(.12,cap),nextAmplitude=direction===2?[0,A]:[A,0];
      upgrade.push(measure(draw,{...study,profile:full,amplitude:nextAmplitude,result:full.sample(...nextAmplitude)},counted));
      // A separate newly prepared basis keeps this whole first-frame measure
      // cold. It includes both independent adaptive samplers, both path tubes
      // and the variation arrows/band; uploads are plain in-memory stubs.
      const freshBasis=drain(H.prepareBasisSteps({data,model:counted.model,T,type,mode}));
      const fresh=drain(freshBasis.verifyCurrentSteps(amplitude[0],{B:amplitude[1],referenceAmplitude:.12}));
      const freshStudy={...study,profile:fresh,result:fresh.sample(...amplitude)},freshDraw=renderer(counted.model);
      counted.reset();const started=performance.now(),buffers=freshDraw.firstFrame(freshStudy);
      firstFrame.push({totalMs:performance.now()-started,calls:{...counted.counts},
        referenceTubeVertices:buffers.reference.positions.length/3,deformedTubeVertices:buffers.deformed.positions.length/3,
        arrowVertices:buffers.guides.positions.length/3,bandVertices:buffers.guides.band.positions.length/3});
    }
    const median=values=>values.slice().sort((x,y)=>x-y)[Math.floor(values.length/2)],summarize=values=>({
      drawingMs:median(values.map(v=>v.drawingMs)),tubeMs:median(values.map(v=>v.tubeMs)),calls:values[0].calls,
      points:values[0].points,evaluations:values[0].evaluations,tubeVertices:values[0].tubeVertices,
      arrowVertices:values[0].arrowVertices,bandVertices:values[0].bandVertices});
    rows.push({surface,curve:curve.id,T,type,mode,direction,runs,cold:summarize(cold),fullUpgrade:summarize(upgrade),
      firstFrame:{...firstFrame[0],totalMs:median(firstFrame.map(v=>v.totalMs))}});
  }
}
console.log(JSON.stringify({description:'Median drawing time, excluding mathematical preparation and physical lengths. cold measures the deformation alone; firstFrame measures reference plus deformation with mesh construction; fullUpgrade reuses one prepared basis.',baseline:baseline||null,rows},null,2));
