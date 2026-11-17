/* Observe a held traversal thumb without changing the native range behavior.
 * Pauses in pointer motion remain a hold; only release or cancellation ends it. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicTraversalHold=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(inputs,{onChange}={}){
    const sliders=Array.from(inputs||[]),doc=sliders[0]?.ownerDocument,win=doc?.defaultView;
    if(!sliders.length||!doc||!win||sliders.some(input=>input.ownerDocument!==doc||typeof input.addEventListener!=='function'))
      throw TypeError('Traversal sliders in one document are required.');
    let pointerId=null,destroyed=false;
    const listeners=[],listen=(target,type,handler)=>{target.addEventListener(type,handler,true);listeners.push([target,type,handler]);};
    function clear(){
      if(pointerId===null)return;
      pointerId=null;onChange?.(false);
    }
    function release(event){if(event.pointerId===pointerId)clear();}
    for(const slider of sliders){
      listen(slider,'pointerdown',event=>{
        if(destroyed||pointerId!==null||doc.hidden||slider.disabled||event.button!==0||event.isPrimary===false)return;
        pointerId=event.pointerId;onChange?.(true);
      });
      listen(slider,'lostpointercapture',release);
    }
    for(const type of ['pointerup','pointercancel'])listen(win,type,release);
    listen(win,'pointermove',event=>{if(event.buttons===0)release(event);});
    // Capture also sees blur from the previously focused button or slider.
    // That focus transfer is part of pressing the range, not a window exit.
    listen(win,'blur',event=>{if(event.target===win)clear();});
    listen(win,'pagehide',clear);
    listen(doc,'visibilitychange',()=>{if(doc.hidden)clear();});
    return Object.freeze({isHeld:()=>pointerId!==null,clear,destroy(){
      if(destroyed)return;
      destroyed=true;clear();
      for(const [target,type,handler]of listeners)target.removeEventListener(type,handler,true);
    }});
  }
  return {create};
});
