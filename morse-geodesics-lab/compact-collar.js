/* Height-bounded compact collar adopted from the audited neck workbench.
 * The zero set is the exact selected C-infinity surface, |z| <= .45.
 * Cartesian implicit jets use an identity-matched pullback of torus distance.
 * No numerical derivatives or mesh smoothing enter the metric. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GeodesicCompactCollar=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const Smoothing=(function(){
  'use strict';
  const keys=['r','rx','rt','rxx','rxt','rtt'];
  function cutoff(t){
    if(!Number.isFinite(t))throw RangeError('A finite smoothing coordinate is required.');
    if(t<=0)return {value:0,first:0,second:0};
    if(t>=1)return {value:1,first:0,second:0};
    // exp(-1/t) / (exp(-1/t) + exp(-1/(1-t))). Logistic form avoids
    // 0/0 at the flat ends. Derivatives are evaluated in the log domain so
    // a tiny weight can still have a representable first/second derivative.
    const inverse=1/t,other=1/(1-t),z=other-inverse;
    if(Math.abs(z)>800)return {value:z<0?0:1,first:0,second:0};
    const q=Math.exp(-Math.abs(z)),denominator=1+q;
    const value=z<0?q/denominator:1/denominator;
    const z1=inverse*inverse+other*other,z2=2*(other**3-inverse**3);
    const oneMinusTwice=z<0?(1-q)/denominator:(q-1)/denominator;
    const logProduct=-Math.abs(z)-2*Math.log1p(q),bracket=oneMinusTwice*z1*z1+z2;
    return {value,first:Math.exp(logProduct+Math.log(z1)),
      second:bracket===0?0:Math.sign(bracket)*Math.exp(logProduct+Math.log(Math.abs(bracket)))};
  }
  const copy=a=>Object.fromEntries(keys.map(key=>[key,a[key]]));
  function blend(a,b,t,width){
    if(!a||!b||!keys.every(key=>Number.isFinite(a[key])&&Number.isFinite(b[key])))
      throw TypeError('Two finite radius jets are required.');
    if(!Number.isFinite(width)||width<=0)throw RangeError('A positive finite smoothing width is required.');
    const w=cutoff(t);
    if(w.value===0&&w.first===0&&w.second===0)return copy(a);
    if(w.value===1&&w.first===0&&w.second===0)return copy(b);
    const wx=w.first/width,wxx=w.second/width/width;
    const mix=key=>w.value<=.5?a[key]+w.value*(b[key]-a[key]):b[key]+(1-w.value)*(a[key]-b[key]);
    const result={r:mix('r'),rx:mix('rx')+wx*(b.r-a.r),rt:mix('rt'),
      rxx:mix('rxx')+2*wx*(b.rx-a.rx)+wxx*(b.r-a.r),
      rxt:mix('rxt')+wx*(b.rt-a.rt),rtt:mix('rtt')};
    if(!keys.every(key=>Number.isFinite(result[key])))throw RangeError('Smoothing derivatives exceed floating-point range.');
    return result;
  }
  return Object.freeze({cutoff,blend});
})();
  const Fast=(function(){
  'use strict';
  const R=1.35,r=.45,R2=R*R;
  function evaluate(x,theta){
    if(!Number.isFinite(x)||!Number.isFinite(theta)||x<=R-r||x>=R+r)
      throw RangeError('The torus radial chart requires finite x strictly between its two critical radii.');
    const c=Math.cos(theta),c2=c*c,A=x*x+R2-r*r,D=R2*c2*c2-A*c2+x*x;
    const squared=2*R2*c2-A+2*R*Math.sqrt(Math.max(0,D));
    if(!(D>0&&squared>0))throw RangeError('The torus radial chart must remain regular.');
    const rho=Math.sqrt(squared),H=x*x+squared+R2-r*r,sin2=Math.sin(2*theta),cos2=Math.cos(2*theta);
    const Fx=4*x*(H-2*R2),Fr=4*rho*(H-2*R2*c2),Ft=4*R2*squared*sin2;
    if(!(Fr>1e-12))throw RangeError('The torus radial chart must remain regular.');
    const rx=-Fx/Fr,rt=-Ft/Fr,Fxx=4*(H-2*R2)+8*x*x,Fxr=8*x*rho,
      Frr=4*(H-2*R2*c2)+8*squared,Frt=8*R2*rho*sin2,Ftt=8*R2*squared*cos2;
    return {r:rho,rx,rt,rxx:-(Fxx+2*Fxr*rx+Frr*rx*rx)/Fr,
      rxt:-(Fxr*rt+Frr*rx*rt+Frt*rx)/Fr,rtt:-(Ftt+2*Frt*rt+Frr*rt*rt)/Fr};
  }
  return Object.freeze({evaluate});
})();
  const Height=(function(Smoothing){
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
      // A circle-plus-segment seed is already close on the rounded end.
      // Above its flat top, start with the top normal. Safeguarded Newton
      // keeps a monotone bracket and resolves the actual smooth ellipse.
      const seed=a*Math.sin(angle)/c;
      phi=seed<1?Math.min(hi,angle+Math.asin(seed)):hi;
      for(let i=0;i<56;i++){
        const p=section(phi),residual=p.y*sin-p.z*cos;
        if(Math.abs(residual)<=2e-16*Math.max(1,Math.hypot(p.y,p.z)))break;
        if(residual>0)lo=phi;else hi=phi;
        const derivative=-p.rho*Math.cos(phi-angle),next=phi-residual/derivative;
        const safe=Number.isFinite(next)&&next>lo&&next<hi?next:(lo+hi)/2;
        if(safe===phi)break;
        phi=safe;
      }
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
})(Smoothing);
  const profile=Height.createProfile({id:'compact-collar-v1',label:'Compact · closer tori',
    seamX:.94,collarEnd:1.89,spacing:4,halfWidth:1.05,halfHeight:.45,capSoftness:.015,sourceAdvance:.36,smoothing:.04});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function cutoffValue(t){
    if(t<=0)return 0;if(t>=1)return 1;
    const z=1/(1-t)-1/t,q=Math.exp(-Math.abs(z));return z<0?q/(1+q):1/(1+q);
  }
  function sourceValue(x){
    const a=profile.seamX,L=2*profile.sourceAdvance,end=a+L,c=a+profile.sourceAdvance,w=profile.smoothing;
    if(x<=a)return x;if(x>=end)return c;
    const t=(x-a)/L,seed=a+L*(t-t**3+.5*t**4);
    if(x<a+w){const v=cutoffValue((x-a)/w);return x+v*(seed-x);}
    if(x>end-w){const v=cutoffValue((x-end+w)/w);return seed+v*(c-seed);}
    return seed;
  }
  function torusRadiusValue(x,theta){
    const R=1.35,r=.45,c=Math.cos(theta),c2=c*c,A=x*x+R*R-r*r,D=R*R*c2*c2-A*c2+x*x;
    return Math.sqrt(2*R*R*c2-A+2*R*Math.sqrt(Math.max(0,D)));
  }
  function data(localX,theta){
    const sign=localX<=profile.spacing/2?1:-1,x=sign===1?localX:profile.spacing-localX,
      warp=Height.sourceWarp(profile,x),t=Fast.evaluate(warp.value,theta),source={r:t.r,rx:t.rx*warp.first,rt:t.rt,
        rxx:t.rxx*warp.first*warp.first+t.rx*warp.second,rxt:t.rxt*warp.first,rtt:t.rtt};
    let q;
    if(x<=profile.seamX)q=Fast.evaluate(x,theta);
    else if(x>=profile.collarEnd)q=Height.targetRadius(profile,theta);
    else q=Smoothing.blend(source,Height.targetRadius(profile,theta),(x-profile.seamX)/(profile.collarEnd-profile.seamX),profile.collarEnd-profile.seamX);
    return {radius:{...q,rx:sign*q.rx,rxt:sign*q.rxt},source:{...source,rx:sign*source.rx,rxt:sign*source.rxt},
      warp:{value:warp.value,first:sign*warp.first,second:warp.second}};
  }
  function radius(localX,theta){return data(localX,theta).radius;}
  function point(localX,theta){const r=radius(localX,theta).r;return [localX,r*Math.cos(theta),r*Math.sin(theta)];}
  function value(p){
    const localX=p[0],x=Math.min(localX,profile.spacing-localX),theta=Math.atan2(p[2],p[1]),xi=sourceValue(x),
      base=torusRadiusValue(xi,theta),target=Height.targetRadius(profile,theta).r,
      weight=cutoffValue((x-profile.seamX)/(profile.collarEnd-profile.seamX)),r=base+weight*(target-base),scale=base/r;
    return Math.hypot(Math.hypot(xi,scale*p[1])-1.35,scale*p[2])-.45;
  }
  function torusDistanceJet(p,secondOrder=true){
    const [x,y,z]=p,radial=Math.hypot(x,y),offset=radial-1.35,tube=Math.hypot(offset,z);
    if(radial<1e-14||tube<1e-14)return {value:tube-.45,gradient:[0,0,0],hessian:Array(9).fill(0)};
    const radialGradient=[x/radial,y/radial,0],gradient=[offset*radialGradient[0]/tube,offset*radialGradient[1]/tube,z/tube];
    if(!secondOrder)return {value:tube-.45,gradient};
    const hessian=Array(9);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const radialHessian=i<2&&j<2?((i===j?1:0)-radialGradient[i]*radialGradient[j])/radial:0;
      hessian[3*i+j]=(radialGradient[i]*radialGradient[j]+(i===2&&j===2?1:0)+offset*radialHessian-gradient[i]*gradient[j])/tube;
    }
    return {value:tube-.45,gradient,hessian};
  }
  function pullback(p,secondOrder){
    const [x,y,z]=p,rho2=y*y+z*z,theta=Math.atan2(z,y),d=data(x,theta),a=d.source,b=d.radius,
      scale=a.r/b.r,sx=(a.rx-scale*b.rx)/b.r,st=(a.rt-scale*b.rt)/b.r;
    // The axis is a medial set strictly inside this collar, never F=0.
    // As with the torus distance primitive, a regular normal is not claimed there.
    if(rho2<1e-28){
      const sign=d.warp.value<1.35?-1:1;
      return {value:Math.abs(d.warp.value-1.35)-.45,gradient:[sign*d.warp.first,0,0],hessian:[sign*d.warp.second,0,0,0,0,0,0,0,0]};
    }
    const ty=-z/rho2,tz=y/rho2,gs=[sx,st*ty,st*tz],
      X=[d.warp.value,scale*y,scale*z],J=[[d.warp.first,0,0],gs.map((v,i)=>y*v+(i===1?scale:0)),gs.map((v,i)=>z*v+(i===2?scale:0))],
      t=torusDistanceJet(X,secondOrder),gradient=Array(3).fill(0);
    for(let i=0;i<3;i++)for(let k=0;k<3;k++)gradient[i]+=J[k][i]*t.gradient[k];
    // Normal-Newton projection needs this same first-order pullback, but none
    // of its second-order arrays or Hessian products.
    if(!secondOrder)return {value:t.value,gradient};
    const sxx=(a.rxx-scale*b.rxx-2*sx*b.rx)/b.r,
      sxt=(a.rxt-scale*b.rxt-sx*b.rt-st*b.rx)/b.r,
      stt=(a.rtt-scale*b.rtt-2*st*b.rt)/b.r,
      tty=2*y*z/(rho2*rho2),ttz=-tty,tyz=(z*z-y*y)/(rho2*rho2),
      hs=[sxx,sxt*ty,sxt*tz,sxt*ty,stt*ty*ty+st*tty,stt*ty*tz+st*tyz,
        sxt*tz,stt*ty*tz+st*tyz,stt*tz*tz+st*ttz],
      Hess=[ [d.warp.second,0,0,0,0,0,0,0,0],hs.map((v,k)=>y*v+(Math.floor(k/3)===1?gs[k%3]:0)+(k%3===1?gs[Math.floor(k/3)]:0)),
        hs.map((v,k)=>z*v+(Math.floor(k/3)===2?gs[k%3]:0)+(k%3===2?gs[Math.floor(k/3)]:0)) ],
      hessian=Array(9).fill(0);
    for(let i=0;i<3;i++){
      for(let j=0;j<3;j++)for(let k=0;k<3;k++){
        hessian[3*i+j]+=t.gradient[k]*Hess[k][3*i+j];
        for(let l=0;l<3;l++)hessian[3*i+j]+=J[k][i]*t.hessian[3*k+l]*J[l][j];
      }
    }
    return {value:t.value,gradient,hessian};
  }
  function jet(p){return pullback(p,true);}
  function gradient(p){return pullback(p,false).gradient;}
  const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function section(localX,theta){
    const q=radius(localX,theta),{r,rx,rt,rxx,rxt,rtt}=q,c=Math.cos(theta),s=Math.sin(theta),point=[localX,r*c,r*s],
      du=[1,rx*c,rx*s],dv=[0,rt*c-r*s,rt*s+r*c],duu=[0,rxx*c,rxx*s],duv=[0,rxt*c-rx*s,rxt*s+rx*c],
      dvv=[0,rtt*c-2*rt*s-r*c,rtt*s+2*rt*c-r*s],raw=cross(dv,du),length=Math.hypot(...raw),normal=raw.map(v=>v/length),
      E=dot(du,du),F=dot(du,dv),G=dot(dv,dv),det=E*G-F*F,e=dot(normal,duu),f=dot(normal,duv),g=dot(normal,dvv),
      gaussian=(e*g-f*f)/det,trace=(e*G-2*f*F+g*E)/det,gap=Math.sqrt(Math.max(0,trace*trace-4*gaussian));
    return {point,du,dv,duu,duv,dvv,normal,principal:[(trace-gap)/2,(trace+gap)/2],gaussian,radius:r,areaElement:Math.sqrt(det)};
  }
  return Object.freeze({profile,point,radius,section,value,jet,gradient,heightCertificate:Height.heightCertificate(profile),
    sourceWarp:x=>Height.sourceWarp(profile,x),targetRadius:theta=>Height.targetRadius(profile,theta)});
});
