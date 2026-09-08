const {JSDOM}=require(process.env.WHEEL_TEST_JSDOM || 'jsdom');const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 for(const eventType of ['cardPick','randomize','spinAgain']){
  const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://wheel.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;const errors=[];
  w.addEventListener('error',e=>errors.push(e.error||e.message));w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve(),cancel(){}}};
  w.localStorage.setItem('fortune-engine-config-v1',JSON.stringify({settings:{soundEnabled:false},levels:[{id:'start',activeAtStart:true}],forfeits:[{id:'special',name:'Special',levelId:'start',eventType}],rules:[]}));
  try{
   for(const script of w.document.querySelectorAll('script'))if(script.src)w.eval(fs.readFileSync(root+'/'+script.getAttribute('src').split('?')[0],'utf8'));
   w.document.getElementById('spinBtn').click();await pause(1000);
   const M=w.FortuneModel;assert.equal(M.loadConfig().forfeits[0].eventType,eventType);assert.equal(M.xmlToConfig(M.configToXml(M.loadConfig())).forfeits[0].eventType,eventType);
   if(eventType==='cardPick'){assert.equal(w.document.getElementById('fateDeckOverlayV4').hidden,false);assert.match(w.document.getElementById('fateDeckCount').textContent,/17/);}
   if(eventType==='randomize'){const multiplier=M.loadSession(M.loadConfig()).runtime.special.weightMultiplier;assert.ok(multiplier>=.6&&multiplier<=1.6);}
   if(eventType==='spinAgain'){w.document.getElementById('resultCloseBtn').click();await pause(700);assert.equal(M.loadSession(M.loadConfig()).spinCount,2);}
   assert.deepEqual(errors,[]);
  }finally{w.close();}
 }
 console.log('PASS: card-pick, weight modifier and spin-again events execute; special types survive XML.');
})().catch(e=>{console.error(e);process.exitCode=1});
