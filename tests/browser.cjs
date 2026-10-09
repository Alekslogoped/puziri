// QA only: npm install --prefix /tmp/bubbles-qa --cache /tmp/npm-cache playwright
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/bubbles-qa/node_modules/playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.GAME_URL || 'http://127.0.0.1:8000';
 const start=async(config)=>{await page.goto(base);if(config){await page.evaluate(config=>{window.GAME_CONFIG=config},config);await page.addScriptTag({url:base+'/game.js'});}await page.getByRole('button',{name:'Играть',exact:true}).click();};
 const word=text=>page.locator('button.bubble').filter({has:page.locator('span',{hasText:new RegExp('^'+text+'$')})});
 const pair=async(a,b)=>{await word(a).press('Enter');await word(b).press('Enter');await page.waitForTimeout(100);};
 await start();assert.equal(await page.locator('button.bubble').count(),16);
 await pair('ЯБЛОКО','МОРКОВЬ');assert.equal(await page.locator('button.bubble').count(),16);await page.waitForTimeout(450);
 await pair('ЯБЛОКО','ГРУША');assert.equal(await page.locator('.pair').count(),1);
 await pair('БАНАН','ЛИМОН');await pair('ЯБЛОКО','БАНАН');assert.match(await page.locator('#progress').innerText(),/1 \/ 4/);await page.waitForTimeout(500);
 await page.locator('#undo').click();assert.equal(await page.locator('.pair').count(),2);assert.match(await page.locator('#progress').innerText(),/0 \/ 4/);
 await pair('ЯБЛОКО','БАНАН');await page.waitForTimeout(500);
 await pair('МОРКОВЬ','ОГУРЕЦ');await pair('МОРКОВЬ','ПОМИДОР');assert.match(await word('МОРКОВЬ').innerText(),/3\/4/);await pair('МОРКОВЬ','КАПУСТА');
 await pair('КОШКА','СОБАКА');await pair('КОШКА','ЛИСА');await pair('КОШКА','ЗАЯЦ');
 await pair('АВТОБУС','ПОЕЗД');await pair('АВТОБУС','САМОЛЁТ');await pair('АВТОБУС','КОРАБЛЬ');await page.waitForTimeout(500);
 assert.equal(await page.locator('#modal-title').innerText(),'Все группы собраны!');await page.getByRole('button',{name:'Отменить',exact:true}).last().click();assert.equal(await page.locator('button.bubble').count(),2);
 await page.locator('#restart').click();await page.locator('#hint').click();assert.equal(await page.locator('.hinted').count(),2);
 for(const size of [[1600,900],[1280,720],[960,540],[390,844]]){await page.setViewportSize({width:size[0],height:size[1]});await page.waitForTimeout(100);const geo=await page.locator('button.bubble').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y,text:getComputedStyle(e).fontSize};}));assert.equal(geo.length,16);assert(geo.every(r=>Math.abs(r.w-r.h)<.1));if(size[0]===390)assert(geo.every(r=>r.w>=104&&parseFloat(r.text)>=18));}
 await page.screenshot({path:'/tmp/bubbles-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
 const a=await word('ЯБЛОКО').boundingBox(),b=await word('ГРУША').boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();await page.waitForTimeout(150);assert.equal(await page.locator('button.bubble').count(),15);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.locator('#undo').click();assert.equal(await page.locator('button.bubble').count(),16);const positions=await page.locator('button.bubble').evaluateAll(es=>es.map(e=>e.getBoundingClientRect()));assert(positions.every(r=>r.x>=0&&r.right<=390));await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
 await page.locator('#rules').click();await page.screenshot({path:'/tmp/bubbles-rules.png'});await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.screenshot({path:'/tmp/bubbles-desktop.png'});
 assert.deepEqual(errors,[]);await page.close();
 // Isolated pages with configuration overrides before game.js executes.
 async function scenario(groups,limit=null){const p=await browser.newPage({reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.route('**/config.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`\nwindow.GAME_CONFIG.groups=${JSON.stringify(groups)};window.GAME_CONFIG.moveLimit=${limit};`});});await p.goto(base);await p.getByRole('button',{name:'Играть',exact:true}).click();return p;}
 const groups=Array.from({length:8},(_,i)=>({id:'g'+i,title:'ГРУППА '+i,words:Array.from({length:4},(_,j)=>({id:`w${i}-${j}`,text:`СЛОВО${i}${j}`}))}));
 const p=await scenario(groups);let success=0;
 for(let i=0;i<8;i++){for(let j=1;j<4;j++){const find=t=>p.locator('button.bubble').filter({has:p.locator('span',{hasText:new RegExp('^'+t+'$')})});await find(`СЛОВО${i}0`).press('Enter');await find(`СЛОВО${i}${j}`).press('Enter');await p.waitForTimeout(90);success++;}await p.waitForTimeout(420);if(i===0){await p.locator('#undo').click();assert.equal(await p.locator('button.bubble').count(),14);assert.equal(await p.getByText('СЛОВО40',{exact:true}).count(),0);await p.locator('button.bubble').filter({has:p.getByText('СЛОВО00',{exact:true})}).press('Enter');await p.getByRole('button',{name:'СЛОВО03. 1 из 4',exact:true}).press('Enter');await p.waitForTimeout(450);}}
 assert.equal(success,24);assert.equal(await p.locator('#modal-title').innerText(),'Все группы собраны!');await p.close();
 const two=groups.slice(0,2).map(g=>({...g,words:g.words.slice(0,2)}));const l=await scenario(two,2);for(let i=0;i<2;i++){await l.getByRole('button',{name:`СЛОВО${i}0. 1 из 2`,exact:true}).press('Enter');await l.getByRole('button',{name:`СЛОВО${i}1. 1 из 2`,exact:true}).press('Enter');await l.waitForTimeout(450);}assert.equal(await l.locator('#modal-title').innerText(),'Все группы собраны!');await l.close();
 const loss=await scenario(two,1);await loss.getByRole('button',{name:'СЛОВО00. 1 из 2',exact:true}).press('Enter');await loss.getByRole('button',{name:'СЛОВО10. 1 из 2',exact:true}).press('Enter');await loss.waitForTimeout(450);assert.equal(await loss.locator('#modal-title').innerText(),'Ходы закончились');await loss.getByRole('button',{name:'Отменить',exact:true}).last().click();assert.match(await loss.locator('#moves').innerText(),/1/);await loss.close();
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: keyboard/drag, 1+1/2+1/3+1/2+2, wrong pair, hint, undo/win/reserve, 8 groups, last-move win, loss undo, four viewports; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
