const {JSDOM}=require(process.env.WHEEL_TEST_JSDOM || 'jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://wheel.test/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const errors=[];
 w.addEventListener('error',e=>errors.push(e.error||e.message));w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve(),cancel(){}}};
 w.localStorage.setItem('fortune-engine-config-v1',JSON.stringify({settings:{soundEnabled:false},levels:[{id:'start',activeAtStart:true,completionUnlockLevels:['next']},{id:'next',activeAtStart:false}],forfeits:[{id:'one',name:'First',levelId:'start',lifetime:{type:'once'},modifierWheel:{enabled:true,type:'minutes',min:2,max:2,step:1}},{id:'two',name:'Second',levelId:'next'}],rules:[]}));
 try{
 for(const script of w.document.querySelectorAll('script'))if(script.src)w.eval(fs.readFileSync(root+'/'+script.getAttribute('src').split('?')[0],'utf8'));
 const cfg=w.FortuneModel.loadConfig();const roundtrip=w.FortuneModel.xmlToConfig(w.FortuneModel.configToXml(cfg));
 assert.equal(roundtrip.forfeits[0].modifierWheel.type,'minutes');assert.equal(roundtrip.forfeits[0].modifierWheel.min,2);assert.equal(roundtrip.levels[0].completionMode,'empty');
 const mode=w.document.getElementById('spinMode');mode.value='manual';mode.dispatchEvent(new w.Event('change'));
 const button=w.document.getElementById('spinBtn');button.click();await pause(1300);
 assert.equal(button.querySelector('.spin-label').textContent,'STOP');assert.equal(button.disabled,false);assert.equal(mode.disabled,true);
 assert.equal(w.FortuneModel.loadSession(cfg).spinCount,0,'Manual spin must wait for stop');
 button.click();button.click();await pause(3400);
 const modal=w.document.querySelector('.modifier-overlay');assert.ok(modal);
 modal.querySelector('.group-actions button').click();await pause(20);modal.querySelector('.group-actions button').click();await pause(100);
 const s=w.FortuneModel.loadSession(cfg);assert.equal(s.spinCount,1);assert.equal(s.completedLevels.start,true);assert.equal(s.activeLevels.next,true);assert.equal(s.history.at(-1).modifierName,'2 min');
 assert.match(w.document.getElementById('resultTimerPanel').textContent,/02:00|2:00/);assert.equal(mode.disabled,false);assert.deepEqual(errors,[]);
 console.log('PASS: manual spin waits for Stop, one result, minute wheel, XML, timer, group exhaustion and next-group unlock.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
