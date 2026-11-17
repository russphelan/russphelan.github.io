'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G=require('./geometry.js'),S=require('./reference-surface.js'),H=require('./height-profile.js');
const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),sub=(a,b)=>a.map((x,k)=>x-b[k]);
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} differs from ${b}`);
const nearVector=(a,b,t)=>a.forEach((v,k)=>near(v,b[k],t));

test('prototype baseline evaluates the actual production neck and meets exact outer torus context',()=>{
  const p=G.profiles[0],model=S.getModel('double'),[a,b]=G.domain(p);
  for(const x of [a,1.4,1.75,2,2.25,b])for(const theta of [0,.31,.9,Math.PI/2,2.7,5.8]){
    const q=G.evaluate(p,x,theta);near(model.value(q.point),0,2e-13);
    nearVector(q.normal,model.normal(q.point),2e-10);
    near(q.gaussian,model.curvature(q.point),2e-10);
  }
  for(let i=0;i<100;i++){
    const theta=2*Math.PI*i/100;near(G.evaluate(p,a,theta).radius,G.torusRadius(a,theta).r,1e-12);
    near(G.evaluate(p,b,theta).radius,G.torusRadius(a,theta).r,1e-12);
  }
});

test('analytic parametric jets agree with independent finite differences through second order',()=>{
  const h=1e-4;
  for(const p of G.profiles)for(const f of [.13,.37,.54,.83])for(const theta of [.21,.83,1.42,2.52]){
    const [a,b]=G.domain(p),x=a+(b-a)*f,q=G.evaluate(p,x,theta),point=(xx,t)=>G.evaluate(p,xx,t).point;
    const xm=point(x-h,theta),xp=point(x+h,theta),tm=point(x,theta-h),tp=point(x,theta+h);
    nearVector(q.du,sub(xp,xm).map(v=>v/(2*h)),3e-6);
    nearVector(q.dv,sub(tp,tm).map(v=>v/(2*h)),3e-6);
    nearVector(q.duu,xp.map((v,k)=>(v-2*q.point[k]+xm[k])/(h*h)),4e-4);
    nearVector(q.dvv,tp.map((v,k)=>(v-2*q.point[k]+tm[k])/(h*h)),4e-4);
    const mm=point(x-h,theta-h),mp=point(x-h,theta+h),pm=point(x+h,theta-h),pp=point(x+h,theta+h);
    nearVector(q.duv,pp.map((v,k)=>(v-pm[k]-mp[k]+mm[k])/(4*h*h)),4e-4);
  }
});

test('height-bounded collars match the torus and extruded stadium joins through second derivatives',()=>{
  // The optimal seam is near the torus's inner radial-chart limit. Its
  // derivatives change rapidly there, so compare actual one-sided limits.
  const eps=1e-9;
  for(const p of G.profiles.slice(1))for(const theta of [0,.41,1.1,Math.PI/2,2.5]){
    for(const seam of [p.seamX,p.collarEnd,p.spacing-p.collarEnd,p.spacing-p.seamX]){
      const before=G.evaluate(p,seam-eps,theta),after=G.evaluate(p,seam+eps,theta);
      for(const key of ['point','du','dv','duu','duv','dvv'])nearVector(before[key],after[key],4e-5);
    }
    const end=G.evaluate(p,p.collarEnd,theta),target=H.targetRadius(p,theta),
      curvature=(target.r*target.r+2*target.rt*target.rt-target.r*target.rtt)/(target.r*target.r+target.rt*target.rt)**1.5;
    near(end.radius,target.r);near(end.principal[0],-curvature);near(end.principal[1],0);near(end.gaussian,0);
    nearVector(end.du,[1,0,0],1e-12);nearVector(end.duu,[0,0,0],1e-12);nearVector(end.duv,[0,0,0],1e-12);
    nearVector(end.dv,[0,target.rt*Math.cos(theta)-target.r*Math.sin(theta),target.rt*Math.sin(theta)+target.r*Math.cos(theta)],1e-12);
    const edge=G.evaluate(p,p.seamX,theta),torus=G.torusRadius(p.seamX,theta);
    near(edge.radius,torus.r);near(edge.du[1],torus.rx*Math.cos(theta));
  }
});

test('selectable candidates remain positive and regular, and lower sampled peak principal curvature',()=>{
  const maxima=[];
  for(const p of G.profiles){let maximum=0;const [a,b]=G.domain(p);
    for(let i=0;i<=100;i++)for(let j=0;j<64;j++){
      const q=G.evaluate(p,a+(b-a)*i/100,2*Math.PI*j/64);
      assert.ok(q.radius>.1&&q.areaElement>.28);near(Math.hypot(...q.normal),1,1e-12);
      near(dot(q.normal,q.du),0,1e-12);near(dot(q.normal,q.dv),0,1e-12);
      near(q.principal[0]*q.principal[1],q.gaussian,2e-12);
      maximum=Math.max(maximum,...q.principal.map(Math.abs));
    }
    maxima.push(maximum);
  }
  assert.ok(maxima[0]>8,'The baseline scan resolves the known sharp shoulder.');
  for(const maximum of maxima.slice(1))assert.ok(maximum<.6*maxima[0],JSON.stringify(maxima));
});

test('every selectable alternative has an analytic whole-collar height certificate',()=>{
  assert.deepEqual(G.profiles.map(p=>p.id),['current','height-optimal','height-compact','height-waisted']);
  for(const p of G.profiles.slice(1)){
    assert.equal(p.kind,'height');assert.match(p.smoothness,/C∞/);
    const certificate=H.heightCertificate(p),[a,b]=G.domain(p);
    assert.equal(certificate.bound,G.constants.minorRadius);assert.equal(certificate.bodyBound,certificate.bound);
    assert.ok(certificate.targetBound<=certificate.bound);assert.ok(certificate.sourceMaximum<certificate.sourceChartEnd);
    assert.match(certificate.collar,/convex combination/);
    // The exact section dimensions and convex radial blend supply the bound;
    // this independent sample catches a wrong dispatch or coordinate mapping.
    near(G.evaluate(p,p.collarEnd,0).point[1],p.halfWidth,1e-12);
    near(G.evaluate(p,p.collarEnd,Math.PI/2).point[2],p.halfHeight,1e-12);
    for(let i=0;i<=80;i++)for(let j=0;j<160;j++)
      assert.ok(Math.abs(G.evaluate(p,a+(b-a)*i/80,2*Math.PI*j/160).point[2])<=certificate.bound+2e-12,p.id);
  }
});

test('prototype reflection and periodicity preserve the two actual torus attachments',()=>{
  for(const p of G.profiles){const [a,b]=G.domain(p),x=a+.29*(b-a);
    for(const theta of [.2,1.2,2.4,4.1]){
      const left=G.evaluate(p,x,theta),right=G.evaluate(p,p.spacing-x,theta),again=G.evaluate(p,x,theta+2*Math.PI);
      nearVector(again.point,left.point,2e-12);nearVector(again.normal,left.normal,2e-11);
      near(right.radius,left.radius,2e-12);near(right.gaussian,left.gaussian,2e-9);
      nearVector(right.point,[p.spacing-left.point[0],left.point[1],left.point[2]],2e-12);
    }
  }
  assert.throws(()=>G.createProfile({id:'bad',seamX:.8}),/dimensions/);
  assert.throws(()=>G.evaluate(null,1,0),/profile/);
});

test('height-safe source-warp windows retain correct analytic jets and reflection',()=>{
  const h=1e-5;
  for(const p of G.profiles.filter(p=>p.kind==='height'))for(const theta of [.23,.91,1.47])
    for(const start of [p.seamX,p.seamX+2*p.sourceAdvance-p.smoothing])for(const fraction of [.2,.5,.8]){
      const x=start+fraction*p.smoothing,q=G.evaluate(p,x,theta),at=(xx,t)=>G.evaluate(p,xx,t).point,
        xm=at(x-h,theta),xp=at(x+h,theta),tm=at(x,theta-h),tp=at(x,theta+h),
        mm=at(x-h,theta-h),mp=at(x-h,theta+h),pm=at(x+h,theta-h),pp=at(x+h,theta+h);
      nearVector(q.du,sub(xp,xm).map(v=>v/(2*h)),2e-6);
      nearVector(q.dv,sub(tp,tm).map(v=>v/(2*h)),2e-6);
      nearVector(q.duu,xp.map((v,k)=>(v-2*q.point[k]+xm[k])/(h*h)),.002);
      nearVector(q.dvv,tp.map((v,k)=>(v-2*q.point[k]+tm[k])/(h*h)),.002);
      nearVector(q.duv,pp.map((v,k)=>(v-pm[k]-mp[k]+mm[k])/(4*h*h)),.002);
      near(q.gaussian,G.evaluate(p,p.spacing-x,theta).gaussian,2e-8);
      assert.match(p.smoothness,/C∞/);
    }
});

test('all source-warp transition knots meet through second derivatives',()=>{
  const eps=1e-9;
  for(const p of G.profiles.filter(p=>p.kind==='height'))for(const theta of [.19,.8,1.4]){
    const knots=[p.seamX,p.seamX+p.smoothing,p.seamX+2*p.sourceAdvance-p.smoothing,p.seamX+2*p.sourceAdvance,p.collarEnd];
    for(const knot of knots)for(const x of [knot,p.spacing-knot]){
      const before=G.evaluate(p,x-eps,theta),after=G.evaluate(p,x+eps,theta);
      for(const key of ['point','du','dv','duu','duv','dvv'])nearVector(before[key],after[key],3e-5);
    }
  }
});
