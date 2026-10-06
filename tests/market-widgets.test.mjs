import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_GROUPS,MARKET_PROVIDER_ORIGIN,marketWidgetUrl,normalizeSpotQuote,quoteFreshness} from '../lib/market-widgets.ts';
test('provider embeds accept only supported widget types and never interpolate a requested URL or unknown symbol',()=>{
 const url=new URL(marketWidgetUrl('ticker-tape','https://127.0.0.1/private','dark'));
 assert.equal(url.origin,MARKET_PROVIDER_ORIGIN);assert.equal(url.pathname,'/embed-widget/ticker-tape/');assert.equal(url.searchParams.get('locale'),'en');
 const config=JSON.parse(decodeURIComponent(url.hash.slice(1)));assert.ok(config.symbols.length>0);assert.ok(config.symbols.every(symbol=>symbol.proName.startsWith('NASDAQ:')));assert.equal(config.isTransparent,true);
 assert.throws(()=>marketWidgetUrl('arbitrary','ai'),/Unsupported/);
 const light=JSON.parse(decodeURIComponent(new URL(marketWidgetUrl('market-overview','defense','light')).hash.slice(1)));assert.equal(light.colorTheme,'light');assert.equal(light.tabs[0].title,'Defense & aerospace');assert.ok(light.tabs[0].symbols.every(item=>item.s.startsWith('NYSE:')));
 const contextual=new URL(marketWidgetUrl('ticker-tape','ai','dark','https://news.example/article/test?access_token=private#sensitive'));const settings=JSON.parse(decodeURIComponent(contextual.hash.slice(1)));assert.equal(settings['page-uri'],'news.example/article/test');assert.ok(!contextual.href.includes('private'));assert.ok(!contextual.href.includes('sensitive'));
});
test('ETFs, metal quotes, and company equities remain distinct in the categorized dashboard',()=>{
 const global=MARKET_GROUPS.find(group=>group.id==='global');assert.equal(global.symbols.find(item=>item.symbol==='AMEX:SPY').type,'etf');assert.equal(global.symbols.find(item=>item.symbol==='OANDA:XAUUSD').type,'metal');
 assert.equal(MARKET_GROUPS.find(group=>group.id==='robotics').symbols.find(item=>item.name==='Intuitive Surgical').symbol,'NASDAQ:ISRG');
 for(const group of MARKET_GROUPS)for(const item of group.symbols){assert.equal(new URL(item.sourceUrl).hostname,'www.tradingview.com');assert.equal(new URL(item.sourceUrl).pathname,'/symbols/'+item.symbol.replace(':','-')+'/');}
});
test('spot quotes retain original source timestamps and never substitute a request time',()=>{
 const fetched='2026-10-05T15:00:00Z';
 const quoted=normalizeSpotQuote('XAU',{symbol:'XAU',currency:'USD',price:4130.2,updatedAt:'2026-10-05T14:59:59Z'},fetched);
 assert.equal(quoted.updatedAt,'2026-10-05T14:59:59.000Z');assert.equal(quoted.fetchedAt,fetched);assert.equal(quoteFreshness(quoted,Date.parse(fetched)),'latest');
 const noTime=normalizeSpotQuote('XAU',{symbol:'XAU',currency:'USD',price:4130.2},fetched);assert.equal(noTime.price,4130.2);assert.equal(noTime.updatedAt,undefined);assert.equal(quoteFreshness(noTime,Date.parse(fetched)),'unknown');
 const future=normalizeSpotQuote('XAU',{symbol:'XAU',currency:'USD',price:4130.2,updatedAt:'2026-10-06T14:59:59Z'},fetched);assert.equal(future.updatedAt,undefined);
 const old=normalizeSpotQuote('XAG',{symbol:'XAG',currency:'USD',price:48.2,updatedAt:'2026-10-03T14:59:59Z'},fetched);assert.equal(quoteFreshness(old,Date.parse(fetched)),'stale');assert.equal(old.updatedAt,'2026-10-03T14:59:59.000Z');
});
test('mismatched assets, invalid currency and nonfinite prices cannot produce a displayed price',()=>{
 for(const payload of [{symbol:'XAG',currency:'USD',price:100},{symbol:'XAU',currency:'EUR',price:100},{symbol:'XAU',currency:'USD',price:'100'},{symbol:'XAU',currency:'USD',price:Infinity},{symbol:'XAU',currency:'USD',price:0},null]){
  const quote=normalizeSpotQuote('XAU',payload,'2026-10-05T15:00:00Z');assert.equal(quote.price,null);assert.equal(quoteFreshness(quote),'unavailable');assert.equal(quote.updatedAt,undefined);
 }
});
