'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,ChartNoAxesCombined,ChevronRight,RefreshCw} from 'lucide-react';
import {MARKET_GROUPS,MARKET_DATA_NOTE,MARKET_PROVIDER_ORIGIN,marketGroup,marketWidgetUrl,quoteFreshness,type MarketQuote} from '@/lib/market-widgets';
export type {MarketQuote} from '@/lib/market-widgets';

function useMarketPreferences(){
 const [theme,setTheme]=useState<'dark'|'light'>('dark');
 const [reducedMotion,setReducedMotion]=useState(false);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const readTheme=()=>setTheme(document.documentElement.dataset.theme==='light'?'light':'dark');
  readTheme();const observer=new MutationObserver(readTheme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const preference=matchMedia('(prefers-reduced-motion: reduce)');const readMotion=()=>setReducedMotion(preference.matches);readMotion();preference.addEventListener('change',readMotion);setReady(true);
  return ()=>{observer.disconnect();preference.removeEventListener('change',readMotion);};
 },[]);
 return {theme,reducedMotion,ready};
}
function CategorySwitch({value,onChange}:{value:string;onChange:(id:string)=>void}){
 return <div className="market-sector-switch" role="group" aria-label="Market sectors">{MARKET_GROUPS.map(group=><button key={group.id} type="button" onClick={()=>onChange(group.id)} aria-pressed={value===group.id}>{group.shortTitle}</button>)}</div>;
}
function ProviderFrame({kind,group,theme}:{kind:'ticker-tape'|'market-overview';group:string;theme:'dark'|'light'}){
 const iframe=useRef<HTMLIFrameElement>(null);
 const timeoutRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [loading,setLoading]=useState(true),[blocked,setBlocked]=useState(false);
 const url=useMemo(()=>marketWidgetUrl(kind,group,theme,typeof window==='undefined'?undefined:window.location.href),[kind,group,theme]);
 useEffect(()=>{
  setLoading(true);setBlocked(false);
  const timeout=setTimeout(()=>{setLoading(false);setBlocked(true);},20_000);timeoutRef.current=timeout;
  const message=(event:MessageEvent)=>{if(event.source!==iframe.current?.contentWindow||event.origin!==MARKET_PROVIDER_ORIGIN)return;if(event.data?.name==='tv-widget-ready'||event.data?.name==='tv-widget-load'){clearTimeout(timeout);setLoading(false);setBlocked(false);}if(event.data?.name==='tv-widget-no-data'){clearTimeout(timeout);setLoading(false);setBlocked(true);}};
  window.addEventListener('message',message);
  return ()=>{clearTimeout(timeout);timeoutRef.current=null;window.removeEventListener('message',message);};
 },[url]);
 const selection=marketGroup(group);
 return <div className={'market-provider-frame '+(kind==='ticker-tape'?'market-provider-frame--ticker':'market-provider-frame--overview')}>
  <iframe ref={iframe} key={url} src={url} title={selection.title+(kind==='ticker-tape'?' stock marquee':' market prices and chart')} loading={kind==='ticker-tape'?'eager':'lazy'} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>{if(timeoutRef.current)clearTimeout(timeoutRef.current);setLoading(false);setBlocked(false);}} onError={()=>{if(timeoutRef.current)clearTimeout(timeoutRef.current);setLoading(false);setBlocked(true);}}/>
  {loading&&<div className="market-feed-loading" aria-live="polite"><span/>Connecting to market feed</div>}
  {blocked&&<div className="market-feed-fallback" role="status"><span>The market embed could not connect here.</span><a href={selection.symbols[0].sourceUrl} target="_blank" rel="noopener noreferrer">Open provider prices <ArrowUpRight size={13}/></a></div>}
 </div>;
}

export function MarketTicker({className=''}:{className?:string}){
 const [group,setGroup]=useState('ai');const {theme,reducedMotion,ready}=useMarketPreferences();const [allowMotion,setAllowMotion]=useState(false);
 const selected=marketGroup(group);
 return <section className={'market-ticker '+className} aria-label="Categorized market marquee">
  <div className="market-ticker-top"><a href="/markets" className="market-ticker-title"><ChartNoAxesCombined size={15}/><span>Market signal</span><ChevronRight size={12}/></a><CategorySwitch value={group} onChange={setGroup}/><span className="market-ticker-timing">Exchange-delayed stocks</span></div>
  {!ready?<div className="market-provider-frame market-provider-frame--ticker"><div className="market-feed-loading">Connecting to market feed</div></div>:reducedMotion&&!allowMotion?<div className="market-motion-reduced"><div>{selected.symbols.map(item=><a key={item.symbol} href={item.sourceUrl} target="_blank" rel="noopener noreferrer"><strong>{item.symbol.split(':')[1]}</strong><span>{item.name}</span></a>)}</div><button type="button" onClick={()=>setAllowMotion(true)}>Enable moving prices</button></div>:<ProviderFrame kind="ticker-tape" group={group} theme={theme}/>}
  <div className="market-ticker-credit"><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Market quotes by TradingView</a><a href="/markets">Feed timing & market dashboard <ArrowUpRight size={10}/></a></div>
 </section>;
}
function spotMoney(value:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);}
function SpotMetals({initialQuotes=[]}:{initialQuotes?:MarketQuote[]}){
 const [quotes,setQuotes]=useState<MarketQuote[]>(initialQuotes.filter(quote=>['XAU','XAG'].includes(quote.symbol)));
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),[clock,setClock]=useState(Date.now());
 const abort=useRef<AbortController|null>(null);const requestId=useRef(0);
 async function load(){
  if(document.visibilityState!=='visible')return;
  abort.current?.abort();const controller=new AbortController();abort.current=controller;const id=++requestId.current;setBusy(true);
  try{const response=await fetch('/api/markets',{cache:'no-store',signal:controller.signal});if(!response.ok)throw 0;const data=await response.json() as {quotes?:MarketQuote[]};if(!Array.isArray(data.quotes))throw 0;if(id===requestId.current){setQuotes(data.quotes.filter((quote:MarketQuote)=>['XAU','XAG'].includes(quote.symbol)));setError(false);setClock(Date.now());}}
  catch{if(!controller.signal.aborted&&id===requestId.current){setError(true);setClock(Date.now());}}finally{if(id===requestId.current)setBusy(false);}
 }
 useEffect(()=>{
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'){setClock(Date.now());void load();}},30_000);const visible=()=>{if(document.visibilityState==='visible')void load();else{requestId.current++;abort.current?.abort();setBusy(false);}};document.addEventListener('visibilitychange',visible);
  return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);requestId.current++;abort.current?.abort();};
 },[]);
 return <section className="spot-market" aria-labelledby="spot-market-title"><div className="spot-market-heading"><div><span className="eyebrow">PRECIOUS METALS</span><h2 id="spot-market-title">The spot desk.</h2></div><button className="text-button" type="button" onClick={()=>void load()} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>Refresh</button></div>
  <div className="spot-market-grid">{(['XAU','XAG'] as const).map(symbol=>{
   const quote=quotes.find(item=>item.symbol===symbol);const freshness=quote?quoteFreshness(quote,clock):'unavailable';const valid=!!quote&&quote.price!==null&&Number.isFinite(quote.price)&&quote.price>0;
   return <div key={symbol} className={'spot-market-card spot-market-card--'+(symbol==='XAU'?'gold':'silver')}><div className="spot-market-card-top"><span className="spot-metal-emblem" aria-hidden="true">{symbol==='XAU'?'Au':'Ag'}</span><span className="eyebrow">{symbol} / USD</span></div><h3>{symbol==='XAU'?'Gold':'Silver'}</h3><strong>{valid?spotMoney(quote.price!):'—'}</strong><span className="spot-market-unit">USD per troy ounce</span><div className="spot-market-asof"><span className={'spot-quote-status spot-quote-status--'+freshness}>{freshness==='latest'?'Latest provider quote':freshness==='stale'?'Last available quote':freshness==='unknown'?'Provider time unavailable':busy?'Connecting':'Quote unavailable'}</span><time dateTime={quote?.updatedAt}>{quote?.updatedAt?new Date(quote.updatedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}):'No verified timestamp'}</time></div></div>;
  })}</div><p className="spot-market-note">Gold API · checks every 30 seconds while this page is visible. The displayed time is the provider’s quote time.{error?' Refresh temporarily unavailable; any retained quote keeps its original timestamp.':''}</p>
 </section>;
}
export function MarketTerminal({initialQuotes=[]}:{initialQuotes?:MarketQuote[]}){
 const [group,setGroup]=useState('ai');const {theme,ready}=useMarketPreferences();const selected=marketGroup(group);
 return <main className="container market-terminal"><div className="market-terminal-heading"><span className="eyebrow">THE ECONOMY BEHIND THE HEADLINES</span><h1>Follow the signal<span>.</span></h1><p>From artificial intelligence to the world’s essential resources. One clear view of the markets.</p><div className="market-terminal-feed-status"><span/>Continuously updating provider feed <span className="market-feed-divider">/</span> Stock & ETF data is exchange-delayed</div></div>
  <div className="market-terminal-dashboard"><div className="market-terminal-sectors"><CategorySwitch value={group} onChange={setGroup}/><span className="market-terminal-count">{selected.symbols.length} instruments</span></div><div className="market-terminal-group"><h2>{selected.title}</h2><p>{selected.description}</p></div>{ready?<ProviderFrame kind="market-overview" group={group} theme={theme}/>:<div className="market-provider-frame market-provider-frame--overview"><div className="market-feed-loading">Connecting to market feed</div></div>}<div className="market-terminal-provider"><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Market data by TradingView <ArrowUpRight size={12}/></a><a href="https://www.tradingview.com/widget-docs/faq/data/" target="_blank" rel="noopener noreferrer">Provider timing</a></div></div>
  <details className="market-instrument-directory"><summary>Explore this sector’s instruments <ChevronRight size={13}/></summary><div>{selected.symbols.map(item=><a key={item.symbol} href={item.sourceUrl} target="_blank" rel="noopener noreferrer"><strong>{item.symbol.split(':')[1]}</strong><span>{item.name}</span><small>{item.type==='metal'?'OANDA metal quote':item.symbol.split(':')[0]+' · '+(item.type==='etf'?'ETF':'Equity')}</small><ArrowUpRight size={13}/></a>)}</div></details>
  <p className="market-terminal-data-note">{MARKET_DATA_NOTE} Real-time consolidated US equity data requires a licensed market-data connection.</p>
  <SpotMetals initialQuotes={initialQuotes}/><div className="market-terminal-stories"><div><span className="eyebrow">A LITTLE MORE CONTEXT</span><h2>The story behind the movement.</h2><p>Understand what is driving the numbers.</p></div><a href="/?category=Markets" className="button dark">Explore market stories <ArrowUpRight size={14}/></a></div>
 </main>;
}
