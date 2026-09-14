(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  function select(candidates, count, { randomGroup = false, lowest = false, random = Math.random } = {}) {
    let pool = [...candidates], groupId = '';
    if (randomGroup && pool.length) {
      const groups = [...new Set(pool.map(item => item.levelId))];
      groupId = groups[Math.floor(random() * groups.length)];
      pool = pool.filter(item => item.levelId === groupId);
    }
    const items = [];
    while (pool.length && items.length < count) {
      let picked;
      if (lowest) {
        const min = Math.min(...pool.map(item => item.effectiveWeight));
        const rare = pool.filter(item => Math.abs(item.effectiveWeight - min) < 1e-9);
        picked = rare[Math.floor(random() * rare.length)];
      } else {
        picked = window.FortuneFeatures.choose(pool.map(item => ({...item,weight:item.effectiveWeight})),random);
      }
      items.push(copy(picked));
      pool = pool.filter(item => item.id !== picked.id);
    }
    return { items, groupId };
  }
  function create({ items, title, groupId = '', requested, original, envelopes = false, hint = 'none', autoplay = false }) {
    const entries = items.map((item,index) => ({ key:'slot-' + index,item:copy(item),status:'sealed',modifierResolved:false }));
    if (original) entries.unshift({key:'original',item:copy(original.item),modifier:original.modifier || null,modifierResolved:true,status:'revealed'});
    return {version:1,title,groupId,requested:requested + (original ? 1 : 0),entries,
      envelopes,hint,chosen:null,paused:false,autoplay,view:0};
  }
  function next(batch) { return batch.entries.find(entry => !['accepted','declined','discarded','unavailable'].includes(entry.status)); }
  function chooseEnvelope(batch, index) {
    if (!batch.envelopes || batch.chosen !== null || !batch.entries[index]) return false;
    batch.chosen=index; batch.view=index;
    batch.entries.forEach((entry,i) => { if(i !== index) entry.status='discarded'; });
    return true;
  }
  function remaining(timer, now = Date.now()) {
    return timer.deadline ? Math.max(0,Math.ceil((timer.deadline-now)/1000)) : Math.max(0,timer.remaining);
  }
  window.FortuneRevealState = {select,create,next,chooseEnvelope,remaining};
})();
