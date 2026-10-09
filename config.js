// Заменяйте словарь здесь. Картинки необязательны: image: './assets/images/имя.png'.
window.GAME_CONFIG = {
  title: 'Слова в пузырях', mode: 'word', scene: { width: 1600, height: 900 },
  soundDefault: false, maxActiveBubbles: 16, moveLimit: null, bonusEvery: 5,
  groups: [
    { id: 'fruits', title: 'ФРУКТЫ', words: [ ['fruit-apple','ЯБЛОКО'], ['fruit-pear','ГРУША'], ['fruit-banana','БАНАН'], ['fruit-lemon','ЛИМОН'] ] },
    { id: 'vegetables', title: 'ОВОЩИ', words: [ ['veg-carrot','МОРКОВЬ'], ['veg-cucumber','ОГУРЕЦ'], ['veg-tomato','ПОМИДОР'], ['veg-cabbage','КАПУСТА'] ] },
    { id: 'animals', title: 'ЖИВОТНЫЕ', words: [ ['animal-cat','КОШКА'], ['animal-dog','СОБАКА'], ['animal-fox','ЛИСА'], ['animal-hare','ЗАЯЦ'] ] },
    { id: 'transport', title: 'ТРАНСПОРТ', words: [ ['vehicle-bus','АВТОБУС'], ['vehicle-train','ПОЕЗД'], ['vehicle-plane','САМОЛЁТ'], ['vehicle-ship','КОРАБЛЬ'] ] }
  ].map(group => ({ ...group, words: group.words.map(([id, text]) => ({ id, text })) }))
};
