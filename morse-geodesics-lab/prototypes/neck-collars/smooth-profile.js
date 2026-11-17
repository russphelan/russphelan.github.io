/* Flat C-infinity transition jets for the isolated collar workbench.
 * Both inputs are radius jets evaluated at the same (x, theta). The weight
 * depends on x only: t = (x - start) / width. No production metric is edited.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GeodesicNeckSmoothing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
});
