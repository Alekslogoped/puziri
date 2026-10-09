(() => {
  'use strict';
  const $ = id => document.getElementById(id), config = window.GAME_CONFIG;
  const rulesText = 'Найди слова, которые можно назвать одним общим словом. Перетащи слово на другой пузырь или нажми на два пузыря по очереди. Добавляй подходящие слова, пока не соберёшь группу. Назови её! Пузырь с названием поднимется вверх. Собери все группы!';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function validate(c) {
    if (!c || !Array.isArray(c.groups) || c.groups.length < 2 || c.groups.length > 8) throw Error('Нужно задать от 2 до 8 групп.');
    const gids = new Set(), wids = new Set();
    const label = (text, max) => typeof text === 'string' && text.trim() && [...text].length <= max;
    for (const g of c.groups) {
      if (!g.id || gids.has(g.id) || !label(g.title, 18)) throw Error('Проверьте идентификаторы и названия групп (до 18 символов).');
      gids.add(g.id);
      if (!Array.isArray(g.words) || g.words.length < 2 || g.words.length > 4) throw Error('В каждой группе должно быть 2–4 слова.');
      for (const w of g.words) {
        if (!w.id || wids.has(w.id) || !label(w.text,14)) throw Error('Слова: уникальный id и непустая подпись до 14 символов.');
        wids.add(w.id);
      }
    }
    if (!label(c.title,80) || !['word','image-word'].includes(c.mode)) throw Error('Проверьте название игры и mode: word или image-word.');
    if (!Number.isInteger(c.maxActiveBubbles) || c.maxActiveBubbles < 4 || c.maxActiveBubbles > 16) throw Error('maxActiveBubbles должен быть целым числом от 4 до 16.');
    if (c.moveLimit !== null && (!Number.isInteger(c.moveLimit) || c.moveLimit <= 0)) throw Error('moveLimit: null или положительное целое число.');
    if (!Number.isInteger(c.bonusEvery) || c.bonusEvery < 1) throw Error('bonusEvery должен быть положительным целым числом.');
    if (c.scene?.width !== 1600 || c.scene?.height !== 900) throw Error('Базовая сцена должна быть 1600 × 900.');
  }
  try { validate(config); } catch (error) {
    $('modal-title').textContent = 'Ошибка конфигурации';
    $('modal-body').textContent = error.message; $('modal').showModal(); return;
  }
  const groupMap = new Map(config.groups.map(g => [g.id,g]));
  const wordMap = new Map(config.groups.flatMap(g => g.words.map(w => [w.id,w])));
  let state, history = [], selected = null, gesture = null, sound = config.soundDefault, audio;
  let compact = false, width = 1472, height = 652, seq = 0, last = 0, accumulator = 0, hintIds = [], hintUntil = 0;
  let timers = new Set(), generation = 0, returnFocus = null, modalKind = '', started = false;
  const elements = new Map(), departures = new Map();
  const copy = value => JSON.parse(JSON.stringify(value));
  const shuffle = a => { for (let i=a.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
  function later(fn, ms) { const token=generation; const id=setTimeout(() => { timers.delete(id); if(token===generation) fn(); },ms); timers.add(id); }
  function clearEffects() { generation++; timers.forEach(clearTimeout); timers.clear(); departures.forEach(el=>el.remove()); departures.clear(); cancelGesture(); hintIds=[]; $('bubbles').querySelectorAll('.merge-ring').forEach(el=>el.remove()); }
  function radius(n) { return compact ? [0,52,62,70,78][n] : [0,66,80,94,108][n]; }
  function bubble(g,w) { return {id:`b${++seq}`, groupId:g,wordIds:w,x:0,y:0,vx:0,vy:0,r:radius(w.length),locked:false}; }
  function announce(text) { $('message').textContent=text; }
  function beep(kind) {
    if(!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ||= new Audio(); audio.resume().catch(()=>{});
      const osc=audio.createOscillator(), gain=audio.createGain(); osc.connect(gain);gain.connect(audio.destination);
      const t=audio.currentTime;osc.frequency.setValueAtTime({select:520,success:700,error:240,win:900}[kind],t);
      osc.frequency.exponentialRampToValueAtTime(kind==='error'?180:1000,t+.12);
      gain.gain.setValueAtTime(.035,t); gain.gain.exponentialRampToValueAtTime(.001,t+.17);osc.start(t);osc.stop(t+.18);
    } catch (_) { /* Аудио необязательно. */ }
  }
  function invariant() {
    const ids=[...state.live.flatMap(b=>b.wordIds),...state.reserve.flatMap(id=>groupMap.get(id).words.map(w=>w.id)),...state.completedWords];
    if(ids.length!==wordMap.size || new Set(ids).size!==wordMap.size || ids.some(id=>!wordMap.has(id))) throw Error('Нарушен состав слов.');
  }
  function fillReserve(initial=false) {
    const incoming=[];
    while(state.reserve.length) {
      const g=groupMap.get(state.reserve[0]);
      if(state.live.length+incoming.length+g.words.length>config.maxActiveBubbles) break;
      state.reserve.shift(); incoming.push(...g.words.map(w=>bubble(g.id,[w.id])));
    }
    shuffle(incoming);
    incoming.forEach((b,i)=>{
      if(compact){ b.x=width*(i%2? .75:.25); b.y=initial? 100+Math.floor(i/2)*155:70+Math.floor(i/2)*155; }
      else { b.x=92+(i%8)*180; b.y=initial?height-78-Math.floor(i/8)*145:80+Math.floor(i/8)*145; }
    });
    state.live.push(...incoming); updateFieldHeight(); settle(60); render(); invariant();
  }
  function updateFieldHeight() {
    height=compact?Math.max(380,100+Math.ceil(Math.max(state?.live.length||0,departures.size)/2)*165):652;
    $('field').style.height=`${height}px`;
  }
  function bounds(b) { b.x=Math.max(b.r+5,Math.min(width-b.r-5,b.x));b.y=Math.max(b.r+5,Math.min(height-b.r-5,b.y)); }
  function physics(dt, force=false) {
    if(!state || document.hidden || (modalKind && !force)) return;
    const live=state.live;
    for(const b of live) {
      if(gesture?.source===b.id) continue;
      if(!compact && (!reduced.matches || force)) { b.vy+=180*dt;b.vx*=Math.exp(-3*dt);b.vy*=Math.exp(-3*dt);b.x+=b.vx*dt;b.y+=b.vy*dt; }
      const bottom=height-b.r-5;if(b.y>bottom){b.y=bottom;b.vy=-Math.abs(b.vy)*.12;}bounds(b);
    }
    for(let k=0;k<8;k++) for(let i=0;i<live.length;i++) for(let j=i+1;j<live.length;j++) {
      const a=live[i],b=live[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy),need=a.r+b.r+8;
      if(dist<need) {
        const nx=dist>0.01?dx/dist:1,ny=dist>0.01?dy/dist:0,shift=(need-dist)*.51;
        const fixedA=gesture?.source===a.id,fixedB=gesture?.source===b.id;
        if(!fixedA){a.x-=nx*shift*(fixedB?2:1);a.y-=ny*shift*(fixedB?2:1);}
        if(!fixedB){b.x+=nx*shift*(fixedA?2:1);b.y+=ny*shift*(fixedA?2:1);}
        a.vx*=.85;a.vy*=.85;b.vx*=.85;b.vy*=.85;bounds(a);bounds(b);
      }
    }
  }
  function settle(n) { for(let i=0;i<n;i++) physics(1/120,true); }
  // Display positions ease toward collision-resolved coordinates. Hit testing uses
  // these same displayed centers so a moving bubble stays under the pointer.
  function position(b,el,dt=0) {
    if(!el)return;
    el.style.width=el.style.height=`${b.r*2}px`;
    const visual=el._visualPosition ||= {x:b.x,y:b.y};
    if(reduced.matches || gesture?.source===b.id){visual.x=b.x;visual.y=b.y;}
    else if(dt>0){const blend=1-Math.exp(-18*dt);visual.x+=(b.x-visual.x)*blend;visual.y+=(b.y-visual.y)*blend;}
    el.style.transform=`translate3d(${visual.x-b.r}px,${visual.y-b.r}px,0)`;
  }
  function mergeGlow(b) {
    if(reduced.matches)return;
    const ring=document.createElement('div');ring.className='merge-ring';
    ring.style.left=`${b.x}px`;ring.style.top=`${b.y}px`;
    $('bubbles').append(ring);later(()=>ring.remove(),650);
  }

  function makeElement(b,category=false) {
    const g=groupMap.get(b.groupId),el=document.createElement(category?'div':'button');el.className='bubble enter';el.style.setProperty('--shine-delay',`${-(seq%7)}s`);el.dataset.bubbleId=b.id;
    if(category){el.classList.add('category');const span=document.createElement('span');span.textContent=g.title;el.append(span);}
    else {
      el.type='button';el.classList.toggle('partial',b.wordIds.length>1);el.classList.toggle('pair',b.wordIds.length===2);
      const words=g.words.filter(w=>b.wordIds.includes(w.id));
      if(config.mode==='image-word' && words.length===1 && words[0].image){const img=document.createElement('img');img.src=words[0].image;img.alt='';img.onerror=()=>img.remove();el.append(img);}
      words.forEach(w=>{const span=document.createElement('span');span.textContent=w.text;el.append(span);});
      if(words.length>1){const count=document.createElement('small');count.textContent=`${words.length}/${g.words.length}`;el.append(count);}
      el.setAttribute('aria-label',`${words.map(w=>w.text).join(', ')}. ${words.length} из ${g.words.length}`);
      el.addEventListener('pointerdown',e=>beginGesture(e,b.id));
      el.addEventListener('pointermove',moveGesture);el.addEventListener('pointerup',endGesture);
      el.addEventListener('pointercancel',cancelGesture);el.addEventListener('lostpointercapture',cancelGesture);
      el.addEventListener('click',e=>{if(e.detail===0) choose(b.id);});
    }
    position(b,el);return el;
  }
  function render() {
    const active=new Set(state.live.map(b=>b.id));
    for(const [id,el] of elements) if(!active.has(id)){el.remove();elements.delete(id);}
    for(const b of state.live){let el=elements.get(b.id);if(!el){el=makeElement(b);elements.set(b.id,el);$('bubbles').append(el);}position(b,el);el.classList.toggle('selected',selected===b.id);el.classList.toggle('hinted',hintIds.includes(b.id));el.disabled=b.locked;}
    $('progress').textContent=`Группы: ${state.completed.length} / ${config.groups.length}`;
    $('undo').disabled=history.length===0;$('hint').disabled=state.status!=='playing' || state.live.some(b=>b.locked);
    $('moves').textContent=state.moves===null?'Без лимита ходов':`Ходы: ${state.moves}`;
    $('sound').textContent=`Звук: ${sound?'вкл.':'выкл.'}`;$('sound').setAttribute('aria-pressed',String(sound));
  }
  function canMerge(a,b) {
    if(!a||!b||a.id===b.id||a.groupId!==b.groupId||a.locked||b.locked)return false;
    const ids=[...a.wordIds,...b.wordIds],g=groupMap.get(a.groupId);
    return new Set(ids).size===ids.length && ids.every(id=>g.words.some(w=>w.id===id));
  }
  function checkEnd() {
    if(departures.size || state.live.some(b=>b.locked)) return;
    if(state.completed.length===config.groups.length && !state.live.length && !state.reserve.length){state.status='won';beep('win');showModal('won');}
    else if(state.moves!==null && state.moves<=0){state.status='lost';showModal('lost');}
    render();
  }
  function merge(source,target) {
    if(state.status!=='playing' || (state.moves!==null && state.moves<=0))return;
    const a=state.live.find(b=>b.id===source),b=state.live.find(b=>b.id===target);
    if(!a||!b||a.id===b.id||a.locked||b.locked)return;
    const valid=canMerge(a,b);if(valid || state.moves!==null)history.push({...copy(state), layout:{compact,width,height}});
    selected=null;hintIds=[];
    if(state.moves!==null)state.moves--;
    if(!valid){
      [a,b].forEach(x=>{x.locked=true;elements.get(x.id)?.classList.add('error');});beep('error');announce('Попробуй другую пару');render();
      later(()=>{[a,b].forEach(x=>{x.locked=false;elements.get(x.id)?.classList.remove('error');});render();checkEnd();},400);return;
    }
    state.successes++;
    if(state.moves!==null && state.successes%config.bonusEvery===0){state.moves++;announce('Верно! Бонус: +1 ход');}else announce('Отлично! Слова нашли свою компанию');
    const g=groupMap.get(a.groupId),ids=g.words.filter(w=>a.wordIds.includes(w.id)||b.wordIds.includes(w.id)).map(w=>w.id);
    const next=bubble(g.id,ids);next.x=b.x;next.y=b.y;bounds(next);
    state.live=state.live.filter(x=>x.id!==a.id&&x.id!==b.id);beep('success');mergeGlow(next);
    if(ids.length===g.words.length){
      state.completed.push(g.id);state.completedWords.push(...ids);
      next.r=compact?78:108;bounds(next);state.flights.push(copy(next));launchDeparture(next);
      render();$('progress').focus({preventScroll:true});
    }else{
      next.locked=true;state.live.push(next);if(compact||reduced.matches)settle(30);render();
      later(()=>{next.locked=false;render();elements.get(next.id)?.focus({preventScroll:true});checkEnd();},reduced.matches?60:400);
    }
    invariant();render();
  }
  function launchDeparture(b) {
    const el=makeElement(b,true);el.classList.add('leaving');if(reduced.matches)el.classList.add('still');
    departures.set(b.id,el);$('bubbles').append(el);
    later(()=>{el.remove();departures.delete(b.id);state.flights=state.flights.filter(x=>x.id!==b.id);fillReserve();checkEnd();},reduced.matches?400:1950);
  }
  function choose(id) {
    if(state.status!=='playing' || modalKind)return;
    const b=state.live.find(b=>b.id===id);if(!b||b.locked)return;
    if(selected===id)selected=null;else if(selected){merge(selected,id);return;}else {selected=id;beep('select');}
    render();
  }
  function coords(e) {const rect=$('field').getBoundingClientRect();return {x:(e.clientX-rect.left)*width/rect.width,y:(e.clientY-rect.top)*height/rect.height};}
  function hit(p,except) {
    const distance=b=>{const v=elements.get(b.id)?._visualPosition||b;return Math.hypot(p.x-v.x,p.y-v.y);};
    return state.live.filter(b=>b.id!==except&&!b.locked&&distance(b)<=b.r).sort((a,b)=>distance(a)-distance(b))[0];
  }
  function beginGesture(e,id) {
    if(e.button!==0 || gesture || modalKind || state.status!=='playing')return;
    const b=state.live.find(b=>b.id===id);if(!b||b.locked)return;
    const visual=elements.get(id)?._visualPosition;if(visual){b.x=visual.x;b.y=visual.y;b.vx=0;b.vy=0;}
    gesture={source:id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,drag:false,el:e.currentTarget};
    e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  }
  function moveGesture(e) {
    if(!gesture||gesture.pointer!==e.pointerId)return;
    if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>6)gesture.drag=true;
    if(!gesture.drag)return;
    const b=state.live.find(b=>b.id===gesture.source);if(!b){cancelGesture();return;}
    elements.get(b.id)?.classList.add('source');const p=coords(e),ghost=$('ghost');ghost.hidden=false;
    ghost.textContent=groupMap.get(b.groupId).words.filter(w=>b.wordIds.includes(w.id)).map(w=>w.text).join('\n');ghost.style.left=`${p.x}px`;ghost.style.top=`${p.y}px`;
    const target=hit(p,b.id);elements.forEach((el,id)=>el.classList.toggle('target',id===target?.id));
  }
  function endGesture(e) {
    if(!gesture||gesture.pointer!==e.pointerId)return;
    const {source,drag}=gesture,target=drag?hit(coords(e),source):null;cancelGesture();
    if(drag){selected=null;if(target)merge(source,target.id);else {announce('Выбери два подходящих пузыря');render();}}else choose(source);
  }
  function cancelGesture() {
    const old=gesture;gesture=null;$('ghost').hidden=true;elements.forEach(el=>el.classList.remove('source','target'));
    if(old?.el.hasPointerCapture(old.pointer))old.el.releasePointerCapture(old.pointer);
  }
  function hint() {
    if(state.status!=='playing'||state.live.some(b=>b.locked))return;
    let a=state.live.find(b=>b.id===selected),b=a&&state.live.find(b=>canMerge(a,b));
    if(!b)for(const g of config.groups){const pair=state.live.filter(x=>x.groupId===g.id);if(pair.length>1){[a,b]=pair;break;}}
    hintIds=b?[a.id,b.id]:[];hintUntil=performance.now()+2000;announce(b?'Эти два пузыря можно объединить':'Дождись появления новых слов');render();
  }
  function undo() {
    if(!history.length)return;clearEffects();state=history.pop();state.live.forEach(b=>b.locked=false);state.status='playing';selected=null;closeModal();updateFieldHeight();
    const layout=state.layout;
    state.live.forEach((b,i)=>{b.r=radius(b.wordIds.length);if(layout && layout.compact!==compact){b.x=compact?width*(i%2?.75:.25):92+(i%8)*180;b.y=compact?100+Math.floor(i/2)*165:height-78-Math.floor(i/8)*160;}else if(compact && layout)b.x=b.x*width/layout.width;bounds(b);});
    state.flights.forEach(b=>{b.r=compact?78:108;bounds(b);launchDeparture(b);});render();invariant();announce('Последний ход отменён');
  }
  function restart() {
    clearEffects();history=[];selected=null;state={status:'playing',live:[],reserve:config.groups.map(g=>g.id),completed:[],completedWords:[],flights:[],moves:config.moveLimit,successes:0};
    closeModal();fillReserve(true);announce('Выбери два подходящих пузыря');render();
  }
  function collectedList(all=false) {
    const ul=document.createElement('ul');const groups=all?config.groups:config.groups.filter(g=>state.completed.includes(g.id));
    if(!groups.length){const p=document.createElement('p');p.textContent='Здесь появятся собранные группы.';return p;}
    for(const g of groups){const li=document.createElement('li'),strong=document.createElement('strong');strong.textContent=g.title;li.append(strong,document.createTextNode(g.words.map(w=>w.text).join(' · ')));ul.append(li);}return ul;
  }
  function showModal(kind) {
    cancelGesture();returnFocus=document.activeElement;modalKind=kind;
    const titles={rules:'Как играть',won:'Все группы собраны!',lost:'Ходы закончились',collected:'Собрано'};
    $('modal-title').textContent=titles[kind];$('modal-body').replaceChildren();$('modal-actions').replaceChildren();
    if(kind==='rules'){const p=document.createElement('p');p.textContent=rulesText;$('modal-body').append(p);}
    if(kind==='won'||kind==='collected')$('modal-body').append(collectedList(kind==='won'));
    const action=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;$('modal-actions').append(b);};
    if(kind==='rules')action(started?'Продолжить':'Играть',()=>{started=true;closeModal();});
    if(kind==='collected')action('Продолжить',closeModal);
    if(kind==='won'){action('Играть ещё',restart);action('Отменить',undo);}
    if(kind==='lost'){action('Отменить',undo);action('Заново',restart);}
    if(!$('modal').open)$('modal').showModal();$('modal-actions').firstElementChild?.focus();
  }
  function closeModal() {if($('modal').open)$('modal').close();modalKind='';returnFocus?.focus?.({preventScroll:true});last=0;accumulator=0;}
  function resize() {
    cancelGesture();const v=$('viewport'),rect=v.getBoundingClientRect();const was=compact;compact=rect.width<900&&rect.width/rect.height<1.2;
    $('scene').classList.toggle('compact',compact);v.classList.toggle('portrait',compact);
    if(compact){width=rect.width-28;$('scene').style.transform='none';}
    else{width=1472;const scale=Math.min(rect.width/1600,rect.height/900);$('scene').style.transform=`scale(${scale})`;$('scene').style.left=`${(rect.width-1600*scale)/2}px`;$('scene').style.top=`${(rect.height-900*scale)/2}px`;}
    if(!state)return;
    updateFieldHeight();state.live.forEach((b,i)=>{b.r=radius(b.wordIds.length);if(was!==compact){b.x=compact?width*(i%2?.75:.25):92+(i%8)*180;b.y=compact?100+Math.floor(i/2)*165:height-78-Math.floor(i/8)*160;}else if(compact)b.x=Math.min(width-b.r-5,b.x);bounds(b);});settle(80);elements.forEach(el=>delete el._visualPosition);render();
  }
  $('undo').onclick=undo;$('hint').onclick=hint;$('restart').onclick=restart;
  $('rules').onclick=()=>showModal('rules');$('progress').onclick=()=>showModal('collected');
  $('sound').onclick=()=>{sound=!sound;beep('select');render();};
  $('fullscreen').onclick=async()=>{try{if(!document.fullscreenEnabled)throw Error();if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch(_){announce('Полный экран недоступен в этом окне');}};
  $('modal').addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const buttons=[...$('modal').querySelectorAll('button:not(:disabled)')];
    if(!buttons.length){e.preventDefault();return;}
    const first=buttons[0],end=buttons[buttons.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();end.focus();}
    else if(!e.shiftKey && document.activeElement===end){e.preventDefault();first.focus();}
  });
  $('modal').addEventListener('cancel',e=>{e.preventDefault();if(started&&['rules','collected'].includes(modalKind))closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelGesture();selected=null;render();}});
  $('field').addEventListener('pointerdown',e=>{if(!e.target.closest('.bubble')){selected=null;render();}});
  document.addEventListener('visibilitychange',()=>{cancelGesture();last=0;accumulator=0;});window.addEventListener('blur',cancelGesture);
  $('title').textContent=config.title;document.title=config.title;
  resize();restart();showModal('rules');new ResizeObserver(resize).observe($('viewport'));
  function frame(t){
    const dt=Math.min(last?(t-last)/1000:0,.033);last=t;
    if(!document.hidden){
      if(!compact&&!reduced.matches&&!modalKind){
        accumulator+=dt;const step=1/120;
        while(accumulator>=step){physics(step);accumulator-=step;}
      }else accumulator=0;
      for(const b of state.live)position(b,elements.get(b.id),dt);
      if(hintIds.length&&t>hintUntil){hintIds=[];render();}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
