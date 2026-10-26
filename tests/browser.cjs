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
const ids=['nothing','skip','swap','doubleForfeit','doubleOrNothing','pickYourPoison','fateRoulette','tripleTrouble','rarest','chaosWeights','devilFive','sealedEnvelopes','miniGame'];
const config={settings:{soundEnabled:false,fateSurprise:'off',title:'The Midnight Collection',showTextOnWheel:true,fateDeck:Object.fromEntries(ids.map(id=>[id,id==='sealedEnvelopes'?3:0]))},
levels:[{id:'a',name:'Chaos',icon:'✦',activeAtStart:true},{id:'b',name:'The next chapter',activeAtStart:false}],
forfeits:Array.from({length:9},(_,i)=>({id:'f'+i,name:['A quiet beginning','A change of pace','Your choice','A moment of chance','The hidden path','A small surprise','Another possibility','The final seal','Next chapter'][i],description:'A custom result from your agreed collection.',levelId:i<8?'a':'b',icon:'✦',color:['#73516d','#7a5b55','#535d76','#6c6650'][i%4],weight:i+1,timerSeconds:60,lifetime:{type:'spins',spins:2}}))};
(async()=>{
 await new Promise(resolve=>server.listen(8077,'127.0.0.1',resolve));
 try{
 for(const [engine,name,viewport] of [[chromium,'desktop',{width:1440,height:1100}],[chromium,'mobile',{width:390,height:844}],...(process.env.WHEEL_CHROMIUM_ONLY ? [] : [[firefox,'firefox',{width:1440,height:1100}]])]){
  const browser=await engine.launch();const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[],badAssets=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400 && /\.(js|css|svg|png)(\?|$)/.test(response.url()))badAssets.push(response.url());});
  await page.addInitScript(config=>{if(!localStorage.getItem('fortune-engine-config-v1'))localStorage.setItem('fortune-engine-config-v1',JSON.stringify(config));},config);
  try{
   await page.goto('http://127.0.0.1:8077/',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.FortunePlay && document.querySelector('.chapter-progress'));
   const geometry=await page.evaluate(()=>{
    const shell=document.getElementById('wheelShell').getBoundingClientRect(),hub=document.querySelector('.wheel-hub').getBoundingClientRect();
    return{dx:Math.abs((shell.left+shell.width/2)-(hub.left+hub.width/2)),dy:Math.abs((shell.top+shell.height/2)-(hub.top+hub.height/2)),overflow:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert.ok(geometry.dx<1 && geometry.dy<1,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
   const chapters=await page.locator('.level-light.active').evaluateAll(cards=>cards.map(card=>{
    const row=card.querySelector('.chapter-row').getBoundingClientRect(),title=card.querySelector('strong').getBoundingClientRect(),detail=card.querySelector('.chapter-detail').getBoundingClientRect();
    return {titleWidth:title.width,overlap:detail.top<row.bottom};
   }));assert.ok(chapters.every(card=>card.titleWidth>65 && !card.overlap),JSON.stringify(chapters));
   assert.equal(await page.locator('#resultDeclineBtn').count(),0);
   await page.screenshot({path:'test-artifacts/'+name+'-wheel.png',fullPage:true});
   await page.locator('#arcadeBtn').click();
   await page.getByRole('button',{name:/Higher or Lower/}).click();
   await page.getByRole('button',{name:'↑ Higher',exact:true}).click();
   await page.getByRole('button',{name:'All games',exact:true}).click();
   await page.getByRole('button',{name:/Dice Duel/}).click();
   await page.getByRole('button',{name:'Roll the dice',exact:true}).click();
   assert.match(await page.locator('.arcade-body').textContent(),/You:/);
   await page.getByRole('button',{name:'All games',exact:true}).click();
   await page.getByRole('button',{name:/Stop the Meter/}).click();
   await page.getByRole('button',{name:'Start',exact:true}).click();
   await page.waitForTimeout(400);await page.getByRole('button',{name:'Stop',exact:true}).click();
   await page.screenshot({path:'test-artifacts/'+name+'-arcade.png',fullPage:true});
   assert.equal(await page.evaluate(()=>FortuneModel.loadSession(FortuneModel.loadConfig()).history.length),0);
   await page.keyboard.press('Escape');
   await page.locator('#arcadeBtn').click();await page.getByRole('button',{name:'Close mini-games'}).click();
   await page.evaluate(()=>window.FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4Continue').waitFor({state:'visible'});await page.locator('#fateV4Continue').click();
   await page.locator('.fate-envelope').first().waitFor();
   await page.waitForTimeout(1200);
   await page.screenshot({path:'test-artifacts/'+name+'-envelopes.png',fullPage:true});
   await page.locator('.fate-envelope').nth(1).focus();await page.keyboard.press('Enter');
   await page.waitForTimeout(1100);
   await page.screenshot({path:'test-artifacts/'+name+'-opening.png',fullPage:true});
   await page.locator('#batchDone').waitFor();
   assert.equal(await page.locator('#batchDecline,.reveal-end').count(),0);
   assert.equal(await page.evaluate(()=>FortuneModel.loadSession(FortuneModel.loadConfig()).history.length),1);
   const chosen=await page.evaluate(()=>FortunePlay.batch().entries[FortunePlay.batch().chosen].item.id);
   await page.reload();await page.locator('#batchDone').waitFor();
   assert.equal(await page.evaluate(()=>FortunePlay.batch().entries[FortunePlay.batch().chosen].item.id),chosen);
   await page.screenshot({path:'test-artifacts/'+name+'-reveal.png',fullPage:true});
   assert.equal(await page.locator('#batchAccept').count(),0);
   assert.equal(await page.evaluate(()=>FortuneModel.loadSession(FortuneModel.loadConfig()).history.length),1);
   await page.locator('#batchDone').click();
   await page.goto('http://127.0.0.1:8077/edit.html',{waitUntil:'networkidle'});
   await page.locator('[data-tab="settings"]').click();
   await page.locator('[data-card="sealedEnvelopes"]').fill('4');
   await page.locator('.deck-art-gallery summary').click();
   const portrait=page.locator('[data-art-card="sealedEnvelopes"] .card-image-preview');
   const firstLook=await portrait.getAttribute('src');
   await page.getByRole('button',{name:'Preview next artwork for Sealed Envelopes'}).click();
   assert.notEqual(await portrait.getAttribute('src'),firstLook,'the editor should preview the other included look');
   const testImage=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=124;const context=canvas.getContext('2d');context.fillStyle='#aa5577';context.fillRect(0,0,80,124);return canvas.toDataURL('image/png');});
   await page.locator('[data-card-image="sealedEnvelopes"]').setInputFiles({name:'custom-card.png',mimeType:'image/png',buffer:Buffer.from(testImage.split(',')[1],'base64')});
   await page.locator('[data-art-card="sealedEnvelopes"] .card-image-status').filter({hasText:'Custom image'}).waitFor();
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   const applyBox=await page.locator('#applyBtn').boundingBox();assert.ok(applyBox.y>=0 && applyBox.y+applyBox.height<=viewport.height);
   await page.screenshot({path:'test-artifacts/'+name+'-editor-savebar.png',fullPage:true});
   await page.locator('#applyBtn').click();
   assert.equal(await page.evaluate(()=>FortuneModel.loadConfig().settings.fateDeck.sealedEnvelopes),4);
   const imageSaved=await page.evaluate(()=>{const M=FortuneModel,cfg=M.loadConfig();return {data:cfg.settings.cardImages.sealedEnvelopes,xml:M.xmlToConfig(M.configToXml(cfg)).settings.cardImages.sealedEnvelopes};});
   assert.ok(imageSaved.data.startsWith('data:image/webp;base64,'));assert.equal(imageSaved.data,imageSaved.xml);
   await page.goto('http://127.0.0.1:8077/',{waitUntil:'networkidle'});await page.evaluate(()=>FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4Continue').waitFor({state:'visible'});assert.equal(await page.locator('#fateV4FrontImage').getAttribute('src'),imageSaved.data);
   await page.goto('http://127.0.0.1:8077/edit.html',{waitUntil:'networkidle'});await page.locator('[data-tab="settings"]').click();
   await page.locator('.deck-art-gallery summary').click();
   await page.getByRole('button',{name:'Use default image for Sealed Envelopes',exact:true}).click();await page.locator('#applyBtn').click();
   assert.equal(await page.evaluate(()=>FortuneModel.loadConfig().settings.cardImages.sealedEnvelopes),undefined);
   await page.goto('http://127.0.0.1:8077/',{waitUntil:'networkidle'});await page.evaluate(()=>FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4Continue').waitFor({state:'visible'});
   const shownLook=await page.locator('#fateV4FrontImage').getAttribute('src');
   assert.ok(await page.evaluate(src=>FortuneFeatures.cardArtworkVariants('sealedEnvelopes').includes(src),shownLook));
   await page.reload();await page.locator('#fateV4Continue').waitFor({state:'visible'});
   assert.equal(await page.locator('#fateV4FrontImage').getAttribute('src'),shownLook,'a drawn card keeps its artwork after reload');
   const fateArt=await page.evaluate(()=>{const card=document.querySelector('#fateV4Card').getBoundingClientRect();return {width:card.width,ratio:card.height/card.width,fit:getComputedStyle(document.querySelector('#fateV4FrontImage')).objectFit};});
   assert.equal(fateArt.fit,'contain','full Fate illustrations must never be cropped');
   assert.ok(fateArt.ratio>1.45&&fateArt.ratio<1.55,'full artwork should keep its tall card aspect ratio');
   assert.ok(fateArt.width>=(name==='mobile'?220:320),'Fate card should be visibly large on '+name);
   await page.evaluate(()=>{const M=FortuneModel,cfg=M.loadConfig();cfg.settings.fateDeck=Object.fromEntries(Object.keys(FortuneFeatures.deckDefaults).map(id=>[id,id==='miniGame'?1:0]));M.saveConfig(cfg);M.resetSession(cfg);});
   await page.reload();
   assert.ok((await page.locator('#wheelEntryList .wheel-entry-row').count())>0,'full wheel-entry names should be accessible');
   await page.evaluate(()=>FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4Continue').filter({hasText:'Play mini-game'}).waitFor({state:'visible'});
   await page.locator('#fateV4Continue').click();
   await page.locator('.arcade-dialog[open]').waitFor();
   assert.match(await page.locator('.arcade-dialog .section-kicker').textContent(),/FATE CARD/);
   const miniHeading=await page.locator('.arcade-body h3').textContent();
   if(miniHeading.includes('Higher'))await page.getByRole('button',{name:'↓ Lower'}).click();
   else if(miniHeading.includes('Dice'))await page.getByRole('button',{name:'Roll the dice'}).click();
   else {await page.getByRole('button',{name:'Start',exact:true}).click();await page.waitForTimeout(220);await page.getByRole('button',{name:'Stop',exact:true}).click();}
   await page.locator('.arcade-dialog .arcade-actions button').filter({hasText:'Continue'}).click();
   assert.equal(await page.locator('.arcade-dialog[open]').count(),0);
   await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('fortune-fate-deck-v4'))?.draw);
   assert.equal(await page.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('fortune-fate-deck-v4'))?.draw)),false,'mini-game Fate card must resolve exactly once');
   // The atmospheric Fate omen and three-way risk choice must work on mobile too.
   await page.evaluate(()=>{const M=FortuneModel,cfg=M.loadConfig();cfg.settings.fateSurprise='frequent';cfg.settings.fateDeck=Object.fromEntries(Object.keys(FortuneFeatures.deckDefaults).map(id=>[id,id==='pickYourPoison'?1:0]));M.saveConfig(cfg);M.resetSession(cfg);});
   await page.reload();
   await page.locator('#fateOmen:not([hidden])').waitFor();
   assert.match(await page.locator('#fateOmenDetail').textContent(),/8% chance/);
   await page.evaluate(()=>FortuneFateDeck.drawFromWheel());
   await page.locator('#fateV4ChoiceWager').waitFor({state:'visible'});
   const riskBox=await page.locator('#fateV4ChoiceWager').boundingBox();
   assert.ok(riskBox.y+riskBox.height<=viewport.height+2,'the wager action must be reachable without scrolling on '+name);
   await page.screenshot({path:'test-artifacts/'+name+'-wager.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.locator('#fateV4ChoiceWager').click();
   const wager=await page.evaluate(()=>JSON.parse(localStorage.getItem('fortune-fate-deck-v4')).draw.action);
   assert.ok(['wagerWin','wagerLose'].includes(wager));
   await page.reload();
   await page.locator('#fateV4Continue').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fortune-fate-deck-v4')).draw.action),wager);
   assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
   console.log('PASS '+name+': centered hub, no horizontal overflow, manga assets, animated envelopes, keyboard choice, reload recovery, automatic results and chapter layout, persistent Apply, image upload/XML/play/default reset and no Decline.');
  }finally{await browser.close();}
 }
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
