'use strict';
// Run explicitly to refresh this isolated prototype's comparison report. The
// live app, production geometry, and all geodesic catalogues are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('./geometry.js'),D=require('./diagnostics.js'),H=require('./height-profile.js');
const settings={amplitude:.12,requestedGain:3,mode:1,coarse:{nx:160,ntheta:96},fine:{nx:320,ntheta:192},wideFine:{nx:640,ntheta:384},joinScan:{nx:160,ntheta:192},probeCount:1600,
  extentScan:{nx:320,ntheta:384},probeAngles:[0,Math.PI/4,Math.PI/2,Math.PI,3*Math.PI/2,3.42],obliqueTurns:[-Math.PI/2,Math.PI/2]};
const report={schemaVersion:1,scope:'Geometry and surface-following drawing comparison only; production geometry and catalogues unchanged.',
  sourceFiles:['reference-surface.js','geometry.js','height-profile.js','torus-radius-fast.js','smooth-profile.js','diagnostics.js','audit.cjs'].map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')})),
  warning:'Largest curvature values found by grid sampling and local peak refinement, not certified global bounds. New height-family candidates additionally have an analytic |z| <= 0.45 certificate. Meridian and oblique comparison probes are not recomputed geodesics. Their common sine test envelope is not a Jacobi or Hessian mode. Probe length is Euclidean arclength only; no ambient variation length is measured.',
  settings,profiles:[]};
function transitionWindows(profile){
  if(!(profile.smoothing>0))return [];
  const a=profile.seamX,b=profile.collarEnd,s=profile.smoothing,windows=[[a,a+s],[b-s,b]];
  if(profile.kind==='height'){
    const freeze=a+2*profile.sourceAdvance;windows.push([freeze-s,freeze]);
  }
  const unique=new Map();
  for(const [lo,hi]of windows)for(const pair of [[lo,hi],[profile.spacing-hi,profile.spacing-lo]])
    unique.set(pair.map(x=>x.toPrecision(15)).join(':'),pair);
  return [...unique.values()];
}
function extentScan(profile){
  const [a,b]=G.domain(profile);let maxHeight=0,maxHalfWidth=0,where=null;
  for(let i=0;i<=settings.extentScan.nx;i++)for(let j=0;j<settings.extentScan.ntheta;j++){
    const x=i===settings.extentScan.nx?b:a+(b-a)*i/settings.extentScan.nx,theta=2*Math.PI*j/settings.extentScan.ntheta,p=G.evaluate(profile,x,theta),height=Math.abs(p.point[2]);
    if(height>maxHeight){maxHeight=height;where={x,theta,point:p.point};}
    maxHalfWidth=Math.max(maxHalfWidth,Math.abs(p.point[1]));
  }
  return {...settings.extentScan,maxHeight,maxHalfWidth,where};
}
function probeSummary(probes){
  return {count:probes.length,minimumRawForward:Math.min(...probes.map(p=>p.raw.minForward)),
    minimumRawSpeed:Math.min(...probes.map(p=>p.raw.minSpeed)),minimumSafeGain:Math.min(...probes.map(p=>p.safe.appliedGain)),
    worstNormalTurn:Math.max(...probes.map(p=>p.raw.maxNormalTurn)),worstAxisTurn:Math.max(...probes.map(p=>p.raw.maxAxisTurn))};
}
for(const profile of G.profiles){
  const resolved=profile.kind==='height'||profile.smoothing>0;
  const coarse=D.scanCurvature(G,profile,resolved?settings.fine:settings.coarse),fine=D.scanCurvature(G,profile,resolved?settings.wideFine:settings.fine);
  const {rows,...curvature}=fine,probes=[];
  const windows=transitionWindows(profile);
  if(windows.length){
    let maxPrincipal=0,maxAbsGaussian=0,where=null,minRadius=Infinity;
    for(const [a,b]of windows)
      for(let i=0;i<=settings.joinScan.nx;i++)for(let j=0;j<settings.joinScan.ntheta;j++){
        const x=a+(b-a)*i/settings.joinScan.nx,theta=2*Math.PI*j/settings.joinScan.ntheta,p=G.evaluate(profile,x,theta),k=Math.max(...p.principal.map(Math.abs));
        if(k>maxPrincipal){maxPrincipal=k;where={x,theta,point:p.point};}
        maxAbsGaussian=Math.max(maxAbsGaussian,Math.abs(p.gaussian));minRadius=Math.min(minRadius,p.radius);
      }
    curvature.denseJoinScan={...settings.joinScan,windows,maxPrincipal,maxAbsGaussian,minRadius,where};
    if(maxPrincipal>curvature.maxPrincipal){curvature.maxPrincipal=maxPrincipal;curvature.where=where;}
    curvature.maxAbsGaussian=Math.max(curvature.maxAbsGaussian,maxAbsGaussian);
  }
  const extent=extentScan(profile),heightCertificate=profile.kind==='height'?H.heightCertificate(profile):null;
  curvature.maxHeight=extent.maxHeight;
  if(heightCertificate&&extent.maxHeight>heightCertificate.bound+1e-10)
    throw Error(profile.id+' violated its analytic height bound in the extent scan.');
  for(const theta of settings.probeAngles)for(const direction of [1,2])for(const turn of [0,...settings.obliqueTurns]){
    const options={theta,direction,amplitude:settings.amplitude,gain:settings.requestedGain,mode:1,count:settings.probeCount,turn};
    const sampler=turn===0?D.sampleProbe:D.sampleObliqueProbe;
    const raw=sampler(G,profile,{...options,safety:false}),safe=sampler(G,profile,{...options,safety:true});
    probes.push({probeKind:turn===0?'meridian':'oblique',turn,theta,direction,length:raw.length,raw:raw.metrics,safe:safe.metrics});
  }
  const defaultTheta=3.42,coarseProbe=D.sampleProbe(G,profile,{theta:defaultTheta,count:800,safety:false}),fineProbe=D.sampleProbe(G,profile,{theta:defaultTheta,count:1600,safety:false});
  const probeConvergence={theta:defaultTheta,coarseCount:800,fineCount:1600,
    normalTurnRelativeChange:Math.abs(fineProbe.metrics.maxNormalTurn-coarseProbe.metrics.maxNormalTurn)/Math.max(1e-12,fineProbe.metrics.maxNormalTurn),
    axisTurnRelativeChange:Math.abs(fineProbe.metrics.maxAxisTurn-coarseProbe.metrics.maxAxisTurn)/Math.max(1e-12,fineProbe.metrics.maxAxisTurn),
    lengthAbsoluteChange:Math.abs(fineProbe.length-coarseProbe.length)};
  const row={id:profile.id,kind:profile.kind,label:profile.label,description:profile.description,smoothness:profile.smoothness,
    seamX:profile.seamX,collarEnd:profile.collarEnd,spacing:profile.spacing,neckRadius:profile.neckRadius,
    smoothing:profile.smoothing||0,radialBias:profile.radialBias||0,angularBias:profile.angularBias||0,
    halfWidth:profile.halfWidth??profile.neckRadius,halfHeight:profile.halfHeight??profile.neckRadius,
    capSoftness:profile.capSoftness??null,sourceAdvance:profile.sourceAdvance??null,
    heightCertificate,maxHeight:extent.maxHeight,extent,
    curvature,convergence:D.compareGrids(coarse,fine),probeConvergence,probes,
    probeSummary:{all:probeSummary(probes),meridian:probeSummary(probes.filter(p=>p.probeKind==='meridian')),
      oblique:probeSummary(probes.filter(p=>p.probeKind==='oblique'))}};
  report.profiles.push(row);
  process.stdout.write(JSON.stringify({id:row.id,peakCurvature:curvature.maxPrincipal,curvatureChange:row.convergence.principalRelativeChange,
    maxHeight:row.maxHeight,worstProbeNormalTurn:row.probeSummary.all.worstNormalTurn,
    minimumRawForward:row.probeSummary.all.minimumRawForward,minimumSafeGain:row.probeSummary.all.minimumSafeGain})+'\n');
}
fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'results.js'),'/* Generated by audit.cjs. Sampled comparisons, not curvature certificates. */\n'+
  '(function(root){\n  \'use strict\';\n  root.GeodesicNeckAudit='+JSON.stringify(report)+';\n})(typeof globalThis!==\'undefined\'?globalThis:this);\n');
