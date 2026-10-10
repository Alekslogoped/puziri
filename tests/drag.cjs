const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/tmp/bubbles-qa/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});require('./fixture.cjs').useOriginalDictionary(browser);const base=process.env.GAME_URL||'http://127.0.0.1:8000';const errors=[];
async function start(options={}){const p=await browser.newPage({viewport:{width:1280,height:720},...options});p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('button',{name:'Играть',exact:true}).click();await p.waitForTimeout(600);return p;}
async function checkText(p){const labels=await p.locator('.bubble span').evaluateAll(es=>es.map(e=>{const b=e.closest('.bubble').getBoundingClientRect(),r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);return {text:e.textContent,lines:range.getClientRects().length,inside:r.left>=b.left+8&&r.right<=b.right-8,whiteSpace:getComputedStyle(e).whiteSpace};}));assert(labels.every(l=>l.lines===1&&l.inside&&l.whiteSpace==='nowrap'),JSON.stringify(labels.filter(l=>l.lines!==1||!l.inside)));}
const p=await start({reducedMotion:'reduce'}),word=t=>p.locator('button.bubble').filter({has:p.locator('span',{hasText:new RegExp('^'+t+'$')})});
await word('ЯБЛОКО').click();await word('ГРУША').click();assert.equal(await p.locator('button.bubble').count(),16);assert.equal(await p.locator('.selected').count(),0);
async function drag(a,b){const r=await word(a).boundingBox(),target=await word(b).boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});assert.equal(await p.locator('.dragging').count(),1);await p.mouse.up();await p.waitForTimeout(100);}
await drag('ЯБЛОКО','ГРУША');assert.equal(await p.locator('button.bubble').count(),15);await checkText(p);await drag('БАНАН','ЛИМОН');await drag('ЯБЛОКО','БАНАН');assert.match(await p.locator('#progress').innerText(),/1 \/ 4/);await p.waitForTimeout(450);
await p.locator('#restart').click();await drag('ЯБЛОКО','МОРКОВЬ');assert.equal(await p.locator('button.bubble').count(),16);await p.waitForTimeout(450);
for(const [w,h] of [[1600,900],[1280,720],[960,540],[390,844],[320,700]]){await p.setViewportSize({width:w,height:h});await p.waitForTimeout(100);await checkText(p);assert.equal(await p.locator('button.bubble').count(),16);}
await p.setViewportSize({width:1280,height:720});await p.waitForTimeout(100);await p.screenshot({path:'/tmp/bubbles-whole-words.png'});await p.close();
const throwing=await start();const first=throwing.locator('button.bubble').first();let rect=await first.boundingBox();await throwing.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await throwing.mouse.down();await throwing.mouse.move(630,260,{steps:8});await throwing.mouse.move(630,190);await throwing.mouse.up();const released=await first.boundingBox();await throwing.waitForTimeout(160);const flown=await first.boundingBox();assert(Math.hypot(released.x-flown.x,released.y-flown.y)>3,'No throw inertia');assert.equal(await throwing.locator('button.bubble').count(),16);await throwing.close();
const touch=await start({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
const source=touch.locator('button.bubble').first();await source.scrollIntoViewIfNeeded();const s=await source.boundingBox();
const cdp=await touch.context().newCDPSession(touch);
const point=(x,y)=>[{x,y,id:7,radiusX:2,radiusY:2,force:1}];
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(s.x+s.width/2,s.y+s.height/2)});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(s.x+s.width/2,s.y+s.height/2-45)});
assert.equal(await touch.locator('.dragging').count(),1);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.equal(await touch.locator('.dragging').count(),0);assert.equal(await touch.locator('button.bubble').count(),16);await touch.close();
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: no mouse-click selection, whole-bubble drag, 2+2 drag, wrong pair, single-line text at five sizes, throw inertia, touch pointer drag.');
})().catch(e=>{console.error(e);process.exit(1)});
