(() => {
  'use strict';
  const studio=document.getElementById('studioModeBtn');
  if(studio)document.querySelector('.game-menu-items')?.append(studio);
  const reset=document.getElementById('resetBtn');
  if(reset)document.querySelector('.game-menu-items')?.append(reset);
  document.querySelectorAll('.game-menu-items button').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.game-menu').open=false;}));
  const key='fortune-arcade-v1';
  let score=0;try{score=Math.max(0,Number(localStorage.getItem(key))||0);}catch{}
  let frame=0, opener=null, game='', turn=0, value=0, streak=0, position=0, running=false;
  const dialog=document.createElement('dialog');dialog.className='arcade-dialog';dialog.setAttribute('aria-labelledby','arcadeTitle');
  dialog.innerHTML='<header><div><span class="section-kicker">THE ARCADE</span><h2 id="arcadeTitle">A little luck. A little skill.</h2></div><button class="btn ghost" data-close aria-label="Close mini-games">✕</button></header><div class="arcade-score" role="status"></div><div class="arcade-body"></div>';
  document.body.append(dialog);
  const body=dialog.querySelector('.arcade-body'),status=dialog.querySelector('.arcade-score');
  const button=(label,fn,cls='btn primary')=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=fn;return b;};
  function award(n){score+=n;try{localStorage.setItem(key,String(score));}catch{}updateScore();}
  function updateScore(){status.textContent=score+' arcade points · separate from your wheel';}
  function stop(){cancelAnimationFrame(frame);running=false;turn++;}
  function screen(title){stop();body.replaceChildren();const h=document.createElement('h3');h.textContent=title;body.append(h);}
  function text(message,cls='arcade-message'){const p=document.createElement('p');p.className=cls;p.textContent=message;body.append(p);return p;}
  function actions(...buttons){const row=document.createElement('div');row.className='arcade-actions';row.append(...buttons);body.append(row);}
  function home(){screen('Choose your game');game='';const grid=document.createElement('div');grid.className='arcade-grid';[['↕','Higher or Lower','Build a streak',higher],['⚄','Dice Duel','Beat the house',dice],['◈','Stop the Meter','Hit the gold zone',meter]].forEach(([icon,name,sub,fn])=>{const b=button('',fn,'arcade-tile');const mark=document.createElement('span');mark.textContent=icon;const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('small');small.textContent=sub;b.append(mark,strong,small);grid.append(b);});body.append(grid);}
  function back(){return button('All games',home,'btn ghost');}
  function higher(){game='higher';screen('Higher or Lower');streak=0;value=1+Math.floor(Math.random()*13);drawHigher();}
  function drawHigher(){body.replaceChildren();const h=document.createElement('h3');h.textContent='Higher or Lower';body.append(h);text(String(value),'arcade-number');text('Cards 1–13 · Equal is a draw · Streak '+streak);actions(button('↓ Lower',()=>guess(-1)),button('↑ Higher',()=>guess(1)),back());}
  function guess(direction){let next=1+Math.floor(Math.random()*13);if(next===value){drawHigher();text('Equal — try again.');return;}const win=Math.sign(next-value)===direction;value=next;if(win){streak++;drawHigher();text('Correct · '+streak*10+' points to bank');actions(button('Bank '+streak*10+' points',()=>{award(streak*10);higher();}));}else{screen('The streak ends');text(String(next),'arcade-number');text('No points banked this time.');actions(button('Play again',higher),back());}}
  function dice(){game='dice';screen('Dice Duel');text('Two dice each · Higher total wins 20 points');actions(button('Roll the dice',rollDice),back());}
  function rollDice(){const roll=()=>1+Math.floor(Math.random()*6);const a=[roll(),roll()],b=[roll(),roll()];screen('Dice Duel');text(a.join(' + ')+' vs '+b.join(' + '),'arcade-number dice-numbers');const yours=a[0]+a[1],house=b[0]+b[1];text('You: '+yours+' · House: '+house);if(yours>house){award(20);text('You win · +20 points');}else text(yours===house?'A draw. Roll again.':'The house wins this round.');actions(button('Roll again',rollDice),back());}
  function meter(){game='meter';screen('Stop the Meter');text('Stop in the gold zone · Win 30 points');const track=document.createElement('div');track.className='arcade-meter';track.innerHTML='<span class="meter-target"></span><span class="meter-cursor"></span>';body.append(track);const cursor=track.lastElementChild;const trigger=button('Start',()=>{if(!running){running=true;trigger.textContent='Stop';const start=performance.now();const tick=now=>{if(!running)return;position=(Math.sin((now-start)/650-Math.PI/2)+1)*50;cursor.style.left=position+'%';frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}else{stop();trigger.disabled=true;const win=position>=42&&position<=58;if(win)award(30);text(win?'Perfect · +30 points':'Outside the zone — try again');actions(button('Play again',meter));}});actions(trigger,back());}
  function open(){if(document.querySelector('.result-overlay:not([hidden]),.batch-overlay,.modifier-overlay,.fate-v4-overlay:not([hidden])')||document.getElementById('spinBtn').disabled)return;opener=document.activeElement;home();updateScore();dialog.showModal();}
  function close(){stop();dialog.close();opener?.focus();}
  document.getElementById('arcadeBtn').onclick=open;
  dialog.querySelector('[data-close]').onclick=close;
  dialog.addEventListener('cancel',()=>stop());dialog.addEventListener('close',stop);
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
})();
