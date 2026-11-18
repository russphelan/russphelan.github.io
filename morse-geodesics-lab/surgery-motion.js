/* Display-only staging around the connected-sum geometry animation.
 * Progress includes a source-layer fade and target-layer restoration. The
 * geometry parameter stays exactly zero/one during those fades, keeping the
 * initial/final camera bounds and surfaces fixed. No Riemannian data changes.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSurgeryMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
  function cameraAt(from,to,geometry,framing={}){
    const amount=smooth(geometry/.12);
    if(amount===0)return from;if(amount===1)return to;
    const angle=(a,b)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*amount;
    const start=from.targetOffset||[0,0,0],end=to.targetOffset||[0,0,0];
    const camera={...to,yaw:angle(from.yaw,to.yaw),pitch:angle(from.pitch,to.pitch),
      zoom:Math.exp(Math.log(from.zoom)*(1-amount)+Math.log(to.zoom)*amount),
      targetOffset:start.map((v,i)=>v+(end[i]-v)*amount)};
    const positive=value=>Number.isFinite(value)&&value>0;
    const localFrom=from.localFocus&&positive(from.localFit),localTo=to.localFocus&&positive(to.localFit);
    if(localFrom||localTo){
      // Local close-ups measure their zoom against a fixed reference distance.
      // Keep that reference during staging instead of dropping it on the
      // first geometry frame. The renderer supplies the current destination
      // fit, accounting for the bounds changing as the next summand appears.
      const fit=positive(framing.fit)?framing.fit:localFrom?from.localFit:to.localFit;
      const startFit=localFrom?from.localFit:fit,endFit=localTo?to.localFit:fit;
      camera.localFocus=true;
      camera.localFit=Math.exp(Math.log(startFit)*(1-amount)+Math.log(endFit)*amount);
    }
    return camera;
  }
  function create({durationMs=16000,surfaceVisible=true,wire=false,surfaceOpacity=.55,fadeMs=650}={}){
    if(!(durationMs>0)||!Number.isFinite(durationMs)||!(fadeMs>=0)||!Number.isFinite(fadeMs))throw RangeError('Finite positive construction duration and nonnegative fade duration required.');
    const opacity=clamp(surfaceOpacity,0,1),needsFade=!surfaceVisible||wire;
    const fade=needsFade?fadeMs:0,total=durationMs+2*fade;
    const fadeFraction=fade/total,fadeOutStart=1-fadeFraction;
    function sample(progress){
      const p=clamp(progress,0,1);
      let phase='construct',geometry=fadeFraction?clamp((p-fadeFraction)/(1-2*fadeFraction),0,1):p;
      let fill=opacity,grid=0,blend=1;
      if(fadeFraction&&p<fadeFraction){
        phase='fade-in';geometry=0;blend=smooth(p/fadeFraction);
        fill=surfaceVisible?opacity:opacity*blend;grid=wire?.18*(1-blend):0;
      }else if(fadeFraction&&p>=fadeOutStart){
        phase='fade-out';geometry=1;blend=smooth((p-fadeOutStart)/fadeFraction);
        fill=surfaceVisible?opacity:opacity*(1-blend);grid=wire?.18*blend:0;
      }
      return {phase,geometry,fill,grid,blend,progress:p};
    }
    return {durationMs:total,fadeFraction,fadeOutStart,sample,
      advance(progress,elapsed,{paused=false,ready=true}={}){
        if(paused||!ready)return clamp(progress,0,1);
        // A stalled/preparing frame cannot skip the fade or early geometry.
        return clamp(progress+clamp(elapsed,0,100)/total,0,1);
      },
      finishProgress(progress,reducedMotion=false){return reducedMotion||!fadeFraction||progress>=fadeOutStart?1:fadeOutStart;}
    };
  }
  return {create,cameraAt};
});
