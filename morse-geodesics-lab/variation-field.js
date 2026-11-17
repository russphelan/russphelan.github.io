/* Prominent displacement arrows and a ruled band for the finite-push illustration. The supplied
 * endpoints are drawing coordinates, not measurements in the manifold metric.
 * No curve, variation coefficient, eigenmode, or length is changed here. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GeodesicVariationField=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const sub=(a,b)=>a.map((x,k)=>x-b[k]);
  const norm=p=>Math.hypot(...p);
  const dot=(a,b)=>a.reduce((sum,x,k)=>sum+x*b[k],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=p=>{const d=norm(p);return p.map(x=>x/d);};
  function build({samples,T,count=20,stemRadius=.0055,headRadius=.018,sides=8}={}){
    if(!Array.isArray(samples)||samples.length<2||!Number.isFinite(T)||T<=0)
      throw TypeError('An ordered sampled variation field and positive interval are required.');
    if(!Number.isInteger(count)||count<1||count>128||!Number.isInteger(sides)||sides<3||sides>32||
      ![stemRadius,headRadius].every(x=>Number.isFinite(x)&&x>0))
      throw RangeError('Positive finite arrow radii and bounded field resolution are required.');
    const bins=Array(count).fill(null);
    for(let i=0;i<samples.length;i++){
      const p=samples[i];
      if(!p||!Number.isFinite(p.s)||p.s<0||p.s>T||i&&p.s<=samples[i-1].s||!finite(p.original)||!finite(p.point))
        throw TypeError('Ordered finite field positions and displacement endpoints are required.');
      // The strongest sample retains a visible representative even when a
      // mode node falls exactly on a bin boundary or a regular guide station.
      const length=norm(sub(p.point,p.original)),bin=Math.min(count-1,Math.floor(count*p.s/T));
      if(length>1e-12&&(!bins[bin]||length>bins[bin].length))bins[bin]={s:p.s,original:p.original.slice(),point:p.point.slice(),length};
    }
    const guides=bins.filter(Boolean),positions=[],normals=[];
    const angles=Array.from({length:sides},(_,i)=>[Math.cos(2*Math.PI*i/sides),Math.sin(2*Math.PI*i/sides)]);
    const vertex=(p,n)=>{positions.push(...p);normals.push(...n);};
    const triangle=(a,b,c)=>{for(const v of [a,b,c])vertex(v.p,v.n);};
    for(const guide of guides){
      const {original,point,length}=guide,d=unit(sub(point,original));
      const axis=[0,1,2].reduce((best,k)=>Math.abs(d[k])<Math.abs(d[best])?k:best,0);
      const raw=[0,1,2].map(k=>k===axis?1:0),u=unit(raw.map((x,k)=>x-dot(raw,d)*d[k])),v=cross(d,u);
      // Short arrows shrink proportionally; their heads can never overshoot
      // the pushed path or manufacture a nonzero field at a node.
      const headLength=Math.min(.035,.5*length),headWidth=Math.min(headRadius,.27*length);
      const shaftWidth=Math.min(stemRadius,.1*length,headWidth*.45),shaftLength=length-headLength;
      const back=d.map(x=>-x),base=original.map((x,k)=>x+shaftLength*d[k]);
      const bottom=[],top=[],head=[];
      for(const [cos,sin]of angles){
        const radial=u.map((x,k)=>x*cos+v[k]*sin),coneNormal=unit(radial.map((x,k)=>headLength*x+headWidth*d[k]));
        bottom.push({p:original.map((x,k)=>x+shaftWidth*radial[k]),n:radial});
        top.push({p:base.map((x,k)=>x+shaftWidth*radial[k]),n:radial});
        head.push({p:base.map((x,k)=>x+headWidth*radial[k]),n:coneNormal});
      }
      for(let j=0;j<sides;j++){
        const next=(j+1)%sides;
        triangle(bottom[j],top[next],top[j]);triangle(bottom[j],bottom[next],top[next]);
        const tipNormal=unit(head[j].n.map((x,k)=>x+head[next].n[k]));
        triangle(head[j],head[next],{p:point,n:tipNormal});
        const a={p:head[j].p,n:back},b={p:head[next].p,n:back},c={p:top[j].p,n:back},e={p:top[next].p,n:back};
        triangle(a,c,e);triangle(a,e,b);
        triangle({p:original,n:back},{p:bottom[next].p,n:back},{p:bottom[j].p,n:back});
      }
    }
    const bandPositions=[],bandNormals=[];
    function bandTriangle(a,b,c){
      const face=cross(sub(b,a),sub(c,a)),area=norm(face);
      if(!(area>1e-24))return;
      const normal=face.map(x=>x/area);
      for(const p of [a,b,c]){bandPositions.push(...p);bandNormals.push(...normal);}
    }
    // Every adaptive sample participates: the translucent band follows the
    // same exact display curves, pinches at nodes, and never bridges across a
    // skipped guide. Degenerate endpoint/node triangles simply have no area.
    for(let i=1;i<samples.length;i++){
      const previous=samples[i-1],current=samples[i];
      bandTriangle(previous.original,previous.point,current.point);
      bandTriangle(previous.original,current.point,current.original);
    }
    return {guides,positions:new Float32Array(positions),normals:new Float32Array(normals),
      band:{positions:new Float32Array(bandPositions),normals:new Float32Array(bandNormals)}};
  }
  return Object.freeze({build});
});
