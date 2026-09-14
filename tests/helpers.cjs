const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const cardIds=['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive','sealedEnvelopes'];
const deck=(type,count=5)=>Object.fromEntries(cardIds.map(id=>[id,id===type?count:0]));
async function setup(config={}, {page='index.html',saved=null}={}) {
 const dom=new JSDOM(fs.readFileSync(path.join(root,page),'utf8'),{url:'https://wheel.test/'+page,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,errors=[];
 w.addEventListener('error',event=>errors.push(event.error||event.message));
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;
 w.HTMLElement.prototype.animate=function(){return{finished:Promise.resolve(),cancel(){}};};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.fetch=()=>Promise.reject(Error('Network disabled in tests'));w.Math.random=()=>.99;
 w.localStorage.setItem('fortune-engine-config-v1',JSON.stringify({...config,settings:{soundEnabled:false,fateDeck:deck('rarest'),...config.settings}}));
 if(saved)Object.entries(saved).forEach(([k,v])=>w.localStorage.setItem(k,v));
 for(const script of w.document.querySelectorAll('script')){
   w.eval(script.src?fs.readFileSync(path.join(root,script.getAttribute('src').split('?')[0]),'utf8'):script.textContent);
 }
 await wait(80);
 return {w,errors,session:()=>w.FortuneModel.loadSession(w.FortuneModel.loadConfig()),
   saved:()=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const key=w.localStorage.key(i);return[key,w.localStorage.getItem(key)];})),
   close:()=>w.close()};
}
async function next(f,accept=true) {
 const button=f.w.document.getElementById('batchNext');
 if(button){button.click();await wait(20);}
 f.w.document.getElementById(accept?'batchAccept':'batchDecline')?.click();await wait(10);
}
async function finish(f,accept=true) {
 for(let i=0;i<8 && f.w.FortuneRevealState.next(f.w.FortunePlay.batch());i++)await next(f,accept);
}
module.exports={setup,deck,next,finish,wait,root};
