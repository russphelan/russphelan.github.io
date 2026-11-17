#!/usr/bin/env node
'use strict';
/* Reproduce the ribbon visibility diagnosis without a browser.
 * This audits the display pipeline, not an independent ODE integration.
 * Run: node morse-geodesics-lab/ribbon-accuracy-audit.cjs
 */
const S = require('./surface.js');
const J = require('./jacobi.js');
const R = require('./jacobi-ribbon.js');
const Mesh = require('./jacobi-ribbon-mesh.js');
const catalogues = require('./catalogue-data.js').catalogues;
const norm = a => Math.hypot(...a);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function previousWidths(profile, roots, length) {
  // Historical ribbon gain: one global amplitude maximum per root-free lobe.
  const boundaries = [0,...roots];
  if (boundaries.at(-1) < length) boundaries.push(length);
  const intervalAt = s => {
    let i=0;
    while(i<boundaries.length-2 && s>boundaries[i+1]) i++;
    return i;
  };
  const maxima=Array(boundaries.length-1).fill(0);
  for(const {sample} of profile) maxima[intervalAt(sample.s)]=Math.max(maxima[intervalAt(sample.s)],Math.abs(sample.j));
  return profile.map(({sample}) => sample.j===0 ? 0 :
    .30*Math.exp(.7*Math.min(0,Math.log(Math.abs(sample.j))-Math.log(maxima[intervalAt(sample.s)]))));
}

function audit(options={}) {
  let total=0, oldOccluded=0,newOccluded=0,collapsed=0,falseRootIntervals=0;
  let proportionalOccluded=0,focusOccluded=0,maxMeshTriangles=0,maxMeshSegments=0;
  const checkMesh=options.mesh??process.argv.includes('--mesh');
  let denseSamples=0,retainedSamples=0,maxSamplingPathError=0,maxSamplingJacobiError=0;
  const started=Date.now();
  const curves=[];
  // Historical selected tube expanded to radius .018. With a ribbon enabled
  // it now shrinks to .006, exposing more small amplitudes without a width floor.
  // Both are local flat-surface estimates, not global visibility guarantees.
  const tubeRadius=.018, ribbonToTubeCenter=.012-.007;
  const occlusionHalfWidth=Math.sqrt(tubeRadius**2-ribbonToTubeCenter**2);
  const currentOcclusionHalfWidth=Math.sqrt(.006**2-ribbonToTubeCenter**2);
  for(const [key,catalogue] of Object.entries(catalogues)) {
    const model=S.getModel(key.split(':')[0]);
    for(const [catalogueIndex,curve] of catalogue.curves.entries()) {
      const data=J.prepare(curve,model), profile=R.profile(data);
      const proportional=R.profile(data,{power:1}),focus=R.profile(data,{mode:'focus'});
      if(!data.verification.converged||data.index!==curve.index)throw Error('Unconverged or inconsistent field: '+curve.id);
      denseSamples+=data.sampling.denseSamples;retainedSamples+=data.sampling.retainedSamples;
      maxSamplingPathError=Math.max(maxSamplingPathError,data.sampling.pathError);
      maxSamplingJacobiError=Math.max(maxSamplingJacobiError,data.sampling.jacobiError);
      const roots=data.events.filter(e=>e.surface).map(e=>e.s);
      const old=previousWidths(profile,roots,data.length);
      let measured=0,oldHidden=0,newHidden=0,minOldWidth=Infinity,minNewWidth=Infinity;
      for(const [i,{sample,width}] of profile.entries()) {
        // Exclude expected near-root/start pinches and endpoint effects.
        const away=sample.s>.1 && sample.s<data.length-.1 && roots.every(s=>Math.abs(s-sample.s)>.1);
        if(away) {
          measured++;
          if(Math.abs(old[i])<occlusionHalfWidth) oldHidden++;
          if(Math.abs(width)<currentOcclusionHalfWidth) newHidden++;
          if(Math.abs(proportional[i].width)<currentOcclusionHalfWidth)proportionalOccluded++;
          if(Math.abs(focus[i].width)<currentOcclusionHalfWidth)focusOccluded++;
          minOldWidth=Math.min(minOldWidth,Math.abs(old[i]));
          minNewWidth=Math.min(minNewWidth,Math.abs(width));
        }
        if(sample.j===0)continue;
        const normal=model.normal(sample.point),direction=cross(normal,sample.tangent),directionNorm=norm(direction);
        const edges=[-1,1].map(side=>{
          const point=model.project(sample.point.map((v,k)=>v+side*old[i]*data.orientation*direction[k]/directionNorm));
          const n=model.normal(point);
          return point.map((v,k)=>Math.fround(v+.012*n[k]));
        });
        if(edges[0].every((v,k)=>v===edges[1][k]))collapsed++;
      }
      // Look for additional interpolated zeros between same-sign display
      // samples. These checks test the actual cubic Hermite interpolant.
      for(let i=1;i<data.samples.length;i++) {
        const a=data.samples[i-1],b=data.samples[i],h=b.s-a.s;
        if(a.j*b.j<=0)continue;
        const cubic=2*a.j-2*b.j+h*(a.jPrime+b.jPrime);
        const quadratic=-3*a.j+3*b.j-h*(2*a.jPrime+b.jPrime);
        const linear=h*a.jPrime;
        const candidates=[];
        if(Math.abs(cubic)<1e-30) {
          if(quadratic!==0)candidates.push(-linear/(2*quadratic));
        } else {
          const discriminant=4*quadratic**2-12*cubic*linear;
          if(discriminant>=0)for(const sign of [-1,1]) candidates.push((-2*quadratic+sign*Math.sqrt(discriminant))/(6*cubic));
        }
        const interpolated = t => ((cubic*t+quadratic)*t+linear)*t+a.j;
        if(candidates.some(t=>t>0&&t<1&&interpolated(t)*a.j<=0))falseRootIntervals++;
      }
      total+=measured;oldOccluded+=oldHidden;newOccluded+=newHidden;
      if(checkMesh)for(const meshProfile of [profile,R.profile(data,{mode:'focus',halfWidth:.30,power:.2})]){
        const mesh=Mesh.build(model,meshProfile,data.orientation);
        maxMeshTriangles=Math.max(maxMeshTriangles,mesh.diagnostics.triangles);
        maxMeshSegments=Math.max(maxMeshSegments,mesh.diagnostics.segments);
      }
      curves.push({key,catalogueIndex,id:curve.id,length:curve.length,index:curve.index,
        intrinsicRoots:roots.length,maxAbsJ:data.maxSurfaceAmplitude,
        measuredSamples:measured,oldOccludedFraction:oldHidden/measured,newOccludedFraction:newHidden/measured,
        minOldWidth,minNewWidth});
    }
  }
  return {curves:curves.length,occlusionHalfWidth,measuredSamples:total,
    scaling:{default:{mode:'amplitude',halfWidth:.16,power:.5},currentOcclusionHalfWidth,
      proportionalBelowTubeFraction:proportionalOccluded/total,focusAidBelowTubeFraction:focusOccluded/total,
      note:'Subpixel or tube-hidden widths are expected for small nonzero amplitudes; they are not conjugate points.'},
    mesh:checkMesh?{maxTriangles:maxMeshTriangles,maxSegments:maxMeshSegments,settings:['default','maximum-width focus aid at power .2']}:null,
    sampling:{denseSamples,retainedSamples,retainedFraction:retainedSamples/denseSamples,
      maxSamplingPathError,maxSamplingJacobiError},seconds:(Date.now()-started)/1000,
    oldOccludedFraction:oldOccluded/total,newOccludedFraction:newOccluded/total,
    oldFloat32CollapsedRings:collapsed,extraHermiteRootIntervals:falseRootIntervals,
    worst:curves.sort((a,b)=>b.oldOccludedFraction-a.oldOccludedFraction).slice(0,12)};
}
module.exports={audit};
if(require.main===module)console.log(JSON.stringify(audit(),null,2));
