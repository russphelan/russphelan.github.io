'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./compact-collar.js'),G=require('./prototypes/neck-collars/geometry.js'),H=require('./prototypes/neck-collars/height-profile.js');
const near=(a,b,t,msg)=>assert.ok(Math.abs(a-b)<=t,`${msg}: ${a} vs ${b}`);
const profile=G.profiles.find(p=>p.id==='height-compact');
test('adopted compact collar is the audited prototype with an analytic height certificate',()=>{
  for(const key of ['seamX','collarEnd','spacing','halfWidth','halfHeight','capSoftness','sourceAdvance','smoothing'])assert.equal(C.profile[key],profile[key]);
  assert.equal(C.heightCertificate.bound,.45);
  for(let i=0;i<=64;i++)for(let j=0;j<97;j++){
    const x=.94+(4-1.88)*i/64,theta=2*Math.PI*j/97,a=C.section(x,theta),b=G.evaluate(profile,x,theta);
    for(const key of ['point','du','dv','duu','duv','dvv','normal','principal'])for(let k=0;k<a[key].length;k++)near(a[key][k],b[key][k],2e-10,key);
    near(a.gaussian,b.gaussian,3e-10,'Gaussian curvature');assert.ok(Math.abs(a.point[2])<=.45+1e-14);
    near(C.value(a.point),0,4e-14,'implicit surface');near(C.jet(a.point).value,0,4e-14,'jet surface');
  }
});
test('safeguarded Newton radial jets match the independent bisection inversion',()=>{
  for(let i=0;i<=2048;i++){
    const theta=2*Math.PI*i/2048,a=C.targetRadius(theta),b=H.targetRadius(profile,theta);
    for(const key of ['r','rt','rtt'])near(a[key],b[key],2e-10,key);
  }
});
test('pullback Cartesian jets agree with independent finite differences off the surface',()=>{
  for(const x of [.940001,.949,.965,.98,1.1,1.3,1.6,1.64,1.66,1.68,1.89,2,2.111,2.65,3.04,3.05999])
    for(const theta of [.03,.4,.63,.7,1.4,2.01,4.92])for(const push of [-.02,.015]){
      const p=C.point(x,theta).map((v,k)=>v+(k===1?push:0)),q=C.jet(p),h=2e-6;
      near(q.value,C.value(p),2e-14,'scalar/jet value');
      for(let axis=0;axis<3;axis++){
        const a=p.slice(),b=p.slice();a[axis]+=h;b[axis]-=h;
        near(q.gradient[axis],(C.value(a)-C.value(b))/(2*h),3e-7,'gradient');
        const ga=C.jet(a).gradient,gb=C.jet(b).gradient;
        for(let row=0;row<3;row++)near(q.hessian[3*row+axis],(ga[row]-gb[row])/(2*h),5e-5,'Hessian');
      }
    }
});
test('the local implicit definition is identity-matched to torus distance at both seams',()=>{
  for(const theta of [.1,.7,1.1,2.9])for(const seam of [.94,3.06])for(const offset of [-.03,.02]){
    const p=C.point(seam,theta);p[2]+=offset;
    const xi=seam<2?seam:4-seam,expected=Math.hypot(Math.hypot(xi,p[1])-1.35,p[2])-.45;
    near(C.value(p),expected,1e-14,'seam signed distance');
  }
});
test('the compact collar classic-script API has no runtime dependencies',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./compact-collar.js'),'utf8'),context);
  assert.equal(context.GeodesicCompactCollar.profile.id,'compact-collar-v1');
  assert.ok(Math.abs(context.GeodesicCompactCollar.value(context.GeodesicCompactCollar.point(2,.7)))<1e-14);
});
