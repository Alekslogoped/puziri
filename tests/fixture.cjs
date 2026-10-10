// The original regression scenarios use the original four-group dictionary.
const source = text => text + '\nwindow.GAME_CONFIG.groups=window.GAME_CONFIG.groups.slice(0,4);window.GAME_CONFIG.maxActiveBubbles=16;window.GAME_CONFIG.groups[2].words=[{id:"animal-cat",text:"КОШКА"},{id:"animal-dog",text:"СОБАКА"},{id:"animal-fox",text:"ЛИСА"},{id:"animal-hare",text:"ЗАЯЦ"}];';
function useOriginalDictionary(browser) {
  const create=browser.newPage.bind(browser);
  browser.newPage=async options=>{
    const page=await create(options);
    await page.route('**/config.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:source(await response.text())});});
    return page;
  };
}
module.exports={source,useOriginalDictionary};
