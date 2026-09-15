(() => {
  'use strict';
  const F=window.FortuneFeatures;
  let pending=0;
  function syncBusy() {
    ['applyBtn','editorSaveBtn'].forEach(id=>{const button=document.getElementById(id);if(button)button.disabled=pending>0;});
  }
  async function readImage(file) {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
    if(file.size>12*1024*1024)throw Error('Choose an image smaller than 12 MB.');
    const url=URL.createObjectURL(file),image=new Image();
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This image could not be opened.'));image.src=url;});
      const canvas=document.createElement('canvas');
      let scale=Math.min(1,480/image.naturalWidth,744/image.naturalHeight);
      for(let size=0;size<4;size++) {
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [.86,.7,.5]) {
          const data=canvas.toDataURL('image/webp',quality);
          if(data.length<=F.maxCardImageLength)return data;
        }
        scale*=.7;
      }
      throw Error('This image is too detailed to store. Try a smaller image.');
    } finally {URL.revokeObjectURL(url);}
  }
  function mount(container,id,name,settings,changed) {
    const editor=document.createElement('div');editor.className='card-image-editor';editor.dataset.artCard=id;
    const preview=document.createElement('img');preview.className='card-image-preview';preview.alt=name+' artwork';preview.width=80;preview.height=124;preview.loading='lazy';
    const controls=document.createElement('div');controls.className='card-image-controls';
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;input.dataset.cardImage=id;
    const upload=document.createElement('button');upload.type='button';upload.className='btn ghost';upload.textContent='Upload image';upload.setAttribute('aria-label','Upload image for '+name);upload.onclick=()=>input.click();
    const reset=document.createElement('button');reset.type='button';reset.className='btn ghost';reset.textContent='Use default';reset.setAttribute('aria-label','Use default image for '+name);
    const status=document.createElement('small');status.className='card-image-status';status.setAttribute('role','status');
    const refresh=()=>{F.setCardImage(preview,id,settings);reset.disabled=!settings.cardImages[id];status.textContent=settings.cardImages[id]?'Custom image':'Default artwork';};
    reset.onclick=()=>{delete settings.cardImages[id];input.value='';refresh();changed();};
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      pending++;syncBusy();upload.disabled=true;reset.disabled=true;status.textContent='Preparing image…';
      try {
        const data=await readImage(file);
        if(!editor.isConnected)return;
        settings.cardImages[id]=data;refresh();changed();
      } catch(error) {if(editor.isConnected){status.textContent=error.message;reset.disabled=!settings.cardImages[id];}}
      finally {input.value='';upload.disabled=false;pending--;syncBusy();}
    };
    controls.append(upload,reset,input,status);editor.append(preview,controls);container.append(editor);refresh();
  }
  window.FortuneCardImageEditor={mount};
})();
