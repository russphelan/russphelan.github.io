/* Exact second-order radial jets of the unchanged round torus. This avoids
 * evaluating fourth-order boundary jets when a bounded collar only needs
 * position, first derivatives, and second derivatives at a warped x station. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GeodesicNeckTorusRadius=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
});
