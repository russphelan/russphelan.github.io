/* Layout-only resizing for the optional neck companion. The fixed outer row
 * and shared construction controls remain owned by the application. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicNeckViewResize=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  function split(value,width,{gap=8,narrow=false}={}){
    if(![value,width,gap].every(Number.isFinite)||width<=0||gap<0)throw new RangeError('Finite split, positive width and nonnegative gap required.');
    const available=Math.max(1,width-gap),left=narrow?120:240,right=narrow?160:240;
    const scale=Math.min(1,available/(left+right)),minimum=left*scale/available,maximum=1-right*scale/available;
    return clamp(value,minimum,maximum);
  }
  function fitHeights(overview,scanner,budget,{priority=null,minimumOverview=90,minimumScanner=120}={}){
    if(![overview,scanner,budget,minimumOverview,minimumScanner].every(Number.isFinite)||budget<=0||minimumOverview<0||minimumScanner<0)throw new RangeError('Finite heights and a positive canvas budget required.');
    if(priority!==null&&priority!=='overview'&&priority!=='scanner')throw new RangeError('Unknown height priority.');
    budget=Math.max(1,Math.floor(budget));
    const factor=Math.min(1,budget/Math.max(1,minimumOverview+minimumScanner));
    const minA=Math.floor(minimumOverview*factor),minB=Math.min(budget-minA,Math.floor(minimumScanner*factor));
    let a=Math.max(minA,Math.round(overview)),b=Math.max(minB,Math.round(scanner));
    if(priority==='overview'){a=clamp(a,minA,budget-minB);b=clamp(b,minB,budget-a);}
    else if(priority==='scanner'){b=clamp(b,minB,budget-minA);a=clamp(a,minA,budget-b);}
    else if(a+b>budget){
      const extraA=a-minA,extraB=b-minB,space=budget-minA-minB,total=extraA+extraB;
      a=minA+Math.round(space*(total?extraA/total:.375));b=budget-a;
    }
    return {overview:a,scanner:b,budget,minimumOverview:minA,minimumScanner:minB};
  }
  function create({workspace,sceneColumn,surfacePanel,neckPanel,constructionControls,onResize}={}){
    if(!workspace||!sceneColumn||!surfacePanel||!neckPanel||!constructionControls)throw new TypeError('The neck layout and shared construction controls are required.');
    const doc=workspace.ownerDocument,win=doc.defaultView;
    const overview=neckPanel.querySelector('[data-neck="overview"]'),scanner=neckPanel.querySelector('[data-neck="canvas"]');
    const overviewWrap=neckPanel.querySelector('.neck-overview-wrap'),scannerWrap=neckPanel.querySelector('.neck-scanner-wrap');
    const component=neckPanel.querySelector('.neck-explanation')||neckPanel.querySelector('#neck-explanation-view');
    const scanControls=neckPanel.querySelector('.neck-scan-controls'),sideControls=neckPanel.querySelector('.neck-side-controls');
    if(!overview||!scanner||!overviewWrap||!scannerWrap||!component)throw new TypeError('Create the neck explanation before its resize controls.');
    const listeners=[],requested={split:null,overview:null,scanner:null};
    let active=false,destroyed=false,drag=null,applying=false,priority=null,effective=null;
    const listen=(target,type,fn)=>{if(target){target.addEventListener(type,fn);listeners.push([target,type,fn]);}};
    const enabled=()=>active&&!destroyed&&!doc.hidden;
    const narrow=()=>win.innerWidth<=700;
    const makeHandle=(label,orientation,kind)=>{
      const node=doc.createElement('button');node.type='button';node.className='neck-resize-handle neck-resize-'+kind;
      node.dataset.neckResize=kind;node.setAttribute('role','separator');node.setAttribute('aria-label',label);node.setAttribute('aria-orientation',orientation);
      node.title=label+'. Drag or use arrow keys. Home restores this size.';
      node.textContent=kind==='width'?'⋮':'↕ Resize height';return node;
    };
    const seam=makeHandle('Resize the torus and neck explanation widths','vertical','width');
    const overviewGrip=makeHandle('Resize the neighborhood overview height','horizontal','overview');
    const scannerGrip=makeHandle('Resize the joining close-up and scanner height','horizontal','scanner');
    const reset=doc.createElement('button');reset.type='button';reset.className='neck-resize-reset';reset.textContent='↔';
    reset.title='Reset neck view sizes';reset.setAttribute('aria-label','Reset neck view sizes');
    sceneColumn.append(seam);overviewWrap.append(overviewGrip);scannerWrap.append(scannerGrip);
    (neckPanel.querySelector('.neck-topline')||neckPanel).append(reset);workspace.classList.add('neck-resize-ready');
    function setVar(target,name,value){if(target.style.getPropertyValue(name)===value)return false;target.style.setProperty(name,value);return true;}
    function removeVar(target,name){if(!target.style.getPropertyValue(name))return false;target.style.removeProperty(name);return true;}
    function limitRow(){
      const column=sceneColumn.getBoundingClientRect(),controlBox=constructionControls.getBoundingClientRect();
      const style=typeof win.getComputedStyle==='function'?win.getComputedStyle(sceneColumn):null;
      const measuredGap=parseFloat(style?.rowGap),gap=Number.isFinite(measuredGap)?Math.max(0,measuredGap):8;
      const viewport=Number.isFinite(win.innerHeight)?win.innerHeight:800;
      const controlsHeight=constructionControls.hidden?0:Math.max(0,controlBox.height);
      // A viewport budget anchored in document coordinates does not change
      // while the presenter scrolls. Headers and the construction bar reserve
      // their real space before either animation receives any height.
      const documentTop=column.top+(win.scrollY||0);
      const limit=Math.max(1,Math.floor(viewport-documentTop-controlsHeight-gap-12));
      return setVar(workspace,'--neck-row-limit',limit+'px');
    }
    function stop(event){
      if(event?.pointerId!==undefined&&drag&&event.pointerId!==drag.id)return;
      const previous=drag;drag=null;workspace.classList.remove('neck-resize-dragging');
      if(previous&&typeof previous.grip.releasePointerCapture==='function'){
        try{if(!previous.grip.hasPointerCapture||previous.grip.hasPointerCapture(previous.id))previous.grip.releasePointerCapture(previous.id);}catch(_){}
      }
    }
    function measure(){
      const panel=neckPanel.getBoundingClientRect(),rootBox=component.getBoundingClientRect(),a=overview.getBoundingClientRect(),b=scanner.getBoundingClientRect();
      if(!(panel.height>0&&panel.width>0&&rootBox.height>0&&rootBox.width>0))return null;
      const style=typeof win.getComputedStyle==='function'?win.getComputedStyle(neckPanel):null;
      const number=name=>parseFloat(style?.[name])||0,padding=number('paddingTop')+number('paddingBottom');
      const inner=neckPanel.clientHeight||panel.height-number('borderTopWidth')-number('borderBottomWidth');
      const bottom=Math.max(scannerWrap.getBoundingClientRect().bottom,scanControls?.getBoundingClientRect().bottom||0,sideControls?.getBoundingClientRect().bottom||0);
      // Root-relative measurement cancels panel scrolling. Supporting prose and
      // expanded mathematical notes are deliberately outside this fixed budget.
      const chrome=Math.max(0,bottom-rootBox.top-a.height-b.height);
      const budget=Math.max(1,Math.floor(inner-padding-chrome));
      return {panel,a,b,budget};
    }
    function controls(bounds){
      const visible=enabled();for(const node of [seam,overviewGrip,scannerGrip,reset]){node.hidden=!visible;node.disabled=!visible;}
      if(!visible||!bounds)return;
      const left=surfacePanel.getBoundingClientRect(),right=neckPanel.getBoundingClientRect(),column=sceneColumn.getBoundingClientRect();
      const gap=Math.max(0,right.left-left.right),ratio=left.width/Math.max(1,left.width+right.width);
      setVar(seam,'--neck-seam-left',(left.right-column.left+gap/2)+'px');setVar(seam,'--neck-seam-top',(left.top-column.top)+'px');
      setVar(seam,'--neck-seam-height',Math.min(left.height,right.height)+'px');
      const minimum=split(0,column.width,{gap,narrow:narrow()}),maximum=split(1,column.width,{gap,narrow:narrow()});
      seam.setAttribute('aria-valuemin',String(Math.round(minimum*100)));seam.setAttribute('aria-valuemax',String(Math.round(maximum*100)));seam.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
      seam.setAttribute('aria-valuetext',Math.round(ratio*100)+' percent torus, '+Math.round((1-ratio)*100)+' percent neck explanation');
      for(const [node,kind,minimumHeight,otherMinimum]of [[overviewGrip,'overview',bounds.minimumOverview,bounds.minimumScanner],[scannerGrip,'scanner',bounds.minimumScanner,bounds.minimumOverview]]){
        node.setAttribute('aria-valuemin',String(minimumHeight));node.setAttribute('aria-valuemax',String(bounds.budget-otherMinimum));node.setAttribute('aria-valuenow',String(bounds[kind]));
        node.setAttribute('aria-valuetext',bounds[kind]+' pixels tall; construction slider remains below the views');
      }
      workspace.dataset.neckViewSizes=JSON.stringify({requested:{...requested},effective:{...bounds}});
    }
    function apply(force=false){
      if(destroyed||applying)return;applying=true;let changed=false;
      try{
        if(!enabled()){controls(null);return;}
        // Include both normal-flow footer grips in the first measurement,
        // including browsers that do not provide ResizeObserver.
        controls(null);
        changed=limitRow()||changed;
        const column=sceneColumn.getBoundingClientRect(),left=surfacePanel.getBoundingClientRect(),right=neckPanel.getBoundingClientRect();
        if(!(column.width>0&&right.height>0)){controls(null);return;}
        const gap=Math.max(0,right.left-left.right);
        if(requested.split!==null){const ratio=split(requested.split,column.width,{gap,narrow:narrow()});changed=setVar(workspace,'--neck-surface-track',ratio+'fr')||changed;changed=setVar(workspace,'--neck-panel-track',(1-ratio)+'fr')||changed;}
        else{changed=removeVar(workspace,'--neck-surface-track')||changed;changed=removeVar(workspace,'--neck-panel-track')||changed;}
        const measurement=measure();if(!measurement){controls(null);return;}
        const {budget}=measurement,minA=narrow()?80:90,minB=narrow()?110:130;
        let a=requested.overview,b=requested.scanner;
        if(a===null&&b===null){a=budget*.375;b=budget-a;}
        else if(a===null)a=budget-b;
        else if(b===null)b=budget-a;
        effective=fitHeights(a,b,budget,{priority,minimumOverview:minA,minimumScanner:minB});
        changed=setVar(workspace,'--neck-overview-height',effective.overview+'px')||changed;changed=setVar(workspace,'--neck-scanner-height',effective.scanner+'px')||changed;
        controls(effective);
      }finally{applying=false;}
      if(changed||force)onResize?.();
    }
    function change(kind,value){
      if(!enabled())return;
      if(kind==='width'){
        const left=surfacePanel.getBoundingClientRect(),right=neckPanel.getBoundingClientRect(),gap=Math.max(0,right.left-left.right);
        requested.split=split(value,sceneColumn.getBoundingClientRect().width,{gap,narrow:narrow()});
      }
      else{
        if(requested.overview===null&&requested.scanner===null){requested.overview=effective?.overview??overview.getBoundingClientRect().height;requested.scanner=effective?.scanner??scanner.getBoundingClientRect().height;}
        requested[kind]=value;priority=kind;
      }
      apply(true);
    }
    function resetDimension(kind){if(!enabled())return;if(kind==='width')requested.split=null;else{requested[kind]=null;priority=kind==='overview'?'scanner':'overview';}apply(true);}
    function resetSizes(){if(!enabled())return;requested.split=requested.overview=requested.scanner=null;priority=null;apply(true);}
    function start(event,kind,grip){
      if(!enabled()||drag||event.button!==0||event.isPrimary===false)return;
      event.preventDefault();event.stopPropagation();
      const left=surfacePanel.getBoundingClientRect(),right=neckPanel.getBoundingClientRect();
      drag={kind,grip,id:event.pointerId,x:event.clientX,y:event.clientY,scrollX:win.scrollX||0,scrollY:win.scrollY||0,
        width:Math.max(1,left.width+right.width),ratio:left.width/Math.max(1,left.width+right.width),height:kind==='overview'?overview.getBoundingClientRect().height:scanner.getBoundingClientRect().height};
      grip.setPointerCapture(event.pointerId);workspace.classList.add('neck-resize-dragging');
    }
    function move(event){
      if(!drag||event.pointerId!==drag.id)return;
      if(!enabled()||event.buttons===0){stop();return;}
      event.preventDefault();
      change(drag.kind,drag.kind==='width'?drag.ratio+(event.clientX-drag.x+(win.scrollX||0)-drag.scrollX)/drag.width:drag.height+event.clientY-drag.y+(win.scrollY||0)-drag.scrollY);
    }
    for(const [grip,kind]of [[seam,'width'],[overviewGrip,'overview'],[scannerGrip,'scanner']]){
      listen(grip,'pointerdown',event=>start(event,kind,grip));listen(grip,'pointermove',move);
      for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(grip,type,stop);
      listen(grip,'keydown',event=>{
        if(!enabled())return;
        if(event.key==='Home'){event.preventDefault();resetDimension(kind);return;}
        if(kind==='width'&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
          event.preventDefault();const left=surfacePanel.getBoundingClientRect(),right=neckPanel.getBoundingClientRect(),ratio=left.width/Math.max(1,left.width+right.width);
          change(kind,ratio+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey ? .05 : .02));
        }else if(kind!=='width'&&(event.key==='ArrowUp'||event.key==='ArrowDown')){
          event.preventDefault();const pixels=effective?.[kind]??(kind==='overview'?overview:scanner).getBoundingClientRect().height;
          change(kind,pixels+(event.key==='ArrowUp'?-1:1)*(event.shiftKey?40:10));
        }
      });
    }
    listen(reset,'click',resetSizes);
    for(const type of ['blur','pagehide'])listen(win,type,()=>stop());
    listen(doc,'visibilitychange',()=>{if(doc.hidden)stop();else apply();});
    listen(win,'resize',()=>{stop();apply();});
    let observer=null;
    if(typeof win.ResizeObserver==='function'){
      observer=new win.ResizeObserver(()=>apply());
      for(const node of [sceneColumn,surfacePanel,neckPanel,component,overviewWrap,scannerWrap,scanControls,sideControls,constructionControls])if(node)observer.observe(node);
    }
    controls(null);
    return Object.freeze({
      setContext(next={}){
        if(destroyed)return;const was=active;if('active'in next)active=!!next.active;if(!active)stop();
        if(was!==active)apply(true);
        // A mode header may move the column without resizing an observed node.
        // Avoid a full refit/redraw unless its document-relative budget changed.
        else if(enabled()&&limitRow())apply(true);
      },
      reset:resetSizes,
      snapshot:()=>({active,requested:{...requested},effective:effective?{...effective}:null}),
      destroy(){if(destroyed)return;stop();destroyed=true;observer?.disconnect();for(const [node,type,fn]of listeners)node.removeEventListener(type,fn);for(const node of [seam,overviewGrip,scannerGrip,reset])node.remove();
        for(const name of ['--neck-surface-track','--neck-panel-track','--neck-overview-height','--neck-scanner-height','--neck-row-limit'])removeVar(workspace,name);
        workspace.classList.remove('neck-resize-ready','neck-resize-dragging');delete workspace.dataset.neckViewSizes;
      }
    });
  }
  return Object.freeze({create,split,fitHeights});
});
