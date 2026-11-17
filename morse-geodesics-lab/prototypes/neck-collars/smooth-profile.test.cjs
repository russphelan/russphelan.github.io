'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('./smooth-profile.js');
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);

test('the flat cutoff has exact constant ends, symmetry, and finite analytic derivatives',()=>{
  for(const t of [-2,0,1,3])assert.deepEqual(S.cutoff(t),{value:t<=0?0:1,first:0,second:0});
  for(const t of [1e-300,1e-16,.001,.01,.1,.25,.5,.75,.9,.99,.999,1-1e-16]){
    const a=S.cutoff(t),b=S.cutoff(1-t);
    assert.ok(Object.values(a).every(Number.isFinite));assert.ok(a.value>=0&&a.value<=1&&a.first>=0);
    near(a.value+b.value,1,2e-15);near(a.first,b.first,2e-13);near(a.second,-b.second,2e-12);
  }
  for(const t of [1e-5,1e-3,1-1e-3,1-1e-5]){
    const p=S.cutoff(t);assert.ok(p.first<1e-100&&Math.abs(p.second)<1e-100);
  }
  near(S.cutoff(.5).value,.5);near(S.cutoff(.5).first,2);near(S.cutoff(.5).second,0);
});

test('cutoff jets agree with independent finite differences in the transition',()=>{
  const h=1e-5;
  for(const t of [.04,.1,.2,.37,.5,.68,.81,.93,.96]){
    const p=S.cutoff(t),a=S.cutoff(t-h).value,b=S.cutoff(t+h).value;
    near(p.first,(b-a)/(2*h),2e-7);near(p.second,(b-2*p.value+a)/(h*h),2e-5);
  }
});

function a(x,t){return {r:.4+.1*x+.05*x*x+.03*t+.04*x*t+.02*t*t,
  rx:.1+.1*x+.04*t,rt:.03+.04*x+.04*t,rxx:.1,rxt:.04,rtt:.04};}
function b(x,t){return {r:.8-.07*x+.03*x*x-.02*t+.02*x*t+.01*t*t,
  rx:-.07+.06*x+.02*t,rt:-.02+.02*x+.02*t,rxx:.06,rxt:.02,rtt:.02};}
test('blended radius jets include scaled weight derivatives and mixed terms',()=>{
  const start=1.2,width=.3,h=2e-5;
  const jet=(x,t)=>S.blend(a(x,t),b(x,t),(x-start)/width,width),value=(x,t)=>jet(x,t).r;
  for(const fraction of [.13,.37,.5,.79])for(const t of [.4,.9]){
    const x=start+fraction*width,p=jet(x,t),xm=value(x-h,t),xp=value(x+h,t),tm=value(x,t-h),tp=value(x,t+h);
    near(p.rx,(xp-xm)/(2*h),2e-7);near(p.rt,(tp-tm)/(2*h),2e-9);
    near(p.rxx,(xp-2*p.r+xm)/(h*h),3e-5);near(p.rtt,(tp-2*p.r+tm)/(h*h),3e-6);
    near(p.rxt,(value(x+h,t+h)-value(x+h,t-h)-value(x-h,t+h)+value(x-h,t-h))/(4*h*h),3e-6);
  }
});

test('endpoint blending clones finite input jets without modifying them',()=>{
  const first=Object.freeze(a(1,.2)),second=Object.freeze(b(1,.2)),snapshot=[{...first},{...second}];
  for(const t of [-1,0]){const result=S.blend(first,second,t,.04);assert.deepEqual(result,first);assert.notEqual(result,first);}
  for(const t of [1,2]){const result=S.blend(first,second,t,.04);assert.deepEqual(result,second);assert.notEqual(result,second);}
  assert.ok(Object.values(S.blend(first,second,.5,.04)).every(Number.isFinite));
  assert.deepEqual([first,second],snapshot);
});

test('invalid jets and widths fail explicitly and the classic browser API loads independently',()=>{
  for(const t of [NaN,Infinity,-Infinity])assert.throws(()=>S.cutoff(t),/finite smoothing/);
  for(const width of [0,-1,NaN,Infinity])assert.throws(()=>S.blend(a(0,0),b(0,0),.5,width),/smoothing width/);
  assert.throws(()=>S.blend({},b(0,0),.5,.1),/radius jets/);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./smooth-profile.js'),'utf8'),context);
  near(context.GeodesicNeckSmoothing.cutoff(.5).value,.5);
  assert.equal(typeof context.GeodesicNeckSmoothing.blend,'function');
});
