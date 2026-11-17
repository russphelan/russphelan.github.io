/* Height-constrained C-infinity collar family, isolated from production data.
 * A radial convex combination of two sections inside |z| <= .45 cannot leave
 * that slab. The torus source is smoothly frozen before its radial chart ends;
 * the target is a smooth rounded stadium, not a height-stretched ellipse. */
(function(root,factory){
  'use strict';
  const smoothing=typeof module==='object'&&module.exports?require('./smooth-profile.js'):root.GeodesicNeckSmoothing;
  const api=factory(smoothing);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GeodesicNeckHeightProfile=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Smoothing){
  'use strict';
  const BODY_HEIGHT=.45,TORUS_INNER=.90,TORUS_OUTER=1.80;
  const targetCache=new WeakMap();
  function createProfile({id,label,description='',seamX=1.2,collarEnd=2.3,spacing=5,
    halfWidth=.8,halfHeight=BODY_HEIGHT,capSoftness=.025,sourceAdvance=.35,smoothing=.04}={}){
    if(typeof id!=='string'||!id||![seamX,collarEnd,spacing,halfWidth,halfHeight,capSoftness,sourceAdvance,smoothing].every(Number.isFinite)||
      seamX<=TORUS_INNER||seamX>=TORUS_OUTER||collarEnd<=seamX||2*collarEnd>spacing||
      halfHeight<=0||halfHeight>BODY_HEIGHT||halfWidth<halfHeight||capSoftness<=0||capSoftness>=halfHeight||
      sourceAdvance<=0||2*sourceAdvance>collarEnd-seamX+1e-12||seamX+sourceAdvance>=TORUS_OUTER||
      smoothing<=0||smoothing>=sourceAdvance||2*smoothing>=collarEnd-seamX)
      throw RangeError('Invalid height-constrained collar dimensions.');
    return Object.freeze({id,label:label||id,description,seamX,collarEnd,spacing,halfWidth,halfHeight,
      capSoftness,sourceAdvance,smoothing,neckRadius:halfHeight,heightBound:BODY_HEIGHT,
      kind:'height',smoothness:'C∞ joins; analytic height bound'});
  }
  function targetRadius(profile,theta){
    if(!Number.isFinite(theta))throw RangeError('A finite section angle is required.');
    let cache=targetCache.get(profile);if(!cache){cache=new Map();targetCache.set(profile,cache);}
    if(cache.has(theta))return {...cache.get(theta)};
    // Minkowski sum: a circle of radius c plus an ellipse with semiaxes a,b.
    // Width = c+a, height = c+b; c+b is exactly the permitted half-height.
    const b=profile.capSoftness,c=profile.halfHeight-b,a=profile.halfWidth-c;
    const cos=Math.abs(Math.cos(theta)),sin=Math.abs(Math.sin(theta)),angle=Math.atan2(sin,cos);
    const section=phi=>{
      const u=Math.cos(phi),v=Math.sin(phi),h=Math.hypot(a*u,b*v),support=c+h,
        first=(b*b-a*a)*u*v/h,rho=c+a*a*b*b/(h*h*h);
      return {y:c*u+a*a*u/h,z:c*v+b*b*v/h,support,first,rho};
    };
    let phi;
    if(angle<1e-15)phi=0;
    else if(Math.PI/2-angle<1e-15)phi=Math.PI/2;
    else{
      let lo=0,hi=Math.PI/2;
      // A strictly convex section has a strictly increasing polar angle.
      for(let i=0;i<50;i++){
        const mid=(lo+hi)/2,p=section(mid);
        if(p.y*sin-p.z*cos>0)lo=mid;else hi=mid;
      }
      phi=(lo+hi)/2;
    }
    const p=section(phi),r=Math.hypot(p.y,p.z),sign=Math.sin(theta)*Math.cos(theta)>=0?1:-1,
      first=r*p.first/p.support,rt=Math.abs(Math.sin(theta)*Math.cos(theta))<1e-14?0:sign*first,
      rtt=r+2*first*first/r-r**5/(p.rho*p.support**3);
    const result={r,rx:0,rt,rxx:0,rxt:0,rtt};
    if(!Object.values(result).every(Number.isFinite))throw RangeError('Nonfinite rounded-stadium radius jets.');
    cache.set(theta,result);if(cache.size>4096)cache.delete(cache.keys().next().value);
    return {...result};
  }
  function sourceWarp(profile,x){
    const a=profile.seamX,L=2*profile.sourceAdvance,end=a+L,c=a+profile.sourceAdvance;
    if(x<=a)return {value:x,first:1,second:0};
    if(x>=end)return {value:c,first:0,second:0};
    const t=(x-a)/L;
    // Monotone C2 seed: f'=1-3t²+2t³ >= 0 and f(end)=a+L/2.
    let q={r:a+L*(t-t**3+.5*t**4),rx:1-3*t*t+2*t**3,rt:0,
      rxx:(-6*t+6*t*t)/L,rxt:0,rtt:0};
    const width=profile.smoothing;
    if(x<a+width)q=Smoothing.blend({r:x,rx:1,rt:0,rxx:0,rxt:0,rtt:0},q,(x-a)/width,width);
    else if(x>end-width)q=Smoothing.blend(q,{r:c,rx:0,rt:0,rxx:0,rxt:0,rtt:0},(x-end+width)/width,width);
    return {value:q.r,first:q.rx,second:q.rxx};
  }
  function radius(profile,x,theta,torusRadius){
    if(profile?.kind!=='height'||typeof torusRadius!=='function'||![x,theta].every(Number.isFinite))
      throw TypeError('A bounded collar profile, finite coordinates, and torus-radius evaluator are required.');
    const left=x<=profile.spacing/2,xx=left?x:profile.spacing-x,sign=left?1:-1;
    let q;
    if(xx<=profile.seamX)q=torusRadius(xx,theta);
    else if(xx>=profile.collarEnd)q=targetRadius(profile,theta);
    else{
      const f=sourceWarp(profile,xx),base=torusRadius(f.value,theta),source={r:base.r,rx:base.rx*f.first,rt:base.rt,
        rxx:base.rxx*f.first*f.first+base.rx*f.second,rxt:base.rxt*f.first,rtt:base.rtt};
      q=Smoothing.blend(source,targetRadius(profile,theta),(xx-profile.seamX)/(profile.collarEnd-profile.seamX),profile.collarEnd-profile.seamX);
    }
    return {...q,rx:sign*q.rx,rxt:sign*q.rxt};
  }
  function heightCertificate(profile){
    return Object.freeze({bound:BODY_HEIGHT,targetBound:profile.halfHeight,bodyBound:BODY_HEIGHT,
      sourceMaximum:profile.seamX+profile.sourceAdvance,sourceChartEnd:TORUS_OUTER,
      target:'circle-plus-ellipse Minkowski sum: height = circle radius + vertical ellipse radius',
      collar:'pointwise convex combination at the same polar angle; therefore |z| <= max(body height, target height) = 0.45',
      targetCurvatureBound:1/(profile.halfHeight-profile.capSoftness+profile.capSoftness**2/(profile.halfWidth-profile.halfHeight+profile.capSoftness))});
  }
  return Object.freeze({createProfile,targetRadius,sourceWarp,radius,heightCertificate,BODY_HEIGHT});
});
