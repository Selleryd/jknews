/** Public embeds, not a scraped or redistributed quote API. Symbol listings and
 * the generated iframe contract were checked against TradingView on 2026-10-05.
 * https://www.tradingview.com/widget-docs/faq/data/
 * https://www.tradingview.com/widget-docs/tutorials/build-page/widget-integration/
 * Stock widgets are exchange-delayed; TradingView's own Cboe charts are distinct.
 */
export type MarketSymbol = {symbol: string; name: string; type: 'equity' | 'etf' | 'metal'; sourceUrl: string};
export type MarketGroup = {id: string; title: string; shortTitle: string; description: string; symbols: MarketSymbol[]};
const instrument = (symbol: string, name: string, type: MarketSymbol['type'] = 'equity'): MarketSymbol => ({symbol, name, type, sourceUrl: 'https://www.tradingview.com/symbols/' + symbol.replace(':', '-') + '/'});
export const MARKET_GROUPS: MarketGroup[] = [
 {id:'ai', title:'AI & technology', shortTitle:'AI & tech', description:'Semiconductors, cloud infrastructure, and the intelligence economy.', symbols:[instrument('NASDAQ:NVDA','NVIDIA'),instrument('NASDAQ:MSFT','Microsoft'),instrument('NASDAQ:GOOGL','Alphabet'),instrument('NASDAQ:AMD','AMD'),instrument('NASDAQ:AVGO','Broadcom'),instrument('NASDAQ:PLTR','Palantir')]},
 {id:'robotics', title:'Robotics & automation', shortTitle:'Robotics', description:'Machines, advanced manufacturing, and the next generation of automation.', symbols:[instrument('NASDAQ:ISRG','Intuitive Surgical'),instrument('NYSE:ROK','Rockwell Automation'),instrument('NASDAQ:TER','Teradyne'),instrument('NASDAQ:SYM','Symbotic')]},
 {id:'resources', title:'Energy & resources', shortTitle:'Energy & resources', description:'Energy supply, copper, and the materials behind the global economy.', symbols:[instrument('NYSE:XOM','Exxon Mobil'),instrument('NYSE:CVX','Chevron'),instrument('NYSE:FCX','Freeport-McMoRan'),instrument('NYSE:NEM','Newmont'),instrument('NYSE:SCCO','Southern Copper')]},
 {id:'defense', title:'Defense & aerospace', shortTitle:'Defense', description:'Aerospace systems and the companies supplying defense infrastructure.', symbols:[instrument('NYSE:LMT','Lockheed Martin'),instrument('NYSE:RTX','RTX'),instrument('NYSE:NOC','Northrop Grumman'),instrument('NYSE:GD','General Dynamics')]},
 {id:'global', title:'Index ETFs & metals', shortTitle:'Index ETFs & metals', description:'Broad-market ETFs and currency-denominated gold and silver quotes.', symbols:[instrument('AMEX:SPY','S&P 500 ETF','etf'),instrument('NASDAQ:QQQ','Nasdaq 100 ETF','etf'),instrument('AMEX:DIA','Dow 30 ETF','etf'),instrument('OANDA:XAUUSD','Gold / USD','metal'),instrument('OANDA:XAGUSD','Silver / USD','metal')]},
];
export const MARKET_DATA_NOTE = 'Stock and ETF embeds are exchange-delayed. Gold and silver in the ticker are OANDA quotes; the spot cards below use Gold API. Each provider sets its data timing.';
export const MARKET_PROVIDER_ORIGIN = 'https://www.tradingview-widget.com';
export function marketGroup(id: string): MarketGroup {return MARKET_GROUPS.find(group => group.id === id) || MARKET_GROUPS[0];}
export function marketWidgetUrl(kind: 'ticker-tape' | 'market-overview', groupId: string, theme: 'dark' | 'light' = 'dark', pageUrl?:string): string {
 if(kind !== 'ticker-tape' && kind !== 'market-overview') throw new Error('Unsupported market widget.');
 const group = marketGroup(groupId);
 const common = {colorTheme: theme === 'light' ? 'light' : 'dark', isTransparent: true, width:'100%', locale:'en'};
 const config = kind === 'ticker-tape' ? {...common, symbols: group.symbols.map(({symbol, name}) => ({proName:symbol, title:name})), showSymbolLogo:true, displayMode:'regular', largeChartUrl:'', height:58} : {...common, height:570, showChart:true, dateRange:'1D', plotLineColorGrowing:'rgba(114, 191, 167, 1)', plotLineColorFalling:'rgba(212, 142, 154, 1)', gridLineColor:'rgba(135, 155, 180, 0.10)', scaleFontColor:theme === 'light' ? 'rgba(60, 72, 88, 1)' : 'rgba(175, 187, 204, 1)', belowLineFillColorGrowing:'rgba(114, 191, 167, 0.10)', belowLineFillColorFalling:'rgba(212, 142, 154, 0.10)', showSymbolLogo:true, showFloatingTooltip:true, showChartLegend:false, tabs:[{title:group.title, symbols:group.symbols.map(({symbol,name}) => ({s:symbol,d:name}))}]};
 const url = new URL('/embed-widget/' + kind + '/', MARKET_PROVIDER_ORIGIN);
 url.searchParams.set('locale','en');
 const context:Record<string,string>={};
 if(pageUrl){try{const page=new URL(pageUrl);if(page.protocol==='https:'||page.protocol==='http:')context['page-uri']=(page.origin+page.pathname).replace(/^https?:\/\//,'');}catch{}}
 url.hash = encodeURIComponent(JSON.stringify({...config,...context}));
 return url.href;
}
export type MarketQuote = {symbol:string; name:string; price:number|null; currency?:string; change?:number; updatedAt?:string; fetchedAt?:string; source:string; status:string};
export function normalizeSpotQuote(symbol:'XAU'|'XAG', value:unknown, fetchedAt:string): MarketQuote {
 const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 const name = symbol === 'XAU' ? 'Gold' : 'Silver';
 const invalid = typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0 || data.symbol !== symbol || data.currency !== 'USD';
 if(invalid) return {symbol,name,price:null,source:'Gold API',status:'Quote temporarily unavailable',fetchedAt};
 const timestamp = typeof data.updatedAt === 'string' ? Date.parse(data.updatedAt) : NaN;
 const fetched = Date.parse(fetchedAt);
 const validTimestamp = Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(fetched) && timestamp <= fetched + 60_000;
 return {symbol,name,price:data.price as number,currency:'USD',source:'Gold API',status:validTimestamp ? 'Latest provider spot quote' : 'Provider time unavailable',...(validTimestamp ? {updatedAt:new Date(timestamp).toISOString()} : {}),fetchedAt};
}
export function quoteFreshness(quote:Pick<MarketQuote,'price'|'updatedAt'>, clock:number = Date.now()): 'unavailable' | 'unknown' | 'latest' | 'stale' {
 if(quote.price === null || !Number.isFinite(quote.price) || quote.price <= 0) return 'unavailable';
 const timestamp = quote.updatedAt ? Date.parse(quote.updatedAt) : NaN;
 if(!Number.isFinite(timestamp) || timestamp > clock + 60_000) return 'unknown';
 return clock - timestamp > 120_000 ? 'stale' : 'latest';
}
