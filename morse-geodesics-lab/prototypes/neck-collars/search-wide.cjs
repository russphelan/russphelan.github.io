'use strict';
// Isolated parameter study. This never writes production geometry or catalogues.
// Reproduce all stages in order: node search-wide.cjs, then the same command
// with --bias-only, then --smooth-finalists. Each later stage appends its report.
const fs=require('node:fs'),path=require('node:path');
const G=require('./geometry.js'),D=require('./diagnostics.js');
const angles=[0,Math.PI/4,Math.PI/2,Math.PI,3*Math.PI/2,3.42];
if(process.argv.includes('--bias-only')){runBiasSearch();process.exit(0);}
if(process.argv.includes('--smooth-finalists')){runSmoothFinalists();process.exit(0);}
function scan(profile,nx=32,nt=24){
  const [a,b]=G.domain(profile);let maximum=0,minRadius=Infinity,maxRadius=0,maxOvershoot=0,minUndershoot=0;
  try{
    for(let j=0;j<nt;j++){
      const theta=2*Math.PI*j/nt,edge=G.torusRadius(profile.seamX,theta).r;
      const lower=Math.min(edge,profile.neckRadius),upper=Math.max(edge,profile.neckRadius);
      for(let i=0;i<=nx;i++){
        const q=G.evaluate(profile,a+(b-a)*i/nx,theta),k=Math.max(...q.principal.map(Math.abs));
        if(!Number.isFinite(k))throw Error('Nonfinite curvature');
        maximum=Math.max(maximum,k);minRadius=Math.min(minRadius,q.radius);maxRadius=Math.max(maxRadius,q.radius);
        maxOvershoot=Math.max(maxOvershoot,q.radius-upper);minUndershoot=Math.max(minUndershoot,lower-q.radius);
      }
    }
    return {maxPrincipal:maximum,minRadius,maxRadius,maxOvershoot,minUndershoot};
  }catch(error){return {maxPrincipal:Infinity,error:error.message};}
}
function profileFor(seamX,length,spacing,neckRadius){
  return G.createProfile({id:`wide-${neckRadius}-${seamX}-${length}-${spacing}`,seamX,collarEnd:seamX+length,spacing,neckRadius});
}
const candidates=[];let rejected=0;
for(const neckRadius of [.45,.50,.55,.60,.65,.70,.75,.80,.90,1.0])
for(const seamX of [1.0,1.05,1.10,1.15,1.20,1.25,1.30,1.35,1.40,1.45,1.50])
for(const length of [.6,.7,.8,.9,1.0,1.1,1.2,1.3,1.4])
for(const spacing of [4.5,5,5.5,6]){
  if(2*(seamX+length)>spacing+1e-10)continue;
  const p=profileFor(seamX,length,spacing,neckRadius),coarse=scan(p);
  if(!Number.isFinite(coarse.maxPrincipal)){rejected++;continue;}
  candidates.push({profile:p,coarse});
}
// A second, denser parameter grid resolves the compact low-curvature basin.
// This remains parameter selection, separate from the final spatial refinement.
for(let ir=0;ir<=7;ir++)for(let ia=0;ia<=7;ia++)for(let il=0;il<=9;il++){
  const neckRadius=Number((.60+.02*ir).toFixed(2)),seamX=Number((1.14+.02*ia).toFixed(2)),length=Number((.82+.02*il).toFixed(2)),spacing=4.5;
  if(2*(seamX+length)>spacing)continue;
  const p=profileFor(seamX,length,spacing,neckRadius),coarse=scan(p);
  if(!Number.isFinite(coarse.maxPrincipal)){rejected++;continue;}
  candidates.push({profile:p,coarse});
}
candidates.sort((a,b)=>a.coarse.maxPrincipal-b.coarse.maxPrincipal);
// Preserve several design tradeoffs rather than only near-duplicate minima.
const selected=[];
for(const subset of [candidates,candidates.filter(c=>c.profile.spacing===4.5),candidates.filter(c=>c.profile.neckRadius>=.7),candidates.filter(c=>c.profile.neckRadius>=.9)]){
  for(const c of subset.slice(0,8))if(!selected.some(s=>s.profile.id===c.profile.id))selected.push(c);
}
const refined=[];
for(const candidate of selected){
  const profile=candidate.profile,fine=D.scanCurvature(G,profile,{nx:160,ntheta:96}),shape=scan(profile,160,96),probes=[];
  for(const theta of angles)for(const direction of [1,2]){
    const raw=D.sampleProbe(G,profile,{theta,direction,count:800,safety:false}),safe=D.sampleProbe(G,profile,{theta,direction,count:800,safety:true});
    probes.push({theta,direction,raw:raw.metrics,safe:safe.metrics});
  }
  const row={profile,coarse:candidate.coarse,fine:{maxPrincipal:fine.maxPrincipal,maxAbsGaussian:fine.maxAbsGaussian,where:fine.where},shape,
    minRawForward:Math.min(...probes.map(p=>p.raw.minForward)),minRawSpeed:Math.min(...probes.map(p=>p.raw.minSpeed)),
    minSafeGain:Math.min(...probes.map(p=>p.safe.appliedGain)),probes};
  refined.push(row);process.stdout.write(JSON.stringify({profile,peak:fine.maxPrincipal,minRawForward:row.minRawForward,minSafeGain:row.minSafeGain,shape})+'\n');
}
refined.sort((a,b)=>a.fine.maxPrincipal-b.fine.maxPrincipal);
const report={scope:'Search of C2 Hermite radial collar prototypes; no production data changed.',
  caveat:'Largest sampled/refined curvature, not a certified bound. Matched comparison fields are not recomputed geodesics, Jacobi fields, or Hessian modes.',
  settings:{radii:[.45,.50,.55,.60,.65,.70,.75,.80,.90,1.0],compactRefinement:{radii:'.60:.02:.74',seams:'1.14:.02:1.28',lengths:'.82:.02:1.00',spacing:4.5},coarse:{nx:32,ntheta:24},fine:{nx:160,ntheta:96},angles,amplitude:.12,gain:3},
  candidateCount:candidates.length,rejected,coarseBest:candidates.slice(0,50),refined};
fs.writeFileSync(path.join(__dirname,'search-wide-results.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({candidateCount:candidates.length,rejected,best:refined.slice(0,6).map(q=>({profile:q.profile,peak:q.fine.maxPrincipal,minForward:q.minRawForward,minSafeGain:q.minSafeGain,shape:q.shape}))})+'\n');

function runBiasSearch(){
  const thetaGrid=[0,.025,.05,.075,.1,.125,.15,.175,.2,.225,.25,.275,.3,.35,.4,.45,.5,.6,.7,.8,1,1.2,1.4,Math.PI/2];
  function score(p){
    let maximum=0,minimum=Infinity;
    try{
      for(const theta of thetaGrid)for(let i=0;i<=48;i++){
        const q=G.evaluate(p,p.seamX+(p.collarEnd-p.seamX)*i/48,theta);
        maximum=Math.max(maximum,...q.principal.map(Math.abs));minimum=Math.min(minimum,q.radius);
      }
    }catch(_){return {maximum:Infinity,minimum:0};}
    return {maximum,minimum};
  }
  const bases=[{neckRadius:.65,seamX:1.2,collarEnd:2.1,spacing:4.5},
    {neckRadius:.70,seamX:1.2,collarEnd:2.1,spacing:4.5},
    {neckRadius:.80,seamX:1.15,collarEnd:2.15,spacing:4.5},
    {neckRadius:.90,seamX:1.1,collarEnd:2.1,spacing:4.5}];
  const final=[];
  for(const base of bases){
    const rows=[];
    for(let ib=0;ib<=20;ib++)for(let ia=0;ia<=20;ia++){
      const radialBias=Number((-.15+.015*ib).toFixed(3)),angularBias=Number((-.15+.015*ia).toFixed(3));
      const p=G.createProfile({...base,radialBias,angularBias,id:'bias-'+[base.neckRadius,radialBias,angularBias].join('-')});
      const coarse=score(p);if(Number.isFinite(coarse.maximum))rows.push({profile:p,coarse});
    }
    rows.sort((a,b)=>a.coarse.maximum-b.coarse.maximum);
    const refined=[];
    for(const c of rows.slice(0,5)){
      const p=c.profile,s=D.scanCurvature(G,p,{nx:320,ntheta:192}),shape=scan(p,160,96),probes=[];
      for(const theta of angles)for(const direction of [1,2]){
        const raw=D.sampleProbe(G,p,{theta,direction,count:800,safety:false}),safe=D.sampleProbe(G,p,{theta,direction,count:800,safety:true});
        probes.push({theta,direction,raw:raw.metrics,safe:safe.metrics});
      }
      const row={profile:p,coarse:c.coarse,fine:{maxPrincipal:s.maxPrincipal,maxAbsGaussian:s.maxAbsGaussian,where:s.where},shape,
        minRawForward:Math.min(...probes.map(q=>q.raw.minForward)),minRawSpeed:Math.min(...probes.map(q=>q.raw.minSpeed)),minSafeGain:Math.min(...probes.map(q=>q.safe.appliedGain)),probes};
      refined.push(row);process.stdout.write(JSON.stringify({profile:p,peak:s.maxPrincipal,minForward:row.minRawForward,minSafeGain:row.minSafeGain,shape})+'\n');
    }
    refined.sort((a,b)=>a.fine.maxPrincipal-b.fine.maxPrincipal);final.push({base,coarseBest:rows.slice(0,8),refined});
  }
  const output=path.join(__dirname,'search-wide-results.json'),report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
  report.biasSearch={parameterRange:'radial/angular bias -.15:.015:.15; endpoint-flat 64 t^3(1-t)^3 correction',thetaGrid,xIntervals:48,families:final};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}

function runSmoothFinalists(){
  const bases=[{neckRadius:.65,seamX:1.2,collarEnd:2.1,spacing:4.5,radialBias:.015,angularBias:-.03},
    {neckRadius:.70,seamX:1.2,collarEnd:2.1,spacing:4.5,radialBias:.03,angularBias:-.045},
    {neckRadius:.80,seamX:1.15,collarEnd:2.15,spacing:4.5,radialBias:.03,angularBias:-.045},
    {neckRadius:.90,seamX:1.1,collarEnd:2.1,spacing:4.5,radialBias:0,angularBias:-.015}];
  const rows=[];
  for(const base of bases)for(const smoothing of [.025,.04]){
    const p=G.createProfile({...base,smoothing,id:'smooth-wide-'+base.neckRadius+'-'+smoothing}),fine=D.scanCurvature(G,p,{nx:320,ntheta:192});
    let stripMaximum=0,where=null;
    for(const [a,b]of [[p.seamX,p.seamX+smoothing],[p.collarEnd-smoothing,p.collarEnd]])for(let i=0;i<=160;i++)for(let j=0;j<192;j++){
      const x=a+(b-a)*i/160,theta=2*Math.PI*j/192,q=G.evaluate(p,x,theta),value=Math.max(...q.principal.map(Math.abs));
      if(value>stripMaximum){stripMaximum=value;where={x,theta};}
    }
    const probes=[];
    for(const theta of angles)for(const direction of [1,2]){
      const raw=D.sampleProbe(G,p,{theta,direction,count:1600,safety:false}),safe=D.sampleProbe(G,p,{theta,direction,count:1600,safety:true});
      probes.push({theta,direction,raw:raw.metrics,safe:safe.metrics});
    }
    const row={profile:p,maxPrincipal:Math.max(fine.maxPrincipal,stripMaximum),gridAndRefinedPeak:fine.maxPrincipal,stripMaximum,stripWhere:where,maxAbsGaussian:fine.maxAbsGaussian,
      minRawForward:Math.min(...probes.map(q=>q.raw.minForward)),minRawSpeed:Math.min(...probes.map(q=>q.raw.minSpeed)),minSafeGain:Math.min(...probes.map(q=>q.safe.appliedGain)),shape:scan(p,160,96),probes};
    rows.push(row);process.stdout.write(JSON.stringify({...row,probes:undefined})+'\n');
  }
  const output=path.join(__dirname,'search-wide-results.json'),report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
  report.smoothedFinalists={description:'C-infinity endpoint windows; 160x192 dense strips at both left joins in addition to 320x192 whole-domain curvature grid/refinement.',rows};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
