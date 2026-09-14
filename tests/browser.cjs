const {chromium,firefox}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
const ids=['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive','sealedEnvelopes'];
const config={settings:{soundEnabled:false,title:'The Midnight Collection',showTextOnWheel:true,fateDeck:Object.fromEntries(ids.map(id=>[id,id==='sealedEnvelopes'?3:0]))},
levels:[{id:'a',name:'First chapter',icon:'✦',activeAtStart:true},{id:'b',name:'The next chapter',activeAtStart:false}],
forfeits:Array.from({length:9},(_,i)=>({id:'f'+i,name:['A quiet beginning','A change of pace','Your choice','A moment of chance','The hidden path','A small surprise','Another possibility','The final seal','Next chapter'][i],description:'A custom result from your agreed collection.',levelId:i<8?'a':'b',icon:'✦',color:['#73516d','#7a5b55','#535d76','#6c6650'][i%4],weight:i+1,timerSeconds:60,lifetime:{type:'spins',spins:2}}))};
(async()=>{
 await new Promise(resolve=>server.listen(8077,'127.0.0.1',resolve));
 try{
 for(const [engine,name,viewport] of [[chromium,'desktop',{width:1440,height:1100}],[chromium,'mobile',{width:390,height:844}],[firefox,'firefox',{width:1440,height:1100}]]){
  const browser=await engine.launch();const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[],badAssets=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400 && /\.(js|css|svg|png)(\?|$)/.test(response.url()))badAssets.push(response.url());});
  await page.addInitScript(config=>localStorage.setItem('fortune-engine-config-v1',JSON.stringify(config)),config);
  try{
   await page.goto('http://127.0.0.1:8077/',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.FortunePlay && document.querySelector('.chapter-progress'));
   const geometry=await page.evaluate(()=>{
    const shell=document.getElementById('wheelShell').getBoundingClientRect(),hub=document.querySelector('.wheel-hub').getBoundingClientRect();
    return{dx:Math.abs((shell.left+shell.width/2)-(hub.left+hub.width/2)),dy:Math.abs((shell.top+shell.height/2)-(hub.top+hub.height/2)),overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.ok(geometry.dx<1 && geometry.dy<1,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
   await page.screenshot({path:'test-artifacts/'+name+'-wheel.png',fullPage:true});
   await page.evaluate(()=>window.FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4Continue').waitFor({state:'visible'});await page.locator('#fateV4Continue').click();
   await page.locator('.fate-envelope').first().waitFor();
   await page.waitForTimeout(1200);
   await page.screenshot({path:'test-artifacts/'+name+'-envelopes.png',fullPage:true});
   await page.locator('.fate-envelope').nth(1).focus();await page.keyboard.press('Enter');
   await page.waitForTimeout(1100);
   await page.screenshot({path:'test-artifacts/'+name+'-opening.png',fullPage:true});
   await page.locator('#batchAccept').waitFor();
   assert.equal(await page.evaluate(()=>FortuneModel.loadSession(FortuneModel.loadConfig()).history.length),0);
   const chosen=await page.evaluate(()=>FortunePlay.batch().entries[FortunePlay.batch().chosen].item.id);
   await page.reload();await page.locator('#batchAccept').waitFor();
   assert.equal(await page.evaluate(()=>FortunePlay.batch().entries[FortunePlay.batch().chosen].item.id),chosen);
   await page.screenshot({path:'test-artifacts/'+name+'-reveal.png',fullPage:true});
   await page.locator('#batchAccept').click();
   assert.equal(await page.evaluate(()=>FortuneModel.loadSession(FortuneModel.loadConfig()).history.length),1);
   await page.locator('#batchDone').click();
   await page.goto('http://127.0.0.1:8077/edit.html',{waitUntil:'networkidle'});
   await page.locator('[data-tab="settings"]').click();
   await page.locator('[data-card="sealedEnvelopes"]').fill('4');
   await page.locator('#applyBtn').click();
   assert.equal(await page.evaluate(()=>FortuneModel.loadConfig().settings.fateDeck.sealedEnvelopes),4);
   assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
   console.log('PASS '+name+': centered hub, no horizontal overflow, vector assets, animated envelopes, keyboard choice, reload recovery, acceptance and editor save.');
  }finally{await browser.close();}
 }
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
