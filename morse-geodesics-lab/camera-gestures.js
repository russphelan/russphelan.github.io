/* Direct camera input shared by the surface and its hidden-coordinate view.
 * Only contacts beginning in the view belong to the camera. Controls elsewhere
 * retain their native behavior, including Apple Pencil interaction. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicCameraGestures=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create({element,enabled=()=>true,onRotate,onTransform,onFocus,onInput,onStart,onEnd}={}){
    const doc=element?.ownerDocument,win=doc?.defaultView;
    if(!doc||!win||typeof element.addEventListener!=='function'||typeof element.getBoundingClientRect!=='function')
      throw TypeError('A camera element in a document is required.');
    const pointers=new Map(),pens=new Set(),listeners=[];
    let previous=null,lastTap=null,lastInput=null,destroyed=false;
    const listen=(target,type,handler,options=true)=>{target.addEventListener(type,handler,options);listeners.push([target,type,handler,options]);};
    const active=()=>!destroyed&&!doc.hidden&&enabled();
    const time=event=>Number.isFinite(event.timeStamp)?event.timeStamp:win.performance?.now?.()??Date.now();
    const type=event=>event.pointerType||'mouse';
    function point(event){const box=element.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};}
    function release(id){try{if(!element.hasPointerCapture||element.hasPointerCapture(id))element.releasePointerCapture?.(id);}catch(_){} }
    function frame(){
      const all=[...pointers.values()];if(!all.length)return null;
      if(all[0].type==='touch'&&all.length>1){
        const [a,b]=all;return {kind:'transform',ids:[a.id,b.id],x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.hypot(a.x-b.x,a.y-b.y)};
      }
      const a=all[0];return {kind:'rotate',id:a.id,type:a.type,x:a.x,y:a.y};
    }
    function cancel(){
      const wasActive=pointers.size>0,ids=[...pointers.keys()];pointers.clear();previous=null;lastTap=null;
      for(const id of ids)release(id);
      if(wasActive)onEnd?.({cancelled:true});
    }
    function reset(){pens.clear();cancel();}
    function penDown(event){
      if(type(event)!=='pen'||event.button!==0&&event.button!==undefined||pens.has(event.pointerId))return;
      pens.add(event.pointerId);cancel();
    }
    function down(event){
      if(!active()||event.button!==0&&event.button!==undefined)return;
      // Future view wrappers may contain ordinary controls. They are never
      // camera handles; the current canvases have no interactive descendants.
      if(event.target!==element&&event.target?.closest?.('button,input,select,textarea,summary,[role="slider"],[role="separator"],[data-camera-ignore]'))return;
      const input=type(event);
      if(input==='pen')penDown(event);
      if(input!=='pen'&&pens.size)return;
      if(pointers.has(event.pointerId))return;
      if(input!=='touch'&&(event.isPrimary===false||pointers.size))return;
      if(input==='touch'&&pointers.size&&[...pointers.values()].some(p=>p.type!=='touch'))return;
      const p=point(event);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
      const first=pointers.size===0;
      pointers.set(event.pointerId,{...p,id:event.pointerId,type:input,startX:p.x,startY:p.y,startTime:time(event),moved:false,multi:false});
      if(pointers.size>1){lastTap=null;for(const pointer of pointers.values())pointer.multi=true;}
      if(input!=='touch')lastTap=null;
      previous=frame();lastInput=input;
      try{element.setPointerCapture?.(event.pointerId);}catch(_){}
      if(event.cancelable!==false)event.preventDefault?.();
      if(first){element.focus?.({preventScroll:true});onStart?.({pointerType:input});}
      onInput?.(input);
    }
    function move(event){
      const p=pointers.get(event.pointerId);if(!p)return;
      if(!active()||p.type==='mouse'&&event.buttons===0){cancel();return;}
      const at=point(event);if(!Number.isFinite(at.x)||!Number.isFinite(at.y))return;
      p.x=at.x;p.y=at.y;
      if(Math.hypot(p.x-p.startX,p.y-p.startY)>10){p.moved=true;lastTap=null;}
      const next=frame(),old=previous;previous=next;
      if(event.cancelable!==false)event.preventDefault?.();
      if(!old||!next||old.kind!==next.kind)return;
      if(next.kind==='rotate'){
        if(old.id!==next.id)return;
        const dx=next.x-old.x,dy=next.y-old.y;
        if(dx||dy)onRotate?.({dx,dy,pointerType:next.type});
      }else{
        if(old.ids[0]!==next.ids[0]||old.ids[1]!==next.ids[1])return;
        if(old.x===next.x&&old.y===next.y&&old.span===next.span)return;
        const factor=old.span>=4&&next.span>=4?old.span/next.span:1;
        onTransform?.({from:{x:old.x,y:old.y,span:old.span},to:{x:next.x,y:next.y,span:next.span},factor});
      }
    }
    function end(event){
      const p=pointers.get(event.pointerId);if(event.type!=='lostpointercapture')pens.delete(event.pointerId);if(!p)return;
      const normal=event.type==='pointerup'&&active(),at=point(event),finished=time(event),
        tap=normal&&p.type==='touch'&&!p.multi&&!p.moved&&finished-p.startTime>=0&&finished-p.startTime<=300&&
          Math.hypot(at.x-p.startX,at.y-p.startY)<=10;
      pointers.delete(event.pointerId);previous=frame();release(event.pointerId);
      if(tap){
        if(lastTap&&finished-lastTap.time>=0&&finished-lastTap.time<=350&&Math.hypot(at.x-lastTap.x,at.y-lastTap.y)<=28){
          lastTap=null;onFocus?.({...at,pointerType:'touch'});
        }else lastTap={...at,time:finished};
      }else lastTap=null;
      if(!pointers.size)onEnd?.({pointerType:p.type,cancelled:!normal});
    }
    function doubleClick(event){
      if(!active()||pens.size||pointers.size||lastInput!=='mouse'||event.button!==0&&event.button!==undefined)return;
      const at=point(event);if(!Number.isFinite(at.x)||!Number.isFinite(at.y))return;
      event.preventDefault?.();onFocus?.({...at,pointerType:'mouse'});
    }
    listen(doc,'pointerdown',event=>{if(event.target!==element&&!element.contains?.(event.target))lastTap=null;penDown(event);});
    listen(element,'pointerdown',down,{passive:false});
    listen(win,'pointermove',move,{capture:true,passive:false});
    for(const event of ['pointerup','pointercancel'])listen(win,event,end);
    listen(element,'lostpointercapture',end);
    listen(element,'dblclick',doubleClick);
    listen(win,'blur',event=>{if(event.target===win)reset();});
    listen(win,'pagehide',reset);listen(win,'resize',cancel);listen(win,'scroll',cancel);
    listen(doc,'visibilitychange',()=>{if(doc.hidden)reset();});
    return Object.freeze({cancel,destroy(){
      if(destroyed)return;destroyed=true;reset();
      for(const [target,event,handler,options]of listeners)target.removeEventListener(event,handler,options);
    }});
  }
  return Object.freeze({create});
});
