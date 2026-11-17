/* Linear vertical magnification for signed Jacobi graphs. The logarithmic
 * slider controls only display gain; it never compresses field magnitudes,
 * changes arclength, or moves a conjugate point.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicJacobiGraphScale=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function gain(exponent){
    if(!Number.isFinite(exponent))throw new RangeError('Finite zoom exponent required.');
    return 10**Math.max(-1,Math.min(6,exponent));
  }
  function reference(amplitude){
    if(!Number.isFinite(amplitude)||amplitude<=0)throw new RangeError('Positive finite field amplitude required.');
    return amplitude;
  }
  function range(amplitude,zoom=1){
    reference(amplitude);
    if(!Number.isFinite(zoom)||zoom<=0)throw new RangeError('Positive finite graph gain required.');
    return amplitude/zoom;
  }
  function scaled(value,amplitude,zoom=1){
    if(!Number.isFinite(value))throw new RangeError('Finite field value required.');
    if(!Number.isFinite(zoom)||zoom<=0)throw new RangeError('Positive finite graph gain required.');
    return value/reference(amplitude)*zoom;
  }
  function format(value){
    if(!Number.isFinite(value))return '—';
    const size=Math.abs(value);
    return size!==0&&(size<.001||size>=10000)?value.toExponential(2):Number(value.toPrecision(3)).toLocaleString('en-US');
  }
  return {gain,range,scaled,format};
});
