/* Isolated height-bounded collar candidates. Production geometry and
 * catalogues are untouched. Historical Hermite constructors remain available
 * for reproducibility, but only height-certified candidates are selectable. */
(function(root,factory){
  'use strict';const surface=typeof module==='object'&&module.exports?require('./reference-surface.js'):root.GeodesicSurface;
  const smoothing=typeof module==='object'&&module.exports?require('./smooth-profile.js'):root.GeodesicNeckSmoothing;
  const height=typeof module==='object'&&module.exports?require('./height-profile.js'):root.GeodesicNeckHeightProfile;
  const fastTorus=typeof module==='object'&&module.exports?require('./torus-radius-fast.js'):root.GeodesicNeckTorusRadius;
  const api=factory(surface,smoothing,height,fastTorus);if(typeof module==='object'&&module.exports)module.exports=api;else root.GeodesicNeckGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Surface,Smoothing,Height,FastTorus){
  'use strict';
  const R=1.35,r=.45,TAU=2*Math.PI,baseline=Surface.getModel('double');
  const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);if(!(n>1e-12))throw RangeError('Nonregular prototype collar.');return a.map(x=>x/n);};
  // Bivariate Taylor coefficients through x^2 theta^2. Unary expansion to
  // total degree four supplies all theta derivatives of boundary r_xx.
  const constant=v=>[v,0,0,0,0,0,0,0,0];
  const add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s);
  function mul(a,b){const q=constant(0);for(let i=0;i<=2;i++)for(let j=0;j<=2;j++)for(let k=0;k<=i;k++)for(let l=0;l<=j;l++)q[3*i+j]+=a[3*k+l]*b[3*(i-k)+j-l];return q;}
  function unary(a,derivatives){const d=a.slice();d[0]=0;let power=constant(1),out=constant(derivatives[0]),factorial=1;
    for(let k=1;k<=4;k++){power=mul(power,d);factorial*=k;out=add(out,scale(power,derivatives[k]/factorial));}return out;}
  const cosine=a=>unary(a,[Math.cos(a[0]),-Math.sin(a[0]),-Math.cos(a[0]),Math.sin(a[0]),Math.cos(a[0])]);
  function sqrt(a){const v=a[0];if(!(v>0))throw RangeError('The torus radial chart must stay regular.');return unary(a,[Math.sqrt(v),.5/v**.5,-.25/v**1.5,.375/v**2.5,-.9375/v**3.5]);}
  function torusTaylor(x,theta){
    const X=constant(x),angle=constant(theta);X[3]=1;angle[1]=1;
    const x2=mul(X,X),c=cosine(angle),c2=mul(c,c),A=add(x2,constant(R*R-r*r));
    const B=add(scale(c2,2*R*R),scale(A,-1));
    const D=add(add(scale(mul(c2,c2),R*R),scale(mul(A,c2),-1)),x2);
    return sqrt(add(B,scale(sqrt(D),2*R)));
  }
  const derivatives=a=>({r:a[0],rx:a[3],rt:a[1],rxx:2*a[6],rxt:a[4],rtt:2*a[2]});
  function torusRadius(x,theta){return derivatives(torusTaylor(x,theta));}
  function createProfile({id,label,description='',seamX=1.2,collarEnd=2.1,spacing=4.6,neckRadius=.4,radialBias=0,angularBias=0,smoothing=0}={}){
    if(typeof id!=='string'||!id||![seamX,collarEnd,spacing,neckRadius,radialBias,angularBias,smoothing].every(Number.isFinite)||seamX<=R-r||seamX>=R+r||collarEnd<=seamX||2*collarEnd>spacing||neckRadius<=0||smoothing<0||smoothing>0&&(2*smoothing>=collarEnd-seamX||seamX+smoothing>=R+r))
      throw RangeError('Invalid prototype collar dimensions.');
    return Object.freeze({id,label:label||id,description,seamX,collarEnd,spacing,neckRadius,radialBias,angularBias,smoothing,kind:'hermite',smoothness:smoothing>0?'C∞ joins; prototype':'C² seams; prototype'});
  }
  const profiles=Object.freeze([
    Object.freeze({id:'current',label:'Previous neck',description:'Archived round-chain-v1 smooth union; comparison reference.',seamX:1.0,collarEnd:1.9,spacing:4,neckRadius:.4,kind:'current',smoothness:'C∞ production geometry'}),
    Height.createProfile({id:'height-optimal',label:'Broad · best field display',description:'Recommended: a broad rounded neck and generous spacing preserve the strongest field display near the best curvature found.',seamX:.94,collarEnd:1.89,spacing:5.5,halfWidth:1.05,halfHeight:.45,capSoftness:.015,sourceAdvance:.36,smoothing:.04}),
    Height.createProfile({id:'height-compact',label:'Compact · closer tori',description:'The same gentle shoulder shape with the tori closer together. More compact, with stronger display limiting on oblique paths.',seamX:.94,collarEnd:1.89,spacing:4,halfWidth:1.05,halfHeight:.45,capSoftness:.015,sourceAdvance:.36,smoothing:.04}),
    Height.createProfile({id:'height-waisted',label:'Narrower · visible waist',description:'A more visibly pinched silhouette, trading some curvature control and field scale for a clearer neck.',seamX:1,collarEnd:2.2,spacing:5,halfWidth:.6,halfHeight:.45,capSoftness:.015,sourceAdvance:.48,smoothing:.04})
  ]);
  const boundaryCache=new WeakMap();
  function boundary(profile,theta){let cache=boundaryCache.get(profile);if(!cache){cache=new Map();boundaryCache.set(profile,cache);}if(!cache.has(theta)){cache.set(theta,torusTaylor(profile.seamX,theta));if(cache.size>4096)cache.delete(cache.keys().next().value);}return cache.get(theta);}
  const h0=t=>[1-10*t**3+15*t**4-6*t**5,-30*t*t+60*t**3-30*t**4,-60*t+180*t*t-120*t**3];
  const h1=t=>[t-6*t**3+8*t**4-3*t**5,1-18*t*t+32*t**3-15*t**4,-36*t+96*t*t-60*t**3];
  const h2=t=>[(t*t-3*t**3+3*t**4-t**5)/2,(2*t-9*t*t+12*t**3-5*t**4)/2,(2-18*t+36*t*t-20*t**3)/2];
  function candidateRadius(profile,x,theta){
    const left=x<=profile.spacing/2,xx=left?x:profile.spacing-x,sign=left?1:-1;
    let q;
    if(xx<=profile.seamX)q=torusRadius(xx,theta);
    else if(xx>=profile.collarEnd)q={r:profile.neckRadius,rx:0,rt:0,rxx:0,rxt:0,rtt:0};
    else{
      const a=boundary(profile,theta),L=profile.collarEnd-profile.seamX,t=(xx-profile.seamX)/L,H=[h0(t),h1(t),h2(t)];
      const coefficients=j=>[(a[j]-(j===0?profile.neckRadius:0))*(j===2?2:1),L*a[3+j]*(j===2?2:1),2*L*L*a[6+j]*(j===2?2:1)];
      const value=(j,k)=>coefficients(j).reduce((s,v,i)=>s+v*H[i][k],0);
      q={r:profile.neckRadius+value(0,0),rx:value(0,1)/L,rt:value(1,0),rxx:value(0,2)/(L*L),rxt:value(1,1)/L,rtt:value(2,0)};
      if(profile.radialBias||profile.angularBias){
        // This endpoint-flat adjustment changes the interior shape without
        // changing either attachment's position, tangent, or curvature.
        const Q=64*t**3*(1-t)**3,Qx=64*(3*t*t-12*t**3+15*t**4-6*t**5)/L,
          Qxx=64*(6*t-36*t*t+60*t**3-30*t**4)/(L*L),c=profile.radialBias+profile.angularBias*Math.cos(2*theta),
          ct=-2*profile.angularBias*Math.sin(2*theta),ctt=-4*profile.angularBias*Math.cos(2*theta);
        q={r:q.r+Q*c,rx:q.rx+Qx*c,rt:q.rt+Q*ct,rxx:q.rxx+Qxx*c,rxt:q.rxt+Qx*ct,rtt:q.rtt+Q*ctt};
      }
      const width=profile.smoothing;
      if(width>0&&xx<profile.seamX+width)
        q=Smoothing.blend(torusRadius(xx,theta),q,(xx-profile.seamX)/width,width);
      else if(width>0&&xx>profile.collarEnd-width)
        q=Smoothing.blend(q,{r:profile.neckRadius,rx:0,rt:0,rxx:0,rxt:0,rtt:0},(xx-profile.collarEnd+width)/width,width);
    }
    return {...q,rx:sign*q.rx,rxt:sign*q.rxt};
  }
  function implicitRadius(x,theta){
    const c=Math.cos(theta),s=Math.sin(theta),e=[0,c,s],et=[0,-s,c];let lo=0,hi=2;
    while(baseline.value([x,hi*c,hi*s])<=0&&hi<16)hi*=2;
    if(!(baseline.value([x,0,0])<0))throw RangeError('Baseline radial chart has left its attachment disc.');
    for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(baseline.value([x,mid*c,mid*s])>0)hi=mid;else lo=mid;}
    const radius=(lo+hi)/2,p=[x,radius*c,radius*s],jet=baseline.jet(p),g=jet.gradient,h=jet.hessian,Fr=dot(g,e);
    if(!(Fr>1e-10))throw RangeError('Baseline radial chart is not regular.');
    const H=(a,b)=>a.reduce((sum,v,i)=>sum+v*b.reduce((q,w,j)=>q+h[3*i+j]*w,0),0);
    const rx=-g[0]/Fr,rt=-radius*dot(g,et)/Fr,X=[1,rx*c,rx*s],V=[0,rt*c-radius*s,rt*s+radius*c];
    return {r:radius,rx,rt,rxx:-H(X,X)/Fr,rxt:-(H(X,V)+rx*dot(g,et))/Fr,
      rtt:-(H(V,V)+2*rt*dot(g,et)-radius*Fr)/Fr};
  }
  function evaluate(profile,x,theta){
    if(typeof profile==='string')profile=profiles.find(p=>p.id===profile);
    if(!profile||![x,theta].every(Number.isFinite))throw TypeError('A prototype profile and finite coordinates are required.');
    const q=profile.kind==='height'?Height.radius(profile,x,theta,FastTorus.evaluate):profile.kind==='current'?implicitRadius(x,theta):candidateRadius(profile,x,theta),{r:rho,rx,rt,rxx,rxt,rtt}=q,c=Math.cos(theta),s=Math.sin(theta);
    if(!(rho>0))throw RangeError('Prototype radius became nonpositive.');
    const point=[x,rho*c,rho*s],du=[1,rx*c,rx*s],dv=[0,rt*c-rho*s,rt*s+rho*c],duu=[0,rxx*c,rxx*s],
      duv=[0,rxt*c-rx*s,rxt*s+rx*c],dvv=[0,rtt*c-2*rt*s-rho*c,rtt*s+2*rt*c-rho*s];
    const normal=unit(cross(dv,du)),E=dot(du,du),F=dot(du,dv),G=dot(dv,dv),det=E*G-F*F;
    const e=dot(normal,duu),f=dot(normal,duv),g=dot(normal,dvv),gaussian=(e*g-f*f)/det,trace=(e*G-2*f*F+g*E)/det,
      gap=Math.sqrt(Math.max(0,trace*trace-4*gaussian));
    return {point,du,dv,duu,duv,dvv,normal,principal:[(trace-gap)/2,(trace+gap)/2],gaussian,radius:rho,areaElement:Math.sqrt(det)};
  }
  function domain(profile){if(typeof profile==='string')profile=profiles.find(p=>p.id===profile);if(!profile)throw TypeError('A prototype profile is required.');return [profile.seamX,profile.spacing-profile.seamX];}
  return Object.freeze({profiles,createProfile,evaluate,domain,torusRadius,constants:Object.freeze({majorRadius:R,minorRadius:r,neckRadius:.4,TAU})});
});
