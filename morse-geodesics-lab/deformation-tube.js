/* Drawing mesh for finite Hessian deformations. Surface clearance belongs to
 * the centerline; cross-section orientation is transported independently so
 * a rapidly rotating surface normal cannot roll or kink the displayed tube.
 * No curve resampling, eigenmode calculation or length measurement occurs here.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicDeformationTube=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length=a=>Math.hypot(...a);
  const finite=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  const unit=a=>{const d=length(a);if(!(d>1e-14))throw RangeError('A regular deformation tube frame is required.');return a.map(x=>x/d);};
  const perpendicular=(a,t)=>a.map((x,i)=>x-dot(a,t)*t[i]);
  function initial(t,guide){
    if(guide){const n=perpendicular(guide,t);if(length(n)>1e-10)return unit(n);}
    // Pick the least parallel coordinate axis, independent of surface normal
    // sign or the physical size of the push.
    const axis=[0,1,2].reduce((best,i)=>Math.abs(t[i])<Math.abs(t[best])?i:best,0);
    return unit(perpendicular([0,1,2].map(i=>i===axis?1:0),t));
  }
  function transport(n,a,b){
    const c=Math.max(-1,Math.min(1,dot(a,b))),v=cross(a,b);
    // Rodrigues' shortest rotation. At a true reversal the transport is not
    // unique; a half-turn about the previous normal is deterministic and does
    // not add arbitrary roll. Reprojection also handles roundoff near pi.
    let rotated=n;
    if(c>-1+1e-8){
      const first=cross(v,n),second=cross(v,first);
      rotated=n.map((x,i)=>x+first[i]+second[i]/(1+c));
    }
    const projected=perpendicular(rotated,b);
    return length(projected)>1e-10?unit(projected):initial(b,n);
  }
  function curveTangents(points){
    let any=false;
    const tangents=points.map((p,i)=>{
      let lo=i-1,hi=i+1;
      while(lo>=0&&length(sub(p,points[lo]))<=1e-14)lo--;
      while(hi<points.length&&length(sub(points[hi],p))<=1e-14)hi++;
      const before=lo>=0?unit(sub(p,points[lo])):null,after=hi<points.length?unit(sub(points[hi],p)):null;
      if(before||after)any=true;
      if(before&&after){
        const bisector=before.map((x,k)=>x+after[k]);
        return length(bisector)>1e-10?unit(bisector):after;
      }
      return after||before;
    });
    if(!any)throw RangeError('A deformation tube requires distinct curve points.');
    return tangents;
  }
  function build(points,{liftNormals=null,lift=0,initialNormal=null,radius=.012,sides=10}={}){
    if(!Array.isArray(points)||points.length<2||!points.every(finite))throw TypeError('A deformation tube requires at least two finite curve points.');
    if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(lift)||!Number.isInteger(sides)||sides<3||sides>64)
      throw RangeError('Invalid deformation tube radius, lift or cross-section resolution.');
    if(liftNormals!==null&&(!Array.isArray(liftNormals)||liftNormals.length!==points.length||!liftNormals.every(n=>finite(n)&&length(n)>1e-14)))
      throw TypeError('Finite nonzero lift normals must match the curve points.');
    if(lift!==0&&!liftNormals)throw TypeError('Surface clearance requires independent lift normals.');
    if(initialNormal!==null&&!finite(initialNormal))throw TypeError('A finite initial tube normal is required.');
    // Lift first. In particular a hidden curve uses lift=0: rotating ring
    // frames must never displace the physical schematic centerline again.
    const centers=points.map((p,i)=>{
      const n=lift!==0?unit(liftNormals[i]):null;
      return p.map((x,k)=>x+(n?lift*n[k]:0));
    });
    const tangents=curveTangents(centers),frames=[];
    let n=initial(tangents[0],initialNormal||liftNormals?.[0]);
    for(let i=0;i<centers.length;i++){
      if(i)n=transport(n,tangents[i-1],tangents[i]);
      frames.push({normal:n.slice(),binormal:unit(cross(tangents[i],n))});
    }
    // Preallocated arrays avoid large temporary vertex-object lists when an
    // adaptive collar needs several thousand rings during a slider drag.
    const ringPositions=new Float32Array(centers.length*sides*3),ringNormals=new Float32Array(ringPositions.length);
    const angles=Array.from({length:sides},(_,j)=>[Math.cos(2*Math.PI*j/sides),Math.sin(2*Math.PI*j/sides)]);
    for(let i=0;i<centers.length;i++){
      const {normal:n,binormal:b}=frames[i],p=centers[i];
      for(let j=0;j<sides;j++)for(let k=0;k<3;k++){
        const index=(i*sides+j)*3+k,value=n[k]*angles[j][0]+b[k]*angles[j][1];
        ringNormals[index]=value;ringPositions[index]=p[k]+radius*value;
      }
    }
    const active=new Uint8Array(centers.length);let segments=0;
    for(let i=1;i<centers.length;i++)if(length(sub(centers[i],centers[i-1]))>1e-14){active[i]=1;segments++;}
    const positions=new Float32Array(segments*sides*18),normals=new Float32Array(positions.length);
    let cursor=0;
    for(let i=1;i<centers.length;i++){
      if(!active[i])continue;
      for(let j=0;j<sides;j++){
        const next=(j+1)%sides;
        // Outward winding, consistent with the transported radial normals.
        const a=((i-1)*sides+j)*3,b=(i*sides+next)*3,c=(i*sides+j)*3,d=((i-1)*sides+next)*3;
        for(const index of [a,b,c,a,d,b])for(let k=0;k<3;k++){
          positions[cursor]=ringPositions[index+k];normals[cursor]=ringNormals[index+k];cursor++;
        }
      }
    }
    return {positions,normals,centers,tangents,frames};
  }
  return Object.freeze({build});
});
