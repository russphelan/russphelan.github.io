/* User-sized observation panes. Geometry, cameras, and traversal stay owned by
 * the existing viewers; only their layout dimensions change here. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicViewResize=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function height(value,{minimum=160,viewport=800}={}){
    if(!Number.isFinite(value))throw RangeError('A finite pane height is required.');
    return Math.round(clamp(value,minimum,Math.max(800,2*viewport)));
  }
  function split(value,width,gap=8){
    if(![value,width,gap].every(Number.isFinite)||width<=0||gap<0)throw RangeError('A finite split and positive layout width are required.');
    const available=Math.max(1,width-gap),minimum=Math.min(240,available/2),limit=minimum/available;
    return clamp(value,limit,1-limit);
  }
  function create({workspace,sceneColumn,surfacePanel,hiddenPanel,onResize}={}){
    if(!workspace||!sceneColumn||!surfacePanel||!hiddenPanel)throw TypeError('Both observation panes and their layout are required.');
    const doc=workspace.ownerDocument,win=doc.defaultView,listeners=[];
    let context={docked:false,locked:false},sizes={surface:null,hidden:null,standalone:null,split:null},drag=null,destroyed=false;
    const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
    const viewport=()=>win.innerHeight||800;
    const narrow=()=>win.innerWidth<=700;
    const changed=()=>onResize?.();
    function handle(label,orientation,kind){
      const button=doc.createElement('button');button.type='button';button.className='view-resize-handle view-resize-'+kind;
      button.setAttribute('role','separator');button.setAttribute('aria-label',label);button.setAttribute('aria-orientation',orientation);
      button.title=label+'. Drag, or use arrow keys. Home restores automatic sizing.';
      button.textContent=kind==='width'?'⋮':'↕ Drag to resize height';button.dataset.resizeKind=kind;
      return button;
    }
    const seam=handle('Resize the torus and hidden view widths','vertical','width');
    const surfaceGrip=handle('Resize the 3D view height','horizontal','surface');
    const hiddenGrip=handle('Resize the hidden view height','horizontal','hidden');
    const reset=doc.createElement('button');reset.type='button';reset.className='view-resize-reset';reset.textContent='↔';
    reset.title='Reset view sizes';reset.setAttribute('aria-label','Reset view sizes');
    sceneColumn.append(seam);surfacePanel.append(surfaceGrip);hiddenPanel.append(hiddenGrip);
    (surfacePanel.querySelector('.scene-toolbar')||surfacePanel).append(reset);
    workspace.classList.add('view-resize-ready');surfacePanel.classList.add('view-resize-surface-pane');hiddenPanel.classList.add('view-resize-hidden-pane');
    function setVar(target,name,value){if(target.style.getPropertyValue(name)!==value)target.style.setProperty(name,value);}
    function removeVar(target,name){if(target.style.getPropertyValue(name))target.style.removeProperty(name);}
    function sync(){
      if(destroyed)return;
      const sideBySide=context.docked&&!narrow(),surfaceBox=surfacePanel.getBoundingClientRect(),hiddenBox=hiddenPanel.getBoundingClientRect(),box=sceneColumn.getBoundingClientRect();
      seam.hidden=!sideBySide;
      if(sideBySide){
        const gap=Math.max(0,hiddenBox.left-surfaceBox.right),ratio=surfaceBox.width/Math.max(1,surfaceBox.width+hiddenBox.width);
        setVar(seam,'--seam-left',(surfaceBox.right-box.left+gap/2)+'px');
        setVar(seam,'--seam-top',(surfaceBox.top-box.top)+'px');
        setVar(seam,'--seam-height',Math.max(surfaceBox.height,hiddenBox.height)+'px');
        seam.setAttribute('aria-valuemin','0');seam.setAttribute('aria-valuemax','100');seam.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
        seam.setAttribute('aria-valuetext',Math.round(ratio*100)+' percent torus, '+Math.round((1-ratio)*100)+' percent hidden view');
      }
      for(const [grip,pixels,minimum]of [[surfaceGrip,surfaceBox.height,160],[hiddenGrip,context.docked?hiddenBox.height:hiddenPanel.querySelector('.cutaway-canvas')?.getBoundingClientRect().height||330,context.docked?220:140]]){
        grip.disabled=context.locked;grip.setAttribute('aria-disabled',String(context.locked));
        grip.setAttribute('aria-valuemin',String(minimum));grip.setAttribute('aria-valuemax',String(Math.max(800,2*viewport())));grip.setAttribute('aria-valuenow',String(Math.round(pixels)));
        grip.setAttribute('aria-valuetext',Math.round(pixels)+' pixels tall');
      }
      seam.disabled=context.locked;seam.setAttribute('aria-disabled',String(context.locked));reset.disabled=context.locked;
      workspace.dataset.viewSizes=JSON.stringify(sizes);
    }
    function apply(){
      if(destroyed)return;
      workspace.classList.toggle('view-heights-custom',sizes.surface!==null||sizes.hidden!==null);
      workspace.classList.toggle('view-widths-custom',sizes.split!==null);
      if(sizes.surface!==null){setVar(workspace,'--view-surface-height',sizes.surface+'px');setVar(workspace,'--view-hidden-height',(sizes.hidden??sizes.surface)+'px');setVar(workspace,'--view-row-height',Math.max(sizes.surface,sizes.hidden??sizes.surface)+'px');}
      else for(const name of ['--view-surface-height','--view-hidden-height','--view-row-height'])removeVar(workspace,name);
      if(sizes.split!==null){
        // Responsive fitting must not overwrite the presenter's saved split.
        const ratio=split(sizes.split,sceneColumn.getBoundingClientRect().width);
        setVar(workspace,'--view-surface-track',ratio+'fr');setVar(workspace,'--view-hidden-track',(1-ratio)+'fr');
      }else for(const name of ['--view-surface-track','--view-hidden-track'])removeVar(workspace,name);
      hiddenPanel.classList.toggle('view-standalone-custom',sizes.standalone!==null);
      if(sizes.standalone!==null)setVar(hiddenPanel,'--view-standalone-height',sizes.standalone+'px');else removeVar(hiddenPanel,'--view-standalone-height');
      sync();changed();
    }
    function initializeHeights(){
      if(sizes.surface!==null)return;
      sizes.surface=Math.round(surfacePanel.getBoundingClientRect().height);
      sizes.hidden=context.docked?Math.round(hiddenPanel.getBoundingClientRect().height):sizes.surface;
    }
    function change(kind,value){
      if(context.locked||destroyed)return;
      if(kind==='width')sizes.split=split(value,sceneColumn.getBoundingClientRect().width);
      else if(kind==='hidden'&&!context.docked)sizes.standalone=height(value,{minimum:140,viewport:viewport()});
      else{initializeHeights();sizes[kind]=height(value,{minimum:kind==='hidden'?220:160,viewport:viewport()});}
      apply();
    }
    function resetSizes(){if(context.locked)return;sizes={surface:null,hidden:null,standalone:null,split:null};apply();}
    function start(event,kind,grip){
      if(destroyed||drag||doc.hidden||event.isPrimary===false||event.button!==0||context.locked||kind==='width'&&(!context.docked||narrow()))return;
      event.preventDefault();event.stopPropagation();
      const surfaceBox=surfacePanel.getBoundingClientRect(),hiddenBox=hiddenPanel.getBoundingClientRect(),columnBox=sceneColumn.getBoundingClientRect();
      const standalone=hiddenPanel.querySelector('.cutaway-canvas')?.getBoundingClientRect().height||330;
      drag={kind,grip,id:event.pointerId,x:event.clientX,y:event.clientY,scrollX:win.scrollX||0,scrollY:win.scrollY||0,ratio:surfaceBox.width/Math.max(1,surfaceBox.width+hiddenBox.width),width:columnBox.width,
        startHeight:kind==='surface'?surfaceBox.height:context.docked?hiddenBox.height:standalone};
      grip.setPointerCapture(event.pointerId);workspace.classList.add('view-resize-dragging');
    }
    function move(event){
      if(!drag||event.pointerId!==drag.id||context.locked)return;
      if(event.buttons===0||doc.hidden){stop();return;}
      event.preventDefault();change(drag.kind,drag.kind==='width'?drag.ratio+(event.clientX-drag.x+(win.scrollX||0)-drag.scrollX)/Math.max(1,drag.width-8):drag.startHeight+event.clientY-drag.y+(win.scrollY||0)-drag.scrollY);
    }
    function stop(event){if(event?.pointerId!==undefined&&drag?.id!==event.pointerId)return;drag=null;workspace.classList.remove('view-resize-dragging');}
    for(const [grip,kind]of [[seam,'width'],[surfaceGrip,'surface'],[hiddenGrip,'hidden']]){
      listen(grip,'pointerdown',event=>start(event,kind,grip));listen(grip,'pointermove',move);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(grip,name,stop);
      listen(grip,'keydown',event=>{
        if(context.locked)return;
        if(event.key==='Home'){event.preventDefault();resetSizes();return;}
        const step=event.shiftKey?50:10,vertical={ArrowUp:-step,ArrowDown:step},horizontal={ArrowLeft:-.02,ArrowRight:.02};
        if(kind==='width'&&horizontal[event.key]!==undefined&&!narrow()){
          event.preventDefault();const surfaceBox=surfacePanel.getBoundingClientRect(),hiddenBox=hiddenPanel.getBoundingClientRect();change(kind,surfaceBox.width/(surfaceBox.width+hiddenBox.width)+horizontal[event.key]);
        }else if(kind!=='width'&&vertical[event.key]!==undefined){
          event.preventDefault();const pixels=Number(grip.getAttribute('aria-valuenow'));change(kind,pixels+vertical[event.key]);
        }
      });
    }
    listen(reset,'click',resetSizes);
    for(const type of ['blur','pagehide'])listen(win,type,()=>stop());
    listen(doc,'visibilitychange',()=>{if(doc.hidden)stop();});
    listen(win,'resize',()=>{stop();if(!context.locked){apply();}else sync();});
    let observer=null;if(typeof win.ResizeObserver==='function'){observer=new win.ResizeObserver(sync);observer.observe(sceneColumn);observer.observe(surfacePanel);observer.observe(hiddenPanel);}
    sync();
    return Object.freeze({
      setContext(next={}){if(destroyed)return;const previous=context;context={...context,...next};if(context.locked||previous.docked!==context.docked)stop();if(previous.docked!==context.docked||previous.locked!==context.locked)apply();},
      reset:resetSizes,
      snapshot(){return {...sizes,docked:context.docked,locked:context.locked};},
      destroy(){if(destroyed)return;destroyed=true;observer?.disconnect();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);for(const node of [seam,surfaceGrip,hiddenGrip,reset])node.remove();workspace.classList.remove('view-resize-ready','view-heights-custom','view-widths-custom','view-resize-dragging');surfacePanel.classList.remove('view-resize-surface-pane');hiddenPanel.classList.remove('view-resize-hidden-pane','view-standalone-custom');for(const name of ['--view-surface-height','--view-hidden-height','--view-row-height','--view-surface-track','--view-hidden-track'])removeVar(workspace,name);removeVar(hiddenPanel,'--view-standalone-height');}
    });
  }
  return Object.freeze({create,height,split});
});
