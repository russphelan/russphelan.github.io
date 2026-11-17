'use strict';
// Isolated height-constrained search. No production geometry or catalogue writes.
const fs=require('node:fs'),path=require('node:path');
const G=require('./geometry.js'),D=require('./diagnostics.js');
const height=.45,angles=[0,Math.PI/8,Math.PI/4,3*Math.PI/8,Math.PI/2,3.42];
// Retain exact finalist geometry even if the coarse-search report is regenerated.
// Local grid/coordinate-search settings are recorded in the report; this script
// reruns the coarse search and the finalist audits, not those historical passes.
const FINALIST_SPECS=Object.freeze([
  {id:'broad-early',seamX:.94,collarEnd:1.89,spacing:5.5,halfWidth:1.05,sourceAdvance:.36},
  {id:'broad-opt',seamX:.905,collarEnd:1.93625,spacing:5.5,halfWidth:1.01875,sourceAdvance:.373125},
  {id:'compact',seamX:.94,collarEnd:1.89,spacing:4,halfWidth:1.05,sourceAdvance:.36},
  {id:'narrow',seamX:1,collarEnd:2.2,spacing:5,halfWidth:.6,sourceAdvance:.48}
].map(p=>Object.freeze({...p,halfHeight:.45,capSoftness:.015,smoothing:.04})));
if(process.argv.includes('--audit-finalists')){auditFinalists();process.exit(0);}
if(process.argv.includes('--bounded')){runBounded();process.exit(0);}
const angularGrid=[0,.025,.05,.075,.1,.125,.15,.175,.2,.225,.25,.275,.3,.35,.4,.45,.5,.6,.7,.8,.9,1,1.1,1.2,1.3,1.4,1.5,Math.PI/2];
function shape(profile,nx=48){
  let peak=0,maxHeight=profile.neckRadius,minRadius=Infinity,maxWidth=0,heightWhere=null;
  // Reject the common vertical overshoot before spending a full curvature scan.
  for(let i=0;i<=nx;i++){
    const x=profile.seamX+(profile.collarEnd-profile.seamX)*i/nx,p=G.evaluate(profile,x,Math.PI/2);
    if(p.point[2]>height+2e-9)return null;
  }
  for(const theta of angularGrid)for(let i=0;i<=nx;i++){
    const x=profile.seamX+(profile.collarEnd-profile.seamX)*i/nx,p=G.evaluate(profile,x,theta),z=Math.abs(p.point[2]);
    if(z>height+2e-9)return null;
    if(z>maxHeight){maxHeight=z;heightWhere={x,theta};}
    peak=Math.max(peak,...p.principal.map(Math.abs));minRadius=Math.min(minRadius,p.radius);maxWidth=Math.max(maxWidth,Math.abs(p.point[1]));
  }
  return {peak,maxHeight,minRadius,maxWidth,heightWhere};
}
function refineHeight(profile){
  let best={height:profile.neckRadius,x:profile.collarEnd,theta:Math.PI/2};
  const nx=128,nt=96;
  for(let i=0;i<=nx;i++)for(let j=0;j<=nt;j++){
    const x=profile.seamX+(profile.collarEnd-profile.seamX)*i/nx,theta=Math.PI/2*j/nt,p=G.evaluate(profile,x,theta),z=p.point[2];
    if(z>best.height)best={height:z,x,theta};
  }
  let dx=(profile.collarEnd-profile.seamX)/nx,dt=Math.PI/2/nt;
  for(let k=0;k<12;k++){
    const center=best;
    for(const i of [-1,0,1])for(const j of [-1,0,1]){
      const x=Math.max(profile.seamX,Math.min(profile.collarEnd,center.x+i*dx)),theta=Math.max(0,Math.min(Math.PI/2,center.theta+j*dt));
      const z=G.evaluate(profile,x,theta).point[2];if(z>best.height)best={height:z,x,theta};
    }
    dx/=2;dt/=2;
  }
  return best;
}
const candidates=[];let rejected=0,attempted=0;
for(const neckRadius of [.35,.38,.40,.42,.44,.45])for(const seamX of [1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.55])
for(const length of [.6,.7,.8,.9,1,1.1,1.2,1.3,1.4])for(const spacing of [4,4.5,5,5.5]){
  if(2*(seamX+length)>spacing+1e-9)continue;
  const p=G.createProfile({id:`height-${neckRadius}-${seamX}-${length}-${spacing}`,neckRadius,seamX,collarEnd:seamX+length,spacing,smoothing:.04});attempted++;
  const s=shape(p);if(!s){rejected++;continue;}candidates.push({profile:p,coarse:s});
}
candidates.sort((a,b)=>a.coarse.peak-b.coarse.peak);
const selected=[];
for(const subset of [candidates,candidates.filter(c=>c.profile.spacing<=4.5),candidates.filter(c=>c.profile.neckRadius<=.4),candidates.filter(c=>c.profile.spacing===4)])
  for(const c of subset.slice(0,5))if(!selected.some(s=>s.profile.id===c.profile.id))selected.push(c);
const refined=[];
for(const c of selected){
  const p=c.profile,h=refineHeight(p);if(h.height>height+1e-9)continue;
  const curvature=D.scanCurvature(G,p,{nx:320,ntheta:192}),probes=[];
  for(const theta of angles)for(const direction of [1,2]){
    const settings={theta,direction,count:1200,amplitude:.12,gain:3};
    probes.push({theta,direction,raw:D.sampleProbe(G,p,{...settings,safety:false}).metrics,safe:D.sampleProbe(G,p,{...settings,safety:true}).metrics});
  }
  const {rows,...curv}=curvature,row={profile:p,coarse:c.coarse,height:h,curvature:curv,probes,
    minRawForward:Math.min(...probes.map(p=>p.raw.minForward)),minSafeGain:Math.min(...probes.map(p=>p.safe.appliedGain))};
  refined.push(row);process.stdout.write(JSON.stringify({profile:p,height:h.height,peak:curv.maxPrincipal,minForward:row.minRawForward,safeGain:row.minSafeGain})+'\n');
}
const report={scope:'Height-limited circular Hermite collar parameter search; no production data changed.',heightLimit:height,
  caveat:'Height and curvature maxima are sampled and locally refined, not formal bounds. A final admissible family must additionally enforce the height analytically.',
  attempted,rejected,coarseBest:candidates.slice(0,30),refined};
fs.writeFileSync(path.join(__dirname,'search-height-results.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({attempted,rejected,admissible:candidates.length,best:refined.slice(0,4).map(p=>({profile:p.profile,peak:p.curvature.maxPrincipal,height:p.height.height,safeGain:p.minSafeGain,minForward:p.minRawForward}))})+'\n');

function runBounded(){
  const H=require('./height-profile.js'),all=[];let attempted=0,rejected=0;
  const thetaGrid=[0,.025,.05,.075,.1,.15,.2,.25,.3,.4,.5,.6,.7,.8,.9,1,1.15,1.3,1.45,Math.PI/2];
  const score=(p,nx=24)=>{
    let peak=0,maxHeight=0,minRadius=Infinity;
    for(const theta of thetaGrid)for(let i=0;i<=nx;i++){
      const q=G.evaluate(p,p.seamX+(p.collarEnd-p.seamX)*i/nx,theta);
      peak=Math.max(peak,...q.principal.map(Math.abs));maxHeight=Math.max(maxHeight,Math.abs(q.point[2]));minRadius=Math.min(minRadius,q.radius);
    }
    return {peak,maxHeight,minRadius};
  };
  for(const seamX of [1,1.1,1.2,1.3,1.4,1.5])for(const length of [.8,1,1.2,1.4,1.6])
  for(const spacing of [4,4.5,5,5.5])for(const halfWidth of [.45,.6,.75,.9,1.05,1.2])
  for(const capSoftness of [.015,.03,.06])for(const advanceFraction of [.3,.4,.5]){
    const sourceAdvance=Number((length*advanceFraction).toFixed(6));
    if(2*(seamX+length)>spacing+1e-10||seamX+sourceAdvance>=1.79)continue;
    attempted++;
    try{
      const p=H.createProfile({id:`bounded-${seamX}-${length}-${spacing}-${halfWidth}-${capSoftness}-${sourceAdvance}`,seamX,collarEnd:seamX+length,spacing,halfWidth,halfHeight:.45,capSoftness,sourceAdvance,smoothing:.04});
      const coarse=score(p);if(coarse.maxHeight>height+3e-12||!Number.isFinite(coarse.peak)){rejected++;continue;}
      all.push({profile:p,coarse});
    }catch(_){rejected++;}
  }
  all.sort((a,b)=>a.coarse.peak-b.coarse.peak);
  const selected=[];
  for(const list of [all,all.filter(c=>c.profile.spacing<=4.5),all.filter(c=>c.profile.halfWidth<=.6),all.filter(c=>c.profile.spacing===4)])
    for(const row of list.slice(0,8))if(!selected.some(s=>s.profile.id===row.profile.id))selected.push(row);
  const refined=[];
  for(const row of selected){
    const p=row.profile,curvature=D.scanCurvature(G,p,{nx:160,ntheta:96}),probes=[];
    for(const theta of angles)for(const direction of [1,2]){
      const options={theta,direction,count:600,amplitude:.12,gain:3};
      probes.push({theta,direction,raw:D.sampleProbe(G,p,{...options,safety:false}).metrics,safe:D.sampleProbe(G,p,{...options,safety:true}).metrics});
    }
    // A helical crossing tests the general moving frame, not just meridians.
    const [a,b]=G.domain(p),helices=[];
    for(const totalTurn of [-Math.PI/2,Math.PI/2]){
      const k=totalTurn/(b-a),wrapped={domain:q=>G.domain(q),evaluate(q,x,theta){
        const v=G.evaluate(q,x,theta+k*(x-a));
        return {...v,du:v.du.map((z,i)=>z+k*v.dv[i]),duu:v.duu.map((z,i)=>z+2*k*v.duv[i]+k*k*v.dvv[i]),duv:v.duv.map((z,i)=>z+k*v.dvv[i])};
      }};
      for(const theta of [0,Math.PI/4])for(const direction of [1,2]){
        const options={theta,direction,count:600,amplitude:.12,gain:3};
        helices.push({theta,totalTurn,direction,raw:D.sampleProbe(wrapped,p,{...options,safety:false}).metrics,safe:D.sampleProbe(wrapped,p,{...options,safety:true}).metrics});
      }
    }
    const {rows,...c}=curvature,entry={profile:p,coarse:row.coarse,curvature:c,heightCertificate:H.heightCertificate(p),probes,helices,
      minRawForward:Math.min(...probes.map(p=>p.raw.minForward)),minSafeGain:Math.min(...probes.map(p=>p.safe.appliedGain)),
      minHelixForward:Math.min(...helices.map(p=>p.raw.minForward)),minHelixSafeGain:Math.min(...helices.map(p=>p.safe.appliedGain))};
    refined.push(entry);process.stdout.write(JSON.stringify({profile:p,peak:c.maxPrincipal,minForward:entry.minRawForward,safeGain:entry.minSafeGain,helixGain:entry.minHelixSafeGain})+'\n');
  }
  refined.sort((a,b)=>a.curvature.maxPrincipal-b.curvature.maxPrincipal||b.minHelixSafeGain-a.minHelixSafeGain);
  const report={scope:'Analytically height-bounded C-infinity rounded-stadium collar search. Production data unchanged.',heightLimit:height,
    objective:'Primary: smallest largest-found principal curvature within recorded dimensions. Secondary: worst meridian/helical display margin. This is a best-found numerical search, not a proof of global optimality.',
    searchSpace:{spacing:[4,5.5],halfWidth:[.45,1.2],halfHeight:.45,capSoftness:[.015,.06],seam:[1,1.5],length:[.8,1.6],sourceAdvanceFraction:[.3,.5]},
    attempted,rejected,candidateCount:all.length,coarseBest:all.slice(0,50),refined};
  const prior=readBoundedReport();
  for(const key of ['localRefinement','totalProfileEvaluations','finalAudit'])if(prior[key]!==undefined)report[key]=prior[key];
  report.finalists=Array.isArray(prior.finalists)&&prior.finalists.length?prior.finalists:FINALIST_SPECS.map(profile=>({profile:H.createProfile(profile)}));
  fs.writeFileSync(path.join(__dirname,'search-height-bounded-results.json'),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({attempted,rejected,count:all.length,best:refined.slice(0,8).map(p=>({profile:p.profile,peak:p.curvature.maxPrincipal,gain:p.minSafeGain,helixGain:p.minHelixSafeGain}))})+'\n');
}

function readBoundedReport(){
  const file=path.join(__dirname,'search-height-bounded-results.json');
  try{
    const report=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!report||typeof report!=='object'||Array.isArray(report))throw Error('Expected a JSON report object.');
    return report;
  }
  catch(error){
    if(error.code==='ENOENT')return {};
    throw Error(`Cannot read the bounded-search report: ${error.message}`);
  }
}

// Recheck the recorded finalists independently of the coarse search. The saved
// report also records both local parameter grids and coordinate-search settings.
function auditFinalists(){
  const H=require('./height-profile.js'),file=path.join(__dirname,'search-height-bounded-results.json');
  const report=readBoundedReport(),finalists=[];
  const savedFinalists=Array.isArray(report.finalists)&&report.finalists.length?report.finalists:FINALIST_SPECS.map(profile=>({profile}));
  if(!savedFinalists.length||savedFinalists.some(saved=>!saved?.profile||typeof saved.profile!=='object'))
    throw Error('No valid finalist specifications are available for --audit-finalists. Restore FINALIST_SPECS or a bounded report containing finalist profiles.');
  for(const saved of savedFinalists){
    const p=H.createProfile(saved.profile),{rows,...curvature}=D.scanCurvature(G,p,{nx:640,ntheta:384}),probes=[];
    for(const theta of angles)for(const direction of [1,2]){
      const options={theta,direction,count:1600,amplitude:.12,gain:3};
      probes.push({type:'meridian',theta,direction,raw:D.sampleProbe(G,p,{...options,safety:false}).metrics,safe:D.sampleProbe(G,p,{...options,safety:true}).metrics});
    }
    for(const turn of [-Math.PI/2,Math.PI/2])for(const theta of [0,Math.PI/4])for(const direction of [1,2]){
      const options={turn,theta,direction,count:1600,amplitude:.12,gain:3};
      probes.push({type:'oblique',theta,turn,direction,raw:D.sampleObliqueProbe(G,p,{...options,safety:false}).metrics,safe:D.sampleObliqueProbe(G,p,{...options,safety:true}).metrics});
    }
    const row={profile:p,curvature,heightCertificate:H.heightCertificate(p),probes,
      minRawForward:Math.min(...probes.map(q=>q.raw.minForward)),minSafeGain:Math.min(...probes.map(q=>q.safe.appliedGain))};
    finalists.push(row);
    process.stdout.write(JSON.stringify({id:p.id,maxPrincipal:curvature.maxPrincipal,maxHeight:curvature.maxHeight,minRawForward:row.minRawForward,minSafeGain:row.minSafeGain})+'\n');
  }
  report.finalists=finalists;fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
}
