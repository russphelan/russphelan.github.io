'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./geometry.js');
const TAU=2*Math.PI;
function simpson(fn,a,b,n){
  let sum=0;for(let i=0;i<=n;i++)sum+=(i===0||i===n?1:i%2?4:2)*fn(a+(b-a)*i/n);
  return sum*(b-a)/(3*n);
}
function totalCurvature(profile,nx,ntheta){
  const [a,b]=G.domain(profile);
  const knots=[a,b,profile.spacing/2,profile.collarEnd,profile.spacing-profile.collarEnd];
  if(profile.smoothing>0){
    const transitions=profile.kind==='height'?
      [a+profile.smoothing,a+2*profile.sourceAdvance-profile.smoothing,a+2*profile.sourceAdvance]:
      [a+profile.smoothing,profile.collarEnd-profile.smoothing];
    for(const x of transitions)knots.push(x,profile.spacing-x);
  }
  const breaks=[...new Set(knots.filter(x=>x>=a&&x<=b))].sort((x,y)=>x-y);
  let collar=0;
  for(let i=1;i<breaks.length;i++){
    const lo=breaks[i-1],hi=breaks[i],width=hi-lo;
    // Resolve each flat transition independently rather than relying on a
    // global grid that can step across a narrow C-infinity window.
    const minimum=profile.smoothing>0&&width<=profile.smoothing*1.01?nx/6:4;
    const intervals=2*Math.ceil(Math.max(minimum,nx*width/(b-a))/2);
    collar+=simpson(x=>simpson(theta=>{
      const p=G.evaluate(profile,x,theta);return p.gaussian*p.areaElement;
    },0,TAU,ntheta),lo,hi,intervals);
  }
  // On a round torus K dA = cos(v) du dv. Keep precisely the body
  // outside the removed attachment disc x > seamX; the right body is its
  // translated reflection. This calculation is independent of collar jets.
  const {majorRadius:R,minorRadius:r}=G.constants;
  const body=simpson(v=>{
    const radius=R+r*Math.cos(v),kept=radius<=profile.seamX?TAU:TAU-2*Math.acos(profile.seamX/radius);
    return Math.cos(v)*kept;
  },0,TAU,16384);
  return {collar,bodies:2*body,total:collar+2*body};
}

test('closed comparison surfaces retain the genus-two Gauss–Bonnet curvature budget',()=>{
  for(const profile of G.profiles){
    const coarse=totalCurvature(profile,192,192),fine=totalCurvature(profile,384,384),expected=-4*Math.PI;
    assert.ok(Math.abs(fine.total-expected)<.004,
      `${profile.id}: integral K dA ${fine.total}; genus two requires ${expected}`);
    assert.ok(Math.abs(fine.total-coarse.total)<.015,
      `${profile.id}: doubled-grid total curvature did not settle`);
  }
});

module.exports={totalCurvature};
