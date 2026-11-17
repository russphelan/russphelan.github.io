/* Optional offline installation. Numerical state stays owned by the app. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.GeodesicOfflineInstall=api;const start=()=>{const element=root.document.getElementById('offline-install');if(element)api.create(element,{window:root});};
    if(root.document.readyState==='complete')start();else root.addEventListener('load',start,{once:true});}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(element,{window:win=globalThis,reload=()=>win.location.reload()}={}){
    const doc=element.ownerDocument,nav=win.navigator,$=name=>element.querySelector('[data-offline="'+name+'"]');
    const expected=doc.querySelector('meta[name="offline-release"]')?.content||'',listeners=[];
    let registration=null,busy=false,destroyed=false,applying=false,reloaded=false,installPrompt=null,last=null,serial=0;
    const listen=(target,type,fn)=>{target?.addEventListener?.(type,fn);listeners.push([target,type,fn]);};
    const worker=()=>registration?.waiting||registration?.active;
    const pageReady=info=>!!info&&(info.pageReady===true||info.version===expected&&info.ready===true);
    function status(text,badge){$('status').textContent=text;$('badge').textContent=badge;}
    function render(info=last){
      if(destroyed)return;
      last=info;const ready=pageReady(info),update=!!info&&(info.version!==expected||!!info.activeVersion&&info.activeVersion!==info.version);
      element.dataset.ready=String(ready);element.dataset.version=info?.version||'';
      $('prepare').disabled=busy||!worker();$('check').disabled=busy||!worker();
      $('apply').hidden=!(info?.ready&&update);$('apply').disabled=busy;
      $('prepare').hidden=!!info?.ready;$('prepare').textContent=update?'Save update for offline use':'Save for offline use';
      $('progress').hidden=!busy;
      if(busy)return;
      if(ready){status(update?(info.ready?'Ready offline. An update is saved; restart when you are ready.':'Ready offline. An update is available to download.'):'Ready offline on this device. All surfaces, paths, and demonstrations have been saved.',update?'Ready offline · update available':'Ready offline');}
      else if(info?.ready){status('The offline copy is saved. Restart to open the saved version.','Saved · restart to finish');$('apply').hidden=false;}
      else{const size=info?.totalBytes?' About '+Math.ceil(info.totalBytes/1e6)+' MB.':'';status('Save the complete app while connected, then check for “Ready offline” before disconnecting.'+size,nav.onLine===false?'Not saved · offline':'Not saved on this device');}
    }
    function request(target,type,onProgress){
      return new Promise((resolve,reject)=>{
        if(!target){reject(Error('The offline installer is not ready yet.'));return;}
        const channel=new win.MessageChannel();let finished=false;
        const timer=win.setTimeout(()=>finish(Error('The offline download was interrupted. Reconnect and try again.')),type==='PREPARE_OFFLINE'?15*60*1000:30000);
        function finish(error,data){if(finished)return;finished=true;win.clearTimeout(timer);channel.port1.close();channel.port2.close();if(error)reject(error);else resolve(data);}
        channel.port1.onmessage=event=>{const data=event.data;if(!data||finished)return;
          if(data.type==='PROGRESS'){onProgress?.(data);return;}
          if(data.type==='ERROR'){finish(Error(data.error||'The offline copy could not be saved.'));return;}
          if(['STATUS','READY','APPLIED'].includes(data.type))finish(null,data);
        };
        try{target.postMessage({type,pageVersion:expected},[channel.port2]);}catch(error){finish(error);}
      });
    }
    async function check(){
      if(destroyed||busy||!worker())return;
      const token=++serial;
      try{const info=await request(worker(),'STATUS');if(token===serial&&!destroyed)render(info);}
      catch(_){if(token===serial&&!destroyed){element.dataset.ready='false';status('Could not check the offline copy. Keep the page open and try Check again.','Check needed');}}
    }
    async function prepare(){
      if(busy||!worker()||destroyed)return;
      const token=++serial;busy=true;render();$('progress').value=0;$('progress').max=1;status('Saving the complete app. Keep this page open until it is ready.','Saving…');
      // A persistence request is optional; a denial must not prevent saving.
      try{Promise.resolve(nav.storage?.persist?.()).catch(()=>{});}catch(_){}
      try{
        const info=await request(worker(),'PREPARE_OFFLINE',data=>{
          if(destroyed||token!==serial)return;
          const total=data.total||1,completed=data.completed||0;
          $('progress').max=total;$('progress').value=completed;
          status('Saving offline: '+Math.round(100*completed/total)+'% · '+completed+' of '+total+' files. Keep this page open.','Saving '+Math.round(100*completed/total)+'%');
        });
        if(destroyed||token!==serial)return;busy=false;render(info);
        // Recheck through the controller after the initial claim completes.
        if(info.version===expected&&!nav.serviceWorker.controller){status('Saved. Restart once to finish offline setup.','Saved · restart to finish');$('apply').hidden=false;}
      }catch(error){
        if(destroyed||token!==serial)return;busy=false;render(last);$('prepare').hidden=false;$('prepare').textContent='Retry offline download';
        status('Offline download did not finish. '+error.message+' Any previously saved version is kept.','Download incomplete');
      }
    }
    function finishReload(){if(destroyed||reloaded)return;reloaded=true;reload();}
    async function apply(){
      if(busy||!worker()||destroyed)return;
      applying=true;busy=true;render();status('Opening the complete saved version…','Restarting…');
      const target=worker();
      try{await request(target,'APPLY_UPDATE');if(target.state==='activated'||!registration.waiting)finishReload();else win.setTimeout(finishReload,8000);}
      catch(error){if(destroyed)return;busy=false;applying=false;render();status('The update could not be opened. '+error.message,'Update not applied');}
    }
    function watch(reg){
      registration=reg;
      listen(reg,'updatefound',()=>{const installing=reg.installing;listen(installing,'statechange',()=>{if(installing.state==='installed')check();});});
      if(reg.installing){const installing=reg.installing;listen(installing,'statechange',()=>{if(installing.state==='activated'||installing.state==='installed')check();});}
    }
    async function start(){
      if(!nav?.serviceWorker||!win.isSecureContext||win.location.protocol==='file:'){
        $('prepare').disabled=true;$('check').disabled=true;status(win.location.protocol==='file:'?'Open the public HTTPS website to save this app on your iPad.':'Offline installation needs a browser with offline web-app support and an HTTPS connection.','Website required');return;
      }
      try{
        status('Checking offline installation…','Checking…');
        const previous=await nav.serviceWorker.getRegistration('./');if(destroyed)return;if(previous)watch(previous);
        let reg;
        try{reg=await nav.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});}catch(error){if(!previous)throw error;reg=previous;}
        if(destroyed)return;if(reg!==registration)watch(reg);
        if(!reg.active){const ready=await nav.serviceWorker.ready;if(destroyed)return;if(ready!==registration)watch(ready);}
        await check();
      }catch(_){if(destroyed)return;status('Offline setup could not start. Reconnect, reload this page, and try again.','Setup unavailable');}
    }
    listen($('prepare'),'click',prepare);listen($('check'),'click',check);listen($('apply'),'click',apply);
    listen(win,'online',check);listen(win,'offline',check);listen(win,'pageshow',check);
    listen(doc,'visibilitychange',()=>{if(!doc.hidden)check();});
    listen(nav?.serviceWorker,'controllerchange',()=>{if(applying)finishReload();else check();});
    listen(win,'beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
    listen($('install'),'click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();}catch(_){}$('install').hidden=true;});
    listen(win,'appinstalled',()=>{$('install').hidden=true;installPrompt=null;check();});
    render();start();
    return Object.freeze({check,prepare,apply,destroy(){destroyed=true;serial++;for(const [target,type,fn]of listeners)target?.removeEventListener?.(type,fn);}});
  }
  return Object.freeze({create});
});
