'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),UI=require('./offline-install.js');
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function target(){const handlers={};return {handlers,addEventListener(type,fn){(handlers[type]||=[]).push(fn);},removeEventListener(type,fn){handlers[type]=(handlers[type]||[]).filter(x=>x!==fn);},fire(type,event={}){for(const fn of handlers[type]||[])fn(event);}};}
function fixture({page='one',version=page,ready=false,pageReady=ready,activeVersion=ready?version:null,offline=false,file=false,unsupported=false,registerFails=false}={}){
 const nodes={},timers=new Map(),calls=[],ports=[];let serial=0,reloads=0,persists=0;
 const node=()=>({...target(),textContent:'',hidden:false,disabled:false,value:0,max:1});
 const data={type:'STATUS',version,ready,pageReady,activeVersion,total:60,totalBytes:47000000};
 const worker={...target(),state:'activated',postMessage(message,[port]){calls.push(message);if(message.type==='STATUS')queueMicrotask(()=>port.postMessage({...data}));else ports.push({message,port,worker:this});}};
 const reg={...target(),active:worker,waiting:null,installing:null};
 const sw={...target(),controller:worker,getRegistration:async()=>reg,register:async()=>{if(registerFails)throw Error('Offline');return reg;},ready:Promise.resolve(reg)};
 class Channel{constructor(){this.port1={close(){},onmessage:null};this.port2={close(){},postMessage:value=>this.port1.onmessage?.({data:value})};}}
 const win={...target(),navigator:{serviceWorker:unsupported?null:sw,onLine:!offline,storage:{persist(){persists++;return Promise.resolve(true);}}},isSecureContext:!file,location:{protocol:file?'file:':'https:',reload(){reloads++;}},MessageChannel:Channel,setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 const doc={...target(),hidden:false,querySelector:()=>({content:page})},root={ownerDocument:doc,dataset:{},querySelector(selector){const name=selector.match(/"([^"]+)"/)[1];return nodes[name]||(nodes[name]=node());}};
 const component=UI.create(root,{window:win});
 return {component,root,nodes,win,sw,reg,worker,data,calls,ports,timers,reloads:()=>reloads,persists:()=>persists};
}
test('offline saving is explicit and readiness waits for the complete worker result',async()=>{
 const v=fixture();await settle();assert.equal(v.ports.length,0);assert.equal(v.root.dataset.ready,'false');assert.equal(v.nodes.prepare.disabled,false);
 const saving=v.component.prepare();assert.equal(v.ports.length,1);assert.equal(v.persists(),1);assert.equal(v.nodes.prepare.disabled,true);
 assert.deepEqual(v.ports[0].message,{type:'PREPARE_OFFLINE',pageVersion:'one'});
 v.ports[0].port.postMessage({type:'PROGRESS',completed:20,total:60});assert.equal(v.nodes.progress.value,20);assert.equal(v.root.dataset.ready,'false');
 v.ports[0].port.postMessage({...v.data,type:'READY',ready:true,pageReady:true,activeVersion:'one'});await saving;
 assert.equal(v.root.dataset.ready,'true');assert.equal(v.nodes.badge.textContent,'Ready offline');assert.equal(v.nodes.prepare.hidden,true);assert.equal(v.nodes.apply.hidden,true);assert.equal(v.reloads(),0);v.component.destroy();
});
test('interrupted downloads offer retry and never claim an incomplete copy is ready',async()=>{
 const v=fixture();await settle();const saving=v.component.prepare();v.ports[0].port.postMessage({type:'ERROR',error:'Not enough available storage.'});await saving;
 assert.equal(v.root.dataset.ready,'false');assert.equal(v.nodes.prepare.textContent,'Retry offline download');assert.equal(v.nodes.prepare.disabled,false);assert.match(v.nodes.status.textContent,/Not enough available storage/);assert.equal(v.reloads(),0);v.component.destroy();
});
test('a saved old page remains ready while a new version downloads and restart requires an explicit action',async()=>{
 const v=fixture({page:'one',version:'two',ready:false,pageReady:true,activeVersion:'one'});await settle();
 v.worker.state='installed';v.reg.waiting=v.worker;
 assert.equal(v.root.dataset.ready,'true');assert.equal(v.nodes.apply.hidden,true);assert.match(v.nodes.prepare.textContent,/update/);
 const saving=v.component.prepare();v.ports[0].port.postMessage({...v.data,type:'READY',ready:true,pageReady:true});await saving;
 assert.equal(v.nodes.apply.hidden,false);assert.equal(v.reloads(),0);
 const applying=v.component.apply();v.ports[1].port.postMessage({type:'APPLIED',version:'two'});await applying;assert.equal(v.reloads(),0);
 v.sw.fire('controllerchange');assert.equal(v.reloads(),1);v.sw.fire('controllerchange');assert.equal(v.reloads(),1);v.component.destroy();
});
test('offline relaunch reuses the existing registration and checks for evicted files',async()=>{
 const v=fixture({ready:true,offline:true,registerFails:true});await settle();assert.equal(v.root.dataset.ready,'true');
 v.data.ready=v.data.pageReady=false;await v.component.check();assert.equal(v.root.dataset.ready,'false');assert.equal(v.nodes.prepare.hidden,false);v.component.destroy();
});
test('file launches keep the mathematical app usable without trying to install an unsupported worker',async()=>{
 for(const options of [{file:true},{unsupported:true}]){const v=fixture(options);await settle();assert.equal(v.calls.length,0);assert.equal(v.nodes.prepare.disabled,true);assert.equal(v.nodes.badge.textContent,'Website required');v.component.destroy();}
});
test('destruction ignores delayed installation results and never reloads',async()=>{
 const v=fixture();await settle();const saving=v.component.prepare();v.component.destroy();v.ports[0].port.postMessage({...v.data,type:'READY',ready:true,pageReady:true});await saving;assert.equal(v.root.dataset.ready,'false');assert.equal(v.reloads(),0);
});
