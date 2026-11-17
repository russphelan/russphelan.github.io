'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),H=require('./height-profile.js'),G=require('./geometry.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} versus ${b}`);
const profile=(options={})=>H.createProfile({id:'bounded-test',seamX:1.15,collarEnd:2.35,spacing:5,sourceAdvance:.45,...options});

test('rounded-stadium sections have an analytic height bound and the specified independent width',()=>{
  for(const halfWidth of [.45,.65,.9,1.2])for(const halfHeight of [.4,.45]){
    const p=profile({halfWidth,halfHeight});
    near(H.targetRadius(p,0).r,halfWidth,1e-13);near(H.targetRadius(p,Math.PI/2).r,halfHeight,1e-13);
    const certificate=H.heightCertificate(p);assert.equal(certificate.bound,.45);assert.equal(certificate.targetBound,halfHeight);
    assert.ok(certificate.sourceMaximum<certificate.sourceChartEnd);
    for(let i=0;i<=720;i++){
      const theta=2*Math.PI*i/720,q=H.targetRadius(p,theta),curvature=(q.r*q.r+2*q.rt*q.rt-q.r*q.rtt)/(q.r*q.r+q.rt*q.rt)**1.5;
      assert.ok(Math.abs(q.r*Math.sin(theta))<=halfHeight+2e-13);
      assert.ok(curvature>0&&curvature<=certificate.targetCurvatureBound*(1+1e-11));
    }
  }
});

test('polar radial target jets agree with independent finite differences and preserve symmetry',()=>{
  const p=profile({halfWidth:.9}),h=1e-5;
  for(const theta of [.03,.2,.5,.9,1.2,1.53,1.9,2.9,4.2,5.9]){
    const q=H.targetRadius(p,theta),before=H.targetRadius(p,theta-h),after=H.targetRadius(p,theta+h);
    near(q.rt,(after.r-before.r)/(2*h),3e-6);near(q.rtt,(after.r-2*q.r+before.r)/(h*h),.001);
    near(q.r,H.targetRadius(p,-theta).r,1e-12);near(q.rt,-H.targetRadius(p,-theta).rt,1e-10);
    near(q.r,H.targetRadius(p,theta+2*Math.PI).r,1e-12);
  }
});

test('the source warp stays inside the valid torus chart and joins the identity and constant smoothly',()=>{
  const p=profile(),end=p.seamX+2*p.sourceAdvance,epsilon=1e-7;
  for(let i=0;i<=1000;i++){
    const q=H.sourceWarp(p,p.seamX+2*p.sourceAdvance*i/1000);
    assert.ok(q.value>=p.seamX-1e-13&&q.value<=p.seamX+p.sourceAdvance+1e-13);
    assert.ok(q.first>=-1e-12);
  }
  for(const [x,expected]of [[p.seamX,[p.seamX,1,0]],[end,[p.seamX+p.sourceAdvance,0,0]]]){
    const at=H.sourceWarp(p,x),before=H.sourceWarp(p,x-epsilon),after=H.sourceWarp(p,x+epsilon);
    [at.value,at.first,at.second].forEach((v,i)=>near(v,expected[i],1e-12));
    near(before.first,after.first,1e-9);near(before.second,after.second,1e-8);
  }
});

test('the whole collar remains below the torus height by bounded radial mixing, without clipping',()=>{
  for(const p of [profile(),profile({halfWidth:1.2,halfHeight:.4})])for(let i=0;i<=180;i++)for(let j=0;j<128;j++){
    const x=p.seamX+(p.spacing-2*p.seamX)*i/180,theta=2*Math.PI*j/128,q=H.radius(p,x,theta,G.torusRadius);
    assert.ok(q.r>0&&Math.abs(q.r*Math.sin(theta))<=.45+3e-13);
    const mirrored=H.radius(p,p.spacing-x,theta,G.torusRadius);
    near(q.r,mirrored.r,1e-12);near(q.rx,-mirrored.rx,1e-10);near(q.rtt,mirrored.rtt,1e-10);
  }
});

test('complete radius jets include the warp, C∞ weights, and mixed derivatives',()=>{
  const p=profile(),h=1e-5;
  for(const x of [1.16,1.18,1.35,1.8,2.02,2.04,2.15,2.33,2.6,3.3])for(const theta of [.23,.85,1.4]){
    const at=(xx,t)=>H.radius(p,xx,t,G.torusRadius).r,q=H.radius(p,x,theta,G.torusRadius),v=at(x,theta),xm=at(x-h,theta),xp=at(x+h,theta),tm=at(x,theta-h),tp=at(x,theta+h);
    near(q.rx,(xp-xm)/(2*h),2e-5);near(q.rt,(tp-tm)/(2*h),2e-5);
    near(q.rxx,(xp-2*v+xm)/(h*h),.003);near(q.rtt,(tp-2*v+tm)/(h*h),.003);
    near(q.rxt,(at(x+h,theta+h)-at(x+h,theta-h)-at(x-h,theta+h)+at(x-h,theta-h))/(4*h*h),.003);
  }
});

test('invalid dimensions cannot violate the height contract',()=>{
  for(const options of [{halfHeight:.451},{halfWidth:.3},{capSoftness:0},{sourceAdvance:.7},{smoothing:0},{seamX:.9}])
    assert.throws(()=>profile(options),/height-constrained/);
  const p=profile();assert.ok(Object.isFrozen(p));
  assert.throws(()=>H.radius(p,NaN,0,G.torusRadius),/finite coordinates/);
});

test('cached target jets cannot be mutated by callers and the classic local browser API loads',()=>{
  const p=profile(),expected=H.targetRadius(p,.42),changed=H.targetRadius(p,.42);changed.r=100;
  assert.deepEqual(H.targetRadius(p,.42),expected);
  const context={};vm.createContext(context);
  for(const file of ['./smooth-profile.js','./height-profile.js'])vm.runInContext(fs.readFileSync(require.resolve(file),'utf8'),context);
  const created=context.GeodesicNeckHeightProfile.createProfile({id:'browser-height'});
  assert.equal(context.GeodesicNeckHeightProfile.heightCertificate(created).bound,.45);
});
