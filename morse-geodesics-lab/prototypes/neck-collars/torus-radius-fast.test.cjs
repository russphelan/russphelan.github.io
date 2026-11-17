'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Fast=require('./torus-radius-fast.js'),G=require('./geometry.js');
const near=(a,b,rel=2e-9)=>assert.ok(Math.abs(a-b)<=rel*Math.max(1,Math.abs(a),Math.abs(b)),`${a} versus ${b}`);

test('fast torus radius jets match the independent fourth-order boundary evaluator',()=>{
  for(let i=0;i<=40;i++)for(let j=0;j<64;j++){
    const x=1+.7*i/40,theta=2*Math.PI*j/64,a=Fast.evaluate(x,theta),b=G.torusRadius(x,theta);
    for(const key of ['r','rx','rt','rxx','rxt','rtt'])near(a[key],b[key]);
  }
});
test('radial jets have the exact circle derivatives in the symmetry planes',()=>{
  for(const x of [1,1.2,1.35,1.5,1.7]){
    const y=Fast.evaluate(x,0),yr=Math.sqrt(1.8**2-x*x);
    near(y.r,yr);near(y.rx,-x/yr);near(y.rxx,-(1.8**2)/yr**3);
    const z=Fast.evaluate(x,Math.PI/2),zr=Math.sqrt(.45**2-(x-1.35)**2);
    near(z.r,zr);near(z.rx,-(x-1.35)/zr);near(z.rxx,-(.45**2)/zr**3);
    near(y.rt,0);near(z.rt,0);
  }
});
test('invalid radial charts fail and the local classic script exposes its API',()=>{
  for(const [x,theta]of [[.9,0],[1.8,0],[NaN,0],[1.3,Infinity]])assert.throws(()=>Fast.evaluate(x,theta),/radial chart/);
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./torus-radius-fast.js'),'utf8'),context);
  near(context.GeodesicNeckTorusRadius.evaluate(1.3,.4).r,Fast.evaluate(1.3,.4).r);
});
