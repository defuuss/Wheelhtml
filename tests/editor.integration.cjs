const {JSDOM}=require(process.env.WHEEL_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'); const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(root+'/edit.html','utf8'),{url:'https://wheel.test/edit.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
 w.fetch=()=>Promise.reject(Error('Network disabled in test'));w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};
 try{
  for(const script of w.document.querySelectorAll('script')){if(script.src)w.eval(fs.readFileSync(root+'/'+script.getAttribute('src').split('?')[0],'utf8'));else w.eval(script.textContent);}
  await pause(500);
  const list=w.document.getElementById('forfeitEditorList');assert.equal(list.querySelectorAll(':scope > .forfeit-group').length,4);
  let mutations=0;const observer=new w.MutationObserver(x=>mutations+=x.length);observer.observe(list,{childList:true});await pause(300);assert.equal(mutations,0,'Editor must settle without regrouping forever');
  const name=list.querySelector('.js-name');name.focus();for(const char of ' ABC'){name.value+=char;name.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(30);assert.equal(w.document.activeElement,name);assert.ok(name.isConnected);}
  assert.equal(mutations,0,'Typing must not rebuild the groups');
  const target=list.querySelector('[data-level-id="chaos"]');const before=w.FortuneEditor.getDraft().forfeits.length;
  target.querySelector('.group-actions button').click();await pause(400);
  assert.equal(w.FortuneEditor.getDraft().forfeits.length,before+1);
  let added=w.FortuneEditor.getDraft().forfeits.at(-1);assert.equal(added.levelId,'chaos');
  const card=[...list.querySelectorAll('.forfeit-editor-card')].find(x=>x.dataset.id===added.id);
  assert.equal(w.document.activeElement,card.querySelector('.js-name'));
  const dropdown=card.querySelector('.js-lifetime-type');dropdown.focus();dropdown.value='once';dropdown.dispatchEvent(new w.Event('change',{bubbles:true}));await pause(150);assert.equal(w.document.activeElement,dropdown);assert.equal(dropdown.value,'once');
  const panel=card.querySelector('.modifier-editor');const enable=panel.querySelector('input[type=checkbox]');enable.checked=true;enable.dispatchEvent(new w.Event('change',{bubbles:true}));panel.querySelector('.modifier-editor-content button').click();
  const row=panel.querySelector('.modifier-row');const entryName=row.querySelector('input');entryName.value='Half time & <custom>';entryName.dispatchEvent(new w.Event('input',{bubbles:true}));
  const fields=row.querySelectorAll('input[type=number]');fields[1].value='.5';fields[1].dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.getElementById('applyBtn').click();await pause(250);
  const saved=w.FortuneModel.loadConfig();const item=saved.forfeits.find(x=>x.id===added.id);assert.equal(item.modifierWheel.enabled,true);assert.equal(item.modifierWheel.outcomes[0].timerMultiplier,.5);
  const xml=w.FortuneModel.configToXml(saved);const imported=w.FortuneModel.xmlToConfig(xml);assert.deepEqual(JSON.parse(JSON.stringify(imported.forfeits.find(x=>x.id===added.id).modifierWheel)),JSON.parse(JSON.stringify(item.modifierWheel)));
  const victim=imported.levels.find(x=>x.id==='chaos');w.FortuneEditor.deleteGroup(victim.id);await pause(300);
  assert.equal(w.FortuneEditor.getDraft().levels.some(x=>x.id==='chaos'),false);assert.equal(w.FortuneEditor.getDraft().forfeits.some(x=>x.levelId==='chaos'),false);
  w.document.getElementById('applyBtn').click();await pause(200);assert.equal(w.FortuneModel.loadConfig().levels.some(x=>x.id==='chaos'),false);
  assert.deepEqual(errors,[]);observer.disconnect();console.log('PASS: stable editor, typing focus, group add, dropdown selection, modifier editing/save/XML roundtrip, group deletion/save.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
