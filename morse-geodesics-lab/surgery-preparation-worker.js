'use strict';
importScripts('./compact-collar.js?v=compact-collar-3', './surface.js?v=compact-collar-3', './surgery.js?v=compact-collar-3');
function buildWire(mesh){
  const p=mesh.positions,n=mesh.normals,positions=new Float32Array(p.length*2),normals=new Float32Array(n.length*2);
  const edges=[0,3,3,6,6,0];let out=0;
  for(let i=0;i<p.length;i+=9)for(const offset of edges){
    const from=i+offset;
    positions[out]=p[from];positions[out+1]=p[from+1];positions[out+2]=p[from+2];
    normals[out]=n[from];normals[out+1]=n[from+1];normals[out+2]=n[from+2];out+=3;
  }
  return {positions,normals};
}
self.onmessage=event=>{
  if(event.data?.type!=='prepare')return;
  const fromId=event.data.fromId;
  try{
    const source=self.GeodesicSurface.getModel(fromId);
    if(source.count!==1&&source.count!==2)throw new RangeError('A connected sum needs one or two source summands.');
    const toId=source.count===1?'double':'triple',target=self.GeodesicSurface.getModel(toId);
    const targetMesh=self.GeodesicSurface.buildMesh(target,target.meshResolution);
    const prepared=self.GeodesicSurgery.prepareTransition(fromId,{targetMesh});
    const plan=self.GeodesicSurgery.serializePlan(prepared),targetWire=buildWire(targetMesh),buffers=new Set();
    for(const mesh of Object.values(plan.meshes)){buffers.add(mesh.positions.buffer);buffers.add(mesh.normals.buffer);}
    for(const boundary of Object.values(plan.boundaries)){buffers.add(boundary.positions.buffer);buffers.add(boundary.normals.buffer);}
    buffers.add(targetWire.positions.buffer);buffers.add(targetWire.normals.buffer);
    self.postMessage({type:'ready',fromId,plan,targetWire},Array.from(buffers));
  }catch(error){self.postMessage({type:'error',fromId,message:String(error.message||error)});}
};
