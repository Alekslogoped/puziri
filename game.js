(() => {
  'use strict';
  const $ = id => document.getElementById(id), config = window.GAME_CONFIG;
  const rulesText = 'Найди слова, которые можно назвать одним общим словом. Возьми пузырь и перетащи его на другой пузырь. Можно двигать и подбрасывать пузыри. Добавляй подходящие слова, пока не соберёшь группу. Назови её! Пузырь с названием поднимется вверх. Собери все группы!';
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
    if (!Number.isInteger(c.maxActiveBubbles) || c.maxActiveBubbles < 4 || c.maxActiveBubbles > 20) throw Error('maxActiveBubbles должен быть целым числом от 4 до 20.');
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
  // Decorative fish are independent of words, physics and move history.
  const fish=[];
  function createFish() {
    const palette=['#ffbd72','#83e6e2','#ffc0d8','#c2b1ff','#ffe798','#79d5ff'];
    palette.forEach((color,i)=>{
      const el=document.createElement('div');el.className='fish';
      el.style.setProperty('--fish-color',color);el.style.setProperty('--fin-duration',`${.65+i*.09}s`);
      el.style.setProperty('--fin-delay',`${-i*.21}s`);el.style.width=`${54+i%3*10}px`;
      el.innerHTML=`<div class="fish-facing"><svg viewBox="0 0 120 64" focusable="false" aria-hidden="true">
        <g class="fish-body">
          <path class="fish-dorsal" d="M42 23 Q51 4 73 13 L80 23Z"/>
          <g class="fish-rear"><path class="fish-tail" d="M34 32 Q17 17 5 13 Q9 31 5 51 Q20 47 34 32Z"/>
          <path class="fish-shape" d="M28 32 Q44 12 67 15 Q97 15 108 32 Q97 51 68 50 Q42 50 28 32Z"/></g>
          <path class="fish-belly" d="M35 36 Q68 52 102 35 Q87 48 66 47 Q44 47 35 36Z"/>
          <path class="fish-glint" d="M46 24 Q66 14 87 24"/>
          <path class="fish-fin" d="M67 33 Q50 35 57 47 Q68 43 73 34Z"/>
          <path class="fish-gill" d="M85 27 Q81 32 85 38"/>
          <circle cx="94" cy="27" r="4" fill="#123a5c"/><circle cx="95" cy="25.8" r="1.5" fill="white"/>
          <path d="M103 35 Q106 37 109 34" fill="none" stroke="#123a5c" stroke-width="1.4" stroke-linecap="round"/>
        </g></svg></div>`;
      $('fish-layer').append(el);
      fish.push({el,face:el.firstElementChild,phase:i*1.13,time:0,period:38+i*5,lane:.18+i*.055});
    });
    updateFish(0);
  }
  function updateFish(dt) {
    fish.forEach(f=>{
      if(!reduced.matches&&!modalKind)f.time+=dt;
      const phase=f.phase+f.time*Math.PI*2/f.period;
      const x=36+(width-100)*(.5+.5*Math.sin(phase));
      const y=height*f.lane+Math.sin(phase*1.8+f.phase)*12;
      f.el.style.transform=`translate3d(${x}px,${y}px,0)`;
      f.face.style.transform=`scaleX(${Math.cos(phase)>=0?1:-1})`;
    });
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const shuffle = a => { for (let i=a.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
  function later(fn, ms) { const token=generation; const id=setTimeout(() => { timers.delete(id); if(token===generation) fn(); },ms); timers.add(id); }
  function clearEffects() { generation++; timers.forEach(clearTimeout); timers.clear(); departures.forEach(el=>el.remove()); departures.clear(); cancelGesture(); hintIds=[]; $('bubbles').querySelectorAll('.merge-ring').forEach(el=>el.remove());$('win-scene').hidden=true;$('win-scene').classList.remove('celebrating','finished');$('mermaid-swimmer').replaceChildren(); }
  const measureContext=document.createElement('canvas').getContext('2d');
  function textWidth(text,size) { measureContext.font=`700 ${size}px Arial`;return measureContext.measureText(text).width; }
  function labels(b,category=false) {
    const g=groupMap.get(b.groupId);
    return category?[g.title]:g.words.filter(w=>b.wordIds.includes(w.id)).map(w=>w.text);
  }
  function radius(n,words=[],category=false) {
    const font=compact?(category?20:18):(n>1&&!category?24:28);
    const longest=Math.max(0,...words.map(text=>textWidth(text,font)));
    const base=compact?[0,68,76,82,90][category?4:n]:[0,90,104,116,126][category?4:n];
    // A horizontal safety margin also keeps the outer partial rows inside the circle.
    const required=(longest+36)/(n>1&&!category?1.7:2);
    return Math.min(compact?Math.max(52,(width-24)/2):(n===1&&!category?100:132),Math.ceil(Math.max(base,required)));
  }
  function sizeBubble(b,category=false) {b.r=radius(b.wordIds.length,labels(b,category),category);}
  function gridMetrics() {
    const maxR=Math.max(0,...config.groups.map(g=>radius(3,g.words.map(w=>w.text))));
    const columns=compact?(width>=maxR*4+24?2:1):7;
    return {columns,step:compact?maxR*2+18:208};
  }
  function placeBubble(b,i,falling=false,total=state.live.length) {
    const {columns,step}=gridMetrics();
    const rowStart=Math.floor(i/columns)*columns;
    const rowCount=Math.min(columns,total-rowStart);
    const offset=(columns-rowCount)/2;
    b.x=width*(offset+i%columns+.5)/columns;
    b.y=compact?100+Math.floor(i/columns)*step:falling?b.r+12+Math.floor(i/columns)*step:height-110-Math.floor(i/columns)*step;
  }
  function bubble(g,w) { return {id:`b${++seq}`, groupId:g,wordIds:w,x:0,y:0,vx:0,vy:0,r:radius(w.length,groupMap.get(g).words.filter(word=>w.includes(word.id)).map(word=>word.text)),locked:false}; }
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
    state.live.push(...incoming);updateFieldHeight();
    incoming.forEach((b,i)=>placeBubble(b,i,!initial,incoming.length));
    settle(80);render();invariant();
  }
  function updateFieldHeight() {
    const {columns,step}=gridMetrics();
    height=compact?Math.max(380,110+Math.ceil(Math.max(state?.live.length||0,departures.size)/columns)*step):652;
    $('field').style.height=`${height}px`;
  }
  function bounds(b) { b.x=Math.max(b.r+5,Math.min(width-b.r-5,b.x));b.y=Math.max(b.r+5,Math.min(height-b.r-5,b.y)); }
  function physics(dt, force=false) {
    if(!state || document.hidden || (modalKind && !force)) return;
    const live=state.live;
    for(const b of live) {
      if(gesture?.source===b.id) continue;
      if(!reduced.matches || force){if(!compact)b.vy+=180*dt;b.vx*=Math.exp(-2.4*dt);b.vy*=Math.exp(-2.4*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;}
      if(b.x<b.r+5||b.x>width-b.r-5)b.vx=-b.vx*.3;
      if(b.y<b.r+5)b.vy=Math.abs(b.vy)*.3;
      const bottom=height-b.r-5;if(b.y>bottom){b.y=bottom;b.vy=-Math.abs(b.vy)*.22;}bounds(b);
    }
    for(let k=0;k<8;k++) for(let i=0;i<live.length;i++) for(let j=i+1;j<live.length;j++) {
      if(gesture?.drag&&(live[i].id===gesture.source||live[j].id===gesture.source))continue;
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
    const key=`${b.r}:${compact}:${el.classList.contains('category')}`;
    if(el._sizeKey!==key){
      el._sizeKey=key;el.style.width=el.style.height=`${b.r*2}px`;
      const words=labels(b,el.classList.contains('category')),longest=Math.max(...words.map(t=>textWidth(t,1)));
      const desired=compact?(el.classList.contains('category')?20:18):(b.wordIds.length>1&&!el.classList.contains('category')?24:28);
      const available=b.r*2*(b.wordIds.length>1&&!el.classList.contains('category')?.82:.88)-22;
      el.style.fontSize=`${Math.min(desired,Math.floor(available/longest))}px`;
    }
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
    if(state.completed.length===config.groups.length && !state.live.length && !state.reserve.length){state.status='won';beep('win');showVictory();}
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
      sizeBubble(next,true);bounds(next);state.flights.push(copy(next));launchDeparture(next);
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
    if(e.button!==0||gesture||modalKind||state.status!=='playing')return;
    const b=state.live.find(b=>b.id===id);if(!b||b.locked)return;
    const visual=elements.get(id)?._visualPosition;if(visual){b.x=visual.x;b.y=visual.y;}
    const p=coords(e);selected=null;b.vx=b.vy=0;
    gesture={source:id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,drag:false,el:e.currentTarget,
      originX:b.x,originY:b.y,offsetX:p.x-b.x,offsetY:p.y-b.y,lastX:b.x,lastY:b.y,lastTime:e.timeStamp,vx:0,vy:0};
    e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();render();
  }
  function dragTarget(b) {
    const distance=other=>{const p=elements.get(other.id)?._visualPosition||other;return Math.hypot(b.x-p.x,b.y-p.y);};
    return state.live.filter(other=>other.id!==b.id&&!other.locked&&distance(other)<other.r+b.r*.45).sort((a,c)=>distance(a)-distance(c))[0];
  }
  function moveGesture(e) {
    if(!gesture||gesture.pointer!==e.pointerId)return;
    if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>6)gesture.drag=true;
    if(!gesture.drag)return;
    const b=state.live.find(b=>b.id===gesture.source);if(!b){cancelGesture();return;}
    const p=coords(e);b.x=p.x-gesture.offsetX;b.y=p.y-gesture.offsetY;bounds(b);
    const dt=Math.max(.008,(e.timeStamp-gesture.lastTime)/1000);
    gesture.vx=Math.max(-1200,Math.min(1200,(b.x-gesture.lastX)/dt));
    gesture.vy=Math.max(-1200,Math.min(1200,(b.y-gesture.lastY)/dt));
    gesture.lastX=b.x;gesture.lastY=b.y;gesture.lastTime=e.timeStamp;
    const el=elements.get(b.id);el?.classList.add('dragging');position(b,el);
    const target=dragTarget(b);elements.forEach((element,id)=>element.classList.toggle('target',id===target?.id));
    e.preventDefault();
  }
  function endGesture(e) {
    if(!gesture||gesture.pointer!==e.pointerId)return;
    const g=gesture,b=state.live.find(b=>b.id===g.source),target=g.drag&&b?dragTarget(b):null;
    cancelGesture(false);
    if(!b)return;
    if(target){merge(b.id,target.id);}
    else if(g.drag){const fresh=e.timeStamp-g.lastTime<100;b.vx=!reduced.matches&&fresh?g.vx:0;b.vy=!reduced.matches&&fresh?g.vy:0;announce('Перетащи подходящий пузырь на другой');}
    // Pointer taps do not select or combine; keyboard activation remains accessible.
    render();
  }
  function cancelGesture(restore=true) {
    const old=gesture;gesture=null;$('ghost').hidden=true;elements.forEach(el=>el.classList.remove('source','target','dragging'));
    if(old){const b=state?.live.find(b=>b.id===old.source);if(b&&restore!==false){b.x=old.originX;b.y=old.originY;b.vx=b.vy=0;position(b,elements.get(b.id));}}
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
    state.live.forEach((b,i)=>{sizeBubble(b);if(layout && layout.compact!==compact){placeBubble(b,i);}else if(compact && layout)b.x=b.x*width/layout.width;bounds(b);});
    state.flights.forEach(b=>{sizeBubble(b,true);bounds(b);launchDeparture(b);});render();invariant();announce('Последний ход отменён');
  }
  function restart() {
    clearEffects();history=[];selected=null;state={status:'playing',live:[],reserve:config.groups.map(g=>g.id),completed:[],completedWords:[],flights:[],moves:config.moveLimit,successes:0};
    closeModal();fillReserve(true);announce('Перетащи подходящий пузырь на другой');render();
  }
  function showVictory() {
    cancelGesture();closeModal();
    const scene=$('win-scene');scene.hidden=false;scene.classList.remove('finished');
    $('mermaid-swimmer').innerHTML=window.MERMAID_SVG;
    // Start from a fresh DOM node so replaying after undo restarts all animations.
    scene.classList.add('celebrating');announce('Все группы собраны! Русалочка поздравляет тебя!');
    $('win-title').focus({preventScroll:true});
    later(()=>{scene.classList.add('finished');$('play-again').focus({preventScroll:true});},reduced.matches?100:8000);
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
    if(kind==='collected')$('modal-body').append(collectedList());
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
    state.live.forEach(b=>sizeBubble(b));updateFieldHeight();state.live.forEach((b,i)=>{if(was!==compact||compact)placeBubble(b,i);bounds(b);});settle(80);elements.forEach(el=>delete el._visualPosition);render();
  }
  $('play-again').onclick=restart;$('win-undo').onclick=undo;
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
  resize();restart();createFish();showModal('rules');new ResizeObserver(resize).observe($('viewport'));
  function frame(t){
    const dt=Math.min(last?(t-last)/1000:0,.033);last=t;
    if(!document.hidden){
      if(!reduced.matches&&!modalKind){
        accumulator+=dt;const step=1/120;
        while(accumulator>=step){physics(step);accumulator-=step;}
      }else accumulator=0;
      updateFish(dt);$('fish-layer').classList.toggle('paused',Boolean(modalKind));
      for(const b of state.live)position(b,elements.get(b.id),dt);
      if(hintIds.length&&t>hintUntil){hintIds=[];render();}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
