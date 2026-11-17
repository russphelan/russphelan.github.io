/* Coalesce requested traversal positions while committing only exact,
 * completed surface or hidden studies. No field or endpoint is interpolated. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicSurfaceTraversal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create({window:win,onStart,onCommit}={}){
    if(!win||typeof win.requestAnimationFrame!=='function'||typeof win.cancelAnimationFrame!=='function')throw TypeError('A frame scheduler is required.');
    let running=null,latest=null,frame=0,destroyed=false;
    const same=(a,b)=>a?.data===b?.data&&a?.model===b?.model&&(a?.type??'surface')===(b?.type??'surface')&&Math.abs(a.position-b.position)<=1e-10;
    function start(target){running=target;onStart?.(target);}
    function cancel(){if(frame)win.cancelAnimationFrame(frame);frame=0;const target=latest;running=latest=null;return target;}
    return Object.freeze({
      request(target){
        if(destroyed)return;
        if(!target?.data||!target.model||!Number.isFinite(target.position)||target.position<=0||target.position>target.data.length||!['surface','hidden'].includes(target.type??'surface'))throw RangeError('An exact positive traversal endpoint and supported mode type are required.');
        if(latest&&(latest.data!==target.data||latest.model!==target.model||(latest.type??'surface')!==(target.type??'surface')))cancel();
        latest={...target,type:target.type??'surface'};
        if(!running&&!frame)start(latest);
      },
      accept(study,model){
        if(!running||!study?.result?.points?.length||!['surface','hidden'].includes(study.type)||!same(running,{data:study.data,model,position:study.T,type:study.type}))return false;
        if(study.profile?.rangePending&&!study.profile.currentVerified)return false;
        const completed=running;running=null;onCommit?.(study,completed);
        if(latest&&!same(latest,completed)){
          // Let the completed exact frame paint before starting the latest
          // requested endpoint; intermediate input events need no solve.
          frame=win.requestAnimationFrame(()=>{frame=0;if(!destroyed&&latest)start(latest);});
        }else latest=null;
        return true;
      },
      cancel,
      snapshot(){return {running,latest,pending:!!running||!!frame};},
      destroy(){cancel();destroyed=true;}
    });
  }
  return Object.freeze({create});
});
