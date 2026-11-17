/* Collar comparison diagnostics only. These meridian probes are not geodesics
 * in a replacement metric. No production surface or catalogue is modified. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicNeckDiagnostics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a.reduce((sum,x,k)=>sum+x*b[k],0);
  const sub=(a,b)=>a.map((x,k)=>x-b[k]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a),unit=a=>a.map(x=>x/norm(a));
  const angle=(a,b)=>{const scale=norm(a)*norm(b);return scale>1e-25?Math.acos(Math.max(-1,Math.min(1,dot(a,b)/scale))):Math.PI;};
  const location=(x,theta,p)=>({x,theta,point:p.point.slice()});
  function check(G,profile){
    if(typeof G?.evaluate!=='function'||typeof G?.domain!=='function')throw TypeError('A collar geometry evaluator is required.');
    const range=G.domain(profile);
    if(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[1]<=range[0])throw RangeError('A regular collar comparison domain is required.');
    return range;
  }
  function frame(p){
    const speed=norm(p.du),raw=cross(p.du,p.dv),area=norm(raw);
    if(!(speed>1e-12&&area>1e-12))throw RangeError('The probe encountered a degenerate collar chart.');
    // Follow the evaluator's normal orientation even when its chart winding
    // is inward. All derivatives use that same fixed orientation.
    const sign=dot(raw,p.normal)>=0?1:-1,n=raw.map(x=>sign*x/area),t=p.du.map(x=>x/speed),b=cross(n,t);
    const nxRaw=cross(p.duu,p.dv).map((x,k)=>x+cross(p.du,p.duv)[k]);
    const nd=nxRaw.map((x,k)=>sign*(x-dot(nxRaw,n)*n[k])/(area*speed));
    const td=p.duu.map((x,k)=>(x-dot(p.duu,t)*t[k])/(speed*speed));
    const bd=cross(nd,t).map((x,k)=>x+cross(n,td)[k]);
    const axes=[1,-1].map(sign=>({d:n.map((x,k)=>(x+sign*b[k])/Math.SQRT2),
      derivative:nd.map((x,k)=>(x+sign*bd[k])/Math.SQRT2)}));
    return {n,t,b,speed,area,normalTurn:norm(nd),axes};
  }
  function scanCurvature(G,profile,{nx=160,ntheta=96}={}){
    const [a,b]=check(G,profile);
    if(!Number.isInteger(nx)||nx<8||!Number.isInteger(ntheta)||ntheta<8)throw RangeError('Resolved curvature grids are required.');
    let maxPrincipal=0,maxAbsGaussian=0,minGaussian=Infinity,maxGaussian=-Infinity,minArea=Infinity,minRadius=Infinity,maxHeight=0,where=null,gaussianWhere=null,heightWhere=null;
    const rows=[];
    for(let i=0;i<=nx;i++){
      const x=i===nx?b:a+(b-a)*i/nx;let rowMaximum=0,rowGaussian=0;
      for(let j=0;j<ntheta;j++){
        const theta=2*Math.PI*j/ntheta,p=G.evaluate(profile,x,theta),curvature=Math.max(...p.principal.map(Math.abs));
        if(![curvature,p.gaussian,p.radius].every(Number.isFinite))throw RangeError('The curvature scan encountered nonfinite geometry.');
        if(curvature>maxPrincipal){maxPrincipal=curvature;where=location(x,theta,p);}
        if(Math.abs(p.gaussian)>maxAbsGaussian){maxAbsGaussian=Math.abs(p.gaussian);gaussianWhere=location(x,theta,p);}
        minGaussian=Math.min(minGaussian,p.gaussian);maxGaussian=Math.max(maxGaussian,p.gaussian);
        minArea=Math.min(minArea,norm(cross(p.du,p.dv)));minRadius=Math.min(minRadius,p.radius);
        if(Math.abs(p.point[2])>maxHeight){maxHeight=Math.abs(p.point[2]);heightWhere=location(x,theta,p);}
        rowMaximum=Math.max(rowMaximum,curvature);rowGaussian=Math.max(rowGaussian,Math.abs(p.gaussian));
      }
      rows.push({x,maxPrincipal:rowMaximum,maxAbsGaussian:rowGaussian});
    }
    const gridMaxPrincipal=maxPrincipal,gridMaxAbsGaussian=maxAbsGaussian;
    function refine(seed,value,measure){
      let best={...seed,value},dx=(b-a)/nx,dt=2*Math.PI/ntheta,evaluations=0;
      for(let iteration=0;iteration<8;iteration++){
        const center=best;
        for(const i of [-1,0,1])for(const j of [-1,0,1]){
          const x=Math.max(a,Math.min(b,center.x+i*dx)),theta=center.theta+j*dt,p=G.evaluate(profile,x,theta),v=measure(p);evaluations++;
          if(v>best.value)best={...location(x,theta,p),value:v};
        }
        dx/=2;dt/=2;
      }
      return {...best,evaluations};
    }
    const principalPeak=refine(where,maxPrincipal,p=>Math.max(...p.principal.map(Math.abs)));
    const gaussianPeak=refine(gaussianWhere||where,maxAbsGaussian,p=>Math.abs(p.gaussian));
    const heightPeak=refine(heightWhere||where,maxHeight,p=>Math.abs(p.point[2]));maxHeight=heightPeak.value;
    maxPrincipal=principalPeak.value;maxAbsGaussian=gaussianPeak.value;
    const refinedGaussian=G.evaluate(profile,gaussianPeak.x,gaussianPeak.theta).gaussian;
    minGaussian=Math.min(minGaussian,refinedGaussian);maxGaussian=Math.max(maxGaussian,refinedGaussian);
    where={x:principalPeak.x,theta:principalPeak.theta,point:principalPeak.point};
    return {profile:profile.id,nx,ntheta,samples:(nx+1)*ntheta,domain:[a,b],maxPrincipal,maxAbsGaussian,
      gridMaxPrincipal,gridMaxAbsGaussian,peakRefinement:{iterations:8,principal:principalPeak,gaussian:gaussianPeak},
      minGaussian,maxGaussian,minArea,minRadius,maxHeight,heightWhere:heightPeak,where,rows};
  }
  function sampleProbe(G,profile,{theta=0,amplitude=.12,gain=3,safety=true,count=600,mode=1,direction=1}={}){
    const [a,b]=check(G,profile);
    if(!Number.isFinite(theta)||!Number.isFinite(amplitude)||!Number.isFinite(gain)||gain<=0||!Number.isInteger(count)||count<16||count>20000||
      !Number.isSafeInteger(mode)||mode<1||mode>128||count<8*mode||direction!==1&&direction!==2)throw RangeError('Finite resolved probe settings are required.');
    const h=(b-a)/count,base=[];let length=0;
    for(let i=0;i<=count;i++){
      const x=i===count?b:a+h*i,p=G.evaluate(profile,x,theta),f=frame(p);
      if(i){
        const previous=base[i-1],mid=G.evaluate(profile,(previous.x+x)/2,theta);
        length+=(x-previous.x)*(previous.frame.speed+4*norm(mid.du)+f.speed)/6;
      }
      base.push({x,p,frame:f,s:length});
    }
    let rate=0,maxNormalTurn=0,maxAxisTurn=0;
    for(const row of base){
      const f=row.s===0||row===base.at(-1)?0:Math.sin(mode*Math.PI*row.s/length);
      row.f=f;maxNormalTurn=Math.max(maxNormalTurn,row.frame.normalTurn);
      const turning=Math.max(...row.frame.axes.map(axis=>norm(axis.derivative)));
      maxAxisTurn=Math.max(maxAxisTurn,turning);rate=Math.max(rate,Math.abs(f)*turning);
    }
    const rotation=Math.abs(amplitude)*rate*1.05,limit=rotation>0?.45/rotation:Infinity;
    const safeGain=gain<=limit?gain/(1+(gain/limit)**8)**.125:limit/(1+(limit/gain)**8)**.125;
    const appliedGain=safety?safeGain:gain,points=[],guides=[];let minForward=Infinity,minSpeed=Infinity,backward=0,maxDisplayTurn=0;
    for(const row of base){
      const {p,frame:f,s}=row,{d,derivative}=f.axes[direction-1],wave=row.f,velocity=mode*Math.PI/length*Math.cos(mode*Math.PI*s/length);
      const offset=amplitude*appliedGain*wave,point=p.point.map((x,k)=>x+offset*d[k]);
      const qprime=f.t.map((x,k)=>x+appliedGain*amplitude*(velocity*d[k]+wave*derivative[k]));
      const forward=dot(qprime,f.t),speed=norm(qprime);
      minForward=Math.min(minForward,forward);minSpeed=Math.min(minSpeed,speed);if(forward<0)backward++;
      points.push({x:row.x,s,original:p.point.slice(),point,normal:f.n.slice(),tangent:f.t.slice(),f:wave,envelope:wave,
        y:direction===1?[amplitude*wave,0]:[0,amplitude*wave],normalTurn:f.normalTurn,axisTurn:norm(derivative),
        kappaMax:Math.max(...p.principal.map(Math.abs)),gaussian:p.gaussian,displaySpeed:speed,forward});
    }
    for(let i=1;i<points.length-1;i++)maxDisplayTurn=Math.max(maxDisplayTurn,angle(sub(points[i].point,points[i-1].point),sub(points[i+1].point,points[i].point)));
    for(let bin=0;bin<20;bin++){
      let selected=null,maximum=1e-12;
      for(const p of points)if(p.s>0&&p.s<length&&Math.min(19,Math.floor(20*p.s/length))===bin){
        const size=norm(sub(p.point,p.original));if(size>maximum){selected=p;maximum=size;}
      }
      if(selected)guides.push({s:selected.s,original:selected.original.slice(),point:selected.point.slice()});
    }
    return {profile:profile.id,theta,amplitude,direction,mode,length,points,guides,
      envelope:'sin(mode * pi * probe arclength / probe length)',lengthMeaning:'Euclidean arclength of the comparison probe only',
      disclaimer:'Matched collar meridian probe with a common sine test envelope; not a recomputed geodesic, Jacobi field, or Hessian mode. No ambient variation length is measured here.',
      metrics:{maxNormalTurn,maxAxisTurn,requestedGain:gain,appliedGain,safeGain,limited:safety&&appliedGain<gain*(1-1e-4),
        frameDriftBound:appliedGain*rotation,minForward,minSpeed,backwardFraction:backward/points.length,maxDisplayTurn,
        peakDisplacement:Math.max(...points.map(p=>norm(sub(p.point,p.original)))),count}};
  }
  function sampleObliqueProbe(G,profile,{turn=Math.PI/2,...options}={}){
    if(!Number.isFinite(turn))throw RangeError('A finite probe turn is required.');
    const [a,b]=check(G,profile),k=turn/(b-a);
    const chart={domain:p=>G.domain(p),evaluate(p,x,theta){
      const q=G.evaluate(p,x,theta+k*(x-a));
      return {...q,du:q.du.map((v,i)=>v+k*q.dv[i]),
        duu:q.duu.map((v,i)=>v+2*k*q.duv[i]+k*k*q.dvv[i]),
        duv:q.duv.map((v,i)=>v+k*q.dvv[i])};
    }};
    const probe=sampleProbe(chart,profile,options);
    return {...probe,turn,probeKind:'oblique',disclaimer:'Oblique comparison probe with a common sine test envelope; not a recomputed geodesic, Jacobi field, or Hessian mode.'};
  }
  function compareGrids(coarse,fine){
    return {coarse:{nx:coarse.nx,ntheta:coarse.ntheta,gridMaxPrincipal:coarse.gridMaxPrincipal,gridMaxAbsGaussian:coarse.gridMaxAbsGaussian,maxPrincipal:coarse.maxPrincipal,maxAbsGaussian:coarse.maxAbsGaussian},
      fine:{nx:fine.nx,ntheta:fine.ntheta,gridMaxPrincipal:fine.gridMaxPrincipal,gridMaxAbsGaussian:fine.gridMaxAbsGaussian,maxPrincipal:fine.maxPrincipal,maxAbsGaussian:fine.maxAbsGaussian},
      principalRelativeChange:Math.abs(fine.maxPrincipal-coarse.maxPrincipal)/Math.max(1e-12,fine.maxPrincipal),
      gaussianRelativeChange:Math.abs(fine.maxAbsGaussian-coarse.maxAbsGaussian)/Math.max(1e-12,fine.maxAbsGaussian),
      gridPrincipalRelativeChange:Math.abs(fine.gridMaxPrincipal-coarse.gridMaxPrincipal)/Math.max(1e-12,fine.gridMaxPrincipal),
      gridGaussianRelativeChange:Math.abs(fine.gridMaxAbsGaussian-coarse.gridMaxAbsGaussian)/Math.max(1e-12,fine.gridMaxAbsGaussian)};
  }
  return Object.freeze({scanCurvature,sampleProbe,sampleObliqueProbe,compareGrids});
});
