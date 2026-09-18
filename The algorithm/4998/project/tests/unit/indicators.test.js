const test=require('node:test');const assert=require('node:assert/strict');const i=require('../../services/indicators');
test('SMA and EMA are deterministic',()=>{assert.equal(i.sma([1,2,3,4],2),3.5);assert.equal(i.ema([1,2,3,4],3),3)});
test('RSI recognizes all gains',()=>assert.equal(i.rsi(Array.from({length:20},(_,n)=>n+1)),100));
test('structure and breakout',()=>{let c=Array.from({length:25},(_,n)=>({high:n+2,low:n,close:n+1}));assert.equal(i.structure(c),'BULLISH_HH_HL');assert.equal(i.breakout(c),'NONE')});
