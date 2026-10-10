const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/tmp/bubbles-qa/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});require('./fixture.cjs').useOriginalDictionary(browser);
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:8000');
 await page.getByRole('button',{name:'Играть',exact:true}).click();await page.waitForTimeout(1800);
 const image=await page.evaluate(async()=>{const img=new Image();img.src='./assets/images/sea-background.png';await img.decode();return img.naturalWidth;});assert(image>=1600);
 await page.screenshot({path:'/tmp/bubbles-sea-desktop.png'});
 const find=t=>page.locator('button.bubble').filter({has:page.locator('span',{hasText:new RegExp('^'+t+'$')})});
 // Capture existing neighbors each animation frame around a growing merged bubble.
 await page.evaluate(()=>{window.motionSamples=[];window.collectMotion=true;function collect(){if(!window.collectMotion)return;window.motionSamples.push([...document.querySelectorAll('button.bubble')].map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.bubbleId,x:r.x+r.width/2,y:r.y+r.height/2};}));requestAnimationFrame(collect);}requestAnimationFrame(collect);});
 await find('ЯБЛОКО').press('Enter');await find('ГРУША').press('Enter');await page.waitForTimeout(800);
 const samples=await page.evaluate(()=>{window.collectMotion=false;return window.motionSamples;});let maxStep=0;
 for(let i=1;i<samples.length;i++)for(const b of samples[i]){const prev=samples[i-1].find(p=>p.id===b.id);if(prev)maxStep=Math.max(maxStep,Math.hypot(b.x-prev.x,b.y-prev.y));}
 assert(maxStep<16,`Neighbor motion jumped ${maxStep.toFixed(2)} CSS pixels`);
 // Use the visible center of a still-moving target, not hidden simulation coordinates.
 const source=await find('БАНАН').boundingBox();await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(640,250,{steps:5});
 const target=await find('ЛИМОН').boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:5});await page.mouse.up();await page.waitForTimeout(500);assert.equal(await page.locator('.pair').count(),2);
 await find('ЯБЛОКО').press('Enter');await find('БАНАН').press('Enter');await page.waitForTimeout(900);assert.equal(await page.locator('.category.leaving').count(),1);await page.waitForTimeout(1200);assert.equal(await page.locator('.category').count(),0);
 await page.locator('#restart').click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'/tmp/bubbles-sea-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log(`PASS: local sea art, smooth neighbor movement (max ${maxStep.toFixed(2)} px/frame), moving-target drag, category rise/removal, mobile screenshot.`);
})().catch(e=>{console.error(e);process.exit(1)});
