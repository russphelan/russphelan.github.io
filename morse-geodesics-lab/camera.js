/* Continuous orbit and pointer-anchored perspective zoom for the visible surface.
 * The website applet preserves a mouse anchor with a compensating pan. Here the
 * same operation moves the eye along its cursor ray and compensates the orbit
 * target in the screen plane. Surface picking limits inward travel at the near
 * plane; it never restricts outward movement.
 * Camera targets are stored as offsets from the current bounds center, allowing
 * connected-sum bounds to interpolate without discarding the chosen framing.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicCamera=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MIN_ZOOM=.18,MAX_ZOOM=2.5,TAN_HALF=Math.tan(.32),TAU=2*Math.PI;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const add=(a,b)=>a.map((x,i)=>x+b[i]);
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const scale=(a,s)=>a.map(x=>x*s);
  const norm=a=>Math.hypot(...a);
  const unit=a=>scale(a,1/(norm(a)||1));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const wrap=x=>((x+Math.PI)%TAU+TAU)%TAU-Math.PI;
  function defaultCamera(){return {yaw:.22,pitch:.95,zoom:.9,targetOffset:[0,0,0]};}
  function normalize(camera={}){
    const initial=defaultCamera(),offset=camera.targetOffset;
    return {...camera,yaw:Number.isFinite(camera.yaw)?camera.yaw:initial.yaw,
      pitch:Number.isFinite(camera.pitch)?camera.pitch:initial.pitch,
      zoom:Number.isFinite(camera.zoom)&&camera.zoom>0?camera.zoom:initial.zoom,
      targetOffset:Array.isArray(offset)&&offset.length===3&&offset.every(Number.isFinite)?offset.slice():[0,0,0]};
  }
  function multiply(a,b){
    const out=new Float32Array(16);
    for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)out[j*4+i]+=a[k*4+i]*b[j*4+k];
    return out;
  }
  function fitDistance(bounds,target,back,right,up,aspect){
    let fit=2;
    for(const a of [0,1])for(const b of [0,1])for(const z of [0,1]){
      const p=sub([bounds[a][0],bounds[b][1],bounds[z][2]],target);
      fit=Math.max(fit,dot(back,p)+Math.abs(dot(right,p))/(TAN_HALF*aspect*.86),
        dot(back,p)+Math.abs(dot(up,p))/(TAN_HALF*.78));
    }
    return fit;
  }
  function frame(bounds,camera,width,height){
    if(!Array.isArray(bounds)||bounds.length!==2||bounds.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw TypeError('Finite three-dimensional bounds required.');
    const c=normalize(camera),w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),aspect=w/h;
    const center=bounds[0].map((x,i)=>(x+bounds[1][i])/2),radius=norm(sub(bounds[1],center));
    const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
    const back=[cp*sy,-cp*cy,sp];
    // Analytic axes stay continuous at and beyond both poles. cross(worldUp,
    // back) would vanish at a pole and reverse horizontal direction past it.
    const right=[cy,sy,0],up=cross(back,right);
    const fit=fitDistance(bounds,center,back,right,up,aspect);
    const distance=fit*c.zoom,target=add(center,c.targetOffset),eye=add(target,scale(back,distance));
    const view=new Float32Array([right[0],up[0],back[0],0,right[1],up[1],back[1],0,right[2],up[2],back[2],0,
      -dot(right,eye),-dot(up,eye),-dot(back,eye),1]);
    const near=.05,far=Math.max(50,distance+radius*4+norm(c.targetOffset)*2),f=1/TAN_HALF;
    const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
    return {m:multiply(projection,view),eye,target,center,right,up,back,distance,fit,radius,near,far,aspect,width:w,height:h,bounds:bounds.map(p=>p.slice())};
  }
  function project(f,point,width=f.width,height=f.height){
    const v=sub(point,f.eye),depth=-dot(v,f.back);
    return {x:(dot(v,f.right)/(depth*TAN_HALF*f.aspect)*.5+.5)*width,
      y:(.5-dot(v,f.up)/(depth*TAN_HALF)*.5)*height,
      z:(f.far+f.near)/(f.far-f.near)-2*f.far*f.near/((f.far-f.near)*depth),depth};
  }
  function rayFromScreen(f,x,y){
    const qx=(clamp(x,0,f.width)/f.width*2-1)*TAN_HALF*f.aspect;
    const qy=(1-clamp(y,0,f.height)/f.height*2)*TAN_HALF;
    return {origin:f.eye.slice(),direction:unit(add(add(scale(f.right,qx),scale(f.up,qy)),scale(f.back,-1)))};
  }
  function rayInterval(ray,bounds){
    let near=-Infinity,far=Infinity;
    for(let i=0;i<3;i++){
      const d=ray.direction[i],o=ray.origin[i];
      if(Math.abs(d)<1e-14){if(o<bounds[0][i]||o>bounds[1][i])return null;continue;}
      let a=(bounds[0][i]-o)/d,b=(bounds[1][i]-o)/d;if(a>b)[a,b]=[b,a];
      near=Math.max(near,a);far=Math.min(far,b);if(far<near)return null;
    }
    return far>=Math.max(0,near)?[Math.max(0,near),far]:null;
  }
  function anchorAt(f,x,y,model){
    const ray=rayFromScreen(f,x,y),at=t=>add(ray.origin,scale(ray.direction,t));
    const interval=model&&typeof model.value==='function'?rayInterval(ray,f.bounds):null;
    if(interval){
      const diagonal=Math.max(1,norm(sub(f.bounds[1],f.bounds[0]))),tolerance=diagonal*1e-10;
      const cap=Math.max(tolerance*8,(interval[1]-interval[0])/24);
      // Geometry before the near plane is not visible and cannot be a useful
      // mouse anchor. In particular, anchor=eye would make every homothety
      // leave the eye fixed even while its nominal zoom changes.
      const nearDistance=f.near/-dot(ray.direction,f.back);
      let t=Math.max(interval[0],nearDistance),previous=null;
      for(let i=0;i<768&&t<=interval[1];i++){
        const point=at(t),value=model.value(point);
        if(!Number.isFinite(value))break;
        if(Math.abs(value)<=tolerance)return {point,hit:true,ray};
        if(previous&&Math.sign(value)!==Math.sign(previous.value)){
          let a=previous.t,b=t,va=previous.value;
          for(let k=0;k<50;k++){
            const middle=(a+b)/2,v=model.value(at(middle));
            if(!Number.isFinite(v))break;
            if(Math.sign(v)===Math.sign(va)){a=middle;va=v;}else b=middle;
          }
          return {point:at((a+b)/2),hit:true,ray};
        }
        if(t===interval[1])break;
        previous={t,value};
        t=Math.min(interval[1],t+Math.max(tolerance*2,Math.min(cap,Math.abs(value)*.65)));
      }
    }
    // An empty pixel uses the plane through the current orbit target. This is
    // the perspective equivalent of the applet's screen-space zoom/pan rule.
    const denominator=dot(ray.direction,f.back);
    const distance=dot(sub(f.target,ray.origin),f.back)/denominator;
    return {point:at(distance),hit:false,ray};
  }
  function zoomAt({bounds,camera,width,height,x,y,factor,model}){
    const c=normalize(camera);
    if(!(factor>0)||!Number.isFinite(factor))return c;
    const f=frame(bounds,c,width,height);
    // Cursor compensation translates the target, and orbiting can put that
    // target far behind the surface. A fixed orbit-distance cap can then trap
    // the eye inside the scene. Stop outward zoom only at a distance that fits
    // all bounds from the CURRENT target and orientation. Never turn an
    // outward request into an inward jump if the current view is already wide.
    const targetFit=fitDistance(bounds,f.target,f.back,f.right,f.up,f.aspect);
    const maximum=Math.max(MAX_ZOOM,MAX_ZOOM*(targetFit/f.fit),c.zoom);
    let zoom=clamp(c.zoom*factor,MIN_ZOOM,maximum);
    if(zoom===c.zoom)return c;
    const cursorX=x??f.width/2,cursorY=y??f.height/2;
    let delta=f.fit*(zoom-c.zoom);
    if(delta<0&&model){
      const anchor=anchorAt(f,cursorX,cursorY,model);
      if(anchor.hit){
        const depth=-dot(sub(anchor.point,f.eye),f.back);
        const limitedDelta=Math.min(0,Math.max(delta,f.near-depth));
        if(limitedDelta>delta){delta=limitedDelta;zoom=c.zoom+delta/f.fit;}
      }
    }
    // An eye translation along this ray preserves the pixel of every point
    // under the cursor. Compensate only laterally: scaling target-anchor in 3D
    // accumulated a hidden depth offset and made outward wheel travel tiny.
    const qx=(clamp(cursorX,0,f.width)/f.width*2-1)*TAN_HALF*f.aspect;
    const qy=(1-clamp(cursorY,0,f.height)/f.height*2)*TAN_HALF;
    const pan=add(scale(f.right,-delta*qx),scale(f.up,-delta*qy));
    const target=add(f.target,pan);
    return {...c,zoom,targetOffset:sub(target,f.center)};
  }
  function turn(camera,deltaYaw=0,deltaPitch=0){
    const c=normalize(camera);
    return {...c,yaw:wrap(c.yaw+(Number.isFinite(deltaYaw)?deltaYaw:0)),pitch:wrap(c.pitch+(Number.isFinite(deltaPitch)?deltaPitch:0))};
  }
  return {defaultCamera,frame,project,rayFromScreen,anchorAt,zoomAt,turn,MIN_ZOOM,MAX_ZOOM};
});
