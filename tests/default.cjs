const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/tmp/bubbles-qa/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');await page.getByRole('button',{name:'Играть',exact:true}).click();await page.waitForTimeout(3500);
 assert.equal(await page.locator('button.bubble').count(),20);assert.equal(await page.locator('#progress').innerText(),'Группы: 0 / 5');
 const circles=await page.locator('button.bubble').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};}));
 for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)assert(Math.hypot(circles[i].x-circles[j].x,circles[i].y-circles[j].y)>=circles[i].r+circles[j].r-1);
 await page.emulateMedia({reducedMotion:'reduce'});const groups=await page.evaluate(()=>window.GAME_CONFIG.groups);
 for(const group of groups){for(const word of group.words.slice(1)){const find=t=>page.locator('button.bubble').filter({has:page.locator('span',{hasText:new RegExp('^'+t+'$')})});await find(group.words[0].text).press('Enter');await find(word.text).press('Enter');await page.waitForTimeout(100);}await page.waitForTimeout(420);}
 assert.equal(await page.locator('#win-title').innerText(),'Все группы собраны!');assert.equal(await page.locator('#win-scene').isVisible(),true);await page.getByRole('button',{name:'Играть ещё',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await page.locator('button.bubble').count(),20);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: default five groups, 20 words, no overlap, full win, restart and mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
