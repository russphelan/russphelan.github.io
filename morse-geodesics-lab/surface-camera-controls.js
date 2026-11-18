/* Input and framing only: the surface metric and trajectories are untouched. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./camera.js'),require('./camera-gestures.js'));
  else root.GeodesicSurfaceCameraControls=factory(root.GeodesicCamera,root.GeodesicCameraGestures);
})(typeof globalThis!=='undefined'?globalThis:this,function(Camera,Gestures){
  'use strict';
  function create({canvas,stage,help,marker,buttons,getScene,onChange,onBegin=()=>{},window:win=canvas.ownerDocument.defaultView}){
    const doc=canvas.ownerDocument,listeners=[];
    let animation=0,focusPoint=null,destroyed=false;
    const listen=(node,type,fn,options)=>{if(!node)return;node.addEventListener(type,fn,options);listeners.push([node,type,fn,options]);};
    const scene=()=>{const box=canvas.getBoundingClientRect();return {...getScene(),width:Math.max(1,box.width),height:Math.max(1,box.height)};};
    const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    function input(type){
      const touch=type==='touch'||type==='pen'&&((win.navigator?.maxTouchPoints||0)>0);
      canvas.dataset.cameraInput=touch?'touch':'mouse';
      if(help)help.textContent=touch?'One finger: turn · two fingers: move / pinch · double-tap: focus':'Drag to turn · scroll to zoom at pointer · double-click to focus';
    }
    function stopAnimation(){if(animation)win.cancelAnimationFrame(animation);animation=0;}
    function begin(){stopAnimation();onBegin();}
    function sync(){
      if(!marker)return;
      if(!focusPoint){marker.hidden=true;return;}
      const s=scene(),f=Camera.frame(s.bounds,s.camera,s.width,s.height),p=Camera.project(f,focusPoint);
      marker.hidden=!(p.depth>f.near&&p.x>=0&&p.x<=s.width&&p.y>=0&&p.y<=s.height);
      if(!marker.hidden)marker.style.transform='translate('+p.x+'px,'+p.y+'px)';
    }
    function change(camera,{smooth=false}={}){
      stopAnimation();
      if(!smooth||reduced()||!win.requestAnimationFrame){onChange(camera);sync();return;}
      const s=scene(),from=s.camera,start=win.performance?.now?.()??Date.now();
      const fromDistance=Camera.frame(s.bounds,from,s.width,s.height).distance,toDistance=Camera.frame(s.bounds,camera,s.width,s.height).distance;
      const yaw=Math.atan2(Math.sin(camera.yaw-from.yaw),Math.cos(camera.yaw-from.yaw));
      const pitch=Math.atan2(Math.sin(camera.pitch-from.pitch),Math.cos(camera.pitch-from.pitch));
      const offsets=from.targetOffset||[0,0,0],target=camera.targetOffset||[0,0,0];
      function step(now){
        animation=0;if(destroyed)return;
        if(scene().model!==s.model){focusPoint=null;sync();return;}
        const t=Math.max(0,Math.min(1,(now-start)/190)),a=t*t*(3-2*t);
        const next={...camera,yaw:from.yaw+yaw*a,pitch:from.pitch+pitch*a,targetOffset:offsets.map((v,i)=>v+(target[i]-v)*a)};
        const scale=Camera.frame(s.bounds,next,s.width,s.height).zoomScale;
        next.zoom=Math.exp(Math.log(fromDistance)*(1-a)+Math.log(toDistance)*a)/scale;
        onChange(t===1?camera:next);sync();
        if(t<1)animation=win.requestAnimationFrame(step);
      }
      animation=win.requestAnimationFrame(step);
    }
    function fit(){begin();focusPoint=null;change(Camera.fitAll(scene()),{smooth:true});}
    function reset(){begin();focusPoint=null;change(Camera.defaultCamera(),{smooth:true});}
    function focus({x,y}){
      begin();const s=scene(),picked=Camera.anchorAt(Camera.frame(s.bounds,s.camera,s.width,s.height),x,y,s.model);
      if(!picked.hit){focusPoint=null;change(Camera.fitAll(s),{smooth:true});return;}
      focusPoint=picked.point.slice();change(Camera.focusAt({...s,x,y}),{smooth:true});
    }
    function turn(dx,dy){const s=scene();change(Camera.turn(s.camera,dx*.007,-dy*.007));}
    function zoom(factor){begin();focusPoint=null;const s=scene();change(Camera.zoomAt({...s,x:s.width/2,y:s.height/2,factor}));}
    function view(value){
      if(value!=='top'&&value!=='bottom')return;
      begin();const s=scene(),before=Camera.frame(s.bounds,s.camera,s.width,s.height);
      const camera={...s.camera,pitch:value==='top'?Math.PI/2:-Math.PI/2};
      const after=Camera.frame(s.bounds,camera,s.width,s.height);
      change({...camera,zoom:before.distance/after.zoomScale},{smooth:true});
    }
    const navigation=Gestures.create({element:canvas,enabled:()=>!destroyed&&!doc.hidden,
      onStart:begin,onInput:input,onRotate:({dx,dy})=>turn(dx,dy),
      onTransform:gesture=>{focusPoint=null;change(Camera.touchTransform({...scene(),...gesture}));},onFocus:focus});
    listen(buttons.left,'click',()=>{begin();change(Camera.turn(scene().camera,-.18,0));});
    listen(buttons.right,'click',()=>{begin();change(Camera.turn(scene().camera,.18,0));});
    listen(buttons.in,'click',()=>zoom(.9));listen(buttons.out,'click',()=>zoom(1/.9));
    listen(buttons.reset,'click',reset);listen(buttons.fit,'click',fit);
    listen(buttons.view,'change',()=>{view(buttons.view.value);buttons.view.value='';});
    listen(stage,'wheel',event=>{
      if(event.target.closest?.('.scene-toolbar,.surgery-controls'))return;
      event.preventDefault();begin();input('mouse');focusPoint=null;
      const s=scene(),box=canvas.getBoundingClientRect(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?s.height:1);
      change(Camera.zoomAt({...s,x:event.clientX-box.left,y:event.clientY-box.top,factor:Math.exp(Math.max(-300,Math.min(300,delta))*.001)}));
    },{passive:false});
    listen(canvas,'keydown',event=>{
      const turns={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.1],ArrowDown:[0,-.1]};
      if(turns[event.key]){event.preventDefault();begin();change(Camera.turn(scene().camera,...turns[event.key]));}
      else if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?1/.9:.9);}
      else if(event.key==='Home'){event.preventDefault();reset();}
    });
    function cancel(){stopAnimation();navigation.cancel();focusPoint=null;sync();}
    listen(doc,'pointerdown',event=>{if(event.target!==canvas&&!canvas.contains?.(event.target))cancel();},true);
    listen(doc,'keydown',event=>{if(event.target!==canvas)cancel();},true);
    listen(canvas,'webglcontextlost',cancel);
    listen(win,'blur',cancel);listen(win,'pagehide',cancel);listen(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});
    input((win.navigator?.maxTouchPoints||0)>0||win.matchMedia?.('(any-pointer: coarse)').matches?'touch':'mouse');
    return Object.freeze({sync,cancel,fit,reset,view,focus,destroy(){if(destroyed)return;cancel();destroyed=true;navigation.destroy();for(const [node,type,fn,options]of listeners)node.removeEventListener(type,fn,options);}});
  }
  return Object.freeze({create});
});
