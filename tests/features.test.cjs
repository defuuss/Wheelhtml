const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
  const storage = new Map();
  const context = vm.createContext({ window: {}, document: {body:{dataset:{page:'edit'}}}, console, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) } });
  for (const name of ['features.js','model.js','dependency-model.js','progression-model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/core',name),'utf8'), context);
  return { F: context.window.FortuneFeatures, M: context.window.FortuneModel, D: context.window.FortuneDependencyState, P: context.window.FortuneProgressionState };
}
test('group deletion removes contents and dependent rules, preserves other groups and does not mutate its input', () => {
  const { F } = setup();
  const original = { levels:[{id:'a',activeAtStart:true},{id:'b',completionUnlockLevels:['a']}], forfeits:[{id:'x',levelId:'a'},{id:'y',levelId:'b',unlockLevels:['a'],requiresForfeitIds:['x']}], rules:[{id:'r',conditionForfeitIds:['x'],unlockLevels:['b']}] };
  const result = F.deleteGroup(original,'a');
  assert.deepEqual(Array.from(result.forfeits,x=>x.id),['y']);
  assert.equal(result.forfeits[0].requiresForfeitIds.length,0); assert.equal(result.forfeits[0].unlockLevels.length,0);
  assert.equal(result.levels[0].completionUnlockLevels.length,0); assert.equal(result.levels[0].activeAtStart,true);
  assert.equal(result.rules.length,0); assert.equal(original.forfeits.length,2);
  const final = F.deleteGroup(result,'b'); assert.equal(final.forfeits.length,0); assert.equal(final.levels[0].id,'start');
});
test('modifiers survive all model layers, save/reload and cloning', () => {
  const { F,M } = setup(); let config = M.loadConfig();
  config.forfeits[0].modifierWheel = {enabled:true,chance:75,outcomes:[{name:'Short version',description:'A <custom> & original instruction',weight:3,timerMultiplier:.5},{name:'Keep original',weight:1,timerMultiplier:1}]};
  config = M.saveConfig(config); const loaded = M.loadConfig();
  assert.equal(loaded.forfeits[0].modifierWheel.outcomes[0].timerMultiplier,.5);
  assert.equal(loaded.forfeits[0].modifierWheel.chance,75);
  assert.equal(F.choose(loaded.forfeits[0].modifierWheel.outcomes,()=>.74).name,'Short version');
  assert.equal(F.choose(loaded.forfeits[0].modifierWheel.outcomes,()=>.76).name,'Keep original');
  const changed = F.applyModifier({...loaded.forfeits[0],timerSeconds:120},loaded.forfeits[0].modifierWheel.outcomes[0]);
  assert.equal(changed.timerSeconds,60); assert.match(changed.description,/Short version/);
  assert.equal(F.applyModifier({timerSeconds:0}, {timerMultiplier:2,name:'X'}).timerSeconds,0);
  assert.equal(F.applyModifier({timerSeconds:1800}, {timerMultiplier:4,name:'X'}).timerSeconds,3600);
});
test('disabled legacy modifier data does not alter session signatures; active changes do', () => {
  const { M } = setup(); const config = M.loadConfig(); const before = M.signature(config);
  config.forfeits[0].modifierWheel = {enabled:false,outcomes:[]}; assert.equal(M.signature(config),before);
  config.forfeits[0].modifierWheel = {enabled:true,chance:100,outcomes:[{name:'A',weight:1}]}; assert.notEqual(M.signature(config),before);
});
test('modifier settings clamp malformed input and remain disabled for old XML configurations', () => {
  const { F } = setup(); assert.equal(F.normalizeModifier(undefined).enabled,false);
  const settings=F.normalizeModifier({enabled:true,chance:250,outcomes:[{name:'a',weight:-2,timerMultiplier:100}]});
  assert.equal(settings.chance,100); assert.equal(settings.outcomes[0].weight,.1); assert.equal(settings.outcomes[0].timerMultiplier,4);
});

test('groups complete only after permanent removal, then unlock the next group', () => {
  const {M,P}=setup();
  const cfg=M.sanitizeConfig({levels:[{id:'a',activeAtStart:true,completionUnlockLevels:['b']},{id:'b'}],forfeits:[{id:'x',levelId:'a',lifetime:{type:'once'}},{id:'y',levelId:'a',lifetime:{type:'once'},requiresForfeitIds:['x']},{id:'z',levelId:'b'}]});
  const s=M.createSession(cfg);
  assert.equal(s.completedLevels.a,undefined);
  s.runtime.x.removed=true;s.runtime.y.removed=true;s.runtime.y.dependencyLocked=true;
  P.evaluate(s,cfg);assert.equal(s.completedLevels.a,undefined,'Locked prerequisite is not exhausted');
  s.runtime.y.dependencyLocked=false;s.runtime.y.removed=false;s.runtime.y.cooldown=2;
  P.evaluate(s,cfg);assert.equal(s.completedLevels.a,undefined,'Cooldown is temporary');
  s.runtime.y.removed=true;P.evaluate(s,cfg);
  assert.equal(s.completedLevels.a,true);assert.equal(s.activeLevels.a,false);assert.equal(s.activeLevels.b,true);
});
test('simple modifier wheels produce equal outcomes and minutes set a timer on untimed results',()=>{
 const {F,M}=setup();
 assert.deepEqual(Array.from(F.modifierOutcomes({type:'binary'}),x=>x.value),[true,false]);
 const outcomes=F.modifierOutcomes({type:'minutes',min:2,max:6,step:2});
 assert.deepEqual(Array.from(outcomes,x=>x.timerSeconds),[120,240,360]);
 assert.equal(F.applyModifier({timerSeconds:0},outcomes[1]).timerSeconds,240);
 assert.ok(F.modifierOutcomes({type:'number',min:0,max:999,step:1}).length<=24);
 let cfg=M.loadConfig();cfg.forfeits[0].modifierWheel={enabled:true,type:'minutes',min:2,max:6,step:2};M.saveConfig(cfg);
 assert.equal(M.loadConfig().forfeits[0].modifierWheel.type,'minutes');
});

test('deck quantities are bounded and shuffled wheel order is stable across redraws',()=>{
 const {F,M}=setup();
 assert.equal(F.normalizeDeck({devilFive:0}).devilFive,0);assert.equal(F.normalizeDeck({rarest:99}).rarest,30);
 const source=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];const order=F.shuffle(source.map(x=>x.id),()=>0);
 assert.deepEqual(Array.from(order),['b','c','d','a']);
 assert.deepEqual(Array.from(F.wheelOrder(source,{wheelOrder:order}),x=>x.id),Array.from(order));
 assert.deepEqual(Array.from(F.wheelOrder(source.filter(x=>x.id!=='c'),{wheelOrder:order}),x=>x.id),['b','d','a']);
 let config=M.loadConfig();config.settings.fateDeck={...F.deckDefaults,devilFive:0,rarest:4};M.saveConfig(config);
 assert.equal(M.loadConfig().settings.fateDeck.rarest,4);assert.equal(M.loadConfig().settings.fateDeck.devilFive,0);
 const session=M.createSession(config);assert.equal(new Set(session.wheelOrder).size,config.forfeits.length);
 const next=M.createSession(config);assert.notEqual(next.sessionId,session.sessionId);
});
