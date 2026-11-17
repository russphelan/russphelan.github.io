/* Display-only reveal of precomputed presentation paths. All times are supplied
 * by the app; this controller never searches, integrates, or owns an animation
 * loop. A newly added summand retains older groups while revealing its own.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create({curves,stage,intervalMs=1200}={}){
    if(!Array.isArray(curves))throw TypeError('Presentation curves must be an array.');
    if(!Number.isSafeInteger(stage)||stage<1||stage>3)throw RangeError('Presentation stage must be 1, 2, or 3.');
    if(!Number.isFinite(intervalMs)||intervalMs<=0)throw RangeError('Positive finite reveal interval required.');
    const seen=new Set(),old=[],added=[];
    for(const curve of curves){
      if(typeof curve?.id!=='string'||!curve.id||seen.has(curve.id))throw RangeError('Unique nonempty presentation path ids required.');
      seen.add(curve.id);
      const group=curve.presentation?.group??1;
      if(!Number.isSafeInteger(group)||group<1||group>stage)throw RangeError('Path group must not exceed its presentation stage.');
      (group<stage?old:added).push(curve.id);
    }
    const oldIds=new Set(old),order=new Map(added.map((id,i)=>[id,i]));
    let position=0,playing=false;
    function snapshot(){
      const complete=Math.min(added.length,Math.floor(position));
      const activeProgress=complete<added.length?position-complete:0;
      const activeId=complete<added.length?added[complete]:null;
      const completeIds=old.concat(added.slice(0,complete));
      const visibleIds=activeProgress>0?completeIds.concat(activeId):completeIds.slice();
      return {playing,done:complete===added.length,shown:visibleIds.length,total:curves.length,
        inherited:old.length,completed:completeIds.length,newShown:visibleIds.length-old.length,newTotal:added.length,
        progress:added.length?position/added.length:1,activeId,activeProgress,visibleIds,completeIds};
    }
    function play(){playing=position<added.length;return snapshot();}
    function pause(){playing=false;return snapshot();}
    function replay({playing:autoplay=true}={}){position=0;playing=!!autoplay&&added.length>0;return snapshot();}
    function showAll(){position=added.length;playing=false;return snapshot();}
    function next(){position=Math.min(added.length,Math.floor(position)+1);playing=false;return snapshot();}
    function advance(elapsedMs,{active=true,ready=true}={}){
      if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw RangeError('Finite nonnegative elapsed time required.');
      // A resumed/slow frame cannot reveal an entire batch. Background tabs and
      // connected-sum construction can explicitly suspend this same clock.
      if(playing&&active&&ready){
        position=Math.min(added.length,position+Math.min(elapsedMs,80)/intervalMs);
        if(position>=added.length)playing=false;
      }
      return snapshot();
    }
    function fraction(id){
      if(oldIds.has(id))return 1;
      const index=order.get(id);
      return index===undefined?0:Math.max(0,Math.min(1,position-index));
    }
    return Object.freeze({snapshot,play,pause,replay,showAll,next,advance,fraction});
  }
  return Object.freeze({create});
});
