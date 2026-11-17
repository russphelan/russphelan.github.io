/* Reproducible code-native Home Screen art. Node standard library only. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const out=path.join(__dirname,'icons');fs.mkdirSync(out,{recursive:true});
const bg=[9,35,46],ops=[],TAU=2*Math.PI;
const rgb=c=>'#'+c.map(x=>Math.round(x).toString(16).padStart(2,'0')).join('');
function torus(u,v){const R=145,r=48,q=R+r*Math.cos(v),x=q*Math.cos(u),y=q*Math.sin(u),z=r*Math.sin(v);
 return {p:[256+x,263+.47*y-.883*z],depth:.883*y+.47*z,face:.883*Math.sin(u)*Math.cos(v)+.47*Math.sin(v),n:[Math.cos(u)*Math.cos(v),Math.sin(u)*Math.cos(v),Math.sin(v)]};}
const quads=[];
for(let i=0;i<96;i++)for(let j=0;j<40;j++){
 const u=TAU*i/96,v=TAU*j/40,pts=[torus(u,v),torus(u+TAU/96,v),torus(u+TAU/96,v+TAU/40),torus(u,v+TAU/40)],m=torus(u+Math.PI/96,v+Math.PI/40);
 const light=Math.max(0,.22*m.n[0]-.52*m.n[1]+.78*m.n[2]),shade=.23+.62*light;
 quads.push({kind:'polygon',points:pts.map(p=>p.p),color:[18+54*shade,60+116*shade,69+112*shade],depth:pts.reduce((s,p)=>s+p.depth,0)/4});
}
quads.sort((a,b)=>a.depth-b.depth);ops.push(...quads);
for(let j=0;j<12;j++)for(let i=0;i<192;i++){
 const a=torus(TAU*i/192,TAU*j/12),b=torus(TAU*(i+1)/192,TAU*j/12);
 if((a.face+b.face)/2>.08)ops.push({kind:'line',points:[a.p,b.p],width:.72,color:[131,213,196],alpha:.34});
}
for(let i=0;i<32;i++)for(let j=0;j<96;j++){
 const a=torus(TAU*i/32,TAU*j/96),b=torus(TAU*i/32,TAU*(j+1)/96);
 if((a.face+b.face)/2>.08)ops.push({kind:'line',points:[a.p,b.p],width:.65,color:[131,213,196],alpha:.28});
}
const curve=Array.from({length:481},(_,i)=>{const u=-2.58+6.08*i/480;return torus(u,.18+1.35*(u+2.58));});
for(let i=1;i<curve.length;i++){
 const a=curve[i-1],b=curve[i],front=(a.face+b.face)/2>-.08;
 ops.push({kind:'line',points:[a.p,b.p],width:front?4.8:2.3,color:[245,198,95],alpha:front?1:.44});
}
for(const [p,color]of [[curve[0].p,[110,226,196]],[curve.at(-1).p,[255,222,152]]]){
 ops.push({kind:'circle',point:p,radius:7.3,color:bg});ops.push({kind:'circle',point:p,radius:4.9,color});
}
const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="A gold geodesic winding around a teal torus">',`<rect width="512" height="512" fill="${rgb(bg)}"/>`];
for(const op of ops){const color=rgb(op.color),alpha=op.alpha??1;
 if(op.kind==='polygon')svg.push(`<polygon points="${op.points.map(p=>p.map(x=>x.toFixed(3)).join(',')).join(' ')}" fill="${color}"/>`);
 else if(op.kind==='line')svg.push(`<path d="M${op.points[0].join(',')}L${op.points[1].join(',')}" stroke="${color}" stroke-width="${op.width}" stroke-linecap="round" opacity="${alpha}"/>`);
 else svg.push(`<circle cx="${op.point[0]}" cy="${op.point[1]}" r="${op.radius}" fill="${color}"/>`);
}svg.push('</svg>');fs.writeFileSync(path.join(out,'icon.svg'),svg.join('\n')+'\n');
let crcTable;
function crc32(buffer){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let n=0xffffffff;for(const b of buffer)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([head,t,data,tail]);}
function raster(size){const aa=3,w=size*aa,scale=w/512,pixels=new Uint8Array(w*w*3);for(let i=0;i<pixels.length;i++)pixels[i]=bg[i%3];
 const paint=(x,y,color,alpha=1)=>{if(x<0||y<0||x>=w||y>=w)return;const i=3*(x+w*y);for(let c=0;c<3;c++)pixels[i+c]=Math.round(pixels[i+c]*(1-alpha)+color[c]*alpha);};
 for(const op of ops){
  if(op.kind==='polygon'){
   const p=op.points.map(q=>q.map(x=>x*scale)),ys=p.map(q=>q[1]);
   for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(w-1,Math.ceil(Math.max(...ys)));y++){
    const sy=y+.5,hits=[];for(let k=0;k<4;k++){const a=p[k],b=p[(k+1)%4];if((a[1]>sy)!==(b[1]>sy))hits.push(a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    hits.sort((a,b)=>a-b);for(let k=0;k+1<hits.length;k+=2)for(let x=Math.max(0,Math.ceil(hits[k]-.5));x<=Math.min(w-1,Math.floor(hits[k+1]-.5));x++)paint(x,y,op.color);
   }
  }else{
   const a=(op.kind==='circle'?op.point:op.points[0]).map(x=>x*scale),b=(op.kind==='circle'?op.point:op.points[1]).map(x=>x*scale),r=(op.kind==='circle'?op.radius:op.width/2)*scale,dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
   for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1])-r));y<=Math.min(w-1,Math.ceil(Math.max(a[1],b[1])+r));y++)for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0])-r));x<=Math.min(w-1,Math.ceil(Math.max(a[0],b[0])+r));x++){
    const px=x+.5-a[0],py=y+.5-a[1],t=d?Math.max(0,Math.min(1,(px*dx+py*dy)/d)):0;
    if((px-t*dx)**2+(py-t*dy)**2<=r*r)paint(x,y,op.color,op.alpha??1);
   }
  }
 }
 const raw=Buffer.alloc((size*3+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){
  let sum=0;for(let dy=0;dy<aa;dy++)for(let dx=0;dx<aa;dx++)sum+=pixels[3*(x*aa+dx+w*(y*aa+dy))+c];raw[y*(size*3+1)+1+x*3+c]=Math.round(sum/(aa*aa));
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
for(const [name,size]of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]])fs.writeFileSync(path.join(out,name),raster(size));
console.log('Generated SVG and opaque 180/192/512 PNG Home Screen icons.');
